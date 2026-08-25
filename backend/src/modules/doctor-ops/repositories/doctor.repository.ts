// =====================================================================
// Module:  M4 - Doctor Operations & Master Data
// File:    repositories/doctor.repository.ts
// Purpose: Data access layer for `doctors`, joined only with
//          `departments` (also M4-owned — a same-module JOIN, not a
//          cross-module violation).
//
// IMPORTANT SCHEMA GAP (flagged, not silently patched):
//   `doctors` has NO display-name column, and `users` (owned by M1)
//   only stores `email` — there is no `full_name` for a doctor
//   anywhere in the current schema (`patient_profiles.full_name` is
//   patient-only). This repository therefore does NOT join `users`
//   directly (that would be a forbidden cross-module SQL read per
//   ARCHITECTURE.md #7.2 / DEVELOPMENT_CONTRACTS.md #5). Instead,
//   doctor.service.ts resolves a display name via the M1-owned
//   UserServiceClient Service Interface (see
//   services/user-client.service.ts). Recommend the team approve an
//   [ARCH-CHANGE] to add `doctors.full_name` (or a dedicated
//   `doctor_profiles` table) to avoid this indirection long-term.
// =====================================================================
import { Pool, PoolClient } from 'pg';
import { pool } from '../../../config/db'; // Shared Infra (Base Backend Foundation)
import { CreateDoctorProfileInput, ListDoctorsQuery, UpdateDoctorProfileInput } from '../dtos/doctor.dto';
import { DoctorRow } from '../types/doctor-ops.types';

const BASE_SELECT = `
  SELECT d.id, d.user_id, d.department_id, d.bio, d.consultation_fee,
         d.rating_avg, d.rating_count, d.created_at, d.updated_at,
         dep.name AS department_name
    FROM doctors d
    JOIN departments dep ON dep.id = d.department_id
`;

export class DoctorRepository {
  constructor(private readonly db: Pool | PoolClient = pool) {}

  async findById(id: number): Promise<DoctorRow | null> {
    const { rows } = await this.db.query(`${BASE_SELECT} WHERE d.id = $1`, [id]);
    return rows[0] ?? null;
  }

  async findByUserId(userId: number): Promise<DoctorRow | null> {
    const { rows } = await this.db.query(`${BASE_SELECT} WHERE d.user_id = $1`, [userId]);
    return rows[0] ?? null;
  }

  async findAndCount(query: ListDoctorsQuery): Promise<{ items: DoctorRow[]; total: number }> {
    const conditions: string[] = [];
    const params: any[] = [];

    if (query.departmentId) {
      params.push(query.departmentId);
      conditions.push(`d.department_id = $${params.length}`);
    }
    if (query.search) {
      params.push(`%${query.search}%`);
      conditions.push(`(dep.name ILIKE $${params.length} OR d.bio ILIKE $${params.length})`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.db.query(
      `SELECT COUNT(*)::int AS total
         FROM doctors d
         JOIN departments dep ON dep.id = d.department_id
        ${whereClause}`,
      params
    );

    const offset = (query.page - 1) * query.pageSize;
    params.push(query.pageSize, offset);

    const { rows } = await this.db.query(
      `${BASE_SELECT}
        ${whereClause}
        ORDER BY d.rating_avg DESC, d.id ASC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return { items: rows, total: countResult.rows[0].total };
  }

  async create(userId: number, input: CreateDoctorProfileInput): Promise<DoctorRow> {
    const { rows } = await this.db.query(
      `INSERT INTO doctors (user_id, department_id, bio, consultation_fee)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, department_id, bio, consultation_fee,
                 rating_avg, rating_count, created_at, updated_at`,
      [userId, input.departmentId, input.bio ?? null, input.consultationFee ?? 0]
    );
    return rows[0];
  }

  async update(id: number, input: UpdateDoctorProfileInput): Promise<DoctorRow | null> {
    const { rows } = await this.db.query(
      `UPDATE doctors
          SET department_id     = COALESCE($2, department_id),
              bio                = COALESCE($3, bio),
              consultation_fee   = COALESCE($4, consultation_fee)
        WHERE id = $1
        RETURNING id, user_id, department_id, bio, consultation_fee,
                  rating_avg, rating_count, created_at, updated_at`,
      [id, input.departmentId ?? null, input.bio ?? null, input.consultationFee ?? null]
    );
    return rows[0] ?? null;
  }

  /** Returns true if deleted. Throws on FK violation (23503) e.g. active shifts/appointments. */
  async delete(id: number): Promise<boolean> {
    const { rowCount } = await this.db.query(`DELETE FROM doctors WHERE id = $1`, [id]);
    return (rowCount ?? 0) > 0;
  }

  /**
   * Used by the AI recommendation query and by rating aggregate updates.
   * `client` allows callers to pass a transaction-bound PoolClient.
   */
  async updateRatingAggregate(
    doctorId: number,
    ratingAvg: number,
    ratingCount: number,
    client: Pool | PoolClient = this.db
  ): Promise<void> {
    await client.query(
      `UPDATE doctors SET rating_avg = $2, rating_count = $3 WHERE id = $1`,
      [doctorId, ratingAvg, ratingCount]
    );
  }

  /**
   * Doctors with the best rating in a department who have at least one
   * active, upcoming shift. Backs GET /api/ai/recommend-doctors.
   * Deliberately does NOT join `users` — see file header note.
   */
  async findRecommendable(departmentName: string, limit: number): Promise<
    Array<DoctorRow & { next_available_time: string | null }>
  > {
    const { rows } = await this.db.query(
      `SELECT d.id, d.user_id, d.department_id, d.bio, d.consultation_fee,
              d.rating_avg, d.rating_count, d.created_at, d.updated_at,
              dep.name AS department_name,
              MIN(s.shift_date + s.start_time) AS next_available_time
         FROM doctors d
         JOIN departments dep ON dep.id = d.department_id
         LEFT JOIN doctor_working_shifts s
                ON s.doctor_id = d.id
               AND s.is_active = TRUE
               AND (s.shift_date > CURRENT_DATE
                    OR (s.shift_date = CURRENT_DATE AND s.start_time >= CURRENT_TIME))
        WHERE dep.name ILIKE $1
        GROUP BY d.id, dep.name
       HAVING COUNT(s.id) > 0
        ORDER BY d.rating_avg DESC, d.rating_count DESC
        LIMIT $2`,
      [departmentName, limit]
    );
    return rows;
  }
}
