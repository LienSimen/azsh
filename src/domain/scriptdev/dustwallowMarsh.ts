// Dustwallow Marsh ScriptDev IR ports. Source: scripts/kalimdor/dustwallow_marsh.cpp — Mok'Morokk,
// Ogron, Hendel, Stinky Ignatz, at_sentry_point and the Theramore spar controller.

import type { ScriptDevIR } from './types.ts';

// Shared tempfaction / stand / escort factions

/** Cite: Creature.h TEMPFACTION_RESTORE_RESPAWN=0x01 */
export const TEMPFACTION_RESTORE_RESPAWN = 0x01;
/** Cite: Creature.h TEMPFACTION_RESTORE_COMBAT_STOP=0x02 */
export const TEMPFACTION_RESTORE_COMBAT_STOP = 0x02;
/** Cite: Creature.h TEMPFACTION_TOGGLE_IMMUNE_TO_NPC=0x20 */
export const TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x20;

// FACTION_ESCORT_N_FRIEND_PASSIVE. Cite: ScriptDevAIMgr.h (escort faction); dustwallow_marsh.cpp:455 Ogron
export const FACTION_ESCORT_N_FRIEND_PASSIVE = 250;

/** FACTION_ESCORT_N_NEUTRAL_PASSIVE. Cite: ScriptDevAIMgr.h; dustwallow_marsh.cpp:687 Stinky */
export const FACTION_ESCORT_N_NEUTRAL_PASSIVE = 250;

/** UNIT_STAND_STATE_STAND. Cite: Unit.h; dustwallow_marsh.cpp:688 */
export const UNIT_STAND_STATE_STAND = 0;

// Constants — npc_morokk

// dustwallow_marsh.cpp:46–54
/** Cite: dustwallow_marsh.cpp:46 SAY_MOR_CHALLENGE = -1000499 */
export const SAY_MOR_CHALLENGE = -1_000_499;
/** Cite: dustwallow_marsh.cpp:47 SAY_MOR_SCARED = -1000500 */
export const SAY_MOR_SCARED = -1_000_500;

/** Cite: dustwallow_marsh.cpp:49 NPC_MOROKK = 4500 */
export const NPC_MOROKK = 4500;
/** Cite: dustwallow_marsh.cpp:50 QUEST_CHALLENGE_MOROKK = 1173 */
export const QUEST_CHALLENGE_MOROKK = 1173;

/** Cite: dustwallow_marsh.cpp:52 FACTION_MOR_HOSTILE = 168 */
export const FACTION_MOR_HOSTILE = 168;
/** Cite: dustwallow_marsh.cpp:53 FACTION_MOR_RUNNING = 35 */
export const FACTION_MOR_RUNNING = 35;
/** Cite: dustwallow_marsh.cpp:54 FACTION_MOR_SPAWN = 29 */
export const FACTION_MOR_SPAWN = 29;

/** Yield / explore credit HP%. Cite: dustwallow_marsh.cpp:122 GetHealthPercent() <= 30.0f */
export const MOROKK_YIELD_HP_PCT = 30;

// Player range gate while paused for challenge start. Cite: dustwallow_marsh.cpp:105 IsInRange(m_creature,
// 0, 70)
export const MOROKK_CHALLENGE_RANGE_YD = 70;

/** Pause waypoint. Cite: dustwallow_marsh.cpp:91 case 1 */
export const MOROKK_PAUSE_WP = 1;

// Constants — npc_ogron

// dustwallow_marsh.cpp:170–206
/** Cite: dustwallow_marsh.cpp:170 SAY_OGR_START = -1000452 */
export const SAY_OGR_START = -1_000_452;
/** Cite: dustwallow_marsh.cpp:171 SAY_OGR_SPOT = -1000453 */
export const SAY_OGR_SPOT = -1_000_453;
/** Cite: dustwallow_marsh.cpp:172 SAY_OGR_RET_WHAT = -1000454 */
export const SAY_OGR_RET_WHAT = -1_000_454;
/** Cite: dustwallow_marsh.cpp:173 SAY_OGR_RET_SWEAR = -1000455 */
export const SAY_OGR_RET_SWEAR = -1_000_455;
/** Cite: dustwallow_marsh.cpp:174 SAY_OGR_REPLY_RET = -1000456 */
export const SAY_OGR_REPLY_RET = -1_000_456;
/** Cite: dustwallow_marsh.cpp:175 SAY_OGR_RET_TAKEN = -1000457 */
export const SAY_OGR_RET_TAKEN = -1_000_457;
/** Cite: dustwallow_marsh.cpp:176 SAY_OGR_TELL_FIRE = -1000458 */
export const SAY_OGR_TELL_FIRE = -1_000_458;
/** Cite: dustwallow_marsh.cpp:177 SAY_OGR_RET_NOCLOSER = -1000459 */
export const SAY_OGR_RET_NOCLOSER = -1_000_459;
/** Cite: dustwallow_marsh.cpp:178 SAY_OGR_RET_NOFIRE = -1000460 */
export const SAY_OGR_RET_NOFIRE = -1_000_460;
/** Cite: dustwallow_marsh.cpp:179 SAY_OGR_RET_HEAR = -1000461 */
export const SAY_OGR_RET_HEAR = -1_000_461;
/** Cite: dustwallow_marsh.cpp:180 SAY_OGR_CAL_FOUND = -1000462 */
export const SAY_OGR_CAL_FOUND = -1_000_462;
/** Cite: dustwallow_marsh.cpp:181 SAY_OGR_CAL_MERCY = -1000463 */
export const SAY_OGR_CAL_MERCY = -1_000_463;
/** Cite: dustwallow_marsh.cpp:182 SAY_OGR_HALL_GLAD = -1000464 */
export const SAY_OGR_HALL_GLAD = -1_000_464;
/** Cite: dustwallow_marsh.cpp:183 EMOTE_OGR_RET_ARROW = -1000465 */
export const EMOTE_OGR_RET_ARROW = -1_000_465;
/** Cite: dustwallow_marsh.cpp:184 SAY_OGR_RET_ARROW = -1000466 */
export const SAY_OGR_RET_ARROW = -1_000_466;
/** Cite: dustwallow_marsh.cpp:185 SAY_OGR_CAL_CLEANUP = -1000467 */
export const SAY_OGR_CAL_CLEANUP = -1_000_467;
/** Cite: dustwallow_marsh.cpp:186 SAY_OGR_NODIE = -1000468 */
export const SAY_OGR_NODIE = -1_000_468;
/** Cite: dustwallow_marsh.cpp:187 SAY_OGR_SURVIVE = -1000469 */
export const SAY_OGR_SURVIVE = -1_000_469;
/** Cite: dustwallow_marsh.cpp:188 SAY_OGR_RET_LUCKY = -1000470 */
export const SAY_OGR_RET_LUCKY = -1_000_470;
/** Cite: dustwallow_marsh.cpp:189 SAY_OGR_THANKS = -1000471 */
export const SAY_OGR_THANKS = -1_000_471;

/** Cite: dustwallow_marsh.cpp:191 QUEST_QUESTIONING = 1273 */
export const QUEST_QUESTIONING = 1273;

/** Cite: dustwallow_marsh.cpp:193 FACTION_GENERIC_FRIENDLY = 35 */
export const FACTION_GENERIC_FRIENDLY = 35;
/** Cite: dustwallow_marsh.cpp:194 FACTION_THER_HOSTILE = 151 */
export const FACTION_THER_HOSTILE = 151;

/** Cite: dustwallow_marsh.cpp:196 NPC_REETHE = 4980 */
export const NPC_REETHE = 4980;
/** Cite: dustwallow_marsh.cpp:197 NPC_CALDWELL = 5046 */
export const NPC_CALDWELL = 5046;
/** Cite: dustwallow_marsh.cpp:198 NPC_HALLAN = 5045 */
export const NPC_HALLAN = 5045;
/** Cite: dustwallow_marsh.cpp:199 NPC_SKIRMISHER = 5044 */
export const NPC_SKIRMISHER = 5044;
/** Bound ScriptName creature. Cite: corpus / scriptdev2 */
export const NPC_OGRON = 4983;

/** Cite: dustwallow_marsh.cpp:201 SPELL_FAKE_SHOT = 7105 */
export const SPELL_FAKE_SHOT = 7105;

/** Cite: dustwallow_marsh.cpp:203–206 PHASE_* */
export const PHASE_INTRO = 0;
export const PHASE_GUESTS = 1;
export const PHASE_FIGHT = 2;
export const PHASE_COMPLETE = 3;

// Global dialogue timer initial + re-arm. Cite: dustwallow_marsh.cpp:230 m_uiGlobalTimer = 5000; :327 =
// 5000
export const OGRON_GLOBAL_TIMER_MS = 5000;

/** Guest TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN. Cite: dustwallow_marsh.cpp:359–362 300000 */
export const OGRON_GUEST_DESPAWN_MS = 300_000;

/** Spawn / move-to anchors. Cite: dustwallow_marsh.cpp:209–210 */
export const OGRON_SPAWN = {
  x: -3383.501953,
  y: -3203.383301,
  z: 36.149,
  cite: 'dustwallow_marsh.cpp:209 m_afSpawn',
} as const;
export const OGRON_MOVE_TO = {
  x: -3371.414795,
  y: -3212.179932,
  z: 34.21,
  cite: 'dustwallow_marsh.cpp:210 m_afMoveTo',
} as const;

/** Pause waypoint. Cite: dustwallow_marsh.cpp:277 case 12 */
export const OGRON_PAUSE_WP = 12;

// Ogron QuestAccept temp faction flags. Cite: dustwallow_marsh.cpp:455 TEMPFACTION_RESTORE_RESPAWN |
// TEMPFACTION_TOGGLE_IMMUNE_TO_NPC
export const OGRON_TEMP_FACTION_FLAGS =
  TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC;

// Constants — npc_private_hendel

// dustwallow_marsh.cpp:474–485
/** Cite: dustwallow_marsh.cpp:474 EMOTE_SURRENDER = -1000415 */
export const EMOTE_SURRENDER = -1_000_415;

/** Cite: dustwallow_marsh.cpp:476 QUEST_MISSING_DIPLO_PT16 = 1324 */
export const QUEST_MISSING_DIPLO_PT16 = 1324;
/** Cite: dustwallow_marsh.cpp:477 FACTION_HOSTILE = 168 */
export const FACTION_HOSTILE_HENDEL = 168;

/** Cite: dustwallow_marsh.cpp:479 NPC_SENTRY = 5184 */
export const NPC_SENTRY = 5184;
/** Cite: dustwallow_marsh.cpp:480 NPC_JAINA = 4968 */
export const NPC_JAINA = 4968;
/** Cite: dustwallow_marsh.cpp:481 NPC_TERVOSH = 4967 */
export const NPC_TERVOSH = 4967;
/** Cite: dustwallow_marsh.cpp:482 NPC_PAINED = 4965 */
export const NPC_PAINED = 4965;
/** Bound ScriptName creature. Cite: corpus */
export const NPC_PRIVATE_HENDEL = 4966;

/** Cite: dustwallow_marsh.cpp:484 SPELL_TELEPORT_VISUAL = 12980 */
export const SPELL_TELEPORT_VISUAL = 12980;
/** Cite: dustwallow_marsh.cpp:485 SPELL_TELEPORT = 7079 — GAP: absent spell-data */
export const SPELL_TELEPORT = 7079;

/** DamageTaken yield HP%. Cite: dustwallow_marsh.cpp:548 GetHealthPercent() < 20.0f */
export const HENDEL_YIELD_HP_PCT = 20;

// Sentry search / flee. Cite: dustwallow_marsh.cpp:563 GetCreatureListWithEntryInGrid 40.0f; :573
// ForcedDespawn(4000)
export const HENDEL_SENTRY_SEARCH_YD = 40;
export const HENDEL_SENTRY_DESPAWN_MS = 4000;

/** Cite: dustwallow_marsh.cpp:514 fSentryFleePoint */
export const HENDEL_SENTRY_FLEE = {
  x: -2917.56,
  y: -3329.9,
  z: 30.37,
  cite: 'dustwallow_marsh.cpp:514 fSentryFleePoint',
} as const;

/** Outro TEMPSPAWN_TIMED_DESPAWN 3 minutes. Cite: dustwallow_marsh.cpp:580 3 * MINUTE * IN_MILLISECONDS */
export const HENDEL_OUTRO_DESPAWN_MS = 3 * 60 * 1000;

/** Outro spawns. Cite: dustwallow_marsh.cpp:495–512 */
export const HENDEL_OUTRO_SPAWNS = [
  {
    entry: NPC_TERVOSH,
    x: -2857.604492,
    y: -3354.784912,
    z: 35.36964,
    o: 3.16604,
    destX: -2881.546631,
    destY: -3346.477539,
    destZ: 34.143719,
    cite: 'dustwallow_marsh.cpp:497-501',
  },
  {
    entry: NPC_JAINA,
    x: -2858.120117,
    y: -3358.469971,
    z: 36.0863,
    o: 3.16604,
    destX: -2879.697998,
    destY: -3347.789063,
    destZ: 34.772892,
    cite: 'dustwallow_marsh.cpp:502-506',
  },
  {
    entry: NPC_PAINED,
    x: -2857.379883,
    y: -3351.370117,
    z: 34.178001,
    o: 3.16604,
    destX: -2879.959961,
    destY: -3344.469971,
    destZ: 34.670502,
    cite: 'dustwallow_marsh.cpp:507-511',
  },
] as const;

// QuestAccept temp faction flags. Cite: dustwallow_marsh.cpp:605 TEMPFACTION_RESTORE_COMBAT_STOP |
// TEMPFACTION_RESTORE_RESPAWN
export const HENDEL_TEMP_FACTION_FLAGS =
  TEMPFACTION_RESTORE_COMBAT_STOP | TEMPFACTION_RESTORE_RESPAWN;

// Constants — npc_stinky_ignatz

// dustwallow_marsh.cpp:638–656
/** Cite: dustwallow_marsh.cpp:638 QUEST_ID_STINKYS_ESCAPE_ALLIANCE = 1222 */
export const QUEST_ID_STINKYS_ESCAPE_ALLIANCE = 1222;
/** Cite: dustwallow_marsh.cpp:639 QUEST_ID_STINKYS_ESCAPE_HORDE = 1270 */
export const QUEST_ID_STINKYS_ESCAPE_HORDE = 1270;

/** Cite: dustwallow_marsh.cpp:641 SAY_STINKY_BEGIN = -1000958 */
export const SAY_STINKY_BEGIN = -1_000_958;
/** Cite: dustwallow_marsh.cpp:642 SAY_STINKY_FIRST_STOP = -1000959 */
export const SAY_STINKY_FIRST_STOP = -1_000_959;
/** Cite: dustwallow_marsh.cpp:643 SAY_STINKY_SECOND_STOP = -1001141 */
export const SAY_STINKY_SECOND_STOP = -1_001_141;
/** Cite: dustwallow_marsh.cpp:644 SAY_STINKY_THIRD_STOP_1 = -1001142 */
export const SAY_STINKY_THIRD_STOP_1 = -1_001_142;
/** Cite: dustwallow_marsh.cpp:645 SAY_STINKY_THIRD_STOP_2 = -1001143 */
export const SAY_STINKY_THIRD_STOP_2 = -1_001_143;
/** Cite: dustwallow_marsh.cpp:646 SAY_STINKY_THIRD_STOP_3 = -1001144 */
export const SAY_STINKY_THIRD_STOP_3 = -1_001_144;
/** Cite: dustwallow_marsh.cpp:647 SAY_STINKY_PLANT_GATHERED = -1001145 */
export const SAY_STINKY_PLANT_GATHERED = -1_001_145;
/** Cite: dustwallow_marsh.cpp:648 SAY_STINKY_END = -1000962 */
export const SAY_STINKY_END = -1_000_962;
/** Cite: dustwallow_marsh.cpp:649 SAY_STINKY_END_EMOTE = -1010032 */
export const SAY_STINKY_END_EMOTE = -1_010_032;
/** Cite: dustwallow_marsh.cpp:650 SAY_STINKY_AGGRO_1 = -1000960 */
export const SAY_STINKY_AGGRO_1 = -1_000_960;
/** Cite: dustwallow_marsh.cpp:651 SAY_STINKY_AGGRO_2 = -1000961 */
export const SAY_STINKY_AGGRO_2 = -1_000_961;
/** Cite: dustwallow_marsh.cpp:652 SAY_STINKY_AGGRO_3 = -1001146 */
export const SAY_STINKY_AGGRO_3 = -1_001_146;
/** Cite: dustwallow_marsh.cpp:653 SAY_STINKY_AGGRO_4 = -1001147 */
export const SAY_STINKY_AGGRO_4 = -1_001_147;

/** Cite: dustwallow_marsh.cpp:655 GO_BOGBEAN_PLANT = 20939 */
export const GO_BOGBEAN_PLANT = 20939;
/** Bound ScriptName. Cite: corpus */
export const NPC_STINKY_IGNATZ = 4880;

/** Explore credit waypoint. Cite: dustwallow_marsh.cpp:723 case 40 */
export const STINKY_CREDIT_WP = 40;

/** Cite: dustwallow_marsh.cpp:650–653 aggro text pool */
export const STINKY_AGGRO_TEXTS = [
  SAY_STINKY_AGGRO_1,
  SAY_STINKY_AGGRO_2,
  SAY_STINKY_AGGRO_3,
  SAY_STINKY_AGGRO_4,
] as const;

// Constants — at_sentry_point

// dustwallow_marsh.cpp:767–769
/** Cite: dustwallow_marsh.cpp:767 QUEST_MISSING_DIPLO_PT14 = 1265 */
export const QUEST_MISSING_DIPLO_PT14 = 1265;
/** Cite: dustwallow_marsh.cpp:768 SPELL_TELEPORT_VISUAL_2 = 799 — GAP: absent spell-data */
export const SPELL_TELEPORT_VISUAL_2 = 799;
/** Cite: dustwallow_marsh.cpp:769 NPC_SENTRY_POINT_GUARD = 5085 */
export const NPC_SENTRY_POINT_GUARD = 5085;

// Tervosh proximity / summon / despawn. Cite: dustwallow_marsh.cpp:778 100.0f; :780 TEMPSPAWN_TIMED_DESPAWN
// 60000
export const SENTRY_POINT_TERVOSH_SEARCH_YD = 100;
export const SENTRY_POINT_TERVOSH_DESPAWN_MS = 60_000;
export const SENTRY_POINT_TERVOSH_SPAWN = {
  x: -3476.51,
  y: -4105.94,
  z: 17.1,
  o: 5.3816,
  cite: 'dustwallow_marsh.cpp:780 SummonCreature NPC_TERVOSH',
} as const;

/** Guard salute radius. Cite: dustwallow_marsh.cpp:784 15.0f */
export const SENTRY_POINT_GUARD_SEARCH_YD = 15;

// Constants — npc_theramore_spar_controller

// dustwallow_marsh.cpp:801–853
/** Cite: dustwallow_marsh.cpp:801 NPC_GUARD_NARRISHA = 5093 */
export const NPC_GUARD_NARRISHA = 5093;
/** Cite: dustwallow_marsh.cpp:802 NPC_GUARD_KAHIL = 5091 */
export const NPC_GUARD_KAHIL = 5091;
/** Cite: dustwallow_marsh.cpp:803 NPC_GUARD_EDWARD = 4922 */
export const NPC_GUARD_EDWARD = 4922;
/** Cite: dustwallow_marsh.cpp:804 NPC_GUARD_TARK = 5094 */
export const NPC_GUARD_TARK = 5094;
/** Cite: dustwallow_marsh.cpp:805 NPC_GUARD_LANA = 5092 */
export const NPC_GUARD_LANA = 5092;
/** Cite: dustwallow_marsh.cpp:806 NPC_GUARD_JARAD = 4923 */
export const NPC_GUARD_JARAD = 4923;

/** Cite: dustwallow_marsh.cpp:808 NPC_MEDIC_HELAINA = 5200 */
export const NPC_MEDIC_HELAINA = 5200;
/** Cite: dustwallow_marsh.cpp:809 NPC_MEDIC_TAMBERLYN = 5199 */
export const NPC_MEDIC_TAMBERLYN = 5199;

/** Cite: dustwallow_marsh.cpp:811 NPC_MASTER_SZIGETI = 5090 */
export const NPC_MASTER_SZIGETI = 5090;
/** Cite: dustwallow_marsh.cpp:812 NPC_MASTER_CRITON = 4924 */
export const NPC_MASTER_CRITON = 4924;

/** Cite: dustwallow_marsh.cpp:814 NPC_BLUE_CAPTAIN = 5096 */
export const NPC_BLUE_CAPTAIN = 5096;
/** Cite: dustwallow_marsh.cpp:815 NPC_RED_CAPTAIN = 5095 */
export const NPC_RED_CAPTAIN = 5095;

/** Cite: dustwallow_marsh.cpp:817 SPELL_FIRST_AID = 7162 — GAP: absent spell-data */
export const SPELL_FIRST_AID = 7162;

/** Cite: dustwallow_marsh.cpp:819 BLUE_TEAM = 1621 */
export const BLUE_TEAM = 1621;
/** Cite: dustwallow_marsh.cpp:820 RED_TEAM = 1622 */
export const RED_TEAM = 1622;

/** Cite: dustwallow_marsh.cpp:822 FACTION_THERAMORE_FRIENDLY = 151 */
export const FACTION_THERAMORE_FRIENDLY = 151;

/** Broadcast texts. Cite: dustwallow_marsh.cpp:824–853 */
export const SAY_RED_WINNER = 1794;
export const SAY_BLUE_WINNER = 1795;
export const SAY_RED_WINNER_OVERALL = 1773;
export const SAY_BLUE_WINNER_OVERALL = 1774;
export const SAY_BACK_TO_CORNERS = 1636;
export const SAY_FOR_THE_RED = 1778;
export const SAY_FOR_THE_BLUE = 1777;
export const SAY_FIRST_COMBATANTS = 1771;
export const SAY_FIGHT_INTRO = 1643;
export const SAY_FIGHT_START = 1641;

/** Blue team roster. Cite: dustwallow_marsh.cpp:877 */
export const THERAMORE_BLUE_TEAM = [
  NPC_GUARD_EDWARD,
  NPC_GUARD_KAHIL,
  NPC_GUARD_NARRISHA,
] as const;
/** Red team roster. Cite: dustwallow_marsh.cpp:878 */
export const THERAMORE_RED_TEAM = [
  NPC_GUARD_JARAD,
  NPC_GUARD_LANA,
  NPC_GUARD_TARK,
] as const;

/** Combatant search radius. Cite: dustwallow_marsh.cpp:909/919 GetClosestCreatureWithEntry 20.f */
export const SPAR_COMBATANT_SEARCH_YD = 20;

/** HP yield for spar round end. Cite: dustwallow_marsh.cpp:942 redHealth <= 30 || blueHealth <= 30 */
export const SPAR_YIELD_HP_PCT = 30;

// CombatAI custom action timers (sourced). Cite: dustwallow_marsh.cpp:888–894 ctor AddCustomAction delays
export const SPAR_GET_ALL_MS = 2000;
export const SPAR_START_POSITION_MS = 10_000;
export const SPAR_CHECK_HP_MS = 1000;
export const SPAR_WIN_DELAY_MS = 100;
export const SPAR_SALUTE_TO_INTRO_MS = 3000;
export const SPAR_INTRO_TO_START_MS = 3000;
export const SPAR_SEPARATE_TO_SWITCH_MS = 5000;
export const SPAR_SWITCH_TO_POSITION_MS = 5000;
export const SPAR_OVERALL_RESET_MS = 20_000;
export const SPAR_MOTIVATION_MS = 8000;
export const SPAR_MOVE_TO_SALUTE_MS = 5000;

/** Starting positions. Cite: dustwallow_marsh.cpp:872–875 */
export const SPAR_STARTING_POSITIONS = {
  [BLUE_TEAM]: {
    x: -3643.574707,
    y: -4505.717773,
    z: 9.462863,
    o: 3.855592,
  },
  [RED_TEAM]: {
    x: -3652.405273,
    y: -4514.126953,
    z: 9.462863,
    o: 0.717925,
  },
} as const;

// ---------------------------------------------------------------------------

// Pure helpers (re-export for consumers / tests)

export {
  morokkQuestAccept,
  morokkPausedOoc,
  morokkLowHp,
  morokkReachedHome,
  ogronQuestAccept,
  ogronWaypointReached,
  ogronPhaseStep,
  ogronResetPhaseAfterFight,
  hendelQuestAccept,
  hendelDamageTaken,
  hendelSpellHit,
  stinkyQuestAccept,
  stinkyStartEscort,
  stinkyWaypointReached,
  stinkyCreditQuestId,
  stinkyAggroText,
  sentryPointAreaTrigger,
  sparCheckCombatantHp,
  sparHandleWin,
} from './dustwallowMarshHelpers.ts';
export type {
  MorokkQuestAcceptResult,
  MorokkPausedOocResult,
  MorokkLowHpResult,
  MorokkReachedHomeResult,
  OgronQuestAcceptResult,
  OgronWaypointResult,
  OgronPhaseStepResult,
  HendelQuestAcceptResult,
  HendelDamageTakenResult,
  HendelSpellHitResult,
  StinkyQuestAcceptResult,
  StinkyStartEscortResult,
  StinkyWaypointResult,
  SentryPointAtResult,
  SparHpCheckResult,
  SparWinBroadcastResult,
} from './dustwallowMarshHelpers.ts';

// ScriptDev IR — npc_morokk
// ---------------------------------------------------------------------------

// Cite: dustwallow_marsh.cpp:40–162 npc_morokkAI Binding: creature 4500 Overlord Mok'Morokk ScriptName
// npc_morokk. No combat cast timers — escort pause challenge + DamageTaken-style HP yield.
export const NPC_MOROKK_SCRIPT: ScriptDevIR = {
  name: 'npc_morokk',
  boundCreatures: [NPC_MOROKK],
  sourceFile: 'kalimdor/dustwallow_marsh.cpp',
  spellIds: [],
  timers: [],
  phases: [
    {
      phase: 1,
      hpBelowPct: MOROKK_YIELD_HP_PCT,
      actions: [
        {
          kind: 'yell',
          textId: SAY_MOR_SCARED,
          cite: 'dustwallow_marsh.cpp:136 DoScriptText SAY_MOR_SCARED',
        },
        {
          kind: 'quest_credit',
          entry: QUEST_CHALLENGE_MOROKK,
          cite: 'dustwallow_marsh.cpp:129 RewardPlayerAndGroupAtEventExplored(1173)',
        },
        {
          kind: 'stop_combat',
          cite: 'dustwallow_marsh.cpp:132 CombatStop(true)',
        },
        {
          kind: 'flavor',
          text: 'FACTION_MOR_RUNNING 35 + success + immune + REACT_PASSIVE + unpause escort',
          cite: 'dustwallow_marsh.cpp:129-135; morokkLowHp pure helper',
        },
      ],
      cite: 'dustwallow_marsh.cpp:122 GetHealthPercent() <= 30.0f while STATE_ESCORT_PAUSED',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'npc_morokkAI Reset empty; JustRespawned sets FACTION_MOR_SPAWN 29',
        cite: 'dustwallow_marsh.cpp:67 Reset; :69-73 JustRespawned',
      },
    ],
  },
  cites: [
    'dustwallow_marsh.cpp:40-162 npc_morokk',
    'dustwallow_marsh.cpp:46-54 SAY/quest/faction constants',
    'dustwallow_marsh.cpp:87-95 WP1 pause',
    'dustwallow_marsh.cpp:97-143 UpdateEscortAI challenge + ≤30% yield',
    'dustwallow_marsh.cpp:151-162 QuestAccept Start(true)',
  ],
};

// ScriptDev IR — npc_ogron

// Cite: dustwallow_marsh.cpp:164–466 npc_ogronAI Binding: creature 4983 Ogron. Melee escort; dialogue +
// guest summons pure helpers. Fake Shot 7105 resolves (0-effect visual). Reethe/guest NPCs ABSENT bake.
export const NPC_OGRON_SCRIPT: ScriptDevIR = {
  name: 'npc_ogron',
  boundCreatures: [NPC_OGRON],
  sourceFile: 'kalimdor/dustwallow_marsh.cpp',
  spellIds: [SPELL_FAKE_SHOT],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'm_uiGlobalTimer=5000; if paused+FIGHT → PHASE_COMPLETE; clear list when not escorting',
        cite: 'dustwallow_marsh.cpp:228-240',
      },
    ],
  },
  unusedBindings: [
    {
      entry: NPC_REETHE,
      kind: 'creature',
      reason:
        'NPC 4980 Reethe is dialogue/LOS target for escort 1273; absent from product bake - IR ported',
      cite: 'dustwallow_marsh.cpp:196,243-246; loadRealBundle missing 4980',
    },
    {
      entry: NPC_CALDWELL,
      kind: 'creature',
      reason:
        'NPC 5046 Lieutenant Caldwell is escort guest summon; absent from bake',
      cite: 'dustwallow_marsh.cpp:197,359; loadRealBundle missing 5046',
    },
    {
      entry: NPC_HALLAN,
      kind: 'creature',
      reason:
        'NPC 5045 Private Hallan casts Fake Shot 7105 on Reethe; absent from bake',
      cite: 'dustwallow_marsh.cpp:198,360,387; loadRealBundle missing 5045',
    },
    {
      entry: NPC_SKIRMISHER,
      kind: 'creature',
      reason:
        'NPC 5044 Theramore Skirmisher ×2 guest summons; absent from bake',
      cite: 'dustwallow_marsh.cpp:199,361-362; loadRealBundle missing 5044',
    },
  ],
  cites: [
    'dustwallow_marsh.cpp:164-466 npc_ogron',
    'dustwallow_marsh.cpp:170-206 texts/quest/NPC/SPELL_FAKE_SHOT=7105/phases',
    'dustwallow_marsh.cpp:228-230 Reset GlobalTimer 5000',
    'dustwallow_marsh.cpp:265-280 WP10-12',
    'dustwallow_marsh.cpp:319-445 phase dialogue + summons + fight + credit 1273',
    'dustwallow_marsh.cpp:448-461 QuestAccept',
  ],
};

// ScriptDev IR — npc_private_hendel

// Cite: dustwallow_marsh.cpp:468–629 npc_private_hendelAI Binding: creature 4966 Private Hendel. Yield <20%
// → surrender + outro. SpellHit 7079 credit GAP (spell dead); 12980 visual resolves.
export const NPC_PRIVATE_HENDEL_SCRIPT: ScriptDevIR = {
  name: 'npc_private_hendel',
  boundCreatures: [NPC_PRIVATE_HENDEL],
  sourceFile: 'kalimdor/dustwallow_marsh.cpp',
  spellIds: [SPELL_TELEPORT_VISUAL, SPELL_TELEPORT],
  timers: [],
  phases: [
    {
      phase: 1,
      hpBelowPct: HENDEL_YIELD_HP_PCT,
      actions: [
        {
          kind: 'yell',
          textId: EMOTE_SURRENDER,
          cite: 'dustwallow_marsh.cpp:558 DoScriptText EMOTE_SURRENDER',
        },
        {
          kind: 'stop_combat',
          cite: 'dustwallow_marsh.cpp:559 EnterEvadeMode',
        },
        {
          kind: 'summon',
          creatureEntry: NPC_TERVOSH,
          cite: 'dustwallow_marsh.cpp:578-594 SummonCreature Tervosh + Jaina + Pained',
        },
        {
          kind: 'flavor',
          text: 'store player for SpellHit 7079 credit; sentry flee+despawn 4000; cast 12980 on outro',
          cite: 'dustwallow_marsh.cpp:550-595; hendelDamageTaken pure helper',
        },
      ],
      cite: 'dustwallow_marsh.cpp:548 damage>health OR GetHealthPercent() < 20.0f',
    },
  ],
  spellHits: [
    {
      spellId: SPELL_TELEPORT,
      playerCaster: false,
      actions: [
        {
          kind: 'quest_credit',
          entry: QUEST_MISSING_DIPLO_PT16,
          cite: 'dustwallow_marsh.cpp:541-542 RewardPlayerAndGroupAtEventExplored(1324)',
        },
      ],
      cite: 'dustwallow_marsh.cpp:535-544 SpellHit SPELL_TELEPORT=7079 (GAP: spell absent spell-data)',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'npc_private_hendelAI Reset empty; AttackedBy starts if no victim',
        cite: 'dustwallow_marsh.cpp:520 Reset; :524-533 AttackedBy',
      },
    ],
  },
  unusedBindings: [
    {
      entry: NPC_PAINED,
      kind: 'creature',
      reason:
        'NPC 4965 Pained is Hendel outro summon; absent from product bake - IR ported',
      cite: 'dustwallow_marsh.cpp:482,507-511; loadRealBundle missing 4965',
    },
  ],
  cites: [
    'dustwallow_marsh.cpp:468-629 npc_private_hendel',
    'dustwallow_marsh.cpp:474-485 EMOTE/quest/faction/NPC/SPELL 12980+7079',
    'dustwallow_marsh.cpp:495-514 outro spawns + sentry flee',
    'dustwallow_marsh.cpp:535-598 SpellHit + DamageTaken',
    'dustwallow_marsh.cpp:601-624 QuestAccept',
  ],
};

// ScriptDev IR — npc_stinky_ignatz

// Cite: dustwallow_marsh.cpp:631–759 npc_stinky_ignatzAI Binding: creature 4880 "Stinky" Ignatz. Escort
// 1222/1270; no cast timers.
export const NPC_STINKY_IGNATZ_SCRIPT: ScriptDevIR = {
  name: 'npc_stinky_ignatz',
  boundCreatures: [NPC_STINKY_IGNATZ],
  sourceFile: 'kalimdor/dustwallow_marsh.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {
    onAggro: [
      {
        kind: 'flavor',
        text: 'random SAY_STINKY_AGGRO_1..4 (urand 0..3)',
        cite: 'dustwallow_marsh.cpp:670-678; stinkyAggroText pure helper',
      },
    ],
    onReset: [
      {
        kind: 'flavor',
        text: 'Reset empty; ctor REACT_DEFENSIVE',
        cite: 'dustwallow_marsh.cpp:662 SetReactState DEFENSIVE; :668 Reset',
      },
    ],
  },
  cites: [
    'dustwallow_marsh.cpp:631-759 npc_stinky_ignatz',
    'dustwallow_marsh.cpp:638-655 quests/texts/GO_BOGBEAN_PLANT=20939',
    'dustwallow_marsh.cpp:681-689 ReceiveAIEvent START_ESCORT',
    'dustwallow_marsh.cpp:692-745 WaypointReached/Start plant gather + credit WP40',
    'dustwallow_marsh.cpp:753-759 QuestAccept 1222/1270',
  ],
};

// ScriptDev IR — at_sentry_point

// Cite: dustwallow_marsh.cpp:761–793 AreaTrigger_at_sentry_point No creature ScriptName binding — area
// trigger only. Quest 1265 residual. Spell 799 GAP (visual).
export const AT_SENTRY_POINT: ScriptDevIR = {
  name: 'at_sentry_point',
  boundCreatures: [],
  sourceFile: 'kalimdor/dustwallow_marsh.cpp',
  spellIds: [SPELL_TELEPORT_VISUAL_2],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'AreaTrigger: incomplete 1265 + alive → summon Tervosh if absent + cast 799 + guard salute',
        cite: 'dustwallow_marsh.cpp:772-793; sentryPointAreaTrigger pure helper',
      },
    ],
  },
  cites: [
    'dustwallow_marsh.cpp:761-793 at_sentry_point',
    'dustwallow_marsh.cpp:767-769 QUEST_1265 SPELL_799 NPC_5085',
    'dustwallow_marsh.cpp:778-788 summon Tervosh coords + visual + guard',
  ],
};

// ScriptDev IR — npc_theramore_spar_controller

// npc_theramore_spar_controller on creature 5090, an ambient red/blue spar. The HP gate and win
// broadcasts are pure helpers; 7162 is a GAP and Guard Kahil 5091 is absent from bake.
export const NPC_THERAMORE_SPAR_CONTROLLER_SCRIPT: ScriptDevIR = {
  name: 'npc_theramore_spar_controller',
  boundCreatures: [NPC_MASTER_SZIGETI],
  sourceFile: 'kalimdor/dustwallow_marsh.cpp',
  spellIds: [SPELL_FIRST_AID],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'CombatAI: GET_ALL 2000 → START_POSITION 10000 → salute/intro/spar/CHECK_HP 1000 loop',
        cite: 'dustwallow_marsh.cpp:882-895 ctor custom actions',
      },
    ],
  },
  unusedBindings: [
    {
      entry: NPC_GUARD_KAHIL,
      kind: 'creature',
      reason:
        'NPC 5091 Guard Kahil is blue-team spar combatant; absent from product bake - IR roster still lists entry',
      cite: 'dustwallow_marsh.cpp:802,877; loadRealBundle missing 5091',
    },
  ],
  cites: [
    'dustwallow_marsh.cpp:795-1221 npc_theramore_spar_controller',
    'dustwallow_marsh.cpp:801-853 NPC/team/SPELL_FIRST_AID=7162/texts',
    'dustwallow_marsh.cpp:872-878 startingPositions + team rosters',
    'dustwallow_marsh.cpp:888-894 custom action arm times',
    'dustwallow_marsh.cpp:933-963 CheckCombatantHP <=30 + First Aid',
    'dustwallow_marsh.cpp:965-1220 win/switch/salute/intro/start/move',
  ],
};

