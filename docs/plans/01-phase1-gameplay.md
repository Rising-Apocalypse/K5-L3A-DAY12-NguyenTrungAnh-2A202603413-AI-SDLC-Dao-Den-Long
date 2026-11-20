# Plan 01 — Phase 1 gameplay (Night 1, Contract v1.0)

Author: Claude Opus 5.5 (planner / reviewer). Implementer: Claude Sonnet 5.5 (xhigh).
Builds on Plan 00 (core, headless pipeline, web shell). Spec: `docs/spec/contract-v1.0.md`, `docs/spec/prd-0.md`.

## Strategy (read this)

PRD-0 lets us choose the rules. We deliberately choose rules **identical to the standard rules the
customer will publish for Phase 2**, so later phases only add features. Everything below is exact; where
a rule says "assumption", record it in `docs/notes/assumptions.md` (Vietnamese, one line each, add a
section "Phase 1 — luật chơi").

Contract stays **v1.0** in this plan: do not add v1.1 output fields or events; do not change
`contract_version`. Output only the fields/events v1.0 defines (plus the recommended `motes` array).

Out of scope (later phases): dash, pause, Nights 2–3, wind, drifters, charms, menus/settings/audio.
Do not stub them in the output.

## Hard rules (same as Plan 00)

No git add/commit. Core stays pure/deterministic (only `rng.ts` streams; add streams `"drops"`,
`"shade_ai"`, `"spawn"` as needed — one subsystem per stream). Every tuning number from `TUNING`.
Non-contract constants live in `src/core/level.ts` (or a `rules.ts`) as named constants — no magic
numbers inline. Tests must test real behaviour; never weaken a test to pass.

## Units

Convert seconds → ticks once with `Math.round(s * 60)` and keep **integer tick counters** for every
timer (invuln 90, stun 120, pulse cooldown 180, …). Never accumulate float seconds.

## Constants (non-contract; put in level/rules)

| name | value | note |
|---|---|---|
| `PICKUP_MAX_DY` | 1.5 | pickup needs `|player.y − mote.y| ≤ 1.5` |
| `MOTE_CAP` | 30 | max active motes (random + dropped) |
| `MOTE_SPAWN_EVERY` | 240 | ticks; spawn at 240, 480, … |
| `DROP_RING` | [1.5, 2.5] | dropped motes ring radius around Mây |
| `DROP_TTL` | 480 | ticks |
| `SHADE_FIRST_SPAWN` | 300 | tick; spawn 2 shades |
| `SHADE_SPAWN_EVERY` | 480 | then 1 shade at 300 + 480k |
| `SHADE_MAX` | 6 | |
| `SHADE_SPAWN_MIN_DIST` | 15 | from player, XZ |
| `SHADE_SPAWNING_TICKS` | 30 | **assumption**: duration of `spawning` state (harmless, does not move) |
| `SHADE_DETECT` / `SHADE_LOSE` | 12 / 18 | XZ, chase start / stop |
| `SHADE_WANDER_SPEED` | 2.0 | **assumption** m/s, toward a random island target (re-pick when within 1 m or every 180 ticks) |
| `SHADE_HIT_MAX_DY` | 1.5 | |
| `RECOIL_DIST` / `RECOIL_TICKS` | 2 / 60 | shade backs off 2 m (away from Mây, XZ) over 60 ticks, harmless |
| `PULSE_CENTER_DY` | 0.8 | pulse centre = player feet + 0.8 Y |
| `PULSE_PUSH_TICKS` | 15 | push 4 m total over first 15 ticks of stun |
| `EVICT_MAX_TICKS` | 30 | shades inside a newly lit safe zone are pushed to its edge within ≤ 30 ticks, harmless meanwhile |
| `FALL_Y` | −10 | |
| `FALL_WAIT_TICKS` | 60 | then respawn |

## Tick order (implement exactly; one function per stage in `sim.ts`)

1. Read input; compute rising edges against previous buttons.
2. Decrease counters: time (derived from simTick), pulse cooldown, invuln, stun / push / recoil /
   evict / spawning counters, dropped-mote TTL (remove when it reaches 0), fall-wait.
3. Move Mây (instant velocity, jump, gravity; ground only over the island), then fall check.
4. Pickup motes.
5. Interact with lanterns.
6. Update safe zones (newly lit lanterns → start evicting shades inside).
7. Pulse.
8. Move shades.
9. Shade hits (ids ascending).
10. Scheduled spawns (motes, shades). New entities interact only from the next tick.
11. Win/lose check.
12. (CLI) snapshot if due.

## Rules

**Pickup (4).** For each active mote (ascending id), if `carried < carry_capacity`, XZ distance ≤
`pickup_radius` and `|player.y − mote.y| ≤ 1.5`: remove it, `carried += 1`, event
`mote_picked {carried}`. Not during fall-wait. Dropped motes become pickable from the tick after they
are created.

**Interact (5).** On `interact` rising edge (not during fall-wait): candidates = **unlit** lanterns
with XZ distance ≤ `interact_radius`; choose nearest, tie → smaller id. `amount = min(carried,
lantern_cost − deposited)`. If `amount > 0`: `carried −= amount`, `deposited += amount`,
`score += amount · per_mote`, event `deposit {lantern_id, amount, deposited}`. If now
`deposited == lantern_cost`: `lit = true`, `score += per_lantern`, event `lantern_lit {lantern_id}`.
Amount 0 → no event.

**Safe zones (6, 8).** Each lit lantern has radius `safe_radius` (XZ). A shade outside can never end a
move inside: clamp its position back to the circle edge. A shade that is inside at the moment a
lantern becomes lit gets `evict` for ≤ 30 ticks: each tick it moves radially outward by
`max(remaining_at_start / 30, shade_speed / 60)` until it reaches the edge (coincident with centre → +X);
harmless while evicting. Its state name stays as it was (v1.0 only requires `stunned`). Lanterns lit in
the scenario are lit from tick 0 (shades placed inside them by a scenario are evicted from step 0).

**Pulse (7).** On `pulse` rising edge, if cooldown is 0 and `carried ≥ pulse_cost` (and not in
fall-wait): `carried −= pulse_cost`; cooldown = `pulse_cooldown_s · 60` ticks; centre = player pos +
(0, 0.8, 0); targets = all shades (any state except `spawning`) with **3D** distance from centre to shade
centre ≤ `pulse_radius`, decided this tick. Each target: state `stunned`, stun = `pulse_stun_s · 60`
ticks (refresh if already stunned), push restarts: total `pulse_push_m` horizontally away from the player
over 15 ticks (equal per-tick steps; same XZ position → +X); cancels recoil/evict.
`score += per_stun` per target. Event `pulse {stunned_ids}` (ascending ids; empty array allowed).
Not enough motes or on cooldown → nothing, no event.

**Shade movement (8)** per state:
- `spawning`: stays still for 30 ticks, then `wander`.
- `wander`: move toward a wander target at 2.0 m/s; if player XZ ≤ 12 (and not in fall-wait) → `chase`.
- `chase`: move toward player XZ at `shade_speed`; if player XZ > 18 → `wander`.
- `recoil`: move away from player as specified; afterwards `wander` (re-evaluated next tick).
- `stunned`: apply push steps during the first 15 ticks; no other movement; when stun ends → `wander`.
- Y stays at the shade's own height. After moving apply safe-zone clamp.

**Hits (9).** Skip if player invulnerable or in fall-wait. Shades ascending id, eligible if state is
`wander` or `chase` and not evicting. First eligible with XZ ≤ `shade_hit_radius` and
`|player.y − shade.y| ≤ 1.5` hits (**max 1 hit per tick**): `flames −= 1`;
`dropped = floor(carried · hit_drop_ratio)`; `carried −= dropped`; spawn `dropped` motes at a random
angle and radius in [1.5, 2.5] around the player (stream `"drops"`), y = 0, TTL 480, new ids; invuln =
`invuln_s · 60` ticks; that shade → `recoil`. Event `player_hit {by:"shade", flames, dropped}`.

**Falling (3).** If `player.y < −10` (once per fall, ignores invulnerability): `flames −= 1`,
`lost = carried`, `carried = 0`, event `player_hit {by:"fall", flames, dropped: lost}`
(**assumption**: in v1.0 `dropped` reports the motes lost). If flames is now 0 → game over handled in
stage 11 (no respawn). Else fall-wait 60 ticks (no pickup, no interact, no pulse, cannot be hit, no
movement), then respawn at (0,0,0), velocity 0, invuln 90 ticks.

**Spawns (10).**
- Motes: at ticks 240, 480, … (tick = simTick after this step), if `random_motes` is true and active
  motes < 30: pick a random free spawn point (no active random mote within 0.01 m of it) from the
  `"spawn"` stream; none free → skip.
- Shades: if `random_shades` is true: at tick 300 spawn 2, then 1 at 300 + 480k, while count < 6.
  Valid points = spawn points with XZ distance ≥ 15 from the player; pick randomly; none → skip.
  New shade: id `S<next>`, pos `[x, 1.0, z]`, state `spawning`; event `shade_spawned {id}`.

**Win/lose (11)** after every step, first match wins: `flames == 0` → lost `no_flames`; all lanterns lit
→ won `all_lit` (even on the tick time hits 0); `time_left_s ≤ 0` → lost `dawn`. Event
`game_over {result, reason}`; `state` becomes `won`/`lost`; CLI stops after this step.
On win: `score += floor(time_left_s) · per_second_left + flames · per_flame_left` (before writing the
event).

**Scenario defaults (v1.0).** Listed shades start in `wander` (active immediately, not `spawning`).
Preset `lit: true` lanterns award nothing. `random_motes` / `random_shades` default true.

## Output additions (v1.0 only)
Snapshot `shades[].state` uses the names above. Snapshot `motes` lists active motes `{id, pos}`;
`motes_active` = its length. No other new fields.

## Web (playable Night 1)
- Uses the same `createGame` / `step`. Render lanterns lit vs unlit, dropped motes, shade states
  (stunned looks greyed), safe-zone glow ring for lit lanterns, a hit flash, invuln blink.
- HUD: flames, time mm:ss, lanterns k/5, score, carried x/10, pulse cooldown, prompt
  "E — Nạp ánh sáng (x/10)" when an unlit lantern is within `interact_radius`.
- Win / lose overlay with final score and "R — Chơi lại". Ambient light intensity
  `0.15 + 0.55 · lit / total`.
- Colours (use these): sky `#0E1430`, fog `#1B2350`, grass `#2F5D50`, sand `#C9B48A`, wood `#6B4A2F`,
  cloud sea `#12384A`, lantern lit `#FFB347` / core `#FFE9B0` / unlit `#5B5F6E`, mote core `#FFF6C2` /
  halo `#FFE58A`, shade body `#120A1A` / rim `#7A3CFF` / stunned `#3A3450`, Mây robe `#E8E2D0` /
  scarf `#C8102E`, gold `#F2C14E`, UI danger `#FF5A5F`, UI text `#F5F1E6`.

## Tests (each rule gets at least one scenario-driven test)
Add `tests/scenarios/<name>/` fixtures + assertions in `tests/cli/gameplay.test.ts` (run the real CLI,
parse JSONL). Minimum set:
`pickup-basic` (mote at [0,0,5], walk +Z → `mote_picked` tick predicted from speed and radius),
`pickup-capacity`, `deposit-partial` (carried 4 → deposited 4, not lit), `deposit-light`
(carried 10 → `lantern_lit`, score 200), `deposit-nearest-tie`, `pulse-stun` (shade within 5 m 3D →
stunned 120 ticks, pushed 4 m over 15 ticks, score +5), `pulse-insufficient`, `pulse-cooldown`,
`shade-chase` (detect 12 / lose 18), `shade-hit` (flames −1, dropped floor(carried/2), invuln 90 →
no second hit), `safe-zone-block`, `safe-zone-evict`, `fall-respawn`, `fall-last-flame` (lost
`no_flames`), `win-all-lit` (score bonus), `dawn` (time_left_s 1 → lost after 60 steps),
`spawn-schedule` (shades at tick 300 ×2, 780; motes at 240), `determinism` (default level, 3600 ticks,
two runs identical). Compute expected values from `TUNING` in the test, not hard-coded copies.

## Docs
- README: "Cách tính điểm" (actual rules), controls, "Giải thích tuning".
- `docs/proof/phase-1.md` generated by `npm run verify` (extend `verify.mjs`): table
  requirement (the 8 PRD-0 scope items + contract) → test/scenario name → result, plus commit hash.
- Update `AGENTS.md` only if a new rule/pitfall emerged (keep it short).

## Definition of done (run and paste real output tails)
1. `npm ci && npm run build` ok. 2. `npm test` all green with counts. 3. `npm run verify` exit 0 and show
`docs/proof/phase-1.md`. 4. Full default night: `time node dist/headless.js --seed 3 --night 1 --ticks 18000 --out out/full.jsonl`
then `grep -c shade_spawned out/full.jsonl; tail -2 out/full.jsonl`. 5. Same command twice → `cmp` identical.

Final report (English, concise): what changed, deviations + why, outputs, known gaps, open questions.
