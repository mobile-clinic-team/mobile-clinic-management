// =====================================================================
// Module:  M4 - Doctor Operations & Master Data
// File:    controllers/department.controller.ts
// =====================================================================
import { Request, Response } from 'express';
import { asyncHandler } from '../../../utils/asyncHandler'; // Shared Infra
import { sendSuccess } from '../../../utils/ResponseFormatter'; // Shared Infra
import { AppError } from '../../../utils/AppError';
import { DepartmentService } from '../services/department.service';
import { createDepartmentSchema, updateDepartmentSchema } from '../dtos/department.dto';

const service = new DepartmentService();

export const listDepartments = asyncHandler(async (_req: Request, res: Response) => {
  const departments = await service.list();
  sendSuccess(res, departments);
});

export const getDepartment = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError(400, 'INVALID_ID', 'id must be an integer');
  const department = await service.getById(id);
  sendSuccess(res, department);
});

export const createDepartment = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createDepartmentSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Invalid department payload', parsed.error.issues);
  }
  const department = await service.create(parsed.data);
  sendSuccess(res, department, 201);
});

export const updateDepartment = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError(400, 'INVALID_ID', 'id must be an integer');

  const parsed = updateDepartmentSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Invalid department payload', parsed.error.issues);
  }
  const department = await service.update(id, parsed.data);
  sendSuccess(res, department);
});

export const deleteDepartment = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError(400, 'INVALID_ID', 'id must be an integer');
  await service.delete(id);
  sendSuccess(res, { id, deleted: true });
});
