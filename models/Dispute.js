const mongoose = require('mongoose');

const disputeSchema = new mongoose.Schema(
  {
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      index: true,
    },
    plaintiff: { // The user who raised the dispute
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    defendant: { // The other party involved
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reason: {
      type: String,
      required: [true, 'Please provide a reason for the dispute'],
      trim: true,
    },
    desiredOutcome: { // Optional: What the plaintiff wants
      type: String,
      trim: true,
    },
    evidence: [ // Optional: Links to files uploaded separately
      {
        fileName: String,
        url: String,
      },
    ],
    status: {
      type: String,
      enum: ['open', 'under_review', 'resolved', 'closed'],
      default: 'open',
    },
    resolution: { // Details on how it was resolved
      type: String,
    },
    resolvedBy: { // Admin who resolved it
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    resolvedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure only one open dispute per booking
disputeSchema.index({ booking: 1, status: 1 }, { unique: true, partialFilterExpression: { status: 'open' } });


module.exports = mongoose.model('Dispute', disputeSchema);