// QI4 — kalimdor/ashenvale residuals, extracted so the registry map stays under the 1500-line
// ratchet. Quests 976, 6482, 6544 and 6641. Cite: kalimdor/ashenvale.cpp.

import type { DbScriptIntent } from './types.ts';
import { UNIT_STAND_STATE_STAND } from './opcodes.ts';

/** Matches registry.ts QuestScriptHook — local to avoid circular import. */
type QuestScriptHook = 'accept' | 'reward' | 'complete' | 'frame';

/** Minimal registry entry shape (mirrors registry.ts QuestScriptEntry). */
export interface AshenvaleQuestScriptEntry {
  family?: string;
  questId?: number;
  questIds?: number[];
  hooks?: QuestScriptHook[];
  run?: (phase: QuestScriptHook, questId: number) => DbScriptIntent[];
  cite?: string;
}

// ── sourced constants ────────────────────────────────────────────────────────

// Cite: ashenvale.cpp:55 QUEST_VORSHA = 6641 Escort Muglash to the naga brazier; defend waves; kill Vorsha.
export const QUEST_VORSHA = 6641;
// Cite: ashenvale.cpp:388 QUEST_FREEDOM_TO_RUUL = 6482 Escort Ruul Snowhoof out of Thistlefur Hold
// ambushes.
export const QUEST_FREEDOM_TO_RUUL = 6482;
// Cite: ashenvale.cpp:499 QUEST_TOREK_ASSULT = 6544 Escort Torek's Assault on Silverwing Outpost (spelling
// from C++).
export const QUEST_TOREK_ASSULT = 6544;
// Cite: ashenvale.cpp:617 QUEST_SUPPLIES_TO_AUBERDINE = 976 Escort Feero Ironhand through Dark Strand
// ambushes to Auberdine road.
export const QUEST_SUPPLIES_TO_AUBERDINE = 976;

/** Cite: ashenvale.cpp:61 NPC_MUGLASH = 12717 Bake starterCreatureEntries quest 6641. */
const NPC_MUGLASH = 12717;
/** Cite: bake enderCreatureEntries quest 6641 — Warsong Runner (12863). */
const NPC_WARSONG_RUNNER = 12863;
/** Cite: ashenvale.cpp:56 MUGLASH_ESCORT_PATH = 12717 Path id passed to npc_escortAI::Start on accept. */
const MUGLASH_ESCORT_PATH = 12717;
// Cite: ashenvale.cpp:59 GO_NAGA_BRAZIER = 178247 Player uses brazier mid-escort → AI_EVENT_CUSTOM_A waves
// (FO6).
const GO_NAGA_BRAZIER = 178247;
// Cite: ashenvale.cpp:57 SPELL_MUGLASH_WAITING = 20861 Cast while waiting for brazier use; removed on GO
// use.
const SPELL_MUGLASH_WAITING = 20861;
/** Cite: ashenvale.cpp:74 NPC_VORSHA = 12940 Final wave boss after second naga wave dies. */
const NPC_VORSHA = 12940;
/** Cite: ashenvale.cpp:64–71 wave NPC entries (FO6 combat summons). */
const NPC_WRATH_RIDER = 3713;
const NPC_WRATH_SORCERESS = 3717;
const NPC_WRATH_RAZORTAIL = 3712;
const NPC_WRATH_PRIESTESS = 3944;
const NPC_WRATH_MYRMIDON = 3711;
const NPC_WRATH_SEAWITCH = 3715;
/** Cite: ashenvale.cpp:43–53 broadcast_text ids on Muglash event. */
const SAY_MUGLASH_AGGRO = 8412;
const SAY_MUGLASH_BRAZIER = 8556;
const SAY_MUGLASH_FAIL = 8409;
const SAY_MUGLASH_EVENT_01 = 8410;
const SAY_MUGLASH_EVENT_02 = 8413;
const SAY_MUGLASH_EVENT_03 = 8567;
const SAY_MUGLASH_EVENT_04 = 8568;
const SAY_MUGLASH_SUCCESS = 8569;
const SAY_MUGLASH_SUCCESS_02 = 8558;
const SAY_MUGLASH_SUCCESS_03 = 8564;
const SAY_MUGLASH_SUCCESS_04 = 8565;
/** Cite: ashenvale.cpp:273 ResetTimer(MUGLASH_FAIL, 300000) — 5 min brazier fail. */
const MUGLASH_FAIL_TIMER_MS = 300000;
/** Cite: ashenvale.cpp:222,234 TEMPSPAWN_TIMED_OOC_DESPAWN 60000 wave despawn. */
const MUGLASH_WAVE_DESPAWN_MS = 60000;
/** Cite: ashenvale.cpp:350 ForcedDespawn(14000) after event End(). */
const MUGLASH_DESPAWN_MS = 14000;

/** Cite: bake starterCreatureEntries quest 6482 — Ruul Snowhoof (12818). */
const NPC_RUUL_SNOWHOOF = 12818;
/** Cite: bake enderCreatureEntries quest 6482 — Yama Snowhoof (12837). */
const NPC_YAMA_SNOWHOOF = 12837;
/** Cite: ashenvale.cpp:389–391 ambush entries. */
const NPC_T_AVENGER = 3925;
const NPC_T_SHAMAN = 3924;
const NPC_T_PATHFINDER = 3926;
// Cite: ashenvale.cpp:392 SPELL_RUUL_SHAPECHANGE = 20514 Reset() bear form; removed at WP32 before explore
// credit.
const SPELL_RUUL_SHAPECHANGE = 20514;
/** Cite: ashenvale.cpp:393 SAY_RUUL_COMPLETE = -1010022 WP33 DoScriptText after explore credit. */
const SAY_RUUL_COMPLETE = -1010022;
/** Cite: ashenvale.cpp:419 TEMPSPAWN_DEAD_DESPAWN, 60 * IN_MILLISECONDS */
const RUUL_AMBUSH_DESPAWN_MS = 60000;

/** Cite: bake starterCreatureEntries quest 6544 — Torek (12858). */
const NPC_TOREK = 12858;
/** Cite: bake enderCreatureEntries quest 6544 — Ertog Ragetusk (12877). */
const NPC_ERTOG_RAGETUSK = 12877;
/** Cite: ashenvale.cpp:490–494 SAY_* for Torek escort. */
const SAY_READY = -1000106;
const SAY_MOVE = -1000107;
const SAY_PREPARE = -1000108;
const SAY_WIN = -1000109;
const SAY_END = -1000110;
/** Cite: ashenvale.cpp:501–504 fight NPCs at WP20. */
const NPC_SPLINTERTREE_RAIDER = 12859;
const NPC_DURIEL = 12860;
const NPC_SILVERWING_SENTINEL = 12896;
const NPC_SILVERWING_WARRIOR = 12897;
/** Cite: ashenvale.cpp:496–497 combat spells (FO6 UpdateEscortAI). */
const SPELL_REND = 11977;
const SPELL_THUNDERCLAP = 8078;
/** Cite: ashenvale.cpp:537–539 TEMPSPAWN_TIMED_OOC_DESPAWN 25000. */
const TOREK_SUMMON_DESPAWN_MS = 25000;

/** Cite: bake starterCreatureEntries quest 976 — Feero Ironhand (4484). */
const NPC_FEERO_IRONHAND = 4484;
/** Cite: bake enderCreatureEntries quest 976 — Delgren the Purifier (3663). */
const NPC_DELGREN_THE_PURIFIER = 3663;
/** Cite: ashenvale.cpp:606–615 SAY_* for Feero escort. */
const SAY_QUEST_START = -1000771;
const SAY_FIRST_AMBUSH_START = -1000772;
const SAY_FIRST_AMBUSH_END = -1000773;
const SAY_SECOND_AMBUSH_START = -1000774;
const SAY_SCOUT_SECOND_AMBUSH = -1000775;
const SAY_SECOND_AMBUSH_END = -1000776;
const SAY_FINAL_AMBUSH_START = -1000777;
const SAY_BALIZAR_FINAL_AMBUSH = -1000778;
const SAY_FINAL_AMBUSH_ATTACK = -1000779;
const SAY_QUEST_END = -1000780;
/** Cite: ashenvale.cpp:619–624 ambush NPC entries. */
const NPC_DARK_STRAND_ASSASSIN = 3879;
const NPC_FORSAKEN_SCOUT = 3893;
const NPC_ALIGAR_THE_TORMENTOR = 3898;
const NPC_BALIZAR_THE_UMBRAGE = 3899;
const NPC_CAEDAKAR_THE_VICIOUS = 3900;
/** Cite: ashenvale.cpp:685–687,716 TEMPSPAWN_TIMED_OOC_DESPAWN 20000. */
const FEERO_SUMMON_DESPAWN_MS = 20000;

// Cite: ScriptDevAIMgr.h:45 FACTION_ESCORT_H_NEUTRAL_PASSIVE = 33 Muglash + Ruul SetFactionTemporary on
// accept.
const FACTION_ESCORT_H_NEUTRAL_PASSIVE = 33;
/** Cite: ScriptDevAIMgr.h:44 FACTION_ESCORT_A_NEUTRAL_PASSIVE = 10 Feero SetFactionTemporary on accept. */
const FACTION_ESCORT_A_NEUTRAL_PASSIVE = 10;
/** Cite: Creature.h:577 TEMPFACTION_RESTORE_RESPAWN = 0x01 */
const TEMPFACTION_RESTORE_RESPAWN = 0x01;
/** Cite: Creature.h:581 TEMPFACTION_TOGGLE_IMMUNE_TO_PLAYER = 0x10 */
const TEMPFACTION_TOGGLE_IMMUNE_TO_PLAYER = 0x10;
/** Cite: Creature.h:582 TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x20 */
const TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x20;
// Cite: ashenvale.cpp:470 TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_PLAYER = 0x01 | 0x10 =
// 0x11
const RUUL_TEMP_FACTION_FLAGS =
  TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_PLAYER;
// Cite: ashenvale.cpp:768 TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x01 | 0x20 =
// 0x21
const FEERO_TEMP_FACTION_FLAGS =
  TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC;
/** Cite: Unit.h:97 UNIT_STAND_STATE_STAND = 0 Ruul SetStandState on accept (often sits in cage). */
const UNIT_STAND_STATE_STAND_RUUL = UNIT_STAND_STATE_STAND;

// ── accept handlers ──────────────────────────────────────────────────────────

// QuestAccept_npc_muglash — quest 6641 Vorsha the Lasher: temporary passive faction, then escort
// path 12717. The brazier waves carry the explore credit. Cite: ashenvale.cpp:356–367, :261–352.
function runMuglashAccept(): DbScriptIntent[] {
  const citeFaction =
    'ashenvale.cpp:362 SetFactionTemporary(FACTION_ESCORT_H_NEUTRAL_PASSIVE, TEMPFACTION_RESTORE_RESPAWN)';
  const citeEscort =
    `ashenvale.cpp:363 npc_muglash (${NPC_MUGLASH}) ` +
    `npc_escortAI::Start(false, player, quest, false, false, MUGLASH_ESCORT_PATH=${MUGLASH_ESCORT_PATH}) ` +
    '- FO6 degraded finishEscort';
  const citeBrazier =
    `ashenvale.cpp:158–163,261–284 WP15 pause + SAY_MUGLASH_BRAZIER=${SAY_MUGLASH_BRAZIER}; ` +
    `fail timer ${MUGLASH_FAIL_TIMER_MS}ms; GO_NAGA_BRAZIER=${GO_NAGA_BRAZIER} interactable; ` +
    `SPELL_MUGLASH_WAITING=${SPELL_MUGLASH_WAITING} - FO6 brazier`;
  const citeGoUse =
    `ashenvale.cpp:369–379 GOUse_go_naga_brazier SendAIEvent(AI_EVENT_CUSTOM_A) ` +
    `to NPC_MUGLASH (${NPC_MUGLASH}) - FO6 GO use`;
  const citeWaves =
    `ashenvale.cpp:285–292,209–237 wave1 ` +
    `NPC_WRATH_RAZORTAIL/RIDER/SORCERESS=${NPC_WRATH_RAZORTAIL}/${NPC_WRATH_RIDER}/${NPC_WRATH_SORCERESS}; ` +
    `wave2 NPC_WRATH_MYRMIDON/SEAWITCH/PRIESTESS=${NPC_WRATH_MYRMIDON}/${NPC_WRATH_SEAWITCH}/${NPC_WRATH_PRIESTESS}; ` +
    `NPC_VORSHA=${NPC_VORSHA}; TEMPSPAWN ${MUGLASH_WAVE_DESPAWN_MS}ms; ` +
    `SAY_MUGLASH_EVENT_01/02=${SAY_MUGLASH_EVENT_01}/${SAY_MUGLASH_EVENT_02} - FO6 combat`;
  const citeSuccess =
    `ashenvale.cpp:316–351 SAY_MUGLASH_SUCCESS=${SAY_MUGLASH_SUCCESS}…` +
    `SUCCESS_04=${SAY_MUGLASH_SUCCESS_04}; ForcedDespawn(${MUGLASH_DESPAWN_MS}) - FO6`;
  const citeFail =
    `ashenvale.cpp:246–257 DoFailEscort SAY_MUGLASH_FAIL=${SAY_MUGLASH_FAIL} + ` +
    `GO_FLAG_NO_INTERACT on brazier - FO6 fail`;
  const citeAggro =
    `ashenvale.cpp:134–143 Aggro while paused urand SAY_MUGLASH_AGGRO=${SAY_MUGLASH_AGGRO} - FO6 combat`;
  const citeCredit =
    'ashenvale.cpp:324–327 case 8 RewardPlayerAndGroupAtEventExplored(6641) - FO6 finishEscort';
  const citeEnder =
    `bake enderCreatureEntries NPC_WARSONG_RUNNER=${NPC_WARSONG_RUNNER} after explore credit`;
  return [
    {
      kind: 'set_faction',
      factionId: FACTION_ESCORT_H_NEUTRAL_PASSIVE,
      flags: TEMPFACTION_RESTORE_RESPAWN,
      cleared: false,
      cite: citeFaction,
    },
    {
      kind: 'skip',
      reason:
        `escort Start(false, player, quest, false, false, path=${MUGLASH_ESCORT_PATH}) ` +
        `npc_muglash (${NPC_MUGLASH}) - FO6 degraded finishEscort`,
      cite: citeEscort,
    },
    {
      kind: 'skip',
      reason:
        `WP15 brazier GO ${GO_NAGA_BRAZIER} + SPELL_MUGLASH_WAITING (${SPELL_MUGLASH_WAITING}) ` +
        `fail ${MUGLASH_FAIL_TIMER_MS}ms - FO6`,
      cite: citeBrazier,
    },
    {
      kind: 'skip',
      reason:
        `GOUse_go_naga_brazier (${GO_NAGA_BRAZIER}) → AI_EVENT_CUSTOM_A on Muglash - FO6`,
      cite: citeGoUse,
    },
    {
      kind: 'skip',
      reason:
        `naga waves + NPC_VORSHA (${NPC_VORSHA}) despawn ${MUGLASH_WAVE_DESPAWN_MS}ms - FO6 combat`,
      cite: citeWaves,
    },
    {
      kind: 'skip',
      reason:
        `success SAY ${SAY_MUGLASH_SUCCESS}/${SAY_MUGLASH_SUCCESS_02}/${SAY_MUGLASH_SUCCESS_03}/` +
        `${SAY_MUGLASH_SUCCESS_04} + ForcedDespawn(${MUGLASH_DESPAWN_MS}) - FO6`,
      cite: citeSuccess,
    },
    {
      kind: 'skip',
      reason: `DoFailEscort SAY_MUGLASH_FAIL (${SAY_MUGLASH_FAIL}) - FO6`,
      cite: citeFail,
    },
    {
      kind: 'skip',
      reason: `Aggro SAY_MUGLASH_AGGRO (${SAY_MUGLASH_AGGRO}) - FO6 combat`,
      cite: citeAggro,
    },
    {
      kind: 'skip',
      reason:
        'case 8 RewardPlayerAndGroupAtEventExplored(6641) - FO6 finishEscort',
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason: `turn-in NPC_WARSONG_RUNNER (${NPC_WARSONG_RUNNER}) after explore credit`,
      cite: citeEnder,
    },
  ];
}

// QuestAccept_npc_ruul_snowhoof — quest 6482 Freedom to Ruul: temporary faction, stand, escort;
// WP32 drops the shapechange and gives the credit. Cite: ashenvale.cpp:466–477, :427–462.
function runRuulSnowhoofAccept(): DbScriptIntent[] {
  const citeFaction =
    'ashenvale.cpp:470 SetFactionTemporary(FACTION_ESCORT_H_NEUTRAL_PASSIVE, ' +
    'TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_PLAYER)';
  const citeStand =
    'ashenvale.cpp:471 SetStandState(UNIT_STAND_STATE_STAND)';
  const citeEscort =
    `ashenvale.cpp:474 npc_ruul_snowhoof (${NPC_RUUL_SNOWHOOF}) ` +
    'npc_escortAI::Start(false, player, quest) - FO6 degraded finishEscort';
  const citeShape =
    `ashenvale.cpp:410 Reset DoCastSpellIfCan(SPELL_RUUL_SHAPECHANGE=${SPELL_RUUL_SHAPECHANGE}); ` +
    'WP32 RemoveAuras; WP34 recast - FO6 form';
  const citeAmbush =
    `ashenvale.cpp:413–425,431–436 WP14/31 DoSpawnAmbush ` +
    `NPC_T_AVENGER/SHAMAN/PATHFINDER=${NPC_T_AVENGER}/${NPC_T_SHAMAN}/${NPC_T_PATHFINDER} ` +
    `TEMPSPAWN_DEAD_DESPAWN ${RUUL_AMBUSH_DESPAWN_MS}ms - FO6 combat`;
  const citeCredit =
    `ashenvale.cpp:437–444 WP32 RemoveAuras(SPELL_RUUL_SHAPECHANGE=${SPELL_RUUL_SHAPECHANGE}) + ` +
    'RewardPlayerAndGroupAtEventExplored(6482) - FO6 finishEscort';
  const citeEnd =
    `ashenvale.cpp:446–461 WP33 SAY_RUUL_COMPLETE=${SAY_RUUL_COMPLETE} + bow; ` +
    'WP36 SetImmuneToNPC(false) + ForcedDespawn - FO6';
  const citeEnder =
    `bake enderCreatureEntries NPC_YAMA_SNOWHOOF=${NPC_YAMA_SNOWHOOF} after WP32 explore credit`;
  return [
    {
      kind: 'set_faction',
      factionId: FACTION_ESCORT_H_NEUTRAL_PASSIVE,
      flags: RUUL_TEMP_FACTION_FLAGS,
      cleared: false,
      cite: citeFaction,
    },
    {
      kind: 'stand_state',
      standState: UNIT_STAND_STATE_STAND_RUUL,
      cite: citeStand,
    },
    {
      kind: 'skip',
      reason:
        `escort Start(false, player, quest) npc_ruul_snowhoof (${NPC_RUUL_SNOWHOOF}) - FO6 degraded finishEscort`,
      cite: citeEscort,
    },
    {
      kind: 'skip',
      reason:
        `SPELL_RUUL_SHAPECHANGE (${SPELL_RUUL_SHAPECHANGE}) Reset/WP32/WP34 - FO6 form`,
      cite: citeShape,
    },
    {
      kind: 'skip',
      reason:
        `WP14/31 ambush ${NPC_T_AVENGER}/${NPC_T_SHAMAN}/${NPC_T_PATHFINDER} - FO6 combat`,
      cite: citeAmbush,
    },
    {
      kind: 'skip',
      reason:
        'WP32 RewardPlayerAndGroupAtEventExplored(6482) - FO6 finishEscort',
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason:
        `WP33 SAY_RUUL_COMPLETE (${SAY_RUUL_COMPLETE}) + WP36 ForcedDespawn - FO6`,
      cite: citeEnd,
    },
    {
      kind: 'skip',
      reason: `turn-in NPC_YAMA_SNOWHOOF (${NPC_YAMA_SNOWHOOF}) after explore credit`,
      cite: citeEnder,
    },
  ];
}

// QuestAccept_npc_torek — quest 6544 Torek's Assault: say the ready line and run the escort; WP20
// is the Silverwing fight and WP21 the explore credit. Cite: ashenvale.cpp:581–593, :520–548.
function runTorekAccept(): DbScriptIntent[] {
  const citeTalk =
    `ashenvale.cpp:586 npc_torek (${NPC_TOREK}) DoScriptText(SAY_READY=${SAY_READY})`;
  const citeEscort =
    `ashenvale.cpp:589 npc_torek (${NPC_TOREK}) ` +
    'npc_escortAI::Start(true, player, quest) - FO6 degraded finishEscort';
  const citeWpTalk =
    `ashenvale.cpp:529–534 WP2 SAY_MOVE=${SAY_MOVE}; WP9 SAY_PREPARE=${SAY_PREPARE} - FO6 WP`;
  const citeFight =
    `ashenvale.cpp:535–540 WP20 SummonCreature NPC_DURIEL=${NPC_DURIEL} + ` +
    `NPC_SILVERWING_SENTINEL=${NPC_SILVERWING_SENTINEL} + NPC_SILVERWING_WARRIOR=${NPC_SILVERWING_WARRIOR} ` +
    `TEMPSPAWN_TIMED_OOC_DESPAWN ${TOREK_SUMMON_DESPAWN_MS}ms; companions NPC_SPLINTERTREE_RAIDER=${NPC_SPLINTERTREE_RAIDER} (DB) - FO6 combat`;
  const citeSpells =
    `ashenvale.cpp:561–575 UpdateEscortAI SPELL_REND=${SPELL_REND} + SPELL_THUNDERCLAP=${SPELL_THUNDERCLAP} - FO6 combat`;
  const citeCredit =
    `ashenvale.cpp:541–543 WP21 DoScriptText(SAY_WIN=${SAY_WIN}) + ` +
    'RewardPlayerAndGroupAtEventExplored(6544) - FO6 finishEscort';
  const citeEnd =
    `ashenvale.cpp:545–547 WP22 DoScriptText(SAY_END=${SAY_END}) - FO6 WP`;
  const citeEnder =
    `bake enderCreatureEntries NPC_ERTOG_RAGETUSK=${NPC_ERTOG_RAGETUSK} after WP21 explore credit`;
  return [
    {
      kind: 'talk',
      textId: SAY_READY,
      stringTemplateId: 0,
      cite: citeTalk,
    },
    {
      kind: 'skip',
      reason:
        `escort Start(true, player, quest) npc_torek (${NPC_TOREK}) - FO6 degraded finishEscort`,
      cite: citeEscort,
    },
    {
      kind: 'skip',
      reason:
        `WP2 SAY_MOVE (${SAY_MOVE}) + WP9 SAY_PREPARE (${SAY_PREPARE}) - FO6`,
      cite: citeWpTalk,
    },
    {
      kind: 'skip',
      reason:
        `WP20 Duriel (${NPC_DURIEL}) + Silverwing ${NPC_SILVERWING_SENTINEL}/${NPC_SILVERWING_WARRIOR} ` +
        `despawn ${TOREK_SUMMON_DESPAWN_MS}ms - FO6 combat`,
      cite: citeFight,
    },
    {
      kind: 'skip',
      reason:
        `SPELL_REND (${SPELL_REND}) + SPELL_THUNDERCLAP (${SPELL_THUNDERCLAP}) - FO6 combat`,
      cite: citeSpells,
    },
    {
      kind: 'skip',
      reason:
        `WP21 SAY_WIN (${SAY_WIN}) + RewardPlayerAndGroupAtEventExplored(6544) - FO6 finishEscort`,
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason: `WP22 SAY_END (${SAY_END}) - FO6`,
      cite: citeEnd,
    },
    {
      kind: 'skip',
      reason: `turn-in NPC_ERTOG_RAGETUSK (${NPC_ERTOG_RAGETUSK}) after explore credit`,
      cite: citeEnder,
    },
  ];
}

// QuestAccept_npc_feero_ironhand — quest 976 Supplies to Auberdine: say, temporary faction, run
// escort; three ambushes then the WP31 credit. Cite: ashenvale.cpp:763–775, :666–694.
function runFeeroIronhandAccept(): DbScriptIntent[] {
  const citeTalk =
    `ashenvale.cpp:767 npc_feero_ironhand (${NPC_FEERO_IRONHAND}) ` +
    `DoScriptText(SAY_QUEST_START=${SAY_QUEST_START})`;
  const citeFaction =
    'ashenvale.cpp:768 SetFactionTemporary(FACTION_ESCORT_A_NEUTRAL_PASSIVE, ' +
    'TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC)';
  const citeEscort =
    `ashenvale.cpp:771 npc_feero_ironhand (${NPC_FEERO_IRONHAND}) ` +
    'npc_escortAI::Start(true, player, quest, true) - FO6 degraded finishEscort';
  const citeAmbush1 =
    `ashenvale.cpp:670–675 WP15 SAY_FIRST_AMBUSH_START=${SAY_FIRST_AMBUSH_START} + ` +
    `4× NPC_DARK_STRAND_ASSASSIN=${NPC_DARK_STRAND_ASSASSIN} ` +
    `TEMPSPAWN ${FEERO_SUMMON_DESPAWN_MS}ms; SAY_FIRST_AMBUSH_END=${SAY_FIRST_AMBUSH_END} - FO6 combat`;
  const citeAmbush2 =
    `ashenvale.cpp:676–681 WP21 SAY_SECOND_AMBUSH_START=${SAY_SECOND_AMBUSH_START} + ` +
    `3× NPC_FORSAKEN_SCOUT=${NPC_FORSAKEN_SCOUT}; SAY_SCOUT_SECOND_AMBUSH=${SAY_SCOUT_SECOND_AMBUSH}; ` +
    `SAY_SECOND_AMBUSH_END=${SAY_SECOND_AMBUSH_END} - FO6 combat`;
  const citeAmbush3 =
    `ashenvale.cpp:682–688 WP30 SAY_FINAL_AMBUSH_START=${SAY_FINAL_AMBUSH_START} + ` +
    `NPC_BALIZAR_THE_UMBRAGE=${NPC_BALIZAR_THE_UMBRAGE} SAY_BALIZAR_FINAL_AMBUSH=${SAY_BALIZAR_FINAL_AMBUSH}; ` +
    `NPC_ALIGAR_THE_TORMENTOR=${NPC_ALIGAR_THE_TORMENTOR}; ` +
    `NPC_CAEDAKAR_THE_VICIOUS=${NPC_CAEDAKAR_THE_VICIOUS}; ` +
    `SAY_FINAL_AMBUSH_ATTACK=${SAY_FINAL_AMBUSH_ATTACK}; SAY_QUEST_END=${SAY_QUEST_END} - FO6 combat`;
  const citeCredit =
    'ashenvale.cpp:689–692 WP31 RewardPlayerAndGroupAtEventExplored(976) - FO6 finishEscort';
  const citeEnder =
    `bake enderCreatureEntries NPC_DELGREN_THE_PURIFIER=${NPC_DELGREN_THE_PURIFIER} after WP31 explore credit`;
  return [
    {
      kind: 'talk',
      textId: SAY_QUEST_START,
      stringTemplateId: 0,
      cite: citeTalk,
    },
    {
      kind: 'set_faction',
      factionId: FACTION_ESCORT_A_NEUTRAL_PASSIVE,
      flags: FEERO_TEMP_FACTION_FLAGS,
      cleared: false,
      cite: citeFaction,
    },
    {
      kind: 'skip',
      reason:
        `escort Start(true, player, quest, true) npc_feero_ironhand (${NPC_FEERO_IRONHAND}) - FO6 degraded finishEscort`,
      cite: citeEscort,
    },
    {
      kind: 'skip',
      reason:
        `WP15 4× Dark Strand Assassin (${NPC_DARK_STRAND_ASSASSIN}) - FO6 combat`,
      cite: citeAmbush1,
    },
    {
      kind: 'skip',
      reason:
        `WP21 3× Forsaken Scout (${NPC_FORSAKEN_SCOUT}) - FO6 combat`,
      cite: citeAmbush2,
    },
    {
      kind: 'skip',
      reason:
        `WP30 Balizar/Aligar/Caedakar elites - FO6 combat`,
      cite: citeAmbush3,
    },
    {
      kind: 'skip',
      reason:
        'WP31 RewardPlayerAndGroupAtEventExplored(976) - FO6 finishEscort',
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason:
        `turn-in NPC_DELGREN_THE_PURIFIER (${NPC_DELGREN_THE_PURIFIER}) after explore credit`,
      cite: citeEnder,
    },
  ];
}

// Family pack: kalimdor/ashenvale.cpp Hooks: pQuestAcceptNPC muglash (6641), ruul_snowhoof (6482), torek
// (6544), feero_ironhand (976).
export function runAshenvale(
  phase: QuestScriptHook,
  questId: number,
): DbScriptIntent[] {
  if (phase !== 'accept') return [];
  if (questId === QUEST_VORSHA) return runMuglashAccept();
  if (questId === QUEST_FREEDOM_TO_RUUL) return runRuulSnowhoofAccept();
  if (questId === QUEST_TOREK_ASSULT) return runTorekAccept();
  if (questId === QUEST_SUPPLIES_TO_AUBERDINE) return runFeeroIronhandAccept();
  return [];
}

// Map entries spread into QUEST_SCRIPT_REGISTRY (keeps registry.ts under 1500). next-batch.mjs also matches
// `family: 'kalimdor/ashenvale'` in registry.ts.
export const ASHENVALE_REGISTRY: Record<string | number, AshenvaleQuestScriptEntry> = {
  'kalimdor/ashenvale': {
    family: 'kalimdor/ashenvale',
    questIds: [
      QUEST_SUPPLIES_TO_AUBERDINE,
      QUEST_FREEDOM_TO_RUUL,
      QUEST_TOREK_ASSULT,
      QUEST_VORSHA,
    ],
    hooks: ['accept'],
    cite: 'kalimdor/ashenvale.cpp:356–367,466–477,581–593,763–775',
    run: runAshenvale,
  },
  [QUEST_VORSHA]: {
    family: 'kalimdor/ashenvale',
    questId: QUEST_VORSHA,
    questIds: [QUEST_VORSHA],
    hooks: ['accept'],
    cite: 'ashenvale.cpp:356–367 QuestAccept_npc_muglash',
    run: runAshenvale,
  },
  [QUEST_FREEDOM_TO_RUUL]: {
    family: 'kalimdor/ashenvale',
    questId: QUEST_FREEDOM_TO_RUUL,
    questIds: [QUEST_FREEDOM_TO_RUUL],
    hooks: ['accept'],
    cite: 'ashenvale.cpp:466–477 QuestAccept_npc_ruul_snowhoof',
    run: runAshenvale,
  },
  [QUEST_TOREK_ASSULT]: {
    family: 'kalimdor/ashenvale',
    questId: QUEST_TOREK_ASSULT,
    questIds: [QUEST_TOREK_ASSULT],
    hooks: ['accept'],
    cite: 'ashenvale.cpp:581–593 QuestAccept_npc_torek',
    run: runAshenvale,
  },
  [QUEST_SUPPLIES_TO_AUBERDINE]: {
    family: 'kalimdor/ashenvale',
    questId: QUEST_SUPPLIES_TO_AUBERDINE,
    questIds: [QUEST_SUPPLIES_TO_AUBERDINE],
    hooks: ['accept'],
    cite: 'ashenvale.cpp:763–775 QuestAccept_npc_feero_ironhand',
    run: runAshenvale,
  },
};
