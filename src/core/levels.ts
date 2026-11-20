import { LANTERN_POSITIONS, MOTE_SPAWN_POINTS, PLAYER_START, PLAYER_START_FACING, ISLAND_RADIUS, SHADE_SPAWN_POINTS, ring } from './level';
import { SHADE_MAX, SHADE_MAX_N2, SHADE_MAX_N3, SHADE_SPAWN_EVERY, SHADE_SPAWN_EVERY_N2, SHADE_SPAWN_EVERY_N3, SHADE_SPEED_NIGHT3, TOWER_RADIUS, TOWER_TOP_Y } from './rules';
import type { Tuning } from './tuning';
import type { Vec3 } from './types';

/** A jump pad: stepping on it (feet at the pad's height) launches Mây with vertical speed `vy` and horizontal `vxz`. */
export interface JumpPad {
  center: Vec3;
  vy: number;
  vxz: [number, number];
}

/**
 * One night's map and rules switches. Pure data + pure functions. The three flags `shadesAvoidVoid`, `terrainY` and
 * `walls` are what keeps Night 1 byte-identical: they are all false there.
 */
export interface Level {
  night: 1 | 2 | 3;
  islandName: string;
  playerStart: Vec3;
  playerFacing: [number, number];
  lanternPositions: readonly Vec3[];
  moteSpawnPoints: readonly Vec3[];
  shadeSpawnPoints: readonly Vec3[];
  charmPositions: readonly Vec3[];
  shadeSpawnEvery: number;
  shadeMax: number;
  shadeSpeed: (t: Tuning) => number;
  jumpPads: readonly JumpPad[];
  drifters: boolean;
  wind: boolean;
  shadesAvoidVoid: boolean;
  terrainY: boolean;
  walls: boolean;
  /** Top surface height at (x, z); null = void (Mây falls). */
  groundAt(x: number, z: number): number | null;
  /** Bell tower: blocks Mây (and shades) inside TOWER_RADIUS while below TOWER_TOP_Y. */
  blocked(x: number, z: number, y: number): boolean;
}

const copy = (v: Vec3): Vec3 => [v[0], v[1], v[2]];

// --- Night 1: Đảo Bến (the constants of level.ts, unchanged) ---------------------------------------------------
const NIGHT1: Level = {
  night: 1,
  islandName: 'Đảo Bến',
  playerStart: PLAYER_START,
  playerFacing: PLAYER_START_FACING,
  lanternPositions: LANTERN_POSITIONS,
  moteSpawnPoints: MOTE_SPAWN_POINTS,
  shadeSpawnPoints: SHADE_SPAWN_POINTS,
  charmPositions: [],
  shadeSpawnEvery: SHADE_SPAWN_EVERY,
  shadeMax: SHADE_MAX,
  shadeSpeed: (t) => t.shade_speed,
  jumpPads: [],
  drifters: false,
  wind: false,
  shadesAvoidVoid: false,
  terrainY: false,
  walls: false,
  groundAt: (x, z) => (Math.hypot(x, z) <= ISLAND_RADIUS ? 0 : null),
  blocked: () => false,
};

// --- Night 2: Đảo Cau (two islands joined by a bridge, two jump pads) -------------------------------------------
const N2_ISLAND_R = 28;
const N2_CENTRES: Vec3[] = [
  [0, 0, 0],
  [70, 0, 0],
];

/** Pad launch: 24 m/s horizontally towards the other island's centre, 14 m/s up. */
function n2Pad(center: Vec3, other: Vec3): { center: Vec3; vy: number; vxz: [number, number] } {
  const dx = other[0] - center[0];
  const dz = other[2] - center[2];
  const d = Math.hypot(dx, dz);
  return { center, vy: 14, vxz: [(24 * dx) / d, (24 * dz) / d] };
}

const NIGHT2: Level = {
  night: 2,
  islandName: 'Đảo Cau',
  playerStart: [0, 0, 0],
  playerFacing: [0, 1],
  lanternPositions: [
    [0, 0, 20],
    [17, 0, -10],
    [-17, 0, -10],
    [70, 0, 20],
    [87, 0, -10],
    [53, 0, -10],
  ],
  moteSpawnPoints: N2_CENTRES.flatMap((c) => [...ring(10, 4, 0, 90, c[0], c[2]), ...ring(22, 8, 0, 45, c[0], c[2])]),
  shadeSpawnPoints: N2_CENTRES.flatMap((c) => ring(26, 8, 22.5, 45, c[0], c[2])),
  charmPositions: [[35, 0, 0]],
  shadeSpawnEvery: SHADE_SPAWN_EVERY_N2,
  shadeMax: SHADE_MAX_N2,
  shadeSpeed: (t) => t.shade_speed,
  jumpPads: [n2Pad([20, 0, 18], [70, 0, 0]), n2Pad([50, 0, -18], [0, 0, 0])],
  drifters: true,
  wind: false,
  shadesAvoidVoid: true,
  terrainY: true,
  walls: false,
  groundAt: (x, z) => {
    if (Math.hypot(x, z) <= N2_ISLAND_R || Math.hypot(x - 70, z) <= N2_ISLAND_R) return 0;
    if (x >= 26 && x <= 44 && z >= -2 && z <= 2) return 0; // the bridge
    return null;
  },
  blocked: () => false,
};

// --- Night 3: Đảo Chuông (three tiers, two ramps, bell tower, wind) ---------------------------------------------
const N3_RAMPS = [30, 150].map((deg) => {
  const a = (deg * Math.PI) / 180;
  return { ux: Math.cos(a), uz: Math.sin(a) };
});

function night3Ground(x: number, z: number): number | null {
  const r = Math.hypot(x, z);
  if (r > 45) return null;
  if (r <= 8) return 6; // tier 2 (the bell tower stands on it)
  if (z > 0 && r >= 12 && r <= 24) return 3; // tier 1 (a half ring)
  for (const { ux, uz } of N3_RAMPS) {
    const along = x * ux + z * uz;
    const across = Math.abs(z * ux - x * uz);
    if (across <= 1.5 && along >= 24 && along <= 30) return (3 * (30 - along)) / 6;
  }
  return 0;
}

const NIGHT3: Level = {
  night: 3,
  islandName: 'Đảo Chuông',
  playerStart: [0, 0, -30],
  playerFacing: [0, 1],
  lanternPositions: [
    [0, 6, 6],
    [18, 3, 10],
    [-18, 3, 10],
    [35, 0, -10],
    [-35, 0, -10],
    [20, 0, -35],
    [-20, 0, -35],
  ],
  moteSpawnPoints: [...ring(34, 18, 0, 20, 0, 0, 0), ...ring(18, 8, 20, 20, 0, 0, 3), ...ring(5, 4, 45, 90, 0, 0, 6)],
  shadeSpawnPoints: ring(43, 16, 0, 22.5, 0, 0, 0),
  charmPositions: [
    [30, 0, 25],
    [-30, 0, 25],
  ],
  shadeSpawnEvery: SHADE_SPAWN_EVERY_N3,
  shadeMax: SHADE_MAX_N3,
  shadeSpeed: () => SHADE_SPEED_NIGHT3,
  jumpPads: [{ center: [0, 3, 13], vy: 12, vxz: [0, -8] }],
  drifters: true,
  wind: true,
  shadesAvoidVoid: true,
  terrainY: true,
  walls: true,
  groundAt: night3Ground,
  blocked: (x, z, y) => Math.hypot(x, z) < TOWER_RADIUS && y < TOWER_TOP_Y,
};

const LEVELS: Record<1 | 2 | 3, Level> = { 1: NIGHT1, 2: NIGHT2, 3: NIGHT3 };

/** The level of night 1, 2 or 3. Throws for anything else (the CLI validates `--night` first). */
export function getLevel(night: number): Level {
  if (night !== 1 && night !== 2 && night !== 3) throw new Error(`no level for night ${night}`);
  return LEVELS[night];
}

/** Copies of a level's positions, for state that mutates them. */
export const copyPoints = (points: readonly Vec3[]): Vec3[] => points.map(copy);
