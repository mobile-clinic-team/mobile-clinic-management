// =====================================================================
// Module:  M3 - Clinical Data & Secure Files
// File:    clinical-files.service.ts
// =====================================================================
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { pool, withTransaction } from '../../config/db';
import { env } from '../../config/env';
import { AppError } from '../../utils/AppError';
import { ClinicalFilesRepository } from './clinical-files.repository';
import {
  AmendMedicalRecordInput,
  CreateMedicalRecordInput,
  DownloadUrlResponseDTO,
  LabResultDTO,
  LabResultRow,
  MedicalRecordDetailDTO,
  MedicalRecordVersionDTO,
  MedicalRecordVersionRow,
  PrescriptionDTO,
  PrescriptionRow,
  RequestUploadUrlInput,
  UploadUrlResponseDTO,
} from './clinical-files.types';

// S3 config — helper function to initialize S3 client
function getS3(): S3Client {
  return new S3Client({
    region: env.s3.region,
    credentials: {
      accessKeyId: env.s3.accessKeyId,
      secretAccessKey: env.s3.secretAccessKey,
    },
  });
}

const PRESIGNED_UPLOAD_TTL_SECONDS = 300;    // 5 min for upload
const PRESIGNED_DOWNLOAD_TTL_SECONDS = 600;  // 10 min for download

// ------- Mappers (DB row → DTO) -------

function toVersionDTO(row: MedicalRecordVersionRow): MedicalRecordVersionDTO {
  return {
    versionNumber: row.version_number,
    diagnosis: row.diagnosis,
    symptoms: row.symptoms,
    treatmentPlan: row.treatment_plan,
    amendmentReason: row.amendment_reason,
    amendedBy: row.created_by,
    amendedAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : new Date(row.created_at).toISOString(),
  };
}

function toPrescriptionDTO(row: PrescriptionRow): PrescriptionDTO {
  return {
    id: row.id,
    medicineName: row.medicine_name,
    dosage: row.dosage,
    frequency: row.frequency,
    durationDays: row.duration_days,
    instructions: row.instructions,
    isSuperseded: row.is_superseded,
    prescribedBy: row.prescribed_by,
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : new Date(row.created_at).toISOString(),
  };
}

function toLabResultDTO(row: LabResultRow): LabResultDTO {
  return {
    id: row.id,
    testName: row.test_name,
    fileMimeType: row.file_mime_type,
    fileSizeBytes: row.file_size_bytes,
    resultNotes: row.result_notes,
    status: row.status,
    isSuperseded: row.is_superseded,
    orderedBy: row.ordered_by,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at
      ? (row.reviewed_at instanceof Date
        ? row.reviewed_at.toISOString()
        : new Date(row.reviewed_at).toISOString())
      : null,
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : new Date(row.created_at).toISOString(),
  };
}

export class ClinicalFilesService {
  constructor(
    private readonly repo: ClinicalFilesRepository = new ClinicalFilesRepository(),
    private readonly dbPool: Pool = pool,
  ) {}

  // -------------------------------------------------------------------
  // Helper: resolve doctor.id from users.id and verify authorization
  // -------------------------------------------------------------------

  private async resolveDoctorId(userId: number): Promise<number> {
    const doctorId = await this.repo.findDoctorIdByUserId(userId);
    if (!doctorId) {
      throw AppError.forbidden('Only registered doctors may perform this action');
    }
    return doctorId;
  }

  /**
   * Verifies that the calling user is authorized to ACCESS a specific medical record.
   * - Doctors: must be the doctor who created the record.
   * - Patients: must be the patient on the record.
   * Returns the record row if authorized, throws 403/404 otherwise.
   */
  private async authorizeRecordAccess(recordId: number, userId: number, role: string) {
    const record = await this.repo.findRecordById(recordId);
    if (!record) {
      throw AppError.notFound(`Medical record ${recordId} not found`);
    }

    if (role === 'patient') {
      if (record.patient_id !== userId) {
        throw AppError.forbidden('You are not authorized to access this medical record');
      }
    } else if (role === 'doctor') {
      const doctorId = await this.resolveDoctorId(userId);
      if (record.doctor_id !== doctorId) {
        throw AppError.forbidden('You are not authorized to access this medical record');
      }
    }
    // admin has unrestricted access

    return record;
  }

  // -------------------------------------------------------------------
  // 1. POST /api/clinical/records — Create medical record (v1)
  // -------------------------------------------------------------------

  async createMedicalRecord(
    userId: number,
    role: string,
    input: CreateMedicalRecordInput,
  ): Promise<MedicalRecordDetailDTO> {
    // Only doctors can create records
    if (role !== 'doctor') {
      throw AppError.forbidden('Only doctors may create medical records');
    }
    const doctorId = await this.resolveDoctorId(userId);

    // Validate appointment exists and belongs to this doctor
    const appointment = await this.repo.findAppointmentById(input.appointmentId);
    if (!appointment) {
      throw AppError.notFound(`Appointment ${input.appointmentId} not found`);
    }
    if (appointment.doctor_id !== doctorId) {
      throw AppError.forbidden('You are not the doctor assigned to this appointment');
    }
    if (appointment.status === 'CANCELLED') {
      throw AppError.conflict('Cannot create a medical record for a cancelled appointment');
    }

    // Enforce one-record-per-appointment constraint at service layer
    const existing = await this.repo.findRecordByAppointmentId(input.appointmentId);
    if (existing) {
      throw AppError.conflict(
        `A medical record already exists for appointment ${input.appointmentId}. Use /amend to make corrections.`,
      );
    }

    // Atomic: create record inside a transaction
    const record = await withTransaction(async (client) => {
      return this.repo.createRecord(
        appointment.patient_id,
        doctorId,
        input.appointmentId,
        input.initialDiagnosis,
        input.initialSymptoms,
        input.initialTreatment ?? null,
        client,
      );
    });

    return this.buildDetailDTO(record, [], [], []);
  }

  // -------------------------------------------------------------------
  // 2. POST /api/clinical/records/:id/amend — Amend (new version)
  // -------------------------------------------------------------------

  async amendMedicalRecord(
    userId: number,
    role: string,
    recordId: number,
    input: AmendMedicalRecordInput,
  ): Promise<MedicalRecordDetailDTO> {
    // Only doctors can amend
    if (role !== 'doctor') {
      throw AppError.forbidden('Only doctors may amend medical records');
    }
    const doctorId = await this.resolveDoctorId(userId);

    const record = await this.repo.findRecordById(recordId);
    if (!record) {
      throw AppError.notFound(`Medical record ${recordId} not found`);
    }
    if (record.doctor_id !== doctorId) {
      throw AppError.forbidden('You are not authorized to amend this medical record');
    }
    if (record.status === 'finalized') {
      throw AppError.conflict(
        'This medical record has been finalized and cannot be amended. Contact an administrator.',
      );
    }

    // Compute the next version_number atomically inside a transaction
    await withTransaction(async (client) => {
      const nextVersion = record.current_version + 1;

      await this.repo.insertVersion(
        recordId,
        nextVersion,
        input.diagnosis,
        input.symptoms,
        input.treatmentPlan ?? null,
        input.amendmentReason,
        userId,  // created_by = user who submitted the amendment
        client,
      );

      await this.repo.incrementRecordVersion(recordId, nextVersion, client);
    });

    // Re-fetch and return the full updated record
    return this.getMedicalRecordDetail(userId, role, recordId);
  }

  // -------------------------------------------------------------------
  // 3. GET /api/clinical/records/:id — Get full record detail + history
  // -------------------------------------------------------------------

  async getMedicalRecordDetail(
    userId: number,
    role: string,
    recordId: number,
  ): Promise<MedicalRecordDetailDTO> {
    const record = await this.authorizeRecordAccess(recordId, userId, role);

    // Fetch all related data in parallel
    const [versions, prescriptions, labResults] = await Promise.all([
      this.repo.findVersionsByRecordId(recordId),
      this.repo.findActivePrescriptionsByRecordId(recordId),
      this.repo.findActiveLabResultsByRecordId(recordId),
    ]);

    return this.buildDetailDTO(record, versions, prescriptions, labResults);
  }

  // -------------------------------------------------------------------
  // 4. POST /api/clinical/lab-results/upload-url — S3 Presigned PUT URL
  // -------------------------------------------------------------------

  async requestUploadUrl(
    userId: number,
    role: string,
    input: RequestUploadUrlInput,
  ): Promise<UploadUrlResponseDTO> {
    // Only doctors may order lab tests and upload results
    if (role !== 'doctor') {
      throw AppError.forbidden('Only doctors may request lab result upload URLs');
    }
    const doctorId = await this.resolveDoctorId(userId);

    // Verify the doctor owns the record being attached to
    const record = await this.repo.findRecordById(input.recordId);
    if (!record) {
      throw AppError.notFound(`Medical record ${input.recordId} not found`);
    }
    if (record.doctor_id !== doctorId) {
      throw AppError.forbidden('You are not authorized to add lab results to this medical record');
    }
    if (record.status === 'finalized') {
      throw AppError.conflict('Cannot upload lab results to a finalized medical record');
    }

    // Build a deterministic, unguessable S3 object key
    const fileExt = mimeToExt(input.fileMimeType);
    const s3Key = `clinical/lab-results/${record.patient_id}/${input.recordId}/${randomUUID()}${fileExt}`;

    // Persist the lab_result row FIRST (before generating the URL) so we
    // have a record ID to associate with the upload.
    const labResult = await this.repo.createLabResult(
      input.recordId,
      input.testName,
      s3Key,
      input.fileMimeType,
      input.fileSizeBytes ?? null,
      doctorId,
    );

    // Generate presigned PUT URL
    const s3 = getS3();
    const command = new PutObjectCommand({
      Bucket: env.s3.bucket,
      Key: s3Key,
      ContentType: input.fileMimeType,
    });
    const uploadUrl = await getSignedUrl(s3, command, {
      expiresIn: PRESIGNED_UPLOAD_TTL_SECONDS,
    });

    return {
      labResultId: labResult.id,
      uploadUrl,
      s3ObjectKey: s3Key,
      expiresInSeconds: PRESIGNED_UPLOAD_TTL_SECONDS,
    };
  }

  // -------------------------------------------------------------------
  // 5. GET /api/clinical/lab-results/:id/download-url — S3 Presigned GET URL
  // -------------------------------------------------------------------

  async requestDownloadUrl(
    userId: number,
    role: string,
    labResultId: number,
  ): Promise<DownloadUrlResponseDTO> {
    const labResult = await this.repo.findLabResultById(labResultId);
    if (!labResult) {
      throw AppError.notFound(`Lab result ${labResultId} not found`);
    }

    if (labResult.status === 'pending') {
      throw AppError.conflict(
        'This lab result file has not been uploaded yet. Please upload the file first.',
      );
    }

    // Fetch the parent record to perform ownership authorization
    const record = await this.repo.findRecordById(labResult.record_id);
    if (!record) {
      // Should never happen due to FK, but guard defensively
      throw AppError.notFound('Associated medical record not found');
    }

    // Authorization: patient → own record; doctor → own patient's record; admin → any
    if (role === 'patient') {
      if (record.patient_id !== userId) {
        throw AppError.forbidden('You are not authorized to download this lab result');
      }
    } else if (role === 'doctor') {
      const doctorId = await this.resolveDoctorId(userId);
      if (record.doctor_id !== doctorId) {
        throw AppError.forbidden('You are not authorized to download this lab result');
      }
    }

    // Generate a fresh presigned GET URL — NEVER stored in DB (has short TTL)
    const s3 = getS3();
    const command = new GetObjectCommand({
      Bucket: env.s3.bucket,
      Key: labResult.s3_object_key,
    });
    const downloadUrl = await getSignedUrl(s3, command, {
      expiresIn: PRESIGNED_DOWNLOAD_TTL_SECONDS,
    });

    return {
      labResultId,
      downloadUrl,
      expiresInSeconds: PRESIGNED_DOWNLOAD_TTL_SECONDS,
    };
  }

  // -------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------

  /**
   * Builds the full MedicalRecordDetailDTO.
   * The "current" content is either the latest amendment version (if any)
   * or the initial snapshot from the master record.
   */
  private buildDetailDTO(
    record: import('./clinical-files.types').MedicalRecordRow,
    versions: import('./clinical-files.types').MedicalRecordVersionRow[],
    prescriptions: PrescriptionRow[],
    labResults: LabResultRow[],
  ): MedicalRecordDetailDTO {
    // The most-current content comes from the latest version, or falls back to initial values
    const latestVersion = versions.length > 0 ? versions[versions.length - 1] : null;

    return {
      id: record.id,
      patientId: record.patient_id,
      doctorId: record.doctor_id,
      appointmentId: record.appointment_id,
      currentVersion: record.current_version,
      status: record.status,
      diagnosis: latestVersion?.diagnosis ?? record.initial_diagnosis,
      symptoms: latestVersion?.symptoms ?? record.initial_symptoms,
      treatmentPlan: latestVersion?.treatment_plan ?? record.initial_treatment,
      versions: versions.map(toVersionDTO),
      prescriptions: prescriptions.map(toPrescriptionDTO),
      labResults: labResults.map(toLabResultDTO),
      createdAt: record.created_at instanceof Date
        ? record.created_at.toISOString()
        : new Date(record.created_at).toISOString(),
    };
  }
}

// ------- Utility: map MIME type to file extension -------
function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'application/pdf': '.pdf',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/dicom': '.dcm',
    'application/dicom': '.dcm',
    'image/tiff': '.tiff',
  };
  return map[mime.toLowerCase()] ?? '';
}
