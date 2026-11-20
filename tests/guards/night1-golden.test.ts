import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// Golden regression guard (written by the planner before Nights 2-3 were added, at phase-3 = 7c71709).
// Adding Nights 2 and 3 must not change a single byte of Night 1 headless output. If a later ticket
// changes Night 1 rules on purpose, regenerate these files in that commit and say why in CHANGELOG.md.
const ROOT = resolve(import.meta.dirname, '../..');
const BIN = join(ROOT, 'dist/headless.js');
const GOLDEN = join(ROOT, 'tests/golden');
const dir = mkdtempSync(join(tmpdir(), 'dao-den-long-golden-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const CASES: { name: string; seed: number; inputs?: string }[] = [
  { name: 'night1-seed1', seed: 1 },
  { name: 'night1-seed2', seed: 2 },
  { name: 'night1-seed3', seed: 3 },
  { name: 'night1-seed7-busy', seed: 7, inputs: 'night1-busy-inputs.json' },
  { name: 'night1-seed8-busy', seed: 8, inputs: 'night1-busy-inputs.json' },
];

describe('Night 1 golden output (byte-identical)', () => {
  it.each(CASES)('$name', ({ name, seed, inputs }) => {
    expect(existsSync(BIN)).toBe(true);
    const out = join(dir, `${name}.jsonl`);
    const args = [BIN, '--seed', String(seed), '--night', '1', '--ticks', '14400', '--snapshot-every', '300', '--out', out];
    if (inputs) args.push('--inputs', join(GOLDEN, inputs));
    const run = spawnSync(process.execPath, args, { encoding: 'utf8' });
    expect(run.status, run.stderr).toBe(0);
    expect(readFileSync(out, 'utf8')).toBe(readFileSync(join(GOLDEN, `${name}.jsonl`), 'utf8'));
  });
});
