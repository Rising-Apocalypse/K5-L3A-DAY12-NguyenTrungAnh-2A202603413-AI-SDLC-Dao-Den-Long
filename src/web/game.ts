import { EXTRAS } from '../extras';
import { FireflyGuide } from '../extras/guide';
import { defaultInput } from '../core/input';
import { getLevel } from '../core/levels';
import { createGame, TICK_RATE, type Game } from '../core/sim';
import { TUNING } from '../core/tuning';
import type { GameEvent, InputState } from '../core/types';
import { createAudio } from './audio';
import { toggleColorBlind } from './colorblind';
import { initialFlow, reduce, totalScore, type FlowAction, type FlowState, type Night } from './flow';
import { createHud } from './hud';
import { FpsMeter } from './hudlogic';
import { getSettings, onSettingsChange } from './prefs';
import { createRenderer } from './render';
import { createScreens } from './screens';
import { introInfo } from './story';

const DT = 1 / TICK_RATE;
const MAX_STEPS_PER_FRAME = 5;
const CAMERA_KEY_DEG_PER_S = 90;
/** Slow camera orbit behind the menu / intro / result screens. */
const IDLE_ORBIT_DEG_PER_S = 8;

const REASON_TEXT = {
  dawn_survived: ['Bình minh! Đảo đã sáng lại', 'Đủ đèn lồng còn sáng khi trời rạng.'],
  dawn: ['Trời sáng mất rồi...', 'Hết đêm mà chưa đủ đèn còn sáng.'],
  no_flames: ['Bóng Mực đã nuốt ánh sáng...', 'Mây đã hết ngọn lửa.'],
} as const;

function seedFromUrl(): number {
  const raw = new URLSearchParams(window.location.search).get('seed');
  return raw !== null && /^-?\d+$/.test(raw) ? Number(raw) : 1;
}

const params = new URLSearchParams(window.location.search);
const seed = seedFromUrl();
const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = createRenderer(canvas);
const hud = createHud(TUNING);
const audio = createAudio();
const guide = new FireflyGuide();
const fpsEl = document.getElementById('fps') as HTMLElement;
const fpsMeter = params.get('fps') === '1' ? new FpsMeter() : null;
if (fpsMeter) fpsEl.style.display = 'block';
let fpsShownAt = 0;

audio.setVolume(getSettings().volume);
onSettingsChange((s) => {
  audio.setVolume(s.volume);
  hud.setColorBlind();
});

// --- state ----------------------------------------------------------------------------------------------------
let flow: FlowState = initialFlow();
let game: Game = createGame({ seed, night: 1, extras: EXTRAS });
let reason: keyof typeof REASON_TEXT | null = null;
let pauseShown = false;
let guideRequest = false;
let accumulator = 0;
let camYawDeg = 0;

const held = new Set<string>();
const latched = new Set<string>(); // pressed since the last simulated step, so a quick tap is never lost

/** New game for a night: fresh simulation, scene, HUD and audio trackers. */
function startNight(night: Night): void {
  game = createGame({ seed, night, extras: EXTRAS });
  renderer.setNight(night);
  hud.reset();
  hud.setNight(night, getLevel(night).islandName);
  audio.resetTracking(game.state);
  guide.reset();
  reason = null;
  accumulator = 0;
  camYawDeg = 0;
  held.clear();
  latched.clear();
  guideRequest = false;
}

function dispatch(action: FlowAction): void {
  const prev = flow;
  flow = reduce(flow, action);
  if (flow === prev) return;
  pauseShown = false;
  const newGame = flow.epoch !== prev.epoch;
  switch (flow.screen) {
    case 'menu':
      if (newGame) startNight(1);
      hud.show(false);
      screens.showMenu();
      break;
    case 'intro':
      if (newGame) startNight(flow.night);
      hud.show(false);
      screens.showIntro(introInfo(flow.night, TUNING));
      break;
    case 'playing':
      if (newGame) startNight(flow.night);
      camYawDeg = 0;
      hud.show(true);
      screens.hide();
      break;
    case 'result': {
      const [title, sub] = REASON_TEXT[reason ?? (flow.won ? 'dawn_survived' : 'no_flames')];
      screens.showResult({ night: flow.night, won: flow.won, score: flow.lastScore, title, sub, hasNext: flow.night < 3 });
      break;
    }
    case 'dawn':
      screens.showDawn({
        total: totalScore(flow),
        wins: ([1, 2, 3] as const).filter((n) => flow.wins[n] !== undefined).map((n) => ({ night: n, score: flow.wins[n] ?? 0 })),
      });
      break;
  }
}

const screens = createScreens({
  onStart: () => dispatch({ type: 'start' }),
  onSelect: (night) => dispatch({ type: 'select', night }),
  onBegin: () => dispatch({ type: 'begin' }),
  onNext: () => dispatch({ type: 'next' }),
  onRetry: () => dispatch({ type: 'retry' }),
  onMenu: () => dispatch({ type: 'menu' }),
  onResume: () => {
    // The core pauses on a rising edge of `pause`: inject it once.
    latched.add('KeyP');
  },
});

// --- keyboard / mouse -------------------------------------------------------------------------------------
const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyE', 'KeyF', 'KeyR',
  'BracketLeft', 'BracketRight', 'ShiftLeft', 'ShiftRight', 'KeyP', 'Escape', 'KeyC', 'KeyH',
]);

window.addEventListener('keydown', (e) => {
  audio.unlock();
  if (e.code === 'Escape' && screens.settingsOpen()) {
    e.preventDefault();
    screens.closeSettings();
    return;
  }
  if (flow.screen === 'intro') {
    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      dispatch({ type: 'begin' });
    }
    return;
  }
  if (flow.screen === 'result') {
    if (e.code === 'KeyR') dispatch({ type: 'retry' });
    return;
  }
  if (flow.screen !== 'playing' || screens.settingsOpen()) return;
  if (!GAME_KEYS.has(e.code)) return;
  e.preventDefault();
  if (e.repeat) return;
  // While paused only P / Esc count (and the buttons of the pause menu).
  if (game.state.paused && e.code !== 'KeyP' && e.code !== 'Escape') return;
  held.add(e.code);
  latched.add(e.code);
  if (e.code === 'KeyR') dispatch({ type: 'retry' });
  if (e.code === 'KeyC') {
    toggleColorBlind();
    hud.setColorBlind();
  }
  if (e.code === 'KeyH') guideRequest = true;
});
window.addEventListener('keyup', (e) => held.delete(e.code));
window.addEventListener('blur', () => held.clear());
window.addEventListener('pointerdown', () => audio.unlock());

let dragging = false;
canvas.addEventListener('pointerdown', (e) => {
  dragging = true;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointerup', () => (dragging = false));
canvas.addEventListener('pointermove', (e) => {
  // Dragging right turns the camera to the right (a larger yaw turns the view to the left).
  if (dragging && flow.screen === 'playing') camYawDeg -= e.movementX * getSettings().sensitivity;
});

const down = (...codes: string[]) => codes.some((c) => held.has(c) || latched.has(c));

/** Same convention as the contract: yaw 0 -> forward input z = 1 moves along +Z. */
function buildInput(): InputState {
  const forward = (down('KeyW', 'ArrowUp') ? 1 : 0) - (down('KeyS', 'ArrowDown') ? 1 : 0);
  const right = (down('KeyD', 'ArrowRight') ? 1 : 0) - (down('KeyA', 'ArrowLeft') ? 1 : 0);
  return {
    ...defaultInput(),
    // In the contract's right-handed, Y-up world the +x axis points to the LEFT of a camera looking along +Z,
    // so "move right on screen" is x = -1.
    move: [-right, forward],
    camYawDeg,
    jump: down('Space'),
    interact: down('KeyE'),
    pulse: down('KeyF'),
    dash: down('ShiftLeft', 'ShiftRight'),
    pause: down('KeyP', 'Escape'),
  };
}

// --- fixed-timestep loop (60 Hz, at most 5 steps per frame) -----------------------------------------------
let last = performance.now();

function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;
  const timeS = now / 1000;

  if (flow.screen === 'playing') {
    if (held.has('BracketLeft') && !game.state.paused) camYawDeg += CAMERA_KEY_DEG_PER_S * dt;
    if (held.has('BracketRight') && !game.state.paused) camYawDeg -= CAMERA_KEY_DEG_PER_S * dt;

    accumulator += dt;
    let steps = 0;
    while (accumulator >= DT && steps < MAX_STEPS_PER_FRAME && flow.screen === 'playing') {
      const events: GameEvent[] = game.step(buildInput());
      if (events.length > 0) {
        hud.onEvents(events);
        renderer.onEvents(events, game.state, timeS);
        audio.onEvents(events);
        for (const ev of events) if (ev.name === 'game_over') reason = ev.data.reason;
      }
      latched.clear();
      accumulator -= DT;
      steps++;
      if (game.state.state !== 'playing') {
        dispatch({ type: 'finish', won: game.state.state === 'won', score: game.state.score });
        break;
      }
    }
    if (steps === MAX_STEPS_PER_FRAME) accumulator = 0; // too far behind: drop the backlog
  } else {
    camYawDeg += IDLE_ORBIT_DEG_PER_S * dt;
  }

  const running = flow.screen === 'playing' && !game.state.paused;
  guide.update(running ? dt : 0, running && guideRequest, game.state, TUNING.low_fuel_threshold, TICK_RATE);
  guideRequest = false;
  renderer.setGuide(guide);

  // Pause menu: shown while the core is paused.
  const wantPause = flow.screen === 'playing' && game.state.paused;
  if (wantPause && !pauseShown) {
    pauseShown = true;
    screens.showPause();
  } else if (!wantPause && pauseShown) {
    pauseShown = false;
    if (flow.screen === 'playing') screens.hide();
  }
  audio.setDucked(wantPause);
  audio.update(game.state, running);

  renderer.render(game.state, camYawDeg, timeS);
  hud.update(game.state, { timeS, guideCooldown: guide.cooldownFraction, project: renderer.project });

  if (fpsMeter) {
    fpsMeter.frame(timeS);
    if (timeS - fpsShownAt >= 0.5) {
      fpsShownAt = timeS;
      fpsEl.textContent = `${fpsMeter.fps().toFixed(0)} FPS`;
    }
  }
  requestAnimationFrame(frame);
}

renderer.setNight(1);
hud.setNight(1, getLevel(1).islandName);
screens.showMenu();
requestAnimationFrame(frame);
