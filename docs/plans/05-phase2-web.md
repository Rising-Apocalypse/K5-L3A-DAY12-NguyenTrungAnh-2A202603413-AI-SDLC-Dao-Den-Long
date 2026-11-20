# Plan 05 — finish Phase 2 (Ticket-02 Part 3) on the web: 3-night flow, pause menu, settings, audio, full HUD

Author: Claude Opus 5.5. Implementer: Sonnet (medium). Spec: `docs/spec/ticket-02.md` Part 3 + the Ticket-03
web items still missing. Precondition: Plan 04 is done (`src/core/levels.ts` exists, `createGame({ night })`
works for 1–3, `state.wind`, `state.drifters`).

## 0. Guards
- **Only `src/web/`, `src/extras/`, `index.html`, `README.md`, `CHANGELOG.md`, `docs/spec/acceptance-phase2.md`,
  `docs/notes/assumptions.md` and new `tests/unit/web-*.test.ts` may change.** `src/core/` is read-only for
  this plan (if you think core needs a change, stop and report it). Headless output must not change: the golden
  test and all existing tests stay green unchanged.
- The web may only READ `game.state`; it never writes to it (the creative extra included).
- No new npm dependencies, no asset files: sounds are synthesised with WebAudio, visuals are Three.js primitives.
- `localStorage` only inside try/catch; the game must work when it throws. No git commands.
- Keep logic that can be unit-tested in pure modules (no DOM, no Three) and test them with Vitest (node env).

## 1. Screen flow (`src/web/flow.ts`, pure state machine + `src/web/screens.ts` DOM)
States: `menu` → `intro(n)` → `playing(n)` → `result(n, won)` → `intro(n+1)` …; after winning Night 3 →
`dawn` (total score). Lost → result screen offers "Chơi lại Đêm n" and "Về menu". Total score = sum of the
final scores of nights WON in this run (a replayed night counts once, its winning score). Main menu buttons:
"Bắt đầu" (Night 1), "Chọn Đêm" (1/2/3 — for practice and the demo video), "Cài đặt". Intro shows the island
name (`getLevel(n).islandName`), the night number, duration, lanterns needed (`ceil(0.6 × n_lanterns)`), and one
line from Ông Đăng:
- Đêm 1 (Đảo Bến): "Gió mùa về rồi con ạ. Thắp đèn, giữ lửa cho tới khi gà gáy."
- Đêm 2 (Đảo Cau): "Hai đảo, một cây cầu tre. Coi chừng Gió Lạc, nó thích đom đóm của con lắm."
- Đêm 3 (Đảo Chuông): "Chuông trên đỉnh tháp chờ con. Gió lớn lắm, đứng cho vững."
Enter/Space or a click starts the night. `createGame({ seed, night: n, extras })` per night (seed from `?seed=`).
Unit-test the state machine (transitions, total score, replay).

## 2. Pause menu
The core already pauses on a `pause` rising edge (P / Esc). When `game.state.paused`, show an overlay with
"Tiếp tục" (inject `pause: true` into the next input once, then false), "Chơi lại Đêm", "Cài đặt", "Về menu".
Logic stops completely while paused (it does: only `tick` advances). Keys other than P/Esc are ignored while
paused; audio music ducks to 30 %.

## 3. Settings (`src/web/settings.ts`, pure load/save with an injected storage)
Volume 0–100 (default 70), mouse sensitivity 0.1–1.0 deg/px (default 0.3, used by the camera drag instead of
the constant), colour-blind palette (moves the existing `C` toggle here too; `C` still works). Saved under key
`dao-den-long.settings.v1` as JSON; invalid/missing → defaults. Unit-test load/save/clamp/invalid JSON.

## 4. Audio (`src/web/audio.ts`, WebAudio, created on the first user gesture)
Master gain = volume/100. Night music: a soft looping pad + slow pentatonic arpeggio (oscillators, ~0.25 gain).
Short synthesized SFX (≤ 0.4 s each) for: mote pickup (`mote_picked`), lantern lit (`lantern_lit`), refuel,
pulse, hit (`player_hit`), jump (web-detected: `grounded` true → false with `vel[1] > 0`), dash, win, lose
(`game_over`), shade appears (`shade_spawned`), countdown beep each second of the last 10 s, wind warning
whoosh when `state.wind.warning` turns on, drifter steal. Never throw if AudioContext is unavailable.

## 5. HUD (`src/web/hud.ts` rewrite; layout per Ticket-02)
- Top-left: flames as icons (3). Top-centre: `mm:ss` (pure `formatClock(timeLeftS)`, ceil to whole seconds);
  ≤ 30 s → danger colour and 2 Hz blink. Top-right: lanterns lit `k/n · cần m` and score.
- Bottom-centre: mote bar with `capacity` slots (10–20), filled = carried.
- Bottom-right: dash and pulse cooldown icons with a fill showing the remaining cooldown (charm active → dash
  icon gold, no cooldown).
- Prompt near a lantern (within `interact_radius`, nearest, same rule as the core): unlit →
  "E — Nạp ánh sáng (deposited/needed)"; lit below full → "E — Châm dầu (fuel/100)".
- Off-screen arrow at the screen edge pointing to the nearest unlit lantern when it is outside the view.
- Danger colour `#FF5A5F` (`#FFFFFF` + `⚠` in colour-blind mode), text `#F5F1E6`, gold `#F2C14E`.
- `?fps=1` shows an FPS counter (average over the last 2 s).

## 6. Rendering Nights 2 and 3 (`src/web/render.ts`)
Build the scene from `getLevel(night)`: Night 1 as today; Night 2 two discs r 28 + bamboo bridge
(x 26–44, z −2..2, wood `#6B4A2F`) + 2 pads (glowing discs r 1); Night 3 tier 0 disc r 45, tier 1 half-annulus
(z > 0, r 12–24, top y 3 — `RingGeometry`/extruded shape with `thetaLength = π`), tier 2 disc r 8 top y 6,
two ramps (3 m wide boxes from r 30 y 0 to r 24 y 3 at 30° and 150°), bell tower (cylinder r 2, h 8 on tier 2),
pad at (0,3,13). Lanterns, motes, charms (red `#C8102E` with gold `#F2C14E` rim), drifters (grey-blue
`#8FA3B8` ribbon, faster wobble while chasing, translucent while fleeing). Wind: leaf particles blowing in
`dir_deg` during `warning` (2 s ahead) and the gust. Palette of Ticket-02 for every listed element (±10 %).
Ambient light intensity = `0.15 + 0.55 × lit / total` (smoothly lerped). Unlit lanterns: 0.8 height (exists)
plus a dark diagonal "tear" stripe on the paper (Ticket-03 §6). Keep ≥ 30 FPS at 1280×720: shared
geometries/materials, no per-frame allocation, cap particles at 200.

## 7. Creativity: "Đom đóm dẫn đường" (`src/extras/`, web-only)
Key `H`: for 3 s a trail of ~12 small firefly sprites flows from Mây to the nearest lantern that needs help
(unlit, or lit with fuel < 30; none → the nearest lit lantern). Cooldown 10 s, shown in the HUD. It reads
`game.state` only. Headless never loads `src/extras` (the guard test already checks this). README
"Sáng tạo của tôi": what it is, why (players get lost on the bigger Nights 2–3), proof: the golden Night-1 test
and the architecture guard show headless output is unchanged; how to try it.

## 8. Docs
`CHANGELOG.md` (same "phase-2 hoàn thiện" section: web items), README controls list (H, pause menu, settings),
the "Chưa làm" line removed or reduced to what is really left, `docs/spec/acceptance-phase2.md` web rows filled
with "kiểm tra tay: <steps>", assumptions for the Ông Đăng lines / total score rule.

## 9. Definition of done
`npm run build` (tsc + vite), `npm test` (all green, new web unit tests listed), `git status --short`.
Report what you could not verify visually (the reviewer will play it in a browser).
