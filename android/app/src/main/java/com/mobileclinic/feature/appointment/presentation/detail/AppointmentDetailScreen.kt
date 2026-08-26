package com.mobileclinic.feature.appointment.presentation.detail

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Divider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mobileclinic.core.ui.UiState
import com.mobileclinic.feature.appointment.data.model.AppointmentDto

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppointmentDetailScreen(
    appointmentId: Long,
    onViewMedicalRecord: (appointmentId: Long) -> Unit,
    onRateDoctor: (appointmentId: Long, doctorId: Long) -> Unit,
    onNavigateBack: () -> Unit,
    viewModel: AppointmentDetailViewModel = hiltViewModel(),
) {
    val detailState by viewModel.detailState.collectAsStateWithLifecycle()
    val cancelState by viewModel.cancelState.collectAsStateWithLifecycle()

    var showCancelDialog by remember { mutableStateOf(false) }
    var cancelReason by remember { mutableStateOf("") }
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(appointmentId) {
        viewModel.loadAppointmentDetail(appointmentId)
    }

    LaunchedEffect(cancelState) {
        if (cancelState is UiState.Error) {
            snackbarHostState.showSnackbar((cancelState as UiState.Error).message)
        } else if (cancelState is UiState.Success) {
            snackbarHostState.showSnackbar("Hủy lịch khám thành công")
            viewModel.resetCancelState()
        }
    }

    // Cancel Confirmation Dialog
    if (showCancelDialog) {
        AlertDialog(
            onDismissRequest = { showCancelDialog = false },
            icon = { Icon(Icons.Default.Cancel, contentDescription = null, tint = Color(0xFFDC2626)) },
            title = { Text("Xác nhận hủy cuộc hẹn", fontWeight = FontWeight.Bold) },
            text = {
                Column {
                    Text("Bạn có chắc chắn muốn hủy cuộc hẹn này không? Khung giờ khám sẽ được giải phóng cho bệnh nhân khác.")
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = cancelReason,
                        onValueChange = { cancelReason = it },
                        placeholder = { Text("Lý do hủy (không bắt buộc)...") },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(8.dp),
                        maxLines = 3,
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        showCancelDialog = false
                        viewModel.cancelAppointment(appointmentId, cancelReason)
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFDC2626)),
                ) {
                    Text("Xác nhận hủy")
                }
            },
            dismissButton = {
                TextButton(onClick = { showCancelDialog = false }) {
                    Text("Giữ lại")
                }
            },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Chi tiết cuộc hẹn", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Quay lại")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface),
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        when (val state = detailState) {
            is UiState.Loading -> {
                Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            is UiState.Error -> {
                Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(state.message, color = MaterialTheme.colorScheme.error)
                        Spacer(Modifier.height(12.dp))
                        Button(onClick = { viewModel.loadAppointmentDetail(appointmentId) }) {
                            Text("Thử lại")
                        }
                    }
                }
            }
            is UiState.Success -> {
                val appointment = state.data
                AppointmentDetailContent(
                    appointment = appointment,
                    isCanceling = cancelState is UiState.Loading,
                    onCancelClick = { showCancelDialog = true },
                    onViewMedicalRecordClick = { onViewMedicalRecord(appointment.id) },
                    onRateDoctorClick = { onRateDoctor(appointment.id, appointment.doctorId) },
                    modifier = Modifier.padding(padding),
                )
            }
            else -> Unit
        }
    }
}

@Composable
private fun AppointmentDetailContent(
    appointment: AppointmentDto,
    isCanceling: Boolean,
    onCancelClick: () -> Unit,
    onViewMedicalRecordClick: () -> Unit,
    onRateDoctorClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val (statusLabel, statusColor) = when (appointment.status) {
        "CONFIRMED" -> "Đã xác nhận" to Color(0xFF059669)
        "COMPLETED" -> "Đã hoàn thành" to Color(0xFF0284C7)
        "CANCELLED" -> "Đã hủy" to Color(0xFFDC2626)
        else -> "Chờ khám" to Color(0xFFD97706)
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
    ) {
        // ── Status Banner ─────────────────────────────────────────────────────
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = statusColor.copy(alpha = 0.10f)),
        ) {
            Row(
                modifier = Modifier.padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = if (appointment.status == "CANCELLED") Icons.Default.Cancel else Icons.Default.CheckCircle,
                    contentDescription = null,
                    tint = statusColor,
                    modifier = Modifier.size(32.dp),
                )
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(
                        statusLabel,
                        style = MaterialTheme.typography.titleMedium.copy(
                            fontWeight = FontWeight.Bold,
                            color = statusColor,
                        ),
                    )
                    Text(
                        "Mã cuộc hẹn: #${appointment.id}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        Spacer(Modifier.height(16.dp))

        // ── Appointment Details Card ──────────────────────────────────────────
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                DetailRow("Bác sĩ phụ trách", appointment.doctorName ?: "Bác sĩ #${appointment.doctorId}")
                appointment.departmentName?.let {
                    Divider(modifier = Modifier.padding(vertical = 8.dp))
                    DetailRow("Chuyên khoa", it)
                }
                Divider(modifier = Modifier.padding(vertical = 8.dp))
                DetailRow("Thời gian bắt đầu", appointment.startTime.replace("T", " "))
                Divider(modifier = Modifier.padding(vertical = 8.dp))
                DetailRow("Thời gian kết thúc", appointment.endTime.replace("T", " "))
                appointment.reason?.takeIf { it.isNotBlank() }?.let {
                    Divider(modifier = Modifier.padding(vertical = 8.dp))
                    DetailRow("Lý do khám", it)
                }
            }
        }

        Spacer(Modifier.height(20.dp))

        // ── Action Buttons ────────────────────────────────────────────────────
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            // Cancel button (only when PENDING or CONFIRMED)
            if (appointment.status == "PENDING" || appointment.status == "CONFIRMED") {
                OutlinedButton(
                    onClick = onCancelClick,
                    enabled = !isCanceling,
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFDC2626)),
                ) {
                    if (isCanceling) {
                        CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                    } else {
                        Icon(Icons.Default.Cancel, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Hủy lịch khám này", fontWeight = FontWeight.SemiBold)
                    }
                }
            }

            // Completed actions: EMR & Rating
            if (appointment.status == "COMPLETED") {
                Button(
                    onClick = onViewMedicalRecordClick,
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
                ) {
                    Icon(Icons.Default.Description, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Xem Hồ sơ Bệnh án (EMR)", fontWeight = FontWeight.Bold)
                }

                OutlinedButton(
                    onClick = onRateDoctorClick,
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                    shape = RoundedCornerShape(12.dp),
                ) {
                    Icon(Icons.Default.Star, contentDescription = null, tint = Color(0xFFFFB800), modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Đánh giá Bác sĩ", fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

@Composable
private fun DetailRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold))
    }
}
