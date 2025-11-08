const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema(
  {
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      index: true, // Index for faster message retrieval per booking
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    message: {
      type: String,
      required: function() {
        // Require message if there is no file, allowing file-only messages
        return !this.file;
      },
      trim: true,
    },
    // New field for file attachments
    file: {
        type: new mongoose.Schema({
            fileName: { type: String, required: true },
            fileUrl: { type: String, required: true }, // URL from Cloudinary
            fileType: { type: String, required: true }, // MIME type
            fileSize: { type: Number, required: true }, // Size in bytes
            publicId: { type: String, required: true }, // Cloudinary public ID for potential deletion/management
        }),
        required: false, // File is optional
    },
    // New field for message editing
    isEdited: {
        type: Boolean,
        default: false,
    }
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('ChatMessage', chatMessageSchema);