import express, { Express, Router } from 'express';
import { patientIdentityRouter } from '../../src/modules/patient-identity/patient-identity.routes';
import { errorHandler, notFoundHandler } from '../../src/middlewares/errorHandler.middleware';

/**
 * Builds the real Express app (real middleware chain: validation -> auth
 * -> RBAC -> controller -> service). DB/external service boundaries should be mocked.
 */
export function buildTestApp(customRouter?: Router): Express {
  const app = express();
  app.use(express.json());
  app.use('/api', customRouter ?? patientIdentityRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
