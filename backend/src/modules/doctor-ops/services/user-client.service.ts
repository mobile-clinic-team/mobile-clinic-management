// =====================================================================
// Module:  M4 - Doctor Operations & Master Data
// File:    services/user-client.service.ts
// Purpose: Internal Service Interface client to M1 (Patient & Identity)
//          for resolving a doctor's display name.
//
// SCHEMA GAP THIS WORKS AROUND (see repositories/doctor.repository.ts
// header): `doctors` has no name column, and `users` (M1) only has
// `email` (no `full_name` — that field currently only exists on
// `patient_profiles`, which is patient-only). Until the team approves
// an [ARCH-CHANGE] to add a name field for doctors, this client calls
// M1 for `email` and the service layer falls back to a generic label.
//
// PROPOSED endpoint (not yet in DEVELOPMENT_CONTRACTS.md #7 — flag to
// Member 1 for confirmation before relying on this in production):
//   GET /api/internal/users/:id  -> { id, email, role }
// If M1 does not expose this, `getUserById` degrades gracefully to
// `null` and callers fall back to a generic "Doctor #<id>" label.
// =====================================================================

const INTERNAL_BASE_URL = process.env.INTERNAL_API_BASE_URL ?? 'http://localhost:3000';

export interface UserSummary {
  id: number;
  email: string;
  role: 'patient' | 'doctor' | 'admin';
}

export interface UserServiceClient {
  getUserById(userId: number, callerAuthHeader: string): Promise<UserSummary | null>;
}

export class HttpUserServiceClient implements UserServiceClient {
  async getUserById(userId: number, callerAuthHeader: string): Promise<UserSummary | null> {
    try {
      const response = await fetch(`${INTERNAL_BASE_URL}/api/internal/users/${userId}`, {
        method: 'GET',
        headers: {
          Authorization: callerAuthHeader,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) return null;
      const body = await response.json();
      return body.data ?? body;
    } catch {
      // Non-fatal: display name is a UX nicety, never block a doctor-ops
      // request just because the user-lookup interface is unavailable.
      return null;
    }
  }
}
