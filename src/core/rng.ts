/**
 * Deterministic randomness. Nothing in core may use Math.random: every random draw goes through an Rng
 * created from `deriveSeed(seed, label)`. Each subsystem owns its own labelled stream ("motes", "shades",
 * "extras"), so adding draws in one subsystem never shifts the numbers another one sees.
 */

/** mulberry32: small, fast 32-bit PRNG. Returns a function producing floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit hash of a string (UTF-16 code units). */
export function fnv1a32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Derive an independent stream seed from the run seed and a label (FNV-1a of the label, mixed with the seed). */
export function deriveSeed(seed: number, label: string): number {
  let h = (fnv1a32(label) ^ Math.imul(seed >>> 0, 0x9e3779b1)) >>> 0;
  // murmur3 finaliser so nearby seeds give unrelated streams
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export class Rng {
  private readonly nextRaw: () => number;

  constructor(seed: number, label: string) {
    this.nextRaw = mulberry32(deriveSeed(seed, label));
  }

  /** Float in [0, 1). */
  next(): number {
    return this.nextRaw();
  }

  /** Float in [a, b). */
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }

  /** Integer in [a, b] (both ends inclusive). */
  int(a: number, b: number): number {
    return a + Math.floor(this.next() * (b - a + 1));
  }
}
