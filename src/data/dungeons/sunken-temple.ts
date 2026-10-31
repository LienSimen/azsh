// The Temple of Atal'Hakkar / Sunken Temple (map 109) — InstanceDef graph. Authority:
// docs/dungeons/survey/14-sunken-temple.md, which carries the three residuals.

import type { EncounterDef, EncounterEvent, InstanceDef } from '../schema.ts';
import {
  entranceForInstance,
  buildClusterEncounters,
} from './pack-from-clusters.ts';

// ---- Census static counts (map 109; fractional pool expected rounded) ----
// Bosses, summon-only rows, seasonal Elder Starsong and critters are excluded; Protectors are minis.

/** Pure static trash totals (Math.round on pool fractions). Protectors / bosses excluded. */
export const STATIC = {
  deepLurker: 23, // 8384 pool 22.5 → Math.round
  murkWorm: 18, // 5226 pool 17.5 → Math.round
  saturatedOoze: 10, // 5228
  atalaiWarrior: 13, // 5256 pool 13.3 → Math.round
  unlivingAtalai: 14, // 5267 pool 14.3 → Math.round
  atalaiCorpseEater: 10, // 5270 pool 10.3 → Math.round
  atalaiWitchDoctor: 25, // 5259
  hakkariFrostwing: 3, // 5291
  hakkariSapper: 3, // 8336
  nightmareWanderer: 13, // 5283
  atalaiDeathwalker: 14, // 5271
  atalaiHighPriest: 3, // 5273
  nightmareScalebane: 13, // 5277
  nightmareWyrmkin: 13, // 5280
  spawnOfHakkar: 1, // 5708
  oozeling: 5, // 8257
  slimeMaggot: 75, // 8311
  atalaiSlave: 30, // 8318
  nightmareWhelp: 10, // 8319
} as const;

/** Mini-boss protectors (static 1 each; not pure trash packs). */
export const PROTECTOR_STATIC = {
  zolo: 1, // 5712
  gasher: 1, // 5713
  loro: 1, // 5714
  hukku: 1, // 5715
  zulLor: 1, // 5716
  mijan: 1, // 5717
} as const;

/** Sum of pure static trash census (excl. protectors, bosses, friendlies, summon-only). */
export const STATIC_TOTAL =
  STATIC.deepLurker +
  STATIC.murkWorm +
  STATIC.saturatedOoze +
  STATIC.atalaiWarrior +
  STATIC.unlivingAtalai +
  STATIC.atalaiCorpseEater +
  STATIC.atalaiWitchDoctor +
  STATIC.hakkariFrostwing +
  STATIC.hakkariSapper +
  STATIC.nightmareWanderer +
  STATIC.atalaiDeathwalker +
  STATIC.atalaiHighPriest +
  STATIC.nightmareScalebane +
  STATIC.nightmareWyrmkin +
  STATIC.spawnOfHakkar +
  STATIC.oozeling +
  STATIC.slimeMaggot +
  STATIC.atalaiSlave +
  STATIC.nightmareWhelp;

export const ENTRY = {
  deepLurker: 8384,
  murkWorm: 5226,
  saturatedOoze: 5228,
  atalaiWarrior: 5256,
  unlivingAtalai: 5267,
  atalaiCorpseEater: 5270,
  atalaiWitchDoctor: 5259,
  hakkariFrostwing: 5291,
  hakkariSapper: 8336,
  nightmareWanderer: 5283,
  atalaiDeathwalker: 5271,
  atalaiHighPriest: 5273,
  nightmareScalebane: 5277,
  nightmareWyrmkin: 5280,
  spawnOfHakkar: 5708,
  oozeling: 8257,
  slimeMaggot: 8311,
  atalaiSlave: 8318,
  nightmareWhelp: 8319,
  // Six protectors (Atal'ai Defenders)
  zolo: 5712,
  gasher: 5713,
  loro: 5714,
  hukku: 5715,
  zulLor: 5716,
  mijan: 5717,
  // Canonical bosses
  atalalarion: 8580, // summon-only - statue puzzle
  dreamscythe: 5721, // summon-only - Jammal'an death
  weaver: 5720, // summon-only - Jammal'an death
  jammalan: 5710,
  ogom: 5711,
  morphaz: 5719,
  hazzas: 5722,
  avatarOfHakkar: 8443, // summon-only — Shade UpdateEntry morph (spell 12639)
  shadeOfEranikus: 5709,
  // Avatar ritual summon-only (0 map-109 rows; sunken_temple.h:37–40)
  shadeOfHakkar: 8440,
  hakkariMinion: 8437,
  hakkariBloodkeeper: 8438,
  nightmareSuppressor: 8497,
} as const;

/** Flags from survey event choreography / sunken_temple.cpp. */
export const ST_FLAGS = {
  /** E1 - Atal'ai statue circle (6 uses of 148830–148835). */
  atalarionSummoned: 'st-atalarion-summoned',
  /** E2 - each protector death (Jammal barrier). */
  zoloDead: 'st-zolo-dead',
  gasherDead: 'st-gasher-dead',
  loroDead: 'st-loro-dead',
  hukkuDead: 'st-hukku-dead',
  zulLorDead: 'st-zullor-dead',
  mijanDead: 'st-mijan-dead',
  /** E3 - Jammal'an cleared (dragons summoned; Eranikus order after). */
  jammalanDead: 'st-jammalan-dead',
  /** E4 - Egg of Hakkar start (TYPE_AVATAR IN_PROGRESS). */
  avatarRitual: 'st-avatar-ritual',
  /** E4 - first-wave Bloodkeeper dead (Hakkari Blood 10460). Cite: sunken_temple.cpp:439-441; loot-data 8438. */
  avatarBlood: 'st-avatar-blood',
  /** E4 - 4 Eternal Flames doused (m_uiFlameCounter == MAX_FLAMES). */
  avatarFlamesDone: 'st-avatar-flames-done',
} as const;

// E1 — Atal'ai Statues 148830–148835 in geographic order S, N, SW, SE, NW, NE, where goEntries[i]
// fires eventIds[i]. Cite: sunken_temple.h:91–92; sunken_temple.cpp:329–354 ProcessStatueEvent.
export const ST_ATALAI_STATUE = {
  goEntry: 148830,
  /** Required use order S, N, SW, SE, NW, NE. */
  goEntries: [148830, 148831, 148832, 148833, 148834, 148835] as const,
  /** eventId per goEntries[i]. Cite: gameobject-data goober.eventId. */
  eventIds: [3094, 3095, 3097, 3098, 3099, 3100] as const,
  needUses: 6,
  setsFlag: ST_FLAGS.atalarionSummoned,
  /** Atal'alarion summon. Cite: sunken_temple.h:101 aSunkenTempleLocation[0]. */
  summonPos: { x: -466.513, y: 95.1982, z: -189.646 },
} as const;

// E2 — Jammal'an barrier: forcefield GO 149431 plus UNIT_FLAG_IMMUNE until all six protectors die.
// Ogom 5711 rides the Jammal'an pack, not a seventh protector. Cite: sunken_temple.cpp:162–178.
export const ST_JAMMAL_BARRIER = {
  goEntry: 149431,
  jammalEntry: ENTRY.jammalan,
  ogomEntry: ENTRY.ogom,
  protectorEntries: [
    ENTRY.zolo,
    ENTRY.gasher,
    ENTRY.loro,
    ENTRY.hukku,
    ENTRY.zulLor,
    ENTRY.mijan,
  ] as const,
  protectorFlags: [
    ST_FLAGS.zoloDead,
    ST_FLAGS.gasherDead,
    ST_FLAGS.loroDead,
    ST_FLAGS.hukkuDead,
    ST_FLAGS.zulLorDead,
    ST_FLAGS.mijanDead,
  ] as const,
} as const;

// E5 - Shade of Eranikus immune until Jammal'an DONE. Cite: sunken_temple.cpp:99–103 OnCreatureCreate;
// :181–188 SetData TYPE_JAMMALAN.
export const ST_ERANIKUS_IMMUNE = {
  entry: ENTRY.shadeOfEranikus,
  requiresFlag: ST_FLAGS.jammalanDead,
} as const;

/** Successful statue uses so far (0–6). Multi-entry objectGate counter. */
export function atalaiStatueUseCount(run: {
  objectGateUses?: Record<string, number>;
  objectGateUsedEntries?: Record<string, number[]>;
  flags?: readonly string[];
}): number {
  if (run.flags?.includes(ST_ATALAI_STATUE.setsFlag)) return ST_ATALAI_STATUE.needUses;
  const uses = run.objectGateUses?.[ST_ATALAI_STATUE.setsFlag];
  if (uses != null) return uses;
  return run.objectGateUsedEntries?.[ST_ATALAI_STATUE.setsFlag]?.length ?? 0;
}

/** Next statue entry required, or null when the puzzle is complete. */
export function expectedAtalaiStatueEntry(run: {
  objectGateUses?: Record<string, number>;
  objectGateUsedEntries?: Record<string, number[]>;
  flags?: readonly string[];
}): number | null {
  const i = atalaiStatueUseCount(run);
  if (i >= ST_ATALAI_STATUE.needUses) return null;
  return ST_ATALAI_STATUE.goEntries[i] ?? null;
}

// Port of ProcessStatueEvent for a GO entry. Cite: sunken_temple.cpp:329–354 — correct index increments;
// wrong returns false (no advance).
export function processAtalaiStatueGo(
  run: {
    objectGateUses?: Record<string, number>;
    objectGateUsedEntries?: Record<string, number[]>;
    flags?: readonly string[];
  },
  goEntry: number,
): { ok: boolean; complete: boolean; expected: number | null; nextIndex: number } {
  const i = atalaiStatueUseCount(run);
  const expected = expectedAtalaiStatueEntry(run);
  if (expected == null) {
    return { ok: false, complete: true, expected: null, nextIndex: i };
  }
  if (goEntry !== expected) {
    return { ok: false, complete: false, expected, nextIndex: i };
  }
  const nextIndex = i + 1;
  return {
    ok: true,
    complete: nextIndex >= ST_ATALAI_STATUE.needUses,
    expected,
    nextIndex,
  };
}

/** True when all six protector flags are set (Jammal/Ogom attackable). */
export function jammalBarrierDown(flags: readonly string[]): boolean {
  return ST_JAMMAL_BARRIER.protectorFlags.every((f) => flags.includes(f));
}

/** True when Eranikus is attackable (Jammal'an dead). */
export function eranikusAttackable(flags: readonly string[]): boolean {
  return flags.includes(ST_ERANIKUS_IMMUNE.requiresFlag);
}

// E4 — Avatar of Hakkar ritual (quest 3528): sourced timers and ids for pure helpers and discrete
// waves. Continuous re-arm, the fail branch and the UpdateEntry morph still need a controller arm.
export const ST_AVATAR_RITUAL = {
  encId: 'avatar-of-hakkar',
  /** First-wave Bloodkeeper as its own stop (0 map-109 rows). Cite: sunken_temple.cpp:430-441; survey E4. */
  firstWaveEncId: 'hakkari-bloodkeeper',
  /** Egg use → spell 12346 → event 8502. Cite: survey E4; Scripts.cpp:193–208. */
  startItem: 10465,
  startSpell: 12346,
  startEventId: 8502,
  // Pin for the egg-start stand-in; the C++ start is an item/spell, not a GO. Evil circles respawn
  // on IN_PROGRESS, distinct from the flame douse GOs. Cite: sunken_temple.cpp:256–258.
  goEntry: 148998,
  requiredItem: 10465,
  /** Eternal Flames 1–4. Cite: sunken_temple.h:54–57; keyId 10460 in gameobject-data. */
  flameEntries: [148418, 148419, 148420, 148421] as const,
  /** Cite: sunken_temple.h:12 MAX_FLAMES. */
  maxFlames: 4,
  /** Hakkari Blood — Bloodkeeper 100% drop; flame GO key. Cite: survey E4; GO keyId. */
  bloodItem: 10460,
  /** Evil God Summoning Circle. Cite: sunken_temple.h:59 GO_EVIL_CIRCLE. */
  evilCircle: 148998,
  /** Combat doors. Cite: sunken_temple.h:60–61. */
  doors: [149432, 149433] as const,
  /** Shade summon. Cite: sunken_temple.h:102 aSunkenTempleLocation[1]. */
  shadePos: { x: -466.8673, y: 272.31204, z: -90.7441, o: 3.5255 },
  /** Suppressor door spawns. Cite: sunken_temple.h:107–111 aHakkariDoorLocations. */
  suppressorDoors: [
    { x: -420.629, y: 276.682, z: -90.827 },
    { x: -512.015, y: 276.134, z: -90.827 },
  ] as const,
  /** Cite: sunken_temple.cpp:242 m_uiAvatarSummonTimer = 3000 on IN_PROGRESS. */
  firstWaveAtMs: 3_000,
  /** Cite: sunken_temple.cpp:445 m_uiAvatarSummonTimer = 50000 after first wave. */
  afterFirstWaveMs: 50_000,
  /** Cite: sunken_temple.cpp:467 urand(3000, 15000) later waves. */
  trickleMinMs: 3_000,
  trickleMaxMs: 15_000,
  /** Cite: sunken_temple.cpp:227 urand(15000, 45000) after flame SPECIAL (not 4th). */
  suppressorMinMs: 15_000,
  suppressorMaxMs: 45_000,
  /** Cite: sunken_temple.cpp:202–203 m_suppressionTimer = 20 * IN_MILLISECONDS. */
  suppressionFailMs: 20_000,
  /** Cite: sunken_temple.cpp:452 roll_chance_i(30) when m_bCanSummonBloodkeeper. */
  bloodkeeperChancePct: 30,
  /** Cite: sunken_temple.h:73–74 SPELL_SUPPRESSION / SPELL_SUMMON_AVATAR. */
  spellSuppression: 12623,
  spellSummonAvatar: 12639,
  setsFlag: ST_FLAGS.avatarRitual,
  flamesFlag: ST_FLAGS.avatarFlamesDone,
} as const;

// E4 discrete player-paced waves (the continuous 3–15s re-arm is residual): wave 0 first-circle
// minions, waves 1–3 a suppressor after each flame, wave 4 the Avatar. Cite: sunken_temple.cpp:430.
export const ST_AVATAR_WAVES = [
  { pack: [{ creatureEntry: ENTRY.hakkariMinion, count: 8 }] },
  { pack: [{ creatureEntry: ENTRY.nightmareSuppressor, count: 1 }] },
  { pack: [{ creatureEntry: ENTRY.nightmareSuppressor, count: 1 }] },
  { pack: [{ creatureEntry: ENTRY.nightmareSuppressor, count: 1 }] },
  { pack: [{ creatureEntry: ENTRY.avatarOfHakkar, count: 1 }] },
] as const;

/** Flame douses counted (0–4). Multi-entry objectGate counter; order free. */
export function avatarFlameUseCount(run: {
  objectGateUses?: Record<string, number>;
  objectGateUsedEntries?: Record<string, number[]>;
  flags?: readonly string[];
}): number {
  if (run.flags?.includes(ST_AVATAR_RITUAL.flamesFlag)) return ST_AVATAR_RITUAL.maxFlames;
  const uses = run.objectGateUses?.[ST_AVATAR_RITUAL.flamesFlag];
  if (uses != null) return uses;
  return run.objectGateUsedEntries?.[ST_AVATAR_RITUAL.flamesFlag]?.length ?? 0;
}

// Port of TYPE_AVATAR SPECIAL flame use (unordered, each entry ≤1). Cite: sunken_temple.cpp:194–229;
// Scripts.cpp:214–228 GOUse_go_eternal_flame.
export function processAvatarFlameGo(
  run: {
    objectGateUses?: Record<string, number>;
    objectGateUsedEntries?: Record<string, number[]>;
    flags?: readonly string[];
  },
  goEntry: number,
): { ok: boolean; complete: boolean; used: number; already: boolean } {
  const flames = ST_AVATAR_RITUAL.flameEntries as readonly number[];
  if (!flames.includes(goEntry)) {
    return { ok: false, complete: false, used: avatarFlameUseCount(run), already: false };
  }
  if (run.flags?.includes(ST_AVATAR_RITUAL.flamesFlag)) {
    return { ok: false, complete: true, used: ST_AVATAR_RITUAL.maxFlames, already: true };
  }
  const usedEntries = run.objectGateUsedEntries?.[ST_AVATAR_RITUAL.flamesFlag] ?? [];
  if (usedEntries.includes(goEntry)) {
    return { ok: false, complete: false, used: usedEntries.length, already: true };
  }
  const used = usedEntries.length + 1;
  return {
    ok: true,
    complete: used >= ST_AVATAR_RITUAL.maxFlames,
    used,
    already: false,
  };
}

/** True when 4 flames doused (morph to Avatar in C++). */
export function avatarRitualCanMorph(flags: readonly string[]): boolean {
  return flags.includes(ST_AVATAR_RITUAL.flamesFlag);
}

// Later-wave minion count from 0–99 roll. Cite: sunken_temple.cpp:449–450 uiRoll < 75 → 1; < 95 → 2; else
// 3.
export function avatarTrickleMinionCount(roll0to99: number): 1 | 2 | 3 {
  const r = roll0to99 | 0;
  if (r < 75) return 1;
  if (r < 95) return 2;
  return 3;
}

// Bloodkeeper re-summon this later wave? Cite: sunken_temple.cpp:452 m_bCanSummonBloodkeeper &&
// roll_chance_i(30).
export function avatarSummonsBloodkeeper(canSummon: boolean, roll0to99: number): boolean {
  return canSummon && (roll0to99 | 0) < ST_AVATAR_RITUAL.bloodkeeperChancePct;
}

/** Summon-only creature entries that must never appear in pure static trash packs. */
export const ST_SUMMON_ONLY_ENTRIES = new Set<number>([
  ENTRY.atalalarion, // 8580
  ENTRY.dreamscythe, // 5721
  ENTRY.weaver, // 5720
  ENTRY.avatarOfHakkar, // 8443
  ENTRY.shadeOfHakkar, // 8440
  ENTRY.hakkariMinion, // 8437
  ENTRY.hakkariBloodkeeper, // 8438
  ENTRY.nightmareSuppressor, // 8497
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
  atalalarion: [12887, 6524],
  dreamscythe: [16359, 12882, 12884],
  weaver: [16359, 12882, 12884],
  jammalan: [12468, 10893, 12480, 13540, 12492, 12479, 8376],
  ogom: [15654, 11660, 12493, 11639, 12471],
  morphaz: [12882, 12884],
  hazzas: [12884, 12882],
  avatarOfHakkar: [6607, 12888, 12889, 10893],
  shadeOfEranikus: [12890, 11876, 12891, 12535, 8876],
  zolo: [12506, 12058, 13540],
  gasher: [15580, 13540],
  loro: [12782, 15655, 9205, 13540, 8242, 3639],
  hukku: [12790, 12471, 12279, 13540, 9081],
  zulLor: [12530, 13540, 15584],
  mijan: [8362, 12492, 11899, 8148, 13540],
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

// Linear encounter graph: entrance swamp trash → Atal'alarion → upper temple trash → six protectors
// → Jammal'an (+ Ogom) → Morphaz / Hazzas → Avatar ritual → Shade of Eranikus.
function buildHandSpine(): EncounterDef[] {
  // Swamp / ooze band (entrance → lower temple)
  const deepLurkers = trashFromCensus(
    'deep-lurker',
    'Deep Lurker',
    ENTRY.deepLurker,
    STATIC.deepLurker,
  );
  const murkWorms = trashFromCensus('murk-worm', 'Murk Worm', ENTRY.murkWorm, STATIC.murkWorm);
  const saturatedOozes = trashFromCensus(
    'saturated-ooze',
    'Saturated Ooze',
    ENTRY.saturatedOoze,
    STATIC.saturatedOoze,
  );
  const oozelings = trashFromCensus('oozeling', 'Oozeling', ENTRY.oozeling, STATIC.oozeling);
  const slimeMaggots = trashFromCensus(
    'slime-maggot',
    'Slime Maggot',
    ENTRY.slimeMaggot,
    STATIC.slimeMaggot,
  );

  // Atal'ai humanoid / undead band
  const warriors = trashFromCensus(
    'atalai-warrior',
    "Atal'ai Warrior",
    ENTRY.atalaiWarrior,
    STATIC.atalaiWarrior,
  );
  const unliving = trashFromCensus(
    'unliving-atalai',
    "Unliving Atal'ai",
    ENTRY.unlivingAtalai,
    STATIC.unlivingAtalai,
  );
  const corpseEaters = trashFromCensus(
    'atalai-corpse-eater',
    "Atal'ai Corpse Eater",
    ENTRY.atalaiCorpseEater,
    STATIC.atalaiCorpseEater,
  );
  const witchDoctors = trashFromCensus(
    'atalai-witch-doctor',
    "Atal'ai Witch Doctor",
    ENTRY.atalaiWitchDoctor,
    STATIC.atalaiWitchDoctor,
  );
  const deathwalkers = trashFromCensus(
    'atalai-deathwalker',
    "Atal'ai Deathwalker",
    ENTRY.atalaiDeathwalker,
    STATIC.atalaiDeathwalker,
  );
  const highPriests = trashFromCensus(
    'atalai-high-priest',
    "Atal'ai High Priest",
    ENTRY.atalaiHighPriest,
    STATIC.atalaiHighPriest,
  );
  const slaves = trashFromCensus(
    'atalai-slave',
    "Atal'ai Slave",
    ENTRY.atalaiSlave,
    STATIC.atalaiSlave,
  );

  // Hakkari / dragonkin band (upper)
  const frostwings = trashFromCensus(
    'hakkari-frostwing',
    'Hakkari Frostwing',
    ENTRY.hakkariFrostwing,
    STATIC.hakkariFrostwing,
  );
  const sappers = trashFromCensus(
    'hakkari-sapper',
    'Hakkari Sapper',
    ENTRY.hakkariSapper,
    STATIC.hakkariSapper,
  );
  const wanderers = trashFromCensus(
    'nightmare-wanderer',
    'Nightmare Wanderer',
    ENTRY.nightmareWanderer,
    STATIC.nightmareWanderer,
  );
  const scalebanes = trashFromCensus(
    'nightmare-scalebane',
    'Nightmare Scalebane',
    ENTRY.nightmareScalebane,
    STATIC.nightmareScalebane,
  );
  const wyrmkin = trashFromCensus(
    'nightmare-wyrmkin',
    'Nightmare Wyrmkin',
    ENTRY.nightmareWyrmkin,
    STATIC.nightmareWyrmkin,
  );
  const whelps = trashFromCensus(
    'nightmare-whelp',
    'Nightmare Whelp',
    ENTRY.nightmareWhelp,
    STATIC.nightmareWhelp,
  );
  const spawnOfHakkar = trashFromCensus(
    'spawn-of-hakkar',
    'Spawn of Hakkar',
    ENTRY.spawnOfHakkar,
    STATIC.spawnOfHakkar,
  );

  const out: EncounterDef[] = [];

  // --- Entrance swamp → Atal'alarion (lower statue circle) ---
  out.push(
    ...slimeMaggots.slice(0, Math.ceil(slimeMaggots.length / 2)),
    ...deepLurkers.slice(0, Math.ceil(deepLurkers.length / 2)),
    ...murkWorms.slice(0, Math.ceil(murkWorms.length / 2)),
    ...saturatedOozes,
    ...oozelings,
    ...slaves.slice(0, Math.ceil(slaves.length / 3)),
    ...warriors.slice(0, Math.ceil(warriors.length / 2)),
    ...witchDoctors.slice(0, Math.ceil(witchDoctors.length / 3)),
  );

  // E1 - Atal'alarion via 6 statues in order S,N,SW,SE,NW,NE (live enforces sequence).
  out.push(
    boss(
      'atalalarion',
      "Atal'alarion",
      ENTRY.atalalarion,
      BOSS_SPELLS.atalalarion,
      [
        {
          kind: 'objectGate',
          goEntry: ST_ATALAI_STATUE.goEntry,
          goEntries: [...ST_ATALAI_STATUE.goEntries],
          needUses: ST_ATALAI_STATUE.needUses,
          setsFlag: ST_FLAGS.atalarionSummoned,
          once: true,
        },
        { kind: 'requiresFlag', flag: ST_FLAGS.atalarionSummoned },
      ],
      "Activate the six Atal'ai statues in order (S, N, SW, SE, NW, NE) to summon Atal'alarion.",
    ),
  );

  // --- Lower → balcony protectors (Atal'ai Defenders) ---
  out.push(
    ...unliving.slice(0, Math.ceil(unliving.length / 2)),
    ...corpseEaters.slice(0, Math.ceil(corpseEaters.length / 2)),
    ...deathwalkers.slice(0, Math.ceil(deathwalkers.length / 2)),
    ...slaves.slice(Math.ceil(slaves.length / 3), Math.ceil((2 * slaves.length) / 3)),
    ...witchDoctors.slice(
      Math.ceil(witchDoctors.length / 3),
      Math.ceil((2 * witchDoctors.length) / 3),
    ),
    ...highPriests,
  );

  // E2 - Six protectors (static mini-bosses); each setsFlag for Jammal barrier.
  out.push(
    boss(
      'zolo',
      'Zolo',
      ENTRY.zolo,
      BOSS_SPELLS.zolo,
      [{ kind: 'setsFlag', flag: ST_FLAGS.zoloDead }],
      "Zolo, one of the six Atal'ai Defenders, guards the balcony.",
    ),
    boss(
      'gasher',
      'Gasher',
      ENTRY.gasher,
      BOSS_SPELLS.gasher,
      [{ kind: 'setsFlag', flag: ST_FLAGS.gasherDead }],
      "Gasher, one of the six Atal'ai Defenders.",
    ),
    boss(
      'loro',
      'Loro',
      ENTRY.loro,
      BOSS_SPELLS.loro,
      [{ kind: 'setsFlag', flag: ST_FLAGS.loroDead }],
      "Loro, one of the six Atal'ai Defenders.",
    ),
    boss(
      'hukku',
      'Hukku',
      ENTRY.hukku,
      BOSS_SPELLS.hukku,
      [{ kind: 'setsFlag', flag: ST_FLAGS.hukkuDead }],
      "Hukku, one of the six Atal'ai Defenders.",
    ),
    boss(
      'zul-lor',
      "Zul'Lor",
      ENTRY.zulLor,
      BOSS_SPELLS.zulLor,
      [{ kind: 'setsFlag', flag: ST_FLAGS.zulLorDead }],
      "Zul'Lor, one of the six Atal'ai Defenders.",
    ),
    boss(
      'mijan',
      'Mijan',
      ENTRY.mijan,
      BOSS_SPELLS.mijan,
      [{ kind: 'setsFlag', flag: ST_FLAGS.mijanDead }],
      "Mijan, one of the six Atal'ai Defenders. When all six fall, Jammal'an's barrier drops.",
    ),
  );

  // --- Pre-Jammal residual atal'ai ---
  out.push(
    ...warriors.slice(Math.ceil(warriors.length / 2)),
    ...unliving.slice(Math.ceil(unliving.length / 2)),
    ...corpseEaters.slice(Math.ceil(corpseEaters.length / 2)),
    ...deathwalkers.slice(Math.ceil(deathwalkers.length / 2)),
    ...witchDoctors.slice(Math.ceil((2 * witchDoctors.length) / 3)),
    ...slaves.slice(Math.ceil((2 * slaves.length) / 3)),
  );

  // E3 - Jammal'an + Ogom 5711 pack (sunken_temple.h:23-24); immune until TYPE_PROTECTORS DONE
  // (cpp:91-96,176-177). On death sequential Dreamscythe then Weaver (engine multi-summon).
  out.push(
    boss(
      'jammalan-the-prophet',
      "Jammal'an the Prophet",
      ENTRY.jammalan,
      BOSS_SPELLS.jammalan,
      [
        { kind: 'requiresFlag', flag: ST_FLAGS.zoloDead },
        { kind: 'requiresFlag', flag: ST_FLAGS.gasherDead },
        { kind: 'requiresFlag', flag: ST_FLAGS.loroDead },
        { kind: 'requiresFlag', flag: ST_FLAGS.hukkuDead },
        { kind: 'requiresFlag', flag: ST_FLAGS.zulLorDead },
        { kind: 'requiresFlag', flag: ST_FLAGS.mijanDead },
        {
          kind: 'onDeathSummon',
          creatureEntry: ENTRY.dreamscythe,
          bossSpells: [...BOSS_SPELLS.dreamscythe],
        },
        {
          kind: 'onDeathSummon',
          creatureEntry: ENTRY.weaver,
          bossSpells: [...BOSS_SPELLS.weaver],
        },
        { kind: 'setsFlag', flag: ST_FLAGS.jammalanDead },
      ],
      "Jammal'an and Ogom stand behind the forcefield - immune until all six Atal'ai Defenders fall. His death summons Dreamscythe and Weaver.",
      [{ creatureEntry: ENTRY.ogom, count: 1 }],
    ),
  );

  // --- Dragonkin halls → Morphaz / Hazzas ---
  out.push(
    ...wanderers.slice(0, Math.ceil(wanderers.length / 2)),
    ...scalebanes.slice(0, Math.ceil(scalebanes.length / 2)),
    ...wyrmkin.slice(0, Math.ceil(wyrmkin.length / 2)),
    ...whelps.slice(0, Math.ceil(whelps.length / 2)),
    ...frostwings,
    ...sappers,
    ...slimeMaggots.slice(Math.ceil(slimeMaggots.length / 2)),
    ...deepLurkers.slice(Math.ceil(deepLurkers.length / 2)),
    ...murkWorms.slice(Math.ceil(murkWorms.length / 2)),
  );

  out.push(
    boss(
      'morphaz',
      'Morphaz',
      ENTRY.morphaz,
      BOSS_SPELLS.morphaz,
      undefined,
      'Morphaz, a green drake of the Nightmare, roosts in the upper halls.',
    ),
  );

  out.push(
    ...wanderers.slice(Math.ceil(wanderers.length / 2)),
    ...scalebanes.slice(Math.ceil(scalebanes.length / 2)),
    ...wyrmkin.slice(Math.ceil(wyrmkin.length / 2)),
    ...whelps.slice(Math.ceil(whelps.length / 2)),
    ...spawnOfHakkar,
  );

  out.push(
    boss(
      'hazzas',
      'Hazzas',
      ENTRY.hazzas,
      BOSS_SPELLS.hazzas,
      undefined,
      'Hazzas shares the dragon roost with Morphaz.',
    ),
  );

  // First Hakkar wave Bloodkeeper is its own stop so 10460 drops before the flame gate.
  // Summon-only (0 map-109 rows); origin = Shade loc. Cite: sunken_temple.cpp:430-441; sunken_temple.h:102; loot-data 8438.
  out.push({
    id: ST_AVATAR_RITUAL.firstWaveEncId,
    name: 'Hakkari Bloodkeeper',
    kind: 'trash',
    creatureEntry: ENTRY.hakkariBloodkeeper,
    origin: {
      x: ST_AVATAR_RITUAL.shadePos.x,
      y: ST_AVATAR_RITUAL.shadePos.y,
      z: ST_AVATAR_RITUAL.shadePos.z,
    },
    roomId: '109/sanctum-of-the-fallen-god',
    roomName: 'Sanctum of the Fallen God',
    events: [{ kind: 'setsFlag', flag: ST_FLAGS.avatarBlood }],
  });

  // E4 — Avatar ritual: egg start → first wave → 3 suppressors (flames 1–3) → Avatar. The continuous
  // trickle, the fail branch and the UpdateEntry morph are the header's residual.
  out.push({
    id: ST_AVATAR_RITUAL.encId,
    name: 'Avatar of Hakkar',
    kind: 'boss',
    creatureEntry: ENTRY.avatarOfHakkar,
    bossSpells: [...BOSS_SPELLS.avatarOfHakkar],
    origin: {
      x: ST_AVATAR_RITUAL.shadePos.x,
      y: ST_AVATAR_RITUAL.shadePos.y,
      z: ST_AVATAR_RITUAL.shadePos.z,
    },
    intro:
      "The Egg of Hakkar awakens the Soulflayer. Douse four Eternal Flames with Hakkari Blood as Nightmare Suppressors push in - then the Shade becomes Avatar of Hakkar.",
    events: [
      { kind: 'requiresFlag', flag: ST_FLAGS.avatarBlood },
      // Egg start stand-in on Evil Circle (not a flame — avoids dual-gate GO collision).
      {
        kind: 'objectGate',
        goEntry: ST_AVATAR_RITUAL.goEntry,
        requiredItem: ST_AVATAR_RITUAL.requiredItem,
        setsFlag: ST_FLAGS.avatarRitual,
        once: true,
      },
      { kind: 'requiresFlag', flag: ST_FLAGS.avatarRitual },
      // Flame douse ×4 (unordered; each entry ≤1). Blood key. Cite: Scripts.cpp:214–228.
      {
        kind: 'objectGate',
        goEntry: ST_AVATAR_RITUAL.flameEntries[0],
        goEntries: [...ST_AVATAR_RITUAL.flameEntries],
        needUses: ST_AVATAR_RITUAL.maxFlames,
        requiredItem: ST_AVATAR_RITUAL.bloodItem,
        setsFlag: ST_FLAGS.avatarFlamesDone,
        once: true,
      },
      {
        kind: 'waves',
        waves: ST_AVATAR_WAVES.map((w) => ({
          pack: w.pack.map((p) => ({ creatureEntry: p.creatureEntry, count: p.count })),
        })),
      },
    ],
  });

  // E5 - Shade of Eranikus: requiresFlag + floor immune until Jammal'an DONE.
  out.push(
    boss(
      'shade-of-eranikus',
      'Shade of Eranikus',
      ENTRY.shadeOfEranikus,
      BOSS_SPELLS.shadeOfEranikus,
      [
        // TYPE_JAMMALAN DONE → RemoveFlag IMMUNE. Cite: sunken_temple.cpp:181–188.
        { kind: 'requiresFlag', flag: ST_FLAGS.jammalanDead },
      ],
      "Shade of Eranikus is immune until Jammal'an the Prophet falls.",
    ),
  );

  return out;
}

function buildEncounters(): EncounterDef[] {
  // Hand spine = bosses + event-gated packs (mono trashFromCensus is empty).
  const spine = buildHandSpine();
  return buildClusterEncounters({
    mapId: 109,
    spine,
    entrance: entranceForInstance('sunken-temple'),
    
  });
}


/** Survey quests completable inside map 109. Elder Starsong 8713 excluded (D-10 Lunar Festival). */
export const ST_QUESTS = [
  1445, 1475, 3446, 3447, 4143, 4146, 8232, 8236, 8253, 8257, 8413, 8418, 8422, 8425, 1446, 3373,
] as const;

/** Export static census as entry → rounded count for tests. */
export const ST_STATIC: Readonly<Record<number, number>> = {
  [ENTRY.deepLurker]: STATIC.deepLurker,
  [ENTRY.murkWorm]: STATIC.murkWorm,
  [ENTRY.saturatedOoze]: STATIC.saturatedOoze,
  [ENTRY.atalaiWarrior]: STATIC.atalaiWarrior,
  [ENTRY.unlivingAtalai]: STATIC.unlivingAtalai,
  [ENTRY.atalaiCorpseEater]: STATIC.atalaiCorpseEater,
  [ENTRY.atalaiWitchDoctor]: STATIC.atalaiWitchDoctor,
  [ENTRY.hakkariFrostwing]: STATIC.hakkariFrostwing,
  [ENTRY.hakkariSapper]: STATIC.hakkariSapper,
  [ENTRY.nightmareWanderer]: STATIC.nightmareWanderer,
  [ENTRY.atalaiDeathwalker]: STATIC.atalaiDeathwalker,
  [ENTRY.atalaiHighPriest]: STATIC.atalaiHighPriest,
  [ENTRY.nightmareScalebane]: STATIC.nightmareScalebane,
  [ENTRY.nightmareWyrmkin]: STATIC.nightmareWyrmkin,
  [ENTRY.spawnOfHakkar]: STATIC.spawnOfHakkar,
  [ENTRY.oozeling]: STATIC.oozeling,
  [ENTRY.slimeMaggot]: STATIC.slimeMaggot,
  [ENTRY.atalaiSlave]: STATIC.atalaiSlave,
  [ENTRY.nightmareWhelp]: STATIC.nightmareWhelp,
};

export const SUNKEN_TEMPLE: InstanceDef = {
  id: 'sunken-temple',
  mapId: 109,
  name: "The Temple of Atal'Hakkar",
  portalZone: 'swampofsorrows',
  minLevel: 35, // entrance trigger 446 requiredLevel
  levelRange: [40, 51], // survey trash band
  lockoutMs: 0,
  description: '',
  quests: [...ST_QUESTS],
  encounters: buildEncounters(),
};

// Counts only pure static trash packs (no bosses, no mini-boss protectors, no flag-gated). Used to assert
// census match and summon-only exclusion.
export function sunkenTemplePureStaticTrashCounts(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of SUNKEN_TEMPLE.encounters) {
    if (enc.kind !== 'trash') continue;
    const req = (enc.events ?? []).some((e) => e.kind === 'requiresFlag');
    if (req) continue;
    add(enc.creatureEntry, 1);
    for (const p of enc.pack ?? []) add(p.creatureEntry, p.count);
  }
  return map;
}

/** Sum of authored kill counts per creature entry (trash + bosses + event spawns). */
export function sunkenTempleKillSupply(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of SUNKEN_TEMPLE.encounters) {
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
