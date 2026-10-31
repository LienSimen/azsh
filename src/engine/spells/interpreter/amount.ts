// Spell effect amount range, matching the bake mapper: base points plus the dice terms. The
// interpreter emits the RANGE and never rolls, so combat's RNG order is unchanged.

import type { RawSpellEffect } from '../../../data/schema.ts';
import type { InterpretContext } from './types.ts';
import {
  SPELL_AURA_PERIODIC_DAMAGE,
  SPELL_AURA_PERIODIC_LEECH,
  SPELL_AURA_PERIODIC_MANA_LEECH,
  SPELL_AURA_SCHOOL_ABSORB,
  SPELL_AURA_POWER_BURN_MANA,
  SPELL_EFFECT_SCHOOL_DAMAGE,
  SPELL_EFFECT_ENVIRONMENTAL_DAMAGE,
  SPELL_EFFECT_POWER_DRAIN,
  SPELL_EFFECT_HEALTH_LEECH,
  SPELL_EFFECT_HEAL,
  SPELL_EFFECT_WEAPON_DAMAGE_NOSCHOOL,
  SPELL_EFFECT_SUMMON,
  SPELL_EFFECT_WEAPON_DAMAGE,
  SPELL_EFFECT_POWER_BURN,
  SPELL_EFFECT_NORMALIZED_WEAPON_DMG,
} from './opcodes.ts';

export interface AmountRange {
  min: number;
  max: number;
  /** EffectPointsPerComboPoint when non-zero — attached on effects, not folded into min/max. */
  pointsPerComboPoint?: number;
}

// Compute the minimum and maximum for one raw slot, with optional level scaling that is off by default
// for bake parity.
export function effectAmountRange(raw: RawSpellEffect, ctx?: InterpretContext): AmountRange {
  let bp = raw.basePoints | 0;
  const bd = raw.baseDice | 0;
  const dsv = raw.dieSides | 0;
  const perLevel = Number(raw.perLevel) || 0;

  // The optional level term. The level is CLAMPED into the spell's own band BEFORE the spell level is
  // subtracted, or a rank-1 nuke kept scaling to 60. Per-level dice are 0 on all 22,374 rows.
  if (ctx?.casterLevel != null && perLevel !== 0) {
    const spellLevel = Math.trunc(ctx.spellLevel ?? 0);
    let level = Math.trunc(ctx.casterLevel);
    if (ctx.casterIsPlayer === false) level = Math.trunc(level / 5);
    const maxLevel = Math.trunc(ctx.spellMaxLevel ?? 0);
    const baseLevel = Math.trunc(ctx.spellBaseLevel ?? 0);
    if (maxLevel > 0 && level > maxLevel) level = maxLevel;
    else if (level < baseLevel) level = baseLevel;
    bp += Math.trunc((level - spellLevel) * perLevel);
  }

  // map-spell-effects.mjs:285–286
  const min = bp + Math.max(bd, 0);
  const max = bp + Math.max(dsv, bd, 0);

  const ppc = Number(raw.perCombo) || 0;
  const scale = creatureLevelScaleFactor(raw, ctx);
  const out: AmountRange = scale === 1
    ? { min, max }
    : { min: Math.trunc(min * scale), max: Math.trunc(max * scale) };
  if (ppc) out.pointsPerComboPoint = ppc;
  return out;
}

// Aura ids whose amount the creature-level scaling touches. Percent periodic damage is excluded on
// purpose — the C++ comment says absolute values only. Cite: Object.cpp:2972-2985.
const CREATURE_SCALED_AURAS = new Set([
  SPELL_AURA_PERIODIC_DAMAGE,
  SPELL_AURA_PERIODIC_LEECH,
  SPELL_AURA_PERIODIC_MANA_LEECH,
  SPELL_AURA_SCHOOL_ABSORB,
  SPELL_AURA_POWER_BURN_MANA,
]);
// Effect ids the same block scales. WEAPON_PERCENT_DAMAGE (31) is excluded, same reason. Cite:
// Object.cpp:2986-3003; SpellEffectDefines.h 2, 7, 8, 9, 10, 17, 28, 58, 62, 121.
const CREATURE_SCALED_EFFECTS = new Set([
  SPELL_EFFECT_SCHOOL_DAMAGE,
  SPELL_EFFECT_ENVIRONMENTAL_DAMAGE,
  SPELL_EFFECT_POWER_DRAIN,
  SPELL_EFFECT_HEALTH_LEECH,
  SPELL_EFFECT_HEAL,
  SPELL_EFFECT_WEAPON_DAMAGE_NOSCHOOL,
  SPELL_EFFECT_SUMMON,
  SPELL_EFFECT_WEAPON_DAMAGE,
  SPELL_EFFECT_POWER_BURN,
  SPELL_EFFECT_NORMALIZED_WEAPON_DMG,
]);

// SCALES_WITH_CREATURE_LEVEL on a creature cast multiplies the amount by the class-level-stat base
// damage ratio. Anything missing returns 1, so a player cast and an unscaled effect are untouched.
function creatureLevelScaleFactor(raw: RawSpellEffect, ctx?: InterpretContext): number {
  const scaling = ctx?.creatureLevelScaling;
  if (!scaling || ctx?.casterLevel == null) return 1;
  const spellLevel = Math.trunc(ctx.spellLevel ?? 0);
  if (spellLevel <= 0) return 1;
  const aura = raw.auraName | 0;
  const effect = raw.effect | 0;
  const scaled = aura ? CREATURE_SCALED_AURAS.has(aura) : CREATURE_SCALED_EFFECTS.has(effect);
  if (!scaled) return 1;
  const casterDamage = scaling.baseDamageAt(Math.trunc(ctx.casterLevel), scaling.unitClass);
  const spellDamage = scaling.baseDamageAt(spellLevel, scaling.unitClass);
  if (!casterDamage || !spellDamage || spellDamage <= 0) return 1;
  return casterDamage / spellDamage;
}

/** Clamp damage/heal-like amounts to at least 1 (mapper Math.max(1, min/max)). */
export function clampPositiveRange(min: number, max: number): { min: number; max: number } {
  return { min: Math.max(1, min), max: Math.max(1, max) };
}
