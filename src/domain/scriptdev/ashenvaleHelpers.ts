// Ashenvale ScriptDev pure helpers (SESSION 10 batch). Companion to ashenvale.ts IR exports. Cite:
// kalimdor/ashenvale.cpp

import {
  AI_EVENT_CUSTOM_A,
  FACTION_ESCORT_A_NEUTRAL_PASSIVE,
  FACTION_ESCORT_H_NEUTRAL_PASSIVE,
  FEERO_AMBUSH_DESPAWN_MS,
  FEERO_ASSASSIN_ANGLE_STEP,
  FEERO_ELITE_SPAWNS,
  FEERO_FIRST_AMBUSH_COUNT,
  FEERO_SCOUT_ANGLE_STEP,
  FEERO_SECOND_AMBUSH_COUNT,
  FEERO_SUMMON_POS,
  MUGLASH_DESPAWN_MS,
  MUGLASH_ESCORT_PATH,
  MUGLASH_EVENT_03_DELAY_MS,
  MUGLASH_EVENT_STEP_MS,
  MUGLASH_FAIL_MS,
  MUGLASH_SIT_REST_MS,
  MUGLASH_SUCCESS_02_DELAY_MS,
  MUGLASH_SUCCESS_03_DELAY_MS,
  MUGLASH_SUCCESS_04_DELAY_MS,
  MUGLASH_SUCCESS_DELAY_MS,
  MUGLASH_WAVE1_CLEAR_MS,
  MUGLASH_WAVE1_SPAWNS,
  MUGLASH_WAVE_DESPAWN_MS,
  NPC_ALIGAR_THE_TORMENTOR,
  NPC_BALIZAR_THE_UMBRAGE,
  NPC_CAEDAKAR_THE_VICIOUS,
  NPC_DARK_STRAND_ASSASSIN,
  NPC_FORSAKEN_SCOUT,
  NPC_VORSHA,
  NPC_WRATH_MYRMIDON,
  NPC_WRATH_PRIESTESS,
  NPC_WRATH_RAZORTAIL,
  NPC_WRATH_RIDER,
  NPC_WRATH_SEAWITCH,
  NPC_WRATH_SORCERESS,
  QUEST_FREEDOM_TO_RUUL,
  QUEST_SUPPLIES_TO_AUBERDINE,
  QUEST_TOREK_ASSULT,
  QUEST_VORSHA,
  RUUL_AMBUSH_COORDS,
  RUUL_AMBUSH_DESPAWN_MS,
  RUUL_AMBUSH_RADIUS_YD,
  RUUL_AMBUSHERS,
  SAY_BALIZAR_FINAL_AMBUSH,
  SAY_FEERO_QUEST_END,
  SAY_FEERO_QUEST_START,
  SAY_FINAL_AMBUSH_ATTACK,
  SAY_FINAL_AMBUSH_START,
  SAY_FIRST_AMBUSH_END,
  SAY_FIRST_AMBUSH_START,
  SAY_MUGLASH_AGGRO,
  SAY_MUGLASH_BRAZIER,
  SAY_MUGLASH_EVENT_01,
  SAY_MUGLASH_EVENT_02,
  SAY_MUGLASH_EVENT_03,
  SAY_MUGLASH_EVENT_04,
  SAY_MUGLASH_FAIL,
  SAY_MUGLASH_SUCCESS,
  SAY_MUGLASH_SUCCESS_02,
  SAY_MUGLASH_SUCCESS_03,
  SAY_MUGLASH_SUCCESS_04,
  SAY_RUUL_COMPLETE,
  SAY_SCOUT_SECOND_AMBUSH,
  SAY_SECOND_AMBUSH_END,
  SAY_SECOND_AMBUSH_START,
  SAY_TOREK_END,
  SAY_TOREK_MOVE,
  SAY_TOREK_PREPARE,
  SAY_TOREK_READY,
  SAY_TOREK_WIN,
  TEMPFACTION_RESTORE_RESPAWN,
  TEMPFACTION_TOGGLE_IMMUNE_TO_NPC,
  TEMPFACTION_TOGGLE_IMMUNE_TO_PLAYER,
  TOREK_REND_INIT_MS,
  TOREK_THUNDERCLAP_INIT_MS,
  TOREK_WP20_DESPAWN_MS,
  TOREK_WP20_SPAWNS,
  UNIT_STAND_STATE_SIT,
} from './ashenvale.ts';

// Pure helpers — Muglash escort event machine
// ---------------------------------------------------------------------------

export interface MuglashState {
  /** m_uiEventId. Cite: ashenvale.cpp:122 */
  eventId: number;
  /** m_uiWaveOneAlive. Cite: ashenvale.cpp:123 */
  waveOneAlive: number;
  /** m_uiWaveTwoAlive. Cite: ashenvale.cpp:124 */
  waveTwoAlive: number;
  /** Escort paused at brazier / post-waves. */
  escortPaused: boolean;
  /** FAIL timer remaining ms (0 = disabled). Cite: ashenvale.cpp:273 */
  failTimerMs: number;
  /** EVENT timer remaining ms (0 = disabled). */
  eventTimerMs: number;
  /** SPELL_MUGLASH_WAITING aura present. */
  waitingAura: boolean;
  /** GO interactable (flag cleared). Cite: ashenvale.cpp:281 */
  brazierInteractable: boolean;
  /** Escorting (HasEscortState STATE_ESCORT_ESCORTING). */
  escorting: boolean;
}

/** Idle pre-escort after ctor Reset. Cite: ashenvale.cpp:112–119,126–131 */
export function muglashInitialState(): MuglashState {
  return {
    eventId: 0,
    waveOneAlive: 0,
    waveTwoAlive: 0,
    escortPaused: false,
    failTimerMs: 0,
    eventTimerMs: 0,
    waitingAura: false,
    brazierInteractable: false,
    escorting: false,
  };
}

/** Port of Reset when not escorting. Cite: ashenvale.cpp:126–131 */
export function muglashReset(prior: MuglashState): MuglashState {
  if (prior.escorting) return prior;
  return { ...prior, eventId: 0 };
}

export interface MuglashWaypointResult {
  handled: boolean;
  ignoreMmap: boolean | null;
  pauseEscort: boolean;
  armEventMs: number;
  setEventId: number | null;
  cite: string;
}

/** Port of WaypointReached. Cite: ashenvale.cpp:146–172 */
export function muglashWaypointReached(pointId: number): MuglashWaypointResult {
  switch (pointId) {
    case 10:
      return {
        handled: true,
        ignoreMmap: true,
        pauseEscort: false,
        armEventMs: 0,
        setEventId: null,
        cite: 'ashenvale.cpp:150-153 case 10 SetIgnoreMMAP(true)',
      };
    case 12:
      return {
        handled: true,
        ignoreMmap: false,
        pauseEscort: false,
        armEventMs: 0,
        setEventId: null,
        cite: 'ashenvale.cpp:154-157 case 12 SetIgnoreMMAP(false)',
      };
    case 15:
      return {
        handled: true,
        ignoreMmap: null,
        pauseEscort: true,
        armEventMs: MUGLASH_EVENT_STEP_MS,
        setEventId: 0,
        cite: 'ashenvale.cpp:158-163 case 15 pause + ResetTimer EVENT 2000 eventId=0',
      };
    case 16:
      return {
        handled: true,
        ignoreMmap: null,
        pauseEscort: true,
        armEventMs: 0,
        setEventId: null,
        cite: 'ashenvale.cpp:164-166 case 16 SetEscortPaused(true)',
      };
    case 17:
      return {
        handled: true,
        ignoreMmap: null,
        pauseEscort: true,
        armEventMs: MUGLASH_EVENT_STEP_MS,
        setEventId: 5,
        cite: 'ashenvale.cpp:167-170 case 17 pause + ResetTimer EVENT 2000 eventId=5',
      };
    default:
      return {
        handled: false,
        ignoreMmap: null,
        pauseEscort: false,
        armEventMs: 0,
        setEventId: null,
        cite: 'ashenvale.cpp:146-172 no case for this pointId',
      };
  }
}

export interface MuglashBrazierUseResult {
  handled: boolean;
  eventType: number;
  disableFail: boolean;
  removeWaitingAura: boolean;
  nextEventId: number;
  armEventMs: number;
  goStateReady: boolean;
  goNoInteract: boolean;
  cite: string;
}

/** Port of GOUse_go_naga_brazier + ReceiveAIEvent CUSTOM_A. Cite: ashenvale.cpp:175–185,369–379 */
export function muglashBrazierUsed(): MuglashBrazierUseResult {
  return {
    handled: true,
    eventType: AI_EVENT_CUSTOM_A,
    disableFail: true,
    removeWaitingAura: true,
    nextEventId: 2,
    armEventMs: MUGLASH_EVENT_STEP_MS,
    goStateReady: true,
    goNoInteract: true,
    cite: 'ashenvale.cpp:177-184,369-379 GO use → CUSTOM_A → strip 20861 + eventId=2 + arm 2s; GO READY+NO_INTERACT',
  };
}

export interface MuglashEventStepResult {
  handled: boolean;
  textId: number | null;
  /** Cast SPELL_MUGLASH_WAITING on self. */
  castWaiting: boolean;
  /** Summon wave entries (coords from tables). */
  summons: Array<{
    creatureEntry: number;
    x: number;
    y: number;
    z: number;
    despawnMs: number;
  }>;
  resumeEscort: boolean;
  standState: number | null;
  armFailMs: number;
  armEventMs: number;
  nextEventId: number | null;
  enableBrazier: boolean;
  questCredit: boolean;
  endEscort: boolean;
  forceDespawnMs: number;
  cite: string;
}

/** Port of DoEvent() switch on m_uiEventId. Cite: ashenvale.cpp:261–352 */
export function muglashDoEvent(eventId: number): MuglashEventStepResult {
  const emptySummons: MuglashEventStepResult['summons'] = [];
  switch (eventId) {
    case 0:
      return {
        handled: true,
        textId: SAY_MUGLASH_BRAZIER,
        castWaiting: false,
        summons: emptySummons,
        resumeEscort: false,
        standState: null,
        armFailMs: MUGLASH_FAIL_MS,
        armEventMs: MUGLASH_EVENT_STEP_MS,
        nextEventId: 1,
        enableBrazier: false,
        questCredit: false,
        endEscort: false,
        forceDespawnMs: 0,
        cite: 'ashenvale.cpp:265-276 case 0 SAY_BRAZIER + FAIL 300s + eventId→1 + arm 2s',
      };
    case 1:
      return {
        handled: true,
        textId: null,
        castWaiting: true,
        summons: emptySummons,
        resumeEscort: false,
        standState: null,
        armFailMs: 0,
        armEventMs: 0,
        nextEventId: null,
        enableBrazier: true,
        questCredit: false,
        endEscort: false,
        forceDespawnMs: 0,
        cite: 'ashenvale.cpp:277-284 case 1 enable brazier + SPELL_MUGLASH_WAITING 20861',
      };
    case 2:
      return {
        handled: true,
        textId: SAY_MUGLASH_EVENT_01,
        castWaiting: false,
        summons: MUGLASH_WAVE1_SPAWNS.map((s) => ({
          creatureEntry: s.entry,
          x: s.x,
          y: s.y,
          z: s.z,
          despawnMs: MUGLASH_WAVE_DESPAWN_MS,
        })),
        resumeEscort: true,
        standState: null,
        armFailMs: 0,
        armEventMs: 0,
        nextEventId: null,
        enableBrazier: false,
        questCredit: false,
        endEscort: false,
        forceDespawnMs: 0,
        cite: 'ashenvale.cpp:285-293 case 2 SAY_EVENT_01 + wave1 3 naga + resume escort',
      };
    case 3:
      return {
        handled: true,
        textId: SAY_MUGLASH_EVENT_02,
        castWaiting: false,
        summons: emptySummons,
        resumeEscort: false,
        standState: UNIT_STAND_STATE_SIT,
        armFailMs: 0,
        armEventMs: MUGLASH_SIT_REST_MS,
        nextEventId: 4,
        enableBrazier: false,
        questCredit: false,
        endEscort: false,
        forceDespawnMs: 0,
        cite: 'ashenvale.cpp:294-300 case 3 SAY_EVENT_02 + SIT + arm 9s → eventId 4',
      };
    case 4:
      return {
        handled: true,
        textId: null,
        castWaiting: false,
        summons: emptySummons,
        resumeEscort: false,
        standState: UNIT_STAND_STATE_SIT,
        armFailMs: 0,
        armEventMs: 0,
        nextEventId: 5,
        enableBrazier: false,
        questCredit: false,
        endEscort: false,
        forceDespawnMs: 0,
        cite: 'ashenvale.cpp:301-305 case 4 SIT + eventId→5 (wave2 already spawned on wave1 clear)',
      };
    case 5:
      return {
        handled: true,
        textId: SAY_MUGLASH_EVENT_03,
        castWaiting: false,
        summons: emptySummons,
        resumeEscort: false,
        standState: null,
        armFailMs: 0,
        armEventMs: MUGLASH_EVENT_03_DELAY_MS,
        nextEventId: 6,
        enableBrazier: false,
        questCredit: false,
        endEscort: false,
        forceDespawnMs: 0,
        cite: 'ashenvale.cpp:306-311 case 5 SAY_EVENT_03 + arm 3s → eventId 6',
      };
    case 6:
      return {
        handled: true,
        textId: SAY_MUGLASH_EVENT_04,
        castWaiting: false,
        summons: emptySummons,
        resumeEscort: false,
        standState: null,
        armFailMs: 0,
        armEventMs: 0,
        nextEventId: null,
        enableBrazier: false,
        questCredit: false,
        endEscort: false,
        forceDespawnMs: 0,
        cite: 'ashenvale.cpp:312-315 case 6 POINT emote + SAY_EVENT_04',
      };
    case 7:
      return {
        handled: true,
        textId: SAY_MUGLASH_SUCCESS,
        castWaiting: false,
        summons: emptySummons,
        resumeEscort: false,
        standState: null,
        armFailMs: 0,
        armEventMs: MUGLASH_SUCCESS_DELAY_MS,
        nextEventId: 8,
        enableBrazier: false,
        questCredit: false,
        endEscort: false,
        forceDespawnMs: 0,
        cite: 'ashenvale.cpp:316-322 case 7 CHEER + SAY_SUCCESS + arm 8s → eventId 8',
      };
    case 8:
      return {
        handled: true,
        textId: SAY_MUGLASH_SUCCESS_02,
        castWaiting: false,
        summons: emptySummons,
        resumeEscort: false,
        standState: null,
        armFailMs: 0,
        armEventMs: MUGLASH_SUCCESS_02_DELAY_MS,
        nextEventId: 9,
        enableBrazier: false,
        questCredit: true,
        endEscort: false,
        forceDespawnMs: 0,
        cite: 'ashenvale.cpp:323-334 case 8 explore 6641 + BOW + SAY_SUCCESS_02 + arm 3s',
      };
    case 9:
      return {
        handled: true,
        textId: SAY_MUGLASH_SUCCESS_03,
        castWaiting: false,
        summons: emptySummons,
        resumeEscort: false,
        standState: null,
        armFailMs: 0,
        armEventMs: MUGLASH_SUCCESS_03_DELAY_MS,
        nextEventId: 10,
        enableBrazier: false,
        questCredit: false,
        endEscort: false,
        forceDespawnMs: 0,
        cite: 'ashenvale.cpp:335-340 case 9 SAY_SUCCESS_03 + arm 5s',
      };
    case 10:
      return {
        handled: true,
        textId: SAY_MUGLASH_SUCCESS_04,
        castWaiting: false,
        summons: emptySummons,
        resumeEscort: false,
        standState: null,
        armFailMs: 0,
        armEventMs: MUGLASH_SUCCESS_04_DELAY_MS,
        nextEventId: 11,
        enableBrazier: false,
        questCredit: false,
        endEscort: false,
        forceDespawnMs: 0,
        cite: 'ashenvale.cpp:341-345 case 10 SAY_SUCCESS_04 + arm 5s',
      };
    case 11:
      return {
        handled: true,
        textId: null,
        castWaiting: false,
        summons: emptySummons,
        resumeEscort: false,
        standState: null,
        armFailMs: 0,
        armEventMs: 0,
        nextEventId: null,
        enableBrazier: false,
        questCredit: false,
        endEscort: true,
        forceDespawnMs: MUGLASH_DESPAWN_MS,
        cite: 'ashenvale.cpp:346-351 case 11 random walk + End + ForcedDespawn 14000',
      };
    default:
      return {
        handled: false,
        textId: null,
        castWaiting: false,
        summons: emptySummons,
        resumeEscort: false,
        standState: null,
        armFailMs: 0,
        armEventMs: 0,
        nextEventId: null,
        enableBrazier: false,
        questCredit: false,
        endEscort: false,
        forceDespawnMs: 0,
        cite: 'ashenvale.cpp:261-352 no case for this eventId',
      };
  }
}

export interface MuglashSummonedDiedResult {
  handled: boolean;
  waveOneAlive: number;
  waveTwoAlive: number;
  /** Spawn wave2 when wave1 hits 0. */
  spawnWave2: boolean;
  /** Spawn Vorsha + resume when wave2 hits 0. */
  spawnVorsha: boolean;
  resumeEscort: boolean;
  nextEventId: number | null;
  armEventMs: number;
  cite: string;
}

/** Port of SummonedCreatureJustDied wave counters. Cite: ashenvale.cpp:209–242 */
export function muglashSummonedCreatureJustDied(
  entry: number,
  waveOneAlive: number,
  waveTwoAlive: number,
): MuglashSummonedDiedResult {
  if (
    entry === NPC_WRATH_RAZORTAIL
    || entry === NPC_WRATH_RIDER
    || entry === NPC_WRATH_SORCERESS
  ) {
    const next = Math.max(0, waveOneAlive - 1);
    if (next === 0) {
      return {
        handled: true,
        waveOneAlive: 0,
        waveTwoAlive,
        spawnWave2: true,
        spawnVorsha: false,
        resumeEscort: false,
        nextEventId: 3,
        armEventMs: MUGLASH_WAVE1_CLEAR_MS,
        cite: 'ashenvale.cpp:214-225 wave1 clear → summon wave2 + eventId=3 + arm 5s',
      };
    }
    return {
      handled: true,
      waveOneAlive: next,
      waveTwoAlive,
      spawnWave2: false,
      spawnVorsha: false,
      resumeEscort: false,
      nextEventId: null,
      armEventMs: 0,
      cite: 'ashenvale.cpp:214-218 wave1 -- still alive',
    };
  }
  if (
    entry === NPC_WRATH_MYRMIDON
    || entry === NPC_WRATH_SEAWITCH
    || entry === NPC_WRATH_PRIESTESS
  ) {
    const next = Math.max(0, waveTwoAlive - 1);
    if (next === 0) {
      return {
        handled: true,
        waveOneAlive,
        waveTwoAlive: 0,
        spawnWave2: false,
        spawnVorsha: true,
        resumeEscort: true,
        nextEventId: null,
        armEventMs: 0,
        cite: 'ashenvale.cpp:227-236 wave2 clear → Vorsha + SetEscortPaused(false)',
      };
    }
    return {
      handled: true,
      waveOneAlive,
      waveTwoAlive: next,
      spawnWave2: false,
      spawnVorsha: false,
      resumeEscort: false,
      nextEventId: null,
      armEventMs: 0,
      cite: 'ashenvale.cpp:227-230 wave2 -- still alive',
    };
  }
  if (entry === NPC_VORSHA) {
    return {
      handled: true,
      waveOneAlive,
      waveTwoAlive,
      spawnWave2: false,
      spawnVorsha: false,
      resumeEscort: false,
      nextEventId: 7,
      armEventMs: MUGLASH_EVENT_STEP_MS,
      cite: 'ashenvale.cpp:238-241 Vorsha death → eventId=7 + arm 2s',
    };
  }
  return {
    handled: false,
    waveOneAlive,
    waveTwoAlive,
    spawnWave2: false,
    spawnVorsha: false,
    resumeEscort: false,
    nextEventId: null,
    armEventMs: 0,
    cite: 'ashenvale.cpp:209-242 entry not a muglash wave/vorsha',
  };
}

export interface MuglashAggroResult {
  textId: number | null;
  cite: string;
}

// Port of Aggro while the escort is paused: a 50% SAY_AGGRO, where roll01 of 1 returns silent.
// Cite: ashenvale.cpp:134–143.
export function muglashAggro(escortPaused: boolean, roll01: number): MuglashAggroResult {
  if (!escortPaused) {
    return { textId: null, cite: 'ashenvale.cpp:136 !PAUSED → no aggro yell' };
  }
  if (roll01) {
    return { textId: null, cite: 'ashenvale.cpp:138-139 urand(0,1) non-zero → silent' };
  }
  return {
    textId: SAY_MUGLASH_AGGRO,
    cite: 'ashenvale.cpp:141-142 SAY_MUGLASH_AGGRO to escort player',
  };
}

export interface MuglashFailResult {
  textId: number;
  goNoInteract: boolean;
  cite: string;
}

/** Port of DoFailEscort. Cite: ashenvale.cpp:246–257 */
export function muglashDoFailEscort(): MuglashFailResult {
  return {
    textId: SAY_MUGLASH_FAIL,
    goNoInteract: true,
    cite: 'ashenvale.cpp:246-257 SAY_FAIL + GO_FLAG_NO_INTERACT on brazier',
  };
}

export interface MuglashQuestAcceptResult {
  handled: boolean;
  factionId: number;
  factionFlags: number;
  pathId: number;
  questId: number;
  cite: string;
}

/** Port of QuestAccept_npc_muglash. Cite: ashenvale.cpp:356–367 */
export function muglashQuestAccept(questId: number): MuglashQuestAcceptResult {
  if (questId !== QUEST_VORSHA) {
    return {
      handled: false,
      factionId: 0,
      factionFlags: 0,
      pathId: 0,
      questId,
      cite: 'ashenvale.cpp:358 quest != 6641 → no-op',
    };
  }
  return {
    handled: true,
    factionId: FACTION_ESCORT_H_NEUTRAL_PASSIVE,
    factionFlags: TEMPFACTION_RESTORE_RESPAWN,
    pathId: MUGLASH_ESCORT_PATH,
    questId: QUEST_VORSHA,
    cite: 'ashenvale.cpp:360-364 faction 33 + Start path 12717 quest 6641',
  };
}

// Pure helpers — Ruul Snowhoof

export interface RuulWaypointResult {
  handled: boolean;
  ambushIndex: number | null;
  removeShapechange: boolean;
  castShapechange: boolean;
  setImmuneToNpc: boolean | null;
  questCredit: boolean;
  textId: number | null;
  setWalk: boolean | null;
  forceDespawn: boolean;
  cite: string;
}

/** Port of WaypointReached. Cite: ashenvale.cpp:427–462 */
export function ruulWaypointReached(pointId: number): RuulWaypointResult {
  switch (pointId) {
    case 14:
      return {
        handled: true,
        ambushIndex: 0,
        removeShapechange: false,
        castShapechange: false,
        setImmuneToNpc: null,
        questCredit: false,
        textId: null,
        setWalk: null,
        forceDespawn: false,
        cite: 'ashenvale.cpp:431-433 case 14 DoSpawnAmbush(0)',
      };
    case 31:
      return {
        handled: true,
        ambushIndex: 1,
        removeShapechange: false,
        castShapechange: false,
        setImmuneToNpc: null,
        questCredit: false,
        textId: null,
        setWalk: null,
        forceDespawn: false,
        cite: 'ashenvale.cpp:434-436 case 31 DoSpawnAmbush(1)',
      };
    case 32:
      return {
        handled: true,
        ambushIndex: null,
        removeShapechange: true,
        castShapechange: false,
        setImmuneToNpc: true,
        questCredit: true,
        textId: null,
        setWalk: null,
        forceDespawn: false,
        cite: 'ashenvale.cpp:437-445 case 32 immune NPC + strip 20514 + explore 6482',
      };
    case 33:
      return {
        handled: true,
        ambushIndex: null,
        removeShapechange: false,
        castShapechange: false,
        setImmuneToNpc: null,
        questCredit: false,
        textId: SAY_RUUL_COMPLETE,
        setWalk: false,
        forceDespawn: false,
        cite: 'ashenvale.cpp:446-454 case 33 SAY_RUUL_COMPLETE + bow + SetWalk(false)',
      };
    case 34:
      return {
        handled: true,
        ambushIndex: null,
        removeShapechange: false,
        castShapechange: true,
        setImmuneToNpc: null,
        questCredit: false,
        textId: null,
        setWalk: null,
        forceDespawn: false,
        cite: 'ashenvale.cpp:455-457 case 34 DoCast SPELL_RUUL_SHAPECHANGE',
      };
    case 36:
      return {
        handled: true,
        ambushIndex: null,
        removeShapechange: false,
        castShapechange: false,
        setImmuneToNpc: false,
        questCredit: false,
        textId: null,
        setWalk: true,
        forceDespawn: true,
        cite: 'ashenvale.cpp:458-461 case 36 clear immune + walk + ForcedDespawn',
      };
    default:
      return {
        handled: false,
        ambushIndex: null,
        removeShapechange: false,
        castShapechange: false,
        setImmuneToNpc: null,
        questCredit: false,
        textId: null,
        setWalk: null,
        forceDespawn: false,
        cite: 'ashenvale.cpp:427-462 no case for this pointId',
      };
  }
}

/** Ambush pack for DoSpawnAmbush(index). Cite: ashenvale.cpp:413–424 */
export function ruulSpawnAmbush(index: 0 | 1): {
  entries: readonly number[];
  center: { x: number; y: number; z: number };
  radiusYd: number;
  despawnMs: number;
  cite: string;
} {
  return {
    entries: RUUL_AMBUSHERS,
    center: {
      x: RUUL_AMBUSH_COORDS[index]!.x,
      y: RUUL_AMBUSH_COORDS[index]!.y,
      z: RUUL_AMBUSH_COORDS[index]!.z,
    },
    radiusYd: RUUL_AMBUSH_RADIUS_YD,
    despawnMs: RUUL_AMBUSH_DESPAWN_MS,
    cite:
      index === 0
        ? 'ashenvale.cpp:413-424,431-433 ambush0 WP14 entries 3925/3924/3926'
        : 'ashenvale.cpp:413-424,434-436 ambush1 WP31 entries 3925/3924/3926',
  };
}

export interface RuulQuestAcceptResult {
  handled: boolean;
  factionId: number;
  factionFlags: number;
  stand: boolean;
  questId: number;
  cite: string;
}

/** Port of QuestAccept_npc_ruul_snowhoof. Cite: ashenvale.cpp:466–477 */
export function ruulQuestAccept(questId: number): RuulQuestAcceptResult {
  if (questId !== QUEST_FREEDOM_TO_RUUL) {
    return {
      handled: false,
      factionId: 0,
      factionFlags: 0,
      stand: false,
      questId,
      cite: 'ashenvale.cpp:468 quest != 6482 → no-op',
    };
  }
  return {
    handled: true,
    factionId: FACTION_ESCORT_H_NEUTRAL_PASSIVE,
    factionFlags: TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_PLAYER,
    stand: true,
    questId: QUEST_FREEDOM_TO_RUUL,
    cite: 'ashenvale.cpp:470-474 faction 33 flags RESTORE|TOGGLE_IMMUNE_PLAYER + STAND + Start escort',
  };
}

// Pure helpers — Torek

export interface TorekCombatState {
  rendTimerMs: number;
  thunderclapTimerMs: number;
}

/** Port of Reset. Cite: ashenvale.cpp:514–517 */
export function torekReset(): TorekCombatState {
  return {
    rendTimerMs: TOREK_REND_INIT_MS,
    thunderclapTimerMs: TOREK_THUNDERCLAP_INIT_MS,
  };
}

export interface TorekWaypointResult {
  handled: boolean;
  textId: number | null;
  summons: Array<{
    creatureEntry: number;
    x: number;
    y: number;
    z: number;
    o: number;
    despawnMs: number;
  }>;
  questCredit: boolean;
  cite: string;
}

/** Port of WaypointReached. Cite: ashenvale.cpp:520–548 */
export function torekWaypointReached(pointId: number): TorekWaypointResult {
  switch (pointId) {
    case 2:
      return {
        handled: true,
        textId: SAY_TOREK_MOVE,
        summons: [],
        questCredit: false,
        cite: 'ashenvale.cpp:529-531 case 2 SAY_MOVE',
      };
    case 9:
      return {
        handled: true,
        textId: SAY_TOREK_PREPARE,
        summons: [],
        questCredit: false,
        cite: 'ashenvale.cpp:532-534 case 9 SAY_PREPARE',
      };
    case 20:
      return {
        handled: true,
        textId: null,
        summons: TOREK_WP20_SPAWNS.map((s) => ({
          creatureEntry: s.entry,
          x: s.x,
          y: s.y,
          z: s.z,
          o: s.o,
          despawnMs: TOREK_WP20_DESPAWN_MS,
        })),
        questCredit: false,
        cite: 'ashenvale.cpp:535-540 case 20 Duriel+Sentinel+Warrior TEMPSPAWN 25000',
      };
    case 21:
      return {
        handled: true,
        textId: SAY_TOREK_WIN,
        summons: [],
        questCredit: true,
        cite: 'ashenvale.cpp:541-544 case 21 SAY_WIN + explore 6544',
      };
    case 22:
      return {
        handled: true,
        textId: SAY_TOREK_END,
        summons: [],
        questCredit: false,
        cite: 'ashenvale.cpp:545-547 case 22 SAY_END',
      };
    default:
      return {
        handled: false,
        textId: null,
        summons: [],
        questCredit: false,
        cite: 'ashenvale.cpp:520-548 no case for this pointId',
      };
  }
}

export interface TorekQuestAcceptResult {
  handled: boolean;
  textId: number | null;
  startEscort: boolean;
  questId: number;
  cite: string;
}

/** Port of QuestAccept_npc_torek. Cite: ashenvale.cpp:581–593 */
export function torekQuestAccept(questId: number): TorekQuestAcceptResult {
  if (questId !== QUEST_TOREK_ASSULT) {
    return {
      handled: false,
      textId: null,
      startEscort: false,
      questId,
      cite: 'ashenvale.cpp:583 quest != 6544 → no-op',
    };
  }
  return {
    handled: true,
    textId: SAY_TOREK_READY,
    startEscort: true,
    questId: QUEST_TOREK_ASSULT,
    cite: 'ashenvale.cpp:586-589 SAY_READY + Start(true, player, quest)',
  };
}

// Pure helpers — Feero Ironhand

export interface FeeroState {
  /** m_uiCreaturesCount. Cite: ashenvale.cpp:654 */
  creaturesCount: number;
  /** m_bIsAttacked. Cite: ashenvale.cpp:655 */
  isAttacked: boolean;
  escorting: boolean;
}

/** Idle pre-escort. Cite: ashenvale.cpp:649–663 */
export function feeroInitialState(): FeeroState {
  return { creaturesCount: 0, isAttacked: false, escorting: false };
}

/** Port of Reset when not escorting. Cite: ashenvale.cpp:657–663 */
export function feeroReset(prior: FeeroState): FeeroState {
  if (prior.escorting) return prior;
  return { creaturesCount: 0, isAttacked: false, escorting: false };
}

export interface FeeroWaypointResult {
  handled: boolean;
  textId: number | null;
  /** Ambush kind for polar spawns. */
  ambush: 'first' | 'second' | 'final' | null;
  summons: Array<{
    creatureEntry: number;
    x?: number;
    y?: number;
    z?: number;
    o?: number;
    /** Polar offset when x/y not fixed. */
    distance?: number;
    angle?: number;
    despawnMs: number;
  }>;
  questCredit: boolean;
  cite: string;
}

/** Port of WaypointReached. Cite: ashenvale.cpp:666–694 */
export function feeroWaypointReached(pointId: number): FeeroWaypointResult {
  switch (pointId) {
    case 15: {
      const summons: FeeroWaypointResult['summons'] = [];
      for (let i = 0; i < FEERO_FIRST_AMBUSH_COUNT; i++) {
        summons.push({
          creatureEntry: NPC_DARK_STRAND_ASSASSIN,
          distance: FEERO_SUMMON_POS[0]!.distance,
          angle: FEERO_SUMMON_POS[0]!.angle - FEERO_ASSASSIN_ANGLE_STEP * i,
          despawnMs: FEERO_AMBUSH_DESPAWN_MS,
        });
      }
      return {
        handled: true,
        textId: SAY_FIRST_AMBUSH_START,
        ambush: 'first',
        summons,
        questCredit: false,
        cite: 'ashenvale.cpp:670-675 case 15 SAY_FIRST_AMBUSH_START + 4×3879 polar',
      };
    }
    case 21: {
      const summons: FeeroWaypointResult['summons'] = [];
      for (let i = 0; i < FEERO_SECOND_AMBUSH_COUNT; i++) {
        summons.push({
          creatureEntry: NPC_FORSAKEN_SCOUT,
          distance: FEERO_SUMMON_POS[1]!.distance,
          angle: FEERO_SUMMON_POS[1]!.angle - FEERO_SCOUT_ANGLE_STEP * i,
          despawnMs: FEERO_AMBUSH_DESPAWN_MS,
        });
      }
      return {
        handled: true,
        textId: SAY_SECOND_AMBUSH_START,
        ambush: 'second',
        summons,
        questCredit: false,
        cite: 'ashenvale.cpp:676-681 case 21 SAY_SECOND_AMBUSH_START + 3×3893 polar',
      };
    }
    case 30:
      return {
        handled: true,
        textId: SAY_FINAL_AMBUSH_START,
        ambush: 'final',
        summons: FEERO_ELITE_SPAWNS.map((s) => ({
          creatureEntry: s.entry,
          x: s.x,
          y: s.y,
          z: s.z,
          o: s.o,
          despawnMs: FEERO_AMBUSH_DESPAWN_MS,
        })),
        questCredit: false,
        cite: 'ashenvale.cpp:682-688 case 30 SAY_FINAL_AMBUSH_START + Balizar/Aligar/Caedakar',
      };
    case 31:
      return {
        handled: true,
        textId: null,
        ambush: null,
        summons: [],
        questCredit: true,
        cite: 'ashenvale.cpp:689-693 case 31 explore 976',
      };
    default:
      return {
        handled: false,
        textId: null,
        ambush: null,
        summons: [],
        questCredit: false,
        cite: 'ashenvale.cpp:666-694 no case for this pointId',
      };
  }
}

export interface FeeroJustSummonedResult {
  textId: number | null;
  /** Speaker is the summoned unit (scout/Balizar). */
  speakerIsSummon: boolean;
  nextCount: number;
  attackStartFeero: boolean;
  cite: string;
}

// Port of JustSummoned; `creaturesCount` is m_uiCreaturesCount BEFORE the increment.
// Cite: ashenvale.cpp:742–755.
export function feeroJustSummoned(
  entry: number,
  creaturesCount: number,
): FeeroJustSummonedResult {
  let textId: number | null = null;
  let speakerIsSummon = false;
  if (entry === NPC_FORSAKEN_SCOUT) {
    // Only the first scout after count becomes 1 yells (count was 0 before ++ → after ++ == 1).
    // Cite: ashenvale.cpp:747-748 if (m_uiCreaturesCount == 1) after ++
    if (creaturesCount + 1 === 1) {
      textId = SAY_SCOUT_SECOND_AMBUSH;
      speakerIsSummon = true;
    }
  } else if (entry === NPC_BALIZAR_THE_UMBRAGE) {
    textId = SAY_BALIZAR_FINAL_AMBUSH;
    speakerIsSummon = true;
  }
  return {
    textId,
    speakerIsSummon,
    nextCount: creaturesCount + 1,
    attackStartFeero: true,
    cite: 'ashenvale.cpp:742-755 JustSummoned yell branches + ++count + AttackStart',
  };
}

export interface FeeroSummonedDiedResult {
  nextCount: number;
  clearTextId: number | null;
  cite: string;
}

/** Port of SummonedCreatureJustDied. Cite: ashenvale.cpp:719–739 */
export function feeroSummonedCreatureJustDied(
  entry: number,
  creaturesCount: number,
): FeeroSummonedDiedResult {
  const next = Math.max(0, creaturesCount - 1);
  if (next !== 0) {
    return {
      nextCount: next,
      clearTextId: null,
      cite: 'ashenvale.cpp:721-724 count still >0 after --',
    };
  }
  if (entry === NPC_DARK_STRAND_ASSASSIN) {
    return {
      nextCount: 0,
      clearTextId: SAY_FIRST_AMBUSH_END,
      cite: 'ashenvale.cpp:727-729 first ambush clear SAY_FIRST_AMBUSH_END',
    };
  }
  if (entry === NPC_FORSAKEN_SCOUT) {
    return {
      nextCount: 0,
      clearTextId: SAY_SECOND_AMBUSH_END,
      cite: 'ashenvale.cpp:730-732 second ambush clear SAY_SECOND_AMBUSH_END',
    };
  }
  if (
    entry === NPC_ALIGAR_THE_TORMENTOR
    || entry === NPC_BALIZAR_THE_UMBRAGE
    || entry === NPC_CAEDAKAR_THE_VICIOUS
  ) {
    return {
      nextCount: 0,
      clearTextId: SAY_FEERO_QUEST_END,
      cite: 'ashenvale.cpp:733-737 final ambush clear SAY_QUEST_END',
    };
  }
  return {
    nextCount: 0,
    clearTextId: null,
    cite: 'ashenvale.cpp:719-739 unknown entry at count 0',
  };
}

export interface FeeroAttackedByResult {
  textId: number | null;
  next: FeeroState;
  cite: string;
}

/** Port of AttackedBy (first Balizar hit yell). Cite: ashenvale.cpp:697–707 */
export function feeroAttackedBy(state: FeeroState, whoEntry: number): FeeroAttackedByResult {
  if (state.isAttacked) {
    return {
      textId: null,
      next: state,
      cite: 'ashenvale.cpp:700 m_bIsAttacked already → no-op',
    };
  }
  if (whoEntry !== NPC_BALIZAR_THE_UMBRAGE) {
    return {
      textId: null,
      next: state,
      cite: 'ashenvale.cpp:702 who != Balizar → no-op',
    };
  }
  return {
    textId: SAY_FINAL_AMBUSH_ATTACK,
    next: { ...state, isAttacked: true },
    cite: 'ashenvale.cpp:704-705 SAY_FINAL_AMBUSH_ATTACK + m_bIsAttacked',
  };
}

export interface FeeroQuestAcceptResult {
  handled: boolean;
  textId: number | null;
  factionId: number;
  factionFlags: number;
  startEscort: boolean;
  questId: number;
  cite: string;
}

/** Port of QuestAccept_npc_feero_ironhand. Cite: ashenvale.cpp:763–775 */
export function feeroQuestAccept(questId: number): FeeroQuestAcceptResult {
  if (questId !== QUEST_SUPPLIES_TO_AUBERDINE) {
    return {
      handled: false,
      textId: null,
      factionId: 0,
      factionFlags: 0,
      startEscort: false,
      questId,
      cite: 'ashenvale.cpp:765 quest != 976 → no-op',
    };
  }
  return {
    handled: true,
    textId: SAY_FEERO_QUEST_START,
    factionId: FACTION_ESCORT_A_NEUTRAL_PASSIVE,
    factionFlags: TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC,
    startEscort: true,
    questId: QUEST_SUPPLIES_TO_AUBERDINE,
    cite: 'ashenvale.cpp:767-771 SAY_QUEST_START + faction 10 + Start escort',
  };
}

// ---------------------------------------------------------------------------
