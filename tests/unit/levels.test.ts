// The pure level module (src/core/levels.ts). Expected heights and positions are worked out by hand from
// docs/plans/04-phase2-nights-2-3-core.md section 2.
import { describe, expect, it } from 'vitest';
import { getLevel } from '../../src/core/levels';
import { buildLanterns, buildMotes } from '../../src/core/level';

describe('getLevel', () => {
  it('knows nights 1-3 only', () => {
    expect([1, 2, 3].map((n) => getLevel(n).night)).toEqual([1, 2, 3]);
    for (const bad of [0, 4, -1, 1.5]) expect(() => getLevel(bad)).toThrow();
  });

  it('Night 1 has every new behaviour switched off (that is what keeps it byte-identical)', () => {
    const l = getLevel(1);
    expect([l.shadesAvoidVoid, l.terrainY, l.walls, l.drifters, l.wind]).toEqual([false, false, false, false, false]);
    expect(l.jumpPads).toEqual([]);
    expect(l.charmPositions).toEqual([]);
    expect([l.shadeSpawnEvery, l.shadeMax]).toEqual([480, 6]);
    expect(l.groundAt(40, 0)).toBe(0); // radius 40 is still ground
    expect(l.groundAt(40.001, 0)).toBeNull();
    expect(l.blocked(0, 0, 0)).toBe(false);
    expect(buildLanterns(l)).toEqual(buildLanterns());
    expect(buildMotes(3, l)).toEqual(buildMotes(3));
  });

  it('Night 2: two islands of radius 28 at (0,0) and (70,0) and a bridge 26 <= x <= 44, |z| <= 2', () => {
    const l = getLevel(2);
    expect([l.shadesAvoidVoid, l.terrainY, l.walls, l.drifters, l.wind]).toEqual([true, true, false, true, false]);
    expect([l.shadeSpawnEvery, l.shadeMax]).toEqual([420, 8]);
    expect(l.groundAt(28, 0)).toBe(0);
    expect(l.groundAt(0, 28.001)).toBeNull();
    expect(l.groundAt(98, 0)).toBe(0); // 70 + 28
    expect(l.groundAt(98.001, 0)).toBeNull();
    expect(l.groundAt(35, 2)).toBe(0); // bridge edge
    expect(l.groundAt(35, -2)).toBe(0);
    expect(l.groundAt(35, 2.01)).toBeNull();
    expect(l.groundAt(35, 0)).toBe(0);
    expect(l.groundAt(70, 28)).toBe(0);
    expect(l.groundAt(50, 20)).toBeNull(); // hypot(-20, 20) = 28.28 from B
    // 24 mote points (12 per island), 16 shade points (8 per island).
    expect(l.moteSpawnPoints).toHaveLength(24);
    expect(l.shadeSpawnPoints).toHaveLength(16);
    expect(l.moteSpawnPoints[0]).toEqual([10, 0, 0]); // island A, ring r=10, angle 0
    expect(l.moteSpawnPoints[12]![0]).toBeCloseTo(80, 9); // island B, same ring: 70 + 10
    expect(l.moteSpawnPoints.every((p) => l.groundAt(p[0], p[2]) === 0)).toBe(true);
    expect(l.shadeSpawnPoints.every((p) => l.groundAt(p[0], p[2]) === 0)).toBe(true);
    expect(l.lanternPositions.every((p) => l.groundAt(p[0], p[2]) === 0)).toBe(true);
    // Pads: vy 14; horizontal 24 m/s towards the other island's centre: pad 1 (20,18) -> (70,0): (50,-18)/53.1413 * 24.
    expect(l.jumpPads.map((p) => [p.center, p.vy])).toEqual([[[20, 0, 18], 14], [[50, 0, -18], 14]]);
    expect(l.jumpPads[0]!.vxz[0]).toBeCloseTo((24 * 50) / Math.sqrt(2824), 9);
    expect(l.jumpPads[0]!.vxz[1]).toBeCloseTo((-24 * 18) / Math.sqrt(2824), 9);
    expect(l.jumpPads[1]!.vxz[0]).toBeCloseTo((-24 * 50) / Math.sqrt(2824), 9);
    expect(l.jumpPads[1]!.vxz[1]).toBeCloseTo((24 * 18) / Math.sqrt(2824), 9);
    expect(l.blocked(0, 0, 0)).toBe(false);
  });

  it('Night 3: tiers 6 / 3 / 0, ramps, the tower and the void beyond r = 45', () => {
    const l = getLevel(3);
    expect([l.shadesAvoidVoid, l.terrainY, l.walls, l.drifters, l.wind]).toEqual([true, true, true, true, true]);
    expect([l.shadeSpawnEvery, l.shadeMax]).toEqual([360, 10]);
    expect(l.shadeSpeed({ shade_speed: 4 } as never)).toBe(4.5);
    expect(l.groundAt(0, 0)).toBe(6);
    expect(l.groundAt(8, 0)).toBe(6); // r = 8 is tier 2
    expect(l.groundAt(0, -8.001)).toBe(0);
    expect(l.groundAt(0, 12)).toBe(3); // tier 1: z > 0 and 12 <= r <= 24
    expect(l.groundAt(0, 11.999)).toBe(0);
    expect(l.groundAt(0, 24)).toBe(3);
    expect(l.groundAt(0, 24.001)).toBe(0);
    expect(l.groundAt(0, -12)).toBe(0); // z <= 0: no tier 1
    expect(l.groundAt(45, 0)).toBe(0);
    expect(l.groundAt(45.001, 0)).toBeNull();
    // Ramp at 30 degrees: u = (cos 30, sin 30). Along 27, across 0 -> 3 * (30 - 27) / 6 = 1.5; along 30 -> 0; along 24.0 -> 3.
    expect(l.groundAt(27 * 0.8660254037844386, 13.5)).toBeCloseTo(1.5, 9);
    expect(l.groundAt(30 * 0.8660254037844386, 15)).toBeCloseTo(0, 9);
    expect(l.groundAt(24.0001 * 0.8660254037844386, 12.00005)).toBeCloseTo(3, 3);
    // Same ramp at 150 degrees: u = (-0.866, 0.5).
    expect(l.groundAt(-27 * 0.8660254037844386, 13.5)).toBeCloseTo(1.5, 9);
    // Across 1.4 (inside the +-1.5 width): point 27 u + 1.4 n, n = (-0.5, 0.866): still 1.5.
    expect(l.groundAt(27 * 0.8660254037844386 - 0.7, 13.5 + 1.4 * 0.8660254037844386)).toBeCloseTo(1.5, 9);
    // Tower: r < 2 and y < 14.
    expect(l.blocked(1.99, 13.99, 0)).toBe(false);
    expect(l.blocked(1.99, 0, 6)).toBe(true);
    expect(l.blocked(2, 0, 6)).toBe(false); // r = 2 is not inside
    expect(l.blocked(0, 0, 13.99)).toBe(true);
    expect(l.blocked(0, 0, 14)).toBe(false);
    expect(l.jumpPads).toEqual([{ center: [0, 3, 13], vy: 12, vxz: [0, -8] }]);
    expect(l.playerStart).toEqual([0, 0, -30]);
    // 30 mote points: 18 + 8 + 4; every spawn point has ground exactly at its height.
    expect(l.moteSpawnPoints).toHaveLength(30);
    expect(l.moteSpawnPoints.every((p) => Math.abs((l.groundAt(p[0], p[2]) ?? NaN) - p[1]) < 1e-9)).toBe(true);
    expect(l.lanternPositions.every((p) => Math.abs((l.groundAt(p[0], p[2]) ?? NaN) - p[1]) < 1e-9)).toBe(true);
    expect(l.shadeSpawnPoints).toHaveLength(16);
  });

  it('buildMotes picks 20 distinct points of the level, ids M1..M20', () => {
    for (const n of [2, 3]) {
      const l = getLevel(n);
      const motes = buildMotes(9, l);
      expect(motes.map((m) => m.id)).toEqual(Array.from({ length: 20 }, (_, i) => `M${i + 1}`));
      expect(new Set(motes.map((m) => m.pos.join(','))).size).toBe(20);
      for (const m of motes) expect(l.moteSpawnPoints.some((p) => p.join(',') === m.pos.join(','))).toBe(true);
    }
  });
});
