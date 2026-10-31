// WHICH surface answers "can this unit step there", stated once. There is one surface since E7.6 —
// `stepOnSurface` answers null on a refusal, `stepOnSurfaceOrHold` answers the unit's own position.

import { detHypot } from '../core/detMath.ts';
import { type NavPos } from '../../domain/nav/nav.ts';
import {
  navMeshForMap,
  stepWalkableNavMesh,
  walkLosClearNavMesh,
  type NavMesh,
} from '../../domain/nav/navmesh.ts';

// WHICH surfaces exist for a map. The map answers it, and nothing else does — not the unit's side and
// not whether it may afford a search, which is what CLAUDE.md 0c rule 2 forbids hanging on one flag.
export function motionSurfacesForMap(
  mapId: number | null | undefined,
): { mesh: NavMesh | null } {
  if (mapId == null) return { mesh: null };
  return { mesh: navMeshForMap(mapId) };
}

// One step toward `toward`, in world yards. The mesh is the only stepper and its refusal is final:
// null, never a second opinion. A caller with no geometry is gated before this.
export function stepOnSurface(
  mesh: NavMesh | null | undefined,
  from: NavPos,
  toward: NavPos,
  stepYd: number,
): NavPos | null {
  if (!mesh) return null;
  const s = stepWalkableNavMesh(mesh, from, toward, stepYd);
  return detHypot(s.x - from.x, s.y - from.y) > 1e-6 ? s : null;
}

// Same step, but a refusal HOLDS the unit where it stands instead of answering null — for the last
// rung of an unstick or retreat ladder, which needs a position rather than a decision.
export function stepOnSurfaceOrHold(
  mesh: NavMesh | null | undefined,
  from: NavPos,
  toward: NavPos,
  stepYd: number,
): NavPos {
  return stepOnSurface(mesh, from, toward, stepYd) ?? from;
}

/** Straight-line walkability. Same surface choice; `halfWidthYd` is the mesh's corridor width. */
export function walkLineClearOnSurface(
  mesh: NavMesh | null | undefined,
  from: NavPos,
  to: NavPos,
  halfWidthYd: number,
): boolean {
  return mesh ? walkLosClearNavMesh(mesh, from, to, halfWidthYd) : false;
}
