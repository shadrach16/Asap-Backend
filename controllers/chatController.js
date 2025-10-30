const asyncHandler = require('../utils/asyncHandler');
const ChatMessage = require('../models/Chat');
const Booking = require('../models/Booking');
const notificationService = require('../services/notificationService'); // <-- Import notification service
const User = require('../models/User'); // Import User for sender name
const { moderateContent } = require('../services/aiService'); // <-- Import moderation service


const getMessages = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;

  // Verify user is part of the booking
  const booking = await Booking.findById(bookingId).select('client pro');
  if (!booking) {
    res.status(404);
    throw new Error('Booking not found');
  }
  if (
    booking.client.toString() !== req.user._id.toString() &&
    booking.pro.toString() !== req.user._id.toString()
  ) {
    res.status(403);
    throw new Error('User not authorized to view these messages');
  }

  // Fetch messages, sort by creation date
  const messages = await ChatMessage.find({ booking: bookingId })
    .populate('sender', 'name email role') // Populate sender info
    .sort({ createdAt: 1 }); // Oldest first

  res.status(200).json(messages);
});

const sendMessage = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { message } = req.body;

  if (!message || message.trim() === '') {
    res.status(400); throw new Error('Message content cannot be empty');
  }

  // --- Content Moderation ---
  const moderationResult = await moderateContent(message.trim());
  if (!moderationResult.isSafe) {
      res.status(400);
      throw new Error(`Message rejected due to unsafe content: ${moderationResult.violation || 'Policy Violation'}. Please revise.`);
  }
  // --- End Moderation ---

  

  const booking = await Booking.findById(bookingId).select('client pro');
   if (!booking) { res.status(404); throw new Error('Booking not found'); }
   if (booking.client.toString() !== req.user._id.toString() && booking.pro.toString() !== req.user._id.toString()) {
    res.status(403); throw new Error('User not authorized to send messages');
  }

  const newMessage = await ChatMessage.create({
    booking: bookingId,
    sender: req.user._id,
    message: message.trim(),
  });

  const populatedMessage = await newMessage.populate('sender', 'name email role');

const io = req.app.get('socketio');
  if (io) { io.to(bookingId).emit('newMessage', populatedMessage); }
  else { console.warn("Socket.io instance not found on req.app"); }

  // --- Send Notification to the OTHER user ---
const recipientId = booking.client.toString() === req.user._id.toString() ? booking.pro : booking.client;
  const userSockets = req.app.get('userSockets'); // Get socket map
  // Pass io and userSockets
  notificationService.sendNotification(io, userSockets, recipientId, 'NEW_MESSAGE', {
      senderName: req.user.name,
      bookingId: bookingId,
  }).catch(err => console.error("Failed to send NEW_MESSAGE notification:", err));
  // --- End Notification ---

  res.status(201).json(populatedMessage);
});

module.exports = {
  getMessages,
  sendMessage,
};