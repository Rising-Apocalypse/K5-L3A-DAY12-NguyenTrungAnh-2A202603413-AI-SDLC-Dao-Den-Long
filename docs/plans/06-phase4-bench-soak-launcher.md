# Plan 06 — Phase 4 (Ticket-04) part 1: Contract v1.3, bench, soak, launcher + on-disk leaderboard

Author: Claude Opus 5.5. Implementer: Sonnet (medium). Spec: `docs/spec/ticket-04.md`. Part 2 (leaderboard UI,
accessibility) is Plan 07 — do not build those screens here (only the bench page mode in `src/web`).

## 0. Guards
- Night 1–3 gameplay and headless output must not change: `tests/guards/night1-golden.test.ts` stays green and
  untouched; every existing test stays green and unchanged except the ones that assert `contract_version` `'1.2'`
  (→ `'1.3'`), each logged in `CHANGELOG.md` "Tests updated (phase-4)".
- **No new npm dependencies.** The bench drives the user's installed Chrome/Chromium/Edge with `child_process`.
- No `Math.random`/`Date`/`performance.now` in `src/core`. No git commands. Do not edit `docs/plans/`,
  `docs/adr/`, `docs/notes/ai-log.md`, `docs/spec/ticket-0*.md`, `tests/golden/`, `.claude/settings.json`,
  `scripts/hooks/`, `.github/`.

## 1. Contract v1.3
`game.contract.json`: `"contract_version": "1.3"`, `"run_cmd": "node dist/play.js"`,
`"bench_cmd": "node scripts/bench.mjs"`, `"soak_cmd": "node --expose-gc dist/soak.js"` (tuning unchanged).
`package.json`: `"play": "node dist/play.js"`, `"bench": "node scripts/bench.mjs"`,
`"soak": "node --expose-gc dist/soak.js"`. `scripts/build-headless.mjs` also bundles `src/soak/cli.ts` →
`dist/soak.js` and `src/play/cli.ts` → `dist/play.js` (same esbuild options). Why `node …` and not `npm run …`:
the grader appends flags (`<run_cmd> --export-leaderboard out.json`), and npm would eat flags without `--`.

## 2. Core bench mode (`src/core`, gated, default off)
`CreateGameOptions.bench?: boolean`. When true (Night 1 only; throw otherwise):
- Build state normally for Night 1, then: L1, L2, L3 lit with `fuelUnits = full` (`everLit` true); no other
  lanterns lit; player at (0,0,0); **exactly 200 shades** `S1..S200` in state `wander`, and **exactly 100 random
  motes** `M1..M100` (bench may exceed the gameplay cap), placed with `new Rng(seed, 'bench')`:
  uniform over the island disc `r = 38 × sqrt(u)`, angle `2π v`, rejecting points inside a lit safe zone
  (re-draw) — shades at y = 1.0, motes at y = 0.
- Disabled while `bench`: scheduled spawns (motes, shades, drifters), shade hits (stage 9 returns), pickup
  (stage 4 returns), fuel decay and drain (stage 2 fuel part skipped), the time counter and stage 11 (the night
  never ends; `timeLeftS` stays at its start value). Shades still move by the normal wander/chase rules (Mây is
  at the origin and standing still; chase may happen — that is "the normal rules").
- Unit tests: 200 shades all `wander` at build, 100 motes, L1–L3 fuel 100; after 600 steps with default input:
  no `shade_spawned`/`player_hit`/`mote_picked`/`game_over` events, fuel still 100, still `playing`, 200 shades,
  100 motes; same seed → identical snapshot; `bench` with night 2 throws.

## 3. Soak (`src/soak/cli.ts` → `dist/soak.js`)
`node --expose-gc dist/soak.js --seed 7 --nights 10 --out soak.json` (flags in any order; same error style as
headless: usage error exit 1, bad values exit 1).
- One process. For i = 1..nights: night = `((i − 1) % 3) + 1`, seed = `seed + i` [assumption: "Đêm thứ i" is
  1-based], `createGame({ seed, night })` with the default scenario and no extras.
- Inputs: `const rng = new Rng(seed + i, 'soak')`; every 30 ticks (tick 0, 30, …) pick
  `angle = rng.range(0, 2π)` → `move = [cos, sin]`; every tick, in this order: `jump = rng.next() < 0.05`,
  `dash = rng.next() < 0.03`, `pulse = rng.next() < 0.02`, `interact = rng.next() < 0.10`; `pause` false,
  `camYawDeg` 0.
- Run until `state !== 'playing'` or `night duration × 60` steps. Result per night: `'won'` | `'lost'`
  (`'playing'` at the time limit can't happen because stage 11 ends the night at dawn; if it does, record
  `'timeout'`). A thrown error inside a night → `crashes += 1`, result `'crash'`, continue with the next night.
- `mem_start_mb` = RSS (MB, 1 decimal) right after the FIRST night's `createGame` (call `global.gc?.()` first);
  `mem_end_mb` = RSS after the LAST night finished and its game reference was dropped (`game = null`,
  `global.gc?.()`). `duration_s` = wall time of the whole loop (1 decimal; `Date.now()` is fine here, this is
  not core). Output exactly `{"nights", "crashes", "results", "mem_start_mb", "mem_end_mb", "duration_s"}`
  (+ `"contract_version": "1.3"` first). Print a one-line summary and whether the thresholds pass
  (`crashes = 0`, `mem_end ≤ 1.2 × mem_start`); exit 0 even if a threshold fails (the file is the evidence),
  exit 1 only on usage errors.
- CLI tests: writes valid JSON with 10 results, crashes 0, nights cycling 1/2/3 (check via a `--verbose` that
  prints per-night `night seed result ticks`), deterministic results for the same seed, `--nights 0` → exit 1.

## 4. Leaderboard core (`src/leaderboard/board.ts`, pure, shared by web and launcher)
```ts
export interface Entry { name: string; score: number; nights_won: number; achieved_at: string; seed: number }
export function validateName(raw: string): { ok: true; name: string } | { ok: false; reason: string }
export function addEntry(entries: Entry[], e: Entry): Entry[]   // returns new top-10 list
export function sortEntries(entries: Entry[]): Entry[]
export function isoWithOffset(d: Date): string                    // e.g. 2026-11-20T21:05:07+07:00
export function parseBoard(json: unknown): Entry[]                 // tolerant: drops invalid entries
```
- Name: trim, NFC-normalise; valid if 3–12 characters and every char matches `[\p{L}\p{M}\p{N}_]` (ASCII
  `[A-Za-z0-9_]` plus Vietnamese with diacritics — the ticket's bonus); count characters after NFC with
  `[...name].length`. Reasons in Vietnamese ("Tên cần 3–12 ký tự", "Chỉ dùng chữ, số và _").
- Sort: score desc; tie → earlier `achieved_at` first (compare as `Date.parse`); a further tie keeps insertion
  order (stable). Keep top 10. `nights_won` integer 0–3, score integer ≥ 0.
- Unit tests for all of the above (boundaries 2/3/12/13 chars, `Mây_01`, `Đăng`, spaces, emoji rejected, tie
  order, 11th entry dropped, ISO offset format for a fixed Date with a mocked offset).

## 5. Launcher (`src/play/cli.ts` → `dist/play.js`) — node built-ins only
- Default: serve `dist/web` (resolve relative to `dist/play.js`) with `node:http` on `127.0.0.1`, port 4173 or
  the next free one (try up to 4183), correct MIME types for html/js/css/json/png/svg/wasm, and open the
  browser (`open` on macOS, `start ""` on Windows via `cmd /c`, `xdg-open` on Linux; `--no-open` skips it).
  Print the URL. If `dist/web/index.html` is missing → message "run npm run build first", exit 1.
- Leaderboard API on the same server: `GET /api/leaderboard` → `{"entries": [...]}`; `POST /api/leaderboard`
  with an `Entry` (validated with `board.ts`, `achieved_at` must parse) → saves and returns the new list.
  Storage file: `<repo or release folder>/data/leaderboard.json` (folder created on demand; path printed at
  start; `data/` is git-ignored). Write atomically (write temp + rename).
- `node dist/play.js --export-leaderboard out.json` → reads the storage file (missing → empty), writes
  `{"entries": [...]}` sorted with `sortEntries`, prints the count, exits 0 WITHOUT starting the server.
  `--leaderboard-file <path>` overrides the storage path (used by tests).
- Tests: export with no file → `{"entries": []}`; seed a file with 12 unsorted entries → export has the 10
  correct ones in order; start the server with `--no-open` on a free port in a child process, POST two entries,
  GET returns them sorted, then export matches; invalid POST → 400.

## 6. Web bench mode (`src/web/bench.ts` + a small branch at the top of `main.ts`)
URL `?bench=1&seed=42&duration=30` (served by the bench driver). In bench mode: skip menus/flow/extras/audio,
`createGame({ seed, night: 1, bench: true })`, the normal renderer with all lights/effects and the HUD as in play.
- Camera: position `(30 cos θ, 15, 30 sin θ)` with `θ = 2π · t / 15` (t = seconds since the first bench
  frame, so it starts at (30,15,0)), `lookAt(0,0,0)` — same angle convention as the map (90° → +Z). Add a
  `renderer.setCamera(pos, target)` override in `render.ts` used only by bench (the follow camera is skipped).
- Sim: fixed 60 Hz steps from real time as in play (default input).
- Timing: record `dt` of every `requestAnimationFrame` frame from timestamps. First 3 s = warm-up (not
  recorded). Then record exactly `duration` seconds. Compute in a pure `benchStats(dts)` (unit-tested):
  `frames = N`, `avg_fps = 1000·N/Σdt`, `p1_low_fps = 1000 / mean(k largest dt)` with `k = max(1,
  ceil(0.01·N))`, `frame_ms_p95` = 95th percentile by nearest-rank (`sorted[ceil(0.95·N) − 1]`), 1 decimal each.
- Report: `POST /bench-result` to the driver with `{ stats, firstFrameEpochMs, renderer: <WebGL UNMASKED
  renderer string + three.js REVISION>, userAgent }`, then show "Bench xong" on screen.

## 7. Bench driver (`scripts/bench.mjs`, node built-ins only)
`node scripts/bench.mjs --seed 42 --duration 30 --out bench.json` (defaults seed 42, duration 30).
1. `t0 = Date.now()` at the very top. Require `dist/web/index.html` (else "run npm run build", exit 1).
2. Start an in-process static server for `dist/web` on a free port, with the `POST /bench-result` endpoint.
3. Find a browser: `$CHROME_PATH`, else macOS `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
   Chromium, Microsoft Edge; Linux `google-chrome`, `google-chrome-stable`, `chromium`, `chromium-browser`,
   `microsoft-edge` on PATH; Windows Program Files paths for Chrome and Edge. None → clear error, exit 1.
4. Spawn it with a fresh temp `--user-data-dir`, `--no-first-run --no-default-browser-check
   --window-size=1280,720 --window-position=0,0 --disable-gpu-vsync --disable-frame-rate-limit
   --disable-background-timer-throttling --disable-renderer-backgrounding --app=<url>` (headed, not
   fullscreen, not headless).
5. While waiting, every 500 ms sample the RSS of the browser process tree (POSIX: `ps -A -o pid=,ppid=,rss=`,
   sum the launched pid and all descendants; Windows: `null` + reason) and keep the max during the measured
   window only (start sampling at warm-up end = firstFrame + 3 s).
6. On the result: `load_ms = firstFrameEpochMs − t0`; write `bench.json` with exactly the Ticket-04 keys:
   `contract_version "1.3", avg_fps, p1_low_fps, frame_ms_p95, frames, load_ms, peak_mem_mb (1 decimal or
   null), vsync_off: true` (the flags were passed — README explains it is requested, not guaranteed),
   `renderer`, `os` (`${os.type()} ${os.release()} ${os.arch()}`, CPU model, total RAM GB). Kill the browser
   tree, stop the server, print a summary with the thresholds (avg ≥ 60, p1 ≥ 30, load ≤ 10000), exit 0.
   Timeout (warm-up + duration + 60 s) → kill, write nothing, exit 1.
- Tests for the driver itself: only the pure helpers (argument parsing, browser path candidates per platform,
  RSS tree sum from a fake `ps` output). Do not launch a browser in `npm test`.

## 8. Docs
- `CHANGELOG.md`: add `## [phase-4] Contract v1.3` (bench, soak, launcher, leaderboard storage/export,
  `run_cmd` change) and **add the missing `## [phase-1] Contract v1.0` section** (reconstruct from
  `docs/plans/01-phase1-gameplay.md` and `git log` up to tag `phase-1`) so all 4 phases have one.
- `README.md`: system requirements (Node ≥ 20, Chrome/Chromium/Edge for bench, any WebGL2 browser to play),
  install + run in ≤ 3 commands (`npm ci`, `npm run build`, `npm run play`), sections "Bench" and "Soak" with
  the exact commands, the threshold table and what `vsync_off` means; leaderboard storage path and export.
- `docs/notes/assumptions.md`: `## Phase 4` (soak seed numbering, bench placement, vsync flags, peak memory of
  the browser process tree, port fallback, name charset).
- `.gitignore`: `data/`, `bench-*.json` scratch only if you create any; do NOT ignore `bench.json`/`soak.json`
  at the repo root (they will be committed by the reviewer).
- `AGENTS.md`: one line each for bench/soak/play commands.

## 9. Definition of done (paste REAL outputs)
`npm run build`; `npm test` (counts, golden 5/5); `node --expose-gc dist/soak.js --seed 7 --nights 10 --out
soak.json` (print the file); `node dist/play.js --export-leaderboard /tmp/x.json` (print);
**do not run the bench driver** (it opens a window; the reviewer runs it). `git status --short` is not allowed;
list the files you changed instead.
