import {
  toPublicUser,
  toPublicProfile,
} from '../../src/modules/patient-identity/patient-identity.types';
import { errorHandler } from '../../src/middlewares/errorHandler.middleware';
import { AppError } from '../../src/utils/AppError';
import { makeUserRow, makeProfileRow } from '../helpers/fixtures';

// `src/config/env.ts` reads process.env.NODE_ENV once, at import time, and
// caches it on the `env` object. To exercise the "production" branch of
// errorHandler we must flip NODE_ENV and re-import both `env` and the
// middleware in an isolated module registry, rather than mutating
// process.env after they've already been imported/cached above.
function buildErrorHandlerWithNodeEnv(nodeEnv: string) {
  let handler!: typeof errorHandler;
  jest.isolateModules(() => {
    process.env.NODE_ENV = nodeEnv;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    handler = require('../../src/middlewares/errorHandler.middleware').errorHandler;
  });
  return handler;
}

describe('PII compliance - DB row -> public DTO mapping', () => {
  it('toPublicUser strips password_hash and every other field not explicitly whitelisted', () => {
    const row = makeUserRow();
    const publicUser = toPublicUser(row);

    expect(publicUser).toEqual({
      id: row.id,
      email: row.email,
      role: row.role,
      isActive: row.is_active,
    });
    expect(Object.keys(publicUser)).not.toContain('password_hash');
    expect(JSON.stringify(publicUser)).not.toContain(row.password_hash);
  });

  it('toPublicProfile does not silently forward unexpected/extra columns (e.g. future sensitive fields)', () => {
    const row = makeProfileRow();
    const publicProfile = toPublicProfile(row);

    // Explicit whitelist assertion: adding a new sensitive column to the
    // `patient_profiles` table (e.g. national_id) must NOT automatically
    // appear in API responses just because it exists on the row.
    expect(Object.keys(publicProfile).sort()).toEqual(
      ['address', 'dob', 'fullName', 'gender', 'id', 'phoneNumber', 'userId'].sort(),
    );
  });

  it('mapping is resilient to a row carrying an unexpected extra sensitive field', () => {
    const rowWithLeakedField = {
      ...makeUserRow(),
      // Simulates a hypothetical future column (e.g. a national ID or SSN)
      // being added to the `users` table without updating this mapper.
      national_id: '079123456789',
    } as any;

    const publicUser = toPublicUser(rowWithLeakedField);

    expect(JSON.stringify(publicUser)).not.toContain('079123456789');
  });
});

describe('PII compliance - centralized error handler never leaks internals', () => {
  function mockRes() {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  }

  it('in production mode, an unexpected internal error does NOT leak the raw error message/stack (which could contain SQL, file paths, or PII from a query)', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const originalEnv = process.env.NODE_ENV;
    const prodErrorHandler = buildErrorHandlerWithNodeEnv('production');

    // Simulate a raw pg error that might contain query fragments/PII.
    const rawDbError = new Error(
      'duplicate key value violates unique constraint "uq_users_email" DETAIL: Key (email)=(leaked@example.com) already exists.',
    );

    const res = mockRes();
    prodErrorHandler(rawDbError, {} as any, res, jest.fn());

    const payload = res.json.mock.calls[0][0];
    expect(payload.error.message).not.toContain('leaked@example.com');
    expect(payload.error.message).not.toContain('uq_users_email');
    expect(payload.error.code).toBe('INTERNAL_SERVER_ERROR');

    process.env.NODE_ENV = originalEnv;
    consoleErrorSpy.mockRestore();
  });

  it('AppError-based responses only ever expose the fields the developer explicitly set (code/message/details), never a stack trace', () => {
    const res = mockRes();
    const err = AppError.notFound('Patient profile not found');

    errorHandler(err, {} as any, res, jest.fn());

    const payload = res.json.mock.calls[0][0];
    expect(payload).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Patient profile not found', details: [] },
    });
    expect(payload.error).not.toHaveProperty('stack');
  });
});

describe('PII compliance - password handling invariants', () => {
  it('a UserRow fixture with a bcrypt hash never resembles a plaintext password', () => {
    const row = makeUserRow();
    // Defensive sanity check on the test fixture itself: bcrypt hashes
    // always start with a recognizable version prefix.
    expect(row.password_hash).toMatch(/^\$2[aby]?\$\d{2}\$/);
  });
});
