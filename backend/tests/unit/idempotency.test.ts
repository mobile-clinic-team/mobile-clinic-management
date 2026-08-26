// =====================================================================
// Module:  M2 - Appointment Engine
// Test:    unit/idempotency.test.ts
// Purpose: Unit tests for Idempotency Engine:
//          - Identical key + identical payload -> returns cached response (isCached: true)
//          - Identical key + mismatched payload -> 422 IDEMPOTENCY_PAYLOAD_MISMATCH
//          - Key in PROCESSING state -> 409 IDEMPOTENCY_CONFLICT
//          - Key belonging to another user -> 403 FORBIDDEN
// =====================================================================

import crypto from 'crypto';
import { Pool, PoolClient } from 'pg';
import { AppointmentRepository } from '../../src/modules/appointment/appointment.repository';
import { AppointmentService } from '../../src/modules/appointment/appointment.service';
import { AppointmentRow, CreateAppointmentInput, IdempotencyKeyRow } from '../../src/modules/appointment/appointment.types';

describe('Idempotency Engine Tests (Task 3.4)', () => {
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

    const createMockClient = () => ({
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    } as unknown as PoolClient);

    mockPool = {
      connect: jest.fn().mockImplementation(() => Promise.resolve(createMockClient())),
    } as unknown as jest.Mocked<Pool>;

    service = new AppointmentService(mockRepo, mockPool);
  });

  const slotStartTime = new Date(Date.now() + 86400000).toISOString();
  const slotEndTime = new Date(Date.now() + 86400000 + 1800000).toISOString();

  const standardInput: CreateAppointmentInput = {
    doctorId: 5,
    shiftId: 10,
    startTime: slotStartTime,
    endTime: slotEndTime,
    reason: 'Routine checkup',
  };

  // ===================================================================
  // 1. REPLAY REQUEST WITH SAME PAYLOAD
  // ===================================================================
  it('returns cached response (isCached: true) when same Idempotency-Key is sent with identical payload', async () => {
    const idempotencyKey = 'idemp-replay-key-001';
    const userId = 10;

    const requestHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(standardInput))
      .digest('hex');

    const cachedAppointmentData = {
      id: 200,
      patientId: userId,
      doctorId: 5,
      shiftId: 10,
      startTime: slotStartTime,
      endTime: slotEndTime,
      status: 'CONFIRMED' as const,
      reason: 'Routine checkup',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const existingKeyRecord: IdempotencyKeyRow = {
      key: idempotencyKey,
      user_id: userId,
      request_path: '/api/appointments',
      request_hash: requestHash,
      status: 'SUCCESS',
      response_code: 201,
      response_body: cachedAppointmentData,
      created_at: new Date(),
      locked_at: new Date(),
    };

    // First insert fails due to existing primary key
    mockRepo.insertIdempotencyKey.mockResolvedValue(null);
    mockRepo.findIdempotencyKey.mockResolvedValue(existingKeyRecord);

    const result = await service.bookAppointment(userId, idempotencyKey, standardInput);

    expect(result.isCached).toBe(true);
    expect(result.statusCode).toBe(201);
    expect(result.data.id).toBe(200);

    // Verifies no second DB transaction or appointment creation was triggered
    expect(mockRepo.lockShiftForUpdate).not.toHaveBeenCalled();
    expect(mockRepo.createAppointment).not.toHaveBeenCalled();
  });

  // ===================================================================
  // 2. REPLAY REQUEST WITH DIFFERENT PAYLOAD (PAYLOAD MISMATCH)
  // ===================================================================
  it('rejects request with 422 when same Idempotency-Key is reused with a different payload', async () => {
    const idempotencyKey = 'idemp-mismatch-key-002';
    const userId = 10;

    // Hash of original input
    const originalInput = { ...standardInput, reason: 'Original request reason' };
    const originalHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(originalInput))
      .digest('hex');

    const existingKeyRecord: IdempotencyKeyRow = {
      key: idempotencyKey,
      user_id: userId,
      request_path: '/api/appointments',
      request_hash: originalHash, // differs from current request
      status: 'SUCCESS',
      response_code: 201,
      response_body: {},
      created_at: new Date(),
      locked_at: new Date(),
    };

    mockRepo.insertIdempotencyKey.mockResolvedValue(null);
    mockRepo.findIdempotencyKey.mockResolvedValue(existingKeyRecord);

    // Send different payload
    const modifiedInput: CreateAppointmentInput = {
      ...standardInput,
      reason: 'Modified attacker payload trying to hijack idempotency key',
    };

    await expect(
      service.bookAppointment(userId, idempotencyKey, modifiedInput),
    ).rejects.toThrow(
      expect.objectContaining({
        statusCode: 422,
        code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
        message: 'Idempotency key has already been used with a different request payload',
      }),
    );
  });

  // ===================================================================
  // 3. CONCURRENT REQUEST IN PROCESSING STATE
  // ===================================================================
  it('rejects request with 409 when Idempotency-Key is currently in PROCESSING status', async () => {
    const idempotencyKey = 'idemp-processing-key-003';
    const userId = 10;

    const requestHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(standardInput))
      .digest('hex');

    const inFlightRecord: IdempotencyKeyRow = {
      key: idempotencyKey,
      user_id: userId,
      request_path: '/api/appointments',
      request_hash: requestHash,
      status: 'PROCESSING',
      response_code: null,
      response_body: null,
      created_at: new Date(),
      locked_at: new Date(),
    };

    mockRepo.insertIdempotencyKey.mockResolvedValue(null);
    mockRepo.findIdempotencyKey.mockResolvedValue(inFlightRecord);

    await expect(
      service.bookAppointment(userId, idempotencyKey, standardInput),
    ).rejects.toThrow(
      expect.objectContaining({
        statusCode: 409,
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'A request with this Idempotency-Key is currently being processed',
      }),
    );
  });

  // ===================================================================
  // 4. CROSS-USER IDEMPOTENCY KEY THEFT ATTEMPT
  // ===================================================================
  it('rejects request with 403 when user attempts to use an Idempotency-Key registered by another user', async () => {
    const idempotencyKey = 'idemp-user-theft-004';
    const attackerUserId = 99;
    const victimUserId = 10;

    const requestHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(standardInput))
      .digest('hex');

    const victimKeyRecord: IdempotencyKeyRow = {
      key: idempotencyKey,
      user_id: victimUserId, // belongs to user 10
      request_path: '/api/appointments',
      request_hash: requestHash,
      status: 'SUCCESS',
      response_code: 201,
      response_body: {},
      created_at: new Date(),
      locked_at: new Date(),
    };

    mockRepo.insertIdempotencyKey.mockResolvedValue(null);
    mockRepo.findIdempotencyKey.mockResolvedValue(victimKeyRecord);

    // Attacker (user 99) tries to use user 10's idempotency key
    await expect(
      service.bookAppointment(attackerUserId, idempotencyKey, standardInput),
    ).rejects.toThrow(
      expect.objectContaining({
        statusCode: 403,
        message: 'Idempotency key does not belong to the current user',
      }),
    );
  });
});
