// Phase 1 rules, tested directly on the core (createGame / step). Where a rule needs a situation that the scenario
// format cannot express (a shade in a given state, a stun already running), the test sets it on game.state, which is
// plain data. Expected numbers come from TUNING and src/core/rules.ts.
import { describe, expect, it } from 'vitest';
import { defaultInput } from '../../src/core/input';
import { GRAVITY, ISLAND_RADIUS, MOTE_SPAWN_POINTS, SHADE_SPAWN_POINTS } from '../../src/core/level';
import * as rules from '../../src/core/rules';
import {
  DROP_TTL,
  EVICT_MAX_TICKS,
  FALL_WAIT_TICKS,
  FALL_Y,
  MOTE_CAP,
  MOTE_SPAWN_EVERY,
  PICKUP_MAX_DY,
  PULSE_PUSH_TICKS,
  RECOIL_TICKS,
  SHADE_FIRST_SPAWN,
  SHADE_HIT_MAX_DY,
  SHADE_SPAWN_MIN_DIST,
  SHADE_WANDER_SPEED,
} from '../../src/core/rules';
import { parseScenario } from '../../src/core/scenario';
import { createGame, type Game } from '../../src/core/sim';
import { TUNING } from '../../src/core/tuning';
import type { GameEvent, InputState, Vec3 } from '../../src/core/types';

const S = TUNING.score;
const invulnTicks = Math.round(TUNING.invuln_s * 60);
const stunTicks = Math.round(TUNING.pulse_stun_s * 60);
const input = (patch: Partial<InputState> = {}): InputState => ({ ...defaultInput(), ...patch });
const idle = defaultInput();
const quiet = { random_motes: false, random_shades: false, motes: [], shades: [] };

function make(scenario: Record<string, unknown> = {}, seed = 1): Game {
  return createGame({ seed, scenario: parseScenario({ ...quiet, ...scenario }) });
}
function run(game: Game, steps: number, i: InputState = idle): GameEvent[] {
  const events: GameEvent[] = [];
  for (let k = 0; k < steps; k++) events.push(...game.step(i));
  return events;
}
const named = <N extends GameEvent['name']>(events: GameEvent[], name: N) => events.filter((e) => e.name === name);
const xz = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);

describe('rule constants', () => {
  it('are the standard rules of docs/plans/01-phase1-gameplay.md (the other tests read them from src/core/rules.ts)', () => {
    expect({ ...rules }).toMatchObject({
      PICKUP_MAX_DY: 1.5,
      MOTE_CAP: 30,
      MOTE_SPAWN_EVERY: 240,
      DROP_RING_MIN: 1.5,
      DROP_RING_MAX: 2.5,
      DROP_TTL: 480,
      SHADE_FIRST_SPAWN: 300,
      SHADE_FIRST_SPAWN_COUNT: 2,
      SHADE_SPAWN_EVERY: 480,
      SHADE_MAX: 6,
      SHADE_SPAWN_MIN_DIST: 15,
      SHADE_SPAWNING_TICKS: 30,
      SHADE_DETECT: 12,
      SHADE_LOSE: 18,
      SHADE_WANDER_SPEED: 2,
      SHADE_HIT_MAX_DY: 1.5,
      RECOIL_DIST: 2,
      RECOIL_TICKS: 60,
      PULSE_CENTER_DY: 0.8,
      PULSE_PUSH_TICKS: 15,
      EVICT_MAX_TICKS: 30,
      FALL_Y: -10,
      FALL_WAIT_TICKS: 60,
    });
  });
});

describe('pickup', () => {
  it('needs |player.y - mote.y| <= PICKUP_MAX_DY: a mote far below is ignored until Mây has dropped close enough', () => {
    const game = make({ player: { pos: [0, 2, 0] }, motes: [[0, 0, 0]] }); // starts in the air, 2 m above the mote
    let tick = 0;
    let y = NaN;
    while (tick < 60 && named(game.step(idle), 'mote_picked').length === 0) tick++;
    tick++;
    y = game.state.player.pos[1];
    // Free fall from 2 m: y(n) = 2 - g/2 (n/60)^2 first gets within PICKUP_MAX_DY of the ground after this many ticks.
    expect(tick).toBe(Math.ceil(60 * Math.sqrt((2 * (2 - PICKUP_MAX_DY)) / GRAVITY)));
    expect(y).toBeLessThanOrEqual(PICKUP_MAX_DY);
    expect(game.state.player.carried).toBe(1);
  });

  it('is by XZ distance <= pickup_radius (inclusive) and ignores motes further away', () => {
    const game = make({ motes: [[TUNING.pickup_radius, 0, 0], [TUNING.pickup_radius + 0.01, 0, 0]] });
    const events = game.step(idle);
    expect(named(events, 'mote_picked')).toHaveLength(1);
    expect(game.state.motes.map((m) => m.active)).toEqual([false, true]);
  });

  it('takes the lowest id first when there is room for only one more', () => {
    const game = make({ player: { carried: TUNING.carry_capacity - 1 }, motes: [[0, 0, 0.5], [0, 0, 0.2]] });
    game.step(idle);
    expect(game.state.motes.map((m) => m.active)).toEqual([false, true]); // M1 (0.5 m) not M2 (0.2 m)
    expect(game.state.player.carried).toBe(TUNING.carry_capacity);
  });

  it('accepts a scenario carried above capacity as is; pickup then does nothing and deposit still works', () => {
    const over = TUNING.carry_capacity + 2;
    const game = make({ player: { pos: [0, 0, 24], carried: over }, motes: [[0, 0, 24]], lanterns: [{ id: 'L1', pos: [0, 0, 25] }] });
    expect(game.snapshot().player.carried).toBe(over);
    expect(named(game.step(idle), 'mote_picked')).toEqual([]);
    expect(game.state.player.carried).toBe(over);
    const events = game.step(input({ interact: true }));
    expect(named(events, 'deposit')).toEqual([
      { name: 'deposit', data: { lantern_id: 'L1', amount: TUNING.lantern_cost, deposited: TUNING.lantern_cost } },
    ]);
    expect(game.state.player.carried).toBe(over - TUNING.lantern_cost);
  });

  it('does not pick up while waiting to respawn after a fall', () => {
    const game = make({ motes: [[0, 0, 0]] });
    game.state.player.pos[1] = -1;
    game.state.player.fallWaitTicks = 30;
    expect(run(game, 1).filter((e) => e.name !== 'night_start')).toEqual([]);
    expect(game.state.motes[0]!.active).toBe(true);
  });
});

describe('deposit', () => {
  const lanternScene = (extra: Record<string, unknown> = {}) => ({
    player: { pos: [0, 0, 24], carried: TUNING.carry_capacity },
    lanterns: [{ id: 'L1', pos: [0, 0, 25] }],
    ...extra,
  });

  it('a partly filled lantern takes only what is missing (lantern_cost - deposited), then lights', () => {
    const missing = 4;
    const game = make(lanternScene({ lanterns: [{ id: 'L1', pos: [0, 0, 25], deposited: TUNING.lantern_cost - missing }] }));
    const events = game.step(input({ interact: true })).filter((e) => e.name !== 'night_start');
    expect(events).toEqual([
      { name: 'deposit', data: { lantern_id: 'L1', amount: missing, deposited: TUNING.lantern_cost } },
      { name: 'lantern_lit', data: { lantern_id: 'L1', relight: false } },
    ]);
    expect(game.state.player.carried).toBe(TUNING.carry_capacity - missing);
    expect(game.state.score).toBe(missing * S.per_mote + S.per_lantern);
    expect(game.state.lanterns[0]).toMatchObject({ lit: true, deposited: TUNING.lantern_cost });
  });

  it('triggers on the rising edge only: holding the button deposits once', () => {
    const game = make(lanternScene({ player: { pos: [0, 0, 24], carried: 3 } }));
    expect(named(run(game, 5, input({ interact: true })), 'deposit')).toHaveLength(1);
    game.state.player.carried = 2;
    expect(run(game, 5, input({ interact: true }))).toEqual([]); // still held
    game.step(idle);
    expect(named(game.step(input({ interact: true })), 'deposit')).toHaveLength(1); // released, pressed again
    expect(game.state.lanterns[0]!.deposited).toBe(5);
  });

  it('interact_radius is inclusive; further away, or with nothing carried, nothing happens', () => {
    const at = (distance: number, carried = 5) => {
      const game = make({ player: { pos: [0, 0, 0], carried }, lanterns: [{ id: 'L1', pos: [distance, 0, 0] }] });
      return game.step(input({ interact: true }));
    };
    expect(named(at(TUNING.interact_radius), 'deposit')).toHaveLength(1);
    expect(at(TUNING.interact_radius + 0.01).filter((e) => e.name !== 'night_start')).toEqual([]);
    expect(at(1, 0).filter((e) => e.name !== 'night_start')).toEqual([]); // amount 0 -> no event
  });

  it('goes to the nearest lantern in reach that can take motes: a lit one below full is refuelled, not ignored', () => {
    const game = make({
      player: { pos: [0, 0, 0], carried: 4 },
      lanterns: [
        { id: 'L1', pos: [1.9, 0, 0] },
        { id: 'L2', pos: [1.0, 0, 0], lit: true, deposited: TUNING.lantern_cost },
        { id: 'L3', pos: [0, 0, 1.2] },
        { id: 'L4', pos: [0, 0, 1.5] },
      ],
    });
    // L2 is lit but already lost 1 unit of fuel to this tick's decay (stage 2), so it is the nearest candidate: refuel.
    const events = game.step(input({ interact: true }));
    expect(named(events, 'deposit')).toEqual([]);
    expect(named(events, 'refuel')[0]!.data).toEqual({ lantern_id: 'L2', amount: 1, fuel: 100 });
  });

  it('is not possible while waiting to respawn', () => {
    const game = make(lanternScene());
    game.state.player.fallWaitTicks = 30;
    expect(game.step(input({ interact: true })).filter((e) => e.name !== 'night_start')).toEqual([]);
    expect(game.state.player.carried).toBe(TUNING.carry_capacity);
  });
});

describe('pulse', () => {
  const pulseScene = (shades: { id?: string; pos: Vec3 }[], carried = 9) => make({ player: { carried }, shades });

  it('uses the 3D distance from (feet + 0.8 m) to the shade centre, inclusive of pulse_radius', () => {
    const R = TUNING.pulse_radius;
    const rise = 3.2; // shade height above the pulse centre for the two "tall" shades
    const flat = Math.sqrt(R * R - rise * rise); // horizontal reach at that height
    const game = pulseScene([
      { id: 'S1', pos: [R, 0.8, 0] }, // exactly pulse_radius away
      { id: 'S2', pos: [R + 0.01, 0.8, 0] }, // just outside
      { id: 'S3', pos: [flat - 0.05, 0.8 + rise, 0] }, // inside in 3D
      { id: 'S4', pos: [flat + 0.05, 0.8 + rise, 0] }, // outside in 3D although its XZ distance is below pulse_radius
    ]);
    const events = game.step(input({ pulse: true }));
    expect(named(events, 'pulse')).toEqual([{ name: 'pulse', data: { stunned_ids: ['S1', 'S3'] } }]);
    expect(game.state.score).toBe(2 * S.per_stun);
    expect(game.state.player.carried).toBe(9 - TUNING.pulse_cost);
    expect(game.state.shades.map((s) => s.state === 'stunned')).toEqual([true, false, true, false]);
  });

  it('lists stunned ids in ascending order, whatever order the scenario lists the shades in', () => {
    const game = pulseScene([{ id: 'S2', pos: [2, 0, 0] }, { id: 'S10', pos: [0, 0, 2] }, { id: 'S1', pos: [-2, 0, 0] }]);
    const [pulse] = named(game.step(input({ pulse: true })), 'pulse');
    expect(pulse).toEqual({ name: 'pulse', data: { stunned_ids: ['S1', 'S2', 'S10'] } });
  });

  it('an empty pulse still costs the motes and starts the cooldown, with an empty stunned_ids list', () => {
    const game = pulseScene([]);
    expect(game.step(input({ pulse: true })).filter((e) => e.name !== 'night_start')).toEqual([{ name: 'pulse', data: { stunned_ids: [] } }]);
    expect(game.state.player.carried).toBe(9 - TUNING.pulse_cost);
    expect(game.state.player.pulseCooldownTicks).toBe(Math.round(TUNING.pulse_cooldown_s * 60));
  });

  it('pushes pulse_push_m away from Mây over PULSE_PUSH_TICKS ticks, stuns for pulse_stun_s, then the shade wanders again', () => {
    const game = pulseScene([{ id: 'S1', pos: [0, 0, 3] }]);
    game.step(input({ pulse: true })); // step 1: pulse + first push step
    const shade = game.state.shades[0]!;
    expect(shade.state).toBe('stunned');
    expect(shade.pos[2]).toBeCloseTo(3 + TUNING.pulse_push_m / PULSE_PUSH_TICKS, 9);
    run(game, PULSE_PUSH_TICKS - 1);
    expect(shade.pos[2]).toBeCloseTo(3 + TUNING.pulse_push_m, 9);
    expect(shade.pos[0]).toBeCloseTo(0, 9);
    run(game, stunTicks - PULSE_PUSH_TICKS); // now at tick stunTicks: the last stunned tick (ticks 1 .. stunTicks)
    expect(shade.state).toBe('stunned');
    expect(shade.pos[2]).toBeCloseTo(3 + TUNING.pulse_push_m, 9);
    game.step(idle);
    expect(shade.state).not.toBe('stunned');
  });

  it('a shade on top of Mây (same XZ) is pushed towards +X', () => {
    const game = pulseScene([{ id: 'S1', pos: [0, 1, 0] }]);
    game.step(input({ pulse: true }));
    run(game, PULSE_PUSH_TICKS - 1);
    expect(game.state.shades[0]!.pos[0]).toBeCloseTo(TUNING.pulse_push_m, 9);
    expect(game.state.shades[0]!.pos[2]).toBeCloseTo(0, 9);
  });

  it('refreshes a stunned shade (full stun again, push restarts) and rescues one that is recoiling', () => {
    // Close to Mây, so that after the push they are still within pulse_radius for the second pulse.
    const game = pulseScene([{ id: 'S1', pos: [0, 0, 0.5] }, { id: 'S2', pos: [0, 0, -0.5] }], 20);
    game.state.shades[1]!.state = 'recoil';
    game.state.shades[1]!.forcedTicks = RECOIL_TICKS;
    game.step(input({ pulse: true }));
    expect(game.state.shades.map((s) => s.state)).toEqual(['stunned', 'stunned']);
    run(game, 100); // 101 ticks into the stun
    expect(game.state.shades[0]!.stunTicks).toBe(stunTicks - 100);
    game.state.player.pulseCooldownTicks = 0;
    game.step(input({ pulse: false }));
    game.step(input({ pulse: true }));
    expect(game.state.shades[0]!.stunTicks).toBe(stunTicks);
    expect(game.state.shades[0]!.forcedTicks).toBe(PULSE_PUSH_TICKS - 1); // push restarted (one step already applied)
    expect(game.state.score).toBe(4 * S.per_stun);
  });

  it('cancels an eviction in progress: the shade is stunned and pushed instead, and still ends up outside the zone', () => {
    const lantern: Vec3 = [10, 0, 10];
    const game = make({
      player: { pos: [10, 0, 14.5], carried: 5 }, // inside the zone too
      lanterns: [{ id: 'L1', pos: lantern, lit: true, deposited: TUNING.lantern_cost }],
      shades: [{ id: 'S1', pos: [10, 0, 12] }],
    });
    game.step(idle); // evicting
    expect(game.state.shades[0]!.evictTicks).toBeGreaterThan(0);
    game.step(input({ pulse: true }));
    const shade = game.state.shades[0]!;
    expect(shade.state).toBe('stunned');
    expect(shade.evictTicks).toBe(0);
    run(game, PULSE_PUSH_TICKS);
    expect(xz(shade.pos, lantern)).toBeGreaterThanOrEqual(TUNING.safe_radius);
  });

  it('does not touch a shade that is still spawning, and is refused while waiting to respawn', () => {
    const game = pulseScene([{ id: 'S1', pos: [0, 0, 3] }]);
    game.state.shades[0]!.state = 'spawning';
    game.state.shades[0]!.spawnTicks = 20;
    expect(named(game.step(input({ pulse: true })), 'pulse')).toEqual([{ name: 'pulse', data: { stunned_ids: [] } }]);
    expect(game.state.shades[0]!.state).toBe('spawning');

    const waiting = pulseScene([{ id: 'S1', pos: [0, 0, 3] }]);
    waiting.state.player.fallWaitTicks = 20;
    expect(waiting.step(input({ pulse: true })).filter((e) => e.name !== 'night_start')).toEqual([]);
    expect(waiting.state.player.carried).toBe(9);
  });

  it('triggers on the rising edge only', () => {
    const game = pulseScene([]);
    expect(named(run(game, 300, input({ pulse: true })), 'pulse')).toHaveLength(1);
  });
});

describe('shade hits', () => {
  it('need |player.y - shade.y| <= SHADE_HIT_MAX_DY as well as XZ <= shade_hit_radius', () => {
    const hitAt = (pos: Vec3) => named(make({ shades: [{ id: 'S1', pos }] }).step(idle), 'player_hit').length;
    expect(hitAt([0.5, SHADE_HIT_MAX_DY, 0])).toBe(1);
    expect(hitAt([0.5, SHADE_HIT_MAX_DY + 0.1, 0])).toBe(0);
    expect(hitAt([0.5, -SHADE_HIT_MAX_DY - 0.1, 0])).toBe(0);
    // The shade steps shade_speed/60 towards Mây before the check, so a start just inside / outside the reach
    // decides it (1e-6 margins: the distance after the step is not an exactly representable number).
    const reach = TUNING.shade_hit_radius + TUNING.shade_speed / 60;
    expect(hitAt([reach - 1e-6, 0, 0])).toBe(1);
    expect(hitAt([reach + 1e-6, 0, 0])).toBe(0);
  });

  it('only shades in wander or chase hit; spawning, stunned and recoiling shades are harmless', () => {
    for (const state of ['spawning', 'stunned', 'recoil'] as const) {
      const game = make({ shades: [{ id: 'S1', pos: [0.2, 1, 0] }] });
      const s = game.state.shades[0]!;
      s.state = state;
      s.spawnTicks = 10;
      s.stunTicks = 10;
      s.forcedTicks = 10;
      expect(named(game.step(idle), 'player_hit'), state).toEqual([]);
    }
  });

  it('is at most one hit per tick (lowest id), and the shade that did not hit waits for the next hit window', () => {
    const game = make({ player: { carried: 4 }, shades: [{ id: 'S2', pos: [0.3, 1, 0] }, { id: 'S1', pos: [-0.3, 1, 0] }] });
    const events = game.step(idle);
    expect(named(events, 'player_hit')).toHaveLength(1);
    expect(game.state.player.flames).toBe(TUNING.flames - 1);
    expect(game.state.shades.find((s) => s.id === 'S1')!.state).toBe('recoil');
    expect(game.state.shades.find((s) => s.id === 'S2')!.state).toBe('chase');
    expect(game.state.player.invulnTicks).toBe(invulnTicks);
    // Invulnerable: S2 stays in contact but cannot hit until the invulnerability is over.
    const later = run(game, invulnTicks - 1);
    expect(named(later, 'player_hit')).toEqual([]);
    expect(named(game.step(idle), 'player_hit')).toHaveLength(1);
  });

  it('drops floor(carried * hit_drop_ratio) motes with new ids; they vanish after DROP_TTL ticks', () => {
    const carried = 7;
    const game = make({ player: { carried }, motes: [[30, 0, 0]], shades: [{ id: 'S1', pos: [0.3, 1, 0] }] });
    const [hit] = named(game.step(idle), 'player_hit');
    const dropped = Math.floor(carried * TUNING.hit_drop_ratio);
    expect(hit).toEqual({ name: 'player_hit', data: { by: 'shade', flames: TUNING.flames - 1, dropped } });
    expect(game.state.player.carried).toBe(carried - dropped);
    const fresh = game.state.motes.slice(1);
    expect(fresh.map((m) => m.id)).toEqual(Array.from({ length: dropped }, (_, i) => `M${i + 2}`));
    expect(fresh.every((m) => m.active && m.ttl === DROP_TTL)).toBe(true);

    game.state.shades.length = 0; // no more hits: watch the motes expire
    const active = () => game.state.motes.filter((m) => m.active).length;
    run(game, DROP_TTL - 1); // tick DROP_TTL: the last tick they exist
    expect(active()).toBe(1 + dropped);
    game.step(idle);
    expect(active()).toBe(1); // only the listed mote is left
    expect(game.snapshot().motes_active).toBe(1);
  });

  it('the shade recoils RECOIL_TICKS ticks away from Mây and is then in wander again', () => {
    const game = make({ shades: [{ id: 'S1', pos: [0, 1, 0.3] }] });
    game.step(idle);
    const shade = game.state.shades[0]!;
    expect(shade.state).toBe('recoil');
    run(game, RECOIL_TICKS - 1);
    expect(shade.state).toBe('recoil');
    game.step(idle);
    expect(shade.state).toBe('wander');
    expect(shade.pos[2]).toBeGreaterThan(1.5); // backed off along +Z
  });

  it('cannot hit Mây while she waits to respawn, nor during the invulnerability that follows', () => {
    const game = make({ shades: [{ id: 'S1', pos: [0.3, 1, 0] }] });
    game.state.player.pos[1] = -0.5; // within vertical reach: only the fall-wait can protect her
    game.state.player.fallWaitTicks = 20;
    const events: GameEvent[] = [];
    // 19 waiting steps + the respawn step + (invulnTicks - 1) invulnerable steps, with the shade pinned on top of her.
    for (let t = 0; t < 20 + invulnTicks - 1; t++) {
      game.state.shades[0]!.pos = [0.3, 1, 0];
      game.state.shades[0]!.state = 'wander';
      events.push(...game.step(idle));
    }
    expect(named(events, 'player_hit')).toEqual([]);
    expect(game.state.player.pos).toEqual([0, 0, 0]);
    game.state.shades[0]!.pos = [0.3, 1, 0];
    game.state.shades[0]!.state = 'wander';
    expect(named(game.step(idle), 'player_hit')).toHaveLength(1); // the first tick without protection
  });
});

describe('shade movement', () => {
  it('wander: walks at SHADE_WANDER_SPEED and keeps its own height', () => {
    const game = make({ player: { pos: [0, 0, 0] }, shades: [{ id: 'S1', pos: [30, 1.7, 0] }] });
    const shade = game.state.shades[0]!;
    const step = SHADE_WANDER_SPEED / 60;
    let moving = 0;
    for (let t = 0; t < 400; t++) {
      const before: Vec3 = [shade.pos[0], shade.pos[1], shade.pos[2]];
      game.step(idle);
      const d = xz(before, shade.pos);
      expect(d).toBeLessThanOrEqual(step + 1e-9);
      if (Math.abs(d - step) < 1e-9) moving++;
      expect(shade.pos[1]).toBe(1.7);
      if (shade.state !== 'wander') break; // it may wander close enough to Mây to start chasing
    }
    expect(moving).toBeGreaterThan(50);
  });

  it('chase: a shade that has detected Mây moves at shade_speed straight towards her', () => {
    const game = make({ shades: [{ id: 'S1', pos: [8, 0, 0] }] });
    game.step(idle); // wander -> chase (8 m <= 12)
    const x1 = game.state.shades[0]!.pos[0];
    expect(game.state.shades[0]!.state).toBe('chase');
    expect(x1).toBeCloseTo(8 - TUNING.shade_speed / 60, 9);
    run(game, 9);
    expect(game.state.shades[0]!.pos[0]).toBeCloseTo(8 - (10 * TUNING.shade_speed) / 60, 9);
  });

  it('a chasing shade does not chase while Mây waits to respawn', () => {
    const game = make({ shades: [{ id: 'S1', pos: [8, 0, 0] }] });
    game.step(idle);
    expect(game.state.shades[0]!.state).toBe('chase');
    game.state.player.fallWaitTicks = 30;
    game.state.player.pos[1] = -20;
    game.step(idle);
    expect(game.state.shades[0]!.state).toBe('wander');
  });

  it('a shade inside a lantern that the scenario lights is moved out from step 0, harmlessly, radially (+X from the centre)', () => {
    const lantern = [10, 0, 10] as Vec3;
    const game = make({
      player: { pos: [10, 0, 10.5] },
      lanterns: [{ id: 'L1', pos: lantern, lit: true, deposited: TUNING.lantern_cost }],
      shades: [{ id: 'S1', pos: [10, 0, 10] }, { id: 'S2', pos: [10, 0, 12] }, { id: 'S3', pos: [10, 0, 15.5] }], // S1 exactly on the lantern
    });
    const s1 = game.state.shades[0]!;
    const s2 = game.state.shades[1]!;
    const s3 = game.state.shades[2]!;
    const events = run(game, EVICT_MAX_TICKS);
    expect(named(events, 'player_hit')).toEqual([]); // both start inside, one within hit range of Mây
    expect(xz(s1.pos, lantern)).toBeGreaterThanOrEqual(TUNING.safe_radius);
    expect(xz(s2.pos, lantern)).toBeGreaterThanOrEqual(TUNING.safe_radius);
    expect(s1.pos[2]).toBeCloseTo(10, 9); // from the exact centre it leaves towards +X
    expect(s1.pos[0]).toBeGreaterThan(10 + TUNING.safe_radius - 0.01);
    expect(s2.pos[0]).toBeCloseTo(10, 9); // S2 was straight above (+Z) of the centre, and leaves that way
    expect(xz(s3.pos, lantern)).toBeGreaterThanOrEqual(TUNING.safe_radius);
    expect(game.state.shades.every((s) => s.evictTicks === 0)).toBe(true);
    // Never slower than shade_speed: S3 (half a metre inside the edge) is out after ceil(0.5 / (shade_speed/60)) ticks.
    const quick = make({
      lanterns: [{ id: 'L1', pos: lantern, lit: true, deposited: TUNING.lantern_cost }],
      shades: [{ id: 'S3', pos: [10, 0, 10 + TUNING.safe_radius - 0.5] }],
    });
    run(quick, Math.ceil(0.5 / (TUNING.shade_speed / 60)) + 1);
    expect(xz(quick.state.shades[0]!.pos, lantern)).toBeGreaterThanOrEqual(TUNING.safe_radius);
    expect(quick.state.shades[0]!.evictTicks).toBe(0);
  });

  it('shades spawned later never appear inside a lit safe zone (four lanterns lit on top of spawn points)', () => {
    const lanterns = SHADE_SPAWN_POINTS.slice(0, 4).map((p, i) => ({ id: `L${i + 1}`, pos: p, lit: true, deposited: TUNING.lantern_cost }));
    for (let seed = 1; seed <= 30; seed++) {
      const game = make({ random_shades: true, player: { flames: 100 }, lanterns }, seed);
      run(game, SHADE_FIRST_SPAWN);
      expect(game.state.shades).toHaveLength(2);
      for (const s of game.state.shades) {
        for (const l of game.state.lanterns) expect(xz(s.pos, l.pos), `seed ${seed}`).toBeGreaterThanOrEqual(TUNING.safe_radius);
      }
    }
  });

  it('shades spawned together never share a spawn point, and never within SHADE_SPAWN_MIN_DIST of Mây', () => {
    // Mây stands on the ring half way between two spawn points (9.6 m from each): both are too close.
    const between: Vec3 = [37 * Math.cos(Math.PI / 6), 0, 37 * Math.sin(Math.PI / 6)];
    for (let seed = 1; seed <= 60; seed++) {
      const game = make({ random_shades: true, player: { pos: between, flames: 100 } }, seed);
      run(game, SHADE_FIRST_SPAWN);
      const [a, b] = game.state.shades;
      expect(a!.pos, `seed ${seed}`).not.toEqual(b!.pos);
      for (const s of game.state.shades) expect(xz(s.pos, game.state.player.pos), `seed ${seed}`).toBeGreaterThanOrEqual(SHADE_SPAWN_MIN_DIST);
    }
  });

  it('new shade ids continue after the highest id used (max + 1), even when the scenario used a high id', () => {
    const game = make({ random_shades: true, player: { flames: 100 }, shades: [{ id: 'S7', pos: [0, 1, 35] }] });
    const events = run(game, SHADE_FIRST_SPAWN);
    expect(named(events, 'shade_spawned').map((e) => e.data)).toEqual([{ id: 'S8' }, { id: 'S9' }]);
  });
});

describe('mote spawns', () => {
  it('a random mote appears every MOTE_SPAWN_EVERY ticks on a free spawn point; none while every point is taken', () => {
    const taken = MOTE_SPAWN_POINTS.slice(1); // all but the first spawn point
    const game = make({ random_motes: true, motes: taken });
    expect(game.snapshot().motes_active).toBe(taken.length);
    run(game, MOTE_SPAWN_EVERY - 1);
    expect(game.snapshot().motes_active).toBe(taken.length);
    game.step(idle);
    expect(game.snapshot().motes_active).toBe(taken.length + 1);
    const newest = game.state.motes.at(-1)!;
    expect(newest.pos).toEqual(MOTE_SPAWN_POINTS[0]);
    expect(newest.id).toBe(`M${taken.length + 1}`);
    expect(newest.ttl).toBeUndefined(); // random motes do not expire
    run(game, MOTE_SPAWN_EVERY * 3);
    expect(game.snapshot().motes_active).toBe(taken.length + 1); // full: no free point
  });

  it('is capped at MOTE_CAP active motes', () => {
    const many = Array.from({ length: MOTE_CAP }, (_, i): Vec3 => [i * 0.5 - 7, 0, 38]);
    const game = make({ random_motes: true, motes: many, player: { pos: [0, 0, 0] } });
    run(game, MOTE_SPAWN_EVERY * 2);
    expect(game.snapshot().motes_active).toBe(MOTE_CAP);
    const fewer = make({ random_motes: true, motes: many.slice(1), player: { pos: [0, 0, 0] } });
    run(fewer, MOTE_SPAWN_EVERY * 2);
    expect(fewer.snapshot().motes_active).toBe(MOTE_CAP);
  });

  it('with random_motes false nothing ever spawns', () => {
    const game = make({ random_motes: false, motes: [] });
    run(game, MOTE_SPAWN_EVERY * 3);
    expect(game.snapshot().motes_active).toBe(0);
  });
});

describe('falling', () => {
  const edge = { player: { pos: [ISLAND_RADIUS - 0.5, 0, 0], carried: 5 } };

  it('the penalty comes once per fall and ignores invulnerability; the respawn is at the start with a fresh invulnerability', () => {
    const game = make(edge);
    game.state.player.invulnTicks = 500; // no protection from falling
    const events = run(game, 200, input({ move: [1, 0] })); // keeps pushing +X, also after the respawn at the centre
    expect(named(events, 'player_hit')).toEqual([
      { name: 'player_hit', data: { by: 'fall', flames: TUNING.flames - 1, dropped: 0, lost: 5 } },
    ]);
    expect(game.state.player.carried).toBe(0);
    expect(game.state.player.flames).toBe(TUNING.flames - 1);
    expect(game.state.player.invulnTicks).toBeGreaterThan(0);
    expect(game.state.player.invulnTicks).toBeLessThanOrEqual(invulnTicks); // reset by the respawn, not the 500
    expect(game.state.player.pos[1]).toBe(0);
  });

  it('Mây is frozen for FALL_WAIT_TICKS after the fall (whatever she presses), then respawns at the start at rest', () => {
    const game = make(edge);
    let T = 0;
    while (named(game.step(input({ move: [1, 0] })), 'player_hit').length === 0) T++;
    T += 1; // the tick of the fall
    expect(game.state.tick).toBe(T);
    const frozen = [...game.state.player.pos];
    expect(frozen[1]).toBeLessThanOrEqual(FALL_Y);
    for (let t = T + 1; t < T + FALL_WAIT_TICKS; t++) {
      game.step(input({ move: [1, 1], jump: t % 2 === 0 }));
      expect(game.state.player.pos, `tick ${t}`).toEqual(frozen);
    }
    game.step(input({ move: [1, 0] })); // tick T + FALL_WAIT_TICKS: respawn, no walking on that tick
    expect(game.state.player.pos).toEqual([0, 0, 0]);
    expect(game.state.player.vel).toEqual([0, 0, 0]);
    expect(game.state.player.grounded).toBe(true);
    expect(game.state.player.invulnTicks).toBe(invulnTicks);
  });

  it('with fall_enabled false the island edge is a wall: no fall, no event', () => {
    const game = createGame({
      seed: 1,
      tuning: { ...TUNING, fall_enabled: false },
      scenario: parseScenario({ ...quiet, ...edge }),
    });
    const events = run(game, 300, input({ move: [1, 0] })).filter((e) => e.name !== 'night_start');
    expect(events).toEqual([]);
    expect(game.state.player.pos[0]).toBeCloseTo(ISLAND_RADIUS, 9);
    expect(game.state.player.pos[1]).toBe(0);
    expect(game.state.player.grounded).toBe(true);
  });
});

describe('ending the night', () => {
  const lastLantern = (extra: Record<string, unknown> = {}) => ({
    player: { pos: [0, 0, 24], carried: TUNING.lantern_cost },
    lanterns: [
      { id: 'L1', pos: [0, 0, 25] },
      ...['L2', 'L3', 'L4', 'L5'].map((id) => ({ id, lit: true, deposited: TUNING.lantern_cost })),
    ],
    ...extra,
  });

  it('no_flames is checked before all_lit: with no flames left and every lantern lit, the night is lost', () => {
    const game = make({ player: { flames: 0 }, lanterns: [1, 2, 3, 4, 5].map((n) => ({ id: `L${n}`, lit: true })) });
    expect(game.step(idle).filter((e) => e.name !== 'night_start')).toEqual([{ name: 'game_over', data: { result: 'lost', reason: 'no_flames' } }]);
    expect(game.state.state).toBe('lost');
    expect(game.state.score).toBe(0); // no win bonus
  });

  it('a shade cannot hit while Mây lights a lantern beside it: lighting evicts it first (safe_radius > interact_radius + hit radius)', () => {
    const game = make(lastLantern({ shades: [{ id: 'S1', pos: [0.3, 1, 24] }] }));
    const events = game.step(input({ interact: true }));
    expect(named(events, 'player_hit')).toEqual([]);
    expect(named(events, 'game_over')).toEqual([]); // lighting the last lantern no longer wins early
  });

  it('lighting the last lantern on the tick the time runs out is a dawn win with the dawn bonus', () => {
    const game = make(lastLantern({ time_left_s: 1 / 60 }));
    const events = game.step(input({ interact: true }));
    expect(game.state.timeLeftS).toBe(0);
    expect(named(events, 'game_over')).toEqual([{ name: 'game_over', data: { result: 'won', reason: 'dawn_survived' } }]);
    // 10 motes * 5 + 100 (first light) = 150; dawn: L1 just lit = 6000 units -> 50 + 100 = 150, L2..L5 had 1 tick of
    // decay = 5999 units -> 50 + 99 = 149 each (596); flames 3 * 50 = 150. Total 150 + 150 + 596 + 150 = 1046.
    expect(game.state.score).toBe(1046);
  });

  it('there is no seconds bonus and no early win: lighting the last lantern with time left only scores the light', () => {
    const game = make(lastLantern({ time_left_s: 123.5, player: { pos: [0, 0, 24], carried: TUNING.lantern_cost, flames: 2 } }));
    game.step(input({ interact: true }));
    expect(game.state.score).toBe(TUNING.lantern_cost * S.per_mote + S.per_lantern); // 50 + 100, no per_second_left, no flames bonus
    expect(game.state.state).toBe('playing');
  });

  it('a game that starts with 0 flames or 0 seconds ends at the first step (all lanterns lit does not)', () => {
    const noFlames = make({ player: { flames: 0 } });
    expect(noFlames.step(idle).filter((e) => e.name !== 'night_start')).toEqual([{ name: 'game_over', data: { result: 'lost', reason: 'no_flames' } }]);
    const noTime = make({ time_left_s: 0 });
    expect(noTime.step(idle).filter((e) => e.name !== 'night_start')).toEqual([{ name: 'game_over', data: { result: 'lost', reason: 'dawn' } }]);
    const allLit = make({ lanterns: [1, 2, 3, 4, 5].map((n) => ({ id: `L${n}`, lit: true })), time_left_s: 10 });
    expect(allLit.step(idle).filter((e) => e.name !== 'night_start')).toEqual([]); // all lit no longer ends the game
    expect(allLit.state.state).toBe('playing');
    expect(allLit.state.score).toBe(0);
  });

  it('after game over step() is inert: no events, no tick, no change', () => {
    const game = make({ time_left_s: 1 / 60 });
    game.step(idle);
    const before = JSON.stringify(game.snapshot());
    expect(game.step(input({ move: [1, 0] }))).toEqual([]);
    expect(JSON.stringify(game.snapshot())).toBe(before);
    expect(game.state.tick).toBe(1);
  });
});

describe('streams', () => {
  it('different seeds give different shade spawn points; the same seed repeats exactly', () => {
    const positions = (seed: number) => {
      const game = make({ random_shades: true, player: { flames: 100 } }, seed);
      run(game, SHADE_FIRST_SPAWN);
      return JSON.stringify(game.state.shades.map((s) => s.pos));
    };
    expect(positions(4)).toBe(positions(4));
    const distinct = new Set([1, 2, 3, 4, 5, 6].map(positions));
    expect(distinct.size).toBeGreaterThan(2);
  });
});
