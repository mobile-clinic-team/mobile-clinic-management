package com.mobileclinic.feature.doctorops.presentation.rating

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mobileclinic.core.network.ApiResult
import com.mobileclinic.core.ui.UiState
import com.mobileclinic.feature.doctorops.data.model.DoctorDto
import com.mobileclinic.feature.doctorops.data.model.DoctorRatingDto
import com.mobileclinic.feature.doctorops.data.repository.DoctorOpsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class RatingFormState(
    val ratingStars: Int = 5,
    val reviewComment: String = "",
    val selectedTags: Set<String> = emptySet(),
) {
    val isValid: Boolean get() = ratingStars in 1..5
}

@HiltViewModel
class RatingSubmissionViewModel @Inject constructor(
    private val repository: DoctorOpsRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    val doctorId: Long = savedStateHandle.get<Long>("doctorId")
        ?: savedStateHandle.get<String>("doctorId")?.toLongOrNull()
        ?: 1L

    val appointmentId: Long = savedStateHandle.get<Long>("appointmentId")
        ?: savedStateHandle.get<String>("appointmentId")?.toLongOrNull()
        ?: 1L

    private val _doctor = MutableStateFlow<DoctorDto?>(null)
    val doctor: StateFlow<DoctorDto?> = _doctor.asStateFlow()

    private val _form = MutableStateFlow(RatingFormState())
    val form: StateFlow<RatingFormState> = _form.asStateFlow()

    private val _submitState = MutableStateFlow<UiState<DoctorRatingDto>>(UiState.Idle)
    val submitState: StateFlow<UiState<DoctorRatingDto>> = _submitState.asStateFlow()

    init {
        loadDoctor()
    }

    private fun loadDoctor() {
        viewModelScope.launch {
            when (val result = repository.getDoctorById(doctorId)) {
                is ApiResult.Success -> _doctor.value = result.data
                is ApiResult.Failure -> Unit
            }
        }
    }

    fun onRatingStarsChange(stars: Int) {
        if (stars in 1..5) {
            _form.update { it.copy(ratingStars = stars) }
        }
    }

    fun onCommentChange(comment: String) {
        if (comment.length <= 1000) {
            _form.update { it.copy(reviewComment = comment) }
        }
    }

    fun onTagToggle(tag: String) {
        _form.update { current ->
            val updated = if (current.selectedTags.contains(tag)) {
                current.selectedTags - tag
            } else {
                current.selectedTags + tag
            }
            current.copy(selectedTags = updated)
        }
    }

    fun submitRating() {
        val current = _form.value
        if (!current.isValid) {
            _submitState.value = UiState.Error("Vui lòng chọn số sao đánh giá.")
            return
        }

        val fullComment = buildString {
            if (current.selectedTags.isNotEmpty()) {
                append("[")
                append(current.selectedTags.joinToString(", "))
                append("] ")
            }
            append(current.reviewComment.trim())
        }.trim()

        viewModelScope.launch {
            _submitState.value = UiState.Loading
            val result = repository.submitRating(
                doctorId = doctorId,
                appointmentId = appointmentId,
                ratingStars = current.ratingStars,
                reviewComment = fullComment.takeIf { it.isNotBlank() },
            )

            when (result) {
                is ApiResult.Success -> _submitState.value = UiState.Success(result.data)
                is ApiResult.Failure -> _submitState.value = UiState.Error(result.message, result.code)
            }
        }
    }

    fun resetState() {
        _submitState.value = UiState.Idle
    }
}
