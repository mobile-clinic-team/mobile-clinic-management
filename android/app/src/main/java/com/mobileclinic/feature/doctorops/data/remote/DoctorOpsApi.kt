package com.mobileclinic.feature.doctorops.data.remote

import com.mobileclinic.core.network.ApiEnvelope
import com.mobileclinic.feature.doctorops.data.model.DepartmentDto
import com.mobileclinic.feature.doctorops.data.model.DoctorDto
import com.mobileclinic.feature.doctorops.data.model.DoctorRatingDto
import com.mobileclinic.feature.doctorops.data.model.RatingListResponseData
import com.mobileclinic.feature.doctorops.data.model.RegisterShiftRequest
import com.mobileclinic.feature.doctorops.data.model.ShiftDto
import com.mobileclinic.feature.doctorops.data.model.SubmitRatingRequest
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Maps 1:1 to backend/src/modules/doctor-ops/doctor-ops.routes.ts
 */
interface DoctorOpsApi {

    @GET("api/departments")
    suspend fun getDepartments(): Response<ApiEnvelope<List<DepartmentDto>>>

    @GET("api/doctors")
    suspend fun getDoctors(
        @Query("departmentId") departmentId: Int? = null,
        @Query("search") search: String? = null,
        @Query("page") page: Int = 1,
        @Query("pageSize") pageSize: Int = 20,
    ): Response<ApiEnvelope<List<DoctorDto>>>

    @GET("api/doctors/{id}")
    suspend fun getDoctorById(
        @Path("id") id: Long,
    ): Response<ApiEnvelope<DoctorDto>>

    @POST("api/doctors/shifts")
    suspend fun registerShift(
        @Body body: RegisterShiftRequest,
    ): Response<ApiEnvelope<ShiftDto>>

    @PATCH("api/doctors/shifts/{shiftId}/cancel")
    suspend fun cancelShift(
        @Path("shiftId") shiftId: Long,
    ): Response<ApiEnvelope<ShiftDto>>

    @GET("api/doctors/{id}/shifts")
    suspend fun getDoctorShifts(
        @Path("id") doctorId: Long,
        @Query("fromDate") fromDate: String? = null,
        @Query("toDate") toDate: String? = null,
        @Query("activeOnly") activeOnly: Boolean = true,
    ): Response<ApiEnvelope<List<ShiftDto>>>

    @POST("api/doctors/{id}/ratings")
    suspend fun submitRating(
        @Path("id") doctorId: Long,
        @Body body: SubmitRatingRequest,
    ): Response<ApiEnvelope<DoctorRatingDto>>

    @GET("api/doctors/{id}/ratings")
    suspend fun getDoctorRatings(
        @Path("id") doctorId: Long,
        @Query("page") page: Int = 1,
        @Query("pageSize") pageSize: Int = 20,
    ): Response<ApiEnvelope<RatingListResponseData>>
}
