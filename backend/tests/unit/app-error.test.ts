import { AppError } from '../../src/utils/AppError';

describe('AppError factories', () => {
  it.each([
    ['badRequest', 400, 'BAD_REQUEST'],
    ['unauthorized', 401, 'UNAUTHORIZED'],
    ['forbidden', 403, 'FORBIDDEN'],
    ['notFound', 404, 'NOT_FOUND'],
    ['conflict', 409, 'CONFLICT'],
    ['validation', 422, 'VALIDATION_ERROR'],
    ['internal', 500, 'INTERNAL_SERVER_ERROR'],
  ] as const)('%s() produces statusCode %i and code %s', (method, statusCode, code) => {
    const err = (AppError as any)[method]('a message');
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(statusCode);
    expect(err.code).toBe(code);
    expect(err.message).toBe('a message');
    expect(err.details).toEqual([]);
  });

  it('carries structured details through to the caller (e.g. validation field errors)', () => {
    const err = AppError.validation('Request validation failed', [
      { field: 'email', message: 'Invalid email format' },
    ]);
    expect(err.details).toEqual([{ field: 'email', message: 'Invalid email format' }]);
  });
});
