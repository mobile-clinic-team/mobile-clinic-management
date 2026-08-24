package com.mobileclinic.feature.patient.data.remote

import com.mobileclinic.core.network.ApiEnvelope
import com.mobileclinic.feature.patient.data.model.LoginRequest
import com.mobileclinic.feature.patient.data.model.LoginResponseData
import com.mobileclinic.feature.patient.data.model.PatientProfileDto
import com.mobileclinic.feature.patient.data.model.RefreshRequest
import com.mobileclinic.feature.patient.data.model.RefreshResponseData
import com.mobileclinic.feature.patient.data.model.RegisterRequest
import com.mobileclinic.feature.patient.data.model.RegisterResponseData
import com.mobileclinic.feature.patient.data.model.UpdateProfileRequest
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT

/**
 * Maps 1:1 to backend/src/modules/patient-identity/patient-identity.routes.ts
 * Retrofit's `Response<T>` (not just `T`) is used so the repository can
 * inspect HTTP status codes and the parsed error envelope on failure.
 */
interface PatientIdentityApi {

    @POST("api/auth/register")
    suspend fun register(@Body body: RegisterRequest): Response<ApiEnvelope<RegisterResponseData>>

    @POST("api/auth/login")
    suspend fun login(@Body body: LoginRequest): Response<ApiEnvelope<LoginResponseData>>

    @POST("api/auth/refresh")
    suspend fun refresh(@Body body: RefreshRequest): Response<ApiEnvelope<RefreshResponseData>>

    @GET("api/patients/profile")
    suspend fun getProfile(): Response<ApiEnvelope<PatientProfileDto>>

    @PUT("api/patients/profile")
    suspend fun updateProfile(@Body body: UpdateProfileRequest): Response<ApiEnvelope<PatientProfileDto>>

    @DELETE("api/patients/profile")
    suspend fun deleteProfile(): Response<Unit>
}
