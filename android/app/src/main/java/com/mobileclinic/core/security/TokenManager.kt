package com.mobileclinic.core.security

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Persists JWT access/refresh tokens using EncryptedSharedPreferences
 * (AES256-GCM, key sealed in the Android Keystore via MasterKey).
 *
 * Per CLAUDE.md #3.2: JWT tokens must NEVER be stored in plain
 * SharedPreferences, files, or hardcoded — only EncryptedSharedPreferences
 * backed by the Keystore.
 */
@Singleton
class TokenManager @Inject constructor(context: Context) {

    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        PREFS_FILE_NAME,
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    // In-memory reactive mirror so UI (e.g. auth-gated navigation) can
    // observe login state without polling encrypted prefs on every frame.
    private val _isLoggedIn = MutableStateFlow(getAccessToken() != null)
    val isLoggedIn: StateFlow<Boolean> = _isLoggedIn.asStateFlow()

    fun saveTokens(accessToken: String, refreshToken: String, role: String, userId: Int) {
        prefs.edit()
            .putString(KEY_ACCESS_TOKEN, accessToken)
            .putString(KEY_REFRESH_TOKEN, refreshToken)
            .putString(KEY_ROLE, role)
            .putInt(KEY_USER_ID, userId)
            .apply()
        _isLoggedIn.value = true
    }

    fun updateAccessToken(accessToken: String) {
        prefs.edit().putString(KEY_ACCESS_TOKEN, accessToken).apply()
    }

    fun getAccessToken(): String? = prefs.getString(KEY_ACCESS_TOKEN, null)

    fun getRefreshToken(): String? = prefs.getString(KEY_REFRESH_TOKEN, null)

    fun getRole(): String? = prefs.getString(KEY_ROLE, null)

    fun getUserId(): Int = prefs.getInt(KEY_USER_ID, -1)

    /** Called on logout, 401-after-refresh-failed, or account deactivation. */
    fun clear() {
        prefs.edit().clear().apply()
        _isLoggedIn.value = false
    }

    private companion object {
        const val PREFS_FILE_NAME = "mobile_clinic_secure_prefs"
        const val KEY_ACCESS_TOKEN = "access_token"
        const val KEY_REFRESH_TOKEN = "refresh_token"
        const val KEY_ROLE = "role"
        const val KEY_USER_ID = "user_id"
    }
}
