// Spell damage coefficient scaling at runtime. Effects carry pre-baked ranges, so this adds the
// coefficient bonus only when the spell has one — it never invents a coefficient.

import type { School } from '../../data/schema.ts';
import { hasAttrEx3, SPELL_ATTR_EX3, type SpellAttrFields } from './spellAttributes.ts';

export interface SpellBonusSpell extends SpellAttrFields {
  effectBonusCoefficient?: number[];
  effectBonusCoefficientFromAP?: number[];
  // SpellEntry.spellLevel — used by CalculateLevelPenalty for down-rank SP scaling. // bake-dependent:
  // optional until ETL sources it; absence → penalty 1.0
  spellLevel?: number;
}

export interface SpellBonusCaster {
  /** Advertised generic spell damage (multi-school MOD_DAMAGE_DONE). */
  spellPower?: number;
  /** Per-school flat +spell damage. Benefit = spellPower + bySchool[school]. */
  spellDamageBySchool?: Partial<Record<School, number>>;
  /** Effect school for the bySchool lookup. Omit → generic only. */
  school?: School;
  /** Attack power for AP coefficient term. */
  attackPower?: number;
  // Optional school damage % (talent MOD_DAMAGE_PERCENT_DONE style), as percentage points (e.g. 10 = +10%).
  // Applied as DoneTotalMod after flat coeff bonus.
  damagePct?: number;
}

// CalculateLevelPenalty. Classic reads the SPELL's level only: below 20 it scales down, and at or above
// 20 — or at 0 — there is no penalty. Low ranks therefore benefit less from high spell power.
export function calculateLevelPenalty(spellLevel: number): number {
  return spellLevel < 20 && spellLevel > 0
    ? 1.0 - (20.0 - spellLevel) * 0.0375
    : 1.0;
}

// Resolve level penalty for a spell: explicit override wins; else compute from spell.spellLevel when
// present; else 1.0 (data not yet baked).
function resolveLevelPenalty(
  spell: SpellBonusSpell,
  levelPenaltyOverride?: number,
): number {
  if (levelPenaltyOverride !== undefined) return levelPenaltyOverride;
  // bake-dependent: spellLevel optional until ETL sources it
  if (spell.spellLevel != null) return calculateLevelPenalty(spell.spellLevel);
  return 1.0;
}

// SpellBonusWithCoeffs: the attack-power share plus the spell-power share scaled by the level penalty.
// It returns the flat bonus to ADD to the base damage, not the final damage.
export function spellBonusWithCoeffs(
  spell: SpellBonusSpell,
  effectIndex: number,
  benefit: number,
  apBenefit: number,
  donePart: boolean,
  levelPenalty?: number,
): number {
  let total = 0;
  const coeffs = spell.effectBonusCoefficient;
  const apCoeffs = spell.effectBonusCoefficientFromAP;
  const hasCoeff =
    (coeffs != null && (coeffs[effectIndex] ?? 0) > 0) ||
    (apCoeffs != null && (apCoeffs[effectIndex] ?? 0) > 0);

  let coeff = 0;
  if (hasCoeff) {
    coeff = coeffs?.[effectIndex] ?? 0;
    if (donePart && apCoeffs != null && (apCoeffs[effectIndex] ?? 0) > 0) {
      const apBonus = apCoeffs[effectIndex]!;
      total += Math.trunc(apBonus * apBenefit);
    }
  }

  if (benefit) {
    // CMaNGOS: if coeff is 0, do not add benefit * coeff (spellmod path also guards on coeff).
    if (coeff) {
      const lvlPenalty = resolveLevelPenalty(spell, levelPenalty);
      total += Math.trunc(benefit * coeff * lvlPenalty);
    }
  }

  return total;
}

// Whether the runtime bonus path should run for this spell effect. Dormant when no coefficients are present
// — never fakes coeffs.
export function hasSpellBonusData(spell: SpellBonusSpell, effectIndex = 0): boolean {
  const c = spell.effectBonusCoefficient?.[effectIndex] ?? 0;
  const ap = spell.effectBonusCoefficientFromAP?.[effectIndex] ?? 0;
  return c > 0 || ap > 0;
}

// Apply the done-side damage bonus to a rolled base amount: the base plus the coefficient total times
// the stack, all times the percent modifier. Unchanged when the caster mod is ignored or no coefficient.
function spellDamageBonusDone(
  pdamage: number,
  spell: SpellBonusSpell,
  effectIndex: number,
  caster: SpellBonusCaster,
  stack = 1,
): number {
  if (!spell || pdamage < 0) return pdamage;
  if (hasAttrEx3(spell, SPELL_ATTR_EX3.IGNORE_CASTER_MODIFIERS)) return pdamage;
  if (!hasSpellBonusData(spell, effectIndex)) return pdamage;

  const bySchool = caster.school ? (caster.spellDamageBySchool?.[caster.school] ?? 0) : 0;
  const benefit = (caster.spellPower ?? 0) + bySchool;
  const ap = caster.attackPower ?? 0;
  // Level penalty derived from spell.spellLevel inside spellBonusWithCoeffs when present.
  const doneTotal = spellBonusWithCoeffs(spell, effectIndex, benefit, ap, true);
  let doneTotalMod = 1.0;
  if (caster.damagePct) {
    doneTotalMod *= (100 + caster.damagePct) / 100;
  }

  const tmp = (pdamage + doneTotal * stack) * doneTotalMod;
  return tmp > 0 ? tmp : 0;
}

// Apply the bonus only when the data is present, else identity. Below: the done-side HEALING twin,
// scaled by the spell's own coefficient so a 1.5 s heal cannot benefit like a 3.5 s one.
export function spellHealingBonusDone(
  spell: SpellBonusSpell | undefined | null,
  effectIndex: number,
  healingPower: number,
): number {
  if (!spell || !(healingPower > 0)) return 0;
  if (hasAttrEx3(spell, SPELL_ATTR_EX3.IGNORE_CASTER_MODIFIERS)) return 0;
  if (!hasSpellBonusData(spell, effectIndex)) return 0;
  return spellBonusWithCoeffs(spell, effectIndex, healingPower, 0, true);
}

export function applySpellDamageBonusIfPresent(
  pdamage: number,
  spell: SpellBonusSpell | undefined | null,
  effectIndex: number,
  caster: SpellBonusCaster,
  stack = 1,
): number {
  if (!spell || !hasSpellBonusData(spell, effectIndex)) return pdamage;
  return spellDamageBonusDone(pdamage, spell, effectIndex, caster, stack);
}
