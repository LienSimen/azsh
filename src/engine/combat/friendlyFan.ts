// Same-side multi-unit target constants, shared by heal and buff routing and by the census. The old
// bolt-on fan was deleted: it double-healed the triaged primary.

import type { SpellDef, SpellEffect } from '../../data/schema.ts';

// Multi-unit FRIENDLY implicit targets that use a flat party or radius fan. The chain-heal target and
// raid-and-class are excluded, since the chain fan and the class filter own those.
export const FRIENDLY_MULTI_TARGETS: ReadonlySet<number> = new Set([
  20, // TARGET_ENUM_UNITS_PARTY_WITHIN_CASTER_RANGE
  29, // TARGET_ENUM_UNITS_FRIEND_AOE_AT_DYNOBJ_LOC
  30, // TARGET_ENUM_UNITS_FRIEND_AOE_AT_SRC_LOC
  31, // TARGET_ENUM_UNITS_FRIEND_AOE_AT_DEST_LOC
  33, // TARGET_ENUM_UNITS_PARTY_AOE_AT_SRC_LOC
  34, // TARGET_ENUM_UNITS_PARTY_AOE_AT_DEST_LOC
  37, // TARGET_UNIT_FRIEND_AND_PARTY
  56, // TARGET_ENUM_UNITS_RAID_WITHIN_CASTER_RANGE
  59, // TARGET_ENUM_UNITS_FRIEND_IN_CONE
]);

// True when this spell's DBC row asks for several friendly units via a flat multi-target. Reads
// `rawEffects`; a synthesized SpellDef without them simply does not fan.
export function wantsFriendlyFan(spell: SpellDef): boolean {
  const raw = spell.rawEffects;
  if (!raw?.length) return false;
  for (const re of raw) {
    if ((re.effect | 0) === 0) continue;
    if (FRIENDLY_MULTI_TARGETS.has(re.targetA | 0)) return true;
    if (FRIENDLY_MULTI_TARGETS.has(re.targetB | 0)) return true;
  }
  return false;
}

// Effects that once replayed onto each additional ally via the deleted fan. Kept for census / diagnostics;
// combat no longer uses this list for a second pass.
export function isFriendlyFannedEffect(e: SpellEffect): boolean {
  // Real bake/SI kinds only — `hot`/`absorb`/`restore_mana` never exist on SpellEffect
  // (HoT = restore_health, absorb = school_absorb, mana = restore_power).
  switch (e.kind) {
    case 'heal':
    case 'damage_shield':
    case 'school_absorb':
    case 'restore_health':
    case 'restore_power':
    case 'dispel':
      return (e as { hostile?: boolean }).hostile !== true;
    default:
      return false;
  }
}

/** @deprecated The external friendly fan is gone — heals route through applyTo in applySpellLate.
 * Kept as a no-op so a stray import still compiles; it always returns 0. */
export function applyFriendlyFan(): number {
  return 0;
}
