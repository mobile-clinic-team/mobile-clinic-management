// =====================================================================
// Module:  M4 - Doctor Operations & Master Data
// File:    controllers/ai-recommend.controller.ts
// Purpose: GET /api/ai/recommend-doctors?department=...
//          Consumer: Dify Custom Tool (via M1 AI Gateway). Protected
//          by verifyInternalService, not authenticate/authorize — see
//          middlewares/internalService.middleware.ts.
// =====================================================================
import { Request, Response } from 'express';
import { asyncHandler } from '../../../utils/asyncHandler'; // Shared Infra
import { sendSuccess } from '../../../utils/ResponseFormatter'; // Shared Infra
import { AiRecommendService } from '../services/ai-recommend.service';

const service = new AiRecommendService();

export const recommendDoctors = asyncHandler(async (req: Request, res: Response) => {
  const department = String(req.query.department ?? '');
  const limit = req.query.limit ? Number(req.query.limit) : undefined;

  const doctors = await service.recommend(department, limit);
  sendSuccess(res, doctors);
});
