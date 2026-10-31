// Stratholme Live / Scarlet Bastion side (map 329) — InstanceDef, Live wing only. Authority:
// docs/dungeons/survey/19-stratholme.md Live side, which carries the residual GAPS list.

import type { EncounterDef, EncounterEvent, InstanceDef } from '../schema.ts';
import {
  entranceForInstance,
  buildClusterEncounters,
  clusterMemberByGuid,
  wingFilterByNearestBoss,
} from './pack-from-clusters.ts';

// ---- Live static census (name + avg-pos filter on shared map 329) ----
// Live bbox x≈34xx–37xx, y≈−29xx..−34xx. Undead-side rows, seasonal and triggers are excluded.

export const STATIC = {
  // Street / courtyard undead (avg pos Live)
  mangledCadaver: 35, // 10382
  ravagedCadaver: 30, // 10381
  spectralCitizen: 12, // 10384 pool 11.5 → Math.round
  ghostlyCitizen: 11, // 10385 pool 10.5 → Math.round
  vengefulPhantom: 4, // 10387 - Unforgiven pack
  skeletalGuardian: 53, // 10390
  skeletalBerserker: 48, // 10391
  eyeOfNaxxramas: 3, // 10411
  patchworkHorror: 3, // 10414
  stratholmeCourier: 1, // 11082
  // Crimson bastion humanoids (all Live by name; pool Math.round)
  crimsonGuardsman: 18, // 10418 pool 17.5
  crimsonConjuror: 16, // 10419 pool 15.5
  crimsonInitiate: 8, // 10420
  crimsonDefender: 8, // 10421 pool 7.5
  crimsonSorcerer: 8, // 10422
  crimsonPriest: 4, // 10423 pool 3.5
  crimsonGallant: 14, // 10424 pool 13.5
  crimsonBattleMage: 7, // 10425 pool 6.5
  crimsonInquisitor: 5, // 10426
  crimsonMonk: 6, // 11043
} as const;

/** Sum of pure static trash census assigned to Live (excl. rares, bosses, summons). */
export const STATIC_TOTAL = Object.values(STATIC).reduce((a, b) => a + b, 0);

const ENTRY = {
  mangledCadaver: 10382,
  ravagedCadaver: 10381,
  spectralCitizen: 10384,
  ghostlyCitizen: 10385,
  vengefulPhantom: 10387,
  skeletalGuardian: 10390,
  skeletalBerserker: 10391,
  eyeOfNaxxramas: 10411,
  patchworkHorror: 10414,
  stratholmeCourier: 11082,
  crimsonGuardsman: 10418,
  crimsonConjuror: 10419,
  crimsonInitiate: 10420,
  crimsonDefender: 10421,
  crimsonSorcerer: 10422,
  crimsonPriest: 10423,
  crimsonGallant: 10424,
  crimsonBattleMage: 10425,
  crimsonInquisitor: 10426,
  crimsonMonk: 11043,
  // Canonical Live bosses
  unforgiven: 10516,
  timmy: 10808, // summon-only - courtyard clear
  willey: 10997,
  galford: 10811,
  dathrohan: 10812,
  balnazzar: 10813, // real ScriptDev morph target (in bake; scriptdev IR owns the fight kit)
  malown: 11143, // summon-only - 3rd postbox
  // Optional / rare / mini
  frasSiabi: 11058, // summon-only - tobacco crate (not in bake)
  forresten: 10558, // rare-elite ×4 static
  skul: 10393, // rare-elite ×2 static
  malor: 11032, // bastion named elite (Medallion strongbox)
  undeadPostman: 11142, // summon-only per postbox (not in bake)
  // EXCLUDED: Balzaphon 14684 (D-10)
} as const;

/** Rare-elite static counts (no pool_creature row → 100% sourced-correct). */
export const LIVE_RARE_COUNTS = {
  forresten: 4, // 10558
  skul: 2, // 10393
} as const;

/** Flags from survey Live event choreography. */
export const STRATH_LIVE_FLAGS = {
  // Prefix for per-pack courtyard clear flags (`:0`, `:1`, …). Timmy requires every pack flag; summary
  // string alone is not set by packs.
  courtyardCleared: 'strat-live-courtyard-cleared',
  /** Premium Siabi Tobacco 176248 looted → Fras Siabi. */
  siabiTobacco: 'strat-live-siabi-tobacco',
  // Set after needUses postboxes opened (TYPE_POSTMASTER SPECIAL→DONE shape). Cite: stratholme.cpp:467-471
  // m_postboxesUsed==2 → SPECIAL; 3rd use DONE.
  postbox: 'strat-live-postbox',
  /** Dathrohan/Balnazzar fully cleared. */
  balnazzarDone: 'strat-live-balnazzar-done',
} as const;

/** GO 176248 Premium Siabi Tobacco - survey Fras Siabi event. */
export const STRATH_LIVE_SIABI = {
  goEntry: 176248,
} as const;

// Crusaders' Square courtyard clear → Timmy. Cite: stratholme.cpp:126-133 (40yd of defensePoints[TIMMY]);
// stratholme.h:170-172.
export const STRATH_LIVE_COURTYARD = {
  /** defensePoints[TIMMY]. Cite: stratholme.h:172. */
  x: 3668.60,
  y: -3183.31,
  z: 126.215,
  /** IsWithinDist2d radius. Cite: stratholme.cpp:132. */
  radiusYd: 40,
  /** NPC entries stored for Timmy. Cite: stratholme.cpp:126-130. */
  entries: [10420, 10424, 10418, 10419, 10425] as const,
  encId: 'timmy-the-cruel',
  timmyEntry: 10808,
} as const;

/** Courtyard defenders the Timmy gate counts. Cite: stratholme.cpp:126-131. */
export const STRATH_LIVE_COURTYARD_ENTRIES: readonly number[] = STRATH_LIVE_COURTYARD.entries;

// Six plagued postboxes → Postmaster Malown on the 3rd open, so needUses=3 of 6 and the summon
// origin is that third box. Cite: stratholme.cpp:463-471; stratholmeScripts.cpp:97-125.
export const STRATH_LIVE_POSTBOX = {
  /** Market Row — primary pin (not a fixed Malown origin). */
  goEntry: 176346,
  goEntries: [176346, 176349, 176350, 176351, 176352, 176353] as const,
  // Six authored origins (map 329). Cite: docs/dungeons/malown/README.md; dungeonGameObjects.json guids
  // 3290640–3290645.
  origins: {
    176349: { x: 3651.64, y: -3165.24, z: 128.157 }, // Crusaders' Square Postbox
    176346: { x: 3682.24, y: -3401.63, z: 132.84 }, // Market Row Postbox
    176350: { x: 3660.31, y: -3476.31, z: 138.379 }, // Festival Lane Postbox
    176351: { x: 3662.84, y: -3629.71, z: 138.513 }, // Elders' Square Postbox
    176352: { x: 3567.3, y: -3351.87, z: 130.696 }, // King's Square Postbox
    176353: { x: 3500.43, y: -3295.64, z: 131.034 }, // Fras Siabi's Postbox
  } as const,
  /** Opens before Malown. Cite: stratholme.cpp:470 m_postboxesUsed==2 then 3rd DONE. */
  needUses: 3,
  /** SummonCreature ×3 per box. Cite: stratholmeScripts.cpp:118-122. */
  postmenPerBox: 3,
  postmanEntry: 11142,
  malownEntry: 11143,
  /** SPELL_SUMMON_POSTMASTER. Cite: stratholme.h:81. */
  summonSpellId: 24627,
  setsFlag: STRATH_LIVE_FLAGS.postbox,
  encId: 'postmaster-malown',
} as const;

/** Authored postbox origin, or undefined when entry is not one of the six. */
export function postboxOrigin(
  goEntry: number,
): { x: number; y: number; z: number } | undefined {
  const row = (STRATH_LIVE_POSTBOX.origins as Record<number, { x: number; y: number; z: number }>)[
    goEntry | 0
  ];
  return row ? { x: row.x, y: row.y, z: row.z } : undefined;
}

// Malown's path-dependent origin: the postbox that completed needUses (last counted). Cite:
// stratholmeScripts.cpp:108-110 SPECIAL branch casts 24627 at that GO.
export function malownOriginFromUsedEntries(
  usedEntries: readonly number[] | undefined,
): { x: number; y: number; z: number } | undefined {
  if (!usedEntries?.length) return undefined;
  return postboxOrigin(usedEntries[usedEntries.length - 1]!);
}

// Grand Crusader Dathrohan → Balnazzar mid-fight morph. Cite: boss_dathrohan_balnazzar.cpp:133-145
// GetHealthPercent() < 40.0f.
export const STRATH_LIVE_DATHROHAN = {
  encId: 'dathrohan-balnazzar',
  entry: 10812,
  morphEntry: 10813,
  morphHpPct: 40,
  /** SPELL_BALNAZZARTRANSFORM. Cite: boss_dathrohan_balnazzar.cpp:41,137. */
  transformSpellId: 17288,
} as const;

// Live/Scarlet-side survey quests. PARTIAL: multi-side stitching quests carry Live objectives only,
// since the Rivendare and abomination targets belong to the Undead wing or the world.
export const STRATHOLME_LIVE_QUESTS = [
  5251, // The Archivist - kill Galford + Scarlet Archive
  5122, // The Medallion of Faith - Malor's Strongbox (Live bastion)
  5848, // Of Love and Family - Unfinished Painting (Scarlet Bastion)
  5243, // Houses of the Holy - Stratholme Holy Water (crates; multi-side)
  8934, // Just Compensation (A) - Devout Gloves from Galford (item)
  8940, // Just Compensation (H) - Devout Gloves from Galford (item)
  // PARTIAL: Anthion set - Live piece only (Willey spaulders / Forresten boots)
  8956, // Anthion (A) Shadowcraft - Willey + Rivendare PARTIAL
  9020, // Anthion (H) Shadowcraft - Willey + Rivendare PARTIAL
  8953, // Anthion (A) Magister - Forresten + Rivendare PARTIAL
  9018, // Anthion (H) Magister - Forresten + Rivendare PARTIAL
] as const;

/** Bake-sourced boss spell lists (creature.spells). Empty when entry missing from bake. */
export const BOSS_SPELLS = {
  unforgiven: [22766, 8822, 14907],
  timmy: [12787, 17470, 8599],
  willey: [10101, 16615, 11729],
  galford: [17293, 23462, 17274, 17366],
  dathrohan: [17286, 20830],
  // 10813 bake kit (unused in the graph: the morphed fight runs the ScriptDev IR
  // phase-1 timers - ShadowShock/MindBlast/PsychicScream/Sleep/MindControl).
  balnazzar: [20603, 15398, 9256, 20741],
  malown: [3417, 6253, 12542, 12741, 13338],
  // creatures.json 11058 carries spells [7964, 17294]; this hand-authored list stays empty
  // so the bake kit is the only supplier. Checked 2026-08-26.
  frasSiabi: [] as number[],
  forresten: [16798, 16244, 16100, 14443, 16331],
  skul: [12544, 15499, 16799, 15230],
  malor: [12734, 16172, 17233, 15493, 10310],
} as const;

/** Undead-side boss entries that must never appear in the Live graph. */
export const UNDEAD_SIDE_BOSSES = [
  10436, // Baroness Anastari
  10437, // Nerub'enkan
  10438, // Maleki the Pallid
  10435, // Magistrate Barthilas
  10439, // Ramstein the Gorger
  10440, // Baron Rivendare
  10809, // Stonespine
] as const;

// Never in the Live graph: event-only mobs and script anchors. This list existed and was never
// passed to `buildClusterEncounters`, so the builder packed every one into ordinary trash pulls.
export const EXCLUDED_ENTRIES = [
  14684, // Balzaphon (Scourge Invasion) — D-10, not in Classic 1.12 static instance
  10415, // Ash'ari Crystal — ziggurat channel object (GAP), not a pull
  14646, // Stratholme Trigger - technical
  16046, // Jarien and Sothos Trigger - technical (Brazier of Beckoning summon anchor)
  16100, // Ysida's Trigger - technical
] as const;

// Jarien and Sothos (16101/16102) have NO static spawn row on map 329 and must not gain one — they
// are a Dungeon Set 2 brazier summon. Only the anchor 16046 stands there, and it is stripped above.
export const JARIEN_SOTHOS = {
  jarien: 16101,
  sothos: 16102,
  spiritOfJarien: 16103,
  spiritOfSothos: 16104,
  triggerEntry: 16046,
  room: '329/the-crimson-throne',
} as const;

// Street rares the auto-run must not detour for: every one stands in a street room on the undead
// side of the fork. `optional` keeps them clickable and on the route without being a destination.
export const LIVE_OPTIONAL_ENCOUNTER_IDS: readonly string[] = [
  // Street ambush in Festival Lane, 225 yd from the gate in the opposite direction from Crusaders'
  // Square. The survey has ONE map-wide boss table with no wing column; the split was invented.
  'the-unforgiven',
  'fras-siabi',
  STRATH_LIVE_POSTBOX.encId,
];

/** Multi-slot street rares — every candidate point is optional, not just the routed one. */
export const LIVE_OPTIONAL_BOSS_ENTRIES: readonly number[] = [
  10558, // Hearthsinger Forresten ×4
  10393, // Skul ×2
];

/** Mark the street rares / postbox summon optional; the bastion chain stays required. */
export function stampLiveOptional(encs: EncounterDef[]): EncounterDef[] {
  const ids = new Set(LIVE_OPTIONAL_ENCOUNTER_IDS);
  const entries = new Set(LIVE_OPTIONAL_BOSS_ENTRIES);
  return encs.map((e) =>
    e.kind === 'boss' && !e.optional && (ids.has(e.id) || entries.has(e.creatureEntry))
      ? { ...e, optional: true }
      : e,
  );
}

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
  if (intro) enc.intro = intro;
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
  bossSpells?: readonly number[],
  events?: EncounterEvent[],
  intro?: string,
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
  return enc;
}

// Linear encounter graph in survey Live order: Main Gate streets → Unforgiven → streets and rares →
// postbox Malown → courtyard Crimson → Timmy → bastion Crimson → Willey → Galford/Malor → Balnazzar.
function buildHandSpine(): EncounterDef[] {
  const mangled = trashFromCensus(
    'mangled-cadaver',
    'Mangled Cadaver',
    ENTRY.mangledCadaver,
    STATIC.mangledCadaver,
  );
  const ravaged = trashFromCensus(
    'ravaged-cadaver',
    'Ravaged Cadaver',
    ENTRY.ravagedCadaver,
    STATIC.ravagedCadaver,
  );
  const spectral = trashFromCensus(
    'spectral-citizen',
    'Spectral Citizen',
    ENTRY.spectralCitizen,
    STATIC.spectralCitizen,
  );
  const ghostly = trashFromCensus(
    'ghostly-citizen',
    'Ghostly Citizen',
    ENTRY.ghostlyCitizen,
    STATIC.ghostlyCitizen,
  );
  const phantoms = trashFromCensus(
    'vengeful-phantom',
    'Vengeful Phantom',
    ENTRY.vengefulPhantom,
    STATIC.vengefulPhantom,
  );
  const guardians = trashFromCensus(
    'skeletal-guardian',
    'Skeletal Guardian',
    ENTRY.skeletalGuardian,
    STATIC.skeletalGuardian,
  );
  const berserkers = trashFromCensus(
    'skeletal-berserker',
    'Skeletal Berserker',
    ENTRY.skeletalBerserker,
    STATIC.skeletalBerserker,
  );
  const eyes = trashFromCensus(
    'eye-of-naxxramas',
    "Eye of Naxxramas",
    ENTRY.eyeOfNaxxramas,
    STATIC.eyeOfNaxxramas,
  );
  const patchwork = trashFromCensus(
    'patchwork-horror',
    'Patchwork Horror',
    ENTRY.patchworkHorror,
    STATIC.patchworkHorror,
  );
  const courier = trashFromCensus(
    'stratholme-courier',
    'Stratholme Courier',
    ENTRY.stratholmeCourier,
    STATIC.stratholmeCourier,
  );

  // Courtyard-trigger Crimson (Timmy): first half before Timmy
  const guardsmen = trashFromCensus(
    'crimson-guardsman',
    'Crimson Guardsman',
    ENTRY.crimsonGuardsman,
    STATIC.crimsonGuardsman,
  );
  const conjurors = trashFromCensus(
    'crimson-conjuror',
    'Crimson Conjuror',
    ENTRY.crimsonConjuror,
    STATIC.crimsonConjuror,
  );
  const initiates = trashFromCensus(
    'crimson-initiate',
    'Crimson Initiate',
    ENTRY.crimsonInitiate,
    STATIC.crimsonInitiate,
  );
  const gallants = trashFromCensus(
    'crimson-gallant',
    'Crimson Gallant',
    ENTRY.crimsonGallant,
    STATIC.crimsonGallant,
  );
  const battleMages = trashFromCensus(
    'crimson-battle-mage',
    'Crimson Battle Mage',
    ENTRY.crimsonBattleMage,
    STATIC.crimsonBattleMage,
  );

  // Bastion Crimson (post-Timmy)
  const defenders = trashFromCensus(
    'crimson-defender',
    'Crimson Defender',
    ENTRY.crimsonDefender,
    STATIC.crimsonDefender,
  );
  const sorcerers = trashFromCensus(
    'crimson-sorcerer',
    'Crimson Sorcerer',
    ENTRY.crimsonSorcerer,
    STATIC.crimsonSorcerer,
  );
  const priests = trashFromCensus(
    'crimson-priest',
    'Crimson Priest',
    ENTRY.crimsonPriest,
    STATIC.crimsonPriest,
  );
  const inquisitors = trashFromCensus(
    'crimson-inquisitor',
    'Crimson Inquisitor',
    ENTRY.crimsonInquisitor,
    STATIC.crimsonInquisitor,
  );
  const monks = trashFromCensus(
    'crimson-monk',
    'Crimson Monk',
    ENTRY.crimsonMonk,
    STATIC.crimsonMonk,
  );

  const half = (arr: EncounterDef[]) => Math.ceil(arr.length / 2);

  // Street undead: half pre-Unforgiven, half post
  const streetPre = [
    ...guardians.slice(0, half(guardians)),
    ...berserkers.slice(0, half(berserkers)),
    ...mangled.slice(0, half(mangled)),
    ...ravaged.slice(0, half(ravaged)),
    ...spectral.slice(0, half(spectral)),
    ...ghostly.slice(0, half(ghostly)),
    ...eyes.slice(0, half(eyes)),
  ];
  const streetPost = [
    ...guardians.slice(half(guardians)),
    ...berserkers.slice(half(berserkers)),
    ...mangled.slice(half(mangled)),
    ...ravaged.slice(half(ravaged)),
    ...spectral.slice(half(spectral)),
    ...ghostly.slice(half(ghostly)),
    ...eyes.slice(half(eyes)),
    ...patchwork,
    ...courier,
  ];

  // Courtyard Crimson (Timmy triggers) - first half of each type. The clear flag is
  // stamped on a real cluster pack in buildEncounters; this band is empty.
  const courtyardCleared = [
    ...guardsmen.slice(0, half(guardsmen)),
    ...conjurors.slice(0, half(conjurors)),
    ...initiates.slice(0, half(initiates)),
    ...gallants.slice(0, half(gallants)),
    ...battleMages.slice(0, half(battleMages)),
  ];

  // Bastion Crimson after Timmy
  const bastion = [
    ...guardsmen.slice(half(guardsmen)),
    ...conjurors.slice(half(conjurors)),
    ...initiates.slice(half(initiates)),
    ...gallants.slice(half(gallants)),
    ...battleMages.slice(half(battleMages)),
    ...defenders,
    ...sorcerers,
    ...priests,
    ...inquisitors,
    ...monks,
  ];
  const bastionPreWilley = bastion.slice(0, half(bastion));
  const bastionMid = bastion.slice(half(bastion), Math.ceil((bastion.length * 3) / 4));
  const bastionInner = bastion.slice(Math.ceil((bastion.length * 3) / 4));

  const out: EncounterDef[] = [];

  // --- Main Gate streets → The Unforgiven ---
  out.push(...streetPre);
  out.push(...phantoms);
  out.push(
    boss(
      'the-unforgiven',
      'The Unforgiven',
      ENTRY.unforgiven,
      BOSS_SPELLS.unforgiven,
      undefined,
      'The Unforgiven waits in stealth among Vengeful Phantoms near the Live entrance.',
    ),
  );

  // --- Streets / rares / Fras Siabi ---
  out.push(...streetPost);

  // Hearthsinger Forresten ×4 (no pool_creature row → static 100%; route-deduped)
  for (let i = 0; i < LIVE_RARE_COUNTS.forresten; i++) {
    out.push(
      boss(
        `hearthsinger-forresten-${i}`,
        'Hearthsinger Forresten',
        ENTRY.forresten,
        BOSS_SPELLS.forresten,
        undefined,
        'A rare elite bard of the damned.',
      ),
    );
  }
  // Skul ×2
  for (let i = 0; i < LIVE_RARE_COUNTS.skul; i++) {
    out.push(
      boss(
        `skul-${i}`,
        'Skul',
        ENTRY.skul,
        BOSS_SPELLS.skul,
        undefined,
        'A rare elite skeletal mage.',
      ),
    );
  }

  // Fras Siabi - loot Premium Siabi Tobacco 176248
  out.push(
    boss(
      'fras-siabi',
      'Fras Siabi',
      ENTRY.frasSiabi,
      BOSS_SPELLS.frasSiabi,
      [
        {
          kind: 'objectGate',
          goEntry: STRATH_LIVE_SIABI.goEntry,
          once: true,
          setsFlag: STRATH_LIVE_FLAGS.siabiTobacco,
        },
        { kind: 'requiresFlag', flag: STRATH_LIVE_FLAGS.siabiTobacco },
      ],
      'Looting Premium Siabi Tobacco awakens Fras Siabi. (Summon-only; +5s delay omitted.)',
    ),
  );

  // Postmaster Malown — 3rd of 6 postboxes (stratholme.cpp:463-471 needUses=3).
  out.push(
    boss(
      STRATH_LIVE_POSTBOX.encId,
      'Postmaster Malown',
      ENTRY.malown,
      BOSS_SPELLS.malown,
      [
        {
          kind: 'objectGate',
          goEntry: STRATH_LIVE_POSTBOX.goEntry,
          goEntries: [...STRATH_LIVE_POSTBOX.goEntries],
          needUses: STRATH_LIVE_POSTBOX.needUses,
          once: true,
          setsFlag: STRATH_LIVE_POSTBOX.setsFlag,
        },
        { kind: 'requiresFlag', flag: STRATH_LIVE_POSTBOX.setsFlag },
      ],
      'Opening three of the six plagued postboxes calls Postmaster Malown. Each box also spawns Undead Postmen (ScriptDev; bake residual).',
    ),
  );

  // --- Courtyard Crimson → Timmy the Cruel ---
  out.push(...courtyardCleared);
  out.push(
    boss(
      STRATH_LIVE_COURTYARD.encId,
      'Timmy the Cruel',
      ENTRY.timmy,
      BOSS_SPELLS.timmy,
      // requiresFlag pack list stamped in stampCourtyardClear (buildEncounters).
      [],
      'When the Scarlet courtyard Crimson defenders fall, Timmy the Cruel spawns at the square.',
    ),
  );

  // --- Bastion → Cannon Master Willey ---
  out.push(...bastionPreWilley);
  // Malor stands 61 yd from Timmy while Willey is 254 yd on in the same wing, so listing Willey
  // first walked the party past Malor and back (insertion cost 388 yd). Bastion hall, then Hoard.
  out.push(
    boss(
      'malor-the-zealous',
      'Malor the Zealous',
      ENTRY.malor,
      BOSS_SPELLS.malor,
      undefined,
      "Malor the Zealous guards the bastion hall - Malor's Strongbox holds the Medallion of Faith.",
    ),
  );
  out.push(
    boss(
      'cannon-master-willey',
      'Cannon Master Willey',
      ENTRY.willey,
      BOSS_SPELLS.willey,
      undefined,
      'Cannon Master Willey holds the armory. (Crimson Rifleman stream GAP - timed adds not modeled.)',
    ),
  );

  // --- → Archivist Galford + Malor ---
  out.push(...bastionMid);
  out.push(
    boss(
      'archivist-galford',
      'Archivist Galford',
      ENTRY.galford,
      BOSS_SPELLS.galford,
      undefined,
      'Archivist Galford keeps the Scarlet Archive.',
    ),
  );

  // --- → Grand Crusader Dathrohan → Balnazzar ---
  out.push(...bastionInner);
  out.push(
    boss(
      STRATH_LIVE_DATHROHAN.encId,
      'Grand Crusader Dathrohan',
      ENTRY.dathrohan,
      BOSS_SPELLS.dathrohan,
      [{ kind: 'setsFlag', flag: STRATH_LIVE_FLAGS.balnazzarDone }],
      'Grand Crusader Dathrohan transforms into Balnazzar below 40% HP - a full heal into the ' +
        "dreadlord's true form; the fight continues until the demon falls.",
    ),
  );
  // Morph: boss_dathrohan_balnazzar ScriptDev IR (tickScriptDev phase) casts 17288 + UpdateEntry 10813;
  // resolveFight credits the final form. Cite: boss_dathrohan_balnazzar.cpp:133-145.

  return out;
}

// Stamp per-pack courtyard flags on every trash pull before Timmy that holds a Crimson defender
// within 40 yd of defensePoints[TIMMY]; Timmy requires all of them. Cite: stratholme.cpp:126-133.
export function stampCourtyardClear(encs: EncounterDef[]): EncounterDef[] {
  const gate = encs.findIndex((e) => e.id === STRATH_LIVE_COURTYARD.encId);
  if (gate < 0) return encs;
  const members = clusterMemberByGuid(329);
  const out = encs.slice();
  const packFlags: string[] = [];
  let n = 0;
  for (let i = 0; i < gate; i++) {
    const e = out[i]!;
    if (e.kind !== 'trash') continue;
    const hit = (e.spawnGuids ?? []).some((g) => {
      const m = members.get(g);
      return (
        !!m
        && (STRATH_LIVE_COURTYARD.entries as readonly number[]).includes(m.entry)
        && Math.hypot(m.x - STRATH_LIVE_COURTYARD.x, m.y - STRATH_LIVE_COURTYARD.y)
          <= STRATH_LIVE_COURTYARD.radiusYd
      );
    });
    if (!hit) continue;
    const flag = `${STRATH_LIVE_FLAGS.courtyardCleared}:${n++}`;
    packFlags.push(flag);
    const events = (e.events ?? []).filter(
      (ev) => !(ev.kind === 'setsFlag' && String(ev.flag).startsWith(STRATH_LIVE_FLAGS.courtyardCleared)),
    );
    out[i] = { ...e, events: [...events, { kind: 'setsFlag' as const, flag }] };
  }
  if (!packFlags.length) return out;
  const t = out[gate]!;
  const events = (t.events ?? []).filter(
    (ev) => !(ev.kind === 'requiresFlag' && String(ev.flag).startsWith(STRATH_LIVE_FLAGS.courtyardCleared)),
  );
  for (const flag of packFlags) {
    events.push({ kind: 'requiresFlag', flag });
  }
  out[gate] = { ...t, events };
  return out;
}

/** Per-pack courtyard flags Timmy currently requires (derived from the built graph). */
export function courtyardPackFlags(encs: readonly EncounterDef[]): string[] {
  const timmy = encs.find((e) => e.id === STRATH_LIVE_COURTYARD.encId);
  if (!timmy) return [];
  return (timmy.events ?? [])
    .filter((ev): ev is Extract<EncounterEvent, { kind: 'requiresFlag' }> =>
      ev.kind === 'requiresFlag' && ev.flag.startsWith(STRATH_LIVE_FLAGS.courtyardCleared))
    .map((ev) => ev.flag);
}

function buildEncounters(): EncounterDef[] {
  // Hand spine = bosses + event-gated packs (mono trashFromCensus is empty).
  const spine = buildHandSpine();
  const encs = buildClusterEncounters({
    mapId: 329,
    spine,
    entrance: entranceForInstance('stratholme-live'),
    extraStrip: [
      ...EXCLUDED_ENTRIES,
      ...UNDEAD_SIDE_BOSSES,
      ENTRY.undeadPostman, // summon-only per postbox
    ],
    includePack: wingFilterByNearestBoss(329, "live"),
  });
  const withCourtyard = stampLiveOptional(stampCourtyardClear(encs));
  // Malown's origin is path-dependent: stamped onto InstanceRun.encounterOrigins from the postbox
  // that completes needUses=3. No static pin. Cite: stratholmeScripts.cpp:108-110.
  return withCourtyard;
}


export const STRATHOLME_LIVE: InstanceDef = {
  id: 'stratholme-live',
  mapId: 329,
  wing: 'live',
  name: 'Stratholme (Live)',
  portalZone: 'easternplaguelands',
  minLevel: 45,
  levelRange: [55, 60],
  lockoutMs: 0,
  description: '',
  quests: [...STRATHOLME_LIVE_QUESTS],
  encounters: buildEncounters(),
};

/** Sum of authored kill supply per creature entry (primary + pack + waves + death-summons). */
export function stratholmeLiveKillSupply(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of STRATHOLME_LIVE.encounters) {
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

// Counts only pure static trash packs (no bosses, no flag-gated / object-gated encounters, no wave-table
// rows). Matches survey Live static assignment.
export function stratholmeLivePureStaticTrashCounts(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of STRATHOLME_LIVE.encounters) {
    if (enc.kind !== 'trash') continue;
    const gated = (enc.events ?? []).some(
      (e) => e.kind === 'requiresFlag' || e.kind === 'objectGate' || e.kind === 'waves',
    );
    if (gated) continue;
    add(enc.creatureEntry, 1);
    for (const p of enc.pack ?? []) add(p.creatureEntry, p.count);
  }
  return map;
}
