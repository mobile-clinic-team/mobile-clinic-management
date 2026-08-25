// =====================================================================
// Module:  M3 - Clinical Data & Secure Files
// File:    clinical-files.repository.ts
// =====================================================================
import { Pool, PoolClient } from 'pg';
import { pool } from '../../config/db';
import {
  LabResultRow,
  MedicalRecordRow,
  MedicalRecordVersionRow,
  PrescriptionRow,
} from './clinical-files.types';

export class ClinicalFilesRepository {
  constructor(private readonly db: Pool | PoolClient = pool) {}

  // -------------------------------------------------------------------
  // Medical Records
  // -------------------------------------------------------------------

  /**
   * Finds a medical record by PK. Returns null if not found or soft-deleted.
   */
  async findRecordById(id: number, client?: PoolClient): Promise<MedicalRecordRow | null> {
    const executor = client ?? this.db;
    const { rows } = await executor.query<MedicalRecordRow>(
      `SELECT id, patient_id, doctor_id, appointment_id,
              initial_diagnosis, initial_symptoms, initial_treatment,
              current_version, status, is_deleted, deleted_at, deleted_by, created_at
         FROM medical_records
        WHERE id = $1 AND is_deleted = FALSE`,
      [id],
    );
    return rows[0] ?? null;
  }

  /**
   * Finds an existing record for an appointment (enforces 1 record per appointment).
   */
  async findRecordByAppointmentId(
    appointmentId: number,
    client?: PoolClient,
  ): Promise<MedicalRecordRow | null> {
    const executor = client ?? this.db;
    const { rows } = await executor.query<MedicalRecordRow>(
      `SELECT id, patient_id, doctor_id, appointment_id,
              initial_diagnosis, initial_symptoms, initial_treatment,
              current_version, status, is_deleted, deleted_at, deleted_by, created_at
         FROM medical_records
        WHERE appointment_id = $1 AND is_deleted = FALSE`,
      [appointmentId],
    );
    return rows[0] ?? null;
  }

  /**
   * Creates the initial medical record (v1). Must be inside a transaction.
   */
  async createRecord(
    patientId: number,
    doctorId: number,
    appointmentId: number,
    initialDiagnosis: string,
    initialSymptoms: string,
    initialTreatment: string | null,
    client: PoolClient,
  ): Promise<MedicalRecordRow> {
    const { rows } = await client.query<MedicalRecordRow>(
      `INSERT INTO medical_records
         (patient_id, doctor_id, appointment_id, initial_diagnosis, initial_symptoms, initial_treatment, current_version, status)
       VALUES ($1, $2, $3, $4, $5, $6, 1, 'active')
       RETURNING id, patient_id, doctor_id, appointment_id,
                 initial_diagnosis, initial_symptoms, initial_treatment,
                 current_version, status, is_deleted, deleted_at, deleted_by, created_at`,
      [patientId, doctorId, appointmentId, initialDiagnosis, initialSymptoms, initialTreatment],
    );
    return rows[0];
  }

  /**
   * Bumps the current_version counter on the master record after an amendment is inserted.
   * Must be called inside the same transaction as insertVersion().
   */
  async incrementRecordVersion(
    recordId: number,
    newVersion: number,
    client: PoolClient,
  ): Promise<void> {
    await client.query(
      `UPDATE medical_records
          SET current_version = $2
        WHERE id = $1`,
      [recordId, newVersion],
    );
  }

  // -------------------------------------------------------------------
  // Medical Record Versions (Amendment History — append-only)
  // -------------------------------------------------------------------

  /**
   * Inserts a new amendment version. Must be inside a transaction.
   * Caller is responsible for computing the correct next version_number.
   */
  async insertVersion(
    recordId: number,
    versionNumber: number,
    diagnosis: string,
    symptoms: string,
    treatmentPlan: string | null,
    amendmentReason: string,
    createdBy: number,
    client: PoolClient,
  ): Promise<MedicalRecordVersionRow> {
    const { rows } = await client.query<MedicalRecordVersionRow>(
      `INSERT INTO medical_record_versions
         (record_id, version_number, diagnosis, symptoms, treatment_plan, amendment_reason, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, record_id, version_number, diagnosis, symptoms,
                 treatment_plan, amendment_reason, created_by, created_at`,
      [recordId, versionNumber, diagnosis, symptoms, treatmentPlan, amendmentReason, createdBy],
    );
    return rows[0];
  }

  /**
   * Returns all amendment versions for a record, ordered ascending by version_number.
   */
  async findVersionsByRecordId(
    recordId: number,
    client?: PoolClient,
  ): Promise<MedicalRecordVersionRow[]> {
    const executor = client ?? this.db;
    const { rows } = await executor.query<MedicalRecordVersionRow>(
      `SELECT id, record_id, version_number, diagnosis, symptoms,
              treatment_plan, amendment_reason, created_by, created_at
         FROM medical_record_versions
        WHERE record_id = $1
        ORDER BY version_number ASC`,
      [recordId],
    );
    return rows;
  }

  // -------------------------------------------------------------------
  // Prescriptions (soft-append-only)
  // -------------------------------------------------------------------

  /**
   * Returns all active (non-superseded) prescriptions for a record.
   */
  async findActivePrescriptionsByRecordId(recordId: number): Promise<PrescriptionRow[]> {
    const { rows } = await this.db.query<PrescriptionRow>(
      `SELECT id, record_id, medicine_name, dosage, frequency, duration_days,
              instructions, is_superseded, supersedes_id, prescribed_by, created_at
         FROM prescriptions
        WHERE record_id = $1 AND is_superseded = FALSE
        ORDER BY created_at ASC`,
      [recordId],
    );
    return rows;
  }

  // -------------------------------------------------------------------
  // Lab Results (soft-append-only)
  // -------------------------------------------------------------------

  /**
   * Inserts a new lab_results row in 'pending' status.
   * Returns the row (including the generated ID used to build the presigned URL).
   */
  async createLabResult(
    recordId: number,
    testName: string,
    s3ObjectKey: string,
    fileMimeType: string | null,
    fileSizeBytes: number | null,
    orderedBy: number,
  ): Promise<LabResultRow> {
    const { rows } = await this.db.query<LabResultRow>(
      `INSERT INTO lab_results
         (record_id, test_name, s3_object_key, file_mime_type, file_size_bytes, ordered_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING id, record_id, test_name, s3_object_key, file_mime_type, file_size_bytes,
                 result_notes, status, is_superseded, supersedes_id,
                 ordered_by, reviewed_by, reviewed_at, created_at, updated_at`,
      [recordId, testName, s3ObjectKey, fileMimeType, fileSizeBytes, orderedBy],
    );
    return rows[0];
  }

  /**
   * Finds a single lab_result by PK. Returns null if not found.
   */
  async findLabResultById(id: number): Promise<LabResultRow | null> {
    const { rows } = await this.db.query<LabResultRow>(
      `SELECT id, record_id, test_name, s3_object_key, file_mime_type, file_size_bytes,
              result_notes, status, is_superseded, supersedes_id,
              ordered_by, reviewed_by, reviewed_at, created_at, updated_at
         FROM lab_results
        WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  /**
   * Returns all active (non-superseded) lab results for a record.
   */
  async findActiveLabResultsByRecordId(recordId: number): Promise<LabResultRow[]> {
    const { rows } = await this.db.query<LabResultRow>(
      `SELECT id, record_id, test_name, s3_object_key, file_mime_type, file_size_bytes,
              result_notes, status, is_superseded, supersedes_id,
              ordered_by, reviewed_by, reviewed_at, created_at, updated_at
         FROM lab_results
        WHERE record_id = $1 AND is_superseded = FALSE
        ORDER BY created_at ASC`,
      [recordId],
    );
    return rows;
  }

  // -------------------------------------------------------------------
  // Cross-module read helpers (avoid direct table queries of other modules)
  // -------------------------------------------------------------------

  /**
   * Reads appointment to extract patient_id and doctor_id.
   * Per DEVELOPMENT_CONTRACTS.md: M3 may read appointments to verify ownership,
   * but must NOT query M1/M4 tables directly for business logic.
   */
  async findAppointmentById(
    appointmentId: number,
    client?: PoolClient,
  ): Promise<{ id: number; patient_id: number; doctor_id: number; status: string } | null> {
    const executor = client ?? this.db;
    const { rows } = await executor.query(
      `SELECT id, patient_id, doctor_id, status
         FROM appointments
        WHERE id = $1`,
      [appointmentId],
    );
    return rows[0] ?? null;
  }

  /**
   * Resolves doctor.id from users.id (needed for ownership checks).
   */
  async findDoctorIdByUserId(userId: number): Promise<number | null> {
    const { rows } = await this.db.query<{ id: number }>(
      `SELECT id FROM doctors WHERE user_id = $1`,
      [userId],
    );
    return rows[0]?.id ?? null;
  }
}
