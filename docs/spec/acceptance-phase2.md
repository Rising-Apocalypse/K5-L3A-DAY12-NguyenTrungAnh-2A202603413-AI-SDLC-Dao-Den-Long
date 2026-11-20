# Tiêu chí nghiệm thu — Phase 2 (Ticket-02, phần 2 và 3)

Mỗi mục ghi test/fixture kiểm tra nó. Test nằm ở `tests/cli/nights.test.ts` (chạy CLI thật trên `tests/scenarios/n2-*`, `n3-*`),
`tests/unit/levels.test.ts` và `tests/unit/scenario-drifters.test.ts`. Mục chỉ có trên web: "kiểm tra tay — Plan 05".
Đêm 1 không đổi: `tests/guards/night1-golden.test.ts` (so 5 lần chạy với `tests/golden/`).

## Phần 2 — Bản đồ chuẩn

| # | Tiêu chí | Kiểm tra bởi |
|---|---|---|
| 2.1 | Đêm 1 Đảo Bến giữ nguyên từng byte (bán kính 40, 5 đèn, điểm sinh, lịch 480/6) | `night1-golden.test.ts` (5 lần chạy); `levels.test.ts` > Night 1 |
| 2.2 | `--night 2` và `--night 3` được chấp nhận, thời lượng 270 / 300 s, `night_start` mang số Đêm; `--night 0/4/abc` báo lỗi mã 1 | `nights.test.ts` > selection and starting state; `cli.test.ts` |
| 2.3 | Đêm 2: hai đảo bán kính 28 tâm (0,0) và (70,0), cầu tre x ∈ [26,44], z ∈ [−2,2], không lan can | `levels.test.ts` > Night 2; `n2-bridge`; `n2-void` (ra khỏi đảo ngoài cầu thì rơi) |
| 2.4 | Đêm 2: 6 đèn L1..L6 đúng toạ độ; 24 điểm sinh đom đóm (20 lúc đầu, 20 điểm khác nhau); 16 điểm sinh Bóng Mực; Bùa Gió C1 (35,0,0) | `nights.test.ts` > `--night 2 tick-0 snapshot`; `levels.test.ts` |
| 2.5 | Bục nhảy Đêm 2 tại (20,0,18) và (50,0,−18): vy 14, 24 m/s ngang về tâm đảo kia, đáp sau ~1.4 s trong đảo đích; phím di chuyển không ghi đè | `n2-pad` (cả bục thứ hai); `levels.test.ts` |
| 2.6 | Đêm 2: Bóng Mực sinh mỗi 7 s (420 tick), tối đa 8, tốc độ 4.0 | `nights.test.ts` > shade schedules; `n2-shade-speed` |
| 2.7 | Đêm 3: đảo bán kính 45, 3 tầng (0 / 3 vành 12–24 ở z>0 / 6 đĩa bán kính 8), vách đứng, bước ra mép thì rơi xuống tầng dưới | `levels.test.ts` > Night 3; `n3-wall`; `n3-ledge` |
| 2.8 | Đêm 3: hai dốc rộng 3 m ở 30° và 150°, chân r=30 (Y 0), đỉnh r=24 (Y 3) | `levels.test.ts`; `n3-ramp` |
| 2.9 | Đêm 3: bục nhảy (0,3,13) vy 12, 8 m/s theo −Z, đáp lên tầng 2 | `n3-pad` |
| 2.10 | Đêm 3: tháp chuông bán kính 2 ở tâm tầng 2, không leo/xuyên được | `n3-tower`; `n3-pad` (không bao giờ vào tháp) |
| 2.11 | Đêm 3: 7 đèn; 30 điểm sinh đom đóm (18 + 8 + 4 theo tầng); 16 điểm Bóng Mực r=43; Bùa C1, C2; xuất phát (0,0,−30) | `nights.test.ts` > `--night 3 tick-0 snapshot`; `levels.test.ts` |
| 2.12 | Đêm 3: Bóng Mực mỗi 6 s (360 tick), tối đa 10, tốc độ 4.5 | `nights.test.ts` > shade schedules; `n3-shade-speed` |
| 2.13 | Đêm 3: gió mạnh mỗi 30 s kéo dài 5 s, hướng ngẫu nhiên, đẩy 2 m/s, báo trước 2 s | `n3-wind` (bật / `wind_enabled: false` / Đêm 1–2 không có gió); phần báo trước bằng lá bay và âm thanh: kiểm tra tay — mở `?seed=1`, Chọn Đêm 3, đợi tới giây 28 (tick 1680): thấy dòng "Gió mạnh sắp tới!", lá bay theo hướng gió và nghe tiếng gió vù; 2 giây sau gió thổi thật |
| 2.14 | Bóng Mực Đêm 2–3 không đứng trên hư không | `n2-shade-void` |

## Phần 3 — Tính năng mới

| # | Tiêu chí | Kiểm tra bởi |
|---|---|---|
| 3.1 | Gió Lạc: tối đa 2, sinh tại tick 1200, 2400, …, id D1, D2, trạng thái idle → chase → flee → biến mất; không sinh ở Đêm 1 | `nights.test.ts` > drifter spawns |
| 3.2 | idle → chase khi Mây mang ≥ 5 và cách ≤ 15 m; mất điều kiện thì về idle | `n2-drifter-steal` (chase ở tick 1) |
| 3.3 | Chạm (XZ ≤ 1.2 m): cướp min(3, đang mang), `drifter_steal`, flee 240 tick rồi biến mất cùng đồ cướp; mỗi con chỉ cướp 1 lần | `n2-drifter-steal` |
| 3.4 | Bất tử của Mây không ngăn bị cướp; không mất Ngọn Lửa | `n2-drifter-invuln` |
| 3.5 | Tỏa Sáng trúng Gió Lạc đang chase → flee, không cướp | `n2-drifter-pulse-chase` |
| 3.6 | Tỏa Sáng trúng Gió Lạc đang flee có đồ → thả hết (đốm rơi, `drifter_drop`), biến mất sau ≤ 120 tick | `n2-drifter-pulse-drop` |
| 3.7 | Bùa Gió ở các vị trí Đêm 2 / Đêm 3 (luật nhặt, 600 / 2700 tick giữ nguyên từ Phase 2) | `nights.test.ts` > tick-0 snapshots (charms); fixture `charm` (Đêm 1) |
| 3.8 | Snapshot `drifters` (id, pos, state, stolen) và `wind` (active, dir_deg) | `nights.test.ts` > drifters, wind |
| 3.9 | Scenario: `drifters[]` {pos, id?, state?, stolen?}, `random_drifters`, `wind_enabled`; id trùng → FormatError | `scenario-drifters.test.ts`; `scenario.test.ts` |
| 3.10 | Thứ tự tick: Gió Lạc di chuyển sau Bóng Mực, cướp trước khi Bóng Mực gây hit, gió sau chuyển động của Mây | `n2-drifter-*` (tick chính xác tính tay) |
| 3.11 | Một Đêm đầy đủ (≤ 21.600 tick) chạy headless ≤ 30 s và xác định (byte giống nhau) | `nights.test.ts` > determinism and speed; dòng Performance của `docs/proof/phase-2.md` |
| 3.12 | Chuỗi 3 Đêm: menu → giới thiệu → chơi → kết quả → Đêm kế; thắng Đêm 3 → màn Bình Minh với tổng điểm; thua → chơi lại Đêm đó | máy trạng thái: `tests/unit/web-flow.test.ts`; kiểm tra tay: Bắt đầu, đọc lời Ông Đăng, Enter, chơi (hoặc dùng "Chọn Đêm" để rút ngắn), xem màn kết quả và nút "Đêm kế" / "Chơi lại Đêm n" / "Về menu" |
| 3.13 | Tạm dừng (Esc/P): logic dừng hoàn toàn; menu Tiếp tục / Chơi lại Đêm / Cài đặt / Về menu; nhạc giảm còn 30 % | lõi: `nights.test.ts` (pause); kiểm tra tay: bấm P giữa trận, đồng hồ đứng yên, phím khác không có tác dụng, thử từng nút |
| 3.14 | Cài đặt: âm lượng, độ nhạy chuột, bảng màu; lưu giữa các lần mở | tải/lưu/ép khoảng: `tests/unit/web-settings.test.ts`; kiểm tra tay: đổi cài đặt, tải lại trang (F5), giá trị vẫn còn; kéo chuột xoay camera nhanh/chậm theo độ nhạy |
| 3.15 | Âm thanh: nhạc nền đêm và hiệu ứng nhặt, thắp, tỏa sáng, bị đánh, nhảy, lướt, thắng, thua, Bóng Mực xuất hiện, đếm ngược 10 s cuối, báo gió | kiểm tra tay: bật loa, làm từng việc (âm chỉ phát sau cú bấm/phím đầu tiên của trình duyệt) |
| 3.16 | HUD đầy đủ: ngọn lửa (trên trái), mm:ss (trên giữa, đỏ + nhấp nháy ≤ 30 s), đèn k/n và điểm (trên phải), thanh đom đóm 10–20 ô (dưới giữa), hồi chiêu Lướt/Toả sáng (dưới phải), nhắc "E — Nạp ánh sáng (x/10)", mũi tên tới đèn chưa sáng gần nhất khi ngoài màn hình | định dạng đồng hồ, sức chứa, đèn gần nhất, mũi tên mép màn hình, FPS: `tests/unit/web-hudlogic.test.ts`; kiểm tra tay: so với Ticket-02 trong trình duyệt |
| 3.17 | Vẽ Đêm 2 và 3 đúng bản đồ, bảng màu Ticket-02, Gió Lạc, Bùa Gió, đèn tắt có vệt rách, ánh sáng môi trường tăng theo số đèn sáng; ≥ 30 FPS ở 1280×720 | kiểm tra tay: chơi từng Đêm, thêm `?fps=1` để xem FPS |
| 3.18 | Sáng tạo "Đom đóm dẫn đường" (H) không đổi đầu ra headless | `night1-golden.test.ts`, `architecture.test.ts`; chọn đích và hồi chiêu: `tests/unit/web-guide.test.ts`; kiểm tra tay: bấm H ở Đêm 2 |
