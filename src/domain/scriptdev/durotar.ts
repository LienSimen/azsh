// Durotar ScriptDev IR ports. Source: scripts/kalimdor/durotar.cpp — npc_lazy_peon and the
// AwakenPeon spell script for quest 5441. Every value cites file:line below.

import type { ScriptDevIR } from './types.ts';

// Constants — durotar.cpp npc_lazy_peon

// durotar.cpp:36–49
/** Cite: durotar.cpp:38 SAY_PEON_AWOKEN = -1000795 */
export const SAY_PEON_AWOKEN = -1000795;
/** Cite: durotar.cpp:40 SOUND_PEON_WORK = 6197 */
export const SOUND_PEON_WORK = 6197;
/** Cite: durotar.cpp:41 SOUND_PEON_AWAKE_1 = 6292 */
export const SOUND_PEON_AWAKE_1 = 6292;
/** Cite: durotar.cpp:42 SOUND_PEON_AWAKE_2 = 6294 */
export const SOUND_PEON_AWAKE_2 = 6294;
/** Cite: durotar.cpp:44 SPELL_PEON_SLEEP = 17743 */
export const SPELL_PEON_SLEEP = 17743;
/** Cite: durotar.cpp:45 SPELL_AWAKEN_PEON = 19938 */
export const SPELL_AWAKEN_PEON = 19938;
/** Cite: durotar.cpp:47 NPC_SLEEPING_PEON = 10556 */
export const NPC_SLEEPING_PEON = 10556;
/** Alias — DB binding / corpus name. */
export const NPC_LAZY_PEON = NPC_SLEEPING_PEON;
/** Cite: durotar.cpp:48 GO_LUMBERPILE = 175784 */
export const GO_LUMBERPILE = 175784;

/** Quest Lazy Peons. Cite: durotar.cpp SDComment Quest support: 5441 */
export const QUEST_LAZY_PEONS = 5441;
/** Foreman Thazz'ril — starter/ender. Cite: bake quest 5441 starterCreatureEntries */
export const NPC_FOREMAN_THAZZRIL = 11378;
/** Foreman's Blackjack srcItem / itemTarget. Cite: bake quest 5441 srcItem 16114 */
export const ITEM_FOREMANS_BLACKJACK = 16114;

// Wake timer on Reset / after returning to sleep — urand(100000, 120000). Cite: durotar.cpp:68
// RestartWakeTimer
export const LAZY_PEON_WAKE_MIN_MS = 100_000;
export const LAZY_PEON_WAKE_MAX_MS = 120_000;

// Sleep-after-work timer — 80000 ms (1m20s, blizzlike). Cite: durotar.cpp:74 RestartSleepTimer
// m_uiSleepTimer = 80000
export const LAZY_PEON_SLEEP_AFTER_WORK_MS = 80_000;

// Kneel delay after reaching lumber pile MovePoint(1). Cite: durotar.cpp:113 m_uiKneelTimer = 2500 (guessed
// in cpp)
export const LAZY_PEON_KNEEL_MS = 2500;

// Get-up after kneel oneshot before MoveWaypoint. Cite: durotar.cpp:175 m_uiGetUpTimer = 3000 (guessed in
// cpp)
export const LAZY_PEON_GET_UP_MS = 3000;

// Chop wood duration at tree waypoint — urand(25000, 30000). Cite: durotar.cpp:148 m_uiChopTimer (guessed
// in cpp)
export const LAZY_PEON_CHOP_MIN_MS = 25_000;
export const LAZY_PEON_CHOP_MAX_MS = 30_000;

/** Closest lumber pile search radius. Cite: durotar.cpp:106 GetClosestGameObjectWithEntry(..., 15.0f) */
export const LAZY_PEON_LUMBER_SEARCH_YD = 15;

// Peon Sleeping aura duration in spell-data (DurationIndex 4 → 120s). Cite: spell-data 17743 durationMs
// 120000; matches cpp note "2m is duration of sleep aura"
export const SPELL_PEON_SLEEP_DURATION_MS = 120_000;

// Pure helpers — npc_lazy_peonAI state machine

export interface LazyPeonResetResult {
  wakeTimerMinMs: number;
  wakeTimerMaxMs: number;
  sleepTimerMs: number;
  getUpTimerMs: number;
  kneelTimerMs: number;
  chopTimerMs: number;
  isAtPile: boolean;
  cite: string;
}

/** Port of npc_lazy_peonAI::Reset → RestartWakeTimer + clear work timers. Cite: durotar.cpp:78-85,66-70 */
export function lazyPeonReset(): LazyPeonResetResult {
  return {
    wakeTimerMinMs: LAZY_PEON_WAKE_MIN_MS,
    wakeTimerMaxMs: LAZY_PEON_WAKE_MAX_MS,
    sleepTimerMs: 0,
    getUpTimerMs: 0,
    kneelTimerMs: 0,
    chopTimerMs: 0,
    isAtPile: false,
    cite: 'durotar.cpp:78-85 Reset RestartWakeTimer urand(100-120)s + clear work timers',
  };
}

export interface LazyPeonAwakenResult {
  handled: boolean;
  /** Player-only yell / credit branch. */
  playerInvoker: boolean;
  textId: number | null;
  soundPool: readonly number[];
  /** SetWalk(false) run when player; walk when self. */
  run: boolean;
  questCredit: boolean;
  creditEntry: number | null;
  removeSleepSpellId: number;
  sleepTimerMs: number;
  wakeTimerMs: number;
  goLumberPile: boolean;
  cite: string;
}

// Port of npc_lazy_peonAI::Awaken. Cite: durotar.cpp:87-102 Player invoker: say, sounds, run,
// KilledMonsterCredit(10556). Any invoker: strip 17743, RestartSleepTimer 80s, GoLumberPile.
export function lazyPeonAwaken(invokerIsPlayer: boolean): LazyPeonAwakenResult {
  return {
    handled: true,
    playerInvoker: invokerIsPlayer,
    textId: invokerIsPlayer ? SAY_PEON_AWOKEN : null,
    soundPool: invokerIsPlayer ? [SOUND_PEON_AWAKE_1, SOUND_PEON_AWAKE_2] : [],
    run: invokerIsPlayer,
    questCredit: invokerIsPlayer,
    creditEntry: invokerIsPlayer ? NPC_LAZY_PEON : null,
    removeSleepSpellId: SPELL_PEON_SLEEP,
    sleepTimerMs: LAZY_PEON_SLEEP_AFTER_WORK_MS,
    wakeTimerMs: 0,
    goLumberPile: true,
    cite: invokerIsPlayer
      ? 'durotar.cpp:89-101 player: SAY -1000795 + sounds + run + KilledMonsterCredit 10556 + strip 17743 + sleep 80s + GoLumberPile'
      : 'durotar.cpp:96-101 self-wake: walk + strip 17743 + sleep 80s + GoLumberPile (no credit)',
  };
}

export interface LazyPeonAwakenSpellCheckResult {
  ok: boolean;
  /** SPELL_FAILED_BAD_TARGETS when target missing sleep aura. */
  failBadTargets: boolean;
  cite: string;
}

/** Port of AwakenPeon::OnCheckCast. Cite: durotar.cpp:236-242 */
export function lazyPeonAwakenSpellCheck(
  hasTarget: boolean,
  targetHasSleepAura: boolean,
): LazyPeonAwakenSpellCheckResult {
  if (!hasTarget || !targetHasSleepAura) {
    return {
      ok: false,
      failBadTargets: true,
      cite: 'durotar.cpp:238-240 !target || !HasAura(17743) → SPELL_FAILED_BAD_TARGETS',
    };
  }
  return {
    ok: true,
    failBadTargets: false,
    cite: 'durotar.cpp:242 SPELL_CAST_OK',
  };
}

export interface LazyPeonSpellHitResult {
  handled: boolean;
  awaken: LazyPeonAwakenResult | null;
  cite: string;
}

// Port of AwakenPeon OnEffectExecute and the SpellHit path for a player cast of 19938, gated on a
// player caster with the sleep aura present. Cite: durotar.cpp:245-248, :87-102.
export function lazyPeonSpellHit(
  spellId: number,
  isPlayerCaster: boolean,
  targetHasSleepAura: boolean,
): LazyPeonSpellHitResult {
  if (spellId !== SPELL_AWAKEN_PEON) {
    return {
      handled: false,
      awaken: null,
      cite: 'durotar.cpp:233-249 spell != 19938 → no-op',
    };
  }
  if (!isPlayerCaster) {
    return {
      handled: false,
      awaken: null,
      cite: 'durotar.cpp:89 TYPEID_PLAYER gate for credit path (item use is player)',
    };
  }
  const check = lazyPeonAwakenSpellCheck(true, targetHasSleepAura);
  if (!check.ok) {
    return {
      handled: false,
      awaken: null,
      cite: check.cite,
    };
  }
  return {
    handled: true,
    awaken: lazyPeonAwaken(true),
    cite: 'durotar.cpp:245-248 OnEffectExecute peonAI->Awaken(player)',
  };
}

export interface LazyPeonGoLumberPileResult {
  handled: boolean;
  cancelChopEmote: boolean;
  movePointId: number;
  kneelTimerMs: number;
  chopTimerMs: number;
  cite: string;
}

/** Port of GoLumberPile when pile GO found in range. Cite: durotar.cpp:104-117 */
export function lazyPeonGoLumberPile(pileInRange: boolean): LazyPeonGoLumberPileResult {
  if (!pileInRange) {
    return {
      handled: false,
      cancelChopEmote: false,
      movePointId: 0,
      kneelTimerMs: 0,
      chopTimerMs: 0,
      cite: 'durotar.cpp:115-116 no GO_LUMBERPILE 175784 in 15yd → script_error_log',
    };
  }
  return {
    handled: true,
    cancelChopEmote: true,
    movePointId: 1,
    kneelTimerMs: LAZY_PEON_KNEEL_MS,
    chopTimerMs: 0,
    cite: 'durotar.cpp:106-113 MovePoint(1) pile contact + KneelTimer 2500 + chop clear',
  };
}

export interface LazyPeonMovementInformResult {
  handled: boolean;
  /** Point 1 lumber pile. */
  atPile?: boolean;
  setWalk?: boolean;
  /** Point 2 spawn return. */
  castSleep?: boolean;
  sleepSpellId?: number;
  wakeTimerMinMs?: number;
  wakeTimerMaxMs?: number;
  moveIdle?: boolean;
  /** WAYPOINT_MOTION_TYPE tree. */
  chop?: boolean;
  workSound?: number;
  chopTimerMinMs?: number;
  chopTimerMaxMs?: number;
  cite: string;
}

/** Port of MovementInform. Cite: durotar.cpp:119-150 */
export function lazyPeonMovementInform(
  motionType: 'point' | 'waypoint' | 'other',
  pointId: number,
): LazyPeonMovementInformResult {
  if (motionType === 'point' && pointId === 1) {
    return {
      handled: true,
      atPile: true,
      setWalk: true,
      cite: 'durotar.cpp:125-129 POINT 1 lumber pile → SetWalk true + m_bIsAtPile',
    };
  }
  if (motionType === 'point' && pointId === 2) {
    return {
      handled: true,
      moveIdle: true,
      castSleep: true,
      sleepSpellId: SPELL_PEON_SLEEP,
      wakeTimerMinMs: LAZY_PEON_WAKE_MIN_MS,
      wakeTimerMaxMs: LAZY_PEON_WAKE_MAX_MS,
      cite: 'durotar.cpp:131-138 POINT 2 spawn → MoveIdle + cast 17743 + RestartWakeTimer',
    };
  }
  if (motionType === 'waypoint') {
    return {
      handled: true,
      moveIdle: true,
      chop: true,
      workSound: SOUND_PEON_WORK,
      chopTimerMinMs: LAZY_PEON_CHOP_MIN_MS,
      chopTimerMaxMs: LAZY_PEON_CHOP_MAX_MS,
      cite: 'durotar.cpp:142-148 WAYPOINT tree → MoveIdle + work sound + chop urand(25-30)s',
    };
  }
  return {
    handled: false,
    cite: 'durotar.cpp:119-150 unhandled motion',
  };
}

export interface LazyPeonTimerTickResult {
  /** Which timer fired (if any). */
  fired:
    | 'none'
    | 'get_up'
    | 'kneel'
    | 'kneel_wait'
    | 'chop'
    | 'sleep'
    | 'wake'
    | 'wake_reapply_sleep';
  getUpTimerMs: number;
  kneelTimerMs: number;
  chopTimerMs: number;
  sleepTimerMs: number;
  wakeTimerMs: number;
  isAtPile: boolean;
  /** Side effects when a timer fires. */
  moveWaypoint?: boolean;
  oneshotKneel?: boolean;
  goLumberPile?: boolean;
  movePointSpawn?: boolean;
  awakenSelf?: boolean;
  reapplySleep?: boolean;
  sleepSpellId?: number;
  cite: string;
}

// Port of the UpdateAI timer cascade (the OOC work/sleep machine). Call order matches the cpp —
// getUp, kneel, chop, sleep, wake — and only the first expired timer runs per call.
export function lazyPeonTimerTick(
  state: {
    getUpTimerMs: number;
    kneelTimerMs: number;
    chopTimerMs: number;
    sleepTimerMs: number;
    wakeTimerMs: number;
    isAtPile: boolean;
    hasSleepAura: boolean;
  },
  diffMs: number,
): LazyPeonTimerTickResult {
  let {
    getUpTimerMs,
    kneelTimerMs,
    chopTimerMs,
    sleepTimerMs,
    wakeTimerMs,
    isAtPile,
  } = state;
  const { hasSleepAura } = state;

  if (getUpTimerMs > 0) {
    if (getUpTimerMs <= diffMs) {
      return {
        fired: 'get_up',
        getUpTimerMs: 0,
        kneelTimerMs,
        chopTimerMs,
        sleepTimerMs,
        wakeTimerMs,
        isAtPile: false,
        moveWaypoint: true,
        cite: 'durotar.cpp:154-161 getUp → EMOTE_NONE + MoveWaypoint + clear atPile',
      };
    }
    getUpTimerMs -= diffMs;
  }

  if (kneelTimerMs > 0) {
    if (kneelTimerMs <= diffMs) {
      if (isAtPile) {
        return {
          fired: 'kneel',
          getUpTimerMs: LAZY_PEON_GET_UP_MS,
          kneelTimerMs: 0,
          chopTimerMs,
          sleepTimerMs,
          wakeTimerMs,
          isAtPile,
          oneshotKneel: true,
          cite: 'durotar.cpp:167-176 kneel at pile → ONESHOT_KNEEL + getUp 3000',
        };
      }
      return {
        fired: 'kneel_wait',
        getUpTimerMs,
        kneelTimerMs: 1,
        chopTimerMs,
        sleepTimerMs,
        wakeTimerMs,
        isAtPile,
        cite: 'durotar.cpp:177-178 not at pile yet → kneelTimer=1 recheck',
      };
    }
    kneelTimerMs -= diffMs;
  }

  if (chopTimerMs > 0) {
    if (chopTimerMs <= diffMs) {
      return {
        fired: 'chop',
        getUpTimerMs,
        kneelTimerMs,
        chopTimerMs: 0,
        sleepTimerMs,
        wakeTimerMs,
        isAtPile,
        goLumberPile: true,
        cite: 'durotar.cpp:184-189 chop done → GoLumberPile',
      };
    }
    chopTimerMs -= diffMs;
  }

  if (sleepTimerMs > 0) {
    if (sleepTimerMs <= diffMs) {
      return {
        fired: 'sleep',
        getUpTimerMs: 0,
        kneelTimerMs: 0,
        chopTimerMs: 0,
        sleepTimerMs: 0,
        wakeTimerMs,
        isAtPile: false,
        movePointSpawn: true,
        cite: 'durotar.cpp:195-206 sleep timer → MovePoint(2) spawn + clear work timers',
      };
    }
    sleepTimerMs -= diffMs;
  }

  if (wakeTimerMs > 0) {
    if (wakeTimerMs <= diffMs) {
      return {
        fired: 'wake',
        getUpTimerMs,
        kneelTimerMs,
        chopTimerMs,
        sleepTimerMs,
        wakeTimerMs: 0,
        isAtPile,
        awakenSelf: true,
        cite: 'durotar.cpp:212-215 wake timer → Awaken(self)',
      };
    }
    if (!hasSleepAura) {
      return {
        fired: 'wake_reapply_sleep',
        getUpTimerMs,
        kneelTimerMs,
        chopTimerMs,
        sleepTimerMs,
        wakeTimerMs: wakeTimerMs - diffMs,
        isAtPile,
        reapplySleep: true,
        sleepSpellId: SPELL_PEON_SLEEP,
        cite: 'durotar.cpp:218-222 wake running + !HasAura → re-cast 17743 + decrement',
      };
    }
    wakeTimerMs -= diffMs;
  }

  return {
    fired: 'none',
    getUpTimerMs,
    kneelTimerMs,
    chopTimerMs,
    sleepTimerMs,
    wakeTimerMs,
    isAtPile,
    cite: 'durotar.cpp:152-225 no timer fired',
  };
}

// ScriptDev IR — npc_lazy_peon

// npc_lazy_peonAI, creature 10556. No combat cast schedule: the OOC sleep/work/awaken machine is
// pure helpers plus the SpellHit 19938 quest credit. Sleep aura 17743 arms on reset at spawn.
export const NPC_LAZY_PEON_SCRIPT: ScriptDevIR = {
  name: 'npc_lazy_peon',
  boundCreatures: [NPC_LAZY_PEON],
  sourceFile: 'kalimdor/durotar.cpp',
  spellIds: [SPELL_PEON_SLEEP, SPELL_AWAKEN_PEON],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: `RestartWakeTimer urand(${LAZY_PEON_WAKE_MIN_MS},${LAZY_PEON_WAKE_MAX_MS}); work timers 0; m_bIsAtPile=false`,
        cite: 'durotar.cpp:78-85 Reset RestartWakeTimer + clear getUp/kneel/chop/atPile',
      },
    ],
  },
  spellHits: [
    {
      spellId: SPELL_AWAKEN_PEON,
      playerCaster: true,
      actions: [
        {
          kind: 'yell',
          textId: SAY_PEON_AWOKEN,
          cite: 'durotar.cpp:91 DoScriptText SAY_PEON_AWOKEN -1000795',
        },
        {
          kind: 'remove_auras',
          spellId: SPELL_PEON_SLEEP,
          cite: 'durotar.cpp:99 RemoveAurasDueToSpell SPELL_PEON_SLEEP 17743',
        },
        {
          kind: 'quest_credit',
          entry: NPC_LAZY_PEON,
          credit: 'creature',
          cite: 'durotar.cpp:94 KilledMonsterCredit entry 10556',
        },
        {
          kind: 'flavor',
          text: `RestartSleepTimer ${LAZY_PEON_SLEEP_AFTER_WORK_MS}; GoLumberPile; run; sounds ${SOUND_PEON_AWAKE_1}/${SOUND_PEON_AWAKE_2}`,
          cite: 'durotar.cpp:92-101 player Awaken: sounds + SetWalk false + sleep 80s + GoLumberPile',
        },
      ],
      cite: 'durotar.cpp:233-249 spell_awaken_peon → Awaken(player) when target has 17743',
    },
  ],
  unusedBindings: [
    {
      entry: GO_LUMBERPILE,
      kind: 'go',
      reason:
        'GO 175784 Lumberpile is the MovePoint contact target for GoLumberPile (durotar.cpp:106) - not a ScriptName binding; absent from product tables/gameObjects.json. Work emotes still modeled via pure helpers when pile-in-range is true.',
      cite: 'durotar.cpp:48,106-116; tables/gameObjects missing 175784',
    },
  ],
  cites: [
    'durotar.cpp:32-260 npc_lazy_peon + AwakenPeon',
    'durotar.cpp:38-48 SAY/SOUND/SPELL/NPC/GO constants',
    'durotar.cpp:66-85 RestartWakeTimer/RestartSleepTimer/Reset',
    'durotar.cpp:87-102 Awaken player credit + strip sleep + work',
    'durotar.cpp:104-150 GoLumberPile + MovementInform pile/spawn/waypoint',
    'durotar.cpp:152-225 UpdateAI getUp/kneel/chop/sleep/wake',
    'durotar.cpp:233-249 AwakenPeon OnCheckCast + OnEffectExecute',
    'durotar.cpp:252-260 AddSC_durotar RegisterSelf npc_lazy_peon',
    'scriptdev2.sql entry 10556; script_texts -1000795',
  ],
};
