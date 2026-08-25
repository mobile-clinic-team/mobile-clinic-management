// Runs via Jest's `setupFiles`, BEFORE the test framework/test files are
// evaluated - so `src/config/env.ts` (which reads process.env at import
// time) always sees these values, never real/production secrets.
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
// Low salt rounds so bcrypt.hash() in tests runs in milliseconds, not ~100ms+.
process.env.BCRYPT_SALT_ROUNDS = '4';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/mobile_clinic_test';
