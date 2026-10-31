// Stranglethorn Vale ScriptDev IR ports. Source: eastern_kingdoms/stranglethorn_vale.cpp —
// mob_yenniku (absent from bake) and mob_colonel_kurzen. Every value cites file:line below.

import type { ScriptDevIR } from './types.ts';

// Constants — stranglethorn_vale.cpp mob_yenniku

/** Cite: stranglethorn_vale.cpp:40 SPELL_YENNIKUS_RELEASE = 3607 */
export const SPELL_YENNIKUS_RELEASE = 3607;

/** Cite: stranglethorn_vale.cpp:42 QUEST_ID_SAVING_YENNIKU = 592 */
export const QUEST_ID_SAVING_YENNIKU = 592;

/** Cite: stranglethorn_vale.cpp:44 FACTION_ID_HORDE_GENERIC = 83 (cpp note: faction may not be correct) */
export const FACTION_ID_HORDE_GENERIC = 83;

// TEMPFACTION_RESTORE_REACH_HOME. Cite: Creature.h TEMPFACTION_*; stranglethorn_vale.cpp:78 QI4
// dbscript.test.ts documents flag 0x04 for this residual.
export const TEMPFACTION_RESTORE_REACH_HOME = 0x04;

// EMOTE_STATE_STUN while stunned by Soul Gem. Cite: SharedDefines.h EMOTE_STATE_STUN;
// stranglethorn_vale.cpp:77 QI4 dbscript.test.ts: SharedDefines.h:795 EMOTE_STATE_STUN = 64
export const EMOTE_STATE_STUN = 64;

// EMOTE_STATE_NONE when reset timer expires. Cite: SharedDefines.h EMOTE_STATE_NONE=0;
// stranglethorn_vale.cpp:90
export const EMOTE_STATE_NONE = 0;

/** m_uiResetTimer arm on successful SpellHit. Cite: stranglethorn_vale.cpp:61 m_uiResetTimer = 60000 */
export const YENNIKU_RESET_TIMER_MS = 60_000;

/** DB binding. Cite: scriptdev-corpus.json boundCreatures 2530 Yenniku */
export const NPC_YENNIKU = 2530;

// Constants — stranglethorn_vale.cpp mob_colonel_kurzen

/** Cite: stranglethorn_vale.cpp:112 SPELL_SMOKE_BOMB = 8817 */
export const SPELL_SMOKE_BOMB = 8817;

/** Cite: stranglethorn_vale.cpp:113 SPELL_GARROTE = 8818 */
export const SPELL_GARROTE = 8818;

// Stealth applied to npc after Smoke Bomb (spell trigger, not AI cast). Cite: stranglethorn_vale.cpp:114
// SPELL_STEALTH = 8822
export const SPELL_STEALTH = 8822;

/** DB binding. Cite: scriptdev-corpus.json boundCreatures 813 Colonel Kurzen */
export const NPC_COLONEL_KURZEN = 813;

// KURZEN_ACTION_VANISH initial + post-garotte re-arm. Cite: stranglethorn_vale.cpp:128 AddCombatAction
// VANISH urand(6000, 12000) Cite: stranglethorn_vale.cpp:151 ResetCombatAction VANISH urand(6000, 12000)
export const KURZEN_VANISH_MIN_MS = 6000;
export const KURZEN_VANISH_MAX_MS = 12_000;

// KURZEN_ACTION_GAROTTE arm after successful vanish. Cite: stranglethorn_vale.cpp:140 ResetCombatAction
// GAROTTE urand(2000, 6000)
export const KURZEN_GAROTTE_ARM_MIN_MS = 2000;
export const KURZEN_GAROTTE_ARM_MAX_MS = 6000;

// Host cast-plan first-arm window for Garrote relative to pull: vanish init plus garrote arm =
// [8000, 18000]. The IR cannot DisableCombatAction, so the cycle re-arm uses the same sum.
export const KURZEN_GARROTE_HOST_INIT_MIN_MS =
  KURZEN_VANISH_MIN_MS + KURZEN_GAROTTE_ARM_MIN_MS;
export const KURZEN_GARROTE_HOST_INIT_MAX_MS =
  KURZEN_VANISH_MAX_MS + KURZEN_GAROTTE_ARM_MAX_MS;

// Pure helpers — mob_yenniku SpellHit + reset timer + evade

export interface YennikuSpellHitResult {
  handled: boolean;
  /** Arm m_uiResetTimer when hit accepted. */
  armResetTimerMs: number;
  /** EnterEvadeMode with special stun/faction branch. */
  enterEvade: boolean;
  cite: string;
}

// Port of mob_yennikuAI::SpellHit gate.
// Cite: stranglethorn_vale.cpp:55–64.
export function yennikuSpellHit(
  spellId: number,
  isPlayerCaster: boolean,
  resetTimerMs: number,
  questIncomplete: boolean,
): YennikuSpellHitResult {
  if (spellId !== SPELL_YENNIKUS_RELEASE) {
    return {
      handled: false,
      armResetTimerMs: 0,
      enterEvade: false,
      cite: 'stranglethorn_vale.cpp:57 spell != SPELL_YENNIKUS_RELEASE → no-op',
    };
  }
  if (!isPlayerCaster) {
    return {
      handled: false,
      armResetTimerMs: 0,
      enterEvade: false,
      cite: 'stranglethorn_vale.cpp:57 caster not TYPEID_PLAYER → no-op',
    };
  }
  // cpp:59 !m_uiResetTimer && quest incomplete
  if (resetTimerMs !== 0) {
    return {
      handled: false,
      armResetTimerMs: 0,
      enterEvade: false,
      cite: 'stranglethorn_vale.cpp:59 m_uiResetTimer already set → no-op',
    };
  }
  if (!questIncomplete) {
    return {
      handled: false,
      armResetTimerMs: 0,
      enterEvade: false,
      cite: 'stranglethorn_vale.cpp:59 quest 592 not INCOMPLETE → no-op',
    };
  }
  return {
    handled: true,
    armResetTimerMs: YENNIKU_RESET_TIMER_MS,
    enterEvade: true,
    cite: 'stranglethorn_vale.cpp:61-62 m_uiResetTimer=60000 + EnterEvadeMode',
  };
}

export interface YennikuEvadeResult {
  /** Special stun/faction branch when m_uiResetTimer != 0. */
  specialEvade: boolean;
  emoteState: number | null;
  factionId: number | null;
  factionFlags: number | null;
  stripAuras: boolean;
  combatStop: boolean;
  clearLootRecipient: boolean;
  cite: string;
}

// Port of mob_yennikuAI::EnterEvadeMode.
// Cite: stranglethorn_vale.cpp:67–82.
export function yennikuEnterEvade(resetTimerMs: number): YennikuEvadeResult {
  if (resetTimerMs) {
    return {
      specialEvade: true,
      emoteState: EMOTE_STATE_STUN,
      factionId: FACTION_ID_HORDE_GENERIC,
      factionFlags: TEMPFACTION_RESTORE_REACH_HOME,
      stripAuras: true,
      combatStop: true,
      clearLootRecipient: true,
      cite: 'stranglethorn_vale.cpp:69-79 timer set → stun emote + faction 83 TEMPFACTION_RESTORE_REACH_HOME',
    };
  }
  return {
    specialEvade: false,
    emoteState: null,
    factionId: null,
    factionFlags: null,
    stripAuras: false,
    combatStop: false,
    clearLootRecipient: false,
    cite: 'stranglethorn_vale.cpp:80-81 else ScriptedAI::EnterEvadeMode',
  };
}

export interface YennikuResetTimerTickResult {
  /** Updated m_uiResetTimer after this tick. */
  nextTimerMs: number;
  /** When true, clear stun emote + EnterEvadeMode. */
  expire: boolean;
  emoteState: number | null;
  cite: string;
}

// Port of the mob_yennikuAI::UpdateAI reset-timer branch.
// Cite: stranglethorn_vale.cpp:86–96.
export function yennikuResetTimerTick(
  resetTimerMs: number,
  diffMs: number,
): YennikuResetTimerTickResult {
  if (!resetTimerMs) {
    return {
      nextTimerMs: 0,
      expire: false,
      emoteState: null,
      cite: 'stranglethorn_vale.cpp:86 m_uiResetTimer==0 → idle',
    };
  }
  if (resetTimerMs <= diffMs) {
    return {
      nextTimerMs: 0,
      expire: true,
      emoteState: EMOTE_STATE_NONE,
      cite: 'stranglethorn_vale.cpp:88-92 timer expire → EMOTE_STATE_NONE + timer=0 + EnterEvadeMode',
    };
  }
  return {
    nextTimerMs: resetTimerMs - diffMs,
    expire: false,
    emoteState: null,
    cite: 'stranglethorn_vale.cpp:94-95 m_uiResetTimer -= uiDiff',
  };
}

// Pure helpers — mob_colonel_kurzen CombatAI ExecuteAction chain

export type KurzenActionId = 'vanish' | 'garotte';

export interface KurzenVanishResult {
  action: 'vanish';
  /** SetCombatOnlyStealth(true) before smoke. */
  combatOnlyStealth: true;
  smokeBombSpellId: number;
  /** Arm GAROTTE for this many ms (caller rolls urand in [min,max]). */
  armGarotteMinMs: number;
  armGarotteMaxMs: number;
  /** Disable VANISH until re-armed after garotte. */
  disableVanish: true;
  cite: string;
}

/** Port of KURZEN_ACTION_VANISH ExecuteAction. Cite: stranglethorn_vale.cpp:136–142 */
export function kurzenVanishExecute(): KurzenVanishResult {
  return {
    action: 'vanish',
    combatOnlyStealth: true,
    smokeBombSpellId: SPELL_SMOKE_BOMB,
    armGarotteMinMs: KURZEN_GAROTTE_ARM_MIN_MS,
    armGarotteMaxMs: KURZEN_GAROTTE_ARM_MAX_MS,
    disableVanish: true,
    cite: 'stranglethorn_vale.cpp:136-142 SetCombatOnlyStealth + Smoke Bomb 8817 + arm GAROTTE 2-6s + disable VANISH',
  };
}

export interface KurzenGarotteResult {
  action: 'garotte';
  /** Only cast when HasAura(SPELL_STEALTH). */
  requiresStealthAura: true;
  stealthSpellId: number;
  garroteSpellId: number;
  castGarrote: boolean;
  combatOnlyStealth: false;
  /** Re-arm VANISH for this many ms. */
  armVanishMinMs: number;
  armVanishMaxMs: number;
  disableGarotte: true;
  cite: string;
}

// Port of KURZEN_ACTION_GAROTTE ExecuteAction.
// Cite: stranglethorn_vale.cpp:144–153.
export function kurzenGarotteExecute(hasStealthAura: boolean): KurzenGarotteResult {
  return {
    action: 'garotte',
    requiresStealthAura: true,
    stealthSpellId: SPELL_STEALTH,
    garroteSpellId: SPELL_GARROTE,
    castGarrote: hasStealthAura,
    combatOnlyStealth: false,
    armVanishMinMs: KURZEN_VANISH_MIN_MS,
    armVanishMaxMs: KURZEN_VANISH_MAX_MS,
    disableGarotte: true,
    cite: hasStealthAura
      ? 'stranglethorn_vale.cpp:147-152 HasAura(8822) → Garrote 8818 victim + clear stealth + re-arm VANISH 6-12s'
      : 'stranglethorn_vale.cpp:147-152 no Stealth aura → skip cast; still clear stealth + re-arm VANISH 6-12s',
  };
}

// mob_yenniku

// mob_yennikuAI, creature 2530 — ABSENT from bake, so the binding is unused. No combat cast
// timers; the SpellHit 3607 path and its 60 s stun/faction residual are ported as pure helpers.
export const MOB_YENNIKU: ScriptDevIR = {
  name: 'mob_yenniku',
  boundCreatures: [NPC_YENNIKU],
  sourceFile: 'eastern_kingdoms/stranglethorn_vale.cpp',
  spellIds: [SPELL_YENNIKUS_RELEASE],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'm_uiResetTimer=0',
        cite: 'stranglethorn_vale.cpp:53 Reset m_uiResetTimer = 0',
      },
    ],
    onEvade: [
      {
        kind: 'flavor',
        text: 'timer set → EMOTE_STATE_STUN + FACTION_ID_HORDE_GENERIC 83 TEMPFACTION_RESTORE_REACH_HOME; else ScriptedAI::EnterEvadeMode',
        cite: 'stranglethorn_vale.cpp:67-82 EnterEvadeMode (yennikuEnterEvade)',
      },
    ],
  },
  spellHits: [
    {
      spellId: SPELL_YENNIKUS_RELEASE,
      playerCaster: true,
      requireQuestIncomplete: QUEST_ID_SAVING_YENNIKU,
      // m_uiResetTimer gate: one active stun window at a time
      once: true,
      actions: [
        {
          kind: 'stop_combat',
          cite: 'stranglethorn_vale.cpp:62 EnterEvadeMode → CombatStop(true)',
        },
        {
          kind: 'flavor',
          text: `EMOTE_STATE_STUN=${EMOTE_STATE_STUN} + FACTION_ID_HORDE_GENERIC=${FACTION_ID_HORDE_GENERIC} flags=${TEMPFACTION_RESTORE_REACH_HOME} + strip auras + clear loot recipient`,
          cite: 'stranglethorn_vale.cpp:71-78 special EnterEvadeMode branch',
        },
      ],
      // Host reuses dieTimerMs for m_uiResetTimer (60s stun window then clear)
      dieTimerMs: YENNIKU_RESET_TIMER_MS,
      onDieTimer: [
        {
          kind: 'flavor',
          text: `EMOTE_STATE_NONE=${EMOTE_STATE_NONE} + m_uiResetTimer=0 + EnterEvadeMode (restore faction on reach home)`,
          cite: 'stranglethorn_vale.cpp:88-92 timer expire → clear stun + EnterEvadeMode',
        },
      ],
      cite: 'stranglethorn_vale.cpp:55-64 SpellHit 3607 player + quest 592 incomplete + !resetTimer → arm 60000 + evade',
    },
  ],
  unusedBindings: [
    {
      entry: NPC_YENNIKU,
      kind: 'creature',
      reason:
        'Creature 2530 Yenniku is DB-bound ScriptName mob_yenniku but absent from product bake - IR + pure helpers ported; product cannot spawn until rebake. Quest 592 Saving Yenniku also absent from bake (QI4 fixture path).',
      cite: 'stranglethorn_vale.cpp:166-168; scriptdev-corpus.json entry 2530; loadRealBundle missing 2530',
    },
  ],
  cites: [
    'stranglethorn_vale.cpp:34-108 mob_yenniku',
    'stranglethorn_vale.cpp:40 SPELL_YENNIKUS_RELEASE=3607',
    'stranglethorn_vale.cpp:42 QUEST_ID_SAVING_YENNIKU=592',
    'stranglethorn_vale.cpp:44 FACTION_ID_HORDE_GENERIC=83',
    'stranglethorn_vale.cpp:53 Reset m_uiResetTimer=0 (no combat cast timers)',
    'stranglethorn_vale.cpp:55-64 SpellHit 3607 player incomplete 592 → timer 60000 + evade',
    'stranglethorn_vale.cpp:67-82 EnterEvadeMode stun emote + faction 83 TEMPFACTION_RESTORE_REACH_HOME',
    'stranglethorn_vale.cpp:84-102 UpdateAI reset timer expire + melee',
    'stranglethorn_vale.cpp:166-168 RegisterSelf mob_yenniku',
  ],
};

// mob_colonel_kurzen

// mob_colonel_kurzenAI, creature 813. Smoke Bomb 8817 init and re-arm urand(6–12)s, Garrote 8818
// urand(2–6)s after the vanish while Stealth 8822 is up. Stealth is spell-triggered, not an AI cast.
export const MOB_COLONEL_KURZEN: ScriptDevIR = {
  name: 'mob_colonel_kurzen',
  boundCreatures: [NPC_COLONEL_KURZEN],
  sourceFile: 'eastern_kingdoms/stranglethorn_vale.cpp',
  spellIds: [SPELL_SMOKE_BOMB, SPELL_GARROTE, SPELL_STEALTH],
  timers: [
    {
      id: 'smoke_bomb',
      spellId: SPELL_SMOKE_BOMB,
      initialMinMs: KURZEN_VANISH_MIN_MS,
      initialMaxMs: KURZEN_VANISH_MAX_MS,
      // cpp:151 re-arms VANISH after garotte with same urand(6000,12000).
      // Host has no DisableCombatAction chain — repeat matches that re-arm.
      repeatMinMs: KURZEN_VANISH_MIN_MS,
      repeatMaxMs: KURZEN_VANISH_MAX_MS,
      target: 'self',
      cite: 'stranglethorn_vale.cpp:128,139,151 VANISH Smoke Bomb 8817 init/re-arm urand(6000,12000) self (nullptr cast)',
    },
    {
      id: 'garrote',
      spellId: SPELL_GARROTE,
      // First arm: CombatAI disables GAROTTE until after vanish; host window =
      // vanish_init + garotte_arm sourced bounds (see KURZEN_GARROTE_HOST_*).
      initialMinMs: KURZEN_GARROTE_HOST_INIT_MIN_MS,
      initialMaxMs: KURZEN_GARROTE_HOST_INIT_MAX_MS,
      // Cycle: vanish re-arm 6-12s + garotte arm 2-6s after each vanish.
      repeatMinMs: KURZEN_GARROTE_HOST_INIT_MIN_MS,
      repeatMaxMs: KURZEN_GARROTE_HOST_INIT_MAX_MS,
      target: 'victim',
      cite: 'stranglethorn_vale.cpp:140,148 GAROTTE 8818 arm urand(2000,6000) after vanish; host first-arm span = vanish+arm sum [8000,18000] victim',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: `CombatAI: VANISH armed urand(${KURZEN_VANISH_MIN_MS},${KURZEN_VANISH_MAX_MS}); GAROTTE disabled until vanish`,
        cite: 'stranglethorn_vale.cpp:128-129 AddCombatAction VANISH urand(6-12s) + GAROTTE disabled (true)',
      },
    ],
  },
  cites: [
    'stranglethorn_vale.cpp:110-157 mob_colonel_kurzen',
    'stranglethorn_vale.cpp:112-114 SPELL_SMOKE_BOMB=8817 SPELL_GARROTE=8818 SPELL_STEALTH=8822',
    'stranglethorn_vale.cpp:117-122 KurzenActions VANISH/GAROTTE',
    'stranglethorn_vale.cpp:128 AddCombatAction VANISH urand(6000,12000)',
    'stranglethorn_vale.cpp:129 AddCombatAction GAROTTE disabled',
    'stranglethorn_vale.cpp:136-142 VANISH: combat-only stealth + Smoke Bomb + arm GAROTTE 2-6s + disable VANISH',
    'stranglethorn_vale.cpp:144-153 GAROTTE: if HasAura(8822) Garrote victim; clear stealth; re-arm VANISH 6-12s',
    'stranglethorn_vale.cpp:170-173 RegisterSelf mob_colonel_kurzen',
  ],
};
