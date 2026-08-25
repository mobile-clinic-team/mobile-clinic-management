// =====================================================================
// Module:  M4 - Doctor Operations & Master Data
// File:    dtos/rating.dto.ts
// Purpose: Zod validation schemas for Doctor Rating endpoints.
//          NOTE: backed by `doctor_ratings` table, created in
//          006_mod4_doctor_ratings.sql (runs AFTER 003_mod2_appointments).
// =====================================================================
import { z } from 'zod';

export const createRatingSchema = z.object({
  appointmentId: z.number().int().positive(),
  ratingStars: z.number().int().min(1).max(5),
  reviewComment: z.string().trim().max(2000).optional().nullable(),
});

export const updateRatingSchema = z.object({
  ratingStars: z.number().int().min(1).max(5).optional(),
  reviewComment: z.string().trim().max(2000).optional().nullable(),
});

export const listRatingsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateRatingInput = z.infer<typeof createRatingSchema>;
export type UpdateRatingInput = z.infer<typeof updateRatingSchema>;
export type ListRatingsQuery = z.infer<typeof listRatingsQuerySchema>;
