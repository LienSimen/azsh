// The ONE combat-offset to client-world transform: session positions are offsets from the anchor and
// every world system reads absolute coordinates. `z` MUST pass through untouched — it is world height.

import { STOREY_DZ_YD, type CombatPosYd, type PullGeometryAnchor } from './combatGeometry.ts';
import { floorZForMap, type NavPos } from '../../domain/nav/nav.ts';

/** Combat offset → client world. Absolute already when the pull has no world bearing. */
export function combatToWorld(
  pos: CombatPosYd,
  anchor: PullGeometryAnchor | undefined,
): NavPos {
  const o = anchor?.frame === 'world-translated' ? anchor.origin : undefined;
  // Absolute world coords when there is no origin (probe / origin-at-zero sessions).
  const base = o ? { x: o.x + pos.x, y: o.y + pos.y } : { x: pos.x, y: pos.y };
  return pos.z == null ? base : { ...base, z: pos.z };
}

/** Client world → combat offset, resolving a missing height off the map rather than to 0. */
export function worldToCombat(
  world: NavPos,
  anchor: PullGeometryAnchor | undefined,
  /** Storey the unit was on — the hint that keeps a stacked map picking the right floor. */
  prevZ?: number,
): CombatPosYd {
  const o = anchor?.frame === 'world-translated' ? anchor.origin : undefined;
  // The mesh stamps z per corner, so a mesh corridor already carries the floor. Where it
  // does not, ask the map with the unit's own last z as the hint; never invent 0.
  const mapId = anchor?.mapId;
  // Mesh / corridor z is the floor the stepper just walked. Do not clamp it — a stair
  // step can drop more than STOREY_DZ_YD and that clamp left the unit on the old ledge.
  let z = world.z != null && Number.isFinite(world.z) ? world.z : undefined;
  if (z == null && mapId != null) {
    const fz = floorZForMap(mapId, world.x, world.y, prevZ);
    // A derived height that jumps a whole storey is the lookup picking the wrong floor.
    if (fz != null && Number.isFinite(fz)
      && (prevZ == null || Math.abs(fz - prevZ) <= STOREY_DZ_YD)) {
      z = fz;
    }
  }
  if (z == null) z = prevZ;
  const base = o ? { x: world.x - o.x, y: world.y - o.y } : { x: world.x, y: world.y };
  return z == null ? base : { ...base, z };
}
