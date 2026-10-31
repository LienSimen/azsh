// Scarlet Monastery ScriptDev IR ports. Source: boss_arcanist_doan, boss_herod,
// boss_mograine_and_whitemane and instance_scarlet_monastery. Every value cites file:line below.

import type { ScriptDevIR } from './types.ts';
import { INSTANCE_DATA } from './types.ts';
import { CAST_FLAG } from '../creature/creatureAi.ts';

// Constants — scarlet_monastery.h + boss enums

// scarlet_monastery.h:10–27
export const SM_MAX_ENCOUNTER = 2;
export const TYPE_MOGRAINE_AND_WHITE_EVENT = 1;
export const TYPE_ASHBRINGER_EVENT = 2;

export const NPC_MOGRAINE = 3976;
export const NPC_WHITEMANE = 3977;
export const NPC_VORREL = 3981;
export const NPC_INTERROGATOR_VISHAS = 3983;

export const GO_WHITEMANE_DOOR = 104600;
export const GO_CHAPEL_DOOR = 104591;

export const SAY_TRIGGER_VORREL = -1189015;
export const ITEM_CORRUPTED_ASHRBRINGER = 22691;
export const SAY_ASHBRINGER_ENTRANCE = -1189036;
export const AREATRIGGER_CATHEDRAL_ENTRANCE = 4089;

// boss_arcanist_doan.cpp:30–37
export const SAY_DOAN_AGGRO = -1189019;
export const SAY_DOAN_SPECIALAE = -1189020;
export const SPELL_POLYMORPH = 13323;
export const SPELL_SILENCE = 8988;
export const SPELL_ARCANE_EXPLOSION = 9433;
export const SPELL_DETONATION = 9435;
export const SPELL_ARCANE_BUBBLE = 9438;
export const NPC_ARCANIST_DOAN = 6487;

/** HP threshold. Cite: boss_arcanist_doan.cpp:88 GetHealthPercent() <= 50.0f */
export const DOAN_HP_BUBBLE = 50;

// boss_herod.cpp:31–44
export const SAY_HEROD_AGGRO = -1189000;
export const SAY_HEROD_WHIRLWIND = -1189001;
export const SAY_HEROD_ENRAGE = -1189002;
export const SAY_HEROD_KILL = -1189003;
export const EMOTE_GENERIC_ENRAGED = -1000003;
export const SAY_TRAINEE_SPAWN = -1189035;

export const SPELL_RUSHINGCHARGE = 8260;
export const SPELL_CLEAVE = 15496;
export const SPELL_WHIRLWIND = 8989;
export const SPELL_FRENZY = 8269;
export const NPC_HEROD = 3975;
export const NPC_SCARLET_TRAINEE = 6575;

/** HP threshold. Cite: boss_herod.cpp:99 GetHealthPercent() <= 30.0f */
export const HEROD_HP_ENRAGE = 30;
/** JustDied summon count. Cite: boss_herod.cpp:89 for (uint8 i = 0; i < 20; ++i) */
export const HEROD_TRAINEE_SUMMON_COUNT = 20;
// JustDied SummonCreature point (armory door). All 20 share this origin. Cite: boss_herod.cpp:90
// SummonCreature(…, 1939.18f, -431.58f, 17.09f, 6.22f, …)
export const HEROD_TRAINEE_SPAWN = {
  x: 1939.18,
  y: -431.58,
  z: 17.09,
  o: 6.22,
} as const;
/** TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN datalong. Cite: boss_herod.cpp:90 …, 600000) */
export const HEROD_TRAINEE_DESPAWN_MS = 600_000;
// mob_scarlet_traineeAI ctor escort arm. Host has no delayed-Start IR — named GAP. Cite: boss_herod.cpp:142
// m_uiStartTimer = urand(1000, 6000)
export const TRAINEE_START_TIMER_MIN_MS = 1_000;
export const TRAINEE_START_TIMER_MAX_MS = 6_000;
// Escort path into the arena, loaded by npc_escortAI Start(true). The table is ported but the host
// has no escort runner, so the movement is a GAP. Cite: script_waypoint 6575 points 1–12.
export const SCARLET_TRAINEE_WAYPOINTS = [
  { point: 1, x: 1945.81, y: -431.54, z: 16.36, waitMs: 0 },
  { point: 2, x: 1946.21, y: -436.41, z: 16.36, waitMs: 0 },
  { point: 3, x: 1950.01, y: -444.11, z: 14.63, waitMs: 0 },
  { point: 4, x: 1956.08, y: -449.34, z: 13.12, waitMs: 0 },
  { point: 5, x: 1966.59, y: -450.55, z: 11.27, waitMs: 0 },
  { point: 6, x: 1976.09, y: -447.51, z: 11.27, waitMs: 0 },
  { point: 7, x: 1983.42, y: -435.85, z: 11.27, waitMs: 0 },
  { point: 8, x: 1978.17, y: -428.81, z: 11.27, waitMs: 0 },
  { point: 9, x: 1973.97, y: -422.08, z: 9.04, waitMs: 0 },
  { point: 10, x: 1963.84, y: -418.9, z: 6.17, waitMs: 0 },
  { point: 11, x: 1961.22, y: -422.74, z: 6.17, waitMs: 0 },
  { point: 12, x: 1964.8, y: -431.26, z: 6.17, waitMs: 300_000 },
] as const;

// boss_mograine_and_whitemane.cpp:34–68
export const SAY_MO_AGGRO = -1189005;
export const SAY_MO_KILL = -1189006;
export const SAY_MO_RESSURECTED = -1189007;
export const SAY_WH_INTRO = -1189008;
export const SAY_WH_KILL = -1189009;
export const SAY_WH_RESSURECT = -1189010;

export const SPELL_CRUSADERSTRIKE = 14518;
export const SPELL_HAMMEROFJUSTICE = 5589;
export const SPELL_LAYONHANDS = 9257;
export const SPELL_RETRIBUTIONAURA = 8990;
export const SPELL_DIVINESHIELD = 642;

export const SPELL_DEEPSLEEP = 9256;
export const SPELL_SCARLETRESURRECTION = 9232;
export const SPELL_DOMINATEMIND = 14515;
export const SPELL_HOLYSMITE = 9481;
export const SPELL_HEAL = 12039;
export const SPELL_POWERWORDSHIELD = 22187;
export const SPELL_AB_EFFECT_000 = 28441;

/** Divine Shield / Deep Sleep HP. Cite: mograine cpp:303 <=50; whitemane cpp:477 <=50 */
export const MOGRAINE_HP_DIVINE_SHIELD = 50;
export const WHITEMANE_HP_DEEP_SLEEP = 50;

// Runtime phase (host starts at 0)
export const DOAN_PHASE_BUBBLE = 1;
export const HEROD_PHASE_ENRAGE = 1;
export const MOGRAINE_PHASE_SHIELD = 1;
export const WHITEMANE_PHASE_RES = 1;

// boss_arcanist_doan

// boss_arcanist_doan, creature 6487. Polymorph 15s/20s, Silence 7.5s/15–22s, Arcane Explosion
// 1–3s/2.5–8.5s; at ≤50% once the Bubble plus Detonation, collapsed into the same phase tick.
export const BOSS_ARCANIST_DOAN: ScriptDevIR = {
  name: 'boss_arcanist_doan',
  boundCreatures: [NPC_ARCANIST_DOAN],
  sourceFile: 'eastern_kingdoms/scarlet_monastery/boss_arcanist_doan.cpp',
  spellIds: [
    SPELL_POLYMORPH,
    SPELL_SILENCE,
    SPELL_ARCANE_EXPLOSION,
    SPELL_DETONATION,
    SPELL_ARCANE_BUBBLE,
  ],
  timers: [
    {
      id: 'polymorph',
      spellId: SPELL_POLYMORPH,
      // Reset m_uiPolymorphTimer = 15000 (cpp:52)
      initialMinMs: 15_000,
      initialMaxMs: 15_000,
      // CAST_OK re-arm 20000 (cpp:102)
      repeatMinMs: 20_000,
      repeatMaxMs: 20_000,
      // SelectAttackingTarget(ATTACKING_TARGET_RANDOM, 1) (cpp:99)
      target: 'hostile_random_not_top',
      select: { skipTopThreat: true },
      cite: 'boss_arcanist_doan.cpp:52,97-106',
    },
    {
      id: 'silence',
      spellId: SPELL_SILENCE,
      // Reset m_uiSilenceTimer = 7500 (cpp:53)
      initialMinMs: 7500,
      initialMaxMs: 7500,
      // CAST_OK re-arm urand(15000, 22000) (cpp:112)
      repeatMinMs: 15_000,
      repeatMaxMs: 22_000,
      target: 'self',
      cite: 'boss_arcanist_doan.cpp:53,108-115',
    },
    {
      id: 'arcane_explosion',
      spellId: SPELL_ARCANE_EXPLOSION,
      // Reset m_uiArcaneExplosionTimer = urand(1000, 3000) (cpp:54)
      initialMinMs: 1000,
      initialMaxMs: 3000,
      // CAST_OK re-arm urand(2500, 8500) (cpp:121)
      repeatMinMs: 2500,
      repeatMaxMs: 8500,
      target: 'self',
      cite: 'boss_arcanist_doan.cpp:54,117-124',
    },
  ],
  phases: [
    {
      phase: DOAN_PHASE_BUBBLE,
      hpBelowPct: DOAN_HP_BUBBLE,
      actions: [
        {
          kind: 'cast_self',
          spellId: SPELL_ARCANE_BUBBLE,
          cite: 'boss_arcanist_doan.cpp:90 DoCastSpellIfCan SPELL_ARCANE_BUBBLE',
        },
        {
          // 1s DetonationTimer (cpp:92) collapsed — same tick as bubble land.
          kind: 'cast_self',
          spellId: SPELL_DETONATION,
          cite: 'boss_arcanist_doan.cpp:73,92 DoCastSpellIfCan SPELL_DETONATION after 1000ms arm',
        },
        {
          kind: 'yell',
          textId: SAY_DOAN_SPECIALAE,
          cite: 'boss_arcanist_doan.cpp:75 DoScriptText SAY_SPECIALAE',
        },
        {
          kind: 'flavor',
          text: 'shields in an Arcane Bubble and detonates!',
          cite: 'boss_arcanist_doan.cpp:87-95 bShielded; 69-81 Detonation',
        },
      ],
      cite: 'boss_arcanist_doan.cpp:87-95 GetHealthPercent() <= 50.0f → Bubble + Detonation once',
    },
  ],
  lifecycle: {
    onAggro: [
      {
        kind: 'yell',
        textId: SAY_DOAN_AGGRO,
        cite: 'boss_arcanist_doan.cpp:61 DoScriptText SAY_AGGRO',
      },
    ],
  },
  cites: [
    'boss_arcanist_doan.cpp:28-141',
    'boss_arcanist_doan.cpp:50-57 Reset',
    'boss_arcanist_doan.cpp:64-127 UpdateAI',
  ],
};

// boss_herod

// boss_herod, creature 3975. Rushing Charge on aggro, Cleave 7.5s/7.5–17.5s, Whirlwind
// 14.5s/15–25s, Frenzy once at ≤30%, and JustDied summons 20× Scarlet Trainee at the door.
export const BOSS_HEROD: ScriptDevIR = {
  name: 'boss_herod',
  boundCreatures: [NPC_HEROD],
  sourceFile: 'eastern_kingdoms/scarlet_monastery/boss_herod.cpp',
  // Whirlwind 8989 triggers 15578, and a trigger payload resolves off the kit.
  spellIds: [SPELL_RUSHINGCHARGE, SPELL_CLEAVE, SPELL_WHIRLWIND, SPELL_FRENZY, 15578],
  timers: [
    {
      id: 'rushing_charge',
      spellId: SPELL_RUSHINGCHARGE,
      // Aggro DoCastSpellIfCan (cpp:69) — product: AGGRO onReset path
      initialMinMs: 0,
      initialMaxMs: 0,
      repeatMinMs: 0,
      repeatMaxMs: 0,
      target: 'self',
      onReset: true,
      castFlags: CAST_FLAG.TRIGGERED,
      cite: 'boss_herod.cpp:69 Aggro DoCastSpellIfCan SPELL_RUSHINGCHARGE',
    },
    {
      id: 'cleave',
      spellId: SPELL_CLEAVE,
      // Reset m_uiCleaveTimer = 7500 (cpp:62)
      initialMinMs: 7500,
      initialMaxMs: 7500,
      // re-arm urand(7500, 17500) (cpp:113) — no CAST_OK gate
      repeatMinMs: 7500,
      repeatMaxMs: 17_500,
      target: 'victim',
      cite: 'boss_herod.cpp:62,109-116',
    },
    {
      id: 'whirlwind',
      spellId: SPELL_WHIRLWIND,
      // Reset m_uiWhirlwindTimer = 14500 (cpp:63)
      initialMinMs: 14_500,
      initialMaxMs: 14_500,
      // CAST_OK re-arm urand(15000, 25000) (cpp:123)
      repeatMinMs: 15_000,
      repeatMaxMs: 25_000,
      target: 'victim',
      cite: 'boss_herod.cpp:63,118-127',
    },
  ],
  phases: [
    {
      phase: HEROD_PHASE_ENRAGE,
      hpBelowPct: HEROD_HP_ENRAGE,
      actions: [
        {
          kind: 'cast_self',
          spellId: SPELL_FRENZY,
          cite: 'boss_herod.cpp:101 DoCastSpellIfCan SPELL_FRENZY',
        },
        {
          kind: 'yell',
          textId: EMOTE_GENERIC_ENRAGED,
          cite: 'boss_herod.cpp:103 DoScriptText EMOTE_GENERIC_ENRAGED',
        },
        {
          kind: 'yell',
          textId: SAY_HEROD_ENRAGE,
          cite: 'boss_herod.cpp:104 DoScriptText SAY_ENRAGE',
        },
        {
          kind: 'flavor',
          text: 'becomes enraged!',
          cite: 'boss_herod.cpp:98-107 m_bEnrage at <=30%',
        },
      ],
      cite: 'boss_herod.cpp:98-107 GetHealthPercent() <= 30.0f → Frenzy once',
    },
  ],
  lifecycle: {
    onAggro: [
      {
        kind: 'yell',
        textId: SAY_HEROD_AGGRO,
        cite: 'boss_herod.cpp:68 DoScriptText SAY_AGGRO',
      },
    ],
    onDeath: [
      {
        kind: 'summon_count',
        creatureEntry: NPC_SCARLET_TRAINEE,
        count: HEROD_TRAINEE_SUMMON_COUNT,
        x: HEROD_TRAINEE_SPAWN.x,
        y: HEROD_TRAINEE_SPAWN.y,
        cite: 'boss_herod.cpp:89-90 for i<20 SummonCreature NPC_SCARLET_TRAINEE at 1939.18,-431.58,17.09 o=6.22 TEMPSPAWN 600000',
      },
      {
        kind: 'flavor',
        text: 'falls - Scarlet Trainees rush the arena!',
        cite: 'boss_herod.cpp:87-91 JustDied 20× trainee; cpp:75-78 first trainee SAY_TRAINEE_SPAWN',
      },
    ],
  },
  cites: [
    'boss_herod.cpp:29-187',
    'boss_herod.cpp:57-64 Reset',
    'boss_herod.cpp:87-91 JustDied 20 trainees at armory door',
    'boss_herod.cpp:93-130 UpdateAI',
  ],
};

// mob_scarlet_trainee

// mob_scarlet_trainee, creature 6575 — spawned by Herod's death, not self-summoning. It waits
// urand(1000,6000) then walks the arena path; both the stagger and the path are host GAPs.
export const MOB_SCARLET_TRAINEE: ScriptDevIR = {
  name: 'mob_scarlet_trainee',
  boundCreatures: [NPC_SCARLET_TRAINEE],
  sourceFile: 'eastern_kingdoms/scarlet_monastery/boss_herod.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {},
  cites: [
    'boss_herod.cpp:138-169 mob_scarlet_traineeAI',
    'boss_herod.cpp:142 m_uiStartTimer = urand(1000, 6000) — host stagger GAP (constants TRAINEE_START_TIMER_*)',
    'boss_herod.cpp:157 Start(true) — escort into arena; script_waypoint 6575 points 1-12 (movement GAP)',
    'scriptdev2.sql script_waypoint Entry=6575 PathId=0 (SCARLET_TRAINEE_WAYPOINTS)',
  ],
};

// boss_scarlet_commander_mograine

// boss_scarlet_commander_mograine, creature 3976. Crusader Strike 8.4s/6–15s, Hammer of Justice
// 9.6s/7–18.5s, Divine Shield once at ≤50%. The fake-death and res choreography is InstanceDef.
export const BOSS_SCARLET_COMMANDER_MOGRAINE: ScriptDevIR = {
  name: 'boss_scarlet_commander_mograine',
  boundCreatures: [NPC_MOGRAINE],
  sourceFile: 'eastern_kingdoms/scarlet_monastery/boss_mograine_and_whitemane.cpp',
  spellIds: [
    SPELL_CRUSADERSTRIKE,
    SPELL_HAMMEROFJUSTICE,
    SPELL_LAYONHANDS,
    SPELL_RETRIBUTIONAURA,
    SPELL_DIVINESHIELD,
    SPELL_SCARLETRESURRECTION,
    SPELL_AB_EFFECT_000,
  ],
  timers: [
    {
      id: 'retribution_aura',
      spellId: SPELL_RETRIBUTIONAURA,
      // Aggro DoCastSpellIfCan (cpp:149); HandleRevived also re-casts (cpp:274)
      initialMinMs: 0,
      initialMaxMs: 0,
      repeatMinMs: 0,
      repeatMaxMs: 0,
      target: 'self',
      onReset: true,
      castFlags: CAST_FLAG.TRIGGERED | CAST_FLAG.AURA_NOT_PRESENT,
      cite: 'boss_mograine_and_whitemane.cpp:149 Aggro SPELL_RETRIBUTIONAURA',
    },
    {
      id: 'crusader_strike',
      spellId: SPELL_CRUSADERSTRIKE,
      // AddCombatAction 8400u (cpp:86)
      initialMinMs: 8400,
      initialMaxMs: 8400,
      // GetSubsequentActionTimer urand(6000, 15000) (cpp:126)
      repeatMinMs: 6000,
      repeatMaxMs: 15_000,
      target: 'victim',
      cite: 'boss_mograine_and_whitemane.cpp:86,126,289-293',
    },
    {
      id: 'hammer_of_justice',
      spellId: SPELL_HAMMEROFJUSTICE,
      // AddCombatAction 9600u (cpp:87)
      initialMinMs: 9600,
      initialMaxMs: 9600,
      // GetSubsequentActionTimer urand(7000, 18500) (cpp:127)
      repeatMinMs: 7000,
      repeatMaxMs: 18_500,
      target: 'victim',
      cite: 'boss_mograine_and_whitemane.cpp:87,127,295-299',
    },
  ],
  phases: [
    {
      // Product: once at ≤50% (cpp DisableCombatAction after cast). Source first opportunity is after 40s
      // Divine Shield combat timer (cpp:88); phase tick owns the once-fire (no EVENT_T.HP slot).
      phase: MOGRAINE_PHASE_SHIELD,
      hpBelowPct: MOGRAINE_HP_DIVINE_SHIELD,
      actions: [
        {
          kind: 'cast_self',
          spellId: SPELL_DIVINESHIELD,
          cite: 'boss_mograine_and_whitemane.cpp:303-305 DoCastSpellIfCan SPELL_DIVINESHIELD when HP<=50',
        },
        {
          kind: 'flavor',
          text: 'casts Divine Shield!',
          cite: 'boss_mograine_and_whitemane.cpp:301-307 DisableCombatAction after shield',
        },
      ],
      cite: 'boss_mograine_and_whitemane.cpp:301-307 GetHealthPercent() <= 50.f → Divine Shield once',
    },
  ],
  lifecycle: {
    onAggro: [
      {
        kind: 'yell',
        textId: SAY_MO_AGGRO,
        cite: 'boss_mograine_and_whitemane.cpp:148 DoScriptText SAY_MO_AGGRO',
      },
      {
        kind: 'set_instance_data',
        field: TYPE_MOGRAINE_AND_WHITE_EVENT,
        // Pull starts fight; true IN_PROGRESS is JustPreventedDeath (cpp:166).
        // Product aggro → IN_PROGRESS for solo createSession instance credit.
        value: INSTANCE_DATA.IN_PROGRESS,
        cite: 'boss_mograine_and_whitemane.cpp:166 SetData IN_PROGRESS on fake death; product: aggro arms encounter',
      },
    ],
    onDeath: [
      {
        kind: 'set_instance_data',
        field: TYPE_MOGRAINE_AND_WHITE_EVENT,
        value: INSTANCE_DATA.DONE,
        cite: 'instance completion when both dead; product solo Mograine kill → DONE',
      },
    ],
    onEvade: [
      {
        kind: 'set_instance_data',
        field: TYPE_MOGRAINE_AND_WHITE_EVENT,
        value: INSTANCE_DATA.FAIL,
        cite: 'boss_mograine_and_whitemane.cpp:141-142 EnterEvadeMode SetData FAIL',
      },
    ],
  },
  cites: [
    'boss_mograine_and_whitemane.cpp:71-310 boss_scarlet_commander_mograineAI',
    'boss_mograine_and_whitemane.cpp:86-88 AddCombatAction timers',
    'boss_mograine_and_whitemane.cpp:159-195 JustPreventedDeath (waves stand-in)',
    'boss_mograine_and_whitemane.cpp:241-257 MograineCallForHelp (floor trash GAP)',
  ],
};

// boss_high_inquisitor_whitemane

// boss_high_inquisitor_whitemane, creature 3977. Heal 10s/13s, PW:Shield 15s/22–45s, Holy Smite,
// Dominate Mind 5–10s then 20–30s, and Deep Sleep once at ≤50%.
export const BOSS_HIGH_INQUISITOR_WHITEMANE: ScriptDevIR = {
  name: 'boss_high_inquisitor_whitemane',
  boundCreatures: [NPC_WHITEMANE],
  sourceFile: 'eastern_kingdoms/scarlet_monastery/boss_mograine_and_whitemane.cpp',
  spellIds: [
    SPELL_DEEPSLEEP,
    SPELL_SCARLETRESURRECTION,
    SPELL_DOMINATEMIND,
    SPELL_HOLYSMITE,
    SPELL_HEAL,
    SPELL_POWERWORDSHIELD,
  ],
  timers: [
    {
      id: 'holy_smite',
      spellId: SPELL_HOLYSMITE,
      // EnterCombat ResetCombatAction 100u (cpp:392)
      initialMinMs: 100,
      initialMaxMs: 100,
      // GetSubsequent ranged urand(2000, 3000) (cpp:358)
      repeatMinMs: 2000,
      repeatMaxMs: 3000,
      target: 'victim',
      cite: 'boss_mograine_and_whitemane.cpp:392,358,463-467',
    },
    {
      id: 'heal',
      spellId: SPELL_HEAL,
      // EnterCombat 10000u (cpp:390)
      initialMinMs: 10_000,
      initialMaxMs: 10_000,
      // GetSubsequent 13000u (cpp:356)
      repeatMinMs: 13_000,
      repeatMaxMs: 13_000,
      // The LOWEST-hp friendly within 50 yd, which is the resurrected Mograine standing next to her.
      // Self-only was the note here, and it made her heal the wrong body for the whole second half.
      target: 'self',
      friendlyLowestHpYd: 50,
      friendlyHpDeficit: 1,
      cite: 'boss_mograine_and_whitemane.cpp:390,356,454-461 DoSelectLowestHpFriendly(50.0f) then SPELL_HEAL 12039',
    },
    {
      id: 'power_word_shield',
      spellId: SPELL_POWERWORDSHIELD,
      // EnterCombat 15000u (cpp:391)
      initialMinMs: 15_000,
      initialMaxMs: 15_000,
      // GetSubsequent urand(22000, 45000) (cpp:357)
      repeatMinMs: 22_000,
      repeatMaxMs: 45_000,
      target: 'self',
      cite: 'boss_mograine_and_whitemane.cpp:391,357,469-473',
    },
    {
      id: 'dominate_mind',
      spellId: SPELL_DOMINATEMIND,
      // Armed after res combat (cpp:438); urand(5000,10000) subsequent init
      // Live: !urand(0,50) rare fire (cpp:499). Product: long timer, random player.
      initialMinMs: 20_000,
      initialMaxMs: 30_000,
      repeatMinMs: 20_000,
      repeatMaxMs: 30_000,
      target: 'hostile_random_player',
      select: { playerOnly: true },
      // Only after deep-sleep / both-up phase in live; phase-gated post-50%.
      phase: WHITEMANE_PHASE_RES,
      cite: 'boss_mograine_and_whitemane.cpp:438,497-503 Dominate Mind after res',
    },
  ],
  phases: [
    {
      phase: WHITEMANE_PHASE_RES,
      hpBelowPct: WHITEMANE_HP_DEEP_SLEEP,
      actions: [
        {
          kind: 'cast_self',
          spellId: SPELL_DEEPSLEEP,
          castFlags: CAST_FLAG.INTERRUPT_PREVIOUS,
          cite: 'boss_mograine_and_whitemane.cpp:479 DoCastSpellIfCan SPELL_DEEPSLEEP CAST_INTERRUPT_PREVIOUS',
        },
        {
          kind: 'flavor',
          text: 'casts Deep Sleep and moves to resurrect Mograine!',
          cite: 'boss_mograine_and_whitemane.cpp:475-495 Deep Sleep + MovePoint to body',
        },
        {
          // Script target res on Mograine — product solo: self cast of res visual.
          kind: 'cast_self',
          spellId: SPELL_SCARLETRESURRECTION,
          cite: 'boss_mograine_and_whitemane.cpp:426 HandleResurrection SPELL_SCARLETRESURRECTION',
        },
        {
          kind: 'yell',
          textId: SAY_WH_RESSURECT,
          cite: 'boss_mograine_and_whitemane.cpp:427 DoScriptText SAY_WH_RESSURECT',
        },
      ],
      cite: 'boss_mograine_and_whitemane.cpp:475-495 GetHealthPercent() <= 50.0f → Deep Sleep once',
    },
  ],
  lifecycle: {
    onDeath: [
      {
        kind: 'set_instance_data',
        field: TYPE_MOGRAINE_AND_WHITE_EVENT,
        value: INSTANCE_DATA.DONE,
        cite: 'encounter complete when Whitemane dies (solo createSession end state)',
      },
    ],
    onEvade: [
      {
        kind: 'set_instance_data',
        field: TYPE_MOGRAINE_AND_WHITE_EVENT,
        value: INSTANCE_DATA.FAIL,
        cite: 'boss_mograine_and_whitemane.cpp:380-381 EnterEvadeMode SetData FAIL',
      },
    ],
  },
  cites: [
    'boss_mograine_and_whitemane.cpp:312-507 boss_high_inquisitor_whitemaneAI',
    'boss_mograine_and_whitemane.cpp:385-396 EnterCombat timer arms',
    'boss_mograine_and_whitemane.cpp:423-443 HandleResurrection',
    'boss_mograine_and_whitemane.cpp:475-495 Deep Sleep at 50%',
  ],
};

// instance_scarlet_monastery

// instance_scarlet_monastery. No creature ScriptName — bound via instance_template map 189 only.
// TYPE_MOGRAINE_AND_WHITE_EVENT opens the Whitemane door; TYPE_ASHBRINGER_EVENT the chapel.
export const INSTANCE_SCARLET_MONASTERY: ScriptDevIR = {
  name: 'instance_scarlet_monastery',
  boundCreatures: [],
  sourceFile: 'eastern_kingdoms/scarlet_monastery/instance_scarlet_monastery.cpp',
  spellIds: [SPELL_AB_EFFECT_000],
  timers: [],
  encounters: [
    {
      creatureEntry: NPC_MOGRAINE,
      field: TYPE_MOGRAINE_AND_WHITE_EVENT,
      onDeath: INSTANCE_DATA.DONE,
      onAggro: INSTANCE_DATA.IN_PROGRESS,
      onEvade: INSTANCE_DATA.FAIL,
      cite: 'instance_scarlet_monastery.cpp:104-142 TYPE_MOGRAINE_AND_WHITE_EVENT; scarlet_monastery.h:15 NPC_MOGRAINE',
    },
    {
      creatureEntry: NPC_WHITEMANE,
      field: TYPE_MOGRAINE_AND_WHITE_EVENT,
      onDeath: INSTANCE_DATA.DONE,
      onAggro: INSTANCE_DATA.IN_PROGRESS,
      onEvade: INSTANCE_DATA.FAIL,
      cite: 'instance_scarlet_monastery.cpp:104-142 Whitemane share TYPE_MOGRAINE_AND_WHITE_EVENT',
    },
    {
      creatureEntry: NPC_INTERROGATOR_VISHAS,
      field: TYPE_ASHBRINGER_EVENT,
      // Vishas death is Vorrel yell only (cpp:69-77) — no SetData on Vishas.
      // Document encounter field unused; onDeath NOT written as DONE for ashbringer.
      onDeath: INSTANCE_DATA.NOT_STARTED,
      cite: 'instance_scarlet_monastery.cpp:69-77 OnCreatureDeath Vishas → Vorrel SAY_TRIGGER_VORREL (no TYPE_*)',
    },
  ],
  doors: [
    {
      field: TYPE_MOGRAINE_AND_WHITE_EVENT,
      goEntry: GO_WHITEMANE_DOOR,
      // cpp:106-107 IN_PROGRESS opens door; FAIL re-uses door (cpp:122)
      openOn: [INSTANCE_DATA.IN_PROGRESS],
      cite: 'instance_scarlet_monastery.cpp:106-107 DoUseDoorOrButton GO_WHITEMANE_DOOR on IN_PROGRESS',
    },
    {
      field: TYPE_ASHBRINGER_EVENT,
      goEntry: GO_CHAPEL_DOOR,
      openOn: [INSTANCE_DATA.IN_PROGRESS],
      cite: 'instance_scarlet_monastery.cpp:148 DoUseDoorOrButton GO_CHAPEL_DOOR on ASHBRINGER IN_PROGRESS',
    },
  ],
  unusedBindings: [
    {
      entry: 0,
      kind: 'creature',
      reason:
        'instance_scarlet_monastery has no creature_template.ScriptName bindings - bound via instance_template map 189 only (corpus boundCreatures []). NPCs stored by OnCreatureCreate (Mograine/Whitemane/Vorrel) are not ScriptName-bound to this file.',
      cite: 'instance_scarlet_monastery.cpp:214-219 RegisterSelf GetInstanceData; scriptdev2 instance_template',
    },
  ],
  cites: [
    'instance_scarlet_monastery.cpp:30-227',
    'scarlet_monastery.h:10-39',
    'instance_scarlet_monastery.cpp:102-161 SetData',
    'instance_scarlet_monastery.cpp:69-77 Vishas → Vorrel yell',
  ],
};

// at_cathedral_entrance

// AreaTrigger 4089: a player holding Corrupted Ashbringer 22691 with TYPE_ASHBRINGER_EVENT
// NOT_STARTED sets IN_PROGRESS and Mograine yells. Modelled as a goUse-shaped gate with no GO.
export const AT_CATHEDRAL_ENTRANCE: ScriptDevIR = {
  name: 'at_cathedral_entrance',
  boundCreatures: [],
  sourceFile: 'eastern_kingdoms/scarlet_monastery/instance_scarlet_monastery.cpp',
  spellIds: [],
  timers: [],
  goUse: {
    goEntries: [],
    gates: [
      {
        field: TYPE_ASHBRINGER_EVENT,
        equals: INSTANCE_DATA.NOT_STARTED,
        cite: 'instance_scarlet_monastery.cpp:182 GetData(TYPE_ASHBRINGER_EVENT) == NOT_STARTED',
      },
    ],
    actions: [
      {
        kind: 'set_instance_data',
        field: TYPE_ASHBRINGER_EVENT,
        value: INSTANCE_DATA.IN_PROGRESS,
        cite: 'instance_scarlet_monastery.cpp:184 SetData(TYPE_ASHBRINGER_EVENT, IN_PROGRESS)',
      },
      {
        kind: 'yell',
        textId: SAY_ASHBRINGER_ENTRANCE,
        cite: 'instance_scarlet_monastery.cpp:185 DoOrSimulateScriptTextForThisInstance SAY_ASHBRINGER_ENTRANCE NPC_MOGRAINE',
      },
      {
        kind: 'flavor',
        text: 'The Corrupted Ashbringer stirs the cathedral - Scarlets turn friendly!',
        cite: 'instance_scarlet_monastery.cpp:146-157 faction 35 flip; Whitemane despawn',
      },
    ],
    cite: 'instance_scarlet_monastery.cpp:178-201 AreaTrigger_at_cathedral_entrance; AT 4089',
  },
  cites: [
    'instance_scarlet_monastery.cpp:178-201',
    'scarlet_monastery.h:25-27 ITEM_CORRUPTED_ASHRBRINGER=22691; AREATRIGGER_CATHEDRAL_ENTRANCE=4089',
    'instance_scarlet_monastery.cpp:192-200 player must hold item (product: IR assumes holder)',
  ],
};
