// Live settings of this page view (backed by localStorage when it works). The colour-blind palette lives here too.
import { clampSettings, loadSettings, saveSettings, type Settings, type StorageLike } from './settings';

function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const storage = browserStorage();
let current: Settings = loadSettings(storage);
const listeners: Array<(s: Settings) => void> = [];

const DANGER = '#ff5a5f';
const DANGER_CB = '#ffffff';
const applyColorBlind = (): void => {
  document.documentElement.style.setProperty('--danger', current.colorBlind ? DANGER_CB : DANGER);
};
applyColorBlind();

export const getSettings = (): Readonly<Settings> => current;

export function updateSettings(patch: Partial<Settings>): void {
  current = clampSettings({ ...current, ...patch });
  saveSettings(storage, current);
  applyColorBlind();
  for (const l of listeners) l(current);
}

export function onSettingsChange(fn: (s: Settings) => void): void {
  listeners.push(fn);
}
