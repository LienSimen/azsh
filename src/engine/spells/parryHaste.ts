// Parry haste — shorten the defender's remaining melee swing timer. Cite: Unit.cpp:2158–2195
// DealMeleeDamage VICTIMSTATE_PARRY.

import { CREATURE_EXTRA_FLAG } from '../../domain/creature/creatureAiConstants.ts';

/** Creature.h CREATURE_EXTRA_FLAG_NO_PARRY_HASTEN. ExtraFlags is the raw bake. */
export function creatureSkipsParryHaste(extraFlags: number | undefined): boolean {
  return ((extraFlags ?? 0) & CREATURE_EXTRA_FLAG.NO_PARRY_HASTEN) !== 0;
}

// New remaining ms after a parry. `attackTimeMs` is GetAttackTime for that hand (hasted period). Remaining
// > 60% of period: subtract 40%. (20%, 60%]: snap to 20%. ≤20%: unchanged.
export function parryHasteRemaining(remainingMs: number, attackTimeMs: number): number {
  if (!(remainingMs > 0) || !(attackTimeMs > 0)) return remainingMs;
  const percent20 = attackTimeMs * 0.20;
  const percent60 = 3.0 * percent20;
  if (remainingMs > percent20 && remainingMs <= percent60) return percent20;
  if (remainingMs > percent60) return remainingMs - 2.0 * percent20;
  return remainingMs;
}
