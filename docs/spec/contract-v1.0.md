# Test Contract v1.0 (English working copy)

Source: lab board, Phase 1 tab (PRD-0). This is a faithful English rendering for the coding agent.
If this file and the lab board disagree, **the lab board wins**. Do not invent rules that are not here;
anything unspecified is decided in `docs/notes/assumptions.md`.

## A. `game.contract.json` at repo root

Fixed keys: `contract_version` (`"1.0"`), `team`, `build_cmd`, `run_cmd`, `headless_cmd`, `tuning`.

`tuning` keys (fill in the numbers the game **actually uses**; if the game has no such concept, use
`null` (or `false`) and explain in README). **Phase 1 hidden tests generate situations from these numbers,
so a wrong value fails tests.**

```
player_speed, carry_capacity, lantern_cost, lantern_count_night1 (=5),
pickup_radius, interact_radius,
pulse_cost, pulse_radius, night1_duration_s, flames, invuln_s, hit_drop_ratio,
pulse_stun_s, pulse_push_m, pulse_cooldown_s,
safe_radius, shade_speed, shade_hit_radius,
fall_enabled (boolean),
score: { per_mote, per_lantern, per_stun, per_second_left, per_flame_left }
```

Meaning: `hit_drop_ratio` = fraction of carried motes dropped when hit (0 if none dropped);
`safe_radius` = radius around a lantern that shades cannot enter; `fall_enabled` = whether falling off the
island is penalised; `score.*` = points per event.

Commands must run on macOS/Linux after `build_cmd`. Docker allowed.

## B. Headless CLI

```
<headless_cmd> --seed <int> --night 1 [--scenario <file.json>] [--inputs <file.json>]
               --ticks <int> --out <file.jsonl> [--snapshot-every <int, default 10>]
```

- Fixed 60 ticks/second (1 tick = 1/60 s). No window, no GPU, run as fast as possible.
- Stop after `--ticks` steps **or** when the game ends (won/lost). Exit code 0.
- Error → non-zero exit code, message to stderr. **Malformed inputs/scenario file → exit code 2.**
- Units are metres; **Y is up**; island ground at Y = 0; player starts at (0, 0, 0).

### Tick model (so everyone counts the same)
- Snapshot at tick 0 = state after building the scenario, **before any input is applied**.
- Step k (k = 0 … N−1) reads the input of tick k and produces state k+1. Events that happen during that
  step are written with `tick = k+1`. `--ticks N` performs **exactly N steps**.
- `time_left_s = night duration − (steps executed) / 60`.

### Position conventions
- `player.pos` = character's feet; `shade.pos` = shade centre; `lantern.pos` = foot of the lantern post;
  mote position = point on the ground (hover height is visual only).
- All tuning distances are measured between these points **on the horizontal XZ plane**, without adding
  any body size. "Within radius r" means distance **≤ r**.

## C. Inputs file

```json
{ "frames": [
  { "tick": 0,   "move": [0, 1], "cam_yaw_deg": 0 },
  { "tick": 120, "move": [0, 0], "interact": true },
  { "tick": 121, "interact": false },
  { "tick": 200, "pulse": true },
  { "tick": 201, "pulse": false } ] }
```

- Defaults before the first frame: `move [0,0]`, `cam_yaw_deg 0`, all buttons `false`.
- A frame only changes the fields it contains; **absent fields keep their previous value**.
- Frame `tick`s must be **strictly increasing** (no duplicates, no decrease).
- `move: [x, z]`, each component in [−1, 1]. With θ = `cam_yaw_deg` in radians, world direction is
  `x' = x·cosθ + z·sinθ`, `z' = −x·sinθ + z·cosθ` (θ = 0 → x is +X, z is +Z).
  **A vector longer than 1 must be normalised to length 1.**
- `jump`, `interact`, `pulse` (and `dash` if present): booleans; the action **triggers on a false → true
  transition**.
- No inputs file → the player stands still.

## D. Scenario file

```json
{ "player": { "pos": [0, 0, 0], "carried": 0, "flames": 3 },
  "random_motes": false, "random_shades": false,
  "motes": [[0, 0, 5]],
  "shades": [{ "pos": [10, 0, 0] }],
  "lanterns": [{ "id": "L1", "pos": [0, 0, 25], "deposited": 0 }],
  "time_left_s": 300 }
```

- `random_motes: false`: do not auto-spawn motes, only the listed ones exist.
- `random_shades: false`: do not auto-spawn shades, only the listed ones (in normal active state immediately).
- `lanterns`: updates the level's lanterns by id (`L1` … `L5`). Lanterns not mentioned keep their
  defaults; `pos` moves it; `lit: true` may be set.
- `motes`, `shades`: **replace** the corresponding initial lists; an empty array means none.
  `shades[]` entries may carry an `id` for tests to reference.
- Any absent field uses the game default.
- Building the scenario **emits no events and awards no points** (e.g. a lantern preset `lit: true` gives
  no lantern score).

## E. Output JSONL

One JSON object per line, three kinds.

**Snapshot**, every `--snapshot-every` ticks, starting at tick 0:
```json
{"type":"snapshot","tick":120,"sim_tick":120,"state":"playing","time_left_s":298.0,"score":20,
 "player":{"pos":[0.0,0.0,12.0],"flames":3,"carried":2},
 "lanterns":[{"id":"L1","pos":[0,0,25],"lit":false,"deposited":0}],
 "shades":[{"id":"S1","pos":[30.1,1.0,2.0],"state":"chase"}],
 "motes_active":19}
```
(Format illustration only — these values are not the result of the sample scenario.)

**Event**, written as soon as it happens, e.g.
`{"type":"event","tick":131,"name":"mote_picked","data":{"carried":3}}`

| name | data |
|---|---|
| `mote_picked` | `{"carried": n}` |
| `deposit` | `{"lantern_id": "L1", "amount": n, "deposited": n}` |
| `lantern_lit` | `{"lantern_id": "L1"}` |
| `pulse` | `{"stunned_ids": ["S1"]}` |
| `player_hit` | `{"by": "shade" \| "fall", "flames": n, "dropped": n}` |
| `shade_spawned` | `{"id": "S3"}` |
| `game_over` | `{"result": "won" \| "lost", "reason": "all_lit" \| "dawn" \| "no_flames"}` |

**End**, last line, mandatory: `{"type":"end","ticks":4800,"state":"won","score":1730}`

- `state` ∈ `playing`, `won`, `lost`. Shade states must include at least `stunned`; others are ours to name.
- Coordinates rounded to 3 decimals.
- **Determinism:** same `--seed`, scenario and inputs → byte-identical output across runs, including
  auto-generated ids. Teams do not need the same random sequence as each other.
- `sim_tick` = number of gameplay steps executed (equal to `tick` in Phase 1).
- A `motes` array (each element `id`, `pos`) in snapshots is recommended in v1.0.
- If an event never happens in our game (e.g. no falling), never write it.
