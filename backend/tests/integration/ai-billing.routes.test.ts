// =====================================================================
// Module:  M1 - AI Assistant & Billing
// Test:    integration/ai-billing.routes.test.ts
// Purpose: Integration tests for AI Billing HTTP endpoints:
//          - POST /api/ai/chat (Authentication + Gateway)
//          - GET /api/invoices, GET /api/invoices/:id
//          - POST /api/invoices/:id/pay (Payment initialization)
//          - POST /api/webhooks/payment (HMAC validation, replay attack, deduplication)
// =====================================================================

import crypto from 'crypto';
import request from 'supertest';
import { env } from '../../src/config/env';
import { AiBillingRepository } from '../../src/modules/ai-billing/ai-billing.repository';
import { aiBillingRouter } from '../../src/modules/ai-billing/ai-billing.routes';
import { InvoiceRow, PaymentWebhookEventRow } from '../../src/modules/ai-billing/ai-billing.types';
import { generateAccessToken } from '../../src/utils/jwt.util';
import { buildTestApp } from '../helpers/buildTestApp';

// Mock DB pool and transaction
jest.mock('../../src/config/db', () => ({
  pool: { connect: jest.fn(), query: jest.fn() },
  withTransaction: jest.fn((fn: (client: unknown) => Promise<unknown>) => fn({})),
}));

// Mock global fetch for Dify
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

function generateHmacSignature(payload: Record<string, unknown>, secret = env.payment.webhookSecret): string {
  const canonical = `${payload.eventId}:${payload.invoiceId}:${payload.status}:${payload.timestamp}`;
  return crypto.createHmac('sha256', secret).update(canonical).digest('hex');
}

function makeInvoiceRow(overrides: Partial<InvoiceRow> = {}): InvoiceRow {
  return {
    id: 1,
    appointment_id: 10,
    patient_id: 10,
    amount: 250000,
    status: 'PENDING',
    payment_method: 'VNPAY',
    transaction_ref: null,
    paid_at: null,
    created_at: new Date('2026-08-26T08:00:00Z'),
    updated_at: new Date('2026-08-26T08:00:00Z'),
    ...overrides,
  };
}

describe('AI Billing Routes Integration Tests (Task 2.5)', () => {
  let app: ReturnType<typeof buildTestApp>;

  const patientToken = generateAccessToken({ sub: 10, role: 'patient' });
  const doctorToken = generateAccessToken({ sub: 20, role: 'doctor' });
  const adminToken = generateAccessToken({ sub: 99, role: 'admin' });

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildTestApp(aiBillingRouter);
  });

  // ===================================================================
  // 1. POST /api/ai/chat
  // ===================================================================
  describe('POST /api/ai/chat', () => {
    it('requires authentication (401 without Bearer token)', async () => {
      const res = await request(app)
        .post('/api/ai/chat')
        .send({ message: 'Tôi bị đau họng' });

      expect(res.status).toBe(401);
    });

    it('rejects empty message body (422 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ message: '' });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('successfully calls AI Chat endpoint for authenticated patient', async () => {
      jest.spyOn(AiBillingRepository.prototype, 'saveConversationMessage').mockResolvedValue({
        id: 1,
        user_id: 10,
        session_id: 'session-123',
        message_role: 'user',
        message_content: 'Tôi bị đau rát họng',
        metadata: null,
        created_at: new Date(),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          answer: 'Bạn nên đến khám tại Khoa Tai Mũi Họng.',
          conversation_id: 'dify-conv-123',
          message_id: 'msg-1',
          metadata: { suggested_doctor_id: 5 },
        }),
      });

      const res = await request(app)
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ message: 'Tôi bị đau rát họng' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reply).toBe('Bạn nên đến khám tại Khoa Tai Mũi Họng.');
      expect(res.body.data.suggestedDoctorId).toBe(5);
      expect(res.body.data.disclaimer).toBeDefined();
    });
  });

  // ===================================================================
  // 2. GET /api/invoices & GET /api/invoices/:id
  // ===================================================================
  describe('GET /api/invoices', () => {
    it('returns invoices for the authenticated patient', async () => {
      jest.spyOn(AiBillingRepository.prototype, 'findInvoicesByPatientId').mockResolvedValueOnce([
        makeInvoiceRow({ id: 1, amount: 250000 }),
      ]);

      const res = await request(app)
        .get('/api/invoices')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].amount).toBe(250000);
    });

    it('returns 403 when a doctor role attempts to access patient invoices list', async () => {
      const res = await request(app)
        .get('/api/invoices')
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('GET /api/invoices/:id', () => {
    it('blocks Patient A from viewing Invoice of Patient B (403 Forbidden)', async () => {
      // Invoice belongs to patient_id = 99, but patientToken belongs to sub = 10
      jest.spyOn(AiBillingRepository.prototype, 'findInvoiceById').mockResolvedValueOnce(
        makeInvoiceRow({ id: 5, patient_id: 99 }),
      );

      const res = await request(app)
        .get('/api/invoices/5')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('allows Admin to view any invoice regardless of ownership', async () => {
      jest.spyOn(AiBillingRepository.prototype, 'findInvoiceById').mockResolvedValueOnce(
        makeInvoiceRow({ id: 5, patient_id: 99 }),
      );

      const res = await request(app)
        .get('/api/invoices/5')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(5);
    });
  });

  // ===================================================================
  // 3. POST /api/invoices/:id/pay
  // ===================================================================
  describe('POST /api/invoices/:id/pay', () => {
    it('initiates payment and returns paymentUrl + QR payload', async () => {
      jest.spyOn(AiBillingRepository.prototype, 'findInvoiceById').mockResolvedValueOnce(
        makeInvoiceRow({ id: 1, patient_id: 10, status: 'PENDING' }),
      );
      jest.spyOn(AiBillingRepository.prototype, 'updateInvoiceStatus').mockResolvedValueOnce(
        makeInvoiceRow({ id: 1, status: 'PENDING' }),
      );

      const res = await request(app)
        .post('/api/invoices/1/pay')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ paymentMethod: 'VNPAY' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.paymentUrl).toContain('sandbox.vnpay.vn');
      expect(res.body.data.qrCode).toContain('VNPAYQR');
    });
  });

  // ===================================================================
  // 4. POST /api/webhooks/payment
  // ===================================================================
  describe('POST /api/webhooks/payment', () => {
    it('rejects webhook request with missing signature (401 Unauthorized)', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const payload = {
        eventId: 'evt_no_sig',
        invoiceId: 1,
        amount: 250000,
        status: 'SUCCESS',
        provider: 'VNPAY',
        timestamp: nowSec,
      };

      const res = await request(app)
        .post('/api/webhooks/payment')
        .send(payload);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Missing webhook signature');
    });

    it('rejects webhook with invalid signature (401 Unauthorized)', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const payload = {
        eventId: 'evt_bad_sig',
        invoiceId: 1,
        amount: 250000,
        status: 'SUCCESS',
        provider: 'VNPAY',
        timestamp: nowSec,
      };

      const res = await request(app)
        .post('/api/webhooks/payment')
        .set('X-Payment-Signature', 'sha256=invalid_signature_hex')
        .set('X-Payment-Timestamp', String(nowSec))
        .send(payload);

      expect(res.status).toBe(401);
      expect(res.body.error.message).toContain('Invalid webhook HMAC-SHA256 signature');
    });

    it('successfully processes valid signed webhook payload', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const payload = {
        eventId: 'evt_route_valid_001',
        invoiceId: 1,
        amount: 250000,
        status: 'SUCCESS' as const,
        provider: 'VNPAY',
        transactionRef: 'VNP_123',
        timestamp: nowSec,
      };

      const validSig = generateHmacSignature(payload);

      jest.spyOn(AiBillingRepository.prototype, 'findWebhookEvent').mockResolvedValueOnce(null);
      jest.spyOn(AiBillingRepository.prototype, 'insertWebhookEvent').mockResolvedValueOnce({
        event_id: 'evt_route_valid_001',
        invoice_id: 1,
        provider: 'VNPAY',
        payload: {},
        status: 'RECEIVED',
        created_at: new Date(),
      });
      jest.spyOn(AiBillingRepository.prototype, 'findInvoiceByIdForUpdate').mockResolvedValueOnce(
        makeInvoiceRow({ id: 1, status: 'PENDING' }),
      );
      jest.spyOn(AiBillingRepository.prototype, 'updateInvoiceStatus').mockResolvedValueOnce(
        makeInvoiceRow({ id: 1, status: 'PAID' }),
      );
      jest.spyOn(AiBillingRepository.prototype, 'updateWebhookEventStatus').mockResolvedValueOnce(undefined);

      const res = await request(app)
        .post('/api/webhooks/payment')
        .set('X-Payment-Signature', `sha256=${validSig}`)
        .set('X-Payment-Timestamp', String(nowSec))
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.invoiceStatus).toBe('PAID');
    });
  });
});
