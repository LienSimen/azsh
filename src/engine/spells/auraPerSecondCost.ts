// SpellAuraHolder per-second power cost (ManaPerSecond / ManaPerSecondPerLevel). Cite:
// SpellAuras.cpp:5680–5707; SpellDefines.h SPELL_ATTR_EX2_NO_TARGET_PER_SECOND_COSTS.
import type { PowerType, SpellDef } from '../../data/schema.ts';

/** SPELL_ATTR_EX2_NO_TARGET_PER_SECOND_COSTS. Cite: SpellDefines.h:113. */
export const SPELL_ATTR_EX2_NO_TARGET_PER_SECOND_COSTS = 0x00000800;

// src_spell_template.ManaPerSecond for rows the live bake has not restamped yet. Cite: src_spell_template
// Id/ManaPerSecond (14 rows; Health Funnel 755=5 … 11695=52).
const MANA_PER_SECOND_BY_ID: Readonly<Record<number, number>> = {
  424: 2,
  461: 10,
  755: 5,
  963: 2,
  1116: 4,
  3486: 4,
  3698: 10,
  3699: 17,
  3700: 24,
  10260: 25,
  11693: 33,
  11694: 42,
  11695: 52,
  16569: 75,
};

/** src_spell_template.AttributesEx2 & 0x800. Health Funnel ranks only (Reconstruct 10260 has 0). */
const NO_TARGET_PER_SECOND_COST_IDS: ReadonlySet<number> = new Set([
  755, 3698, 3699, 3700, 11693, 11694, 11695, 16569,
]);

export function manaPerSecondOf(spell: Pick<SpellDef, 'id' | 'manaPerSecond' | 'manaPerSecondPerLevel'>, level = 0): number {
  const stamped = Number(spell.manaPerSecond ?? 0) | 0;
  const perLevel = Number(spell.manaPerSecondPerLevel ?? 0) | 0;
  const fromBake = stamped + perLevel * (level | 0);
  if (fromBake !== 0) return fromBake;
  return MANA_PER_SECOND_BY_ID[spell.id | 0] ?? 0;
}

export function noTargetPerSecondCostsOf(
  spell: Pick<SpellDef, 'id' | 'noTargetPerSecondCosts' | 'attributesEx2'>,
): boolean {
  if (spell.noTargetPerSecondCosts === true) return true;
  if (((spell.attributesEx2 ?? 0) & SPELL_ATTR_EX2_NO_TARGET_PER_SECOND_COSTS) !== 0) return true;
  return NO_TARGET_PER_SECOND_COST_IDS.has(spell.id | 0);
}

export function perSecondCostPowerType(spell: Pick<SpellDef, 'powerType'>): PowerType {
  return spell.powerType ?? 'mana';
}
