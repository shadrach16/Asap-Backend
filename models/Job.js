const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    budget: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    // --- Updated Skills Field ---
    skills: [{ // Array of references to Skill documents
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Skill',
        required: true, // Make skills required for better matching
    }],
    // --- New Category Field ---
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        required: true, // Make category required
    },
    attachments: [
      {
        fileName: { type: String, required: true },
        fileUrl: { type: String, required: true },
        // Add fileKey if you use S3/Cloudinary, for deletion
        fileKey: { type: String } 
      }
    ],
    // --- End Changes ---
    location: { type: String },
    status: { type: String, enum: ['open', 'in_progress', 'completed', 'cancelled'], default: 'open' },
    selectedProposal: { type: mongoose.Schema.Types.ObjectId, ref: 'Proposal' },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
  },
  { timestamps: true }
);
jobSchema.index({ title: 'text', description: 'text' });

module.exports = mongoose.model('Job', jobSchema);