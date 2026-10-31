// Wetlands ScriptDev IR ports. Source: eastern_kingdoms/wetlands.cpp — npc_tapoke_slim_jahn,
// npc_mikhail and go_flagongut_fossil. Summon 4971 is absent from bake.

import type { ScriptDevIR } from './types.ts';

// Constants — wetlands.cpp npc_tapoke_slim_jahn / npc_mikhail

// wetlands.cpp:40–52
/** Cite: wetlands.cpp:40 SAY_SLIM_AGGRO = -1000977 */
export const SAY_SLIM_AGGRO = -1000977;
/** Cite: wetlands.cpp:41 SAY_SLIM_DEFEAT = -1000978 */
export const SAY_SLIM_DEFEAT = -1000978;
/** Cite: wetlands.cpp:42 SAY_FRIEND_DEFEAT = -1000979 */
export const SAY_FRIEND_DEFEAT = -1000979;
/** Cite: wetlands.cpp:43 SAY_SLIM_NOTES = -1000980 */
export const SAY_SLIM_NOTES = -1000980;

/** Cite: wetlands.cpp:45 QUEST_MISSING_DIPLOMAT11 = 1249 */
export const QUEST_MISSING_DIPLOMAT11 = 1249;
/** Cite: wetlands.cpp:46 FACTION_ENEMY = 168 */
export const FACTION_ENEMY = 168;

/** Cite: wetlands.cpp:48 SPELL_STEALTH = 1785 */
export const SPELL_STEALTH = 1785;
/** Cite: wetlands.cpp:49 SPELL_CALL_FRIENDS = 16457 // summon npc 4971 */
export const SPELL_CALL_FRIENDS = 16457;

/** Cite: wetlands.cpp:51 NPC_SLIMS_FRIEND = 4971 */
export const NPC_SLIMS_FRIEND = 4971;
/** Cite: wetlands.cpp:52 NPC_TAPOKE_SLIM_JAHN = 4962 */
export const NPC_TAPOKE_SLIM_JAHN = 4962;
/** Bake starter/ender for 1249; ScriptName npc_mikhail. Cite: wetlands.cpp:208-223 */
export const NPC_MIKHAIL = 4963;

// TEMPFACTION flags on the WP3 SetFactionTemporary.
// Cite: Creature.h TEMPFACTION_RESTORE_RESPAWN | RESTORE_COMBAT_STOP; wetlands.cpp:105.
export const TEMPFACTION_RESTORE_RESPAWN = 0x01;
export const TEMPFACTION_RESTORE_COMBAT_STOP = 0x02;
export const SLIM_TEMPFACTION_FLAGS =
  TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_RESTORE_COMBAT_STOP;

/** DamageTaken HP% gate while escorting. Cite: wetlands.cpp:141 GetHealthPercent() < 20.0f */
export const SLIM_YIELD_HP_PCT = 20;

// Mikhail → Slim proximity for QuestAccept. Cite: wetlands.cpp:211 GetClosestCreatureWithEntry(..., 25.0f)
export const MIKHAIL_SLIM_SEARCH_YD = 25;

/** Dialogue step delays after yield + JustReachedHome. Cite: wetlands.cpp:55–60 aDiplomatDialogue */
export const SLIM_DIALOGUE = [
  {
    entry: SAY_SLIM_DEFEAT,
    speakerEntry: NPC_TAPOKE_SLIM_JAHN,
    delayMs: 4000,
    cite: 'wetlands.cpp:57 SAY_SLIM_DEFEAT 4000',
  },
  {
    entry: SAY_SLIM_NOTES,
    speakerEntry: NPC_TAPOKE_SLIM_JAHN,
    delayMs: 7000,
    cite: 'wetlands.cpp:58 SAY_SLIM_NOTES 7000',
  },
  {
    entry: QUEST_MISSING_DIPLOMAT11,
    speakerEntry: 0,
    delayMs: 0,
    cite: 'wetlands.cpp:59 QUEST_MISSING_DIPLOMAT11 credit step',
  },
] as const;

// ForcedDespawn delay after dialogue credit / friend yield yell. Cite: wetlands.cpp:146
// ForcedDespawn(1000); :174 ForcedDespawn(1000)
export const SLIM_DESPAWN_MS = 1000;

/** SetRespawnDelay after quest credit despawn. Cite: wetlands.cpp:175 SetRespawnDelay(2) */
export const SLIM_RESPAWN_DELAY_S = 2;

// Constants — wetlands.cpp go_flagongut_fossil

// wetlands.cpp:227–231
/** Cite: wetlands.cpp:227 NPC_PROSPECTOR_WHELGAR = 1077 */
export const NPC_PROSPECTOR_WHELGAR = 1077;
/** Cite: wetlands.cpp:228 SAY_ITEM_LOOTED = 1235 */
export const SAY_ITEM_LOOTED = 1235;
/** Flagongut's Fossil gameobject entry. Cite: wetlands.cpp:231 comment ID: 9630 */
export const GO_FLAGONGUT_FOSSIL = 9630;

// Whelgar search radius on fossil deactivate. Cite: wetlands.cpp:241 GetClosestCreatureWithEntry(...,
// 10.0f)
export const FOSSIL_WHELGAR_SEARCH_YD = 10;

// Pure helpers — Slim Reset / Aggro / DamageTaken / WP / dialogue

export interface SlimCombatState {
  /** m_bFriendSummoned. Cite: wetlands.cpp:71,81 */
  friendSummoned: boolean;
  /** m_bEventComplete. Cite: wetlands.cpp:72,82,151 */
  eventComplete: boolean;
  /** Escorting (HasEscortState STATE_ESCORT_ESCORTING). */
  escorting: boolean;
  /** UNIT_FLAG_IMMUNE_TO_PLAYER. Cite: wetlands.cpp:76,106 */
  immuneToPlayer: boolean;
  /** REACT_PASSIVE vs REACT_AGGRESSIVE. Cite: wetlands.cpp:77,107 */
  reactAggressive: boolean;
  /** Temporary faction while hostile. Cite: wetlands.cpp:105 */
  factionId: number | null;
  /** Stealth aura present. Cite: wetlands.cpp:104 RemoveAurasDueToSpell */
  stealthed: boolean;
}

/** Idle pre-escort state after ctor Reset. Cite: wetlands.cpp:65-69 ctor Reset; :74-84 Reset body */
export function slimInitialState(): SlimCombatState {
  return {
    friendSummoned: false,
    eventComplete: false,
    escorting: false,
    immuneToPlayer: true,
    reactAggressive: false,
    factionId: null,
    stealthed: true,
  };
}

// Port of npc_tapoke_slim_jahnAI::Reset. Cite: wetlands.cpp:74–84 Always sets immune + REACT_PASSIVE.
// Clears friend/event flags only when not escorting.
export function slimReset(prior: SlimCombatState): SlimCombatState {
  if (prior.escorting) {
    return {
      ...prior,
      immuneToPlayer: true,
      reactAggressive: false,
    };
  }
  return {
    friendSummoned: false,
    eventComplete: false,
    escorting: false,
    immuneToPlayer: true,
    reactAggressive: false,
    factionId: prior.factionId,
    stealthed: prior.stealthed,
  };
}

export interface SlimWaypointResult {
  handled: boolean;
  setRun: boolean;
  removeStealth: boolean;
  factionId: number | null;
  factionFlags: number;
  stripImmune: boolean;
  reactAggressive: boolean;
  /** WP7 escape: quest fail via JustDied(player). */
  questFail: boolean;
  cite: string;
}

/** Port of WaypointReached. Cite: wetlands.cpp:98–115 */
export function slimWaypointReached(pointId: number): SlimWaypointResult {
  if (pointId === 3) {
    return {
      handled: true,
      setRun: true,
      removeStealth: true,
      factionId: FACTION_ENEMY,
      factionFlags: SLIM_TEMPFACTION_FLAGS,
      stripImmune: true,
      reactAggressive: true,
      questFail: false,
      cite: 'wetlands.cpp:102-108 case 3 SetRun + strip stealth + faction 168 + aggressive',
    };
  }
  if (pointId === 7) {
    return {
      handled: true,
      setRun: false,
      removeStealth: false,
      factionId: null,
      factionFlags: 0,
      stripImmune: false,
      reactAggressive: false,
      questFail: true,
      cite: 'wetlands.cpp:109-113 case 7 escape → JustDied(player) quest fail',
    };
  }
  return {
    handled: false,
    setRun: false,
    removeStealth: false,
    factionId: null,
    factionFlags: 0,
    stripImmune: false,
    reactAggressive: false,
    questFail: false,
    cite: 'wetlands.cpp:98-115 no case for this pointId',
  };
}

export interface SlimAggroResult {
  castCallFriends: boolean;
  spellId: number | null;
  textId: number | null;
  next: SlimCombatState;
  cite: string;
}

/** Port of Aggro while escorting (one-shot Call Friends). Cite: wetlands.cpp:117–127 */
export function slimAggro(state: SlimCombatState): SlimAggroResult {
  if (!state.escorting || state.friendSummoned) {
    return {
      castCallFriends: false,
      spellId: null,
      textId: null,
      next: state,
      cite: state.escorting
        ? 'wetlands.cpp:119 friend already summoned → no-op'
        : 'wetlands.cpp:119 !escorting → no Call Friends',
    };
  }
  return {
    castCallFriends: true,
    spellId: SPELL_CALL_FRIENDS,
    textId: SAY_SLIM_AGGRO,
    next: { ...state, friendSummoned: true },
    cite: 'wetlands.cpp:121-125 DoCast SPELL_CALL_FRIENDS + SAY_SLIM_AGGRO + m_bFriendSummoned',
  };
}

export interface SlimDamageTakenResult {
  clampDamage: boolean;
  damageOut: number;
  friendDefeatTextId: number | null;
  friendDespawnMs: number;
  eventComplete: boolean;
  pauseEscort: boolean;
  enterEvade: boolean;
  next: SlimCombatState;
  cite: string;
}

// Port of DamageTaken yield while escorting. Cite: wetlands.cpp:136–156 Yields when GetHealthPercent() < 20
// OR damage > health (would kill). Clamps to leave 1 HP; despawns friend; pauses escort; EnterEvadeMode.
export function slimDamageTaken(
  state: SlimCombatState,
  health: number,
  maxHealth: number,
  damage: number,
  friendAlive: boolean,
): SlimDamageTakenResult {
  if (!state.escorting) {
    return {
      clampDamage: false,
      damageOut: damage,
      friendDefeatTextId: null,
      friendDespawnMs: 0,
      eventComplete: false,
      pauseEscort: false,
      enterEvade: false,
      next: state,
      cite: 'wetlands.cpp:138-139 !escorting → return',
    };
  }
  if (maxHealth <= 0 || health <= 0) {
    return {
      clampDamage: false,
      damageOut: damage,
      friendDefeatTextId: null,
      friendDespawnMs: 0,
      eventComplete: false,
      pauseEscort: false,
      enterEvade: false,
      next: state,
      cite: 'wetlands.cpp:136-156 invalid health',
    };
  }
  const hpPct = (health * 100) / maxHealth;
  const wouldKill = damage > health;
  const yieldNow = hpPct < SLIM_YIELD_HP_PCT || wouldKill;
  if (!yieldNow) {
    return {
      clampDamage: false,
      damageOut: damage,
      friendDefeatTextId: null,
      friendDespawnMs: 0,
      eventComplete: false,
      pauseEscort: false,
      enterEvade: false,
      next: state,
      cite: 'wetlands.cpp:141 HP still >= 20% and not lethal → no-op',
    };
  }
  const damageOut = Math.min(damage, Math.max(health - 1, 0));
  return {
    clampDamage: true,
    damageOut,
    friendDefeatTextId: friendAlive ? SAY_FRIEND_DEFEAT : null,
    friendDespawnMs: friendAlive ? SLIM_DESPAWN_MS : 0,
    eventComplete: true,
    pauseEscort: true,
    enterEvade: true,
    next: { ...state, eventComplete: true },
    cite: 'wetlands.cpp:141-154 clamp + friend defeat + m_bEventComplete + pause + evade',
  };
}

export interface SlimReachedHomeResult {
  startDialogue: boolean;
  facePlayer: boolean;
  firstTextId: number | null;
  cite: string;
}

/** Port of JustReachedHome after yield. Cite: wetlands.cpp:86–96 */
export function slimReachedHome(state: SlimCombatState): SlimReachedHomeResult {
  if (!state.eventComplete) {
    return {
      startDialogue: false,
      facePlayer: false,
      firstTextId: null,
      cite: 'wetlands.cpp:89 !m_bEventComplete → no dialogue',
    };
  }
  return {
    startDialogue: true,
    facePlayer: true,
    firstTextId: SAY_SLIM_DEFEAT,
    cite: 'wetlands.cpp:91-94 face player + StartNextDialogueText(SAY_SLIM_DEFEAT)',
  };
}

export interface SlimDialogueStepResult {
  handled: boolean;
  textId: number | null;
  /** Arm next dialogue delay ms (0 = terminal credit step). */
  nextDelayMs: number;
  questCredit: boolean;
  questId: number | null;
  forceDespawnMs: number;
  respawnDelayS: number;
  cite: string;
}

// Port of JustDidDialogueStep and its delay table: 0 is SAY_SLIM_DEFEAT, 1 SAY_SLIM_NOTES,
// 2 the quest credit. Cite: wetlands.cpp:55–60, :165–177.
export function slimDialogueStep(stepIndex: number): SlimDialogueStepResult {
  const step = SLIM_DIALOGUE[stepIndex];
  if (!step) {
    return {
      handled: false,
      textId: null,
      nextDelayMs: 0,
      questCredit: false,
      questId: null,
      forceDespawnMs: 0,
      respawnDelayS: 0,
      cite: 'wetlands.cpp:55-60 dialogue step out of range',
    };
  }
  if (step.entry === QUEST_MISSING_DIPLOMAT11) {
    return {
      handled: true,
      textId: null,
      nextDelayMs: 0,
      questCredit: true,
      questId: QUEST_MISSING_DIPLOMAT11,
      forceDespawnMs: SLIM_DESPAWN_MS,
      respawnDelayS: SLIM_RESPAWN_DELAY_S,
      cite: 'wetlands.cpp:167-175 QUEST 1249 explore credit + ForcedDespawn(1000) + RespawnDelay(2)',
    };
  }
  return {
    handled: true,
    textId: step.entry,
    nextDelayMs: step.delayMs,
    questCredit: false,
    questId: null,
    forceDespawnMs: 0,
    respawnDelayS: 0,
    cite: step.cite,
  };
}

export interface SlimStartEscortResult {
  handled: boolean;
  startEscort: boolean;
  questId: number;
  cite: string;
}

/** Port of ReceiveAIEvent AI_EVENT_START_ESCORT. Cite: wetlands.cpp:158–163 */
export function slimStartEscort(
  eventIsStartEscort: boolean,
  invokerIsPlayer: boolean,
  questId: number,
): SlimStartEscortResult {
  if (!eventIsStartEscort || !invokerIsPlayer) {
    return {
      handled: false,
      startEscort: false,
      questId,
      cite: 'wetlands.cpp:161 !START_ESCORT or !player → no-op',
    };
  }
  return {
    handled: true,
    startEscort: true,
    questId,
    cite: 'wetlands.cpp:162 Start(false, player, quest, true)',
  };
}

// Pure helpers — Mikhail QuestAccept

export interface MikhailQuestAcceptResult {
  handled: boolean;
  /** Need closest Slim within MIKHAIL_SLIM_SEARCH_YD. */
  requireSlimWithinYd: number;
  /** Cast stealth on Slim when he lacks the aura. */
  castStealthIfMissing: boolean;
  stealthSpellId: number;
  /** Send AI_EVENT_START_ESCORT to Slim with quest id. */
  sendStartEscort: boolean;
  questId: number;
  cite: string;
}

// Port of QuestAccept_npc_mikhail.
// Cite: wetlands.cpp:207–223.
export function mikhailQuestAccept(
  questId: number,
  slimFound: boolean,
): MikhailQuestAcceptResult {
  if (questId !== QUEST_MISSING_DIPLOMAT11) {
    return {
      handled: false,
      requireSlimWithinYd: 0,
      castStealthIfMissing: false,
      stealthSpellId: 0,
      sendStartEscort: false,
      questId,
      cite: 'wetlands.cpp:209 quest != 1249 → return false',
    };
  }
  if (!slimFound) {
    return {
      handled: false,
      requireSlimWithinYd: MIKHAIL_SLIM_SEARCH_YD,
      castStealthIfMissing: false,
      stealthSpellId: 0,
      sendStartEscort: false,
      questId: QUEST_MISSING_DIPLOMAT11,
      cite: 'wetlands.cpp:211-213 no Slim within 25y → return false',
    };
  }
  return {
    handled: true,
    requireSlimWithinYd: MIKHAIL_SLIM_SEARCH_YD,
    castStealthIfMissing: true,
    stealthSpellId: SPELL_STEALTH,
    sendStartEscort: true,
    questId: QUEST_MISSING_DIPLOMAT11,
    cite: 'wetlands.cpp:215-218 stealth if needed + SendAIEvent START_ESCORT to Slim',
  };
}

// Pure helpers — Flagongut fossil GO

export interface FlagongutFossilLootResult {
  handled: boolean;
  /** Only fires on GO_JUST_DEACTIVATED. */
  requireJustDeactivated: boolean;
  whelgarSearchYd: number;
  whelgarEntry: number;
  /** EMOTE_ONESHOT_TALK on Whelgar. */
  emoteTalk: boolean;
  textId: number | null;
  cite: string;
}

// Port of go_flagongut_fossil::OnLootStateChange.
// Cite: wetlands.cpp:237–247.
export function flagongutFossilOnLootStateChange(
  justDeactivated: boolean,
  whelgarFound: boolean,
): FlagongutFossilLootResult {
  if (!justDeactivated) {
    return {
      handled: false,
      requireJustDeactivated: true,
      whelgarSearchYd: FOSSIL_WHELGAR_SEARCH_YD,
      whelgarEntry: NPC_PROSPECTOR_WHELGAR,
      emoteTalk: false,
      textId: null,
      cite: 'wetlands.cpp:239 loot state != GO_JUST_DEACTIVATED → no-op',
    };
  }
  if (!whelgarFound) {
    return {
      handled: false,
      requireJustDeactivated: true,
      whelgarSearchYd: FOSSIL_WHELGAR_SEARCH_YD,
      whelgarEntry: NPC_PROSPECTOR_WHELGAR,
      emoteTalk: false,
      textId: null,
      cite: 'wetlands.cpp:241 no Whelgar within 10y → no-op',
    };
  }
  return {
    handled: true,
    requireJustDeactivated: true,
    whelgarSearchYd: FOSSIL_WHELGAR_SEARCH_YD,
    whelgarEntry: NPC_PROSPECTOR_WHELGAR,
    emoteTalk: true,
    textId: SAY_ITEM_LOOTED,
    cite: 'wetlands.cpp:243-245 HandleEmote TALK + DoBroadcastText(1235)',
  };
}

// ScriptDev IR — npc_tapoke_slim_jahn

// npc_tapoke_slim_jahnAI, creature 4962. No UpdateAI cast timers — one Call Friends on aggro while
// escorting, then a yield below 20% modelled as a phase. Summon 4971 is absent from bake.
export const NPC_TAPOKE_SLIM_JAHN_SCRIPT: ScriptDevIR = {
  name: 'npc_tapoke_slim_jahn',
  boundCreatures: [NPC_TAPOKE_SLIM_JAHN],
  sourceFile: 'eastern_kingdoms/wetlands.cpp',
  spellIds: [SPELL_STEALTH, SPELL_CALL_FRIENDS],
  timers: [],
  phases: [
    {
      phase: 1,
      hpBelowPct: SLIM_YIELD_HP_PCT,
      actions: [
        {
          kind: 'stop_combat',
          cite: 'wetlands.cpp:153-154 SetEscortPaused + EnterEvadeMode (yield)',
        },
        {
          kind: 'flavor',
          text: 'm_bEventComplete + friend SAY_FRIEND_DEFEAT + ForcedDespawn(1000); JustReachedHome dialogue → explore 1249',
          cite: 'wetlands.cpp:141-154,86-96,165-177; slimDamageTaken / slimDialogueStep pure helpers',
        },
      ],
      cite: 'wetlands.cpp:141 GetHealthPercent() < 20.0f DamageTaken yield while escorting',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'UNIT_FLAG_IMMUNE_TO_PLAYER + REACT_PASSIVE; clear friend/event flags when !escorting',
        cite: 'wetlands.cpp:74-84',
      },
    ],
    onAggro: [
      {
        kind: 'cast_self',
        spellId: SPELL_CALL_FRIENDS,
        cite: 'wetlands.cpp:121 DoCastSpellIfCan SPELL_CALL_FRIENDS 16457 (once while escorting)',
      },
      {
        kind: 'yell',
        textId: SAY_SLIM_AGGRO,
        cite: 'wetlands.cpp:123 DoScriptText SAY_SLIM_AGGRO=-1000977',
      },
      {
        kind: 'summon',
        spellId: SPELL_CALL_FRIENDS,
        creatureEntry: NPC_SLIMS_FRIEND,
        cite: 'wetlands.cpp:49,121 SPELL_CALL_FRIENDS summons NPC_SLIMS_FRIEND 4971; JustSummoned AttackStart player',
      },
    ],
    onEvade: [
      {
        kind: 'flavor',
        text: 'JustReachedHome: if m_bEventComplete face player + StartNextDialogueText(SAY_SLIM_DEFEAT)',
        cite: 'wetlands.cpp:86-96',
      },
    ],
  },
  unusedBindings: [
    {
      entry: NPC_SLIMS_FRIEND,
      kind: 'creature',
      reason:
        'NPC 4971 Slim\'s Friend is Call Friends summon-only (wetlands.cpp:49,121,129-134); absent from product bake - IR ported; SPELL_CALL_FRIENDS 16457 rawEffects SUMMON_GUARDIAN miscValue 4971 + JustSummoned AttackStart + SAY_FRIEND_DEFEAT on yield documented in slimAggro / slimDamageTaken',
      cite: 'wetlands.cpp:49-51,121-134,143-147; loadRealBundle missing 4971',
    },
  ],
  cites: [
    'wetlands.cpp:34-201 npc_tapoke_slim_jahn',
    'wetlands.cpp:40-52 SAY_* QUEST=1249 FACTION=168 SPELL_STEALTH=1785 SPELL_CALL_FRIENDS=16457 NPC_SLIMS_FRIEND=4971',
    'wetlands.cpp:55-60 aDiplomatDialogue 4000/7000/credit',
    'wetlands.cpp:74-84 Reset immune + REACT_PASSIVE; clear flags !escorting',
    'wetlands.cpp:86-96 JustReachedHome dialogue after yield',
    'wetlands.cpp:98-115 WaypointReached WP3 hostile / WP7 escape fail',
    'wetlands.cpp:117-127 Aggro Call Friends once + SAY_SLIM_AGGRO',
    'wetlands.cpp:129-134 JustSummoned AttackStart player',
    'wetlands.cpp:136-156 DamageTaken <20% yield clamp + friend despawn',
    'wetlands.cpp:158-163 ReceiveAIEvent START_ESCORT',
    'wetlands.cpp:165-177 JustDidDialogueStep explore 1249 + despawn',
    'wetlands.cpp:187-195 UpdateEscortAI DialogueUpdate + melee only',
  ],
};

// ScriptDev IR — npc_mikhail

// QuestAccept_npc_mikhail, creature 4963 — a quest-accept hook only, with no creature AI. The QI4
// registry owns the accept frame; the stealth and START_ESCORT send are a pure helper.
export const NPC_MIKHAIL_SCRIPT: ScriptDevIR = {
  name: 'npc_mikhail',
  boundCreatures: [NPC_MIKHAIL],
  sourceFile: 'eastern_kingdoms/wetlands.cpp',
  spellIds: [SPELL_STEALTH],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'No AI Reset - QuestAccept only (stealth Slim + SendAIEvent START_ESCORT)',
        cite: 'wetlands.cpp:207-223',
      },
    ],
  },
  cites: [
    'wetlands.cpp:203-223 npc_mikhail QuestAccept',
    'wetlands.cpp:209-218 quest 1249 → Slim ≤25y → stealth 1785 if needed → START_ESCORT',
    'wetlands.cpp:268-270 RegisterSelf pQuestAcceptNPC',
  ],
};

// ScriptDev IR — go_flagongut_fossil

// go_flagongut_fossil GameObjectAI on GO 9630 — OnLootStateChange chrome only, with no combat
// and no quest credit in ScriptDev.
export const GO_FLAGONGUT_FOSSIL_SCRIPT: ScriptDevIR = {
  name: 'go_flagongut_fossil',
  boundCreatures: [],
  boundGos: [GO_FLAGONGUT_FOSSIL],
  sourceFile: 'eastern_kingdoms/wetlands.cpp',
  spellIds: [],
  timers: [],
  goUse: {
    goEntries: [GO_FLAGONGUT_FOSSIL],
    actions: [
      {
        kind: 'flavor',
        text: 'OnLootStateChange GO_JUST_DEACTIVATED: closest Whelgar 1077 ≤10y EMOTE_ONESHOT_TALK + DoBroadcastText(1235)',
        cite: 'wetlands.cpp:237-247',
      },
    ],
    cite: 'wetlands.cpp:237-247 OnLootStateChange (loot deactivate chrome; not pGOUse combat)',
  },
  cites: [
    'wetlands.cpp:225-253 go_flagongut_fossil',
    'wetlands.cpp:227-228 NPC_PROSPECTOR_WHELGAR=1077 SAY_ITEM_LOOTED=1235',
    'wetlands.cpp:231 Flagongut Fossil ID 9630',
    'wetlands.cpp:237-247 OnLootStateChange JUST_DEACTIVATED → Whelgar talk 1235',
    'wetlands.cpp:272-275 RegisterSelf GetGameObjectAI',
  ],
};
