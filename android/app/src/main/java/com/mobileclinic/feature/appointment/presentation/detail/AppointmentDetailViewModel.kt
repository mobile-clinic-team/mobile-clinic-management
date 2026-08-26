package com.mobileclinic.feature.appointment.presentation.detail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mobileclinic.core.network.ApiResult
import com.mobileclinic.core.ui.UiState
import com.mobileclinic.feature.appointment.data.model.AppointmentDto
import com.mobileclinic.feature.appointment.data.repository.AppointmentRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class AppointmentDetailViewModel @Inject constructor(
    private val repository: AppointmentRepository,
) : ViewModel() {

    private val _detailState = MutableStateFlow<UiState<AppointmentDto>>(UiState.Idle)
    val detailState: StateFlow<UiState<AppointmentDto>> = _detailState.asStateFlow()

    private val _cancelState = MutableStateFlow<UiState<AppointmentDto>>(UiState.Idle)
    val cancelState: StateFlow<UiState<AppointmentDto>> = _cancelState.asStateFlow()

    fun loadAppointmentDetail(appointmentId: Long) {
        _detailState.value = UiState.Loading
        viewModelScope.launch {
            when (val result = repository.getAppointmentById(appointmentId)) {
                is ApiResult.Success -> _detailState.value = UiState.Success(result.data)
                is ApiResult.Failure -> _detailState.value = UiState.Error(result.message)
            }
        }
    }

    fun cancelAppointment(appointmentId: Long, reason: String? = null) {
        _cancelState.value = UiState.Loading
        viewModelScope.launch {
            when (val result = repository.cancelAppointment(appointmentId, reason)) {
                is ApiResult.Success -> {
                    _cancelState.value = UiState.Success(result.data)
                    _detailState.value = UiState.Success(result.data)
                }
                is ApiResult.Failure -> {
                    _cancelState.value = UiState.Error(result.message)
                }
            }
        }
    }

    fun resetCancelState() {
        _cancelState.value = UiState.Idle
    }
}
