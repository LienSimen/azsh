// Scarlet Monastery Armory wing (map 189) — InstanceDef. ScriptDev owns the combat kit and the
// JustDied 20× 6575, so there is no InstanceDef onDeathSummon to double-fire with it.

import type { EncounterDef, EncounterEvent, InstanceDef } from '../schema.ts';
import {
  entranceForInstance,
  buildClusterEncounters,
  wingFilterByNearestBoss,
} from './pack-from-clusters.ts';

// ---- Census static counts (Armory + armory-ish hallway; map 189 wing slice) ----
// Trainee 6575 is summon-only. Do NOT invent hallway Myrmidon extras — the C++ notes them missing.

const STATIC = {
  conjuror: 1, // 4297 Scarlet Conjuror
  soldier: 17, // 4286 Scarlet Soldier
  evoker: 4, // 4289 Scarlet Evoker
  guardsman: 7, // 4290 Scarlet Guardsman
  protector: 11, // 4292 Scarlet Protector
  defender: 23, // 4298 Scarlet Defender
  myrmidon: 27, // 4295 Scarlet Myrmidon
} as const;

const ENTRY = {
  conjuror: 4297,
  soldier: 4286,
  evoker: 4289,
  guardsman: 4290,
  protector: 4292,
  defender: 4298,
  myrmidon: 4295,
  herod: 3975,
  trainee: 6575, // summon-only; may be missing from bake
} as const;

/** Armory boss clear flag (Herod death credit). */
export const SM_ARMORY_FLAGS = {
  herodDeath: 'sm-armory-herod-death',
} as const;

/** Survey count of trainees after Herod death (boss_herod.cpp JustDied). */
export const HEROD_TRAINEE_COUNT = 20;

// Herod JustDied → 20× Scarlet Trainee at 1939.18,-431.58,17.09, each starting after
// urand(1000,6000). Extend only; do not re-derive the point, count or stagger.
export const HEROD_TRAINEE = {
  herodEntry: ENTRY.herod,
  traineeEntry: ENTRY.trainee,
  count: HEROD_TRAINEE_COUNT,
  /** boss_herod.cpp:142 urand(1000, 6000) before escort Start(true). */
  staggerMinMs: 1_000,
  staggerMaxMs: 6_000,
  /** JustDied summon point (armory door). Cite: boss_herod.cpp:90. */
  spawn: { x: 1939.18, y: -431.58, z: 17.09, o: 6.22 },
  /** TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN. Cite: cpp:90 datalong 600000. */
  despawnMs: 600_000,
} as const;

// Herod combat kit (Whirlwind + Frenzy) — ScriptDev owns live casts. Cite: boss_herod.cpp:39-42 spells;
// :57-64 Reset; :66-70 Aggro; :98-127 combat.
export const SM_HEROD = {
  encId: 'herod',
  entry: ENTRY.herod,
  /** boss_herod.cpp:39 SPELL_RUSHINGCHARGE — Aggro self */
  spellRushingCharge: 8260,
  /** boss_herod.cpp:40 SPELL_CLEAVE */
  spellCleave: 15496,
  /** boss_herod.cpp:41 SPELL_WHIRLWIND */
  spellWhirlwind: 8989,
  /** boss_herod.cpp:42 SPELL_FRENZY */
  spellFrenzy: 8269,
  /** Frenzy once. Cite: cpp:99 GetHealthPercent() <= 30.0f */
  enrageHpPct: 30,
  /** Reset m_uiCleaveTimer. Cite: cpp:62 */
  cleaveInitialMs: 7_500,
  /** re-arm urand(7500, 17500). Cite: cpp:113 */
  cleaveRepeatMinMs: 7_500,
  cleaveRepeatMaxMs: 17_500,
  /** Reset m_uiWhirlwindTimer. Cite: cpp:63 */
  whirlwindInitialMs: 14_500,
  /** CAST_OK re-arm urand(15000, 25000). Cite: cpp:123 */
  whirlwindRepeatMinMs: 15_000,
  whirlwindRepeatMaxMs: 25_000,
} as const;

// Pure: Frenzy only at/below 30% and not already enraged. Negative: hp > 30 → false. Cite:
// boss_herod.cpp:98-107.
export function canHerodEnrage(args: {
  hpPct: number;
  alreadyEnraged: boolean;
}): boolean {
  if (args.alreadyEnraged) return false;
  return args.hpPct <= SM_HEROD.enrageHpPct;
}

// Pure: trainee count from JustDied only. Negative: herodDead=false → 0 (never mid-fight). Cite:
// boss_herod.cpp:87-91.
export function herodTraineeSpawnCount(args: { herodDead: boolean }): number {
  return args.herodDead ? HEROD_TRAINEE.count : 0;
}

// Armory contributes Herod to multi-wing kill quests 1048/1053. Those quests are registered on
// sm-cathedral; armory quests empty for now (loot quest 1113 is multi-wing - optional later).
export const SM_ARMORY_QUESTS = [] as const;

// Combat kit from boss_herod.cpp (ScriptDev owns live casts; bake may list different ids).
const BOSS_SPELLS = {
  herod: [
    SM_HEROD.spellRushingCharge,
    SM_HEROD.spellCleave,
    SM_HEROD.spellWhirlwind,
    SM_HEROD.spellFrenzy,
  ],
} as const;

/** Split a static spawn count into pack sizes in [2, 5] (prefer 4). Remainder 1 folded into prior pack. */
export function splitPackSizes(total: number, prefer = 4): number[] {
  if (total <= 0) return [];
  if (total === 1) return [1]; // single elite (Conjuror)
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
    bossSpells: [...bossSpells],
  };
  if (intro) enc.intro = intro;
  if (events && events.length) enc.events = events;
  return enc;
}

// Linear encounter graph: armory trash from entrance to arena, then Herod. Combat is ScriptDev
// boss_herod, and `events` carries setsFlag only — the summon_count owns the 20 trainees.
function buildHandSpine(): EncounterDef[] {
  const conjurors = trashFromCensus('conjuror', 'Scarlet Conjuror', ENTRY.conjuror, STATIC.conjuror);
  const soldiers = trashFromCensus('soldier', 'Scarlet Soldier', ENTRY.soldier, STATIC.soldier);
  const evokers = trashFromCensus('evoker', 'Scarlet Evoker', ENTRY.evoker, STATIC.evoker);
  const guardsmen = trashFromCensus('guardsman', 'Scarlet Guardsman', ENTRY.guardsman, STATIC.guardsman);
  const protectors = trashFromCensus('protector', 'Scarlet Protector', ENTRY.protector, STATIC.protector);
  const defenders = trashFromCensus('defender', 'Scarlet Defender', ENTRY.defender, STATIC.defender);
  const myrmidons = trashFromCensus('myrmidon', 'Scarlet Myrmidon', ENTRY.myrmidon, STATIC.myrmidon);

  const outer: EncounterDef[] = [];
  const halfSoldiers = Math.ceil(soldiers.length / 2);
  outer.push(...soldiers.slice(0, halfSoldiers), ...conjurors, ...soldiers.slice(halfSoldiers));

  const mid: EncounterDef[] = [...evokers, ...guardsmen, ...protectors];
  const deep: EncounterDef[] = [...defenders, ...myrmidons];

  const out: EncounterDef[] = [];
  out.push(...outer, ...mid, ...deep);

  out.push(
    boss(
      SM_HEROD.encId,
      'Herod',
      ENTRY.herod,
      BOSS_SPELLS.herod,
      [{ kind: 'setsFlag', flag: SM_ARMORY_FLAGS.herodDeath }],
      "Herod the Scarlet Champion waits in the armory arena - Whirlwind, Frenzy at 30%, then 20 Scarlet Trainees on death.",
    ),
  );

  return out;
}

function buildEncounters(): EncounterDef[] {
  // Hand spine = bosses + event-gated packs (mono trashFromCensus is empty).
  const spine = buildHandSpine();
  return buildClusterEncounters({
    mapId: 189,
    spine,
    entrance: entranceForInstance('sm-armory'),
    includePack: wingFilterByNearestBoss(189, "arm"),
  });
}


export const SM_ARMORY: InstanceDef = {
  id: 'sm-armory',
  mapId: 189,
  wing: 'arm',
  name: 'Scarlet Monastery - Armory',
  portalZone: 'tirisfal',
  minLevel: 20,
  levelRange: [35, 40], // Armory trash/boss band
  lockoutMs: 0,
  description: '',
  quests: [...SM_ARMORY_QUESTS],
  encounters: buildEncounters(),
};

/** Count of creatureEntry across primary + pack for one encounter. */
export function encounterCreatureCount(enc: EncounterDef, creatureEntry: number): number {
  let n = enc.creatureEntry === creatureEntry ? 1 : 0;
  for (const p of enc.pack ?? []) {
    if (p.creatureEntry === creatureEntry) n += p.count;
  }
  return n;
}

// Pure static trash pack totals (bosses excluded). Must match STATIC / mission census for armory wing
// entries.
export function smArmoryPureStaticTrashCounts(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of SM_ARMORY.encounters) {
    if (enc.kind !== 'trash') continue;
    add(enc.creatureEntry, 1);
    for (const p of enc.pack ?? []) add(p.creatureEntry, p.count);
  }
  return map;
}
