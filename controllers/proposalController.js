const asyncHandler = require('../utils/asyncHandler');
const Proposal = require('../models/Proposal');
const Job = require('../models/Job');
const User = require('../models/User');
const notificationService = require('../services/notificationService'); // <-- Import notification service

const submitProposal = asyncHandler(async (req, res) => {
  if (req.user.role !== 'pro') {
    res.status(403); throw new Error('User is not authorized');
  }

if ( req.user.complianceStatus !== 'approved') {
        res.status(403);
        throw new Error('Compliance check required. You cannot submit a proposal until your compliance status is approved.');
    }

 const { jobId, bidAmount, coverLetter, estimatedDuration, currency, milestones } = req.body;
  const files = req.files; // Files from multer

  const proUser = await User.findById(req.user._id).select('+credits name'); // <-- Get name for notification
  if (!proUser) {
     res.status(404); throw new Error('Pro user not found.');
  }
  // if (proUser.credits < 1) {
  //     res.status(402); throw new Error('Insufficient credits.');
  // }


  if (!jobId || !bidAmount || !coverLetter) {
    res.status(400); throw new Error('Missing required fields.');
  }

  const job = await Job.findById(jobId).select('client status title'); // <-- Get client ID and title
  if (!job) { res.status(404); throw new Error('Job not found'); }
  if (job.status !== 'open') { res.status(400); throw new Error('Job is not open'); }

  const existingProposal = await Proposal.findOne({ pro: req.user._id, job: jobId });
  if (existingProposal) { res.status(400); throw new Error('Proposal already submitted'); }

// --- Handle File Uploads ---
  let attachmentData = [];
  if (files && files.length > 0) {
    const uploadPromises = files.map(async (file) => {
      const folder = `asap/proposal_attachments/${req.user._id}/${jobId}`;
      const result = await uploadStream(file.buffer, folder);
      return {
        fileName: file.originalname,
        fileUrl: result.secure_url,
        fileKey: result.public_id
      };
    });
    attachmentData = await Promise.all(uploadPromises);
  }
  
  // --- Parse Milestones ---
  let parsedMilestones;
  try {
    parsedMilestones = JSON.parse(milestones);
    if (!Array.isArray(parsedMilestones) || parsedMilestones.length === 0) {
      throw new Error('Milestones must be a non-empty array.');
    }
  } catch (e) {
    res.status(400); throw new Error('Invalid milestones format. Expected a JSON array.');
  }


  const proposal = new Proposal({
    pro: req.user._id, 
    job: jobId, 
    bidAmount, 
    coverLetter,
    estimatedDuration, 
    currency: currency || job.currency || 'USD',
    milestones: parsedMilestones, // <-- SAVE MILESTONES
    attachments: attachmentData   // <-- SAVE ATTACHMENTS
  });

  // proUser.credits  = Number(proUser.credits||0) - 1;
  // await proUser.save();
  await proposal.save();

  // --- Send Notification to the CLIENT ---
  notificationService.sendNotification(null, null, job.client, 'PROPOSAL_RECEIVED', {
      proName: proUser.name,
      jobTitle: job.title,
      jobId: job._id,
  }).catch(err => console.error("Failed to send PROPOSAL_RECEIVED notification:", err));
  // --- End Notification ---

  res.status(201).json(proposal);
});

/**
 * @desc    Get all proposals for a specific job
 * @route   GET /api/proposals/job/:jobId
 * @access  Private (Client who posted job)
 */
const getProposalsForJob = asyncHandler(async (req, res) => {
  const { jobId } = req.params;

  const job = await Job.findById(jobId);

  if (!job) {
    res.status(404);
    throw new Error('Job not found');
  }

  // Ensure only the client who posted the job can view proposals
if (job.client.toString() === req.user._id.toString()) {
    const proposals = await Proposal.find({ job: jobId })
      .populate('pro', 'name email');
    return res.status(200).json(proposals);
  }


// If the user is a Pro, only fetch *their* proposal.
  if (req.user.role === 'pro') {
    const myProposal = await Proposal.findOne({ job: jobId, pro: req.user._id });
    // Always return an array
    return res.status(200).json(myProposal ? [myProposal] : []);
  }
  
  // If user is neither, return an empty array.
  res.status(200).json([]);


});


const getGlobalProposalCounts = async () => {
    try {
        const pipeline = [
            // Stage 1: Group documents by the 'status' field
            {
                $group: {
                    _id: "$status", // Group by the value of the 'status' field
                    count: { $sum: 1 } // Count one for each document in the group
                }
            },
            // Stage 2: Reshape the output (optional, but cleaner)
            {
                $project: {
                    _id: 0,          // Remove the default _id field
                    status: "$_id", // Rename _id to 'status'
                    count: 1         // Keep the count field
                }
            },
            // Stage 3: Sort by count (optional)
            {
                $sort: { count: -1 } // Show highest count first
            }
        ];

        const statusCounts = await Proposal.aggregate(pipeline);
        
        return statusCounts;

    } catch (error) {
        console.error("Error counting proposal statuses:", error);
        throw new Error('Could not retrieve proposal counts.');
    }
};


/**
 * @desc    Get all proposals for the logged-in pro, filtered by status
 * @route   GET /api/proposals/my-proposals
 * @access  Private (Pro)
 */
const getMyProposals = asyncHandler(async (req, res) => {
    if (req.user.role !== 'pro') {
        res.status(403);
        throw new Error('User is not authorized to view this resource');
    }

    const { status } = req.query;
    const filter = { pro: req.user._id }; // Filter by the logged-in pro

    if (status && ['submitted', 'accepted', 'rejected'].includes(status)) {
        filter.status = status;
    }

    // Find proposals, populate the related job title
    const proposals = await Proposal.find(filter)
        .populate('job', 'title status') // Get the job title and status
        .sort('-createdAt'); // Show newest first

const counts = await getGlobalProposalCounts()
    res.status(200).json({ proposals, counts });
});
// --- END OF ADDITION ---



module.exports = {
  submitProposal,
  getProposalsForJob,
  getMyProposals,
};