const express = require('express');
const router = express.Router();
const { submitDispute } = require('../controllers/disputesController');
const { protect } = require('../middleware/authMiddleware');

// Route to submit a new dispute (requires login)
router.route('/').post(protect, submitDispute);

// Add routes for admin management later (e.g., GET /, GET /:id, PUT /:id/resolve)

module.exports = router;