// CheckCast target gates that are pure data reads: a max target level, peaceful-targets-only, and
// player-only. Two neighbours in the same C++ block are absent because neither has a surface here.

import type { SpellDef } from '../../data/schema.ts';
import { isAllySide } from '../core/events.ts';
import { isAreaOfEffectSpell } from '../spells/singleTargetAura.ts';
import { FORM_SPIRITOFREDEMPTION } from '../spells/interpreter/handlers/shared.ts';
import { SPELL_ATTR_EX, SPELL_ATTR_EX3, hasAttrEx, hasAttrEx3 } from '../spells/spellAttributes.ts';

/** The little a target gate needs from a Fighter. */
export interface CastTargetUnit {
  side: string;
  spec: { level: number; creatureEntry?: number; classId?: number };
  /** Session clock when UNIT_FLAG_IN_COMBAT drops; 0 = out of combat. */
  combatUntil: number;
  form?: number;
}

// True for a unit the core would call TYPEID_PLAYER; a pet, totem or creature is TYPEID_UNIT. A
// hostile playerbot IS a player, and testing ally side alone refused Mind Control on them.
export function isPlayerCharacterTarget(target: CastTargetUnit): boolean {
  if ((target.spec.creatureEntry ?? 0) > 0) return false;
  if (target.side === 'player' || isAllySide(target.side as Parameters<typeof isAllySide>[0])) {
    return true;
  }
  const cls = (target.spec.classId ?? 0) | 0;
  return cls >= 1 && cls <= 11;
}

// SpellMgr.h:886-895 `IsAreaOfEffectSpell`. One definition, in singleTargetAura.ts: the tracked-aura
// rule exempts an AoE first, so a second copy of the target-id set here would silently split the class.
export { isAreaOfEffectSpell };

// ONLY_ON_PLAYER refuses every non-player target, and unlike the cast gate it runs on EVERY unit the
// spell resolved, AoE included — so a pet standing in a boss circle takes nothing at all.
export function onlyOnPlayerRefusesTarget(
  spell: SpellDef | null | undefined,
  target: CastTargetUnit,
): boolean {
  if (!hasAttrEx3(spell, SPELL_ATTR_EX3.ONLY_ON_PLAYER)) return false;
  return !isPlayerCharacterTarget(target);
}

// The refusal reason for a target the spell may not be cast on, else null. Read at the same call
// sites as the reactive gate, so the AI's pick and the action bar always agree.
export function targetCastGate(
  caster: CastTargetUnit,
  target: CastTargetUnit,
  spell: SpellDef,
  now: number,
): string | null {
  if (caster === target) return null;
  const maxLevel = (spell.maxTargetLevel ?? 0) | 0;
  if (maxLevel > 0 && (target.spec.level | 0) > maxLevel) return 'target is too high level';

  // Cite: Spell.cpp:4842 if (target->HasAuraType(SPELL_AURA_SPIRIT_OF_REDEMPTION) && !m_spellInfo->HasAttribute(SPELL_ATTR_EX3_ALLOW_AURA_WHILE_DEAD))
  if (target.form === FORM_SPIRITOFREDEMPTION && !hasAttrEx3(spell, SPELL_ATTR_EX3.ALLOW_AURA_WHILE_DEAD)) {
    return 'target is dead';
  }
  // "check if target is in combat" — Sap 1-3, Distract, the Invisibility ranks, Duel and the
  // Gnomish Mind Control Cap all refuse a victim that is already fighting. Cite: Spell.cpp:4836.
  if (hasAttrEx(spell, SPELL_ATTR_EX.ONLY_PEACEFUL_TARGETS) && target.combatUntil > now) {
    return 'target is in combat';
  }
  // AoE is exempt at CAST time, so a boss whose victim is a pet still casts its area spell and the
  // pet is dropped out of the fan instead. Without the exemption the whole cast was refused.
  if (onlyOnPlayerRefusesTarget(spell, target) && !isAreaOfEffectSpell(spell)) {
    return 'only works on players';
  }
  // Curse of Doom: not on players. Cite: Warlock.cpp:189-196 SPELL_FAILED_BAD_TARGETS.
  if (((spell.id | 0) === 603) && isPlayerCharacterTarget(target)) {
    return 'bad targets';
  }
  return null;
}
