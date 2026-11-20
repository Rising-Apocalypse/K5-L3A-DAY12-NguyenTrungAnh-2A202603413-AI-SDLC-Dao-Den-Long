# Changelog

## [phase-4] Contract v1.3

Benchmark, soak test, launcher kèm bảng xếp hạng lưu trên đĩa (kế hoạch `docs/plans/06-phase4-bench-soak-launcher.md`). Màn hình Bảng xếp hạng, đổi phím và accessibility thuộc Plan 07. Đêm 1–3 và đầu ra headless không đổi một byte (`tests/guards/night1-golden.test.ts` vẫn 5/5).

### Thêm
- `game.contract.json`: `contract_version` `"1.3"`, `bench_cmd` (`node scripts/bench.mjs`), `soak_cmd` (`node --expose-gc dist/soak.js`); `run_cmd` đổi từ `npm run play` thành `node dist/play.js` (bộ chấm gắn thêm cờ `--export-leaderboard`, mà npm sẽ nuốt cờ nếu thiếu `--`). Tuning không đổi.
- Lõi: `createGame({ bench: true })` (chỉ Đêm 1, mặc định tắt): đèn L1–L3 sáng đầy dầu, đúng 200 Bóng Mực `wander` và 100 đom đóm rải đều trên đảo (luồng `bench`, tránh vùng an toàn), tắt sinh thực thể, sát thương, nhặt, hao và hút dầu, đồng hồ và điều kiện kết thúc Đêm.
- Soak: `node --expose-gc dist/soak.js --seed 7 --nights 10 --out soak.json [--verbose]` chạy N Đêm liên tiếp trong một tiến trình (Đêm 1 → 2 → 3 xoay vòng, Đêm i dùng seed + i), input ngẫu nhiên theo seed, ghi `nights`, `crashes`, `results`, `mem_start_mb`, `mem_end_mb`, `duration_s`.
- Bảng xếp hạng (`src/leaderboard/board.ts`, thuần, dùng chung cho web và launcher): kiểm tên 3–12 ký tự chữ/số/`_` (có tiếng Việt có dấu), sắp xếp điểm giảm dần rồi ai đạt trước, giữ top 10, ISO 8601 kèm múi giờ.
- Launcher `node dist/play.js`: máy chủ tĩnh `dist/web` trên 127.0.0.1 (cổng 4173, tự thử tới 4183), mở trình duyệt (`--no-open` để bỏ qua), API `GET/POST /api/leaderboard`, lưu `data/leaderboard.json` (ghi nguyên tử), `--leaderboard-file <file>`, và `--export-leaderboard out.json` (xuất `{"entries": [...]}` đúng thứ tự, không bật máy chủ).
- Web: chế độ bench `?bench=1&seed=42&duration=30` (`src/web/bench.ts`, thống kê thuần ở `src/web/benchstats.ts`), `renderer.setCamera()` cho camera bay vòng.
- Bench: `node scripts/bench.mjs --seed 42 --duration 30 --out bench.json` mở Chrome/Chromium/Edge đã cài (không cần thêm phụ thuộc), đo FPS, p1 low, p95, thời gian tải và RSS cao nhất của cây tiến trình trình duyệt.
- `npm run build:headless` đóng gói thêm `dist/soak.js` và `dist/play.js`; script `npm run play`, `npm run bench`, `npm run soak`.

### Thay đổi
- `npm run play` không còn là `vite preview` mà chạy launcher (`node dist/play.js`).
- `src/web/main.ts` chỉ còn chọn chế độ (bench hay game); mã game cũ chuyển nguyên văn sang `src/web/game.ts`.

### Tests updated (phase-4)
- `tests/unit/tuning.test.ts`: kiểm tra `contract_version` từ `'1.2'` thành `'1.3'`.

## [phase-2 hoàn thiện] Đêm 2–3 (Contract v1.2 không đổi)

Lõi headless của Ticket-02 phần 2 và 3 (kế hoạch `docs/plans/04-phase2-nights-2-3-core.md`). Phần web (menu, HUD, âm thanh, vẽ Đêm 2–3) thuộc Plan 05. Đêm 1 không đổi một byte (`tests/guards/night1-golden.test.ts`).

### Thêm
- Module `src/core/levels.ts`: dữ liệu và hàm thuần cho từng Đêm (`getLevel(night)`); các cờ `shadesAvoidVoid`, `terrainY`, `walls` đều tắt ở Đêm 1 để giữ đầu ra cũ.
- `--night 1|2|3` (các giá trị khác vẫn báo lỗi mã 1); `createGame({ night })`; `night_start` mang số Đêm; thời lượng 240 / 270 / 300 s; hồi sinh về `level.playerStart`.
- Đêm 2 Đảo Cau: hai đảo bán kính 28 nối bằng cầu tre, 6 đèn, 24 điểm sinh đom đóm, Bùa Gió C1, hai bục nhảy (vy 14, ngang 24 m/s về đảo kia; phím di chuyển không ghi đè, vẫn lướt được).
- Đêm 3 Đảo Chuông: ba tầng (0 / 3 / 6), hai dốc 30° và 150°, vách tầng (bước lên tối đa 0.35 m mỗi tick, đi ra mép thì rơi), tháp chuông bán kính 2 chặn Mây, bục nhảy (0,3,13), 7 đèn, 30 điểm sinh đom đóm, Bùa Gió C1 C2, điểm xuất phát (0,0,−30).
- Gió (Đêm 3): báo trước 120 tick, cơn gió 300 tick mỗi 1800 tick, đẩy 2 m/s, hướng từ luồng ngẫu nhiên `wind`; snapshot `wind {active, dir_deg}`.
- Gió Lạc (drifters): sinh tại tick 1200, 2400, … (tối đa 2, luồng `drifters`), `idle` → `chase` → `flee` → biến mất; cướp tối đa 3 đom đóm (bất tử không ngăn), sự kiện `drifter_steal` và `drifter_drop`; Tỏa Sáng làm kẻ đuổi bỏ chạy, kẻ cướp thả đồ; snapshot `drifters` theo id tăng dần.
- Bóng Mực theo Đêm: sinh mỗi 480 / 420 / 360 tick, tối đa 6 / 8 / 10, tốc độ 4.0 / 4.0 / 4.5; ở Đêm 2–3 không bao giờ đứng trên hư không hoặc trong tháp, bay sát mặt đất, lang thang về điểm sinh đom đóm.
- Scenario: `drifters[]` nhận thêm `id`, `state` (`idle|chase|flee`), `stolen`; id đèn tới L6/L7 tuỳ Đêm.
- Bài test mới: `tests/cli/nights.test.ts` (24 test), `tests/unit/levels.test.ts`, `tests/unit/scenario-drifters.test.ts`, 16 fixture `tests/scenarios/n2-*` và `n3-*` (verify chạy với `--night 2|3` theo tiền tố tên).
- `scripts/verify.mjs`: thêm các dòng Đêm 2–3 / bục nhảy / tầng / gió / Gió Lạc / Đêm 1 không đổi vào bảng proof phase-2, và dòng hiệu năng `--night 3 --ticks 21600` (≤ 30 s).
- Tài liệu: `docs/spec/acceptance-phase2.md`, mục "Phase 2 hoàn thiện" trong `docs/notes/assumptions.md`.

### Thêm (web, Plan 05)
- Luồng màn hình `src/web/flow.ts` (máy trạng thái thuần): menu → giới thiệu Đêm (tên đảo, thời lượng, số đèn cần, lời Ông Đăng) → chơi → kết quả → Đêm kế tiếp; thắng Đêm 3 ra màn Bình Minh với tổng điểm (tổng các Đêm đã thắng trong lượt chơi, Đêm chơi lại chỉ tính một lần); thua thì "Chơi lại Đêm n" hoặc về menu; "Chọn Đêm" để luyện tập. DOM ở `src/web/screens.ts`.
- Menu tạm dừng (P / Esc): Tiếp tục, Chơi lại Đêm, Cài đặt, Về menu; nhạc nền giảm còn 30 %, các phím khác bị bỏ qua khi đang dừng.
- Cài đặt lưu lại (`src/web/settings.ts`, khoá `dao-den-long.settings.v1`): âm lượng 0–100, độ nhạy chuột 0.1–1.0 độ/px, bảng màu dễ phân biệt (phím `C` vẫn dùng được).
- Âm thanh WebAudio tổng hợp (`src/web/audio.ts`): nhạc nền pad và arpeggio ngũ cung, hiệu ứng nhặt, thắp, châm dầu, toả sáng, bị đánh, nhảy, lướt, thắng, thua, Bóng Mực xuất hiện, đếm ngược 10 s cuối, báo gió, Gió Lạc cướp. Không file âm thanh.
- HUD đầy đủ (`src/web/hud.ts`, logic thuần ở `hudlogic.ts`): ngọn lửa, đồng hồ mm:ss (đỏ và nhấp nháy 2 Hz khi ≤ 30 s), đèn k/n · cần m, điểm, thanh đom đóm 10–20 ô, biểu tượng hồi chiêu Lướt, Toả sáng và Đom đóm dẫn đường, nhắc "E", mũi tên tới đèn chưa sáng gần nhất khi ngoài màn hình, cảnh báo gió; `?fps=1` hiện FPS.
- Vẽ Đêm 2 và Đêm 3 (`src/web/render.ts`): đảo, cầu tre, bục nhảy phát sáng, ba tầng, hai dốc, tháp chuông; Bùa Gió, Gió Lạc (dải lụa, nhanh hơn khi đuổi, mờ khi bỏ chạy), lá bay theo hướng gió (báo trước 2 s và lúc gió thổi, tối đa 160 hạt); ánh sáng môi trường nội suy theo 0.15 + 0.55 × sáng/tổng; đèn tắt có vệt rách chéo trên giấy.
- Sáng tạo: "Đom đóm dẫn đường" (phím `H`) ở `src/extras/guide.ts`, chỉ đọc `game.state`.
- Bài test mới: `tests/unit/web-flow.test.ts`, `web-settings.test.ts`, `web-hudlogic.test.ts`, `web-guide.test.ts`.

### Tests updated (phase-2 hoàn thiện)
- `tests/cli/cli.test.ts` — `exit 1 (not 0, not 2): missing required flags, unknown flag, bad values`: dòng `--night 2` bị từ chối đổi thành `--night 4` (Đêm 2 và 3 nay hợp lệ; chỉ 0, 4, `abc`… bị từ chối); plan 04 §0.2.
- `tests/helpers/cli.ts` (helper, không phải test): thêm tuỳ chọn `night` (mặc định theo tiền tố fixture `n2-`/`n3-`) và hàm `cli()`.
- Không test nào khác bị sửa, xoá, `.skip` hay `.todo`; `tests/golden/` và `tests/guards/night1-golden.test.ts` không đổi.

## [phase-3] Contract v1.2 "Đèn cạn dầu" (Đêm 1)

### Thêm
- Nhiên liệu đèn: số nguyên đơn vị 1/60 (đầy = 6000), tự hao 1 đơn vị mỗi tick, mỗi đom đóm châm thêm 10 nhiên liệu (600 đơn vị).
- Châm dầu (`refuel`) cho đèn đang sáng chưa đầy; đèn cạn dầu thì tắt (`lantern_out`) và có thể thắp lại với `relight_cost` 5 đốm (`lantern_lit` có `relight: true`, +40 điểm).
- Trạng thái Bóng Mực mới `drain`: Bóng Mực đi tới đèn yếu (nhiên liệu < 30), đứng cách ≤ 2 m và hút 5 nhiên liệu/giây; sự kiện `fuel_drain` mỗi 60 tick cho mỗi Bóng Mực.
- Sức chứa tăng dần: `capacity = min(20, 10 + 2 × số lần thắp thành công)`.
- Scenario: `lanterns[].fuel`, `lanterns[].ever_lit`, `player.successful_lights`, `shades[].target_lantern_id`, `shades[].state = "drain"`.
- Snapshot: đèn có `fuel`, `ever_lit`, `relit_count`; `player.capacity` ngay sau `carried`.
- Web: thanh nhiên liệu, đèn nhấp nháy khi nhiên liệu < 30, HUD `carried / capacity` và số đèn cần thắp, phím `C` bật bảng màu dễ phân biệt.

### Thay đổi phá tương thích
- [THAY THẾ] Chi phí thắp đèn: 10 đốm lần đầu, 5 đốm (`relight_cost`) nếu đèn đã từng sáng (`ever_lit`); điểm thắp lại là 40 thay vì 100.
- [THAY THẾ] Đèn đang sáng không còn "không nhận gì": nhận đom đóm để châm dầu (mỗi đốm +5 điểm, +10 nhiên liệu, tối đa 100).
- [THAY THẾ] Vùng an toàn chỉ có khi đèn sáng và nhiên liệu ≥ 30 (đúng 30.0 vẫn còn); Bóng Mực không còn "không bao giờ vào" vùng của đèn yếu.
- [THAY THẾ] Bóng Mực `wander` đi về đèn yếu gần nhất, nếu không có thì về đèn tắt gần nhất, thay vì chỉ đi ngẫu nhiên.
- [THAY THẾ] Điểm pulse: +5 mỗi Bóng Mực, +15 nếu Bóng Mực đó đang `drain`.
- [THAY THẾ] Luật thắng/thua: bỏ thắng sớm `all_lit`; hết giờ mà số đèn sáng ≥ `ceil(0.6 × 5) = 3` thì thắng `dawn_survived`, ngược lại thua `dawn`; hết Ngọn Lửa luôn là `no_flames` và được xét trước, kể cả đúng tick bình minh.
- Công thức điểm: nạp/châm `per_mote` = 5 mỗi đốm (trước đây 10), thắp lần đầu +100, thắp lại +40, thưởng bình minh = Σ mỗi đèn sáng (50 + floor(nhiên liệu)) + 50 × số Ngọn Lửa còn lại; thưởng theo giây còn lại bỏ (`per_second_left` = 0).
- Thời lượng Đêm: `night1_duration_s` 300 → 240 (Đêm 2 = 270, Đêm 3 = 300).
- `game_over.reason` không còn `all_lit`, thay bằng `dawn_survived`.
- `lantern_lit` có thêm `relight`; sự kiện mới `refuel`, `lantern_out`, `fuel_drain`.
- Snapshot: `lanterns[]` thêm `fuel`, `ever_lit`, `relit_count`; `player` thêm `capacity` sau `carried`; trạng thái Bóng Mực có thêm `drain`.
- `contract_version` 1.1 → 1.2; `game.contract.json` thêm 8 khoá tuning mới.

### Tests updated (phase-3)
- `tests/unit/tuning.test.ts` — `contract_version`: kỳ vọng `'1.1'` → `'1.2'` (contract nâng phiên bản).
- `tests/unit/sim.test.ts`:
  - `N steps -> tick N, sim_tick N, time_left_s = start - N/60`: `298.333` → `238.333` (240 − 100/60); luật 11, thời lượng 240 s.
  - `snapshot has the contract key order`: thêm khoá `capacity` của `player` và `fuel, ever_lit, relit_count` của `lanterns[]`; §3 (snapshot).
  - `scenario build emits no events and awards no points (even for a pre-lit lantern)`: snapshot đèn L3 thêm `fuel: 100, ever_lit: true, relit_count: 0`; §3. Đèn đặt sẵn `lit: true` mà không có `ever_lit` thì `ever_lit` = true (giả định, xem assumptions).
  - `lantern overrides apply by id; the others keep their defaults`: trạng thái đèn thêm `fuelUnits: 0, everLit: false, relitCount: 0`; kiểu `LanternState` đổi.
- `tests/unit/rules.test.ts`:
  - `a partly filled lantern takes only what is missing (lantern_cost - deposited), then lights`: sự kiện `lantern_lit` thêm `relight: false`; §3.
  - `goes to the nearest unlit lantern in reach; lit lanterns are skipped` → `goes to the nearest lantern in reach that can take motes: a lit one below full is refuelled, not ignored`: cũ = đèn sáng bị bỏ qua và nạp vào L3; mới = đèn sáng L2 (đã hao 1 đơn vị ở bước 2) là gần nhất nên được châm dầu (`refuel` amount 1, fuel 100), không có `deposit`; luật 4.
  - `a shade cannot hit while Mây lights a lantern beside it: lighting evicts it first ...`: cũ = có `game_over all_lit` khi thắp đèn cuối; mới = không có `game_over` (không thắng sớm); luật 10. Ý chính (không bị đánh) giữ nguyên.
  - `lighting the last lantern on the tick the time runs out is a win (all_lit beats dawn), with no seconds bonus` → `... is a dawn win with the dawn bonus`: cũ = `all_lit`, điểm 10×10+100+3×50 (giá trị điểm theo luật cũ); mới = `dawn_survived`, điểm 1046 = (10×5 + 100) + (50+100) + 4×(50+99) + 3×50; luật 10.
  - `the win bonus is floor(time_left_s) * per_second_left + flames * per_flame_left, added before game_over` → `there is no seconds bonus and no early win: ...`: cũ = thưởng giây còn lại + ngọn lửa khi thắp đèn cuối; mới = chỉ 150 điểm (50 + 100), game vẫn `playing`; luật 10 (bỏ thắng sớm và thưởng thời gian).
  - `a game that starts with 0 flames, 0 seconds or all lanterns lit ends at the first step` → `... 0 flames or 0 seconds ends at the first step (all lanterns lit does not)`: cũ = 5 đèn sáng sẵn thắng `all_lit` ngay bước đầu; mới = vẫn `playing`, điểm 0; luật 10.
- `tests/cli/cli.test.ts`:
  - `snapshot fields follow the contract: key order, time_left_s, rounding, motes`: `time_left_s` `299.5` → `239.5`; luật 11.
  - `plays the contract sample scenario + inputs cleanly`: đèn L1 thêm `fuel: 0, ever_lit: false, relit_count: 0`; §3.
  - `a night without shades and without actions ends exactly at dawn: tick 18000, ...` → `... tick 14400, ...`: tick kết thúc `18000` → `14400` (240 s × 60); luật 11.
- `tests/cli/gameplay.test.ts`:
  - `deposit-light: a full lantern lights up: ...`: `lantern_lit` thêm `relight: false`; §3.
  - `win-all-lit: lighting the last lantern wins at once; score adds seconds left and flames left` → `win-all-lit: 3 of 5 lanterns lit at dawn is a dawn_survived win; score = sum(50 + floor(fuel)) + flames * 50`: cũ = thắp đèn cuối thì thắng `all_lit` ngay tick 1; mới = 3 đèn sáng, `time_left_s: 1`, 60 tick → `dawn_survived`, điểm 597 = 3×(50+99) + 3×50; luật 10. Fixture `tests/scenarios/win-all-lit/` được viết lại tương ứng (đổi nội dung, giữ tên).
- Test mới (không phải sửa): 14 test trong `describe('phase 3 (v1.2)')` của `tests/cli/gameplay.test.ts` với 12 fixture mới trong `tests/scenarios/`; test parse scenario mới trong `tests/unit/scenario.test.ts`.
- Không test nào bị xóa, `.skip` hay `.todo`.

## [phase-2] Contract v1.1 (Đêm 1)

### Thêm
- Lướt (dash): phím Shift, vận tốc 14 m/s trong 12 tick (0.2s), hồi chiêu 90 tick (1.5s), sự kiện `dash`.
- Tạm dừng (pause): phím P / Esc, sự kiện `paused` và `resumed`, đóng băng simTick và vị trí, trạng thái snapshot `"paused"`.
- Bùa Gió (wind charm): nhặt bùa từ kịch bản, tốc độ chạy 7.2 m/s trong 600 tick, không hồi chiêu khi lướt, sự kiện `charm_picked`.
- Sự kiện `night_start`: phát ra ở tick 1 với `{ night: 1 }`.
- Mở rộng scenario v1.1: hỗ trợ `charms`, `drifters`, `random_drifters`, `wind_enabled`, `player.invuln_ticks`, `player.dash_cd_ticks`, `player.pulse_cd_ticks`, `player.charm_ticks`, `shades[].state`, `shades[].state_ticks_left`.
- Snapshot v1.1: cấu trúc và thứ tự khoá mới theo Contract v1.1 (§3.2).

### Thay đổi phá tương thích
- Sự kiện rơi (`player_hit` do `fall`): chuyển `dropped: n` thành `dropped: 0, lost: n`.
- Phiên bản contract: nâng từ `"1.0"` lên `"1.1"` trong `game.contract.json`.
- Cấu trúc snapshot: bổ sung các trường `night`, `wind`, `drifters`, `charms`, cập nhật `player` và `motes[].kind`, `motes[].ttl_s`.

### Chưa làm (chưa đạt)
- Menu, màn hình giới thiệu, cài đặt, âm thanh, HUD đầy đủ (phần web, Plan 05).
- (Đã làm sau đó ở mục "phase-2 hoàn thiện": Đêm 2 và 3, Gió Lạc, gió, bục nhảy, cầu, tầng.)

### Tests updated
- `tests/unit/tuning.test.ts`: cập nhật kiểm tra `contract_version` từ `'1.0'` thành `'1.1'`.
- `tests/cli/cli.test.ts`:
  - `snapshot fields follow the contract: key order, time_left_s, rounding, motes`: cập nhật thứ tự khoá snapshot v1.1.
  - `plays the contract sample scenario + inputs cleanly`: cập nhật cấu trúc `motes` trong snapshot v1.1 (`kind: 'random'`, `ttl_s: null`).
  - `building a scenario writes no event lines (even with a pre-lit lantern)`: lọc bỏ sự kiện `night_start` ở tick 1.
- `tests/unit/sim.test.ts`:
  - `snapshot has the contract key order`: cập nhật kiểm tra thứ tự khoá snapshot và các đối tượng con (player, motes) theo v1.1.
  - `random_motes:false with no list means no motes; a list replaces the defaults`: cập nhật cấu trúc `motes` có trường `kind: 'random'`.
  - `scenario build emits no events and awards no points (even for a pre-lit lantern)`: lọc bỏ sự kiện `night_start` ở tick 1.
- `tests/unit/rules.test.ts`:
  - `does not pick up while waiting to respawn after a fall`: lọc bỏ sự kiện `night_start` ở tick 1.
  - `a partly filled lantern takes only what is missing (lantern_cost - deposited), then lights`: lọc bỏ sự kiện `night_start` ở tick 1.
  - `interact_radius is inclusive; further away, or with nothing carried, nothing happens`: lọc bỏ sự kiện `night_start` ở tick 1.
  - `is not possible while waiting to respawn`: lọc bỏ sự kiện `night_start` ở tick 1.
  - `an empty pulse still costs the motes and starts the cooldown, with an empty stunned_ids list`: lọc bỏ sự kiện `night_start` ở tick 1.
  - `does not touch a shade that is still spawning, and is refused while waiting to respawn`: lọc bỏ sự kiện `night_start` ở tick 1.
  - `the penalty comes once per fall and ignores invulnerability; the respawn is at the start with a fresh invulnerability`: cập nhật sự kiện rơi thành `{ dropped: 0, lost: 5 }`.
  - `with fall_enabled false the island edge is a wall: no fall, no event`: lọc bỏ sự kiện `night_start` ở tick 1.
  - `no_flames is checked before all_lit: with no flames left and every lantern lit, the night is lost`: lọc bỏ sự kiện `night_start` ở tick 1.
  - `a game that starts with 0 flames, 0 seconds or all lanterns lit ends at the first step`: lọc bỏ sự kiện `night_start` ở tick 1.
- `tests/cli/gameplay.test.ts`:
  - `pickup-capacity: nothing is picked up while carried >= carry_capacity`: cập nhật kiểm tra snapshot `motes` có `kind: 'random', ttl_s: null`.
  - `deposit-light: a full lantern lights up: deposit, then lantern_lit, score = motes + lantern`: lọc bỏ sự kiện `night_start` ở tick 1.
  - `fall-respawn: below FALL_Y costs one flame and all carried motes; Mây is frozen, then back at the start, invulnerable`: cập nhật sự kiện rơi `{ dropped: 0, lost: carried }` và kiểm tra player snapshot bằng `toMatchObject`.
  - `fall-last-flame: falling with one flame left ends the game (lost, no_flames) with no respawn`: cập nhật sự kiện rơi `{ dropped: 0, lost: carried }`.
  - `win-all-lit: lighting the last lantern wins at once; score adds seconds left and flames left`: lọc bỏ sự kiện `night_start` ở tick 1.
  - `every line of a long run is valid contract JSON (types, key order, 3-decimal coordinates)`: bổ sung danh sách sự kiện mới (`dash`, `charm_picked`, `night_start`, `paused`, `resumed`) và thứ tự khoá snapshot v1.1.

## [phase-1] Contract v1.0 (Đêm 1)

Gameplay Đêm 1 theo `docs/plans/01-phase1-gameplay.md` (kế hoạch) và `docs/spec/contract-v1.0.md`. Chi tiết từng luật: `docs/notes/assumptions.md`, mục "Phase 1 — luật chơi".

### Thêm
- Lõi mô phỏng thuần (`src/core`) với một hàm `step(input)` chung cho web và headless: 60 tick/giây, 11 giai đoạn cố định mỗi tick, bộ đếm là số nguyên tick, ngẫu nhiên chỉ qua các luồng có nhãn (`motes`, `drops`, `shade_ai`, `spawn`, `shades`).
- CLI headless `node dist/headless.js --seed --night 1 --ticks --out [--scenario] [--inputs] [--snapshot-every]`: ghi JSONL (snapshot, sự kiện, dòng `end`), cùng đầu vào cho đầu ra giống nhau từng byte; mã thoát 0 / 1 (dùng sai lệnh) / 2 (file sai định dạng).
- Đêm 1 Đảo Bến: đảo tròn bán kính 40, 5 Đèn Lồng Lớn, 20 đốm sáng ban đầu, đốm mới mỗi 240 tick (tối đa 30).
- Mây: đi, nhảy, rơi khỏi đảo (mất 1 ngọn lửa và hết đốm, hồi sinh sau 60 tick); nhặt đốm sáng, nạp đèn (10 đốm thắp một đèn), pulse (tốn 3 đốm, bán kính 5 m, choáng 2 s, hồi 3 s).
- Bóng Mực: sinh tại tick 300 (2 con) rồi mỗi 480 tick (tối đa 6), lang thang, đuổi, chạm thì mất 1 ngọn lửa và rơi nửa số đốm; vùng an toàn bán kính 6 m quanh đèn sáng.
- Điểm theo `tuning.score`; kết thúc: hết ngọn lửa thì thua, thắp hết đèn thì thắng, hết giờ thì thua; Test Contract v1.0 (`game.contract.json`, mọi số tuning ở một nơi).
- Web (Three.js, Vite): cảnh Đêm 1, HUD cơ bản, chơi lại bằng R; kiểm tra kiến trúc (`tests/guards/architecture.test.ts`) và so khớp byte Đêm 1 với `tests/golden/`.
- `npm run verify`: build + test + chạy mọi kịch bản `tests/scenarios/*` hai lần và so từng byte, ghi `docs/proof/`.

### Ghi chú
- Phase 1 chưa có lướt, tạm dừng, Bùa Gió, Đêm 2–3 (xem phase-2); bản v1.0 chưa có trường `night`, `wind`, `drifters`, `charms` trong snapshot.
