// =====================================================================
// Module:  M4 - Doctor Operations & Master Data
// File:    controllers/rating.controller.ts
// =====================================================================
import { Request, Response } from 'express';
import { asyncHandler } from '../../../utils/asyncHandler'; // Shared Infra
import { sendSuccess } from '../../../utils/ResponseFormatter'; // Shared Infra
import { AppError } from '../../../utils/AppError';
import { RatingService } from '../services/rating.service';
import { createRatingSchema, listRatingsQuerySchema, updateRatingSchema } from '../dtos/rating.dto';

interface AuthedRequest extends Request {
  user: { userId: number; role: 'patient' | 'doctor' | 'admin'; email: string };
}

const service = new RatingService();

function authHeader(req: Request): string {
  return req.header('Authorization') ?? '';
}

export const submitRating = asyncHandler(async (req: Request, res: Response) => {
  const { user } = req as AuthedRequest;
  const doctorId = Number(req.params.id);
  if (!Number.isInteger(doctorId)) throw new AppError(400, 'INVALID_ID', 'id must be an integer');

  if (user.role !== 'patient') {
    throw new AppError(403, 'FORBIDDEN', 'Only patients may submit a doctor rating');
  }

  const parsed = createRatingSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Invalid rating payload', parsed.error.issues);
  }

  const rating = await service.submit(doctorId, user.userId, parsed.data, authHeader(req));
  sendSuccess(res, rating, 201);
});

export const updateRating = asyncHandler(async (req: Request, res: Response) => {
  const { user } = req as AuthedRequest;
  const ratingId = Number(req.params.ratingId);
  if (!Number.isInteger(ratingId)) throw new AppError(400, 'INVALID_ID', 'ratingId must be an integer');

  const parsed = updateRatingSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Invalid rating payload', parsed.error.issues);
  }

  const rating = await service.update(ratingId, user.userId, parsed.data);
  sendSuccess(res, rating);
});

export const listRatingsForDoctor = asyncHandler(async (req: Request, res: Response) => {
  const doctorId = Number(req.params.id);
  if (!Number.isInteger(doctorId)) throw new AppError(400, 'INVALID_ID', 'id must be an integer');

  const parsed = listRatingsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Invalid query params', parsed.error.issues);
  }

  const result = await service.listForDoctor(doctorId, parsed.data);
  sendSuccess(res, { items: result.items, stats: result.stats }, 200, {
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  });
});
