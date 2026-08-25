package com.mobileclinic.core.designsystem

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val LightColorScheme = lightColorScheme(
    primary = Color(0xFF0066CC),
    secondary = Color(0xFF00A86B),
    background = Color(0xFFF8F9FA)
)

@Composable
fun MobileClinicTheme(
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = LightColorScheme,
        content = content
    )
}
