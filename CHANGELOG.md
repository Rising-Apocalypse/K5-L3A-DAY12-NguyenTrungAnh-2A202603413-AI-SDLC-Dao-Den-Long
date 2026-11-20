# Changelog

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
- Đêm 2 và Đêm 3 (vẫn báo lỗi mã 1).
- Gió Lạc (drifters) hành vi và mô phỏng.
- Gió môi trường và bục nhảy (bounce pads), cầu (bridges), tầng (tiers).
- Menu, màn hình giới thiệu, cài đặt, âm thanh, HUD đầy đủ, chế độ hỗ trợ mù màu.

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
