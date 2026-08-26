package com.mobileclinic.feature.aibilling.presentation.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mobileclinic.core.network.ApiResult
import com.mobileclinic.core.ui.UiState
import com.mobileclinic.feature.aibilling.data.model.ChatMessage
import com.mobileclinic.feature.aibilling.data.model.RecommendedDoctorDto
import com.mobileclinic.feature.aibilling.data.repository.AiBillingRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import java.util.UUID
import javax.inject.Inject

@HiltViewModel
class AiChatViewModel @Inject constructor(
    private val repository: AiBillingRepository,
) : ViewModel() {

    private val json = Json { ignoreUnknownKeys = true }

    /** Full conversation history rendered in LazyColumn */
    private val _messages = MutableStateFlow<List<ChatMessage>>(emptyList())
    val messages: StateFlow<List<ChatMessage>> = _messages.asStateFlow()

    /** Sending state — controls ProgressIndicator + disables Send button */
    private val _sendState = MutableStateFlow<UiState<Unit>>(UiState.Idle)
    val sendState: StateFlow<UiState<Unit>> = _sendState.asStateFlow()

    /** Current session ID — persists for the entire conversation */
    private var sessionId: String? = null

    // ── Public actions ────────────────────────────────────────────────────────

    fun sendMessage(text: String) {
        val trimmed = text.trim()
        if (trimmed.isBlank() || _sendState.value is UiState.Loading) return

        // 1. Append user bubble immediately
        appendMessage(ChatMessage(id = newId(), content = trimmed, isUser = true))
        _sendState.value = UiState.Loading

        viewModelScope.launch {
            when (val result = repository.sendChatMessage(message = trimmed, sessionId = sessionId)) {
                is ApiResult.Success -> {
                    val resp = result.data
                    sessionId = resp.sessionId

                    // 2. Parse potential Doctor Cards from reply
                    val (cleanReply, doctorCards) = parseDoctorCards(resp.reply)

                    appendMessage(
                        ChatMessage(
                            id = newId(),
                            content = cleanReply,
                            isUser = false,
                            doctorCards = doctorCards,
                            disclaimer = resp.disclaimer,
                        )
                    )
                    _sendState.value = UiState.Idle
                }
                is ApiResult.Failure -> {
                    appendMessage(
                        ChatMessage(
                            id = newId(),
                            content = "Xin lỗi, tôi đang gặp sự cố kết nối. Vui lòng thử lại sau.",
                            isUser = false,
                            disclaimer = "⚠️ Lưu ý y tế: Đây chỉ là thông tin hỗ trợ tham khảo, không thay thế chẩn đoán y khoa.",
                        )
                    )
                    _sendState.value = UiState.Error(result.message)
                }
            }
        }
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private fun appendMessage(msg: ChatMessage) {
        _messages.update { it + msg }
    }

    private fun newId(): String = UUID.randomUUID().toString()

    /**
     * Splits the AI reply into (displayText, doctorCards).
     *
     * Convention: Backend wraps recommended doctor JSON inside:
     *   [DOCTOR_CARDS]<JSON array>[/DOCTOR_CARDS]
     *
     * Example reply:
     *   "Triệu chứng của bạn...\n[DOCTOR_CARDS][{"doctorId":1,...}][/DOCTOR_CARDS]"
     */
    private fun parseDoctorCards(
        reply: String,
    ): Pair<String, List<RecommendedDoctorDto>> {
        val startTag = "[DOCTOR_CARDS]"
        val endTag = "[/DOCTOR_CARDS]"
        val startIdx = reply.indexOf(startTag)
        val endIdx = reply.indexOf(endTag)

        if (startIdx == -1 || endIdx == -1 || endIdx <= startIdx) {
            return Pair(reply, emptyList())
        }

        val cleanText = (reply.substring(0, startIdx) + reply.substring(endIdx + endTag.length)).trim()
        val jsonBlock = reply.substring(startIdx + startTag.length, endIdx).trim()

        val doctors = try {
            json.decodeFromString<List<RecommendedDoctorDto>>(jsonBlock)
        } catch (e: Exception) {
            emptyList()
        }

        return Pair(cleanText, doctors)
    }
}
