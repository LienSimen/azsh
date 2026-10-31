// QI4 — kalimdor/tanaris residuals, extracted for the 1500-line ratchet. This batch claims the
// accept hooks for quests 648 and 1560; mob_aquementas is combat residual. Cite: kalimdor/tanaris.cpp.

import type { DbScriptIntent } from './types.ts';
import { UNIT_STAND_STATE_STAND } from './opcodes.ts';

/** Matches registry.ts QuestScriptHook — local to avoid circular import. */
type QuestScriptHook = 'accept' | 'reward' | 'complete' | 'frame';

/** Minimal registry entry shape (mirrors registry.ts QuestScriptEntry). */
export interface TanarisQuestScriptEntry {
  family?: string;
  questId?: number;
  questIds?: number[];
  hooks?: QuestScriptHook[];
  run?: (phase: QuestScriptHook, questId: number) => DbScriptIntent[];
  cite?: string;
}

// ── sourced constants ────────────────────────────────────────────────────────

/** Cite: tanaris.cpp:148 QUEST_RESCUE_OOX_17TN = 648 Escort Homing Robot OOX-17/TN; WP35 explore credit. */
export const QUEST_RESCUE_OOX_17TN = 648;
/** Cite: tanaris.cpp:265 QUEST_TOOGA = 1560 FollowerAI Tooga → Torta LOS explore credit. */
export const QUEST_TOOGA = 1560;

/** Cite: bake starterCreatureEntries quest 648; scriptdev2 npc_oox17tn Homing Robot OOX-17/TN. */
const NPC_OOX17TN = 7784;
/** Cite: bake enderCreatureEntries quest 648 — Oglethorpe Obnoticus (7406). */
const NPC_OGLETHORPE = 7406;
/** Cite: bake starterCreatureEntries quest 1560; scriptdev2 npc_tooga Tooga. */
const NPC_TOOGA = 5955;
/** Cite: tanaris.cpp:266 NPC_TORTA = 6015 Bake enderCreatureEntries quest 1560. */
const NPC_TORTA = 6015;

/** Cite: tanaris.cpp:150–152 ambush templates. */
const NPC_SCORPION = 7803;
const NPC_SCOFFLAW = 7805;
const NPC_SHADOW_MAGE = 5617;

/** Cite: tanaris.cpp:141–146 OOX script texts (shared line ids with OOX-09/HL / OOX-22/FE). */
const SAY_OOX_START = -1000287;
const SAY_OOX_AGGRO1 = -1000288;
const SAY_OOX_AGGRO2 = -1000289;
const SAY_OOX_AMBUSH = -1000290;
const SAY_OOX17_AMBUSH_REPLY = -1000291;
const SAY_OOX_END = -1000292;

/** Cite: tanaris.cpp:256–263 Tooga / Torta post-event texts. */
const SAY_TOOG_THIRST = -1000391;
const SAY_TOOG_WORRIED = -1000392;
const SAY_TOOG_POST_1 = -1000393;
const SAY_TORT_POST_2 = -1000394;
const SAY_TOOG_POST_3 = -1000395;
const SAY_TORT_POST_4 = -1000396;
const SAY_TOOG_POST_5 = -1000397;
const SAY_TORT_POST_6 = -1000398;

/** Cite: ScriptDevAIMgr.h:53 FACTION_ESCORT_N_FRIEND_ACTIVE = 495 OOX SetFactionTemporary on accept. */
const FACTION_ESCORT_N_FRIEND_ACTIVE = 495;
/** Cite: ScriptDevAIMgr.h:52 FACTION_ESCORT_N_FRIEND_PASSIVE = 290 Tooga StartFollow faction. */
const FACTION_ESCORT_N_FRIEND_PASSIVE = 290;
/** Cite: Creature.h:577 TEMPFACTION_RESTORE_RESPAWN = 0x01 */
const TEMPFACTION_RESTORE_RESPAWN = 0x01;
/** Cite: Creature.h:582 TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x20 */
const TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x20;
// Cite: tanaris.cpp:242 TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x01 | 0x20 = 0x21
const OOX_TEMP_FACTION_FLAGS =
  TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC;

/** Cite: Unit.h:97 UNIT_STAND_STATE_STAND = 0 (opcodes.ts re-export) */
const UNIT_STAND_STATE_STAND_TANARIS = UNIT_STAND_STATE_STAND;
/** Cite: Unit.h:104 UNIT_STAND_STATE_DEAD = 7 OOX Reset() while not escorting. */
const UNIT_STAND_STATE_DEAD = 7;

// Cite: Object.h:45 TEMPSPAWN_CORPSE_TIMED_DESPAWN = 3 WP23/29 SummonCreature
// TEMPSPAWN_CORPSE_TIMED_DESPAWN.
const TEMPSPAWN_CORPSE_TIMED_DESPAWN = 3;
/** Cite: tanaris.cpp:173–175 WP23 scorpion despawn 30000ms */
const SCORPION_DESPAWN_MS = 30000;
/** Cite: tanaris.cpp:181 first scofflaw despawn 10000ms */
const SCOFFLAW_SHORT_DESPAWN_MS = 10000;
/** Cite: tanaris.cpp:182–184 shadow mage / second scofflaw 30000ms */
const AMBUSH_DESPAWN_MS = 30000;

/** Cite: tanaris.cpp:173–175 WP23 SummonCreature scorpion positions. */
const SCORPION_SPAWN = [
  { entry: NPC_SCORPION, x: -8340.7, y: -4448.17, z: 9.17, o: 3.1 },
  { entry: NPC_SCORPION, x: -8343.18, y: -4444.35, z: 9.44, o: 2.35 },
  { entry: NPC_SCORPION, x: -8348.7, y: -4457.8, z: 9.58, o: 2.02 },
] as const;
/** Cite: tanaris.cpp:181–184 WP29 SummonCreature positions. */
const WP29_SPAWN = [
  { entry: NPC_SCOFFLAW, x: -7488.02, y: -4786.56, z: 10.67, o: 3.74, despawn: SCOFFLAW_SHORT_DESPAWN_MS },
  { entry: NPC_SHADOW_MAGE, x: -7486.41, y: -4791.55, z: 10.54, o: 3.26, despawn: AMBUSH_DESPAWN_MS },
  { entry: NPC_SCOFFLAW, x: -7488.47, y: -4800.77, z: 9.77, o: 2.5, despawn: AMBUSH_DESPAWN_MS },
] as const;

/** Cite: tanaris.cpp:268 POINT_ID_TO_WATER = 1 Post-event MovePoint after dialogue phase 6. */
const POINT_ID_TO_WATER = 1;
/** Cite: tanaris.cpp:271 m_afToWaterLoc */
const TO_WATER_LOC = {
  x: -7032.664551,
  y: -4906.199219,
  z: -1.606446,
} as const;
/** Cite: ObjectDefines.h INTERACTION_DISTANCE = 5.0f Tooga MoveInLineOfSight Torta credit range. */
const INTERACTION_DISTANCE = 5;
/** Cite: tanaris.cpp:285 m_uiCheckSpeechTimer = 2500 initial; :374 = 5000 after tick */
const TOGA_SPEECH_TIMER_MS = 2500;
const TOGA_SPEECH_INTERVAL_MS = 5000;
/** Cite: tanaris.cpp:286 m_uiPostEventTimer = 1000; :332 = 5000 between phases */
const TOGA_POST_EVENT_START_MS = 1000;
const TOGA_POST_EVENT_INTERVAL_MS = 5000;

// ── accept handlers ──────────────────────────────────────────────────────────

// QuestAccept_npc_oox17tn — quest 648 Rescue OOX-17/TN!: talk, stand, temporary friendly faction
// and escort; two ambushes then the WP35 credit. Cite: tanaris.cpp:235–248, :161–194.
function runOox17tnAccept(): DbScriptIntent[] {
  const citeTalk =
    `tanaris.cpp:239 npc_oox17tn (${NPC_OOX17TN}) DoScriptText(SAY_OOX_START=${SAY_OOX_START})`;
  const citeActive = 'tanaris.cpp:240 SetActiveObjectState(true)';
  const citeStand =
    `tanaris.cpp:241 SetStandState(UNIT_STAND_STATE_STAND) from Reset DEAD=${UNIT_STAND_STATE_DEAD}`;
  const citeFaction =
    'tanaris.cpp:242 SetFactionTemporary(FACTION_ESCORT_N_FRIEND_ACTIVE, ' +
    'TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC)';
  const citeEscort =
    `tanaris.cpp:244–245 npc_oox17tn (${NPC_OOX17TN}) ` +
    'npc_escortAI::Start(false, player, quest) - FO6 degraded finishEscort';
  const citeWp23 =
    `tanaris.cpp:171–176 WP23 DoScriptText(SAY_OOX_AMBUSH=${SAY_OOX_AMBUSH}) + ` +
    `3× SummonCreature(NPC_SCORPION=${NPC_SCORPION} @ ${SCORPION_SPAWN[0].x}/` +
    `${SCORPION_SPAWN[1].x}/${SCORPION_SPAWN[2].x}) ` +
    `TEMPSPAWN_CORPSE_TIMED_DESPAWN=${TEMPSPAWN_CORPSE_TIMED_DESPAWN} ${SCORPION_DESPAWN_MS}ms - FO6`;
  const citeWp29 =
    `tanaris.cpp:178–187 WP29 SAY_OOX_AMBUSH=${SAY_OOX_AMBUSH} + ` +
    `NPC_SCOFFLAW=${NPC_SCOFFLAW} @ ${WP29_SPAWN[0].x} ${SCOFFLAW_SHORT_DESPAWN_MS}ms + ` +
    `NPC_SHADOW_MAGE=${NPC_SHADOW_MAGE} @ ${WP29_SPAWN[1].x} + ` +
    `NPC_SCOFFLAW @ ${WP29_SPAWN[2].x} SAY_OOX17_AMBUSH_REPLY=${SAY_OOX17_AMBUSH_REPLY} - FO6`;
  const citeAggro =
    `tanaris.cpp:202–210 Aggro urand SAY_OOX_AGGRO1/2=${SAY_OOX_AGGRO1}/${SAY_OOX_AGGRO2} - FO6 combat`;
  const citeSummoned =
    `tanaris.cpp:212–216 JustSummoned AttackStart(m_creature) for ` +
    `scorpion/scofflaw/mage ${NPC_SCORPION}/${NPC_SCOFFLAW}/${NPC_SHADOW_MAGE} - FO6 combat`;
  const citeCredit =
    `tanaris.cpp:188–192 WP35 DoScriptText(SAY_OOX_END=${SAY_OOX_END}) + ` +
    'RewardPlayerAndGroupAtEventExplored(648) - FO6 finishEscort';
  const citeEnder =
    `bake enderCreatureEntries NPC_OGLETHORPE=${NPC_OGLETHORPE} after WP35 explore credit`;
  return [
    {
      kind: 'talk',
      textId: SAY_OOX_START,
      stringTemplateId: 0,
      cite: citeTalk,
    },
    {
      kind: 'set_active_object',
      active: true,
      cite: citeActive,
    },
    {
      kind: 'stand_state',
      standState: UNIT_STAND_STATE_STAND_TANARIS,
      cite: citeStand,
    },
    {
      kind: 'set_faction',
      factionId: FACTION_ESCORT_N_FRIEND_ACTIVE,
      flags: OOX_TEMP_FACTION_FLAGS,
      cleared: false,
      cite: citeFaction,
    },
    {
      kind: 'skip',
      reason:
        `escort Start(false, player, quest) npc_oox17tn (${NPC_OOX17TN}) - FO6 degraded finishEscort`,
      cite: citeEscort,
    },
    {
      kind: 'skip',
      reason:
        `WP23 SAY_OOX_AMBUSH (${SAY_OOX_AMBUSH}) + 3× NPC_SCORPION (${NPC_SCORPION}) ` +
        `TEMPSPAWN_CORPSE_TIMED_DESPAWN (${TEMPSPAWN_CORPSE_TIMED_DESPAWN}) ${SCORPION_DESPAWN_MS}ms - FO6`,
      cite: citeWp23,
    },
    {
      kind: 'skip',
      reason:
        `WP29 SAY_OOX_AMBUSH (${SAY_OOX_AMBUSH}) + NPC_SCOFFLAW (${NPC_SCOFFLAW}) + ` +
        `NPC_SHADOW_MAGE (${NPC_SHADOW_MAGE}) + SAY_OOX17_AMBUSH_REPLY (${SAY_OOX17_AMBUSH_REPLY}) - FO6`,
      cite: citeWp29,
    },
    {
      kind: 'skip',
      reason:
        `Aggro SAY_OOX_AGGRO1/2 (${SAY_OOX_AGGRO1}/${SAY_OOX_AGGRO2}) - FO6 combat`,
      cite: citeAggro,
    },
    {
      kind: 'skip',
      reason:
        `JustSummoned AttackStart ambush (${NPC_SCORPION}/${NPC_SCOFFLAW}/${NPC_SHADOW_MAGE}) - FO6 combat`,
      cite: citeSummoned,
    },
    {
      kind: 'skip',
      reason:
        `WP35 SAY_OOX_END (${SAY_OOX_END}) + RewardPlayerAndGroupAtEventExplored(648) - FO6 finishEscort`,
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason: `turn-in NPC_OGLETHORPE (${NPC_OGLETHORPE}) after explore credit`,
      cite: citeEnder,
    },
  ];
}

// QuestAccept_npc_tooga — quest 1560 Tooga's Quest: start following at a friendly faction, and
// sighting Torta gives the explore credit before the post-event talk. Cite: tanaris.cpp:398–407.
function runToogaAccept(): DbScriptIntent[] {
  const citeFollow =
    `tanaris.cpp:402–403 npc_tooga (${NPC_TOOGA}) ` +
    `StartFollow(player, FACTION_ESCORT_N_FRIEND_PASSIVE=${FACTION_ESCORT_N_FRIEND_PASSIVE}, quest) ` +
    '- FO6 degraded FollowerAI finishEscort';
  const citeSpeech =
    `tanaris.cpp:370–383 speech timer ${TOGA_SPEECH_TIMER_MS}/${TOGA_SPEECH_INTERVAL_MS}ms ` +
    `urand SAY_TOOG_THIRST=${SAY_TOOG_THIRST} / SAY_TOOG_WORRIED=${SAY_TOOG_WORRIED} - FO6`;
  const citeCredit =
    `tanaris.cpp:296–308 LOS NPC_TORTA=${NPC_TORTA} INTERACTION_DISTANCE=${INTERACTION_DISTANCE}: ` +
    'RewardPlayerAndGroupAtEventExplored(1560) + SetFollowComplete(true) - FO6 finishEscort';
  const citePost =
    `tanaris.cpp:328–365 post-event timer ${TOGA_POST_EVENT_START_MS}/${TOGA_POST_EVENT_INTERVAL_MS}ms ` +
    `phases SAY_TOOG_POST_1=${SAY_TOOG_POST_1}…SAY_TORT_POST_6=${SAY_TORT_POST_6}; ` +
    `MovePoint(POINT_ID_TO_WATER=${POINT_ID_TO_WATER}, ` +
    `${TO_WATER_LOC.x},${TO_WATER_LOC.y},${TO_WATER_LOC.z}) - FO6`;
  const citeEnder =
    `bake enderCreatureEntries NPC_TORTA=${NPC_TORTA} after LOS explore credit`;
  return [
    {
      kind: 'skip',
      reason:
        `StartFollow(player, FACTION_ESCORT_N_FRIEND_PASSIVE=${FACTION_ESCORT_N_FRIEND_PASSIVE}, quest) ` +
        `npc_tooga (${NPC_TOOGA}) - FO6 degraded FollowerAI finishEscort`,
      cite: citeFollow,
    },
    {
      kind: 'skip',
      reason:
        `speech SAY_TOOG_THIRST (${SAY_TOOG_THIRST}) / SAY_TOOG_WORRIED (${SAY_TOOG_WORRIED}) - FO6`,
      cite: citeSpeech,
    },
    {
      kind: 'skip',
      reason:
        `LOS NPC_TORTA (${NPC_TORTA}) RewardPlayerAndGroupAtEventExplored(1560) ` +
        `INTERACTION_DISTANCE=${INTERACTION_DISTANCE} - FO6 finishEscort`,
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason:
        `post-event SAY_TOOG_POST_1–SAY_TORT_POST_6 (${SAY_TOOG_POST_1}–${SAY_TORT_POST_6}) + ` +
        `MovePoint water (${TO_WATER_LOC.x}) - FO6`,
      cite: citePost,
    },
    {
      kind: 'skip',
      reason: `turn-in NPC_TORTA (${NPC_TORTA}) after explore credit`,
      cite: citeEnder,
    },
  ];
}

// Family pack: kalimdor/tanaris.cpp Hooks: pQuestAcceptNPC oox17tn (648), tooga (1560). Residuals
// documented on accept chains: WP ambushes / Torta LOS credit.
export function runTanaris(
  phase: QuestScriptHook,
  questId: number,
): DbScriptIntent[] {
  if (phase === 'accept') {
    if (questId === QUEST_RESCUE_OOX_17TN) return runOox17tnAccept();
    if (questId === QUEST_TOOGA) return runToogaAccept();
    return [];
  }
  return [];
}

// Map entries spread into QUEST_SCRIPT_REGISTRY (keeps registry.ts under 1500). next-batch.mjs also matches
// `family: 'kalimdor/tanaris'` in registry.ts.
export const TANARIS_REGISTRY: Record<string | number, TanarisQuestScriptEntry> = {
  'kalimdor/tanaris': {
    family: 'kalimdor/tanaris',
    questIds: [QUEST_RESCUE_OOX_17TN, QUEST_TOOGA],
    hooks: ['accept'],
    cite: 'kalimdor/tanaris.cpp:235–248,398–407,161–194,292–310,323–383',
    run: runTanaris,
  },
  [QUEST_RESCUE_OOX_17TN]: {
    family: 'kalimdor/tanaris',
    questId: QUEST_RESCUE_OOX_17TN,
    questIds: [QUEST_RESCUE_OOX_17TN],
    hooks: ['accept'],
    cite: 'tanaris.cpp:235–248 QuestAccept_npc_oox17tn',
    run: runTanaris,
  },
  [QUEST_TOOGA]: {
    family: 'kalimdor/tanaris',
    questId: QUEST_TOOGA,
    questIds: [QUEST_TOOGA],
    hooks: ['accept'],
    cite: 'tanaris.cpp:398–407 QuestAccept_npc_tooga',
    run: runTanaris,
  },
};
