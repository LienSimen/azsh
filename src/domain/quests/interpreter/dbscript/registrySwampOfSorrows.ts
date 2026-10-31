// QI4 — eastern_kingdoms/swamp_of_sorrows residual, extracted for the 1500-line ratchet. It claims
// the accept hook for quest 1393 only. Cite: eastern_kingdoms/swamp_of_sorrows.cpp.

import type { DbScriptIntent } from './types.ts';

/** Matches registry.ts QuestScriptHook — local to avoid circular import. */
type QuestScriptHook = 'accept' | 'reward' | 'complete' | 'frame';

// ── sourced constants ────────────────────────────────────────────────────────

// Cite: swamp_of_sorrows.cpp:39 QUEST_GALENS_ESCAPE = 1393 Escort Galen Goodward out of his cage, then open
// his strongbox camp.
export const QUEST_GALENS_ESCAPE = 1393;
// Cite: scriptdev2.sql ScriptName='npc_galen_goodward' WHERE entry=5391; bake starterCreatureEntries for
// quest 1393.
const NPC_GALEN_GOODWARD = 5391;
// Cite: swamp_of_sorrows.cpp:41 GO_GALENS_CAGE = 37118 WaypointStart point 1 opens nearest cage via
// UseDoorOrButton; WP1 reached resets it.
const GO_GALENS_CAGE = 37118;
// Cite: swamp_of_sorrows.cpp:44 SAY_QUEST_ACCEPTED = -1000583 DoScriptText on accept
// (QuestAccept_npc_galen_goodward).
const SAY_QUEST_ACCEPTED = -1000583;
// Cite: swamp_of_sorrows.cpp:43 SAY_PERIODIC = -1000582 UpdateEscortAI when STATE_ESCORT_NONE — idle FO6
// (not accept-hook).
const SAY_PERIODIC = -1000582;
// Cite: swamp_of_sorrows.cpp:45–46 SAY_ATTACKED_1/2 = -1000584 / -1000585 Aggro while escorting — combat
// FO6 (urand branch not ported as RNG).
const SAY_ATTACKED_1 = -1000584;
const SAY_ATTACKED_2 = -1000585;
// Cite: swamp_of_sorrows.cpp:47 SAY_QUEST_COMPLETE = -1000586 WaypointReached WP21 DoScriptText before
// explore credit.
const SAY_QUEST_COMPLETE = -1000586;
// Cite: swamp_of_sorrows.cpp:48 EMOTE_WHISPER = -1000587 WaypointReached WP21 DoScriptText (strongbox
// secret whisper).
const EMOTE_WHISPER = -1000587;
// Cite: swamp_of_sorrows.cpp:49 EMOTE_DISAPPEAR = -1000588 WaypointReached WP22 DoScriptText before
// ForcedDespawn at WP23.
const EMOTE_DISAPPEAR = -1000588;
// Cite: ScriptDevAIMgr.h:50 FACTION_ESCORT_N_NEUTRAL_ACTIVE = 250 QuestAccept SetFactionTemporary on Galen
// escort start.
const FACTION_ESCORT_N_NEUTRAL_ACTIVE = 250;
/** Cite: Creature.h:577 TEMPFACTION_RESTORE_RESPAWN = 0x01 */
const TEMPFACTION_RESTORE_RESPAWN = 0x01;
/** Cite: Creature.h:582 TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x20 */
const TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x20;
// Cite: swamp_of_sorrows.cpp:147 TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x01 |
// 0x20 = 0x21
const GALEN_TEMP_FACTION_FLAGS =
  TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC;
// Cite: swamp_of_sorrows.cpp:61 m_periodicSay = 6000 Idle periodic say interval (ms) while not escorting —
// FO6 timer.
const GALEN_PERIODIC_SAY_MS = 6000;
/** Cite: swamp_of_sorrows.cpp:113 ForcedDespawn(1000) WP23 despawn delay after pause. */
const GALEN_DESPAWN_MS = 1000;
// Cite: bake goEnderEntries / classic-db quest 1393 ender Galen's Strongbox (GO 32569) — camp north of
// Stonard after escort credit.
const GO_GALENS_STRONGBOX = 32569;

// QuestAccept_npc_galen_goodward — quest 1393 Galen's Escape: temporary faction, the accept line
// and an escort that opens his cage at WP1; WP21 credits. Cite: swamp_of_sorrows.cpp:139–152.
function runGalenGoodwardAccept(): DbScriptIntent[] {
  const citeEscort =
    `swamp_of_sorrows.cpp:146 npc_galen_goodward (${NPC_GALEN_GOODWARD}) ` +
    'npc_escortAI::Start(false, player, quest) - FO6 degraded finishEscort';
  const citeFaction =
    'swamp_of_sorrows.cpp:147 SetFactionTemporary(FACTION_ESCORT_N_NEUTRAL_ACTIVE, ' +
    'TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC)';
  const citeTalk =
    `swamp_of_sorrows.cpp:148 DoScriptText(SAY_QUEST_ACCEPTED=${SAY_QUEST_ACCEPTED})`;
  const citeCage =
    `swamp_of_sorrows.cpp:72–85 WaypointStart WP1 GetClosestGameObjectWithEntry(` +
    `GO_GALENS_CAGE=${GO_GALENS_CAGE}) UseDoorOrButton; WP1 reached ResetDoorOrButton - FO6 WP`;
  const citeRun =
    'swamp_of_sorrows.cpp:97–98 WP20 SetRun(true) - FO6 waypoint';
  const citeCredit =
    `swamp_of_sorrows.cpp:100–106 WP21 DoScriptText(SAY_QUEST_COMPLETE=${SAY_QUEST_COMPLETE}) + ` +
    `DoScriptText(EMOTE_WHISPER=${EMOTE_WHISPER}) + RewardPlayerAndGroupAtEventExplored(1393) - FO6 finishEscort`;
  const citeDespawn =
    `swamp_of_sorrows.cpp:108–114 WP22 EMOTE_DISAPPEAR=${EMOTE_DISAPPEAR}; ` +
    `WP23 SetEscortPaused + ForcedDespawn(${GALEN_DESPAWN_MS}) - FO6 WP`;
  const citeAggro =
    `swamp_of_sorrows.cpp:64–67 Aggro while escorting DoScriptText(urand SAY_ATTACKED_1=${SAY_ATTACKED_1} / ` +
    `SAY_ATTACKED_2=${SAY_ATTACKED_2}) - FO6 combat`;
  const citePeriodic =
    `swamp_of_sorrows.cpp:123–128 idle STATE_ESCORT_NONE DoScriptText(SAY_PERIODIC=${SAY_PERIODIC}) ` +
    `every ${GALEN_PERIODIC_SAY_MS}ms - FO6 idle`;
  const citeEnder =
    `bake goEnderEntries GO_GALENS_STRONGBOX=${GO_GALENS_STRONGBOX} after WP21 explore credit`;
  return [
    {
      kind: 'skip',
      reason:
        `escort Start(false, player, quest) npc_galen_goodward (${NPC_GALEN_GOODWARD}) - FO6 degraded finishEscort`,
      cite: citeEscort,
    },
    {
      kind: 'set_faction',
      factionId: FACTION_ESCORT_N_NEUTRAL_ACTIVE,
      flags: GALEN_TEMP_FACTION_FLAGS,
      cleared: false,
      cite: citeFaction,
    },
    {
      kind: 'talk',
      textId: SAY_QUEST_ACCEPTED,
      stringTemplateId: 0,
      cite: citeTalk,
    },
    {
      kind: 'skip',
      reason:
        `WP1 UseDoorOrButton / ResetDoorOrButton GO_GALENS_CAGE (${GO_GALENS_CAGE}) - FO6 waypoint`,
      cite: citeCage,
    },
    {
      kind: 'skip',
      reason: 'WP20 SetRun(true) - FO6 waypoint',
      cite: citeRun,
    },
    {
      kind: 'skip',
      reason:
        `WP21 SAY_QUEST_COMPLETE (${SAY_QUEST_COMPLETE}) + EMOTE_WHISPER (${EMOTE_WHISPER}) + ` +
        'RewardPlayerAndGroupAtEventExplored(1393) - FO6 finishEscort',
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason:
        `WP22 EMOTE_DISAPPEAR (${EMOTE_DISAPPEAR}) + WP23 ForcedDespawn(${GALEN_DESPAWN_MS}) - FO6`,
      cite: citeDespawn,
    },
    {
      kind: 'skip',
      reason:
        `Aggro SAY_ATTACKED_1/2 (${SAY_ATTACKED_1}/${SAY_ATTACKED_2}) while escorting - FO6 combat`,
      cite: citeAggro,
    },
    {
      kind: 'skip',
      reason:
        `idle SAY_PERIODIC (${SAY_PERIODIC}) every ${GALEN_PERIODIC_SAY_MS}ms - FO6`,
      cite: citePeriodic,
    },
    {
      kind: 'skip',
      reason:
        `turn-in Galen's Strongbox GO (${GO_GALENS_STRONGBOX}) after explore credit - host GO ender`,
      cite: citeEnder,
    },
  ];
}

// Family pack: eastern_kingdoms/swamp_of_sorrows.cpp Hooks: pQuestAcceptNPC QuestAccept_npc_galen_goodward
// (1393).
export function runSwampOfSorrows(
  phase: QuestScriptHook,
  questId: number,
): DbScriptIntent[] {
  if (phase !== 'accept') return [];
  if (questId === QUEST_GALENS_ESCAPE) return runGalenGoodwardAccept();
  return [];
}
