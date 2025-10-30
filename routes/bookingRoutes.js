const express = require('express');
const router = express.Router();
const {
    acceptProposal,
    uploadWorkspaceFile,
    requestChangeOrder,
    respondToChangeOrder,
    getBookingDetails,
    getBookingChangeOrders,
    logTime,        // <-- Import
    getTimeLog,     // <-- Import
    getMyBookings,
    getBookingInvoices
} = require('../controllers/bookingController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

// GET /api/bookings/my-bookings
router.route('/my-bookings')
    .get(protect, getMyBookings);

// Get booking details
router.route('/:bookingId')
    .get(protect, getBookingDetails);

// Accept a proposal
router.route('/accept').post(protect, acceptProposal);

// File uploads
router.route('/:bookingId/files')
    .post(protect, upload.single('workspaceFile'), uploadWorkspaceFile);

// Change Orders
router.route('/:bookingId/change-order')
    .get(protect, getBookingChangeOrders)
    .post(protect, requestChangeOrder);
router.route('/:bookingId/change-order/:orderId')
    .put(protect, respondToChangeOrder);

// Time Tracking
router.route('/:bookingId/time')
    .post(protect, logTime)      // <-- Add POST route for logging
    .get(protect, getTimeLog);   // <-- Add GET route for fetching logs


// GET /api/bookings/:bookingId/invoices
router.route('/:bookingId/invoices')
    .get(protect, getBookingInvoices);
// --- END OF ADDITION ---

module.exports = router;