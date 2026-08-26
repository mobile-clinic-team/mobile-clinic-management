package com.mobileclinic.feature.appointment.presentation.list

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
class AppointmentListViewModel @Inject constructor(
    private val repository: AppointmentRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow<UiState<List<AppointmentDto>>>(UiState.Idle)
    val uiState: StateFlow<UiState<List<AppointmentDto>>> = _uiState.asStateFlow()

    private val _selectedStatusFilter = MutableStateFlow<String?>(null)
    val selectedStatusFilter: StateFlow<String?> = _selectedStatusFilter.asStateFlow()

    fun loadAppointments(statusFilter: String? = _selectedStatusFilter.value) {
        _selectedStatusFilter.value = statusFilter
        _uiState.value = UiState.Loading
        viewModelScope.launch {
            when (val result = repository.getAppointments(status = statusFilter)) {
                is ApiResult.Success -> {
                    val list = result.data
                    _uiState.value = if (list.isEmpty()) UiState.Empty else UiState.Success(list)
                }
                is ApiResult.Failure -> {
                    _uiState.value = UiState.Error(result.message)
                }
            }
        }
    }
}
