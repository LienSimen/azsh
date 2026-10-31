// Darkshore ScriptDev pure helpers (SESSION 10 batch). Companion to darkshore.ts IR exports. Cite:
// kalimdor/darkshore.cpp

import {
  BLACKWOOD_FLEE_HP_PCT,
  BLACKWOOD_TEMP_DESPAWN_MS,
  BOWL_DISTANCE,
  EMOTE_GENERIC_FLEE,
  EMOTE_KER_AWAKEN,
  EMOTE_KER_SLEEP_1,
  EMOTE_KER_SLEEP_2,
  EMOTE_KER_SLEEP_3,
  EMOTE_THRESH_START,
  FACTION_BLACKWOOD,
  FACTION_ESCORT_A_NEUTRAL_ACTIVE,
  FACTION_ESCORT_A_PASSIVE,
  FACTION_ESCORT_N_FRIEND_PASSIVE,
  FACTION_HOSTILE,
  FURBOLG_FOOD_RANGE_YD,
  KERLONIAN_SLEEP_REPEAT_MAX_MS,
  KERLONIAN_SLEEP_REPEAT_MIN_MS,
  NPC_BLACKWOOD_WARRIOR,
  NPC_CAPTURED_RABID_THISTLE_BEAR,
  NPC_GELKAK,
  NPC_LILADRIS,
  NPC_THARNARIUN_TREETENDER,
  PURIFY_BOWL_DIST_SQ,
  PURIFY_EXTRA_WARRIORS,
  PURIFY_FURBOLG_SEARCH_YD,
  PURIFY_RESET_MS,
  PURIFY_START_STAGGER_MAX_MS,
  PURIFY_SUMMON_RADIUS_YD,
  QUEST_ABSENT_MINDED_PT2,
  QUEST_ESCAPE_THROUGH_FORCE,
  QUEST_ESCAPE_THROUGH_STEALTH,
  QUEST_ID_THERYLUNE_ESCAPE,
  QUEST_SLEEPER_AWAKENED,
  RABID_BEAR_CAPTURE_DESPAWN_MS,
  RABID_BEAR_HANDOFF_DESPAWN_MS,
  REMTRAVEL_ESCORT_PATH,
  SAY_KER_END,
  SAY_KER_SLEEP_1,
  SAY_KER_SLEEP_2,
  SAY_KER_SLEEP_3,
  SAY_KER_SLEEP_4,
  SAY_KER_START,
  SAY_REM_AGGRO,
  SAY_THERYLUNE_FINISH,
  SAY_THERYLUNE_START,
  SAY_THRESH_AT_CLOSE,
  SAY_VOLCOR_AGGRO,
  SPELL_BEAR_CAPTURED,
  TEMPFACTION_RESTORE_COMBAT_STOP,
  TEMPFACTION_RESTORE_RESPAWN,
  TEMPFACTION_TOGGLE_IMMUNE_TO_NPC,
  TEXT_ID_KEY_READY,
  TEXT_ID_THRESH_DEFAULT,
  UNIT_STAND_STATE_SLEEP,
  UNIT_STAND_STATE_STAND,
  VOLCOR_PATH_FORCE,
  VOLCOR_PATH_STEALTH,
  VOLCOR_STEALTH_DESPAWN_MS,
} from './darkshore.ts';

// Pure helpers — Kerlonian follower sleep

export interface KerlonianQuestAcceptResult {
  handled: boolean;
  removeBearForm: boolean;
  standState: number;
  clearImmuneToNpc: boolean;
  textId: number | null;
  factionId: number;
  cite: string;
}

/** Port of QuestAccept_npc_kerlonian. Cite: darkshore.cpp:197–211 */
export function kerlonianQuestAccept(questId: number): KerlonianQuestAcceptResult {
  if (questId !== QUEST_SLEEPER_AWAKENED) {
    return {
      handled: false,
      removeBearForm: false,
      standState: UNIT_STAND_STATE_STAND,
      clearImmuneToNpc: false,
      textId: null,
      factionId: 0,
      cite: 'darkshore.cpp:199 quest != 5321 → no-op (returns true)',
    };
  }
  return {
    handled: true,
    removeBearForm: true,
    standState: UNIT_STAND_STATE_STAND,
    clearImmuneToNpc: true,
    textId: SAY_KER_START,
    factionId: FACTION_ESCORT_N_FRIEND_PASSIVE,
    cite: 'darkshore.cpp:203-207 strip 18309 + stand + clear immune NPC + SAY_KER_START + StartFollow faction 290',
  };
}

export interface KerlonianSleepFireResult {
  sleep: boolean;
  castSleepVisual: boolean;
  standState: number;
  rearmSleepMs: { min: number; max: number };
  emotePool: readonly number[];
  sayPool: readonly number[];
  cite: string;
}

// Port of SetSleeping when fall-asleep timer expires while following + not paused. Cite:
// darkshore.cpp:133–154,176–179
export function kerlonianSetSleeping(): KerlonianSleepFireResult {
  return {
    sleep: true,
    castSleepVisual: true,
    standState: UNIT_STAND_STATE_SLEEP,
    rearmSleepMs: {
      min: KERLONIAN_SLEEP_REPEAT_MIN_MS,
      max: KERLONIAN_SLEEP_REPEAT_MAX_MS,
    },
    emotePool: [EMOTE_KER_SLEEP_1, EMOTE_KER_SLEEP_2, EMOTE_KER_SLEEP_3],
    sayPool: [SAY_KER_SLEEP_1, SAY_KER_SLEEP_2, SAY_KER_SLEEP_3, SAY_KER_SLEEP_4],
    cite: 'darkshore.cpp:133-154 SetSleeping + :179 re-arm urand(25000,90000)',
  };
}

export interface KerlonianClearSleepResult {
  removeSleepVisual: boolean;
  standState: number;
  textId: number;
  unpauseFollow: boolean;
  cite: string;
}

/** Port of ClearSleeping (Awaken spell / AI_EVENT_CUSTOM_A). Cite: darkshore.cpp:157–165,123–129 */
export function kerlonianClearSleeping(): KerlonianClearSleepResult {
  return {
    removeSleepVisual: true,
    standState: UNIT_STAND_STATE_STAND,
    textId: EMOTE_KER_AWAKEN,
    unpauseFollow: true,
    cite: 'darkshore.cpp:157-164 strip 25148 + stand + EMOTE_KER_AWAKEN + SetFollowPaused false',
  };
}

export interface KerlonianLiladrisLosResult {
  handled: boolean;
  questCredit: boolean;
  questId: number | null;
  textId: number | null;
  completeFollow: boolean;
  cite: string;
}

/** Port of MoveInLineOfSight Liladris complete branch. Cite: darkshore.cpp:102–120 */
export function kerlonianLiladrisLos(
  following: boolean,
  followComplete: boolean,
  hasVictim: boolean,
  whoEntry: number,
  withinRange: boolean,
  questIncomplete: boolean,
): KerlonianLiladrisLosResult {
  if (hasVictim || followComplete || !following) {
    return {
      handled: false,
      questCredit: false,
      questId: null,
      textId: null,
      completeFollow: false,
      cite: 'darkshore.cpp:106 victim / complete / not following → skip',
    };
  }
  if (whoEntry !== NPC_LILADRIS || !withinRange) {
    return {
      handled: false,
      questCredit: false,
      questId: null,
      textId: null,
      completeFollow: false,
      cite: 'darkshore.cpp:106-108 not Liladris or out of range',
    };
  }
  return {
    handled: true,
    questCredit: questIncomplete,
    questId: questIncomplete ? QUEST_SLEEPER_AWAKENED : null,
    textId: SAY_KER_END,
    completeFollow: true,
    cite: 'darkshore.cpp:112-118 explore 5321 if incomplete + SAY_KER_END + SetFollowComplete',
  };
}

// Pure helpers — Prospector Remtravel escort

export interface RemtravelQuestAcceptResult {
  handled: boolean;
  factionId: number;
  factionFlags: number;
  pathId: number;
  cite: string;
}

/** Port of QuestAccept_npc_prospector_remtravel. Cite: darkshore.cpp:288–298 */
export function remtravelQuestAccept(questId: number): RemtravelQuestAcceptResult {
  if (questId !== QUEST_ABSENT_MINDED_PT2) {
    return {
      handled: false,
      factionId: 0,
      factionFlags: 0,
      pathId: 0,
      cite: 'darkshore.cpp:290 quest != 731 → no-op',
    };
  }
  return {
    handled: true,
    factionId: FACTION_ESCORT_A_PASSIVE,
    factionFlags: TEMPFACTION_RESTORE_RESPAWN,
    pathId: REMTRAVEL_ESCORT_PATH,
    cite: 'darkshore.cpp:294-295 FACTION_ESCORT_A_PASSIVE 774 + Start path 2917',
  };
}

export interface RemtravelWaypointResult {
  handled: boolean;
  questCredit: boolean;
  questId: number | null;
  endEscort: boolean;
  moveIdle: boolean;
  cite: string;
}

/** Port of WaypointReached. Cite: darkshore.cpp:271–285 */
export function remtravelWaypointReached(pointId: number): RemtravelWaypointResult {
  switch (pointId) {
    case 38:
      return {
        handled: true,
        questCredit: true,
        questId: QUEST_ABSENT_MINDED_PT2,
        endEscort: false,
        moveIdle: false,
        cite: 'darkshore.cpp:275-277 WP38 RewardPlayerAndGroupAtEventExplored 731',
      };
    case 39:
      return {
        handled: true,
        questCredit: false,
        questId: null,
        endEscort: true,
        moveIdle: true,
        cite: 'darkshore.cpp:279-282 WP39 MoveIdle + End',
      };
    default:
      return {
        handled: false,
        questCredit: false,
        questId: null,
        endEscort: false,
        moveIdle: false,
        cite: 'darkshore.cpp:271-285 unknown WP',
      };
  }
}

/** Port of Aggro random broadcast index 0–5. Cite: darkshore.cpp:251–261 */
export function remtravelAggroText(roll0to5: number): number {
  const i = Math.max(0, Math.min(5, roll0to5 | 0));
  return SAY_REM_AGGRO[i]!;
}

// Pure helpers — Threshwackonator

export interface ThreshGossipHelloResult {
  showTurnKey: boolean;
  textId: number;
  cite: string;
}

/** Port of GossipHello_npc_threshwackonator. Cite: darkshore.cpp:355–365 */
export function threshGossipHello(questIncomplete: boolean): ThreshGossipHelloResult {
  if (questIncomplete) {
    return {
      showTurnKey: true,
      textId: TEXT_ID_KEY_READY,
      cite: 'darkshore.cpp:357-360 quest 2078 incomplete → turn-key + text 758',
    };
  }
  return {
    showTurnKey: false,
    textId: TEXT_ID_THRESH_DEFAULT,
    cite: 'darkshore.cpp:362-363 default text 718',
  };
}

export interface ThreshGossipSelectResult {
  handled: boolean;
  textId: number | null;
  startFollow: boolean;
  cite: string;
}

/** Port of GossipSelect_npc_threshwackonator (GOSSIP_ACTION_INFO_DEF + 1). Cite: darkshore.cpp:368–381 */
export function threshGossipSelect(actionIsTurnKey: boolean): ThreshGossipSelectResult {
  if (!actionIsTurnKey) {
    return {
      handled: false,
      textId: null,
      startFollow: false,
      cite: 'darkshore.cpp:370 action != INFO_DEF+1 → no-op',
    };
  }
  return {
    handled: true,
    textId: EMOTE_THRESH_START,
    startFollow: true,
    cite: 'darkshore.cpp:376-377 EMOTE_START + StartFollow',
  };
}

export interface ThreshGelkakLosResult {
  handled: boolean;
  textId: number | null;
  /** Gelkak (pWho) speaks SAY_AT_CLOSE. */
  speakerIsGelkak: boolean;
  setHostileFaction: boolean;
  factionId: number;
  attackLeader: boolean;
  completeFollow: boolean;
  cite: string;
}

/** Port of MoveInLineOfSight Gelkak end + DoAtEnd. Cite: darkshore.cpp:325–347 */
export function threshGelkakLos(
  hasVictim: boolean,
  followComplete: boolean,
  whoEntry: number,
  within10yd: boolean,
): ThreshGelkakLosResult {
  if (hasVictim || followComplete) {
    return {
      handled: false,
      textId: null,
      speakerIsGelkak: false,
      setHostileFaction: false,
      factionId: 0,
      attackLeader: false,
      completeFollow: false,
      cite: 'darkshore.cpp:329 victim / complete → skip',
    };
  }
  if (whoEntry !== NPC_GELKAK || !within10yd) {
    return {
      handled: false,
      textId: null,
      speakerIsGelkak: false,
      setHostileFaction: false,
      factionId: 0,
      attackLeader: false,
      completeFollow: false,
      cite: 'darkshore.cpp:329-331 not Gelkak or >10yd',
    };
  }
  return {
    handled: true,
    textId: SAY_THRESH_AT_CLOSE,
    speakerIsGelkak: true,
    setHostileFaction: true,
    factionId: FACTION_HOSTILE,
    attackLeader: true,
    completeFollow: true,
    cite: 'darkshore.cpp:333-346 SAY_AT_CLOSE + FACTION_HOSTILE 14 + AttackStart leader + SetFollowComplete',
  };
}

// Pure helpers — Volcor

export interface VolcorQuestAcceptResult {
  handled: boolean;
  questId: number;
  pathId: number;
  /** Stealth path starts with run=true. Cite: darkshore.cpp:436 Start(true, ...) */
  run: boolean;
  cite: string;
}

/** Port of StartEscort / QuestAccept_npc_volcor. Cite: darkshore.cpp:430–440,468–476 */
export function volcorQuestAccept(questId: number): VolcorQuestAcceptResult {
  if (
    questId !== QUEST_ESCAPE_THROUGH_FORCE &&
    questId !== QUEST_ESCAPE_THROUGH_STEALTH
  ) {
    return {
      handled: false,
      questId: 0,
      pathId: 0,
      run: false,
      cite: 'darkshore.cpp:470 quest not 994/995 → no-op',
    };
  }
  if (questId === QUEST_ESCAPE_THROUGH_STEALTH) {
    return {
      handled: true,
      questId,
      pathId: VOLCOR_PATH_STEALTH,
      run: true,
      cite: 'darkshore.cpp:434-436 stealth path 3692 Start(true)',
    };
  }
  return {
    handled: true,
    questId,
    pathId: VOLCOR_PATH_FORCE,
    run: false,
    cite: 'darkshore.cpp:438-439 force path 3693 Start(false)',
  };
}

export interface VolcorWaypointResult {
  handled: boolean;
  questCredit: boolean;
  questId: number | null;
  endEscort: boolean;
  forceDespawnMs: number;
  moveIdle: boolean;
  cite: string;
}

/** Port of WaypointReached (quest-dependent). Cite: darkshore.cpp:442–465 */
export function volcorWaypointReached(
  pointId: number,
  questId: number,
): VolcorWaypointResult {
  if (pointId === 3 && questId === QUEST_ESCAPE_THROUGH_STEALTH) {
    return {
      handled: true,
      questCredit: true,
      questId: QUEST_ESCAPE_THROUGH_STEALTH,
      endEscort: true,
      forceDespawnMs: VOLCOR_STEALTH_DESPAWN_MS,
      moveIdle: false,
      cite: 'darkshore.cpp:446-454 WP3 stealth credit 995 + End + ForcedDespawn 1000',
    };
  }
  if (pointId === 15 && questId === QUEST_ESCAPE_THROUGH_FORCE) {
    return {
      handled: true,
      questCredit: true,
      questId: QUEST_ESCAPE_THROUGH_FORCE,
      endEscort: true,
      forceDespawnMs: 0,
      moveIdle: true,
      cite: 'darkshore.cpp:457-462 WP15 force credit 994 + MoveIdle + End',
    };
  }
  return {
    handled: false,
    questCredit: false,
    questId: null,
    endEscort: false,
    forceDespawnMs: 0,
    moveIdle: false,
    cite: 'darkshore.cpp:442-465 WP/quest branch miss',
  };
}

// Port of Aggro random — only cases 0–3 speak (4 of 6 rolls). Cite: darkshore.cpp:417–426 urand(0,5) cases
// 0–3
export function volcorAggroText(roll0to5: number): number | null {
  const i = roll0to5 | 0;
  if (i < 0 || i > 3) return null;
  return SAY_VOLCOR_AGGRO[i]!;
}

// Pure helpers — Therylune

export interface TheryluneQuestAcceptResult {
  handled: boolean;
  factionId: number;
  factionFlags: number;
  textId: number | null;
  cite: string;
}

/** Port of QuestAccept_npc_therylune. Cite: darkshore.cpp:528–540 */
export function theryluneQuestAccept(questId: number): TheryluneQuestAcceptResult {
  if (questId !== QUEST_ID_THERYLUNE_ESCAPE) {
    return {
      handled: false,
      factionId: 0,
      factionFlags: 0,
      textId: null,
      cite: 'darkshore.cpp:530 quest != 945 → no-op',
    };
  }
  return {
    handled: true,
    factionId: FACTION_ESCORT_A_NEUTRAL_ACTIVE,
    factionFlags: TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC,
    textId: SAY_THERYLUNE_START,
    cite: 'darkshore.cpp:534-536 Start + faction 231 flags RESTORE_RESPAWN|TOGGLE_IMMUNE_TO_NPC + SAY start',
  };
}

export interface TheryluneWaypointResult {
  handled: boolean;
  questCredit: boolean;
  questId: number | null;
  textId: number | null;
  setRun: boolean;
  cite: string;
}

/** Port of WaypointReached. Cite: darkshore.cpp:506–519 */
export function theryluneWaypointReached(pointId: number): TheryluneWaypointResult {
  switch (pointId) {
    case 18:
      return {
        handled: true,
        questCredit: true,
        questId: QUEST_ID_THERYLUNE_ESCAPE,
        textId: null,
        setRun: false,
        cite: 'darkshore.cpp:510-512 WP18 explore credit 945',
      };
    case 20:
      return {
        handled: true,
        questCredit: false,
        questId: null,
        textId: SAY_THERYLUNE_FINISH,
        setRun: true,
        cite: 'darkshore.cpp:514-517 WP20 SAY finish + SetRun',
      };
    default:
      return {
        handled: false,
        questCredit: false,
        questId: null,
        textId: null,
        setRun: false,
        cite: 'darkshore.cpp:506-519 unknown WP',
      };
  }
}

// Pure helpers — Rabid bear capture

export interface RabidBearSpellHitResult {
  handled: boolean;
  stripAurasEvade: boolean;
  combatStop: boolean;
  updateEntry: number | null;
  killCreditEntry: number | null;
  moveFollow: boolean;
  forceDespawnMs: number;
  clearCheckTimer: boolean;
  armDespawnMs: number;
  cite: string;
}

/** Port of SpellHit SPELL_BEAR_CAPTURED. Cite: darkshore.cpp:597–620 */
export function rabidBearSpellHit(
  spellId: number,
  isPlayerCaster: boolean,
  questIncomplete: boolean,
): RabidBearSpellHitResult {
  if (!isPlayerCaster || spellId !== SPELL_BEAR_CAPTURED) {
    return {
      handled: false,
      stripAurasEvade: false,
      combatStop: false,
      updateEntry: null,
      killCreditEntry: null,
      moveFollow: false,
      forceDespawnMs: 0,
      clearCheckTimer: false,
      armDespawnMs: 0,
      cite: 'darkshore.cpp:599 not player or spell != 9439 → no-op',
    };
  }
  if (!questIncomplete) {
    return {
      handled: true,
      stripAurasEvade: true,
      combatStop: true,
      updateEntry: NPC_CAPTURED_RABID_THISTLE_BEAR,
      killCreditEntry: null,
      moveFollow: false,
      forceDespawnMs: RABID_BEAR_HANDOFF_DESPAWN_MS,
      clearCheckTimer: true,
      armDespawnMs: 0,
      cite: 'darkshore.cpp:601-614 UpdateEntry then unexpected → ForcedDespawn 1000',
    };
  }
  return {
    handled: true,
    stripAurasEvade: true,
    combatStop: true,
    updateEntry: NPC_CAPTURED_RABID_THISTLE_BEAR,
    killCreditEntry: NPC_CAPTURED_RABID_THISTLE_BEAR,
    moveFollow: true,
    forceDespawnMs: 0,
    clearCheckTimer: true,
    armDespawnMs: RABID_BEAR_CAPTURE_DESPAWN_MS,
    cite: 'darkshore.cpp:601-619 strip + UpdateEntry 11836 + KilledMonsterCredit + MoveFollow + despawn 3min',
  };
}

export interface RabidBearTharnariunLosResult {
  handled: boolean;
  forceDespawnMs: number;
  moveIdle: boolean;
  cite: string;
}

// Port of MoveInLineOfSight Tharnariun hand-off (only when m_uiCheckTimer == 0). Cite:
// darkshore.cpp:582–591
export function rabidBearTharnariunLos(
  checkTimerMs: number,
  whoIsUnit: boolean,
  whoEntry: number,
  withinRange: boolean,
): RabidBearTharnariunLosResult {
  if (checkTimerMs !== 0) {
    return {
      handled: false,
      forceDespawnMs: 0,
      moveIdle: false,
      cite: 'darkshore.cpp:584 m_uiCheckTimer != 0 → ScriptedAI LOS only',
    };
  }
  if (!whoIsUnit || whoEntry !== NPC_THARNARIUN_TREETENDER || !withinRange) {
    return {
      handled: false,
      forceDespawnMs: 0,
      moveIdle: false,
      cite: 'darkshore.cpp:584-585 not Tharnariun in range',
    };
  }
  return {
    handled: true,
    forceDespawnMs: RABID_BEAR_HANDOFF_DESPAWN_MS,
    moveIdle: true,
    cite: 'darkshore.cpp:588-589 ForcedDespawn 1000 + MoveIdle',
  };
}

// Pure helpers — Blackwood flee + purification + GO food

export interface BlackwoodFleeResult {
  flee: boolean;
  textId: number | null;
  disableFleeAction: boolean;
  cite: string;
}

/** Port of ACTION_FLEE ExecuteAction. Cite: darkshore.cpp:792–801 */
export function blackwoodFleeCheck(hpPct: number, alreadyFled: boolean): BlackwoodFleeResult {
  if (alreadyFled) {
    return {
      flee: false,
      textId: null,
      disableFleeAction: false,
      cite: 'darkshore.cpp:792-801 already fled / action disabled',
    };
  }
  if (hpPct > BLACKWOOD_FLEE_HP_PCT) {
    return {
      flee: false,
      textId: null,
      disableFleeAction: false,
      cite: 'darkshore.cpp:794 HP% > 15 → no flee',
    };
  }
  return {
    flee: true,
    textId: EMOTE_GENERIC_FLEE,
    disableFleeAction: true,
    cite: 'darkshore.cpp:794-799 HP% <= 15 → EMOTE_GENERIC_FLEE + DoFlee + DisableCombatAction',
  };
}

export interface PurifySeekResult {
  isFirst: boolean;
  startTimerMs: number;
  cite: string;
}

/** Port of SeekPurification start delay. Cite: darkshore.cpp:769–777 */
export function blackwoodSeekPurification(
  isFirst: boolean,
  staggerRollMs: number,
): PurifySeekResult {
  if (isFirst) {
    return {
      isFirst: true,
      startTimerMs: 0,
      cite: 'darkshore.cpp:773-774 first → EVENT_START_PURIFICATION 0',
    };
  }
  const roll = Math.max(0, Math.min(PURIFY_START_STAGGER_MAX_MS, staggerRollMs | 0));
  return {
    isFirst: false,
    startTimerMs: roll,
    cite: 'darkshore.cpp:776 non-first → urand(0, 5000)',
  };
}

export interface PurifyStartResult {
  handled: boolean;
  emoteLured: boolean;
  combatScript: boolean;
  reactPassive: boolean;
  immuneToPlayer: boolean;
  combatStop: boolean;
  moveToBowl: boolean;
  cite: string;
}

// Port of the EVENT_START_PURIFICATION custom action, gating on the squared bowl distance.
// Cite: darkshore.cpp:711–728.
export function blackwoodStartPurification(
  bowlDistSq: number,
  isFirst: boolean,
): PurifyStartResult {
  if (!(bowlDistSq <= PURIFY_BOWL_DIST_SQ)) {
    return {
      handled: false,
      emoteLured: false,
      combatScript: false,
      reactPassive: false,
      immuneToPlayer: false,
      combatStop: false,
      moveToBowl: false,
      cite: 'darkshore.cpp:713 bowl distance > 3600 → skip',
    };
  }
  return {
    handled: true,
    emoteLured: isFirst,
    combatScript: true,
    reactPassive: true,
    immuneToPlayer: true,
    combatStop: true,
    moveToBowl: true,
    cite: 'darkshore.cpp:715-727 EMOTE_LURED if first + passive + immune player + MovePoint bowl',
  };
}

export interface PurifyBecomeResult {
  emotePurified: boolean;
  factionId: number;
  factionFlags: number;
  roamRadiusYd: number;
  resetTimerMs: number;
  cite: string;
}

/** Port of EVENT_BECOME_PURIFIED. Cite: darkshore.cpp:695–703 */
export function blackwoodBecomePurified(isFirst: boolean): PurifyBecomeResult {
  return {
    emotePurified: isFirst,
    factionId: FACTION_BLACKWOOD,
    factionFlags: TEMPFACTION_RESTORE_COMBAT_STOP,
    roamRadiusYd: 40,
    resetTimerMs: PURIFY_RESET_MS,
    cite: 'darkshore.cpp:697-702 EMOTE_PURIFIED if first + faction 35 + MoveRandom 40yd + reset 90s',
  };
}

export interface PurifyFoodEventResult {
  handled: boolean;
  bowlDistanceYd: number;
  furbolgSearchYd: number;
  extraWarriors: number;
  summonRadiusYd: number;
  tempDespawnMs: number;
  warriorEntry: number;
  cite: string;
}

/** Port of ProcessEventId_event_purify_food (player + GO target). Cite: darkshore.cpp:826–860 */
export function purifyFoodProcessEvent(
  sourceIsPlayer: boolean,
  targetIsGo: boolean,
): PurifyFoodEventResult {
  if (!sourceIsPlayer || !targetIsGo) {
    return {
      handled: false,
      bowlDistanceYd: 0,
      furbolgSearchYd: 0,
      extraWarriors: 0,
      summonRadiusYd: 0,
      tempDespawnMs: 0,
      warriorEntry: 0,
      cite: 'darkshore.cpp:828 !player source or !GO target → return true without work',
    };
  }
  return {
    handled: true,
    bowlDistanceYd: BOWL_DISTANCE,
    furbolgSearchYd: PURIFY_FURBOLG_SEARCH_YD,
    extraWarriors: PURIFY_EXTRA_WARRIORS,
    summonRadiusYd: PURIFY_SUMMON_RADIUS_YD,
    tempDespawnMs: BLACKWOOD_TEMP_DESPAWN_MS,
    warriorEntry: NPC_BLACKWOOD_WARRIOR,
    cite: 'darkshore.cpp:830-855 grid 40yd + bowl BOWL_DISTANCE + 2× warrior summons 30yd 120s + SeekPurification last=first',
  };
}

export interface FurbolgFoodUseResult {
  handled: boolean;
  attackExisting: boolean;
  summonWarrior: boolean;
  searchYd: number;
  summonRadiusYd: number;
  tempDespawnMs: number;
  warriorEntry: number;
  cite: string;
}

// Port of GOUse_go_furbolg_food; the caller passes whether the closest warrior 2168 within 20 yd
// is alive, out of combat and attackable. Cite: darkshore.cpp:867–884.
export function furbolgFoodUse(
  nearestWarriorAliveOocAttackable: boolean,
): FurbolgFoodUseResult {
  if (nearestWarriorAliveOocAttackable) {
    return {
      handled: true,
      attackExisting: true,
      summonWarrior: false,
      searchYd: FURBOLG_FOOD_RANGE_YD,
      summonRadiusYd: FURBOLG_FOOD_RANGE_YD,
      tempDespawnMs: BLACKWOOD_TEMP_DESPAWN_MS,
      warriorEntry: NPC_BLACKWOOD_WARRIOR,
      cite: 'darkshore.cpp:870-873 closest warrior AttackStart player',
    };
  }
  return {
    handled: true,
    attackExisting: false,
    summonWarrior: true,
    searchYd: FURBOLG_FOOD_RANGE_YD,
    summonRadiusYd: FURBOLG_FOOD_RANGE_YD,
    tempDespawnMs: BLACKWOOD_TEMP_DESPAWN_MS,
    warriorEntry: NPC_BLACKWOOD_WARRIOR,
    cite: 'darkshore.cpp:876-881 no warrior → SummonCreature 2168 r20 120s + AttackStart',
  };
}

// ---------------------------------------------------------------------------
