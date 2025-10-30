const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

// --- Profile Routes ---
// Get or update the logged-in user's profile
router.route('/me')
  .get(protect, getUserProfile)
  .put(protect, updateUserProfile);

// Get a public-facing profile for any user
router.route('/:userId/public')
  .get(getPublicUserProfile);

// --- Portfolio Routes ---
// Add a new portfolio item (requires image upload)
router.route('/me/portfolio')
  .post(protect, upload.single('image'), addPortfolioItem);

// Update or delete a specific portfolio item
router.route('/me/portfolio/:itemId')
  .put(protect, upload.single('image'), updatePortfolioItem)
  .delete(protect, deletePortfolioItem);

// --- Notification Routes ---
// Get all notifications for the logged-in user
router.route('/me/notifications')
  .get(protect, getNotifications);

// Mark all notifications as read
router.route('/me/notifications/read-all')
  .put(protect, markAllNotificationsAsRead);

// Mark a single notification as read
router.route('/me/notifications/:id/read')
  .put(protect, markNotificationAsRead);

// --- Notification Preferences Route ---
// Update the user's notification preferences
router.route('/me/preferences')
    .put(protect, updateNotificationPreferences);


module.exports = router;