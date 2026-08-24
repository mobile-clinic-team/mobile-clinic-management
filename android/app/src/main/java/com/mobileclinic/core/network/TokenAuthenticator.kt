package com.mobileclinic.core.network

import com.mobileclinic.core.security.TokenManager
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.Route
import javax.inject.Inject
import javax.inject.Singleton

@Serializable
private data class RefreshRequestDto(val refreshToken: String)

@Serializable
private data class RefreshResponseDto(val accessToken: String)

/**
 * Handles the "access token expired mid-request" case transparently:
 * on any 401, attempts one refresh using the stored refresh token, then
 * retries the original request with the new access token.
 *
 * If refresh itself fails (refresh token expired/invalid), tokens are
 * cleared so the UI's `isLoggedIn` flow flips to false and the user is
 * routed back to Login.
 *
 * Uses a bare OkHttpClient (no AuthInterceptor/Authenticator attached)
 * to avoid recursively triggering itself while calling /auth/refresh.
 */
@Singleton
class TokenAuthenticator @Inject constructor(
    private val tokenManager: TokenManager,
) : okhttp3.Authenticator {

    private val json = Json { ignoreUnknownKeys = true }
    private val plainClient = OkHttpClient.Builder().build()

    override fun authenticate(route: Route?, response: Response): Request? {
        // Avoid infinite retry loops if refresh-then-retry still 401s.
        if (responseCount(response) >= 2) return null

        val refreshToken = tokenManager.getRefreshToken() ?: return null

        val newAccessToken = runCatching { refreshSync(refreshToken) }.getOrNull()
            ?: run {
                tokenManager.clear()
                return null
            }

        tokenManager.updateAccessToken(newAccessToken)

        return response.request.newBuilder()
            .header("Authorization", "Bearer $newAccessToken")
            .build()
    }

    private fun refreshSync(refreshToken: String): String? {
        val bodyJson = json.encodeToString(
            RefreshRequestDto.serializer(),
            RefreshRequestDto(refreshToken),
        )
        val request = Request.Builder()
            .url("${ApiConfig.BASE_URL}api/auth/refresh")
            .post(bodyJson.toRequestBody("application/json".toMediaType()))
            .build()

        plainClient.newCall(request).execute().use { resp ->
            if (!resp.isSuccessful) return null
            val raw = resp.body?.string() ?: return null
            val envelope = json.decodeFromString(
                ApiEnvelope.serializer(RefreshResponseDto.serializer()),
                raw,
            )
            return envelope.data?.accessToken
        }
    }

    private fun responseCount(response: Response): Int {
        var count = 1
        var prior = response.priorResponse
        while (prior != null) {
            count++
            prior = prior.priorResponse
        }
        return count
    }
}
