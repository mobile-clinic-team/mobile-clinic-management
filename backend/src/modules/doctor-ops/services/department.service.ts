// =====================================================================
// Module:  M4 - Doctor Operations & Master Data
// File:    services/department.service.ts
// =====================================================================
import { AppError } from '../../../utils/AppError'; // Shared Infra (Base Backend Foundation)
import { DepartmentRepository } from '../repositories/department.repository';
import { CreateDepartmentInput, UpdateDepartmentInput } from '../dtos/department.dto';
import { Department } from '../types/doctor-ops.types';

export class DepartmentService {
  constructor(private readonly repo: DepartmentRepository = new DepartmentRepository()) {}

  async list(): Promise<Department[]> {
    return this.repo.findAll();
  }

  async getById(id: number): Promise<Department> {
    const dept = await this.repo.findById(id);
    if (!dept) throw new AppError(404, 'DEPARTMENT_NOT_FOUND', `Department ${id} not found`);
    return dept;
  }

  async create(input: CreateDepartmentInput): Promise<Department> {
    const existing = await this.repo.findByName(input.name);
    if (existing) {
      throw new AppError(409, 'DEPARTMENT_NAME_TAKEN', `Department name "${input.name}" already exists`);
    }
    return this.repo.create(input);
  }

  async update(id: number, input: UpdateDepartmentInput): Promise<Department> {
    await this.getById(id); // 404 guard

    if (input.name) {
      const existing = await this.repo.findByName(input.name);
      if (existing && existing.id !== id) {
        throw new AppError(409, 'DEPARTMENT_NAME_TAKEN', `Department name "${input.name}" already exists`);
      }
    }

    const updated = await this.repo.update(id, input);
    if (!updated) throw new AppError(404, 'DEPARTMENT_NOT_FOUND', `Department ${id} not found`);
    return updated;
  }

  async delete(id: number): Promise<void> {
    await this.getById(id); // 404 guard
    try {
      await this.repo.delete(id);
    } catch (err: any) {
      if (err.code === '23503') {
        // FK violation: doctors.department_id -> departments.id (ON DELETE RESTRICT)
        throw new AppError(
          409,
          'DEPARTMENT_IN_USE',
          'Cannot delete a department that still has doctors assigned to it'
        );
      }
      throw err;
    }
  }
}
