const express = require('express');
const router = express.Router();
const { getCategories } = require('../controllers/categoryController');
// Import admin controllers/middleware later

// Public route to get active categories
router.route('/').get(getCategories);

// Admin routes (add later with protection)
// router.route('/admin').post(protect, isAdmin, createCategory).get(protect, isAdmin, getCategoriesAdmin);
// router.route('/admin/:id').put(protect, isAdmin, updateCategory).delete(protect, isAdmin, deleteCategory);

module.exports = router;