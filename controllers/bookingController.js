const asyncHandler = require('../utils/asyncHandler');
const Proposal = require('../models/Proposal');
const Job = require('../models/Job');
const Booking = require('../models/Booking');
const Milestone = require('../models/Milestone');
const ChangeOrder = require('../models/ChangeOrder');
const Dispute = require('../models/Dispute');
const Review = require('../models/Review');
const TimeEntry = require('../models/TimeEntry'); // <-- Import TimeEntry
const { createPaymentIntent } = require('../services/paymentService');
const { uploadStream } = require('../services/fileStorageService');
const Invoice = require('../models/Invoice'); // <-- 1. IMPORT INVOICE MODEL



/**
 * @desc    Accept a proposal and create a booking, funding the first milestone.
 * @route   POST /api/bookings/accept
 * @access  Private (Client)
 */
const acceptProposal = asyncHandler(async (req, res) => {
  const { proposalId } = req.body;

  if (!proposalId) {
    res.status(400);
    throw new Error('Proposal ID is required.');
  }

  const proposal = await Proposal.findById(proposalId).populate('job').populate('pro');

  if (!proposal) {
    res.status(404);
    throw new Error('Proposal not found.');
  }

  const job = proposal.job;

  // Authorisation checks
  if (req.user.role !== 'client' || job.client.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('User not authorized to accept this proposal.');
  }
  if (job.status !== 'open') {
    res.status(400);
    throw new Error('This job is no longer open for acceptance.');
  }
  if (proposal.status !== 'submitted') {
    res.status(400);
    throw new Error('This proposal is not in a submittable state.');
  }

  console.log(proposal)

  // --- Create Booking ---
  const booking = new Booking({
    job: job._id,
    pro: proposal.pro._id,
    client: req.user._id,
    proposal: proposal._id,
    totalAmount: proposal.bidAmount,
    currency: proposal.currency,
  });

  // --- Create Milestone(s) ---
  // For now, create a single milestone for the full amount.
  // A real app might get milestone breakdowns from the proposal or job.
  const firstMilestone = new Milestone({
    booking: booking._id,
    description: 'Project Funding', // Simple description for now
    amount: proposal.bidAmount,
    currency: proposal.currency,
    status: 'pending', // Will change to 'funded' after payment
  });

  // --- Create Stripe Payment Intent for the first milestone ---
  const paymentIntent = await createPaymentIntent(
    firstMilestone.amount,
    firstMilestone.currency,
    null, // Pass Stripe customer ID if available
    {
      bookingId: booking._id.toString(),
      milestoneId: firstMilestone._id.toString(),
      jobTitle: job.title.substring(0, 100), // Max length for description/metadata
    }
  );

  // Store the Payment Intent ID
  firstMilestone.paymentIntentId = paymentIntent.id;

  // --- Update statuses and links ---
  proposal.status = 'accepted';
  job.status = 'in_progress';
  job.selectedProposal = proposal._id;
  job.booking = booking._id;

  // --- Save everything ---
  // Use a transaction here in a production environment if possible
  await booking.save();
  await firstMilestone.save();
  await proposal.save();
  await job.save();

  // --- Send Response ---
  // Return the client secret so the frontend can confirm the payment
  res.status(201).json({
    message: 'Proposal accepted. Please complete payment for the first milestone.',
    bookingId: booking._id,
    milestoneId: firstMilestone._id,
    paymentIntentClientSecret: paymentIntent.client_secret,
  });
});

/**
 * @desc    Upload a file to the project workspace
 * @route   POST /api/bookings/:bookingId/files
 * @access  Private (Client or Pro involved in booking)
 */
const uploadWorkspaceFile = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;

  if (!req.file) {
    res.status(400);
    throw new Error('No file provided.');
  }

  // Verify user is part of the booking
  const booking = await Booking.findById(bookingId).select('client pro files'); // Include files field
  if (!booking) {
    res.status(404);
    throw new Error('Booking not found');
  }
  if (
    booking.client.toString() !== req.user._id.toString() &&
    booking.pro.toString() !== req.user._id.toString()
  ) {
    res.status(403);
    throw new Error('User not authorized to upload files to this workspace');
  }

  // Upload file to Cloudinary in a booking-specific folder
  const uploadResult = await uploadStream(
    req.file.buffer,
    `workspace/${bookingId}`
  );

  // Store file metadata in the Booking document (or a separate File model)
  const fileData = {
    uploader: req.user._id,
    fileName: req.file.originalname,
    fileType: req.file.mimetype,
    url: uploadResult.secure_url,
    publicId: uploadResult.public_id, // Store public_id for potential deletion
    size: req.file.size,
    uploadedAt: new Date(),
  };

  booking.files = booking.files || []; // Initialize if it doesn't exist
  booking.files.push(fileData);

  await booking.save();

  const savedFileData = booking.files[booking.files.length - 1].toObject(); // Convert subdoc to plain object

  // Populate uploader info for the response/socket emission
   const populatedFileData = {
        ...savedFileData,
        uploader: { _id: req.user._id, name: req.user.name } // Send basic uploader info
    };


  // Emit WebSocket event to notify other participant(s)
  const io = req.app.get('socketio');
  if (io) {
    // Emit specifically to the booking room
    io.to(bookingId).emit('newFile', populatedFileData);
    console.log(`Emitted 'newFile' event to room ${bookingId}`);
  } else {
      console.warn("Socket.io instance not found - cannot emit 'newFile' event.");
  }

  res.status(201).json(fileData);
});


/**
 * @desc    Request a change order for an active booking
 * @route   POST /api/bookings/:bookingId/change-order
 * @access  Private (Client or Pro involved in booking)
 */
const requestChangeOrder = asyncHandler(async (req, res) => {
    const { bookingId } = req.params;
    const { scopeChangeDescription, priceChange, scheduleChangeDays } = req.body;
    const requesterId = req.user._id;

    if (!scopeChangeDescription) {
        res.status(400);
        throw new Error('Please provide a description for the scope change.');
    }

    const booking = await Booking.findById(bookingId).select('client pro status');
    if (!booking) {
        res.status(404); throw new Error('Booking not found.');
    }

    // Authorization & Status Check
    let requestedToId;
    if (booking.client.toString() === requesterId.toString()) {
        requestedToId = booking.pro;
    } else if (booking.pro.toString() === requesterId.toString()) {
        requestedToId = booking.client;
    } else {
        res.status(403); throw new Error('User not authorized for this booking.');
    }
    // Allow change orders only on active bookings for simplicity
    if (booking.status !== 'active' && booking.status !== 'pending_funding') {
         res.status(400); throw new Error(`Booking status (${booking.status}) does not allow change orders.`);
    }

    // Check for existing pending order
    const existingPendingOrder = await ChangeOrder.findOne({ booking: bookingId, status: 'pending' });
    if (existingPendingOrder) {
        res.status(400); throw new Error('A change order is already pending for this booking.');
    }

    const changeOrder = await ChangeOrder.create({
        booking: bookingId,
        createdBy: requesterId,
        requestedTo: requestedToId,
        scopeChangeDescription,
        priceChange: parseFloat(priceChange) || 0,
        scheduleChangeDays: parseInt(scheduleChangeDays, 10) || 0,
        status: 'pending',
    });

    // TODO: Notify the requestedTo user

    res.status(201).json(changeOrder);
});


/**
 * @desc    Respond to a pending change order (approve/reject)
 * @route   PUT /api/bookings/:bookingId/change-order/:orderId
 * @access  Private (User requested to respond)
 */
const respondToChangeOrder = asyncHandler(async (req, res) => {
    const { bookingId, orderId } = req.params;
    const { responseStatus, responseComment } = req.body; // 'approved' or 'rejected'
    const responderId = req.user._id;

    if (!responseStatus || !['approved', 'rejected'].includes(responseStatus)) {
        res.status(400); throw new Error("Invalid response status. Must be 'approved' or 'rejected'.");
    }

    const changeOrder = await ChangeOrder.findById(orderId);
    if (!changeOrder || changeOrder.booking.toString() !== bookingId) {
        res.status(404); throw new Error('Change order not found for this booking.');
    }

    // Authorization
    if (changeOrder.requestedTo.toString() !== responderId.toString()) {
        res.status(403); throw new Error('User not authorized to respond to this change order.');
    }
    if (changeOrder.status !== 'pending') {
        res.status(400); throw new Error(`Change order is not pending (status: ${changeOrder.status}).`);
    }

    changeOrder.status = responseStatus;
    changeOrder.responseComment = responseComment || '';
    changeOrder.respondedAt = Date.now();

    // If approved, potentially update the booking (e.g., totalAmount)
    // This logic can get complex depending on milestones, payments etc.
    // For now, just save the status. A separate process might handle booking updates.
    if (responseStatus === 'approved') {
        const booking = await Booking.findById(bookingId);
        if (booking && changeOrder.priceChange !== 0) {
            booking.totalAmount += changeOrder.priceChange;
            // TODO: Need logic here to handle adding/adjusting milestones if price changes significantly
            await booking.save();
            console.log(`Booking ${bookingId} totalAmount updated by ${changeOrder.priceChange}`);
        }
        // TODO: Update schedule if changeOrder.scheduleChangeDays is used
    }

    await changeOrder.save();

    // TODO: Notify the original requester

    res.status(200).json(changeOrder);
});



/**
 * @desc    Get details of a specific booking
 * @route   GET /api/bookings/:bookingId
 * @access  Private (Client or Pro involved)
 */
const getBookingDetails = asyncHandler(async (req, res) => {
    const { bookingId } = req.params;
    const userId = req.user._id;

    // Populate necessary fields
    const booking = await Booking.findById(bookingId)
        .populate('job', 'title') // Populate job title
        .populate('pro', 'name email') // Populate pro details
        .populate('client', 'name email') // Populate client details
        // Populate files with uploader name
        .populate({
            path: 'files.uploader',
            select: 'name'
         });
        // We fetch milestones and COs separately or can populate them too

    if (!booking) {
        res.status(404); throw new Error('Booking not found.');
    }

    // Authorization check
    if (booking.client._id.toString() !== userId.toString() && booking.pro._id.toString() !== userId.toString()) {
         res.status(403); throw new Error('User not authorized to view this booking.');
    }

    // Fetch associated milestones separately for clarity
    const milestones = await Milestone.find({ booking: bookingId }).sort('createdAt');

    // Check for open dispute
    const openDispute = await Dispute.findOne({ booking: bookingId, status: 'open' });

    // Check if current user has submitted a review for this booking
    const userReview = await Review.findOne({ booking: bookingId, reviewer: userId });

    // Combine data - convert Mongoose doc to plain object to add properties
    const bookingObject = booking.toObject();
    bookingObject.milestones = milestones;
    bookingObject.hasOpenDispute = !!openDispute;
    bookingObject.currentUserHasReviewed = !!userReview;


    res.status(200).json(bookingObject);
});

/**
 * @desc    Get all change orders for a specific booking
 * @route   GET /api/bookings/:bookingId/change-order
 * @access  Private (Client or Pro involved)
 */
const getBookingChangeOrders = asyncHandler(async (req, res) => {
    const { bookingId } = req.params;
    const userId = req.user._id;

     // Verify user is part of the booking first (optional but good practice)
    const booking = await Booking.findById(bookingId).select('client pro');
    if (!booking) {
        res.status(404); throw new Error('Booking not found.');
    }
    if (booking.client.toString() !== userId.toString() && booking.pro.toString() !== userId.toString()) {
         res.status(403); throw new Error('User not authorized to view change orders for this booking.');
    }

    const changeOrders = await ChangeOrder.find({ booking: bookingId })
        .populate('createdBy', 'name') // Populate requester name
        .populate('requestedTo', 'name') // Populate responder name
        .sort('-createdAt'); // Newest first

    res.status(200).json(changeOrders);
});


/**
 * @desc    Log time for a specific booking
 * @route   POST /api/bookings/:bookingId/time
 * @access  Private (Pro for the booking)
 */
const logTime = asyncHandler(async (req, res) => {
    const { bookingId } = req.params;
    const { hours, date, description } = req.body;
    const proId = req.user._id;

    if (!hours || !date) {
        res.status(400); throw new Error('Please provide hours and date.');
    }
    // Simple validation for hours
    const hoursWorked = parseFloat(hours);
    if (isNaN(hoursWorked) || hoursWorked <= 0 || hoursWorked > 24) {
        res.status(400); throw new Error('Invalid hours value. Must be between 0.1 and 24.');
    }

    const booking = await Booking.findById(bookingId).select('pro client status');
    if (!booking) {
        res.status(404); throw new Error('Booking not found.');
    }

    // Authorization: Only the assigned pro can log time
    if (booking.pro.toString() !== proId.toString()) {
        res.status(403); throw new Error('User not authorized to log time for this booking.');
    }

    // Status Check: Allow logging time only on active bookings (adjust as needed)
    if (booking.status !== 'active') {
         res.status(400); throw new Error(`Cannot log time for booking with status: ${booking.status}.`);
    }

    const timeEntry = await TimeEntry.create({
        booking: bookingId,
        pro: proId,
        hours: hoursWorked,
        date: new Date(date), // Ensure it's a Date object
        description: description || '',
    });

    // Optional: Recalculate total hours on the Booking model if needed

    res.status(201).json(timeEntry);
});

/**
 * @desc    Get time log entries for a specific booking
 * @route   GET /api/bookings/:bookingId/time
 * @access  Private (Client or Pro for the booking)
 */
const getTimeLog = asyncHandler(async (req, res) => {
    const { bookingId } = req.params;
    const userId = req.user._id;

    const booking = await Booking.findById(bookingId).select('pro client');
    if (!booking) {
        res.status(404); throw new Error('Booking not found.');
    }

    // Authorization: Only client and pro can view time logs
    if (booking.client.toString() !== userId.toString() && booking.pro.toString() !== userId.toString()) {
        res.status(403); throw new Error('User not authorized to view time log for this booking.');
    }

    // Fetch entries, sort by date worked (most recent first)
    const timeEntries = await TimeEntry.find({ booking: bookingId })
        .populate('pro', 'name') // Optionally show who logged it (useful if multiple pros possible later)
        .sort({ date: -1, createdAt: -1 });

    // Calculate total hours
    const totalHours = timeEntries.reduce((sum, entry) => sum + entry.hours, 0);

    res.status(200).json({
        totalHours: parseFloat(totalHours.toFixed(2)), // Format to 2 decimal places
        entries: timeEntries,
    });
});


/**
 * @desc    Get all bookings for the logged-in pro, filtered by status
 * @route   GET /api/bookings/my-bookings
 * @access  Private (Pro)
 */
const getMyBookings = asyncHandler(async (req, res) => {
    if (req.user.role !== 'pro') {
        res.status(403);
        throw new Error('User is not authorized to view this resource');
    }

    const { status } = req.query;

    const filter = { pro: req.user._id }; // Filter by the logged-in pro

    if (status && ['active', 'completed', 'pending_funding', 'in_dispute', 'cancelled'].includes(status)) {
        filter.status = status;
    }
    console.log(req.user.role)

    // Find bookings, populate related job title and client name
    const bookings = await Booking.find(filter)
        .populate('job', 'title') // Get the job title
        .populate('client', 'name') // Get the client's name
        .sort('-createdAt'); // Show newest first

    res.status(200).json({ bookings });
});
// --- END OF ADDITION --




/**
 * @desc    Get all custom invoices for a specific booking
 * @route   GET /api/bookings/:bookingId/invoices
 * @access  Private (Client or Pro involved)
 */
const getBookingInvoices = asyncHandler(async (req, res) => {
    const { bookingId } = req.params;
    const userId = req.user._id;

     // Verify user is part of the booking
    const booking = await Booking.findById(bookingId).select('client pro');
    if (!booking) {
        res.status(404); throw new Error('Booking not found.');
    }
    if (booking.client.toString() !== userId.toString() && booking.pro.toString() !== userId.toString()) {
         res.status(403); throw new Error('User not authorized to view invoices for this booking.');
    }

    // Find all invoices linked to this booking
    const invoices = await Invoice.find({ booking: bookingId })
        .sort({ createdAt: -1 }); // Newest first

    res.status(200).json(invoices);
});


module.exports = {
  acceptProposal,
  uploadWorkspaceFile,
  requestChangeOrder,
  respondToChangeOrder,
  getBookingDetails,
  getBookingChangeOrders,
  logTime,        // <-- Export new
  getTimeLog,     // <-- Export new
  getMyBookings,      // <-- Export new
  getBookingInvoices
};