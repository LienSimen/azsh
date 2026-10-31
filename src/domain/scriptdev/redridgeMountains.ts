// Redridge Mountains ScriptDev IR ports. Source: eastern_kingdoms/redridge_mountains.cpp —
// npc_corporal_keeshan, escort quest 219. No combat cast timers: npc_escortAI has no spell kit.

import type { ScriptDevIR } from './types.ts';

// Constants — redridge_mountains.cpp npc_corporal_keeshan

// redridge_mountains.cpp:38–44
export const QUEST_MISSING_IN_ACTION = 219;

export const KEESHAN_PATH_ID = 349;
export const SAY_CORPORAL_KEESHAN_1 = 25;
export const SAY_CORPORAL_KEESHAN_2 = 26;
export const SAY_CORPORAL_KEESHAN_3 = 27;
export const SAY_CORPORAL_KEESHAN_4 = 30;

export const NPC_CORPORAL_KEESHAN = 349;
/** Turn-in NPC. Bake enderCreatureEntries for quest 219. */
export const NPC_MARSHAL_MARRIS = 382;

// FACTION_ESCORT_A_NEUTRAL_ACTIVE. Cite: ScriptDevAIMgr.h:48; redridge_mountains.cpp:57 SetFactionTemporary
export const FACTION_ESCORT_A_NEUTRAL_ACTIVE = 231;

// TEMPFACTION_RESTORE_RESPAWN. Cite: Creature.h:577 TEMPFACTION_RESTORE_RESPAWN=0x01;
// redridge_mountains.cpp:57
export const TEMPFACTION_RESTORE_RESPAWN = 0x01;

/** AI_EVENT_START_ESCORT. Cite: AIDefines.h:43 = 100; redridge_mountains.cpp:54,95 */
export const AI_EVENT_START_ESCORT = 100;

/** UNIT_STAND_STATE_STAND / SIT. Cite: Unit.h:97–98; redridge_mountains.cpp:67 SIT, :72 STAND */
export const UNIT_STAND_STATE_STAND = 0;
export const UNIT_STAND_STATE_SIT = 1;

// Pure helpers — ReceiveAIEvent + WaypointReached

export interface KeeshanReceiveEscortResult {
  handled: boolean;
  textId: number | null;
  factionId: number;
  factionFlags: number;
  pathId: number;
  questId: number;
  cite: string;
}

// Port of npc_corporal_keeshan_escortAI::ReceiveAIEvent escort start.
// Cite: redridge_mountains.cpp:52–59.
export function keeshanReceiveEscort(
  eventType: number,
  isPlayer: boolean,
  questId: number,
): KeeshanReceiveEscortResult {
  if (eventType !== AI_EVENT_START_ESCORT || !isPlayer) {
    return {
      handled: false,
      textId: null,
      factionId: 0,
      factionFlags: 0,
      pathId: 0,
      questId: 0,
      cite: 'redridge_mountains.cpp:54 !START_ESCORT or !player → no-op',
    };
  }
  return {
    handled: true,
    textId: SAY_CORPORAL_KEESHAN_1,
    factionId: FACTION_ESCORT_A_NEUTRAL_ACTIVE,
    factionFlags: TEMPFACTION_RESTORE_RESPAWN,
    pathId: KEESHAN_PATH_ID,
    questId,
    cite: 'redridge_mountains.cpp:56-58 SAY_1 + faction 231 + Start path 349',
  };
}

/** Escort WaypointReached actions. Cite: redridge_mountains.cpp:62–84 */
export const KEESHAN_WAYPOINTS = [
  {
    pointId: 25,
    textIds: [SAY_CORPORAL_KEESHAN_2] as readonly number[],
    standState: UNIT_STAND_STATE_SIT as number | null,
    questCredit: false,
    cite: 'redridge_mountains.cpp:66-70 case 25 SIT + SAY_CORPORAL_KEESHAN_2',
  },
  {
    pointId: 26,
    textIds: [SAY_CORPORAL_KEESHAN_3],
    standState: UNIT_STAND_STATE_STAND,
    questCredit: false,
    cite: 'redridge_mountains.cpp:71-75 case 26 STAND + SAY_CORPORAL_KEESHAN_3',
  },
  {
    pointId: 69,
    textIds: [SAY_CORPORAL_KEESHAN_4],
    standState: null,
    questCredit: true,
    cite: 'redridge_mountains.cpp:76-82 case 69 explore credit 219 + SAY_CORPORAL_KEESHAN_4',
  },
] as const;

export interface KeeshanWaypointResult {
  handled: boolean;
  textIds: number[];
  standState: number | null;
  questId: number | null;
  cite: string;
}

/** Port of npc_corporal_keeshan_escortAI::WaypointReached. Cite: redridge_mountains.cpp:62–84 */
export function keeshanWaypointReached(pointId: number): KeeshanWaypointResult {
  const step = KEESHAN_WAYPOINTS.find((w) => w.pointId === pointId);
  if (!step) {
    return {
      handled: false,
      textIds: [],
      standState: null,
      questId: null,
      cite: 'redridge_mountains.cpp:62-84 no case for this pointId',
    };
  }
  return {
    handled: true,
    textIds: [...step.textIds],
    standState: step.standState,
    questId: step.questCredit ? QUEST_MISSING_IN_ACTION : null,
    cite: step.cite,
  };
}

// npc_corporal_keeshan

// npc_corporal_keeshan, creature 349. No combat cast timers — the constructor only Resets. The
// escort start, waypoint sit/stand/talk and quest credit are pure helpers.
export const NPC_CORPORAL_KEESHAN_SCRIPT: ScriptDevIR = {
  name: 'npc_corporal_keeshan',
  boundCreatures: [NPC_CORPORAL_KEESHAN],
  sourceFile: 'eastern_kingdoms/redridge_mountains.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'npc_escortAI Reset (no combat timers / no m_* state)',
        cite: 'redridge_mountains.cpp:49 constructor Reset(); no field Reset override',
      },
    ],
  },
  cites: [
    'redridge_mountains.cpp:33-108 npc_corporal_keeshan',
    'redridge_mountains.cpp:49 constructor Reset (no combat timers)',
    'redridge_mountains.cpp:52-59 ReceiveAIEvent START_ESCORT SAY_1 + faction 231 + Start path 349',
    'redridge_mountains.cpp:62-84 WaypointReached WP25/26/69',
    'redridge_mountains.cpp:66-70 WP25 UNIT_STAND_STATE_SIT + SAY_CORPORAL_KEESHAN_2=26',
    'redridge_mountains.cpp:71-75 WP26 UNIT_STAND_STATE_STAND + SAY_CORPORAL_KEESHAN_3=27',
    'redridge_mountains.cpp:76-82 WP69 RewardPlayerAndGroupAtEventExplored(219) + SAY_4=30',
    'redridge_mountains.cpp:92-98 QuestAccept 219 SendAIEvent AI_EVENT_START_ESCORT',
    'redridge_mountains.cpp:38-44 QUEST=219 path=349 SAY_1..4=25/26/27/30',
    'ScriptDevAIMgr.h:48 FACTION_ESCORT_A_NEUTRAL_ACTIVE=231',
    'AIDefines.h:43 AI_EVENT_START_ESCORT=100',
    'Unit.h:97-98 UNIT_STAND_STATE_STAND=0 SIT=1',
  ],
};
