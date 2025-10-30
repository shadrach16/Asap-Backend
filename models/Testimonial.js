const mongoose = require('mongoose');
const crypto = require('crypto');

const testimonialSchema = new mongoose.Schema(
  {
    booking: { // Optional: Link to the specific booking/job
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
    },
    pro: { // The pro being reviewed
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    client: { // The client providing the testimonial
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    comment: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending_request', 'submitted', 'published', 'rejected'], // Added published/rejected for potential admin step
      default: 'pending_request',
    },
    requestToken: { // Unique token for the submission link
      type: String,
      unique: true,
    },
    tokenExpires: {
      type: Date,
    },
    submittedAt: {
      type: Date,
    },
    // Optional: Add rating if desired
    // rating: { type: Number, min: 1, max: 5 },
  },
  {
    timestamps: true,
  }
);

// Method to generate and hash token before saving
testimonialSchema.methods.generateRequestToken = function() {
  // Generate token
  const token = crypto.randomBytes(20).toString('hex');

  // Hash token and set to requestToken field (optional hashing, depends on security needs)
  // For simplicity, storing plain token for now. Hash if needed.
  this.requestToken = token;

  // Set token expiry (e.g., 7 days)
  this.tokenExpires = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

  return token; // Return plain token for email link
};

// Ensure only one pending request per booking
testimonialSchema.index({ booking: 1, status: 1 }, { unique: true, partialFilterExpression: { status: 'pending_request' } });


module.exports = mongoose.model('Testimonial', testimonialSchema);