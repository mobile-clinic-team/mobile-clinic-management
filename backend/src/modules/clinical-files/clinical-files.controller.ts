// =====================================================================
// Module:  M3 - Clinical Data & Secure Files
// File:    clinical-files.controller.ts
// =====================================================================
import { Request, Response } from 'express';
import { AppError } from '../../utils/AppError';
import { ClinicalFilesService } from './clinical-files.service';

const service = new ClinicalFilesService();

/**
 * Extracts the authenticated user from req.user (set by authenticate middleware).
 * Throws 401 if not present (defensive guard — should never happen after authenticate runs).
 */
function getAuthUser(req: Request) {
  if (!req.user) {
    throw AppError.unauthorized('Authentication required');
  }
  const userId: number = req.user.sub ?? (req.user as any).userId;
  const role: string = req.user.role;
  return { userId, role };
}

export const clinicalFilesController = {
  /**
   * POST /api/clinical/records
   * Creates the initial medical record (v1) for an appointment.
   * Only the doctor assigned to the appointment may call this.
   */
  async createRecord(req: Request, res: Response) {
    const { userId, role } = getAuthUser(req);
    const record = await service.createMedicalRecord(userId, role, req.body);

    return res.status(201).json({
      success: true,
      data: record,
    });
  },

  /**
   * POST /api/clinical/records/:id/amend
   * Appends a correction version to an existing record.
   * Only the doctor who created the record may amend it.
   * `amendmentReason` is mandatory per EMR audit trail contract.
   */
  async amendRecord(req: Request, res: Response) {
    const { userId, role } = getAuthUser(req);
    const recordId = Number(req.params.id);
    if (!Number.isInteger(recordId) || recordId <= 0) {
      throw AppError.badRequest('id must be a valid positive integer');
    }

    const record = await service.amendMedicalRecord(userId, role, recordId, req.body);

    return res.status(200).json({
      success: true,
      data: record,
    });
  },

  /**
   * GET /api/clinical/records/:id
   * Returns full medical record detail with entire amendment history.
   * Authorized for: the assigned doctor, the patient, or admin.
   */
  async getRecord(req: Request, res: Response) {
    const { userId, role } = getAuthUser(req);
    const recordId = Number(req.params.id);
    if (!Number.isInteger(recordId) || recordId <= 0) {
      throw AppError.badRequest('id must be a valid positive integer');
    }

    const record = await service.getMedicalRecordDetail(userId, role, recordId);

    return res.status(200).json({
      success: true,
      data: record,
    });
  },

  /**
   * POST /api/clinical/lab-results/upload-url
   * Generates an S3 Presigned PUT URL for a doctor to upload a lab result file.
   * Also inserts a `lab_results` row (status=pending) before generating the URL.
   */
  async requestUploadUrl(req: Request, res: Response) {
    const { userId, role } = getAuthUser(req);
    const result = await service.requestUploadUrl(userId, role, req.body);

    return res.status(201).json({
      success: true,
      data: result,
    });
  },

  /**
   * GET /api/clinical/lab-results/:id/download-url
   * Generates a fresh S3 Presigned GET URL on demand.
   * Authorized for: the assigned doctor, the patient, or admin.
   * Presigned URL is NEVER persisted in DB (short TTL, generated per-request).
   */
  async requestDownloadUrl(req: Request, res: Response) {
    const { userId, role } = getAuthUser(req);
    const labResultId = Number(req.params.id);
    if (!Number.isInteger(labResultId) || labResultId <= 0) {
      throw AppError.badRequest('id must be a valid positive integer');
    }

    const result = await service.requestDownloadUrl(userId, role, labResultId);

    return res.status(200).json({
      success: true,
      data: result,
    });
  },
};
