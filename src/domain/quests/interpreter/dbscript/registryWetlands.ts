// QI4 — eastern_kingdoms/wetlands residual, extracted for the 1500-line ratchet: the accept hook
// for quest 1249 only. Cite: eastern_kingdoms/wetlands.cpp.

import type { DbScriptIntent } from './types.ts';

/** Matches registry.ts QuestScriptHook — local to avoid circular import. */
type QuestScriptHook = 'accept' | 'reward' | 'complete' | 'frame';

// ── sourced constants ────────────────────────────────────────────────────────

// Cite: wetlands.cpp:45 QUEST_MISSING_DIPLOMAT11 = 1249 The Missing Diplomat — subdue Tapoke "Slim" Jahn at
// Menethil Harbor inn.
export const QUEST_MISSING_DIPLOMAT11 = 1249;

// Cite: bake starterCreatureEntries / scriptdev2 ScriptName='npc_mikhail' Mikhail (quest giver, Menethil
// inn).
const NPC_MIKHAIL = 4963;
// Cite: wetlands.cpp:52 NPC_TAPOKE_SLIM_JAHN = 4962 Escort target found via GetClosestCreatureWithEntry on
// accept.
const NPC_TAPOKE_SLIM_JAHN = 4962;
// Cite: wetlands.cpp:51 NPC_SLIMS_FRIEND = 4971 Guardian summoned by SPELL_CALL_FRIENDS on Slim aggro (FO6
// combat).
const NPC_SLIMS_FRIEND = 4971;

// Cite: wetlands.cpp:48 SPELL_STEALTH = 1785 Cast on Slim at accept if not already stealthed (triggered).
const SPELL_STEALTH = 1785;
// Cite: wetlands.cpp:49 SPELL_CALL_FRIENDS = 16457 Slim casts on first aggro during escort — summons
// NPC_SLIMS_FRIEND (FO6).
const SPELL_CALL_FRIENDS = 16457;

// Cite: wetlands.cpp:46 FACTION_ENEMY = 168 WP3 SetFactionTemporary when Slim drops stealth and turns
// hostile.
const FACTION_ENEMY = 168;
/** Cite: Creature.h:577 TEMPFACTION_RESTORE_RESPAWN = 0x01 */
const TEMPFACTION_RESTORE_RESPAWN = 0x01;
/** Cite: Creature.h:578 TEMPFACTION_RESTORE_COMBAT_STOP = 0x02 */
const TEMPFACTION_RESTORE_COMBAT_STOP = 0x02;
// Cite: wetlands.cpp:105 TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_RESTORE_COMBAT_STOP = 0x01 | 0x02 = 0x03
const SLIM_TEMP_FACTION_FLAGS =
  TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_RESTORE_COMBAT_STOP;

// Cite: Unit.h:476 UNIT_FLAG_IMMUNE_TO_PLAYER = 0x00000100 Reset() sets immune; WP3 removes it when fight
// starts.
const UNIT_FLAG_IMMUNE_TO_PLAYER = 0x00000100;

// Cite: SpellDefines.h:432 TRIGGERED_OLD_TRIGGERED = 0x00000001 wetlands.cpp:216 CastSpell(pSlim,
// SPELL_STEALTH, TRIGGERED_OLD_TRIGGERED).
const TRIGGERED_OLD_TRIGGERED = 0x00000001;

// Cite: AIDefines.h:43 AI_EVENT_START_ESCORT = 100 QuestAccept_npc_mikhail SendAIEvent event type to Slim.
const AI_EVENT_START_ESCORT = 100;

// Cite: wetlands.cpp:211 GetClosestCreatureWithEntry(..., 25.0f) Search radius from Mikhail to Slim on
// accept.
const SLIM_SEARCH_RADIUS = 25.0;

// Cite: wetlands.cpp:40 SAY_SLIM_AGGRO = -1000977 DoScriptText on first aggro after CALL_FRIENDS (FO6
// combat).
const SAY_SLIM_AGGRO = -1000977;
/** Cite: wetlands.cpp:41 SAY_SLIM_DEFEAT = -1000978 Dialogue start after low-HP evade (JustReachedHome). */
const SAY_SLIM_DEFEAT = -1000978;
// Cite: wetlands.cpp:42 SAY_FRIEND_DEFEAT = -1000979 Slim's friend line before ForcedDespawn(1000) on event
// complete.
const SAY_FRIEND_DEFEAT = -1000979;
/** Cite: wetlands.cpp:43 SAY_SLIM_NOTES = -1000980 Second dialogue step before explore credit. */
const SAY_SLIM_NOTES = -1000980;

/** Cite: wetlands.cpp:141 GetHealthPercent() < 20.0f DamageTaken threshold that ends the fight (FO6). */
const SLIM_CREDIT_HP_PCT = 20;
// Cite: wetlands.cpp:146 ForcedDespawn(1000) on friend at event complete. Cite: wetlands.cpp:174
// ForcedDespawn(1000) on Slim after explore credit.
const SLIM_DESPAWN_MS = 1000;
/** Cite: wetlands.cpp:175 SetRespawnDelay(2) after ForcedDespawn. */
const SLIM_RESPAWN_DELAY_S = 2;

// QuestAccept_npc_mikhail — quest 1249 The Missing Diplomat pt11: stealth Slim and start his
// escort, which turns hostile at WP3 and credits from the defeat dialogue. Cite: wetlands.cpp:207.
function runMikhailAccept(questId: number): DbScriptIntent[] {
  const citeFind =
    `wetlands.cpp:211–213 npc_mikhail (${NPC_MIKHAIL}) ` +
    `GetClosestCreatureWithEntry(NPC_TAPOKE_SLIM_JAHN=${NPC_TAPOKE_SLIM_JAHN}, ${SLIM_SEARCH_RADIUS})`;
  const citeStealth =
    `wetlands.cpp:215–216 npc_tapoke_slim_jahn (${NPC_TAPOKE_SLIM_JAHN}) ` +
    `CastSpell(SPELL_STEALTH=${SPELL_STEALTH}, TRIGGERED_OLD_TRIGGERED) if no aura`;
  const citeEvent =
    `wetlands.cpp:218 npc_mikhail (${NPC_MIKHAIL})→npc_tapoke_slim_jahn (${NPC_TAPOKE_SLIM_JAHN}) ` +
    'SendAIEvent(AI_EVENT_START_ESCORT, player, pSlim, questId)';
  const citeEscort =
    `wetlands.cpp:162 npc_tapoke_slim_jahn (${NPC_TAPOKE_SLIM_JAHN}) ` +
    'npc_escortAI::Start(false, player, quest, true) - FO6 degraded finishEscort';
  const citeWp3 =
    `wetlands.cpp:102–108 WP3 SetRun; RemoveAuras(SPELL_STEALTH=${SPELL_STEALTH}); ` +
    `SetFactionTemporary(FACTION_ENEMY=${FACTION_ENEMY}, flags=${SLIM_TEMP_FACTION_FLAGS}); ` +
    `RemoveFlag(UNIT_FLAG_IMMUNE_TO_PLAYER=${UNIT_FLAG_IMMUNE_TO_PLAYER}); REACT_AGGRESSIVE - FO6 WP`;
  const citeWp7 =
    'wetlands.cpp:109–113 WP7 fail quest if Slim escapes (JustDied) - FO6 escort fail';
  const citeAggro =
    `wetlands.cpp:117–127 Aggro DoCastSpellIfCan(SPELL_CALL_FRIENDS=${SPELL_CALL_FRIENDS}) ` +
    `summon NPC_SLIMS_FRIEND (${NPC_SLIMS_FRIEND}) + DoScriptText(SAY_SLIM_AGGRO=${SAY_SLIM_AGGRO}) - FO6 combat`;
  const citeLowHp =
    `wetlands.cpp:136–156 DamageTaken HP<${SLIM_CREDIT_HP_PCT}%: ` +
    `SAY_FRIEND_DEFEAT=${SAY_FRIEND_DEFEAT} + ForcedDespawn(${SLIM_DESPAWN_MS}); ` +
    'SetEscortPaused + EnterEvadeMode - FO6 fight end';
  const citeDialog =
    `wetlands.cpp:86–96,55–60 JustReachedHome dialogue ` +
    `SAY_SLIM_DEFEAT=${SAY_SLIM_DEFEAT} → SAY_SLIM_NOTES=${SAY_SLIM_NOTES} - FO6 dialogue`;
  const citeCredit =
    `wetlands.cpp:165–176 JustDidDialogueStep QUEST_MISSING_DIPLOMAT11 ` +
    `RewardPlayerAndGroupAtEventExplored(1249) + ForcedDespawn(${SLIM_DESPAWN_MS}) + ` +
    `SetRespawnDelay(${SLIM_RESPAWN_DELAY_S}) - FO6 finishEscort`;
  return [
    {
      kind: 'skip',
      reason:
        `GetClosestCreatureWithEntry(NPC_TAPOKE_SLIM_JAHN=${NPC_TAPOKE_SLIM_JAHN}, ${SLIM_SEARCH_RADIUS}) - zone model assumes Slim present`,
      cite: citeFind,
    },
    {
      kind: 'cast_spell',
      spellId: SPELL_STEALTH,
      castFlags: TRIGGERED_OLD_TRIGGERED,
      sourceIsGo: false,
      targetCleared: false,
      cite: citeStealth,
    },
    {
      kind: 'send_ai_event',
      eventType: AI_EVENT_START_ESCORT,
      radius: 0,
      value: questId,
      mode: 'to_target',
      cite: citeEvent,
    },
    {
      kind: 'skip',
      reason:
        `escort Start(false, player, quest, true) npc_tapoke_slim_jahn (${NPC_TAPOKE_SLIM_JAHN}) - FO6 degraded finishEscort`,
      cite: citeEscort,
    },
    {
      kind: 'skip',
      reason:
        `WP3 unstealth + faction ${FACTION_ENEMY} flags ${SLIM_TEMP_FACTION_FLAGS} + clear UNIT_FLAG_IMMUNE_TO_PLAYER - FO6 waypoint`,
      cite: citeWp3,
    },
    {
      kind: 'skip',
      reason: 'WP7 fail quest if Slim escapes - FO6 escort fail',
      cite: citeWp7,
    },
    {
      kind: 'skip',
      reason:
        `Aggro SPELL_CALL_FRIENDS (${SPELL_CALL_FRIENDS}) + SAY_SLIM_AGGRO (${SAY_SLIM_AGGRO}) + friend ${NPC_SLIMS_FRIEND} - FO6 combat`,
      cite: citeAggro,
    },
    {
      kind: 'skip',
      reason:
        `DamageTaken HP<${SLIM_CREDIT_HP_PCT}% friend SAY_FRIEND_DEFEAT (${SAY_FRIEND_DEFEAT}) + evade - FO6 fight end`,
      cite: citeLowHp,
    },
    {
      kind: 'skip',
      reason:
        `dialogue SAY_SLIM_DEFEAT (${SAY_SLIM_DEFEAT}) + SAY_SLIM_NOTES (${SAY_SLIM_NOTES}) - FO6 dialogue`,
      cite: citeDialog,
    },
    {
      kind: 'skip',
      reason:
        `JustDidDialogueStep RewardPlayerAndGroupAtEventExplored(1249) + ForcedDespawn(${SLIM_DESPAWN_MS}) - FO6 finishEscort`,
      cite: citeCredit,
    },
  ];
}

/** Family pack: eastern_kingdoms/wetlands.cpp Hooks: pQuestAcceptNPC QuestAccept_npc_mikhail (1249). */
export function runWetlands(
  phase: QuestScriptHook,
  questId: number,
): DbScriptIntent[] {
  if (phase !== 'accept') return [];
  if (questId === QUEST_MISSING_DIPLOMAT11) return runMikhailAccept(questId);
  return [];
}
