const express = require('express');
const router = express.Router();
const { postJob, getJobs,getJobById,getMyJobs,updateJob,deleteJob } = require('../controllers/jobController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware'); //

// Define routes for /api/jobs
router.route('/')
    .post(protect, upload.array('attachments', 5), postJob)
    .get(getJobs); // Assuming getJobs is also authenticated

// --- ADD THIS ROUTE ---
// Route for getting a single job by its ID
router.route('/jobs').get(protect, getJobs);
router.route('/my-jobs').get(protect, getMyJobs);
router.route('/:jobId')
    .get(protect, getJobById)
    .put(protect, upload.array('attachments', 5), updateJob)
    .delete(protect, deleteJob);

module.exports = router;

 