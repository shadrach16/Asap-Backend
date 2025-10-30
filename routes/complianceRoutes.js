const express = require('express');
const router = express.Router();
const { submitCompliance } = require('../controllers/complianceController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

// @route   POST /api/compliance/submit
// This route is protected, requires auth, and uses multer to parse a single file
router
  .route('/submit')
  .post(protect, upload.single('document'), submitCompliance);

module.exports = router;