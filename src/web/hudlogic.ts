// Pure helpers for the HUD (no DOM, no Three): clock text, prompt target, off-screen arrow, cooldown fill, FPS meter.
import { xzDist } from '../core/geom';
import type { Tuning } from '../core/tuning';
import type { GameState, LanternState, PlayerState } from '../core/types';

/** `mm:ss`, rounded UP to whole seconds (0:00 floor). */
export function formatClock(timeLeftS: number): string {
  const secs = Math.max(0, Math.ceil(timeLeftS));
  return `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
}

/** The clock turns to the danger colour and blinks at 2 Hz from 30 s on. */
export const isClockDanger = (timeLeftS: number): boolean => timeLeftS <= 30;
/** 2 Hz blink: visible during the first half of each 0.5 s. */
export const blinkOn = (timeS: number, hz = 2): boolean => Math.floor(timeS * hz * 2) % 2 === 0;

export const lanternsNeeded = (tuning: Tuning, total: number): number => Math.ceil(tuning.win_ratio * total);

export const carryCapacity = (p: Pick<PlayerState, 'successfulLights'>, t: Tuning): number =>
  Math.min(t.capacity_max, t.carry_capacity + 2 * p.successfulLights);

/** Fraction of a cooldown still to go, 0..1. */
export function cooldownFraction(ticksLeft: number, totalS: number, tickRate: number): number {
  const total = totalS * tickRate;
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, ticksLeft / total));
}

/** Nearest lantern Mây can interact with (within interact_radius, XZ) that still takes light: unlit, or lit below full. */
export function promptLantern(state: GameState, t: Tuning, tickRate: number): LanternState | null {
  let best: LanternState | null = null;
  let bestD = Infinity;
  for (const l of state.lanterns) {
    const full = l.lit && l.fuelUnits >= t.fuel_max * tickRate;
    const d = xzDist(state.player.pos, l.pos);
    if (!full && d <= t.interact_radius && d < bestD) {
      best = l;
      bestD = d;
    }
  }
  return best;
}

/** Nearest unlit lantern (XZ distance), or null when every lantern is lit. Ties keep the earlier lantern. */
export function nearestUnlit(state: GameState): LanternState | null {
  let best: LanternState | null = null;
  let bestD = Infinity;
  for (const l of state.lanterns) {
    if (l.lit) continue;
    const d = xzDist(state.player.pos, l.pos);
    if (d < bestD) {
      best = l;
      bestD = d;
    }
  }
  return best;
}

export interface EdgeArrow {
  visible: boolean;
  /** position in CSS pixels of the arrow centre */
  x: number;
  y: number;
  /** rotation in degrees, 0 = pointing up, clockwise */
  rotDeg: number;
}

/**
 * Arrow at the screen edge for a target given in NDC (x, y in -1..1, y up). `behind` = the target is behind the
 * camera (NDC is then mirrored). Not visible while the target is inside the view.
 */
export function edgeArrow(ndcX: number, ndcY: number, behind: boolean, width: number, height: number, margin: number, out: EdgeArrow): EdgeArrow {
  const nx = behind ? -ndcX : ndcX;
  let ny = behind ? -ndcY : ndcY;
  const inside = !behind && Math.abs(nx) <= 1 && Math.abs(ny) <= 1;
  out.visible = !inside;
  if (inside) return out;
  if (nx === 0 && ny === 0) ny = -1; // exactly behind the camera: point down
  // Direction in pixels (y up), scaled until it touches the inset screen rectangle.
  const dx = nx * (width / 2);
  const dy = ny * (height / 2);
  const hx = Math.max(1, width / 2 - margin);
  const hy = Math.max(1, height / 2 - margin);
  const s = Math.min(hx / Math.max(Math.abs(dx), 1e-6), hy / Math.max(Math.abs(dy), 1e-6));
  out.x = width / 2 + dx * s;
  out.y = height / 2 - dy * s;
  out.rotDeg = (Math.atan2(dx, dy) * 180) / Math.PI;
  return out;
}

/** Frames-per-second averaged over the last ~2 s, using 8 completed buckets of 0.25 s (plus the one being filled). No allocation per frame. */
export class FpsMeter {
  private readonly counts = new Float64Array(9);
  private bucket = 0;
  private bucketStart = -1;
  private filled = 0;

  frame(nowS: number): void {
    if (this.bucketStart < 0) this.bucketStart = nowS;
    while (nowS - this.bucketStart >= 0.25) {
      this.bucketStart += 0.25;
      this.bucket = (this.bucket + 1) % 9;
      this.counts[this.bucket] = 0;
      this.filled = Math.min(8, this.filled + 1);
    }
    this.counts[this.bucket] = (this.counts[this.bucket] ?? 0) + 1;
  }

  /** Average over the completed buckets (0 until the first 0.25 s has passed). */
  fps(): number {
    if (this.filled === 0) return 0;
    let sum = 0;
    for (let i = 1; i <= this.filled; i++) sum += this.counts[(this.bucket - i + 18) % 9] ?? 0;
    return sum / (this.filled * 0.25);
  }
}
