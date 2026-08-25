package com.mobileclinic.feature.doctorops.data.repository

import com.mobileclinic.core.network.ApiEnvelope
import com.mobileclinic.core.network.ApiErrorBody
import com.mobileclinic.core.network.ApiResult
import com.mobileclinic.core.security.TokenManager
import com.mobileclinic.feature.doctorops.data.model.DepartmentDto
import com.mobileclinic.feature.doctorops.data.model.DoctorDto
import com.mobileclinic.feature.doctorops.data.model.DoctorRatingDto
import com.mobileclinic.feature.doctorops.data.model.RatingListResponseData
import com.mobileclinic.feature.doctorops.data.model.RegisterShiftRequest
import com.mobileclinic.feature.doctorops.data.model.ShiftDto
import com.mobileclinic.feature.doctorops.data.model.SubmitRatingRequest
import com.mobileclinic.feature.doctorops.data.remote.DoctorOpsApi
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import okhttp3.ResponseBody
import retrofit2.Response
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DoctorOpsRepository @Inject constructor(
    private val api: DoctorOpsApi,
    private val tokenManager: TokenManager,
) {
    private val json = Json { ignoreUnknownKeys = true }

    fun getCurrentUserRole(): String? = tokenManager.getRole()

    fun getCurrentUserId(): Long? = tokenManager.getUserId()

    fun isDoctor(): Boolean = getCurrentUserRole().equals("doctor", ignoreCase = true)

    suspend fun getDepartments(): ApiResult<List<DepartmentDto>> =
        safeCall { api.getDepartments() }

    suspend fun getDoctors(
        departmentId: Int? = null,
        search: String? = null,
        page: Int = 1,
        pageSize: Int = 20,
    ): ApiResult<List<DoctorDto>> = safeCall {
        api.getDoctors(
            departmentId = departmentId,
            search = search?.takeIf { it.isNotBlank() },
            page = page,
            pageSize = pageSize,
        )
    }

    suspend fun getDoctorById(id: Long): ApiResult<DoctorDto> =
        safeCall { api.getDoctorById(id) }

    suspend fun registerShift(
        shiftDate: String,
        startTime: String,
        endTime: String,
        slotDurationMinutes: Int = 30,
    ): ApiResult<ShiftDto> = safeCall {
        api.registerShift(
            RegisterShiftRequest(
                shiftDate = shiftDate,
                startTime = startTime,
                endTime = endTime,
                slotDurationMinutes = slotDurationMinutes,
            )
        )
    }

    suspend fun cancelShift(shiftId: Long): ApiResult<ShiftDto> =
        safeCall { api.cancelShift(shiftId) }

    suspend fun getDoctorShifts(
        doctorId: Long,
        fromDate: String? = null,
        toDate: String? = null,
        activeOnly: Boolean = true,
    ): ApiResult<List<ShiftDto>> = safeCall {
        api.getDoctorShifts(
            doctorId = doctorId,
            fromDate = fromDate,
            toDate = toDate,
            activeOnly = activeOnly,
        )
    }

    suspend fun submitRating(
        doctorId: Long,
        appointmentId: Long,
        ratingStars: Int,
        reviewComment: String? = null,
    ): ApiResult<DoctorRatingDto> = safeCall {
        api.submitRating(
            doctorId = doctorId,
            body = SubmitRatingRequest(
                appointmentId = appointmentId,
                ratingStars = ratingStars,
                reviewComment = reviewComment?.takeIf { it.isNotBlank() },
            ),
        )
    }

    suspend fun getDoctorRatings(
        doctorId: Long,
        page: Int = 1,
        pageSize: Int = 20,
    ): ApiResult<RatingListResponseData> = safeCall {
        api.getDoctorRatings(doctorId = doctorId, page = page, pageSize = pageSize)
    }

    private suspend fun <T> safeCall(
        block: suspend () -> Response<ApiEnvelope<T>>,
    ): ApiResult<T> {
        return try {
            val response = block()
            val envelope = response.body()

            if (response.isSuccessful && envelope?.success == true && envelope.data != null) {
                ApiResult.Success(envelope.data)
            } else {
                val errorBody = envelope?.error ?: parseErrorBody(response.errorBody())
                ApiResult.Failure(
                    code = errorBody?.code ?: "HTTP_${response.code()}",
                    message = errorBody?.message ?: "Yêu cầu thất bại (HTTP ${response.code()})",
                )
            }
        } catch (e: IOException) {
            ApiResult.Failure("NETWORK_ERROR", "Không thể kết nối máy chủ. Vui lòng kiểm tra mạng.")
        } catch (e: Exception) {
            ApiResult.Failure("UNKNOWN_ERROR", e.message ?: "Đã xảy ra lỗi không xác định")
        }
    }

    @Suppress("SwallowedException")
    private fun parseErrorBody(errorBody: ResponseBody?): ApiErrorBody? {
        val raw = errorBody?.string() ?: return null
        return try {
            json.decodeFromString(ApiEnvelope.serializer(Unit.serializer()), raw).error
        } catch (e: Exception) {
            null
        }
    }
}
