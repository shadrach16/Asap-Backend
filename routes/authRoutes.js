const express = require('express');
const { registerUser, loginUser,forgotPassword,resetPassword } = require('../controllers/authController'); // <-- Import loginUser
const router = express.Router();

// @route   POST /api/auth/register
router.post('/register', registerUser);

// @route   POST /api/auth/login
router.post('/login', loginUser); // <-- Add the new login route

// @route   POST /api/auth/forgot-password
router.post('/forgot-password', forgotPassword); // <-- ADDED

// @route   PUT /api/auth/reset-password/:token
router.put('/reset-password/:token', resetPassword); // <-- ADDED

module.exports = router;