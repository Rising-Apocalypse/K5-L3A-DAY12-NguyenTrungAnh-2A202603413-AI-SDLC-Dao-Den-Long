import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TUNING, loadTuning } from '../../src/core/tuning';

const contract = JSON.parse(readFileSync('game.contract.json', 'utf8'));

describe('tuning', () => {
  it('TUNING is exactly the tuning block of game.contract.json', () => {
    expect(TUNING).toEqual(contract.tuning);
    expect(Object.isFrozen(TUNING)).toBe(true);
    expect(Object.isFrozen(TUNING.score)).toBe(true);
  });

  it('contract fixed keys are present', () => {
    expect(contract.contract_version).toBe('1.1');
    for (const key of ['team', 'build_cmd', 'run_cmd', 'headless_cmd']) {
      expect(typeof contract[key]).toBe('string');
    }
  });

  it('rejects a missing numeric key', () => {
    const bad = structuredClone(contract);
    delete bad.tuning.safe_radius;
    expect(() => loadTuning(bad)).toThrow(/safe_radius/);
  });

  it('rejects a mistyped value', () => {
    const bad = structuredClone(contract);
    bad.tuning.player_speed = '6';
    expect(() => loadTuning(bad)).toThrow(/player_speed/);
  });

  it('rejects a non-boolean fall_enabled and a missing score key', () => {
    const a = structuredClone(contract);
    a.tuning.fall_enabled = 1;
    expect(() => loadTuning(a)).toThrow(/fall_enabled/);
    const b = structuredClone(contract);
    delete b.tuning.score.per_mote;
    expect(() => loadTuning(b)).toThrow(/per_mote/);
  });

  it('rejects a document without a tuning object', () => {
    expect(() => loadTuning({})).toThrow(/tuning/);
  });
});
