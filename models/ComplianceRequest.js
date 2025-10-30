const mongoose = require('mongoose');

const complianceRequestSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ['pending', 'submitted', 'in_review', 'approved', 'rejected', 'expired'],
      default: 'pending',
    },
    documents: [
      {
        documentType: {
          type: String,
          required: true,
        },
        url: {
          type: String,
          optional: true, // <-- UPDATED: No longer required
        },
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
        expiresAt: { 
          type: Date,
          optional: true,
        }
      },
    ],
    rejectionReason: {
      type: String,
    },
    verificationProviderId: { // This is the Onfido Check ID
      type: String,
    },
    // Optional: Add fields for admin override tracking
    overriddenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    overrideReason: { type: String },
    overrideAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('ComplianceRequest', complianceRequestSchema);