import { describe, expect, it } from 'vitest';
import { benchDocument, benchPageUrl, browserArgs, browserCandidates, findBrowser, kbToMb, parseBenchArgs, sumTreeRssKb, thresholds } from '../../scripts/bench-lib.mjs';

describe('bench driver: arguments', () => {
  it('defaults to seed 42, 30 s, bench.json', () => {
    expect(parseBenchArgs([])).toEqual({ seed: 42, duration: 30, out: 'bench.json' });
  });
  it('reads the three flags in any order', () => {
    expect(parseBenchArgs(['--out', 'x.json', '--duration', '5', '--seed', '-3'])).toEqual({ seed: -3, duration: 5, out: 'x.json' });
  });
  it('rejects bad usage', () => {
    for (const a of [['--seed', 'x'], ['--duration', '0'], ['--duration', '-1'], ['--duration', 'abc'], ['--bogus', '1'], ['--seed'], ['--seed', '1', '--seed', '2']]) {
      expect(() => parseBenchArgs(a), a.join(' ')).toThrow();
    }
  });
});

describe('bench driver: browser lookup', () => {
  it('CHROME_PATH comes first, then the platform list', () => {
    expect(browserCandidates('darwin', { CHROME_PATH: '/x/chrome' })).toEqual([
      '/x/chrome',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ]);
  });
  it('linux lists command names, in the required order', () => {
    expect(browserCandidates('linux', {})).toEqual(['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']);
  });
  it('windows: Chrome then Edge under Program Files, Program Files (x86) and LocalAppData', () => {
    const c = browserCandidates('win32', { PROGRAMFILES: 'C:\\PF', 'PROGRAMFILES(X86)': 'C:\\PF86', LOCALAPPDATA: 'C:\\L' });
    expect(c).toEqual([
      'C:\\PF\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\PF86\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\L\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\PF\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\PF86\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\L\\Microsoft\\Edge\\Application\\msedge.exe',
    ]);
  });
  it('findBrowser: absolute paths are checked directly, bare names are searched on PATH, none -> null', () => {
    const existing = new Set(['/usr/bin/chromium', '/Applications/Chromium.app/Contents/MacOS/Chromium']);
    const exists = (p: string) => existing.has(p);
    expect(findBrowser(['google-chrome', 'chromium'], exists, ['/bin', '/usr/bin'])).toBe('/usr/bin/chromium');
    expect(findBrowser(browserCandidates('darwin', {}), exists)).toBe('/Applications/Chromium.app/Contents/MacOS/Chromium');
    expect(findBrowser(['google-chrome'], exists, ['/usr/bin'])).toBeNull();
  });
  it('browser flags: fresh profile, 1280x720 at 0,0, vsync and throttling off, --app url, no fullscreen/headless', () => {
    const a = browserArgs('/tmp/p', 'http://127.0.0.1:1/?bench=1');
    expect(a).toEqual([
      '--user-data-dir=/tmp/p',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1280,720',
      '--window-position=0,0',
      '--disable-gpu-vsync',
      '--disable-frame-rate-limit',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--app=http://127.0.0.1:1/?bench=1',
    ]);
    expect(a.join(' ')).not.toMatch(/headless|fullscreen|kiosk/);
  });
  it('page url', () => {
    expect(benchPageUrl(5000, 42, 30)).toBe('http://127.0.0.1:5000/?bench=1&seed=42&duration=30');
  });
});

describe('bench driver: memory of the process tree', () => {
  // pid ppid rss(KB). Tree of 100: 100 (1000) -> 101 (2000) -> 103 (4000); 100 -> 102 (3000). Others are not in it.
  const ps = [
    '    1     0  500',
    '  100     1 1000',
    '  101   100 2000',
    '  102   100 3000',
    '  103   101 4000',
    '  200     1 9000',
    '  201   200 9000',
    'garbage line',
    '',
  ].join('\n');
  it('sums the root and all descendants (1000 + 2000 + 3000 + 4000 = 10000 KB)', () => {
    expect(sumTreeRssKb(ps, 100)).toBe(10000);
  });
  it('a leaf is just itself; an unknown pid is 0', () => {
    expect(sumTreeRssKb(ps, 103)).toBe(4000);
    expect(sumTreeRssKb(ps, 999)).toBe(0);
  });
  it('KB -> MB with 1 decimal: 10000 KB / 1024 = 9.765... -> 9.8', () => {
    expect(kbToMb(10000)).toBe(9.8);
  });
});

describe('bench driver: bench.json', () => {
  const stats = { avg_fps: 87.3, p1_low_fps: 52.1, frame_ms_p95: 14.2, frames: 2619 };
  it('has exactly the Ticket-04 keys, in order', () => {
    const doc = benchDocument({ stats, loadMs: 2400, peakMemMb: null, renderer: 'GPU | three.js r187', os: 'Darwin 1 arm64' });
    expect(Object.keys(doc)).toEqual(['contract_version', 'avg_fps', 'p1_low_fps', 'frame_ms_p95', 'frames', 'load_ms', 'peak_mem_mb', 'vsync_off', 'renderer', 'os']);
    expect(doc).toMatchObject({ contract_version: '1.3', load_ms: 2400, peak_mem_mb: null, vsync_off: true });
  });
  it('thresholds: avg >= 60, p1 >= 30, load <= 10000 (boundaries inclusive)', () => {
    expect(thresholds({ avg_fps: 60, p1_low_fps: 30, load_ms: 10000 })).toEqual({ avg_fps: true, p1_low_fps: true, load_ms: true });
    expect(thresholds({ avg_fps: 59.9, p1_low_fps: 29.9, load_ms: 10001 })).toEqual({ avg_fps: false, p1_low_fps: false, load_ms: false });
  });
});
