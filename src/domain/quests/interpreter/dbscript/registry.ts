// QI4 — scriptdev2 residual quest-script registry, keyed by family id and/or quest entry. Opcodes
// go through OPCODE_HANDLERS; this covers the accept and reward hooks that are not dbscript rows.

import type { DbScriptIntent } from './types.ts';
import type { DbScriptRow } from '../../../../data/schema.ts';
import {
  NPC_FLAG_CHANGE_REMOVE,
  UNIT_FLAG_CHANGE_REMOVE,
  UNIT_STAND_STATE_STAND,
} from './opcodes.ts';
// Sibling family bodies (filesize ratchet — keep map under 1500 lines).
import { QUEST_MISSING_IN_ACTION, runRedridgeMountains } from './registryRedridge.ts';
import { QUEST_SUNTARA_STONES, runSearingGorge } from './registrySearingGorge.ts';
import { QUEST_ERLAND, QUEST_PYREWOOD_AMBUSH, runSilverpineForest } from './registrySilverpineForest.ts';
import {
  QUEST_BEAT, QUEST_MISSING_DIPLO_PT8, QUEST_STORMWIND_RENDEZVOUS, QUEST_THE_GREAT_MASQUERADE, runStormwindCity,
} from './registryStormwindCity.ts';
import { QUEST_SAVING_YENNIKU, runStranglethornVale } from './registryStranglethornVale.ts';
import { QUEST_MEDALLION_FAITH, QUEST_RESTLESS_SOUL, runStratholmeScripts } from './registryStratholme.ts';
import {
  QUEST_THE_CHARGE_OF_DRAGONFLIGHTS,
  runSunkenTempleScripts,
} from './registrySunkenTemple.ts';
import { QUEST_GALENS_ESCAPE, runSwampOfSorrows } from './registrySwampOfSorrows.ts';
import { QUEST_590, QUEST_ULAG, runTirisfalGlades } from './registryTirisfalGlades.ts';
import {
  QUEST_IN_DREAMS,
  QUEST_SCARLET_SUBTERFUGE,
  runWesternPlaguelands,
} from './registryWesternPlaguelands.ts';
import { QUEST_DEFIAS_BROTHERHOOD, QUEST_TOME_VALOR, runWestfall } from './registryWestfall.ts';
import { QUEST_MISSING_DIPLOMAT11, runWetlands } from './registryWetlands.ts';
import { SIBLING_REGISTRIES } from './registrySiblings.ts';
/** Hook phase for a registry entry. */
export type QuestScriptHook = 'accept' | 'reward' | 'complete' | 'frame';

// One scriptdev2 residual entry — pure behaviour description. Implementations emit intents (same vocabulary
// as opcode handlers where possible).
export interface QuestScriptEntry {
  /** Family path e.g. `eastern_kingdoms/elwynn`. */
  family?: string;
  /** Primary quest id when entry is quest-keyed. */
  questId?: number;
  /** All quest ids covered when family-keyed. */
  questIds?: number[];
  /** Which C++ hooks were ported. */
  hooks?: QuestScriptHook[];
  /** Optional pre-authored dbscript-like rows for fixtures. */
  rows?: DbScriptRow[];
  // Pure hook body — returns intents for accept/reward. Deterministic — no wall clock / non-deterministic
  // RNG.
  run?: (phase: QuestScriptHook, questId: number) => DbScriptIntent[];
  /** Source citation (CMaNGOS ScriptDevAI file:line). */
  cite?: string;
}

// ── eastern_kingdoms/arathi_highlands sourced constants ──────────────────────
// Cite: arathi_highlands.cpp enums + Creature.h TemporaryFactionFlags + AIDefines.h

/** Cite: arathi_highlands.cpp:52 QUEST_SUNKEN_TREASURE */
const QUEST_SUNKEN_TREASURE = 665;
/** Cite: arathi_highlands.cpp:144 QUEST_HINTS_NEW_PLAGUE */
const QUEST_HINTS_NEW_PLAGUE = 660;
/** Cite: arathi_highlands.cpp:51 FACTION_BOOTY_BAY */
const FACTION_BOOTY_BAY = 120;
// Cite: Creature.h:577 TEMPFACTION_RESTORE_RESPAWN = 0x01 Used by QuestAccept_npc_professor_phizzlethorpe
// SetFactionTemporary.
const TEMPFACTION_RESTORE_RESPAWN = 0x01;
/** Cite: arathi_highlands.cpp:40 SAY_PROGRESS_1 = -1000264 */
const SAY_PROGRESS_1 = -1000264;
/** Cite: arathi_highlands.cpp:127 SAY_START = -1000948 */
const SAY_START = -1000948;
/** Cite: AIDefines.h:43 AI_EVENT_START_ESCORT = 100 */
const AI_EVENT_START_ESCORT = 100;
// Cite: Unit.h:477 UNIT_FLAG_IMMUNE_TO_NPC = 0x00000200 Kinelory ReceiveAIEvent removes this flag after
// escort start.
const UNIT_FLAG_IMMUNE_TO_NPC = 0x00000200;

// QuestAccept_npc_professor_phizzlethorpe — quest 665 Sunken Treasure: temporary Booty Bay faction,
// say, and escort start. Cite: arathi_highlands.cpp:103–114; WP21 credit at :84–88.
function runProfessorPhizzlethorpeAccept(): DbScriptIntent[] {
  const citeFaction = 'arathi_highlands.cpp:107 SetFactionTemporary(FACTION_BOOTY_BAY, TEMPFACTION_RESTORE_RESPAWN)';
  const citeTalk = 'arathi_highlands.cpp:108 DoScriptText(SAY_PROGRESS_1)';
  const citeEscort = 'arathi_highlands.cpp:110–111 npc_escortAI::Start - FO6 degraded finishEscort';
  return [
    {
      kind: 'set_faction',
      factionId: FACTION_BOOTY_BAY,
      flags: TEMPFACTION_RESTORE_RESPAWN,
      cleared: false,
      cite: citeFaction,
    },
    {
      kind: 'talk',
      textId: SAY_PROGRESS_1,
      stringTemplateId: 0,
      cite: citeTalk,
    },
    {
      kind: 'skip',
      reason: 'escort Start(false, player, quest, true) - FO6 degraded finishEscort',
      cite: citeEscort,
    },
  ];
}

// QuestAccept_npc_kinelory — quest 660 Hints of a New Plague?: the AI event clears IMMUNE_TO_NPC,
// says the start line and begins the escort. Cite: arathi_highlands.cpp:248–254 and :204–212.
function runKineloryAccept(questId: number): DbScriptIntent[] {
  const citeEvent =
    'arathi_highlands.cpp:251 SendAIEvent(AI_EVENT_START_ESCORT, player, creature, questId)';
  const citeTalk = 'arathi_highlands.cpp:209 DoScriptText(SAY_START) via ReceiveAIEvent';
  const citeFlags =
    'arathi_highlands.cpp:208,211 SetImmuneToNPC(false) / RemoveFlag(UNIT_FLAG_IMMUNE_TO_NPC)';
  const citeEscort =
    'arathi_highlands.cpp:210 npc_escortAI::Start - FO6 degraded finishEscort';
  // Creature starts with UNIT_FLAG_IMMUNE_TO_NPC; remove → result 0 when only that bit set.
  const priorFlags = UNIT_FLAG_IMMUNE_TO_NPC;
  const resultFlags = priorFlags & ~UNIT_FLAG_IMMUNE_TO_NPC;
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
      textId: SAY_START,
      stringTemplateId: 0,
      cite: citeTalk,
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
      reason: 'escort Start(false, player, quest, true) - FO6 degraded finishEscort',
      cite: citeEscort,
    },
  ];
}

// Family pack: eastern_kingdoms/arathi_highlands.cpp Hooks: pQuestAcceptNPC professor_phizzlethorpe (665),
// kinelory (660).
function runArathiHighlands(phase: QuestScriptHook, questId: number): DbScriptIntent[] {
  if (phase !== 'accept') return [];
  if (questId === QUEST_SUNKEN_TREASURE) return runProfessorPhizzlethorpeAccept();
  if (questId === QUEST_HINTS_NEW_PLAGUE) return runKineloryAccept(questId);
  return [];
}

// ── eastern_kingdoms/blackrock_depths/blackrock_depths sourced constants ─────
// Cite: blackrock_depths.cpp + ScriptDevAIMgr.h EscortFaction + Unit.h NPC flags

/** Cite: blackrock_depths.cpp:1151 QUEST_JAIL_BREAK */
const QUEST_JAIL_BREAK = 4322;
/** Cite: blackrock_depths.cpp:178 QUEST_THE_CHALLENGE */
const QUEST_THE_CHALLENGE = 9015;
/** Cite: blackrock_depths.cpp:704 QUEST_POTION_LOVE */
const QUEST_POTION_LOVE = 4201;
/** Cite: blackrock_depths.cpp:872 QUEST_ALE */
const QUEST_ALE = 4295;
// Cite: ScriptDevAIMgr.h:48 FACTION_ESCORT_A_NEUTRAL_ACTIVE = 231 Used by QuestAccept_npc_marshal_windsor
// SetFactionTemporary.
const FACTION_ESCORT_A_NEUTRAL_ACTIVE = 231;
/** Cite: Creature.h:577 TEMPFACTION_RESTORE_RESPAWN = 0x01 (shared with arathi — same enum). */
const TEMPFACTION_RESTORE_RESPAWN_BRD = TEMPFACTION_RESTORE_RESPAWN;
/** Cite: blackrock_depths.cpp:864 SAY_GOT_BEER = -1230000 */
const SAY_GOT_BEER = -1230000;
/** Cite: blackrock_depths.cpp:179 NPC_THELDREN_QUEST_CREDIT = 16166 */
const NPC_THELDREN_QUEST_CREDIT = 16166;
/** Cite: Unit.h:510 UNIT_NPC_FLAG_GOSSIP = 0x00000001 */
const UNIT_NPC_FLAG_GOSSIP = 0x00000001;
/** Cite: Unit.h:511 UNIT_NPC_FLAG_QUESTGIVER = 0x00000002 */
const UNIT_NPC_FLAG_QUESTGIVER = 0x00000002;

// QuestAccept_npc_marshal_windsor — quest 4322 Jail Break!: temporary escort faction and Start.
// Cite: blackrock_depths.cpp:1360–1372; WP58 explore credit at :1315–1321.
function runMarshalWindsorAccept(): DbScriptIntent[] {
  const citeFaction =
    'blackrock_depths.cpp:1364 SetFactionTemporary(FACTION_ESCORT_A_NEUTRAL_ACTIVE, TEMPFACTION_RESTORE_RESPAWN)';
  const citeEscort =
    'blackrock_depths.cpp:1366–1367 npc_escortAI::Start - FO6 degraded finishEscort';
  return [
    {
      kind: 'set_faction',
      factionId: FACTION_ESCORT_A_NEUTRAL_ACTIVE,
      flags: TEMPFACTION_RESTORE_RESPAWN_BRD,
      cleared: false,
      cite: citeFaction,
    },
    {
      kind: 'skip',
      reason: 'escort Start(false, player, quest) - FO6 degraded finishEscort',
      cite: citeEscort,
    },
  ];
}

// QuestRewarded_npc_mistress_nagmara — quest 4201: strip GOSSIP and QUESTGIVER on Nagmara,
// QUESTGIVER on Rocknot, then chase. Timed romance phases stay degraded. Cite: brd.cpp:837–850.
function runMistressNagmaraReward(): DbScriptIntent[] {
  const citeGossip =
    'blackrock_depths.cpp:736 RemoveFlag(UNIT_NPC_FLAGS, UNIT_NPC_FLAG_GOSSIP)';
  const citeQg =
    'blackrock_depths.cpp:737 RemoveFlag(UNIT_NPC_FLAGS, UNIT_NPC_FLAG_QUESTGIVER)';
  const citeRocknot =
    'blackrock_depths.cpp:738 pRocknot->RemoveFlag(UNIT_NPC_FLAG_QUESTGIVER)';
  const citeChase =
    'blackrock_depths.cpp:740–742 MoveIdle/MoveChase Rocknot + phase=1 - instance romance FO6';
  // Prior: GOSSIP|QUESTGIVER typical questgiver; sequential removes → 0.
  const prior = UNIT_NPC_FLAG_GOSSIP | UNIT_NPC_FLAG_QUESTGIVER;
  const afterGossip = prior & ~UNIT_NPC_FLAG_GOSSIP;
  const afterQg = afterGossip & ~UNIT_NPC_FLAG_QUESTGIVER;
  return [
    {
      kind: 'modify_npc_flags',
      flag: UNIT_NPC_FLAG_GOSSIP,
      changeFlag: NPC_FLAG_CHANGE_REMOVE,
      mode: 'remove',
      resultFlags: afterGossip,
      cite: citeGossip,
    },
    {
      kind: 'modify_npc_flags',
      flag: UNIT_NPC_FLAG_QUESTGIVER,
      changeFlag: NPC_FLAG_CHANGE_REMOVE,
      mode: 'remove',
      resultFlags: afterQg,
      cite: citeQg,
    },
    {
      kind: 'skip',
      reason: 'Rocknot RemoveFlag(QUESTGIVER) - buddy creature host-side',
      cite: citeRocknot,
    },
    {
      kind: 'skip',
      reason: 'MoveChase Rocknot + romance phase machine - instance FO6',
      cite: citeChase,
    },
  ];
}

// QuestRewarded_npc_rocknot — quest 4295 Rocknot's Ale: face the player, say, emote timer and
// SetData SPECIAL. The instance early-out is omitted in the zone model. Cite: brd.cpp:1081–1107.
function runRocknotReward(): DbScriptIntent[] {
  const citeFace = 'blackrock_depths.cpp:1096 SetFacingToObject(player)';
  const citeTalk = 'blackrock_depths.cpp:1097 DoScriptText(SAY_GOT_BEER)';
  const citeEmote =
    'blackrock_depths.cpp:1098–1099 m_uiEmoteTimer=1500 + instance SetData(SPECIAL) - AI/instance FO6';
  return [
    {
      kind: 'skip',
      reason: 'SetFacingToObject(player) - host resolves facing',
      cite: citeFace,
    },
    {
      kind: 'talk',
      textId: SAY_GOT_BEER,
      stringTemplateId: 0,
      cite: citeTalk,
    },
    {
      kind: 'skip',
      reason: 'emote timer + TYPE_ROCKNOT SPECIAL - instance bar event FO6',
      cite: citeEmote,
    },
  ];
}

// DoChallengeQuestCredit — quest 9015 The Challenge: kill credit for players still on it, fired
// when the gladiators die rather than from an accept hook. Cite: brd.cpp:298–307.
function runTheChallengeCredit(): DbScriptIntent[] {
  const cite =
    'blackrock_depths.cpp:306 pPlayer->KilledMonsterCredit(NPC_THELDREN_QUEST_CREDIT)';
  return [
    {
      kind: 'kill_credit',
      creatureEntry: NPC_THELDREN_QUEST_CREDIT,
      cite,
    },
  ];
}

// Family pack: eastern_kingdoms/blackrock_depths/blackrock_depths.cpp Hooks: QuestRewarded nagmara (4201),
// rocknot (4295); QuestAccept windsor (4322). Residual: DoChallengeQuestCredit (9015) on gladiator wipe.
function runBlackrockDepths(phase: QuestScriptHook, questId: number): DbScriptIntent[] {
  if (phase === 'accept' && questId === QUEST_JAIL_BREAK) {
    return runMarshalWindsorAccept();
  }
  if (phase === 'reward' && questId === QUEST_POTION_LOVE) {
    return runMistressNagmaraReward();
  }
  if (phase === 'reward' && questId === QUEST_ALE) {
    return runRocknotReward();
  }
  if (
    (phase === 'frame' || phase === 'complete') &&
    questId === QUEST_THE_CHALLENGE
  ) {
    return runTheChallengeCredit();
  }
  return [];
}

// ── eastern_kingdoms/blackwing_lair/boss_vaelastrasz sourced constants ───────
// Cite: boss_vaelastrasz.cpp + blackwing_lair.h + sc_instance.h EncounterState

/** Cite: boss_vaelastrasz.cpp:64 QUEST_NEFARIUS_CORRUPTION */
const QUEST_NEFARIUS_CORRUPTION = 8730;
// Cite: blackwing_lair.h:20 TYPE_QUEST_SCEPTER = 8 BWL encounter slot for the Scepter of the Shifting Sands
// epic (Red Shard).
const TYPE_QUEST_SCEPTER = 8;
// Cite: sc_instance.h:15 IN_PROGRESS = 1 EncounterState used by SetData(TYPE_QUEST_SCEPTER, IN_PROGRESS) on
// accept.
const ENCOUNTER_IN_PROGRESS = 1;

// QuestAccept_boss_vaelastrasz — quest 8730: sets TYPE_QUEST_SCEPTER IN_PROGRESS, which arms the
// scepter chain. Timed Nefarius taunts stay instance-side. Cite: boss_vaelastrasz.cpp:359–368.
function runVaelastraszAccept(): DbScriptIntent[] {
  const citeSet =
    'boss_vaelastrasz.cpp:364 pInstance->SetData(TYPE_QUEST_SCEPTER, IN_PROGRESS)';
  const citeTimer =
    'blackwing_lair.cpp:259–262 m_uiScepterEpicTimer=2000 + step=0; Update 5h taunts FO6';
  return [
    {
      kind: 'set_instance_data',
      type: TYPE_QUEST_SCEPTER,
      data: ENCOUNTER_IN_PROGRESS,
      cite: citeSet,
    },
    {
      kind: 'skip',
      reason:
        'TYPE_QUEST_SCEPTER IN_PROGRESS starts m_uiScepterEpicTimer=2000 + 5h Nefarius taunt Update - instance FO6',
      cite: citeTimer,
    },
  ];
}

// Family pack: eastern_kingdoms/blackwing_lair/boss_vaelastrasz.cpp Hooks: pQuestAcceptNPC
// QuestAccept_boss_vaelastrasz (8730).
function runBossVaelastrasz(phase: QuestScriptHook, questId: number): DbScriptIntent[] {
  if (phase !== 'accept') return [];
  if (questId === QUEST_NEFARIUS_CORRUPTION) return runVaelastraszAccept();
  return [];
}

// ── eastern_kingdoms/burning_steppes sourced constants ───────────────────────
// Cite: burning_steppes.cpp npc_grark_lorkrub quest accept + escort end credit

// Cite: burning_steppes.cpp:72 QUEST_ID_PRECARIOUS_PREDICAMENT = 4121 Escort "Precarious Predicament" —
// accept starts npc_escortAI.
const QUEST_PRECARIOUS_PREDICAMENT = 4121;
// Cite: burning_steppes.cpp:66 NPC_GRARK_LORKRUB = 9520 Quest giver for 4121 after capture (quest 4122 /
// spell Capture Grark).
const NPC_GRARK_LORKRUB = 9520;

// QuestAccept_npc_grark_lorkrub — quest 4121 Precarious Predicament: the accept body is the escort
// Start alone; Lexlort's outro carries the explore credit. Cite: burning_steppes.cpp:324–335.
function runGrarkLorkrubAccept(): DbScriptIntent[] {
  const citeEscort =
    `burning_steppes.cpp:328–329 npc_grark_lorkrub (${NPC_GRARK_LORKRUB}) ` +
    'npc_escortAI::Start(false, player, quest) - FO6 degraded finishEscort';
  const citeCredit =
    'burning_steppes.cpp:242–243 RewardPlayerAndGroupAtEventExplored(4121) at SAY_LEXLORT_4 - FO6 finishEscort';
  return [
    {
      kind: 'skip',
      reason:
        'escort Start(false, player, quest) - FO6 degraded finishEscort (ambush WPs + Lexlort outro)',
      cite: citeEscort,
    },
    {
      kind: 'skip',
      reason:
        'escort end RewardPlayerAndGroupAtEventExplored(4121) - FO6 finishEscort models credit',
      cite: citeCredit,
    },
  ];
}

// Family pack: eastern_kingdoms/burning_steppes.cpp Hooks: pQuestAcceptNPC QuestAccept_npc_grark_lorkrub
// (4121).
function runBurningSteppes(phase: QuestScriptHook, questId: number): DbScriptIntent[] {
  if (phase !== 'accept') return [];
  if (questId === QUEST_PRECARIOUS_PREDICAMENT) return runGrarkLorkrubAccept();
  return [];
}

// ── eastern_kingdoms/eastern_plaguelands sourced constants ───────────────────
// Cite: eastern_plaguelands.cpp npc_eris_havenfire quest accept + balance event

// Cite: eastern_plaguelands.cpp:57 QUEST_BALANCE_OF_LIGHT_AND_SHADOW = 7622 Priest event: save 50 peasants
// before 15 are slain.
const QUEST_BALANCE_OF_LIGHT_AND_SHADOW = 7622;
// Cite: bake starterCreatureEntries / classic-db creature_questrelation Eris Havenfire (npc_eris_havenfire
// script name).
const NPC_ERIS_HAVENFIRE = 14494;
// Cite: eastern_plaguelands.cpp:61 MAX_SAVED_PEASANT = 50 Event-win threshold for
// AreaExploredOrEventHappens.
const MAX_SAVED_PEASANT = 50;
// Cite: eastern_plaguelands.cpp:60 MAX_KILLED_PEASANT = 15 FailQuest threshold during the balance event.
const MAX_KILLED_PEASANT = 15;
// Cite: Unit.h:511 UNIT_NPC_FLAG_QUESTGIVER = 0x00000002 DoStartBalanceEvent removes this so Eris is not
// re-accepted mid-event.
const UNIT_NPC_FLAG_QUESTGIVER_EPL = UNIT_NPC_FLAG_QUESTGIVER;

// QuestAccept_npc_eris_havenfire — quest 7622: clears QUESTGIVER and arms the balance event, which
// credits at 50 saved and fails at 15 killed. Cite: eastern_plaguelands.cpp:345–354, :227–244.
function runErisHavenfireAccept(): DbScriptIntent[] {
  const citeQg =
    `eastern_plaguelands.cpp:229 DoStartBalanceEvent RemoveFlag(UNIT_NPC_FLAG_QUESTGIVER) ` +
    `npc_eris_havenfire (${NPC_ERIS_HAVENFIRE})`;
  const citeStart =
    'eastern_plaguelands.cpp:231–232 m_uiEventTimer=5000 + m_uiArcherCheckTargetTimer=2000; ' +
    'UpdateAI waves/archers/footsoldiers FO6';
  const citeWin =
    `eastern_plaguelands.cpp:238 AreaExploredOrEventHappens(7622) at ${MAX_SAVED_PEASANT} saved - FO6 finishEscort`;
  const citeFail =
    `eastern_plaguelands.cpp:169 FailQuest(7622) at ${MAX_KILLED_PEASANT} slain - host fail FO6`;
  // Reset() sets QUESTGIVER; accept removes that bit → 0 when only that flag is set.
  const prior = UNIT_NPC_FLAG_QUESTGIVER_EPL;
  const resultFlags = prior & ~UNIT_NPC_FLAG_QUESTGIVER_EPL;
  return [
    {
      kind: 'modify_npc_flags',
      flag: UNIT_NPC_FLAG_QUESTGIVER_EPL,
      changeFlag: NPC_FLAG_CHANGE_REMOVE,
      mode: 'remove',
      resultFlags,
      cite: citeQg,
    },
    {
      kind: 'skip',
      reason:
        'DoStartBalanceEvent timers + peasant/scourge wave AI - zone combat FO6',
      cite: citeStart,
    },
    {
      kind: 'skip',
      reason:
        `event end AreaExploredOrEventHappens(7622) at ${MAX_SAVED_PEASANT} saved - FO6 finishEscort`,
      cite: citeWin,
    },
    {
      kind: 'skip',
      reason:
        `event fail FailQuest(7622) at ${MAX_KILLED_PEASANT} slain - host fail FO6`,
      cite: citeFail,
    },
  ];
}

// Family pack: eastern_kingdoms/eastern_plaguelands.cpp Hooks: pQuestAcceptNPC
// QuestAccept_npc_eris_havenfire (7622).
function runEasternPlaguelands(phase: QuestScriptHook, questId: number): DbScriptIntent[] {
  if (phase !== 'accept') return [];
  if (questId === QUEST_BALANCE_OF_LIGHT_AND_SHADOW) return runErisHavenfireAccept();
  return [];
}

// ── eastern_kingdoms/gnomeregan/gnomeregan sourced constants ─────────────────
// Cite: gnomeregan.cpp npc_kernobee quest accept + FollowerAI end credit

/** Cite: gnomeregan.cpp:639 QUEST_A_FINE_MESS = 2904 Escort Kernobee out of Gnomeregan ("A Fine Mess"). */
const QUEST_A_FINE_MESS = 2904;
// Cite: scriptdev2.sql ScriptName='npc_kernobee' WHERE entry=7850 Bake starterCreatureEntries[0]=7850
// (Kernobee).
const NPC_KERNOBEE = 7850;
/** Cite: AIDefines.h:45 AI_EVENT_START_EVENT = 102 QuestAccept_npc_kernobee SendAIEvent event type. */
const AI_EVENT_START_EVENT = 102;
// Cite: Unit.h:97 UNIT_STAND_STATE_STAND = 0 ReceiveAIEvent stands Kernobee (UDB often ships him
// UNIT_STAND_STATE_DEAD=7). opcodes.ts UNIT_STAND_STATE_STAND re-export used below.
const UNIT_STAND_STATE_STAND_KERNOBEE = UNIT_STAND_STATE_STAND;
// Cite: gnomeregan.cpp:643–647 aKernobeePositions [0] end check {-330.92, -3.03, -152.85}; [1] door walkout
// {-297.32, -7.32, -152.85}. Zone-granular FO6 — coordinates documented, not simulated.
const KERNOBEE_END_POS = { x: -330.92, y: -3.03, z: -152.85 } as const;
/** Cite: gnomeregan.cpp:687 ForcedDespawn(2000) after end-pos credit. */
const KERNOBEE_DESPAWN_MS = 2000;

// QuestAccept_npc_kernobee — quest 2904 A Fine Mess: stand, then follow the player; reaching the
// exit gives the explore credit. Cite: gnomeregan.cpp:700–706, :661–687.
function runKernobeeAccept(questId: number): DbScriptIntent[] {
  const citeEvent =
    `gnomeregan.cpp:703 npc_kernobee (${NPC_KERNOBEE}) ` +
    'SendAIEvent(AI_EVENT_START_EVENT, player, creature, questId)';
  const citeStand =
    'gnomeregan.cpp:666 SetStandState(UNIT_STAND_STATE_STAND) via ReceiveAIEvent';
  const citeFollow =
    'gnomeregan.cpp:667 StartFollow(player, 0, quest) - FO6 degraded FollowerAI finishEscort';
  const citeCredit =
    `gnomeregan.cpp:681–687 end-pos (${KERNOBEE_END_POS.x},${KERNOBEE_END_POS.y},${KERNOBEE_END_POS.z}) ` +
    `RewardPlayerAndGroupAtEventExplored(2904) + ForcedDespawn(${KERNOBEE_DESPAWN_MS}) - FO6 finishEscort`;
  return [
    {
      kind: 'send_ai_event',
      eventType: AI_EVENT_START_EVENT,
      radius: 0,
      value: questId,
      mode: 'receive_on_source',
      cite: citeEvent,
    },
    {
      kind: 'stand_state',
      standState: UNIT_STAND_STATE_STAND_KERNOBEE,
      cite: citeStand,
    },
    {
      kind: 'skip',
      reason:
        'StartFollow(player, 0, quest) - FO6 degraded FollowerAI finishEscort (Clockwerk Run)',
      cite: citeFollow,
    },
    {
      kind: 'skip',
      reason:
        `end-pos RewardPlayerAndGroupAtEventExplored(2904) + MovePoint door + ForcedDespawn(${KERNOBEE_DESPAWN_MS}) - FO6 finishEscort`,
      cite: citeCredit,
    },
  ];
}

// Family pack: eastern_kingdoms/gnomeregan/gnomeregan.cpp Hooks: pQuestAcceptNPC QuestAccept_npc_kernobee
// (2904). (npc_blastmaster_emi_shortfuse is instance encounter gossip — not a quest hook.)
function runGnomeregan(phase: QuestScriptHook, questId: number): DbScriptIntent[] {
  if (phase !== 'accept') return [];
  if (questId === QUEST_A_FINE_MESS) return runKernobeeAccept(questId);
  return [];
}

// ── eastern_kingdoms/hinterlands sourced constants ───────────────────────────
// Cite: hinterlands.cpp npc_00x09hl + npc_rinji quest accept escorts

// Cite: hinterlands.cpp:49 QUEST_RESQUE_OOX_09 = 836 Escort Homing Robot OOX-09/HL ("Rescue OOX-09/HL!").
const QUEST_RESQUE_OOX_09 = 836;
// Cite: hinterlands.cpp:182 QUEST_RINJI_TRAPPED = 2742 Escort Rin'ji from Quel'Danil Lodge ("Rin'ji is
// Trapped!").
const QUEST_RINJI_TRAPPED = 2742;
// Cite: bake starterCreatureEntries / classic-db creature_questrelation Homing Robot OOX-09/HL (npc_00x09hl
// script name).
const NPC_OOX_09_HL = 7806;
/** Cite: bake starterCreatureEntries — Rin'ji (npc_rinji). */
const NPC_RINJI = 7780;
/** Cite: hinterlands.cpp:43 SAY_OOX_START = -1000287 DoScriptText on OOX accept. */
const SAY_OOX_START = -1000287;
// Cite: ScriptDevAIMgr.h:53 FACTION_ESCORT_N_FRIEND_ACTIVE = 495 QuestAccept_npc_00x09hl
// SetFactionTemporary.
const FACTION_ESCORT_N_FRIEND_ACTIVE = 495;
// Cite: Creature.h:577 TEMPFACTION_RESTORE_RESPAWN = 0x01 (shared enum — same value as arathi
// TEMPFACTION_RESTORE_RESPAWN).
const TEMPFACTION_RESTORE_RESPAWN_HL = TEMPFACTION_RESTORE_RESPAWN;
// Cite: Creature.h:582 TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x20 Combined with RESTORE_RESPAWN in OOX
// SetFactionTemporary flags.
const TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x20;
// Cite: hinterlands.cpp:155 TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x01 | 0x20 =
// 0x21
const OOX_TEMP_FACTION_FLAGS =
  TEMPFACTION_RESTORE_RESPAWN_HL | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC;
// Cite: Unit.h:97 UNIT_STAND_STATE_STAND = 0 OOX Reset() ships DEAD; accept stands him. opcodes.ts
// re-export.
const UNIT_STAND_STATE_STAND_OOX = UNIT_STAND_STATE_STAND;
/** Cite: hinterlands.cpp:185 GO_RINJI_CAGE = 142036 Accept opens nearest cage via UseDoorOrButton. */
const GO_RINJI_CAGE = 142036;
// Cite: Unit.h:477 UNIT_FLAG_IMMUNE_TO_NPC = 0x00000200 QuestAccept_npc_rinji removes this after escort
// Start.
const UNIT_FLAG_IMMUNE_TO_NPC_HL = 0x00000200;

// QuestAccept_npc_00x09hl — quest 836 Rescue OOX-09/HL!: say, stand, temporary escort faction and
// Start; WP65 carries the explore credit. Cite: hinterlands.cpp:148–161 and :81–85.
function runOox09hlAccept(): DbScriptIntent[] {
  const citeTalk =
    `hinterlands.cpp:152 npc_00x09hl (${NPC_OOX_09_HL}) DoScriptText(SAY_OOX_START)`;
  const citeActive = 'hinterlands.cpp:153 SetActiveObjectState(true)';
  const citeStand = 'hinterlands.cpp:154 SetStandState(UNIT_STAND_STATE_STAND)';
  const citeFaction =
    'hinterlands.cpp:155 SetFactionTemporary(FACTION_ESCORT_N_FRIEND_ACTIVE, ' +
    'TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC)';
  const citeEscort =
    'hinterlands.cpp:157–158 npc_escortAI::Start(false, player, quest) - FO6 degraded finishEscort';
  const citeCredit =
    'hinterlands.cpp:83–84 RewardPlayerAndGroupAtEventExplored(836) at WP65 - FO6 finishEscort';
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
      standState: UNIT_STAND_STATE_STAND_OOX,
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
        'escort Start(false, player, quest) - FO6 degraded finishEscort (ambush WPs + OOX end)',
      cite: citeEscort,
    },
    {
      kind: 'skip',
      reason:
        'escort end RewardPlayerAndGroupAtEventExplored(836) - FO6 finishEscort models credit',
      cite: citeCredit,
    },
  ];
}

// QuestAccept_npc_rinji — quest 2742 Rin'ji is Trapped!: open the cage, clear IMMUNE_TO_NPC and
// start the escort; WP18 carries the credit. Cite: hinterlands.cpp:338–351 and :287–291.
function runRinjiAccept(): DbScriptIntent[] {
  const citeCage =
    `hinterlands.cpp:342–343 GetClosestGameObjectWithEntry(GO_RINJI_CAGE=${GO_RINJI_CAGE}) ` +
    'UseDoorOrButton - host GO activation';
  const citeEscort =
    `hinterlands.cpp:345–346 npc_rinji (${NPC_RINJI}) npc_escortAI::Start(false, player, quest) - FO6 degraded finishEscort`;
  const citeFlags =
    'hinterlands.cpp:348 RemoveFlag(UNIT_FIELD_FLAGS, UNIT_FLAG_IMMUNE_TO_NPC)';
  const citeCredit =
    'hinterlands.cpp:288–289 RewardPlayerAndGroupAtEventExplored(2742) at WP18 - FO6 finishEscort';
  // Cage creature ships immune; remove → 0 when only that bit set.
  const priorFlags = UNIT_FLAG_IMMUNE_TO_NPC_HL;
  const resultFlags = priorFlags & ~UNIT_FLAG_IMMUNE_TO_NPC_HL;
  return [
    {
      kind: 'skip',
      reason: `UseDoorOrButton on GO_RINJI_CAGE (${GO_RINJI_CAGE}) - host GO activation`,
      cite: citeCage,
    },
    {
      kind: 'skip',
      reason:
        'escort Start(false, player, quest) - FO6 degraded finishEscort (ambush WPs + Rinji complete)',
      cite: citeEscort,
    },
    {
      kind: 'modify_unit_flags',
      flag: UNIT_FLAG_IMMUNE_TO_NPC_HL,
      changeFlag: UNIT_FLAG_CHANGE_REMOVE,
      mode: 'remove',
      resultFlags,
      cite: citeFlags,
    },
    {
      kind: 'skip',
      reason:
        'escort end RewardPlayerAndGroupAtEventExplored(2742) - FO6 finishEscort models credit',
      cite: citeCredit,
    },
  ];
}

// Family pack: eastern_kingdoms/hinterlands.cpp Hooks: pQuestAcceptNPC QuestAccept_npc_00x09hl (836),
// QuestAccept_npc_rinji (2742).
function runHinterlands(phase: QuestScriptHook, questId: number): DbScriptIntent[] {
  if (phase !== 'accept') return [];
  if (questId === QUEST_RESQUE_OOX_09) return runOox09hlAccept();
  if (questId === QUEST_RINJI_TRAPPED) return runRinjiAccept();
  return [];
}

// ── eastern_kingdoms/loch_modan sourced constants ────────────────────────────
// Cite: loch_modan.cpp npc_miran quest accept escort

// Cite: loch_modan.cpp:39 QUEST_PROTECTING_THE_SHIPMENT = 309 Escort Miran from Thelsamar to Ironband's
// Excavation ("Protecting the Shipment").
const QUEST_PROTECTING_THE_SHIPMENT = 309;
/** Cite: bake starterCreatureEntries / classic-db creature_questrelation Miran (npc_miran script name). */
const NPC_MIRAN = 1379;
/** Cite: loch_modan.cpp:48 MIRAN_ESCORT_PATH = 1379 Path id passed to npc_escortAI::Start on accept. */
const MIRAN_ESCORT_PATH = 1379;
// Cite: loch_modan.cpp:46 NPC_DARK_IRON_RAIDER = 2149 Ambush summons at escort WP17 (not accept-hook — FO6
// zone).
const NPC_DARK_IRON_RAIDER = 2149;
/** Cite: loch_modan.cpp:94 ForcedDespawn(15000) at WP21 after explore credit. */
const MIRAN_DESPAWN_MS = 15000;
// Cite: loch_modan.cpp:41–43 SAY_MIRAN_1/2/3 (broadcast_text) — waypoint talk, not accept-hook. Documented
// for whole-chain mapping.
const SAY_MIRAN_1 = 510;
const SAY_MIRAN_2 = 511;
const SAY_MIRAN_3 = 498;

// QuestAccept_npc_miran — quest 309 Protecting the Shipment: escort path 1379, with the WP21
// explore credit and a WP17 ambush. Cite: loch_modan.cpp:123–131 and :77–120.
function runMiranAccept(): DbScriptIntent[] {
  const citeEscort =
    `loch_modan.cpp:127–128 npc_miran (${NPC_MIRAN}) npc_escortAI::Start(` +
    `false, player, quest, false, false, MIRAN_ESCORT_PATH=${MIRAN_ESCORT_PATH}) - FO6 degraded finishEscort`;
  const citeAmbush =
    `loch_modan.cpp:84–87 WP17 SummonCreature(NPC_DARK_IRON_RAIDER=${NPC_DARK_IRON_RAIDER} ×2) ` +
    `+ SAY_MIRAN_1=${SAY_MIRAN_1}/SAY_MIRAN_2=${SAY_MIRAN_2} - FO6 zone ambush`;
  const citeCredit =
    `loch_modan.cpp:89–94 WP21 DoBroadcastText(SAY_MIRAN_3=${SAY_MIRAN_3}) + ` +
    `RewardPlayerAndGroupAtEventExplored(309) + ForcedDespawn(${MIRAN_DESPAWN_MS}) - FO6 finishEscort`;
  return [
    {
      kind: 'skip',
      reason:
        `escort Start(false, player, quest, false, false, path=${MIRAN_ESCORT_PATH}) - FO6 degraded finishEscort`,
      cite: citeEscort,
    },
    {
      kind: 'skip',
      reason:
        `WP17 ambush NPC_DARK_IRON_RAIDER (${NPC_DARK_IRON_RAIDER}) ×2 - FO6 zone ambush`,
      cite: citeAmbush,
    },
    {
      kind: 'skip',
      reason:
        `WP21 RewardPlayerAndGroupAtEventExplored(309) + ForcedDespawn(${MIRAN_DESPAWN_MS}) - FO6 finishEscort`,
      cite: citeCredit,
    },
  ];
}

// Family pack: eastern_kingdoms/loch_modan.cpp Hooks: pQuestAcceptNPC QuestAccept_npc_miran (309).
// (SDComment mentions 3181 Pebblebitty gossip gate — not a quest accept/reward hook.)
function runLochModan(phase: QuestScriptHook, questId: number): DbScriptIntent[] {
  if (phase !== 'accept') return [];
  if (questId === QUEST_PROTECTING_THE_SHIPMENT) return runMiranAccept();
  return [];
}

// Registry map — string family keys and numeric quest ids. next-batch.mjs accepts [id],
// 'family/id', family: and questId(s):. Keys stay here so the parser sees them.
export const QUEST_SCRIPT_REGISTRY: Record<string | number, QuestScriptEntry> = {
  // Arathi Highlands — Sunken Treasure (665) + Hints of a New Plague? (660). Cite:
  // ScriptDevAI/scripts/eastern_kingdoms/arathi_highlands.cpp
  'eastern_kingdoms/arathi_highlands': {
    family: 'eastern_kingdoms/arathi_highlands',
    questIds: [QUEST_SUNKEN_TREASURE, QUEST_HINTS_NEW_PLAGUE],
    hooks: ['accept'],
    cite: 'eastern_kingdoms/arathi_highlands.cpp:103–114,204–212,248–254',
    run: runArathiHighlands,
  },
  // Quest-keyed aliases so resolveQuestScript hits O(1) on the primary claim.
  [QUEST_SUNKEN_TREASURE]: {
    family: 'eastern_kingdoms/arathi_highlands',
    questId: QUEST_SUNKEN_TREASURE,
    questIds: [QUEST_SUNKEN_TREASURE],
    hooks: ['accept'],
    cite: 'eastern_kingdoms/arathi_highlands.cpp:103–114 QuestAccept_npc_professor_phizzlethorpe',
    run: runArathiHighlands,
  },
  [QUEST_HINTS_NEW_PLAGUE]: {
    family: 'eastern_kingdoms/arathi_highlands',
    questId: QUEST_HINTS_NEW_PLAGUE,
    questIds: [QUEST_HINTS_NEW_PLAGUE],
    hooks: ['accept'],
    cite: 'eastern_kingdoms/arathi_highlands.cpp:248–254 QuestAccept_npc_kinelory',
    run: runArathiHighlands,
  },

  // Blackrock Depths — Jail Break (4322), The Challenge (9015), plus the Love Potion (4201) and
  // Rocknot's Ale (4295) reward hooks. Cite: eastern_kingdoms/blackrock_depths.cpp.
  'eastern_kingdoms/blackrock_depths/blackrock_depths': {
    family: 'eastern_kingdoms/blackrock_depths/blackrock_depths',
    questIds: [
      QUEST_JAIL_BREAK,
      QUEST_THE_CHALLENGE,
      QUEST_POTION_LOVE,
      QUEST_ALE,
    ],
    hooks: ['accept', 'reward', 'frame', 'complete'],
    cite:
      'eastern_kingdoms/blackrock_depths/blackrock_depths.cpp:727–742,837–850,1081–1107,1360–1372,298–307',
    run: runBlackrockDepths,
  },
  [QUEST_JAIL_BREAK]: {
    family: 'eastern_kingdoms/blackrock_depths/blackrock_depths',
    questId: QUEST_JAIL_BREAK,
    questIds: [QUEST_JAIL_BREAK],
    hooks: ['accept'],
    cite: 'blackrock_depths.cpp:1360–1372 QuestAccept_npc_marshal_windsor',
    run: runBlackrockDepths,
  },
  [QUEST_THE_CHALLENGE]: {
    family: 'eastern_kingdoms/blackrock_depths/blackrock_depths',
    questId: QUEST_THE_CHALLENGE,
    questIds: [QUEST_THE_CHALLENGE],
    hooks: ['frame', 'complete'],
    cite: 'blackrock_depths.cpp:298–307 DoChallengeQuestCredit',
    run: runBlackrockDepths,
  },
  [QUEST_POTION_LOVE]: {
    family: 'eastern_kingdoms/blackrock_depths/blackrock_depths',
    questId: QUEST_POTION_LOVE,
    questIds: [QUEST_POTION_LOVE],
    hooks: ['reward'],
    cite: 'blackrock_depths.cpp:837–850 QuestRewarded_npc_mistress_nagmara',
    run: runBlackrockDepths,
  },
  [QUEST_ALE]: {
    family: 'eastern_kingdoms/blackrock_depths/blackrock_depths',
    questId: QUEST_ALE,
    questIds: [QUEST_ALE],
    hooks: ['reward'],
    cite: 'blackrock_depths.cpp:1081–1107 QuestRewarded_npc_rocknot',
    run: runBlackrockDepths,
  },

  // Blackwing Lair — Nefarius's Corruption (8730) via Vaelastrasz quest accept. Cite:
  // ScriptDevAI/scripts/eastern_kingdoms/blackwing_lair/boss_vaelastrasz.cpp
  'eastern_kingdoms/blackwing_lair/boss_vaelastrasz': {
    family: 'eastern_kingdoms/blackwing_lair/boss_vaelastrasz',
    questIds: [QUEST_NEFARIUS_CORRUPTION],
    hooks: ['accept'],
    cite: 'eastern_kingdoms/blackwing_lair/boss_vaelastrasz.cpp:359–368',
    run: runBossVaelastrasz,
  },
  [QUEST_NEFARIUS_CORRUPTION]: {
    family: 'eastern_kingdoms/blackwing_lair/boss_vaelastrasz',
    questId: QUEST_NEFARIUS_CORRUPTION,
    questIds: [QUEST_NEFARIUS_CORRUPTION],
    hooks: ['accept'],
    cite: 'boss_vaelastrasz.cpp:359–368 QuestAccept_boss_vaelastrasz',
    run: runBossVaelastrasz,
  },

  // Burning Steppes — Precarious Predicament (4121) via the Grark Lorkrub accept. The quest is
  // absent from the current bake though classic-db has it. Cite: burning_steppes.cpp.
  'eastern_kingdoms/burning_steppes': {
    family: 'eastern_kingdoms/burning_steppes',
    questIds: [QUEST_PRECARIOUS_PREDICAMENT],
    hooks: ['accept'],
    cite: 'eastern_kingdoms/burning_steppes.cpp:324–335,240–246',
    run: runBurningSteppes,
  },
  [QUEST_PRECARIOUS_PREDICAMENT]: {
    family: 'eastern_kingdoms/burning_steppes',
    questId: QUEST_PRECARIOUS_PREDICAMENT,
    questIds: [QUEST_PRECARIOUS_PREDICAMENT],
    hooks: ['accept'],
    cite: 'burning_steppes.cpp:324–335 QuestAccept_npc_grark_lorkrub',
    run: runBurningSteppes,
  },

  // Eastern Plaguelands — The Balance of Light and Shadow (7622) via Eris Havenfire. Cite:
  // ScriptDevAI/scripts/eastern_kingdoms/eastern_plaguelands.cpp
  'eastern_kingdoms/eastern_plaguelands': {
    family: 'eastern_kingdoms/eastern_plaguelands',
    questIds: [QUEST_BALANCE_OF_LIGHT_AND_SHADOW],
    hooks: ['accept'],
    cite: 'eastern_kingdoms/eastern_plaguelands.cpp:227–233,345–354,235–244',
    run: runEasternPlaguelands,
  },
  [QUEST_BALANCE_OF_LIGHT_AND_SHADOW]: {
    family: 'eastern_kingdoms/eastern_plaguelands',
    questId: QUEST_BALANCE_OF_LIGHT_AND_SHADOW,
    questIds: [QUEST_BALANCE_OF_LIGHT_AND_SHADOW],
    hooks: ['accept'],
    cite: 'eastern_plaguelands.cpp:345–354 QuestAccept_npc_eris_havenfire',
    run: runEasternPlaguelands,
  },

  // Gnomeregan — A Fine Mess (2904) via Kernobee FollowerAI quest accept. Cite:
  // ScriptDevAI/scripts/eastern_kingdoms/gnomeregan/gnomeregan.cpp
  'eastern_kingdoms/gnomeregan/gnomeregan': {
    family: 'eastern_kingdoms/gnomeregan/gnomeregan',
    questIds: [QUEST_A_FINE_MESS],
    hooks: ['accept'],
    cite: 'eastern_kingdoms/gnomeregan/gnomeregan.cpp:661–668,678–687,700–706',
    run: runGnomeregan,
  },
  [QUEST_A_FINE_MESS]: {
    family: 'eastern_kingdoms/gnomeregan/gnomeregan',
    questId: QUEST_A_FINE_MESS,
    questIds: [QUEST_A_FINE_MESS],
    hooks: ['accept'],
    cite: 'gnomeregan.cpp:700–706 QuestAccept_npc_kernobee',
    run: runGnomeregan,
  },

  // The Hinterlands — Rescue OOX-09/HL! (836) + Rin'ji is Trapped! (2742). Cite:
  // ScriptDevAI/scripts/eastern_kingdoms/hinterlands.cpp
  'eastern_kingdoms/hinterlands': {
    family: 'eastern_kingdoms/hinterlands',
    questIds: [QUEST_RESQUE_OOX_09, QUEST_RINJI_TRAPPED],
    hooks: ['accept'],
    cite: 'eastern_kingdoms/hinterlands.cpp:148–161,338–351,81–85,287–291',
    run: runHinterlands,
  },
  [QUEST_RESQUE_OOX_09]: {
    family: 'eastern_kingdoms/hinterlands',
    questId: QUEST_RESQUE_OOX_09,
    questIds: [QUEST_RESQUE_OOX_09],
    hooks: ['accept'],
    cite: 'hinterlands.cpp:148–161 QuestAccept_npc_00x09hl',
    run: runHinterlands,
  },
  [QUEST_RINJI_TRAPPED]: {
    family: 'eastern_kingdoms/hinterlands',
    questId: QUEST_RINJI_TRAPPED,
    questIds: [QUEST_RINJI_TRAPPED],
    hooks: ['accept'],
    cite: 'hinterlands.cpp:338–351 QuestAccept_npc_rinji',
    run: runHinterlands,
  },

  // Loch Modan — Protecting the Shipment (309) via Miran quest accept escort. Cite:
  // ScriptDevAI/scripts/eastern_kingdoms/loch_modan.cpp
  'eastern_kingdoms/loch_modan': {
    family: 'eastern_kingdoms/loch_modan',
    questIds: [QUEST_PROTECTING_THE_SHIPMENT],
    hooks: ['accept'],
    cite: 'eastern_kingdoms/loch_modan.cpp:123–131,77–96',
    run: runLochModan,
  },
  [QUEST_PROTECTING_THE_SHIPMENT]: {
    family: 'eastern_kingdoms/loch_modan',
    questId: QUEST_PROTECTING_THE_SHIPMENT,
    questIds: [QUEST_PROTECTING_THE_SHIPMENT],
    hooks: ['accept'],
    cite: 'loch_modan.cpp:123–131 QuestAccept_npc_miran',
    run: runLochModan,
  },

  // Redridge Mountains — Missing In Action (219) via Corporal Keeshan escort. Cite:
  // ScriptDevAI/scripts/eastern_kingdoms/redridge_mountains.cpp
  'eastern_kingdoms/redridge_mountains': {
    family: 'eastern_kingdoms/redridge_mountains',
    questIds: [QUEST_MISSING_IN_ACTION],
    hooks: ['accept'],
    cite: 'eastern_kingdoms/redridge_mountains.cpp:52–59,92–98,62–84',
    run: runRedridgeMountains,
  },
  [QUEST_MISSING_IN_ACTION]: {
    family: 'eastern_kingdoms/redridge_mountains',
    questId: QUEST_MISSING_IN_ACTION,
    questIds: [QUEST_MISSING_IN_ACTION],
    hooks: ['accept'],
    cite: 'redridge_mountains.cpp:92–98 QuestAccept_npc_corporal_keeshan',
    run: runRedridgeMountains,
  },

  // Searing Gorge — Suntara Stones (3367) via Dorius Stonetender escort. Cite:
  // ScriptDevAI/scripts/eastern_kingdoms/searing_gorge.cpp
  'eastern_kingdoms/searing_gorge': {
    family: 'eastern_kingdoms/searing_gorge',
    questIds: [QUEST_SUNTARA_STONES],
    hooks: ['accept'],
    cite: 'eastern_kingdoms/searing_gorge.cpp:79–87,89–99,140–149',
    run: runSearingGorge,
  },
  [QUEST_SUNTARA_STONES]: {
    family: 'eastern_kingdoms/searing_gorge',
    questId: QUEST_SUNTARA_STONES,
    questIds: [QUEST_SUNTARA_STONES],
    hooks: ['accept'],
    cite: 'searing_gorge.cpp:140–149 QuestAccept_npc_dorius_stonetender',
    run: runSearingGorge,
  },

  // Silverpine Forest — Escorting Erland (435) + Pyrewood Ambush (452). Cite:
  // ScriptDevAI/scripts/eastern_kingdoms/silverpine_forest.cpp
  'eastern_kingdoms/silverpine_forest': {
    family: 'eastern_kingdoms/silverpine_forest',
    questIds: [QUEST_ERLAND, QUEST_PYREWOOD_AMBUSH],
    hooks: ['accept'],
    cite: 'eastern_kingdoms/silverpine_forest.cpp:115–125,190–199,290–300,63–99,226–244',
    run: runSilverpineForest,
  },
  [QUEST_ERLAND]: {
    family: 'eastern_kingdoms/silverpine_forest',
    questId: QUEST_ERLAND,
    questIds: [QUEST_ERLAND],
    hooks: ['accept'],
    cite: 'silverpine_forest.cpp:115–125 QuestAccept_npc_deathstalker_erland',
    run: runSilverpineForest,
  },
  [QUEST_PYREWOOD_AMBUSH]: {
    family: 'eastern_kingdoms/silverpine_forest',
    questId: QUEST_PYREWOOD_AMBUSH,
    questIds: [QUEST_PYREWOOD_AMBUSH],
    hooks: ['accept'],
    cite: 'silverpine_forest.cpp:290–300 QuestAccept_npc_deathstalker_faerleia',
    run: runSilverpineForest,
  },

  // Stormwind City — 1447 / 1640 / 6402 / 6403. Cite: stormwind_city.cpp
  'eastern_kingdoms/stormwind_city': {
    family: 'eastern_kingdoms/stormwind_city',
    questIds: [QUEST_MISSING_DIPLO_PT8, QUEST_BEAT, QUEST_STORMWIND_RENDEZVOUS, QUEST_THE_GREAT_MASQUERADE],
    hooks: ['accept'],
    cite: 'stormwind_city.cpp:72–79,413–447,1273–1281,663–700,1212–1216',
    run: runStormwindCity,
  },
  [QUEST_MISSING_DIPLO_PT8]: {
    family: 'eastern_kingdoms/stormwind_city', questId: QUEST_MISSING_DIPLO_PT8,
    questIds: [QUEST_MISSING_DIPLO_PT8], hooks: ['accept'],
    cite: 'stormwind_city.cpp:413–447 QuestAccept_npc_dashel_stonefist', run: runStormwindCity,
  },
  [QUEST_BEAT]: {
    family: 'eastern_kingdoms/stormwind_city', questId: QUEST_BEAT,
    questIds: [QUEST_BEAT], hooks: ['accept'],
    cite: 'stormwind_city.cpp:72–79 QuestAccept_npc_bartleby', run: runStormwindCity,
  },
  [QUEST_STORMWIND_RENDEZVOUS]: {
    family: 'eastern_kingdoms/stormwind_city', questId: QUEST_STORMWIND_RENDEZVOUS,
    questIds: [QUEST_STORMWIND_RENDEZVOUS], hooks: ['accept'],
    cite: 'stormwind_city.cpp:663–700 squire_rowe gossip (no pQuestAcceptNPC)', run: runStormwindCity,
  },
  [QUEST_THE_GREAT_MASQUERADE]: {
    family: 'eastern_kingdoms/stormwind_city', questId: QUEST_THE_GREAT_MASQUERADE,
    questIds: [QUEST_THE_GREAT_MASQUERADE], hooks: ['accept'],
    cite: 'stormwind_city.cpp:1273–1281 QuestAccept_npc_reginald_windsor', run: runStormwindCity,
  },
  // Stranglethorn Vale — 592 Saving Yenniku (mob_yenniku SpellHit residual).
  'eastern_kingdoms/stranglethorn_vale': {
    family: 'eastern_kingdoms/stranglethorn_vale', questIds: [QUEST_SAVING_YENNIKU],
    hooks: ['frame', 'complete'], cite: 'stranglethorn_vale.cpp:55–82,84–96 mob_yenniku SpellHit',
    run: runStranglethornVale,
  },
  [QUEST_SAVING_YENNIKU]: {
    family: 'eastern_kingdoms/stranglethorn_vale', questId: QUEST_SAVING_YENNIKU,
    questIds: [QUEST_SAVING_YENNIKU], hooks: ['frame', 'complete'],
    cite: 'stranglethorn_vale.cpp:55–82 SpellHit + EnterEvadeMode', run: runStranglethornVale,
  },
  // Stratholme — 5122 Aurius reward + 5282 Restless Soul residual (census).
  'eastern_kingdoms/stratholme/stratholmeScripts': {
    family: 'eastern_kingdoms/stratholme/stratholmeScripts',
    questIds: [QUEST_MEDALLION_FAITH, QUEST_RESTLESS_SOUL], hooks: ['reward', 'frame', 'complete'],
    cite: 'stratholmeScripts.cpp:316–329,165–198; stratholme.cpp:475–482', run: runStratholmeScripts,
  },
  [QUEST_MEDALLION_FAITH]: {
    family: 'eastern_kingdoms/stratholme/stratholmeScripts', questId: QUEST_MEDALLION_FAITH,
    questIds: [QUEST_MEDALLION_FAITH], hooks: ['reward'], run: runStratholmeScripts,
    cite: 'stratholmeScripts.cpp:316–329 QuestRewarded_npc_aurius',
  },
  [QUEST_RESTLESS_SOUL]: {
    family: 'eastern_kingdoms/stratholme/stratholmeScripts', questId: QUEST_RESTLESS_SOUL,
    questIds: [QUEST_RESTLESS_SOUL], hooks: ['frame', 'complete'], run: runStratholmeScripts,
    cite: 'stratholmeScripts.cpp:165–198 mob_restless_soul credit',
  },
  // Sunken Temple — 8555 Charge of the Dragonflights (AT residual → Malfurion).
  'eastern_kingdoms/sunken_temple/sunken_templeScripts': {
    family: 'eastern_kingdoms/sunken_temple/sunken_templeScripts',
    questIds: [QUEST_THE_CHARGE_OF_DRAGONFLIGHTS],
    hooks: ['frame', 'complete'],
    cite: 'sunken_templeScripts.cpp:44–61,78–143 AreaTrigger_at_shade_of_eranikus',
    run: runSunkenTempleScripts,
  },
  [QUEST_THE_CHARGE_OF_DRAGONFLIGHTS]: {
    family: 'eastern_kingdoms/sunken_temple/sunken_templeScripts',
    questId: QUEST_THE_CHARGE_OF_DRAGONFLIGHTS,
    questIds: [QUEST_THE_CHARGE_OF_DRAGONFLIGHTS],
    hooks: ['frame', 'complete'],
    cite: 'sunken_templeScripts.cpp:44–61 AT gate on rewarded 8555',
    run: runSunkenTempleScripts,
  },

  // Swamp of Sorrows — Galen's Escape (1393) via Galen Goodward escort. Cite:
  // ScriptDevAI/scripts/eastern_kingdoms/swamp_of_sorrows.cpp
  'eastern_kingdoms/swamp_of_sorrows': {
    family: 'eastern_kingdoms/swamp_of_sorrows',
    questIds: [QUEST_GALENS_ESCAPE],
    hooks: ['accept'],
    cite: 'eastern_kingdoms/swamp_of_sorrows.cpp:139–152,70–117',
    run: runSwampOfSorrows,
  },
  [QUEST_GALENS_ESCAPE]: {
    family: 'eastern_kingdoms/swamp_of_sorrows',
    questId: QUEST_GALENS_ESCAPE,
    questIds: [QUEST_GALENS_ESCAPE],
    hooks: ['accept'],
    cite: 'swamp_of_sorrows.cpp:139–152 QuestAccept_npc_galen_goodward',
    run: runSwampOfSorrows,
  },

  // Tirisfal Glades — A Rogue's Deal (590) Calvin duel + Ulag the Cleaver (1819) mausoleum GO residual.
  // Cite: ScriptDevAI/scripts/eastern_kingdoms/tirisfal_glades.cpp
  'eastern_kingdoms/tirisfal_glades': {
    family: 'eastern_kingdoms/tirisfal_glades',
    questIds: [QUEST_590, QUEST_ULAG],
    hooks: ['accept', 'frame', 'complete'],
    cite: 'eastern_kingdoms/tirisfal_glades.cpp:47–75,109–178',
    run: runTirisfalGlades,
  },
  [QUEST_590]: {
    family: 'eastern_kingdoms/tirisfal_glades',
    questId: QUEST_590,
    questIds: [QUEST_590],
    hooks: ['accept'],
    cite: 'tirisfal_glades.cpp:170–178 QuestAccept_npc_calvin_montague',
    run: runTirisfalGlades,
  },
  [QUEST_ULAG]: {
    family: 'eastern_kingdoms/tirisfal_glades',
    questId: QUEST_ULAG,
    questIds: [QUEST_ULAG],
    hooks: ['frame', 'complete'],
    cite: 'tirisfal_glades.cpp:47–75 GOUse_go_mausoleum_door/trigger',
    run: runTirisfalGlades,
  },

  // Western Plaguelands — Scarlet Subterfuge (5862) reward + In Dreams (5944) accept via Taelan Fordring.
  // Cite: ScriptDevAI/scripts/eastern_kingdoms/western_plaguelands.cpp
  'eastern_kingdoms/western_plaguelands': {
    family: 'eastern_kingdoms/western_plaguelands',
    questIds: [QUEST_SCARLET_SUBTERFUGE, QUEST_IN_DREAMS],
    hooks: ['accept', 'reward'],
    cite: 'eastern_kingdoms/western_plaguelands.cpp:653–667,319–328,398–418,559–564',
    run: runWesternPlaguelands,
  },
  [QUEST_SCARLET_SUBTERFUGE]: {
    family: 'eastern_kingdoms/western_plaguelands',
    questId: QUEST_SCARLET_SUBTERFUGE,
    questIds: [QUEST_SCARLET_SUBTERFUGE],
    hooks: ['reward'],
    cite: 'western_plaguelands.cpp:661–667 QuestRewarded_npc_taelan_fordring',
    run: runWesternPlaguelands,
  },
  [QUEST_IN_DREAMS]: {
    family: 'eastern_kingdoms/western_plaguelands',
    questId: QUEST_IN_DREAMS,
    questIds: [QUEST_IN_DREAMS],
    hooks: ['accept'],
    cite: 'western_plaguelands.cpp:653–659 QuestAccept_npc_taelan_fordring',
    run: runWesternPlaguelands,
  },

  // Westfall — 1651 Daphne / 155 Defias Traitor. Cite: westfall.cpp
  'eastern_kingdoms/westfall': {
    family: 'eastern_kingdoms/westfall',
    questIds: [QUEST_TOME_VALOR, QUEST_DEFIAS_BROTHERHOOD],
    hooks: ['accept'],
    cite: 'eastern_kingdoms/westfall.cpp:315–323,392–402,166–169,368–374',
    run: runWestfall,
  },
  [QUEST_TOME_VALOR]: {
    family: 'eastern_kingdoms/westfall', questId: QUEST_TOME_VALOR,
    questIds: [QUEST_TOME_VALOR], hooks: ['accept'],
    cite: 'westfall.cpp:315–323 QuestAccept_npc_daphne_stilwell', run: runWestfall,
  },
  [QUEST_DEFIAS_BROTHERHOOD]: {
    family: 'eastern_kingdoms/westfall', questId: QUEST_DEFIAS_BROTHERHOOD,
    questIds: [QUEST_DEFIAS_BROTHERHOOD], hooks: ['accept'],
    cite: 'westfall.cpp:392–402 QuestAccept_npc_defias_traitor', run: runWestfall,
  },
  // Wetlands — 1249 Missing Diplomat (Mikhail → Slim). Cite: wetlands.cpp
  'eastern_kingdoms/wetlands': {
    family: 'eastern_kingdoms/wetlands',
    questIds: [QUEST_MISSING_DIPLOMAT11],
    hooks: ['accept'],
    cite: 'eastern_kingdoms/wetlands.cpp:207–223,158–163,98–115,165–176',
    run: runWetlands,
  },
  [QUEST_MISSING_DIPLOMAT11]: {
    family: 'eastern_kingdoms/wetlands', questId: QUEST_MISSING_DIPLOMAT11,
    questIds: [QUEST_MISSING_DIPLOMAT11], hooks: ['accept'],
    cite: 'wetlands.cpp:207–223 QuestAccept_npc_mikhail', run: runWetlands,
  },
  // MACHINE-READ by scripts/qi4/next-batch.mjs (greps /family:'…'/): spread-ins have no literal
  // key, so this IS their registration. Append, never reword. family: 'kalimdor/ashenvale' family: 'kalimdor/azshara' family: 'kalimdor/darkshore' family: 'kalimdor/desolace' family: 'kalimdor/dustwallow_marsh' family: 'kalimdor/felwood' family: 'kalimdor/feralas' family: 'kalimdor/moonglade' family: 'kalimdor/razorfen_downs/razorfen_downs' family: 'kalimdor/razorfen_kraul/razorfen_kraul' family: 'kalimdor/stonetalon_mountains' family: 'kalimdor/tanaris' family: 'kalimdor/teldrassil' family: 'kalimdor/the_barrens' family: 'kalimdor/thousand_needles' family: 'kalimdor/ungoro_crater' family: 'kalimdor/winterspring' family: 'world/areatrigger_scripts' family: 'world/go_scripts' family: 'world/npc_professions' family: 'world/npcs_special' family: 'world/war_effort'
  ...SIBLING_REGISTRIES,
};

/** Resolve a registry entry by quest id (direct key or family membership). */
export function resolveQuestScript(questId: number): QuestScriptEntry | undefined {
  const direct = QUEST_SCRIPT_REGISTRY[questId];
  if (direct) return direct;
  for (const entry of Object.values(QUEST_SCRIPT_REGISTRY)) {
    if (entry.questId === questId) return entry;
    if (entry.questIds?.includes(questId)) return entry;
  }
  return undefined;
}

export function isQuestScriptRegistered(questId: number): boolean {
  return resolveQuestScript(questId) != null;
}
