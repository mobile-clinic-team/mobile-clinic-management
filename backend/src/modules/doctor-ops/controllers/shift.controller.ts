// =====================================================================
// Module:  M4 - Doctor Operations & Master Data
// File:    controllers/shift.controller.ts
// =====================================================================
import { Request, Response } from 'express';
import { asyncHandler } from '../../../utils/asyncHandler'; // Shared Infra
import { sendSuccess } from '../../../utils/ResponseFormatter'; // Shared Infra
import { AppError } from '../../../utils/AppError';
import { ShiftService } from '../services/shift.service';
import { createShiftSchema, listShiftsQuerySchema } from '../dtos/shift.dto';

interface AuthedRequest extends Request {
  user: { userId: number; role: 'patient' | 'doctor' | 'admin'; email: string };
}

const service = new ShiftService();

export const listShiftsForDoctor = asyncHandler(async (req: Request, res: Response) => {
  const doctorId = Number(req.params.id);
  if (!Number.isInteger(doctorId)) throw new AppError(400, 'INVALID_ID', 'id must be an integer');

  const parsed = listShiftsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Invalid query params', parsed.error.issues);
  }

  const shifts = await service.listForDoctor(doctorId, parsed.data);
  sendSuccess(res, shifts);
});

export const registerOwnShift = asyncHandler(async (req: Request, res: Response) => {
  const { user } = req as AuthedRequest;
  if (user.role !== 'doctor') {
    throw new AppError(403, 'FORBIDDEN', 'Only accounts with role=doctor may register shifts');
  }

  const parsed = createShiftSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Invalid shift payload', parsed.error.issues);
  }

  const shift = await service.registerOwnShift(user.userId, parsed.data);
  sendSuccess(res, shift, 201);
});

export const cancelOwnShift = asyncHandler(async (req: Request, res: Response) => {
  const { user } = req as AuthedRequest;
  const shiftId = Number(req.params.shiftId);
  if (!Number.isInteger(shiftId)) throw new AppError(400, 'INVALID_ID', 'shiftId must be an integer');

  if (user.role !== 'doctor') {
    throw new AppError(403, 'FORBIDDEN', 'Only accounts with role=doctor may cancel shifts');
  }

  const shift = await service.cancelOwnShift(user.userId, shiftId);
  sendSuccess(res, shift);
});
