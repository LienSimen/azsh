// Felwood ScriptDev IR ports. Source: scripts/kalimdor/felwood.cpp — npc_kitten, npc_corrupt_saber,
// npc_captured_arkonarin and npc_arei. Arei's schedule supersedes the bake EventAI kit on 9598.

import type { ScriptDevIR } from './types.ts';

// Shared faction / tempfaction / stand-state / AI event constants

/** FACTION_ESCORT_N_NEUTRAL_ACTIVE. Cite: ScriptDevAIMgr.h:50 = 250; felwood.cpp:229 Arkonarin */
export const FACTION_ESCORT_N_NEUTRAL_ACTIVE = 250;

/** FACTION_ESCORT_N_NEUTRAL_PASSIVE. Cite: ScriptDevAIMgr.h:46 = 113; felwood.cpp:412 Arei */
export const FACTION_ESCORT_N_NEUTRAL_PASSIVE = 113;

/** TEMPFACTION_RESTORE_RESPAWN. Cite: Creature.h:577 = 0x01; felwood.cpp:229,412 */
export const TEMPFACTION_RESTORE_RESPAWN = 0x01;

/** TEMPFACTION_TOGGLE_IMMUNE_TO_NPC. Cite: Creature.h:582 = 0x20; felwood.cpp:229 */
export const TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x20;

/** UNIT_STAND_STATE_STAND / KNEEL. Cite: Unit.h; felwood.cpp:192 kneel ctor, :228 stand escort start */
export const UNIT_STAND_STATE_STAND = 0;
export const UNIT_STAND_STATE_KNEEL = 8;

/** INTERACTION_DISTANCE. Cite: ObjectDefines.h:25 = 5.0f; felwood.cpp:85,141 */
export const INTERACTION_DISTANCE = 5;

/** AI_EVENT_START_ESCORT. Cite: AIDefines.h:43 = 100; felwood.cpp:226,408 */
export const AI_EVENT_START_ESCORT = 100;

// Constants — npc_kitten / npc_corrupt_saber

// felwood.cpp:45–53
/** Cite: felwood.cpp:45 EMOTE_SAB_JUMP = -1000541 */
export const EMOTE_SAB_JUMP = -1_000_541;
/** Cite: felwood.cpp:46 EMOTE_SAB_FOLLOW = -1000542 */
export const EMOTE_SAB_FOLLOW = -1_000_542;

/** Cite: felwood.cpp:48 SPELL_CORRUPT_SABER_VISUAL = 16510 */
export const SPELL_CORRUPT_SABER_VISUAL = 16510;

/** Cite: felwood.cpp:50 QUEST_CORRUPT_SABER = 4506 */
export const QUEST_CORRUPT_SABER = 4506;
/** Cite: felwood.cpp:51 NPC_WINNA = 9996 */
export const NPC_WINNA = 9996;
/** Cite: felwood.cpp:52 NPC_CORRUPT_SABER = 10042 */
export const NPC_CORRUPT_SABER = 10042;

/** DB binding. Cite: scriptdev-corpus.json entry 9937 Common Kitten */
export const NPC_COMMON_KITTEN = 9937;

/** Moonwell visual arm after follow starts (paused). Cite: felwood.cpp:72 m_uiMoonwellCooldown = 7500 */
export const KITTEN_MOONWELL_COOLDOWN_MS = 7500;

/** Gossip release menu item (literal). Cite: felwood.cpp:55 GOSSIP_ITEM_RELEASE */
export const GOSSIP_ITEM_RELEASE_CORRUPT_SABER =
  'I want to release the corrupted saber to Winna.';

// Constants — npc_captured_arkonarin

// felwood.cpp:170–182
/** Cite: felwood.cpp:170 SAY_ESCORT_START = 6433 */
export const SAY_ARKONARIN_ESCORT_START = 6433;

/** Cite: felwood.cpp:172 SPELL_MORTAL_STRIKE = 16856 */
export const SPELL_MORTAL_STRIKE = 16856;
/** Cite: felwood.cpp:173 SPELL_CLEAVE = 15496 */
export const SPELL_CLEAVE = 15496;

/** Cite: felwood.cpp:175 QUEST_ID_RESCUE_JAEDENAR = 5203 */
export const QUEST_ID_RESCUE_JAEDENAR = 5203;
/** Cite: felwood.cpp:176 NPC_JAEDENAR_LEGIONNAIRE = 9862 */
export const NPC_JAEDENAR_LEGIONNAIRE = 9862;
/** Cite: felwood.cpp:177 NPC_SPIRT_TREY = 11141 */
export const NPC_SPIRT_TREY = 11141;
/** Cite: felwood.cpp:178 GO_ARKONARIN_CAGE = 176306 */
export const GO_ARKONARIN_CAGE = 176306;

/** Cite: felwood.cpp:181 PATH_ID = 11016 */
export const ARKONARIN_ESCORT_PATH = 11016;

/** DB binding. Cite: scriptdev-corpus.json entry 11016 */
export const NPC_CAPTURED_ARKONARIN = 11016;

/** RND Aggro Texts. Cite: felwood.cpp:186 aRandomAggro[] = { 6801, 6802, 6803 } */
export const ARKONARIN_AGGRO_TEXTS = [6801, 6802, 6803] as const;

/** Aggro yell chance percent. Cite: felwood.cpp:214 roll_chance_i(80) */
export const ARKONARIN_AGGRO_YELL_CHANCE_PCT = 80;

// Mortal Strike timer. Reset urand(5000,7000); CAST_OK re-arm urand(7000,10000). Cite:
// felwood.cpp:208,274-277
export const ARKONARIN_MORTAL_STRIKE_INIT_MIN_MS = 5000;
export const ARKONARIN_MORTAL_STRIKE_INIT_MAX_MS = 7000;
export const ARKONARIN_MORTAL_STRIKE_REPEAT_MIN_MS = 7000;
export const ARKONARIN_MORTAL_STRIKE_REPEAT_MAX_MS = 10_000;

/** Cleave timer. Reset urand(1000,4000); CAST_OK re-arm urand(3000,6000). Cite: felwood.cpp:209,282-285 */
export const ARKONARIN_CLEAVE_INIT_MIN_MS = 1000;
export const ARKONARIN_CLEAVE_INIT_MAX_MS = 4000;
export const ARKONARIN_CLEAVE_REPEAT_MIN_MS = 3000;
export const ARKONARIN_CLEAVE_REPEAT_MAX_MS = 6000;

/** Cage search radius on escort start. Cite: felwood.cpp:232 GetClosestGameObjectWithEntry(..., 5.0f) */
export const ARKONARIN_CAGE_SEARCH_YD = 5;

// QuestAccept temp faction flags. Cite: felwood.cpp:229 TEMPFACTION_RESTORE_RESPAWN +
// TEMPFACTION_TOGGLE_IMMUNE_TO_NPC
export const ARKONARIN_TEMP_FACTION_FLAGS =
  TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC;

// Constants — npc_arei

// felwood.cpp:314–332
/** Cite: felwood.cpp:314 SAY_AREI_ESCORT_START = -1001159 */
export const SAY_AREI_ESCORT_START = -1_001_159;
/** Cite: felwood.cpp:315 SAY_ATTACK_IRONTREE = -1001160 */
export const SAY_ATTACK_IRONTREE = -1_001_160;
/** Cite: felwood.cpp:316 SAY_ATTACK_TOXIC_HORROR = -1001161 */
export const SAY_ATTACK_TOXIC_HORROR = -1_001_161;
/** Cite: felwood.cpp:317 SAY_EXIT_WOODS = -1001162 */
export const SAY_EXIT_WOODS = -1_001_162;
/** Cite: felwood.cpp:318 SAY_CLEAR_PATH = -1001163 */
export const SAY_CLEAR_PATH = -1_001_163;
/** Cite: felwood.cpp:319 SAY_ASHENVALE = -1001164 */
export const SAY_ASHENVALE = -1_001_164;
/** Cite: felwood.cpp:320 SAY_TRANSFORM = -1001165 */
export const SAY_TRANSFORM = -1_001_165;
/** Cite: felwood.cpp:321 SAY_LIFT_CURSE = -1001166 */
export const SAY_LIFT_CURSE = -1_001_166;
/** Cite: felwood.cpp:322 SAY_AREI_ESCORT_COMPLETE = -1001167 */
export const SAY_AREI_ESCORT_COMPLETE = -1_001_167;

/** Cite: felwood.cpp:324 SPELL_WITHER_STRIKE = 5337 */
export const SPELL_WITHER_STRIKE = 5337;
/** Cite: felwood.cpp:325 SPELL_AREI_TRANSFORM = 14888 */
export const SPELL_AREI_TRANSFORM = 14888;

/** Cite: felwood.cpp:327 NPC_AREI = 9598 */
export const NPC_AREI = 9598;
/** Cite: felwood.cpp:328 NPC_TOXIC_HORROR = 7132 */
export const NPC_TOXIC_HORROR = 7132;
/** Cite: felwood.cpp:329 NPC_IRONTREE_WANDERER = 7138 */
export const NPC_IRONTREE_WANDERER = 7138;
/** Cite: felwood.cpp:330 NPC_IRONTREE_STOMPER = 7139 */
export const NPC_IRONTREE_STOMPER = 7139;
/** Cite: felwood.cpp:331 QUEST_ID_ANCIENT_SPIRIT = 4261 */
export const QUEST_ID_ANCIENT_SPIRIT = 4261;

// Wither Strike timer. Reset urand(1000,4000); CAST_OK re-arm urand(3000,6000). Cite:
// felwood.cpp:363,468-471
export const AREI_WITHER_STRIKE_INIT_MIN_MS = 1000;
export const AREI_WITHER_STRIKE_INIT_MAX_MS = 4000;
export const AREI_WITHER_STRIKE_REPEAT_MIN_MS = 3000;
export const AREI_WITHER_STRIKE_REPEAT_MAX_MS = 6000;

/** Ambush TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN. Cite: felwood.cpp:423-425 60000 */
export const AREI_AMBUSH_DESPAWN_MS = 60_000;

/** ForcedDespawn after explore credit. Cite: felwood.cpp:455 ForcedDespawn(10000) */
export const AREI_COMPLETE_DESPAWN_MS = 10_000;

/** WP37 Irontree ambush summons (Stomper + 2× Wanderer). Cite: felwood.cpp:423-425 */
export const AREI_WP37_SPAWNS = [
  {
    entry: NPC_IRONTREE_STOMPER,
    x: 6573.321,
    y: -1195.213,
    z: 442.489,
    o: 0,
    cite: 'felwood.cpp:423 NPC_IRONTREE_STOMPER',
  },
  {
    entry: NPC_IRONTREE_WANDERER,
    x: 6573.24,
    y: -1213.475,
    z: 443.643,
    o: 0,
    cite: 'felwood.cpp:424 NPC_IRONTREE_WANDERER',
  },
  {
    entry: NPC_IRONTREE_WANDERER,
    x: 6583.354,
    y: -1209.811,
    z: 444.769,
    o: 0,
    cite: 'felwood.cpp:425 NPC_IRONTREE_WANDERER',
  },
] as const;

// Epilog dialogue steps after ambush clear. Cite: felwood.cpp:334–342 aEpilogDialogue Delays are between
// steps (DialogueHelper): text/spell entry, speaker, delayMs.
export const AREI_EPILOG_DIALOGUE = [
  { entry: SAY_CLEAR_PATH, speaker: NPC_AREI, delayMs: 4000, cite: 'felwood.cpp:336' },
  {
    entry: SPELL_WITHER_STRIKE,
    speaker: 0,
    delayMs: 5000,
    cite: 'felwood.cpp:337 (step marker → SAY_ASHENVALE in JustDidDialogueStep)',
  },
  { entry: SAY_TRANSFORM, speaker: NPC_AREI, delayMs: 3000, cite: 'felwood.cpp:338' },
  {
    entry: SPELL_AREI_TRANSFORM,
    speaker: 0,
    delayMs: 7000,
    cite: 'felwood.cpp:339 (cast transform + SAY_LIFT_CURSE)',
  },
  {
    entry: QUEST_ID_ANCIENT_SPIRIT,
    speaker: 0,
    delayMs: 0,
    cite: 'felwood.cpp:340 (complete + explore credit + despawn 10s)',
  },
] as const;

// Pure helpers — npc_kitten / npc_corrupt_saber

export interface KittenCtorResult {
  startFollow: boolean;
  followPaused: boolean;
  textId: number | null;
  setSpawningFlag: boolean;
  moonwellCooldownMs: number;
  cite: string;
}

/** Port of npc_kittenAI ctor branch when owner is player. Cite: felwood.cpp:61–73 */
export function kittenCtor(hasPlayerOwner: boolean): KittenCtorResult {
  if (!hasPlayerOwner) {
    return {
      startFollow: false,
      followPaused: false,
      textId: null,
      setSpawningFlag: false,
      moonwellCooldownMs: KITTEN_MOONWELL_COOLDOWN_MS,
      cite: 'felwood.cpp:61 no player owner → skip follow arm; still m_uiMoonwellCooldown=7500',
    };
  }
  return {
    startFollow: true,
    followPaused: true,
    textId: EMOTE_SAB_JUMP,
    setSpawningFlag: true,
    moonwellCooldownMs: KITTEN_MOONWELL_COOLDOWN_MS,
    cite:
      'felwood.cpp:63-72 StartFollow + SetFollowPaused + EMOTE_SAB_JUMP + SPAWNING + moonwell 7500',
  };
}

export interface KittenMoonwellTickResult {
  castVisual: boolean;
  unpauseFollow: boolean;
  remainingMs: number;
  cite: string;
}

// Port of the OOC moonwell branch in UpdateFollowerAI.
// Cite: felwood.cpp:92–103.
export function kittenMoonwellTick(
  followPaused: boolean,
  cooldownMs: number,
  diffMs: number,
  hasVictim: boolean,
): KittenMoonwellTickResult {
  if (hasVictim) {
    return {
      castVisual: false,
      unpauseFollow: false,
      remainingMs: cooldownMs,
      cite: 'felwood.cpp:92-106 has victim → melee path, no moonwell',
    };
  }
  if (!followPaused) {
    return {
      castVisual: false,
      unpauseFollow: false,
      remainingMs: cooldownMs,
      cite: 'felwood.cpp:94 !STATE_FOLLOW_PAUSED → no moonwell',
    };
  }
  // cpp: if (m_uiMoonwellCooldown < uiDiff) cast; else subtract
  if (cooldownMs < diffMs) {
    return {
      castVisual: true,
      unpauseFollow: true,
      remainingMs: 0,
      cite:
        'felwood.cpp:96-99 cast SPELL_CORRUPT_SABER_VISUAL 16510 + SetFollowPaused(false)',
    };
  }
  return {
    castVisual: false,
    unpauseFollow: false,
    remainingMs: cooldownMs - diffMs,
    cite: 'felwood.cpp:102 m_uiMoonwellCooldown -= uiDiff',
  };
}

export interface CorruptedSaberVisualResult {
  updateEntry: number;
  emoteFollow: number;
  cite: string;
}

/** Port of CorruptedSaberVisual::OnEffectExecute morph. Cite: felwood.cpp:118–134 */
export function corruptedSaberVisualOnEffect(): CorruptedSaberVisualResult {
  return {
    updateEntry: NPC_CORRUPT_SABER,
    emoteFollow: EMOTE_SAB_FOLLOW,
    cite:
      'felwood.cpp:124-133 SetEntry/Display/Name/Scale NPC_CORRUPT_SABER 10042 + EMOTE_SAB_FOLLOW to owner',
  };
}

export interface KittenWinnaLosResult {
  setGossipFlag: boolean;
  cite: string;
}

/** Port of MoveInLineOfSight Winna gossip arm. Cite: felwood.cpp:80–87 */
export function kittenWinnaMoveInLos(
  hasVictim: boolean,
  hasGossipFlag: boolean,
  followInProgress: boolean,
  whoEntry: number,
  distYd: number,
): KittenWinnaLosResult {
  if (
    !hasVictim
    && !hasGossipFlag
    && followInProgress
    && (whoEntry | 0) === NPC_WINNA
    && distYd <= INTERACTION_DISTANCE
  ) {
    return {
      setGossipFlag: true,
      cite: 'felwood.cpp:83-86 Winna within INTERACTION_DISTANCE → UNIT_NPC_FLAG_GOSSIP',
    };
  }
  return {
    setGossipFlag: false,
    cite: 'felwood.cpp:83 gates fail → no gossip flag',
  };
}

export interface CorruptSaberGossipHelloResult {
  showRelease: boolean;
  cite: string;
}

/** Port of GossipHello_npc_corrupt_saber release branch. Cite: felwood.cpp:137–146 */
export function corruptSaberGossipHello(
  questIncomplete4506: boolean,
  winnaWithinInteraction: boolean,
): CorruptSaberGossipHelloResult {
  if (questIncomplete4506 && winnaWithinInteraction) {
    return {
      showRelease: true,
      cite:
        'felwood.cpp:139-142 QUEST_CORRUPT_SABER incomplete + Winna ≤INTERACTION_DISTANCE → release item',
    };
  }
  return {
    showRelease: false,
    cite: 'felwood.cpp:139-145 default gossip only',
  };
}

export interface CorruptSaberGossipSelectResult {
  handled: boolean;
  followComplete: boolean;
  exploreQuestId: number | null;
  cite: string;
}

// Port of GossipSelect_npc_corrupt_saber.
// Cite: felwood.cpp:149–161.
export function corruptSaberGossipSelect(
  isReleaseAction: boolean,
): CorruptSaberGossipSelectResult {
  if (!isReleaseAction) {
    return {
      handled: false,
      followComplete: false,
      exploreQuestId: null,
      cite: 'felwood.cpp:151 action != GOSSIP_ACTION_INFO_DEF+1 → no-op',
    };
  }
  return {
    handled: true,
    followComplete: true,
    exploreQuestId: QUEST_CORRUPT_SABER,
    cite:
      'felwood.cpp:153-158 CLOSE + SetFollowComplete + AreaExploredOrEventHappens(4506)',
  };
}

// Pure helpers — npc_captured_arkonarin

export interface ArkonarinQuestAcceptResult {
  handled: boolean;
  standState: number;
  factionId: number;
  factionFlags: number;
  pathId: number;
  openCageEntry: number;
  cageSearchYd: number;
  eventType: number;
  questId: number;
  cite: string;
}

/** Port of QuestAccept + ReceiveAIEvent START_ESCORT for Arkonarin. Cite: felwood.cpp:224–234,300–305 */
export function arkonarinQuestAccept(questId: number): ArkonarinQuestAcceptResult {
  if ((questId | 0) !== QUEST_ID_RESCUE_JAEDENAR) {
    return {
      handled: false,
      standState: UNIT_STAND_STATE_KNEEL,
      factionId: 0,
      factionFlags: 0,
      pathId: 0,
      openCageEntry: 0,
      cageSearchYd: 0,
      eventType: 0,
      questId: 0,
      cite: 'felwood.cpp:302 quest != 5203 → no-op',
    };
  }
  return {
    handled: true,
    standState: UNIT_STAND_STATE_STAND,
    factionId: FACTION_ESCORT_N_NEUTRAL_ACTIVE,
    factionFlags: ARKONARIN_TEMP_FACTION_FLAGS,
    pathId: ARKONARIN_ESCORT_PATH,
    openCageEntry: GO_ARKONARIN_CAGE,
    cageSearchYd: ARKONARIN_CAGE_SEARCH_YD,
    eventType: AI_EVENT_START_ESCORT,
    questId: QUEST_ID_RESCUE_JAEDENAR,
    cite:
      'felwood.cpp:228-233 STAND + faction 250 flags 0x21 + Start path 11016 + open GO 176306 ≤5yd',
  };
}

export interface ArkonarinResetResult {
  /** After Reset: false when !escorting, else prior value. */
  canAttack: boolean;
  mortalStrikeTimerMinMs: number;
  mortalStrikeTimerMaxMs: number;
  cleaveTimerMinMs: number;
  cleaveTimerMaxMs: number;
  cite: string;
}

// Port of Reset() timer arms; canAttack is only cleared when not escorting.
// Cite: felwood.cpp:203–209.
export function arkonarinReset(
  escorting: boolean,
  priorCanAttack = false,
): ArkonarinResetResult {
  return {
    canAttack: escorting ? priorCanAttack : false,
    mortalStrikeTimerMinMs: ARKONARIN_MORTAL_STRIKE_INIT_MIN_MS,
    mortalStrikeTimerMaxMs: ARKONARIN_MORTAL_STRIKE_INIT_MAX_MS,
    cleaveTimerMinMs: ARKONARIN_CLEAVE_INIT_MIN_MS,
    cleaveTimerMaxMs: ARKONARIN_CLEAVE_INIT_MAX_MS,
    cite: escorting
      ? 'felwood.cpp:205-209 escorting → keep m_bCanAttack; re-arm timers 5-7s / 1-4s'
      : 'felwood.cpp:205-209 !escorting → m_bCanAttack=false; timers 5-7s / 1-4s',
  };
}

export interface ArkonarinAggroResult {
  textId: number | null;
  cite: string;
}

// Port of the Aggro random yell, 80% of aRandomAggro.
// Cite: felwood.cpp:212–216.
export function arkonarinAggro(roll01Lt80: boolean, textIdx: number): ArkonarinAggroResult {
  if (!roll01Lt80) {
    return {
      textId: null,
      cite: 'felwood.cpp:214 roll_chance_i(80) fail → no yell',
    };
  }
  const idx = ((textIdx | 0) % 3 + 3) % 3;
  return {
    textId: ARKONARIN_AGGRO_TEXTS[idx]!,
    cite: 'felwood.cpp:215 DoBroadcastText(aRandomAggro[urand(0,2)])',
  };
}

export interface ArkonarinWaypointResult {
  handled: boolean;
  textId: number | null;
  canAttack: boolean | null;
  pauseEscort: boolean;
  exploreQuestId: number | null;
  setImmuneToNpc: boolean;
  questEnd: boolean;
  cite: string;
}

/** Port of WaypointReached for Arkonarin. Cite: felwood.cpp:237–264 */
export function arkonarinWaypointReached(pointId: number): ArkonarinWaypointResult {
  switch (pointId | 0) {
    case 1:
      return {
        handled: true,
        textId: SAY_ARKONARIN_ESCORT_START,
        canAttack: null,
        pauseEscort: false,
        exploreQuestId: null,
        setImmuneToNpc: false,
        questEnd: false,
        cite: 'felwood.cpp:241-246 WP1 SAY_ESCORT_START 6433 + talk emote',
      };
    case 37:
      return {
        handled: true,
        textId: null,
        canAttack: true,
        pauseEscort: false,
        exploreQuestId: null,
        setImmuneToNpc: false,
        questEnd: false,
        cite: 'felwood.cpp:248-250 WP37 m_bCanAttack=true',
      };
    case 83:
      return {
        handled: true,
        textId: null,
        canAttack: null,
        pauseEscort: true,
        exploreQuestId: null,
        setImmuneToNpc: false,
        questEnd: false,
        cite: 'felwood.cpp:251-253 WP83 SetEscortPaused(true) - Spirit Trey ambush',
      };
    case 85:
      return {
        handled: true,
        textId: null,
        canAttack: null,
        pauseEscort: false,
        exploreQuestId: QUEST_ID_RESCUE_JAEDENAR,
        setImmuneToNpc: true,
        questEnd: true,
        cite:
          'felwood.cpp:254-262 WP85 explore 5203 + UNIT_FLAG_IMMUNE_TO_NPC + QuestEnd',
      };
    default:
      return {
        handled: false,
        textId: null,
        canAttack: null,
        pauseEscort: false,
        exploreQuestId: null,
        setImmuneToNpc: false,
        questEnd: false,
        cite: 'felwood.cpp:237 unknown WP → no-op',
      };
  }
}

export interface ArkonarinSummonedDiedResult {
  resumeEscort: boolean;
  cite: string;
}

/** Port of SummonedCreatureJustDied Spirit Trey branch. Cite: felwood.cpp:218–221 */
export function arkonarinSummonedCreatureJustDied(
  summonedEntry: number,
): ArkonarinSummonedDiedResult {
  if ((summonedEntry | 0) === NPC_SPIRT_TREY) {
    return {
      resumeEscort: true,
      cite: 'felwood.cpp:220-221 NPC_SPIRT_TREY death → SetEscortPaused(false)',
    };
  }
  return {
    resumeEscort: false,
    cite: 'felwood.cpp:220 entry != 11141 → no-op',
  };
}

// Pure helpers — npc_arei

export interface AreiQuestAcceptResult {
  handled: boolean;
  textId: number | null;
  factionId: number;
  factionFlags: number;
  eventType: number;
  questId: number;
  cite: string;
}

/** Port of QuestAccept + ReceiveAIEvent START_ESCORT for Arei. Cite: felwood.cpp:406–414,485–490 */
export function areiQuestAccept(questId: number): AreiQuestAcceptResult {
  if ((questId | 0) !== QUEST_ID_ANCIENT_SPIRIT) {
    return {
      handled: false,
      textId: null,
      factionId: 0,
      factionFlags: 0,
      eventType: 0,
      questId: 0,
      cite: 'felwood.cpp:487 quest != 4261 → no-op',
    };
  }
  return {
    handled: true,
    textId: SAY_AREI_ESCORT_START,
    factionId: FACTION_ESCORT_N_NEUTRAL_PASSIVE,
    factionFlags: TEMPFACTION_RESTORE_RESPAWN,
    eventType: AI_EVENT_START_ESCORT,
    questId: QUEST_ID_ANCIENT_SPIRIT,
    cite:
      'felwood.cpp:410-413 SAY_AREI_ESCORT_START + faction 113 RESTORE_RESPAWN + Start',
  };
}

export interface AreiResetResult {
  witherStrikeTimerMinMs: number;
  witherStrikeTimerMaxMs: number;
  cite: string;
}

/** Port of Reset wither timer. Cite: felwood.cpp:361–364 */
export function areiReset(): AreiResetResult {
  return {
    witherStrikeTimerMinMs: AREI_WITHER_STRIKE_INIT_MIN_MS,
    witherStrikeTimerMaxMs: AREI_WITHER_STRIKE_INIT_MAX_MS,
    cite: 'felwood.cpp:363 m_uiWitherStrikeTimer = urand(1000, 4000)',
  };
}

export interface AreiAggroResult {
  textId: number | null;
  setAggroIrontree: boolean;
  setAggroHorror: boolean;
  cite: string;
}

/** Port of Aggro special yells (once each family). Cite: felwood.cpp:366–378 */
export function areiAggro(
  whoEntry: number,
  alreadyAggroIrontree: boolean,
  alreadyAggroHorror: boolean,
): AreiAggroResult {
  const e = whoEntry | 0;
  if (
    (e === NPC_IRONTREE_WANDERER || e === NPC_IRONTREE_STOMPER)
    && !alreadyAggroIrontree
  ) {
    return {
      textId: SAY_ATTACK_IRONTREE,
      setAggroIrontree: true,
      setAggroHorror: false,
      cite: 'felwood.cpp:368-371 first Irontree → SAY_ATTACK_IRONTREE',
    };
  }
  if (e === NPC_TOXIC_HORROR && !alreadyAggroHorror) {
    return {
      textId: SAY_ATTACK_TOXIC_HORROR,
      setAggroIrontree: false,
      setAggroHorror: true,
      cite: 'felwood.cpp:373-377 first Toxic Horror → SAY_ATTACK_TOXIC_HORROR',
    };
  }
  return {
    textId: null,
    setAggroIrontree: false,
    setAggroHorror: false,
    cite: 'felwood.cpp:366-378 no special yell',
  };
}

export interface AreiWaypointResult {
  handled: boolean;
  pauseEscort: boolean;
  summons: ReadonlyArray<{
    creatureEntry: number;
    x: number;
    y: number;
    z: number;
    o: number;
    despawnMs: number;
  }>;
  cite: string;
}

/** Port of WaypointReached WP37 ambush. Cite: felwood.cpp:417–426 */
export function areiWaypointReached(pointId: number): AreiWaypointResult {
  if ((pointId | 0) !== 37) {
    return {
      handled: false,
      pauseEscort: false,
      summons: [],
      cite: 'felwood.cpp:419 uiPointId != 37 → no-op',
    };
  }
  return {
    handled: true,
    pauseEscort: true,
    summons: AREI_WP37_SPAWNS.map((s) => ({
      creatureEntry: s.entry,
      x: s.x,
      y: s.y,
      z: s.z,
      o: s.o,
      despawnMs: AREI_AMBUSH_DESPAWN_MS,
    })),
    cite:
      'felwood.cpp:421-425 WP37 pause + summon Stomper 7139 + 2× Wanderer 7138 despawn 60s',
  };
}

export interface AreiJustSummonedResult {
  textId: number | null;
  attackStartArei: boolean;
  trackGuid: boolean;
  cite: string;
}

/** Port of JustSummoned Irontree branch. Cite: felwood.cpp:381–392 */
export function areiJustSummoned(summonedEntry: number): AreiJustSummonedResult {
  const e = summonedEntry | 0;
  if (e === NPC_IRONTREE_STOMPER) {
    return {
      textId: SAY_EXIT_WOODS,
      attackStartArei: true,
      trackGuid: true,
      cite:
        'felwood.cpp:385-390 Stomper → SAY_EXIT_WOODS + AttackStart(Arei) + track guid',
    };
  }
  if (e === NPC_IRONTREE_WANDERER) {
    return {
      textId: null,
      attackStartArei: true,
      trackGuid: true,
      cite: 'felwood.cpp:388-390 Wanderer → AttackStart(Arei) + track guid',
    };
  }
  return {
    textId: null,
    attackStartArei: false,
    trackGuid: false,
    cite: 'felwood.cpp:383 unknown summon → no-op',
  };
}

export interface AreiSummonedDiedResult {
  startEpilog: boolean;
  remainingTracked: number;
  cite: string;
}

// Port of SummonedCreatureJustDied ambush-clear → StartNextDialogueText.
// Cite: felwood.cpp:395–403.
export function areiSummonedCreatureJustDied(
  summonedEntry: number,
  trackedBeforeRemove: number,
): AreiSummonedDiedResult {
  const e = summonedEntry | 0;
  if (e !== NPC_IRONTREE_STOMPER && e !== NPC_IRONTREE_WANDERER) {
    return {
      startEpilog: false,
      remainingTracked: trackedBeforeRemove,
      cite: 'felwood.cpp:397 not Irontree → no-op',
    };
  }
  const remaining = Math.max(0, (trackedBeforeRemove | 0) - 1);
  return {
    startEpilog: remaining === 0,
    remainingTracked: remaining,
    cite:
      remaining === 0
        ? 'felwood.cpp:401-402 empty summons → StartNextDialogueText(SAY_CLEAR_PATH)'
        : 'felwood.cpp:399 remove guid; still tracked → wait',
  };
}

export interface AreiDialogueStepResult {
  handled: boolean;
  textId: number | null;
  castTransform: boolean;
  exploreQuestId: number | null;
  forceDespawnMs: number;
  cite: string;
}

// Port of JustDidDialogueStep epilog actions.
// Cite: felwood.cpp:437–458.
export function areiDialogueStep(stepEntry: number): AreiDialogueStepResult {
  const e = stepEntry | 0;
  if (e === SPELL_WITHER_STRIKE) {
    return {
      handled: true,
      textId: SAY_ASHENVALE,
      castTransform: false,
      exploreQuestId: null,
      forceDespawnMs: 0,
      cite: 'felwood.cpp:441-443 SPELL_WITHER_STRIKE step → SAY_ASHENVALE',
    };
  }
  if (e === SPELL_AREI_TRANSFORM) {
    return {
      handled: true,
      textId: SAY_LIFT_CURSE,
      castTransform: true,
      exploreQuestId: null,
      forceDespawnMs: 0,
      cite:
        'felwood.cpp:445-448 SPELL_AREI_TRANSFORM step → cast 14888 + SAY_LIFT_CURSE',
    };
  }
  if (e === QUEST_ID_ANCIENT_SPIRIT) {
    return {
      handled: true,
      textId: SAY_AREI_ESCORT_COMPLETE,
      castTransform: false,
      exploreQuestId: QUEST_ID_ANCIENT_SPIRIT,
      forceDespawnMs: AREI_COMPLETE_DESPAWN_MS,
      cite:
        'felwood.cpp:450-456 QUEST step → SAY complete + explore 4261 + ForcedDespawn(10000)',
    };
  }
  // SAY_CLEAR_PATH / SAY_TRANSFORM are DialogueHelper speaker texts (auto-said).
  if (e === SAY_CLEAR_PATH || e === SAY_TRANSFORM) {
    return {
      handled: true,
      textId: e,
      castTransform: false,
      exploreQuestId: null,
      forceDespawnMs: 0,
      cite: 'felwood.cpp:336/338 DialogueHelper speaker text (no JustDidDialogueStep action)',
    };
  }
  return {
    handled: false,
    textId: null,
    castTransform: false,
    exploreQuestId: null,
    forceDespawnMs: 0,
    cite: 'felwood.cpp:439 unknown dialogue step → no-op',
  };
}

// ScriptDev IR — npc_kitten

// npc_kittenAI and the CorruptedSaberVisual spell script. Creature 9937 is ABSENT from the product
// bake, so the binding is unused. Follower plus the 16510 morph to 10042; no combat timers.
export const NPC_KITTEN_SCRIPT: ScriptDevIR = {
  name: 'npc_kitten',
  boundCreatures: [NPC_COMMON_KITTEN],
  sourceFile: 'kalimdor/felwood.cpp',
  spellIds: [SPELL_CORRUPT_SABER_VISUAL],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: `m_uiMoonwellCooldown=${KITTEN_MOONWELL_COOLDOWN_MS}; Reset empty`,
        cite: 'felwood.cpp:72,78',
      },
    ],
  },
  unusedBindings: [
    {
      entry: NPC_COMMON_KITTEN,
      kind: 'creature',
      reason:
        'NPC 9937 Common Kitten is DB-bound to npc_kitten (quest 4506 follower) but absent from product bake - IR + pure helpers (kittenCtor / kittenMoonwellTick / corruptedSaberVisualOnEffect) ported; product cannot spawn until rebake',
      cite: 'felwood.cpp:57-115,117-135; scriptdev-corpus bound 9937; loadRealBundle missing 9937',
    },
  ],
  cites: [
    'felwood.cpp:39-135 npc_kitten + CorruptedSaberVisual',
    'felwood.cpp:45-52 EMOTE/SPELL/QUEST/NPC constants',
    'felwood.cpp:61-73 ctor follow + moonwell 7500',
    'felwood.cpp:80-87 Winna LOS gossip flag',
    'felwood.cpp:90-109 UpdateFollowerAI moonwell cast 16510',
    'felwood.cpp:117-135 spell_corrupted_saber_visual morph 10042',
  ],
};

// ScriptDev IR — npc_corrupt_saber

// GossipHello/Select_npc_corrupt_saber. Creature 10042 is ABSENT from the product bake, so the
// binding is unused. Gossip residual only — release to Winna gives explore credit 4506.
export const NPC_CORRUPT_SABER_SCRIPT: ScriptDevIR = {
  name: 'npc_corrupt_saber',
  boundCreatures: [NPC_CORRUPT_SABER],
  sourceFile: 'kalimdor/felwood.cpp',
  spellIds: [],
  timers: [],
  gossipHello: {
    defaultTextId: 0,
    cite:
      'felwood.cpp:137-146 GossipHello: release item when 4506 incomplete + Winna near (corruptSaberGossipHello)',
  },
  unusedBindings: [
    {
      entry: NPC_CORRUPT_SABER,
      kind: 'creature',
      reason:
        'NPC 10042 Corrupted Saber is DB-bound to npc_corrupt_saber (quest 4506 gossip residual / morph of 9937) but absent from product bake - IR + pure helpers (corruptSaberGossipHello/Select) ported; product cannot spawn until rebake',
      cite: 'felwood.cpp:137-161; scriptdev-corpus bound 10042; loadRealBundle missing 10042',
    },
  ],
  cites: [
    'felwood.cpp:137-161 npc_corrupt_saber gossip',
    'felwood.cpp:50 QUEST_CORRUPT_SABER=4506',
    'felwood.cpp:51-52 NPC_WINNA=9996 NPC_CORRUPT_SABER=10042',
    'felwood.cpp:139-142 incomplete 4506 + Winna ≤INTERACTION_DISTANCE → release',
    'felwood.cpp:151-158 select → SetFollowComplete + AreaExploredOrEventHappens(4506)',
  ],
};

// ScriptDev IR — npc_captured_arkonarin

// npc_captured_arkonarinAI, creature 11016. Escort 5203 with a combat kit after WP37 — Mortal
// Strike 16856 and Cleave 15496. Spirit Trey 11141 is absent from bake, so that binding is unused.
export const NPC_CAPTURED_ARKONARIN_SCRIPT: ScriptDevIR = {
  name: 'npc_captured_arkonarin',
  boundCreatures: [NPC_CAPTURED_ARKONARIN],
  sourceFile: 'kalimdor/felwood.cpp',
  spellIds: [SPELL_MORTAL_STRIKE, SPELL_CLEAVE],
  timers: [
    {
      id: 'mortal_strike',
      spellId: SPELL_MORTAL_STRIKE,
      // Reset m_uiMortalStrikeTimer = urand(5000, 7000) (cpp:208)
      initialMinMs: ARKONARIN_MORTAL_STRIKE_INIT_MIN_MS,
      initialMaxMs: ARKONARIN_MORTAL_STRIKE_INIT_MAX_MS,
      // CAST_OK re-arm urand(7000, 10000) (cpp:277)
      repeatMinMs: ARKONARIN_MORTAL_STRIKE_REPEAT_MIN_MS,
      repeatMaxMs: ARKONARIN_MORTAL_STRIKE_REPEAT_MAX_MS,
      target: 'victim',
      cite:
        'felwood.cpp:208,274-277 Mortal Strike 16856 init 5000-7000 re-arm 7000-10000 victim (gated m_bCanAttack after WP37)',
    },
    {
      id: 'cleave',
      spellId: SPELL_CLEAVE,
      // Reset m_uiCleaveTimer = urand(1000, 4000) (cpp:209)
      initialMinMs: ARKONARIN_CLEAVE_INIT_MIN_MS,
      initialMaxMs: ARKONARIN_CLEAVE_INIT_MAX_MS,
      // CAST_OK re-arm urand(3000, 6000) (cpp:285)
      repeatMinMs: ARKONARIN_CLEAVE_REPEAT_MIN_MS,
      repeatMaxMs: ARKONARIN_CLEAVE_REPEAT_MAX_MS,
      target: 'victim',
      cite:
        'felwood.cpp:209,282-285 Cleave 15496 init 1000-4000 re-arm 3000-6000 victim (gated m_bCanAttack after WP37)',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'm_bCanAttack=false when !escorting; MortalStrike urand(5-7)s Cleave urand(1-4)s',
        cite: 'felwood.cpp:203-209',
      },
    ],
    onAggro: [
      {
        kind: 'yell',
        textId: 6801,
        cite:
          'felwood.cpp:214-215 80% DoBroadcastText(aRandomAggro[urand(0,2)]) - 6801/6802/6803 (arkonarinAggro)',
      },
    ],
  },
  unusedBindings: [
    {
      entry: NPC_SPIRT_TREY,
      kind: 'creature',
      reason:
        'NPC 11141 Spirit of Trey is escort-ambush residual (WP83 pause until death → resume; felwood.cpp:220-221,251-253) but absent from product bake - IR ported; resume helper arkonarinSummonedCreatureJustDied documents the gate',
      cite: 'felwood.cpp:177,218-221,251-253; loadRealBundle missing 11141',
    },
  ],
  cites: [
    'felwood.cpp:164-306 npc_captured_arkonarin',
    'felwood.cpp:170-182 SAY/SPELL/QUEST/NPC/PATH constants',
    'felwood.cpp:186 aRandomAggro 6801/6802/6803',
    'felwood.cpp:192 ctor kneel',
    'felwood.cpp:203-209 Reset timers + canAttack',
    'felwood.cpp:212-216 Aggro 80% yell',
    'felwood.cpp:218-221 Spirit Trey death resume',
    'felwood.cpp:224-234 ReceiveAIEvent START_ESCORT',
    'felwood.cpp:237-264 WaypointReached WP1/37/83/85',
    'felwood.cpp:267-292 UpdateEscortAI Mortal Strike + Cleave + melee',
    'felwood.cpp:300-305 QuestAccept 5203 SendAIEvent',
  ],
};

// ScriptDev IR — npc_arei

// npc_areiAI, creature 9598. Escort 4261 with Wither Strike 5337, the WP37 Irontree ambush and the
// epilog transform 14888. This ScriptDev schedule supersedes the bake EventAI kit — never both.
export const NPC_AREI_SCRIPT: ScriptDevIR = {
  name: 'npc_arei',
  boundCreatures: [NPC_AREI],
  sourceFile: 'kalimdor/felwood.cpp',
  spellIds: [SPELL_WITHER_STRIKE, SPELL_AREI_TRANSFORM],
  timers: [
    {
      id: 'wither_strike',
      spellId: SPELL_WITHER_STRIKE,
      // Reset m_uiWitherStrikeTimer = urand(1000, 4000) (cpp:363)
      initialMinMs: AREI_WITHER_STRIKE_INIT_MIN_MS,
      initialMaxMs: AREI_WITHER_STRIKE_INIT_MAX_MS,
      // CAST_OK re-arm urand(3000, 6000) (cpp:471)
      repeatMinMs: AREI_WITHER_STRIKE_REPEAT_MIN_MS,
      repeatMaxMs: AREI_WITHER_STRIKE_REPEAT_MAX_MS,
      target: 'victim',
      cite:
        'felwood.cpp:363,468-471 Wither Strike 5337 init 1000-4000 re-arm 3000-6000 victim',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'm_uiWitherStrikeTimer=urand(1000,4000)',
        cite: 'felwood.cpp:361-364',
      },
    ],
    onAggro: [
      {
        kind: 'yell',
        textId: SAY_ATTACK_IRONTREE,
        cite:
          'felwood.cpp:366-378 Aggro: first Irontree → SAY_ATTACK_IRONTREE; first Toxic Horror → SAY_ATTACK_TOXIC_HORROR (areiAggro)',
      },
    ],
  },
  cites: [
    'felwood.cpp:308-491 npc_arei',
    'felwood.cpp:314-331 SAY_*/SPELL_*/NPC_*/QUEST constants',
    'felwood.cpp:334-342 aEpilogDialogue delays 4s/5s/3s/7s/0',
    'felwood.cpp:361-364 Reset Wither Strike timer',
    'felwood.cpp:366-378 Aggro Irontree/Horror yells once',
    'felwood.cpp:381-392 JustSummoned Stomper/Wanderer',
    'felwood.cpp:395-403 SummonedCreatureJustDied → epilog',
    'felwood.cpp:406-414 ReceiveAIEvent START_ESCORT',
    'felwood.cpp:417-426 WP37 ambush summons',
    'felwood.cpp:437-458 JustDidDialogueStep transform + credit 4261',
    'felwood.cpp:461-477 UpdateEscortAI DialogueUpdate + Wither Strike + melee',
    'felwood.cpp:485-490 QuestAccept 4261 SendAIEvent',
  ],
};
