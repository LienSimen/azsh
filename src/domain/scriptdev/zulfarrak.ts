// Zul'Farrak ScriptDev IR ports. Source: boss_zumrah.cpp, instance_zulfarrak.cpp, zulfarrak.cpp
// and the header. The ScriptDev timer owns Zum'rah's raise-dead schedule; the grave pool is a GAP.

import type { ScriptDevIR } from './types.ts';
import { INSTANCE_DATA } from './types.ts';
import { CAST_FLAG } from '../creature/creatureAi.ts';

// Constants — zulfarrak.h + boss_zumrah.cpp + zulfarrak.cpp

// zulfarrak.h:10–20
export const ZF_MAX_ENCOUNTER = 9;
export const TYPE_VELRATHA = 0;
export const TYPE_GAHZRILLA = 1;
export const TYPE_ANTUSUL = 2;
export const TYPE_THEKA = 3;
export const TYPE_ZUMRAH = 4;
export const TYPE_NEKRUM = 5;
export const TYPE_SEZZZIZ = 6;
export const TYPE_CHIEF_SANDSCALP = 7;
export const TYPE_PYRAMID_EVENT = 8;

// zulfarrak.h:22–44 NPC / GO / AT
export const NPC_VELRATHA = 7795;
export const NPC_GAHZRILLA = 7273;
export const NPC_ANTUSUL = 8127;
export const NPC_THEKA = 7272;
export const NPC_ZUMRAH = 7271;
export const NPC_NEKRUM = 7796;
export const NPC_SEZZZIZ = 7275;
export const NPC_CHIEF_SANDSCALP = 7267;
export const NPC_SERGEANT_BLY = 7604;
export const NPC_SANDFURY_SLAVE = 7787;
export const NPC_SANDFURY_DRUDGE = 7788;
export const NPC_SANDFURY_CRETIN = 7789;
export const NPC_SANDFURY_ACOLYTE = 8876;
export const NPC_SANDFURY_ZEALOT = 8877;
export const NPC_ZULFARRAK_ZOMBIE = 7286;
export const NPC_ZULFARRAK_DEAD_HERO = 7276;
export const NPC_WARD_OF_ZUMRAH = 7785;

export const GO_SHALLOW_GRAVE = 128403;
export const GO_END_DOOR = 146084;
/** Gong of Zul'Farrak. Cite: zulfarrak.h:41 comment EVENT_ID_GONG go 141832 */
export const GO_ZULFARRAK_GONG = 141832;

export const AREATRIGGER_ANTUSUL = 1447;

// boss_zumrah.cpp:31–40 texts + spells
export const SAY_INTRO = -1209000;
export const SAY_AGGRO = -1209001;
export const SAY_KILL = -1209002;
export const SAY_SUMMON = -1209003;

export const SPELL_SHADOW_BOLT = 12739;
export const SPELL_SHADOW_BOLT_VOLLEY = 15245;
export const SPELL_WARD_OF_ZUMRAH = 11086;
export const SPELL_HEALING_WAVE = 12491;
export const SPELL_SUMMON_ZOMBIES = 10247;

/** Shadow Bolt init. Cite: boss_zumrah.cpp:71 m_uiShadowBoltTimer = 1000 */
export const SHADOW_BOLT_INIT_MS = 1000;
/** Shadow Bolt re-arm. Cite: boss_zumrah.cpp:168 urand(3500, 5000) */
export const SHADOW_BOLT_REPEAT_MIN_MS = 3500;
export const SHADOW_BOLT_REPEAT_MAX_MS = 5000;

/** Shadow Bolt Volley init. Cite: boss_zumrah.cpp:72 urand(6000, 30000) */
export const VOLLEY_INIT_MIN_MS = 6000;
export const VOLLEY_INIT_MAX_MS = 30_000;
/** Shadow Bolt Volley re-arm. Cite: boss_zumrah.cpp:177 urand(10000, 18000) */
export const VOLLEY_REPEAT_MIN_MS = 10_000;
export const VOLLEY_REPEAT_MAX_MS = 18_000;

/** Ward of Zum'rah init. Cite: boss_zumrah.cpp:73 urand(7000, 20000) */
export const WARD_INIT_MIN_MS = 7000;
export const WARD_INIT_MAX_MS = 20_000;
/** Ward of Zum'rah re-arm. Cite: boss_zumrah.cpp:185 urand(15000, 32000) */
export const WARD_REPEAT_MIN_MS = 15_000;
export const WARD_REPEAT_MAX_MS = 32_000;

/** Healing Wave init. Cite: boss_zumrah.cpp:74 urand(10000, 15000) */
export const HEAL_INIT_MIN_MS = 10_000;
export const HEAL_INIT_MAX_MS = 15_000;
/** Healing Wave re-arm. Cite: boss_zumrah.cpp:196 urand(15000, 23000) */
export const HEAL_REPEAT_MIN_MS = 15_000;
export const HEAL_REPEAT_MAX_MS = 23_000;

/** Spawn zombie init. Cite: boss_zumrah.cpp:75 m_uiSpawnZombieTimer = 1000 */
export const SPAWN_ZOMBIE_INIT_MS = 1000;
// Spawn zombie re-arm after successful grave consume. Cite: boss_zumrah.cpp:154 m_uiSpawnZombieTimer =
// 20000
export const SPAWN_ZOMBIE_REPEAT_MS = 20_000;

// Pyramid event first wave arm on IN_PROGRESS. Cite: instance_zulfarrak.cpp:94 m_uiPyramidEventTimer =
// 20000
export const PYRAMID_EVENT_START_MS = 20_000;

/** LOS hostile turn distance. Cite: boss_zumrah.cpp:92 IsWithinDistInMap 9.0f */
export const ZUMRAH_INTRO_DIST_YD = 9;

// boss_zumrah

// boss_zumrah, creature 7271. Shadow Bolt 1s/3.5–5s, Volley 6–30s/10–18s, Ward 7–20s/15–32s,
// Healing Wave 10–15s/15–23s, and Summon Zombies every 20 s until no grave is usable.
export const BOSS_ZUMRAH: ScriptDevIR = {
  name: 'boss_zumrah',
  boundCreatures: [NPC_ZUMRAH],
  sourceFile: 'kalimdor/zulfarrak/boss_zumrah.cpp',
  spellIds: [
    SPELL_SHADOW_BOLT,
    SPELL_SHADOW_BOLT_VOLLEY,
    SPELL_WARD_OF_ZUMRAH,
    SPELL_HEALING_WAVE,
    SPELL_SUMMON_ZOMBIES,
  ],
  timers: [
    {
      id: 'spawn_zombies',
      spellId: SPELL_SUMMON_ZOMBIES,
      // Reset m_uiSpawnZombieTimer = 1000 (cpp:75)
      initialMinMs: SPAWN_ZOMBIE_INIT_MS,
      initialMaxMs: SPAWN_ZOMBIE_INIT_MS,
      // CAST_OK re-arm 20000 after grave consume (cpp:154)
      repeatMinMs: SPAWN_ZOMBIE_REPEAT_MS,
      repeatMaxMs: SPAWN_ZOMBIE_REPEAT_MS,
      target: 'self',
      // TRIGGERED_OLD_TRIGGERED at grave position (cpp:148)
      castFlags: CAST_FLAG.TRIGGERED | CAST_FLAG.FORCE_TARGET_SELF,
      cite: 'boss_zumrah.cpp:75,141-157 m_uiSpawnZombieTimer; CastSpell SPELL_SUMMON_ZOMBIES TRIGGERED',
    },
    {
      id: 'shadow_bolt',
      spellId: SPELL_SHADOW_BOLT,
      // Reset m_uiShadowBoltTimer = 1000 (cpp:71)
      initialMinMs: SHADOW_BOLT_INIT_MS,
      initialMaxMs: SHADOW_BOLT_INIT_MS,
      // CAST_OK re-arm urand(3500, 5000) (cpp:168)
      repeatMinMs: SHADOW_BOLT_REPEAT_MIN_MS,
      repeatMaxMs: SHADOW_BOLT_REPEAT_MAX_MS,
      // SelectAttackingTarget(ATTACKING_TARGET_RANDOM, 0) (cpp:165)
      target: 'hostile_random',
      cite: 'boss_zumrah.cpp:71,163-172 Shadow Bolt random',
    },
    {
      id: 'shadow_bolt_volley',
      spellId: SPELL_SHADOW_BOLT_VOLLEY,
      // Reset urand(6000, 30000) (cpp:72)
      initialMinMs: VOLLEY_INIT_MIN_MS,
      initialMaxMs: VOLLEY_INIT_MAX_MS,
      // CAST_OK re-arm urand(10000, 18000) (cpp:177)
      repeatMinMs: VOLLEY_REPEAT_MIN_MS,
      repeatMaxMs: VOLLEY_REPEAT_MAX_MS,
      // DoCastSpellIfCan(m_creature, SPELL_SHADOW_BOLT_VOLLEY) (cpp:176)
      target: 'self',
      cite: 'boss_zumrah.cpp:72,174-180 Shadow Bolt Volley self',
    },
    {
      id: 'ward_of_zumrah',
      spellId: SPELL_WARD_OF_ZUMRAH,
      // Reset urand(7000, 20000) (cpp:73)
      initialMinMs: WARD_INIT_MIN_MS,
      initialMaxMs: WARD_INIT_MAX_MS,
      // CAST_OK re-arm urand(15000, 32000) (cpp:185)
      repeatMinMs: WARD_REPEAT_MIN_MS,
      repeatMaxMs: WARD_REPEAT_MAX_MS,
      // DoCastSpellIfCan(m_creature, SPELL_WARD_OF_ZUMRAH) (cpp:184)
      target: 'self',
      cite: 'boss_zumrah.cpp:73,182-188 Ward of Zum\'rah self → totem 7785',
    },
    {
      id: 'healing_wave',
      spellId: SPELL_HEALING_WAVE,
      // Reset urand(10000, 15000) (cpp:74)
      initialMinMs: HEAL_INIT_MIN_MS,
      initialMaxMs: HEAL_INIT_MAX_MS,
      // CAST_OK re-arm urand(15000, 23000) (cpp:196)
      repeatMinMs: HEAL_REPEAT_MIN_MS,
      repeatMaxMs: HEAL_REPEAT_MAX_MS,
      target: 'self',
      friendlyLowestHpYd: 40,
      friendlyHpDeficit: 1,
      cite: 'boss_zumrah.cpp:74,188-199 Healing Wave on DoSelectLowestHpFriendly(40.0f)',
    },
  ],
  lifecycle: {
    onAggro: [
      {
        kind: 'yell',
        textId: SAY_AGGRO,
        cite: 'boss_zumrah.cpp:82 DoScriptText SAY_AGGRO',
      },
      {
        kind: 'set_instance_data',
        field: TYPE_ZUMRAH,
        value: INSTANCE_DATA.IN_PROGRESS,
        cite: 'instance_zulfarrak.cpp:158 OnCreatureEnterCombat NPC_ZUMRAH → TYPE_ZUMRAH IN_PROGRESS',
      },
    ],
    onDeath: [
      {
        kind: 'set_instance_data',
        field: TYPE_ZUMRAH,
        value: INSTANCE_DATA.DONE,
        cite: 'instance_zulfarrak.cpp:188 OnCreatureDeath NPC_ZUMRAH → TYPE_ZUMRAH DONE',
      },
    ],
    onEvade: [
      {
        kind: 'set_instance_data',
        field: TYPE_ZUMRAH,
        value: INSTANCE_DATA.FAIL,
        cite: 'instance_zulfarrak.cpp:172 OnCreatureEvade NPC_ZUMRAH → TYPE_ZUMRAH FAIL',
      },
    ],
  },
  cites: [
    'boss_zumrah.cpp:28-216',
    'boss_zumrah.cpp:69-78 Reset timers',
    'boss_zumrah.cpp:136-202 UpdateAI casts',
    'boss_zumrah.cpp:40 SPELL_SUMMON_ZOMBIES=10247',
    'zulfarrak.h:26 NPC_ZUMRAH=7271',
  ],
};

// event_go_zulfarrak_gong

// ProcessEventId_event_go_zulfarrak_gong: from NOT_STARTED or FAIL it sets TYPE_GAHZRILLA
// IN_PROGRESS so the DB script summons him; otherwise it blocks a re-summon. Cite: cpp:39–55.
export const EVENT_GO_ZULFARRAK_GONG: ScriptDevIR = {
  name: 'event_go_zulfarrak_gong',
  boundCreatures: [],
  boundGos: [GO_ZULFARRAK_GONG],
  sourceFile: 'kalimdor/zulfarrak/zulfarrak.cpp',
  spellIds: [],
  timers: [],
  goUse: {
    goEntries: [GO_ZULFARRAK_GONG],
    branches: [
      {
        gate: {
          field: TYPE_GAHZRILLA,
          equals: INSTANCE_DATA.NOT_STARTED,
          cite: 'zulfarrak.cpp:45 GetData(TYPE_GAHZRILLA) == NOT_STARTED',
        },
        actions: [
          {
            kind: 'set_instance_data',
            field: TYPE_GAHZRILLA,
            value: INSTANCE_DATA.IN_PROGRESS,
            cite: 'zulfarrak.cpp:47 SetData(TYPE_GAHZRILLA, IN_PROGRESS)',
          },
          {
            kind: 'summon_count',
            creatureEntry: NPC_GAHZRILLA,
            count: 1,
            cite: 'zulfarrak.cpp:48 return false → DB script summon Gahz\'rilla 7273',
          },
        ],
        cite: 'zulfarrak.cpp:45-48 NOT_STARTED → IN_PROGRESS + summon',
      },
      {
        gate: {
          field: TYPE_GAHZRILLA,
          equals: INSTANCE_DATA.FAIL,
          cite: 'zulfarrak.cpp:45 GetData(TYPE_GAHZRILLA) == FAIL',
        },
        actions: [
          {
            kind: 'set_instance_data',
            field: TYPE_GAHZRILLA,
            value: INSTANCE_DATA.IN_PROGRESS,
            cite: 'zulfarrak.cpp:47 SetData(TYPE_GAHZRILLA, IN_PROGRESS) after FAIL',
          },
          {
            kind: 'summon_count',
            creatureEntry: NPC_GAHZRILLA,
            count: 1,
            cite: 'zulfarrak.cpp:48 return false → DB script re-summon after FAIL',
          },
        ],
        cite: 'zulfarrak.cpp:45-48 FAIL → IN_PROGRESS + summon',
      },
    ],
    cite: 'zulfarrak.cpp:39-55 ProcessEventId_event_go_zulfarrak_gong',
  },
  cites: [
    'zulfarrak.cpp:39-55',
    'zulfarrak.h:13 TYPE_GAHZRILLA=1; :23 NPC_GAHZRILLA=7273',
    'zulfarrak.h:41 EVENT_ID_GONG_ZULFARRAK go 141832',
  ],
};

// event_spell_unlocking

// ProcessEventId_event_spell_unlocking: from NOT_STARTED it sets TYPE_PYRAMID_EVENT IN_PROGRESS,
// arming the 20 s trickle so the DB script summons the pyramid trolls. Cite: zulfarrak.cpp:61–76.
export const EVENT_SPELL_UNLOCKING: ScriptDevIR = {
  name: 'event_spell_unlocking',
  boundCreatures: [],
  sourceFile: 'kalimdor/zulfarrak/zulfarrak.cpp',
  spellIds: [],
  timers: [],
  goUse: {
    goEntries: [],
    gates: [
      {
        field: TYPE_PYRAMID_EVENT,
        equals: INSTANCE_DATA.NOT_STARTED,
        cite: 'zulfarrak.cpp:67 GetData(TYPE_PYRAMID_EVENT) == NOT_STARTED',
      },
    ],
    actions: [
      {
        kind: 'set_instance_data',
        field: TYPE_PYRAMID_EVENT,
        value: INSTANCE_DATA.IN_PROGRESS,
        cite: 'zulfarrak.cpp:69 SetData(TYPE_PYRAMID_EVENT, IN_PROGRESS)',
      },
      {
        kind: 'flavor',
        text: 'unlocks the pyramid stairway - Sandfury trolls pour forth!',
        cite: 'zulfarrak.cpp:70 return false → DB script summon pyramid trolls; instance timer 20s',
      },
    ],
    cite: 'zulfarrak.cpp:61-76 ProcessEventId_event_spell_unlocking; event 2609 / spell 10738',
  },
  cites: [
    'zulfarrak.cpp:61-76',
    'zulfarrak.h:20 TYPE_PYRAMID_EVENT=8',
    'zulfarrak.h:42 EVENT_ID_UNLOCKING=2609 spell 10738',
    'instance_zulfarrak.cpp:93-94 IN_PROGRESS → m_uiPyramidEventTimer=20000',
  ],
};

// at_zulfarrak

// AreaTrigger_at_zulfarrak, trigger 1447: with TYPE_ANTUSUL not DONE and Antu'sul alive it starts
// the attack; GM and dead players are skipped. Cite: zulfarrak.cpp:82–105.
export const AT_ZULFARRAK: ScriptDevIR = {
  name: 'at_zulfarrak',
  boundCreatures: [],
  sourceFile: 'kalimdor/zulfarrak/zulfarrak.cpp',
  spellIds: [],
  timers: [],
  goUse: {
    goEntries: [],
    branches: [
      {
        gate: {
          field: TYPE_ANTUSUL,
          equals: INSTANCE_DATA.NOT_STARTED,
          cite: 'zulfarrak.cpp:94 GetData(TYPE_ANTUSUL) == NOT_STARTED',
        },
        actions: [
          {
            kind: 'flavor',
            text: "Antu'sul attacks!",
            cite: 'zulfarrak.cpp:98-99 NPC_ANTUSUL AI AttackStart(player)',
          },
        ],
        cite: 'zulfarrak.cpp:94-100 AREATRIGGER_ANTUSUL 1447 NOT_STARTED → AttackStart',
      },
      {
        gate: {
          field: TYPE_ANTUSUL,
          equals: INSTANCE_DATA.FAIL,
          cite: 'zulfarrak.cpp:94 GetData(TYPE_ANTUSUL) == FAIL',
        },
        actions: [
          {
            kind: 'flavor',
            text: "Antu'sul attacks!",
            cite: 'zulfarrak.cpp:98-99 NPC_ANTUSUL AI AttackStart after FAIL',
          },
        ],
        cite: 'zulfarrak.cpp:94-100 AREATRIGGER_ANTUSUL FAIL → AttackStart',
      },
    ],
    cite: 'zulfarrak.cpp:82-105 AreaTrigger_at_zulfarrak; areatrigger 1447',
  },
  cites: [
    'zulfarrak.cpp:82-105',
    'zulfarrak.h:44 AREATRIGGER_ANTUSUL=1447',
    'zulfarrak.h:24 NPC_ANTUSUL=8127; :14 TYPE_ANTUSUL=2',
  ],
};

// instance_zulfarrak

// instance_zulfarrak, m_auiEncounter[9]. TYPE_PYRAMID_EVENT goes DONE once Nekrum and Sezz'ziz
// both are, opening GO_END_DOOR 146084. Bound via instance_template map 209 only.
export const INSTANCE_ZULFARRAK: ScriptDevIR = {
  name: 'instance_zulfarrak',
  boundCreatures: [],
  sourceFile: 'kalimdor/zulfarrak/instance_zulfarrak.cpp',
  spellIds: [],
  timers: [],
  encounters: [
    {
      creatureEntry: NPC_VELRATHA,
      field: TYPE_VELRATHA,
      onAggro: INSTANCE_DATA.IN_PROGRESS,
      onDeath: INSTANCE_DATA.DONE,
      onEvade: INSTANCE_DATA.FAIL,
      cite: 'instance_zulfarrak.cpp:154/169/184 OnCreature* NPC_VELRATHA; h:12 TYPE_VELRATHA=0',
    },
    {
      creatureEntry: NPC_GAHZRILLA,
      field: TYPE_GAHZRILLA,
      onAggro: INSTANCE_DATA.IN_PROGRESS,
      onDeath: INSTANCE_DATA.DONE,
      onEvade: INSTANCE_DATA.FAIL,
      cite: 'instance_zulfarrak.cpp:155/170/185 OnCreature* NPC_GAHZRILLA; h:13 TYPE_GAHZRILLA=1',
    },
    {
      creatureEntry: NPC_ANTUSUL,
      field: TYPE_ANTUSUL,
      onAggro: INSTANCE_DATA.IN_PROGRESS,
      onDeath: INSTANCE_DATA.DONE,
      onEvade: INSTANCE_DATA.FAIL,
      cite: 'instance_zulfarrak.cpp:156/171/186 OnCreature* NPC_ANTUSUL; h:14 TYPE_ANTUSUL=2',
    },
    {
      creatureEntry: NPC_THEKA,
      field: TYPE_THEKA,
      onAggro: INSTANCE_DATA.IN_PROGRESS,
      onDeath: INSTANCE_DATA.DONE,
      onEvade: INSTANCE_DATA.FAIL,
      cite: 'instance_zulfarrak.cpp:157/172/187 OnCreature* NPC_THEKA; h:15 TYPE_THEKA=3',
    },
    {
      creatureEntry: NPC_ZUMRAH,
      field: TYPE_ZUMRAH,
      onAggro: INSTANCE_DATA.IN_PROGRESS,
      onDeath: INSTANCE_DATA.DONE,
      onEvade: INSTANCE_DATA.FAIL,
      cite: 'instance_zulfarrak.cpp:158/173/188 OnCreature* NPC_ZUMRAH; h:16 TYPE_ZUMRAH=4',
    },
    {
      creatureEntry: NPC_NEKRUM,
      field: TYPE_NEKRUM,
      onAggro: INSTANCE_DATA.IN_PROGRESS,
      onDeath: INSTANCE_DATA.DONE,
      onEvade: INSTANCE_DATA.FAIL,
      cite: 'instance_zulfarrak.cpp:159/174/189 OnCreature* NPC_NEKRUM; h:17 TYPE_NEKRUM=5; cascade:81-84',
    },
    {
      creatureEntry: NPC_SEZZZIZ,
      field: TYPE_SEZZZIZ,
      onAggro: INSTANCE_DATA.IN_PROGRESS,
      onDeath: INSTANCE_DATA.DONE,
      onEvade: INSTANCE_DATA.FAIL,
      cite: 'instance_zulfarrak.cpp:160/175/190 OnCreature* NPC_SEZZZIZ; h:18 TYPE_SEZZZIZ=6; cascade:87-90',
    },
    {
      creatureEntry: NPC_CHIEF_SANDSCALP,
      field: TYPE_CHIEF_SANDSCALP,
      onAggro: INSTANCE_DATA.IN_PROGRESS,
      onDeath: INSTANCE_DATA.DONE,
      onEvade: INSTANCE_DATA.FAIL,
      cite: 'instance_zulfarrak.cpp:161/176/191 OnCreature* NPC_CHIEF_SANDSCALP; h:19 TYPE_CHIEF_SANDSCALP=7',
    },
  ],
  doors: [
    {
      field: TYPE_PYRAMID_EVENT,
      goEntry: GO_END_DOOR,
      openOn: [INSTANCE_DATA.DONE],
      cite: 'instance_zulfarrak.cpp:62-66 OnObjectCreate GO_END_DOOR if TYPE_PYRAMID_EVENT DONE; cascade Nekrum+Sezz DONE',
    },
  ],
  cites: [
    'instance_zulfarrak.cpp:29-257 instance body',
    'instance_zulfarrak.cpp:69-116 SetData encounters + pyramid cascade',
    'instance_zulfarrak.cpp:150-193 OnCreatureEnterCombat/Evade/Death',
    'instance_zulfarrak.cpp:195-244 Update pyramid trickle timer',
    'zulfarrak.h:8-80',
  ],
};
