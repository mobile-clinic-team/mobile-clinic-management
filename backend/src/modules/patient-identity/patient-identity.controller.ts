import { Request, Response } from 'express';
import { AppError } from '../../utils/AppError';
import { patientIdentityService } from './patient-identity.service';

export const patientIdentityController = {
  async register(req: Request, res: Response) {
    const result = await patientIdentityService.register(req.body);
    return res.status(201).json({
      success: true,
      data: result,
    });
  },

  async login(req: Request, res: Response) {
    const result = await patientIdentityService.login(req.body);
    return res.status(200).json({
      success: true,
      data: result,
    });
  },

  async refresh(req: Request, res: Response) {
    const result = await patientIdentityService.refreshAccessToken(
      req.body.refreshToken,
    );
    return res.status(200).json({
      success: true,
      data: result,
    });
  },

  async getProfile(req: Request, res: Response) {
    // req.user is guaranteed by `authenticate` middleware run before this.
    const userId = req.user!.sub;
    const profile = await patientIdentityService.getMyProfile(userId);
    return res.status(200).json({
      success: true,
      data: profile,
    });
  },

  async updateProfile(req: Request, res: Response) {
    const userId = req.user!.sub;
    const profile = await patientIdentityService.updateMyProfile(userId, req.body);
    return res.status(200).json({
      success: true,
      data: profile,
    });
  },

  async deleteProfile(req: Request, res: Response) {
    const userId = req.user!.sub;
    await patientIdentityService.deleteMyProfile(userId);
    return res.status(204).send();
  },
};

// Guard used above documented inline; re-exported for clarity if referenced elsewhere.
export function assertAuthenticated(req: Request) {
  if (!req.user) throw AppError.unauthorized('Authentication required');
  return req.user;
}
