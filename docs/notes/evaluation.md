# Đánh giá từng phase

Soạn bởi Claude Opus 5.5 từ `docs/notes/ai-log.md`, `CHANGELOG.md` và `docs/proof/`, người dùng duyệt. Mỗi phase
trả lời ba câu: yêu cầu nào đạt, có làm hỏng phase trước không, điều cần chỉnh. "Đạt" chỉ khi có bằng chứng
chạy lại được (test, scenario headless, lệnh đo); chỗ chưa đạt ghi thẳng.

## Phase 1 — Contract v1.0, Đêm 1 (tag `phase-1` = `af34ddf`)
- **Đạt:** lõi `step()` dùng chung cho web và headless, CLI headless đúng Test Contract (mã thoát 0/1/2, tick
  model, làm tròn 3 chữ số), tất định theo seed (stream RNG có nhãn, guard cấm `Math.random`/`Date`), luật nhặt,
  thắp, vùng an toàn, Tỏa Sáng, Bóng Mực, rơi, thắng/thua. 213 test; 10 kịch bản Opus tự tính tay đều khớp.
- **Hỏng phase trước:** không áp dụng.
- **Cần chỉnh:** lúc đầu Opus tự đổi hướng sang Phase 2 khi người dùng chỉ dán ticket (đã dừng, ghi bộ nhớ "hỏi
  trước khi đổi hướng"). Cảnh web tối khi chưa thắp đèn.

## Phase 2 — Contract v1.1 (tag `phase-2` = `52a27db`)
- **Đạt ở tag:** số liệu chuẩn, lướt, tạm dừng, Bùa Gió, snapshot/scenario/input v1.1, sự kiện mới, thứ tự xử
  lý trong tick — cho **Đêm 1**. 238 test, các kịch bản tính tay (lướt 2.8 m, tạm dừng đóng băng `sim_tick`,
  bùa 7.2 m/s, rơi `lost: 4`) khớp.
- **Chưa đạt ở tag (ghi trung thực):** Đêm 2 và 3, bục nhảy, cầu, tầng, Gió Lạc, gió, menu/cài đặt/âm thanh,
  HUD đầy đủ. Lý do: lúc đó chọn làm "lõi Đêm 1" trước để chuyển sang Ticket-03.
- **Hoàn thiện sau (nằm trong tag `phase-4`):** `4ee4c2d` (lõi Đêm 2–3: bục nhảy, tầng/dốc/vách/tháp, Gió Lạc,
  gió, lịch sinh theo Đêm; 304 test) và `d22bb78` (web: chuỗi 3 Đêm, menu tạm dừng, cài đặt, âm thanh, HUD,
  vẽ Đêm 2–3; 337 test). Kịch bản tính tay: bục nhảy tiếp đất tick 84 tại (18.386, −6.619), gió đẩy đúng 10.0 m,
  Gió Lạc cướp ở tick 76 và biến mất ở tick 316, bình minh Đêm 3 được 895 điểm.
- **Hỏng phase trước:** không. Mọi test Phase 1 vẫn qua; riêng phần hoàn thiện có **bộ chặn golden**
  (`tests/guards/night1-golden.test.ts`) chứng minh đầu ra Đêm 1 giống từng byte trước và sau.
- **Cần chỉnh:** nên làm đủ ticket ngay trong phase thay vì chỉ làm lõi; Bóng Mực Đêm 2 không tìm đường qua cầu
  (đứng ở mép đảo).

## Phase 3 — Contract v1.2 "Đèn cạn dầu" (tag `phase-3` = `7c71709`)
- **Đạt:** nhiên liệu số nguyên đơn vị 1/60, thắp lại 5 đom đóm, châm dầu, đèn tắt, vùng an toàn chỉ khi
  fuel ≥ 30, trạng thái `drain`, điểm mới, thắng lúc bình minh (`dawn_survived`), sức chứa tăng dần, chế độ mù
  màu. Có ADR (`docs/adr/0001-…`) và mục CHANGELOG ghi các thay đổi phá tương thích. 262 test; kịch bản tính tay
  (đèn tắt đúng tick 290 khi bị hút, châm từ 10 lên 40.0, bình minh 417 điểm, sức chứa 16/20) khớp.
- **Hỏng phase trước:** không — các test cũ bị luật mới làm sai đều được viết lại kèm lý do trong CHANGELOG
  ("Tests updated (phase-3)"), không skip; các test Phase 1–2 còn hiệu lực vẫn qua.
- **Cần chỉnh:** vài ví dụ trong plan của Opus sai (quên rằng dầu hao trước khi châm trong cùng tick); agent
  làm đúng luật và báo lại. Ở tag này còn thiếu "giấy rách" cho đèn tắt và ánh sáng môi trường theo đèn — đã bổ
  sung trong `d22bb78`.

## Phase 4 — Contract v1.3, phát hành (tag `phase-4`)
- **Đạt:** bench (`node scripts/bench.mjs`, Chrome thật 1280×720, tắt vsync bằng cờ) trên bản cuối: avg 191.3 FPS,
  p1-low 99, load 2830 ms trên Apple M1 — qua cả 3 ngưỡng (`bench.json`); soak 10 Đêm: 0 crash, RAM 55 → 60 MB (≤ 1.2×). Launcher
  lưu bảng xếp hạng ra đĩa và `--export-leaderboard`. Contract v1.3.
- **Phần web Phase 4:** bảng xếp hạng (API launcher, dự phòng `localStorage`, nhập tên sau Bình Minh hoặc khi
  thua, tên có dấu tiếng Việt, top 10), đổi phím 9 hành động có báo trùng và khôi phục mặc định, phụ đề và mũi
  tên chỉ Bóng Mực mới xuất hiện, giảm chuyển động, mọi chữ ≥ 18 px và tùy chọn ×1.25 (test đọc CSS chặn chữ nhỏ).
  430 test. Chưa kiểm tra bằng mắt: màn nhập tên sau khi thua, phụ đề trong lúc chơi, bố cục ×1.25.
- **Hỏng phase trước:** không — golden Đêm 1 vẫn 5/5, test cũ chỉ đổi `contract_version`.
- **Cần chỉnh / rủi ro:** soak có một ván khởi động không tính trước Đêm đầu (để `mem_start` không đo lúc tiến
  trình còn "lạnh"); đã ghi công khai, nhưng người chấm có thể đánh giá khác. Soak toàn Đêm thua (input ngẫu
  nhiên), chưa có Đêm thắng.
