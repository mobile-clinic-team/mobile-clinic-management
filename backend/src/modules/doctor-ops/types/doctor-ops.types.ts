// =====================================================================
// Module:  M4 - Doctor Operations & Master Data
// File:    types/doctor-ops.types.ts
// Purpose: Domain types & DTO response shapes for departments, doctors,
//          shifts, and doctor ratings.
// =====================================================================

export interface Department {
  id: number;
  name: string;
  description: string | null;
  iconUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DoctorRow {
  id: number;
  user_id: number;
  department_id: number;
  bio: string | null;
  consultation_fee: string; // NUMERIC comes back as string from pg
  rating_avg: string;
  rating_count: number;
  created_at: string;
  updated_at: string;
  // Joined columns (optional depending on query)
  department_name?: string;
  // TODO [ARCH-CHANGE candidate]: `doctors` table has no display-name
  // column (see doctor.repository.ts header comment). `contact_email`
  // is a stop-gap sourced from users.email until the team approves a
  // schema change (e.g. doctors.full_name or a doctor_profiles table).
  contact_email?: string;
}

export interface DoctorDTO {
  id: number;
  userId: number;
  departmentId: number;
  departmentName?: string;
  displayName: string; // currently falls back to contact email — see TODO above
  bio: string | null;
  consultationFee: number;
  ratingAvg: number;
  ratingCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ShiftRow {
  id: number;
  doctor_id: number;
  shift_date: string;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShiftDTO {
  id: number;
  doctorId: number;
  shiftDate: string;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  isActive: boolean;
}

export interface RecommendedDoctorDTO {
  id: number;
  name: string;
  specialty: string;
  rating: number;
  consultationFee: number;
  nextAvailableTime: string | null;
}

export interface DoctorRatingRow {
  id: number;
  appointment_id: number;
  doctor_id: number;
  patient_id: number;
  rating_stars: number;
  review_comment: string | null;
  created_at: string;
  updated_at: string;
}

export interface DoctorRatingDTO {
  id: number;
  appointmentId: number;
  doctorId: number;
  patientId: number;
  ratingStars: number;
  reviewComment: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RatingStatsDTO {
  doctorId: number;
  ratingAvg: number;
  ratingCount: number;
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
}

// -----------------------------------------------------------------
// Cross-module Service Interface (M4 consumes, M2 must implement /
// expose). See services/appointment-client.service.ts.
// -----------------------------------------------------------------
export interface AppointmentSummary {
  id: number;
  patientId: number;
  doctorId: number;
  status: 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
  startTime: string;
}
