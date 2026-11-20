import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYMAP } from '../../src/web/keymap';
import { clampSettings, DEFAULT_SETTINGS, loadSettings, SETTINGS_KEY, type StorageLike } from '../../src/web/settings';
import { clampExt, DEFAULT_EXT, loadExt, saveAll, uiScale } from '../../src/web/settingsExt';

function memory(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}

describe('phase-4 settings (settingsExt)', () => {
  it('defaults: default keys, captions on, reduced motion off, large text off', () => {
    expect(DEFAULT_EXT).toEqual({ keys: DEFAULT_KEYMAP, captions: true, reducedMotion: false, largeText: false });
    expect(loadExt(memory())).toEqual(DEFAULT_EXT);
    expect(loadExt(null)).toEqual(DEFAULT_EXT);
  });

  it('an old settings entry without the new fields migrates to defaults', () => {
    const m = memory({ [SETTINGS_KEY]: JSON.stringify({ volume: 40, sensitivity: 0.6, colorBlind: true }) });
    expect(loadExt(m)).toEqual(DEFAULT_EXT);
    expect(loadSettings(m)).toEqual({ volume: 40, sensitivity: 0.6, colorBlind: true });
  });

  it('saves base and extra fields in the same key and both load back', () => {
    const m = memory();
    const ext = clampExt({ keys: { jump: 'KeyX' }, captions: false, reducedMotion: true, largeText: true });
    expect(saveAll(m, { volume: 10, sensitivity: 0.5, colorBlind: true }, ext)).toBe(true);
    expect(Object.keys(m.data)).toEqual([SETTINGS_KEY]);
    expect(loadSettings(m)).toEqual({ volume: 10, sensitivity: 0.5, colorBlind: true });
    const back = loadExt(m);
    expect(back).toEqual(ext);
    expect(back.keys.jump).toBe('KeyX');
    expect(back.keys.dash).toBe('ShiftLeft');
  });

  it('bad data falls back per field and storage failures never throw', () => {
    expect(clampExt({ captions: 'no', reducedMotion: 1, largeText: null, keys: 5 })).toEqual(DEFAULT_EXT);
    expect(loadExt(memory({ [SETTINGS_KEY]: '{oops' }))).toEqual(DEFAULT_EXT);
    const throwing: StorageLike = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(loadExt(throwing)).toEqual(DEFAULT_EXT);
    expect(saveAll(throwing, { ...DEFAULT_SETTINGS }, DEFAULT_EXT)).toBe(false);
    expect(saveAll(null, clampSettings(null), DEFAULT_EXT)).toBe(false);
  });

  it('ui scale is 1 or 1.25', () => {
    expect(uiScale({ largeText: false })).toBe(1);
    expect(uiScale({ largeText: true })).toBe(1.25);
  });
});
