/**
 * Structured Error Handler Moat
 * Enterprise-grade error handling with operational vs programming errors
 *
 * Integrated from: workspace archive src/lib/errors.ts
 * Status: Production-ready, tested with 15+ test cases
 */

/**
 * Base application error
 */
class AppError extends Error {
  constructor(
    message,
    code = 'INTERNAL_ERROR',
    statusCode = 500,
    isOperational = true,
    context = null
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    this.context = context;

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      ok: false,
      error: {
        message: this.message,
        code: this.code,
        statusCode: this.statusCode,
        timestamp: this.timestamp,
        ...(this.context && { context: this.context })
      }
    };
  }
}

/**
 * Validation error - invalid input
 */
class ValidationError extends AppError {
  constructor(message, context = null) {
    super(message, 'VALIDATION_ERROR', 400, true, context);
  }
}

/**
 * File validation error
 */
class FileValidationError extends AppError {
  constructor(message, code = 'FILE_VALIDATION_ERROR', context = null) {
    super(message, code, 400, true, context);
  }
}

/**
 * Authentication error
 */
class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 'AUTHENTICATION_ERROR', 401, true);
  }
}

/**
 * Authorization error
 */
class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 'AUTHORIZATION_ERROR', 403, true);
  }
}

/**
 * Not found error
 */
class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 'NOT_FOUND', 404, true);
  }
}

/**
 * Rate limit error
 */
class RateLimitError extends AppError {
  constructor(message, retryAfter) {
    super(message, 'RATE_LIMIT_ERROR', 429, true);
    this.retryAfter = retryAfter;
  }
}

/**
 * Service unavailable error
 */
class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable') {
    super(message, 'SERVICE_UNAVAILABLE', 503, true);
  }
}

/**
 * Format error for JSON response
 */
function formatErrorResponse(error, requestId = null) {
  // Handle AppError
  if (error instanceof AppError) {
    return {
      status: error.statusCode,
      body: JSON.stringify({
        ok: false,
        error: {
          message: error.message,
          code: error.code,
          timestamp: error.timestamp,
          ...(requestId && { requestId }),
          ...(error.context && { context: error.context })
        }
      }),
      headers: {
        'Content-Type': 'application/json',
        ...(error.retryAfter && { 'Retry-After': String(error.retryAfter) })
      }
    };
  }

  // Handle generic errors
  const statusCode = error.statusCode || 500;
  const isOperational = error.isOperational !== false;

  return {
    status: statusCode,
    body: JSON.stringify({
      ok: false,
      error: {
        message: isOperational ? error.message : 'Internal server error',
        code: error.code || 'INTERNAL_ERROR',
        timestamp: new Date().toISOString(),
        ...(requestId && { requestId }),
        ...(process.env.ENV === 'development' && !isOperational && { details: error.stack })
      }
    }),
    headers: {
      'Content-Type': 'application/json'
    }
  };
}

/**
 * Is error operational (can be handled gracefully)
 */
function isOperationalError(error) {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}

/**
 * Wrap handler with error catching
 */
function withErrorHandling(handler) {
  return async (request, env, ctx) => {
    try {
      return await handler(request, env, ctx);
    } catch (error) {
      const requestId = request.headers.get('x-request-id') || `err-${Date.now()}`;

      // Log error
      console.error({
        requestId,
        error: error.message,
        code: error.code || 'UNKNOWN',
        isOperational: isOperationalError(error),
        stack: error.stack
      });

      // Format response
      const errorResponse = formatErrorResponse(error, requestId);
      return new Response(errorResponse.body, {
        status: errorResponse.status,
        headers: errorResponse.headers
      });
    }
  };
}

module.exports = {
  AppError,
  ValidationError,
  FileValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
  ServiceUnavailableError,
  formatErrorResponse,
  isOperationalError,
  withErrorHandling
};
