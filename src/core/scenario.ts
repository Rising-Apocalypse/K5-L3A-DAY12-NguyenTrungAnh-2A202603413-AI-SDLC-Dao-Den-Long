import { FormatError } from './errors';
import type { ShadeStateName, Vec3 } from './types';

/** A validated scenario file (Test Contract section D and Contract v1.1). Every field is optional: absent = game default. */
export interface Scenario {
  player?: {
    pos?: Vec3;
    carried?: number;
    flames?: number;
    invulnTicks?: number;
    dashCdTicks?: number;
    pulseCdTicks?: number;
    charmTicks?: number;
    successfulLights?: number;
  };
  randomMotes?: boolean;
  randomShades?: boolean;
  motes?: Vec3[];
  shades?: {
    pos: Vec3;
    id?: string;
    state?: ShadeStateName;
    stateTicksLeft?: number;
    targetLanternId?: string;
  }[];
  lanterns?: {
    id: string;
    pos?: Vec3;
    lit?: boolean;
    deposited?: number;
    fuel?: number;
    everLit?: boolean;
  }[];
  timeLeftS?: number;
  charms?: { id: string; pos: Vec3; available: boolean; respawnTicks: number }[];
  drifters?: { pos: Vec3 }[];
  randomDrifters?: boolean;
  windEnabled?: boolean;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function vec3(v: unknown, where: string): Vec3 {
  if (!Array.isArray(v) || v.length !== 3 || !v.every((c: unknown) => typeof c === 'number' && Number.isFinite(c))) {
    throw new FormatError(`scenario: ${where} must be an array of 3 finite numbers`);
  }
  return [v[0] as number, v[1] as number, v[2] as number];
}

function count(v: unknown, where: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw new FormatError(`scenario: ${where} must be an integer >= 0`);
  }
  return v;
}

function fuelVal(v: unknown, where: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100) {
    throw new FormatError(`scenario: ${where} must be a number between 0 and 100`);
  }
  return v;
}

function bool(v: unknown, where: string): boolean {
  if (typeof v !== 'boolean') throw new FormatError(`scenario: ${where} must be a boolean`);
  return v;
}

function list(v: unknown, where: string): unknown[] {
  if (!Array.isArray(v)) throw new FormatError(`scenario: ${where} must be an array`);
  return v;
}

const VALID_SHADE_STATES = new Set(['spawning', 'wander', 'chase', 'recoil', 'stunned', 'drain']);

/** Validate a parsed scenario JSON document. Throws FormatError. Unknown keys are ignored. */
export function parseScenario(json: unknown): Scenario {
  if (!isRecord(json)) throw new FormatError('scenario: top level must be an object');
  const out: Scenario = {};

  if (json.player !== undefined) {
    const p = json.player;
    if (!isRecord(p)) throw new FormatError('scenario: "player" must be an object');
    out.player = {};
    if (p.pos !== undefined) out.player.pos = vec3(p.pos, 'player.pos');
    if (p.carried !== undefined) out.player.carried = count(p.carried, 'player.carried');
    if (p.flames !== undefined) out.player.flames = count(p.flames, 'player.flames');
    if (p.invuln_ticks !== undefined) out.player.invulnTicks = count(p.invuln_ticks, 'player.invuln_ticks');
    if (p.dash_cd_ticks !== undefined) out.player.dashCdTicks = count(p.dash_cd_ticks, 'player.dash_cd_ticks');
    if (p.pulse_cd_ticks !== undefined) out.player.pulseCdTicks = count(p.pulse_cd_ticks, 'player.pulse_cd_ticks');
    if (p.charm_ticks !== undefined) out.player.charmTicks = count(p.charm_ticks, 'player.charm_ticks');
    if (p.successful_lights !== undefined) out.player.successfulLights = count(p.successful_lights, 'player.successful_lights');
  }

  if (json.random_motes !== undefined) out.randomMotes = bool(json.random_motes, 'random_motes');
  if (json.random_shades !== undefined) out.randomShades = bool(json.random_shades, 'random_shades');

  if (json.motes !== undefined) {
    out.motes = list(json.motes, 'motes').map((m, i) => vec3(m, `motes[${i}]`));
  }

  if (json.shades !== undefined) {
    const seen = new Set<string>();
    out.shades = list(json.shades, 'shades').map((s, i) => {
      if (!isRecord(s)) throw new FormatError(`scenario: shades[${i}] must be an object`);
      const shade: {
        pos: Vec3;
        id?: string;
        state?: ShadeStateName;
        stateTicksLeft?: number;
        targetLanternId?: string;
      } = { pos: vec3(s.pos, `shades[${i}].pos`) };
      if (s.id !== undefined) {
        if (typeof s.id !== 'string' || s.id === '') {
          throw new FormatError(`scenario: shades[${i}].id must be a non-empty string`);
        }
        if (seen.has(s.id)) throw new FormatError(`scenario: shades[${i}].id "${s.id}" is used twice`);
        seen.add(s.id);
        shade.id = s.id;
      }
      if (s.state !== undefined) {
        if (typeof s.state !== 'string' || !VALID_SHADE_STATES.has(s.state)) {
          throw new FormatError(`scenario: shades[${i}].state must be one of spawning|wander|chase|recoil|stunned|drain`);
        }
        shade.state = s.state as ShadeStateName;
      }
      if (s.state_ticks_left !== undefined) {
        shade.stateTicksLeft = count(s.state_ticks_left, `shades[${i}].state_ticks_left`);
      }
      if (s.target_lantern_id !== undefined) {
        if (typeof s.target_lantern_id !== 'string' || s.target_lantern_id === '') {
          throw new FormatError(`scenario: shades[${i}].target_lantern_id must be a non-empty string`);
        }
        shade.targetLanternId = s.target_lantern_id;
      }
      if (shade.state === 'drain' && !shade.targetLanternId) {
        throw new FormatError(`scenario: shades[${i}] with state "drain" requires target_lantern_id`);
      }
      return shade;
    });
  }

  if (json.lanterns !== undefined) {
    out.lanterns = list(json.lanterns, 'lanterns').map((l, i) => {
      if (!isRecord(l)) throw new FormatError(`scenario: lanterns[${i}] must be an object`);
      // Which ids actually exist (L1..L<lantern_count>) is checked when the level is built.
      if (typeof l.id !== 'string' || !/^L[1-9][0-9]*$/.test(l.id)) {
        throw new FormatError(`scenario: lanterns[${i}].id must look like "L1".."L5"`);
      }
      const lantern: {
        id: string;
        pos?: Vec3;
        lit?: boolean;
        deposited?: number;
        fuel?: number;
        everLit?: boolean;
      } = { id: l.id };
      if (l.pos !== undefined) lantern.pos = vec3(l.pos, `lanterns[${i}].pos`);
      if (l.lit !== undefined) lantern.lit = bool(l.lit, `lanterns[${i}].lit`);
      if (l.deposited !== undefined) lantern.deposited = count(l.deposited, `lanterns[${i}].deposited`);
      if (l.fuel !== undefined) lantern.fuel = fuelVal(l.fuel, `lanterns[${i}].fuel`);
      if (l.ever_lit !== undefined) lantern.everLit = bool(l.ever_lit, `lanterns[${i}].ever_lit`);
      return lantern;
    });
  }

  if (json.time_left_s !== undefined) {
    const t = json.time_left_s;
    if (typeof t !== 'number' || !Number.isFinite(t) || t < 0) {
      throw new FormatError('scenario: time_left_s must be a finite number >= 0');
    }
    out.timeLeftS = t;
  }

  if (json.charms !== undefined) {
    const seen = new Set<string>();
    out.charms = list(json.charms, 'charms').map((c, i) => {
      if (!isRecord(c)) throw new FormatError(`scenario: charms[${i}] must be an object`);
      if (typeof c.id !== 'string' || c.id === '') {
        throw new FormatError(`scenario: charms[${i}].id must be a non-empty string`);
      }
      if (seen.has(c.id)) throw new FormatError(`scenario: charms[${i}].id "${c.id}" is used twice`);
      seen.add(c.id);
      const pos = vec3(c.pos, `charms[${i}].pos`);
      const available = c.available !== undefined ? bool(c.available, `charms[${i}].available`) : true;
      const respawnTicks = c.respawn_ticks !== undefined ? count(c.respawn_ticks, `charms[${i}].respawn_ticks`) : 0;
      return { id: c.id, pos, available, respawnTicks };
    });
  }

  if (json.drifters !== undefined) {
    out.drifters = list(json.drifters, 'drifters').map((d, i) => {
      if (!isRecord(d)) throw new FormatError(`scenario: drifters[${i}] must be an object`);
      return { pos: vec3(d.pos, `drifters[${i}].pos`) };
    });
  }

  if (json.random_drifters !== undefined) out.randomDrifters = bool(json.random_drifters, 'random_drifters');
  if (json.wind_enabled !== undefined) out.windEnabled = bool(json.wind_enabled, 'wind_enabled');

  return out;
}
