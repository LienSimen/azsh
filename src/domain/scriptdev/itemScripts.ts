import type { ScriptDevIR } from './types.ts';
import { REP_FRIENDLY } from './npcProfessions.ts';

export const ITEM_ASHBRINGER: ScriptDevIR = {
  name: 'item_ashbringer',
  boundCreatures: [],
  sourceFile: 'items/item_scripts.cpp',
  spellIds: [28282, 28442],
  cites: [
    'item_scripts.cpp:62-80 AshbringerItemAura',
    'sql/scriptdev2/spell.sql:166 (28282,spell_ashbringer_item)',
    'SharedDefines.h:110 REP_FRIENDLY = 4',
  ],
  auraScripts: [
    {
      spellId: 28282,
      cite: 'item_scripts.cpp:62-80 AshbringerItemAura',
      onApply: [
        {
          kind: 'cast_helper',
          spellId: 28442,
          on: 'aura_target',
          basepoints: REP_FRIENDLY,
          cite: 'item_scripts.cpp:73 CastCustomSpell SPELL_ASHBRINGER_EFFECT_001; SharedDefines.h:110 REP_FRIENDLY = 4',
        },
      ],
      onRemove: [
        {
          kind: 'remove_auras',
          spellId: 28442,
          on: 'aura_target',
          cite: 'item_scripts.cpp:77 RemoveAurasDueToSpell(SPELL_ASHBRINGER_EFFECT_001)',
        },
      ],
    },
  ],
};
