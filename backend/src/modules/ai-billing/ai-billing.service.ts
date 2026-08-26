// =====================================================================
// Module:  M1 - AI Assistant & Billing
// File:    ai-billing.service.ts
// =====================================================================
import crypto from 'crypto';
import { Pool } from 'pg';
import { pool, withTransaction } from '../../config/db';
import { env } from '../../config/env';
import { AppError } from '../../utils/AppError';
import { AiBillingRepository } from './ai-billing.repository';
import {
  AiChatInput,
  AiChatResponseDTO,
  CreateInvoiceInput,
  InvoiceDTO,
  InvoiceRow,
  PayInvoiceInput,
  PayInvoiceResponseDTO,
  PaymentWebhookPayload,
  PaymentWebhookResponseDTO,
} from './ai-billing.types';

function toInvoiceDTO(row: InvoiceRow): InvoiceDTO {
  return {
    id: row.id,
    appointmentId: row.appointment_id,
    patientId: row.patient_id,
    amount: row.amount,
    status: row.status,
    paymentMethod: row.payment_method,
    transactionRef: row.transaction_ref,
    paidAt: row.paid_at instanceof Date ? row.paid_at.toISOString() : (row.paid_at ? new Date(row.paid_at).toISOString() : null),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(row.updated_at).toISOString(),
  };
}

export class AiBillingService {
  constructor(
    private readonly repo: AiBillingRepository = new AiBillingRepository(),
    private readonly dbPool: Pool = pool,
  ) {}

  // ===================================================================
  // 1. AI Gateway -> Dify API (/api/ai/chat)
  // ===================================================================

  /**
   * Proxies medical consultation chat requests to Dify platform.
   * Records user and assistant turns in `ai_conversations`.
   */
  async chatWithAi(userId: number, input: AiChatInput): Promise<AiChatResponseDTO> {
    const sessionId = input.sessionId || crypto.randomUUID();

    // 1. Save user turn
    await this.repo.saveConversationMessage(
      userId,
      sessionId,
      'user',
      input.message,
      { client_timestamp: new Date().toISOString() },
    );

    let replyText = '';
    let suggestedDoctorId: number | null = null;
    let difyConversationId = input.conversationId;
    let difyMessageId = '';
    const disclaimer =
      'Lưu ý y tế: Thông tin từ trợ lý AI chỉ mang tính chất tham khảo sơ bộ, không thay thế chẩn đoán hay phác đồ điều trị chuyên môn từ bác sĩ.';

    try {
      // Call Dify API
      const difyResponse = await fetch(`${env.dify.apiUrl}/chat-messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.dify.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: {},
          query: input.message,
          response_mode: env.dify.responseMode,
          conversation_id: input.conversationId || '',
          user: String(userId),
        }),
      });

      if (difyResponse.ok) {
        const data = (await difyResponse.json()) as any;
        replyText = data.answer || '';
        difyConversationId = data.conversation_id || difyConversationId;
        difyMessageId = data.message_id || '';

        // Extract suggestedDoctorId if present in metadata or response
        if (data.metadata?.suggested_doctor_id) {
          suggestedDoctorId = Number(data.metadata.suggested_doctor_id);
        }
      } else {
        // Log non-200 from Dify and trigger medical fallback response
        console.warn(`[AI Gateway] Dify returned status ${difyResponse.status}, activating fallback assistant.`);
        replyText = this.generateFallbackAiReply(input.message);
      }
    } catch (err) {
      console.warn('[AI Gateway] Could not connect to Dify API, activating fallback assistant:', (err as Error).message);
      replyText = this.generateFallbackAiReply(input.message);
    }

    // 2. Save assistant turn
    await this.repo.saveConversationMessage(
      userId,
      sessionId,
      'assistant',
      replyText,
      {
        dify_conversation_id: difyConversationId,
        dify_message_id: difyMessageId,
        suggested_doctor_id: suggestedDoctorId,
        disclaimer,
      },
    );

    return {
      reply: replyText,
      suggestedDoctorId,
      disclaimer,
      conversationId: difyConversationId,
      sessionId,
    };
  }

  private generateFallbackAiReply(message: string): string {
    const lower = message.toLowerCase();
    if (lower.includes('đau đầu') || lower.includes('chóng mặt') || lower.includes('mệt mỏi')) {
      return (
        'Chào bạn, các triệu chứng như đau đầu, chóng mặt có thể liên quan đến căng thẳng, thiếu ngủ hoặc huyết áp. ' +
        'Bạn nên nghỉ ngơi, uống đủ nước. Nếu triệu chứng kéo dài hoặc dữ dội, bạn hãy đặt lịch khám với Bác sĩ Nội khoa để được kiểm tra trực tiếp.'
      );
    }
    if (lower.includes('tim') || lower.includes('tức ngực') || lower.includes('khó thở')) {
      return (
        'Chào bạn, triệu chứng tức ngực hoặc khó thở là dấu hiệu cần được quan tâm đặc biệt. ' +
        'Chúng tôi khuyến nghị bạn đặt lịch khám chuyên khoa Tim mạch hoặc đến cơ sở y tế gần nhất nếu cảm thấy đau thắt ngực dữ dội.'
      );
    }
    if (lower.includes('da') || lower.includes('ngứa') || lower.includes('mẩn đỏ')) {
      return (
        'Chào bạn, tình trạng nổi mẩn đỏ, ngứa ngáy có thể là biểu hiện của viêm da dị ứng hoặc kích ứng. ' +
        'Bạn nên tránh cào gãi và đặt lịch tư vấn với Bác sĩ Da liễu để được kê đơn thuốc bôi phù hợp.'
      );
    }
    return (
      'Chào bạn! Tôi là trợ lý AI y tế của phòng khám Mobile Clinic. Tôi có thể hỗ trợ giải đáp sơ bộ các thắc mắc về sức khỏe, ' +
      'hướng dẫn chuyên khoa phù hợp và hỗ trợ đặt lịch khám với các bác sĩ chuyên khoa.'
    );
  }

  // ===================================================================
  // 2. Invoice Management & Payment Initiation (/api/invoices/:id/pay)
  // ===================================================================

  async payInvoice(
    invoiceId: number,
    userId: number,
    userRole: string,
    input: PayInvoiceInput,
  ): Promise<PayInvoiceResponseDTO> {
    const invoice = await this.repo.findInvoiceById(invoiceId);
    if (!invoice) {
      throw AppError.notFound(`Invoice #${invoiceId} not found`);
    }

    // Ownership check: Patient can only pay their own invoices. Admin can bypass.
    if (userRole !== 'admin' && invoice.patient_id !== userId) {
      throw AppError.forbidden('You are not authorized to access or pay this invoice');
    }

    if (invoice.status === 'PAID') {
      throw AppError.conflict(`Invoice #${invoiceId} has already been paid on ${invoice.paid_at}`);
    }

    const paymentMethod = input.paymentMethod || invoice.payment_method || 'VNPAY';
    const transactionRef = `MC_INV_${invoice.id}_${Date.now()}`;

    // Update invoice with latest payment attempt reference
    await this.repo.updateInvoiceStatus(
      invoice.id,
      invoice.status,
      paymentMethod,
      transactionRef,
      null,
    );

    // Build Mock Payment Gateway URL & QR Code Payload
    const paymentUrl = `${env.payment.mockPaymentGatewayUrl}?invoiceId=${invoice.id}&amount=${invoice.amount}&ref=${transactionRef}&method=${paymentMethod}`;
    const qrCode = `VNPAYQR|INVOICE:${invoice.id}|AMOUNT:${invoice.amount}|REF:${transactionRef}`;

    return {
      invoiceId: invoice.id,
      appointmentId: invoice.appointment_id,
      amount: invoice.amount,
      status: invoice.status,
      paymentMethod,
      paymentUrl,
      qrCode,
      transactionRef,
    };
  }

  // ===================================================================
  // 3. Secure Payment Webhook (/api/webhooks/payment)
  //    - 1) Check HMAC-SHA256 signature
  //    - 2) Check timestamp replay attack within 5 mins (300s)
  //    - 3) Check duplicate event_id in payment_webhook_events
  //    - 4) DB Transaction + SELECT ... FOR UPDATE + status PENDING -> PAID
  // ===================================================================

  async handlePaymentWebhook(
    payload: PaymentWebhookPayload,
    signatureHeader?: string,
    timestampHeader?: string | number,
    rawBody?: string,
  ): Promise<PaymentWebhookResponseDTO> {
    // -----------------------------------------------------------------
    // STEP 1: Check Timestamp Replay Attack (5 minutes / 300 seconds)
    // -----------------------------------------------------------------
    const rawTimestamp = timestampHeader !== undefined ? timestampHeader : payload.timestamp;
    if (rawTimestamp === undefined || rawTimestamp === null) {
      throw AppError.badRequest('Missing webhook timestamp (replay protection requirement)');
    }

    const tsNumber = Number(rawTimestamp);
    if (isNaN(tsNumber) || tsNumber <= 0) {
      throw AppError.badRequest('Invalid webhook timestamp value');
    }

    // Normalize milliseconds to seconds if needed
    const eventTimestampSeconds = tsNumber > 1e11 ? Math.floor(tsNumber / 1000) : Math.floor(tsNumber);
    const currentServerSeconds = Math.floor(Date.now() / 1000);
    const skewSeconds = Math.abs(currentServerSeconds - eventTimestampSeconds);

    if (skewSeconds > 300) {
      throw AppError.badRequest(
        `Webhook timestamp expired or outside allowable replay window (skew: ${skewSeconds}s, max: 300s)`,
      );
    }

    // -----------------------------------------------------------------
    // STEP 2: Check HMAC-SHA256 Signature
    // -----------------------------------------------------------------
    if (!signatureHeader) {
      throw AppError.unauthorized('Missing webhook signature header');
    }

    const cleanSig = signatureHeader.replace(/^sha256=/i, '').trim();
    const isSignatureValid = this.verifyHmacSignature(cleanSig, payload, rawBody);

    if (!isSignatureValid) {
      // Log invalid event attempt if eventId is available
      try {
        await this.repo.insertWebhookEvent(
          payload.eventId,
          payload.invoiceId,
          payload.provider || 'UNKNOWN',
          payload,
          'INVALID',
        );
      } catch {
        // ignore duplicate / FK errors when logging invalid signature
      }
      throw AppError.unauthorized('Invalid webhook HMAC-SHA256 signature');
    }

    // -----------------------------------------------------------------
    // STEP 3: Check Duplicate event_id in payment_webhook_events
    // -----------------------------------------------------------------
    const existingEvent = await this.repo.findWebhookEvent(payload.eventId);
    if (existingEvent) {
      // Duplicate event detected: Return 200 OK immediately (idempotent deduplication)
      return {
        success: true,
        message: 'Duplicate webhook event received and acknowledged',
        eventId: payload.eventId,
        duplicate: true,
        invoiceStatus: 'PAID',
      };
    }

    // Attempt atomic insert with RECEIVED status
    const insertedEvent = await this.repo.insertWebhookEvent(
      payload.eventId,
      payload.invoiceId,
      payload.provider,
      payload,
      'RECEIVED',
    );

    if (!insertedEvent) {
      // Concurrent duplicate insert resolved by ON CONFLICT DO NOTHING
      return {
        success: true,
        message: 'Duplicate webhook event received and acknowledged',
        eventId: payload.eventId,
        duplicate: true,
        invoiceStatus: 'PAID',
      };
    }

    // -----------------------------------------------------------------
    // STEP 4: DB Transaction + SELECT ... FOR UPDATE + Status Transition
    // -----------------------------------------------------------------
    return await withTransaction(async (client) => {
      // Lock invoice row
      const invoice = await this.repo.findInvoiceByIdForUpdate(payload.invoiceId, client);
      if (!invoice) {
        await this.repo.updateWebhookEventStatus(payload.eventId, 'INVALID', client);
        throw AppError.notFound(`Invoice #${payload.invoiceId} not found`);
      }

      if (invoice.status === 'PAID') {
        // Already paid previously
        await this.repo.updateWebhookEventStatus(payload.eventId, 'PROCESSED', client);
        return {
          success: true,
          message: 'Invoice is already in PAID state',
          eventId: payload.eventId,
          invoiceStatus: 'PAID',
        };
      }

      if (payload.status === 'SUCCESS') {
        // Transition PENDING -> PAID
        const transactionRef = payload.transactionRef || payload.eventId;
        const paidAt = new Date();

        await this.repo.updateInvoiceStatus(
          invoice.id,
          'PAID',
          payload.provider || invoice.payment_method,
          transactionRef,
          paidAt,
          client,
        );

        await this.repo.updateWebhookEventStatus(payload.eventId, 'PROCESSED', client);

        return {
          success: true,
          message: 'Invoice status successfully transitioned to PAID',
          eventId: payload.eventId,
          invoiceStatus: 'PAID',
        };
      } else {
        // Payment failed
        await this.repo.updateInvoiceStatus(
          invoice.id,
          'FAILED',
          payload.provider || invoice.payment_method,
          payload.transactionRef || payload.eventId,
          null,
          client,
        );

        await this.repo.updateWebhookEventStatus(payload.eventId, 'PROCESSED', client);

        return {
          success: true,
          message: 'Invoice status updated to FAILED',
          eventId: payload.eventId,
          invoiceStatus: 'FAILED',
        };
      }
    });
  }

  /**
   * Verifies HMAC-SHA256 signature against webhook secret.
   * Supports both raw JSON string and canonical string representations.
   */
  private verifyHmacSignature(
    receivedSigHex: string,
    payload: PaymentWebhookPayload,
    rawBody?: string,
  ): boolean {
    const secret = env.payment.webhookSecret;

    try {
      const receivedBuffer = Buffer.from(receivedSigHex, 'hex');

      // 1. Try raw body string if available
      if (rawBody) {
        const rawSigHex = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
        const rawBuffer = Buffer.from(rawSigHex, 'hex');
        if (receivedBuffer.length === rawBuffer.length && crypto.timingSafeEqual(receivedBuffer, rawBuffer)) {
          return true;
        }
      }

      // 2. Try JSON.stringify(payload)
      const jsonSigHex = crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
      const jsonBuffer = Buffer.from(jsonSigHex, 'hex');
      if (receivedBuffer.length === jsonBuffer.length && crypto.timingSafeEqual(receivedBuffer, jsonBuffer)) {
        return true;
      }

      // 3. Try canonical string format: `${eventId}:${invoiceId}:${status}:${timestamp}`
      const canonical = `${payload.eventId}:${payload.invoiceId}:${payload.status}:${payload.timestamp}`;
      const canonicalSigHex = crypto.createHmac('sha256', secret).update(canonical).digest('hex');
      const canonicalBuffer = Buffer.from(canonicalSigHex, 'hex');
      if (receivedBuffer.length === canonicalBuffer.length && crypto.timingSafeEqual(receivedBuffer, canonicalBuffer)) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  // ===================================================================
  // Additional Invoice Queries
  // ===================================================================

  async getInvoiceById(id: number, userId: number, userRole: string): Promise<InvoiceDTO> {
    const invoice = await this.repo.findInvoiceById(id);
    if (!invoice) {
      throw AppError.notFound(`Invoice #${id} not found`);
    }

    if (userRole !== 'admin' && invoice.patient_id !== userId) {
      throw AppError.forbidden('You are not authorized to view this invoice');
    }

    return toInvoiceDTO(invoice);
  }

  async getInvoicesByPatient(patientId: number): Promise<InvoiceDTO[]> {
    const rows = await this.repo.findInvoicesByPatientId(patientId);
    return rows.map(toInvoiceDTO);
  }

  async createInvoice(input: CreateInvoiceInput): Promise<InvoiceDTO> {
    const existing = await this.repo.findInvoiceByAppointmentId(input.appointmentId);
    if (existing) {
      throw AppError.conflict(`An invoice already exists for appointment #${input.appointmentId}`);
    }

    const row = await this.repo.createInvoice(input);
    return toInvoiceDTO(row);
  }

  async getChatHistory(userId: number, sessionId: string) {
    return await this.repo.getConversationHistory(userId, sessionId);
  }
}
