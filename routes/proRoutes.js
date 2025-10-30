const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { checkSubscriptionStatus } = require('../middleware/permissionMiddleware');
const upload = require('../middleware/uploadMiddleware');
const {
    isPro,
    createService,
    getMyServices,
    getProServices,
    updateService,
    deleteService,
    getProAnalytics ,
    findServices,getServiceById 
} = require('../controllers/proController');

// --- Service Management Routes ---
router.route('/me/services').get(protect, isPro, getMyServices);
router.route('/services').post(protect, isPro, upload.single('serviceImage'), createService);
router.route('/services/:serviceId')
    .put(protect, isPro, upload.single('serviceImage'), updateService)
    .delete(protect, isPro, deleteService);

router.route('/service/:serviceId')
    .get(getServiceById);

// --- Public Route for Pro Services ---
router.route('/:proId/services').get(getProServices);

// --- Pro Analytics Route (Premium Feature) ---
router.route('/me/analytics')
    .get(
        protect,
        isPro,
        // Require an active 'pro_monthly' or 'pro_yearly' subscription
        // checkSubscriptionStatus([ 'pro_monthly', 'pro_yearly']),
        getProAnalytics // <-- Use the controller function
    );
router.route('/services/search').get(findServices);

module.exports = router;