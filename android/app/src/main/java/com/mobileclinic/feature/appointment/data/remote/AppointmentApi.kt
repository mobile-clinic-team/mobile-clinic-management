package com.mobileclinic.feature.appointment.data.remote

import com.mobileclinic.core.network.ApiEnvelope
import com.mobileclinic.feature.appointment.data.model.AppointmentDto
import com.mobileclinic.feature.appointment.data.model.CancelAppointmentRequest
import com.mobileclinic.feature.appointment.data.model.CreateAppointmentRequest
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Maps 1:1 to backend/src/modules/appointment/appointment.routes.ts
 */
interface AppointmentApi {

    /**
     * POST /api/appointments
     * Creates a new appointment with concurrency locking and idempotency protection.
     */
    @POST("api/appointments")
    suspend fun createAppointment(
        @Header("Idempotency-Key") idempotencyKey: String,
        @Body body: CreateAppointmentRequest,
    ): Response<ApiEnvelope<AppointmentDto>>

    /**
     * GET /api/appointments
     * Lists appointments for the authenticated user.
     */
    @GET("api/appointments")
    suspend fun getAppointments(
        @Query("status") status: String? = null,
        @Query("doctorId") doctorId: Long? = null,
        @Query("date") date: String? = null,
        @Query("limit") limit: Int = 50,
        @Query("offset") offset: Int = 0,
    ): Response<ApiEnvelope<List<AppointmentDto>>>

    /**
     * GET /api/appointments/:id
     * Retrieves single appointment details.
     */
    @GET("api/appointments/{id}")
    suspend fun getAppointmentById(
        @Path("id") id: Long,
    ): Response<ApiEnvelope<AppointmentDto>>

    /**
     * PATCH /api/appointments/:id/cancel
     * Cancels an appointment and frees up the slot.
     */
    @PATCH("api/appointments/{id}/cancel")
    suspend fun cancelAppointment(
        @Path("id") id: Long,
        @Body body: CancelAppointmentRequest,
    ): Response<ApiEnvelope<AppointmentDto>>
}
