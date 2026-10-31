// Zul'Farrak (map 209) — InstanceDef graph. Authority: docs/dungeons/survey/12-zul-farrak.md, which
// carries the four residual GAPS. Pack sizes from the static census, fractional pool rows rounded.

import type { EncounterDef, EncounterEvent, InstanceDef } from '../schema.ts';
import {
  entranceForInstance,
  buildClusterEncounters,
} from './pack-from-clusters.ts';

// ---- Census static counts (map 209; fractional pool expected rounded) ----
// Bly crew friendlies, seasonal elders, static bosses and summon-only event entries are excluded.

export const STATIC = {
  shadowcaster: 20, // 5648 pool 19.7 → Math.round
  bloodDrinker: 47, // 5649 pool 46.5 → Math.round
  witchDoctor: 47, // 5650
  shadowhunter: 41, // 7246 pool 41.3 → Math.round
  soulEater: 4, // 7247 pool 3.5 → Math.round
  guardian: 4, // 7268
  scarab: 70, // 7269
  executioner: 1, // 7274 - key drop for pyramid (bossette / trash)
  sandcrawler: 22, // 8095
  abomination: 2, // 8120
  hatchling: 3, // 8130
} as const;

/** Sum of pure static trash census (excl. rares, bosses, friendlies, summon-only). */
export const STATIC_TOTAL =
  STATIC.shadowcaster +
  STATIC.bloodDrinker +
  STATIC.witchDoctor +
  STATIC.shadowhunter +
  STATIC.soulEater +
  STATIC.guardian +
  STATIC.scarab +
  STATIC.executioner +
  STATIC.sandcrawler +
  STATIC.abomination +
  STATIC.hatchling;

const ENTRY = {
  shadowcaster: 5648,
  bloodDrinker: 5649,
  witchDoctor: 5650,
  shadowhunter: 7246,
  soulEater: 7247,
  guardian: 7268,
  scarab: 7269,
  executioner: 7274,
  sandcrawler: 8095,
  abomination: 8120,
  hatchling: 8130,
  // Rare-elites (optional rare bosses @ 100%)
  dustwraith: 10081,
  sandarr: 10080,
  zerillis: 10082,
  // Canonical bosses
  antusul: 8127,
  theka: 7272,
  zumrah: 7271,
  nekrum: 7796, // summon-only - pyramid final
  sezziz: 7275, // summon-only - pyramid final
  bly: 7604,
  velratha: 7795,
  gahzrilla: 7273, // summon-only - gong
  ukorz: 7267,
  ruuzlu: 7797,
  // Event summon-only (never pure static trash)
  slave: 7787,
  drudge: 7788,
  cretin: 7789,
  acolyte: 8876,
  zealot: 8877,
  broodling: 8138,
  servant: 8156,
  zombie: 7286,
  deadHero: 7276,
} as const;

/** Flags from survey event choreography / instance_zulfarrak.cpp. */
export const ZF_FLAGS = {
  gahzrillaGong: 'zf-gahzrilla-gong',
  pyramidStart: 'zf-pyramid-start',
  pyramidDone: 'zf-pyramid-done',
  /** Bly betrayal aftermath / Weegli end-door proxy (flag-only). */
  endDoor: 'zf-end-door',
} as const;

/** GO 141832 Gong of Zul'Farrak + Mallet 9240 - survey E1. */
export const ZF_GONG = {
  goEntry: 141832,
  requiredItem: 9240, // Mallet of Zul'Farrak (9239 alternate - survey primary is 9240)
} as const;

/** GO 141074 Troll Cage + Executioner's Key 8444 - survey E2. */
export const ZF_CAGE = {
  goEntry: 141074,
  requiredItem: 8444,
} as const;

// Pyramid stairway event — cage unlock → timed waves → Nekrum and Sezz'ziz concurrent. A pure
// from-call schedule that a clear does not advance. Cite: dbscripts_on_event 2609; cpp:81-96.
export const ZF_PYRAMID = {
  encId: 'nekrum-gutchewer',
  /** Absolute first wave. Cite: dbscripts_on_event 2609 delay 10000. */
  firstWaveAtMs: 10_000,
  // fromCall gaps after waves 0–1 (next absolute − this absolute). Absolutes: 10s / 100s / 250s → gaps 90s
  // / 150s.
  waveGapsMs: [90_000, 150_000] as const,
  /** Absolute schedule (event start = cage unlock). */
  waveAtMs: [10_000, 100_000, 250_000] as const,
  /** Summon despawn on dbscripts datalong2. */
  despawnMs: 9_000_000,
  /** Nekrum spawn — dbscripts_on_event 2609 delay 250000 entry 7796. */
  spawn: { x: 1882.32, y: 1201.45, z: 8.96 },
  /** Sezz'ziz concurrent with Nekrum on final wave (entry 7275). */
  sezzizEntry: ENTRY.sezziz,
  /** instance_zulfarrak.cpp:94 first trickle arm after IN_PROGRESS. */
  trickleStartMs: 20_000,
  /** instance_zulfarrak.cpp:203/220/239 urand(3000, 10000). */
  trickleMinMs: 3_000,
  trickleMaxMs: 10_000,
  /** MovePoint radius around Bly. Cite: cpp:234 GetRandomPoint … 4.0f. */
  trickleRadiusYd: 4,
} as const;

// Pyramid stairway wave table (dbscripts_on_event 2609 cmd 10 counts). Wave 0 @10s: 19×7787 + 19×7788; wave
// 1 @100s: 15+15+8×7789; wave 2 @250s: bosses+adds.
export const ZF_PYRAMID_WAVES = [
  {
    pack: [
      { creatureEntry: ENTRY.slave, count: 19 },
      { creatureEntry: ENTRY.drudge, count: 19 },
    ],
  },
  {
    pack: [
      { creatureEntry: ENTRY.slave, count: 15 },
      { creatureEntry: ENTRY.drudge, count: 15 },
      { creatureEntry: ENTRY.cretin, count: 8 },
    ],
  },
  {
    pack: [
      { creatureEntry: ENTRY.nekrum, count: 1 },
      { creatureEntry: ENTRY.sezziz, count: 1 },
      { creatureEntry: ENTRY.acolyte, count: 4 },
      { creatureEntry: ENTRY.zealot, count: 3 },
    ],
  },
] as const;

// Sergeant Bly aftermath — gossip 941 then +6 s faction 14 turns Bly and crew hostile; the kill sets
// endDoor. Cite: dbscripts_on_gossip 94101 delay 6000 cmd 22; gossip_menu_option 941.
export const ZF_BLY = {
  encId: 'sergeant-bly',
  entry: ENTRY.bly,
  crewEntries: [7605, 7606, 7608] as const, // Raven, Oro, Murta — flip with Bly
  weegliEntry: 7607, // stays friendly → bombs door (residual WP path)
  gossipMenu: 941,
  /** dbscripts_on_gossip 94101 delay 6000 → SetFaction 14. */
  hostileAfterMs: 6_000,
  hostileFaction: 14,
  questDivinomatic: 2768,
  /** GO_END_DOOR — instance_zulfarrak.h:39; opened after Weegli bomb (flag proxy). */
  endDoorGo: 146_084,
  origin: { x: 1882.89, y: 1299.27, z: 48.384 },
} as const;

// Gahz'rilla gong summon — dbscripts_on_event 2488. Cite: delay 2000 cmd 10 entry 7273 @ 1667.54,1190.57;
// zulfarrak.cpp event_go_zulfarrak_gong.
export const ZF_GAHZRILLA = {
  encId: 'gahzrilla',
  entry: ENTRY.gahzrilla,
  goEntry: ZF_GONG.goEntry,
  requiredItem: ZF_GONG.requiredItem,
  /** Absolute summon after gong. Cite: dbscripts_on_event 2488 delay 2000. */
  summonAtMs: 2_000,
  spawn: { x: 1667.54, y: 1190.57, z: -2.80444 },
} as const;

/** Summon-only creature entries that must never appear in pure static trash packs. */
export const ZF_SUMMON_ONLY_ENTRIES = new Set<number>([
  ENTRY.slave, // 7787
  ENTRY.drudge, // 7788
  ENTRY.cretin, // 7789
  ENTRY.acolyte, // 8876
  ENTRY.zealot, // 8877
  ENTRY.broodling, // 8138
  ENTRY.servant, // 8156
  ENTRY.zombie, // 7286
  ENTRY.deadHero, // 7276
  ENTRY.gahzrilla, // 7273
  ENTRY.nekrum, // 7796
  ENTRY.sezziz, // 7275
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
const BOSS_SPELLS = {
  antusul: [8376, 11899, 11894, 11895],
  theka: [8600, 11089],
  zumrah: [12491, 12739, 15245, 11086],
  nekrum: [8600],
  sezziz: [13704, 8362, 12039, 15537],
  bly: [11972, 12170],
  velratha: [12491, 12739, 11086, 15245],
  gahzrilla: [11836, 11902, 11131],
  ukorz: [11837, 15496, 7366, 11838, 11904, 8269],
  ruuzlu: [7160, 7366, 15496],
  dustwraith: [12254, 15667],
  sandarr: [14516, 15615, 13730, 11976, 12555],
  zerillis: [6533, 12551, 15547],
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

// Linear encounter graph: entrance trash → bosses in survey canonical order with inter-boss trash,
// the pyramid event, gong Gahz'rilla, and the Antu'sul / Zum'rah / Ukorz phases.
function buildHandSpine(): EncounterDef[] {
  const shadowcasters = trashFromCensus(
    'shadowcaster',
    'Sandfury Shadowcaster',
    ENTRY.shadowcaster,
    STATIC.shadowcaster,
  );
  const bloodDrinkers = trashFromCensus(
    'blood-drinker',
    'Sandfury Blood Drinker',
    ENTRY.bloodDrinker,
    STATIC.bloodDrinker,
  );
  const witchDoctors = trashFromCensus(
    'witch-doctor',
    'Sandfury Witch Doctor',
    ENTRY.witchDoctor,
    STATIC.witchDoctor,
  );
  const shadowhunters = trashFromCensus(
    'shadowhunter',
    'Sandfury Shadowhunter',
    ENTRY.shadowhunter,
    STATIC.shadowhunter,
  );
  const soulEaters = trashFromCensus(
    'soul-eater',
    'Sandfury Soul Eater',
    ENTRY.soulEater,
    STATIC.soulEater,
  );
  const guardians = trashFromCensus(
    'guardian',
    'Sandfury Guardian',
    ENTRY.guardian,
    STATIC.guardian,
  );
  const scarabs = trashFromCensus('scarab', 'Scarab', ENTRY.scarab, STATIC.scarab);
  const sandcrawlers = trashFromCensus(
    'sandcrawler',
    "Sul'lithuz Sandcrawler",
    ENTRY.sandcrawler,
    STATIC.sandcrawler,
  );
  const abominations = trashFromCensus(
    'abomination',
    "Sul'lithuz Abomination",
    ENTRY.abomination,
    STATIC.abomination,
  );
  const hatchlings = trashFromCensus(
    'hatchling',
    "Sul'lithuz Hatchling",
    ENTRY.hatchling,
    STATIC.hatchling,
  );

  // Mix troll pool types for variety within bands (spatial-ish, no explicit pull order).
  const trollPool: EncounterDef[] = [];
  {
    const max = Math.max(
      shadowcasters.length,
      bloodDrinkers.length,
      witchDoctors.length,
      shadowhunters.length,
    );
    for (let i = 0; i < max; i++) {
      if (shadowcasters[i]) trollPool.push(shadowcasters[i]!);
      if (bloodDrinkers[i]) trollPool.push(bloodDrinkers[i]!);
      if (witchDoctors[i]) trollPool.push(witchDoctors[i]!);
      if (shadowhunters[i]) trollPool.push(shadowhunters[i]!);
    }
  }
  const beastPool: EncounterDef[] = [
    ...scarabs,
    ...sandcrawlers,
    ...hatchlings,
    ...abominations,
    ...guardians,
    ...soulEaters,
  ];

  // Bands between bosses along survey path (Antu'sul yard → Theka → Zum'rah → pyramid →
  // Bly → Velratha/gong → Ukorz/Ruuzlu).
  const allTrash: EncounterDef[] = [...trollPool, ...beastPool];
  const bandCount = 9;
  const bandSize = Math.ceil(allTrash.length / bandCount);
  const band = (i: number) => allTrash.slice(i * bandSize, (i + 1) * bandSize);

  const out: EncounterDef[] = [];

  // --- Entrance → Antu'sul ---
  out.push(...band(0));

  // E3 Antu'sul: hpThreshold pairs RETIRED because EventAI owns the whole kit — broodlings, the
  // 11894 servants at 75/25%, totems and the heal. Keeping the def rows double-fired the servants.
  out.push(
    boss(
      'antusul',
      "Antu'sul",
      ENTRY.antusul,
      BOSS_SPELLS.antusul,
      undefined,
      "Antu'sul the sul'lithuz broodlord hisses from his basin.",
    ),
  );

  // Rare: Dustwraith (10081) - survey 4 static rare-elite. Include @ 100% (AUTHORING). Rares roll their
  // pools (46101/46102/46103) via rareRoll.ts (pools.json). Survey rare; isComplete ignores optional.
  out.push({
    ...boss(
      'dustwraith',
      'Dustwraith',
      ENTRY.dustwraith,
      BOSS_SPELLS.dustwraith,
      undefined,
      'A rare sandfury spectre drifts between the tombs.',
    ),
    optional: true,
  });

  // --- Antu'sul → Theka ---
  out.push(...band(1));

  // E5 minor - Theka 30% transform is visual (phase flag only).
  out.push(
    boss(
      'theka-the-martyr',
      'Theka the Martyr',
      ENTRY.theka,
      BOSS_SPELLS.theka,
      [{ kind: 'hpThreshold', pct: 30, once: true, phase: 1 }],
      'Theka the Martyr stands among the scarabs. At low health he assumes skeletal form.',
    ),
  );

  // --- Theka → Zum'rah ---
  out.push(...band(2));

  // Former hpThreshold 5× grave pairs RETIRED — boss_zumrah ScriptDev owns the every-20s
  // SPELL_SUMMON_ZOMBIES 10247 schedule, and both live would double-fire the mid-fight adds.
  out.push(
    boss(
      'witch-doctor-zumrah',
      "Witch Doctor Zum'rah",
      ENTRY.zumrah,
      BOSS_SPELLS.zumrah,
      undefined,
      "Witch Doctor Zum'rah raises the dead from shallow graves. ScriptDev owns 20s Summon Zombies 10247 + Shadow Bolt kit; 40-grave GO pool stop-empty remains product GAP.",
    ),
  );

  // Rare: Sandarr Dunereaver (10080) - survey 2 static.
  // Survey rare; isComplete ignores optional.
  out.push({
    ...boss(
      'sandarr-dunereaver',
      'Sandarr Dunereaver',
      ENTRY.sandarr,
      BOSS_SPELLS.sandarr,
      undefined,
      'Sandarr Dunereaver, a rare sandfury champion.',
    ),
    optional: true,
  });

  // Zerillis (10082) stands 48 yd from Sandarr, so the two Dunereaver rares are one stop. Listed
  // after Velratha he cost 620 yd of insertion, the instance's worst.
  out.push({
    ...boss(
      'zerillis',
      'Zerillis',
      ENTRY.zerillis,
      BOSS_SPELLS.zerillis,
      undefined,
      'Zerillis the rare sandstalker.',
    ),
    optional: true,
  });

  // --- Zum'rah → Pyramid ---
  out.push(...band(3));

  // Sandfury Executioner 7274 drops Executioner's Key 8444 at 100% (survey E2). setsFlag keeps him
  // on bosses-density; the cage plus 8444 is still the only Nekrum start lock. Cite: KI-974.
  out.push(
    trashPull(
      'sandfury-executioner',
      'Sandfury Executioner',
      ENTRY.executioner,
      STATIC.executioner,
      [{ kind: 'setsFlag', flag: 'zf-executioner-key' }],
    ),
  );

  // E2 pyramid stairway: cage objectGate plus the timed floor gauntlet. Primary is Nekrum, with
  // Sezz concurrent on the final wave and onDeathSummon as the phase-chain fallback.
  const pyramidEnc: EncounterDef = {
    id: ZF_PYRAMID.encId,
    name: 'Nekrum Gutchewer',
    kind: 'boss',
    creatureEntry: ENTRY.nekrum,
    bossSpells: [...BOSS_SPELLS.nekrum],
    origin: { ...ZF_PYRAMID.spawn },
    intro:
      "The Executioner's Key opens the troll cage - Sandfury waves pour down the pyramid stairway. Nekrum and Sezz'ziz lead the final assault.",
    events: [
      {
        kind: 'objectGate',
        goEntry: ZF_CAGE.goEntry,
        requiredItem: ZF_CAGE.requiredItem,
        setsFlag: ZF_FLAGS.pyramidStart,
        once: true,
      },
      { kind: 'requiresFlag', flag: ZF_FLAGS.pyramidStart },
      {
        kind: 'waves',
        waves: ZF_PYRAMID_WAVES.map((w) => ({
          pack: w.pack.map((p) => ({ creatureEntry: p.creatureEntry, count: p.count })),
        })),
      },
      {
        kind: 'onDeathSummon',
        creatureEntry: ENTRY.sezziz,
        bossSpells: [...BOSS_SPELLS.sezziz],
      },
      { kind: 'setsFlag', flag: ZF_FLAGS.pyramidDone },
    ],
  };
  out.push(pyramidEnc);

  // --- Pyramid → Bly betrayal ---
  out.push(...band(4));

  // Aftermath A - Bly gossip challenge after pyramid (faction 35 → 14 @ +6s in CMaNGOS).
  // Floor: non-hostile primary + startChallengeGauntletAt flip; kill sets endDoor (Weegli proxy).
  out.push(
    boss(
      ZF_BLY.encId,
      'Sergeant Bly',
      ENTRY.bly,
      BOSS_SPELLS.bly,
      [
        { kind: 'requiresFlag', flag: ZF_FLAGS.pyramidDone },
        { kind: 'setsFlag', flag: ZF_FLAGS.endDoor },
      ],
      "Sergeant Bly and his crew turn on the party after the pyramid - the Divino-matic Rod is theirs to claim.",
    ),
  );

  // --- Bly → Velratha (pool / hydromancer) ---
  out.push(...band(5));

  out.push(
    boss(
      'hydromancer-velratha',
      'Hydromancer Velratha',
      ENTRY.velratha,
      BOSS_SPELLS.velratha,
      undefined,
      "Hydromancer Velratha channels at Gahz'rilla's pool.",
    ),
  );

  // --- Velratha → Gahz'rilla gong ---
  out.push(...band(6));

  // E1 - Gong of Zul'Farrak: Mallet 9240 + GO 141832 → summon Gahz'rilla 7273 @ +2s.
  // Cite: dbscripts_on_event 2488; zulfarrak.cpp ProcessEventId_event_go_zulfarrak_gong.
  const gahzEnc = boss(
    ZF_GAHZRILLA.encId,
    "Gahz'rilla",
    ENTRY.gahzrilla,
    BOSS_SPELLS.gahzrilla,
    [
      {
        kind: 'objectGate',
        goEntry: ZF_GONG.goEntry,
        requiredItem: ZF_GONG.requiredItem,
        setsFlag: ZF_FLAGS.gahzrillaGong,
        once: true,
      },
      { kind: 'requiresFlag', flag: ZF_FLAGS.gahzrillaGong },
    ],
    "Strike the Gong of Zul'Farrak with the Mallet - Gahz'rilla rises from the pool. (Summon-only, once per instance.)",
  );
  gahzEnc.origin = { ...ZF_GAHZRILLA.spawn };
  out.push(gahzEnc);

  // --- Gahz'rilla → Ukorz (end door gate) ---
  out.push(
    ...band(7).map((e) => ({
      ...e,
      events: [...(e.events ?? []), { kind: 'requiresFlag' as const, flag: ZF_FLAGS.endDoor }],
    })),
  );

  // E5 - Ukorz 30% summons 4× Sandfury Slave 7787 (survey creature_ai_scripts).
  out.push(
    boss(
      'chief-ukorz-sandscalp',
      'Chief Ukorz Sandscalp',
      ENTRY.ukorz,
      BOSS_SPELLS.ukorz,
      [
        { kind: 'requiresFlag', flag: ZF_FLAGS.endDoor },
        {
          kind: 'hpThreshold',
          pct: 30,
          once: true,
          spawn: [{ creatureEntry: ENTRY.slave, count: 4 }],
        },
      ],
      'Chief Ukorz Sandscalp, warlord of the Sandfury, awaits in the final chamber.',
    ),
  );

  // --- Ukorz → Ruuzlu (paired at same chamber) ---
  out.push(
    ...band(8).map((e) => ({
      ...e,
      events: [...(e.events ?? []), { kind: 'requiresFlag' as const, flag: ZF_FLAGS.endDoor }],
    })),
  );

  out.push(
    boss(
      'ruuzlu',
      'Ruuzlu',
      ENTRY.ruuzlu,
      BOSS_SPELLS.ruuzlu,
      [{ kind: 'requiresFlag', flag: ZF_FLAGS.endDoor }],
      "Ruuzlu, Ukorz's bodyguard, fights beside the chief.",
    ),
  );

  return out;
}

function buildEncounters(): EncounterDef[] {
  // Hand spine = bosses + event-gated packs (mono trashFromCensus is empty).
  const spine = buildHandSpine();
  return buildClusterEncounters({
    mapId: 209,
    spine,
    entrance: entranceForInstance('zul-farrak'),
    
  });
}


/** Survey quests completable inside map 209. Elder Wildmane 8676 excluded (D-10 Lunar Festival). */
export const ZUL_FARRAK_QUESTS = [2865, 3042, 2846, 2768, 3527, 351] as const;

export const ZUL_FARRAK: InstanceDef = {
  id: 'zul-farrak',
  mapId: 209,
  name: "Zul'Farrak",
  portalZone: 'tanaris',
  minLevel: 35, // entrance trigger 924 requiredLevel
  levelRange: [30, 47], // survey trash band
  lockoutMs: 0,
  description: '',
  quests: [...ZUL_FARRAK_QUESTS],
  encounters: buildEncounters(),
};

/** Sum of authored kill counts per creature entry (trash + bosses + waves + hpThreshold spawns). */
export function zfKillSupply(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of ZUL_FARRAK.encounters) {
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

// Counts pure static trash packs (kind trash only - no bosses / wave-only summons). Path flags (end door)
// still count toward census; summon-only entries never appear here.
export function zfPureStaticTrashCounts(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of ZUL_FARRAK.encounters) {
    if (enc.kind !== 'trash') continue;
    add(enc.creatureEntry, 1);
    for (const p of enc.pack ?? []) add(p.creatureEntry, p.count);
  }
  return map;
}
