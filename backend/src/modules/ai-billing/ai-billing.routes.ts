// =====================================================================
// Module:  M1 - AI Assistant & Billing
// File:    ai-billing.routes.ts
// =====================================================================
import { Router } from 'express';
import { authenticate, authorize, optionalAuthenticate } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { asyncHandler } from '../../utils/asyncHandler';
import { aiBillingController } from './ai-billing.controller';
import {
  aiChatSchema,
  invoiceIdParamSchema,
  payInvoiceSchema,
  paymentWebhookSchema,
} from './ai-billing.validation';

const router = Router();

// =====================================================================
// AI Gateway & Medical Consultation Chatbot
// =====================================================================

router.post(
  '/ai/chat',
  authenticate,
  authorize('patient', 'doctor', 'admin'),
  validate(aiChatSchema),
  asyncHandler(aiBillingController.chat),
);

/**
 * GET /api/ai/history/:sessionId
 * Retrieves chat history for a session.
 */
router.get(
  '/ai/history/:sessionId',
  authenticate,
  asyncHandler(aiBillingController.getChatHistory),
);

// =====================================================================
// Invoices & Payment Gateway Integration
// =====================================================================

/**
 * GET /api/invoices
 * Returns all invoices for the authenticated user (patient).
 */
router.get(
  '/invoices',
  authenticate,
  authorize('patient', 'admin'),
  asyncHandler(aiBillingController.getMyInvoices),
);

/**
 * GET /api/invoices/:id
 * Retrieves invoice detail by ID.
 */
router.get(
  '/invoices/:id',
  authenticate,
  authorize('patient', 'doctor', 'admin'),
  validate(invoiceIdParamSchema, 'params'),
  asyncHandler(aiBillingController.getInvoice),
);

/**
 * POST /api/invoices/:id/pay
 * Initiates payment process for an appointment invoice.
 */
router.post(
  '/invoices/:id/pay',
  authenticate,
  authorize('patient', 'admin'),
  validate(invoiceIdParamSchema, 'params'),
  validate(payInvoiceSchema, 'body'),
  asyncHandler(aiBillingController.payInvoice),
);

// =====================================================================
// Payment Webhook (Public Gateway endpoint secured via HMAC + Replay Protection)
// =====================================================================

/**
 * POST /api/webhooks/payment
 * Secure webhook receiver for payment providers (VNPAY, Momo, etc.).
 *
 * Security checks:
 *  1. HMAC-SHA256 signature verification (`x-signature` header)
 *  2. Replay attack window verification (max 300 seconds skew)
 *  3. Idempotent event deduplication (PRIMARY KEY on `payment_webhook_events`)
 *  4. Database transaction locking row with SELECT ... FOR UPDATE (PENDING -> PAID)
 */
router.post(
  '/webhooks/payment',
  validate(paymentWebhookSchema, 'body'),
  asyncHandler(aiBillingController.handlePaymentWebhook),
);

export { router as aiBillingRouter };
