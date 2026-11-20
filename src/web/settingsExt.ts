// Phase-4 settings that live next to the base settings in the same localStorage entry (SETTINGS_KEY). settings.ts keeps its
// own shape (and tests); these extra fields are read and written here. Pure: the storage is injected.
import { DEFAULT_KEYMAP, sanitizeKeymap, type KeyMap } from './keymap';
import { clampSettings, SETTINGS_KEY, type Settings, type StorageLike } from './settings';

export interface ExtSettings {
  keys: KeyMap;
  /** Subtitles and visual cues ("Phụ đề"). */
  captions: boolean;
  /** No camera shake, hit flash, clock/lantern blink; slower leaves. */
  reducedMotion: boolean;
  /** UI text x1.25. */
  largeText: boolean;
}

export const DEFAULT_EXT: Readonly<ExtSettings> = Object.freeze({
  keys: DEFAULT_KEYMAP as KeyMap,
  captions: true,
  reducedMotion: false,
  largeText: false,
});

export const LARGE_TEXT_SCALE = 1.25;
export const uiScale = (e: Pick<ExtSettings, 'largeText'>): number => (e.largeText ? LARGE_TEXT_SCALE : 1);

export function clampExt(raw: unknown): ExtSettings {
  const r = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const bool = (v: unknown, def: boolean): boolean => (typeof v === 'boolean' ? v : def);
  return {
    keys: sanitizeKeymap(r.keys),
    captions: bool(r.captions, DEFAULT_EXT.captions),
    reducedMotion: bool(r.reducedMotion, DEFAULT_EXT.reducedMotion),
    largeText: bool(r.largeText, DEFAULT_EXT.largeText),
  };
}

export function loadExt(storage: StorageLike | null | undefined): ExtSettings {
  try {
    const text = storage?.getItem(SETTINGS_KEY);
    return clampExt(text ? JSON.parse(text) : null);
  } catch {
    return clampExt(null);
  }
}

/** Writes base + extra fields as one JSON object under SETTINGS_KEY. Returns true when written; never throws. */
export function saveAll(storage: StorageLike | null | undefined, base: Settings, ext: ExtSettings): boolean {
  try {
    if (!storage) return false;
    storage.setItem(SETTINGS_KEY, JSON.stringify({ ...clampSettings(base), ...clampExt(ext) }));
    return true;
  } catch {
    return false;
  }
}
