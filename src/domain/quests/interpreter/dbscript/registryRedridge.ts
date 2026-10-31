// QI4 — eastern_kingdoms/redridge_mountains residual, extracted for the 1500-line ratchet. It
// claims the accept hook for quest 219 only. Cite: eastern_kingdoms/redridge_mountains.cpp.

import type { DbScriptIntent } from './types.ts';

/** Matches registry.ts QuestScriptHook — local to avoid circular import. */
type QuestScriptHook = 'accept' | 'reward' | 'complete' | 'frame';

// ── sourced constants ────────────────────────────────────────────────────────

// Cite: redridge_mountains.cpp:38 QUEST_MISSING_IN_ACTION = 219 Escort Corporal Keeshan from Stonewatch
// Keep cave back to Lakeshire.
export const QUEST_MISSING_IN_ACTION = 219;
// Cite: bake starterCreatureEntries / classic-db creature_questrelation Corporal Keeshan
// (npc_corporal_keeshan script name); also KEESHAN_PATH_ID.
const NPC_CORPORAL_KEESHAN = 349;
// Cite: redridge_mountains.cpp:40 KEESHAN_PATH_ID = 349 Path id passed to npc_escortAI::Start on accept
// ReceiveAIEvent.
const KEESHAN_PATH_ID = 349;
// Cite: redridge_mountains.cpp:41 SAY_CORPORAL_KEESHAN_1 = 25 DoBroadcastText on accept via ReceiveAIEvent.
const SAY_CORPORAL_KEESHAN_1 = 25;
// Cite: redridge_mountains.cpp:42–44 SAY_CORPORAL_KEESHAN_2/3/4 — waypoint talk (WP25/26/69), not
// accept-hook. Documented for whole-chain mapping.
const SAY_CORPORAL_KEESHAN_2 = 26;
const SAY_CORPORAL_KEESHAN_3 = 27;
const SAY_CORPORAL_KEESHAN_4 = 30;
// Cite: ScriptDevAIMgr.h:48 FACTION_ESCORT_A_NEUTRAL_ACTIVE = 231 ReceiveAIEvent SetFactionTemporary on
// Keeshan escort start.
const FACTION_ESCORT_A_NEUTRAL_ACTIVE = 231;
/** Cite: Creature.h:577 TEMPFACTION_RESTORE_RESPAWN = 0x01 */
const TEMPFACTION_RESTORE_RESPAWN = 0x01;
// Cite: AIDefines.h:43 AI_EVENT_START_ESCORT = 100 QuestAccept_npc_corporal_keeshan SendAIEvent event type.
const AI_EVENT_START_ESCORT = 100;

// QuestAccept_npc_corporal_keeshan — quest 219 Missing In Action: the AI event talks, sets a
// neutral faction and escorts path 349; WP69 credits it. Cite: redridge_mountains.cpp:92–98.
function runCorporalKeeshanAccept(questId: number): DbScriptIntent[] {
  const citeEvent =
    `redridge_mountains.cpp:95 npc_corporal_keeshan (${NPC_CORPORAL_KEESHAN}) ` +
    'SendAIEvent(AI_EVENT_START_ESCORT, player, creature, questId)';
  const citeTalk =
    `redridge_mountains.cpp:56 DoBroadcastText(SAY_CORPORAL_KEESHAN_1=${SAY_CORPORAL_KEESHAN_1}) via ReceiveAIEvent`;
  const citeFaction =
    'redridge_mountains.cpp:57 SetFactionTemporary(FACTION_ESCORT_A_NEUTRAL_ACTIVE, TEMPFACTION_RESTORE_RESPAWN)';
  const citeEscort =
    `redridge_mountains.cpp:58 npc_escortAI::Start(false, player, quest, true, false, KEESHAN_PATH_ID=${KEESHAN_PATH_ID}) - FO6 degraded finishEscort`;
  const citeWpSit =
    `redridge_mountains.cpp:66–69 WP25 SetStandState(SIT) + DoBroadcastText(SAY_CORPORAL_KEESHAN_2=${SAY_CORPORAL_KEESHAN_2}) - FO6 WP`;
  const citeWpStand =
    `redridge_mountains.cpp:71–74 WP26 SetStandState(STAND) + DoBroadcastText(SAY_CORPORAL_KEESHAN_3=${SAY_CORPORAL_KEESHAN_3}) - FO6 WP`;
  const citeCredit =
    `redridge_mountains.cpp:76–81 WP69 RewardPlayerAndGroupAtEventExplored(219) + ` +
    `DoBroadcastText(SAY_CORPORAL_KEESHAN_4=${SAY_CORPORAL_KEESHAN_4}) - FO6 finishEscort`;
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
      textId: SAY_CORPORAL_KEESHAN_1,
      stringTemplateId: 0,
      cite: citeTalk,
    },
    {
      kind: 'set_faction',
      factionId: FACTION_ESCORT_A_NEUTRAL_ACTIVE,
      flags: TEMPFACTION_RESTORE_RESPAWN,
      cleared: false,
      cite: citeFaction,
    },
    {
      kind: 'skip',
      reason:
        `escort Start(false, player, quest, true, false, path=${KEESHAN_PATH_ID}) - FO6 degraded finishEscort`,
      cite: citeEscort,
    },
    {
      kind: 'skip',
      reason:
        `WP25 sit + SAY_CORPORAL_KEESHAN_2 (${SAY_CORPORAL_KEESHAN_2}) - FO6 waypoint`,
      cite: citeWpSit,
    },
    {
      kind: 'skip',
      reason:
        `WP26 stand + SAY_CORPORAL_KEESHAN_3 (${SAY_CORPORAL_KEESHAN_3}) - FO6 waypoint`,
      cite: citeWpStand,
    },
    {
      kind: 'skip',
      reason:
        `WP69 RewardPlayerAndGroupAtEventExplored(219) + SAY_CORPORAL_KEESHAN_4 (${SAY_CORPORAL_KEESHAN_4}) - FO6 finishEscort`,
      cite: citeCredit,
    },
  ];
}

// Family pack: eastern_kingdoms/redridge_mountains.cpp Hooks: pQuestAcceptNPC
// QuestAccept_npc_corporal_keeshan (219).
export function runRedridgeMountains(
  phase: QuestScriptHook,
  questId: number,
): DbScriptIntent[] {
  if (phase !== 'accept') return [];
  if (questId === QUEST_MISSING_IN_ACTION) return runCorporalKeeshanAccept(questId);
  return [];
}
