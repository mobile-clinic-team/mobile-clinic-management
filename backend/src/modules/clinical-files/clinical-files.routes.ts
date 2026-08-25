// =====================================================================
// Module:  M3 - Clinical Data & Secure Files
// File:    clinical-files.routes.ts
// =====================================================================
import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { asyncHandler } from '../../utils/asyncHandler';
import { clinicalFilesController } from './clinical-files.controller';
import {
  amendMedicalRecordSchema,
  createMedicalRecordSchema,
  requestUploadUrlSchema,
} from './clinical-files.validation';

const router = Router();

// =====================================================================
// Medical Records (EMR) — Immutable
// =====================================================================

/**
 * POST /api/clinical/records
 * Creates the initial medical record (v1) for a completed/in-progress appointment.
 *
 * Authorization: DOCTOR only.
 * Business rules (enforced in Service):
 *   - Only the doctor assigned to the appointment may create its record.
 *   - One record per appointment (DB unique constraint + service guard).
 */
router.post(
  '/clinical/records',
  authenticate,
  authorize('doctor'),
  validate(createMedicalRecordSchema),
  asyncHandler(clinicalFilesController.createRecord),
);

/**
 * POST /api/clinical/records/:id/amend
 * Appends a new amendment version to an existing record.
 *
 * Authorization: DOCTOR only.
 * Business rules:
 *   - Only the record's owning doctor may amend.
 *   - `amendmentReason` is mandatory (EMR audit trail).
 *   - Finalized records cannot be amended.
 *   - Never overwrites original content — always appends a new version row.
 */
router.post(
  '/clinical/records/:id/amend',
  authenticate,
  authorize('doctor'),
  validate(amendMedicalRecordSchema),
  asyncHandler(clinicalFilesController.amendRecord),
);

/**
 * GET /api/clinical/records/:id
 * Returns the full medical record detail with the complete amendment history.
 *
 * Authorization: DOCTOR (own patients), PATIENT (own records), ADMIN (any).
 * Per DEVELOPMENT_CONTRACTS.md: ownership is verified at Service layer.
 */
router.get(
  '/clinical/records/:id',
  authenticate,
  authorize('doctor', 'patient', 'admin'),
  asyncHandler(clinicalFilesController.getRecord),
);

// =====================================================================
// Lab Results — S3 Presigned URLs
// =====================================================================

/**
 * POST /api/clinical/lab-results/upload-url
 * Generates an S3 Presigned PUT URL for file upload.
 * Also creates a `lab_results` row (status=pending) before signing the URL.
 *
 * Authorization: DOCTOR only.
 *
 * Flow:
 *   1. Doctor calls this endpoint with { recordId, testName, fileMimeType }.
 *   2. Backend creates a lab_result row (status=pending) and signs an S3 PUT URL.
 *   3. Android app uses the presigned URL to upload directly to S3.
 *   4. (Optional next step) Doctor calls a separate endpoint to mark as 'uploaded'.
 *
 * Security contract (ARCHITECTURE.md #3.4 & #3.6):
 *   - Android NEVER receives S3 credentials.
 *   - Backend signs all URLs server-side.
 *   - Presigned URL is NEVER stored in the database (short TTL).
 */
router.post(
  '/clinical/lab-results/upload-url',
  authenticate,
  authorize('doctor'),
  validate(requestUploadUrlSchema),
  asyncHandler(clinicalFilesController.requestUploadUrl),
);

/**
 * GET /api/clinical/lab-results/:id/download-url
 * Generates a fresh S3 Presigned GET URL to download a lab result file.
 *
 * Authorization: DOCTOR (own patient's records), PATIENT (own records), ADMIN (any).
 *
 * Security contract:
 *   - A new presigned URL is generated on EVERY request (short TTL = 10 min).
 *   - URL is NEVER stored in DB.
 *   - Only authorized users may trigger URL generation.
 */
router.get(
  '/clinical/lab-results/:id/download-url',
  authenticate,
  authorize('doctor', 'patient', 'admin'),
  asyncHandler(clinicalFilesController.requestDownloadUrl),
);

export { router as clinicalFilesRouter };
