// Lower Blackrock Spire (map 229, LBRS wing) — InstanceDef graph, LBRS bosses and trash only.
// Authority: docs/dungeons/survey/16-blackrock-spire.md, which carries the residual GAPS list.

import type { EncounterDef, EncounterEvent, InstanceDef } from '../schema.ts';
import {
  entranceForInstance,
  buildClusterEncounters,
  wingFilterByNearestBoss,
} from './pack-from-clusters.ts';

// ---- LBRS trash assignment (survey static column; UBRS families excluded) ----
// Spirestone rares, Bannok, Ghok and Crystal Fang are rare bosses, not trash; friendlies excluded.

const STATIC = {
  // Scarshield
  scarshieldAcolyte: 14, // 9045
  scarshieldLegionnaire: 48, // 9097
  scarshieldSpellbinder: 19, // 9098
  scarshieldWarlock: 9, // 9257
  scarshieldRaider: 6, // 9258
  scarshieldWorg: 12, // 9416
  // Spirestone (non-rare)
  spirestoneEnforcer: 3, // 9199
  spirestoneOgreMagus: 6, // 9201
  spirestoneMystic: 3, // 9198
  spirestoneReaver: 6, // 9200
  spirestoneBattleMage: 3, // 9197
  spirestoneWarlord: 6, // 9216
  // Smolderthorn
  smolderthornAxeThrower: 9, // 9267
  smolderthornMystic: 8, // 9239
  smolderthornShadowPriest: 19, // 9240
  smolderthornHeadhunter: 10, // 9241
  smolderthornSeer: 10, // 9269
  smolderthornShadowHunter: 6, // 9265
  smolderthornWitchDoctor: 8, // 9266
  smolderthornBerserker: 8, // 9268
  // Firebrand (LBRS portions - full census; see GAPS)
  firebrandDarkweaver: 14, // 9261
  firebrandGrunt: 19, // 9259
  firebrandInvoker: 12, // 9262
  firebrandDreadweaver: 3, // 9263
  firebrandLegionnaire: 3, // 9260
  firebrandPyromancer: 3, // 9264
  // Bloodaxe
  bloodaxeRaider: 7, // 9692
  bloodaxeSummoner: 8, // 9717
  bloodaxeWarmonger: 16, // 9716
  bloodaxeEvoker: 7, // 9693
  bloodaxeVeteran: 13, // 9583
  bloodaxeWorgPup: 10, // 10221
  bloodaxeWorg: 14, // 9696
  // Spider den / lower fauna
  spireSpider: 7, // 10374
  spireSpiderling: 12, // 10375
  spireScarab: 14, // 10177
  spireScorpid: 6, // 9701
} as const;

const ENTRY = {
  // Trash
  scarshieldAcolyte: 9045,
  scarshieldLegionnaire: 9097,
  scarshieldSpellbinder: 9098,
  scarshieldWarlock: 9257,
  scarshieldRaider: 9258,
  scarshieldWorg: 9416,
  spirestoneEnforcer: 9199,
  spirestoneOgreMagus: 9201,
  spirestoneMystic: 9198,
  spirestoneReaver: 9200,
  spirestoneBattleMage: 9197,
  spirestoneWarlord: 9216,
  smolderthornAxeThrower: 9267,
  smolderthornMystic: 9239,
  smolderthornShadowPriest: 9240,
  smolderthornHeadhunter: 9241,
  smolderthornSeer: 9269,
  smolderthornShadowHunter: 9265,
  smolderthornWitchDoctor: 9266,
  smolderthornBerserker: 9268,
  firebrandDarkweaver: 9261,
  firebrandGrunt: 9259,
  firebrandInvoker: 9262,
  firebrandDreadweaver: 9263,
  firebrandLegionnaire: 9260,
  firebrandPyromancer: 9264,
  bloodaxeRaider: 9692,
  bloodaxeSummoner: 9717,
  bloodaxeWarmonger: 9716,
  bloodaxeEvoker: 9693,
  bloodaxeVeteran: 9583,
  bloodaxeWorgPup: 10221,
  bloodaxeWorg: 9696,
  spireSpider: 10374,
  spireSpiderling: 10375,
  spireScarab: 10177,
  spireScorpid: 9701,
  // Canonical LBRS bosses (mission / survey lower order)
  omokk: 9196,
  vosh: 9236,
  voone: 9237,
  smolderweb: 10596,
  urok: 10584, // summon-only - tribute waves finale
  zigris: 9736, // rare-elite
  halycon: 10220,
  gizrul: 10268, // summon-only - Halycon onDeathSummon
  wyrmthalak: 9568,
  // Urok wave summons (0 static on map 229)
  urokEnforcer: 10601,
  urokOgreMagus: 10602,
  // Spirestone / other rares (pool-rolled — see [rare-roll] header)
  spirestoneButcher: 9219,
  spirestoneBattleLord: 9218,
  spirestoneLordMagus: 9217,
  bannok: 9596, // census ×2
  ghok: 9718, // census ×2
  crystalFang: 10376,
  // Tier 0.5 optional (summon-only)
  morGrayhoof: 16080,
} as const;

/** Expected rare static counts (survey census). */
export const LBRS_RARE_EXPECTED = {
  butcher: 1, // 9219
  battleLord: 1, // 9218
  lordMagus: 1, // 9217
  bannok: 2, // 9596
  ghok: 2, // 9718
  crystalFang: 1, // 10376
} as const;

/** Flags for LBRS event DSL. */
export const LBRS_FLAGS = {
  /** Urok's Tribute Pile used (Omokk's Head + Roughshod Pike). */
  urokTribute: 'lbrs-urok-tribute',
  /** Mor Grayhoof Brazier of Beckoning used at spell focus. */
  morGrayhoof: 'lbrs-mor-grayhoof',
  /** Wyrmthalak <51% reinforcement phase (ScriptDev owns inject; flag is bookkeeping). */
  wyrmthalakPhase2: 'lbrs-wyrmthalak-phase-2',
} as const;

// Challenge to Urok — dbscripts_on_event 4845, a pure timetable of absolute call times from event
// start. Totals: 4 Enforcers + 6 Magi + Urok in the final wave.
export const LBRS_UROK = {
  encId: 'urok-doomhowl',
  /** First wave absolute delay. Cite: dbScripts.event 4845 delay 5000 command 10. */
  firstWaveAtMs: 5_000,
  // fromCall gaps after waves 0–4 (next absolute − this absolute). Absolutes: 5 / 13 / 28 / 42 / 58 / 66 s
  // → gaps 8 / 15 / 14 / 16 / 8 s.
  waveGapsMs: [8_000, 15_000, 14_000, 16_000, 8_000] as const,
  /** Urok Doomhowl summon coords. Cite: dbScripts.event 4845 delay 66000 entry 10584. */
  spawn: { x: -23.97, y: -391.89, z: 48.58 },
  /** Tribute pile arm point. Cite: dungeonGameObjects map 229 guid for 175621. */
  tribute: { x: -14.35, y: -395.828, z: 48.507 },
} as const;

export const LBRS_UROK_WAVES = [
  {
    pack: [
      { creatureEntry: ENTRY.urokEnforcer, count: 2 },
      { creatureEntry: ENTRY.urokOgreMagus, count: 1 },
    ],
  }, // t+5s
  { pack: [{ creatureEntry: ENTRY.urokOgreMagus, count: 1 }] }, // t+13s
  {
    pack: [
      { creatureEntry: ENTRY.urokEnforcer, count: 1 },
      { creatureEntry: ENTRY.urokOgreMagus, count: 1 },
    ],
  }, // t+28s
  {
    pack: [
      { creatureEntry: ENTRY.urokEnforcer, count: 1 },
      { creatureEntry: ENTRY.urokOgreMagus, count: 2 },
    ],
  }, // t+42s
  { pack: [{ creatureEntry: ENTRY.urokOgreMagus, count: 1 }] }, // t+58s
  { pack: [{ creatureEntry: ENTRY.urok, count: 1 }] }, // t+66s finale
] as const;

// Urok tribute dual reagents: Omokk's Head 12534 used at spell focus 743, and spell 16447 consumes
// Roughshod Pike 12533. Cite: spell_template 16447; gameobject 175621/175585.
export const LBRS_UROK_TRIBUTE = {
  goEntry: 175621, // Urok's Tribute Pile (dungeonGameObjects map 229)
  // Spell-focus set for the dual-reagent check; the pile is the pin. Spirestone Perch 175585 shares
  // focusId 743 but has no map-229 GO row in the bake, so listing it would miss object-gates.
  goEntries: [175621] as const,
  requiredItem: 12534, // Omokk's Head (drops from Omokk 9196)
  roughshodPike: 12533, // reagent consumed by spell 16447
} as const;

/** True when both Urok reagents are present (head + pike). */
export function lbrsUrokHasReagents(hasItem: (itemEntry: number) => boolean): boolean {
  return hasItem(LBRS_UROK_TRIBUTE.requiredItem) && hasItem(LBRS_UROK_TRIBUTE.roughshodPike);
}

// Wyrmthalak <51% reinforcements. Cite: boss_overlord_wyrmthalak.cpp:124 GetHealthPercent < 51; :126-127
// two SummonCreature. Fixed product model of pool {9583, 9268, 9216} — ScriptDev IR owns mid-fight inject.
export const LBRS_WYRMTHALAK_ADDS = {
  pct: 51,
  spawn: [
    { creatureEntry: ENTRY.bloodaxeVeteran, count: 1 }, // 9583
    { creatureEntry: ENTRY.smolderthornBerserker, count: 1 }, // 9268
  ],
} as const;

// Mor Grayhoof Tier 0.5 optional summon (Kirtonos objectGate pattern): Brazier 22049 → spell 27184
// triggers 16044, with the item at GO 181046. Cite: docs/dungeons/survey/16-blackrock-spire.md.
export const LBRS_MOR_GRAYHOOF = {
  encId: 'mor-grayhoof',
  goEntry: 181046, // Mor Grayhoof Brazier Spell Focus
  requiredItem: 22049, // Brazier of Beckoning
  triggerEntry: 16044,
  spawn: { x: -15.903, y: -455.282, z: -18.644 },
} as const;

/** Summon-only / event-temp entries - never pure static trash packs. */
export const LBRS_SUMMON_ONLY_ENTRIES = new Set<number>([
  ENTRY.urok, // 10584
  ENTRY.gizrul, // 10268
  ENTRY.urokEnforcer, // 10601
  ENTRY.urokOgreMagus, // 10602
  ENTRY.morGrayhoof, // 16080
]);

/** Friendlies / service / UBRS / technical - never in LBRS combat graph. */
export const LBRS_EXCLUDED_ENTRIES = new Set<number>([
  // Friendlies / service
  10740, // Awbee
  10257, // Bijou
  10299, // Scarshield Infiltrator
  10799, // Warosh
  15560, // Elder Stonefort (Lunar Festival)
  16044, // Mor Grayhoof Trigger (event actor; boss is 16080)
  16048, // Lord Valthalak Trigger
  // UBRS bosses
  9816, // Pyroguard Emberseer
  10264, // Solakar Flamewreath
  10509, // Jed Runewatcher
  10899, // Goraluk Anvilcrack
  10339, // Gyth
  10429, // Warchief Rend Blackhand
  10430, // The Beast
  10363, // General Drakkisath
  // UBRS trash families (name lists)
  9096, // Rage Talon Dragonspawn
  10083, // Rage Talon Flamescale
  10366, // Rage Talon Dragon Guard
  10372, // Rage Talon Fire Tongue
  10371, // Rage Talon Captain
  9817, // Blackhand Dreadweaver
  9818, // Blackhand Summoner
  9819, // Blackhand Veteran
  10318, // Blackhand Assassin
  10317, // Blackhand Elite
  10319, // Blackhand Iron Guard
  10762, // Blackhand Thug
  10316, // Blackhand Incarcerator
  10814, // Chromatic Elite Guard
  10442, // Chromatic Whelp (stadium summon)
  10447, // Chromatic Dragonspawn
  10742, // Blackhand Dragon Handler
  10683, // Rookery Hatcher
  10258, // Rookery Guardian
  10161, // Rookery Whelp
  16042, // Lord Valthalak (UBRS T0.5)
]);

/** LBRS-completable survey quests (boss/story; pure-UBRS excluded). */
export const LBRS_QUESTS = [
  4788, // The Final Tablets - Mosh'aru tablets (troll area)
  4701, // Put Her Down - Halycon (A)
  4724, // The Pack Mistress - Halycon (H)
  4981, // Operative Bijou (H)
  4982, // Bijou's Belongings (H)
  4983, // Bijou's Reconnaissance Report (H)
  5001, // Bijou's Belongings (A)
  5002, // Message to Maxwell (A)
  4742, // Seal of Ascension - Omokk/Voone/Wyrmthalak gems + Scarshield (LBRS objectives)
  4867, // Urok Doomhowl
  4903, // Warlord's Command - Omokk/Voone/Wyrmthalak (H)
  5081, // Maxwell's Mission - Omokk/Voone/Wyrmthalak (A)
  5089, // General Drakkisath's Command - drops from Wyrmthalak
  5306, // Snakestone of the Shadow Huntress - Vosh'gajin
  8949, // Falrin's Vendetta - ogre warbeads (Omokk/Spirestone)
] as const;

/** Rounded static pack targets used by this graph (for tests / docs). */
export const LBRS_STATIC = { ...STATIC } as const;

// Boss spells: creature.spells from bake (game-data) - no invented ids.
// Wyrmthalak 9568: no spells in bake → empty (omit field).
const BOSS_SPELLS = {
  omokk: [10101, 8269],
  vosh: [16097, 16098, 16708],
  voone: [16075, 15284, 15618, 15615, 10966, 15708],
  smolderweb: [16104, 16468, 16103],
  urok: [16508, 16509, 15580, 16473],
  zigris: [15504, 15609, 16496, 16497],
  halycon: [13738, 8876],
  gizrul: [8269, 16128, 16495],
  wyrmthalak: [] as number[],
  // Rares with bake spells
  spirestoneLordMagus: [16170, 13323, 8365, 15230, 6742],
  bannok: [13737],
  ghok: [8269, 11972],
  // Rares with empty bake spells
  spirestoneButcher: [] as number[],
  spirestoneBattleLord: [] as number[],
  crystalFang: [] as number[],
  // T0.5 optional — creature 16080 missing from bake (no spells to list)
  morGrayhoof: [] as number[],
} as const;

/** Bake-sourced boss spell lists (for tests). */
export const LBRS_BOSS_SPELLS = { ...BOSS_SPELLS } as const;

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

function half<T>(arr: T[]): [T[], T[]] {
  const mid = Math.ceil(arr.length / 2);
  return [arr.slice(0, mid), arr.slice(mid)];
}

// Linear encounter graph in survey canonical LBRS boss order with inter-boss trash. Gizrul is
// Halycon's `onDeathSummon`, not a boss row, and Urok is waves-only with no static spawn.
function buildHandSpine(): EncounterDef[] {
  // Scarshield entrance
  const acolytes = trashFromCensus(
    'scarshield-acolyte',
    'Scarshield Acolyte',
    ENTRY.scarshieldAcolyte,
    STATIC.scarshieldAcolyte,
  );
  const legionnaires = trashFromCensus(
    'scarshield-legionnaire',
    'Scarshield Legionnaire',
    ENTRY.scarshieldLegionnaire,
    STATIC.scarshieldLegionnaire,
  );
  const spellbinders = trashFromCensus(
    'scarshield-spellbinder',
    'Scarshield Spellbinder',
    ENTRY.scarshieldSpellbinder,
    STATIC.scarshieldSpellbinder,
  );
  const warlocks = trashFromCensus(
    'scarshield-warlock',
    'Scarshield Warlock',
    ENTRY.scarshieldWarlock,
    STATIC.scarshieldWarlock,
  );
  const raiders = trashFromCensus(
    'scarshield-raider',
    'Scarshield Raider',
    ENTRY.scarshieldRaider,
    STATIC.scarshieldRaider,
  );
  const scarshieldWorgs = trashFromCensus(
    'scarshield-worg',
    'Scarshield Worg',
    ENTRY.scarshieldWorg,
    STATIC.scarshieldWorg,
  );

  // Firebrand
  const fbDarkweavers = trashFromCensus(
    'firebrand-darkweaver',
    'Firebrand Darkweaver',
    ENTRY.firebrandDarkweaver,
    STATIC.firebrandDarkweaver,
  );
  const fbGrunts = trashFromCensus(
    'firebrand-grunt',
    'Firebrand Grunt',
    ENTRY.firebrandGrunt,
    STATIC.firebrandGrunt,
  );
  const fbInvokers = trashFromCensus(
    'firebrand-invoker',
    'Firebrand Invoker',
    ENTRY.firebrandInvoker,
    STATIC.firebrandInvoker,
  );
  const fbDreadweavers = trashFromCensus(
    'firebrand-dreadweaver',
    'Firebrand Dreadweaver',
    ENTRY.firebrandDreadweaver,
    STATIC.firebrandDreadweaver,
  );
  const fbLegionnaires = trashFromCensus(
    'firebrand-legionnaire',
    'Firebrand Legionnaire',
    ENTRY.firebrandLegionnaire,
    STATIC.firebrandLegionnaire,
  );
  const fbPyromancers = trashFromCensus(
    'firebrand-pyromancer',
    'Firebrand Pyromancer',
    ENTRY.firebrandPyromancer,
    STATIC.firebrandPyromancer,
  );

  // Spirestone (Omokk wing)
  const spEnforcers = trashFromCensus(
    'spirestone-enforcer',
    'Spirestone Enforcer',
    ENTRY.spirestoneEnforcer,
    STATIC.spirestoneEnforcer,
  );
  const spOgreMagi = trashFromCensus(
    'spirestone-ogre-magus',
    'Spirestone Ogre Magus',
    ENTRY.spirestoneOgreMagus,
    STATIC.spirestoneOgreMagus,
  );
  const spMystics = trashFromCensus(
    'spirestone-mystic',
    'Spirestone Mystic',
    ENTRY.spirestoneMystic,
    STATIC.spirestoneMystic,
  );
  const spReavers = trashFromCensus(
    'spirestone-reaver',
    'Spirestone Reaver',
    ENTRY.spirestoneReaver,
    STATIC.spirestoneReaver,
  );
  const spBattleMages = trashFromCensus(
    'spirestone-battle-mage',
    'Spirestone Battle Mage',
    ENTRY.spirestoneBattleMage,
    STATIC.spirestoneBattleMage,
  );
  const spWarlords = trashFromCensus(
    'spirestone-warlord',
    'Spirestone Warlord',
    ENTRY.spirestoneWarlord,
    STATIC.spirestoneWarlord,
  );

  // Smolderthorn (Vosh / Voone)
  const stAxe = trashFromCensus(
    'smolderthorn-axe-thrower',
    'Smolderthorn Axe Thrower',
    ENTRY.smolderthornAxeThrower,
    STATIC.smolderthornAxeThrower,
  );
  const stMystic = trashFromCensus(
    'smolderthorn-mystic',
    'Smolderthorn Mystic',
    ENTRY.smolderthornMystic,
    STATIC.smolderthornMystic,
  );
  const stShadowPriest = trashFromCensus(
    'smolderthorn-shadow-priest',
    'Smolderthorn Shadow Priest',
    ENTRY.smolderthornShadowPriest,
    STATIC.smolderthornShadowPriest,
  );
  const stHeadhunter = trashFromCensus(
    'smolderthorn-headhunter',
    'Smolderthorn Headhunter',
    ENTRY.smolderthornHeadhunter,
    STATIC.smolderthornHeadhunter,
  );
  const stSeer = trashFromCensus(
    'smolderthorn-seer',
    'Smolderthorn Seer',
    ENTRY.smolderthornSeer,
    STATIC.smolderthornSeer,
  );
  const stShadowHunter = trashFromCensus(
    'smolderthorn-shadow-hunter',
    'Smolderthorn Shadow Hunter',
    ENTRY.smolderthornShadowHunter,
    STATIC.smolderthornShadowHunter,
  );
  const stWitchDoctor = trashFromCensus(
    'smolderthorn-witch-doctor',
    'Smolderthorn Witch Doctor',
    ENTRY.smolderthornWitchDoctor,
    STATIC.smolderthornWitchDoctor,
  );
  const stBerserker = trashFromCensus(
    'smolderthorn-berserker',
    'Smolderthorn Berserker',
    ENTRY.smolderthornBerserker,
    STATIC.smolderthornBerserker,
  );

  // Spider den (Smolderweb)
  const spiders = trashFromCensus('spire-spider', 'Spire Spider', ENTRY.spireSpider, STATIC.spireSpider);
  const spiderlings = trashFromCensus(
    'spire-spiderling',
    'Spire Spiderling',
    ENTRY.spireSpiderling,
    STATIC.spireSpiderling,
  );
  const scarabs = trashFromCensus('spire-scarab', 'Spire Scarab', ENTRY.spireScarab, STATIC.spireScarab);
  const scorpids = trashFromCensus(
    'spire-scorpid',
    'Spire Scorpid',
    ENTRY.spireScorpid,
    STATIC.spireScorpid,
  );

  // Bloodaxe (Halycon / Zigris / Wyrmthalak approaches)
  const baRaider = trashFromCensus(
    'bloodaxe-raider',
    'Bloodaxe Raider',
    ENTRY.bloodaxeRaider,
    STATIC.bloodaxeRaider,
  );
  const baSummoner = trashFromCensus(
    'bloodaxe-summoner',
    'Bloodaxe Summoner',
    ENTRY.bloodaxeSummoner,
    STATIC.bloodaxeSummoner,
  );
  const baWarmonger = trashFromCensus(
    'bloodaxe-warmonger',
    'Bloodaxe Warmonger',
    ENTRY.bloodaxeWarmonger,
    STATIC.bloodaxeWarmonger,
  );
  const baEvoker = trashFromCensus(
    'bloodaxe-evoker',
    'Bloodaxe Evoker',
    ENTRY.bloodaxeEvoker,
    STATIC.bloodaxeEvoker,
  );
  const baVeteran = trashFromCensus(
    'bloodaxe-veteran',
    'Bloodaxe Veteran',
    ENTRY.bloodaxeVeteran,
    STATIC.bloodaxeVeteran,
  );
  const baWorgPup = trashFromCensus(
    'bloodaxe-worg-pup',
    'Bloodaxe Worg Pup',
    ENTRY.bloodaxeWorgPup,
    STATIC.bloodaxeWorgPup,
  );
  const baWorg = trashFromCensus(
    'bloodaxe-worg',
    'Bloodaxe Worg',
    ENTRY.bloodaxeWorg,
    STATIC.bloodaxeWorg,
  );

  const [legPre, legPost] = half(legionnaires);
  const [spellPre, spellPost] = half(spellbinders);
  const [fbGruntPre, fbGruntPost] = half(fbGrunts);
  const [stPriestPre, stPriestPost] = half(stShadowPriest);
  const [baWarmPre, baWarmPost] = half(baWarmonger);
  const [baVetPre, baVetPost] = half(baVeteran);

  const out: EncounterDef[] = [];

  // --- Entrance Scarshield / Firebrand → Omokk (Spirestone) ---
  out.push(
    ...acolytes,
    ...legPre,
    ...spellPre,
    ...warlocks,
    ...raiders,
    ...scarshieldWorgs,
    ...fbGruntPre,
    ...fbDarkweavers.slice(0, Math.ceil(fbDarkweavers.length / 2)),
    ...fbInvokers.slice(0, Math.ceil(fbInvokers.length / 2)),
    ...spEnforcers,
    ...spOgreMagi,
    ...spMystics,
    ...spReavers,
    ...spBattleMages,
    ...spWarlords.slice(0, Math.ceil(spWarlords.length / 2)),
  );

  // Spirestone rares near Omokk (survey rare-elites; pool-rolled — see header)
  // Survey rare; isComplete ignores optional.
  out.push(
    {
      ...boss(
        'spirestone-butcher',
        'Spirestone Butcher',
        ENTRY.spirestoneButcher,
        BOSS_SPELLS.spirestoneButcher,
        undefined,
        'A rare Spirestone Butcher stalks the ogre halls.',
      ),
      optional: true,
    },
    {
      ...boss(
        'spirestone-battle-lord',
        'Spirestone Battle Lord',
        ENTRY.spirestoneBattleLord,
        BOSS_SPELLS.spirestoneBattleLord,
        undefined,
        'A rare Spirestone Battle Lord commands a side chamber.',
      ),
      optional: true,
    },
    {
      ...boss(
        'spirestone-lord-magus',
        'Spirestone Lord Magus',
        ENTRY.spirestoneLordMagus,
        BOSS_SPELLS.spirestoneLordMagus,
        undefined,
        'A rare Spirestone Lord Magus weaves spells near Omokk.',
      ),
      optional: true,
    },
  );

  out.push(
    boss(
      'highlord-omokk',
      'Highlord Omokk',
      ENTRY.omokk,
      BOSS_SPELLS.omokk,
      undefined,
      "Highlord Omokk rules the Spirestone ogres. His head is the key to Urok's challenge.",
    ),
  );

  // --- Omokk → Vosh'gajin (Smolderthorn) ---
  out.push(
    ...stAxe,
    ...stMystic,
    ...stPriestPre,
    ...stHeadhunter.slice(0, Math.ceil(stHeadhunter.length / 2)),
    ...stSeer.slice(0, Math.ceil(stSeer.length / 2)),
    ...stShadowHunter,
    ...stWitchDoctor.slice(0, Math.ceil(stWitchDoctor.length / 2)),
  );

  out.push(
    boss(
      'shadow-hunter-voshgajin',
      "Shadow Hunter Vosh'gajin",
      ENTRY.vosh,
      BOSS_SPELLS.vosh,
      undefined,
      "Shadow Hunter Vosh'gajin holds court among the Smolderthorn trolls.",
    ),
  );

  // --- Vosh → Voone ---
  out.push(
    ...stPriestPost,
    ...stHeadhunter.slice(Math.ceil(stHeadhunter.length / 2)),
    ...stSeer.slice(Math.ceil(stSeer.length / 2)),
    ...stWitchDoctor.slice(Math.ceil(stWitchDoctor.length / 2)),
    ...stBerserker.slice(0, Math.ceil(stBerserker.length / 2)),
  );

  out.push(
    boss(
      'war-master-voone',
      'War Master Voone',
      ENTRY.voone,
      BOSS_SPELLS.voone,
      undefined,
      'War Master Voone directs the Smolderthorn warband deeper in the spire.',
    ),
  );

  // --- Voone → Mother Smolderweb (spider den) ---
  out.push(...spiders, ...spiderlings, ...scarabs, ...scorpids);

  // Survey rare; isComplete ignores optional.
  out.push({
    ...boss(
      'crystal-fang',
      'Crystal Fang',
      ENTRY.crystalFang,
      BOSS_SPELLS.crystalFang,
      undefined,
      'Crystal Fang, a rare spider matriarch, lurks in the webbing.',
    ),
    optional: true,
  });

  out.push(
    boss(
      'mother-smolderweb',
      'Mother Smolderweb',
      ENTRY.smolderweb,
      BOSS_SPELLS.smolderweb,
      undefined,
      'Mother Smolderweb broods over the spider dens of the lower spire.',
    ),
  );

  // --- Urok Doomhowl - Challenge to Urok (tribute → timed waves) ---
  // Cite: dbscripts_on_event 4845 pure timetable; spell 16447 dual reagents head+pike.
  {
    const urokEnc = boss(
      LBRS_UROK.encId,
      'Urok Doomhowl',
      ENTRY.urok,
      BOSS_SPELLS.urok,
      [
        {
          kind: 'objectGate',
          goEntry: LBRS_UROK_TRIBUTE.goEntry,
          requiredItem: LBRS_UROK_TRIBUTE.requiredItem,
          setsFlag: LBRS_FLAGS.urokTribute,
          once: true,
        },
        { kind: 'requiresFlag', flag: LBRS_FLAGS.urokTribute },
        {
          kind: 'waves',
          waves: LBRS_UROK_WAVES.map((w) => ({
            pack: w.pack.map((p) => ({ creatureEntry: p.creatureEntry, count: p.count })),
          })),
        },
      ],
      "Challenge to Urok: Omokk's Head and a Roughshod Pike at the tribute pile. Timed ogre packs answer - then Urok Doomhowl.",
    );
    urokEnc.origin = { ...LBRS_UROK.spawn };
    out.push(urokEnc);
  }

  // --- Urok → Zigris (remaining Scarshield/Firebrand + Bloodaxe edge) ---
  out.push(
    ...legPost,
    ...spellPost,
    ...fbGruntPost,
    ...fbDarkweavers.slice(Math.ceil(fbDarkweavers.length / 2)),
    ...fbInvokers.slice(Math.ceil(fbInvokers.length / 2)),
    ...fbDreadweavers,
    ...fbLegionnaires,
    ...fbPyromancers,
    ...baRaider.slice(0, Math.ceil(baRaider.length / 2)),
    ...baSummoner.slice(0, Math.ceil(baSummoner.length / 2)),
  );

  // Bannok Grimaxe (rare; census ×2 static)
  // Survey rare; isComplete ignores optional.
  for (let i = 0; i < LBRS_RARE_EXPECTED.bannok; i++) {
    out.push({
      ...boss(
        `bannok-grimaxe-${i}`,
        'Bannok Grimaxe',
        ENTRY.bannok,
        BOSS_SPELLS.bannok,
        undefined,
        'Bannok Grimaxe, a rare orc elite, roams the lower halls.',
      ),
      optional: true,
    });
  }

  // Survey rare; isComplete ignores optional.
  out.push({
    ...boss(
      'quartermaster-zigris',
      'Quartermaster Zigris',
      ENTRY.zigris,
      BOSS_SPELLS.zigris,
      undefined,
      'Quartermaster Zigris, a rare elite storekeeper, hoards the Bloodaxe supplies.',
    ),
    optional: true,
  });

  // --- Zigris → Halycon (Bloodaxe kennels) ---
  out.push(
    ...baRaider.slice(Math.ceil(baRaider.length / 2)),
    ...baSummoner.slice(Math.ceil(baSummoner.length / 2)),
    ...baWarmPre,
    ...baEvoker,
    ...baVetPre,
    ...baWorgPup,
    ...baWorg,
    ...stBerserker.slice(Math.ceil(stBerserker.length / 2)),
    ...spWarlords.slice(Math.ceil(spWarlords.length / 2)),
  );

  // Ghok Bashguud (rare; census ×2)
  // Survey rare; isComplete ignores optional.
  for (let i = 0; i < LBRS_RARE_EXPECTED.ghok; i++) {
    out.push({
      ...boss(
        `ghok-bashguud-${i}`,
        'Ghok Bashguud',
        ENTRY.ghok,
        BOSS_SPELLS.ghok,
        undefined,
        'Ghok Bashguud, a rare Bloodaxe champion, patrols near the worg pens.',
      ),
      optional: true,
    });
  }

  // Halycon → onDeathSummon Gizrul (survey EventAI death summon)
  out.push(
    boss(
      'halycon',
      'Halycon',
      ENTRY.halycon,
      BOSS_SPELLS.halycon,
      [
        {
          kind: 'onDeathSummon',
          creatureEntry: ENTRY.gizrul,
          bossSpells: [...BOSS_SPELLS.gizrul],
        },
      ],
      "Halycon, pack mistress of the Bloodaxe worgs. On death she howls - Gizrul the Slavener answers.",
    ),
  );

  // --- Halycon/Gizrul → Wyrmthalak ---
  out.push(...baWarmPost, ...baVetPost);

  // Former hpThreshold 51% + 2-add spawn stand-in RETIRED — boss_overlord_wyrmthalak ScriptDev owns
  // the <51% mid-fight inject, and leaving both live would double-fire the adds.
  out.push(
    boss(
      'overlord-wyrmthalak',
      'Overlord Wyrmthalak',
      ENTRY.wyrmthalak,
      BOSS_SPELLS.wyrmthalak,
      undefined,
      'Overlord Wyrmthalak commands the lower spire finale. At <51% he summons two reinforcements (ScriptDev; fixed 9583+9268).',
    ),
  );

  // --- Mor Grayhoof (optional T0.5) — Brazier of Beckoning at spell focus ---
  // Cite: survey 16-blackrock-spire.md; GO 181046; item 22049; trigger 16044.
  {
    const mor = boss(
      LBRS_MOR_GRAYHOOF.encId,
      'Mor Grayhoof',
      ENTRY.morGrayhoof,
      BOSS_SPELLS.morGrayhoof,
      [
        {
          kind: 'objectGate',
          goEntry: LBRS_MOR_GRAYHOOF.goEntry,
          requiredItem: LBRS_MOR_GRAYHOOF.requiredItem,
          setsFlag: LBRS_FLAGS.morGrayhoof,
          once: true,
        },
        { kind: 'requiresFlag', flag: LBRS_FLAGS.morGrayhoof },
      ],
      'The Brazier of Beckoning at Mor Grayhoof\'s focus summons the spectral druid (optional T0.5).',
    );
    mor.origin = { ...LBRS_MOR_GRAYHOOF.spawn };
    mor.optional = true; // Summon (T0.5 Brazier); isComplete ignores optional.
    out.push(mor);
  }

  return out;
}

function buildEncounters(): EncounterDef[] {
  // Hand spine = bosses + event-gated packs (mono trashFromCensus is empty).
  const spine = buildHandSpine();
  return buildClusterEncounters({
    mapId: 229,
    spine,
    entrance: entranceForInstance('lbrs'),
    // UBRS bosses/trash families + friendlies/summon-only (module survey list).
    extraStrip: [...LBRS_EXCLUDED_ENTRIES, ...LBRS_SUMMON_ONLY_ENTRIES],
    includePack: wingFilterByNearestBoss(229, 'lbrs'),
  });
}


export const LBRS: InstanceDef = {
  id: 'lbrs',
  mapId: 229,
  wing: 'lbrs',
  name: 'Lower Blackrock Spire',
  portalZone: 'burningsteppes',
  // areatrigger_teleport 1468, Blackrock Spire - Entering (level 45), shared by LBRS and UBRS. Its
  // own fromZone is 'searinggorge', so the portalZone match never found it.
  entranceTriggerId: 1468,
  minLevel: 45,
  levelRange: [52, 60],
  lockoutMs: 0,
  description: '',
  quests: [...LBRS_QUESTS],
  encounters: buildEncounters(),
};

/** Sum of pure static trash counts per creature entry (primary + pack; bosses/events excluded). */
export function lbrsPureStaticTrashCounts(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of LBRS.encounters) {
    if (enc.kind !== 'trash') continue;
    add(enc.creatureEntry, 1);
    for (const p of enc.pack ?? []) add(p.creatureEntry, p.count);
  }
  return map;
}

/** All kill supply (trash + boss singles + onDeathSummon + waves + hpThreshold spawns). */
export function lbrsKillSupply(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of LBRS.encounters) {
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
  return map;
}
