// Arathi Highlands ScriptDev IR ports. Source: scripts/eastern_kingdoms/arathi_highlands.cpp —
// npc_professor_phizzlethorpe, npc_kinelory. Never invent timers; every value cites file:line below.

import type { ScriptDevIR } from './types.ts';

// Constants — arathi_highlands.cpp enums

// arathi_highlands.cpp:40–53 professor
export const SAY_PROGRESS_1 = -1000264;
export const SAY_PROGRESS_2 = -1000265;
export const SAY_PROGRESS_3 = -1000266;
export const EMOTE_PROGRESS_4 = -1000267;
export const SAY_AGGRO = -1000268;
export const SAY_PROGRESS_5 = -1000269;
export const SAY_PROGRESS_6 = -1000270;
export const SAY_PROGRESS_7 = -1000271;
export const EMOTE_PROGRESS_8 = -1000272;
export const SAY_PROGRESS_9 = -1000273;

export const FACTION_BOOTY_BAY = 120;
export const QUEST_SUNKEN_TREASURE = 665;
export const ENTRY_VENGEFUL_SURGE = 2776;
export const NPC_PROFESSOR_PHIZZLETHORPE = 2768;

/** TEMPSPAWN_TIMED_OOC_OR_CORPSE_DESPAWN for Vengeful Surge. Cite: cpp:75–76 600000 */
export const VENGEFUL_SURGE_DESPAWN_MS = 600_000;

/** Vengeful Surge spawn positions at professor WP10. Cite: arathi_highlands.cpp:75–76 */
export const VENGEFUL_SURGE_SPAWNS = [
  {
    x: -2056.41,
    y: -2144.01,
    z: 20.59,
    o: 5.7,
    cite: 'arathi_highlands.cpp:75 SummonCreature ENTRY_VENGEFUL_SURGE',
  },
  {
    x: -2050.17,
    y: -2140.02,
    z: 19.54,
    o: 5.17,
    cite: 'arathi_highlands.cpp:76 SummonCreature ENTRY_VENGEFUL_SURGE',
  },
] as const;

// arathi_highlands.cpp:127–144 kinelory
export const SAY_START = -1000948;
export const SAY_REACH_BOTTOM = -1000949;
export const SAY_AGGRO_KINELORY = -1000950;
export const SAY_AGGRO_JORELL = -1000951;
export const SAY_WATCH_BACK = -1000952;
export const EMOTE_BELONGINGS = -1000953;
export const SAY_DATA_FOUND = -1000954;
export const SAY_ESCAPE = -1000955;
export const SAY_FINISH = -1000956;
export const EMOTE_HAND_PACK = -1000957;

export const SPELL_REJUVENATION = 3627;
export const SPELL_BEAR_FORM = 4948;

export const NPC_JORELL = 2733;
export const NPC_QUAE = 2712;
export const NPC_KINELORY = 2713;

export const QUEST_HINTS_NEW_PLAGUE = 660;

// Kinelory Bear Form timer values. Reset: m_uiBearFormTimer = urand(5000, 7000) (cpp:156) CAST_OK re-arm:
// urand(25000, 30000) (cpp:223) Target: self (cpp:222 DoCastSpellIfCan(m_creature, SPELL_BEAR_FORM))
export const KINELORY_BEAR_FORM_INIT_MIN_MS = 5000;
export const KINELORY_BEAR_FORM_INIT_MAX_MS = 7000;
export const KINELORY_BEAR_FORM_REPEAT_MIN_MS = 25_000;
export const KINELORY_BEAR_FORM_REPEAT_MAX_MS = 30_000;

// Kinelory Rejuvenation timer values. Reset: m_uiHealTimer = urand(2000, 5000) (cpp:157) CAST_OK re-arm:
// urand(15000, 25000) (cpp:233) Target: DoSelectLowestHpFriendly(40.0f) (cpp:230–232)
export const KINELORY_HEAL_INIT_MIN_MS = 2000;
export const KINELORY_HEAL_INIT_MAX_MS = 5000;
export const KINELORY_HEAL_REPEAT_MIN_MS = 15_000;
export const KINELORY_HEAL_REPEAT_MAX_MS = 25_000;
/** DoSelectLowestHpFriendly radius. Cite: arathi_highlands.cpp:230 40.0f */
export const KINELORY_HEAL_RADIUS_YD = 40;

// Pure helpers — professor WaypointReached

/** Escort waypoint actions (WaypointReached switch). Cite: arathi_highlands.cpp:62–89 */
export const PHIZZLE_WAYPOINTS = [
  {
    pointId: 5,
    textIds: [SAY_PROGRESS_2] as readonly number[],
    summons: [] as Array<{ creatureEntry: number; spawnIndex: number }>,
    setRun: false,
    questCredit: false,
    cite: 'arathi_highlands.cpp:71 case 5 SAY_PROGRESS_2',
  },
  {
    pointId: 6,
    textIds: [SAY_PROGRESS_3],
    summons: [],
    setRun: false,
    questCredit: false,
    cite: 'arathi_highlands.cpp:72 case 6 SAY_PROGRESS_3',
  },
  {
    pointId: 9,
    textIds: [EMOTE_PROGRESS_4],
    summons: [],
    setRun: false,
    questCredit: false,
    cite: 'arathi_highlands.cpp:73 case 9 EMOTE_PROGRESS_4',
  },
  {
    pointId: 10,
    textIds: [] as readonly number[],
    summons: [
      { creatureEntry: ENTRY_VENGEFUL_SURGE, spawnIndex: 0 },
      { creatureEntry: ENTRY_VENGEFUL_SURGE, spawnIndex: 1 },
    ],
    setRun: false,
    questCredit: false,
    cite: 'arathi_highlands.cpp:74-77 case 10 2× ENTRY_VENGEFUL_SURGE 2776',
  },
  {
    pointId: 11,
    textIds: [SAY_PROGRESS_5],
    summons: [],
    setRun: false,
    questCredit: false,
    cite: 'arathi_highlands.cpp:78 case 11 SAY_PROGRESS_5',
  },
  {
    pointId: 12,
    textIds: [SAY_PROGRESS_6],
    summons: [],
    setRun: true,
    questCredit: false,
    cite: 'arathi_highlands.cpp:79-82 case 12 SAY_PROGRESS_6 + SetRun',
  },
  {
    pointId: 20,
    textIds: [SAY_PROGRESS_7],
    summons: [],
    setRun: false,
    questCredit: false,
    cite: 'arathi_highlands.cpp:83 case 20 SAY_PROGRESS_7',
  },
  {
    pointId: 21,
    textIds: [EMOTE_PROGRESS_8, SAY_PROGRESS_9],
    summons: [],
    setRun: false,
    questCredit: true,
    cite: 'arathi_highlands.cpp:84-88 case 21 EMOTE_PROGRESS_8 + SAY_PROGRESS_9 + Reward 665',
  },
] as const;

export interface PhizzleWaypointResult {
  handled: boolean;
  textIds: number[];
  summons: Array<{
    creatureEntry: number;
    x: number;
    y: number;
    z: number;
    o: number;
    despawnMs: number;
  }>;
  setRun: boolean;
  questId: number | null;
  cite: string;
}

/** Port of npc_professor_phizzlethorpeAI::WaypointReached. Cite: arathi_highlands.cpp:62–89 */
export function phizzleWaypointReached(pointId: number): PhizzleWaypointResult {
  const step = PHIZZLE_WAYPOINTS.find((w) => w.pointId === pointId);
  if (!step) {
    return {
      handled: false,
      textIds: [],
      summons: [],
      setRun: false,
      questId: null,
      cite: 'arathi_highlands.cpp:62-89 no case for this pointId',
    };
  }
  return {
    handled: true,
    textIds: [...step.textIds],
    summons: step.summons.map((s) => {
      const pos = VENGEFUL_SURGE_SPAWNS[s.spawnIndex]!;
      return {
        creatureEntry: s.creatureEntry,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        o: pos.o,
        despawnMs: VENGEFUL_SURGE_DESPAWN_MS,
      };
    }),
    setRun: step.setRun,
    questId: step.questCredit ? QUEST_SUNKEN_TREASURE : null,
    cite: step.cite,
  };
}

// Pure helpers — kinelory WaypointReached + aggro yell branch

/** Escort waypoint actions (WaypointReached switch). Cite: arathi_highlands.cpp:160–193 */
export const KINELORY_WAYPOINTS = [
  {
    pointId: 10,
    textIds: [SAY_REACH_BOTTOM] as readonly number[],
    setRun: false,
    setImmuneToNpc: false,
    facePlayer: false,
    faceQuae: false,
    questCredit: false,
    cite: 'arathi_highlands.cpp:164-166 case 10 SAY_REACH_BOTTOM',
  },
  {
    pointId: 17,
    textIds: [SAY_WATCH_BACK, EMOTE_BELONGINGS],
    setRun: false,
    setImmuneToNpc: false,
    facePlayer: false,
    faceQuae: false,
    questCredit: false,
    cite: 'arathi_highlands.cpp:167-170 case 17 SAY_WATCH_BACK + EMOTE_BELONGINGS',
  },
  {
    pointId: 18,
    textIds: [SAY_DATA_FOUND],
    setRun: false,
    setImmuneToNpc: false,
    facePlayer: false,
    faceQuae: false,
    questCredit: false,
    cite: 'arathi_highlands.cpp:171-173 case 18 SAY_DATA_FOUND',
  },
  {
    pointId: 19,
    textIds: [SAY_ESCAPE],
    setRun: true,
    setImmuneToNpc: false,
    facePlayer: true,
    faceQuae: false,
    questCredit: false,
    cite: 'arathi_highlands.cpp:174-179 case 19 SAY_ESCAPE + face player + SetRun',
  },
  {
    pointId: 34,
    textIds: [SAY_FINISH, EMOTE_HAND_PACK],
    setRun: false,
    setImmuneToNpc: true,
    facePlayer: false,
    faceQuae: true,
    questCredit: false,
    cite: 'arathi_highlands.cpp:180-188 case 34 SAY_FINISH + immune + EMOTE_HAND_PACK to Quae',
  },
  {
    pointId: 35,
    textIds: [] as readonly number[],
    setRun: false,
    setImmuneToNpc: false,
    facePlayer: false,
    faceQuae: false,
    questCredit: true,
    cite: 'arathi_highlands.cpp:189-192 case 35 RewardPlayerAndGroupAtEventExplored 660',
  },
] as const;

export interface KineloryWaypointResult {
  handled: boolean;
  textIds: number[];
  setRun: boolean;
  setImmuneToNpc: boolean;
  facePlayer: boolean;
  faceQuae: boolean;
  questId: number | null;
  cite: string;
}

/** Port of npc_kineloryAI::WaypointReached. Cite: arathi_highlands.cpp:160–193 */
export function kineloryWaypointReached(pointId: number): KineloryWaypointResult {
  const step = KINELORY_WAYPOINTS.find((w) => w.pointId === pointId);
  if (!step) {
    return {
      handled: false,
      textIds: [],
      setRun: false,
      setImmuneToNpc: false,
      facePlayer: false,
      faceQuae: false,
      questId: null,
      cite: 'arathi_highlands.cpp:160-193 no case for this pointId',
    };
  }
  return {
    handled: true,
    textIds: [...step.textIds],
    setRun: step.setRun,
    setImmuneToNpc: step.setImmuneToNpc,
    facePlayer: step.facePlayer,
    faceQuae: step.faceQuae,
    questId: step.questCredit ? QUEST_HINTS_NEW_PLAGUE : null,
    cite: step.cite,
  };
}

export interface KineloryAggroYellResult {
  /** Text id for yell (or null when roll misses). */
  textId: number | null;
  /** When true, Jorell (2733) yells SAY_AGGRO_JORELL at Kinelory. */
  jorellYells: boolean;
  cite: string;
}

// Port of npc_kineloryAI::Aggro yell branch: a 10% SAY_AGGRO_KINELORY, with NPC_JORELL 2733 as a
// special case. Cite: arathi_highlands.cpp:196–201.
export function kineloryAggroYell(whoEntry: number, roll01: number): KineloryAggroYellResult {
  if (whoEntry === NPC_JORELL) {
    return {
      textId: SAY_AGGRO_JORELL,
      jorellYells: true,
      cite: 'arathi_highlands.cpp:198-199 who==NPC_JORELL → SAY_AGGRO_JORELL from who',
    };
  }
  // roll_chance_i(10) → success when roll < 10 for roll in [0,100)
  if (roll01 < 10) {
    return {
      textId: SAY_AGGRO_KINELORY,
      jorellYells: false,
      cite: 'arathi_highlands.cpp:200-201 roll_chance_i(10) → SAY_AGGRO_KINELORY',
    };
  }
  return {
    textId: null,
    jorellYells: false,
    cite: 'arathi_highlands.cpp:200-201 roll miss → no yell',
  };
}

// DoSelectLowestHpFriendly(40) gate for the heal timer re-arm. The host timer targets 'self',
// which includes self when injured; the multi-ally scan is FO6 escort. Cite: :230.
export function kineloryHealTargetEligible(hpFrac: number): boolean {
  return hpFrac > 0 && hpFrac < 1;
}

// npc_professor_phizzlethorpe

// npc_professor_phizzlethorpeAI, creature 2768. No combat cast timers (Reset is empty); the
// waypoints carry texts, 2× 2776 at WP10 and quest 665 at WP21. Summon 2776 is absent from bake.
export const NPC_PROFESSOR_PHIZZLETHORPE_SCRIPT: ScriptDevIR = {
  name: 'npc_professor_phizzlethorpe',
  boundCreatures: [NPC_PROFESSOR_PHIZZLETHORPE],
  sourceFile: 'eastern_kingdoms/arathi_highlands.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {
    onAggro: [
      {
        kind: 'yell',
        textId: SAY_AGGRO,
        cite: 'arathi_highlands.cpp:92-95 Aggro DoScriptText(SAY_AGGRO)',
      },
    ],
  },
  unusedBindings: [
    {
      entry: ENTRY_VENGEFUL_SURGE,
      kind: 'creature',
      reason:
        'NPC 2776 Vengeful Surge is escort-summon-only at professor WP10 (arathi_highlands.cpp:75-76); absent from product bake - IR ported; spawn coords + AttackStart(professor) documented in VENGEFUL_SURGE_SPAWNS / phizzleWaypointReached',
      cite: 'arathi_highlands.cpp:53,74-77,97-100; loadRealBundle missing 2776',
    },
  ],
  cites: [
    'arathi_highlands.cpp:34-119 npc_professor_phizzlethorpe',
    'arathi_highlands.cpp:60 Reset empty (no combat timers)',
    'arathi_highlands.cpp:62-89 WaypointReached WP5..21',
    'arathi_highlands.cpp:75-76 TEMPSPAWN_TIMED_OOC_OR_CORPSE_DESPAWN 600000',
    'arathi_highlands.cpp:92-95 Aggro SAY_AGGRO',
    'arathi_highlands.cpp:97-100 JustSummoned AttackStart',
    'arathi_highlands.cpp:103-114 QuestAccept 665 FACTION_BOOTY_BAY + Start escort',
    'arathi_highlands.cpp:51-53 FACTION_BOOTY_BAY=120 QUEST_SUNKEN_TREASURE=665 ENTRY_VENGEFUL_SURGE=2776',
  ],
};

// npc_kinelory

// npc_kineloryAI, creature 2713. Bear Form self init urand(5–7)s / re-arm urand(25–30)s;
// Rejuvenation init urand(2–5)s / re-arm urand(15–25)s. Spell 4948 is sourced but absent from bake.
export const NPC_KINELORY_SCRIPT: ScriptDevIR = {
  name: 'npc_kinelory',
  boundCreatures: [NPC_KINELORY],
  sourceFile: 'eastern_kingdoms/arathi_highlands.cpp',
  spellIds: [SPELL_REJUVENATION, SPELL_BEAR_FORM],
  timers: [
    {
      id: 'bear_form',
      spellId: SPELL_BEAR_FORM,
      // Reset m_uiBearFormTimer = urand(5000, 7000) (cpp:156)
      initialMinMs: KINELORY_BEAR_FORM_INIT_MIN_MS,
      initialMaxMs: KINELORY_BEAR_FORM_INIT_MAX_MS,
      // CAST_OK re-arm urand(25000, 30000) (cpp:223)
      repeatMinMs: KINELORY_BEAR_FORM_REPEAT_MIN_MS,
      repeatMaxMs: KINELORY_BEAR_FORM_REPEAT_MAX_MS,
      target: 'self',
      cite: 'arathi_highlands.cpp:156,220-224 Bear Form init 5000-7000 re-arm 25000-30000 self',
    },
    {
      id: 'rejuvenation',
      spellId: SPELL_REJUVENATION,
      // Reset m_uiHealTimer = urand(2000, 5000) (cpp:157)
      initialMinMs: KINELORY_HEAL_INIT_MIN_MS,
      initialMaxMs: KINELORY_HEAL_INIT_MAX_MS,
      // CAST_OK re-arm urand(15000, 25000) (cpp:233)
      repeatMinMs: KINELORY_HEAL_REPEAT_MIN_MS,
      repeatMaxMs: KINELORY_HEAL_REPEAT_MAX_MS,
      target: 'self',
      friendlyLowestHpYd: 40,
      friendlyHpDeficit: 1,
      cite: 'arathi_highlands.cpp:157,229-234 Rejuvenation init 2000-5000 re-arm 15000-25000, DoSelectLowestHpFriendly(40.0f)',
    },
  ],
  lifecycle: {
    onAggro: [
      {
        kind: 'yell',
        textId: SAY_AGGRO_KINELORY,
        cite: 'arathi_highlands.cpp:196-201 Aggro: Jorell→SAY_AGGRO_JORELL else 10% SAY_AGGRO_KINELORY (kineloryAggroYell)',
      },
    ],
  },
  cites: [
    'arathi_highlands.cpp:121-254 npc_kinelory',
    'arathi_highlands.cpp:154-158 Reset combat timers',
    'arathi_highlands.cpp:160-193 WaypointReached WP10..35',
    'arathi_highlands.cpp:196-201 Aggro yell branch',
    'arathi_highlands.cpp:204-212 ReceiveAIEvent START_ESCORT',
    'arathi_highlands.cpp:215-239 UpdateEscortAI Bear Form + Rejuvenation + melee',
    'arathi_highlands.cpp:248-254 QuestAccept 660 SendAIEvent',
    'arathi_highlands.cpp:138-139 SPELL_REJUVENATION=3627 SPELL_BEAR_FORM=4948',
    'arathi_highlands.cpp:141-144 NPC_JORELL=2733 NPC_QUAE=2712 QUEST_HINTS_NEW_PLAGUE=660',
  ],
};
