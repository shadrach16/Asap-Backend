const express = require('express');
const router = express.Router();
const {
    generateJobWithAI,
    suggestJobPriceController, // <-- Import
    getJobMatchesController,   // <-- Import
} = require('../controllers/aiController');
const { protect } = require('../middleware/authMiddleware');
// Optional: Add specific role checks if needed (e.g., isClient)
// const { isClient } = require('../middleware/permissionMiddleware');

// Generate Job Description
router.route('/generate-job').post(protect, generateJobWithAI);

// Suggest Job Price
router.route('/suggest-price').post(protect, suggestJobPriceController); // Requires description in body

// Get Job Matches
router.route('/jobs/:jobId/matches').get(protect, getJobMatchesController); // Requires jobId in params

module.exports = router;