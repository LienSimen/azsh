// Dire Maul East wing (map 429) — InstanceDef graph, bosses y ≲ −198 only (Pusillin → Alzzin).
// Authority: docs/dungeons/survey/17-dire-maul.md, which carries the residual GAPS list.

import type { EncounterDef, EncounterEvent, InstanceDef } from '../schema.ts';
import { dungeonGameObjectsForMap } from '../dungeonGameObjects.ts';
import {
  entranceForInstance,
  buildClusterEncounters,
  wingFilterByNearestBoss,
} from './pack-from-clusters.ts';
import {
  ALZZIN_SPECIAL_HP_PCT,
  GO_CORRUPT_VINE,
  GO_CRUMBLE_WALL,
  GO_FELVINE_SHARD,
} from '../../domain/scriptdev/direMaul.ts';

// ---- East wing trash (survey avg pos y ≲ −198 / East section) ----
// Census static / expected, fractional pool rows rounded. West, North and seasonal rows excluded.

const STATIC = {
  phaseLasher: 10, // 13196 Phase Lasher (pool) - census 10
  warpwoodTreant: 13, // 11462 Warpwood Treant (pool) - census 13
  warpwoodTangler: 7, // 11464 Warpwood Tangler (pool) - census 7
  felLash: 9, // 13197 Fel Lash (pool) - Math.round(8.5)
  deathLash: 13, // 13285 Death Lash (pool) - Math.round(12.5)
  whipLasher: 134, // 13022 Whip Lasher
  warpwoodStomper: 5, // 11465 Warpwood Stomper
  warpwoodGuardian: 10, // 11461 Warpwood Guardian
  warpwoodCrusher: 13, // 13021 Warpwood Crusher
  wildspawnSatyr: 14, // 11451 Wildspawn Satyr
  wildspawnBetrayer: 7, // 11454 Wildspawn Betrayer
  wildspawnFelsworn: 6, // 11455 Wildspawn Felsworn
  wildspawnShadowstalker: 8, // 11456 Wildspawn Shadowstalker
  wildspawnRogue: 8, // 11452 Wildspawn Rogue
  wildspawnTrickster: 7, // 11453 Wildspawn Trickster
  wildspawnHellcaller: 4, // 11457 Wildspawn Hellcaller
  wildspawnImp: 20, // 13276 Wildspawn Imp (static; +4 event on Pusillin)
} as const;

const ENTRY = {
  phaseLasher: 13196,
  warpwoodTreant: 11462,
  warpwoodTangler: 11464,
  felLash: 13197,
  deathLash: 13285,
  whipLasher: 13022,
  warpwoodStomper: 11465,
  warpwoodGuardian: 11461,
  warpwoodCrusher: 13021,
  wildspawnSatyr: 11451,
  wildspawnBetrayer: 11454,
  wildspawnFelsworn: 11455,
  wildspawnShadowstalker: 11456,
  wildspawnRogue: 11452,
  wildspawnTrickster: 11453,
  wildspawnHellcaller: 11457,
  wildspawnImp: 13276,
  // Bosses (survey East order - y ≲ −198)
  pusillin: 14354,
  zevrim: 11490,
  hydrospawn: 13280,
  lehtendris: 14327,
  alzzin: 11492,
  // Boss-adjacent static / summon-only
  pimgib: 14349, // Lethtendris companion (static ×1; pack on boss)
  alzzinMinion: 11460, // summon-only at 40% (×15)
  isalien: 16097, // T0.5 optional — Brazier of Beckoning at Alzzin's room
  // EXCLUDED: Revanchion 14690 (D-10); West/North bosses; Old Ironbark 11491 (friendly)
} as const;

/** Instance flags (string form for DSL). */
export const DIRE_MAUL_EAST_FLAGS = {
  /** TYPE_ZEVRIM DONE — morphs Old Ironbark → Redeemed (gossipable). */
  zevrimDone: 'dire-maul-east-zevrim-done',
  // TYPE_IRONBARK DONE — Conservatory Door 176907 open. Cite: dire_maul.h:45; instance_dire_maul.cpp
  // :127-129, :227-228; classic-db dbscripts_on_creature_movement 1424101 @9s.
  ironbarkDoor: 'dire-maul-east-ironbark-door',
  // TYPE_ALZZIN SPECIAL — Crumble Wall GO 177220 open (exit shortcut). Cite: acid_classic.sql:15013 1149214
  // HP≤40 → SET_INST_DATA(0,4); instance_dire_maul.cpp:247-250 DoUseDoorOrButton(GO_CRUMBLE_WALL).
  alzzinCrumbleWall: 'dire-maul-east-alzzin-crumble-wall',
  // TYPE_ALZZIN DONE → Corrupt Vine 179502 open + Felvine Shard 179559 respawn. Cite:
  // instance_dire_maul.cpp:231-244; acid_classic.sql:15020 1149221.
  alzzinDone: 'dire-maul-east-alzzin-done',
  /** 5th gossip done: spell 22735 + faction 90 hostile. Cite: classic-db dbscripts_on_gossip 570905. */
  pusillinHostile: 'dme-pusillin-hostile',
  /** Isalien T0.5 summoned (Brazier of Beckoning used at focus 181047). */
  isalien: 'dire-maul-east-isalien',
  /** Crescent Key 18249 on lock-1562 doors (see DM_EAST_CRESCENT_DOORS). */
  crescentKey: 'dme-crescent-key-doors',
} as const;

// Isalien Tier 0.5 optional summon (LBRS Mor Grayhoof / UBRS Valthalak pattern). The room is
// Alzzin's, in East. Cite: GO 181047; spawn guid 4291063 entry 16045; item 22050; boss 16097.
export const DM_EAST_ISALIEN = {
  encId: 'isalien',
  goEntry: 181047, // Isalien Brazier Spell Focus
  requiredItem: 22050, // Brazier of Beckoning
  triggerEntry: 16045,
  bossEntry: 16097,
  spawn: { x: 262.09, y: -445.745, z: -119.878 },
} as const;

// Crescent Key doors that spawn on map 429. Templates 177188/89/92/98 are lock 1562
// but have no gameobject row. Cite: dire_maul.h:69-70; bake map 429.
export const DM_EAST_CRESCENT_DOORS = {
  lockId: 1562,
  goEntry: 177221,
  goEntries: [177221, 179549, 179550] as const,
  requiredItem: 18249,
  /** locks.json 1562 LOCKTYPE_PICKLOCK skill. */
  picklockSkill: 300,
} as const;

/** Flag after gossip N completed (1..4). Cite: gossip scripts 570901–04 → next pause WP. */
export function dmEastPusillinStopFlag(n: number): string {
  return `dme-pusillin-stop-${n}`;
}

// Alzzin 40% wave + Crumble Wall SPECIAL. Cite: acid_classic.sql:15012-15019 EVENT_T_HP param1=40; 1149214
// SET_INST_DATA SPECIAL; instance_dire_maul.cpp:247-250 GO_CRUMBLE_WALL 177220.
export const DIRE_MAUL_EAST_ALZZIN_MINIONS = {
  creatureEntry: ENTRY.alzzinMinion,
  count: 15,
  pct: ALZZIN_SPECIAL_HP_PCT,
} as const;

/** Crumble Wall / Corrupt Vine / Felvine — bake entries for go-opened / reveal. */
export const DM_EAST_ALZZIN_GOS = {
  crumbleWall: GO_CRUMBLE_WALL,
  corruptVine: GO_CORRUPT_VINE,
  felvineShard: GO_FELVINE_SHARD,
  mapId: 429,
} as const;

/** Run flag `go-opened:<guid>` — same seam as livePullLifecycle / doorObjectPins. */
export function dmEastGoOpenedFlag(guid: number): string {
  return `go-opened:${guid}`;
}

function dmEastAppendGoOpened(flags: readonly string[], goEntry: number): string[] {
  let next = [...flags];
  for (const go of dungeonGameObjectsForMap(DM_EAST_ALZZIN_GOS.mapId)) {
    if (go.entry !== goEntry) continue;
    const f = dmEastGoOpenedFlag(go.guid);
    if (!next.includes(f)) next = [...next, f];
  }
  return next;
}

export function dmEastCrumbleWallOpen(flags: readonly string[]): boolean {
  return flags.includes(DIRE_MAUL_EAST_FLAGS.alzzinCrumbleWall)
    || flags.includes(DIRE_MAUL_EAST_FLAGS.alzzinDone);
}

// TYPE_ALZZIN SPECIAL — open Crumble Wall 177220 (DoUseDoorOrButton), idempotent. Caller:
// livePullLifecycle.tickAlzzinCrumbleWall. Cite: instance_dire_maul.cpp:247-250.
export function dmEastOpenCrumbleWall(flags: readonly string[]): string[] {
  let next = [...flags];
  if (!next.includes(DIRE_MAUL_EAST_FLAGS.alzzinCrumbleWall)) {
    next = [...next, DIRE_MAUL_EAST_FLAGS.alzzinCrumbleWall];
  }
  return dmEastAppendGoOpened(next, GO_CRUMBLE_WALL);
}

// TYPE_ALZZIN DONE — wall (if still closed) + Corrupt Vine 179502 + Felvine reveal flag. Cite:
// instance_dire_maul.cpp:231-244; acid_classic.sql:15020.
export function dmEastApplyAlzzinDone(flags: readonly string[]): string[] {
  let next = dmEastOpenCrumbleWall(flags);
  if (!next.includes(DIRE_MAUL_EAST_FLAGS.alzzinDone)) {
    next = [...next, DIRE_MAUL_EAST_FLAGS.alzzinDone];
  }
  return dmEastAppendGoOpened(next, GO_CORRUPT_VINE);
}

/** Survey: Pusillin 5th gossip summons 4× Wildspawn Imp 13276 (fight adds; not static). */
export const DIRE_MAUL_EAST_PUSILLIN_IMPS = {
  creatureEntry: ENTRY.wildspawnImp,
  count: 4,
  /** Despawn ms. Cite: dbscripts_on_gossip 570905 cmd 10 datalong2=120000. */
  despawnMs: 120_000,
} as const;

// Pusillin multi-stop chase. Cite: creature_movement_template 14354 (pause WPs 1/9/19/32/38);
// gossip_menu 5709 → dbscripts_on_gossip 570901–05; conditions type 33 value1=waypoint.
export type DmEastPusillinStop = {
  /** 0-based gossip stage (matches gossip_menu_option id). */
  stage: number;
  /** Pause waypoint point id. */
  wp: number;
  x: number;
  y: number;
  z: number;
  gossipScriptId: number;
  optionId: number;
  conditionId: number;
  optionText: string;
  sayBroadcastId: number;
  sayText: string;
};

export const DM_EAST_PUSILLIN_CHASE = {
  entry: ENTRY.pusillin,
  encId: 'pusillin',
  gossipMenuId: 5709,
  /** Spell Spirit of Redemption-style transform stand-in. Cite: 570905 cmd 15. */
  transformSpellId: 22735,
  /** Demon faction after transform. Cite: 570905 cmd 22. */
  hostileFaction: 90,
  crescentKeyItem: 18249,
  /** creature_loot_template 14354 chance 100. */
  crescentKeyChance: 100,
  impEntry: ENTRY.wildspawnImp,
  impCount: 4,
  impDespawnMs: 120_000,
  /** Summon coords from 570905 cmd 10 rows. */
  impSpawns: [
    { x: 14.7965, y: -696.322, z: -12.6426 },
    { x: 18.8891, y: -697.389, z: -12.6426 },
    { x: 21.4274, y: -700.227, z: -12.6426 },
    { x: 22.2017, y: -705.459, z: -12.6426 },
  ] as const,
  stops: [
    {
      stage: 0,
      wp: 1,
      x: 86.1935,
      y: -197.888,
      z: -4.05657,
      gossipScriptId: 570901,
      optionId: 0,
      conditionId: 389,
      optionText: 'Game? Are you crazy?',
      sayBroadcastId: 9349,
      sayText: "If you want the key, you'll have to catch me!",
    },
    {
      stage: 1,
      wp: 9,
      x: -150.171,
      y: -278.348,
      z: -4.14787,
      gossipScriptId: 570902,
      optionId: 1,
      conditionId: 720,
      optionText: 'Why you little...',
      sayBroadcastId: 9353,
      sayText: 'Chase me if you dare! I run without a care!',
    },
    {
      stage: 2,
      wp: 19,
      x: 107.902,
      y: -355.904,
      z: -4.12403,
      gossipScriptId: 570903,
      optionId: 2,
      conditionId: 390,
      optionText: 'Mark my words, I will catch you, imp. And when I do!',
      sayBroadcastId: 9357,
      sayText: 'Why would you ever want to harm me!? Come. Friends we can be!',
    },
    {
      stage: 3,
      wp: 32,
      x: 50.4384,
      y: -631.018,
      z: -25.1082,
      gossipScriptId: 570904,
      optionId: 3,
      conditionId: 722,
      optionText: 'DIE!',
      sayBroadcastId: 9360,
      sayText: 'DIE?! You make Pusillin cry!',
    },
    {
      stage: 4,
      wp: 38,
      x: 12.7601,
      y: -706.167,
      z: -12.6426,
      gossipScriptId: 570905,
      optionId: 4,
      conditionId: 723,
      optionText: 'Prepare to meet your maker.',
      sayBroadcastId: 9363,
      sayText: 'Say hello to my little friends!',
    },
  ] as const satisfies readonly DmEastPusillinStop[],
} as const;

/** Gossips completed (0..5). 5 = hostile at final stop. */
export function dmEastPusillinGossipDone(flags: readonly string[]): number {
  if (flags.includes(DIRE_MAUL_EAST_FLAGS.pusillinHostile)) return 5;
  for (let i = 4; i >= 1; i--) {
    if (flags.includes(dmEastPusillinStopFlag(i))) return i;
  }
  return 0;
}

/** Stop index he currently occupies (0..4). */
export function dmEastPusillinCurrentStop(flags: readonly string[]): number {
  return Math.min(dmEastPusillinGossipDone(flags), 4);
}

export function dmEastPusillinCanFight(flags: readonly string[]): boolean {
  return flags.includes(DIRE_MAUL_EAST_FLAGS.pusillinHostile);
}

/** Crescent Key only after final gossip (fight). Negative: earlier gossips do not unlock loot. */
export function dmEastPusillinDropsCrescentKey(flags: readonly string[]): boolean {
  return dmEastPusillinCanFight(flags);
}

export function dmEastPusillinPose(flags: readonly string[]): {
  x: number;
  y: number;
  z: number;
  wp: number;
} {
  const stop = DM_EAST_PUSILLIN_CHASE.stops[dmEastPusillinCurrentStop(flags)]!;
  return { x: stop.x, y: stop.y, z: stop.z, wp: stop.wp };
}

// Apply one gossip stage. Returns null when already hostile or out of stages. After stage 0–3: mark stop N
// complete and move to next pause WP. After stage 4: set hostile (fight + key).
export function dmEastAdvancePusillinGossip(flags: readonly string[]): {
  flags: string[];
  sayText: string;
  optionText: string;
  pose: { x: number; y: number; z: number; wp: number };
  becameHostile: boolean;
  stage: number;
} | null {
  const done = dmEastPusillinGossipDone(flags);
  if (done >= 5) return null;
  const stage = done;
  const stop = DM_EAST_PUSILLIN_CHASE.stops[stage]!;
  const next = [...flags];
  let pose: { x: number; y: number; z: number; wp: number };
  let becameHostile = false;
  if (stage < 4) {
    const fl = dmEastPusillinStopFlag(stage + 1);
    if (!next.includes(fl)) next.push(fl);
    const dest = DM_EAST_PUSILLIN_CHASE.stops[stage + 1]!;
    pose = { x: dest.x, y: dest.y, z: dest.z, wp: dest.wp };
  } else {
    if (!next.includes(DIRE_MAUL_EAST_FLAGS.pusillinHostile)) {
      next.push(DIRE_MAUL_EAST_FLAGS.pusillinHostile);
    }
    becameHostile = true;
    pose = { x: stop.x, y: stop.y, z: stop.z, wp: stop.wp };
  }
  return {
    flags: next,
    sayText: stop.sayText,
    optionText: stop.optionText,
    pose,
    becameHostile,
    stage,
  };
}

// Old Ironbark / Conservatory Door. Cite: dire_maul.h:45-49; instance_dire_maul.cpp:215-228 (TYPE_ZEVRIM
// morph); classic-db gossip 5602 + movement 14241 / 1424101 (9s open GO 176907).
export const DM_EAST_IRONBARK = {
  oldEntry: 11491,
  redeemedEntry: 14241,
  gossipMenuId: 5602,
  optionText: 'Thank you, Ironbark. We are ready for you to open the door.',
  sayBroadcastId: 9099,
  sayText: 'As you wish...',
  doorGoEntry: 176907,
  door: { x: 131.286, y: -278.89, z: -56.521 },
  spawn: { x: -72.1719, y: -283.252, z: -57.7497 },
  /** dbscripts_on_creature_movement 1424101 delay 9000 open door. */
  doorOpenDelayMs: 9000,
  path: [
    { point: 1, x: -46.5029, y: -268.536, z: -57.4978 },
    { point: 2, x: -10.6115, y: -281.676, z: -53.7415 },
    { point: 3, x: 17.2824, y: -286.947, z: -52.2818 },
    { point: 4, x: 74.1724, y: -272.765, z: -54.8267 },
    { point: 5, x: 117.401, y: -277.83, z: -55.8552 },
  ] as const,
} as const;

export function dmEastConservatoryOpen(flags: readonly string[]): boolean {
  return flags.includes(DIRE_MAUL_EAST_FLAGS.ironbarkDoor);
}

/** Ironbark talk after Zevrim: sets TYPE_IRONBARK (door open). */
export function dmEastOpenIronbarkDoor(flags: readonly string[]): string[] | null {
  if (!flags.includes(DIRE_MAUL_EAST_FLAGS.zevrimDone)) return null;
  if (flags.includes(DIRE_MAUL_EAST_FLAGS.ironbarkDoor)) return [...flags];
  return [...flags, DIRE_MAUL_EAST_FLAGS.ironbarkDoor];
}

// Alzzin form cycle — EventAI 1149201–21. Phase 1/4 humanoid, 2 Dire Wolf 22660, 3 Tree 22688;
// 40% drops forms and minions. Wiring plan is BOSS_EVENTAI_OVERLAYS[11492], out of scope here.
export const DM_EAST_ALZZIN_FORMS = {
  entry: ENTRY.alzzin,
  thornsSpell: 22128,
  direWolfForm: 22660,
  treeForm: 22688,
  witherSpell: 22662,
  wildRegenSpell: 7948,
  viciousBiteSpell: 19319,
  mangleSpell: 22689,
  disarmSpell: 22691,
  enervateSpell: 22661,
  knockAwaySpell: 10101,
  /** EventAI initial form cast window (phase 1). */
  formCastInitialMs: [12_000, 15_000] as const,
  formDurationMs: [25_000, 35_000] as const,
  formRecastMs: [40_000, 50_000] as const,
  dropFormsPct: ALZZIN_SPECIAL_HP_PCT,
  minionEntry: ENTRY.alzzinMinion,
  minionCount: 15,
  /** Script ids 1149201–21 from acid_classic.sql. */
  eventAiScriptIds: [
    1149201, 1149202, 1149203, 1149204, 1149205, 1149206, 1149207, 1149208,
    1149209, 1149210, 1149211, 1149212, 1149213, 1149214, 1149215, 1149216,
    1149217, 1149218, 1149219, 1149220, 1149221,
  ] as const,
} as const;

/** Summon-only / event-temp entries that must never appear in pure static trash packs. */
export const DIRE_MAUL_EAST_SUMMON_ONLY_ENTRIES = new Set<number>([
  ENTRY.alzzinMinion, // 11460 - Alzzin 40% wave
]);

/** West / North / D-10 / service entries that must not appear in this wing graph. */
export const DIRE_MAUL_EAST_FORBIDDEN_ENTRIES = new Set<number>([
  // West bosses
  11489, // Tendris Warpwood
  11488, // Illyanna Ravenoak
  11487, // Magister Kalendris
  11467, // Tsu'zee
  11496, // Immol'thar
  11486, // Prince Tortheldrin
  // North bosses
  14326, // Guard Mol'dar
  14322, // Stomper Kreeg
  14321, // Guard Fengus
  14323, // Guard Slip'kik
  14325, // Captain Kromcrush
  14324, // Cho'Rush the Observer
  11501, // King Gordok
  // D-10 / seasonal
  14690, // Revanchion
  // West library trash samples
  11471, // Eldreth Apparition
  11472, // Eldreth Spirit
  11475, // Eldreth Phantasm
  11469, // Eldreth Seether
  11473, // Eldreth Spectre
  11470, // Eldreth Sorcerer
  14398, // Eldreth Darter
  // North ogre samples
  11441, // Gordok Brute
  11444, // Gordok Mage-Lord
  11450, // Gordok Reaver
  11445, // Gordok Captain
  11448, // Gordok Warlock
  13036, // Gordok Mastiff
]);

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

// Boss spells: creature.spells from bake (game-data) - no invented ids.
const BOSS_SPELLS = {
  pusillin: [15228, 22424, 14145, 17145, 15242],
  zevrim: [22478, 22651],
  hydrospawn: [22419, 22421, 22420, 22714],
  lehtendris: [11668, 14887, 22709, 12742, 17228, 13338, 22710, 16247],
  alzzin: [22689, 22662, 19319, 22128, 7948, 22660, 22688, 22691, 22661, 10101],
  // creatures.json 16097.spells — Multi-Shot / Starfire / Net / Regrowth / etc.
  isalien: [25164, 27639, 12024, 27637, 27636, 14443, 22907],
} as const;

function boss(
  id: string,
  name: string,
  creatureEntry: number,
  bossSpells: readonly number[],
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
  if (bossSpells.length) enc.bossSpells = [...bossSpells];
  if (intro) enc.intro = intro;
  if (events && events.length) enc.events = events;
  if (pack && pack.length) enc.pack = pack;
  return enc;
}

// Linear East encounter graph in survey boss order: entrance gardens → Pusillin → mid Warpwood →
// Wildspawn court → Zevrim → Conservatory → Hydrospawn → Lethtendris → Alzzin (40% minions).
function buildHandSpine(): EncounterDef[] {
  const phaseLashers = trashFromCensus(
    'phase-lasher',
    'Phase Lasher',
    ENTRY.phaseLasher,
    STATIC.phaseLasher,
  );
  const treants = trashFromCensus(
    'warpwood-treant',
    'Warpwood Treant',
    ENTRY.warpwoodTreant,
    STATIC.warpwoodTreant,
  );
  const tanglers = trashFromCensus(
    'warpwood-tangler',
    'Warpwood Tangler',
    ENTRY.warpwoodTangler,
    STATIC.warpwoodTangler,
  );
  const felLashes = trashFromCensus('fel-lash', 'Fel Lash', ENTRY.felLash, STATIC.felLash);
  const deathLashes = trashFromCensus(
    'death-lash',
    'Death Lash',
    ENTRY.deathLash,
    STATIC.deathLash,
  );
  const whipLashers = trashFromCensus(
    'whip-lasher',
    'Whip Lasher',
    ENTRY.whipLasher,
    STATIC.whipLasher,
  );
  const stompers = trashFromCensus(
    'warpwood-stomper',
    'Warpwood Stomper',
    ENTRY.warpwoodStomper,
    STATIC.warpwoodStomper,
  );
  const guardians = trashFromCensus(
    'warpwood-guardian',
    'Warpwood Guardian',
    ENTRY.warpwoodGuardian,
    STATIC.warpwoodGuardian,
  );
  const crushers = trashFromCensus(
    'warpwood-crusher',
    'Warpwood Crusher',
    ENTRY.warpwoodCrusher,
    STATIC.warpwoodCrusher,
  );
  const satyrs = trashFromCensus(
    'wildspawn-satyr',
    'Wildspawn Satyr',
    ENTRY.wildspawnSatyr,
    STATIC.wildspawnSatyr,
  );
  const betrayers = trashFromCensus(
    'wildspawn-betrayer',
    'Wildspawn Betrayer',
    ENTRY.wildspawnBetrayer,
    STATIC.wildspawnBetrayer,
  );
  const felsworns = trashFromCensus(
    'wildspawn-felsworn',
    'Wildspawn Felsworn',
    ENTRY.wildspawnFelsworn,
    STATIC.wildspawnFelsworn,
  );
  const shadowstalkers = trashFromCensus(
    'wildspawn-shadowstalker',
    'Wildspawn Shadowstalker',
    ENTRY.wildspawnShadowstalker,
    STATIC.wildspawnShadowstalker,
  );
  const rogues = trashFromCensus(
    'wildspawn-rogue',
    'Wildspawn Rogue',
    ENTRY.wildspawnRogue,
    STATIC.wildspawnRogue,
  );
  const tricksters = trashFromCensus(
    'wildspawn-trickster',
    'Wildspawn Trickster',
    ENTRY.wildspawnTrickster,
    STATIC.wildspawnTrickster,
  );
  const hellcallers = trashFromCensus(
    'wildspawn-hellcaller',
    'Wildspawn Hellcaller',
    ENTRY.wildspawnHellcaller,
    STATIC.wildspawnHellcaller,
  );
  const imps = trashFromCensus(
    'wildspawn-imp',
    'Wildspawn Imp',
    ENTRY.wildspawnImp,
    STATIC.wildspawnImp,
  );

  // Band splits for spatial-ish sequencing between bosses
  const whipMid = Math.ceil(whipLashers.length / 3);
  const whipPrePusillin = whipLashers.slice(0, whipMid);
  const whipMidWing = whipLashers.slice(whipMid, 2 * whipMid);
  const whipPost = whipLashers.slice(2 * whipMid);

  const treantMid = Math.ceil(treants.length / 2);
  const phaseMid = Math.ceil(phaseLashers.length / 2);
  const tanglerMid = Math.ceil(tanglers.length / 2);
  const deathMid = Math.ceil(deathLashes.length / 2);
  const guardMid = Math.ceil(guardians.length / 2);
  const crushMid = Math.ceil(crushers.length / 2);
  const impMid = Math.ceil(imps.length / 2);

  const satyrMid = Math.ceil(satyrs.length / 2);
  const rogueMid = Math.ceil(rogues.length / 2);
  const trickMid = Math.ceil(tricksters.length / 2);

  const out: EncounterDef[] = [];

  // --- Entrance gardens → Pusillin ---
  out.push(
    ...whipPrePusillin,
    ...phaseLashers.slice(0, phaseMid),
    ...treants.slice(0, treantMid),
    ...tanglers.slice(0, tanglerMid),
  );

  {
    const chasePath = DM_EAST_PUSILLIN_CHASE.stops.map((s) => ({
      x: s.x,
      y: s.y,
      z: s.z,
    }));
    const pusillin = boss(
      'pusillin',
      'Pusillin',
      ENTRY.pusillin,
      BOSS_SPELLS.pusillin,
      undefined,
      // 5 gossip stops (WPs 1/9/19/32/38); fight only after 570905. Crescent Key 18249 on death.
      "Pusillin flees through the East wing - talk him down each stop; the Crescent Key drops only at the end.",
      // dbscripts_on_gossip 570905: +3s summon 4× Wildspawn Imp 13276 (120s despawn).
      [{ creatureEntry: DIRE_MAUL_EAST_PUSILLIN_IMPS.creatureEntry, count: DIRE_MAUL_EAST_PUSILLIN_IMPS.count }],
    );
    pusillin.path = chasePath;
    // Spawn pose = stop 0 (creature_movement_template WP1 / geometry).
    pusillin.origin = {
      x: DM_EAST_PUSILLIN_CHASE.stops[0]!.x,
      y: DM_EAST_PUSILLIN_CHASE.stops[0]!.y,
      z: DM_EAST_PUSILLIN_CHASE.stops[0]!.z,
    };
    out.push(pusillin);
  }

  // --- Pusillin → Zevrim (Warpwood corridor + first Wildspawn) ---
  out.push(
    ...whipMidWing,
    ...phaseLashers.slice(phaseMid),
    ...treants.slice(treantMid),
    ...tanglers.slice(tanglerMid),
    ...stompers,
    ...guardians.slice(0, guardMid),
    ...crushers.slice(0, crushMid),
    ...deathLashes.slice(0, deathMid),
    ...satyrs.slice(0, satyrMid),
    ...betrayers.slice(0, Math.ceil(betrayers.length / 2)),
    ...felsworns.slice(0, Math.ceil(felsworns.length / 2)),
    ...shadowstalkers.slice(0, Math.ceil(shadowstalkers.length / 2)),
  );

  out.push(
    boss(
      'zevrim-thornhoof',
      'Zevrim Thornhoof',
      ENTRY.zevrim,
      BOSS_SPELLS.zevrim,
      [
        // After Pusillin (Crescent Key 18249). Lock-1562 doors on map 429: Warpwood,
        // Conservatory, north-before-west. Cite: dire_maul.h:69-70.
        {
          kind: 'objectGate',
          goEntry: DM_EAST_CRESCENT_DOORS.goEntry,
          goEntries: [...DM_EAST_CRESCENT_DOORS.goEntries],
          requiredItem: DM_EAST_CRESCENT_DOORS.requiredItem,
          setsFlag: DIRE_MAUL_EAST_FLAGS.crescentKey,
          once: true,
        },
        // TYPE_ZEVRIM DONE → morph Ironbark; door still needs talk (TYPE_IRONBARK).
        { kind: 'setsFlag', flag: DIRE_MAUL_EAST_FLAGS.zevrimDone },
      ],
      'Zevrim Thornhoof rules the Wildspawn court. His death frees Old Ironbark to open the Conservatory.',
    ),
  );

  // Old Ironbark talk-gate: requires Zevrim; sets TYPE_IRONBARK / Conservatory Door 176907.
  // Cleared by floor Talk (not combat). Cite: gossip 5602 + movement 1424101.
  out.push({
    id: 'old-ironbark',
    name: 'Old Ironbark',
    kind: 'object',
    creatureEntry: DM_EAST_IRONBARK.oldEntry,
    origin: {
      x: DM_EAST_IRONBARK.spawn.x,
      y: DM_EAST_IRONBARK.spawn.y,
      z: DM_EAST_IRONBARK.spawn.z,
    },
    intro: DM_EAST_IRONBARK.optionText,
    events: [
      { kind: 'requiresFlag', flag: DIRE_MAUL_EAST_FLAGS.zevrimDone },
      { kind: 'setsFlag', flag: DIRE_MAUL_EAST_FLAGS.ironbarkDoor },
    ],
  });

  // --- Conservatory (requires TYPE_IRONBARK / door open) → Hydrospawn ---
  out.push(
    ...imps.slice(0, impMid),
    ...felLashes.slice(0, Math.ceil(felLashes.length / 2)),
    ...rogues.slice(0, rogueMid),
    ...tricksters.slice(0, trickMid),
    ...hellcallers,
  );

  out.push(
    boss(
      'hydrospawn',
      'Hydrospawn',
      ENTRY.hydrospawn,
      BOSS_SPELLS.hydrospawn,
      [
        // TYPE_IRONBARK DONE (Ironbark talk after Zevrim). Cite: instance_dire_maul.cpp:127-129.
        { kind: 'requiresFlag', flag: DIRE_MAUL_EAST_FLAGS.ironbarkDoor },
      ],
      'Conservatory Door 176907 - talk Old Ironbark after Zevrim to open the path. Hydrospawn Essence here.',
    ),
  );

  // --- Hydrospawn → Lethtendris ---
  out.push(
    ...imps.slice(impMid),
    ...felLashes.slice(Math.ceil(felLashes.length / 2)),
    ...rogues.slice(rogueMid),
  );

  out.push(
    boss(
      'lehtendris',
      'Lethtendris',
      ENTRY.lehtendris,
      BOSS_SPELLS.lehtendris,
      undefined,
      'Lethtendris weaves fel magic with her imp Pimgib at her side.',
      // Census: Pimgib 14349 static ×1 at Lethtendris's side.
      [{ creatureEntry: ENTRY.pimgib, count: 1 }],
    ),
  );

  // --- Lethtendris → Alzzin ---
  out.push(
    ...whipPost,
    ...guardians.slice(guardMid),
    ...crushers.slice(crushMid),
    ...deathLashes.slice(deathMid),
    ...satyrs.slice(satyrMid),
    ...betrayers.slice(Math.ceil(betrayers.length / 2)),
    ...felsworns.slice(Math.ceil(felsworns.length / 2)),
    ...shadowstalkers.slice(Math.ceil(shadowstalkers.length / 2)),
    ...tricksters.slice(trickMid),
  );

  out.push(
    boss(
      'alzzin-the-wildshaper',
      'Alzzin the Wildshaper',
      ENTRY.alzzin,
      // EventAI form cycle: Dire Wolf 22660 / Tree 22688 listed; mid-fight SET_PHASE residual.
      BOSS_SPELLS.alzzin,
      [
        // Acid 1149213–19 @40%: drop forms, CFH, 15×11460; 1149214 SET_INST_DATA SPECIAL.
        // Caller: dmEastOpenCrumbleWall → go-opened for GO 177220 (cpp:247-250).
        {
          kind: 'hpThreshold',
          pct: DIRE_MAUL_EAST_ALZZIN_MINIONS.pct,
          once: true,
          phase: 4,
          spawn: [
            {
              creatureEntry: DIRE_MAUL_EAST_ALZZIN_MINIONS.creatureEntry,
              count: DIRE_MAUL_EAST_ALZZIN_MINIONS.count,
            },
          ],
        },
        // Acid 1149221 death → TYPE_ALZZIN DONE; dmEastApplyAlzzinDone opens 179502 + reveal 179559.
        { kind: 'setsFlag', flag: DIRE_MAUL_EAST_FLAGS.alzzinDone },
      ],
      'Alzzin shifts Dire Wolf and Tree forms, then at 40% drops forms and calls his minions.',
    ),
  );

  // Optional T0.5 — Brazier of Beckoning at Isalien focus (Alzzin's room).
  // Cite: GO 181047; item 22050; trigger 16045; NPC 16097.
  {
    const isa = boss(
      DM_EAST_ISALIEN.encId,
      'Isalien',
      DM_EAST_ISALIEN.bossEntry,
      BOSS_SPELLS.isalien,
      [
        {
          kind: 'objectGate',
          goEntry: DM_EAST_ISALIEN.goEntry,
          requiredItem: DM_EAST_ISALIEN.requiredItem,
          setsFlag: DIRE_MAUL_EAST_FLAGS.isalien,
          once: true,
        },
        { kind: 'requiresFlag', flag: DIRE_MAUL_EAST_FLAGS.isalien },
      ],
      "The Brazier of Beckoning at Isalien's focus summons the spectral night elf (optional T0.5).",
    );
    isa.origin = { ...DM_EAST_ISALIEN.spawn };
    isa.optional = true;
    out.push(isa);
  }

  return out;
}

function buildEncounters(): EncounterDef[] {
  // Hand spine = bosses + event-gated packs (mono trashFromCensus is empty).
  const spine = buildHandSpine();
  return buildClusterEncounters({
    mapId: 429,
    spine,
    entrance: entranceForInstance('dire-maul-east'),
    includePack: wingFilterByNearestBoss(429, "east"),
  });
}


// East-relevant survey quests, completable inside or targeting East bosses. West/North-only and
// D-10 seasonal rows are excluded.
export const DIRE_MAUL_EAST_QUESTS = [
  7441, // Pusillin and the Elder Azj'Tordin - Book of Incantations (Pusillin)
  7488, // Lethtendris's Web (A)
  7489, // Lethtendris's Web (H)
  7463, // Arcane Refreshment - Hydrospawn Essence (Hydrospawn)
  7581, // The Prison's Bindings - Satyr Blood (Wildspawn satyrs)
] as const;

/** Rounded static pack targets used by this graph (for tests / docs). */
export const DIRE_MAUL_EAST_STATIC = { ...STATIC } as const;

/** Entry → rounded static count (for tests). */
export const DIRE_MAUL_EAST_STATIC_BY_ENTRY: Readonly<Record<number, number>> = {
  [ENTRY.phaseLasher]: STATIC.phaseLasher,
  [ENTRY.warpwoodTreant]: STATIC.warpwoodTreant,
  [ENTRY.warpwoodTangler]: STATIC.warpwoodTangler,
  [ENTRY.felLash]: STATIC.felLash,
  [ENTRY.deathLash]: STATIC.deathLash,
  [ENTRY.whipLasher]: STATIC.whipLasher,
  [ENTRY.warpwoodStomper]: STATIC.warpwoodStomper,
  [ENTRY.warpwoodGuardian]: STATIC.warpwoodGuardian,
  [ENTRY.warpwoodCrusher]: STATIC.warpwoodCrusher,
  [ENTRY.wildspawnSatyr]: STATIC.wildspawnSatyr,
  [ENTRY.wildspawnBetrayer]: STATIC.wildspawnBetrayer,
  [ENTRY.wildspawnFelsworn]: STATIC.wildspawnFelsworn,
  [ENTRY.wildspawnShadowstalker]: STATIC.wildspawnShadowstalker,
  [ENTRY.wildspawnRogue]: STATIC.wildspawnRogue,
  [ENTRY.wildspawnTrickster]: STATIC.wildspawnTrickster,
  [ENTRY.wildspawnHellcaller]: STATIC.wildspawnHellcaller,
  [ENTRY.wildspawnImp]: STATIC.wildspawnImp,
};

/** Bake-sourced boss spell lists (for tests). */
export const DIRE_MAUL_EAST_BOSS_SPELLS = { ...BOSS_SPELLS } as const;

export const DIRE_MAUL_EAST: InstanceDef = {
  id: 'dire-maul-east',
  mapId: 429,
  wing: 'east',
  name: 'Dire Maul (East)',
  portalZone: 'feralas',
  minLevel: 45, // entrance triggers requiredLevel 45
  levelRange: [54, 58], // East trash/boss band (mission)
  lockoutMs: 0,
  description: '',
  quests: [...DIRE_MAUL_EAST_QUESTS],
  encounters: buildEncounters(),
  // Alzzin death DoRespawnGameObject Felvine Shard (instance_dire_maul.cpp:241-244).
  lootObjects: [
    { goEntry: GO_FELVINE_SHARD, revealedByFlag: DIRE_MAUL_EAST_FLAGS.alzzinDone },
  ],
};

// Counts pure static trash packs only: bosses excluded, the Pusillin imp pack rides the boss
// encounter, Alzzin minions are hpThreshold spawns, and Pimgib rides the Lethtendris pack.
export function direMaulEastPureStaticTrashCounts(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of DIRE_MAUL_EAST.encounters) {
    if (enc.kind !== 'trash') continue;
    add(enc.creatureEntry, 1);
    for (const p of enc.pack ?? []) add(p.creatureEntry, p.count);
  }
  return map;
}

/** Sum of authored kill supply (trash + bosses + packs + event spawns). */
export function direMaulEastKillSupply(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of DIRE_MAUL_EAST.encounters) {
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
  return map;
}
