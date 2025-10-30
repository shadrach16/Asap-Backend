const {
  DefaultApi,
  Configuration,
  Region,
  WebhookEventVerifier,
  FileTransfer, // <-- 1. Import FileTransfer
  OnfidoInvalidSignatureError // Import the specific error
} = require("@onfido/api");
const { isAxiosError } = require("axios"); // <-- 2. Import isAxiosError
const dotenv = require('dotenv');

dotenv.config();

// --- Environment Variable Checks ---
if (!process.env.ONFIDO_API_TOKEN) {
  console.warn('ONFIDO_API_TOKEN not set. KYC service will be disabled.');
}
if (!process.env.ONFIDO_WEBHOOK_TOKEN) { // Renamed from ONFIDO_WEBHOOK_SECRET_TOKEN
  console.warn('ONFIDO_WEBHOOK_TOKEN not set. Webhook verification will fail.');
}
if (!process.env.ONFIDO_WEBHOOK_ID) {
  console.warn('ONFIDO_WEBHOOK_ID not set. Checks will not trigger webhooks.');
}

// --- API Client Initialization ---
const onfido = new DefaultApi(
  new Configuration({
    apiToken: process.env.ONFIDO_API_TOKEN,
    region: Region.CA, // Region is correct
    baseOptions: { timeout: 60_000 }
  })
);

// --- Webhook Verifier Initialization ---
const verifier = new WebhookEventVerifier(process.env.ONFIDO_WEBHOOK_TOKEN);

/**
 * Initiates a new KYC check with Onfido.
 *
 * @param {object} user - The user object
 * @param {Buffer} fileBuffer - The file buffer from req.file.buffer
 * @param {string} fileName - The original name of the file
 * @param {string} documentType - The type of document (e.g., 'driving_licence')
 * @returns {Promise<object>} - { checkId, applicantId, applicantJustCreated }
 */
const startKycCheck = async (user, fileBuffer, fileName, documentType) => {
  if (!process.env.ONFIDO_API_TOKEN) {
    
    throw new Error('KYC service is not configured.');
  }

  if (process.env.ONFIDO_ON_TEST){
    return {
      checkId: "TEST", // .data is not needed
      applicantId: "TEST",
      applicantJustCreated: "TEST"
    }
  }

  try {
    let applicantId = user.onfidoApplicantId;
    let applicantJustCreated = false;

    // 1. Find or create an applicant
    if (!applicantId) {
      console.log(`No Onfido applicantId for user ${user.email}, creating one...`);
      const [firstName, ...lastNameParts] = user.name.split(' ');
      
      // --- 3. FIX: Use createApplicant and underscore properties ---
      const newApplicant = await onfido.createApplicant({
        first_name: firstName || 'User',
        last_name: lastNameParts.join(' ') || 'Name',
        email: user.email,
        // Add location as per documentation, required for CA
        location: {
           country_of_residence: 'CAN' 
        }
      });
      
      applicantId = newApplicant.id; // .data is not needed
      applicantJustCreated = true;
    }

    // --- 4. FIX: Use FileTransfer for upload ---
    const documentFile = new FileTransfer(fileBuffer, fileName);

    const onfidoDocument = await onfido.uploadDocument(
      documentType || 'driving_licence',
      applicantId,
      documentFile
    );

    // --- 5. FIX: Use createCheck and underscore properties ---
    const check = await onfido.createCheck({
      applicant_id: applicantId,
      report_names: ['document'], // Request a document verification report
      document_ids: [onfidoDocument.id], // .data is not needed
      webhook_ids: [process.env.ONFIDO_WEBHOOK_ID],
    });

    return {
      checkId: check.id, // .data is not needed
      applicantId: applicantId,
      applicantJustCreated: applicantJustCreated
    };

  } catch (error) {
    // --- 6. FIX: Use isAxiosError for better logging ---
    if (isAxiosError(error)) {
      console.error(`Onfido API Error Status: ${error.response?.status}`);
      const errorDetails = error.response?.data?.error;
      if (errorDetails) {
        console.error('Error Details:', JSON.stringify(errorDetails, null, 2));
        throw new Error(`Onfido Error: ${errorDetails.type} - ${errorDetails.message}`);
      } else {
        console.error('Axios Error:', error.message);
        throw new Error('Failed to initiate KYC check due to network error.');
      }
    } else {
      console.error('Onfido Service Error:', error.message);
      throw new Error('Failed to initiate KYC check.');
    }
  }
};

/**
 * Verifies and parses an incoming Onfido webhook.
 * @param {string} rawBody - The raw request body (must be a string)
 * @param {string} signature - The 'X-Signature-Sha2' header value
 * @returns {object} - The parsed and verified webhook event
 */
const verifyWebhook = (rawBody, signature) => {
  if (!process.env.ONFIDO_WEBHOOK_TOKEN) {
    throw new Error('Onfido webhook token is not configured.');
  }

  try {
    // --- 7. FIX: Use readPayload as per documentation ---
    const event = verifier.readPayload(rawBody, signature);
    return event;
  } catch (error) {
    if (error instanceof OnfidoInvalidSignatureError) {
        console.error('Onfido Webhook Verification Error:', error.message);
        throw new Error('Invalid Onfido webhook signature.');
    } else {
        console.error('Onfido Webhook Error:', error.message);
        throw new Error('Could not process Onfido webhook.');
    }
  }
};

module.exports = {
  startKycCheck,
  verifyWebhook,
};