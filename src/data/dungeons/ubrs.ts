// Upper Blackrock Spire (map 229, UBRS wing) — InstanceDef graph, UBRS bosses and upper trash only.
// Authority: docs/dungeons/survey/16-blackrock-spire.md, which carries the residual GAPS list.

import type { EncounterDef, EncounterEvent, InstanceDef } from '../schema.ts';
import { dungeonGameObjectsForMap } from '../dungeonGameObjects.ts';
import {
  entranceForInstance,
  buildClusterEncounters,
  clusterMemberByGuid,
  loadPoolGuidCandidates,
  repackFromGuids,
  wingFilterByNearestBoss,
} from './pack-from-clusters.ts';

// ---- UBRS trash assignment (survey static column; LBRS families excluded) ----
// Rage Talon* and Blackhand*, minus the Incarcerators and Chromatic guards; friendlies excluded.

const STATIC = {
  rageTalonDragonspawn: 21, // 9096
  rageTalonFlamescale: 10, // 10083
  blackhandDreadweaver: 20, // 9817
  blackhandSummoner: 18, // 9818
  blackhandVeteran: 28, // 9819
  blackhandAssassin: 9, // 10318
  blackhandElite: 14, // 10317
  blackhandIronGuard: 18, // 10319
  blackhandThug: 2, // 10762
  rageTalonDragonGuard: 8, // 10366
  rageTalonFireTongue: 8, // 10372
  rageTalonCaptain: 5, // 10371
} as const;

/** Incarcerators (census ×7) - Emberseer event only, not bulk trash. */
export const UBRS_INCARCERATOR_COUNT = 7; // 10316

/** Chromatic Elite Guard (census ×2) - Drakkisath pack only, not bulk trash. */
export const UBRS_CHROMATIC_GUARD_COUNT = 2; // 10814

const ENTRY = {
  // Trash
  rageTalonDragonspawn: 9096,
  rageTalonFlamescale: 10083,
  blackhandDreadweaver: 9817,
  blackhandSummoner: 9818,
  blackhandVeteran: 9819,
  blackhandAssassin: 10318,
  blackhandElite: 10317,
  blackhandIronGuard: 10319,
  blackhandThug: 10762,
  rageTalonDragonGuard: 10366,
  rageTalonFireTongue: 10372,
  rageTalonCaptain: 10371,
  blackhandIncarcerator: 10316,
  chromaticEliteGuard: 10814,
  // Canonical UBRS bosses (mission / survey upper order)
  emberseer: 9816,
  jed: 10509, // rare-elite
  goraluk: 10899,
  solakar: 10264, // summon-only - Father Flame waves finale
  gyth: 10339, // summon-only - stadium
  rend: 10429, // summon-only - stadium concurrent
  beast: 10430,
  drakkisath: 10363,
  // Rookery summons (0 static on map 229)
  rookeryHatcher: 10683,
  rookeryGuardian: 10258,
  rookeryWhelp: 10161, // egg trap chain → 15745 Summon Rookery Whelp
  // Stadium summons (0 static)
  chromaticWhelp: 10442,
  chromaticDragonspawn: 10447,
  blackhandDragonHandler: 10742,
  // Beast post-death flavor (spell 16710 miscValue)
  finkle: 10776,
  // Optional T0.5 — survey creature; may be absent from creatures bake.
  valthalak: 16042,
} as const;

/** Flags for UBRS event DSL. */
export const UBRS_FLAGS = {
  /** Seal of Ascension used at upper door (areatrigger 2046 / Dragonspine Door). */
  upperDoor: 'ubrs-upper-door',
  /** Aggregate TYPE_ROOM_EVENT DONE (all room runes clear). Cite: instance_blackrock_spire.cpp:384-385. */
  runeRooms: 'ubrs-rune-rooms',
  /** Blackrock Altar used (Emberseer ritual). */
  emberseerAltar: 'ubrs-emberseer-altar',
  /** TYPE_EMBERSEER DONE — opens GO_EMBERSEER_OUT 175153. Cite: cpp:232-235. */
  emberseerDone: 'ubrs-emberseer-done',
  /** Father Flame used (rookery start). */
  fatherFlame: 'ubrs-father-flame',
  /** Stadium fully cleared (Gyth + Rend). */
  stadiumDone: 'ubrs-stadium-done',
  /** General Drakkisath dead. */
  drakkisathDone: 'ubrs-drakkisath-done',
  /** Optional Lord Valthalak brazier used. */
  valthalak: 'ubrs-valthalak',
} as const;

/** Per-room TYPE_ROOM_EVENT flag. Cite: blackrock_spire.h:56-62 GO_ROOM_*_RUNE. */
export function ubrsRuneRoomFlag(goEntry: number): string {
  return `ubrs-rune-room:${goEntry}`;
}

/** Seal of Ascension entry gate - survey areatrigger 2046 + item 12344; GO 164725. */
export const UBRS_SEAL_GATE = {
  goEntry: 164725, // Dragonspine Door
  requiredItem: 12344, // Seal of Ascension
} as const;

/** TYPE_ROOM_EVENT room runes. Cite: blackrock_spire.h:56-62. */
export const UBRS_ROOM_RUNES: readonly number[] = [
  175194, 175195, 175196, 175197, 175198, 175199, 175200,
];

// Pyroguard Emberseer altar plus the Growing ramp: the altar objectGate delays attackability until
// 20 stacks of 16048. Residual: the type-18 three-player channel, since the product is solo.
export const UBRS_EMBERSEER = {
  goEntry: 175706, // Blackrock Altar
  growSpellId: 16048,
  growTickMs: 3_000,
  maxGrowingStacks: 20,
  /** Full grow before attackable — spell-data 16048 durationMs (= 20 × 3000). */
  growFullMs: 60_000,
  incarceratorEntry: 10316,
  incarceratorCount: 7,
  /** Pyroguard Emberseer himself. Cite: blackrock_spire.h:23 NPC_PYROGUARD_EMBERSEER. */
  bossEntry: 9816,
  /** creature guid 2290394. He stands here before the altar; the grow is not a spawn. */
  spawn: { x: 144.59, y: -258.05, z: 96.5 },
  spawnGuid: 2290394,
} as const;

// Incarcerators and Emberseer are immune until the altar and Growing finish. `undefined` means the
// body is not this event's, so the caller keeps template hostility.
export function ubrsEventHostile(
  entry: number,
  altarUsed: boolean,
  grown: boolean,
): boolean | undefined {
  if (entry === UBRS_EMBERSEER.incarceratorEntry) return altarUsed;
  if (entry === UBRS_EMBERSEER.bossEntry) return grown;
  return undefined;
}

// Sort radius for TYPE_ROOM_EVENT mobs around each room rune. Cite: instance_blackrock_spire.cpp:351
// GetDistance < 10.0f.
export const UBRS_ROOM_EVENT_RADIUS_YD = 10;

// Lord Valthalak optional T0.5 (TYPE_VALTHALAK): GO 181050, item 22056, trigger 16048, NPC 16042.
// 16042 may be absent from the bake; the survey id is still wired.
export const UBRS_VALTHALAK = {
  encId: 'lord-valthalak',
  goEntry: 181050, // Lord Valthalak Brazier Spell Focus
  requiredItem: 22056, // Brazier of Beckoning
  triggerEntry: 16048,
  bossEntry: 16042,
  /** Trigger spawn — dungeonSpawns map 229 guid 2290600. */
  spawn: { x: 44.71, y: -536.049, z: 110.936 },
} as const;

/** Altar GO entry alias (objectGate / pins). */
export const UBRS_EMBERSEER_ALTAR = {
  goEntry: UBRS_EMBERSEER.goEntry,
} as const;

/** Father Flame rookery trigger - survey GO 175245. */
export const UBRS_FATHER_FLAME = {
  goEntry: 175245, // Father Flame
} as const;

// Solakar / Father Flame timers (TYPE_FLAMEWREATH): 30 s after waves 0–3, 40 s after 4–5, then
// Solakar. A pure from-call schedule that does not wait for a clear. Cite: :701-706.
export const UBRS_SOLAKAR = {
  goEntry: 175245,
  /** Spawn pos — instance_blackrock_spire.cpp:99 rookeryEventSpawnPos. */
  spawn: { x: 51.11098, y: -266.0549, z: 92.87846 },
  waveGapEarlyMs: 30_000,
  waveGapLateMs: 40_000,
  /** calledIdx 0–3 use early; 4–5 use late (before Solakar wave). */
  earlyWaveCount: 4,
} as const;

// Rookery egg → whelp while Hatchers live: first disturb after urand(8000,10000), 2 s at the egg,
// next after urand(7500,10000), nearest unused egg within 20 yd, one whelp per egg.
export const UBRS_ROOKERY_EGGS = {
  eggGoEntry: 175124,
  whelpEntry: ENTRY.rookeryWhelp,
  hatcherEntry: ENTRY.rookeryHatcher,
  disturbSpellId: 15_746,
  searchRangeYd: 20,
  /** cpp:923 min bound. */
  firstDisturbMinMs: 8_000,
  /** cpp:923 max bound. */
  firstDisturbMaxMs: 10_000,
  /** cpp:936 wait after arriving at egg before cast. */
  waitAtEggMs: 2_000,
  /** cpp:939 min bound. */
  nextDisturbMinMs: 7_500,
  /** cpp:939 max bound. */
  nextDisturbMaxMs: 10_000,
  // First whelp after a hatcher wave call — min disturb + wait at egg (walk omitted; no invented path
  // time).
  firstHatchAfterCallMs: 8_000 + 2_000,
  /** Subsequent hatch gap — min next disturb (walk omitted). */
  nextHatchMs: 7_500,
} as const;

// Absolute ms for the Nth egg hatch (0-based) after hatchers first appear. Cite: UBRS_ROOKERY_EGGS
// firstHatchAfterCallMs / nextHatchMs.
export function rookeryHatchAtMs(hatcherPresentSinceMs: number, hatchIndex: number): number {
  if (hatchIndex <= 0) {
    return hatcherPresentSinceMs + UBRS_ROOKERY_EGGS.firstHatchAfterCallMs;
  }
  return (
    hatcherPresentSinceMs
    + UBRS_ROOKERY_EGGS.firstHatchAfterCallMs
    + hatchIndex * UBRS_ROOKERY_EGGS.nextHatchMs
  );
}

// The Beast intro elites plus Finkle Einhorn: 3× 10317 fight as the Beast pack, and Finkle appears
// as a friendly body after the Beast dies. Cite: blackrock_spire.h:93-98; cpp:827-841, :488-491.
export const UBRS_BEAST = {
  beastEntry: ENTRY.beast,
  introEliteEntry: ENTRY.blackhandElite,
  introEliteCount: 3,
  /** aBeastLocs — blackrock_spire.h:93-98. */
  introLocs: [
    { x: 98.09, y: -563.45, z: 109.86 },
    { x: 99.81, y: -561.47, z: 109.24 },
    { x: 96.92, y: -560.98, z: 110.18 },
  ] as const,
  finkleEntry: ENTRY.finkle,
  finkleSpellId: 16_710,
} as const;

/** Cite: instance_blackrock_spire.cpp:488-491 — Finkle only after Beast death/despawn. */
export function finkleMaySpawn(beastDead: boolean): boolean {
  return beastDead;
}

// Cite: instance_blackrock_spire.cpp StartflamewreathEventIfCan :774-778 — refuse Father Flame when
// TYPE_DRAKKISATH == DONE.
export function solakarStartBlockedByDrakkisath(flags: readonly string[]): boolean {
  return flags.includes(UBRS_FLAGS.drakkisathDone);
}

// One Flamewreath add slot: waveIndex 0 is always a Hatcher and 1–5 are 50/50. `roll` in [0,1) —
// under 0.5 is Hatcher, at or above is Guardian. Cite: instance_blackrock_spire.cpp:691.
export function solakarAddEntry(waveIndex: number, roll: number): number {
  if (waveIndex <= 0) return ENTRY.rookeryHatcher;
  return roll < 0.5 ? ENTRY.rookeryHatcher : ENTRY.rookeryGuardian;
}

// Collapse two add entries into pack rows (order: Hatcher then Guardian when mixed). Cite:
// DoSendNextFlamewreathWave two SummonCreature per wave :686-697.
export function solakarWavePack(
  waveIndex: number,
  rolls: readonly [number, number],
): { creatureEntry: number; count: number }[] {
  if (waveIndex >= 6) return [{ creatureEntry: ENTRY.solakar, count: 1 }];
  const a = solakarAddEntry(waveIndex, rolls[0]!);
  const b = solakarAddEntry(waveIndex, rolls[1]!);
  if (a === b) return [{ creatureEntry: a, count: 2 }];
  // Stable order for kill-supply / floor flatten: Hatcher then Guardian.
  const first = a === ENTRY.rookeryHatcher ? a : b;
  const second = first === a ? b : a;
  return [
    { creatureEntry: first, count: 1 },
    { creatureEntry: second, count: 1 },
  ];
}

// Roll full Flamewreath waves (6 add waves + Solakar) from seeded rng in [0,1); wave 0 is always
// 2× Hatcher. Cite: instance_blackrock_spire.cpp:683-716.
export function materializeSolakarFlamewreathEncounter(
  enc: EncounterDef,
  rng: () => number,
): EncounterDef {
  if (enc.id !== 'solakar-flamewreath') return enc;
  const waves: { pack: { creatureEntry: number; count: number }[] }[] = [];
  for (let i = 0; i < 6; i++) {
    waves.push({ pack: solakarWavePack(i, [rng(), rng()]) });
  }
  waves.push({ pack: [{ creatureEntry: ENTRY.solakar, count: 1 }] });
  return {
    ...enc,
    events: (enc.events ?? []).map((ev) =>
      (ev.kind === 'waves' ? { kind: 'waves' as const, waves } : ev),
    ),
  };
}

// Solakar / Father Flame waves (TYPE_FLAMEWREATH): wave 1 is 2× 10683 and waves 2–6 hold the
// expected 1+1 mix, with the true 50/50 coming from materializeSolakarFlamewreathEncounter.
export const UBRS_SOLAKAR_WAVES = [
  { pack: [{ creatureEntry: ENTRY.rookeryHatcher, count: 2 }] },
  {
    pack: [
      { creatureEntry: ENTRY.rookeryHatcher, count: 1 },
      { creatureEntry: ENTRY.rookeryGuardian, count: 1 },
    ],
  },
  {
    pack: [
      { creatureEntry: ENTRY.rookeryHatcher, count: 1 },
      { creatureEntry: ENTRY.rookeryGuardian, count: 1 },
    ],
  },
  {
    pack: [
      { creatureEntry: ENTRY.rookeryHatcher, count: 1 },
      { creatureEntry: ENTRY.rookeryGuardian, count: 1 },
    ],
  },
  {
    pack: [
      { creatureEntry: ENTRY.rookeryHatcher, count: 1 },
      { creatureEntry: ENTRY.rookeryGuardian, count: 1 },
    ],
  },
  {
    pack: [
      { creatureEntry: ENTRY.rookeryHatcher, count: 1 },
      { creatureEntry: ENTRY.rookeryGuardian, count: 1 },
    ],
  },
  { pack: [{ creatureEntry: ENTRY.solakar, count: 1 }] },
] as const;

// Stadium wave table (blackrock_spire.h aStadiumEventNpcs) - survey exact counts. Totals: 17×10442 +
// 9×10447 + 5×10742 = 31, then Gyth (Rend via boss_gyth ScriptDev).
export const UBRS_STADIUM_ADD_WAVES = [
  {
    pack: [
      { creatureEntry: ENTRY.chromaticWhelp, count: 3 },
      { creatureEntry: ENTRY.chromaticDragonspawn, count: 1 },
    ],
  },
  {
    pack: [
      { creatureEntry: ENTRY.chromaticWhelp, count: 3 },
      { creatureEntry: ENTRY.chromaticDragonspawn, count: 1 },
    ],
  },
  {
    pack: [
      { creatureEntry: ENTRY.chromaticWhelp, count: 2 },
      { creatureEntry: ENTRY.chromaticDragonspawn, count: 1 },
      { creatureEntry: ENTRY.blackhandDragonHandler, count: 1 },
    ],
  },
  {
    pack: [
      { creatureEntry: ENTRY.chromaticWhelp, count: 2 },
      { creatureEntry: ENTRY.chromaticDragonspawn, count: 1 },
      { creatureEntry: ENTRY.blackhandDragonHandler, count: 1 },
    ],
  },
  {
    pack: [
      { creatureEntry: ENTRY.chromaticWhelp, count: 3 },
      { creatureEntry: ENTRY.chromaticDragonspawn, count: 1 },
      { creatureEntry: ENTRY.blackhandDragonHandler, count: 1 },
    ],
  },
  {
    pack: [
      { creatureEntry: ENTRY.chromaticWhelp, count: 2 },
      { creatureEntry: ENTRY.chromaticDragonspawn, count: 2 },
      { creatureEntry: ENTRY.blackhandDragonHandler, count: 1 },
    ],
  },
  {
    pack: [
      { creatureEntry: ENTRY.chromaticWhelp, count: 2 },
      { creatureEntry: ENTRY.chromaticDragonspawn, count: 2 },
      { creatureEntry: ENTRY.blackhandDragonHandler, count: 1 },
    ],
  },
] as const;

// Full stadium encounter waves: 7 add waves then Gyth alone. The former concurrent Gyth+Rend wave
// is RETIRED — boss_gyth ScriptDev owns the <11% Rend inject, and both live double-fires him.
export const UBRS_STADIUM_WAVES = [
  ...UBRS_STADIUM_ADD_WAVES,
  { pack: [{ creatureEntry: ENTRY.gyth, count: 1 }] },
] as const;

// Stadium wave pacing — clear-OR-60s hybrid with overlap: 60 s after each add wave, or immediately
// when the wave is dead. The timer stops after the last add, and Gyth starts on clear only.
export const UBRS_STADIUM = {
  /** Inter-add-wave release — instance_blackrock_spire.cpp:672. */
  waveOrClearMs: 60_000,
  /** Add waves before Gyth (MAX_STADIUM_WAVES). */
  addWaveCount: 7,
  /** Wave summon pos — blackrock_spire.h aStadiumLocs[0]. */
  waveSpawn: { x: 210.00, y: -420.30, z: 110.94 },
  /** Gyth summon pos — blackrock_spire.h aStadiumLocs[1]. */
  gythSpawn: { x: 210.14, y: -397.54, z: 111.1 },
  /** Arena centre — blackrock_spire.h aStadiumLocs[2]. The fight is here, not the tunnel. */
  centre: { x: 163.62, y: -420.33, z: 110.47 },
  // TYPE_STADIUM start. Cite: AreaTrigger.dbc id=2026 (map 229, r=20); instance_blackrock_spire.cpp
  // :32, :808-823. Not aStadiumLocs[2] — a 50 yd circle around the centre arms a south-edge drop.
  at2026: { x: 153.763, y: -419.833, z: 110.472, radius: 20 },
  // Rend/Nefarius balcony — aStadiumLocs[4], on-mesh at z 121.97 (the arena-floor z at this xy
  // snaps to the balcony). 25 yd planar from AT 2026, and |dz| 11.5 so sameStoreyAsParty is false.
  southDrop: { x: 161.01, y: -443.73, z: 121.97 },
  // Eastern landing before the stadium rim. GO 153464 guid 2290419. trashbot.md: ramps on the Eastern side,
  // then drop at the southern edge.
  eastRamp: { x: 183.647, y: -369.15, z: 117.143 },
} as const;

/** Summon-only / event-temp entries - never pure static trash packs. */
export const UBRS_SUMMON_ONLY_ENTRIES = new Set<number>([
  ENTRY.solakar, // 10264
  ENTRY.gyth, // 10339
  ENTRY.rend, // 10429
  ENTRY.rookeryHatcher, // 10683
  ENTRY.rookeryGuardian, // 10258
  ENTRY.rookeryWhelp, // 10161
  ENTRY.chromaticWhelp, // 10442
  ENTRY.chromaticDragonspawn, // 10447
  ENTRY.blackhandDragonHandler, // 10742
  ENTRY.finkle, // 10776 — post-Beast flavor, not trash
]);

/** Friendlies / service / LBRS / technical - never in UBRS combat graph. */
export const UBRS_EXCLUDED_ENTRIES = new Set<number>([
  // Friendlies / service
  10740, // Awbee
  10257, // Bijou
  10299, // Scarshield Infiltrator
  10799, // Warosh
  15560, // Elder Stonefort (Lunar Festival)
  16044, // Mor Grayhoof Trigger
  16048, // Lord Valthalak Trigger
  // LBRS bosses
  9196, // Omokk
  9236, // Vosh
  9237, // Voone
  10596, // Smolderweb
  10584, // Urok
  9736, // Zigris
  10220, // Halycon
  10268, // Gizrul
  9568, // Wyrmthalak
  // LBRS trash families (sample / name lists)
  9045, // Scarshield Acolyte
  9097, // Scarshield Legionnaire
  9199, // Spirestone Enforcer
  9267, // Smolderthorn Axe Thrower
  9259, // Firebrand Grunt
  9692, // Bloodaxe Raider
  10374, // Spire Spider
  10162, // Nefarius (cosmetic stadium)
  ENTRY.finkle, // Finkle Einhorn (Beast corpse flavor — not combat graph)
  // Valthalak 16042 is optional boss (not pure-static trash); spine-owned.
]);

// UBRS-completable survey quests, upper wing only. Multi-zone T0.5 chains and the Lunar Festival
// quest are excluded. Cite: docs/dungeons/survey/16-blackrock-spire.md.
export const UBRS_QUESTS = [
  4764, // Doomrigger's Clasp - GO in UBRS
  4768, // The Darkstone Tablet - GO in UBRS
  5089, // General Drakkisath's Command - chain into Demise (item from Wyrmthalak)
  5102, // General Drakkisath's Demise - kill Drakkisath
  6502, // Drakefire Amulet - Blood of the Black Dragon Champion (Drakkisath)
  6602, // Blood of the Black Dragon Champion (H)
  6821, // Eye of the Emberseer
  7761, // Blackhand's Command - ends at Drakkisath's Brand GO
] as const;

/** Rounded static pack targets used by this graph (for tests / docs). */
export const UBRS_STATIC = { ...STATIC } as const;

// Boss spells: creature.spells from bake (game-data) - no invented ids.
// Solakar 10264, Gyth 10339, Rend 10429 present in bake; summon-only with spells ok.
const BOSS_SPELLS = {
  emberseer: [16079, 16536],
  jed: [15749, 11972, 14516],
  goraluk: [6253, 16172, 15580],
  solakar: [16727, 16556],
  gyth: [20667, 20712, 18763],
  rend: [20691, 15589, 23931, 8269, 13736, 15708, 15284],
  beast: [16636, 16144, 16788, 16785, 15506, 14100, 20477],
  drakkisath: [23462, 20691, 23023, 23931, 16789, 12097, 16805, 15548, 16419, 15284],
} as const;

/** Bake-sourced boss spell lists (for tests). */
export const UBRS_BOSS_SPELLS = { ...BOSS_SPELLS } as const;

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
  pack?: { creatureEntry: number; count: number }[],
): EncounterDef {
  const enc: EncounterDef = {
    id,
    name,
    kind: 'boss',
    creatureEntry,
  };
  if (bossSpells.length) enc.bossSpells = [...bossSpells];
  if (pack && pack.length) enc.pack = pack;
  if (intro) enc.intro = intro;
  if (events && events.length) enc.events = events;
  return enc;
}

function half<T>(arr: T[]): [T[], T[]] {
  const mid = Math.ceil(arr.length / 2);
  return [arr.slice(0, mid), arr.slice(mid)];
}

// Linear encounter graph in survey UBRS boss order: seal entry → rune rooms → Emberseer →
// Jed/Goraluk → rookery → Solakar → stadium → Gyth/Rend → Beast → Drakkisath.
function buildHandSpine(): EncounterDef[] {
  // Rune rooms / entry Blackhand
  const dreadweavers = trashFromCensus(
    'blackhand-dreadweaver',
    'Blackhand Dreadweaver',
    ENTRY.blackhandDreadweaver,
    STATIC.blackhandDreadweaver,
  );
  const summoners = trashFromCensus(
    'blackhand-summoner',
    'Blackhand Summoner',
    ENTRY.blackhandSummoner,
    STATIC.blackhandSummoner,
  );
  const veterans = trashFromCensus(
    'blackhand-veteran',
    'Blackhand Veteran',
    ENTRY.blackhandVeteran,
    STATIC.blackhandVeteran,
  );
  const assassins = trashFromCensus(
    'blackhand-assassin',
    'Blackhand Assassin',
    ENTRY.blackhandAssassin,
    STATIC.blackhandAssassin,
  );
  const elites = trashFromCensus(
    'blackhand-elite',
    'Blackhand Elite',
    ENTRY.blackhandElite,
    STATIC.blackhandElite,
  );
  const ironGuards = trashFromCensus(
    'blackhand-iron-guard',
    'Blackhand Iron Guard',
    ENTRY.blackhandIronGuard,
    STATIC.blackhandIronGuard,
  );
  const thugs = trashFromCensus(
    'blackhand-thug',
    'Blackhand Thug',
    ENTRY.blackhandThug,
    STATIC.blackhandThug,
  );

  // Rookery / stadium Rage Talon
  const dragonspawn = trashFromCensus(
    'rage-talon-dragonspawn',
    'Rage Talon Dragonspawn',
    ENTRY.rageTalonDragonspawn,
    STATIC.rageTalonDragonspawn,
  );
  const flamescales = trashFromCensus(
    'rage-talon-flamescale',
    'Rage Talon Flamescale',
    ENTRY.rageTalonFlamescale,
    STATIC.rageTalonFlamescale,
  );
  const dragonGuards = trashFromCensus(
    'rage-talon-dragon-guard',
    'Rage Talon Dragon Guard',
    ENTRY.rageTalonDragonGuard,
    STATIC.rageTalonDragonGuard,
  );
  const fireTongues = trashFromCensus(
    'rage-talon-fire-tongue',
    'Rage Talon Fire Tongue',
    ENTRY.rageTalonFireTongue,
    STATIC.rageTalonFireTongue,
  );
  const captains = trashFromCensus(
    'rage-talon-captain',
    'Rage Talon Captain',
    ENTRY.rageTalonCaptain,
    STATIC.rageTalonCaptain,
  );

  const [summonerPre, summonerPost] = half(summoners);
  const [vetPre, vetPost] = half(veterans);
  const [dreadPre, dreadPost] = half(dreadweavers);
  const [elitePre, elitePost] = half(elites);
  const [ironPre, ironPost] = half(ironGuards);
  const [dsPre, dsPost] = half(dragonspawn);
  const [flamePre, flamePost] = half(flamescales);

  const out: EncounterDef[] = [];

  // --- Seal of Ascension entry (areatrigger 2046 + item 12344) ---
  // objectGate on first entry trash; subsequent path requires flag.
  const firstEntry = dreadPre[0];
  if (firstEntry) {
    out.push({
      ...firstEntry,
      id: 'ubrs-seal-entry',
      name: 'Seal of Ascension Gate',
      events: [
        {
          kind: 'objectGate',
          goEntry: UBRS_SEAL_GATE.goEntry,
          requiredItem: UBRS_SEAL_GATE.requiredItem,
          setsFlag: UBRS_FLAGS.upperDoor,
          once: true,
        },
        { kind: 'requiresFlag', flag: UBRS_FLAGS.upperDoor },
      ],
    });
    out.push(...dreadPre.slice(1));
  } else {
    out.push(
      trashPull(
        'ubrs-seal-entry',
        'Seal of Ascension Gate',
        ENTRY.blackhandDreadweaver,
        1,
        [
          {
            kind: 'objectGate',
            goEntry: UBRS_SEAL_GATE.goEntry,
            requiredItem: UBRS_SEAL_GATE.requiredItem,
            setsFlag: UBRS_FLAGS.upperDoor,
            once: true,
          },
          { kind: 'requiresFlag', flag: UBRS_FLAGS.upperDoor },
        ],
      ),
    );
  }

  // Rune rooms (TYPE_ROOM_EVENT): ubrs-rune-rooms is stamped on a real cluster pack in
  // buildEncounters — the census bands here are empty, so it set the flag on nothing.
  out.push(...summonerPre, ...vetPre, ...thugs);

  // --- Pyroguard Emberseer (TYPE_EMBERSEER) ---
  // He stands from the mount UNINTERACTIBLE; the altar starts Growing and 20 stacks unseal him.
  {
    const emb = boss(
      'pyroguard-emberseer',
      'Pyroguard Emberseer',
      ENTRY.emberseer,
      BOSS_SPELLS.emberseer,
      [
        { kind: 'requiresFlag', flag: UBRS_FLAGS.upperDoor },
        { kind: 'requiresFlag', flag: UBRS_FLAGS.runeRooms },
        {
          kind: 'objectGate',
          goEntry: UBRS_EMBERSEER.goEntry,
          setsFlag: UBRS_FLAGS.emberseerAltar,
          once: true,
        },
        { kind: 'requiresFlag', flag: UBRS_FLAGS.emberseerAltar },
        { kind: 'setsFlag', flag: UBRS_FLAGS.emberseerDone },
      ],
      'Use the Blackrock Altar. Pyroguard Emberseer grows for 60s, then becomes attackable. The seven Incarcerators break their chant when the altar is used.',
    );
    // creature guid 2290394 — he stands here from mount (cpp Reset UNINTERACTIBLE).
    emb.origin = { ...UBRS_EMBERSEER.spawn };
    out.push(emb);
  }

  // --- Rookery (same floor as Binding). Solakar skippable — trashbot.md / TYPE_FLAMEWREATH. ---
  out.push(...dsPre, ...flamePre, ...dragonGuards.slice(0, Math.ceil(dragonGuards.length / 2)));
  {
    const sol = boss(
      'solakar-flamewreath',
      'Solakar Flamewreath',
      ENTRY.solakar,
      BOSS_SPELLS.solakar,
      [
        {
          kind: 'objectGate',
          goEntry: UBRS_FATHER_FLAME.goEntry,
          setsFlag: UBRS_FLAGS.fatherFlame,
          once: true,
        },
        { kind: 'requiresFlag', flag: UBRS_FLAGS.fatherFlame },
        {
          kind: 'waves',
          waves: UBRS_SOLAKAR_WAVES.map((w) => ({
            pack: w.pack.map((p) => ({ creatureEntry: p.creatureEntry, count: p.count })),
          })),
        },
      ],
      'Father Flame awakens the rookery. Hatchers disturb eggs into whelps on a timer; Hatchers and Guardians pour on a 30s/40s schedule - then Solakar. Locked out if Drakkisath is already dead.',
    );
    sol.origin = { ...UBRS_SOLAKAR.spawn };
    sol.optional = true;
    out.push(sol);
  }

  // --- Hall of Blackhand (up the shaft): Jed optional, then Goraluk ---
  out.push(
    ...summonerPost,
    ...vetPost,
    ...dreadPost.slice(0, Math.ceil(dreadPost.length / 2)),
    ...assassins.slice(0, Math.ceil(assassins.length / 2)),
    ...elitePre,
    ...ironPre,
  );
  out.push({
    ...boss(
      'jed-runewatcher',
      'Jed Runewatcher',
      ENTRY.jed,
      BOSS_SPELLS.jed,
      undefined,
      'Jed Runewatcher, a rare Blackhand elite, watches the rune halls.',
    ),
    optional: true,
  });
  out.push(
    ...assassins.slice(Math.ceil(assassins.length / 2)),
    ...dreadPost.slice(Math.ceil(dreadPost.length / 2)),
  );
  out.push(
    boss(
      'goraluk-anvilcrack',
      'Goraluk Anvilcrack',
      ENTRY.goraluk,
      BOSS_SPELLS.goraluk,
      undefined,
      'Goraluk Anvilcrack forges weapons for the Blackhand orcs of the upper spire.',
    ),
  );

  // --- Stadium approach ---
  out.push(
    ...dsPost,
    ...flamePost,
    ...dragonGuards.slice(Math.ceil(dragonGuards.length / 2)),
    ...fireTongues,
    ...captains,
    ...elitePost.slice(0, Math.ceil(elitePost.length / 2)),
    ...ironPost.slice(0, Math.ceil(ironPost.length / 2)),
  );

  // Stadium - TYPE_STADIUM: 7 add waves clear-OR-60s + Gyth on last-add clear;
  // ScriptDev owns <11% Rend mid-fight inject
  {
    const gyth = boss(
      'gyth-rend',
      'Gyth & Warchief Rend Blackhand',
      ENTRY.gyth,
      BOSS_SPELLS.gyth,
      [
        {
          kind: 'waves',
          waves: UBRS_STADIUM_WAVES.map((w) => ({
            pack: w.pack.map((p) => ({ creatureEntry: p.creatureEntry, count: p.count })),
          })),
        },
        { kind: 'setsFlag', flag: UBRS_FLAGS.stadiumDone },
      ],
      'The Stadium: chromatic waves on a clear-or-60s clock, then Gyth. ScriptDev owns <50% Chromatic Chaos and <11% Summon Rend mid-fight inject (SESSION 10).',
    );
    // aStadiumLocs[2] — spawn is the tunnel; seedRouteFromPlan drops a boss with no origin.
    gyth.origin = { ...UBRS_STADIUM.centre };
    out.push(gyth);
  }

  // --- Beast approach ---
  out.push(
    ...elitePost.slice(Math.ceil(elitePost.length / 2)),
    ...ironPost.slice(Math.ceil(ironPost.length / 2)),
  );

  // Beast: 3× Blackhand Elite intro pack (aBeastLocs); Finkle 10776 after death (controller).
  out.push(
    boss(
      'the-beast',
      'The Beast',
      ENTRY.beast,
      BOSS_SPELLS.beast,
      undefined,
      'Three Blackhand Elites flee into the Furnace as you enter - then The Beast. When the Beast falls, Finkle Einhorn climbs out of the corpse.',
      [{ creatureEntry: UBRS_BEAST.introEliteEntry, count: UBRS_BEAST.introEliteCount }],
    ),
  );

  // Optional T0.5 Brazier of Beckoning, and it belongs HERE: Valthalak's focus is 45 yd from The
  // Beast in The Furnace, while Drakkisath is 250 yd up — listing him last cost 477 yd.
  {
    const val = boss(
      UBRS_VALTHALAK.encId,
      'Lord Valthalak',
      UBRS_VALTHALAK.bossEntry,
      [],
      [
        {
          kind: 'objectGate',
          goEntry: UBRS_VALTHALAK.goEntry,
          requiredItem: UBRS_VALTHALAK.requiredItem,
          setsFlag: UBRS_FLAGS.valthalak,
          once: true,
        },
        { kind: 'requiresFlag', flag: UBRS_FLAGS.valthalak },
      ],
      "The Brazier of Beckoning at Lord Valthalak's focus summons the spectral warlord (optional T0.5).",
    );
    val.origin = { ...UBRS_VALTHALAK.spawn };
    val.optional = true; // Summon (T0.5 Brazier); isComplete ignores optional.
    out.push(val);
  }

  // --- Drakkisath finale (after Solakar) ---
  out.push(
    boss(
      'general-drakkisath',
      'General Drakkisath',
      ENTRY.drakkisath,
      BOSS_SPELLS.drakkisath,
      [{ kind: 'setsFlag', flag: UBRS_FLAGS.drakkisathDone }],
      'General Drakkisath commands the chromatic elite of the upper citadel. Two Chromatic Elite Guards stand with him.',
      [{ creatureEntry: ENTRY.chromaticEliteGuard, count: UBRS_CHROMATIC_GUARD_COUNT }],
    ),
  );

  return out;
}

// TYPE_ROOM_EVENT: sort Summoner/Veteran packs within 10 yd of each of the seven room runes, pull
// them before Emberseer, and stamp a per-room setsFlag. Cite: instance_blackrock_spire.cpp:339-386.
export function stampUbrsRoomEvent(encs: EncounterDef[]): EncounterDef[] {
  const gate0 = encs.findIndex((e) => e.id === 'pyroguard-emberseer');
  if (gate0 < 0) return encs;
  const members = clusterMemberByGuid(229);
  const runes = dungeonGameObjectsForMap(229).filter((g) =>
    UBRS_ROOM_RUNES.includes(g.entry),
  );
  if (!runes.length) return encs;

  const pools = loadPoolGuidCandidates(229);
  // cpp:351 is GetDistance(pRune) < 10.0f — 3-D. The 2-D hypot this used to run has a measured
  // class size of ZERO here, but the source's own metric is the one to port.
  const isRoomMob = (
    m: { entry: number; x: number; y: number; z?: number },
    rune: { x: number; y: number; z?: number },
  ) =>
    (m.entry === ENTRY.blackhandSummoner || m.entry === ENTRY.blackhandVeteran)
    && Math.hypot(m.x - rune.x, m.y - rune.y, (m.z ?? 0) - (rune.z ?? 0))
      < UBRS_ROOM_EVENT_RADIUS_YD;

  // Each room's door opens when THAT room's sorted list empties, so a room's mobs have to be ONE
  // pull: 2 of 7 runes had theirs split across two packs, and those doors opened with a mob alive.
  const runeOfGuid = new Map<number, number>();
  for (let ri = 0; ri < runes.length; ri++) {
    for (const [guid, m] of members) {
      if (!runeOfGuid.has(guid) && isRoomMob(m, runes[ri]!)) runeOfGuid.set(guid, ri);
    }
  }
  if (!runeOfGuid.size) return encs;

  // Strip the room mobs out of every trash pull before Emberseer; the remainder keeps the
  // clusterer's pack and its events. No body is added or dropped.
  const perRune: { guids: number[]; base: EncounterDef | null }[] =
    runes.map(() => ({ guids: [], base: null }));
  const out: EncounterDef[] = [];
  for (const e of encs) {
    const guids = e.spawnGuids ?? [];
    // Every trash pull, not just those before Emberseer: the clusterer's order is not route
    // order, so a room's mobs can sit behind him and the extracted pull is re-placed below.
    if (e.kind !== 'trash' || !guids.length) {
      out.push(e);
      continue;
    }
    const take = guids.filter((g) => runeOfGuid.has(g));
    if (!take.length) {
      out.push(e);
      continue;
    }
    for (const g of take) {
      const slot = perRune[runeOfGuid.get(g)!]!;
      slot.guids.push(g);
      slot.base ??= e;
    }
    const rest = guids.filter((g) => !runeOfGuid.has(g));
    if (rest.length) {
      out.push(repackFromGuids(e, rest, members, {
        events: e.events ? [...e.events] : undefined,
        pools,
      }));
    }
  }

  // One flagged pull per rune, seeded on the rune's own storey.
  const roomFlags: string[] = [];
  const runePulls: EncounterDef[] = [];
  for (let ri = 0; ri < runes.length; ri++) {
    const slot = perRune[ri]!;
    if (!slot.guids.length || !slot.base) continue;
    const rune = runes[ri]!;
    const flag = ubrsRuneRoomFlag(rune.entry);
    roomFlags.push(flag);
    runePulls.push(repackFromGuids(slot.base, slot.guids, members, {
      id: `ubrs-rune-room-${rune.entry}`,
      name: `${rune.name ?? 'Room'} guards`,
      events: [{ kind: 'setsFlag', flag }],
      pools,
    }));
  }
  if (!runePulls.length) return encs;

  const gIdx = out.findIndex((e) => e.id === 'pyroguard-emberseer');
  if (gIdx < 0) return encs;
  out.splice(gIdx, 0, ...runePulls);

// The aggregate TYPE_ROOM_EVENT DONE flag is NOT stamped on a pack: on the last room pack in route
// order it granted "all rooms clear" alone. The live floor derives it from all seven room flags.

  // Emberseer requires every room flag + aggregate (all must clear). Re-find him: the splice
  // above inserted the rune pulls ahead of him, so gIdx is stale by runePulls.length.
  const embIdx = out.findIndex((e) => e.id === 'pyroguard-emberseer');
  if (roomFlags.length && embIdx >= 0) {
    const emb = out[embIdx]!;
    const events = (emb.events ?? []).filter(
      (ev) =>
        !(
          ev.kind === 'requiresFlag'
          && (ev.flag === UBRS_FLAGS.runeRooms || ev.flag.startsWith('ubrs-rune-room:'))
        ),
    );
    for (const flag of roomFlags) {
      events.push({ kind: 'requiresFlag', flag });
    }
    // NOT the aggregate. Requiring `ubrs-rune-rooms` while nothing in the graph SETS it is an
    // unsourced gate the repo's own audit counts as a soft-lock. The seven per-room flags are it.
    out[embIdx] = { ...emb, events };
  }

  return out;
}

/** True when all stamped room-rune flags (and aggregate) are present. */
export function ubrsRoomEventDone(flags: readonly string[]): boolean {
  return flags.includes(UBRS_FLAGS.runeRooms);
}

// One drawable state pad for the TYPE_ROOM_EVENT mechanic: `lit` is the live rune, which stands
// until the last mob within 10 yd dies. Seven pads the run tracked as flags and never drew.
export type UbrsRoomPad = {
  goEntry: number;
  guid: number;
  name: string;
  x: number;
  y: number;
  z?: number;
  displayId?: number;
  /** Rune still burning / door still shut. */
  lit: boolean;
  /** `rune` for the seven room runes, `door` for Emberseer In. */
  kind: 'rune' | 'door';
  /** Room ordinal 1-7 from the GO name ("Room 3 Rune"), 0 for the door. */
  room: number;
};

/** Emberseer In — the door the seven runes open. Cite: blackrock_spire.h:37. */
export const UBRS_EMBERSEER_IN_GO = 175244;
/** Emberseer Out — TYPE_EMBERSEER DONE. Cite: blackrock_spire.h:39; cpp:232-235. */
export const UBRS_EMBERSEER_OUT_GO = 175153;
/** Gyth exit — TYPE_STADIUM DONE. Cite: blackrock_spire.h:43; cpp:143-146,265. */
export const UBRS_GYTH_EXIT_GO = 175186;

/** Progress doors that start shut. Combat toggles (175705/164726/175185) stay off this list. */
export const UBRS_PROGRESS_DOORS: readonly number[] = [
  UBRS_SEAL_GATE.goEntry,
  UBRS_EMBERSEER_IN_GO,
  UBRS_EMBERSEER_OUT_GO,
  UBRS_GYTH_EXIT_GO,
];

// ScriptDev door open-state from run flags. Cite: instance_blackrock_spire.cpp:127-146 OnObjectCreate,
// :205-265 SetData.
export function ubrsGoOpen(goEntry: number, flags: readonly string[]): boolean {
  if (goEntry === UBRS_SEAL_GATE.goEntry) return flags.includes(UBRS_FLAGS.upperDoor);
  if (goEntry === UBRS_EMBERSEER_IN_GO) return flags.includes(UBRS_FLAGS.runeRooms);
  if (goEntry === UBRS_EMBERSEER_OUT_GO) return flags.includes(UBRS_FLAGS.emberseerDone);
  if (goEntry === UBRS_GYTH_EXIT_GO) return flags.includes(UBRS_FLAGS.stadiumDone);
  return false;
}

/** Closed progress-door spawns for navmesh stamping. */
export function ubrsClosedDoorSpawns(flags: readonly string[]): {
  x: number; y: number; z: number; o: number;
}[] {
  const out: { x: number; y: number; z: number; o: number }[] = [];
  for (const go of dungeonGameObjectsForMap(229)) {
    if (!UBRS_PROGRESS_DOORS.includes(go.entry)) continue;
    if (ubrsGoOpen(go.entry, flags)) continue;
    out.push({ x: go.x, y: go.y, z: go.z, o: go.o });
  }
  return out;
}

// The seven room runes plus Emberseer In, with live lit/out state from the run flags. Positions and display
// ids come from the gameobject bake; nothing here is authored.
export function ubrsRoomPads(flags: readonly string[]): UbrsRoomPad[] {
  const out: UbrsRoomPad[] = [];
  for (const go of dungeonGameObjectsForMap(229)) {
    const isRune = UBRS_ROOM_RUNES.includes(go.entry);
    const isDoor = go.entry === UBRS_EMBERSEER_IN_GO;
    if (!isRune && !isDoor) continue;
    const lit = isRune
      ? !flags.includes(ubrsRuneRoomFlag(go.entry))
      : !flags.includes(UBRS_FLAGS.runeRooms);
    const pad: UbrsRoomPad = {
      goEntry: go.entry,
      guid: go.guid,
      name: go.name,
      x: go.x,
      y: go.y,
      lit,
      kind: isRune ? 'rune' : 'door',
      room: isRune ? Number(/Room (\d)/.exec(go.name)?.[1] ?? 0) : 0,
    };
    if (go.z != null && Number.isFinite(go.z)) pad.z = go.z;
    if (go.displayId > 0) pad.displayId = go.displayId;
    out.push(pad);
  }
  // Runes by room ordinal, door last.
  out.sort((a, b) => (a.kind === b.kind ? a.room - b.room : a.kind === 'rune' ? -1 : 1));
  return out;
}

/** How many of the seven rooms are clear. Cite: cpp:369-385 uiNotEmptyRoomsCount. */
export function ubrsRoomsClearCount(flags: readonly string[]): number {
  return UBRS_ROOM_RUNES.filter((e) => flags.includes(ubrsRuneRoomFlag(e))).length;
}

// Standing on a Rookery Egg hatches it: GO 175124 is a TRAP, so this is the object doing its job.
// 1.5 yd because the 271 baked eggs sit a mean 1.77 yd apart, so one step takes one egg.
export const UBRS_EGG_STEP_YD = 1.5;

/** How far around a party a run draws individual eggs. 271 pins at once is a texture. */
export const UBRS_EGG_DRAW_YD = 45;

/** Extra step cost the router pays to cross an egg cell. Never a block: the eggs cover the floor. */
export const UBRS_EGG_AVOID_MUL = 6;
/** Radius the avoid stamp paints per egg. */
export const UBRS_EGG_AVOID_YD = 1.5;

/** Every baked Rookery Egg on map 229, world coords (for the nav avoid stamp). */
export function ubrsRookeryEggPoints(): { x: number; y: number; z?: number }[] {
  return dungeonGameObjectsForMap(229)
    .filter((g) => g.entry === UBRS_ROOKERY_EGGS.eggGoEntry)
    .map((g) => (g.z != null && Number.isFinite(g.z)
      ? { x: g.x, y: g.y, z: g.z }
      : { x: g.x, y: g.y }));
}

export type UbrsEggPad = {
  guid: number;
  goEntry: number;
  x: number;
  y: number;
  z?: number;
  displayId?: number;
  /** Not yet hatched. */
  intact: boolean;
};

// One storey. Cite: probe-aggro-cross-floor.mjs:20 — "One storey of Blackrock Spire is ~14 yd; 8 clears a
// ramp but not a floor."
export const UBRS_EGG_SAME_FLOOR_DZ = 8;

// Eggs near a point, hatched or not, culled by distance. z IS PART OF "NEAR": the eggs' xy box
// covers most of the dungeon, so a 2-D test reported an egg underfoot almost anywhere.
export function ubrsRookeryEggPads(
  hatched: (guid: number) => boolean,
  near: { x: number; y: number; z?: number },
  radiusYd = UBRS_EGG_DRAW_YD,
  sameFloorDz = UBRS_EGG_SAME_FLOOR_DZ,
): UbrsEggPad[] {
  const out: UbrsEggPad[] = [];
  const nz = near.z;
  const haveZ = nz != null && Number.isFinite(nz);
  for (const g of dungeonGameObjectsForMap(229)) {
    if (g.entry !== UBRS_ROOKERY_EGGS.eggGoEntry) continue;
    if (Math.hypot(g.x - near.x, g.y - near.y) > radiusYd) continue;
    // No party z (unstamped column) leaves the 2-D answer — HEIGHT_UNSTAMPED rule — but an egg
    // with no z of its own can never claim to be on your floor.
    if (haveZ) {
      if (g.z == null || !Number.isFinite(g.z)) continue;
      if (Math.abs(g.z - nz!) > sameFloorDz) continue;
    }
    const pad: UbrsEggPad = {
      guid: g.guid,
      goEntry: g.entry,
      x: g.x,
      y: g.y,
      intact: !hatched(g.guid),
    };
    if (g.z != null && Number.isFinite(g.z)) pad.z = g.z;
    if (g.displayId > 0) pad.displayId = g.displayId;
    out.push(pad);
  }
  return out;
}

// Intact eggs the party is standing on. Needs the party's z — without it this is a 2-D test over an
// xy box covering most of the dungeon, and 2 yd is all a step deserves when a floor is 14 yd.
export const UBRS_EGG_STEP_DZ = 2;
export function ubrsEggsUnderfoot(
  hatched: (guid: number) => boolean,
  party: { x: number; y: number; z?: number },
): UbrsEggPad[] {
  if (party.z == null || !Number.isFinite(party.z)) return [];
  return ubrsRookeryEggPads(hatched, party, UBRS_EGG_STEP_YD, UBRS_EGG_STEP_DZ);
}

// Nearest unused Rookery Egg within `rangeYd` of `from` (3-D). Cite: cpp:946-970
// GetGameObjectListWithEntryInGrid 20 yd, sort by distance, first without GO_FLAG_IN_USE.
export function ubrsNearestFreeEgg(
  hatched: (guid: number) => boolean,
  from: { x: number; y: number; z?: number },
  rangeYd: number = UBRS_ROOKERY_EGGS.searchRangeYd,
): UbrsEggPad | null {
  let best: UbrsEggPad | null = null;
  let bestD = rangeYd;
  const fz = from.z;
  const haveZ = fz != null && Number.isFinite(fz);
  for (const g of dungeonGameObjectsForMap(229)) {
    if (g.entry !== UBRS_ROOKERY_EGGS.eggGoEntry) continue;
    if (hatched(g.guid)) continue;
    if (g.z == null || !Number.isFinite(g.z)) continue;
    if (!haveZ) continue;
    const d = Math.hypot(g.x - from.x, g.y - from.y, g.z - fz!);
    if (!(d < bestD)) continue;
    bestD = d;
    const pad: UbrsEggPad = {
      guid: g.guid, goEntry: g.entry, x: g.x, y: g.y, z: g.z, intact: true,
    };
    if (g.displayId > 0) pad.displayId = g.displayId;
    best = pad;
  }
  return best;
}

function buildEncounters(): EncounterDef[] {
  // Hand spine = bosses + event-gated packs (mono trashFromCensus is empty).
  const spine = buildHandSpine();
  const encs = buildClusterEncounters({
    mapId: 229,
    spine,
    entrance: entranceForInstance('ubrs'),
    extraStrip: [
      ...UBRS_EXCLUDED_ENTRIES,
      ...UBRS_SUMMON_ONLY_ENTRIES,
      ENTRY.valthalak,
      // The seven Incarcerators are the Emberseer RITUAL, and this file has said so since it was
      // written. Unstripped, the cluster builder packed them into three ordinary trash pulls.
      ENTRY.blackhandIncarcerator,
    ],
    includePack: wingFilterByNearestBoss(229, 'ubrs'),
  });
  // Cite: instance_blackrock_spire.cpp:195-196,339-386 — 7-room sort + per-room flags.
  return stampUbrsRoomEvent(encs);
}


export const UBRS: InstanceDef = {
  id: 'ubrs',
  mapId: 229,
  wing: 'ubrs',
  name: 'Upper Blackrock Spire',
  portalZone: 'burningsteppes',
  // areatrigger_teleport 1468, Blackrock Spire - Entering (level 45). The AT's own fromZone is
  // 'searinggorge', so the portalZone match never found it and canEnter fell back to def.minLevel.
  entranceTriggerId: 1468,
  // UBRS is a TEN-man in 1.12 (post-1.10 cut), not a 5-man: instance_template 229
  // maxPlayers = 10. Cite: mangos.sql:2559; operator-confirmed 2026-08-08.
  maxPlayers: 10,
  minLevel: 45,
  levelRange: [55, 62],
  lockoutMs: 0,
  description: '',
  quests: [...UBRS_QUESTS],
  encounters: buildEncounters(),
};

// Sum of pure static trash counts per creature entry (primary + pack; bosses/events excluded).
// Incarcerators and Chromatic Elite Guards live on boss packs - not counted here.
export function ubrsPureStaticTrashCounts(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of UBRS.encounters) {
    if (enc.kind !== 'trash') continue;
    add(enc.creatureEntry, 1);
    for (const p of enc.pack ?? []) add(p.creatureEntry, p.count);
  }
  return map;
}

/** All kill supply (trash + boss singles + pack + waves + onDeathSummon + hpThreshold). */
export function ubrsKillSupply(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of UBRS.encounters) {
    // Wave encounters: supply is waves only (primary is identity for summon-only finale)
    const waveEv = (enc.events ?? []).find((ev) => ev.kind === 'waves');
    if (waveEv && waveEv.kind === 'waves') {
      for (const w of waveEv.waves) {
        for (const p of w.pack) add(p.creatureEntry, p.count);
      }
    } else {
      add(enc.creatureEntry, 1);
      for (const p of enc.pack ?? []) add(p.creatureEntry, p.count);
    }
    for (const ev of enc.events ?? []) {
      if (ev.kind === 'onDeathSummon') add(ev.creatureEntry, 1);
      if (ev.kind === 'hpThreshold' && ev.spawn) {
        for (const p of ev.spawn) add(p.creatureEntry, p.count);
      }
    }
  }
  // Rookery egg whelps are controller-scheduled (not authored wave rows); not kill-supply.
  // Finkle 10776 is friendly post-death flavor — not kill-supply.
  return map;
}
