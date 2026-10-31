// The next-due watermark for periodic session work — DoT ticks, aura expiry, heartbeat rolls, pool
// pulses — so the sweep is skipped entirely while the clock is short of it.

import type { GroundPool } from '../game/dynamicObject.ts';
import type { ActiveEffect } from './types.ts';

export const PERIODIC_DUE_NONE = Number.POSITIVE_INFINITY;

/** Soonest nextTickAt / expiresAt / heartbeat nextRollAt on one aura row. Dynobj DoTs tick on the pool clock. */
export function dueInstantOfEffect(e: ActiveEffect): number {
  let due = PERIODIC_DUE_NONE;
  if (
    e.nextTickAt !== undefined
    && e.tickMs !== undefined
    && e.tickMs > 0
    && !(e.kind === 'dot' && e.fromDynamicObject != null)
  ) {
    due = Math.min(due, e.nextTickAt);
  }
  if (Number.isFinite(e.expiresAt)) due = Math.min(due, e.expiresAt);
  // Heartbeat rolls on holder Update, not a DoT tick. A root with no periodic never woke until expiry, then the roll skipped.
  // Cite: SpellAuras.cpp:5710-5711.
  if (e.heartbeat && !e.broken && e.heartbeat.nextRollAt > 0) {
    due = Math.min(due, e.heartbeat.nextRollAt);
  }
  return due;
}

export function dueInstantOfPool(pool: GroundPool): number {
  let due = PERIODIC_DUE_NONE;
  if (pool.tickMs > 0) due = Math.min(due, pool.nextTickAt);
  if (Number.isFinite(pool.expiresAt)) due = Math.min(due, pool.expiresAt);
  return due;
}

export function dueInstantOfTotem(tot: { totemExpiresAt?: number }): number {
  const at = tot.totemExpiresAt;
  return at != null && Number.isFinite(at) ? at : PERIODIC_DUE_NONE;
}

export function recomputePeriodicDue(
  effects: readonly ActiveEffect[],
  totems: Iterable<{ totemExpiresAt?: number }>,
  pools: readonly GroundPool[],
): number {
  let due = PERIODIC_DUE_NONE;
  for (const e of effects) due = Math.min(due, dueInstantOfEffect(e));
  for (const tot of totems) due = Math.min(due, dueInstantOfTotem(tot));
  for (const pool of pools) due = Math.min(due, dueInstantOfPool(pool));
  return due;
}

export function lowerPeriodicDue(current: number, at: number): number {
  return typeof at === 'number' && Number.isFinite(at) && at < current ? at : current;
}
