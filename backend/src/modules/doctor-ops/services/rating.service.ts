// =====================================================================
// Module:  M4 - Doctor Operations & Master Data
// File:    services/rating.service.ts
// Purpose: Doctor Rating Engine — validation against M2's appointment
//          state (via Service Interface, not direct SQL — see
//          appointment-client.service.ts) + transactional aggregate
//          recompute on `doctors.rating_avg` / `rating_count`
//          (ARCHITECTURE.md #6.4, DEVELOPMENT_CONTRACTS.md #11).
// =====================================================================
import { pool } from '../../../config/db'; // Shared Infra (Base Backend Foundation)
import { AppError } from '../../../utils/AppError';
import { DoctorRepository } from '../repositories/doctor.repository';
import { RatingRepository } from '../repositories/rating.repository';
import { CreateRatingInput, ListRatingsQuery, UpdateRatingInput } from '../dtos/rating.dto';
import { DoctorRatingDTO, DoctorRatingRow, RatingStatsDTO } from '../types/doctor-ops.types';
import { AppointmentServiceClient, HttpAppointmentServiceClient } from './appointment-client.service';

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h, per DEVELOPMENT_CONTRACTS.md #11

function toDTO(row: DoctorRatingRow): DoctorRatingDTO {
  return {
    id: row.id,
    appointmentId: row.appointment_id,
    doctorId: row.doctor_id,
    patientId: row.patient_id,
    ratingStars: row.rating_stars,
    reviewComment: row.review_comment,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class RatingService {
  constructor(
    private readonly ratingRepo: RatingRepository = new RatingRepository(),
    private readonly doctorRepo: DoctorRepository = new DoctorRepository(),
    private readonly appointmentClient: AppointmentServiceClient = new HttpAppointmentServiceClient()
  ) {}

  async submit(
    doctorId: number,
    requesterUserId: number,
    input: CreateRatingInput,
    callerAuthHeader: string
  ): Promise<DoctorRatingDTO> {
    const doctor = await this.doctorRepo.findById(doctorId);
    if (!doctor) throw new AppError(404, 'DOCTOR_NOT_FOUND', `Doctor ${doctorId} not found`);

    const appointment = await this.appointmentClient.getAppointmentById(input.appointmentId, callerAuthHeader);
    if (!appointment) {
      throw new AppError(404, 'APPOINTMENT_NOT_FOUND', `Appointment ${input.appointmentId} not found`);
    }
    if (appointment.doctorId !== doctorId) {
      throw new AppError(422, 'APPOINTMENT_DOCTOR_MISMATCH', 'This appointment was not with the specified doctor');
    }
    if (appointment.patientId !== requesterUserId) {
      throw new AppError(403, 'FORBIDDEN', 'You may only rate your own appointments');
    }
    if (appointment.status !== 'COMPLETED') {
      throw new AppError(
        422,
        'APPOINTMENT_NOT_COMPLETED',
        'You can only rate an appointment after it has been marked COMPLETED'
      );
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const created = await this.ratingRepo.createIfAbsent(doctorId, requesterUserId, input, client);
      if (!created) {
        await client.query('ROLLBACK');
        throw new AppError(409, 'ALREADY_RATED', 'This appointment has already been rated');
      }

      const { avg, count } = await this.ratingRepo.getAggregateForDoctor(doctorId, client);
      await this.doctorRepo.updateRatingAggregate(doctorId, avg, count, client);

      await client.query('COMMIT');
      return toDTO(created);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async update(
    ratingId: number,
    requesterUserId: number,
    input: UpdateRatingInput
  ): Promise<DoctorRatingDTO> {
    const existing = await this.ratingRepo.findById(ratingId);
    if (!existing) throw new AppError(404, 'RATING_NOT_FOUND', `Rating ${ratingId} not found`);
    if (existing.patient_id !== requesterUserId) {
      throw new AppError(403, 'FORBIDDEN', 'You may only edit your own rating');
    }

    const ageMs = Date.now() - new Date(existing.created_at).getTime();
    if (ageMs > EDIT_WINDOW_MS) {
      throw new AppError(409, 'EDIT_WINDOW_EXPIRED', 'Ratings can only be edited within 24 hours of creation');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const updated = await this.ratingRepo.update(ratingId, input, client);
      if (!updated) throw new AppError(404, 'RATING_NOT_FOUND', `Rating ${ratingId} not found`);

      if (input.ratingStars !== undefined) {
        const { avg, count } = await this.ratingRepo.getAggregateForDoctor(existing.doctor_id, client);
        await this.doctorRepo.updateRatingAggregate(existing.doctor_id, avg, count, client);
      }

      await client.query('COMMIT');
      return toDTO(updated);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async listForDoctor(
    doctorId: number,
    query: ListRatingsQuery
  ): Promise<{ items: DoctorRatingDTO[]; total: number; page: number; pageSize: number; stats: RatingStatsDTO }> {
    const doctor = await this.doctorRepo.findById(doctorId);
    if (!doctor) throw new AppError(404, 'DOCTOR_NOT_FOUND', `Doctor ${doctorId} not found`);

    const [{ items, total }, aggregate] = await Promise.all([
      this.ratingRepo.findAndCountByDoctor(doctorId, query),
      this.ratingRepo.getAggregateForDoctor(doctorId),
    ]);

    return {
      items: items.map(toDTO),
      total,
      page: query.page,
      pageSize: query.pageSize,
      stats: {
        doctorId,
        ratingAvg: aggregate.avg,
        ratingCount: aggregate.count,
        distribution: {
          '1': aggregate.distribution[1],
          '2': aggregate.distribution[2],
          '3': aggregate.distribution[3],
          '4': aggregate.distribution[4],
          '5': aggregate.distribution[5],
        },
      },
    };
  }
}
