// GetHitPosition for combat-yard displacement: a fear dest, a knock-back landing and Charge all share
// one rule — the last walkable sample on the start storey. A loaded mesh that refuses a step wins.

import type { CombatPosYd, PullGeometryAnchor } from './combatGeometry.ts';
import { stepToward } from './combatGeometry.ts';
import { detHypot } from '../core/detMath.ts';
import { type NavPos } from '../../domain/nav/nav.ts';
import {
  findNearestPoly,
  isWalkableNavMesh,
  navMeshForMap,
  stepWalkableNavMesh,
  type NavMesh,
} from '../../domain/nav/navmesh.ts';

/** 0.2 yd — walkLosClearNavMesh uses this so a 0.45 yd wall cell is a wall. */
const SAMPLE_YD = 0.2;

export type DisplaceFloor = {
  mesh?: NavMesh | null;
  toWorld: (p: CombatPosYd) => NavPos;
  toCombat: (w: NavPos, prevZ?: number) => CombatPosYd;
};

function originOf(anchor?: PullGeometryAnchor): { x: number; y: number } | undefined {
  return anchor?.frame === 'world-translated' ? anchor.origin : undefined;
}

export function displaceFloorOf(opts: {
  mapId?: number;
  origin?: { x: number; y: number };
}): DisplaceFloor {
  const origin = opts.origin;
  const mesh = opts.mapId != null ? navMeshForMap(opts.mapId) : null;
  return {
    mesh,
    toWorld: (p) => {
      const base = origin ? { x: origin.x + p.x, y: origin.y + p.y } : { x: p.x, y: p.y };
      return p.z == null ? base : { ...base, z: p.z };
    },
    toCombat: (w, prevZ) => {
      const base = origin ? { x: w.x - origin.x, y: w.y - origin.y } : { x: w.x, y: w.y };
      const z = w.z ?? prevZ;
      return z == null ? base : { ...base, z };
    },
  };
}

export function displaceFloorFromCfg(cfg: {
  geometryAnchor?: PullGeometryAnchor;
}): DisplaceFloor {
  return displaceFloorOf({
    mapId: cfg.geometryAnchor?.mapId,
    origin: originOf(cfg.geometryAnchor),
  });
}

function worldOf(floor: DisplaceFloor, from: CombatPosYd, p: CombatPosYd): NavPos {
  return floor.toWorld(from.z != null && p.z == null ? { ...p, z: from.z } : p);
}

function onFloor(floor: DisplaceFloor, w: NavPos): boolean {
  return floor.mesh ? isWalkableNavMesh(floor.mesh, w.x, w.y, w.z, 4) : true;
}

function withMeshZ(floor: DisplaceFloor, w: NavPos): NavPos {
  if (!floor.mesh) return w;
  const hit = findNearestPoly(floor.mesh, w.x, w.y, w.z, 2);
  if (!hit || hit.dist > 0.75) return w;
  return { x: w.x, y: w.y, z: hit.z };
}

/** Last walkable point on the start storey along from→dest. Unchanged without a floor. */
export function clampDisplacementToFloor(
  from: CombatPosYd,
  dest: CombatPosYd,
  floor: DisplaceFloor,
): CombatPosYd {
  if (!floor.mesh) return dest;
  const fw = worldOf(floor, from, from);
  const tw = worldOf(floor, from, dest);
  const dx = tw.x - fw.x;
  const dy = tw.y - fw.y;
  const dist = detHypot(dx, dy);
  if (!(dist > 1e-9)) return from;
  const n = Math.max(1, Math.ceil(dist / SAMPLE_YD));
  let last = fw;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const p: NavPos = fw.z == null
      ? { x: fw.x + dx * t, y: fw.y + dy * t }
      : { x: fw.x + dx * t, y: fw.y + dy * t, z: fw.z };
    if (!onFloor(floor, p)) break;
    last = p;
  }
  return floor.toCombat(withMeshZ(floor, last), from.z);
}

/** One hop toward dest, clamped to the floor. Mesh refuse → stand still (no raster void). */
export function stepDisplacement(
  from: CombatPosYd,
  dest: CombatPosYd,
  stepYd: number,
  floor: DisplaceFloor,
): CombatPosYd {
  if (!(stepYd > 0)) return from;
  if (!floor.mesh) return stepToward(from, dest, stepYd, 0);
  const fw = worldOf(floor, from, from);
  const tw = worldOf(floor, from, dest);
  const s = stepWalkableNavMesh(floor.mesh, fw, tw, stepYd);
  if (detHypot(s.x - fw.x, s.y - fw.y) <= 1e-6) return from;
  return clampDisplacementToFloor(from, floor.toCombat(s, from.z), floor);
}
