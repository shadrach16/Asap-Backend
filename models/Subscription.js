const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true, // Typically one active subscription per user
        index: true,
    },
    stripeSubscriptionId: { // ID from Stripe API (sub_xxxxxxxx)
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    stripeCustomerId: { // Stripe Customer ID (cus_xxxxxxxx)
        type: String,
        required: true,
    },
    stripePriceId: { // ID of the Stripe Price object (price_xxxxxxxx)
        type: String,
        required: true,
    },
    planId: { // Your internal identifier for the plan (e.g., 'pro_monthly', 'pro_yearly')
        type: String,
        required: true,
    },
    status: { // Mirrored from Stripe (e.g., 'active', 'canceled', 'past_due', 'incomplete', 'incomplete_expired', 'trialing', 'unpaid')
        type: String,
        required: true,
        index: true,
    },
    currentPeriodEnd: { // When the current billing period ends (Unix timestamp from Stripe, stored as Date)
        type: Date,
    },
    cancelAtPeriodEnd: { // If subscription is set to cancel at period end
        type: Boolean,
        default: false,
    },
    canceledAt: { // If subscription was canceled immediately or after period end
        type: Date,
    },
    trialEnd: { // If the subscription has/had a trial
        type: Date,
    },
}, { timestamps: true });

module.exports = mongoose.model('Subscription', subscriptionSchema);