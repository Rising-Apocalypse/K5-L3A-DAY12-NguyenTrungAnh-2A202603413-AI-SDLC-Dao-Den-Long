# Plan 02 — Phase 2 core: Contract v1.1 for Night 1 (dash, pause, charms, new output fields)

Author: Claude Opus 5.5 (planner/reviewer). Implementer: Gemini (via `agy`).
**Follow this file literally. Do exactly the edits listed, in the files listed. Do not refactor, rename,
reformat, or "improve" anything else.** If something here seems wrong, STOP and write the problem in your
final report instead of inventing a fix.

## 0. Scope decision (already made by the human — do not change it)

Ticket-02 (Phase 2) is large. The human decided: implement only the **headless core of Contract v1.1 for
Night 1**. Explicitly OUT OF SCOPE (do not implement, do not stub in output): Night 2, Night 3, bounce pads,
bridges, tiers, wind, Gió Lạc (drifters) behaviour, menus, intro screens, settings, audio, full HUD redesign,
colour-blind mode. `--night 2` and `--night 3` keep failing with exit code 1 (already the case).

## 1. Ground rules

- Work only inside the repo root (your current directory). Never run `git add`, `git commit`, `git push`,
  `git checkout`, `git reset`, `git stash`, or delete files outside the list below.
- Never edit: `docs/spec/**`, `docs/plans/**`, `docs/notes/ai-log.md`, `docs/proof/**` (generated),
  `.claude/**`, `.github/**`, `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`,
  `vitest.config.ts`.
- Never install packages.
- `src/core/**` must stay pure: no `Math.random`, `Date`, `performance.now`, no `fs`, no `three`, no imports
  from `src/web`, `src/extras`, `src/headless`. `tests/guards/architecture.test.ts` enforces this.
- All randomness only through `Rng` streams (none are needed in this plan).
- After EVERY numbered step in section 4, run `npm test`. If it fails, fix your change (not the test) unless
  the step explicitly says to change that test.
- Never weaken an existing assertion unless a step below names that exact test. Never use `.skip`/`.todo`.

## 2. Exact rules to implement (Ticket-02 standard rules relevant to Night 1)

All times are integer tick counters (60 ticks = 1 s).

### 2.1 Dash
- Tuning keys (add to `game.contract.json`): `dash_speed: 14.0`, `dash_duration_s: 0.2` (= 12 ticks),
  `dash_cooldown_s: 1.5` (= 90 ticks).
- Triggers on the `dash` button rising edge (false→true), only if: not in fall-wait, not already dashing,
  and `dashCooldownTicks === 0` (or the charm is active, see 2.3).
- Direction: the current world move direction `worldMove(input.move, input.camYawDeg)` if its length > 0,
  else `player.facing`. Normalise to length 1.
- For 12 ticks (`dashTicks`): horizontal velocity = direction × 14.0 (input move is ignored), vertical
  velocity = 0 and **no gravity** (a dash in the air keeps its height), `grounded` unchanged. Not invulnerable.
- Cooldown: `dashCooldownTicks = 90` set **at the moment the dash starts** (counts down from the start).
- Event `dash` with data `{}`, written at the step the dash starts.
- When the 12 ticks end, normal movement resumes next tick (gravity again if airborne).

### 2.2 Pause
- `pause` button rising edge toggles pause.
- Stage 1 (before anything else in `step`): compute edges. If not paused and pause edge → set paused, push
  event `paused {}`, and **end the step here** (after updating `prevButtons`). If paused and pause edge →
  clear paused, push event `resumed {}`, then **continue the normal step in the same tick**. If paused and no
  pause edge → end the step here (after updating `prevButtons`).
- While paused: `tick` still increases by 1 per step, but `simTick`, time left, every counter, spawns, TTLs,
  and all movement stand still. No other events.
- Snapshot `state` is `"paused"` while paused (the game status itself stays `playing` internally).
- `time_left_s` is computed from `simTick`, so it does not change while paused.
- The headless CLI loop does NOT stop because of pause (only `won`/`lost` stop it).

### 2.3 Bùa Gió (wind charm)
- Night 1 has **no default charms**. Charms only exist if the scenario lists them (field `charms`).
- Pickup in stage 4 together with motes: XZ distance ≤ `pickup_radius` (1.0) and
  `|player.y − charm.pos.y| ≤ 1.5`, charm `available`, not in fall-wait. Charms ignore carry capacity.
- On pickup: `charmTicks = 600` (re-picking refreshes to 600), charm becomes unavailable with
  `respawnTicks = 2700`; event `charm_picked {charm_id, charm_ticks: 600}`.
- Charm active (`charmTicks > 0`): run speed 7.2 m/s instead of `player_speed` (constant `CHARM_RUN_SPEED`
  in rules.ts), and the dash has **no cooldown** (still needs a new button press; a press while a dash is
  running is ignored; the dash itself is still 14 m/s for 12 ticks).
- Stage 2 counts down `charmTicks` and each unavailable charm's `respawnTicks`; when it reaches 0 the charm
  is `available` again.

### 2.4 Fall event gains `lost`
`player_hit` for a fall becomes `{by: "fall", flames, dropped: 0, lost: n}` where `n` = motes lost.
(Phase 1 put `n` in `dropped`; v1.1 adds `lost`, and nothing is dropped on the ground when falling.)
Shade hits keep `{by: "shade", flames, dropped}` with no `lost` key.

### 2.5 night_start
Event `night_start {night: 1}` written at the **first step** (tick 1) of a run, before any other event of
that step. (Building the scenario still emits nothing.) If the run is paused on step 1, still emit
`night_start` first, then `paused`.

## 3. Output and input formats (Contract v1.1)

### 3.1 `game.contract.json`
- `"contract_version": "1.1"`.
- Add to `tuning` (after `fall_enabled`, before `score`), exactly:
  `"dash_speed": 14.0, "dash_duration_s": 0.2, "dash_cooldown_s": 1.5, "night2_duration_s": 330, "night3_duration_s": 360`.
- All other values stay as they are (they already equal the Ticket-02 standard numbers).

### 3.2 Snapshot (exact key order)
```
type, tick, sim_tick, night, state, time_left_s, score, wind,
player{pos, vel, grounded, flames, carried, invuln, dash_cd_s, pulse_cd_s, charm_s},
lanterns[{id, pos, lit, deposited}],
shades[{id, pos, state}],
motes_active,
motes[{id, pos, kind, ttl_s}],
drifters[],
charms[{id, available, respawn_s}]
```
- `night`: `1`. `wind`: `{"active": false, "dir_deg": 0}` (Night 1 has no wind).
- `state`: `"paused"` while paused, else the game status.
- `player.vel`: velocity rounded 3 decimals. `player.grounded`: boolean.
- `player.invuln`: **boolean** = invulnTicks > 0 (assumption, record it).
- `dash_cd_s`, `pulse_cd_s`, `charm_s`: remaining ticks / 60, rounded to 3 decimals (0 when idle).
- `motes[].kind`: `"random"` or `"dropped"`. `motes[].ttl_s`: dropped → ttl/60 rounded 3 decimals;
  random → `null`.
- `drifters`: always `[]` (not implemented; record as "chưa đạt").
- `charms[]`: `{id, available, respawn_s}`, `respawn_s` = respawnTicks/60 rounded 3 decimals (0 when available).
- `motes_active` stays.

### 3.3 Inputs
`dash` already exists in `BUTTONS`. Add `pause` to `BUTTONS` in `src/core/types.ts`. Validation (boolean)
then works automatically in `src/core/input.ts`.

### 3.4 Scenario additions (all optional; validate types → `FormatError` = exit 2)
- `player.invuln_ticks`, `player.dash_cd_ticks`, `player.pulse_cd_ticks`, `player.charm_ticks`: integers ≥ 0;
  set the matching counters.
- `shades[].state`: one of `spawning|wander|chase|recoil|stunned`; `shades[].state_ticks_left`: integer ≥ 0.
  Mapping: `spawning` → `spawnTicks`; `stunned` → `stunTicks` (no push); `recoil` → `forcedTicks` with
  `forcedStep` = away from the player at build time (RECOIL_DIST/RECOIL_TICKS per tick);
  `wander`/`chase` ignore ticks. Default state when absent: `wander` (unchanged).
- `charms`: array of `{id: string (non-empty, unique), pos: Vec3, available?: boolean (default true),
  respawn_ticks?: integer ≥ 0 (default 0)}`. Replaces the (empty) default list.
- `drifters`: array, validated only as "array of objects with `pos` Vec3"; then ignored (not simulated).
- `random_drifters`, `wind_enabled`: booleans; validated, then ignored on Night 1.

## 4. Step-by-step edits (do them in this order)

### Step 1 — `game.contract.json`
Edit as in 3.1.

### Step 2 — `src/core/tuning.ts`
- Add `dash_speed`, `dash_duration_s`, `dash_cooldown_s`, `night2_duration_s`, `night3_duration_s` to the
  `Tuning` interface (readonly number) and to the `NUMBER_KEYS` array (append at the end of the array).
- Nothing else.

### Step 3 — `tests/unit/tuning.test.ts`
- Line with `expect(contract.contract_version).toBe('1.0')` → `'1.1'`.
- If a test lists the exact tuning keys, add the 5 new keys. Do not change any other assertion.

### Step 4 — `src/core/rules.ts`
Append a new section at the end of the file:
```ts
// --- Phase 2 (Contract v1.1) ---------------------------------------------------------------------------------
/** Run speed while the wind charm is active. */
export const CHARM_RUN_SPEED = 7.2;
/** Charm effect duration, and the time until a picked charm is available again. */
export const CHARM_TICKS = 600;
export const CHARM_RESPAWN_TICKS = 2700;
/** Charm pickup needs |player.y - charm.y| <= this (XZ distance uses tuning.pickup_radius). */
export const CHARM_PICKUP_MAX_DY = 1.5;
```

### Step 5 — `src/core/types.ts`
- `BUTTONS` → `['jump', 'interact', 'pulse', 'dash', 'pause'] as const`.
- `PlayerState`: add `dashTicks: number;` (ticks left of the running dash), `dashCooldownTicks: number;`,
  `dashDir: [number, number];`, `charmTicks: number;`.
- Add `export interface CharmState { id: string; pos: Vec3; available: boolean; respawnTicks: number; }`.
- `MoteState`: add `kind: 'random' | 'dropped';`.
- `GameState`: add `night: number;`, `paused: boolean;`, `charms: CharmState[];`.
- `GameEvent` union: add
  `| { name: 'dash'; data: Record<string, never> }`
  `| { name: 'charm_picked'; data: { charm_id: string; charm_ticks: number } }`
  `| { name: 'night_start'; data: { night: number } }`
  `| { name: 'paused'; data: Record<string, never> }`
  `| { name: 'resumed'; data: Record<string, never> }`
  and change the `player_hit` member to
  `{ name: 'player_hit'; data: { by: 'shade'; flames: number; dropped: number } | { by: 'fall'; flames: number; dropped: number; lost: number } }`.
- `Snapshot`: rewrite to the exact key order of 3.2 (types: `night: number; state: GameStatus | 'paused';
  wind: { active: boolean; dir_deg: number }; player: { pos: Vec3; vel: Vec3; grounded: boolean; flames:
  number; carried: number; invuln: boolean; dash_cd_s: number; pulse_cd_s: number; charm_s: number };
  motes: { id: string; pos: Vec3; kind: 'random' | 'dropped'; ttl_s: number | null }[]; drifters: never[];
  charms: { id: string; available: boolean; respawn_s: number }[]`).
- `prevButtons` type `Buttons` now includes `pause` automatically.

### Step 6 — `src/core/scenario.ts`
- Extend `Scenario`:
  `player?: { pos?; carried?; flames?; invulnTicks?: number; dashCdTicks?: number; pulseCdTicks?: number; charmTicks?: number }`,
  `shades?: { pos: Vec3; id?: string; state?: ShadeStateName; stateTicksLeft?: number }[]`,
  `charms?: { id: string; pos: Vec3; available: boolean; respawnTicks: number }[]`,
  `drifters?: { pos: Vec3 }[]`, `randomDrifters?: boolean`, `windEnabled?: boolean`.
  (import `ShadeStateName` type from `./types`.)
- In `parseScenario`, inside the `player` block add the 4 `count(...)` fields reading `invuln_ticks`,
  `dash_cd_ticks`, `pulse_cd_ticks`, `charm_ticks`.
- In the `shades` map: if `s.state !== undefined`, require it to be one of the 5 names else
  `FormatError(\`scenario: shades[${i}].state ...\`)`; if `s.state_ticks_left !== undefined` use `count(...)`.
- Add parsing for `charms` (unique ids, `vec3` pos, `bool` available default true, `count` respawn_ticks
  default 0), `drifters` (`list` of records with `vec3` pos), `random_drifters` and `wind_enabled` (`bool`).
- Add tests for each new field (valid + one invalid → `FormatError`) in `tests/unit/scenario.test.ts`.

### Step 7 — `src/core/sim.ts`
Make these edits and no others:
1. `newShade(...)`: unchanged. `assignShades`: after creating the shade, apply `state`/`stateTicksLeft`
   per 3.4 (needs the player start position for the recoil direction: pass `playerPos` as a parameter).
2. `buildState`: 
   - motes from `buildMotes` and from `scenario.motes` get `kind: 'random'` (update `buildMotes` in
     `level.ts` to set `kind: 'random'`).
   - player gets `dashTicks: 0`, `dashCooldownTicks: scenario.player?.dashCdTicks ?? 0`, `dashDir: [0, 1]`,
     `charmTicks: scenario.player?.charmTicks ?? 0`, `invulnTicks: scenario.player?.invulnTicks ?? 0`,
     `pulseCooldownTicks: scenario.player?.pulseCdTicks ?? 0`.
   - state gets `night: 1`, `paused: false`, `charms: (scenario.charms ?? []).map(c => ({ id: c.id, pos: copy(c.pos), available: c.available, respawnTicks: c.available ? 0 : c.respawnTicks }))`.
   - `prevButtons` gets `pause: false`.
3. `stageCounters`: also decrement `p.dashCooldownTicks`, `p.charmTicks` (if > 0), and for each charm with
   `!available`: `respawnTicks -= 1`; at 0 → `available = true`. Do NOT decrement `dashTicks` here (it is
   consumed in movement).
4. `stageMovePlayer`: after the `respawn` block and before computing `worldMove`:
   - compute `const [dx, dz] = worldMove(...)` once (move the existing line up).
   - Dash start: `const canDash = p.charmTicks > 0 || p.dashCooldownTicks === 0;` if `c.edges.dash &&
     p.dashTicks === 0 && canDash`: direction = (dx,dz) normalised if length > 0 else `p.facing`;
     `p.dashDir = dir; p.dashTicks = toTicks(tuning.dash_duration_s); p.dashCooldownTicks =
     toTicks(tuning.dash_cooldown_s); c.events.push({ name: 'dash', data: {} });`
   - If `p.dashTicks > 0`: `p.vel = [dashDir[0]*dash_speed, 0, dashDir[1]*dash_speed]`, `pos += vel*DT`
     (x and z only), `p.dashTicks -= 1`, then run ONLY the "walked off the edge" grounded update
     (`if (p.grounded && !isOverIsland(p.pos)) p.grounded = false;`) — skip jump and gravity this tick —
     then the existing fall check (`FALL_Y`) and return.
   - Otherwise the existing code, but the run speed is
     `const speed = p.charmTicks > 0 ? CHARM_RUN_SPEED : tuning.player_speed;`.
   - The fall event: change to `{ by: 'fall', flames: p.flames, dropped: 0, lost }`. A fall also cancels a
     running dash (`p.dashTicks = 0`).
5. `stagePickup`: after the motes loop (but not inside the capacity `return` — restructure so the capacity
   check only skips motes), loop charms in ascending id: if `available` and in reach (2.3) → pick up as in 2.3.
6. Dropped motes created in `stageHits` get `kind: 'dropped'`; random spawns in `spawnMote` get `kind: 'random'`.
7. Pause + night_start in `step()`:
   ```ts
   const edges = risingEdges(state.prevButtons, input);
   const events: GameEvent[] = [];
   if (state.tick === 0) events.push({ name: 'night_start', data: { night: state.night } });
   state.tick += 1;
   if (edges.pause) {
     state.paused = !state.paused;
     events.push({ name: state.paused ? 'paused' : 'resumed', data: {} });
   }
   if (state.paused) { state.prevButtons = { ...buttons of input }; return events; }
   state.simTick += 1;
   state.timeLeftS = startTimeS - state.simTick / TICK_RATE;
   ```
   then build `c` with `events` (reuse the same array) and `edges`, run the stages as before.
   `prevButtons` must copy all 5 buttons (`jump, interact, pulse, dash, pause`).
   Keep `if (state.state !== 'playing') return [];` at the very top.
8. `snapshot()`: produce the exact key order of 3.2. `state: state.paused ? 'paused' : state.state`.

### Step 8 — `src/core/level.ts`
`buildMotes`: add `kind: 'random'` to each returned mote. Nothing else.

### Step 9 — `src/headless/cli.ts`
No logic change needed (it stops only when `state.state !== 'playing'`, which pause never sets). Verify.

### Step 10 — existing tests that must change (ONLY these kinds of edits)
Run `npm test`. Expected breakages and the ONLY allowed fixes:
- Tests asserting the exact snapshot keys/shape → update to the 3.2 shape.
- Tests asserting the fall event `dropped: n` → change to `dropped: 0, lost: n`.
- Tests asserting the exact event list of a run (e.g. "no events", `events.length === k`) → account for the
  extra `night_start` at tick 1 (prefer filtering it out with `.filter(e => e.name !== 'night_start')`).
- Tests asserting `contract_version` → `'1.1'`.
For every test you change, add one line to `CHANGELOG.md` (step 12) under "Tests updated" saying which
test and why. Any other failing test = a bug in your code: fix the code.

### Step 11 — new tests + scenario fixtures (`tests/cli/gameplay.test.ts`, new `describe('phase 2 (v1.1)')`)
Use the existing helpers in `tests/helpers/cli.ts`. Compute expected numbers from `TUNING` / rules constants.
Create fixture folders under `tests/scenarios/` too (scenario.json + inputs.json) for each:
1. `dash-ground`: player at origin, `move [0,1]` held, `dash` pressed at tick 10 → event `dash` at tick 11;
   between the dash start and 12 ticks later z advances by 14×12/60 = 2.8 m (plus normal 6 m/s walking
   outside the dash); a second press at tick 30 (cooldown left) → no event; a press at tick 100 → event.
2. `dash-air`: jump at tick 0, dash at tick 10 → y stays constant during the 12 dash ticks.
3. `dash-idle-facing`: no move, dash → moves along facing (+Z initially).
4. `pause`: pause at tick 10 (true), release at 11, pause again at 70, release at 71 → events `paused` at 11,
   `resumed` at 71; `sim_tick` at tick 70 snapshot equals 10; snapshot `state` is `"paused"` between; the
   player (moving +Z) does not move while paused; `time_left_s` frozen.
5. `charm`: scenario `charms: [{id:"C1", pos:[0,0,3]}]`, walk +Z → `charm_picked {charm_id:"C1", charm_ticks:600}`;
   speed afterwards 7.2 m/s (check displacement over 60 ticks = 7.2); dash twice within 90 ticks → both
   emit `dash`; snapshot `charms[0].available === false`, `respawn_s` ≈ 45 right after pickup.
6. `fall-lost`: existing fall scenario variant with carried 4 → `{by:'fall', flames, dropped:0, lost:4}`.
7. `snapshot-v1.1`: tick-0 snapshot has every key of 3.2 in that order (`Object.keys`), `wind` =
   `{active:false, dir_deg:0}`, `drifters` = `[]`, `motes[0].kind === 'random'`, `ttl_s === null`;
   a dropped mote after a hit has `kind 'dropped'` and `ttl_s` 8 (480/60) right after the hit.
8. `night-start`: first event of any run is `night_start {night:1}` at tick 1.
9. `scenario-v1.1`: shade with `state:"stunned", state_ticks_left: 30` → snapshot state `stunned` until
   tick 30, `wander`/`chase` after; player `invuln_ticks: 60` → no hit from an adjacent shade before tick 60.

### Step 12 — docs (Vietnamese text, keep it short)
- Create `CHANGELOG.md` at repo root with:
  `## [phase-2] Contract v1.1 (Đêm 1)` → sections "Thêm", "Thay đổi phá tương thích" (fall event `dropped`
  → `lost`, `contract_version` 1.1, snapshot shape), "Chưa làm (chưa đạt)" (Đêm 2–3, Gió Lạc, gió, bục nhảy,
  menu/cài đặt/âm thanh/HUD đầy đủ/chế độ màu), "Tests updated".
- `docs/notes/assumptions.md`: add section `## Phase 2 — Contract v1.1` with one line each for: `invuln` is a
  boolean; `ttl_s: null` for random motes; `night_start` at tick 1; pause edge handling; dash direction &
  in-air rule; charm scenario fields; drifters parsed but not simulated.
- `README.md`: controls add `Shift — Lướt`, `P / Esc — Tạm dừng`; add a short "Phạm vi Phase 2" paragraph
  listing what is and is not implemented (same as CHANGELOG "Chưa làm").
- `AGENTS.md`: under "Contract pitfalls" add 2 lines: pause freezes everything but `tick`; snapshot key
  order is fixed (see `docs/plans/02-phase2-core-v1.1.md` §3.2). Keep the file under 45 lines.
- `scripts/verify.mjs`: the phase proof generator currently writes `docs/proof/phase-1.md`. Make it ALSO
  write `docs/proof/phase-2.md` with rows: Dash, Pause, Charm, Fall `lost`, Snapshot v1.1, Scenario v1.1,
  night_start, Regression Phase 1 → mapped to the new `describe` group / fixtures. Copy the existing
  phase-1 generation pattern; do not change the phase-1 rows.

### Step 13 — web (minimal, only `src/web/main.ts` and `src/web/hud.ts`)
- Keyboard: `Shift` → `dash`, `P` and `Escape` → `pause` (as held buttons in the `InputState`).
- HUD: show "Lướt: sẵn sàng / x.x s" from `dash_cd_s`-equivalent state, and a centred "Tạm dừng — P để tiếp
  tục" when `state.paused`.
- Do not add menus, settings or audio.

## 5. Definition of done — run and paste the REAL output tails
1. `npm run build` (must pass, includes `tsc --noEmit`).
2. `npm test` → all green; report counts.
3. `npm run verify` → exit 0; show the first 25 lines of `docs/proof/phase-2.md`.
4. `node dist/headless.js --seed 3 --night 1 --ticks 600 --out out/p2.jsonl && head -c 900 out/p2.jsonl`.
5. Run the same command twice into two files and `cmp` them.
6. `git status --short` (to show which files you touched).

## 6. Final report (English)
Files changed (list), tests changed (and why), any deviation from this plan (should be none), outputs above,
anything you were unsure about.
