const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

// Basic CORS configuration (allow requests from your frontend)
// In production, you should restrict this to your actual frontend domain
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173', // 5173 is Vite's default port
  optionsSuccessStatus: 200,
};

// Basic rate limiting to prevent brute-force attacks
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5000, // Limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: 'Too many requests from this IP, please try again after 15 minutes',
});

module.exports = {
  helmet: helmet(),
  cors: cors(corsOptions),
  limiter: limiter,
};