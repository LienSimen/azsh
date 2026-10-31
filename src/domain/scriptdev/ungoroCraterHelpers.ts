// Un'Goro Crater ScriptDev pure helpers (SESSION 10 batch). Companion to ungoroCrater.ts IR exports. Cite:
// kalimdor/ungoro_crater.cpp

import {
  FACTION_ESCORT_A_PASSIVE,
  FACTION_ESCORT_H_PASSIVE,
  FACTION_ESCORT_N_FRIEND_PASSIVE,
  UNIT_STAND_STATE_STAND,
  UNIT_STAND_STATE_SLEEP,
  UNIT_STAND_STATE_DEAD,
  INTERACTION_DISTANCE,
  EMOTE_ONESHOT_LAUGH,
  SAY_AME_START,
  SAY_AME_PROGRESS,
  SAY_AME_END,
  QUEST_CHASING_AME,
  AME_AGGRO_TEXTS,
  AME_TEMP_FACTION_FLAGS,
  RINGO_FAINT_TEXTS,
  RINGO_WAKE_TEXTS,
  SAY_RIN_END_1,
  SAY_SPR_END_2,
  SAY_RIN_END_3,
  EMOTE_RIN_END_4,
  EMOTE_RIN_END_5,
  SAY_RIN_END_6,
  SAY_SPR_END_7,
  EMOTE_RIN_END_8,
  SPELL_REVIVE_RINGO,
  QUEST_A_LITTLE_HELP,
  NPC_SPRAGGLE,
  NPC_RINGO,
  RINGO_FAINT_INIT_MIN_MS,
  RINGO_FAINT_INIT_MAX_MS,
  RINGO_FAINT_REPEAT_MIN_MS,
  RINGO_FAINT_REPEAT_MAX_MS,
  RINGO_END_EVENT_INIT_MS,
  RINGO_END_EVENT_STEP_DELAYS_MS,
  EMOTE_SILENCE,
  NPC_SIMONE_THE_SEDUCTRESS,
  NPC_PRECIOUS,
  NPC_PRECIOUS_THE_DEVOURER,
  NPC_THE_CLEANER,
  SPELL_VIPER_STING_R3,
  CLASS_HUNTER,
  PRECIOUS_SPLIT_CHECK_REPEAT_MS,
  SIMONE_KISS_INIT_MIN_MS,
  SIMONE_KISS_INIT_MAX_MS,
  SIMONE_LIGHTNING_INIT_MIN_MS,
  SIMONE_LIGHTNING_INIT_MAX_MS,
  SIMONE_THREAT_CHECK_INIT_MS,
  SIMONE_THREAT_CHECK_REPEAT_MS,
  SIMONE_SPLIT_CHECK_INIT_MS,
  SIMONE_RESPAWN_ON_DEATH_MS,
  SIMONE_RESPAWN_ON_DESPAWN_MS,
  CLEANER_DESPAWN_MS,
  SIMONE_TRANSFORM_MS,
  SIMONE_TRANSFORM_EMOTE_MS,
} from './ungoroCrater.ts';

// ---------------------------------------------------------------------------

export interface AmeQuestAcceptResult {
  handled: boolean;
  standState: number;
  factionId: number;
  factionFlags: number;
  questId: number;
  cite: string;
}

// Port of QuestAccept_npc_ame01.
// Cite: ungoro_crater.cpp:99–116.
export function ameQuestAccept(
  questId: number,
  teamAlliance: boolean,
): AmeQuestAcceptResult {
  if ((questId | 0) !== QUEST_CHASING_AME) {
    return {
      handled: false,
      standState: UNIT_STAND_STATE_DEAD,
      factionId: 0,
      factionFlags: 0,
      questId: 0,
      cite: 'ungoro_crater.cpp:101 quest != 4245 → no-op',
    };
  }
  return {
    handled: true,
    standState: UNIT_STAND_STATE_STAND,
    factionId: teamAlliance ? FACTION_ESCORT_A_PASSIVE : FACTION_ESCORT_H_PASSIVE,
    factionFlags: AME_TEMP_FACTION_FLAGS,
    questId: QUEST_CHASING_AME,
    cite: teamAlliance
      ? 'ungoro_crater.cpp:105-108 STAND + FACTION_ESCORT_A_PASSIVE 774 + Start'
      : 'ungoro_crater.cpp:105,109-110 STAND + FACTION_ESCORT_H_PASSIVE 775 + Start',
  };
}

export interface AmeWaypointResult {
  handled: boolean;
  textId: number | null;
  exploreQuestId: number | null;
  cite: string;
}

/** Port of WaypointReached for A-Me 01. Cite: ungoro_crater.cpp:61–77 */
export function ameWaypointReached(pointId: number): AmeWaypointResult {
  switch (pointId | 0) {
    case 1:
      return {
        handled: true,
        textId: SAY_AME_START,
        exploreQuestId: null,
        cite: 'ungoro_crater.cpp:65-67 WP1 SAY_AME_START',
      };
    case 20:
      return {
        handled: true,
        textId: SAY_AME_PROGRESS,
        exploreQuestId: null,
        cite: 'ungoro_crater.cpp:68-70 WP20 SAY_AME_PROGRESS',
      };
    case 38:
      return {
        handled: true,
        textId: SAY_AME_END,
        exploreQuestId: QUEST_CHASING_AME,
        cite:
          'ungoro_crater.cpp:71-75 WP38 SAY_AME_END + RewardPlayerAndGroupAtEventExplored(4245)',
      };
    default:
      return {
        handled: false,
        textId: null,
        exploreQuestId: null,
        cite: 'ungoro_crater.cpp:63 unknown WP → no-op',
      };
  }
}

export interface AmeAggroResult {
  textId: number | null;
  cite: string;
}

// Port of Aggro for A-Me 01: a player, or a mob the escort player is already fighting, is skipped.
// Cite: ungoro_crater.cpp:79–96.
export function ameAggro(
  whoIsPlayer: boolean,
  escortPlayerFightingWho: boolean,
  textIdx: number,
): AmeAggroResult {
  if (whoIsPlayer) {
    return {
      textId: null,
      cite: 'ungoro_crater.cpp:81-82 who is player → return (no yell)',
    };
  }
  if (escortPlayerFightingWho) {
    return {
      textId: null,
      cite: 'ungoro_crater.cpp:86-87 player already fighting who → return',
    };
  }
  const idx = ((textIdx | 0) % 3 + 3) % 3;
  return {
    textId: AME_AGGRO_TEXTS[idx]!,
    cite: 'ungoro_crater.cpp:89-93 urand(0,2) SAY_AME_AGGRO1/2/3',
  };
}

// Pure helpers — npc_ringo

export interface RingoQuestAcceptResult {
  handled: boolean;
  standState: number;
  factionId: number;
  questId: number;
  cite: string;
}

/** Port of QuestAccept_npc_ringo. Cite: ungoro_crater.cpp:327–338 */
export function ringoQuestAccept(questId: number): RingoQuestAcceptResult {
  if ((questId | 0) !== QUEST_A_LITTLE_HELP) {
    return {
      handled: false,
      standState: UNIT_STAND_STATE_DEAD,
      factionId: 0,
      questId: 0,
      cite: 'ungoro_crater.cpp:329 quest != 4491 → no-op',
    };
  }
  return {
    handled: true,
    standState: UNIT_STAND_STATE_STAND,
    factionId: FACTION_ESCORT_N_FRIEND_PASSIVE,
    questId: QUEST_A_LITTLE_HELP,
    cite:
      'ungoro_crater.cpp:333-334 STAND + StartFollow FACTION_ESCORT_N_FRIEND_PASSIVE 290',
  };
}

export interface RingoResetResult {
  faintTimerMinMs: number;
  faintTimerMaxMs: number;
  endEventProgress: number;
  endEventTimerMs: number;
  cite: string;
}

/** Port of Reset for Ringo. Cite: ungoro_crater.cpp:170–176 */
export function ringoReset(): RingoResetResult {
  return {
    faintTimerMinMs: RINGO_FAINT_INIT_MIN_MS,
    faintTimerMaxMs: RINGO_FAINT_INIT_MAX_MS,
    endEventProgress: 0,
    endEventTimerMs: RINGO_END_EVENT_INIT_MS,
    cite:
      'ungoro_crater.cpp:172-175 faint urand(30-60)s; progress=0; endTimer=1000; spraggle=null',
  };
}

export interface RingoFaintTickResult {
  setFaint: boolean;
  remainingMs: number;
  rearmMinMs: number;
  rearmMaxMs: number;
  cite: string;
}

// Port of the OOC faint timer branch, while following and not paused.
// Cite: ungoro_crater.cpp:301–312.
export function ringoFaintTick(
  followInProgress: boolean,
  followPaused: boolean,
  followPostevent: boolean,
  hasVictim: boolean,
  faintMs: number,
  diffMs: number,
): RingoFaintTickResult {
  if (hasVictim) {
    return {
      setFaint: false,
      remainingMs: faintMs,
      rearmMinMs: RINGO_FAINT_REPEAT_MIN_MS,
      rearmMaxMs: RINGO_FAINT_REPEAT_MAX_MS,
      cite: 'ungoro_crater.cpp:243-318 has victim → melee path, no faint',
    };
  }
  if (followPostevent || !followInProgress || followPaused) {
    return {
      setFaint: false,
      remainingMs: faintMs,
      rearmMinMs: RINGO_FAINT_REPEAT_MIN_MS,
      rearmMaxMs: RINGO_FAINT_REPEAT_MAX_MS,
      cite: 'ungoro_crater.cpp:301-312 postevent/!inprogress/paused → no faint',
    };
  }
  // cpp: if (m_uiFaintTimer < uiDiff) SetFaint; else subtract
  if (faintMs < diffMs) {
    return {
      setFaint: true,
      remainingMs: 0,
      rearmMinMs: RINGO_FAINT_REPEAT_MIN_MS,
      rearmMaxMs: RINGO_FAINT_REPEAT_MAX_MS,
      cite:
        'ungoro_crater.cpp:305-308 SetFaint + m_uiFaintTimer=urand(60000,120000)',
    };
  }
  return {
    setFaint: false,
    remainingMs: faintMs - diffMs,
    rearmMinMs: RINGO_FAINT_REPEAT_MIN_MS,
    rearmMaxMs: RINGO_FAINT_REPEAT_MAX_MS,
    cite: 'ungoro_crater.cpp:311 m_uiFaintTimer -= uiDiff',
  };
}

export interface RingoSetFaintResult {
  pauseFollow: boolean;
  textId: number | null;
  standState: number;
  cite: string;
}

// Port of SetFaint.
// Cite: ungoro_crater.cpp:204–221.
export function ringoSetFaint(
  followPostevent: boolean,
  textIdx: number,
): RingoSetFaintResult {
  if (followPostevent) {
    return {
      pauseFollow: false,
      textId: null,
      standState: UNIT_STAND_STATE_SLEEP,
      cite:
        'ungoro_crater.cpp:206-220 postevent → skip pause/SAY; still SetStandState(SLEEP)',
    };
  }
  const idx = ((textIdx | 0) % 4 + 4) % 4;
  return {
    pauseFollow: true,
    textId: RINGO_FAINT_TEXTS[idx]!,
    standState: UNIT_STAND_STATE_SLEEP,
    cite: 'ungoro_crater.cpp:208-220 SetFollowPaused + SAY_FAINT + SLEEP',
  };
}

export interface RingoClearFaintResult {
  standState: number;
  textId: number | null;
  unpauseFollow: boolean;
  cite: string;
}

// Port of ClearFaint.
// Cite: ungoro_crater.cpp:223–239.
export function ringoClearFaint(
  followPostevent: boolean,
  textIdx: number,
): RingoClearFaintResult {
  if (followPostevent) {
    return {
      standState: UNIT_STAND_STATE_STAND,
      textId: null,
      unpauseFollow: false,
      cite: 'ungoro_crater.cpp:225-228 postevent → STAND only; return before wake SAY',
    };
  }
  const idx = ((textIdx | 0) % 4 + 4) % 4;
  return {
    standState: UNIT_STAND_STATE_STAND,
    textId: RINGO_WAKE_TEXTS[idx]!,
    unpauseFollow: true,
    cite: 'ungoro_crater.cpp:225-239 STAND + SAY_WAKE + SetFollowPaused(false)',
  };
}

export interface RingoSpellHitResult {
  clearFaint: boolean;
  cite: string;
}

// Port of the SpellHit Revive Ringo gate.
// Cite: ungoro_crater.cpp:198–202.
export function ringoSpellHit(
  followInProgress: boolean,
  followPaused: boolean,
  spellId: number,
): RingoSpellHitResult {
  // cpp: HasFollowState(STATE_FOLLOW_INPROGRESS | STATE_FOLLOW_PAUSED)
  // = bit flags OR — either in-progress or paused satisfies.
  const followActive = followInProgress || followPaused;
  if (followActive && (spellId | 0) === SPELL_REVIVE_RINGO) {
    return {
      clearFaint: true,
      cite:
        'ungoro_crater.cpp:200 FOLLOW_INPROGRESS|PAUSED + SPELL_REVIVE_RINGO 15591 → ClearFaint',
    };
  }
  return {
    clearFaint: false,
    cite: 'ungoro_crater.cpp:200 gates fail → no ClearFaint',
  };
}

export interface RingoSpraggleLosResult {
  exploreQuestId: number | null;
  setFollowCompletePostevent: boolean;
  bindSpraggle: boolean;
  cite: string;
}

/** Port of MoveInLineOfSight Spraggle credit. Cite: ungoro_crater.cpp:178–195 */
export function ringoSpraggleMoveInLos(
  hasVictim: boolean,
  followComplete: boolean,
  whoEntry: number,
  distYd: number,
  questIncomplete4491: boolean,
): RingoSpraggleLosResult {
  if (
    !hasVictim
    && !followComplete
    && (whoEntry | 0) === NPC_SPRAGGLE
    && distYd <= INTERACTION_DISTANCE
  ) {
    return {
      exploreQuestId: questIncomplete4491 ? QUEST_A_LITTLE_HELP : null,
      setFollowCompletePostevent: true,
      bindSpraggle: true,
      cite: questIncomplete4491
        ? 'ungoro_crater.cpp:184-193 Spraggle ≤5yd incomplete 4491 → explore + SetFollowComplete(true) + bind'
        : 'ungoro_crater.cpp:184-193 Spraggle ≤5yd complete quest → SetFollowComplete(true) only + bind',
    };
  }
  return {
    exploreQuestId: null,
    setFollowCompletePostevent: false,
    bindSpraggle: false,
    cite: 'ungoro_crater.cpp:182 gates fail → no Spraggle credit',
  };
}

export interface RingoEndEventStepResult {
  handled: boolean;
  textId: number | null;
  /** Speaker entry: Ringo=9999, Spraggle=9997, or 0 for emote on self. */
  speakerEntry: number;
  setFaint: boolean;
  clearFaint: boolean;
  followComplete: boolean;
  nextTimerMs: number;
  nextProgress: number;
  cite: string;
}

// Port of one end-event progress step. Call it with the case label the switch is about to run
// (1..9), i.e. the counter AFTER the previous tick's increment. Cite: ungoro_crater.cpp:255–296.
export function ringoEndEventStep(
  progress: number,
  spraggleAlive: boolean,
): RingoEndEventStepResult {
  if (!spraggleAlive) {
    return {
      handled: true,
      textId: null,
      speakerEntry: 0,
      setFaint: false,
      clearFaint: false,
      followComplete: true,
      nextTimerMs: 0,
      nextProgress: progress,
      cite: 'ungoro_crater.cpp:249-252 !pSpraggle alive → SetFollowComplete()',
    };
  }
  switch (progress | 0) {
    case 1:
      return {
        handled: true,
        textId: SAY_RIN_END_1,
        speakerEntry: NPC_RINGO,
        setFaint: false,
        clearFaint: false,
        followComplete: false,
        nextTimerMs: RINGO_END_EVENT_STEP_DELAYS_MS[1],
        nextProgress: 2,
        cite: 'ungoro_crater.cpp:257-260 case 1 SAY_RIN_END_1 timer 3000',
      };
    case 2:
      return {
        handled: true,
        textId: SAY_SPR_END_2,
        speakerEntry: NPC_SPRAGGLE,
        setFaint: false,
        clearFaint: false,
        followComplete: false,
        nextTimerMs: RINGO_END_EVENT_STEP_DELAYS_MS[2],
        nextProgress: 3,
        cite: 'ungoro_crater.cpp:261-264 case 2 SAY_SPR_END_2 timer 5000',
      };
    case 3:
      return {
        handled: true,
        textId: SAY_RIN_END_3,
        speakerEntry: NPC_RINGO,
        setFaint: false,
        clearFaint: false,
        followComplete: false,
        nextTimerMs: RINGO_END_EVENT_STEP_DELAYS_MS[3],
        nextProgress: 4,
        cite: 'ungoro_crater.cpp:265-268 case 3 SAY_RIN_END_3 timer 1000',
      };
    case 4:
      return {
        handled: true,
        textId: EMOTE_RIN_END_4,
        speakerEntry: NPC_RINGO,
        setFaint: true,
        clearFaint: false,
        followComplete: false,
        nextTimerMs: RINGO_END_EVENT_STEP_DELAYS_MS[4],
        nextProgress: 5,
        cite: 'ungoro_crater.cpp:269-273 case 4 EMOTE_RIN_END_4 + SetFaint timer 9000',
      };
    case 5:
      return {
        handled: true,
        textId: EMOTE_RIN_END_5,
        speakerEntry: NPC_RINGO,
        setFaint: false,
        clearFaint: true,
        followComplete: false,
        nextTimerMs: RINGO_END_EVENT_STEP_DELAYS_MS[5],
        nextProgress: 6,
        cite: 'ungoro_crater.cpp:274-278 case 5 EMOTE_RIN_END_5 + ClearFaint timer 1000',
      };
    case 6:
      return {
        handled: true,
        textId: SAY_RIN_END_6,
        speakerEntry: NPC_RINGO,
        setFaint: false,
        clearFaint: false,
        followComplete: false,
        nextTimerMs: RINGO_END_EVENT_STEP_DELAYS_MS[6],
        nextProgress: 7,
        cite: 'ungoro_crater.cpp:279-282 case 6 SAY_RIN_END_6 timer 3000',
      };
    case 7:
      return {
        handled: true,
        textId: SAY_SPR_END_7,
        speakerEntry: NPC_SPRAGGLE,
        setFaint: false,
        clearFaint: false,
        followComplete: false,
        nextTimerMs: RINGO_END_EVENT_STEP_DELAYS_MS[7],
        nextProgress: 8,
        cite: 'ungoro_crater.cpp:283-286 case 7 SAY_SPR_END_7 timer 10000',
      };
    case 8:
      return {
        handled: true,
        textId: EMOTE_RIN_END_8,
        speakerEntry: NPC_RINGO,
        setFaint: false,
        clearFaint: false,
        followComplete: false,
        nextTimerMs: RINGO_END_EVENT_STEP_DELAYS_MS[8],
        nextProgress: 9,
        cite: 'ungoro_crater.cpp:287-290 case 8 EMOTE_RIN_END_8 timer 5000',
      };
    case 9:
      return {
        handled: true,
        textId: null,
        speakerEntry: 0,
        setFaint: false,
        clearFaint: false,
        followComplete: true,
        nextTimerMs: 0,
        nextProgress: 9,
        cite: 'ungoro_crater.cpp:291-293 case 9 SetFollowComplete()',
      };
    default:
      return {
        handled: false,
        textId: null,
        speakerEntry: 0,
        setFaint: false,
        clearFaint: false,
        followComplete: false,
        nextTimerMs: 0,
        nextProgress: progress,
        cite: 'ungoro_crater.cpp:255 unknown progress → no-op',
      };
  }
}

// Pure helpers — Simone the Inconspicuous

export interface SimoneGossipHelloResult {
  showChallenge: boolean;
  cite: string;
}

/** Port of GossipHello_npc_simone_the_inconspicuous challenge branch. Cite: ungoro_crater.cpp:785–792 */
export function simoneGossipHello(
  questIncomplete7636: boolean,
  isGameMaster: boolean,
): SimoneGossipHelloResult {
  if (questIncomplete7636 || isGameMaster) {
    return {
      showChallenge: true,
      cite:
        'ungoro_crater.cpp:788-789 QUEST_STAVE incomplete or GM → ADD_GOSSIP_ITEM BCT 9755',
    };
  }
  return {
    showChallenge: false,
    cite: 'ungoro_crater.cpp:787-791 default gossip only',
  };
}

export interface SimoneBeginEventResult {
  playerGuidBound: boolean;
  moveIdle: boolean;
  clearGossipFlag: boolean;
  transformArmed: boolean;
  transformTimerMs: number;
  transformEmoteTimerMs: number;
  laughEmote: number;
  cite: string;
}

/** Port of GossipSelect → BeginEvent + laugh emote. Cite: ungoro_crater.cpp:738–744,795–800 */
export function simoneBeginEvent(): SimoneBeginEventResult {
  return {
    playerGuidBound: true,
    moveIdle: true,
    clearGossipFlag: true,
    transformArmed: true,
    transformTimerMs: SIMONE_TRANSFORM_MS,
    transformEmoteTimerMs: SIMONE_TRANSFORM_EMOTE_MS,
    laughEmote: EMOTE_ONESHOT_LAUGH,
    cite:
      'ungoro_crater.cpp:740-743,798-799 bind player + MoveIdle + clear gossip + m_bTransform + LAUGH',
  };
}

export interface SimoneTransformTickResult {
  emoteShout: boolean;
  doTransform: boolean;
  remainingEmoteMs: number;
  remainingTransformMs: number;
  transformArmed: boolean;
  cite: string;
}

// Port of the UpdateAI transform branch while m_bTransform is armed.
// Cite: ungoro_crater.cpp:748–768.
export function simoneTransformTick(
  transformArmed: boolean,
  emoteMs: number,
  transformMs: number,
  diffMs: number,
): SimoneTransformTickResult {
  if (!transformArmed) {
    return {
      emoteShout: false,
      doTransform: false,
      remainingEmoteMs: emoteMs,
      remainingTransformMs: transformMs,
      transformArmed: false,
      cite: 'ungoro_crater.cpp:748 !m_bTransform → skip transform branch',
    };
  }

  let nextEmote = emoteMs;
  let emoteShout = false;
  if (emoteMs > 0) {
    if (emoteMs <= diffMs) {
      emoteShout = true;
      nextEmote = 0;
    } else {
      nextEmote = emoteMs - diffMs;
    }
  }

  // cpp: if (m_uiTransform_Timer < uiDiff) Transform; else subtract
  if (transformMs < diffMs) {
    return {
      emoteShout,
      doTransform: true,
      remainingEmoteMs: nextEmote,
      remainingTransformMs: 0,
      transformArmed: false,
      cite:
        'ungoro_crater.cpp:761-764 m_bTransform=false + Transform() (summon seductress+devourer)',
    };
  }
  return {
    emoteShout,
    doTransform: false,
    remainingEmoteMs: nextEmote,
    remainingTransformMs: transformMs - diffMs,
    transformArmed: true,
    cite: emoteShout
      ? 'ungoro_crater.cpp:752-755 EMOTE_ONESHOT_SHOUT; transform still ticking'
      : 'ungoro_crater.cpp:750-767 transform timers subtract',
  };
}

export interface SimoneTransformResult {
  summonSeductress: number;
  summonDevourer: number;
  despawnPrecious: number;
  hideSelf: boolean;
  forceDespawnSelf: boolean;
  wireSimoneGuidOnSeductress: boolean;
  wirePreciousGuidOnSeductress: boolean;
  wireSimoneGuidOnDevourer: boolean;
  cite: string;
}

/** Port of Transform() when player guid still on map. Cite: ungoro_crater.cpp:701–736 */
export function simoneTransform(playerOnMap: boolean): SimoneTransformResult {
  if (!playerOnMap) {
    return {
      summonSeductress: 0,
      summonDevourer: 0,
      despawnPrecious: 0,
      hideSelf: false,
      forceDespawnSelf: false,
      wireSimoneGuidOnSeductress: false,
      wirePreciousGuidOnSeductress: false,
      wireSimoneGuidOnDevourer: false,
      cite: 'ungoro_crater.cpp:703 GetPlayer fails → no Transform',
    };
  }
  return {
    summonSeductress: NPC_SIMONE_THE_SEDUCTRESS,
    summonDevourer: NPC_PRECIOUS_THE_DEVOURER,
    despawnPrecious: NPC_PRECIOUS,
    hideSelf: true,
    forceDespawnSelf: true,
    wireSimoneGuidOnSeductress: true,
    wirePreciousGuidOnSeductress: true,
    wireSimoneGuidOnDevourer: true,
    cite:
      'ungoro_crater.cpp:705-734 summon 14533+14538; wire guids; hide/despawn self+14528',
  };
}

// Pure helpers — Simone the Seductress

export interface SimoneSeductressResetResult {
  kissMinMs: number;
  kissMaxMs: number;
  lightningMinMs: number;
  lightningMaxMs: number;
  threatCheckMs: number;
  splitCheckMs: number;
  cite: string;
}

/** Port of Reset for Seductress (not ctor despawn arm). Cite: ungoro_crater.cpp:451–461 */
export function simoneSeductressReset(): SimoneSeductressResetResult {
  return {
    kissMinMs: SIMONE_KISS_INIT_MIN_MS,
    kissMaxMs: SIMONE_KISS_INIT_MAX_MS,
    lightningMinMs: SIMONE_LIGHTNING_INIT_MIN_MS,
    lightningMaxMs: SIMONE_LIGHTNING_INIT_MAX_MS,
    threatCheckMs: SIMONE_THREAT_CHECK_INIT_MS,
    splitCheckMs: SIMONE_SPLIT_CHECK_INIT_MS,
    cite:
      'ungoro_crater.cpp:457-460 Kiss/Lightning urand(3-6)s; threat 5s; split 7.5s',
  };
}

export interface SimoneAggroResult {
  attackStartPrecious: boolean;
  bindHunter: boolean;
  demonDespawn: boolean;
  cite: string;
}

// Port of Aggro for the Seductress: she links Precious and binds the first hunter she sees.
// Cite: ungoro_crater.cpp:499–516.
export function simoneSeductressAggro(
  preciousAlive: boolean,
  whoClass: number,
  hunterGuidEmpty: boolean,
  whoIsBoundHunter: boolean,
): SimoneAggroResult {
  const attackStartPrecious = preciousAlive;
  if ((whoClass | 0) === CLASS_HUNTER && (hunterGuidEmpty || whoIsBoundHunter)) {
    return {
      attackStartPrecious,
      bindHunter: true,
      demonDespawn: false,
      cite:
        'ungoro_crater.cpp:501-513 link Precious AttackStart; hunter ok → bind m_hunterGuid',
    };
  }
  return {
    attackStartPrecious,
    bindHunter: false,
    demonDespawn: true,
    cite:
      'ungoro_crater.cpp:501-515 non-hunter (or wrong hunter) → DemonDespawn()',
  };
}

export interface SimoneThreatCheckResult {
  demonDespawn: boolean;
  remainingMs: number;
  rearmMs: number;
  cite: string;
}

// Port of the multi-threat DemonDespawn gate, over her own and Precious's threat lists.
// Cite: ungoro_crater.cpp:618–632.
export function simoneThreatCheck(
  ownThreatCount: number,
  preciousThreatCount: number,
  threatCheckMs: number,
  diffMs: number,
): SimoneThreatCheckResult {
  if ((ownThreatCount | 0) > 1) {
    return {
      demonDespawn: true,
      remainingMs: threatCheckMs,
      rearmMs: SIMONE_THREAT_CHECK_REPEAT_MS,
      cite: 'ungoro_crater.cpp:618-621 own threat size >1 → DemonDespawn()',
    };
  }
  if (threatCheckMs < diffMs) {
    if ((preciousThreatCount | 0) > 1) {
      return {
        demonDespawn: true,
        remainingMs: 0,
        rearmMs: SIMONE_THREAT_CHECK_REPEAT_MS,
        cite:
          'ungoro_crater.cpp:622-629 threat timer + Precious threat size >1 → DemonDespawn()',
      };
    }
    return {
      demonDespawn: false,
      remainingMs: 0,
      rearmMs: SIMONE_THREAT_CHECK_REPEAT_MS,
      cite: 'ungoro_crater.cpp:624 re-arm threat check 2000; Precious ok',
    };
  }
  return {
    demonDespawn: false,
    remainingMs: threatCheckMs - diffMs,
    rearmMs: SIMONE_THREAT_CHECK_REPEAT_MS,
    cite: 'ungoro_crater.cpp:632 m_uiThreatCheck_Timer -= uiDiff',
  };
}

export interface SimoneSpellHitResult {
  castSilence: boolean;
  emoteTextId: number | null;
  cite: string;
}

/** Port of SpellHit Viper Sting → Silence. Cite: ungoro_crater.cpp:582–588 */
export function simoneSeductressSpellHit(spellId: number): SimoneSpellHitResult {
  if ((spellId | 0) === SPELL_VIPER_STING_R3) {
    return {
      castSilence: true,
      emoteTextId: EMOTE_SILENCE,
      cite:
        'ungoro_crater.cpp:584-587 Viper Sting 14280 → CAST_TRIGGERED Silence 23207 + EMOTE_SILENCE',
    };
  }
  return {
    castSilence: false,
    emoteTextId: null,
    cite: 'ungoro_crater.cpp:584 spell != 14280 → no-op',
  };
}

export interface SimoneDemonDespawnResult {
  respawnDelayMs: number;
  summonCleaner: boolean;
  cleanerEntry: number;
  cleanerDespawnMs: number;
  hidePrecious: boolean;
  hideSelf: boolean;
  forceDespawnSelf: boolean;
  cite: string;
}

// Port of DemonDespawn(triggered); triggered summons the Cleaner and attacks the threat lists.
// Cite: ungoro_crater.cpp:529–580.
export function simoneDemonDespawn(triggered = true): SimoneDemonDespawnResult {
  return {
    respawnDelayMs: SIMONE_RESPAWN_ON_DESPAWN_MS,
    summonCleaner: triggered,
    cleanerEntry: NPC_THE_CLEANER,
    cleanerDespawnMs: CLEANER_DESPAWN_MS,
    hidePrecious: true,
    hideSelf: true,
    forceDespawnSelf: true,
    cite: triggered
      ? 'ungoro_crater.cpp:531-579 15min respawn + Cleaner 14503 20min + hide/despawn Precious+self'
      : 'ungoro_crater.cpp:531-579 15min respawn; no Cleaner; hide/despawn Precious+self',
  };
}

export interface SimoneJustDiedResult {
  inconspicuousRespawnMs: number;
  cite: string;
}

/** Port of JustDied respawn delay on inconspicuous template. Cite: ungoro_crater.cpp:518–527 */
export function simoneSeductressJustDied(): SimoneJustDiedResult {
  return {
    inconspicuousRespawnMs: SIMONE_RESPAWN_ON_DEATH_MS,
    cite: 'ungoro_crater.cpp:522-525 m_simoneGuid SetRespawnDelay/Time 2*HOUR',
  };
}

export interface SimoneDespawnOocTickResult {
  demonDespawn: boolean;
  remainingMs: number;
  cite: string;
}

// Port of the OOC 20-minute despawn arm.
// Cite: ungoro_crater.cpp:593–599.
export function simoneDespawnOocTick(
  alive: boolean,
  inCombat: boolean,
  despawnMs: number,
  diffMs: number,
): SimoneDespawnOocTickResult {
  if (despawnMs < diffMs) {
    if (alive && !inCombat) {
      return {
        demonDespawn: true,
        remainingMs: 0,
        cite: 'ungoro_crater.cpp:595-596 alive OOC → DemonDespawn(false)',
      };
    }
    return {
      demonDespawn: false,
      remainingMs: 0,
      cite: 'ungoro_crater.cpp:595 timer expired but dead/in combat → no DemonDespawn',
    };
  }
  return {
    demonDespawn: false,
    remainingMs: despawnMs - diffMs,
    cite: 'ungoro_crater.cpp:599 m_uiDespawn_Timer -= uiDiff',
  };
}

// Pure helpers — Precious the Devourer

export interface PreciousAggroResult {
  attackStartSimone: boolean;
  cite: string;
}

/** Port of Aggro for Devourer. Cite: ungoro_crater.cpp:376–385 */
export function preciousAggro(simoneAlive: boolean): PreciousAggroResult {
  if (simoneAlive) {
    return {
      attackStartSimone: true,
      cite: 'ungoro_crater.cpp:378-383 Simone alive → AttackStart(who) on Simone',
    };
  }
  return {
    attackStartSimone: false,
    cite: 'ungoro_crater.cpp:378-384 no living Simone → no link',
  };
}

export interface PreciousEvadeResult {
  forceDespawn: boolean;
  cite: string;
}

/** Port of EnterEvadeMode for Devourer. Cite: ungoro_crater.cpp:387–398 */
export function preciousEnterEvade(simoneAlive: boolean): PreciousEvadeResult {
  if (!simoneAlive) {
    return {
      forceDespawn: true,
      cite: 'ungoro_crater.cpp:391-394 !Simone alive → ForcedDespawn()',
    };
  }
  return {
    forceDespawn: false,
    cite: 'ungoro_crater.cpp:397 ScriptedAI::EnterEvadeMode only',
  };
}

export interface PreciousSplitCheckResult {
  simoneEnterEvade: boolean;
  remainingMs: number;
  rearmMs: number;
  cite: string;
}

// Port of OOC split-check: if Simone in combat while Precious is not → Simone evade. Cite:
// ungoro_crater.cpp:400–416
export function preciousSplitCheck(
  hasVictim: boolean,
  splitMs: number,
  diffMs: number,
  simoneInCombat: boolean,
): PreciousSplitCheckResult {
  if (hasVictim) {
    return {
      simoneEnterEvade: false,
      remainingMs: splitMs,
      rearmMs: PRECIOUS_SPLIT_CHECK_REPEAT_MS,
      cite: 'ungoro_crater.cpp:402-419 has victim → melee, no split check',
    };
  }
  if (splitMs < diffMs) {
    return {
      simoneEnterEvade: simoneInCombat,
      remainingMs: 0,
      rearmMs: PRECIOUS_SPLIT_CHECK_REPEAT_MS,
      cite: simoneInCombat
        ? 'ungoro_crater.cpp:406-410 re-arm 2500; Simone in combat → EnterEvadeMode'
        : 'ungoro_crater.cpp:406-410 re-arm 2500; Simone not in combat',
    };
  }
  return {
    simoneEnterEvade: false,
    remainingMs: splitMs - diffMs,
    rearmMs: PRECIOUS_SPLIT_CHECK_REPEAT_MS,
    cite: 'ungoro_crater.cpp:414 m_uiSplitCheck_Timer -= uiDiff',
  };
}

// ---------------------------------------------------------------------------
