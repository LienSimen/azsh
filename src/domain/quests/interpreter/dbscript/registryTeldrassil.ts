// QI4 — kalimdor/teldrassil residual, extracted for the 1500-line ratchet. It claims the accept
// hook for quest 938 only. Cite: kalimdor/teldrassil.cpp.

import type { DbScriptIntent } from './types.ts';

/** Matches registry.ts QuestScriptHook — local to avoid circular import. */
type QuestScriptHook = 'accept' | 'reward' | 'complete' | 'frame';

/** Minimal registry entry shape (mirrors registry.ts QuestScriptEntry). */
export interface TeldrassilQuestScriptEntry {
  family?: string;
  questId?: number;
  questIds?: number[];
  hooks?: QuestScriptHook[];
  run?: (phase: QuestScriptHook, questId: number) => DbScriptIntent[];
  cite?: string;
}

// ── sourced constants ────────────────────────────────────────────────────────

/** Cite: teldrassil.cpp:41 QUEST_MIST = 938 FollowerAI Mist → Arynia LOS explore credit. */
export const QUEST_MIST = 938;

// Cite: bake starterCreatureEntries quest 938; scriptdev2.sql ScriptName='npc_mist' Mist creature entry
// 3568.
const NPC_MIST = 3568;
// Cite: teldrassil.cpp:42 NPC_ARYNIA = 3519 Bake enderCreatureEntries quest 938 Sentinel Arynia
// Cloudsbreak.
const NPC_ARYNIA = 3519;

/** Cite: teldrassil.cpp:39–40 script texts at home. */
const SAY_AT_HOME = -1000323;
const EMOTE_AT_HOME = -1000324;

/** Cite: teldrassil.cpp:43 FACTION_DARNASSUS = 79 StartFollow faction on accept. */
const FACTION_DARNASSUS = 79;

/** Cite: teldrassil.cpp:59 IsWithinDistInMap(pWho, 10.0f) for Arynia LOS credit. */
const ARYNIA_CREDIT_DIST = 10.0;

// ── accept handlers ──────────────────────────────────────────────────────────

// QuestAccept_npc_mist — quest 938 Mist: start following at the Darnassus faction, and sighting
// Arynia within 10 yd says the line and credits it. Cite: teldrassil.cpp:95–104, :52–78.
function runMistAccept(): DbScriptIntent[] {
  const citeFollow =
    `teldrassil.cpp:99–100 npc_mist (${NPC_MIST}) ` +
    `StartFollow(player, FACTION_DARNASSUS=${FACTION_DARNASSUS}, quest) ` +
    '- FO6 degraded FollowerAI finishEscort';
  const citeLos =
    `teldrassil.cpp:52–64 MoveInLineOfSight NPC_ARYNIA=${NPC_ARYNIA} ` +
    `IsWithinDistInMap(${ARYNIA_CREDIT_DIST}): DoScriptText(SAY_AT_HOME=${SAY_AT_HOME}, Arynia) ` +
    '+ DoComplete() - FO6';
  const citeCredit =
    `teldrassil.cpp:66–78 DoComplete: DoScriptText(EMOTE_AT_HOME=${EMOTE_AT_HOME}, Mist) + ` +
    'RewardPlayerAndGroupAtEventExplored(938) + SetFollowComplete() - FO6 finishEscort';
  const citeEnder =
    `bake enderCreatureEntries NPC_ARYNIA=${NPC_ARYNIA} after LOS explore credit`;
  return [
    {
      kind: 'skip',
      reason:
        `StartFollow(player, FACTION_DARNASSUS=${FACTION_DARNASSUS}, quest) ` +
        `npc_mist (${NPC_MIST}) - FO6 degraded FollowerAI finishEscort`,
      cite: citeFollow,
    },
    {
      kind: 'skip',
      reason:
        `LOS NPC_ARYNIA (${NPC_ARYNIA}) dist=${ARYNIA_CREDIT_DIST} ` +
        `DoScriptText(SAY_AT_HOME=${SAY_AT_HOME}) + DoComplete - FO6`,
      cite: citeLos,
    },
    {
      kind: 'skip',
      reason:
        `DoComplete EMOTE_AT_HOME (${EMOTE_AT_HOME}) + ` +
        `RewardPlayerAndGroupAtEventExplored(938) - FO6 finishEscort`,
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason: `turn-in NPC_ARYNIA (${NPC_ARYNIA}) after explore credit`,
      cite: citeEnder,
    },
  ];
}

// Family pack: kalimdor/teldrassil.cpp Hooks: pQuestAcceptNPC mist (938). Residuals documented on accept
// chain: Arynia LOS credit + SAY/EMOTE.
export function runTeldrassil(
  phase: QuestScriptHook,
  questId: number,
): DbScriptIntent[] {
  if (phase === 'accept') {
    if (questId === QUEST_MIST) return runMistAccept();
    return [];
  }
  return [];
}

// Map entries spread into QUEST_SCRIPT_REGISTRY (keeps registry.ts under 1500). next-batch.mjs also matches
// `family: 'kalimdor/teldrassil'` in registry.ts.
export const TELDRASSIL_REGISTRY: Record<string | number, TeldrassilQuestScriptEntry> = {
  'kalimdor/teldrassil': {
    family: 'kalimdor/teldrassil',
    questIds: [QUEST_MIST],
    hooks: ['accept'],
    cite: 'kalimdor/teldrassil.cpp:95–104,52–78',
    run: runTeldrassil,
  },
  [QUEST_MIST]: {
    family: 'kalimdor/teldrassil',
    questId: QUEST_MIST,
    questIds: [QUEST_MIST],
    hooks: ['accept'],
    cite: 'teldrassil.cpp:95–104 QuestAccept_npc_mist',
    run: runTeldrassil,
  },
};
