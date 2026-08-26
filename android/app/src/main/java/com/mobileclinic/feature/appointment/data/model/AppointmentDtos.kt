package com.mobileclinic.feature.appointment.data.model

import kotlinx.serialization.Serializable

@Serializable
data class AppointmentDto(
    val id: Long,
    val patientId: Long,
    val doctorId: Long,
    val shiftId: Long,
    val startTime: String,
    val endTime: String,
    val status: String, // "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED"
    val reason: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val doctorName: String? = null,
    val departmentName: String? = null,
    val patientName: String? = null,
    val patientEmail: String? = null,
)

@Serializable
data class CreateAppointmentRequest(
    val doctorId: Long,
    val shiftId: Long,
    val startTime: String,
    val endTime: String? = null,
    val reason: String? = null,
)

@Serializable
data class CancelAppointmentRequest(
    val cancelReason: String? = null,
)

/**
 * UI representation of a 30-minute booking slot inside a doctor working shift.
 */
data class DoctorSlotDto(
    val slotIndex: Int,
    val startTime: String, // e.g. "08:00" or ISO
    val endTime: String,   // e.g. "08:30" or ISO
    val isAvailable: Boolean = true,
)
