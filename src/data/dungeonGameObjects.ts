// L07 — dungeon gameobject spawn positions for the 19 instance maps, baked by
// bake-dungeon-gameobjects.mjs. `lootId` is template data1 for CHEST/FISHINGHOLE, not the GO entry.

import dungeonGameObjectsJson from './tables/dungeonGameObjects.json' with { type: 'json' };

export type DungeonGameObject = {
  guid: number;
  entry: number;
  map: number;
  x: number;
  y: number;
  z: number;
  o: number;
  type: number;
  name: string;
  displayId: number;
  poolCandidates?: number[];
  // pool_gameobject / pool_gameobject_template membership: this row is a CANDIDATE position, live
  // only when it wins the once-per-run roll. Cite: PoolManager.cpp:792-921 LoadFromDB.
  poolId?: number;
  poolChance?: number;
  lockId?: number;
  lootId?: number;
  spawnSecsMin?: number;
  spawnSecsMax?: number;
};

/** pool_template + pool_pool closure for one map. Members come from `objects[].poolId`. */
export type DungeonGoPools = {
  templates: Array<{ id: number; maxLimit: number; description?: string }>;
  links: Array<{ child: number; mother: number; chance: number }>;
};

export type DungeonGameObjectMap = {
  slug: string;
  mapId: number;
  dbCount: number;
  bakeCount: number;
  objects: DungeonGameObject[];
  pools?: DungeonGoPools;
  verify?: {
    interactive?: number;
    missingTpl?: number;
    pooled?: number;
    coverage?: number;
  };
};

type File = {
  maps: Record<string, DungeonGameObjectMap>;
};

const data = dungeonGameObjectsJson as File;

const byGuid = new Map<number, DungeonGameObject>();
for (const m of Object.values(data.maps ?? {})) {
  for (const o of m.objects ?? []) byGuid.set(o.guid, o);
}

export function getDungeonGameObjectMap(mapId: number): DungeonGameObjectMap | undefined {
  return data.maps?.[String(mapId)];
}

export function getDungeonGameObject(guid: number): DungeonGameObject | undefined {
  return byGuid.get(guid);
}

/** First instance spawn for a template entry (OPEN_DOOR / CLOSE_DOOR guid→entry). */
export function firstDungeonGameObjectForEntry(entry: number): DungeonGameObject | undefined {
  for (const o of byGuid.values()) {
    if (o.entry === entry) return o;
  }
  return undefined;
}

/** GO spawns for a map (empty when bake missing this map). */
export function dungeonGameObjectsForMap(mapId: number): readonly DungeonGameObject[] {
  return getDungeonGameObjectMap(mapId)?.objects ?? [];
}

/** pool_template / pool_pool rows for a map, or undefined when nothing on it is pooled. */
export function dungeonGoPoolsForMap(mapId: number): DungeonGoPools | undefined {
  return getDungeonGameObjectMap(mapId)?.pools;
}
