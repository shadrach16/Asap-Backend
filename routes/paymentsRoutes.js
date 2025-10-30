const express = require('express');
const router = express.Router();
const {
    releaseMilestone,
    createCustomInvoice,
    payInvoice,
    createBuyCreditsCheckoutSession,
    handleStripeWebhook,
    getFinancialHistory,
    getTaxDocuments,
    createMilestonePaymentIntentController, // <-- Import
} = require('../controllers/paymentsController');
const { protect } = require('../middleware/authMiddleware');

// --- Milestones ---
router.route('/milestones/:id/release').post(protect, releaseMilestone);
router.route('/milestones/:id/create-intent').post(protect, createMilestonePaymentIntentController); // <-- Add route

// --- Custom Invoices ---
router.route('/invoices').post(protect, createCustomInvoice);
router.route('/invoices/:invoiceId/pay').post(protect, payInvoice);

// --- Buy Credits ---
router.route('/buy-credits').post(protect, createBuyCreditsCheckoutSession);

// --- Financials ---
router.route('/financials/history').get(protect, getFinancialHistory);
router.route('/financials/tax-docs').get(protect, getTaxDocuments);

// --- Stripe Webhook ---
// Defined separately in server.js with raw body parser
// router.post('/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

module.exports = router;