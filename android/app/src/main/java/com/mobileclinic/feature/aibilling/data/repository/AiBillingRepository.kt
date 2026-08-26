package com.mobileclinic.feature.aibilling.data.repository

import com.mobileclinic.core.network.ApiEnvelope
import com.mobileclinic.core.network.ApiErrorBody
import com.mobileclinic.core.network.ApiResult
import com.mobileclinic.feature.aibilling.data.model.AiChatRequest
import com.mobileclinic.feature.aibilling.data.model.AiChatResponse
import com.mobileclinic.feature.aibilling.data.model.InvoiceDto
import com.mobileclinic.feature.aibilling.data.model.PayInvoiceResponse
import com.mobileclinic.feature.aibilling.data.remote.AiBillingApi
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import okhttp3.ResponseBody
import retrofit2.Response
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AiBillingRepository @Inject constructor(
    private val api: AiBillingApi,
) {
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun sendChatMessage(
        message: String,
        sessionId: String? = null,
    ): ApiResult<AiChatResponse> = safeCall {
        api.sendChatMessage(AiChatRequest(message = message, sessionId = sessionId))
    }

    suspend fun getInvoices(
        status: String? = null,
        page: Int = 1,
        pageSize: Int = 20,
    ): ApiResult<List<InvoiceDto>> = safeCall {
        api.getInvoices(status = status, page = page, pageSize = pageSize)
    }

    suspend fun getInvoiceById(id: Long): ApiResult<InvoiceDto> = safeCall {
        api.getInvoiceById(id)
    }

    suspend fun payInvoice(id: Long): ApiResult<PayInvoiceResponse> = safeCall {
        api.payInvoice(id)
    }

    // ── Generic safe-call (mirrors DoctorOpsRepository pattern) ──────────────

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
