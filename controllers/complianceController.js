const asyncHandler = require('../utils/asyncHandler');
// const { uploadStream } = require('../services/fileStorageService'); // No longer needed
const { startKycCheck } = require('../services/verificationService'); // Use the Onfido service
const ComplianceRequest = require('../models/ComplianceRequest');
const User = require('../models/User');

/**
 * @desc    Submit compliance documents for KYC
 * @route   POST /api/compliance/submit
 * @access  Private (Pro)
 */
const submitCompliance = asyncHandler(async (req, res) => {
  // 1. Check user and file
  if (req.user.role !== 'pro') {
    res.status(403); // Forbidden
    throw new Error('Only users with role "pro" can submit documents.');
  }

  if (!req.file) {
    res.status(400);
    throw new Error('No document file provided.');
  }

  const { documentType } = req.body; // e.g., 'driving_licence'
  if (!documentType) {
    res.status(400);
    throw new Error('Please provide a documentType.');
  }

  // 2. Initiate KYC check with the file buffer (Cloudinary upload removed)
  const { checkId, applicantId, applicantJustCreated } = await startKycCheck(
    req.user,
    req.file.buffer,      // Pass the file buffer
    req.file.mimetype,    // Pass the file's mime type
    documentType
  );

  // 3. If new applicant, update our User model with the Onfido ID
  if (applicantJustCreated) {
    await User.findByIdAndUpdate(req.user._id, {
      onfidoApplicantId: applicantId
    });
  }

  // 4. Find or create the ComplianceRequest record
  let complianceRequest = await ComplianceRequest.findOne({ user: req.user._id });

  if (!complianceRequest) {
    complianceRequest = new ComplianceRequest({ user: req.user._id });
  }

  // 5. Update and save the record
  complianceRequest.documents.push({
    documentType: documentType,
    // 'url' is omitted as we no longer save it to Cloudinary here
  });

  const user = await User.findById(complianceRequest.user);
  if (user){
      user.complianceStatus = 'in_review';
    
  }

  complianceRequest.status = 'in_review';
  complianceRequest.verificationProviderId = checkId;
  complianceRequest.rejectionReason = undefined; // Clear any previous rejection

  await complianceRequest.save();
  await user.save();

  // 6. Send response
  res.status(200).json({
    message: 'Documents submitted successfully. Verification is in progress.',
    status: complianceRequest.status,
    checkId: checkId,
  });
});

/**
 * @desc    Handle KYC webhook updates from Onfido
 * @route   POST /api/webhooks/kyc
 * @access  Public (Verified by signature)
 */
const handleKycWebhook = asyncHandler(async (req, res) => {
  // This controller assumes a middleware has already verified the
  // signature and placed the verified event in req.body.
  const event = req.body;

  if (event.payload.resource_type !== 'check') {
    return res.status(200).send('Event is not a check, ignoring.');
  }

  const check = event.payload.object;
  
  if (event.action === 'check.completed') {
    const complianceRequest = await ComplianceRequest.findOne({
      verificationProviderId: check.id,
    });

    if (!complianceRequest) {
      console.warn(`Webhook for unknown check ID received: ${check.id}`);
      return res.status(200).send('Check not found, but acknowledged.');
    }

    // Find the associated user to update their status
    const user = await User.findById(complianceRequest.user);
    if (!user) {
         console.warn(`User not found for compliance request ${complianceRequest._id}`);
         // We can still update the request, so don't throw an error
    }

    if (check.result === 'clear') {
      complianceRequest.status = 'approved';
      if (user){
      user.complianceStatus = 'approved';
      user.isKycVerified = true; // Update User model
      } 
    } else {
      complianceRequest.status = 'rejected';
      complianceRequest.rejectionReason =
        check.breakdown?.sub_result || 'Verification failed';
      if (user) {
      user.isKycVerified= false;
      user.complianceStatus = 'rejected';
      }  // Update User model
    }
    
    await complianceRequest.save();
    if(user) await user.save();
  }

  // Acknowledge receipt of the webhook
  res.status(200).send('Webhook received and processed.');
});

module.exports = {
  submitCompliance,
  handleKycWebhook,
};