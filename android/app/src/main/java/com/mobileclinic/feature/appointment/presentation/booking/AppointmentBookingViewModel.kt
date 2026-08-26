package com.mobileclinic.feature.appointment.presentation.booking

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mobileclinic.core.network.ApiResult
import com.mobileclinic.core.ui.UiState
import com.mobileclinic.feature.appointment.data.model.AppointmentDto
import com.mobileclinic.feature.appointment.data.model.DoctorSlotDto
import com.mobileclinic.feature.appointment.data.repository.AppointmentRepository
import com.mobileclinic.feature.doctorops.data.model.DoctorDto
import com.mobileclinic.feature.doctorops.data.model.ShiftDto
import com.mobileclinic.feature.doctorops.data.repository.DoctorOpsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import javax.inject.Inject

@HiltViewModel
class AppointmentBookingViewModel @Inject constructor(
    private val appointmentRepository: AppointmentRepository,
    private val doctorOpsRepository: DoctorOpsRepository,
) : ViewModel() {

    // ── Doctor Info State ─────────────────────────────────────────────────────
    private val _doctorState = MutableStateFlow<UiState<DoctorDto>>(UiState.Idle)
    val doctorState: StateFlow<UiState<DoctorDto>> = _doctorState.asStateFlow()

    // ── Shifts for Selected Date ──────────────────────────────────────────────
    private val _shiftsState = MutableStateFlow<UiState<List<ShiftDto>>>(UiState.Idle)
    val shiftsState: StateFlow<UiState<List<ShiftDto>>> = _shiftsState.asStateFlow()

    // ── Available 30-min Slots ────────────────────────────────────────────────
    private val _slots = MutableStateFlow<List<DoctorSlotDto>>(emptyList())
    val slots: StateFlow<List<DoctorSlotDto>> = _slots.asStateFlow()

    // ── Selected Form State ───────────────────────────────────────────────────
    private val _selectedDate = MutableStateFlow<LocalDate>(LocalDate.now())
    val selectedDate: StateFlow<LocalDate> = _selectedDate.asStateFlow()

    private val _selectedShift = MutableStateFlow<ShiftDto?>(null)
    val selectedShift: StateFlow<ShiftDto?> = _selectedShift.asStateFlow()

    private val _selectedSlot = MutableStateFlow<DoctorSlotDto?>(null)
    val selectedSlot: StateFlow<DoctorSlotDto?> = _selectedSlot.asStateFlow()

    private val _reason = MutableStateFlow("")
    val reason: StateFlow<String> = _reason.asStateFlow()

    // ── Booking Action State ──────────────────────────────────────────────────
    private val _bookingState = MutableStateFlow<UiState<AppointmentDto>>(UiState.Idle)
    val bookingState: StateFlow<UiState<AppointmentDto>> = _bookingState.asStateFlow()

    private var currentDoctorId: Long = -1L

    // ── Actions ───────────────────────────────────────────────────────────────

    fun initialize(doctorId: Long) {
        currentDoctorId = doctorId
        if (doctorId > 0) {
            loadDoctorInfo(doctorId)
            loadDoctorShifts(doctorId, _selectedDate.value)
        }
    }

    fun onDateSelected(date: LocalDate) {
        _selectedDate.value = date
        _selectedShift.value = null
        _selectedSlot.value = null
        _slots.value = emptyList()
        if (currentDoctorId > 0) {
            loadDoctorShifts(currentDoctorId, date)
        }
    }

    fun onShiftSelected(shift: ShiftDto) {
        _selectedShift.value = shift
        _selectedSlot.value = null
        generateSlotsForShift(shift)
    }

    fun onSlotSelected(slot: DoctorSlotDto) {
        _selectedSlot.value = slot
    }

    fun onReasonChanged(newReason: String) {
        _reason.value = newReason
    }

    fun bookAppointment() {
        val shift = _selectedShift.value
        val slot = _selectedSlot.value
        if (currentDoctorId <= 0 || shift == null || slot == null) return

        val dateStr = _selectedDate.value.format(DateTimeFormatter.ISO_LOCAL_DATE)
        val startTimeFull = "${dateStr}T${slot.startTime}:00"
        val endTimeFull = "${dateStr}T${slot.endTime}:00"

        _bookingState.value = UiState.Loading
        viewModelScope.launch {
            val result = appointmentRepository.createAppointment(
                doctorId = currentDoctorId,
                shiftId = shift.id,
                startTime = startTimeFull,
                endTime = endTimeFull,
                reason = _reason.value,
            )
            when (result) {
                is ApiResult.Success -> _bookingState.value = UiState.Success(result.data)
                is ApiResult.Failure -> _bookingState.value = UiState.Error(result.message, result.code)
            }
        }
    }

    fun resetBookingState() {
        _bookingState.value = UiState.Idle
    }

    // ── Private Helpers ───────────────────────────────────────────────────────

    private fun loadDoctorInfo(doctorId: Long) {
        _doctorState.value = UiState.Loading
        viewModelScope.launch {
            when (val result = doctorOpsRepository.getDoctorById(doctorId)) {
                is ApiResult.Success -> _doctorState.value = UiState.Success(result.data)
                is ApiResult.Failure -> _doctorState.value = UiState.Error(result.message)
            }
        }
    }

    private fun loadDoctorShifts(doctorId: Long, date: LocalDate) {
        val dateStr = date.format(DateTimeFormatter.ISO_LOCAL_DATE)
        _shiftsState.value = UiState.Loading
        viewModelScope.launch {
            when (val result = doctorOpsRepository.getDoctorShifts(doctorId, fromDate = dateStr, toDate = dateStr)) {
                is ApiResult.Success -> {
                    val shifts = result.data.filter { it.isActive }
                    if (shifts.isEmpty()) {
                        _shiftsState.value = UiState.Empty
                    } else {
                        _shiftsState.value = UiState.Success(shifts)
                        // Auto-select first shift
                        val firstShift = shifts.first()
                        _selectedShift.value = firstShift
                        generateSlotsForShift(firstShift)
                    }
                }
                is ApiResult.Failure -> _shiftsState.value = UiState.Error(result.message)
            }
        }
    }

    private fun generateSlotsForShift(shift: ShiftDto) {
        val slotList = mutableListOf<DoctorSlotDto>()
        try {
            val formatter = DateTimeFormatter.ofPattern("HH:mm")
            var current = LocalTime.parse(shift.startTime.substring(0, 5), formatter)
            val end = LocalTime.parse(shift.endTime.substring(0, 5), formatter)
            val duration = shift.slotDurationMinutes.toLong().coerceAtLeast(15L)

            var index = 0
            while (current.plusMinutes(duration) <= end) {
                val next = current.plusMinutes(duration)
                slotList.add(
                    DoctorSlotDto(
                        slotIndex = index++,
                        startTime = current.format(formatter),
                        endTime = next.format(formatter),
                        isAvailable = true,
                    )
                )
                current = next
            }
        } catch (e: Exception) {
            // Fallback default slots
            slotList.add(DoctorSlotDto(0, "08:00", "08:30"))
            slotList.add(DoctorSlotDto(1, "08:30", "09:00"))
            slotList.add(DoctorSlotDto(2, "09:00", "09:30"))
        }
        _slots.value = slotList
        if (slotList.isNotEmpty()) {
            _selectedSlot.value = slotList.first()
        }
    }
}
