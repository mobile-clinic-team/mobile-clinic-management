// =====================================================================
// Module:  M2 - Appointment Engine
// File:    appointment.service.ts
// =====================================================================
import crypto from 'crypto';
import { Pool } from 'pg';
import { pool } from '../../config/db';
import { AppError } from '../../utils/AppError';
import { AppointmentRepository } from './appointment.repository';
import {
  AppointmentDTO,
  AppointmentRow,
  AppointmentWithDetailsRow,
  CancelAppointmentInput,
  CreateAppointmentInput,
  ListAppointmentsQuery,
} from './appointment.types';

function toDTO(row: AppointmentRow | AppointmentWithDetailsRow): AppointmentDTO {
  const details = row as AppointmentWithDetailsRow;
  return {
    id: row.id,
    patientId: row.patient_id,
    doctorId: row.doctor_id,
    shiftId: row.shift_id,
    startTime: row.start_time instanceof Date ? row.start_time.toISOString() : new Date(row.start_time).toISOString(),
    endTime: row.end_time instanceof Date ? row.end_time.toISOString() : new Date(row.end_time).toISOString(),
    status: row.status,
    reason: row.reason,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(row.updated_at).toISOString(),
    doctorName: details.doctor_name,
    departmentName: details.department_name,
    patientName: details.patient_name,
    patientEmail: details.patient_email,
  };
}

export class AppointmentService {
  constructor(
    private readonly repo: AppointmentRepository = new AppointmentRepository(),
    private readonly dbPool: Pool = pool,
  ) {}

  /**
   * Books an appointment with strict Idempotency and Concurrency Protection (Pessimistic Locking).
   *
   * Flow:
   * 1. Register Idempotency key atomically (or check cached response/processing status).
   * 2. Open DB Transaction (READ COMMITTED).
   * 3. Acquire row-level lock on `doctor_working_shifts` via SELECT ... FOR UPDATE.
   * 4. Validate slot availability and check for active overlapping appointments.
   * 5. Insert appointment and update idempotency key to SUCCESS.
   * 6. Commit transaction and return response.
   */
  async bookAppointment(
    userId: number,
    idempotencyKey: string,
    input: CreateAppointmentInput,
    requestPath = '/api/appointments',
  ): Promise<{ isCached: boolean; statusCode: number; data: AppointmentDTO }> {
    const requestHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(input))
      .digest('hex');

    // -----------------------------------------------------------------
    // Phase 1: Idempotency Key Handling
    // -----------------------------------------------------------------
    const insertedKey = await this.repo.insertIdempotencyKey(
      idempotencyKey,
      userId,
      requestPath,
      requestHash,
    );

    if (!insertedKey) {
      // Key already exists -> fetch and inspect state
      const existingKey = await this.repo.findIdempotencyKey(idempotencyKey);
      if (!existingKey) {
        throw AppError.internal('Failed to resolve idempotency key status');
      }

      if (existingKey.user_id !== userId) {
        throw AppError.forbidden('Idempotency key does not belong to the current user');
      }

      if (existingKey.request_hash !== requestHash) {
        throw new AppError(
          422,
          'IDEMPOTENCY_PAYLOAD_MISMATCH',
          'Idempotency key has already been used with a different request payload',
        );
      }

      if (existingKey.status === 'PROCESSING') {
        throw new AppError(
          409,
          'IDEMPOTENCY_CONFLICT',
          'A request with this Idempotency-Key is currently being processed',
        );
      }

      if (existingKey.status === 'SUCCESS') {
        return {
          isCached: true,
          statusCode: existingKey.response_code || 200,
          data: existingKey.response_body,
        };
      }

      if (existingKey.status === 'FAILED') {
        // Allow retry after failed previous attempt
        await this.repo.resetIdempotencyToProcessing(idempotencyKey, requestHash);
      }
    }

    // -----------------------------------------------------------------
    // Phase 2: Transaction, Pessimistic Locking & Slot Booking
    // -----------------------------------------------------------------
    const client = await this.dbPool.connect();

    try {
      await client.query('BEGIN');
      await client.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');

      // 1. Pessimistic Lock on the doctor's shift
      const shift = await this.repo.lockShiftForUpdate(input.shiftId, client);
      if (!shift) {
        throw AppError.notFound(`Doctor working shift ${input.shiftId} not found`);
      }

      if (!shift.is_active) {
        throw AppError.conflict('The selected doctor working shift has been cancelled or is inactive');
      }

      if (shift.doctor_id !== input.doctorId) {
        throw AppError.badRequest('The selected shift does not belong to the specified doctor');
      }

      // 2. Validate booking time window
      const startDate = new Date(input.startTime);
      if (isNaN(startDate.getTime())) {
        throw AppError.badRequest('startTime must be a valid timestamp');
      }

      const slotMinutes = shift.slot_duration_minutes || 30;
      const endDate = input.endTime
        ? new Date(input.endTime)
        : new Date(startDate.getTime() + slotMinutes * 60000);

      if (isNaN(endDate.getTime()) || endDate <= startDate) {
        throw AppError.badRequest('endTime must be greater than startTime');
      }

      // Prevent booking in the past (with 5 min grace window for network latency)
      if (startDate.getTime() < Date.now() - 5 * 60 * 1000) {
        throw AppError.badRequest('Cannot book an appointment in the past');
      }

      // 3. Check for existing active conflicting booking
      const conflict = await this.repo.findExistingActiveAppointment(
        input.doctorId,
        startDate.toISOString(),
        endDate.toISOString(),
        client,
      );

      if (conflict) {
        throw AppError.conflict(
          'This appointment slot is already booked. Please choose another time.',
        );
      }

      // 4. Insert new appointment
      const newAppointment = await this.repo.createAppointment(
        userId,
        input.doctorId,
        input.shiftId,
        startDate.toISOString(),
        endDate.toISOString(),
        input.reason ?? null,
        client,
      );

      const responseDto = toDTO(newAppointment);

      // 5. Update idempotency record to SUCCESS inside the transaction
      await this.repo.updateIdempotencySuccess(idempotencyKey, 201, responseDto, client);

      await client.query('COMMIT');

      return {
        isCached: false,
        statusCode: 201,
        data: responseDto,
      };
    } catch (err: any) {
      await client.query('ROLLBACK');

      // Update idempotency to FAILED so future retries are unblocked
      try {
        await this.repo.updateIdempotencyFailed(idempotencyKey);
      } catch (idempErr) {
        // eslint-disable-next-line no-console
        console.error('Failed to update idempotency status to FAILED:', idempErr);
      }

      // Postgres unique violation on idx_unique_active_doctor_slot (concurrency safety net)
      if (err?.code === '23505') {
        throw AppError.conflict('This appointment slot is already booked. Please select another slot.');
      }

      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Cancels an appointment.
   * Patients may cancel their own appointments; Doctors may cancel their assigned appointments; Admins may cancel any.
   */
  async cancelAppointment(
    userId: number,
    role: string,
    appointmentId: number,
    _input?: CancelAppointmentInput,
  ): Promise<AppointmentDTO> {
    const appointment = await this.repo.findById(appointmentId);
    if (!appointment) {
      throw AppError.notFound(`Appointment ${appointmentId} not found`);
    }

    if (appointment.status === 'CANCELLED') {
      throw AppError.conflict('Appointment is already cancelled');
    }

    if (appointment.status === 'COMPLETED') {
      throw AppError.conflict('Cannot cancel an appointment that has already been completed');
    }

    // Role-based ownership check
    if (role === 'patient') {
      if (appointment.patient_id !== userId) {
        throw AppError.forbidden('You are not authorized to cancel this appointment');
      }
    } else if (role === 'doctor') {
      const doctor = await this.repo.findDoctorByUserId(userId);
      if (!doctor || doctor.id !== appointment.doctor_id) {
        throw AppError.forbidden('You are not authorized to cancel this appointment');
      }
    }

    const updated = await this.repo.cancelAppointment(appointmentId);
    if (!updated) {
      throw AppError.internal('Failed to cancel appointment');
    }

    return toDTO(updated);
  }

  /**
   * Retrieves a list of appointments filtered by query parameters and authorized role.
   */
  async listAppointments(
    userId: number,
    role: string,
    query: ListAppointmentsQuery,
  ): Promise<AppointmentDTO[]> {
    const effectiveQuery: ListAppointmentsQuery = { ...query };

    if (role === 'patient') {
      effectiveQuery.patientId = userId;
    } else if (role === 'doctor') {
      const doctor = await this.repo.findDoctorByUserId(userId);
      if (!doctor) {
        return [];
      }
      effectiveQuery.doctorId = doctor.id;
    }

    const rows = await this.repo.listAppointments(effectiveQuery);
    return rows.map(toDTO);
  }

  /**
   * Retrieves single appointment details by ID.
   */
  async getAppointmentById(
    userId: number,
    role: string,
    appointmentId: number,
  ): Promise<AppointmentDTO> {
    const appointment = await this.repo.findById(appointmentId);
    if (!appointment) {
      throw AppError.notFound(`Appointment ${appointmentId} not found`);
    }

    if (role === 'patient' && appointment.patient_id !== userId) {
      throw AppError.forbidden('You are not authorized to view this appointment');
    } else if (role === 'doctor') {
      const doctor = await this.repo.findDoctorByUserId(userId);
      if (!doctor || doctor.id !== appointment.doctor_id) {
        throw AppError.forbidden('You are not authorized to view this appointment');
      }
    }

    return toDTO(appointment);
  }
}
