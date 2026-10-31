// Scholomance ScriptDev IR ports. Source: boss_darkmaster_gandling, boss_jandice_barov,
// instance_scholomance and scholomance.cpp. Every value cites file:line below.

import type { ScriptDevIR } from './types.ts';
import { INSTANCE_DATA } from './types.ts';
import { CAST_FLAG } from '../creature/creatureAi.ts';
import { FALLBACK_DURATION_MS } from '../../engine/spells/interpreter/duration.ts';

// Constants — scholomance.h + boss / zone cpp enums

// scholomance.h:10–24
export const SCHOLO_MAX_ENCOUNTER = 10;
export const TYPE_KIRTONOS = 0;
export const TYPE_RATTLEGORE = 1;
export const TYPE_RAS_FROSTWHISPER = 2;
export const TYPE_MALICIA = 3;
export const TYPE_THEOLEN = 4;
export const TYPE_POLKELT = 5;
export const TYPE_RAVENIAN = 6;
export const TYPE_ALEXEI_BAROV = 7;
export const TYPE_ILLUCIA_BAROV = 8;
export const TYPE_GANDLING = 9;

// scholomance.h:32–44 NPCs
export const NPC_KIRTONOS = 10506;
export const NPC_RATTLEGORE = 11622;
export const NPC_RAS_FROSTWHISPER = 10508;
export const NPC_THEOLEN_KRASTINOV = 11261;
export const NPC_LOREKEEPER_POLKELT = 10901;
export const NPC_RAVENIAN = 10507;
export const NPC_ILLUCIA_BAROV = 10502;
export const NPC_ALEXEI_BAROV = 10504;
export const NPC_INSTRUCTOR_MALICIA = 10505;
export const NPC_VECTUS = 10432;
export const NPC_MARDUK_BLACKPOOL = 10433;
export const NPC_DARKMASTER_GANDLING = 1853;
export const NPC_JANDICE_BAROV = 10503;
export const NPC_RISEN_GUARDIAN = 11598;
export const NPC_SCHOLOMANCE_STUDENT = 10475;
export const NPC_SPECTRAL_TUTOR = 10498;

// scholomance.h:46–55 GOs
export const GO_GATE_KIRTONOS = 175570;
export const GO_VIEWING_ROOM_DOOR = 175167;
export const GO_GATE_RAS = 177370;
export const GO_GATE_MALICIA = 177375;
export const GO_GATE_THEOLEN = 177377;
export const GO_GATE_POLKELT = 177376;
export const GO_GATE_RAVENIAN = 177372;
export const GO_GATE_BAROV = 177373;
export const GO_GATE_ILLUCIA = 177371;
export const GO_GATE_GANDLING = 177374;

// scholomance.h:59–66 event ids
export const EVENT_ID_POLKELT = 5618;
export const EVENT_ID_THEOLEN = 5619;
export const EVENT_ID_MALICIA = 5620;
export const EVENT_ID_ILLUCIA = 5621;
export const EVENT_ID_BAROV = 5622;
export const EVENT_ID_RAVENIAN = 5623;
export const EVENT_ID_DAWN_GAMBIT = 5140;

// scholomance.h:70–74 texts / spells (instance-side)
export const SAY_GANDLING_SPAWN = -1289000;
export const YELL_VECTUS_GAMBIT = -1289001;
export const SPELL_STUDENT_TRANSFORM = 18115;
export const SPELL_XMAS_GANDLING = 26199;

// boss_darkmaster_gandling.cpp:31–34
export const SPELL_ARCANE_MISSILES = 15790;
export const SPELL_SHADOW_SHIELD = 12040;
export const SPELL_CURSE_SD = 18702;
export const SPELL_SHADOW_PORTAL = 17950;

// boss_jandice_barov.cpp:30–34
export const SPELL_CURSE_OF_BLOOD = 16098;
export const SPELL_SPREAD_ILLUSIONS = 17772;
export const SPELL_SUMMON_ILLUSIONS = 17773;
export const SPELL_SPREAD_JANDICE = 17774;
export const SPELL_BANISH = 8994;

/** Illusion of Jandice Barov. Cite: 17773 EffectMiscValue=11439; survey 18-scholomance.md */
export const NPC_ILLUSION_OF_JANDICE = 11439;

// Summon count from 17773 EffectBasePoints1=14 + dieSides1=1 → 15. Cite: spell-data 17773 rawEffects
// effect=42 basePoints=14 miscValue=11439
export const JANDICE_ILLUSION_COUNT = 15;

// Jandice hide duration (Spread 17774 DurationIndex 31 → 8000 ms). Survey: "blinks invisible 8s". Cite:
// FALLBACK_DURATION_MS[31]=8000; survey line 150.
export const JANDICE_HIDE_DURATION_MS = FALLBACK_DURATION_MS[31]!;

// scholomance.cpp:38–42 npc_spectral_tutor
export const SPELL_IMAGE_PROJECTION = 17651;
export const SPELL_IMAGE_PROJECTION_HEAL = 17652;
export const SPELL_IMAGE_PROJECTION_SUMMON = 17653;
export const SPELL_MANA_BURN = 17630;
export const SPELL_SILENCE = 12528;

/** Spectral Projection summon entry. Cite: 17653 EffectMiscValue=11263 */
export const NPC_SPECTRAL_PROJECTION = 11263;

// Summon count from 17653 EffectBasePoints1=4 + dieSides1=1 → 5. Cite: spell-data 17653 rawEffects
// effect=42 basePoints=4 miscValue=11263
export const SPECTRAL_PROJECTION_COUNT = 5;

// Image Projection aura duration (DurationIndex 32 → 6000 ms). Cite: FALLBACK_DURATION_MS[32]=6000;
// spell-refs-payload 17651 DurationIndex=32
export const IMAGE_PROJECTION_DURATION_MS = FALLBACK_DURATION_MS[32]!;

// Dawn's Gambit transform delay. Cite: instance_scholomance.cpp:444 m_uiGambitTransformTimer = 12 *
// IN_MILLISECONDS
export const DAWN_GAMBIT_TRANSFORM_MS = 12_000;

// boss_darkmaster_gandling

// boss_darkmaster_gandling, creature 1853. Arcane Missiles 4.5s/8s, Shadow Shield 12s/14–28s,
// Curse 2s/15–27s, Shadow Portal 16s/20–35s while HP > 3%. The isolation rooms are InstanceDef.
export const BOSS_DARKMASTER_GANDLING: ScriptDevIR = {
  name: 'boss_darkmaster_gandling',
  boundCreatures: [NPC_DARKMASTER_GANDLING],
  sourceFile: 'eastern_kingdoms/scholomance/boss_darkmaster_gandling.cpp',
  // Arcane Missiles 15790 ticks 15791; a trigger payload resolves off the kit.
  spellIds: [
    SPELL_ARCANE_MISSILES,
    SPELL_SHADOW_SHIELD,
    SPELL_CURSE_SD,
    SPELL_SHADOW_PORTAL, 15791,
  ],
  timers: [
    {
      id: 'arcane_missiles',
      spellId: SPELL_ARCANE_MISSILES,
      // Reset m_uiArcaneMissilesTimer = 4500 (cpp:54)
      initialMinMs: 4500,
      initialMaxMs: 4500,
      // CAST_OK re-arm 8000 (cpp:69)
      repeatMinMs: 8000,
      repeatMaxMs: 8000,
      target: 'victim',
      cite: 'boss_darkmaster_gandling.cpp:54,66-72',
    },
    {
      id: 'shadow_shield',
      spellId: SPELL_SHADOW_SHIELD,
      // Reset m_uiShadowShieldTimer = 12000 (cpp:55)
      initialMinMs: 12_000,
      initialMaxMs: 12_000,
      // CAST_OK re-arm urand(14000, 28000) (cpp:78)
      repeatMinMs: 14_000,
      repeatMaxMs: 28_000,
      target: 'self',
      cite: 'boss_darkmaster_gandling.cpp:55,75-81',
    },
    {
      id: 'curse_darkmaster',
      spellId: SPELL_CURSE_SD,
      // Reset m_uiCurseTimer = 2000 (cpp:56)
      initialMinMs: 2000,
      initialMaxMs: 2000,
      // CAST_OK re-arm urand(15000, 27000) (cpp:87)
      repeatMinMs: 15_000,
      repeatMaxMs: 27_000,
      target: 'victim',
      cite: 'boss_darkmaster_gandling.cpp:56,84-90',
    },
    {
      id: 'shadow_portal',
      spellId: SPELL_SHADOW_PORTAL,
      // Reset m_uiTeleportTimer = 16000 (cpp:57)
      initialMinMs: 16_000,
      initialMaxMs: 16_000,
      // CAST_OK re-arm urand(20000, 35000) (cpp:106)
      repeatMinMs: 20_000,
      repeatMaxMs: 35_000,
      // SelectAttackingTarget(RANDOM, 0, SPELL_SHADOW_PORTAL, SELECT_FLAG_PLAYER) (cpp:98)
      target: 'hostile_random_player',
      select: { playerOnly: true },
      // GetHealthPercent() > 3.0f (cpp:94) → TIMER_IN_COMBAT hp band [3, 100]
      hpPctMax: 100,
      hpPctMin: 3,
      // Bake spell 17950 is SPELL_EFFECT_DUMMY only, with empty effects[], so FORCE_CAST keeps
      // canCast from dropping the ScriptDev schedule. Cite: UnitAI.h CAST_FORCE_CAST.
      castFlags: CAST_FLAG.FORCE_CAST,
      cite: 'boss_darkmaster_gandling.cpp:57,92-112 portal only while HP>3%',
    },
  ],
  lifecycle: {
    onAggro: [
      {
        kind: 'set_instance_data',
        field: TYPE_GANDLING,
        value: INSTANCE_DATA.IN_PROGRESS,
        cite: 'instance_scholomance.cpp:338 OnCreatureEnterCombat NPC_DARKMASTER_GANDLING',
      },
    ],
    onDeath: [
      {
        kind: 'set_instance_data',
        field: TYPE_GANDLING,
        value: INSTANCE_DATA.DONE,
        cite: 'instance_scholomance.cpp:403 OnCreatureDeath NPC_DARKMASTER_GANDLING',
      },
    ],
    onEvade: [
      {
        kind: 'set_instance_data',
        field: TYPE_GANDLING,
        value: INSTANCE_DATA.FAIL,
        cite: 'instance_scholomance.cpp:370 OnCreatureEvade NPC_DARKMASTER_GANDLING',
      },
    ],
  },
  cites: [
    'boss_darkmaster_gandling.cpp:28-129',
    'boss_darkmaster_gandling.cpp:52-58 Reset',
    'boss_darkmaster_gandling.cpp:66-112 UpdateAI',
    'scholomance.h:43 NPC_DARKMASTER_GANDLING=1853',
  ],
};

// boss_jandice_barov

// boss_jandice_barov, creature 10503. Curse of Blood 5s/30–35s, Banish 9–13s/17–21s, Summon
// Illusions 15s/25s with Spread Jandice on CAST_OK. Each illusion self-casts 17772.
export const BOSS_JANDICE_BAROV: ScriptDevIR = {
  name: 'boss_jandice_barov',
  boundCreatures: [NPC_JANDICE_BAROV],
  sourceFile: 'eastern_kingdoms/scholomance/boss_jandice_barov.cpp',
  spellIds: [
    SPELL_CURSE_OF_BLOOD,
    SPELL_SPREAD_ILLUSIONS,
    SPELL_SUMMON_ILLUSIONS,
    SPELL_SPREAD_JANDICE,
    SPELL_BANISH,
  ],
  lifecycle: {
    justSummoned: [
      {
        kind: 'cast_self',
        spellId: SPELL_SPREAD_ILLUSIONS,
        cite: 'boss_jandice_barov.cpp:52-55 JustSummoned SPELL_SPREAD_ILLUSIONS',
      },
    ],
  },
  timers: [
    {
      id: 'curse_of_blood',
      spellId: SPELL_CURSE_OF_BLOOD,
      // Reset m_uiCurseOfBloodTimer = 5000 (cpp:47)
      initialMinMs: 5000,
      initialMaxMs: 5000,
      // CAST_OK re-arm urand(30000, 35000) (cpp:67)
      repeatMinMs: 30_000,
      repeatMaxMs: 35_000,
      target: 'self',
      cite: 'boss_jandice_barov.cpp:47,64-70',
    },
    {
      id: 'banish',
      spellId: SPELL_BANISH,
      // Reset m_uiBanishTimer = urand(9000, 13000) (cpp:49)
      initialMinMs: 9000,
      initialMaxMs: 13_000,
      // CAST_OK re-arm urand(17000, 21000) (cpp:78)
      repeatMinMs: 17_000,
      repeatMaxMs: 21_000,
      // SelectAttackingTarget(RANDOM, 1) (cpp:75)
      target: 'hostile_random_not_top',
      select: { skipTopThreat: true },
      cite: 'boss_jandice_barov.cpp:49,73-82',
    },
    {
      id: 'summon_illusions',
      spellId: SPELL_SUMMON_ILLUSIONS,
      // Reset m_uiIllusionTimer = 15000 (cpp:48)
      initialMinMs: 15_000,
      initialMaxMs: 15_000,
      // CAST_OK re-arm 25000 (cpp:90)
      repeatMinMs: 25_000,
      repeatMaxMs: 25_000,
      target: 'self',
      cite: 'boss_jandice_barov.cpp:48,85-95',
    },
  ],
  auraScripts: [
    {
      // On CAST_OK 17773: host injects 15×11439 from raw effect 42; hide via 17774 8s.
      // Cite: boss_jandice_barov.cpp:88-91 DoCast SPELL_SUMMON_ILLUSIONS + SPELL_SPREAD_JANDICE
      spellId: SPELL_SUMMON_ILLUSIONS,
      durationMs: JANDICE_HIDE_DURATION_MS,
      onApply: [
        {
          kind: 'cast_helper',
          spellId: SPELL_SPREAD_JANDICE,
          on: 'aura_target',
          cite: 'boss_jandice_barov.cpp:91 DoCastSpellIfCan SPELL_SPREAD_JANDICE',
        },
        {
          kind: 'set_unattackable',
          on: 'aura_target',
          cite: 'boss_jandice_barov.cpp:87 hide into illusions 8s; survey 18-scholomance.md:150',
        },
        {
          kind: 'flavor',
          text: 'scatters into illusions!',
          cite: 'boss_jandice_barov.cpp:87-91 Summon Illusions + Spread Jandice',
        },
      ],
      onRemove: [
        {
          kind: 'clear_unattackable',
          on: 'aura_target',
          cite: 'product: end of 8s hide duration (DurationIndex 31 on 17774)',
        },
      ],
      cite: 'boss_jandice_barov.cpp:85-95 Illusion_Timer; JustSummoned via lifecycle',
    },
  ],
  cites: [
    'boss_jandice_barov.cpp:28-112',
    'boss_jandice_barov.cpp:45-50 Reset',
    'boss_jandice_barov.cpp:64-95 UpdateAI',
    'boss_jandice_barov.cpp:52-55 JustSummoned SPELL_SPREAD_ILLUSIONS',
  ],
};

// npc_spectral_tutor

// npc_spectral_tutor, creature 10498. Mana Burn 4–19s/9–26s, Silence 0–3s/12–26s, Image
// Projection 12–13s/18–25s, which casts 17653 and blocks evade for its 1000 ms window.
export const NPC_SPECTRAL_TUTOR_SCRIPT: ScriptDevIR = {
  name: 'npc_spectral_tutor',
  boundCreatures: [NPC_SPECTRAL_TUTOR],
  sourceFile: 'eastern_kingdoms/scholomance/scholomance.cpp',
  spellIds: [
    SPELL_IMAGE_PROJECTION,
    SPELL_IMAGE_PROJECTION_HEAL,
    SPELL_IMAGE_PROJECTION_SUMMON,
    SPELL_MANA_BURN,
    SPELL_SILENCE,
  ],
  timers: [
    {
      id: 'mana_burn',
      spellId: SPELL_MANA_BURN,
      // Reset m_uiManaBurnTimer = urand(4000, 19000) (cpp:57)
      initialMinMs: 4000,
      initialMaxMs: 19_000,
      // CAST_OK re-arm urand(9000, 26000) (cpp:92)
      repeatMinMs: 9000,
      repeatMaxMs: 26_000,
      target: 'victim',
      cite: 'scholomance.cpp:57,89-95',
    },
    {
      id: 'silence',
      spellId: SPELL_SILENCE,
      // Reset m_uiSilenceTimer = urand(0, 3000) (cpp:58)
      initialMinMs: 0,
      initialMaxMs: 3000,
      // CAST_OK re-arm urand(12000, 26000) (cpp:100)
      repeatMinMs: 12_000,
      repeatMaxMs: 26_000,
      target: 'self',
      cite: 'scholomance.cpp:58,97-103',
    },
    {
      id: 'image_projection',
      spellId: SPELL_IMAGE_PROJECTION,
      // Reset m_uiProjectionTimer = urand(12000, 13000) (cpp:59)
      initialMinMs: 12_000,
      initialMaxMs: 13_000,
      // CAST_OK re-arm urand(18000, 25000) (cpp:111)
      repeatMinMs: 18_000,
      repeatMaxMs: 25_000,
      target: 'self',
      cite: 'scholomance.cpp:59,105-115',
    },
  ],
  auraScripts: [
    {
      // On 17651: summon projections TRIGGERED + heal after 1s (collapsed) + uninteractible 6s.
      // Cite: scholomance.cpp:107-111; DurationIndex 32 → 6000 ms
      spellId: SPELL_IMAGE_PROJECTION,
      durationMs: IMAGE_PROJECTION_DURATION_MS,
      onApply: [
        {
          kind: 'cast_helper',
          spellId: SPELL_IMAGE_PROJECTION_SUMMON,
          on: 'aura_target',
          cite: 'scholomance.cpp:109 DoCastSpellIfCan SPELL_IMAGE_PROJECTION_SUMMON CAST_TRIGGERED',
        },
        {
          // 1s ProjEndTimer (cpp:110) collapsed — same tick as projection land (Doan detonation pattern).
          kind: 'cast_helper',
          spellId: SPELL_IMAGE_PROJECTION_HEAL,
          on: 'aura_target',
          cite: 'scholomance.cpp:79,110 m_uiProjEndTimer=1000 → SPELL_IMAGE_PROJECTION_HEAL',
        },
        {
          kind: 'set_unattackable',
          on: 'aura_target',
          cite: 'scholomance.cpp:75-87 no other AI during projection; DurationIndex 32 = 6s',
        },
        {
          kind: 'flavor',
          text: 'projects spectral images!',
          cite: 'scholomance.cpp:105-111 Image Projection + Summon Spectral Projections',
        },
      ],
      onRemove: [
        {
          kind: 'clear_unattackable',
          on: 'aura_target',
          cite: 'product: end of Image Projection duration (DurationIndex 32)',
        },
      ],
      cite: 'scholomance.cpp:75-115 Image Projection chain',
    },
  ],
  cites: [
    'scholomance.cpp:32-132',
    'scholomance.cpp:54-60 Reset',
    'scholomance.cpp:70-118 UpdateAI',
    'scholomance.cpp:62-68 EnterEvadeMode blocked during ProjEnd',
  ],
};

// event_spell_gandling_shadow_portal

// ProcessEventId_event_spell_gandling_shadow_portal: events 5618–5623 close the matching classroom
// gate and arm the Risen Guardian summons. An event script with no creature binding.
export const EVENT_SPELL_GANDLING_SHADOW_PORTAL: ScriptDevIR = {
  name: 'event_spell_gandling_shadow_portal',
  boundCreatures: [],
  sourceFile: 'eastern_kingdoms/scholomance/instance_scholomance.cpp',
  spellIds: [],
  timers: [],
  // Model as goUse-shaped event arm (no GO) matching event_spell_unlocking pattern.
  goUse: {
    goEntries: [],
    actions: [
      {
        kind: 'flavor',
        text: 'Shadow Portal seals a classroom and summons Risen Guardians!',
        cite: 'instance_scholomance.cpp:489 HandlePortalEvent(uiEventId, SPECIAL); return false → DB summon',
      },
    ],
    cite: 'instance_scholomance.cpp:476-496 event_spell_gandling_shadow_portal events 5618-5623',
  },
  unusedBindings: [
    {
      entry: 0,
      kind: 'creature',
      reason:
        'event_spell_gandling_shadow_portal is a ProcessEventId script (events 5618–5623) with no creature_template.ScriptName binding - corpus boundCreatures []. Portal room summons are DB dbscripts_on_event; product InstanceDef waves stand in on the Gandling encounter.',
      cite: 'instance_scholomance.cpp:518-521 RegisterSelf pProcessEventId; scholomance.h:59-64 EVENT_ID_*',
    },
  ],
  cites: [
    'instance_scholomance.cpp:476-496',
    'instance_scholomance.cpp:264-293 HandlePortalEvent',
    'scholomance.h:59-64 aGandlingEvents 5618-5623',
  ],
};

// event_dawn_gambit

// ProcessEventId_dawn_gambit, event 5140: the first call arms a 12 s timer and the second flips the
// Viewing Room students hostile. SPELL_STUDENT_TRANSFORM 18115 is still missing from the bake.
export const EVENT_DAWN_GAMBIT: ScriptDevIR = {
  name: 'event_dawn_gambit',
  boundCreatures: [],
  sourceFile: 'eastern_kingdoms/scholomance/instance_scholomance.cpp',
  spellIds: [],
  timers: [],
  goUse: {
    goEntries: [],
    actions: [
      {
        kind: 'flavor',
        text: "Dawn's Gambit arms - students transform in 12 seconds!",
        cite: 'instance_scholomance.cpp:442-445 first HandleDawnGambitEvent → timer 12s',
      },
      {
        kind: 'yell',
        textId: YELL_VECTUS_GAMBIT,
        cite: 'instance_scholomance.cpp:467 DoScriptText YELL_VECTUS_GAMBIT on transform',
      },
    ],
    cite: 'instance_scholomance.cpp:498-509 ProcessEventId_dawn_gambit EVENT_ID_DAWN_GAMBIT=5140',
  },
  unusedBindings: [
    {
      entry: 0,
      kind: 'creature',
      reason:
        'event_dawn_gambit is a ProcessEventId script (event 5140) with no creature_template.ScriptName - corpus boundCreatures []. Student transform spell 18115 absent from spell bake (not in corpus spellIds); Viewing Room faction flip remains InstanceDef GAP [dawns-gambit].',
      cite: 'instance_scholomance.cpp:523-526 RegisterSelf; scholomance.h:66 EVENT_ID_DAWN_GAMBIT=5140; :73 SPELL_STUDENT_TRANSFORM=18115',
    },
  ],
  cites: [
    'instance_scholomance.cpp:440-469 HandleDawnGambitEvent',
    'instance_scholomance.cpp:498-509 ProcessEventId_dawn_gambit',
    'scholomance.h:66,71,73',
  ],
};

// instance_scholomance

// instance_scholomance, m_auiEncounter[10]: Kirtonos, Rattlegore, Ras, the six mini-bosses and
// Gandling, whose spawn follows all six DONE. Bound via instance_template map 289 only.
export const INSTANCE_SCHOLOMANCE: ScriptDevIR = {
  name: 'instance_scholomance',
  boundCreatures: [],
  sourceFile: 'eastern_kingdoms/scholomance/instance_scholomance.cpp',
  spellIds: [],
  timers: [],
  encounters: [
    {
      creatureEntry: NPC_KIRTONOS,
      field: TYPE_KIRTONOS,
      onDeath: INSTANCE_DATA.DONE,
      onAggro: INSTANCE_DATA.IN_PROGRESS,
      onEvade: INSTANCE_DATA.FAIL,
      cite: 'instance_scholomance.cpp:328,361,394 NPC_KIRTONOS; h:15 TYPE_KIRTONOS=0',
    },
    {
      creatureEntry: NPC_RATTLEGORE,
      field: TYPE_RATTLEGORE,
      onDeath: INSTANCE_DATA.DONE,
      onAggro: INSTANCE_DATA.IN_PROGRESS,
      onEvade: INSTANCE_DATA.FAIL,
      cite: 'instance_scholomance.cpp:329,362,395 NPC_RATTLEGORE; h:16 TYPE_RATTLEGORE=1',
    },
    {
      creatureEntry: NPC_RAS_FROSTWHISPER,
      field: TYPE_RAS_FROSTWHISPER,
      onDeath: INSTANCE_DATA.DONE,
      onAggro: INSTANCE_DATA.IN_PROGRESS,
      onEvade: INSTANCE_DATA.FAIL,
      cite: 'instance_scholomance.cpp:330,363,396 NPC_RAS_FROSTWHISPER; h:17',
    },
    {
      creatureEntry: NPC_INSTRUCTOR_MALICIA,
      field: TYPE_MALICIA,
      onDeath: INSTANCE_DATA.DONE,
      onAggro: INSTANCE_DATA.IN_PROGRESS,
      onEvade: INSTANCE_DATA.FAIL,
      cite: 'instance_scholomance.cpp:337,369,402 NPC_INSTRUCTOR_MALICIA; h:18',
    },
    {
      creatureEntry: NPC_THEOLEN_KRASTINOV,
      field: TYPE_THEOLEN,
      onDeath: INSTANCE_DATA.DONE,
      onAggro: INSTANCE_DATA.IN_PROGRESS,
      onEvade: INSTANCE_DATA.FAIL,
      cite: 'instance_scholomance.cpp:331,364,397 NPC_THEOLEN_KRASTINOV; h:19',
    },
    {
      creatureEntry: NPC_LOREKEEPER_POLKELT,
      field: TYPE_POLKELT,
      onDeath: INSTANCE_DATA.DONE,
      onAggro: INSTANCE_DATA.IN_PROGRESS,
      onEvade: INSTANCE_DATA.FAIL,
      cite: 'instance_scholomance.cpp:332,365,398 NPC_LOREKEEPER_POLKELT; h:20',
    },
    {
      creatureEntry: NPC_RAVENIAN,
      field: TYPE_RAVENIAN,
      onDeath: INSTANCE_DATA.DONE,
      onAggro: INSTANCE_DATA.IN_PROGRESS,
      onEvade: INSTANCE_DATA.FAIL,
      cite: 'instance_scholomance.cpp:333,366,399 NPC_RAVENIAN; h:21',
    },
    {
      creatureEntry: NPC_ALEXEI_BAROV,
      field: TYPE_ALEXEI_BAROV,
      onDeath: INSTANCE_DATA.DONE,
      onAggro: INSTANCE_DATA.IN_PROGRESS,
      onEvade: INSTANCE_DATA.FAIL,
      cite: 'instance_scholomance.cpp:336,368,401 NPC_ALEXEI_BAROV; h:22',
    },
    {
      creatureEntry: NPC_ILLUCIA_BAROV,
      field: TYPE_ILLUCIA_BAROV,
      onDeath: INSTANCE_DATA.DONE,
      onAggro: INSTANCE_DATA.IN_PROGRESS,
      onEvade: INSTANCE_DATA.FAIL,
      cite: 'instance_scholomance.cpp:334,367,400 NPC_ILLUCIA_BAROV; h:23',
    },
    {
      creatureEntry: NPC_DARKMASTER_GANDLING,
      field: TYPE_GANDLING,
      onDeath: INSTANCE_DATA.DONE,
      onAggro: INSTANCE_DATA.IN_PROGRESS,
      onEvade: INSTANCE_DATA.FAIL,
      cite: 'instance_scholomance.cpp:338,370,403 NPC_DARKMASTER_GANDLING; h:24',
    },
  ],
  doors: [
    {
      field: TYPE_KIRTONOS,
      goEntry: GO_GATE_KIRTONOS,
      // cpp:166-169 uses door on FAIL/DONE and re-aggro after wipe; open on DONE|FAIL|IN_PROGRESS
      openOn: [INSTANCE_DATA.DONE, INSTANCE_DATA.FAIL, INSTANCE_DATA.IN_PROGRESS],
      cite: 'instance_scholomance.cpp:165-169 DoUseDoorOrButton GO_GATE_KIRTONOS',
    },
    {
      field: TYPE_RAS_FROSTWHISPER,
      goEntry: GO_GATE_RAS,
      openOn: [INSTANCE_DATA.DONE, INSTANCE_DATA.FAIL, INSTANCE_DATA.IN_PROGRESS],
      cite: 'instance_scholomance.cpp:179-181 DoUseDoorOrButton GO_GATE_RAS',
    },
    {
      field: TYPE_MALICIA,
      goEntry: GO_GATE_MALICIA,
      openOn: [INSTANCE_DATA.DONE, INSTANCE_DATA.FAIL, INSTANCE_DATA.IN_PROGRESS],
      cite: 'instance_scholomance.cpp:183-186 EVENT_ID_MALICIA door',
    },
    {
      field: TYPE_THEOLEN,
      goEntry: GO_GATE_THEOLEN,
      openOn: [INSTANCE_DATA.DONE, INSTANCE_DATA.FAIL, INSTANCE_DATA.IN_PROGRESS],
      cite: 'instance_scholomance.cpp:187-189 EVENT_ID_THEOLEN door',
    },
    {
      field: TYPE_POLKELT,
      goEntry: GO_GATE_POLKELT,
      openOn: [INSTANCE_DATA.DONE, INSTANCE_DATA.FAIL, INSTANCE_DATA.IN_PROGRESS],
      cite: 'instance_scholomance.cpp:191-193 EVENT_ID_POLKELT door',
    },
    {
      field: TYPE_RAVENIAN,
      goEntry: GO_GATE_RAVENIAN,
      openOn: [INSTANCE_DATA.DONE, INSTANCE_DATA.FAIL, INSTANCE_DATA.IN_PROGRESS],
      cite: 'instance_scholomance.cpp:195-197 EVENT_ID_RAVENIAN door',
    },
    {
      field: TYPE_ALEXEI_BAROV,
      goEntry: GO_GATE_BAROV,
      openOn: [INSTANCE_DATA.DONE, INSTANCE_DATA.FAIL, INSTANCE_DATA.IN_PROGRESS],
      cite: 'instance_scholomance.cpp:199-201 EVENT_ID_BAROV door',
    },
    {
      field: TYPE_ILLUCIA_BAROV,
      goEntry: GO_GATE_ILLUCIA,
      openOn: [INSTANCE_DATA.DONE, INSTANCE_DATA.FAIL, INSTANCE_DATA.IN_PROGRESS],
      cite: 'instance_scholomance.cpp:203-205 EVENT_ID_ILLUCIA door',
    },
    {
      field: TYPE_GANDLING,
      goEntry: GO_GATE_GANDLING,
      openOn: [INSTANCE_DATA.DONE, INSTANCE_DATA.FAIL, INSTANCE_DATA.IN_PROGRESS],
      cite: 'instance_scholomance.cpp:208-210 DoUseDoorOrButton GO_GATE_GANDLING',
    },
    {
      // Viewing Room Door opens when Rattlegore DONE (key drop path + reload).
      field: TYPE_RATTLEGORE,
      goEntry: GO_VIEWING_ROOM_DOOR,
      openOn: [INSTANCE_DATA.DONE],
      cite: 'instance_scholomance.cpp:88-91 GO_VIEWING_ROOM_DOOR active when TYPE_RATTLEGORE DONE',
    },
  ],
  unusedBindings: [
    {
      entry: 0,
      kind: 'creature',
      reason:
        'instance_scholomance has no creature_template.ScriptName bindings - bound via instance_template map 289 only (corpus boundCreatures []). OnCreatureCreate stores Gandling/Vectus/Marduk guids and entrance-room packs; those are not ScriptName-bound to this file.',
      cite: 'instance_scholomance.cpp:511-516 RegisterSelf GetInstanceData; scriptdev2 instance_template map 289',
    },
  ],
  cites: [
    'instance_scholomance.cpp:30-527',
    'instance_scholomance.cpp:160-232 SetData',
    'instance_scholomance.cpp:324-427 OnCreatureEnterCombat/Evade/Death',
    'instance_scholomance.cpp:234-262 DoSpawnGandlingIfCan',
    'scholomance.h:8-175',
  ],
};
