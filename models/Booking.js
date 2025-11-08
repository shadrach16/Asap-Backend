// models/Booking.js (Updated)

const mongoose = require('mongoose');

// Sub-schema for storing file metadata (NO CHANGE HERE)
const fileSchema = new mongoose.Schema({
    uploader: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    fileName: {
        type: String,
        required: true
    },
    fileType: { // Mime type
        type: String
    },
    url: { // Cloudinary URL
        type: String,
        required: true
    },
    publicId: { // Cloudinary public ID (for deletion)
        type: String,
        required: true
    },
    size: { // File size in bytes
        type: Number
    },
    uploadedAt: {
        type: Date,
        default: Date.now
    },
}, { _id: true }); 

const bookingSchema = new mongoose.Schema(
    {
        job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
        pro: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        proposal: { type: mongoose.Schema.Types.ObjectId, ref: 'Proposal', required: true },
        totalAmount: { type: Number, required: true },
        currency: { type: String, default: 'USD' },
        status: {
            type: String,
            enum: ['pending_funding', 'active', 'in_dispute', 'completed', 'cancelled'],
            default: 'pending_funding',
        },
        completedAt: { type: Date },
        cancelledAt: { type: Date },
        cancellationReason: { type: String },
        // --- Files Array ---
        files: [fileSchema], // Array to store workspace files metadata
        // --- End Files Array ---

        // 💡 NEW FIELD FOR CHAT READ STATUS
        lastReadBy: {
            type: Map, // Stores key-value pairs (String userId: Date timestamp)
            of: Date,
            default: {},
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model('Booking', bookingSchema);