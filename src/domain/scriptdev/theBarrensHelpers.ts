// The Barrens ScriptDev pure helpers (SESSION 10 batch). Companion to theBarrens.ts IR + constants. Cite:
// kalimdor/the_barrens.cpp

import {
  AREA_MERCHANT_COAST,
  COUNTERATTACK_RESPAWN_TIME_HORDE_INC_S,
  COUNTERATTACK_RESPAWN_TIME_HORDE_S,
  FACTION_ESCORT_H_NEUTRAL_ACTIVE,
  FACTION_FRIENDLY_F,
  FACTION_HOSTILE_CHALLENGER,
  FACTION_HOSTILE_WILL,
  FACTION_RATCHET,
  FIZZULE_FLARE_1,
  FIZZULE_FLARE_2,
  FIZZULE_RESET_TIMER_MS,
  FIZZULE_SALUTE,
  FIZZULE_WHISTLE,
  GILTHARES_WAYPOINTS,
  KILL_LIMIT,
  MAX_CHALLENGERS,
  NPC_AFFRAY_CHALLENGER,
  NPC_BIG_WILL,
  NPC_KOLKAR_INVADER,
  NPC_KOLKAR_STORMSEER,
  NPC_PILOT_WIZZ,
  NPC_WARLORD_KROMZAR,
  QUEST_AFFRAY,
  QUEST_COUNTERATTACK,
  QUEST_ESCAPE,
  QUEST_FREE_FROM_HOLD,
  REGTHAR_EVENT_DURATION_MS,
  SAY_BIG_WILL_READY,
  SAY_DEFENDER,
  SAY_GIL_AGGRO_1,
  SAY_GIL_AGGRO_2,
  SAY_GIL_AGGRO_3,
  SAY_GIL_AGGRO_4,
  SAY_GIL_START,
  SAY_START_REGTHAR,
  SAY_STEALTH_ALERT_GALLYWIX,
  SAY_STEALTH_ALERT_LOOKOUT_1,
  SAY_STEALTH_ALERT_LOOKOUT_2,
  SAY_STEALTH_ALERT_SILIXIZ,
  SAY_TWIGGY_BEGIN,
  SAY_TWIGGY_DOWN,
  SAY_TWIGGY_FRAY,
  SAY_TWIGGY_OVER,
  SAY_WIZZ_END,
  SAY_WIZZ_MERCENARY,
  SAY_WIZZ_PROGRESS_1,
  SAY_WIZZ_PROGRESS_2,
  SAY_WIZZ_PROGRESS_3,
  SAY_WIZZ_START,
  SAY_WIZZ_STARTUP1,
  SAY_WIZZ_STARTUP2,
  SPAWN_POINTS_HORDE,
  SPAWN_POINTS_KOLKAR,
  SPELL_DECIMATE,
  SPELL_FLARE,
  SPELL_FOLLY,
  SPELL_SLUSH,
  TEMPFACTION_RESTORE_RESPAWN,
  TEMPFACTION_TOGGLE_IMMUNE_TO_NPC,
  TEXTEMOTE_SALUTE,
  TWIGGY_AFTER_BIG_WILL_SUMMON_MS,
  TWIGGY_AFTER_CHALLENGER_DEATH_MS,
  TWIGGY_AFTER_LAST_CHALLENGER_MS,
  TWIGGY_AFTER_SUMMON_MS,
  TWIGGY_AT_SEARCH_YD,
  TWIGGY_CHALLENGER_GAP_MS,
  TWIGGY_EVENT_TIMER_INIT_MS,
  UNIT_STAND_STATE_STAND,
  WIZZ_POST_EVENT_STEP_MS,
  YELL_RETREAT,
} from './theBarrens.ts';

// npc_gilthares

export interface GiltharesQuestAcceptResult {
  handled: boolean;
  factionId: number;
  tempFactionFlags: number;
  standState: number;
  textId: number | null;
  startEscort: boolean;
  run: boolean;
  questId: number;
  cite: string;
}

/** Port of QuestAccept_npc_gilthares. Cite: the_barrens.cpp:128–141 */
export function giltharesQuestAccept(questId: number): GiltharesQuestAcceptResult {
  if (questId !== QUEST_FREE_FROM_HOLD) {
    return {
      handled: false,
      factionId: 0,
      tempFactionFlags: 0,
      standState: UNIT_STAND_STATE_STAND,
      textId: null,
      startEscort: false,
      run: false,
      questId,
      cite: 'the_barrens.cpp:130 quest != 898 → no-op',
    };
  }
  return {
    handled: true,
    factionId: FACTION_ESCORT_H_NEUTRAL_ACTIVE,
    tempFactionFlags: TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC,
    standState: UNIT_STAND_STATE_STAND,
    textId: SAY_GIL_START,
    startEscort: true,
    run: false,
    questId: QUEST_FREE_FROM_HOLD,
    cite: 'the_barrens.cpp:132-138 faction 232 + STAND + SAY_GIL_START + Start(false)',
  };
}

export interface GiltharesWaypointResult {
  handled: boolean;
  textId: number | null;
  questId: number | null;
  cite: string;
}

/** Port of npc_giltharesAI::WaypointReached. Cite: the_barrens.cpp:71–100 */
export function giltharesWaypointReached(pointId: number): GiltharesWaypointResult {
  const step = GILTHARES_WAYPOINTS.find((w) => w.pointId === pointId);
  if (!step) {
    return {
      handled: false,
      textId: null,
      questId: null,
      cite: 'the_barrens.cpp:71-100 no WP action',
    };
  }
  return {
    handled: true,
    textId: step.textId,
    questId: step.questCredit ? QUEST_FREE_FROM_HOLD : null,
    cite: step.cite,
  };
}

// Aggro text gate: a non-zero urand(0,3) is silent, and only a non-player in area 391 speaks.
// Cite: the_barrens.cpp:102–120.
export function giltharesAggroText(
  roll0to3: number,
  textRoll0to3: number,
  whoIsPlayer: boolean,
  areaId: number,
): number | null {
  // Cite: the_barrens.cpp:105-106 if (urand(0, 3)) return;
  if ((roll0to3 | 0) !== 0) return null;
  // Cite: the_barrens.cpp:109 non-player + AREA_MERCHANT_COAST
  if (whoIsPlayer || areaId !== AREA_MERCHANT_COAST) return null;
  const texts = [SAY_GIL_AGGRO_1, SAY_GIL_AGGRO_2, SAY_GIL_AGGRO_3, SAY_GIL_AGGRO_4] as const;
  return texts[(textRoll0to3 | 0) & 3] ?? SAY_GIL_AGGRO_1;
}

// npc_taskmaster_fizzule

export interface FizzuleState {
  resetTimerMs: number;
  flareCount: number;
  immuneToPlayer: boolean;
  factionId: number | null;
  questGiverFlag: boolean;
  saluteEmote: boolean;
}

/** Ctor / initial state. Cite: the_barrens.cpp:161–165 resetTimer=0 flareCount=0 */
export function fizzuleInitialState(): FizzuleState {
  return {
    resetTimerMs: 0,
    flareCount: 0,
    immuneToPlayer: false,
    factionId: null,
    questGiverFlag: false,
    saluteEmote: false,
  };
}

/** Port of HandleFlareOrKneel switch on flareCount. Cite: the_barrens.cpp:230–253 */
export function fizzuleHandleFlareOrKneel(flareCount: number, prior: FizzuleState): FizzuleState {
  const next: FizzuleState = {
    ...prior,
    flareCount,
    saluteEmote: false,
  };
  switch (flareCount) {
    case FIZZULE_FLARE_1:
      // Cite: the_barrens.cpp:234-237
      next.resetTimerMs = FIZZULE_RESET_TIMER_MS;
      next.immuneToPlayer = true;
      break;
    case FIZZULE_FLARE_2:
      // Cite: the_barrens.cpp:238-240
      next.factionId = FACTION_FRIENDLY_F;
      break;
    case FIZZULE_SALUTE:
      // Cite: the_barrens.cpp:241-244
      next.questGiverFlag = true;
      next.saluteEmote = true;
      break;
    case FIZZULE_WHISTLE:
      // Cite: the_barrens.cpp:245-251
      next.resetTimerMs = FIZZULE_RESET_TIMER_MS;
      next.immuneToPlayer = true;
      next.factionId = FACTION_FRIENDLY_F;
      next.questGiverFlag = true;
      next.saluteEmote = true;
      break;
    default:
      break;
  }
  return next;
}

export interface FizzuleSpellHitResult {
  handled: boolean;
  state: FizzuleState;
  cite: string;
}

/** Port of SpellHit for Flare / Folly (player caster only). Cite: the_barrens.cpp:183–206 */
export function fizzuleSpellHit(
  spellId: number,
  casterIsPlayer: boolean,
  prior: FizzuleState,
): FizzuleSpellHitResult {
  if (!casterIsPlayer) {
    return {
      handled: false,
      state: prior,
      cite: 'the_barrens.cpp:185-186 non-player caster ignored',
    };
  }
  if (spellId === SPELL_FLARE) {
    // Cite: the_barrens.cpp:190-197 if flareCount < 2 → ++ and Handle
    if (prior.flareCount < 2) {
      const flareCount = prior.flareCount + 1;
      return {
        handled: true,
        state: fizzuleHandleFlareOrKneel(flareCount, prior),
        cite: 'the_barrens.cpp:190-197 SPELL_FLARE ++flareCount HandleFlareOrKneel',
      };
    }
    return {
      handled: false,
      state: prior,
      cite: 'the_barrens.cpp:192 flareCount >= 2 → ignore extra Flare',
    };
  }
  if (spellId === SPELL_FOLLY) {
    // Cite: the_barrens.cpp:199-203 flareCount = 4 (whistle path)
    return {
      handled: true,
      state: fizzuleHandleFlareOrKneel(FIZZULE_WHISTLE, prior),
      cite: 'the_barrens.cpp:199-203 SPELL_FOLLY flareCount=4 HandleFlareOrKneel whistle',
    };
  }
  return {
    handled: false,
    state: prior,
    cite: 'the_barrens.cpp:183-206 unrelated spell',
  };
}

/** Port of ReceiveEmote SALUTE when flareCount == 2. Cite: the_barrens.cpp:255–265 */
export function fizzuleReceiveEmote(
  textEmote: number,
  prior: FizzuleState,
): FizzuleSpellHitResult {
  if (textEmote !== TEXTEMOTE_SALUTE) {
    return {
      handled: false,
      state: prior,
      cite: 'the_barrens.cpp:257 not SALUTE',
    };
  }
  if (prior.flareCount !== FIZZULE_FLARE_2) {
    return {
      handled: false,
      state: prior,
      cite: 'the_barrens.cpp:259 flareCount != 2 → ignore salute',
    };
  }
  const flareCount = prior.flareCount + 1;
  return {
    handled: true,
    state: fizzuleHandleFlareOrKneel(flareCount, prior),
    cite: 'the_barrens.cpp:259-263 SALUTE at count 2 → count 3 + questgiver + salute',
  };
}

// Port of UpdateAI resetTimer expiry. Cite: the_barrens.cpp:208–222 Fizzule uses `<=` for expiry
// (the_barrens.cpp:212), unlike Twiggy's strict `<`.
export function fizzuleResetTimerTick(
  prior: FizzuleState,
  diffMs: number,
): { state: FizzuleState; expired: boolean; enterEvade: boolean; cite: string } {
  if (prior.resetTimerMs <= 0) {
    return {
      state: prior,
      expired: false,
      enterEvade: false,
      cite: 'the_barrens.cpp:210 no resetTimer',
    };
  }
  if (prior.resetTimerMs <= diffMs) {
    // Cite: the_barrens.cpp:212-218 clear timer/count, remove questgiver, not immune, evade
    return {
      state: {
        resetTimerMs: 0,
        flareCount: 0,
        immuneToPlayer: false,
        factionId: null,
        questGiverFlag: false,
        saluteEmote: false,
      },
      expired: true,
      enterEvade: true,
      cite: 'the_barrens.cpp:212-218 resetTimer expired → clear count + EnterEvadeMode',
    };
  }
  return {
    state: { ...prior, resetTimerMs: prior.resetTimerMs - diffMs },
    expired: false,
    enterEvade: false,
    cite: 'the_barrens.cpp:220-221 decrement resetTimer',
  };
}

// npc_twiggy_flathead + at_twiggy_flathead

export interface TwiggyEventState {
  inProgress: boolean;
  eventTimerMs: number;
  challengerCount: number;
  step: number;
  challengerSlots: number;
  bigWillAlive: boolean;
}

/** Port of Reset. Cite: the_barrens.cpp:324–336 */
export function twiggyReset(): TwiggyEventState {
  return {
    inProgress: false,
    eventTimerMs: TWIGGY_EVENT_TIMER_INIT_MS,
    challengerCount: 0,
    step: 0,
    challengerSlots: 0,
    bigWillAlive: false,
  };
}

export interface TwiggyCanStartResult {
  started: boolean;
  textId: number | null;
  cite: string;
}

/** Port of CanStartEvent. Cite: the_barrens.cpp:352–365 */
export function twiggyCanStartEvent(inProgress: boolean): TwiggyCanStartResult {
  if (inProgress) {
    return {
      started: false,
      textId: null,
      cite: 'the_barrens.cpp:363-364 event already in progress',
    };
  }
  return {
    started: true,
    textId: SAY_TWIGGY_BEGIN,
    cite: 'the_barrens.cpp:356-360 SAY_TWIGGY_BEGIN + m_bIsEventInProgress=true',
  };
}

export interface TwiggyAreaTriggerResult {
  handled: boolean;
  needTwiggy: boolean;
  tryStart: boolean;
  questId: number;
  searchYd: number;
  cite: string;
}

/** Port of AreaTrigger_at_twiggy_flathead gate. Cite: the_barrens.cpp:490–507 */
export function twiggyAreaTrigger(opts: {
  playerAlive: boolean;
  isGameMaster: boolean;
  questStatus: 'none' | 'incomplete' | 'complete' | 'failed';
}): TwiggyAreaTriggerResult {
  // Cite: the_barrens.cpp:492 alive && !GM && incomplete 1719
  if (!opts.playerAlive || opts.isGameMaster || opts.questStatus !== 'incomplete') {
    return {
      handled: false,
      needTwiggy: false,
      tryStart: false,
      questId: QUEST_AFFRAY,
      searchYd: TWIGGY_AT_SEARCH_YD,
      cite: 'the_barrens.cpp:492 gate fail → return true (no start)',
    };
  }
  return {
    handled: true,
    needTwiggy: true,
    tryStart: true,
    questId: QUEST_AFFRAY,
    searchYd: TWIGGY_AT_SEARCH_YD,
    cite: 'the_barrens.cpp:494-501 find Twiggy ≤30yd + CanStartEvent',
  };
}

export interface TwiggyTimerTickResult {
  state: TwiggyEventState;
  summonChallengers: boolean;
  summonCount: number;
  summonEntry: number;
  textId: number | null;
  activateChallengerIndex: number | null;
  challengerFaction: number | null;
  summonBigWill: boolean;
  failEvent: boolean;
  cite: string;
}

// Port of the UpdateAI event timer steps. Timers fire on a strict `timer < diff`.
// Cite: the_barrens.cpp:430–482, :435, :480-481.
export function twiggyEventTimerTick(
  prior: TwiggyEventState,
  diffMs: number,
  playerAlive: boolean,
): TwiggyTimerTickResult {
  if (!prior.inProgress) {
    return {
      state: prior,
      summonChallengers: false,
      summonCount: 0,
      summonEntry: 0,
      textId: null,
      activateChallengerIndex: null,
      challengerFaction: null,
      summonBigWill: false,
      failEvent: false,
      cite: 'the_barrens.cpp:432-433 not in progress',
    };
  }
  // Cite: the_barrens.cpp:435 if (m_uiEventTimer < uiDiff) fire; else decrement.
  if (prior.eventTimerMs >= diffMs) {
    return {
      state: { ...prior, eventTimerMs: prior.eventTimerMs - diffMs },
      summonChallengers: false,
      summonCount: 0,
      summonEntry: 0,
      textId: null,
      activateChallengerIndex: null,
      challengerFaction: null,
      summonBigWill: false,
      failEvent: false,
      cite: 'the_barrens.cpp:481 decrement timer',
    };
  }
  if (!playerAlive) {
    return {
      state: twiggyReset(),
      summonChallengers: false,
      summonCount: 0,
      summonEntry: 0,
      textId: null,
      activateChallengerIndex: null,
      challengerFaction: null,
      summonBigWill: false,
      failEvent: true,
      cite: 'the_barrens.cpp:439-442 !player → FailEvent',
    };
  }
  switch (prior.step) {
    case 0: {
      // Cite: the_barrens.cpp:447-450 SetChallengers + timer 5000 + step++
      return {
        state: {
          ...prior,
          step: 1,
          eventTimerMs: TWIGGY_AFTER_SUMMON_MS,
          challengerSlots: MAX_CHALLENGERS,
        },
        summonChallengers: true,
        summonCount: MAX_CHALLENGERS,
        summonEntry: NPC_AFFRAY_CHALLENGER,
        textId: null,
        activateChallengerIndex: null,
        challengerFaction: null,
        summonBigWill: false,
        failEvent: false,
        cite: 'the_barrens.cpp:447-450 step0 SetChallengers 6×6240 timer 5000',
      };
    }
    case 1: {
      // Cite: the_barrens.cpp:452-468 SAY_TWIGGY_FRAY + SetChallengerReady
      const idx = prior.challengerCount;
      if (idx >= prior.challengerSlots) {
        return {
          state: twiggyReset(),
          summonChallengers: false,
          summonCount: 0,
          summonEntry: 0,
          textId: null,
          activateChallengerIndex: null,
          challengerFaction: null,
          summonBigWill: false,
          failEvent: true,
          cite: 'the_barrens.cpp:456-459 missing challenger → FailEvent',
        };
      }
      const nextCount = prior.challengerCount + 1;
      const last = nextCount === MAX_CHALLENGERS;
      return {
        state: {
          ...prior,
          challengerCount: nextCount,
          step: last ? 2 : 1,
          eventTimerMs: last ? TWIGGY_AFTER_LAST_CHALLENGER_MS : TWIGGY_CHALLENGER_GAP_MS,
        },
        summonChallengers: false,
        summonCount: 0,
        summonEntry: 0,
        textId: SAY_TWIGGY_FRAY,
        activateChallengerIndex: idx,
        challengerFaction: FACTION_HOSTILE_CHALLENGER,
        summonBigWill: false,
        failEvent: false,
        cite: last
          ? 'the_barrens.cpp:462-465 last challenger → step2 timer 5000'
          : 'the_barrens.cpp:467-468 arm next challenger in 25000',
      };
    }
    case 2: {
      // Cite: the_barrens.cpp:470-473 summon Big Will + timer 15000 + step++
      return {
        state: {
          ...prior,
          step: 3,
          eventTimerMs: TWIGGY_AFTER_BIG_WILL_SUMMON_MS,
          bigWillAlive: true,
        },
        summonChallengers: false,
        summonCount: 0,
        summonEntry: 0,
        textId: null,
        activateChallengerIndex: null,
        challengerFaction: null,
        summonBigWill: true,
        failEvent: false,
        cite: 'the_barrens.cpp:470-473 step2 SummonCreature BIG_WILL 6238 timer 15000',
      };
    }
    default:
      // Cite: the_barrens.cpp:475-477 default timer 5000
      return {
        state: { ...prior, eventTimerMs: 5000 },
        summonChallengers: false,
        summonCount: 0,
        summonEntry: 0,
        textId: null,
        activateChallengerIndex: null,
        challengerFaction: null,
        summonBigWill: false,
        failEvent: false,
        cite: 'the_barrens.cpp:475-477 default re-arm 5000',
      };
  }
}

export interface TwiggySummonedDeathResult {
  textId: number | null;
  eventTimerMs: number | null;
  reset: boolean;
  cite: string;
}

/** Port of SummonedCreatureJustDied. Cite: the_barrens.cpp:416–428 */
export function twiggySummonedJustDied(entry: number): TwiggySummonedDeathResult {
  if (entry === NPC_BIG_WILL) {
    return {
      textId: SAY_TWIGGY_OVER,
      eventTimerMs: null,
      reset: true,
      cite: 'the_barrens.cpp:418-421 BIG_WILL death → SAY_TWIGGY_OVER + Reset',
    };
  }
  return {
    textId: SAY_TWIGGY_DOWN,
    eventTimerMs: TWIGGY_AFTER_CHALLENGER_DEATH_MS,
    reset: false,
    cite: 'the_barrens.cpp:423-427 challenger death → SAY_TWIGGY_DOWN timer 15000',
  };
}

/** Port of SummonedMovementInform for Big Will → hostile + ready text. Cite: the_barrens.cpp:402–414 */
export function twiggyBigWillArrived(): {
  factionId: number;
  textId: number;
  cite: string;
} {
  return {
    factionId: FACTION_HOSTILE_WILL,
    textId: SAY_BIG_WILL_READY,
    cite: 'the_barrens.cpp:407-413 setFaction 32 + SAY_BIG_WILL_READY',
  };
}

// npc_wizzlecranks_shredder

export interface WizzleQuestAcceptResult {
  handled: boolean;
  textId: number | null;
  factionId: number;
  startEscort: boolean;
  run: boolean;
  questId: number;
  cite: string;
}

/** Port of QuestAccept_npc_wizzlecranks_shredder. Cite: the_barrens.cpp:649–660 */
export function wizzleQuestAccept(questId: number): WizzleQuestAcceptResult {
  if (questId !== QUEST_ESCAPE) {
    return {
      handled: false,
      textId: null,
      factionId: 0,
      startEscort: false,
      run: false,
      questId,
      cite: 'the_barrens.cpp:651 quest != 863 → no-op',
    };
  }
  return {
    handled: true,
    textId: SAY_WIZZ_START,
    factionId: FACTION_RATCHET,
    startEscort: true,
    run: true,
    questId: QUEST_ESCAPE,
    cite: 'the_barrens.cpp:653-657 SAY_START + FACTION_RATCHET 637 + Start(true)',
  };
}

export interface WizzleWaypointResult {
  handled: boolean;
  textId: number | null;
  setRun: boolean | null;
  summonMercenaries: boolean;
  postEvent: boolean;
  cite: string;
}

/** Port of WaypointReached. Cite: the_barrens.cpp:557–579 */
export function wizzleWaypointReached(pointId: number): WizzleWaypointResult {
  switch (pointId) {
    case 1:
      return {
        handled: true,
        textId: SAY_WIZZ_STARTUP1,
        setRun: null,
        summonMercenaries: false,
        postEvent: false,
        cite: 'the_barrens.cpp:561-564 case 1 SAY_STARTUP1',
      };
    case 10:
      return {
        handled: true,
        textId: null,
        setRun: false,
        summonMercenaries: false,
        postEvent: false,
        cite: 'the_barrens.cpp:565-567 case 10 SetRun(false)',
      };
    case 18:
      return {
        handled: true,
        textId: SAY_WIZZ_MERCENARY,
        setRun: null,
        summonMercenaries: true,
        postEvent: false,
        cite: 'the_barrens.cpp:568-573 case 18 summon 2×3282 + SAY_MERCENARY',
      };
    case 25:
      return {
        handled: true,
        textId: null,
        setRun: null,
        summonMercenaries: false,
        postEvent: true,
        cite: 'the_barrens.cpp:575-577 case 25 m_bIsPostEvent=true',
      };
    default:
      return {
        handled: false,
        textId: null,
        setRun: null,
        summonMercenaries: false,
        postEvent: false,
        cite: 'the_barrens.cpp:557-579 no WP action',
      };
  }
}

/** Port of WaypointStart. Cite: the_barrens.cpp:581–595 */
export function wizzleWaypointStart(pointId: number): WizzleWaypointResult {
  switch (pointId) {
    case 10:
      return {
        handled: true,
        textId: SAY_WIZZ_STARTUP2,
        setRun: null,
        summonMercenaries: false,
        postEvent: false,
        cite: 'the_barrens.cpp:585-588 case 10 SAY_STARTUP2',
      };
    case 19:
      return {
        handled: true,
        textId: SAY_WIZZ_PROGRESS_1,
        setRun: true,
        summonMercenaries: false,
        postEvent: false,
        cite: 'the_barrens.cpp:589-593 case 19 SAY_PROGRESS_1 + SetRun()',
      };
    default:
      return {
        handled: false,
        textId: null,
        setRun: null,
        summonMercenaries: false,
        postEvent: false,
        cite: 'the_barrens.cpp:581-595 no WP start action',
      };
  }
}

export interface WizzlePostEventResult {
  textId: number | null;
  questCredit: boolean;
  questId: number | null;
  summonPilot: boolean;
  pilotEntry: number | null;
  nextCount: number;
  nextTimerMs: number;
  cite: string;
}

/** Port of post-event OOC switch (m_uiPostEventCount). Cite: the_barrens.cpp:614–637 */
export function wizzlePostEventStep(count: number): WizzlePostEventResult {
  switch (count) {
    case 0:
      return {
        textId: SAY_WIZZ_PROGRESS_2,
        questCredit: false,
        questId: null,
        summonPilot: false,
        pilotEntry: null,
        nextCount: 1,
        nextTimerMs: WIZZ_POST_EVENT_STEP_MS,
        cite: 'the_barrens.cpp:616-618 case 0 SAY_PROGRESS_2',
      };
    case 1:
      return {
        textId: SAY_WIZZ_PROGRESS_3,
        questCredit: false,
        questId: null,
        summonPilot: false,
        pilotEntry: null,
        nextCount: 2,
        nextTimerMs: WIZZ_POST_EVENT_STEP_MS,
        cite: 'the_barrens.cpp:619-622 case 1 SAY_PROGRESS_3',
      };
    case 2:
      return {
        textId: SAY_WIZZ_END,
        questCredit: false,
        questId: null,
        summonPilot: false,
        pilotEntry: null,
        nextCount: 3,
        nextTimerMs: WIZZ_POST_EVENT_STEP_MS,
        cite: 'the_barrens.cpp:623-625 case 2 SAY_END',
      };
    case 3:
      return {
        textId: null,
        questCredit: true,
        questId: QUEST_ESCAPE,
        summonPilot: true,
        pilotEntry: NPC_PILOT_WIZZ,
        nextCount: 4,
        nextTimerMs: WIZZ_POST_EVENT_STEP_MS,
        cite: 'the_barrens.cpp:626-631 case 3 explore 863 + summon Pilot 3451',
      };
    default:
      return {
        textId: null,
        questCredit: false,
        questId: null,
        summonPilot: false,
        pilotEntry: null,
        nextCount: count + 1,
        nextTimerMs: WIZZ_POST_EVENT_STEP_MS,
        cite: 'the_barrens.cpp:614-637 post-event past end',
      };
  }
}

// npc_gallywix / silixiz / lookout

/** Port of npc_gallywixAI::OnStealthAlert. Cite: the_barrens.cpp:687–690 */
export function gallywixStealthAlert(): { textId: number; cite: string } {
  return {
    textId: SAY_STEALTH_ALERT_GALLYWIX,
    cite: 'the_barrens.cpp:687-690 OnStealthAlert SAY_STEALTH_ALERT_GALLYWIX',
  };
}

/** Port of DamageTaken Ambush → self Decimate. Cite: the_barrens.cpp:692–696 */
export function gallywixDamageTaken(isRogueAmbush: boolean): {
  castDecimate: boolean;
  spellId: number | null;
  cite: string;
} {
  if (!isRogueAmbush) {
    return {
      castDecimate: false,
      spellId: null,
      cite: 'the_barrens.cpp:694 not Ambush family → no cast',
    };
  }
  return {
    castDecimate: true,
    spellId: SPELL_DECIMATE,
    cite: 'the_barrens.cpp:694-695 Ambush family → CastSpell SPELL_DECIMATE 10268 triggered',
  };
}

/** Port of npc_foreman_silixizAI::OnStealthAlert. Cite: the_barrens.cpp:729–732 */
export function silixizStealthAlert(): { textId: number; cite: string } {
  return {
    textId: SAY_STEALTH_ALERT_SILIXIZ,
    cite: 'the_barrens.cpp:729-732 OnStealthAlert SAY_STEALTH_ALERT_SILIXIZ',
  };
}

// Port of npc_venture_co_lookoutAI::OnStealthAlert. Cite: the_barrens.cpp:708–711 Pure-helper roll API: 0 →
// LOOKOUT_1, non-zero → LOOKOUT_2 (test surface; cpp uses truthy urand ternary which maps inverted).
export function lookoutStealthAlert(roll0to1: number): { textId: number; cite: string } {
  return {
    textId: (roll0to1 | 0) === 0 ? SAY_STEALTH_ALERT_LOOKOUT_1 : SAY_STEALTH_ALERT_LOOKOUT_2,
    cite: 'the_barrens.cpp:708-711 OnStealthAlert urand LOOKOUT_1/2',
  };
}

/** Port of DamageTaken Eviscerate → self Slush. Cite: the_barrens.cpp:713–717 */
export function lookoutDamageTaken(isRogueEviscerate: boolean): {
  castSlush: boolean;
  spellId: number | null;
  cite: string;
} {
  if (!isRogueEviscerate) {
    return {
      castSlush: false,
      spellId: null,
      cite: 'the_barrens.cpp:715 not Eviscerate family → no cast',
    };
  }
  return {
    castSlush: true,
    spellId: SPELL_SLUSH,
    cite: 'the_barrens.cpp:715-716 Eviscerate family → CastSpell SPELL_SLUSH 10267 triggered',
  };
}

// npc_regthar_deathgate

export interface RegtharEventState {
  eventStarted: boolean;
  eventTimerMs: number;
  kolkarKillCount: number;
  isKromzarSpawned: boolean;
}

/** Port of Reset. Cite: the_barrens.cpp:928–940 */
export function regtharReset(): RegtharEventState {
  return {
    eventStarted: false,
    eventTimerMs: 0,
    kolkarKillCount: 0,
    isKromzarSpawned: false,
  };
}

export interface RegtharStartResult {
  started: boolean;
  eventTimerMs: number;
  hordeSlots: number;
  kolkarSlots: number;
  textId: number | null;
  cite: string;
}

// Port of StartEvent (+ quest accept / gossip wrapper text). Cite:
// the_barrens.cpp:948–959,1073–1082,1085–1094
export function regtharStartEvent(alreadyStarted: boolean): RegtharStartResult {
  if (alreadyStarted) {
    return {
      started: false,
      eventTimerMs: 0,
      hordeSlots: 0,
      kolkarSlots: 0,
      textId: null,
      cite: 'the_barrens.cpp:950-951 already started → no-op',
    };
  }
  return {
    started: true,
    eventTimerMs: REGTHAR_EVENT_DURATION_MS,
    hordeSlots: SPAWN_POINTS_HORDE.length,
    kolkarSlots: SPAWN_POINTS_KOLKAR.length,
    textId: SAY_START_REGTHAR,
    cite: 'the_barrens.cpp:953-958 event 20min + SpawnAllSlot horde(7)/kolkar(15)',
  };
}

export interface RegtharKolkarKillResult {
  state: RegtharEventState;
  spawnKromzar: boolean;
  kromzarEntry: number | null;
  bodyguardEntries: number[];
  cite: string;
}

// Port of SummonedCreatureJustDied Kolkar branch + UpdateAI kill-limit spawn. Cite:
// the_barrens.cpp:997–1009,1032–1038
export function regtharKolkarKilled(prior: RegtharEventState): RegtharKolkarKillResult {
  if (!prior.eventStarted || prior.isKromzarSpawned) {
    return {
      state: prior,
      spawnKromzar: false,
      kromzarEntry: null,
      bodyguardEntries: [],
      cite: 'the_barrens.cpp:997-1009 not counting outside active pre-Kromzar phase',
    };
  }
  const kolkarKillCount = prior.kolkarKillCount + 1;
  if (kolkarKillCount >= KILL_LIMIT) {
    return {
      state: {
        ...prior,
        kolkarKillCount,
        isKromzarSpawned: true,
      },
      spawnKromzar: true,
      kromzarEntry: NPC_WARLORD_KROMZAR,
      // Cite: the_barrens.cpp:1034-1036 invader + kromzar + stormseer
      bodyguardEntries: [NPC_KOLKAR_INVADER, NPC_WARLORD_KROMZAR, NPC_KOLKAR_STORMSEER],
      cite: 'the_barrens.cpp:1032-1038 kill count >= 20 → spawn Kromzar pack',
    };
  }
  return {
    state: { ...prior, kolkarKillCount },
    spawnKromzar: false,
    kromzarEntry: null,
    bodyguardEntries: [],
    cite: 'the_barrens.cpp:1007-1008 ++m_kolkarKillCount',
  };
}

// Port of FinishEvent (timer expiry or Kromzar death). Cite: the_barrens.cpp:961–970,1011-1014,1027-1028
export function regtharFinishEvent(): {
  textId: number;
  forceDespawn: boolean;
  state: RegtharEventState;
  cite: string;
} {
  return {
    textId: YELL_RETREAT,
    forceDespawn: true,
    state: regtharReset(),
    cite: 'the_barrens.cpp:961-969 YELL_RETREAT + ForceDespawn maps + clear',
  };
}

/** Port of QuestAccept / GossipSelect start. Cite: the_barrens.cpp:1073–1094 */
export function regtharQuestAccept(questId: number): {
  handled: boolean;
  textId: number | null;
  startEvent: boolean;
  cite: string;
} {
  if (questId !== QUEST_COUNTERATTACK) {
    return {
      handled: false,
      textId: null,
      startEvent: false,
      cite: 'the_barrens.cpp:1075 quest != 4021',
    };
  }
  return {
    handled: true,
    textId: SAY_START_REGTHAR,
    startEvent: true,
    cite: 'the_barrens.cpp:1077-1080 SAY_START_REGTHAR + StartEvent',
  };
}

/** Horde defender death text (50%). Cite: the_barrens.cpp:992-993 urand(0,1) */
export function regtharDefenderDeathSay(roll0to1: number): number | null {
  return (roll0to1 | 0) === 1 ? SAY_DEFENDER : null;
}

/** Horde respawn delay seconds after death (size gate). Cite: the_barrens.cpp:981–987 */
export function regtharHordeRespawnDelayS(killedHordeQueueSize: number): number {
  // Cite: the_barrens.cpp:981 if size > 3 → INC else normal
  return killedHordeQueueSize > 3
    ? COUNTERATTACK_RESPAWN_TIME_HORDE_INC_S
    : COUNTERATTACK_RESPAWN_TIME_HORDE_S;
}
