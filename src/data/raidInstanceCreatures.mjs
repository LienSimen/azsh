// Outdoor zone.huntable exclusion for instance, invasion, guard and wrong-zone pollution. Raid and
// 5-man census rows, faction 370/1630, guards, civilians and out-of-band elites all drop out.

/** Classic 5-man dungeon map ids (1.12). Cite: enrich-dungeons.mjs DUNGEON_MAPS. */
export const CLASSIC_DUNGEON_MAP_IDS = Object.freeze([
  389, 43, 36, 33, 48, 34, 90, 47, 189, 129, 70, 209, 349, 109, 230, 229, 429, 289, 329,
]);

/** Classic raid instance map ids (1.12). Cite: enrich-dungeons.mjs RAID_MAPS. */
export const CLASSIC_RAID_MAP_IDS = Object.freeze([
  249, // Onyxia's Lair
  309, // Zul'Gurub
  409, // Molten Core
  469, // Blackwing Lair
  509, // Ruins of Ahn'Qiraj
  531, // Temple of Ahn'Qiraj
  533, // Naxxramas
]);

/** All classic instance maps (5-man + raid). */
export const CLASSIC_INSTANCE_MAP_IDS = Object.freeze([
  ...CLASSIC_DUNGEON_MAP_IDS,
  ...CLASSIC_RAID_MAP_IDS,
]);

// Classic battleground map ids. Deliberately NOT folded into CLASSIC_INSTANCE_MAP_IDS: a BG creature
// is as unreachable as a dungeon one, but the skip copy differs and a BG is not a dungeon.
export const CLASSIC_BG_MAP_IDS = Object.freeze([30, 489, 529]);

/** Battleground names by map id, for the honest-skip line. */
export const CLASSIC_BG_NAME_BY_MAP = Object.freeze({
  30: 'Alterac Valley',
  489: 'Warsong Gulch',
  529: 'Arathi Basin',
});

/** Creature entries that only ever spawn inside a battleground, same shape as instanceCreatureEntrySet.
 *  @param {Record<string, { entries?: Record<string, unknown> }> | null | undefined} dungeonCensus @param {{ outdoorSpawnedEntries?: Set<number> | Iterable<number> | null }} [opts] @returns {Set<number>} */
export function battlegroundCreatureEntrySet(dungeonCensus, opts = {}) {
  const out = new Set();
  if (dungeonCensus && typeof dungeonCensus === 'object') {
    for (const mapId of CLASSIC_BG_MAP_IDS) {
      const entries = dungeonCensus[String(mapId)]?.entries;
      if (!entries || typeof entries !== 'object') continue;
      for (const key of Object.keys(entries)) {
        const n = Number(key);
        if (Number.isFinite(n) && n > 0) out.add(n | 0);
      }
    }
  }
  const outdoor = opts.outdoorSpawnedEntries;
  if (outdoor) {
    for (const e of outdoor) out.delete(e | 0);
  }
  return out;
}

// Summon-only / event-spawned instance entries (0 static map rows). Cite: enrich-dungeons.mjs
// SUMMON_ONLY_ENTRIES — Gahz'rilla 7273 is the KI-762 anchor.
export const INSTANCE_SUMMON_ONLY_ENTRIES = Object.freeze([
  3654, 643, 12876, 7228, 7361, 8580, 5721, 5720, 8443, 7355, 7356,
  7796, 7275, 7273, 9027, 9028, 9029, 9030, 9031, 9032, 9537,
  10584, 10268, 10264, 10339, 10429, 10506, 1853, 10808, 11143, 10439,
  5762, 5763, 4627, 4978, 4977, 6215, 7915, 6575,
  7349, 7351, 7209, 7286, 7276, 7787, 7788, 7789, 8876, 8877,
  13533, 13456, 13716, 12238, 8925, 9476, 9541, 9178, 10601, 10602,
  10683, 10258, 10742,
  11460, 14566, 14351, 11598, 11058, 11142, 10813, 10394, 11030,
]);

// creature_template.Faction for the Ahn'Qiraj / C'Thun invasion set — not open-world grind.
// Cite: baked factionTemplates id 370 → faction 915; KI-762.
export const AQ_INVASION_FACTION_TEMPLATE_ID = 370;

// creature_template.Faction for Scourge Invasion combatants, not permanent outdoor grind.
// Cite: bake factionTemplates 1630 → faction 928, 13 rows; scourge_invasion.h; KI-874.
export const SCOURGE_INVASION_FACTION_TEMPLATE_ID = 1630;

/** Creature.h CREATURE_EXTRA_FLAG_GUARD — town/city guards, never grind targets. */
export const CREATURE_EXTRA_FLAG_GUARD = 0x00000400;
/** Creature.h:65 CIVILIAN — rescue NPCs / blackjack workers, never grind. */
export const CREATURE_EXTRA_FLAG_CIVILIAN = 0x00010000;
/** Creature.h:56 INVISIBLE — script triggers. */
export const CREATURE_EXTRA_FLAG_INVISIBLE = 0x00000080;
/** FactionTemplate 35 PLAYER/Friendly — Binding VW, credit doodads. Not outdoor grind. */
export const FRIENDLY_PLAYER_FACTION_TEMPLATE = 35;

// Outdoor world bosses (Wave T). Rank-3 templates without dungeonCensus rows that still belong outdoors.
// Cite: domain/creature/worldBosses.ts WORLD_BOSS_ENTRIES / classic creature ids.
export const WORLD_BOSS_ENTRIES = Object.freeze([
  12397, // Lord Kazzak
  6109, // Azuregos
  14889, // Ysondre
  14888, // Lethon
  14890, // Emeriss
  14887, // Taerar
]);

/** creature_template.Rank = CREATURE_ELITE_WORLDBOSS (3). */
export const CREATURE_RANK_WORLDBOSS = 3;

/** Level slack under zone p10 for zero-spawn keep (KI-786 Dalaran Miner L15 in SG). */
export const HUNTABLE_LEVEL_LO_SLACK = 10;
/** Level slack over zone p90 for zero-spawn keep (KI-800 Shadra L55 in Durotar). */
export const HUNTABLE_LEVEL_HI_SLACK = 15;
// High-side slack for rank≥1 local spawns: the same value as LO_SLACK and tighter than HI_SLACK, so
// ZG outdoor L54–57 drop from STV while the Cape rares stay. Cite: KI-865/867.
export const HUNTABLE_ELITE_LEVEL_HI_SLACK = HUNTABLE_LEVEL_LO_SLACK;

// SelectLevel mult floor for "script thrall, not outdoor grind" (Decoy! Number Two 25/20). Binding pets
// stay at ~1.0–1.1; Dreadsteed is 10 and is also event-only. Cite: KI-910.
export const EXTREME_SUMMON_MULT = 10;

/** Entries that must never appear on outdoor zone.huntable: instance census plus summon-only bosses.
 *  @param {Record<string, { entries?: Record<string, unknown> }> | null | undefined} dungeonCensus @param {{ outdoorSpawnedEntries?: Set<number> | Iterable<number> | null }} [opts] @returns {Set<number>} */
export function instanceCreatureEntrySet(dungeonCensus, opts = {}) {
  const out = new Set(INSTANCE_SUMMON_ONLY_ENTRIES);
  if (dungeonCensus && typeof dungeonCensus === 'object') {
    for (const mapId of CLASSIC_INSTANCE_MAP_IDS) {
      const entries = dungeonCensus[String(mapId)]?.entries;
      if (!entries || typeof entries !== 'object') continue;
      for (const key of Object.keys(entries)) {
        const n = Number(key);
        if (Number.isFinite(n) && n > 0) out.add(n | 0);
      }
    }
  }
  const outdoor = opts.outdoorSpawnedEntries;
  if (outdoor) {
    for (const e of outdoor) out.delete(e | 0);
  }
  return out;
}

/** Alias of instanceCreatureEntrySet, for KI-562 call sites.
 *  @param {Record<string, { entries?: Record<string, unknown> }> | null | undefined} dungeonCensus @param {{ outdoorSpawnedEntries?: Set<number> | Iterable<number> | null }} [opts] @returns {Set<number>} */
export function raidCreatureEntrySet(dungeonCensus, opts = {}) {
  return instanceCreatureEntrySet(dungeonCensus, opts);
}

/** @param {number} entry @param {Set<number> | null | undefined} blockEntries @returns {boolean} */
export function isRaidInstanceCreature(entry, blockEntries) {
  if (!blockEntries || blockEntries.size === 0) return false;
  return blockEntries.has(entry | 0);
}

/** @param {number} entry @returns {boolean} */
export function isWorldBossEntry(entry) {
  return WORLD_BOSS_ENTRIES.includes(entry | 0);
}

/** Rank-3 templates with no outdoor spawns are instance or event bosses; real world bosses stay.
 *  @param {number} entry @param {{ scaling?: { rank?: number }, rank?: number } | null | undefined} creature @param {Set<number> | null | undefined} outdoorSpawned @returns {boolean} */
export function isInstanceOnlyWorldbossRank(entry, creature, outdoorSpawned) {
  if (!creature) return false;
  if (isWorldBossEntry(entry)) return false;
  const rank = creature.scaling?.rank ?? creature.rank ?? 0;
  if ((rank | 0) !== CREATURE_RANK_WORLDBOSS) return false;
  if (outdoorSpawned?.has(entry | 0)) return false;
  return true;
}

/** Script-summoned thrall with absurd SelectLevel mults (Decoy! Number Two 25/20) — never grind. Cite: KI-910.
 *  @param {{ summoned?: boolean, scaling?: { healthMultiplier?: number, damageMultiplier?: number } } | null | undefined} creature @returns {boolean} */
export function isExtremeSummonedThrall(creature) {
  if (!creature?.summoned) return false;
  const hm = Number(creature.scaling?.healthMultiplier ?? 1);
  const dm = Number(creature.scaling?.damageMultiplier ?? 1);
  return hm >= EXTREME_SUMMON_MULT || dm >= EXTREME_SUMMON_MULT;
}

/** Whether a creature is excluded from outdoor zone.huntable; the instance block wins over the quest-target allowlist.
 *  @param {number} entry @param {{ factionId?: number, noXp?: boolean, extraFlags?: number, summoned?: boolean, scaling?: { rank?: number, healthMultiplier?: number, damageMultiplier?: number }, rank?: number } | null | undefined} creature @param {{ blockSet?: Set<number> | null, questTargetSet?: Set<number> | null, outdoorSpawned?: Set<number> | null }} [opts] @returns {boolean} */
export function isExcludedFromOutdoorHuntable(entry, creature, opts = {}) {
  const e = entry | 0;
  if (opts.blockSet?.has(e)) return true;
  if (isInstanceOnlyWorldbossRank(e, creature, opts.outdoorSpawned ?? null)) return true;
  if (!creature) return false;
  if ((creature.factionId | 0) === AQ_INVASION_FACTION_TEMPLATE_ID) return true;
  // Scourge Invasion (event) — starter/city camps with Scourge Strike, not zone wildlife.
  if ((creature.factionId | 0) === SCOURGE_INVASION_FACTION_TEMPLATE_ID) return true;
  // Extreme script thralls before quest-target allowlist (KI-910 Number Two).
  if (isExtremeSummonedThrall(creature)) return true;
  if ((creature.factionId | 0) === FRIENDLY_PLAYER_FACTION_TEMPLATE) return true;
  const extra = creature.extraFlags ?? 0;
  if ((extra & (CREATURE_EXTRA_FLAG_CIVILIAN | CREATURE_EXTRA_FLAG_INVISIBLE)) !== 0) {
    return true;
  }
  // Hostile quest targets (kill objective or baked item dropper, not CIVILIAN / faction-35) stay
  // discoverable: NO_XP only zeroes XP/honor. Cite: Formulas.h:368 Gain; Player.cpp:18727.
  if (opts.questTargetSet?.has(e)) return false;
  if (creature.noXp) return true;
  if ((extra & CREATURE_EXTRA_FLAG_GUARD) !== 0) return true;
  return false;
}

/** Index outdoor spawns: entry → set of zone ids, plus the flat outdoor set.
 *  @param {Array<{ id?: string, spawns?: Array<{ entry?: number }> }>} zones @returns {{ outdoorSpawned: Set<number>, spawnZonesByEntry: Map<number, Set<string>> }} */
export function buildOutdoorSpawnIndex(zones) {
  /** @type {Map<number, Set<string>>} */
  const spawnZonesByEntry = new Map();
  const outdoorSpawned = new Set();
  for (const z of zones ?? []) {
    const zid = z.id;
    if (!zid) continue;
    for (const s of z.spawns ?? []) {
      const e = (s.entry ?? 0) | 0;
      if (e <= 0) continue;
      outdoorSpawned.add(e);
      let set = spawnZonesByEntry.get(e);
      if (!set) {
        set = new Set();
        spawnZonesByEntry.set(e, set);
      }
      set.add(zid);
    }
  }
  return { outdoorSpawned, spawnZonesByEntry };
}

/** p10–p90 level band from a zone's outdoor spawns, preferring rank-0 templates so elite islands do not inflate p90.
 *  @param {Iterable<number>} spawnEntries @param {Map<number, { level?: number }> | ((e: number) => number)} levelOf @param {{ rankOf?: (e: number) => number } | ((e: number) => number)} [rankOfOrOpts] @returns {[number, number] | null} */
export function zoneSpawnLevelBand(spawnEntries, levelOf, rankOfOrOpts) {
  const lvls = [];
  const get =
    typeof levelOf === 'function'
      ? levelOf
      : (e) => levelOf.get(e | 0)?.level ?? 0;
  const rankOf =
    typeof rankOfOrOpts === 'function'
      ? rankOfOrOpts
      : rankOfOrOpts && typeof rankOfOrOpts === 'object'
        ? rankOfOrOpts.rankOf
        : null;
  if (typeof rankOf === 'function') {
    const normals = [];
    const all = [];
    for (const e of spawnEntries) {
      const id = e | 0;
      const lvl = get(id) | 0;
      if (lvl <= 0) continue;
      all.push(lvl);
      if ((rankOf(id) | 0) === 0) normals.push(lvl);
    }
    // Prefer NORMAL band when dense enough; else all ranks (tiny / elite-only pockets).
    const pool = normals.length >= 5 ? normals : all;
    if (pool.length === 0) return null;
    if (pool.length < 5) return [Math.min(...pool), Math.max(...pool)];
    pool.sort((a, b) => a - b);
    return [pool[Math.floor(pool.length * 0.1)] | 0, pool[Math.floor(pool.length * 0.9)] | 0];
  }
  for (const e of spawnEntries) {
    const lvl = get(e | 0) | 0;
    if (lvl > 0) lvls.push(lvl);
  }
  if (lvls.length === 0) return null;
  if (lvls.length < 5) return [Math.min(...lvls), Math.max(...lvls)];
  lvls.sort((a, b) => a - b);
  const lo = lvls[Math.floor(lvls.length * 0.1)] | 0;
  const hi = lvls[Math.floor(lvls.length * 0.9)] | 0;
  return [lo, hi];
}

/** Zone-aware keep decision for one huntable entry (instance + wrong-zone + level band).
 *  @param {number} entry @param {string} zoneId @param {{ blockSet?: Set<number> | null, questTargetSet?: Set<number> | null, outdoorSpawned?: Set<number> | null, spawnZonesByEntry?: Map<number, Set<string>> | null, localKillSet?: Set<number> | null, localSpawnSet?: Set<number> | null, levelBand?: [number, number] | null, creature?: { factionId?: number, noXp?: boolean, extraFlags?: number, level?: number, scaling?: { rank?: number }, rank?: number } | null }} ctx @returns {boolean} */
export function shouldKeepOutdoorHuntableEntry(entry, zoneId, ctx = {}) {
  const e = entry | 0;
  const cr = ctx.creature ?? null;
  // Direct kill target of a quest listed on this zone, checked before the local-spawn level band so
  // a mid-zone kill target above p90+slack stays. Extreme mult thralls stay excluded (KI-910).
  if (ctx.localKillSet?.has(e)) {
    // Instance block still wins — ZF/Uldaman bosses are not outdoor quest pulls.
    if (ctx.blockSet?.has(e)) return false;
    if (isInstanceOnlyWorldbossRank(e, cr, ctx.outdoorSpawned ?? null)) return false;
    if (isExtremeSummonedThrall(cr)) return false;
    return true;
  }
  // Local outdoor spawn belongs here. The high-side band still applies: Purgation Isle, Grim Batol
  // and ZG outdoor sit on zone.spawns but are not mid-band grind. World bosses stay.
  if (ctx.localSpawnSet?.has(e)) {
    if (isWorldBossEntry(e)) return true;
    if (
      isExcludedFromOutdoorHuntable(e, cr, {
        blockSet: ctx.blockSet,
        questTargetSet: ctx.questTargetSet,
        outdoorSpawned: ctx.outdoorSpawned,
      })
    ) {
      return false;
    }
    const lvl = (cr?.level | 0);
    if (lvl > 0 && ctx.levelBand) {
      const hi = ctx.levelBand[1] | 0;
      const rank = (cr?.scaling?.rank ?? cr?.rank ?? 0) | 0;
      // Elite islands use tighter slack (the LO_SLACK value) so STV ZG outdoor L54+ drops while
      // Cape rares stay; rank-0 keeps HI_SLACK. Inclusive, so L54 at exactly p90+10 is stripped.
      if (rank >= 1) {
        if (lvl >= hi + HUNTABLE_ELITE_LEVEL_HI_SLACK) return false;
      } else if (lvl > hi + HUNTABLE_LEVEL_HI_SLACK) {
        return false;
      }
    }
    return true;
  }
  if (
    isExcludedFromOutdoorHuntable(e, cr, {
      blockSet: ctx.blockSet,
      questTargetSet: ctx.questTargetSet,
      outdoorSpawned: ctx.outdoorSpawned,
    })
  ) {
    return false;
  }
  // Outdoor elsewhere but not here → wrong-zone orphan (KI-762 Stonevault on TN, Lathoric on DM).
  const homes = ctx.spawnZonesByEntry?.get(e);
  if (homes && homes.size > 0 && !homes.has(zoneId)) return false;
  // Zero outdoor spawns: keep only when level sits near this zone's spawn band
  // (quest-item rares like Ursangous). Far-low/high leaks (Miner, Shadra) drop.
  if ((!homes || homes.size === 0) && ctx.levelBand && (cr?.level | 0) > 0) {
    const lvl = cr.level | 0;
    const [lo, hi] = ctx.levelBand;
    if (lvl < lo - HUNTABLE_LEVEL_LO_SLACK) return false;
    if (lvl > hi + HUNTABLE_LEVEL_HI_SLACK) return false;
  }
  return true;
}

/** Remove blocked creatures from every outdoor zone's huntable list, mutating zones in place; with `creaturesByEntry` it also strips AQ faction / noXp / GUARD.
 *  @param {Array<{ id?: string, huntable?: number[], levelRange?: number[], quests?: number[] }>} zones @param {Set<number>} blockEntries @param {{ creaturesByEntry?: Map<number, { factionId?: number, noXp?: boolean, extraFlags?: number, level?: number, scaling?: { rank?: number }, rank?: number }>, questTargetSet?: Set<number>, levelByEntry?: Map<number, number>, outdoorSpawned?: Set<number> }} [opts] @returns {{ removed: number, byZone: Record<string, number> }} */
export function stripRaidCreaturesFromOutdoorHuntable(zones, blockEntries, opts = {}) {
  let removed = 0;
  const byZone = {};
  const creaturesByEntry = opts.creaturesByEntry ?? null;
  const questTargetSet = opts.questTargetSet ?? null;
  const levelByEntry = opts.levelByEntry ?? null;
  const outdoorSpawned = opts.outdoorSpawned ?? null;
  const hasBlock = !!(blockEntries && blockEntries.size);
  if (!hasBlock && !creaturesByEntry) return { removed, byZone };

  for (const z of zones ?? []) {
    const raw = z.huntable;
    if (!Array.isArray(raw) || raw.length === 0) continue;
    const next = raw.filter((entry) => {
      const e = entry | 0;
      const cr = creaturesByEntry?.get(e);
      if (
        isExcludedFromOutdoorHuntable(e, cr, {
          blockSet: blockEntries,
          questTargetSet,
          outdoorSpawned,
        })
      ) {
        return false;
      }
      return true;
    });
    const n = raw.length - next.length;
    if (n > 0) {
      z.huntable = next;
      removed += n;
      byZone[z.id ?? '?'] = n;
    }
    // Honest levelRange from remaining grind targets (KI-762 inflated [1,45] via L40–46 templates).
    if (levelByEntry && (n > 0 || !z.levelRange)) {
      const lvls = next.map((e) => levelByEntry.get(e | 0) ?? 0).filter((x) => x > 0);
      if (lvls.length) z.levelRange = [Math.min(...lvls), Math.max(...lvls)];
    }
  }
  return { removed, byZone };
}

/** Drop huntable rows that have outdoor spawns in other zones but none here and are not kill targets for a quest listed on this zone.
 *  @param {Array<{ id?: string, huntable?: number[], spawns?: Array<{ entry?: number }>, quests?: number[] }>} zones @param {Array<{ entry?: number, killTargets?: Array<{ creatureEntry: number }> }>} [quests] @param {{ creaturesByEntry?: Map<number, { level?: number }>, levelByEntry?: Map<number, number> }} [opts] @returns {{ removed: number, byZone: Record<string, number> }} */
export function stripWrongZoneSpawnOrphans(zones, quests = [], opts = {}) {
  let removed = 0;
  const byZone = {};
  const { outdoorSpawned, spawnZonesByEntry } = buildOutdoorSpawnIndex(zones);
  const creaturesByEntry = opts.creaturesByEntry ?? null;
  const levelByEntry = opts.levelByEntry ?? null;
  const levelOf = (e) =>
    levelByEntry?.get(e | 0)
    ?? creaturesByEntry?.get(e | 0)?.level
    ?? 0;
  /** creature_template.Rank via scaling.rank when present (NORMAL=0). */
  const rankOf = (e) => {
    const cr = creaturesByEntry?.get(e | 0);
    if (!cr) return 0;
    const r = cr.rank ?? cr.scaling?.rank;
    return (r | 0);
  };

  /** zoneId → Set of kill-target entries for quests listed on that zone */
  const killByZone = new Map();
  const questByEntry = new Map((quests ?? []).map((q) => [q.entry | 0, q]));
  for (const z of zones ?? []) {
    const zid = z.id;
    if (!zid) continue;
    const ks = new Set();
    for (const qe of z.quests ?? []) {
      const q = questByEntry.get(qe | 0);
      if (!q) continue;
      for (const kt of q.killTargets ?? []) {
        const e = kt.creatureEntry | 0;
        if (e > 0) ks.add(e);
      }
    }
    killByZone.set(zid, ks);
  }

  for (const z of zones ?? []) {
    const zid = z.id;
    if (!zid) continue;
    const raw = z.huntable;
    if (!Array.isArray(raw) || raw.length === 0) continue;
    const localKills = killByZone.get(zid) ?? new Set();
    const localSpawns = new Set();
    for (const s of z.spawns ?? []) {
      const e = (s.entry ?? 0) | 0;
      if (e > 0) localSpawns.add(e);
    }
    const band = zoneSpawnLevelBand(localSpawns, levelOf, { rankOf });
    const next = raw.filter((entry) => {
      const e = entry | 0;
      const cr = creaturesByEntry?.get(e) ?? { level: levelOf(e) };
      return shouldKeepOutdoorHuntableEntry(e, zid, {
        outdoorSpawned,
        spawnZonesByEntry,
        localKillSet: localKills,
        localSpawnSet: localSpawns,
        levelBand: band,
        creature: cr,
      });
    });
    const n = raw.length - next.length;
    if (n <= 0) continue;
    z.huntable = next;
    removed += n;
    byZone[zid] = (byZone[zid] ?? 0) + n;
  }
  return { removed, byZone };
}

/** Full outdoor huntable scrub: instance block, rank-3 / AQ / guard, wrong-zone and level band. Mutates zones; idempotent.
 *  @param {Array<{ id?: string, huntable?: number[], spawns?: Array<{ entry?: number }>, quests?: number[], levelRange?: number[] }>} zones @param {Record<string, { entries?: Record<string, unknown> }> | null | undefined} dungeonCensus @param {{ creaturesByEntry?: Map<number, { factionId?: number, noXp?: boolean, extraFlags?: number, level?: number, scaling?: { rank?: number }, rank?: number }>, questTargetSet?: Set<number>, levelByEntry?: Map<number, number>, quests?: Array<{ entry?: number, killTargets?: Array<{ creatureEntry: number }> }> }} [opts] @returns {{ removed: number, byZone: Record<string, number>, blockSize: number }} */
export function stripOutdoorHuntablePollution(zones, dungeonCensus, opts = {}) {
  const { outdoorSpawned } = buildOutdoorSpawnIndex(zones);
  const blockEntries = instanceCreatureEntrySet(dungeonCensus, { outdoorSpawnedEntries: outdoorSpawned });
  const a = stripRaidCreaturesFromOutdoorHuntable(zones, blockEntries, {
    creaturesByEntry: opts.creaturesByEntry,
    questTargetSet: opts.questTargetSet,
    levelByEntry: opts.levelByEntry,
    outdoorSpawned,
  });
  const b = stripWrongZoneSpawnOrphans(zones, opts.quests ?? [], {
    creaturesByEntry: opts.creaturesByEntry,
    levelByEntry: opts.levelByEntry,
  });
  // Recompute levelRange after both passes.
  const levelByEntry = opts.levelByEntry;
  if (levelByEntry && b.removed) {
    for (const z of zones ?? []) {
      const lvls = (z.huntable ?? [])
        .map((e) => levelByEntry.get(e | 0) ?? 0)
        .filter((n) => n > 0);
      if (lvls.length) z.levelRange = [Math.min(...lvls), Math.max(...lvls)];
    }
  }
  const byZone = { ...a.byZone };
  for (const [z, n] of Object.entries(b.byZone)) {
    byZone[z] = (byZone[z] ?? 0) + n;
  }
  return { removed: a.removed + b.removed, byZone, blockSize: blockEntries.size };
}
