// Meeting-stone world-panel listing. Join is stone.meetingstone.areaId → AreaTable.mapid
// === instance.mapId where instance.portalZone === zoneId. Level band is not the join.
// Cite: AreaTableEntry mapid @1; pin de8f72993b9e1faa1bf92dd5505f3daec5cea3ce.

import type { DataStore } from '../data/dataStore.ts';
import type { GameObjectDef, InstanceDef } from '../data/schema.ts';
import { GAMEOBJECT_TYPE_MEETINGSTONE } from '../domain/world/gameObjects.ts';
import { areaTableMapIds } from './areaTableDbc.ts';

// Type-23 GOs whose areaId maps to a mapId of an instance portaled from `zoneId`. One stone per portal map
// (lowest entry). AreaIds missing from AreaTable are omitted.
export function meetingStonesForPortalZone(
  ds: DataStore,
  zoneId: string,
  areaToMap: ReadonlyMap<number, number> = areaTableMapIds(),
): GameObjectDef[] {
  const portalMaps = new Set<number>();
  for (const inst of ds.instances()) {
    if (inst.portalZone === zoneId) portalMaps.add(inst.mapId);
  }
  if (portalMaps.size === 0) return [];
  const byMap = new Map<number, GameObjectDef>();
  for (const g of ds.gameObjects()) {
    if (g.type !== GAMEOBJECT_TYPE_MEETINGSTONE) continue;
    const areaId = g.meetingstone?.areaId;
    if (areaId == null || areaId <= 0) continue;
    const mapId = areaToMap.get(areaId);
    if (mapId == null || !portalMaps.has(mapId)) continue;
    const prev = byMap.get(mapId);
    if (!prev || g.entry < prev.entry) byMap.set(mapId, g);
  }
  return [...byMap.values()].sort((a, b) => a.entry - b.entry);
}

/** Instance whose mapId is AreaTable.mapid for this LFG area. First match if several share the map. */
export function instanceForMeetingStoneArea(
  ds: DataStore,
  areaId: number,
  areaToMap: ReadonlyMap<number, number> = areaTableMapIds(),
): InstanceDef | undefined {
  const mapId = areaToMap.get(areaId | 0);
  if (mapId == null) return undefined;
  return ds.instances().find((i) => i.mapId === mapId);
}

/** Lowest-entry type-23 GO for this areaId. Level band is on the stone, not the instance. */
export function meetingStoneForArea(ds: DataStore, areaId: number): GameObjectDef | undefined {
  const want = areaId | 0;
  let found: GameObjectDef | undefined;
  for (const g of ds.gameObjects()) {
    if (g.type !== GAMEOBJECT_TYPE_MEETINGSTONE) continue;
    if ((g.meetingstone?.areaId ?? 0) !== want) continue;
    if (!found || g.entry < found.entry) found = g;
  }
  return found;
}
