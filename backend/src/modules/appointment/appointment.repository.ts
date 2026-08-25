// =====================================================================
// Module:  M2 - Appointment Engine
// File:    appointment.repository.ts
// =====================================================================
import { Pool, PoolClient } from 'pg';
import { pool } from '../../config/db';
import {
  AppointmentRow,
  AppointmentWithDetailsRow,
  IdempotencyKeyRow,
  ListAppointmentsQuery,
} from './appointment.types';

export class AppointmentRepository {
  constructor(private readonly db: Pool | PoolClient = pool) {}

  // -------------------------------------------------------------------
  // Idempotency Management
  // -------------------------------------------------------------------

  /**
   * Attempts to atomically insert an idempotency record in PROCESSING state.
   * Returns the inserted row if successful, or null if the key already exists (conflict).
   */
  async insertIdempotencyKey(
    key: string,
    userId: number,
    requestPath: string,
    requestHash: string,
    client?: PoolClient,
  ): Promise<IdempotencyKeyRow | null> {
    const executor = client ?? this.db;
    const { rows } = await executor.query(
      `INSERT INTO idempotency_keys (key, user_id, request_path, request_hash, status, created_at, locked_at)
       VALUES ($1, $2, $3, $4, 'PROCESSING', NOW(), NOW())
       ON CONFLICT (key) DO NOTHING
       RETURNING key, user_id, request_path, request_hash, status, response_code, response_body, created_at, locked_at`,
      [key, userId, requestPath, requestHash],
    );
    return rows[0] ?? null;
  }

  async findIdempotencyKey(key: string, client?: PoolClient): Promise<IdempotencyKeyRow | null> {
    const executor = client ?? this.db;
    const { rows } = await executor.query(
      `SELECT key, user_id, request_path, request_hash, status, response_code, response_body, created_at, locked_at
         FROM idempotency_keys
        WHERE key = $1`,
      [key],
    );
    return rows[0] ?? null;
  }

  async updateIdempotencySuccess(
    key: string,
    responseCode: number,
    responseBody: any,
    client?: PoolClient,
  ): Promise<void> {
    const executor = client ?? this.db;
    await executor.query(
      `UPDATE idempotency_keys
          SET status = 'SUCCESS',
              response_code = $2,
              response_body = $3
        WHERE key = $1`,
      [key, responseCode, JSON.stringify(responseBody)],
    );
  }

  async updateIdempotencyFailed(key: string, client?: PoolClient): Promise<void> {
    const executor = client ?? this.db;
    await executor.query(
      `UPDATE idempotency_keys
          SET status = 'FAILED'
        WHERE key = $1 AND status = 'PROCESSING'`,
      [key],
    );
  }

  async resetIdempotencyToProcessing(
    key: string,
    requestHash: string,
    client?: PoolClient,
  ): Promise<void> {
    const executor = client ?? this.db;
    await executor.query(
      `UPDATE idempotency_keys
          SET status = 'PROCESSING',
              request_hash = $2,
              locked_at = NOW()
        WHERE key = $1`,
      [key, requestHash],
    );
  }

  // -------------------------------------------------------------------
  // Pessimistic Locking & Shift Validation
  // -------------------------------------------------------------------

  /**
   * Acquires a row-level lock (SELECT ... FOR UPDATE) on the doctor's working shift.
   * Must be executed inside an active transaction.
   */
  async lockShiftForUpdate(shiftId: number, client: PoolClient) {
    const { rows } = await client.query(
      `SELECT id, doctor_id, shift_date, start_time, end_time, slot_duration_minutes, is_active
         FROM doctor_working_shifts
        WHERE id = $1
          FOR UPDATE`,
      [shiftId],
    );
    return rows[0] ?? null;
  }

  // -------------------------------------------------------------------
  // Appointment Data Access
  // -------------------------------------------------------------------

  /**
   * Checks if an active appointment already exists at the given time or overlaps.
   */
  async findExistingActiveAppointment(
    doctorId: number,
    startTime: string | Date,
    endTime: string | Date,
    client?: PoolClient,
  ): Promise<AppointmentRow | null> {
    const executor = client ?? this.db;
    const { rows } = await executor.query(
      `SELECT id, patient_id, doctor_id, shift_id, start_time, end_time, status, reason, created_at, updated_at
         FROM appointments
        WHERE doctor_id = $1
          AND status != 'CANCELLED'
          AND (
            start_time = $2 OR (start_time < $3 AND end_time > $2)
          )
        LIMIT 1`,
      [doctorId, startTime, endTime],
    );
    return rows[0] ?? null;
  }

  async createAppointment(
    patientId: number,
    doctorId: number,
    shiftId: number,
    startTime: string | Date,
    endTime: string | Date,
    reason: string | null,
    client: PoolClient,
  ): Promise<AppointmentRow> {
    const { rows } = await client.query(
      `INSERT INTO appointments (patient_id, doctor_id, shift_id, start_time, end_time, status, reason)
       VALUES ($1, $2, $3, $4, $5, 'CONFIRMED', $6)
       RETURNING id, patient_id, doctor_id, shift_id, start_time, end_time, status, reason, created_at, updated_at`,
      [patientId, doctorId, shiftId, startTime, endTime, reason],
    );
    return rows[0];
  }

  async findById(id: number, client?: PoolClient): Promise<AppointmentRow | null> {
    const executor = client ?? this.db;
    const { rows } = await executor.query(
      `SELECT id, patient_id, doctor_id, shift_id, start_time, end_time, status, reason, created_at, updated_at
         FROM appointments
        WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findDoctorByUserId(userId: number, client?: PoolClient): Promise<{ id: number } | null> {
    const executor = client ?? this.db;
    const { rows } = await executor.query(
      `SELECT id FROM doctors WHERE user_id = $1`,
      [userId],
    );
    return rows[0] ?? null;
  }

  async cancelAppointment(id: number, client?: PoolClient): Promise<AppointmentRow | null> {
    const executor = client ?? this.db;
    const { rows } = await executor.query(
      `UPDATE appointments
          SET status = 'CANCELLED',
              updated_at = NOW()
        WHERE id = $1
        RETURNING id, patient_id, doctor_id, shift_id, start_time, end_time, status, reason, created_at, updated_at`,
      [id],
    );
    return rows[0] ?? null;
  }

  async listAppointments(query: ListAppointmentsQuery, client?: PoolClient): Promise<AppointmentWithDetailsRow[]> {
    const executor = client ?? this.db;
    const conditions: string[] = [];
    const params: any[] = [];

    if (query.patientId) {
      params.push(query.patientId);
      conditions.push(`a.patient_id = $${params.length}`);
    }

    if (query.doctorId) {
      params.push(query.doctorId);
      conditions.push(`a.doctor_id = $${params.length}`);
    }

    if (query.status) {
      params.push(query.status);
      conditions.push(`a.status = $${params.length}`);
    }

    if (query.date) {
      params.push(query.date);
      conditions.push(`DATE(a.start_time) = $${params.length}`);
    }

    if (query.startDate) {
      params.push(query.startDate);
      conditions.push(`a.start_time >= $${params.length}`);
    }

    if (query.endDate) {
      params.push(query.endDate);
      conditions.push(`a.start_time <= $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    let paginationClause = '';
    if (query.limit) {
      params.push(query.limit);
      paginationClause += ` LIMIT $${params.length}`;
    }
    if (query.offset) {
      params.push(query.offset);
      paginationClause += ` OFFSET $${params.length}`;
    }

    const { rows } = await executor.query(
      `SELECT a.id, a.patient_id, a.doctor_id, a.shift_id, a.start_time, a.end_time,
              a.status, a.reason, a.created_at, a.updated_at,
              pp.full_name AS patient_name,
              u.email AS patient_email,
              dp.full_name AS doctor_name,
              dept.name AS department_name
         FROM appointments a
         LEFT JOIN users u ON a.patient_id = u.id
         LEFT JOIN patient_profiles pp ON a.patient_id = pp.user_id
         LEFT JOIN doctors d ON a.doctor_id = d.id
         LEFT JOIN patient_profiles dp ON d.user_id = dp.user_id
         LEFT JOIN departments dept ON d.department_id = dept.id
        ${whereClause}
        ORDER BY a.start_time DESC
        ${paginationClause}`,
      params,
    );
    return rows;
  }
}
