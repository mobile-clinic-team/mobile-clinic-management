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
import com.mobileclinic.core.security.TokenManager
import com.mobileclinic.feature.aibilling.presentation.chat.AiChatScreen
import com.mobileclinic.feature.aibilling.presentation.invoice.InvoiceDetailScreen
import com.mobileclinic.feature.aibilling.presentation.invoice.InvoiceListScreen
import com.mobileclinic.feature.appointment.presentation.booking.AppointmentBookingScreen
import com.mobileclinic.feature.appointment.presentation.detail.AppointmentDetailScreen
import com.mobileclinic.feature.appointment.presentation.list.AppointmentListScreen
import com.mobileclinic.feature.clinical.presentation.detail.PatientMedicalRecordDetailScreen
import com.mobileclinic.feature.doctorops.presentation.doctorlist.DoctorListScreen
import com.mobileclinic.feature.doctorops.presentation.rating.RatingSubmissionScreen
import com.mobileclinic.feature.patient.presentation.login.LoginScreen
import com.mobileclinic.feature.patient.presentation.register.RegisterScreen
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

/**
 * Single-Activity host for all Compose destinations across 4 modules.
 *
 * Route contracts:
 *   "login"                                              -> LoginScreen (auth gate)
 *   "register"                                           -> RegisterScreen (auth gate)
 *   "chat"                                               -> AiChatScreen (M1)
 *   "invoices"                                           -> InvoiceListScreen (M1)
 *   "invoice/{invoiceId}"                                -> InvoiceDetailScreen (M1)
 *   "doctors"                                            -> DoctorListScreen (M4)
 *   "appointment/booking?doctorId={doctorId}"            -> AppointmentBookingScreen (M2)
 *   "appointments"                                       -> AppointmentListScreen (M2)
 *   "appointment/{appointmentId}"                        -> AppointmentDetailScreen (M2)
 *   "clinical/record/{appointmentId}"                    -> PatientMedicalRecordDetailScreen (M3)
 *   "doctorops/rating/{appointmentId}?doctorId={doctorId}" -> RatingSubmissionScreen (M4)
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var tokenManager: TokenManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MobileClinicTheme {
                Surface(color = MaterialTheme.colorScheme.background) {
                    val navController = rememberNavController()
                    // Start at login if no access token, otherwise go directly to chat
                    val start = if (tokenManager.getAccessToken() != null) "chat" else "login"

                    NavHost(
                        navController = navController,
                        startDestination = start,
                    ) {
                        // ── Auth ──────────────────────────────────────────────
                        composable("login") {
                            LoginScreen(
                                onLoginSuccess = {
                                    navController.navigate("chat") {
                                        popUpTo("login") { inclusive = true }
                                    }
                                },
                                onNavigateToRegister = {
                                    navController.navigate("register")
                                },
                            )
                        }

                        composable("register") {
                            RegisterScreen(
                                onRegisterSuccess = {
                                    navController.navigate("chat") {
                                        popUpTo("login") { inclusive = true }
                                    }
                                },
                                onNavigateToLogin = { navController.popBackStack() },
                            )
                        }

                        // ── M1: AI Chat Assistant ─────────────────────────────
                        composable("chat") {
                            AiChatScreen(
                                onBookDoctor = { doctorId ->
                                    navController.navigate("appointment/booking?doctorId=$doctorId")
                                },
                                onNavigateBack = { navController.popBackStack() },
                            )
                        }


                        // ── M1: Invoices ──────────────────────────────────────
                        composable("invoices") {
                            InvoiceListScreen(
                                onNavigateToDetail = { id ->
                                    navController.navigate("invoice/$id")
                                },
                            )
                        }

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

                        // ── M4: Doctor Operations ─────────────────────────────
                        composable("doctors") {
                            DoctorListScreen(
                                onBookAppointment = { doctorId ->
                                    navController.navigate("appointment/booking?doctorId=$doctorId")
                                },
                                onRateDoctor = { doctorId ->
                                    navController.navigate("doctorops/rating/0?doctorId=$doctorId")
                                },
                            )
                        }

                        // ── M2: Appointment Booking ───────────────────────────
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
                            AppointmentBookingScreen(
                                doctorId = doctorId,
                                onBookingSuccess = { _ ->
                                    navController.navigate("appointments") {
                                        popUpTo("appointment/booking?doctorId={doctorId}") { inclusive = true }
                                    }
                                },
                                onNavigateBack = { navController.popBackStack() },
                            )
                        }

                        // ── M2: Appointment History List ──────────────────────
                        composable("appointments") {
                            AppointmentListScreen(
                                onNavigateToDetail = { appointmentId ->
                                    navController.navigate("appointment/$appointmentId")
                                },
                                onBookNewClick = {
                                    navController.navigate("doctors")
                                },
                            )
                        }

                        // ── M2: Appointment Detail ────────────────────────────
                        composable(
                            route = "appointment/{appointmentId}",
                            arguments = listOf(navArgument("appointmentId") { type = NavType.LongType }),
                        ) { backStack ->
                            val appointmentId = backStack.arguments?.getLong("appointmentId") ?: return@composable
                            AppointmentDetailScreen(
                                appointmentId = appointmentId,
                                onViewMedicalRecord = { apptId ->
                                    navController.navigate("clinical/record/$apptId")
                                },
                                onRateDoctor = { apptId, docId ->
                                    navController.navigate("doctorops/rating/$apptId?doctorId=$docId")
                                },
                                onNavigateBack = { navController.popBackStack() },
                            )
                        }

                        // ── M3: Clinical EMR Detail ───────────────────────────
                        composable(
                            route = "clinical/record/{appointmentId}",
                            arguments = listOf(navArgument("appointmentId") { type = NavType.LongType }),
                        ) { backStack ->
                            val recordId = backStack.arguments?.getLong("appointmentId") ?: return@composable
                            PatientMedicalRecordDetailScreen(
                                recordId = recordId,
                                onNavigateBack = { navController.popBackStack() },
                            )
                        }

                        // ── M4: Doctor Rating Submission ──────────────────────
                        composable(
                            route = "doctorops/rating/{appointmentId}?doctorId={doctorId}",
                            arguments = listOf(
                                navArgument("appointmentId") { type = NavType.LongType; defaultValue = 0L },
                                navArgument("doctorId") { type = NavType.LongType; defaultValue = 0L },
                            ),
                        ) { _ ->
                            RatingSubmissionScreen(
                                onSubmitSuccess = { navController.popBackStack() },
                                onNavigateBack = { navController.popBackStack() },
                            )
                        }
                    }
                }
            }
        }
    }
}
