const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      index: true,
    },
    reviewer: {
      // User who wrote the review (client or pro)
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reviewee: {
      // User who is being reviewed (pro or client)
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true, // Index for fetching reviews for a specific user
    },
    rating: {
      type: Number,
      required: [true, 'Please provide a rating between 1 and 5'],
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      required: [true, 'Please provide a comment'],
      trim: true,
    },
    isVisible: {
      // Controls visibility for double-blind system
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure a user can only review another user once per booking
reviewSchema.index({ booking: 1, reviewer: 1 }, { unique: true });

module.exports = mongoose.model('Review', reviewSchema);