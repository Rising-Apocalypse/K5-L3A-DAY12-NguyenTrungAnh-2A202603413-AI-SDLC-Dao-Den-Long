# Plan 03 — Phase 3 change request "Đèn cạn dầu": Contract v1.2 for Night 1

Author: Claude Opus 5.5 (planner/reviewer). Implementer: Gemini (via `agy`).
Prerequisite: Plan 02 is merged (Contract v1.1, dash, pause, charms). Design rationale: `docs/adr/0001-lantern-fuel-and-dawn-win.md`.
**Follow this file literally. Edit only the files named. No refactors, renames or reformatting elsewhere.**
If something seems wrong, stop that part and report it — do not improvise.

## 0. Scope
Night 1 only (Nights 2–3 are still out of scope). Everything in Ticket-03 that applies to Night 1, plus a
minimal web part (fuel bar, blink, colour-blind toggle). Same ground rules as Plan 02 §1 (no git
writes, forbidden files, pure core, run `npm test` after every step, no `.skip`).

## 1. Exact rules (these REPLACE older rules where marked)

Integer fuel: store fuel as **ticks-units**: `fuelUnits`, where 1.0 fuel = 60 units. `FUEL_MAX_UNITS = fuel_max*60 = 6000`.
Output fuel = `Math.round(fuelUnits / 60 * 10) / 10` (1 decimal), `0` when unlit.

1. **Lighting** [REPLACES "cost is always lantern_cost"]: an unlit lantern needs `relight_cost` (5) motes if
   `everLit`, else `lantern_cost` (10). Deposits work as today (partial, remembered in `deposited`). When
   `deposited` reaches the needed cost: `lit = true`, `fuelUnits = 6000`, `deposited` stays at that cost,
   `successfulLights += 1`; if it was `everLit` → `relitCount += 1`, score `+RELIGHT_SCORE (40)`, event
   `lantern_lit {lantern_id, relight: true}`; else score `+per_lantern (100)`, event
   `lantern_lit {lantern_id, relight: false}`; then `everLit = true`.
2. **Decay** (stage 2): every lit lantern `fuelUnits -= 1` (= `fuel_decay_per_s` 1.0/s). Every shade in
   state `drain` subtracts `drain_per_s` (5/s = 5 units/tick) from its target lantern. Each draining shade has
   `drainTicks` (+1 per tick while draining); when `drainTicks % 60 === 0` push event
   `fuel_drain {lantern_id, shade_id, fuel}` (fuel after this tick's subtraction, 1 decimal).
3. **Out** (immediately after stage 2): a lit lantern with `fuelUnits <= 0` → `lit = false`,
   `fuelUnits = 0`, `deposited = 0`, `everLit = true`, event `lantern_out {lantern_id}`.
4. **Refuel** (stage 5, interact) [REPLACES "lit lanterns accept nothing"]: candidates = unlit lanterns OR lit
   lanterns with `fuelUnits < 6000`, within `interact_radius`; nearest, tie → smaller id.
   - Unlit target → deposit as in rule 1 (amount = min(carried, needed − deposited), +`per_mote` (5) each).
   - Lit target: `used = min(carried, ceil((6000 − fuelUnits) / 600))`; if `used === 0` → nothing (no event,
     no score). Else `fuelUnits = min(6000, fuelUnits + 600 × used)`, `carried −= used`,
     score `+= used × per_mote`, event `refuel {lantern_id, amount: used, fuel}`.
5. **Safe zone** [REPLACES "shades never enter"]: a lit lantern has a safe zone only if
   `fuelUnits >= low_fuel_threshold × 60` (1800). Exactly 30.0 keeps it. Use this predicate everywhere the
   code currently uses `l.lit` for safe zones (`clampOutsideSafeZones`, `spawnShades`, scenario eviction).
   When a zone turns ON this tick (newly lit, or refuelled from < 1800 to ≥ 1800) → evict shades inside, like
   today's `newlyLit` (harmless, ≤ 30 ticks).
6. **Shade wander targeting** (stage 8, only for shades in `wander`):
   - Target lantern = nearest lit lantern with `fuelUnits < 1800` (tie smaller id). If none → nearest unlit
     lantern (tie smaller id). If none → the existing random wander.
   - With a target lantern: move toward its `pos` at `SHADE_WANDER_SPEED`; when XZ distance ≤ `DRAIN_REACH`
     (2.0) **and the target is lit with fuel < 1800** → state `drain`, `targetLanternId = id`,
     `drainTicks = 0`, stop moving. (At an unlit lantern it just stays near it.)
   - Detection to `chase` (player within 12 m) still has priority over targeting, as today.
7. **Drain state** (stage 8): no movement. Transitions, checked in this order each tick:
   player XZ ≤ `DRAIN_BREAK_DIST` (6.0) and not in fall-wait → `chase`;
   target lantern unlit, or its `fuelUnits >= 1800`, or XZ distance > 2.0 → `wander` (clear target).
   Pulse (stage 7) also stuns draining shades. Stun end → `wander` (already the case).
   Drain shades cannot hit (only `wander`/`chase` hit — unchanged).
8. **Pulse score** [REPLACES]: `+per_stun` (5) per target; if the target's state right before the pulse was
   `drain`, `+DRAIN_STUN_BONUS` (10) extra (total 15).
9. **Capacity**: `capacity = min(capacity_max (20), carry_capacity (10) + 2 × successfulLights)`. Use it
   everywhere `tuning.carry_capacity` is used as a limit. Scenario `player.successful_lights` sets the count;
   lanterns preset lit by the scenario do NOT count.
10. **Win/lose** [REPLACES "win when all lit" and the time bonus]. Stage 11, after everything else:
    `flames <= 0` → lost `no_flames` (always first, even on the dawn tick); else if `timeLeftS <= 0`:
    `litCount >= Math.ceil(win_ratio × lanterns.length)` (5 lanterns → 3) → won `dawn_survived` and score
    `+= Σ over lit lanterns (DAWN_PER_LIT_LANTERN (50) + floor(fuel)) + flames × per_flame_left (50)`;
    else lost `dawn`. **No early win**: remove the `all_lit` branch entirely.
11. **Durations**: `night1_duration_s` 240 (also night2 270, night3 300 in the contract).

## 2. Contract v1.2 — `game.contract.json`
- `"contract_version": "1.2"`.
- In `tuning`: `night1_duration_s: 240`, `night2_duration_s: 270`, `night3_duration_s: 300`; add (after
  `night3_duration_s`, before `score`): `"fuel_max": 100, "fuel_decay_per_s": 1.0, "fuel_per_mote": 10,
  "relight_cost": 5, "win_ratio": 0.6, "drain_per_s": 5, "low_fuel_threshold": 30, "capacity_max": 20`.
- `score`: `per_mote: 5`, `per_lantern: 100`, `per_stun: 5`, `per_second_left: 0` (time bonus removed),
  `per_flame_left: 50`.
- `src/core/tuning.ts`: add the 8 new keys to `Tuning` and to `NUMBER_KEYS`.
- Derived constants: `600` = `fuel_per_mote × 60`, `6000` = `fuel_max × 60`, `1800` =
  `low_fuel_threshold × 60`, decay units/tick = `fuel_decay_per_s` (×60/60), drain units/tick = `drain_per_s`.
  Compute them from TUNING once in `createGame` (no hard-coded 600/6000/1800 in sim.ts).
- `src/core/rules.ts` append: `RELIGHT_SCORE = 40`, `DRAIN_STUN_BONUS = 10`, `DAWN_PER_LIT_LANTERN = 50`,
  `DRAIN_REACH = 2.0`, `DRAIN_BREAK_DIST = 6.0`, `FUEL_EVENT_EVERY = 60`.

## 3. Output / input changes
- Snapshot `lanterns[]`: `{id, pos, lit, deposited, fuel, ever_lit, relit_count}` (this order).
- Snapshot `player`: insert `capacity` right after `carried`.
- Shade states now include `drain`.
- Events: `refuel {lantern_id, amount, fuel}`, `lantern_out {lantern_id}`,
  `fuel_drain {lantern_id, shade_id, fuel}`; `lantern_lit` data becomes `{lantern_id, relight}`;
  `game_over.reason` ∈ `dawn_survived | dawn | no_flames` (remove `all_lit` from the type).
- Scenario: `lanterns[].fuel` (number 0..100), `lanterns[].ever_lit` (boolean); `lit: true` without `fuel` →
  100; `lit: false` → fuel 0. `player.successful_lights` (int ≥ 0). `shades[].target_lantern_id` (string,
  must be an existing lantern id at build time, else `FormatError`); `shades[].state` may also be `drain`.
  A scenario shade with `state: "drain"` needs `target_lantern_id`, else `FormatError`.

## 4. Edits by file (in this order; `npm test` after each)
1. `game.contract.json`, `src/core/tuning.ts`, `tests/unit/tuning.test.ts` (`'1.2'`, new keys).
2. `src/core/rules.ts` (constants of §2).
3. `src/core/types.ts`: `ShadeStateName` add `'drain'`; `LanternState` add `fuelUnits: number; everLit:
   boolean; relitCount: number;`; `ShadeState` add `targetLanternId: string | null; drainTicks: number;`;
   `PlayerState` add `successfulLights: number;`; events and `Snapshot` per §3.
4. `src/core/level.ts` `buildLanterns`: add `fuelUnits: 0, everLit: false, relitCount: 0`.
5. `src/core/scenario.ts`: parse the new fields of §3 (with tests in `tests/unit/scenario.test.ts`).
6. `src/core/sim.ts`:
   - `newShade`: `targetLanternId: null, drainTicks: 0`.
   - `buildState`: apply lantern `fuel`/`ever_lit` (lit without fuel → 6000 units); player `successfulLights`;
     shade `target_lantern_id`/`drain`; scenario eviction uses the safe-zone predicate of rule 5.
   - New helper `hasSafeZone(l) = l.lit && l.fuelUnits >= lowFuelUnits`; replace safe-zone uses of `l.lit`.
   - New helper `capacity(state, tuning)`; replace `tuning.carry_capacity` in `stagePickup`.
   - `stageCounters`: add rule 2; then a new `stageLanternsOut(c)` called right after `stageCounters` in
     `step()` (rule 3).
   - `stageInteract`: rewrite per rule 4 + rule 1 (keep the nearest/tie logic); push zone-turned-on lanterns
     to `c.newlyLit` (rename not required).
   - `stagePulse`: rule 8 (record `wasDraining` before setting `stunned`); clear `targetLanternId`.
   - `moveShade`: add a `drain` branch (rule 7) before the wander/chase logic; change `wander()` per rule 6.
   - `stageEnd`: rule 10.
   - `snapshot()`: §3.
7. Existing tests that the new rules make wrong — the ONLY allowed edits, each logged in `CHANGELOG.md`
   under "Tests updated (phase-3)" with the reason:
   - win tests expecting `all_lit` → rewrite to dawn rules (e.g. `win-all-lit` becomes a dawn win: 3 lanterns
     lit with fuel, `time_left_s: 1`, 60 ticks → `dawn_survived`, score = Σ(50+floor(fuel)) + flames×50).
   - score expectations using old per_mote 10 / per_second_left → recompute from TUNING.
   - deposit tests expecting "lit lantern ignored" → now refuel (or full lantern ignored).
   - wander-behaviour assertions affected by lantern targeting → update the expectation, keep the intent.
   - durations 300 → 240 where a test used the default duration.
   Delete a test only if its rule no longer exists, with the reason in the changelog.
8. New tests in `tests/cli/gameplay.test.ts` under `describe('phase 3 (v1.2)')` + fixtures in
   `tests/scenarios/`: `fuel-decay` (lit L1 preset fuel 1.0 → `lantern_out` at tick 60, deposited 0,
   ever_lit true), `relight` (ever_lit, carried 5 → `lantern_lit relight:true`, +5×5+40), `refuel`
   (fuel 50, carried 10 → used 5, fuel 100, event amount 5; full lantern → no event), `refuel-partial-carried`
   (fuel 50, carried 2 → used 2, fuel 70), `low-fuel-no-safe-zone` (fuel 29.9 → shade can enter; 30.0 →
   cannot), `drain` (shade wander near L1 with fuel 29 → state `drain` within ≤2 m, fuel drops 6/s total,
   `fuel_drain` every 60 ticks; Mây within 6 m → `chase`), `pulse-drain-bonus` (+15), `capacity-growth`
   (after one successful light, capacity 12 in snapshot and pickup allows 12), `dawn-win` / `dawn-lose`
   (2 lit of 5 → lost `dawn`), `no-flames-on-dawn-tick` (lost `no_flames` even when time hits 0 the same
   tick), `no-early-win` (all 5 lit → keeps playing).
9. Docs: `CHANGELOG.md` add `## [phase-3] Contract v1.2` with "Thay đổi phá tương thích" (list every
   [THAY THẾ] rule, score formula, durations, `all_lit` removed, `lantern_lit.relight`, new snapshot keys)
   and "Tests updated (phase-3)"; `docs/notes/assumptions.md` section `## Phase 3 — Đèn cạn dầu` (fuel units,
   fuel_drain cadence per shade, wander toward unlit lantern, drain reach, scenario drain requires target);
   `README.md` "Cách tính điểm" rewritten to the new rules; `AGENTS.md` one line: fuel is integer
   1/60 units. `scripts/verify.mjs`: also write `docs/proof/phase-3.md` with rows per rule 1–11 mapped to the
   new tests (copy the phase-2 pattern).
10. Web (`src/web` only): fuel bar above lit lanterns; lantern + bar blink at 1 Hz when fuel < 30; unlit
    lanterns scaled to 0.8 height; HUD shows `carried / capacity` and lit count vs needed (`k/5, cần 3`);
    key `C` toggles "Bảng màu dễ phân biệt", saved in `localStorage` (try/catch): shade rim `#7A3CFF` →
    `#00B3FF`, UI danger `#FF5A5F` → `#FFFFFF` with a `⚠` prefix.

## 5. Definition of done (paste REAL outputs)
`npm run build`; `npm test` (counts); `npm run verify` (exit 0, first 25 lines of `docs/proof/phase-3.md`);
`node dist/headless.js --seed 3 --night 1 --ticks 14400 --out out/p3.jsonl && tail -3 out/p3.jsonl`; run twice
and `cmp`; `git status --short`.

## 6. Final report (English)
Files changed, tests changed/deleted and why, deviations (should be none), outputs, doubts.
