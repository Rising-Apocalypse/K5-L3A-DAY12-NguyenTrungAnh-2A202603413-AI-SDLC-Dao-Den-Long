import { EXTRAS } from '../extras';
import { defaultInput } from '../core/input';
import { createGame, TICK_RATE } from '../core/sim';
import { TUNING } from '../core/tuning';
import type { InputState } from '../core/types';
import { createHud } from './hud';
import { createRenderer } from './render';

const DT = 1 / TICK_RATE;
const MAX_STEPS_PER_FRAME = 5;
const CAMERA_KEY_DEG_PER_S = 90;
const CAMERA_DRAG_DEG_PER_PX = 0.3;

function seedFromUrl(): number {
  const raw = new URLSearchParams(window.location.search).get('seed');
  return raw !== null && /^-?\d+$/.test(raw) ? Number(raw) : 1;
}

const seed = seedFromUrl();
const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = createRenderer(canvas);
const hud = createHud(TUNING);
let game = createGame({ seed, extras: EXTRAS });

// --- keyboard / mouse -------------------------------------------------------------------------------------
const held = new Set<string>();
const latched = new Set<string>(); // pressed since the last simulated step, so a quick tap is never lost
let camYawDeg = 0;

const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyE', 'KeyF', 'KeyR', 'BracketLeft', 'BracketRight']);

window.addEventListener('keydown', (e) => {
  if (!GAME_KEYS.has(e.code)) return;
  e.preventDefault();
  if (e.repeat) return;
  held.add(e.code);
  latched.add(e.code);
  if (e.code === 'KeyR') restart();
});
window.addEventListener('keyup', (e) => held.delete(e.code));
window.addEventListener('blur', () => held.clear());

let dragging = false;
canvas.addEventListener('pointerdown', (e) => {
  dragging = true;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointerup', () => (dragging = false));
canvas.addEventListener('pointermove', (e) => {
  // Dragging right turns the camera to the right (a larger yaw turns the view to the left).
  if (dragging) camYawDeg -= e.movementX * CAMERA_DRAG_DEG_PER_PX;
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
  };
}

function restart(): void {
  game = createGame({ seed, extras: EXTRAS });
  renderer.reset();
  hud.reset();
  accumulator = 0;
}

// --- fixed-timestep loop (60 Hz, at most 5 steps per frame) -----------------------------------------------
let accumulator = 0;
let last = performance.now();

function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;

  if (held.has('BracketLeft')) camYawDeg += CAMERA_KEY_DEG_PER_S * dt;
  if (held.has('BracketRight')) camYawDeg -= CAMERA_KEY_DEG_PER_S * dt;

  accumulator += dt;
  let steps = 0;
  while (accumulator >= DT && steps < MAX_STEPS_PER_FRAME) {
    const events = game.step(buildInput());
    if (events.length > 0) {
      hud.onEvents(events);
      renderer.onEvents(events, game.state, now / 1000);
    }
    latched.clear();
    accumulator -= DT;
    steps++;
  }
  if (steps === MAX_STEPS_PER_FRAME) accumulator = 0; // too far behind: drop the backlog

  renderer.render(game.state, camYawDeg, now / 1000);
  hud.update(game.state);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
