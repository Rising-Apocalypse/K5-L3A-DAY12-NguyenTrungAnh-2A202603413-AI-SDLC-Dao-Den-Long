# Plan 04 — finish Phase 2 (Ticket-02) in the headless core: Nights 2 and 3, jump pads, tiers, drifters, wind

Author: Claude Opus 5.5 (planner/reviewer). Implementer: Sonnet (medium). Spec: `docs/spec/ticket-02.md`
(Ticket-02, Contract v1.1) with the Ticket-03 replacements already in the code (Contract v1.2: fuel, dawn win,
durations 240/270/300, capacity). The web part (menus, HUD, audio, settings, drawing Nights 2–3) is **Plan 05**,
not this plan. Do not touch `src/web/` here except the minimum to keep `tsc` green.

## 0. Non-negotiable guards (read first)
1. **Night 1 must not change by one byte.** `tests/guards/night1-golden.test.ts` (written by the planner) runs
   5 full Night 1 nights and compares with `tests/golden/*.jsonl`. It must pass at the end, unchanged. Never
   regenerate or edit anything in `tests/golden/` or that test. If it fails, your Night 1 code path changed:
   fix the code. The way to keep it green: every new behaviour is gated by a **level flag** (§2) that is off
   for Night 1, and Night 1 arithmetic stays in the same order as today.
2. All 262 existing tests must stay green **unchanged**, with ONE allowed exception: tests asserting that
   `--night 2`/`--night 3` is rejected (usage error) — rewrite them to the new behaviour (only `--night 0`, `4`,
   `abc` rejected) and log each in `CHANGELOG.md` under "Tests updated (phase-2 hoàn thiện)".
3. No `Math.random`, `Date`, `performance.now` in `src/core`. New randomness only through two NEW labelled
   streams: `new Rng(seed, 'drifters')` and `new Rng(seed, 'wind')` (labelled streams are independent, so the
   existing streams are not shifted). Never draw from an existing stream in a new place, except where §4 says.
4. No git commands. Do not edit `game.contract.json` values, `docs/plans/`, `docs/adr/`, `docs/notes/ai-log.md`,
   `docs/spec/ticket-0*.md`, `tests/golden/`, `tests/guards/night1-golden.test.ts`, `.claude/`, `scripts/hooks/`,
   `.github/`. No new npm dependencies.

## 1. Constants (put in `src/core/rules.ts` unless noted; level geometry goes in `src/core/level.ts`)
`STEP_UP = 0.35` (max height Mây walks up in one tick; ramps rise ≤ 0.05/tick; tier walls are 3 m),
`STEP_DOWN = 0.35` (grounded Mây snaps down a ramp by up to this), `PAD_RADIUS = 1.0`, `PAD_FOOT_EPS = 0.01`,
`SHADE_SPEED_NIGHT3 = 4.5`, `SHADE_SPAWN_EVERY_N2 = 420`, `SHADE_SPAWN_EVERY_N3 = 360`, `SHADE_MAX_N2 = 8`,
`SHADE_MAX_N3 = 10` (Night 1 keeps `SHADE_SPAWN_EVERY = 480`, `SHADE_MAX = 6`),
`DRIFTER_MAX = 2`, `DRIFTER_SPAWN_EVERY = 1200`, `DRIFTER_SPEED = 7.0`, `DRIFTER_IDLE_SPEED = 2.0`,
`DRIFTER_CHASE_CARRIED = 5`, `DRIFTER_DETECT = 15`, `DRIFTER_HIT_RADIUS = 1.2`, `DRIFTER_STEAL_MAX = 3`,
`DRIFTER_FLEE_TICKS = 240`, `DRIFTER_DROP_VANISH_TICKS = 120`, `DRIFTER_HOVER_Y = 1.0`,
`DRIFTER_IDLE_REPICK_TICKS = 180`, `WIND_EVERY = 1800`, `WIND_TICKS = 300`, `WIND_WARN_TICKS = 120`,
`WIND_SPEED = 2.0`, `TOWER_RADIUS = 2.0`, `TOWER_TOP_Y = 14` (tier 2 at 6 + 8 m tower).

## 2. New module `src/core/levels.ts` (pure data + pure functions)
```ts
export interface JumpPad { center: Vec3; vy: number; vxz: [number, number] } // vxz = horizontal velocity
export interface Level {
  night: 1 | 2 | 3;
  islandName: string;            // 'Đảo Bến' | 'Đảo Cau' | 'Đảo Chuông' (web uses it)
  playerStart: Vec3; playerFacing: [number, number];
  lanternPositions: readonly Vec3[];
  moteSpawnPoints: readonly Vec3[];   // y = ground height of the point
  shadeSpawnPoints: readonly Vec3[];  // y = ground height of the point (shade spawns at y + SHADE_HOVER_Y)
  charmPositions: readonly Vec3[];    // default charms C1.. (scenario `charms` replaces them)
  shadeSpawnEvery: number; shadeMax: number; shadeSpeed: (t: Tuning) => number;
  jumpPads: readonly JumpPad[];
  drifters: boolean; wind: boolean;
  /** Flags that keep Night 1 byte-identical: all false for Night 1, true for Nights 2–3. */
  shadesAvoidVoid: boolean;   // shade XZ moves that would end over void (or inside the tower) are undone
  terrainY: boolean;          // shades/drifters follow ground height; drops/motes take ground height
  walls: boolean;             // Night 3 only: tier walls + bell tower block Mây; ramp snapping
  groundAt(x: number, z: number): number | null; // top surface height, null = void (fall)
  blocked(x: number, z: number, y: number): boolean; // bell tower: hypot(x,z) < TOWER_RADIUS && y < TOWER_TOP_Y
}
export function getLevel(night: number): Level
```
- **Night 1** (`Đảo Bến`): exactly the current constants from `level.ts` (move nothing numeric; import them).
  `groundAt = hypot(x,z) <= ISLAND_RADIUS ? 0 : null`; `blocked = () => false`; start (0,0,0) facing [0,1];
  charms none; every 480 / max 6 / speed `tuning.shade_speed`; no pads/drifters/wind; all three flags false.
- **Night 2** (`Đảo Cau`): `groundAt`: 0 if `hypot(x,z) <= 28` or `hypot(x−70,z) <= 28` or
  (`26 <= x <= 44` and `−2 <= z <= 2`); else null. Lanterns L1..L6 = (0,0,20) (17,0,−10) (−17,0,−10) (70,0,20)
  (87,0,−10) (53,0,−10). Motes: for each island centre C in [A=(0,0,0), B=(70,0,0)] in that order:
  `ring(10,4,0,90)` then `ring(22,8,0,45)` offset by C → 24 points (A's 12 then B's 12). Shades: for A then B,
  `ring(26,8,22.5,45)` offset by C → 16 points. Charm C1 (35,0,0). Pads: (20,0,18) and (50,0,−18), `vy = 14`,
  `vxz = 24 × unit(XZ from pad to the OTHER island centre)` (pad 1 → B (70,0,0); pad 2 → A (0,0,0)).
  Start (0,0,0) facing [0,1] [assumption: ticket gives none]. Every 420 / max 8 / speed `tuning.shade_speed`.
  drifters true, wind false, `shadesAvoidVoid` true, `terrainY` true, `walls` false.
- **Night 3** (`Đảo Chuông`): `groundAt(x,z)`: r = hypot(x,z); r > 45 → null; r ≤ 8 → 6; z > 0 and 12 ≤ r ≤ 24
  → 3; ramps: for a in {30°,150°}, u=(cos a, sin a), `along = x·ux + z·uz`, `across = |z·ux − x·uz|`; if
  across ≤ 1.5 and 24 ≤ along ≤ 30 → `3 × (30 − along) / 6`; else 0. Lanterns L1..L7 = (0,6,6) (18,3,10)
  (−18,3,10) (35,0,−10) (−35,0,−10) (20,0,−35) (−20,0,−35). Motes (30): `ring(34,18,0,20)` y 0, then
  `ring(18,8,20,20)` y 3, then `ring(5,4,45,90)` y 6. Shades: `ring(43,16,0,22.5)` y 0. Charms C1 (30,0,25),
  C2 (−30,0,25). Pad (0,3,13), `vy = 12`, `vxz = [0, −8]`. Start **(0,0,−30) facing [0,1]** [assumption:
  (0,0,0) is inside the bell tower]. Every 360 / max 10 / speed `SHADE_SPEED_NIGHT3`. drifters true, wind true,
  all three flags true. `blocked` = the tower.
- Extend `ring()` to take a centre and a y (keep the Night 1 call results identical — same float ops).
- `buildLanterns(level)`, `buildMotes(seed, level)` (same shuffle with the `'motes'` stream over that level's
  points, first `DEFAULT_MOTE_COUNT` (20)). Night 1 results must be identical to today.

## 3. Night selection
- `CreateGameOptions.night?: 1|2|3` (default 1). `buildState` uses `getLevel(night)`: `state.night = night`,
  `timeLeftS = scenario.timeLeftS ?? tuning[`night${n}_duration_s`]`, flames reset (`tuning.flames`),
  `successfulLights` from scenario or 0. The `lantern_count_night1` check runs only for Night 1.
- Default charms: `level.charmPositions` → `C1..`, available, respawn 0, unless `scenario.charms` is given.
- `src/headless/args.ts`: `--night` accepts 1, 2, 3 (else `UsageError`, exit 1); usage text
  `--night <1|2|3>`; pass `night` to `createGame`. `night_start {night}` already uses `state.night`.
- Scenario lantern ids for Night 2/3 go up to L6/L7 (the regex already allows it); unknown id → FormatError.
- Respawn after a fall goes to `level.playerStart`.

## 4. Rules by stage (only the additions; Night 1 code paths unchanged)
**Stage 2 (counters) — wind.** If `level.wind && scenario.windEnabled !== false`: for k ≥ 1, gust k is
announced at simTick `1800k − 120` (draw `dirDeg = windRng.int(0, 359)` then), active for simTicks
`1800k … 1800k + 299`. Keep `state.wind = { active, dirDeg, warning }` (`warning` true during the 120
announce ticks; web only). Snapshot `wind: { active, dir_deg }` with `dir_deg` = current gust direction while
active, else 0. Night 1/2 snapshots stay `{ active: false, dir_deg: 0 }`.

**Stage 3 (move Mây).**
- *Jump pads* (before the dash/run code): if `p.grounded` and some pad has XZ distance ≤ `PAD_RADIUS` and
  `|p.pos[1] − pad.center[1]| ≤ PAD_FOOT_EPS` → `p.launch = [vxz]`, `p.vel[1] = pad.vy`, `p.grounded = false`
  (a jump edge on that tick is ignored). While `p.launch` is set: horizontal velocity = `p.launch` (move input
  ignored, facing unchanged); dash still works (the dash branch runs as today and holds altitude); when the
  dash ends the launch velocity continues. `p.launch = null` on landing, on a fall and on respawn.
- *Wind*: after Mây's own horizontal displacement this tick (also in the dash branch), if a gust is active and
  `fallWaitTicks === 0`: `pos.x += cos(dir)·2/60`, `pos.z += sin(dir)·2/60`. `p.vel` does NOT include wind
  [assumption].
- *Walls (Night 3 only, `level.walls`)*: resolve every horizontal displacement (run, dash, launch, wind) with
  `tryMove(from, to)`: candidate is accepted if `!blocked(to) && (groundAt(to) === null || groundAt(to) ≤ y +
  STEP_UP)`; otherwise try X-only, then Z-only, else stay. A grounded Mây whose new ground `h` satisfies
  `y − STEP_DOWN ≤ h ≤ y + STEP_UP` snaps `y = h` (ramps); if `h < y − STEP_DOWN` she walks off a ledge
  (`grounded = false`, falls to the lower tier).
- *Ground*: replace `isOverIsland(pos)` by `level.groundAt(x,z) !== null` and the landing test
  `overIsland && prevY >= 0 && y <= 0 → y = 0` by `h !== null && prevY >= h && y <= h → y = h` (identical on
  Night 1 because h is 0 or null). `fall_enabled: false` keeps today's circle clamp on Night 1; on Nights 2/3
  undo a horizontal move that would end over void.

**Stage 4 (pickup)** unchanged (it already compares Mây's feet with the mote's y). Drifters cannot be picked.

**Stage 7 (pulse)** — after the shade targets: drifter targets = drifters with
`dist3(centre, d.pos) ≤ pulse_radius` and state `chase` or `flee` (ascending id). `chase` → `flee`, `stolen`
stays 0, `fleeTicks = DRIFTER_FLEE_TICKS`. `flee` with `stolen > 0` → drop `stolen` motes at the drifter's XZ
(kind `dropped`, ttl `DROP_TTL`, y = `groundAt` there; over void they are lost), event
`drifter_drop {drifter_id, amount}`, `stolen = 0`, `fleeTicks = min(fleeTicks, DRIFTER_DROP_VANISH_TICKS)`.
No score for drifters. The `pulse` event keeps listing shade ids only.

**Stage 8 (shades, then drifters).**
- Shade speed in `chase` = `level.shadeSpeed(tuning)`.
- `shadesAvoidVoid`: wrap every shade XZ change (moveToward, forced step, evict step, safe-zone clamp) so
  that if the end point has `groundAt === null` or `blocked(…)`, the shade keeps its previous XZ for that move.
- `terrainY`: after a shade moves, `s.pos[1] = (groundAt(x,z) ?? s.pos[1] − SHADE_HOVER_Y) + SHADE_HOVER_Y`.
- Random wander target on Nights 2/3: `level.moteSpawnPoints[shadeAi.int(0, n − 1)]` (one draw) instead of the
  Night 1 disc (two draws). Night 1 keeps the disc.
- Drifters, ascending id, after all shades:
  - `idle`: if `fallWaitTicks === 0 && carried ≥ 5 && xz(d, Mây) ≤ 15` → `chase` and move as chase this tick.
    Else move toward `idleTarget` at 2 m/s; pick a new `idleTarget = level.moteSpawnPoints[drifterRng.int(0,
    n−1)]` when it is null, reached (≤ 1 m) or `idleTicks` reaches 0 (reset to 180).
  - `chase`: if the condition above no longer holds → `idle` (and idle-move this tick); else move toward Mây
    at 7 m/s (XZ).
  - `flee`: move away from Mây at 7 m/s (unit from Mây to the drifter; same point → +X); `fleeTicks −= 1`;
    at 0 the drifter is removed from `state.drifters` (it disappears from the snapshot).
  - Drifters fly over void and walls; y = `(groundAt ?? previous ground) + DRIFTER_HOVER_Y` when `terrainY`.

**Stage 9 (hits)**: drifters first (ascending id): every drifter in `chase` with XZ ≤ 1.2 m and
`fallWaitTicks === 0` (invulnerability does NOT protect) steals `amount = min(3, carried)`; `carried −= amount`,
`stolen = amount`, state `flee`, `fleeTicks = 240`, event `drifter_steal {drifter_id, amount, carried}` (carried
after). Each drifter steals once (only `chase` can steal). Then the shade hit exactly as today. Hit drops on
Nights 2/3: y = `groundAt` at the drop point; over void the mote is lost (the rng draws still happen, the
event's `dropped` is unchanged) [assumption].

**Stage 10 (spawns)**: motes as today over `level.moteSpawnPoints` (cap 30, every 240). Shades: first spawn
tick 300 (2 shades) on every night, then every `level.shadeSpawnEvery`, cap `level.shadeMax`, points
`level.shadeSpawnPoints` (same rules: ≥ 15 m from Mây, outside safe zones), spawn y = point y + 1.0.
Drifters: if `level.drifters && scenario.randomDrifters !== false && simTick % 1200 === 0 && alive < 2`:
one drifter `D<n>` at `level.shadeSpawnPoints[drifterRng.int(0, n−1)]` ("mist points" = the misty rim spawn
points [assumption]), y = point y + 1.0, state `idle`. No event (none in the contract).

**Stage 11** unchanged (win ratio already generic: 3/5, 4/6, 5/7).

## 5. Types, scenario, snapshot
- `types.ts`: `DrifterState { id; pos; state: 'idle'|'chase'|'flee'; stolen; fleeTicks; idleTarget: Vec3|null;
  idleTicks }`; `GameState.drifters`, `GameState.wind`, `nextDrifterNum`; `PlayerState.launch: [number,
  number] | null`; events `drifter_steal`, `drifter_drop`; Snapshot `drifters: {id, pos, state, stolen}[]`.
- `scenario.ts`: `drifters[]` items `{pos, id?, state? ('idle'|'chase'|'flee'), stolen? (count)}` (replaces
  the default list, which is empty at tick 0 anyway). A drifter given `flee` without ticks gets 240.
  Duplicate ids → FormatError. Add unit tests for the new parsing.
- Snapshot `drifters` in ascending id, `pos` rounded to 3 decimals; `wind` per §4.

## 6. Tests (new; existing ones untouched except §0.2)
`tests/cli/nights.test.ts` + fixtures under `tests/scenarios/n2-*` and `n3-*`. Every expected number is a
literal computed by hand with the arithmetic in a comment. At least:
1. `--night 2` tick-0 snapshot: night 2, time 270, 6 lanterns at the listed positions, 20 motes, charm C1,
   player (0,0,0); `--night 3`: time 300, 7 lanterns, charms C1 C2, player (0,0,−30). `--night 4` → exit 1.
2. `n2-bridge`: from (20,0,0) run +X 4 s (24 m) → x = 44, still grounded (bridge), no fall event.
3. `n2-void`: from (27,0,5) run +X → leaves ground (z = 5 is off the bridge), `player_hit {by: fall}` once.
4. `n2-pad`: player at (20,0,18) grounded, no input → launch; lands (grounded) 84 steps after the launch
   step (14·t − 10·t² = 0 → t = 1.4 s; derive the exact tick from the discrete integration) at
   (20,18) + 33.6·unit(50,−18) (compute: |(50,−18)| = 53.1413…), y = 0, inside island B. Move input during the
   flight does not change the landing point.
5. `n3-wall`: on tier 0 at (0,0,30) facing −Z, run −Z 1 s → stops at r ≈ 24 (tier 1 wall), y stays 0.
6. `n3-ramp`: from the foot of the 30° ramp (along 30.5) run inward → y climbs linearly, reaches 3 at along
   24, and Mây ends up on tier 1 (y 3, grounded).
7. `n3-ledge`: on tier 1 at r 13 (z > 0) run inward → walks off at r 12, falls, lands on tier 0 (y 0), no fall
   event.
8. `n3-pad`: player at (0,3,13) grounded → lands on tier 2 (y 6) at z ≈ 6.24 (solve 3 + 12t − 10t² = 6 on the
   descending branch, discrete ticks), never enters the tower (r ≥ 2).
9. `n3-tower`: on tier 2 at (0,6,−5) run +Z → stops at r = 2 (blocked), never inside.
10. `n3-wind`: night 3 with `time_left_s` large, no shades/motes; at simTick 1800 snapshot `wind.active` true
    with some `dir_deg`, and from 1800 to 1860 Mây (standing still) moves exactly 2.0 m in that direction (±
    1e-6 before rounding; compare the rounded snapshot). Same scenario with `wind_enabled: false` → no
    movement, `active` false.
11. `n2-drifter-steal`: drifter D1 `idle` 3 m from Mây, carried 6 → `chase`, `drifter_steal {D1, 3, 3}` at
    the hand-computed tick, then `flee`, removed from the snapshot exactly 240 ticks later.
12. `n2-drifter-invuln`: same with `invuln_ticks: 600` → still stolen.
13. `n2-drifter-pulse-chase`: pulse while D1 chases → state `flee`, `stolen` 0, no steal ever.
14. `n2-drifter-pulse-drop`: D1 `flee` with `stolen: 3` within 5 m → `drifter_drop {D1, 3}`, 3 dropped motes at
    its XZ, removed ≤ 120 ticks later; no drifter spawns on Night 1 in 3000 ticks; on Night 2 default run the
    first drifter appears at tick 1200 (and at most 2 alive at any time over a full night).
15. `n3-shade-speed`: a chasing shade moves 4.5/60 per tick on Night 3 (4.0/60 on Night 2).
16. `n2-shade-void`: a chasing shade between islands toward Mây on the far side never ends over void.
17. Schedules: Night 2 default run — shades spawn at 300 (×2), then every 420, never more than 8; Night 3 every
    360, max 10.
18. Determinism: `--night 2` and `--night 3` full nights (16200 / 18000 ticks) run twice → identical bytes;
    each finishes in < 30 s (assert < 30000 ms; print the time).

## 7. Docs and proof
- `CHANGELOG.md`: new top section `## [phase-2 hoàn thiện] Đêm 2–3 (Contract v1.2 không đổi)`: Thêm (each
  feature), "Tests updated (phase-2 hoàn thiện)", and remove those items from the old "Chưa làm" list.
- `docs/notes/assumptions.md`: section `## Phase 2 hoàn thiện` listing every [assumption] above.
- `docs/spec/acceptance-phase2.md` (new, Vietnamese): acceptance criteria for every item of Ticket-02 Part 2
  and Part 3, each with the test/scenario name that checks it (web items: "kiểm tra tay — Plan 05").
- `README.md`: `--night 1|2|3`, the three islands; the "Chưa làm" line updated (web items still pending until
  Plan 05; colour-blind mode is DONE since phase-3 — fix that wrong line).
- `AGENTS.md`: one line on `levels.ts` + the golden guard ("never regenerate tests/golden").
- `.claude/skills/verify/SKILL.md`: mention nights 2–3 checks.
- `scripts/verify.mjs`: add rows for Nights 2–3 / pads / tiers / drifters / wind to the phase-2 proof table,
  and a performance row: time of `--night 3 --ticks 21600` (must be ≤ 30 s).

## 8. Definition of done (paste REAL outputs)
`npm run build`; `npm test` (counts; golden 5/5 green); `npm run verify` (exit 0); timing of
`node dist/headless.js --seed 5 --night 3 --ticks 21600 --out out/n3.jsonl`; same for `--night 2`; run each
twice + `cmp`; `git status --short`.

## 9. Final report (English)
Files changed; tests changed (should be only §0.2) and why; deviations and why; outputs; doubts.
