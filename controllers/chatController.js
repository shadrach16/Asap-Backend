const asyncHandler = require('../utils/asyncHandler');
const ChatMessage = require('../models/Chat');
const Booking = require('../models/Booking');
const notificationService = require('../services/notificationService');
const { moderateContent } = require('../services/aiService');
const fileStorageService = require('../services/fileStorageService'); // Import new file service

/**
 * Helper to populate message sender details
 */
const populateMessage = (query) => query.populate('sender', 'name email role');

/**
 * @desc    Get messages for a specific booking
 * @route   GET /api/chats/:bookingId
 * @access  Private
 */
const getMessages = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;

  // 1. Authorization check
  const booking = await Booking.findById(bookingId).select('client pro');
  if (!booking) { res.status(404); throw new Error('Booking not found'); }
  const isAuthorized = booking.client.toString() === req.user._id.toString() || booking.pro.toString() === req.user._id.toString();
  if (!isAuthorized) { res.status(403); throw new Error('User not authorized to view these messages'); }

  // 2. Fetch messages, sort by creation date
  const messages = await populateMessage(ChatMessage.find({ booking: bookingId })).sort({ createdAt: 1 });

  res.status(200).json(messages);
});

/**
 * @desc    Send a new chat message (text or file)
 * @route   POST /api/chats/:bookingId
 * @access  Private (uses upload.single('file') middleware)
 */
const sendMessage = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { message } = req.body; // Text message from form fields
  const file = req.file; // File buffer from multer memory storage

  const trimmedMessage = message ? message.trim() : '';
  
  // Validation: Must have either a file or a non-empty message
  if (!trimmedMessage && !file) {
    res.status(400); throw new Error('Message content or file cannot be empty');
  }

  // 1. Content Moderation for Text Message
  // if (trimmedMessage) {
  //   const moderationResult = await moderateContent(trimmedMessage);
  //   if (!moderationResult.isSafe) {
  //       res.status(400);
  //       throw new Error(`Message rejected due to unsafe content: ${moderationResult.violation || 'Policy Violation'}. Please revise.`);
  //   }
  // }

  // 2. Authorization and Booking Check (simplified)
  const booking = await Booking.findById(bookingId).select('client pro');
  if (!booking) { res.status(404); throw new Error('Booking not found'); }
  const isAuthorized = booking.client.toString() === req.user._id.toString() || booking.pro.toString() === req.user._id.toString();
  if (!isAuthorized) { res.status(403); throw new Error('User not authorized to send messages'); }


  let fileData = null;
  // 3. File Upload to Cloudinary
  if (file) {
      if (!fileStorageService.uploadStream) {
           res.status(503); throw new Error('File storage service is not configured or available.');
      }
      // Create a unique folder for the booking to keep files organized
      const folder = `chat-files/booking-${bookingId}`; 
      try {
          const result = await fileStorageService.uploadStream(file.buffer, folder);
          fileData = {
              fileName: file.originalname,
              fileUrl: result.secure_url,
              fileType: file.mimetype,
              fileSize: file.size,
              publicId: result.public_id,
          };
      } catch (uploadError) {
          console.error("Cloudinary Upload Error:", uploadError.message);
          res.status(500); throw new Error(`File upload failed: ${uploadError.message}`);
      }
  }

  // 4. Create and Populate Message
  const newMessage = await ChatMessage.create({
    booking: bookingId,
    sender: req.user._id,
    message: trimmedMessage || undefined, // undefined if no message text
    file: fileData,
  });

  const populatedMessage = await populateMessage(newMessage);

  // 5. Real-time Broadcast & Notification
  const io = req.app.get('socketio');
  if (io) { io.to(bookingId).emit('newMessage', populatedMessage); }
  
  const recipientId = booking.client.toString() === req.user._id.toString() ? booking.pro : booking.client;
  const userSockets = req.app.get('userSockets');
  const notificationSnippet = file ? `[File: ${file.originalname}]` : trimmedMessage.substring(0, 50) + (trimmedMessage.length > 50 ? '...' : '');

  notificationService.sendNotification(io, userSockets, recipientId, 'NEW_MESSAGE', {
      senderName: req.user.name,
      bookingId: bookingId,
      messageSnippet: notificationSnippet, 
  }).catch(err => console.error("Failed to send NEW_MESSAGE notification:", err));


  // 6. Send Response
  res.status(201).json(populatedMessage);
});


/**
 * @desc    Edit an existing chat message
 * @route   PUT /api/chats/:messageId
 * @access  Private (Sender only)
 */
const editMessage = asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const { newMessage } = req.body;
    
    const trimmedNewMessage = newMessage ? newMessage.trim() : '';

    if (!trimmedNewMessage) {
        res.status(400); throw new Error('Edited message content cannot be empty');
    }

    // // 1. Content Moderation
    // const moderationResult = await moderateContent(trimmedNewMessage);
    // if (!moderationResult.isSafe) {
    //     res.status(400);
    //     throw new Error(`Edit rejected due to unsafe content: ${moderationResult.violation || 'Policy Violation'}. Please revise.`);
    // }

    // 2. Find and Validate Message
    const messageToEdit = await ChatMessage.findById(messageId);
    if (!messageToEdit) {
        res.status(404); throw new Error('Message not found.');
    }

    // 3. Authorization Check: Must be the sender and not a file-only message
    if (messageToEdit.sender.toString() !== req.user._id.toString()) {
        res.status(403); throw new Error('You are not authorized to edit this message.');
    }
    if (messageToEdit.file && !messageToEdit.message) {
         res.status(400); throw new Error('File-only messages cannot be edited.');
    }
    
    // 4. Update Message
    messageToEdit.message = trimmedNewMessage;
    messageToEdit.isEdited = true;
    await messageToEdit.save();

    // 5. Populate and Broadcast the updated message
    const updatedMessage = await populateMessage(messageToEdit);
    const io = req.app.get('socketio');
    
    // Broadcast the update to the room. The frontend will listen for 'messageUpdated'
    if (io) { 
      io.to(updatedMessage.booking.toString()).emit('messageUpdated', updatedMessage); 
    }

    res.status(200).json(updatedMessage);
});






/**
 * @desc    Get a list of all chat threads (bookings) for the logged-in user
 * @route   GET /api/chats/my-threads
 * @access  Private (Authenticated User)
 */
const getChatList = asyncHandler(async (req, res) => {
    const userId = req.user._id;

    // 1. Find all Bookings where the user is a participant
    const chatThreads = await Booking.find({
        $or: [
            { client: userId },
            { pro: userId },
        ],
    })
    .select('_id client pro jobTitle status createdAt lastReadBy')
    .populate('client', 'name role avatarUrl') 
    .populate('pro', 'name role avatarUrl') 
    .lean(); 

    if (chatThreads.length === 0) {
        return res.status(200).json([]);
    }

    // 2. Aggregate Last Message and Unread Count for each thread
    const threadsWithDetails = await Promise.all(chatThreads.map(async (thread) => {
        const bookingId = thread._id;

        // --- A. Get Last Message (for sorting and snippet) ---
        const lastMessage = await ChatMessage.findOne({ booking: bookingId })
            .sort({ createdAt: -1 })
            .select('message file createdAt sender')
            .populate('sender', 'name role')
            .lean();

        // --- B. Determine the Other User and Handle Null References ---
        const otherUserRaw = thread.client && thread.client._id.toString() === userId.toString() ? thread.pro : thread.client;
        const otherUser = otherUserRaw;

        let unreadCount = 0;
        
        if (lastMessage && otherUser && otherUser._id) { 
            const otherUserId = otherUser._id;
            
            // 💡 CRITICAL FIX: Add fallback ({}) in case lastReadBy is undefined in old documents
            const lastReadTime = (thread.lastReadBy || {})[userId.toString()];

            const unreadQuery = {
                booking: bookingId,
                sender: otherUserId,
            };
            
            if (lastReadTime) {
                // Count messages sent by the other user AFTER the current user's last read time
                unreadQuery.createdAt = { $gt: lastReadTime };
            } 

            unreadCount = await ChatMessage.countDocuments(unreadQuery);
        }
        
        // --- C. Format and Return ---
        return {
            ...thread,
            lastMessage: lastMessage ? {
                message: lastMessage.message || (lastMessage.file ? `[File: ${lastMessage.file.fileName}]` : ''),
                createdAt: lastMessage.createdAt,
                senderName: lastMessage.sender.name,
            } : null,
            unreadCount: unreadCount,
        };
    }));

    // 3. Sort threads: Most recent activity (last message time) first
    threadsWithDetails.sort((a, b) => {
        const dateA = a.lastMessage?.createdAt || a.createdAt; 
        const dateB = b.lastMessage?.createdAt || b.createdAt;
        return dateB - dateA; 
    });

    res.status(200).json(threadsWithDetails);
});


/**
 * @desc    Marks all messages in a chat thread as read for the current user.
 * @route   PUT /api/chats/:bookingId/read
 * @access  Private (Authenticated User)
 */
const markChatAsRead = asyncHandler(async (req, res) => {
    const { bookingId } = req.params;
    const userId = req.user._id;

    const booking = await Booking.findById(bookingId).select('client pro');
    
    if (!booking) {
        res.status(404);
        throw new Error('Booking not found');
    }
    
    // Check authorization
    if (booking.client.toString() !== userId.toString() && booking.pro.toString() !== userId.toString()) {
        res.status(403);
        throw new Error('User not authorized to access this chat');
    }

    // Set the current time as the last read time for this user.
    // Use the $set operator with dynamic path to update the Map field.
    const updatePath = `lastReadBy.${userId.toString()}`; 

    const updatedBooking = await Booking.findByIdAndUpdate(
        bookingId,
        { $set: { [updatePath]: new Date() } },
        { new: true, runValidators: true } // Return the updated document and run validators
    );

    res.status(200).json({ 
        message: 'Chat marked as read.',
        lastReadAt: updatedBooking.lastReadBy.get(userId.toString()),
    });
});


/**
 * @desc    Get booking details by proposal ID
 * @route   GET /api/chats/booking-by-proposal/:proposalId
 * @access  Private (Authenticated User)
 */
const getBookingByProposalId = asyncHandler(async (req, res) => {
    const { proposalId } = req.params;
    const userId = req.user._id;

    // 1. Find the Booking associated with the proposal
    const booking = await Booking.findOne({ proposal: proposalId })
        .select('_id client pro') 
        .lean();

    if (!booking) {
        // Status 404 is appropriate if the booking hasn't been created yet (proposal not accepted/funded)
        res.status(404);
        throw new Error('Booking not found for this proposal.');
    }

    // 2. Security Check: Ensure the current user is a participant
    if (booking.client.toString() !== userId.toString() && booking.pro.toString() !== userId.toString()) {
        res.status(403);
        throw new Error('User not authorized to access this booking.');
    }

    // 3. Return the Booking object (frontend primarily needs the _id)
    res.status(200).json(booking);
});


module.exports = {
  getMessages,
  sendMessage,
  editMessage, 
  getChatList,
  markChatAsRead,
  getBookingByProposalId
};