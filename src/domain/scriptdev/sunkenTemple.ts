// Sunken Temple ScriptDev IR ports. Source: sunken_temple.cpp, sunken_templeScripts.cpp and the
// header — the instance, the Eranikus AT, Malfurion, the statues, the Avatar and the flames.

import type { ScriptDevIR } from './types.ts';
import { INSTANCE_DATA } from './types.ts';
import { CAST_FLAG } from '../creature/creatureAi.ts';

// Constants — sunken_temple.h

// sunken_temple.h:10–12
export const ST_MAX_ENCOUNTER = 5;
export const ST_MAX_STATUES = 6;
export const ST_MAX_FLAMES = 4;

// sunken_temple.h:14–18
export const TYPE_ATALARION = 0;
export const TYPE_PROTECTORS = 1;
export const TYPE_JAMMALAN = 2;
export const TYPE_MALFURION = 3;
export const TYPE_AVATAR = 4;

// sunken_temple.h:20–26
export const NPC_ATALARION = 8580;
export const NPC_DREAMSCYTH = 5721;
export const NPC_WEAVER = 5720;
export const NPC_JAMMALAN = 5710;
export const NPC_OGOM = 5711;
export const NPC_AVATAR_OF_HAKKAR = 8443;
export const NPC_SHADE_OF_ERANIKUS = 5709;

// sunken_temple.h:29–34 Jammal'an mini-boss protectors
export const NPC_ZOLO = 5712;
export const NPC_GASHER = 5713;
export const NPC_LORO = 5714;
export const NPC_HUKKU = 5715;
export const NPC_ZULLOR = 5716;
export const NPC_MIJAN = 5717;

export const ST_PROTECTORS = [
  NPC_ZOLO,
  NPC_GASHER,
  NPC_LORO,
  NPC_HUKKU,
  NPC_ZULLOR,
  NPC_MIJAN,
] as const;

// Side-store key for m_uiProtectorsRemaining on the shared instanceData Map. GetData only reads
// fields below MAX_ENCOUNTER, so key 5 is never an encounter TYPE_*. Cite: sunken_temple.h:10.
export const ST_PROTECTORS_REMAINING_KEY = ST_MAX_ENCOUNTER;

/** Static protector count (one each of Zolo..Mijan). Cite: sunken_temple.h:29-34; cpp:83-90. */
export const ST_PROTECTORS_COUNT = ST_PROTECTORS.length;

// sunken_temple.h:37–40 Avatar ritual mobs
export const NPC_SHADE_OF_HAKKAR = 8440;
export const NPC_BLOODKEEPER = 8438;
export const NPC_HAKKARI_MINION = 8437;
export const NPC_SUPPRESSOR = 8497;

// sunken_temple.h:42
export const NPC_MALFURION = 15362;

// sunken_temple.h:44–63 GOs
export const GO_ALTAR_OF_HAKKAR = 148836;
export const GO_IDOL_OF_HAKKAR = 148838;
export const GO_ATALAI_LIGHT = 148883;
export const GO_ATALAI_LIGHT_BIG = 148937;
export const GO_ATALAI_TRAP_1 = 177484;
export const GO_ATALAI_TRAP_2 = 177485;
export const GO_ATALAI_TRAP_3 = 148837;
export const GO_ETERNAL_FLAME_1 = 148418;
export const GO_ETERNAL_FLAME_2 = 148419;
export const GO_ETERNAL_FLAME_3 = 148420;
export const GO_ETERNAL_FLAME_4 = 148421;
export const GO_EVIL_CIRCLE = 148998;
export const GO_HAKKAR_DOOR_1 = 149432;
export const GO_HAKKAR_DOOR_2 = 149433;
export const GO_JAMMALAN_BARRIER = 149431;

export const GO_ETERNAL_FLAMES = [
  GO_ETERNAL_FLAME_1,
  GO_ETERNAL_FLAME_2,
  GO_ETERNAL_FLAME_3,
  GO_ETERNAL_FLAME_4,
] as const;

// sunken_temple.h:66–71 statue activation event ids (order S,N,SW,SE,NW,NE)
export const EVENT_ID_STATUE_1 = 3094;
export const EVENT_ID_STATUE_2 = 3095;
export const EVENT_ID_STATUE_3 = 3097;
export const EVENT_ID_STATUE_4 = 3098;
export const EVENT_ID_STATUE_5 = 3099;
export const EVENT_ID_STATUE_6 = 3100;

// Required statue activation order. Cite: sunken_temple.h:91–92 m_aAtalaiStatueEvents; comment "S, N, SW,
// SE, NW, NE"
export const ATALAI_STATUE_EVENT_ORDER = [
  EVENT_ID_STATUE_1,
  EVENT_ID_STATUE_2,
  EVENT_ID_STATUE_3,
  EVENT_ID_STATUE_4,
  EVENT_ID_STATUE_5,
  EVENT_ID_STATUE_6,
] as const;

// sunken_temple.h:73–76 spells
/** Suppression aura on Shade of Hakkar during flame douse. Absent from bake (not in S5 payload). */
export const SPELL_SUPPRESSION = 12623;
/** Shade → Avatar morph cast when all 4 flames doused. Absent from bake (not in S5 payload). */
export const SPELL_SUMMON_AVATAR = 12639;
/** Malfurion spawn VFX. Cite: sunken_temple.h:76; sunken_templeScripts.cpp:91 */
export const SPELL_SPIRIT_SPAWN_IN = 17321;

// sunken_temple.h:78–88 texts
export const SAY_JAMMALAN_INTRO = -1109005;
export const SAY_AVATAR_BRAZIER_1 = -1109006;
export const SAY_AVATAR_BRAZIER_2 = -1109007;
export const SAY_AVATAR_BRAZIER_3 = -1109008;
export const SAY_AVATAR_BRAZIER_4 = -1109009;
export const SAY_AVATAR_SPAWN = -1109010;
export const SAY_SUPPRESSOR_1 = -1109011;
export const SAY_SUPPRESSOR_2 = -1109012;
export const SAY_SUPPRESSOR_3 = -1109013;
export const SAY_SUPPRESSOR_4 = -1109014;
export const SAY_AVATAR_DESPAWN = -1109015;

// sunken_templeScripts.cpp:40–41 quest gates for Malfurion AT
export const QUEST_THE_CHARGE_OF_DRAGONFLIGHTS = 8555;
export const QUEST_ERANIKUS_TYRANT_OF_DREAMS = 8733;

// sunken_templeScripts.cpp:69–75 Malfurion speech
export const EMOTE_MALFURION1 = -1109000;
export const SAY_MALFURION1 = -1109001;
export const SAY_MALFURION2 = -1109002;
export const SAY_MALFURION3 = -1109003;
export const SAY_MALFURION4 = -1109004;
export const MAX_MALFURION_TEMPLE_SPEECHES = 6;

// scriptdev2.sql:570 areatrigger; :581 event_avatar
export const AREATRIGGER_SHADE_OF_ERANIKUS = 4016;
export const EVENT_ID_AVATAR_OF_HAKKAR = 8502;

/** Atal'alarion summon position. Cite: sunken_temple.h:99–104 aSunkenTempleLocation[0] */
export const ATALARION_SPAWN_POS = {
  x: -466.513,
  y: 95.1982,
  z: -189.646,
  o: 0.0349,
  cite: 'sunken_temple.h:101 aSunkenTempleLocation[0]',
} as const;

/** Shade of Hakkar summon position (avatar ritual). Cite: sunken_temple.h:102 aSunkenTempleLocation[1] */
export const SHADE_OF_HAKKAR_SPAWN_POS = {
  x: -466.8673,
  y: 272.31204,
  z: -90.7441,
  o: 3.5255,
  cite: 'sunken_temple.h:102 aSunkenTempleLocation[1]',
} as const;

/** Malfurion summon position (Eranikus AT). Cite: sunken_temple.h:103 aSunkenTempleLocation[2] */
export const MALFURION_SPAWN_POS = {
  x: -660.5277,
  y: -16.7117,
  z: -90.8357,
  o: 1.6055,
  cite: 'sunken_temple.h:103 aSunkenTempleLocation[2]',
} as const;

/** Nightmare suppressor door spawn positions. Cite: sunken_temple.h:107–111 aHakkariDoorLocations */
export const HAKKARI_DOOR_SPAWN_POS = [
  { x: -420.629, y: 276.682, z: -90.827, o: 0.0, cite: 'sunken_temple.h:109' },
  { x: -512.015, y: 276.134, z: -90.827, o: 0.0, cite: 'sunken_temple.h:110' },
] as const;

// Avatar event timers — instance_sunken_temple::Update / SetData

// First minion wave delay after TYPE_AVATAR IN_PROGRESS. Cite: sunken_temple.cpp:242 m_uiAvatarSummonTimer
// = 3000
export const AVATAR_SUMMON_INITIAL_MS = 3000;

/** Repeat delay after first Hakkari wave. Cite: sunken_temple.cpp:445 m_uiAvatarSummonTimer = 50000 */
export const AVATAR_SUMMON_FIRST_WAVE_REPEAT_MS = 50_000;

// Later wave re-arm urand(3000, 15000). Cite: sunken_temple.cpp:467 m_uiAvatarSummonTimer = urand(3000,
// 15000)
export const AVATAR_SUMMON_LATER_WAVE_MIN_MS = 3000;
export const AVATAR_SUMMON_LATER_WAVE_MAX_MS = 15_000;

// Suppressor spawn after flame douse (while flames < MAX_FLAMES). Cite: sunken_temple.cpp:227
// m_uiSupressorTimer = urand(15000, 45000)
export const SUPPRESSOR_TIMER_MIN_MS = 15_000;
export const SUPPRESSOR_TIMER_MAX_MS = 45_000;

// Suppression aura fail window when flame used while Shade has SPELL_SUPPRESSION. Cite:
// sunken_temple.cpp:202–203 m_suppressionTimer = 20 * IN_MILLISECONDS
export const SUPPRESSION_FAIL_TIMER_MS = 20_000;

// Malfurion temple speech step delays in ms after the previous step arms: bow 2000, then 12000,
// 12000, 11000, 4000, then the questgiver flag. Cite: sunken_templeScripts.cpp:83, :110–134.
export const MALFURION_SPEECH_STEPS = [
  {
    speech: 0,
    armMs: 3000,
    textId: null as number | null,
    nextArmMs: 2000,
    cite: 'sunken_templeScripts.cpp:83,110-113 case 0 bow; next 2000',
  },
  {
    speech: 1,
    armMs: 2000,
    textId: SAY_MALFURION1,
    nextArmMs: 12_000,
    cite: 'sunken_templeScripts.cpp:114-118 case 1 SAY_MALFURION1; next 12000',
  },
  {
    speech: 2,
    armMs: 12_000,
    textId: SAY_MALFURION2,
    nextArmMs: 12_000,
    cite: 'sunken_templeScripts.cpp:119-122 case 2 SAY_MALFURION2; next 12000',
  },
  {
    speech: 3,
    armMs: 12_000,
    textId: SAY_MALFURION3,
    nextArmMs: 11_000,
    cite: 'sunken_templeScripts.cpp:123-126 case 3 SAY_MALFURION3; next 11000',
  },
  {
    speech: 4,
    armMs: 11_000,
    textId: SAY_MALFURION4,
    nextArmMs: 4000,
    cite: 'sunken_templeScripts.cpp:127-130 case 4 SAY_MALFURION4; next 4000',
  },
  {
    speech: 5,
    armMs: 4000,
    textId: null as number | null,
    nextArmMs: 0,
    cite: 'sunken_templeScripts.cpp:131-134 case 5 enable UNIT_NPC_FLAG_QUESTGIVER',
  },
] as const;

// Pure helpers — ProcessStatueEvent (stateful counter)

// Port of instance_sunken_temple::ProcessStatueEvent: the correct statue increments the counter and
// six completes it, while a wrong one returns false so the caller fires a trap. Cite: cpp:329–354.
export function processAtalaiStatueEvent(
  statueCounter: number,
  eventId: number,
): { ok: boolean; nextCounter: number; complete: boolean } {
  const expected = ATALAI_STATUE_EVENT_ORDER[statueCounter];
  if (expected == null || eventId !== expected) {
    return { ok: false, nextCounter: statueCounter, complete: false };
  }
  const nextCounter = statueCounter + 1;
  return {
    ok: true,
    nextCounter,
    complete: nextCounter === ST_MAX_STATUES,
  };
}

// go_eternal_flame

// GOUse_go_eternal_flame on GO 148418–148421: only while TYPE_AVATAR is IN_PROGRESS, it sets
// SPECIAL and locks the GO. The fourth flame summons the Avatar. Cite: cpp:214–229.
export const GO_ETERNAL_FLAME: ScriptDevIR = {
  name: 'go_eternal_flame',
  boundCreatures: [],
  boundGos: [...GO_ETERNAL_FLAMES],
  sourceFile: 'eastern_kingdoms/sunken_temple/sunken_templeScripts.cpp',
  spellIds: [],
  timers: [],
  goUse: {
    goEntries: [...GO_ETERNAL_FLAMES],
    gates: [
      {
        field: TYPE_AVATAR,
        equals: INSTANCE_DATA.IN_PROGRESS,
        cite: 'sunken_templeScripts.cpp:221 GetData(TYPE_AVATAR) != IN_PROGRESS → return false',
      },
    ],
    actions: [
      {
        kind: 'set_instance_data',
        field: TYPE_AVATAR,
        value: INSTANCE_DATA.SPECIAL,
        cite: 'sunken_templeScripts.cpp:225 SetData(TYPE_AVATAR, SPECIAL)',
      },
    ],
    cite: 'sunken_templeScripts.cpp:214-229 GOUse_go_eternal_flame',
  },
  cites: [
    'sunken_templeScripts.cpp:214-229',
    'sunken_temple.cpp:194-229 TYPE_AVATAR SPECIAL flame counter + suppressor timer',
    'sunken_temple.h:54-57 GO_ETERNAL_FLAME_1..4',
    'scriptdev2.sql:579',
  ],
};

// event_avatar_of_hakkar

// ProcessEventId_event_avatar_of_hakkar, event 8502: from NOT_STARTED or FAIL it sets IN_PROGRESS,
// which arms the 3000 ms summon and respawns the evil circles. Cite: cpp:193–209.
export const EVENT_AVATAR_OF_HAKKAR: ScriptDevIR = {
  name: 'event_avatar_of_hakkar',
  boundCreatures: [],
  sourceFile: 'eastern_kingdoms/sunken_temple/sunken_templeScripts.cpp',
  spellIds: [],
  timers: [],
  goUse: {
    goEntries: [],
    // C++ accepts when NOT_STARTED OR FAIL (cpp:200–201).
    branches: [
      {
        gate: {
          field: TYPE_AVATAR,
          equals: INSTANCE_DATA.NOT_STARTED,
          cite: 'sunken_templeScripts.cpp:200 GetData(TYPE_AVATAR) == NOT_STARTED',
        },
        actions: [
          {
            kind: 'set_instance_data',
            field: TYPE_AVATAR,
            value: INSTANCE_DATA.IN_PROGRESS,
            cite: 'sunken_templeScripts.cpp:203 SetData(TYPE_AVATAR, IN_PROGRESS)',
          },
          {
            kind: 'summon_count',
            creatureEntry: NPC_SHADE_OF_HAKKAR,
            count: 1,
            cite: 'sunken_temple.cpp:250 SummonCreature(NPC_SHADE_OF_HAKKAR, aSunkenTempleLocation[1])',
          },
        ],
        cite: 'sunken_templeScripts.cpp:200-203 NOT_STARTED → IN_PROGRESS',
      },
      {
        gate: {
          field: TYPE_AVATAR,
          equals: INSTANCE_DATA.FAIL,
          cite: 'sunken_templeScripts.cpp:200 GetData(TYPE_AVATAR) == FAIL',
        },
        actions: [
          {
            kind: 'set_instance_data',
            field: TYPE_AVATAR,
            value: INSTANCE_DATA.IN_PROGRESS,
            cite: 'sunken_templeScripts.cpp:203 SetData(TYPE_AVATAR, IN_PROGRESS)',
          },
          {
            kind: 'summon_count',
            creatureEntry: NPC_SHADE_OF_HAKKAR,
            count: 1,
            cite: 'sunken_temple.cpp:250 SummonCreature(NPC_SHADE_OF_HAKKAR) after FAIL restart',
          },
        ],
        cite: 'sunken_templeScripts.cpp:200-203 FAIL → IN_PROGRESS',
      },
    ],
    cite: 'sunken_templeScripts.cpp:193-209 ProcessEventId_event_avatar_of_hakkar; event 8502',
  },
  // Shade of Hakkar + ritual adds are summon-only and absent from bake static creatures.
  unusedBindings: [
    {
      entry: NPC_SHADE_OF_HAKKAR,
      kind: 'creature',
      reason:
        'NPC_SHADE_OF_HAKKAR 8440 is summon-only (sunken_temple.cpp:250); absent from product bake static creatures - ritual IR ported; no live-bake unit fight',
      cite: 'sunken_temple.h:37; sunken_temple.cpp:250; loadRealBundle missing 8440',
    },
    {
      entry: NPC_BLOODKEEPER,
      kind: 'creature',
      reason: 'Avatar ritual summon-only (sunken_temple.cpp:441); absent from bake',
      cite: 'sunken_temple.h:38; loadRealBundle missing 8438',
    },
    {
      entry: NPC_HAKKARI_MINION,
      kind: 'creature',
      reason: 'Avatar ritual summon-only (sunken_temple.cpp:436); absent from bake',
      cite: 'sunken_temple.h:39; loadRealBundle missing 8437',
    },
    {
      entry: NPC_SUPPRESSOR,
      kind: 'creature',
      reason: 'Avatar ritual summon-only (sunken_temple.cpp:488); absent from bake',
      cite: 'sunken_temple.h:40; loadRealBundle missing 8497',
    },
  ],
  cites: [
    'sunken_templeScripts.cpp:193-209',
    'sunken_temple.cpp:236-258 TYPE_AVATAR IN_PROGRESS summon shade + 3000ms wave timer',
    'sunken_temple.cpp:242 m_uiAvatarSummonTimer=3000',
    'scriptdev2.sql:581 event 8502',
  ],
};

// event_antalarion_statue_activation

// ProcessEventId_event_antalarion_statue_activation, events 3094/3095/3097–3100. A correct order
// respawns the green light and six sets SPECIAL, spawning Atal'alarion; a wrong one trips a trap.
export const EVENT_ANTALARION_STATUE_ACTIVATION: ScriptDevIR = {
  name: 'event_antalarion_statue_activation',
  boundCreatures: [],
  sourceFile: 'eastern_kingdoms/sunken_temple/sunken_templeScripts.cpp',
  spellIds: [],
  timers: [],
  goUse: {
    goEntries: [],
    gates: [
      {
        field: TYPE_ATALARION,
        equals: INSTANCE_DATA.NOT_STARTED,
        cite: 'sunken_templeScripts.cpp:162 GetData(TYPE_ATALARION) != NOT_STARTED → return true (no-op)',
      },
    ],
    // Default actions after full sequence (host smoke: caller runs processAtalaiStatueEvent
    // then applies SPECIAL when complete). Direct SPECIAL path documents the spawn.
    actions: [
      {
        kind: 'set_instance_data',
        field: TYPE_ATALARION,
        value: INSTANCE_DATA.SPECIAL,
        cite: 'sunken_temple.cpp:351 SetData(TYPE_ATALARION, SPECIAL) when m_uiStatueCounter == MAX_STATUES',
      },
      {
        kind: 'summon_count',
        creatureEntry: NPC_ATALARION,
        count: 1,
        cite: 'sunken_temple.cpp:319 SummonCreature(NPC_ATALARION, aSunkenTempleLocation[0])',
      },
    ],
    cite: 'sunken_templeScripts.cpp:155-188; sunken_temple.cpp:329-354 ProcessStatueEvent',
  },
  cites: [
    'sunken_templeScripts.cpp:155-188',
    'sunken_temple.cpp:329-354 ProcessStatueEvent order m_aAtalaiStatueEvents',
    'sunken_temple.cpp:309-327 DoSpawnAtalarionIfCan',
    'sunken_temple.h:91-92 m_aAtalaiStatueEvents',
    'scriptdev2.sql:573-578 events 3094/3095/3097-3100',
  ],
};

// at_shade_of_eranikus

// AreaTrigger_at_shade_of_eranikus, trigger 4016. Gated on the player's quest 8555/8733 status, it
// summons Malfurion and sets TYPE_MALFURION IN_PROGRESS. Cite: cpp:44–61.
export const AT_SHADE_OF_ERANIKUS: ScriptDevIR = {
  name: 'at_shade_of_eranikus',
  boundCreatures: [],
  sourceFile: 'eastern_kingdoms/sunken_temple/sunken_templeScripts.cpp',
  spellIds: [],
  timers: [],
  goUse: {
    goEntries: [],
    gates: [
      {
        field: TYPE_MALFURION,
        notEquals: INSTANCE_DATA.IN_PROGRESS,
        cite: 'sunken_templeScripts.cpp:53 GetData(TYPE_MALFURION) != IN_PROGRESS',
      },
    ],
    actions: [
      {
        kind: 'summon_count',
        creatureEntry: NPC_MALFURION,
        count: 1,
        cite: 'sunken_templeScripts.cpp:55 SummonCreature(NPC_MALFURION, aSunkenTempleLocation[2])',
      },
      {
        kind: 'set_instance_data',
        field: TYPE_MALFURION,
        value: INSTANCE_DATA.IN_PROGRESS,
        cite: 'sunken_templeScripts.cpp:56 SetData(TYPE_MALFURION, IN_PROGRESS)',
      },
    ],
    cite: 'sunken_templeScripts.cpp:44-61 AreaTrigger_at_shade_of_eranikus; areatrigger 4016',
  },
  cites: [
    'sunken_templeScripts.cpp:44-61',
    'sunken_templeScripts.cpp:40-41 QUEST_THE_CHARGE_OF_DRAGONFLIGHTS=8555 QUEST_ERANIKUS_TYRANT_OF_DREAMS=8733',
    'sunken_temple.h:103 aSunkenTempleLocation[2] Malfurion',
    'scriptdev2.sql:570 areatrigger 4016',
  ],
};

// npc_malfurion_stormrage

// npc_malfurionAI: the constructor emotes and strips questgiver, then a six-step speech sequence
// re-enables it. Creature 15362 is absent from the product bake, so the binding is unused.
export const NPC_MALFURION_STORMRAGE: ScriptDevIR = {
  name: 'npc_malfurion_stormrage',
  boundCreatures: [NPC_MALFURION],
  sourceFile: 'eastern_kingdoms/sunken_temple/sunken_templeScripts.cpp',
  spellIds: [SPELL_SPIRIT_SPAWN_IN],
  timers: [
    {
      id: 'spirit_spawn_in',
      spellId: SPELL_SPIRIT_SPAWN_IN,
      initialMinMs: 0,
      initialMaxMs: 0,
      repeatMinMs: 0,
      repeatMaxMs: 0,
      target: 'self',
      onReset: true,
      castFlags: CAST_FLAG.TRIGGERED,
      cite: 'sunken_templeScripts.cpp:91 DoCastSpellIfCan SPELL_SPIRIT_SPAWN_IN TRIGGERED',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'yell',
        textId: EMOTE_MALFURION1,
        cite: 'sunken_templeScripts.cpp:89 DoScriptText(EMOTE_MALFURION1) dungeon-only ctor',
      },
    ],
  },
  unusedBindings: [
    {
      entry: NPC_MALFURION,
      kind: 'creature',
      reason:
        'creature_template entry 15362 Malfurion Stormrage bound via ScriptName=npc_malfurion_stormrage (scriptdev2.sql:571) but absent from product bake - IR ported; no live-bake unit fight (quest flavor NPC)',
      cite: 'scriptdev2.sql:571; loadRealBundle creatures missing 15362; sunken-temple.ts e5-malfurion omit',
    },
  ],
  cites: [
    'sunken_templeScripts.cpp:78-149 npc_malfurionAI',
    'sunken_templeScripts.cpp:83 m_uiSayTimer(3000) m_uiSpeech(0)',
    'sunken_templeScripts.cpp:91 SPELL_SPIRIT_SPAWN_IN=17321',
    'sunken_templeScripts.cpp:75 MAX_MALFURION_TEMPLE_SPEECHES=6',
    'sunken_templeScripts.cpp:110-134 speech cases',
    'scriptdev2.sql:571',
  ],
};

// Pure helpers — TYPE_PROTECTORS SetData (remaining counter)

export interface StProtectorsSetDataResult {
  /** Remaining after this SetData call. Cite: cpp:165 --m_uiProtectorsRemaining */
  protectorsRemaining: number;
  /** Whether m_auiEncounter[TYPE_PROTECTORS] was written DONE. */
  completed: boolean;
  /** Encounter field writes this call (empty while remaining > 0). */
  writes: Array<{ field: number; value: number }>;
  /** GO 149431 when remaining hits 0. Cite: cpp:169 */
  openDoors: number[];
  flavor: string[];
  cite: string;
}

// Port of instance_sunken_temple::SetData(TYPE_PROTECTORS): each death decrements the count, and
// only zero stores DONE, opens the barrier and un-immunes Jammal'an and Ogom. Cite: cpp:162–178.
export function applyProtectorsSetData(
  store: Map<number, number>,
  uiData: number,
): StProtectorsSetDataResult {
  if (uiData !== INSTANCE_DATA.DONE) {
    return {
      protectorsRemaining: store.get(ST_PROTECTORS_REMAINING_KEY) ?? ST_PROTECTORS_COUNT,
      completed: false,
      writes: [],
      openDoors: [],
      flavor: [],
      cite: 'sunken_temple.cpp:162-178 TYPE_PROTECTORS ignores non-DONE uiData',
    };
  }
  // Already complete (reload / duplicate death) — do not re-open or re-yell.
  if ((store.get(TYPE_PROTECTORS) ?? 0) === INSTANCE_DATA.DONE) {
    store.set(ST_PROTECTORS_REMAINING_KEY, 0);
    return {
      protectorsRemaining: 0,
      completed: true,
      writes: [],
      openDoors: [],
      flavor: [],
      cite: 'sunken_temple.cpp:162-178 TYPE_PROTECTORS already DONE',
    };
  }
  // cpp:83-90 OnCreatureCreate ++m_uiProtectorsRemaining for each of 6; product seeds 6.
  let remaining = store.get(ST_PROTECTORS_REMAINING_KEY);
  if (remaining == null) remaining = ST_PROTECTORS_COUNT;
  // cpp:165 --m_uiProtectorsRemaining
  remaining = Math.max(0, (remaining | 0) - 1);
  store.set(ST_PROTECTORS_REMAINING_KEY, remaining);
  if (remaining !== 0) {
    return {
      protectorsRemaining: remaining,
      completed: false,
      writes: [],
      openDoors: [],
      flavor: [],
      cite: 'sunken_temple.cpp:165-166 remaining>0 → no encounter write / no door',
    };
  }
  // cpp:168-177 remaining==0 → encounter DONE + barrier + yell + un-immune Jammal/Ogom
  store.set(TYPE_PROTECTORS, INSTANCE_DATA.DONE);
  return {
    protectorsRemaining: 0,
    completed: true,
    writes: [{ field: TYPE_PROTECTORS, value: INSTANCE_DATA.DONE }],
    openDoors: [GO_JAMMALAN_BARRIER],
    flavor: [`Jammal'an the Prophet yells! (${SAY_JAMMALAN_INTRO})`],
    cite: 'sunken_temple.cpp:168-177 remaining==0 → DONE + DoUseDoorOrButton(149431) + SAY_JAMMALAN_INTRO + RemoveFlag Jammal/Ogom',
  };
}

// instance_sunken_temple

// instance_sunken_temple, m_auiEncounter[5]: Atal'alarion, the protectors, Jammal'an, Malfurion and
// the Avatar. Bound via instance_template map 109 only, with no creature or GO ScriptName.
export const INSTANCE_SUNKEN_TEMPLE: ScriptDevIR = {
  name: 'instance_sunken_temple',
  boundCreatures: [],
  sourceFile: 'eastern_kingdoms/sunken_temple/sunken_temple.cpp',
  spellIds: [],
  timers: [],
  encounters: [
    {
      creatureEntry: NPC_ATALARION,
      field: TYPE_ATALARION,
      onDeath: INSTANCE_DATA.DONE,
      cite: 'sunken_temple.cpp:133 OnCreatureDeath NPC_ATALARION → TYPE_ATALARION DONE',
    },
    {
      creatureEntry: NPC_JAMMALAN,
      field: TYPE_JAMMALAN,
      onDeath: INSTANCE_DATA.DONE,
      cite: 'sunken_temple.cpp:134 OnCreatureDeath NPC_JAMMALAN → TYPE_JAMMALAN DONE',
    },
    {
      creatureEntry: NPC_AVATAR_OF_HAKKAR,
      field: TYPE_AVATAR,
      onDeath: INSTANCE_DATA.DONE,
      onEvade: INSTANCE_DATA.FAIL,
      cite: 'sunken_temple.cpp:135 death DONE; :117 evade FAIL (with ritual adds)',
    },
    // Each death SetData(TYPE_PROTECTORS, DONE); host applyProtectorsSetData --remaining
    // and only writes DONE + opens 149431 at 0. Cite: sunken_temple.cpp:142-149,162-178.
    {
      creatureEntry: NPC_ZOLO,
      field: TYPE_PROTECTORS,
      onDeath: INSTANCE_DATA.DONE,
      cite: 'sunken_temple.cpp:142-149 NPC_ZOLO..MIJAN → SetData(TYPE_PROTECTORS, DONE)',
    },
    {
      creatureEntry: NPC_GASHER,
      field: TYPE_PROTECTORS,
      onDeath: INSTANCE_DATA.DONE,
      cite: 'sunken_temple.cpp:142-149',
    },
    {
      creatureEntry: NPC_LORO,
      field: TYPE_PROTECTORS,
      onDeath: INSTANCE_DATA.DONE,
      cite: 'sunken_temple.cpp:142-149',
    },
    {
      creatureEntry: NPC_HUKKU,
      field: TYPE_PROTECTORS,
      onDeath: INSTANCE_DATA.DONE,
      cite: 'sunken_temple.cpp:142-149',
    },
    {
      creatureEntry: NPC_ZULLOR,
      field: TYPE_PROTECTORS,
      onDeath: INSTANCE_DATA.DONE,
      cite: 'sunken_temple.cpp:142-149',
    },
    {
      creatureEntry: NPC_MIJAN,
      field: TYPE_PROTECTORS,
      onDeath: INSTANCE_DATA.DONE,
      cite: 'sunken_temple.cpp:142-149',
    },
  ],
  doors: [
    {
      field: TYPE_PROTECTORS,
      goEntry: GO_JAMMALAN_BARRIER,
      openOn: [INSTANCE_DATA.DONE],
      cite: 'sunken_temple.cpp:169 DoUseDoorOrButton(GO_JAMMALAN_BARRIER) when protectors remaining==0; h:63 GO=149431',
    },
    {
      field: TYPE_AVATAR,
      goEntry: GO_HAKKAR_DOOR_1,
      // C++ toggles doors on any non-SPECIAL TYPE_AVATAR write (IN_PROGRESS/FAIL/DONE).
      openOn: [INSTANCE_DATA.IN_PROGRESS, INSTANCE_DATA.FAIL, INSTANCE_DATA.DONE],
      cite: 'sunken_temple.cpp:285 DoUseDoorOrButton(GO_HAKKAR_DOOR_1); h:60 GO=149432',
    },
    {
      field: TYPE_AVATAR,
      goEntry: GO_HAKKAR_DOOR_2,
      openOn: [INSTANCE_DATA.IN_PROGRESS, INSTANCE_DATA.FAIL, INSTANCE_DATA.DONE],
      cite: 'sunken_temple.cpp:286 DoUseDoorOrButton(GO_HAKKAR_DOOR_2); h:61 GO=149433',
    },
  ],
  lifecycle: {
    onDeath: [
      {
        kind: 'yell',
        textId: SAY_JAMMALAN_INTRO,
        cite: 'sunken_temple.cpp:171 DoOrSimulateScriptTextForThisInstance(SAY_JAMMALAN_INTRO, NPC_JAMMALAN) when last protector dies',
      },
    ],
  },
  unusedBindings: [
    {
      entry: NPC_OGOM,
      kind: 'creature',
      reason:
        'NPC_OGOM 5711 is not OnCreatureDeath SetData (sunken_temple.cpp:129-150); immune cleared with Jammal when TYPE_PROTECTORS DONE (cpp:91-96,176-177). Live pull = jammalan-the-prophet pack in sunken-temple.ts ENTRY.ogom',
      cite: 'sunken_temple.h:24 NPC_OGOM=5711; sunken_temple.cpp:91-96,176-177; sunken-temple.ts jammal pack',
    },
  ],
  cites: [
    'sunken_temple.cpp:29-529 instance_sunken_temple body',
    'sunken_temple.cpp:153-307 SetData',
    'sunken_temple.cpp:162-178 TYPE_PROTECTORS remaining + GO_JAMMALAN_BARRIER',
    'sunken_temple.cpp:129-151 OnCreatureDeath',
    'sunken_temple.cpp:109-127 OnCreatureEvade',
    'sunken_temple.cpp:393-516 Update avatar timers',
    'sunken_temple.cpp:242 m_uiAvatarSummonTimer=3000',
    'sunken_temple.cpp:445 first wave repeat 50000',
    'sunken_temple.cpp:467 later wave urand(3000,15000)',
    'sunken_temple.cpp:227 suppressor urand(15000,45000)',
    'sunken_temple.cpp:203 suppression timer 20*IN_MILLISECONDS',
    'sunken_temple.h:8-158',
    'scriptdev2.sql:568 instance_template map=109 (no creature ScriptName binding)',
  ],
};
