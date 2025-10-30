/**
 * Wraps an async controller function to catch errors
 * and pass them to the 'next' middleware (your global error handler).
 * @param {function} fn - The async controller function (req, res, next)
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;