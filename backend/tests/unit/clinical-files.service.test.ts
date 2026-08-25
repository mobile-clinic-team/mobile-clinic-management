// =====================================================================
// Module:  M3 - Clinical Data & Secure Files
// Test:    unit/clinical-files.service.test.ts
// Purpose: Unit tests for ClinicalFilesService covering:
//          - Strict Authorization & Anti-IDOR guards
//          - Immutability & Audit Trail integrity (v1 -> v2)
//          - S3 Presigned URL TTL & Security contracts
// =====================================================================

import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppError } from '../../src/utils/AppError';
import { ClinicalFilesRepository } from '../../src/modules/clinical-files/clinical-files.repository';
import { ClinicalFilesService } from '../../src/modules/clinical-files/clinical-files.service';
import {
  LabResultRow,
  MedicalRecordRow,
  MedicalRecordVersionRow,
  PrescriptionRow,
} from '../../src/modules/clinical-files/clinical-files.types';

// Mock DB transaction wrapper
jest.mock('../../src/config/db', () => ({
  pool: { connect: jest.fn() },
  withTransaction: jest.fn((fn: (client: unknown) => Promise<unknown>) => fn({})),
}));

// Mock S3 Client & Presigner
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({})),
  GetObjectCommand: jest.fn().mockImplementation((params) => ({ ...params, type: 'GetObject' })),
  PutObjectCommand: jest.fn().mockImplementation((params) => ({ ...params, type: 'PutObject' })),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

const mockedGetSignedUrl = getSignedUrl as jest.MockedFunction<typeof getSignedUrl>;

// Mock Repository
const mockRepo = {
  findRecordById: jest.fn(),
  findRecordByAppointmentId: jest.fn(),
  createRecord: jest.fn(),
  incrementRecordVersion: jest.fn(),
  insertVersion: jest.fn(),
  findVersionsByRecordId: jest.fn(),
  findActivePrescriptionsByRecordId: jest.fn(),
  createLabResult: jest.fn(),
  findLabResultById: jest.fn(),
  findActiveLabResultsByRecordId: jest.fn(),
  findAppointmentById: jest.fn(),
  findDoctorIdByUserId: jest.fn(),
} as unknown as jest.Mocked<ClinicalFilesRepository>;

function makeRecordRow(overrides: Partial<MedicalRecordRow> = {}): MedicalRecordRow {
  return {
    id: 100,
    patient_id: 10,
    doctor_id: 20,
    appointment_id: 50,
    initial_diagnosis: 'Viêm họng cấp',
    initial_symptoms: 'Sốt cao, đau rát họng, ho khan',
    initial_treatment: 'Nghỉ ngơi, uống nhiều nước',
    current_version: 1,
    status: 'active',
    is_deleted: false,
    deleted_at: null,
    deleted_by: null,
    created_at: new Date('2026-08-25T08:00:00Z'),
    ...overrides,
  };
}

function makeVersionRow(overrides: Partial<MedicalRecordVersionRow> = {}): MedicalRecordVersionRow {
  return {
    id: 1,
    record_id: 100,
    version_number: 2,
    diagnosis: 'Viêm amidan mủ cấp',
    symptoms: 'Sốt 39 độ, amidan sưng to có chấm mủ',
    treatment_plan: 'Kê kháng sinh 7 ngày, tái khám',
    amendment_reason: 'Phát hiện thêm tổn thương amidan sau nội soi tai mũi họng',
    created_by: 2, // doctor's userId
    created_at: new Date('2026-08-25T10:00:00Z'),
    ...overrides,
  };
}

function makeLabResultRow(overrides: Partial<LabResultRow> = {}): LabResultRow {
  return {
    id: 500,
    record_id: 100,
    test_name: 'Xét nghiệm công thức máu',
    s3_object_key: 'clinical/lab-results/10/100/uuid-123.pdf',
    file_mime_type: 'application/pdf',
    file_size_bytes: 102400,
    result_notes: 'Bạch cầu tăng nhẹ',
    status: 'uploaded',
    is_superseded: false,
    supersedes_id: null,
    ordered_by: 20,
    reviewed_by: 20,
    reviewed_at: new Date('2026-08-25T09:00:00Z'),
    created_at: new Date('2026-08-25T08:30:00Z'),
    updated_at: new Date('2026-08-25T09:00:00Z'),
    ...overrides,
  };
}

describe('ClinicalFilesService', () => {
  let service: ClinicalFilesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ClinicalFilesService(mockRepo);
  });

  // ===================================================================
  // 1. ANTI-IDOR & AUTHORIZATION TESTS
  // ===================================================================
  describe('Anti-IDOR & Authorization Guards', () => {
    it('blocks Patient A from viewing Medical Record belonging to Patient B (403 Forbidden)', async () => {
      // Patient A is userId: 10, but Record #100 belongs to patient_id: 99 (Patient B)
      const recordOfPatientB = makeRecordRow({ id: 100, patient_id: 99, doctor_id: 20 });
      mockRepo.findRecordById.mockResolvedValue(recordOfPatientB);

      await expect(
        service.getMedicalRecordDetail(10, 'patient', 100),
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 403,
          code: 'FORBIDDEN',
          message: 'You are not authorized to access this medical record',
        }),
      );
    });

    it('blocks Doctor X from viewing Medical Record belonging to Doctor Y patient (403 Forbidden)', async () => {
      // Doctor X is userId: 2 (mapped to doctor_id: 20), but Record belongs to doctor_id: 88 (Doctor Y)
      const recordOfDoctorY = makeRecordRow({ id: 100, patient_id: 10, doctor_id: 88 });
      mockRepo.findRecordById.mockResolvedValue(recordOfDoctorY);
      mockRepo.findDoctorIdByUserId.mockResolvedValue(20); // Doctor X's doctor_id = 20

      await expect(
        service.getMedicalRecordDetail(2, 'doctor', 100),
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 403,
          code: 'FORBIDDEN',
          message: 'You are not authorized to access this medical record',
        }),
      );
    });

    it('blocks Doctor X from amending a Medical Record created by Doctor Y (403 Forbidden)', async () => {
      const recordOfDoctorY = makeRecordRow({ id: 100, doctor_id: 88 });
      mockRepo.findRecordById.mockResolvedValue(recordOfDoctorY);
      mockRepo.findDoctorIdByUserId.mockResolvedValue(20); // Doctor X id is 20

      await expect(
        service.amendMedicalRecord(2, 'doctor', 100, {
          diagnosis: 'Chẩn đoán mới',
          symptoms: 'Triệu chứng mới',
          amendmentReason: 'Lý do đính chính hợp lệ 10 ký tự',
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 403,
          code: 'FORBIDDEN',
          message: 'You are not authorized to amend this medical record',
        }),
      );
    });

    it('blocks Patient from calling createMedicalRecord or amendMedicalRecord (403 Forbidden)', async () => {
      await expect(
        service.createMedicalRecord(10, 'patient', {
          appointmentId: 50,
          initialDiagnosis: 'Chẩn đoán tự tạo',
          initialSymptoms: 'Triệu chứng',
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 403,
          message: 'Only doctors may create medical records',
        }),
      );

      await expect(
        service.amendMedicalRecord(10, 'patient', 100, {
          diagnosis: 'Chẩn đoán sửa',
          symptoms: 'Triệu chứng',
          amendmentReason: 'Lý do đính chính',
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 403,
          message: 'Only doctors may amend medical records',
        }),
      );
    });

    it('allows the assigned doctor and the owning patient to view the medical record', async () => {
      const record = makeRecordRow({ id: 100, patient_id: 10, doctor_id: 20 });
      mockRepo.findRecordById.mockResolvedValue(record);
      mockRepo.findDoctorIdByUserId.mockResolvedValue(20);
      mockRepo.findVersionsByRecordId.mockResolvedValue([]);
      mockRepo.findActivePrescriptionsByRecordId.mockResolvedValue([]);
      mockRepo.findActiveLabResultsByRecordId.mockResolvedValue([]);

      // 1. Patient viewing own record
      const patientResult = await service.getMedicalRecordDetail(10, 'patient', 100);
      expect(patientResult.id).toBe(100);
      expect(patientResult.diagnosis).toBe('Viêm họng cấp');

      // 2. Doctor viewing assigned patient record
      const doctorResult = await service.getMedicalRecordDetail(2, 'doctor', 100);
      expect(doctorResult.id).toBe(100);
      expect(doctorResult.doctorId).toBe(20);
    });

    it('blocks Patient A from downloading Lab Result of Patient B (403 IDOR Protection)', async () => {
      const labResultOfPatientB = makeLabResultRow({ id: 500, record_id: 100 });
      const recordOfPatientB = makeRecordRow({ id: 100, patient_id: 99, doctor_id: 20 });

      mockRepo.findLabResultById.mockResolvedValue(labResultOfPatientB);
      mockRepo.findRecordById.mockResolvedValue(recordOfPatientB);

      // Patient A (userId: 10) tries to download Lab Result of Patient B (patient_id: 99)
      await expect(
        service.requestDownloadUrl(10, 'patient', 500),
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 403,
          code: 'FORBIDDEN',
          message: 'You are not authorized to download this lab result',
        }),
      );
    });
  });

  // ===================================================================
  // 2. IMMUTABILITY & AUDIT TRAIL INTEGRITY TESTS (v1 -> v2)
  // ===================================================================
  describe('Immutability & Audit Trail Integrity (v1 -> v2)', () => {
    it('creates initial medical record v1 with initial snapshot and version = 1', async () => {
      mockRepo.findDoctorIdByUserId.mockResolvedValue(20);
      mockRepo.findAppointmentById.mockResolvedValue({
        id: 50,
        patient_id: 10,
        doctor_id: 20,
        status: 'CONFIRMED',
      });
      mockRepo.findRecordByAppointmentId.mockResolvedValue(null);

      const createdRow = makeRecordRow({
        id: 100,
        current_version: 1,
        initial_diagnosis: 'Viêm phế quản cấp',
        initial_symptoms: 'Ho đờm, sốt nhẹ',
        initial_treatment: 'Kháng sinh 5 ngày',
      });
      mockRepo.createRecord.mockResolvedValue(createdRow);

      const result = await service.createMedicalRecord(2, 'doctor', {
        appointmentId: 50,
        initialDiagnosis: 'Viêm phế quản cấp',
        initialSymptoms: 'Ho đờm, sốt nhẹ',
        initialTreatment: 'Kháng sinh 5 ngày',
      });

      expect(mockRepo.createRecord).toHaveBeenCalledWith(
        10,
        20,
        50,
        'Viêm phế quản cấp',
        'Ho đờm, sốt nhẹ',
        'Kháng sinh 5 ngày',
        expect.anything(),
      );
      expect(result.currentVersion).toBe(1);
      expect(result.diagnosis).toBe('Viêm phế quản cấp');
      expect(result.versions).toHaveLength(0); // v1 has no previous amendment rows
    });

    it('enforces one record per appointment (prevents duplicate creation)', async () => {
      mockRepo.findDoctorIdByUserId.mockResolvedValue(20);
      mockRepo.findAppointmentById.mockResolvedValue({
        id: 50,
        patient_id: 10,
        doctor_id: 20,
        status: 'CONFIRMED',
      });
      mockRepo.findRecordByAppointmentId.mockResolvedValue(makeRecordRow({ id: 100 }));

      await expect(
        service.createMedicalRecord(2, 'doctor', {
          appointmentId: 50,
          initialDiagnosis: 'Chẩn đoán trùng',
          initialSymptoms: 'Triệu chứng',
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 409,
          message: expect.stringContaining('already exists for appointment 50. Use /amend'),
        }),
      );
    });

    it('preserves initial snapshot and appends new version (v2) with amendmentReason to audit trail', async () => {
      const initialRecord = makeRecordRow({
        id: 100,
        current_version: 1,
        initial_diagnosis: 'Viêm họng cấp',
        initial_symptoms: 'Sốt, đau họng',
      });
      mockRepo.findRecordById.mockResolvedValue(initialRecord);
      mockRepo.findDoctorIdByUserId.mockResolvedValue(20);
      mockRepo.insertVersion.mockResolvedValue(makeVersionRow());
      mockRepo.incrementRecordVersion.mockResolvedValue(undefined);

      const versionRowV2 = makeVersionRow({
        version_number: 2,
        diagnosis: 'Viêm amidan hốc mủ',
        symptoms: 'Sốt 39 độ, đau nuốt, mủ trắng amidan',
        amendment_reason: 'Bổ sung kết quả khám chuyên khoa tai mũi họng',
      });
      mockRepo.findVersionsByRecordId.mockResolvedValue([versionRowV2]);
      mockRepo.findActivePrescriptionsByRecordId.mockResolvedValue([]);
      mockRepo.findActiveLabResultsByRecordId.mockResolvedValue([]);

      const updatedDetail = await service.amendMedicalRecord(2, 'doctor', 100, {
        diagnosis: 'Viêm amidan hốc mủ',
        symptoms: 'Sốt 39 độ, đau nuốt, mủ trắng amidan',
        treatmentPlan: 'Kê thêm kháng sinh',
        amendmentReason: 'Bổ sung kết quả khám chuyên khoa tai mũi họng',
      });

      // 1. Check version insertion parameters
      expect(mockRepo.insertVersion).toHaveBeenCalledWith(
        100,
        2, // next version = current_version (1) + 1 = 2
        'Viêm amidan hốc mủ',
        'Sốt 39 độ, đau nuốt, mủ trắng amidan',
        'Kê thêm kháng sinh',
        'Bổ sung kết quả khám chuyên khoa tai mũi họng',
        2, // createdBy = doctor userId
        expect.anything(),
      );

      // 2. Check record version increment
      expect(mockRepo.incrementRecordVersion).toHaveBeenCalledWith(100, 2, expect.anything());

      // 3. Response DTO should show latest diagnosis as current, with full audit trail in versions
      expect(updatedDetail.diagnosis).toBe('Viêm amidan hốc mủ');
      expect(updatedDetail.versions).toHaveLength(1);
      expect(updatedDetail.versions[0].versionNumber).toBe(2);
      expect(updatedDetail.versions[0].amendmentReason).toBe(
        'Bổ sung kết quả khám chuyên khoa tai mũi họng',
      );
    });

    it('rejects amendment on finalized medical records (409 Conflict)', async () => {
      const finalizedRecord = makeRecordRow({ id: 100, status: 'finalized', doctor_id: 20 });
      mockRepo.findRecordById.mockResolvedValue(finalizedRecord);
      mockRepo.findDoctorIdByUserId.mockResolvedValue(20);

      await expect(
        service.amendMedicalRecord(2, 'doctor', 100, {
          diagnosis: 'Chẩn đoán mới',
          symptoms: 'Triệu chứng mới',
          amendmentReason: 'Lý do đính chính hợp lệ 10 ký tự',
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 409,
          message: expect.stringContaining('has been finalized and cannot be amended'),
        }),
      );
    });
  });

  // ===================================================================
  // 3. S3 PRESIGNED URL & TTL TESTS
  // ===================================================================
  describe('S3 Presigned URL & TTL Lifecycle', () => {
    it('generates S3 Presigned PUT URL with 300s (5m) TTL and creates pending lab_result row', async () => {
      mockRepo.findDoctorIdByUserId.mockResolvedValue(20);
      mockRepo.findRecordById.mockResolvedValue(makeRecordRow({ id: 100, doctor_id: 20, patient_id: 10 }));
      mockRepo.createLabResult.mockResolvedValue(
        makeLabResultRow({ id: 501, status: 'pending' }),
      );
      mockedGetSignedUrl.mockResolvedValue('https://s3.amazonaws.com/test-bucket/upload-signed-url');

      const result = await service.requestUploadUrl(2, 'doctor', {
        recordId: 100,
        testName: 'X-Quang tim phổi thẳng',
        fileMimeType: 'application/pdf',
        fileSizeBytes: 204800,
      });

      // 1. Lab result row created first with status pending
      expect(mockRepo.createLabResult).toHaveBeenCalledWith(
        100,
        'X-Quang tim phổi thẳng',
        expect.stringContaining('clinical/lab-results/10/100/'),
        'application/pdf',
        204800,
        20,
      );

      // 2. getSignedUrl called with expiresIn = 300 seconds
      expect(mockedGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ type: 'PutObject', ContentType: 'application/pdf' }),
        { expiresIn: 300 },
      );

      expect(result.uploadUrl).toBe('https://s3.amazonaws.com/test-bucket/upload-signed-url');
      expect(result.expiresInSeconds).toBe(300);
      expect(result.labResultId).toBe(501);
    });

    it('generates fresh S3 Presigned GET URL with 600s (10m) TTL on-demand when downloading', async () => {
      const labRow = makeLabResultRow({
        id: 500,
        record_id: 100,
        s3_object_key: 'clinical/lab-results/10/100/result-file.pdf',
        status: 'uploaded',
      });
      mockRepo.findLabResultById.mockResolvedValue(labRow);
      mockRepo.findRecordById.mockResolvedValue(makeRecordRow({ id: 100, patient_id: 10, doctor_id: 20 }));
      mockedGetSignedUrl.mockResolvedValue('https://s3.amazonaws.com/test-bucket/download-signed-url');

      const result = await service.requestDownloadUrl(10, 'patient', 500);

      // getSignedUrl called with expiresIn = 600 seconds
      expect(mockedGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: 'GetObject',
          Key: 'clinical/lab-results/10/100/result-file.pdf',
        }),
        { expiresIn: 600 },
      );

      expect(result.downloadUrl).toBe('https://s3.amazonaws.com/test-bucket/download-signed-url');
      expect(result.expiresInSeconds).toBe(600);
      expect(result.labResultId).toBe(500);
    });

    it('rejects download request if lab result status is still pending (409 Conflict)', async () => {
      const pendingLabRow = makeLabResultRow({ id: 500, status: 'pending' });
      mockRepo.findLabResultById.mockResolvedValue(pendingLabRow);

      await expect(
        service.requestDownloadUrl(10, 'patient', 500),
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 409,
          message: expect.stringContaining('has not been uploaded yet'),
        }),
      );
    });

    it('returns 404 if requested lab result does not exist', async () => {
      mockRepo.findLabResultById.mockResolvedValue(null);

      await expect(
        service.requestDownloadUrl(10, 'patient', 999),
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 404,
          message: 'Lab result 999 not found',
        }),
      );
    });
  });
});
