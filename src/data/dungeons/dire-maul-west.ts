// Dire Maul West wing / Capital Gardens (map 429) — InstanceDef graph, library and Immol'thar prison
// only. Authority: docs/dungeons/survey/17-dire-maul.md West wing, which carries the GAPS list.

import type { EncounterDef, EncounterEvent, InstanceDef } from '../schema.ts';
import { dungeonGameObjectsForMap } from '../dungeonGameObjects.ts';
import { dungeonSpawnsForMap } from '../dungeonSpawns.ts';
import {
  entranceForInstance,
  buildClusterEncounters,
  wingFilterByNearestBoss,
} from './pack-from-clusters.ts';

// ---- West-wing static trash (survey census static column) ----
// Warpwood East, Gordok North, friendly service and seasonal rows are excluded.

const STATIC = {
  // Capital Gardens approach (Tendris / Ironbark trees)
  petrifiedTreant: 21, // 11458
  petrifiedGuardian: 10, // 14303
  ironbarkProtector: 8, // 11459
  // Library undead / Highborne
  eldrethApparition: 14, // 11471
  eldrethSpirit: 15, // 11472
  eldrethPhantasm: 11, // 11475
  eldrethSeether: 12, // 11469
  eldrethSpectre: 8, // 11473
  eldrethDarter: 9, // 14398
  skeletalHighborne: 19, // 11476
  rottingHighborne: 17, // 11477
  highborneSummoner: 18, // 11466
  // Immol'thar prison / pylon guards
  manaRemnant: 24, // 11483
  arcaneAberration: 16, // 11480
  residualMonstrosity: 9, // 11484
  arcaneTorrent: 10, // 14399
  arcaneFeedback: 38, // 14400
  // Illyanna's pet (static ×1; pulled with / before Illyanna)
  ferra: 1, // 14308
} as const;

const ENTRY = {
  petrifiedTreant: 11458,
  petrifiedGuardian: 14303,
  ironbarkProtector: 11459,
  eldrethApparition: 11471,
  eldrethSpirit: 11472,
  eldrethPhantasm: 11475,
  eldrethSeether: 11469,
  eldrethSpectre: 11473,
  eldrethDarter: 14398,
  skeletalHighborne: 11476,
  rottingHighborne: 11477,
  highborneSummoner: 11466,
  manaRemnant: 11483,
  arcaneAberration: 11480,
  residualMonstrosity: 11484,
  arcaneTorrent: 14399,
  arcaneFeedback: 14400,
  ferra: 14308,
  // West bosses (survey canonical order)
  tendris: 11489,
  illyanna: 11488,
  kalendris: 11487,
  tsuzee: 11467, // rare-elite
  immolthar: 11496,
  tortheldrin: 11486,
  // Summon-only (Tendris death dbscript)
  ancientEquineSpirit: 14566,
} as const;

/** Instance flags for West wing door / ally-turned-boss gates. */
export const DIRE_MAUL_WEST_FLAGS = {
  /** TYPE_WARPWOOD - Tendris death opens Warpwood Door 177221. */
  tendrisDeath: 'dmw-tendris-death',
  // TYPE_PYLON_1..5 DONE — each pylon's guards all dead. Cite: dire_maul.h:23-27 TYPE_PYLON_1..5;
  // instance_dire_maul.cpp:595-612 PylonGuardJustDied.
  pylon1: 'dmw-pylon-1',
  pylon2: 'dmw-pylon-2',
  pylon3: 'dmw-pylon-3',
  pylon4: 'dmw-pylon-4',
  pylon5: 'dmw-pylon-5',
  /** TYPE_IMMOLTHAR - Immol'thar death turns Prince Tortheldrin hostile. */
  immoltharDeath: 'dmw-immolthar-death',
} as const;

// Forcefield + 5 crystal generators. Cite: dire_maul.h:63-68; instance_dire_maul.cpp:528-530
// CheckAllGeneratorsDestroyed, :533-536 open forcefield, SortPylonGuards :562-592.
export const DM_WEST_FORCEFIELD = {
  goEntry: 179503,
  /** Crystal generator GO entries in TYPE_PYLON_1..5 order. */
  pylonGoEntries: [177259, 177257, 177258, 179504, 179505] as const,
  /** Guard entries sorted onto generators. Cite: dire_maul.h:55-56. */
  guardEntries: [11480, 11483] as const,
  /** Sort radius yd 2d. Cite: instance_dire_maul.cpp:583 IsWithinDist2d(..., 20.0f). */
  sortRadiusYd: 20,
  immoltharEntry: 11496,
  highborneSummonerEntry: 11466,
} as const;

// West lock-1562 doors (Crescent Key 18249 or picklock 300). 177221 also opens on TYPE_WARPWOOD
// DONE; 179550 is north-before-west plus key. Cite: dire_maul.h:69-70.
export const DM_WEST_CRESCENT_DOORS = {
  lockId: 1562,
  goEntries: [177221, 179550] as const,
  requiredItem: 18249,
  picklockSkill: 300,
} as const;

export const DM_WEST_PYLON_FLAGS = [
  DIRE_MAUL_WEST_FLAGS.pylon1,
  DIRE_MAUL_WEST_FLAGS.pylon2,
  DIRE_MAUL_WEST_FLAGS.pylon3,
  DIRE_MAUL_WEST_FLAGS.pylon4,
  DIRE_MAUL_WEST_FLAGS.pylon5,
] as const;

export type DmWestPylonDef = {
  index: number;
  goEntry: number;
  flag: string;
  encId: string;
  /** Spawn guids of 11480/11483 within sortRadiusYd of this generator. */
  guardGuids: readonly number[];
  origin: { x: number; y: number; z?: number };
};

// Port of SortPylonGuards — assign Arcane Aberration / Mana Remnant spawns to each crystal
// generator within 20 yd 2d, generators 1→5, first claim wins. Cite: instance_dire_maul.cpp:562-592.
function sortPylonGuardsFromBake(): DmWestPylonDef[] {
  const gos = dungeonGameObjectsForMap(429);
  const guardSet = new Set<number>(DM_WEST_FORCEFIELD.guardEntries);
  const remaining = dungeonSpawnsForMap(429).filter((s) => guardSet.has(s.entry));
  const out: DmWestPylonDef[] = [];
  for (let i = 0; i < DM_WEST_FORCEFIELD.pylonGoEntries.length; i++) {
    const goEntry = DM_WEST_FORCEFIELD.pylonGoEntries[i]!;
    const go = gos.find((g) => g.entry === goEntry);
    if (!go) {
      out.push({
        index: i,
        goEntry,
        flag: DM_WEST_PYLON_FLAGS[i]!,
        encId: `pylon-${i + 1}`,
        guardGuids: [],
        origin: { x: 0, y: 0 },
      });
      continue;
    }
    const r = DM_WEST_FORCEFIELD.sortRadiusYd;
    const claimed: number[] = [];
    for (let j = remaining.length - 1; j >= 0; j--) {
      const s = remaining[j]!;
      const dx = s.x - go.x;
      const dy = s.y - go.y;
      if (Math.hypot(dx, dy) <= r) {
        claimed.push(s.guid);
        remaining.splice(j, 1);
      }
    }
    // Stable guid order for deterministic packs.
    claimed.sort((a, b) => a - b);
    const origin: { x: number; y: number; z?: number } = { x: go.x, y: go.y };
    if (go.z != null && Number.isFinite(go.z)) origin.z = go.z;
    out.push({
      index: i,
      goEntry,
      flag: DM_WEST_PYLON_FLAGS[i]!,
      encId: `pylon-${i + 1}`,
      guardGuids: claimed,
      origin,
    });
  }
  return out;
}

/** 5 pylons with bake-sourced guard guids (40 total: 8 per generator on map 429). */
export const DM_WEST_PYLONS: readonly DmWestPylonDef[] = sortPylonGuardsFromBake();

/** All pylon-guard guids claimed by hand spine (exclude from cluster trash). */
export const DM_WEST_PYLON_GUARD_GUIDS: ReadonlySet<number> = new Set(
  DM_WEST_PYLONS.flatMap((p) => p.guardGuids),
);

/** True when all 5 TYPE_PYLON_* flags are set (forcefield open). */
export function dmWestForcefieldDown(flags: readonly string[]): boolean {
  return DM_WEST_PYLON_FLAGS.every((f) => flags.includes(f));
}

/** How many of the 5 pylons are DONE (0–5). */
export function dmWestPylonsDone(flags: readonly string[]): number {
  let n = 0;
  for (const f of DM_WEST_PYLON_FLAGS) {
    if (flags.includes(f)) n += 1;
  }
  return n;
}

/** Immol'thar attackable only after forcefield drops. */
export function dmWestImmoltharAttackable(flags: readonly string[]): boolean {
  return dmWestForcefieldDown(flags);
}

// Eye of Immol'thar summon target. Cite: EventAI 1149603 action CAST 22899; spell-data rawEffects effect=42
// miscValue=14396.
export const DM_WEST_IMMOLTHAR_EYE = {
  spellId: 22899,
  portalSpellId: 22950,
  creatureEntry: 14396,
} as const;

// The Madness Within (7461) quest-end: up to 8× Shen'dralar Spirit 14364 at the Athenaeum, aborting
// if one is already within 10 yd. Cite: dbscripts_on_quest_end 7461; ScriptMgr.cpp cmd 10/31.
export const DM_WEST_MADNESS_SPIRITS = {
  questId: 7461,
  creatureEntry: 14364,
  /** Abort search radius. Cite: cmd 31 datalong2=10. */
  abortRadiusYd: 10,
  /** Despawn ms. Cite: cmd 10 datalong2=600000. */
  despawnMs: 600_000,
  /** Absolute map 429 coords from baked quest-end rows (priority 1). */
  positions: [
    { x: 9.86833, y: 399.483, z: 25.1394, o: 0.645772 },
    { x: 16.5058, y: 396.353, z: 25.1394, o: 0.366519 },
    { x: 14.0871, y: 394.116, z: 25.1394, o: 5.67232 },
    { x: 13.378, y: 398.393, z: 25.1394, o: 3.87463 },
    { x: 4.33656, y: 395.79, z: 25.1394, o: 6.26573 },
    { x: 6.27106, y: 393.316, z: 25.1394, o: 0.0174533 },
    { x: 6.21175, y: 398.111, z: 25.1394, o: 0.541052 },
    { x: 9.8532, y: 392.825, z: 25.1394, o: 4.4855 },
  ] as const,
} as const;

// West-relevant survey quests (Immol'thar, Tortheldrin, library librams, Tendris charger).
// East, North and seasonal rows excluded.
export const DIRE_MAUL_WEST_QUESTS = [
  7461, // The Madness Within (Immol'thar + Tortheldrin)
  7462, // The Treasure of the Shen'dralar (A)
  7877, // The Treasure of the Shen'dralar (H)
  7483, // Libram of Rapidity
  7484, // Libram of Focus
  7485, // Libram of Protection
  7498, // Garona: A Study on Stealth and Treachery
  7499, // Codex of Defense
  7500, // The Arcanist's Cookbook
  7501, // The Light and How To Swing It
  7502, // Harnessing Shadows
  7503, // The Greatest Race of Hunters
  7504, // Holy Bologna: What the Light Won't Tell You
  7505, // Frost Shock and You
  7506, // The Emerald Dream...
  7507, // Foror's Compendium
  7508, // The Forging of Quel'Serrar
  7509, // The Forging of Quel'Serrar (repeatable)
  7644, // Blessed Arcanite Barding (Ancient Equine / Tendris)
  7647, // Judgment and Redemption
  7649, // Enchanted Thorium Platemail: Volume I
  7650, // Enchanted Thorium Platemail: Volume II
  7651, // Enchanted Thorium Platemail: Volume III
  8948, // Anthion's Old Friend (Falrin in library)
  8950, // The Instigator's Enchantment (Eldreth)
  9015, // The Challenge
] as const;

/** Static pack targets used by this graph (entry → count) for tests. */
export const DIRE_MAUL_WEST_STATIC: Readonly<Record<number, number>> = {
  [ENTRY.petrifiedTreant]: STATIC.petrifiedTreant,
  [ENTRY.petrifiedGuardian]: STATIC.petrifiedGuardian,
  [ENTRY.ironbarkProtector]: STATIC.ironbarkProtector,
  [ENTRY.eldrethApparition]: STATIC.eldrethApparition,
  [ENTRY.eldrethSpirit]: STATIC.eldrethSpirit,
  [ENTRY.eldrethPhantasm]: STATIC.eldrethPhantasm,
  [ENTRY.eldrethSeether]: STATIC.eldrethSeether,
  [ENTRY.eldrethSpectre]: STATIC.eldrethSpectre,
  [ENTRY.eldrethDarter]: STATIC.eldrethDarter,
  [ENTRY.skeletalHighborne]: STATIC.skeletalHighborne,
  [ENTRY.rottingHighborne]: STATIC.rottingHighborne,
  [ENTRY.highborneSummoner]: STATIC.highborneSummoner,
  [ENTRY.manaRemnant]: STATIC.manaRemnant,
  [ENTRY.arcaneAberration]: STATIC.arcaneAberration,
  [ENTRY.residualMonstrosity]: STATIC.residualMonstrosity,
  [ENTRY.arcaneTorrent]: STATIC.arcaneTorrent,
  [ENTRY.arcaneFeedback]: STATIC.arcaneFeedback,
  [ENTRY.ferra]: STATIC.ferra,
};

/** West trash creature entries only (bosses / summon-only / East / North excluded). */
export const DIRE_MAUL_WEST_TRASH_ENTRIES = [
  ENTRY.petrifiedTreant,
  ENTRY.petrifiedGuardian,
  ENTRY.ironbarkProtector,
  ENTRY.eldrethApparition,
  ENTRY.eldrethSpirit,
  ENTRY.eldrethPhantasm,
  ENTRY.eldrethSeether,
  ENTRY.eldrethSpectre,
  ENTRY.eldrethDarter,
  ENTRY.skeletalHighborne,
  ENTRY.rottingHighborne,
  ENTRY.highborneSummoner,
  ENTRY.manaRemnant,
  ENTRY.arcaneAberration,
  ENTRY.residualMonstrosity,
  ENTRY.arcaneTorrent,
  ENTRY.arcaneFeedback,
  ENTRY.ferra,
] as const;

/** Summon-only entries that must never appear in pure static trash packs. */
export const DIRE_MAUL_WEST_SUMMON_ONLY_ENTRIES = new Set<number>([
  ENTRY.ancientEquineSpirit, // 14566 Tendris death
]);

/** East-wing creature entries that must never appear in the West graph. */
export const DIRE_MAUL_EAST_FORBIDDEN = [
  14354, // Pusillin
  11490, // Zevrim Thornhoof
  13280, // Hydrospawn
  14327, // Lethtendris
  11492, // Alzzin the Wildshaper
  14349, // Pimgib
  11491, // Old Ironbark
  11451, // Wildspawn Satyr
  11452, // Wildspawn Rogue
  11453, // Wildspawn Trickster
  11454, // Wildspawn Betrayer
  11455, // Wildspawn Felsworn
  11456, // Wildspawn Shadowstalker
  11457, // Wildspawn Hellcaller
  13276, // Wildspawn Imp
  11462, // Warpwood Treant
  11464, // Warpwood Tangler
  11461, // Warpwood Guardian
  11465, // Warpwood Stomper
  13021, // Warpwood Crusher
  13022, // Whip Lasher
  13196, // Phase Lasher
  13197, // Fel Lash
  13285, // Death Lash
  13160, // Carrion Swarmer
] as const;

/** North-wing creature entries that must never appear in the West graph. */
export const DIRE_MAUL_NORTH_FORBIDDEN = [
  14326, // Guard Mol'dar
  14322, // Stomper Kreeg
  14321, // Guard Fengus
  14323, // Guard Slip'kik
  14325, // Captain Kromcrush
  14324, // Cho'Rush the Observer
  11501, // King Gordok
  11441, // Gordok Brute
  11444, // Gordok Mage-Lord
  11445, // Gordok Captain
  11448, // Gordok Warlock
  11450, // Gordok Reaver
  11446, // Gordok Spirit
  13036, // Gordok Mastiff
  14338, // Knot Thimblejack
] as const;

/** Split a static spawn count into pack sizes in [2, 5] (prefer 4). Remainder 1 folded into prior pack. */
export function splitPackSizes(total: number, prefer = 4): number[] {
  if (total <= 0) return [];
  if (total === 1) return [1]; // single elite (Ferra)
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

// Boss spells: creature.spells from bake (game-data) - no invented ids.
const BOSS_SPELLS = {
  tendris: [5568, 22924, 22916, 22994],
  illyanna: [5116, 20904, 14290, 14295, 22908, 22910, 22914, 20735],
  kalendris: [17146, 22919, 17287, 7645, 22917],
  tsuzee: [12540, 14873, 21060, 15581],
  immolthar: [16128, 15550, 22899, 5568, 22950, 8269],
  tortheldrin: [20691, 22920, 8876, 15589, 22995, 20537],
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

/** Guid → entry for pylon guards (module init). */
const PYLON_SPAWN_ENTRY = (() => {
  const m = new Map<number, number>();
  const want = DM_WEST_PYLON_GUARD_GUIDS;
  for (const s of dungeonSpawnsForMap(429)) {
    if (want.has(s.guid)) m.set(s.guid, s.entry);
  }
  return m;
})();

// One pylon pack: all bake guids within 20yd of the generator, setsFlag on clear. Cite:
// instance_dire_maul.cpp:595-612 empty sorted set → TYPE_PYLON_N DONE.
function pylonEncounter(p: DmWestPylonDef): EncounterDef {
  const members = p.guardGuids
    .map((g) => {
      const entry = PYLON_SPAWN_ENTRY.get(g);
      return entry != null ? { guid: g, entry } : null;
    })
    .filter((s): s is { guid: number; entry: number } => !!s);
  // Primary = lowest-guid Arcane Aberration if any, else first guard.
  const ab = members.filter((m) => m.entry === ENTRY.arcaneAberration);
  const primary = (ab[0] ?? members[0])!;
  const counts = new Map<number, number>();
  for (const m of members) {
    if (m.guid === primary.guid) continue;
    counts.set(m.entry, (counts.get(m.entry) ?? 0) + 1);
  }
  const pack = [...counts.entries()].map(([creatureEntry, count]) => ({ creatureEntry, count }));
  const enc: EncounterDef = {
    id: p.encId,
    name: `Arcane Pylon ${p.index + 1}`,
    kind: 'trash',
    creatureEntry: primary.entry,
    origin: { ...p.origin },
    spawnGuids: [...p.guardGuids],
    events: [{ kind: 'setsFlag', flag: p.flag }],
  };
  if (pack.length) enc.pack = pack;
  return enc;
}

// Linear West encounter graph in survey boss order: gardens → Tendris → library → Illyanna →
// Kalendris → Tsu'zee → 5 pylons → Immol'thar (needs all 5) → Prince Tortheldrin.
function buildHandSpine(): EncounterDef[] {
  const petrifiedTreants = trashFromCensus(
    'petrified-treant',
    'Petrified Treant',
    ENTRY.petrifiedTreant,
    STATIC.petrifiedTreant,
  );
  const petrifiedGuardians = trashFromCensus(
    'petrified-guardian',
    'Petrified Guardian',
    ENTRY.petrifiedGuardian,
    STATIC.petrifiedGuardian,
  );
  const ironbarks = trashFromCensus(
    'ironbark-protector',
    'Ironbark Protector',
    ENTRY.ironbarkProtector,
    STATIC.ironbarkProtector,
  );
  const apparitions = trashFromCensus(
    'eldreth-apparition',
    'Eldreth Apparition',
    ENTRY.eldrethApparition,
    STATIC.eldrethApparition,
  );
  const spirits = trashFromCensus(
    'eldreth-spirit',
    'Eldreth Spirit',
    ENTRY.eldrethSpirit,
    STATIC.eldrethSpirit,
  );
  const phantasms = trashFromCensus(
    'eldreth-phantasm',
    'Eldreth Phantasm',
    ENTRY.eldrethPhantasm,
    STATIC.eldrethPhantasm,
  );
  const seethers = trashFromCensus(
    'eldreth-seether',
    'Eldreth Seether',
    ENTRY.eldrethSeether,
    STATIC.eldrethSeether,
  );
  const spectres = trashFromCensus(
    'eldreth-spectre',
    'Eldreth Spectre',
    ENTRY.eldrethSpectre,
    STATIC.eldrethSpectre,
  );
  const darters = trashFromCensus(
    'eldreth-darter',
    'Eldreth Darter',
    ENTRY.eldrethDarter,
    STATIC.eldrethDarter,
  );
  const skeletalHighborne = trashFromCensus(
    'skeletal-highborne',
    'Skeletal Highborne',
    ENTRY.skeletalHighborne,
    STATIC.skeletalHighborne,
  );
  const rottingHighborne = trashFromCensus(
    'rotting-highborne',
    'Rotting Highborne',
    ENTRY.rottingHighborne,
    STATIC.rottingHighborne,
  );
  const highborneSummoners = trashFromCensus(
    'highborne-summoner',
    'Highborne Summoner',
    ENTRY.highborneSummoner,
    STATIC.highborneSummoner,
  );
  const manaRemnants = trashFromCensus(
    'mana-remnant',
    'Mana Remnant',
    ENTRY.manaRemnant,
    STATIC.manaRemnant,
  );
  const arcaneAberrations = trashFromCensus(
    'arcane-aberration',
    'Arcane Aberration',
    ENTRY.arcaneAberration,
    STATIC.arcaneAberration,
  );
  const residualMonstrosities = trashFromCensus(
    'residual-monstrosity',
    'Residual Monstrosity',
    ENTRY.residualMonstrosity,
    STATIC.residualMonstrosity,
  );
  const arcaneTorrents = trashFromCensus(
    'arcane-torrent',
    'Arcane Torrent',
    ENTRY.arcaneTorrent,
    STATIC.arcaneTorrent,
  );
  const arcaneFeedbacks = trashFromCensus(
    'arcane-feedback',
    'Arcane Feedback',
    ENTRY.arcaneFeedback,
    STATIC.arcaneFeedback,
  );
  const ferraPack = trashFromCensus('ferra', 'Ferra', ENTRY.ferra, STATIC.ferra);

  // Half-splits for multi-band library trash
  const midApp = Math.ceil(apparitions.length / 2);
  const midSpirit = Math.ceil(spirits.length / 2);
  const midSkel = Math.ceil(skeletalHighborne.length / 2);
  const midRot = Math.ceil(rottingHighborne.length / 2);
  const midSeeth = Math.ceil(seethers.length / 2);
  const midPhant = Math.ceil(phantasms.length / 2);
  const midSumm = Math.ceil(highborneSummoners.length / 2);

  const out: EncounterDef[] = [];

  // --- Capital Gardens approach → Tendris Warpwood ---
  out.push(...petrifiedTreants, ...petrifiedGuardians, ...ironbarks);
  out.push(
    boss(
      'tendris-warpwood',
      'Tendris Warpwood',
      ENTRY.tendris,
      BOSS_SPELLS.tendris,
      [
        // TYPE_WARPWOOD: death opens Warpwood Door 177221.
        { kind: 'setsFlag', flag: DIRE_MAUL_WEST_FLAGS.tendrisDeath },
        // dbscripts_on_creature_death 11489 → Ancient Equine Spirit 14566 (paladin charger).
        { kind: 'onDeathSummon', creatureEntry: ENTRY.ancientEquineSpirit },
      ],
      'Tendris Warpwood roots the Capital Gardens - his death opens the Warpwood Door and calls the Ancient Equine Spirit.',
    ),
  );

  // --- Post-Tendris library approach → Illyanna (+ Ferra) ---
  // Door is flag-gated for documentation; sequential order also unlocks.
  const postTendrisLibrary = [
    ...apparitions.slice(0, midApp),
    ...spirits.slice(0, midSpirit),
    ...skeletalHighborne.slice(0, midSkel),
    ...darters.slice(0, Math.ceil(darters.length / 2)),
  ].map((e) => ({
    ...e,
    events: [
      ...(e.events ?? []),
      { kind: 'requiresFlag' as const, flag: DIRE_MAUL_WEST_FLAGS.tendrisDeath },
    ],
  }));
  out.push(...postTendrisLibrary, ...ferraPack);
  out.push(
    boss(
      'illyanna-ravenoak',
      'Illyanna Ravenoak',
      ENTRY.illyanna,
      BOSS_SPELLS.illyanna,
      undefined,
      'Illyanna Ravenoak and her bear Ferra hunt the Capital Gardens.',
    ),
  );

  // --- Library hall → Magister Kalendris ---
  out.push(
    ...apparitions.slice(midApp),
    ...rottingHighborne.slice(0, midRot),
    ...seethers.slice(0, midSeeth),
    ...spectres,
    ...phantasms.slice(0, midPhant),
  );
  out.push(
    boss(
      'magister-kalendris',
      'Magister Kalendris',
      ENTRY.kalendris,
      BOSS_SPELLS.kalendris,
      undefined,
      'Magister Kalendris studies dark arts in the Shen\'dralar library.',
    ),
  );

  // --- Library annex → Tsu'zee (rare) ---
  out.push(
    ...spirits.slice(midSpirit),
    ...skeletalHighborne.slice(midSkel),
    ...rottingHighborne.slice(midRot),
    ...darters.slice(Math.ceil(darters.length / 2)),
  );
  // Survey rare; isComplete ignores optional.
  out.push({
    ...boss(
      'tsuzee',
      "Tsu'zee",
      ENTRY.tsuzee,
      BOSS_SPELLS.tsuzee,
      undefined,
      // GAP: rare-elite spawn chance not modeled - always present for golden-path testing.
      "Tsu'zee (rare) stalks the library shelves.",
    ),
    optional: true,
  });

  // --- Pylon / prison → Immol'thar --- Residual prison trash (non-pylon entries) still comes from
  // clusters. Hand spine claims the 5 kill-gated pylon packs (40× 11480/11483).
  out.push(
    ...manaRemnants,
    ...arcaneAberrations,
    ...residualMonstrosities,
    ...arcaneTorrents,
    ...arcaneFeedbacks,
    ...highborneSummoners.slice(0, midSumm),
    ...seethers.slice(midSeeth),
    ...phantasms.slice(midPhant),
    ...highborneSummoners.slice(midSumm),
  );
  // Five pylons any-order; each sets TYPE_PYLON_N. Cite: cpp:278-289, 528-530.
  for (const p of DM_WEST_PYLONS) {
    if (p.guardGuids.length === 0) continue;
    out.push(pylonEncounter(p));
  }
  out.push(
    boss(
      'immolthar',
      "Immol'thar",
      ENTRY.immolthar,
      BOSS_SPELLS.immolthar,
      [
        // All 5 pylons DONE → forcefield open (CheckAllGeneratorsDestroyed).
        ...DM_WEST_PYLON_FLAGS.map((flag) => ({ kind: 'requiresFlag' as const, flag })),
        // TYPE_IMMOLTHAR: death → Prince Tortheldrin faction 14 hostile (persists on reload).
        { kind: 'setsFlag', flag: DIRE_MAUL_WEST_FLAGS.immoltharDeath },
      ],
      "Immol'thar is sealed behind the prison forcefield - kill the guards at all five Arcane Pylons to drop it. His death turns Prince Tortheldrin hostile.",
    ),
  );

  // --- Athenaeum → Prince Tortheldrin (ally-turned-boss) ---
  out.push(
    boss(
      'prince-tortheldrin',
      'Prince Tortheldrin',
      ENTRY.tortheldrin,
      BOSS_SPELLS.tortheldrin,
      [{ kind: 'requiresFlag', flag: DIRE_MAUL_WEST_FLAGS.immoltharDeath }],
      "Prince Tortheldrin of the Shen'dralar turns on the party after Immol'thar falls.",
    ),
  );

  return out;
}

function buildEncounters(): EncounterDef[] {
  // Hand spine = bosses + pylon packs (mono trashFromCensus is empty).
  const spine = buildHandSpine();
  return buildClusterEncounters({
    mapId: 429,
    spine,
    entrance: entranceForInstance('dire-maul-west'),
    includePack: wingFilterByNearestBoss(429, 'west'),
    // Pylon guards claimed on spine — do not double-count in cluster trash.
    excludeGuids: DM_WEST_PYLON_GUARD_GUIDS,
  });
}


export const DIRE_MAUL_WEST: InstanceDef = {
  id: 'dire-maul-west',
  mapId: 429,
  wing: 'west',
  name: 'Dire Maul (West)',
  portalZone: 'feralas',
  minLevel: 45, // entrance triggers 3183–3189 requiredLevel
  levelRange: [56, 60], // mission brief / West trash–boss band
  lockoutMs: 0,
  description: '',
  quests: [...DIRE_MAUL_WEST_QUESTS],
  encounters: buildEncounters(),
};

/** Sum of authored pure-static trash counts per creature entry (bosses / summon-only excluded). */
export function dmwPureStaticTrashCounts(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of DIRE_MAUL_WEST.encounters) {
    if (enc.kind !== 'trash') continue;
    add(enc.creatureEntry, 1);
    for (const p of enc.pack ?? []) add(p.creatureEntry, p.count);
  }
  return map;
}

/** All kill supply (trash + boss singles + onDeathSummon) for satisfiability checks. */
export function dmwKillSupply(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of DIRE_MAUL_WEST.encounters) {
    add(enc.creatureEntry, 1);
    for (const p of enc.pack ?? []) add(p.creatureEntry, p.count);
    for (const ev of enc.events ?? []) {
      if (ev.kind === 'onDeathSummon') add(ev.creatureEntry, 1);
    }
  }
  return map;
}
