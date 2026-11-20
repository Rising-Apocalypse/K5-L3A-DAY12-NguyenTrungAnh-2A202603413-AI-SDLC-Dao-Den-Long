import {
  AdditiveBlending,
  AmbientLight,
  BackSide,
  BoxGeometry,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  ExtrudeGeometry,
  Fog,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  RingGeometry,
  Scene,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Object3D,
  Vector3,
  WebGLRenderer,
} from 'three';
import { ISLAND_RADIUS } from '../core/level';
import { getLevel } from '../core/levels';
import { SHADE_SPAWNING_TICKS } from '../core/rules';
import { TICK_RATE } from '../core/sim';
import { TUNING } from '../core/tuning';
import type { CharmState, DrifterState, GameEvent, GameState, ShadeState, Vec3 } from '../core/types';
import { isColorBlind } from './colorblind';

// Palette of Plan 01.
const SKY = 0x0e1430;
const FOG = 0x1b2350;
const GRASS = 0x2f5d50;
const SAND = 0xc9b48a;
const WOOD = 0x6b4a2f;
const CLOUD_SEA = 0x12384a;
const LANTERN_LIT = 0xffb347;
const LANTERN_CORE = 0xffe9b0;
const LANTERN_UNLIT = 0x5b5f6e;
const MOTE_CORE = 0xfff6c2;
const MOTE_HALO = 0xffe58a;
const SHADE_BODY = 0x120a1a;
const SHADE_RIM = 0x7a3cff;
const SHADE_RIM_CB = 0x00b3ff;
const FUEL_BAR_LOW = 0xff5a5f;
const FUEL_BAR_LOW_CB = 0xffffff;
const SHADE_STUNNED = 0x3a3450;
const MAY_ROBE = 0xe8e2d0;
const MAY_SCARF = 0xc8102e;
const GOLD = 0xf2c14e;
const CHARM_RED = 0xc8102e;
const DRIFTER = 0x8fa3b8;
const LEAF = 0x9bbd5a;
const TEAR = 0x15151d;
const BRIDGE_WOOD = 0x6b4a2f;

const CAMERA_DISTANCE = 9;
const CAMERA_HEIGHT = 5;
const MOTE_HOVER_Y = 0.5;
const LAMP_Y = 3.4;
const BEACH_WIDTH = 4;
/** Fuel bar above a lit lantern: total width and height in metres. */
const BAR_WIDTH = 2;
const BAR_HEIGHT = 0.2;
/** An unlit lantern is drawn this much lower than a lit one. */
const UNLIT_SCALE_Y = 0.8;
/** Light of the whole island: 0.15 with every lantern dark, +0.55 when all are lit. */
const AMBIENT_BASE = 0.15;
const AMBIENT_GAIN = 0.55;
/** A dropped mote blinks during its last second. */
const MOTE_BLINK_TICKS = TICK_RATE;
/** The pulse ring grows to pulse_radius in this long (seconds). */
const PULSE_EFFECT_S = 0.45;
/** How fast the ambient light follows its target (1/s). */
const AMBIENT_LERP = 3;
/** Wind leaves: at most 160 instances (cap is 200), a 60 m box that follows Mây. */
const LEAF_MAX = 160;
const LEAF_BOX = 60;
const LEAF_HEIGHT = 12;
const WIND_SPEED_VIEW = 14;
const GUIDE_SPRITES = 12;

interface LanternView {
  group: Group;
  lamp: Mesh;
  light: PointLight;
  zone: Mesh;
  bar: Group;
  barFill: Mesh;
  tear: Mesh;
}
interface CharmView {
  group: Group;
}
interface DrifterView {
  group: Group;
  geometry: PlaneGeometry;
  base: Float32Array;
  material: MeshBasicMaterial;
}
interface ShadeView {
  group: Group;
  body: Mesh;
  rim: Mesh;
}
interface MoteView {
  group: Group;
  core: Mesh;
  halo: Mesh;
}
interface PulseEffect {
  mesh: Mesh;
  born: number;
}

/** Three.js view of a GameState. Read-only: it never changes the game. */
export function createRenderer(canvas: HTMLCanvasElement) {
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new Scene();
  scene.background = new Color(SKY);
  scene.fog = new Fog(FOG, 35, 130);

  const ambient = new AmbientLight(0x8a94d8, AMBIENT_BASE);
  const moon = new DirectionalLight(0x9aa8ff, 0.5);
  moon.position.set(-20, 40, -10);
  scene.add(ambient, moon);

  // The sea of clouds far below (shared by every night).
  const clouds = new Mesh(new PlaneGeometry(600, 600), new MeshStandardMaterial({ color: CLOUD_SEA, roughness: 1 }));
  clouds.rotation.x = -Math.PI / 2;
  clouds.position.y = -14;
  scene.add(clouds);

  // Materials shared by every island piece of every night (never disposed).
  const woodMat = new MeshStandardMaterial({ color: WOOD, roughness: 1 });
  const grassMat = new MeshStandardMaterial({ color: GRASS, roughness: 1 });
  const sandMat = new MeshStandardMaterial({ color: SAND, roughness: 1 });
  const bridgeMat = new MeshStandardMaterial({ color: BRIDGE_WOOD, roughness: 1 });
  const towerMat = new MeshStandardMaterial({ color: 0x8a6a48, roughness: 1 });
  const bellMat = new MeshStandardMaterial({ color: GOLD, roughness: 0.4, metalness: 0.4 });
  const rampMat = new MeshStandardMaterial({ color: SAND, roughness: 1 });

  const padMaterials: MeshBasicMaterial[] = [];
  let world: Group | null = null;
  let currentNight = 0;

  /** A grass disc with sand beach whose top surface is at `topY`, on a rock cylinder `thickness` deep. */
  function islandDisc(radius: number, topY: number, thickness: number): Group {
    const g = new Group();
    const rock = new Mesh(new CylinderGeometry(radius, radius * 0.8, thickness, 64), woodMat);
    rock.position.y = topY - thickness / 2 - 0.02;
    const grass = new Mesh(new CircleGeometry(radius, 64), grassMat);
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = topY;
    const beach = new Mesh(new RingGeometry(radius - BEACH_WIDTH, radius, 64), sandMat);
    beach.rotation.x = -Math.PI / 2;
    beach.position.y = topY + 0.01;
    g.add(rock, grass, beach);
    return g;
  }

  function addPads(g: Group, pads: readonly { center: Vec3 }[]): void {
    const geometry = new CircleGeometry(1, 32);
    for (const pad of pads) {
      const mat = new MeshBasicMaterial({ color: LANTERN_CORE, transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
      padMaterials.push(mat);
      const m = new Mesh(geometry, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(pad.center[0], pad.center[1] + 0.05, pad.center[2]);
      const ring = new Mesh(new RingGeometry(1, 1.25, 32), new MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
      padMaterials.push(ring.material as MeshBasicMaterial);
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(m.position);
      g.add(m, ring);
    }
  }

  function buildWorld(night: 1 | 2 | 3): Group {
    const g = new Group();
    const level = getLevel(night);
    if (night === 1) {
      g.add(islandDisc(ISLAND_RADIUS, 0, 6));
    } else if (night === 2) {
      const a = islandDisc(28, 0, 6);
      const b = islandDisc(28, 0, 6);
      b.position.x = 70;
      // Bamboo bridge x 26..44, z -2..2, no rails.
      const bridge = new Mesh(new BoxGeometry(18, 0.3, 4), bridgeMat);
      bridge.position.set(35, -0.17, 0);
      g.add(a, b, bridge);
    } else {
      g.add(islandDisc(45, 0, 6));
      // Tier 1: half annulus (z > 0, r 12..24), top at y 3.
      const shape = new Shape();
      shape.absarc(0, 0, 24, 0, Math.PI, false);
      shape.lineTo(-12, 0);
      shape.absarc(0, 0, 12, Math.PI, 0, true);
      shape.closePath();
      const tier1Geometry = new ExtrudeGeometry(shape, { depth: 3, bevelEnabled: false, curveSegments: 32 });
      tier1Geometry.rotateX(Math.PI / 2); // shape y>0 -> z>0, extrusion goes down from y = 0
      const tier1 = new Mesh(tier1Geometry, [grassMat, woodMat]);
      tier1.position.y = 3;
      // Tier 2: disc r 8, top at y 6.
      const tier2 = new Mesh(new CylinderGeometry(8, 8, 6, 48), [woodMat, grassMat, woodMat]);
      tier2.position.y = 3;
      g.add(tier1, tier2);
      // Two ramps, 3 m wide, from r 30 (y 0) up to r 24 (y 3) at 30 deg and 150 deg.
      const rise = 3;
      const run = 6;
      const rampGeometry = new BoxGeometry(Math.hypot(run, rise), 0.3, 3);
      for (const deg of [30, 150]) {
        const holder = new Group();
        holder.rotation.y = (-deg * Math.PI) / 180; // local +X points outwards along the ramp direction
        const slab = new Mesh(rampGeometry, rampMat);
        slab.rotation.z = -Math.atan2(rise, run); // the inner (-X) end is higher
        slab.position.set(27, rise / 2 - 0.15, 0);
        holder.add(slab);
        g.add(holder);
      }
      // Bell tower: cylinder r 2, h 8 on tier 2, with a small roof and a gold bell.
      const tower = new Mesh(new CylinderGeometry(2, 2, 8, 24), towerMat);
      tower.position.y = 10;
      const roof = new Mesh(new ConeGeometry(2.6, 1.6, 24), woodMat);
      roof.position.y = 14.8;
      const bell = new Mesh(new SphereGeometry(0.6, 16, 16), bellMat);
      bell.position.y = 13.2;
      g.add(tower, roof, bell);
    }
    padMaterials.length = 0;
    addPads(g, level.jumpPads);
    return g;
  }

  function disposeWorld(g: Group): void {
    g.traverse((o) => {
      if (o instanceof Mesh) {
        o.geometry.dispose();
        // Only per-world materials (pads) are disposed; the shared ones are reused by the next night.
        if (padMaterials.includes(o.material as MeshBasicMaterial)) (o.material as MeshBasicMaterial).dispose();
      }
    });
  }

  // Mây: robe (capsule), red scarf, gold conical hat with a small lantern hanging from it.
  const player = new Group();
  const body = new Mesh(new CapsuleGeometry(0.35, 0.7, 4, 12), new MeshStandardMaterial({ color: MAY_ROBE }));
  body.position.y = 0.7;
  const scarf = new Mesh(new TorusGeometry(0.34, 0.09, 8, 16), new MeshStandardMaterial({ color: MAY_SCARF }));
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 1.2;
  const hat = new Mesh(new ConeGeometry(0.7, 0.5, 20), new MeshStandardMaterial({ color: GOLD }));
  hat.position.y = 1.7;
  const handLamp = new Mesh(
    new SphereGeometry(0.12, 12, 12),
    new MeshStandardMaterial({ color: LANTERN_CORE, emissive: new Color(LANTERN_LIT), emissiveIntensity: 2 }),
  );
  handLamp.position.set(0.45, 1.0, 0.25);
  const handLight = new PointLight(LANTERN_LIT, 6, 14);
  handLight.position.copy(handLamp.position);
  player.add(body, scarf, hat, handLamp, handLight);
  scene.add(player);

  // Pulse rings: one per pulse event, growing and fading.
  const pulseGeometry = new RingGeometry(0.92, 1, 48);
  const pulses: PulseEffect[] = [];

  const lanternViews = new Map<string, LanternView>();
  const motes = new Map<string, MoteView>();
  const shades = new Map<string, ShadeView>();
  const charmViews = new Map<string, CharmView>();
  const drifterViews = new Map<string, DrifterView>();

  // Charms: a red talisman with a gold rim.
  const charmRimGeometry = new BoxGeometry(0.62, 0.86, 0.05);
  const charmFaceGeometry = new BoxGeometry(0.5, 0.74, 0.07);
  const charmRimMaterial = new MeshStandardMaterial({ color: GOLD, emissive: new Color(GOLD), emissiveIntensity: 0.6 });
  const charmFaceMaterial = new MeshStandardMaterial({ color: CHARM_RED, emissive: new Color(CHARM_RED), emissiveIntensity: 0.4 });

  // Tear stripe on an unlit lantern: a dark band around the lamp, tilted so it reads as a diagonal rip.
  const tearGeometry = new TorusGeometry(0.505, 0.04, 6, 28);
  const tearMaterial = new MeshBasicMaterial({ color: TEAR });

  // Wind leaves: one instanced mesh, positions are a pure function of time (no per-frame allocation).
  const leafMesh = new InstancedMesh(new PlaneGeometry(0.4, 0.22), new MeshBasicMaterial({ color: LEAF, side: DoubleSide }), LEAF_MAX);
  leafMesh.frustumCulled = false;
  leafMesh.visible = false;
  leafMesh.count = 0;
  const leafSeeds = new Float32Array(LEAF_MAX * 3);
  {
    let x = 12345;
    const next = (): number => {
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
      return x / 4294967296;
    };
    for (let i = 0; i < leafSeeds.length; i++) leafSeeds[i] = next();
  }
  const dummy = new Object3D();
  scene.add(leafMesh);

  // Guide fireflies ("Đom đóm dẫn đường"): a pool of small additive spheres positioned by src/extras/guide.ts.
  const guideGroup = new Group();
  guideGroup.visible = false;
  const guideGeometry = new SphereGeometry(0.14, 8, 8);
  const guideMaterial = new MeshBasicMaterial({ color: MOTE_HALO, transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false });
  const guideSprites: Mesh[] = [];
  for (let i = 0; i < GUIDE_SPRITES; i++) {
    const m = new Mesh(guideGeometry, guideMaterial);
    guideSprites.push(m);
    guideGroup.add(m);
  }
  scene.add(guideGroup);
  let guide: { positions: Float32Array; count: number; fade: number; active: boolean } | null = null;
  const projV = new Vector3();
  let lastTimeS = -1;
  let ambientNow = AMBIENT_BASE;

  const moteCoreGeometry = new SphereGeometry(0.16, 10, 10);
  const moteHaloGeometry = new SphereGeometry(0.34, 10, 10);
  const moteCoreMaterial = new MeshBasicMaterial({ color: MOTE_CORE });
  const moteHaloMaterial = new MeshBasicMaterial({ color: MOTE_HALO, transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false });
  const shadeGeometry = new SphereGeometry(0.7, 16, 16);
  const shadeRimGeometry = new SphereGeometry(0.82, 16, 16);

  const camera = new PerspectiveCamera(60, 1, 0.1, 400);

  function resize(): void {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  function lanternView(id: string): LanternView {
    let view = lanternViews.get(id);
    if (view) return view;
    const group = new Group();
    const post = new Mesh(new CylinderGeometry(0.12, 0.18, LAMP_Y - 0.4, 10), new MeshStandardMaterial({ color: WOOD }));
    post.position.y = (LAMP_Y - 0.4) / 2;
    const lamp = new Mesh(
      new SphereGeometry(0.5, 16, 16),
      new MeshStandardMaterial({ color: LANTERN_UNLIT, emissive: new Color(LANTERN_LIT), emissiveIntensity: 0 }),
    );
    lamp.position.y = LAMP_Y;
    const light = new PointLight(LANTERN_LIT, 0, 30);
    light.position.y = LAMP_Y + 0.3;
    // Safe-zone glow: a ring on the ground at exactly safe_radius, shown only while the lantern is lit.
    const zone = new Mesh(
      new RingGeometry(TUNING.safe_radius - 0.25, TUNING.safe_radius, 72),
      new MeshBasicMaterial({ color: LANTERN_LIT, transparent: true, opacity: 0.7, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }),
    );
    zone.rotation.x = -Math.PI / 2;
    zone.position.y = 0.06;
    zone.visible = false;
    // Fuel bar: a dark back plate and a fill whose left edge stays put while it shrinks; turned to face the camera.
    const bar = new Group();
    bar.position.y = LAMP_Y + 1.1;
    const back = new Mesh(new PlaneGeometry(BAR_WIDTH + 0.12, BAR_HEIGHT + 0.12), new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6 }));
    const fillGeometry = new PlaneGeometry(BAR_WIDTH, BAR_HEIGHT);
    fillGeometry.translate(BAR_WIDTH / 2, 0, 0.01);
    const barFill = new Mesh(fillGeometry, new MeshBasicMaterial({ color: LANTERN_LIT }));
    barFill.position.x = -BAR_WIDTH / 2;
    bar.add(back, barFill);
    bar.visible = false;
    const tear = new Mesh(tearGeometry, tearMaterial);
    tear.position.y = LAMP_Y;
    tear.rotation.set(0.9, 0.3, 0.6);
    group.add(post, lamp, light, zone, bar, tear);
    scene.add(group);
    view = { group, lamp, light, zone, bar, barFill, tear };
    lanternViews.set(id, view);
    return view;
  }

  function moteView(id: string): MoteView {
    let view = motes.get(id);
    if (view) return view;
    const group = new Group();
    const core = new Mesh(moteCoreGeometry, moteCoreMaterial);
    const halo = new Mesh(moteHaloGeometry, moteHaloMaterial);
    group.add(halo, core);
    scene.add(group);
    view = { group, core, halo };
    motes.set(id, view);
    return view;
  }

  function shadeView(s: ShadeState): ShadeView {
    let view = shades.get(s.id);
    if (view) return view;
    const group = new Group();
    const bodyMesh = new Mesh(shadeGeometry, new MeshStandardMaterial({ color: SHADE_BODY, roughness: 0.9, transparent: true }));
    const rimMesh = new Mesh(
      shadeRimGeometry,
      new MeshBasicMaterial({ color: SHADE_RIM, side: BackSide, transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false }),
    );
    group.add(rimMesh, bodyMesh);
    scene.add(group);
    view = { group, body: bodyMesh, rim: rimMesh };
    shades.set(s.id, view);
    return view;
  }

  function charmView(c: CharmState): CharmView {
    let view = charmViews.get(c.id);
    if (view) return view;
    const group = new Group();
    group.add(new Mesh(charmRimGeometry, charmRimMaterial), new Mesh(charmFaceGeometry, charmFaceMaterial));
    scene.add(group);
    view = { group };
    charmViews.set(c.id, view);
    return view;
  }

  function drifterView(d: DrifterState): DrifterView {
    let view = drifterViews.get(d.id);
    if (view) return view;
    const geometry = new PlaneGeometry(0.6, 2.2, 1, 8);
    const material = new MeshBasicMaterial({ color: DRIFTER, side: DoubleSide, transparent: true, opacity: 0.9 });
    const group = new Group();
    group.add(new Mesh(geometry, material));
    scene.add(group);
    const pos = geometry.getAttribute('position');
    const base = new Float32Array(pos.array.length);
    base.set(pos.array as ArrayLike<number>);
    view = { group, geometry, base, material };
    drifterViews.set(d.id, view);
    return view;
  }

  function clearEntities(): void {
    for (const v of lanternViews.values()) scene.remove(v.group);
    for (const v of motes.values()) scene.remove(v.group);
    for (const v of shades.values()) scene.remove(v.group);
    for (const v of charmViews.values()) scene.remove(v.group);
    for (const v of drifterViews.values()) {
      scene.remove(v.group);
      v.geometry.dispose();
      v.material.dispose();
    }
    for (const e of pulses) scene.remove(e.mesh);
    lanternViews.clear();
    motes.clear();
    shades.clear();
    charmViews.clear();
    drifterViews.clear();
    pulses.length = 0;
  }

  function updateLeaves(state: GameState, timeS: number): void {
    const w = state.wind;
    const n = w.active ? LEAF_MAX : w.warning ? LEAF_MAX >> 1 : 0;
    leafMesh.count = n;
    leafMesh.visible = n > 0;
    if (n === 0) return;
    const a = (w.dirDeg * Math.PI) / 180;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const speed = w.active ? WIND_SPEED_VIEW : WIND_SPEED_VIEW * 0.35;
    const px = state.player.pos[0];
    const py = state.player.pos[1];
    const pz = state.player.pos[2];
    for (let i = 0; i < n; i++) {
      const sx = leafSeeds[i * 3]!;
      const sy = leafSeeds[i * 3 + 1]!;
      const sz = leafSeeds[i * 3 + 2]!;
      const vx = sx * LEAF_BOX + dx * speed * timeS - px;
      const vz = sz * LEAF_BOX + dz * speed * timeS - pz;
      const x = px + ((((vx % LEAF_BOX) + LEAF_BOX) % LEAF_BOX) - LEAF_BOX / 2);
      const z = pz + ((((vz % LEAF_BOX) + LEAF_BOX) % LEAF_BOX) - LEAF_BOX / 2);
      dummy.position.set(x, py + 0.5 + sy * LEAF_HEIGHT + 0.5 * Math.sin(timeS * 2 + i), z);
      dummy.rotation.set(timeS * 3 + i, timeS * 2 + i * 0.7, 0);
      dummy.updateMatrix();
      leafMesh.setMatrixAt(i, dummy.matrix);
    }
    leafMesh.instanceMatrix.needsUpdate = true;
  }

  return {
    /** Forget every entity view (call when the game is restarted). */
    reset(): void {
      clearEntities();
    },

    /** Build the static scene (islands, bridge, tiers, pads) of night 1, 2 or 3 and forget every entity view. */
    setNight(night: 1 | 2 | 3): void {
      clearEntities();
      if (world) {
        scene.remove(world);
        disposeWorld(world);
      }
      world = buildWorld(night);
      scene.add(world);
      currentNight = night;
      ambientNow = AMBIENT_BASE;
      lastTimeS = -1;
    },

    /** Normalised screen position (NDC, y up) of a point above a lantern-height world position; `behind` = behind the camera. */
    project(pos: Vec3, out: { x: number; y: number; behind: boolean }): void {
      projV.set(pos[0], pos[1] + LAMP_Y, pos[2]).applyMatrix4(camera.matrixWorldInverse);
      out.behind = projV.z > 0;
      projV.applyMatrix4(camera.projectionMatrix);
      out.x = projV.x;
      out.y = projV.y;
    },

    /** The fireflies of the guide extra (read every frame; the object is owned by the extra). */
    setGuide(g: { positions: Float32Array; count: number; fade: number; active: boolean } | null): void {
      guide = g;
    },

    get night(): number {
      return currentNight;
    },

    /** Visual reactions to game events (the pulse ring). `timeS` is the same clock as in `render`. */
    onEvents(events: readonly GameEvent[], state: GameState, timeS: number): void {
      for (const e of events) {
        if (e.name !== 'pulse') continue;
        const mesh = new Mesh(
          pulseGeometry,
          new MeshBasicMaterial({ color: LANTERN_CORE, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }),
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(state.player.pos[0], state.player.pos[1] + 0.08, state.player.pos[2]);
        scene.add(mesh);
        pulses.push({ mesh, born: timeS });
      }
    },

    /** `camYawDeg` uses the contract convention: the camera looks along (sin yaw, 0, cos yaw). */
    render(state: GameState, camYawDeg: number, timeS: number): void {
      const p = state.player;
      player.position.set(p.pos[0], p.pos[1], p.pos[2]);
      player.rotation.y = Math.atan2(p.facing[0], p.facing[1]);
      // Invulnerable: Mây blinks.
      player.visible = p.invulnTicks <= 0 || Math.floor(p.invulnTicks / 5) % 2 === 0;

      for (const l of state.lanterns) {
        const view = lanternView(l.id);
        view.group.position.set(l.pos[0], l.pos[1], l.pos[2]);
        const mat = view.lamp.material as MeshStandardMaterial;
        if (l.lit) {
          mat.color.setHex(LANTERN_CORE);
          mat.emissive.setHex(LANTERN_LIT);
          mat.emissiveIntensity = 3 + 0.4 * Math.sin(timeS * 3);
        } else {
          // An unlit lantern glows a little more with every mote poured into it.
          mat.color.setHex(LANTERN_UNLIT);
          mat.emissive.setHex(LANTERN_LIT);
          mat.emissiveIntensity = 1.4 * (l.deposited / TUNING.lantern_cost);
        }
        const lowFuel = l.lit && l.fuelUnits < TUNING.low_fuel_threshold * TICK_RATE;
        const blinkOff = lowFuel && Math.floor(timeS * 2) % 2 === 1; // lantern and bar blink at 1 Hz
        view.group.scale.y = l.lit ? 1 : UNLIT_SCALE_Y;
        view.tear.visible = !l.lit; // torn paper only while unlit
        view.lamp.visible = !blinkOff;
        view.light.intensity = l.lit && !blinkOff ? 220 : 0;
        view.zone.visible = l.lit && !lowFuel; // the safe zone only exists while the fuel is not low
        if (view.zone.visible) (view.zone.material as MeshBasicMaterial).opacity = 0.55 + 0.15 * Math.sin(timeS * 2);
        view.bar.visible = l.lit && !blinkOff;
        if (view.bar.visible) {
          view.bar.quaternion.copy(camera.quaternion);
          view.barFill.scale.x = Math.max(0.001, l.fuelUnits / (TUNING.fuel_max * TICK_RATE));
          (view.barFill.material as MeshBasicMaterial).color.setHex(lowFuel ? (isColorBlind() ? FUEL_BAR_LOW_CB : FUEL_BAR_LOW) : LANTERN_LIT);
        }
      }

      for (const m of state.motes) {
        const view = moteView(m.id);
        // Dropped motes (they carry a ttl) blink in their last second.
        const blinkOff = m.ttl !== undefined && m.ttl < MOTE_BLINK_TICKS && Math.floor(m.ttl / 6) % 2 === 0;
        view.group.visible = m.active && !blinkOff;
        view.group.position.set(m.pos[0], MOTE_HOVER_Y + 0.12 * Math.sin(timeS * 2 + m.pos[0]), m.pos[2]);
      }

      const liveShades = new Set(state.shades.map((s) => s.id));
      for (const [id, view] of shades) {
        if (!liveShades.has(id)) {
          scene.remove(view.group);
          shades.delete(id);
        }
      }
      for (const s of state.shades) {
        const view = shadeView(s);
        const stunned = s.state === 'stunned';
        const spawning = s.state === 'spawning';
        const bob = 0.1 * Math.sin(timeS * 3 + s.pos[0]);
        view.group.position.set(s.pos[0], s.pos[1] + (stunned ? 0 : bob), s.pos[2]);
        // Spawning shades fade in; stunned shades are greyed out and calm; recoiling ones are dimmer.
        const bodyMat = view.body.material as MeshStandardMaterial;
        bodyMat.color.setHex(stunned ? SHADE_STUNNED : SHADE_BODY);
        bodyMat.opacity = spawning ? 0.45 : 1;
        (view.rim.material as MeshBasicMaterial).color.setHex(isColorBlind() ? SHADE_RIM_CB : SHADE_RIM);
        (view.rim.material as MeshBasicMaterial).opacity = spawning ? 0.3 : stunned ? 0.12 : s.state === 'recoil' ? 0.4 : 0.8;
        view.group.scale.setScalar(spawning ? 0.6 + 0.4 * (1 - s.spawnTicks / SHADE_SPAWNING_TICKS) : 1);
      }

      for (const c of state.charms) {
        const view = charmView(c);
        view.group.visible = c.available;
        if (c.available) {
          view.group.position.set(c.pos[0], c.pos[1] + 1.1 + 0.15 * Math.sin(timeS * 2 + c.pos[0]), c.pos[2]);
          view.group.rotation.y = timeS * 1.5;
        }
      }

      const liveDrifters = new Set<string>();
      for (const d of state.drifters) liveDrifters.add(d.id);
      for (const [id, view] of drifterViews) {
        if (!liveDrifters.has(id)) {
          scene.remove(view.group);
          view.geometry.dispose();
          view.material.dispose();
          drifterViews.delete(id);
        }
      }
      for (const d of state.drifters) {
        const view = drifterView(d);
        view.group.position.set(d.pos[0], d.pos[1] + 0.3 * Math.sin(timeS * 2 + d.pos[0]), d.pos[2]);
        view.group.quaternion.copy(camera.quaternion);
        const freq = d.state === 'chase' ? 14 : d.state === 'flee' ? 9 : 5;
        const arr = view.geometry.getAttribute('position');
        for (let i = 0; i < arr.count; i++) {
          const by = view.base[i * 3 + 1]!;
          arr.setX(i, view.base[i * 3]! + Math.sin(timeS * freq + by * 3) * 0.28 * (0.4 + (by + 1.1) / 2.2));
        }
        arr.needsUpdate = true;
        view.material.opacity = d.state === 'flee' ? 0.4 : 0.9;
      }

      updateLeaves(state, timeS);

      if (guide && guide.active) {
        guideGroup.visible = true;
        for (let i = 0; i < guide.count && i < GUIDE_SPRITES; i++) {
          const sprite = guideSprites[i]!;
          sprite.position.set(guide.positions[i * 3]!, guide.positions[i * 3 + 1]!, guide.positions[i * 3 + 2]!);
          sprite.scale.setScalar(guide.fade * (0.8 + 0.4 * Math.sin(timeS * 8 + i)));
        }
      } else {
        guideGroup.visible = false;
      }

      for (let i = 0; i < padMaterials.length; i++) padMaterials[i]!.opacity = 0.55 + 0.25 * Math.sin(timeS * 3 + i);

      for (let i = pulses.length - 1; i >= 0; i--) {
        const e = pulses[i]!;
        const t = (timeS - e.born) / PULSE_EFFECT_S;
        if (t >= 1) {
          scene.remove(e.mesh);
          pulses.splice(i, 1);
          continue;
        }
        e.mesh.scale.setScalar(Math.max(0.1, TUNING.pulse_radius * t));
        (e.mesh.material as MeshBasicMaterial).opacity = 0.9 * (1 - t);
      }

      // The island brightens as lanterns are lit: 0.15 + 0.55 * lit / total.
      let lit = 0;
      for (const l of state.lanterns) if (l.lit) lit++;
      const ambientTarget = AMBIENT_BASE + (AMBIENT_GAIN * lit) / Math.max(1, state.lanterns.length);
      const dt = lastTimeS < 0 ? 1 : Math.min(0.25, Math.max(0, timeS - lastTimeS));
      lastTimeS = timeS;
      ambientNow += (ambientTarget - ambientNow) * Math.min(1, dt * AMBIENT_LERP);
      ambient.intensity = ambientNow;

      // Third-person camera behind the player.
      const yaw = (camYawDeg * Math.PI) / 180;
      camera.position.set(
        p.pos[0] - Math.sin(yaw) * CAMERA_DISTANCE,
        p.pos[1] + CAMERA_HEIGHT,
        p.pos[2] - Math.cos(yaw) * CAMERA_DISTANCE,
      );
      camera.lookAt(p.pos[0], p.pos[1] + 1.2, p.pos[2]);

      renderer.render(scene, camera);
    },
  };
}
