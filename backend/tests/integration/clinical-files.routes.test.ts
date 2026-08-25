// =====================================================================
// Module:  M3 - Clinical Data & Secure Files
// Test:    integration/clinical-files.routes.test.ts
// Purpose: Integration tests for Clinical Files HTTP endpoints:
//          - Auth & RBAC enforcement
//          - Anti-IDOR protection
//          - Validation constraints
//          - S3 Presigned URL response schemas
// =====================================================================

import request from 'supertest';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { generateAccessToken } from '../../src/utils/jwt.util';

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

// Mock ClinicalFilesRepository
const mockRepoMethods = {
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
};

jest.mock('../../src/modules/clinical-files/clinical-files.repository', () => ({
  ClinicalFilesRepository: jest.fn().mockImplementation(() => mockRepoMethods),
}));

import { clinicalFilesRouter } from '../../src/modules/clinical-files/clinical-files.routes';
import { buildTestApp } from '../helpers/buildTestApp';

const app = buildTestApp(clinicalFilesRouter);

// Helper tokens
const doctor1Token = `Bearer ${generateAccessToken({ sub: 2, role: 'doctor' })}`;   // maps to doctor_id 20
const doctor2Token = `Bearer ${generateAccessToken({ sub: 3, role: 'doctor' })}`;   // maps to doctor_id 30
const patientAToken = `Bearer ${generateAccessToken({ sub: 10, role: 'patient' })}`; // patient_id 10
const patientBToken = `Bearer ${generateAccessToken({ sub: 99, role: 'patient' })}`; // patient_id 99

describe('Clinical Files Route Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===================================================================
  // 1. POST /api/clinical/records
  // ===================================================================
  describe('POST /api/clinical/records', () => {
    it('returns 401 UNAUTHORIZED when Authorization header is missing', async () => {
      const res = await request(app)
        .post('/api/clinical/records')
        .send({
          appointmentId: 50,
          initialDiagnosis: 'Chẩn đoán mẫu',
          initialSymptoms: 'Triệu chứng',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 403 FORBIDDEN when called by a user with role "patient"', async () => {
      const res = await request(app)
        .post('/api/clinical/records')
        .set('Authorization', patientAToken)
        .send({
          appointmentId: 50,
          initialDiagnosis: 'Bệnh nhân tự tạo',
          initialSymptoms: 'Sốt cao',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('returns 422 VALIDATION_ERROR when required fields are invalid', async () => {
      const res = await request(app)
        .post('/api/clinical/records')
        .set('Authorization', doctor1Token)
        .send({
          appointmentId: -1, // invalid ID
          initialDiagnosis: 'A', // too short (< 5 chars)
          initialSymptoms: '',
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 201 SUCCESS when an assigned doctor creates record v1', async () => {
      mockRepoMethods.findDoctorIdByUserId.mockResolvedValue(20);
      mockRepoMethods.findAppointmentById.mockResolvedValue({
        id: 50,
        patient_id: 10,
        doctor_id: 20,
        status: 'CONFIRMED',
      });
      mockRepoMethods.findRecordByAppointmentId.mockResolvedValue(null);
      mockRepoMethods.createRecord.mockResolvedValue({
        id: 100,
        patient_id: 10,
        doctor_id: 20,
        appointment_id: 50,
        initial_diagnosis: 'Viêm tai giữa cấp',
        initial_symptoms: 'Đau nhức tai, sốt nhẹ',
        initial_treatment: 'Kháng sinh 7 ngày',
        current_version: 1,
        status: 'active',
        created_at: new Date('2026-08-25T08:00:00Z'),
      });

      const res = await request(app)
        .post('/api/clinical/records')
        .set('Authorization', doctor1Token)
        .send({
          appointmentId: 50,
          initialDiagnosis: 'Viêm tai giữa cấp',
          initialSymptoms: 'Đau nhức tai, sốt nhẹ',
          initialTreatment: 'Kháng sinh 7 ngày',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(100);
      expect(res.body.data.currentVersion).toBe(1);
      expect(res.body.data.diagnosis).toBe('Viêm tai giữa cấp');
    });
  });

  // ===================================================================
  // 2. POST /api/clinical/records/:id/amend
  // ===================================================================
  describe('POST /api/clinical/records/:id/amend', () => {
    it('returns 422 when amendmentReason is missing or too short (< 10 chars)', async () => {
      const res = await request(app)
        .post('/api/clinical/records/100/amend')
        .set('Authorization', doctor1Token)
        .send({
          diagnosis: 'Chẩn đoán mới',
          symptoms: 'Triệu chứng mới',
          amendmentReason: 'Ngắn', // < 10 chars -> rejected for audit trail integrity
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 403 FORBIDDEN when Doctor 2 tries to amend Doctor 1 record (Anti-IDOR)', async () => {
      mockRepoMethods.findDoctorIdByUserId.mockResolvedValue(30); // Doctor 2 has doctor_id: 30
      mockRepoMethods.findRecordById.mockResolvedValue({
        id: 100,
        doctor_id: 20, // Belongs to Doctor 1 (doctor_id: 20)
        patient_id: 10,
        status: 'active',
        current_version: 1,
      });

      const res = await request(app)
        .post('/api/clinical/records/100/amend')
        .set('Authorization', doctor2Token)
        .send({
          diagnosis: 'Chẩn đoán sửa đổi',
          symptoms: 'Triệu chứng sửa đổi',
          amendmentReason: 'Lý do đính chính hợp lệ 10 ký tự',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toBe('You are not authorized to amend this medical record');
    });

    it('returns 200 SUCCESS with updated version when owning doctor amends record', async () => {
      mockRepoMethods.findDoctorIdByUserId.mockResolvedValue(20);
      mockRepoMethods.findRecordById.mockResolvedValue({
        id: 100,
        doctor_id: 20,
        patient_id: 10,
        appointment_id: 50,
        initial_diagnosis: 'Viêm họng',
        initial_symptoms: 'Sốt',
        current_version: 1,
        status: 'active',
        created_at: new Date('2026-08-25T08:00:00Z'),
      });
      mockRepoMethods.insertVersion.mockResolvedValue({
        id: 2,
        record_id: 100,
        version_number: 2,
        diagnosis: 'Viêm xoang cấp',
        symptoms: 'Nghẹt mũi, đau trán',
        treatment_plan: 'Kháng sinh + xịt mũi',
        amendment_reason: 'Phát hiện thêm viêm xoang sau khi chụp CT',
        created_by: 2,
        created_at: new Date('2026-08-25T10:00:00Z'),
      });
      mockRepoMethods.findVersionsByRecordId.mockResolvedValue([
        {
          id: 2,
          record_id: 100,
          version_number: 2,
          diagnosis: 'Viêm xoang cấp',
          symptoms: 'Nghẹt mũi, đau trán',
          treatment_plan: 'Kháng sinh + xịt mũi',
          amendment_reason: 'Phát hiện thêm viêm xoang sau khi chụp CT',
          created_by: 2,
          created_at: new Date('2026-08-25T10:00:00Z'),
        },
      ]);
      mockRepoMethods.findActivePrescriptionsByRecordId.mockResolvedValue([]);
      mockRepoMethods.findActiveLabResultsByRecordId.mockResolvedValue([]);

      const res = await request(app)
        .post('/api/clinical/records/100/amend')
        .set('Authorization', doctor1Token)
        .send({
          diagnosis: 'Viêm xoang cấp',
          symptoms: 'Nghẹt mũi, đau trán',
          treatmentPlan: 'Kháng sinh + xịt mũi',
          amendmentReason: 'Phát hiện thêm viêm xoang sau khi chụp CT',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.diagnosis).toBe('Viêm xoang cấp');
      expect(res.body.data.versions).toHaveLength(1);
      expect(res.body.data.versions[0].versionNumber).toBe(2);
      expect(res.body.data.versions[0].amendmentReason).toBe(
        'Phát hiện thêm viêm xoang sau khi chụp CT',
      );
    });
  });

  // ===================================================================
  // 3. GET /api/clinical/records/:id (Anti-IDOR)
  // ===================================================================
  describe('GET /api/clinical/records/:id', () => {
    it('returns 403 FORBIDDEN when Patient A tries to view Patient B record (IDOR Protection)', async () => {
      mockRepoMethods.findRecordById.mockResolvedValue({
        id: 100,
        patient_id: 99, // Patient B (userId: 99)
        doctor_id: 20,
        status: 'active',
        current_version: 1,
      });

      // Patient A (userId: 10) calls GET on Record 100
      const res = await request(app)
        .get('/api/clinical/records/100')
        .set('Authorization', patientAToken);

      expect(res.status).toBe(403);
      expect(res.body.error.message).toBe('You are not authorized to access this medical record');
    });

    it('returns 200 SUCCESS when Patient A views their own record', async () => {
      mockRepoMethods.findRecordById.mockResolvedValue({
        id: 100,
        patient_id: 10, // Matches Patient A (userId: 10)
        doctor_id: 20,
        appointment_id: 50,
        initial_diagnosis: 'Cảm cúm thông thường',
        initial_symptoms: 'Sốt nhẹ, mệt mỏi',
        initial_treatment: 'Nghỉ ngơi',
        current_version: 1,
        status: 'active',
        created_at: new Date('2026-08-25T08:00:00Z'),
      });
      mockRepoMethods.findVersionsByRecordId.mockResolvedValue([]);
      mockRepoMethods.findActivePrescriptionsByRecordId.mockResolvedValue([]);
      mockRepoMethods.findActiveLabResultsByRecordId.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/clinical/records/100')
        .set('Authorization', patientAToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(100);
      expect(res.body.data.patientId).toBe(10);
    });
  });

  // ===================================================================
  // 4. S3 Presigned URLs Endpoints
  // ===================================================================
  describe('S3 Presigned URLs Endpoints', () => {
    it('POST /api/clinical/lab-results/upload-url returns presigned URL with 300s TTL', async () => {
      mockRepoMethods.findDoctorIdByUserId.mockResolvedValue(20);
      mockRepoMethods.findRecordById.mockResolvedValue({
        id: 100,
        doctor_id: 20,
        patient_id: 10,
        status: 'active',
      });
      mockRepoMethods.createLabResult.mockResolvedValue({
        id: 501,
        record_id: 100,
        test_name: 'Sinh hóa máu',
        s3_object_key: 'clinical/lab-results/10/100/uuid-test.pdf',
        status: 'pending',
      });
      mockedGetSignedUrl.mockResolvedValue('https://s3.ap-southeast-1.amazonaws.com/bucket/put-url');

      const res = await request(app)
        .post('/api/clinical/lab-results/upload-url')
        .set('Authorization', doctor1Token)
        .send({
          recordId: 100,
          testName: 'Sinh hóa máu',
          fileMimeType: 'application/pdf',
          fileSizeBytes: 512000,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.uploadUrl).toBe('https://s3.ap-southeast-1.amazonaws.com/bucket/put-url');
      expect(res.body.data.expiresInSeconds).toBe(300);
    });

    it('GET /api/clinical/lab-results/:id/download-url returns fresh presigned GET URL with 600s TTL', async () => {
      mockRepoMethods.findLabResultById.mockResolvedValue({
        id: 500,
        record_id: 100,
        s3_object_key: 'clinical/lab-results/10/100/result.pdf',
        status: 'uploaded',
      });
      mockRepoMethods.findRecordById.mockResolvedValue({
        id: 100,
        patient_id: 10,
        doctor_id: 20,
      });
      mockedGetSignedUrl.mockResolvedValue('https://s3.ap-southeast-1.amazonaws.com/bucket/get-url');

      const res = await request(app)
        .get('/api/clinical/lab-results/500/download-url')
        .set('Authorization', patientAToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.downloadUrl).toBe('https://s3.ap-southeast-1.amazonaws.com/bucket/get-url');
      expect(res.body.data.expiresInSeconds).toBe(600);
    });

    it('GET /api/clinical/lab-results/:id/download-url rejects download for Patient B on Patient A file (IDOR)', async () => {
      mockRepoMethods.findLabResultById.mockResolvedValue({
        id: 500,
        record_id: 100,
        status: 'uploaded',
      });
      mockRepoMethods.findRecordById.mockResolvedValue({
        id: 100,
        patient_id: 10, // Belongs to Patient A (10)
        doctor_id: 20,
      });

      // Patient B (99) tries to download
      const res = await request(app)
        .get('/api/clinical/lab-results/500/download-url')
        .set('Authorization', patientBToken);

      expect(res.status).toBe(403);
      expect(res.body.error.message).toBe('You are not authorized to download this lab result');
    });
  });
});
