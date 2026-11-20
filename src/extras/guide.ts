/**
 * "Đom đóm dẫn đường" (creative extra, WEB ONLY): key H sends a trail of fireflies from Mây towards the nearest lantern
 * that needs help. It only READS GameState (never writes it) and is never imported by the headless CLI, so it cannot
 * change the graded output. Everything here is pure (no DOM, no Three) so it can be unit-tested.
 */
import { xzDist } from '../core/geom';
import type { GameState, LanternState, Vec3 } from '../core/types';

export const GUIDE_DURATION_S = 3;
export const GUIDE_COOLDOWN_S = 10;
export const GUIDE_FIREFLIES = 12;
/** The trail covers at most this much of the way (metres) so it stays dense and readable on the big nights. */
export const GUIDE_MAX_LENGTH = 30;
const FLOW_PER_S = 0.6;
const FADE_S = 0.4;

/**
 * Nearest lantern that needs help: unlit, or lit with fuel below `lowFuelS` seconds. When none does, the nearest lit
 * lantern. Distance is on the XZ plane; ties keep the earlier lantern. Null only when there are no lanterns.
 */
export function helpTarget(state: GameState, lowFuelS: number, tickRate: number): LanternState | null {
  let needy: LanternState | null = null;
  let needyD = Infinity;
  let any: LanternState | null = null;
  let anyD = Infinity;
  for (const l of state.lanterns) {
    const d = xzDist(state.player.pos, l.pos);
    if ((!l.lit || l.fuelUnits < lowFuelS * tickRate) && d < needyD) {
      needy = l;
      needyD = d;
    }
    if (l.lit && d < anyD) {
      any = l;
      anyD = d;
    }
  }
  return needy ?? any;
}

/** Position of firefly `i` of `n` at time `tS`, written to out[offset..offset+2]. */
export function guidePoint(i: number, n: number, tS: number, from: Vec3, to: Vec3, out: Float32Array, offset: number): void {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const d = Math.hypot(dx, dz);
  const ux = d > 1e-6 ? dx / d : 0;
  const uz = d > 1e-6 ? dz / d : 1;
  const raw = tS * FLOW_PER_S + i / n;
  const s = raw - Math.floor(raw); // 0..1 along the trail, flowing from Mây outwards
  const along = s * Math.min(d, GUIDE_MAX_LENGTH);
  const wobble = Math.sin(along * 0.7 + tS * 3 + i) * 0.6;
  const rise = d > 1e-6 ? ((to[1] - from[1]) * along) / d : 0;
  out[offset] = from[0] + ux * along - uz * wobble;
  out[offset + 1] = from[1] + 1.4 + rise + 0.3 * Math.sin(tS * 4 + i * 1.7);
  out[offset + 2] = from[2] + uz * along + ux * wobble;
}

export class FireflyGuide {
  /** x, y, z of every firefly (valid while `active`). */
  readonly positions = new Float32Array(GUIDE_FIREFLIES * 3);
  readonly count = GUIDE_FIREFLIES;
  activeLeftS = 0;
  cooldownLeftS = 0;
  /** 0..1 fade-in / fade-out factor for the sprites. */
  fade = 0;
  targetId: string | null = null;
  private clock = 0;
  private readonly target: Vec3 = [0, 0, 0];

  get active(): boolean {
    return this.activeLeftS > 0;
  }

  /** Remaining cooldown, 0 (ready) .. 1 (just used). */
  get cooldownFraction(): number {
    return Math.min(1, Math.max(0, this.cooldownLeftS / GUIDE_COOLDOWN_S));
  }

  reset(): void {
    this.activeLeftS = 0;
    this.cooldownLeftS = 0;
    this.fade = 0;
    this.targetId = null;
  }

  /** Call once per rendered frame while the game is running (not while paused). `dtS` is real time. */
  update(dtS: number, pressed: boolean, state: GameState, lowFuelS: number, tickRate: number): void {
    this.cooldownLeftS = Math.max(0, this.cooldownLeftS - dtS);
    this.activeLeftS = Math.max(0, this.activeLeftS - dtS);
    if (pressed && this.cooldownLeftS <= 0 && state.state === 'playing') {
      const t = helpTarget(state, lowFuelS, tickRate);
      if (t) {
        this.targetId = t.id;
        this.activeLeftS = GUIDE_DURATION_S;
        this.cooldownLeftS = GUIDE_COOLDOWN_S;
        this.clock = 0;
      }
    }
    if (this.activeLeftS <= 0) {
      this.fade = 0;
      return;
    }
    this.clock += dtS;
    this.fade = Math.min(1, this.clock / FADE_S, this.activeLeftS / FADE_S);
    for (const l of state.lanterns) {
      if (l.id === this.targetId) {
        this.target[0] = l.pos[0];
        this.target[1] = l.pos[1];
        this.target[2] = l.pos[2];
        break;
      }
    }
    for (let i = 0; i < GUIDE_FIREFLIES; i++) guidePoint(i, GUIDE_FIREFLIES, this.clock, state.player.pos, this.target, this.positions, i * 3);
  }
}
