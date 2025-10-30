const mongoose = require('mongoose');

const milestoneSchema = new mongoose.Schema(
  {
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
    },
    description: {
      type: String,
      required: [true, 'Please provide a milestone description'],
    },
    amount: {
      type: Number,
      required: [true, 'Please provide a milestone amount'],
    },
    currency: {
      type: String,
      default: 'USD',
    },
    dueDate: {
      type: Date,
    },
    status: {
      type: String,
      enum: [
        'pending', // Not yet funded
        'funded',  // Client has paid into escrow (PaymentIntent succeeded)
        'submitted', // Pro has marked as complete (optional step)
        'approved', // Client approved for release
        'released', // Funds transferred to pro
        'cancelled',
      ],
      default: 'pending',
    },
    paymentIntentId: {
      // Stripe Payment Intent ID for funding
      type: String,
    },
    transferId: {
      // Stripe Transfer ID for release payout
      type: String,
    },
    fundedAt: {
      type: Date,
    },
    approvedAt: {
      type: Date,
    },
    releasedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Milestone', milestoneSchema);