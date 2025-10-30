const express = require('express');
const router = express.Router();
const {
    createSubscriptionCheckoutSession,
    createCustomerPortalSession,
    getCurrentSubscription, // <-- Import
} = require('../controllers/subscriptionController');
const { protect } = require('../middleware/authMiddleware');

// Get current user's subscription
router.route('/me').get(protect, getCurrentSubscription); // <-- Add route

// Create checkout session
router.route('/checkout-session').post(protect, createSubscriptionCheckoutSession);

// Create customer portal session
router.route('/customer-portal').post(protect, createCustomerPortalSession);

module.exports = router;