package com.mobileclinic.feature.clinical.data.model

import kotlinx.serialization.Serializable

@Serializable
data class CreateMedicalRecordRequest(
    val appointmentId: Int,
    val initialDiagnosis: String,
    val initialSymptoms: String,
    val initialTreatment: String? = null,
)

@Serializable
data class AmendMedicalRecordRequest(
    val diagnosis: String,
    val symptoms: String,
    val treatmentPlan: String? = null,
    val amendmentReason: String,
)

@Serializable
data class MedicalRecordVersionDto(
    val versionNumber: Int,
    val diagnosis: String,
    val symptoms: String,
    val treatmentPlan: String? = null,
    val amendmentReason: String,
    val amendedBy: Int,
    val amendedAt: String,
)

@Serializable
data class PrescriptionDto(
    val id: Int,
    val medicineName: String,
    val dosage: String,
    val frequency: String,
    val durationDays: Int,
    val instructions: String? = null,
    val isSuperseded: Boolean = false,
    val prescribedBy: Int,
    val createdAt: String,
)

@Serializable
data class LabResultDto(
    val id: Int,
    val testName: String,
    val fileMimeType: String? = null,
    val fileSizeBytes: Long? = null,
    val resultNotes: String? = null,
    val status: String,
    val isSuperseded: Boolean = false,
    val orderedBy: Int,
    val reviewedBy: Int? = null,
    val reviewedAt: String? = null,
    val createdAt: String,
)

@Serializable
data class MedicalRecordDetailDto(
    val id: Int,
    val patientId: Int,
    val doctorId: Int,
    val appointmentId: Int,
    val currentVersion: Int,
    val status: String,
    val diagnosis: String,
    val symptoms: String,
    val treatmentPlan: String? = null,
    val versions: List<MedicalRecordVersionDto> = emptyList(),
    val prescriptions: List<PrescriptionDto> = emptyList(),
    val labResults: List<LabResultDto> = emptyList(),
    val createdAt: String,
)

@Serializable
data class UploadUrlRequest(
    val recordId: Int,
    val testName: String,
    val fileMimeType: String,
    val fileSizeBytes: Long? = null,
)

@Serializable
data class UploadUrlResponse(
    val labResultId: Int,
    val uploadUrl: String,
    val s3ObjectKey: String,
    val expiresInSeconds: Int,
)

@Serializable
data class DownloadUrlResponse(
    val labResultId: Int,
    val downloadUrl: String,
    val expiresInSeconds: Int,
)
