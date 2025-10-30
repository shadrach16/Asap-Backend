const asyncHandler = require('../utils/asyncHandler');
const Dispute = require('../models/Dispute');
const Booking = require('../models/Booking');

/**
 * @desc    Submit a new dispute for a booking
 * @route   POST /api/disputes
 * @access  Private (Client or Pro involved in booking)
 */
const submitDispute = asyncHandler(async (req, res) => {
  const { bookingId, reason, desiredOutcome } = req.body;
  const plaintiffId = req.user._id;

  if (!bookingId || !reason) {
    res.status(400);
    throw new Error('Please provide bookingId and reason.');
  }

  const booking = await Booking.findById(bookingId).select('client pro status');

  if (!booking) {
    res.status(404);
    throw new Error('Booking not found.');
  }

  // Determine plaintiff and defendant
  let defendantId;
  if (booking.client.toString() === plaintiffId.toString()) {
    defendantId = booking.pro;
  } else if (booking.pro.toString() === plaintiffId.toString()) {
    defendantId = booking.client;
  } else {
    res.status(403);
    throw new Error('User not authorized to raise a dispute for this booking.');
  }

  // Check if an open dispute already exists for this booking
  const existingDispute = await Dispute.findOne({ booking: bookingId, status: 'open' });
  if (existingDispute) {
    res.status(400);
    throw new Error('An open dispute already exists for this booking.');
  }

  // Create the dispute
  const dispute = await Dispute.create({
    booking: bookingId,
    plaintiff: plaintiffId,
    defendant: defendantId,
    reason,
    desiredOutcome: desiredOutcome || '',
    status: 'open',
  });

  // Optionally: Update booking status to 'in_dispute'
  // booking.status = 'in_dispute';
  // await booking.save();

  // Optionally: Notify admin and the defendant

  res.status(201).json({
    message: 'Dispute submitted successfully. An admin will review it shortly.',
    dispute,
  });
});

module.exports = {
  submitDispute,
  // Add functions for getDisputes, resolveDispute (for admin) later
};