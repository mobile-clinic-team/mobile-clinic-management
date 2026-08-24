import { PoolClient } from 'pg';
import { pool } from '../../config/db';
import { RegisterDto, UpdateProfileDto, UserRow, PatientProfileRow } from './patient-identity.types';
import { UserRole } from '../../utils/jwt.util';

export const patientIdentityRepository = {
  async findUserByEmail(email: string): Promise<UserRow | null> {
    const { rows } = await pool.query<UserRow>(
      `SELECT id, email, password_hash, role, is_active, created_at, updated_at
       FROM users
       WHERE email = $1`,
      [email],
    );
    return rows[0] ?? null;
  },

  async findUserById(id: number): Promise<UserRow | null> {
    const { rows } = await pool.query<UserRow>(
      `SELECT id, email, password_hash, role, is_active, created_at, updated_at
       FROM users
       WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  },

  /**
   * Inserts the `users` row within an existing transaction client.
   * Role is hardcoded to 'patient' here because this repository backs
   * the public self-registration endpoint; doctor/admin accounts are
   * provisioned through a separate admin-only flow (M4 / M1-admin).
   */
  async createUser(
    client: PoolClient,
    email: string,
    passwordHash: string,
    role: UserRole = 'patient',
  ): Promise<UserRow> {
    const { rows } = await client.query<UserRow>(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, $3)
       RETURNING id, email, password_hash, role, is_active, created_at, updated_at`,
      [email, passwordHash, role],
    );
    return rows[0];
  },

  async createPatientProfile(
    client: PoolClient,
    userId: number,
    dto: RegisterDto,
  ): Promise<PatientProfileRow> {
    const { rows } = await client.query<PatientProfileRow>(
      `INSERT INTO patient_profiles (user_id, full_name, phone_number, dob, gender, address)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, user_id, full_name, phone_number, dob, gender, address, created_at, updated_at`,
      [
        userId,
        dto.fullName,
        dto.phoneNumber ?? null,
        dto.dob ?? null,
        dto.gender ?? null,
        dto.address ?? null,
      ],
    );
    return rows[0];
  },

  async findProfileByUserId(userId: number): Promise<PatientProfileRow | null> {
    const { rows } = await pool.query<PatientProfileRow>(
      `SELECT id, user_id, full_name, phone_number, dob, gender, address, created_at, updated_at
       FROM patient_profiles
       WHERE user_id = $1`,
      [userId],
    );
    return rows[0] ?? null;
  },

  async updateProfileByUserId(
    userId: number,
    dto: UpdateProfileDto,
  ): Promise<PatientProfileRow | null> {
    // Build a dynamic SET clause from only the provided fields so we
    // never overwrite untouched columns with NULL.
    const fieldMap: Record<string, unknown> = {
      full_name: dto.fullName,
      phone_number: dto.phoneNumber,
      dob: dto.dob,
      gender: dto.gender,
      address: dto.address,
    };

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    for (const [column, value] of Object.entries(fieldMap)) {
      if (value !== undefined) {
        setClauses.push(`${column} = $${i}`);
        values.push(value);
        i += 1;
      }
    }

    if (setClauses.length === 0) {
      return this.findProfileByUserId(userId);
    }

    values.push(userId);

    const { rows } = await pool.query<PatientProfileRow>(
      `UPDATE patient_profiles
       SET ${setClauses.join(', ')}
       WHERE user_id = $${i}
       RETURNING id, user_id, full_name, phone_number, dob, gender, address, created_at, updated_at`,
      values,
    );
    return rows[0] ?? null;
  },

  async deleteProfileByUserId(userId: number): Promise<boolean> {
    const result = await pool.query(
      `DELETE FROM patient_profiles WHERE user_id = $1`,
      [userId],
    );
    return (result.rowCount ?? 0) > 0;
  },
};
