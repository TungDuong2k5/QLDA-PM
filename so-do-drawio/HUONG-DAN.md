# Bộ sơ đồ Trạm Trà Chill (theo ứng dụng hiện tại)

- `tram-tra-chill-so-do.drawio` – 1 file draw.io, **21 trang** (mỗi trang một sơ đồ, chuyển trang ở thanh dưới cùng).
- `png/` – ảnh PNG của từng sơ đồ để chèn vào Word.

## Mở và chỉnh sửa
1. Vào https://app.diagrams.net → **Open Existing Diagram** → chọn file `.drawio` (hoặc cài draw.io Desktop, bấm đúp file).
2. Kéo thả hình, nối dây, sửa chữ thoải mái; dây nối tự bám theo khi di chuyển.
3. Xuất ảnh: **File → Export as → PNG / SVG / PDF** (nên chọn "Zoom 200%" khi chèn Word).

## Danh sách trang
| # | Trang | Nội dung |
|---|-------|----------|
| 1–5 | UC 0 … UC 4 | Use case tổng quát + 4 module (bán hàng & ca, chấm công, nhân sự, quản trị) |
| 6 | BFD | Phân rã chức năng |
| 7–10 | DFD 0, 1, 2 (bán hàng 2.0), 2 (chấm công 4.0) | Luồng dữ liệu |
| 11 | ERD | 19 bảng CSDL hiện tại |
| 12–13 | Class | Lớp thực thể (phân tích) và lớp thiết kế |
| 14–20 | Seq 1…7 | Đăng nhập, check-in & mở ca, gọi món & thanh toán, check-out, nhắc quản lý, đóng món hết hàng, đóng ca & báo cáo |
| 21 | Deployment | Kiến trúc triển khai |

## Lưu ý
- Phản ánh **app hiện tại**: không có bảng lương, không có link chia sẻ; chấm công bằng PIN; lịch làm việc chỉ là kế hoạch; đơn tạo ra là đã thanh toán (checkout một bước), chỉ admin huỷ đơn.
- Bố cục được sinh tự động; một số đường nối cắt nhau hoặc đè chữ nhẹ – kéo thả trong draw.io để chỉnh cho đẹp trước khi nộp.
- Báo cáo Word `bao-cao-btl-...-v4.docx` và `tram-tra-chill-mssql.sql` vẫn mô tả thiết kế cũ (có lương…), chưa được cập nhật theo các sơ đồ này.
