const asyncHandler = require('../utils/asyncHandler');
const Review = require('../models/Review');
const Booking = require('../models/Booking');
const Testimonial = require('../models/Testimonial'); // <-- Import Testimonial model
const User = require('../models/User'); // Import User for email
// const notificationService = require('../services/notificationService'); // Assuming email sending exists

// --- Existing Review Functions ---
/**
 * @desc    Submit a review for a completed booking
 * @route   POST /api/reviews
 * @access  Private (Client or Pro involved in booking)
 */
const submitReview = asyncHandler(async (req, res) => {
  const { bookingId, rating, comment } = req.body;
  const reviewerId = req.user._id;

  if (!bookingId || !rating || !comment) {
    res.status(400);
    throw new Error('Please provide bookingId, rating, and comment.');
  }

  const booking = await Booking.findById(bookingId).select('client pro status');

  if (!booking) {
    res.status(404);
    throw new Error('Booking not found.');
  }

  // Basic check: Only allow reviews on completed bookings (adjust if needed)
  // if (booking.status !== 'completed') {
  //   res.status(400);
  //   throw new Error('Reviews can only be submitted for completed bookings.');
  // }

  // Determine reviewer and reviewee
  let revieweeId;
  if (booking.client.toString() === reviewerId.toString()) {
    revieweeId = booking.pro;
  } else if (booking.pro.toString() === reviewerId.toString()) {
    revieweeId = booking.client;
  } else {
    res.status(403);
    throw new Error('User not authorized to review this booking.');
  }

  // Check if this reviewer already submitted for this booking
  const existingReview = await Review.findOne({ booking: bookingId, reviewer: reviewerId });
  if (existingReview) {
    res.status(400);
    throw new Error('You have already submitted a review for this booking.');
  }

  // Create the new review (initially not visible)
  const newReview = new Review({
    booking: bookingId,
    reviewer: reviewerId,
    reviewee: revieweeId,
    rating,
    comment,
    isVisible: false, // Start as hidden
  });

  // Check if the other party has already submitted a review
  const otherReview = await Review.findOne({
    booking: bookingId,
    reviewer: revieweeId, // The other person is the reviewer
  });

  if (otherReview) {
    // If the other review exists, make both visible
    newReview.isVisible = true;
    otherReview.isVisible = true;
    await otherReview.save(); // Save the update to the existing review
  }

  // Save the new review (will be visible only if otherReview was found and saved)
  await newReview.save();

  res.status(201).json({
    message: 'Review submitted successfully.',
    review: newReview,
    nowVisible: newReview.isVisible, // Indicate if review became visible immediately
  });
});

/**
 * @desc    Get all visible reviews for a specific Pro user
 * @route   GET /api/reviews/pro/:proId
 * @access  Public
 */
const getReviewsForPro = asyncHandler(async (req, res) => {
  const { proId } = req.params;

  const reviews = await Review.find({
    reviewee: proId, // Find reviews where this pro was reviewed
    isVisible: true,   // Only fetch visible reviews
  })
    .populate('reviewer', 'name') // Populate reviewer's name
    .sort({ createdAt: -1 }); // Newest first

  // Optionally calculate average rating
  let averageRating = 0;
  if (reviews.length > 0) {
    const totalRating = reviews.reduce((acc, item) => item.rating + acc, 0);
    averageRating = totalRating / reviews.length;
  }

  res.status(200).json({
    reviews,
    count: reviews.length,
    averageRating: parseFloat(averageRating.toFixed(1)), // Format to one decimal place
  });
});

// --- New Testimonial Functions ---

/**
 * @desc    Request a testimonial from a client for a completed booking
 * @route   POST /api/reviews/testimonials/request
 * @access  Private (Pro)
 */
const requestTestimonial = asyncHandler(async (req, res) => {
    const { bookingId } = req.body;
    const proId = req.user._id;

    if (!bookingId) {
        res.status(400); throw new Error('Booking ID is required.');
    }
    if (req.user.role !== 'pro') {
        res.status(403); throw new Error('Only pros can request testimonials.');
    }

    const booking = await Booking.findById(bookingId).populate('client', 'name email').populate('pro', 'name');
    if (!booking) {
        res.status(404); throw new Error('Booking not found.');
    }
    if (booking.pro._id.toString() !== proId.toString()) {
        res.status(403); throw new Error('You are not the pro for this booking.');
    }
    // Optional: Check if booking status allows testimonial requests (e.g., 'completed')
    // if (booking.status !== 'completed') {
    //     res.status(400); throw new Error('Testimonials can only be requested for completed bookings.');
    // }

     // Check if a request already exists
    const existingTestimonial = await Testimonial.findOne({ booking: bookingId });
    if (existingTestimonial) {
        res.status(400); throw new Error('A testimonial request already exists or has been submitted for this booking.');
    }

    const testimonial = new Testimonial({
        booking: bookingId,
        pro: proId,
        client: booking.client._id,
        status: 'pending_request',
    });

    const requestToken = testimonial.generateRequestToken();
    await testimonial.save();

    // --- Send Email to Client ---
    const submitUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/testimonials/submit/${requestToken}`;
    const emailData = {
        to: booking.client.email,
        subject: `${booking.pro.name} has requested a testimonial!`,
        // Create an HTML email template for this
        html: `<p>Hi ${booking.client.name},</p><p>${booking.pro.name} would appreciate it if you could share your experience working together on the project "${booking.job?.title || 'Untitled'}".</p><p>Please click the link below to leave a testimonial:</p><p><a href="${submitUrl}">${submitUrl}</a></p><p>This link will expire in 7 days.</p><p>Thanks,<br>The ASAP Team</p>`,
        // text: `... equivalent text version ...`
    };

    try {
        // await notificationService.sendEmail(emailData); // Replace with your actual email sending call
        console.log(`(Email Placeholder) Sent testimonial request to ${booking.client.email} with link: ${submitUrl}`);
         res.status(200).json({ message: 'Testimonial request sent successfully.' });
    } catch (emailError) {
        console.error("Failed to send testimonial request email:", emailError);
        // Don't fail the whole request if email fails, but maybe log it
        // Or you could delete the created testimonial record here if email is critical
        res.status(200).json({ message: 'Testimonial request created, but failed to send email notification.' });
    }
});

/**
 * @desc    Get pending testimonial details by token (for submission page)
 * @route   GET /api/reviews/testimonials/token/:token
 * @access  Public
 */
const getTestimonialByToken = asyncHandler(async (req, res) => {
    const { token } = req.params;

    const testimonial = await Testimonial.findOne({
        requestToken: token,
        tokenExpires: { $gt: Date.now() }, // Check if token is not expired
        status: 'pending_request'
    }).populate('pro', 'name').populate('client', 'name');

    if (!testimonial) {
        res.status(404);
        throw new Error('Testimonial request not found, is invalid, or has expired.');
    }

    // Only return necessary details for the form
    res.status(200).json({
        proName: testimonial.pro.name,
        clientName: testimonial.client.name,
        bookingId: testimonial.booking, // Send booking ID if needed contextually
    });
});


/**
 * @desc    Submit a testimonial using a token
 * @route   POST /api/reviews/testimonials/submit/:token
 * @access  Public
 */
const submitTestimonial = asyncHandler(async (req, res) => {
    const { token } = req.params;
    const { comment } = req.body;

     if (!comment || comment.trim() === '') {
        res.status(400); throw new Error('Testimonial comment cannot be empty.');
    }

    const testimonial = await Testimonial.findOne({
        requestToken: token,
        tokenExpires: { $gt: Date.now() },
        status: 'pending_request'
    });

     if (!testimonial) {
        res.status(404);
        throw new Error('Testimonial request not found, is invalid, or has expired.');
    }

    testimonial.comment = comment.trim();
    testimonial.status = 'submitted'; // Or 'published' if skipping admin approval
    testimonial.submittedAt = Date.now();
    testimonial.requestToken = undefined; // Invalidate the token
    testimonial.tokenExpires = undefined;

    await testimonial.save();

    // Optional: Notify the pro

    res.status(200).json({ message: 'Testimonial submitted successfully. Thank you!' });
});

/**
 * @desc    Get published testimonials for a specific Pro user
 * @route   GET /api/reviews/testimonials/pro/:proId
 * @access  Public
 */
const getProTestimonials = asyncHandler(async (req, res) => {
    const { proId } = req.params;

    const testimonials = await Testimonial.find({
        pro: proId,
        status: 'published', // Only fetch published ones (or 'submitted' if no approval step)
        comment: { $ne: null, $ne: '' } // Ensure comment exists
    })
    .populate('client', 'name') // Populate client's name
    .sort({ submittedAt: -1 }); // Newest submitted first

    res.status(200).json(testimonials);
});


module.exports = {
  submitReview,
  getReviewsForPro,
  requestTestimonial,     // <-- Export new
  getTestimonialByToken,  // <-- Export new
  submitTestimonial,      // <-- Export new
  getProTestimonials,     // <-- Export new
};