// =====================================================================
// Module:  M1 - AI Assistant & Billing
// File:    ai-billing.controller.ts
// =====================================================================
import { Request, Response } from 'express';
import { AppError } from '../../utils/AppError';
import { sendSuccess } from '../../utils/ResponseFormatter';
import { AiBillingService } from './ai-billing.service';

function getAuthUser(req: Request) {
  if (!req.user) {
    throw AppError.unauthorized('Authentication required');
  }
  return {
    userId: req.user.sub,
    role: req.user.role,
  };
}

export class AiBillingController {
  constructor(private readonly service: AiBillingService = new AiBillingService()) {}

  /**
   * POST /api/ai/chat
   * Chatbot AI gateway for medical assistance.
   */
  chat = async (req: Request, res: Response): Promise<void> => {
    const { userId } = getAuthUser(req);
    const result = await this.service.chatWithAi(userId, req.body);
    sendSuccess(res, result, 200);
  };

  /**
   * GET /api/ai/history/:sessionId
   * Get chat conversation history by session.
   */
  getChatHistory = async (req: Request, res: Response): Promise<void> => {
    const { userId } = getAuthUser(req);
    const { sessionId } = req.params;
    const history = await this.service.getChatHistory(userId, sessionId);
    sendSuccess(res, history, 200);
  };

  /**
   * POST /api/invoices/:id/pay
   * Initiates payment for an invoice, generating QR code and payment gateway URL.
   */
  payInvoice = async (req: Request, res: Response): Promise<void> => {
    const invoiceId = Number(req.params.id);
    const { userId, role } = getAuthUser(req);
    const result = await this.service.payInvoice(invoiceId, userId, role, req.body);
    sendSuccess(res, result, 200);
  };

  /**
   * GET /api/invoices/:id
   * Get invoice detail.
   */
  getInvoice = async (req: Request, res: Response): Promise<void> => {
    const invoiceId = Number(req.params.id);
    const { userId, role } = getAuthUser(req);
    const result = await this.service.getInvoiceById(invoiceId, userId, role);
    sendSuccess(res, result, 200);
  };

  /**
   * GET /api/invoices
   * Get all invoices for the authenticated patient.
   */
  getMyInvoices = async (req: Request, res: Response): Promise<void> => {
    const { userId } = getAuthUser(req);
    const result = await this.service.getInvoicesByPatient(userId);
    sendSuccess(res, result, 200);
  };

  /**
   * POST /api/webhooks/payment
   * Secure webhook endpoint for payment gateways (VNPAY / Momo).
   * Validates HMAC-SHA256 signature, 5-minute replay window, and idempotency.
   */
  handlePaymentWebhook = async (req: Request, res: Response): Promise<void> => {
    const signature = (
      req.headers['x-signature'] ||
      req.headers['x-webhook-signature'] ||
      req.headers['x-hub-signature-256']
    ) as string | undefined;

    const timestamp = (
      req.headers['x-timestamp'] ||
      req.body?.timestamp
    ) as string | number | undefined;

    const rawBody = (req as any).rawBody || (typeof req.body === 'string' ? req.body : undefined);

    const result = await this.service.handlePaymentWebhook(req.body, signature, timestamp, rawBody);
    res.status(200).json(result);
  };
}

export const aiBillingController = new AiBillingController();
