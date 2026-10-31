// Goblin Rocket Boots (7189) — the on-use +70% run buff that can blow up on you.
// Cite: Spell.dbc 8892 description "They are prone to explode however, so use with caution.";
// aura text "Increases run speed.  Explosive malfunction is possible."

import type { DataStore } from '../../data/dataStore.ts';
import type { SpellDef } from '../../data/schema.ts';

export const GOBLIN_ROCKET_BOOTS = 7189;
/** src_spell_template 8893 EffectItemType3 — what a malfunction leaves in your bags. */
export const SCORCHED_ROCKET_BOOTS = 7190;
/** 8893 "Rocket Boots Malfunction": 2 s stun + 57-93 fire to self + conjure 7190. */
export const ROCKET_BOOTS_MALFUNCTION_SPELL = 8893;

// UNSOURCED RATE. The malfunction payload and its player-facing warning are tier-2/tier-3 data, but
// no tier carries the odds: src_spell_template 8892 has one effect and no trigger, 8893 has no
// caster, a full sweep of every src_* table for 8892/8893 returns nothing, and CMaNGOS never casts
// 8893 (grep over src/, 2026-08-30). This number is the operator's to set.
export const ROCKET_BOOTS_MALFUNCTION_PCT = 5;

/** The malfunction rider `combatItems` hangs on the boots, or undefined for every other item. */
export function rocketBootsMalfunction(
  entry: number,
  ds: DataStore,
  resolve: (raw: SpellDef) => SpellDef,
): { chancePct: number; spell: SpellDef; destroysInto: number } | undefined {
  if (entry !== GOBLIN_ROCKET_BOOTS) return undefined;
  const raw = ds.spell(ROCKET_BOOTS_MALFUNCTION_SPELL);
  if (!raw) return undefined;
  // 8893's fire damage is EffectImplicitTargetA 1 (TARGET_UNIT_CASTER) — it burns the WEARER, and
  // effects-core.ts stamps that as hostile:false so applySpell routes it to the caster.
  return {
    chancePct: ROCKET_BOOTS_MALFUNCTION_PCT,
    spell: resolve(raw),
    destroysInto: SCORCHED_ROCKET_BOOTS,
  };
}
