// Razorfen Kraul (map 47) — InstanceDef graph. Authority: docs/dungeons/survey/08-razorfen-kraul.md.
// Residuals: Willix fail-on-death, and Aggem's effect-42 summon not reaching injectEnemySummon.

import type { EncounterDef, EncounterEvent, InstanceDef } from '../schema.ts';
import {
  entranceForInstance,
  buildClusterEncounters,
} from './pack-from-clusters.ts';
import { registerEscortDef, type EscortDef, type EscortWaypoint } from '../../world/escort.ts';

// ---- Census static counts (map 47; friendlies + summon-only excluded from packs) ----
// Willix and Heralath are service, Boar Spirit and Earth Rumbler summon-only, Ward Keeper is hand.

const STATIC = {
  spearhide: 2, // 4438 rare-elite
  halmgar: 1, // 4842 rare-elite
  agamar: 15, // 4511
  warrior: 2, // 4435
  ragingAgamar: 15, // 4514 static only (ambush +4 separate)
  geomancer: 4, // 4520
  handler: 4, // 4530
  quilguard: 10, // 4436
  warden: 7, // 4437
  priest: 4, // 4517
  bloodOfAgamaggan: 5, // 4541
  adept: 9, // 4516
  defender: 19, // 4442
  groundshaker: 7, // 4523
  acolyte: 2, // 4515
  seer: 5, // 4519
  beastTrainer: 2, // 4531
  dustweaver: 3, // 4522
  stalker: 4, // 6035
  rottingAgamar: 3, // 4512
  sage: 7, // 4518
  totemic: 4, // 4440
  kraulBat: 13, // 4538
  quilguardChampion: 17, // 4623
  beastmaster: 3, // 4532
  earthbreaker: 5, // 4525
  wardGuardian: 2, // 4427
  greaterKraulBat: 7, // 4539
  wardKeeper: 2, // 4625 - explicit encounters before Agathelos
} as const;

/** Willix escort ambush extras (quest 1144) - not part of STATIC.ragingAgamar. */
export const WILLIX_AMBUSH = {
  entry: 4514, // Raging Agam'ar
  packs: 2, // WP15 + WP45
  perPack: 2, // 2× each → +4 total extra
  /** TEMPSPAWN_TIMED_OOC_DESPAWN. Cite: razorfen_kraul.cpp:107,119 */
  despawnMs: 25_000,
  /** Boar spawn coords at ambush WPs. Cite: razorfen_kraul.cpp aBoarSpawn L60–66. */
  boarSpawns: [
    { x: 2151.420, y: 1733.18, z: 52.10, point: 15 as const },
    { x: 2144.463, y: 1726.89, z: 51.93, point: 15 as const },
    { x: 1956.433, y: 1597.97, z: 81.75, point: 45 as const },
    { x: 1958.971, y: 1599.01, z: 81.44, point: 45 as const },
  ] as const,
} as const;

/** Spawn poses for one Willix ambush WP. Cite: aBoarSpawn + WaypointReached cases 15/45. */
export function willixAmbushSpawns(point: 15 | 45): readonly {
  entry: number;
  x: number;
  y: number;
  z: number;
}[] {
  return WILLIX_AMBUSH.boarSpawns
    .filter((s) => s.point === point)
    .map((s) => ({ entry: WILLIX_AMBUSH.entry, x: s.x, y: s.y, z: s.z }));
}

// Boss add summon spells. Cite: creature_ai_scripts 616803 OOC CAST 8270 and 442402 combat TIMER
// CAST 8286. Roogug's OOC bodyguard becomes a pack; Aggem's is combat TIMER only.
export const RFK_BOSS_ADDS = {
  roogug: {
    bossEntry: 6168,
    encId: 'roogug',
    spellId: 8270,
    summonEntry: 4528,
    count: 1,
    /** OOC once @2s. Cite: creature_ai_scripts 616803 event_type 1 params 2000/2000. */
    when: 'ooc' as const,
  },
  aggem: {
    bossEntry: 4424,
    encId: 'aggem-thorncurse',
    spellId: 8286,
    summonEntry: 6021,
    count: 1,
    /** Cite: creature_ai_scripts 442402 event_type 0 params 4000/12000/20000/45000. */
    initialMinMs: 4_000,
    initialMaxMs: 12_000,
    repeatMinMs: 20_000,
    repeatMaxMs: 45_000,
    when: 'combat' as const,
  },
} as const;

// Blind Hunter rare pool, one roll per instance. Cite: pools.json id 45402 maxLimit 1, members
// guid 4700005 chance 30 and alt 4700162 chance 70.
export const RFK_BLIND_HUNTER_POOL = {
  poolId: 45_402,
  entry: 4425,
  guid: 4_700_005,
  chancePct: 30,
  altGuid: 4_700_162,
  /** Greater Kraul Bat substitute when rare loses. Cite: dungeonSpawns map 47 guid 4700162. */
  altEntry: 4539,
} as const;

// Earthcaller Halmgar rare pool (floor guid roll; not a hand-spine boss pin). Cite: pools.json id 45401
// maxLimit 1; members 4700186 chance 30 / alt 4700129 chance 70.
export const RFK_HALMGAR_POOL = {
  poolId: 45_401,
  entry: 4842,
  guid: 4_700_186,
  chancePct: 30,
  altGuid: 4_700_129,
  /** Razorfen Earthbreaker substitute. Cite: dungeonSpawns map 47 guid 4700129. */
  altEntry: 4525,
} as const;

/** Negative: Willix credit only after escort started and WP46 reached. */
export function willixCanCredit(opts: {
  escortStarted: boolean;
  creditPointReached: boolean;
}): boolean {
  return opts.escortStarted && opts.creditPointReached;
}

// Willix the Importer (4508) script_waypoint path for quest 1144, points 1–47 with WaitTime from
// the SQL. Credit at WP46, ambushes at WP15/45. Cite: razorfen_kraul.cpp:104-128 + aBoarSpawn.
export const WILLIX_WAYPOINTS: readonly EscortWaypoint[] = [
  { point: 1, x: 2194.38, y: 1791.65, z: 65.48, waitMs: 5000 },
  { point: 2, x: 2188.56, y: 1805.87, z: 64.45 },
  { point: 3, x: 2186.2, y: 1836.28, z: 59.859, waitMs: 5000 },
  { point: 4, x: 2163.27, y: 1851.67, z: 56.73 },
  { point: 5, x: 2140.22, y: 1845.02, z: 48.32 },
  { point: 6, x: 2131.5, y: 1804.29, z: 46.85 },
  { point: 7, x: 2096.18, y: 1789.03, z: 51.13, waitMs: 3000 },
  { point: 8, x: 2074.46, y: 1780.09, z: 55.64 },
  { point: 9, x: 2055.12, y: 1768.67, z: 58.46 },
  { point: 10, x: 2037.83, y: 1748.62, z: 60.27, waitMs: 5000 },
  { point: 11, x: 2037.51, y: 1728.94, z: 60.85 },
  { point: 12, x: 2044.7, y: 1711.71, z: 59.71 },
  { point: 13, x: 2067.66, y: 1701.84, z: 57.77 },
  { point: 14, x: 2078.91, y: 1704.54, z: 56.77 },
  { point: 15, x: 2097.65, y: 1715.24, z: 54.74, waitMs: 3000 },
  { point: 16, x: 2106.44, y: 1720.98, z: 54.41 },
  { point: 17, x: 2123.96, y: 1732.56, z: 52.27 },
  { point: 18, x: 2153.82, y: 1728.73, z: 51.92 },
  { point: 19, x: 2163.49, y: 1706.33, z: 54.42 },
  { point: 20, x: 2158.75, y: 1695.98, z: 55.7 },
  { point: 21, x: 2142.6, y: 1680.72, z: 58.24 },
  { point: 22, x: 2118.31, y: 1671.54, z: 59.21 },
  { point: 23, x: 2086.02, y: 1672.04, z: 61.24 },
  { point: 24, x: 2068.81, y: 1658.93, z: 61.24 },
  { point: 25, x: 2062.82, y: 1633.31, z: 64.35 },
  { point: 26, x: 2060.92, y: 1600.11, z: 62.41, waitMs: 3000 },
  { point: 27, x: 2063.05, y: 1589.16, z: 63.26 },
  { point: 28, x: 2063.67, y: 1577.22, z: 65.89 },
  { point: 29, x: 2057.94, y: 1560.68, z: 68.4 },
  { point: 30, x: 2052.56, y: 1548.05, z: 73.35 },
  { point: 31, x: 2045.22, y: 1543.4, z: 76.65 },
  { point: 32, x: 2034.35, y: 1543.01, z: 79.7 },
  { point: 33, x: 2029.95, y: 1542.94, z: 80.79 },
  { point: 34, x: 2021.34, y: 1538.67, z: 80.8 },
  { point: 35, x: 2012.45, y: 1549.48, z: 79.93 },
  { point: 36, x: 2008.05, y: 1554.92, z: 80.44 },
  { point: 37, x: 2006.54, y: 1562.72, z: 81.11 },
  { point: 38, x: 2003.8, y: 1576.43, z: 81.57 },
  { point: 39, x: 2000.57, y: 1590.06, z: 80.62 },
  { point: 40, x: 1998.96, y: 1596.87, z: 80.22 },
  { point: 41, x: 1991.19, y: 1600.82, z: 79.39 },
  { point: 42, x: 1980.71, y: 1601.44, z: 79.77 },
  { point: 43, x: 1967.22, y: 1600.18, z: 80.62 },
  { point: 44, x: 1956.43, y: 1596.97, z: 81.75 },
  { point: 45, x: 1954.87, y: 1592.02, z: 82.18, waitMs: 3000 },
  { point: 46, x: 1948.35, y: 1571.35, z: 80.96, waitMs: 30000 },
  { point: 47, x: 1947.02, y: 1566.42, z: 81.8, waitMs: 30000 },
] as const;

/** Full escort def for quest 1144 — registered at module load. */
export const WILLIX_ESCORT: EscortDef = {
  id: 'willix-1144',
  questId: 1144,
  npcEntry: 4508,
  mapId: 47,
  instanceId: 'razorfen-kraul',
  waypoints: WILLIX_WAYPOINTS,
  creditPoint: 46,
  ambushPoints: [15, 45],
  // Follow distance: generous so floor combat does not freeze the path.
  maxPartyDistYd: 50,
};

registerEscortDef(WILLIX_ESCORT);

const ENTRY = {
  spearhide: 4438,
  halmgar: 4842,
  agamar: 4511,
  warrior: 4435,
  ragingAgamar: 4514,
  geomancer: 4520,
  handler: 4530,
  quilguard: 4436,
  warden: 4437,
  priest: 4517,
  bloodOfAgamaggan: 4541,
  adept: 4516,
  defender: 4442,
  groundshaker: 4523,
  acolyte: 4515,
  seer: 4519,
  beastTrainer: 4531,
  dustweaver: 4522,
  stalker: 6035,
  rottingAgamar: 4512,
  sage: 4518,
  totemic: 4440,
  kraulBat: 4538,
  quilguardChampion: 4623,
  beastmaster: 4532,
  earthbreaker: 4525,
  wardGuardian: 4427,
  greaterKraulBat: 4539,
  wardKeeper: 4625,
  // Bosses (survey canonical order)
  roogug: 6168,
  aggem: 4424,
  jargba: 4428,
  ramtusk: 4420,
  agathelos: 4422,
  blindHunter: 4425,
  charlga: 4421,
} as const;

/** Flags from survey event choreography / instance_razorfen_kraul.cpp. */
export const RAZORFEN_KRAUL_FLAGS = {
  // Both Death's Head Ward Keepers (4625) dead → Agathelos ward unsealed (GO 21099). Modelled as
  // the second keeper encounter setting a flag Agathelos then requires.
  agathelosWard: 'rfk-agathelos-ward',
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
    if (rem === 1) n = prefer - 1;
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
  intro?: string,
): EncounterDef {
  const enc: EncounterDef = {
    id,
    name,
    kind: 'trash',
    creatureEntry,
  };
  if (count > 1) enc.pack = [{ creatureEntry, count: count - 1 }];
  if (events && events.length) enc.events = events;
  if (intro) enc.intro = intro;
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

// Boss spells: creature.spells from bake — no invented ids.
// Blind Hunter 4425: bake null spells → omit. 8270/8286 on kit are EventAI summon casts.
const BOSS_SPELLS = {
  roogug: [9532, 8270],
  aggem: [6192, 8286, 14900],
  jargba: [9613, 14515],
  ramtusk: [7165, 9128, 15548],
  agathelos: [8260, 8285, 8555, 8269],
  charlga: [8292, 8361, 8358, 6077],
} as const;

function boss(
  id: string,
  name: string,
  creatureEntry: number,
  bossSpells?: readonly number[],
  events?: EncounterEvent[],
  intro?: string,
  pack?: { creatureEntry: number; count: number }[],
): EncounterDef {
  const enc: EncounterDef = {
    id,
    name,
    kind: 'boss',
    creatureEntry,
  };
  if (bossSpells && bossSpells.length) enc.bossSpells = [...bossSpells];
  if (intro) enc.intro = intro;
  if (events && events.length) enc.events = events;
  if (pack && pack.length) enc.pack = pack;
  return enc;
}

// Linear encounter graph: entrance trash → bosses in survey order with inter-boss trash, ward-keeper
// gate → Agathelos, Blind Hunter rare, Charlga, then the Willix escort ambush packs.
function buildHandSpine(): EncounterDef[] {
  const agamars = trashFromCensus('agamar', "Agam'ar", ENTRY.agamar, STATIC.agamar);
  const raging = trashFromCensus(
    'raging-agamar',
    "Raging Agam'ar",
    ENTRY.ragingAgamar,
    STATIC.ragingAgamar,
  );
  const warriors = trashFromCensus('warrior', 'Razorfen Warrior', ENTRY.warrior, STATIC.warrior);
  const quilguards = trashFromCensus(
    'quilguard',
    'Razorfen Quilguard',
    ENTRY.quilguard,
    STATIC.quilguard,
  );
  const wardens = trashFromCensus('warden', 'Razorfen Warden', ENTRY.warden, STATIC.warden);
  const geomancers = trashFromCensus(
    'geomancer',
    'Razorfen Geomancer',
    ENTRY.geomancer,
    STATIC.geomancer,
  );
  const handlers = trashFromCensus('handler', 'Razorfen Handler', ENTRY.handler, STATIC.handler);
  const priests = trashFromCensus(
    'deaths-head-priest',
    "Death's Head Priest",
    ENTRY.priest,
    STATIC.priest,
  );
  const adepts = trashFromCensus(
    'deaths-head-adept',
    "Death's Head Adept",
    ENTRY.adept,
    STATIC.adept,
  );
  const defenders = trashFromCensus(
    'defender',
    'Razorfen Defender',
    ENTRY.defender,
    STATIC.defender,
  );
  const groundshakers = trashFromCensus(
    'groundshaker',
    'Razorfen Groundshaker',
    ENTRY.groundshaker,
    STATIC.groundshaker,
  );
  const bloods = trashFromCensus(
    'blood-of-agamaggan',
    'Blood of Agamaggan',
    ENTRY.bloodOfAgamaggan,
    STATIC.bloodOfAgamaggan,
  );
  const acolytes = trashFromCensus(
    'deaths-head-acolyte',
    "Death's Head Acolyte",
    ENTRY.acolyte,
    STATIC.acolyte,
  );
  const seers = trashFromCensus(
    'deaths-head-seer',
    "Death's Head Seer",
    ENTRY.seer,
    STATIC.seer,
  );
  const beastTrainers = trashFromCensus(
    'beast-trainer',
    'Razorfen Beast Trainer',
    ENTRY.beastTrainer,
    STATIC.beastTrainer,
  );
  const dustweavers = trashFromCensus(
    'dustweaver',
    'Razorfen Dustweaver',
    ENTRY.dustweaver,
    STATIC.dustweaver,
  );
  const stalkers = trashFromCensus('stalker', 'Razorfen Stalker', ENTRY.stalker, STATIC.stalker);
  const rotting = trashFromCensus(
    'rotting-agamar',
    "Rotting Agam'ar",
    ENTRY.rottingAgamar,
    STATIC.rottingAgamar,
  );
  const sages = trashFromCensus(
    'deaths-head-sage',
    "Death's Head Sage",
    ENTRY.sage,
    STATIC.sage,
  );
  const totemics = trashFromCensus('totemic', 'Razorfen Totemic', ENTRY.totemic, STATIC.totemic);
  const kraulBats = trashFromCensus('kraul-bat', 'Kraul Bat', ENTRY.kraulBat, STATIC.kraulBat);
  const champions = trashFromCensus(
    'quilguard-champion',
    'Quilguard Champion',
    ENTRY.quilguardChampion,
    STATIC.quilguardChampion,
  );
  const beastmasters = trashFromCensus(
    'beastmaster',
    'Razorfen Beastmaster',
    ENTRY.beastmaster,
    STATIC.beastmaster,
  );
  const earthbreakers = trashFromCensus(
    'earthbreaker',
    'Razorfen Earthbreaker',
    ENTRY.earthbreaker,
    STATIC.earthbreaker,
  );
  const wardGuardians = trashFromCensus(
    'ward-guardian',
    'Ward Guardian',
    ENTRY.wardGuardian,
    STATIC.wardGuardian,
  );
  const greaterBats = trashFromCensus(
    'greater-kraul-bat',
    'Greater Kraul Bat',
    ENTRY.greaterKraulBat,
    STATIC.greaterKraulBat,
  );
  const spearhides = trashFromCensus(
    'spearhide',
    'Razorfen Spearhide',
    ENTRY.spearhide,
    STATIC.spearhide,
  );
  const halmgar = trashFromCensus(
    'earthcaller-halmgar',
    'Earthcaller Halmgar',
    ENTRY.halmgar,
    STATIC.halmgar,
  );

  // Interleave related types for variety within bands.
  const entranceBoars: EncounterDef[] = [];
  {
    const max = Math.max(agamars.length, raging.length, warriors.length);
    for (let i = 0; i < max; i++) {
      if (agamars[i]) entranceBoars.push(agamars[i]!);
      if (raging[i]) entranceBoars.push(raging[i]!);
      if (warriors[i]) entranceBoars.push(warriors[i]!);
    }
  }
  const quilboarFront: EncounterDef[] = [];
  {
    const max = Math.max(quilguards.length, wardens.length, geomancers.length, handlers.length);
    for (let i = 0; i < max; i++) {
      if (quilguards[i]) quilboarFront.push(quilguards[i]!);
      if (wardens[i]) quilboarFront.push(wardens[i]!);
      if (geomancers[i]) quilboarFront.push(geomancers[i]!);
      if (handlers[i]) quilboarFront.push(handlers[i]!);
    }
  }
  const deathsHeadMid: EncounterDef[] = [];
  {
    const max = Math.max(priests.length, adepts.length, acolytes.length, seers.length, sages.length);
    for (let i = 0; i < max; i++) {
      if (priests[i]) deathsHeadMid.push(priests[i]!);
      if (adepts[i]) deathsHeadMid.push(adepts[i]!);
      if (acolytes[i]) deathsHeadMid.push(acolytes[i]!);
      if (seers[i]) deathsHeadMid.push(seers[i]!);
      if (sages[i]) deathsHeadMid.push(sages[i]!);
    }
  }
  const defenderBand: EncounterDef[] = [];
  {
    const max = Math.max(
      defenders.length,
      groundshakers.length,
      totemics.length,
      dustweavers.length,
      stalkers.length,
    );
    for (let i = 0; i < max; i++) {
      if (defenders[i]) defenderBand.push(defenders[i]!);
      if (groundshakers[i]) defenderBand.push(groundshakers[i]!);
      if (totemics[i]) defenderBand.push(totemics[i]!);
      if (dustweavers[i]) defenderBand.push(dustweavers[i]!);
      if (stalkers[i]) defenderBand.push(stalkers[i]!);
    }
  }
  const deepKraul: EncounterDef[] = [];
  {
    const max = Math.max(
      champions.length,
      kraulBats.length,
      greaterBats.length,
      beastmasters.length,
      earthbreakers.length,
      beastTrainers.length,
      rotting.length,
      bloods.length,
    );
    for (let i = 0; i < max; i++) {
      if (champions[i]) deepKraul.push(champions[i]!);
      if (kraulBats[i]) deepKraul.push(kraulBats[i]!);
      if (greaterBats[i]) deepKraul.push(greaterBats[i]!);
      if (beastmasters[i]) deepKraul.push(beastmasters[i]!);
      if (earthbreakers[i]) deepKraul.push(earthbreakers[i]!);
      if (beastTrainers[i]) deepKraul.push(beastTrainers[i]!);
      if (rotting[i]) deepKraul.push(rotting[i]!);
      if (bloods[i]) deepKraul.push(bloods[i]!);
    }
  }

  // Band splits between bosses (spatial-ish; survey has no explicit pull order).
  const entMid = Math.ceil(entranceBoars.length / 2);
  const quiltMid = Math.ceil(quilboarFront.length / 2);
  const dhMid = Math.ceil(deathsHeadMid.length / 2);
  const defMid = Math.ceil(defenderBand.length / 2);
  const deepMid = Math.ceil(deepKraul.length / 2);

  const out: EncounterDef[] = [];

  // --- Entrance → Roogug ---
  out.push(...entranceBoars.slice(0, entMid), ...quilboarFront.slice(0, quiltMid));
  out.push(
    boss(
      'roogug',
      'Roogug',
      ENTRY.roogug,
      BOSS_SPELLS.roogug,
      undefined,
      // Cite: creature_ai_scripts 616803 OOC CAST 8270 → Stone Rumbler 4528 (pack at pull).
      'Roogug, a hulking quilboar, bars the lower tunnels with his earth rumbler.',
      // OOC bodyguard — EventAI 616803; pack shape matches Lethtendris+Pimgib.
      [{ creatureEntry: RFK_BOSS_ADDS.roogug.summonEntry, count: RFK_BOSS_ADDS.roogug.count }],
    ),
  );

  // --- Roogug → Aggem Thorncurse ---
  out.push(
    ...entranceBoars.slice(entMid),
    ...quilboarFront.slice(quiltMid),
    ...deathsHeadMid.slice(0, dhMid),
  );
  out.push(
    boss(
      'aggem-thorncurse',
      'Aggem Thorncurse',
      ENTRY.aggem,
      BOSS_SPELLS.aggem,
      undefined,
      // Cite: creature_ai_scripts 442402 TIMER CAST 8286 → 6021; engine inject residual (header).
      'Aggem Thorncurse channels Death\'s Head rites over a thorned altar.',
    ),
  );

  // --- Aggem → Death Speaker Jargba ---
  out.push(...deathsHeadMid.slice(dhMid), ...defenderBand.slice(0, Math.ceil(defMid / 2)));
  out.push(
    boss(
      'death-speaker-jargba',
      'Death Speaker Jargba',
      ENTRY.jargba,
      BOSS_SPELLS.jargba,
      undefined,
      'Death Speaker Jargba intones over a circle of Death\'s Head adepts.',
    ),
  );

  // --- Jargba → Overlord Ramtusk ---
  out.push(...defenderBand.slice(Math.ceil(defMid / 2), defMid), ...spearhides);
  out.push(
    boss(
      'overlord-ramtusk',
      'Overlord Ramtusk',
      ENTRY.ramtusk,
      BOSS_SPELLS.ramtusk,
      undefined,
      'Overlord Ramtusk, war-chief of the Razorfen, holds the central warren.',
    ),
  );

  // --- Ramtusk → Ward Keepers → Agathelos ---
  out.push(
    ...defenderBand.slice(defMid),
    ...deepKraul.slice(0, deepMid),
    ...wardGuardians,
    ...halmgar,
  );

  // Ward keepers (4625 ×2 static): explicit pulls; last sets the Agathelos ward flag.
  // Survey: kill both → SET_INST_DATA TYPE_AGATHELOS DONE → GO 21099 ward opens.
  out.push(
    trashPull(
      'ward-keeper-1',
      "Death's Head Ward Keeper",
      ENTRY.wardKeeper,
      1,
      undefined,
      "A Death's Head Ward Keeper channels the seal on Agathelos's den.",
    ),
  );
  out.push(
    trashPull(
      'ward-keeper-2',
      "Death's Head Ward Keeper",
      ENTRY.wardKeeper,
      1,
      [{ kind: 'setsFlag', flag: RAZORFEN_KRAUL_FLAGS.agathelosWard }],
      "The last Ward Keeper falls - Agathelos's ward unseals.",
    ),
  );

  out.push(
    boss(
      'agathelos-the-raging',
      'Agathelos the Raging',
      ENTRY.agathelos,
      BOSS_SPELLS.agathelos,
      [{ kind: 'requiresFlag', flag: RAZORFEN_KRAUL_FLAGS.agathelosWard }],
      'Agathelos the Raging thrashes free of the unsealed ward.',
    ),
  );

  // --- Agathelos → Blind Hunter (pool 45402, 30% rare / 70% Greater Kraul Bat alt) ---
  out.push(...deepKraul.slice(deepMid));
  // Cite: pools.json 45402; rareRoll.stripAbsentPoolEncountersFromRoute; spawnGuids via L06.
  // Pool chance; isComplete ignores optional.
  out.push({
    ...boss(
      'blind-hunter',
      'Blind Hunter',
      ENTRY.blindHunter,
      undefined,
      undefined,
      // Chance from RFK_BLIND_HUNTER_POOL.chancePct (pools.json member, not invented).
      `A rare blind bat hangs in a side cavern. (Rare pool ${RFK_BLIND_HUNTER_POOL.poolId}: ${RFK_BLIND_HUNTER_POOL.chancePct}%.)`,
    ),
    optional: true,
  });

  // --- Blind Hunter → Charlga Razorflank ---
  out.push(
    boss(
      'charlga-razorflank',
      'Charlga Razorflank',
      ENTRY.charlga,
      BOSS_SPELLS.charlga,
      undefined,
      "Charlga Razorflank, the Crone of the Kraul, waits at the heart of the warren.",
    ),
  );

  // --- Willix the Importer escort ambushes (quest 1144) ---
  // WP15 and WP45 each summon 2× Raging Agam'ar as TEMPSPAWN, extra beyond the static 15.
  out.push({
    ...trashPull(
      'willix-ambush-wp15',
      "Willix Escort Ambush (WP15)",
      ENTRY.ragingAgamar,
      WILLIX_AMBUSH.perPack,
      undefined,
      "Raging Agam'ar ambush Willix the Importer on the reverse path (quest 1144, WP15).",
    ),
    optional: true,
  });
  out.push({
    ...trashPull(
      'willix-ambush-wp45',
      "Willix Escort Ambush (WP45)",
      ENTRY.ragingAgamar,
      WILLIX_AMBUSH.perPack,
      undefined,
      "Raging Agam'ar ambush Willix near the exit (quest 1144, WP45).",
    ),
    optional: true,
  });

  return out;
}

function buildEncounters(): EncounterDef[] {
  // Hand spine = bosses + event-gated packs (mono trashFromCensus is empty).
  const spine = buildHandSpine();
  return buildClusterEncounters({
    mapId: 47,
    spine,
    entrance: entranceForInstance('razorfen-kraul'),
    
  });
}


/** Survey quests completable inside map 47. */
export const RAZORFEN_KRAUL_QUESTS = [
  866, 1221, 1701, 1142, 1144, 1838, 1109, 1101, 1102, 6522,
] as const;

/** Rounded static pack targets used by this graph (for tests / docs). */
export const RAZORFEN_KRAUL_STATIC = { ...STATIC } as const;

export const RAZORFEN_KRAUL: InstanceDef = {
  id: 'razorfen-kraul',
  mapId: 47,
  name: 'Razorfen Kraul',
  portalZone: 'barrens',
  minLevel: 15, // entrance trigger 244 requiredLevel
  levelRange: [15, 32], // survey trash band (wide; core trash ~24–32)
  lockoutMs: 0,
  description: '',
  quests: [...RAZORFEN_KRAUL_QUESTS],
  encounters: buildEncounters(),
};

// Sum of authored pure-static trash counts per creature entry (primary + pack). Excludes bosses, Willix
// ambush extras (event temps). Includes ward keepers (static 4625).
export function razorfenKraulPureStaticTrashCounts(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of RAZORFEN_KRAUL.encounters) {
    if (enc.kind !== 'trash') continue;
    // Willix ambush packs are event temps - not static census
    if (enc.id.startsWith('willix-ambush-')) continue;
    add(enc.creatureEntry, 1);
    for (const p of enc.pack ?? []) add(p.creatureEntry, p.count);
  }
  return map;
}

/** All kill supply (trash + boss singles + ambush extras) for satisfiability checks. */
export function razorfenKraulKillSupply(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of RAZORFEN_KRAUL.encounters) {
    add(enc.creatureEntry, 1);
    for (const p of enc.pack ?? []) add(p.creatureEntry, p.count);
  }
  return map;
}
