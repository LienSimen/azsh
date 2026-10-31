// World bosses ScriptDev IR ports. Source: boss_kazzak.cpp, boss_azuregos.cpp and
// bosses_emerald_dragons.cpp. Never invent timers, thresholds or spell ids.

import type { ScriptDevIR } from './types.ts';
import { CAST_FLAG } from '../creature/creatureAi.ts';

// Entry / spell constants

// boss_kazzak.cpp:29–51
export const NPC_LORD_KAZZAK = 12397;
const SPELL_SHADOW_VOLLEY = 21341;
const SPELL_BERSERK = 21340;
const SPELL_CLEAVE_KAZZAK = 20691;
const SPELL_THUNDERCLAP = 26554;
const SPELL_VOIDBOLT = 21066;
const SPELL_MARK_OF_KAZZAK = 21056;
const SPELL_CAPTURESOUL = 21053;
const SPELL_TWISTED_REFLECTION = 21063;

// boss_azuregos.cpp:29–40
export const NPC_AZUREGOS = 6109;
const SPELL_ARCANE_VACUUM = 21147;
const SPELL_MARK_OF_FROST_PLAYER = 23182;
const SPELL_MARK_OF_FROST_AURA = 23184;
const SPELL_MANA_STORM = 21097;
const SPELL_CHILL = 21098;
const SPELL_FROST_BREATH = 21099;
const SPELL_REFLECT = 22067;
const SPELL_CLEAVE_AZUREGOS = 19983;

// bosses_emerald_dragons.cpp:43–53 (shared) + per-dragon enums
export const NPC_YSONDRE = 14887;
export const NPC_LETHON = 14888;
export const NPC_EMERISS = 14889;
export const NPC_TAERAR = 14890;
export const NPC_SPIRIT_SHADE = 15261;
export const NPC_SHADE_OF_TAERAR = 15302;
export const NPC_DEMENTED_DRUID = 15260;
export const NPC_DREAM_FOG = 15224;

const SPELL_MARK_OF_NATURE_PLAYER = 25040;
const SPELL_MARK_OF_NATURE_AURA = 25041;
const SPELL_SEEPING_FOG_R = 24813;
const SPELL_SEEPING_FOG_L = 24814;
const SPELL_NOXIOUS_BREATH = 24818;
const SPELL_TAILSWEEP = 15847;

// Emeriss — bosses_emerald_dragons.cpp:153–160
const SPELL_VOLATILE_INFECTION = 24928;
const SPELL_CORRUPTION_OF_EARTH = 24910;

// Lethon — bosses_emerald_dragons.cpp:234–243
const SPELL_SHADOW_BOLT_WIRL = 24834;
const SPELL_DRAW_SPIRIT = 24811;

// Taerar — bosses_emerald_dragons.cpp:359–367
const SPELL_ARCANE_BLAST = 24857;
const SPELL_BELLOWING_ROAR = 22686;
const SPELL_SUMMON_SHADE_1 = 24841;
const SPELL_SUMMON_SHADE_2 = 24842;
const SPELL_SUMMON_SHADE_3 = 24843;
const SPELL_SELF_STUN = 24883;

// Ysondre — bosses_emerald_dragons.cpp:493–498
const SPELL_LIGHTNING_WAVE = 24819;
const SPELL_SUMMON_DRUIDS = 24796;

// 3 * MINUTE * IN_MILLISECONDS — boss_kazzak.cpp:74
const KAZZAK_SUPREME_MS = 3 * 60 * 1000;

// boss_kazzak

// boss_kazzak. Shadow Volley 3–12s, Cleave 7s/8–12s, Thunder Clap 16–20s/10–14s, Void Bolt
// 30s/15–28s, Mark 25s/20s, Twisted Reflection 33s/15s, and Supreme at 3 min shortens the volley.
export const BOSS_KAZZAK: ScriptDevIR = {
  name: 'boss_kazzak',
  boundCreatures: [NPC_LORD_KAZZAK],
  sourceFile: 'eastern_kingdoms/boss_kazzak.cpp',
  spellIds: [
    SPELL_SHADOW_VOLLEY,
    SPELL_BERSERK,
    SPELL_CLEAVE_KAZZAK,
    SPELL_THUNDERCLAP,
    SPELL_VOIDBOLT,
    SPELL_MARK_OF_KAZZAK,
    SPELL_CAPTURESOUL,
    SPELL_TWISTED_REFLECTION,
  ],
  timers: [
    {
      id: 'shadow_volley',
      spellId: SPELL_SHADOW_VOLLEY,
      initialMinMs: 3000,
      initialMaxMs: 12_000,
      // Pre-berserk rearm; berserk 1–3s is phase-timer below
      repeatMinMs: 5000,
      repeatMaxMs: 30_000,
      target: 'self',
      cite: 'boss_kazzak.cpp:68,128-131',
    },
    {
      id: 'cleave',
      spellId: SPELL_CLEAVE_KAZZAK,
      initialMinMs: 7000,
      initialMaxMs: 7000,
      repeatMinMs: 8000,
      repeatMaxMs: 12_000,
      target: 'victim',
      cite: 'boss_kazzak.cpp:69,136-140',
    },
    {
      id: 'thunderclap',
      spellId: SPELL_THUNDERCLAP,
      initialMinMs: 16_000,
      initialMaxMs: 20_000,
      repeatMinMs: 10_000,
      repeatMaxMs: 14_000,
      target: 'self',
      cite: 'boss_kazzak.cpp:70,144-148',
    },
    {
      id: 'void_bolt',
      spellId: SPELL_VOIDBOLT,
      initialMinMs: 30_000,
      initialMaxMs: 30_000,
      repeatMinMs: 15_000,
      repeatMaxMs: 28_000,
      target: 'victim',
      cite: 'boss_kazzak.cpp:71,152-156',
    },
    {
      id: 'mark_of_kazzak',
      spellId: SPELL_MARK_OF_KAZZAK,
      initialMinMs: 25_000,
      initialMaxMs: 25_000,
      repeatMinMs: 20_000,
      repeatMaxMs: 20_000,
      target: 'hostile_random_mana',
      select: { powerMana: true },
      cite: 'boss_kazzak.cpp:72,160-166 SELECT_FLAG_POWER_MANA',
    },
    {
      id: 'twisted_reflection',
      spellId: SPELL_TWISTED_REFLECTION,
      initialMinMs: 33_000,
      initialMaxMs: 33_000,
      repeatMinMs: 15_000,
      repeatMaxMs: 15_000,
      target: 'hostile_random_player',
      select: { playerOnly: true },
      cite: 'boss_kazzak.cpp:73,171-177 SELECT_FLAG_PLAYER',
    },
    {
      // Supreme → Berserk after 3 minutes (cpp:74,112-122). Once.
      id: 'supreme_berserk',
      spellId: SPELL_BERSERK,
      initialMinMs: KAZZAK_SUPREME_MS,
      initialMaxMs: KAZZAK_SUPREME_MS,
      // one-shot: re-arm far future so it does not spam
      repeatMinMs: 24 * 60 * 60 * 1000,
      repeatMaxMs: 24 * 60 * 60 * 1000,
      target: 'self',
      castFlags: CAST_FLAG.FORCE_TARGET_SELF,
      cite: 'boss_kazzak.cpp:74,112-122 SPELL_BERSERK after 3min',
    },
  ],
  lifecycle: {
    onAggro: [
      {
        kind: 'cast_self',
        spellId: SPELL_CAPTURESOUL,
        castFlags: CAST_FLAG.TRIGGERED,
        cite: 'boss_kazzak.cpp:85 DoCastSpellIfCan CAPTURESOUL CAST_TRIGGERED',
      },
    ],
  },
  cites: ['boss_kazzak.cpp:29-222', 'scriptdev2.sql boss_kazzak entry 12397'],
};

// boss_azuregos

// boss_azuregos. Mana Storm 5–17s/18–35s, Chill 10–30s/13–25s, Frost Breath 2–8s/10–25s, Arcane
// Vacuum teleport 30s/20–30s, Reflect 15–30s/20–35s, Cleave 7s, Mark of Frost on aggro.
export const BOSS_AZUREGOS: ScriptDevIR = {
  name: 'boss_azuregos',
  boundCreatures: [NPC_AZUREGOS],
  sourceFile: 'kalimdor/boss_azuregos.cpp',
  spellIds: [
    SPELL_ARCANE_VACUUM,
    SPELL_MARK_OF_FROST_PLAYER,
    SPELL_MARK_OF_FROST_AURA,
    SPELL_MANA_STORM,
    SPELL_CHILL,
    SPELL_FROST_BREATH,
    SPELL_REFLECT,
    SPELL_CLEAVE_AZUREGOS,
  ],
  timers: [
    {
      id: 'manastorm',
      spellId: SPELL_MANA_STORM,
      initialMinMs: 5000,
      initialMaxMs: 17_000,
      repeatMinMs: 18_000,
      repeatMaxMs: 35_000,
      target: 'hostile_random',
      cite: 'boss_azuregos.cpp:57,96-103 nearest → hostile_random stand-in',
    },
    {
      id: 'chill',
      spellId: SPELL_CHILL,
      initialMinMs: 10_000,
      initialMaxMs: 30_000,
      repeatMinMs: 13_000,
      repeatMaxMs: 25_000,
      target: 'self',
      cite: 'boss_azuregos.cpp:58,114-118',
    },
    {
      id: 'frost_breath',
      spellId: SPELL_FROST_BREATH,
      initialMinMs: 2000,
      initialMaxMs: 8000,
      repeatMinMs: 10_000,
      repeatMaxMs: 25_000,
      target: 'self',
      cite: 'boss_azuregos.cpp:59,120-124',
    },
    {
      id: 'arcane_vacuum',
      spellId: SPELL_ARCANE_VACUUM,
      initialMinMs: 30_000,
      initialMaxMs: 30_000,
      repeatMinMs: 20_000,
      repeatMaxMs: 30_000,
      target: 'self',
      cite: 'boss_azuregos.cpp:60,105-112 SPELL_ARCANE_VACUUM',
    },
    {
      id: 'reflect',
      spellId: SPELL_REFLECT,
      initialMinMs: 15_000,
      initialMaxMs: 30_000,
      repeatMinMs: 20_000,
      repeatMaxMs: 35_000,
      target: 'self',
      cite: 'boss_azuregos.cpp:61,126-130',
    },
    {
      id: 'cleave',
      spellId: SPELL_CLEAVE_AZUREGOS,
      initialMinMs: 7000,
      initialMaxMs: 7000,
      repeatMinMs: 7000,
      repeatMaxMs: 7000,
      target: 'victim',
      cite: 'boss_azuregos.cpp:62,132-136',
    },
  ],
  lifecycle: {
    onAggro: [
      {
        kind: 'cast_self',
        spellId: SPELL_MARK_OF_FROST_AURA,
        castFlags: CAST_FLAG.TRIGGERED,
        cite: 'boss_azuregos.cpp:80 DoCastSpellIfCan MARK_OF_FROST_AURA',
      },
    ],
  },
  cites: ['boss_azuregos.cpp:29-150', 'scriptdev2.sql boss_azuregos entry 6109'],
};

// Shared emerald-dragon timers (boss_emerald_dragonAI)

// Shared emerald kit: Seeping Fog 30s/60s on both sides, Noxious Breath 9–12s, Tail Sweep
// 10–20s/10–30s, with the special at 75/50/25%. Cite: bosses_emerald_dragons.cpp:65–72,110–141.
function emeraldSharedTimers(): ScriptDevIR['timers'] {
  return [
    {
      id: 'seeping_fog_r',
      spellId: SPELL_SEEPING_FOG_R,
      initialMinMs: 30_000,
      initialMaxMs: 30_000,
      repeatMinMs: 60_000,
      repeatMaxMs: 60_000,
      target: 'self',
      castFlags: CAST_FLAG.TRIGGERED,
      cite: 'bosses_emerald_dragons.cpp:69,118-122 SPELL_SEEPING_FOG_R TRIGGERED',
    },
    {
      id: 'seeping_fog_l',
      spellId: SPELL_SEEPING_FOG_L,
      initialMinMs: 30_000,
      initialMaxMs: 30_000,
      repeatMinMs: 60_000,
      repeatMaxMs: 60_000,
      target: 'self',
      castFlags: CAST_FLAG.TRIGGERED,
      cite: 'bosses_emerald_dragons.cpp:69,118-122 SPELL_SEEPING_FOG_L TRIGGERED',
    },
    {
      id: 'noxious_breath',
      spellId: SPELL_NOXIOUS_BREATH,
      initialMinMs: 9000,
      initialMaxMs: 12_000,
      repeatMinMs: 9000,
      repeatMaxMs: 12_000,
      target: 'self',
      cite: 'bosses_emerald_dragons.cpp:70,127-131',
    },
    {
      id: 'tailsweep',
      spellId: SPELL_TAILSWEEP,
      initialMinMs: 10_000,
      initialMaxMs: 20_000,
      repeatMinMs: 10_000,
      repeatMaxMs: 30_000,
      target: 'self',
      cite: 'bosses_emerald_dragons.cpp:71,135-139',
    },
  ];
}

/** HP thresholds 75/50/25 — m_uiEventCounter * 25 (cpp:111–112). */
function emeraldSpecialPhases(
  spellId: number,
  cite: string,
  extra?: { summonEntry?: number; summonCount?: number },
): NonNullable<ScriptDevIR['phases']> {
  const mk = (phase: number, pct: number) => {
    const actions: NonNullable<ScriptDevIR['phases']>[0]['actions'] = [
      { kind: 'cast_self', spellId, cite },
    ];
    if (extra?.summonEntry && extra.summonCount) {
      actions.push({
        kind: 'summon_count',
        creatureEntry: extra.summonEntry,
        count: extra.summonCount,
        cite: `${cite} + summon stand-in`,
      });
    }
    return {
      phase,
      hpBelowPct: pct,
      actions,
      cite: `bosses_emerald_dragons.cpp:111 GetHealthPercent < 100-counter*25 → ${pct}%`,
    };
  };
  return [mk(1, 75), mk(2, 50), mk(3, 25)];
}

function emeraldOnAggro(): NonNullable<ScriptDevIR['lifecycle']> {
  return {
    onAggro: [
      {
        kind: 'cast_self',
        spellId: SPELL_MARK_OF_NATURE_AURA,
        castFlags: CAST_FLAG.TRIGGERED,
        cite: 'bosses_emerald_dragons.cpp:76 DoCastSpellIfCan MARK_OF_NATURE_AURA TRIGGERED',
      },
    ],
  };
}

// boss_emeriss

// Shared emerald kit + Volatile Infection 12s init / urand(7–12)s rearm random. Special: Corruption of
// Earth at 75/50/25%. Cite: bosses_emerald_dragons.cpp:162–218
export const BOSS_EMERISS: ScriptDevIR = {
  name: 'boss_emeriss',
  boundCreatures: [NPC_EMERISS],
  sourceFile: 'world/bosses_emerald_dragons.cpp',
  spellIds: [
    SPELL_MARK_OF_NATURE_PLAYER,
    SPELL_MARK_OF_NATURE_AURA,
    SPELL_SEEPING_FOG_R,
    SPELL_SEEPING_FOG_L,
    SPELL_NOXIOUS_BREATH,
    SPELL_TAILSWEEP,
    SPELL_VOLATILE_INFECTION,
    SPELL_CORRUPTION_OF_EARTH,
  ],
  timers: [
    ...emeraldSharedTimers(),
    {
      id: 'volatile_infection',
      spellId: SPELL_VOLATILE_INFECTION,
      initialMinMs: 12_000,
      initialMaxMs: 12_000,
      repeatMinMs: 7000,
      repeatMaxMs: 12_000,
      target: 'hostile_random',
      cite: 'bosses_emerald_dragons.cpp:172,207-212',
    },
  ],
  phases: emeraldSpecialPhases(
    SPELL_CORRUPTION_OF_EARTH,
    'bosses_emerald_dragons.cpp:191-201 SPELL_CORRUPTION_OF_EARTH',
  ),
  lifecycle: emeraldOnAggro(),
  cites: ['bosses_emerald_dragons.cpp:43-218', 'scriptdev2.sql boss_emeriss entry 14889'],
};

// boss_lethon

// Lethon: the shared kit plus a Shadow Bolt Whirl aura on aggro, and Draw Spirit at 75/50/25%.
// The Spirit Shades are a per-phase summon_count stand-in. Cite: bosses_emerald_dragons.cpp:245.
export const BOSS_LETHON: ScriptDevIR = {
  name: 'boss_lethon',
  boundCreatures: [NPC_LETHON],
  sourceFile: 'world/bosses_emerald_dragons.cpp',
  spellIds: [
    SPELL_MARK_OF_NATURE_PLAYER,
    SPELL_MARK_OF_NATURE_AURA,
    SPELL_SEEPING_FOG_R,
    SPELL_SEEPING_FOG_L,
    SPELL_NOXIOUS_BREATH,
    SPELL_TAILSWEEP,
    SPELL_SHADOW_BOLT_WIRL,
    SPELL_DRAW_SPIRIT,
  ],
  timers: emeraldSharedTimers(),
  phases: emeraldSpecialPhases(
    SPELL_DRAW_SPIRIT,
    'bosses_emerald_dragons.cpp:257-265 SPELL_DRAW_SPIRIT',
    { summonEntry: NPC_SPIRIT_SHADE, summonCount: 1 },
  ),
  lifecycle: {
    onAggro: [
      {
        kind: 'cast_self',
        spellId: SPELL_MARK_OF_NATURE_AURA,
        castFlags: CAST_FLAG.TRIGGERED,
        cite: 'bosses_emerald_dragons.cpp:76 MARK_OF_NATURE_AURA',
      },
      {
        kind: 'cast_self',
        spellId: SPELL_SHADOW_BOLT_WIRL,
        castFlags: CAST_FLAG.TRIGGERED,
        cite: 'bosses_emerald_dragons.cpp:253 DoCastSpellIfCan SHADOW_BOLT_WIRL TRIGGERED',
      },
    ],
  },
  cites: ['bosses_emerald_dragons.cpp:225-348', 'scriptdev2.sql boss_lethon entry 14888'],
};

// boss_taerar

// Shared + Arcane Blast 12s / urand(7–12)s; Bellowing Roar 30s / urand(20–30)s. Special: Self Stun + 3×
// Summon Shade at 75/50/25%. Cite: bosses_emerald_dragons.cpp:371–480
export const BOSS_TAERAR: ScriptDevIR = {
  name: 'boss_taerar',
  boundCreatures: [NPC_TAERAR],
  sourceFile: 'world/bosses_emerald_dragons.cpp',
  spellIds: [
    SPELL_MARK_OF_NATURE_PLAYER,
    SPELL_MARK_OF_NATURE_AURA,
    SPELL_SEEPING_FOG_R,
    SPELL_SEEPING_FOG_L,
    SPELL_NOXIOUS_BREATH,
    SPELL_TAILSWEEP,
    SPELL_ARCANE_BLAST,
    SPELL_BELLOWING_ROAR,
    SPELL_SUMMON_SHADE_1,
    SPELL_SUMMON_SHADE_2,
    SPELL_SUMMON_SHADE_3,
    SPELL_SELF_STUN,
  ],
  timers: [
    ...emeraldSharedTimers(),
    {
      id: 'arcane_blast',
      spellId: SPELL_ARCANE_BLAST,
      initialMinMs: 12_000,
      initialMaxMs: 12_000,
      repeatMinMs: 7000,
      repeatMaxMs: 12_000,
      target: 'hostile_random',
      cite: 'bosses_emerald_dragons.cpp:385,459-465',
    },
    {
      id: 'bellowing_roar',
      spellId: SPELL_BELLOWING_ROAR,
      initialMinMs: 30_000,
      initialMaxMs: 30_000,
      repeatMinMs: 20_000,
      repeatMaxMs: 30_000,
      target: 'self',
      cite: 'bosses_emerald_dragons.cpp:386,469-474',
    },
  ],
  phases: [
    {
      phase: 1,
      hpBelowPct: 75,
      actions: [
        { kind: 'cast_self', spellId: SPELL_SELF_STUN, cite: 'bosses_emerald_dragons.cpp:405' },
        { kind: 'cast_self', spellId: SPELL_SUMMON_SHADE_1, castFlags: CAST_FLAG.TRIGGERED, cite: 'bosses_emerald_dragons.cpp:408' },
        { kind: 'cast_self', spellId: SPELL_SUMMON_SHADE_2, castFlags: CAST_FLAG.TRIGGERED, cite: 'bosses_emerald_dragons.cpp:409' },
        { kind: 'cast_self', spellId: SPELL_SUMMON_SHADE_3, castFlags: CAST_FLAG.TRIGGERED, cite: 'bosses_emerald_dragons.cpp:410' },
        {
          kind: 'summon_count',
          creatureEntry: NPC_SHADE_OF_TAERAR,
          count: 3,
          cite: 'bosses_emerald_dragons.cpp:408-410 3× Shade of Taerar (pack inject)',
        },
      ],
      cite: 'bosses_emerald_dragons.cpp:403-421 75% banish+shades',
    },
    {
      phase: 2,
      hpBelowPct: 50,
      actions: [
        { kind: 'cast_self', spellId: SPELL_SELF_STUN, cite: 'bosses_emerald_dragons.cpp:405' },
        {
          kind: 'summon_count',
          creatureEntry: NPC_SHADE_OF_TAERAR,
          count: 3,
          cite: 'bosses_emerald_dragons.cpp:408-410 50%',
        },
      ],
      cite: 'bosses_emerald_dragons.cpp:111 + 403-421 50%',
    },
    {
      phase: 3,
      hpBelowPct: 25,
      actions: [
        { kind: 'cast_self', spellId: SPELL_SELF_STUN, cite: 'bosses_emerald_dragons.cpp:405' },
        {
          kind: 'summon_count',
          creatureEntry: NPC_SHADE_OF_TAERAR,
          count: 3,
          cite: 'bosses_emerald_dragons.cpp:408-410 25%',
        },
      ],
      cite: 'bosses_emerald_dragons.cpp:111 + 403-421 25%',
    },
  ],
  lifecycle: emeraldOnAggro(),
  cites: ['bosses_emerald_dragons.cpp:350-485', 'scriptdev2.sql boss_taerar entry 14890'],
};

// boss_ysondre

// Shared + Lightning Wave 12s / urand(7–12)s. Special: Summon Druids at 75/50/25% (spell 24796 → Demented
// Druid Spirits). Cite: bosses_emerald_dragons.cpp:501–545
export const BOSS_YSONDRE: ScriptDevIR = {
  name: 'boss_ysondre',
  boundCreatures: [NPC_YSONDRE],
  sourceFile: 'world/bosses_emerald_dragons.cpp',
  spellIds: [
    SPELL_MARK_OF_NATURE_PLAYER,
    SPELL_MARK_OF_NATURE_AURA,
    SPELL_SEEPING_FOG_R,
    SPELL_SEEPING_FOG_L,
    SPELL_NOXIOUS_BREATH,
    SPELL_TAILSWEEP,
    SPELL_LIGHTNING_WAVE,
    SPELL_SUMMON_DRUIDS,
  ],
  timers: [
    ...emeraldSharedTimers(),
    {
      id: 'lightning_wave',
      spellId: SPELL_LIGHTNING_WAVE,
      initialMinMs: 12_000,
      initialMaxMs: 12_000,
      repeatMinMs: 7000,
      repeatMaxMs: 12_000,
      target: 'hostile_random',
      cite: 'bosses_emerald_dragons.cpp:511,533-539',
    },
  ],
  phases: emeraldSpecialPhases(
    SPELL_SUMMON_DRUIDS,
    'bosses_emerald_dragons.cpp:520-528 SPELL_SUMMON_DRUIDS',
    { summonEntry: NPC_DEMENTED_DRUID, summonCount: 1 },
  ),
  lifecycle: emeraldOnAggro(),
  cites: ['bosses_emerald_dragons.cpp:487-550', 'scriptdev2.sql boss_ysondre entry 14887'],
};

/** Lethon add: wait 3 s then walk to Lethon and Dark Offering. Cite: bosses_emerald_dragons.cpp:283-338. */
export const NPC_SPIRIT_SHADE_SCRIPT: ScriptDevIR = {
  name: 'npc_spirit_shade',
  boundCreatures: [NPC_SPIRIT_SHADE],
  sourceFile: 'world/bosses_emerald_dragons.cpp',
  spellIds: [24804, 24809],
  timers: [],
  cites: [
    'bosses_emerald_dragons.cpp:283-338 npc_spirit_shadeAI',
    'bosses_emerald_dragons.cpp:294 Reset m_uiInitialMovementTimer = 3s then visibility on',
    'bosses_emerald_dragons.cpp:307-315 MoveInLineOfSight Lethon within 3 yd → SPELL_DARK_OFFERING 24804 then ForcedDespawn(1000) - proximity GAP',
  ],
};

/** All world-boss ScriptDev IR exports (registry import). */
export const WORLD_BOSS_SCRIPTS = {
  boss_kazzak: BOSS_KAZZAK,
  boss_azuregos: BOSS_AZUREGOS,
  boss_emeriss: BOSS_EMERISS,
  boss_lethon: BOSS_LETHON,
  boss_taerar: BOSS_TAERAR,
  boss_ysondre: BOSS_YSONDRE,
} as const;
