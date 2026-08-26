package com.mobileclinic.feature.clinical.data.repository

import com.mobileclinic.core.network.ApiEnvelope
import com.mobileclinic.core.network.ApiResult
import com.mobileclinic.feature.clinical.data.model.AmendMedicalRecordRequest
import com.mobileclinic.feature.clinical.data.model.CreateMedicalRecordRequest
import com.mobileclinic.feature.clinical.data.model.DownloadUrlResponse
import com.mobileclinic.feature.clinical.data.model.MedicalRecordDetailDto
import com.mobileclinic.feature.clinical.data.model.UploadUrlRequest
import com.mobileclinic.feature.clinical.data.model.UploadUrlResponse
import com.mobileclinic.feature.clinical.data.remote.ClinicalApi
import kotlinx.serialization.json.Json
import okhttp3.ResponseBody
import retrofit2.Response
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ClinicalRepository @Inject constructor(
    private val api: ClinicalApi,
) {
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun createRecord(
        appointmentId: Int,
        initialDiagnosis: String,
        initialSymptoms: String,
        initialTreatment: String?,
    ): ApiResult<MedicalRecordDetailDto> = safeCall {
        api.createRecord(
            CreateMedicalRecordRequest(
                appointmentId = appointmentId,
                initialDiagnosis = initialDiagnosis,
                initialSymptoms = initialSymptoms,
                initialTreatment = initialTreatment,
            ),
        )
    }

    suspend fun amendRecord(
        recordId: Int,
        diagnosis: String,
        symptoms: String,
        treatmentPlan: String?,
        amendmentReason: String,
    ): ApiResult<MedicalRecordDetailDto> = safeCall {
        api.amendRecord(
            id = recordId,
            body = AmendMedicalRecordRequest(
                diagnosis = diagnosis,
                symptoms = symptoms,
                treatmentPlan = treatmentPlan,
                amendmentReason = amendmentReason,
            ),
        )
    }

    suspend fun getRecordDetail(recordId: Int): ApiResult<MedicalRecordDetailDto> = safeCall {
        api.getRecord(recordId)
    }

    suspend fun requestUploadUrl(
        recordId: Int,
        testName: String,
        fileMimeType: String,
        fileSizeBytes: Long?,
    ): ApiResult<UploadUrlResponse> = safeCall {
        api.requestUploadUrl(
            UploadUrlRequest(
                recordId = recordId,
                testName = testName,
                fileMimeType = fileMimeType,
                fileSizeBytes = fileSizeBytes,
            ),
        )
    }

    suspend fun requestDownloadUrl(labResultId: Int): ApiResult<DownloadUrlResponse> = safeCall {
        api.requestDownloadUrl(labResultId)
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
                    message = errorBody?.message ?: "Yêu cầu thất bại (${response.code()})",
                )
            }
        } catch (e: IOException) {
            ApiResult.Failure("NETWORK_ERROR", "Không thể kết nối máy chủ. Vui lòng kiểm tra mạng.")
        } catch (e: Exception) {
            ApiResult.Failure("UNKNOWN_ERROR", e.message ?: "Đã xảy ra lỗi không xác định")
        }
    }

    @Suppress("SwallowedException")
    private fun parseErrorBody(errorBody: ResponseBody?): com.mobileclinic.core.network.ApiErrorBody? {
        val raw = errorBody?.string() ?: return null
        return try {
            json.decodeFromString<ApiEnvelope<String>>(raw).error
        } catch (e: Exception) {
            null
        }
    }
}
