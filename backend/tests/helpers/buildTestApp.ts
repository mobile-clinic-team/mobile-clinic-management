import express, { Express } from 'express';
import { patientIdentityRouter } from '../../src/modules/patient-identity/patient-identity.routes';
import { errorHandler, notFoundHandler } from '../../src/middlewares/errorHandler.middleware';

/**
 * Builds the real Express app (real middleware chain: validation -> auth
 * -> RBAC -> controller -> service), but the DB boundary
 * (patient-identity.repository + config/db) must already be mocked via
 * `jest.mock(...)` in the calling test file BEFORE this is imported,
 * so requests never hit a real Postgres instance.
 */
export function buildTestApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api', patientIdentityRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
