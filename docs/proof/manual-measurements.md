# Số đo tay (không do `npm run verify` sinh ra)

Những số đo cần trình duyệt thật, máy tự động không đo được. Ghi đúng điều kiện đo, không làm tròn đẹp.

## FPS bản web (Ticket-02: ≥ 30 FPS trung bình ở 1280×720)

| Ngày | Commit | Ai đo | Máy / trình duyệt | Màn | Cách đo | Kết quả |
|---|---|---|---|---|---|---|
| 2026-11-20 | `af29fd4`* | người chơi (chủ repo) | Apple M1, Chrome, GPU ANGLE Metal | Đêm 3 (Đảo Chuông, nặng nhất: 7 đèn, tầng, tháp) | mở `http://localhost:4173/?fps=1`, chơi khoảng 10 s, đọc bộ đếm (trung bình 2 s) ở góc trên trái | **ổn định 60 FPS** |

\* Commit của bản vá hiển thị bộ đếm FPS (`Web: FPS counter visible above overlays`).

Ghi chú trung thực:
- Cửa sổ Chrome lúc đo không được khóa đúng 1280×720 và kích thước không được ghi lại; đó là cửa sổ thường trên laptop. Nếu giảng viên cần đúng 1280×720 thì phải đo lại với cửa sổ cố định ở kích thước đó.
- Số đo trong khung trình duyệt của Claude (1–2 FPS) **không hợp lệ**, vì khung đó bị ẩn và trình duyệt hãm khung hình (xem `docs/notes/ai-log.md`, Phiên 04 mục 6).
- Thời gian JS mỗi khung (đo bằng cách bọc `requestAnimationFrame`): trung vị khoảng 1 ms. Phần mô phỏng và HUD không phải nút thắt.

## Hiệu năng headless (Ticket-02: một Đêm đầy đủ ≤ 21.600 tick trong ≤ 30 s)

Do `npm run verify` đo tự động, xem dòng "Performance" trong `docs/proof/phase-2.md`.
