// Benchmark driver: serves dist/web, opens the installed Chrome/Chromium/Edge on the bench page and writes bench.json.
//   node scripts/bench.mjs --seed 42 --duration 30 --out bench.json
// Node built-ins only (t0 is taken before the imports below load, which are all local or node: modules). See README ("Bench") for what the numbers mean.
const t0 = Date.now();

import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import { delimiter, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WARMUP_S,
  benchDocument,
  benchPageUrl,
  browserArgs,
  browserCandidates,
  findBrowser,
  kbToMb,
  parseBenchArgs,
  sumTreeRssKb,
  thresholds,
} from './bench-lib.mjs';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const WEB = join(ROOT, 'dist', 'web');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
};

function fail(message) {
  process.stderr.write(`error: ${message}\n`);
  process.exit(1);
}

let args;
try {
  args = parseBenchArgs(process.argv.slice(2));
} catch (e) {
  fail(e.message);
}
if (!existsSync(join(WEB, 'index.html'))) fail('dist/web/index.html not found: run npm run build first');

const browser = findBrowser(
  browserCandidates(process.platform, process.env),
  existsSync,
  (process.env.PATH ?? '').split(delimiter).filter(Boolean),
  sep,
);
if (!browser) {
  fail(
    'no Chrome/Chromium/Edge found. Install one, or set CHROME_PATH to its executable.\n' +
      `tried: ${browserCandidates(process.platform, process.env).join(', ')}`,
  );
}

// --- server: static dist/web + the two bench endpoints --------------------------------------------------------
let onResult;
let onMeasureStart;
const resultPromise = new Promise((ok) => (onResult = ok));
const measureStarted = new Promise((ok) => (onMeasureStart = ok));

const server = createServer((req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  if (req.method === 'POST' && (url === '/bench-result' || url === '/bench-measure-start')) {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      res.writeHead(204).end();
      if (url === '/bench-measure-start') return onMeasureStart();
      try {
        onResult(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        /* a malformed report is ignored: the timeout will end the run */
      }
    });
    return;
  }
  if (req.method !== 'GET') return void res.writeHead(405).end();
  let path;
  try {
    path = decodeURIComponent(url);
  } catch {
    return void res.writeHead(400).end();
  }
  if (path.endsWith('/')) path += 'index.html';
  const file = resolve(join(WEB, normalize(path)));
  if (file !== WEB && !file.startsWith(WEB + sep)) return void res.writeHead(403).end();
  try {
    const data = readFileSync(file);
    res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((ok, no) => {
  server.once('error', no);
  server.listen(0, '127.0.0.1', ok);
});
const port = server.address().port;
const url = benchPageUrl(port, args.seed, args.duration);

// --- browser ----------------------------------------------------------------------------------------------------
const userDataDir = mkdtempSync(join(os.tmpdir(), 'dao-den-long-bench-'));
const child = spawn(browser, browserArgs(userDataDir, url), { stdio: 'ignore', detached: process.platform !== 'win32' });
let browserGone = false;
child.on('exit', () => (browserGone = true));
child.on('error', (e) => {
  browserGone = true;
  process.stderr.write(`error: cannot start ${browser}: ${e.message}\n`);
});

function killBrowser() {
  try {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-child.pid, 'SIGKILL');
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {
      /* already gone */
    }
  }
}

function cleanup() {
  killBrowser();
  server.close();
  setTimeout(() => {
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      /* the browser may still hold files; the folder is in the temp dir */
    }
  }, 1000).unref();
}

// Peak RSS of the browser process tree, sampled every 500 ms during the measured window only (POSIX).
let peakKb = null;
let sampling = false;
const sample = () =>
  new Promise((ok) => {
    if (process.platform === 'win32') return ok();
    execFile('ps', ['-A', '-o', 'pid=,ppid=,rss='], { maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => {
      if (!err) {
        const kb = sumTreeRssKb(stdout, child.pid);
        if (kb > 0 && (peakKb === null || kb > peakKb)) peakKb = kb;
      }
      ok();
    });
  });
const sampler = setInterval(() => {
  if (sampling) void sample();
}, 500);
void measureStarted.then(() => {
  sampling = true;
  void sample();
});

process.stdout.write(`bench: ${browser}\nbench: ${url}\nbench: warm-up ${WARMUP_S} s, then ${args.duration} s measured...\n`);

const timeoutMs = (WARMUP_S + args.duration + 60) * 1000;
const outcome = await Promise.race([
  resultPromise,
  new Promise((ok) => setTimeout(() => ok('timeout'), timeoutMs)),
  new Promise((ok) => {
    const t = setInterval(() => browserGone && (clearInterval(t), ok('browser-exited')), 500);
  }),
]);
clearInterval(sampler);
if (outcome === 'timeout' || outcome === 'browser-exited') {
  cleanup();
  fail(outcome === 'timeout' ? `no result after ${timeoutMs / 1000} s: nothing written` : 'the browser exited before the bench finished: nothing written');
}

await sample(); // one last sample at the end of the window
const result = outcome;
const cpu = os.cpus()[0]?.model?.trim() ?? 'unknown CPU';
const doc = benchDocument({
  stats: result.stats,
  loadMs: Math.round(result.firstFrameEpochMs - t0),
  peakMemMb: peakKb === null ? null : kbToMb(peakKb),
  renderer: result.renderer,
  os: `${os.type()} ${os.release()} ${os.arch()}, ${cpu}, ${Math.round(os.totalmem() / 1073741824)} GB RAM`,
});
writeFileSync(args.out, JSON.stringify(doc, null, 2) + '\n');
cleanup();

const t = thresholds(doc);
const mark = (ok) => (ok ? 'PASS' : 'FAIL');
process.stdout.write(
  `bench: ${doc.frames} frames, avg ${doc.avg_fps} fps, p1 low ${doc.p1_low_fps} fps, p95 ${doc.frame_ms_p95} ms, load ${doc.load_ms} ms, peak mem ${doc.peak_mem_mb ?? 'null'} MB\n` +
    `bench: avg_fps >= 60 ${mark(t.avg_fps)} | p1_low_fps >= 30 ${mark(t.p1_low_fps)} | load_ms <= 10000 ${mark(t.load_ms)}\n` +
    `bench: wrote ${args.out}\n`,
);
process.exit(0);
