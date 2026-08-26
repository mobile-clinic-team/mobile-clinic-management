package com.mobileclinic.feature.aibilling.data.model

import kotlinx.serialization.Serializable

// ─── Chat ─────────────────────────────────────────────────────────────────────

@Serializable
data class AiChatRequest(
    val message: String,
    val sessionId: String? = null,
)

@Serializable
data class AiChatResponse(
    val reply: String,
    val sessionId: String,
    val disclaimer: String? = null,
)

/**
 * Represents a single message in the chat UI.
 * [isUser] = true  → right-aligned user bubble (blue)
 * [isUser] = false → left-aligned AI bubble (grey) + optional doctor cards
 */
data class ChatMessage(
    val id: String,
    val content: String,
    val isUser: Boolean,
    val doctorCards: List<RecommendedDoctorDto> = emptyList(),
    val disclaimer: String? = null,
    val timestampMs: Long = System.currentTimeMillis(),
)

// ─── Doctor Recommendation ───────────────────────────────────────────────────

/**
 * Parsed from the [DOCTOR_CARDS]...[/DOCTOR_CARDS] block inside an AI reply.
 * Convention: backend embeds a JSON array inside the reply string so the
 * Android client knows when to render rich cards instead of plain text.
 */
@Serializable
data class RecommendedDoctorDto(
    val doctorId: Long,
    val displayName: String,
    val department: String,
    val ratingAvg: Double = 0.0,
    val ratingCount: Int = 0,
    val consultationFee: Double = 0.0,
    val bio: String? = null,
)

// ─── Invoice ──────────────────────────────────────────────────────────────────

@Serializable
data class InvoiceDto(
    val id: Long,
    val appointmentId: Long,
    val patientId: Long,
    val amount: Double,
    val currency: String = "VND",
    val status: String,          // "PENDING" | "PAID" | "CANCELLED" | "REFUNDED"
    val description: String? = null,
    val paidAt: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

@Serializable
data class PayInvoiceResponse(
    val invoiceId: Long,
    val paymentUrl: String,
    /** Base64-encoded JSON payload for QR rendering */
    val qrPayload: String,
    val expiresAt: String? = null,
)
