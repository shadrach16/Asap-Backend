const mongoose = require('mongoose');

const invoiceItemSchema = new mongoose.Schema({
    description: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 0.1, default: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    // total: { type: Number, required: true } // Calculated field
});

// Method to calculate item total
invoiceItemSchema.methods.calculateTotal = function() {
    return (this.quantity * this.unitPrice).toFixed(2);
};

const invoiceSchema = new mongoose.Schema({
    invoiceNumber: { // Optional: Implement sequential numbering later
        type: String,
        // unique: true,
        // required: true,
    },
    booking: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
        required: true,
        index: true,
    },
    client: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    pro: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    items: [invoiceItemSchema],
    subTotal: {
        type: Number, // Calculated before tax/fees
        required: true,
    },
    // Optional: Add taxes, platform fees later
    // taxAmount: { type: Number, default: 0 },
    // platformFee: { type: Number, default: 0 },
    totalAmount: {
        type: Number,
        required: true,
    },
    currency: {
        type: String,
        required: true,
        uppercase: true,
    },
    status: {
        type: String,
        enum: ['draft', 'sent', 'paid', 'overdue', 'cancelled', 'void'],
        default: 'draft',
        index: true,
    },
    dueDate: {
        type: Date,
        required: true,
    },
    paidAt: {
        type: Date,
    },
    paymentIntentId: { // Stripe Payment Intent ID for payment
        type: String,
    },
    notes: { // Optional notes from pro
        type: String,
        trim: true,
    },
}, { timestamps: true });

// Pre-save hook to calculate totals
invoiceSchema.pre('validate', function(next) {
    if (this.items && this.items.length > 0) {
        this.subTotal = this.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
        // Add tax/fee calculations here if needed
        this.totalAmount = this.subTotal; // Update if taxes/fees are added
    } else {
        this.subTotal = 0;
        this.totalAmount = 0;
    }
    next();
});

module.exports = mongoose.model('Invoice', invoiceSchema);