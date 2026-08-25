import { NextFunction, Request, Response } from 'express';
import { ZodTypeAny, ZodError } from 'zod';
import { AppError } from '../utils/AppError';

type RequestPart = 'body' | 'query' | 'params';

/**
 * Validates (and coerces) `req[part]` against a Zod schema.
 * On failure, throws a 422 AppError with a flattened list of field errors
 * -> matches the standardized error response `details` array.
 *
 * Usage: router.post('/register', validate(registerSchema), controller.register)
 */
export function validate(schema: ZodTypeAny, part: RequestPart = 'body') {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req[part]);
      // Replace with parsed/coerced data so controllers get clean typed input.
      (req as any)[part] = parsed;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        return next(
          AppError.validation('Request validation failed', details),
        );
      }
      next(err);
    }
  };
}
