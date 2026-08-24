import { Pool, PoolClient } from 'pg';
import { env } from './env';

export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  // Unexpected error on idle client - log and let the process supervisor restart if fatal.
  // eslint-disable-next-line no-console
  console.error('Unexpected PostgreSQL pool error:', err);
});

/**
 * Runs `fn` inside a single DB transaction (BEGIN/COMMIT/ROLLBACK).
 * Use this for any multi-statement write that must be atomic
 * (e.g. Register: insert into `users` + `patient_profiles` together).
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
