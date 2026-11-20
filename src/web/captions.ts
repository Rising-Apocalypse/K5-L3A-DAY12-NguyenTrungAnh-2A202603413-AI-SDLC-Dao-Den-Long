// Subtitles / visual cues (Ticket-04 section 4). Pure: derive caption lines from what happened in a step, and keep the
// short queue (newest first, max 3, 3 s each).
import type { GameEvent, GameState } from '../core/types';

export const CAPTION_SECONDS = 3;
export const CAPTION_MAX = 3;
/** "10 giây cuối!" fires once per night when the clock reaches this. */
export const LAST_SECONDS = 10;

export interface CaptionMemory {
  windWarning: boolean;
  lastSecondsShown: boolean;
  /** Lantern ids whose fuel is currently below the low-fuel threshold. */
  lowFuel: ReadonlySet<string>;
}

export interface Caption {
  text: string;
  /** Shade this caption points at with an edge arrow while it is off-screen. */
  shadeId?: string;
}

export const initialMemory = (): CaptionMemory => ({ windWarning: false, lastSecondsShown: false, lowFuel: new Set() });

/** Summary of a fresh state without emitting captions (used when a night starts). */
export function summarize(state: GameState, lowFuelUnits: number): CaptionMemory {
  const low = new Set<string>();
  for (const l of state.lanterns) if (l.lit && l.fuelUnits < lowFuelUnits) low.add(l.id);
  return { windWarning: state.wind.warning, lastSecondsShown: state.timeLeftS <= LAST_SECONDS, lowFuel: low };
}

/**
 * Captions caused by one step. `prev` is the summary before the step; `lowFuelUnits` is `low_fuel_threshold * tick rate`
 * (fuel is stored in 1/60 units). Returns the lines (in the order the cues happened) and the summary for the next step.
 */
export function captionsFor(prev: CaptionMemory, events: readonly GameEvent[], state: GameState, lowFuelUnits: number): { captions: Caption[]; next: CaptionMemory } {
  const captions: Caption[] = [];
  for (const e of events) {
    switch (e.name) {
      case 'shade_spawned':
        captions.push({ text: 'Bóng Mực xuất hiện', shadeId: e.data.id });
        break;
      case 'drifter_steal':
        captions.push({ text: `Gió Lạc cướp ${e.data.amount} đom đóm` });
        break;
      case 'lantern_out':
        captions.push({ text: `Đèn ${e.data.lantern_id} đã tắt` });
        break;
    }
  }
  if (state.wind.warning && !prev.windWarning) captions.push({ text: 'Gió mạnh sắp tới!' });

  let lastSecondsShown = prev.lastSecondsShown;
  if (!lastSecondsShown && state.state === 'playing' && state.timeLeftS <= LAST_SECONDS) {
    lastSecondsShown = true;
    captions.push({ text: `${LAST_SECONDS} giây cuối!` });
  }

  const low = new Set<string>();
  for (const l of state.lanterns) {
    if (l.lit && l.fuelUnits < lowFuelUnits) {
      low.add(l.id);
      if (!prev.lowFuel.has(l.id)) captions.push({ text: `Đèn ${l.id} sắp cạn dầu` });
    }
  }
  return { captions, next: { windWarning: state.wind.warning, lastSecondsShown, lowFuel: low } };
}

export interface ActiveCaption extends Caption {
  untilS: number;
}

/** Newest-first list of live captions, at most CAPTION_MAX, each alive CAPTION_SECONDS. */
export class CaptionQueue {
  private items: ActiveCaption[] = [];

  add(c: Caption, nowS: number): void {
    this.items.unshift({ ...c, untilS: nowS + CAPTION_SECONDS });
    if (this.items.length > CAPTION_MAX) this.items.length = CAPTION_MAX;
  }
  /** Drop the expired ones and return the live list (newest first). */
  active(nowS: number): readonly ActiveCaption[] {
    this.items = this.items.filter((c) => c.untilS > nowS);
    return this.items;
  }
  clear(): void {
    this.items = [];
  }
}
