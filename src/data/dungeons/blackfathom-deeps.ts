// Blackfathom Deeps (map 48) — InstanceDef graph. Authority: docs/dungeons/survey/05-blackfathom-deeps.md.
// Pack sizes from the survey static census only; summon-only wave entries never sit in static packs.

import type { EncounterDef, EncounterEvent, InstanceDef } from '../schema.ts';
import {
  entranceForInstance,
  buildClusterEncounters,
} from './pack-from-clusters.ts';

// ---- Census static counts (map 48; survey creature census static column) ----
// Bosses, summon-only Aquanis 12876 and friendly Thaelrid 4787 are not trash. Waves reuse 4825/4823.

const STATIC = {
  myrmidon: 27, // 4807 Blackfathom Myrmidon
  murloc: 10, // 4818 Blindlight Murloc
  snapclaw: 7, // 4815 Murkshallow Snapclaw
  skittering: 11, // 4821 Skittering Crustacean
  fisher: 6, // 4824 Aku'mai Fisher
  seaWitch: 30, // 4805 Blackfathom Sea Witch
  shadowstalker: 14, // 4798 Fallenroot Shadowstalker
  snapping: 18, // 4822 Snapping Crustacean
  threshfin: 8, // 4827 Deep Pool Threshfin
  hellcaller: 11, // 4799 Fallenroot Hellcaller
  acolyte: 3, // 4809 Twilight Acolyte
  loreseeker: 9, // 4812 Twilight Loreseeker
  barbed: 3, // 4823 Barbed Crustacean (also shrine wave 3)
  muckdweller: 5, // 4819 Blindlight Muckdweller
  oracle: 5, // 4820 Blindlight Oracle
  aquamancer: 7, // 4811 Twilight Aquamancer
  reaver: 11, // 4810 Twilight Reaver
  snapjaw: 7, // 4825 Aku'mai Snapjaw (also shrine wave 1)
  lorgus: 4, // 12902 Lorgus Jett
  elementalist: 6, // 4814 Twilight Elementalist
  shadowmage: 7, // 4813 Twilight Shadowmage
} as const;

const ENTRY = {
  myrmidon: 4807,
  murloc: 4818,
  snapclaw: 4815,
  skittering: 4821,
  fisher: 4824,
  seaWitch: 4805,
  shadowstalker: 4798,
  snapping: 4822,
  threshfin: 4827,
  hellcaller: 4799,
  acolyte: 4809,
  loreseeker: 4812,
  barbed: 4823,
  muckdweller: 4819,
  oracle: 4820,
  aquamancer: 4811,
  reaver: 4810,
  snapjaw: 4825,
  lorgus: 12902,
  elementalist: 4814,
  shadowmage: 4813,
  // Bosses (canonical order)
  ghamoora: 4887,
  sarevess: 4831,
  gelihast: 6243,
  aquanis: 12876, // summon-only via Fathom Stone
  kelris: 4832,
  serrakis: 4830,
  akumai: 4829,
  // Shrine wave summon-only (0 static)
  servant: 4978, // Aku'mai Servant - wave 2
  softshell: 4977, // Murkshallow Softshell - wave 4
} as const;

/** Flags from survey event choreography / instance_blackfathom_deeps.cpp. */
export const BFD_FLAGS = {
  aquanisAvailable: 'bfd-aquanis-available',
  kelrisDeath: 'bfd-kelris-death',
  shrineFire1: 'bfd-shrine-fire-1',
  shrineFire2: 'bfd-shrine-fire-2',
  shrineFire3: 'bfd-shrine-fire-3',
  shrineFire4: 'bfd-shrine-fire-4',
  shrineDone: 'bfd-shrine-done',
} as const;

/** Fathom Stone GO 177964 - survey Fathom Stone → Baron Aquanis. */
export const BFD_FATHOM_STONE = {
  goEntry: 177964,
} as const;

/** Fire of Aku'mai GOs 21118–21121 - survey Fires of Aku'mai 4-brazier waves. */
export const BFD_FIRES_OF_AKUMAI = {
  goEntries: [21118, 21119, 21120, 21121] as const,
  /** Survey aWaveSummonInformation wave table. */
  waves: [
    { entry: 4825, count: 3, name: "Aku'mai Snapjaw" }, // also 7 static
    { entry: 4978, count: 2, name: "Aku'mai Servant" }, // summon-only
    { entry: 4823, count: 4, name: 'Barbed Crustacean' }, // also 3 static
    { entry: 4977, count: 10, name: 'Murkshallow Softshell' }, // summon-only
  ] as const,
} as const;

/** Summon-only creature entries that must never appear in pure static trash packs. */
export const BFD_SUMMON_ONLY_ENTRIES = new Set<number>([
  ENTRY.aquanis, // 12876 Baron Aquanis
  ENTRY.servant, // 4978 Aku'mai Servant
  ENTRY.softshell, // 4977 Murkshallow Softshell
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
// Old Serra'kis (4830) has no baked spells.
const BOSS_SPELLS = {
  ghamoora: [5568],
  sarevess: [246, 865, 8435, 6660],
  gelihast: [6533],
  aquanis: [15531, 15043, 14907], // Frost Nova / Frostbolt family from bake
  kelris: [15587, 8399],
  serrakis: [] as number[],
  akumai: [3815, 3490],
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

// One Fire of Aku'mai brazier: objectGate on the wave pack (Nth fire lit → wave N), requiring
// Kelris dead. Self-requires the fire flag so a player use lights the brazier before the pull.
function shrineWave(
  waveIndex: 1 | 2 | 3 | 4,
  goEntry: number,
  creatureEntry: number,
  count: number,
  displayName: string,
  extraEvents?: EncounterEvent[],
): EncounterDef {
  const fireFlag =
    waveIndex === 1
      ? BFD_FLAGS.shrineFire1
      : waveIndex === 2
        ? BFD_FLAGS.shrineFire2
        : waveIndex === 3
          ? BFD_FLAGS.shrineFire3
          : BFD_FLAGS.shrineFire4;
  const events: EncounterEvent[] = [
    { kind: 'requiresFlag', flag: BFD_FLAGS.kelrisDeath },
    {
      kind: 'objectGate',
      goEntry,
      once: true,
      setsFlag: fireFlag,
    },
    { kind: 'requiresFlag', flag: fireFlag },
    ...(extraEvents ?? []),
  ];
  return trashPull(
    `shrine-wave-${waveIndex}`,
    `Fire of Aku'mai - ${displayName}`,
    creatureEntry,
    count,
    events,
  );
}

// Linear encounter graph: entrance trash → bosses in survey order with inter-boss trash, Fathom
// Stone → Aquanis, Kelris → 4-brazier shrine waves → Aku'mai. Each static entry → packs of 2–5.
function buildHandSpine(): EncounterDef[] {
  const myrmidons = trashFromCensus('myrmidon', 'Blackfathom Myrmidon', ENTRY.myrmidon, STATIC.myrmidon);
  const seaWitches = trashFromCensus('sea-witch', 'Blackfathom Sea Witch', ENTRY.seaWitch, STATIC.seaWitch);
  const shadowstalkers = trashFromCensus(
    'shadowstalker',
    'Fallenroot Shadowstalker',
    ENTRY.shadowstalker,
    STATIC.shadowstalker,
  );
  const hellcallers = trashFromCensus(
    'hellcaller',
    'Fallenroot Hellcaller',
    ENTRY.hellcaller,
    STATIC.hellcaller,
  );
  const murlocs = trashFromCensus('murloc', 'Blindlight Murloc', ENTRY.murloc, STATIC.murloc);
  const snapclaws = trashFromCensus('snapclaw', 'Murkshallow Snapclaw', ENTRY.snapclaw, STATIC.snapclaw);
  const skittering = trashFromCensus(
    'skittering',
    'Skittering Crustacean',
    ENTRY.skittering,
    STATIC.skittering,
  );
  const snapping = trashFromCensus('snapping', 'Snapping Crustacean', ENTRY.snapping, STATIC.snapping);
  const barbed = trashFromCensus('barbed', 'Barbed Crustacean', ENTRY.barbed, STATIC.barbed);
  const fishers = trashFromCensus('fisher', "Aku'mai Fisher", ENTRY.fisher, STATIC.fisher);
  const snapjaws = trashFromCensus('snapjaw', "Aku'mai Snapjaw", ENTRY.snapjaw, STATIC.snapjaw);
  const threshfins = trashFromCensus('threshfin', 'Deep Pool Threshfin', ENTRY.threshfin, STATIC.threshfin);
  const muckdwellers = trashFromCensus(
    'muckdweller',
    'Blindlight Muckdweller',
    ENTRY.muckdweller,
    STATIC.muckdweller,
  );
  const oracles = trashFromCensus('oracle', 'Blindlight Oracle', ENTRY.oracle, STATIC.oracle);
  const acolytes = trashFromCensus('acolyte', 'Twilight Acolyte', ENTRY.acolyte, STATIC.acolyte);
  const loreseekers = trashFromCensus(
    'loreseeker',
    'Twilight Loreseeker',
    ENTRY.loreseeker,
    STATIC.loreseeker,
  );
  const aquamancers = trashFromCensus(
    'aquamancer',
    'Twilight Aquamancer',
    ENTRY.aquamancer,
    STATIC.aquamancer,
  );
  const reavers = trashFromCensus('reaver', 'Twilight Reaver', ENTRY.reaver, STATIC.reaver);
  const elementalists = trashFromCensus(
    'elementalist',
    'Twilight Elementalist',
    ENTRY.elementalist,
    STATIC.elementalist,
  );
  const shadowmages = trashFromCensus(
    'shadowmage',
    'Twilight Shadowmage',
    ENTRY.shadowmage,
    STATIC.shadowmage,
  );
  // Lorgus Jett - 4 static (quest 6565 kill target); not a survey boss.
  const lorgus = trashFromCensus('lorgus', 'Lorgus Jett', ENTRY.lorgus, STATIC.lorgus);

  const out: EncounterDef[] = [];

  // --- Entrance pool → Ghamoo-ra ---
  // Myrmidons + sea witches + crustaceans (outer ruins / moonshrine pool)
  out.push(
    ...myrmidons.slice(0, Math.ceil(myrmidons.length / 2)),
    ...seaWitches.slice(0, Math.ceil(seaWitches.length / 3)),
    ...skittering.slice(0, Math.ceil(skittering.length / 2)),
    ...snapping.slice(0, Math.ceil(snapping.length / 3)),
  );

  out.push(
    boss(
      'ghamoo-ra',
      'Ghamoo-ra',
      ENTRY.ghamoora,
      BOSS_SPELLS.ghamoora,
      undefined,
      'A massive turtle hauls itself from the moonlit pool.',
    ),
  );

  // --- → Lady Sarevess ---
  out.push(
    ...myrmidons.slice(Math.ceil(myrmidons.length / 2)),
    ...seaWitches.slice(
      Math.ceil(seaWitches.length / 3),
      Math.ceil((2 * seaWitches.length) / 3),
    ),
    ...shadowstalkers.slice(0, Math.ceil(shadowstalkers.length / 2)),
    ...hellcallers.slice(0, Math.ceil(hellcallers.length / 2)),
  );

  out.push(
    boss(
      'lady-sarevess',
      'Lady Sarevess',
      ENTRY.sarevess,
      BOSS_SPELLS.sarevess,
      undefined,
      "Lady Sarevess, a naga sorceress, guards the shrine's upper halls.",
    ),
  );

  // --- → Gelihast (murloc cavern) ---
  out.push(
    ...murlocs,
    ...snapclaws,
    ...muckdwellers,
    ...oracles,
    ...skittering.slice(Math.ceil(skittering.length / 2)),
  );

  out.push(
    boss(
      'gelihast',
      'Gelihast',
      ENTRY.gelihast,
      BOSS_SPELLS.gelihast,
      undefined,
      'Gelihast the murloc oracle crouches over a dark altar.',
    ),
  );

  // --- Fathom Stone → Baron Aquanis (summon-only, once per instance) ---
  // Survey GOUse_go_fathom_stone summons 12876 when TYPE_AQUANIS is NOT_STARTED; self-unlocking.
  out.push(
    ...threshfins.slice(0, Math.ceil(threshfins.length / 2)),
    ...snapping.slice(
      Math.ceil(snapping.length / 3),
      Math.ceil((2 * snapping.length) / 3),
    ),
  );

  // Summon (Fathom Stone); isComplete ignores optional.
  out.push({
    ...boss(
      'baron-aquanis',
      'Baron Aquanis',
      ENTRY.aquanis,
      BOSS_SPELLS.aquanis,
      [
        {
          kind: 'objectGate',
          goEntry: BFD_FATHOM_STONE.goEntry,
          once: true,
          setsFlag: BFD_FLAGS.aquanisAvailable,
        },
        { kind: 'requiresFlag', flag: BFD_FLAGS.aquanisAvailable },
      ],
      'The Fathom Stone thrums - Baron Aquanis rises from the depths. (Summon-only, once per instance.)',
    ),
    optional: true,
  });

  // --- Twilight halls → Kelris ---
  out.push(
    ...acolytes,
    ...loreseekers,
    ...aquamancers,
    ...reavers.slice(0, Math.ceil(reavers.length / 2)),
    ...elementalists.slice(0, Math.ceil(elementalists.length / 2)),
    ...shadowmages.slice(0, Math.ceil(shadowmages.length / 2)),
    ...lorgus, // Lorgus Jett patrols the twilight area (quest 6565)
    ...seaWitches.slice(Math.ceil((2 * seaWitches.length) / 3)),
    ...shadowstalkers.slice(Math.ceil(shadowstalkers.length / 2)),
    ...hellcallers.slice(Math.ceil(hellcallers.length / 2)),
  );

  out.push(
    boss(
      'twilight-lord-kelris',
      'Twilight Lord Kelris',
      ENTRY.kelris,
      BOSS_SPELLS.kelris,
      [{ kind: 'setsFlag', flag: BFD_FLAGS.kelrisDeath }],
      "Twilight Lord Kelris meditates before the shrine fires. His death unlocks the Fires of Aku'mai.",
    ),
  );

  // --- Old Serra'kis (deep pool, survey order after Kelris) ---
  out.push(
    ...threshfins.slice(Math.ceil(threshfins.length / 2)),
    ...fishers,
    ...snapjaws,
    ...barbed,
    ...snapping.slice(Math.ceil((2 * snapping.length) / 3)),
    ...reavers.slice(Math.ceil(reavers.length / 2)),
    ...elementalists.slice(Math.ceil(elementalists.length / 2)),
    ...shadowmages.slice(Math.ceil(shadowmages.length / 2)),
  );

  // Survey side cavern; isComplete ignores optional.
  out.push({
    ...boss(
      'old-serrakis',
      "Old Serra'kis",
      ENTRY.serrakis,
      BOSS_SPELLS.serrakis,
      undefined,
      "Old Serra'kis lurks in the submerged cavern beyond the shrine.",
    ),
    optional: true,
  });

  // --- Fires of Aku'mai: 4 braziers → waves → Portal of Aku'Mai ---
  // Survey GOs 21118–21121; wave table from aWaveSummonInformation (blackfathom_deeps.h).
  const fires = BFD_FIRES_OF_AKUMAI.goEntries;
  const waves = BFD_FIRES_OF_AKUMAI.waves;
  out.push(
    shrineWave(1, fires[0]!, waves[0]!.entry, waves[0]!.count, waves[0]!.name),
    shrineWave(2, fires[1]!, waves[1]!.entry, waves[1]!.count, waves[1]!.name),
    shrineWave(3, fires[2]!, waves[2]!.entry, waves[2]!.count, waves[2]!.name),
    shrineWave(4, fires[3]!, waves[3]!.entry, waves[3]!.count, waves[3]!.name, [
      { kind: 'setsFlag', flag: BFD_FLAGS.shrineDone },
    ]),
  );

  // --- Aku'mai (requires shrine complete / Portal of Aku'Mai open) ---
  out.push(
    boss(
      'akumai',
      "Aku'mai",
      ENTRY.akumai,
      BOSS_SPELLS.akumai,
      [{ kind: 'requiresFlag', flag: BFD_FLAGS.shrineDone }],
      "Aku'mai, ancient pet of the Old Gods, coils in the final chamber.",
    ),
  );

  return out;
}

function buildEncounters(): EncounterDef[] {
  // Hand spine = bosses + event-gated packs (mono trashFromCensus is empty).
  const spine = buildHandSpine();
  return buildClusterEncounters({
    mapId: 48,
    spine,
    entrance: entranceForInstance('blackfathom-deeps'),
    
  });
}


/** Survey quests completable inside / linked to map 48. */
export const BFD_QUESTS = [
  1442, // Seeking the Kor Gem
  971, // Knowledge in the Deeps
  1198, // In Search of Thaelrid
  1275, // Researching the Corruption
  1199, // Twilight Falls
  1740, // The Orb of Soran'ruk
  6565, // Allegiance to the Old Gods
  1200, // Blackfathom Villainy (A)
  6561, // Blackfathom Villainy (H)
  6921, // Amongst the Ruins
  5064, // Grimtotem Spying
] as const;

export const BLACKFATHOM_DEEPS: InstanceDef = {
  id: 'blackfathom-deeps',
  mapId: 48,
  name: 'Blackfathom Deeps',
  portalZone: 'ashenvale',
  minLevel: 10, // entrance trigger 257 requiredLevel
  levelRange: [22, 27], // survey trash band
  lockoutMs: 0,
  description: '',
  quests: [...BFD_QUESTS],
  encounters: buildEncounters(),
};

/** Sum of authored kill counts per creature entry (trash + bosses + wave packs). */
export function bfdKillSupply(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of BLACKFATHOM_DEEPS.encounters) {
    add(enc.creatureEntry, 1);
    for (const p of enc.pack ?? []) add(p.creatureEntry, p.count);
    for (const ev of enc.events ?? []) {
      if (ev.kind === 'onDeathSummon') add(ev.creatureEntry, 1);
      if (ev.kind === 'waves') {
        for (const w of ev.waves) {
          for (const row of w.pack) add(row.creatureEntry, row.count);
        }
      }
    }
  }
  return map;
}

// Counts only pure static trash packs (no bosses, no shrine-wave / flag-gated event pulls). Used to assert
// census match and summon-only exclusion.
export function bfdPureStaticTrashCounts(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of BLACKFATHOM_DEEPS.encounters) {
    if (enc.kind !== 'trash') continue;
    // Shrine waves are event-gated object pulls - not pure static census packs.
    if (enc.id.startsWith('shrine-wave-')) continue;
    const req = (enc.events ?? []).some((e) => e.kind === 'requiresFlag');
    if (req) continue;
    add(enc.creatureEntry, 1);
    for (const p of enc.pack ?? []) add(p.creatureEntry, p.count);
  }
  return map;
}
