// =====================================================================
// Module:  M1 - AI Assistant & Billing
// File:    ai-billing.validation.ts
// =====================================================================
import { z } from 'zod';

export const aiChatSchema = z.object({
  message: z.string().trim().min(1, 'Message cannot be empty'),
  conversationId: z.string().trim().optional(),
  sessionId: z.string().uuid('Session ID must be a valid UUID').optional(),
});

export const invoiceIdParamSchema = z.object({
  id: z.coerce.number().int().positive('Invoice ID must be a positive integer'),
});

export const payInvoiceSchema = z.object({
  paymentMethod: z
    .string()
    .trim()
    .toUpperCase()
    .refine((val) => ['VNPAY', 'MOMO', 'ZALOPAY', 'CASH', 'CREDIT_CARD'].includes(val), {
      message: 'Invalid payment method. Supported: VNPAY, MOMO, ZALOPAY, CASH, CREDIT_CARD',
    })
    .default('VNPAY'),
});

export const createInvoiceSchema = z.object({
  appointmentId: z.number().int().positive('Appointment ID must be positive'),
  patientId: z.number().int().positive('Patient ID must be positive'),
  amount: z.number().int().positive('Amount must be greater than 0'),
  paymentMethod: z.string().optional(),
});

export const paymentWebhookSchema = z.object({
  eventId: z.string().trim().min(1, 'eventId is required'),
  invoiceId: z.number().int().positive('invoiceId must be a positive integer'),
  provider: z.string().trim().min(1, 'provider is required'),
  status: z.enum(['SUCCESS', 'FAILED']),
  transactionRef: z.string().trim().optional(),
  amount: z.number().int().positive().optional(),
  timestamp: z.union([z.number(), z.string()]),
});
