const mongoose = require('mongoose');

const proposalSchema = new mongoose.Schema(
  {
    pro: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job',
      required: true,
    },
    milestones: [{
    description: { type: String, required: true },
    dueDate: { type: Date, required: true },
    amount: { type: Number, required: true }
  }],
  attachments: [{
    fileName: { type: String, required: true },
    fileUrl: { type: String, required: true },
    fileKey: { type: String } 
  }],
    bidAmount: {
      type: Number,
      required: [true, 'Please provide a bid amount'],
    },
    currency: {
      type: String,
      default: 'USD',
    },
    coverLetter: {
      type: String,
      required: [true, 'Please include a cover letter'],
    },
    estimatedDuration: {
      // e.g., "1 week", "2-3 months"
      type: String,
    },
    status: {
      type: String,
      enum: ['submitted', 'viewed', 'accepted', 'rejected', 'withdrawn'],
      default: 'submitted',
    },
  },
  {
    timestamps: true,
  }
);

// Ensure a pro can only submit one proposal per job
proposalSchema.index({ pro: 1, job: 1 }, { unique: true });

module.exports = mongoose.model('Proposal', proposalSchema);