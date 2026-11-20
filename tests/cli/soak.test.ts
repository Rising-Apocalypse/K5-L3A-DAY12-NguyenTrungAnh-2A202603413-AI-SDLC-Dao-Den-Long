import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
const BIN = join(ROOT, 'dist/soak.js');
const dir = mkdtempSync(join(tmpdir(), 'dao-den-long-soak-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function soak(args: string[]) {
  const r = spawnSync(process.execPath, ['--expose-gc', BIN, ...args], { cwd: ROOT, encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe('soak CLI', () => {
  it('writes the contract JSON: 10 results, no crashes, nights cycle 1/2/3, seeds seed+i', () => {
    const out = join(dir, 'a.json');
    // flags in a different order than the documented one
    const r = soak(['--out', out, '--verbose', '--nights', '10', '--seed', '7']);
    expect(r.status).toBe(0);
    const doc = JSON.parse(readFileSync(out, 'utf8'));
    expect(Object.keys(doc)).toEqual(['contract_version', 'nights', 'crashes', 'results', 'mem_start_mb', 'mem_end_mb', 'duration_s']);
    expect(doc.contract_version).toBe('1.3');
    expect(doc.nights).toBe(10);
    expect(doc.crashes).toBe(0);
    expect(doc.results).toHaveLength(10);
    for (const x of doc.results) expect(['won', 'lost']).toContain(x);
    expect(doc.mem_start_mb).toBeGreaterThan(0);
    expect(doc.mem_end_mb).toBeGreaterThan(0);
    expect(doc.duration_s).toBeGreaterThanOrEqual(0);

    const rows = r.stdout.split('\n').filter((l) => /^\d+ \d+ \w+ \d+$/.test(l)).map((l) => l.split(' '));
    expect(rows).toHaveLength(10);
    // night i: ((i-1) % 3) + 1 -> 1,2,3,1,2,3,1,2,3,1 ; seed 7 + i -> 8..17
    expect(rows.map((x) => x[0])).toEqual(['1', '2', '3', '1', '2', '3', '1', '2', '3', '1']);
    expect(rows.map((x) => x[1])).toEqual(['8', '9', '10', '11', '12', '13', '14', '15', '16', '17']);
    expect(rows.map((x) => x[2])).toEqual(doc.results);
  });

  it('is deterministic for the same seed (results and per-night tick counts)', () => {
    const a = soak(['--seed', '3', '--nights', '4', '--out', join(dir, 'b1.json'), '--verbose']);
    const b = soak(['--seed', '3', '--nights', '4', '--out', join(dir, 'b2.json'), '--verbose']);
    expect(a.stdout.split('\n').filter((l) => /^\d+ \d+ \w+ \d+$/.test(l))).toEqual(b.stdout.split('\n').filter((l) => /^\d+ \d+ \w+ \d+$/.test(l)));
    expect(JSON.parse(readFileSync(join(dir, 'b1.json'), 'utf8')).results).toEqual(JSON.parse(readFileSync(join(dir, 'b2.json'), 'utf8')).results);
  });

  it('usage errors exit 1 and write nothing', () => {
    const out = join(dir, 'bad.json');
    for (const args of [
      ['--seed', '7', '--nights', '0', '--out', out],
      ['--seed', '7', '--nights', 'x', '--out', out],
      ['--seed', '7', '--out', out],
      ['--seed', '7', '--nights', '2'],
      ['--seed', '7', '--nights', '2', '--out', out, '--bogus', '1'],
    ]) {
      const r = soak(args);
      expect(r.status, args.join(' ')).toBe(1);
      expect(r.stderr).toMatch(/error:/);
    }
    expect(existsSync(out)).toBe(false);
  });
});
