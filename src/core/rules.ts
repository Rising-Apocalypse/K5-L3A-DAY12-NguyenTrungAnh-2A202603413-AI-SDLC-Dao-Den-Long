// Phase 1 rule constants. These are NOT contract tuning keys (those live in game.contract.json -> TUNING);
// they are fixed rule details of the standard Night 1 rules. All times are in ticks (60 per second), all
// distances in metres on the XZ plane unless a name says otherwise. See docs/notes/assumptions.md.

// --- motes -------------------------------------------------------------------------------------------------
/** Pickup needs |player.y - mote.y| <= this (XZ distance is checked against tuning.pickup_radius). */
export const PICKUP_MAX_DY = 1.5;
/** Random spawns stop while this many motes are active (dropped motes count, but are never blocked by it). */
export const MOTE_CAP = 30;
/** A random mote spawns at ticks 240, 480, ... */
export const MOTE_SPAWN_EVERY = 240;
/** A spawn point is "taken" when an active mote lies within this distance of it. */
export const MOTE_SPAWN_CLEARANCE = 0.01;
/** Motes dropped by a hit land on a ring [min, max] around the player. */
export const DROP_RING_MIN = 1.5;
export const DROP_RING_MAX = 2.5;
/** A dropped mote disappears after this many ticks. */
export const DROP_TTL = 480;

// --- shade spawning ----------------------------------------------------------------------------------------
/** Tick of the first shade spawn (2 shades), then 1 shade every SHADE_SPAWN_EVERY ticks after it. */
export const SHADE_FIRST_SPAWN = 300;
export const SHADE_FIRST_SPAWN_COUNT = 2;
export const SHADE_SPAWN_EVERY = 480;
/** No more shade spawns while this many shades exist. */
export const SHADE_MAX = 6;
/** A spawn point must be at least this far from the player (XZ). */
export const SHADE_SPAWN_MIN_DIST = 15;
/** A freshly spawned shade stays still and harmless in the `spawning` state for this long. */
export const SHADE_SPAWNING_TICKS = 30;

// --- shade behaviour ---------------------------------------------------------------------------------------
/** A wandering shade starts chasing when the player is this close / a chasing shade gives up beyond SHADE_LOSE. */
export const SHADE_DETECT = 12;
export const SHADE_LOSE = 18;
export const SHADE_WANDER_SPEED = 2.0;
/** A wander target is re-picked when the shade is this close to it ... */
export const SHADE_WANDER_REACHED = 1;
/** ... or after this many ticks. */
export const SHADE_WANDER_REPICK_TICKS = 180;
/** Wander targets are random points inside this radius around the island centre. */
export const SHADE_WANDER_RADIUS = 35;
/** A hit also needs |player.y - shade.y| <= this (XZ distance is checked against tuning.shade_hit_radius). */
export const SHADE_HIT_MAX_DY = 1.5;
/** After hitting the player a shade backs off RECOIL_DIST metres over RECOIL_TICKS ticks, harmless. */
export const RECOIL_DIST = 2;
export const RECOIL_TICKS = 60;
/**
 * A shade pushed out of a safe zone is placed this far beyond the circle, so the 3-decimal rounding of the output
 * can never make it look inside.
 */
export const SAFE_EDGE_MARGIN = 0.001;
/** A shade inside a freshly lit safe zone is moved to the zone edge within this many ticks, harmless meanwhile. */
export const EVICT_MAX_TICKS = 30;

// --- pulse -------------------------------------------------------------------------------------------------
/** The pulse is centred this far above the player's feet (3D distance to shade centres). */
export const PULSE_CENTER_DY = 0.8;
/** The push (tuning.pulse_push_m in total) is spread evenly over the first PULSE_PUSH_TICKS ticks of the stun. */
export const PULSE_PUSH_TICKS = 15;

// --- falling -----------------------------------------------------------------------------------------------
/** Falling below this height costs a flame. */
export const FALL_Y = -10;
/** After a fall the player waits this long (frozen, no actions), then respawns at the start with invulnerability. */
export const FALL_WAIT_TICKS = 60;

/** Two XZ points closer than this count as the same point (direction falls back to +X). */
export const COINCIDENT_EPS = 1e-9;

// --- Phase 2 (Contract v1.1) ---------------------------------------------------------------------------------
/** Run speed while the wind charm is active. */
export const CHARM_RUN_SPEED = 7.2;
/** Charm effect duration, and the time until a picked charm is available again. */
export const CHARM_TICKS = 600;
export const CHARM_RESPAWN_TICKS = 2700;
/** Charm pickup needs |player.y - charm.y| <= this (XZ distance uses tuning.pickup_radius). */
export const CHARM_PICKUP_MAX_DY = 1.5;

// --- Phase 3 (Contract v1.2) ---------------------------------------------------------------------------------
export const RELIGHT_SCORE = 40;
export const DRAIN_STUN_BONUS = 10;
export const DAWN_PER_LIT_LANTERN = 50;
export const DRAIN_REACH = 2.0;
export const DRAIN_BREAK_DIST = 6.0;
export const FUEL_EVENT_EVERY = 60;

