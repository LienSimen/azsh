// Teldrassil ScriptDev IR ports. Source: scripts/kalimdor/teldrassil.cpp — npc_mist, the
// FollowerAI for quest 938. Reaching Arynia 3519 within 10 yd completes it. No combat timers.

import type { ScriptDevIR } from './types.ts';

// Constants — teldrassil.cpp npc_mist

// teldrassil.cpp:39–44
/** Cite: teldrassil.cpp:39 SAY_AT_HOME = -1000323 (spoken by Arynia) */
export const SAY_AT_HOME = -1000323;
/** Cite: teldrassil.cpp:40 EMOTE_AT_HOME = -1000324 (spoken by Mist) */
export const EMOTE_AT_HOME = -1000324;
/** Cite: teldrassil.cpp:41 QUEST_MIST = 938 */
export const QUEST_MIST = 938;
/** Cite: teldrassil.cpp:42 NPC_ARYNIA = 3519 */
export const NPC_ARYNIA = 3519;
/** Cite: teldrassil.cpp:43 FACTION_DARNASSUS = 79 */
export const FACTION_DARNASSUS = 79;
/** DB binding. Cite: scriptdev2.sql entry 3568 ScriptName='npc_mist' */
export const NPC_MIST = 3568;

/** Arynia complete LOS range. Cite: teldrassil.cpp:59 IsWithinDistInMap(pWho, 10.0f) */
export const MIST_ARYNIA_RANGE_YD = 10.0;

// Pure helpers — QuestAccept + MoveInLineOfSight / DoComplete

export interface MistQuestAcceptResult {
  handled: boolean;
  /** StartFollow faction. Cite: teldrassil.cpp:100 FACTION_DARNASSUS */
  factionId: number;
  startFollow: boolean;
  questId: number | null;
  cite: string;
}

/** Port of QuestAccept_npc_mist. Cite: teldrassil.cpp:95–104 */
export function mistQuestAccept(questId: number): MistQuestAcceptResult {
  if (questId !== QUEST_MIST) {
    return {
      handled: false,
      factionId: 0,
      startFollow: false,
      questId: null,
      cite: 'teldrassil.cpp:97 quest != 938 → no-op (returns true)',
    };
  }
  return {
    handled: true,
    factionId: FACTION_DARNASSUS,
    startFollow: true,
    questId: QUEST_MIST,
    cite: 'teldrassil.cpp:99-100 StartFollow(player, FACTION_DARNASSUS=79, quest)',
  };
}

export interface MistAryniaLosResult {
  handled: boolean;
  /** Arynia speaks SAY_AT_HOME. Cite: teldrassil.cpp:60 DoScriptText(SAY_AT_HOME, pWho) */
  aryniaTextId: number | null;
  /** Mist emotes EMOTE_AT_HOME. Cite: teldrassil.cpp:68 DoScriptText(EMOTE_AT_HOME, m_creature) */
  mistTextId: number | null;
  /** Explore credit when leader quest incomplete. Cite: teldrassil.cpp:72-73 */
  questCredit: boolean;
  questId: number | null;
  completeFollow: boolean;
  cite: string;
}

// Port of npc_mistAI::MoveInLineOfSight, Arynia branch, plus DoComplete.
// Cite: teldrassil.cpp:52–78.
export function mistAryniaLos(
  hasVictim: boolean,
  followComplete: boolean,
  whoEntry: number,
  within10yd: boolean,
  questIncomplete: boolean,
): MistAryniaLosResult {
  if (hasVictim || followComplete) {
    return {
      handled: false,
      aryniaTextId: null,
      mistTextId: null,
      questCredit: false,
      questId: null,
      completeFollow: false,
      cite: 'teldrassil.cpp:56 victim / STATE_FOLLOW_COMPLETE → skip',
    };
  }
  if (whoEntry !== NPC_ARYNIA || !within10yd) {
    return {
      handled: false,
      aryniaTextId: null,
      mistTextId: null,
      questCredit: false,
      questId: null,
      completeFollow: false,
      cite: 'teldrassil.cpp:56-59 not Arynia or >10.0yd',
    };
  }
  // DoComplete always runs after SAY_AT_HOME (cpp:60-61 → DoComplete 66-78)
  return {
    handled: true,
    aryniaTextId: SAY_AT_HOME,
    mistTextId: EMOTE_AT_HOME,
    questCredit: questIncomplete,
    questId: questIncomplete ? QUEST_MIST : null,
    completeFollow: true,
    cite:
      'teldrassil.cpp:60-61 SAY_AT_HOME(Arynia) + DoComplete; ' +
      'teldrassil.cpp:68-78 EMOTE_AT_HOME(Mist) + explore 938 if incomplete + SetFollowComplete',
  };
}

// ScriptDev IR — npc_mist

// npc_mistAI (FollowerAI), creature 3568. No combat cast timers — Reset is empty and
// UpdateFollowerAI is commented out upstream as "no known abilities".
export const NPC_MIST_SCRIPT: ScriptDevIR = {
  name: 'npc_mist',
  boundCreatures: [NPC_MIST],
  sourceFile: 'kalimdor/teldrassil.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'FollowerAI Reset empty (no timers / no combat kit)',
        cite: 'teldrassil.cpp:50 Reset {}',
      },
    ],
  },
  cites: [
    'teldrassil.cpp:33-113 npc_mist',
    'teldrassil.cpp:39-44 SAY_AT_HOME=-1000323 EMOTE_AT_HOME=-1000324 QUEST=938 NPC_ARYNIA=3519 FACTION_DARNASSUS=79',
    'teldrassil.cpp:50 Reset empty',
    'teldrassil.cpp:52-64 MoveInLineOfSight Arynia ≤10.0yd → SAY_AT_HOME + DoComplete',
    'teldrassil.cpp:66-78 DoComplete EMOTE_AT_HOME + RewardPlayerAndGroupAtEventExplored(938) + SetFollowComplete',
    'teldrassil.cpp:80-87 UpdateFollowerAI commented - no combat abilities',
    'teldrassil.cpp:95-104 QuestAccept 938 StartFollow FACTION_DARNASSUS=79',
    'scriptdev2.sql entry 3568 ScriptName=npc_mist',
  ],
};
