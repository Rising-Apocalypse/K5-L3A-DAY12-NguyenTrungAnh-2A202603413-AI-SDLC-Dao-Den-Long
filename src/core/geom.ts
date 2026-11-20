import { COINCIDENT_EPS } from './rules';
import type { Vec3 } from './types';

/** Distance on the horizontal XZ plane (the one every tuning distance uses). */
export function xzDist(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

/** Full 3D distance (only the pulse uses it). */
export function dist3(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Unit XZ vector pointing from `from` to `to`. Coincident points give +X, the same tie-break everywhere. */
export function unitXZ(from: Vec3, to: Vec3): [number, number] {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const d = Math.hypot(dx, dz);
  return d < COINCIDENT_EPS ? [1, 0] : [dx / d, dz / d];
}

/** Move `pos` on XZ towards `target` by at most `step` (never overshoots). Y is untouched. */
export function moveToward(pos: Vec3, target: Vec3, step: number): void {
  const d = xzDist(pos, target);
  if (d < COINCIDENT_EPS) return;
  const k = Math.min(step, d) / d;
  pos[0] += (target[0] - pos[0]) * k;
  pos[2] += (target[2] - pos[2]) * k;
}

/** Natural id order: "L2" < "L10", "S2" < "S10"; anything else falls back to plain string order. */
export function compareIds(a: string, b: string): number {
  const ma = /^(\D*)(\d+)$/.exec(a);
  const mb = /^(\D*)(\d+)$/.exec(b);
  if (ma && mb && ma[1] === mb[1]) return Number(ma[2]) - Number(mb[2]);
  return a < b ? -1 : a > b ? 1 : 0;
}
