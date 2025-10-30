// routes/analyticsRoutes.js (NEW FILE)

const express = require('express');
const router = express.Router();
const { getClientAnalytics } = require('../controllers/analyticsController');
const { protect } = require('../middleware/authMiddleware');

// @route   GET /api/analytics/client
router.get('/client', protect, getClientAnalytics);

module.exports = router;