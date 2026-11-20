import { describe, expect, it } from 'vitest';
import { clampSettings, DEFAULT_SETTINGS, loadSettings, saveSettings, SETTINGS_KEY, type StorageLike } from '../../src/web/settings';

function memory(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}
const throwing: StorageLike = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

describe('web settings', () => {
  it('defaults: volume 70, sensitivity 0.3, colour-blind off', () => {
    expect(DEFAULT_SETTINGS).toEqual({ volume: 70, sensitivity: 0.3, colorBlind: false });
    expect(loadSettings(memory())).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('saves under dao-den-long.settings.v1 and loads back', () => {
    const m = memory();
    expect(saveSettings(m, { volume: 40, sensitivity: 0.6, colorBlind: true })).toBe(true);
    expect(Object.keys(m.data)).toEqual([SETTINGS_KEY]);
    expect(SETTINGS_KEY).toBe('dao-den-long.settings.v1');
    expect(loadSettings(m)).toEqual({ volume: 40, sensitivity: 0.6, colorBlind: true });
  });

  it('clamps out-of-range values', () => {
    expect(clampSettings({ volume: 250, sensitivity: 5, colorBlind: true })).toEqual({ volume: 100, sensitivity: 1, colorBlind: true });
    expect(clampSettings({ volume: -3, sensitivity: 0 })).toMatchObject({ volume: 0, sensitivity: 0.1 });
    expect(clampSettings({ volume: 33.6 }).volume).toBe(34);
  });

  it('falls back to defaults per field for wrong types and non-finite numbers', () => {
    expect(clampSettings({ volume: 'loud', sensitivity: NaN, colorBlind: 'yes' })).toEqual(DEFAULT_SETTINGS);
    expect(clampSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(clampSettings([1, 2])).toEqual(DEFAULT_SETTINGS);
    expect(clampSettings({ volume: Infinity }).volume).toBe(70);
  });

  it('invalid JSON or a throwing storage gives defaults and never throws', () => {
    expect(loadSettings(memory({ [SETTINGS_KEY]: '{not json' }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(memory({ [SETTINGS_KEY]: '"text"' }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(throwing)).toEqual(DEFAULT_SETTINGS);
    expect(saveSettings(throwing, DEFAULT_SETTINGS)).toBe(false);
    expect(saveSettings(null, DEFAULT_SETTINGS)).toBe(false);
  });
});
