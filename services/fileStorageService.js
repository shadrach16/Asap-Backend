const { v2: cloudinary } = require('cloudinary');
const streamifier = require('streamifier');
const dotenv = require('dotenv');

dotenv.config();

// Configure Cloudinary
if (process.env.CLOUDINARY_URL) {
  cloudinary.config({
    secure: true, // Force HTTPS
    // Cloudinary URL should contain api_key, api_secret, cloud_name
  });
  console.log('Cloudinary service configured.');
} else {
  console.warn('CLOUDINARY_URL not found. File uploads will be disabled.');
}

/**
 * Uploads a file buffer to Cloudinary using streams.
 * @param {Buffer} fileBuffer - The file buffer obtained from multer memory storage.
 * @param {string} folder - The target folder path in Cloudinary (e.g., 'workspace/bookingId').
 * @returns {Promise<object>} - The Cloudinary upload result object (includes secure_url, public_id, etc.).
 */
const uploadStream = (fileBuffer, folder) => {
  // Return a promise to handle the asynchronous upload
  return new Promise((resolve, reject) => {
    // Check if Cloudinary is configured
    if (!process.env.CLOUDINARY_URL) {
      return reject(new Error('Cloudinary is not configured. Cannot upload file.'));
    }

    // Create an upload stream to Cloudinary
    const uploadStreamInstance = cloudinary.uploader.upload_stream(
      {
        folder: folder, // Specify the folder
        resource_type: 'auto', // Automatically detect resource type (image, video, raw)
        // You can add more upload options here if needed
        // e.g., tags, context, etc.
      },
      (error, result) => {
        if (error) {
           console.error("Cloudinary Upload Error:", error);
           // Reject the promise with the error
           return reject(new Error(`Cloudinary upload failed: ${error.message}`));
        }
        // Resolve the promise with the successful upload result
        resolve(result);
      }
    );

    // Use streamifier to convert the buffer into a readable stream
    // Pipe the readable stream into the Cloudinary upload stream
    streamifier.createReadStream(fileBuffer).pipe(uploadStreamInstance);
  });
};

module.exports = {
  cloudinary, // Export the configured client if needed elsewhere
  uploadStream,
  // Add delete function later if needed using cloudinary.uploader.destroy(publicId)
};