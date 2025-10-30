const asyncHandler = require('../utils/asyncHandler');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const { stripeClient } = require('../services/paymentService');
const dotenv = require('dotenv');

dotenv.config();

// Define Subscription Plan Price IDs (match .env)
const SUBSCRIPTION_PLANS = {
    'pro_monthly': process.env.STRIPE_PRICE_ID_PRO_MONTHLY || 'price_mock_monthly',
    'pro_yearly': process.env.STRIPE_PRICE_ID_PRO_YEARLY || 'price_mock_yearly',
};

/**
 * @desc    Create Stripe Checkout session for a subscription plan
 * @route   POST /api/subscriptions/checkout-session
 * @access  Private
 */
const createSubscriptionCheckoutSession = asyncHandler(async (req, res) => {
    const { planKey } = req.body; // e.g., 'pro_monthly'
    const userId = req.user._id;

    const priceId = SUBSCRIPTION_PLANS[planKey];
    if (!priceId) {
        res.status(400); throw new Error('Invalid subscription plan selected.');
    }

    const user = await User.findById(userId).select('+stripeCustomerId');
    if (!user) {
        res.status(404); throw new Error('User not found.');
    }

    const YOUR_DOMAIN = process.env.FRONTEND_URL || 'http://localhost:5173';
    let stripeCustomerId = user.stripeCustomerId;

    // Create Stripe Customer if one doesn't exist
    if (!stripeCustomerId) {
        try {
            const customer = await stripeClient.customers.create({
                email: user.email,
                name: user.name,
                metadata: { userId: userId.toString() },
            });
            stripeCustomerId = customer.id;
            // Save the new customer ID to the user record
            user.stripeCustomerId = stripeCustomerId;
            await user.save();
        } catch (customerError) {
             console.error("Stripe Customer Creation Error:", customerError);
             res.status(500); throw new Error('Could not create billing customer.');
        }
    }

    try {
        const session = await stripeClient.checkout.sessions.create({
            customer: stripeCustomerId,
            payment_method_types: ['card'],
            line_items: [{ price: priceId, quantity: 1 }],
            mode: 'subscription',
            success_url: `${YOUR_DOMAIN}/settings/subscriptions?success=true&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${YOUR_DOMAIN}/settings/subscriptions?canceled=true`,
            // Pass metadata to identify user and plan in webhook
            subscription_data: {
                metadata: {
                    userId: userId.toString(),
                    planKey: planKey, // Store your internal plan key
                }
            },
            // Optional: Add trial period if applicable
            // subscription_data: { trial_period_days: 14, metadata: { ... }}
        });

        res.status(200).json({ sessionId: session.id, url: session.url });

    } catch (error) {
        console.error("Stripe Subscription Checkout Error:", error);
        res.status(500); throw new Error(`Could not create checkout session: ${error.message}`);
    }
});


/**
 * @desc    Create Stripe Customer Portal session
 * @route   POST /api/subscriptions/customer-portal
 * @access  Private
 */
const createCustomerPortalSession = asyncHandler(async (req, res) => {
     const userId = req.user._id;
     const YOUR_DOMAIN = process.env.FRONTEND_URL || 'http://localhost:5173';

     const user = await User.findById(userId).select('+stripeCustomerId');
     if (!user || !user.stripeCustomerId) {
         res.status(400); throw new Error('User does not have a billing account.');
     }

     const portalConfigurationId = process.env.STRIPE_PORTAL_CONFIG_ID;
     if (!portalConfigurationId) {
         res.status(500); throw new Error('Customer Portal is not configured on the server.');
     }

     try {
        const portalSession = await stripeClient.billingPortal.sessions.create({
            customer: user.stripeCustomerId,
            return_url: `${YOUR_DOMAIN}/settings/subscriptions`, // URL after user finishes in portal
            configuration: portalConfigurationId,
        });

        res.status(200).json({ url: portalSession.url });

     } catch (error) {
         console.error("Stripe Customer Portal Error:", error);
         res.status(500); throw new Error(`Could not create customer portal session: ${error.message}`);
     }
});


/**
 * @desc    Get the logged-in user's current subscription status
 * @route   GET /api/subscriptions/me
 * @access  Private
 */
const getCurrentSubscription = asyncHandler(async (req, res) => {
    const userId = req.user._id;

    // Find the subscription associated with the user
    // Optionally filter by active statuses if you only want to return active ones
    const subscription = await Subscription.findOne({
        user: userId,
        // status: { $in: ['active', 'trialing', 'past_due']} // Example filter
    }).sort({ createdAt: -1 }); // Get the latest one if multiple exist (shouldn't happen with unique index)

    if (!subscription) {
        // It's not an error to not have a subscription
        return res.status(200).json(null);
    }

    res.status(200).json(subscription);
});

module.exports = {
    createSubscriptionCheckoutSession,
    createCustomerPortalSession,
    getCurrentSubscription, // <-- Export new function
};