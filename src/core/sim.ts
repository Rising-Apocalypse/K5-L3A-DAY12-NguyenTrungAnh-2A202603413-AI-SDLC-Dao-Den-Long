import { FormatError } from './errors';
import { compareIds, dist3, moveToward, unitXZ, xzDist } from './geom';
import { risingEdges, worldMove } from './input';
import {
  GRAVITY,
  ISLAND_RADIUS,
  JUMP_SPEED,
  MOTE_SPAWN_POINTS,
  PLAYER_START,
  PLAYER_START_FACING,
  SHADE_HOVER_Y,
  SHADE_SPAWN_POINTS,
  buildLanterns,
  buildMotes,
} from './level';
import { Rng } from './rng';
import { round3 } from './round';
import {
  DROP_RING_MAX,
  DROP_RING_MIN,
  DROP_TTL,
  EVICT_MAX_TICKS,
  FALL_WAIT_TICKS,
  FALL_Y,
  MOTE_CAP,
  MOTE_SPAWN_CLEARANCE,
  MOTE_SPAWN_EVERY,
  PICKUP_MAX_DY,
  PULSE_CENTER_DY,
  PULSE_PUSH_TICKS,
  RECOIL_DIST,
  RECOIL_TICKS,
  SAFE_EDGE_MARGIN,
  SHADE_DETECT,
  SHADE_FIRST_SPAWN,
  SHADE_FIRST_SPAWN_COUNT,
  SHADE_HIT_MAX_DY,
  SHADE_LOSE,
  SHADE_MAX,
  SHADE_SPAWNING_TICKS,
  SHADE_SPAWN_EVERY,
  SHADE_SPAWN_MIN_DIST,
  SHADE_WANDER_RADIUS,
  SHADE_WANDER_REACHED,
  SHADE_WANDER_REPICK_TICKS,
  SHADE_WANDER_SPEED,
} from './rules';
import type { Scenario } from './scenario';
import { TUNING, type Tuning } from './tuning';
import type {
  Buttons,
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
  scenario?: Scenario;
  tuning?: Tuning;
  /** Web only. The headless CLI never passes extras. */
  extras?: readonly Extra[];
}

export interface Game {
  readonly state: GameState;
  /** Advance exactly one tick using this tick's input. Returns the events that happened during the step. */
  step(input: InputState): GameEvent[];
  /** Contract-shaped snapshot of the current state (coordinates rounded to 3 decimals). */
  snapshot(): Snapshot;
}

const copy = (v: Vec3): Vec3 => [v[0], v[1], v[2]];

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
  };
}

/** Listed shades keep their `id`; the rest get the lowest unused S<n>, in listed order. */
function assignShades(listed: NonNullable<Scenario['shades']>): ShadeState[] {
  const used = new Set(listed.flatMap((s) => (s.id !== undefined ? [s.id] : [])));
  let n = 1;
  return listed.map((s) => {
    let id = s.id;
    if (id === undefined) {
      while (used.has(`S${n}`)) n++;
      id = `S${n}`;
      used.add(id);
    }
    // Listed shades start in their normal active state (not `spawning`); the given position is used verbatim.
    return newShade(id, copy(s.pos), 'wander');
  });
}

/** Default level for the seed, then the scenario applied on top. Emits no events and awards no points. */
function buildState(seed: number, scenario: Scenario, tuning: Tuning): GameState {
  const lanterns = buildLanterns();
  if (lanterns.length !== tuning.lantern_count_night1) {
    throw new Error(`level has ${lanterns.length} lanterns but tuning.lantern_count_night1 is ${tuning.lantern_count_night1}`);
  }
  let motes = scenario.randomMotes === false ? [] : buildMotes(seed);
  // The standard Night 1 map starts with no shades: they spawn on a schedule (stageSpawns).
  let shades: ShadeState[] = [];

  if (scenario.motes) {
    motes = scenario.motes.map((pos, i) => ({ id: `M${i + 1}`, pos: copy(pos), active: true }));
  }
  if (scenario.shades) shades = assignShades(scenario.shades);

  for (const patch of scenario.lanterns ?? []) {
    const lantern = lanterns.find((l) => l.id === patch.id);
    if (!lantern) throw new FormatError(`scenario: unknown lantern id "${patch.id}"`);
    if (patch.pos) lantern.pos = copy(patch.pos);
    if (patch.lit !== undefined) lantern.lit = patch.lit;
    if (patch.deposited !== undefined) lantern.deposited = patch.deposited;
  }
  // Lanterns lit by the scenario are lit from tick 0: shades standing inside them are evicted from step 0.
  for (const lantern of lanterns) {
    if (lantern.lit) for (const shade of shades) evictIfInside(shade, lantern, tuning);
  }

  const pos = copy(scenario.player?.pos ?? PLAYER_START);
  return {
    tick: 0,
    simTick: 0,
    state: 'playing',
    timeLeftS: scenario.timeLeftS ?? tuning.night1_duration_s,
    score: 0,
    player: {
      pos,
      vel: [0, 0, 0],
      facing: [PLAYER_START_FACING[0], PLAYER_START_FACING[1]],
      flames: scenario.player?.flames ?? tuning.flames,
      carried: scenario.player?.carried ?? 0,
      grounded: pos[1] <= 0 && isOverIsland(pos),
      invulnTicks: 0,
      pulseCooldownTicks: 0,
      fallWaitTicks: 0,
    },
    lanterns,
    shades,
    motes,
    prevButtons: { jump: false, interact: false, pulse: false, dash: false },
    nextShadeNum: Math.max(0, ...shades.map((s) => idNumber(s.id, 'S'))) + 1,
    nextMoteNum: Math.max(0, ...motes.map((m) => idNumber(m.id, 'M'))) + 1,
  };
}

/** The ground exists only while the XZ position is within ISLAND_RADIUS of the centre. */
function isOverIsland(pos: Vec3): boolean {
  return Math.hypot(pos[0], pos[2]) <= ISLAND_RADIUS;
}

// --- one tick: stages 1-11 of docs/plans/01-phase1-gameplay.md ----------------------------------------------

/** Everything the stage functions of one step share. */
interface Step {
  readonly state: GameState;
  readonly tuning: Tuning;
  readonly input: InputState;
  /** Rising edges of the buttons this tick (stage 1). */
  readonly edges: Buttons;
  readonly events: GameEvent[];
  readonly ticks: { readonly invuln: number; readonly stun: number; readonly pulseCooldown: number };
  readonly rngs: { readonly drops: Rng; readonly shadeAi: Rng; readonly spawn: Rng; readonly shades: Rng };
  readonly randomMotes: boolean;
  readonly randomShades: boolean;
  /** Set by stage 2 when the fall-wait ends this tick; stage 3 then respawns Mây instead of moving her. */
  respawn: boolean;
  /** Lanterns lit by stage 5 this tick, for stage 6. */
  newlyLit: LanternState[];
}

/** Shades in ascending id order (the order used for pulse targets and hits). */
const ascending = (shades: readonly ShadeState[]): ShadeState[] => [...shades].sort((a, b) => compareIds(a.id, b.id));

/** Stage 2: count every timer down by one tick. */
function stageCounters(c: Step): void {
  const { player: p, shades, motes } = c.state;
  if (p.pulseCooldownTicks > 0) p.pulseCooldownTicks -= 1;
  if (p.invulnTicks > 0) p.invulnTicks -= 1;
  if (p.fallWaitTicks > 0) {
    p.fallWaitTicks -= 1;
    c.respawn = p.fallWaitTicks === 0;
  }
  for (const s of shades) {
    if (s.spawnTicks > 0) s.spawnTicks -= 1;
    if (s.stunTicks > 0) s.stunTicks -= 1;
  }
  for (const m of motes) {
    if (m.active && m.ttl !== undefined) {
      m.ttl -= 1;
      if (m.ttl <= 0) m.active = false;
    }
  }
}

/** Stage 3: walk / jump / gravity, then the fall check. Mây is frozen while she waits to respawn. */
function stageMovePlayer(c: Step): void {
  const { state, tuning, input } = c;
  const p = state.player;
  if (p.fallWaitTicks > 0) return;
  if (c.respawn) {
    // Back at the start, standing still, invulnerable for a moment (no movement on the respawn tick itself).
    p.pos[0] = PLAYER_START[0];
    p.pos[1] = PLAYER_START[1];
    p.pos[2] = PLAYER_START[2];
    p.vel = [0, 0, 0];
    p.grounded = true;
    p.invulnTicks = c.ticks.invuln;
    return;
  }

  // Velocity is set instantly (full air control). There is no edge clamp: past ISLAND_RADIUS there is no
  // ground and the player simply keeps falling (unless falling is switched off, see below).
  const [dx, dz] = worldMove(input.move, input.camYawDeg);
  p.vel[0] = dx * tuning.player_speed;
  p.vel[2] = dz * tuning.player_speed;
  p.pos[0] += p.vel[0] * DT;
  p.pos[2] += p.vel[2] * DT;
  const len = Math.hypot(dx, dz);
  if (len > 0) p.facing = [dx / len, dz / len];

  if (!tuning.fall_enabled) {
    // Without a fall penalty the island edge is a wall.
    const r = Math.hypot(p.pos[0], p.pos[2]);
    if (r > ISLAND_RADIUS) {
      p.pos[0] *= ISLAND_RADIUS / r;
      p.pos[2] *= ISLAND_RADIUS / r;
    }
  }

  if (c.edges.jump && p.grounded) {
    p.vel[1] = JUMP_SPEED;
    p.grounded = false;
  }

  const overIsland = isOverIsland(p.pos);
  if (p.grounded && !overIsland) p.grounded = false; // walked off the edge
  if (!p.grounded) {
    // Exact integration for constant gravity (so the jump apex is exactly JUMP_SPEED^2 / (2 * GRAVITY)).
    const prevY = p.pos[1];
    p.pos[1] += p.vel[1] * DT - 0.5 * GRAVITY * DT * DT;
    p.vel[1] -= GRAVITY * DT;
    if (overIsland && prevY >= 0 && p.pos[1] <= 0) {
      p.pos[1] = 0;
      p.vel[1] = 0;
      p.grounded = true;
    }
  }

  if (tuning.fall_enabled && p.pos[1] < FALL_Y) {
    // Once per fall (Mây is frozen afterwards) and regardless of invulnerability: lose a flame and everything
    // carried. In v1.0 the event's `dropped` reports the motes lost.
    p.flames = Math.max(0, p.flames - 1);
    const lost = p.carried;
    p.carried = 0;
    c.events.push({ name: 'player_hit', data: { by: 'fall', flames: p.flames, dropped: lost } });
    if (p.flames > 0) p.fallWaitTicks = FALL_WAIT_TICKS; // with no flame left the game ends in stage 11
  }
}

/** Stage 4: pick up motes in reach, lowest id first, while there is room to carry them. */
function stagePickup(c: Step): void {
  const { state, tuning } = c;
  const p = state.player;
  if (p.fallWaitTicks > 0) return;
  for (const m of state.motes) {
    if (p.carried >= tuning.carry_capacity) return;
    if (!m.active) continue;
    if (xzDist(p.pos, m.pos) > tuning.pickup_radius || Math.abs(p.pos[1] - m.pos[1]) > PICKUP_MAX_DY) continue;
    m.active = false;
    p.carried += 1;
    c.events.push({ name: 'mote_picked', data: { carried: p.carried } });
  }
}

/** Stage 5: on the interact edge, pour carried motes into the nearest unlit lantern within reach. */
function stageInteract(c: Step): void {
  const { state, tuning } = c;
  const p = state.player;
  if (!c.edges.interact || p.fallWaitTicks > 0) return;

  let target: LanternState | null = null;
  let best = Infinity;
  for (const l of [...state.lanterns].sort((a, b) => compareIds(a.id, b.id))) {
    if (l.lit) continue;
    const d = xzDist(p.pos, l.pos);
    if (d <= tuning.interact_radius && d < best) {
      target = l;
      best = d; // strict "<": on a tie the smaller id (visited first) stays
    }
  }
  if (!target) return;

  const amount = Math.min(p.carried, tuning.lantern_cost - target.deposited);
  if (amount <= 0) return;
  p.carried -= amount;
  target.deposited += amount;
  state.score += amount * tuning.score.per_mote;
  c.events.push({ name: 'deposit', data: { lantern_id: target.id, amount, deposited: target.deposited } });
  if (target.deposited === tuning.lantern_cost) {
    target.lit = true;
    state.score += tuning.score.per_lantern;
    c.newlyLit.push(target);
    c.events.push({ name: 'lantern_lit', data: { lantern_id: target.id } });
  }
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
    s.state = 'stunned';
    s.stunTicks = c.ticks.stun; // a stunned shade is simply refreshed
    s.forcedTicks = PULSE_PUSH_TICKS; // the push restarts; it also replaces a recoil in progress
    s.forcedStep = [ux * push, uz * push];
    s.evictTicks = 0;
    state.score += tuning.score.per_stun;
  }
  c.events.push({ name: 'pulse', data: { stunned_ids: targets.map((s) => s.id) } });
}

/** Push `s` out of every lit safe zone (radially, to just beyond the edge). True if it had to be moved. */
function clampOutsideSafeZones(c: Step, s: ShadeState): boolean {
  const lit = c.state.lanterns.filter((l) => l.lit);
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
function applyForcedStep(s: ShadeState): void {
  if (s.forcedTicks <= 0) return;
  s.pos[0] += s.forcedStep[0];
  s.pos[2] += s.forcedStep[1];
  s.forcedTicks -= 1;
}

/** Wander: walk to a random island point, re-picking it when reached, after a while, or when a safe zone blocks. */
function wander(c: Step, s: ShadeState): void {
  s.wanderTicks -= 1;
  if (s.wanderTarget === null || s.wanderTicks <= 0 || xzDist(s.pos, s.wanderTarget) <= SHADE_WANDER_REACHED) {
    const angle = c.rngs.shadeAi.range(0, 2 * Math.PI);
    const radius = SHADE_WANDER_RADIUS * Math.sqrt(c.rngs.shadeAi.next());
    s.wanderTarget = [radius * Math.cos(angle), 0, radius * Math.sin(angle)];
    s.wanderTicks = SHADE_WANDER_REPICK_TICKS;
  }
  moveToward(s.pos, s.wanderTarget, SHADE_WANDER_SPEED / TICK_RATE);
  if (clampOutsideSafeZones(c, s)) s.wanderTicks = 0;
}

/** Stage 8 for one shade. Y never changes: a shade keeps its own height. */
function moveShade(c: Step, s: ShadeState): void {
  const { tuning } = c;
  const p = c.state.player;

  if (s.evictTicks > 0) {
    // Out of the new safe zone, radially and harmlessly; nothing else moves it meanwhile.
    const edge = tuning.safe_radius + SAFE_EDGE_MARGIN;
    const [ux, uz] = unitXZ(s.evictFrom, s.pos);
    const remaining = edge - xzDist(s.pos, s.evictFrom);
    s.evictTicks -= 1;
    if (s.evictTicks === 0 || s.evictStep >= remaining) {
      s.pos[0] = s.evictFrom[0] + ux * edge;
      s.pos[2] = s.evictFrom[2] + uz * edge;
      s.evictTicks = 0;
    } else {
      s.pos[0] += ux * s.evictStep;
      s.pos[2] += uz * s.evictStep;
    }
    return;
  }

  if (s.state === 'spawning') {
    if (s.spawnTicks > 0) return; // still and harmless
    s.state = 'wander';
  }

  if (s.state === 'stunned') {
    applyForcedStep(s);
    if (s.stunTicks > 0) {
      clampOutsideSafeZones(c, s);
      return;
    }
    s.state = 'wander'; // the stun is over
  }

  if (s.state === 'recoil') {
    applyForcedStep(s);
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
  } else if (s.state === 'chase' && (!playerThere || d > SHADE_LOSE)) {
    s.state = 'wander';
  }

  if (s.state === 'chase') {
    moveToward(s.pos, p.pos, tuning.shade_speed / TICK_RATE);
    clampOutsideSafeZones(c, s);
  } else {
    wander(c, s);
  }
}

/** Stage 8: move every shade (in list order, so the shade_ai stream is drawn in a fixed order). */
function stageShades(c: Step): void {
  for (const s of c.state.shades) moveShade(c, s);
}

/** Stage 9: the first eligible shade (lowest id) touching Mây hits her; at most one hit per tick. */
function stageHits(c: Step): void {
  const { state, tuning } = c;
  const p = state.player;
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
    state.motes.push({
      id: `M${state.nextMoteNum++}`,
      pos: [p.pos[0] + radius * Math.cos(angle), 0, p.pos[2] + radius * Math.sin(angle)],
      active: true,
      ttl: DROP_TTL,
    });
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
  const free = MOTE_SPAWN_POINTS.filter((pt) => !active.some((m) => xzDist(pt, m.pos) <= MOTE_SPAWN_CLEARANCE));
  if (free.length === 0) return;
  const pt = free[c.rngs.spawn.int(0, free.length - 1)]!;
  state.motes.push({ id: `M${state.nextMoteNum++}`, pos: copy(pt), active: true });
}

/** Scheduled shades: each on a random spawn point far enough from Mây, outside every lit safe zone. */
function spawnShades(c: Step, count: number): void {
  const { state } = c;
  const lit = state.lanterns.filter((l) => l.lit);
  const used: Vec3[] = [];
  for (let i = 0; i < count && state.shades.length < SHADE_MAX; i++) {
    const valid = SHADE_SPAWN_POINTS.filter(
      (pt) =>
        !used.includes(pt) &&
        xzDist(pt, state.player.pos) >= SHADE_SPAWN_MIN_DIST &&
        lit.every((l) => xzDist(pt, l.pos) >= c.tuning.safe_radius),
    );
    if (valid.length === 0) return; // none free: skip this spawn
    const pt = valid[c.rngs.shades.int(0, valid.length - 1)]!;
    used.push(pt);
    const id = `S${state.nextShadeNum++}`;
    state.shades.push(newShade(id, [pt[0], SHADE_HOVER_Y, pt[2]], 'spawning'));
    c.events.push({ name: 'shade_spawned', data: { id } });
  }
}

/** Stage 10: scheduled spawns. New entities only take part from the next tick. */
function stageSpawns(c: Step): void {
  const t = c.state.simTick;
  if (c.randomMotes && t % MOTE_SPAWN_EVERY === 0) spawnMote(c);
  if (!c.randomShades) return;
  if (t === SHADE_FIRST_SPAWN) spawnShades(c, SHADE_FIRST_SPAWN_COUNT);
  else if (t > SHADE_FIRST_SPAWN && (t - SHADE_FIRST_SPAWN) % SHADE_SPAWN_EVERY === 0) spawnShades(c, 1);
}

/** Stage 11: first match wins: no flames, all lanterns lit, dawn. */
function stageEnd(c: Step): void {
  const { state, tuning } = c;
  let outcome: Extract<GameEvent, { name: 'game_over' }>['data'] | null = null;
  if (state.player.flames <= 0) {
    outcome = { result: 'lost', reason: 'no_flames' };
  } else if (state.lanterns.every((l) => l.lit)) {
    outcome = { result: 'won', reason: 'all_lit' };
    state.score += Math.max(0, Math.floor(state.timeLeftS)) * tuning.score.per_second_left + state.player.flames * tuning.score.per_flame_left;
  } else if (state.timeLeftS <= 0) {
    outcome = { result: 'lost', reason: 'dawn' };
  }
  if (!outcome) return;
  state.state = outcome.result;
  c.events.push({ name: 'game_over', data: outcome });
}

export function createGame(options: CreateGameOptions): Game {
  const tuning = options.tuning ?? TUNING;
  const extras = options.extras ?? [];
  const scenario = options.scenario ?? {};
  const state = buildState(options.seed, scenario, tuning);
  const startTimeS = state.timeLeftS;
  const extrasRng = new Rng(options.seed, 'extras');
  for (const extra of extras) extra.onBuild?.(state, extrasRng);

  // One labelled stream per subsystem, so a change of draws in one never shifts the others.
  const rngs = {
    drops: new Rng(options.seed, 'drops'),
    shadeAi: new Rng(options.seed, 'shade_ai'),
    spawn: new Rng(options.seed, 'spawn'),
    shades: new Rng(options.seed, 'shades'),
  };
  const ticks = { invuln: toTicks(tuning.invuln_s), stun: toTicks(tuning.pulse_stun_s), pulseCooldown: toTicks(tuning.pulse_cooldown_s) };

  function step(input: InputState): GameEvent[] {
    if (state.state !== 'playing') return [];

    state.tick += 1;
    state.simTick += 1;
    state.timeLeftS = startTimeS - state.simTick / TICK_RATE;

    // Stage 1: input edges. Stages 2-11 follow in the contract's fixed order; web and headless share this.
    const c: Step = {
      state,
      tuning,
      input,
      edges: risingEdges(state.prevButtons, input),
      events: [],
      ticks,
      rngs,
      randomMotes: scenario.randomMotes !== false,
      randomShades: scenario.randomShades !== false,
      respawn: false,
      newlyLit: [],
    };
    stageCounters(c);
    stageMovePlayer(c);
    stagePickup(c);
    stageInteract(c);
    stageSafeZones(c);
    stagePulse(c);
    stageShades(c);
    stageHits(c);
    stageSpawns(c);
    stageEnd(c);

    state.prevButtons = { jump: input.jump, interact: input.interact, pulse: input.pulse, dash: input.dash };
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
      state: state.state,
      time_left_s: round3(state.timeLeftS),
      score: state.score,
      player: { pos: r3(state.player.pos), flames: state.player.flames, carried: state.player.carried },
      lanterns: state.lanterns.map((l) => ({ id: l.id, pos: r3(l.pos), lit: l.lit, deposited: l.deposited })),
      shades: state.shades.map((s) => ({ id: s.id, pos: r3(s.pos), state: s.state })),
      motes_active: activeMotes.length,
      motes: activeMotes.map((m) => ({ id: m.id, pos: r3(m.pos) })),
    };
  }

  return { state, step, snapshot };
}
