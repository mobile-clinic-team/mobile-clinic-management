package com.mobileclinic.core.network

import kotlinx.serialization.Serializable

/**
 * Mirrors the backend's standardized response shape (see CLAUDE.md #3.1):
 *   Success: { "success": true,  "data": T }
 *   Error:   { "success": false, "error": { code, message, details } }
 */
@Serializable
data class ApiEnvelope<T>(
    val success: Boolean,
    val data: T? = null,
    val error: ApiErrorBody? = null,
)

@Serializable
data class ApiErrorBody(
    val code: String,
    val message: String,
    val details: List<ApiErrorDetail> = emptyList(),
)

@Serializable
data class ApiErrorDetail(
    val field: String? = null,
    val message: String? = null,
)

/**
 * Domain-level result used throughout the repository/ViewModel layers so
 * they never touch Retrofit's `Response<T>` directly.
 */
sealed class ApiResult<out T> {
    data class Success<T>(val data: T) : ApiResult<T>()
    data class Failure(val code: String, val message: String) : ApiResult<Nothing>()
}
