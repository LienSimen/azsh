// Deadmines ScriptDev IR ports. Source: boss_mr_smite.cpp, deadmines.cpp, instance_deadmines.cpp.
// Spells 6433 and 6436 are sourced but absent from the bake, so live resolve is a driver gap.

import type { ScriptDevIR } from './types.ts';
import { INSTANCE_DATA } from './types.ts';
import { CAST_FLAG } from '../creature/creatureAi.ts';

// Constants — boss_mr_smite.cpp + deadmines.h

// boss_mr_smite.cpp:31–46
export const SAY_PHASE_2 = -1036002;
export const SAY_PHASE_3 = -1036003;
export const EQUIP_ID_AXE = 2183;
export const EQUIP_ID_HAMMER = 10756;
export const SPELL_NIBLE_REFLEXES = 6433;
export const SPELL_SMITE_SLAM = 6435;
export const SPELL_SMITE_STOMP = 6432;
export const SPELL_SMITE_HAMMER = 6436;
export const SPELL_THRASH = 12787;

// Runtime phase map, host-0-based: 0 PHASE_1, 1 PHASE_2 (post-66%), 2 PHASE_3 (post-33%).
// Cite: boss_mr_smite.cpp:44–46, where PHASE_1 is 1.
export const SMITE_PHASE_1 = 0;
export const SMITE_PHASE_2 = 1;
export const SMITE_PHASE_3 = 2;

/** HP thresholds. Cite: boss_mr_smite.cpp:206 GetHealthPercent() < 66.0f; :223 < 33.0f */
export const SMITE_HP_PHASE_2 = 66;
export const SMITE_HP_PHASE_3 = 33;

/** Smite Slam timer. Cite: boss_mr_smite.cpp:65 Reset m_uiSlamTimer = 9000; :244 CAST_OK re-arm 11000. */
export const SMITE_SLAM_INIT_MS = 9000;
export const SMITE_SLAM_REPEAT_MS = 11_000;

// Equip-sequence arm after stomp. Cite: boss_mr_smite.cpp:211/229 m_uiEquipTimer = 2500. (Walk/kneel timers
// 3000/1000 are movement-only; not armed as combat casts.)
export const SMITE_EQUIP_ARM_MS = 2500;

// deadmines.h:10–38
export const DM_MAX_ENCOUNTER = 4;
export const TYPE_RHAHKZOR = 0;
export const TYPE_SNEED = 1;
export const TYPE_GILNID = 2;
export const TYPE_IRON_CLAD_DOOR = 3;

export const INST_SAY_ALARM1 = -1036000;
export const INST_SAY_ALARM2 = -1036001;

export const GO_FACTORY_DOOR = 13965;
export const GO_MAST_ROOM_DOOR = 16400;
export const GO_FOUNDRY_DOOR = 16399;
export const GO_IRON_CLAD_DOOR = 16397;
export const GO_DEFIAS_CANNON = 16398;
export const GO_SMITE_CHEST = 144111;
export const GO_MYSTERIOUS_CHEST = 180024;

export const NPC_RHAHKZOR = 644;
export const NPC_SNEED = 643;
export const NPC_GILNID = 1763;
export const NPC_MR_SMITE = 646;

export const QUEST_FORTUNE_AWAITS = 7938;

/** Iron-clad door delayed open after cannon. Cite: instance_deadmines.cpp:170 m_uiIronDoorTimer = 500. */
export const IRON_DOOR_OPEN_DELAY_MS = 500;
/** Alarm-2 delay after door open. Cite: instance_deadmines.cpp:245 m_uiIronDoorTimer = 15000. */
export const IRON_DOOR_ALARM2_MS = 15_000;

// boss_mr_smite

// boss_mr_smite, creature 646. Reset casts Nimble Reflexes; below 66% a Stomp swaps to phase 2
// with Thrash, below 33% to phase 3 with Slam every 11s. The equip walk is movement chrome.
export const BOSS_MR_SMITE: ScriptDevIR = {
  name: 'boss_mr_smite',
  boundCreatures: [NPC_MR_SMITE],
  sourceFile: 'eastern_kingdoms/deadmines/boss_mr_smite.cpp',
  // Nimble Reflexes 6433 and Thrash 12787 pay through 6264 / 3391, resolved off the kit.
  spellIds: [
    SPELL_NIBLE_REFLEXES,
    SPELL_SMITE_SLAM,
    SPELL_SMITE_STOMP,
    SPELL_SMITE_HAMMER,
    SPELL_THRASH, 6264, 3391,
  ],
  timers: [
    {
      id: 'nible_reflexes',
      spellId: SPELL_NIBLE_REFLEXES,
      // Reset DoCastSpellIfCan TRIGGERED (cpp:67); JustReachedHome AURA_NOT_PRESENT (cpp:94)
      initialMinMs: 0,
      initialMaxMs: 0,
      repeatMinMs: 0,
      repeatMaxMs: 0,
      target: 'self',
      onReset: true,
      castFlags: CAST_FLAG.TRIGGERED | CAST_FLAG.AURA_NOT_PRESENT,
      // GAP: 6433 absent from bake — timer arms but spell does not resolve until driver folds it.
      cite: 'boss_mr_smite.cpp:67,94 SPELL_NIBLE_REFLEXES CAST_TRIGGERED',
    },
    {
      id: 'smite_slam',
      spellId: SPELL_SMITE_SLAM,
      // Reset m_uiSlamTimer = 9000 (cpp:65) — only consumed in PHASE_3
      initialMinMs: SMITE_SLAM_INIT_MS,
      initialMaxMs: SMITE_SLAM_INIT_MS,
      // CAST_OK re-arm 11000 (cpp:244)
      repeatMinMs: SMITE_SLAM_REPEAT_MS,
      repeatMaxMs: SMITE_SLAM_REPEAT_MS,
      target: 'victim',
      // Host phase 2 == cpp PHASE_3
      phase: SMITE_PHASE_3,
      cite: 'boss_mr_smite.cpp:65,239-245 PHASE_3 Smite Slam',
    },
  ],
  phases: [
    {
      // Host phase 1 == cpp PHASE_2 after first equip
      phase: SMITE_PHASE_2,
      hpBelowPct: SMITE_HP_PHASE_2,
      actions: [
        {
          kind: 'cast_self',
          spellId: SPELL_SMITE_STOMP,
          cite: 'boss_mr_smite.cpp:208 DoCastSpellIfCan SPELL_SMITE_STOMP',
        },
        {
          kind: 'yell',
          textId: SAY_PHASE_2,
          cite: 'boss_mr_smite.cpp:210 DoScriptText SAY_PHASE_2 (or SAY_PHASE_3 if already <33)',
        },
        {
          kind: 'remove_auras',
          spellId: SPELL_NIBLE_REFLEXES,
          cite: 'boss_mr_smite.cpp:215 RemoveAurasDueToSpell SPELL_NIBLE_REFLEXES',
        },
        {
          kind: 'stop_combat',
          // AttackStop only — Smite walks to the rack and the encounter CONTINUES into the
          // next phase. Not an EnterEvadeMode, so the pull must not resolve here.
          attackOnly: true,
          cite: 'boss_mr_smite.cpp:214 AttackStop(true) before equip walk',
        },
        {
          // Equip end PHASE_2: Thrash TRIGGERED (cpp:164). Product fires at threshold
          // (equip walk/kneel 2500+3000+1000ms is movement chrome, not a combat cast).
          kind: 'cast_self',
          spellId: SPELL_THRASH,
          castFlags: CAST_FLAG.TRIGGERED,
          cite: 'boss_mr_smite.cpp:163-164 PHASE_2 DoCastSpellIfCan SPELL_THRASH CAST_TRIGGERED',
        },
        {
          kind: 'flavor',
          text: 'grabs dual axes from Smite\'s Chest!',
          cite: 'boss_mr_smite.cpp:141 SetEquipmentSlots EQUIP_ID_AXE; equip 2183',
        },
      ],
      cite: 'boss_mr_smite.cpp:206-217 GetHealthPercent() < 66.0f → equip → PHASE_2',
    },
    {
      // Host phase 2 == cpp PHASE_3 after second equip
      phase: SMITE_PHASE_3,
      hpBelowPct: SMITE_HP_PHASE_3,
      actions: [
        {
          kind: 'cast_self',
          spellId: SPELL_SMITE_STOMP,
          cite: 'boss_mr_smite.cpp:225 DoCastSpellIfCan SPELL_SMITE_STOMP',
        },
        {
          kind: 'yell',
          textId: SAY_PHASE_3,
          cite: 'boss_mr_smite.cpp:227 DoScriptText SAY_PHASE_3',
        },
        {
          kind: 'remove_auras',
          spellId: SPELL_THRASH,
          cite: 'boss_mr_smite.cpp:233 RemoveAurasDueToSpell SPELL_THRASH',
        },
        {
          kind: 'stop_combat',
          // AttackStop only — see the phase-2 note; the fight continues after the equip walk.
          attackOnly: true,
          cite: 'boss_mr_smite.cpp:232 AttackStop(true) before equip walk',
        },
        {
          // Equip process when HP < 33: cast SMITE_HAMMER (cpp:138). GAP: 6436 dead in bake.
          kind: 'cast_self',
          spellId: SPELL_SMITE_HAMMER,
          castFlags: CAST_FLAG.TRIGGERED,
          cite: 'boss_mr_smite.cpp:136-138 PhaseEquipProcess SPELL_SMITE_HAMMER',
        },
        {
          kind: 'flavor',
          text: 'grabs a massive hammer from Smite\'s Chest!',
          cite: 'boss_mr_smite.cpp:137 SetEquipmentSlots EQUIP_ID_HAMMER; equip 10756',
        },
      ],
      cite: 'boss_mr_smite.cpp:223-235 GetHealthPercent() < 33.0f → equip → PHASE_3',
    },
  ],
  lifecycle: {
    onEvade: [
      {
        // JustReachedHome re-applies Nible Reflexes if missing (cpp:92-95)
        kind: 'cast_self',
        spellId: SPELL_NIBLE_REFLEXES,
        castFlags: CAST_FLAG.TRIGGERED | CAST_FLAG.AURA_NOT_PRESENT,
        cite: 'boss_mr_smite.cpp:92-95 JustReachedHome NIBLE_REFLEXES',
      },
    ],
  },
  cites: [
    'boss_mr_smite.cpp:28-268',
    'boss_mr_smite.cpp:61-71 Reset',
    'boss_mr_smite.cpp:169-254 UpdateAI phases',
    'boss_mr_smite.cpp:110-167 equip helpers',
    'deadmines.h:33 NPC_MR_SMITE=646',
  ],
};

// go_defias_cannon

// GOUse_go_defias_cannon, GO 16398: refuses when TYPE_IRON_CLAD_DOOR is already DONE, else sets
// it, and the instance opens the door 500 ms later. Cite: deadmines.cpp:29–41.
export const GO_DEFIAS_CANNON_SCRIPT: ScriptDevIR = {
  name: 'go_defias_cannon',
  boundCreatures: [],
  boundGos: [GO_DEFIAS_CANNON],
  sourceFile: 'eastern_kingdoms/deadmines/deadmines.cpp',
  spellIds: [],
  timers: [],
  goUse: {
    goEntries: [GO_DEFIAS_CANNON],
    gates: [
      {
        field: TYPE_IRON_CLAD_DOOR,
        notEquals: INSTANCE_DATA.DONE,
        cite: 'deadmines.cpp:36-37 GetData(TYPE_IRON_CLAD_DOOR) == DONE → return false',
      },
    ],
    actions: [
      {
        kind: 'set_instance_data',
        field: TYPE_IRON_CLAD_DOOR,
        value: INSTANCE_DATA.DONE,
        cite: 'deadmines.cpp:39 SetData(TYPE_IRON_CLAD_DOOR, DONE)',
      },
    ],
    cite: 'deadmines.cpp:29-41 GOUse_go_defias_cannon',
  },
  cites: [
    'deadmines.cpp:29-41 go_defias_cannon',
    'deadmines.h:26 GO_DEFIAS_CANNON=16398',
    'deadmines.h:15 TYPE_IRON_CLAD_DOOR=3',
  ],
};

// instance_deadmines

// instance_deadmines, m_auiEncounter[4]: Rhahk'zor, Sneed and Gilnid each open a door on death,
// and TYPE_IRON_CLAD_DOOR comes from the cannon. No ScriptName — bound via instance_template.
export const INSTANCE_DEADMINES: ScriptDevIR = {
  name: 'instance_deadmines',
  boundCreatures: [],
  sourceFile: 'eastern_kingdoms/deadmines/instance_deadmines.cpp',
  spellIds: [],
  timers: [],
  encounters: [
    {
      creatureEntry: NPC_RHAHKZOR,
      field: TYPE_RHAHKZOR,
      onDeath: INSTANCE_DATA.DONE,
      cite: 'instance_deadmines.cpp:129 OnCreatureDeath NPC_RHAHKZOR → TYPE_RHAHKZOR DONE; h:12',
    },
    {
      creatureEntry: NPC_SNEED,
      field: TYPE_SNEED,
      onDeath: INSTANCE_DATA.DONE,
      cite: 'instance_deadmines.cpp:130 OnCreatureDeath NPC_SNEED → TYPE_SNEED DONE; h:13',
    },
    {
      creatureEntry: NPC_GILNID,
      field: TYPE_GILNID,
      onDeath: INSTANCE_DATA.DONE,
      cite: 'instance_deadmines.cpp:131 OnCreatureDeath NPC_GILNID → TYPE_GILNID DONE; h:14',
    },
  ],
  doors: [
    {
      field: TYPE_RHAHKZOR,
      goEntry: GO_FACTORY_DOOR,
      openOn: [INSTANCE_DATA.DONE],
      cite: 'instance_deadmines.cpp:141-142 DONE → DoUseDoorOrButton(GO_FACTORY_DOOR)',
    },
    {
      field: TYPE_SNEED,
      goEntry: GO_MAST_ROOM_DOOR,
      openOn: [INSTANCE_DATA.DONE],
      cite: 'instance_deadmines.cpp:150-151 DONE → DoUseDoorOrButton(GO_MAST_ROOM_DOOR)',
    },
    {
      field: TYPE_GILNID,
      goEntry: GO_FOUNDRY_DOOR,
      openOn: [INSTANCE_DATA.DONE],
      cite: 'instance_deadmines.cpp:159-160 DONE → DoUseDoorOrButton(GO_FOUNDRY_DOOR)',
    },
    {
      field: TYPE_IRON_CLAD_DOOR,
      goEntry: GO_IRON_CLAD_DOOR,
      openOn: [INSTANCE_DATA.DONE],
      cite: 'instance_deadmines.cpp:169-170,230 DONE → m_uiIronDoorTimer=500 then DoUseDoorOrButton(GO_IRON_CLAD_DOOR)',
    },
  ],
  unusedBindings: [
    {
      entry: GO_MYSTERIOUS_CHEST,
      kind: 'go',
      reason:
        'GO 180024 Mysterious Chest respawns on OnPlayerEnter when QUEST_FORTUNE_AWAITS (7938) is complete-unrewarded - not a ScriptName binding; product quest-chest path owns it.',
      cite: 'instance_deadmines.cpp:43-47; deadmines.h:28 GO_MYSTERIOUS_CHEST=180024',
    },
  ],
  cites: [
    'instance_deadmines.cpp:29-272 instance body',
    'instance_deadmines.cpp:125-133 OnCreatureDeath',
    'instance_deadmines.cpp:135-189 SetData doors + iron timer',
    'instance_deadmines.cpp:221-258 Update iron door steps',
    'deadmines.h:8-75',
    'AddSC Name=instance_deadmines - instance_template map 36, no creature_template.ScriptName',
  ],
};
