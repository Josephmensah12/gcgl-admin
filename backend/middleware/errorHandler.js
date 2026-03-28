class AppError extends Error {
  constructor(message, statusCode = 500, code = 'SERVER_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function errorHandler(err, req, res, _next) {
  console.error('Error:', err.message);

  if (err.name === 'SequelizeValidationError') {
    const fields = {};
    err.errors.forEach((e) => { fields[e.path] = e.message; });
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Validation failed', fields },
    });
  }

  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({
      success: false,
      error: { code: 'DUPLICATE', message: 'Record already exists' },
    });
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid token' },
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: { code: 'TOKEN_EXPIRED', message: 'Token expired' },
    });
  }

  const statusCode = err.statusCode || 500;
  const code = err.code || 'SERVER_ERROR';

  res.status(statusCode).json({
    success: false,
    error: { code, message: err.message || 'Internal server error' },
  });
}

module.exports = errorHandler;
module.exports.AppError = AppError;
