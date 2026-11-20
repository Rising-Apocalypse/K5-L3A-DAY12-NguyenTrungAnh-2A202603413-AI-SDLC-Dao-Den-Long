// Persisted player settings. Pure: the storage is injected, every access is guarded, bad data falls back to defaults.

export interface Settings {
  /** 0..100 */
  volume: number;
  /** degrees of camera turn per pixel of mouse drag, 0.1..1.0 */
  sensitivity: number;
  colorBlind: boolean;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const SETTINGS_KEY = 'dao-den-long.settings.v1';
export const DEFAULT_SETTINGS: Readonly<Settings> = { volume: 70, sensitivity: 0.3, colorBlind: false };
export const VOLUME_RANGE = [0, 100] as const;
export const SENSITIVITY_RANGE = [0.1, 1.0] as const;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Coerce anything into valid settings: wrong types and non-finite numbers fall back to the default per field. */
export function clampSettings(raw: unknown): Settings {
  const r = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const num = (v: unknown, def: number, lo: number, hi: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : def;
  return {
    volume: Math.round(num(r.volume, DEFAULT_SETTINGS.volume, VOLUME_RANGE[0], VOLUME_RANGE[1])),
    sensitivity: num(r.sensitivity, DEFAULT_SETTINGS.sensitivity, SENSITIVITY_RANGE[0], SENSITIVITY_RANGE[1]),
    colorBlind: typeof r.colorBlind === 'boolean' ? r.colorBlind : DEFAULT_SETTINGS.colorBlind,
  };
}

export function loadSettings(storage: StorageLike | null | undefined): Settings {
  try {
    const text = storage?.getItem(SETTINGS_KEY);
    if (!text) return { ...DEFAULT_SETTINGS };
    return clampSettings(JSON.parse(text));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Returns true when the settings were written. Never throws. */
export function saveSettings(storage: StorageLike | null | undefined, s: Settings): boolean {
  try {
    if (!storage) return false;
    storage.setItem(SETTINGS_KEY, JSON.stringify(clampSettings(s)));
    return true;
  } catch {
    return false;
  }
}
