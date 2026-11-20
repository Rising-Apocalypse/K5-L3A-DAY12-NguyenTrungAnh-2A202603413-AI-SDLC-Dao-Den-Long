// Benchmark page mode: `?bench=1&seed=42&duration=30` (opened by scripts/bench.mjs). Menus, flow, extras and audio are
// skipped; the normal renderer and HUD show the bench scene while a fixed orbit camera flies around the island.
import { defaultInput } from '../core/input';
import { getLevel } from '../core/levels';
import { createGame, TICK_RATE } from '../core/sim';
import { TUNING } from '../core/tuning';
import { benchStats } from './benchstats';
import { createHud } from './hud';
import { createRenderer } from './render';

const WARMUP_S = 3;
const ORBIT_RADIUS = 30;
const ORBIT_HEIGHT = 15;
const ORBIT_PERIOD_S = 15;
const DT = 1 / TICK_RATE;
const MAX_STEPS_PER_FRAME = 5;

function numberParam(params: URLSearchParams, key: string, fallback: number, integer: boolean): number {
  const raw = params.get(key);
  if (raw === null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && (!integer || Number.isInteger(n)) ? n : fallback;
}

export function runBench(): void {
  const params = new URLSearchParams(window.location.search);
  const rawSeed = params.get('seed');
  const seed = rawSeed !== null && /^-?\d+$/.test(rawSeed) ? Number(rawSeed) : 42;
  const durationS = numberParam(params, 'duration', 30, false);

  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const renderer = createRenderer(canvas);
  const hud = createHud(TUNING);
  const game = createGame({ seed, night: 1, bench: true });
  renderer.setNight(1);
  hud.reset();
  hud.setNight(1, getLevel(1).islandName);
  hud.show(true);

  const dts: number[] = [];
  let firstTs: number | null = null;
  let firstEpochMs = 0;
  let prevTs = 0;
  let accumulator = 0;
  let done = false;
  let measureAnnounced = false;

  function finish(): void {
    done = true;
    const body = {
      stats: benchStats(dts),
      firstFrameEpochMs: firstEpochMs,
      renderer: renderer.describe(),
      userAgent: navigator.userAgent,
    };
    void fetch('/bench-result', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .catch(() => undefined)
      .finally(() => {
        document.title = 'Bench xong';
        const note = document.createElement('div');
        note.textContent = 'Bench xong';
        note.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);padding:12px 24px;background:#0e1430;color:#f5f1e6;font:24px system-ui;border-radius:10px;';
        document.body.appendChild(note);
      });
  }

  function frame(now: number): void {
    if (done) return;
    if (firstTs === null) {
      firstTs = now;
      firstEpochMs = Date.now();
      prevTs = now;
    }
    const dtMs = now - prevTs;
    prevTs = now;
    const t = (now - firstTs) / 1000;

    // Fixed 60 Hz simulation from real time, default input (Mây stands still).
    accumulator += Math.min(dtMs / 1000, 0.25);
    let steps = 0;
    while (accumulator >= DT && steps < MAX_STEPS_PER_FRAME) {
      game.step(defaultInput());
      accumulator -= DT;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) accumulator = 0;

    // Camera: starts at (30, 15, 0) and turns towards +Z (angle convention of the map), one lap per 15 s.
    const theta = (2 * Math.PI * t) / ORBIT_PERIOD_S;
    renderer.setCamera([ORBIT_RADIUS * Math.cos(theta), ORBIT_HEIGHT, ORBIT_RADIUS * Math.sin(theta)], [0, 0, 0]);
    renderer.render(game.state, 0, now / 1000);
    hud.update(game.state, { timeS: now / 1000, guideCooldown: 0, project: renderer.project });

    // The first WARMUP_S seconds are not measured; then exactly durationS seconds of frames.
    if (t > WARMUP_S && t <= WARMUP_S + durationS) {
      dts.push(dtMs);
      if (!measureAnnounced) {
        // Tells the driver the measured window has begun (it samples the browser's memory from now on).
        measureAnnounced = true;
        void fetch('/bench-measure-start', { method: 'POST', body: '{}' }).catch(() => undefined);
      }
    }
    if (t >= WARMUP_S + durationS) {
      finish();
      return;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
