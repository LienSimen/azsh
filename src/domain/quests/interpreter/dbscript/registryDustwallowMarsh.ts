// QI4 — kalimdor/dustwallow_marsh residuals, extracted for the 1500-line ratchet. Quests 1173,
// 1222, 1270, 1273 and 1324, plus areatrigger 1265. Cite: kalimdor/dustwallow_marsh.cpp.

import type { DbScriptIntent } from './types.ts';
import { UNIT_STAND_STATE_STAND } from './opcodes.ts';

/** Matches registry.ts QuestScriptHook — local to avoid circular import. */
type QuestScriptHook = 'accept' | 'reward' | 'complete' | 'frame';

/** Minimal registry entry shape (mirrors registry.ts QuestScriptEntry). */
export interface DustwallowMarshQuestScriptEntry {
  family?: string;
  questId?: number;
  questIds?: number[];
  hooks?: QuestScriptHook[];
  run?: (phase: QuestScriptHook, questId: number) => DbScriptIntent[];
  cite?: string;
}

// ── sourced constants ────────────────────────────────────────────────────────

// Cite: dustwallow_marsh.cpp:50 QUEST_CHALLENGE_MOROKK = 1173 Escort-fight Morokk; credit at ≤30% HP while
// escort paused.
export const QUEST_CHALLENGE_MOROKK = 1173;
// Cite: dustwallow_marsh.cpp:638 QUEST_ID_STINKYS_ESCAPE_ALLIANCE = 1222 Escort Stinky Ignatz (Alliance
// credit path).
export const QUEST_ID_STINKYS_ESCAPE_ALLIANCE = 1222;
// Cite: dustwallow_marsh.cpp:767 QUEST_MISSING_DIPLO_PT14 = 1265 AreaTrigger_at_sentry_point residual —
// summon Tervosh for turn-in.
export const QUEST_MISSING_DIPLO_PT14 = 1265;
// Cite: dustwallow_marsh.cpp:639 QUEST_ID_STINKYS_ESCAPE_HORDE = 1270 Escort Stinky Ignatz (Horde credit
// path).
export const QUEST_ID_STINKYS_ESCAPE_HORDE = 1270;
// Cite: dustwallow_marsh.cpp:191 QUEST_QUESTIONING = 1273 Escort Ogron to Reethe dialogue / Theramore
// ambush.
export const QUEST_QUESTIONING = 1273;
// Cite: dustwallow_marsh.cpp:476 QUEST_MISSING_DIPLO_PT16 = 1324 Subdue Private Hendel + sentry fight;
// credit on SPELL_TELEPORT.
export const QUEST_MISSING_DIPLO_PT16 = 1324;

/** Cite: dustwallow_marsh.cpp:49 NPC_MOROKK = 4500 Bake starterCreatureEntries quest 1173. */
const NPC_MOROKK = 4500;
/** Cite: bake enderCreatureEntries quest 1173 — Overlord Mok'Morokk (4501). */
const NPC_OVERLORD_MOK_MOROKK = 4501;

/** Cite: dustwallow_marsh.cpp:46–47 Morokk script texts. */
const SAY_MOR_CHALLENGE = -1000499;
const SAY_MOR_SCARED = -1000500;
/** Cite: dustwallow_marsh.cpp:52–54 Morokk factions. */
const FACTION_MOR_HOSTILE = 168;
const FACTION_MOR_RUNNING = 35;
const FACTION_MOR_SPAWN = 29;
// Cite: dustwallow_marsh.cpp:122 GetHealthPercent() <= 30.0f Credit threshold while escort paused after WP1
// challenge.
const MOROKK_CREDIT_HP_PCT = 30;
/** Cite: dustwallow_marsh.cpp:105 IsInRange(…, 0, 70) for challenge start. */
const MOROKK_CHALLENGE_RANGE = 70;

/** Cite: dustwallow_marsh.cpp:196–199 Ogron scene NPCs. */
const NPC_REETHE = 4980;
const NPC_CALDWELL = 5046;
const NPC_HALLAN = 5045;
const NPC_SKIRMISHER = 5044;
/** Cite: bake starterCreatureEntries quest 1273 — Ogron (4983). */
const NPC_OGRON = 4983;
/** Cite: bake enderCreatureEntries quest 1273 — Krog (4926). */
const NPC_KROG = 4926;
/** Cite: dustwallow_marsh.cpp:170 SAY_OGR_START = -1000452 */
const SAY_OGR_START = -1000452;
/** Cite: dustwallow_marsh.cpp:187–189 post-fight lines (credit + thanks). */
const SAY_OGR_SURVIVE = -1000469;
const SAY_OGR_THANKS = -1000471;
/** Cite: dustwallow_marsh.cpp:193–194 guest/fight factions. */
const FACTION_GENERIC_FRIENDLY = 35;
const FACTION_THER_HOSTILE = 151;
/** Cite: ScriptDevAIMgr.h:52 FACTION_ESCORT_N_FRIEND_PASSIVE = 290 Ogron SetFactionTemporary on accept. */
const FACTION_ESCORT_N_FRIEND_PASSIVE = 290;
/** Cite: dustwallow_marsh.cpp:201 SPELL_FAKE_SHOT = 7105 Hallan casts on Reethe during guest phase. */
const SPELL_FAKE_SHOT = 7105;
/** Cite: dustwallow_marsh.cpp:209–210 spawn / move coords for Theramore guests. */
const OGRON_GUEST_SPAWN = {
  x: -3383.501953,
  y: -3203.383301,
  z: 36.149,
} as const;
const OGRON_GUEST_MOVE_TO = {
  x: -3371.414795,
  y: -3212.179932,
  z: 34.210,
} as const;
/** Cite: dustwallow_marsh.cpp:230 m_uiGlobalTimer = 5000; :327 reset 5000 */
const OGRON_PHASE_TIMER_MS = 5000;
/** Cite: dustwallow_marsh.cpp:359–362 TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN, 300000 */
const OGRON_GUEST_DESPAWN_MS = 300000;

/** Cite: dustwallow_marsh.cpp:479–482 Hendel scene NPCs. */
const NPC_SENTRY = 5184;
const NPC_JAINA = 4968;
const NPC_TERVOSH = 4967;
const NPC_PAINED = 4965;
/** Cite: bake starterCreatureEntries quest 1324 — Private Hendel (4966). */
const NPC_PRIVATE_HENDEL = 4966;
/** Cite: dustwallow_marsh.cpp:474 EMOTE_SURRENDER = -1000415 */
const EMOTE_SURRENDER = -1000415;
// Cite: dustwallow_marsh.cpp:477 FACTION_HOSTILE = 168 Temporary faction on accept for Hendel + sentries.
const FACTION_HOSTILE = 168;
// Cite: dustwallow_marsh.cpp:484–485 SPELL_TELEPORT_VISUAL / SPELL_TELEPORT Outro spawn cast visual; credit
// on SpellHit SPELL_TELEPORT (DBScript).
const SPELL_TELEPORT_VISUAL = 12980;
const SPELL_TELEPORT = 7079;
// Cite: dustwallow_marsh.cpp:548 GetHealthPercent() < 20.0f DamageTaken surrender threshold (or lethal
// damage).
const HENDEL_SURRENDER_HP_PCT = 20;
/** Cite: dustwallow_marsh.cpp:563 GetCreatureListWithEntryInGrid NPC_SENTRY, 40.0f */
const HENDEL_SENTRY_SEARCH_RADIUS = 40;
/** Cite: dustwallow_marsh.cpp:573 ForcedDespawn(4000) on fleeing sentries. */
const HENDEL_SENTRY_DESPAWN_MS = 4000;
/** Cite: dustwallow_marsh.cpp:514 fSentryFleePoint */
const HENDEL_SENTRY_FLEE = {
  x: -2917.56,
  y: -3329.9,
  z: 30.37,
} as const;
// Cite: dustwallow_marsh.cpp:580 TEMPSPAWN_TIMED_DESPAWN, 3 * MINUTE * IN_MILLISECONDS Common.h MINUTE=60,
// IN_MILLISECONDS=1000 → 180000ms. Object.h:46 TEMPSPAWN_TIMED_DESPAWN = 4
const HENDEL_OUTRO_DESPAWN_MS = 3 * 60 * 1000;
const TEMPSPAWN_TIMED_DESPAWN = 4;
/** Cite: dustwallow_marsh.cpp:495–511 lOutroSpawns[0] Archmage Tervosh */
const HENDEL_OUTRO_TERVOSH = {
  x: -2857.604492,
  y: -3354.784912,
  z: 35.36964,
  o: 3.16604,
  destX: -2881.546631,
  destY: -3346.477539,
  destZ: 34.143719,
} as const;
/** Cite: dustwallow_marsh.cpp:502–506 lOutroSpawns[1] Jaina */
const HENDEL_OUTRO_JAINA = {
  x: -2858.120117,
  y: -3358.469971,
  z: 36.0863,
  o: 3.16604,
  destX: -2879.697998,
  destY: -3347.789063,
  destZ: 34.772892,
} as const;
/** Cite: dustwallow_marsh.cpp:508–511 lOutroSpawns[2] Pained */
const HENDEL_OUTRO_PAINED = {
  x: -2857.379883,
  y: -3351.370117,
  z: 34.178001,
  o: 3.16604,
  destX: -2879.959961,
  destY: -3344.469971,
  destZ: 34.670502,
} as const;

/** Cite: bake starterCreatureEntries 1222/1270 — Stinky Ignatz (4880). */
const NPC_STINKY_IGNATZ = 4880;
/** Cite: bake enderCreatureEntries 1222 — Morgan Stern (4794). */
const NPC_MORGAN_STERN = 4794;
/** Cite: bake enderCreatureEntries 1270 — Mebok Mizzyrix (3446). */
const NPC_MEBOK_MIZZYRIX = 3446;
/** Cite: dustwallow_marsh.cpp:641 SAY_STINKY_BEGIN = -1000958 */
const SAY_STINKY_BEGIN = -1000958;
/** Cite: dustwallow_marsh.cpp:648 SAY_STINKY_END = -1000962 */
const SAY_STINKY_END = -1000962;
/** Cite: dustwallow_marsh.cpp:656 GO_BOGBEAN_PLANT = 20939 */
const GO_BOGBEAN_PLANT = 20939;
// Cite: ScriptDevAIMgr.h:46 FACTION_ESCORT_N_NEUTRAL_PASSIVE = 113 Stinky SetFactionTemporary on
// AI_EVENT_START_ESCORT.
const FACTION_ESCORT_N_NEUTRAL_PASSIVE = 113;
/** Cite: AIDefines.h:43 AI_EVENT_START_ESCORT = 100 */
const AI_EVENT_START_ESCORT = 100;

/** Cite: bake starterCreatureEntries quest 1265 — Commander Samaul (4964). */
const NPC_COMMANDER_SAMAUL = 4964;
/** Cite: dustwallow_marsh.cpp:769 SPELL_TELEPORT_VISUAL_2 = 799 Tervosh cast on AT summon. */
const SPELL_TELEPORT_VISUAL_2 = 799;
// Cite: dustwallow_marsh.cpp:770 NPC_SENTRY_POINT_GUARD = 5085 Guard faces + salutes Tervosh after AT
// spawn.
const NPC_SENTRY_POINT_GUARD = 5085;
/** Cite: SharedDefines.h:797 EMOTE_ONESHOT_SALUTE = 66 */
const EMOTE_ONESHOT_SALUTE = 66;
/** Cite: dustwallow_marsh.cpp:778 GetClosestCreatureWithEntry NPC_TERVOSH, 100.0f */
const TERVOSH_EXISTING_SEARCH = 100;
/** Cite: dustwallow_marsh.cpp:780 SummonCreature NPC_TERVOSH coords + 60000ms */
const TERVOSH_AT_SPAWN = {
  x: -3476.51,
  y: -4105.94,
  z: 17.1,
  o: 5.3816,
} as const;
const TERVOSH_AT_DESPAWN_MS = 60000;
/** Cite: dustwallow_marsh.cpp:784 GetClosestCreatureWithEntry guard, 15.0f */
const SENTRY_GUARD_SEARCH = 15;
/** Cite: SpellDefines.h:432 TRIGGERED_OLD_TRIGGERED = 0x00000001 AT Tervosh CastSpell teleport visual. */
const TRIGGERED_OLD_TRIGGERED = 0x00000001;

/** Cite: Creature.h:577 TEMPFACTION_RESTORE_RESPAWN = 0x01 */
const TEMPFACTION_RESTORE_RESPAWN = 0x01;
/** Cite: Creature.h:578 TEMPFACTION_RESTORE_COMBAT_STOP = 0x02 */
const TEMPFACTION_RESTORE_COMBAT_STOP = 0x02;
/** Cite: Creature.h:582 TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x20 */
const TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x20;
// Cite: dustwallow_marsh.cpp:455 TEMPFACTION_RESTORE_RESPAWN | TOGGLE_IMMUNE_TO_NPC = 0x01 | 0x20 = 0x21
const OGRON_TEMP_FACTION_FLAGS =
  TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC;
/** Cite: dustwallow_marsh.cpp:605 TEMPFACTION_RESTORE_COMBAT_STOP | RESTORE_RESPAWN = 0x02 | 0x01 = 0x03 */
const HENDEL_TEMP_FACTION_FLAGS =
  TEMPFACTION_RESTORE_COMBAT_STOP | TEMPFACTION_RESTORE_RESPAWN;
/** Cite: dustwallow_marsh.cpp:687 TEMPFACTION_RESTORE_RESPAWN only (0x01) */
const STINKY_TEMP_FACTION_FLAGS = TEMPFACTION_RESTORE_RESPAWN;

// ── accept handlers ──────────────────────────────────────────────────────────

// QuestAccept_npc_morokk — quest 1173 Challenge Overlord Mok'Morokk: a run escort that pauses at
// WP1 to duel, crediting at 30% health. Cite: dustwallow_marsh.cpp:151–162, :97–140.
function runMorokkAccept(): DbScriptIntent[] {
  const citeEscort =
    `dustwallow_marsh.cpp:156 npc_morokk (${NPC_MOROKK}) ` +
    'npc_escortAI::Start(true, player, quest) - FO6 degraded finishEscort';
  const citeWp1 =
    'dustwallow_marsh.cpp:91–93 WP1 SetEscortPaused(true) - FO6 waypoint';
  const citeFight =
    `dustwallow_marsh.cpp:103–113 paused + player range ${MOROKK_CHALLENGE_RANGE}: ` +
    `DoScriptText(SAY_MOR_CHALLENGE=${SAY_MOR_CHALLENGE}) + ` +
    `setFaction(FACTION_MOR_HOSTILE=${FACTION_MOR_HOSTILE}) + AttackStart - FO6 combat`;
  const citeCredit =
    `dustwallow_marsh.cpp:122–136 HP<=${MOROKK_CREDIT_HP_PCT}%: ` +
    `RewardPlayerAndGroupAtEventExplored(1173) + FACTION_MOR_RUNNING=${FACTION_MOR_RUNNING} + ` +
    `SAY_MOR_SCARED=${SAY_MOR_SCARED} - FO6 finishEscort`;
  const citeFail =
    'dustwallow_marsh.cpp:75–84 JustReachedHome !m_bIsSuccess FailQuest + ForcedDespawn - FO6 fail';
  const citeSpawn =
    `dustwallow_marsh.cpp:69–73 JustRespawned setFaction(FACTION_MOR_SPAWN=${FACTION_MOR_SPAWN})`;
  const citeEnder =
    `bake enderCreatureEntries NPC_OVERLORD_MOK_MOROKK=${NPC_OVERLORD_MOK_MOROKK} after explore credit`;
  return [
    {
      kind: 'skip',
      reason:
        `escort Start(true, player, quest) npc_morokk (${NPC_MOROKK}) - FO6 degraded finishEscort`,
      cite: citeEscort,
    },
    {
      kind: 'skip',
      reason: 'WP1 SetEscortPaused(true) - FO6 waypoint',
      cite: citeWp1,
    },
    {
      kind: 'skip',
      reason:
        `challenge SAY_MOR_CHALLENGE (${SAY_MOR_CHALLENGE}) + faction ${FACTION_MOR_HOSTILE} AttackStart range ${MOROKK_CHALLENGE_RANGE} - FO6 combat`,
      cite: citeFight,
    },
    {
      kind: 'skip',
      reason:
        `HP<=${MOROKK_CREDIT_HP_PCT}% RewardPlayerAndGroupAtEventExplored(1173) + SAY_MOR_SCARED (${SAY_MOR_SCARED}) + faction ${FACTION_MOR_RUNNING} - FO6 finishEscort`,
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason: 'JustReachedHome fail path ForcedDespawn if challenge failed - FO6',
      cite: citeFail,
    },
    {
      kind: 'skip',
      reason: `JustRespawned FACTION_MOR_SPAWN (${FACTION_MOR_SPAWN})`,
      cite: citeSpawn,
    },
    {
      kind: 'skip',
      reason: `turn-in NPC_OVERLORD_MOK_MOROKK (${NPC_OVERLORD_MOK_MOROKK}) after explore credit`,
      cite: citeEnder,
    },
  ];
}

// QuestAccept_npc_ogron — quest 1273 Questioning Reethe: temporary friendly faction, the start
// line, then the Reethe dialogue and ambush credit. Cite: dustwallow_marsh.cpp:448–461, :319–445.
function runOgronAccept(): DbScriptIntent[] {
  const citeFaction =
    `dustwallow_marsh.cpp:455 npc_ogron (${NPC_OGRON}) ` +
    `SetFactionTemporary(FACTION_ESCORT_N_FRIEND_PASSIVE=${FACTION_ESCORT_N_FRIEND_PASSIVE}, ` +
    `flags=${OGRON_TEMP_FACTION_FLAGS})`;
  const citeTalk =
    `dustwallow_marsh.cpp:456 DoScriptText(SAY_OGR_START=${SAY_OGR_START})`;
  const citeEscort =
    `dustwallow_marsh.cpp:454 npc_ogron (${NPC_OGRON}) ` +
    'npc_escortAI::Start(false, player, quest, true) - FO6 degraded finishEscort';
  const citeWp =
    'dustwallow_marsh.cpp:269–278 WP10/11 Reethe lines + WP12 SetEscortPaused - FO6 waypoint';
  const citeGuests =
    `dustwallow_marsh.cpp:359–362 SummonCreature NPC_CALDWELL=${NPC_CALDWELL}/` +
    `NPC_HALLAN=${NPC_HALLAN}/NPC_SKIRMISHER=${NPC_SKIRMISHER}×2 at ` +
    `(${OGRON_GUEST_SPAWN.x},${OGRON_GUEST_SPAWN.y},${OGRON_GUEST_SPAWN.z}) ` +
    `TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN ${OGRON_GUEST_DESPAWN_MS}ms; ` +
    `MovePoint (${OGRON_GUEST_MOVE_TO.x},…) + FACTION_GENERIC_FRIENDLY=${FACTION_GENERIC_FRIENDLY} - FO6`;
  const citeShot =
    `dustwallow_marsh.cpp:386–387 Hallan CastSpell(Reethe, SPELL_FAKE_SHOT=${SPELL_FAKE_SHOT}) - FO6`;
  const citeFight =
    `dustwallow_marsh.cpp:301–316 DoStartAttackMe FACTION_THER_HOSTILE=${FACTION_THER_HOSTILE} ` +
    `on guests except NPC_REETHE=${NPC_REETHE} - FO6 combat`;
  const citeCredit =
    `dustwallow_marsh.cpp:414–416 case 12 RewardPlayerAndGroupAtEventExplored(1273) + ` +
    `SAY_OGR_SURVIVE=${SAY_OGR_SURVIVE}; case 14 SAY_OGR_THANKS=${SAY_OGR_THANKS} resume - FO6 finishEscort`;
  const citeTimer =
    `dustwallow_marsh.cpp:230,327 m_uiGlobalTimer=${OGRON_PHASE_TIMER_MS}ms phase steps - FO6`;
  const citeEnder =
    `bake enderCreatureEntries NPC_KROG=${NPC_KROG} after explore credit`;
  return [
    {
      kind: 'set_faction',
      factionId: FACTION_ESCORT_N_FRIEND_PASSIVE,
      flags: OGRON_TEMP_FACTION_FLAGS,
      cleared: false,
      cite: citeFaction,
    },
    {
      kind: 'talk',
      textId: SAY_OGR_START,
      stringTemplateId: 0,
      cite: citeTalk,
    },
    {
      kind: 'skip',
      reason:
        `escort Start(false, player, quest, true) npc_ogron (${NPC_OGRON}) - FO6 degraded finishEscort`,
      cite: citeEscort,
    },
    {
      kind: 'skip',
      reason: 'WP10–12 Reethe spot + pause - FO6 waypoint',
      cite: citeWp,
    },
    {
      kind: 'skip',
      reason:
        `guest summons Caldwell/Hallan/Skirmisher (${NPC_CALDWELL}/${NPC_HALLAN}/${NPC_SKIRMISHER}) ` +
        `despawn ${OGRON_GUEST_DESPAWN_MS} - FO6`,
      cite: citeGuests,
    },
    {
      kind: 'skip',
      reason: `SPELL_FAKE_SHOT (${SPELL_FAKE_SHOT}) on Reethe (${NPC_REETHE}) - FO6`,
      cite: citeShot,
    },
    {
      kind: 'skip',
      reason:
        `DoStartAttackMe Theramore faction ${FACTION_THER_HOSTILE} - FO6 combat`,
      cite: citeFight,
    },
    {
      kind: 'skip',
      reason:
        `PHASE_COMPLETE RewardPlayerAndGroupAtEventExplored(1273) + SAY_OGR_SURVIVE (${SAY_OGR_SURVIVE}) / ` +
        `SAY_OGR_THANKS (${SAY_OGR_THANKS}) timer ${OGRON_PHASE_TIMER_MS} - FO6 finishEscort`,
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason: `phase timer ${OGRON_PHASE_TIMER_MS}ms - FO6`,
      cite: citeTimer,
    },
    {
      kind: 'skip',
      reason: `turn-in NPC_KROG (${NPC_KROG}) after explore credit`,
      cite: citeEnder,
    },
  ];
}

// QuestAccept_npc_private_hendel — quest 1324 The Missing Diplomat pt16: Hendel and the nearby
// sentries turn hostile; the surrender outro's teleport credits it. Cite: dustwallow_marsh.cpp:601.
function runHendelAccept(): DbScriptIntent[] {
  const citeFaction =
    `dustwallow_marsh.cpp:605 npc_private_hendel (${NPC_PRIVATE_HENDEL}) ` +
    `SetFactionTemporary(FACTION_HOSTILE=${FACTION_HOSTILE}, flags=${HENDEL_TEMP_FACTION_FLAGS})`;
  const citeAttack =
    'dustwallow_marsh.cpp:606 AI()->AttackStart(player)';
  const citeSentries =
    `dustwallow_marsh.cpp:610–620 GetCreatureListWithEntryInGrid(NPC_SENTRY=${NPC_SENTRY}, ` +
    `${HENDEL_SENTRY_SEARCH_RADIUS}) SetFactionTemporary + AttackStart - FO6 zone helpers`;
  const citeSurrender =
    `dustwallow_marsh.cpp:546–559 DamageTaken lethal|HP<${HENDEL_SURRENDER_HP_PCT}%: ` +
    `store player; DoScriptText(EMOTE_SURRENDER=${EMOTE_SURRENDER}); EnterEvadeMode - FO6`;
  const citeFlee =
    `dustwallow_marsh.cpp:561–574 sentries MovePoint(${HENDEL_SENTRY_FLEE.x},${HENDEL_SENTRY_FLEE.y},` +
    `${HENDEL_SENTRY_FLEE.z}) ForcedDespawn(${HENDEL_SENTRY_DESPAWN_MS}) - FO6`;
  const citeOutro =
    `dustwallow_marsh.cpp:577–596 Summon NPC_TERVOSH=${NPC_TERVOSH}/NPC_JAINA=${NPC_JAINA}/` +
    `NPC_PAINED=${NPC_PAINED} TEMPSPAWN_TIMED_DESPAWN=${TEMPSPAWN_TIMED_DESPAWN} ` +
    `${HENDEL_OUTRO_DESPAWN_MS}ms + SPELL_TELEPORT_VISUAL=${SPELL_TELEPORT_VISUAL} - FO6`;
  const citeTervosh =
    `dustwallow_marsh.cpp:588–593 Tervosh strip QUESTGIVER|GOSSIP + MoveWaypoint → DBScript ` +
    `SPELL_TELEPORT=${SPELL_TELEPORT} - FO6`;
  const citeCredit =
    `dustwallow_marsh.cpp:539–542 SpellHit SPELL_TELEPORT=${SPELL_TELEPORT} ` +
    `RewardPlayerAndGroupAtEventExplored(1324) - FO6 finishEscort`;
  const citeEnder =
    `bake enderCreatureEntries NPC_TERVOSH=${NPC_TERVOSH} after explore credit`;
  return [
    {
      kind: 'set_faction',
      factionId: FACTION_HOSTILE,
      flags: HENDEL_TEMP_FACTION_FLAGS,
      cleared: false,
      cite: citeFaction,
    },
    {
      kind: 'attack_start',
      canAttack: true,
      cite: citeAttack,
    },
    {
      kind: 'skip',
      reason:
        `NPC_SENTRY (${NPC_SENTRY}) within ${HENDEL_SENTRY_SEARCH_RADIUS}yd faction ${FACTION_HOSTILE} AttackStart - FO6`,
      cite: citeSentries,
    },
    {
      kind: 'skip',
      reason:
        `HP<${HENDEL_SURRENDER_HP_PCT}% EMOTE_SURRENDER (${EMOTE_SURRENDER}) + evade - FO6 fight end`,
      cite: citeSurrender,
    },
    {
      kind: 'skip',
      reason:
        `sentry flee ForcedDespawn(${HENDEL_SENTRY_DESPAWN_MS}) - FO6`,
      cite: citeFlee,
    },
    {
      kind: 'skip',
      reason:
        `outro summons Tervosh/Jaina/Pained (${NPC_TERVOSH}/${NPC_JAINA}/${NPC_PAINED}) ` +
        `despawn ${HENDEL_OUTRO_DESPAWN_MS} + SPELL_TELEPORT_VISUAL (${SPELL_TELEPORT_VISUAL}) - FO6`,
      cite: citeOutro,
    },
    {
      kind: 'skip',
      reason:
        `Tervosh MoveWaypoint DBScript SPELL_TELEPORT (${SPELL_TELEPORT}) - FO6`,
      cite: citeTervosh,
    },
    {
      kind: 'skip',
      reason:
        `SpellHit SPELL_TELEPORT RewardPlayerAndGroupAtEventExplored(1324) - FO6 finishEscort`,
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason: `turn-in NPC_TERVOSH (${NPC_TERVOSH}) after explore credit`,
      cite: citeEnder,
    },
    // Sourced coords retained for host FO6 placement (not applied on accept).
    {
      kind: 'skip',
      reason:
        `outro Tervosh spawn (${HENDEL_OUTRO_TERVOSH.x},${HENDEL_OUTRO_TERVOSH.y},${HENDEL_OUTRO_TERVOSH.z}) ` +
        `→ dest (${HENDEL_OUTRO_TERVOSH.destX},${HENDEL_OUTRO_TERVOSH.destY},${HENDEL_OUTRO_TERVOSH.destZ}); ` +
        `Jaina (${HENDEL_OUTRO_JAINA.x},…); Pained (${HENDEL_OUTRO_PAINED.x},…) - FO6`,
      cite: citeOutro,
    },
  ];
}

// QuestAccept_npc_stinky_ignatz — quests 1222 Alliance and 1270 Horde: the AI event says the start
// line, sets a passive faction and escorts; WP40 credits by team. Cite: dustwallow_marsh.cpp:753.
function runStinkyAccept(questId: number): DbScriptIntent[] {
  const citeEvent =
    `dustwallow_marsh.cpp:756 npc_stinky_ignatz (${NPC_STINKY_IGNATZ}) ` +
    `SendAIEvent(AI_EVENT_START_ESCORT=${AI_EVENT_START_ESCORT}, player, creature, questId=${questId})`;
  const citeBegin =
    `dustwallow_marsh.cpp:686 DoScriptText(SAY_STINKY_BEGIN=${SAY_STINKY_BEGIN})`;
  const citeEscort =
    `dustwallow_marsh.cpp:687 npc_stinky_ignatz (${NPC_STINKY_IGNATZ}) ` +
    'npc_escortAI::Start(false, player, quest) - FO6 degraded finishEscort';
  const citeFaction =
    `dustwallow_marsh.cpp:688 SetFactionTemporary(FACTION_ESCORT_N_NEUTRAL_PASSIVE=` +
    `${FACTION_ESCORT_N_NEUTRAL_PASSIVE}, TEMPFACTION_RESTORE_RESPAWN)`;
  const citeStand =
    'dustwallow_marsh.cpp:689 SetStandState(UNIT_STAND_STATE_STAND)';
  const citePlant =
    `dustwallow_marsh.cpp:707–742 GO_BOGBEAN_PLANT=${GO_BOGBEAN_PLANT} face + Use at WP31 - FO6`;
  const citeCredit =
    `dustwallow_marsh.cpp:723–728 WP40 RewardPlayerAndGroupAtEventExplored(` +
    `team?${QUEST_ID_STINKYS_ESCAPE_ALLIANCE}:${QUEST_ID_STINKYS_ESCAPE_HORDE}) + ` +
    `SAY_STINKY_END=${SAY_STINKY_END} - FO6 finishEscort`;
  const ender =
    questId === QUEST_ID_STINKYS_ESCAPE_ALLIANCE
      ? NPC_MORGAN_STERN
      : NPC_MEBOK_MIZZYRIX;
  const citeEnder =
    `bake enderCreatureEntries ender=${ender} after WP40 explore credit (quest ${questId})`;
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
      textId: SAY_STINKY_BEGIN,
      stringTemplateId: 0,
      cite: citeBegin,
    },
    {
      kind: 'set_faction',
      factionId: FACTION_ESCORT_N_NEUTRAL_PASSIVE,
      flags: STINKY_TEMP_FACTION_FLAGS,
      cleared: false,
      cite: citeFaction,
    },
    {
      kind: 'stand_state',
      standState: UNIT_STAND_STATE_STAND,
      cite: citeStand,
    },
    {
      kind: 'skip',
      reason:
        `escort Start(false, player, quest) npc_stinky_ignatz (${NPC_STINKY_IGNATZ}) - FO6 degraded finishEscort`,
      cite: citeEscort,
    },
    {
      kind: 'skip',
      reason: `GO_BOGBEAN_PLANT (${GO_BOGBEAN_PLANT}) gather WPs - FO6`,
      cite: citePlant,
    },
    {
      kind: 'skip',
      reason:
        `WP40 RewardPlayerAndGroupAtEventExplored(${questId}) + SAY_STINKY_END (${SAY_STINKY_END}) - FO6 finishEscort`,
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason: `turn-in ender (${ender}) after explore credit`,
      cite: citeEnder,
    },
  ];
}

// ── frame residual (area trigger) ────────────────────────────────────────────

// AreaTrigger_at_sentry_point — quest 1265 The Missing Diplomat pt14: with no Tervosh within
// 100 yd, summon him for 60 s and salute from the nearby guards. Cite: dustwallow_marsh.cpp:772.
function runSentryPointAt(): DbScriptIntent[] {
  const citeGate =
    `dustwallow_marsh.cpp:774–776 AreaTrigger_at_sentry_point QUEST_MISSING_DIPLO_PT14=` +
    `${QUEST_MISSING_DIPLO_PT14} incomplete + alive gate`;
  const citeFind =
    `dustwallow_marsh.cpp:778 GetClosestCreatureWithEntry(NPC_TERVOSH=${NPC_TERVOSH}, ` +
    `${TERVOSH_EXISTING_SEARCH}) - skip summon if present`;
  const citeSpawn =
    `dustwallow_marsh.cpp:780 SummonCreature(NPC_TERVOSH=${NPC_TERVOSH}, ` +
    `(${TERVOSH_AT_SPAWN.x},${TERVOSH_AT_SPAWN.y},${TERVOSH_AT_SPAWN.z},${TERVOSH_AT_SPAWN.o}), ` +
    `TEMPSPAWN_TIMED_DESPAWN=${TEMPSPAWN_TIMED_DESPAWN}, ${TERVOSH_AT_DESPAWN_MS})`;
  const citeVisual =
    `dustwallow_marsh.cpp:782 CastSpell(SPELL_TELEPORT_VISUAL_2=${SPELL_TELEPORT_VISUAL_2}, ` +
    `TRIGGERED_OLD_TRIGGERED=${TRIGGERED_OLD_TRIGGERED})`;
  const citeGuard =
    `dustwallow_marsh.cpp:784–788 NPC_SENTRY_POINT_GUARD=${NPC_SENTRY_POINT_GUARD} ` +
    `within ${SENTRY_GUARD_SEARCH}yd SetFacing + EMOTE_ONESHOT_SALUTE=${EMOTE_ONESHOT_SALUTE} - FO6`;
  const citeCredit =
    'core areatrigger_involvedrelation / specialFlags:2 explore at Sentry Point - FO6 finishEscort ' +
    '(script does not call RewardPlayerAndGroupAtEventExplored)';
  const citeEnder =
    `bake enderCreatureEntries NPC_TERVOSH=${NPC_TERVOSH}; starter NPC_COMMANDER_SAMAUL=${NPC_COMMANDER_SAMAUL}`;
  return [
    {
      kind: 'skip',
      reason:
        `AT Sentry Point requires incomplete ${QUEST_MISSING_DIPLO_PT14} and alive player`,
      cite: citeGate,
    },
    {
      kind: 'skip',
      reason:
        `GetClosestCreatureWithEntry(NPC_TERVOSH=${NPC_TERVOSH}, ${TERVOSH_EXISTING_SEARCH}) - zone model assumes absent`,
      cite: citeFind,
    },
    {
      kind: 'temp_spawn_creature',
      creatureEntry: NPC_TERVOSH,
      x: TERVOSH_AT_SPAWN.x,
      y: TERVOSH_AT_SPAWN.y,
      z: TERVOSH_AT_SPAWN.z,
      o: TERVOSH_AT_SPAWN.o,
      despawnDelay: TERVOSH_AT_DESPAWN_MS,
      pathId: 0,
      setRun: false,
      summonActive: false,
      spawnDataEntry: 0,
      spawnType: TEMPSPAWN_TIMED_DESPAWN,
      cite: citeSpawn,
    },
    {
      kind: 'cast_spell',
      spellId: SPELL_TELEPORT_VISUAL_2,
      castFlags: TRIGGERED_OLD_TRIGGERED,
      sourceIsGo: false,
      targetCleared: false,
      cite: citeVisual,
    },
    {
      kind: 'emote',
      emoteId: EMOTE_ONESHOT_SALUTE,
      cite: citeGuard,
    },
    {
      kind: 'skip',
      reason:
        `NPC_SENTRY_POINT_GUARD (${NPC_SENTRY_POINT_GUARD}) face + salute - FO6`,
      cite: citeGuard,
    },
    {
      kind: 'skip',
      reason:
        'Sentry Point explore credit specialFlags:2 - FO6 finishEscort (core AT / host)',
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason:
        `turn-in NPC_TERVOSH (${NPC_TERVOSH}) after explore; accepted from Samaul (${NPC_COMMANDER_SAMAUL})`,
      cite: citeEnder,
    },
  ];
}

// Family pack: kalimdor/dustwallow_marsh.cpp Hooks: pQuestAcceptNPC morokk (1173), ogron (1273), hendel
// (1324), stinky (1222/1270). Residual: AreaTrigger_at_sentry_point (1265 frame).
export function runDustwallowMarsh(
  phase: QuestScriptHook,
  questId: number,
): DbScriptIntent[] {
  if (phase === 'accept') {
    if (questId === QUEST_CHALLENGE_MOROKK) return runMorokkAccept();
    if (questId === QUEST_QUESTIONING) return runOgronAccept();
    if (questId === QUEST_MISSING_DIPLO_PT16) return runHendelAccept();
    if (
      questId === QUEST_ID_STINKYS_ESCAPE_ALLIANCE ||
      questId === QUEST_ID_STINKYS_ESCAPE_HORDE
    ) {
      return runStinkyAccept(questId);
    }
    return [];
  }
  if (phase === 'frame' || phase === 'complete') {
    if (questId === QUEST_MISSING_DIPLO_PT14) return runSentryPointAt();
    return [];
  }
  return [];
}

// Map entries spread into QUEST_SCRIPT_REGISTRY (keeps registry.ts under 1500). next-batch.mjs also matches
// `family: 'kalimdor/dustwallow_marsh'` in registry.ts.
export const DUSTWALLOW_MARSH_REGISTRY: Record<
  string | number,
  DustwallowMarshQuestScriptEntry
> = {
  'kalimdor/dustwallow_marsh': {
    family: 'kalimdor/dustwallow_marsh',
    questIds: [
      QUEST_CHALLENGE_MOROKK,
      QUEST_ID_STINKYS_ESCAPE_ALLIANCE,
      QUEST_MISSING_DIPLO_PT14,
      QUEST_ID_STINKYS_ESCAPE_HORDE,
      QUEST_QUESTIONING,
      QUEST_MISSING_DIPLO_PT16,
    ],
    hooks: ['accept', 'frame', 'complete'],
    cite:
      'kalimdor/dustwallow_marsh.cpp:151–162,448–461,601–624,681–759,772–793',
    run: runDustwallowMarsh,
  },
  [QUEST_CHALLENGE_MOROKK]: {
    family: 'kalimdor/dustwallow_marsh',
    questId: QUEST_CHALLENGE_MOROKK,
    questIds: [QUEST_CHALLENGE_MOROKK],
    hooks: ['accept'],
    cite: 'dustwallow_marsh.cpp:151–162 QuestAccept_npc_morokk',
    run: runDustwallowMarsh,
  },
  [QUEST_ID_STINKYS_ESCAPE_ALLIANCE]: {
    family: 'kalimdor/dustwallow_marsh',
    questId: QUEST_ID_STINKYS_ESCAPE_ALLIANCE,
    questIds: [QUEST_ID_STINKYS_ESCAPE_ALLIANCE],
    hooks: ['accept'],
    cite: 'dustwallow_marsh.cpp:753–759 QuestAccept_npc_stinky_ignatz (Alliance)',
    run: runDustwallowMarsh,
  },
  [QUEST_MISSING_DIPLO_PT14]: {
    family: 'kalimdor/dustwallow_marsh',
    questId: QUEST_MISSING_DIPLO_PT14,
    questIds: [QUEST_MISSING_DIPLO_PT14],
    hooks: ['frame', 'complete'],
    cite: 'dustwallow_marsh.cpp:772–793 AreaTrigger_at_sentry_point residual',
    run: runDustwallowMarsh,
  },
  [QUEST_ID_STINKYS_ESCAPE_HORDE]: {
    family: 'kalimdor/dustwallow_marsh',
    questId: QUEST_ID_STINKYS_ESCAPE_HORDE,
    questIds: [QUEST_ID_STINKYS_ESCAPE_HORDE],
    hooks: ['accept'],
    cite: 'dustwallow_marsh.cpp:753–759 QuestAccept_npc_stinky_ignatz (Horde)',
    run: runDustwallowMarsh,
  },
  [QUEST_QUESTIONING]: {
    family: 'kalimdor/dustwallow_marsh',
    questId: QUEST_QUESTIONING,
    questIds: [QUEST_QUESTIONING],
    hooks: ['accept'],
    cite: 'dustwallow_marsh.cpp:448–461 QuestAccept_npc_ogron',
    run: runDustwallowMarsh,
  },
  [QUEST_MISSING_DIPLO_PT16]: {
    family: 'kalimdor/dustwallow_marsh',
    questId: QUEST_MISSING_DIPLO_PT16,
    questIds: [QUEST_MISSING_DIPLO_PT16],
    hooks: ['accept'],
    cite: 'dustwallow_marsh.cpp:601–624 QuestAccept_npc_private_hendel',
    run: runDustwallowMarsh,
  },
};
