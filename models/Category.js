const mongoose = require('mongoose');

// Simple slugify function
const slugify = (text) => {
  return text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, '-')     // Replace spaces with -
    .replace(/[^\w\-]+/g, '')  // Remove all non-word chars
    .replace(/\-\-+/g, '-')   // Replace multiple - with single -
    .replace(/^-+/, '')      // Trim - from start of text
    .replace(/-+$/, '');     // Trim - from end of text
};

const categorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Category name is required'],
        trim: true,
        unique: true,
    },
    description: {
        type: String,
        trim: true,
    },
    // parentCategory: { // Optional: For hierarchical categories
    //     type: mongoose.Schema.Types.ObjectId,
    //     ref: 'Category',
    //     default: null,
    // },
    slug: { // For URL-friendly identifiers
        type: String,
        unique: true,
        lowercase: true,
    },
    isActive: { // To enable/disable categories
        type: Boolean,
        default: true,
    }
}, { timestamps: true });

// Pre-save hook to generate slug from name
categorySchema.pre('save', function(next) {
    // only generate slug if it's new or the name has changed
    if (this.isModified('name') || this.isNew) {
        this.slug = slugify(this.name);
    }
    next();
});

module.exports = mongoose.model('Category', categorySchema);