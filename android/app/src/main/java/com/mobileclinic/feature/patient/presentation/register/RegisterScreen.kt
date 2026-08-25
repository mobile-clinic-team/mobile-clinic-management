package com.mobileclinic.feature.patient.presentation.register

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mobileclinic.core.ui.UiState

@Composable
fun RegisterScreen(
    onRegisterSuccess: () -> Unit,
    onNavigateToLogin: () -> Unit,
    viewModel: RegisterViewModel = hiltViewModel(),
) {
    val form by viewModel.form.collectAsStateWithLifecycle()
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(uiState) {
        when (val state = uiState) {
            is UiState.Success -> {
                onRegisterSuccess()
                viewModel.resetState()
            }
            is UiState.Error -> snackbarHostState.showSnackbar(state.message)
            else -> Unit
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 24.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                text = "Tạo tài khoản",
                style = MaterialTheme.typography.headlineMedium,
            )

            Spacer(Modifier.size(24.dp))

            OutlinedTextField(
                value = form.fullName,
                onValueChange = viewModel::onFullNameChange,
                label = { Text("Họ và tên") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.size(12.dp))

            OutlinedTextField(
                value = form.email,
                onValueChange = viewModel::onEmailChange,
                label = { Text("Email") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.size(12.dp))

            OutlinedTextField(
                value = form.phoneNumber,
                onValueChange = viewModel::onPhoneNumberChange,
                label = { Text("Số điện thoại (không bắt buộc)") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.size(12.dp))

            OutlinedTextField(
                value = form.password,
                onValueChange = viewModel::onPasswordChange,
                label = { Text("Mật khẩu") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                supportingText = { Text("Tối thiểu 8 ký tự, gồm chữ hoa, chữ thường và số") },
                isError = form.password.isNotEmpty() && !form.isPasswordStrong,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.size(12.dp))

            OutlinedTextField(
                value = form.confirmPassword,
                onValueChange = viewModel::onConfirmPasswordChange,
                label = { Text("Xác nhận mật khẩu") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                isError = form.confirmPassword.isNotEmpty() && !form.passwordsMatch,
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(Modifier.size(24.dp))

            if (uiState is UiState.Loading) {
                CircularProgressIndicator(modifier = Modifier.fillMaxWidth())
            } else {
                Button(
                    onClick = viewModel::register,
                    enabled = form.isValid,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Đăng ký")
                }
            }

            Spacer(Modifier.size(12.dp))

            TextButton(
                onClick = onNavigateToLogin,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Đã có tài khoản? Đăng nhập")
            }
        }
    }
}
