// =====================================================================
// Module:  M4 - Doctor Operations & Master Data
// File:    repositories/shift.repository.ts
// Purpose: Data access layer for `doctor_working_shifts`.
//          NOTE: M2 (Appointment Engine) takes SELECT ... FOR UPDATE
//          locks on THIS table at booking time (ARCHITECTURE.md #6.1).
//          M4 must not change that row shape/semantics without an
//          [ARCH-CHANGE] PR, since M2 depends on it.
// =====================================================================
import { Pool, PoolClient } from 'pg';
import { pool } from '../../../config/db'; // Shared Infra (Base Backend Foundation)
import { CreateShiftInput } from '../dtos/shift.dto';
import { ShiftRow } from '../types/doctor-ops.types';

export class ShiftRepository {
  constructor(private readonly db: Pool | PoolClient = pool) {}

  async findByDoctor(doctorId: number, date?: string, onlyActive = true): Promise<ShiftRow[]> {
    const conditions: string[] = ['doctor_id = $1'];
    const params: any[] = [doctorId];

    if (date) {
      params.push(date);
      conditions.push(`shift_date = $${params.length}`);
    }
    if (onlyActive) {
      conditions.push('is_active = TRUE');
    }

    const { rows } = await this.db.query(
      `SELECT id, doctor_id, shift_date, start_time, end_time,
              slot_duration_minutes, is_active, created_at, updated_at
         FROM doctor_working_shifts
        WHERE ${conditions.join(' AND ')}
        ORDER BY shift_date ASC, start_time ASC`,
      params
    );
    return rows;
  }

  async findById(id: number): Promise<ShiftRow | null> {
    const { rows } = await this.db.query(
      `SELECT id, doctor_id, shift_date, start_time, end_time,
              slot_duration_minutes, is_active, created_at, updated_at
         FROM doctor_working_shifts
        WHERE id = $1`,
      [id]
    );
    return rows[0] ?? null;
  }

  /** Overlap check: existing ACTIVE shifts for the doctor on the same date whose time ranges intersect. */
  async findOverlapping(doctorId: number, shiftDate: string, startTime: string, endTime: string): Promise<ShiftRow[]> {
    const { rows } = await this.db.query(
      `SELECT id, doctor_id, shift_date, start_time, end_time,
              slot_duration_minutes, is_active, created_at, updated_at
         FROM doctor_working_shifts
        WHERE doctor_id = $1
          AND shift_date = $2
          AND is_active = TRUE
          AND start_time < $4
          AND end_time   > $3`,
      [doctorId, shiftDate, startTime, endTime]
    );
    return rows;
  }

  async create(doctorId: number, input: CreateShiftInput): Promise<ShiftRow> {
    const { rows } = await this.db.query(
      `INSERT INTO doctor_working_shifts
         (doctor_id, shift_date, start_time, end_time, slot_duration_minutes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, doctor_id, shift_date, start_time, end_time,
                 slot_duration_minutes, is_active, created_at, updated_at`,
      [doctorId, input.shiftDate, input.startTime, input.endTime, input.slotDurationMinutes]
    );
    return rows[0];
  }

  /** Soft-cancel: sets is_active = FALSE. Row is preserved because M2's
   *  appointments.shift_id FK references it. */
  async deactivate(id: number): Promise<ShiftRow | null> {
    const { rows } = await this.db.query(
      `UPDATE doctor_working_shifts
          SET is_active = FALSE
        WHERE id = $1
        RETURNING id, doctor_id, shift_date, start_time, end_time,
                  slot_duration_minutes, is_active, created_at, updated_at`,
      [id]
    );
    return rows[0] ?? null;
  }
}
