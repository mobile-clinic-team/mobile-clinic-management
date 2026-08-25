// =====================================================================
// Module:  M4 - Doctor Operations & Master Data
// File:    services/shift.service.ts
// =====================================================================
import { AppError } from '../../../utils/AppError'; // Shared Infra (Base Backend Foundation)
import { DoctorRepository } from '../repositories/doctor.repository';
import { ShiftRepository } from '../repositories/shift.repository';
import { CreateShiftInput, ListShiftsQuery } from '../dtos/shift.dto';
import { ShiftDTO, ShiftRow } from '../types/doctor-ops.types';

function toDTO(row: ShiftRow): ShiftDTO {
  return {
    id: row.id,
    doctorId: row.doctor_id,
    shiftDate: row.shift_date,
    startTime: row.start_time,
    endTime: row.end_time,
    slotDurationMinutes: row.slot_duration_minutes,
    isActive: row.is_active,
  };
}

export class ShiftService {
  constructor(
    private readonly shiftRepo: ShiftRepository = new ShiftRepository(),
    private readonly doctorRepo: DoctorRepository = new DoctorRepository()
  ) {}

  async listForDoctor(doctorId: number, query: ListShiftsQuery): Promise<ShiftDTO[]> {
    const doctor = await this.doctorRepo.findById(doctorId);
    if (!doctor) throw new AppError(404, 'DOCTOR_NOT_FOUND', `Doctor ${doctorId} not found`);

    const rows = await this.shiftRepo.findByDoctor(doctorId, query.date, query.onlyActive);
    return rows.map(toDTO);
  }

  /** Doctor registers a shift for their OWN profile (resolved from their JWT userId). */
  async registerOwnShift(requesterUserId: number, input: CreateShiftInput): Promise<ShiftDTO> {
    const doctor = await this.doctorRepo.findByUserId(requesterUserId);
    if (!doctor) {
      throw new AppError(
        404,
        'DOCTOR_PROFILE_NOT_FOUND',
        'You must create a doctor profile before registering shifts'
      );
    }

    const overlapping = await this.shiftRepo.findOverlapping(
      doctor.id,
      input.shiftDate,
      input.startTime,
      input.endTime
    );
    if (overlapping.length > 0) {
      throw new AppError(
        409,
        'SHIFT_OVERLAP',
        'This shift overlaps with an existing active shift on the same date',
        overlapping.map((s) => ({ shiftId: s.id, startTime: s.start_time, endTime: s.end_time }))
      );
    }

    try {
      const row = await this.shiftRepo.create(doctor.id, input);
      return toDTO(row);
    } catch (err: any) {
      if (err.code === '23505') {
        // uq_doctor_shift_slot (doctor_id, shift_date, start_time)
        throw new AppError(409, 'SHIFT_OVERLAP', 'A shift already starts at this exact time on this date');
      }
      throw err;
    }
  }

  /** Doctor cancels (deactivates) one of their OWN shifts. Row is preserved for M2's FK. */
  async cancelOwnShift(requesterUserId: number, shiftId: number): Promise<ShiftDTO> {
    const doctor = await this.doctorRepo.findByUserId(requesterUserId);
    if (!doctor) {
      throw new AppError(404, 'DOCTOR_PROFILE_NOT_FOUND', 'Doctor profile not found for this account');
    }

    const shift = await this.shiftRepo.findById(shiftId);
    if (!shift) throw new AppError(404, 'SHIFT_NOT_FOUND', `Shift ${shiftId} not found`);
    if (shift.doctor_id !== doctor.id) {
      throw new AppError(403, 'FORBIDDEN', 'You may only cancel your own shifts');
    }
    if (!shift.is_active) {
      throw new AppError(409, 'SHIFT_ALREADY_CANCELLED', 'This shift is already inactive');
    }

    const updated = await this.shiftRepo.deactivate(shiftId);
    return toDTO(updated!);
  }
}
