// creature_template.Leash — a per-creature evade radius, measured PLANAR from where that creature
// entered combat. There is NO default: an absent field means no check at all. Baked on 14 creatures.
import { detHypot } from '../core/detMath.ts';

export const COMBAT_DROP_YD = 90;

export type LeashPoint = { x: number; y: number };

/** One engaged hostile's leash inputs, in world yards. */
export type LeashUnit = {
  side: string;
  /** Baked `CreatureDef.leash`. Absent / 0 = this creature has no leash check. */
  leashYd?: number;
  /** Where it entered combat. Absent = not stamped yet, so nothing to measure against. */
  home?: LeashPoint;
  /** Where it is now. */
  at?: LeashPoint | null;
};

/** Planar distance from combat start, or null when any input is missing. */
export function leashDistanceYd(u: LeashUnit): number | null {
  if (!u.home || !u.at) return null;
  return detHypot(u.at.x - u.home.x, u.at.y - u.home.y);
}

/** True when this creature is past its own sourced leash radius. */
export function isLeashBroken(u: LeashUnit): boolean {
  if (!u.leashYd || u.leashYd <= 0) return false;
  const d = leashDistanceYd(u);
  return d != null && d > u.leashYd;
}

// The first engaged hostile dragged past its own leash, or null. Returned rather than acted on so the
// caller owns the evade seam (and so this stays pure for the gate).
export function firstLeashBreach(units: readonly LeashUnit[]): LeashUnit | null {
  for (const u of units) if (isLeashBroken(u)) return u;
  return null;
}
