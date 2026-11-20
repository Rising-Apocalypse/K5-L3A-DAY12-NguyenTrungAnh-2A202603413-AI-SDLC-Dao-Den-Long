import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const BIN = join(ROOT, 'dist/headless.js');

export interface RunOptions {
  seed?: number;
  ticks: number;
  /** Snapshot every n ticks (default 1, so tests can look at every single tick). */
  every?: number;
  /** Night to play (default: 2 / 3 for fixtures named n2-* / n3-*, else 1). */
  night?: 1 | 2 | 3;
}

/** One parsed JSONL line (loosely typed on purpose: the tests assert the exact shapes). */
export type Line = Record<string, any>;

export interface Result {
  status: number | null;
  stderr: string;
  text: string;
  lines: Line[];
  snapshots: Line[];
  events: Line[];
  end: Line;
  /** Events with this name, in order. */
  named(name: string): Line[];
  /** The snapshot written at `tick` (throws if there is none). */
  at(tick: number): Line;
}

/** Runs the real headless CLI (dist/headless.js) on a scenario + inputs and parses what it wrote. */
export function createRunner() {
  if (!existsSync(BIN)) throw new Error('dist/headless.js is missing: run `npm run build:headless` (or `npm test`)');
  const dir = mkdtempSync(join(tmpdir(), 'dao-den-long-play-'));
  let counter = 0;

  function write(name: string, doc: unknown): string {
    const path = join(dir, `${counter++}-${name}`);
    writeFileSync(path, JSON.stringify(doc));
    return path;
  }

  function execute(extra: string[], opts: RunOptions): Result {
    const out = join(dir, `run-${counter++}.jsonl`);
    const args = ['--seed', String(opts.seed ?? 1), '--night', String(opts.night ?? 1), '--ticks', String(opts.ticks), '--snapshot-every', String(opts.every ?? 1), '--out', out, ...extra];
    const r = spawnSync(process.execPath, [BIN, ...args], { cwd: ROOT, encoding: 'utf8' });
    const text = existsSync(out) ? readFileSync(out, 'utf8') : '';
    const lines: Line[] = text === '' ? [] : text.trimEnd().split('\n').map((l) => JSON.parse(l));
    const snapshots = lines.filter((l) => l.type === 'snapshot');
    const events = lines.filter((l) => l.type === 'event');
    return {
      status: r.status,
      stderr: r.stderr,
      text,
      lines,
      snapshots,
      events,
      end: lines[lines.length - 1]!,
      named: (name) => events.filter((e) => e.name === name),
      at(tick) {
        const s = snapshots.find((x) => x.tick === tick);
        if (!s) throw new Error(`no snapshot at tick ${tick}`);
        return s;
      },
    };
  }

  return {
    dir,
    /** Raw CLI call with exactly these arguments. */
    cli(args: string[]): { status: number | null; stderr: string } {
      const r = spawnSync(process.execPath, [BIN, ...args], { cwd: ROOT, encoding: 'utf8' });
      return { status: r.status, stderr: r.stderr };
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
    /** Run a fixture from tests/scenarios/<name>/ (scenario.json and inputs.json, either may be missing). */
    fixture(name: string, opts: RunOptions): Result {
      const base = join(ROOT, 'tests/scenarios', name);
      const extra: string[] = [];
      if (existsSync(join(base, 'scenario.json'))) extra.push('--scenario', join(base, 'scenario.json'));
      if (existsSync(join(base, 'inputs.json'))) extra.push('--inputs', join(base, 'inputs.json'));
      return execute(extra, { night: name.startsWith('n2-') ? 2 : name.startsWith('n3-') ? 3 : 1, ...opts });
    },
    /** Run with scenario / inputs given as objects. */
    play(scenario: unknown, inputs: unknown, opts: RunOptions): Result {
      const extra: string[] = [];
      if (scenario !== undefined) extra.push('--scenario', write('scenario.json', scenario));
      if (inputs !== undefined) extra.push('--inputs', write('inputs.json', inputs));
      return execute(extra, opts);
    },
    /** Read a fixture file as JSON. */
    load(name: string, file: 'scenario.json' | 'inputs.json'): any {
      return JSON.parse(readFileSync(join(ROOT, 'tests/scenarios', name, file), 'utf8'));
    },
  };
}

export type Runner = ReturnType<typeof createRunner>;

/** XZ distance between two positions of a snapshot. */
export const xz = (a: number[], b: number[]): number => Math.hypot(a[0]! - b[0]!, a[2]! - b[2]!);
/** 3D distance. */
export const d3 = (a: number[], b: number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
/** Seconds -> ticks the same way the game does. */
export const ticksOf = (seconds: number): number => Math.round(seconds * 60);
