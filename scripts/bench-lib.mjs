// Pure helpers of the bench driver (scripts/bench.mjs). No I/O, so tests/unit/bench-driver.test.ts can cover them.
export const DEFAULT_SEED = 42;
export const DEFAULT_DURATION_S = 30;
export const WARMUP_S = 3;
export const USAGE = 'usage: node scripts/bench.mjs [--seed <int>] [--duration <seconds>] [--out <bench.json>]';

/** `--seed 42 --duration 30 --out bench.json` (all optional). Throws Error with a readable message. */
export function parseBenchArgs(argv) {
  const out = { seed: DEFAULT_SEED, duration: DEFAULT_DURATION_S, out: 'bench.json' };
  const seen = new Set();
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    if (!['--seed', '--duration', '--out'].includes(flag)) throw new Error(`unknown argument "${flag}"\n${USAGE}`);
    if (seen.has(flag)) throw new Error(`${flag} given twice`);
    seen.add(flag);
    const value = argv[i + 1];
    if (value === undefined || value === '') throw new Error(`${flag} needs a value`);
    if (flag === '--seed') {
      if (!/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(`--seed expects an integer, got "${value}"`);
      out.seed = Number(value);
    } else if (flag === '--duration') {
      const n = Number(value);
      if (!/^\d+(\.\d+)?$/.test(value) || !(n > 0)) throw new Error(`--duration expects a positive number of seconds, got "${value}"`);
      out.duration = n;
    } else {
      out.out = value;
    }
  }
  return out;
}

/**
 * Browser executables to try, in order. `$CHROME_PATH` first. On Linux the entries are command names to look up on PATH
 * (see `findBrowser`); on macOS and Windows they are absolute paths.
 */
export function browserCandidates(platform, env = {}) {
  const list = [];
  if (env.CHROME_PATH) list.push(env.CHROME_PATH);
  if (platform === 'darwin') {
    list.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    );
  } else if (platform === 'win32') {
    const roots = [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(Boolean);
    for (const root of roots) list.push(`${root}\\Google\\Chrome\\Application\\chrome.exe`);
    for (const root of roots) list.push(`${root}\\Microsoft\\Edge\\Application\\msedge.exe`);
  } else {
    list.push('google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge');
  }
  return list;
}

/** First candidate that exists. A bare name (no slash) is searched in the PATH folders. `exists(path) -> boolean`. */
export function findBrowser(candidates, exists, pathDirs = [], sep = '/') {
  for (const c of candidates) {
    if (c.includes('/') || c.includes('\\')) {
      if (exists(c)) return c;
    } else {
      for (const dir of pathDirs) {
        const full = dir.endsWith(sep) ? dir + c : dir + sep + c;
        if (exists(full)) return full;
      }
    }
  }
  return null;
}

/** Chrome flags for the bench window (headed, 1280x720, not fullscreen, vsync and throttling requested off). */
export function browserArgs(userDataDir, url) {
  return [
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,720',
    '--window-position=0,0',
    '--disable-gpu-vsync',
    '--disable-frame-rate-limit',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    // Without this, Chrome stops drawing a window covered by other windows and the bench never finishes.
    '--disable-backgrounding-occluded-windows',
    `--app=${url}`,
  ];
}

/** Sum of the RSS (KB) of `rootPid` and all its descendants in the output of `ps -A -o pid=,ppid=,rss=`. */
export function sumTreeRssKb(psOutput, rootPid) {
  const rows = [];
  for (const line of psOutput.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s*$/.exec(line);
    if (m) rows.push({ pid: Number(m[1]), ppid: Number(m[2]), rss: Number(m[3]) });
  }
  const inTree = new Set([rootPid]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const r of rows) {
      if (!inTree.has(r.pid) && inTree.has(r.ppid)) {
        inTree.add(r.pid);
        grew = true;
      }
    }
  }
  return rows.filter((r) => inTree.has(r.pid)).reduce((sum, r) => sum + r.rss, 0);
}

/** KB -> MB with 1 decimal. */
export const kbToMb = (kb) => Math.round((kb / 1024) * 10) / 10;

/** The bench.json document, with exactly the Ticket-04 keys in this order. */
export function benchDocument({ stats, loadMs, peakMemMb, renderer, os }) {
  return {
    contract_version: '1.3',
    avg_fps: stats.avg_fps,
    p1_low_fps: stats.p1_low_fps,
    frame_ms_p95: stats.frame_ms_p95,
    frames: stats.frames,
    load_ms: loadMs,
    peak_mem_mb: peakMemMb,
    vsync_off: true,
    renderer,
    os,
  };
}

/** Thresholds of Ticket-04: avg >= 60, p1 low >= 30, load <= 10000 ms. */
export function thresholds(doc) {
  return {
    avg_fps: doc.avg_fps >= 60,
    p1_low_fps: doc.p1_low_fps >= 30,
    load_ms: doc.load_ms <= 10000,
  };
}

export const benchPageUrl = (port, seed, duration) => `http://127.0.0.1:${port}/?${new URLSearchParams({ bench: '1', seed: String(seed), duration: String(duration) })}`;
