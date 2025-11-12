const User = require('../models/User');
const { generateToken } = require('../services/authService');
const asyncHandler = require('../utils/asyncHandler');
const { sendNotification, sendEmail } = require('../services/notificationService'); // <-- UPDATED IMPORT
const crypto = require('crypto');


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

    try {
      if (user.role === 'pro'){
        sendNotification(null, null, user._id, 'USER_REGISTERED', {role:user.role}).catch(err => console.error("Failed to send USER_REGISTERED notification:", err));;
      } else {
        //   sendNotification(null, null, user._id, 'WELCOME', {role:user.role}).catch(err => console.error("Failed to send WELCOME notification:", err));;;

      }
    } catch (error) {
        // Log the error but continue to allow registration to complete
        console.error('Failed to send registration notification/email:', error);
    }


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



/**
 * @desc    Request password reset link
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
const forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
        // IMPORTANT: Send a generic success message to prevent email enumeration.
        return res.status(200).json({ message: 'If an account with that email exists, a password reset link has been sent.' });
    }

    // 1. Generate and save reset token (User model method is assumed to exist)
    const resetToken = user.getResetPasswordToken(); 
    await user.save({ validateBeforeSave: false }); // Save token/expiry to DB

    // 2. Create the reset URL (frontend route)
    const frontendUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`; 
    const resetURL = `${frontendUrl}/reset-password/${resetToken}`; 

    // 3. Email content
    const message = `You requested a password reset. Click the link below to set a new password:\n\n${resetURL}\n\nIf you did not request this, please ignore this email. The link will expire in 1 hour.`;

    try {
        await sendEmail({
            to: user.email,
            subject: 'ASAP Marketplace Password Reset Request',
            text: message,
            html: `
              <p>Hi ${user.name || 'User'},</p>
              <p>You requested a password reset for your ASAP Marketplace account.</p>
              <p>Click the link below to set a new password:</p>
              <a href="${resetURL}" style="display: inline-block; padding: 10px 20px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 5px; margin: 15px 0;">Reset My Password</a>
              <p>If you did not request this, please ignore this email. The link will expire in 1 hour.</p>
              <p>Thanks,<br>The ASAP Team</p>
            `,
        });

        res.status(200).json({
            message: 'Email sent successfully. Check your inbox (and spam).',
        });

    } catch (err) {
        // If email sending fails, clear the token from the user
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save({ validateBeforeSave: false });
        
        console.error('Password reset email failed:', err);
        res.status(500);
        throw new Error('There was an error sending the reset email. Please try again later.');
    }
});

/**
 * @desc    Reset password using token
 * @route   PUT /api/auth/reset-password/:token
 * @access  Public
 */
const resetPassword = asyncHandler(async (req, res) => {
    // 1. Hash the token from the URL parameter
    const resetPasswordToken = crypto
        .createHash('sha256')
        .update(req.params.token)
        .digest('hex');

    // 2. Find user by token and check expiration
    const user = await User.findOne({
        passwordResetToken: resetPasswordToken,
        passwordResetExpires: { $gt: Date.now() }, 
    }).select('+password'); // Ensure password field is selected to allow modification

    if (!user) {
        res.status(400);
        throw new Error('Password reset token is invalid or has expired.');
    }

    const { newPassword, confirmPassword } = req.body;

    // 3. Validate passwords
    if (!newPassword || newPassword.length < 8) {
        res.status(400);
        throw new Error('New password must be at least 8 characters long.');
    }
    if (newPassword !== confirmPassword) {
        res.status(400);
        throw new Error('Passwords do not match.');
    }
    
    // 4. Set new password and clear token fields
    // The pre-save hook on the User model will handle hashing the new password
    user.password = newPassword; 
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;

    await user.save(); // Saves and hashes new password

    res.status(200).json({ 
        success: true, 
        message: 'Password reset successful. You can now log in with your new password.'
    });
});


module.exports = {
  registerUser,
  loginUser, 
  forgotPassword, // <-- ADDED
  resetPassword,  // <-- ADDED
}