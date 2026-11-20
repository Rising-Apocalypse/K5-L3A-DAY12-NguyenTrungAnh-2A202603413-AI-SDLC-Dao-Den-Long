# Phase 4 proof — yêu cầu → bằng chứng (Contract v1.3)

Viết tay bởi người review (Claude Opus 5.5) từ các lần chạy thật trên commit `85b3f59` (cây sạch). Phần tự động
(test, scenario chạy 2 lần so byte) nằm trong `docs/proof/verify-latest.md` của cùng commit. Bảng đầy đủ yêu cầu
→ cách kiểm tra: `docs/spec/acceptance-phase4.md`.

| Yêu cầu (Ticket-04) | Cách kiểm chứng | Kết quả |
|---|---|---|
| §1 Bench | `node scripts/bench.mjs --seed 42 --duration 30 --out bench.json` (Chrome thật, 1280×720, cờ tắt vsync) | `bench.json`: avg 191.3 FPS (≥ 60), p1-low 99 (≥ 30), load 2830 ms (≤ 10000), 5739 khung, Apple M1 — **ĐẠT** trên máy này; điểm tính trên máy chấm |
| §1 Cảnh bench chuẩn | `tests/unit/bench.test.ts` (200 Bóng Mực `wander`, 100 đom đóm, L1–L3 fuel 100, không sinh/sát thương/nhặt/hao dầu/kết thúc sau 600 bước) + `tests/unit/web-benchstats.test.ts` (công thức avg/p1/p95) + ảnh `docs/media/screenshot.png` | ĐẠT |
| §2 Soak | `node --expose-gc dist/soak.js --seed 7 --nights 10 --out soak.json`; `tests/cli/soak.test.ts` | `soak.json`: 0 crash, RAM 61 → 64.3 MB (1.05×, ngưỡng 1.2×) — **ĐẠT**. Có ván khởi động không tính trước Đêm đầu (ghi trong `docs/notes/assumptions.md`) |
| §3 Bảng xếp hạng (lưu đĩa, top 10, sắp xếp, tên 3–12, có dấu) | `tests/unit/leaderboard.test.ts`, `tests/cli/play.test.ts` (POST/GET/export, 400 khi sai), `tests/unit/web-leaderboard.test.ts` | ĐẠT (test); màn nhập tên sau khi thua: kiểm tra tay chưa làm |
| §3 `--export-leaderboard` | `node dist/play.js --export-leaderboard out.json` từ bản clone sạch | `{"entries": []}` khi chưa có ai; có dữ liệu thì đúng thứ tự (test) — ĐẠT |
| §4 Đổi phím, báo trùng, khôi phục, lưu | `tests/unit/web-keymap.test.ts`, `web-settings-ext.test.ts` | ĐẠT (test); giao diện đã thử trong trình duyệt |
| §4 Phụ đề / chỉ báo | `tests/unit/web-captions.test.ts` | ĐẠT (test); chưa xem tận mắt trong lúc chơi |
| §4 Giảm chuyển động | gate trong `hud.ts`/`render.ts` (không có rung camera) | kiểm tra tay chưa làm |
| §4 Cỡ chữ ≥ 18 px, ×1.25 | `tests/unit/web-fontsize.test.ts` (đọc CSS, chặn mọi cỡ < 18 px) | ĐẠT |
| §5 Clone sạch, ≤ 3 lệnh | clone repo sang thư mục mới → `npm ci && npm run build` → headless, soak, export, launcher (`GET /` 200, `/api/leaderboard`) | ĐẠT |
| §5 README, CHANGELOG 4 phase, CREDITS, LICENSE | đọc tay | ĐẠT |
| §5 Release v1.0.0 | GitHub Release | người dùng tạo (máy không có `gh`) |
| §6 Contract v1.3, `bench_cmd`, `soak_cmd` | `game.contract.json`; `tests/unit/tuning.test.ts` | ĐẠT |
| §7 Retro, đánh giá từng phase | `docs/notes/retro.md`, `docs/notes/evaluation.md` | ĐẠT |
| §7 Video demo | Release v1.0.0 `demo.mp4` (link ở đầu README) | người dùng quay |
| Không hỏng phase trước | `tests/guards/night1-golden.test.ts` 5/5; 430/430 test | ĐẠT |
