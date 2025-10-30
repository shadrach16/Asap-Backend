const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

// Load env vars
dotenv.config();

/**
 * Generates a signed JWT for a given user ID
 * @param {string} userId - The MongoDB _id of the user
 * @returns {string} - A signed JSON Web Token
 */
const generateToken = (userId) => {
  if (!process.env.JWT_SECRET) {
    console.error('FATAL ERROR: JWT_SECRET is not defined.');
    process.exit(1);
  }

  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: '30d', // Token expires in 30 days
  });
};

module.exports = {
  generateToken,
};