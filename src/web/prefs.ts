// Live settings of this page view (backed by localStorage when it works). The colour-blind palette, the text scale and the
// reduced-motion class live here too. Base fields come from settings.ts, the Phase-4 fields from settingsExt.ts.
import { clampSettings, loadSettings, type Settings, type StorageLike } from './settings';
import { clampExt, loadExt, saveAll, uiScale, type ExtSettings } from './settingsExt';

export type AllSettings = Settings & ExtSettings;

function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const storage = browserStorage();
let current: AllSettings = { ...loadSettings(storage), ...loadExt(storage) };
const listeners: Array<(s: AllSettings) => void> = [];

const DANGER = '#ff5a5f';
const DANGER_CB = '#ffffff';
const applyLook = (): void => {
  const root = document.documentElement;
  root.style.setProperty('--danger', current.colorBlind ? DANGER_CB : DANGER);
  root.style.setProperty('--ui-scale', String(uiScale(current)));
  root.classList.toggle('reduced-motion', current.reducedMotion);
};
applyLook();

export const getSettings = (): Readonly<AllSettings> => current;

export function updateSettings(patch: Partial<AllSettings>): void {
  const merged = { ...current, ...patch };
  current = { ...clampSettings(merged), ...clampExt(merged) };
  saveAll(storage, current, current);
  applyLook();
  for (const l of listeners) l(current);
}

export function onSettingsChange(fn: (s: AllSettings) => void): void {
  listeners.push(fn);
}
