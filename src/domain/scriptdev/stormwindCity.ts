// Stormwind City ScriptDev IR ports. Source: eastern_kingdoms/stormwind_city.cpp — Bartleby,
// Dashel Stonefist, Katrana Prestor, Squire Rowe, Reginald Windsor, Mattingly and Afrasiabi.

import type { ScriptDevIR } from './types.ts';

// Constants — stormwind_city.cpp + world_eastern_kingdoms.h

// stormwind_city.cpp:45–47 npc_bartleby
export const FACTION_ENEMY = 168;
export const QUEST_BEAT = 1640;
export const NPC_BARTLEBY = 6090;

/** DamageTaken HP% gate — yield when post-hit HP would be < 15%. Cite: stormwind_city.cpp:60 */
export const BARTLEBY_YIELD_HP_PCT = 15;

// TEMPFACTION flags for Bartleby QuestAccept. Cite: Creature.h:577–578; stormwind_city.cpp:76
// TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_RESTORE_COMBAT_STOP
export const TEMPFACTION_RESTORE_RESPAWN = 0x01;
export const TEMPFACTION_RESTORE_COMBAT_STOP = 0x02;
export const BARTLEBY_TEMPFACTION_FLAGS =
  TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_RESTORE_COMBAT_STOP;

// stormwind_city.cpp:91–108 npc_dashel_stonefist
export const SAY_PROGRESS_1_DAS = 1961;
export const SAY_PROGRESS_2_DAS = 1712;
export const SAY_PROGRESS_3_DAS = 1713;
export const SAY_PROGRESS_4_THU = 1716;
export const SAY_PROGRESS_5_THU = 1715;
export const QUEST_MISSING_DIPLO_PT8 = 1447;
export const NPC_OLD_TOWN_THUG = 4969;
export const FACTION_NEUTRAL = 189;
export const FACTION_FRIENDLY_TO_ALL = 35;
/** Cite: stormwind_city.cpp:107 — enum present; SetDeathPrevention used in fight */
export const SPELL_UNKILLABLE_OFF = 13835;
export const NPC_DASHEL_STONEFIST = 4961;

// Dashel StartEvent delay after quest accept. Cite: stormwind_city.cpp:202 ResetTimer(DASHEL_START_EVENT,
// 2000)
export const DASHEL_START_EVENT_MS = 2000;

/** Low-HP yield threshold. Cite: stormwind_city.cpp:374 GetHealthPercent() <= 20.f */
export const DASHEL_YIELD_HP_PCT = 20;

// Evade timer after yield before MoveTargetedHome. Cite: stormwind_city.cpp:405
// ResetTimer(DASHEL_EVADE_EVENT, 2000)
export const DASHEL_EVADE_EVENT_MS = 2000;

// End-event stage arm after JustReachedHome. Cite: stormwind_city.cpp:263 / :269
// ResetTimer(DASHEL_END_EVENT, 3000)
export const DASHEL_END_EVENT_ARM_MS = 3000;

/** Thug TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN. Cite: stormwind_city.cpp:427 / :435 120000 */
export const DASHEL_THUG_DESPAWN_MS = 120_000;

/** Thug spawn / waypoint / reset positions. Cite: stormwind_city.cpp:110–123 */
export const DASHEL_THUG_SPAWN = [
  {
    x: -8687.311,
    y: 446.7531,
    z: 100.05593,
    o: 5.12632,
    cite: 'stormwind_city.cpp:111 aThugSpawnPosition[0]',
  },
  {
    x: -8669.205,
    y: 448.4405,
    z: 99.74935,
    o: 3.75387,
    cite: 'stormwind_city.cpp:112 aThugSpawnPosition[1]',
  },
] as const;

export const DASHEL_THUG_WAYPOINT = [
  {
    x: -8684.558,
    y: 442.7352,
    z: 99.480316,
    cite: 'stormwind_city.cpp:116 aThugWaypointPosition[0]',
  },
  {
    x: -8675.7,
    y: 443.8787,
    z: 99.641556,
    cite: 'stormwind_city.cpp:117 aThugWaypointPosition[1]',
  },
] as const;

export const DASHEL_THUG_RESET = [
  {
    x: -8686.397461,
    y: 447.595703,
    z: 99.994408,
    cite: 'stormwind_city.cpp:121 aThugResetPosition[0]',
  },
  {
    x: -8669.338867,
    y: 448.362976,
    z: 99.740005,
    cite: 'stormwind_city.cpp:122 aThugResetPosition[1]',
  },
] as const;

/** End-event stage timers (HandleEndEvent). Cite: stormwind_city.cpp:282–320 */
export const DASHEL_END_STAGE_TIMERS_MS = {
  /** case 1 → case 2 */
  1: 1500,
  /** case 2 → case 3 */
  2: 1000,
  /** case 3 → case 4 */
  3: 1500,
  /** case 4 → case 5 */
  4: 1000,
} as const;

// stormwind_city.cpp:454–460 / 467–494 Lady Katrana Prestor
export const GOSSIP_ITEM_KAT_1 = -3000120;
export const GOSSIP_ITEM_KAT_2 = -3000121;
export const GOSSIP_ITEM_KAT_3 = -3000122;
export const GOSSIP_ITEM_KAT_4 = -3000123;
export const GOSSIP_TEXT_KAT = [2693, 2694, 2695, 2696] as const;
export const QUEST_TRUE_MASTERS = 4185;
export const NPC_LADY_KATRANA_PRESTOR = 1749;
/** Bake starter/ender for 4185. Cite: quests.json; world_eastern_kingdoms.h NPC_BOLVAR */
export const NPC_BOLVAR = 1748;

// stormwind_city.cpp:503–523 Squire Rowe / Windsor intro
export const SAY_SIGNAL_SENT = -1000822;
export const SAY_DISMOUNT = -1000823;
export const SAY_WELCOME = -1000824;
export const GOSSIP_ITEM_WINDSOR = -3000106;
export const GOSSIP_TEXT_ID_DEFAULT = 9063;
export const GOSSIP_TEXT_ID_PROGRESS = 9064;
export const GOSSIP_TEXT_ID_START = 9065;
export const NPC_WINDSOR_MOUNT = 12581;
export const SPELL_BLUE_FIREWORK = 11540;
export const SPELL_DISMISS_HORSE = 20000;
export const SPELL_WINDSOR_INSPIRATION = 20273;
export const QUEST_STORMWIND_RENDEZVOUS = 6402;
export const QUEST_THE_GREAT_MASQUERADE = 6403;
export const NPC_SQUIRE_ROWE = 17804;

/** Intro dialogue step delays. Cite: stormwind_city.cpp:525–533 aIntroDialogue */
export const ROWE_INTRO_DIALOGUE = [
  { entry: 12580, delayMs: 3000, cite: 'stormwind_city.cpp:527 NPC_WINDSOR wait 3000' },
  { entry: 12581, delayMs: 1000, cite: 'stormwind_city.cpp:528 NPC_WINDSOR_MOUNT 1000' },
  { entry: -1000823, delayMs: 2000, cite: 'stormwind_city.cpp:529 SAY_DISMOUNT 2000' },
  { entry: 6402, delayMs: 2000, cite: 'stormwind_city.cpp:530 QUEST_STORMWIND_RENDEZVOUS face 2000' },
  { entry: 6403, delayMs: 0, cite: 'stormwind_city.cpp:531 QUEST_THE_GREAT_MASQUERADE welcome 0' },
] as const;

export const WINDSOR_SPAWN_LOC = {
  x: -9145.68,
  y: 373.79,
  z: 90.64,
  cite: 'stormwind_city.cpp:535 aWindsorSpawnLoc',
} as const;

export const WINDSOR_MOVE_LOC = {
  x: -9050.39,
  y: 443.55,
  z: 93.05,
  cite: 'stormwind_city.cpp:536 aWindsorMoveLoc',
} as const;

// world_eastern_kingdoms.h:8–12 + stormwind_city.cpp Windsor
export const NPC_JONATHAN = 466;
export const NPC_WRYNN = 1747;
export const NPC_PRESTOR = 1749;
export const NPC_WINDSOR = 12580;

// stormwind_city.cpp:707–775 combat + keep spells
export const SAY_WINDSOR_QUEST_ACCEPT = -1000825;
export const SAY_WINDSOR_GET_READY = -1000826;
export const SAY_PRESTOR_SIEZE = -1000827;
export const GOSSIP_ITEM_REGINALD = -3000107;
export const GOSSIP_TEXT_ID_MASQUERADE = 5633;
export const SPELL_ONYXIA_TRANSFORM = 20409;
export const SPELL_WINDSOR_READ = 20358;
export const SPELL_WINDSOR_DEATH = 20465;
export const SPELL_ONYXIA_DESPAWN = 20466;
export const SPELL_HAMMER_OF_JUSTICE = 10308;
export const SPELL_SHIELD_WALL = 871;
export const SPELL_STRONG_CLEAVE = 8255;
export const NPC_GUARD_ROYAL = 1756;
export const NPC_GUARD_CITY = 68;
export const NPC_GUARD_PATROLLER = 1976;
export const NPC_GUARD_ONYXIA = 12739;
export const MAX_ROYAL_GUARDS = 6;

/** Hammer of Justice Reset / re-arm. Cite: stormwind_city.cpp:888 urand(0, 1000); :1256 = 60000 */
export const WINDSOR_HAMMER_INIT_MIN_MS = 0;
export const WINDSOR_HAMMER_INIT_MAX_MS = 1000;
export const WINDSOR_HAMMER_REPEAT_MS = 60_000;

/** Strong Cleave Reset / re-arm. Cite: stormwind_city.cpp:889 urand(1000, 3000); :1264 urand(1000, 5000) */
export const WINDSOR_CLEAVE_INIT_MIN_MS = 1000;
export const WINDSOR_CLEAVE_INIT_MAX_MS = 3000;
export const WINDSOR_CLEAVE_REPEAT_MIN_MS = 1000;
export const WINDSOR_CLEAVE_REPEAT_MAX_MS = 5000;

// Guard-check poll while Onyxia guards alive. Cite: stormwind_city.cpp:1125 / :1244 m_guardCheckTimer =
// 1000
export const WINDSOR_GUARD_CHECK_MS = 1000;

// stormwind_city.cpp:1321–1328 Mattingly / Afrasiabi
export const GO_HEAD_OF_NEFARIAN_SW = 179882;
export const GO_HEAD_OF_ONYXIA_SW = 179558;
export const GOSSIP_HEAD_MAT = 5754;
export const GOSSIP_HEAD_AFRA = 6027;
export const NPC_MAJOR_MATTINGLY = 14394;
export const NPC_FIELD_MARSHAL_AFRASIABI = 14721;
/** Head GO search radius. Cite: stormwind_city.cpp:1333 / :1345 100.f */
export const HEAD_GO_SEARCH_YD = 100;

// Pure helpers — Bartleby

export interface BartlebyDamageTakenResult {
  /** Clamp damage so at least 1 HP remains. */
  clampDamage: boolean;
  /** New damage value when clampDamage (min(damage, health-1)). */
  damageOut: number;
  questCredit: boolean;
  questId: number | null;
  enterEvade: boolean;
  cite: string;
}

// Port of npc_bartlebyAI::DamageTaken. Cite: stormwind_city.cpp:58–68 Yields when damage would kill OR
// post-hit HP% would be < 15.
export function bartlebyDamageTaken(
  health: number,
  maxHealth: number,
  damage: number,
  dealerIsPlayer: boolean,
): BartlebyDamageTakenResult {
  if (maxHealth <= 0 || health <= 0) {
    return {
      clampDamage: false,
      damageOut: damage,
      questCredit: false,
      questId: null,
      enterEvade: false,
      cite: 'stormwind_city.cpp:58-68 invalid health',
    };
  }
  const wouldKill = damage > health;
  const postHp = health - damage;
  const postPct = (postHp * 100) / maxHealth;
  const yieldNow = wouldKill || postPct < BARTLEBY_YIELD_HP_PCT;
  if (!yieldNow) {
    return {
      clampDamage: false,
      damageOut: damage,
      questCredit: false,
      questId: null,
      enterEvade: false,
      cite: 'stormwind_city.cpp:60 HP still >= 15% after hit → no-op',
    };
  }
  const damageOut = Math.min(damage, Math.max(health - 1, 0));
  return {
    clampDamage: true,
    damageOut,
    questCredit: dealerIsPlayer,
    questId: dealerIsPlayer ? QUEST_BEAT : null,
    enterEvade: true,
    cite: 'stormwind_city.cpp:60-67 clamp + AreaExploredOrEventHappens(1640) + EnterEvadeMode',
  };
}

export interface BartlebyQuestAcceptResult {
  handled: boolean;
  factionId: number;
  factionFlags: number;
  attackStart: boolean;
  cite: string;
}

/** Port of QuestAccept_npc_bartleby. Cite: stormwind_city.cpp:72–79 */
export function bartlebyQuestAccept(questId: number): BartlebyQuestAcceptResult {
  if (questId !== QUEST_BEAT) {
    return {
      handled: false,
      factionId: 0,
      factionFlags: 0,
      attackStart: false,
      cite: 'stormwind_city.cpp:74 quest != 1640 → no-op (still returns true in cpp)',
    };
  }
  return {
    handled: true,
    factionId: FACTION_ENEMY,
    factionFlags: BARTLEBY_TEMPFACTION_FLAGS,
    attackStart: true,
    cite: 'stormwind_city.cpp:76-77 FACTION_ENEMY 168 + AttackStart',
  };
}

// Pure helpers — Dashel Stonefist

export interface DashelQuestAcceptResult {
  handled: boolean;
  textId: number | null;
  factionId: number;
  stripQuestGiver: boolean;
  reactAggressive: boolean;
  thugSpawns: typeof DASHEL_THUG_SPAWN;
  thugWaypoints: typeof DASHEL_THUG_WAYPOINT;
  thugDespawnMs: number;
  startEventMs: number;
  cite: string;
}

/** Port of QuestAccept_npc_dashel_stonefist fight setup. Cite: stormwind_city.cpp:413–447 */
export function dashelQuestAccept(questId: number): DashelQuestAcceptResult {
  if (questId !== QUEST_MISSING_DIPLO_PT8) {
    return {
      handled: false,
      textId: null,
      factionId: 0,
      stripQuestGiver: false,
      reactAggressive: false,
      thugSpawns: DASHEL_THUG_SPAWN,
      thugWaypoints: DASHEL_THUG_WAYPOINT,
      thugDespawnMs: 0,
      startEventMs: 0,
      cite: 'stormwind_city.cpp:415 quest != 1447 → no-op',
    };
  }
  return {
    handled: true,
    textId: SAY_PROGRESS_1_DAS,
    factionId: FACTION_NEUTRAL,
    stripQuestGiver: true,
    reactAggressive: true,
    thugSpawns: DASHEL_THUG_SPAWN,
    thugWaypoints: DASHEL_THUG_WAYPOINT,
    thugDespawnMs: DASHEL_THUG_DESPAWN_MS,
    startEventMs: DASHEL_START_EVENT_MS,
    cite: 'stormwind_city.cpp:420-442 SAY_1 + faction 189 + thugs + StartEvent 2000',
  };
}

export interface DashelLowHpResult {
  yielded: boolean;
  textId: number | null;
  factionId: number;
  stopCombat: boolean;
  thugsYield: boolean;
  evadeTimerMs: number;
  dialogStarted: boolean;
  cite: string;
}

/** Port of ExecuteAction DASHEL_LOW_HP while quest fight active. Cite: stormwind_city.cpp:372–409 */
export function dashelLowHp(
  hpPct: number,
  questFightStarted: boolean,
): DashelLowHpResult {
  if (!questFightStarted || hpPct > DASHEL_YIELD_HP_PCT) {
    return {
      yielded: false,
      textId: null,
      factionId: 0,
      stopCombat: false,
      thugsYield: false,
      evadeTimerMs: 0,
      dialogStarted: false,
      cite: 'stormwind_city.cpp:374 !questFight or HP > 20 → no-op',
    };
  }
  return {
    yielded: true,
    textId: SAY_PROGRESS_2_DAS,
    factionId: FACTION_FRIENDLY_TO_ALL,
    stopCombat: true,
    thugsYield: true,
    evadeTimerMs: DASHEL_EVADE_EVENT_MS,
    dialogStarted: true,
    cite: 'stormwind_city.cpp:376-407 SAY_2 + faction 35 + stop + thugs yield + evade 2000',
  };
}

export interface DashelReachedHomeResult {
  textId: number | null;
  /** Next m_phaseThugEventStage (1 if thugs alive, 5 if dead). */
  phaseStage: number;
  endEventMs: number;
  cite: string;
}

/** Port of JustReachedHome while m_dialogStarted. Cite: stormwind_city.cpp:251–271 */
export function dashelReachedHome(
  dialogStarted: boolean,
  thugsAlive: boolean,
): DashelReachedHomeResult {
  if (!dialogStarted) {
    return {
      textId: null,
      phaseStage: 0,
      endEventMs: 0,
      cite: 'stormwind_city.cpp:254 !m_dialogStarted → no end event',
    };
  }
  if (thugsAlive) {
    return {
      textId: SAY_PROGRESS_3_DAS,
      phaseStage: 1,
      endEventMs: DASHEL_END_EVENT_ARM_MS,
      cite: 'stormwind_city.cpp:258-263 SAY_3 + stage 1 + END_EVENT 3000',
    };
  }
  return {
    textId: SAY_PROGRESS_3_DAS,
    phaseStage: 5,
    endEventMs: DASHEL_END_EVENT_ARM_MS,
    cite: 'stormwind_city.cpp:266-269 SAY_3 + stage 5 skip RP + END_EVENT 3000',
  };
}

export interface DashelEndEventResult {
  handled: boolean;
  /** Broadcast text for thug lines (stage 1/2). */
  textId: number | null;
  /** Thug index to ResetThug MovePoint(10) (stage 3/4). */
  resetThugIndex: number | null;
  questCredit: boolean;
  questId: number | null;
  /** Next stage after ++m_phaseThugEventStage. */
  nextStage: number;
  nextTimerMs: number;
  resetMachine: boolean;
  cite: string;
}

// Port of one HandleEndEvent stage, which the C++ gates on m_thugsAlive. The dead-thug skip jumps
// to stage 5 with thugsAlive false, so its credit has a dedicated helper. Cite: cpp:274–328.
export function dashelEndEventStage(
  stage: number,
  thugsAlive: boolean,
): DashelEndEventResult {
  if (!thugsAlive) {
    // Dead-thug skip: JustReachedHome arms stage 5; FO6 explore credit is the
    // product stand-in (AreaExploredOrEventHappens). Document both.
    if (stage === 5) {
      return {
        handled: true,
        textId: null,
        resetThugIndex: null,
        questCredit: true,
        questId: QUEST_MISSING_DIPLO_PT8,
        nextStage: 6,
        nextTimerMs: 0,
        resetMachine: true,
        cite: 'stormwind_city.cpp:266-269 stage 5 skip RP → credit 1447 (FO6 finishEscort stand-in; HandleEndEvent body is thugsAlive-gated)',
      };
    }
    return {
      handled: false,
      textId: null,
      resetThugIndex: null,
      questCredit: false,
      questId: null,
      nextStage: stage,
      nextTimerMs: 0,
      resetMachine: false,
      cite: 'stormwind_city.cpp:277 !m_thugsAlive → HandleEndEvent body no-op',
    };
  }
  switch (stage) {
    case 1:
      return {
        handled: true,
        textId: SAY_PROGRESS_4_THU,
        resetThugIndex: null,
        questCredit: false,
        questId: null,
        nextStage: 2,
        nextTimerMs: DASHEL_END_STAGE_TIMERS_MS[1],
        resetMachine: false,
        cite: 'stormwind_city.cpp:282-289 case 1 SAY_4 thug0 + 1500',
      };
    case 2:
      return {
        handled: true,
        textId: SAY_PROGRESS_5_THU,
        resetThugIndex: null,
        questCredit: false,
        questId: null,
        nextStage: 3,
        nextTimerMs: DASHEL_END_STAGE_TIMERS_MS[2],
        resetMachine: false,
        cite: 'stormwind_city.cpp:291-299 case 2 SAY_5 thug1 + 1000',
      };
    case 3:
      return {
        handled: true,
        textId: null,
        resetThugIndex: 0,
        questCredit: false,
        questId: null,
        nextStage: 4,
        nextTimerMs: DASHEL_END_STAGE_TIMERS_MS[3],
        resetMachine: false,
        cite: 'stormwind_city.cpp:301-305 case 3 ResetThug(0) + 1500',
      };
    case 4:
      return {
        handled: true,
        textId: null,
        resetThugIndex: 1,
        questCredit: false,
        questId: null,
        nextStage: 5,
        nextTimerMs: DASHEL_END_STAGE_TIMERS_MS[4],
        resetMachine: false,
        cite: 'stormwind_city.cpp:307-311 case 4 ResetThug(1) + 1000',
      };
    case 5:
      return {
        handled: true,
        textId: null,
        resetThugIndex: null,
        questCredit: true,
        questId: QUEST_MISSING_DIPLO_PT8,
        nextStage: 6,
        nextTimerMs: 0,
        resetMachine: true,
        cite: 'stormwind_city.cpp:313-320 case 5 AreaExploredOrEventHappens(1447) + Reset',
      };
    default:
      return {
        handled: false,
        textId: null,
        resetThugIndex: null,
        questCredit: false,
        questId: null,
        nextStage: stage,
        nextTimerMs: 0,
        resetMachine: false,
        cite: 'stormwind_city.cpp:322 default break',
      };
  }
}

// Pure helpers — Lady Katrana Prestor gossip

/** GossipHello for Prestor when quest 4185 incomplete. Cite: stormwind_city.cpp:462–472 */
export function prestorGossipHello(quest4185Incomplete: boolean): {
  showKatItem: boolean;
  textId: number;
  cite: string;
} {
  return {
    showKatItem: quest4185Incomplete,
    textId: GOSSIP_TEXT_KAT[0],
    cite: 'stormwind_city.cpp:467-470 ADD_GOSSIP KAT_1 if 4185 incomplete; menu 2693',
  };
}

export interface PrestorGossipSelectResult {
  handled: boolean;
  nextAction: number | null;
  nextItemId: number | null;
  textId: number | null;
  closeMenu: boolean;
  questCredit: boolean;
  questId: number | null;
  cite: string;
}

// Port of GossipSelect_npc_lady_katrana_prestor. Cite: stormwind_city.cpp:475–496 action 0 =
// GOSSIP_ACTION_INFO_DEF, … +3 credits 4185.
export function prestorGossipSelect(action: number): PrestorGossipSelectResult {
  // GOSSIP_ACTION_INFO_DEF is typically 1000 in CMaNGOS; cpp uses relative
  // GOSSIP_ACTION_INFO_DEF / +1 / +2 / +3. Model relative steps 0..3.
  switch (action) {
    case 0:
      return {
        handled: true,
        nextAction: 1,
        nextItemId: GOSSIP_ITEM_KAT_2,
        textId: GOSSIP_TEXT_KAT[1],
        closeMenu: false,
        questCredit: false,
        questId: null,
        cite: 'stormwind_city.cpp:479-481 action DEF → KAT_2 + menu 2694',
      };
    case 1:
      return {
        handled: true,
        nextAction: 2,
        nextItemId: GOSSIP_ITEM_KAT_3,
        textId: GOSSIP_TEXT_KAT[2],
        closeMenu: false,
        questCredit: false,
        questId: null,
        cite: 'stormwind_city.cpp:483-485 action DEF+1 → KAT_3 + menu 2695',
      };
    case 2:
      return {
        handled: true,
        nextAction: 3,
        nextItemId: GOSSIP_ITEM_KAT_4,
        textId: GOSSIP_TEXT_KAT[3],
        closeMenu: false,
        questCredit: false,
        questId: null,
        cite: 'stormwind_city.cpp:487-489 action DEF+2 → KAT_4 + menu 2696',
      };
    case 3:
      return {
        handled: true,
        nextAction: null,
        nextItemId: null,
        textId: null,
        closeMenu: true,
        questCredit: true,
        questId: QUEST_TRUE_MASTERS,
        cite: 'stormwind_city.cpp:491-493 CLOSE + AreaExploredOrEventHappens(4185)',
      };
    default:
      return {
        handled: false,
        nextAction: null,
        nextItemId: null,
        textId: null,
        closeMenu: false,
        questCredit: false,
        questId: null,
        cite: 'stormwind_city.cpp:475-496 unknown action',
      };
  }
}

// Pure helpers — Squire Rowe

export interface RoweGossipHelloResult {
  textId: number;
  showWindsorItem: boolean;
  cite: string;
}

// Port of GossipHello_npc_squire_rowe eligibility. Cite: stormwind_city.cpp:663–687 Eligible when (6402
// complete & unrewarded) OR (6402 rewarded & 6403 incomplete).
export function roweGossipHello(opts: {
  quest6402CompleteUnrewarded: boolean;
  quest6402Rewarded: boolean;
  quest6403Complete: boolean;
  eventInProgress: boolean;
}): RoweGossipHelloResult {
  const eligible =
    opts.quest6402CompleteUnrewarded ||
    (opts.quest6402Rewarded && !opts.quest6403Complete);
  if (!eligible) {
    return {
      textId: GOSSIP_TEXT_ID_DEFAULT,
      showWindsorItem: false,
      cite: 'stormwind_city.cpp:684-685 default menu 9063',
    };
  }
  if (opts.eventInProgress) {
    return {
      textId: GOSSIP_TEXT_ID_PROGRESS,
      showWindsorItem: false,
      cite: 'stormwind_city.cpp:676-677 event in progress menu 9064',
    };
  }
  return {
    textId: GOSSIP_TEXT_ID_START,
    showWindsorItem: true,
    cite: 'stormwind_city.cpp:680-681 ADD WINDSOR item + menu 9065',
  };
}

/** Rowe escort WaypointReached. Cite: stormwind_city.cpp:584–601 */
export const ROWE_WAYPOINTS = [
  {
    pointId: 3,
    /** UNIT_STAND_STATE_KNEEL. Cite: Unit.h:105 = 8 */
    standState: 8 as number | null,
    castSpellId: null as number | null,
    summonWindsor: false,
    textId: null as number | null,
    pauseEscort: false,
    cite: 'stormwind_city.cpp:588-589 case 3 UNIT_STAND_STATE_KNEEL; Unit.h:105',
  },
  {
    pointId: 4,
    /** UNIT_STAND_STATE_STAND. Cite: Unit.h:97 = 0 */
    standState: 0,
    castSpellId: SPELL_BLUE_FIREWORK,
    summonWindsor: true,
    textId: null,
    pauseEscort: false,
    cite: 'stormwind_city.cpp:591-595 case 4 firework 11540 + STAND + Summon NPC_WINDSOR',
  },
  {
    pointId: 7,
    standState: null,
    castSpellId: null,
    summonWindsor: false,
    textId: SAY_SIGNAL_SENT,
    pauseEscort: true,
    cite: 'stormwind_city.cpp:597-599 case 7 SAY_SIGNAL_SENT + pause',
  },
] as const;

export interface RoweWaypointResult {
  handled: boolean;
  standState: number | null;
  castSpellId: number | null;
  summonWindsor: boolean;
  textId: number | null;
  pauseEscort: boolean;
  cite: string;
}

export function roweWaypointReached(pointId: number): RoweWaypointResult {
  const step = ROWE_WAYPOINTS.find((w) => w.pointId === pointId);
  if (!step) {
    return {
      handled: false,
      standState: null,
      castSpellId: null,
      summonWindsor: false,
      textId: null,
      pauseEscort: false,
      cite: 'stormwind_city.cpp:584-601 no case',
    };
  }
  return {
    handled: true,
    standState: step.standState,
    castSpellId: step.castSpellId,
    summonWindsor: step.summonWindsor,
    textId: step.textId,
    pauseEscort: step.pauseEscort,
    cite: step.cite,
  };
}

// Pure helpers — Reginald Windsor

export interface WindsorQuestAcceptResult {
  handled: boolean;
  startDialogueTextId: number | null;
  cite: string;
}

// Port of QuestAccept_npc_reginald_windsor → DoStartEscort. Cite: stormwind_city.cpp:1273–1281, 1212–1216
export function windsorQuestAccept(questId: number): WindsorQuestAcceptResult {
  if (questId !== QUEST_THE_GREAT_MASQUERADE) {
    return {
      handled: false,
      startDialogueTextId: null,
      cite: 'stormwind_city.cpp:1275 quest != 6403 → no-op',
    };
  }
  return {
    handled: true,
    startDialogueTextId: SAY_WINDSOR_QUEST_ACCEPT,
    cite: 'stormwind_city.cpp:1214-1215 StartNextDialogueText SAY_WINDSOR_QUEST_ACCEPT',
  };
}

/** Keep-event gossip gate. Cite: stormwind_city.cpp:1284–1305 */
export function windsorKeepGossipReady(opts: {
  isKeepReady: boolean;
  quest6403Complete: boolean;
  quest6402Rewarded: boolean;
}): { showKeepItem: boolean; textId: number; cite: string } {
  if (
    opts.isKeepReady &&
    !opts.quest6403Complete &&
    opts.quest6402Rewarded
  ) {
    return {
      showKeepItem: true,
      textId: GOSSIP_TEXT_ID_MASQUERADE,
      cite: 'stormwind_city.cpp:1292-1295 ADD REGINALD item + menu 5633',
    };
  }
  return {
    showKeepItem: false,
    textId: 0,
    cite: 'stormwind_city.cpp:1297-1302 default quest menu',
  };
}

/** Masquerade finale credit step. Cite: stormwind_city.cpp:1169–1177 SAY_BOLVAR_KEEP_15 → explore 6403 */
export function windsorMasqueradeCredit(): {
  questId: number;
  textIds: number[];
  cite: string;
} {
  return {
    questId: QUEST_THE_GREAT_MASQUERADE,
    textIds: [-1000870, -1000871], // SAY_WINDSOR_KEEP_16 + EMOTE_WINDSOR_DIE
    cite: 'stormwind_city.cpp:1169-1177 RewardPlayerAndGroupAtEventExplored(6403)',
  };
}

// Pure helpers — Mattingly / Afrasiabi head gossip

/** Port of GossipHello_npc_major_mattingly. Cite: stormwind_city.cpp:1330–1339 */
export function mattinglyGossipId(
  defaultGossipMenuId: number,
  onyxiaHeadSpawned: boolean,
): { gossipId: number; cite: string } {
  if (onyxiaHeadSpawned) {
    return {
      gossipId: GOSSIP_HEAD_MAT,
      cite: 'stormwind_city.cpp:1333-1335 GO_HEAD_OF_ONYXIA_SW spawned → GOSSIP_HEAD_MAT 5754',
    };
  }
  return {
    gossipId: defaultGossipMenuId,
    cite: 'stormwind_city.cpp:1332 default GossipMenuId',
  };
}

/** Port of GossipHello_npc_field_marshal_afrasiabi. Cite: stormwind_city.cpp:1342–1351 */
export function afrasiabiGossipId(
  defaultGossipMenuId: number,
  nefarianHeadSpawned: boolean,
): { gossipId: number; cite: string } {
  if (nefarianHeadSpawned) {
    return {
      gossipId: GOSSIP_HEAD_AFRA,
      cite: 'stormwind_city.cpp:1345-1347 GO_HEAD_OF_NEFARIAN_SW spawned → GOSSIP_HEAD_AFRA 6027',
    };
  }
  return {
    gossipId: defaultGossipMenuId,
    cite: 'stormwind_city.cpp:1344 default GossipMenuId',
  };
}

// ScriptDev IR — npc_bartleby

// npc_bartlebyAI, creature 6090. No combat cast timers — a DamageTaken yield below 15% HP gives
// quest 1640 credit and evades. Cite: stormwind_city.cpp:49–85.
export const NPC_BARTLEBY_SCRIPT: ScriptDevIR = {
  name: 'npc_bartleby',
  boundCreatures: [NPC_BARTLEBY],
  sourceFile: 'eastern_kingdoms/stormwind_city.cpp',
  spellIds: [],
  timers: [],
  phases: [
    {
      phase: 1,
      hpBelowPct: BARTLEBY_YIELD_HP_PCT,
      actions: [
        {
          kind: 'quest_credit',
          entry: QUEST_BEAT,
          cite: 'stormwind_city.cpp:64 AreaExploredOrEventHappens(QUEST_BEAT=1640)',
        },
        {
          kind: 'stop_combat',
          cite: 'stormwind_city.cpp:66 EnterEvadeMode after yield clamp',
        },
        {
          kind: 'flavor',
          text: 'DamageTaken yield <15% - clamp leave 1 HP + explore 1640 + evade',
          cite: 'stormwind_city.cpp:58-68; bartlebyDamageTaken pure helper',
        },
      ],
      cite: 'stormwind_city.cpp:60 post-hit HP% < 15 yield (DamageTaken)',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'npc_bartlebyAI Reset empty (DamageTaken yield only)',
        cite: 'stormwind_city.cpp:56 Reset() override {}',
      },
    ],
  },
  cites: [
    'stormwind_city.cpp:39-85 npc_bartleby',
    'stormwind_city.cpp:45-47 FACTION_ENEMY=168 QUEST_BEAT=1640',
    'stormwind_city.cpp:58-68 DamageTaken <15% clamp + explore 1640 + evade',
    'stormwind_city.cpp:72-79 QuestAccept FACTION_ENEMY + AttackStart',
  ],
};

// ScriptDev IR — npc_dashel_stonefist

// npc_dashel_stonefistAI, creature 4961. No UpdateAI cast timers — a timerless low-HP action plus
// custom OOC events. The ≤20% yield is a phase; the full RP lives in pure helpers.
export const NPC_DASHEL_STONEFIST_SCRIPT: ScriptDevIR = {
  name: 'npc_dashel_stonefist',
  boundCreatures: [NPC_DASHEL_STONEFIST],
  sourceFile: 'eastern_kingdoms/stormwind_city.cpp',
  spellIds: [SPELL_UNKILLABLE_OFF],
  timers: [],
  phases: [
    {
      phase: 1,
      hpBelowPct: DASHEL_YIELD_HP_PCT,
      actions: [
        {
          kind: 'yell',
          textId: SAY_PROGRESS_2_DAS,
          cite: 'stormwind_city.cpp:379 DoBroadcastText SAY_PROGRESS_2_DAS=1712',
        },
        {
          kind: 'stop_combat',
          cite: 'stormwind_city.cpp:382-385 AttackStop + CombatStop + ResetThreat',
        },
        {
          kind: 'flavor',
          text: 'FACTION_FRIENDLY_TO_ALL 35 + thugs yield + evade 2000 + dialog → explore 1447',
          cite: 'stormwind_city.cpp:381-407; dashelLowHp / dashelEndEventStage pure helpers',
        },
      ],
      cite: 'stormwind_city.cpp:374 GetHealthPercent() <= 20.f DASHEL_LOW_HP quest fight',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'Reset clears thugs/playerGuid; restore QUESTGIVER; REACT_PASSIVE; fail quest if mid-fight',
        cite: 'stormwind_city.cpp:160-191',
      },
    ],
  },
  unusedBindings: [
    {
      entry: NPC_OLD_TOWN_THUG,
      kind: 'creature',
      reason:
        'NPC 4969 Old Town Thug is quest-fight summon-only (stormwind_city.cpp:427-439); absent from product bake - IR ported; spawn/waypoint/reset coords in DASHEL_THUG_*',
      cite: 'stormwind_city.cpp:102,110-123,427-439; loadRealBundle missing 4969',
    },
  ],
  cites: [
    'stormwind_city.cpp:87-448 npc_dashel_stonefist',
    'stormwind_city.cpp:94-108 SAY/quest/faction/SPELL_UNKILLABLE_OFF=13835',
    'stormwind_city.cpp:202 StartEvent delay 2000',
    'stormwind_city.cpp:233-236 HandleStartEvent SetDeathPrevention + AttackStart',
    'stormwind_city.cpp:251-271 JustReachedHome SAY_3 + END_EVENT 3000',
    'stormwind_city.cpp:274-328 HandleEndEvent stages 1-5 credit 1447',
    'stormwind_city.cpp:372-409 DASHEL_LOW_HP <=20%',
    'stormwind_city.cpp:413-447 QuestAccept 1447 thugs + StartEvent',
  ],
};

// ScriptDev IR — npc_lady_katrana_prestor

// Cite: stormwind_city.cpp:462–497 gossip only (no AI). Binding: creature 1749 ScriptName
// npc_lady_katrana_prestor. Also NPC_PRESTOR for Windsor masquerade (world_eastern_kingdoms.h).
export const NPC_LADY_KATRANA_PRESTOR_SCRIPT: ScriptDevIR = {
  name: 'npc_lady_katrana_prestor',
  boundCreatures: [NPC_LADY_KATRANA_PRESTOR],
  sourceFile: 'eastern_kingdoms/stormwind_city.cpp',
  spellIds: [],
  timers: [],
  gossipHello: {
    defaultTextId: GOSSIP_TEXT_KAT[0],
    cite: 'stormwind_city.cpp:470 SEND_GOSSIP_MENU 2693; prestorGossipHello pure helper for 4185 item',
  },
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'gossip-only (no GetAI / no combat timers)',
        cite: 'stormwind_city.cpp:1368-1372 pGossipHello + pGossipSelect only',
      },
    ],
  },
  cites: [
    'stormwind_city.cpp:450-497 npc_lady_katrana_prestor',
    'stormwind_city.cpp:456-459 GOSSIP_ITEM_KAT_1..4',
    'stormwind_city.cpp:462-472 GossipHello 4185 incomplete → KAT_1 + menu 2693',
    'stormwind_city.cpp:475-496 GossipSelect chain 2694-2696 + explore 4185',
  ],
};

// ScriptDev IR — npc_squire_rowe

// Cite: stormwind_city.cpp:538–700 npc_squire_roweAI Binding: creature 17804 ScriptName npc_squire_rowe —
// ABSENT from bake (unused-binding). Escort + intro dialogue pure helpers still ported.
export const NPC_SQUIRE_ROWE_SCRIPT: ScriptDevIR = {
  name: 'npc_squire_rowe',
  boundCreatures: [NPC_SQUIRE_ROWE],
  sourceFile: 'eastern_kingdoms/stormwind_city.cpp',
  spellIds: [SPELL_BLUE_FIREWORK, SPELL_DISMISS_HORSE, SPELL_WINDSOR_INSPIRATION],
  timers: [],
  unusedBindings: [
    {
      entry: NPC_SQUIRE_ROWE,
      kind: 'creature',
      reason:
        'Creature 17804 Squire Rowe is DB-bound ScriptName npc_squire_rowe but absent from product bake - IR + pure helpers ported; product cannot spawn until rebake',
      cite: 'stormwind_city.cpp:1354-1379; loadRealBundle missing 17804',
    },
    {
      entry: NPC_WINDSOR_MOUNT,
      kind: 'creature',
      reason:
        'NPC 12581 Windsor mount is visual-only for intro unmount (SPELL_DISMISS_HORSE 20000); absent from bake',
      cite: 'stormwind_city.cpp:515,608-615; loadRealBundle missing 12581',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'npc_escortAI Reset empty; m_isEventInProgress cleared on Windsor despawn',
        cite: 'stormwind_city.cpp:551 Reset() override {}',
      },
    ],
  },
  cites: [
    'stormwind_city.cpp:499-700 npc_squire_rowe',
    'stormwind_city.cpp:517-519 SPELL_BLUE_FIREWORK=11540 DISMISS_HORSE=20000 WINDSOR_INSPIRATION=20273',
    'stormwind_city.cpp:521-522 QUEST_STORMWIND_RENDEZVOUS=6402 THE_GREAT_MASQUERADE=6403',
    'stormwind_city.cpp:525-533 aIntroDialogue delays',
    'stormwind_city.cpp:584-601 WaypointReached WP3/4/7',
    'stormwind_city.cpp:604-641 JustDidDialogueStep unmount + welcome',
    'stormwind_city.cpp:663-700 GossipHello/Select start escort',
  ],
};

// ScriptDev IR — npc_reginald_windsor

// Cite: stormwind_city.cpp:860–1318 npc_reginald_windsorAI Binding: creature 12580 ScriptName
// npc_reginald_windsor (in bake). Combat kit on UpdateEscortAI when hostile; escort/dialogue pure helpers.
export const NPC_REGINALD_WINDSOR_SCRIPT: ScriptDevIR = {
  name: 'npc_reginald_windsor',
  boundCreatures: [NPC_WINDSOR],
  sourceFile: 'eastern_kingdoms/stormwind_city.cpp',
  spellIds: [
    SPELL_HAMMER_OF_JUSTICE,
    SPELL_SHIELD_WALL,
    SPELL_STRONG_CLEAVE,
    SPELL_WINDSOR_INSPIRATION,
    SPELL_ONYXIA_TRANSFORM,
    SPELL_WINDSOR_READ,
    SPELL_WINDSOR_DEATH,
    SPELL_ONYXIA_DESPAWN,
  ],
  timers: [
    {
      id: 'hammer_of_justice',
      spellId: SPELL_HAMMER_OF_JUSTICE,
      initialMinMs: WINDSOR_HAMMER_INIT_MIN_MS,
      initialMaxMs: WINDSOR_HAMMER_INIT_MAX_MS,
      repeatMinMs: WINDSOR_HAMMER_REPEAT_MS,
      repeatMaxMs: WINDSOR_HAMMER_REPEAT_MS,
      target: 'victim',
      cite: 'stormwind_city.cpp:888,1253-1257 Hammer init urand(0,1000) re-arm 60000 victim',
    },
    {
      id: 'strong_cleave',
      spellId: SPELL_STRONG_CLEAVE,
      initialMinMs: WINDSOR_CLEAVE_INIT_MIN_MS,
      initialMaxMs: WINDSOR_CLEAVE_INIT_MAX_MS,
      repeatMinMs: WINDSOR_CLEAVE_REPEAT_MIN_MS,
      repeatMaxMs: WINDSOR_CLEAVE_REPEAT_MAX_MS,
      target: 'victim',
      cite: 'stormwind_city.cpp:889,1261-1265 Strong Cleave init urand(1000,3000) re-arm urand(1000,5000) victim',
    },
  ],
  lifecycle: {
    onAggro: [
      {
        kind: 'cast_self',
        spellId: SPELL_SHIELD_WALL,
        cite: 'stormwind_city.cpp:892-895 Aggro DoCastSpellIfCan SPELL_SHIELD_WALL=871',
      },
    ],
    onReset: [
      {
        kind: 'flavor',
        text: 'Reset: hammer urand(0,1000) cleave urand(1000,3000); questgiver flag script-controlled',
        cite: 'stormwind_city.cpp:884-890,866 RemoveFlag QUESTGIVER',
      },
    ],
  },
  unusedBindings: [
    {
      entry: NPC_WRYNN,
      kind: 'creature',
      reason:
        'NPC 1747 King Varian Wrynn is masquerade keep cast (world_eastern_kingdoms.h); absent from product bake - dialogue steps still documented',
      cite: 'world_eastern_kingdoms.h:9; stormwind_city.cpp:1057-1078; loadRealBundle missing 1747',
    },
    {
      entry: NPC_GUARD_PATROLLER,
      kind: 'creature',
      reason:
        'NPC 1976 used as dialogue token NPC_GUARD_PATROLLER (reset Bolvar/Wrynn); absent from bake',
      cite: 'stormwind_city.cpp:771,1179-1201; loadRealBundle missing 1976',
    },
    {
      entry: NPC_GUARD_ONYXIA,
      kind: 'creature',
      reason:
        'NPC 12739 Onyxia guard is UpdateEntry morph target for royal guards; absent from bake',
      cite: 'stormwind_city.cpp:772,1118; loadRealBundle missing 12739',
    },
  ],
  cites: [
    'stormwind_city.cpp:703-1318 npc_reginald_windsor',
    'stormwind_city.cpp:759-767 combat + keep spells',
    'stormwind_city.cpp:884-890 Reset hammer/cleave timers',
    'stormwind_city.cpp:892-895 Aggro Shield Wall',
    'stormwind_city.cpp:897-947 WaypointReached WP1/2/4/12/23/26',
    'stormwind_city.cpp:970-1203 JustDidDialogueStep keep finale + explore 6403',
    'stormwind_city.cpp:1220-1269 UpdateEscortAI dialogue + hammer + cleave',
    'stormwind_city.cpp:1273-1318 QuestAccept 6403 + keep gossip',
    'world_eastern_kingdoms.h:8-12 NPC_JONATHAN=466 WRYNN=1747 BOLVAR=1748 PRESTOR=1749 WINDSOR=12580',
  ],
};

// ScriptDev IR — npc_major_mattingly

// Cite: stormwind_city.cpp:1330–1339 gossip only. Binding: creature 14394 ScriptName npc_major_mattingly.
// Celebration ender for quest 7496 Celebrating Good Times.
export const NPC_MAJOR_MATTINGLY_SCRIPT: ScriptDevIR = {
  name: 'npc_major_mattingly',
  boundCreatures: [NPC_MAJOR_MATTINGLY],
  sourceFile: 'eastern_kingdoms/stormwind_city.cpp',
  spellIds: [],
  timers: [],
  unusedBindings: [
    {
      entry: GO_HEAD_OF_ONYXIA_SW,
      kind: 'go',
      reason:
        'GO 179558 Head of Onyxia (SW) gates gossip menu 5754 when spawned within 100yd; absent from product bake - default GossipMenuId path remains',
      cite: 'stormwind_city.cpp:1324,1333-1335; loadRealBundle missing 179558',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'gossip-only head-of-Onyxia menu swap (mattinglyGossipId pure helper)',
        cite: 'stormwind_city.cpp:1330-1339',
      },
    ],
  },
  cites: [
    'stormwind_city.cpp:1321-1339 npc_major_mattingly',
    'stormwind_city.cpp:1324 GO_HEAD_OF_ONYXIA_SW=179558',
    'stormwind_city.cpp:1326 GOSSIP_HEAD_MAT=5754',
    'stormwind_city.cpp:1389-1392 RegisterSelf pGossipHello',
  ],
};

// ScriptDev IR — npc_field_marshal_afrasiabi

// Cite: stormwind_city.cpp:1342–1351 gossip only. Binding: creature 14721 ScriptName
// npc_field_marshal_afrasiabi. Celebration ender for quest 7782 The Lord of Blackrock.
export const NPC_FIELD_MARSHAL_AFRASIABI_SCRIPT: ScriptDevIR = {
  name: 'npc_field_marshal_afrasiabi',
  boundCreatures: [NPC_FIELD_MARSHAL_AFRASIABI],
  sourceFile: 'eastern_kingdoms/stormwind_city.cpp',
  spellIds: [],
  timers: [],
  unusedBindings: [
    {
      entry: GO_HEAD_OF_NEFARIAN_SW,
      kind: 'go',
      reason:
        'GO 179882 Head of Nefarian (SW) gates gossip menu 6027 when spawned within 100yd; absent from product bake - default GossipMenuId path remains',
      cite: 'stormwind_city.cpp:1323,1345-1347; loadRealBundle missing 179882',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'gossip-only head-of-Nefarian menu swap (afrasiabiGossipId pure helper)',
        cite: 'stormwind_city.cpp:1342-1351',
      },
    ],
  },
  cites: [
    'stormwind_city.cpp:1321-1351 npc_field_marshal_afrasiabi',
    'stormwind_city.cpp:1323 GO_HEAD_OF_NEFARIAN_SW=179882',
    'stormwind_city.cpp:1327 GOSSIP_HEAD_AFRA=6027',
    'stormwind_city.cpp:1394-1397 RegisterSelf pGossipHello',
  ],
};
