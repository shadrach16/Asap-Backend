const express = require('express');
const router = express.Router();
// Import the new controller function
const { getMessages, sendMessage, editMessage, getChatList,markChatAsRead,getBookingByProposalId } = require('../controllers/chatController'); 
const { protect } = require('../middleware/authMiddleware');
const multer = require('multer');

// Configure multer for memory storage (for file upload)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
});


// Routes are relative to /api/chats

// NEW ROUTE: Get a list of all chat threads for the logged-in user
router.route('/my-threads').get(protect, getChatList); 

// Route to mark a chat as read
router.route('/:bookingId/read').put(protect, markChatAsRead); // <--- NEW ROUTE

// Existing routes for single chat:
// Get messages for a booking
router.route('/:bookingId').get(protect, getMessages);

// Send a message (handles both text and file upload)
router.route('/:bookingId').post(protect, upload.single('file'), sendMessage);

// Edit a message by its ID
router.route('/:messageId').put(protect, editMessage);

// Route to get booking details by proposal ID
router.route('/booking-by-proposal/:proposalId').get(protect, getBookingByProposalId); // <-- NEW ROUTE

module.exports = router;