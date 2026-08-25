// =====================================================================
// Module:  M2 - Appointment Engine
// File:    appointment.types.ts
// =====================================================================

export type AppointmentStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';
export type IdempotencyStatus = 'PROCESSING' | 'SUCCESS' | 'FAILED';

export interface AppointmentRow {
  id: number;
  patient_id: number;
  doctor_id: number;
  shift_id: number;
  start_time: Date | string;
  end_time: Date | string;
  status: AppointmentStatus;
  reason: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface AppointmentWithDetailsRow extends AppointmentRow {
  doctor_name?: string;
  department_name?: string;
  patient_name?: string;
  patient_email?: string;
}

export interface IdempotencyKeyRow {
  key: string;
  user_id: number;
  request_path: string;
  request_hash: string;
  status: IdempotencyStatus;
  response_code: number | null;
  response_body: any;
  created_at: Date | string;
  locked_at: Date | string;
}

export interface CreateAppointmentInput {
  doctorId: number;
  shiftId: number;
  startTime: string;
  endTime?: string;
  reason?: string;
}

export interface CancelAppointmentInput {
  cancelReason?: string;
}

export interface AppointmentDTO {
  id: number;
  patientId: number;
  doctorId: number;
  shiftId: number;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
  doctorName?: string;
  departmentName?: string;
  patientName?: string;
  patientEmail?: string;
}

export interface ListAppointmentsQuery {
  status?: AppointmentStatus;
  date?: string;
  startDate?: string;
  endDate?: string;
  doctorId?: number;
  patientId?: number;
  limit?: number;
  offset?: number;
}
