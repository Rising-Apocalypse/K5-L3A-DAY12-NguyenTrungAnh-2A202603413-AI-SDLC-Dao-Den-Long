import { TICK_RATE } from '../core/sim';
import type { Tuning } from '../core/tuning';
import type { GameEvent, GameState, Vec3 } from '../core/types';
import { isColorBlind } from './colorblind';
import { keyLabel, type KeyMap } from './keymap';
import { getSettings } from './prefs';
import { blinkOn, carryCapacity, cooldownFraction, edgeArrow, formatClock, isClockDanger, lanternsNeeded, nearestUnlit, promptLantern, type EdgeArrow } from './hudlogic';

const byId = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id} in index.html`);
  return el;
};

/** Projects a world point to normalised screen coordinates (renderer.project). */
export type Projector = (pos: Vec3, out: { x: number; y: number; behind: boolean }) => void;

export interface HudExtras {
  /** Real time in seconds (blink clock). */
  timeS: number;
  /** "Đom đóm dẫn đường" cooldown: 0 ready .. 1 just used. */
  guideCooldown: number;
  project: Projector;
}

/** Writes to the DOM only when the value changed. */
function cachedText(el: HTMLElement): (s: string) => void {
  let last: string | null = null;
  return (s) => {
    if (s !== last) {
      last = s;
      el.textContent = s;
    }
  };
}
function cachedClass(el: HTMLElement, cls: string): (on: boolean) => void {
  let last: boolean | null = null;
  return (on) => {
    if (on !== last) {
      last = on;
      el.classList.toggle(cls, on);
    }
  };
}
function cachedStyle(el: HTMLElement, prop: 'height' | 'display' | 'visibility'): (v: string) => void {
  let last: string | null = null;
  return (v) => {
    if (v !== last) {
      last = v;
      el.style[prop] = v;
    }
  };
}

/** DOM overlay: flames, clock, lanterns, score, mote bar, cooldown icons, "E" prompt, off-screen arrow, wind warning, hit flash. */
export function createHud(tuning: Tuning) {
  const root = byId('hud');
  const flamesEl = byId('hud-flames');
  const clock = byId('hud-clock');
  const lanternsEl = byId('hud-lanterns');
  const scoreEl = byId('hud-score');
  const nightEl = byId('hud-night');
  const slotsEl = byId('hud-slots');
  const capEl = byId('hud-cap');
  const prompt = byId('prompt');
  const arrow = byId('arrow');
  const windWarn = byId('wind-warn');
  const flash = byId('flash');
  const helpEl = byId('help');

  const flameIcons: HTMLElement[] = [];
  for (let i = 0; i < tuning.flames; i++) {
    const f = document.createElement('div');
    f.className = 'flame';
    flamesEl.appendChild(f);
    flameIcons.push(f);
  }
  const slots: HTMLElement[] = [];
  for (let i = 0; i < tuning.capacity_max; i++) {
    const s = document.createElement('div');
    s.className = 'slot';
    slotsEl.appendChild(s);
    slots.push(s);
  }
  const slotFull: Array<boolean | null> = slots.map(() => null);
  const slotShown: Array<boolean | null> = slots.map(() => null);

  const cd = (id: string) => {
    const box = byId(id);
    return { box, fill: box.querySelector('.fill') as HTMLElement };
  };
  const dash = cd('cd-dash');
  const pulse = cd('cd-pulse');
  const dashKey = dash.box.querySelector('.key') as HTMLElement;
  const pulseKey = pulse.box.querySelector('.key') as HTMLElement;
  const guide = cd('cd-guide');

  const setClock = cachedText(clock);
  const setLanterns = cachedText(lanternsEl);
  const setScore = cachedText(scoreEl);
  const setCap = cachedText(capEl);
  const setPrompt = cachedText(prompt);
  const promptDisplay = cachedStyle(prompt, 'display');
  const clockDanger = cachedClass(clock, 'danger');
  const clockHide = cachedClass(clock, 'hide');
  const flamesLow = cachedClass(flamesEl, 'low');
  const lanternsBad = cachedClass(lanternsEl, 'bad');
  const windDisplay = cachedStyle(windWarn, 'display');
  const arrowDisplay = cachedStyle(arrow, 'display');
  const dashFill = cachedStyle(dash.fill, 'height');
  const pulseFill = cachedStyle(pulse.fill, 'height');
  const guideFill = cachedStyle(guide.fill, 'height');
  const dashReady = cachedClass(dash.box, 'ready');
  const dashCharm = cachedClass(dash.box, 'charm');
  const pulseReady = cachedClass(pulse.box, 'ready');
  const pulseNoMotes = cachedClass(pulse.box, 'nomotes');
  const guideReady = cachedClass(guide.box, 'ready');
  const flameOff = flameIcons.map((f) => cachedClass(f, 'off'));

  const proj = { x: 0, y: 0, behind: false };
  const edge: EdgeArrow = { visible: false, x: 0, y: 0, rotDeg: 0 };
  let lastCapacity = -1;
  let colorBlind = isColorBlind();
  let lastArrowX = NaN;
  let lastArrowY = NaN;
  let lastArrowRot = NaN;

  return {
    show(on: boolean): void {
      root.classList.toggle('on', on);
      if (!on) {
        promptDisplay('none');
        arrowDisplay('none');
        windDisplay('none');
      }
    },

    setNight(night: number, islandName: string): void {
      nightEl.textContent = `Đêm ${night} — ${islandName}`;
    },

    /** The colour-blind palette was toggled (key C or settings). */
    setColorBlind(): void {
      colorBlind = isColorBlind();
    },

    /** Key names on the cooldown icons and the help line follow the key map. */
    setKeys(keys: Readonly<KeyMap>): void {
      dashKey.textContent = keyLabel(keys.dash);
      pulseKey.textContent = keyLabel(keys.pulse);
      helpEl.textContent = `${keyLabel(keys.pause)} / Esc: tạm dừng · R: chơi lại · C: màu dễ phân biệt · H: đom đóm dẫn đường`;
    },

    /** A hit flashes the screen red. */
    onEvents(events: readonly GameEvent[]): void {
      for (const e of events) {
        if (e.name === 'player_hit' && !getSettings().reducedMotion) {
          flash.classList.remove('on');
          void flash.offsetWidth; // restart the CSS transition
          flash.classList.add('on');
          requestAnimationFrame(() => flash.classList.remove('on'));
        }
      }
    },

    /** Forget the previous night (called on restart). */
    reset(): void {
      flash.classList.remove('on');
      lastCapacity = -1;
    },

    update(state: GameState, ex: HudExtras): void {
      const p = state.player;

      for (let i = 0; i < flameIcons.length; i++) flameOff[i]!(i >= p.flames);
      flamesLow(p.flames <= 1);

      const danger = isClockDanger(state.timeLeftS);
      setClock(danger && colorBlind ? `⚠ ${formatClock(state.timeLeftS)}` : formatClock(state.timeLeftS));
      clockDanger(danger);
      clockHide(danger && state.state === 'playing' && !state.paused && !getSettings().reducedMotion && !blinkOn(ex.timeS));

      const total = state.lanterns.length;
      let lit = 0;
      for (const l of state.lanterns) if (l.lit) lit++;
      setLanterns(`Đèn ${lit}/${total} · cần ${lanternsNeeded(tuning, total)}`);
      setScore(`Điểm ${state.score}`);

      // Mote bar: one slot per unit of capacity (10..20), filled = carried.
      const capacity = carryCapacity(p, tuning);
      if (capacity !== lastCapacity) {
        lastCapacity = capacity;
        for (let i = 0; i < slots.length; i++) {
          const shown = i < capacity;
          if (slotShown[i] !== shown) {
            slotShown[i] = shown;
            slots[i]!.style.display = shown ? '' : 'none';
          }
        }
      }
      for (let i = 0; i < capacity; i++) {
        const full = i < p.carried;
        if (slotFull[i] !== full) {
          slotFull[i] = full;
          slots[i]!.classList.toggle('full', full);
        }
      }
      setCap(`${p.carried}/${capacity}`);

      // Cooldown icons.
      const charm = p.charmTicks > 0;
      dashCharm(charm);
      dashFill(`${charm ? 0 : cooldownFraction(p.dashCooldownTicks, tuning.dash_cooldown_s, TICK_RATE) * 100}%`);
      dashReady(charm || p.dashCooldownTicks <= 0);
      pulseFill(`${cooldownFraction(p.pulseCooldownTicks, tuning.pulse_cooldown_s, TICK_RATE) * 100}%`);
      pulseReady(p.pulseCooldownTicks <= 0 && p.carried >= tuning.pulse_cost);
      pulseNoMotes(p.pulseCooldownTicks <= 0 && p.carried < tuning.pulse_cost);
      guideFill(`${ex.guideCooldown * 100}%`);
      guideReady(ex.guideCooldown <= 0);

      const playing = state.state === 'playing' && !state.paused;
      windDisplay(playing && state.wind.warning ? 'block' : 'none');

      // "E" prompt (nearest lantern within interact_radius that can take motes).
      const near = playing ? promptLantern(state, tuning, TICK_RATE) : null;
      if (!playing) {
        promptDisplay('none');
      } else if (p.fallWaitTicks > 0) {
        setPrompt('Mây rơi khỏi đảo...');
        promptDisplay('block');
      } else if (near) {
        setPrompt(
          near.lit
            ? `E — Châm dầu (${(near.fuelUnits / TICK_RATE).toFixed(0)}/${tuning.fuel_max})`
            : `E — Nạp ánh sáng (${near.deposited}/${near.everLit ? tuning.relight_cost : tuning.lantern_cost})`,
        );
        promptDisplay('block');
      } else {
        promptDisplay('none');
      }

      // Arrow to the nearest unlit lantern when it is outside the view.
      const target = playing ? nearestUnlit(state) : null;
      if (target) {
        ex.project(target.pos, proj);
        edgeArrow(proj.x, proj.y, proj.behind, window.innerWidth, window.innerHeight, 50, edge);
      } else {
        edge.visible = false;
      }
      if (edge.visible) {
        if (edge.x !== lastArrowX || edge.y !== lastArrowY || edge.rotDeg !== lastArrowRot) {
          lastArrowX = edge.x;
          lastArrowY = edge.y;
          lastArrowRot = edge.rotDeg;
          arrow.style.transform = `translate(${edge.x.toFixed(0)}px, ${edge.y.toFixed(0)}px) rotate(${edge.rotDeg.toFixed(0)}deg)`;
        }
        arrowDisplay('block');
      } else {
        arrowDisplay('none');
      }
    },
  };
}
