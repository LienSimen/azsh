// Orgrimmar ScriptDev IR ports. Source: scripts/kalimdor/orgrimmar.cpp — npc_overlord_runthalak
// and npc_high_overlord_saurfang, both gossip-only head-of-boss menu swaps. No combat timers.

import type { ScriptDevIR } from './types.ts';

// Constants — orgrimmar.cpp

// orgrimmar.cpp:33–37
/** Cite: orgrimmar.cpp:34 GO_HEAD_OF_NEFARIAN_OG = 179881 */
export const GO_HEAD_OF_NEFARIAN_OG = 179881;
/** Cite: orgrimmar.cpp:35 GO_HEAD_OF_ONYXIA_OG = 179556 */
export const GO_HEAD_OF_ONYXIA_OG = 179556;
/** Cite: orgrimmar.cpp:37 GOSSIP_HEAD_OG = 6024 */
export const GOSSIP_HEAD_OG = 6024;

/** Cite: scriptdev-corpus + orgrimmar.cpp RegisterSelf npc_overlord_runthalak */
export const NPC_OVERLORD_RUNTHAK = 14392;
/** Cite: scriptdev-corpus + orgrimmar.cpp RegisterSelf npc_high_overlord_saurfang */
export const NPC_HIGH_OVERLORD_SAURFANG = 14720;

/** Head GO search radius. Cite: orgrimmar.cpp:43 / :55 GetClosestGameObjectWithEntry(..., 100.f) */
export const HEAD_GO_SEARCH_YD = 100;

// Quest 7491 For All To See — ends at Overlord Runthak after Onyxia head. Cite: bake enderCreatureEntries
// [14392]; prev 7490 Victory for the Horde.
export const QUEST_FOR_ALL_TO_SEE = 7491;

// Quest 7493 The Journey Has Just Begun — starter/ender Runthak. Cite: bake starter/ender [14392]; prev
// 7491.
export const QUEST_JOURNEY_HAS_JUST_BEGUN = 7493;

// Quest 7784 The Lord of Blackrock — ends at High Overlord Saurfang. Cite: bake enderCreatureEntries
// [14720]; prev 7783.
export const QUEST_LORD_OF_BLACKROCK_HORDE = 7784;

/** Thrall — starter for 7491 / 7784. Cite: bake starterCreatureEntries [4949] */
export const NPC_THRALL = 4949;

// Pure helpers — head gossip menu swap

// Port of GossipHello_npc_overlord_runthalak. Cite: orgrimmar.cpp:40–50 When Head of Nefarian (Orgrimmar)
// is spawned within 100yd, swap to GOSSIP_HEAD_OG 6024; else use creature GossipMenuId.
export function runthalakGossipId(
  defaultGossipMenuId: number,
  nefarianHeadSpawned: boolean,
): { gossipId: number; cite: string } {
  if (nefarianHeadSpawned) {
    return {
      gossipId: GOSSIP_HEAD_OG,
      cite: 'orgrimmar.cpp:43-45 GO_HEAD_OF_NEFARIAN_OG spawned → GOSSIP_HEAD_OG 6024',
    };
  }
  return {
    gossipId: defaultGossipMenuId,
    cite: 'orgrimmar.cpp:42 default GossipMenuId',
  };
}

// Port of GossipHello_npc_high_overlord_saurfang. Cite: orgrimmar.cpp:52–62 When Head of Onyxia (Orgrimmar)
// is spawned within 100yd, swap to GOSSIP_HEAD_OG 6024; else use creature GossipMenuId.
export function saurfangGossipId(
  defaultGossipMenuId: number,
  onyxiaHeadSpawned: boolean,
): { gossipId: number; cite: string } {
  if (onyxiaHeadSpawned) {
    return {
      gossipId: GOSSIP_HEAD_OG,
      cite: 'orgrimmar.cpp:55-57 GO_HEAD_OF_ONYXIA_OG spawned → GOSSIP_HEAD_OG 6024',
    };
  }
  return {
    gossipId: defaultGossipMenuId,
    cite: 'orgrimmar.cpp:54 default GossipMenuId',
  };
}

// ScriptDev IR — npc_overlord_runthalak

// Cite: orgrimmar.cpp:40–50,66–69 gossip only. Binding: creature 14392 ScriptName npc_overlord_runthalak
// (in bake as Overlord Runthak). Celebration ender for quest 7491 For All To See.
export const NPC_OVERLORD_RUNTHALAK_SCRIPT: ScriptDevIR = {
  name: 'npc_overlord_runthalak',
  boundCreatures: [NPC_OVERLORD_RUNTHAK],
  sourceFile: 'kalimdor/orgrimmar.cpp',
  spellIds: [],
  timers: [],
  unusedBindings: [
    {
      entry: GO_HEAD_OF_NEFARIAN_OG,
      kind: 'go',
      reason:
        'GO 179881 Head of Nefarian (OG) gates gossip menu 6024 when spawned within 100yd; absent from product bake - default GossipMenuId path remains',
      cite: 'orgrimmar.cpp:34,43-45; loadRealBundle missing 179881',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'gossip-only head-of-Nefarian menu swap (runthalakGossipId pure helper)',
        cite: 'orgrimmar.cpp:40-50',
      },
    ],
  },
  cites: [
    'orgrimmar.cpp:40-50 GossipHello_npc_overlord_runthalak',
    'orgrimmar.cpp:34 GO_HEAD_OF_NEFARIAN_OG=179881',
    'orgrimmar.cpp:37 GOSSIP_HEAD_OG=6024',
    'orgrimmar.cpp:66-69 RegisterSelf pGossipHello npc_overlord_runthalak',
  ],
};

// ScriptDev IR — npc_high_overlord_saurfang

// npc_high_overlord_saurfang, creature 14720 — gossip only, the celebration ender for quest 7784.
// Cite: orgrimmar.cpp:52–62, :71–74.
export const NPC_HIGH_OVERLORD_SAURFANG_SCRIPT: ScriptDevIR = {
  name: 'npc_high_overlord_saurfang',
  boundCreatures: [NPC_HIGH_OVERLORD_SAURFANG],
  sourceFile: 'kalimdor/orgrimmar.cpp',
  spellIds: [],
  timers: [],
  unusedBindings: [
    {
      entry: GO_HEAD_OF_ONYXIA_OG,
      kind: 'go',
      reason:
        'GO 179556 Head of Onyxia (OG) gates gossip menu 6024 when spawned within 100yd; absent from product bake - default GossipMenuId path remains',
      cite: 'orgrimmar.cpp:35,55-57; loadRealBundle missing 179556',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'gossip-only head-of-Onyxia menu swap (saurfangGossipId pure helper)',
        cite: 'orgrimmar.cpp:52-62',
      },
    ],
  },
  cites: [
    'orgrimmar.cpp:52-62 GossipHello_npc_high_overlord_saurfang',
    'orgrimmar.cpp:35 GO_HEAD_OF_ONYXIA_OG=179556',
    'orgrimmar.cpp:37 GOSSIP_HEAD_OG=6024',
    'orgrimmar.cpp:71-74 RegisterSelf pGossipHello npc_high_overlord_saurfang',
  ],
};
