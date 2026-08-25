package com.mobileclinic.feature.patient.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class RegisterRequest(
    val email: String,
    val password: String,
    val fullName: String,
    val phoneNumber: String? = null,
    val dob: String? = null, // ISO date "YYYY-MM-DD"
    val gender: String? = null, // MALE | FEMALE | OTHER
    val address: String? = null,
)

@Serializable
data class LoginRequest(
    val email: String,
    val password: String,
)

@Serializable
data class RefreshRequest(
    val refreshToken: String,
)

@Serializable
data class AuthTokensDto(
    val accessToken: String,
    val refreshToken: String,
)

@Serializable
data class UserDto(
    val id: Int,
    val email: String,
    val role: String,
    val isActive: Boolean,
)

@Serializable
data class RegisterResponseData(
    val user: UserDto,
    val profile: PatientProfileDto,
    val tokens: AuthTokensDto,
)

@Serializable
data class LoginResponseData(
    val user: UserDto,
    val tokens: AuthTokensDto,
)

@Serializable
data class RefreshResponseData(
    val accessToken: String,
)
