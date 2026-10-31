// QI4 — eastern_kingdoms/western_plaguelands residual, extracted for the 1500-line ratchet: the
// Taelan reward hook for 5862 and accept hook for 5944. Cite: western_plaguelands.cpp.

import type { DbScriptIntent } from './types.ts';
import { NPC_FLAG_CHANGE_REMOVE, UNIT_STAND_STATE_KNEEL } from './opcodes.ts';

/** Matches registry.ts QuestScriptHook — local to avoid circular import. */
type QuestScriptHook = 'accept' | 'reward' | 'complete' | 'frame';

// ── sourced constants ────────────────────────────────────────────────────────

// Cite: western_plaguelands.cpp:176 QUEST_ID_SCARLET_SUBTERFUGE = 5862 Deliver Tirion's Gift to Taelan —
// reward starts scarlet complete dialogue.
export const QUEST_SCARLET_SUBTERFUGE = 5862;
// Cite: western_plaguelands.cpp:177 QUEST_ID_IN_DREAMS = 5944 Escort Taelan from Hearthglen — accept starts
// npc_escortAI + explore credit at epilogue.
export const QUEST_IN_DREAMS = 5944;
// Cite: western_plaguelands.cpp:167 NPC_TAELAN_FORDRING = 1842 Script host for both hooks (bake ender 5862
// / starter 5944).
const NPC_TAELAN_FORDRING = 1842;
// Cite: western_plaguelands.cpp:168 NPC_SCARLET_CAVALIER = 1836 Dialogue step that starts the 5862 reward
// RP (kneel + strip questgiver).
const NPC_SCARLET_CAVALIER = 1836;
// Cite: western_plaguelands.cpp:119 SAY_ESCORT_START = -1001078 DoScriptText on 5944 ReceiveAIEvent
// AI_EVENT_START_ESCORT.
const SAY_ESCORT_START = -1001078;
// Cite: western_plaguelands.cpp:115 SAY_SCARLET_COMPLETE_1 = -1001076 Scarlet Subterfuge dialogue (timed
// FO6 after reward kneel).
const SAY_SCARLET_COMPLETE_1 = -1001076;
// Cite: western_plaguelands.cpp:116 SAY_SCARLET_COMPLETE_2 = -1001077 Restores QUESTGIVER after scarlet
// complete combat (FO6).
const SAY_SCARLET_COMPLETE_2 = -1001077;
// Cite: western_plaguelands.cpp:155 SPELL_TAELAN_SUFFERING = 18810 Cast at SAY_SCARLET_COMPLETE_1 dialogue
// step (FO6 timed).
const SPELL_TAELAN_SUFFERING = 18810;
// Cite: western_plaguelands.cpp:149 SPELL_DEVOTION_AURA = 17232 JustReachedHome resumes dialogue after
// cavalier fight (FO6).
const SPELL_DEVOTION_AURA = 17232;
// Cite: ScriptDevAIMgr.h:52 FACTION_ESCORT_N_FRIEND_PASSIVE = 290 ReceiveAIEvent SetFactionTemporary on
// 5944 escort start; also 5862 attack step.
const FACTION_ESCORT_N_FRIEND_PASSIVE = 290;
// Cite: Creature.h:577 TEMPFACTION_RESTORE_RESPAWN = 0x01 SetFactionTemporary flags on 5944 accept path.
const TEMPFACTION_RESTORE_RESPAWN = 0x01;
// Cite: AIDefines.h:43 AI_EVENT_START_ESCORT = 100 QuestAccept_npc_taelan_fordring SendAIEvent event type.
const AI_EVENT_START_ESCORT = 100;
// Cite: AIDefines.h:50 AI_EVENT_CUSTOM_A = 1000 QuestRewarded_npc_taelan_fordring SendAIEvent event type.
const AI_EVENT_CUSTOM_A = 1000;
// Cite: Unit.h:511 UNIT_NPC_FLAG_QUESTGIVER = 0x00000002 JustDidDialogueStep NPC_SCARLET_CAVALIER removes
// this on Taelan.
const UNIT_NPC_FLAG_QUESTGIVER = 0x00000002;
/** Cite: Unit.h:105 UNIT_STAND_STATE_KNEEL = 8 opcodes.ts re-export used by 5862 reward kneel. */
const UNIT_STAND_STATE_KNEEL_TAELAN = UNIT_STAND_STATE_KNEEL;
// Cite: western_plaguelands.cpp:565 ForcedDespawn(3 * MINUTE * IN_MILLISECONDS) Epilogue despawn after 5944
// explore credit (FO6).
const TIRION_DESPAWN_MS = 3 * 60 * 1000;
// Cite: bake enderCreatureEntries / western_plaguelands.cpp:170 NPC_TIRION_FORDRING=12126 Turn-in after
// 5944 explore credit (also classic-db ender 1855).
const NPC_TIRION_FORDRING = 12126;

// QuestRewarded_npc_taelan_fordring — quest 5862 Scarlet Subterfuge: the reward kneels Taelan and
// strips QUESTGIVER, which the scarlet RP later restores so 5944 can be taken. Cite: :661–667.
function runTaelanFordringReward(questId: number): DbScriptIntent[] {
  const citeEvent =
    `western_plaguelands.cpp:664 npc_taelan_fordring (${NPC_TAELAN_FORDRING}) ` +
    'SendAIEvent(AI_EVENT_CUSTOM_A, player, creature, questId)';
  const citeDialogue =
    `western_plaguelands.cpp:327–328 ReceiveAIEvent StartNextDialogueText(NPC_SCARLET_CAVALIER=${NPC_SCARLET_CAVALIER})`;
  const citeKneel =
    'western_plaguelands.cpp:401 SetStandState(UNIT_STAND_STATE_KNEEL)';
  const citeQg =
    'western_plaguelands.cpp:402 RemoveFlag(UNIT_NPC_FLAGS, UNIT_NPC_FLAG_QUESTGIVER)';
  const citeCavaliers =
    `western_plaguelands.cpp:404–417 GetCreatureListWithEntryInGrid(NPC_SCARLET_CAVALIER=${NPC_SCARLET_CAVALIER}) ` +
    'face + aCavalierYells - FO6 nearby NPCs';
  const citeTimed =
    `western_plaguelands.cpp:420–450 timed dialogue: MovePoint cavaliers; ` +
    `SAY_SCARLET_COMPLETE_1=${SAY_SCARLET_COMPLETE_1} + SPELL_TAELAN_SUFFERING=${SPELL_TAELAN_SUFFERING}; ` +
    `SetFactionTemporary + AttackStart; JustReachedHome SPELL_DEVOTION_AURA=${SPELL_DEVOTION_AURA}; ` +
    `SAY_SCARLET_COMPLETE_2=${SAY_SCARLET_COMPLETE_2} SetFlag(QUESTGIVER) - FO6 RP/combat`;
  // Reset ships QUESTGIVER; dialogue removes that bit → 0 when only that flag is set.
  const prior = UNIT_NPC_FLAG_QUESTGIVER;
  const resultFlags = prior & ~UNIT_NPC_FLAG_QUESTGIVER;
  return [
    {
      kind: 'send_ai_event',
      eventType: AI_EVENT_CUSTOM_A,
      radius: 0,
      value: questId,
      mode: 'receive_on_source',
      cite: citeEvent,
    },
    {
      kind: 'skip',
      reason:
        `StartNextDialogueText(NPC_SCARLET_CAVALIER=${NPC_SCARLET_CAVALIER}) via ReceiveAIEvent - FO6 dialogue machine`,
      cite: citeDialogue,
    },
    {
      kind: 'stand_state',
      standState: UNIT_STAND_STATE_KNEEL_TAELAN,
      cite: citeKneel,
    },
    {
      kind: 'modify_npc_flags',
      flag: UNIT_NPC_FLAG_QUESTGIVER,
      changeFlag: NPC_FLAG_CHANGE_REMOVE,
      mode: 'remove',
      resultFlags,
      cite: citeQg,
    },
    {
      kind: 'skip',
      reason:
        `cavalier face + aCavalierYells NPC_SCARLET_CAVALIER (${NPC_SCARLET_CAVALIER}) - FO6 nearby NPCs`,
      cite: citeCavaliers,
    },
    {
      kind: 'skip',
      reason:
        `scarlet complete timed RP/combat (SPELL ${SPELL_TAELAN_SUFFERING}, restore QUESTGIVER) - FO6`,
      cite: citeTimed,
    },
  ];
}

// QuestAccept_npc_taelan_fordring — quest 5944 In Dreams: the AI event starts the escort out of
// Hearthglen, and the Tirion epilogue carries the credit. Cite: western_plaguelands.cpp:653–659.
function runTaelanFordringAccept(questId: number): DbScriptIntent[] {
  const citeEvent =
    `western_plaguelands.cpp:656 npc_taelan_fordring (${NPC_TAELAN_FORDRING}) ` +
    'SendAIEvent(AI_EVENT_START_ESCORT, player, creature, questId)';
  const citeTalk =
    `western_plaguelands.cpp:324 DoScriptText(SAY_ESCORT_START=${SAY_ESCORT_START}) via ReceiveAIEvent`;
  const citeFaction =
    'western_plaguelands.cpp:325 SetFactionTemporary(FACTION_ESCORT_N_FRIEND_PASSIVE, ' +
    'TEMPFACTION_RESTORE_RESPAWN)';
  const citeEscort =
    'western_plaguelands.cpp:323 npc_escortAI::Start(false, player, quest) - FO6 degraded finishEscort';
  const citeWp =
    'western_plaguelands.cpp:340–355 WP26 SAY_EXIT_KEEP + WP56 SAY_REACH_TOWER dialogue pauses - FO6 WP';
  const citeFight =
    'western_plaguelands.cpp:457–515 Isillien summon/fight + Tirion spawn AI_EVENT_CUSTOM_B - FO6 combat';
  const citeCredit =
    `western_plaguelands.cpp:559–564 SAY_EPILOG_5 RewardPlayerAndGroupAtEventExplored(5944) + ` +
    `ForcedDespawn(${TIRION_DESPAWN_MS}) Tirion ${NPC_TIRION_FORDRING} - FO6 finishEscort`;
  return [
    {
      kind: 'send_ai_event',
      eventType: AI_EVENT_START_ESCORT,
      radius: 0,
      value: questId,
      mode: 'receive_on_source',
      cite: citeEvent,
    },
    {
      kind: 'talk',
      textId: SAY_ESCORT_START,
      stringTemplateId: 0,
      cite: citeTalk,
    },
    {
      kind: 'set_faction',
      factionId: FACTION_ESCORT_N_FRIEND_PASSIVE,
      flags: TEMPFACTION_RESTORE_RESPAWN,
      cleared: false,
      cite: citeFaction,
    },
    {
      kind: 'skip',
      reason:
        `escort Start(false, player, quest) npc_taelan_fordring (${NPC_TAELAN_FORDRING}) - FO6 degraded finishEscort`,
      cite: citeEscort,
    },
    {
      kind: 'skip',
      reason: 'WP26/56 escort dialogue pauses (exit keep / reach tower) - FO6 waypoint',
      cite: citeWp,
    },
    {
      kind: 'skip',
      reason: 'Isillien + Tirion fight dialogue chain - FO6 combat/RP',
      cite: citeFight,
    },
    {
      kind: 'skip',
      reason:
        `SAY_EPILOG_5 RewardPlayerAndGroupAtEventExplored(5944) + ForcedDespawn(${TIRION_DESPAWN_MS}) - FO6 finishEscort`,
      cite: citeCredit,
    },
  ];
}

// Family pack: eastern_kingdoms/western_plaguelands.cpp. The Taelan reward hook for 5862 and the
// Taelan accept hook for 5944.
export function runWesternPlaguelands(
  phase: QuestScriptHook,
  questId: number,
): DbScriptIntent[] {
  if (phase === 'reward' && questId === QUEST_SCARLET_SUBTERFUGE) {
    return runTaelanFordringReward(questId);
  }
  if (phase === 'accept' && questId === QUEST_IN_DREAMS) {
    return runTaelanFordringAccept(questId);
  }
  return [];
}
