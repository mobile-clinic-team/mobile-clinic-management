// =====================================================================
// Module:  M1 - AI Assistant & Billing
// Test:    unit/payment-webhook.service.test.ts
// Purpose: Unit tests for Secure Payment Webhook covering:
//          - HMAC-SHA256 signature verification & mismatch rejection
//          - Timestamp replay attack protection (5-minute window)
//          - Duplicate event_id deduplication (idempotency)
//          - Transaction FOR UPDATE row locking & status transition
// =====================================================================

import crypto from 'crypto';
import { env } from '../../src/config/env';
import { AppError } from '../../src/utils/AppError';
import { AiBillingRepository } from '../../src/modules/ai-billing/ai-billing.repository';
import { AiBillingService } from '../../src/modules/ai-billing/ai-billing.service';
import { InvoiceRow, PaymentWebhookPayload, PaymentWebhookEventRow } from '../../src/modules/ai-billing/ai-billing.types';

// Mock DB transaction wrapper
jest.mock('../../src/config/db', () => ({
  pool: { connect: jest.fn() },
  withTransaction: jest.fn((fn: (client: unknown) => Promise<unknown>) => fn({})),
}));

// Mock repository
const mockRepo = {
  saveConversationMessage: jest.fn(),
  getConversationHistory: jest.fn(),
  findInvoiceById: jest.fn(),
  findInvoiceByIdForUpdate: jest.fn(),
  findInvoicesByPatientId: jest.fn(),
  findInvoiceByAppointmentId: jest.fn(),
  createInvoice: jest.fn(),
  updateInvoiceStatus: jest.fn(),
  insertWebhookEvent: jest.fn(),
  findWebhookEvent: jest.fn(),
  updateWebhookEventStatus: jest.fn(),
} as unknown as jest.Mocked<AiBillingRepository>;

function generateHmacSignature(payload: PaymentWebhookPayload, secret = env.payment.webhookSecret): string {
  const json = JSON.stringify(payload);
  return crypto.createHmac('sha256', secret).update(json).digest('hex');
}

function makeInvoiceRow(overrides: Partial<InvoiceRow> = {}): InvoiceRow {
  return {
    id: 100,
    appointment_id: 50,
    patient_id: 10,
    amount: 300000,
    status: 'PENDING',
    payment_method: 'VNPAY',
    transaction_ref: null,
    paid_at: null,
    created_at: new Date('2026-08-26T08:00:00Z'),
    updated_at: new Date('2026-08-26T08:00:00Z'),
    ...overrides,
  };
}

function makeWebhookEventRow(overrides: Partial<PaymentWebhookEventRow> = {}): PaymentWebhookEventRow {
  return {
    event_id: 'evt_test_123',
    invoice_id: 100,
    provider: 'VNPAY',
    payload: {},
    status: 'RECEIVED',
    created_at: new Date('2026-08-26T08:05:00Z'),
    ...overrides,
  };
}

describe('Secure Payment Webhook Tests (Task 2.5)', () => {
  let service: AiBillingService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AiBillingService(mockRepo);
  });

  // ===================================================================
  // 1. HMAC-SHA256 SIGNATURE TESTS
  // ===================================================================
  describe('1. HMAC-SHA256 Signature Verification', () => {
    it('successfully validates a legitimate HMAC-SHA256 signature and processes webhook', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const payload: PaymentWebhookPayload = {
        eventId: 'evt_valid_001',
        invoiceId: 100,
        amount: 300000,
        status: 'SUCCESS',
        provider: 'VNPAY',
        transactionRef: 'VNP_TRANS_999',
        timestamp: nowSec,
      };

      const validSig = generateHmacSignature(payload);
      const invoiceRow = makeInvoiceRow({ id: 100, status: 'PENDING' });

      mockRepo.findWebhookEvent.mockResolvedValue(null);
      mockRepo.insertWebhookEvent.mockResolvedValue(makeWebhookEventRow({ event_id: 'evt_valid_001' }));
      mockRepo.findInvoiceByIdForUpdate.mockResolvedValue(invoiceRow);
      mockRepo.updateInvoiceStatus.mockResolvedValue(makeInvoiceRow({ id: 100, status: 'PAID' }));
      mockRepo.updateWebhookEventStatus.mockResolvedValue(undefined);

      const result = await service.handlePaymentWebhook(payload, `sha256=${validSig}`, nowSec);

      expect(result.success).toBe(true);
      expect(result.invoiceStatus).toBe('PAID');
      expect(mockRepo.updateInvoiceStatus).toHaveBeenCalledWith(
        100,
        'PAID',
        'VNPAY',
        'VNP_TRANS_999',
        expect.any(Date),
        expect.anything(),
      );
      expect(mockRepo.updateWebhookEventStatus).toHaveBeenCalledWith('evt_valid_001', 'PROCESSED', expect.anything());
    });

    it('rejects an invalid / tampered signature (401 Unauthorized)', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const payload: PaymentWebhookPayload = {
        eventId: 'evt_tampered_002',
        invoiceId: 100,
        amount: 300000,
        status: 'SUCCESS',
        provider: 'VNPAY',
        timestamp: nowSec,
      };

      const forgedSignature = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

      await expect(
        service.handlePaymentWebhook(payload, forgedSignature, nowSec),
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 401,
          message: 'Invalid webhook HMAC-SHA256 signature',
        }),
      );

      // Verifies no invoice was updated
      expect(mockRepo.findInvoiceByIdForUpdate).not.toHaveBeenCalled();
      expect(mockRepo.updateInvoiceStatus).not.toHaveBeenCalled();
    });

    it('rejects when signature header is missing completely (401 Unauthorized)', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const payload: PaymentWebhookPayload = {
        eventId: 'evt_nosig_003',
        invoiceId: 100,
        amount: 300000,
        status: 'SUCCESS',
        provider: 'VNPAY',
        timestamp: nowSec,
      };

      await expect(
        service.handlePaymentWebhook(payload, undefined, nowSec),
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 401,
          message: 'Missing webhook signature header',
        }),
      );
    });

    it('rejects signature generated with wrong secret', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const payload: PaymentWebhookPayload = {
        eventId: 'evt_wrongsecret_004',
        invoiceId: 100,
        amount: 300000,
        status: 'SUCCESS',
        provider: 'VNPAY',
        timestamp: nowSec,
      };

      const wrongSecretSignature = generateHmacSignature(payload, 'wrong-secret-key-attacker');

      await expect(
        service.handlePaymentWebhook(payload, wrongSecretSignature, nowSec),
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 401,
          message: 'Invalid webhook HMAC-SHA256 signature',
        }),
      );
    });
  });

  // ===================================================================
  // 2. TIMESTAMP REPLAY ATTACK PROTECTION (5-MINUTE WINDOW)
  // ===================================================================
  describe('2. Timestamp Replay Attack Protection', () => {
    it('rejects webhook with expired timestamp > 300s in the past (400 Bad Request)', async () => {
      const expiredTimestamp = Math.floor(Date.now() / 1000) - 350; // 350s ago (> 300s)
      const payload: PaymentWebhookPayload = {
        eventId: 'evt_replay_005',
        invoiceId: 100,
        amount: 300000,
        status: 'SUCCESS',
        provider: 'VNPAY',
        timestamp: expiredTimestamp,
      };
      const signature = generateHmacSignature(payload);

      await expect(
        service.handlePaymentWebhook(payload, signature, expiredTimestamp),
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 400,
          message: expect.stringContaining('Webhook timestamp expired or outside allowable replay window'),
        }),
      );
    });

    it('rejects webhook with future timestamp > 300s in the future (400 Bad Request)', async () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 400; // 400s in future (> 300s)
      const payload: PaymentWebhookPayload = {
        eventId: 'evt_future_006',
        invoiceId: 100,
        amount: 300000,
        status: 'SUCCESS',
        provider: 'VNPAY',
        timestamp: futureTimestamp,
      };
      const signature = generateHmacSignature(payload);

      await expect(
        service.handlePaymentWebhook(payload, signature, futureTimestamp),
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 400,
          message: expect.stringContaining('Webhook timestamp expired or outside allowable replay window'),
        }),
      );
    });

    it('rejects webhook with missing or invalid timestamp value', async () => {
      const payload: PaymentWebhookPayload = {
        eventId: 'evt_notime_007',
        invoiceId: 100,
        amount: 300000,
        status: 'SUCCESS',
        provider: 'VNPAY',
        timestamp: 0,
      };

      await expect(
        service.handlePaymentWebhook(payload, 'any-sig', undefined),
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 400,
        }),
      );
    });
  });

  // ===================================================================
  // 3. DUPLICATE WEBHOOK EVENT DEDUPLICATION (IDEMPOTENCY)
  // ===================================================================
  describe('3. Duplicate Webhook Event Deduplication', () => {
    it('detects duplicate event_id, returns 200 OK with duplicate: true and does not re-process invoice', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const payload: PaymentWebhookPayload = {
        eventId: 'evt_dup_008',
        invoiceId: 100,
        amount: 300000,
        status: 'SUCCESS',
        provider: 'VNPAY',
        timestamp: nowSec,
      };
      const signature = generateHmacSignature(payload);

      // Existing event in DB
      mockRepo.findWebhookEvent.mockResolvedValue(
        makeWebhookEventRow({ event_id: 'evt_dup_008', status: 'PROCESSED' }),
      );

      const result = await service.handlePaymentWebhook(payload, signature, nowSec);

      expect(result.success).toBe(true);
      expect(result.duplicate).toBe(true);
      expect(result.message).toContain('Duplicate webhook event received and acknowledged');

      // Crucial: No second invoice status update performed
      expect(mockRepo.findInvoiceByIdForUpdate).not.toHaveBeenCalled();
      expect(mockRepo.updateInvoiceStatus).not.toHaveBeenCalled();
    });

    it('handles concurrent duplicate race condition gracefully (ON CONFLICT DO NOTHING -> duplicate acknowledgement)', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const payload: PaymentWebhookPayload = {
        eventId: 'evt_race_009',
        invoiceId: 100,
        amount: 300000,
        status: 'SUCCESS',
        provider: 'VNPAY',
        timestamp: nowSec,
      };
      const signature = generateHmacSignature(payload);

      mockRepo.findWebhookEvent.mockResolvedValue(null);
      // Returns null simulating another process won the insert race
      mockRepo.insertWebhookEvent.mockResolvedValue(null);

      const result = await service.handlePaymentWebhook(payload, signature, nowSec);

      expect(result.success).toBe(true);
      expect(result.duplicate).toBe(true);
      expect(mockRepo.updateInvoiceStatus).not.toHaveBeenCalled();
    });
  });

  // ===================================================================
  // 4. TRANSACTION & FOR UPDATE ROW LOCKING / STATUS TRANSITIONS
  // ===================================================================
  describe('4. Transaction & FOR UPDATE Row Locking', () => {
    it('handles payment failure event by updating invoice status to FAILED', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const payload: PaymentWebhookPayload = {
        eventId: 'evt_fail_010',
        invoiceId: 100,
        amount: 300000,
        status: 'FAILED',
        provider: 'VNPAY',
        transactionRef: 'VNP_TRANS_FAIL',
        timestamp: nowSec,
      };
      const signature = generateHmacSignature(payload);
      const invoiceRow = makeInvoiceRow({ id: 100, status: 'PENDING' });

      mockRepo.findWebhookEvent.mockResolvedValue(null);
      mockRepo.insertWebhookEvent.mockResolvedValue(makeWebhookEventRow({ event_id: 'evt_fail_010' }));
      mockRepo.findInvoiceByIdForUpdate.mockResolvedValue(invoiceRow);
      mockRepo.updateInvoiceStatus.mockResolvedValue(makeInvoiceRow({ id: 100, status: 'FAILED' }));
      mockRepo.updateWebhookEventStatus.mockResolvedValue(undefined);

      const result = await service.handlePaymentWebhook(payload, signature, nowSec);

      expect(result.success).toBe(true);
      expect(result.invoiceStatus).toBe('FAILED');
      expect(mockRepo.updateInvoiceStatus).toHaveBeenCalledWith(
        100,
        'FAILED',
        'VNPAY',
        'VNP_TRANS_FAIL',
        null,
        expect.anything(),
      );
    });

    it('returns idempotent success if invoice was already marked PAID previously', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const payload: PaymentWebhookPayload = {
        eventId: 'evt_alreadypaid_011',
        invoiceId: 100,
        amount: 300000,
        status: 'SUCCESS',
        provider: 'VNPAY',
        timestamp: nowSec,
      };
      const signature = generateHmacSignature(payload);
      const alreadyPaidInvoice = makeInvoiceRow({ id: 100, status: 'PAID', paid_at: new Date() });

      mockRepo.findWebhookEvent.mockResolvedValue(null);
      mockRepo.insertWebhookEvent.mockResolvedValue(makeWebhookEventRow({ event_id: 'evt_alreadypaid_011' }));
      mockRepo.findInvoiceByIdForUpdate.mockResolvedValue(alreadyPaidInvoice);
      mockRepo.updateWebhookEventStatus.mockResolvedValue(undefined);

      const result = await service.handlePaymentWebhook(payload, signature, nowSec);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Invoice is already in PAID state');
      expect(mockRepo.updateInvoiceStatus).not.toHaveBeenCalled();
      expect(mockRepo.updateWebhookEventStatus).toHaveBeenCalledWith('evt_alreadypaid_011', 'PROCESSED', expect.anything());
    });

    it('throws 404 when invoice does not exist in database', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const payload: PaymentWebhookPayload = {
        eventId: 'evt_noinv_012',
        invoiceId: 99999,
        amount: 300000,
        status: 'SUCCESS',
        provider: 'VNPAY',
        timestamp: nowSec,
      };
      const signature = generateHmacSignature(payload);

      mockRepo.findWebhookEvent.mockResolvedValue(null);
      mockRepo.insertWebhookEvent.mockResolvedValue(makeWebhookEventRow({ event_id: 'evt_noinv_012' }));
      mockRepo.findInvoiceByIdForUpdate.mockResolvedValue(null);
      mockRepo.updateWebhookEventStatus.mockResolvedValue(undefined);

      await expect(
        service.handlePaymentWebhook(payload, signature, nowSec),
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 404,
          message: 'Invoice #99999 not found',
        }),
      );

      expect(mockRepo.updateWebhookEventStatus).toHaveBeenCalledWith('evt_noinv_012', 'INVALID', expect.anything());
    });
  });
});
