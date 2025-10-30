const asyncHandler = require('../utils/asyncHandler');
const Category = require('../models/Category');

/**
 * @desc    Get all active categories
 * @route   GET /api/categories
 * @access  Public
 */
const getCategories = asyncHandler(async (req, res) => {
    // Fetch only active categories, sort alphabetically
    const categories = await Category.find({ isActive: true }).sort('name');
    res.status(200).json(categories);
});

// Admin CRUD functions (getCategoriesAdmin, createCategory, updateCategory, deleteCategory) would go here

module.exports = {
    getCategories,
    // Add admin functions later
};