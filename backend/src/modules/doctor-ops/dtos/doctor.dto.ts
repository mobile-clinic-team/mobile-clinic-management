// =====================================================================
// Module:  M4 - Doctor Operations & Master Data
// File:    dtos/doctor.dto.ts
// Purpose: Zod validation schemas for Doctor profile endpoints.
// =====================================================================
import { z } from 'zod';

export const createDoctorProfileSchema = z.object({
  departmentId: z.number().int().positive(),
  bio: z.string().trim().max(4000).optional().nullable(),
  consultationFee: z.number().min(0).max(1_000_000_000).default(0),
});

export const updateDoctorProfileSchema = z.object({
  departmentId: z.number().int().positive().optional(),
  bio: z.string().trim().max(4000).optional().nullable(),
  consultationFee: z.number().min(0).max(1_000_000_000).optional(),
});

export const listDoctorsQuerySchema = z.object({
  departmentId: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(150).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateDoctorProfileInput = z.infer<typeof createDoctorProfileSchema>;
export type UpdateDoctorProfileInput = z.infer<typeof updateDoctorProfileSchema>;
export type ListDoctorsQuery = z.infer<typeof listDoctorsQuerySchema>;
