const asyncHandler = require('../utils/asyncHandler');
const Milestone = require('../models/Milestone');
const Booking = require('../models/Booking');
const User = require('../models/User');
const Invoice = require('../models/Invoice');
const Subscription = require('../models/Subscription');
const { createTransfer, createPaymentIntent, stripeClient } = require('../services/paymentService');
const dotenv = require('dotenv');


dotenv.config();



/**
 * @desc    Release funds for a milestone
 * @route   POST /api/payments/milestones/:id/release
 * @access  Private (Client)
 */
const releaseMilestone = asyncHandler(async (req, res) => {
  const milestoneId = req.params.id;

  // 1. Find the milestone and populate related data
  const milestone = await Milestone.findById(milestoneId).populate({
    path: 'booking',
    populate: [
       { path: 'client', select: '_id' }, // Only need client ID for verification
       { path: 'pro', select: 'stripeAccountId stripeOnboardingComplete' } // Need pro's Stripe ID
    ]
  });

  if (!milestone) {
    res.status(404);
    throw new Error('Milestone not found');
  }

  const booking = milestone.booking;
  const proUser = booking.pro; // This is the populated pro user object

  // 2. Authorization: Ensure the requester is the client for this booking
  if (!booking.client || booking.client._id.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('User not authorized to release funds for this milestone');
  }

  // 3. Check Milestone Status
  if (milestone.status !== 'funded') {
    res.status(400);
    throw new Error(`Milestone cannot be released. Current status: ${milestone.status}`);
  }

  // 4. Check if Pro is onboarded and has Stripe Account ID
  if (!proUser || !proUser.stripeAccountId || !proUser.stripeOnboardingComplete) {
    res.status(400);
    throw new Error('The professional has not completed payment onboarding.');
  }

  // 5. Retrieve the Payment Intent to get the Charge ID
   if (!milestone.paymentIntentId) {
        res.status(400);
        throw new Error('Milestone is missing Payment Intent ID.');
   }
   
   let chargeId;
   try {
        const paymentIntent = await stripeClient.paymentIntents.retrieve(milestone.paymentIntentId);
        // A PaymentIntent might have multiple charges, but typically only one successful one.
        // Use the latest successful charge.
        if (paymentIntent.latest_charge) {
            chargeId = paymentIntent.latest_charge;
        } else {
            // Fallback: If latest_charge isn't populated yet, try fetching charges directly (less common)
            const charges = await stripeClient.charges.list({ payment_intent: milestone.paymentIntentId, limit: 1 });
            if (charges.data.length > 0) {
              chargeId = charges.data[0].id;
            }
        }
        
        if (!chargeId) {
             throw new Error('Could not find the associated charge for the Payment Intent.');
        }

   } catch(error) {
        console.error("Error retrieving charge from Payment Intent:", error);
        res.status(500);
        throw new Error('Failed to retrieve payment details for transfer.');
   }
   

  // 6. Create the Stripe Transfer
  const transfer = await createTransfer(
    milestone.amount,
    milestone.currency,
    proUser.stripeAccountId,
    chargeId, // Use the charge ID as the source_transaction
    {
      milestoneId: milestone._id.toString(),
      bookingId: booking._id.toString(),
    }
  );

  // 7. Update Milestone Status
  milestone.status = 'released';
  milestone.transferId = transfer.id;
  milestone.approvedAt = Date.now();
  milestone.releasedAt = Date.now(); // Or use timestamp from Stripe event later via webhooks

  await milestone.save();

  // Optionally: Update booking status if all milestones are released

  res.status(200).json({
    message: 'Milestone released successfully.',
    milestone: milestone,
    transferId: transfer.id,
  });
});


/**
 * @desc    Create a custom invoice for a booking
 * @route   POST /api/invoices
 * @access  Private (Pro for the booking)
 */
const createCustomInvoice = asyncHandler(async (req, res) => {
    const { bookingId, items, dueDate, currency, notes } = req.body;
    const proId = req.user._id;

    if (!bookingId || !items || !Array.isArray(items) || items.length === 0 || !dueDate) {
        res.status(400); throw new Error('Booking ID, at least one item, and due date are required.');
    }
    // Validate items structure
    if (!items.every(item => item.description && typeof item.quantity === 'number' && item.quantity > 0 && typeof item.unitPrice === 'number' && item.unitPrice >= 0)) {
       res.status(400); throw new Error('Invalid item structure. Each item needs description, quantity > 0, and unitPrice >= 0.');
    }

    const booking = await Booking.findById(bookingId).select('pro client status');
    if (!booking) {
        res.status(404); throw new Error('Booking not found.');
    }
    if (booking.pro.toString() !== proId.toString()) {
        res.status(403); throw new Error('User not authorized to create invoices for this booking.');
    }
     // Optional: Check booking status
    // if (!['active', 'in_progress', 'completed'].includes(booking.status)) { ... }

    // Create Invoice instance (totals calculated in pre-save hook)
    const invoice = new Invoice({
        booking: bookingId,
        client: booking.client,
        pro: proId,
        items: items.map(item => ({ // Ensure only valid fields are passed
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
        })),
        currency: currency || 'USD',
        dueDate: new Date(dueDate),
        status: 'sent', // Assume sent immediately, could add 'draft' status later
        notes: notes || '',
    });

    // Manually trigger validation to calculate totals before saving
    await invoice.validate();
    await invoice.save();

    // TODO: Notify client about the new invoice

    res.status(201).json(invoice);
});

/**
 * @desc    Initiate payment for a custom invoice
 * @route   POST /api/invoices/:invoiceId/pay
 * @access  Private (Client for the booking)
 */
const payInvoice = asyncHandler(async (req, res) => {
    const { invoiceId } = req.params;
    const clientId = req.user._id;

    const invoice = await Invoice.findById(invoiceId).populate('booking', 'client');
    if (!invoice) {
        res.status(404); throw new Error('Invoice not found.');
    }
    // Authorization check
    if (!invoice.booking || invoice.booking.client.toString() !== clientId.toString()) {
         res.status(403); throw new Error('User not authorized to pay this invoice.');
    }
    // Status check
    if (invoice.status !== 'sent' && invoice.status !== 'overdue') {
        res.status(400); throw new Error(`Invoice cannot be paid. Current status: ${invoice.status}`);
    }
    if (invoice.totalAmount <= 0) {
        res.status(400); throw new Error('Invoice amount must be greater than zero.');
    }

    // Check if a payment intent already exists and is usable
    let paymentIntent;
    if (invoice.paymentIntentId) {
        try {
            paymentIntent = await stripeClient.paymentIntents.retrieve(invoice.paymentIntentId);
            // If PI exists but is not 'requires_payment_method', maybe it succeeded already or failed?
            if (paymentIntent.status !== 'requires_payment_method') {
                 // Potentially check if 'succeeded' and update invoice status if webhook missed it
                 if (paymentIntent.status === 'succeeded'){
                     invoice.status = 'paid';
                     invoice.paidAt = new Date(paymentIntent.created * 1000); // Approximate time
                     await invoice.save();
                     res.status(400); throw new Error('Invoice has already been paid.');
                 }
                // If failed or canceled, create a new one
                paymentIntent = null; // Force creation of a new PI
                invoice.paymentIntentId = null; // Clear old ID
            }
        } catch (error) {
            console.warn(`Could not retrieve existing PaymentIntent ${invoice.paymentIntentId}, creating new. Error: ${error.message}`);
            paymentIntent = null; // Force creation
            invoice.paymentIntentId = null;
        }
    }


    // Create a new Payment Intent if needed
    if (!paymentIntent) {
        paymentIntent = await createPaymentIntent(
            invoice.totalAmount,
            invoice.currency,
            null, // Add Stripe Customer ID if available
            {
                invoiceId: invoice._id.toString(),
                bookingId: invoice.booking._id.toString(),
                description: `Payment for Invoice ${invoice._id}` // Keep it short
            }
        );
        invoice.paymentIntentId = paymentIntent.id;
        await invoice.save();
    }


    res.status(200).json({
        invoiceId: invoice._id,
        clientSecret: paymentIntent.client_secret,
        totalAmount: invoice.totalAmount,
        currency: invoice.currency,
    });
});
// --- Define Credit Packages (Move to config or DB later) ---
// Keys should match what frontend sends, values are Stripe Price IDs from your dashboard
const CREDIT_PACKAGES = {
    '10_credits': { priceId: process.env.STRIPE_PRICE_ID_10_CREDITS || 'price_mock_10', amount: 10 },
    '25_credits': { priceId: process.env.STRIPE_PRICE_ID_25_CREDITS || 'price_mock_25', amount: 25 },
    '50_credits': { priceId: process.env.STRIPE_PRICE_ID_50_CREDITS || 'price_mock_50', amount: 50 },
};

/**
 * @desc    Create a Stripe Checkout session for buying credits
 * @route   POST /api/payments/buy-credits
 * @access  Private (Pro)
 */
const createBuyCreditsCheckoutSession = asyncHandler(async (req, res) => {
    const { packageKey } = req.body; // e.g., '10_credits'
    const proId = req.user._id;

    if (req.user.role !== 'pro') {
        res.status(403); throw new Error('Only pros can buy credits.');
    }
    const selectedPackage = CREDIT_PACKAGES[packageKey];
    if (!selectedPackage) {
        res.status(400); throw new Error('Invalid credit package selected.');
    }

    const YOUR_DOMAIN = process.env.FRONTEND_URL || 'http://localhost:5173';

    try {
        const session = await stripeClient.checkout.sessions.create({
            line_items: [
                {
                    price: selectedPackage.priceId,
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${YOUR_DOMAIN}/pro/settings/credits?success=true&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${YOUR_DOMAIN}/pro/settings/credits?canceled=true`,
            // Store user ID and credit amount in metadata for webhook
            metadata: {
                userId: proId.toString(),
                creditsAmount: selectedPackage.amount.toString(),
                purchaseType: 'credits',
            },
            // Pre-fill email if desired
            // customer_email: req.user.email,
        });

        res.status(200).json({ sessionId: session.id, url: session.url });

    } catch (error) {
        console.error("Stripe Checkout Session Error:", error);
        res.status(500);
        throw new Error(`Could not create checkout session: ${error.message}`);
    }
});

 


/**
 * @desc    Get financial transaction history for the logged-in user
 * @route   GET /api/payments/financials/history
 * @access  Private
 */
const getFinancialHistory = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const userRole = req.user.role;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    let transactions = [];
    let totalCount = 0;
    const queryOptions = { sort: { createdAt: -1 }, skip, limit };

    if (userRole === 'client') {
        // Find funded/released milestones and paid invoices initiated by the client
        const milestoneQuery = { client: userId, status: { $in: ['funded', 'released', 'approved'] } }; // Milestones client paid
        const invoiceQuery = { client: userId, status: 'paid' }; // Invoices client paid

        const [milestones, invoices, milestoneCount, invoiceCount] = await Promise.all([
            Milestone.find(milestoneQuery, null, queryOptions).populate({ path: 'booking', select: 'job', populate: { path: 'job', select: 'title' } }),
            Invoice.find(invoiceQuery, null, queryOptions).populate({ path: 'booking', select: 'job', populate: { path: 'job', select: 'title' } }),
            Milestone.countDocuments(milestoneQuery),
            Invoice.countDocuments(invoiceQuery)
        ]);

        transactions = [
            ...milestones.map(m => ({
                _id: m._id, type: 'Milestone Payment', date: m.fundedAt || m.createdAt,
                description: `Milestone: ${m.description} for "${m.booking?.job?.title || 'Project'}"`,
                amount: -m.amount, // Negative for client outflow
                currency: m.currency, status: m.status
            })),
            ...invoices.map(inv => ({
                 _id: inv._id, type: 'Invoice Payment', date: inv.paidAt || inv.updatedAt,
                 description: `Invoice #${inv._id.slice(-6)} for "${inv.booking?.job?.title || 'Project'}"`,
                 amount: -inv.totalAmount, // Negative for client outflow
                 currency: inv.currency, status: inv.status
            }))
        ];
        totalCount = milestoneCount + invoiceCount; // Approximate total for pagination

    } else if (userRole === 'pro') {
        // Find released milestones and potentially payouts from paid invoices for the pro
        const milestoneQuery = { pro: userId, status: 'released' }; // Milestones paid out to pro
        // Invoice payouts depend on how transfers are handled (webhook update or direct link)
        // For simplicity, let's just show released milestones for now.
        // Add paid invoice amounts later if transfer logic links them clearly.

        const [milestones, milestoneCount] = await Promise.all([
            Milestone.find(milestoneQuery, null, queryOptions).populate({ path: 'booking', select: 'job', populate: { path: 'job', select: 'title' } }),
            Milestone.countDocuments(milestoneQuery)
        ]);

         transactions = milestones.map(m => ({
            _id: m._id, type: 'Milestone Payout', date: m.releasedAt || m.updatedAt,
            description: `Payout: ${m.description} for "${m.booking?.job?.title || 'Project'}"`,
            amount: m.amount, // Positive for pro inflow (before fees)
            currency: m.currency, status: m.status
         }));
         totalCount = milestoneCount;
    }

    // Sort combined transactions again (important if fetching from multiple sources)
    transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    // Apply limit again after manual sort if needed, though DB limit is more efficient
    // transactions = transactions.slice(0, limit); // Less accurate pagination if sources combined

    res.status(200).json({
        count: transactions.length,
        totalItems: totalCount, // Note: This might be approximate if combining sources after limiting
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        data: transactions,
    });
});


/**
 * @desc    Get available tax documents for the logged-in user (primarily Pro)
 * @route   GET /api/payments/financials/tax-docs
 * @access  Private (Pro)
 */
const getTaxDocuments = asyncHandler(async (req, res) => {
    if (req.user.role !== 'pro') {
        // Clients generally don't receive tax forms from the platform
        return res.status(200).json([]); // Return empty array for clients
    }

    const proUser = await User.findById(req.user._id).select('+stripeAccountId');
    if (!proUser || !proUser.stripeAccountId) {
         res.status(400); throw new Error('Stripe account not connected. Cannot retrieve tax documents.');
    }

    try {
        // Use Stripe API to list tax forms for the connected account
        // This requires the 'account' parameter set to the Pro's connected account ID.
        const taxForms = await stripeClient.taxForms.list({
            // limit: 10, // Add pagination if needed
            account: proUser.stripeAccountId,
        });

        // Format the response to be user-friendly
        const formattedDocs = taxForms.data.map(form => ({
            id: form.id,
            object: form.object, // e.g., 'tax_form'
            type: form.type, // e.g., 'us_1099_nec', 'us_1099_k'
            period_start: form.period_start ? new Date(form.period_start * 1000).getFullYear() : 'N/A',
            period_end: form.period_end ? new Date(form.period_end * 1000).getFullYear() : 'N/A',
            // Get download URL - Requires 'file' expansion or separate file retrieval
            // url: form.file?.url // This often requires separate API call or may not be directly available
            // Link to Stripe Express dashboard might be more reliable
            stripeDashboardLink: `https://connect.stripe.com/express/${proUser.stripeAccountId}/tax-reporting` // Adjust if not using Express
        }));

        res.status(200).json(formattedDocs);

    } catch (error) {
        console.error("Error fetching Stripe Tax Forms:", error);
         // Handle specific Stripe errors if needed (e.g., account not found, permissions)
        res.status(500);
        throw new Error(`Could not retrieve tax documents from Stripe: ${error.message}`);
    }
});


const handleStripeWebhook = asyncHandler(async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    let event;

    try {
        event = stripeClient.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
        console.error(`Webhook signature verification failed: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // --- Handle Different Event Types ---
    const dataObject = event.data.object;

    switch (event.type) {
        // --- Checkout Session for Initial Subscription ---
        case 'checkout.session.completed':
            const session = dataObject;
            console.log('Checkout Session Completed:', session.id, 'Mode:', session.mode);

            if (session.mode === 'subscription' && session.subscription) {
                // Retrieve the subscription to get customer and items
                try {
                    const subscription = await stripeClient.subscriptions.retrieve(session.subscription);
                    const userId = subscription.metadata.userId; // Get user ID from *subscription* metadata
                    const planKey = subscription.metadata.planKey; // Get plan key from *subscription* metadata
                    const priceId = subscription.items.data[0]?.price.id; // Get price ID

                    if (userId && planKey && priceId) {
                         // Check if subscription already created for this ID to prevent duplicates
                         const existingSub = await Subscription.findOne({ stripeSubscriptionId: subscription.id });
                         if (existingSub) {
                            console.log(`Subscription ${subscription.id} already processed.`);
                         } else {
                            await Subscription.create({
                                user: userId,
                                stripeSubscriptionId: subscription.id,
                                stripeCustomerId: subscription.customer,
                                stripePriceId: priceId,
                                planId: planKey,
                                status: subscription.status, // e.g., 'active', 'trialing'
                                currentPeriodEnd: new Date(subscription.current_period_end * 1000),
                                cancelAtPeriodEnd: subscription.cancel_at_period_end,
                                trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
                            });
                             console.log(`New subscription ${subscription.id} created for user ${userId}.`);
                             // TODO: Update user role or grant features based on planKey if needed
                             // const user = await User.findById(userId); user.isPro = true; await user.save();
                        }
                        // Ensure Stripe Customer ID is saved on the user model if not already
                        const user = await User.findById(userId);
                        if(user && !user.stripeCustomerId) {
                            user.stripeCustomerId = subscription.customer;
                            await user.save();
                        }

                    } else {
                         console.error(`Webhook Error: Missing metadata (userId, planKey) or priceId on subscription ${subscription.id} from checkout ${session.id}.`);
                    }
                } catch (subError) {
                    console.error(`Webhook Error: Failed to retrieve or process subscription ${session.subscription} from checkout ${session.id}:`, subError);
                }

            } else if (session.mode === 'payment' && session.metadata?.purchaseType === 'credits') {
                // --- Handle Credit Purchase ---
                 const userId = session.metadata.userId;
                 const creditsAmount = parseInt(session.metadata.creditsAmount, 10);
                 if (userId && !isNaN(creditsAmount) && creditsAmount > 0) {
                     const user = await User.findById(userId);
                     if (user) {
                         user.credits = (user.credits || 0) + creditsAmount;
                         await user.save();
                         console.log(`Added ${creditsAmount} credits to user ${userId}. New balance: ${user.credits}`);
                         // TODO: Notify user
                     } else { console.error(`Webhook Error: User ${userId} not found for credit purchase.`); }
                 } else { console.error(`Webhook Error: Invalid metadata for credit purchase in session ${session.id}.`); }
            } else {
                 console.log(`Checkout session ${session.id} completed (mode: ${session.mode}), not related to initial sub or known credits.`);
            }
            break;

        // --- Subscription Updates (Renewals, Cancellations, etc.) ---
        case 'customer.subscription.updated':
            const updatedSubscription = dataObject;
            console.log('Subscription Updated:', updatedSubscription.id, 'Status:', updatedSubscription.status);
            try {
                const sub = await Subscription.findOne({ stripeSubscriptionId: updatedSubscription.id });
                if (sub) {
                    sub.status = updatedSubscription.status;
                    sub.stripePriceId = updatedSubscription.items.data[0]?.price.id; // Update price if changed
                    sub.currentPeriodEnd = new Date(updatedSubscription.current_period_end * 1000);
                    sub.cancelAtPeriodEnd = updatedSubscription.cancel_at_period_end;
                    sub.canceledAt = updatedSubscription.canceled_at ? new Date(updatedSubscription.canceled_at * 1000) : null;
                    sub.trialEnd = updatedSubscription.trial_end ? new Date(updatedSubscription.trial_end * 1000) : null;
                    await sub.save();
                    console.log(`Subscription ${sub.stripeSubscriptionId} status updated to ${sub.status}.`);
                    // TODO: Update user role/features based on new status if needed
                } else {
                     console.warn(`Webhook Warning: Received update for unknown subscription ${updatedSubscription.id}.`);
                     // Potential issue: Maybe checkout webhook failed? Could try creating the sub record here as a fallback.
                }
            } catch (updateError) {
                 console.error(`Webhook Error: Failed to update subscription ${updatedSubscription.id} in DB:`, updateError);
            }
            break;

        case 'customer.subscription.deleted':
            const deletedSubscription = dataObject;
            console.log('Subscription Deleted:', deletedSubscription.id, 'Status:', deletedSubscription.status);
             try {
                // Update status to 'canceled' or remove the record
                const sub = await Subscription.findOne({ stripeSubscriptionId: deletedSubscription.id });
                if (sub) {
                     sub.status = 'canceled'; // Use Stripe's final status
                     sub.canceledAt = deletedSubscription.canceled_at ? new Date(deletedSubscription.canceled_at * 1000) : new Date();
                     await sub.save();
                     console.log(`Subscription ${sub.stripeSubscriptionId} marked as canceled in DB.`);
                     // TODO: Update user role/features (revoke access)
                } else {
                    console.warn(`Webhook Warning: Received delete for unknown subscription ${deletedSubscription.id}.`);
                }
             } catch (deleteError) {
                  console.error(`Webhook Error: Failed to process deletion for subscription ${deletedSubscription.id}:`, deleteError);
             }
            break;

        // --- Payment Intent for Invoices/Milestones ---
        case 'payment_intent.succeeded':
            const paymentIntent = dataObject;
            console.log('PaymentIntent Succeeded:', paymentIntent.id);
            if (paymentIntent.metadata.invoiceId) {
                 const invoice = await Invoice.findById(paymentIntent.metadata.invoiceId);
                 if (invoice && invoice.status !== 'paid') {
                    invoice.status = 'paid';
                    invoice.paidAt = new Date();
                    invoice.paymentIntentId = paymentIntent.id;
                    await invoice.save();
                    console.log(`Invoice ${invoice._id} marked as paid.`);
                    // TODO: Notify Pro & Initiate Transfer
                 }
            }
            // else if (paymentIntent.metadata.milestoneId) { /* ... Handle milestone funding confirmation ... */ }
            break;

        // --- Handle other important events ---
        case 'invoice.paid': // Good for confirming recurring subscription payments
             const invoice = dataObject;
             if (invoice.subscription) {
                 console.log(`Invoice ${invoice.id} paid for subscription ${invoice.subscription}.`);
                 // Subscription status should be updated via customer.subscription.updated,
                 // but you could double-check/update currentPeriodEnd here if needed.
             }
             break;
         case 'invoice.payment_failed':
             const failedInvoice = dataObject;
             if (failedInvoice.subscription) {
                 console.error(`Invoice payment failed for subscription ${failedInvoice.subscription}. Status is now ${failedInvoice.status}.`);
                 // Subscription status should update via customer.subscription.updated (e.g., to 'past_due' or 'unpaid')
                 // TODO: Notify user about payment failure.
             }
             break;

        default:
            console.log(`Unhandled webhook event type: ${event.type}`);
    }

    res.json({ received: true });
});


/**
 * @desc    Create or retrieve Payment Intent for funding a milestone
 * @route   POST /api/payments/milestones/:id/create-intent
 * @access  Private (Client)
 */
const createMilestonePaymentIntentController = asyncHandler(async (req, res) => {
    const { id: milestoneId } = req.params;
    const clientId = req.user._id;

    // 1. Find Milestone and populate necessary booking info
    const milestone = await Milestone.findById(milestoneId).populate({
        path: 'booking',
        select: 'client job status', // Need client ID for auth, job for metadata
        populate: { path: 'job', select: 'title' } // Get job title
    });

    if (!milestone) {
        res.status(404); throw new Error('Milestone not found.');
    }

    // 2. Authorization Check
    if (!milestone.booking || milestone.booking.client.toString() !== clientId.toString()) {
        res.status(403); throw new Error('User not authorized to fund this milestone.');
    }

    // 3. Status Check
    if (milestone.status !== 'pending') {
        res.status(400); throw new Error(`Milestone is not pending funding. Current status: ${milestone.status}`);
    }
     if (milestone.amount <= 0) {
        res.status(400); throw new Error('Milestone amount must be positive.');
    }

    // 4. Check for existing usable Payment Intent
    let paymentIntent;
    if (milestone.paymentIntentId) {
        try {
            paymentIntent = await stripeClient.paymentIntents.retrieve(milestone.paymentIntentId);
            // If PI exists but is not in a state to accept payment, clear it to create a new one
            if (!['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(paymentIntent.status)) {
                 console.log(`Existing PaymentIntent ${paymentIntent.id} has status ${paymentIntent.status}. Creating a new one.`);
                 paymentIntent = null;
                 milestone.paymentIntentId = null; // Clear old ID before creating new
            }
        } catch (error) {
            console.warn(`Could not retrieve existing PaymentIntent ${milestone.paymentIntentId}, creating new. Error: ${error.message}`);
            paymentIntent = null;
            milestone.paymentIntentId = null;
        }
    }

    // 5. Create a new Payment Intent if needed
    if (!paymentIntent) {
        paymentIntent = await createPaymentIntent(
            milestone.amount,
            milestone.currency,
            null, // Add Stripe Customer ID if available on user model
            {
                milestoneId: milestone._id.toString(),
                bookingId: milestone.booking._id.toString(),
                description: `Funding milestone: ${milestone.description.substring(0, 50)}... for "${milestone.booking.job?.title?.substring(0, 50) || 'Project'}"` // Keep short
            }
        );
        milestone.paymentIntentId = paymentIntent.id;
        await milestone.save(); // Save the new PI ID to the milestone
    }

    // 6. Return client secret and details
    res.status(200).json({
        milestoneId: milestone._id,
        clientSecret: paymentIntent.client_secret,
        amount: milestone.amount,
        currency: milestone.currency,
    });
});


module.exports = {
  releaseMilestone,
  createCustomInvoice,
  payInvoice,
  createBuyCreditsCheckoutSession,
  handleStripeWebhook,
  getFinancialHistory,
  getTaxDocuments,
  createMilestonePaymentIntentController, // <-- Export new
};