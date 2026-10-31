// Blackrock Spire ScriptDev IR ports. Source: boss_gyth, boss_overlord_wyrmthalak,
// boss_pyroguard_emberseer, instance_blackrock_spire and its header. Every value cites file:line.

import type { ScriptDevIR } from './types.ts';
import { INSTANCE_DATA } from './types.ts';
import { CAST_FLAG } from '../creature/creatureAi.ts';

// Constants — blackrock_spire.h + boss/instance enums

// blackrock_spire.h:10–18
export const BRS_MAX_ENCOUNTER = 6;
export const TYPE_ROOM_EVENT = 0;
export const TYPE_EMBERSEER = 1;
export const TYPE_FLAMEWREATH = 2;
export const TYPE_STADIUM = 3;
export const TYPE_DRAKKISATH = 4;
export const TYPE_VALTHALAK = 5;

// blackrock_spire.h:20–34 NPCs
export const NPC_SCARSHIELD_INFILTRATOR = 10299;
export const NPC_BLACKHAND_SUMMONER = 9818;
export const NPC_BLACKHAND_VETERAN = 9819;
export const NPC_PYROGUARD_EMBERSEER = 9816;
export const NPC_SOLAKAR_FLAMEWREATH = 10264;
export const NPC_BLACKHAND_INCARCERATOR = 10316;
// The seven bodies whose deaths free Emberseer, named here so this module needs no dungeon-def
// import. Cite: src/data/dungeons/ubrs.ts:34; blackrock_spire.h:25.
const UBRS_INCARCERATOR_COUNT = 7;
export const NPC_BLACKHAND_ELITE = 10317;
export const NPC_LORD_VICTOR_NEFARIUS = 10162;
export const NPC_REND_BLACKHAND = 10429;
export const NPC_GYTH = 10339;
export const NPC_THE_BEAST = 10430;
export const NPC_DRAKKISATH = 10363;
export const NPC_CHROMATIC_WHELP = 10442;
export const NPC_CHROMATIC_DRAGON = 10447;
export const NPC_BLACKHAND_HANDLER = 10742;

// boss_overlord_wyrmthalak.cpp:35–37
export const NPC_SPIRESTONE_WARLORD = 9216;
export const NPC_SMOLDERTHORN_BERSERKER = 9268;
export const NPC_BLOODAXE_VETERAN = 9583;

// instance_blackrock_spire.cpp:64–65 rookery
export const NPC_ROOKERY_GUARDIAN = 10258;
export const NPC_ROOKERY_HATCHER = 10683;

// blackrock_spire.h:36–72 GOs
export const GO_EMBERSEER_IN = 175244;
export const GO_DOORS = 175705;
export const GO_EMBERSEER_OUT = 175153;
export const GO_FATHER_FLAME = 175245;
export const GO_GYTH_ENTRY_DOOR = 164726;
export const GO_GYTH_COMBAT_DOOR = 175185;
export const GO_GYTH_EXIT_DOOR = 175186;
export const GO_DRAKKISATH_DOOR_1 = 175946;
export const GO_DRAKKISATH_DOOR_2 = 175947;
export const GO_DRAGONSPINE = 164725;
export const GO_ROOKERY_EGG = 175124;

// boss_gyth.cpp:31–40 spells + texts
export const SAY_NEFARIUS_BUFF_GYTH = -1229017;
export const EMOTE_KNOCKED_OFF = -1229019;
export const SPELL_CHROMATIC_CHAOS = 16337;
export const SPELL_REND_MOUNTS = 16167;
export const SPELL_SUMMON_REND = 16328;
export const SPELL_CORROSIVE_ACID = 16359;
export const SPELL_FREEZE = 16350;
export const SPELL_FLAME_BREATH = 16390;
export const SPELL_KNOCK_AWAY_GYTH = 10101;

// boss_overlord_wyrmthalak.cpp:30–33
export const SPELL_BLASTWAVE = 11130;
export const SPELL_SHOUT = 23511;
export const SPELL_CLEAVE = 20691;
export const SPELL_KNOCKAWAY_WYRM = 20686;

// boss_pyroguard_emberseer.cpp:32–52
export const EMOTE_NEAR = -1229001;
export const EMOTE_FULL = -1229002;
export const SAY_FREE = -1229003;
export const MAX_GROWING_STACKS = 20;
export const SPELL_ENCAGE_EMBERSEER = 15281;
export const SPELL_FIRE_SHIELD = 13377;
export const SPELL_DESPAWN_EMBERSEER = 16078;
export const SPELL_FREEZE_ANIM = 16245;
export const SPELL_FULL_STRENGHT = 16047;
export const SPELL_GROWING = 16049;
export const SPELL_BONUS_DAMAGE = 16534;
export const SPELL_TRANSFORM = 16052;
export const SPELL_FIRENOVA = 23462;
export const SPELL_FLAMEBUFFET = 23341;
export const SPELL_PYROBLAST = 20228;

// instance_blackrock_spire.cpp:59–60,68 Emberseer / Beast
export const EMOTE_BEGIN = -1229000;
export const SPELL_EMBERSEER_GROWING = 16048;
export const SPELL_FINKLE_IS_EINHORN = 16710;

// instance_blackrock_spire.cpp:897–899 rookery hatcher
export const SPELL_STRIKE = 15580;
export const SPELL_SUNDER_ARMOR = 15572;
export const SPELL_DISTURB_EGGS = 15746;

// instance_blackrock_spire.cpp:31–34 areatriggers
export const AREATRIGGER_ENTER_UBRS = 2046;
export const AREATRIGGER_STADIUM = 2026;
export const AREATRIGGER_BEAST_AGGRO = 2066;
export const AREATRIGGER_BEAST_INTRO = 2067;

// Wyrmthalak add pool. Cite: boss_overlord_wyrmthalak.cpp:40 uSummons[3] Product fixed model (two of three)
// matches prior InstanceDef stand-in — true independent urand(0,2) per add is a determinism GAP.
export const WYRMTHALAK_SUMMON_POOL = [
  NPC_BLOODAXE_VETERAN,
  NPC_SMOLDERTHORN_BERSERKER,
  NPC_SPIRESTONE_WARLORD,
] as const;

/** Fixed two adds for mid-fight inject. Cite: cpp:124-127 two SummonCreature; product fixed pool. */
export const WYRMTHALAK_PHASE_ADDS = [
  NPC_BLOODAXE_VETERAN,
  NPC_SMOLDERTHORN_BERSERKER,
] as const;

// HP thresholds
/** Cite: boss_gyth.cpp:85 GetHealthPercent() < 50.0f Chromatic Chaos */
export const GYTH_HP_CHROMATIC = 50;
/** Cite: boss_gyth.cpp:134 GetHealthPercent() < 11.0f Summon Rend */
export const GYTH_HP_SUMMON_REND = 11;
/** Cite: boss_overlord_wyrmthalak.cpp:124 GetHealthPercent() < 51.0f */
export const WYRMTHALAK_HP_ADDS = 51;

// Runtime phase map (host starts at 0): Gyth: 0 = mounted kit; 1 = after Chromatic Chaos; 2 = after Rend
// dismount Wyrmthalak: 0 = solo; 1 = adds summoned
export const GYTH_PHASE_MOUNTED = 0;
export const GYTH_PHASE_BUFFED = 1;
export const GYTH_PHASE_DISMOUNTED = 2;
export const WYRMTHALAK_PHASE_1 = 0;
export const WYRMTHALAK_PHASE_2 = 1;

// boss_gyth

// boss_gyth, creature 10339. Corrosive Acid 8s/7s, Freeze 11s/16s, Flame Breath 4s/10.5s, Knock
// Away 23s/23s; <50% once Chromatic Chaos, <11% once Summon Rend and death prevention off.
export const BOSS_GYTH: ScriptDevIR = {
  name: 'boss_gyth',
  boundCreatures: [NPC_GYTH],
  sourceFile: 'eastern_kingdoms/blackrock_spire/boss_gyth.cpp',
  spellIds: [
    SPELL_CHROMATIC_CHAOS,
    SPELL_REND_MOUNTS,
    SPELL_SUMMON_REND,
    SPELL_CORROSIVE_ACID,
    SPELL_FREEZE,
    SPELL_FLAME_BREATH,
    SPELL_KNOCK_AWAY_GYTH,
  ],
  timers: [
    {
      id: 'rend_mounts',
      spellId: SPELL_REND_MOUNTS,
      initialMinMs: 0,
      initialMaxMs: 0,
      repeatMinMs: 0,
      repeatMaxMs: 0,
      target: 'self',
      onReset: true,
      castFlags: CAST_FLAG.TRIGGERED | CAST_FLAG.AURA_NOT_PRESENT,
      cite: 'boss_gyth.cpp:70 DoCastSpellIfCan SPELL_REND_MOUNTS on Reset',
    },
    {
      id: 'corrosive_acid',
      spellId: SPELL_CORROSIVE_ACID,
      // Reset uiCorrosiveAcidTimer = 8000 (cpp:63)
      initialMinMs: 8000,
      initialMaxMs: 8000,
      // CAST_OK re-arm 7000 (cpp:102)
      repeatMinMs: 7000,
      repeatMaxMs: 7000,
      target: 'self',
      cite: 'boss_gyth.cpp:63,99-105',
    },
    {
      id: 'freeze',
      spellId: SPELL_FREEZE,
      // Reset uiFreezeTimer = 11000 (cpp:64)
      initialMinMs: 11_000,
      initialMaxMs: 11_000,
      // CAST_OK re-arm 16000 (cpp:112)
      repeatMinMs: 16_000,
      repeatMaxMs: 16_000,
      target: 'self',
      cite: 'boss_gyth.cpp:64,108-114',
    },
    {
      id: 'flame_breath',
      spellId: SPELL_FLAME_BREATH,
      // Reset uiFlamebreathTimer = 4000 (cpp:65)
      initialMinMs: 4000,
      initialMaxMs: 4000,
      // CAST_OK re-arm 10500 (cpp:120)
      repeatMinMs: 10_500,
      repeatMaxMs: 10_500,
      target: 'self',
      cite: 'boss_gyth.cpp:65,117-123',
    },
    {
      id: 'knock_away',
      spellId: SPELL_KNOCK_AWAY_GYTH,
      // Reset uiKnockAwayTimer = 23000 (cpp:66)
      initialMinMs: 23_000,
      initialMaxMs: 23_000,
      // CAST_OK re-arm 23000 (cpp:128)
      repeatMinMs: 23_000,
      repeatMaxMs: 23_000,
      target: 'victim',
      cite: 'boss_gyth.cpp:66,125-131',
    },
  ],
  phases: [
    {
      phase: GYTH_PHASE_BUFFED,
      hpBelowPct: GYTH_HP_CHROMATIC,
      actions: [
        {
          // Nefarius casts on Gyth in live (cpp:91) — product: self-buff stand-in.
          kind: 'cast_self',
          spellId: SPELL_CHROMATIC_CHAOS,
          castFlags: CAST_FLAG.TRIGGERED,
          cite: 'boss_gyth.cpp:91 pNefarius->CastSpell(m_creature, SPELL_CHROMATIC_CHAOS, TRIGGERED)',
        },
        {
          kind: 'yell',
          textId: SAY_NEFARIUS_BUFF_GYTH,
          cite: 'boss_gyth.cpp:92 DoScriptText SAY_NEFARIUS_BUFF_GYTH (Nefarius)',
        },
        {
          kind: 'flavor',
          text: 'is empowered by Chromatic Chaos!',
          cite: 'boss_gyth.cpp:85-96 m_bHasChromaticChaos at <50%',
        },
      ],
      cite: 'boss_gyth.cpp:85-96 GetHealthPercent() < 50.0f → Chromatic Chaos once',
    },
    {
      phase: GYTH_PHASE_DISMOUNTED,
      hpBelowPct: GYTH_HP_SUMMON_REND,
      actions: [
        {
          kind: 'cast_self',
          spellId: SPELL_SUMMON_REND,
          castFlags: CAST_FLAG.TRIGGERED,
          cite: 'boss_gyth.cpp:136 DoCastSpellIfCan SPELL_SUMMON_REND; effect 41 → 10429',
        },
        {
          kind: 'remove_auras',
          spellId: SPELL_REND_MOUNTS,
          cite: 'boss_gyth.cpp:139 RemoveAurasDueToSpell(SPELL_REND_MOUNTS)',
        },
        {
          kind: 'set_death_prevention',
          enabled: false,
          cite: 'boss_gyth.cpp:138 SetDeathPrevention(false)',
        },
        {
          kind: 'flavor',
          text: 'knocks Rend Blackhand off!',
          cite: 'boss_gyth.cpp:73-76 JustSummoned EMOTE_KNOCKED_OFF',
        },
      ],
      cite: 'boss_gyth.cpp:134-141 GetHealthPercent() < 11.0f → Summon Rend once',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'set_death_prevention',
        enabled: true,
        cite: 'boss_gyth.cpp:69 Reset SetDeathPrevention(true)',
      },
    ],
  },
  cites: [
    'boss_gyth.cpp:28-159',
    'boss_gyth.cpp:61-71 Reset',
    'boss_gyth.cpp:78-145 UpdateAI',
    'blackrock_spire.h:29 NPC_GYTH=10339; :28 NPC_REND_BLACKHAND=10429',
  ],
};

// boss_overlord_wyrmthalak

// boss_overlord_wyrmthalak, creature 9568. Blast Wave 20s/20s, Shout 2s/10s, Cleave 6s/7s, Knock
// Away 12s/14s, all re-arming on the timer with no CAST_OK gate; <51% once summons two adds.
export const BOSS_OVERLORD_WYRMTHALAK: ScriptDevIR = {
  name: 'boss_overlord_wyrmthalak',
  boundCreatures: [9568],
  sourceFile: 'eastern_kingdoms/blackrock_spire/boss_overlord_wyrmthalak.cpp',
  spellIds: [SPELL_BLASTWAVE, SPELL_SHOUT, SPELL_CLEAVE, SPELL_KNOCKAWAY_WYRM],
  timers: [
    {
      id: 'blast_wave',
      spellId: SPELL_BLASTWAVE,
      // Reset m_uiBlastWaveTimer = 20000 (cpp:62)
      initialMinMs: 20_000,
      initialMaxMs: 20_000,
      // re-arm 20000 (cpp:91)
      repeatMinMs: 20_000,
      repeatMaxMs: 20_000,
      target: 'self',
      cite: 'boss_overlord_wyrmthalak.cpp:62,88-94',
    },
    {
      id: 'shout',
      spellId: SPELL_SHOUT,
      // Reset m_uiShoutTimer = 2000 (cpp:63)
      initialMinMs: 2000,
      initialMaxMs: 2000,
      // re-arm 10000 (cpp:100)
      repeatMinMs: 10_000,
      repeatMaxMs: 10_000,
      target: 'self',
      cite: 'boss_overlord_wyrmthalak.cpp:63,97-103',
    },
    {
      id: 'cleave',
      spellId: SPELL_CLEAVE,
      // Reset m_uiCleaveTimer = 6000 (cpp:64)
      initialMinMs: 6000,
      initialMaxMs: 6000,
      // re-arm 7000 (cpp:109)
      repeatMinMs: 7000,
      repeatMaxMs: 7000,
      target: 'victim',
      cite: 'boss_overlord_wyrmthalak.cpp:64,106-112',
    },
    {
      id: 'knock_away',
      spellId: SPELL_KNOCKAWAY_WYRM,
      // Reset m_uiKnockawayTimer = 12000 (cpp:65)
      initialMinMs: 12_000,
      initialMaxMs: 12_000,
      // re-arm 14000 (cpp:118)
      repeatMinMs: 14_000,
      repeatMaxMs: 14_000,
      target: 'self',
      cite: 'boss_overlord_wyrmthalak.cpp:65,115-121',
    },
  ],
  phases: [
    {
      phase: WYRMTHALAK_PHASE_2,
      hpBelowPct: WYRMTHALAK_HP_ADDS,
      actions: [
        {
          kind: 'summon_count',
          creatureEntry: WYRMTHALAK_PHASE_ADDS[0],
          count: 1,
          cite: 'boss_overlord_wyrmthalak.cpp:126 SummonCreature uSummons[urand]; product fixed 9583',
        },
        {
          kind: 'summon_count',
          creatureEntry: WYRMTHALAK_PHASE_ADDS[1],
          count: 1,
          cite: 'boss_overlord_wyrmthalak.cpp:127 SummonCreature uSummons[urand]; product fixed 9268',
        },
        {
          kind: 'flavor',
          text: 'calls for reinforcements!',
          cite: 'boss_overlord_wyrmthalak.cpp:124-139 m_bSummoned at <51%',
        },
      ],
      cite: 'boss_overlord_wyrmthalak.cpp:124-139 GetHealthPercent() < 51.0f → 2 adds once',
    },
  ],
  cites: [
    'boss_overlord_wyrmthalak.cpp:28-157',
    'boss_overlord_wyrmthalak.cpp:60-68 Reset',
    'boss_overlord_wyrmthalak.cpp:81-143 UpdateAI',
    'boss_overlord_wyrmthalak.cpp:40 uSummons {9583,9268,9216}',
  ],
};

// boss_pyroguard_emberseer

// boss_pyroguard_emberseer, creature 9816. Fire Shield on reset, then Fire Nova 6s/6s, Flame
// Buffet 3s/14s, Pyroblast 14s/15s. The 20-stack Growing ramp stays the InstanceDef objectGate.
export const BOSS_PYROGUARD_EMBERSEER: ScriptDevIR = {
  name: 'boss_pyroguard_emberseer',
  boundCreatures: [NPC_PYROGUARD_EMBERSEER],
  sourceFile: 'eastern_kingdoms/blackrock_spire/boss_pyroguard_emberseer.cpp',
  // Fire Shield 13377 ticks 13376; a trigger payload resolves off the kit.
  spellIds: [
    SPELL_ENCAGE_EMBERSEER,
    SPELL_FIRE_SHIELD,
    SPELL_DESPAWN_EMBERSEER,
    SPELL_FREEZE_ANIM,
    SPELL_FULL_STRENGHT,
    SPELL_GROWING,
    SPELL_BONUS_DAMAGE,
    SPELL_TRANSFORM,
    SPELL_FIRENOVA,
    SPELL_FLAMEBUFFET,
    SPELL_PYROBLAST,
    SPELL_EMBERSEER_GROWING, 13376,
  ],
  timers: [
    {
      id: 'fire_shield',
      spellId: SPELL_FIRE_SHIELD,
      initialMinMs: 0,
      initialMaxMs: 0,
      repeatMinMs: 0,
      repeatMaxMs: 0,
      target: 'self',
      onReset: true,
      castFlags: CAST_FLAG.TRIGGERED | CAST_FLAG.AURA_NOT_PRESENT,
      cite: 'boss_pyroguard_emberseer.cpp:82 DoCastSpellIfCan FIRE_SHIELD TRIGGERED|AURA_NOT_PRESENT',
    },
    {
      id: 'fire_nova',
      spellId: SPELL_FIRENOVA,
      // Reset m_uiFireNovaTimer = 6000 (cpp:74)
      initialMinMs: 6000,
      initialMaxMs: 6000,
      // CAST_OK re-arm 6000 (cpp:169)
      repeatMinMs: 6000,
      repeatMaxMs: 6000,
      target: 'self',
      cite: 'boss_pyroguard_emberseer.cpp:74,166-172',
    },
    {
      id: 'flame_buffet',
      spellId: SPELL_FLAMEBUFFET,
      // Reset m_uiFlameBuffetTimer = 3000 (cpp:75)
      initialMinMs: 3000,
      initialMaxMs: 3000,
      // CAST_OK re-arm 14000 (cpp:178)
      repeatMinMs: 14_000,
      repeatMaxMs: 14_000,
      target: 'self',
      cite: 'boss_pyroguard_emberseer.cpp:75,175-181',
    },
    {
      id: 'pyroblast',
      spellId: SPELL_PYROBLAST,
      // Reset m_uiPyroBlastTimer = 14000 (cpp:76)
      initialMinMs: 14_000,
      initialMaxMs: 14_000,
      // CAST_OK re-arm 15000 (cpp:189)
      repeatMinMs: 15_000,
      repeatMaxMs: 15_000,
      // SelectAttackingTarget(ATTACKING_TARGET_RANDOM, 0) (cpp:186)
      target: 'hostile_random',
      cite: 'boss_pyroguard_emberseer.cpp:76,184-193',
    },
  ],
  lifecycle: {
    // Encaged and untouchable until the Incarcerators are dead: the C++ drops both flags only at
    // MAX_GROWING_STACKS, and Reset is also what a wipe leaves behind.
    onReset: [
      { kind: 'set_unattackable', cite: 'boss_pyroguard_emberseer.cpp:127-129 UNIT_FLAG_UNINTERACTIBLE | IMMUNE_TO_PLAYER, dropped only at MAX_GROWING_STACKS' },
    ],
    onDeath: [
      {
        kind: 'set_instance_data',
        field: TYPE_EMBERSEER,
        value: INSTANCE_DATA.DONE,
        cite: 'boss_pyroguard_emberseer.cpp:88 SetData(TYPE_EMBERSEER, DONE)',
      },
    ],
    onEvade: [
      {
        kind: 'set_instance_data',
        field: TYPE_EMBERSEER,
        value: INSTANCE_DATA.FAIL,
        cite: 'boss_pyroguard_emberseer.cpp:94 JustReachedHome SetData(TYPE_EMBERSEER, FAIL)',
      },
    ],
  },
  // DoHandleEmberseerGrowing off the Incarcerators the raid kills: the C++ counts twenty CUSTOM_A
  // stacks whose SENDER is in neither the cpp nor the bake, so the deaths are the only driver.
  addDeaths: [
    {
      creatureEntries: [NPC_BLACKHAND_INCARCERATOR],
      atKilled: 'half',
      total: UBRS_INCARCERATOR_COUNT,
      actions: [{ kind: 'yell', textId: -1229001, cite: 'boss_pyroguard_emberseer.cpp:31,108-109 EMOTE_NEAR at MAX_GROWING_STACKS / 2' }],
      cite: 'boss_pyroguard_emberseer.cpp:104-110 the half-way emote',
    },
    {
      creatureEntries: [NPC_BLACKHAND_INCARCERATOR],
      atKilled: 'all',
      total: UBRS_INCARCERATOR_COUNT,
      actions: [
        { kind: 'yell', textId: -1229002, cite: 'boss_pyroguard_emberseer.cpp:32,112 EMOTE_FULL' },
        { kind: 'yell', textId: -1229003, cite: 'boss_pyroguard_emberseer.cpp:33,113 SAY_FREE' },
        { kind: 'cast_self', spellId: 16047, castFlags: CAST_FLAG.TRIGGERED, cite: 'boss_pyroguard_emberseer.cpp:117 SPELL_FULL_STRENGHT 16047 CAST_TRIGGERED' },
        { kind: 'cast_self', spellId: 16534, castFlags: CAST_FLAG.TRIGGERED, cite: 'boss_pyroguard_emberseer.cpp:118 SPELL_BONUS_DAMAGE 16534 CAST_TRIGGERED' },
        { kind: 'cast_self', spellId: 16052, castFlags: CAST_FLAG.TRIGGERED, cite: 'boss_pyroguard_emberseer.cpp:119 SPELL_TRANSFORM 16052 CAST_TRIGGERED' },
        { kind: 'set_instance_data', field: TYPE_EMBERSEER, value: INSTANCE_DATA.IN_PROGRESS, cite: 'boss_pyroguard_emberseer.cpp:125 SetData(TYPE_EMBERSEER, IN_PROGRESS)' },
        { kind: 'clear_unattackable', cite: 'boss_pyroguard_emberseer.cpp:128-129 RemoveFlag(UNINTERACTIBLE | IMMUNE_TO_PLAYER) - the beat that makes him killable' },
      ],
      cite: 'boss_pyroguard_emberseer.cpp:104-131 DoHandleEmberseerGrowing at MAX_GROWING_STACKS 20; :121-124 DoUseEmberseerRunes',
    },
  ],
  cites: [
    'boss_pyroguard_emberseer.cpp:28-210',
    'boss_pyroguard_emberseer.cpp:71-83 Reset',
    'boss_pyroguard_emberseer.cpp:104-131 DoHandleEmberseerGrowing via addDeaths over the seven Blackhand Incarcerators',
    'boss_pyroguard_emberseer.cpp:36 MAX_GROWING_STACKS 20 and its SPELL_GROWING 16049 ladder are SOURCE-ABSENT: no SendAIEvent exists in the blackrock_spire cpp and 10316 carries no THROW_AI_EVENT row in the bake, so the stack count has no driver',
    'src/data/dungeons/ubrs.ts:34 UBRS_INCARCERATOR_COUNT 7',
    'boss_pyroguard_emberseer.cpp:133-196 UpdateAI',
    'blackrock_spire.h:14 TYPE_EMBERSEER=1; :23 NPC_PYROGUARD_EMBERSEER=9816',
  ],
};

// npc_rookery_hatcher

// npc_rookery_hatcherAI, creature 10683. Strike urand(5–7)s then 4–6s, Sunder Armor 5s/5s. The
// egg disturb is movement-driven and stays a rookery route GAP. Cite: cpp:902–1025.
export const NPC_ROOKERY_HATCHER_SCRIPT: ScriptDevIR = {
  name: 'npc_rookery_hatcher',
  boundCreatures: [NPC_ROOKERY_HATCHER],
  sourceFile: 'eastern_kingdoms/blackrock_spire/instance_blackrock_spire.cpp',
  spellIds: [SPELL_STRIKE, SPELL_SUNDER_ARMOR, SPELL_DISTURB_EGGS],
  timers: [
    {
      id: 'strike',
      spellId: SPELL_STRIKE,
      // Reset urand(5000, 7000) (cpp:921)
      initialMinMs: 5000,
      initialMaxMs: 7000,
      // CAST_OK re-arm urand(4000, 6000) (cpp:995)
      repeatMinMs: 4000,
      repeatMaxMs: 6000,
      target: 'victim',
      cite: 'instance_blackrock_spire.cpp:921,992-998',
    },
    {
      id: 'sunder_armor',
      spellId: SPELL_SUNDER_ARMOR,
      // Reset 5000 (cpp:922)
      initialMinMs: 5000,
      initialMaxMs: 5000,
      // CAST_OK re-arm 5000 (cpp:1004)
      repeatMinMs: 5000,
      repeatMaxMs: 5000,
      target: 'victim',
      cite: 'instance_blackrock_spire.cpp:922,1001-1007',
    },
  ],
  cites: [
    'instance_blackrock_spire.cpp:897-1025 npc_rookery_hatcher',
    'instance_blackrock_spire.cpp:65 NPC_ROOKERY_HATCHER=10683',
  ],
};

// go_father_flame

// GOUse_go_father_flame, GO 175245: using it starts the TYPE_FLAMEWREATH wave timer. The player
// surface is the InstanceDef objectGate and the Solakar waves. Cite: cpp:887–893.
export const GO_FATHER_FLAME_SCRIPT: ScriptDevIR = {
  name: 'go_father_flame',
  boundCreatures: [],
  boundGos: [GO_FATHER_FLAME],
  sourceFile: 'eastern_kingdoms/blackrock_spire/instance_blackrock_spire.cpp',
  spellIds: [],
  timers: [],
  goUse: {
    goEntries: [GO_FATHER_FLAME],
    actions: [
      {
        kind: 'set_instance_data',
        field: TYPE_FLAMEWREATH,
        value: INSTANCE_DATA.IN_PROGRESS,
        cite: 'instance_blackrock_spire.cpp:890 StartflamewreathEventIfCan → flamewreath timer; product: IN_PROGRESS',
      },
    ],
    cite: 'instance_blackrock_spire.cpp:887-893 GOUse_go_father_flame',
  },
  cites: [
    'instance_blackrock_spire.cpp:774-787 StartflamewreathEventIfCan',
    'instance_blackrock_spire.cpp:887-893 go_father_flame',
    'blackrock_spire.h:40 GO_FATHER_FLAME=175245',
  ],
};

// event_spell_altar_emberseer

// ProcessEventId_event_spell_altar_emberseer: a player start runs DoProcessEmberseerEvent. The
// route unlock is the InstanceDef objectGate on the Blackrock Altar. Cite: cpp:874–885.
export const EVENT_SPELL_ALTAR_EMBERSEER: ScriptDevIR = {
  name: 'event_spell_altar_emberseer',
  boundCreatures: [],
  sourceFile: 'eastern_kingdoms/blackrock_spire/instance_blackrock_spire.cpp',
  spellIds: [SPELL_EMBERSEER_GROWING],
  timers: [],
  goUse: {
    // Event id surface — no GO binding; reuse goUse shell for SetData smoke like Uldaman.
    goEntries: [],
    actions: [
      {
        kind: 'set_instance_data',
        field: TYPE_EMBERSEER,
        value: INSTANCE_DATA.SPECIAL,
        cite: 'instance_blackrock_spire.cpp:507-542 DoProcessEmberseerEvent Growing start (product SPECIAL arm)',
      },
      {
        kind: 'flavor',
        text: 'The air crackles as Emberseer begins to grow!',
        cite: 'instance_blackrock_spire.cpp:525 DoScriptText EMOTE_BEGIN',
      },
    ],
    cite: 'instance_blackrock_spire.cpp:874-885 ProcessEventId_event_spell_altar_emberseer',
  },
  cites: [
    'instance_blackrock_spire.cpp:507-542 DoProcessEmberseerEvent',
    'instance_blackrock_spire.cpp:874-885 event_spell_altar_emberseer',
    'instance_blackrock_spire.cpp:60 SPELL_EMBERSEER_GROWING=16048',
  ],
};

// at_blackrock_spire

// AreaTrigger_at_blackrock_spire: 2046 seals the UBRS door and sorts the room event, 2026 starts
// the stadium, and 2066/2067 are the Beast intro and aggro. Cite: cpp:794–872.
export const AT_BLACKROCK_SPIRE: ScriptDevIR = {
  name: 'at_blackrock_spire',
  boundCreatures: [],
  sourceFile: 'eastern_kingdoms/blackrock_spire/instance_blackrock_spire.cpp',
  spellIds: [],
  timers: [],
  cites: [
    'instance_blackrock_spire.cpp:794-872 AreaTrigger_at_blackrock_spire',
    'instance_blackrock_spire.cpp:31-34 AREATRIGGER_ENTER_UBRS=2046 STADIUM=2026 BEAST_*=2066/2067',
  ],
};

// instance_blackrock_spire

// instance_blackrock_spire, m_auiEncounter[6]: ROOM_EVENT, EMBERSEER, FLAMEWREATH, STADIUM,
// DRAKKISATH and VALTHALAK, each opening its own door on DONE. Finkle on Beast despawn is a GAP.
export const INSTANCE_BLACKROCK_SPIRE: ScriptDevIR = {
  name: 'instance_blackrock_spire',
  boundCreatures: [],
  sourceFile: 'eastern_kingdoms/blackrock_spire/instance_blackrock_spire.cpp',
  spellIds: [SPELL_EMBERSEER_GROWING, SPELL_FINKLE_IS_EINHORN],
  timers: [],
  encounters: [
    {
      creatureEntry: NPC_PYROGUARD_EMBERSEER,
      field: TYPE_EMBERSEER,
      onDeath: INSTANCE_DATA.DONE,
      onEvade: INSTANCE_DATA.FAIL,
      cite: 'boss_pyroguard_emberseer.cpp:85-95; instance SetData TYPE_EMBERSEER; h:14',
    },
    {
      creatureEntry: NPC_SOLAKAR_FLAMEWREATH,
      field: TYPE_FLAMEWREATH,
      onDeath: INSTANCE_DATA.DONE,
      onEvade: INSTANCE_DATA.FAIL,
      cite: 'instance_blackrock_spire.cpp:388-389 OnCreatureDeath SOLAKAR → TYPE_FLAMEWREATH DONE; 458-461 evade FAIL',
    },
    {
      creatureEntry: NPC_DRAKKISATH,
      field: TYPE_DRAKKISATH,
      onDeath: INSTANCE_DATA.DONE,
      cite: 'instance_blackrock_spire.cpp:391-394 OnCreatureDeath DRAKKISATH → DONE + doors',
    },
    {
      creatureEntry: NPC_GYTH,
      field: TYPE_STADIUM,
      // Full DONE requires Gyth and Rend both dead (cpp:440-444). The product marks IN_PROGRESS on
      // the Gyth aggro path and DONE on death, since a solo session may kill Gyth alone.
      onDeath: INSTANCE_DATA.DONE,
      onAggro: INSTANCE_DATA.IN_PROGRESS,
      cite: 'instance_blackrock_spire.cpp:440-444 GYTH/REND stadium clear → SAY_NEFARIUS_VICTORY → TYPE_STADIUM DONE',
    },
  ],
  doors: [
    {
      field: TYPE_ROOM_EVENT,
      goEntry: GO_EMBERSEER_IN,
      openOn: [INSTANCE_DATA.DONE],
      cite: 'instance_blackrock_spire.cpp:206-207 TYPE_ROOM_EVENT DONE → GO_EMBERSEER_IN',
    },
    {
      field: TYPE_EMBERSEER,
      goEntry: GO_EMBERSEER_OUT,
      openOn: [INSTANCE_DATA.DONE],
      cite: 'instance_blackrock_spire.cpp:232-235 TYPE_EMBERSEER DONE → GO_EMBERSEER_OUT',
    },
    {
      field: TYPE_EMBERSEER,
      goEntry: GO_DOORS,
      openOn: [INSTANCE_DATA.IN_PROGRESS, INSTANCE_DATA.DONE, INSTANCE_DATA.FAIL],
      cite: 'instance_blackrock_spire.cpp:215 DoUseDoorOrButton(GO_DOORS) on any TYPE_EMBERSEER change',
    },
    {
      field: TYPE_STADIUM,
      goEntry: GO_GYTH_EXIT_DOOR,
      openOn: [INSTANCE_DATA.DONE],
      cite: 'instance_blackrock_spire.cpp:265 TYPE_STADIUM DONE → GO_GYTH_EXIT_DOOR',
    },
    {
      field: TYPE_STADIUM,
      goEntry: GO_GYTH_ENTRY_DOOR,
      openOn: [INSTANCE_DATA.IN_PROGRESS, INSTANCE_DATA.DONE, INSTANCE_DATA.FAIL],
      cite: 'instance_blackrock_spire.cpp:252 DoUseDoorOrButton(GO_GYTH_ENTRY_DOOR) on stadium data change',
    },
    {
      field: TYPE_DRAKKISATH,
      goEntry: GO_DRAKKISATH_DOOR_1,
      openOn: [INSTANCE_DATA.DONE],
      cite: 'instance_blackrock_spire.cpp:393 DoUseDoorOrButton GO_DRAKKISATH_DOOR_1',
    },
    {
      field: TYPE_DRAKKISATH,
      goEntry: GO_DRAKKISATH_DOOR_2,
      openOn: [INSTANCE_DATA.DONE],
      cite: 'instance_blackrock_spire.cpp:394 DoUseDoorOrButton GO_DRAKKISATH_DOOR_2',
    },
  ],
  cites: [
    'instance_blackrock_spire.cpp:101-306 SetData/Initialize',
    'instance_blackrock_spire.cpp:360-447 OnCreatureDeath',
    'blackrock_spire.h:10-18 MAX_ENCOUNTER / TYPE_*',
  ],
};
