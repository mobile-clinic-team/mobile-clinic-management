package com.mobileclinic.feature.clinical.presentation.createrecord

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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.MedicalServices
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.mobileclinic.core.ui.UiState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DoctorCreateRecordScreen(
    appointmentId: Int,
    viewModel: DoctorCreateRecordViewModel,
    onNavigateBack: () -> Unit,
    onRecordCreated: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val uiState by viewModel.uiState.collectAsState()
    val diagnosis by viewModel.diagnosis.collectAsState()
    val symptoms by viewModel.symptoms.collectAsState()
    val treatmentPlan by viewModel.treatmentPlan.collectAsState()

    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(uiState) {
        when (val state = uiState) {
            is UiState.Success -> onRecordCreated(state.data.id)
            is UiState.Error -> snackbarHostState.showSnackbar(state.message)
            else -> Unit
        }
    }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text("Tạo Bệnh Án (EMR v1)") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Quay lại",
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                    titleContentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                ),
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant,
                ),
                shape = RoundedCornerShape(12.dp),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Icon(
                        imageVector = Icons.Default.MedicalServices,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                    )
                    Column {
                        Text(
                            text = "Cuộc hẹn khám #$appointmentId",
                            style = MaterialTheme.typography.titleMedium,
                        )
                        Text(
                            text = "Bệnh án gốc (v1) sẽ được lưu trữ bất biến (Immutable).",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            OutlinedTextField(
                value = symptoms,
                onValueChange = viewModel::updateSymptoms,
                label = { Text("Triệu chứng ban đầu *") },
                placeholder = { Text("Mô tả chi tiết các triệu chứng bệnh nhân gặp phải...") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 3,
                maxLines = 6,
                shape = RoundedCornerShape(12.dp),
            )

            OutlinedTextField(
                value = diagnosis,
                onValueChange = viewModel::updateDiagnosis,
                label = { Text("Chẩn đoán y khoa *") },
                placeholder = { Text("Kết luận chẩn đoán lâm sàng...") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 3,
                maxLines = 6,
                shape = RoundedCornerShape(12.dp),
            )

            OutlinedTextField(
                value = treatmentPlan,
                onValueChange = viewModel::updateTreatmentPlan,
                label = { Text("Phác đồ / Hướng điều trị (Tùy chọn)") },
                placeholder = { Text("Lời dặn bác sĩ, chế độ sinh hoạt, theo dõi...") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 3,
                maxLines = 6,
                shape = RoundedCornerShape(12.dp),
            )

            Spacer(modifier = Modifier.height(8.dp))

            Button(
                onClick = { viewModel.submitRecord(appointmentId) },
                enabled = uiState !is UiState.Loading,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                shape = RoundedCornerShape(12.dp),
            ) {
                if (uiState is UiState.Loading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        color = MaterialTheme.colorScheme.onPrimary,
                        strokeWidth = 2.dp,
                    )
                } else {
                    Icon(imageVector = Icons.Default.CheckCircle, contentDescription = null)
                    Spacer(modifier = Modifier.size(8.dp))
                    Text("Lưu Bệnh Án Ban Đầu (v1)")
                }
            }
        }
    }
}
