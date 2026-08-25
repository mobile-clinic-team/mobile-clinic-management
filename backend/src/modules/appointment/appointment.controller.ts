// =====================================================================
// Module:  M2 - Appointment Engine
// File:    appointment.controller.ts
// =====================================================================
import { Request, Response } from 'express';
import { AppError } from '../../utils/AppError';
import { AppointmentService } from './appointment.service';
import { idempotencyHeaderSchema } from './appointment.validation';

const service = new AppointmentService();

function getAuthUser(req: Request) {
  if (!req.user) {
    throw AppError.unauthorized('Authentication required');
  }
  const userId = req.user.sub ?? (req.user as any).userId;
  const role = req.user.role;
  return { userId, role };
}

export const appointmentController = {
  /**
   * POST /api/appointments
   * Books a new appointment with concurrency locking and idempotency validation.
   */
  async createAppointment(req: Request, res: Response) {
    const { userId } = getAuthUser(req);

    // Validate required Idempotency-Key header
    const rawKey = req.headers['idempotency-key'];
    if (!rawKey || typeof rawKey !== 'string') {
      throw AppError.badRequest('Missing required Idempotency-Key header');
    }

    const keyParse = idempotencyHeaderSchema.safeParse(rawKey);
    if (!keyParse.success) {
      throw new AppError(
        422,
        'INVALID_IDEMPOTENCY_KEY',
        'Idempotency-Key header must be a valid UUIDv4',
        keyParse.error.issues,
      );
    }

    const idempotencyKey = keyParse.data;
    const result = await service.bookAppointment(userId, idempotencyKey, req.body, req.originalUrl);

    return res.status(result.statusCode).json({
      success: true,
      data: result.data,
      meta: result.isCached ? { cached: true } : undefined,
    });
  },

  /**
   * GET /api/appointments
   * Lists appointments filtered by role and optional query parameters.
   */
  async getAppointments(req: Request, res: Response) {
    const { userId, role } = getAuthUser(req);
    const result = await service.listAppointments(userId, role, req.query as any);

    return res.status(200).json({
      success: true,
      data: result,
    });
  },

  /**
   * GET /api/appointments/:id
   * Retrieves single appointment details.
   */
  async getAppointmentById(req: Request, res: Response) {
    const { userId, role } = getAuthUser(req);
    const appointmentId = Number(req.params.id);
    if (!Number.isInteger(appointmentId)) {
      throw AppError.badRequest('id must be a valid integer');
    }

    const result = await service.getAppointmentById(userId, role, appointmentId);

    return res.status(200).json({
      success: true,
      data: result,
    });
  },

  /**
   * PATCH /api/appointments/:id/cancel
   * Cancels an appointment.
   */
  async cancelAppointment(req: Request, res: Response) {
    const { userId, role } = getAuthUser(req);
    const appointmentId = Number(req.params.id);
    if (!Number.isInteger(appointmentId)) {
      throw AppError.badRequest('id must be a valid integer');
    }

    const result = await service.cancelAppointment(userId, role, appointmentId, req.body);

    return res.status(200).json({
      success: true,
      data: result,
    });
  },
};
