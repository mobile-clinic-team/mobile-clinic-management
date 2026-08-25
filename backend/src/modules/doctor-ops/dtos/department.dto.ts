// =====================================================================
// Module:  M4 - Doctor Operations & Master Data
// File:    dtos/department.dto.ts
// Purpose: Zod validation schemas for Department CRUD endpoints.
// =====================================================================
import { z } from 'zod';

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(2, 'name must be at least 2 characters').max(150),
  description: z.string().trim().max(2000).optional().nullable(),
  iconUrl: z.string().trim().url('iconUrl must be a valid URL').max(500).optional().nullable(),
});

export const updateDepartmentSchema = createDepartmentSchema.partial();

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;
