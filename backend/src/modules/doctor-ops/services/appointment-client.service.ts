// =====================================================================
// Module:  M4 - Doctor Operations & Master Data
// File:    services/appointment-client.service.ts
// Purpose: Internal Service Interface client to M2 (Appointment
//          Engine), per ARCHITECTURE.md #7.2 / DEVELOPMENT_CONTRACTS.md
//          #5: "Module A tuyệt đối không được thực hiện SQL query trực
//          tiếp vào bảng nghiệp vụ nội bộ của Module B". M4 needs to
//          know an appointment's status/owner to validate a rating
//          submission, so it calls M2's HTTP API instead of
//          `SELECT * FROM appointments`.
//
// DEPENDENCY NOTE [cross-team coordination required]:
//   This assumes M2 exposes `GET /api/appointments/:id` (detail by
//   id). The published contract (DEVELOPMENT_CONTRACTS.md #7) only
//   lists `GET /api/appointments` (list). If M2 does not add a
//   get-by-id endpoint, this call will 404 and rating submission will
//   fail — please confirm with Member 2 or adjust the path below.
//
// Runs in-process (same Express app / same host), so this is a plain
// loopback HTTP call, not a call to another physical service. The
// original caller's JWT is forwarded so M2 applies its own
// authorization rules (patient can only fetch their own appointment).
// =====================================================================
import { AppointmentSummary } from '../types/doctor-ops.types';

const INTERNAL_BASE_URL = process.env.INTERNAL_API_BASE_URL ?? 'http://localhost:3000';

export interface AppointmentServiceClient {
  getAppointmentById(appointmentId: number, callerAuthHeader: string): Promise<AppointmentSummary | null>;
}

export class HttpAppointmentServiceClient implements AppointmentServiceClient {
  async getAppointmentById(appointmentId: number, callerAuthHeader: string): Promise<AppointmentSummary | null> {
    const response = await fetch(`${INTERNAL_BASE_URL}/api/appointments/${appointmentId}`, {
      method: 'GET',
      headers: {
        Authorization: callerAuthHeader,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Appointment service returned ${response.status} for appointment ${appointmentId}`);
    }

    const body = await response.json();
    const data = body.data ?? body; // tolerate either {success,data} or raw DTO

    return {
      id: data.id,
      patientId: data.patientId,
      doctorId: data.doctorId,
      status: data.status,
      startTime: data.startTime,
    };
  }
}
