// Eastern Plaguelands ScriptDevAI IR — npc_eris_havenfire (quest 7622). Source:
// eastern_kingdoms/eastern_plaguelands.cpp.

import type { ScriptDevIR } from './types.ts';

const NPC_ERIS = 14494;
const SPELL_ENTER_THE_LIGHT_DND = 23107;
const SPELL_BLESSING_OF_NORDRASSIL = 23108;

export const NPC_ERIS_HAVENFIRE: ScriptDevIR = {
  name: 'npc_eris_havenfire',
  boundCreatures: [NPC_ERIS],
  sourceFile: 'eastern_kingdoms/eastern_plaguelands.cpp',
  spellIds: [SPELL_ENTER_THE_LIGHT_DND, SPELL_BLESSING_OF_NORDRASSIL],
  timers: [],
  cites: [
    'eastern_plaguelands.cpp:36-... npc_eris_havenfire quest 7622 Balance of Light and Shadow',
    'eastern_plaguelands.cpp:48-49 SPELL_ENTER_THE_LIGHT_DND 23107 / SPELL_BLESSING_OF_NORDRASSIL 23108 — peasant-wave event, not a combat cast schedule',
    'Wave/archer spawn + MAX_KILLED_PEASANT 15 / MAX_SAVED_PEASANT 50 - escort-event GAP',
  ],
};
