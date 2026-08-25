// =====================================================================
// Module:  M4 - Doctor Operations & Master Data
// File:    services/ai-recommend.service.ts
// Purpose: Backs `GET /api/ai/recommend-doctors?department=...`, the
//          Dify Custom Tool endpoint (ARCHITECTURE.md #3.4, #2.2).
//          Consumer: Dify, invoked server-to-server through M1's AI
//          Gateway — there is no end-user JWT on this call path (see
//          middlewares/internalService.middleware.ts), so unlike
//          doctor.service.ts we do NOT attempt a per-request M1 user
//          lookup here (no Authorization header to forward). Display
//          name therefore falls back to a generic label until the
//          `doctors.full_name` schema gap (see doctor.repository.ts)
//          is resolved.
// =====================================================================
import { AppError } from '../../../utils/AppError'; // Shared Infra (Base Backend Foundation)
import { DepartmentRepository } from '../repositories/department.repository';
import { DoctorRepository } from '../repositories/doctor.repository';
import { RecommendedDoctorDTO } from '../types/doctor-ops.types';

const DEFAULT_LIMIT = 5;

export class AiRecommendService {
  constructor(
    private readonly doctorRepo: DoctorRepository = new DoctorRepository(),
    private readonly departmentRepo: DepartmentRepository = new DepartmentRepository()
  ) {}

  async recommend(departmentName: string, limit = DEFAULT_LIMIT): Promise<RecommendedDoctorDTO[]> {
    if (!departmentName?.trim()) {
      throw new AppError(400, 'DEPARTMENT_REQUIRED', 'Query param "department" is required');
    }

    const dept = await this.departmentRepo.findByName(departmentName.trim());
    if (!dept) {
      // Not a hard error: Dify's RAG step may pass a department name
      // that doesn't exactly match master data. Return an empty list
      // so the AI can gracefully tell the user no doctor was found,
      // rather than surfacing a raw 404 to the LLM.
      return [];
    }

    const rows = await this.doctorRepo.findRecommendable(dept.name, limit);

    return rows.map((row) => ({
      id: row.id,
      name: `Doctor #${row.id}`, // TODO: replace once doctor display-name schema gap is resolved
      specialty: row.department_name ?? dept.name,
      rating: Number(row.rating_avg),
      consultationFee: Number(row.consultation_fee),
      nextAvailableTime: row.next_available_time ?? null,
    }));
  }
}
