const stripe = require('stripe');
const dotenv = require('dotenv');

dotenv.config();

const stripeClient = new stripe(process.env.STRIPE_API_KEY, {
  apiVersion: '2024-06-20',
});

console.log('Stripe service initialized.');

const createPaymentIntent = async (amount, currency, customerId, metadata = {}) => {

  if (process.env.STRIPE_API_KEY === 'your_stripe_secret_key_here'){
    return {
      id:'TEST_ID',
      client_secret:'TEST_CLIENT_SECRET'
    }
  }
  try {
    const paymentIntentParams = {
      amount: Math.round(amount * 100),
      currency: currency.toLowerCase(),
      metadata: metadata,
      // For platform payouts, capture the charge immediately
      capture_method: 'manual', // We will capture later during transfer
      // Setup future usage for potential off-session transfers if needed
      // setup_future_usage: 'off_session', 
    };
    if (customerId) {
      paymentIntentParams.customer = customerId;
    }

    const paymentIntent = await stripeClient.paymentIntents.create(paymentIntentParams);
    
    // **Important**: Confirm the PaymentIntent immediately after creation for platform flows
    // This creates the charge needed for the transfer's source_transaction
    const confirmedIntent = await stripeClient.paymentIntents.confirm(paymentIntent.id);
    
    console.log(`PaymentIntent created and confirmed: ${confirmedIntent.id}`);
    return confirmedIntent; // Return the confirmed intent
  } catch (error) {
    console.error('Error creating PaymentIntent:', error);
    throw new Error('Failed to create payment intent.');
  }
};

/**
 * Creates a Stripe Transfer to payout funds to a connected account.
 * @param {number} amount - Amount in the smallest currency unit (e.g., cents).
 * @param {string} currency - Currency code (e.g., 'usd').
 * @param {string} destinationAccountId - The Stripe Connected Account ID of the pro.
 * @param {string} sourceChargeId - The ID of the Charge object from the original PaymentIntent.
 * @param {object} metadata - Optional metadata.
 * @returns {Promise<object>} - The Stripe Transfer object.
 */
const createTransfer = async (amount, currency, destinationAccountId, sourceChargeId, metadata = {}) => {
    if (!sourceChargeId) {
        throw new Error('Source charge ID is required for transfers.');
    }
    try {
        // Platform fee calculation (example: 10%)
        // const platformFee = Math.round(amount * 0.10); // Fee in cents
        // const amountToTransfer = amount - platformFee;
        // In a real app, fee calculation might be more complex

        const transfer = await stripeClient.transfers.create({
          amount: Math.round(amount * 100), // Transfer the full amount for now, fees managed separately
          currency: currency.toLowerCase(),
          destination: destinationAccountId,
          source_transaction: sourceChargeId, // Link transfer to the original charge
          metadata: metadata,
        });
        console.log(`Transfer created: ${transfer.id} for charge ${sourceChargeId}`);
        return transfer;
      } catch (error) {
        console.error('Error creating Transfer:', error);
        throw new Error(`Failed to create transfer: ${error.message}`);
      }
};


module.exports = {
  stripeClient,
  createPaymentIntent,
  createTransfer, // <-- Export new function
};