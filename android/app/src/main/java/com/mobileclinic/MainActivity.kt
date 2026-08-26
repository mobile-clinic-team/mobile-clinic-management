package com.mobileclinic

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.mobileclinic.core.designsystem.MobileClinicTheme
import com.mobileclinic.feature.aibilling.presentation.chat.AiChatScreen
import com.mobileclinic.feature.aibilling.presentation.invoice.InvoiceDetailScreen
import com.mobileclinic.feature.aibilling.presentation.invoice.InvoiceListScreen
import com.mobileclinic.feature.doctorops.presentation.doctorlist.DoctorListScreen
import dagger.hilt.android.AndroidEntryPoint

/**
 * Single-Activity host for all Compose destinations.
 *
 * Route map:
 *   "chat"                          → AiChatScreen (M1)
 *   "invoices"                      → InvoiceListScreen (M1)
 *   "invoice/{invoiceId}"           → InvoiceDetailScreen (M1)
 *   "doctors"                       → DoctorListScreen (M4)
 *   "appointment/booking"           → M2 BookingScreen (stub — wired when M2 merges)
 *     ?doctorId={Long}
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MobileClinicTheme {
                Surface(color = MaterialTheme.colorScheme.background) {
                    val navController = rememberNavController()

                    NavHost(
                        navController = navController,
                        startDestination = "chat",
                    ) {
                        // ── M1: AI Chat ───────────────────────────────────────
                        composable("chat") {
                            AiChatScreen(
                                onBookDoctor = { doctorId ->
                                    navController.navigate("appointment/booking?doctorId=$doctorId")
                                },
                                onNavigateBack = { navController.popBackStack() },
                            )
                        }

                        // ── M1: Invoice List ──────────────────────────────────
                        composable("invoices") {
                            InvoiceListScreen(
                                onNavigateToDetail = { id ->
                                    navController.navigate("invoice/$id")
                                },
                            )
                        }

                        // ── M1: Invoice Detail ────────────────────────────────
                        composable(
                            route = "invoice/{invoiceId}",
                            arguments = listOf(navArgument("invoiceId") { type = NavType.LongType }),
                        ) { backStack ->
                            val invoiceId = backStack.arguments?.getLong("invoiceId") ?: return@composable
                            InvoiceDetailScreen(
                                invoiceId = invoiceId,
                                onNavigateBack = { navController.popBackStack() },
                            )
                        }

                        // ── M4: Doctor List ───────────────────────────────────
                        composable("doctors") {
                            DoctorListScreen(
                                onBookAppointment = { doctorId ->
                                    navController.navigate("appointment/booking?doctorId=$doctorId")
                                },
                                onRateDoctor = { /* navigate to rating screen */ },
                            )
                        }

                        // ── M2: Appointment Booking (URI deep-link stub) ───────
                        // Activated when M2 feature/mod2-appointment merges into main.
                        // The URI "appointment/booking?doctorId={doctorId}" is the
                        // contract between M1 AI chat and M2 booking flow.
                        composable(
                            route = "appointment/booking?doctorId={doctorId}",
                            arguments = listOf(
                                navArgument("doctorId") {
                                    type = NavType.LongType
                                    defaultValue = -1L
                                },
                            ),
                        ) { backStack ->
                            val doctorId = backStack.arguments?.getLong("doctorId") ?: -1L
                            // TODO(M2): Replace with real BookingScreen(doctorId)
                            androidx.compose.material3.Text("Booking stub — doctorId=$doctorId")
                        }
                    }
                }
            }
        }
    }
}
