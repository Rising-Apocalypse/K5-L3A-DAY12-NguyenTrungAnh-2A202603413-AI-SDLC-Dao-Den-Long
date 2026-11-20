// Scenario-driven tests of the Phase 1 rules: every test runs the REAL headless CLI (dist/headless.js) on a fixture
// from tests/scenarios/<name>/ and checks what it wrote. Expected numbers are computed from TUNING (and the named
// rule constants in src/core/rules.ts), never copied as literals.
import { afterAll, describe, expect, it } from 'vitest';
import { MOTE_SPAWN_POINTS, SHADE_SPAWN_POINTS } from '../../src/core/level';
import {
  CHARM_RESPAWN_TICKS,
  CHARM_RUN_SPEED,
  CHARM_TICKS,
  DROP_RING_MAX,
  DROP_RING_MIN,
  DROP_TTL,
  EVICT_MAX_TICKS,
  FALL_WAIT_TICKS,
  FALL_Y,
  MOTE_CAP,
  MOTE_SPAWN_EVERY,
  PULSE_PUSH_TICKS,
  RECOIL_DIST,
  RECOIL_TICKS,
  SHADE_DETECT,
  SHADE_FIRST_SPAWN,
  SHADE_LOSE,
  SHADE_MAX,
  SHADE_SPAWNING_TICKS,
  SHADE_SPAWN_EVERY,
  SHADE_SPAWN_MIN_DIST,
} from '../../src/core/rules';
import { TUNING } from '../../src/core/tuning';
import { createRunner, ticksOf, xz } from '../helpers/cli';

const run = createRunner();
afterAll(() => run.cleanup());

const S = TUNING.score;
const invulnTicks = ticksOf(TUNING.invuln_s);
const stunTicks = ticksOf(TUNING.pulse_stun_s);
const cooldownTicks = ticksOf(TUNING.pulse_cooldown_s);
const TOL = 0.0015; // coordinates are rounded to 3 decimals

describe('pickup', () => {
  it('pickup-basic: walking +Z picks the mote at the first tick it is within pickup_radius', () => {
    const r = run.fixture('pickup-basic', { ticks: 120 });
    const mote = run.load('pickup-basic', 'scenario.json').motes[0] as number[];
    const stepLength = TUNING.player_speed / 60;
    const expectedTick = Math.ceil((mote[2]! - TUNING.pickup_radius) / stepLength - 1e-9);

    const picked = r.named('mote_picked');
    expect(picked).toHaveLength(1);
    expect(picked[0]).toEqual({ type: 'event', tick: expectedTick, name: 'mote_picked', data: { carried: 1 } });

    // Geometry check on the output itself: out of reach one tick earlier, within reach (<=) at the pickup tick.
    expect(xz(r.at(expectedTick - 1).player.pos, mote)).toBeGreaterThan(TUNING.pickup_radius);
    expect(xz(r.at(expectedTick).player.pos, mote)).toBeLessThanOrEqual(TUNING.pickup_radius + TOL);
    expect(r.at(expectedTick - 1).motes_active).toBe(1);
    expect(r.at(expectedTick).motes_active).toBe(0);
    expect(r.at(expectedTick).player.carried).toBe(1);
    expect(r.end.score).toBe(0); // picking up gives no points: points come when motes are deposited
  });

  it('pickup-capacity: nothing is picked up while carried >= carry_capacity', () => {
    const r = run.fixture('pickup-capacity', { ticks: 120 });
    const scenario = run.load('pickup-capacity', 'scenario.json');
    expect(scenario.player.carried).toBe(TUNING.carry_capacity - 1); // the fixture starts one short of full

    const picked = r.named('mote_picked');
    expect(picked).toHaveLength(1);
    expect(picked[0]!.data).toEqual({ carried: TUNING.carry_capacity });
    // Mây walked straight over the second mote (within pickup_radius of it for a while) but it stays on the island.
    const over = r.snapshots.filter((s) => xz(s.player.pos, scenario.motes[1]) <= TUNING.pickup_radius);
    expect(over.length).toBeGreaterThan(5);
    for (const s of over) {
      expect(s.player.carried).toBe(TUNING.carry_capacity);
      expect(s.motes).toEqual([{ id: 'M2', pos: scenario.motes[1], kind: 'random', ttl_s: null }]);
    }
    expect(r.snapshots.at(-1)!.motes_active).toBe(1);
  });
});

describe('deposit', () => {
  it('deposit-partial: fewer motes than the lantern costs -> deposited, not lit, points per mote', () => {
    const r = run.fixture('deposit-partial', { ticks: 30 });
    const carried = run.load('deposit-partial', 'scenario.json').player.carried as number;
    expect(carried).toBeLessThan(TUNING.lantern_cost);
    expect(r.named('deposit')).toEqual([
      { type: 'event', tick: 1, name: 'deposit', data: { lantern_id: 'L1', amount: carried, deposited: carried } },
    ]);
    expect(r.named('lantern_lit')).toEqual([]);
    const snap = r.at(1);
    expect(snap.player.carried).toBe(0);
    expect(snap.lanterns[0]).toMatchObject({ id: 'L1', lit: false, deposited: carried });
    expect(snap.score).toBe(carried * S.per_mote);
    expect(r.end.score).toBe(carried * S.per_mote);
  });

  it('deposit-light: a full lantern lights up: deposit, then lantern_lit, score = motes + lantern', () => {
    const r = run.fixture('deposit-light', { ticks: 30 });
    const carried = run.load('deposit-light', 'scenario.json').player.carried as number;
    const amount = Math.min(carried, TUNING.lantern_cost);
    expect(r.events.filter((e) => e.name !== 'night_start').map((e) => [e.tick, e.name, e.data])).toEqual([
      [1, 'deposit', { lantern_id: 'L1', amount, deposited: amount }],
      [1, 'lantern_lit', { lantern_id: 'L1' }],
    ]);
    expect(amount).toBe(TUNING.lantern_cost);
    expect(r.at(1).lanterns[0]).toMatchObject({ id: 'L1', lit: true, deposited: TUNING.lantern_cost });
    expect(r.at(1).player.carried).toBe(carried - amount);
    expect(r.end.score).toBe(amount * S.per_mote + S.per_lantern); // 10 * 10 + 100 = 200 with the standard numbers
    expect(r.end.state).toBe('playing'); // 1 of 5 lit
  });

  it('deposit-nearest-tie: two lanterns at the same distance -> the one with the smaller id gets the light', () => {
    const r = run.fixture('deposit-nearest-tie', { ticks: 10 });
    const carried = run.load('deposit-nearest-tie', 'scenario.json').player.carried as number;
    expect(r.named('deposit')).toEqual([
      { type: 'event', tick: 1, name: 'deposit', data: { lantern_id: 'L1', amount: carried, deposited: carried } },
    ]);
    expect(r.at(1).lanterns.map((l: any) => l.deposited)).toEqual([carried, 0, 0, 0, 0]);
  });
});

describe('pulse', () => {
  it('pulse-stun: a shade within pulse_radius (3D) is stunned for pulse_stun_s and pushed pulse_push_m over 15 ticks', () => {
    const r = run.fixture('pulse-stun', { ticks: 200 });
    const scenario = run.load('pulse-stun', 'scenario.json');
    const carried = scenario.player.carried as number;
    const shade0 = scenario.shades[0].pos as number[];
    const T = 1; // pulse pressed on step 0 -> event tick 1

    expect(r.named('pulse')).toEqual([{ type: 'event', tick: T, name: 'pulse', data: { stunned_ids: ['S1'] } }]);
    expect(r.at(T).player.carried).toBe(carried - TUNING.pulse_cost);
    expect(r.at(T).score).toBe(S.per_stun);
    expect(r.end.score).toBe(S.per_stun);

    // Stunned for exactly pulse_stun_s: ticks T .. T + stun - 1, wandering/chasing again at T + stun.
    for (let t = T; t < T + stunTicks; t++) expect(r.at(t).shades[0].state, `tick ${t}`).toBe('stunned');
    expect(r.at(T - 1).shades[0].state).not.toBe('stunned');
    expect(r.at(T + stunTicks).shades[0].state).not.toBe('stunned');

    // Pushed straight away from Mây by pulse_push_m in equal steps over PULSE_PUSH_TICKS ticks, then still.
    const from = r.at(T - 1).player.pos;
    const startDistance = xz(from, shade0);
    for (let k = 1; k <= PULSE_PUSH_TICKS; k++) {
      const pos = r.at(T - 1 + k).shades[0].pos;
      expect(xz(pos, from), `push step ${k}`).toBeCloseTo(startDistance + (TUNING.pulse_push_m * k) / PULSE_PUSH_TICKS, 2);
      expect(pos[2]).toBeCloseTo(shade0[2]!, 3); // straight away along +X: no sideways drift
    }
    const pushed = r.at(T - 1 + PULSE_PUSH_TICKS).shades[0].pos;
    for (let t = T - 1 + PULSE_PUSH_TICKS; t < T + stunTicks; t++) expect(r.at(t).shades[0].pos).toEqual(pushed);
    expect(r.named('player_hit')).toEqual([]); // stunned shades are harmless
  });

  it('pulse-insufficient: with fewer than pulse_cost motes nothing happens (no event, nothing spent)', () => {
    const r = run.fixture('pulse-insufficient', { ticks: 20 }); // before the shade (3 m away) reaches Mây
    const carried = run.load('pulse-insufficient', 'scenario.json').player.carried as number;
    expect(carried).toBeLessThan(TUNING.pulse_cost);
    expect(r.named('pulse')).toEqual([]);
    expect(r.snapshots.every((s) => s.player.carried === carried && s.shades[0].state !== 'stunned')).toBe(true);
    expect(r.end.score).toBe(0);
  });

  it('pulse-cooldown: a second pulse is refused until pulse_cooldown_s has passed, then works', () => {
    const r = run.fixture('pulse-cooldown', { ticks: 300 });
    const carried = run.load('pulse-cooldown', 'scenario.json').player.carried as number;
    const pulses = r.named('pulse');
    // Pressed on steps 0 (ok), 100 and 178 (cooldown), 180 (ok): event ticks 1 and 1 + cooldown.
    expect(pulses.map((p) => p.tick)).toEqual([1, 1 + cooldownTicks]);
    expect(pulses.every((p) => Array.isArray(p.data.stunned_ids) && p.data.stunned_ids.length === 0)).toBe(true);
    expect(r.at(1 + cooldownTicks).player.carried).toBe(carried - 2 * TUNING.pulse_cost);
    expect(r.at(1 + cooldownTicks - 1).player.carried).toBe(carried - TUNING.pulse_cost); // refused presses cost nothing
  });
});

describe('shades', () => {
  it('shade-chase: a wandering shade chases within SHADE_DETECT and gives up beyond SHADE_LOSE', () => {
    const r = run.fixture('shade-chase', { ticks: 300 });
    const states = r.snapshots.map((s) => s.shades[0].state);
    expect(states[0]).toBe('wander'); // listed shades start active, in wander
    expect(states[1]).toBe('chase'); // the player is 10 m away (< 12)

    // A state is decided from Mây's new position and the shade's previous one, away from the exact thresholds.
    let lostAt = -1;
    for (let k = 1; k < r.snapshots.length; k++) {
      const prev = r.snapshots[k - 1].shades[0];
      const cur = r.snapshots[k].shades[0];
      const d = xz(r.snapshots[k].player.pos, prev.pos);
      if (prev.state === 'wander' && Math.abs(d - SHADE_DETECT) > 0.01) expect(cur.state, `tick ${k}`).toBe(d < SHADE_DETECT ? 'chase' : 'wander');
      if (prev.state === 'chase' && Math.abs(d - SHADE_LOSE) > 0.01) expect(cur.state, `tick ${k}`).toBe(d > SHADE_LOSE ? 'wander' : 'chase');
      if (prev.state === 'chase' && cur.state === 'wander' && lostAt < 0) lostAt = k;
    }
    // Mây (player_speed) outruns the shade (shade_speed), so the gap grows by (speed - shade_speed) m/s from
    // 10 m until it passes SHADE_LOSE: about (18 - 10) / (6 - 4) = 4 s.
    const gain = (TUNING.player_speed - TUNING.shade_speed) / 60;
    const predicted = Math.round((SHADE_LOSE - 10) / gain);
    expect(lostAt).toBeGreaterThan(predicted - 10);
    expect(lostAt).toBeLessThan(predicted + 10);
    expect(r.snapshots.slice(lostAt).every((s) => s.shades[0].state === 'wander')).toBe(true);
    expect(r.named('player_hit')).toEqual([]);
  });

  it('shade-chase: detection is inclusive at SHADE_DETECT; a chasing shade closes in at shade_speed', () => {
    const at = (x: number) =>
      run.play({ random_motes: false, random_shades: false, motes: [], shades: [{ id: 'S1', pos: [x, 0, 0] }] }, undefined, { ticks: 5 });
    const inside = at(SHADE_DETECT);
    expect(inside.at(1).shades[0].state).toBe('chase');
    expect(inside.at(1).shades[0].pos[0]).toBeCloseTo(SHADE_DETECT - TUNING.shade_speed / 60, 3);
    expect(inside.at(5).shades[0].pos[0]).toBeCloseTo(SHADE_DETECT - (5 * TUNING.shade_speed) / 60, 3);
    const outside = at(SHADE_DETECT + 0.5);
    expect(outside.at(1).shades[0].state).toBe('wander');
  });

  it('shade-hit: flames -1, floor(carried * hit_drop_ratio) motes dropped on the ring, invuln blocks the next hits', () => {
    const r = run.fixture('shade-hit', { ticks: 300 });
    const scenario = run.load('shade-hit', 'scenario.json');
    let carried = scenario.player.carried as number;
    let flames = scenario.player.flames as number;

    const hits = r.named('player_hit');
    expect(hits.length).toBe(flames); // flames 3 -> hit, hit, hit -> no_flames
    const expectedData = [];
    for (let i = 0; i < hits.length; i++) {
      const dropped = Math.floor(carried * TUNING.hit_drop_ratio);
      carried -= dropped;
      flames -= 1;
      expectedData.push({ by: 'shade', flames, dropped });
    }
    expect(hits.map((h) => h.data)).toEqual(expectedData);

    // Hit ticks are exactly invuln_s apart: the shade is touching Mây the whole time, only invulnerability stops it.
    const ticks = hits.map((h) => h.tick);
    expect(ticks[0]).toBe(1);
    expect(ticks[1]! - ticks[0]!).toBe(invulnTicks);
    expect(ticks[2]! - ticks[1]!).toBe(invulnTicks);
    const probe = ticks[0]! + invulnTicks - 5;
    expect(xz(r.at(probe).shades[0].pos, r.at(probe).player.pos)).toBeLessThanOrEqual(TUNING.shade_hit_radius);

    // First drop: new ids, on the ring around Mây, on the ground.
    const first = r.at(ticks[0]!);
    expect(first.player.carried).toBe((scenario.player.carried as number) - expectedData[0]!.dropped);
    expect(first.motes).toHaveLength(expectedData[0]!.dropped);
    for (const m of first.motes) {
      expect(m.pos[1]).toBe(0);
      const d = xz(m.pos, first.player.pos);
      expect(d).toBeGreaterThanOrEqual(DROP_RING_MIN - TOL);
      expect(d).toBeLessThanOrEqual(DROP_RING_MAX + TOL);
    }
    expect(new Set(first.motes.map((m: any) => m.id)).size).toBe(first.motes.length);

    // The shade backs off RECOIL_DIST over RECOIL_TICKS ticks (harmless), then goes back to wander.
    const t0 = ticks[0]!;
    for (let t = t0; t < t0 + RECOIL_TICKS; t++) expect(r.at(t).shades[0].state, `tick ${t}`).toBe('recoil');
    expect(r.at(t0 + RECOIL_TICKS).shades[0].state).not.toBe('recoil');
    expect(xz(r.at(t0 + RECOIL_TICKS).shades[0].pos, r.at(t0).shades[0].pos)).toBeCloseTo(RECOIL_DIST, 2);

    const over = r.named('game_over');
    expect(over).toEqual([{ type: 'event', tick: ticks[2], name: 'game_over', data: { result: 'lost', reason: 'no_flames' } }]);
    expect(r.end).toEqual({ type: 'end', ticks: ticks[2], state: 'lost', score: 0 });
  });
});

describe('safe zones', () => {
  it('safe-zone-block: a shade never gets inside the safe_radius of a lit lantern, so Mây standing there is safe', () => {
    const r = run.fixture('safe-zone-block', { ticks: 600 });
    const lantern = run.load('safe-zone-block', 'scenario.json').lanterns[0].pos as number[];
    for (const s of r.snapshots) expect(xz(s.shades[0].pos, lantern), `tick ${s.tick}`).toBeGreaterThanOrEqual(TUNING.safe_radius);
    expect(xz(r.snapshots.at(-1)!.shades[0].pos, lantern)).toBeLessThan(TUNING.safe_radius + 0.01); // pressed against it
    expect(r.snapshots.at(-1)!.shades[0].state).toBe('chase');
    expect(r.named('player_hit')).toEqual([]);
    expect(r.end.state).toBe('playing');
  });

  it('safe-zone-block (control): the same scene with the lantern unlit does get Mây hit', () => {
    const scenario = run.load('safe-zone-block', 'scenario.json');
    scenario.lanterns = [{ id: 'L1', pos: scenario.lanterns[0].pos, deposited: 0 }];
    const r = run.play(scenario, { frames: [] }, { ticks: 600 });
    expect(r.named('player_hit').length).toBeGreaterThan(0);
  });

  it('safe-zone-evict: a shade inside a newly lit zone is moved radially out within EVICT_MAX_TICKS, harmlessly', () => {
    const r = run.fixture('safe-zone-evict', { ticks: 300 });
    const scenario = run.load('safe-zone-evict', 'scenario.json');
    const lantern = scenario.lanterns[0].pos as number[];
    const start = r.at(0).shades[0].pos as number[];
    expect(xz(start, lantern)).toBeLessThan(TUNING.safe_radius);
    expect(xz(start, r.at(0).player.pos)).toBeLessThanOrEqual(TUNING.shade_hit_radius); // touching Mây from tick 0

    expect(r.named('lantern_lit')).toHaveLength(1);
    const lit = r.named('lantern_lit')[0]!.tick; // = 1
    // Out of the zone (to its edge) no later than EVICT_MAX_TICKS ticks after it was lit.
    expect(xz(r.at(lit + EVICT_MAX_TICKS - 1).shades[0].pos, lantern)).toBeGreaterThanOrEqual(TUNING.safe_radius);
    // Moves radially: always on the ray from the lantern through its starting point, never closer to the lantern.
    const dir = [(start[0]! - lantern[0]!), (start[2]! - lantern[2]!)];
    const len = Math.hypot(dir[0]!, dir[1]!);
    let previous = xz(start, lantern);
    for (let t = lit; t < lit + EVICT_MAX_TICKS; t++) {
      const pos = r.at(t).shades[0].pos as number[];
      const rel = [pos[0]! - lantern[0]!, pos[2]! - lantern[2]!];
      const cross = (dir[0]! * rel[1]! - dir[1]! * rel[0]!) / len; // distance of the shade from that ray
      expect(Math.abs(cross), `tick ${t}`).toBeLessThan(0.002);
      const distance = xz(pos, lantern);
      expect(distance, `tick ${t}`).toBeGreaterThanOrEqual(previous - TOL);
      previous = distance;
    }
    // Harmless meanwhile (it started within hit range of Mây), and afterwards the zone keeps it away from her.
    expect(r.named('player_hit')).toEqual([]);
    expect(r.snapshots.slice(lit + EVICT_MAX_TICKS).every((s) => xz(s.shades[0].pos, lantern) >= TUNING.safe_radius)).toBe(true);
  });

  it('safe-zone-evict (control): without lighting the lantern the touching shade hits Mây at once', () => {
    const r = run.play(run.load('safe-zone-evict', 'scenario.json'), { frames: [] }, { ticks: 30 });
    expect(r.named('player_hit').map((h) => h.tick)).toEqual([1]);
  });
});

describe('falling', () => {
  it('fall-respawn: below FALL_Y costs one flame and all carried motes; Mây is frozen, then back at the start, invulnerable', () => {
    const r = run.fixture('fall-respawn', { ticks: 400 });
    const scenario = run.load('fall-respawn', 'scenario.json');
    const carried = scenario.player.carried as number;
    const flames = scenario.player.flames as number;

    const falls = r.named('player_hit');
    expect(falls).toHaveLength(1); // once per fall
    expect(falls[0]!.data).toEqual({ by: 'fall', flames: flames - 1, dropped: 0, lost: carried });
    const T = falls[0]!.tick;
    // (Coordinates are rounded to 3 decimals, so "below FALL_Y" can show up as exactly FALL_Y in the output.)
    expect(r.at(T - 1).player.pos[1]).toBeGreaterThan(FALL_Y);
    expect(r.at(T).player.pos[1]).toBeLessThanOrEqual(FALL_Y);
    expect(r.at(T - 1).player.flames).toBe(flames);
    expect(r.at(T).player.flames).toBe(flames - 1);
    expect(r.at(T).player.carried).toBe(0);

    // Frozen for FALL_WAIT_TICKS, then back on the island at the start with velocity 0.
    for (let t = T; t < T + FALL_WAIT_TICKS; t++) expect(r.at(t).player.pos, `tick ${t}`).toEqual(r.at(T).player.pos);
    for (let t = T + FALL_WAIT_TICKS; t <= 400; t++) expect(r.at(t).player.pos, `tick ${t}`).toEqual([0, 0, 0]);
    expect(r.at(400).player).toMatchObject({ pos: [0, 0, 0], flames: flames - 1, carried: 0 });
    expect(r.end).toEqual({ type: 'end', ticks: 400, state: 'playing', score: 0 });
    expect(r.named('game_over')).toEqual([]);
  });

  it('fall-last-flame: falling with one flame left ends the game (lost, no_flames) with no respawn', () => {
    const r = run.fixture('fall-last-flame', { ticks: 400 });
    const carried = run.load('fall-last-flame', 'scenario.json').player.carried as number;
    const [fall] = r.named('player_hit');
    expect(fall!.data).toEqual({ by: 'fall', flames: 0, dropped: 0, lost: carried });
    expect(r.named('game_over')).toEqual([
      { type: 'event', tick: fall!.tick, name: 'game_over', data: { result: 'lost', reason: 'no_flames' } },
    ]);
    expect(r.end).toEqual({ type: 'end', ticks: fall!.tick, state: 'lost', score: 0 });
    expect(r.snapshots.at(-1)!.state).toBe('lost');
    expect(r.snapshots.at(-1)!.player.pos[1]).toBeLessThanOrEqual(FALL_Y); // never respawned
  });
});

describe('ending the night', () => {
  it('win-all-lit: lighting the last lantern wins at once; score adds seconds left and flames left', () => {
    const r = run.fixture('win-all-lit', { ticks: 300 });
    const scenario = run.load('win-all-lit', 'scenario.json');
    const carried = scenario.player.carried as number;
    const flames = scenario.player.flames as number;
    const timeLeft = (scenario.time_left_s as number) - 1 / 60; // after the single step it took
    const expectedScore =
      Math.min(carried, TUNING.lantern_cost) * S.per_mote + S.per_lantern + Math.floor(timeLeft) * S.per_second_left + flames * S.per_flame_left;

    expect(r.events.filter((e) => e.name !== 'night_start').map((e) => [e.tick, e.name, e.data])).toEqual([
      [1, 'deposit', { lantern_id: 'L1', amount: TUNING.lantern_cost, deposited: TUNING.lantern_cost }],
      [1, 'lantern_lit', { lantern_id: 'L1' }],
      [1, 'game_over', { result: 'won', reason: 'all_lit' }],
    ]);
    expect(r.end).toEqual({ type: 'end', ticks: 1, state: 'won', score: expectedScore });
    expect(r.at(1)).toMatchObject({ state: 'won', score: expectedScore });
    expect(r.at(1).lanterns.every((l: any) => l.lit)).toBe(true);
    // Pre-lit lanterns gave nothing: only the one lit during play counts for per_lantern.
    expect(expectedScore - Math.floor(timeLeft) * S.per_second_left - flames * S.per_flame_left).toBe(
      TUNING.lantern_cost * S.per_mote + S.per_lantern,
    );
  });

  it('dawn: when time_left_s runs out the game is lost with reason "dawn" and stops', () => {
    const r = run.fixture('dawn', { ticks: 600 });
    const seconds = run.load('dawn', 'scenario.json').time_left_s as number;
    expect(seconds).toBe(1);
    expect(r.named('game_over')).toEqual([
      { type: 'event', tick: seconds * 60, name: 'game_over', data: { result: 'lost', reason: 'dawn' } },
    ]);
    expect(r.end).toEqual({ type: 'end', ticks: seconds * 60, state: 'lost', score: 0 });
    expect(r.at(seconds * 60 - 1)).toMatchObject({ state: 'playing', time_left_s: Math.round(1000 / 60) / 1000 });
    expect(r.at(seconds * 60)).toMatchObject({ state: 'lost', time_left_s: 0 });
  });
});

describe('scheduled spawns', () => {
  it('spawn-schedule: 2 shades at tick 300, then 1 every 480 ticks up to SHADE_MAX; a mote every 240 ticks', () => {
    const ticks = 3600;
    for (const seed of [1, 2]) {
      const r = run.fixture('spawn-schedule', { ticks, seed });
      expect(r.end.ticks, 'the 100 flames in the fixture keep Mây alive').toBe(ticks);

      // Shades: S1,S2 at 300; S3 at 780; S4 at 1260; ... never more than SHADE_MAX.
      const expectedTicks: number[] = [];
      const spawnAt = (t: number, n: number) => {
        for (let i = 0; i < n && expectedTicks.length < SHADE_MAX; i++) expectedTicks.push(t);
      };
      spawnAt(SHADE_FIRST_SPAWN, 2);
      for (let t = SHADE_FIRST_SPAWN + SHADE_SPAWN_EVERY; t <= ticks; t += SHADE_SPAWN_EVERY) spawnAt(t, 1);
      const spawned = r.named('shade_spawned');
      expect(spawned.map((e) => e.tick), `seed ${seed}`).toEqual(expectedTicks);
      expect(spawned.map((e) => e.data.id)).toEqual(expectedTicks.map((_, i) => `S${i + 1}`));
      expect(expectedTicks.slice(0, 3)).toEqual([300, 300, 300 + SHADE_SPAWN_EVERY]); // 300, 300, 780
      expect(r.snapshots.at(-1)!.shades).toHaveLength(SHADE_MAX);
      expect(r.at(SHADE_FIRST_SPAWN - 1).shades).toEqual([]);

      // Each new shade: `spawning` for SHADE_SPAWNING_TICKS (harmless), at y = 1, on a spawn point >= 15 m from Mây.
      const first = r.at(SHADE_FIRST_SPAWN).shades;
      expect(first.map((s: any) => s.state)).toEqual(['spawning', 'spawning']);
      for (const s of first) {
        expect(s.pos[1]).toBe(1);
        expect(xz(s.pos, r.at(SHADE_FIRST_SPAWN).player.pos)).toBeGreaterThanOrEqual(SHADE_SPAWN_MIN_DIST);
        expect(SHADE_SPAWN_POINTS.some((p) => Math.abs(p[0] - s.pos[0]) < TOL && Math.abs(p[2] - s.pos[2]) < TOL)).toBe(true);
      }
      expect(first[0].pos).not.toEqual(first[1].pos); // two different spawn points
      for (let t = SHADE_FIRST_SPAWN; t < SHADE_FIRST_SPAWN + SHADE_SPAWNING_TICKS; t++) {
        expect(r.at(t).shades.slice(0, 2).map((s: any) => s.state), `tick ${t}`).toEqual(['spawning', 'spawning']);
        expect(r.at(t).shades.slice(0, 2).map((s: any) => s.pos)).toEqual(first.map((s: any) => s.pos)); // does not move
      }
      expect(r.at(SHADE_FIRST_SPAWN + SHADE_SPAWNING_TICKS).shades[0].state).not.toBe('spawning');

      // Motes: one more at 240, 480, ... until the cap or until every spawn point is taken (an idle player picks
      // nothing up and carries nothing, so nothing is ever dropped).
      const initial = r.at(0).motes_active;
      const ceiling = Math.min(MOTE_CAP, MOTE_SPAWN_POINTS.length);
      expect(initial).toBe(20);
      for (let k = 0; k * MOTE_SPAWN_EVERY <= ticks; k++) {
        const t = k * MOTE_SPAWN_EVERY;
        expect(r.at(t).motes_active, `tick ${t}`).toBe(Math.min(ceiling, initial + k));
        if (t > 0) expect(r.at(t - 1).motes_active, `tick ${t - 1}`).toBe(Math.min(ceiling, initial + k - 1));
      }
    }
  });

  it('random_shades:false and random_motes:false switch the schedules off', () => {
    const r = run.play({ player: { flames: 100 }, random_motes: false, random_shades: false, motes: [] }, undefined, { ticks: 1500, every: 100 });
    expect(r.named('shade_spawned')).toEqual([]);
    expect(r.snapshots.every((s) => s.shades.length === 0 && s.motes_active === 0)).toBe(true);
  });
});

describe('determinism of the whole game', () => {
  it('determinism: default level, 3600 ticks, scripted inputs -> two runs are byte-identical', () => {
    const a = run.fixture('determinism', { ticks: 3600, seed: 11, every: 10 });
    const b = run.fixture('determinism', { ticks: 3600, seed: 11, every: 10 });
    expect(a.text.length).toBeGreaterThan(10000);
    expect(a.text).toBe(b.text);
    expect(a.named('shade_spawned').length).toBeGreaterThan(0);
    // A different seed plays out differently.
    expect(run.fixture('determinism', { ticks: 3600, seed: 12, every: 10 }).text).not.toBe(a.text);
  });

  it('every line of a long run is valid contract JSON (types, key order, 3-decimal coordinates)', () => {
    const r = run.fixture('determinism', { ticks: 3600, seed: 5, every: 10 });
    expect(r.end.type).toBe('end');
    const eventNames = new Set(['mote_picked', 'deposit', 'lantern_lit', 'pulse', 'player_hit', 'shade_spawned', 'game_over', 'dash', 'charm_picked', 'night_start', 'paused', 'resumed']);
    for (const e of r.events) {
      expect(eventNames.has(e.name), e.name).toBe(true);
      expect(Object.keys(e)).toEqual(['type', 'tick', 'name', 'data']);
    }
    const states = new Set(['spawning', 'wander', 'chase', 'recoil', 'stunned']);
    for (const s of r.snapshots) {
      expect(Object.keys(s)).toEqual([
        'type', 'tick', 'sim_tick', 'night', 'state', 'time_left_s', 'score', 'wind', 'player', 'lanterns', 'shades', 'motes_active', 'motes', 'drifters', 'charms',
      ]);
      expect(s.motes_active).toBe(s.motes.length);
      for (const sh of s.shades) expect(states.has(sh.state), sh.state).toBe(true);
      for (const n of [...s.player.pos, ...s.shades.flatMap((x: any) => x.pos), ...s.motes.flatMap((m: any) => m.pos)]) {
        expect(Math.round(n * 1000) / 1000).toBe(n);
      }
    }
  });
});

describe('phase 2 (v1.1)', () => {
  it('dash-ground: dash advances z by dash_speed * dash_duration_s, cooldown blocks next press, re-enables after cd', () => {
    const r = run.fixture('dash-ground', { ticks: 125 });
    const dashEvents = r.named('dash');
    expect(dashEvents.map((e) => e.tick)).toEqual([11, 101]);

    const dashTicks = ticksOf(TUNING.dash_duration_s);
    const startZ = r.at(10).player.pos[2];
    const endZ = r.at(10 + dashTicks).player.pos[2];
    expect(endZ - startZ).toBeCloseTo((TUNING.dash_speed * dashTicks) / 60, 3);
  });

  it('dash-air: y stays constant during the 12 dash ticks of an airborne dash', () => {
    const r = run.fixture('dash-air', { ticks: 35 });
    expect(r.named('dash')).toHaveLength(1);
    expect(r.named('dash')[0]!.tick).toBe(11);

    const dashTicks = ticksOf(TUNING.dash_duration_s);
    const airY = r.at(10).player.pos[1];
    expect(airY).toBeGreaterThan(0);
    for (let t = 11; t <= 10 + dashTicks; t++) {
      expect(r.at(t).player.pos[1]).toBeCloseTo(airY, 3);
    }
  });

  it('dash-idle-facing: without move input dash moves along facing (+Z initially)', () => {
    const r = run.fixture('dash-idle-facing', { ticks: 20 });
    expect(r.named('dash')).toHaveLength(1);
    expect(r.named('dash')[0]!.tick).toBe(1);

    const dashTicks = ticksOf(TUNING.dash_duration_s);
    const snap = r.at(dashTicks);
    expect(snap.player.pos[0]).toBe(0);
    expect(snap.player.pos[2]).toBeCloseTo((TUNING.dash_speed * dashTicks) / 60, 3);
  });

  it('pause: pause freezes sim_tick, player position and time_left_s, resumed continues in same tick', () => {
    const r = run.fixture('pause', { ticks: 100 });
    expect(r.named('paused')).toEqual([{ type: 'event', tick: 11, name: 'paused', data: {} }]);
    expect(r.named('resumed')).toEqual([{ type: 'event', tick: 71, name: 'resumed', data: {} }]);

    const pPos = r.at(10).player.pos;
    for (let t = 11; t <= 70; t++) {
      const snap = r.at(t);
      expect(snap.sim_tick).toBe(10);
      expect(snap.state).toBe('paused');
      expect(snap.player.pos).toEqual(pPos);
      expect(snap.time_left_s).toBe(r.at(10).time_left_s);
    }
    expect(r.at(71).state).toBe('playing');
    expect(r.at(71).sim_tick).toBe(11);
  });

  it('charm: pickup grants charm effect, increased run speed, and zero dash cooldown', () => {
    const r = run.fixture('charm', { ticks: 185 });
    const picks = r.named('charm_picked');
    expect(picks).toHaveLength(1);
    expect(picks[0]!.data).toEqual({ charm_id: 'C1', charm_ticks: CHARM_TICKS });

    const pickTick = picks[0]!.tick;
    expect(pickTick).toBe(20);
    // Over 60 ticks (ticks 20 to 80), displacement is exactly 7.2 m
    expect(r.at(80).player.pos[2] - r.at(20).player.pos[2]).toBeCloseTo(60 * (CHARM_RUN_SPEED / 60), 3);

    // Both dashes at ticks 130 and 160 emit 'dash' (within 90 ticks cooldown)
    const dashes = r.named('dash');
    expect(dashes.map((d) => d.tick)).toEqual([131, 161]);

    const snap = r.at(pickTick);
    expect(snap.charms[0]!.available).toBe(false);
    expect(snap.charms[0]!.respawn_s).toBeCloseTo(CHARM_RESPAWN_TICKS / 60, 1);
  });

  it('fall-lost: fall event reports dropped: 0 and lost: carried', () => {
    const r = run.fixture('fall-lost', { ticks: 100 });
    const falls = r.named('player_hit');
    expect(falls).toHaveLength(1);
    expect(falls[0]!.data).toEqual({ by: 'fall', flames: 2, dropped: 0, lost: 4 });
  });

  it('snapshot-v1.1: snapshot contains all v1.1 keys in order, wind, drifters, charm and mote kind/ttl_s', () => {
    const r = run.fixture('snapshot-v1.1', { ticks: 10 });
    const snap0 = r.at(0);
    expect(Object.keys(snap0)).toEqual([
      'type', 'tick', 'sim_tick', 'night', 'state', 'time_left_s', 'score', 'wind', 'player', 'lanterns', 'shades', 'motes_active', 'motes', 'drifters', 'charms',
    ]);
    expect(snap0.wind).toEqual({ active: false, dir_deg: 0 });
    expect(snap0.drifters).toEqual([]);
    expect(snap0.motes[0]!.kind).toBe('random');
    expect(snap0.motes[0]!.ttl_s).toBeNull();

    // After hit at tick 1, dropped motes have kind 'dropped' and ttl_s 8
    const snap1 = r.at(1);
    const droppedMote = snap1.motes.find((m: any) => m.kind === 'dropped');
    expect(droppedMote).toBeDefined();
    expect(droppedMote.ttl_s).toBeCloseTo(DROP_TTL / 60, 3);
  });

  it('night-start: first event of any run is night_start at tick 1', () => {
    const r = run.fixture('night-start', { ticks: 5 });
    expect(r.events[0]).toEqual({ type: 'event', tick: 1, name: 'night_start', data: { night: 1 } });
  });

  it('scenario-v1.1: initial shade state and state_ticks_left, player invuln_ticks prevents early hits', () => {
    const r = run.fixture('scenario-v1.1', { ticks: 70 });
    for (let t = 0; t < 30; t++) {
      expect(r.at(t).shades.find((s: any) => s.id === 'S1')!.state).toBe('stunned');
    }
    expect(r.at(30).shades.find((s: any) => s.id === 'S1')!.state).not.toBe('stunned');

    // Player invulnerable until tick 60
    const hits = r.named('player_hit');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.tick).toBe(60);
  });
});
