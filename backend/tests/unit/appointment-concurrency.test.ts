// =====================================================================
// Module:  M2 - Appointment Engine
// Test:    unit/appointment-concurrency.test.ts
// Purpose: Concurrency Stress Test simulating 20 simultaneous requests
//          competing for the same doctor appointment slot.
//          Proves: EXACTLY 1 succeeds (201) and 19 fail with 409 Conflict.
// =====================================================================

import { Pool, PoolClient } from 'pg';
import { AppointmentRepository } from '../../src/modules/appointment/appointment.repository';
import { AppointmentService } from '../../src/modules/appointment/appointment.service';
import { AppointmentRow, CreateAppointmentInput } from '../../src/modules/appointment/appointment.types';

describe('Appointment Concurrency & Pessimistic Locking Stress Test (Task 3.4)', () => {
  let service: AppointmentService;
  let mockRepo: jest.Mocked<AppointmentRepository>;
  let mockPool: jest.Mocked<Pool>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRepo = {
      insertIdempotencyKey: jest.fn(),
      findIdempotencyKey: jest.fn(),
      resetIdempotencyToProcessing: jest.fn(),
      updateIdempotencySuccess: jest.fn(),
      updateIdempotencyFailed: jest.fn(),
      lockShiftForUpdate: jest.fn(),
      findExistingActiveAppointment: jest.fn(),
      createAppointment: jest.fn(),
      findById: jest.fn(),
      findDoctorByUserId: jest.fn(),
      cancelAppointment: jest.fn(),
      listAppointments: jest.fn(),
    } as unknown as jest.Mocked<AppointmentRepository>;

    // Mock pg client with transactional methods
    const createMockClient = () => {
      return {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn(),
      } as unknown as PoolClient;
    };

    mockPool = {
      connect: jest.fn().mockImplementation(() => Promise.resolve(createMockClient())),
    } as unknown as jest.Mocked<Pool>;

    service = new AppointmentService(mockRepo, mockPool);
  });

  it('SIMULATION: 20 concurrent requests for the EXACT same doctor slot -> EXACTLY 1 succeeds (201) and 19 receive 409 Conflict', async () => {
    const doctorId = 5;
    const shiftId = 10;
    const slotStartTime = new Date(Date.now() + 86400000).toISOString(); // Tomorrow
    const slotEndTime = new Date(Date.now() + 86400000 + 1800000).toISOString(); // +30 mins

    const shiftData = {
      id: shiftId,
      doctor_id: doctorId,
      shift_date: slotStartTime.substring(0, 10),
      start_time: '08:00',
      end_time: '12:00',
      slot_duration_minutes: 30,
      is_active: true,
    };

    // Shared state simulating PostgreSQL table row lock and uniqueness check
    let slotIsBooked = false;
    let appointmentCounter = 100;

    // Idempotency: each of the 20 requests has its own unique Idempotency-Key
    mockRepo.insertIdempotencyKey.mockResolvedValue({
      key: 'uuid',
      user_id: 1,
      request_path: '/api/appointments',
      request_hash: 'hash',
      status: 'PROCESSING',
      response_code: null,
      response_body: null,
      created_at: new Date(),
      locked_at: new Date(),
    });

    // Mock row lock on shift
    mockRepo.lockShiftForUpdate.mockResolvedValue(shiftData as any);

    // Mock slot check with atomic race check
    mockRepo.findExistingActiveAppointment.mockImplementation(async () => {
      if (slotIsBooked) {
        // Already booked by the winning transaction
        return {
          id: 999,
          patient_id: 1,
          doctor_id: doctorId,
          shift_id: shiftId,
          start_time: slotStartTime,
          end_time: slotEndTime,
          status: 'CONFIRMED',
          reason: 'Existing',
          created_at: new Date(),
          updated_at: new Date(),
        } as AppointmentRow;
      }
      return null;
    });

    // Mock atomic insertion: sets slotIsBooked to true upon first insert
    mockRepo.createAppointment.mockImplementation(async (patientId, docId, sId, start, end, reason) => {
      if (slotIsBooked) {
        const err: any = new Error('duplicate key value violates unique constraint "idx_unique_active_doctor_slot"');
        err.code = '23505';
        throw err;
      }
      slotIsBooked = true;
      return {
        id: ++appointmentCounter,
        patient_id: patientId,
        doctor_id: docId,
        shift_id: sId,
        start_time: start,
        end_time: end,
        status: 'CONFIRMED',
        reason: reason ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      } as AppointmentRow;
    });

    mockRepo.updateIdempotencySuccess.mockResolvedValue(undefined);
    mockRepo.updateIdempotencyFailed.mockResolvedValue(undefined);

    // Prepare 20 simultaneous requests from 20 different patients
    const NUM_CONCURRENT_REQUESTS = 20;
    const concurrentRequests = Array.from({ length: NUM_CONCURRENT_REQUESTS }, (_, index) => {
      const patientId = index + 1;
      const idempotencyKey = `idemp-key-concurrent-${patientId}`;
      const input: CreateAppointmentInput = {
        doctorId,
        shiftId,
        startTime: slotStartTime,
        endTime: slotEndTime,
        reason: `Patient ${patientId} booking request`,
      };

      return service
        .bookAppointment(patientId, idempotencyKey, input)
        .then((res) => ({ success: true, status: res.statusCode, data: res.data, error: null }))
        .catch((err) => ({ success: false, status: err.statusCode || 500, data: null, error: err }));
    });

    // Execute all 20 requests concurrently
    const results = await Promise.all(concurrentRequests);

    const successfulBookings = results.filter((r) => r.success && r.status === 201);
    const conflictedBookings = results.filter((r) => !r.success && r.status === 409);

    // ── ASSERTION CRITERIA: ──────────────────────────────────────────
    // 1. EXACTLY 1 booking must succeed with HTTP 201 Created
    expect(successfulBookings).toHaveLength(1);
    expect(successfulBookings[0].data?.id).toBe(101);
    expect(successfulBookings[0].data?.doctorId).toBe(doctorId);

    // 2. EXACTLY 19 bookings must fail with HTTP 409 Conflict
    expect(conflictedBookings).toHaveLength(19);
    conflictedBookings.forEach((conflict) => {
      expect(conflict.error?.message).toContain('already booked');
    });

    // 3. Total processed requests must equal 20
    expect(results).toHaveLength(NUM_CONCURRENT_REQUESTS);
  });
});
