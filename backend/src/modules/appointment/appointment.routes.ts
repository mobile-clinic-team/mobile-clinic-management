// =====================================================================
// Module:  M2 - Appointment Engine
// File:    appointment.routes.ts
// =====================================================================
import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { asyncHandler } from '../../utils/asyncHandler';
import { appointmentController } from './appointment.controller';
import {
  cancelAppointmentSchema,
  createAppointmentSchema,
  queryAppointmentsSchema,
} from './appointment.validation';

const router = Router();

// ---------------------------------------------------------------------
// Appointment Engine Endpoints
// ---------------------------------------------------------------------

/**
 * POST /api/appointments
 * Books a new appointment with concurrency lock & Idempotency-Key.
 */
router.post(
  '/appointments',
  authenticate,
  validate(createAppointmentSchema),
  asyncHandler(appointmentController.createAppointment),
);

/**
 * GET /api/appointments
 * Lists appointments for authenticated user (patient / doctor / admin).
 */
router.get(
  '/appointments',
  authenticate,
  validate(queryAppointmentsSchema, 'query'),
  asyncHandler(appointmentController.getAppointments),
);

/**
 * GET /api/appointments/:id
 * Retrieves single appointment details.
 */
router.get(
  '/appointments/:id',
  authenticate,
  asyncHandler(appointmentController.getAppointmentById),
);

/**
 * PATCH /api/appointments/:id/cancel
 * Cancels an appointment.
 */
router.patch(
  '/appointments/:id/cancel',
  authenticate,
  validate(cancelAppointmentSchema),
  asyncHandler(appointmentController.cancelAppointment),
);

export { router as appointmentRouter };
