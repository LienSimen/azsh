// Raid script rows whose body is a cast fan-out in the boss script. The spell row carries no misc
// value, so the generic dispatcher has nothing to read and the C++ script is the source.

import type { RegistryHandler, RegistryPack } from '../types.ts';

/** Moam's 90 s add wave. Cite: boss_moam.cpp:40 SPELL_SUMMON_MANAFIENDS, :156-160. */
export const SUMMON_MANA_FIENDS_SPELL_ID = 25684;

// The three fixed-bearing summons it fans out to: the same creature with three different bearings, so
// they land around the boss rather than on one point. Cite: boss_moam.cpp:43-45, :180-182.
export const MANA_FIEND_SUMMON_SPELL_IDS: readonly number[] = [25681, 25682, 25683];

const handleSummonManaFiends: RegistryHandler = (state) => {
  for (const spellId of MANA_FIEND_SUMMON_SPELL_IDS) {
    state.intents.push({ kind: 'cast_triggered_spell', spellId });
    // Play surface: combat resolves a triggered payload off the caster's own kit, so the three
    // ids are in BOSS_MOAM.spellIds beside 25684 (same rule as the Magmadar lava-bomb chain).
    state.effects.push({ kind: 'trigger_spell', spellId });
  }
  return true;
};

export const raidScriptSummonsPack: RegistryPack = {
  id: 'raid-script-summons',
  script: { [SUMMON_MANA_FIENDS_SPELL_ID]: handleSummonManaFiends },
};
