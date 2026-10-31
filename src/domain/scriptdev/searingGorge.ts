// Searing Gorge ScriptDev IR ports. Source: eastern_kingdoms/searing_gorge.cpp —
// npc_dorius_stonetender, escort quest 3367. Melee only; the escort ends on SpellHit 12198.

import type { ScriptDevIR } from './types.ts';

// Constants — searing_gorge.cpp npc_dorius_stonetender

// searing_gorge.cpp:39–53
export const SAY_DORIUS_AGGRO_1 = 4351;
export const SAY_DORIUS_AGGRO_2 = 4352;
export const SAY_DORIUS_AGGRO_3 = 4353;
export const SAY_DORIUS_TO_PLAYER = 4354;
export const SAY_DORIUS_FINISH = 4359;

export const NPC_DARK_IRON_STEELSHIFTER = 8337;
export const SPELL_MARKSMAN_HIT = 12198;
export const RELAY_SCRIPT_FINISHED = 8284;
export const PATH_ID_DORIUS = 8284;
export const QUEST_ID_SUNTARA_STONES = 3367;
export const NPC_DORIUS_STONETENDER = 8284;

/** FACTION_ESCORT_A_NEUTRAL_ACTIVE. Cite: ScriptDevAIMgr.h:48; searing_gorge.cpp:84 SetFactionTemporary */
export const FACTION_ESCORT_A_NEUTRAL_ACTIVE = 231;

// TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC. Cite: Creature.h:577+582;
// searing_gorge.cpp:84 = 0x01 | 0x20 = 0x21
export const DORIUS_TEMP_FACTION_FLAGS = 0x21;

// UNIT_STAND_STATE_DEAD while not escorting. Cite: Unit.h stand states; searing_gorge.cpp:66; QI4 test
// standState 7
export const UNIT_STAND_STATE_DEAD = 7;

/** UNIT_STAND_STATE_STAND on escort start. Cite: Unit.h:97; searing_gorge.cpp:83 */
export const UNIT_STAND_STATE_STAND = 0;

/** AI_EVENT_START_ESCORT. Cite: AIDefines.h:43; searing_gorge.cpp:81,144 */
export const AI_EVENT_START_ESCORT = 100;

// GO Singed Letter — quest 3367 goEnder (bake). Cite: bake quest 3367 goEnder 175704; not a ScriptName bind
export const GO_SINGED_LETTER = 175704;

// Pure helpers — Reset / Aggro / SpellHit / Waypoint / SummonedMovement

export interface DoriusResetResult {
  /** When true, Reset sets UNIT_STAND_STATE_DEAD. */
  standStateDead: boolean;
  standState: number | null;
  cite: string;
}

// Port of npc_dorius_stonetenderAI::Reset.
// Cite: searing_gorge.cpp:63–67.
export function doriusReset(escorting: boolean): DoriusResetResult {
  if (!escorting) {
    return {
      standStateDead: true,
      standState: UNIT_STAND_STATE_DEAD,
      cite: 'searing_gorge.cpp:65-66 !escorting → SetStandState(UNIT_STAND_STATE_DEAD, true)',
    };
  }
  return {
    standStateDead: false,
    standState: null,
    cite: 'searing_gorge.cpp:65 escorting → keep stand state',
  };
}

export interface DoriusAggroYellResult {
  textId: number;
  cite: string;
}

// Port of npc_dorius_stonetenderAI::Aggro; `roll02` picks one of three yells.
// Cite: searing_gorge.cpp:69–77.
export function doriusAggroYell(roll02: number): DoriusAggroYellResult {
  const texts = [SAY_DORIUS_AGGRO_1, SAY_DORIUS_AGGRO_2, SAY_DORIUS_AGGRO_3] as const;
  const idx = ((roll02 | 0) % 3 + 3) % 3;
  return {
    textId: texts[idx]!,
    cite: 'searing_gorge.cpp:71-76 urand(0,2) → SAY_DORIUS_AGGRO_1/2/3 (4351–4353)',
  };
}

export interface DoriusSpellHitResult {
  handled: boolean;
  /** Explore credit quest id, or null when not Marksman Hit. */
  questId: number | null;
  /** ScriptsStart(SCRIPT_TYPE_RELAY, …) id. */
  relayScriptId: number | null;
  endEscort: boolean;
  cite: string;
}

// Port of npc_dorius_stonetenderAI::SpellHit. Cite: searing_gorge.cpp:89–99 Escort end: Marksman Hit →
// explore credit 3367 + relay 8284 + End(). FO6 finishEscort models the explore credit (specialFlags:2).
export function doriusSpellHit(spellId: number): DoriusSpellHitResult {
  if ((spellId | 0) !== SPELL_MARKSMAN_HIT) {
    return {
      handled: false,
      questId: null,
      relayScriptId: null,
      endEscort: false,
      cite: 'searing_gorge.cpp:91 spellId != SPELL_MARKSMAN_HIT → no-op',
    };
  }
  return {
    handled: true,
    questId: QUEST_ID_SUNTARA_STONES,
    relayScriptId: RELAY_SCRIPT_FINISHED,
    endEscort: true,
    cite:
      'searing_gorge.cpp:91-98 SPELL_MARKSMAN_HIT → RewardPlayerAndGroupAtEventExplored(3367) + ScriptsStart(RELAY 8284) + End()',
  };
}

/** Escort WaypointReached actions. Cite: searing_gorge.cpp:107–124 */
export const DORIUS_WAYPOINTS = [
  {
    pointId: 37,
    textIds: [SAY_DORIUS_TO_PLAYER] as readonly number[],
    pointEmote: true,
    facePlayer: false,
    cite: 'searing_gorge.cpp:111-117 case 37 SAY_DORIUS_TO_PLAYER + EMOTE_ONESHOT_POINT',
  },
  {
    pointId: 53,
    textIds: [] as readonly number[],
    pointEmote: false,
    facePlayer: true,
    cite: 'searing_gorge.cpp:119-122 case 53 SetFacingToObject(player)',
  },
] as const;

export interface DoriusWaypointResult {
  handled: boolean;
  textIds: number[];
  pointEmote: boolean;
  facePlayer: boolean;
  cite: string;
}

/** Port of npc_dorius_stonetenderAI::WaypointReached. Cite: searing_gorge.cpp:107–124 */
export function doriusWaypointReached(pointId: number): DoriusWaypointResult {
  const step = DORIUS_WAYPOINTS.find((w) => w.pointId === pointId);
  if (!step) {
    return {
      handled: false,
      textIds: [],
      pointEmote: false,
      facePlayer: false,
      cite: 'searing_gorge.cpp:107-124 no case for this pointId',
    };
  }
  return {
    handled: true,
    textIds: [...step.textIds],
    pointEmote: step.pointEmote,
    facePlayer: step.facePlayer,
    cite: step.cite,
  };
}

export interface DoriusSummonedMovementResult {
  handled: boolean;
  /** AttackStart Dorius when steelshifter reaches point 2. */
  attackEscort: boolean;
  cite: string;
}

// Port of npc_dorius_stonetenderAI::SummonedMovementInform.
// Cite: searing_gorge.cpp:101–105.
export function doriusSummonedMovementInform(
  summonedEntry: number,
  pointId: number,
): DoriusSummonedMovementResult {
  if (
    (summonedEntry | 0) === NPC_DARK_IRON_STEELSHIFTER &&
    (pointId | 0) === 2
  ) {
    return {
      handled: true,
      attackEscort: true,
      cite: 'searing_gorge.cpp:103-104 NPC_DARK_IRON_STEELSHIFTER + uiPointId==2 → AttackStart(Dorius)',
    };
  }
  return {
    handled: false,
    attackEscort: false,
    cite: 'searing_gorge.cpp:103 entry/point mismatch → no-op',
  };
}

export interface DoriusReceiveEscortEventResult {
  handled: boolean;
  standState: number;
  factionId: number;
  factionFlags: number;
  pathId: number;
  questId: number;
  cite: string;
}

// Port of npc_dorius_stonetenderAI::ReceiveAIEvent, START_ESCORT branch. QI4 accept already emits
// these intents; this documents the AI receive path. Cite: searing_gorge.cpp:79–87.
export function doriusReceiveStartEscort(
  eventType: number,
  isPlayerInvoker: boolean,
  questId: number,
): DoriusReceiveEscortEventResult {
  if ((eventType | 0) !== AI_EVENT_START_ESCORT || !isPlayerInvoker) {
    return {
      handled: false,
      standState: UNIT_STAND_STATE_DEAD,
      factionId: 0,
      factionFlags: 0,
      pathId: 0,
      questId: 0,
      cite: 'searing_gorge.cpp:81 !START_ESCORT or !player → no-op',
    };
  }
  return {
    handled: true,
    standState: UNIT_STAND_STATE_STAND,
    factionId: FACTION_ESCORT_A_NEUTRAL_ACTIVE,
    factionFlags: DORIUS_TEMP_FACTION_FLAGS,
    pathId: PATH_ID_DORIUS,
    questId: questId | 0,
    cite:
      'searing_gorge.cpp:83-85 STAND + FACTION_ESCORT_A_NEUTRAL_ACTIVE 231 flags 0x21 + Start path 8284',
  };
}

// npc_dorius_stonetender

// npc_dorius_stonetenderAI, creature 8284. No combat cast timers — UpdateEscortAI is melee only,
// and the escort ends on SpellHit 12198 rather than a waypoint. Ambush 8337 is in bake.
export const NPC_DORIUS_STONETENDER_SCRIPT: ScriptDevIR = {
  name: 'npc_dorius_stonetender',
  boundCreatures: [NPC_DORIUS_STONETENDER],
  sourceFile: 'eastern_kingdoms/searing_gorge.cpp',
  spellIds: [SPELL_MARKSMAN_HIT],
  timers: [],
  lifecycle: {
    onAggro: [
      {
        kind: 'yell',
        textId: SAY_DORIUS_AGGRO_1,
        cite: 'searing_gorge.cpp:69-77 Aggro: urand SAY_DORIUS_AGGRO_1/2/3 (doriusAggroYell)',
      },
    ],
    onReset: [
      {
        kind: 'flavor',
        text: 'UNIT_STAND_STATE_DEAD (OOC only)',
        cite: 'searing_gorge.cpp:65-66 SetStandState(UNIT_STAND_STATE_DEAD) when not escorting',
      },
    ],
  },
  spellHits: [
    {
      spellId: SPELL_MARKSMAN_HIT,
      once: true,
      actions: [
        {
          kind: 'quest_credit',
          entry: QUEST_ID_SUNTARA_STONES,
          cite: 'searing_gorge.cpp:93-94 RewardPlayerAndGroupAtEventExplored(QUEST_ID_SUNTARA_STONES=3367)',
        },
        {
          kind: 'flavor',
          text: `ScriptsStart(SCRIPT_TYPE_RELAY, RELAY_SCRIPT_FINISHED=${RELAY_SCRIPT_FINISHED}) + End()`,
          cite: 'searing_gorge.cpp:96-97 relay 8284 + escort End()',
        },
        {
          kind: 'stop_combat',
          cite: 'searing_gorge.cpp:97 End() ends escort combat/movement',
        },
      ],
      cite: 'searing_gorge.cpp:89-99 SpellHit SPELL_MARKSMAN_HIT=12198 explore credit + relay + End',
    },
  ],
  cites: [
    'searing_gorge.cpp:33-158 npc_dorius_stonetender',
    'searing_gorge.cpp:39-53 SAY_* / NPC_DARK_IRON_STEELSHIFTER / SPELL_MARKSMAN_HIT / RELAY / PATH / QUEST',
    'searing_gorge.cpp:63-67 Reset DEAD stand when !escorting (no combat timers)',
    'searing_gorge.cpp:69-77 Aggro urand SAY 4351-4353',
    'searing_gorge.cpp:79-87 ReceiveAIEvent START_ESCORT stand + faction 231 + Start path 8284',
    'searing_gorge.cpp:89-99 SpellHit 12198 explore credit 3367 + RELAY 8284 + End',
    'searing_gorge.cpp:101-105 SummonedMovementInform steelshifter 8337 point 2 AttackStart',
    'searing_gorge.cpp:107-124 WaypointReached WP37 SAY 4354 + point; WP53 face player',
    'searing_gorge.cpp:126-132 UpdateEscortAI melee only',
    'searing_gorge.cpp:140-149 QuestAccept 3367 SendAIEvent START_ESCORT (QI4 registry)',
    'ScriptDevAIMgr.h:48 FACTION_ESCORT_A_NEUTRAL_ACTIVE=231',
  ],
};
