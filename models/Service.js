// models/Service.js (Updated)

const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
    pro: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    // --- NEW: Add Category ---
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category', //
        required: true,
    },
    title: {
        type: String,
        required: [true, 'Please provide a service title'],
        trim: true,
        maxlength: [100, 'Title cannot be more than 100 characters'],
    },
    description: {
        type: String,
        required: [true, 'Please provide a service description'],
        trim: true,
    },
    price: {
        type: Number,
        required: [true, 'Please provide a price'],
        min: [1, 'Price must be at least 1'],
    },
    currency: {
        type: String,
        default: 'USD',
        uppercase: true,
    },
    revisions: {
        type: Number,
        default: 1,
        min: 0,
    },
    deliveryTimeDays: {
        type: Number,
        required: [true, 'Please provide an estimated delivery time in days'],
        min: 1,
    },
    imageUrl: {
        type: String,
    },
    cloudinaryPublicId: {
        type: String,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
}, { timestamps: true });

// --- NEW: Add text index for searching ---
serviceSchema.index({ title: 'text', description: 'text' });

module.exports = mongoose.model('Service', serviceSchema);