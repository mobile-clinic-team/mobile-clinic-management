package com.mobileclinic.feature.patient.data.repository

import com.mobileclinic.core.network.ApiEnvelope
import com.mobileclinic.core.network.ApiResult
import com.mobileclinic.core.security.TokenManager
import com.mobileclinic.feature.patient.data.model.LoginRequest
import com.mobileclinic.feature.patient.data.model.LoginResponseData
import com.mobileclinic.feature.patient.data.model.PatientProfileDto
import com.mobileclinic.feature.patient.data.model.RegisterRequest
import com.mobileclinic.feature.patient.data.model.RegisterResponseData
import com.mobileclinic.feature.patient.data.model.UpdateProfileRequest
import com.mobileclinic.feature.patient.data.remote.PatientIdentityApi
import kotlinx.serialization.json.Json
import okhttp3.ResponseBody
import retrofit2.Response
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class PatientIdentityRepository @Inject constructor(
    private val api: PatientIdentityApi,
    private val tokenManager: TokenManager,
) {

    private val json = Json { ignoreUnknownKeys = true }

    suspend fun register(
        email: String,
        password: String,
        fullName: String,
        phoneNumber: String?,
        dob: String?,
        gender: String?,
        address: String?,
    ): ApiResult<RegisterResponseData> = safeCall {
        api.register(
            RegisterRequest(
                email = email,
                password = password,
                fullName = fullName,
                phoneNumber = phoneNumber,
                dob = dob,
                gender = gender,
                address = address,
            ),
        )
    }.also { result ->
        if (result is ApiResult.Success) {
            val tokens = result.data.tokens
            tokenManager.saveTokens(
                accessToken = tokens.accessToken,
                refreshToken = tokens.refreshToken,
                role = result.data.user.role,
                userId = result.data.user.id,
            )
        }
    }

    suspend fun login(email: String, password: String): ApiResult<LoginResponseData> =
        safeCall { api.login(LoginRequest(email, password)) }
            .also { result ->
                if (result is ApiResult.Success) {
                    val tokens = result.data.tokens
                    tokenManager.saveTokens(
                        accessToken = tokens.accessToken,
                        refreshToken = tokens.refreshToken,
                        role = result.data.user.role,
                        userId = result.data.user.id,
                    )
                }
            }

    suspend fun getMyProfile(): ApiResult<PatientProfileDto> = safeCall { api.getProfile() }

    suspend fun updateMyProfile(
        fullName: String?,
        phoneNumber: String?,
        dob: String?,
        gender: String?,
        address: String?,
    ): ApiResult<PatientProfileDto> = safeCall {
        api.updateProfile(
            UpdateProfileRequest(
                fullName = fullName,
                phoneNumber = phoneNumber,
                dob = dob,
                gender = gender,
                address = address,
            ),
        )
    }

    fun logout() {
        tokenManager.clear()
    }

    /**
     * Unwraps a Retrofit call into the app's [ApiResult], handling:
     *  - HTTP success + envelope.success == true  -> Success(data)
     *  - HTTP error with a parsed error envelope   -> Failure(code, message)
     *  - Network/IO failures (no connectivity, timeout) -> Failure("NETWORK_ERROR", ...)
     *  - Any other unexpected shape                -> Failure("UNKNOWN_ERROR", ...)
     */
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
                    message = errorBody?.message ?: "Request failed (HTTP ${response.code()})",
                )
            }
        } catch (e: IOException) {
            ApiResult.Failure("NETWORK_ERROR", "Không thể kết nối máy chủ. Vui lòng kiểm tra mạng.")
        } catch (e: Exception) {
            ApiResult.Failure("UNKNOWN_ERROR", e.message ?: "Đã xảy ra lỗi không xác định")
        }
    }

    /**
     * Error responses carry no `data` payload, so they're parsed into a
     * minimal envelope shape (`data` typed as Unit) purely to extract
     * the `error` block - avoids unsafe generic-type casts.
     */
    @Suppress("SwallowedException")
    private fun parseErrorBody(errorBody: ResponseBody?): com.mobileclinic.core.network.ApiErrorBody? {
        val raw = errorBody?.string() ?: return null
        return try {
            json.decodeFromString<com.mobileclinic.core.network.ApiEnvelope<String>>(raw).error
        } catch (e: Exception) {
            null
        }
    }
}
