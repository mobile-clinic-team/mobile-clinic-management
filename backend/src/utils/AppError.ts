/**
 * Standardized application error.
 * Thrown from services/controllers, caught by the centralized
 * error-handling middleware, and serialized to the required
 * response shape:
 *   { success: false, error: { code, message, details } }
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details: unknown[];

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details: unknown[] = [],
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, details: unknown[] = []) {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }

  static unauthorized(message = 'Unauthorized', details: unknown[] = []) {
    return new AppError(401, 'UNAUTHORIZED', message, details);
  }

  static forbidden(message = 'Forbidden', details: unknown[] = []) {
    return new AppError(403, 'FORBIDDEN', message, details);
  }

  static notFound(message = 'Resource not found', details: unknown[] = []) {
    return new AppError(404, 'NOT_FOUND', message, details);
  }

  static conflict(message: string, details: unknown[] = []) {
    return new AppError(409, 'CONFLICT', message, details);
  }

  static validation(message: string, details: unknown[] = []) {
    return new AppError(422, 'VALIDATION_ERROR', message, details);
  }

  static internal(message = 'Internal server error', details: unknown[] = []) {
    return new AppError(500, 'INTERNAL_SERVER_ERROR', message, details);
  }
}
