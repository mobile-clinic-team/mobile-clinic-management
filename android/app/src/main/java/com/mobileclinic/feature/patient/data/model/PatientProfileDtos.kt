package com.mobileclinic.feature.patient.data.model

import kotlinx.serialization.Serializable

@Serializable
data class PatientProfileDto(
    val id: Int,
    val userId: Int,
    val fullName: String,
    val phoneNumber: String? = null,
    val dob: String? = null,
    val gender: String? = null, // MALE | FEMALE | OTHER
    val address: String? = null,
)

/** Only non-null fields are sent - lets the backend PATCH-style update. */
@Serializable
data class UpdateProfileRequest(
    val fullName: String? = null,
    val phoneNumber: String? = null,
    val dob: String? = null,
    val gender: String? = null,
    val address: String? = null,
)
