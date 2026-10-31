// QI4 — eastern_kingdoms/searing_gorge residual, extracted for the 1500-line ratchet. It claims
// the accept hook for quest 3367 only. Cite: eastern_kingdoms/searing_gorge.cpp.

import type { DbScriptIntent } from './types.ts';
import { UNIT_STAND_STATE_STAND } from './opcodes.ts';

/** Matches registry.ts QuestScriptHook — local to avoid circular import. */
type QuestScriptHook = 'accept' | 'reward' | 'complete' | 'frame';

// ── sourced constants ────────────────────────────────────────────────────────

// Cite: searing_gorge.cpp:53 QUEST_ID_SUNTARA_STONES = 3367 Escort Dorius Stonetender toward Ironforge
// ("Suntara Stones").
export const QUEST_SUNTARA_STONES = 3367;
// Cite: bake starterCreatureEntries / searing_gorge.cpp PATH_ID + classic-db Dorius Stonetender
// (npc_dorius_stonetender script name); PATH_ID also 8284.
const NPC_DORIUS_STONETENDER = 8284;
// Cite: searing_gorge.cpp:52 PATH_ID = 8284 Path id passed to npc_escortAI::Start on accept ReceiveAIEvent.
const DORIUS_PATH_ID = 8284;
// Cite: searing_gorge.cpp:48 SPELL_MARKSMAN_HIT = 12198 Escort ends when Dorius is hit by this spell (Dark
// Iron marksman shot); SpellHit awards explore credit (not a waypoint).
const SPELL_MARKSMAN_HIT = 12198;
// Cite: searing_gorge.cpp:50 RELAY_SCRIPT_FINISHED = 8284 ScriptsStart(SCRIPT_TYPE_RELAY, …) after explore
// credit — RP FO6.
const RELAY_SCRIPT_FINISHED = 8284;
// Cite: searing_gorge.cpp:46 NPC_DARK_IRON_STEELSHIFTER = 8337 Ambush summons attack Dorius at movement
// point 2 (not accept-hook — FO6).
const NPC_DARK_IRON_STEELSHIFTER = 8337;
// Cite: ScriptDevAIMgr.h:48 FACTION_ESCORT_A_NEUTRAL_ACTIVE = 231 ReceiveAIEvent SetFactionTemporary on
// Dorius escort start.
const FACTION_ESCORT_A_NEUTRAL_ACTIVE = 231;
/** Cite: Creature.h:577 TEMPFACTION_RESTORE_RESPAWN = 0x01 */
const TEMPFACTION_RESTORE_RESPAWN = 0x01;
/** Cite: Creature.h:582 TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x20 */
const TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x20;
// Cite: searing_gorge.cpp:84 TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x01 | 0x20 =
// 0x21
const DORIUS_TEMP_FACTION_FLAGS =
  TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC;
// Cite: AIDefines.h:43 AI_EVENT_START_ESCORT = 100 QuestAccept_npc_dorius_stonetender SendAIEvent event
// type.
const AI_EVENT_START_ESCORT = 100;
// Cite: Unit.h:97 UNIT_STAND_STATE_STAND = 0 Reset() ships Dorius DEAD; accept stands him. opcodes.ts
// re-export.
const UNIT_STAND_STATE_STAND_DORIUS = UNIT_STAND_STATE_STAND;
// Cite: searing_gorge.cpp:43 SAY_DORIUS_TO_PLAYER = 4354 WP37 DoBroadcastText (not accept-hook — FO6
// waypoint). Aggro SAY 4351–4353 and finish SAY 4359 are escort-combat FO6 only.
const SAY_DORIUS_TO_PLAYER = 4354;

// QuestAccept_npc_dorius_stonetender — quest 3367 Suntara Stones: stand, temporary faction and
// escort path 8284; the Marksman Hit at the end credits it. Cite: searing_gorge.cpp:140–149.
function runDoriusStonetenderAccept(questId: number): DbScriptIntent[] {
  const citeEvent =
    `searing_gorge.cpp:144 npc_dorius_stonetender (${NPC_DORIUS_STONETENDER}) ` +
    'SendAIEvent(AI_EVENT_START_ESCORT, player, creature, questId)';
  const citeStand =
    'searing_gorge.cpp:83 SetStandState(UNIT_STAND_STATE_STAND) via ReceiveAIEvent';
  const citeFaction =
    'searing_gorge.cpp:84 SetFactionTemporary(FACTION_ESCORT_A_NEUTRAL_ACTIVE, ' +
    'TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC)';
  const citeEscort =
    `searing_gorge.cpp:85 npc_escortAI::Start(false, player, quest, true, false, PATH_ID=${DORIUS_PATH_ID}) - FO6 degraded finishEscort`;
  const citeWp =
    `searing_gorge.cpp:111–117 WP37 DoBroadcastText(SAY_DORIUS_TO_PLAYER=${SAY_DORIUS_TO_PLAYER}) + point emote; ` +
    `WP53 face player - FO6 WP`;
  const citeCredit =
    `searing_gorge.cpp:91–98 SpellHit(SPELL_MARKSMAN_HIT=${SPELL_MARKSMAN_HIT}) ` +
    `RewardPlayerAndGroupAtEventExplored(3367) + ScriptsStart(RELAY ${RELAY_SCRIPT_FINISHED}) + End() - FO6 finishEscort`;
  const citeAmbush =
    `searing_gorge.cpp:101–105 SummonedMovementInform NPC_DARK_IRON_STEELSHIFTER=${NPC_DARK_IRON_STEELSHIFTER} AttackStart - FO6 zone ambush`;
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
      kind: 'stand_state',
      standState: UNIT_STAND_STATE_STAND_DORIUS,
      cite: citeStand,
    },
    {
      kind: 'set_faction',
      factionId: FACTION_ESCORT_A_NEUTRAL_ACTIVE,
      flags: DORIUS_TEMP_FACTION_FLAGS,
      cleared: false,
      cite: citeFaction,
    },
    {
      kind: 'skip',
      reason:
        `escort Start(false, player, quest, true, false, path=${DORIUS_PATH_ID}) - FO6 degraded finishEscort`,
      cite: citeEscort,
    },
    {
      kind: 'skip',
      reason:
        `WP37 SAY_DORIUS_TO_PLAYER (${SAY_DORIUS_TO_PLAYER}) + WP53 face - FO6 waypoint`,
      cite: citeWp,
    },
    {
      kind: 'skip',
      reason:
        `SpellHit SPELL_MARKSMAN_HIT (${SPELL_MARKSMAN_HIT}) RewardPlayerAndGroupAtEventExplored(3367) + RELAY ${RELAY_SCRIPT_FINISHED} - FO6 finishEscort`,
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason:
        `ambush NPC_DARK_IRON_STEELSHIFTER (${NPC_DARK_IRON_STEELSHIFTER}) AttackStart - FO6 zone ambush`,
      cite: citeAmbush,
    },
  ];
}

// Family pack: eastern_kingdoms/searing_gorge.cpp Hooks: pQuestAcceptNPC QuestAccept_npc_dorius_stonetender
// (3367).
export function runSearingGorge(phase: QuestScriptHook, questId: number): DbScriptIntent[] {
  if (phase !== 'accept') return [];
  if (questId === QUEST_SUNTARA_STONES) return runDoriusStonetenderAccept(questId);
  return [];
}
