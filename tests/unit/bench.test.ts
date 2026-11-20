import { describe, expect, it } from 'vitest';
import { defaultInput } from '../../src/core/input';
import { createGame } from '../../src/core/sim';

describe('core bench scene (Night 1, gated)', () => {
  it('builds exactly 200 wandering shades, 100 motes and L1-L3 lit with fuel 100', () => {
    const snap = createGame({ seed: 42, bench: true }).snapshot();
    expect(snap.shades).toHaveLength(200);
    expect(snap.shades.every((s) => s.state === 'wander')).toBe(true);
    expect(snap.shades[0]!.id).toBe('S1');
    expect(snap.shades[199]!.id).toBe('S200');
    expect(snap.motes_active).toBe(100);
    expect(snap.motes).toHaveLength(100);
    expect(snap.motes[99]!.id).toBe('M100');
    expect(snap.lanterns.map((l) => [l.id, l.lit, l.fuel])).toEqual([
      ['L1', true, 100],
      ['L2', true, 100],
      ['L3', true, 100],
      ['L4', false, 0],
      ['L5', false, 0],
    ]);
    expect(snap.lanterns.slice(0, 3).every((l) => l.ever_lit)).toBe(true);
    expect(snap.player.pos).toEqual([0, 0, 0]);
  });

  it('places everything on the island, outside the lit safe zones (r < 6 around L1-L3); shades y = 1, motes y = 0', () => {
    const snap = createGame({ seed: 42, bench: true }).snapshot();
    const lit = snap.lanterns.filter((l) => l.lit);
    for (const e of [...snap.shades, ...snap.motes]) {
      expect(Math.hypot(e.pos[0], e.pos[2])).toBeLessThanOrEqual(40); // island radius 40
      for (const l of lit) expect(Math.hypot(e.pos[0] - l.pos[0], e.pos[2] - l.pos[2])).toBeGreaterThanOrEqual(6); // safe_radius 6
    }
    expect(snap.shades.every((s) => s.pos[1] === 1)).toBe(true);
    expect(snap.motes.every((m) => m.pos[1] === 0)).toBe(true);
  });

  it('runs 600 steps with default input: no spawns, hits, pickups or game over; fuel, time and counts unchanged', () => {
    const game = createGame({ seed: 42, bench: true });
    const names: string[] = [];
    for (let i = 0; i < 600; i++) for (const e of game.step(defaultInput())) names.push(e.name);
    expect(names.filter((n) => ['shade_spawned', 'player_hit', 'mote_picked', 'game_over', 'fuel_drain', 'lantern_out'].includes(n))).toEqual([]);
    const snap = game.snapshot();
    expect(snap.state).toBe('playing');
    expect(snap.shades).toHaveLength(200);
    expect(snap.motes_active).toBe(100);
    expect(snap.lanterns.slice(0, 3).map((l) => l.fuel)).toEqual([100, 100, 100]);
    expect(snap.time_left_s).toBe(240); // night 1 lasts 240 s and the clock is stopped
    expect(snap.player.flames).toBe(3);
    expect(snap.tick).toBe(600);
  });

  it('still lets shades move (wander) while the bench runs', () => {
    const game = createGame({ seed: 42, bench: true });
    const before = game.snapshot().shades.map((s) => s.pos.join());
    for (let i = 0; i < 120; i++) game.step(defaultInput());
    const after = game.snapshot().shades.map((s) => s.pos.join());
    expect(after.filter((p, i) => p !== before[i]).length).toBeGreaterThan(100);
  });

  it('is deterministic for the same seed and differs for another', () => {
    const run = (seed: number): string => {
      const g = createGame({ seed, bench: true });
      for (let i = 0; i < 300; i++) g.step(defaultInput());
      return JSON.stringify(g.snapshot());
    };
    expect(run(42)).toBe(run(42));
    expect(run(42)).not.toBe(run(43));
  });

  it('is only available for Night 1', () => {
    expect(() => createGame({ seed: 1, night: 2, bench: true })).toThrow();
    expect(() => createGame({ seed: 1, night: 3, bench: true })).toThrow();
  });

  it('does nothing when off: a normal game starts with no shades and 20 motes', () => {
    const snap = createGame({ seed: 42 }).snapshot();
    expect(snap.shades).toHaveLength(0);
    expect(snap.motes_active).toBe(20);
    expect(snap.lanterns.every((l) => !l.lit)).toBe(true);
  });
});
