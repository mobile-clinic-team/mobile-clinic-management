# TÀI LIỆU Y KHOA: TRA CỨU TRIỆU CHỨNG & ĐIỀU HƯỚNG CHUYÊN KHOA
# (Mobile Clinic Medical Knowledge Base for Dify RAG)

---

## 1. BẢNG TRA CỨU TRIỆU CHỨNG SƠ BỘ VÀ CHUYÊN KHOA PHÙ HỢP

| Mã Khoa | Tên Chuyên Khoa | Triệu chứng & Dấu hiệu thường gặp | Gợi ý thăm khám / Xét nghiệm ban đầu |
| :--- | :--- | :--- | :--- |
| `NOI_TONG_QUAT` | **Khoa Nội Tổng Quát** | - Sốt nhẹ đến vừa kéo dài, mệt mỏi, sụt cân không rõ nguyên nhân<br>- Đau đầu âm ỉ, chóng mặt, hoa mắt khi thay đổi tư thế<br>- Rối loạn tiêu hóa nhẹ, đầy hơi, khó tiêu<br>- Kiểm tra sức khỏe định kỳ tổng quát | - Đo huyết áp, đường huyết<br>- Xét nghiệm công thức máu tổng quát<br>- Khám lâm sàng toàn diện |
| `TIM_MACH` | **Khoa Tim Mạch** | - Cảm giác đau thắt ngực, nặng ngực khi gắng sức<br>- Hồi hộp, đánh trống ngực, tim đập không đều hoặc quá nhanh/quá chậm<br>- Khó thở khi nằm đầu bằng hoặc khi leo cầu thang<br>- Phù hai chi dưới, đặc biệt vào buổi chiều | - Đo điện tim (ECG)<br>- Siêu âm tim Doppler màu<br>- Đo Holter huyết áp / nhịp tim 24h |
| `HO_HAP` | **Khoa Hô Hấp** | - Ho khan hoặc ho có đờm kéo dài trên 2 tuần<br>- Khò khè, khó thở về đêm hoặc khi tiếp xúc khói bụi/lạnh<br>- Đau rát họng, khàn tiếng kèm sốt nhẹ | - Chụp X-quang tim phổi thẳng<br>- Đo chức năng thông khí phổi (Hô hấp ký) |
| `DA_LIEU` | **Khoa Da Liễu** | - Da nổi mẩn đỏ, ngứa ngáy, phát ban dị ứng<br>- Mụn trứng cá viêm, mụn mủ, mụn bọc kéo dài<br>- Xuất hiện đốm sắc tố bất thường, nấm da, viêm da tiếp xúc | - Soi da vi thể, xét nghiệm nấm cạo da<br>- Đánh giá tổn thương da liễu trực tiếp |
| `CO_XUONG_KHOP`| **Khoa Cơ Xương Khớp** | - Đau nhức khớp gối, khớp háng, khớp cổ tay/ngón tay<br>- Cứng khớp buổi sáng kéo dài trên 30 phút<br>- Đau mỏi vai gáy, đau cột sống thắt lưng lan xuống chân | - Chụp X-quang khớp / cột sống<br>- Xét nghiệm Acid Uric, Yếu tố dạng thấp (RF) |
| `TAI_MUI_HONG` | **Khoa Tai Mũi Họng** | - Đau tai, chảy dịch tai, ù tai, nghe kém đột ngột<br>- Nghẹt mũi, chảy nước mũi xanh/vàng, đau nhức vùng xoang trán/hàm<br>- Nuốt đau, vướng họng, sưng amidan | - Nội soi Tai Mũi Họng ống mềm |
| `NHI_KHOA` | **Khoa Nhi** | - Trẻ sốt, quấy khóc, biếng ăn, nôn trớ<br>- Phát ban dạng sởi/thủy đậu/tay chân miệng<br>- Tiêu chảy cấp, phân có nhầy máu hoặc phân lỏng nhiều lần | - Khám lâm sàng nhi khoa chuyên biệt |
| `SAN_PHU_KHOA` | **Khoa Sản Phụ Khoa** | - Rối loạn chu kỳ kinh nguyệt, đau bụng kinh dữ dội<br>- Khí hư bất thường có mùi hôi hoặc ngứa rát vùng kín<br>- Khám thai định kỳ, theo dõi sức khỏe thai kỳ | - Siêu âm phụ khoa / siêu âm thai<br>- Soi tươi dịch âm đạo, Pap smear |

---

## 2. DANH SÁCH DẤU HIỆU NGUY CẤP (RED FLAG SYMPTOMS) — CẦN CẤP CỨU NGAY

Khi phát hiện bệnh nhân có bất kỳ dấu hiệu nào dưới đây, hệ thống AI **BẮT BUỘC** phải cảnh báo khẩn cấp và yêu cầu bệnh nhân đến ngay phòng cấp cứu hoặc gọi số điện thoại cấp cứu `115`:

1. **Đột quỵ não (F.A.S.T)**:
   - **F**ace: Méo miệng, lệch một bên mặt khi cười.
   - **A**rms: Yếu hoặc liệt một bên tay/chân, không nâng tay lên được.
   - **S**peech: Nói ngọng, phát âm khó hiểu hoặc không nói được.
   - **T**ime: Cần gọi cấp cứu 115 ngay lập tức (Thời gian vàng trong 3 - 4.5 giờ).
2. **Nhồi máu cơ tim cấp**: Đau thắt ngực dữ dội như bị bóp nghẹt, lan lên cổ, hàm hoặc cánh tay trái, kéo dài trên 15 phút kèm vã mồ hôi lạnh, khó thở.
3. **Khó thở cấp tính**: Thở rít, tím tái môi đầu chi, co kéo cơ hô hấp phụ.
4. **Co giật, mất ý thức hoặc hôn mê đột ngột**.
5. **Nôn ra máu tươi, đi ngoài phân đen như bã cà phê kèm tụt huyết áp**.
6. **Sốt cao co giật ở trẻ em** hoặc sốt kèm cứng gáy, xuất huyết dưới da dạng sao.

---

## 3. NGUYÊN TẮC HỖ TRỢ VÀ GIỚI HẠN Y KHOA CỦA TRỢ LÝ AI

1. **Không chẩn đoán khẳng định**: Trợ lý AI chỉ đóng vai trò phân loại triệu chứng ban đầu (triage) và gợi ý chuyên khoa.
2. **Không kê đơn thuốc**: Không bao giờ đưa ra tên thuốc cụ thể kèm liều lượng, đặc biệt là thuốc kháng sinh, thuốc kê đơn, hoặc thuốc tiêm truyền.
3. **Khuyến khích gặp bác sĩ chuyên khoa**: Hướng dẫn người dùng đặt lịch khám với các bác sĩ trong hệ thống Mobile Clinic để có phác đồ y khoa chính xác.
