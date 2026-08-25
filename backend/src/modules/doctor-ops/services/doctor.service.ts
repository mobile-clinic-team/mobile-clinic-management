// =====================================================================
// Module:  M4 - Doctor Operations & Master Data
// File:    services/doctor.service.ts
//
// OWNERSHIP DECISION [flagged for team visibility]:
//   RBAC Matrix (DEVELOPMENT_CONTRACTS.md #6) grants `doctor` the
//   right to "Quản lý hồ sơ bác sĩ" (manage own doctor profile) and
//   `admin` only "duyệt hồ sơ bác sĩ" (approve/review), not explicit
//   CRUD-on-behalf-of. To avoid inventing an admin-creates-for-others
//   flow (which would need a cross-module user lookup / role check
//   that isn't in any published contract), this service implements:
//     - create(): SELF-SERVICE ONLY — a `doctor`-role user creates
//       their own profile (`user_id` taken from the JWT, never from
//       the request body).
//     - update(): profile owner (doctor) OR `admin`.
//     - delete(): `admin` only.
//   If the team wants admin-created profiles for others, that needs a
//   published M1 "does this user exist & have role=doctor" service
//   interface first — flag as [ARCH-CHANGE] if desired.
// =====================================================================
import { AppError } from '../../../utils/AppError'; // Shared Infra (Base Backend Foundation)
import { DoctorRepository } from '../repositories/doctor.repository';
import { DepartmentRepository } from '../repositories/department.repository';
import { CreateDoctorProfileInput, ListDoctorsQuery, UpdateDoctorProfileInput } from '../dtos/doctor.dto';
import { DoctorDTO, DoctorRow } from '../types/doctor-ops.types';
import { UserServiceClient, HttpUserServiceClient } from './user-client.service';

function toDTO(row: DoctorRow, displayName: string): DoctorDTO {
  return {
    id: row.id,
    userId: row.user_id,
    departmentId: row.department_id,
    departmentName: row.department_name,
    displayName,
    bio: row.bio,
    consultationFee: Number(row.consultation_fee),
    ratingAvg: Number(row.rating_avg),
    ratingCount: row.rating_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class DoctorService {
  constructor(
    private readonly repo: DoctorRepository = new DoctorRepository(),
    private readonly departmentRepo: DepartmentRepository = new DepartmentRepository(),
    private readonly userClient: UserServiceClient = new HttpUserServiceClient()
  ) {}

  private async resolveDisplayName(row: DoctorRow, callerAuthHeader: string): Promise<string> {
    const user = await this.userClient.getUserById(row.user_id, callerAuthHeader);
    return user?.email ?? `Doctor #${row.id}`; // TODO: replace with real name once schema gap is fixed
  }

  async list(query: ListDoctorsQuery, callerAuthHeader: string): Promise<{ items: DoctorDTO[]; total: number; page: number; pageSize: number }> {
    const { items, total } = await this.repo.findAndCount(query);
    const dtos = await Promise.all(
      items.map(async (row) => toDTO(row, await this.resolveDisplayName(row, callerAuthHeader)))
    );
    return { items: dtos, total, page: query.page, pageSize: query.pageSize };
  }

  async getById(id: number, callerAuthHeader: string): Promise<DoctorDTO> {
    const row = await this.repo.findById(id);
    if (!row) throw new AppError(404, 'DOCTOR_NOT_FOUND', `Doctor ${id} not found`);
    return toDTO(row, await this.resolveDisplayName(row, callerAuthHeader));
  }

  async createOwnProfile(userId: number, input: CreateDoctorProfileInput, callerAuthHeader: string): Promise<DoctorDTO> {
    const dept = await this.departmentRepo.findById(input.departmentId);
    if (!dept) throw new AppError(422, 'DEPARTMENT_NOT_FOUND', `Department ${input.departmentId} not found`);

    const existing = await this.repo.findByUserId(userId);
    if (existing) {
      throw new AppError(409, 'DOCTOR_PROFILE_EXISTS', 'A doctor profile already exists for this account');
    }

    try {
      const row = await this.repo.create(userId, input);
      return toDTO(row, await this.resolveDisplayName(row, callerAuthHeader));
    } catch (err: any) {
      if (err.code === '23505') {
        // uq_doctors_user_id race: two concurrent create calls for the same user.
        throw new AppError(409, 'DOCTOR_PROFILE_EXISTS', 'A doctor profile already exists for this account');
      }
      if (err.code === '23503') {
        throw new AppError(422, 'DEPARTMENT_NOT_FOUND', `Department ${input.departmentId} not found`);
      }
      throw err;
    }
  }

  async update(
    id: number,
    input: UpdateDoctorProfileInput,
    requester: { userId: number; role: string },
    callerAuthHeader: string
  ): Promise<DoctorDTO> {
    const row = await this.repo.findById(id);
    if (!row) throw new AppError(404, 'DOCTOR_NOT_FOUND', `Doctor ${id} not found`);

    const isOwner = row.user_id === requester.userId;
    if (!isOwner && requester.role !== 'admin') {
      throw new AppError(403, 'FORBIDDEN', 'You may only update your own doctor profile');
    }

    if (input.departmentId) {
      const dept = await this.departmentRepo.findById(input.departmentId);
      if (!dept) throw new AppError(422, 'DEPARTMENT_NOT_FOUND', `Department ${input.departmentId} not found`);
    }

    const updated = await this.repo.update(id, input);
    if (!updated) throw new AppError(404, 'DOCTOR_NOT_FOUND', `Doctor ${id} not found`);
    return toDTO(updated, await this.resolveDisplayName(updated, callerAuthHeader));
  }

  async delete(id: number): Promise<void> {
    const row = await this.repo.findById(id);
    if (!row) throw new AppError(404, 'DOCTOR_NOT_FOUND', `Doctor ${id} not found`);
    try {
      await this.repo.delete(id);
    } catch (err: any) {
      if (err.code === '23503') {
        throw new AppError(
          409,
          'DOCTOR_IN_USE',
          'Cannot delete a doctor profile that still has shifts, appointments, or ratings referencing it'
        );
      }
      throw err;
    }
  }
}
