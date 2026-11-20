import { describe, expect, it } from 'vitest';
import { createGame, TICK_RATE } from '../../src/core/sim';
import { TUNING } from '../../src/core/tuning';
import { blinkOn, carryCapacity, cooldownFraction, edgeArrow, FpsMeter, formatClock, isClockDanger, lanternsNeeded, nearestUnlit, promptLantern, type EdgeArrow } from '../../src/web/hudlogic';
import { formatDuration, introInfo, ONG_DANG_LINES } from '../../src/web/story';

describe('formatClock', () => {
  it('is mm:ss, rounded up to whole seconds', () => {
    expect(formatClock(240)).toBe('04:00');
    expect(formatClock(239.01)).toBe('04:00');
    expect(formatClock(59.2)).toBe('01:00');
    expect(formatClock(30)).toBe('00:30');
    expect(formatClock(0.2)).toBe('00:01');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(-5)).toBe('00:00');
    expect(formatClock(300)).toBe('05:00');
  });
  it('danger from 30 s on; 2 Hz blink', () => {
    expect(isClockDanger(30)).toBe(true);
    expect(isClockDanger(30.01)).toBe(false);
    expect([0, 0.2, 0.26, 0.49, 0.5, 0.76].map((t) => blinkOn(t))).toEqual([true, true, false, false, true, false]);
  });
});

describe('HUD numbers', () => {
  it('lanterns needed = ceil(0.6 x n); capacity 10..20; cooldown fraction', () => {
    expect([5, 6, 7].map((n) => lanternsNeeded(TUNING, n))).toEqual([3, 4, 5]);
    expect(carryCapacity({ successfulLights: 0 }, TUNING)).toBe(10);
    expect(carryCapacity({ successfulLights: 3 }, TUNING)).toBe(16);
    expect(carryCapacity({ successfulLights: 99 }, TUNING)).toBe(20);
    expect(cooldownFraction(0, 3, 60)).toBe(0);
    expect(cooldownFraction(90, 3, 60)).toBe(0.5);
    expect(cooldownFraction(9999, 3, 60)).toBe(1);
  });
});

describe('prompt and unlit lantern selection', () => {
  it('prompt: nearest lantern within interact_radius that is not full', () => {
    const g = createGame({ seed: 1, night: 1 });
    const s = g.state;
    const l0 = s.lanterns[0]!;
    s.player.pos = [l0.pos[0] + 1, 0, l0.pos[2]];
    expect(promptLantern(s, TUNING, TICK_RATE)?.id).toBe(l0.id);
    l0.lit = true;
    l0.fuelUnits = TUNING.fuel_max * TICK_RATE; // full: no prompt
    expect(promptLantern(s, TUNING, TICK_RATE)).toBeNull();
    l0.fuelUnits -= 1;
    expect(promptLantern(s, TUNING, TICK_RATE)?.id).toBe(l0.id);
    s.player.pos = [l0.pos[0] + TUNING.interact_radius + 0.01, 0, l0.pos[2]];
    expect(promptLantern(s, TUNING, TICK_RATE)).toBeNull();
  });

  it('nearestUnlit picks the closest unlit lantern, null when all are lit', () => {
    const s = createGame({ seed: 1, night: 2 }).state;
    s.player.pos = [s.lanterns[1]!.pos[0], 0, s.lanterns[1]!.pos[2]];
    expect(nearestUnlit(s)?.id).toBe(s.lanterns[1]!.id);
    s.lanterns[1]!.lit = true;
    expect(nearestUnlit(s)?.id).not.toBe(s.lanterns[1]!.id);
    for (const l of s.lanterns) l.lit = true;
    expect(nearestUnlit(s)).toBeNull();
  });
});

describe('edgeArrow', () => {
  const out: EdgeArrow = { visible: false, x: 0, y: 0, rotDeg: 0 };
  it('is hidden while the target is on screen', () => {
    expect(edgeArrow(0.3, -0.5, false, 1280, 720, 40, out).visible).toBe(false);
    expect(edgeArrow(1, 1, false, 1280, 720, 40, out).visible).toBe(false);
  });
  it('points to the right edge for a target far to the right', () => {
    const a = edgeArrow(3, 0, false, 1280, 720, 40, out);
    expect(a.visible).toBe(true);
    expect(a.x).toBeCloseTo(1280 - 40);
    expect(a.y).toBeCloseTo(360);
    expect(a.rotDeg).toBeCloseTo(90);
  });
  it('points up for a target above, left for a target left, down when exactly behind', () => {
    expect(edgeArrow(0, 4, false, 1280, 720, 40, out)).toMatchObject({ visible: true, rotDeg: 0 });
    expect(out.y).toBeCloseTo(40);
    expect(edgeArrow(-5, 0, false, 1280, 720, 40, out).rotDeg).toBeCloseTo(-90);
    const b = edgeArrow(0, 0, true, 1280, 720, 40, out);
    expect(b.visible).toBe(true);
    expect(Math.abs(b.rotDeg)).toBeCloseTo(180);
    expect(b.y).toBeCloseTo(720 - 40);
  });
  it('a target behind-left (mirrored NDC) points to the left', () => {
    const a = edgeArrow(0.5, 0, true, 1280, 720, 40, out); // behind a camera: x mirrored, so +0.5 means the left side
    expect(a.visible).toBe(true);
    expect(a.rotDeg).toBeCloseTo(-90);
  });
});

describe('FpsMeter', () => {
  it('averages over the last 2 s', () => {
    const m = new FpsMeter();
    for (let i = 0; i <= 240; i++) m.frame(i / 60); // 60 fps for 4 s
    expect(m.fps()).toBeGreaterThan(55);
    expect(m.fps()).toBeLessThan(65);
    for (let i = 1; i <= 120; i++) m.frame(4 + i / 30); // then 30 fps for 4 s
    expect(m.fps()).toBeGreaterThan(27);
    expect(m.fps()).toBeLessThan(33);
  });
  it('is 0 before any bucket completes', () => {
    const m = new FpsMeter();
    m.frame(0);
    expect(m.fps()).toBe(0);
  });
});

describe('intro screen data', () => {
  it('names, durations and lanterns needed per night; Ông Đăng lines', () => {
    const i1 = introInfo(1, TUNING);
    expect([i1.islandName, i1.durationS, i1.lanternTotal, i1.lanternsNeeded]).toEqual(['Đảo Bến', 240, 5, 3]);
    const i2 = introInfo(2, TUNING);
    expect([i2.islandName, i2.durationS, i2.lanternTotal, i2.lanternsNeeded]).toEqual(['Đảo Cau', 270, 6, 4]);
    const i3 = introInfo(3, TUNING);
    expect([i3.islandName, i3.durationS, i3.lanternTotal, i3.lanternsNeeded]).toEqual(['Đảo Chuông', 300, 7, 5]);
    expect(ONG_DANG_LINES[1]).toBe('Gió mùa về rồi con ạ. Thắp đèn, giữ lửa cho tới khi gà gáy.');
    expect(ONG_DANG_LINES[2]).toContain('Gió Lạc');
    expect(ONG_DANG_LINES[3]).toContain('Chuông');
    expect(formatDuration(240)).toBe('4 phút');
    expect(formatDuration(270)).toBe('4 phút 30 giây');
  });
});
