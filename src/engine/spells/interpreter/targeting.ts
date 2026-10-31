// Implicit-target helpers ported from map-spell-effects.mjs (bake oracle surface). Cite:
// SpellTargetDefines.h; map-spell-effects.mjs HOSTILE_IMPLICIT / buffApplyTo.

import type { BuffMod } from '../../../data/schema.ts';
import {
  SPELL_EFFECT_APPLY_AREA_AURA_PARTY,
} from './opcodes.ts';

// Implicit targetA values that mean a hostile unit, matching the enricher's final bake. The
// source-enemy AoE value is excluded: many creature buffs misuse it and bake as non-hostile.
export const HOSTILE_IMPLICIT = new Set([2, 6, 15, 16, 24, 28, 36, 54]);
// Party target values. Without them a negative-amount party buff — Greater Blessing of Salvation's
// -30% threat — fell through the amount heuristic and materialized as an enemy debuff.
const SELF_FRIEND_IMPLICIT = new Set([1, 3, 5, 20, 21, 27, 29, 30, 31, 33, 34, 35, 37, 45, 56, 57, 58, 61]);
// Area enumerators only. Cite: SpellMgr.h IsAreaEffectPositiveTarget (20/30/31/33/34/37/56/61).
// TARGET_UNIT_PARTY 35 / TARGET_UNIT_RAID 57 / TARGET_UNIT_RAID_NEAR_CASTER 58 are one selected unit.
const PARTY_IMPLICIT = new Set([20, 33, 34, 37, 56, 61]);
const FRIEND_IMPLICIT = new Set([3, 21, 29, 30, 31, 35, 45, 57, 58, 59]);
const PET_IMPLICIT = new Set([5]);
const APPLY_TO_RANK: Record<'pet' | 'friendly' | 'party', number> = { pet: 1, friendly: 2, party: 3 };

/** TARGET_UNIT_CASTER_PET — periodic heal on pet maps to flat heal in bake. */
export const TARGET_PET = 5;

/** TARGET_UNIT_CASTER_MASTER — pet ability lands on owner (Voidwalker Sacrifice absorb). */
export const TARGET_CASTER_MASTER = 27;

// EffectMiscValue for MOD_STAT → BuffMod. Cite: map-spell-effects.mjs STAT_MOD; SpellAuras.cpp
// HandleAuraModStat (misc < 0 ⇒ all stats — we accept -1 and -2 as all_stats per C++).
export const STAT_MOD: Record<string, BuffMod> = {
  '-2': 'all_stats',
  '-1': 'all_stats',
  '0': 'strength',
  '1': 'agility',
  '2': 'stamina',
  '3': 'intellect',
  '4': 'spirit',
};

// The PERCENT twin for the two percent-stat auras. A single-stat percent must never borrow the flat
// name above: Demonic Embrace's +15% stamina baked as +15 flat until this split landed.
export const STAT_MOD_PCT: Record<string, BuffMod> = {
  '-2': 'all_stats_pct',
  '-1': 'all_stats_pct',
  '0': 'strength_pct',
  '1': 'agility_pct',
  '2': 'stamina_pct',
  '3': 'intellect_pct',
  '4': 'spirit_pct',
};

export function withHostile<T extends Record<string, unknown>>(
  obj: T,
  tgtA: number,
  amount: number,
  tgtB?: number,
): T & { hostile: boolean } {
  const a = tgtA | 0;
  const b = (tgtB ?? 0) | 0;
  // targetB 15 (AREA_ENEMY) on dest-at-src (22) is Frost Nova / Psychic Scream.
  if (HOSTILE_IMPLICIT.has(a) || HOSTILE_IMPLICIT.has(b)) return { ...obj, hostile: true };
  if (SELF_FRIEND_IMPLICIT.has(a) && !HOSTILE_IMPLICIT.has(b)) return { ...obj, hostile: false };
  if (amount < 0) return { ...obj, hostile: true };
  return { ...obj, hostile: false };
}

function buffApplyTo(
  eff: number,
  tgtA: number,
): 'party' | 'friendly' | 'pet' | undefined {
  if ((eff | 0) === SPELL_EFFECT_APPLY_AREA_AURA_PARTY) return 'party';
  const t = tgtA | 0;
  if (PARTY_IMPLICIT.has(t)) return 'party';
  if (FRIEND_IMPLICIT.has(t)) return 'friendly';
  if (PET_IMPLICIT.has(t)) return 'pet';
  return undefined;
}

/** Strongest audience across raw slots. Cite: map-spell-effects.mjs spellBuffApplyTo. */
export function spellBuffApplyToFromRaw(
  spell: { rawEffects?: Array<{ effect?: number; targetA?: number; targetB?: number }> },
): 'party' | 'friendly' | 'pet' | undefined {
  let best: 'party' | 'friendly' | 'pet' | undefined;
  for (const raw of spell.rawEffects ?? []) {
    if ((raw.effect | 0) === 0) continue;
    const at = buffApplyTo(raw.effect | 0, (raw.targetA | 0) || (raw.targetB | 0));
    if (at && (!best || APPLY_TO_RANK[at] > APPLY_TO_RANK[best])) best = at;
  }
  return best;
}
