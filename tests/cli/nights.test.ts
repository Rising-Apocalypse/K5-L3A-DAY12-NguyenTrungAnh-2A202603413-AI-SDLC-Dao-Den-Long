// Nights 2 and 3 (docs/plans/04-phase2-nights-2-3-core.md section 6). Every test runs the REAL headless CLI on a fixture
// tests/scenarios/n2-* / n3-* (or an inline scenario). Every expected number below is a literal worked out by hand from
// the rules; the arithmetic is in the comment next to it. Nothing is copied from what the sim printed.
// Common facts: 1 tick = 1/60 s, run speed 6 m/s = 0.1 m per tick, gravity 20 m/s^2, drifter speed 7 m/s = 7/60 per tick.
import { afterAll, describe, expect, it } from 'vitest';
import { createRunner } from '../helpers/cli';

const run = createRunner();
afterAll(() => run.cleanup());

const TOL = 0.0015; // coordinates are rounded to 3 decimals
const near = (actual: number, expected: number, tol = TOL) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol);
const rOf = (pos: number[]) => Math.hypot(pos[0]!, pos[2]!);
/** A scenario with nothing random: no shades, motes, drifters, charms or wind. */
const QUIET = { random_motes: false, random_shades: false, random_drifters: false, motes: [], shades: [], charms: [], wind_enabled: false };

describe('nights 2-3: selection and starting state', () => {
  it('--night 2 tick-0 snapshot: night 2, 270 s, six lanterns, 20 motes, charm C1, Mây at the centre', () => {
    const r = run.play(undefined, undefined, { night: 2, ticks: 0 });
    expect(r.status, r.stderr).toBe(0);
    const s = r.at(0);
    expect(s.night).toBe(2);
    expect(s.time_left_s).toBe(270);
    expect(s.player.pos).toEqual([0, 0, 0]);
    expect(s.lanterns.map((l: any) => [l.id, ...l.pos])).toEqual([
      ['L1', 0, 0, 20],
      ['L2', 17, 0, -10],
      ['L3', -17, 0, -10],
      ['L4', 70, 0, 20],
      ['L5', 87, 0, -10],
      ['L6', 53, 0, -10],
    ]);
    expect(s.motes_active).toBe(20);
    expect(s.charms).toEqual([{ id: 'C1', available: true, respawn_s: 0 }]);
    // 24 spawn points per level: radius 10 (4 points) and 22 (8 points) around each island centre (0,0) and (70,0).
    const ids = new Set<string>();
    for (const m of s.motes) {
      const d = Math.min(Math.hypot(m.pos[0], m.pos[2]), Math.hypot(m.pos[0] - 70, m.pos[2]));
      expect([10, 22].some((rad) => Math.abs(d - rad) < 0.002), `mote ${m.id} at ${m.pos}`).toBe(true);
      expect(m.pos[1]).toBe(0);
      ids.add(m.pos.join(','));
    }
    expect(ids.size).toBe(20); // 20 distinct points
  });

  it('--night 3 tick-0 snapshot: night 3, 300 s, seven lanterns, charms C1 C2, Mây at (0,0,-30)', () => {
    const r = run.play(undefined, undefined, { night: 3, ticks: 0 });
    expect(r.status, r.stderr).toBe(0);
    const s = r.at(0);
    expect(s.night).toBe(3);
    expect(s.time_left_s).toBe(300);
    expect(s.player.pos).toEqual([0, 0, -30]);
    expect(s.player.grounded).toBe(true);
    expect(s.lanterns.map((l: any) => [l.id, ...l.pos])).toEqual([
      ['L1', 0, 6, 6],
      ['L2', 18, 3, 10],
      ['L3', -18, 3, 10],
      ['L4', 35, 0, -10],
      ['L5', -35, 0, -10],
      ['L6', 20, 0, -35],
      ['L7', -20, 0, -35],
    ]);
    expect(s.charms).toEqual([
      { id: 'C1', available: true, respawn_s: 0 },
      { id: 'C2', available: true, respawn_s: 0 },
    ]);
    expect(s.motes_active).toBe(20);
    // Mote spawn points: radius 34 at y 0 (18), radius 18 at y 3 (8), radius 5 at y 6 (4).
    for (const m of s.motes) {
      const rad = rOf(m.pos);
      const ok = (m.pos[1] === 0 && Math.abs(rad - 34) < 0.002) || (m.pos[1] === 3 && Math.abs(rad - 18) < 0.002) || (m.pos[1] === 6 && Math.abs(rad - 5) < 0.002);
      expect(ok, `mote ${m.id} at ${m.pos}`).toBe(true);
    }
  });

  it('night 3 night_start event says night 3; night 4, 0 and abc are usage errors (exit 1), 1 2 3 are fine', () => {
    const r = run.play(undefined, undefined, { night: 3, ticks: 1 });
    expect(r.named('night_start')[0]!.data).toEqual({ night: 3 });
    for (const bad of ['4', '0', 'abc', '-1', '2.5']) {
      const out = run.dir + '/bad.jsonl';
      const res = run.cli(['--seed', '1', '--night', bad, '--ticks', '1', '--out', out]);
      expect(res.status, `--night ${bad}`).toBe(1);
      expect(res.stderr).toContain('--night');
    }
  });
});

describe('nights 2-3: terrain (bridge, void, pads, tiers)', () => {
  it('n2-bridge: from (20,0,0) running +X for 4 s reaches x = 44 and never leaves the ground', () => {
    const r = run.fixture('n2-bridge', { ticks: 240 });
    // 240 ticks * 0.1 m = 24 m: 20 + 24 = 44.
    near(r.at(240).player.pos[0], 44);
    expect(r.at(240).player.pos[1]).toBe(0);
    // Half way: tick 150 -> x = 20 + 15 = 35, on the bridge (|z| <= 2, 26 <= x <= 44).
    near(r.at(150).player.pos[0], 35);
    expect(r.snapshots.every((s) => s.player.grounded && s.player.pos[1] === 0)).toBe(true);
    expect(r.named('player_hit')).toHaveLength(0);
  });

  it('n2-void: leaving the island away from the bridge falls: one fall event, at the hand-computed tick', () => {
    const r = run.fixture('n2-void', { ticks: 200 });
    // Island A has radius 28; (27+0.1n, 5) is outside when hypot > 28, i.e. x > sqrt(784-25) = 27.55: first at n = 6
    // (x = 27.6). Free fall from rest: y = -10 (m/60)^2 after m fall ticks (tick 6 is m = 1). In exact arithmetic y = -10
    // exactly at m = 60, which is NOT below -10, so the event would be at m = 61: tick 6 + 61 - 1 = 66. The float sum can land
    // a hair below -10 at m = 60 (tick 65), so both are accepted: the rule "y < -10" sits exactly on a rounding tie.
    // Mây is then frozen for 60 ticks and respawns at the start (tick 126 or 125), after which she runs +X along z = 0
    // (the bridge): no second fall before tick 200.
    const hits = r.named('player_hit');
    expect(hits).toHaveLength(1);
    const t = hits[0]!.tick as number;
    expect([65, 66]).toContain(t);
    expect(hits[0]!.data).toEqual({ by: 'fall', flames: 2, dropped: 0, lost: 0 });
    expect(r.at(5).player.grounded).toBe(true);
    expect(r.at(6).player.grounded).toBe(false);
    expect(r.at(t - 1).player.pos[1]).toBeGreaterThanOrEqual(-10);
    expect(r.at(t).player.pos[1]).toBeLessThanOrEqual(-10); // snapshots are rounded to 3 decimals
    expect(r.at(t + 60).player.pos).toEqual([0, 0, 0]); // respawn at the level start after the 60-tick wait
  });

  it('n2-pad: standing on the pad at (20,0,18) launches Mây; she lands 84 ticks later inside island B', () => {
    const r = run.fixture('n2-pad', { ticks: 100 });
    // vy 14: y = 14 t - 10 t^2 = 0 at t = 1.4 s = 84 ticks (the launch tick is flight tick 1, so tick 84).
    expect(r.at(0).player.grounded).toBe(true);
    expect(r.at(1).player.grounded).toBe(false);
    expect(r.at(83).player.grounded).toBe(false);
    expect(r.at(83).player.pos[1]).toBeGreaterThan(0);
    expect(r.at(84).player.grounded).toBe(true);
    expect(r.at(84).player.pos[1]).toBe(0);
    // Horizontal: 24 m/s towards B's centre (70,0): direction (50,-18)/sqrt(2824) = (0.94089, -0.33872). 84 ticks
    // = 1.4 s = 33.6 m: x = 20 + 33.6 * 50 / 53.1413 = 51.614, z = 18 - 33.6 * 18 / 53.1413 = 6.619.
    near(r.at(84).player.pos[0], 51.614);
    near(r.at(84).player.pos[2], 6.619);
    // Inside island B: hypot(51.614 - 70, 6.619) = 19.5 <= 28; no fall.
    expect(r.named('player_hit')).toHaveLength(0);
    // The launch ignores move input: the same flight with the stick pushed the other way lands on the same spot.
    const steered = run.play(run.load('n2-pad', 'scenario.json'), { frames: [{ tick: 0, move: [-1, 0] }, { tick: 30, move: [0, 1] }] }, { night: 2, ticks: 100 });
    expect(steered.at(84).player.pos).toEqual(r.at(84).player.pos);
  });

  it('n2-pad (second pad): (50,0,-18) launches towards island A and lands inside it', () => {
    const scenario = { ...run.load('n2-pad', 'scenario.json'), player: { pos: [50, 0, -18] } };
    const r = run.play(scenario, undefined, { night: 2, ticks: 90 });
    // Direction (0,0) - (50,-18) = (-50, 18): landing at 84 ticks, x = 50 - 33.6*50/53.1413 = 18.386, z = -18 + 33.6*18/53.1413 = -6.619.
    near(r.at(84).player.pos[0], 18.386);
    near(r.at(84).player.pos[2], -6.619);
    expect(r.at(84).player.grounded).toBe(true);
  });

  it('n3-wall: a tier wall stops Mây at r = 24 on the lower tier', () => {
    const r = run.fixture('n3-wall', { ticks: 120 });
    // From (0,0,30) running -Z at 0.1 m/tick: z = 30 - 0.1 n; tier 1 (height 3) starts at r <= 24, a step of 3 > 0.35 is
    // refused, so Mây stays at the last z above 24: between 24.0 and 24.1 (24.1 = tick 59). Not climbing: y stays 0.
    const last = r.at(120).player;
    expect(last.pos[2]).toBeGreaterThanOrEqual(24 - TOL);
    expect(last.pos[2]).toBeLessThanOrEqual(24.1 + TOL);
    expect(last.pos[1]).toBe(0);
    expect(last.grounded).toBe(true);
    expect(r.snapshots.every((s) => s.player.pos[1] === 0 && s.player.pos[2] >= 24 - TOL)).toBe(true);
  });

  it('n3-ramp: from the foot of the 30-degree ramp Mây climbs linearly to tier 1 (y = 3) and stays grounded', () => {
    const r = run.fixture('n3-ramp', { ticks: 100 });
    // Start along = 30.5 (r = 30.5 at 30 degrees: (26.4138, 15.25)). Running inward 0.1 m/tick: along = 30.5 - 0.1 n. The ramp
    // rises 3 m over along 30 -> 24, so y = 3 (30 - along) / 6 = 0.5 (0.1 n - 0.5) = 0.05 (n - 5) for 5 <= n <= 65.
    expect(r.at(5).player.pos[1]).toBe(0); // along = 30.0: foot
    near(r.at(20).player.pos[1], 0.75); // 0.05 * 15
    near(r.at(35).player.pos[1], 1.5); // 0.05 * 30
    near(r.at(50).player.pos[1], 2.25); // 0.05 * 45
    near(r.at(65).player.pos[1], 3); // along = 24: top
    // Past along 24, r < 24 with z > 0 is tier 1 (y 3). Tick 100: along = 20.5.
    expect(r.at(100).player.pos[1]).toBe(3);
    expect(r.at(100).player.grounded).toBe(true);
    expect(r.snapshots.every((s) => s.player.grounded)).toBe(true);
    expect(r.named('player_hit')).toHaveLength(0);
  });

  it('n3-ledge: walking off tier 1 at r = 12 falls to tier 0 (y 0) without a fall event', () => {
    const r = run.fixture('n3-ledge', { ticks: 45 });
    // Start (5,3,12): r = 13. Inward 0.1 m/tick: r = 13 - 0.1 n. Tier 1 spans r in [12, 24]: she is still on it at tick 5 (r 12.5).
    expect(r.at(5).player.pos[1]).toBe(3);
    expect(r.at(5).player.grounded).toBe(true);
    // Below r = 12 the ground is 0 (a drop of 3 > STEP_DOWN): at tick 20 (r = 11) she is in the air, between the tiers.
    expect(r.at(20).player.grounded).toBe(false);
    expect(r.at(20).player.pos[1]).toBeGreaterThan(0);
    expect(r.at(20).player.pos[1]).toBeLessThan(3);
    // Falling 3 m from rest takes 3 = 10 t^2 -> t = 0.5477 s = 33 ticks; she left the ledge at tick 10 or 11: down by tick 44.
    // r(45) = 8.5 > 8 (the tier-2 wall is at r = 8): still on tier 0.
    expect(r.at(45).player.pos[1]).toBe(0);
    expect(r.at(45).player.grounded).toBe(true);
    near(rOf(r.at(45).player.pos), 8.5);
    expect(r.named('player_hit')).toHaveLength(0);
  });

  it('n3-pad: the pad at (0,3,13) throws Mây onto tier 2 (y 6) and never into the bell tower', () => {
    const r = run.fixture('n3-pad', { ticks: 80 });
    // vy 12, vz -8: y = 3 + 12 t - 10 t^2, z = 13 - 8 t, t = n/60. y(50) = 3 + 10 - 6.944 = 6.056 >= 6 (still above);
    // y(51) = 3 + 10.2 - 7.225 = 5.975 <= 6: she lands on tier 2 (y = 6) at tick 51, z = 13 - 8 * 51 / 60 = 6.2.
    expect(r.at(50).player.grounded).toBe(false);
    expect(r.at(51).player.grounded).toBe(true);
    expect(r.at(51).player.pos[1]).toBe(6);
    near(r.at(51).player.pos[2], 6.2);
    near(r.at(51).player.pos[0], 0);
    expect(r.at(80).player.pos[1]).toBe(6);
    // The tower (r < 2, below y 14) is never entered: z stays >= 6.2 > 2 the whole time.
    expect(r.snapshots.every((s) => rOf(s.player.pos) >= 2)).toBe(true);
    expect(r.named('player_hit')).toHaveLength(0);
  });

  it('n3-tower: the bell tower blocks Mây on tier 2 at r = 2', () => {
    const r = run.fixture('n3-tower', { ticks: 120 });
    // From (0,6,-5) running +Z 0.1 m/tick: z = -5 + 0.1 n reaches -2.0 (r = 2) at n = 30. Inside means r < 2: refused, so she
    // ends between z = -2.1 (tick 29) and -2.0, on tier 2, never inside the tower.
    const last = r.at(120).player;
    expect(rOf(last.pos)).toBeGreaterThanOrEqual(2 - TOL);
    expect(rOf(last.pos)).toBeLessThanOrEqual(2.1 + TOL);
    expect(last.pos[1]).toBe(6);
    expect(last.grounded).toBe(true);
    expect(r.snapshots.every((s) => rOf(s.player.pos) >= 2 - TOL)).toBe(true);
  });
});

describe('nights 2-3: wind', () => {
  it('n3-wind: a gust blows from tick 1800 for 300 ticks, pushing a standing Mây 2 m in 60 ticks', () => {
    const r = run.fixture('n3-wind', { ticks: 2200 });
    // Gust 1 is announced at 1800 - 120 = 1680 (direction drawn then), active for simTicks 1800..2099.
    expect(r.at(1799).wind).toEqual({ active: false, dir_deg: 0 });
    expect(r.at(1799).player.pos).toEqual([0, 0, -30]);
    const w = r.at(1800).wind;
    expect(w.active).toBe(true);
    expect(Number.isInteger(w.dir_deg) && w.dir_deg >= 0 && w.dir_deg <= 359).toBe(true);
    // Steps 1801..1860 are 60 steps of 2/60 m each: exactly 2.0 m along (cos dir, sin dir).
    const a = (w.dir_deg * Math.PI) / 180;
    const [p0, p1] = [r.at(1800).player.pos, r.at(1860).player.pos];
    near(p1[0] - p0[0], 2 * Math.cos(a), 0.0011);
    near(p1[2] - p0[2], 2 * Math.sin(a), 0.0011);
    expect(r.at(1860).wind.dir_deg).toBe(w.dir_deg);
    // Last active tick 2099, over at 2100 (1800 + 300); afterwards Mây stands still again.
    expect(r.at(2099).wind.active).toBe(true);
    expect(r.at(2100).wind).toEqual({ active: false, dir_deg: 0 });
    expect(r.at(2200).player.pos).toEqual(r.at(2100).player.pos);
    // 300 steps * 2/60 = 10 m in total from tick 1799.
    near(Math.hypot(r.at(2099).player.pos[0] - r.at(1799).player.pos[0], r.at(2099).player.pos[2] - r.at(1799).player.pos[2]), 10, 0.002);
  });

  it('n3-wind with wind_enabled: false never blows, and Nights 1 and 2 never have wind', () => {
    const off = run.play({ ...run.load('n3-wind', 'scenario.json'), wind_enabled: false }, undefined, { night: 3, ticks: 1900, every: 100 });
    expect(off.snapshots.every((s) => !s.wind.active && s.wind.dir_deg === 0)).toBe(true);
    expect(off.at(1900).player.pos).toEqual([0, 0, -30]);
    const night2 = run.play({ ...QUIET, wind_enabled: true, time_left_s: 1000 }, undefined, { night: 2, ticks: 1900, every: 100 });
    expect(night2.snapshots.every((s) => !s.wind.active && s.wind.dir_deg === 0)).toBe(true);
    expect(night2.at(1900).player.pos).toEqual([0, 0, 0]);
  });
});

describe('nights 2-3: drifters (Gió Lạc)', () => {
  it('n2-drifter-steal: an idle drifter 3 m away chases a loaded Mây, steals 3 at tick 16, flees and vanishes 240 ticks later', () => {
    const r = run.fixture('n2-drifter-steal', { ticks: 300 });
    expect(r.at(0).drifters).toEqual([{ id: 'D1', pos: [3, 1, 0], state: 'idle', stolen: 0 }]);
    expect(r.at(1).drifters[0].state).toBe('chase'); // carried 6 >= 5 and 3 m <= 15 m
    // It closes 7/60 m per tick: distance 3 - 0.11667 n. Touching means <= 1.2: n = 15 gives 1.25, n = 16 gives 1.1333.
    expect(r.named('drifter_steal')).toEqual([
      { type: 'event', tick: 16, name: 'drifter_steal', data: { drifter_id: 'D1', amount: 3, carried: 3 } }, // min(3, 6) = 3 stolen, 6 - 3 = 3 left
    ]);
    expect(r.at(15).drifters[0].state).toBe('chase');
    expect(r.at(16).drifters[0].state).toBe('flee');
    expect(r.at(16).drifters[0].stolen).toBe(3);
    expect(r.at(16).player.carried).toBe(3);
    near(r.at(16).drifters[0].pos[0], 1.133); // 3 - 16 * 7 / 60
    // Flee lasts 240 ticks: still there at 255, gone at 16 + 240 = 256 (and a drifter steals only once).
    expect(r.at(255).drifters).toHaveLength(1);
    near(r.at(255).drifters[0].pos[0], 29.017); // 1.1333 + 239 * 7 / 60 away from Mây along +X, over the void: allowed
    expect(r.at(255).drifters[0].pos[1]).toBe(1); // no ground below: it keeps its height
    expect(r.at(256).drifters).toEqual([]);
    expect(r.named('drifter_steal')).toHaveLength(1);
    expect(r.at(300).player.carried).toBe(3);
  });

  it('n2-drifter-invuln: invulnerability does not protect against a drifter', () => {
    const r = run.fixture('n2-drifter-invuln', { ticks: 40 });
    expect(r.at(16).player.invuln).toBe(true); // 600 ticks of invulnerability, still on at tick 16
    expect(r.named('drifter_steal')).toEqual([
      { type: 'event', tick: 16, name: 'drifter_steal', data: { drifter_id: 'D1', amount: 3, carried: 3 } },
    ]);
    expect(r.at(16).player.carried).toBe(3);
  });

  it('n2-drifter-pulse-chase: a pulse while a drifter chases makes it flee empty-handed; it never steals', () => {
    const r = run.fixture('n2-drifter-pulse-chase', { ticks: 300 });
    // Tick 1: pulse (cost 3): carried 6 - 3 = 3. The drifter at 3 m (3D distance to the pulse centre hypot(3, 0.2) = 3.007 <= 5)
    // goes chase -> flee with stolen 0 and 240 ticks left; the same step's drifter stage already counts one: gone after step 240.
    expect(r.named('pulse')).toHaveLength(1);
    expect(r.named('pulse')[0]!.data).toEqual({ stunned_ids: [] }); // the pulse event lists shades only
    expect(r.at(1).player.carried).toBe(3);
    expect(r.at(1).drifters[0].state).toBe('flee');
    expect(r.at(1).drifters[0].stolen).toBe(0);
    expect(r.at(239).drifters).toHaveLength(1);
    expect(r.at(240).drifters).toEqual([]);
    expect(r.named('drifter_steal')).toHaveLength(0);
    expect(r.named('drifter_drop')).toHaveLength(0);
    expect(r.at(300).player.carried).toBe(3);
  });

  it('n2-drifter-pulse-drop: a pulse on a fleeing thief makes it drop its 3 motes and vanish within 120 ticks', () => {
    const r = run.fixture('n2-drifter-pulse-drop', { ticks: 200 });
    // Tick 1: pulse costs 3 (carried 3 -> 0). The thief (flee, stolen 3) is 3 m away: drops 3 motes at its XZ (3, 0), event
    // drifter_drop, stolen 0, flee time min(240, 120) = 120 and the same step counts one: gone after step 120.
    expect(r.named('drifter_drop')).toEqual([{ type: 'event', tick: 1, name: 'drifter_drop', data: { drifter_id: 'D1', amount: 3 } }]);
    const s1 = r.at(1);
    expect(s1.player.carried).toBe(0);
    expect(s1.drifters[0].stolen).toBe(0);
    expect(s1.motes_active).toBe(3);
    expect(s1.motes.map((m: any) => [m.kind, ...m.pos, m.ttl_s])).toEqual([
      ['dropped', 3, 0, 0, 8], // ttl 480 ticks = 8 s, on the ground (y 0) at the drifter's XZ
      ['dropped', 3, 0, 0, 8],
      ['dropped', 3, 0, 0, 8],
    ]);
    expect(r.at(119).drifters).toHaveLength(1);
    expect(r.at(120).drifters).toEqual([]);
  });

  it('drifter spawns: none on Night 1 in 3000 ticks; on Night 2 the first appears at tick 1200 and never more than 2 are alive', () => {
    const n1 = run.play({ player: { flames: 1000 } }, undefined, { night: 1, ticks: 3000, every: 10 });
    expect(n1.snapshots.every((s) => s.drifters.length === 0)).toBe(true);

    const n2 = run.play({ player: { flames: 1000 } }, undefined, { night: 2, ticks: 16200, every: 10 });
    expect(n2.end.ticks).toBe(16200);
    expect(n2.at(1190).drifters).toEqual([]);
    const first = n2.at(1200).drifters;
    expect(first).toHaveLength(1);
    expect(first[0].id).toBe('D1');
    expect(first[0].state).toBe('idle');
    expect(first[0].pos[1]).toBe(1); // hovers 1 m above the ground (0) of its mist point
    // It spawns on one of the shade spawn points: radius 26 at 22.5 + 45 k degrees around (0,0) or (70,0).
    const onRim = [0, 70].some((cx) => Math.abs(Math.hypot(first[0].pos[0] - cx, first[0].pos[2]) - 26) < 0.002);
    expect(onRim).toBe(true);
    expect(n2.at(2390).drifters).toHaveLength(1); // 1200 + 1200 = 2400 is the next spawn tick
    expect(n2.at(2400).drifters).toHaveLength(2);
    expect(Math.max(...n2.snapshots.map((s) => s.drifters.length))).toBe(2); // idle drifters stay: capped at 2 by the 1200-tick rule
    expect(n2.snapshots.filter((s) => s.tick >= 2400).every((s) => s.drifters.length === 2)).toBe(true);
    expect(n2.named('drifter_steal')).toHaveLength(0); // Mây never carries 5 motes here
  });
});

describe('nights 2-3: shades', () => {
  it('n2-shade-speed / n3-shade-speed: a chasing shade moves 4.0/60 per tick on Night 2 and 4.5/60 on Night 3', () => {
    const n2 = run.fixture('n2-shade-speed', { ticks: 20 });
    // Night 2: from x = 10, 20 ticks * 4/60 = 1.3333 m: x = 8.667.
    near(n2.at(1).shades[0].pos[0], 9.933); // 10 - 4/60
    near(n2.at(20).shades[0].pos[0], 8.667);
    const n3 = run.fixture('n3-shade-speed', { ticks: 20 });
    // Night 3 (Mây at (0,0,-30), shade at (10,1,-30)): 4.5/60 = 0.075 per tick: x = 10 - 0.075 n.
    near(n3.at(1).shades[0].pos[0], 9.925);
    near(n3.at(20).shades[0].pos[0], 8.5); // 10 - 20 * 0.075
    expect(n3.at(20).shades[0].state).toBe('chase');
    expect(n3.at(20).shades[0].pos[1]).toBe(1); // hovers 1 m over the ground (0)
  });

  it('n2-shade-void: a shade chasing across the gap between the islands never ends over void', () => {
    const r = run.fixture('n2-shade-void', { ticks: 600 });
    const overGround = (p: number[]) =>
      Math.hypot(p[0]!, p[2]!) <= 28 + TOL || Math.hypot(p[0]! - 70, p[2]!) <= 28 + TOL || (p[0]! >= 26 && p[0]! <= 44 && Math.abs(p[2]!) <= 2);
    expect(r.snapshots.every((s) => overGround(s.shades[0].pos)), 'a shade was over void').toBe(true);
    // The straight line to Mây along z = 3 leaves island A at x = sqrt(28^2 - 3^2) = 27.839. The shade starts at 27.5 and steps
    // 4/60 = 0.0667: 27.5 + 5/15 = 27.833 is the last step that stays on the ground, the 6th (27.9) would be void: it stays put.
    near(r.at(5).shades[0].pos[0], 27.833);
    near(r.at(600).shades[0].pos[0], 27.833);
    expect(r.at(600).shades[0].state).toBe('chase');
    expect(r.named('player_hit')).toHaveLength(0);
  });

  it('shade schedules: Night 2 spawns 2 at tick 300 then one every 420 up to 8; Night 3 every 360 up to 10', () => {
    const spawnTicks = (night: 2 | 3) => {
      const r = run.play({ player: { flames: 1000 }, random_drifters: false }, undefined, { night, ticks: 5000, every: 1000 });
      return r.named('shade_spawned').map((e) => e.tick);
    };
    // Night 2: 300, 300, then 300 + 420 k for k = 1..6 = 720 1140 1560 1980 2400 2820 (2 + 6 = 8 shades: the cap).
    expect(spawnTicks(2)).toEqual([300, 300, 720, 1140, 1560, 1980, 2400, 2820]);
    // Night 3: 300, 300, then 300 + 360 k for k = 1..8 = 660 1020 1380 1740 2100 2460 2820 3180 (2 + 8 = 10: the cap).
    expect(spawnTicks(3)).toEqual([300, 300, 660, 1020, 1380, 1740, 2100, 2460, 2820, 3180]);
  });
});

describe('nights 2-3: determinism and speed', () => {
  it.each([
    { night: 2 as const, ticks: 16200 }, // 270 s
    { night: 3 as const, ticks: 18000 }, // 300 s
  ])('--night $night: a full night run twice is byte-identical and takes < 30 s', ({ night, ticks }) => {
    const scenario = { player: { flames: 1000 } }; // Mây survives to dawn
    const t0 = performance.now();
    const a = run.play(scenario, undefined, { seed: 5, night, ticks, every: 10 });
    const ms = performance.now() - t0;
    const b = run.play(scenario, undefined, { seed: 5, night, ticks, every: 10 });
    console.log(`night ${night}: ${ticks} ticks in ${Math.round(ms)} ms`);
    expect(a.status, a.stderr).toBe(0);
    expect(a.end.ticks).toBe(ticks);
    expect(ms).toBeLessThan(30000);
    expect(a.text).toBe(b.text);
    // A different seed really changes the night (so the equality above is not vacuous).
    const c = run.play(scenario, undefined, { seed: 6, night, ticks, every: 10 });
    expect(c.text).not.toBe(a.text);
  }, 120000);
});
