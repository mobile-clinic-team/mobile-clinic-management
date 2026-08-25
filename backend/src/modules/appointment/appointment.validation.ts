// =====================================================================
// Module:  M2 - Appointment Engine
// File:    appointment.validation.ts
// =====================================================================
import { z } from 'zod';

export const createAppointmentSchema = z.object({
  doctorId: z.number().int().positive({ message: 'doctorId must be a positive integer' }),
  shiftId: z.number().int().positive({ message: 'shiftId must be a positive integer' }),
  startTime: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'startTime must be a valid date/time string',
  }),
  endTime: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), {
      message: 'endTime must be a valid date/time string',
    })
    .optional(),
  reason: z.string().max(1000, 'reason must not exceed 1000 characters').optional(),
});

export const cancelAppointmentSchema = z.object({
  cancelReason: z.string().max(500, 'cancelReason must not exceed 500 characters').optional(),
});

export const queryAppointmentsSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED']).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be in YYYY-MM-DD format' }).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  doctorId: z.coerce.number().int().positive().optional(),
  patientId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20).optional(),
  offset: z.coerce.number().int().min(0).default(0).optional(),
});

export const idempotencyHeaderSchema = z.string().uuid({
  message: 'Idempotency-Key header must be a valid UUIDv4 string',
});
