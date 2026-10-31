// Stratholme Undead side / Baron chain (map 329) — InstanceDef graph, Live wing excluded.
// Authority: docs/dungeons/survey/19-stratholme.md Undead side, which carries the GAPS list.

import type { EncounterDef, EncounterEvent, InstanceDef } from '../schema.ts';
import {
  entranceForInstance,
  buildClusterEncounters,
  wingFilterByNearestBoss,
} from './pack-from-clusters.ts';

// ---- Census static counts (map 329 undead-type / Thuzadin; fractional pools rounded) ----
// Crimson humanoids, Live bosses, friendlies, triggers and summon-only event entries are excluded.

export const STATIC = {
  ravagedCadaver: 30, // 10381
  mangledCadaver: 35, // 10382
  spectralCitizen: 12, // 10384 pool 11.5 → Math.round
  ghostlyCitizen: 11, // 10385 pool 10.5 → Math.round
  skeletalGuardian: 53, // 10390
  skeletalBerserker: 48, // 10391
  thuzadinShadowcaster: 14, // 10398
  thuzadinAcolyte: 16, // 10399
  thuzadinNecromancer: 17, // 10400
  plagueGhoul: 34, // 10405
  ghoulRavener: 17, // 10406
  fleshflayerGhoul: 10, // 10407
  rockwingGargoyle: 4, // 10408 pool 3.5 → Math.round
  rockwingScreecher: 4, // 10409 pool 3.5 → Math.round
  eyeOfNaxxramas: 3, // 10411
  cryptCrawler: 7, // 10412
  cryptBeast: 6, // 10413
  patchworkHorror: 3, // 10414
  bileSpewer: 4, // 10416 - slaughter square aboms (static share)
  venomBelcher: 9, // 10417
  shriekingBanshee: 9, // 10463
  wailingBanshee: 6, // 10464
  stratholmeCourier: 1, // 11082
} as const;

/** Sum of pure static trash census (excl. rares-as-bosses, bosses, summon-only, Live, D-10). */
export const STATIC_TOTAL = Object.values(STATIC).reduce((a, b) => a + b, 0);

const ENTRY = {
  ravagedCadaver: 10381,
  mangledCadaver: 10382,
  spectralCitizen: 10384,
  ghostlyCitizen: 10385,
  skeletalGuardian: 10390,
  skeletalBerserker: 10391,
  thuzadinShadowcaster: 10398,
  thuzadinAcolyte: 10399,
  thuzadinNecromancer: 10400,
  plagueGhoul: 10405,
  ghoulRavener: 10406,
  fleshflayerGhoul: 10407,
  rockwingGargoyle: 10408,
  rockwingScreecher: 10409,
  eyeOfNaxxramas: 10411,
  cryptCrawler: 10412,
  cryptBeast: 10413,
  patchworkHorror: 10414,
  bileSpewer: 10416,
  venomBelcher: 10417,
  shriekingBanshee: 10463,
  wailingBanshee: 10464,
  stratholmeCourier: 11082,
  // Rare-elites (undead type; optional rares @ 100%)
  forresten: 10558,
  skul: 10393,
  stonespine: 10809,
  // Canonical undead bosses (survey order)
  anastari: 10436,
  nerubenkan: 10437,
  maleki: 10438,
  barthilas: 10435,
  ramstein: 10439, // summon-only - after slaughter square aboms
  rivendare: 10440,
  // Event summon-only (never pure static trash)
  mindlessUndead: 11030,
  blackGuardSentry: 10394,
  /** Ziggurat channel object — dies to the acolyte clear, never to damage. */
  ashariCrystal: 10415,
} as const;

// Flags from the survey Undead side / Baron chain. The ziggurat triple-key works in any order: each
// boss sets its own flag, and slaughter opens when all three are set. Cite: stratholme.cpp:85-98.
export const STRATH_UNDEAD_FLAGS = {
  ziggAnastari: 'strath-undead-zigg-anastari',
  ziggNerubenkan: 'strath-undead-zigg-nerubenkan',
  ziggMaleki: 'strath-undead-zigg-maleki',
  // TYPE_* SPECIAL — that ziggurat's Thuzadin Acolytes are all dead, so its Ash'ari Crystal
  // suicided. The boss flag is only DONE, his own door; Slaughter needs SPECIAL ×3.
  cryptAnastari: 'strath-undead-crypt-anastari',
  cryptNerubenkan: 'strath-undead-crypt-nerubenkan',
  cryptMaleki: 'strath-undead-crypt-maleki',
  /** All three ziggurat SPECIAL stand-ins → Port Gauntlet 175374 + Port Slaughter 175373. */
  slaughterSquareOpen: 'strath-undead-slaughter-square-open',
  /** Ramstein dead → Black Guard wave stream. */
  ramsteinDead: 'strath-undead-ramstein-dead',
  /** Black Guards cleared → Baron door 175796. */
  baronDoor: 'strath-undead-baron-door',
  /** Gauntlet Gate 175357 used — Baron's Ultimatum armed. */
  baronRun: 'strath-undead-baron-run',
  /** Baron killed while ultimatum still armed (TYPE_BARON_RUN DONE). */
  baronRunSuccess: 'strath-undead-baron-run-success',
  /** Ultimatum expired without Baron engage (TYPE_BARON_RUN FAIL). */
  baronRunFail: 'strath-undead-baron-run-fail',
  // TYPE_AURIUS DONE — Medallion of Faith quest 5122 rewarded at Aurius 10917. Cite: stratholme.h:21
  // TYPE_AURIUS=7; stratholmeScripts.cpp:326-327.
  aurius: 'strath-undead-aurius',
  /** Aurius teleported into the Slaughter House after Baron engage (+5s). */
  auriusJoined: 'strath-undead-aurius-joined',
  // TYPE_BARTHILAS_RUN IN_PROGRESS — Service Entrance Gate 175368 used. Cite: stratholme.h:20
  // TYPE_BARTHILAS_RUN=6; stratholmeScripts.cpp:52-54.
  barthilasRun: 'strath-undead-barthilas-run',
  /** Barthilas teleported to slaughter approach after 8s flee. */
  barthilasRelocated: 'strath-undead-barthilas-relocated',
} as const;

// Three ziggurats, any kill order, each TWO objectives: the boss opens the door, and the five
// acolytes behind it dying sends that ziggurat SPECIAL. Slaughter opens on three SPECIALs.
export const STRATH_ZIGGURAT_BOSSES = [
  {
    encId: 'baroness-anastari',
    entry: ENTRY.anastari,
    flag: STRATH_UNDEAD_FLAGS.ziggAnastari,
    cryptFlag: STRATH_UNDEAD_FLAGS.cryptAnastari,
    doorGo: 175380, // GO_ZIGGURAT_DOOR_1 — stratholme.h:59
    door: { x: 3853.47, y: -3722.94, z: 148.094 },
    crystalGuid: 3290339,
  },
  {
    encId: 'nerubenkan',
    entry: ENTRY.nerubenkan,
    flag: STRATH_UNDEAD_FLAGS.ziggNerubenkan,
    cryptFlag: STRATH_UNDEAD_FLAGS.cryptNerubenkan,
    doorGo: 175379, // GO_ZIGGURAT_DOOR_2 — stratholme.h:60
    door: { x: 3851.7, y: -3522.96, z: 144.213 },
    crystalGuid: 3290341,
  },
  {
    encId: 'maleki-the-pallid',
    entry: ENTRY.maleki,
    flag: STRATH_UNDEAD_FLAGS.ziggMaleki,
    cryptFlag: STRATH_UNDEAD_FLAGS.cryptMaleki,
    doorGo: 175381, // GO_ZIGGURAT_DOOR_3 — stratholme.h:61
    door: { x: 4038.13, y: -3649.91, z: 135.658 },
    crystalGuid: 3290340,
  },
] as const;

/** DoSortZiggurats radii, 2-D. Cite: stratholme.cpp:592 acolytes 35f, :625 crystal 50f. */
export const STRATH_ZIGG_SORT = { acolyteYd: 35, crystalYd: 50 } as const;

/** Ash'ari Crystal suicide on the last acolyte. Cite: stratholme.h:82 SPELL_SUICIDE = 7. */
export const STRATH_ZIGG_CRYSTAL = {
  entry: ENTRY.ashariCrystal,
  acolyteEntry: ENTRY.thuzadinAcolyte,
  suicideSpell: 7,
} as const;

// Which ziggurat a point belongs to (index into STRATH_ZIGGURAT_BOSSES), or -1. First door within
// `radiusYd` wins — the same first-match loop DoSortZiggurats runs.
export function strathZigguratIndexAt(
  pt: { x: number; y: number },
  radiusYd: number = STRATH_ZIGG_SORT.acolyteYd,
): number {
  for (let i = 0; i < STRATH_ZIGGURAT_BOSSES.length; i++) {
    const d = STRATH_ZIGGURAT_BOSSES[i]!.door;
    if (Math.hypot(pt.x - d.x, pt.y - d.y) <= radiusYd) return i;
  }
  return -1;
}

/** True when all three ziggurat boss flags are present (three doors open). */
export function strathZigguratsComplete(flags: readonly string[]): boolean {
  return STRATH_ZIGGURAT_BOSSES.every((z) => flags.includes(z.flag));
}

// True when all three crystals are down (three SPECIAL) — the real Slaughter Square key. Cite:
// stratholme.cpp:87 m_auiEncounter[...] == SPECIAL ×3.
export function strathZigguratCryptsComplete(flags: readonly string[]): boolean {
  return STRATH_ZIGGURAT_BOSSES.every((z) => flags.includes(z.cryptFlag));
}

// Baron's Ultimatum (TYPE_BARON_RUN), a 45-minute timer armed at the Gauntlet Gate.
// Cite: stratholme.cpp:230; stratholmeScripts.cpp:61-91; SpellDuration index 145 → 2,700,000 ms.
export const STRATH_BARON_RUN = {
  goEntry: 175357,
  ysidaEntry: 16031,
  ysidaCageGo: 181071,
  ultimatumSpellId: 27861,
  /** TYPE_BARON_RUN — stratholme.h:14. */
  typeField: 0,
  /** Full run window — stratholme.cpp:230. */
  durationMs: 45 * 60 * 1000,
  /** stratholme.cpp:1140 yell when remaining ≤ 10 min. */
  warn10MinMs: 10 * 60 * 1000,
  /** stratholme.cpp:1145 yell when remaining ≤ 5 min. */
  warn5MinMs: 5 * 60 * 1000,
  /** stratholme.cpp:1172 post-fail speech delay before Soul Drain. */
  failSpeechDelayMs: 8 * 1000,
  runFlag: STRATH_UNDEAD_FLAGS.baronRun,
  successFlag: STRATH_UNDEAD_FLAGS.baronRunSuccess,
  failFlag: STRATH_UNDEAD_FLAGS.baronRunFail,
} as const;

// Ysida Harmon has no `creature` row: the Baron summons her inside the cage when the Gauntlet Gate
// arms the run, and the run's outcome decides whether she is freed or Soul Drained 8 s later.
export const STRATH_YSIDA = {
  entry: 16031,
  cageGo: 181071,
  /** stratholme.h:141 stratholmeLocation[7] — summoned inside the cage. */
  cagePoint: { x: 4044.78, y: -3333.68, z: 115.53, o: 4.15 },
  /** stratholme.h:142 stratholmeLocation[8] — freed, or dragged out to die. */
  freedPoint: { x: 4041.9, y: -3337.6, z: 115.06, o: 3.82 },
  /** quests.json 8945 killTargets[0] "Ysida Freed" — credit target is her own entry. */
  questDeadMansPlea: 8945,
  /** stratholme.h:80 SPELL_YSIDA_FREED — Argent Dawn rep on top of the turn-in. */
  spellFreed: 27773,
  /** stratholme.h:79 SPELL_BARON_SOUL_DRAIN — what kills her on FAIL. */
  spellSoulDrain: 27640,
  /** UNIT_NPC_FLAG_GOSSIP | UNIT_NPC_FLAG_QUESTGIVER once freed (stratholme.cpp:391). */
  freedNpcFlags: 3,
} as const;

// The two portcullises the undead run walks THROUGH, each with a GOUse script; neither is a detour,
// since passing them is the trigger. Cite: stratholmeScripts.cpp:36-55, :61-91.
export const STRATH_WALK_THROUGH_GATES = [
  {
    goEntry: 175368,
    name: 'Service Entrance Gate',
    at: { x: 3624.91, y: -3642.16, z: 138.445 },
    setsFlag: STRATH_UNDEAD_FLAGS.barthilasRun,
  },
  {
    goEntry: 175357,
    name: 'Gauntlet Gate',
    at: { x: 3727.29, y: -3599.08, z: 142.22 },
    setsFlag: STRATH_UNDEAD_FLAGS.baronRun,
  },
] as const;

// Post-Ramstein Black Guard gauntlet timing. Cite: stratholme.cpp:312 summon timer 500, :1212 gap
// 400 with mindlessCount < 30, :718 blackGuardsTimer 60s after all mindless die, :319 5× guard.
export const STRATH_BLACK_GUARD = {
  encId: 'black-guard-waves',
  firstMindlessMs: 500,
  mindlessGapMs: 400,
  mindlessCount: 30,
  packSize: 5,
  /** Inter-pack schedule: 5 summons × 400ms (cpp:1212). */
  packGapMs: 5 * 400,
  /** After last mindless pack fully dead — cpp:718. */
  blackGuardAfterClearMs: 60_000,
  blackGuardCount: 5,
  mindlessEntry: ENTRY.mindlessUndead,
  blackGuardEntry: ENTRY.blackGuardSentry,
  /** Mindless pack waves before the Black Guard finale (6×5 = 30). */
  mindlessWaveCount: 6,
} as const;

// Post-Ramstein Black Guard gauntlet: 30× Mindless Undead 11030 then 5× Black Guard 10394. Packs of 5;
// floor gauntlet times packs (see STRATH_BLACK_GUARD + liveDungeonController).
export const STRATH_BLACK_GUARD_WAVES = [
  { pack: [{ creatureEntry: ENTRY.mindlessUndead, count: 5 }] },
  { pack: [{ creatureEntry: ENTRY.mindlessUndead, count: 5 }] },
  { pack: [{ creatureEntry: ENTRY.mindlessUndead, count: 5 }] },
  { pack: [{ creatureEntry: ENTRY.mindlessUndead, count: 5 }] },
  { pack: [{ creatureEntry: ENTRY.mindlessUndead, count: 5 }] },
  { pack: [{ creatureEntry: ENTRY.mindlessUndead, count: 5 }] },
  { pack: [{ creatureEntry: ENTRY.blackGuardSentry, count: 5 }] },
] as const;

/** Mindless Undead total across black-guard waves (survey: 30). */
export const STRATH_MINDLESS_UNDEAD_COUNT = 30;

/** Black Guard Sentry count (survey: 5). */
export const STRATH_BLACK_GUARD_COUNT = 5;

// Slaughter Square abom march cadence (residual — not a floor gauntlet yet). Cite: stratholme.cpp:261 first
// SPECIAL 20s; :1247 urand(30,45)*IN_MILLISECONDS.
export const STRATH_ABOM_MARCH = {
  firstMarchMs: 20_000,
  marchMinMs: 30_000,
  marchMaxMs: 45_000,
} as const;

// Ramstein the Gorger — summon-only once every Slaughter Square abomination is dead, then DONE opens
// the Port Slaughter Gate and sends 30 Mindless plus 5 Black Guard. Cite: stratholme.cpp:285-328.
export const STRATH_RAMSTEIN = {
  entry: ENTRY.ramstein,
  encId: 'ramstein-the-gorger',
  /** GO_ZIGGURAT_DOOR_4 — stratholme.h:62; DoOpenSlaughterhouseDoor stratholme.cpp:76-82. */
  slaughterhouseDoor: 175405,
  /** stratholme.h:136 stratholmeLocation[2]. */
  summonPoint: { x: 4032.643, y: -3378.546, z: 119.752, o: 4.74 },
  /** stratholme.h:137 stratholmeLocation[3] — comment says Ramstein move loc. */
  authoredMovePoint: { x: 4032.843, y: -3390.246, z: 119.732 },
  /** Engage / walk-out point. Cite: stratholme.cpp:294 MovePoint(0, stratholmeLocation[5]). */
  movePoint: { x: 4033.044, y: -3431.031, z: 119.055 },
  /** stratholme.cpp:285 m_slaughterDoorTimer = 10 * IN_MILLISECONDS. */
  doorOpenMs: 10_000,
} as const;

/** Bile Spewer 10416 / Venom Belcher 10417 — m_abominationGUIDs. Cite: stratholme.h:35-36. */
export function strathIsSlaughterAbom(enc: {
  creatureEntry: number;
  pack?: readonly { creatureEntry: number }[];
}): boolean {
  if (enc.creatureEntry === ENTRY.bileSpewer || enc.creatureEntry === ENTRY.venomBelcher) {
    return true;
  }
  return (enc.pack ?? []).some(
    (p) => p.creatureEntry === ENTRY.bileSpewer || p.creatureEntry === ENTRY.venomBelcher,
  );
}

/** Per-pack clear flag — all must be set before Ramstein unlocks (abomCount==0). */
export function strathAbomClearFlag(encId: string): string {
  return `strath-undead-abom-clear:${encId}`;
}

// Aurius intervention — the Medallion of Faith turn-in makes him an ally on Baron engage, teleported
// beside the Baron at faction 42. Cite: stratholme.cpp:356-358, :1109-1135, :395-413.
export const STRATH_AURIUS = {
  entry: 10917,
  questMedallion: 5122,
  questReckoning: 5125,
  medallionItem: 12845,
  /** stratholme.h:21 TYPE_AURIUS = 7. */
  typeField: 7,
  /** stratholme.cpp:358. */
  summonDelayMs: 5_000,
  /** stratholme.cpp:1121 GetRandomPoint(..., 4.0f, ...). */
  teleportRadiusYd: 4,
  /** stratholme.h:73 FACTION_VICTIM = 42. */
  factionVictim: 42,
  flag: STRATH_UNDEAD_FLAGS.aurius,
  joinedFlag: STRATH_UNDEAD_FLAGS.auriusJoined,
} as const;

/** True when Medallion turn-in armed TYPE_AURIUS. */
export function strathAuriusArmed(flags: readonly string[]): boolean {
  return flags.includes(STRATH_AURIUS.flag);
}

// Pure: Aurius joins the Baron fight only when medallion was rewarded and he has not already joined.
// Negative: no medallion → false. Cite: stratholme.cpp:356-358 TYPE_AURIUS == DONE on Baron IN_PROGRESS.
export function strathAuriusJoinsBaron(args: {
  flags: readonly string[];
  baronEngaged: boolean;
}): boolean {
  if (!args.baronEngaged) return false;
  if (!strathAuriusArmed(args.flags)) return false;
  if (args.flags.includes(STRATH_AURIUS.joinedFlag)) return false;
  return true;
}

// Magistrate Barthilas flees when the Service Entrance Gate is used: MovePoint to the door, then an
// 8 s teleport to stratholmeLocation[1]. Cite: stratholmeScripts.cpp:42-54; stratholme.cpp:427-437.
export const STRATH_BARTHILAS_RUN = {
  goEntry: 175368,
  encId: 'magistrate-barthilas',
  entry: 10435,
  /** stratholme.cpp:437. */
  fleeDelayMs: 8_000,
  /** stratholme.h:134 — door run waypoint (path residual). */
  doorPoint: { x: 3725.577, y: -3599.484, z: 142.367 },
  /** stratholme.h:135 — final tele / fight origin after flee. */
  telePoint: { x: 4068.284, y: -3535.678, z: 122.771, o: 2.5 },
  runFlag: STRATH_UNDEAD_FLAGS.barthilasRun,
  relocatedFlag: STRATH_UNDEAD_FLAGS.barthilasRelocated,
} as const;

/** True when service gate armed Barthilas flee. */
export function strathBarthilasRunArmed(flags: readonly string[]): boolean {
  return flags.includes(STRATH_BARTHILAS_RUN.runFlag);
}

/** True after 8s tele (or forced relocate). */
export function strathBarthilasRelocated(flags: readonly string[]): boolean {
  return flags.includes(STRATH_BARTHILAS_RUN.relocatedFlag);
}

// Pure: after flee delay, Barthilas relocates if still not in combat. Cite: stratholme.cpp:1095 IsAlive()
// && !IsInCombat().
export function strathBarthilasShouldRelocate(args: {
  flags: readonly string[];
  elapsedMs: number;
  inCombat: boolean;
}): boolean {
  if (!strathBarthilasRunArmed(args.flags)) return false;
  if (strathBarthilasRelocated(args.flags)) return false;
  if (args.inCombat) return false;
  return args.elapsedMs >= STRATH_BARTHILAS_RUN.fleeDelayMs;
}

// Baron Rivendare Raise Dead — 6 Mindless Skeletons on a 15 s combat timer, via 17473 then
// 17475–17480 each summoning 11197. Cite: creature_ai_scripts 1044005–1044007.
export const STRATH_RIVENDARE_RAISE = {
  spellRaiseDead: 17473,
  summonSpells: [17475, 17476, 17477, 17478, 17479, 17480] as const,
  skeletonEntry: 11197,
  skeletonCount: 6,
  /** EventAI 1044005 event_param1/2/3/4 = 15000. */
  firstCastMs: 15_000,
  repeatMs: 15_000,
  /** spell_target_position rows for 17475–17480. */
  positions: [
    { x: 4017.4, y: -3339.7, z: 115.058, o: 5.48 },
    { x: 4013.18, y: -3351.8, z: 115.052, o: 0.13 },
    { x: 4017.73, y: -3363.47, z: 115.057, o: 0.72 },
    { x: 4048.87, y: -3363.22, z: 115.054, o: 3.62 },
    { x: 4051.77, y: -3350.89, z: 115.055, o: 3.06 },
    { x: 4048.37, y: -3339.96, z: 115.055, o: 2.45 },
  ] as const,
} as const;

// Pure: how many Raise Dead cycles fire by fight elapsed ms. Negative: before firstCastMs → 0. Cite:
// EventAI 1044005 initial 15000, repeat 15000.
export function rivendareRaiseCastsByMs(fightMs: number): number {
  if (fightMs < STRATH_RIVENDARE_RAISE.firstCastMs) return 0;
  return (
    1
    + Math.floor(
      (fightMs - STRATH_RIVENDARE_RAISE.firstCastMs) / STRATH_RIVENDARE_RAISE.repeatMs,
    )
  );
}

/** Skeletons summoned by that many casts (6 per cast). */
export function rivendareSkeletonsByMs(fightMs: number): number {
  return rivendareRaiseCastsByMs(fightMs) * STRATH_RIVENDARE_RAISE.skeletonCount;
}

/** Summon-only creature entries that must never appear in pure static trash packs. */
export const STRATH_UNDEAD_SUMMON_ONLY_ENTRIES = new Set<number>([
  ENTRY.ramstein, // 10439
  ENTRY.mindlessUndead, // 11030
  ENTRY.blackGuardSentry, // 10394
]);

/** Live-side bosses / event summons - must not appear in this graph. */
export const STRATH_LIVE_BOSS_ENTRIES = new Set<number>([
  10516, // The Unforgiven
  10808, // Timmy the Cruel
  10997, // Cannon Master Willey
  10811, // Archivist Galford
  10812, // Grand Crusader Dathrohan
  10813, // Balnazzar (Dathrohan transform)
  11143, // Postmaster Malown
  11058, // Fras Siabi
  11032, // Malor the Zealous
]);

/** Crimson / Scarlet Bastion trash entries (Live side). */
export const STRATH_CRIMSON_ENTRIES = new Set<number>([
  10418, // Crimson Guardsman
  10419, // Crimson Conjuror
  10420, // Crimson Initiate
  10421, // Crimson Defender
  10422, // Crimson Sorcerer
  10423, // Crimson Priest
  10424, // Crimson Gallant
  10425, // Crimson Battle Mage
  10426, // Crimson Inquisitor
  11043, // Crimson Monk
  11054, // Crimson Rifleman (Willey summon)
]);

/** Scourge Invasion / friendlies / technical / Live phantoms - excluded from combat graph. */
export const STRATH_UNDEAD_EXCLUDED_ENTRIES = new Set<number>([
  14684, // Balzaphon - D-10 / Scourge Invasion
  10917, // Aurius - friendly/service
  15607, // Elder Farwhisper - friendly/service
  14646, // Stratholme Trigger - technical
  16046, // Jarien and Sothos Trigger - technical
  16100, // Ysida's Trigger - technical
  10387, // Vengeful Phantom - Unforgiven live side
  10415, // Ash'ari Crystal - ziggurat channel object (GAP)
  10516, // The Unforgiven - Live
  ...STRATH_LIVE_BOSS_ENTRIES,
  ...STRATH_CRIMSON_ENTRIES,
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
  /** Gate events two call sites pass (Slaughter Square aboms). Ignored while this is a stub. */
  _events?: EncounterEvent[],
): EncounterDef[] {
  // DP1: cluster packs supply trash; hand spine keeps bosses/events only.
  return [];
}

// Boss spells: creature.spells from bake + EventAI cast ids (sourced). Rivendare: bake kit + Raise Dead
// 17473 (EventAI 1044005); 17475–80 are spellhit summons (STRATH_RIVENDARE_RAISE), not rotation entries.
const BOSS_SPELLS = {
  anastari: [16867, 16565, 18327, 17244],
  nerubenkan: [4962, 6016, 16418, 17235],
  maleki: [17238, 16869, 17503, 17243],
  barthilas: [10887, 14099, 16793, 16791, 16792, 16794],
  ramstein: [5568, 17307, 6788, 15088],
  rivendare: [17467, 15708, 15284, 17393, 17473],
  forresten: [16798, 16244, 16100, 14443, 16331],
  skul: [12544, 15499, 16799, 15230],
  stonespine: [14331],
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

// Linear encounter graph: undead entrance → three ziggurat bosses → Barthilas → Slaughter Square
// aboms → Ramstein → Black Guard waves → Baron Rivendare. Static entries → packs of 2–5.
function buildHandSpine(): EncounterDef[] {
  const ravaged = trashFromCensus(
    'ravaged-cadaver',
    'Ravaged Cadaver',
    ENTRY.ravagedCadaver,
    STATIC.ravagedCadaver,
  );
  const mangled = trashFromCensus(
    'mangled-cadaver',
    'Mangled Cadaver',
    ENTRY.mangledCadaver,
    STATIC.mangledCadaver,
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
  const shadowcasters = trashFromCensus(
    'thuzadin-shadowcaster',
    'Thuzadin Shadowcaster',
    ENTRY.thuzadinShadowcaster,
    STATIC.thuzadinShadowcaster,
  );
  const acolytes = trashFromCensus(
    'thuzadin-acolyte',
    'Thuzadin Acolyte',
    ENTRY.thuzadinAcolyte,
    STATIC.thuzadinAcolyte,
  );
  const necromancers = trashFromCensus(
    'thuzadin-necromancer',
    'Thuzadin Necromancer',
    ENTRY.thuzadinNecromancer,
    STATIC.thuzadinNecromancer,
  );
  const plagueGhouls = trashFromCensus(
    'plague-ghoul',
    'Plague Ghoul',
    ENTRY.plagueGhoul,
    STATIC.plagueGhoul,
  );
  const ghoulsRavener = trashFromCensus(
    'ghoul-ravener',
    'Ghoul Ravener',
    ENTRY.ghoulRavener,
    STATIC.ghoulRavener,
  );
  const fleshflayers = trashFromCensus(
    'fleshflayer-ghoul',
    'Fleshflayer Ghoul',
    ENTRY.fleshflayerGhoul,
    STATIC.fleshflayerGhoul,
  );
  const gargoyles = trashFromCensus(
    'rockwing-gargoyle',
    'Rockwing Gargoyle',
    ENTRY.rockwingGargoyle,
    STATIC.rockwingGargoyle,
  );
  const screechers = trashFromCensus(
    'rockwing-screecher',
    'Rockwing Screecher',
    ENTRY.rockwingScreecher,
    STATIC.rockwingScreecher,
  );
  const eyes = trashFromCensus(
    'eye-of-naxxramas',
    'Eye of Naxxramas',
    ENTRY.eyeOfNaxxramas,
    STATIC.eyeOfNaxxramas,
  );
  const crawlers = trashFromCensus(
    'crypt-crawler',
    'Crypt Crawler',
    ENTRY.cryptCrawler,
    STATIC.cryptCrawler,
  );
  const beasts = trashFromCensus(
    'crypt-beast',
    'Crypt Beast',
    ENTRY.cryptBeast,
    STATIC.cryptBeast,
  );
  const patchworks = trashFromCensus(
    'patchwork-horror',
    'Patchwork Horror',
    ENTRY.patchworkHorror,
    STATIC.patchworkHorror,
  );
  // Slaughter Square aboms - gated until ziggurat chain opens the square.
  const bileSpewers = trashFromCensus(
    'bile-spewer',
    'Bile Spewer',
    ENTRY.bileSpewer,
    STATIC.bileSpewer,
    [{ kind: 'requiresFlag', flag: STRATH_UNDEAD_FLAGS.slaughterSquareOpen }],
  );
  const venomBelchers = trashFromCensus(
    'venom-belcher',
    'Venom Belcher',
    ENTRY.venomBelcher,
    STATIC.venomBelcher,
    [{ kind: 'requiresFlag', flag: STRATH_UNDEAD_FLAGS.slaughterSquareOpen }],
  );
  const shrieking = trashFromCensus(
    'shrieking-banshee',
    'Shrieking Banshee',
    ENTRY.shriekingBanshee,
    STATIC.shriekingBanshee,
  );
  const wailing = trashFromCensus(
    'wailing-banshee',
    'Wailing Banshee',
    ENTRY.wailingBanshee,
    STATIC.wailingBanshee,
  );
  const courier = trashFromCensus(
    'stratholme-courier',
    'Stratholme Courier',
    ENTRY.stratholmeCourier,
    STATIC.stratholmeCourier,
  );

  const out: EncounterDef[] = [];

  // --- Undead service entrance / Festival Lane → first ziggurat ---
  // Cadavers, skeletons, early ghouls, citizens.
  out.push(
    ...mangled.slice(0, Math.ceil(mangled.length / 2)),
    ...ravaged.slice(0, Math.ceil(ravaged.length / 2)),
    ...guardians.slice(0, Math.ceil(guardians.length / 3)),
    ...berserkers.slice(0, Math.ceil(berserkers.length / 3)),
    ...plagueGhouls.slice(0, Math.ceil(plagueGhouls.length / 3)),
    ...spectral.slice(0, Math.ceil(spectral.length / 2)),
    ...ghostly.slice(0, Math.ceil(ghostly.length / 2)),
    ...courier,
  );

  // Stonespine (10809) has ONE static point and it is a pool slot, not a fixture: pools.json 46803
  // holds that guid at chance 0 against a substitute at 66, so `optional` keeps him off the spine.
  out.push({
    ...boss(
      'stonespine',
      'Stonespine',
      ENTRY.stonespine,
      BOSS_SPELLS.stonespine,
      undefined,
      'Stonespine the rare undead stalker - a pool spawn, not always up.',
    ),
    optional: true,
  });

  out.push(
    ...shrieking.slice(0, Math.ceil(shrieking.length / 2)),
    ...wailing.slice(0, Math.ceil(wailing.length / 2)),
    ...ghoulsRavener.slice(0, Math.ceil(ghoulsRavener.length / 2)),
  );

  // --- Ziggurat bosses (any order): each sets own flag; slaughter needs all three ---
  // Gauntlet Gate 175357 objectGate arms Baron's Ultimatum (pin + run flag).
  out.push(
    boss(
      'baroness-anastari',
      'Baroness Anastari',
      ENTRY.anastari,
      BOSS_SPELLS.anastari,
      [
        {
          kind: 'objectGate',
          goEntry: STRATH_BARON_RUN.goEntry,
          setsFlag: STRATH_BARON_RUN.runFlag,
          once: true,
        },
        { kind: 'setsFlag', flag: STRATH_UNDEAD_FLAGS.ziggAnastari },
      ],
      "Baroness Anastari holds a ziggurat. Kill the three ziggurat bosses in any order to open Slaughter Square. Gauntlet Gate arms the 45-minute Baron's Ultimatum.",
    ),
  );

  out.push(
    ...acolytes.slice(0, Math.ceil(acolytes.length / 3)),
    ...shrieking.slice(Math.ceil(shrieking.length / 2)),
    ...plagueGhouls.slice(
      Math.ceil(plagueGhouls.length / 3),
      Math.ceil((2 * plagueGhouls.length) / 3),
    ),
  );

  // --- Ziggurat 2: Nerub'enkan ---
  out.push(
    ...crawlers.slice(0, Math.ceil(crawlers.length / 2)),
    ...beasts.slice(0, Math.ceil(beasts.length / 2)),
  );

  out.push(
    boss(
      'nerubenkan',
      "Nerub'enkan",
      ENTRY.nerubenkan,
      BOSS_SPELLS.nerubenkan,
      [{ kind: 'setsFlag', flag: STRATH_UNDEAD_FLAGS.ziggNerubenkan }],
      "Nerub'enkan the crypt lord holds a ziggurat. Any order with Anastari and Maleki.",
    ),
  );

  out.push(
    ...crawlers.slice(Math.ceil(crawlers.length / 2)),
    ...beasts.slice(Math.ceil(beasts.length / 2)),
    ...acolytes.slice(
      Math.ceil(acolytes.length / 3),
      Math.ceil((2 * acolytes.length) / 3),
    ),
    ...gargoyles,
    ...screechers,
  );

  // Forresten (10558) is a STREET rare authored on `stratholme-live` at all four of his real points
  // and optional there. The undead run enters at the Service Gate, so a required stop walks it back.

  // --- Ziggurat 3: Maleki the Pallid - completes triple-key → Slaughter Square ---
  out.push(
    ...shadowcasters.slice(0, Math.ceil(shadowcasters.length / 2)),
    ...necromancers.slice(0, Math.ceil(necromancers.length / 2)),
    ...wailing.slice(Math.ceil(wailing.length / 2)),
  );

  out.push(
    boss(
      'maleki-the-pallid',
      'Maleki the Pallid',
      ENTRY.maleki,
      BOSS_SPELLS.maleki,
      // Own flag only — slaughterSquareOpen is derived when all three zigg flags are set.
      [{ kind: 'setsFlag', flag: STRATH_UNDEAD_FLAGS.ziggMaleki }],
      'Maleki the Pallid holds a ziggurat. When all three ziggurats fall, Slaughter Square opens.',
    ),
  );

  out.push(
    ...acolytes.slice(Math.ceil((2 * acolytes.length) / 3)),
    ...shadowcasters.slice(Math.ceil(shadowcasters.length / 2)),
    ...necromancers.slice(Math.ceil(necromancers.length / 2)),
    ...fleshflayers.slice(0, Math.ceil(fleshflayers.length / 2)),
  );

  // Skul (10393) is a STREET rare for the same reason, authored optional on `stratholme-live`.
  // Measured cost of keeping him here: the party held `target=skul` for the last 210 s of a run.

  // --- Magistrate Barthilas (survey order after three ziggurat bosses) ---
  // Service Entrance Gate 175368 arms the flee → 8s teleport to the slaughter approach.
  out.push(
    ...mangled.slice(Math.ceil(mangled.length / 2)),
    ...ravaged.slice(Math.ceil(ravaged.length / 2)),
    ...guardians.slice(
      Math.ceil(guardians.length / 3),
      Math.ceil((2 * guardians.length) / 3),
    ),
    ...berserkers.slice(
      Math.ceil(berserkers.length / 3),
      Math.ceil((2 * berserkers.length) / 3),
    ),
  );

  // ROUTE ORIGIN IS THE FLEE POINT, NOT THE SPAWN: his `creature` row sits behind the Service
  // Entrance Gate, and using that gate teleports him 8 s later to the Slaughter Square approach.
  out.push({
    ...boss(
      'magistrate-barthilas',
      'Magistrate Barthilas',
      ENTRY.barthilas,
      BOSS_SPELLS.barthilas,
      [
        {
          kind: 'objectGate',
          goEntry: STRATH_BARTHILAS_RUN.goEntry,
          setsFlag: STRATH_BARTHILAS_RUN.runFlag,
          once: true,
        },
      ],
      'Magistrate Barthilas fled the Service Entrance Gate - he is waiting at the Slaughter Square approach.',
    ),
    origin: {
      x: STRATH_BARTHILAS_RUN.telePoint.x,
      y: STRATH_BARTHILAS_RUN.telePoint.y,
      z: STRATH_BARTHILAS_RUN.telePoint.z,
    },
    spawnGuids: [3290432],
  });

  // --- Slaughter Square aboms (requires ziggurat unlock) → Ramstein ---
  out.push(
    ...plagueGhouls.slice(Math.ceil((2 * plagueGhouls.length) / 3)),
    ...ghoulsRavener.slice(Math.ceil(ghoulsRavener.length / 2)),
    ...fleshflayers.slice(Math.ceil(fleshflayers.length / 2)),
    ...patchworks,
    ...eyes,
    ...spectral.slice(Math.ceil(spectral.length / 2)),
    ...ghostly.slice(Math.ceil(ghostly.length / 2)),
    ...bileSpewers,
    ...venomBelchers,
  );

  // Ramstein — summon-only once the Slaughter Square aboms die (TYPE_RAMSTEIN SPECIAL).
  // bindSlaughterSquare wires the per-abom clear flags and the engage origin.
  out.push(
    boss(
      STRATH_RAMSTEIN.encId,
      'Ramstein the Gorger',
      ENTRY.ramstein,
      BOSS_SPELLS.ramstein,
      [{ kind: 'setsFlag', flag: STRATH_UNDEAD_FLAGS.ramsteinDead }],
      'Clear the Slaughter Square abominations and Baron Rivendare releases Ramstein the Gorger from the slaughterhouse. (Summon-only.)',
    ),
  );

  // --- Black Guard: 30× Mindless @ 400ms packs + 60s clear → 5× Black Guard ---
  // Primary = Black Guard Sentry (final wave). Timers: STRATH_BLACK_GUARD + gauntletTransition.
  out.push({
    id: STRATH_BLACK_GUARD.encId,
    name: 'Black Guard Gauntlet',
    kind: 'trash',
    creatureEntry: ENTRY.blackGuardSentry,
    intro:
      'Ramstein falls - thirty Mindless Undead stream into the square (400ms ticks), then after a 60s breather five Black Guard Sentries walk out. The Baron door opens when they die.',
    events: [
      { kind: 'requiresFlag', flag: STRATH_UNDEAD_FLAGS.ramsteinDead },
      {
        kind: 'waves',
        waves: STRATH_BLACK_GUARD_WAVES.map((w) => ({
          pack: w.pack.map((p) => ({ creatureEntry: p.creatureEntry, count: p.count })),
        })),
      },
      { kind: 'setsFlag', flag: STRATH_UNDEAD_FLAGS.baronDoor },
    ],
  });

  // --- Final approach trash + Baron Rivendare ---
  out.push(
    ...guardians.slice(Math.ceil((2 * guardians.length) / 3)),
    ...berserkers.slice(Math.ceil((2 * berserkers.length) / 3)),
  );

  out.push(
    boss(
      'baron-rivendare',
      'Baron Rivendare',
      ENTRY.rivendare,
      BOSS_SPELLS.rivendare,
      [
        { kind: 'requiresFlag', flag: STRATH_UNDEAD_FLAGS.baronDoor },
      ],
      // Raise Dead 17473 + 6×11197: STRATH_RIVENDARE_RAISE (EventAI 1044005–07).
      // Aurius ally: STRATH_AURIUS (quest 5122 → +5s on engage).
      "Baron Rivendare raises Mindless Skeletons every 15s. Return the Medallion of Faith to Aurius and he joins this fight after 5s.",
    ),
  );

  return out;
}

// Bind the Thuzadin Acolyte packs the cluster builder produced to their ziggurat: 5+5+5 sit inside
// the doors, and the sixteenth 90.7 yd out is the announcer, so one 35 yd radius test sorts both.
function bindZigguratCrypts(encounters: EncounterDef[]): EncounterDef[] {
  return encounters.map((enc) => {
    if (enc.kind !== 'trash' || !enc.origin) return enc;
    const holdsAcolytes = enc.creatureEntry === STRATH_ZIGG_CRYSTAL.acolyteEntry
      || (enc.pack ?? []).some((p) => p.creatureEntry === STRATH_ZIGG_CRYSTAL.acolyteEntry);
    if (!holdsAcolytes) return enc;
    const zi = strathZigguratIndexAt(enc.origin, STRATH_ZIGG_SORT.acolyteYd);
    if (zi < 0) return enc;
    const z = STRATH_ZIGGURAT_BOSSES[zi]!;
    return {
      ...enc,
      name: `Thuzadin Acolytes (${z.encId === 'nerubenkan' ? "Nerub'enkan" : z.encId === 'maleki-the-pallid' ? 'Maleki' : 'Anastari'} ziggurat)`,
      intro:
        `The ziggurat door is open. The Thuzadin Acolytes inside are channelling an Ash'ari `
        + `Crystal (${STRATH_ZIGG_CRYSTAL.entry}) - kill all of them and the crystal shatters, `
        + `which is one of the three keys to Slaughter Square.`,
      events: [
        ...(enc.events ?? []),
        { kind: 'requiresFlag', flag: z.flag } as EncounterEvent,
        { kind: 'setsFlag', flag: z.cryptFlag } as EncounterEvent,
      ],
    };
  });
}

// Slaughter Square: aboms unlock only after three crystals (SPECIAL ×3), and Ramstein only after
// every abom pack is dead — then spawnUnlockedBodies places 10439 at the MovePoint.
function bindSlaughterSquare(encounters: EncounterDef[]): EncounterDef[] {
  const aboms = encounters.filter((e) => strathIsSlaughterAbom(e));
  if (!aboms.length) return encounters;

  const cryptReqs: EncounterEvent[] = STRATH_ZIGGURAT_BOSSES.map((z) => ({
    kind: 'requiresFlag',
    flag: z.cryptFlag,
  }));

  const boundAboms = aboms.map((enc) => ({
    ...enc,
    name: enc.creatureEntry === ENTRY.bileSpewer ? 'Bile Spewer' : 'Venom Belcher',
    intro:
      'Slaughter Square abominations. Kill them all and Baron Rivendare releases Ramstein.',
    events: [
      ...cryptReqs,
      { kind: 'setsFlag', flag: strathAbomClearFlag(enc.id) } as EncounterEvent,
    ],
  }));

  const rest = encounters.filter(
    (e) => !strathIsSlaughterAbom(e) && e.id !== STRATH_RAMSTEIN.encId,
  );
  const ram = encounters.find((e) => e.id === STRATH_RAMSTEIN.encId);
  if (!ram) return encounters;

  const ramstein: EncounterDef = {
    ...ram,
    origin: {
      x: STRATH_RAMSTEIN.movePoint.x,
      y: STRATH_RAMSTEIN.movePoint.y,
      z: STRATH_RAMSTEIN.movePoint.z,
    },
    events: [
      ...boundAboms.map((a) => ({
        kind: 'requiresFlag' as const,
        flag: strathAbomClearFlag(a.id),
      })),
      { kind: 'setsFlag', flag: STRATH_UNDEAD_FLAGS.ramsteinDead },
    ],
    intro:
      'Clear the Slaughter Square abominations and Baron Rivendare releases Ramstein the Gorger '
      + 'from the slaughterhouse. (Summon-only.)',
  };

  const insertAt = rest.findIndex(
    (e) => e.id === STRATH_BLACK_GUARD.encId || e.id === 'baron-rivendare',
  );
  if (insertAt < 0) return [...rest, ...boundAboms, ramstein];
  return [
    ...rest.slice(0, insertAt),
    ...boundAboms,
    ramstein,
    ...rest.slice(insertAt),
  ];
}

function buildEncounters(): EncounterDef[] {
  // Hand spine = bosses + event-gated packs (mono trashFromCensus is empty).
  const spine = buildHandSpine();
  return bindSlaughterSquare(bindZigguratCrypts(buildClusterEncounters({
    mapId: 329,
    spine,
    entrance: entranceForInstance('stratholme-undead'),
    // The exclusion sets above were declared and never passed, so the cluster builder packed
    // triggers / Balzaphon / Live humanoids into ordinary undead trash pulls (2026-08-17).
    extraStrip: [
      ...STRATH_UNDEAD_EXCLUDED_ENTRIES,
      ...STRATH_UNDEAD_SUMMON_ONLY_ENTRIES,
    ],
    includePack: wingFilterByNearestBoss(329, "undead"),
  })));
}


// Undead / Baron-side survey quests completable inside map 329. Live-only (Archivist, Of Love and Family,
// Willey/Galford Dungeon Set steps) excluded.
export const STRATHOLME_UNDEAD_QUESTS = [
  5067, // Leggings of Arcana
  8414, // Dispelling Evil
  5402, // Minion's Scourgestones
  5403, // Invader's Scourgestones
  5404, // Corruptor's Scourgestones
  5406, // Corruptor's Scourgestones (Garush)
  5407, // Invader's Scourgestones (Garush)
  5408, // Minion's Scourgestones (Garush)
  5508, // Corruptor's Scourgestones (Zverenhoff)
  5509, // Invader's Scourgestones (Zverenhoff)
  5510, // Minion's Scourgestones (Zverenhoff)
  5212, // The Flesh Does Not Lie
  5213, // The Active Agent
  5122, // The Medallion of Faith
  5125, // Aurius' Reckoning
  5263, // Above and Beyond (Baron Rivendare head)
  5463, // Menethil's Gift
  5464, // Menethil's Gift
  5063, // Cap of the Scarlet Savant (stitchings)
  5068, // Breastplate of Bloodthirst
  5166, // Breastplate of the Chromatic Flight
  7485, // Libram of Protection
  8829, // The Ultimate Deception
  8727, // Farwhisper the Elder
  // Anthion's Parting Words - undead boss / Rivendare pieces (not Willey spaulders 8956/9020)
  8951,
  8952,
  8953,
  8954, // Lightforge Legplates (Rivendare)
  8955,
  8957,
  8958,
  8959,
  9016,
  9017,
  9018,
  9019,
  9021,
  9022,
] as const;

export const STRATHOLME_UNDEAD: InstanceDef = {
  id: 'stratholme-undead',
  mapId: 329,
  wing: 'undead',
  name: 'Stratholme (Undead)',
  portalZone: 'easternplaguelands',
  minLevel: 45, // entrance triggers 2214/2216/2217 requiredLevel
  levelRange: [55, 61], // survey trash band
  lockoutMs: 0,
  description: '',
  quests: [...STRATHOLME_UNDEAD_QUESTS],
  encounters: buildEncounters(),
};

/** Sum of authored kill supply per creature entry (trash + bosses + waves). */
export function strathUndeadKillSupply(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of STRATHOLME_UNDEAD.encounters) {
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
  // waves re-count primary when wave packs include creatureEntry - subtract identity
  // primary once (gnomeregan convention), not full wave totals.
  for (const enc of STRATHOLME_UNDEAD.encounters) {
    const waves = (enc.events ?? []).find((e) => e.kind === 'waves');
    if (!waves || waves.kind !== 'waves') continue;
    let primaryInWaves = false;
    for (const w of waves.waves) {
      for (const row of w.pack) {
        if (row.creatureEntry === enc.creatureEntry) primaryInWaves = true;
      }
    }
    if (primaryInWaves) add(enc.creatureEntry, -1);
  }
  return map;
}

// Counts only pure static trash packs, with no bosses and no flag-gated or wave event pulls. The
// Slaughter Square aboms are included: their flag gates unlock order, not spawn source.
export function strathUndeadPureStaticTrashCounts(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of STRATHOLME_UNDEAD.encounters) {
    if (enc.kind !== 'trash') continue;
    const hasWaves = (enc.events ?? []).some((e) => e.kind === 'waves');
    if (hasWaves) continue; // black-guard event stream - not static
    add(enc.creatureEntry, 1);
    for (const p of enc.pack ?? []) add(p.creatureEntry, p.count);
  }
  return map;
}
