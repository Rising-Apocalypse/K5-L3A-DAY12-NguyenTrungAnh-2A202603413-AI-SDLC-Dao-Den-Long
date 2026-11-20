import { FormatError } from './errors';
import type { Vec3 } from './types';

/** A validated scenario file (Test Contract section D). Every field is optional: absent = game default. */
export interface Scenario {
  player?: { pos?: Vec3; carried?: number; flames?: number };
  randomMotes?: boolean;
  randomShades?: boolean;
  motes?: Vec3[];
  shades?: { pos: Vec3; id?: string }[];
  lanterns?: { id: string; pos?: Vec3; lit?: boolean; deposited?: number }[];
  timeLeftS?: number;
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

function bool(v: unknown, where: string): boolean {
  if (typeof v !== 'boolean') throw new FormatError(`scenario: ${where} must be a boolean`);
  return v;
}

function list(v: unknown, where: string): unknown[] {
  if (!Array.isArray(v)) throw new FormatError(`scenario: ${where} must be an array`);
  return v;
}

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
      const shade: { pos: Vec3; id?: string } = { pos: vec3(s.pos, `shades[${i}].pos`) };
      if (s.id !== undefined) {
        if (typeof s.id !== 'string' || s.id === '') {
          throw new FormatError(`scenario: shades[${i}].id must be a non-empty string`);
        }
        if (seen.has(s.id)) throw new FormatError(`scenario: shades[${i}].id "${s.id}" is used twice`);
        seen.add(s.id);
        shade.id = s.id;
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
      const lantern: { id: string; pos?: Vec3; lit?: boolean; deposited?: number } = { id: l.id };
      if (l.pos !== undefined) lantern.pos = vec3(l.pos, `lanterns[${i}].pos`);
      if (l.lit !== undefined) lantern.lit = bool(l.lit, `lanterns[${i}].lit`);
      if (l.deposited !== undefined) lantern.deposited = count(l.deposited, `lanterns[${i}].deposited`);
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

  return out;
}
