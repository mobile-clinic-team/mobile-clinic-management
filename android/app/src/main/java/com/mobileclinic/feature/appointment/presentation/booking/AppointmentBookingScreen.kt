package com.mobileclinic.feature.appointment.presentation.booking

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mobileclinic.core.ui.UiState
import com.mobileclinic.feature.appointment.data.model.DoctorSlotDto
import com.mobileclinic.feature.doctorops.data.model.DoctorDto
import com.mobileclinic.feature.doctorops.data.model.ShiftDto
import java.text.NumberFormat
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppointmentBookingScreen(
    doctorId: Long,
    onBookingSuccess: (appointmentId: Long) -> Unit,
    onNavigateBack: () -> Unit,
    viewModel: AppointmentBookingViewModel = hiltViewModel(),
) {
    val doctorState by viewModel.doctorState.collectAsStateWithLifecycle()
    val shiftsState by viewModel.shiftsState.collectAsStateWithLifecycle()
    val slots by viewModel.slots.collectAsStateWithLifecycle()
    val selectedDate by viewModel.selectedDate.collectAsStateWithLifecycle()
    val selectedShift by viewModel.selectedShift.collectAsStateWithLifecycle()
    val selectedSlot by viewModel.selectedSlot.collectAsStateWithLifecycle()
    val reason by viewModel.reason.collectAsStateWithLifecycle()
    val bookingState by viewModel.bookingState.collectAsStateWithLifecycle()

    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(doctorId) {
        viewModel.initialize(doctorId)
    }

    LaunchedEffect(bookingState) {
        if (bookingState is UiState.Error) {
            snackbarHostState.showSnackbar((bookingState as UiState.Error).message)
        }
    }

    // Success Dialog
    if (bookingState is UiState.Success) {
        val bookedAppointment = (bookingState as UiState.Success).data
        AlertDialog(
            onDismissRequest = {
                viewModel.resetBookingState()
                onBookingSuccess(bookedAppointment.id)
            },
            icon = {
                Icon(
                    Icons.Default.CheckCircle,
                    contentDescription = null,
                    tint = Color(0xFF059669),
                    modifier = Modifier.size(48.dp),
                )
            },
            title = {
                Text("Đặt lịch thành công!", fontWeight = FontWeight.Bold)
            },
            text = {
                Text("Cuộc hẹn của bạn đã được ghi nhận. Mã cuộc hẹn: #${bookedAppointment.id}")
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.resetBookingState()
                        onBookingSuccess(bookedAppointment.id)
                    },
                ) {
                    Text("Xem danh sách lịch hẹn")
                }
            },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Đặt lịch khám bệnh",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Quay lại")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
        bottomBar = {
            BookingBottomBar(
                doctor = (doctorState as? UiState.Success)?.data,
                selectedSlot = selectedSlot,
                isLoading = bookingState is UiState.Loading,
                onConfirmClick = viewModel::bookAppointment,
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 12.dp),
        ) {
            // ── 1. Doctor Header Card ─────────────────────────────────────────
            when (val doc = doctorState) {
                is UiState.Loading -> {
                    Box(Modifier.fillMaxWidth().height(100.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }
                is UiState.Success -> {
                    DoctorBookingHeaderCard(doctor = doc.data)
                }
                is UiState.Error -> {
                    Text(doc.message, color = MaterialTheme.colorScheme.error)
                }
                else -> Unit
            }

            Spacer(Modifier.height(16.dp))

            // ── 2. Horizontal Date Picker Ribbon ──────────────────────────────
            Text(
                "1. Chọn ngày khám",
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
            )
            Spacer(Modifier.height(8.dp))
            HorizontalDatePickerRibbon(
                selectedDate = selectedDate,
                onDateSelected = viewModel::onDateSelected,
            )

            Spacer(Modifier.height(20.dp))

            // ── 3. Shifts & Time Slots ────────────────────────────────────────
            Text(
                "2. Chọn khung giờ khám",
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
            )
            Spacer(Modifier.height(8.dp))

            when (val shifts = shiftsState) {
                is UiState.Loading -> {
                    Box(Modifier.fillMaxWidth().height(80.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }
                is UiState.Empty -> {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
                        shape = RoundedCornerShape(12.dp),
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp).fillMaxWidth(),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Icon(Icons.Default.CalendarMonth, contentDescription = null, tint = MaterialTheme.colorScheme.outline)
                            Spacer(Modifier.height(6.dp))
                            Text(
                                "Bác sĩ không có ca trực vào ngày này",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
                is UiState.Success -> {
                    // Shift filter chips if multiple shifts
                    if (shifts.data.size > 1) {
                        Row(
                            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            shifts.data.forEach { shift ->
                                FilterChip(
                                    selected = selectedShift?.id == shift.id,
                                    onClick = { viewModel.onShiftSelected(shift) },
                                    label = { Text("Ca: ${shift.startTime.substring(0, 5)} - ${shift.endTime.substring(0, 5)}") },
                                )
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                    }

                    // Slot Grid
                    if (slots.isNotEmpty()) {
                        SlotSelectionGrid(
                            slots = slots,
                            selectedSlot = selectedSlot,
                            onSlotSelected = viewModel::onSlotSelected,
                        )
                    }
                }
                is UiState.Error -> {
                    Text(shifts.message, color = MaterialTheme.colorScheme.error)
                }
                else -> Unit
            }

            Spacer(Modifier.height(20.dp))

            // ── 4. Reason for Visit ───────────────────────────────────────────
            Text(
                "3. Lý do khám / Triệu chứng sơ bộ",
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = reason,
                onValueChange = viewModel::onReasonChanged,
                placeholder = { Text("Mô tả triệu chứng hoặc lý do bạn cần khám...") },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                minLines = 3,
                maxLines = 5,
            )

            Spacer(Modifier.height(24.dp))
        }
    }
}

// ── Doctor Header Card ────────────────────────────────────────────────────────

@Composable
private fun DoctorBookingHeaderCard(doctor: DoctorDto) {
    val currencyFmt = NumberFormat.getCurrencyInstance(Locale("vi", "VN"))

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(52.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primaryContainer),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Default.Person,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onPrimaryContainer,
                    modifier = Modifier.size(30.dp),
                )
            }

            Spacer(Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = doctor.displayName,
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                doctor.departmentName?.let { dept ->
                    Text(
                        text = "Chuyên khoa: $dept",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 2.dp)) {
                    Icon(
                        Icons.Default.Star,
                        contentDescription = null,
                        tint = Color(0xFFFFB800),
                        modifier = Modifier.size(14.dp),
                    )
                    Spacer(Modifier.width(3.dp))
                    Text(
                        text = String.format(Locale.US, "%.1f", doctor.ratingAvg),
                        style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Bold),
                    )
                    Text(
                        text = " (${doctor.ratingCount} đánh giá)",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            Text(
                text = currencyFmt.format(doctor.consultationFee),
                style = MaterialTheme.typography.labelLarge.copy(
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary,
                ),
            )
        }
    }
}

// ── Horizontal Date Picker Ribbon ─────────────────────────────────────────────

@Composable
private fun HorizontalDatePickerRibbon(
    selectedDate: LocalDate,
    onDateSelected: (LocalDate) -> Unit,
) {
    val dates = remember {
        (0..13).map { LocalDate.now().plusDays(it.toLong()) }
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        dates.forEach { date ->
            val isSelected = date == selectedDate
            val dayOfWeek = date.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale("vi", "VN"))
            val dayOfMonth = date.dayOfMonth.toString()
            val month = "T${date.monthValue}"

            Surface(
                onClick = { onDateSelected(date) },
                shape = RoundedCornerShape(12.dp),
                color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface,
                tonalElevation = if (isSelected) 4.dp else 1.dp,
                shadowElevation = if (isSelected) 2.dp else 0.dp,
                border = if (!isSelected) androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant) else null,
                modifier = Modifier.width(64.dp).height(74.dp),
            ) {
                Column(
                    modifier = Modifier.padding(6.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Text(
                        text = dayOfWeek,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium,
                        color = if (isSelected) MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.8f) else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        text = dayOfMonth,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (isSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                    )
                    Text(
                        text = month,
                        fontSize = 10.sp,
                        color = if (isSelected) MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.8f) else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

// ── Time Slot Selection Grid ──────────────────────────────────────────────────

@Composable
private fun SlotSelectionGrid(
    slots: List<DoctorSlotDto>,
    selectedSlot: DoctorSlotDto?,
    onSlotSelected: (DoctorSlotDto) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        val rows = slots.chunked(3)
        rows.forEach { rowSlots ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                rowSlots.forEach { slot ->
                    val isSelected = selectedSlot?.slotIndex == slot.slotIndex
                    Surface(
                        onClick = { onSlotSelected(slot) },
                        modifier = Modifier.weight(1f).height(44.dp),
                        shape = RoundedCornerShape(10.dp),
                        color = if (isSelected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
                        border = if (isSelected) androidx.compose.foundation.BorderStroke(2.dp, MaterialTheme.colorScheme.primary)
                        else androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text(
                                text = "${slot.startTime} - ${slot.endTime}",
                                fontSize = 12.sp,
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                color = if (isSelected) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurface,
                                textAlign = TextAlign.Center,
                            )
                        }
                    }
                }
                // Fill empty cells if row < 3
                repeat(3 - rowSlots.size) {
                    Spacer(Modifier.weight(1f))
                }
            }
        }
    }
}

// ── Bottom Sticky Booking Action Bar ──────────────────────────────────────────

@Composable
private fun BookingBottomBar(
    doctor: DoctorDto?,
    selectedSlot: DoctorSlotDto?,
    isLoading: Boolean,
    onConfirmClick: () -> Unit,
) {
    val currencyFmt = NumberFormat.getCurrencyInstance(Locale("vi", "VN"))

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shadowElevation = 8.dp,
        color = MaterialTheme.colorScheme.surface,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text(
                    text = "Tổng phí khám",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = doctor?.let { currencyFmt.format(it.consultationFee) } ?: "0 đ",
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary,
                    ),
                )
            }

            Button(
                onClick = onConfirmClick,
                enabled = selectedSlot != null && !isLoading,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.height(48.dp),
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
            ) {
                if (isLoading) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), color = Color.White, strokeWidth = 2.dp)
                    Spacer(Modifier.width(8.dp))
                    Text("Đang xử lý...")
                } else {
                    Icon(Icons.Default.CalendarMonth, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Xác nhận đặt lịch", fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}
