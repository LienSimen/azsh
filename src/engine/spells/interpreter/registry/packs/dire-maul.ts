// Dire Maul instance script spells. Both shipped as the generic no-op fallthrough even though the
// C++ gives each an explicit body. Cite: SpellEffects.cpp:3674-3678; instance_dire_maul.cpp:668-682.

import type { RegistryHandler, RegistryPack } from '../types.ts';

/** GO 179512 "Fixed Trap" trap.spellId. Cite: gameobject-data.json 179512. */
export const ICE_LOCK_TRAP_SPELL_ID = 5249;
/** The stun 5249 triggers: aura 12 MOD_STUN. Cite: SpellEffects.cpp:3677. */
export const ICE_LOCK_STUN_SPELL_ID = 22856;
/** Guard Slip'kik. Cite: dire_maul.h:98 NPC_GUARD_SLIPKIK. */
export const NPC_GUARD_SLIPKIK = 14323;
/** Cite: dire_maul.h:117 FACTION_OGRE. */
export const FACTION_OGRE = 45;

// 5249 Ice Lock (effect 77 SCRIPT_EFFECT): `unitTarget->CastSpell(unitTarget, 22856, TRIGGERED)`. Cite:
// SpellEffects.cpp:3674-3678.
const handleIceLock: RegistryHandler = (state, _raw, _slot) => {
  state.intents.push({ kind: 'cast_triggered_spell', spellId: ICE_LOCK_STUN_SPELL_ID });
  return true;
};

// The Guard Slip'kik trigger, fired by King of the Gordok, restores the trapped guard from the hostile
// faction to the ogre one. The entry is instance storage, not spell targeting.
const handleGuardSlipkikTrigger: RegistryHandler = (state, _raw, _slot) => {
  state.intents.push({
    kind: 'set_creature_faction',
    creatureEntry: NPC_GUARD_SLIPKIK,
    factionId: FACTION_OGRE,
  });
  state.effects.push({
    kind: 'force_reaction',
    factionId: FACTION_OGRE,
    reputationRank: 4,
    durationMs: 0,
    stopAttackFaction: true,
  });
  return true;
};

export const direMaulPack: RegistryPack = {
  id: 'dire-maul',
  dummy: { 31770: handleGuardSlipkikTrigger },
  script: { 5249: handleIceLock },
};
