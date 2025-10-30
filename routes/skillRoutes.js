const express = require('express');
const router = express.Router();
const { getSkills } = require('../controllers/skillController');
// Import admin controllers/middleware later
// const { protect } = require('../middleware/authMiddleware'); // Uncomment if making this protected

// Public route to get/search skills
router.route('/').get(getSkills); // Add protect middleware if needed

// Admin routes (add later)

module.exports = router;