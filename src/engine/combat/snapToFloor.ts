// Snap a combat-yard point onto the navmesh. Extracted from `sessionGeometry.ts` so the SESSION and the
// main-thread mirror the S6 facade needs are one implementation rather than two: a cheap path that puts
// the floor somewhere else than the expensive one is the defect CLAUDE.md 0c.4 names.

import { navMeshForMap, snapOntoNavMesh } from '../../domain/nav/navmesh.ts';
import { detHypot } from '../core/detMath.ts';
import type { CombatPosYd, PullGeometryAnchor } from './combatGeometry.ts';

// Nearest walkable floor to `pos`, or null when a loaded mesh refuses inside `radiusYd`. No mesh
// loaded returns the point untouched, so a session without geometry stays planar.
export function snapPosToMesh(
  anchor: PullGeometryAnchor | undefined,
  pos: CombatPosYd,
  radiusYd: number,
  refZ?: number | null,
): CombatPosYd | null {
  const anchorMapId = anchor?.mapId;
  const anchorMesh = anchorMapId != null ? navMeshForMap(anchorMapId) : null;
  if (!anchorMesh) return pos;
  const o = (anchor?.frame === 'world-translated' ? anchor.origin : null) ?? { x: 0, y: 0 };
  const w = { x: o.x + pos.x, y: o.y + pos.y };
  // With a reference floor, walkability alone is not enough, since the mask is stacked. Ask for floor
  // AND height together and return the resolved z, so the caller can chain the next snap off it.
  if (refZ != null && Number.isFinite(refZ)) {
    // Real polys carry z, so the floor at the clicked point on the standing storey is a direct
    // question. Off-poly, land ON the poly and never keep the void XY.
    const on = snapOntoNavMesh(anchorMesh, w.x, w.y, refZ, radiusYd, 4);
    if (on) {
      const d = detHypot(on.x - w.x, on.y - w.y);
      if (d <= 0.75) return { ...pos, z: on.z };
      if (d <= radiusYd) return { x: on.x - o.x, y: on.y - o.y, z: on.z };
    }
    // The mesh is loaded and it refused inside the radius: that refusal IS the answer. The raster
    // second opinion that sat here read a plan bit with no z and recovered a pit onto the floor below.
    return null;
  }
  // Z-less: no reference storey to ask about, so `snapOntoNavMesh` takes the nearest poly at any
  // height and the caller keeps its own position when there is none within `radiusYd`.
  const s = snapOntoNavMesh(anchorMesh, w.x, w.y, undefined, radiusYd);
  if (!s) return pos;
  return { x: s.x - o.x, y: s.y - o.y, z: s.z };
}
