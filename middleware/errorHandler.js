// A simple global error handler
const errorHandler = (err, req, res, next) => {
  // Determine status code: use error's status code or default to 500
  const statusCode = err.statusCode || 500;

  console.error(`[ERROR] ${new Date().toISOString()} - ${err.message}`, err.stack);

  res.status(statusCode).json({
    success: false,
    status: statusCode,
    message: err.message || 'Internal Server Error',
    // Only include stack trace in development
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
};

module.exports = errorHandler;