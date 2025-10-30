const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { isAdmin } = require('../middleware/permissionMiddleware');
const {
    getUsers,
    getUserById,
    banUser,
    getDisputes,
    getDisputeById,
    resolveDispute,
    getAnalytics,
    overrideComplianceStatus, // <-- Import
    getExpiringCompliance,    // <-- Import
} = require('../controllers/adminController');

router.use(protect, isAdmin);

// --- Analytics ---
router.route('/analytics').get(getAnalytics);

// --- User Management ---
router.route('/users').get(getUsers);
router.route('/users/:id').get(getUserById);
router.route('/users/:id/ban').put(banUser);

// --- Dispute Management ---
router.route('/disputes').get(getDisputes);
router.route('/disputes/:id').get(getDisputeById);
router.route('/disputes/:id/resolve').put(resolveDispute);

// --- Compliance Management ---
router.route('/compliance/expiring').get(getExpiringCompliance); // <-- Add route
router.route('/compliance/users/:userId/override').post(overrideComplianceStatus); // <-- Add route

module.exports = router;