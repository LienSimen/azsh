// Maraudon ScriptDev IR ports. Source: boss_noxxion.cpp, instance_maraudon.cpp and the header —
// boss_noxxion, instance_maraudon, go_larva_spewer. The ScriptDev timer path is the single owner.

import type { ScriptDevIR } from './types.ts';
import { INSTANCE_DATA } from './types.ts';

// Constants — boss_noxxion.cpp + maraudon.h

// boss_noxxion.cpp:30–33
export const SPELL_TOXIC_VOLLEY = 21687;
export const SPELL_UPPERCUT = 22916;
export const SPELL_NOXXION_SPAWNS_AURA = 21708;
export const SPELL_NOXXION_SPAWNS_SUMMON = 21707;

// maraudon.h:10–18
export const MAR_MAX_ENCOUNTER = 1;
export const TYPE_NOXXION = 0;
export const NPC_NOXXION = 13282;
export const NPC_SPEWED_LARVA = 13533;
export const NPC_NOXXION_SPAWN = 13456;
export const GO_LARVA_SPEWER = 178559;
export const GO_CORRUPTION_SPEWER = 178570;

// Summon count from spell 21707 EffectBasePoints1=4 + dieSides1=1 → 5.
// Cite: spell_template 21707 Effect1=42 miscValue=13456; survey 13-maraudon.md E2.
export const NOXXION_SPAWN_COUNT = 5;

// Aura 21708 DurationIndex=8 → 15_000 ms (same index as Toxic Volley DoT durationMs). Cite:
// spell-refs-payload 21708 DurationIndex=8; spell-data 21687 durationIndex 8 → 15000
export const NOXXION_SPAWNS_AURA_DURATION_MS = 15_000;

// Larva spewer ambience interval. Cite: instance_maraudon.cpp:30,156 m_spewLarvaTimer = 1 * MINUTE *
// IN_MILLISECONDS
export const SPEW_LARVA_INTERVAL_MS = 60_000;

/** Spewed larva TEMPSPAWN despawn cap. Cite: instance_maraudon.cpp:155 10 * MINUTE * IN_MILLISECONDS */
export const SPEWED_LARVA_DESPAWN_MS = 600_000;

// Larva spawn location from maraudon.h. Cite: maraudon.h:26 spawnLocation {937.213, -377.967, -50.346,
// 2.578}
export const LARVA_SPAWN_POS = {
  x: 937.213,
  y: -377.967,
  z: -50.346,
  o: 2.578,
  cite: 'maraudon.h:26 spawnLocation',
} as const;

// boss_noxxion

// boss_noxxion, creature 13282. Toxic Volley 7s/9s, Uppercut 16s/12s, Spawns aura 19s/40s. The
// 21708 AuraScript casts 21707 TRIGGERED and holds UNINTERACTIBLE while it is up.
export const BOSS_NOXXION: ScriptDevIR = {
  name: 'boss_noxxion',
  boundCreatures: [NPC_NOXXION],
  sourceFile: 'kalimdor/maraudon/boss_noxxion.cpp',
  spellIds: [
    SPELL_TOXIC_VOLLEY,
    SPELL_UPPERCUT,
    SPELL_NOXXION_SPAWNS_AURA,
    SPELL_NOXXION_SPAWNS_SUMMON,
  ],
  timers: [
    {
      id: 'toxic_volley',
      spellId: SPELL_TOXIC_VOLLEY,
      // Reset m_uiToxicVolleyTimer = 7000 (cpp:46)
      initialMinMs: 7000,
      initialMaxMs: 7000,
      // CAST_OK re-arm 9000 (cpp:65)
      repeatMinMs: 9000,
      repeatMaxMs: 9000,
      target: 'self',
      cite: 'boss_noxxion.cpp:46,62-66',
    },
    {
      id: 'uppercut',
      spellId: SPELL_UPPERCUT,
      // Reset m_uiUppercutTimer = 16000 (cpp:47)
      initialMinMs: 16_000,
      initialMaxMs: 16_000,
      // CAST_OK re-arm 12000 (cpp:73)
      repeatMinMs: 12_000,
      repeatMaxMs: 12_000,
      target: 'victim',
      cite: 'boss_noxxion.cpp:47,70-74',
    },
    {
      id: 'noxxion_spawns_aura',
      spellId: SPELL_NOXXION_SPAWNS_AURA,
      // Reset m_uiSummonTimer = 19000 (cpp:48)
      initialMinMs: 19_000,
      initialMaxMs: 19_000,
      // CAST_OK re-arm 40000 (cpp:81)
      repeatMinMs: 40_000,
      repeatMaxMs: 40_000,
      target: 'self',
      cite: 'boss_noxxion.cpp:48,79-82',
    },
  ],
  auraScripts: [
    {
      spellId: SPELL_NOXXION_SPAWNS_AURA,
      // DurationIndex 8 → 15s uninteractible window (payload + Toxic Volley same index).
      durationMs: NOXXION_SPAWNS_AURA_DURATION_MS,
      onApply: [
        {
          kind: 'cast_helper',
          spellId: SPELL_NOXXION_SPAWNS_SUMMON,
          on: 'aura_target',
          cite: 'boss_noxxion.cpp:103 CastSpell SPELL_NOXXION_SPAWNS_SUMMON TRIGGERED',
        },
        {
          kind: 'set_unattackable',
          on: 'aura_target',
          cite: 'boss_noxxion.cpp:104 SetFlag UNIT_FLAG_UNINTERACTIBLE',
        },
        {
          kind: 'flavor',
          text: "splits into Noxxion's Spawns!",
          cite: 'product flavor for 21708 apply → 5×13456 (survey E2)',
        },
      ],
      onRemove: [
        {
          kind: 'clear_unattackable',
          on: 'aura_target',
          cite: 'boss_noxxion.cpp:107 RemoveFlag UNIT_FLAG_UNINTERACTIBLE',
        },
      ],
      cite: 'boss_noxxion.cpp:95-109 SummonNoxxionsSpawns AuraScript',
    },
  ],
  lifecycle: {
    onDeath: [
      {
        kind: 'set_instance_data',
        field: TYPE_NOXXION,
        value: INSTANCE_DATA.DONE,
        cite: 'instance_maraudon.cpp:131-132 OnCreatureDeath NPC_NOXXION → TYPE_NOXXION DONE',
      },
    ],
    onEvade: [
      {
        kind: 'set_instance_data',
        field: TYPE_NOXXION,
        value: INSTANCE_DATA.FAIL,
        cite: 'instance_maraudon.cpp:141-142 OnCreatureEvade NPC_NOXXION → TYPE_NOXXION FAIL',
      },
    ],
  },
  cites: [
    'boss_noxxion.cpp:28-119',
    'boss_noxxion.cpp:44-49 Reset timers',
    'boss_noxxion.cpp:62-84 UpdateAI casts',
    'boss_noxxion.cpp:95-109 SummonNoxxionsSpawns',
    'maraudon.h:14 NPC_NOXXION=13282',
  ],
};

// go_larva_spewer

// go_ai_larva_spewer on GO 178559: a GO_ACTIVATED loot state sets TYPE_NOXXION SPECIAL, which
// stops the larva spewing. Cite: instance_maraudon.cpp:172–185.
export const GO_LARVA_SPEWER_SCRIPT: ScriptDevIR = {
  name: 'go_larva_spewer',
  boundCreatures: [],
  boundGos: [GO_LARVA_SPEWER],
  sourceFile: 'kalimdor/maraudon/instance_maraudon.cpp',
  spellIds: [],
  timers: [],
  goUse: {
    goEntries: [GO_LARVA_SPEWER],
    actions: [
      {
        kind: 'set_instance_data',
        field: TYPE_NOXXION,
        value: INSTANCE_DATA.SPECIAL,
        cite: 'instance_maraudon.cpp:182 SetData(TYPE_NOXXION, SPECIAL) on GO_ACTIVATED',
      },
    ],
    cite: 'instance_maraudon.cpp:172-185 go_ai_larva_spewer OnLootStateChange',
  },
  cites: [
    'instance_maraudon.cpp:168-190 go_larva_spewer',
    'maraudon.h:17 GO_LARVA_SPEWER=178559',
  ],
};

// instance_maraudon

// instance_maraudon, one encounter: TYPE_NOXXION, DONE on death and FAIL on evade, with SPECIAL
// from the larva spewer. While its timer runs the instance summons a larva every 60 s.
export const INSTANCE_MARAUDON: ScriptDevIR = {
  name: 'instance_maraudon',
  boundCreatures: [],
  sourceFile: 'kalimdor/maraudon/instance_maraudon.cpp',
  spellIds: [],
  timers: [],
  encounters: [
    {
      creatureEntry: NPC_NOXXION,
      field: TYPE_NOXXION,
      onDeath: INSTANCE_DATA.DONE,
      onEvade: INSTANCE_DATA.FAIL,
      cite: 'instance_maraudon.cpp:127-145 OnCreatureDeath/Evade NPC_NOXXION; h:12 TYPE_NOXXION=0',
    },
  ],
  // Corruption Spewer destroyed (ACTIVATED) on TYPE_NOXXION DONE — model as door open.
  doors: [
    {
      field: TYPE_NOXXION,
      goEntry: GO_CORRUPTION_SPEWER,
      openOn: [INSTANCE_DATA.DONE],
      cite: 'instance_maraudon.cpp:69-70 DONE → GO_CORRUPTION_SPEWER SetLootState(GO_ACTIVATED)',
    },
    {
      field: TYPE_NOXXION,
      goEntry: GO_LARVA_SPEWER,
      openOn: [INSTANCE_DATA.DONE, INSTANCE_DATA.SPECIAL],
      cite: 'instance_maraudon.cpp:74-78 DONE|SPECIAL → GO_LARVA_SPEWER GO_ACTIVATED',
    },
  ],
  cites: [
    'instance_maraudon.cpp:29-166 instance body',
    'instance_maraudon.cpp:55-95 SetData TYPE_NOXXION',
    'instance_maraudon.cpp:147-160 Update spew larva 60s',
    'instance_maraudon.cpp:192-203 AddSC_instance_maraudon',
    'maraudon.h:8-52',
    'maraudon.h:26 spawnLocation',
  ],
};
