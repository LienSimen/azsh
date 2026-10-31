// Hinterlands ScriptDev IR ports. Source: scripts/eastern_kingdoms/hinterlands.cpp —
// npc_00x09hl, npc_rinji and event_wildhammer_message. Every value cites file:line below.

import type { ScriptDevIR } from './types.ts';

// Constants — hinterlands.cpp npc_00x09hl

// hinterlands.cpp:43–52
export const SAY_OOX_START = -1000287;
export const SAY_OOX_AGGRO1 = -1000288;
export const SAY_OOX_AGGRO2 = -1000289;
export const SAY_OOX_AMBUSH = -1000290;
export const SAY_OOX_END = -1000292;

export const QUEST_RESQUE_OOX_09 = 836;
export const NPC_MARAUDING_OWL = 7808;
export const NPC_VILE_AMBUSHER = 7809;
export const NPC_OOX_09_HL = 7806;

// FACTION_ESCORT_N_FRIEND_ACTIVE. Cite: ScriptDevAIMgr.h:53; QI4 hinterlands accept. hinterlands.cpp:155
// SetFactionTemporary
export const FACTION_ESCORT_N_FRIEND_ACTIVE = 495;

/** TEMPSPAWN_CORPSE_TIMED_DESPAWN for OOX ambush summons. Cite: hinterlands.cpp:102,116 25000 */
export const OOX_AMBUSH_DESPAWN_MS = 25_000;

/** GetRandomPoint radius for OOX ambush spawns. Cite: hinterlands.cpp:100,114 7.0f */
export const OOX_AMBUSH_RADIUS_YD = 7;

/** WP28 Marauding Owl spawn center (GetRandomPoint origin). Cite: hinterlands.cpp:100 */
export const OOX_OWL_SPAWN_CENTER = {
  x: 147.927444,
  y: -3851.513428,
  z: 130.893,
  cite: 'hinterlands.cpp:100 GetRandomPoint owl ambush center',
} as const;

/** WP45 Vile Ambusher spawn center (GetRandomPoint origin). Cite: hinterlands.cpp:114 */
export const OOX_AMBUSHER_SPAWN_CENTER = {
  x: -141.151581,
  y: -4291.213867,
  z: 120.13,
  cite: 'hinterlands.cpp:114 GetRandomPoint ambusher center',
} as const;

/** Max summons before WP28 owl ambush skips. Cite: hinterlands.cpp:94–95 >= 3 */
export const OOX_OWL_SUMMON_CAP = 3;
/** Max summons before WP45 ambusher ambush skips. Cite: hinterlands.cpp:107–108 >= 6 */
export const OOX_AMBUSHER_SUMMON_CAP = 6;
/** Owls summoned per WP28. Cite: hinterlands.cpp:97 for i < 3 */
export const OOX_OWL_SUMMON_COUNT = 3;
/** Ambushers summoned per WP45. Cite: hinterlands.cpp:110 for i < 3 */
export const OOX_AMBUSHER_SUMMON_COUNT = 3;

// Constants — hinterlands.cpp npc_rinji

// hinterlands.cpp:174–185
export const SAY_RIN_FREE = -1000403;
export const SAY_RIN_BY_OUTRUNNER = -1000404;
export const SAY_RIN_HELP_1 = -1000405;
export const SAY_RIN_HELP_2 = -1000406;
export const SAY_RIN_COMPLETE = -1000407;
export const SAY_RIN_PROGRESS_1 = -1000408;
export const SAY_RIN_PROGRESS_2 = -1000409;

export const QUEST_RINJI_TRAPPED = 2742;
export const NPC_RANGER = 2694;
export const NPC_OUTRUNNER = 2691;
export const GO_RINJI_CAGE = 142036;
export const NPC_RINJI = 7780;

/** Post-event chat re-arm. Cite: hinterlands.cpp:217 Reset; :305 re-arm 3000 */
export const RINJI_POST_EVENT_TIMER_MS = 3000;

/** TEMPSPAWN_TIMED_OOC_OR_CORPSE_DESPAWN for Rinji ambush. Cite: hinterlands.cpp:253,259 60000 */
export const RINJI_AMBUSH_DESPAWN_MS = 60_000;

/** Ambush spawn positions (m_afAmbushSpawn). Cite: hinterlands.cpp:188–192 */
export const RINJI_AMBUSH_SPAWNS = [
  {
    x: 191.2962,
    y: -2839.329346,
    z: 107.388,
    o: 0,
    cite: 'hinterlands.cpp:190 m_afAmbushSpawn[0]',
  },
  {
    x: 70.972466,
    y: -2848.674805,
    z: 109.459,
    o: 0,
    cite: 'hinterlands.cpp:191 m_afAmbushSpawn[1]',
  },
] as const;

// Ambush move-to positions (m_afAmbushMoveTo) — JustSummoned MovePoint target. Cite:
// hinterlands.cpp:194–198
export const RINJI_AMBUSH_MOVE_TO = [
  {
    x: 166.63038,
    y: -2824.780273,
    z: 108.153,
    o: 0,
    cite: 'hinterlands.cpp:196 m_afAmbushMoveTo[0]',
  },
  {
    x: 70.886589,
    y: -2874.335449,
    z: 116.675,
    o: 0,
    cite: 'hinterlands.cpp:197 m_afAmbushMoveTo[1]',
  },
] as const;

/** Rangers per ambush. Cite: hinterlands.cpp:251–253 one SummonCreature NPC_RANGER */
export const RINJI_RANGER_PER_AMBUSH = 1;
/** Outrunners per ambush. Cite: hinterlands.cpp:255–260 for i < 2 */
export const RINJI_OUTRUNNER_PER_AMBUSH = 2;

// Constants — event_wildhammer_message

/** Cite: hinterlands.cpp:360 YELL_FALSTAD_INVADERS = -27 (script_texts / custom id — not -1000xxx range) */
export const YELL_FALSTAD_INVADERS = -27;

/** Cite: world_eastern_kingdoms.h:14 NPC_FALSTAD_WILDHAMMER = 5635 */
export const NPC_FALSTAD_WILDHAMMER = 5635;

/** Cite: scriptdev2.sql:387 event 8608 → event_wildhammer_message */
export const EVENT_ID_WILDHAMMER_MESSAGE = 8608;

// Pure helpers — OOX WaypointReached + WaypointStart ambush

/** Escort WaypointReached actions. Cite: hinterlands.cpp:71–87 */
export const OOX_WAYPOINTS_REACHED = [
  {
    pointId: 27,
    textIds: [SAY_OOX_AMBUSH] as readonly number[],
    questCredit: false,
    cite: 'hinterlands.cpp:75-77 case 27 SAY_OOX_AMBUSH',
  },
  {
    pointId: 44,
    textIds: [SAY_OOX_AMBUSH],
    questCredit: false,
    cite: 'hinterlands.cpp:78-80 case 44 SAY_OOX_AMBUSH',
  },
  {
    pointId: 65,
    textIds: [SAY_OOX_END],
    questCredit: true,
    cite: 'hinterlands.cpp:81-85 case 65 SAY_OOX_END + RewardPlayerAndGroupAtEventExplored 836',
  },
] as const;

/** Escort WaypointStart ambush summons. Cite: hinterlands.cpp:89–120 */
export const OOX_WAYPOINTS_START = [
  {
    pointId: 28,
    creatureEntry: NPC_MARAUDING_OWL,
    count: OOX_OWL_SUMMON_COUNT,
    summonCapBefore: OOX_OWL_SUMMON_CAP,
    center: OOX_OWL_SPAWN_CENTER,
    radiusYd: OOX_AMBUSH_RADIUS_YD,
    despawnMs: OOX_AMBUSH_DESPAWN_MS,
    cite: 'hinterlands.cpp:93-105 case 28 3× NPC_MARAUDING_OWL 7808 if count < 3',
  },
  {
    pointId: 45,
    creatureEntry: NPC_VILE_AMBUSHER,
    count: OOX_AMBUSHER_SUMMON_COUNT,
    summonCapBefore: OOX_AMBUSHER_SUMMON_CAP,
    center: OOX_AMBUSHER_SPAWN_CENTER,
    radiusYd: OOX_AMBUSH_RADIUS_YD,
    despawnMs: OOX_AMBUSH_DESPAWN_MS,
    cite: 'hinterlands.cpp:106-118 case 45 3× NPC_VILE_AMBUSHER 7809 if count < 6',
  },
] as const;

export interface OoxWaypointReachedResult {
  handled: boolean;
  textIds: number[];
  questId: number | null;
  cite: string;
}

/** Port of npc_00x09hlAI::WaypointReached. Cite: hinterlands.cpp:71–87 */
export function ooxWaypointReached(pointId: number): OoxWaypointReachedResult {
  const step = OOX_WAYPOINTS_REACHED.find((w) => w.pointId === pointId);
  if (!step) {
    return {
      handled: false,
      textIds: [],
      questId: null,
      cite: 'hinterlands.cpp:71-87 no case for this pointId',
    };
  }
  return {
    handled: true,
    textIds: [...step.textIds],
    questId: step.questCredit ? QUEST_RESQUE_OOX_09 : null,
    cite: step.cite,
  };
}

export interface OoxWaypointStartResult {
  handled: boolean;
  /** When false, summon cap already reached — no new summons. */
  summon: boolean;
  creatureEntry: number;
  count: number;
  center: { x: number; y: number; z: number };
  radiusYd: number;
  despawnMs: number;
  /** Summon count after this ambush if summoned. */
  summonCountAfter: number;
  cite: string;
}

// Port of npc_00x09hlAI::WaypointStart, ambush branch.
// Cite: hinterlands.cpp:89–120.
export function ooxWaypointStart(
  pointId: number,
  summonCount: number,
): OoxWaypointStartResult {
  const step = OOX_WAYPOINTS_START.find((w) => w.pointId === pointId);
  if (!step) {
    return {
      handled: false,
      summon: false,
      creatureEntry: 0,
      count: 0,
      center: { x: 0, y: 0, z: 0 },
      radiusYd: 0,
      despawnMs: 0,
      summonCountAfter: summonCount,
      cite: 'hinterlands.cpp:89-120 no case for this pointId',
    };
  }
  // cpp:94-95 / 107-108 early break when cap already hit
  if (summonCount >= step.summonCapBefore) {
    return {
      handled: true,
      summon: false,
      creatureEntry: step.creatureEntry,
      count: 0,
      center: { x: step.center.x, y: step.center.y, z: step.center.z },
      radiusYd: step.radiusYd,
      despawnMs: step.despawnMs,
      summonCountAfter: summonCount,
      cite: `${step.cite} (cap hit - no summon)`,
    };
  }
  return {
    handled: true,
    summon: true,
    creatureEntry: step.creatureEntry,
    count: step.count,
    center: { x: step.center.x, y: step.center.y, z: step.center.z },
    radiusYd: step.radiusYd,
    despawnMs: step.despawnMs,
    summonCountAfter: summonCount + step.count,
    cite: step.cite,
  };
}

export interface OoxAggroYellResult {
  /** null when ambush mob or no yell. */
  textId: number | null;
  skippedAmbush: boolean;
  cite: string;
}

// Port of npc_00x09hlAI::Aggro; `roll01` picks SAY_OOX_AGGRO1 or AGGRO2.
// Cite: hinterlands.cpp:122–128.
export function ooxAggroYell(whoEntry: number, roll01: number): OoxAggroYellResult {
  if (whoEntry === NPC_MARAUDING_OWL || whoEntry === NPC_VILE_AMBUSHER) {
    return {
      textId: null,
      skippedAmbush: true,
      cite: 'hinterlands.cpp:124-125 who==owl/ambusher → no yell',
    };
  }
  return {
    textId: roll01 === 0 ? SAY_OOX_AGGRO1 : SAY_OOX_AGGRO2,
    skippedAmbush: false,
    cite: 'hinterlands.cpp:127 urand(0,1) ? SAY_OOX_AGGRO1 : SAY_OOX_AGGRO2',
  };
}

// Pure helpers — Rinji WaypointReached + ambush + post-event + aggro

/** Escort WaypointReached actions. Cite: hinterlands.cpp:269–294 */
export const RINJI_WAYPOINTS = [
  {
    pointId: 2,
    textIds: [SAY_RIN_FREE] as readonly number[],
    ambushFirst: null as boolean | null,
    questCredit: false,
    setRun: false,
    postEventCount: 0,
    cite: 'hinterlands.cpp:278-280 case 2 SAY_RIN_FREE',
  },
  {
    pointId: 8,
    textIds: [] as readonly number[],
    ambushFirst: true,
    questCredit: false,
    setRun: false,
    postEventCount: 0,
    cite: 'hinterlands.cpp:281-283 case 8 DoSpawnAmbush(true)',
  },
  {
    pointId: 14,
    textIds: [],
    ambushFirst: false,
    questCredit: false,
    setRun: false,
    postEventCount: 0,
    cite: 'hinterlands.cpp:284-286 case 14 DoSpawnAmbush(false)',
  },
  {
    pointId: 18,
    textIds: [SAY_RIN_COMPLETE],
    ambushFirst: null,
    questCredit: true,
    setRun: true,
    postEventCount: 1,
    cite: 'hinterlands.cpp:287-292 case 18 SAY_RIN_COMPLETE + Reward 2742 + SetRun + postEvent=1',
  },
] as const;

export interface RinjiAmbushSummon {
  creatureEntry: number;
  x: number;
  y: number;
  z: number;
  o: number;
  moveToX: number;
  moveToY: number;
  moveToZ: number;
  despawnMs: number;
}

export interface RinjiWaypointResult {
  handled: boolean;
  textIds: number[];
  summons: RinjiAmbushSummon[];
  questId: number | null;
  setRun: boolean;
  postEventCount: number;
  cite: string;
}

// Port of npc_rinjiAI::DoSpawnAmbush; `first` picks spawn index 0 or 1.
// Cite: hinterlands.cpp:246–261; JustSummoned MovePoint :263–267.
export function rinjiDoSpawnAmbush(first: boolean): RinjiAmbushSummon[] {
  const spawnId = first ? 0 : 1;
  const spawn = RINJI_AMBUSH_SPAWNS[spawnId]!;
  const moveTo = RINJI_AMBUSH_MOVE_TO[spawnId]!;
  const mk = (entry: number): RinjiAmbushSummon => ({
    creatureEntry: entry,
    x: spawn.x,
    y: spawn.y,
    z: spawn.z,
    o: spawn.o,
    moveToX: moveTo.x,
    moveToY: moveTo.y,
    moveToZ: moveTo.z,
    despawnMs: RINJI_AMBUSH_DESPAWN_MS,
  });
  // 1 ranger + 2 outrunners
  return [mk(NPC_RANGER), mk(NPC_OUTRUNNER), mk(NPC_OUTRUNNER)];
}

/** Port of npc_rinjiAI::WaypointReached. Cite: hinterlands.cpp:269–294 */
export function rinjiWaypointReached(pointId: number): RinjiWaypointResult {
  const step = RINJI_WAYPOINTS.find((w) => w.pointId === pointId);
  if (!step) {
    return {
      handled: false,
      textIds: [],
      summons: [],
      questId: null,
      setRun: false,
      postEventCount: 0,
      cite: 'hinterlands.cpp:269-294 no case for this pointId',
    };
  }
  return {
    handled: true,
    textIds: [...step.textIds],
    summons: step.ambushFirst === null ? [] : rinjiDoSpawnAmbush(step.ambushFirst),
    questId: step.questCredit ? QUEST_RINJI_TRAPPED : null,
    setRun: step.setRun,
    postEventCount: step.postEventCount,
    cite: step.cite,
  };
}

export interface RinjiPostEventTickResult {
  /** Text id spoken this tick, or null when idle/done. */
  textId: number | null;
  /** Next m_uiPostEventCount (0 = finished). */
  nextCount: number;
  /** Re-arm timer ms when still counting. */
  timerMs: number;
  /** ForcedDespawn when escort player missing. */
  forceDespawn: boolean;
  cite: string;
}

// Port of npc_rinjiAI::UpdateEscortAI post-event chat, the OOC branch.
// Cite: hinterlands.cpp:296–335.
export function rinjiPostEventTick(
  postEventCount: number,
  hasEscortPlayer: boolean,
): RinjiPostEventTickResult {
  if (!postEventCount) {
    return {
      textId: null,
      nextCount: 0,
      timerMs: RINJI_POST_EVENT_TIMER_MS,
      forceDespawn: false,
      cite: 'hinterlands.cpp:301 postEventCount==0 → idle',
    };
  }
  if (!hasEscortPlayer) {
    return {
      textId: null,
      nextCount: 0,
      timerMs: 0,
      forceDespawn: true,
      cite: 'hinterlands.cpp:321-324 no escort player → ForcedDespawn',
    };
  }
  if (postEventCount === 1) {
    return {
      textId: SAY_RIN_PROGRESS_1,
      nextCount: 2,
      timerMs: RINJI_POST_EVENT_TIMER_MS,
      forceDespawn: false,
      cite: 'hinterlands.cpp:311-314 case 1 SAY_RIN_PROGRESS_1 → count=2',
    };
  }
  if (postEventCount === 2) {
    return {
      textId: SAY_RIN_PROGRESS_2,
      nextCount: 0,
      timerMs: RINJI_POST_EVENT_TIMER_MS,
      forceDespawn: false,
      cite: 'hinterlands.cpp:315-318 case 2 SAY_RIN_PROGRESS_2 → count=0',
    };
  }
  return {
    textId: null,
    nextCount: 0,
    timerMs: RINJI_POST_EVENT_TIMER_MS,
    forceDespawn: false,
    cite: 'hinterlands.cpp:309-319 unknown count',
  };
}

export interface RinjiAggroYellResult {
  /** Outrunner says SAY_RIN_BY_OUTRUNNER (from who), once. */
  outrunnerTextId: number | null;
  /** Rinji help yell (or null). */
  helpTextId: number | null;
  /** Updated m_bIsByOutrunner. */
  isByOutrunner: boolean;
  cite: string;
}

// Port of npc_rinjiAI::Aggro, escort branch: a non-zero urand(0,3) skips the help yell.
// Cite: hinterlands.cpp:229–244.
export function rinjiAggroYell(
  escorting: boolean,
  whoEntry: number,
  isByOutrunner: boolean,
  skipRoll: number,
  helpRoll: number,
): RinjiAggroYellResult {
  if (!escorting) {
    return {
      outrunnerTextId: null,
      helpTextId: null,
      isByOutrunner,
      cite: 'hinterlands.cpp:230 not escorting → no aggro texts',
    };
  }
  let outrunnerTextId: number | null = null;
  let nextByOutrunner = isByOutrunner;
  if (whoEntry === NPC_OUTRUNNER && !isByOutrunner) {
    outrunnerTextId = SAY_RIN_BY_OUTRUNNER;
    nextByOutrunner = true;
  }
  // urand(0,3) truthy (1,2,3) → return early without help yell
  if (skipRoll !== 0) {
    return {
      outrunnerTextId,
      helpTextId: null,
      isByOutrunner: nextByOutrunner,
      cite: 'hinterlands.cpp:238-239 urand(0,3) non-zero → skip help yell',
    };
  }
  return {
    outrunnerTextId,
    helpTextId: helpRoll === 0 ? SAY_RIN_HELP_1 : SAY_RIN_HELP_2,
    isByOutrunner: nextByOutrunner,
    cite: 'hinterlands.cpp:242 urand(0,1) ? SAY_RIN_HELP_1 : SAY_RIN_HELP_2',
  };
}

// Pure helpers — event_wildhammer_message

export interface WildhammerMessageResult {
  handled: boolean;
  /** Require player source. */
  requiresPlayer: boolean;
  /** UpdatePvP(true). */
  setPvP: boolean;
  /** RemoveAurasWithInterruptFlags(AURA_INTERRUPT_FLAG_PVP_ACTIVE_CANCELS). */
  removePvPCancelAuras: boolean;
  falstadEntry: number;
  yellTextId: number;
  cite: string;
}

// Port of ProcessEventId_WildhammerMessage.
// Cite: hinterlands.cpp:363–374.
export function processWildhammerMessage(isPlayer: boolean): WildhammerMessageResult {
  if (!isPlayer) {
    return {
      handled: true,
      requiresPlayer: true,
      setPvP: false,
      removePvPCancelAuras: false,
      falstadEntry: NPC_FALSTAD_WILDHAMMER,
      yellTextId: YELL_FALSTAD_INVADERS,
      cite: 'hinterlands.cpp:365-366 !IsPlayer → return true (no side effects)',
    };
  }
  return {
    handled: true,
    requiresPlayer: true,
    setPvP: true,
    removePvPCancelAuras: true,
    falstadEntry: NPC_FALSTAD_WILDHAMMER,
    yellTextId: YELL_FALSTAD_INVADERS,
    cite: 'hinterlands.cpp:368-372 UpdatePvP + strip PvP-cancel auras + Falstad yell',
  };
}

// npc_00x09hl

// npc_00x09hlAI, creature 7806. No combat cast timers — Reset only clears the summon count. The
// escort ambush and quest credit are waypoint helpers. Vile Ambusher 7809 is absent from bake.
export const NPC_00X09HL_SCRIPT: ScriptDevIR = {
  name: 'npc_00x09hl',
  boundCreatures: [NPC_OOX_09_HL],
  sourceFile: 'eastern_kingdoms/hinterlands.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {
    onAggro: [
      {
        kind: 'yell',
        textId: SAY_OOX_AGGRO1,
        cite: 'hinterlands.cpp:122-128 Aggro: skip owl/ambusher else urand SAY_OOX_AGGRO1/2 (ooxAggroYell)',
      },
    ],
    onDeath: [
      {
        kind: 'force_despawn',
        delayMs: 0,
        cite: 'hinterlands.cpp:137-145 JustDied ForcedDespawn all tracked summons',
      },
    ],
    onReset: [
      {
        kind: 'flavor',
        text: 'UNIT_STAND_STATE_DEAD (OOC only)',
        cite: 'hinterlands.cpp:67 SetStandState(UNIT_STAND_STATE_DEAD) when not escorting',
      },
    ],
  },
  unusedBindings: [
    {
      entry: NPC_VILE_AMBUSHER,
      kind: 'creature',
      reason:
        'NPC 7809 Vile Ambusher is escort-summon-only at OOX WP45 start (hinterlands.cpp:110-116); absent from product bake - IR ported; GetRandomPoint center + TEMPSPAWN 25000 documented in OOX_AMBUSHER_SPAWN_CENTER / ooxWaypointStart',
      cite: 'hinterlands.cpp:52,106-118,130-134; loadRealBundle missing 7809',
    },
  ],
  cites: [
    'hinterlands.cpp:37-166 npc_00x09hl',
    'hinterlands.cpp:62-68 Reset summonCount + DEAD stand (no combat timers)',
    'hinterlands.cpp:71-87 WaypointReached WP27/44/65',
    'hinterlands.cpp:89-120 WaypointStart WP28/45 ambush summons',
    'hinterlands.cpp:102,116 TEMPSPAWN_CORPSE_TIMED_DESPAWN 25000',
    'hinterlands.cpp:122-128 Aggro yell branch',
    'hinterlands.cpp:130-134 JustSummoned MovePoint to OOX',
    'hinterlands.cpp:137-145 JustDied despawn summons',
    'hinterlands.cpp:148-161 QuestAccept 836 SAY_OOX_START + stand + faction 495 + Start',
    'hinterlands.cpp:49-52 QUEST_RESQUE_OOX_09=836 NPC_MARAUDING_OWL=7808 NPC_VILE_AMBUSHER=7809',
  ],
};

// npc_rinji

// npc_rinjiAI, creature 7780. No combat cast timers — Reset arms the post-event timer only. The
// ambushes, quest credit and post-event chat are pure helpers; 2694 and 2691 are in bake.
export const NPC_RINJI_SCRIPT: ScriptDevIR = {
  name: 'npc_rinji',
  boundCreatures: [NPC_RINJI],
  sourceFile: 'eastern_kingdoms/hinterlands.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {
    onAggro: [
      {
        kind: 'yell',
        textId: SAY_RIN_HELP_1,
        cite: 'hinterlands.cpp:229-244 Aggro escort: Outrunner one-shot + 25% help (rinjiAggroYell)',
      },
    ],
    onReset: [
      {
        kind: 'flavor',
        text: `m_uiPostEventTimer=${RINJI_POST_EVENT_TIMER_MS} m_uiPostEventCount=0`,
        cite: 'hinterlands.cpp:214-218 Reset post-event timer 3000 / count 0',
      },
    ],
  },
  cites: [
    'hinterlands.cpp:168-356 npc_rinji',
    'hinterlands.cpp:214-218 Reset post-event (no combat cast timers)',
    'hinterlands.cpp:220-227 JustRespawned clear outrunner flag + spawnId',
    'hinterlands.cpp:229-244 Aggro outrunner + help yells',
    'hinterlands.cpp:246-261 DoSpawnAmbush 1×2694 + 2×2691 TEMPSPAWN 60000',
    'hinterlands.cpp:263-267 JustSummoned MovePoint ambush move-to',
    'hinterlands.cpp:269-294 WaypointReached WP2/8/14/18',
    'hinterlands.cpp:296-335 UpdateEscortAI post-event 3000ms texts',
    'hinterlands.cpp:338-351 QuestAccept 2742 cage + Start + clear IMMUNE_TO_NPC',
    'hinterlands.cpp:182-185 QUEST_RINJI_TRAPPED=2742 NPC_RANGER=2694 NPC_OUTRUNNER=2691 GO_RINJI_CAGE=142036',
  ],
};

// event_wildhammer_message

// ProcessEventId_WildhammerMessage, scriptdev2.sql event 8608 with no creature ScriptName. A
// player source updates PvP, strips the cancel auras and has Falstad 5635 yell.
export const EVENT_WILDHAMMER_MESSAGE: ScriptDevIR = {
  name: 'event_wildhammer_message',
  boundCreatures: [],
  sourceFile: 'eastern_kingdoms/hinterlands.cpp',
  spellIds: [],
  timers: [],
  goUse: {
    goEntries: [],
    actions: [
      {
        kind: 'yell',
        textId: YELL_FALSTAD_INVADERS,
        cite: 'hinterlands.cpp:371-372 DoScriptText(YELL_FALSTAD_INVADERS, falstad, player)',
      },
      {
        kind: 'flavor',
        text: 'UpdatePvP(true) + RemoveAurasWithInterruptFlags(PVP_ACTIVE_CANCELS)',
        cite: 'hinterlands.cpp:369-370 player PvP arm + strip cancel auras',
      },
    ],
    cite: 'hinterlands.cpp:363-374 ProcessEventId_WildhammerMessage; scriptdev2.sql:387 event 8608',
  },
  unusedBindings: [
    {
      // Event scripts have no creature_template.ScriptName; document Falstad as
      // storage-lookup yell source (present in bake as NPC 5635, not a ScriptName bind).
      entry: NPC_FALSTAD_WILDHAMMER,
      kind: 'creature',
      reason:
        'event_wildhammer_message is a ProcessEventId script (event 8608) with no creature_template.ScriptName - corpus boundCreatures []. Falstad 5635 is GetSingleCreatureFromStorage yell source (world_eastern_kingdoms.h:14); in bake as static NPC but not this script binding.',
      cite: 'hinterlands.cpp:371-372; world_eastern_kingdoms.h:14; scriptdev2.sql:387',
    },
  ],
  cites: [
    'hinterlands.cpp:358-374 event_wildhammer_message',
    'hinterlands.cpp:360 YELL_FALSTAD_INVADERS=-27',
    'world_eastern_kingdoms.h:14 NPC_FALSTAD_WILDHAMMER=5635',
    'scriptdev2.sql:387 event 8608',
    'hinterlands.cpp:407-410 RegisterSelf pProcessEventId',
  ],
};
