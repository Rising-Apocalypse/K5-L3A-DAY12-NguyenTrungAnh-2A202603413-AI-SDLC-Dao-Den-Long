import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TUNING } from '../../src/core/tuning';

const ROOT = resolve(import.meta.dirname, '../..');
const BIN = join(ROOT, 'dist/headless.js');
const SAMPLE = join(ROOT, 'tests/scenarios/contract-sample');

let dir: string;
let counter = 0;

beforeAll(() => {
  if (!existsSync(BIN)) throw new Error('dist/headless.js is missing: run `npm run build:headless` (or `npm test`)');
  dir = mkdtempSync(join(tmpdir(), 'dao-den-long-'));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function headless(args: string[]) {
  return spawnSync(process.execPath, [BIN, ...args], { cwd: ROOT, encoding: 'utf8' });
}

/** Run with --seed/--night/--out filled in. Returns the process result plus the parsed output lines. */
function run(extra: string[], opts: { seed?: number; ticks?: number } = {}) {
  const out = join(dir, `run-${counter++}.jsonl`);
  const args = ['--seed', String(opts.seed ?? 1), '--night', '1', '--ticks', String(opts.ticks ?? 100), '--out', out, ...extra];
  const result = headless(args);
  const text = existsSync(out) ? readFileSync(out, 'utf8') : '';
  const lines = text === '' ? [] : text.trimEnd().split('\n').map((l) => JSON.parse(l));
  return { result, out, text, lines };
}

function writeJson(name: string, doc: unknown): string {
  const path = join(dir, name);
  writeFileSync(path, typeof doc === 'string' ? doc : JSON.stringify(doc));
  return path;
}

const snapshots = (lines: any[]) => lines.filter((l) => l.type === 'snapshot');

describe('headless output', () => {
  it('exits 0, writes only JSON lines, and the last line is the end line', () => {
    const { result, lines, text } = run([], { ticks: 95 });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(text.endsWith('\n')).toBe(true);
    expect(lines[0].type).toBe('snapshot');
    expect(lines[lines.length - 1]).toEqual({ type: 'end', ticks: 95, state: 'playing', score: 0 });
  });

  it('writes snapshots at ticks 0, 10, 20, ... <= N by default', () => {
    const { lines } = run([], { ticks: 95 });
    expect(snapshots(lines).map((s) => s.tick)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
    const exact = run([], { ticks: 100 });
    expect(snapshots(exact.lines).map((s) => s.tick).at(-1)).toBe(100);
  });

  it('honours --snapshot-every', () => {
    const { lines } = run(['--snapshot-every', '7'], { ticks: 30 });
    expect(snapshots(lines).map((s) => s.tick)).toEqual([0, 7, 14, 21, 28]);
    const every1 = run(['--snapshot-every', '1'], { ticks: 5 });
    expect(snapshots(every1.lines).map((s) => s.tick)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('--ticks 0 writes exactly one snapshot (tick 0) and the end line', () => {
    const { result, lines } = run([], { ticks: 0 });
    expect(result.status).toBe(0);
    expect(lines.length).toBe(2);
    expect(lines[0]).toMatchObject({ type: 'snapshot', tick: 0, sim_tick: 0, state: 'playing', score: 0 });
    expect(lines[1]).toEqual({ type: 'end', ticks: 0, state: 'playing', score: 0 });
  });

  it('snapshot fields follow the contract: key order, time_left_s, rounding, motes', () => {
    const inputs = writeJson('rounding-inputs.json', { frames: [{ tick: 0, move: [0.37, 0.91], cam_yaw_deg: 17.3 }] });
    const { lines } = run(['--inputs', inputs], { ticks: 100 });
    const snap = snapshots(lines)[3];
    expect(Object.keys(snap)).toEqual([
      'type', 'tick', 'sim_tick', 'night', 'state', 'time_left_s', 'score', 'wind', 'player', 'lanterns', 'shades', 'motes_active', 'motes', 'drifters', 'charms',
    ]);
    expect(snap.tick).toBe(30);
    expect(snap.sim_tick).toBe(30);
    expect(snap.time_left_s).toBe(299.5);
    expect(snap.motes_active).toBe(20);
    expect(snap.motes.length).toBe(20);
    expect(snap.shades).toEqual([]);
    const numbers: number[] = [...snap.player.pos, ...snap.lanterns.flatMap((l: any) => l.pos), ...snap.motes.flatMap((m: any) => m.pos)];
    for (const n of numbers) expect(Math.round(n * 1000) / 1000).toBe(n);
  });

  it('with no inputs file the player stays at the origin', () => {
    const { lines } = run([], { ticks: 300 });
    for (const s of snapshots(lines)) expect(s.player.pos).toEqual([0, 0, 0]);
  });

  it('plays the contract sample scenario + inputs cleanly', () => {
    const { result, lines } = run(['--scenario', join(SAMPLE, 'scenario.json'), '--inputs', join(SAMPLE, 'inputs.json')], { seed: 7, ticks: 300 });
    expect(result.status).toBe(0);
    const first = lines[0];
    expect(first.motes).toEqual([{ id: 'M1', pos: [0, 0, 5], kind: 'random', ttl_s: null }]);
    expect(first.shades).toEqual([{ id: 'S1', pos: [10, 0, 0], state: 'wander' }]);
    expect(first.lanterns[0]).toEqual({ id: 'L1', pos: [0, 0, 25], lit: false, deposited: 0 });
    expect(first.time_left_s).toBe(300);
    // Moves [0,1] for the first 120 ticks, then stops: z = speed * 120 / 60.
    const at = (tick: number) => snapshots(lines).find((s) => s.tick === tick);
    expect(at(60).player.pos).toEqual([0, 0, (TUNING.player_speed * 60) / 60]);
    expect(at(120).player.pos).toEqual([0, 0, (TUNING.player_speed * 120) / 60]);
    expect(at(300).player.pos).toEqual([0, 0, (TUNING.player_speed * 120) / 60]);
    expect(lines.at(-1)).toEqual({ type: 'end', ticks: 300, state: 'playing', score: 0 });
  });

  it('building a scenario writes no event lines (even with a pre-lit lantern)', () => {
    const scenario = writeJson('lit.json', { lanterns: [{ id: 'L2', lit: true, deposited: 10 }] });
    const { lines } = run(['--scenario', scenario], { ticks: 50 });
    expect(lines.filter((l) => l.type === 'event' && l.name !== 'night_start')).toEqual([]);
    expect(lines.at(-1).score).toBe(0);
  });

  it('walk-north-60 fixture: z = player_speed after 60 ticks, then stands still', () => {
    const dirName = join(ROOT, 'tests/scenarios/walk-north-60');
    const { lines } = run(['--scenario', join(dirName, 'scenario.json'), '--inputs', join(dirName, 'inputs.json')], { ticks: 120 });
    const at = (tick: number) => snapshots(lines).find((s) => s.tick === tick);
    expect(at(60).player.pos[2]).toBe(TUNING.player_speed);
    expect(at(120).player.pos[2]).toBe(TUNING.player_speed);
  });

  it('jumping shows up in the snapshots (y > 0 in the air, back to 0 after landing)', () => {
    const inputs = writeJson('jump.json', { frames: [{ tick: 0, jump: true }, { tick: 1, jump: false }] });
    const { lines } = run(['--inputs', inputs, '--snapshot-every', '1'], { ticks: 60 });
    const ys = snapshots(lines).map((s) => s.player.pos[1]);
    expect(Math.max(...ys)).toBeCloseTo(1.225, 3);
    expect(ys.at(-1)).toBe(0);
  });

  it('creates the parent directory of --out', () => {
    const out = join(dir, 'nested', 'deeper', 'x.jsonl');
    const result = headless(['--seed', '1', '--night', '1', '--ticks', '3', '--out', out]);
    expect(result.status).toBe(0);
    expect(existsSync(out)).toBe(true);
  });

  it('runs a full default night (up to 18000 ticks) quickly and always ends with an end line', () => {
    const started = Date.now();
    const { result, lines } = run([], { ticks: 18000 });
    expect(result.status).toBe(0);
    expect(Date.now() - started).toBeLessThan(20000);
    const end = lines.at(-1);
    expect(end.type).toBe('end');
    expect(end.ticks).toBeGreaterThan(0);
    expect(end.ticks).toBeLessThanOrEqual(18000);
    expect(end.state).not.toBe('playing'); // an idle player cannot survive the whole night (or the night ends: dawn)
  });

  it('a night without shades and without actions ends exactly at dawn: tick 18000, time_left_s 0, lost', () => {
    const scenario = writeJson('quiet-night.json', { random_shades: false });
    const { result, lines } = run(['--scenario', scenario], { ticks: 20000 });
    expect(result.status).toBe(0);
    expect(lines.at(-1)).toEqual({ type: 'end', ticks: TUNING.night1_duration_s * 60, state: 'lost', score: 0 });
    expect(snapshots(lines).at(-1).time_left_s).toBe(0);
    expect(lines.at(-2)).toMatchObject({ type: 'snapshot', tick: 18000, state: 'lost' });
  });
});

describe('determinism', () => {
  it('same seed, default level -> byte-identical output', () => {
    const a = run([], { seed: 123, ticks: 600 });
    const b = run([], { seed: 123, ticks: 600 });
    expect(a.text.length).toBeGreaterThan(1000);
    expect(Buffer.from(a.text).equals(Buffer.from(b.text))).toBe(true);
  });

  it('same seed + scenario + inputs -> byte-identical output', () => {
    const extra = ['--scenario', join(SAMPLE, 'scenario.json'), '--inputs', join(SAMPLE, 'inputs.json')];
    const a = run(extra, { seed: 7, ticks: 600 });
    const b = run(extra, { seed: 7, ticks: 600 });
    expect(a.text.length).toBeGreaterThan(1000);
    expect(a.text).toBe(b.text);
  });

  it('all fixture scenarios are byte-identical across two runs', () => {
    for (const name of ['contract-sample', 'walk-north-60', 'empty-world']) {
      const base = join(ROOT, 'tests/scenarios', name);
      const extra = ['--scenario', join(base, 'scenario.json'), '--inputs', join(base, 'inputs.json')];
      expect(run(extra, { ticks: 600 }).text, name).toBe(run(extra, { ticks: 600 }).text);
    }
  });

  it('a different seed gives a different default level', () => {
    expect(run([], { seed: 1, ticks: 10 }).text).not.toBe(run([], { seed: 2, ticks: 10 }).text);
  });

  it('negative seeds work and are deterministic', () => {
    expect(run([], { seed: -42, ticks: 20 }).text).toBe(run([], { seed: -42, ticks: 20 }).text);
  });
});

describe('error handling', () => {
  const ok = { frames: [{ tick: 0, move: [0, 1] }] };

  function expectExit2(extra: string[]) {
    const { result, text } = run(extra);
    expect(result.status).toBe(2);
    expect(result.stderr).not.toBe('');
    expect(result.stdout).toBe('');
    expect(text).toBe(''); // nothing written
  }

  it('exit 2: invalid JSON in the inputs file', () => {
    expectExit2(['--inputs', writeJson('bad1.json', '{"frames": [')]);
  });

  it('exit 2: invalid JSON in the scenario file', () => {
    expectExit2(['--scenario', writeJson('bad2.json', 'not json at all')]);
  });

  it('exit 2: non-increasing and duplicate ticks', () => {
    expectExit2(['--inputs', writeJson('dup.json', { frames: [{ tick: 5 }, { tick: 5 }] })]);
    expectExit2(['--inputs', writeJson('dec.json', { frames: [{ tick: 9 }, { tick: 2 }] })]);
  });

  it('exit 2: out-of-range move component and wrong types in frames', () => {
    expectExit2(['--inputs', writeJson('range.json', { frames: [{ tick: 0, move: [2, 0] }] })]);
    expectExit2(['--inputs', writeJson('type.json', { frames: [{ tick: 0, jump: 'yes' }] })]);
    expectExit2(['--inputs', writeJson('top.json', [ok])]);
  });

  it('exit 2: bad scenario fields', () => {
    expectExit2(['--scenario', writeJson('s1.json', { player: { pos: [0, 0] } })]);
    expectExit2(['--scenario', writeJson('s2.json', { time_left_s: -5 })]);
    expectExit2(['--scenario', writeJson('s3.json', { motes: [[1, 2]] })]);
    expectExit2(['--scenario', writeJson('s4.json', { random_motes: 'false' })]);
  });

  it('exit 2: a scenario that names a lantern which does not exist', () => {
    expectExit2(['--scenario', writeJson('s5.json', { lanterns: [{ id: 'L9' }] })]);
  });

  it('exit 1 (not 0, not 2): missing required flags, unknown flag, bad values', () => {
    const base = ['--seed', '1', '--night', '1', '--ticks', '5', '--out', join(dir, 'never.jsonl')];
    const without = (flag: string) => {
      const i = base.indexOf(flag);
      return base.filter((_, idx) => idx !== i && idx !== i + 1);
    };
    for (const flag of ['--seed', '--night', '--ticks', '--out']) {
      const r = headless(without(flag));
      expect(r.status, `missing ${flag}`).toBe(1);
      expect(r.stderr).toContain(flag);
    }
    expect(headless([...base, '--bogus', '1']).status).toBe(1);
    expect(headless([...base, 'stray']).status).toBe(1);
    expect(headless([...base, '--ticks', '6']).status).toBe(1); // flag twice
    expect(headless(['--seed', '1', '--night', '2', '--ticks', '5', '--out', join(dir, 'never.jsonl')]).status).toBe(1);
    expect(headless(['--seed', 'abc', '--night', '1', '--ticks', '5', '--out', join(dir, 'never.jsonl')]).status).toBe(1);
    expect(headless(['--seed', '1.5', '--night', '1', '--ticks', '5', '--out', join(dir, 'never.jsonl')]).status).toBe(1);
    expect(headless(['--seed', '1', '--night', '1', '--ticks', '-1', '--out', join(dir, 'never.jsonl')]).status).toBe(1);
    expect(headless([...base, '--snapshot-every', '0']).status).toBe(1);
    expect(headless([...base, '--snapshot-every', 'x']).status).toBe(1);
    expect(headless([]).status).toBe(1);
    expect(existsSync(join(dir, 'never.jsonl'))).toBe(false);
  });

  it('exit 1: missing scenario or inputs file', () => {
    const a = run(['--scenario', join(dir, 'does-not-exist.json')]);
    expect(a.result.status).toBe(1);
    expect(a.result.stderr).toContain('does-not-exist.json');
    const b = run(['--inputs', join(dir, 'nope.json')]);
    expect(b.result.status).toBe(1);
    expect(b.text).toBe('');
  });

  it('accepts negative seeds on the command line', () => {
    expect(run([], { seed: -7, ticks: 1 }).result.status).toBe(0);
  });
});
