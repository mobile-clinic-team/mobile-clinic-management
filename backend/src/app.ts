import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { patientIdentityRouter } from './modules/patient-identity/patient-identity.routes';
import { appointmentRouter } from './modules/appointment/appointment.routes';
import doctorOpsRouter from './modules/doctor-ops/doctor-ops.routes';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.middleware';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  // --- M1: Patient & Identity ---------------------------------------
  app.use('/api', patientIdentityRouter);

  // --- M2: Appointment Engine ---------------------------------------
  app.use('/api', appointmentRouter);

  // --- M4: Doctor Operations & Master Data --------------------------
  app.use('/api', doctorOpsRouter);

  // --- Other modules mount here (kept separate, no cross-imports) ---
  // app.use('/api', clinicalFilesRouter);     // M3

  // 404 + centralized error handler must be registered last, in order.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
