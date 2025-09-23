// Custom error class for API errors
class ApiError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.name = this.constructor.name;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

// Create specific error types
const createNotFoundError = (resource = 'Resource') => {
  return new ApiError(`${resource} not found`, 404);
};

const createValidationError = (message = 'Validation failed') => {
  return new ApiError(message, 400);
};

const createUnauthorizedError = (message = 'Unauthorized access') => {
  return new ApiError(message, 401);
};

const createForbiddenError = (message = 'Access forbidden') => {
  return new ApiError(message, 403);
};

const createConflictError = (message = 'Resource conflict') => {
  return new ApiError(message, 409);
};

// Async error handler wrapper
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Global error handler middleware
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  console.error(`Error: ${err.message}`, {
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    user: req.user?.email || 'Anonymous'
  });

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Invalid resource ID';
    error = new ApiError(message, 400);
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`;
    error = new ApiError(message, 409);
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = new ApiError(message, 400);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = new ApiError(message, 401);
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = new ApiError(message, 401);
  }

  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    const message = 'File too large';
    error = new ApiError(message, 400);
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    const message = 'Unexpected file field';
    error = new ApiError(message, 400);
  }

  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
};

// 404 handler
const notFound = (req, res, next) => {
  const error = new ApiError(`Route ${req.originalUrl} not found`, 404);
  next(error);
};

module.exports = {
  ApiError,
  createNotFoundError,
  createValidationError,
  createUnauthorizedError,
  createForbiddenError,
  createConflictError,
  asyncHandler,
  errorHandler,
  notFound
};
