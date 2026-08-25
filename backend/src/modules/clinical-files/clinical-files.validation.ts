// =====================================================================
// Module:  M3 - Clinical Data & Secure Files
// File:    clinical-files.validation.ts
// =====================================================================
import { z } from 'zod';

// POST /api/clinical/records
export const createMedicalRecordSchema = z.object({
  appointmentId: z.number().int().positive({ message: 'appointmentId must be a positive integer' }),
  initialDiagnosis: z.string().min(5, 'initialDiagnosis must be at least 5 characters').max(5000),
  initialSymptoms: z.string().min(3, 'initialSymptoms must be at least 3 characters').max(3000),
  initialTreatment: z.string().max(5000).optional(),
});

// POST /api/clinical/records/:id/amend
export const amendMedicalRecordSchema = z.object({
  diagnosis: z.string().min(5, 'diagnosis must be at least 5 characters').max(5000),
  symptoms: z.string().min(3, 'symptoms must be at least 3 characters').max(3000),
  treatmentPlan: z.string().max(5000).optional(),
  // amendmentReason is MANDATORY per EMR audit trail contract
  amendmentReason: z.string()
    .min(10, 'amendmentReason must be at least 10 characters to ensure meaningful audit trail')
    .max(1000),
});

// POST /api/clinical/lab-results/upload-url
export const requestUploadUrlSchema = z.object({
  recordId: z.number().int().positive({ message: 'recordId must be a positive integer' }),
  testName: z.string().min(3, 'testName must be at least 3 characters').max(200),
  fileMimeType: z.string().regex(
    /^[a-zA-Z]+\/[a-zA-Z0-9.+\-]+$/,
    'fileMimeType must be a valid MIME type (e.g. application/pdf, image/jpeg)',
  ),
  fileSizeBytes: z.number().int().positive().max(
    100 * 1024 * 1024,  // 100 MB max
    'fileSizeBytes must not exceed 100MB',
  ).optional(),
});
