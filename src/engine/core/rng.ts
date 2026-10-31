// Deterministic PRNG: same seed, same fight, so a replay equals its auto-resolve. The engine never
// touches the global Math.random — it takes an Rng instance instead.

export interface Rng {
  /** float in [0, 1) */
  next(): number;
  /** integer in [minIncl, maxIncl] */
  int(minIncl: number, maxIncl: number): number;
  /** true with probability p (0..1) */
  chance(p: number): boolean;
}

/** mulberry32: tiny, fast, deterministic 32-bit PRNG. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (minIncl: number, maxIncl: number): number =>
      minIncl + Math.floor(next() * (maxIncl - minIncl + 1)),
    chance: (p: number): boolean => next() < p,
  };
}

/** Stable 32-bit hash to derive sub-seeds (e.g. per-fight) from a base seed. */
export function hashSeed(base: number, salt: number): number {
  let h = (base ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ salt, 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
