// Dustwallow Marsh ScriptDev pure helpers (SESSION 10 batch). Companion to dustwallowMarsh.ts IR exports.
// Cite: kalimdor/dustwallow_marsh.cpp

import {
  BLUE_TEAM,
  EMOTE_OGR_RET_ARROW,
  EMOTE_SURRENDER,
  FACTION_ESCORT_N_FRIEND_PASSIVE,
  FACTION_ESCORT_N_NEUTRAL_PASSIVE,
  FACTION_HOSTILE_HENDEL,
  FACTION_MOR_HOSTILE,
  FACTION_MOR_RUNNING,
  GO_BOGBEAN_PLANT,
  HENDEL_OUTRO_DESPAWN_MS,
  HENDEL_SENTRY_DESPAWN_MS,
  HENDEL_SENTRY_SEARCH_YD,
  HENDEL_TEMP_FACTION_FLAGS,
  HENDEL_YIELD_HP_PCT,
  MOROKK_YIELD_HP_PCT,
  NPC_CALDWELL,
  NPC_HALLAN,
  NPC_OGRON,
  NPC_REETHE,
  NPC_SENTRY,
  NPC_SENTRY_POINT_GUARD,
  NPC_TERVOSH,
  OGRON_GLOBAL_TIMER_MS,
  OGRON_TEMP_FACTION_FLAGS,
  PHASE_COMPLETE,
  PHASE_FIGHT,
  PHASE_GUESTS,
  PHASE_INTRO,
  QUEST_CHALLENGE_MOROKK,
  QUEST_ID_STINKYS_ESCAPE_ALLIANCE,
  QUEST_ID_STINKYS_ESCAPE_HORDE,
  QUEST_MISSING_DIPLO_PT16,
  QUEST_QUESTIONING,
  RED_TEAM,
  SAY_BLUE_WINNER,
  SAY_BLUE_WINNER_OVERALL,
  SAY_MOR_CHALLENGE,
  SAY_MOR_SCARED,
  SAY_OGR_CAL_CLEANUP,
  SAY_OGR_CAL_FOUND,
  SAY_OGR_CAL_MERCY,
  SAY_OGR_HALL_GLAD,
  SAY_OGR_NODIE,
  SAY_OGR_REPLY_RET,
  SAY_OGR_RET_ARROW,
  SAY_OGR_RET_HEAR,
  SAY_OGR_RET_LUCKY,
  SAY_OGR_RET_NOCLOSER,
  SAY_OGR_RET_NOFIRE,
  SAY_OGR_RET_SWEAR,
  SAY_OGR_RET_TAKEN,
  SAY_OGR_RET_WHAT,
  SAY_OGR_SPOT,
  SAY_OGR_START,
  SAY_OGR_SURVIVE,
  SAY_OGR_TELL_FIRE,
  SAY_OGR_THANKS,
  SAY_RED_WINNER,
  SAY_RED_WINNER_OVERALL,
  SAY_STINKY_BEGIN,
  SAY_STINKY_END,
  SAY_STINKY_END_EMOTE,
  SAY_STINKY_FIRST_STOP,
  SAY_STINKY_PLANT_GATHERED,
  SAY_STINKY_SECOND_STOP,
  SAY_STINKY_THIRD_STOP_1,
  SAY_STINKY_THIRD_STOP_2,
  SAY_STINKY_THIRD_STOP_3,
  SENTRY_POINT_GUARD_SEARCH_YD,
  SENTRY_POINT_TERVOSH_DESPAWN_MS,
  SPAR_CHECK_HP_MS,
  SPAR_MOTIVATION_MS,
  SPAR_YIELD_HP_PCT,
  SPELL_FAKE_SHOT,
  SPELL_FIRST_AID,
  SPELL_TELEPORT,
  SPELL_TELEPORT_VISUAL,
  SPELL_TELEPORT_VISUAL_2,
  STINKY_AGGRO_TEXTS,
  UNIT_STAND_STATE_STAND,
} from './dustwallowMarsh.ts';

// Pure helpers — npc_morokk
// ---------------------------------------------------------------------------

export interface MorokkQuestAcceptResult {
  handled: boolean;
  startEscort: boolean;
  run: boolean;
  questId: number | null;
  cite: string;
}

/** Port of QuestAccept_npc_morokk. Cite: dustwallow_marsh.cpp:151–162 */
export function morokkQuestAccept(questId: number): MorokkQuestAcceptResult {
  if (questId !== QUEST_CHALLENGE_MOROKK) {
    return {
      handled: false,
      startEscort: false,
      run: false,
      questId: null,
      cite: 'dustwallow_marsh.cpp:153 quest != 1173 → return false',
    };
  }
  return {
    handled: true,
    startEscort: true,
    run: true,
    questId: QUEST_CHALLENGE_MOROKK,
    cite: 'dustwallow_marsh.cpp:155-156 Start(true, player, quest)',
  };
}

export interface MorokkPausedOocResult {
  startChallenge: boolean;
  textId: number | null;
  factionId: number;
  reactAggressive: boolean;
  attackStart: boolean;
  unpause: boolean;
  cite: string;
}

/** Port of UpdateEscortAI OOC while STATE_ESCORT_PAUSED (pre-fight). Cite: dustwallow_marsh.cpp:99–120 */
export function morokkPausedOoc(opts: {
  escortPaused: boolean;
  playerAlive: boolean;
  playerInRange: boolean;
}): MorokkPausedOocResult {
  if (!opts.escortPaused) {
    return {
      startChallenge: false,
      textId: null,
      factionId: 0,
      reactAggressive: false,
      attackStart: false,
      unpause: false,
      cite: 'dustwallow_marsh.cpp:101 !STATE_ESCORT_PAUSED → no challenge',
    };
  }
  if (opts.playerAlive && opts.playerInRange) {
    return {
      startChallenge: true,
      textId: SAY_MOR_CHALLENGE,
      factionId: FACTION_MOR_HOSTILE,
      reactAggressive: true,
      attackStart: true,
      unpause: false,
      cite: 'dustwallow_marsh.cpp:107-112 SAY_CHALLENGE + faction 168 + AttackStart',
    };
  }
  return {
    startChallenge: false,
    textId: null,
    factionId: 0,
    reactAggressive: false,
    attackStart: false,
    unpause: true,
    cite: 'dustwallow_marsh.cpp:114-118 player dead/OOR/missing → SetEscortPaused(false)',
  };
}

export interface MorokkLowHpResult {
  yielded: boolean;
  questCredit: boolean;
  questId: number | null;
  factionId: number;
  success: boolean;
  stopCombat: boolean;
  immuneToPlayer: boolean;
  reactPassive: boolean;
  textId: number | null;
  unpause: boolean;
  cite: string;
}

/** Port of UpdateEscortAI HP ≤30% while paused. Cite: dustwallow_marsh.cpp:122–140 */
export function morokkLowHp(
  hpPct: number,
  escortPaused: boolean,
): MorokkLowHpResult {
  if (hpPct > MOROKK_YIELD_HP_PCT || !escortPaused) {
    return {
      yielded: false,
      questCredit: false,
      questId: null,
      factionId: 0,
      success: false,
      stopCombat: false,
      immuneToPlayer: false,
      reactPassive: false,
      textId: null,
      unpause: false,
      cite:
        hpPct > MOROKK_YIELD_HP_PCT
          ? 'dustwallow_marsh.cpp:122 HP > 30 → no-op'
          : 'dustwallow_marsh.cpp:124 !STATE_ESCORT_PAUSED → no yield',
    };
  }
  return {
    yielded: true,
    questCredit: true,
    questId: QUEST_CHALLENGE_MOROKK,
    factionId: FACTION_MOR_RUNNING,
    success: true,
    stopCombat: true,
    immuneToPlayer: true,
    reactPassive: true,
    textId: SAY_MOR_SCARED,
    unpause: true,
    cite: 'dustwallow_marsh.cpp:129-136 explore 1173 + faction 35 + stop + scared + unpause',
  };
}

export interface MorokkReachedHomeResult {
  failQuest: boolean;
  forceDespawn: boolean;
  cite: string;
}

/** Port of JustReachedHome while escorting without success. Cite: dustwallow_marsh.cpp:75–85 */
export function morokkReachedHome(opts: {
  escorting: boolean;
  success: boolean;
}): MorokkReachedHomeResult {
  if (!opts.escorting || opts.success) {
    return {
      failQuest: false,
      forceDespawn: false,
      cite: 'dustwallow_marsh.cpp:77-84 !escorting or success → no fail',
    };
  }
  return {
    failQuest: true,
    forceDespawn: true,
    cite: 'dustwallow_marsh.cpp:81-82 FailQuestForPlayerAndGroup + ForcedDespawn',
  };
}

// Pure helpers — npc_ogron

export interface OgronQuestAcceptResult {
  handled: boolean;
  startEscort: boolean;
  run: boolean;
  /** Start(…, true) = instant respawn path. Cite: :454 */
  instantRespawn: boolean;
  factionId: number;
  factionFlags: number;
  textId: number | null;
  questId: number | null;
  cite: string;
}

/** Port of QuestAccept_npc_ogron. Cite: dustwallow_marsh.cpp:448–461 */
export function ogronQuestAccept(questId: number): OgronQuestAcceptResult {
  if (questId !== QUEST_QUESTIONING) {
    return {
      handled: false,
      startEscort: false,
      run: false,
      instantRespawn: false,
      factionId: 0,
      factionFlags: 0,
      textId: null,
      questId: null,
      cite: 'dustwallow_marsh.cpp:450 quest != 1273 → no Start',
    };
  }
  return {
    handled: true,
    startEscort: true,
    run: false,
    instantRespawn: true,
    factionId: FACTION_ESCORT_N_FRIEND_PASSIVE,
    factionFlags: OGRON_TEMP_FACTION_FLAGS,
    textId: SAY_OGR_START,
    questId: QUEST_QUESTIONING,
    cite: 'dustwallow_marsh.cpp:454-456 Start(false,…) + temp faction + SAY_OGR_START',
  };
}

export interface OgronWaypointResult {
  handled: boolean;
  textId: number | null;
  /** Speaker entry override (Reethe for some lines). */
  speakerEntry: number | null;
  pauseEscort: boolean;
  cite: string;
}

/** Port of WaypointReached. Cite: dustwallow_marsh.cpp:265–280 */
export function ogronWaypointReached(pointId: number): OgronWaypointResult {
  if (pointId === 10) {
    return {
      handled: true,
      textId: SAY_OGR_SPOT,
      speakerEntry: NPC_OGRON,
      pauseEscort: false,
      cite: 'dustwallow_marsh.cpp:269-270 case 10 SAY_OGR_SPOT',
    };
  }
  if (pointId === 11) {
    return {
      handled: true,
      textId: SAY_OGR_RET_WHAT,
      speakerEntry: NPC_REETHE,
      pauseEscort: false,
      cite: 'dustwallow_marsh.cpp:272-274 case 11 SAY_OGR_RET_WHAT on Reethe',
    };
  }
  if (pointId === 12) {
    return {
      handled: true,
      textId: null,
      speakerEntry: null,
      pauseEscort: true,
      cite: 'dustwallow_marsh.cpp:276-277 case 12 SetEscortPaused(true)',
    };
  }
  return {
    handled: false,
    textId: null,
    speakerEntry: null,
    pauseEscort: false,
    cite: 'dustwallow_marsh.cpp:265-280 no case',
  };
}

export interface OgronPhaseStepResult {
  handled: boolean;
  /** Text lines this step (speaker entry + textId). */
  lines: Array<{ speakerEntry: number; textId: number }>;
  /** Summon guest set (Caldwell + Hallan + 2× Skirmisher). */
  summonGuests: boolean;
  /** Hallan Fake Shot on Reethe. */
  castFakeShot: boolean;
  fakeShotSpellId: number;
  /** Start Theramore attack on Ogron. */
  startAttackMe: boolean;
  /** Explore credit after fight. */
  questCredit: boolean;
  questId: number | null;
  setRun: boolean;
  unpause: boolean;
  /** Next phase after this step (when changed). */
  nextPhase: number | null;
  /** Advance phase counter when not in FIGHT. */
  advanceCounter: boolean;
  nextTimerMs: number;
  cite: string;
}

// Port of the UpdateEscortAI paused phase-counter steps.
// Cite: dustwallow_marsh.cpp:323–436.
export function ogronPhaseStep(
  phase: number,
  phaseCounter: number,
): OgronPhaseStepResult {
  const base = {
    handled: true,
    lines: [] as Array<{ speakerEntry: number; textId: number }>,
    summonGuests: false,
    castFakeShot: false,
    fakeShotSpellId: SPELL_FAKE_SHOT,
    startAttackMe: false,
    questCredit: false,
    questId: null as number | null,
    setRun: false,
    unpause: false,
    nextPhase: null as number | null,
    advanceCounter: true,
    nextTimerMs: OGRON_GLOBAL_TIMER_MS,
  };

  if (phase === PHASE_FIGHT) {
    return {
      ...base,
      handled: false,
      advanceCounter: false,
      nextTimerMs: 0,
      cite: 'dustwallow_marsh.cpp:434 m_uiPhase == PHASE_FIGHT → no counter++',
    };
  }

  if (phase === PHASE_INTRO) {
    switch (phaseCounter) {
      case 0:
        return {
          ...base,
          lines: [{ speakerEntry: NPC_REETHE, textId: SAY_OGR_RET_SWEAR }],
          cite: 'dustwallow_marsh.cpp:335-337 case 0 SAY_OGR_RET_SWEAR',
        };
      case 1:
        return {
          ...base,
          lines: [{ speakerEntry: NPC_OGRON, textId: SAY_OGR_REPLY_RET }],
          cite: 'dustwallow_marsh.cpp:339-340 case 1 SAY_OGR_REPLY_RET',
        };
      case 2:
        return {
          ...base,
          lines: [{ speakerEntry: NPC_REETHE, textId: SAY_OGR_RET_TAKEN }],
          cite: 'dustwallow_marsh.cpp:342-344 case 2 SAY_OGR_RET_TAKEN',
        };
      case 3:
        return {
          ...base,
          lines: [
            { speakerEntry: NPC_OGRON, textId: SAY_OGR_TELL_FIRE },
            { speakerEntry: NPC_REETHE, textId: SAY_OGR_RET_NOCLOSER },
          ],
          cite: 'dustwallow_marsh.cpp:346-349 case 3 TELL_FIRE + RET_NOCLOSER',
        };
      case 4:
        return {
          ...base,
          lines: [{ speakerEntry: NPC_REETHE, textId: SAY_OGR_RET_NOFIRE }],
          cite: 'dustwallow_marsh.cpp:351-353 case 4 SAY_OGR_RET_NOFIRE',
        };
      case 5:
        return {
          ...base,
          lines: [{ speakerEntry: NPC_REETHE, textId: SAY_OGR_RET_HEAR }],
          summonGuests: true,
          nextPhase: PHASE_GUESTS,
          cite: 'dustwallow_marsh.cpp:355-364 case 5 RET_HEAR + summon guests + PHASE_GUESTS',
        };
      default:
        return {
          ...base,
          handled: false,
          advanceCounter: false,
          nextTimerMs: 0,
          cite: 'dustwallow_marsh.cpp:331-367 PHASE_INTRO counter out of range',
        };
    }
  }

  if (phase === PHASE_GUESTS) {
    switch (phaseCounter) {
      case 6:
        return {
          ...base,
          lines: [{ speakerEntry: NPC_CALDWELL, textId: SAY_OGR_CAL_FOUND }],
          cite: 'dustwallow_marsh.cpp:373-375 case 6 SAY_OGR_CAL_FOUND',
        };
      case 7:
        return {
          ...base,
          lines: [{ speakerEntry: NPC_CALDWELL, textId: SAY_OGR_CAL_MERCY }],
          cite: 'dustwallow_marsh.cpp:377-379 case 7 SAY_OGR_CAL_MERCY',
        };
      case 8:
        return {
          ...base,
          lines: [{ speakerEntry: NPC_HALLAN, textId: SAY_OGR_HALL_GLAD }],
          castFakeShot: true,
          cite: 'dustwallow_marsh.cpp:381-388 case 8 HALL_GLAD + Fake Shot 7105',
        };
      case 9:
        return {
          ...base,
          lines: [
            { speakerEntry: NPC_REETHE, textId: EMOTE_OGR_RET_ARROW },
            { speakerEntry: NPC_REETHE, textId: SAY_OGR_RET_ARROW },
          ],
          cite: 'dustwallow_marsh.cpp:390-395 case 9 EMOTE + SAY_RET_ARROW',
        };
      case 10:
        return {
          ...base,
          lines: [
            { speakerEntry: NPC_CALDWELL, textId: SAY_OGR_CAL_CLEANUP },
            { speakerEntry: NPC_OGRON, textId: SAY_OGR_NODIE },
          ],
          cite: 'dustwallow_marsh.cpp:397-401 case 10 CAL_CLEANUP + NODIE',
        };
      case 11:
        return {
          ...base,
          startAttackMe: true,
          nextPhase: PHASE_FIGHT,
          advanceCounter: false,
          cite: 'dustwallow_marsh.cpp:403-405 case 11 DoStartAttackMe + PHASE_FIGHT',
        };
      default:
        return {
          ...base,
          handled: false,
          advanceCounter: false,
          nextTimerMs: 0,
          cite: 'dustwallow_marsh.cpp:369-407 PHASE_GUESTS counter out of range',
        };
    }
  }

  if (phase === PHASE_COMPLETE) {
    switch (phaseCounter) {
      case 12:
        return {
          ...base,
          questCredit: true,
          questId: QUEST_QUESTIONING,
          lines: [{ speakerEntry: NPC_OGRON, textId: SAY_OGR_SURVIVE }],
          cite: 'dustwallow_marsh.cpp:414-418 case 12 explore 1273 + SAY_OGR_SURVIVE',
        };
      case 13:
        return {
          ...base,
          lines: [{ speakerEntry: NPC_REETHE, textId: SAY_OGR_RET_LUCKY }],
          cite: 'dustwallow_marsh.cpp:420-422 case 13 SAY_OGR_RET_LUCKY',
        };
      case 14:
        return {
          ...base,
          lines: [{ speakerEntry: NPC_OGRON, textId: SAY_OGR_THANKS }],
          setRun: true,
          unpause: true,
          cite: 'dustwallow_marsh.cpp:424-427 case 14 THANKS + SetRun + unpause',
        };
      default:
        return {
          ...base,
          handled: false,
          advanceCounter: false,
          nextTimerMs: 0,
          cite: 'dustwallow_marsh.cpp:410-430 PHASE_COMPLETE counter out of range',
        };
    }
  }

  return {
    ...base,
    handled: false,
    advanceCounter: false,
    nextTimerMs: 0,
    cite: 'dustwallow_marsh.cpp:329 unknown phase',
  };
}

// After fight ends while still paused: Reset flips PHASE_FIGHT → PHASE_COMPLETE. Cite:
// dustwallow_marsh.cpp:232–233
export function ogronResetPhaseAfterFight(
  escortPaused: boolean,
  phase: number,
): number {
  if (escortPaused && phase === PHASE_FIGHT) return PHASE_COMPLETE;
  return phase;
}

// Pure helpers — npc_private_hendel

export interface HendelQuestAcceptResult {
  handled: boolean;
  factionId: number;
  factionFlags: number;
  attackStart: boolean;
  aggroSentries: boolean;
  sentryEntry: number;
  sentrySearchYd: number;
  questId: number | null;
  cite: string;
}

/** Port of QuestAccept_npc_private_hendel. Cite: dustwallow_marsh.cpp:601–624 */
export function hendelQuestAccept(questId: number): HendelQuestAcceptResult {
  if (questId !== QUEST_MISSING_DIPLO_PT16) {
    return {
      handled: false,
      factionId: 0,
      factionFlags: 0,
      attackStart: false,
      aggroSentries: false,
      sentryEntry: 0,
      sentrySearchYd: 0,
      questId: null,
      cite: 'dustwallow_marsh.cpp:603 quest != 1324 → no-op',
    };
  }
  return {
    handled: true,
    factionId: FACTION_HOSTILE_HENDEL,
    factionFlags: HENDEL_TEMP_FACTION_FLAGS,
    attackStart: true,
    aggroSentries: true,
    sentryEntry: NPC_SENTRY,
    sentrySearchYd: HENDEL_SENTRY_SEARCH_YD,
    questId: QUEST_MISSING_DIPLO_PT16,
    cite: 'dustwallow_marsh.cpp:605-619 faction 168 + AttackStart + sentries',
  };
}

export interface HendelDamageTakenResult {
  clampDamage: boolean;
  damageOut: number;
  storePlayerGuid: boolean;
  textId: number | null;
  enterEvade: boolean;
  fleeSentries: boolean;
  sentryDespawnMs: number;
  summonOutro: boolean;
  outroDespawnMs: number;
  teleportVisualSpellId: number;
  cite: string;
}

// Port of DamageTaken yield. Cite: dustwallow_marsh.cpp:546–598 Yields when damage > health OR HP% < 20.
// Clamps damage to 0 (cpp sets damage = 0 — leaves current health; product models leave ≥1 HP clamp).
export function hendelDamageTaken(
  health: number,
  maxHealth: number,
  damage: number,
  questIncomplete: boolean,
): HendelDamageTakenResult {
  if (maxHealth <= 0 || health <= 0) {
    return {
      clampDamage: false,
      damageOut: damage,
      storePlayerGuid: false,
      textId: null,
      enterEvade: false,
      fleeSentries: false,
      sentryDespawnMs: 0,
      summonOutro: false,
      outroDespawnMs: 0,
      teleportVisualSpellId: 0,
      cite: 'dustwallow_marsh.cpp:546-598 invalid health',
    };
  }
  const hpPct = (health * 100) / maxHealth;
  const yieldNow = damage > health || hpPct < HENDEL_YIELD_HP_PCT;
  if (!yieldNow) {
    return {
      clampDamage: false,
      damageOut: damage,
      storePlayerGuid: false,
      textId: null,
      enterEvade: false,
      fleeSentries: false,
      sentryDespawnMs: 0,
      summonOutro: false,
      outroDespawnMs: 0,
      teleportVisualSpellId: 0,
      cite: 'dustwallow_marsh.cpp:548 HP still >= 20% and not lethal → no-op',
    };
  }
  return {
    clampDamage: true,
    // cpp: damage = 0 (no further loss this hit)
    damageOut: 0,
    storePlayerGuid: questIncomplete,
    textId: EMOTE_SURRENDER,
    enterEvade: true,
    fleeSentries: true,
    sentryDespawnMs: HENDEL_SENTRY_DESPAWN_MS,
    summonOutro: true,
    outroDespawnMs: HENDEL_OUTRO_DESPAWN_MS,
    teleportVisualSpellId: SPELL_TELEPORT_VISUAL,
    cite: 'dustwallow_marsh.cpp:548-596 clamp + surrender + evade + sentry flee + outro summons + 12980',
  };
}

export interface HendelSpellHitResult {
  questCredit: boolean;
  questId: number | null;
  cite: string;
}

// Port of SpellHit SPELL_TELEPORT → explore credit. GAP: spell 7079 is absent from spell-data, so
// the product's FO6 finishEscort stands in. Cite: dustwallow_marsh.cpp:535–544.
export function hendelSpellHit(spellId: number): HendelSpellHitResult {
  if (spellId !== SPELL_TELEPORT) {
    return {
      questCredit: false,
      questId: null,
      cite: 'dustwallow_marsh.cpp:539 spell != 7079 → no-op',
    };
  }
  return {
    questCredit: true,
    questId: QUEST_MISSING_DIPLO_PT16,
    cite: 'dustwallow_marsh.cpp:539-542 SPELL_TELEPORT → explore 1324 (GAP: 7079 not in spell-data)',
  };
}

// Pure helpers — npc_stinky_ignatz

export interface StinkyQuestAcceptResult {
  handled: boolean;
  sendStartEscort: boolean;
  questId: number | null;
  cite: string;
}

/** Port of QuestAccept_npc_stinky_ignatz. Cite: dustwallow_marsh.cpp:753–759 */
export function stinkyQuestAccept(questId: number): StinkyQuestAcceptResult {
  if (
    questId !== QUEST_ID_STINKYS_ESCAPE_ALLIANCE &&
    questId !== QUEST_ID_STINKYS_ESCAPE_HORDE
  ) {
    return {
      handled: false,
      sendStartEscort: false,
      questId: null,
      cite: 'dustwallow_marsh.cpp:755 quest not 1222/1270 → no-op',
    };
  }
  return {
    handled: true,
    sendStartEscort: true,
    questId,
    cite: 'dustwallow_marsh.cpp:756 SendAIEvent START_ESCORT + quest id',
  };
}

export interface StinkyStartEscortResult {
  handled: boolean;
  textId: number | null;
  startEscort: boolean;
  factionId: number;
  standState: number;
  cite: string;
}

/** Port of ReceiveAIEvent AI_EVENT_START_ESCORT. Cite: dustwallow_marsh.cpp:681–689 */
export function stinkyStartEscort(
  eventIsStartEscort: boolean,
  invokerIsPlayer: boolean,
): StinkyStartEscortResult {
  if (!eventIsStartEscort || !invokerIsPlayer) {
    return {
      handled: false,
      textId: null,
      startEscort: false,
      factionId: 0,
      standState: UNIT_STAND_STATE_STAND,
      cite: 'dustwallow_marsh.cpp:683 !START_ESCORT or !player → no-op',
    };
  }
  return {
    handled: true,
    textId: SAY_STINKY_BEGIN,
    startEscort: true,
    factionId: FACTION_ESCORT_N_NEUTRAL_PASSIVE,
    standState: UNIT_STAND_STATE_STAND,
    cite: 'dustwallow_marsh.cpp:685-688 SAY_BEGIN + Start + faction 250 + STAND',
  };
}

export interface StinkyWaypointResult {
  handled: boolean;
  textId: number | null;
  faceBogbean: boolean;
  bogbeanEntry: number | null;
  useStandingEmote: boolean;
  questCredit: boolean;
  /** Team-pick: Alliance 1222 / Horde 1270. */
  questIdAlliance: number | null;
  questIdHorde: number | null;
  cite: string;
}

/** Port of WaypointReached. Cite: dustwallow_marsh.cpp:692–734 */
export function stinkyWaypointReached(pointId: number): StinkyWaypointResult {
  const empty = {
    handled: true,
    textId: null as number | null,
    faceBogbean: false,
    bogbeanEntry: null as number | null,
    useStandingEmote: false,
    questCredit: false,
    questIdAlliance: null as number | null,
    questIdHorde: null as number | null,
  };
  switch (pointId) {
    case 6:
      return {
        ...empty,
        textId: SAY_STINKY_FIRST_STOP,
        cite: 'dustwallow_marsh.cpp:696-697 case 6 SAY_STINKY_FIRST_STOP',
      };
    case 11:
      return {
        ...empty,
        textId: SAY_STINKY_SECOND_STOP,
        cite: 'dustwallow_marsh.cpp:699-700 case 11 SAY_STINKY_SECOND_STOP',
      };
    case 25:
      return {
        ...empty,
        textId: SAY_STINKY_THIRD_STOP_1,
        cite: 'dustwallow_marsh.cpp:702-703 case 25 SAY_STINKY_THIRD_STOP_1',
      };
    case 26:
      return {
        ...empty,
        textId: SAY_STINKY_THIRD_STOP_2,
        faceBogbean: true,
        bogbeanEntry: GO_BOGBEAN_PLANT,
        cite: 'dustwallow_marsh.cpp:705-711 case 26 THIRD_STOP_2 + face GO 20939',
      };
    case 27:
      return {
        ...empty,
        textId: SAY_STINKY_THIRD_STOP_3,
        cite: 'dustwallow_marsh.cpp:713-715 case 27 SAY_STINKY_THIRD_STOP_3 to player',
      };
    case 30:
      return {
        ...empty,
        useStandingEmote: true,
        cite: 'dustwallow_marsh.cpp:717-718 case 30 EMOTE_STATE_USESTANDING',
      };
    case 31:
      return {
        ...empty,
        textId: SAY_STINKY_PLANT_GATHERED,
        cite: 'dustwallow_marsh.cpp:720-721 case 31 SAY_STINKY_PLANT_GATHERED',
      };
    case 40:
      return {
        ...empty,
        textId: SAY_STINKY_END,
        questCredit: true,
        questIdAlliance: QUEST_ID_STINKYS_ESCAPE_ALLIANCE,
        questIdHorde: QUEST_ID_STINKYS_ESCAPE_HORDE,
        cite: 'dustwallow_marsh.cpp:723-728 case 40 team explore 1222/1270 + SAY_END',
      };
    case 41:
      return {
        ...empty,
        textId: SAY_STINKY_END_EMOTE,
        cite: 'dustwallow_marsh.cpp:730-731 case 41 SAY_STINKY_END_EMOTE',
      };
    default:
      return {
        ...empty,
        handled: false,
        cite: 'dustwallow_marsh.cpp:692-734 no case',
      };
  }
}

// Team-pick explore quest id at WP40. Cite: dustwallow_marsh.cpp:726 GetTeam() == ALLIANCE ? 1222 : 1270
export function stinkyCreditQuestId(isAlliance: boolean): number {
  return isAlliance
    ? QUEST_ID_STINKYS_ESCAPE_ALLIANCE
    : QUEST_ID_STINKYS_ESCAPE_HORDE;
}

/** Port of Aggro random text (urand 0..3). Cite: dustwallow_marsh.cpp:670–678 */
export function stinkyAggroText(roll0to3: number): number {
  const i = Math.max(0, Math.min(3, roll0to3 | 0));
  return STINKY_AGGRO_TEXTS[i]!;
}

// Pure helpers — at_sentry_point

export interface SentryPointAtResult {
  handled: boolean;
  summonTervosh: boolean;
  tervoshEntry: number;
  despawnMs: number;
  castVisualSpellId: number;
  guardSalute: boolean;
  guardEntry: number;
  guardSearchYd: number;
  cite: string;
}

/** Port of AreaTrigger_at_sentry_point. Cite: dustwallow_marsh.cpp:772–793 */
export function sentryPointAreaTrigger(opts: {
  playerDead: boolean;
  questStatus: 'none' | 'incomplete' | 'complete' | 'rewarded';
  tervoshPresent: boolean;
}): SentryPointAtResult {
  if (
    opts.playerDead ||
    opts.questStatus === 'none' ||
    opts.questStatus === 'complete' ||
    opts.questStatus === 'rewarded'
  ) {
    return {
      handled: false,
      summonTervosh: false,
      tervoshEntry: 0,
      despawnMs: 0,
      castVisualSpellId: 0,
      guardSalute: false,
      guardEntry: 0,
      guardSearchYd: 0,
      cite: 'dustwallow_marsh.cpp:775-776 dead or quest none/complete → false',
    };
  }
  if (opts.tervoshPresent) {
    return {
      handled: true,
      summonTervosh: false,
      tervoshEntry: NPC_TERVOSH,
      despawnMs: 0,
      castVisualSpellId: 0,
      guardSalute: false,
      guardEntry: NPC_SENTRY_POINT_GUARD,
      guardSearchYd: SENTRY_POINT_GUARD_SEARCH_YD,
      cite: 'dustwallow_marsh.cpp:778 Tervosh already present ≤100y → no re-summon',
    };
  }
  return {
    handled: true,
    summonTervosh: true,
    tervoshEntry: NPC_TERVOSH,
    despawnMs: SENTRY_POINT_TERVOSH_DESPAWN_MS,
    castVisualSpellId: SPELL_TELEPORT_VISUAL_2,
    guardSalute: true,
    guardEntry: NPC_SENTRY_POINT_GUARD,
    guardSearchYd: SENTRY_POINT_GUARD_SEARCH_YD,
    cite: 'dustwallow_marsh.cpp:780-788 summon Tervosh + cast 799 + guard salute',
  };
}

// Pure helpers — npc_theramore_spar_controller

export interface SparHpCheckResult {
  roundEnded: boolean;
  winningTeam: number | null;
  castFirstAid: boolean;
  firstAidSpellId: number;
  nextCheckMs: number;
  cite: string;
}

// Port of CheckCombatantHP. Cite: dustwallow_marsh.cpp:933–963 When either active combatant ≤30%: arm win
// for lower HP, restore factions, CombatStop both, medics First Aid 7162, disable HP check.
export function sparCheckCombatantHp(
  redHpPct: number,
  blueHpPct: number,
): SparHpCheckResult {
  if (redHpPct <= SPAR_YIELD_HP_PCT || blueHpPct <= SPAR_YIELD_HP_PCT) {
    const blueWins = redHpPct < blueHpPct;
    return {
      roundEnded: true,
      winningTeam: blueWins ? BLUE_TEAM : RED_TEAM,
      castFirstAid: true,
      firstAidSpellId: SPELL_FIRST_AID,
      nextCheckMs: 0,
      cite: 'dustwallow_marsh.cpp:942-958 <=30% → win arm + First Aid 7162 + disable check',
    };
  }
  return {
    roundEnded: false,
    winningTeam: null,
    castFirstAid: false,
    firstAidSpellId: 0,
    nextCheckMs: SPAR_CHECK_HP_MS,
    cite: 'dustwallow_marsh.cpp:962 ResetTimer CHECK_HP 1000',
  };
}

export interface SparWinBroadcastResult {
  szigetiTextId: number;
  overallTextId: number | null;
  motivationMs: number;
  separateMs: number;
  cite: string;
}

// Port of HandleBlueWin / HandleRedWin and the HandleWin broadcast set.
// Cite: dustwallow_marsh.cpp:965–1081.
export function sparHandleWin(
  winningTeam: number,
  losingTeamEmpty: boolean,
): SparWinBroadcastResult {
  const isBlue = winningTeam === BLUE_TEAM;
  return {
    szigetiTextId: isBlue ? SAY_BLUE_WINNER : SAY_RED_WINNER,
    overallTextId: losingTeamEmpty
      ? isBlue
        ? SAY_BLUE_WINNER_OVERALL
        : SAY_RED_WINNER_OVERALL
      : null,
    motivationMs: losingTeamEmpty ? SPAR_MOTIVATION_MS : 0,
    separateMs: 100,
    cite: isBlue
      ? 'dustwallow_marsh.cpp:965-1000 HandleBlueWin + HandleWin'
      : 'dustwallow_marsh.cpp:1003-1039 HandleRedWin + HandleWin',
  };
}

// ---------------------------------------------------------------------------
