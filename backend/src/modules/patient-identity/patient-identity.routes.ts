import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { asyncHandler } from '../../utils/asyncHandler';
import { patientIdentityController } from './patient-identity.controller';
import {
  loginSchema,
  refreshTokenSchema,
  registerSchema,
  updateProfileSchema,
} from './patient-identity.validation';

const router = Router();

// ---------------------------------------------------------------------
// Auth endpoints - public
// ---------------------------------------------------------------------
router.post(
  '/auth/register',
  validate(registerSchema),
  asyncHandler(patientIdentityController.register),
);

router.post(
  '/auth/login',
  validate(loginSchema),
  asyncHandler(patientIdentityController.login),
);

router.post(
  '/auth/refresh',
  validate(refreshTokenSchema),
  asyncHandler(patientIdentityController.refresh),
);

// ---------------------------------------------------------------------
// Patient profile endpoints - requires a valid JWT.
// authorize('patient') restricts these self-service endpoints to
// accounts with the 'patient' role; doctors/admins manage patients
// through separate M4/admin endpoints, not this self-service surface.
// ---------------------------------------------------------------------
router.get(
  '/patients/profile',
  authenticate,
  authorize('patient'),
  asyncHandler(patientIdentityController.getProfile),
);

router.put(
  '/patients/profile',
  authenticate,
  authorize('patient'),
  validate(updateProfileSchema),
  asyncHandler(patientIdentityController.updateProfile),
);

router.delete(
  '/patients/profile',
  authenticate,
  authorize('patient'),
  asyncHandler(patientIdentityController.deleteProfile),
);

export { router as patientIdentityRouter };
