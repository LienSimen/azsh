// Heartbeat resist — a negative aura rolls to break early on its own clock. A pure factory over the
// primitives, so the chip, the log line and the DR bookkeeping all reuse the existing break path.

import type { Rng } from '../core/rng.ts';

/** One armed holder: whose it is, what it rolls, and when the next roll is due. */
export interface HeartbeatHolder {
  /** Percentage points 0..100, already scaled by (1 + drLevel). */
  chancePercent: number;
  /** ms between rolls, floored at 1000. */
  intervalMs: number;
  /** Sim clock of the next roll. */
  nextRollAt: number;
}

// SetHeartbeatResist: the chance is the land die's miss and full-resist side times one plus the DR
// level, and the interval is the ORIGINAL duration over two plus it. Null means arm nothing.
export function armHeartbeatResist(args: {
  now: number;
  /** miss + full-resist percentage from the land roll — the SAME number the die used. */
  missPlusResistPercent: number;
  /** Aura duration before diminishing returns shortened it. */
  originalDurationMs: number;
  /** Diminishing step already taken on this group (0 for the first application). */
  drLevel: number;
}): HeartbeatHolder | null {
  const { now, missPlusResistPercent, originalDurationMs, drLevel } = args;
  if (!(missPlusResistPercent > 0)) return null;
  if (!(originalDurationMs > 0)) return null;
  const dr = Math.max(0, drLevel | 0);
  const chancePercent = missPlusResistPercent * (1 + dr);
  const intervalMs = Math.max(1000, Math.trunc(originalDurationMs / (2 + dr)));
  return { chancePercent, intervalMs, nextRollAt: now + intervalMs };
}

// One tick. The C++ catches up with a while, so a long tick may consume several intervals and the
// first successful roll wins. Returns true when the holder broke; the caller removes it.
export function tickHeartbeatResist(
  holder: HeartbeatHolder,
  now: number,
  rng: Rng,
): boolean {
  if (!(holder.chancePercent > 0) || !(holder.intervalMs > 0)) return false;
  while (now >= holder.nextRollAt) {
    holder.nextRollAt += holder.intervalMs;
    if (rng.chance(Math.min(1, holder.chancePercent / 100))) return true;
  }
  return false;
}
