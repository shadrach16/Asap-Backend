const express = require('express');
const { verifyWebhook } = require('../services/verificationService');

/**
 * Verifies the Onfido webhook signature.
 * This middleware MUST be used with `express.raw()`
 * as it needs the raw request body.
 */
const verifyOnfidoSignature = (req, res, next) => {
  try {
    const signature = req.headers['x-signature-sha2'];
    if (!signature) {
      return res.status(400).send('Missing Onfido signature header');
    }

    // req.rawBody must be provided by express.raw()
    if (!req.rawBody) {
       console.error('express.raw() middleware not configured for this route.');
       return res.status(500).send('Webhook configuration error.');
    }
    
    // verifyWebhook parses the raw body and validates the signature
    const event = verifyWebhook(req.rawBody.toString(), signature);
    
    // Attach the verified event to the request body for the controller
    req.body = event;
    next();

  } catch (error) {
    console.error('Onfido webhook verification failed:', error.message);
    return res.status(403).send('Invalid Onfido signature');
  }
};

module.exports = {
  verifyOnfidoSignature,
};