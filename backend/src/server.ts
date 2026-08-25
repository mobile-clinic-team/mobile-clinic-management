import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { connectRedis } from './config/redis';
import { errorHandler } from './middleware/errorHandler';

import patientRoutes from './modules/patient-identity/patient.routes';
import aiBillingRoutes from './modules/ai-billing/ai-billing.routes';
import appointmentRoutes from './modules/appointment/appointment.routes';
import clinicalRoutes from './modules/clinical-files/clinical.routes';
import doctorOpsRoutes from './modules/doctor-ops/doctor-ops.routes';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
const PORT = process.env.PORT || 3000;

// Shared Middleware
app.use(cors());
app.use(express.json());

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'Mobile Clinic Backend API Gateway',
  });
});

// Fullstack Module Ownership Routes
app.use('/api/auth', patientRoutes);
app.use('/api/ai', aiBillingRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/clinical', clinicalRoutes);
app.use('/api', doctorOpsRoutes);

// Global Error Handler
app.use(errorHandler);

// Connect Redis & Start Server
connectRedis().then(() => {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(` Server running on http://localhost:${PORT}`);
    console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`====================================================`);
  });
});
