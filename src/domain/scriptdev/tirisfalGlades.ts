// Tirisfal Glades ScriptDev IR ports. Source: eastern_kingdoms/tirisfal_glades.cpp —
// go_mausoleum_door, go_mausoleum_trigger and npc_calvin_montague. Both GOs are absent from bake.

import type { ScriptDevIR } from './types.ts';

// Constants — tirisfal_glades.cpp go_mausoleum_* + npc_calvin_montague

// tirisfal_glades.cpp:39–45
/** Cite: tirisfal_glades.cpp:41 QUEST_ULAG = 1819 */
export const QUEST_ULAG = 1819;
/** Cite: tirisfal_glades.cpp:42 NPC_ULAG = 6390 */
export const NPC_ULAG = 6390;
/** Cite: tirisfal_glades.cpp:43 GO_TRIGGER = 104593 */
export const GO_TRIGGER = 104593;
/** Cite: tirisfal_glades.cpp:44 GO_DOOR = 176594 */
export const GO_DOOR = 176594;

// tirisfal_glades.cpp:81–87
/** Cite: tirisfal_glades.cpp:83 SAY_COMPLETE = -1000356 */
export const SAY_COMPLETE = -1000356;
/** Cite: tirisfal_glades.cpp:84 SPELL_DRINK_SD = 2639 (Food; iconId comment in cpp) */
export const SPELL_DRINK_SD = 2639;
/** Cite: tirisfal_glades.cpp:85 QUEST_590 = 590 */
export const QUEST_590 = 590;
/** Cite: tirisfal_glades.cpp:86 FACTION_HOSTILE = 168 */
export const FACTION_HOSTILE = 168;
/** Calvin Montague — bound creature. Cite: corpus boundCreatures entry 6784 */
export const NPC_CALVIN_MONTAGUE = 6784;
/** Bake starter/ender for 1819. */
export const NPC_DEATHGUARD_DILLINGER = 1496;

/** DamageTaken HP% gate — yield when post-hit HP would be < 15%. Cite: tirisfal_glades.cpp:111 */
export const CALVIN_YIELD_HP_PCT = 15;

/** Reset / pre-yield phase timer arm. Cite: tirisfal_glades.cpp:103 m_uiPhaseTimer = 5000 */
export const CALVIN_PHASE_TIMER_INIT_MS = 5000;

/** Re-arm between phase steps after first fire. Cite: tirisfal_glades.cpp:130 m_uiPhaseTimer = 7500 */
export const CALVIN_PHASE_TIMER_STEP_MS = 7500;

// TEMPFACTION flags for QuestAccept SetFactionTemporary. Cite: Creature.h:577–578; tirisfal_glades.cpp:175
// TEMPFACTION_RESTORE_COMBAT_STOP | TEMPFACTION_RESTORE_RESPAWN
export const TEMPFACTION_RESTORE_RESPAWN = 0x01;
export const TEMPFACTION_RESTORE_COMBAT_STOP = 0x02;
export const CALVIN_TEMPFACTION_FLAGS =
  TEMPFACTION_RESTORE_COMBAT_STOP | TEMPFACTION_RESTORE_RESPAWN;

// UNIT_FLAG_IMMUNE_TO_PLAYER — Reset sets immune; accept clears. Cite: Unit.h:476 = 0x00000100;
// tirisfal_glades.cpp:105,174
export const UNIT_FLAG_IMMUNE_TO_PLAYER = 0x00000100;

// GO_FLAG_INTERACT_COND removed from door by trigger use. Cite: SharedDefines.h:556 = 0x00000004;
// tirisfal_glades.cpp:70
export const GO_FLAG_INTERACT_COND = 0x00000004;

/** Closest GO search radius for trigger↔door pairing. Cite: tirisfal_glades.cpp:52 / :67 30.0f */
export const MAUSOLEUM_GO_SEARCH_YD = 30;

/** Ulag summon position + despawn. Cite: tirisfal_glades.cpp:55 */
export const ULAG_SPAWN = {
  x: 2390.26,
  y: 336.47,
  z: 40.01,
  o: 2.26,
  despawnMs: 300_000,
  cite: 'tirisfal_glades.cpp:55 SummonCreature NPC_ULAG TEMPSPAWN 300000',
} as const;

// Pure helpers — Calvin Montague

export interface CalvinQuestAcceptResult {
  handled: boolean;
  clearImmuneToPlayer: boolean;
  factionId: number;
  factionFlags: number;
  attackStart: boolean;
  cite: string;
}

/** Port of QuestAccept_npc_calvin_montague. Cite: tirisfal_glades.cpp:170–178 */
export function calvinQuestAccept(questId: number): CalvinQuestAcceptResult {
  if (questId !== QUEST_590) {
    return {
      handled: false,
      clearImmuneToPlayer: false,
      factionId: 0,
      factionFlags: 0,
      attackStart: false,
      cite: 'tirisfal_glades.cpp:172 quest != 590 → no-op (still returns true in cpp)',
    };
  }
  return {
    handled: true,
    clearImmuneToPlayer: true,
    factionId: FACTION_HOSTILE,
    factionFlags: CALVIN_TEMPFACTION_FLAGS,
    attackStart: true,
    cite: 'tirisfal_glades.cpp:174-176 strip immune + FACTION_HOSTILE 168 + AttackStart',
  };
}

export interface CalvinDamageTakenResult {
  /** Clamp damage so at least 1 HP remains. */
  clampDamage: boolean;
  damageOut: number;
  /** Enter phase machine (m_uiPhase = 1). */
  startPhase: boolean;
  stopCombat: boolean;
  /** React passive while phase machine runs. */
  reactPassive: boolean;
  /** Remember player dealer for AreaExploredOrEventHappens. */
  storePlayerGuid: boolean;
  cite: string;
}

// Port of npc_calvin_montagueAI::DamageTaken. Cite: tirisfal_glades.cpp:109–122 Yields when damage would
// kill OR post-hit HP% would be < 15. Does NOT grant quest credit here — credit is phase 2 of UpdateAI.
export function calvinDamageTaken(
  health: number,
  maxHealth: number,
  damage: number,
  dealerIsPlayer: boolean,
): CalvinDamageTakenResult {
  if (maxHealth <= 0 || health <= 0) {
    return {
      clampDamage: false,
      damageOut: damage,
      startPhase: false,
      stopCombat: false,
      reactPassive: false,
      storePlayerGuid: false,
      cite: 'tirisfal_glades.cpp:109-122 invalid health',
    };
  }
  const wouldKill = damage > health;
  const postHp = health - damage;
  const postPct = (postHp * 100) / maxHealth;
  const yieldNow = wouldKill || postPct < CALVIN_YIELD_HP_PCT;
  if (!yieldNow) {
    return {
      clampDamage: false,
      damageOut: damage,
      startPhase: false,
      stopCombat: false,
      reactPassive: false,
      storePlayerGuid: false,
      cite: 'tirisfal_glades.cpp:111 HP still >= 15% after hit → no-op',
    };
  }
  const damageOut = Math.min(damage, Math.max(health - 1, 0));
  return {
    clampDamage: true,
    damageOut,
    startPhase: true,
    stopCombat: true,
    reactPassive: true,
    storePlayerGuid: dealerIsPlayer,
    cite: 'tirisfal_glades.cpp:111-121 clamp + CombatStop + REACT_PASSIVE + phase=1',
  };
}

export interface CalvinPhaseState {
  /** m_uiPhase (0 = combat melee; 1–3 = post-yield sequence). */
  phase: number;
  /** m_uiPhaseTimer remaining ms. */
  phaseTimerMs: number;
  /** Player guid stored on yield (for AreaExploredOrEventHappens). */
  hasPlayerGuid: boolean;
}

export interface CalvinPhaseTickResult {
  /** Still waiting on phase timer. */
  waiting: boolean;
  /** Actions fired this tick (empty when waiting or phase 0). */
  textId: number | null;
  questCredit: boolean;
  questId: number | null;
  castSpellId: number | null;
  enterEvade: boolean;
  next: CalvinPhaseState;
  cite: string;
}

/** Idle pre-fight / Reset state. Cite: tirisfal_glades.cpp:100–107 */
export function calvinInitialState(): CalvinPhaseState {
  return {
    phase: 0,
    phaseTimerMs: CALVIN_PHASE_TIMER_INIT_MS,
    hasPlayerGuid: false,
  };
}

// Apply DamageTaken yield onto phase state (phase=1; timer stays at Reset 5000). Cite:
// tirisfal_glades.cpp:118 phase=1; timer not re-armed on yield
export function calvinStartPhase(
  prior: CalvinPhaseState,
  hasPlayerGuid: boolean,
): CalvinPhaseState {
  return {
    phase: 1,
    // Timer is only consumed while m_uiPhase != 0; Reset arm (5000) is the wait.
    phaseTimerMs: prior.phaseTimerMs > 0 ? prior.phaseTimerMs : CALVIN_PHASE_TIMER_INIT_MS,
    hasPlayerGuid,
  };
}

// Port of the npc_calvin_montagueAI::UpdateAI phase branch: while the phase is non-zero the timer
// counts down and re-arms at 7500 on each case. Cite: tirisfal_glades.cpp:125–155.
export function calvinPhaseTick(
  state: CalvinPhaseState,
  diffMs: number,
): CalvinPhaseTickResult {
  if (state.phase === 0) {
    return {
      waiting: false,
      textId: null,
      questCredit: false,
      questId: null,
      castSpellId: null,
      enterEvade: false,
      next: state,
      cite: 'tirisfal_glades.cpp:125 !m_uiPhase → melee path',
    };
  }
  // Cite: tirisfal_glades.cpp:129-135 timer subtract or fire
  if (!(state.phaseTimerMs < diffMs)) {
    return {
      waiting: true,
      textId: null,
      questCredit: false,
      questId: null,
      castSpellId: null,
      enterEvade: false,
      next: { ...state, phaseTimerMs: state.phaseTimerMs - diffMs },
      cite: 'tirisfal_glades.cpp:133-134 m_uiPhaseTimer -= uiDiff',
    };
  }
  // Fire: re-arm 7500 then switch (cpp sets timer before switch)
  const rearmed: CalvinPhaseState = {
    ...state,
    phaseTimerMs: CALVIN_PHASE_TIMER_STEP_MS,
  };
  switch (state.phase) {
    case 1:
      return {
        waiting: false,
        textId: SAY_COMPLETE,
        questCredit: false,
        questId: null,
        castSpellId: null,
        enterEvade: false,
        next: { ...rearmed, phase: 2 },
        cite: 'tirisfal_glades.cpp:139-141 case 1 DoScriptText(SAY_COMPLETE) ++phase',
      };
    case 2:
      return {
        waiting: false,
        textId: null,
        questCredit: state.hasPlayerGuid,
        questId: state.hasPlayerGuid ? QUEST_590 : null,
        castSpellId: SPELL_DRINK_SD,
        enterEvade: false,
        next: { ...rearmed, phase: 3 },
        cite: 'tirisfal_glades.cpp:143-148 case 2 explore 590 + CastSpell 2639 ++phase',
      };
    case 3:
      return {
        waiting: false,
        textId: null,
        questCredit: false,
        questId: null,
        castSpellId: null,
        enterEvade: true,
        next: { ...rearmed, phase: 3 },
        cite: 'tirisfal_glades.cpp:150-152 case 3 EnterEvadeMode',
      };
    default:
      return {
        waiting: false,
        textId: null,
        questCredit: false,
        questId: null,
        castSpellId: null,
        enterEvade: false,
        next: rearmed,
        cite: 'tirisfal_glades.cpp:137-153 no case for phase',
      };
  }
}

// Pure helpers — mausoleum GO chain (quest 1819)

export interface MausoleumTriggerUseResult {
  handled: boolean;
  /** SetGoState(GO_STATE_ACTIVE) on trigger. */
  setTriggerActive: boolean;
  /** Remove GO_FLAG_INTERACT_COND from door. */
  unlockDoor: boolean;
  doorGoEntry: number;
  cite: string;
}

// Port of GOUse_go_mausoleum_trigger.
// Cite: tirisfal_glades.cpp:62–75.
export function mausoleumTriggerUse(
  questIncomplete: boolean,
  doorNearby: boolean,
): MausoleumTriggerUseResult {
  if (!questIncomplete) {
    return {
      handled: false,
      setTriggerActive: false,
      unlockDoor: false,
      doorGoEntry: GO_DOOR,
      cite: 'tirisfal_glades.cpp:64-65 quest 1819 not incomplete → return false',
    };
  }
  if (!doorNearby) {
    return {
      handled: false,
      setTriggerActive: false,
      unlockDoor: false,
      doorGoEntry: GO_DOOR,
      cite: 'tirisfal_glades.cpp:67 no door within 30yd → return false',
    };
  }
  return {
    handled: true,
    setTriggerActive: true,
    unlockDoor: true,
    doorGoEntry: GO_DOOR,
    cite: 'tirisfal_glades.cpp:69-71 SetGoState(ACTIVE) + door RemoveFlag(INTERACT_COND)',
  };
}

export interface MausoleumDoorUseResult {
  handled: boolean;
  /** SetGoState(GO_STATE_READY) on trigger. */
  setTriggerReady: boolean;
  /** Summon Ulag. */
  summonUlag: boolean;
  creatureEntry: number;
  x: number;
  y: number;
  z: number;
  o: number;
  despawnMs: number;
  cite: string;
}

// Port of GOUse_go_mausoleum_door.
// Cite: tirisfal_glades.cpp:47–59.
export function mausoleumDoorUse(
  questIncomplete: boolean,
  triggerNearby: boolean,
): MausoleumDoorUseResult {
  if (!questIncomplete) {
    return {
      handled: false,
      setTriggerReady: false,
      summonUlag: false,
      creatureEntry: NPC_ULAG,
      x: ULAG_SPAWN.x,
      y: ULAG_SPAWN.y,
      z: ULAG_SPAWN.z,
      o: ULAG_SPAWN.o,
      despawnMs: ULAG_SPAWN.despawnMs,
      cite: 'tirisfal_glades.cpp:49-50 quest 1819 not incomplete → return false',
    };
  }
  if (!triggerNearby) {
    return {
      handled: false,
      setTriggerReady: false,
      summonUlag: false,
      creatureEntry: NPC_ULAG,
      x: ULAG_SPAWN.x,
      y: ULAG_SPAWN.y,
      z: ULAG_SPAWN.z,
      o: ULAG_SPAWN.o,
      despawnMs: ULAG_SPAWN.despawnMs,
      cite: 'tirisfal_glades.cpp:52 no trigger within 30yd → return false',
    };
  }
  return {
    handled: true,
    setTriggerReady: true,
    summonUlag: true,
    creatureEntry: NPC_ULAG,
    x: ULAG_SPAWN.x,
    y: ULAG_SPAWN.y,
    z: ULAG_SPAWN.z,
    o: ULAG_SPAWN.o,
    despawnMs: ULAG_SPAWN.despawnMs,
    cite: 'tirisfal_glades.cpp:54-56 trigger READY + SummonCreature Ulag 6390',
  };
}

// go_mausoleum_door

// GOUse_go_mausoleum_door on GO 176594, absent from the product bake so the binding is unused.
// With quest 1819 incomplete and the trigger within 30 yd it summons Ulag 6390.
export const GO_MAUSOLEUM_DOOR: ScriptDevIR = {
  name: 'go_mausoleum_door',
  boundCreatures: [],
  boundGos: [GO_DOOR],
  sourceFile: 'eastern_kingdoms/tirisfal_glades.cpp',
  spellIds: [],
  timers: [],
  goUse: {
    goEntries: [GO_DOOR],
    // No instance data gates — quest incomplete is pure-helper / host FO6.
    actions: [
      {
        kind: 'summon',
        creatureEntry: NPC_ULAG,
        cite: 'tirisfal_glades.cpp:55 SummonCreature(NPC_ULAG=6390) when quest 1819 incomplete + trigger nearby',
      },
    ],
    cite: 'tirisfal_glades.cpp:47-59 GOUse_go_mausoleum_door; mausoleumDoorUse pure helper',
  },
  unusedBindings: [
    {
      entry: GO_DOOR,
      kind: 'go',
      reason:
        'GO 176594 mausoleum door is ScriptName-bound in DB but absent from product bake - IR + pure helper ported; QI4 frame residual SummonCreature Ulag for quest 1819',
      cite: 'tirisfal_glades.cpp:44,47-59; loadRealBundle missing 176594',
    },
  ],
  cites: [
    'tirisfal_glades.cpp:34-60 go_mausoleum_door',
    'tirisfal_glades.cpp:41-44 QUEST_ULAG=1819 NPC_ULAG=6390 GO_TRIGGER=104593 GO_DOOR=176594',
    'tirisfal_glades.cpp:49-50 quest incomplete gate',
    'tirisfal_glades.cpp:52-56 trigger READY + SummonCreature coords + 300000 despawn',
    'tirisfal_glades.cpp:183-186 RegisterSelf go_mausoleum_door',
  ],
};

// go_mausoleum_trigger

// GOUse_go_mausoleum_trigger on GO 104593, absent from the product bake so the binding is unused.
// It clears the door's INTERACT_COND so the player can open the mausoleum.
export const GO_MAUSOLEUM_TRIGGER: ScriptDevIR = {
  name: 'go_mausoleum_trigger',
  boundCreatures: [],
  boundGos: [GO_TRIGGER],
  sourceFile: 'eastern_kingdoms/tirisfal_glades.cpp',
  spellIds: [],
  timers: [],
  goUse: {
    goEntries: [GO_TRIGGER],
    actions: [
      {
        kind: 'flavor',
        text: 'SetGoState(ACTIVE) on self + RemoveFlag(GO_FLAG_INTERACT_COND) on closest GO_DOOR within 30yd when quest 1819 incomplete',
        cite: 'tirisfal_glades.cpp:69-71; mausoleumTriggerUse pure helper',
      },
    ],
    cite: 'tirisfal_glades.cpp:62-75 GOUse_go_mausoleum_trigger',
  },
  unusedBindings: [
    {
      entry: GO_TRIGGER,
      kind: 'go',
      reason:
        'GO 104593 mausoleum trigger is ScriptName-bound in DB but absent from product bake - IR + pure helper ported; pairs with go_mausoleum_door unlock',
      cite: 'tirisfal_glades.cpp:43,62-75; loadRealBundle missing 104593',
    },
  ],
  cites: [
    'tirisfal_glades.cpp:62-75 go_mausoleum_trigger',
    'tirisfal_glades.cpp:64-65 quest incomplete gate',
    'tirisfal_glades.cpp:67-71 door within 30yd → ACTIVE + RemoveFlag INTERACT_COND',
    'tirisfal_glades.cpp:188-191 RegisterSelf go_mausoleum_trigger',
    'SharedDefines.h:556 GO_FLAG_INTERACT_COND=0x4',
  ],
};

// npc_calvin_montague

// npc_calvin_montagueAI, creature 6784. No combat cast timers — a DamageTaken yield then a phase
// timer machine that gives quest 590 credit and casts 2639 before evading.
export const NPC_CALVIN_MONTAGUE_SCRIPT: ScriptDevIR = {
  name: 'npc_calvin_montague',
  boundCreatures: [NPC_CALVIN_MONTAGUE],
  sourceFile: 'eastern_kingdoms/tirisfal_glades.cpp',
  spellIds: [SPELL_DRINK_SD],
  timers: [],
  phases: [
    {
      phase: 1,
      hpBelowPct: CALVIN_YIELD_HP_PCT,
      actions: [
        {
          kind: 'stop_combat',
          cite: 'tirisfal_glades.cpp:115 CombatStop(true)',
        },
        {
          kind: 'flavor',
          text: 'REACT_PASSIVE + m_uiPhase=1; timer 5000 → SAY_COMPLETE → explore 590 + SPELL_DRINK_SD 2639 → evade',
          cite: 'tirisfal_glades.cpp:109-152; calvinDamageTaken / calvinPhaseTick pure helpers',
        },
      ],
      cite: 'tirisfal_glades.cpp:111 post-hit HP% < 15 yield (DamageTaken)',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'phase=0 phaseTimer=5000 REACT_AGGRESSIVE SetImmuneToPlayer(true) clear playerGuid',
        cite: 'tirisfal_glades.cpp:100-107 Reset',
      },
    ],
    onEvade: [
      {
        kind: 'flavor',
        text: 'EnterEvadeMode from phase 3; Reset restores immune + faction on combat stop',
        cite: 'tirisfal_glades.cpp:150-152 phase3 EnterEvadeMode; TEMPFACTION_RESTORE_COMBAT_STOP',
      },
    ],
  },
  cites: [
    'tirisfal_glades.cpp:77-178 npc_calvin_montague',
    'tirisfal_glades.cpp:83-86 SAY_COMPLETE=-1000356 SPELL_DRINK_SD=2639 QUEST_590=590 FACTION_HOSTILE=168',
    'tirisfal_glades.cpp:100-107 Reset phase=0 timer=5000 immune',
    'tirisfal_glades.cpp:109-122 DamageTaken <15% clamp + CombatStop + phase=1',
    'tirisfal_glades.cpp:125-155 UpdateAI phase 1 SAY / 2 credit+drink / 3 evade',
    'tirisfal_glades.cpp:103 m_uiPhaseTimer=5000; :130 re-arm=7500',
    'tirisfal_glades.cpp:170-178 QuestAccept 590 strip immune + faction + AttackStart',
  ],
};
