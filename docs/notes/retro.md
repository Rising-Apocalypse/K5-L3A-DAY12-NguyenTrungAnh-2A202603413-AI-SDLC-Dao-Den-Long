# Retro — Đảo Đèn Lồng (Day 12 AI-SDLC)

Soạn bởi Claude Opus 5.5 từ nhật ký dự án, người dùng (Nguyễn Trung Anh) duyệt. Chi tiết từng phase:
`docs/notes/evaluation.md`; nhật ký đầy đủ: `docs/notes/ai-log.md`.

## 1. Số liệu
| | Phase 1 | Phase 2 (tag) | Phase 3 | Phase 2 hoàn thiện | Phase 4 |
|---|---:|---:|---:|---:|---:|
| Test tự động (tổng) | 213 | 238 | 262 | 337 | 430 |
| Agent viết code | Sonnet xhigh → medium | Gemini (agy) | Gemini → Sonnet medium | Sonnet medium | Sonnet medium |
| Kịch bản Opus tự tính tay | 10 | 6 | 4 | 5 + 5 kiểm tra web | bench + soak chạy thật |

Hiệu năng (máy tự đo, Apple M1): bench avg 191.3 FPS / p1-low 99 / load 2.8 s (lần chạy cuối, bản phát hành); soak 10 Đêm 0 crash,
RAM 55 → 60 MB; một Đêm headless đầy đủ khoảng 0.15 s (ngưỡng 30 s); chơi thật Đêm 3 ổn định 60 FPS.

## 2. Cách làm với AI: cái gì hiệu quả, cái gì không
**Hiệu quả**
- **Tách vai:** Opus đọc đề, viết plan tiếng Anh rất cụ thể (từng file, từng hàm, luật đánh số), agent khác viết
  code, Opus review và **tự chạy lại** — không tin "agent bảo chạy rồi".
- **Kịch bản tính tay trước, chạy sau:** mỗi phase Opus tự đặt 4–10 tình huống, tính kết quả bằng tay rồi mới
  chạy headless. Cách này bắt được cả lỗi của Opus (tính nhầm khoảng cách 3D ở Phase 1).
- **Bộ chặn golden** (5 lần chạy trọn Đêm 1 so từng byte) trước khi cho agent đụng vào core ở phần hoàn thiện
  Phase 2: agent tự sửa code khi golden đỏ thay vì sửa test.
- **Plan có danh sách "test cũ được phép sửa" + bắt ghi lý do vào CHANGELOG**: ở Phase 3 agent chỉ sửa đúng
  các loại được phép, không skip test nào.
- **Viết plan kế tiếp trong lúc agent đang code plan hiện tại** (Plan 03 khi Gemini làm Plan 02, Plan 05 khi
  Sonnet làm Plan 04, Plan 07 khi Sonnet làm Plan 06).

**Không hiệu quả**
- Làm "lõi Đêm 1" của Phase 2 rồi nhảy sang Phase 3 → phải quay lại làm Đêm 2–3 sau, và phần đó chỉ vào được
  tag `phase-4`.
- Phụ thuộc một agent có quota: Gemini (agy) hết quota giữa Plan 03, phải chuyển Sonnet làm tiếp.
- Agent effort xhigh tốn token mà không nhanh hơn rõ rệt; medium đủ khi plan đã chi tiết.

## 3. Những lần AI sai, cách phát hiện, đã chỉnh harness gì
| Lần sai | Phát hiện | Chỉnh để không lặp lại |
|---|---|---|
| Opus tự đổi hướng sang Phase 2 khi người dùng chỉ dán ticket | người dùng dừng lại | bộ nhớ "hỏi trước khi đổi hướng lớn; làm phase tích lũy" |
| Opus cắt phạm vi Phase 2 cho kịp mốc giờ | người dùng phản đối | bộ nhớ "không lấy mốc giờ phase làm lý do cắt phạm vi" |
| Ví dụ số trong Plan 03 sai (quên dầu hao trước khi châm) | Sonnet báo lệch; Opus kiểm lại theo luật | plan ghi rõ "luật thắng ví dụ"; agent được dặn báo lệch thay vì ép theo ví dụ |
| Opus đo FPS trong khung trình duyệt **bị ẩn** (1–2 FPS) rồi sửa nhầm `setPixelRatio` | kiểm `tabs_context` thấy pane ẩn; JS mỗi khung chỉ 1 ms | đã hoàn tác; bài học: kiểm pane hiển thị trước khi đo; số FPS thật do người dùng đo |
| Bộ đếm FPS bị lớp UI che | người dùng không thấy số | sửa z-index; kiểm tra phần tử có bị che bằng `elementFromPoint` |
| Opus tính nhầm khoảng cách 3D (4.965 thay vì 5.014) | game cho kết quả khác, Opus tính lại | giữ thói quen ghi phép tính trong comment test |
| Gemini hết quota giữa chừng | `agy` thoát mã 3 (HTTP 429) | review phần đã làm (bước 1–5), giao phần còn lại cho Sonnet cùng file plan |

Harness giúp nhiều nhất: (1) `scripts/verify.mjs` — build, test, chạy mọi scenario 2 lần so byte, ghi proof kèm
hash commit và cờ sạch/bẩn; (2) Stop hook chặn kết thúc khi `npm test` đỏ; (3) bộ chặn golden Đêm 1;
(4) guard kiến trúc (core không dùng `Math.random`/`Date`/DOM, headless không nạp `extras`).

## 4. Token / chi phí AI (ước tính)
| Ai | Việc | Token |
|---|---|---|
| Sonnet xhigh | Plan 00, Plan 01 (dừng giữa chừng) | khoảng 199k + 150–250k |
| Sonnet medium | Plan 01 hoàn thiện, 03 (bước 6–10), 04, 05, 06, 07 | 109k + 217k + 248k + 186k + 186k + 171k |
| Gemini (agy) | Plan 02, Plan 03 bước 1–5 | không đo được (`agy -p` không in token) |
| Opus | đọc đề, plan, review, kiểm chứng, log, tài liệu | không đo chính xác; ước tính 1–1.5M (ngữ cảnh dài, đọc lại file) |
| **Tổng** | | **khoảng 2.5–3M** (chưa tính Gemini) |

Cách đã tiết kiệm: plan chi tiết để agent ít đoán; mỗi plan một agent mới (không kéo ngữ cảnh 200k); hạ effort
xuống medium; agent chỉ đọc file cần thiết; kiểm chứng bằng script/headless thay vì để agent chơi thử; bỏ phần
làm đẹp không có điểm (cây cối, đồ họa thêm).

## 5. Nếu làm lại
1. Lưu ticket vào `docs/spec/` ngay khi nhận và làm **đủ** ticket trong phase, không chỉ phần lõi.
2. Dựng bộ chặn golden và bench/soak từ Phase 1, không đợi đến khi sửa core lớn.
3. Mỗi plan có mục "ví dụ đã tự kiểm theo đúng thứ tự tick" để không sai như Plan 03.
4. Đo hiệu năng trên trình duyệt thật ngay từ Phase 1 (bộ đếm `?fps=1` hiển thị rõ).
5. Không dùng agent có quota giới hạn cho việc dài; nếu dùng thì chia plan nhỏ hơn.
