package com.mobileclinic.feature.patient.presentation.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mobileclinic.core.ui.UiState

@Composable
fun ProfileScreen(
    viewModel: ProfileViewModel = hiltViewModel(),
) {
    val loadState by viewModel.loadState.collectAsStateWithLifecycle()
    val saveState by viewModel.saveState.collectAsStateWithLifecycle()
    val form by viewModel.form.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(saveState) {
        when (val state = saveState) {
            is SaveState.Saved -> {
                snackbarHostState.showSnackbar("Cập nhật hồ sơ thành công")
                viewModel.resetSaveState()
            }
            is SaveState.Failed -> {
                snackbarHostState.showSnackbar(state.message)
            }
            else -> Unit
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            when (val state = loadState) {
                is UiState.Loading -> LoadingContent()
                is UiState.Empty -> EmptyProfileContent(onCreateProfile = viewModel::loadProfile)
                is UiState.Error -> ErrorContent(
                    message = state.message,
                    onRetry = viewModel::loadProfile,
                )
                is UiState.Success, is UiState.Idle -> ProfileFormContent(
                    form = form,
                    isSaving = saveState is SaveState.Saving,
                    onFullNameChange = viewModel::onFullNameChange,
                    onPhoneNumberChange = viewModel::onPhoneNumberChange,
                    onDobChange = viewModel::onDobChange,
                    onAddressChange = viewModel::onAddressChange,
                    onSave = viewModel::saveProfile,
                )
            }
        }
    }
}

@Composable
private fun LoadingContent() {
    Box(modifier = Modifier.fillMaxSize()) {
        CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
    }
}

@Composable
private fun ErrorContent(message: String, onRetry: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "Không thể tải hồ sơ",
            style = MaterialTheme.typography.titleMedium,
        )
        Spacer(Modifier.size(8.dp))
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
        )
        Spacer(Modifier.size(16.dp))
        Button(onClick = onRetry) {
            Text("Thử lại")
        }
    }
}

@Composable
private fun EmptyProfileContent(onCreateProfile: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "Bạn chưa có hồ sơ bệnh nhân",
            style = MaterialTheme.typography.titleMedium,
        )
        Spacer(Modifier.size(16.dp))
        Button(onClick = onCreateProfile) {
            Text("Tải lại")
        }
    }
}

@Composable
private fun ProfileFormContent(
    form: ProfileFormState,
    isSaving: Boolean,
    onFullNameChange: (String) -> Unit,
    onPhoneNumberChange: (String) -> Unit,
    onDobChange: (String) -> Unit,
    onAddressChange: (String) -> Unit,
    onSave: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp)
            .verticalScroll(rememberScrollState()),
    ) {
        Text(
            text = "Hồ sơ cá nhân",
            style = MaterialTheme.typography.headlineMedium,
        )
        Spacer(Modifier.size(24.dp))

        OutlinedTextField(
            value = form.fullName,
            onValueChange = onFullNameChange,
            label = { Text("Họ và tên") },
            singleLine = true,
            isError = form.fullName.isBlank(),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.size(12.dp))

        OutlinedTextField(
            value = form.phoneNumber,
            onValueChange = onPhoneNumberChange,
            label = { Text("Số điện thoại") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.size(12.dp))

        OutlinedTextField(
            value = form.dob,
            onValueChange = onDobChange,
            label = { Text("Ngày sinh (YYYY-MM-DD)") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.size(12.dp))

        OutlinedTextField(
            value = form.address,
            onValueChange = onAddressChange,
            label = { Text("Địa chỉ") },
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.size(24.dp))

        if (isSaving) {
            CircularProgressIndicator(modifier = Modifier.fillMaxWidth())
        } else {
            Button(
                onClick = onSave,
                enabled = form.isValid,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Lưu thay đổi")
            }
        }
    }
}
