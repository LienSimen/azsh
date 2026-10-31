// Once-per-run roll over a map's gameobject pools: 1,094 CANDIDATE herb/vein/crate/chest positions
// on the instance maps, ~345 live. Cite: PoolManager.cpp:1087 SpawnPool; InitPools, once per state.

import type { Rng } from '../engine/core/rng.ts';
import {
  rollInstancePools,
  type PoolCatalog,
  type PoolObjectMember,
  type PoolPoolLink,
  type PoolTemplate,
} from '../domain/world/pools.ts';
import {
  dungeonGameObjectsForMap,
  dungeonGoPoolsForMap,
  type DungeonGameObject,
} from '../data/dungeonGameObjects.ts';

/** Sub-seed salt for instance gameobject pool rolls (ASCII "gopl"). */
export const DUNGEON_GO_POOL_ROLL_SALT = 0x676f706c;

/** Catalog for one map, or null when the bake found nothing pooled on it. */
export function goPoolCatalogForMap(mapId: number): PoolCatalog | null {
  const pools = dungeonGoPoolsForMap(mapId);
  if (!pools || pools.templates.length === 0) return null;
  const templates: PoolTemplate[] = pools.templates.map((t) => ({
    poolId: t.id,
    maxLimit: t.maxLimit,
    ...(t.description ? { description: t.description } : {}),
  }));
  const poolLinks: PoolPoolLink[] = pools.links.map((l) => ({
    motherPoolId: l.mother,
    childPoolId: l.child,
    chance: l.chance,
  }));
  const objects: PoolObjectMember[] = [];
  for (const go of dungeonGameObjectsForMap(mapId)) {
    if ((go.poolId ?? 0) <= 0) continue;
    objects.push({
      poolId: go.poolId!,
      guid: go.guid,
      chance: go.poolChance ?? 0,
      kind: 'gameobject',
    });
  }
  if (objects.length === 0) return null;
  return { templates, objects, poolLinks };
}

/** Pooled guids on this map — winners and losers alike. Empty when the map has no GO pools. */
export function goPoolMemberGuids(mapId: number): number[] {
  const out: number[] = [];
  for (const go of dungeonGameObjectsForMap(mapId)) {
    if ((go.poolId ?? 0) > 0) out.push(go.guid);
  }
  return out;
}

/** Guids that won this map's gameobject pools. Deterministic given `rng`; ascending. */
export function rollDungeonGoPools(mapId: number, rng: Rng): number[] {
  const catalog = goPoolCatalogForMap(mapId);
  if (!catalog) return [];
  const state = rollInstancePools(catalog, rng);
  return [...state.gameobjects].sort((a, b) => a - b);
}

// True unless this row is a pool member that lost the roll. Absent `winners` fails OPEN — a legacy
// run keeps every candidate, which is what every surface did before the roll existed.
export function goPassesPoolGate(
  go: DungeonGameObject,
  winners: ReadonlySet<number> | null | undefined,
): boolean {
  if ((go.poolId ?? 0) <= 0) return true;
  if (!winners) return true;
  return winners.has(go.guid);
}
