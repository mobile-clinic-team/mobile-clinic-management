// =====================================================================
// Module:  M4 - Doctor Operations & Master Data
// File:    middlewares/internalService.middleware.ts
// Purpose: `GET /api/ai/recommend-doctors` is called by Dify's Custom
//          Tool through M1's AI Gateway (ARCHITECTURE.md #3.4) — a
//          server-to-server call, NOT an end-user request. It has no
//          patient/doctor JWT to check with `authenticate`/`authorize`.
//          Instead it is protected by a shared secret that only the
//          Backend (M1 Gateway -> M4) knows, kept in `.env`
//          (ARCHITECTURE.md #3.4 "Toàn bộ API Key lưu tại Backend
//          Environment Variables"). Android/Dify never see this key
//          directly.
//
// DECISION FLAG: this key/header scheme is a local addition for this
// endpoint since DEVELOPMENT_CONTRACTS.md doesn't yet specify how
// internal-only endpoints authenticate. If the team prefers a
// different shared convention (e.g. a common `internalOnly`
// middleware in `backend/src/middlewares/`), this should move there
// as an [ARCH-CHANGE] so all modules reuse the same mechanism.
// =====================================================================
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../../utils/AppError';

const INTERNAL_API_KEY = process.env.INTERNAL_SERVICE_API_KEY;

export function verifyInternalService(req: Request, _res: Response, next: NextFunction): void {
  if (!INTERNAL_API_KEY) {
    // Fail closed: never allow this endpoint to run "open" because an
    // operator forgot to set the secret.
    next(new AppError(500, 'INTERNAL_KEY_NOT_CONFIGURED', 'INTERNAL_SERVICE_API_KEY is not configured'));
    return;
  }

  const provided = req.header('X-Internal-Api-Key');
  if (!provided || provided !== INTERNAL_API_KEY) {
    next(new AppError(401, 'UNAUTHORIZED_INTERNAL_CALL', 'Missing or invalid internal service credentials'));
    return;
  }

  next();
}
