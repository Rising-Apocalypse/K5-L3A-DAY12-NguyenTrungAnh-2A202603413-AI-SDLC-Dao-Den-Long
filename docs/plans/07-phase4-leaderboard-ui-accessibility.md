# Plan 07 — Phase 4 (Ticket-04) part 2: leaderboard screens + accessibility (web only)

Author: Claude Opus 5.5. Implementer: Sonnet (medium). Spec: `docs/spec/ticket-04.md` §3 and §4.
Precondition: Plan 06 is done (`src/leaderboard/board.ts`, launcher API `GET/POST /api/leaderboard`, bench mode).

## 0. Guards
Only `src/web/`, `src/extras/`, `README.md`, `CHANGELOG.md`, `docs/notes/assumptions.md`,
`docs/spec/acceptance-phase4.md` (new) and new `tests/unit/web-*.test.ts` may change. `src/core`, `src/headless`,
`src/soak`, `src/play`, `src/leaderboard` are read-only (report if they need a change). All existing tests and
the golden guard stay green and unchanged. No new dependencies, no git, `localStorage` only in try/catch. The
bench page mode (`?bench=1`) must keep working and must NOT show any new overlay/subtitle that changes the
measured scene beyond what normal play shows (subtitles are allowed; they are part of the game UI).

## 1. Leaderboard (§3)
- Storage adapter `src/web/leaderboardStore.ts`: `load(): Promise<Entry[]>`, `add(e): Promise<Entry[]>`. Try
  the launcher API (`fetch('/api/leaderboard')`, 1.5 s timeout); if unavailable (static hosting / Release
  folder opened directly), fall back to `localStorage` key `dao-den-long.leaderboard.v1` using `addEntry` from
  `board.ts`. Remember which backend works for the session. Unit-test the localStorage path with a fake storage.
- When: after the Bình Minh screen (Night 3 won) and after ANY lost night, show "Lưu điểm" with a name input
  (validated live with `validateName`, error text shown in danger colour, Enter submits, a "Bỏ qua" button).
  The entry: `name`, `score` = total of nights won in this run (`totalScore(flow)`), `nights_won` = number of
  distinct nights won this run (0–3), `achieved_at = isoWithOffset(new Date())`, `seed` = the run seed.
  Save once per run end (no double submit); then show the board with the new entry highlighted.
- Main menu gets "Bảng xếp hạng": table rank / tên / điểm / số Đêm thắng / thời gian (local, `dd/MM/yyyy
  HH:mm`), top 10, empty state "Chưa có ai — hãy là người đầu tiên!".
- Unit tests: run-end → entry fields (nights_won counting with a replayed night), double-submit guard.

## 2. Key remapping (§4)
- `src/web/keymap.ts` (pure): actions `up, down, left, right, jump, dash, interact, pulse, pause` with defaults
  W/S/A/D (arrows stay as fixed secondary keys for movement), Space, ShiftLeft, KeyE, KeyF, KeyP (Esc is a fixed
  secondary pause key and also closes menus). `findConflicts(map)` → list of `{code, actions[]}` when a code is
  bound to 2+ actions; `rebind(map, action, code)`; `DEFAULT_KEYMAP`; stored inside settings
  (`settings.keys`, keep `SETTINGS_KEY`, migrate missing → defaults). Reserved codes that cannot be bound:
  Escape, KeyR, KeyC, KeyH, BracketLeft, BracketRight (show a message if tried).
- Settings screen section "Phím điều khiển": one row per action with the current key name and a "Đổi" button
  → "Nhấn phím mới… (Esc để huỷ)". Conflicts are shown immediately in danger colour on BOTH rows with the text
  "Trùng phím với …"; the change is still saved (the user resolves it), and while a conflict exists a banner in
  settings says so. "Khôi phục mặc định" resets keys only. Saved with the other settings.
- `main.ts` `buildInput()` reads the keymap instead of hard-coded codes. Unit tests for keymap (defaults,
  rebind, conflicts, reserved, migration).

## 3. Subtitles / visual cues (§4)
A caption line (bottom-centre above the mote bar, ≥ 18 px, dark backdrop) and cues, each ≤ 1 line, newest first,
max 3, each shown 3 s:
- shade appears (`shade_spawned`): "Bóng Mực xuất hiện" + an edge arrow (reuse `edgeArrow`) pointing to that
  shade for 3 s while it is off-screen;
- wind coming (`state.wind.warning` turns on): "Gió mạnh sắp tới!" (+ the existing warning text);
- last 10 s (`timeLeftS ≤ 10`, once per night): "10 giây cuối!";
- lantern fuel < 30 (crossing from ≥ 30 to < 30, per lantern): "Đèn L2 sắp cạn dầu";
- also: drifter steal "Gió Lạc cướp 3 đom đóm", lantern out "Đèn L1 đã tắt".
A setting "Phụ đề" (default ON). Pure `captionsFor(prevState-summary, events, state)` unit-tested.

## 4. Reduced motion (§4)
Setting "Giảm chuyển động" (default OFF). When ON: no camera shake (if `render.ts` has any shake/bob, gate it;
if there is none, note that in the report), no red hit flash (`#flash`), no clock blink (steady danger
colour), no lantern blink (use a steady outline/colour change instead), leaf particles slowed to 30 %.

## 5. Font size (§4)
At 1280×720 every UI text is ≥ 18 px: raise all `font-size` below 18 px in `index.html`/screens (HUD night
label, mote cap, cooldown key labels, help line, hints, fps counter) to ≥ 18 px, adjusting layout so nothing
overlaps. Setting "Chữ lớn (×1.25)": a CSS variable `--ui-scale` (1 or 1.25) multiplies every font size.
Add a unit-ish check: a test that parses `src/web/index.html` `<style>` and fails on any `font-size` or `font:`
below 18px (px values only).

## 6. Docs
CHANGELOG phase-4 section (web items), README controls/settings/leaderboard/accessibility sections, assumptions
(Phase 4 web), `docs/spec/acceptance-phase4.md`: every Ticket-04 requirement → how it is checked (test name,
command, or "kiểm tra tay: …").

## 7. Definition of done
`npm run build`; `npm test` (counts, list new tests); list changed files; what you could not verify visually.
