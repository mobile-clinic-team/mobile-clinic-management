package com.mobileclinic.feature.aibilling.presentation.invoice

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mobileclinic.core.network.ApiResult
import com.mobileclinic.core.ui.UiState
import com.mobileclinic.feature.aibilling.data.model.InvoiceDto
import com.mobileclinic.feature.aibilling.data.model.PayInvoiceResponse
import com.mobileclinic.feature.aibilling.data.repository.AiBillingRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class InvoiceViewModel @Inject constructor(
    private val repository: AiBillingRepository,
) : ViewModel() {

    // ── Invoice List ──────────────────────────────────────────────────────────

    private val _listState = MutableStateFlow<UiState<List<InvoiceDto>>>(UiState.Idle)
    val listState: StateFlow<UiState<List<InvoiceDto>>> = _listState.asStateFlow()

    // ── Invoice Detail ────────────────────────────────────────────────────────

    private val _detailState = MutableStateFlow<UiState<InvoiceDto>>(UiState.Idle)
    val detailState: StateFlow<UiState<InvoiceDto>> = _detailState.asStateFlow()

    // ── Pay Invoice ───────────────────────────────────────────────────────────

    private val _payState = MutableStateFlow<UiState<PayInvoiceResponse>>(UiState.Idle)
    val payState: StateFlow<UiState<PayInvoiceResponse>> = _payState.asStateFlow()

    // ── Actions ───────────────────────────────────────────────────────────────

    fun loadInvoices(status: String? = null) {
        _listState.value = UiState.Loading
        viewModelScope.launch {
            when (val result = repository.getInvoices(status = status)) {
                is ApiResult.Success -> {
                    val list = result.data
                    _listState.value = if (list.isEmpty()) UiState.Empty else UiState.Success(list)
                }
                is ApiResult.Failure -> {
                    _listState.value = UiState.Error(result.message)
                }
            }
        }
    }

    fun loadInvoiceDetail(invoiceId: Long) {
        _detailState.value = UiState.Loading
        viewModelScope.launch {
            when (val result = repository.getInvoiceById(invoiceId)) {
                is ApiResult.Success -> _detailState.value = UiState.Success(result.data)
                is ApiResult.Failure -> _detailState.value = UiState.Error(result.message)
            }
        }
    }

    fun payInvoice(invoiceId: Long) {
        if (_payState.value is UiState.Loading) return
        _payState.value = UiState.Loading
        viewModelScope.launch {
            when (val result = repository.payInvoice(invoiceId)) {
                is ApiResult.Success -> _payState.value = UiState.Success(result.data)
                is ApiResult.Failure -> _payState.value = UiState.Error(result.message)
            }
        }
    }

    fun resetPayState() {
        _payState.value = UiState.Idle
    }
}
