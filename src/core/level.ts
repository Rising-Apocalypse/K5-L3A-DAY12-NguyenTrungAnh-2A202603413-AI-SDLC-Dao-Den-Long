import { Rng } from './rng';
import type { LanternState, MoteState, Vec3 } from './types';

// Night 1 "Đảo Bến": a fixed standard map. These numbers are level geometry / physics constants, NOT contract
// tuning keys (see docs/notes/assumptions.md).
//
// Angle convention: angles are measured from +X on the XZ plane, so the point at angle a and radius r is
// [r*cos(a), 0, r*sin(a)] (90 degrees -> +Z).

export const ISLAND_RADIUS = 40;
export const JUMP_SPEED = 7.0;
export const GRAVITY = 20;
/** Height of a shade's centre above the ground (used when shades are spawned). */
export const SHADE_HOVER_Y = 1.0;
/** Player stands at the island centre, facing +Z. */
export const PLAYER_START: Vec3 = [0, 0, 0];
export const PLAYER_START_FACING: [number, number] = [0, 1];

/** Number of motes on the island at the start (chosen from MOTE_SPAWN_POINTS). */
export const DEFAULT_MOTE_COUNT = 20;

const LANTERN_POSITIONS: readonly Vec3[] = [
  [0, 0, 25],
  [23.8, 0, 7.7],
  [14.7, 0, -20.2],
  [-14.7, 0, -20.2],
  [-23.8, 0, 7.7],
];

function ring(radius: number, count: number, startDeg: number, stepDeg: number): Vec3[] {
  const points: Vec3[] = [];
  for (let i = 0; i < count; i++) {
    const a = ((startDeg + i * stepDeg) * Math.PI) / 180;
    points.push([radius * Math.cos(a), 0, radius * Math.sin(a)]);
  }
  return points;
}

/** 24 mote spawn points: 8 on r=12 at 0,45,..,315 degrees and 16 on r=33 at 0,22.5,..,337.5 degrees. */
export const MOTE_SPAWN_POINTS: readonly Vec3[] = [...ring(12, 8, 0, 45), ...ring(33, 16, 0, 22.5)];

/** 12 shade spawn points (ground positions): r=37 at 15,45,..,345 degrees. */
export const SHADE_SPAWN_POINTS: readonly Vec3[] = ring(37, 12, 15, 30);

/** Great Lanterns L1..L5 at their fixed positions, all unlit and empty. */
export function buildLanterns(): LanternState[] {
  return LANTERN_POSITIONS.map((pos, i) => ({ id: `L${i + 1}`, pos: [pos[0], pos[1], pos[2]], lit: false, deposited: 0 }));
}

/**
 * 20 motes on 20 distinct spawn points: a Fisher-Yates shuffle of the 24 points driven by the "motes" stream,
 * taking the first 20 in shuffled order (ids M1..M20, y = 0).
 */
export function buildMotes(seed: number): MoteState[] {
  const rng = new Rng(seed, 'motes');
  const points = MOTE_SPAWN_POINTS.map((p): Vec3 => [p[0], p[1], p[2]]);
  for (let i = points.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [points[i], points[j]] = [points[j]!, points[i]!];
  }
  return points.slice(0, DEFAULT_MOTE_COUNT).map((pos, i) => ({ id: `M${i + 1}`, pos, active: true }));
}
