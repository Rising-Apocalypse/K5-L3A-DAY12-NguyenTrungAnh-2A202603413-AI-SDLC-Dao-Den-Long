# Changelog

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
