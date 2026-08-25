package com.mobileclinic.feature.clinical.presentation.amendrecord

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mobileclinic.core.network.ApiResult
import com.mobileclinic.core.ui.UiState
import com.mobileclinic.feature.clinical.data.model.MedicalRecordDetailDto
import com.mobileclinic.feature.clinical.data.repository.ClinicalRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class DoctorAmendRecordViewModel @Inject constructor(
    private val repository: ClinicalRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow<UiState<MedicalRecordDetailDto>>(UiState.Idle)
    val uiState: StateFlow<UiState<MedicalRecordDetailDto>> = _uiState.asStateFlow()

    private val _recordState = MutableStateFlow<UiState<MedicalRecordDetailDto>>(UiState.Idle)
    val recordState: StateFlow<UiState<MedicalRecordDetailDto>> = _recordState.asStateFlow()

    private val _diagnosis = MutableStateFlow("")
    val diagnosis: StateFlow<String> = _diagnosis.asStateFlow()

    private val _symptoms = MutableStateFlow("")
    val symptoms: StateFlow<String> = _symptoms.asStateFlow()

    private val _treatmentPlan = MutableStateFlow("")
    val treatmentPlan: StateFlow<String> = _treatmentPlan.asStateFlow()

    private val _amendmentReason = MutableStateFlow("")
    val amendmentReason: StateFlow<String> = _amendmentReason.asStateFlow()

    fun loadCurrentRecord(recordId: Int) {
        viewModelScope.launch {
            _recordState.value = UiState.Loading
            when (val result = repository.getRecordDetail(recordId)) {
                is ApiResult.Success -> {
                    _recordState.value = UiState.Success(result.data)
                    _diagnosis.value = result.data.diagnosis
                    _symptoms.value = result.data.symptoms
                    _treatmentPlan.value = result.data.treatmentPlan ?: ""
                }
                is ApiResult.Failure -> {
                    _recordState.value = UiState.Error(result.message, result.code)
                }
            }
        }
    }

    fun updateDiagnosis(value: String) { _diagnosis.value = value }
    fun updateSymptoms(value: String) { _symptoms.value = value }
    fun updateTreatmentPlan(value: String) { _treatmentPlan.value = value }
    fun updateAmendmentReason(value: String) { _amendmentReason.value = value }

    fun submitAmendment(recordId: Int) {
        val diag = _diagnosis.value.trim()
        val symp = _symptoms.value.trim()
        val treat = _treatmentPlan.value.trim()
        val reason = _amendmentReason.value.trim()

        if (diag.length < 5) {
            _uiState.value = UiState.Error("Chẩn đoán phải có ít nhất 5 ký tự")
            return
        }
        if (symp.length < 3) {
            _uiState.value = UiState.Error("Triệu chứng phải có ít nhất 3 ký tự")
            return
        }
        if (reason.length < 10) {
            _uiState.value = UiState.Error("Lý do đính chính bắt buộc và phải có ít nhất 10 ký tự (phục vụ EMR Audit Trail)")
            return
        }

        viewModelScope.launch {
            _uiState.value = UiState.Loading
            when (val result = repository.amendRecord(
                recordId = recordId,
                diagnosis = diag,
                symptoms = symp,
                treatmentPlan = treat.ifEmpty { null },
                amendmentReason = reason,
            )) {
                is ApiResult.Success -> _uiState.value = UiState.Success(result.data)
                is ApiResult.Failure -> _uiState.value = UiState.Error(result.message, result.code)
            }
        }
    }
}
