import { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError';
import { JwtPayload, UserRole, verifyAccessToken } from '../utils/jwt.util';
import { TokenExpiredError, JsonWebTokenError } from 'jsonwebtoken';

// Augment Express's Request type so `req.user` is available (typed) to
// every downstream handler after `authenticate` runs.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Verifies the `Authorization: Bearer <token>` header and attaches the
 * decoded payload to `req.user`. Must run before `authorize(...)`.
 */
export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return next(AppError.unauthorized('Missing or malformed Authorization header'));
  }

  const token = header.slice('Bearer '.length).trim();

  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    return next();
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      return next(AppError.unauthorized('Access token has expired'));
    }
    if (err instanceof JsonWebTokenError) {
      return next(AppError.unauthorized('Invalid access token'));
    }
    return next(AppError.unauthorized('Authentication failed'));
  }
}

/**
 * RBAC guard. Must run after `authenticate`.
 * Usage: router.delete('/:id', authenticate, authorize('admin'), controller.remove)
 */
export function authorize(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      // Defensive: authorize() used without authenticate() beforehand.
      return next(AppError.unauthorized('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        AppError.forbidden(
          `Role '${req.user.role}' is not permitted to perform this action`,
        ),
      );
    }

    return next();
  };
}
