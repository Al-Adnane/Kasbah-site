/**
 * Structured Error Handler Moat - Unit Tests
 * Tests: 15+
 */

const {
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
} = require('../error-handler');

describe('Structured Error Handler Moat', () => {
  // Test error class hierarchy
  describe('AppError Class', () => {
    test('should create error with all properties', () => {
      const error = new AppError(
        'Test error',
        'TEST_ERROR',
        400,
        true,
        { userId: '123' }
      );

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.isOperational).toBe(true);
      expect(error.context).toEqual({ userId: '123' });
    });

    test('should set default statusCode to 500', () => {
      const error = new AppError('Test error');
      expect(error.statusCode).toBe(500);
    });

    test('should set default isOperational to true', () => {
      const error = new AppError('Test error', 'CODE');
      expect(error.isOperational).toBe(true);
    });

    test('should capture stack trace', () => {
      const error = new AppError('Test error');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('Error');
    });

    test('should set error name to constructor name', () => {
      const error = new AppError('Test error');
      expect(error.name).toBe('AppError');
    });

    test('should include timestamp', () => {
      const error = new AppError('Test error');
      expect(error.timestamp).toBeDefined();
      expect(error.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO string
    });

    test('should convert to JSON', () => {
      const error = new AppError(
        'Test error',
        'TEST_CODE',
        400,
        true,
        { detail: 'info' }
      );

      const json = error.toJSON();

      expect(json.ok).toBe(false);
      expect(json.error.message).toBe('Test error');
      expect(json.error.code).toBe('TEST_CODE');
      expect(json.error.statusCode).toBe(400);
      expect(json.error.context).toEqual({ detail: 'info' });
    });

    test('should exclude context from JSON if not provided', () => {
      const error = new AppError('Test error');
      const json = error.toJSON();

      expect(json.error.context).toBeUndefined();
    });
  });

  // Test error subclasses
  describe('Error Subclasses', () => {
    test('ValidationError should have correct defaults', () => {
      const error = new ValidationError('Invalid input', { field: 'email' });

      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.isOperational).toBe(true);
      expect(error.context).toEqual({ field: 'email' });
    });

    test('FileValidationError should have correct defaults', () => {
      const error = new FileValidationError('File too large');

      expect(error.code).toBe('FILE_VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.isOperational).toBe(true);
    });

    test('FileValidationError should accept custom code', () => {
      const error = new FileValidationError('Invalid type', 'INVALID_FILE_TYPE');

      expect(error.code).toBe('INVALID_FILE_TYPE');
    });

    test('AuthenticationError should have correct defaults', () => {
      const error = new AuthenticationError('Token expired');

      expect(error.code).toBe('AUTHENTICATION_ERROR');
      expect(error.statusCode).toBe(401);
      expect(error.message).toBe('Token expired');
    });

    test('AuthenticationError should have default message', () => {
      const error = new AuthenticationError();

      expect(error.message).toBe('Authentication required');
    });

    test('AuthorizationError should have correct defaults', () => {
      const error = new AuthorizationError('Access denied');

      expect(error.code).toBe('AUTHORIZATION_ERROR');
      expect(error.statusCode).toBe(403);
      expect(error.message).toBe('Access denied');
    });

    test('AuthorizationError should have default message', () => {
      const error = new AuthorizationError();

      expect(error.message).toBe('Insufficient permissions');
    });

    test('NotFoundError should have correct defaults', () => {
      const error = new NotFoundError('User');

      expect(error.code).toBe('NOT_FOUND');
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('User not found');
    });

    test('NotFoundError should have generic message', () => {
      const error = new NotFoundError();

      expect(error.message).toBe('Resource not found');
    });

    test('RateLimitError should include retry info', () => {
      const error = new RateLimitError('Too many requests', 60);

      expect(error.code).toBe('RATE_LIMIT_ERROR');
      expect(error.statusCode).toBe(429);
      expect(error.retryAfter).toBe(60);
    });

    test('ServiceUnavailableError should have correct defaults', () => {
      const error = new ServiceUnavailableError();

      expect(error.code).toBe('SERVICE_UNAVAILABLE');
      expect(error.statusCode).toBe(503);
      expect(error.message).toBe('Service temporarily unavailable');
    });

    test('ServiceUnavailableError should accept custom message', () => {
      const error = new ServiceUnavailableError('Database is down');

      expect(error.message).toBe('Database is down');
    });
  });

  // Test formatErrorResponse function
  describe('formatErrorResponse()', () => {
    test('should format AppError response', () => {
      const error = new AppError('Test error', 'TEST_CODE', 400);
      const response = formatErrorResponse(error);

      expect(response.status).toBe(400);
      expect(response.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(response.body);
      expect(body.ok).toBe(false);
      expect(body.error.message).toBe('Test error');
      expect(body.error.code).toBe('TEST_CODE');
    });

    test('should include requestId in response', () => {
      const error = new AppError('Test error');
      const response = formatErrorResponse(error, 'req-123');

      const body = JSON.parse(response.body);
      expect(body.error.requestId).toBe('req-123');
    });

    test('should include context in response when provided', () => {
      const error = new AppError('Test error', 'TEST', 400, true, { userId: '123' });
      const response = formatErrorResponse(error);

      const body = JSON.parse(response.body);
      expect(body.error.context).toEqual({ userId: '123' });
    });

    test('should exclude context when not provided', () => {
      const error = new AppError('Test error');
      const response = formatErrorResponse(error);

      const body = JSON.parse(response.body);
      expect(body.error.context).toBeUndefined();
    });

    test('should include Retry-After header for rate limit errors', () => {
      const error = new RateLimitError('Too many requests', 60);
      const response = formatErrorResponse(error);

      expect(response.headers['Retry-After']).toBe('60');
    });

    test('should handle generic errors', () => {
      const error = new Error('Generic error');
      const response = formatErrorResponse(error);

      expect(response.status).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.ok).toBe(false);
      expect(body.error.message).toBe('Generic error');
    });

    test('should mask non-operational error messages in production', () => {
      process.env.ENV = 'production';

      const error = new Error('Database connection failed');
      error.isOperational = false;
      const response = formatErrorResponse(error);

      const body = JSON.parse(response.body);
      expect(body.error.message).toBe('Internal server error');

      delete process.env.ENV;
    });

    test('should include error stack in development for non-operational errors', () => {
      process.env.ENV = 'development';

      const error = new Error('Database connection failed');
      error.isOperational = false;
      const response = formatErrorResponse(error);

      const body = JSON.parse(response.body);
      expect(body.error.details).toBeDefined();
      expect(body.error.details).toContain('Error');

      delete process.env.ENV;
    });

    test('should use current timestamp in response', () => {
      const error = new AppError('Test error');
      const response = formatErrorResponse(error);

      const body = JSON.parse(response.body);
      expect(body.error.timestamp).toBeDefined();
      expect(body.error.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  // Test isOperationalError function
  describe('isOperationalError()', () => {
    test('should return true for operational AppError', () => {
      const error = new ValidationError('Invalid');
      expect(isOperationalError(error)).toBe(true);
    });

    test('should return false for non-operational AppError', () => {
      const error = new AppError('Error', 'CODE', 500, false);
      expect(isOperationalError(error)).toBe(false);
    });

    test('should return false for generic Error', () => {
      const error = new Error('Generic');
      expect(isOperationalError(error)).toBe(false);
    });

    test('should return false for null', () => {
      expect(isOperationalError(null)).toBe(false);
    });

    test('should return false for undefined', () => {
      expect(isOperationalError(undefined)).toBe(false);
    });
  });

  // Test withErrorHandling wrapper
  describe('withErrorHandling()', () => {
    test('should wrap handler and execute it', async () => {
      const handler = jest.fn(async () => {
        return new Response('OK');
      });

      const wrapped = withErrorHandling(handler);
      const request = new Request('http://localhost/test');

      const result = await wrapped(request, {}, {});

      expect(handler).toHaveBeenCalled();
    });

    test('should catch and format errors', async () => {
      const handler = async () => {
        throw new ValidationError('Invalid input');
      };

      const wrapped = withErrorHandling(handler);
      const request = new Request('http://localhost/test');

      const result = await wrapped(request, {}, {});

      expect(result.status).toBe(400);
      const body = await result.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    test('should log errors to console', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const handler = async () => {
        throw new AppError('Test error', 'TEST_CODE');
      };

      const wrapped = withErrorHandling(handler);
      const request = new Request('http://localhost/test');

      await wrapped(request, {}, {});

      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    test('should include requestId in error log', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const handler = async () => {
        throw new Error('Test');
      };

      const wrapped = withErrorHandling(handler);
      const request = new Request('http://localhost/test', {
        headers: { 'x-request-id': 'req-123' }
      });

      await wrapped(request, {}, {});

      const logCall = consoleErrorSpy.mock.calls[0][0];
      expect(logCall.requestId).toBe('req-123');

      consoleErrorSpy.mockRestore();
    });

    test('should generate requestId if not provided', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const handler = async () => {
        throw new Error('Test');
      };

      const wrapped = withErrorHandling(handler);
      const request = new Request('http://localhost/test');

      await wrapped(request, {}, {});

      const logCall = consoleErrorSpy.mock.calls[0][0];
      expect(logCall.requestId).toMatch(/^err-\d+$/);

      consoleErrorSpy.mockRestore();
    });

    test('should handle operational vs non-operational errors', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const handler = async () => {
        throw new ValidationError('Invalid');
      };

      const wrapped = withErrorHandling(handler);
      const request = new Request('http://localhost/test');

      await wrapped(request, {}, {});

      const logCall = consoleErrorSpy.mock.calls[0][0];
      expect(logCall.isOperational).toBe(true);

      consoleErrorSpy.mockRestore();
    });

    test('should return proper Response object', async () => {
      const handler = async () => {
        throw new AppError('Error', 'CODE', 400);
      };

      const wrapped = withErrorHandling(handler);
      const request = new Request('http://localhost/test');

      const result = await wrapped(request, {}, {});

      expect(result instanceof Response).toBe(true);
      expect(result.status).toBe(400);
      expect(result.headers.get('Content-Type')).toBe('application/json');
    });
  });

  // Test error inheritance
  describe('Error Inheritance', () => {
    test('ValidationError should extend AppError', () => {
      const error = new ValidationError('Invalid');
      expect(error instanceof AppError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });

    test('all error types should have code and statusCode', () => {
      const errors = [
        new ValidationError('Test'),
        new FileValidationError('Test'),
        new AuthenticationError(),
        new AuthorizationError(),
        new NotFoundError(),
        new RateLimitError('Test', 60),
        new ServiceUnavailableError()
      ];

      errors.forEach(error => {
        expect(error.code).toBeDefined();
        expect(error.statusCode).toBeDefined();
        expect(error.isOperational).toBe(true);
      });
    });
  });

  // Edge cases
  describe('Edge Cases', () => {
    test('should handle error with no code property', () => {
      const error = new Error('Generic error');
      const response = formatErrorResponse(error);

      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('INTERNAL_ERROR');
    });

    test('should handle error with custom statusCode', () => {
      const error = new Error('Custom error');
      error.statusCode = 418; // I'm a teapot
      const response = formatErrorResponse(error);

      expect(response.status).toBe(418);
    });

    test('should handle null error gracefully', () => {
      expect(() => formatErrorResponse(null)).not.toThrow();
    });

    test('should handle error with circular reference in context', () => {
      const context = {};
      context.self = context;

      const error = new AppError('Error', 'CODE', 400, true, context);
      expect(() => error.toJSON()).not.toThrow();
    });
  });

  // Integration tests
  describe('Integration', () => {
    test('should work with Promise.catch()', async () => {
      const promise = Promise.reject(new ValidationError('Invalid'));

      try {
        await promise;
        fail('Should have thrown');
      } catch (error) {
        expect(isOperationalError(error)).toBe(true);
        expect(error.code).toBe('VALIDATION_ERROR');
      }
    });

    test('should serialize to JSON for API responses', () => {
      const error = new AppError('Database error', 'DB_ERROR', 500, false, {
        query: 'SELECT *'
      });

      const json = JSON.stringify(error.toJSON());
      expect(json).toBeDefined();

      const parsed = JSON.parse(json);
      expect(parsed.error.code).toBe('DB_ERROR');
    });

    test('should work with multiple error handling layers', () => {
      const innerError = new ValidationError('Invalid email');
      const wrappedError = new AppError(
        `Validation failed: ${innerError.message}`,
        'NESTED_ERROR',
        400,
        true,
        { originalError: innerError.code }
      );

      expect(wrappedError.context.originalError).toBe('VALIDATION_ERROR');
    });
  });
});
