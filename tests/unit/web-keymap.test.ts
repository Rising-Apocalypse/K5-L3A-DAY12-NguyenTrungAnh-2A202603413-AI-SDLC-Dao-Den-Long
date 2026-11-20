import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  conflictText,
  DEFAULT_KEYMAP,
  findConflicts,
  gameCodes,
  isActionDown,
  isReserved,
  keyLabel,
  rebind,
  RESERVED_CODES,
  sanitizeKeymap,
  type KeyMap,
} from '../../src/web/keymap';

describe('keymap', () => {
  it('defaults: WASD, Space, Shift, E, F, P and no conflicts', () => {
    expect(DEFAULT_KEYMAP).toEqual({
      up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', dash: 'ShiftLeft', interact: 'KeyE', pulse: 'KeyF', pause: 'KeyP',
    });
    expect(ACTIONS).toHaveLength(9);
    expect(findConflicts(DEFAULT_KEYMAP)).toEqual([]);
  });

  it('rebind returns a new map and leaves the old one alone', () => {
    const r = rebind(DEFAULT_KEYMAP, 'jump', 'KeyX');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.map.jump).toBe('KeyX');
      expect(r.map.dash).toBe('ShiftLeft');
    }
    expect(DEFAULT_KEYMAP.jump).toBe('Space');
  });

  it('reserved codes cannot be bound and give a message', () => {
    expect(RESERVED_CODES).toEqual(['Escape', 'KeyR', 'KeyC', 'KeyH', 'BracketLeft', 'BracketRight']);
    for (const code of RESERVED_CODES) {
      expect(isReserved(code)).toBe(true);
      const r = rebind(DEFAULT_KEYMAP, 'pulse', code);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason.length).toBeGreaterThan(0);
    }
    expect(isReserved('KeyX')).toBe(false);
  });

  it('a duplicate is allowed but reported on both actions', () => {
    const r = rebind(DEFAULT_KEYMAP, 'dash', 'Space');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(findConflicts(r.map)).toEqual([{ code: 'Space', actions: ['jump', 'dash'] }]);
    expect(conflictText(r.map, 'jump')).toBe('Trùng phím với Lướt');
    expect(conflictText(r.map, 'dash')).toBe('Trùng phím với Nhảy');
    expect(conflictText(r.map, 'pulse')).toBeNull();
  });

  it('three actions on one code are one conflict listing all three', () => {
    const m: KeyMap = { ...DEFAULT_KEYMAP, jump: 'KeyX', dash: 'KeyX', pulse: 'KeyX' };
    expect(findConflicts(m)).toEqual([{ code: 'KeyX', actions: ['jump', 'dash', 'pulse'] }]);
    expect(conflictText(m, 'jump')).toBe('Trùng phím với Lướt, Toả sáng');
  });

  it('sanitizeKeymap migrates missing / wrong / reserved entries to defaults', () => {
    expect(sanitizeKeymap(undefined)).toEqual(DEFAULT_KEYMAP);
    expect(sanitizeKeymap('x')).toEqual(DEFAULT_KEYMAP);
    expect(sanitizeKeymap({ jump: 'KeyX', dash: 5, pulse: 'Escape', pause: '' })).toEqual({ ...DEFAULT_KEYMAP, jump: 'KeyX' });
  });

  it('arrow keys and Esc stay as fixed secondary keys unless another action took them', () => {
    const only = (...codes: string[]) => (c: string) => codes.includes(c);
    expect(isActionDown(DEFAULT_KEYMAP, 'up', only('ArrowUp'))).toBe(true);
    expect(isActionDown(DEFAULT_KEYMAP, 'up', only('KeyW'))).toBe(true);
    expect(isActionDown(DEFAULT_KEYMAP, 'pause', only('Escape'))).toBe(true);
    expect(isActionDown(DEFAULT_KEYMAP, 'jump', only('ArrowUp'))).toBe(false);
    const m = rebind(DEFAULT_KEYMAP, 'jump', 'ArrowUp');
    if (!m.ok) throw new Error('rebind failed');
    expect(isActionDown(m.map, 'up', only('ArrowUp'))).toBe(false);
    expect(isActionDown(m.map, 'jump', only('ArrowUp'))).toBe(true);
    expect(isActionDown(m.map, 'up', only('KeyW'))).toBe(true);
  });

  it('a remapped key is the one that counts', () => {
    const m = rebind(DEFAULT_KEYMAP, 'interact', 'KeyQ');
    if (!m.ok) throw new Error('rebind failed');
    expect(isActionDown(m.map, 'interact', (c) => c === 'KeyQ')).toBe(true);
    expect(isActionDown(m.map, 'interact', (c) => c === 'KeyE')).toBe(false);
    expect(gameCodes(m.map).has('KeyQ')).toBe(true);
    expect(gameCodes(m.map).has('KeyE')).toBe(false);
    expect(gameCodes(DEFAULT_KEYMAP).has('KeyR')).toBe(true);
  });

  it('key labels', () => {
    expect(keyLabel('KeyW')).toBe('W');
    expect(keyLabel('Digit5')).toBe('5');
    expect(keyLabel('Space')).toBe('Space');
    expect(keyLabel('ShiftLeft')).toBe('Shift trái');
    expect(keyLabel('ArrowLeft')).toBe('←');
    expect(keyLabel('F5')).toBe('F5');
  });
});
