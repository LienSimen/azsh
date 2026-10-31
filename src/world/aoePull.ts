// Player-chosen outdoor pull size. CallAssistance still joins on its own.
// Named / world-boss / rare / unique elites stay one target. Cite: CREATURE_ELITE_*; uniqueEliteDetectionJoins.

import type { DataStore } from '../data/dataStore.ts';
import { CREATURE_ELITE } from '../data/schema.ts';
import { canAttackCreature } from '../domain/creature/faction.ts';
import { unitCannotBeAttacked } from '../domain/creature/unitFlags.ts';
import { PULL_COUNT_MAX, PULL_COUNT_MIN, PULL_COUNT_PRESET_MAX } from '../autopilot/config.ts';
import { pullOriginsForCreature, spatialPullAt, zoneSpawns } from './world.ts';

/** CreatureStaticFlags::BOSS_MOB. Cite: TargetedMovementGenerator.cpp:144. */
const STATIC_FLAG_BOSS_MOB = 0x00010000;

export { PULL_COUNT_MAX, PULL_COUNT_MIN, PULL_COUNT_PRESET_MAX };

export type AoePullClass = 'normal' | 'elite' | 'named';

export type AoePullCfg = {
  pullNormalCount: number;
  pullEliteCount: number;
};

export type AoePullHit = {
  entry: number;
  distance: number;
};

const spawnCountCache = new WeakMap<DataStore, Map<number, number>>();

function creatureRankOf(ds: DataStore, entry: number): number {
  const c = ds.creature(entry) as { rank?: number; scaling?: { rank?: number } } | undefined;
  if (!c) return 0;
  return c.rank ?? c.scaling?.rank ?? 0;
}

/** Outdoor spawn rows per entry, including world-boss overlays. */
export function outdoorSpawnCount(ds: DataStore, entry: number): number {
  let map = spawnCountCache.get(ds);
  if (!map) {
    map = new Map();
    for (const z of ds.zones()) {
      for (const s of zoneSpawns(ds, z.id)) {
        map.set(s.entry, (map.get(s.entry) ?? 0) + 1);
      }
    }
    spawnCountCache.set(ds, map);
  }
  return map.get(entry) ?? 0;
}

/**
 * Bodies of this creature standing in the world at once. `spawnCap` is the baked
 * spawn_group.MaxCount / pool_template.max_limit; without one, every spawn row is a body.
 */
export function spawnCapFor(ds: DataStore, entry: number): number {
  const cap = ds.creature(entry)?.spawnCap;
  if (typeof cap === 'number' && cap > 0) return cap;
  return outdoorSpawnCount(ds, entry);
}

/** World boss / rare / rare-elite / unique elite (one body). Cite: CREATURE_ELITE_*; spawn_group.MaxCount. */
export function isNamedSoloPull(ds: DataStore, entry: number): boolean {
  const c = ds.creature(entry);
  if (!c) return false;
  if (((c.staticFlags ?? 0) & STATIC_FLAG_BOSS_MOB) !== 0) return true;
  const rank = creatureRankOf(ds, entry);
  if (
    rank === CREATURE_ELITE.WORLDBOSS
    || rank === CREATURE_ELITE.RAREELITE
    || rank === CREATURE_ELITE.RARE
  ) return true;
  if (rank >= CREATURE_ELITE.ELITE && spawnCapFor(ds, entry) === 1) return true;
  return false;
}

export function aoePullClass(ds: DataStore, entry: number): AoePullClass {
  if (isNamedSoloPull(ds, entry)) return 'named';
  return creatureRankOf(ds, entry) === CREATURE_ELITE.ELITE ? 'elite' : 'normal';
}

export function aoePullCap(cls: AoePullClass, cfg: AoePullCfg): number {
  if (cls === 'named') return 1;
  const raw = cls === 'elite' ? cfg.pullEliteCount : cfg.pullNormalCount;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 1;
  return Math.max(PULL_COUNT_MIN, Math.min(PULL_COUNT_MAX, Math.round(raw)));
}

/**
 * Yards the player gathers over when the dial asks for more than stands in aggro range. Measured
 * 2026-09-05 over 2223 huntable entries at level 26, dial 8: aggro range alone left 589 of them
 * unable to add anyone and filled the dial for 367; 60 yd leaves 141 and fills 1519.
 */
export const PULL_GATHER_YD = 60;

/** Best-camp extras per (zone, entry, level, want). A pull re-reads the same camp every fight. */
const extrasCache = new WeakMap<DataStore, Map<string, AoePullHit[]>>();

/**
 * Nearby same-class spawns filling the player cap, from the entry's BEST camp rather than its
 * first spawn row: same aggro rule, but joins rose 4457 -> 8896 over 2166 entries measured
 * 2026-09-05. `opts.prefer` (quest kill targets) fills the pull ahead of bystanders.
 */
export function aoePullExtras(
  ds: DataStore,
  zoneId: string,
  primaryEntry: number,
  cfg: AoePullCfg,
  playerLevel: number,
  opts?: { race?: number; atWar?: ReadonlySet<number>; prefer?: ReadonlySet<number> },
): AoePullHit[] {
  const cls = aoePullClass(ds, primaryEntry);
  const want = aoePullCap(cls, cfg) - 1;
  if (want <= 0 || cls === 'named') return [];

  let byKey = extrasCache.get(ds);
  if (!byKey) { byKey = new Map(); extrasCache.set(ds, byKey); }
  const prefer = opts?.prefer;
  const preferKey = prefer && prefer.size ? [...prefer].sort((a, b) => a - b).join('.') : '';
  const key = `${zoneId}|${primaryEntry}|${playerLevel}|${want}|${opts?.race ?? 0}|${preferKey}`;
  const hit = byKey.get(key);
  if (hit) return hit.slice(0, want);

  const huntable = new Set(ds.zone(zoneId)?.huntable ?? []);
  huntable.add(primaryEntry);
  const joinable = (
    origin: { x: number; y: number; z: number; map: number },
  ): { out: AoePullHit[]; wanted: number } => {
    // The mobs that would really add on their own, then - only while the dial is still short -
    // the ones the player walks over to and gathers, nearest first.
    const seen = spatialPullAt(ds, zoneId, origin, playerLevel, {
      requireAggroOnSight: true,
      excludeOriginSpawn: true,
      primaryEntry,
    });
    const gathered: AoePullHit[] = [];
    for (const s of zoneSpawns(ds, zoneId)) {
      if (s.map !== origin.map) continue;
      const d = Math.hypot(s.x - origin.x, s.y - origin.y);
      if (!(d > 0) || d > PULL_GATHER_YD) continue;
      gathered.push({ entry: s.entry, distance: d });
    }
    gathered.sort((a, b) => a.distance - b.distance);
    // Same row twice: a gathered row within half a yard of a seen hit of the same creature.
    const isSeen = (h: AoePullHit): boolean =>
      seen.some((x) => x.entry === h.entry && Math.abs(x.distance - h.distance) < 0.5);

    // Quest kill targets first, the rest of the camp tops the pull up: a grind on "kill 10 of
    // each" wants credit for what it dragged in.
    const wanted: AoePullHit[] = [];
    const rest: AoePullHit[] = [];
    // Never more copies of a creature than stand in the world: Hogger's 6 points are one Hogger.
    const copies = new Map<number, number>([[primaryEntry, 1]]);
    const take = (h: AoePullHit): void => {
      if (!(h.distance > 0)) return;
      if (!huntable.has(h.entry)) return;
      if (aoePullClass(ds, h.entry) !== cls) return;
      const used = copies.get(h.entry) ?? 0;
      if (used >= spawnCapFor(ds, h.entry)) return;
      const cdef = ds.creature(h.entry);
      if (!cdef || unitCannotBeAttacked(cdef)) return;
      if (opts?.race != null && !canAttackCreature(ds, opts.race, h.entry, opts.atWar)) return;
      copies.set(h.entry, used + 1);
      if (prefer?.has(h.entry)) wanted.push(h);
      else if (rest.length < want) rest.push(h);
    };
    for (const h of seen) {
      if (wanted.length + rest.length >= want * 2) break;
      take({ entry: h.entry, distance: h.distance });
    }
    for (const h of gathered) {
      if (wanted.length >= want || wanted.length + rest.length >= want * 2) break;
      if (isSeen(h)) continue;
      take(h);
    }
    const out = wanted.slice(0, want);
    for (const h of rest) {
      if (out.length >= want) break;
      out.push(h);
    }
    return { out, wanted: wanted.length };
  };

  let best: AoePullHit[] = [];
  let bestWanted = -1;
  for (const origin of pullOriginsForCreature(ds, zoneId, primaryEntry)) {
    const { out, wanted } = joinable(origin);
    // The camp that feeds the quest wins over the camp that is merely bigger.
    if (wanted > bestWanted || (wanted === bestWanted && out.length > best.length)) {
      best = out;
      bestWanted = wanted;
    }
    // A row that fills the dial with quest targets ends the search; so does a full pull when
    // the run has no kill list to satisfy.
    if (bestWanted >= want || (!prefer?.size && best.length >= want)) break;
  }
  byKey.set(key, best);
  return best;
}
