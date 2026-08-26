// =====================================================================
// Module:  M1 - AI Assistant & Billing
// File:    ai-billing.types.ts
// =====================================================================

export type MessageRole = 'user' | 'assistant' | 'system';
export type InvoiceStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
export type WebhookEventStatus = 'RECEIVED' | 'PROCESSED' | 'DUPLICATE' | 'INVALID';

export interface AiConversationRow {
  id: number | string;
  user_id: number;
  session_id: string;
  message_role: MessageRole;
  message_content: string;
  metadata: Record<string, any> | null;
  created_at: Date | string;
}

export interface InvoiceRow {
  id: number;
  appointment_id: number;
  patient_id: number;
  amount: number;
  status: InvoiceStatus;
  payment_method: string | null;
  transaction_ref: string | null;
  paid_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface PaymentWebhookEventRow {
  event_id: string;
  invoice_id: number;
  provider: string;
  payload: Record<string, any>;
  status: WebhookEventStatus;
  created_at: Date | string;
}

// ---------------------------------------------------------------------
// Request / Response DTOs
// ---------------------------------------------------------------------

export interface AiChatInput {
  message: string;
  conversationId?: string;
  sessionId?: string;
}

export interface AiChatResponseDTO {
  reply: string;
  suggestedDoctorId?: number | null;
  disclaimer: string;
  conversationId?: string;
  sessionId: string;
}

export interface PayInvoiceInput {
  paymentMethod?: string;
}

export interface PayInvoiceResponseDTO {
  invoiceId: number;
  appointmentId: number;
  amount: number;
  status: InvoiceStatus;
  paymentMethod: string;
  paymentUrl: string;
  qrCode: string;
  transactionRef: string;
}

export interface PaymentWebhookPayload {
  eventId: string;
  invoiceId: number;
  provider: string;
  status: 'SUCCESS' | 'FAILED';
  transactionRef?: string;
  amount?: number;
  timestamp: number | string;
  [key: string]: any;
}

export interface PaymentWebhookResponseDTO {
  success: boolean;
  message: string;
  eventId: string;
  duplicate?: boolean;
  invoiceStatus?: InvoiceStatus;
}

export interface InvoiceDTO {
  id: number;
  appointmentId: number;
  patientId: number;
  amount: number;
  status: InvoiceStatus;
  paymentMethod: string | null;
  transactionRef: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInvoiceInput {
  appointmentId: number;
  patientId: number;
  amount: number;
  paymentMethod?: string;
}
