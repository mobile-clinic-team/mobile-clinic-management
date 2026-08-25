// =====================================================================
// Module:  M4 - Doctor Operations & Master Data
// File:    doctor-ops.routes.ts
// Purpose: Mounts all M4 endpoints. Intended to be wired in the app
//          entrypoint as:
//            app.use('/api', doctorOpsRouter);
//
// Endpoint inventory (per DEVELOPMENT_CONTRACTS.md #7 + this task's
// scope additions for shift-cancel / rating-update, which are implied
// by ARCHITECTURE.md #2.2 but not individually itemized in the table):
//   GET    /api/departments
//   GET    /api/departments/:id
//   POST   /api/departments                     [admin]
//   PUT    /api/departments/:id                 [admin]
//   DELETE /api/departments/:id                 [admin]
//   GET    /api/doctors
//   GET    /api/doctors/:id
//   POST   /api/doctors                         [doctor - self-service, see doctor.service.ts]
//   PUT    /api/doctors/:id                     [doctor(owner) | admin]
//   DELETE /api/doctors/:id                     [admin]
//   GET    /api/doctors/:id/shifts
//   POST   /api/doctors/shifts                  [doctor]
//   PATCH  /api/doctors/shifts/:shiftId/cancel  [doctor]
//   GET    /api/ai/recommend-doctors            [internal service key, not JWT]
//   POST   /api/doctors/:id/ratings             [patient]
//   GET    /api/doctors/:id/ratings
//   PATCH  /api/doctors/ratings/:ratingId        [patient - owner, 24h window]
// =====================================================================
import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware'; // Shared Infra (owned by M1)
import { verifyInternalService } from './middlewares/internalService.middleware';

import * as departmentController from './controllers/department.controller';
import * as doctorController from './controllers/doctor.controller';
import * as shiftController from './controllers/shift.controller';
import * as aiRecommendController from './controllers/ai-recommend.controller';
import * as ratingController from './controllers/rating.controller';

const router = Router();

// ---------------------------------------------------------------------
// Departments (master data)
// ---------------------------------------------------------------------
router.get('/departments', authenticate, departmentController.listDepartments);
router.get('/departments/:id', authenticate, departmentController.getDepartment);
router.post('/departments', authenticate, authorize('admin'), departmentController.createDepartment);
router.put('/departments/:id', authenticate, authorize('admin'), departmentController.updateDepartment);
router.delete('/departments/:id', authenticate, authorize('admin'), departmentController.deleteDepartment);

// ---------------------------------------------------------------------
// AI Recommendation (Dify Custom Tool) — internal service auth, NOT JWT.
// Declared before '/doctors/:id' style routes to keep the router easy
// to scan; Express matching is unaffected since the prefix differs.
// ---------------------------------------------------------------------
router.get('/ai/recommend-doctors', verifyInternalService, aiRecommendController.recommendDoctors);

// ---------------------------------------------------------------------
// Doctor Working Shifts
// NOTE: '/doctors/shifts' (static) is declared before '/doctors/:id'
// (dynamic) purely for readability; both are valid regardless of
// order since they differ in path depth / method.
// ---------------------------------------------------------------------
router.post('/doctors/shifts', authenticate, authorize('doctor'), shiftController.registerOwnShift);
router.patch(
  '/doctors/shifts/:shiftId/cancel',
  authenticate,
  authorize('doctor'),
  shiftController.cancelOwnShift
);
router.get('/doctors/:id/shifts', authenticate, shiftController.listShiftsForDoctor);

// ---------------------------------------------------------------------
// Doctor Ratings
// ---------------------------------------------------------------------
router.post('/doctors/:id/ratings', authenticate, authorize('patient'), ratingController.submitRating);
router.get('/doctors/:id/ratings', authenticate, ratingController.listRatingsForDoctor);
router.patch('/doctors/ratings/:ratingId', authenticate, authorize('patient'), ratingController.updateRating);

// ---------------------------------------------------------------------
// Doctors (profile CRUD) — declared last since '/doctors/:id' is the
// most generic pattern in this group.
// ---------------------------------------------------------------------
router.get('/doctors', authenticate, doctorController.listDoctors);
router.get('/doctors/:id', authenticate, doctorController.getDoctor);
router.post('/doctors', authenticate, authorize('doctor'), doctorController.createOwnDoctorProfile);
router.put('/doctors/:id', authenticate, doctorController.updateDoctor); // ownership checked in service
router.delete('/doctors/:id', authenticate, authorize('admin'), doctorController.deleteDoctor);

export default router;
