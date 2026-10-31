// UNIT_FLAG_IN_COMBAT for the session — a port of the combat timer. Each combat touch re-arms 5 s;
// at 0 with no hostile refs the flag clears. Non-combat spells refuse while it is set.

import type { Fighter } from './types.ts';
import { PVP_COMBAT_TIMER_MS } from './types.ts';
import { CREATURE_EXTRA_FLAG } from '../../domain/creature/creatureAiConstants.ts';

/** Refresh / enter combat for `f`. PvP timer always (BG + player-controlled path). */
export function touchCombatFlag(f: Fighter, now: number, timerMs = PVP_COMBAT_TIMER_MS): void {
  if (!(f.hp > 0)) return;
  if (f.combatEnteredAt === 0) {
    f.combatEnteredAt = now;
    f.decideDirty = true;
  }
  f.combatUntil = Math.max(f.combatUntil, now + timerMs);
}

/** True while the combat flag is still hot. */
export function fighterIsInCombat(f: Fighter, now: number): boolean {
  return f.combatUntil > now;
}

/** Ms since THIS unit entered combat. 0 while OOC — not session/fight clock. */
export function fighterCombatTimeMs(f: Fighter, now: number): number {
  if (f.combatEnteredAt <= 0 || f.combatUntil <= now) return 0;
  return Math.max(0, now - f.combatEnteredAt);
}

/** CREATURE_EXTRA_FLAG_AGGRO_ZONE — raid bosses only (MC/BWL/ZG/AQ/Naxx/Ony). */
export function fighterHasAggroZone(f: Fighter): boolean {
  return ((f.spec.extraFlags ?? 0) & CREATURE_EXTRA_FLAG.AGGRO_ZONE) !== 0;
}

/** SetInCombatWithZone — every living party body. Cite: Creature.cpp:2310–2352. */
export function pulsePartyCombat(units: readonly (Fighter | null | undefined)[], now: number): void {
  for (const u of units) {
    if (u) touchCombatFlag(u, now);
  }
}

/** If `enemy` is AGGRO_ZONE, the whole raid enters combat on that pull. */
export function maybeAggroZonePulse(
  enemy: Fighter,
  party: readonly (Fighter | null | undefined)[],
  now: number,
): void {
  if (!fighterHasAggroZone(enemy)) return;
  pulsePartyCombat(party, now);
}

export function clearCombatFlag(f: Fighter): void {
  f.combatUntil = 0;
  f.combatEnteredAt = 0;
  f.chargeUsed = false;
  f.decideDirty = true;
  // "The party is killing this body" is a fact about ONE fight. A mob that dropped combat
  // (evade / reset) may be CC'd again on the next pull. Cite: Fighter.ccDamageBrokenBy.
  f.ccDamageBrokenBy = undefined;
}

// End a live Feign Death pose (ACTION / ATTACKING interrupt). Returns the aura spell id so the caller can
// fade the chip. Cite: SpellDefines AURA_INTERRUPT ACTION+ATTACKING on 5384 (AuraInterruptFlags 0x3c3c).
export function dropFeignDeath(f: Fighter): number {
  const sid = f.feignSpellId | 0;
  if (f.feigningUntil <= 0 && sid === 0) return 0;
  f.feigningUntil = 0;
  f.feignSpellId = 0;
  return sid;
}

// Drop the flag when the timer expires. Clears chargeUsed so the next engagement can Charge (Charge is
// once-per-combat, re-armed by leaving combat — not by CD alone).
export function expireCombatFlag(f: Fighter, now: number): void {
  if (f.combatUntil > 0 && f.combatUntil <= now) {
    clearCombatFlag(f);
  }
}
