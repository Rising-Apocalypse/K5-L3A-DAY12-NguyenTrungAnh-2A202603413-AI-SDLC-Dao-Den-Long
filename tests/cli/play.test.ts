import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
const BIN = join(ROOT, 'dist/play.js');
const dir = mkdtempSync(join(tmpdir(), 'dao-den-long-play-cli-'));
const children: ChildProcess[] = [];
afterAll(() => {
  for (const c of children) c.kill();
  rmSync(dir, { recursive: true, force: true });
});

const entry = (name: string, score: number, at: string) => ({ name, score, nights_won: 1, achieved_at: at, seed: 7 });

function play(args: string[]) {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd: ROOT, encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

async function freePort(): Promise<number> {
  return new Promise((ok, fail) => {
    const s = createServer();
    s.once('error', fail);
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => ok(port));
    });
  });
}

describe('play launcher: --export-leaderboard', () => {
  it('no storage file -> {"entries": []}, exit 0', () => {
    const out = join(dir, 'empty-out.json');
    const r = play(['--leaderboard-file', join(dir, 'does-not-exist.json'), '--export-leaderboard', out]);
    expect(r.status).toBe(0);
    expect(JSON.parse(readFileSync(out, 'utf8'))).toEqual({ entries: [] });
    expect(r.stdout).toContain('0');
  });

  it('12 unsorted entries -> the 10 best, in order (score desc, earlier first on ties)', () => {
    const file = join(dir, 'twelve.json');
    // scores in file order: 30 20 90 10 50 50 70 40 60 80 15 5. Top 10 drops 10 and 5.
    // Two 50s: "ear" 2026-01-01 is before "lat" 2026-02-01, though "lat" comes first in the file.
    const list = [
      entry('s30', 30, '2026-01-01T00:00:00+07:00'),
      entry('s20', 20, '2026-01-01T00:00:00+07:00'),
      entry('s90', 90, '2026-01-01T00:00:00+07:00'),
      entry('s10', 10, '2026-01-01T00:00:00+07:00'),
      entry('lat', 50, '2026-02-01T00:00:00+07:00'),
      entry('ear', 50, '2026-01-01T00:00:00+07:00'),
      entry('s70', 70, '2026-01-01T00:00:00+07:00'),
      entry('s40', 40, '2026-01-01T00:00:00+07:00'),
      entry('s60', 60, '2026-01-01T00:00:00+07:00'),
      entry('s80', 80, '2026-01-01T00:00:00+07:00'),
      entry('s15', 15, '2026-01-01T00:00:00+07:00'),
      entry('s05', 5, '2026-01-01T00:00:00+07:00'),
    ];
    writeFileSync(file, JSON.stringify({ entries: list }));
    const out = join(dir, 'twelve-out.json');
    const r = play(['--leaderboard-file', file, '--export-leaderboard', out]);
    expect(r.status).toBe(0);
    const doc = JSON.parse(readFileSync(out, 'utf8'));
    expect(Object.keys(doc)).toEqual(['entries']);
    expect(doc.entries.map((e: { name: string }) => e.name)).toEqual(['s90', 's80', 's70', 's60', 'ear', 'lat', 's40', 's30', 's20', 's15']);
    expect(Object.keys(doc.entries[0])).toEqual(['name', 'score', 'nights_won', 'achieved_at', 'seed']);
  });

  it('usage errors exit 1', () => {
    expect(play(['--bogus']).status).toBe(1);
    expect(play(['--export-leaderboard']).status).toBe(1);
  });
});

describe('play launcher: server', () => {
  let port = 0;
  let base = '';
  const board = join(dir, 'server', 'data', 'board.json'); // folder does not exist yet: created on demand
  const web = join(dir, 'web');

  beforeAll(async () => {
    mkdirSync(web, { recursive: true });
    writeFileSync(join(web, 'index.html'), '<!doctype html><title>x</title>');
    writeFileSync(join(web, 'a.js'), 'export {}');
    writeFileSync(join(dir, 'secret.txt'), 'secret');
    port = await freePort();
    base = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, [BIN, '--no-open', '--port', String(port), '--web-dir', web, '--leaderboard-file', board], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child);
    await new Promise<void>((ok, fail) => {
      let text = '';
      child.stdout!.on('data', (d) => {
        text += d;
        if (text.includes('Leaderboard file:')) ok();
      });
      child.once('exit', (code) => fail(new Error(`launcher exited early (${code}): ${text}`)));
      setTimeout(() => fail(new Error('launcher did not start')), 8000);
    });
  });

  it('serves the static files with MIME types and 404s', async () => {
    const index = await fetch(`${base}/`);
    expect(index.status).toBe(200);
    expect(index.headers.get('content-type')).toContain('text/html');
    expect(await index.text()).toContain('<title>x</title>');
    expect((await fetch(`${base}/a.js`)).headers.get('content-type')).toContain('text/javascript');
    expect((await fetch(`${base}/nope.txt`)).status).toBe(404);
  });

  it('does not serve files outside the web folder', async () => {
    const r = await fetch(`${base}/%2e%2e/secret.txt`);
    expect(r.status).not.toBe(200);
    expect(await r.text()).not.toContain('secret');
  });

  it('empty board, then POST two entries -> GET returns them sorted, export matches', async () => {
    expect(await (await fetch(`${base}/api/leaderboard`)).json()).toEqual({ entries: [] });
    const low = entry('Thấp', 40, '2026-11-20T21:00:00+07:00');
    const high = entry('Mây_01', 90, '2026-11-20T22:00:00+07:00');
    const post = (e: unknown) => fetch(`${base}/api/leaderboard`, { method: 'POST', body: JSON.stringify(e), headers: { 'content-type': 'application/json' } });
    expect((await post(low)).status).toBe(200);
    const second = await post(high);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ entries: [high, low] });
    expect(await (await fetch(`${base}/api/leaderboard`)).json()).toEqual({ entries: [high, low] });

    const out = join(dir, 'server-export.json');
    expect(play(['--leaderboard-file', board, '--export-leaderboard', out]).status).toBe(0);
    expect(JSON.parse(readFileSync(out, 'utf8'))).toEqual({ entries: [high, low] });
  });

  it('invalid POST -> 400 and nothing saved', async () => {
    const post = (body: string) => fetch(`${base}/api/leaderboard`, { method: 'POST', body });
    expect((await post('not json')).status).toBe(400);
    expect((await post(JSON.stringify({ ...entry('ab', 5, '2026-11-20T21:00:00+07:00') }))).status).toBe(400); // name too short
    expect((await post(JSON.stringify({ ...entry('okname', 5, 'yesterday') }))).status).toBe(400);
    expect((await post(JSON.stringify({ ...entry('okname', -5, '2026-11-20T21:00:00+07:00') }))).status).toBe(400);
    const list = (await (await fetch(`${base}/api/leaderboard`)).json()) as { entries: unknown[] };
    expect(list.entries).toHaveLength(2);
  });
});

describe('play launcher: missing build', () => {
  it('web folder without index.html -> message and exit 1', () => {
    const empty = join(dir, 'no-web');
    mkdirSync(empty, { recursive: true });
    const r = play(['--no-open', '--web-dir', empty]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('npm run build');
  });
});
