package com.mobileclinic.feature.aibilling.data.remote

import com.mobileclinic.core.network.ApiEnvelope
import com.mobileclinic.feature.aibilling.data.model.AiChatRequest
import com.mobileclinic.feature.aibilling.data.model.AiChatResponse
import com.mobileclinic.feature.aibilling.data.model.InvoiceDto
import com.mobileclinic.feature.aibilling.data.model.PayInvoiceResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Maps 1:1 to backend/src/modules/ai-billing/ai-billing.routes.ts
 */
interface AiBillingApi {

    /** POST /api/ai/chat — AI Gateway via Dify */
    @POST("api/ai/chat")
    suspend fun sendChatMessage(
        @Body body: AiChatRequest,
    ): Response<ApiEnvelope<AiChatResponse>>

    /** GET /api/invoices — list patient invoices */
    @GET("api/invoices")
    suspend fun getInvoices(
        @Query("status") status: String? = null,
        @Query("page") page: Int = 1,
        @Query("pageSize") pageSize: Int = 20,
    ): Response<ApiEnvelope<List<InvoiceDto>>>

    /** GET /api/invoices/:id — single invoice detail */
    @GET("api/invoices/{id}")
    suspend fun getInvoiceById(
        @Path("id") id: Long,
    ): Response<ApiEnvelope<InvoiceDto>>

    /** POST /api/invoices/:id/pay — initiate payment, returns QR payload */
    @POST("api/invoices/{id}/pay")
    suspend fun payInvoice(
        @Path("id") id: Long,
    ): Response<ApiEnvelope<PayInvoiceResponse>>
}
