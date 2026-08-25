package com.mobileclinic.feature.doctorops.presentation.shift

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mobileclinic.core.network.ApiResult
import com.mobileclinic.core.ui.UiState
import com.mobileclinic.feature.doctorops.data.model.ShiftDto
import com.mobileclinic.feature.doctorops.data.repository.DoctorOpsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import javax.inject.Inject

data class ShiftFormState(
    val shiftDate: String = LocalDate.now().plusDays(1).format(DateTimeFormatter.ISO_LOCAL_DATE),
    val startTime: String = "08:00",
    val endTime: String = "12:00",
    val slotDurationMinutes: Int = 30,
) {
    val isValid: Boolean
        get() {
            if (shiftDate.isBlank() || startTime.isBlank() || endTime.isBlank()) return false
            return try {
                val start = LocalTime.parse(startTime)
                val end = LocalTime.parse(endTime)
                end.isAfter(start)
            } catch (e: Exception) {
                false
            }
        }
}

@HiltViewModel
class ShiftRegistrationViewModel @Inject constructor(
    private val repository: DoctorOpsRepository,
) : ViewModel() {

    val isDoctorRole: Boolean = repository.isDoctor()

    private val _form = MutableStateFlow(ShiftFormState())
    val form: StateFlow<ShiftFormState> = _form.asStateFlow()

    private val _submitState = MutableStateFlow<UiState<ShiftDto>>(UiState.Idle)
    val submitState: StateFlow<UiState<ShiftDto>> = _submitState.asStateFlow()

    private val _shiftsState = MutableStateFlow<UiState<List<ShiftDto>>>(UiState.Idle)
    val shiftsState: StateFlow<UiState<List<ShiftDto>>> = _shiftsState.asStateFlow()

    init {
        if (isDoctorRole) {
            loadShifts()
        }
    }

    fun onDateChange(date: String) {
        _form.update { it.copy(shiftDate = date) }
    }

    fun onStartTimeChange(time: String) {
        _form.update { it.copy(startTime = time) }
    }

    fun onEndTimeChange(time: String) {
        _form.update { it.copy(endTime = time) }
    }

    fun onSlotDurationChange(duration: Int) {
        _form.update { it.copy(slotDurationMinutes = duration) }
    }

    fun loadShifts() {
        val doctorUserId = repository.getCurrentUserId() ?: return
        viewModelScope.launch {
            _shiftsState.value = UiState.Loading
            when (val result = repository.getDoctorShifts(doctorId = doctorUserId, activeOnly = true)) {
                is ApiResult.Success -> {
                    if (result.data.isEmpty()) {
                        _shiftsState.value = UiState.Empty
                    } else {
                        _shiftsState.value = UiState.Success(result.data)
                    }
                }
                is ApiResult.Failure -> {
                    _shiftsState.value = UiState.Error(result.message, result.code)
                }
            }
        }
    }

    fun registerShift() {
        val currentForm = _form.value
        if (!currentForm.isValid) {
            _submitState.value = UiState.Error("Giờ kết thúc ca trực phải sau giờ bắt đầu.")
            return
        }

        viewModelScope.launch {
            _submitState.value = UiState.Loading
            val result = repository.registerShift(
                shiftDate = currentForm.shiftDate.trim(),
                startTime = currentForm.startTime.trim(),
                endTime = currentForm.endTime.trim(),
                slotDurationMinutes = currentForm.slotDurationMinutes,
            )

            when (result) {
                is ApiResult.Success -> {
                    _submitState.value = UiState.Success(result.data)
                    loadShifts() // refresh shifts list
                }
                is ApiResult.Failure -> {
                    _submitState.value = UiState.Error(result.message, result.code)
                }
            }
        }
    }

    fun cancelShift(shiftId: Long) {
        viewModelScope.launch {
            when (val result = repository.cancelShift(shiftId)) {
                is ApiResult.Success -> loadShifts()
                is ApiResult.Failure -> {
                    _submitState.value = UiState.Error(result.message, result.code)
                }
            }
        }
    }

    fun resetSubmitState() {
        _submitState.value = UiState.Idle
    }
}
