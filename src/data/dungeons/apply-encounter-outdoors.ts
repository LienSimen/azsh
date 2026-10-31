// Stamp EncounterDef.outdoors from the bake. The flag belongs on the PULL, not the instance —
// Zul'Gurub measures 150/182 outdoors, Naxxramas 5/277. Cite: GridMap.cpp:892-903 IsOutdoors.
import type { EncounterDef, InstanceDef } from '../schema.ts';
import outdoorsJson from './encounter-outdoors.json' with { type: 'json' };

interface OutdoorsRecord {
  map: number;
  encounters: number;
  default: string;
  indoors?: readonly string[];
  outdoors?: readonly string[];
}

const TABLE = (outdoorsJson as { instances?: Record<string, OutdoorsRecord> }).instances ?? {};

/** dungeonId → (encounterId → outdoors), plus the instance default. */
const byInstance = new Map<string, { def: boolean; listed: Set<string>; listedIs: boolean }>();
for (const [id, rec] of Object.entries(TABLE)) {
  const listedIs = rec.indoors ? false : true;
  byInstance.set(id, {
    def: rec.default !== 'indoors',
    listed: new Set(rec.indoors ?? rec.outdoors ?? []),
    listedIs,
  });
}

/** True when this pull sits under open sky. Unmeasured → true (the core's no-WMO default). */
export function encounterIsOutdoors(dungeonId: string, encounterId: string): boolean {
  const rec = byInstance.get(dungeonId);
  if (!rec) return true;
  return rec.listed.has(encounterId) ? rec.listedIs : rec.def;
}

/** Attach `outdoors` where the bake measured it. Preserves explicit stamps. */
export function applyEncounterOutdoors(
  dungeonId: string,
  encounters: EncounterDef[],
): EncounterDef[] {
  if (!byInstance.has(dungeonId)) return encounters;
  return encounters.map((enc) =>
    enc.outdoors !== undefined ? enc : { ...enc, outdoors: encounterIsOutdoors(dungeonId, enc.id) },
  );
}

/** The instance's majority answer — what an unlisted encounter of it gets. */
export function instanceDefaultOutdoors(dungeonId: string): boolean {
  return byInstance.get(dungeonId)?.def ?? true;
}

// The live floor pulls by spawn guid, not route encounter id, so it joins through
// `EncounterDef.spawnGuids` — 9,252 guids over 2,826 encounters. Undefined → the instance default.
const guidCache = new WeakMap<InstanceDef, Map<number, boolean>>();
export function outdoorsForSpawnGuid(def: InstanceDef, guid: number): boolean | undefined {
  let map = guidCache.get(def);
  if (!map) {
    map = new Map<number, boolean>();
    for (const enc of def.encounters) {
      if (enc.outdoors === undefined) continue;
      for (const g of enc.spawnGuids ?? []) map.set(g | 0, enc.outdoors);
    }
    guidCache.set(def, map);
  }
  return map.get(guid | 0);
}

/** Apply to a full InstanceDef (shallow copy). */
export function withEncounterOutdoors(def: InstanceDef): InstanceDef {
  return {
    ...def,
    encounters: applyEncounterOutdoors(def.id, def.encounters),
  };
}
