// Class-filtered targeting — Unit::getClass(). SelectFlags has no class bit, so ScriptDev picks a
// player then switches on class, and Spell.cpp OnCheckTarget refuses the wrong one.

import { CLASS } from '../../data/schema.ts';

/** CombatAI NefarianActions::NEFARIAN_CLASS_CALL. Cite: boss_nefarian.cpp:76-86. */
export const NEFARIAN_CLASS_CALL_ACTION = 7;

// True when `classId` equals the required enum Classes value. Cite: Unit::getClass(); SharedDefines.h:65-79
// CLASS_WARRIOR=1 … CLASS_DRUID=11. `required <= 0` means no filter. Missing classId fails closed.
export function unitClassIs(classId: number | undefined | null, required: number): boolean {
  const want = required | 0;
  if (want <= 0) return true;
  return ((classId ?? 0) | 0) === want;
}

// Spell.cpp:8003-8040 OnCheckTarget — "not possible to filter out targets based on their class from data in
// spells template".
export const NEFARIAN_CLASS_CALL_REQUIRED_CLASS: Readonly<Record<number, number>> = {
  23397: CLASS.WARRIOR, // Berserk. Cite: Spell.cpp:8006-8008; boss_nefarian.cpp:64,272
  23398: CLASS.DRUID, // Involuntary Transformation. Cite: Spell.cpp:8009-8011; :65,280
  23401: CLASS.PRIEST, // Corrupted Healing. Cite: Spell.cpp:8013-8015; :66,276
  23410: CLASS.MAGE, // Wild Magic. Cite: Spell.cpp:8017-8019; :63,278
  23414: CLASS.ROGUE, // Paralyze. Cite: Spell.cpp:8021-8023; :71,275
  23418: CLASS.PALADIN, // Siphon Blessing. Cite: Spell.cpp:8025-8027; :67,273
  23425: CLASS.SHAMAN, // Corrupted Totems. Cite: Spell.cpp:8029-8031; :68,277
  23427: CLASS.WARLOCK, // Summon Infernals. Cite: Spell.cpp:8033-8035; :69,279
  23436: CLASS.HUNTER, // Corrupt Weapon. Cite: Spell.cpp:8037-8039; :70,274
};

export function isNefarianClassCallSpell(spellId: number): boolean {
  return NEFARIAN_CLASS_CALL_REQUIRED_CLASS[spellId | 0] != null;
}

/** OnCheckTarget false → skip this unit. Cite: Spell.cpp:8006 `getClass() != CLASS_*`. */
export function nefarianClassCallRefusesTarget(
  spellId: number,
  classId: number | undefined | null,
): boolean {
  const want = NEFARIAN_CLASS_CALL_REQUIRED_CLASS[spellId | 0];
  if (want == null) return false;
  return !unitClassIs(classId, want);
}
