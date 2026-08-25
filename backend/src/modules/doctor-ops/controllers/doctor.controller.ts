// =====================================================================
// Module:  M4 - Doctor Operations & Master Data
// File:    controllers/doctor.controller.ts
// =====================================================================
import { Request, Response } from 'express';
import { asyncHandler } from '../../../utils/asyncHandler'; // Shared Infra
import { sendSuccess } from '../../../utils/ResponseFormatter'; // Shared Infra
import { AppError } from '../../../utils/AppError';
import { DoctorService } from '../services/doctor.service';
import {
  createDoctorProfileSchema,
  listDoctorsQuerySchema,
  updateDoctorProfileSchema,
} from '../dtos/doctor.dto';

// `authenticate` (Shared Infra, owned by M1) is expected to populate
// req.user = { userId, role, email } per DEVELOPMENT_CONTRACTS.md #6.
interface AuthedRequest extends Request {
  user: { userId: number; role: 'patient' | 'doctor' | 'admin'; email: string };
}

const service = new DoctorService();

function authHeader(req: Request): string {
  return req.header('Authorization') ?? '';
}

export const listDoctors = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listDoctorsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Invalid query params', parsed.error.issues);
  }
  const result = await service.list(parsed.data, authHeader(req));
  sendSuccess(res, result.items, 200, { total: result.total, page: result.page, pageSize: result.pageSize });
});

export const getDoctor = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError(400, 'INVALID_ID', 'id must be an integer');
  const doctor = await service.getById(id, authHeader(req));
  sendSuccess(res, doctor);
});

export const createOwnDoctorProfile = asyncHandler(async (req: Request, res: Response) => {
  const { user } = req as AuthedRequest;
  if (user.role !== 'doctor') {
    throw new AppError(403, 'FORBIDDEN', 'Only accounts with role=doctor may create a doctor profile');
  }

  const parsed = createDoctorProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Invalid doctor profile payload', parsed.error.issues);
  }

  const doctor = await service.createOwnProfile(user.userId, parsed.data, authHeader(req));
  sendSuccess(res, doctor, 201);
});

export const updateDoctor = asyncHandler(async (req: Request, res: Response) => {
  const { user } = req as AuthedRequest;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError(400, 'INVALID_ID', 'id must be an integer');

  const parsed = updateDoctorProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Invalid doctor profile payload', parsed.error.issues);
  }

  const doctor = await service.update(id, parsed.data, user, authHeader(req));
  sendSuccess(res, doctor);
});

export const deleteDoctor = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError(400, 'INVALID_ID', 'id must be an integer');
  await service.delete(id);
  sendSuccess(res, { id, deleted: true });
});
