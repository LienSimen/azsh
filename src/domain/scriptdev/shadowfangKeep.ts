// Shadowfang Keep ScriptDevAI IR (instance + zone scripts). Sources: shadowfang_keep.h,
// instance_shadowfang_keep.cpp, shadowfang_keep.cpp.

import type { ScriptDevIR } from './types.ts';
import { INSTANCE_DATA } from './types.ts';

// shadowfang_keep.h:10-17
const TYPE_FREE_NPC = 1;
const TYPE_FENRUS = 3;
const TYPE_NANDOS = 4;
const TYPE_INTRO = 5;
const TYPE_VOIDWALKER = 6;

const NPC_ASH = 3850;
const NPC_ADA = 3849;
const NPC_ARCHMAGE_ARUGAL = 4275;
const NPC_VINCENT = 4444;
const NPC_VOIDWALKER = 4627;
const NPC_MASTER_NANDOS = 3927;

const GO_COURTYARD_DOOR = 18895;
const GO_SORCERER_DOOR = 18972;
const GO_ARUGAL_DOOR = 18971;

const SPELL_UNLOCK = 6421;
const SPELL_DARK_OFFERING = 7154;
const SPELL_VOID_BOLT = 7588;
const SPELL_SHADOW_PORT_UPPER_LEDGE = 7587;
const SPELL_SHADOW_PORT_SPAWN_LEDGE = 7586;
const SPELL_SHADOW_PORT_STAIRS = 7136;
const SPELL_ARUGALS_CURSE = 7621;
const SPELL_THUNDERSHOCK = 7803;

export const INSTANCE_SHADOWFANG_KEEP: ScriptDevIR = {
  name: 'instance_shadowfang_keep',
  boundCreatures: [],
  sourceFile: 'eastern_kingdoms/shadowfang_keep/instance_shadowfang_keep.cpp',
  spellIds: [],
  timers: [],
  encounters: [
    { creatureEntry: NPC_ADA, field: TYPE_FREE_NPC, cite: 'shadowfang_keep.h:12 TYPE_FREE_NPC; courtyard gossip opens GO_COURTYARD_DOOR' },
    { creatureEntry: 4274, field: TYPE_FENRUS, onDeath: INSTANCE_DATA.DONE, cite: 'shadowfang_keep.h:14 TYPE_FENRUS; instance.cpp:141-143 GO_SORCERER_DOOR' },
    { creatureEntry: NPC_MASTER_NANDOS, field: TYPE_NANDOS, onDeath: INSTANCE_DATA.DONE, cite: 'shadowfang_keep.h:15 TYPE_NANDOS; instance.cpp:145-147 GO_ARUGAL_DOOR' },
    { creatureEntry: NPC_VINCENT, field: TYPE_INTRO, cite: 'shadowfang_keep.h:16 TYPE_INTRO; instance.cpp:74-79 Vincent dead after intro DONE' },
    { creatureEntry: NPC_VOIDWALKER, field: TYPE_VOIDWALKER, onDeath: INSTANCE_DATA.DONE, cite: 'shadowfang_keep.h:17 TYPE_VOIDWALKER; shadowfang_keep.cpp:332-335 JustDied' },
  ],
  doors: [
    { field: TYPE_FREE_NPC, goEntry: GO_COURTYARD_DOOR, openOn: [INSTANCE_DATA.DONE], cite: 'instance_shadowfang_keep.cpp:135-137 GO_COURTYARD_DOOR' },
    { field: TYPE_FENRUS, goEntry: GO_SORCERER_DOOR, openOn: [INSTANCE_DATA.DONE], cite: 'instance_shadowfang_keep.cpp:141-143 GO_SORCERER_DOOR' },
    { field: TYPE_NANDOS, goEntry: GO_ARUGAL_DOOR, openOn: [INSTANCE_DATA.DONE], cite: 'instance_shadowfang_keep.cpp:145-147 GO_ARUGAL_DOOR' },
  ],
  cites: [
    'instance_shadowfang_keep.cpp:54-353 whole file',
    'shadowfang_keep.h:10-17 MAX_ENCOUNTER 6',
  ],
};

export const NPC_SHADOWFANG_PRISONER: ScriptDevIR = {
  name: 'npc_shadowfang_prisoner',
  boundCreatures: [NPC_ASH, NPC_ADA],
  sourceFile: 'eastern_kingdoms/shadowfang_keep/shadowfang_keep.cpp',
  spellIds: [SPELL_UNLOCK],
  timers: [],
  gossipHello: {
    defaultTextId: 798,
    cite: 'shadowfang_keep.cpp:160-189 GossipHello; GOSSIP_ASH 798 / GOSSIP_ADA 799 then Start escort',
  },
  cites: [
    'shadowfang_keep.cpp:44-189 npc_shadowfang_prisonerAI escort + gossip door unlock',
    'shadowfang_keep.cpp:137 DoCastSpellIfCan SPELL_UNLOCK 6421 - escort speech, not a combat timer',
  ],
};

export const MOB_ARUGAL_VOIDWALKER: ScriptDevIR = {
  name: 'mob_arugal_voidwalker',
  boundCreatures: [NPC_VOIDWALKER],
  sourceFile: 'eastern_kingdoms/shadowfang_keep/shadowfang_keep.cpp',
  spellIds: [SPELL_DARK_OFFERING],
  timers: [
    {
      id: 'dark_offering',
      spellId: SPELL_DARK_OFFERING,
      initialMinMs: 4400,
      initialMaxMs: 12_500,
      repeatMinMs: 4000,
      repeatMaxMs: 12_000,
      target: 'self',
      friendlyLowestHpYd: 10,
      // The 290 is the C++'s own minHPDiff: it will not spend Dark Offering on a scratch.
      friendlyHpDeficit: 290,
      cite: 'shadowfang_keep.cpp:216 AddCombatAction DARKOFFERING 4400-12500; :324-327 DoSelectLowestHpFriendly(10.0f, 290) then re-arm urand(4,12)s',
    },
  ],
  lifecycle: {
    onDeath: [
      { kind: 'set_instance_data', field: TYPE_VOIDWALKER, value: INSTANCE_DATA.DONE, cite: 'shadowfang_keep.cpp:332-335 JustDied SetData(TYPE_VOIDWALKER, DONE)' },
    ],
  },
  cites: [
    'shadowfang_keep.cpp:191-337 mob_arugal_voidwalkerAI',
    'shadowfang_keep.cpp:247-297 group follow - movement GAP',
  ],
};

export const BOSS_ARUGAL: ScriptDevIR = {
  name: 'boss_arugal',
  boundCreatures: [NPC_ARCHMAGE_ARUGAL],
  sourceFile: 'eastern_kingdoms/shadowfang_keep/shadowfang_keep.cpp',
  spellIds: [
    SPELL_VOID_BOLT,
    SPELL_THUNDERSHOCK,
    SPELL_ARUGALS_CURSE,
    SPELL_SHADOW_PORT_SPAWN_LEDGE,
    SPELL_SHADOW_PORT_UPPER_LEDGE,
    SPELL_SHADOW_PORT_STAIRS,
  ],
  timers: [
    {
      id: 'void_bolt',
      spellId: SPELL_VOID_BOLT,
      initialMinMs: 1000,
      initialMaxMs: 1000,
      repeatMinMs: 2900,
      repeatMaxMs: 4800,
      target: 'victim',
      cite: 'shadowfang_keep.cpp:394 AddCombatAction VOID_BOLT 1000; :471-472 CAST_OK urand(2900,4800)',
    },
    {
      id: 'thundershock',
      spellId: SPELL_THUNDERSHOCK,
      initialMinMs: 1000,
      initialMaxMs: 1000,
      repeatMinMs: 30_000,
      repeatMaxMs: 38_000,
      target: 'self',
      requireMeleeTargetExists: true,
      cite: 'shadowfang_keep.cpp:395 AddCombatAction THUNDERSHOCK 1000; :477-481 SelectAttackingTarget(TOPAGGRO, 0, 0, SELECT_FLAG_IN_MELEE_RANGE) then DoCastSpellIfCan(nullptr, SPELL_THUNDERSHOCK 7803), CAST_OK urand(30,38)s',
    },
    {
      id: 'arugals_curse',
      spellId: SPELL_ARUGALS_CURSE,
      initialMinMs: 20_000,
      initialMaxMs: 30_000,
      repeatMinMs: 20_000,
      repeatMaxMs: 35_000,
      target: 'hostile_random_not_top',
      cite: 'shadowfang_keep.cpp:393 AddCombatAction CURSE 20-30s; :486-490 RANDOM skip-tank CAST_OK urand(20,35)s',
    },
    {
      id: 'shadow_port',
      spellId: SPELL_SHADOW_PORT_SPAWN_LEDGE,
      initialMinMs: 22_000,
      initialMaxMs: 26_000,
      repeatMinMs: 48_000,
      repeatMaxMs: 55_000,
      target: 'self',
      cite: 'shadowfang_keep.cpp:392 AddCombatAction TELEPORT 22-26s; :546 CAST_OK urand(48,55)s — one of three ports; spawn-ledge is the default, not a roll',
    },
  ],
  lifecycle: {
    onAggro: [
      { kind: 'yell', textId: -1033017, cite: 'shadowfang_keep.cpp:422 DoScriptText(YELL_AGGRO)' },
      { kind: 'cast_self', spellId: SPELL_VOID_BOLT, cite: 'shadowfang_keep.cpp:423 DoCastSpellIfCan(who, SPELL_VOID_BOLT) — first bolt on pull target' },
    ],
  },
  cites: [
    'shadowfang_keep.cpp:339-546 boss_arugalAI whole',
    'shadowfang_keep.cpp:496-546 teleport picks urand(0,2) among three rooms - GAP (position state)',
  ],
};

export const NPC_DEATHSTALKER_VINCENT: ScriptDevIR = {
  name: 'npc_deathstalker_vincent',
  boundCreatures: [NPC_VINCENT],
  sourceFile: 'eastern_kingdoms/shadowfang_keep/shadowfang_keep.cpp',
  spellIds: [],
  timers: [],
  cites: [
    'shadowfang_keep.cpp:548-661 npc_deathstalker_vincent — intro corpse; instance.cpp:74-79 stands dead after TYPE_INTRO DONE',
  ],
};
