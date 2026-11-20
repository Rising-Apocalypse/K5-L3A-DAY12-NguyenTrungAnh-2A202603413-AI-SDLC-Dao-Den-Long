import type { Rng } from './rng';

/** World position in metres. Y is up, island ground is Y = 0, XZ is the horizontal plane. */
export type Vec3 = [number, number, number];

export const BUTTONS = ['jump', 'interact', 'pulse', 'dash'] as const;
export type Button = (typeof BUTTONS)[number];
export type Buttons = Record<Button, boolean>;

/** Input for one tick. Buttons are "held" levels; actions trigger on false -> true transitions. */
export interface InputState extends Buttons {
  /** [x, z], each in [-1, 1], relative to the camera (see `worldMove`). */
  move: [number, number];
  camYawDeg: number;
}

export type GameStatus = 'playing' | 'won' | 'lost';
export type ShadeStateName = 'spawning' | 'wander' | 'chase' | 'recoil' | 'stunned';

export interface PlayerState {
  pos: Vec3;
  vel: Vec3;
  /** Last non-zero move direction on XZ (unit vector). Starts as +Z. */
  facing: [number, number];
  flames: number;
  carried: number;
  grounded: boolean;
  /** Ticks of invulnerability left (shades cannot hit Mây while > 0). */
  invulnTicks: number;
  /** Ticks until the pulse can be used again. */
  pulseCooldownTicks: number;
  /** > 0 while Mây waits to respawn after falling: frozen, no pickup / interact / pulse, cannot be hit. */
  fallWaitTicks: number;
}

export interface LanternState {
  id: string;
  pos: Vec3;
  lit: boolean;
  deposited: number;
}

export interface ShadeState {
  id: string;
  pos: Vec3;
  state: ShadeStateName;
  // Internal counters (ticks). Not part of the output; see src/core/sim.ts for how each one is used.
  /** Ticks left in `spawning`. */
  spawnTicks: number;
  /** Ticks left of the stun (state `stunned`). */
  stunTicks: number;
  /** Ticks left of a forced move (pulse push while stunned, or the recoil after a hit) and its XZ step per tick. */
  forcedTicks: number;
  forcedStep: [number, number];
  /** Ticks left of being moved out of a freshly lit safe zone (harmless meanwhile), its step per tick, its centre. */
  evictTicks: number;
  evictStep: number;
  evictFrom: Vec3;
  /** Current wander target and ticks until it is re-picked. */
  wanderTarget: Vec3 | null;
  wanderTicks: number;
}

export interface MoteState {
  id: string;
  pos: Vec3;
  /** False once picked up or expired; inactive motes are kept in the list but never output or interacted with. */
  active: boolean;
  /** Only for motes dropped by a hit: ticks until it disappears. */
  ttl?: number;
}

export interface GameState {
  /** Steps executed so far. */
  tick: number;
  /** Gameplay steps executed (equal to `tick` in Phase 1). */
  simTick: number;
  state: GameStatus;
  timeLeftS: number;
  score: number;
  player: PlayerState;
  lanterns: LanternState[];
  shades: ShadeState[];
  motes: MoteState[];
  /** Button levels of the previous step, used for false -> true edge detection. */
  prevButtons: Buttons;
  /** Number to use for the next auto-generated shade id ("S<n>"), so ids are never reused. */
  nextShadeNum: number;
  /** Number to use for the next auto-generated mote id ("M<n>"): random spawns and dropped motes. */
  nextMoteNum: number;
}

/** The 7 contract events, `name` + `data` exactly as in Test Contract v1.0 section E. */
export type GameEvent =
  | { name: 'mote_picked'; data: { carried: number } }
  | { name: 'deposit'; data: { lantern_id: string; amount: number; deposited: number } }
  | { name: 'lantern_lit'; data: { lantern_id: string } }
  | { name: 'pulse'; data: { stunned_ids: string[] } }
  | { name: 'player_hit'; data: { by: 'shade' | 'fall'; flames: number; dropped: number } }
  | { name: 'shade_spawned'; data: { id: string } }
  | { name: 'game_over'; data: { result: 'won' | 'lost'; reason: 'all_lit' | 'dawn' | 'no_flames' } };

/** One snapshot line of the JSONL output (key order is part of the output format). */
export interface Snapshot {
  type: 'snapshot';
  tick: number;
  sim_tick: number;
  state: GameStatus;
  time_left_s: number;
  score: number;
  player: { pos: Vec3; flames: number; carried: number };
  lanterns: { id: string; pos: Vec3; lit: boolean; deposited: number }[];
  shades: { id: string; pos: Vec3; state: ShadeStateName }[];
  motes_active: number;
  motes: { id: string; pos: Vec3 }[];
}

/**
 * Optional creative add-on. WEB ONLY: the headless CLI never passes any, so extras cannot change the graded
 * output. `rng` is the dedicated "extras" stream. (The registry lives in `src/extras`; the interface lives here
 * because core must not import from `src/extras`.)
 */
export interface Extra {
  onBuild?(state: GameState, rng: Rng): void;
  onStep?(state: GameState, input: InputState, rng: Rng): void;
}
