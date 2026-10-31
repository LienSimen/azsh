// Spell reflection predicates and chance. Cite: SpellMgr.h IsReflectableSpell ~1394; Unit.cpp
// GetReflectChance ~3425–3431; auras REFLECT_SPELLS 28 and REFLECT_SPELLS_SCHOOL 74. Pure.

export const SPELL_DAMAGE_CLASS_MAGIC = 1; // classic DmgClass MAGIC (not melee/ranged)

// IsReflectableSpell (SpellMgr.h). Magic, not ability, not NO_REFLECTION / NO_IMMUNITIES / PASSIVE, not
// positive.
export function isReflectableSpell(opts: {
  dmgClass: number;
  isAbility?: boolean;
  noReflection?: boolean;
  noImmunities?: boolean;
  passive?: boolean;
  positive?: boolean;
}): boolean {
  return (
    opts.dmgClass === SPELL_DAMAGE_CLASS_MAGIC &&
    !opts.isAbility &&
    !opts.noReflection &&
    !opts.noImmunities &&
    !opts.passive &&
    !opts.positive
  );
}

// GetReflectChance (Unit.cpp ~3425). chance += REFLECT_SPELLS + REFLECT_SPELLS_SCHOOL (misc mask match).
export function getReflectChance(
  reflectSpellsPct: number,
  reflectSchoolPct: number,
): number {
  return Math.max(0, reflectSpellsPct + reflectSchoolPct);
}

// Roll reflect: true when the spell is reflectable and the injected [0,1) roll lands under the
// chance.
export function rollSpellReflect(
  reflectable: boolean,
  chancePct: number,
  roll01: number,
): boolean {
  if (!reflectable || chancePct <= 0) return false;
  return roll01 * 100 < chancePct;
}
