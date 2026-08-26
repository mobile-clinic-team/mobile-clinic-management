import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { patientIdentityRouter } from './modules/patient-identity/patient-identity.routes';
import { appointmentRouter } from './modules/appointment/appointment.routes';
import doctorOpsRouter from './modules/doctor-ops/doctor-ops.routes';
import { clinicalFilesRouter } from './modules/clinical-files/clinical-files.routes';
import { aiBillingRouter } from './modules/ai-billing/ai-billing.routes';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.middleware';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  // --- Root & System Health Check ----------------------------------
  app.get('/', (_req, res) => {
    res.json({
      success: true,
      message: '🏥 Mobile Clinic Management System API is Running!',
      version: '1.0.0',
      status: 'HEALTHY',
      endpoints: {
        auth: '/api/auth (Login, Register)',
        patients: '/api/patients (Profile)',
        ai_assistant: '/api/ai/chat (Dify AI Gateway)',
        invoices: '/api/invoices (Billing & QR Payment)',
        appointments: '/api/appointments (Booking Engine)',
        doctors: '/api/doctors (Doctor Ops & Shifts)',
        departments: '/api/departments (Master Data)',
        clinical: '/api/clinical/records (EMR & Presigned S3)',
        webhooks: '/api/webhooks/payment (Secure Webhook)',
      },
    });
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'UP', timestamp: new Date().toISOString() });
  });

  // --- M1: Patient & Identity ---------------------------------------
  app.use('/api', patientIdentityRouter);

  // --- M1: AI Assistant & Billing -----------------------------------
  app.use('/api', aiBillingRouter);

  // --- M2: Appointment Engine ---------------------------------------
  app.use('/api', appointmentRouter);

  // --- M4: Doctor Operations & Master Data --------------------------
  app.use('/api', doctorOpsRouter);

  // --- M3: Clinical Data & Secure Files ----------------------------
  app.use('/api', clinicalFilesRouter);


  // 404 + centralized error handler must be registered last, in order.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
