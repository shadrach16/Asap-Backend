
const express = require('express');
const router = express.Router();
const { handleKycWebhook } = require('../controllers/complianceController');
const { verifyOnfidoSignature } = require('../middleware/webhookMiddleware');

// This route is mounted at /api/webhooks
// It uses the raw body from server.js and verifies it
router.post('/kyc', verifyOnfidoSignature, handleKycWebhook);

module.exports = router;
