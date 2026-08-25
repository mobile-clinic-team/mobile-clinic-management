import { PatientProfileRow, UserRow } from '../../src/modules/patient-identity/patient-identity.types';

export function makeUserRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 1,
    email: 'patient@example.com',
    // bcrypt hash of "Password123" at salt rounds 4 (test-only fixture value).
    password_hash: '$2b$04$Kj8h7l1Q1n8m0V0uQeYhKe2b0Y8s7yFqf1o1eYQwq8h7l1Q1n8m0V',
    role: 'patient',
    is_active: true,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

export function makeProfileRow(overrides: Partial<PatientProfileRow> = {}): PatientProfileRow {
  return {
    id: 10,
    user_id: 1,
    full_name: 'Nguyen Van A',
    phone_number: '0901234567',
    dob: '1995-05-20',
    gender: 'MALE',
    address: '123 Le Loi, Hanoi',
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}
