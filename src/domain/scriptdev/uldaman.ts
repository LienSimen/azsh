// Uldaman ScriptDev IR ports. Source: boss_archaedas.cpp, instance_uldaman.cpp and the header.
// The two altar GOs are type 18, so their spells fire SEND_EVENT rather than a GO ScriptName.

import type { ScriptDevIR } from './types.ts';
import { INSTANCE_DATA } from './types.ts';
import { CAST_FLAG } from '../creature/creatureAi.ts';

// Constants — uldaman.h + boss_archaedas.cpp enum

// uldaman.h:12
export const ULD_MAX_ENCOUNTER = 2;

// uldaman.h:14–16
export const TYPE_ALTAR_EVENT = 1;
export const TYPE_ARCHAEDAS = 2;
export const DATA_EVENT_STARTER = 3;

// uldaman.h:18–21 GOs (doors / vault — altars are not in the header)
export const GO_TEMPLE_DOOR_UPPER = 124367;
export const GO_TEMPLE_DOOR_LOWER = 141869;
export const GO_ANCIENT_VAULT = 124369;
export const GO_ANCIENT_TREASURE = 141979;

// Ritual altars — gameobject_template type 18; not in uldaman.h.
// Cite: gameobject-data.json 130511/133234 summoningRitual.spellId 11568/10340
export const GO_ALTAR_OF_THE_KEEPERS = 130511;
export const GO_ALTAR_OF_ARCHAEDAS = 133234;

// uldaman.h:23–28 NPCs
export const NPC_ARCHAEDAS = 2748;
export const NPC_CUSTODIAN = 7309;
export const NPC_HALLSHAPER = 7077;
export const NPC_GUARDIAN = 7076;
export const NPC_VAULT_WARDER = 10120;
export const NPC_STONE_KEEPER = 4857;

// uldaman.h:30–31 shared stoned/freeze
export const SPELL_STONED = 10255;
export const SPELL_FREEZE_ANIM = 16245;

// uldaman.h:33–34 altar event ids + completion spells (GO summoningRitual.spellId)
export const EVENT_ID_ALTAR_KEEPER = 2228; // spell 11568
export const EVENT_ID_ALTAR_ARCHAEDAS = 2268; // spell 10340
export const SPELL_ULDAMAN_SUB_BOSS_AGRO = 11568; // GO 130511 → event 2228
export const SPELL_ULDAMAN_BOSS_AGRO = 10340; // GO 133234 → event 2268

// boss_archaedas.cpp:31–36
export const SPELL_ARCHAEDAS_AWAKEN_VISUAL = 10347;
export const SPELL_GROUND_TREMOR = 6524;
export const SPELL_AWAKEN_EARTHEN_GUARDIAN = 10252; // awaken all 7076
export const SPELL_AWAKEN_VAULT_WARDER = 10258; // awaken 2× 10120
export const SPELL_AWAKEN_EARTHEN_DWARF = 10259; // random 7309 or 7077

// boss_archaedas.cpp:38–42 script_texts
export const SAY_AGGRO = -1070001;
export const SAY_AWAKE_GUARDIANS = -1070002;
export const SAY_AWAKE_WARDERS = -1070003;
export const SAY_UNIT_SLAIN = -1070004;
export const EMOTE_BREAKS_FREE = -1070005;

// HP phase formula: GetHealthPercent() < 100 − 33.4 × m_uiHpPhaseCheck, which starts at 1 — so the
// first fire is below 66.6% and the second below 33.2%. Cite: boss_archaedas.cpp:147, :70.
export const ARCHAEDAS_HP_GUARDIANS = 100 - 33.4 * 1; // 66.6
export const ARCHAEDAS_HP_WARDERS = 100 - 33.4 * 2; // 33.2

// Keeper activate cooldown after altar start / each keeper death (except last). Cite:
// instance_uldaman.cpp:103,262 m_uiKeeperCooldown = 5000
export const KEEPER_COOLDOWN_MS = 5000;

// Pure helpers — altar event + stone-keeper counter

// Port of instance_uldaman::StartEvent via ProcessEventId: event 2228 takes TYPE_ALTAR_EVENT from
// NOT_STARTED to IN_PROGRESS, and 2268 takes TYPE_ARCHAEDAS to SPECIAL. Cite: cpp:192–206, :313–324.
export function startUldamanAltarEvent(
  eventId: number,
  store: Map<number, number>,
): { field: number; value: number; cite: string } | null {
  if (eventId === EVENT_ID_ALTAR_KEEPER) {
    const cur = store.get(TYPE_ALTAR_EVENT) ?? INSTANCE_DATA.NOT_STARTED;
    if (cur === INSTANCE_DATA.NOT_STARTED) {
      store.set(TYPE_ALTAR_EVENT, INSTANCE_DATA.IN_PROGRESS);
      return {
        field: TYPE_ALTAR_EVENT,
        value: INSTANCE_DATA.IN_PROGRESS,
        cite: 'instance_uldaman.cpp:196-199 EVENT_ID_ALTAR_KEEPER → TYPE_ALTAR_EVENT IN_PROGRESS',
      };
    }
    return null;
  }
  if (eventId === EVENT_ID_ALTAR_ARCHAEDAS) {
    const cur = store.get(TYPE_ARCHAEDAS) ?? INSTANCE_DATA.NOT_STARTED;
    if (cur === INSTANCE_DATA.NOT_STARTED || cur === INSTANCE_DATA.FAIL) {
      store.set(TYPE_ARCHAEDAS, INSTANCE_DATA.SPECIAL);
      return {
        field: TYPE_ARCHAEDAS,
        value: INSTANCE_DATA.SPECIAL,
        cite: 'instance_uldaman.cpp:201-205 EVENT_ID_ALTAR_ARCHAEDAS → TYPE_ARCHAEDAS SPECIAL',
      };
    }
    return null;
  }
  return null;
}

// Port of instance_uldaman::OnCreatureDeath for NPC_STONE_KEEPER. Cite: instance_uldaman.cpp:253–263
// ++fallen; if fallen == keeperCount → TYPE_ALTAR_EVENT DONE; else arm 5000ms cooldown.
export function onStoneKeeperDeath(
  fallen: number,
  keeperCount: number,
): { nextFallen: number; done: boolean; armCooldownMs: number } {
  const nextFallen = fallen + 1;
  if (keeperCount > 0 && nextFallen >= keeperCount) {
    return { nextFallen, done: true, armCooldownMs: 0 };
  }
  return { nextFallen, done: false, armCooldownMs: KEEPER_COOLDOWN_MS };
}

// boss_archaedas

// boss_archaedas, creature 2748. Ground Tremor urand(7–14)s then urand(8–17)s, Awaken Earthen Dwarf
// 10s then urand(9–12)s while HP ≥ 33. Below 66.6% guardians wake, below 33.2% the vault warders.
export const BOSS_ARCHAEDAS: ScriptDevIR = {
  name: 'boss_archaedas',
  boundCreatures: [NPC_ARCHAEDAS],
  sourceFile: 'eastern_kingdoms/uldaman/boss_archaedas.cpp',
  spellIds: [
    SPELL_ARCHAEDAS_AWAKEN_VISUAL,
    SPELL_GROUND_TREMOR,
    SPELL_AWAKEN_EARTHEN_GUARDIAN,
    SPELL_AWAKEN_VAULT_WARDER,
    SPELL_AWAKEN_EARTHEN_DWARF,
    SPELL_FREEZE_ANIM,
    SPELL_STONED,
  ],
  timers: [
    {
      id: 'freeze_anim',
      spellId: SPELL_FREEZE_ANIM,
      initialMinMs: 0,
      initialMaxMs: 0,
      repeatMinMs: 0,
      repeatMaxMs: 0,
      target: 'self',
      onReset: true,
      castFlags: CAST_FLAG.TRIGGERED | CAST_FLAG.AURA_NOT_PRESENT,
      cite: 'boss_archaedas.cpp:72 DoCastSpellIfCan FREEZE_ANIM on Reset',
    },
    {
      id: 'ground_tremor',
      spellId: SPELL_GROUND_TREMOR,
      // Reset m_uiTremorTimer = urand(7000, 14000) (cpp:68)
      initialMinMs: 7000,
      initialMaxMs: 14_000,
      // CAST_OK re-arm urand(8000, 17000) (cpp:176)
      repeatMinMs: 8000,
      repeatMaxMs: 17_000,
      target: 'self',
      cite: 'boss_archaedas.cpp:68,173-179',
    },
    // Awake dwarf while HP >= 33% → active in phase 0 and phase 1 only.
    // Cite: boss_archaedas.cpp:157 !m_bDwarvesAwaken && GetHealthPercent() >= 33.0f
    {
      id: 'awaken_earthen_dwarf_p0',
      spellId: SPELL_AWAKEN_EARTHEN_DWARF,
      // Reset m_uiAwakeDwarfTimer = 10000 (cpp:67)
      initialMinMs: 10_000,
      initialMaxMs: 10_000,
      // CAST_OK re-arm urand(9000, 12000) (cpp:164)
      repeatMinMs: 9000,
      repeatMaxMs: 12_000,
      // C++: GetClosestDwarfNotInCombat (warden list). Self cast is the host
      // fallback; spell script removes SPELL_STONED on aura target.
      target: 'self',
      phase: 0,
      cite: 'boss_archaedas.cpp:67,156-171 phase 0 (HP>=33); GetClosestDwarfNotInCombat',
    },
    {
      id: 'awaken_earthen_dwarf_p1',
      spellId: SPELL_AWAKEN_EARTHEN_DWARF,
      initialMinMs: 10_000,
      initialMaxMs: 10_000,
      repeatMinMs: 9000,
      repeatMaxMs: 12_000,
      target: 'self',
      phase: 1,
      cite: 'boss_archaedas.cpp:67,156-171 phase 1 after guardians (still HP>=33)',
    },
  ],
  phases: [
    {
      phase: 1,
      hpBelowPct: ARCHAEDAS_HP_GUARDIANS,
      actions: [
        {
          kind: 'cast_self',
          spellId: SPELL_AWAKEN_EARTHEN_GUARDIAN,
          castFlags: CAST_FLAG.FORCE_TARGET_SELF,
          cite: 'boss_archaedas.cpp:149 SPELL_AWAKEN_EARTHEN_GUARDIAN when HpPhaseCheck==1',
        },
        {
          kind: 'yell',
          textId: SAY_AWAKE_GUARDIANS,
          cite: 'boss_archaedas.cpp:39,151 SAY_AWAKE_GUARDIANS',
        },
      ],
      cite: 'boss_archaedas.cpp:147-153 HP < 100-33.4*1 (=66.6%)',
    },
    {
      phase: 2,
      hpBelowPct: ARCHAEDAS_HP_WARDERS,
      actions: [
        {
          kind: 'cast_self',
          spellId: SPELL_AWAKEN_VAULT_WARDER,
          castFlags: CAST_FLAG.FORCE_TARGET_SELF,
          cite: 'boss_archaedas.cpp:149 SPELL_AWAKEN_VAULT_WARDER when HpPhaseCheck==2',
        },
        {
          kind: 'yell',
          textId: SAY_AWAKE_WARDERS,
          cite: 'boss_archaedas.cpp:40,151 SAY_AWAKE_WARDERS',
        },
      ],
      cite: 'boss_archaedas.cpp:147-153 HP < 100-33.4*2 (=33.2%)',
    },
  ],
  auraScripts: [
    // 10252 / 10259 AuraScript AwakenEarthenArchaedas (cpp:207-226)
    {
      spellId: SPELL_AWAKEN_EARTHEN_GUARDIAN,
      onApply: [
        {
          kind: 'remove_auras',
          spellId: SPELL_STONED,
          on: 'aura_target',
          cite: 'boss_archaedas.cpp:217 RemoveAurasDueToSpell(SPELL_STONED)',
        },
      ],
      cite: 'boss_archaedas.cpp:207-226 AwakenEarthenArchaedas OnApply 10252',
    },
    {
      spellId: SPELL_AWAKEN_EARTHEN_DWARF,
      onApply: [
        {
          kind: 'remove_auras',
          spellId: SPELL_STONED,
          on: 'aura_target',
          cite: 'boss_archaedas.cpp:217 RemoveAurasDueToSpell(SPELL_STONED)',
        },
      ],
      cite: 'boss_archaedas.cpp:207-226 AwakenEarthenArchaedas OnApply 10259',
    },
    // 10258 SpellScript AwakenVaultWarder OnEffectExecute (cpp:190-205)
    {
      spellId: SPELL_AWAKEN_VAULT_WARDER,
      onApply: [
        {
          kind: 'remove_auras',
          spellId: SPELL_STONED,
          on: 'aura_target',
          cite: 'boss_archaedas.cpp:196 RemoveAurasDueToSpell(SPELL_STONED)',
        },
      ],
      cite: 'boss_archaedas.cpp:190-205 AwakenVaultWarder OnEffectExecute 10258',
    },
  ],
  lifecycle: {
    onAggro: [
      {
        kind: 'set_instance_data',
        field: TYPE_ARCHAEDAS,
        value: INSTANCE_DATA.IN_PROGRESS,
        cite: 'boss_archaedas.cpp:76-80 Aggro SetData(TYPE_ARCHAEDAS, IN_PROGRESS)',
      },
    ],
    onDeath: [
      {
        kind: 'set_instance_data',
        field: TYPE_ARCHAEDAS,
        value: INSTANCE_DATA.DONE,
        cite: 'boss_archaedas.cpp:87-92 JustDied SetData(TYPE_ARCHAEDAS, DONE)',
      },
    ],
    onEvade: [
      {
        kind: 'set_instance_data',
        field: TYPE_ARCHAEDAS,
        value: INSTANCE_DATA.FAIL,
        cite: 'boss_archaedas.cpp:94-98 JustReachedHome SetData(TYPE_ARCHAEDAS, FAIL)',
      },
    ],
  },
  cites: [
    'boss_archaedas.cpp:29-237',
    'boss_archaedas.cpp:63-74 Reset timers',
    'boss_archaedas.cpp:100-182 UpdateAI',
    'uldaman.h:23 NPC_ARCHAEDAS=2748',
    'scriptdev2.sql:640 ScriptName boss_archaedas entry=2748',
    'scriptdev2.sql:1755-1759 script_texts -1070001..-1070005',
  ],
};

// event_spell_altar_boss_aggro

// ProcessEventId_event_spell_altar_boss_aggro, events 2228 and 2268. The C++ has no GO ScriptName —
// the ritual casts 11568/10340 which SEND_EVENT — so the IR binds both altars through perEntry.
export const EVENT_SPELL_ALTAR_BOSS_AGGRO: ScriptDevIR = {
  name: 'event_spell_altar_boss_aggro',
  boundCreatures: [],
  boundGos: [GO_ALTAR_OF_THE_KEEPERS, GO_ALTAR_OF_ARCHAEDAS],
  sourceFile: 'eastern_kingdoms/uldaman/instance_uldaman.cpp',
  spellIds: [SPELL_ULDAMAN_SUB_BOSS_AGRO, SPELL_ULDAMAN_BOSS_AGRO],
  timers: [],
  goUse: {
    goEntries: [GO_ALTAR_OF_THE_KEEPERS, GO_ALTAR_OF_ARCHAEDAS],
    // perEntry first — which altar was used selects the StartEvent arm.
    perEntry: [
      {
        goEntry: GO_ALTAR_OF_THE_KEEPERS,
        gates: [
          {
            field: TYPE_ALTAR_EVENT,
            equals: INSTANCE_DATA.NOT_STARTED,
            cite: 'instance_uldaman.cpp:198 GetData(TYPE_ALTAR_EVENT) == NOT_STARTED',
          },
        ],
        actions: [
          {
            kind: 'set_instance_data',
            field: TYPE_ALTAR_EVENT,
            value: INSTANCE_DATA.IN_PROGRESS,
            cite: 'instance_uldaman.cpp:199 SetData(TYPE_ALTAR_EVENT, IN_PROGRESS)',
          },
        ],
        cite: 'instance_uldaman.cpp:196-199 EVENT_ID_ALTAR_KEEPER 2228 via GO 130511',
      },
      {
        // C++: NOT_STARTED || FAIL → SPECIAL. Gates AND-exclude DONE/IN_PROGRESS/SPECIAL.
        goEntry: GO_ALTAR_OF_ARCHAEDAS,
        gates: [
          {
            field: TYPE_ARCHAEDAS,
            notEquals: INSTANCE_DATA.DONE,
            cite: 'instance_uldaman.cpp:203 block when DONE',
          },
          {
            field: TYPE_ARCHAEDAS,
            notEquals: INSTANCE_DATA.IN_PROGRESS,
            cite: 'instance_uldaman.cpp:203 block when IN_PROGRESS',
          },
          {
            field: TYPE_ARCHAEDAS,
            notEquals: INSTANCE_DATA.SPECIAL,
            cite: 'instance_uldaman.cpp:203 block when already SPECIAL',
          },
        ],
        actions: [
          {
            kind: 'set_instance_data',
            field: TYPE_ARCHAEDAS,
            value: INSTANCE_DATA.SPECIAL,
            cite: 'instance_uldaman.cpp:204 SetData(TYPE_ARCHAEDAS, SPECIAL)',
          },
        ],
        cite: 'instance_uldaman.cpp:201-205 EVENT_ID_ALTAR_ARCHAEDAS 2268 via GO 133234; NOT_STARTED|FAIL',
      },
    ],
    cite: 'instance_uldaman.cpp:313-324 ProcessEventId; StartEvent via altar GO perEntry',
  },
  cites: [
    'instance_uldaman.cpp:192-206 StartEvent',
    'instance_uldaman.cpp:313-324 ProcessEventId_event_spell_altar_boss_aggro',
    'uldaman.h:33-34 EVENT_ID_ALTAR_KEEPER=2228 EVENT_ID_ALTAR_ARCHAEDAS=2268',
    'gameobject-data.json GO 130511/133234 type 18 spellId 11568/10340',
    'scriptdev2.sql:638-639',
  ],
};

// instance_uldaman

// instance_uldaman, m_auiEncounter[2]: TYPE_ALTAR_EVENT opens the temple doors when every keeper
// has fallen, and TYPE_ARCHAEDAS opens the Ancient Vault. Bound via instance_template map 70.
export const INSTANCE_ULDAMAN: ScriptDevIR = {
  name: 'instance_uldaman',
  boundCreatures: [],
  sourceFile: 'eastern_kingdoms/uldaman/instance_uldaman.cpp',
  spellIds: [SPELL_STONED],
  timers: [],
  encounters: [
    {
      // Boss AI also SetData on aggro/death/evade; instance stores m_auiEncounter[1].
      creatureEntry: NPC_ARCHAEDAS,
      field: TYPE_ARCHAEDAS,
      onAggro: INSTANCE_DATA.IN_PROGRESS,
      onDeath: INSTANCE_DATA.DONE,
      onEvade: INSTANCE_DATA.FAIL,
      cite: 'boss_archaedas.cpp:76-98; instance_uldaman.cpp:113-120 TYPE_ARCHAEDAS',
    },
    // Stone Keepers: multi-mob counter (onStoneKeeperDeath), not single-death DONE.
    // Documented via helper + TYPE_ALTAR_EVENT doors; no false 1:1 encounter binding.
  ],
  doors: [
    {
      field: TYPE_ALTAR_EVENT,
      goEntry: GO_TEMPLE_DOOR_UPPER,
      openOn: [INSTANCE_DATA.DONE],
      cite: 'instance_uldaman.cpp:94-97 TYPE_ALTAR_EVENT DONE → GO_TEMPLE_DOOR_UPPER; h:18',
    },
    {
      field: TYPE_ALTAR_EVENT,
      goEntry: GO_TEMPLE_DOOR_LOWER,
      openOn: [INSTANCE_DATA.DONE],
      cite: 'instance_uldaman.cpp:94-98 TYPE_ALTAR_EVENT DONE → GO_TEMPLE_DOOR_LOWER; h:19',
    },
    {
      field: TYPE_ARCHAEDAS,
      goEntry: GO_ANCIENT_VAULT,
      openOn: [INSTANCE_DATA.DONE],
      cite: 'instance_uldaman.cpp:114-117 TYPE_ARCHAEDAS DONE → GO_ANCIENT_VAULT; h:20',
    },
  ],
  cites: [
    'instance_uldaman.cpp:29-337 instance body',
    'instance_uldaman.cpp:89-135 SetData',
    'instance_uldaman.cpp:246-263 OnCreatureEvade/OnCreatureDeath Stone Keeper',
    'instance_uldaman.cpp:266-306 Update keeper cooldown 5000ms',
    'uldaman.h:8-80',
    'scriptdev2.sql:641 instance_template map=70 ScriptName=instance_uldaman (no creature binding)',
  ],
};

/** All Uldaman ScriptDev IR exports for tests. */
export const ULDAMAN_SCRIPTS = [
  BOSS_ARCHAEDAS,
  INSTANCE_ULDAMAN,
  EVENT_SPELL_ALTAR_BOSS_AGGRO,
] as const;
