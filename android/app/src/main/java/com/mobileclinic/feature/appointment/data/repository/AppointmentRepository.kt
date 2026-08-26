package com.mobileclinic.feature.appointment.data.repository

import com.mobileclinic.core.network.ApiEnvelope
import com.mobileclinic.core.network.ApiErrorBody
import com.mobileclinic.core.network.ApiResult
import com.mobileclinic.feature.appointment.data.model.AppointmentDto
import com.mobileclinic.feature.appointment.data.model.CancelAppointmentRequest
import com.mobileclinic.feature.appointment.data.model.CreateAppointmentRequest
import com.mobileclinic.feature.appointment.data.remote.AppointmentApi
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import okhttp3.ResponseBody
import retrofit2.Response
import java.io.IOException
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AppointmentRepository @Inject constructor(
    private val api: AppointmentApi,
) {
    private val json = Json { ignoreUnknownKeys = true }

    /**
     * Books an appointment with a generated Idempotency-Key.
     */
    suspend fun createAppointment(
        doctorId: Long,
        shiftId: Long,
        startTime: String,
        endTime: String? = null,
        reason: String? = null,
        idempotencyKey: String = UUID.randomUUID().toString(),
    ): ApiResult<AppointmentDto> = safeCall {
        api.createAppointment(
            idempotencyKey = idempotencyKey,
            body = CreateAppointmentRequest(
                doctorId = doctorId,
                shiftId = shiftId,
                startTime = startTime,
                endTime = endTime,
                reason = reason?.takeIf { it.isNotBlank() },
            ),
        )
    }

    suspend fun getAppointments(
        status: String? = null,
        doctorId: Long? = null,
        date: String? = null,
        limit: Int = 50,
        offset: Int = 0,
    ): ApiResult<List<AppointmentDto>> = safeCall {
        api.getAppointments(
            status = status,
            doctorId = doctorId,
            date = date,
            limit = limit,
            offset = offset,
        )
    }

    suspend fun getAppointmentById(id: Long): ApiResult<AppointmentDto> = safeCall {
        api.getAppointmentById(id)
    }

    suspend fun cancelAppointment(
        id: Long,
        cancelReason: String? = null,
    ): ApiResult<AppointmentDto> = safeCall {
        api.cancelAppointment(
            id = id,
            body = CancelAppointmentRequest(cancelReason = cancelReason),
        )
    }

    // ── Safe Call Helper ──────────────────────────────────────────────────────

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
