package com.mobileclinic.feature.aibilling.presentation.invoice

import android.graphics.Bitmap
import androidx.compose.foundation.Image
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
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.QrCode
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
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.mobileclinic.core.ui.UiState
import com.mobileclinic.feature.aibilling.data.model.InvoiceDto
import com.mobileclinic.feature.aibilling.data.model.PayInvoiceResponse
import java.text.NumberFormat
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InvoiceDetailScreen(
    invoiceId: Long,
    onNavigateBack: () -> Unit,
    viewModel: InvoiceViewModel = hiltViewModel(),
) {
    val detailState by viewModel.detailState.collectAsStateWithLifecycle()
    val payState by viewModel.payState.collectAsStateWithLifecycle()

    LaunchedEffect(invoiceId) { viewModel.loadInvoiceDetail(invoiceId) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Chi tiết hóa đơn",
                        style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
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
    ) { padding ->
        when (val state = detailState) {
            is UiState.Loading -> Box(
                Modifier.fillMaxSize().padding(padding),
                contentAlignment = Alignment.Center,
            ) { CircularProgressIndicator() }

            is UiState.Error -> Box(
                Modifier.fillMaxSize().padding(padding),
                contentAlignment = Alignment.Center,
            ) {
                Text(state.message, color = MaterialTheme.colorScheme.error)
            }

            is UiState.Success -> InvoiceDetailContent(
                invoice = state.data,
                payState = payState,
                onPayClick = { viewModel.payInvoice(invoiceId) },
                modifier = Modifier.padding(padding),
            )

            else -> Unit
        }
    }
}

// ── Main content ──────────────────────────────────────────────────────────────

@Composable
private fun InvoiceDetailContent(
    invoice: InvoiceDto,
    payState: UiState<PayInvoiceResponse>,
    onPayClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val currencyFmt = NumberFormat.getCurrencyInstance(Locale("vi", "VN"))
    val (statusLabel, statusColor) = when (invoice.status) {
        "PAID" -> "Đã thanh toán" to Color(0xFF2E7D32)
        "CANCELLED" -> "Đã hủy" to Color(0xFFC62828)
        "REFUNDED" -> "Đã hoàn tiền" to Color(0xFF1565C0)
        else -> "Chờ thanh toán" to Color(0xFFE65100)
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
                    imageVector = Icons.Default.CheckCircle,
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
                    if (invoice.status == "PAID" && invoice.paidAt != null) {
                        Text(
                            "Thanh toán lúc: ${invoice.paidAt}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }

        Spacer(Modifier.height(20.dp))

        // ── Invoice Info ──────────────────────────────────────────────────────
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                InvoiceInfoRow("Mã hóa đơn", "#${invoice.id}")
                Divider(modifier = Modifier.padding(vertical = 8.dp))
                InvoiceInfoRow("Mã lịch hẹn", "#${invoice.appointmentId}")
                Divider(modifier = Modifier.padding(vertical = 8.dp))
                invoice.description?.takeIf { it.isNotBlank() }?.let {
                    InvoiceInfoRow("Mô tả", it)
                    Divider(modifier = Modifier.padding(vertical = 8.dp))
                }
                InvoiceInfoRow(
                    "Số tiền",
                    currencyFmt.format(invoice.amount),
                    valueStyle = MaterialTheme.typography.titleMedium.copy(
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary,
                    ),
                )
            }
        }

        Spacer(Modifier.height(24.dp))

        // ── Pay Section ───────────────────────────────────────────────────────
        when (invoice.status) {
            "PENDING" -> {
                when (val pay = payState) {
                    is UiState.Idle, is UiState.Error -> {
                        if (pay is UiState.Error) {
                            Text(
                                pay.message,
                                color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodySmall,
                            )
                            Spacer(Modifier.height(8.dp))
                        }
                        Button(
                            onClick = onPayClick,
                            modifier = Modifier.fillMaxWidth().height(52.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = MaterialTheme.colorScheme.primary,
                            ),
                        ) {
                            Icon(Icons.Default.QrCode, contentDescription = null)
                            Spacer(Modifier.width(8.dp))
                            Text("Thanh toán ngay", fontWeight = FontWeight.Bold)
                        }
                    }

                    is UiState.Loading -> {
                        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator()
                        }
                    }

                    is UiState.Success -> {
                        // Show QR Code
                        QrCodeSection(qrPayload = pay.data.qrPayload)
                    }

                    else -> Unit
                }
            }

            "PAID" -> {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    color = Color(0xFF2E7D32).copy(alpha = 0.08f),
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center,
                    ) {
                        Icon(
                            Icons.Default.CheckCircle,
                            contentDescription = null,
                            tint = Color(0xFF2E7D32),
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            "Hóa đơn đã được thanh toán",
                            style = MaterialTheme.typography.bodyMedium.copy(
                                fontWeight = FontWeight.SemiBold,
                                color = Color(0xFF2E7D32),
                            ),
                        )
                    }
                }
            }
        }
    }
}

// ── QR Code ───────────────────────────────────────────────────────────────────

@Composable
private fun QrCodeSection(qrPayload: String) {
    val qrBitmap = remember(qrPayload) { generateQrBitmap(qrPayload, 512) }

    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            "Quét mã QR để thanh toán",
            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
        )
        Spacer(Modifier.height(4.dp))
        Text(
            "Sử dụng ứng dụng ngân hàng hoặc ví điện tử",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(16.dp))
        Card(
            shape = RoundedCornerShape(16.dp),
            elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
        ) {
            if (qrBitmap != null) {
                Image(
                    bitmap = qrBitmap.asImageBitmap(),
                    contentDescription = "QR Code thanh toán",
                    modifier = Modifier
                        .size(240.dp)
                        .padding(16.dp),
                )
            } else {
                Box(Modifier.size(240.dp), contentAlignment = Alignment.Center) {
                    Text("Không thể tạo mã QR", color = MaterialTheme.colorScheme.error)
                }
            }
        }
    }
}

/** Renders [content] as a QR code Bitmap using ZXing Core (no Activity needed). */
private fun generateQrBitmap(content: String, sizePx: Int): Bitmap? {
    return try {
        val hints = mapOf(EncodeHintType.MARGIN to 1)
        val bits = QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, sizePx, sizePx, hints)
        val bmp = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.RGB_565)
        for (x in 0 until sizePx) {
            for (y in 0 until sizePx) {
                bmp.setPixel(x, y, if (bits[x, y]) android.graphics.Color.BLACK else android.graphics.Color.WHITE)
            }
        }
        bmp
    } catch (e: Exception) {
        null
    }
}

// ── Helper composable ─────────────────────────────────────────────────────────

@Composable
private fun InvoiceInfoRow(
    label: String,
    value: String,
    valueStyle: androidx.compose.ui.text.TextStyle = MaterialTheme.typography.bodyMedium,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(value, style = valueStyle)
    }
}
