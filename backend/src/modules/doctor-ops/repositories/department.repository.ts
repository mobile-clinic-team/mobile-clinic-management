// =====================================================================
// Module:  M4 - Doctor Operations & Master Data
// File:    repositories/department.repository.ts
// Purpose: Data access layer for `departments`. Owned exclusively by
//          M4 — no other module may query this table directly
//          (ARCHITECTURE.md #7.2 / DEVELOPMENT_CONTRACTS.md #5).
// =====================================================================
import { Pool, PoolClient } from 'pg';
import { pool } from '../../../config/db'; // Shared Infra (Base Backend Foundation)
import { CreateDepartmentInput, UpdateDepartmentInput } from '../dtos/department.dto';
import { Department } from '../types/doctor-ops.types';

function mapRow(row: any): Department {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    iconUrl: row.icon_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class DepartmentRepository {
  constructor(private readonly db: Pool | PoolClient = pool) {}

  async findAll(): Promise<Department[]> {
    const { rows } = await this.db.query(
      `SELECT id, name, description, icon_url, created_at, updated_at
         FROM departments
        ORDER BY name ASC`
    );
    return rows.map(mapRow);
  }

  async findById(id: number): Promise<Department | null> {
    const { rows } = await this.db.query(
      `SELECT id, name, description, icon_url, created_at, updated_at
         FROM departments
        WHERE id = $1`,
      [id]
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async findByName(name: string): Promise<Department | null> {
    const { rows } = await this.db.query(
      `SELECT id, name, description, icon_url, created_at, updated_at
         FROM departments
        WHERE name = $1`,
      [name]
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async create(input: CreateDepartmentInput): Promise<Department> {
    const { rows } = await this.db.query(
      `INSERT INTO departments (name, description, icon_url)
       VALUES ($1, $2, $3)
       RETURNING id, name, description, icon_url, created_at, updated_at`,
      [input.name, input.description ?? null, input.iconUrl ?? null]
    );
    return mapRow(rows[0]);
  }

  async update(id: number, input: UpdateDepartmentInput): Promise<Department | null> {
    const { rows } = await this.db.query(
      `UPDATE departments
          SET name        = COALESCE($2, name),
              description = COALESCE($3, description),
              icon_url    = COALESCE($4, icon_url)
        WHERE id = $1
        RETURNING id, name, description, icon_url, created_at, updated_at`,
      [id, input.name ?? null, input.description ?? null, input.iconUrl ?? null]
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  /** Returns true if deleted, false if not found. Throws on FK violation (23503). */
  async delete(id: number): Promise<boolean> {
    const { rowCount } = await this.db.query(`DELETE FROM departments WHERE id = $1`, [id]);
    return rowCount > 0;
  }
}
