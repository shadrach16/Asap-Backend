const express = require('express');
const router = express.Router();
const { getMessages, sendMessage } = require('../controllers/chatController');
const { protect } = require('../middleware/authMiddleware');

// Routes are relative to /api/chats

// Get messages for a booking
router.route('/:bookingId').get(protect, getMessages);

// Send a message to a booking
router.route('/:bookingId').post(protect, sendMessage);

module.exports = router;