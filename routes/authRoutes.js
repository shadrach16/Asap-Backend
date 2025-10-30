const express = require('express');
const { registerUser, loginUser } = require('../controllers/authController'); // <-- Import loginUser
const router = express.Router();

// @route   POST /api/auth/register
router.post('/register', registerUser);

// @route   POST /api/auth/login
router.post('/login', loginUser); // <-- Add the new login route

module.exports = router;