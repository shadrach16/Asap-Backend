const User = require('../models/User');
const { generateToken } = require('../services/authService');
const asyncHandler = require('../utils/asyncHandler');

/**
 * @desc    Register a new user
 * @route   POST /api/auth/register
 * @access  Public
 */
const registerUser = asyncHandler(async (req, res, next) => {
  const { name, email, password, role } = req.body;

  // --- 1. Basic Validation ---
  if (!name || !email || !password) {
    res.status(400); // Bad Request
    throw new Error('Please provide name, email, and password');
  }

  // --- 2. Check if user already exists ---
  const userExists = await User.findOne({ email });

  if (userExists) {
    res.status(400);
    throw new Error('User already exists with that email');
  }

  // --- 3. Create new user ---
  // The 'pre-save' hook in User.js will hash the password
  const user = await User.create({
    name,
    email,
    password,
    role: role || 'client', // Default to 'client' if role not provided
  });

  // --- 4. Check creation and send response ---
  if (user) {
    // Generate a token
    const token = generateToken(user._id);

    // Send back user data and token
    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: token,
    });
  } else {
    res.status(400);
    throw new Error('Invalid user data');
  }
});

/**
 * @desc    Authenticate user & get token (Login)
 * @route   POST /api/auth/login
 * @access  Public
 */
const loginUser = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  // --- 1. Basic Validation ---
  if (!email || !password) {
    res.status(400);
    throw new Error('Please provide an email and password');
  }

  // --- 2. Find user by email ---
  // We must explicitly .select('+password') because it's hidden by default in the model
  const user = await User.findOne({ email }).select('+password');

  // --- 3. Check user and compare password ---
  if (user && (await user.comparePassword(password))) {
    // Password matches. Send response.
    res.status(200).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateToken(user._id),
    });
  } else {
    // User not found or password doesn't match
    res.status(401); // Unauthorized
    throw new Error('Invalid email or password');
  }
});

module.exports = {
  registerUser,
  loginUser, // <-- Export the new function
};