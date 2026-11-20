import { describe, expect, it } from 'vitest';
import { Rng, deriveSeed, fnv1a32, mulberry32 } from '../../src/core/rng';

function draw(rng: Rng, n: number): number[] {
  return Array.from({ length: n }, () => rng.next());
}

describe('rng', () => {
  it('same seed and label give the same sequence', () => {
    expect(draw(new Rng(42, 'motes'), 50)).toEqual(draw(new Rng(42, 'motes'), 50));
  });

  it('different seeds give different sequences', () => {
    expect(draw(new Rng(1, 'motes'), 10)).not.toEqual(draw(new Rng(2, 'motes'), 10));
  });

  it('different labels give different sequences (independent streams)', () => {
    expect(draw(new Rng(1, 'motes'), 10)).not.toEqual(draw(new Rng(1, 'shades'), 10));
    expect(deriveSeed(1, 'motes')).not.toBe(deriveSeed(1, 'shades'));
    expect(deriveSeed(1, 'extras')).not.toBe(deriveSeed(1, 'motes'));
  });

  it('negative and large seeds are accepted and stay deterministic', () => {
    expect(draw(new Rng(-5, 'x'), 5)).toEqual(draw(new Rng(-5, 'x'), 5));
    expect(deriveSeed(-1, 'x')).toBe(deriveSeed(0xffffffff, 'x'));
  });

  it('next() stays in [0, 1)', () => {
    const values = draw(new Rng(7, 'range'), 5000);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
  });

  it('range() and int() respect their bounds', () => {
    const rng = new Rng(3, 'bounds');
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const f = rng.range(-2, 5);
      expect(f).toBeGreaterThanOrEqual(-2);
      expect(f).toBeLessThan(5);
      seen.add(rng.int(0, 3));
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
  });

  it('hash and generator are the documented algorithms (known vectors)', () => {
    // FNV-1a 32-bit reference values.
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('a')).toBe(0xe40c292c);
    // mulberry32 is a pure function of its seed.
    const a = mulberry32(123);
    const b = mulberry32(123);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
