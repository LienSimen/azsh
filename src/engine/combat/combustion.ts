// Combustion 11129: a fire HIT stacks 28682 for +10% crit, a fire CRIT spends one of three charges.
// Cite: UnitAuraProcHandler.cpp:991-1003 case 11129; Unit.cpp:5372-5375 paired removal.

import type { SpellEffect } from '../../data/schema.ts';
import { addOwnedSpellMods, stripOwnedSpellMods, SPELLMOD_CRITICAL_CHANCE } from '../spells/spellModIntents.ts';
import { COMBUSTION_SCHOOL } from '../spells/cmangos-special-cases-combustion.ts';
import type { Fighter } from './types.ts';

/** SpellFamilyName for the mage — 28682 only lifts mage spell crit. Cite: SharedDefines.h. */
const SPELLFAMILY_MAGE = 3;

/** DurationIndex 21 is until-cancelled, so the chip needs a timer the fight never reaches. */
export const COMBUSTION_UNTIL_CANCELLED_MS = 600_000;

export type CombustionEffect = Extract<SpellEffect, { kind: 'combustion' }>;

/** The armed Combustion payload on this caster's kit, or null when the buff is not up. */
export function combustionEffectOf(f: Fighter): CombustionEffect | null {
  if (f.combustionCharges <= 0) return null;
  for (const sp of f.spec.spells) {
    for (const e of sp.effects) if (e.kind === 'combustion') return e;
  }
  return null;
}

// The stack count IS the crit modifier, so both move together — one SpellModifier row on 28682
// carrying stacks x critPerStack, replaced in place. Cite: SpellAuras.cpp HandleAddModifier.
export function setCombustionStacks(f: Fighter, eff: CombustionEffect, stacks: number): void {
  const n = Math.max(0, Math.min(eff.maxStacks, stacks | 0));
  f.combustionStacks = n;
  stripOwnedSpellMods(f, eff.stackSpellId);
  if (n <= 0) return;
  addOwnedSpellMods(f, [{
    spellId: eff.stackSpellId,
    op: SPELLMOD_CRITICAL_CHANCE,
    type: 'flat',
    value: n * eff.critPerStack,
    familyName: SPELLFAMILY_MAGE,
    familyFlags: 0,
  }]);
}

/** Drop the whole thing — the C++ removes 28682 and 11129 together. Cite: Unit.cpp:5372-5375. */
export function clearCombustion(f: Fighter, stackSpellId: number): void {
  f.combustionCharges = 0;
  f.combustionStacks = 0;
  stripOwnedSpellMods(f, stackSpellId);
}

// One fire spell landing. True when the last charge went, so the caller drops both auras.
// Cite: UnitAuraProcHandler.cpp:993-1002.
export function combustionOnSpellLand(
  f: Fighter,
  eff: CombustionEffect,
  school: string | undefined,
  wasCrit: boolean,
): boolean {
  if (school !== COMBUSTION_SCHOOL) return false;
  // Last charge and a crit: remove the stacks and end it. The hit does not add a stack first.
  if (f.combustionCharges <= 1 && wasCrit) {
    clearCombustion(f, eff.stackSpellId);
    return true;
  }
  setCombustionStacks(f, eff, f.combustionStacks + 1);
  // Charge counting happens at crit hits only — a non-crit stacks for free.
  if (wasCrit) f.combustionCharges -= 1;
  return false;
}
