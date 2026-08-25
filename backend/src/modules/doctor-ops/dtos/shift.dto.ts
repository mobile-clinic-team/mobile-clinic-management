// =====================================================================
// Module:  M4 - Doctor Operations & Master Data
// File:    dtos/shift.dto.ts
// Purpose: Zod validation schemas for Doctor Working Shift endpoints.
// =====================================================================
import { z } from 'zod';

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/; // HH:mm or HH:mm:ss

export const createShiftSchema = z
  .object({
    shiftDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'shiftDate must be YYYY-MM-DD'),
    startTime: z.string().regex(timeRegex, 'startTime must be HH:mm'),
    endTime: z.string().regex(timeRegex, 'endTime must be HH:mm'),
    slotDurationMinutes: z.number().int().positive().max(240).default(30),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: 'endTime must be after startTime',
    path: ['endTime'],
  })
  .refine(
    (data) => {
      const shiftDate = new Date(`${data.shiftDate}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return shiftDate >= today;
    },
    { message: 'shiftDate cannot be in the past', path: ['shiftDate'] }
  );

export const listShiftsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  onlyActive: z
    .string()
    .optional()
    .transform((v) => v !== 'false'), // default true unless explicitly "false"
});

export type CreateShiftInput = z.infer<typeof createShiftSchema>;
export type ListShiftsQuery = z.infer<typeof listShiftsQuerySchema>;
