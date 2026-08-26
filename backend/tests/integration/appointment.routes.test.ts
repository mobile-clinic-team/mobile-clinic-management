// =====================================================================
// Module:  M2 - Appointment Engine
// Test:    integration/appointment.routes.test.ts
// Purpose: Integration tests for Appointment HTTP endpoints:
//          - POST /api/appointments (Booking + Idempotency-Key)
//          - GET /api/appointments (Query filtering)
//          - GET /api/appointments/:id (Details)
//          - PATCH /api/appointments/:id/cancel (Cancellation)
// =====================================================================

import request from 'supertest';
import { AppointmentRepository } from '../../src/modules/appointment/appointment.repository';
import { appointmentRouter } from '../../src/modules/appointment/appointment.routes';
import { AppointmentRow, AppointmentWithDetailsRow } from '../../src/modules/appointment/appointment.types';
import { generateAccessToken } from '../../src/utils/jwt.util';
import { buildTestApp } from '../helpers/buildTestApp';

// Mock DB pool and transaction
jest.mock('../../src/config/db', () => ({
  pool: {
    connect: jest.fn().mockResolvedValue({
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    }),
    query: jest.fn(),
  },
  withTransaction: jest.fn((fn: (client: unknown) => Promise<unknown>) => fn({})),
}));

function makeAppointmentRow(overrides: Partial<AppointmentWithDetailsRow> = {}): AppointmentWithDetailsRow {
  return {
    id: 1,
    patient_id: 10,
    doctor_id: 5,
    shift_id: 20,
    start_time: new Date(Date.now() + 86400000).toISOString(),
    end_time: new Date(Date.now() + 86400000 + 1800000).toISOString(),
    status: 'CONFIRMED',
    reason: 'Kiem tra suc khoe',
    created_at: new Date('2026-08-26T08:00:00Z'),
    updated_at: new Date('2026-08-26T08:00:00Z'),
    doctor_name: 'BS Nguyen Van A',
    department_name: 'Khoa Tim Mach',
    ...overrides,
  };
}

describe('Appointment Routes Integration Tests (Task 3.4)', () => {
  let app: ReturnType<typeof buildTestApp>;

  const patientToken = generateAccessToken({ sub: 10, role: 'patient' });
  const doctorToken = generateAccessToken({ sub: 20, role: 'doctor' });
  const adminToken = generateAccessToken({ sub: 99, role: 'admin' });

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildTestApp(appointmentRouter);
  });

  // ===================================================================
  // 1. POST /api/appointments
  // ===================================================================
  describe('POST /api/appointments', () => {
    it('requires authentication (401 without token)', async () => {
      const res = await request(app)
        .post('/api/appointments')
        .send({
          doctorId: 5,
          shiftId: 20,
          startTime: new Date(Date.now() + 86400000).toISOString(),
        });

      expect(res.status).toBe(401);
    });

    it('rejects booking with invalid payload (422 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          doctorId: -1, // invalid doctorId
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('successfully books an appointment with Idempotency-Key', async () => {
      const validStartTime = new Date(Date.now() + 86400000).toISOString();
      const validEndTime = new Date(Date.now() + 86400000 + 1800000).toISOString();

      jest.spyOn(AppointmentRepository.prototype, 'insertIdempotencyKey').mockResolvedValueOnce({
        key: 'idemp-route-001',
        user_id: 10,
        request_path: '/api/appointments',
        request_hash: 'hash',
        status: 'PROCESSING',
        response_code: null,
        response_body: null,
        created_at: new Date(),
        locked_at: new Date(),
      });

      jest.spyOn(AppointmentRepository.prototype, 'lockShiftForUpdate').mockResolvedValueOnce({
        id: 20,
        doctor_id: 5,
        shift_date: validStartTime.substring(0, 10),
        start_time: '08:00',
        end_time: '12:00',
        slot_duration_minutes: 30,
        is_active: true,
      } as any);

      jest.spyOn(AppointmentRepository.prototype, 'findExistingActiveAppointment').mockResolvedValueOnce(null);

      jest.spyOn(AppointmentRepository.prototype, 'createAppointment').mockResolvedValueOnce(
        makeAppointmentRow({
          id: 50,
          patient_id: 10,
          doctor_id: 5,
          shift_id: 20,
          start_time: validStartTime,
          end_time: validEndTime,
          status: 'CONFIRMED',
        }),
      );

      jest.spyOn(AppointmentRepository.prototype, 'updateIdempotencySuccess').mockResolvedValueOnce(undefined);

      const res = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .set('Idempotency-Key', 'd3b07384-d113-494b-9c8e-aa2016629910')
        .send({
          doctorId: 5,
          shiftId: 20,
          startTime: validStartTime,
          endTime: validEndTime,
          reason: 'Kham dinh ky',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(50);
      expect(res.body.data.doctorId).toBe(5);
    });
  });

  // ===================================================================
  // 2. GET /api/appointments & GET /api/appointments/:id
  // ===================================================================
  describe('GET /api/appointments', () => {
    it('returns appointment list scoped to patient', async () => {
      jest.spyOn(AppointmentRepository.prototype, 'listAppointments').mockResolvedValueOnce([
        makeAppointmentRow({ id: 1 }),
        makeAppointmentRow({ id: 2 }),
      ]);

      const res = await request(app)
        .get('/api/appointments')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
    });
  });

  describe('GET /api/appointments/:id', () => {
    it('returns appointment details when authorized', async () => {
      jest.spyOn(AppointmentRepository.prototype, 'findById').mockResolvedValueOnce(
        makeAppointmentRow({ id: 1, patient_id: 10 }),
      );

      const res = await request(app)
        .get('/api/appointments/1')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(1);
    });

    it('blocks unauthorized patient from viewing another patient appointment (403)', async () => {
      // Appointment belongs to patient_id: 99, but patientToken sub is 10
      jest.spyOn(AppointmentRepository.prototype, 'findById').mockResolvedValueOnce(
        makeAppointmentRow({ id: 1, patient_id: 99 }),
      );

      const res = await request(app)
        .get('/api/appointments/1')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  // ===================================================================
  // 3. PATCH /api/appointments/:id/cancel
  // ===================================================================
  describe('PATCH /api/appointments/:id/cancel', () => {
    it('allows patient to cancel their own confirmed appointment', async () => {
      jest.spyOn(AppointmentRepository.prototype, 'findById').mockResolvedValueOnce(
        makeAppointmentRow({ id: 1, patient_id: 10, status: 'CONFIRMED' }),
      );
      jest.spyOn(AppointmentRepository.prototype, 'cancelAppointment').mockResolvedValueOnce(
        makeAppointmentRow({ id: 1, status: 'CANCELLED' }),
      );

      const res = await request(app)
        .patch('/api/appointments/1/cancel')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ cancelReason: 'Bận việc gia đình' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('CANCELLED');
    });

    it('returns 409 Conflict when attempting to cancel an already completed appointment', async () => {
      jest.spyOn(AppointmentRepository.prototype, 'findById').mockResolvedValueOnce(
        makeAppointmentRow({ id: 1, patient_id: 10, status: 'COMPLETED' }),
      );

      const res = await request(app)
        .patch('/api/appointments/1/cancel')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ cancelReason: 'Muốn hủy' });

      expect(res.status).toBe(409);
      expect(res.body.error.message).toContain('completed');
    });
  });
});
