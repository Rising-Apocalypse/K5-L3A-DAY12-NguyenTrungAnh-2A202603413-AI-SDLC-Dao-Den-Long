import { FormatError } from './errors';
import { BUTTONS, type Button, type Buttons, type InputState } from './types';

export function defaultInput(): InputState {
  return { move: [0, 0], camYawDeg: 0, jump: false, interact: false, pulse: false, dash: false, pause: false };
}

/**
 * Camera-relative move -> world XZ direction, with the contract formula (theta = yaw in radians):
 *   x' =  x*cos(theta) + z*sin(theta)
 *   z' = -x*sin(theta) + z*cos(theta)
 * A vector longer than 1 is normalised to length 1. We normalise first and rotate second; the rotation keeps
 * length, so this is equivalent to rotate-then-normalise but checks the length on the exact input numbers.
 */
export function worldMove(move: readonly [number, number], yawDeg: number): [number, number] {
  let [x, z] = move;
  const len = Math.hypot(x, z);
  if (len > 1) {
    x /= len;
    z /= len;
  }
  const t = (yawDeg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [x * c + z * s, -x * s + z * c];
}

/** Which buttons went false -> true between two ticks. */
export function risingEdges(prev: Readonly<Partial<Buttons>>, cur: Readonly<Partial<Buttons>>): Buttons {
  const edges = { jump: false, interact: false, pulse: false, dash: false } as Buttons;
  if ('pause' in prev || 'pause' in cur) edges.pause = false;
  for (const b of BUTTONS) {
    if (b in prev || b in cur) {
      edges[b] = !prev[b] && Boolean(cur[b]);
    }
  }
  return edges;
}

/** Input of every tick, resolved from sparse frames. Lookup is O(log frames), so 100k+ ticks are cheap. */
export class InputTimeline {
  private readonly ticks: number[];
  private readonly states: InputState[];

  /** `frames` must already be validated (strictly increasing ticks). */
  constructor(frames: readonly ParsedFrame[]) {
    this.ticks = [];
    this.states = [];
    let current = defaultInput();
    for (const f of frames) {
      current = applyFrame(current, f);
      this.ticks.push(f.tick);
      this.states.push(current);
    }
  }

  /** Input for `tick`: the last frame at or before it, or the defaults before the first frame. */
  at(tick: number): InputState {
    let lo = 0;
    let hi = this.ticks.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.ticks[mid]! <= tick) {
        found = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return found < 0 ? DEFAULT_INPUT : this.states[found]!;
  }
}

const DEFAULT_INPUT = freeze(defaultInput());

interface ParsedFrame {
  tick: number;
  move?: [number, number];
  camYawDeg?: number;
  buttons: Partial<Record<Button, boolean>>;
}

function freeze(input: InputState): InputState {
  Object.freeze(input.move);
  return Object.freeze(input);
}

/** A frame only changes the fields it contains; absent fields keep their previous value. */
function applyFrame(prev: InputState, f: ParsedFrame): InputState {
  return freeze({
    ...prev,
    ...f.buttons,
    move: f.move ?? prev.move,
    camYawDeg: f.camYawDeg ?? prev.camYawDeg,
  });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Validate a parsed inputs JSON document (Test Contract section C). Throws FormatError. */
export function parseInputsFile(json: unknown): InputTimeline {
  if (!isRecord(json)) throw new FormatError('inputs: top level must be an object');
  const rawFrames = json.frames;
  if (!Array.isArray(rawFrames)) throw new FormatError('inputs: "frames" must be an array');

  const frames: ParsedFrame[] = [];
  let lastTick = -1;
  rawFrames.forEach((raw: unknown, i: number) => {
    const where = `inputs: frames[${i}]`;
    if (!isRecord(raw)) throw new FormatError(`${where} must be an object`);

    const tick = raw.tick;
    if (typeof tick !== 'number' || !Number.isInteger(tick) || tick < 0) {
      throw new FormatError(`${where}.tick must be an integer >= 0`);
    }
    if (tick <= lastTick) {
      throw new FormatError(`${where}.tick (${tick}) must be strictly greater than the previous tick (${lastTick})`);
    }
    lastTick = tick;

    const frame: ParsedFrame = { tick, buttons: {} };
    if (raw.move !== undefined) {
      const m = raw.move;
      const ok =
        Array.isArray(m) &&
        m.length === 2 &&
        m.every((c: unknown) => typeof c === 'number' && Number.isFinite(c) && c >= -1 && c <= 1);
      if (!ok) throw new FormatError(`${where}.move must be [x, z] with each component a number in [-1, 1]`);
      frame.move = [m[0] as number, m[1] as number];
    }
    if (raw.cam_yaw_deg !== undefined) {
      if (typeof raw.cam_yaw_deg !== 'number' || !Number.isFinite(raw.cam_yaw_deg)) {
        throw new FormatError(`${where}.cam_yaw_deg must be a finite number`);
      }
      frame.camYawDeg = raw.cam_yaw_deg;
    }
    for (const b of BUTTONS) {
      const v = raw[b];
      if (v === undefined) continue;
      if (typeof v !== 'boolean') throw new FormatError(`${where}.${b} must be a boolean`);
      frame.buttons[b] = v;
    }
    frames.push(frame);
  });

  return new InputTimeline(frames);
}
