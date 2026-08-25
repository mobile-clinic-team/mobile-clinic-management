package com.mobileclinic.feature.clinical.data.remote

import com.mobileclinic.core.network.ApiEnvelope
import com.mobileclinic.feature.clinical.data.model.AmendMedicalRecordRequest
import com.mobileclinic.feature.clinical.data.model.CreateMedicalRecordRequest
import com.mobileclinic.feature.clinical.data.model.DownloadUrlResponse
import com.mobileclinic.feature.clinical.data.model.MedicalRecordDetailDto
import com.mobileclinic.feature.clinical.data.model.UploadUrlRequest
import com.mobileclinic.feature.clinical.data.model.UploadUrlResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

interface ClinicalApi {

    @POST("api/clinical/records")
    suspend fun createRecord(
        @Body body: CreateMedicalRecordRequest,
    ): Response<ApiEnvelope<MedicalRecordDetailDto>>

    @POST("api/clinical/records/{id}/amend")
    suspend fun amendRecord(
        @Path("id") id: Int,
        @Body body: AmendMedicalRecordRequest,
    ): Response<ApiEnvelope<MedicalRecordDetailDto>>

    @GET("api/clinical/records/{id}")
    suspend fun getRecord(
        @Path("id") id: Int,
    ): Response<ApiEnvelope<MedicalRecordDetailDto>>

    @POST("api/clinical/lab-results/upload-url")
    suspend fun requestUploadUrl(
        @Body body: UploadUrlRequest,
    ): Response<ApiEnvelope<UploadUrlResponse>>

    @GET("api/clinical/lab-results/{id}/download-url")
    suspend fun requestDownloadUrl(
        @Path("id") id: Int,
    ): Response<ApiEnvelope<DownloadUrlResponse>>
}
