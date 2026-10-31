// Swamp of Sorrows ScriptDevAI IR — npc_galen_goodward escort (quest 1393). Source:
// eastern_kingdoms/swamp_of_sorrows.cpp.

import type { ScriptDevIR } from './types.ts';

const NPC_GALEN = 5391;
const QUEST_GALENS_ESCAPE = 1393;
const GO_GALENS_CAGE = 37118;

export const NPC_GALEN_GOODWARD: ScriptDevIR = {
  name: 'npc_galen_goodward',
  boundCreatures: [NPC_GALEN],
  sourceFile: 'eastern_kingdoms/swamp_of_sorrows.cpp',
  spellIds: [],
  timers: [],
  cites: [
    'swamp_of_sorrows.cpp:37-139 npc_galen_goodwardAI escort quest 1393',
    'swamp_of_sorrows.cpp:61 Reset m_periodicSay = 6000 OOC yell - not a combat timer',
    'swamp_of_sorrows.cpp:100-105 WP21 RewardPlayerAndGroupAtEventExplored(1393)',
    `GO_GALENS_CAGE ${GO_GALENS_CAGE} / QUEST_GALENS_ESCAPE ${QUEST_GALENS_ESCAPE}`,
  ],
};
