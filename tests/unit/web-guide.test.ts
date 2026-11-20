import { describe, expect, it } from 'vitest';
import { createGame, TICK_RATE } from '../../src/core/sim';
import { TUNING } from '../../src/core/tuning';
import { FireflyGuide, GUIDE_COOLDOWN_S, GUIDE_DURATION_S, GUIDE_FIREFLIES, GUIDE_MAX_LENGTH, guidePoint, helpTarget } from '../../src/extras/guide';

const low = TUNING.low_fuel_threshold;
const full = TUNING.fuel_max * TICK_RATE;

describe('helpTarget', () => {
  it('picks the nearest unlit lantern', () => {
    const s = createGame({ seed: 1, night: 1 }).state;
    s.player.pos = [...s.lanterns[2]!.pos];
    expect(helpTarget(s, low, TICK_RATE)?.id).toBe(s.lanterns[2]!.id);
  });
  it('a lit lantern with fuel below the threshold needs help too; a healthy lit one does not', () => {
    const s = createGame({ seed: 1, night: 1 }).state;
    for (const l of s.lanterns) {
      l.lit = true;
      l.fuelUnits = full;
    }
    s.player.pos = [...s.lanterns[0]!.pos];
    s.lanterns[3]!.fuelUnits = low * TICK_RATE - 1;
    expect(helpTarget(s, low, TICK_RATE)?.id).toBe(s.lanterns[3]!.id);
    s.lanterns[3]!.fuelUnits = low * TICK_RATE; // exactly 30 is not below 30
    expect(helpTarget(s, low, TICK_RATE)?.id).toBe(s.lanterns[0]!.id); // nobody needs help: nearest lit
  });
  it('an unlit far lantern beats a nearer healthy lit one', () => {
    const s = createGame({ seed: 1, night: 1 }).state;
    for (const l of s.lanterns) {
      l.lit = true;
      l.fuelUnits = full;
    }
    s.player.pos = [...s.lanterns[0]!.pos];
    s.lanterns[4]!.lit = false;
    expect(helpTarget(s, low, TICK_RATE)?.id).toBe(s.lanterns[4]!.id);
  });
  it('null with no lanterns', () => {
    const s = createGame({ seed: 1, night: 1 }).state;
    s.lanterns = [];
    expect(helpTarget(s, low, TICK_RATE)).toBeNull();
  });
});

describe('guidePoint', () => {
  it('stays between Mây and the lantern (at most 30 m along the way), above the ground', () => {
    const out = new Float32Array(3);
    const from: [number, number, number] = [0, 0, 0];
    const to: [number, number, number] = [0, 0, 100];
    for (let i = 0; i < GUIDE_FIREFLIES; i++) {
      for (const t of [0, 0.7, 1.9, 2.9]) {
        guidePoint(i, GUIDE_FIREFLIES, t, from, to, out, 0);
        expect(out[2]!).toBeGreaterThanOrEqual(-1e-6);
        expect(out[2]!).toBeLessThanOrEqual(GUIDE_MAX_LENGTH + 1e-6);
        expect(out[1]!).toBeGreaterThan(0.5);
      }
    }
  });
  it('flows outwards over time and wraps', () => {
    const a = new Float32Array(3);
    const b = new Float32Array(3);
    guidePoint(0, 12, 0, [0, 0, 0], [0, 0, 10], a, 0);
    guidePoint(0, 12, 0.5, [0, 0, 0], [0, 0, 10], b, 0);
    expect(b[2]!).toBeGreaterThan(a[2]!);
  });
  it('does not blow up when Mây stands on the lantern', () => {
    const out = new Float32Array(3);
    guidePoint(3, 12, 1, [5, 0, 5], [5, 0, 5], out, 0);
    expect([...out].every(Number.isFinite)).toBe(true);
  });
});

describe('FireflyGuide controller', () => {
  it('H starts a 3 s trail towards the target, then a 10 s cooldown from the press', () => {
    const s = createGame({ seed: 1, night: 1 }).state;
    const g = new FireflyGuide();
    g.update(0.016, false, s, low, TICK_RATE);
    expect(g.active).toBe(false);
    g.update(0.016, true, s, low, TICK_RATE);
    expect(g.active).toBe(true);
    expect(g.targetId).not.toBeNull();
    expect(GUIDE_DURATION_S).toBe(3);
    expect(g.cooldownFraction).toBe(1);
    g.update(1, false, s, low, TICK_RATE);
    expect(g.fade).toBeGreaterThan(0.9);
    g.update(2.1, false, s, low, TICK_RATE);
    expect(g.active).toBe(false);
    expect(g.cooldownFraction).toBeGreaterThan(0);
    g.update(0.1, true, s, low, TICK_RATE); // still cooling: ignored
    expect(g.active).toBe(false);
    g.update(GUIDE_COOLDOWN_S, false, s, low, TICK_RATE);
    expect(g.cooldownFraction).toBe(0);
    g.update(0.016, true, s, low, TICK_RATE);
    expect(g.active).toBe(true);
  });
  it('does nothing after the night ended, never writes the game state, and reset clears it', () => {
    const s = createGame({ seed: 1, night: 1 }).state;
    const before = JSON.stringify(s);
    const g = new FireflyGuide();
    g.update(0.016, true, s, low, TICK_RATE);
    g.update(0.5, false, s, low, TICK_RATE);
    expect(JSON.stringify(s)).toBe(before);
    g.reset();
    expect(g.active).toBe(false);
    expect(g.cooldownFraction).toBe(0);
    s.state = 'lost';
    g.update(0.016, true, s, low, TICK_RATE);
    expect(g.active).toBe(false);
  });
});
