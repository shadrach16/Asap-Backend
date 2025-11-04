const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    user: { // The recipient of the notification
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    message: { // The notification text
        type: String,
        required: true,
        trim: true,
    },
    type: { // Category for grouping or icons (e.g., 'message', 'proposal', 'booking', 'system')
        type: String,
        enum: ['onboarding','message', 'proposal', 'booking', 'milestone', 'dispute', 'review', 'system', 'announcement'],
        default: 'system',
    },
    link: { // Optional URL to navigate to when clicked (relative path)
        type: String,
        trim: true,
    },
    isRead: {
        type: Boolean,
        default: false,
    },
    readAt: {
        type: Date,
    },
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);