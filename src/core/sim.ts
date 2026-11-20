import { FormatError } from './errors';
import { compareIds, dist3, moveToward, unitXZ, xzDist } from './geom';
import { risingEdges, worldMove } from './input';
import { GRAVITY, ISLAND_RADIUS, JUMP_SPEED, SHADE_HOVER_Y, buildLanterns, buildMotes } from './level';
import { getLevel, type Level } from './levels';
import { Rng } from './rng';
import { round3 } from './round';
import {
  CHARM_PICKUP_MAX_DY,
  CHARM_RESPAWN_TICKS,
  CHARM_RUN_SPEED,
  CHARM_TICKS,
  DAWN_PER_LIT_LANTERN,
  DRAIN_BREAK_DIST,
  DRAIN_REACH,
  DRAIN_STUN_BONUS,
  DRIFTER_CHASE_CARRIED,
  DRIFTER_DETECT,
  DRIFTER_DROP_VANISH_TICKS,
  DRIFTER_FLEE_TICKS,
  DRIFTER_HIT_RADIUS,
  DRIFTER_HOVER_Y,
  DRIFTER_IDLE_REPICK_TICKS,
  DRIFTER_IDLE_SPEED,
  DRIFTER_MAX,
  DRIFTER_SPAWN_EVERY,
  DRIFTER_SPEED,
  DRIFTER_STEAL_MAX,
  DROP_RING_MAX,
  DROP_RING_MIN,
  DROP_TTL,
  EVICT_MAX_TICKS,
  FALL_WAIT_TICKS,
  FALL_Y,
  FUEL_EVENT_EVERY,
  MOTE_CAP,
  MOTE_SPAWN_CLEARANCE,
  MOTE_SPAWN_EVERY,
  PAD_FOOT_EPS,
  PAD_RADIUS,
  PICKUP_MAX_DY,
  PULSE_CENTER_DY,
  PULSE_PUSH_TICKS,
  RECOIL_DIST,
  RECOIL_TICKS,
  RELIGHT_SCORE,
  SAFE_EDGE_MARGIN,
  SHADE_DETECT,
  SHADE_FIRST_SPAWN,
  SHADE_FIRST_SPAWN_COUNT,
  SHADE_HIT_MAX_DY,
  SHADE_LOSE,
  SHADE_SPAWNING_TICKS,
  SHADE_SPAWN_MIN_DIST,
  SHADE_WANDER_RADIUS,
  SHADE_WANDER_REACHED,
  SHADE_WANDER_REPICK_TICKS,
  SHADE_WANDER_SPEED,
  STEP_DOWN,
  STEP_UP,
  WIND_EVERY,
  WIND_SPEED,
  WIND_TICKS,
  WIND_WARN_TICKS,
} from './rules';
import type { Scenario } from './scenario';
import { TUNING, type Tuning } from './tuning';
import type {
  Buttons,
  DrifterState,
  DrifterStateName,
  Extra,
  GameEvent,
  GameState,
  InputState,
  LanternState,
  ShadeState,
  ShadeStateName,
  Snapshot,
  Vec3,
} from './types';

/** Fixed simulation rate (Test Contract section B): 1 tick = 1/60 s. */
export const TICK_RATE = 60;
const DT = 1 / TICK_RATE;
/** Seconds -> ticks, done once per tuning value; every timer is then an integer tick counter. */
const toTicks = (seconds: number): number => Math.round(seconds * TICK_RATE);

export interface CreateGameOptions {
  seed: number;
  /** Which night to play (default 1). */
  night?: 1 | 2 | 3;
  scenario?: Scenario;
  tuning?: Tuning;
  /** Web only. The headless CLI never passes extras. */
  extras?: readonly Extra[];
  /**
   * Benchmark scene (Night 1 only, default off): L1-L3 lit with full fuel, 200 wandering shades and 100 motes spread over
   * the island; spawns, hits, pickup, fuel decay/drain and the end of the night are switched off. See `applyBench`.
   */
  bench?: boolean;
}

export interface Game {
  readonly state: GameState;
  /** Advance exactly one tick using this tick's input. Returns the events that happened during the step. */
  step(input: InputState): GameEvent[];
  /** Contract-shaped snapshot of the current state (coordinates rounded to 3 decimals). */
  snapshot(): Snapshot;
}

const copy = (v: Vec3): Vec3 => [v[0], v[1], v[2]];

// --- lantern fuel: integer units of 1/60 (one unit = one tick of natural decay), all derived from tuning -------
const UNITS_PER_FUEL = TICK_RATE;

interface FuelUnits {
  /** A full lantern (fuel_max). */
  readonly full: number;
  /** Units one mote adds (fuel_per_mote). */
  readonly perMote: number;
  /** Below this a lit lantern has no safe zone (low_fuel_threshold). */
  readonly low: number;
  /** Units lost per tick by every lit lantern (fuel_decay_per_s). */
  readonly decay: number;
  /** Units a draining shade takes per tick (drain_per_s). */
  readonly drain: number;
}

function fuelUnitsOf(tuning: Tuning): FuelUnits {
  return {
    full: Math.round(tuning.fuel_max * UNITS_PER_FUEL),
    perMote: Math.round(tuning.fuel_per_mote * UNITS_PER_FUEL),
    low: Math.round(tuning.low_fuel_threshold * UNITS_PER_FUEL),
    decay: Math.round((tuning.fuel_decay_per_s * UNITS_PER_FUEL) / TICK_RATE),
    drain: Math.round((tuning.drain_per_s * UNITS_PER_FUEL) / TICK_RATE),
  };
}

/** Fuel as written to the output: 1 decimal. */
const fuelOut = (units: number): number => Math.round((units / UNITS_PER_FUEL) * 10) / 10;

/** The one place that decides whether a lantern protects its surroundings: lit and not running low. */
function hasSafeZone(l: LanternState, tuning: Tuning): boolean {
  return l.lit && l.fuelUnits >= fuelUnitsOf(tuning).low;
}

/** The one place that decides how many motes Mây can carry. */
function capacity(state: GameState, tuning: Tuning): number {
  return Math.min(tuning.capacity_max, tuning.carry_capacity + 2 * state.player.successfulLights);
}

// --- building the level -----------------------------------------------------------------------------------

/** The number in an auto-generated id such as "S7" (0 for any other id). */
function idNumber(id: string, prefix: string): number {
  const m = new RegExp(`^${prefix}(\\d+)$`).exec(id);
  return m ? Number(m[1]) : 0;
}

function newShade(id: string, pos: Vec3, state: ShadeStateName): ShadeState {
  return {
    id,
    pos,
    state,
    spawnTicks: state === 'spawning' ? SHADE_SPAWNING_TICKS : 0,
    stunTicks: 0,
    forcedTicks: 0,
    forcedStep: [0, 0],
    evictTicks: 0,
    evictStep: 0,
    evictFrom: [0, 0, 0],
    wanderTarget: null,
    wanderTicks: 0,
    targetLanternId: null,
    drainTicks: 0,
  };
}

/** Listed shades keep their `id`; the rest get the lowest unused S<n>, in listed order. */
function assignShades(listed: NonNullable<Scenario['shades']>, playerPos: Vec3): ShadeState[] {
  const used = new Set(listed.flatMap((s) => (s.id !== undefined ? [s.id] : [])));
  let n = 1;
  return listed.map((s) => {
    let id = s.id;
    if (id === undefined) {
      while (used.has(`S${n}`)) n++;
      id = `S${n}`;
      used.add(id);
    }
    const stateName = s.state ?? 'wander';
    const shade = newShade(id, copy(s.pos), stateName);
    if (stateName === 'spawning') {
      if (s.stateTicksLeft !== undefined) shade.spawnTicks = s.stateTicksLeft;
    } else if (stateName === 'stunned') {
      shade.stunTicks = s.stateTicksLeft ?? 0;
    } else if (stateName === 'recoil') {
      shade.forcedTicks = s.stateTicksLeft ?? 0;
      const [ux, uz] = unitXZ(playerPos, shade.pos);
      shade.forcedStep = [(ux * RECOIL_DIST) / RECOIL_TICKS, (uz * RECOIL_DIST) / RECOIL_TICKS];
    } else if (stateName === 'drain') {
      shade.targetLanternId = s.targetLanternId ?? null;
    }
    return shade;
  });
}

function newDrifter(id: string, pos: Vec3, state: DrifterStateName, stolen: number): DrifterState {
  return {
    id,
    pos,
    state,
    stolen,
    fleeTicks: state === 'flee' ? DRIFTER_FLEE_TICKS : 0,
    idleTarget: null,
    idleTicks: 0,
  };
}

/** Listed drifters keep their `id`; the rest get the lowest unused D<n>, in listed order. */
function assignDrifters(listed: NonNullable<Scenario['drifters']>): DrifterState[] {
  const used = new Set(listed.flatMap((d) => (d.id !== undefined ? [d.id] : [])));
  let n = 1;
  return listed.map((d) => {
    let id = d.id;
    if (id === undefined) {
      while (used.has(`D${n}`)) n++;
      id = `D${n}`;
      used.add(id);
    }
    return newDrifter(id, copy(d.pos), d.state ?? 'idle', d.stolen ?? 0);
  });
}

const NIGHT_DURATION_KEYS = ['night1_duration_s', 'night2_duration_s', 'night3_duration_s'] as const;

/** Default level for the seed, then the scenario applied on top. Emits no events and awards no points. */
function buildState(seed: number, scenario: Scenario, tuning: Tuning, level: Level): GameState {
  const lanterns = buildLanterns(level);
  const units = fuelUnitsOf(tuning);
  if (level.night === 1 && lanterns.length !== tuning.lantern_count_night1) {
    throw new Error(`level has ${lanterns.length} lanterns but tuning.lantern_count_night1 is ${tuning.lantern_count_night1}`);
  }
  let motes = scenario.randomMotes === false ? [] : buildMotes(seed, level);
  // The standard Night 1 map starts with no shades: they spawn on a schedule (stageSpawns).
  let shades: ShadeState[] = [];

  if (scenario.motes) {
    motes = scenario.motes.map((pos, i) => ({ id: `M${i + 1}`, pos: copy(pos), active: true, kind: 'random' }));
  }
  const pos = copy(scenario.player?.pos ?? level.playerStart);
  if (scenario.shades) shades = assignShades(scenario.shades, pos);

  for (const patch of scenario.lanterns ?? []) {
    const lantern = lanterns.find((l) => l.id === patch.id);
    if (!lantern) throw new FormatError(`scenario: unknown lantern id "${patch.id}"`);
    if (patch.pos) lantern.pos = copy(patch.pos);
    if (patch.deposited !== undefined) lantern.deposited = patch.deposited;
    // lit without fuel = full; unlit = no fuel; fuel alone lights the lantern when it is above 0.
    const lit = patch.lit ?? (patch.fuel !== undefined ? patch.fuel > 0 : lantern.lit);
    lantern.lit = lit;
    lantern.fuelUnits = lit ? (patch.fuel !== undefined ? Math.round(patch.fuel * UNITS_PER_FUEL) : units.full) : 0;
    lantern.everLit = patch.everLit ?? (lit || lantern.everLit);
  }
  for (const shade of shades) {
    if (shade.targetLanternId !== null && !lanterns.some((l) => l.id === shade.targetLanternId)) {
      throw new FormatError(`scenario: shade "${shade.id}" has unknown target_lantern_id "${shade.targetLanternId}"`);
    }
  }
  const drifters = assignDrifters(scenario.drifters ?? []);
  // Lanterns lit by the scenario are lit from tick 0: shades standing inside them are evicted from step 0.
  for (const lantern of lanterns) {
    if (hasSafeZone(lantern, tuning)) for (const shade of shades) evictIfInside(shade, lantern, tuning);
  }

  return {
    tick: 0,
    simTick: 0,
    night: level.night,
    paused: false,
    state: 'playing',
    timeLeftS: scenario.timeLeftS ?? tuning[NIGHT_DURATION_KEYS[level.night - 1]!],
    score: 0,
    player: {
      pos,
      vel: [0, 0, 0],
      facing: [level.playerFacing[0], level.playerFacing[1]],
      flames: scenario.player?.flames ?? tuning.flames,
      carried: scenario.player?.carried ?? 0,
      grounded: standsOnGround(level, pos),
      invulnTicks: scenario.player?.invulnTicks ?? 0,
      pulseCooldownTicks: scenario.player?.pulseCdTicks ?? 0,
      fallWaitTicks: 0,
      dashTicks: 0,
      dashCooldownTicks: scenario.player?.dashCdTicks ?? 0,
      dashDir: [0, 1],
      charmTicks: scenario.player?.charmTicks ?? 0,
      successfulLights: scenario.player?.successfulLights ?? 0,
      launch: null,
    },
    lanterns,
    shades,
    motes,
    charms: (scenario.charms ?? level.charmPositions.map((pos, i) => ({ id: `C${i + 1}`, pos, available: true, respawnTicks: 0 }))).map((c) => ({
      id: c.id,
      pos: copy(c.pos),
      available: c.available,
      respawnTicks: c.available ? 0 : c.respawnTicks,
    })),
    drifters,
    wind: { active: false, dirDeg: 0, warning: false },
    prevButtons: { jump: false, interact: false, pulse: false, dash: false, pause: false },
    nextShadeNum: Math.max(0, ...shades.map((s) => idNumber(s.id, 'S'))) + 1,
    nextMoteNum: Math.max(0, ...motes.map((m) => idNumber(m.id, 'M'))) + 1,
    nextDrifterNum: Math.max(0, ...drifters.map((d) => idNumber(d.id, 'D'))) + 1,
  };
}

/** Number of shades and motes in the benchmark scene (Ticket-04 section 1). */
const BENCH_SHADES = 200;
const BENCH_MOTES = 100;
const BENCH_LIT_LANTERNS = 3;

/** Uniform point on the island disc (r = ISLAND_RADIUS * sqrt(u)) outside every lit safe zone, drawn from `rng`. */
function benchPoint(rng: Rng, lit: readonly LanternState[], tuning: Tuning, y: number): Vec3 {
  for (;;) {
    const r = ISLAND_RADIUS * Math.sqrt(rng.next());
    const a = 2 * Math.PI * rng.next();
    const pos: Vec3 = [r * Math.cos(a), y, r * Math.sin(a)];
    if (lit.every((l) => xzDist(pos, l.pos) >= tuning.safe_radius)) return pos;
  }
}

/** Turn a freshly built Night 1 state into the benchmark scene. Emits no events and awards no points. */
function applyBench(state: GameState, seed: number, tuning: Tuning): void {
  const full = fuelUnitsOf(tuning).full;
  state.lanterns.forEach((l, i) => {
    const lit = i < BENCH_LIT_LANTERNS;
    l.lit = lit;
    l.fuelUnits = lit ? full : 0;
    l.everLit = lit;
    l.deposited = 0;
    l.relitCount = 0;
  });
  const lit = state.lanterns.filter((l) => l.lit);
  const rng = new Rng(seed, 'bench');
  state.player.pos = [0, 0, 0];
  state.player.carried = 0;
  state.shades = [];
  for (let i = 1; i <= BENCH_SHADES; i++) state.shades.push(newShade(`S${i}`, benchPoint(rng, lit, tuning, SHADE_HOVER_Y), 'wander'));
  state.motes = [];
  for (let i = 1; i <= BENCH_MOTES; i++) state.motes.push({ id: `M${i}`, pos: benchPoint(rng, lit, tuning, 0), active: true, kind: 'random' });
  state.drifters = [];
  state.nextShadeNum = BENCH_SHADES + 1;
  state.nextMoteNum = BENCH_MOTES + 1;
}

/** Feet at or below the ground surface under them (Night 1: y <= 0 and within ISLAND_RADIUS of the centre). */
function standsOnGround(level: Level, pos: Vec3): boolean {
  const h = level.groundAt(pos[0], pos[2]);
  return h !== null && pos[1] <= h;
}

// --- one tick: stages 1-11 of docs/plans/01-phase1-gameplay.md ----------------------------------------------

/** Everything the stage functions of one step share. */
interface Step {
  readonly state: GameState;
  readonly tuning: Tuning;
  readonly level: Level;
  readonly input: InputState;
  /** Rising edges of the buttons this tick (stage 1). */
  readonly edges: Buttons;
  readonly events: GameEvent[];
  readonly ticks: { readonly invuln: number; readonly stun: number; readonly pulseCooldown: number };
  readonly rngs: { readonly drops: Rng; readonly shadeAi: Rng; readonly spawn: Rng; readonly shades: Rng; readonly drifters: Rng; readonly wind: Rng };
  readonly randomMotes: boolean;
  readonly randomShades: boolean;
  readonly randomDrifters: boolean;
  readonly windEnabled: boolean;
  /** Benchmark scene: no spawns, hits, pickup, fuel loss or end of night. */
  readonly bench: boolean;
  readonly fuel: FuelUnits;
  /** Set by stage 2 when the fall-wait ends this tick; stage 3 then respawns Mây instead of moving her. */
  respawn: boolean;
  /** Lanterns lit by stage 5 this tick, for stage 6. */
  newlyLit: LanternState[];
}

/** Shades in ascending id order (the order used for pulse targets and hits). */
const ascending = (shades: readonly ShadeState[]): ShadeState[] => [...shades].sort((a, b) => compareIds(a.id, b.id));

/** Stage 2: count every timer down by one tick. */
function stageCounters(c: Step): void {
  const { player: p, shades, motes, charms, lanterns } = c.state;
  if (p.pulseCooldownTicks > 0) p.pulseCooldownTicks -= 1;
  if (p.invulnTicks > 0) p.invulnTicks -= 1;
  if (p.dashCooldownTicks > 0) p.dashCooldownTicks -= 1;
  if (p.charmTicks > 0) p.charmTicks -= 1;
  if (p.fallWaitTicks > 0) {
    p.fallWaitTicks -= 1;
    c.respawn = p.fallWaitTicks === 0;
  }
  for (const s of shades) {
    if (s.spawnTicks > 0) s.spawnTicks -= 1;
    if (s.stunTicks > 0) s.stunTicks -= 1;
  }
  // Rule 2: natural decay, then every draining shade takes its share (lowest shade id first). Off in the bench scene.
  if (!c.bench) for (const l of lanterns) if (l.lit) l.fuelUnits -= c.fuel.decay;
  for (const s of ascending(shades)) {
    if (c.bench || s.state !== 'drain') continue;
    s.drainTicks += 1;
    const target = lanterns.find((l) => l.id === s.targetLanternId);
    if (!target || !target.lit) continue;
    target.fuelUnits -= c.fuel.drain;
    if (s.drainTicks % FUEL_EVENT_EVERY === 0) {
      c.events.push({ name: 'fuel_drain', data: { lantern_id: target.id, shade_id: s.id, fuel: fuelOut(Math.max(0, target.fuelUnits)) } });
    }
  }
  for (const m of motes) {
    if (m.active && m.ttl !== undefined) {
      m.ttl -= 1;
      if (m.ttl <= 0) m.active = false;
    }
  }
  for (const ch of charms) {
    if (!ch.available) {
      ch.respawnTicks -= 1;
      if (ch.respawnTicks <= 0) {
        ch.respawnTicks = 0;
        ch.available = true;
      }
    }
  }
  if (c.level.wind && c.windEnabled) stageWind(c);
}

/** Night 3 wind: gust k is announced at simTick WIND_EVERY*k - WIND_WARN_TICKS and blows for WIND_TICKS ticks from WIND_EVERY*k. */
function stageWind(c: Step): void {
  const w = c.state.wind;
  const t = c.state.simTick;
  const m = t % WIND_EVERY;
  if (m === WIND_EVERY - WIND_WARN_TICKS) w.dirDeg = c.rngs.wind.int(0, 359);
  w.warning = m >= WIND_EVERY - WIND_WARN_TICKS;
  w.active = t >= WIND_EVERY && m < WIND_TICKS;
}

/** Rule 3, right after stage 2: a lit lantern out of fuel goes out and forgets its deposit. */
function stageLanternsOut(c: Step): void {
  for (const l of c.state.lanterns) {
    if (!l.lit || l.fuelUnits > 0) continue;
    l.lit = false;
    l.fuelUnits = 0;
    l.deposited = 0;
    l.everLit = true;
    c.events.push({ name: 'lantern_out', data: { lantern_id: l.id } });
  }
}

/**
 * Walls (Night 3): move Mây to (tx, tz) unless that is blocked (bell tower) or a step up higher than STEP_UP;
 * then try X only, then Z only, else stay.
 */
function wallMove(c: Step, tx: number, tz: number): void {
  const { level } = c;
  const p = c.state.player;
  const [fx, fz] = [p.pos[0], p.pos[2]];
  const y = p.pos[1];
  const ok = (x: number, z: number): boolean => {
    if (level.blocked(x, z, y)) return false;
    const g = level.groundAt(x, z);
    return g === null || g <= y + STEP_UP;
  };
  if (ok(tx, tz)) {
    p.pos[0] = tx;
    p.pos[2] = tz;
  } else if (ok(tx, fz)) {
    p.pos[0] = tx;
  } else if (ok(fx, tz)) {
    p.pos[2] = tz;
  }
}

/** One horizontal displacement of Mây (run, dash, launch or wind). Night 1: plain addition, exactly as always. */
function displace(c: Step, dx: number, dz: number): void {
  const p = c.state.player;
  if (!c.tuning.fall_enabled && c.level.night !== 1 && p.launch === null) {
    // Nights 2-3 without a fall penalty: a move that would end over void is undone (Night 1 clamps to its circle).
    if (c.level.groundAt(p.pos[0] + dx, p.pos[2] + dz) === null) return;
  }
  if (c.level.walls) {
    wallMove(c, p.pos[0] + dx, p.pos[2] + dz);
  } else {
    p.pos[0] += dx;
    p.pos[2] += dz;
  }
}

/** Wind: while a gust blows (and Mây is not waiting to respawn) it pushes her WIND_SPEED m/s on top of her own move. */
function applyWind(c: Step): void {
  const { wind } = c.state;
  if (!wind.active || c.state.player.fallWaitTicks > 0) return;
  const a = (wind.dirDeg * Math.PI) / 180;
  displace(c, (Math.cos(a) * WIND_SPEED) / TICK_RATE, (Math.sin(a) * WIND_SPEED) / TICK_RATE);
}

/** Walls (Night 3): a grounded Mây follows ramps (snaps within STEP_DOWN / STEP_UP) and walks off ledges. */
function settleOnGround(c: Step): void {
  const p = c.state.player;
  if (!p.grounded) return;
  const h = c.level.groundAt(p.pos[0], p.pos[2]);
  if (h === null) {
    p.grounded = false;
  } else if (h >= p.pos[1] - STEP_DOWN && h <= p.pos[1] + STEP_UP) {
    p.pos[1] = h;
  } else if (h < p.pos[1] - STEP_DOWN) {
    p.grounded = false; // off a ledge: falls to the lower tier
  }
}

/** The fall penalty (once per fall; Mây is frozen afterwards), shared by the dash and the normal branch. */
function applyFall(c: Step): void {
  const p = c.state.player;
  // Regardless of invulnerability: lose a flame and everything carried. In v1.1 the event's `lost` reports the
  // motes lost, dropped is 0.
  p.flames = Math.max(0, p.flames - 1);
  const lost = p.carried;
  p.carried = 0;
  p.dashTicks = 0;
  p.launch = null;
  c.events.push({ name: 'player_hit', data: { by: 'fall', flames: p.flames, dropped: 0, lost } });
  if (p.flames > 0) p.fallWaitTicks = FALL_WAIT_TICKS; // with no flame left the game ends in stage 11
}

/** Stage 3: walk / jump / gravity, then the fall check. Mây is frozen while she waits to respawn. */
function stageMovePlayer(c: Step): void {
  const { state, tuning, input, level } = c;
  const p = state.player;
  if (p.fallWaitTicks > 0) return;
  if (c.respawn) {
    // Back at the start, standing still, invulnerable for a moment (no movement on the respawn tick itself).
    p.pos[0] = level.playerStart[0];
    p.pos[1] = level.playerStart[1];
    p.pos[2] = level.playerStart[2];
    p.vel = [0, 0, 0];
    p.grounded = true;
    p.launch = null;
    p.invulnTicks = c.ticks.invuln;
    return;
  }

  const [dx, dz] = worldMove(input.move, input.camYawDeg);
  const moveLen = Math.hypot(dx, dz);

  // Jump pads: a grounded Mây standing on one (feet at its height) is launched; a jump press on that tick is moot.
  if (p.grounded && level.jumpPads.length > 0) {
    const pad = level.jumpPads.find(
      (pd) => xzDist(p.pos, pd.center) <= PAD_RADIUS && Math.abs(p.pos[1] - pd.center[1]) <= PAD_FOOT_EPS,
    );
    if (pad) {
      p.launch = [pad.vxz[0], pad.vxz[1]];
      p.vel[1] = pad.vy;
      p.grounded = false;
    }
  }

  const canDash = p.charmTicks > 0 || p.dashCooldownTicks === 0;
  if (c.edges.dash && p.dashTicks === 0 && canDash) {
    const dir: [number, number] = moveLen > 0 ? [dx / moveLen, dz / moveLen] : [p.facing[0], p.facing[1]];
    p.dashDir = dir;
    p.dashTicks = toTicks(tuning.dash_duration_s);
    p.dashCooldownTicks = toTicks(tuning.dash_cooldown_s);
    c.events.push({ name: 'dash', data: {} });
  }

  if (p.dashTicks > 0) {
    p.vel = [p.dashDir[0] * tuning.dash_speed, 0, p.dashDir[1] * tuning.dash_speed];
    displace(c, p.vel[0] * DT, p.vel[2] * DT);
    p.dashTicks -= 1;
    applyWind(c);

    if (level.walls) settleOnGround(c);
    else if (p.grounded && level.groundAt(p.pos[0], p.pos[2]) === null) p.grounded = false;

    if (tuning.fall_enabled && p.pos[1] < FALL_Y) applyFall(c);
    return;
  }

  // Velocity is set instantly (full air control). There is no edge clamp: past the ground there is nothing
  // and the player simply keeps falling (unless falling is switched off, see below). During a pad launch the
  // horizontal velocity is the launch velocity: move input is ignored and the facing does not change.
  const speed = p.charmTicks > 0 ? CHARM_RUN_SPEED : tuning.player_speed;
  if (p.launch) {
    p.vel[0] = p.launch[0];
    p.vel[2] = p.launch[1];
  } else {
    p.vel[0] = dx * speed;
    p.vel[2] = dz * speed;
  }
  displace(c, p.vel[0] * DT, p.vel[2] * DT);
  if (moveLen > 0 && !p.launch) p.facing = [dx / moveLen, dz / moveLen];
  applyWind(c);

  if (!tuning.fall_enabled && level.night === 1) {
    // Without a fall penalty the island edge is a wall.
    const r = Math.hypot(p.pos[0], p.pos[2]);
    if (r > ISLAND_RADIUS) {
      p.pos[0] *= ISLAND_RADIUS / r;
      p.pos[2] *= ISLAND_RADIUS / r;
    }
  }

  if (level.walls) settleOnGround(c);

  if (c.edges.jump && p.grounded) {
    p.vel[1] = JUMP_SPEED;
    p.grounded = false;
  }

  const h = level.groundAt(p.pos[0], p.pos[2]);
  if (p.grounded && h === null) p.grounded = false; // walked off the edge
  if (!p.grounded) {
    // Exact integration for constant gravity (so the jump apex is exactly JUMP_SPEED^2 / (2 * GRAVITY)).
    const prevY = p.pos[1];
    p.pos[1] += p.vel[1] * DT - 0.5 * GRAVITY * DT * DT;
    p.vel[1] -= GRAVITY * DT;
    // With walls, Mây may have entered a higher tier up to STEP_UP below its surface: she lands on it.
    const reach = level.walls ? STEP_UP : 0;
    if (h !== null && prevY >= h - reach && p.pos[1] <= h) {
      p.pos[1] = h;
      p.vel[1] = 0;
      p.grounded = true;
      p.launch = null;
    }
  }

  if (tuning.fall_enabled && p.pos[1] < FALL_Y) applyFall(c);
}

/** Stage 4: pick up motes in reach, lowest id first, while there is room to carry them. */
function stagePickup(c: Step): void {
  const { state, tuning } = c;
  const p = state.player;
  if (p.fallWaitTicks > 0 || c.bench) return;

  for (const m of state.motes) {
    if (p.carried >= capacity(state, tuning)) break;
    if (!m.active) continue;
    if (xzDist(p.pos, m.pos) > tuning.pickup_radius || Math.abs(p.pos[1] - m.pos[1]) > PICKUP_MAX_DY) continue;
    m.active = false;
    p.carried += 1;
    c.events.push({ name: 'mote_picked', data: { carried: p.carried } });
  }

  const sortedCharms = [...state.charms].sort((a, b) => compareIds(a.id, b.id));
  for (const ch of sortedCharms) {
    if (!ch.available) continue;
    if (xzDist(p.pos, ch.pos) <= tuning.pickup_radius && Math.abs(p.pos[1] - ch.pos[1]) <= CHARM_PICKUP_MAX_DY) {
      p.charmTicks = CHARM_TICKS;
      ch.available = false;
      ch.respawnTicks = CHARM_RESPAWN_TICKS;
      c.events.push({ name: 'charm_picked', data: { charm_id: ch.id, charm_ticks: CHARM_TICKS } });
    }
  }
}

/** Stage 5: on the interact edge, pour carried motes into the nearest lantern within reach that can take them. */
function stageInteract(c: Step): void {
  const { state, tuning } = c;
  const p = state.player;
  if (!c.edges.interact || p.fallWaitTicks > 0) return;

  let target: LanternState | null = null;
  let best = Infinity;
  for (const l of [...state.lanterns].sort((a, b) => compareIds(a.id, b.id))) {
    if (l.lit && l.fuelUnits >= c.fuel.full) continue; // a full lantern takes nothing
    const d = xzDist(p.pos, l.pos);
    if (d <= tuning.interact_radius && d < best) {
      target = l;
      best = d; // strict "<": on a tie the smaller id (visited first) stays
    }
  }
  if (!target) return;

  const hadZone = hasSafeZone(target, tuning);
  if (target.lit) {
    // Refuel: each mote adds fuel_per_mote, never past full.
    const used = Math.min(p.carried, Math.ceil((c.fuel.full - target.fuelUnits) / c.fuel.perMote));
    if (used <= 0) return;
    target.fuelUnits = Math.min(c.fuel.full, target.fuelUnits + c.fuel.perMote * used);
    p.carried -= used;
    state.score += used * tuning.score.per_mote;
    c.events.push({ name: 'refuel', data: { lantern_id: target.id, amount: used, fuel: fuelOut(target.fuelUnits) } });
  } else {
    const needed = target.everLit ? tuning.relight_cost : tuning.lantern_cost;
    const amount = Math.min(p.carried, needed - target.deposited);
    if (amount <= 0) return;
    p.carried -= amount;
    target.deposited += amount;
    state.score += amount * tuning.score.per_mote;
    c.events.push({ name: 'deposit', data: { lantern_id: target.id, amount, deposited: target.deposited } });
    if (target.deposited >= needed) {
      const relight = target.everLit;
      target.lit = true;
      target.fuelUnits = c.fuel.full;
      p.successfulLights += 1;
      if (relight) {
        target.relitCount += 1;
        state.score += RELIGHT_SCORE;
      } else {
        state.score += tuning.score.per_lantern;
      }
      target.everLit = true;
      c.events.push({ name: 'lantern_lit', data: { lantern_id: target.id, relight } });
    }
  }
  if (!hadZone && hasSafeZone(target, tuning)) c.newlyLit.push(target); // zone just switched on
}

/** Stage 6: shades standing inside a lantern that has just been lit start to be moved out of its safe zone. */
function stageSafeZones(c: Step): void {
  for (const lantern of c.newlyLit) {
    for (const shade of c.state.shades) evictIfInside(shade, lantern, c.tuning);
  }
}

/** If `shade` is inside the safe zone of the (lit) `lantern`, start moving it radially out, harmlessly. */
function evictIfInside(shade: ShadeState, lantern: LanternState, tuning: Tuning): void {
  const d = xzDist(shade.pos, lantern.pos);
  if (d >= tuning.safe_radius) return;
  const remaining = tuning.safe_radius + SAFE_EDGE_MARGIN - d;
  shade.evictTicks = EVICT_MAX_TICKS;
  shade.evictStep = Math.max(remaining / EVICT_MAX_TICKS, tuning.shade_speed / TICK_RATE);
  shade.evictFrom = copy(lantern.pos);
  shade.forcedTicks = 0; // eviction replaces any push or recoil in progress
}

/** Stage 7: on the pulse edge (and enough motes, no cooldown) stun and push every shade within reach. */
function stagePulse(c: Step): void {
  const { state, tuning } = c;
  const p = state.player;
  if (!c.edges.pulse || p.fallWaitTicks > 0 || p.pulseCooldownTicks > 0 || p.carried < tuning.pulse_cost) return;

  p.carried -= tuning.pulse_cost;
  p.pulseCooldownTicks = c.ticks.pulseCooldown;
  const centre: Vec3 = [p.pos[0], p.pos[1] + PULSE_CENTER_DY, p.pos[2]];
  const targets = ascending(state.shades).filter((s) => s.state !== 'spawning' && dist3(centre, s.pos) <= tuning.pulse_radius);
  const push = tuning.pulse_push_m / PULSE_PUSH_TICKS;
  for (const s of targets) {
    const [ux, uz] = unitXZ(p.pos, s.pos);
    const wasDraining = s.state === 'drain';
    s.state = 'stunned';
    s.targetLanternId = null;
    s.drainTicks = 0;
    s.stunTicks = c.ticks.stun; // a stunned shade is simply refreshed
    s.forcedTicks = PULSE_PUSH_TICKS; // the push restarts; it also replaces a recoil in progress
    s.forcedStep = [ux * push, uz * push];
    s.evictTicks = 0;
    state.score += tuning.score.per_stun + (wasDraining ? DRAIN_STUN_BONUS : 0);
  }
  c.events.push({ name: 'pulse', data: { stunned_ids: targets.map((s) => s.id) } });

  // Drifters in reach (chase or flee, lowest id first): a chaser gives up and flees empty-handed; a fleeing thief
  // drops its loot. No score; the event above lists shades only.
  const drifterTargets = [...state.drifters]
    .sort((a, b) => compareIds(a.id, b.id))
    .filter((d) => (d.state === 'chase' || d.state === 'flee') && dist3(centre, d.pos) <= tuning.pulse_radius);
  for (const d of drifterTargets) {
    if (d.state === 'chase') {
      d.state = 'flee';
      d.fleeTicks = DRIFTER_FLEE_TICKS;
    } else if (d.stolen > 0) {
      for (let i = 0; i < d.stolen; i++) dropMote(c, d.pos[0], d.pos[2]);
      c.events.push({ name: 'drifter_drop', data: { drifter_id: d.id, amount: d.stolen } });
      d.stolen = 0;
      d.fleeTicks = Math.min(d.fleeTicks, DRIFTER_DROP_VANISH_TICKS);
    }
  }
}

/**
 * A dropped mote (kind `dropped`, ttl DROP_TTL) at (x, z). Night 1: always at y 0. Nights 2-3: at the ground height
 * there; over void it is lost.
 */
function dropMote(c: Step, x: number, z: number): void {
  let y = 0;
  if (c.level.terrainY) {
    const g = c.level.groundAt(x, z);
    if (g === null) return;
    y = g;
  }
  c.state.motes.push({ id: `M${c.state.nextMoteNum++}`, pos: [x, y, z], active: true, ttl: DROP_TTL, kind: 'dropped' });
}

/**
 * Run one XZ change of a shade. Nights 2-3 (`shadesAvoidVoid`): if it would end over void or inside the bell tower,
 * the shade keeps its previous XZ instead. Night 1: just run it.
 */
function guarded<T>(c: Step, s: ShadeState, change: () => T): T {
  if (!c.level.shadesAvoidVoid) return change();
  const [x, z] = [s.pos[0], s.pos[2]];
  const result = change();
  if (c.level.groundAt(s.pos[0], s.pos[2]) === null || c.level.blocked(s.pos[0], s.pos[2], s.pos[1])) {
    s.pos[0] = x;
    s.pos[2] = z;
  }
  return result;
}

/** Push `s` out of every lit safe zone (radially, to just beyond the edge). True if it had to be moved. */
function clampOutsideSafeZones(c: Step, s: ShadeState): boolean {
  return guarded(c, s, () => clampRaw(c, s));
}

function clampRaw(c: Step, s: ShadeState): boolean {
  const lit = c.state.lanterns.filter((l) => hasSafeZone(l, c.tuning));
  const edge = c.tuning.safe_radius + SAFE_EDGE_MARGIN;
  let moved = false;
  // Repeat so that being pushed out of one zone cannot leave a shade inside an overlapping one.
  for (let pass = 0; pass <= lit.length; pass++) {
    let changed = false;
    for (const l of lit) {
      if (xzDist(s.pos, l.pos) >= c.tuning.safe_radius) continue;
      const [ux, uz] = unitXZ(l.pos, s.pos);
      s.pos[0] = l.pos[0] + ux * edge;
      s.pos[2] = l.pos[2] + uz * edge;
      changed = true;
    }
    if (!changed) break;
    moved = true;
  }
  return moved;
}

/** One forced step (pulse push / recoil), if any is left. */
function applyForcedStep(c: Step, s: ShadeState): void {
  if (s.forcedTicks <= 0) return;
  guarded(c, s, () => {
    s.pos[0] += s.forcedStep[0];
    s.pos[2] += s.forcedStep[1];
  });
  s.forcedTicks -= 1;
}

/** The lantern a wandering shade goes for: nearest lit lantern that is running low, else nearest unlit one. */
function wanderTargetLantern(c: Step, s: ShadeState): LanternState | null {
  const nearest = (candidates: LanternState[]): LanternState | null => {
    let best: LanternState | null = null;
    let bestD = Infinity;
    for (const l of [...candidates].sort((a, b) => compareIds(a.id, b.id))) {
      const d = xzDist(s.pos, l.pos);
      if (d < bestD) {
        best = l;
        bestD = d; // strict "<": the smaller id wins a tie
      }
    }
    return best;
  };
  const { lanterns } = c.state;
  return nearest(lanterns.filter((l) => l.lit && l.fuelUnits < c.fuel.low)) ?? nearest(lanterns.filter((l) => !l.lit));
}

/** Wander: head for a weak or unlit lantern if there is one (draining a weak one), else a random island point. */
function wander(c: Step, s: ShadeState): void {
  const lantern = wanderTargetLantern(c, s);
  if (lantern) {
    if (lantern.lit && xzDist(s.pos, lantern.pos) <= DRAIN_REACH) {
      s.state = 'drain';
      s.targetLanternId = lantern.id;
      s.drainTicks = 0;
      return;
    }
    guarded(c, s, () => moveToward(s.pos, lantern.pos, SHADE_WANDER_SPEED / TICK_RATE));
    clampOutsideSafeZones(c, s);
    return;
  }
  s.wanderTicks -= 1;
  if (s.wanderTarget === null || s.wanderTicks <= 0 || xzDist(s.pos, s.wanderTarget) <= SHADE_WANDER_REACHED) {
    if (c.level.night === 1) {
      const angle = c.rngs.shadeAi.range(0, 2 * Math.PI);
      const radius = SHADE_WANDER_RADIUS * Math.sqrt(c.rngs.shadeAi.next());
      s.wanderTarget = [radius * Math.cos(angle), 0, radius * Math.sin(angle)];
    } else {
      // Nights 2-3: one of the level's mote spawn points (always on ground).
      const points = c.level.moteSpawnPoints;
      s.wanderTarget = copy(points[c.rngs.shadeAi.int(0, points.length - 1)]!);
    }
    s.wanderTicks = SHADE_WANDER_REPICK_TICKS;
  }
  const target = s.wanderTarget;
  guarded(c, s, () => moveToward(s.pos, target, SHADE_WANDER_SPEED / TICK_RATE));
  if (clampOutsideSafeZones(c, s)) s.wanderTicks = 0;
}

/** Stage 8 for one shade. Night 1: Y never changes. Nights 2-3 (`terrainY`): the shade hovers over the ground below. */
function moveShade(c: Step, s: ShadeState): void {
  moveShadeXZ(c, s);
  if (c.level.terrainY) s.pos[1] = (c.level.groundAt(s.pos[0], s.pos[2]) ?? s.pos[1] - SHADE_HOVER_Y) + SHADE_HOVER_Y;
}

function moveShadeXZ(c: Step, s: ShadeState): void {
  const { tuning } = c;
  const p = c.state.player;

  if (s.evictTicks > 0) {
    // Out of the new safe zone, radially and harmlessly; nothing else moves it meanwhile.
    const edge = tuning.safe_radius + SAFE_EDGE_MARGIN;
    const [ux, uz] = unitXZ(s.evictFrom, s.pos);
    const remaining = edge - xzDist(s.pos, s.evictFrom);
    s.evictTicks -= 1;
    guarded(c, s, () => {
      if (s.evictTicks === 0 || s.evictStep >= remaining) {
        s.pos[0] = s.evictFrom[0] + ux * edge;
        s.pos[2] = s.evictFrom[2] + uz * edge;
        s.evictTicks = 0;
      } else {
        s.pos[0] += ux * s.evictStep;
        s.pos[2] += uz * s.evictStep;
      }
    });
    return;
  }

  if (s.state === 'spawning') {
    if (s.spawnTicks > 0) return; // still and harmless
    s.state = 'wander';
  }

  if (s.state === 'stunned') {
    applyForcedStep(c, s);
    if (s.stunTicks > 0) {
      clampOutsideSafeZones(c, s);
      return;
    }
    s.state = 'wander'; // the stun is over
  }

  if (s.state === 'drain') {
    // Draining: standing still. Mây close by breaks it into a chase; a healed, dead or too-far target ends it.
    const target = c.state.lanterns.find((l) => l.id === s.targetLanternId);
    if (p.fallWaitTicks === 0 && xzDist(s.pos, p.pos) <= DRAIN_BREAK_DIST) {
      s.state = 'chase';
    } else if (!target || !target.lit || target.fuelUnits >= c.fuel.low || xzDist(s.pos, target.pos) > DRAIN_REACH) {
      s.state = 'wander';
    } else {
      return;
    }
    s.targetLanternId = null;
    s.drainTicks = 0;
    s.wanderTarget = null;
  }

  if (s.state === 'recoil') {
    applyForcedStep(c, s);
    if (s.forcedTicks <= 0) s.state = 'wander'; // re-evaluated (chase?) from the next tick
    clampOutsideSafeZones(c, s);
    return;
  }

  // wander / chase: detection and loss are decided on the current distance, then the shade moves.
  const playerThere = p.fallWaitTicks === 0;
  const d = xzDist(s.pos, p.pos);
  if (s.state === 'wander' && playerThere && d <= SHADE_DETECT) {
    s.state = 'chase';
    s.wanderTarget = null;
    s.targetLanternId = null;
  } else if (s.state === 'chase' && (!playerThere || d > SHADE_LOSE)) {
    s.state = 'wander';
  }

  if (s.state === 'chase') {
    guarded(c, s, () => moveToward(s.pos, p.pos, c.level.shadeSpeed(tuning) / TICK_RATE));
    clampOutsideSafeZones(c, s);
  } else {
    wander(c, s);
  }
}

/** Stage 8: move every shade (in list order, so the shade_ai stream is drawn in a fixed order). */
function stageShades(c: Step): void {
  for (const s of c.state.shades) moveShade(c, s);
  stageDrifters(c);
}

/** Does this drifter want Mây's motes? She must be there, carry enough and be within detection range. */
function drifterWantsMay(c: Step, d: DrifterState): boolean {
  const p = c.state.player;
  return p.fallWaitTicks === 0 && p.carried >= DRIFTER_CHASE_CARRIED && xzDist(d.pos, p.pos) <= DRIFTER_DETECT;
}

/** Idle: drift towards a random mote spawn point (re-picked when null, reached or every DRIFTER_IDLE_REPICK_TICKS). */
function drifterIdleMove(c: Step, d: DrifterState): void {
  const points = c.level.moteSpawnPoints;
  d.idleTicks -= 1;
  if (d.idleTarget === null || d.idleTicks <= 0 || xzDist(d.pos, d.idleTarget) <= SHADE_WANDER_REACHED) {
    d.idleTarget = copy(points[c.rngs.drifters.int(0, points.length - 1)]!);
    d.idleTicks = DRIFTER_IDLE_REPICK_TICKS;
  }
  moveToward(d.pos, d.idleTarget, DRIFTER_IDLE_SPEED / TICK_RATE);
}

/** Stage 8, after all shades: drifters in ascending id. They fly over void and walls. */
function stageDrifters(c: Step): void {
  const { state, level } = c;
  const p = state.player;
  for (const d of [...state.drifters].sort((a, b) => compareIds(a.id, b.id))) {
    if (d.state === 'idle' && drifterWantsMay(c, d)) d.state = 'chase';
    else if (d.state === 'chase' && !drifterWantsMay(c, d)) d.state = 'idle';

    if (d.state === 'chase') {
      moveToward(d.pos, p.pos, DRIFTER_SPEED / TICK_RATE);
    } else if (d.state === 'idle') {
      drifterIdleMove(c, d);
    } else {
      const [ux, uz] = unitXZ(p.pos, d.pos);
      d.pos[0] += (ux * DRIFTER_SPEED) / TICK_RATE;
      d.pos[2] += (uz * DRIFTER_SPEED) / TICK_RATE;
      d.fleeTicks -= 1;
      if (d.fleeTicks <= 0) {
        state.drifters.splice(state.drifters.indexOf(d), 1);
        continue;
      }
    }
    if (level.terrainY) d.pos[1] = (level.groundAt(d.pos[0], d.pos[2]) ?? d.pos[1] - DRIFTER_HOVER_Y) + DRIFTER_HOVER_Y;
  }
}

/** Stage 9: the first eligible shade (lowest id) touching Mây hits her; at most one hit per tick. */
function stageHits(c: Step): void {
  if (c.bench) return;
  const { state, tuning } = c;
  const p = state.player;

  // Drifters first (lowest id): a chasing drifter touching Mây steals up to DRIFTER_STEAL_MAX motes and flees.
  // Invulnerability does not protect; a fall wait does.
  if (p.fallWaitTicks === 0) {
    for (const d of [...state.drifters].sort((a, b) => compareIds(a.id, b.id))) {
      if (d.state !== 'chase' || xzDist(d.pos, p.pos) > DRIFTER_HIT_RADIUS) continue;
      const amount = Math.min(DRIFTER_STEAL_MAX, p.carried);
      p.carried -= amount;
      d.stolen = amount;
      d.state = 'flee';
      d.fleeTicks = DRIFTER_FLEE_TICKS;
      c.events.push({ name: 'drifter_steal', data: { drifter_id: d.id, amount, carried: p.carried } });
    }
  }

  if (p.invulnTicks > 0 || p.fallWaitTicks > 0) return;

  const shade = ascending(state.shades).find(
    (s) =>
      (s.state === 'wander' || s.state === 'chase') &&
      s.evictTicks === 0 &&
      xzDist(s.pos, p.pos) <= tuning.shade_hit_radius &&
      Math.abs(p.pos[1] - s.pos[1]) <= SHADE_HIT_MAX_DY,
  );
  if (!shade) return;

  p.flames = Math.max(0, p.flames - 1);
  const dropped = Math.floor(p.carried * tuning.hit_drop_ratio);
  p.carried -= dropped;
  for (let i = 0; i < dropped; i++) {
    const angle = c.rngs.drops.range(0, 2 * Math.PI);
    const radius = c.rngs.drops.range(DROP_RING_MIN, DROP_RING_MAX);
    dropMote(c, p.pos[0] + radius * Math.cos(angle), p.pos[2] + radius * Math.sin(angle));
  }
  p.invulnTicks = c.ticks.invuln;

  const [ux, uz] = unitXZ(p.pos, shade.pos);
  shade.state = 'recoil';
  shade.forcedTicks = RECOIL_TICKS;
  shade.forcedStep = [(ux * RECOIL_DIST) / RECOIL_TICKS, (uz * RECOIL_DIST) / RECOIL_TICKS];
  c.events.push({ name: 'player_hit', data: { by: 'shade', flames: p.flames, dropped } });
}

/** Scheduled random mote: one free spawn point, unless the island already holds MOTE_CAP motes. */
function spawnMote(c: Step): void {
  const { state } = c;
  const active = state.motes.filter((m) => m.active);
  if (active.length >= MOTE_CAP) return;
  const free = c.level.moteSpawnPoints.filter((pt) => !active.some((m) => xzDist(pt, m.pos) <= MOTE_SPAWN_CLEARANCE));
  if (free.length === 0) return;
  const pt = free[c.rngs.spawn.int(0, free.length - 1)]!;
  state.motes.push({ id: `M${state.nextMoteNum++}`, pos: copy(pt), active: true, kind: 'random' });
}

/** Scheduled shades: each on a random spawn point far enough from Mây, outside every lit safe zone. */
function spawnShades(c: Step, count: number): void {
  const { state } = c;
  const lit = state.lanterns.filter((l) => hasSafeZone(l, c.tuning));
  const used: Vec3[] = [];
  for (let i = 0; i < count && state.shades.length < c.level.shadeMax; i++) {
    const valid = c.level.shadeSpawnPoints.filter(
      (pt) =>
        !used.includes(pt) &&
        xzDist(pt, state.player.pos) >= SHADE_SPAWN_MIN_DIST &&
        lit.every((l) => xzDist(pt, l.pos) >= c.tuning.safe_radius),
    );
    if (valid.length === 0) return; // none free: skip this spawn
    const pt = valid[c.rngs.shades.int(0, valid.length - 1)]!;
    used.push(pt);
    const id = `S${state.nextShadeNum++}`;
    state.shades.push(newShade(id, [pt[0], pt[1] + SHADE_HOVER_Y, pt[2]], 'spawning'));
    c.events.push({ name: 'shade_spawned', data: { id } });
  }
}

/** Stage 10: scheduled spawns. New entities only take part from the next tick. */
function stageSpawns(c: Step): void {
  if (c.bench) return;
  const t = c.state.simTick;
  if (c.randomMotes && t % MOTE_SPAWN_EVERY === 0) spawnMote(c);
  if (c.level.drifters && c.randomDrifters && t % DRIFTER_SPAWN_EVERY === 0 && c.state.drifters.length < DRIFTER_MAX) spawnDrifter(c);
  if (!c.randomShades) return;
  if (t === SHADE_FIRST_SPAWN) spawnShades(c, SHADE_FIRST_SPAWN_COUNT);
  else if (t > SHADE_FIRST_SPAWN && (t - SHADE_FIRST_SPAWN) % c.level.shadeSpawnEvery === 0) spawnShades(c, 1);
}

/** Scheduled drifter: idle, on a random misty-rim (shade spawn) point, hovering above it. No event. */
function spawnDrifter(c: Step): void {
  const { state, level } = c;
  const pt = level.shadeSpawnPoints[c.rngs.drifters.int(0, level.shadeSpawnPoints.length - 1)]!;
  state.drifters.push(newDrifter(`D${state.nextDrifterNum++}`, [pt[0], pt[1] + DRIFTER_HOVER_Y, pt[2]], 'idle', 0));
}

/** Stage 11: first match wins: no flames, then at dawn survive (enough lit lanterns) or lose. No early win. */
function stageEnd(c: Step): void {
  if (c.bench) return;
  const { state, tuning } = c;
  let outcome: Extract<GameEvent, { name: 'game_over' }>['data'] | null = null;
  if (state.player.flames <= 0) {
    outcome = { result: 'lost', reason: 'no_flames' };
  } else if (state.timeLeftS <= 0) {
    const lit = state.lanterns.filter((l) => l.lit);
    if (lit.length >= Math.ceil(tuning.win_ratio * state.lanterns.length)) {
      outcome = { result: 'won', reason: 'dawn_survived' };
      const perLantern = lit.reduce((sum, l) => sum + DAWN_PER_LIT_LANTERN + Math.floor(l.fuelUnits / UNITS_PER_FUEL), 0);
      state.score += perLantern + state.player.flames * tuning.score.per_flame_left;
    } else {
      outcome = { result: 'lost', reason: 'dawn' };
    }
  }
  if (!outcome) return;
  state.state = outcome.result;
  c.events.push({ name: 'game_over', data: outcome });
}

export function createGame(options: CreateGameOptions): Game {
  const tuning = options.tuning ?? TUNING;
  const extras = options.extras ?? [];
  const scenario = options.scenario ?? {};
  const level = getLevel(options.night ?? 1);
  const bench = options.bench === true;
  if (bench && level.night !== 1) throw new Error('bench mode is only available for Night 1');
  const state = buildState(options.seed, scenario, tuning, level);
  if (bench) applyBench(state, options.seed, tuning);
  const startTimeS = state.timeLeftS;
  const extrasRng = new Rng(options.seed, 'extras');
  for (const extra of extras) extra.onBuild?.(state, extrasRng);

  // One labelled stream per subsystem, so a change of draws in one never shifts the others.
  const rngs = {
    drops: new Rng(options.seed, 'drops'),
    shadeAi: new Rng(options.seed, 'shade_ai'),
    spawn: new Rng(options.seed, 'spawn'),
    shades: new Rng(options.seed, 'shades'),
    drifters: new Rng(options.seed, 'drifters'),
    wind: new Rng(options.seed, 'wind'),
  };
  const fuel = fuelUnitsOf(tuning);
  const ticks = { invuln: toTicks(tuning.invuln_s), stun: toTicks(tuning.pulse_stun_s), pulseCooldown: toTicks(tuning.pulse_cooldown_s) };

  function step(input: InputState): GameEvent[] {
    if (state.state !== 'playing') return [];

    const edges = risingEdges(state.prevButtons, input);
    const events: GameEvent[] = [];
    if (state.tick === 0) events.push({ name: 'night_start', data: { night: state.night } });
    state.tick += 1;
    if (edges.pause) {
      state.paused = !state.paused;
      events.push({ name: state.paused ? 'paused' : 'resumed', data: {} });
    }
    if (state.paused) {
      state.prevButtons = { jump: input.jump, interact: input.interact, pulse: input.pulse, dash: input.dash, pause: input.pause };
      return events;
    }
    state.simTick += 1;
    if (!bench) state.timeLeftS = startTimeS - state.simTick / TICK_RATE;

    // Stage 1: input edges. Stages 2-11 follow in the contract's fixed order; web and headless share this.
    const c: Step = {
      state,
      tuning,
      level,
      input,
      edges,
      events,
      ticks,
      rngs,
      randomMotes: scenario.randomMotes !== false,
      randomShades: scenario.randomShades !== false,
      randomDrifters: scenario.randomDrifters !== false,
      windEnabled: scenario.windEnabled !== false,
      bench,
      fuel,
      respawn: false,
      newlyLit: [],
    };
    stageCounters(c);
    stageLanternsOut(c);
    stageMovePlayer(c);
    stagePickup(c);
    stageInteract(c);
    stageSafeZones(c);
    stagePulse(c);
    stageShades(c);
    stageHits(c);
    stageSpawns(c);
    stageEnd(c);

    state.prevButtons = { jump: input.jump, interact: input.interact, pulse: input.pulse, dash: input.dash, pause: input.pause };
    for (const extra of extras) extra.onStep?.(state, input, extrasRng);
    return c.events;
  }

  function snapshot(): Snapshot {
    const r3 = (v: Vec3): Vec3 => [round3(v[0]), round3(v[1]), round3(v[2])];
    const activeMotes = state.motes.filter((m) => m.active);
    return {
      type: 'snapshot',
      tick: state.tick,
      sim_tick: state.simTick,
      night: state.night,
      state: state.paused ? 'paused' : state.state,
      time_left_s: round3(state.timeLeftS),
      score: state.score,
      wind: { active: state.wind.active, dir_deg: state.wind.active ? state.wind.dirDeg : 0 },
      player: {
        pos: r3(state.player.pos),
        vel: r3(state.player.vel),
        grounded: state.player.grounded,
        flames: state.player.flames,
        carried: state.player.carried,
        capacity: capacity(state, tuning),
        invuln: state.player.invulnTicks > 0,
        dash_cd_s: round3(state.player.dashCooldownTicks / TICK_RATE),
        pulse_cd_s: round3(state.player.pulseCooldownTicks / TICK_RATE),
        charm_s: round3(state.player.charmTicks / TICK_RATE),
      },
      lanterns: state.lanterns.map((l) => ({
        id: l.id,
        pos: r3(l.pos),
        lit: l.lit,
        deposited: l.deposited,
        fuel: l.lit ? fuelOut(l.fuelUnits) : 0,
        ever_lit: l.everLit,
        relit_count: l.relitCount,
      })),
      shades: state.shades.map((s) => ({ id: s.id, pos: r3(s.pos), state: s.state })),
      motes_active: activeMotes.length,
      motes: activeMotes.map((m) => ({
        id: m.id,
        pos: r3(m.pos),
        kind: m.kind,
        ttl_s: m.ttl !== undefined ? round3(m.ttl / TICK_RATE) : null,
      })),
      drifters: [...state.drifters]
        .sort((a, b) => compareIds(a.id, b.id))
        .map((d) => ({ id: d.id, pos: r3(d.pos), state: d.state, stolen: d.stolen })),
      charms: state.charms.map((c) => ({
        id: c.id,
        available: c.available,
        respawn_s: round3(c.respawnTicks / TICK_RATE),
      })),
    };
  }

  return { state, step, snapshot };
}
