const asyncHandler = require('../utils/asyncHandler');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Skill = require('../models/Skill');
const { uploadStream, cloudinary } = require('../services/fileStorageService');
const mongoose = require('mongoose');






 


// --- Portfolio Functions ---

/**
 * @desc    Add a portfolio item
 * @route   POST /api/users/me/portfolio
 * @access  Private (Pro)
 */
const addPortfolioItem = asyncHandler(async (req, res) => {
    const { title, description, projectUrl } = req.body;

    if (!req.file) { res.status(400); throw new Error('Please upload an image file.'); }
    if (!title) { res.status(400); throw new Error('Please provide a title.'); }
     if (req.user.role !== 'pro') { res.status(403); throw new Error('Only pros can add portfolio items.'); }

    const user = await User.findById(req.user._id);
    if (!user) { res.status(404); throw new Error('User not found'); }

    // Upload image to Cloudinary
    const uploadResult = await uploadStream(req.file.buffer, `portfolio/${user._id}`);

    const newItem = {
        title,
        description: description || '',
        imageUrl: uploadResult.secure_url,
        cloudinaryPublicId: uploadResult.public_id,
        projectUrl: projectUrl || '',
    };

    user.portfolio.push(newItem);
    await user.save();

    // Find the newly added item (it gets an _id after saving)
    const addedItem = user.portfolio[user.portfolio.length - 1];

    res.status(201).json(addedItem);
});

/**
 * @desc    Update a portfolio item
 * @route   PUT /api/users/me/portfolio/:itemId
 * @access  Private (Pro)
 */
const updatePortfolioItem = asyncHandler(async (req, res) => {
    const { title, description, projectUrl } = req.body;
    const { itemId } = req.params;

    if (!title && !description && !projectUrl && !req.file) {
        res.status(400); throw new Error('No update data provided.');
    }
    if (req.user.role !== 'pro') { res.status(403); throw new Error('Only pros can update portfolio items.'); }

    const user = await User.findById(req.user._id);
    if (!user) { res.status(404); throw new Error('User not found'); }

    const itemIndex = user.portfolio.findIndex(item => item._id.toString() === itemId);
    if (itemIndex === -1) { res.status(404); throw new Error('Portfolio item not found'); }

    const item = user.portfolio[itemIndex];

    // Handle image update: delete old, upload new
    if (req.file) {
        try {
            await cloudinary.uploader.destroy(item.cloudinaryPublicId);
        } catch (delError) {
             console.error("Failed to delete old Cloudinary image:", delError);
             // Decide if this should block the update or just log
        }
        const uploadResult = await uploadStream(req.file.buffer, `portfolio/${user._id}`);
        item.imageUrl = uploadResult.secure_url;
        item.cloudinaryPublicId = uploadResult.public_id;
    }

    // Update text fields
    item.title = title || item.title;
    item.description = description || item.description;
    item.projectUrl = projectUrl || item.projectUrl;

    await user.save();

    res.status(200).json(item);
});

/**
 * @desc    Delete a portfolio item
 * @route   DELETE /api/users/me/portfolio/:itemId
 * @access  Private (Pro)
 */
const deletePortfolioItem = asyncHandler(async (req, res) => {
    const { itemId } = req.params;

     if (req.user.role !== 'pro') { res.status(403); throw new Error('Only pros can delete portfolio items.'); }

    const user = await User.findById(req.user._id);
    if (!user) { res.status(404); throw new Error('User not found'); }

    const itemIndex = user.portfolio.findIndex(item => item._id.toString() === itemId);
    if (itemIndex === -1) { res.status(404); throw new Error('Portfolio item not found'); }

    const item = user.portfolio[itemIndex];

    // Delete image from Cloudinary
    try {
        await cloudinary.uploader.destroy(item.cloudinaryPublicId);
    } catch (delError) {
        console.error("Failed to delete Cloudinary image during portfolio item deletion:", delError);
        // Don't block deletion from DB if Cloudinary fails, just log it
    }

    // Remove item from array
    user.portfolio.splice(itemIndex, 1);
    await user.save();

    res.status(200).json({ message: 'Portfolio item deleted successfully' });
});


/**
 * @desc    Get notifications for the logged-in user
 * @route   GET /api/users/me/notifications
 * @access  Private
 */
const getNotifications = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 15; // Number of notifications per page
    const skip = (page - 1) * limit;

    const notifications = await Notification.find({ user: userId })
        .sort({ createdAt: -1 }) // Newest first
        .skip(skip)
        .limit(limit);

    const totalNotifications = await Notification.countDocuments({ user: userId });
    const unreadCount = await Notification.countDocuments({ user: userId, isRead: false });

    res.status(200).json({
        count: notifications.length,
        totalItems: totalNotifications,
        totalPages: Math.ceil(totalNotifications / limit),
        currentPage: page,
        unreadCount: unreadCount,
        data: notifications,
    });
});
 



/**
 * @desc    Update notification preferences for the logged-in user
 * @route   PUT /api/users/me/preferences
 * @access  Private
 */
const updateNotificationPreferences = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const preferencesUpdates = req.body; // Expects object like { newMessage: { email: false }, proposalReceived: { inApp: true } }

    if (typeof preferencesUpdates !== 'object' || preferencesUpdates === null) {
        res.status(400); throw new Error('Invalid preferences format. Expected an object.');
    }

    const user = await User.findById(userId).select('+notificationPreferences');
    if (!user) {
        res.status(404); throw new Error('User not found.');
    }

    // Merge updates with existing preferences
    // Mongoose Maps need specific handling
    let changesMade = false;
    for (const key in preferencesUpdates) {
        if (user.notificationPreferences.has(key)) {
            const currentPref = user.notificationPreferences.get(key);
            const update = preferencesUpdates[key];

            if (typeof update.email === 'boolean' && currentPref.email !== update.email) {
                currentPref.email = update.email;
                changesMade = true;
            }
            if (typeof update.inApp === 'boolean' && currentPref.inApp !== update.inApp) {
                currentPref.inApp = update.inApp;
                changesMade = true;
            }
             if(changesMade) user.notificationPreferences.set(key, currentPref); // Explicitly set if changed
        } else {
             console.warn(`Attempted to update non-existent preference key: ${key}`);
             // Optionally add the new key if you want dynamic pref creation
             // user.notificationPreferences.set(key, { email: update.email ?? true, inApp: update.inApp ?? true }); changesMade = true;
        }
    }


    if (changesMade) {
        await user.save();
        res.status(200).json(user.notificationPreferences);
    } else {
        res.status(200).json(user.notificationPreferences); // No changes, return current state
    }
});


// --- Function to emit count update ---
const emitUnreadCountUpdate = async (req, userId) => {
    try {
        const io = req.app.get('socketio');
        const userSockets = req.app.get('userSockets');
        const recipientSocketId = userSockets.get(userId.toString());

        if (io && recipientSocketId) {
            const unreadCount = await Notification.countDocuments({ user: userId, isRead: false });
            io.to(recipientSocketId).emit('updateUnreadCount', { unreadCount });
            console.log(`Emitted 'updateUnreadCount' (${unreadCount}) to socket ${recipientSocketId}`);
        }
    } catch (error) {
         console.error("Failed to emit unread count update:", error);
    }
}

const markNotificationAsRead = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user._id;

    const notification = await Notification.findOneAndUpdate(
        { _id: id, user: userId, isRead: false },
        { isRead: true, readAt: Date.now() },
        { new: true }
    );

    if (!notification) {
        // ... (existing error handling for not found / already read) ...
         const exists = await Notification.findOne({ _id: id, user: userId });
        if (!exists) { res.status(404); throw new Error('Notification not found or not owned by user.'); }
        else { return res.status(200).json({ message: 'Notification was already read.', notification: exists }); }
    }

    // Emit count update asynchronously
    emitUnreadCountUpdate(req, userId);

    res.status(200).json(notification);
});

const markAllNotificationsAsRead = asyncHandler(async (req, res) => {
    const userId = req.user._id;

    const result = await Notification.updateMany(
        { user: userId, isRead: false },
        { isRead: true, readAt: Date.now() }
    );

    // Emit count update asynchronously only if changes were made
    if (result.modifiedCount > 0) {
        emitUnreadCountUpdate(req, userId);
    }

    res.status(200).json({ message: `${result.modifiedCount} notifications marked as read.` });
});




const getUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .select('+stripeAccountId +stripeOnboardingComplete') // <-- FIXED
    .populate('skills', 'name'); // Populate skills

  if (user) {
    // Convert Mongoose Map to plain object for consistent JSON response
    const prefsObject = user.notificationPreferences
        ? Object.fromEntries(user.notificationPreferences)
        : {};

    res.status(200).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      title: user.title,
      bio: user.bio,
      skills: user.skills, // Populated skills
      stripeAccountId: user.stripeAccountId,
      stripeOnboardingComplete: user.stripeOnboardingComplete,
      portfolio: user.portfolio,
      credits: user.credits,
      notificationPreferences: prefsObject, // Return as plain object
    });
  } else {
    res.status(404); throw new Error('User not found');
  }
});


const updateUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) { res.status(404); throw new Error('User not found'); }

  // General fields
  user.name = req.body.name !== undefined ? req.body.name : user.name;
  if (req.body.email && req.body.email !== user.email) {
    const emailExists = await User.findOne({ email: req.body.email });
    if (emailExists) { res.status(400); throw new Error('Email already in use'); }
    user.email = req.body.email;
  }

  // Pro Specific Fields
  if (user.role === 'pro') {
    user.title = req.body.title !== undefined ? req.body.title.trim() : user.title;
    user.bio = req.body.bio !== undefined ? req.body.bio.trim() : user.bio;

    // Skill Update Logic
    if (req.body.skills && Array.isArray(req.body.skills)) {
        // Validate IDs and ensure they exist (optional strict check)
        const validSkillIds = req.body.skills
            .map(id => String(id).trim()) // Ensure strings
            .filter(id => mongoose.Types.ObjectId.isValid(id));

        // Optional: Check if all skills exist in DB
        const existingSkillsCount = await Skill.countDocuments({ _id: { $in: validSkillIds } });
        if (existingSkillsCount !== validSkillIds.length) {
            throw new Error('One or more selected skills are invalid.');
        }
        user.skills = validSkillIds;
    } else if (req.body.skills === null || req.body.skills === '') {
        user.skills = []; // Allow clearing skills
    }
  }

  const updatedUser = await user.save();
  // Repopulate skills before sending response
  await updatedUser.populate('skills', 'name');

  // Convert Mongoose Map to plain object
   const prefsObject = updatedUser.notificationPreferences
        ? Object.fromEntries(updatedUser.notificationPreferences)
        : {};

  // Return updated profile (excluding sensitive fields)
  res.status(200).json({
    _id: updatedUser._id,
    name: updatedUser.name,
    email: updatedUser.email,
    role: updatedUser.role,
    title: updatedUser.title,
    bio: updatedUser.bio,
    skills: updatedUser.skills,
    credits: updatedUser.credits, // Include credits
    portfolio: updatedUser.portfolio, // Include portfolio
    notificationPreferences: prefsObject, // Return updated prefs
  });
});

const getPublicUserProfile = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        res.status(400); throw new Error('Invalid User ID format.');
    }

    const user = await User.findById(userId)
        .select('name role portfolio title bio skills createdAt') // Fields safe for public
        .populate('skills', 'name'); // Populate skill names

    // Only return profiles for 'pro' users publicly
    if (user && user.role === 'pro') {
        res.status(200).json(user);
    } else {
        res.status(404);
        throw new Error('Pro profile not found');
    }
});
 

module.exports = {
    getUserProfile,
    updateUserProfile,
    getPublicUserProfile,
    addPortfolioItem,
    updatePortfolioItem,
    deletePortfolioItem,
    getNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    updateNotificationPreferences,
};