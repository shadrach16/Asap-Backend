const mongoose = require('mongoose');

const skillSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Skill name is required'],
        trim: true,
        unique: true,
        lowercase: true, // Store skills consistently
    },
    // --- THIS IS NOW ENABLED ---
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
    },
    isVerified: { // Optional: For admin verification of skills
        type: Boolean,
        default: false, 
    }
}, { timestamps: true });

module.exports = mongoose.model('Skill', skillSchema);