// Onyxia's Lair — the ScriptDevAI IR port, read whole from kalimdor/onyxias_lair. Phase 0 is the
// ground kit above 65%, 1 the flight to 40%, 2 the landed kit. No boss overlay: this IR owns it.

import type { ScriptDevIR } from './types.ts';
import { INSTANCE_DATA } from './types.ts';

// onyxias_lair.h:10-19
const TYPE_ONYXIA = 0;
const DATA_LIFTOFF = 4;
const NPC_ONYXIA_WHELP = 11262;

// boss_onyxia.cpp:36-72
const SAY_PHASE_2_TRANS = -1249002;
const SAY_PHASE_3_TRANS = -1249003;
const SPELL_WINGBUFFET = 18500;
const SPELL_FLAMEBREATH = 18435;
const SPELL_CLEAVE = 19983;
const SPELL_TAILSWEEP = 15847;
const SPELL_KNOCK_AWAY = 19633;
const SPELL_FIREBALL = 18392;
const SPELL_DRAGON_HOVER = 18430;
const SPELL_BELLOWINGROAR = 18431;

const PHASE_GROUND = 0;
const PHASE_FLIGHT = 1;
const PHASE_LANDED = 2;

export const BOSS_ONYXIA: ScriptDevIR = {
  name: 'boss_onyxia',
  boundCreatures: [10184],
  sourceFile: 'kalimdor/onyxias_lair/boss_onyxia.cpp',
  spellIds: [
    SPELL_WINGBUFFET, SPELL_FLAMEBREATH, SPELL_CLEAVE, SPELL_TAILSWEEP,
    SPELL_KNOCK_AWAY, SPELL_FIREBALL, SPELL_DRAGON_HOVER, SPELL_BELLOWINGROAR,
  ],
  timers: [
    // ---- PHASE_START ground kit (ctor :160-164; re-arms :464-493) -----------------
    {
      id: 'flame_breath',
      spellId: SPELL_FLAMEBREATH,
      initialMinMs: 10_000,
      initialMaxMs: 20_000,
      repeatMinMs: 10_000,
      repeatMaxMs: 20_000,
      target: 'victim',
      phase: PHASE_GROUND,
      cite: 'boss_onyxia.cpp:160 AddCombatAction(FLAME_BREATH, 10000, 20000); :467 re-arm',
    },
    {
      id: 'cleave',
      spellId: SPELL_CLEAVE,
      initialMinMs: 2000,
      initialMaxMs: 5000,
      repeatMinMs: 5000,
      repeatMaxMs: 10_000,
      target: 'victim',
      phase: PHASE_GROUND,
      cite: 'boss_onyxia.cpp:161 AddCombatAction(CLEAVE, 2000, 5000); :473 re-arm 5000-10000',
    },
    {
      id: 'tail_sweep',
      spellId: SPELL_TAILSWEEP,
      initialMinMs: 15_000,
      initialMaxMs: 20_000,
      repeatMinMs: 15_000,
      repeatMaxMs: 20_000,
      target: 'self',
      phase: PHASE_GROUND,
      cite: 'boss_onyxia.cpp:162 AddCombatAction(TAIL_SWEEP, 15000, 20000); :479 re-arm',
    },
    {
      // The ONLY ability that does not come back in phase 3: HandlePhaseTransition re-arms breath,
      // cleave, tail, knock and roar but never wing buffet, which PHASE_BREATH disabled (:366-383).
      id: 'wing_buffet',
      spellId: SPELL_WINGBUFFET,
      initialMinMs: 10_000,
      initialMaxMs: 20_000,
      repeatMinMs: 15_000,
      repeatMaxMs: 30_000,
      target: 'self',
      phase: PHASE_GROUND,
      cite: 'boss_onyxia.cpp:163 AddCombatAction(WING_BUFFET, 10000, 20000); :485 re-arm',
    },
    {
      id: 'knock_away',
      spellId: SPELL_KNOCK_AWAY,
      initialMinMs: 20_000,
      initialMaxMs: 30_000,
      repeatMinMs: 25_000,
      repeatMaxMs: 40_000,
      target: 'victim',
      phase: PHASE_GROUND,
      cite: 'boss_onyxia.cpp:164 AddCombatAction(KNOCK_AWAY, 20000, 30000); :491 re-arm',
    },
    // ---- PHASE_BREATH (flight) ----------------------------------------------------
    {
      // ResetCombatAction(ONYXIA_FIREBALL, 0) on entering the phase — ready at once.
      id: 'fireball',
      spellId: SPELL_FIREBALL,
      initialMinMs: 0,
      initialMaxMs: 0,
      repeatMinMs: 3000,
      repeatMaxMs: 5000,
      target: 'hostile_random',
      select: { playerOnly: true },
      phase: PHASE_FLIGHT,
      actions: [{
        kind: 'reset_threat',
        of: 'cast',
        cite: 'boss_onyxia.cpp:387-393 OnSpellCooldownAdded SPELL_FIREBALL modifyThreatPercent(target, -100)',
      }],
      cite: 'boss_onyxia.cpp:361 ResetCombatAction(FIREBALL, 0); :494-505 RANDOM|PLAYER, re-arm 3000-5000',
    },
    // ---- PHASE_END (landed) -------------------------------------------------------
    {
      id: 'bellowing_roar',
      spellId: SPELL_BELLOWINGROAR,
      // ResetCombatAction(BELLOWING_ROAR, 0) — fires the moment she lands. Armed
      // disabled in the ctor (:158 `true` = timerless-off) so it never fires earlier.
      initialMinMs: 0,
      initialMaxMs: 0,
      repeatMinMs: 15_000,
      repeatMaxMs: 45_000,
      target: 'self',
      phase: PHASE_LANDED,
      cite: 'boss_onyxia.cpp:376 ResetCombatAction(BELLOWING_ROAR, 0); :458-462 re-arm 15000-45000',
    },
    {
      id: 'flame_breath_landed',
      spellId: SPELL_FLAMEBREATH,
      initialMinMs: 10_000,
      initialMaxMs: 20_000,
      repeatMinMs: 10_000,
      repeatMaxMs: 20_000,
      target: 'victim',
      phase: PHASE_LANDED,
      cite: 'boss_onyxia.cpp:377 ResetCombatAction(FLAME_BREATH, urand(10000,20000))',
    },
    {
      id: 'cleave_landed',
      spellId: SPELL_CLEAVE,
      initialMinMs: 2000,
      initialMaxMs: 5000,
      repeatMinMs: 5000,
      repeatMaxMs: 10_000,
      target: 'victim',
      phase: PHASE_LANDED,
      cite: 'boss_onyxia.cpp:378 ResetCombatAction(CLEAVE, urand(2000,5000)); :473 re-arm',
    },
    {
      id: 'tail_sweep_landed',
      spellId: SPELL_TAILSWEEP,
      initialMinMs: 15_000,
      initialMaxMs: 20_000,
      repeatMinMs: 15_000,
      repeatMaxMs: 20_000,
      target: 'self',
      phase: PHASE_LANDED,
      cite: 'boss_onyxia.cpp:379 ResetCombatAction(TAIL_SWEEP, urand(15000,20000))',
    },
    {
      // Phase 3 re-arms KNOCK_AWAY at 10000-20000, TIGHTER than the pull's 20000-30000.
      id: 'knock_away_landed',
      spellId: SPELL_KNOCK_AWAY,
      initialMinMs: 10_000,
      initialMaxMs: 20_000,
      repeatMinMs: 25_000,
      repeatMaxMs: 40_000,
      target: 'victim',
      phase: PHASE_LANDED,
      cite: 'boss_onyxia.cpp:380 ResetCombatAction(KNOCK_AWAY, urand(10000,20000)); :491 re-arm',
    },
  ],
  summonWaves: [
    {
      id: 'onyxian_whelps',
      creatureEntry: NPC_ONYXIA_WHELP,
      perTick: 2,
      armDelayMs: 3000,
      // First wave pairs come fast (1000-2500); later waves are slower (2000-4000).
      firstTickMinMs: 1000,
      firstTickMaxMs: 2500,
      tickMinMs: 2000,
      tickMaxMs: 4000,
      firstWaveCount: 20,
      waveMinCount: 4,
      waveMaxCount: 10,
      gapBaseMs: 90_000,
      gapPerSummonFirstMs: 1750,
      gapPerSummonMs: 3000,
      phase: PHASE_FLIGHT,
      cite: 'boss_onyxia.cpp:309-330 SummonWhelps; :199 20 first then urand(4,10); :339 ResetTimer 3000',
    },
  ],
  phases: [
    {
      phase: PHASE_FLIGHT,
      hpBelowPct: 65,
      actions: [
        {
          kind: 'yell',
          textId: SAY_PHASE_2_TRANS,
          cite: 'boss_onyxia.cpp:405 DoScriptText(SAY_PHASE_2_TRANS)',
        },
        {
          kind: 'set_instance_data',
          field: TYPE_ONYXIA,
          value: DATA_LIFTOFF,
          cite: 'boss_onyxia.cpp:341 m_instance->SetData(TYPE_ONYXIA, DATA_LIFTOFF)',
        },
        {
          // SetCombatMovement(false) + SetMeleeEnabled(false): she is airborne and unreachable in
          // melee for the whole phase, which is what makes the whelps matter.
          kind: 'set_combat_movement',
          enabled: false,
          cite: 'boss_onyxia.cpp:406-407 SetCombatMovement(false); SetMeleeEnabled(false)',
        },
        {
          kind: 'cast_self',
          spellId: SPELL_DRAGON_HOVER,
          cite: 'boss_onyxia.cpp:288 CastSpell(nullptr, SPELL_DRAGON_HOVER, TRIGGERED)',
        },
        {
          kind: 'flavor',
          text: 'takes to the air! Whelps pour from the walls.',
          cite: 'boss_onyxia.cpp:399-413 PHASE_2_TRANSITION at <=65 % HP',
        },
      ],
      cite: 'boss_onyxia.cpp:399-414 GetHealthPercent() > 65.0f gate → PHASE_TO_LIFTOFF',
    },
    {
      phase: PHASE_LANDED,
      hpBelowPct: 40,
      actions: [
        {
          kind: 'yell',
          textId: SAY_PHASE_3_TRANS,
          cite: 'boss_onyxia.cpp:421 DoScriptText(SAY_PHASE_3_TRANS)',
        },
        {
          kind: 'remove_auras',
          spellId: SPELL_DRAGON_HOVER,
          cite: 'boss_onyxia.cpp:426 RemoveAurasDueToSpell(SPELL_DRAGON_HOVER)',
        },
        {
          kind: 'set_combat_movement',
          enabled: true,
          cite: 'boss_onyxia.cpp:347-348 SetCombatMovement(true, true); SetMeleeEnabled(true)',
        },
        {
          kind: 'flavor',
          text: 'lands, and the whelp waves stop.',
          cite: 'boss_onyxia.cpp:415-430 PHASE_3_TRANSITION at <=40 %; :422 DisableTimer(SUMMON_WHELPS)',
        },
      ],
      cite: 'boss_onyxia.cpp:415-430 GetHealthPercent() > 40.0f gate → PHASE_BREATH_POST → PHASE_END',
    },
  ],
  lifecycle: {
    onAggro: [
      {
        kind: 'set_instance_data',
        field: TYPE_ONYXIA,
        value: INSTANCE_DATA.IN_PROGRESS,
        cite: 'boss_onyxia.cpp:213-214 SetData(TYPE_ONYXIA, IN_PROGRESS)',
      },
    ],
    onDeath: [
      {
        kind: 'set_instance_data',
        field: TYPE_ONYXIA,
        value: INSTANCE_DATA.DONE,
        cite: 'boss_onyxia.cpp:229-230 JustDied SetData(TYPE_ONYXIA, DONE)',
      },
    ],
    onEvade: [
      {
        kind: 'set_instance_data',
        field: TYPE_ONYXIA,
        value: INSTANCE_DATA.FAIL,
        cite: 'boss_onyxia.cpp:223-224 JustReachedHome SetData(TYPE_ONYXIA, FAIL)',
      },
    ],
  },
  cites: [
    'boss_onyxia.cpp:34-94 enums (spells, points, PHASE_*)',
    'boss_onyxia.cpp:143-207 ctor + Reset (every timer arm)',
    'boss_onyxia.cpp:332-385 PhaseTransition + HandlePhaseTransition (the phase kits)',
    'boss_onyxia.cpp:395-537 ExecuteAction (every re-arm)',
    'instance_onyxias_lair.cpp:84-110 SetData(TYPE_ONYXIA, …)',
    'onyxias_lair.h:10-19 TYPE_ONYXIA, DATA_LIFTOFF, NPC_ONYXIA_WHELP 11262',
  ],
};

export const INSTANCE_ONYXIAS_LAIR: ScriptDevIR = {
  name: 'instance_onyxias_lair',
  boundCreatures: [],
  sourceFile: 'kalimdor/onyxias_lair/instance_onyxias_lair.cpp',
  spellIds: [],
  timers: [],
  encounters: [
    {
      creatureEntry: 10184,
      field: TYPE_ONYXIA,
      cite: 'instance_onyxias_lair.cpp:84-110 SetData(TYPE_ONYXIA, …); boss_onyxia.cpp:213,224,230',
    },
  ],
  cites: [
    'instance_onyxias_lair.cpp:29-121 whole file',
    // Not ported: the Warder respawn/despawn list (:88-110) and GO_WHELP_SPAWNER 176510 (:66-78)
    // are world-side spawn lifecycle, not combat state — named in the module header as residuals.
  ],
};
