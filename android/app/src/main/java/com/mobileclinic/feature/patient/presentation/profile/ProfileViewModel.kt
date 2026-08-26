package com.mobileclinic.feature.patient.presentation.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mobileclinic.core.network.ApiResult
import com.mobileclinic.core.ui.UiState
import com.mobileclinic.feature.patient.data.model.PatientProfileDto
import com.mobileclinic.feature.patient.data.repository.PatientIdentityRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ProfileFormState(
    val fullName: String = "",
    val phoneNumber: String = "",
    val dob: String = "",
    val address: String = "",
) {
    val isValid: Boolean get() = fullName.isNotBlank() && phoneNumber.isNotBlank()
}

sealed class SaveState {
    object Idle : SaveState()
    object Saving : SaveState()
    object Saved : SaveState()
    data class Failed(val message: String) : SaveState()
}

@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val repository: PatientIdentityRepository,
) : ViewModel() {

    private val _loadState = MutableStateFlow<UiState<PatientProfileDto>>(UiState.Loading)
    val loadState: StateFlow<UiState<PatientProfileDto>> = _loadState.asStateFlow()

    private val _saveState = MutableStateFlow<SaveState>(SaveState.Idle)
    val saveState: StateFlow<SaveState> = _saveState.asStateFlow()

    private val _form = MutableStateFlow(ProfileFormState())
    val form: StateFlow<ProfileFormState> = _form.asStateFlow()

    init {
        loadProfile()
    }

    fun loadProfile() {
        viewModelScope.launch {
            _loadState.value = UiState.Loading
            when (val result = repository.getMyProfile()) {
                is ApiResult.Success<PatientProfileDto> -> {
                    val profile = result.data
                    _form.update {
                        it.copy(
                            fullName = profile.fullName,
                            phoneNumber = profile.phoneNumber ?: "",
                            dob = profile.dob ?: "",
                            address = profile.address ?: "",
                        )
                    }
                    _loadState.value = UiState.Success(profile)
                }
                is ApiResult.Failure -> {
                    if (result.code == "PROFILE_NOT_FOUND" || result.code == "NOT_FOUND") {
                        _loadState.value = UiState.Empty
                    } else {
                        _loadState.value = UiState.Error(result.message)
                    }
                }
            }
        }
    }

    fun onFullNameChange(value: String) = _form.update { it.copy(fullName = value) }
    fun onPhoneNumberChange(value: String) = _form.update { it.copy(phoneNumber = value) }
    fun onDobChange(value: String) = _form.update { it.copy(dob = value) }
    fun onAddressChange(value: String) = _form.update { it.copy(address = value) }

    fun resetSaveState() {
        _saveState.value = SaveState.Idle
    }

    fun saveProfile() {
        val current = _form.value
        if (!current.isValid) return

        viewModelScope.launch {
            _saveState.value = SaveState.Saving
            val result = repository.updateMyProfile(
                fullName = current.fullName,
                phoneNumber = current.phoneNumber.ifBlank { null },
                dob = current.dob.ifBlank { null },
                gender = null,
                address = current.address.ifBlank { null },
            )
            when (result) {
                is ApiResult.Success<PatientProfileDto> -> {
                    _saveState.value = SaveState.Saved
                    _loadState.value = UiState.Success(result.data)
                }
                is ApiResult.Failure -> {
                    _saveState.value = SaveState.Failed(result.message)
                }
            }
        }
    }
}
