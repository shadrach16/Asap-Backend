const asyncHandler = require('../utils/asyncHandler');
const Subscription = require('../models/Subscription'); // Import Subscription model
const User = require('../models/User'); // Import User for isAdmin check

const isAdmin = asyncHandler(async (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403); throw new Error('User is not authorized as an administrator');
  }
});

/**
 * Middleware to check if the user has an active subscription.
 * Optionally checks if the active subscription matches one of the allowed plan IDs.
 * Assumes 'protect' middleware has run.
 * @param {string[]} allowedPlanIds - Optional array of allowed planId strings (e.g., ['pro_monthly', 'pro_yearly'])
 */
const checkSubscriptionStatus = (allowedPlanIds = []) => asyncHandler(async (req, res, next) => {
    if (!req.user) {
        // Should not happen if 'protect' runs first
        res.status(401); throw new Error('Not authenticated');
    }

    // Admins bypass subscription checks
    if (req.user.role === 'admin') {
        return next();
    }

    const userId = req.user._id;

    try {
        const subscription = await Subscription.findOne({
            user: userId,
            // Check for statuses considered 'active' by Stripe
            status: { $in: ['active', 'trialing'] }
        });

        if (!subscription) {
            res.status(403); // Forbidden
            throw new Error('Access denied. Active subscription required.');
        }

        // If specific plans are required, check if the user's plan matches
        if (allowedPlanIds.length > 0 && !allowedPlanIds.includes(subscription.planId)) {
             res.status(403);
             throw new Error(`Access denied. Required subscription plan not found. Found: ${subscription.planId}`);
        }

        // Attach subscription info to request object if needed by controller
        req.subscription = subscription;
        next(); // User has an active (and allowed, if specified) subscription

    } catch (error) {
         // Pass specific errors or just rethrow
         // console.error("Subscription check error:", error);
         // res.status(error.statusCode || 500); // Use error status if available
         throw error; // Let global handler catch
    }
});


module.exports = {
  isAdmin,
  checkSubscriptionStatus, // Export new middleware
};