// Blackfathom Deeps ScriptDev IR ports. Source: instance_blackfathom_deeps.cpp and its header, plus
// scriptdev2.sql:210–212 — instance_blackfathom_deeps, go_fire_of_akumai, go_fathom_stone.

import type { ScriptDevIR } from './types.ts';
import { INSTANCE_DATA } from './types.ts';

// Constants — blackfathom_deeps.h

// blackfathom_deeps.h:10–12
export const BFD_MAX_ENCOUNTER = 3;
export const BFD_MAX_FIRES = 4;

// blackfathom_deeps.h:14–16
export const TYPE_KELRIS = 1;
export const TYPE_SHRINE = 2;
export const TYPE_AQUANIS = 3;

// blackfathom_deeps.h:18–25
export const NPC_KELRIS = 4832;
export const NPC_BARON_AQUANIS = 12876;
export const NPC_AKUMAI_SERVANT = 4978;
export const NPC_AKUMAI_SNAPJAW = 4825;
export const NPC_BARBED_CRUSTACEAN = 4823;
export const NPC_MURKSHALLOW_SOFTSHELL = 4977;

// blackfathom_deeps.h:27–32
export const GO_PORTAL_DOOR = 21117;
export const GO_SHRINE_1 = 21118;
export const GO_SHRINE_2 = 21119;
export const GO_SHRINE_3 = 21120;
export const GO_SHRINE_4 = 21121;
export const GO_ENTRY_FATHOM_STONE = 177964;

/** Fire of Aku'mai brazier GO entries (ScriptName go_fire_of_akumai). */
export const GO_FIRES_OF_AKUMAI = [GO_SHRINE_1, GO_SHRINE_2, GO_SHRINE_3, GO_SHRINE_4] as const;

// Wave spawn delay after each fire lit → SetData(TYPE_SHRINE, IN_PROGRESS). Cite:
// instance_blackfathom_deeps.cpp:125 m_uiSpawnMobsTimer[m_uiWaveCounter] = 3000
export const BFD_WAVE_SPAWN_DELAY_MS = 3000;

// Wave summon table from aWaveSummonInformation (blackfathom_deeps.h:76–84). Order is fire-use order (Nth
// fire → wave index N-1), not GO entry order. Counts match survey / header comments (h:45–48).
export const BFD_WAVE_SUMMONS = [
  {
    waveIndex: 0,
    creatureEntry: NPC_AKUMAI_SNAPJAW,
    count: 3,
    cite: 'blackfathom_deeps.h:78 wave 0 Snapjaw {{1,0},{1,1},{1,5}}',
  },
  {
    waveIndex: 1,
    creatureEntry: NPC_AKUMAI_SERVANT,
    count: 2,
    cite: 'blackfathom_deeps.h:79 wave 1 Servant {{1,1},{1,4}}',
  },
  {
    waveIndex: 2,
    creatureEntry: NPC_BARBED_CRUSTACEAN,
    count: 4,
    cite: 'blackfathom_deeps.h:80-81 wave 2 Crustacean 2 rows ×2 pos',
  },
  {
    waveIndex: 3,
    creatureEntry: NPC_MURKSHALLOW_SOFTSHELL,
    count: 10,
    cite: 'blackfathom_deeps.h:82-83 wave 3 Softshell {{2,0},{1,1},{2,2},{1,3},{2,4},{2,5}}',
  },
] as const;

/** Baron Aquanis summon position from Fathom Stone use. Cite: blackfathom_deeps.h:86 afAquanisPos */
export const AQUANIS_SPAWN_POS = {
  x: -782.21,
  y: -63.26,
  z: -42.43,
  o: 2.36,
  cite: 'blackfathom_deeps.h:86 afAquanisPos',
} as const;

// go_fire_of_akumai

// GOUse_go_fire_of_akumai (GO 21118–21121): TYPE_SHRINE DONE no-ops, TYPE_KELRIS DONE sets SHRINE
// IN_PROGRESS and arms the 3000 ms wave, anything else blocks the light. Cite: cpp:256–273.
export const GO_FIRE_OF_AKUMAI: ScriptDevIR = {
  name: 'go_fire_of_akumai',
  boundCreatures: [],
  boundGos: [...GO_FIRES_OF_AKUMAI],
  sourceFile: 'kalimdor/blackfathom_deeps/instance_blackfathom_deeps.cpp',
  spellIds: [],
  timers: [],
  goUse: {
    goEntries: [...GO_FIRES_OF_AKUMAI],
    gates: [
      {
        field: TYPE_SHRINE,
        notEquals: INSTANCE_DATA.DONE,
        cite: 'instance_blackfathom_deeps.cpp:263 GetData(TYPE_SHRINE) == DONE → return true',
      },
      {
        field: TYPE_KELRIS,
        equals: INSTANCE_DATA.DONE,
        cite: 'instance_blackfathom_deeps.cpp:266 GetData(TYPE_KELRIS) == DONE required to light',
      },
    ],
    actions: [
      {
        kind: 'set_instance_data',
        field: TYPE_SHRINE,
        value: INSTANCE_DATA.IN_PROGRESS,
        cite: 'instance_blackfathom_deeps.cpp:268 SetData(TYPE_SHRINE, IN_PROGRESS)',
      },
    ],
    cite: 'instance_blackfathom_deeps.cpp:256-273 GOUse_go_fire_of_akumai',
  },
  cites: [
    'instance_blackfathom_deeps.cpp:256-273',
    'instance_blackfathom_deeps.cpp:121-127 TYPE_SHRINE IN_PROGRESS arms 3000ms wave timer',
    'blackfathom_deeps.h:28-31 GO_SHRINE_1..4',
    'scriptdev2.sql:211',
  ],
};

// go_fathom_stone

// GOUse_go_fathom_stone (GO 177964): with TYPE_AQUANIS NOT_STARTED it summons Baron Aquanis and
// sets IN_PROGRESS, then always allows the GO loot for quest 6921. Cite: cpp:275–288.
export const GO_FATHOM_STONE: ScriptDevIR = {
  name: 'go_fathom_stone',
  boundCreatures: [],
  boundGos: [GO_ENTRY_FATHOM_STONE],
  sourceFile: 'kalimdor/blackfathom_deeps/instance_blackfathom_deeps.cpp',
  spellIds: [],
  timers: [],
  goUse: {
    goEntries: [GO_ENTRY_FATHOM_STONE],
    gates: [
      {
        field: TYPE_AQUANIS,
        equals: INSTANCE_DATA.NOT_STARTED,
        cite: 'instance_blackfathom_deeps.cpp:281 GetData(TYPE_AQUANIS) == NOT_STARTED',
      },
    ],
    actions: [
      {
        kind: 'summon_count',
        creatureEntry: NPC_BARON_AQUANIS,
        count: 1,
        cite: 'instance_blackfathom_deeps.cpp:283 SummonCreature(NPC_BARON_AQUANIS, afAquanisPos)',
      },
      {
        kind: 'set_instance_data',
        field: TYPE_AQUANIS,
        value: INSTANCE_DATA.IN_PROGRESS,
        cite: 'instance_blackfathom_deeps.cpp:284 SetData(TYPE_AQUANIS, IN_PROGRESS)',
      },
    ],
    cite: 'instance_blackfathom_deeps.cpp:275-288 GOUse_go_fathom_stone',
  },
  cites: [
    'instance_blackfathom_deeps.cpp:275-288',
    'blackfathom_deeps.h:19 NPC_BARON_AQUANIS=12876',
    'blackfathom_deeps.h:32 GO_FATHOM_STONE=177964',
    'blackfathom_deeps.h:86 afAquanisPos',
    'scriptdev2.sql:212',
  ],
};

// instance_blackfathom_deeps

// The three encounters: TYPE_KELRIS from EventAI 483204, TYPE_SHRINE from four fires plus a clear,
// TYPE_AQUANIS from the Fathom Stone. Door 21117 opens on SHRINE DONE. Cite: cpp:117–228.
export const INSTANCE_BLACKFATHOM_DEEPS: ScriptDevIR = {
  name: 'instance_blackfathom_deeps',
  boundCreatures: [],
  sourceFile: 'kalimdor/blackfathom_deeps/instance_blackfathom_deeps.cpp',
  spellIds: [],
  timers: [],
  encounters: [
    {
      // EventAI 483204 death → SET_INST_DATA field 1 value 3 (DONE).
      // Instance SetData only accepts DONE once (cpp:117–119).
      creatureEntry: NPC_KELRIS,
      field: TYPE_KELRIS,
      onDeath: INSTANCE_DATA.DONE,
      cite: 'instance_blackfathom_deeps.cpp:117-119 TYPE_KELRIS DONE; EventAI 483204 action1_type=34 param1=1 param2=3',
    },
    {
      creatureEntry: NPC_BARON_AQUANIS,
      field: TYPE_AQUANIS,
      onDeath: INSTANCE_DATA.DONE,
      // Aggro not set by instance OnCreatureEnterCombat — only Fathom Stone sets IN_PROGRESS.
      cite: 'instance_blackfathom_deeps.cpp:186-187 OnCreatureDeath NPC_BARON_AQUANIS → TYPE_AQUANIS DONE',
    },
  ],
  doors: [
    {
      field: TYPE_SHRINE,
      goEntry: GO_PORTAL_DOOR,
      openOn: [INSTANCE_DATA.DONE],
      cite: 'instance_blackfathom_deeps.cpp:128-129 TYPE_SHRINE DONE → DoUseDoorOrButton(GO_PORTAL_DOOR); h:27 GO_PORTAL_DOOR=21117',
    },
  ],
  cites: [
    'instance_blackfathom_deeps.cpp:35-249 instance body',
    'instance_blackfathom_deeps.cpp:113-148 SetData',
    'instance_blackfathom_deeps.cpp:184-211 OnCreatureDeath',
    'instance_blackfathom_deeps.cpp:230-249 Update wave timers 3000ms',
    'instance_blackfathom_deeps.cpp:251-306 AddSC_instance_blackfathom_deeps',
    'blackfathom_deeps.h:8-119',
    'blackfathom_deeps.h:76-84 aWaveSummonInformation',
    'scriptdev2.sql:210 instance_template map=48',
  ],
};
