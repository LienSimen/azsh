// Uldaman (map 70) — InstanceDef graph. Authority: docs/dungeons/survey/11-uldaman.md. Pack sizes
// from the static column only; event-awakened statics live on events, so never double-count them.

import type { EncounterDef, EncounterEvent, InstanceDef } from '../schema.ts';
import {
  entranceForInstance,
  buildClusterEncounters,
} from './pack-from-clusters.ts';

// ---- Census static counts (map 70; survey creature census static column) ----
// Friendlies, bosses, event-awakened Keepers/Guardians/Warders and summon-only entries are excluded.

/** Pure static trash totals (non-event-awakened). Survey static column. */
export const ULDAMAN_STATIC = {
  rockchewer: 19, // 4851 Stonevault Rockchewer
  oracle: 23, // 4852 Stonevault Oracle
  shrikeBat: 8, // 4861 Shrike Bat
  caveLurker: 14, // 4850 Stonevault Cave Lurker
  jadespine: 4, // 4863 Jadespine Basilisk
  relicHunter: 5, // 4847 Shadowforge Relic Hunter
  venomlash: 4, // 7022 Venomlash Scorpid
  geologist: 3, // 7030 Shadowforge Geologist
  archaeologist: 2, // 4849 Shadowforge Archaeologist
  darkcaster: 2, // 4848 Shadowforge Darkcaster
  sharpshooter: 2, // 7290 Shadowforge Sharpshooter
  brawler: 17, // 4855 Stonevault Brawler
  geomancer: 9, // 4853 Stonevault Geomancer
  stoneSteward: 11, // 4860 Stone Steward
  flameweaver: 6, // 7321 Stonevault Flameweaver
  mauler: 9, // 7320 Stonevault Mauler
  vaultWarderStatic: 2, // 10120 remaining after Archaedas event share (2 of 4)
  cleftScorpid: 30, // 7078 Cleft Scorpid
  ambusher: 8, // 7175 Stonevault Ambusher
  deadlyCleft: 10, // 7405 Deadly Cleft Scorpid
  rocksmasher: 28, // 7011 Earthen Rocksmasher
  sculptor: 10, // 7012 Earthen Sculptor
  custodian: 32, // 7309 Earthen Custodian (stoned; trickle during Archaedas - pure static + GAP timer)
  hallshaper: 12, // 7077 Earthen Hallshaper (same dual-role note as custodian)
  stonebreaker: 24, // 7396 Earthen Stonebreaker
  stonecarver: 7, // 7397 Earthen Stonecarver
} as const;

/** Event-awakened statics modeled only on E2/E3 (not pure static trash). */
export const ULDAMAN_EVENT_AWAKENED = {
  stoneKeeper: 4, // 4857 - Altar of the Keepers sequential waves
  earthenGuardian: 6, // 7076 - Archaedas <66.6% HP
  vaultWarderEvent: 2, // 10120 - Archaedas <33.3% HP (2 of 4 census)
} as const;

export const ENTRY = {
  rockchewer: 4851,
  oracle: 4852,
  shrikeBat: 4861,
  caveLurker: 4850,
  jadespine: 4863,
  relicHunter: 4847,
  venomlash: 7022,
  geologist: 7030,
  archaeologist: 4849,
  darkcaster: 4848,
  sharpshooter: 7290,
  brawler: 4855,
  geomancer: 4853,
  stoneSteward: 4860,
  flameweaver: 7321,
  mauler: 7320,
  vaultWarder: 10120,
  stoneKeeper: 4857,
  cleftScorpid: 7078,
  ambusher: 7175,
  deadlyCleft: 7405,
  rocksmasher: 7011,
  sculptor: 7012,
  custodian: 7309,
  earthenGuardian: 7076,
  hallshaper: 7077,
  stonebreaker: 7396,
  stonecarver: 7397,
  // Bosses (canonical survey order)
  revelosh: 6910,
  baelog: 6906,
  ironaya: 7228, // summon-only via Keystone
  ancientStoneKeeper: 7206,
  galgann: 7291,
  grimlok: 4854,
  archaedas: 2748,
  // Mini-boss / event
  obsidianSentinel: 7023,
  obsidianShard: 7209, // summon-only (hpThresholds)
} as const;

/** Flags from survey event choreography / instance_uldaman.cpp. */
export const ULDAMAN_FLAGS = {
  ironayaKeystone: 'uldaman-ironaya-keystone',
  altarKeepers: 'uldaman-altar-keepers',
  templeDoor: 'uldaman-temple-door',
  archaedasAwakened: 'uldaman-archaedas-awakened',
  archaedasDone: 'uldaman-archaedas-done',
} as const;

/** Ancient Treasure. Cite: uldaman.h:21 GO_ANCIENT_TREASURE. */
export const GO_ANCIENT_TREASURE = 141979;

/** E1 - GO 124371 Keystone + item 7733 Staff of Prehistoria. */
export const ULDAMAN_KEYSTONE = {
  goEntry: 124371,
  requiredItem: 7733, // Staff of Prehistoria (assembled from 7740+7741; gate on final staff only)
} as const;

/** E2 - GO 130511 Altar of The Keepers (ritual 3 channelers - GAP: no party-size on objectGate). */
export const ULDAMAN_ALTAR_KEEPERS = {
  goEntry: 130511,
  stoneKeeperEntry: 4857,
  keeperCount: 4,
} as const;

/** E3 - GO 133234 Altar of Archaedas. */
export const ULDAMAN_ALTAR_ARCHAEDAS = {
  goEntry: 133234,
} as const;

/** Summon-only creature entries that must never appear in pure static trash packs. */
export const ULDAMAN_SUMMON_ONLY_ENTRIES = new Set<number>([
  ENTRY.ironaya, // 7228 - boss via Keystone only
  ENTRY.obsidianShard, // 7209 - Obsidian Sentinel thresholds only
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
// Archaedas casts off his ScriptDev IR schedule (scriptdev/uldaman.ts BOSS_ARCHAEDAS), not from here.
const BOSS_SPELLS = {
  revelosh: [15117, 15801, 16006],
  baelog: [14516, 15620],
  ironaya: [8374, 10101, 11876],
  ancientStoneKeeper: [10094, 10132],
  galgann: [9482, 3356, 8053, 11969],
  // Spell list 485401 "Uldaman - Grimlok" verbatim. 8143 Tremor Totem was here with no source in
  // either dump and no schedule, so it only ever printed the aifid D4 warning.
  grimlok: [6742, 11892, 8292, 9532],
  archaedas: [] as number[],
  obsidianSentinel: [10061, 10072], // bake; 10061 = Summon Obsidian Shard (also modeled via hpThreshold)
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

// Linear encounter graph: entrance trash → bosses in survey order with inter-boss trash, Ironaya
// keystone, Obsidian Sentinel shards, Altar Keepers, Archaedas. Awakened bodies stay on events.
function buildHandSpine(): EncounterDef[] {
  // Early trogg / beast band
  const clefts = trashFromCensus('cleft-scorpid', 'Cleft Scorpid', ENTRY.cleftScorpid, ULDAMAN_STATIC.cleftScorpid);
  const ambushers = trashFromCensus('ambusher', 'Stonevault Ambusher', ENTRY.ambusher, ULDAMAN_STATIC.ambusher);
  const rockchewers = trashFromCensus(
    'rockchewer',
    'Stonevault Rockchewer',
    ENTRY.rockchewer,
    ULDAMAN_STATIC.rockchewer,
  );
  const oracles = trashFromCensus('oracle', 'Stonevault Oracle', ENTRY.oracle, ULDAMAN_STATIC.oracle);
  const shrikeBats = trashFromCensus('shrike-bat', 'Shrike Bat', ENTRY.shrikeBat, ULDAMAN_STATIC.shrikeBat);
  const caveLurkers = trashFromCensus(
    'cave-lurker',
    'Stonevault Cave Lurker',
    ENTRY.caveLurker,
    ULDAMAN_STATIC.caveLurker,
  );
  const jadespines = trashFromCensus(
    'jadespine',
    'Jadespine Basilisk',
    ENTRY.jadespine,
    ULDAMAN_STATIC.jadespine,
  );
  const venomlashes = trashFromCensus(
    'venomlash',
    'Venomlash Scorpid',
    ENTRY.venomlash,
    ULDAMAN_STATIC.venomlash,
  );
  const deadlyClefts = trashFromCensus(
    'deadly-cleft',
    'Deadly Cleft Scorpid',
    ENTRY.deadlyCleft,
    ULDAMAN_STATIC.deadlyCleft,
  );

  // Mid stonevault / Shadowforge
  const brawlers = trashFromCensus('brawler', 'Stonevault Brawler', ENTRY.brawler, ULDAMAN_STATIC.brawler);
  const geomancers = trashFromCensus(
    'geomancer',
    'Stonevault Geomancer',
    ENTRY.geomancer,
    ULDAMAN_STATIC.geomancer,
  );
  const maulers = trashFromCensus('mauler', 'Stonevault Mauler', ENTRY.mauler, ULDAMAN_STATIC.mauler);
  const flameweavers = trashFromCensus(
    'flameweaver',
    'Stonevault Flameweaver',
    ENTRY.flameweaver,
    ULDAMAN_STATIC.flameweaver,
  );
  const relicHunters = trashFromCensus(
    'relic-hunter',
    'Shadowforge Relic Hunter',
    ENTRY.relicHunter,
    ULDAMAN_STATIC.relicHunter,
  );
  const geologists = trashFromCensus(
    'geologist',
    'Shadowforge Geologist',
    ENTRY.geologist,
    ULDAMAN_STATIC.geologist,
  );
  const archaeologists = trashFromCensus(
    'archaeologist',
    'Shadowforge Archaeologist',
    ENTRY.archaeologist,
    ULDAMAN_STATIC.archaeologist,
  );
  const darkcasters = trashFromCensus(
    'darkcaster',
    'Shadowforge Darkcaster',
    ENTRY.darkcaster,
    ULDAMAN_STATIC.darkcaster,
  );
  const sharpshooters = trashFromCensus(
    'sharpshooter',
    'Shadowforge Sharpshooter',
    ENTRY.sharpshooter,
    ULDAMAN_STATIC.sharpshooter,
  );

  // Earthen / temple band (always-up share; event-awakened guardians/keepers elsewhere)
  const rocksmashers = trashFromCensus(
    'rocksmasher',
    'Earthen Rocksmasher',
    ENTRY.rocksmasher,
    ULDAMAN_STATIC.rocksmasher,
  );
  const sculptors = trashFromCensus('sculptor', 'Earthen Sculptor', ENTRY.sculptor, ULDAMAN_STATIC.sculptor);
  const custodians = trashFromCensus(
    'custodian',
    'Earthen Custodian',
    ENTRY.custodian,
    ULDAMAN_STATIC.custodian,
  );
  const hallshapers = trashFromCensus(
    'hallshaper',
    'Earthen Hallshaper',
    ENTRY.hallshaper,
    ULDAMAN_STATIC.hallshaper,
  );
  const stonebreakers = trashFromCensus(
    'stonebreaker',
    'Earthen Stonebreaker',
    ENTRY.stonebreaker,
    ULDAMAN_STATIC.stonebreaker,
  );
  const stonecarvers = trashFromCensus(
    'stonecarver',
    'Earthen Stonecarver',
    ENTRY.stonecarver,
    ULDAMAN_STATIC.stonecarver,
  );
  const stoneStewards = trashFromCensus(
    'stone-steward',
    'Stone Steward',
    ENTRY.stoneSteward,
    ULDAMAN_STATIC.stoneSteward,
  );
  const vaultWardersStatic = trashFromCensus(
    'vault-warder',
    'Vault Warder',
    ENTRY.vaultWarder,
    ULDAMAN_STATIC.vaultWarderStatic,
  );

  const out: EncounterDef[] = [];

  // --- Entrance → Revelosh (scorpids + early troggs) ---
  out.push(
    ...clefts.slice(0, Math.ceil(clefts.length / 2)),
    ...ambushers,
    ...rockchewers.slice(0, Math.ceil(rockchewers.length / 2)),
    ...oracles.slice(0, Math.ceil(oracles.length / 3)),
    ...shrikeBats.slice(0, Math.ceil(shrikeBats.length / 2)),
  );

  out.push(
    boss(
      'revelosh',
      'Revelosh',
      ENTRY.revelosh,
      BOSS_SPELLS.revelosh,
      undefined,
      'Revelosh the trogg warlord guards the first chamber. (Drops The Shaft of Tsol for Staff of Prehistoria.)',
    ),
  );

  // --- → Baelog (Lost Dwarves camp; Eric/Olaf friendlies - no combat packs) ---
  // Survey: Baelog trogg-wave not found in CMaNGOS - do not invent.
  out.push(
    ...rockchewers.slice(Math.ceil(rockchewers.length / 2)),
    ...oracles.slice(Math.ceil(oracles.length / 3), Math.ceil((2 * oracles.length) / 3)),
    ...caveLurkers.slice(0, Math.ceil(caveLurkers.length / 2)),
    ...jadespines,
  );

  out.push(
    boss(
      'baelog',
      'Baelog',
      ENTRY.baelog,
      BOSS_SPELLS.baelog,
      undefined,
      "Baelog of the Lost Dwarves. Eric and Olaf stand with him (friendlies). Baelog's Chest holds Gni'kiv Medallion.",
    ),
  );

  // --- E1 Ironaya (summon-only via Keystone + Staff of Prehistoria) ---
  // Survey: GO 124371 → summon 7228; item 7733. Cosmetic +1s/+27s delays omitted (no DSL field).
  out.push(
    boss(
      'ironaya',
      'Ironaya',
      ENTRY.ironaya,
      BOSS_SPELLS.ironaya,
      [
        {
          kind: 'objectGate',
          goEntry: ULDAMAN_KEYSTONE.goEntry,
          requiredItem: ULDAMAN_KEYSTONE.requiredItem,
          setsFlag: ULDAMAN_FLAGS.ironayaKeystone,
          once: true,
        },
        { kind: 'requiresFlag', flag: ULDAMAN_FLAGS.ironayaKeystone },
      ],
      'The Keystone accepts the Staff of Prehistoria - Ironaya awakens from the sealed alcove. (Summon-only.)',
    ),
  );

  // --- Mid halls → Obsidian Sentinel (E4 shard split) ---
  out.push(
    ...venomlashes,
    ...deadlyClefts,
    ...clefts.slice(Math.ceil(clefts.length / 2)),
    ...shrikeBats.slice(Math.ceil(shrikeBats.length / 2)),
    ...caveLurkers.slice(Math.ceil(caveLurkers.length / 2)),
  );

  // E4: Obsidian Sentinel 7023 at 80/60/40/20% summons Obsidian Shard 7209 (summon-only).
  out.push(
    boss(
      'obsidian-sentinel',
      'Obsidian Sentinel',
      ENTRY.obsidianSentinel,
      BOSS_SPELLS.obsidianSentinel,
      [
        {
          kind: 'hpThreshold',
          pct: 80,
          once: true,
          phase: 1,
          spawn: [{ creatureEntry: ENTRY.obsidianShard, count: 1 }],
        },
        {
          kind: 'hpThreshold',
          pct: 60,
          once: true,
          phase: 2,
          spawn: [{ creatureEntry: ENTRY.obsidianShard, count: 1 }],
        },
        {
          kind: 'hpThreshold',
          pct: 40,
          once: true,
          phase: 3,
          spawn: [{ creatureEntry: ENTRY.obsidianShard, count: 1 }],
        },
        {
          kind: 'hpThreshold',
          pct: 20,
          once: true,
          phase: 4,
          spawn: [{ creatureEntry: ENTRY.obsidianShard, count: 1 }],
        },
      ],
      'The Obsidian Sentinel splinters into shards as its shell cracks. (Quest 1956 Power Source.)',
    ),
  );

  // --- Earthen halls → Ancient Stone Keeper ---
  out.push(
    ...rocksmashers.slice(0, Math.ceil(rocksmashers.length / 2)),
    ...sculptors.slice(0, Math.ceil(sculptors.length / 2)),
    ...stoneStewards.slice(0, Math.ceil(stoneStewards.length / 2)),
    ...stonebreakers.slice(0, Math.ceil(stonebreakers.length / 3)),
    ...stonecarvers.slice(0, Math.ceil(stonecarvers.length / 2)),
  );

  out.push(
    boss(
      'ancient-stone-keeper',
      'Ancient Stone Keeper',
      ENTRY.ancientStoneKeeper,
      BOSS_SPELLS.ancientStoneKeeper,
      undefined,
      'An Ancient Stone Keeper patrols the titan halls.',
    ),
  );

  // --- Shadowforge camp → Galgann Firehammer ---
  out.push(
    ...relicHunters,
    ...geologists,
    ...archaeologists,
    ...darkcasters,
    ...sharpshooters,
    ...oracles.slice(Math.ceil((2 * oracles.length) / 3)),
  );

  out.push(
    boss(
      'galgann-firehammer',
      'Galgann Firehammer',
      ENTRY.galgann,
      BOSS_SPELLS.galgann,
      undefined,
      'Galgann Firehammer of the Shadowforge holds the dark iron camp.',
    ),
  );

  // --- Stonevault end → Grimlok ---
  out.push(
    ...brawlers,
    ...geomancers,
    ...maulers,
    ...flameweavers,
  );

  out.push(
    boss(
      'grimlok',
      'Grimlok',
      ENTRY.grimlok,
      BOSS_SPELLS.grimlok,
      undefined,
      'Grimlok, chieftain of the Stonevault troggs. (Necklace Sapphire for quest 2201/2339.)',
    ),
  );

  // --- E2 Altar of the Keepers (4× Stone Keeper 4857 sequential waves) ---
  // GO 130511 needs 3 channelers, which objectGate cannot express; the 5s wake delay is omitted too.
  out.push({
    id: 'altar-of-the-keepers',
    name: 'Altar of the Keepers',
    kind: 'trash',
    creatureEntry: ENTRY.stoneKeeper,
    intro:
      'Three adventurers channel at the Altar of the Keepers - four Stone Keepers awaken in sequence.',
    events: [
      {
        kind: 'objectGate',
        goEntry: ULDAMAN_ALTAR_KEEPERS.goEntry,
        once: true,
        setsFlag: ULDAMAN_FLAGS.altarKeepers,
      },
      { kind: 'requiresFlag', flag: ULDAMAN_FLAGS.altarKeepers },
      {
        kind: 'waves',
        waves: [
          { pack: [{ creatureEntry: ENTRY.stoneKeeper, count: 1 }] },
          { pack: [{ creatureEntry: ENTRY.stoneKeeper, count: 1 }] },
          { pack: [{ creatureEntry: ENTRY.stoneKeeper, count: 1 }] },
          { pack: [{ creatureEntry: ENTRY.stoneKeeper, count: 1 }] },
        ],
      },
      { kind: 'setsFlag', flag: ULDAMAN_FLAGS.templeDoor },
    ],
  });

  // Pre-Archaedas earthen residual (custodians/hallshapers as always-up static share)
  // stonebreakers: first third before ASK; remaining two-thirds here (no double-count).
  out.push(
    ...rocksmashers.slice(Math.ceil(rocksmashers.length / 2)),
    ...sculptors.slice(Math.ceil(sculptors.length / 2)),
    ...custodians,
    ...hallshapers,
    ...stonebreakers.slice(Math.ceil(stonebreakers.length / 3)),
    ...stonecarvers.slice(Math.ceil(stonecarvers.length / 2)),
    ...stoneStewards.slice(Math.ceil(stoneStewards.length / 2)),
    ...vaultWardersStatic,
  );

  // --- E3 Archaedas (Altar GO 133234 + HP-threshold add wake-ups) ---
  // <66.6% → 6× Earthen Guardian, <33.3% → 2× Vault Warder. The 9–12s trickle is a gap.
  out.push(
    boss(
      'archaedas',
      'Archaedas',
      ENTRY.archaedas,
      BOSS_SPELLS.archaedas,
      [
        { kind: 'requiresFlag', flag: ULDAMAN_FLAGS.templeDoor },
        {
          kind: 'objectGate',
          goEntry: ULDAMAN_ALTAR_ARCHAEDAS.goEntry,
          once: true,
          setsFlag: ULDAMAN_FLAGS.archaedasAwakened,
        },
        { kind: 'requiresFlag', flag: ULDAMAN_FLAGS.archaedasAwakened },
        {
          kind: 'hpThreshold',
          pct: 66,
          once: true,
          phase: 1,
          spawn: [
            {
              creatureEntry: ENTRY.earthenGuardian,
              count: ULDAMAN_EVENT_AWAKENED.earthenGuardian,
            },
          ],
        },
        {
          kind: 'hpThreshold',
          pct: 33,
          once: true,
          phase: 2,
          spawn: [
            {
              creatureEntry: ENTRY.vaultWarder,
              count: ULDAMAN_EVENT_AWAKENED.vaultWarderEvent,
            },
          ],
        },
        // Cite: instance_uldaman.cpp:113-117 TYPE_ARCHAEDAS DONE → DoRespawnGameObject(GO_ANCIENT_TREASURE, HOUR).
        { kind: 'setsFlag', flag: ULDAMAN_FLAGS.archaedasDone },
      ],
      'The Altar of Archaedas thrums - the ancient stone guardian breaks free. Earthen guardians and vault warders awaken as he weakens.',
    ),
  );

  return out;
}

function buildEncounters(): EncounterDef[] {
  // Hand spine = bosses + event-gated packs (mono trashFromCensus is empty).
  const spine = buildHandSpine();
  return buildClusterEncounters({
    mapId: 70,
    spine,
    entrance: entranceForInstance('uldaman'),
    
  });
}


/** Survey quests completable inside map 70 (Lunar Festival / out-of-scope salves deferred where noted). */
export const ULDAMAN_QUESTS = [
  635, 2418, 1108, 1956, 2240, 2398, 2198, 2283, 2284, 1192, 2200, 2318, 2201, 2204, 2339, 1139,
  2848, 2855, 2278, 2279, 2280,
  // 4104/4109/5883/5888/8780/8787 are world/profession adjacent - survey lists them; keep wired for
  // completeness of in-map targets (GO veins). Reviewer may whitelist partial-outside.
  4104, 4109, 5883, 5888, 8780, 8787,
] as const;

export const ULDAMAN: InstanceDef = {
  id: 'uldaman',
  mapId: 70,
  name: 'Uldaman',
  portalZone: 'badlands',
  minLevel: 30, // entrance trigger 286 / 902 requiredLevel
  levelRange: [35, 46], // survey trash band
  lockoutMs: 0,
  description: '',
  quests: [...ULDAMAN_QUESTS],
  encounters: buildEncounters(),
  lootObjects: [
    // Guid 700187; spawnSecs -14400. revealedByFlag hides the bake pin until Archaedas dies.
    { goEntry: GO_ANCIENT_TREASURE, revealedByFlag: ULDAMAN_FLAGS.archaedasDone },
  ],
};

/** Sum of authored kill counts per creature entry (trash + bosses + wave/threshold packs). */
export function uldamanKillSupply(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of ULDAMAN.encounters) {
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

// Counts only pure static trash packs (no bosses, no flag-gated / altar event pulls). Event-awakened
// Keepers (altar waves) and Archaedas add rows are excluded.
export function uldamanPureStaticTrashCounts(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of ULDAMAN.encounters) {
    if (enc.kind !== 'trash') continue;
    // Altar Keepers waves are event-gated - not pure static census packs.
    if (enc.id === 'altar-of-the-keepers') continue;
    const req = (enc.events ?? []).some((e) => e.kind === 'requiresFlag');
    if (req) continue;
    add(enc.creatureEntry, 1);
    for (const p of enc.pack ?? []) add(p.creatureEntry, p.count);
  }
  return map;
}
