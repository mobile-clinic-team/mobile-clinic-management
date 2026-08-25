package com.mobileclinic.core.ui

/**
 * Generic screen-state wrapper used by every ViewModel in the app so
 * Composables can render Loading / Success / Error / Empty consistently.
 *
 * `Empty` is distinct from `Success(emptyList/null)` on purpose: it lets
 * a screen show a dedicated "nothing here yet" illustration/CTA instead
 * of an empty list with no explanation.
 */
sealed class UiState<out T> {
    data object Idle : UiState<Nothing>()
    data object Loading : UiState<Nothing>()
    data class Success<T>(val data: T) : UiState<T>()
    data class Error(val message: String, val code: String? = null) : UiState<Nothing>()
    data object Empty : UiState<Nothing>()
}

/** Convenience helpers so Composables don't need `is` checks everywhere. */
val UiState<*>.isLoading: Boolean get() = this is UiState.Loading
