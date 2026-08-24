package com.mobileclinic.core.network

import com.mobileclinic.core.security.TokenManager
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject

/**
 * Attaches `Authorization: Bearer <accessToken>` to every outgoing
 * request, except the public auth endpoints (register/login/refresh)
 * which must not send a (possibly stale/absent) token.
 */
class AuthInterceptor @Inject constructor(
    private val tokenManager: TokenManager,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()
        val path = original.url.encodedPath

        if (PUBLIC_PATHS.any { path.endsWith(it) }) {
            return chain.proceed(original)
        }

        val token = tokenManager.getAccessToken()
        val request = if (token != null) {
            original.newBuilder()
                .header("Authorization", "Bearer $token")
                .build()
        } else {
            original
        }

        return chain.proceed(request)
    }

    private companion object {
        val PUBLIC_PATHS = listOf(
            "/api/auth/register",
            "/api/auth/login",
            "/api/auth/refresh",
        )
    }
}
