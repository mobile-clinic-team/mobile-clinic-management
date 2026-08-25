package com.mobileclinic.feature.patient.presentation.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mobileclinic.core.network.ApiResult
import com.mobileclinic.core.ui.UiState
import com.mobileclinic.feature.patient.data.model.LoginResponseData
import com.mobileclinic.feature.patient.data.repository.PatientIdentityRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class LoginFormState(
    val email: String = "",
    val password: String = "",
) {
    val isValid: Boolean
        get() = email.isNotBlank() && password.isNotBlank()
}

@HiltViewModel
class LoginViewModel @Inject constructor(
    private val repository: PatientIdentityRepository,
) : ViewModel() {

    private val _form = MutableStateFlow(LoginFormState())
    val form: StateFlow<LoginFormState> = _form.asStateFlow()

    private val _uiState = MutableStateFlow<UiState<LoginResponseData>>(UiState.Idle)
    val uiState: StateFlow<UiState<LoginResponseData>> = _uiState.asStateFlow()

    fun onEmailChange(value: String) {
        _form.update { it.copy(email = value) }
    }

    fun onPasswordChange(value: String) {
        _form.update { it.copy(password = value) }
    }

    fun login() {
        val current = _form.value
        if (!current.isValid) {
            _uiState.value = UiState.Error("Vui lòng nhập đầy đủ email và mật khẩu")
            return
        }

        viewModelScope.launch {
            _uiState.value = UiState.Loading
            when (val result = repository.login(current.email.trim(), current.password)) {
                is ApiResult.Success -> _uiState.value = UiState.Success(result.data)
                is ApiResult.Failure -> _uiState.value = UiState.Error(result.message, result.code)
            }
        }
    }

    /** Lets the screen reset state after navigating away on success. */
    fun resetState() {
        _uiState.value = UiState.Idle
    }
}
