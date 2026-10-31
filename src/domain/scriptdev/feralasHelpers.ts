// Feralas ScriptDev pure helpers (SESSION 10 batch). Companion to feralas.ts IR exports. Cite:
// kalimdor/feralas.cpp; world_kalimdor.h/.cpp

import { INSTANCE_DATA } from './types.ts';
import {
  AI_EVENT_CUSTOM_A,
  AI_EVENT_START_EVENT,
  CAGE_SEARCH_YD,
  EMOTE_WANDER,
  FACTION_ESCORT_A_NEUTRAL_ACTIVE,
  FACTION_ESCORT_N_FRIEND_ACTIVE,
  FREEDOM_CREATURES_DONE_COUNT,
  INTERACTION_DISTANCE,
  KINDAL_COMPLETE_DESPAWN_MS,
  KINDAL_COMPLETION_CHECK_MS,
  KINDAL_FLEE_HP_PCT,
  KINDAL_MULTI_SHOT_INIT_MAX_MS,
  KINDAL_MULTI_SHOT_INIT_MIN_MS,
  KINDAL_SHOOT_INIT_MAX_MS,
  KINDAL_SHOOT_INIT_MIN_MS,
  NPC_GRIMTOTEM_RAIDER,
  NPC_ROCKBITER,
  OOX_AMBUSH_CORPSE_DESPAWN_MS,
  OOX_TEMP_FACTION_FLAGS,
  OOX_WP12_SPAWNS,
  OOX_WP22_SPAWNS,
  OOX_WP31_SPAWNS,
  QUEST_FREEDOM_ALL_CREATURES,
  QUEST_ID_WANDERING_SHAY,
  QUEST_RESCUE_OOX22FE,
  RAIDER_DESPAWN_MS,
  RAIDER_SPAWN_POS,
  SAY_EVENT_COMPLETE_1,
  SAY_EVENT_COMPLETE_2,
  SAY_KINDAL_AGGRO,
  SAY_KINDAL_INITIAL_AGGRO,
  SAY_KINDAL_QUEST_COMPLETE,
  SAY_KINDAL_QUEST_START,
  SAY_OOX_AGGRO1,
  SAY_OOX_AGGRO2,
  SAY_OOX_AMBUSH,
  SAY_OOX_END,
  SAY_OOX_START,
  SAY_SHAY_ESCORT_START,
  SHAY_COMPLETE_DESPAWN_MS,
  SHAY_ROCKBITER_LOS_YD,
  SHAY_WANDER_DONE_TEXTS,
  SHAY_WANDER_INIT_MS,
  SHAY_WANDER_RECALL_MS,
  SHAY_WANDER_TEXTS,
  SPRITE_ESCORT_END_WP,
  SPRITE_MANA_BURN_INIT_MAX_MS,
  SPRITE_MANA_BURN_INIT_MIN_MS,
  TYPE_FREEDOM_CREATURES,
  UNIT_STAND_STATE_DEAD,
  UNIT_STAND_STATE_STAND,
} from './feralas.ts';

// Pure helpers — TYPE_FREEDOM_CREATURES map counter
// ---------------------------------------------------------------------------

export interface FreedomCreaturesSetDataResult {
  storedValue: number;
  freedCount: number;
  cite: string;
}

// Port of world_map_kalimdor SetData TYPE_FREEDOM_CREATURES.
// Cite: world_kalimdor.cpp:375–383.
export function freedomCreaturesSetData(
  data: number,
  freedBefore: number,
): FreedomCreaturesSetDataResult {
  if ((data | 0) === INSTANCE_DATA.IN_PROGRESS) {
    return {
      storedValue: INSTANCE_DATA.IN_PROGRESS,
      freedCount: 0,
      cite: 'world_kalimdor.cpp:376-377 IN_PROGRESS → m_freedSpriteDarter=0',
    };
  }
  if ((data | 0) === INSTANCE_DATA.SPECIAL) {
    const freed = (freedBefore | 0) + 1;
    if (freed >= FREEDOM_CREATURES_DONE_COUNT) {
      return {
        storedValue: INSTANCE_DATA.DONE,
        freedCount: freed,
        cite: 'world_kalimdor.cpp:378-382 SPECIAL ++count; ≥6 → DONE',
      };
    }
    return {
      storedValue: INSTANCE_DATA.SPECIAL,
      freedCount: freed,
      cite: 'world_kalimdor.cpp:378-380 SPECIAL ++count; <6 keep SPECIAL',
    };
  }
  return {
    storedValue: data | 0,
    freedCount: freedBefore | 0,
    cite: 'world_kalimdor.cpp:386 m_encounter[uiType]=uiData (passthrough)',
  };
}

// Pure helpers — npc_oox22fe

export interface OoxQuestAcceptResult {
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

/** Port of QuestAccept_npc_oox22fe. Cite: feralas.cpp:143–156 */
export function ooxQuestAccept(questId: number): OoxQuestAcceptResult {
  if ((questId | 0) !== QUEST_RESCUE_OOX22FE) {
    return {
      handled: false,
      textId: null,
      standState: UNIT_STAND_STATE_DEAD,
      factionId: 0,
      factionFlags: 0,
      setActive: false,
      startEscort: false,
      questId: 0,
      cite: 'feralas.cpp:145 quest != 2767 → no-op',
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
    questId: QUEST_RESCUE_OOX22FE,
    cite:
      'feralas.cpp:147-153 SAY_OOX_START + active + STAND + faction 495 flags 0x21 + Start(false)',
  };
}

export interface OoxResetResult {
  standState: number | null;
  cite: string;
}

/** Port of Reset — DEAD stand when not escorting. Cite: feralas.cpp:104–108 */
export function ooxReset(escorting: boolean): OoxResetResult {
  if (!escorting) {
    return {
      standState: UNIT_STAND_STATE_DEAD,
      cite: 'feralas.cpp:106-107 !escorting → UNIT_STAND_STATE_DEAD',
    };
  }
  return {
    standState: null,
    cite: 'feralas.cpp:106 escorting → keep stand',
  };
}

export interface OoxAggroResult {
  textId: number | null;
  cite: string;
}

// Port of the Aggro random yell — urand(0,9), cases 0 and 1.
// Cite: feralas.cpp:110–118.
export function ooxAggro(roll09: number): OoxAggroResult {
  const r = roll09 | 0;
  if (r === 0) {
    return {
      textId: SAY_OOX_AGGRO1,
      cite: 'feralas.cpp:115 case 0 SAY_OOX_AGGRO1',
    };
  }
  if (r === 1) {
    return {
      textId: SAY_OOX_AGGRO2,
      cite: 'feralas.cpp:116 case 1 SAY_OOX_AGGRO2',
    };
  }
  return {
    textId: null,
    cite: 'feralas.cpp:113-117 urand 2-9 → silent',
  };
}

export interface OoxWaypointResult {
  handled: boolean;
  textId: number | null;
  summons: ReadonlyArray<{
    creatureEntry: number;
    x: number;
    y: number;
    z: number;
    o: number;
    despawnMs: number;
  }>;
  exploreQuestId: number | null;
  cite: string;
}

/** Port of WaypointReached ambush / end. Cite: feralas.cpp:69–101 */
export function ooxWaypointReached(pointId: number): OoxWaypointResult {
  switch (pointId | 0) {
    case 12:
      return {
        handled: true,
        textId: SAY_OOX_AMBUSH,
        summons: OOX_WP12_SPAWNS.map((s) => ({
          creatureEntry: s.entry,
          x: s.x,
          y: s.y,
          z: s.z,
          o: s.o,
          despawnMs: OOX_AMBUSH_CORPSE_DESPAWN_MS,
        })),
        exploreQuestId: null,
        cite: 'feralas.cpp:74-78 WP12 SAY_OOX_AMBUSH + 3× Yeti 7848',
      };
    case 22:
      return {
        handled: true,
        textId: SAY_OOX_AMBUSH,
        summons: OOX_WP22_SPAWNS.map((s) => ({
          creatureEntry: s.entry,
          x: s.x,
          y: s.y,
          z: s.z,
          o: s.o,
          despawnMs: OOX_AMBUSH_CORPSE_DESPAWN_MS,
        })),
        exploreQuestId: null,
        cite: 'feralas.cpp:81-85 WP22 SAY_OOX_AMBUSH + 3× Gorilla 5260',
      };
    case 31:
      return {
        handled: true,
        textId: SAY_OOX_AMBUSH,
        summons: OOX_WP31_SPAWNS.map((s) => ({
          creatureEntry: s.entry,
          x: s.x,
          y: s.y,
          z: s.z,
          o: s.o,
          despawnMs: OOX_AMBUSH_CORPSE_DESPAWN_MS,
        })),
        exploreQuestId: null,
        cite:
          'feralas.cpp:88-93 WP31 SAY_OOX_AMBUSH + Reaver/Brute/Mystic/Alpha',
      };
    case 38:
      return {
        handled: true,
        textId: SAY_OOX_END,
        summons: [],
        exploreQuestId: QUEST_RESCUE_OOX22FE,
        cite: 'feralas.cpp:95-99 WP38 SAY_OOX_END + explore 2767',
      };
    default:
      return {
        handled: false,
        textId: null,
        summons: [],
        exploreQuestId: null,
        cite: 'feralas.cpp:71 unknown WP → no-op',
      };
  }
}

export interface OoxJustSummonedResult {
  attackStartOox: boolean;
  trackGuid: boolean;
  cite: string;
}

/** Port of JustSummoned — ambush attacks OOX + track guid. Cite: feralas.cpp:120–125 */
export function ooxJustSummoned(): OoxJustSummonedResult {
  return {
    attackStartOox: true,
    trackGuid: true,
    cite: 'feralas.cpp:122-123 AttackStart(m_creature) + push guid',
  };
}

export interface OoxJustDiedResult {
  forceDespawnTracked: boolean;
  cite: string;
}

/** Port of JustDied — force-despawn tracked ambush summons. Cite: feralas.cpp:127–135 */
export function ooxJustDied(): OoxJustDiedResult {
  return {
    forceDespawnTracked: true,
    cite: 'feralas.cpp:129-132 ForcedDespawn all tracked ambush guids',
  };
}

// Pure helpers — npc_shay_leafrunner

export interface ShayQuestAcceptResult {
  handled: boolean;
  textId: number | null;
  eventType: number;
  questId: number;
  cite: string;
}

/** Port of QuestAccept_npc_shay_leafrunner. Cite: feralas.cpp:296–304 */
export function shayQuestAccept(questId: number): ShayQuestAcceptResult {
  if ((questId | 0) !== QUEST_ID_WANDERING_SHAY) {
    return {
      handled: false,
      textId: null,
      eventType: 0,
      questId: 0,
      cite: 'feralas.cpp:298 quest != 2845 → no-op',
    };
  }
  return {
    handled: true,
    textId: SAY_SHAY_ESCORT_START,
    eventType: AI_EVENT_START_EVENT,
    questId: QUEST_ID_WANDERING_SHAY,
    cite:
      'feralas.cpp:300-301 SAY_ESCORT_START + SendAIEvent START_EVENT quest 2845',
  };
}

export interface ShayStartEventResult {
  removeImmuneToNpc: boolean;
  startFollow: boolean;
  wanderTimerMs: number;
  cite: string;
}

/** Port of ReceiveAIEvent AI_EVENT_START_EVENT. Cite: feralas.cpp:241–246 */
export function shayStartEvent(invokerIsPlayer: boolean): ShayStartEventResult {
  if (!invokerIsPlayer) {
    return {
      removeImmuneToNpc: false,
      startFollow: false,
      wanderTimerMs: 0,
      cite: 'feralas.cpp:241 invoker not player → no-op',
    };
  }
  return {
    removeImmuneToNpc: true,
    startFollow: true,
    wanderTimerMs: SHAY_WANDER_INIT_MS,
    cite:
      'feralas.cpp:243-245 strip IMMUNE_TO_NPC + StartFollow + wander 30000',
  };
}

export interface ShayBellResult {
  eventType: number;
  setRecalled: boolean;
  unpauseFollow: boolean;
  cite: string;
}

/** Port of ShaysBell OnEffectExecute + ReceiveAIEvent CUSTOM_A. Cite: feralas.cpp:306–317,247–252 */
export function shaysBellOnEffect(casterIsPlayer: boolean): ShayBellResult {
  if (!casterIsPlayer) {
    return {
      eventType: 0,
      setRecalled: false,
      unpauseFollow: false,
      cite: 'feralas.cpp:312 !player caster → no-op',
    };
  }
  return {
    eventType: AI_EVENT_CUSTOM_A,
    setRecalled: true,
    unpauseFollow: true,
    cite:
      'feralas.cpp:315 SendAIEvent CUSTOM_A; :250-251 m_bIsRecalled + SetFollowPaused(false)',
  };
}

export interface ShayWanderTickResult {
  fire: boolean;
  pauseFollow: boolean;
  emoteId: number | null;
  textId: number | null;
  remainingMs: number;
  cite: string;
}

// Port of the OOC wander timer in UpdateFollowerAI.
// Cite: feralas.cpp:257–282.
export function shayWanderTick(
  hasVictim: boolean,
  wanderTimerMs: number,
  diffMs: number,
  textIdx: number,
): ShayWanderTickResult {
  if (hasVictim) {
    return {
      fire: false,
      pauseFollow: false,
      emoteId: null,
      textId: null,
      remainingMs: wanderTimerMs,
      cite: 'feralas.cpp:257-285 has victim → melee path, no wander',
    };
  }
  if (!(wanderTimerMs | 0)) {
    return {
      fire: false,
      pauseFollow: false,
      emoteId: null,
      textId: null,
      remainingMs: 0,
      cite: 'feralas.cpp:259 m_uiWanderTimer==0 → idle',
    };
  }
  if (wanderTimerMs <= diffMs) {
    const idx = ((textIdx | 0) % 4 + 4) % 4;
    return {
      fire: true,
      pauseFollow: true,
      emoteId: EMOTE_WANDER,
      textId: SHAY_WANDER_TEXTS[idx]!,
      remainingMs: 0,
      cite:
        'feralas.cpp:261-274 pause follow + EMOTE_WANDER + random SAY_WANDER + MoveRandom',
    };
  }
  return {
    fire: false,
    pauseFollow: false,
    emoteId: null,
    textId: null,
    remainingMs: wanderTimerMs - diffMs,
    cite: 'feralas.cpp:281 m_uiWanderTimer -= uiDiff',
  };
}

export interface ShayRecallLosResult {
  handled: boolean;
  wanderTimerMs: number;
  clearRecalled: boolean;
  textId: number | null;
  cite: string;
}

// Port of the MoveInLineOfSight recalled-player branch.
// Cite: feralas.cpp:224–235.
export function shayRecallPlayerLos(
  isRecalled: boolean,
  whoIsPlayer: boolean,
  distYd: number,
  textIdx: number,
): ShayRecallLosResult {
  if (!isRecalled || !whoIsPlayer || distYd > INTERACTION_DISTANCE) {
    return {
      handled: false,
      wanderTimerMs: 0,
      clearRecalled: false,
      textId: null,
      cite: 'feralas.cpp:224 gates fail → no recall complete',
    };
  }
  const idx = ((textIdx | 0) % 3 + 3) % 3;
  return {
    handled: true,
    wanderTimerMs: SHAY_WANDER_RECALL_MS,
    clearRecalled: true,
    textId: SHAY_WANDER_DONE_TEXTS[idx]!,
    cite:
      'feralas.cpp:226-233 wander 60000 + clear recalled + random SAY_WANDER_DONE',
  };
}

export interface ShayRockbiterLosResult {
  handled: boolean;
  textIdShay: number | null;
  textIdRockbiter: number | null;
  exploreQuestId: number | null;
  followComplete: boolean;
  forceDespawnMs: number;
  setComplete: boolean;
  clearWander: boolean;
  cite: string;
}

/** Port of MoveInLineOfSight Rockbiter complete branch. Cite: feralas.cpp:203–223 */
export function shayRockbiterLos(
  isComplete: boolean,
  whoEntry: number,
  distYd: number,
  hasLeader: boolean,
): ShayRockbiterLosResult {
  if (
    isComplete
    || (whoEntry | 0) !== NPC_ROCKBITER
    || distYd > SHAY_ROCKBITER_LOS_YD
    || !hasLeader
  ) {
    return {
      handled: false,
      textIdShay: null,
      textIdRockbiter: null,
      exploreQuestId: null,
      followComplete: false,
      forceDespawnMs: 0,
      setComplete: false,
      clearWander: false,
      cite: 'feralas.cpp:203-207 gates fail → no complete',
    };
  }
  return {
    handled: true,
    textIdShay: SAY_EVENT_COMPLETE_1,
    textIdRockbiter: SAY_EVENT_COMPLETE_2,
    exploreQuestId: QUEST_ID_WANDERING_SHAY,
    followComplete: true,
    forceDespawnMs: SHAY_COMPLETE_DESPAWN_MS,
    setComplete: true,
    clearWander: true,
    cite:
      'feralas.cpp:209-217 SAY complete + explore 2845 + SetFollowComplete + ForcedDespawn(30000)',
  };
}

// Pure helpers — npc_captured_sprite_darter

export interface SpriteResetResult {
  manaBurnTimerMinMs: number;
  manaBurnTimerMaxMs: number;
  waypointSetMin: number;
  waypointSetMax: number;
  cite: string;
}

/** Port of Reset mana burn + random flight path 0–3. Cite: feralas.cpp:357–362 */
export function spriteDarterReset(): SpriteResetResult {
  return {
    manaBurnTimerMinMs: SPRITE_MANA_BURN_INIT_MIN_MS,
    manaBurnTimerMaxMs: SPRITE_MANA_BURN_INIT_MAX_MS,
    waypointSetMin: 0,
    waypointSetMax: 3,
    cite:
      'feralas.cpp:359-361 manaBurn urand(3-6)s + SetEscortWaypoints(urand(0,3))',
  };
}

export interface SpriteWaypointResult {
  handled: boolean;
  setDataField: number | null;
  setDataValue: number | null;
  forceDespawn: boolean;
  cite: string;
}

/** Port of WaypointReached end free credit. Cite: feralas.cpp:364–372 */
export function spriteDarterWaypointReached(pointId: number): SpriteWaypointResult {
  if ((pointId | 0) !== SPRITE_ESCORT_END_WP) {
    return {
      handled: false,
      setDataField: null,
      setDataValue: null,
      forceDespawn: false,
      cite: 'feralas.cpp:367 pointId != 8 → no-op',
    };
  }
  return {
    handled: true,
    setDataField: TYPE_FREEDOM_CREATURES,
    setDataValue: INSTANCE_DATA.SPECIAL,
    forceDespawn: true,
    cite:
      'feralas.cpp:369-370 SetData(TYPE_FREEDOM_CREATURES, SPECIAL) + ForcedDespawn',
  };
}

// Pure helpers — go_cage_door

export interface CageDoorUseResult {
  setDataField: number;
  setDataValue: number;
  spriteFactionId: number;
  spriteSearchYd: number;
  startSpriteEscort: boolean;
  summonRaiderEntry: number;
  raiderX: number;
  raiderY: number;
  raiderZ: number;
  raiderO: number;
  raiderDespawnMs: number;
  kindalSearchYd: number;
  kindalTextId: number;
  kindalAttackRaider: boolean;
  cite: string;
}

// Port of GOUse_go_cage_door. Cite: feralas.cpp:403–437 Map script presence is assumed (product outdoor map
// host); cpp returns false when GetInstanceData is null — pure helper documents the success path.
export function cageDoorUse(): CageDoorUseResult {
  return {
    setDataField: TYPE_FREEDOM_CREATURES,
    setDataValue: INSTANCE_DATA.IN_PROGRESS,
    spriteFactionId: FACTION_ESCORT_N_FRIEND_ACTIVE,
    spriteSearchYd: CAGE_SEARCH_YD,
    startSpriteEscort: true,
    summonRaiderEntry: NPC_GRIMTOTEM_RAIDER,
    raiderX: RAIDER_SPAWN_POS.x,
    raiderY: RAIDER_SPAWN_POS.y,
    raiderZ: RAIDER_SPAWN_POS.z,
    raiderO: RAIDER_SPAWN_POS.o,
    raiderDespawnMs: RAIDER_DESPAWN_MS,
    kindalSearchYd: CAGE_SEARCH_YD,
    kindalTextId: SAY_KINDAL_INITIAL_AGGRO,
    kindalAttackRaider: true,
    cite:
      'feralas.cpp:412-434 SetData IN_PROGRESS + sprites faction/escort + raider 7725 + Kindal aggro',
  };
}

// Pure helpers — npc_kindal_moonweaver

export interface KindalQuestAcceptResult {
  handled: boolean;
  startFollow: boolean;
  factionId: number;
  textId: number | null;
  standState: number;
  setImmuneToNpcFalse: boolean;
  questId: number;
  cite: string;
}

/** Port of QuestAccept_npc_kindal_moonweaver. Cite: feralas.cpp:561–573 */
export function kindalQuestAccept(questId: number): KindalQuestAcceptResult {
  if ((questId | 0) !== QUEST_FREEDOM_ALL_CREATURES) {
    return {
      handled: false,
      startFollow: false,
      factionId: 0,
      textId: null,
      standState: UNIT_STAND_STATE_STAND,
      setImmuneToNpcFalse: false,
      questId: 0,
      cite: 'feralas.cpp:563 quest != 2969 → no-op',
    };
  }
  return {
    handled: true,
    startFollow: true,
    factionId: FACTION_ESCORT_A_NEUTRAL_ACTIVE,
    textId: SAY_KINDAL_QUEST_START,
    standState: UNIT_STAND_STATE_STAND,
    setImmuneToNpcFalse: true,
    questId: QUEST_FREEDOM_ALL_CREATURES,
    cite:
      'feralas.cpp:565-569 StartFollow faction 231 + SAY start + STAND + immune NPC false',
  };
}

export interface KindalResetResult {
  checkCompletionMs: number;
  despawnTimerMs: number;
  shootMinMs: number;
  shootMaxMs: number;
  multiShotMinMs: number;
  multiShotMaxMs: number;
  hasFleed: boolean;
  cite: string;
}

/** Port of Reset timers. Cite: feralas.cpp:458–465 */
export function kindalReset(): KindalResetResult {
  return {
    checkCompletionMs: KINDAL_COMPLETION_CHECK_MS,
    despawnTimerMs: 0,
    shootMinMs: KINDAL_SHOOT_INIT_MIN_MS,
    shootMaxMs: KINDAL_SHOOT_INIT_MAX_MS,
    multiShotMinMs: KINDAL_MULTI_SHOT_INIT_MIN_MS,
    multiShotMaxMs: KINDAL_MULTI_SHOT_INIT_MAX_MS,
    hasFleed: false,
    cite:
      'feralas.cpp:460-464 check 1s, despawn 0, shoot 2-4s, multi 8-11s, hasFleed=false',
  };
}

export interface KindalAggroResult {
  textId: number | null;
  cite: string;
}

/** Port of Aggro yell (urand 0–3, only 0 speaks). Cite: feralas.cpp:467–471 */
export function kindalAggro(roll03: number): KindalAggroResult {
  if ((roll03 | 0) === 0) {
    return {
      textId: SAY_KINDAL_AGGRO,
      cite: 'feralas.cpp:469-470 !urand(0,3) → SAY_KINDAL_AGGRO',
    };
  }
  return {
    textId: null,
    cite: 'feralas.cpp:469 urand 1-3 → silent',
  };
}

export interface KindalCompletionPollResult {
  handled: boolean;
  resetDataToNotStarted: boolean;
  exploreQuestId: number | null;
  textId: number | null;
  despawnTimerMs: number;
  followComplete: boolean;
  cite: string;
}

// Port of the follow-completion poll against map DONE.
// Cite: feralas.cpp:475–494.
export function kindalCompletionPoll(
  followInProgress: boolean,
  mapData: number,
  questIncomplete: boolean,
): KindalCompletionPollResult {
  if (!followInProgress) {
    return {
      handled: false,
      resetDataToNotStarted: false,
      exploreQuestId: null,
      textId: null,
      despawnTimerMs: 0,
      followComplete: false,
      cite: 'feralas.cpp:475 !follow → skip poll',
    };
  }
  if ((mapData | 0) !== INSTANCE_DATA.DONE) {
    return {
      handled: false,
      resetDataToNotStarted: false,
      exploreQuestId: null,
      textId: null,
      despawnTimerMs: 0,
      followComplete: false,
      cite: 'feralas.cpp:480 GetData != DONE → wait',
    };
  }
  return {
    handled: true,
    resetDataToNotStarted: true,
    exploreQuestId: questIncomplete ? QUEST_FREEDOM_ALL_CREATURES : null,
    textId: SAY_KINDAL_QUEST_COMPLETE,
    despawnTimerMs: KINDAL_COMPLETE_DESPAWN_MS,
    followComplete: true,
    cite:
      'feralas.cpp:482-490 SetData NOT_STARTED + explore 2969 if incomplete + SAY complete + despawn 5s + SetFollowComplete',
  };
}

export interface KindalFleeResult {
  flee: boolean;
  setHasFleed: boolean;
  cite: string;
}

/** Port of flee at ≤15% HP once. Cite: feralas.cpp:513–518 */
export function kindalFleeCheck(
  hpPct: number,
  hasFleed: boolean,
  doFleeOk = true,
): KindalFleeResult {
  if (hasFleed || hpPct > KINDAL_FLEE_HP_PCT) {
    return {
      flee: false,
      setHasFleed: false,
      cite: hasFleed
        ? 'feralas.cpp:514 m_hasFleed → no re-flee'
        : 'feralas.cpp:514 HP% > 15 → no flee',
    };
  }
  if (!doFleeOk) {
    return {
      flee: false,
      setHasFleed: false,
      cite: 'feralas.cpp:516 DoFlee() failed → m_hasFleed stays false',
    };
  }
  return {
    flee: true,
    setHasFleed: true,
    cite: 'feralas.cpp:516-517 DoFlee() → m_hasFleed=true',
  };
}

export interface KindalDespawnTickResult {
  despawn: boolean;
  setImmuneToNpc: boolean;
  respawn: boolean;
  remainingMs: number;
  cite: string;
}

/** Port of m_despawnTimer after complete. Cite: feralas.cpp:497–508 */
export function kindalDespawnTick(
  despawnTimerMs: number,
  diffMs: number,
): KindalDespawnTickResult {
  if (!(despawnTimerMs | 0)) {
    return {
      despawn: false,
      setImmuneToNpc: false,
      respawn: false,
      remainingMs: 0,
      cite: 'feralas.cpp:497 m_despawnTimer==0 → idle',
    };
  }
  if (despawnTimerMs < diffMs) {
    return {
      despawn: true,
      setImmuneToNpc: true,
      respawn: true,
      remainingMs: 0,
      cite:
        'feralas.cpp:501-504 SetImmuneToNPC + ForcedDespawn + Respawn',
    };
  }
  return {
    despawn: false,
    setImmuneToNpc: false,
    respawn: false,
    remainingMs: despawnTimerMs - diffMs,
    cite: 'feralas.cpp:507 m_despawnTimer -= diff',
  };
}

// ---------------------------------------------------------------------------
