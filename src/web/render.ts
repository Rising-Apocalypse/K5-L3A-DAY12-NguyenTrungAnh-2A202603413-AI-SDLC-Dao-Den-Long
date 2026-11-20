import {
  AdditiveBlending,
  AmbientLight,
  BackSide,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Fog,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  RingGeometry,
  Scene,
  SphereGeometry,
  TorusGeometry,
  WebGLRenderer,
} from 'three';
import { ISLAND_RADIUS } from '../core/level';
import { SHADE_SPAWNING_TICKS } from '../core/rules';
import { TICK_RATE } from '../core/sim';
import { TUNING } from '../core/tuning';
import type { GameEvent, GameState, ShadeState } from '../core/types';

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
const SHADE_STUNNED = 0x3a3450;
const MAY_ROBE = 0xe8e2d0;
const MAY_SCARF = 0xc8102e;
const GOLD = 0xf2c14e;

const CAMERA_DISTANCE = 9;
const CAMERA_HEIGHT = 5;
const MOTE_HOVER_Y = 0.5;
const LAMP_Y = 3.4;
const BEACH_WIDTH = 4;
/** Light of the whole island: 0.15 with every lantern dark, +0.55 when all are lit. */
const AMBIENT_BASE = 0.15;
const AMBIENT_GAIN = 0.55;
/** A dropped mote blinks during its last second. */
const MOTE_BLINK_TICKS = TICK_RATE;
/** The pulse ring grows to pulse_radius in this long (seconds). */
const PULSE_EFFECT_S = 0.45;

interface LanternView {
  group: Group;
  lamp: Mesh;
  light: PointLight;
  zone: Mesh;
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

  // Island (grass on top, sand beach around the edge) and the sea of clouds far below.
  const rock = new Mesh(
    new CylinderGeometry(ISLAND_RADIUS, ISLAND_RADIUS * 0.8, 6, 64),
    new MeshStandardMaterial({ color: WOOD, roughness: 1 }),
  );
  rock.position.y = -3.02;
  const grass = new Mesh(new CircleGeometry(ISLAND_RADIUS, 64), new MeshStandardMaterial({ color: GRASS, roughness: 1 }));
  grass.rotation.x = -Math.PI / 2;
  const beach = new Mesh(
    new RingGeometry(ISLAND_RADIUS - BEACH_WIDTH, ISLAND_RADIUS, 64),
    new MeshStandardMaterial({ color: SAND, roughness: 1 }),
  );
  beach.rotation.x = -Math.PI / 2;
  beach.position.y = 0.01;
  const clouds = new Mesh(new PlaneGeometry(600, 600), new MeshStandardMaterial({ color: CLOUD_SEA, roughness: 1 }));
  clouds.rotation.x = -Math.PI / 2;
  clouds.position.y = -14;
  scene.add(rock, grass, beach, clouds);

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
    group.add(post, lamp, light, zone);
    scene.add(group);
    view = { group, lamp, light, zone };
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

  return {
    /** Forget every entity view (call when the game is restarted). */
    reset(): void {
      for (const v of lanternViews.values()) scene.remove(v.group);
      for (const v of motes.values()) scene.remove(v.group);
      for (const v of shades.values()) scene.remove(v.group);
      for (const e of pulses) scene.remove(e.mesh);
      lanternViews.clear();
      motes.clear();
      shades.clear();
      pulses.length = 0;
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
        view.light.intensity = l.lit ? 220 : 0;
        view.zone.visible = l.lit;
        if (l.lit) (view.zone.material as MeshBasicMaterial).opacity = 0.55 + 0.15 * Math.sin(timeS * 2);
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
        (view.rim.material as MeshBasicMaterial).opacity = spawning ? 0.3 : stunned ? 0.12 : s.state === 'recoil' ? 0.4 : 0.8;
        view.group.scale.setScalar(spawning ? 0.6 + 0.4 * (1 - s.spawnTicks / SHADE_SPAWNING_TICKS) : 1);
      }

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
      const lit = state.lanterns.filter((l) => l.lit).length;
      ambient.intensity = AMBIENT_BASE + (AMBIENT_GAIN * lit) / Math.max(1, state.lanterns.length);

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
