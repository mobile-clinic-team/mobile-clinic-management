// =====================================================================
// Module:  M4 - Doctor Operations & Master Data
// File:    repositories/rating.repository.ts
// Purpose: Data access layer for `doctor_ratings`.
//          Table created in 006_mod4_doctor_ratings.sql, which runs
//          AFTER 003_mod2_appointments.sql (FK -> appointments).
//          appointment_id has a UNIQUE constraint at the DB level, so
//          this repository relies on that for the "1 rating per
//          appointment" business rule instead of a separate
//          check-then-insert (DEVELOPMENT_CONTRACTS.md #9 pattern
//          applied here for the same race-condition reason).
// =====================================================================
import { Pool, PoolClient } from 'pg';
import { pool } from '../../../config/db'; // Shared Infra (Base Backend Foundation)
import { CreateRatingInput, ListRatingsQuery, UpdateRatingInput } from '../dtos/rating.dto';
import { DoctorRatingRow } from '../types/doctor-ops.types';

export class RatingRepository {
  constructor(private readonly db: Pool | PoolClient = pool) {}

  /**
   * Insert with ON CONFLICT DO NOTHING on the UNIQUE(appointment_id)
   * constraint, mirroring the idempotency-key race-condition pattern
   * from ARCHITECTURE.md #6.2 / #9: never "check-then-insert", let
   * Postgres arbitrate concurrent submissions atomically.
   */
  async createIfAbsent(
    doctorId: number,
    patientId: number,
    input: CreateRatingInput,
    client: Pool | PoolClient = this.db
  ): Promise<DoctorRatingRow | null> {
    const { rows } = await client.query(
      `INSERT INTO doctor_ratings (appointment_id, doctor_id, patient_id, rating_stars, review_comment)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (appointment_id) DO NOTHING
       RETURNING id, appointment_id, doctor_id, patient_id, rating_stars,
                 review_comment, created_at, updated_at`,
      [input.appointmentId, doctorId, patientId, input.ratingStars, input.reviewComment ?? null]
    );
    return rows[0] ?? null;
  }

  async findById(id: number): Promise<DoctorRatingRow | null> {
    const { rows } = await this.db.query(
      `SELECT id, appointment_id, doctor_id, patient_id, rating_stars,
              review_comment, created_at, updated_at
         FROM doctor_ratings
        WHERE id = $1`,
      [id]
    );
    return rows[0] ?? null;
  }

  async findByAppointmentId(appointmentId: number): Promise<DoctorRatingRow | null> {
    const { rows } = await this.db.query(
      `SELECT id, appointment_id, doctor_id, patient_id, rating_stars,
              review_comment, created_at, updated_at
         FROM doctor_ratings
        WHERE appointment_id = $1`,
      [appointmentId]
    );
    return rows[0] ?? null;
  }

  async update(
    id: number,
    input: UpdateRatingInput,
    client: Pool | PoolClient = this.db
  ): Promise<DoctorRatingRow | null> {
    const { rows } = await client.query(
      `UPDATE doctor_ratings
          SET rating_stars   = COALESCE($2, rating_stars),
              review_comment = COALESCE($3, review_comment)
        WHERE id = $1
        RETURNING id, appointment_id, doctor_id, patient_id, rating_stars,
                  review_comment, created_at, updated_at`,
      [id, input.ratingStars ?? null, input.reviewComment ?? null]
    );
    return rows[0] ?? null;
  }

  async findAndCountByDoctor(
    doctorId: number,
    query: ListRatingsQuery
  ): Promise<{ items: DoctorRatingRow[]; total: number }> {
    const countResult = await this.db.query(
      `SELECT COUNT(*)::int AS total FROM doctor_ratings WHERE doctor_id = $1`,
      [doctorId]
    );
    const offset = (query.page - 1) * query.pageSize;
    const { rows } = await this.db.query(
      `SELECT id, appointment_id, doctor_id, patient_id, rating_stars,
              review_comment, created_at, updated_at
         FROM doctor_ratings
        WHERE doctor_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3`,
      [doctorId, query.pageSize, offset]
    );
    return { items: rows, total: countResult.rows[0].total };
  }

  /** AVG/COUNT aggregate + 1-5 star distribution, used to refresh doctors.rating_avg/rating_count. */
  async getAggregateForDoctor(
    doctorId: number,
    client: Pool | PoolClient = this.db
  ): Promise<{ avg: number; count: number; distribution: Record<number, number> }> {
    const { rows } = await client.query(
      `SELECT rating_stars, COUNT(*)::int AS cnt
         FROM doctor_ratings
        WHERE doctor_id = $1
        GROUP BY rating_stars`,
      [doctorId]
    );

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let total = 0;
    let sum = 0;
    for (const row of rows) {
      distribution[row.rating_stars] = row.cnt;
      total += row.cnt;
      sum += row.rating_stars * row.cnt;
    }
    const avg = total > 0 ? Math.round((sum / total) * 100) / 100 : 0;
    return { avg, count: total, distribution };
  }
}
