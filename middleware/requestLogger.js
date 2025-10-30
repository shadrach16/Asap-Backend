// middleware/requestLogger.js

const requestLogger = (req, res, next) => {
  const startHrTime = process.hrtime();
  const timestamp = new Date().toISOString();

  res.on('finish', () => {
    const elapsedHrTime = process.hrtime(startHrTime);
    const elapsedTimeInMs = (elapsedHrTime[0] * 1000 + elapsedHrTime[1] / 1e6).toFixed(3);

    const { method, originalUrl } = req;
    const { statusCode } = res;

    const logMessage = `[${timestamp}] ${method}:${originalUrl} | ${statusCode} | ${elapsedTimeInMs}ms`;
    
    console.log(logMessage);
  });

  next();
};

module.exports = requestLogger;