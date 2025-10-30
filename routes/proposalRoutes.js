const express = require('express');
const router = express.Router();
const {
  submitProposal,
  getProposalsForJob,getMyProposals
} = require('../controllers/proposalController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware'); //


// GET /api/proposals/my-proposals
router.route('/my-proposals').get(protect, getMyProposals);
// --- END OF ADDITION ---

// Route to submit a proposal
router.route('/').post(protect, upload.array('attachments', 5), submitProposal);

// Route to get proposals for a specific job
router.route('/job/:jobId').get(protect, getProposalsForJob);

module.exports = router;