// QI4 — kalimdor/feralas residuals, extracted for the 1500-line ratchet. Quests 2767, 2845 and
// 2969, plus the cage-door and Shay's Bell residuals. Cite: kalimdor/feralas.cpp.

import type { DbScriptIntent } from './types.ts';
import {
  UNIT_FLAG_CHANGE_REMOVE,
  UNIT_STAND_STATE_STAND,
} from './opcodes.ts';

/** Matches registry.ts QuestScriptHook — local to avoid circular import. */
type QuestScriptHook = 'accept' | 'reward' | 'complete' | 'frame';

/** Minimal registry entry shape (mirrors registry.ts QuestScriptEntry). */
export interface FeralasQuestScriptEntry {
  family?: string;
  questId?: number;
  questIds?: number[];
  hooks?: QuestScriptHook[];
  run?: (phase: QuestScriptHook, questId: number) => DbScriptIntent[];
  cite?: string;
}

// ── sourced constants ────────────────────────────────────────────────────────

/** Cite: feralas.cpp:60 QUEST_RESCUE_OOX22FE = 2767 Escort Homing Robot OOX-22/FE; WP38 explore credit. */
export const QUEST_RESCUE_OOX22FE = 2767;
// Cite: feralas.cpp:178 QUEST_ID_WANDERING_SHAY = 2845 FollowerAI Shay Leafrunner; Rockbiter LOS explore
// credit.
export const QUEST_ID_WANDERING_SHAY = 2845;
// Cite: feralas.cpp:333 QUEST_FREEDOM_ALL_CREATURES = 2969 Kindal Moonweaver follow + cage free event
// explore credit.
export const QUEST_FREEDOM_ALL_CREATURES = 2969;

/** Cite: bake starterCreatureEntries quest 2767; scriptdev2 npc_oox22fe Homing Robot OOX-22/FE. */
const NPC_OOX22FE = 7807;
/** Cite: bake enderCreatureEntries quest 2767 — Oglethorpe Obnoticus (7406). */
const NPC_OGLETHORPE = 7406;
/** Cite: feralas.cpp:53–58 ambush templates. */
const NPC_YETI = 7848;
const NPC_GORILLA = 5260;
const NPC_WOODPAW_REAVER = 5255;
const NPC_WOODPAW_BRUTE = 5253;
const NPC_WOODPAW_ALPHA = 5258;
const NPC_WOODPAW_MYSTIC = 5254;

/** Cite: bake starterCreatureEntries quest 2845; scriptdev2 npc_shay_leafrunner Shay Leafrunner. */
const NPC_SHAY_LEAFRUNNER = 7774;
/** Cite: feralas.cpp:177 NPC_ROCKBITER = 7765 Bake enderCreatureEntries quest 2845. */
const NPC_ROCKBITER = 7765;
// Cite: feralas.cpp:176 SPELL_SHAYS_BELL = 11402 Player item spell recalls wandering Shay
// (AI_EVENT_CUSTOM_A).
const SPELL_SHAYS_BELL = 11402;
// Cite: bake itemTargets quest 2845 — Shay's Bell (9189) deliver objective. Casts SPELL_SHAYS_BELL while
// escorting; also required to complete/turn-in.
const ITEM_SHAYS_BELL = 9189;

/** Cite: feralas.cpp:331 NPC_KINDAL_MOONWEAVER = 7956 Bake starter/enderCreatureEntries quest 2969. */
const NPC_KINDAL_MOONWEAVER = 7956;
/** Cite: feralas.cpp:329–330 cage free + raider. */
const NPC_CAPTURED_SPRITE_DARTER = 7997;
const NPC_GRIMTOTEM_RAIDER = 7725;
/** Cite: bake srcItem quest 2969 — Bamboo Cage Key (12301). */
const ITEM_BAMBOO_CAGE_KEY = 12301;

// Cite: feralas.cpp:47 SAY_OOX_START = -1000287 DoScriptText on OOX-22/FE accept (same text id as
// OOX-09/HL).
const SAY_OOX_START = -1000287;
/** Cite: feralas.cpp:48–51 ambush / end lines. */
const SAY_OOX_AGGRO1 = -1000288;
const SAY_OOX_AGGRO2 = -1000289;
const SAY_OOX_AMBUSH = -1000290;
const SAY_OOX_END = -1000292;

/** Cite: feralas.cpp:164 SAY_ESCORT_START = -1001106 DoScriptText on Shay accept. */
const SAY_ESCORT_START = -1001106;
/** Cite: feralas.cpp:165–174 Shay wander / complete texts. */
const SAY_WANDER_1 = -1001107;
const SAY_WANDER_4 = -1001110;
const SAY_WANDER_DONE_1 = -1001111;
const SAY_WANDER_DONE_3 = -1001113;
const EMOTE_WANDER = -1001114;
const SAY_EVENT_COMPLETE_1 = -1001115;
const SAY_EVENT_COMPLETE_2 = -1001116;

/** Cite: feralas.cpp:324–327 Kindal script texts. */
const SAY_KINDAL_QUEST_START = -1010023;
const SAY_KINDAL_INITIAL_AGGRO = -1010024;
const SAY_KINDAL_AGGRO = -1010025;
const SAY_KINDAL_QUEST_COMPLETE = -1010026;

/** Cite: feralas.cpp:335–337 Kindal combat spells (FO6). */
const SPELL_MANA_BURN = 11981;
const SPELL_SHOOT = 14443;
const SPELL_MULTI_SHOT = 6660;

/** Cite: feralas.cpp:340 raiderSpawnPos for GOUse_go_cage_door. */
const RAIDER_SPAWN = {
  x: -4515.35,
  y: 811.36,
  z: 62.99,
  o: 3.60244,
} as const;
// Cite: feralas.cpp:427 TEMPSPAWN_DEAD_DESPAWN, 10 * MINUTE * IN_MILLISECONDS Common.h MINUTE=60;
// IN_MILLISECONDS=1000 → 600000ms.
const RAIDER_DESPAWN_MS = 10 * 60 * 1000;
/** Cite: feralas.cpp:215 ForcedDespawn(30000) after Shay LOS credit. */
const SHAY_CREDIT_DESPAWN_MS = 30000;
// Cite: feralas.cpp:245 m_uiWanderTimer = 30000 on AI_EVENT_START_EVENT. Cite: feralas.cpp:226
// m_uiWanderTimer = 60000 after bell recall.
const SHAY_WANDER_TIMER_MS = 30000;
const SHAY_RECALL_WANDER_MS = 60000;
/** Cite: feralas.cpp:489 m_despawnTimer = 5 * IN_MILLISECONDS after Kindal credit. */
const KINDAL_CREDIT_DESPAWN_MS = 5 * 1000;
/** Cite: feralas.cpp:460 m_checkCompletionTimer = 1 * IN_MILLISECONDS */
const KINDAL_CHECK_COMPLETION_MS = 1000;

// Cite: ScriptDevAIMgr.h:53 FACTION_ESCORT_N_FRIEND_ACTIVE = 495 OOX SetFactionTemporary; sprite darter
// SetFactionTemporary on cage open.
const FACTION_ESCORT_N_FRIEND_ACTIVE = 495;
/** Cite: ScriptDevAIMgr.h:48 FACTION_ESCORT_A_NEUTRAL_ACTIVE = 231 Kindal StartFollow faction. */
const FACTION_ESCORT_A_NEUTRAL_ACTIVE = 231;
/** Cite: Creature.h:577 TEMPFACTION_RESTORE_RESPAWN = 0x01 */
const TEMPFACTION_RESTORE_RESPAWN = 0x01;
/** Cite: Creature.h:582 TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x20 */
const TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x20;
// Cite: feralas.cpp:150 TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x01 | 0x20 = 0x21
const OOX_TEMP_FACTION_FLAGS =
  TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC;
/** Cite: feralas.cpp:422 TEMPFACTION_RESTORE_RESPAWN only on sprite darter free. */
const SPRITE_TEMP_FACTION_FLAGS = TEMPFACTION_RESTORE_RESPAWN;
/** Cite: AIDefines.h:45 AI_EVENT_START_EVENT = 102 Shay accept SendAIEvent. */
const AI_EVENT_START_EVENT = 102;
/** Cite: AIDefines.h:50 AI_EVENT_CUSTOM_A = 1000 Shay's Bell OnEffectExecute → resume follow. */
const AI_EVENT_CUSTOM_A = 1000;
// Cite: Unit.h:477 UNIT_FLAG_IMMUNE_TO_NPC = 0x00000200 Shay ReceiveAIEvent RemoveFlag; Kindal
// SetImmuneToNPC(false).
const UNIT_FLAG_IMMUNE_TO_NPC = 0x00000200;
/** Cite: Unit.h:97 UNIT_STAND_STATE_STAND = 0 (opcodes.ts re-export) */
const UNIT_STAND_STATE_STAND_FERALAS = UNIT_STAND_STATE_STAND;
/** Cite: Unit.h:104 UNIT_STAND_STATE_DEAD = 7 OOX Reset() while not escorting. */
const UNIT_STAND_STATE_DEAD = 7;
/** Cite: ObjectDefines.h INTERACTION_DISTANCE = 5.0f Shay MoveInLineOfSight rockbiter / recall player. */
const INTERACTION_DISTANCE = 5;
/** Cite: feralas.cpp:203 Rockbiter LOS range 20.0f */
const ROCKBITER_CREDIT_RANGE = 20;
/** Cite: feralas.cpp:416–418 sprite search range 20.0f; Kindal closest 20.0f */
const CAGE_EVENT_RANGE = 20;

// ── accept handlers ──────────────────────────────────────────────────────────

// QuestAccept_npc_oox22fe — quest 2767 Rescue OOX-22/FE!: talk, stand, temporary friendly faction
// and escort; three ambushes then the WP38 credit. Cite: feralas.cpp:143–156, :69–101.
function runOox22feAccept(): DbScriptIntent[] {
  const citeTalk =
    `feralas.cpp:147 npc_oox22fe (${NPC_OOX22FE}) DoScriptText(SAY_OOX_START=${SAY_OOX_START})`;
  const citeActive = 'feralas.cpp:148 SetActiveObjectState(true)';
  const citeStand =
    `feralas.cpp:149 SetStandState(UNIT_STAND_STATE_STAND) from Reset DEAD=${UNIT_STAND_STATE_DEAD}`;
  const citeFaction =
    'feralas.cpp:150 SetFactionTemporary(FACTION_ESCORT_N_FRIEND_ACTIVE, ' +
    'TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC)';
  const citeEscort =
    `feralas.cpp:152–153 npc_oox22fe (${NPC_OOX22FE}) ` +
    'npc_escortAI::Start(false, player, quest) - FO6 degraded finishEscort';
  const citeAmbush =
    `feralas.cpp:74–94 WP12 3× NPC_YETI=${NPC_YETI}; WP22 3× NPC_GORILLA=${NPC_GORILLA}; ` +
    `WP31 Woodpaw ${NPC_WOODPAW_REAVER}/${NPC_WOODPAW_BRUTE}/${NPC_WOODPAW_MYSTIC}/` +
    `${NPC_WOODPAW_ALPHA}; SAY_OOX_AMBUSH=${SAY_OOX_AMBUSH} - FO6 combat`;
  const citeAggro =
    `feralas.cpp:110–118 Aggro urand SAY_OOX_AGGRO1/2=${SAY_OOX_AGGRO1}/${SAY_OOX_AGGRO2} - FO6 combat`;
  const citeCredit =
    `feralas.cpp:96–99 WP38 DoScriptText(SAY_OOX_END=${SAY_OOX_END}) + ` +
    'RewardPlayerAndGroupAtEventExplored(2767) - FO6 finishEscort';
  const citeEnder =
    `bake enderCreatureEntries NPC_OGLETHORPE=${NPC_OGLETHORPE} after WP38 explore credit`;
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
      standState: UNIT_STAND_STATE_STAND_FERALAS,
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
        `escort Start(false, player, quest) npc_oox22fe (${NPC_OOX22FE}) - FO6 degraded finishEscort`,
      cite: citeEscort,
    },
    {
      kind: 'skip',
      reason:
        `WP12/22/31 ambush summons Yeti/Gorilla/Woodpaw (${NPC_YETI}/${NPC_GORILLA}/` +
        `${NPC_WOODPAW_REAVER}) SAY_OOX_AMBUSH (${SAY_OOX_AMBUSH}) - FO6 combat`,
      cite: citeAmbush,
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
        `WP38 RewardPlayerAndGroupAtEventExplored(2767) + SAY_OOX_END (${SAY_OOX_END}) - FO6 finishEscort`,
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason: `turn-in NPC_OGLETHORPE (${NPC_OGLETHORPE}) after explore credit`,
      cite: citeEnder,
    },
  ];
}

// QuestAccept_npc_shay_leafrunner — quest 2845 Wandering Shay: clear IMMUNE_TO_NPC and follow, with
// a wander timer the bell recalls; sighting Rockbiter credits it. Cite: feralas.cpp:296–317.
function runShayAccept(questId: number): DbScriptIntent[] {
  const citeTalk =
    `feralas.cpp:300 npc_shay_leafrunner (${NPC_SHAY_LEAFRUNNER}) ` +
    `DoScriptText(SAY_ESCORT_START=${SAY_ESCORT_START})`;
  const citeEvent =
    `feralas.cpp:301 SendAIEvent(AI_EVENT_START_EVENT=${AI_EVENT_START_EVENT}, player, creature, questId)`;
  const citeFlags =
    'feralas.cpp:243 RemoveFlag(UNIT_FIELD_FLAGS, UNIT_FLAG_IMMUNE_TO_NPC) via ReceiveAIEvent';
  const citeFollow =
    `feralas.cpp:244 StartFollow(player, faction=0, quest) npc_shay_leafrunner ` +
    `(${NPC_SHAY_LEAFRUNNER}) m_uiWanderTimer=${SHAY_WANDER_TIMER_MS} - FO6 degraded FollowerAI finishEscort`;
  const citeWander =
    `feralas.cpp:259–278 wander pause EMOTE_WANDER=${EMOTE_WANDER} + SAY_WANDER_1..4=` +
    `${SAY_WANDER_1}–${SAY_WANDER_4}; frand 25–40yd MoveRandomAroundPoint - FO6`;
  const citeBell =
    `feralas.cpp:306–317 ShaysBell SPELL_SHAYS_BELL=${SPELL_SHAYS_BELL} → ` +
    `AI_EVENT_CUSTOM_A=${AI_EVENT_CUSTOM_A}; :247–251 SetFollowPaused(false) + ` +
    `m_uiWanderTimer=${SHAY_RECALL_WANDER_MS}; SAY_WANDER_DONE_1..3=${SAY_WANDER_DONE_1}–` +
    `${SAY_WANDER_DONE_3} - FO6 item residual`;
  const citeBellItem =
    `bake itemTargets ITEM_SHAYS_BELL=${ITEM_SHAYS_BELL} deliver objective (casts SPELL_SHAYS_BELL)`;
  const citeCredit =
    `feralas.cpp:203–216 LOS NPC_ROCKBITER=${NPC_ROCKBITER} range ${ROCKBITER_CREDIT_RANGE}: ` +
    `SAY_EVENT_COMPLETE_1/2=${SAY_EVENT_COMPLETE_1}/${SAY_EVENT_COMPLETE_2} + ` +
    `RewardPlayerAndGroupAtEventExplored(2845) + ForcedDespawn(${SHAY_CREDIT_DESPAWN_MS}) ` +
    `+ MovePoint INTERACTION_DISTANCE=${INTERACTION_DISTANCE} - FO6 finishEscort`;
  const citeEnder =
    `bake enderCreatureEntries NPC_ROCKBITER=${NPC_ROCKBITER} after LOS explore credit`;
  const priorFlags = UNIT_FLAG_IMMUNE_TO_NPC;
  const resultFlags = priorFlags & ~UNIT_FLAG_IMMUNE_TO_NPC;
  return [
    {
      kind: 'talk',
      textId: SAY_ESCORT_START,
      stringTemplateId: 0,
      cite: citeTalk,
    },
    {
      kind: 'send_ai_event',
      eventType: AI_EVENT_START_EVENT,
      radius: 0,
      value: questId,
      mode: 'receive_on_source',
      cite: citeEvent,
    },
    {
      kind: 'modify_unit_flags',
      flag: UNIT_FLAG_IMMUNE_TO_NPC,
      changeFlag: UNIT_FLAG_CHANGE_REMOVE,
      mode: 'remove',
      resultFlags,
      cite: citeFlags,
    },
    {
      kind: 'skip',
      reason:
        `StartFollow(player, faction=0, quest) npc_shay_leafrunner (${NPC_SHAY_LEAFRUNNER}) ` +
        `wanderTimer=${SHAY_WANDER_TIMER_MS} - FO6 degraded FollowerAI finishEscort`,
      cite: citeFollow,
    },
    {
      kind: 'skip',
      reason:
        `wander pause EMOTE_WANDER (${EMOTE_WANDER}) + SAY_WANDER (${SAY_WANDER_1}–${SAY_WANDER_4}) - FO6`,
      cite: citeWander,
    },
    {
      kind: 'skip',
      reason:
        `SPELL_SHAYS_BELL (${SPELL_SHAYS_BELL}) AI_EVENT_CUSTOM_A (${AI_EVENT_CUSTOM_A}) ` +
        `recall wander ${SHAY_RECALL_WANDER_MS}ms ITEM_SHAYS_BELL=${ITEM_SHAYS_BELL} - FO6 item residual`,
      cite: citeBell,
    },
    {
      kind: 'skip',
      reason: `itemTarget Shay's Bell (${ITEM_SHAYS_BELL}) deliver objective`,
      cite: citeBellItem,
    },
    {
      kind: 'skip',
      reason:
        `LOS Rockbiter (${NPC_ROCKBITER}) RewardPlayerAndGroupAtEventExplored(2845) + ` +
        `SAY_EVENT_COMPLETE (${SAY_EVENT_COMPLETE_1}/${SAY_EVENT_COMPLETE_2}) + ` +
        `ForcedDespawn(${SHAY_CREDIT_DESPAWN_MS}) - FO6 finishEscort`,
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason: `turn-in NPC_ROCKBITER (${NPC_ROCKBITER}) after explore credit`,
      cite: citeEnder,
    },
  ];
}

// QuestAccept_npc_kindal_moonweaver — quest 2969 Freedom for All Creatures: stand, clear immune and
// follow; opening the cages frees the darters and summons a raider. Cite: feralas.cpp:561–573.
function runKindalAccept(): DbScriptIntent[] {
  const citeFollow =
    `feralas.cpp:565–566 npc_kindal_moonweaver (${NPC_KINDAL_MOONWEAVER}) ` +
    `StartFollow(player, FACTION_ESCORT_A_NEUTRAL_ACTIVE=${FACTION_ESCORT_A_NEUTRAL_ACTIVE}, quest) ` +
    '- FO6 degraded FollowerAI finishEscort';
  const citeTalk =
    `feralas.cpp:567 DoScriptText(SAY_KINDAL_QUEST_START=${SAY_KINDAL_QUEST_START})`;
  const citeStand = 'feralas.cpp:568 SetStandState(UNIT_STAND_STATE_STAND)';
  const citeImmune =
    'feralas.cpp:569 SetImmuneToNPC(false) → RemoveFlag UNIT_FLAG_IMMUNE_TO_NPC';
  const citeKey =
    `bake srcItem ITEM_BAMBOO_CAGE_KEY=${ITEM_BAMBOO_CAGE_KEY} for cage GO use`;
  const citeCage =
    `feralas.cpp:403–437 GOUse_go_cage_door: free NPC_CAPTURED_SPRITE_DARTER=${NPC_CAPTURED_SPRITE_DARTER} ` +
    `range ${CAGE_EVENT_RANGE}; SetFactionTemporary(FACTION_ESCORT_N_FRIEND_ACTIVE, ` +
    `TEMPFACTION_RESTORE_RESPAWN=${SPRITE_TEMP_FACTION_FLAGS}); escort Start(true); ` +
    `SummonCreature NPC_GRIMTOTEM_RAIDER=${NPC_GRIMTOTEM_RAIDER} at ${RAIDER_SPAWN.x},${RAIDER_SPAWN.y},` +
    `${RAIDER_SPAWN.z},${RAIDER_SPAWN.o} TEMPSPAWN_DEAD_DESPAWN ${RAIDER_DESPAWN_MS}ms; ` +
    `SAY_KINDAL_INITIAL_AGGRO=${SAY_KINDAL_INITIAL_AGGRO} AttackStart - FO6 cage event`;
  const citeSprite =
    `feralas.cpp:364–371 sprite WP8 SetData(TYPE_FREEDOM_CREATURES, SPECIAL) + ForcedDespawn; ` +
    `SPELL_MANA_BURN=${SPELL_MANA_BURN} - FO6`;
  const citeCombat =
    `feralas.cpp:467–471,513–552 Kindal Aggro SAY_KINDAL_AGGRO=${SAY_KINDAL_AGGRO}; ` +
    `SPELL_SHOOT=${SPELL_SHOOT}/SPELL_MULTI_SHOT=${SPELL_MULTI_SHOT}; flee ≤15% HP - FO6 combat`;
  const citeCredit =
    `feralas.cpp:478–490 map TYPE_FREEDOM_CREATURES DONE: ` +
    `RewardPlayerAndGroupAtEventExplored(2969) + SAY_KINDAL_QUEST_COMPLETE=` +
    `${SAY_KINDAL_QUEST_COMPLETE}; checkTimer=${KINDAL_CHECK_COMPLETION_MS}; ` +
    `ForcedDespawn/Respawn after ${KINDAL_CREDIT_DESPAWN_MS}ms - FO6 finishEscort`;
  const citeEnder =
    `bake enderCreatureEntries NPC_KINDAL_MOONWEAVER=${NPC_KINDAL_MOONWEAVER} after explore credit`;
  const priorFlags = UNIT_FLAG_IMMUNE_TO_NPC;
  const resultFlags = priorFlags & ~UNIT_FLAG_IMMUNE_TO_NPC;
  return [
    {
      kind: 'talk',
      textId: SAY_KINDAL_QUEST_START,
      stringTemplateId: 0,
      cite: citeTalk,
    },
    {
      kind: 'stand_state',
      standState: UNIT_STAND_STATE_STAND_FERALAS,
      cite: citeStand,
    },
    {
      kind: 'modify_unit_flags',
      flag: UNIT_FLAG_IMMUNE_TO_NPC,
      changeFlag: UNIT_FLAG_CHANGE_REMOVE,
      mode: 'remove',
      resultFlags,
      cite: citeImmune,
    },
    {
      kind: 'skip',
      reason:
        `StartFollow(player, FACTION_ESCORT_A_NEUTRAL_ACTIVE=${FACTION_ESCORT_A_NEUTRAL_ACTIVE}, quest) ` +
        `npc_kindal_moonweaver (${NPC_KINDAL_MOONWEAVER}) - FO6 degraded FollowerAI finishEscort`,
      cite: citeFollow,
    },
    {
      kind: 'skip',
      reason: `srcItem Bamboo Cage Key (${ITEM_BAMBOO_CAGE_KEY}) for cage GO use`,
      cite: citeKey,
    },
    {
      kind: 'skip',
      reason:
        `GOUse_go_cage_door free sprite darters (${NPC_CAPTURED_SPRITE_DARTER}) + ` +
        `Grimtotem raider (${NPC_GRIMTOTEM_RAIDER}) at ${RAIDER_SPAWN.x}/${RAIDER_SPAWN.y} ` +
        `despawn ${RAIDER_DESPAWN_MS}ms faction ${FACTION_ESCORT_N_FRIEND_ACTIVE} - FO6 cage event`,
      cite: citeCage,
    },
    {
      kind: 'skip',
      reason:
        `sprite WP8 SetData SPECIAL + SPELL_MANA_BURN (${SPELL_MANA_BURN}) - FO6`,
      cite: citeSprite,
    },
    {
      kind: 'skip',
      reason:
        `Kindal combat SPELL_SHOOT/MULTI_SHOT (${SPELL_SHOOT}/${SPELL_MULTI_SHOT}) + flee - FO6`,
      cite: citeCombat,
    },
    {
      kind: 'skip',
      reason:
        `map DONE RewardPlayerAndGroupAtEventExplored(2969) + SAY_KINDAL_QUEST_COMPLETE ` +
        `(${SAY_KINDAL_QUEST_COMPLETE}) despawn ${KINDAL_CREDIT_DESPAWN_MS}ms - FO6 finishEscort`,
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason: `turn-in NPC_KINDAL_MOONWEAVER (${NPC_KINDAL_MOONWEAVER}) after explore credit`,
      cite: citeEnder,
    },
  ];
}

// Family pack: kalimdor/feralas.cpp. Accept hooks for 2767, 2845 and 2969; the Shay's Bell and
// cage-door residuals are documented on those accept chains.
export function runFeralas(
  phase: QuestScriptHook,
  questId: number,
): DbScriptIntent[] {
  if (phase === 'accept') {
    if (questId === QUEST_RESCUE_OOX22FE) return runOox22feAccept();
    if (questId === QUEST_ID_WANDERING_SHAY) return runShayAccept(questId);
    if (questId === QUEST_FREEDOM_ALL_CREATURES) return runKindalAccept();
    return [];
  }
  return [];
}

// Map entries spread into QUEST_SCRIPT_REGISTRY (keeps registry.ts under 1500). next-batch.mjs also matches
// `family: 'kalimdor/feralas'` in registry.ts.
export const FERALAS_REGISTRY: Record<string | number, FeralasQuestScriptEntry> = {
  'kalimdor/feralas': {
    family: 'kalimdor/feralas',
    questIds: [
      QUEST_RESCUE_OOX22FE,
      QUEST_ID_WANDERING_SHAY,
      QUEST_FREEDOM_ALL_CREATURES,
    ],
    hooks: ['accept'],
    cite: 'kalimdor/feralas.cpp:143–156,296–317,403–437,561–573',
    run: runFeralas,
  },
  [QUEST_RESCUE_OOX22FE]: {
    family: 'kalimdor/feralas',
    questId: QUEST_RESCUE_OOX22FE,
    questIds: [QUEST_RESCUE_OOX22FE],
    hooks: ['accept'],
    cite: 'feralas.cpp:143–156 QuestAccept_npc_oox22fe',
    run: runFeralas,
  },
  [QUEST_ID_WANDERING_SHAY]: {
    family: 'kalimdor/feralas',
    questId: QUEST_ID_WANDERING_SHAY,
    questIds: [QUEST_ID_WANDERING_SHAY],
    hooks: ['accept'],
    cite: 'feralas.cpp:296–304 QuestAccept_npc_shay_leafrunner',
    run: runFeralas,
  },
  [QUEST_FREEDOM_ALL_CREATURES]: {
    family: 'kalimdor/feralas',
    questId: QUEST_FREEDOM_ALL_CREATURES,
    questIds: [QUEST_FREEDOM_ALL_CREATURES],
    hooks: ['accept'],
    cite: 'feralas.cpp:561–573 QuestAccept_npc_kindal_moonweaver',
    run: runFeralas,
  },
};
