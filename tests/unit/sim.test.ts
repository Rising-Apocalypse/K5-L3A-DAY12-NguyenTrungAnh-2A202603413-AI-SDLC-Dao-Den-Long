import { describe, expect, it } from 'vitest';
import { FormatError } from '../../src/core/errors';
import { defaultInput } from '../../src/core/input';
import {
  GRAVITY,
  ISLAND_RADIUS,
  JUMP_SPEED,
  MOTE_SPAWN_POINTS,
  SHADE_SPAWN_POINTS,
  buildLanterns,
} from '../../src/core/level';
import { Rng } from '../../src/core/rng';
import { FALL_Y } from '../../src/core/rules';
import { parseScenario } from '../../src/core/scenario';
import { createGame } from '../../src/core/sim';
import { TUNING } from '../../src/core/tuning';
import type { Extra, InputState } from '../../src/core/types';

const input = (patch: Partial<InputState> = {}): InputState => ({ ...defaultInput(), ...patch });
const idle = defaultInput();

describe('tick model', () => {
  it('N steps -> tick N, sim_tick N, time_left_s = start - N/60', () => {
    const game = createGame({ seed: 1 });
    expect(game.state.tick).toBe(0);
    expect(game.snapshot().time_left_s).toBe(TUNING.night1_duration_s);
    for (let i = 0; i < 100; i++) game.step(idle);
    expect(game.state.tick).toBe(100);
    expect(game.state.simTick).toBe(100);
    expect(game.state.timeLeftS).toBeCloseTo(TUNING.night1_duration_s - 100 / 60, 12);
    const snap = game.snapshot();
    expect(snap.tick).toBe(100);
    expect(snap.sim_tick).toBe(100);
    expect(snap.time_left_s).toBe(238.333); // 240 - 100/60 = 238.3333..
    expect(snap.state).toBe('playing');
  });

  it('uses scenario time_left_s as the start, computed from the integer step count', () => {
    // No shades, so nothing but the clock matters. 50 s = 3000 steps; the game ends exactly there (dawn).
    const scenario = parseScenario({ time_left_s: 50, random_shades: false });
    const game = createGame({ seed: 1, scenario });
    for (let i = 0; i < 2999; i++) game.step(idle);
    expect(game.state.timeLeftS).toBe(50 - 2999 / 60);
    expect(game.state.state).toBe('playing');
    game.step(idle);
    expect(game.state.timeLeftS).toBe(0);
    expect(game.state.state).toBe('lost');
  });

  it('snapshot has the contract key order', () => {
    const snap = createGame({ seed: 1 }).snapshot();
    expect(Object.keys(snap)).toEqual([
      'type', 'tick', 'sim_tick', 'night', 'state', 'time_left_s', 'score', 'wind', 'player', 'lanterns', 'shades', 'motes_active', 'motes', 'drifters', 'charms',
    ]);
    expect(Object.keys(snap.player)).toEqual([
      'pos', 'vel', 'grounded', 'flames', 'carried', 'capacity', 'invuln', 'dash_cd_s', 'pulse_cd_s', 'charm_s',
    ]);
    expect(Object.keys(snap.lanterns[0]!)).toEqual(['id', 'pos', 'lit', 'deposited', 'fuel', 'ever_lit', 'relit_count']);
    expect(Object.keys(snap.motes[0]!)).toEqual(['id', 'pos', 'kind', 'ttl_s']);
  });

  it('snapshot coordinates are rounded to 3 decimals and never -0', () => {
    const game = createGame({ seed: 1 });
    for (let i = 0; i < 7; i++) game.step(input({ move: [0.123456, -0.654321], camYawDeg: 33.3 }));
    const snap = game.snapshot();
    for (const c of snap.player.pos) expect(Math.round(c * 1000) / 1000).toBe(c);
    expect(snap.player.pos.some((c) => Object.is(c, -0))).toBe(false);
    expect(Object.is(createGame({ seed: 1 }).snapshot().player.pos[0], -0)).toBe(false);
  });
});

describe('movement', () => {
  it('move [0,1] for 60 ticks from the origin ends at z = player_speed', () => {
    const game = createGame({ seed: 1 });
    for (let i = 0; i < 60; i++) game.step(input({ move: [0, 1] }));
    expect(game.state.player.pos[0]).toBeCloseTo(0, 9);
    expect(game.state.player.pos[1]).toBe(0);
    expect(game.state.player.pos[2]).toBeCloseTo(TUNING.player_speed, 9);
  });

  it('follows the camera yaw (yaw 90: forward goes +X) and normalises diagonals', () => {
    const game = createGame({ seed: 1 });
    for (let i = 0; i < 60; i++) game.step(input({ move: [0, 1], camYawDeg: 90 }));
    expect(game.state.player.pos[0]).toBeCloseTo(TUNING.player_speed, 9);
    expect(game.state.player.pos[2]).toBeCloseTo(0, 9);

    const diag = createGame({ seed: 1 });
    for (let i = 0; i < 60; i++) diag.step(input({ move: [1, 1] }));
    expect(Math.hypot(diag.state.player.pos[0], diag.state.player.pos[2])).toBeCloseTo(TUNING.player_speed, 9);
  });

  it('stands still with no input', () => {
    const game = createGame({ seed: 1 });
    for (let i = 0; i < 120; i++) game.step(idle);
    expect(game.state.player.pos).toEqual([0, 0, 0]);
  });

  it('stops instantly (velocity is set, not accumulated)', () => {
    const game = createGame({ seed: 1 });
    game.step(input({ move: [0, 1] }));
    const z = game.state.player.pos[2];
    game.step(idle);
    expect(game.state.player.pos[2]).toBe(z);
    expect(game.state.player.vel[2]).toBe(0);
  });

  it('facing is the last non-zero move direction, initially +Z', () => {
    const game = createGame({ seed: 1 });
    expect(game.state.player.facing).toEqual([0, 1]);
    game.step(input({ move: [1, 0] }));
    expect(game.state.player.facing[0]).toBeCloseTo(1, 12);
    expect(game.state.player.facing[1]).toBeCloseTo(0, 12);
    game.step(idle);
    expect(game.state.player.facing[0]).toBeCloseTo(1, 12);
  });
});

describe('jump and island edge', () => {
  it('jump apex is JUMP_SPEED^2 / (2 * GRAVITY) = 1.225 m and the player lands again', () => {
    const game = createGame({ seed: 1 });
    let apex = 0;
    game.step(input({ jump: true }));
    expect(game.state.player.grounded).toBe(false);
    for (let i = 0; i < 100; i++) {
      game.step(input({ jump: true })); // held: no new rising edge, so no second jump
      apex = Math.max(apex, game.state.player.pos[1]);
    }
    expect(apex).toBeCloseTo(JUMP_SPEED ** 2 / (2 * GRAVITY), 9);
    expect(apex).toBeCloseTo(1.225, 9);
    expect(game.state.player.pos[1]).toBe(0);
    expect(game.state.player.grounded).toBe(true);
  });

  it('jump triggers on the rising edge only, and not in mid-air', () => {
    const game = createGame({ seed: 1 });
    game.step(input({ jump: true }));
    game.step(input({ jump: false }));
    game.step(input({ jump: true })); // rising edge while airborne: ignored
    let apex = 0;
    for (let i = 0; i < 80; i++) {
      game.step(idle);
      apex = Math.max(apex, game.state.player.pos[1]);
    }
    expect(apex).toBeLessThanOrEqual(1.225 + 1e-9);
    expect(game.state.player.grounded).toBe(true);
  });

  it('has full air control while jumping', () => {
    const game = createGame({ seed: 1 });
    game.step(input({ jump: true, move: [0, 1] }));
    game.step(input({ jump: true, move: [0, 1] }));
    expect(game.state.player.grounded).toBe(false);
    expect(game.state.player.pos[2]).toBeCloseTo((2 * TUNING.player_speed) / 60, 12);
  });

  it('walking past ISLAND_RADIUS is not clamped: the player falls and never lands', () => {
    const scenario = parseScenario({ player: { pos: [ISLAND_RADIUS - 0.05, 0, 0] }, random_shades: false });
    const game = createGame({ seed: 1, scenario });
    expect(game.state.player.grounded).toBe(true);
    // 50 steps: well past the edge and falling, but not yet below the penalty line (that is covered by the
    // fall tests in tests/cli/gameplay.test.ts).
    for (let i = 0; i < 50; i++) game.step(input({ move: [1, 0] }));
    const p = game.state.player;
    expect(p.pos[0]).toBeGreaterThan(ISLAND_RADIUS);
    expect(p.grounded).toBe(false);
    expect(p.pos[1]).toBeLessThan(-1);
    expect(p.pos[1]).toBeGreaterThan(FALL_Y);
    // Still falling while moving back over the island from below: no teleport back to the ground.
    const y = p.pos[1];
    game.step(input({ move: [-1, 0] }));
    expect(game.state.player.pos[1]).toBeLessThan(y);
  });

  it('a player standing exactly on the edge (distance == ISLAND_RADIUS) still has ground', () => {
    const scenario = parseScenario({ player: { pos: [ISLAND_RADIUS, 0, 0] } });
    const game = createGame({ seed: 1, scenario });
    game.step(idle);
    expect(game.state.player.grounded).toBe(true);
    expect(game.state.player.pos[1]).toBe(0);
  });

  it('a jump can be made from the edge and lands back on the island', () => {
    const scenario = parseScenario({ player: { pos: [0, 0, 38] } });
    const game = createGame({ seed: 1, scenario });
    game.step(input({ jump: true, move: [0, 1] })); // moves out to 38.1, still on the island
    for (let i = 0; i < 60; i++) game.step(idle);
    expect(game.state.player.grounded).toBe(true);
    expect(game.state.player.pos[1]).toBe(0);
  });
});

describe('level and scenario building', () => {
  it('default level: Great Lanterns at the standard positions, all unlit', () => {
    const snap = createGame({ seed: 5 }).snapshot();
    expect(snap.lanterns.map((l) => l.id)).toEqual(['L1', 'L2', 'L3', 'L4', 'L5']);
    expect(snap.lanterns.map((l) => l.pos)).toEqual([
      [0, 0, 25], [23.8, 0, 7.7], [14.7, 0, -20.2], [-14.7, 0, -20.2], [-23.8, 0, 7.7],
    ]);
    expect(snap.lanterns.every((l) => !l.lit && l.deposited === 0)).toBe(true);
    expect(buildLanterns().length).toBe(TUNING.lantern_count_night1);
  });

  it('default level: exactly 20 motes on distinct spawn points, and 0 shades', () => {
    expect(MOTE_SPAWN_POINTS.length).toBe(24);
    expect(SHADE_SPAWN_POINTS.length).toBe(12);
    const game = createGame({ seed: 9 });
    expect(game.state.shades).toEqual([]);
    expect(game.state.motes.length).toBe(20);
    expect(game.state.motes.map((m) => m.id)).toEqual(Array.from({ length: 20 }, (_, i) => `M${i + 1}`));
    const spawnIndex = game.state.motes.map((m) =>
      MOTE_SPAWN_POINTS.findIndex((p) => p[0] === m.pos[0] && p[1] === m.pos[1] && p[2] === m.pos[2]),
    );
    expect(spawnIndex.every((i) => i >= 0)).toBe(true);
    expect(new Set(spawnIndex).size).toBe(20);
    expect(game.state.motes.every((m) => m.active)).toBe(true);
    expect(game.snapshot().motes_active).toBe(20);
  });

  it('spawn points follow the angle convention [r*cos a, 0, r*sin a] (90 degrees -> +Z)', () => {
    const radii = MOTE_SPAWN_POINTS.map((p) => Math.hypot(p[0], p[2]));
    expect(radii.slice(0, 8).every((r) => Math.abs(r - 12) < 1e-9)).toBe(true);
    expect(radii.slice(8).every((r) => Math.abs(r - 33) < 1e-9)).toBe(true);
    expect(MOTE_SPAWN_POINTS[0]).toEqual([12, 0, 0]);
    expect(MOTE_SPAWN_POINTS[2]![2]).toBeCloseTo(12, 9); // 90 degrees
    expect(MOTE_SPAWN_POINTS[2]![0]).toBeCloseTo(0, 9);
    expect(SHADE_SPAWN_POINTS.every((p) => Math.abs(Math.hypot(p[0], p[2]) - 37) < 1e-9)).toBe(true);
    expect(SHADE_SPAWN_POINTS[0]![0]).toBeCloseTo(37 * Math.cos(Math.PI / 12), 9);
  });

  it('the mote choice depends on the seed and is reproducible', () => {
    const ids = (seed: number) => JSON.stringify(createGame({ seed }).snapshot().motes);
    expect(ids(1)).toBe(ids(1));
    expect(ids(1)).not.toBe(ids(2));
    expect(ids(-3)).toBe(ids(-3));
  });

  it('random_motes:false with no list means no motes; a list replaces the defaults', () => {
    expect(createGame({ seed: 1, scenario: parseScenario({ random_motes: false }) }).state.motes).toEqual([]);
    const listed = createGame({ seed: 1, scenario: parseScenario({ motes: [[0, 0, 5], [3, 0, 4]] }) });
    expect(listed.state.motes).toEqual([
      { id: 'M1', pos: [0, 0, 5], active: true, kind: 'random' },
      { id: 'M2', pos: [3, 0, 4], active: true, kind: 'random' },
    ]);
    expect(createGame({ seed: 1, scenario: parseScenario({ motes: [] }) }).state.motes).toEqual([]);
  });

  it('scenario build emits no events and awards no points (even for a pre-lit lantern)', () => {
    const scenario = parseScenario({
      player: { pos: [1, 0, 2], carried: 4, flames: 2 },
      lanterns: [{ id: 'L3', lit: true, deposited: 10 }],
      time_left_s: 120,
    });
    const game = createGame({ seed: 1, scenario });
    expect(game.state.score).toBe(0);
    expect(game.snapshot().score).toBe(0);
    expect(game.snapshot().tick).toBe(0);
    expect(game.state.timeLeftS).toBe(120);
    expect(game.state.player).toMatchObject({ pos: [1, 0, 2], carried: 4, flames: 2 });
    expect(game.snapshot().lanterns[2]).toEqual({ id: 'L3', pos: [14.7, 0, -20.2], lit: true, deposited: 10, fuel: 100, ever_lit: true, relit_count: 0 });
    for (let i = 0; i < 30; i++) expect(game.step(idle).filter((e) => e.name !== 'night_start')).toEqual([]);
    expect(game.state.score).toBe(0);
  });

  it('lantern overrides apply by id; the others keep their defaults', () => {
    const scenario = parseScenario({ lanterns: [{ id: 'L2', pos: [1, 0, 2] }, { id: 'L1', pos: [0, 0, 30], deposited: 3 }] });
    const lanterns = createGame({ seed: 1, scenario }).state.lanterns;
    expect(lanterns[0]).toEqual({ id: 'L1', pos: [0, 0, 30], lit: false, deposited: 3, fuelUnits: 0, everLit: false, relitCount: 0 });
    expect(lanterns[1]).toEqual({ id: 'L2', pos: [1, 0, 2], lit: false, deposited: 0, fuelUnits: 0, everLit: false, relitCount: 0 });
    expect(lanterns[2]).toEqual({ id: 'L3', pos: [14.7, 0, -20.2], lit: false, deposited: 0, fuelUnits: 0, everLit: false, relitCount: 0 });
  });

  it('an unknown lantern id is a FormatError', () => {
    const scenario = parseScenario({ lanterns: [{ id: 'L9', pos: [0, 0, 0] }] });
    expect(() => createGame({ seed: 1, scenario })).toThrow(FormatError);
  });

  it('shade ids: keep given ids, assign the lowest unused S<n> in listed order; listed shades start in wander', () => {
    const scenario = parseScenario({
      shades: [{ pos: [1, 0, 0] }, { pos: [2, 0, 0], id: 'S1' }, { pos: [3, 0, 0] }, { pos: [4, 0, 0], id: 'boss' }, { pos: [5, 0, 0] }],
    });
    const game = createGame({ seed: 1, scenario });
    expect(game.state.shades.map((s) => s.id)).toEqual(['S2', 'S1', 'S3', 'boss', 'S4']);
    expect(game.state.shades.every((s) => s.state === 'wander')).toBe(true);
    expect(game.state.shades[0]!.pos).toEqual([1, 0, 0]);
    expect(game.state.nextShadeNum).toBe(5);
    expect(createGame({ seed: 1 }).state.nextShadeNum).toBe(1);
  });

  it('is deterministic: same seed + scenario + inputs -> identical snapshots', () => {
    const run = () => {
      const game = createGame({ seed: 77 });
      const snaps: string[] = [];
      for (let i = 0; i < 200; i++) {
        game.step(input({ move: [Math.sin(i / 10), Math.cos(i / 10)], camYawDeg: i, jump: i % 50 === 0 }));
        if (i % 20 === 0) snaps.push(JSON.stringify(game.snapshot()));
      }
      return snaps;
    };
    expect(run()).toEqual(run());
  });
});

describe('extras (web only)', () => {
  it('hooks run on build and on every step with the dedicated "extras" stream', () => {
    const calls: string[] = [];
    const draws: number[] = [];
    const extra: Extra = {
      onBuild: (_state, rng) => {
        calls.push('build');
        draws.push(rng.next());
      },
      onStep: (state, _input, rng) => {
        calls.push(`step${state.tick}`);
        draws.push(rng.next());
      },
    };
    const game = createGame({ seed: 5, extras: [extra] });
    game.step(idle);
    game.step(idle);
    expect(calls).toEqual(['build', 'step1', 'step2']);
    const reference = new Rng(5, 'extras');
    expect(draws).toEqual([reference.next(), reference.next(), reference.next()]);
  });

  it('drawing from the extras stream does not change the level', () => {
    const noisy: Extra = { onBuild: (_s, rng) => void rng.next() };
    expect(createGame({ seed: 5, extras: [noisy] }).snapshot()).toEqual(createGame({ seed: 5 }).snapshot());
  });
});
