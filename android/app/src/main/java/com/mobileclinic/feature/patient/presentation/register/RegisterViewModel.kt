package com.mobileclinic.feature.patient.presentation.register

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mobileclinic.core.network.ApiResult
import com.mobileclinic.core.ui.UiState
import com.mobileclinic.feature.patient.data.model.RegisterResponseData
import com.mobileclinic.feature.patient.data.repository.PatientIdentityRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class RegisterFormState(
    val email: String = "",
    val password: String = "",
    val confirmPassword: String = "",
    val fullName: String = "",
    val phoneNumber: String = "",
) {
    /** Mirrors the backend's Zod password policy for immediate client-side feedback. */
    val isPasswordStrong: Boolean
        get() = password.length >= 8 &&
            password.any { it.isUpperCase() } &&
            password.any { it.isLowerCase() } &&
            password.any { it.isDigit() }

    val passwordsMatch: Boolean
        get() = password.isNotEmpty() && password == confirmPassword

    val isValid: Boolean
        get() = email.isNotBlank() && fullName.isNotBlank() && isPasswordStrong && passwordsMatch
}

@HiltViewModel
class RegisterViewModel @Inject constructor(
    private val repository: PatientIdentityRepository,
) : ViewModel() {

    private val _form = MutableStateFlow(RegisterFormState())
    val form: StateFlow<RegisterFormState> = _form.asStateFlow()

    private val _uiState = MutableStateFlow<UiState<RegisterResponseData>>(UiState.Idle)
    val uiState: StateFlow<UiState<RegisterResponseData>> = _uiState.asStateFlow()

    fun onEmailChange(v: String) = _form.update { it.copy(email = v) }
    fun onPasswordChange(v: String) = _form.update { it.copy(password = v) }
    fun onConfirmPasswordChange(v: String) = _form.update { it.copy(confirmPassword = v) }
    fun onFullNameChange(v: String) = _form.update { it.copy(fullName = v) }
    fun onPhoneNumberChange(v: String) = _form.update { it.copy(phoneNumber = v) }

    fun register() {
        val current = _form.value
        if (!current.isValid) {
            _uiState.value = UiState.Error(
                when {
                    !current.isPasswordStrong ->
                        "Mật khẩu cần tối thiểu 8 ký tự, gồm chữ hoa, chữ thường và số"
                    !current.passwordsMatch -> "Mật khẩu xác nhận không khớp"
                    else -> "Vui lòng điền đầy đủ thông tin bắt buộc"
                },
            )
            return
        }

        viewModelScope.launch {
            _uiState.value = UiState.Loading
            val result = repository.register(
                email = current.email.trim(),
                password = current.password,
                fullName = current.fullName.trim(),
                phoneNumber = current.phoneNumber.ifBlank { null },
                dob = null,
                gender = null,
                address = null,
            )
            _uiState.value = when (result) {
                is ApiResult.Success -> UiState.Success(result.data)
                is ApiResult.Failure -> UiState.Error(result.message, result.code)
            }
        }
    }

    fun resetState() {
        _uiState.value = UiState.Idle
    }
}
