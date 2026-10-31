// Loch Modan ScriptDev IR ports. Source: scripts/eastern_kingdoms/loch_modan.cpp — npc_miran,
// escort quest 309. Summon 2149 is absent from bake, so that ambush binding is unused.

import type { ScriptDevIR } from './types.ts';

// Constants — loch_modan.cpp npc_miran

// loch_modan.cpp:39–48
export const QUEST_PROTECTING_THE_SHIPMENT = 309;

export const SAY_MIRAN_1 = 510;
export const SAY_MIRAN_2 = 511;
export const SAY_MIRAN_3 = 498;
export const SAY_DARK_IRON_RAIDER = 512;

export const NPC_DARK_IRON_RAIDER = 2149;
export const MIRAN_ESCORT_PATH = 1379;
export const NPC_MIRAN = 1379;

/** TEMPSPAWN_CORPSE_TIMED_DESPAWN for ambush raiders. Cite: loch_modan.cpp:86-87 25000 */
export const MIRAN_AMBUSH_DESPAWN_MS = 25_000;

/** ForcedDespawn delay after WP21 explore credit. Cite: loch_modan.cpp:94 ForcedDespawn(15000) */
export const MIRAN_DESPAWN_MS = 15_000;

/** Ambush spawn positions (m_afAmbushSpawn). Cite: loch_modan.cpp:56–60 */
export const MIRAN_AMBUSH_SPAWNS = [
  {
    x: -5705.012,
    y: -3736.6575,
    z: 318.56738,
    o: 0.57595,
    cite: 'loch_modan.cpp:58 m_afAmbushSpawn[0]',
  },
  {
    x: -5696.1943,
    y: -3736.78,
    z: 318.58145,
    o: 2.40855,
    cite: 'loch_modan.cpp:59 m_afAmbushSpawn[1]',
  },
] as const;

/** Raiders summoned at WP17. Cite: loch_modan.cpp:86-87 two SummonCreature */
export const MIRAN_AMBUSH_COUNT = 2;

// Pure helpers — WaypointReached + JustSummoned / SummonedCreatureJustDied

/** Escort WaypointReached actions. Cite: loch_modan.cpp:77–96 */
export const MIRAN_WAYPOINTS = [
  {
    pointId: 16,
    textIds: [SAY_MIRAN_1] as readonly number[],
    pauseEscort: false,
    summonAmbush: false,
    questCredit: false,
    forceDespawnMs: 0,
    cite: 'loch_modan.cpp:81-83 case 16 SAY_MIRAN_1',
  },
  {
    pointId: 17,
    textIds: [] as readonly number[],
    pauseEscort: true,
    summonAmbush: true,
    questCredit: false,
    forceDespawnMs: 0,
    cite: 'loch_modan.cpp:84-88 case 17 SetEscortPaused + 2× NPC_DARK_IRON_RAIDER',
  },
  {
    pointId: 21,
    textIds: [SAY_MIRAN_3],
    pauseEscort: true,
    summonAmbush: false,
    questCredit: true,
    forceDespawnMs: MIRAN_DESPAWN_MS,
    cite: 'loch_modan.cpp:89-95 case 21 SAY_MIRAN_3 + explore credit 309 + ForcedDespawn(15000)',
  },
] as const;

export interface MiranAmbushSummon {
  creatureEntry: number;
  x: number;
  y: number;
  z: number;
  o: number;
  despawnMs: number;
  /** JustSummoned: AttackStart escort NPC. Cite: loch_modan.cpp:117 */
  attackEscort: boolean;
  /** JustSummoned yell from the summoned raider. Cite: loch_modan.cpp:118 */
  textId: number;
}

export interface MiranWaypointResult {
  handled: boolean;
  textIds: number[];
  pauseEscort: boolean;
  summons: MiranAmbushSummon[];
  questId: number | null;
  forceDespawnMs: number;
  cite: string;
}

// Port of npc_miranAI::WaypointReached ambush summons (WP17). Cite: loch_modan.cpp:86-87 + JustSummoned
// 112–119
export function miranDoSpawnAmbush(): MiranAmbushSummon[] {
  return MIRAN_AMBUSH_SPAWNS.map((spawn) => ({
    creatureEntry: NPC_DARK_IRON_RAIDER,
    x: spawn.x,
    y: spawn.y,
    z: spawn.z,
    o: spawn.o,
    despawnMs: MIRAN_AMBUSH_DESPAWN_MS,
    attackEscort: true,
    textId: SAY_DARK_IRON_RAIDER,
  }));
}

/** Port of npc_miranAI::WaypointReached. Cite: loch_modan.cpp:77–96 */
export function miranWaypointReached(pointId: number): MiranWaypointResult {
  const step = MIRAN_WAYPOINTS.find((w) => w.pointId === pointId);
  if (!step) {
    return {
      handled: false,
      textIds: [],
      pauseEscort: false,
      summons: [],
      questId: null,
      forceDespawnMs: 0,
      cite: 'loch_modan.cpp:77-96 no case for this pointId',
    };
  }
  return {
    handled: true,
    textIds: [...step.textIds],
    pauseEscort: step.pauseEscort,
    summons: step.summonAmbush ? miranDoSpawnAmbush() : [],
    questId: step.questCredit ? QUEST_PROTECTING_THE_SHIPMENT : null,
    forceDespawnMs: step.forceDespawnMs,
    cite: step.cite,
  };
}

export interface MiranJustSummonedResult {
  handled: boolean;
  /** m_uiDwarves after ++. Cite: loch_modan.cpp:116 */
  dwarvesAfter: number;
  attackEscort: boolean;
  textId: number | null;
  cite: string;
}

// Port of npc_miranAI::JustSummoned for the Dark Iron Raider; `dwarves` is the count before it.
// Cite: loch_modan.cpp:112–120.
export function miranJustSummoned(
  summonedEntry: number,
  dwarves: number,
): MiranJustSummonedResult {
  if (summonedEntry !== NPC_DARK_IRON_RAIDER) {
    return {
      handled: false,
      dwarvesAfter: dwarves,
      attackEscort: false,
      textId: null,
      cite: 'loch_modan.cpp:114 entry != NPC_DARK_IRON_RAIDER → no-op',
    };
  }
  return {
    handled: true,
    dwarvesAfter: dwarves + 1,
    attackEscort: true,
    textId: SAY_DARK_IRON_RAIDER,
    cite: 'loch_modan.cpp:114-119 ++m_uiDwarves + AttackStart + SAY_DARK_IRON_RAIDER',
  };
}

export interface MiranSummonedDiedResult {
  handled: boolean;
  /** m_uiDwarves after --. Cite: loch_modan.cpp:103 */
  dwarvesAfter: number;
  /** When dwarves hit 0: SAY_MIRAN_2 + SetEscortPaused(false). */
  resumeEscort: boolean;
  textId: number | null;
  cite: string;
}

// Port of npc_miranAI::SummonedCreatureJustDied; `dwarves` is the count before this death.
// Cite: loch_modan.cpp:99–110.
export function miranSummonedCreatureJustDied(
  summonedEntry: number,
  dwarves: number,
): MiranSummonedDiedResult {
  if (summonedEntry !== NPC_DARK_IRON_RAIDER) {
    return {
      handled: false,
      dwarvesAfter: dwarves,
      resumeEscort: false,
      textId: null,
      cite: 'loch_modan.cpp:101 entry != NPC_DARK_IRON_RAIDER → no-op',
    };
  }
  const next = Math.max(0, dwarves - 1);
  if (next === 0) {
    return {
      handled: true,
      dwarvesAfter: 0,
      resumeEscort: true,
      textId: SAY_MIRAN_2,
      cite: 'loch_modan.cpp:103-108 --m_uiDwarves → 0: SAY_MIRAN_2 + SetEscortPaused(false)',
    };
  }
  return {
    handled: true,
    dwarvesAfter: next,
    resumeEscort: false,
    textId: null,
    cite: 'loch_modan.cpp:103 --m_uiDwarves (still > 0) → keep paused',
  };
}

export interface MiranResetResult {
  /** m_uiDwarves after Reset. Cite: loch_modan.cpp:71-75 */
  dwarves: number;
  cleared: boolean;
  cite: string;
}

// Port of npc_miranAI::Reset.
// Cite: loch_modan.cpp:71–75.
export function miranReset(escorting: boolean, dwarves: number): MiranResetResult {
  if (!escorting) {
    return {
      dwarves: 0,
      cleared: true,
      cite: 'loch_modan.cpp:73-74 !escorting → m_uiDwarves = 0',
    };
  }
  return {
    dwarves,
    cleared: false,
    cite: 'loch_modan.cpp:73 escorting → keep m_uiDwarves',
  };
}

// npc_miran

// npc_miranAI, creature 1379. No combat cast timers — Reset only clears m_uiDwarves when OOC, and
// the escort ambush and quest credit are waypoint helpers. Summon 2149 is absent from bake.
export const NPC_MIRAN_SCRIPT: ScriptDevIR = {
  name: 'npc_miran',
  boundCreatures: [NPC_MIRAN],
  sourceFile: 'eastern_kingdoms/loch_modan.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'm_uiDwarves=0 when not escorting',
        cite: 'loch_modan.cpp:71-75 Reset m_uiDwarves=0 when !STATE_ESCORT_ESCORTING',
      },
    ],
  },
  unusedBindings: [
    {
      entry: NPC_DARK_IRON_RAIDER,
      kind: 'creature',
      reason:
        'NPC 2149 Dark Iron Raider is escort-summon-only at Miran WP17 (loch_modan.cpp:86-87); absent from product bake - IR ported; ambush coords + TEMPSPAWN 25000 + JustSummoned AttackStart/SAY_DARK_IRON_RAIDER + SummonedCreatureJustDied resume documented in MIRAN_AMBUSH_SPAWNS / miranWaypointReached / miranJustSummoned / miranSummonedCreatureJustDied',
      cite: 'loch_modan.cpp:46,86-87,99-120; loadRealBundle missing 2149',
    },
  ],
  cites: [
    'loch_modan.cpp:33-145 npc_miran',
    'loch_modan.cpp:71-75 Reset m_uiDwarves (no combat timers)',
    'loch_modan.cpp:77-96 WaypointReached WP16/17/21',
    'loch_modan.cpp:86-87 TEMPSPAWN_CORPSE_TIMED_DESPAWN 25000 2×2149',
    'loch_modan.cpp:89-95 WP21 SAY_MIRAN_3 + explore credit 309 + ForcedDespawn(15000)',
    'loch_modan.cpp:99-110 SummonedCreatureJustDied resume on last raider',
    'loch_modan.cpp:112-120 JustSummoned ++dwarves + AttackStart + SAY_DARK_IRON_RAIDER',
    'loch_modan.cpp:123-131 QuestAccept 309 Start path MIRAN_ESCORT_PATH=1379',
    'loch_modan.cpp:39-48 QUEST=309 SAY_MIRAN_* NPC_DARK_IRON_RAIDER=2149 path=1379',
  ],
};
