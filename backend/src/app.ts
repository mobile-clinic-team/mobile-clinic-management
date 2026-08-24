import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { patientIdentityRouter } from './modules/patient-identity/patient-identity.routes';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.middleware';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  // --- M1: Patient & Identity ---------------------------------------
  app.use('/api', patientIdentityRouter);

  // --- Other modules mount here (kept separate, no cross-imports) ---
  // app.use('/api', appointmentRouter);       // M2
  // app.use('/api', clinicalFilesRouter);     // M3
  // app.use('/api', doctorOpsRouter);         // M4

  // 404 + centralized error handler must be registered last, in order.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
