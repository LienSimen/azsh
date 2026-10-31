// EffectDummy SPELLFAMILY_WARRIOR remaining id. Cite: SpellEffects.cpp:1315–1334.

import type { RegistryHandler, RegistryPack } from '../types.ts';

/** Corrupted Totems (Shaman Nefarian class call). Cite: SpellEffects.cpp:1326–1330. */
export const CORRUPTED_TOTEMS_SPELL_ID = 23424;

// Random payload table. Cite: SpellEffects.cpp:1328 totemsSpellIds[] = { 23419, 23420, 23422, 23423 }.
export const CORRUPTED_TOTEM_SPELL_IDS = [23419, 23420, 23422, 23423] as const;

/** Pick index for urand(0, 3). Cite: SpellEffects.cpp:1329. */
export function pickCorruptedTotemSpellId(roll03: number): number {
  const i = Math.max(0, Math.min(3, roll03 | 0));
  return CORRUPTED_TOTEM_SPELL_IDS[i]!;
}

// Cast random corrupted totem on caster. Cite: SpellEffects.cpp:1326–1330.
const handleCorruptedTotems: RegistryHandler = (state, _raw, _slot) => {
  const roll = state.ctx.rng ? Math.floor(state.ctx.rng() * 4) : 0;
  const spellId = pickCorruptedTotemSpellId(roll);
  state.intents.push({ kind: 'cast_triggered_spell', spellId });
  state.effects.push({ kind: 'trigger_spell', spellId });
  return true;
};

export const si4DummyWarriorPack: RegistryPack = {
  id: 'si4-dummy-warrior',
  dummy: {
    [CORRUPTED_TOTEMS_SPELL_ID]: handleCorruptedTotems,
  },
};
