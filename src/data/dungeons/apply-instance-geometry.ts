// dmapfid W5 — merge instance-geometry.json onto EncounterDef origin / path. Pure: JSON import
// only, no DB. Cite: src/dev/etl/extract-instance-geometry.mjs.
import geometryJson from './instance-geometry.json' with { type: 'json' };
import type { EncounterDef, InstanceDef } from '../schema.ts';

export type GeometryRow = {
  x?: number;
  y?: number;
  z?: number;
  path?: { x: number; y: number; z?: number }[];
  source?: string;
  nameMatch?: string;
  cite?: string;
  entry?: number;
  kind?: string;
};

const GEOMETRY = geometryJson as Record<string, GeometryRow>;

/** Geometry row for `instanceId/encounterId`, or undefined. */
export function geometryFor(instanceId: string, encounterId: string): GeometryRow | undefined {
  const g = GEOMETRY[`${instanceId}/${encounterId}`];
  if (!g || typeof g !== 'object') return undefined;
  // skip meta
  if (encounterId === '_meta') return undefined;
  return g;
}

/** Full geometry table (including `_meta`). */
export function allGeometry(): Record<string, GeometryRow> {
  return GEOMETRY;
}

// Attach origin / path from instance-geometry.json onto encounters that lack them. Does not overwrite an
// existing finite origin or non-empty path.
export function applyInstanceGeometry(
  instanceId: string,
  encounters: EncounterDef[],
): EncounterDef[] {
  return encounters.map((enc) => {
    const g = geometryFor(instanceId, enc.id);
    if (!g) return enc;
    const hasOrigin =
      enc.origin && Number.isFinite(enc.origin.x) && Number.isFinite(enc.origin.y);
    const hasPath = Array.isArray(enc.path) && enc.path.length > 0;
    let next: EncounterDef = enc;
    if (!hasOrigin && g.x != null && g.y != null && Number.isFinite(g.x) && Number.isFinite(g.y)) {
      const origin: { x: number; y: number; z?: number } = { x: g.x, y: g.y };
      if (g.z != null && Number.isFinite(g.z)) origin.z = g.z;
      next = { ...next, origin };
    }
    if (!hasPath && Array.isArray(g.path) && g.path.length > 0) {
      next = { ...next, path: g.path.map((p) => ({ ...p })) };
    }
    return next;
  });
}

/** Apply geometry to a full InstanceDef (returns a shallow-copied def). */
export function withInstanceGeometry(def: InstanceDef): InstanceDef {
  return {
    ...def,
    encounters: applyInstanceGeometry(def.id, def.encounters),
  };
}
