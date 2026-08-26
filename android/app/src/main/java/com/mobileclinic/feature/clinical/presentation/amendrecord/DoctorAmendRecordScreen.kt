package com.mobileclinic.feature.clinical.presentation.amendrecord

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
import androidx.compose.material.icons.filled.EditNote
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Warning
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

import androidx.hilt.navigation.compose.hiltViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DoctorAmendRecordScreen(
    recordId: Int,
    onNavigateBack: () -> Unit,
    onAmendmentSuccess: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: DoctorAmendRecordViewModel = hiltViewModel(),
) {
    val recordState by viewModel.recordState.collectAsState()
    val uiState by viewModel.uiState.collectAsState()

    val diagnosis by viewModel.diagnosis.collectAsState()
    val symptoms by viewModel.symptoms.collectAsState()
    val treatmentPlan by viewModel.treatmentPlan.collectAsState()
    val amendmentReason by viewModel.amendmentReason.collectAsState()

    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(recordId) {
        viewModel.loadCurrentRecord(recordId)
    }

    LaunchedEffect(uiState) {
        when (val state = uiState) {
            is UiState.Success -> onAmendmentSuccess()
            is UiState.Error -> snackbarHostState.showSnackbar(state.message)
            else -> Unit
        }
    }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text("Đính Chính Bệnh Án") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Quay lại",
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.tertiaryContainer,
                    titleContentColor = MaterialTheme.colorScheme.onTertiaryContainer,
                ),
            )
        },
    ) { innerPadding ->
        if (recordState is UiState.Loading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator()
            }
        } else {
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
                        containerColor = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.4f),
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
                            imageVector = Icons.Default.Warning,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.error,
                        )
                        Column {
                            Text(
                                text = "Quy tắc Bất biến (EMR Immutability)",
                                style = MaterialTheme.typography.titleSmall,
                                color = MaterialTheme.colorScheme.error,
                            )
                            Text(
                                text = "Hệ thống không ghi đè dữ liệu cũ. Việc đính chính sẽ tạo một Version mới kèm theo Lý do đính chính phục vụ Audit Trail y khoa.",
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
                }

                OutlinedTextField(
                    value = amendmentReason,
                    onValueChange = viewModel::updateAmendmentReason,
                    label = { Text("Lý do đính chính y khoa *") },
                    placeholder = { Text("Ghi rõ lý do thay đổi chẩn đoán hoặc phác đồ (tối thiểu 10 ký tự)...") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 2,
                    maxLines = 4,
                    shape = RoundedCornerShape(12.dp),
                )

                OutlinedTextField(
                    value = symptoms,
                    onValueChange = viewModel::updateSymptoms,
                    label = { Text("Triệu chứng đính chính *") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3,
                    maxLines = 6,
                    shape = RoundedCornerShape(12.dp),
                )

                OutlinedTextField(
                    value = diagnosis,
                    onValueChange = viewModel::updateDiagnosis,
                    label = { Text("Chẩn đoán đính chính *") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3,
                    maxLines = 6,
                    shape = RoundedCornerShape(12.dp),
                )

                OutlinedTextField(
                    value = treatmentPlan,
                    onValueChange = viewModel::updateTreatmentPlan,
                    label = { Text("Phác đồ điều trị mới (Tùy chọn)") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3,
                    maxLines = 6,
                    shape = RoundedCornerShape(12.dp),
                )

                Spacer(modifier = Modifier.height(8.dp))

                Button(
                    onClick = { viewModel.submitAmendment(recordId) },
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
                        Icon(imageVector = Icons.Default.EditNote, contentDescription = null)
                        Spacer(modifier = Modifier.size(8.dp))
                        Text("Xác Nhận Tạo Version Đính Chính")
                    }
                }
            }
        }
    }
}
