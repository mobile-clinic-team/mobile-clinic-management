// =====================================================================
// Module:  M1 - AI Assistant & Billing
// File:    ai-billing.repository.ts
// =====================================================================
import { Pool, PoolClient } from 'pg';
import { pool } from '../../config/db';
import {
  AiConversationRow,
  CreateInvoiceInput,
  InvoiceRow,
  InvoiceStatus,
  MessageRole,
  PaymentWebhookEventRow,
  WebhookEventStatus,
} from './ai-billing.types';

export class AiBillingRepository {
  constructor(private readonly db: Pool | PoolClient = pool) {}

  // ===================================================================
  // AI Conversation Management
  // ===================================================================

  async saveConversationMessage(
    userId: number,
    sessionId: string,
    role: MessageRole,
    content: string,
    metadata?: Record<string, any> | null,
    client?: PoolClient,
  ): Promise<AiConversationRow> {
    const executor = client ?? this.db;
    const { rows } = await executor.query<AiConversationRow>(
      `INSERT INTO ai_conversations (user_id, session_id, message_role, message_content, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id, user_id, session_id, message_role, message_content, metadata, created_at`,
      [userId, sessionId, role, content, metadata ? JSON.stringify(metadata) : null],
    );
    return rows[0];
  }

  async getConversationHistory(
    userId: number,
    sessionId: string,
    limit = 50,
    client?: PoolClient,
  ): Promise<AiConversationRow[]> {
    const executor = client ?? this.db;
    const { rows } = await executor.query<AiConversationRow>(
      `SELECT id, user_id, session_id, message_role, message_content, metadata, created_at
         FROM ai_conversations
        WHERE user_id = $1 AND session_id = $2
        ORDER BY created_at ASC
        LIMIT $3`,
      [userId, sessionId, limit],
    );
    return rows;
  }

  // ===================================================================
  // Invoice Management
  // ===================================================================

  async createInvoice(
    input: CreateInvoiceInput,
    client?: PoolClient,
  ): Promise<InvoiceRow> {
    const executor = client ?? this.db;
    const { rows } = await executor.query<InvoiceRow>(
      `INSERT INTO invoices (appointment_id, patient_id, amount, status, payment_method, created_at, updated_at)
       VALUES ($1, $2, $3, 'PENDING', $4, NOW(), NOW())
       RETURNING id, appointment_id, patient_id, amount, status, payment_method, transaction_ref, paid_at, created_at, updated_at`,
      [input.appointmentId, input.patientId, input.amount, input.paymentMethod ?? null],
    );
    return rows[0];
  }

  async findInvoiceById(id: number, client?: PoolClient): Promise<InvoiceRow | null> {
    const executor = client ?? this.db;
    const { rows } = await executor.query<InvoiceRow>(
      `SELECT id, appointment_id, patient_id, amount, status, payment_method, transaction_ref, paid_at, created_at, updated_at
         FROM invoices
        WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  /**
   * Acquires a pessimistic row-level lock (FOR UPDATE) inside an active transaction.
   * Requirement per DEVELOPMENT_CONTRACTS.md #12.
   */
  async findInvoiceByIdForUpdate(id: number, client: PoolClient): Promise<InvoiceRow | null> {
    const { rows } = await client.query<InvoiceRow>(
      `SELECT id, appointment_id, patient_id, amount, status, payment_method, transaction_ref, paid_at, created_at, updated_at
         FROM invoices
        WHERE id = $1
        FOR UPDATE`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findInvoiceByAppointmentId(appointmentId: number, client?: PoolClient): Promise<InvoiceRow | null> {
    const executor = client ?? this.db;
    const { rows } = await executor.query<InvoiceRow>(
      `SELECT id, appointment_id, patient_id, amount, status, payment_method, transaction_ref, paid_at, created_at, updated_at
         FROM invoices
        WHERE appointment_id = $1`,
      [appointmentId],
    );
    return rows[0] ?? null;
  }

  async findInvoicesByPatientId(patientId: number, client?: PoolClient): Promise<InvoiceRow[]> {
    const executor = client ?? this.db;
    const { rows } = await executor.query<InvoiceRow>(
      `SELECT id, appointment_id, patient_id, amount, status, payment_method, transaction_ref, paid_at, created_at, updated_at
         FROM invoices
        WHERE patient_id = $1
        ORDER BY created_at DESC`,
      [patientId],
    );
    return rows;
  }

  async updateInvoiceStatus(
    id: number,
    status: InvoiceStatus,
    paymentMethod?: string | null,
    transactionRef?: string | null,
    paidAt?: Date | null,
    client?: PoolClient,
  ): Promise<InvoiceRow | null> {
    const executor = client ?? this.db;
    const { rows } = await executor.query<InvoiceRow>(
      `UPDATE invoices
          SET status = $2,
              payment_method = COALESCE($3, payment_method),
              transaction_ref = COALESCE($4, transaction_ref),
              paid_at = COALESCE($5, paid_at),
              updated_at = NOW()
        WHERE id = $1
        RETURNING id, appointment_id, patient_id, amount, status, payment_method, transaction_ref, paid_at, created_at, updated_at`,
      [id, status, paymentMethod, transactionRef, paidAt],
    );
    return rows[0] ?? null;
  }

  // ===================================================================
  // Webhook Event Deduplication & Audit Log
  // ===================================================================

  /**
   * Attempts to insert a webhook event atomically.
   * Uses ON CONFLICT (event_id) DO NOTHING for deduplication.
   * Returns the row if inserted, or null if the event_id already exists.
   */
  async insertWebhookEvent(
    eventId: string,
    invoiceId: number,
    provider: string,
    payload: Record<string, any>,
    status: WebhookEventStatus = 'RECEIVED',
    client?: PoolClient,
  ): Promise<PaymentWebhookEventRow | null> {
    const executor = client ?? this.db;
    const { rows } = await executor.query<PaymentWebhookEventRow>(
      `INSERT INTO payment_webhook_events (event_id, invoice_id, provider, payload, status, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id, invoice_id, provider, payload, status, created_at`,
      [eventId, invoiceId, provider, JSON.stringify(payload), status],
    );
    return rows[0] ?? null;
  }

  async findWebhookEvent(eventId: string, client?: PoolClient): Promise<PaymentWebhookEventRow | null> {
    const executor = client ?? this.db;
    const { rows } = await executor.query<PaymentWebhookEventRow>(
      `SELECT event_id, invoice_id, provider, payload, status, created_at
         FROM payment_webhook_events
        WHERE event_id = $1`,
      [eventId],
    );
    return rows[0] ?? null;
  }

  async updateWebhookEventStatus(
    eventId: string,
    status: WebhookEventStatus,
    client?: PoolClient,
  ): Promise<void> {
    const executor = client ?? this.db;
    await executor.query(
      `UPDATE payment_webhook_events
          SET status = $2
        WHERE event_id = $1`,
      [eventId, status],
    );
  }
}
