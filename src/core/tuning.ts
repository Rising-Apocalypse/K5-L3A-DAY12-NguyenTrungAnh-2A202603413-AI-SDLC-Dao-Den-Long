import contract from '../../game.contract.json';

export interface ScoreTuning {
  readonly per_mote: number;
  readonly per_lantern: number;
  readonly per_stun: number;
  readonly per_second_left: number;
  readonly per_flame_left: number;
}

/** Every tuning key of Test Contract v1.0. The single source of truth is `game.contract.json`. */
export interface Tuning {
  readonly player_speed: number;
  readonly carry_capacity: number;
  readonly lantern_cost: number;
  readonly lantern_count_night1: number;
  readonly pickup_radius: number;
  readonly interact_radius: number;
  readonly pulse_cost: number;
  readonly pulse_radius: number;
  readonly night1_duration_s: number;
  readonly flames: number;
  readonly invuln_s: number;
  readonly hit_drop_ratio: number;
  readonly pulse_stun_s: number;
  readonly pulse_push_m: number;
  readonly pulse_cooldown_s: number;
  readonly safe_radius: number;
  readonly shade_speed: number;
  readonly shade_hit_radius: number;
  readonly fall_enabled: boolean;
  readonly dash_speed: number;
  readonly dash_duration_s: number;
  readonly dash_cooldown_s: number;
  readonly night2_duration_s: number;
  readonly night3_duration_s: number;
  readonly score: ScoreTuning;
}

const NUMBER_KEYS = [
  'player_speed', 'carry_capacity', 'lantern_cost', 'lantern_count_night1',
  'pickup_radius', 'interact_radius', 'pulse_cost', 'pulse_radius', 'night1_duration_s',
  'flames', 'invuln_s', 'hit_drop_ratio', 'pulse_stun_s', 'pulse_push_m', 'pulse_cooldown_s',
  'safe_radius', 'shade_speed', 'shade_hit_radius',
  'dash_speed', 'dash_duration_s', 'dash_cooldown_s', 'night2_duration_s', 'night3_duration_s',
] as const;

const SCORE_KEYS = ['per_mote', 'per_lantern', 'per_stun', 'per_second_left', 'per_flame_left'] as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function requireNumber(obj: Record<string, unknown>, key: string, where: string): number {
  const v = obj[key];
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
    throw new Error(`game.contract.json: ${where}.${key} must be a finite number >= 0 (got ${JSON.stringify(v)})`);
  }
  return v;
}

/** Validate the raw contract JSON and return a frozen, typed Tuning. Throws on any missing/mistyped key. */
export function loadTuning(raw: unknown): Tuning {
  if (!isRecord(raw) || !isRecord(raw.tuning)) {
    throw new Error('game.contract.json: missing "tuning" object');
  }
  const t = raw.tuning;
  const numbers: Record<string, number> = {};
  for (const key of NUMBER_KEYS) numbers[key] = requireNumber(t, key, 'tuning');

  if (typeof t.fall_enabled !== 'boolean') {
    throw new Error('game.contract.json: tuning.fall_enabled must be a boolean');
  }
  if (!isRecord(t.score)) throw new Error('game.contract.json: tuning.score must be an object');
  const score: Record<string, number> = {};
  for (const key of SCORE_KEYS) score[key] = requireNumber(t.score, key, 'tuning.score');

  // Every key was checked above, so the assembled object really is a Tuning.
  return Object.freeze({
    ...numbers,
    fall_enabled: t.fall_enabled,
    score: Object.freeze(score),
  }) as unknown as Tuning;
}

export const TUNING: Tuning = loadTuning(contract);
