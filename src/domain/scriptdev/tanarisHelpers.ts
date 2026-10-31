// Tanaris ScriptDev pure helpers (SESSION 10 batch). Companion to tanaris.ts IR exports. Cite:
// kalimdor/tanaris.cpp

import {
  AGGRO_YELL_AQUE,
  AQUEMENTAS_AQUA_JET_INIT_MS,
  AQUEMENTAS_FROST_SHOCK_INIT_MS,
  AQUEMENTAS_SILVERY_CLAWS_COUNT,
  AQUEMENTAS_SWITCH_FACTION_MS,
  FACTION_ELEMENTAL,
  FACTION_ESCORT_N_FRIEND_ACTIVE,
  FACTION_ESCORT_N_FRIEND_PASSIVE,
  FACTION_FRIENDLY,
  INTERACTION_DISTANCE,
  ITEM_SILVER_TOTEM,
  NPC_TORTA,
  OOX_TEMP_FACTION_FLAGS,
  OOX_WP23_SPAWNS,
  OOX_WP29_SPAWNS,
  POINT_ID_TO_WATER,
  QUEST_RESCUE_OOX_17TN,
  QUEST_TOOGA,
  SAY_OOX_AGGRO1,
  SAY_OOX_AGGRO2,
  SAY_OOX_AMBUSH,
  SAY_OOX_END,
  SAY_OOX_START,
  SAY_TOOG_POST_1,
  SAY_TOOG_POST_3,
  SAY_TOOG_POST_5,
  SAY_TOOG_THIRST,
  SAY_TOOG_WORRIED,
  SAY_TORT_POST_2,
  SAY_TORT_POST_4,
  SAY_TORT_POST_6,
  TOOGA_POST_EVENT_INIT_MS,
  TOOGA_POST_EVENT_REPEAT_MS,
  TOOGA_SPEECH_INIT_MS,
  TOOGA_SPEECH_REPEAT_MS,
  TOOGA_SPEECH_ROLL_MAX,
  TOOGA_SPEECH_ROLL_THIRST,
  TOOGA_SPEECH_ROLL_WORRIED,
  TOOGA_TO_WATER_LOC,
  UNIT_STAND_STATE_DEAD,
  UNIT_STAND_STATE_STAND,
} from './tanaris.ts';

// Pure helpers — mob_aquementas

export interface AquementasResetResult {
  switchFactionTimerMs: number;
  aquaJetTimerMs: number;
  frostShockTimerMs: number;
  factionId: number;
  cite: string;
}

/** Port of mob_aquementasAI::Reset. Cite: tanaris.cpp:64–70 */
export function aquementasReset(): AquementasResetResult {
  return {
    switchFactionTimerMs: AQUEMENTAS_SWITCH_FACTION_MS,
    aquaJetTimerMs: AQUEMENTAS_AQUA_JET_INIT_MS,
    frostShockTimerMs: AQUEMENTAS_FROST_SHOCK_INIT_MS,
    factionId: FACTION_FRIENDLY,
    cite: 'tanaris.cpp:66-70 switch 10000 + aqua 5000 + frost 1000 + faction 35',
  };
}

export interface AquementasFactionSwitchTickResult {
  nextTimerMs: number;
  switched: boolean;
  factionId: number | null;
  cite: string;
}

// Port of the UpdateAI m_uiSwitchFactionTimer branch, which runs even without a victim.
// Cite: tanaris.cpp:96–105.
export function aquementasFactionSwitchTick(
  timerMs: number,
  diffMs: number,
): AquementasFactionSwitchTickResult {
  if (!timerMs) {
    return {
      nextTimerMs: 0,
      switched: false,
      factionId: null,
      cite: 'tanaris.cpp:96 m_uiSwitchFactionTimer==0 → skip',
    };
  }
  if (timerMs <= diffMs) {
    return {
      nextTimerMs: 0,
      switched: true,
      factionId: FACTION_ELEMENTAL,
      cite: 'tanaris.cpp:99-101 timer expire → setFaction(FACTION_ELEMENTAL=91) + timer=0',
    };
  }
  return {
    nextTimerMs: timerMs - diffMs,
    switched: false,
    factionId: null,
    cite: 'tanaris.cpp:104 m_uiSwitchFactionTimer -= uiDiff',
  };
}

export interface AquementasSendItemInput {
  bookAquorCount: number;
  silveryClawsCount: number;
  irontreeHeartCount: number;
  silverTotemCount: number;
}

export interface AquementasSendItemResult {
  grantSilverTotem: boolean;
  grantCount: number;
  itemId: number;
  cite: string;
}

/** Port of mob_aquementasAI::SendItem inventory gate. Cite: tanaris.cpp:73–83 */
export function aquementasSendItem(
  inv: AquementasSendItemInput,
): AquementasSendItemResult {
  if (
    inv.bookAquorCount >= 1
    && inv.silveryClawsCount >= AQUEMENTAS_SILVERY_CLAWS_COUNT
    && inv.irontreeHeartCount >= 1
    && inv.silverTotemCount < 1
  ) {
    return {
      grantSilverTotem: true,
      grantCount: 1,
      itemId: ITEM_SILVER_TOTEM,
      cite: 'tanaris.cpp:75-81 Book+11 claws+heart + !totem → StoreNewItem 11522 ×1',
    };
  }
  return {
    grantSilverTotem: false,
    grantCount: 0,
    itemId: ITEM_SILVER_TOTEM,
    cite: 'tanaris.cpp:75-78 materials incomplete or already has Silver Totem → no grant',
  };
}

export interface AquementasAggroResult {
  textId: number;
  /** Call SendItem on beneficiary player when present. */
  sendItem: boolean;
  cite: string;
}

/** Port of mob_aquementasAI::Aggro. Cite: tanaris.cpp:85–92 */
export function aquementasAggro(): AquementasAggroResult {
  return {
    textId: AGGRO_YELL_AQUE,
    sendItem: true,
    cite: 'tanaris.cpp:87-91 DoScriptText AGGRO_YELL_AQUE + SendItem(beneficiary)',
  };
}

// Pure helpers — npc_oox17tn

export interface Oox17tnQuestAcceptResult {
  handled: boolean;
  textId: number | null;
  standState: number;
  factionId: number;
  factionFlags: number;
  setActive: boolean;
  startEscort: boolean;
  questId: number;
  cite: string;
}

/** Port of QuestAccept_npc_oox17tn. Cite: tanaris.cpp:235–248 */
export function oox17tnQuestAccept(questId: number): Oox17tnQuestAcceptResult {
  if ((questId | 0) !== QUEST_RESCUE_OOX_17TN) {
    return {
      handled: false,
      textId: null,
      standState: UNIT_STAND_STATE_DEAD,
      factionId: 0,
      factionFlags: 0,
      setActive: false,
      startEscort: false,
      questId: 0,
      cite: 'tanaris.cpp:237 quest != 648 → no-op',
    };
  }
  return {
    handled: true,
    textId: SAY_OOX_START,
    standState: UNIT_STAND_STATE_STAND,
    factionId: FACTION_ESCORT_N_FRIEND_ACTIVE,
    factionFlags: OOX_TEMP_FACTION_FLAGS,
    setActive: true,
    startEscort: true,
    questId: QUEST_RESCUE_OOX_17TN,
    cite:
      'tanaris.cpp:239-245 SAY_OOX_START + active + STAND + faction 495 flags 0x21 + Start(false)',
  };
}

export interface Oox17tnResetResult {
  standState: number | null;
  cite: string;
}

/** Port of Reset — DEAD stand when not escorting. Cite: tanaris.cpp:196–200 */
export function oox17tnReset(escorting: boolean): Oox17tnResetResult {
  if (!escorting) {
    return {
      standState: UNIT_STAND_STATE_DEAD,
      cite: 'tanaris.cpp:198-199 !escorting → UNIT_STAND_STATE_DEAD',
    };
  }
  return {
    standState: null,
    cite: 'tanaris.cpp:198 escorting → keep stand',
  };
}

export interface Oox17tnAggroResult {
  textId: number | null;
  cite: string;
}

// Port of the Aggro random yell — urand(0,9), cases 0 and 1.
// Cite: tanaris.cpp:202–210.
export function oox17tnAggro(roll09: number): Oox17tnAggroResult {
  const r = roll09 | 0;
  if (r === 0) {
    return {
      textId: SAY_OOX_AGGRO1,
      cite: 'tanaris.cpp:207 case 0 SAY_OOX_AGGRO1',
    };
  }
  if (r === 1) {
    return {
      textId: SAY_OOX_AGGRO2,
      cite: 'tanaris.cpp:208 case 1 SAY_OOX_AGGRO2',
    };
  }
  return {
    textId: null,
    cite: 'tanaris.cpp:205-209 urand 2-9 → silent',
  };
}

export interface Oox17tnWaypointResult {
  handled: boolean;
  textId: number | null;
  summons: ReadonlyArray<{
    creatureEntry: number;
    x: number;
    y: number;
    z: number;
    o: number;
    despawnMs: number;
    replyTextId: number | null;
  }>;
  exploreQuestId: number | null;
  cite: string;
}

/** Port of WaypointReached ambush / end. Cite: tanaris.cpp:161–194 */
export function oox17tnWaypointReached(pointId: number): Oox17tnWaypointResult {
  switch (pointId | 0) {
    case 23:
      return {
        handled: true,
        textId: SAY_OOX_AMBUSH,
        summons: OOX_WP23_SPAWNS.map((s) => ({
          creatureEntry: s.entry,
          x: s.x,
          y: s.y,
          z: s.z,
          o: s.o,
          despawnMs: s.despawnMs,
          replyTextId: null,
        })),
        exploreQuestId: null,
        cite: 'tanaris.cpp:171-176 WP23 SAY_OOX_AMBUSH + 3× Scorpid 7803',
      };
    case 29:
      return {
        handled: true,
        textId: SAY_OOX_AMBUSH,
        summons: OOX_WP29_SPAWNS.map((s) => ({
          creatureEntry: s.entry,
          x: s.x,
          y: s.y,
          z: s.z,
          o: s.o,
          despawnMs: s.despawnMs,
          replyTextId: s.replyTextId,
        })),
        exploreQuestId: null,
        cite: 'tanaris.cpp:178-186 WP29 SAY_OOX_AMBUSH + 2× Scofflaw 7805 + Shadow Mage 5617 + reply',
      };
    case 35:
      return {
        handled: true,
        textId: SAY_OOX_END,
        summons: [],
        exploreQuestId: QUEST_RESCUE_OOX_17TN,
        cite: 'tanaris.cpp:188-192 WP35 SAY_OOX_END + explore credit 648',
      };
    default:
      return {
        handled: false,
        textId: null,
        summons: [],
        exploreQuestId: null,
        cite: 'tanaris.cpp:168-193 no special waypoint action',
      };
  }
}

export interface Oox17tnJustSummonedResult {
  attackStartOox: boolean;
  trackGuid: boolean;
  cite: string;
}

/** Port of JustSummoned. Cite: tanaris.cpp:212–216 */
export function oox17tnJustSummoned(): Oox17tnJustSummonedResult {
  return {
    attackStartOox: true,
    trackGuid: true,
    cite: 'tanaris.cpp:214-215 AttackStart(m_creature) + push guid list',
  };
}

export interface Oox17tnJustDiedResult {
  forceDespawnTracked: boolean;
  cite: string;
}

/** Port of JustDied summon cleanup. Cite: tanaris.cpp:218–227 */
export function oox17tnJustDied(): Oox17tnJustDiedResult {
  return {
    forceDespawnTracked: true,
    cite: 'tanaris.cpp:220-224 ForcedDespawn all tracked ambush guids',
  };
}

// Pure helpers — npc_tooga

export interface ToogaQuestAcceptResult {
  handled: boolean;
  startFollow: boolean;
  factionId: number;
  questId: number;
  cite: string;
}

/** Port of QuestAccept_npc_tooga. Cite: tanaris.cpp:398–407 */
export function toogaQuestAccept(questId: number): ToogaQuestAcceptResult {
  if ((questId | 0) !== QUEST_TOOGA) {
    return {
      handled: false,
      startFollow: false,
      factionId: 0,
      questId: 0,
      cite: 'tanaris.cpp:400 quest != 1560 → no-op',
    };
  }
  return {
    handled: true,
    startFollow: true,
    factionId: FACTION_ESCORT_N_FRIEND_PASSIVE,
    questId: QUEST_TOOGA,
    cite: 'tanaris.cpp:402-403 StartFollow(player, FACTION_ESCORT_N_FRIEND_PASSIVE=290, quest)',
  };
}

export interface ToogaResetResult {
  checkSpeechTimerMs: number;
  postEventTimerMs: number;
  phasePostEvent: number;
  tortaPresent: boolean;
  cite: string;
}

/** Port of npc_toogaAI::Reset. Cite: tanaris.cpp:283–290 */
export function toogaReset(): ToogaResetResult {
  return {
    checkSpeechTimerMs: TOOGA_SPEECH_INIT_MS,
    postEventTimerMs: TOOGA_POST_EVENT_INIT_MS,
    phasePostEvent: 0,
    tortaPresent: false,
    cite: 'tanaris.cpp:285-289 speech 2500 + post 1000 + phase 0 + pTorta null',
  };
}

export interface ToogaTortaLosResult {
  handled: boolean;
  exploreQuestId: number | null;
  followCompleteWithPostEvent: boolean;
  cite: string;
}

// Port of the MoveInLineOfSight Torta completion gate.
// Cite: tanaris.cpp:292–310.
export function toogaTortaLos(
  hasVictim: boolean,
  followCompleteOrPost: boolean,
  whoEntry: number,
  distYd: number,
  questIncomplete: boolean,
): ToogaTortaLosResult {
  if (hasVictim || followCompleteOrPost) {
    return {
      handled: false,
      exploreQuestId: null,
      followCompleteWithPostEvent: false,
      cite: 'tanaris.cpp:296 victim or follow complete/post → skip',
    };
  }
  if ((whoEntry | 0) !== NPC_TORTA) {
    return {
      handled: false,
      exploreQuestId: null,
      followCompleteWithPostEvent: false,
      cite: 'tanaris.cpp:296 entry != NPC_TORTA → skip',
    };
  }
  if (distYd > INTERACTION_DISTANCE) {
    return {
      handled: false,
      exploreQuestId: null,
      followCompleteWithPostEvent: false,
      cite: 'tanaris.cpp:298 dist > INTERACTION_DISTANCE → skip',
    };
  }
  return {
    handled: true,
    exploreQuestId: questIncomplete ? QUEST_TOOGA : null,
    followCompleteWithPostEvent: true,
    cite: questIncomplete
      ? 'tanaris.cpp:300-308 incomplete → explore 1560 + pTorta + SetFollowComplete(true)'
      : 'tanaris.cpp:300-308 complete/other → pTorta + SetFollowComplete(true) no explore',
  };
}

export interface ToogaSpeechTickResult {
  nextTimerMs: number;
  fire: boolean;
  textId: number | null;
  cite: string;
}

// Port of the UpdateFollowerAI follow-in-progress speech check; `roll050` is urand(0,50).
// Cite: tanaris.cpp:370–383.
export function toogaSpeechTick(
  followInProgress: boolean,
  timerMs: number,
  diffMs: number,
  roll050: number,
): ToogaSpeechTickResult {
  if (!followInProgress) {
    return {
      nextTimerMs: timerMs,
      fire: false,
      textId: null,
      cite: 'tanaris.cpp:370 !STATE_FOLLOW_INPROGRESS → skip speech',
    };
  }
  // Cite: tanaris.cpp:372–383 if (m_uiCheckSpeechTimer < uiDiff) else -=
  if (!(timerMs < diffMs)) {
    return {
      nextTimerMs: timerMs - diffMs,
      fire: false,
      textId: null,
      cite: 'tanaris.cpp:382-383 m_uiCheckSpeechTimer -= uiDiff',
    };
  }
  const r = roll050 | 0;
  let textId: number | null = null;
  let cite = 'tanaris.cpp:374-379 re-arm 5000; urand silent';
  if (r === TOOGA_SPEECH_ROLL_THIRST) {
    textId = SAY_TOOG_THIRST;
    cite = 'tanaris.cpp:374-378 re-arm 5000; case 10 SAY_TOOG_THIRST';
  } else if (r === TOOGA_SPEECH_ROLL_WORRIED) {
    textId = SAY_TOOG_WORRIED;
    cite = 'tanaris.cpp:374-379 re-arm 5000; case 25 SAY_TOOG_WORRIED';
  } else if (r < 0 || r > TOOGA_SPEECH_ROLL_MAX) {
    cite = 'tanaris.cpp:376 urand(0,50) out of range (caller error)';
  }
  return {
    nextTimerMs: TOOGA_SPEECH_REPEAT_MS,
    fire: true,
    textId,
    cite,
  };
}

export type ToogaPostSpeaker = 'tooga' | 'torta';

export interface ToogaPostEventTickResult {
  nextTimerMs: number;
  nextPhase: number;
  fire: boolean;
  textId: number | null;
  speaker: ToogaPostSpeaker | null;
  /** MovePoint to water after phase 6 dialogue. */
  moveToWater: boolean;
  waterX: number | null;
  waterY: number | null;
  waterZ: number | null;
  /** Torta dead/missing → SetFollowComplete() without post. */
  abortComplete: boolean;
  cite: string;
}

// Port of the UpdateFollowerAI STATE_FOLLOW_POSTEVENT phase machine.
// Cite: tanaris.cpp:328–367.
export function toogaPostEventTick(
  postEvent: boolean,
  timerMs: number,
  diffMs: number,
  phase: number,
  tortaAlive: boolean,
): ToogaPostEventTickResult {
  if (!postEvent) {
    return {
      nextTimerMs: timerMs,
      nextPhase: phase,
      fire: false,
      textId: null,
      speaker: null,
      moveToWater: false,
      waterX: null,
      waterY: null,
      waterZ: null,
      abortComplete: false,
      cite: 'tanaris.cpp:328 !STATE_FOLLOW_POSTEVENT → skip',
    };
  }
  if (!(timerMs < diffMs)) {
    return {
      nextTimerMs: timerMs - diffMs,
      nextPhase: phase,
      fire: false,
      textId: null,
      speaker: null,
      moveToWater: false,
      waterX: null,
      waterY: null,
      waterZ: null,
      abortComplete: false,
      cite: 'tanaris.cpp:366-367 m_uiPostEventTimer -= uiDiff',
    };
  }
  if (!tortaAlive) {
    return {
      nextTimerMs: TOOGA_POST_EVENT_REPEAT_MS,
      nextPhase: phase,
      fire: false,
      textId: null,
      speaker: null,
      moveToWater: false,
      waterX: null,
      waterY: null,
      waterZ: null,
      abortComplete: true,
      cite: 'tanaris.cpp:334-338 !pTorta || dead → SetFollowComplete()',
    };
  }

  const p = phase | 0;
  let textId: number | null = null;
  let speaker: ToogaPostSpeaker | null = null;
  let moveToWater = false;
  let cite = `tanaris.cpp:341-362 phase ${p}`;

  switch (p) {
    case 1:
      textId = SAY_TOOG_POST_1;
      speaker = 'tooga';
      cite = 'tanaris.cpp:343-345 case 1 SAY_TOOG_POST_1';
      break;
    case 2:
      textId = SAY_TORT_POST_2;
      speaker = 'torta';
      cite = 'tanaris.cpp:346-348 case 2 SAY_TORT_POST_2';
      break;
    case 3:
      textId = SAY_TOOG_POST_3;
      speaker = 'tooga';
      cite = 'tanaris.cpp:349-351 case 3 SAY_TOOG_POST_3';
      break;
    case 4:
      textId = SAY_TORT_POST_4;
      speaker = 'torta';
      cite = 'tanaris.cpp:352-354 case 4 SAY_TORT_POST_4';
      break;
    case 5:
      textId = SAY_TOOG_POST_5;
      speaker = 'tooga';
      cite = 'tanaris.cpp:355-357 case 5 SAY_TOOG_POST_5';
      break;
    case 6:
      textId = SAY_TORT_POST_6;
      speaker = 'torta';
      moveToWater = true;
      cite = 'tanaris.cpp:358-361 case 6 SAY_TORT_POST_6 + MovePoint water';
      break;
    default:
      cite = 'tanaris.cpp:341-362 phase 0 or >6 → re-arm only (phase ++)';
      break;
  }

  return {
    nextTimerMs: TOOGA_POST_EVENT_REPEAT_MS,
    nextPhase: p + 1,
    fire: true,
    textId,
    speaker,
    moveToWater,
    waterX: moveToWater ? TOOGA_TO_WATER_LOC.x : null,
    waterY: moveToWater ? TOOGA_TO_WATER_LOC.y : null,
    waterZ: moveToWater ? TOOGA_TO_WATER_LOC.z : null,
    abortComplete: false,
    cite,
  };
}

export interface ToogaMovementInformResult {
  handled: boolean;
  followComplete: boolean;
  cite: string;
}

// Port of MovementInform on water arrival, POINT_MOTION_TYPE only.
// Cite: tanaris.cpp:312–321.
export function toogaMovementInform(
  isPointMotion: boolean,
  pointId: number,
): ToogaMovementInformResult {
  if (!isPointMotion) {
    return {
      handled: false,
      followComplete: false,
      cite: 'tanaris.cpp:316-317 motionType != POINT_MOTION_TYPE → return',
    };
  }
  if ((pointId | 0) !== POINT_ID_TO_WATER) {
    return {
      handled: false,
      followComplete: false,
      cite: 'tanaris.cpp:319 pointId != POINT_ID_TO_WATER → no-op',
    };
  }
  return {
    handled: true,
    followComplete: true,
    cite: 'tanaris.cpp:319-320 POINT_ID_TO_WATER → SetFollowComplete()',
  };
}
