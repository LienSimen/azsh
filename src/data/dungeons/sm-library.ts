// Scarlet Monastery Library wing (map 189) — InstanceDef, Houndmaster Loksey → Arcanist Doan.
// Authority: docs/dungeons/survey/09-scarlet-monastery.md, which carries the two residuals.

import type { EncounterDef, EncounterEvent, InstanceDef } from '../schema.ts';
import {
  entranceForInstance,
  buildClusterEncounters,
  wingFilterByNearestBoss,
} from './pack-from-clusters.ts';
import { CREATURE_FAMILY_ASSISTANCE_RADIUS } from '../../domain/creature/creatureAiConstants.ts';

// ---- Wing trash (position-clustered Library; survey static column) ----
// ONLY 4296 ×4, 4287 ×21, 4304 ×7, 4288 ×4 and 4291 ×16; other map-189 types are other wings.

const STATIC = {
  adept: 4, // 4296 Scarlet Adept
  gallant: 21, // 4287 Scarlet Gallant
  hound: 7, // 4304 Scarlet Tracking Hound
  beastmaster: 4, // 4288 Scarlet Beastmaster
  diviner: 16, // 4291 Scarlet Diviner
} as const;

const ENTRY = {
  adept: 4296,
  gallant: 4287,
  hound: 4304,
  beastmaster: 4288,
  diviner: 4291,
  loksey: 3974,
  doan: 6487,
} as const;

/** Wing-local survey quests (book/GO objectives in Library). */
export const SM_LIBRARY_QUESTS = [
  1160, // Test of Lore
  1049, // Compendium of the Fallen
  1050, // Mythology of the Titans
  1951, // Rituals of Power
] as const;

/** Static pack targets used by this graph (for tests / docs). */
export const SM_LIBRARY_STATIC = { ...STATIC } as const;

/** Library wing trash entries only (other SM wings excluded). */
export const SM_LIBRARY_TRASH_ENTRIES = [
  ENTRY.adept,
  ENTRY.gallant,
  ENTRY.hound,
  ENTRY.beastmaster,
  ENTRY.diviner,
] as const;

/** Flags for Library boss clears. */
export const SM_LIBRARY_FLAGS = {
  lokseyDone: 'sm-library-loksey-done',
  doanDone: 'sm-library-doan-done',
} as const;

// Arcanist Doan — Arcane Bubble plus Detonation at ≤50%. ScriptDev owns the combat kit, so there
// is no InstanceDef hpThreshold to double-fire. Cite: boss_arcanist_doan.cpp:30-124.
export const SM_DOAN = {
  encId: 'arcanist-doan',
  entry: ENTRY.doan,
  /** boss_arcanist_doan.cpp:33 SPELL_POLYMORPH */
  spellPolymorph: 13323,
  /** boss_arcanist_doan.cpp:34 SPELL_SILENCE */
  spellSilence: 8988,
  /** boss_arcanist_doan.cpp:35 SPELL_ARCANE_EXPLOSION */
  spellArcaneExplosion: 9433,
  /** boss_arcanist_doan.cpp:36 SPELL_DETONATION */
  spellDetonation: 9435,
  /** boss_arcanist_doan.cpp:37 SPELL_ARCANE_BUBBLE */
  spellArcaneBubble: 9438,
  /** Bubble once. Cite: cpp:88 GetHealthPercent() <= 50.0f */
  bubbleHpPct: 50,
  // After Bubble CAST_OK: DetonationTimer = 1000. Cite: boss_arcanist_doan.cpp:92 m_uiDetonationTimer =
  // 1000
  detonationAfterBubbleMs: 1_000,
  /** Reset m_uiPolymorphTimer. Cite: cpp:52 */
  polymorphInitialMs: 15_000,
  /** CAST_OK re-arm. Cite: cpp:102 */
  polymorphRepeatMs: 20_000,
  /** Reset m_uiSilenceTimer. Cite: cpp:53 */
  silenceInitialMs: 7_500,
  /** CAST_OK re-arm. Cite: cpp:112 urand(15000, 22000) */
  silenceRepeatMinMs: 15_000,
  silenceRepeatMaxMs: 22_000,
  /** Reset m_uiArcaneExplosionTimer. Cite: cpp:54 urand(1000, 3000) */
  arcaneExplosionInitialMinMs: 1_000,
  arcaneExplosionInitialMaxMs: 3_000,
  /** CAST_OK re-arm. Cite: cpp:121 urand(2500, 8500) */
  arcaneExplosionRepeatMinMs: 2_500,
  arcaneExplosionRepeatMaxMs: 8_500,
} as const;

// Pure: Detonation may fire only while Arcane Bubble is up and the 1s arm has elapsed; bubble down
// returns false. Cite: boss_arcanist_doan.cpp:69-95.
export function canDoanDetonate(args: {
  bubbleActive: boolean;
  /** True once Bubble CAST_OK armed the timer (cpp:92). */
  detonationArmed: boolean;
  /** Elapsed since Bubble land; omit to skip the 1s gate. */
  msSinceBubble?: number;
}): boolean {
  if (!args.bubbleActive) return false;
  if (!args.detonationArmed) return false;
  if (
    args.msSinceBubble != null
    && args.msSinceBubble < SM_DOAN.detonationAfterBubbleMs
  ) {
    return false;
  }
  return true;
}

// Pure: Bubble phase may fire once at/below 50% when not already shielded. Cite: boss_arcanist_doan.cpp:88
// !bShielded && GetHealthPercent() <= 50.0f
export function canDoanBubble(args: {
  hpPct: number;
  alreadyShielded: boolean;
}): boolean {
  if (args.alreadyShielded) return false;
  return args.hpPct <= SM_DOAN.bubbleHpPct;
}

// Houndmaster Loksey — Battle Shout / Bloodlust plus kennel call-for-help. No ScriptName, so EventAI
// owns combat and the floor expands living 4304 in radius. Cite: acid_classic.sql 397401–397404.
export const SM_LOKSEY = {
  encId: 'houndmaster-loksey',
  entry: ENTRY.loksey,
  /** ACID 397403/397404 ACTION_T_CAST Bloodlust */
  spellBloodlust: 6742,
  /** ACID 397402 ACTION_T_CAST Battle Shout */
  spellBattleShout: 6192,
  houndEntry: ENTRY.hound,
  // Kennel Tracking Hounds beside Loksey (static). Cite: 189_scarlet_monastery.sql @CGUID+230
  // 123.754,-261.435; +231 120.958,-257.75; +232 123.09,-258.452 (Loksey @ 119.938,-260.869).
  kennelHounds: [
    { x: 123.754, y: -261.435 },
    { x: 120.958, y: -257.75 },
    { x: 123.09, y: -258.452 },
  ] as const,
  // Default CallForHelp radius when template CallForHelp is 0. Cite: World.cpp
  // CONFIG_FLOAT_CREATURE_FAMILY_ASSISTANCE_RADIUS = 5.0f
  callForHelpYd: CREATURE_FAMILY_ASSISTANCE_RADIUS,
} as const;

/** Floor 4304 within CFH radius of Loksey (static kennel pack, not summons). */
export function lokseyCallForHelpTargets<
  T extends { entry: number; x: number; y: number; state: string },
>(
  loksey: { x: number; y: number },
  entities: readonly T[],
  radiusYd: number = SM_LOKSEY.callForHelpYd,
): T[] {
  return entities.filter((e) => {
    if (e.state === 'dead') return false;
    if (e.entry !== SM_LOKSEY.houndEntry) return false;
    return Math.hypot(e.x - loksey.x, e.y - loksey.y) <= radiusYd;
  });
}

/** Split a static spawn count into pack sizes in [2, 5] (prefer 4). Remainder 1 folded into prior pack. */
export function splitPackSizes(total: number, prefer = 4): number[] {
  if (total <= 0) return [];
  if (total === 1) return [1]; // single elite; rare for static trash
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
): EncounterDef {
  const enc: EncounterDef = {
    id,
    name,
    kind: 'trash',
    creatureEntry,
  };
  if (count > 1) enc.pack = [{ creatureEntry, count: count - 1 }];
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

// Boss spells: Loksey bake creature.spells; Doan from boss_arcanist_doan.cpp enum
// (bake has no 6487 spells — ScriptDev owns combat kit).
const BOSS_SPELLS = {
  loksey: [SM_LOKSEY.spellBloodlust, SM_LOKSEY.spellBattleShout],
  doan: [
    SM_DOAN.spellPolymorph,
    SM_DOAN.spellSilence,
    SM_DOAN.spellArcaneExplosion,
    SM_DOAN.spellDetonation,
    SM_DOAN.spellArcaneBubble,
  ],
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

// Linear encounter graph: kennel trash → Loksey → library hall → Doan. Combat kits are ScriptDev
// boss_arcanist_doan and EventAI Loksey 397401–04.
function buildHandSpine(): EncounterDef[] {
  const hounds = trashFromCensus('hound', 'Scarlet Tracking Hound', ENTRY.hound, STATIC.hound);
  const beastmasters = trashFromCensus(
    'beastmaster',
    'Scarlet Beastmaster',
    ENTRY.beastmaster,
    STATIC.beastmaster,
  );
  const gallants = trashFromCensus('gallant', 'Scarlet Gallant', ENTRY.gallant, STATIC.gallant);
  const adepts = trashFromCensus('adept', 'Scarlet Adept', ENTRY.adept, STATIC.adept);
  const diviners = trashFromCensus('diviner', 'Scarlet Diviner', ENTRY.diviner, STATIC.diviner);

  const gallantMid = Math.ceil(gallants.length / 2);
  const gallantPre = gallants.slice(0, gallantMid);
  const gallantPost = gallants.slice(gallantMid);

  const out: EncounterDef[] = [];

  out.push(...hounds, ...beastmasters, ...gallantPre);
  out.push(
    boss(
      SM_LOKSEY.encId,
      'Houndmaster Loksey',
      ENTRY.loksey,
      BOSS_SPELLS.loksey,
      [{ kind: 'setsFlag', flag: SM_LIBRARY_FLAGS.lokseyDone }],
      'Houndmaster Loksey and his scarlet hounds guard the Library kennels.',
    ),
  );

  out.push(...adepts, ...diviners, ...gallantPost);
  out.push(
    boss(
      SM_DOAN.encId,
      'Arcanist Doan',
      ENTRY.doan,
      BOSS_SPELLS.doan,
      [{ kind: 'setsFlag', flag: SM_LIBRARY_FLAGS.doanDone }],
      'Arcanist Doan studies forbidden tomes at the far end of the Library. At half health he shields and the room detonates.',
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
    entrance: entranceForInstance('sm-library'),
    includePack: wingFilterByNearestBoss(189, "lib"),
  });
}


export const SM_LIBRARY: InstanceDef = {
  id: 'sm-library',
  mapId: 189,
  wing: 'lib',
  name: 'Scarlet Monastery - Library',
  portalZone: 'tirisfal',
  minLevel: 20,
  levelRange: [33, 37], // Library trash/boss band
  lockoutMs: 0,
  description: '',
  quests: [...SM_LIBRARY_QUESTS],
  encounters: buildEncounters(),
};

/** Sum of authored trash counts per creature entry (primary + pack; bosses excluded). */
export function libraryStaticTrashCounts(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of SM_LIBRARY.encounters) {
    if (enc.kind !== 'trash') continue;
    add(enc.creatureEntry, 1);
    for (const p of enc.pack ?? []) add(p.creatureEntry, p.count);
  }
  return map;
}

/** All kill supply (trash + boss singles) for satisfiability checks. */
export function libraryKillSupply(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of SM_LIBRARY.encounters) {
    add(enc.creatureEntry, 1);
    for (const p of enc.pack ?? []) add(p.creatureEntry, p.count);
  }
  return map;
}
