const express = require('express');
const router = express.Router();
const {
    submitReview,
    getReviewsForPro,
    requestTestimonial,
    getTestimonialByToken,
    submitTestimonial,
    getProTestimonials,
} = require('../controllers/reviewController');
const { protect } = require('../middleware/authMiddleware');

// --- Regular Reviews ---
router.route('/').post(protect, submitReview);
router.route('/pro/:proId').get(getReviewsForPro);

// --- Testimonials ---
router.route('/testimonials/request').post(protect, requestTestimonial); // Pro requests
router.route('/testimonials/token/:token').get(getTestimonialByToken); // Client loads submission page
router.route('/testimonials/submit/:token').post(submitTestimonial); // Client submits
router.route('/testimonials/pro/:proId').get(getProTestimonials); // Public view on pro profile

module.exports = router;