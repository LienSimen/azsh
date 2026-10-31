// Scarlet Monastery Graveyard wing (map 189) — InstanceDef: Vishas, Thalnos and the rare CSE graves.
// Residual: Thalnos → Scorn 14693 is pure-gated because the product never arms game_event 89.

import type { EncounterDef, EncounterEvent, InstanceDef } from '../schema.ts';
import {
  entranceForInstance,
  buildClusterEncounters,
  killSupplyFromEncounter,
  wingFilterByNearestBoss,
} from './pack-from-clusters.ts';
import { dungeonSpawnsForMap } from '../dungeonSpawns.ts';
import { CREATURE_FAMILY_ASSISTANCE_RADIUS } from '../../domain/creature/creatureAiConstants.ts';

// ---- Wing trash assignment (survey avg positions - GY entries ONLY) ---- Mission table + survey census
// static column. Do not include Library/Armory/Cathedral trash. Totals: 4+2+12+13+6+43 = 80 static trash.

const STATIC = {
  scryer: 4, // 4293 Scarlet Scryer
  sentry: 2, // 4283 Scarlet Sentry
  torturer: 12, // 4306 Scarlet Torturer
  anguished: 13, // 6426 Anguished Dead
  phantasm: 6, // 6427 Haunting Phantasm
  spirit: 43, // 4308 Unfettered Spirit
} as const;

const ENTRY = {
  scryer: 4293,
  sentry: 4283,
  torturer: 4306,
  anguished: 6426,
  phantasm: 6427,
  spirit: 4308,
  // Bosses (survey order)
  vishas: 3983,
  thalnos: 4543,
  // CSE candidates (classic-db INSERT order). Cite: 189_scarlet_monastery.sql:531-533
  fallenChampion: 6488,
  ironspine: 6489,
  azshir: 6490,
  // Scorn 14693 — seasonal only (game_event 89); pure-gated, not on spine
} as const;

// Six grave CSE slots: creature.id=0 resolves uniformly to {6488,6489,6490} on ResetEntry, with
// presence gated by pool_template 46001 max_limit=1. Cite: 189_scarlet_monastery.sql:520-533.
export const SM_GRAVEYARD_RARE_POOL = {
  candidates: [ENTRY.fallenChampion, ENTRY.ironspine, ENTRY.azshir] as const,
  graveGuids: [1890342, 1890343, 1890344, 1890345, 1890346, 1890347] as const,
  /** Baked pool_template id (max_limit=1). Cite: pools.json 46001 */
  poolId: 46001,
  /** Explicit substitute chance % (Unfettered Spirit 1890263). Cite: sql:797 */
  substituteChance: 70,
  substituteGuid: 1890263,
} as const;

// Max-coverage kill supply per candidate if all 6 graves were up (CSE). Physical: pool max_limit=1 → ≤1
// rare guid; CSE then picks 1 of 3.
export const SM_GRAVEYARD_RARE_EXPECTED = {
  ironspine: SM_GRAVEYARD_RARE_POOL.graveGuids.length,
  azshir: SM_GRAVEYARD_RARE_POOL.graveGuids.length,
  fallenChampion: SM_GRAVEYARD_RARE_POOL.graveGuids.length,
} as const;

// Uniform CSE roll for one grave. Cite: ObjectMgr.h:593 irand(0, size-1). `rng` must return [0, 1) — inject
// mulberry32 (never Math.random).
export function rollSmGraveyardRare(rng: () => number): number {
  const c = SM_GRAVEYARD_RARE_POOL.candidates;
  const idx = Math.min(c.length - 1, Math.floor(rng() * c.length));
  return c[idx]!;
}

/** Roll all six graves independently (CSE only; pool presence is rareRoll). */
export function rollSmGraveyardAllGraves(rng: () => number): number[] {
  return SM_GRAVEYARD_RARE_POOL.graveGuids.map(() => rollSmGraveyardRare(rng));
}

/** Count rolled entries (boundary: empty → zeros). */
export function countSmGraveyardRares(
  rolled: readonly number[],
): { fallenChampion: number; ironspine: number; azshir: number } {
  let fallenChampion = 0;
  let ironspine = 0;
  let azshir = 0;
  for (const e of rolled) {
    if (e === ENTRY.fallenChampion) fallenChampion++;
    else if (e === ENTRY.ironspine) ironspine++;
    else if (e === ENTRY.azshir) azshir++;
  }
  return { fallenChampion, ironspine, azshir };
}

/** Graveyard boss clear flags. */
export const SM_GRAVEYARD_FLAGS = {
  vishasDeath: 'sm-graveyard-vishas-death',
  thalnosDeath: 'sm-graveyard-thalnos-death',
} as const;

// Interrogator Vishas — torture yells plus the Vorrel death yell. Combat is Immolate 8981 on spawn
// with baked 14032 Shadow Word: Pain. Cite: acid_classic.sql 398301–398305.
export const SM_VISHAS = {
  encId: 'interrogator-vishas',
  entry: ENTRY.vishas,
  /** ACID 398301 ACTION_T_CAST on spawn / creature_template_spells */
  spellImmolate: 8981,
  /** Bake creature.spells secondary (survey SW:Pain). */
  spellShadowWordPain: 14032,
  /** EventAI HP yell thresholds. Cite: ACID 398303/398304 event_type=2 param1=60/30 */
  yellHpPcts: [60, 30] as const,
  /** ACID text entries (creature_ai_scripts action_param1). */
  textAggro: 6204,
  textAt60: 6206,
  textAt30: 6207,
  textKill: 6205,
  /** Vorrel Sengutz. Cite: scarlet_monastery.h:17 NPC_VORREL */
  vorrelEntry: 3981,
  /** instance_scarlet_monastery.cpp:75 DoScriptText SAY_TRIGGER_VORREL */
  sayVorrel: -1189015,
  /** Default CFH for torture-room trash (no scripted entry list). */
  callForHelpYd: CREATURE_FAMILY_ASSISTANCE_RADIUS,
  /** Torture-room trash that may CFH-join (survey GY wing). */
  callForHelpEntries: [ENTRY.torturer, ENTRY.scryer, ENTRY.sentry] as const,
} as const;

// Pure: next HP yell threshold at/below current HP that has not fired. Cite: ACID 398303/398304 EVENT_T_HP
// 60% / 30%.
export function vishasYellThreshold(
  hpPct: number,
  alreadyYelled: readonly number[],
): number | null {
  for (const t of SM_VISHAS.yellHpPcts) {
    if (hpPct <= t && !alreadyYelled.includes(t)) return t;
  }
  return null;
}

// Pure: Vorrel death yell only after Vishas dies. Negative: vishasDead=false → false. Cite:
// instance_scarlet_monastery.cpp:69-77.
export function vishasVorrelYell(args: { vishasDead: boolean }): boolean {
  return args.vishasDead === true;
}

/** Torture-room trash within default CFH of Vishas. */
export function vishasCallForHelpTargets<
  T extends { entry: number; x: number; y: number; state: string },
>(
  vishas: { x: number; y: number },
  entities: readonly T[],
  radiusYd: number = SM_VISHAS.callForHelpYd,
): T[] {
  const set = new Set<number>(SM_VISHAS.callForHelpEntries);
  return entities.filter((e) => {
    if (e.state === 'dead') return false;
    if (!set.has(e.entry)) return false;
    return Math.hypot(e.x - vishas.x, e.y - vishas.y) <= radiusYd;
  });
}

// Bloodmage Thalnos — ranged kit plus a 50% yell. Cite: ACID 454301–454304; bake spells.
// Scorn 14693 is a pure count; the residual is game_event 89 never armed in product.
export const SM_THALNOS = {
  encId: 'bloodmage-thalnos',
  entry: ENTRY.thalnos,
  /** Bake creature.spells (Fire Nova, Flame Shock, Flame Spike, Shadow Bolt). */
  spellFireNova: 12470,
  spellFlameShock: 8053,
  spellFlameSpike: 8814,
  spellShadowBolt: 9613,
  /** ACID 454304 EVENT_T_HP param1=50 */
  yellHpPct: 50,
  textAggro: 6201,
  textAt50: 6202,
  textKill: 6203,
  /** Cite: classic-db 189_scarlet_monastery.sql:866 command 10 + condition 6089 */
  scornEntry: 14693,
  scornDelayMs: 1_000,
  scornSpawn: { x: 1798.01, y: 1223.17, z: 18.274 },
} as const;

/** Pure: 50% yell once. Cite: ACID 454304. */
export function thalnosYellAt50(args: {
  hpPct: number;
  alreadyYelled: boolean;
}): boolean {
  if (args.alreadyYelled) return false;
  return args.hpPct <= SM_THALNOS.yellHpPct;
}

// Pure: Scorn only when Scourge Invasion is active (product never arms). Negative: invasionActive=false →
// 0. Cite: dbscripts condition 6089.
export function thalnosScornSpawnCount(args: {
  thalnosDead: boolean;
  invasionActive: boolean;
}): number {
  if (!args.thalnosDead || !args.invasionActive) return 0;
  return 1;
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
// Sourced via creature entries 3983 / 4543 / 6488 / 6489 / 6490.
const BOSS_SPELLS = {
  vishas: [SM_VISHAS.spellImmolate, SM_VISHAS.spellShadowWordPain],
  thalnos: [
    SM_THALNOS.spellFireNova,
    SM_THALNOS.spellFlameShock,
    SM_THALNOS.spellFlameSpike,
    SM_THALNOS.spellShadowBolt,
  ],
  ironspine: [21007, 3815],
  azshir: [5137, 7399, 9373],
  fallenChampion: [19644, 21949, 19642, 7366, 15496, 7160],
} as const;

/** Bake-sourced spells for a rolled rare entry (CSE). Cite: BOSS_SPELLS map / creature.spells. */
export function smGraveyardRareBossSpells(entry: number): readonly number[] {
  if (entry === ENTRY.ironspine) return BOSS_SPELLS.ironspine;
  if (entry === ENTRY.azshir) return BOSS_SPELLS.azshir;
  if (entry === ENTRY.fallenChampion) return BOSS_SPELLS.fallenChampion;
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

// Linear encounter graph in survey boss order: entrance Scarlet trash → Vishas → mid undead trash
// → Thalnos → six CSE grave slots (pool 46001 + spawn_entry). Vishas death is flavour only.
function buildHandSpine(): EncounterDef[] {
  const scryers = trashFromCensus('scryer', 'Scarlet Scryer', ENTRY.scryer, STATIC.scryer);
  const sentries = trashFromCensus('sentry', 'Scarlet Sentry', ENTRY.sentry, STATIC.sentry);
  const torturers = trashFromCensus(
    'torturer',
    'Scarlet Torturer',
    ENTRY.torturer,
    STATIC.torturer,
  );
  const anguished = trashFromCensus(
    'anguished',
    'Anguished Dead',
    ENTRY.anguished,
    STATIC.anguished,
  );
  const phantasms = trashFromCensus(
    'phantasm',
    'Haunting Phantasm',
    ENTRY.phantasm,
    STATIC.phantasm,
  );
  const spirits = trashFromCensus(
    'spirit',
    'Unfettered Spirit',
    ENTRY.spirit,
    STATIC.spirit,
  );

  // Entrance humanoids (torture wing) → half pre-Vishas, half post
  const tortMid = Math.ceil(torturers.length / 2);
  const tortPre = torturers.slice(0, tortMid);
  const tortPost = torturers.slice(tortMid);

  // Undead mid-wing: split pre/post Thalnos for spacing
  const angMid = Math.ceil(anguished.length / 2);
  const angPre = anguished.slice(0, angMid);
  const angPost = anguished.slice(angMid);

  const spiritMid = Math.ceil(spirits.length / 2);
  const spiritPre = spirits.slice(0, spiritMid);
  const spiritPost = spirits.slice(spiritMid);

  const phantMid = Math.ceil(phantasms.length / 2);
  const phantPre = phantasms.slice(0, phantMid);
  const phantPost = phantasms.slice(phantMid);

  const out: EncounterDef[] = [];

  // --- Entrance → Interrogator Vishas ---
  out.push(...scryers, ...sentries, ...tortPre);
  out.push(
    boss(
      SM_VISHAS.encId,
      'Interrogator Vishas',
      ENTRY.vishas,
      BOSS_SPELLS.vishas,
      [{ kind: 'setsFlag', flag: SM_GRAVEYARD_FLAGS.vishasDeath }],
      'Interrogator Vishas works the torture racks. When he falls, Vorrel Sengutz cries out.',
    ),
  );

  // --- Vishas → Bloodmage Thalnos ---
  if (tortPost.length > 0) {
    const first = tortPost[0]!;
    out.push(
      trashPull(
        first.id,
        first.name,
        first.creatureEntry,
        1 + (first.pack?.[0]?.count ?? 0),
        "Vorrel Sengutz cries out as Vishas falls - quest 1051 Vorrel's Revenge.",
      ),
    );
    out.push(...tortPost.slice(1));
  }
  out.push(...angPre, ...phantPre, ...spiritPre);
  out.push(
    boss(
      SM_THALNOS.encId,
      'Bloodmage Thalnos',
      ENTRY.thalnos,
      BOSS_SPELLS.thalnos,
      [{ kind: 'setsFlag', flag: SM_GRAVEYARD_FLAGS.thalnosDeath }],
      'Bloodmage Thalnos, a skeletal sorcerer, commands the deeper crypt with shadow and fire.',
    ),
  );

  // --- Thalnos → 6 CSE rare graves (pool 46001 max_limit=1 + spawn_entry) ---
  // Cite: classic-db 189_scarlet_monastery.sql:520-533,777-803; ObjectMgr.h:593.
  out.push(...angPost, ...phantPost);
  out.push(...buildRareGraveEncounters());

  // Remaining spirits after the graves
  out.push(...spiritPost);

  return out;
}

// One boss row per grave guid, placeholder entry candidates[0], CSE resolved at fight start. Unique
// names so multi-slot dedupe does not collapse the pins; pool 46001 filters presence.
function buildRareGraveEncounters(): EncounterDef[] {
  const byGuid = new Map(
    dungeonSpawnsForMap(189).map((s) => [s.guid, s] as const),
  );
  const cands = [...SM_GRAVEYARD_RARE_POOL.candidates];
  const placeholder = cands[0]!;
  const out: EncounterDef[] = [];
  for (let i = 0; i < SM_GRAVEYARD_RARE_POOL.graveGuids.length; i++) {
    const guid = SM_GRAVEYARD_RARE_POOL.graveGuids[i]!;
    const s = byGuid.get(guid);
    const enc: EncounterDef = {
      id: `sm-grave-rare-${i}`,
      name: `Graveyard rare ${i + 1}`,
      kind: 'boss',
      creatureEntry: placeholder,
      poolCandidates: cands,
      spawnGuids: [guid],
      intro: 'A rare elite may rise from this grave.',
      // Pool 46001 max_limit=1; isComplete ignores optional.
      optional: true,
    };
    if (s) {
      enc.origin = { x: s.x, y: s.y, z: s.z };
    }
    out.push(enc);
  }
  return out;
}

function buildEncounters(): EncounterDef[] {
  // Hand spine = bosses + CSE graves (mono trashFromCensus is empty).
  const spine = buildHandSpine();
  return buildClusterEncounters({
    mapId: 189,
    spine,
    entrance: entranceForInstance('sm-graveyard'),
    includePack: wingFilterByNearestBoss(189, 'gy'),
    // Strip all three rare entries + claim grave guids so clusters do not CSE-trash them.
    extraStrip: [...SM_GRAVEYARD_RARE_POOL.candidates],
    excludeGuids: new Set(SM_GRAVEYARD_RARE_POOL.graveGuids),
  });
}


/** Wing-local survey quests (multi-wing kill quests 1048/1053 live on other wings). */
export const SM_GRAVEYARD_QUESTS = [
  1051, // Vorrel's Revenge - starts inside (Vorrel)
  635, // Crystal in the Mountains - item-started carry (survey lists inside)
] as const;

/** Rounded static pack targets used by this graph (for tests / docs). */
export const SM_GRAVEYARD_STATIC = { ...STATIC } as const;

/** Bake-sourced boss spell lists (for tests). */
export const SM_GRAVEYARD_BOSS_SPELLS = { ...BOSS_SPELLS } as const;

export const SM_GRAVEYARD: InstanceDef = {
  id: 'sm-graveyard',
  mapId: 189,
  wing: 'gy',
  name: 'Scarlet Monastery - Graveyard',
  portalZone: 'tirisfal',
  minLevel: 20, // entrance triggers requiredLevel
  levelRange: [30, 34], // GY trash/boss band
  lockoutMs: 0,
  description: '',
  quests: [...SM_GRAVEYARD_QUESTS],
  encounters: buildEncounters(),
};

/** Sum of authored trash counts per creature entry (primary + pack; bosses excluded). */
export function smGraveyardStaticTrashCounts(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of SM_GRAVEYARD.encounters) {
    if (enc.kind !== 'trash') continue;
    add(enc.creatureEntry, 1);
    for (const p of enc.pack ?? []) add(p.creatureEntry, p.count);
  }
  return map;
}

/** Kill supply with CSE max-coverage (each poolCandidates slot counts for every candidate). */
export function smGraveyardKillSupply(): Map<number, number> {
  const map = new Map<number, number>();
  for (const enc of SM_GRAVEYARD.encounters) {
    for (const [entry, n] of killSupplyFromEncounter(enc)) {
      map.set(entry, (map.get(entry) ?? 0) + n);
    }
  }
  return map;
}
