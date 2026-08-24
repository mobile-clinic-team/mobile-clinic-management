import { UserRole } from '../../utils/jwt.util';

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  role: UserRole;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PatientProfileRow {
  id: number;
  user_id: number;
  full_name: string;
  phone_number: string | null;
  dob: string | null;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
  address: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface RegisterDto {
  email: string;
  password: string;
  fullName: string;
  phoneNumber?: string;
  dob?: string;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  address?: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface UpdateProfileDto {
  fullName?: string;
  phoneNumber?: string;
  dob?: string;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  address?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/** Safe user shape returned to clients - never expose password_hash. */
export interface PublicUser {
  id: number;
  email: string;
  role: UserRole;
  isActive: boolean;
}

export interface PublicPatientProfile {
  id: number;
  userId: number;
  fullName: string;
  phoneNumber: string | null;
  dob: string | null;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
  address: string | null;
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    isActive: row.is_active,
  };
}

export function toPublicProfile(row: PatientProfileRow): PublicPatientProfile {
  return {
    id: row.id,
    userId: row.user_id,
    fullName: row.full_name,
    phoneNumber: row.phone_number,
    dob: row.dob,
    gender: row.gender,
    address: row.address,
  };
}
