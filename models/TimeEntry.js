const mongoose = require('mongoose');

const timeEntrySchema = new mongoose.Schema(
  {
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      index: true,
    },
    pro: { // User who logged the time
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    hours: {
      type: Number,
      required: [true, 'Please enter the number of hours worked'],
      min: [0.1, 'Minimum time entry is 0.1 hours'], // e.g., 6 minutes
      max: [24, 'Maximum time entry is 24 hours per entry'],
    },
    date: { // The date the work was performed
      type: Date,
      required: [true, 'Please select the date work was performed'],
      default: Date.now,
    },
    description: { // Optional description of the work done
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    // Optional: Add status for client approval later if needed
    // status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' }
  },
  {
    timestamps: true, // Adds createdAt (when logged) and updatedAt
  }
);

module.exports = mongoose.model('TimeEntry', timeEntrySchema);