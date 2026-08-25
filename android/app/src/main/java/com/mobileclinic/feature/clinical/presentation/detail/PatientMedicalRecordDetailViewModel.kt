package com.mobileclinic.feature.clinical.presentation.detail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mobileclinic.core.network.ApiResult
import com.mobileclinic.core.ui.UiState
import com.mobileclinic.feature.clinical.data.model.MedicalRecordDetailDto
import com.mobileclinic.feature.clinical.data.repository.ClinicalRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class PatientMedicalRecordDetailViewModel @Inject constructor(
    private val repository: ClinicalRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow<UiState<MedicalRecordDetailDto>>(UiState.Idle)
    val uiState: StateFlow<UiState<MedicalRecordDetailDto>> = _uiState.asStateFlow()

    private val _downloadEvent = MutableSharedFlow<String>()
    val downloadEvent: SharedFlow<String> = _downloadEvent.asSharedFlow()

    private val _downloadLoadingId = MutableStateFlow<Int?>(null)
    val downloadLoadingId: StateFlow<Int?> = _downloadLoadingId.asStateFlow()

    fun loadRecord(recordId: Int) {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            when (val result = repository.getRecordDetail(recordId)) {
                is ApiResult.Success -> _uiState.value = UiState.Success(result.data)
                is ApiResult.Failure -> _uiState.value = UiState.Error(result.message, result.code)
            }
        }
    }

    fun downloadLabResult(labResultId: Int) {
        viewModelScope.launch {
            _downloadLoadingId.value = labResultId
            when (val result = repository.requestDownloadUrl(labResultId)) {
                is ApiResult.Success -> {
                    _downloadEvent.emit(result.data.downloadUrl)
                }
                is ApiResult.Failure -> {
                    _uiState.value = UiState.Error(result.message, result.code)
                }
            }
            _downloadLoadingId.value = null
        }
    }
}
