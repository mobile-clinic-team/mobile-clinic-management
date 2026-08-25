// =====================================================================
// Module:  M3 - Clinical Data & Secure Files
// File:    clinical-files.types.ts
// =====================================================================

// ------- DB Row shapes (match column names in 004_mod3_clinical_files.sql) -------

export type RecordStatus = 'active' | 'finalized';
export type LabResultStatus = 'pending' | 'uploaded' | 'reviewed';

export interface MedicalRecordRow {
  id: number;
  patient_id: number;
  doctor_id: number;
  appointment_id: number;
  initial_diagnosis: string;
  initial_symptoms: string;
  initial_treatment: string | null;
  current_version: number;
  status: RecordStatus;
  is_deleted: boolean;
  deleted_at: Date | null;
  deleted_by: number | null;
  created_at: Date;
}

export interface MedicalRecordVersionRow {
  id: number;
  record_id: number;
  version_number: number;
  diagnosis: string;
  symptoms: string;
  treatment_plan: string | null;
  amendment_reason: string;
  created_by: number;
  created_at: Date;
}

export interface PrescriptionRow {
  id: number;
  record_id: number;
  medicine_name: string;
  dosage: string;
  frequency: string;
  duration_days: number;
  instructions: string | null;
  is_superseded: boolean;
  supersedes_id: number | null;
  prescribed_by: number;
  created_at: Date;
}

export interface LabResultRow {
  id: number;
  record_id: number;
  test_name: string;
  s3_object_key: string;
  file_mime_type: string | null;
  file_size_bytes: number | null;
  result_notes: string | null;
  status: LabResultStatus;
  is_superseded: boolean;
  supersedes_id: number | null;
  ordered_by: number;
  reviewed_by: number | null;
  reviewed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ------- Input DTOs (received from Controller / Validation) -------

export interface CreateMedicalRecordInput {
  appointmentId: number;
  initialDiagnosis: string;
  initialSymptoms: string;
  initialTreatment?: string;
}

export interface AmendMedicalRecordInput {
  diagnosis: string;
  symptoms: string;
  treatmentPlan?: string;
  amendmentReason: string;
}

export interface RequestUploadUrlInput {
  recordId: number;
  testName: string;
  fileMimeType: string;
  fileSizeBytes?: number;
}

// ------- Output DTOs (returned to client) -------

export interface MedicalRecordVersionDTO {
  versionNumber: number;
  diagnosis: string;
  symptoms: string;
  treatmentPlan: string | null;
  amendmentReason: string;
  amendedBy: number;
  amendedAt: string;
}

export interface PrescriptionDTO {
  id: number;
  medicineName: string;
  dosage: string;
  frequency: string;
  durationDays: number;
  instructions: string | null;
  isSuperseded: boolean;
  prescribedBy: number;
  createdAt: string;
}

export interface LabResultDTO {
  id: number;
  testName: string;
  fileMimeType: string | null;
  fileSizeBytes: number | null;
  resultNotes: string | null;
  status: LabResultStatus;
  isSuperseded: boolean;
  orderedBy: number;
  reviewedBy: number | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface MedicalRecordDetailDTO {
  id: number;
  patientId: number;
  doctorId: number;
  appointmentId: number;
  currentVersion: number;
  status: RecordStatus;
  // Snapshot of the most-current content (initial or latest amendment)
  diagnosis: string;
  symptoms: string;
  treatmentPlan: string | null;
  // Full amendment history (append-only)
  versions: MedicalRecordVersionDTO[];
  prescriptions: PrescriptionDTO[];
  labResults: LabResultDTO[];
  createdAt: string;
}

export interface UploadUrlResponseDTO {
  labResultId: number;
  uploadUrl: string;    // Pre-signed PUT URL (use once, short TTL)
  s3ObjectKey: string;
  expiresInSeconds: number;
}

export interface DownloadUrlResponseDTO {
  labResultId: number;
  downloadUrl: string;  // Pre-signed GET URL (generated fresh on each request)
  expiresInSeconds: number;
}
