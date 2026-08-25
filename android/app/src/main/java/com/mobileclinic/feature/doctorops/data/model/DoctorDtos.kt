package com.mobileclinic.feature.doctorops.data.model

import kotlinx.serialization.Serializable

@Serializable
data class DepartmentDto(
    val id: Int,
    val name: String,
    val description: String? = null,
    val iconUrl: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

@Serializable
data class DoctorDto(
    val id: Long,
    val userId: Long,
    val departmentId: Int,
    val departmentName: String? = null,
    val displayName: String,
    val bio: String? = null,
    val consultationFee: Double = 0.0,
    val ratingAvg: Double = 0.0,
    val ratingCount: Int = 0,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

@Serializable
data class CreateDoctorProfileRequest(
    val departmentId: Int,
    val bio: String? = null,
    val consultationFee: Double = 0.0,
)

@Serializable
data class ShiftDto(
    val id: Long,
    val doctorId: Long,
    val shiftDate: String,
    val startTime: String,
    val endTime: String,
    val slotDurationMinutes: Int = 30,
    val isActive: Boolean = true,
)

@Serializable
data class RegisterShiftRequest(
    val shiftDate: String,
    val startTime: String,
    val endTime: String,
    val slotDurationMinutes: Int = 30,
)

@Serializable
data class DoctorRatingDto(
    val id: Long,
    val appointmentId: Long,
    val doctorId: Long,
    val patientId: Long,
    val ratingStars: Int,
    val reviewComment: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

@Serializable
data class SubmitRatingRequest(
    val appointmentId: Long,
    val ratingStars: Int,
    val reviewComment: String? = null,
)

@Serializable
data class RatingStatsDto(
    val doctorId: Long,
    val ratingAvg: Double = 0.0,
    val ratingCount: Int = 0,
    val distribution: Map<String, Int> = emptyMap(),
)

@Serializable
data class RatingListResponseData(
    val items: List<DoctorRatingDto> = emptyList(),
    val stats: RatingStatsDto? = null,
)
