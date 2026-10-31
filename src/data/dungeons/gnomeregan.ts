// Gnomeregan (map 90) — InstanceDef graph. Authority: docs/dungeons/survey/07-gnomeregan.md.
// Pack sizes from the rounded static census; Grubbis waves and the Thermaplugg 50% phase degrade.

import type { EncounterDef, EncounterEvent, InstanceDef } from '../schema.ts';
import {
  entranceForInstance,
  buildClusterEncounters,
} from './pack-from-clusters.ts';
import { registerEscortDef, type EscortDef, type EscortWaypoint } from '../../world/escort.ts';

// ---- Rounded static expected counts (map 90) ----
// No strip list: cluster packing class-gates friendly factions. 7897 Alarm-a-bomb 2600 is kept.

const STATIC = {
  burrower: 32, // 6206 Caverndeep Burrower - Math.round(32.2)
  pillager: 34, // 6329 Irradiated Pillager - Math.round(34.2)
  reaver: 18, // 6211 Caverndeep Reaver - Math.round(17.7)
  slime: 6, // 6218 Irradiated Slime - Math.round(6.3)
  lurker: 6, // 6219 Corrosive Lurker - Math.round(6.3)
  horror: 6, // 6220 Irradiated Horror - Math.round(6.3)
  defender: 9, // 6223 Leprous Defender
  sentry: 30, // 6233 Mechanized Sentry
  medic: 4, // 6392 Holdout Medic - Math.round(3.5)
  holdoutTech: 2, // 6407 Holdout Technician
  warrior: 9, // 6391 Holdout Warrior - Math.round(8.5)
  tank: 7, // 6225 Mechano-Tank
  flamewalker: 8, // 6226 Mechano-Flamewalker
  peacekeeper: 4, // 6230 Peacekeeper Security Suit
  guardian: 12, // 6234 Mechanized Guardian
  frostwalker: 8, // 6227 Mechano-Frostwalker
  nullifier: 12, // 6232 Arcane Nullifier X-21
  agent: 34, // 6212 Dark Iron Agent
  ambusher: 5, // 6207 Caverndeep Ambusher - static only (event temps on waves)
  alert: 5, // 7849 Mobile Alert System
  assistant: 92, // 7603 Leprous Assistant
  machinesmith: 26, // 6224 Leprous Machinesmith
  technician: 24, // 6222 Leprous Technician
} as const;

/** Exported for tests - rounded static trash targets (hostile combat only). */
export const GNOMEREGAN_STATIC = STATIC;

const ENTRY = {
  burrower: 6206,
  pillager: 6329,
  reaver: 6211,
  slime: 6218,
  lurker: 6219,
  horror: 6220,
  defender: 6223,
  sentry: 6233,
  medic: 6392,
  holdoutTech: 6407,
  warrior: 6391,
  tank: 6225,
  flamewalker: 6226,
  peacekeeper: 6230,
  guardian: 6234,
  frostwalker: 6227,
  nullifier: 6232,
  agent: 6212,
  ambusher: 6207,
  alert: 7849,
  assistant: 7603,
  machinesmith: 6224,
  technician: 6222,
  // Bosses (canonical survey order)
  grubbis: 7361,
  fallout: 7079,
  electrocutioner: 6235,
  pummeler: 6229,
  ambassador: 6228,
  thermaplugg: 7800,
  // Event / summon-only (0 static on map 90; present in creatures.json bake)
  chomper: 6215, // Cite: creatures.json entry 6215 "Chomper"; gnomeregan.cpp:79 NPC_CHOMPER
  walkingBomb: 7915, // Cite: creatures.json entry 7915; boss_thermaplugg.cpp:54 NPC_WALKING_BOMB
} as const;

/** Survey event choreography - Grubbis cave-in packs 1–7 (timers degraded to player-paced waves). */
export const GNOMEREGAN_GRUBBIS_WAVES = [
  { pack: [{ creatureEntry: ENTRY.ambusher, count: 9 }] }, // pack 1: 6207×9
  { pack: [{ creatureEntry: ENTRY.ambusher, count: 4 }] }, // pack 2: 6207×4
  { pack: [{ creatureEntry: ENTRY.ambusher, count: 2 }] }, // pack 3: 6207×2
  { pack: [{ creatureEntry: ENTRY.ambusher, count: 4 }] }, // pack 4: 6207×4
  {
    pack: [
      { creatureEntry: ENTRY.ambusher, count: 3 },
      { creatureEntry: ENTRY.burrower, count: 1 },
    ],
  }, // pack 5: 6207×3 + 6206×1
  { pack: [{ creatureEntry: ENTRY.ambusher, count: 8 }] }, // pack 6: 6207×8
  {
    pack: [
      { creatureEntry: ENTRY.grubbis, count: 1 },
      { creatureEntry: ENTRY.chomper, count: 1 },
    ],
  }, // pack 7 finale: Grubbis 7361 + Chomper 6215
] as const;

/** Flags from survey instance_gnomeregan.cpp TYPE_* (string form for DSL). */
export const GNOMEREGAN_FLAGS = {
  grubbisDone: 'gnomeregan-grubbis-done',
  falloutDone: 'gnomeregan-fallout-done',
  electrocutionerDone: 'gnomeregan-electrocutioner-done',
  /** Workshop Door 90858 — Workshop Key 6893 (Electrocutioner 6235 100%). */
  workshopDoor: 'gnomeregan-workshop-door',
  thermapluggPhase2: 'gnomeregan-thermaplugg-phase-2',
  thermapluggDone: 'gnomeregan-thermaplugg-done',
} as const;

// Grubbis cave-in — pack table already on GNOMEREGAN_GRUBBIS_WAVES (do not rebuild). Cite:
// gnomeregan.cpp:90-131 asSummonInfo packs 1–7; floorGauntletWaves lastHas primary.

/** Grubbis event constants. Cite: gnomeregan.cpp + gnomeregan.h. */
export const GRUBBIS = {
  encId: 'grubbis-event',
  entry: ENTRY.grubbis, // 7361
  chomperEntry: ENTRY.chomper, // 6215
  ambusherEntry: ENTRY.ambusher, // 6207
  burrowerEntry: ENTRY.burrower, // 6206
  emiEntry: 7998, // NPC_BLASTMASTER_SHORTFUSE
  /** asSummonInfo packs 1–7. Cite: gnomeregan.cpp:90-131 */
  waveCount: 7,
  /** Cave-in GOs. Cite: gnomeregan.h:27-28 */
  caveInSouth: 146086,
  caveInNorth: 146085,
  explosiveCharge: 144065,
  /** Post-DONE red rockets. Cite: gnomeregan.h:26; instance_gnomeregan.cpp:130-131 */
  redRocket: 103820,
} as const;

/** Pure: pack sizes per wave from asSummonInfo (probe-locked). */
export function grubbisWaveCreatureCount(waveIndex1Based: number): number {
  const w = GNOMEREGAN_GRUBBIS_WAVES[waveIndex1Based - 1];
  if (!w) return 0;
  return w.pack.reduce((n, p) => n + p.count, 0);
}

// Viscous Fallout 7079 — no ScriptDev / no EventAI in Classic sources (melee). Cite: classic-db
// 090_gnomeregan.sql creature_movement_template 7079; bake spells=[].

export const VISCOUS_FALLOUT = {
  encId: 'viscous-fallout',
  entry: ENTRY.fallout, // 7079
  /** Bake + EventAI inventory: no cast schedule. */
  bossSpells: [] as readonly number[],
} as const;

// Electrocutioner 6000 6235 — EventAI 623501–04. Cite: docs/aifid/eventai-missing-scripts.json entry 6235;
// bake spells [11082,11085,11084].

// Workshop Door. Lock 92 is Workshop Key 6893 (Electrocutioner 6235 100%) or picklock 150. Cite:
// dungeonGameObjects map 90; locks.json 92; creature_loot 6235.
export const GNOMEREGAN_WORKSHOP_DOOR = {
  goEntry: 90858,
  requiredItem: 6893,
  spawn: { x: -758.538, y: 260.386, z: -273.049 },
} as const;

export const ELECTROCUTIONER = {
  encId: 'electrocutioner-6000',
  entry: ENTRY.electrocutioner, // 6235
  /** 623502 CAST Megavolt. */
  spellMegavolt: 11082,
  /** 623503 CAST Shock. */
  spellShock: 11084,
  /** 623504 CAST Chain Bolt. */
  spellChainBolt: 11085,
  /** event_param1/2 initial; param3/4 re-arm. Cite: EventAI 623502. */
  megavoltInitialMinMs: 5_000,
  megavoltInitialMaxMs: 20_000,
  megavoltRepeatMinMs: 14_500,
  megavoltRepeatMaxMs: 27_400,
  /** EventAI 623503. */
  shockInitialMinMs: 12_000,
  shockInitialMaxMs: 26_500,
  shockRepeatMinMs: 10_900,
  shockRepeatMaxMs: 27_300,
  /** EventAI 623504. */
  chainBoltInitialMinMs: 17_200,
  chainBoltInitialMaxMs: 33_700,
  chainBoltRepeatMinMs: 17_800,
  chainBoltRepeatMaxMs: 38_300,
} as const;

// Mekgineer Thermaplugg 7800 — bomb-face fight. ScriptDev IR owns the kit timers and the 50% phase;
// product owns multi-face bomb pressure and button counterplay. Cite: boss_thermaplugg.cpp.

export const THERMAPLUGG = {
  encId: 'mekgineer-thermaplugg',
  entry: ENTRY.thermaplugg, // 7800
  walkingBombEntry: ENTRY.walkingBomb, // 7915
  /** boss_thermaplugg.cpp:50 SPELL_KNOCK_AWAY */
  spellKnockAway: 10101,
  /** boss_thermaplugg.cpp:51 SPELL_KNOCK_AWAY_AOE */
  spellKnockAwayAoe: 11130,
  /** boss_thermaplugg.cpp:36 SPELL_ACTIVATE_BOMB_A */
  spellActivateBombA: 11511,
  /** boss_thermaplugg.cpp:43 SPELL_ACTIVATE_BOMB_B */
  spellActivateBombB: 11795,
  /** boss_thermaplugg.cpp:52 SPELL_WALKING_BOMB_EFFECT */
  spellWalkingBombEffect: 11504,
  /** boss_thermaplugg.cpp:181 GetHealthPercent() < 50.0f */
  phaseTwoHpPct: 50,
  /** gnomeregan.h:11 MAX_GNOME_FACES */
  maxFaces: 6,
  // Face index activated on TYPE_THERMAPLUGG IN_PROGRESS. Cite: instance_gnomeregan.cpp:179
  // DoActivateBombFace(2)
  aggroFaceIndex: 2,
  /** instance_gnomeregan.cpp:259 m_uiBombTimer = 3000 */
  firstBombSpawnMs: 3_000,
  /** boss_thermaplugg.cpp:232 urand(10000, 25000) */
  bombRespawnMinMs: 10_000,
  bombRespawnMaxMs: 25_000,
  /** boss_thermaplugg.cpp:82 urand(10000, 15000) */
  activateBombInitMinMs: 10_000,
  activateBombInitMaxMs: 15_000,
  /** boss_thermaplugg.cpp:207 p1 urand(12,17)*1000 */
  activateBombP1MinMs: 12_000,
  activateBombP1MaxMs: 17_000,
  /** boss_thermaplugg.cpp:207 p2 urand(6,12)*1000 */
  activateBombP2MinMs: 6_000,
  activateBombP2MaxMs: 12_000,
  /** boss_thermaplugg.cpp:81 urand(12000, 20000) */
  knockInitMinMs: 12_000,
  knockInitMaxMs: 20_000,
  /** boss_thermaplugg.cpp:197 p1 urand(17000, 20000) */
  knockP1MinMs: 17_000,
  knockP1MaxMs: 20_000,
  /** boss_thermaplugg.cpp:192 p2 = 12000 */
  knockP2Ms: 12_000,
  /** gnomeregan.h:32-37 gnome faces (button index 0..5). */
  gnomeFaceGos: [142211, 142210, 142209, 142208, 142213, 142212] as const,
  /** gnomeregan.h:39-44 GO_BUTTON_1..6 */
  buttonGos: [142214, 142215, 142216, 142217, 142218, 142219] as const,
  /** gnomeregan.h:30 GO_THE_FINAL_CHAMBER */
  finalChamberGo: 142207,
} as const;

export type ThermapluggBombFace = {
  index: number;
  activated: boolean;
  /** ms remaining until next Walking Bomb spawn while activated. */
  bombTimerMs: number;
};

export type ThermapluggFightState = {
  engaged: boolean;
  phaseTwo: boolean;
  faces: ThermapluggBombFace[];
};

/** Fresh fight state (all faces off). Cite: instance_gnomeregan.cpp:38-42 Initialize. */
export function createThermapluggFightState(): ThermapluggFightState {
  return {
    engaged: false,
    phaseTwo: false,
    faces: Array.from({ length: THERMAPLUGG.maxFaces }, (_, i) => ({
      index: i,
      activated: false,
      bombTimerMs: 0,
    })),
  };
}

// TYPE_THERMAPLUGG IN_PROGRESS — engage + activate face index 2. Cite: boss_thermaplugg.cpp:114-122;
// instance_gnomeregan.cpp:168-179.
export function thermapluggOnAggro(state: ThermapluggFightState): ThermapluggFightState {
  const next = cloneThermapluggState(state);
  next.engaged = true;
  return thermapluggActivateFace(next, THERMAPLUGG.aggroFaceIndex);
}

/** Phase two once at hp < 50%. Cite: boss_thermaplugg.cpp:181-185. */
export function thermapluggEnterPhaseTwo(
  state: ThermapluggFightState,
  hpPct: number,
): ThermapluggFightState {
  if (state.phaseTwo) return state;
  if (hpPct >= THERMAPLUGG.phaseTwoHpPct) return state;
  const next = cloneThermapluggState(state);
  next.phaseTwo = true;
  return next;
}

// ActivateBombThermaplugg — random face. Cite: boss_thermaplugg.cpp:259 urand(0, MAX-1). Face already
// active is a no-op (instance_gnomeregan.cpp:255).
export function thermapluggActivateFace(
  state: ThermapluggFightState,
  faceIndex: number,
): ThermapluggFightState {
  if (faceIndex < 0 || faceIndex >= THERMAPLUGG.maxFaces) return state;
  const next = cloneThermapluggState(state);
  const face = next.faces[faceIndex]!;
  if (face.activated) return next;
  face.activated = true;
  face.bombTimerMs = THERMAPLUGG.firstBombSpawnMs;
  return next;
}

// GOUse_go_gnomeface_button — deactivate face. Cite: boss_thermaplugg.cpp:272-277. Button entries map
// 142214→0 … 142219→5.
export function thermapluggButtonFaceIndex(goEntry: number): number | null {
  const i = (THERMAPLUGG.buttonGos as readonly number[]).indexOf(goEntry);
  return i >= 0 ? i : null;
}

// Is this gnomeface button worth pressing? Only if the face it maps to is LIT — DoDeactivateBombFace
// no-ops on a dark face. Cite: instance_gnomeregan.cpp:264-273; boss_thermaplugg.cpp:263-281.
export function thermapluggButtonIsLive(
  state: ThermapluggFightState | undefined,
  goEntry: number,
): boolean {
  if (!state?.engaged) return false;
  const i = thermapluggButtonFaceIndex(goEntry);
  return i != null && state.faces[i]?.activated === true;
}

export function thermapluggDeactivateFace(
  state: ThermapluggFightState,
  faceIndex: number,
): ThermapluggFightState {
  if (faceIndex < 0 || faceIndex >= THERMAPLUGG.maxFaces) return state;
  const next = cloneThermapluggState(state);
  const face = next.faces[faceIndex]!;
  if (!face.activated) return next;
  face.activated = false;
  face.bombTimerMs = 0;
  return next;
}

// Pure: Walking Bombs only spawn while engaged and at least one face is active. Negative probe:
// engaged=false → 0. Cite: boss_thermaplugg.cpp:167-168 + :216-237.
export function thermapluggBombsCanSpawn(state: ThermapluggFightState): boolean {
  if (!state.engaged) return false;
  return state.faces.some((f) => f.activated);
}

// Tick active faces and return how many Walking Bombs to spawn, one per face timer fire. Uses the
// min respawn bound for deterministic probes. Cite: boss_thermaplugg.cpp:218-236.
export function thermapluggTickBombs(
  state: ThermapluggFightState,
  dtMs: number,
  respawnMs: number = THERMAPLUGG.bombRespawnMinMs,
): { state: ThermapluggFightState; spawnCount: number } {
  if (!thermapluggBombsCanSpawn(state) || dtMs <= 0) {
    return { state, spawnCount: 0 };
  }
  const next = cloneThermapluggState(state);
  let spawnCount = 0;
  for (const face of next.faces) {
    if (!face.activated) continue;
    face.bombTimerMs -= dtMs;
    while (face.bombTimerMs <= 0) {
      spawnCount += 1;
      face.bombTimerMs += respawnMs;
    }
  }
  return { state: next, spawnCount };
}

/** Count of currently activated faces (0–6). */
export function thermapluggActiveFaceCount(state: ThermapluggFightState): number {
  return state.faces.reduce((n, f) => n + (f.activated ? 1 : 0), 0);
}

function cloneThermapluggState(state: ThermapluggFightState): ThermapluggFightState {
  return {
    engaged: state.engaged,
    phaseTwo: state.phaseTwo,
    faces: state.faces.map((f) => ({ ...f })),
  };
}

// Kernobee 7850, quest 2904: Classic uses FollowerAI, not script_waypoint — credit within
// 2× INTERACTION_DISTANCE of the end position, then he walks out. Cite: gnomeregan.cpp L643-706.
export const KERNOBEE_END = {
  /** Credit position — gnomeregan.cpp aKernobeePositions[0]. */
  credit: { x: -330.92, y: -3.03, z: -152.85 },
  /** Post-credit door walk — aKernobeePositions[1]. */
  exit: { x: -297.32, y: -7.32, z: -152.85 },
} as const;

// Sparse escort polyline: start is the talked-to Kernobee spawn (override in startEscort); WP1 = credit
// end, WP2 = door exit. Point ids match creditPoint / done.
export const KERNOBEE_WAYPOINTS: readonly EscortWaypoint[] = [
  { point: 1, x: KERNOBEE_END.credit.x, y: KERNOBEE_END.credit.y, z: KERNOBEE_END.credit.z },
  { point: 2, x: KERNOBEE_END.exit.x, y: KERNOBEE_END.exit.y, z: KERNOBEE_END.exit.z },
] as const;

export const KERNOBEE_ESCORT: EscortDef = {
  id: 'kernobee-2904',
  questId: 2904,
  npcEntry: 7850,
  mapId: 90,
  instanceId: 'gnomeregan',
  waypoints: KERNOBEE_WAYPOINTS,
  creditPoint: 1,
  // Follower-like: stay near party or pause (Classic follows player).
  maxPartyDistYd: 50,
};

registerEscortDef(KERNOBEE_ESCORT);

// Blastmaster Emi (7998) path. Cite: scriptdev2.sql script_waypoint 7998 pts 1–19.
// GAP residual: live floor does not gossip-start escort; waves stay player-paced (not WP-timer).
export const EMI_WAYPOINTS: readonly EscortWaypoint[] = [
  { point: 1, x: -510.13, y: -132.69, z: -152.5 },
  { point: 2, x: -511.099, y: -129.74, z: -153.845 },
  { point: 3, x: -511.79, y: -127.476, z: -155.551 },
  { point: 4, x: -512.969, y: -124.926, z: -156.115, waitMs: 5_000 },
  { point: 5, x: -513.972, y: -120.236, z: -156.116 },
  { point: 6, x: -514.388, y: -115.19, z: -156.117 },
  { point: 7, x: -514.304, y: -111.478, z: -155.52 },
  { point: 8, x: -514.84, y: -107.663, z: -154.893 },
  { point: 9, x: -518.994, y: -101.416, z: -154.648, waitMs: 27_000 },
  { point: 10, x: -526.998, y: -98.1488, z: -155.625 },
  { point: 11, x: -534.569, y: -105.41, z: -155.989, waitMs: 30_000 },
  { point: 12, x: -535.534, y: -104.695, z: -155.971 },
  { point: 13, x: -541.63, y: -98.6583, z: -155.858, waitMs: 25_000 },
  { point: 14, x: -535.092, y: -99.9175, z: -155.974 },
  { point: 15, x: -519.01, y: -101.51, z: -154.677, waitMs: 3_000 },
  { point: 16, x: -504.466, y: -97.848, z: -150.955, waitMs: 30_000 },
  { point: 17, x: -506.907, y: -89.1474, z: -151.083, waitMs: 23_000 },
  { point: 18, x: -512.758, y: -101.902, z: -153.198 },
  // Classic WaitTime 86400000 holds NPC at end (no reset). Cite: scriptdev2.sql 7998 point 19 comment.
  { point: 19, x: -519.988, y: -124.848, z: -156.128, waitMs: 86_400_000 },
] as const;

// asSummonInfo pack at ambush WP. Cite: gnomeregan.cpp:398/403/418/486/491/506/538 DoSummonPack.
// Pack 5 (phase 26 post-WP16) shares WP 16 with pack 4 — residual to player-paced waves.
export const EMI_AMBUSH_PACK: Readonly<Record<number, number>> = {
  10: 1,
  11: 2,
  13: 3,
  16: 4,
  17: 6,
  19: 7,
};

/** Pure: asSummonInfo pack for an Emi ambush point, or 0 if none. */
export function emiAmbushPack(point: number): number {
  return EMI_AMBUSH_PACK[point] ?? 0;
}

export const EMI_ESCORT: EscortDef = {
  id: 'emi-grubbis',
  /** No quest — gossip starts TYPE_GRUBBIS. questId 0 for registry shape. */
  questId: 0,
  npcEntry: 7998,
  mapId: 90,
  instanceId: 'gnomeregan',
  waypoints: EMI_WAYPOINTS,
  creditPoint: 19,
  ambushPoints: [10, 11, 13, 16, 17, 19],
  maxPartyDistYd: 50,
};

registerEscortDef(EMI_ESCORT);

// Rare pool 45701: 30% 6228 / 70% substitute. Cite: pools.json id 45701.
// dungeonSpawns remaps pool guids → 9000180 (6228) / 9000050 (6212).
export const DARK_IRON_AMBASSADOR = {
  encId: 'dark-iron-ambassador',
  entry: ENTRY.ambassador, // 6228
  poolId: 45701,
  rareChancePct: 30, // pools.json 45701 rare member chance
  substituteChancePct: 70, // pools.json 45701 substitute member chance
  poolRareGuid: 900180, // pools.json; attaches rollDungeonPools
  poolSubstituteGuid: 900050, // pools.json
  spawnGuid: 9000180, // dungeonSpawns maps.90 entry 6228
  substituteSpawnGuid: 9000050, // dungeonSpawns maps.90 entry 6212 co-located
  origin: { x: -670.911, y: 686.071, z: -326.812 }, // dungeonSpawns 9000180
} as const;

/** Split a static spawn count into pack sizes in [2, 5] (prefer 4). Remainder 1 folded into prior pack. */
export function splitPackSizes(total: number, prefer = 4): number[] {
  if (total <= 0) return [];
  if (total === 1) return [1];
  const packs: number[] = [];
  let left = total;
  while (left > 0) {
    if (left <= 5) {
      packs.push(left);
      break;
    }
    let n = prefer;
    const rem = left - n;
    if (rem === 1) n = prefer - 1; // leave 2+
    packs.push(n);
    left -= n;
  }
  return packs;
}

function trashPull(
  id: string,
  name: string,
  creatureEntry: number,
  count: number,
  events?: EncounterEvent[],
): EncounterDef {
  const enc: EncounterDef = {
    id,
    name,
    kind: 'trash',
    creatureEntry,
  };
  if (count > 1) enc.pack = [{ creatureEntry, count: count - 1 }];
  if (events && events.length) enc.events = events;
  return enc;
}

/** Expand one census entry into ordered trash pulls (ids `${prefix}-0` …). */
function trashFromCensus(
  _prefix: string,
  _displayName: string,
  _creatureEntry: number,
  _total: number,
): EncounterDef[] {
  // DP1: cluster packs supply trash; hand spine keeps bosses/events only.
  return [];
}

// Boss spells come from the bake's creature.spells; no invented ids. Grubbis and Viscous Fallout
// are melee, Electrocutioner is EventAI 623502–04, and Thermaplugg's kit is ScriptDev IR.
const BOSS_SPELLS = {
  grubbis: [] as number[],
  fallout: [] as number[],
  // Bake + EventAI: Megavolt 11082, Chain Bolt 11085, Shock 11084 (no 15605).
  electrocutioner: [11082, 11085, 11084],
  pummeler: [16169, 5568, 10887, 8374],
  ambassador: [3053, 16412, 12544, 184, 10870, 9053],
  // Bake 10101; ScriptDev also casts 11130 / 11511 / 11795 (not on creature.spells).
  thermaplugg: [10101, 11130, 11511, 11795],
} as const;

function boss(
  id: string,
  name: string,
  creatureEntry: number,
  bossSpells: readonly number[],
  events?: EncounterEvent[],
  intro?: string,
): EncounterDef {
  const enc: EncounterDef = {
    id,
    name,
    kind: 'boss',
    creatureEntry,
  };
  if (bossSpells.length) enc.bossSpells = [...bossSpells];
  if (intro) enc.intro = intro;
  if (events && events.length) enc.events = events;
  return enc;
}

// Linear encounter graph: entrance troggs → Grubbis cave-in → Fallout → leper halls →
// Electrocutioner → machine halls → Pummeler → Dark Iron → Ambassador → Thermaplugg.
function buildHandSpine(): EncounterDef[] {
  // Entrance / cave band (pre-Grubbis + residual after event)
  const burrowers = trashFromCensus('burrower', 'Caverndeep Burrower', ENTRY.burrower, STATIC.burrower);
  const pillagers = trashFromCensus(
    'pillager',
    'Irradiated Pillager',
    ENTRY.pillager,
    STATIC.pillager,
  );
  const reavers = trashFromCensus('reaver', 'Caverndeep Reaver', ENTRY.reaver, STATIC.reaver);
  const ambushers = trashFromCensus(
    'ambusher',
    'Caverndeep Ambusher',
    ENTRY.ambusher,
    STATIC.ambusher,
  );

  // Fallout / irradiated ooze band
  const slimes = trashFromCensus('slime', 'Irradiated Slime', ENTRY.slime, STATIC.slime);
  const lurkers = trashFromCensus('lurker', 'Corrosive Lurker', ENTRY.lurker, STATIC.lurker);
  const horrors = trashFromCensus('horror', 'Irradiated Horror', ENTRY.horror, STATIC.horror);

  // Leper gnome halls
  const assistants = trashFromCensus(
    'assistant',
    'Leprous Assistant',
    ENTRY.assistant,
    STATIC.assistant,
  );
  const machinesmiths = trashFromCensus(
    'machinesmith',
    'Leprous Machinesmith',
    ENTRY.machinesmith,
    STATIC.machinesmith,
  );
  const technicians = trashFromCensus(
    'technician',
    'Leprous Technician',
    ENTRY.technician,
    STATIC.technician,
  );
  const defenders = trashFromCensus(
    'defender',
    'Leprous Defender',
    ENTRY.defender,
    STATIC.defender,
  );
  const sentries = trashFromCensus('sentry', 'Mechanized Sentry', ENTRY.sentry, STATIC.sentry);
  const alerts = trashFromCensus('alert', 'Mobile Alert System', ENTRY.alert, STATIC.alert);

  // Machine / mechano band
  const tanks = trashFromCensus('mechano-tank', 'Mechano-Tank', ENTRY.tank, STATIC.tank);
  const flamewalkers = trashFromCensus(
    'flamewalker',
    'Mechano-Flamewalker',
    ENTRY.flamewalker,
    STATIC.flamewalker,
  );
  const frostwalkers = trashFromCensus(
    'frostwalker',
    'Mechano-Frostwalker',
    ENTRY.frostwalker,
    STATIC.frostwalker,
  );
  const guardians = trashFromCensus(
    'guardian',
    'Mechanized Guardian',
    ENTRY.guardian,
    STATIC.guardian,
  );
  const nullifiers = trashFromCensus(
    'nullifier',
    'Arcane Nullifier X-21',
    ENTRY.nullifier,
    STATIC.nullifier,
  );
  const peacekeepers = trashFromCensus(
    'peacekeeper',
    'Peacekeeper Security Suit',
    ENTRY.peacekeeper,
    STATIC.peacekeeper,
  );

  // Dark Iron / holdout band (late instance toward Ambassador + Thermaplugg)
  const agents = trashFromCensus('agent', 'Dark Iron Agent', ENTRY.agent, STATIC.agent);
  const warriors = trashFromCensus('holdout-warrior', 'Holdout Warrior', ENTRY.warrior, STATIC.warrior);
  const medics = trashFromCensus('holdout-medic', 'Holdout Medic', ENTRY.medic, STATIC.medic);
  const holdoutTechs = trashFromCensus(
    'holdout-tech',
    'Holdout Technician',
    ENTRY.holdoutTech,
    STATIC.holdoutTech,
  );

  // Interleave entrance trogg pool families
  const entranceCrew: EncounterDef[] = [];
  const maxEnt = Math.max(burrowers.length, pillagers.length, reavers.length);
  for (let i = 0; i < maxEnt; i++) {
    if (burrowers[i]) entranceCrew.push(burrowers[i]!);
    if (pillagers[i]) entranceCrew.push(pillagers[i]!);
    if (reavers[i]) entranceCrew.push(reavers[i]!);
  }
  const entMid = Math.ceil(entranceCrew.length / 2);
  const entrancePre = entranceCrew.slice(0, entMid);
  const entrancePost = entranceCrew.slice(entMid);

  // Leper halls: assistants + machinesmiths + technicians interleaved
  const leperCrew: EncounterDef[] = [];
  const maxLep = Math.max(assistants.length, machinesmiths.length, technicians.length);
  for (let i = 0; i < maxLep; i++) {
    if (assistants[i]) leperCrew.push(assistants[i]!);
    if (machinesmiths[i]) leperCrew.push(machinesmiths[i]!);
    if (technicians[i]) leperCrew.push(technicians[i]!);
  }
  const lepMid = Math.ceil(leperCrew.length / 2);
  const leperPre = leperCrew.slice(0, lepMid);
  const leperPost = leperCrew.slice(lepMid);

  // Mechano band interleaved
  const mechCrew: EncounterDef[] = [];
  const maxMech = Math.max(
    tanks.length,
    flamewalkers.length,
    frostwalkers.length,
    guardians.length,
    nullifiers.length,
  );
  for (let i = 0; i < maxMech; i++) {
    if (tanks[i]) mechCrew.push(tanks[i]!);
    if (flamewalkers[i]) mechCrew.push(flamewalkers[i]!);
    if (frostwalkers[i]) mechCrew.push(frostwalkers[i]!);
    if (guardians[i]) mechCrew.push(guardians[i]!);
    if (nullifiers[i]) mechCrew.push(nullifiers[i]!);
  }
  const mechMid = Math.ceil(mechCrew.length / 2);
  const mechPre = mechCrew.slice(0, mechMid);
  const mechPost = mechCrew.slice(mechMid);

  // Agents split around Ambassador
  const agentMid = Math.ceil(agents.length / 2);
  const agentPre = agents.slice(0, agentMid);
  const agentPost = agents.slice(agentMid);

  const out: EncounterDef[] = [];

  // --- Entrance → Grubbis cave-in event ---
  // EMI_WAYPOINTS/ESCORT authored (script_waypoint 7998). GAP residual: no gossip-start + player-paced waves.
  out.push(...entrancePre, ...ambushers);

  out.push({
    id: 'grubbis-event',
    name: 'Grubbis',
    kind: 'boss',
    creatureEntry: ENTRY.grubbis,
    intro:
      'Blastmaster Emi Shortfuse plants charges at the cave-ins. Troggs pour out - then Grubbis and Chomper.',
    events: [
      {
        kind: 'waves',
        waves: GNOMEREGAN_GRUBBIS_WAVES.map((w) => ({
          pack: w.pack.map((p) => ({ creatureEntry: p.creatureEntry, count: p.count })),
        })),
      },
      { kind: 'setsFlag', flag: GNOMEREGAN_FLAGS.grubbisDone },
    ],
  });

  // --- Grubbis → Viscous Fallout ---
  out.push(...entrancePost, ...slimes, ...lurkers, ...horrors);

  out.push(
    boss(
      'viscous-fallout',
      'Viscous Fallout',
      ENTRY.fallout,
      BOSS_SPELLS.fallout,
      [{ kind: 'setsFlag', flag: GNOMEREGAN_FLAGS.falloutDone }],
      // No ScriptDev / EventAI cast schedule in Classic (melee only).
      'Viscous Fallout seeps through the irradiated tunnels.',
    ),
  );

  // --- Fallout → Electrocutioner 6000 ---
  out.push(
    ...leperPre,
    ...defenders.slice(0, Math.ceil(defenders.length / 2)),
    ...sentries.slice(0, Math.ceil(sentries.length / 2)),
    ...alerts,
  );

  out.push(
    boss(
      'electrocutioner-6000',
      'Electrocutioner 6000',
      ENTRY.electrocutioner,
      BOSS_SPELLS.electrocutioner,
      [{ kind: 'setsFlag', flag: GNOMEREGAN_FLAGS.electrocutionerDone }],
      // EventAI 623502–04: Megavolt / Shock / Chain Bolt (ELECTROCUTIONER timers).
      'Electrocutioner 6000 crackles in the engineering wing.',
    ),
  );

  // --- Electrocutioner → Crowd Pummeler 9-60 ---
  out.push(
    ...leperPost,
    ...defenders.slice(Math.ceil(defenders.length / 2)),
    ...sentries.slice(Math.ceil(sentries.length / 2)),
    ...mechPre,
    ...peacekeepers,
  );

  out.push(
    boss(
      'crowd-pummeler-9-60',
      'Crowd Pummeler 9-60',
      ENTRY.pummeler,
      BOSS_SPELLS.pummeler,
      [
        {
          kind: 'objectGate',
          goEntry: GNOMEREGAN_WORKSHOP_DOOR.goEntry,
          requiredItem: GNOMEREGAN_WORKSHOP_DOOR.requiredItem,
          setsFlag: GNOMEREGAN_FLAGS.workshopDoor,
          once: true,
        },
        { kind: 'requiresFlag', flag: GNOMEREGAN_FLAGS.workshopDoor },
      ],
      'Crowd Pummeler 9-60 whirrs into a thrashing frenzy.',
    ),
  );

  // --- Pummeler → Dark Iron Ambassador (pool 45701 @ 30%) ---
  out.push(...mechPost, ...agentPre, ...warriors, ...medics, ...holdoutTechs);

  // Route 30% via poolRareGuid → rollDungeonPools (pools.json 45701). Residual: floor spawn
  // 9000180 is not a pool member, so the body cannot be hidden until pools remap.
  out.push({
    id: DARK_IRON_AMBASSADOR.encId,
    name: 'Dark Iron Ambassador',
    kind: 'boss',
    creatureEntry: ENTRY.ambassador,
    bossSpells: [...BOSS_SPELLS.ambassador],
    spawnGuids: [DARK_IRON_AMBASSADOR.poolRareGuid],
    origin: { ...DARK_IRON_AMBASSADOR.origin },
    intro: 'A rare Dark Iron Ambassador schemes near the final approaches.',
    optional: true,
  });

  // --- Ambassador → Mekgineer Thermaplugg ---
  out.push(...agentPost);

  // ScriptDev owns combat kit + 50% phase (no InstanceDef hpThreshold — no double-fire).
  // Floor owns multi-face Walking Bomb pressure + 6 button deactivates (THERMAPLUGG helpers).
  out.push(
    boss(
      'mekgineer-thermaplugg',
      'Mekgineer Thermaplugg',
      ENTRY.thermaplugg,
      BOSS_SPELLS.thermaplugg,
      [{ kind: 'setsFlag', flag: GNOMEREGAN_FLAGS.thermapluggDone }],
      'Mekgineer Thermaplugg activates bomb faces - press the six red buttons to shut the vents. Phase two at 50%.',
    ),
  );

  return out;
}

function buildEncounters(): EncounterDef[] {
  // Hand spine = bosses + event-gated packs (mono trashFromCensus is empty).
  const spine = buildHandSpine();
  return buildClusterEncounters({
    mapId: 90,
    spine,
    entrance: entranceForInstance('gnomeregan'),
    
  });
}


/** Survey “Quests completable inside” entry ids (map 90). */
export const GNOMEREGAN_QUESTS = [
  2904, 2924, 2928, 2951, 2952, 2953, 4601, 4602, 4603, 4604, 4605, 4606, 2945, 2947, 2949, 2841,
  2929,
] as const;

export const GNOMEREGAN: InstanceDef = {
  id: 'gnomeregan',
  mapId: 90,
  name: 'Gnomeregan',
  portalZone: 'dunmorogh',
  minLevel: 15, // entrance trigger 324 / 523 requiredLevel
  levelRange: [25, 33], // survey trash band
  lockoutMs: 0,
  description: '',
  quests: [...GNOMEREGAN_QUESTS],
  encounters: buildEncounters(),
};

/** Sum of authored kill supply per creature entry (trash + bosses + waves + threshold spawns). */
export function gnomereganKillSupply(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of GNOMEREGAN.encounters) {
    add(enc.creatureEntry, 1);
    for (const p of enc.pack ?? []) add(p.creatureEntry, p.count);
    for (const ev of enc.events ?? []) {
      if (ev.kind === 'onDeathSummon') add(ev.creatureEntry, 1);
      if (ev.kind === 'waves') {
        for (const w of ev.waves) {
          for (const row of w.pack) add(row.creatureEntry, row.count);
        }
      }
      if (ev.kind === 'hpThreshold' && ev.spawn) {
        for (const row of ev.spawn) add(row.creatureEntry, row.count);
      }
    }
  }
  // waves re-count primary when last/any wave includes creatureEntry - subtract wave rows
  // that duplicate the primary identity for grubbis-event (primary 7361 + finale wave 7361).
  for (const enc of GNOMEREGAN.encounters) {
    const waves = (enc.events ?? []).find((e) => e.kind === 'waves');
    if (!waves || waves.kind !== 'waves') continue;
    // Subtract only the primary entry once if it also appears in any wave pack.
    let primaryInWaves = 0;
    for (const w of waves.waves) {
      for (const row of w.pack) {
        if (row.creatureEntry === enc.creatureEntry) primaryInWaves += row.count;
      }
    }
    if (primaryInWaves > 0) add(enc.creatureEntry, -1); // keep wave count, drop primary double
  }
  return map;
}

// Counts pure static trash packs only (no bosses, no wave tables, no threshold spawns). Used to match
// rounded survey census static totals.
export function gnomereganPureStaticTrashCounts(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of GNOMEREGAN.encounters) {
    if (enc.kind !== 'trash') continue;
    const req = (enc.events ?? []).some((e) => e.kind === 'requiresFlag');
    if (req) continue;
    const hasWaves = (enc.events ?? []).some((e) => e.kind === 'waves');
    if (hasWaves) continue;
    add(enc.creatureEntry, 1);
    for (const p of enc.pack ?? []) add(p.creatureEntry, p.count);
  }
  return map;
}
