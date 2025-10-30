const mongoose = require('mongoose');

const changeOrderSchema = new mongoose.Schema(
  {
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      index: true,
    },
    createdBy: { // User who requested the change
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    requestedTo: { // User who needs to respond
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    scopeChangeDescription: { // Description of scope changes
      type: String,
      required: [true, 'Please describe the scope changes'],
      trim: true,
    },
    priceChange: { // Positive for increase, negative for decrease
      type: Number,
      default: 0,
    },
    scheduleChangeDays: { // Number of days to add/subtract from deadline (if applicable)
      type: Number,
      default: 0,
    },
    // Optional: Add a field for a new explicit deadline date if preferred over days
    // newDeadline: { type: Date }
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'withdrawn'],
      default: 'pending',
    },
    responseComment: { // Optional comment from responder
        type: String,
        trim: true,
    },
    respondedAt: {
        type: Date,
    }
  },
  {
    timestamps: true,
  }
);

// Ensure only one pending change order per booking at a time
changeOrderSchema.index({ booking: 1, status: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } });


module.exports = mongoose.model('ChangeOrder', changeOrderSchema);