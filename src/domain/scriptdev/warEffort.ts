// ScriptDev IR port of world/war_effort.cpp: npc_war_effort, go_scarab_gong and npc_silithus_boss.
// The 30 collectors and GO 180717 are absent from bake; the three colossi are present.

import type { ScriptDevIR, ScriptDevUnusedBinding, ScriptDevQuestRewarded } from './types.ts';
import {
  GO_SCARAB_GONG,
  PHASE_3_GONG_TIME,
  PHASE_4_10_HOUR_WAR,
  QUEST_BANG_A_GONG,
  SAY_BANG_GONG,
  SAY_QIRAJI_BREAK,
  TYPE_GONG_TIME,
  WAR_EFFORT_DELIVERIES,
  WAR_EFFORT_QUEST_IDS,
} from '../quests/interpreter/dbscript/registryWarEffort.ts';

// Entries (scriptdev2.sql:146-149 + world_kalimdor.h:33-35)

/** Cite: scriptdev2.sql:146-147 npc_war_effort bindings. */
export const WAR_EFFORT_COLLECTOR_ENTRIES: readonly number[] = [
  15383, 15431, 15432, 15434, 15437, 15445, 15446, 15448, 15450, 15451, 15452,
  15453, 15455, 15456, 15457, 15459, 15460, 15469, 15477, 15508, 15512, 15515,
  15522, 15525, 15528, 15529, 15532, 15533, 15534, 15535,
];

/** Cite: world_kalimdor.h:33 NPC_COLOSSUS_OF_ZORA */
export const NPC_COLOSSUS_OF_ZORA = 15740;
/** Cite: world_kalimdor.h:34 NPC_COLOSSUS_OF_REGAL */
export const NPC_COLOSSUS_OF_REGAL = 15741;
/** Cite: world_kalimdor.h:35 NPC_COLOSSUS_OF_ASHI */
export const NPC_COLOSSUS_OF_ASHI = 15742;

export const SILITHUS_BOSS_ENTRIES: readonly number[] = [
  NPC_COLOSSUS_OF_ZORA,
  NPC_COLOSSUS_OF_REGAL,
  NPC_COLOSSUS_OF_ASHI,
];

/** Present in product creatures bake (loadRealBundle). */
export const WAR_EFFORT_IN_BAKE: readonly number[] = [
  NPC_COLOSSUS_OF_ZORA,
  NPC_COLOSSUS_OF_REGAL,
  NPC_COLOSSUS_OF_ASHI,
];

// Silithus boss texts + AQSilithusBoss bits (war_effort.cpp + WorldState.h)

/** Cite: war_effort.cpp:247 JustRespawned Ashi textId */
export const SAY_COLOSSUS_ASHI = 11426;
/** Cite: war_effort.cpp:248 JustRespawned Regal textId */
export const SAY_COLOSSUS_REGAL = 11424;
/** Cite: war_effort.cpp:249 JustRespawned Zora textId */
export const SAY_COLOSSUS_ZORA = 11425;

/** Cite: WorldState.h:199 AQ_SILITHUS_BOSS_ASHI = 0 */
export const AQ_SILITHUS_BOSS_ASHI = 0;
/** Cite: WorldState.h:200 AQ_SILITHUS_BOSS_REGAL = 1 */
export const AQ_SILITHUS_BOSS_REGAL = 1;
/** Cite: WorldState.h:201 AQ_SILITHUS_BOSS_ZORA = 2 */
export const AQ_SILITHUS_BOSS_ZORA = 2;

const COLLECTOR_NAMES: Readonly<Record<number, string>> = {
  15383: 'Sergeant Stonebrow',
  15431: 'Corporal Carnes',
  15432: 'Dame Twinbraid',
  15434: 'Private Draxlegauge',
  15437: 'Master Nightsong',
  15445: 'Sergeant Major Germaine',
  15446: 'Bonnie Stoneflayer',
  15448: 'Private Porter',
  15450: 'Marta Finespindle',
  15451: 'Sentinel Silversky',
  15452: 'Nurse Stonefield',
  15453: 'Keeper Moonshade',
  15455: 'Slicky Gastronome',
  15456: 'Sarah Sadwhistle',
  15457: 'Huntress Swiftriver',
  15459: 'Miner Cromwell',
  15460: 'Grunt Maug',
  15469: "Senior Sergeant T'kelah",
  15477: 'Herbalist Proudfeather',
  15508: "Batrider Pele'keiki",
  15512: 'Apothecary Jezel',
  15515: 'Skinner Jamani',
  15522: 'Sergeant Umala',
  15525: 'Doctor Serratus',
  15528: 'Healer Longrunner',
  15529: 'Lady Callow',
  15532: 'Stoneguard Clayhoof',
  15533: 'Bloodguard Rawtar',
  15534: "Fisherman Lin'do",
  15535: 'Chief Sharpclaw',
};

function absentCreature(
  entry: number,
  name: string,
  script: string,
  detail: string,
): ScriptDevUnusedBinding {
  return {
    entry,
    kind: 'creature',
    reason: `NPC ${entry} ${name} bound to ${script} (${detail}) but absent from product creatures bake`,
    cite: `scriptdev2.sql:146-149 ${script}; corpus boundCreatures; loadRealBundle missing ${entry}`,
  };
}

function absentGo(entry: number, name: string, detail: string): ScriptDevUnusedBinding {
  return {
    entry,
    kind: 'go',
    reason: `GO ${entry} ${name} bound to go_scarab_gong (${detail}) but absent from product gameObjects bake`,
    cite: `scriptdev2.sql:148 go_scarab_gong entry=${entry}; loadRealBundle missing GO`,
  };
}

// Pure helpers (source-faithful; no invented numbers)

// JustRespawned broadcast text by colossus entry. Cite: war_effort.cpp:241-252
// SilithusBossAI::JustRespawned
export function silithusBossJustRespawned(entry: number): { textId: number } | null {
  switch (entry | 0) {
    case NPC_COLOSSUS_OF_ASHI:
      return { textId: SAY_COLOSSUS_ASHI };
    case NPC_COLOSSUS_OF_REGAL:
      return { textId: SAY_COLOSSUS_REGAL };
    case NPC_COLOSSUS_OF_ZORA:
      return { textId: SAY_COLOSSUS_ZORA };
    default:
      return null;
  }
}

// Map colossus entry → AQSilithusBoss ordinal. Cite: war_effort.cpp:255-266 SilithusBossAI::JustDied switch
export function silithusBossOrdinal(entry: number): number | null {
  switch (entry | 0) {
    case NPC_COLOSSUS_OF_ASHI:
      return AQ_SILITHUS_BOSS_ASHI;
    case NPC_COLOSSUS_OF_REGAL:
      return AQ_SILITHUS_BOSS_REGAL;
    case NPC_COLOSSUS_OF_ZORA:
      return AQ_SILITHUS_BOSS_ZORA;
    default:
      return null;
  }
}

/** JustDied → SetSilithusBossKilled bit OR. Cite: WorldState.cpp:926-929 m_killedBosses |= (1 << boss) */
export function silithusBossJustDied(
  entry: number,
  killedBosses: number,
): { boss: number; killedBosses: number } | null {
  const boss = silithusBossOrdinal(entry);
  if (boss == null) return null;
  return {
    boss,
    killedBosses: (killedBosses | 0) | (1 << boss),
  };
}

// Bang a Gong GO reward — phase gate + talks + TYPE_GONG_TIME + phase 4. Cite: war_effort.cpp:221-235
// QuestRewarded_war_effort(Player,GameObject,Quest)
export function bangAGongOnReward(aqPhase: number): {
  handled: boolean;
  phaseGatePassed: boolean;
  textIds: number[];
  typeGongTime: number;
  nextPhase: number | null;
} {
  // C++ always returns true; only phase body runs in PHASE_3.
  if ((aqPhase | 0) !== PHASE_3_GONG_TIME) {
    return {
      handled: true,
      phaseGatePassed: false,
      textIds: [],
      typeGongTime: TYPE_GONG_TIME,
      nextPhase: null,
    };
  }
  return {
    handled: true,
    phaseGatePassed: true,
    textIds: [SAY_BANG_GONG, SAY_QIRAJI_BREAK],
    typeGongTime: 0,
    nextPhase: PHASE_4_10_HOUR_WAR,
  };
}

/** NPC resource turn-in residual shape (QI4 owns live set_worldstate). Cite: war_effort.cpp:118-192 */
export function warEffortNpcReward(questId: number): {
  resource: number;
  worldstateId: number;
  itemCount: number;
  itemId: number;
  enderNpc: number;
} | null {
  const d = WAR_EFFORT_DELIVERIES[questId | 0];
  if (!d) return null;
  return {
    resource: d.resource,
    worldstateId: d.worldstateId,
    itemCount: d.itemCount,
    itemId: d.itemId,
    enderNpc: d.enderNpc,
  };
}

// questRewarded IR builders (document; QI4 residual is the live turn-in path)

function npcResourceQuestRewarded(): ScriptDevQuestRewarded[] {
  const out: ScriptDevQuestRewarded[] = [];
  for (const questId of WAR_EFFORT_QUEST_IDS) {
    if (questId === QUEST_BANG_A_GONG) continue;
    const d = WAR_EFFORT_DELIVERIES[questId];
    if (!d) continue;
    out.push({
      questId,
      actions: [
        {
          kind: 'flavor',
          text:
            `AddWarEffortProgress(resource=${d.resource}, count=${d.itemCount}) ` +
            `→ worldstate ${d.worldstateId}; collector ${d.enderNpc}; ` +
            `item ${d.itemId}×${d.itemCount} (QI4 registryWarEffort owns live write)`,
          cite: `war_effort.cpp:120,190 quest ${questId} → resource ${d.resource}`,
        },
      ],
      cite: `war_effort.cpp:122-187 switch quest ${questId}`,
    });
  }
  return out;
}

// ScriptDev IR — npc_war_effort

// QuestRewarded_war_effort for the 30 Ironforge and Orgrimmar collectors, all absent from bake. The
// live turn-in is the QI4 registry, so this IR must not re-emit it. Cite: war_effort.cpp:118-192.
export const NPC_WAR_EFFORT: ScriptDevIR = {
  name: 'npc_war_effort',
  boundCreatures: [...WAR_EFFORT_COLLECTOR_ENTRIES],
  sourceFile: 'world/war_effort.cpp',
  spellIds: [],
  timers: [],
  questRewarded: npcResourceQuestRewarded(),
  unusedBindings: WAR_EFFORT_COLLECTOR_ENTRIES.map((entry) =>
    absentCreature(
      entry,
      COLLECTOR_NAMES[entry] ?? `entry ${entry}`,
      'npc_war_effort',
      'AQ War Effort resource collector',
    ),
  ),
  cites: [
    'war_effort.cpp:25-115 quest id enums',
    'war_effort.cpp:118-192 QuestRewarded_war_effort NPC → AddWarEffortProgress',
    'war_effort.cpp:269-274 AddSC_war_effort npc_war_effort',
    'scriptdev2.sql:146-147 30 collector entries',
    'QI4 residual: registryWarEffort.ts WAR_EFFORT_DELIVERIES + runWarEffort',
  ],
};

// ScriptDev IR — go_scarab_gong

// QuestRewarded_war_effort for GO 180717 The Scarab Gong, absent from bake so the binding is
// unused. The live turn-in is the QI4 residual. Cite: war_effort.cpp:221-235.
export const GO_SCARAB_GONG_SCRIPT: ScriptDevIR = {
  name: 'go_scarab_gong',
  boundCreatures: [],
  boundGos: [GO_SCARAB_GONG],
  sourceFile: 'world/war_effort.cpp',
  spellIds: [],
  timers: [],
  questRewarded: [
    {
      questId: QUEST_BANG_A_GONG,
      actions: [
        {
          kind: 'yell',
          textId: SAY_BANG_GONG,
          cite: `war_effort.cpp:227 SendBgNeutralToPlayer(SAY_BANG_GONG=${SAY_BANG_GONG})`,
        },
        {
          kind: 'yell',
          textId: SAY_QIRAJI_BREAK,
          cite: `war_effort.cpp:228 SendBgNeutralToPlayer(SAY_QIRAJI_BREAK=${SAY_QIRAJI_BREAK})`,
        },
        {
          kind: 'set_instance_data',
          field: TYPE_GONG_TIME,
          value: 0,
          cite: `war_effort.cpp:229-230 SetData(TYPE_GONG_TIME=${TYPE_GONG_TIME}, 0)`,
        },
        {
          kind: 'flavor',
          text:
            `HandleWarEffortPhaseTransition(PHASE_4_10_HOUR_WAR=${PHASE_4_10_HOUR_WAR}) ` +
            `gated on GetAqPhase()==PHASE_3_GONG_TIME (${PHASE_3_GONG_TIME}); pure helper bangAGongOnReward`,
          cite: 'war_effort.cpp:225-231 PHASE_3 gate + phase 4 transition',
        },
      ],
      cite: 'war_effort.cpp:221-235 QuestRewarded_war_effort GO Bang a Gong',
    },
  ],
  unusedBindings: [
    absentGo(GO_SCARAB_GONG, 'The Scarab Gong', 'quest 8743 Bang a Gong ender'),
  ],
  cites: [
    'war_effort.cpp:112 QUEST_BANG_A_GONG=8743',
    'war_effort.cpp:114-115 SAY_BANG_GONG/SAY_QIRAJI_BREAK',
    'war_effort.cpp:221-235 GO reward body',
    'war_effort.cpp:276-279 AddSC go_scarab_gong',
    'world_kalimdor.h:48 TYPE_GONG_TIME=4',
    'scriptdev2.sql:148 GO 180717',
    'QI4 residual: registryWarEffort.ts runBangAGongReward',
  ],
};

// ScriptDev IR — npc_silithus_boss

// SilithusBossAI on 15740/15741/15742, all present in bake. CombatAI with no cast timers: a
// JustRespawned yell and a JustDied kill bit. Cite: war_effort.cpp:237-267.
export const NPC_SILITHUS_BOSS: ScriptDevIR = {
  name: 'npc_silithus_boss',
  boundCreatures: [...SILITHUS_BOSS_ENTRIES],
  sourceFile: 'world/war_effort.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text:
          'JustRespawned DoBroadcastText by entry: Ashi 11426 / Regal 11424 / Zora 11425 ' +
          '(pure helper silithusBossJustRespawned)',
        cite: 'war_effort.cpp:241-252 JustRespawned',
      },
    ],
    onDeath: [
      {
        kind: 'flavor',
        text:
          'JustDied sWorldState.SetSilithusBossKilled(entry→ASHI|REGAL|ZORA bit) ' +
          '(pure helper silithusBossJustDied; WorldState.cpp:926-937 game events)',
        cite: 'war_effort.cpp:255-266 JustDied',
      },
    ],
  },
  cites: [
    'war_effort.cpp:237-239 SilithusBossAI CombatAI(creature, 0)',
    'war_effort.cpp:241-252 JustRespawned texts 11426/11424/11425',
    'war_effort.cpp:255-266 JustDied AQ_SILITHUS_BOSS_* bits',
    'war_effort.cpp:281-284 AddSC npc_silithus_boss',
    'world_kalimdor.h:33-35 NPC_COLOSSUS_OF_*',
    'WorldState.h:197-202 AQSilithusBoss; WorldState.cpp:926-937 SetSilithusBossKilled',
    'scriptdev2.sql:149 entries 15742,15741,15740',
  ],
};

// Re-export QI4 constants used by tests / host consumers
export {
  GO_SCARAB_GONG,
  PHASE_3_GONG_TIME,
  PHASE_4_10_HOUR_WAR,
  QUEST_BANG_A_GONG,
  SAY_BANG_GONG,
  SAY_QIRAJI_BREAK,
  TYPE_GONG_TIME,
  WAR_EFFORT_DELIVERIES,
  WAR_EFFORT_QUEST_IDS,
};
