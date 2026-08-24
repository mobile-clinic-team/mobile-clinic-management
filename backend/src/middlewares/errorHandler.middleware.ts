import { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError';
import { env } from '../config/env';

/**
 * Must be registered LAST, after all routes: app.use(errorHandler)
 * Express recognizes this as an error middleware by its 4-argument signature.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
  }

  // Unexpected / programmer error - never leak internals in production.
  // eslint-disable-next-line no-console
  console.error('Unhandled error:', err);

  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message:
        env.nodeEnv === 'production'
          ? 'Something went wrong. Please try again later.'
          : (err as Error)?.message ?? 'Unknown error',
      details: [],
    },
  });
}

/**
 * Catches requests to routes that don't exist. Registered right before
 * errorHandler.
 */
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`,
      details: [],
    },
  });
}
