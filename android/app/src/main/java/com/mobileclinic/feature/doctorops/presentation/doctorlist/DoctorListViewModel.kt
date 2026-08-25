package com.mobileclinic.feature.doctorops.presentation.doctorlist

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mobileclinic.core.network.ApiResult
import com.mobileclinic.core.ui.UiState
import com.mobileclinic.feature.doctorops.data.model.DepartmentDto
import com.mobileclinic.feature.doctorops.data.model.DoctorDto
import com.mobileclinic.feature.doctorops.data.repository.DoctorOpsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class DoctorListViewModel @Inject constructor(
    private val repository: DoctorOpsRepository,
) : ViewModel() {

    private val _departments = MutableStateFlow<List<DepartmentDto>>(emptyList())
    val departments: StateFlow<List<DepartmentDto>> = _departments.asStateFlow()

    private val _selectedDepartmentId = MutableStateFlow<Int?>(null)
    val selectedDepartmentId: StateFlow<Int?> = _selectedDepartmentId.asStateFlow()

    private val _searchQuery = MutableStateFlow("")
    val searchQuery: StateFlow<String> = _searchQuery.asStateFlow()

    private val _uiState = MutableStateFlow<UiState<List<DoctorDto>>>(UiState.Idle)
    val uiState: StateFlow<UiState<List<DoctorDto>>> = _uiState.asStateFlow()

    private var searchJob: Job? = null

    init {
        loadDepartments()
        loadDoctors()
    }

    fun loadDepartments() {
        viewModelScope.launch {
            when (val result = repository.getDepartments()) {
                is ApiResult.Success -> _departments.value = result.data
                is ApiResult.Failure -> Unit
            }
        }
    }

    fun loadDoctors() {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            val deptId = _selectedDepartmentId.value
            val query = _searchQuery.value.trim()

            when (val result = repository.getDoctors(departmentId = deptId, search = query)) {
                is ApiResult.Success -> {
                    if (result.data.isEmpty()) {
                        _uiState.value = UiState.Empty
                    } else {
                        _uiState.value = UiState.Success(result.data)
                    }
                }
                is ApiResult.Failure -> {
                    _uiState.value = UiState.Error(result.message, result.code)
                }
            }
        }
    }

    fun onDepartmentSelect(departmentId: Int?) {
        if (_selectedDepartmentId.value == departmentId) {
            _selectedDepartmentId.value = null
        } else {
            _selectedDepartmentId.value = departmentId
        }
        loadDoctors()
    }

    fun onSearchQueryChange(query: String) {
        _searchQuery.value = query
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            delay(350)
            loadDoctors()
        }
    }

    fun clearSearch() {
        _searchQuery.value = ""
        loadDoctors()
    }
}
