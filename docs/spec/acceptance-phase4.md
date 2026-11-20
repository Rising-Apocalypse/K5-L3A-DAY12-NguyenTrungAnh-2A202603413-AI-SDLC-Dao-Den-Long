# Tiêu chí nghiệm thu — Phase 4, phần web (Ticket-04 mục 3 và 4)

Test nằm ở `tests/unit/web-*.test.ts` (chạy `npm test`). Mục chỉ có trên trình duyệt ghi "kiểm tra tay".
Cách kiểm tra tay: `npm run build && npm run play`, mở địa chỉ in ra.

## Mục 3 — Bảng xếp hạng cục bộ

| # | Yêu cầu | Kiểm tra bởi |
|---|---|---|
| 3.1 | Sau màn Bình Minh (thắng Đêm 3) hoặc sau khi thua ở bất kỳ Đêm nào, cho nhập tên để lưu điểm | kiểm tra tay: thua một Đêm (hoặc thắng Đêm 3), bấm "Lưu điểm"; logic ván kết thúc → mục: `web-leaderboard.test.ts` > run end -> entry |
| 3.2 | Tên 3–12 ký tự `[A-Za-z0-9_]`, tiếng Việt có dấu là điểm cộng; báo lỗi ngay khi gõ | quy tắc: `tests/unit/leaderboard.test.ts` (`validateName`); kiểm tra tay: gõ "ab" thấy chữ đỏ "Tên cần 3–12 ký tự", gõ "Mây_01" thì nút Lưu bật |
| 3.3 | Mục lưu `name`, `score` (tổng điểm Đêm thắng), `nights_won` (0–3), `achieved_at` (ISO 8601 có múi giờ), `seed` | `web-leaderboard.test.ts` > fields…, a lost first night…, a replayed night counts once |
| 3.4 | Mỗi lần kết thúc ván chỉ lưu một lần (không lưu đúp) | `web-leaderboard.test.ts` > SubmitGuard; kiểm tra tay: bấm Lưu hai lần nhanh, bảng chỉ có một mục |
| 3.5 | Top 10, điểm giảm dần, hoà thì ai đạt trước đứng trên | `web-leaderboard.test.ts` > keeps only 10, ties: earlier first; `leaderboard.test.ts` |
| 3.6 | Lưu trên đĩa cục bộ, còn sau khi tắt và mở lại | launcher ghi `data/leaderboard.json` (Plan 06); web có fallback `localStorage`: `web-leaderboard.test.ts` > localStorage fallback, launcher API; kiểm tra tay: lưu một mục, tắt launcher, bật lại, mở Bảng xếp hạng |
| 3.7 | Màn hình Bảng xếp hạng từ menu chính (hạng, tên, điểm, Đêm thắng, thời gian; trạng thái rỗng; mục mới tô sáng) | `web-leaderboard.test.ts` > formatWhen; kiểm tra tay: menu → "Bảng xếp hạng"; bảng rỗng hiện "Chưa có ai — hãy là người đầu tiên!" |
| 3.8 | Lệnh xuất `--export-leaderboard` | Plan 06 (`tests/unit/leaderboard.test.ts`, launcher) |

## Mục 4 — Dễ tiếp cận

| # | Yêu cầu | Kiểm tra bởi |
|---|---|---|
| 4.1 | Đổi phím cho di chuyển (4 hướng), nhảy, lướt, tương tác, toả sáng, tạm dừng; được lưu | `web-keymap.test.ts` > defaults, rebind, a remapped key is the one that counts; `web-settings-ext.test.ts` > saves base and extra fields; kiểm tra tay: đổi Nhảy sang phím khác, tải lại trang (F5), phím mới vẫn dùng được trong game |
| 4.2 | Phát hiện trùng phím và báo người dùng | `web-keymap.test.ts` > a duplicate is allowed but reported…, three actions…; kiểm tra tay: gán Lướt = Space thấy cả hai dòng đỏ "Trùng phím với …" và banner |
| 4.3 | Phím dành riêng không gán được, có thông báo | `web-keymap.test.ts` > reserved codes…; kiểm tra tay: bấm "Đổi" rồi nhấn R, thấy thông báo |
| 4.4 | Nút "Khôi phục mặc định" | kiểm tra tay: đổi vài phím, bấm nút, mọi phím về mặc định; mặc định: `web-keymap.test.ts` > defaults |
| 4.5 | Phụ đề / chỉ báo: Bóng Mực xuất hiện (kèm mũi tên mép màn hình), gió sắp thổi, 10 s cuối, đèn fuel < 30 | `web-captions.test.ts` (từng loại, một lần, hàng đợi 3 dòng × 3 s); kiểm tra tay: Chọn Đêm 3, chờ Bóng Mực (mũi tên đỏ khi ngoài màn hình), gió ở giây 28, 10 giây cuối, đèn sắp cạn |
| 4.6 | Giảm chuyển động: tắt rung camera và chớp màn hình | web không có rung camera (ghi trong assumptions); chớp đỏ, nhấp nháy đồng hồ/đèn, lá bay chậm: kiểm tra tay — bật "Giảm chuyển động", bị Bóng Mực chạm không thấy chớp đỏ; đồng hồ ≤ 30 s đứng yên màu đỏ |
| 4.7 | Cỡ chữ UI tối thiểu 18 px ở 1280×720 | `web-fontsize.test.ts` (đọc CSS, báo lỗi khi có `font-size`/`font` dưới 18px); kiểm tra tay: mở 1280×720 và xem HUD không chồng chéo |
| 4.8 | Tuỳ chọn chữ lớn ×1.25 | `web-fontsize.test.ts` > every px font size goes through --ui-scale; `web-settings-ext.test.ts` > ui scale; kiểm tra tay: bật "Chữ lớn (×1.25)" thấy chữ to lên ngay |
| 4.9 | Chế độ bench `?bench=1` không bị ảnh hưởng | `npm run bench`; không có xử lý input hay phụ đề mới trong `bench.ts` |
