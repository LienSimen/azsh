// Line of sight for a live combat tick — one implementation for casts and AoE fan-out. Three callers
// each carried their own copy of translate-then-test, and none knew about the storey stack.

import {
  sightClearForMap,
} from '../../domain/nav/nav.ts';
import { findNearestPoly, navMeshForMap } from '../../domain/nav/navmesh.ts';
import { type CombatPosYd, type PullGeometryAnchor } from './combatGeometry.ts';

export interface NavSightCfg {
  geometryAnchor?: PullGeometryAnchor;
}

// A combat-yard offset to client world, when the session is anchored to real coordinates. The z is
// carried, and that is the whole reason this works: without it every test matched any stacked layer.
function toWorld(p: CombatPosYd, anchor: PullGeometryAnchor | undefined): CombatPosYd {
  const o = anchor?.frame === 'world-translated' ? anchor.origin : undefined;
  const x = o ? o.x + p.x : p.x;
  const y = o ? o.y + p.y : p.y;
  // One literal per shape, not `{ ...xy, z }`: the spread was 235 ms of CopyDataProperties
  // on top of 234 ms of toWorld itself (Firefox capture 2026-08-20).
  return p.z != null && Number.isFinite(p.z) ? { x, y, z: p.z } : { x, y };
}

// Is this body on the floor? The SAME question motion asks, to the same tolerance — a stricter one
// here made a step that ended on a door lip read "sight clear". Cite: sessionMotion.ts:653 offMesh.
function onMesh(mapId: number | undefined, p: CombatPosYd): boolean {
  const mesh = mapId != null ? navMeshForMap(mapId) : null;
  if (!mesh) return false;
  const hit = findNearestPoly(mesh, p.x, p.y, p.z, 2);
  return !!hit && hit.dist <= 1.6;
}

// A per-step pair memo, still keyed on exact world coords so a mid-tick move misses, but with no
// strings: the string keys cost more than the geometry they cached. Per map, so two masks cannot share.
interface MapMemo {
  /** x -> y -> z -> position id. z is NaN when the caller had none (a valid, distinct Map key). */
  xs: Map<number, Map<number, Map<number, number>>>;
  next: number;
  pairs: Map<number, boolean>;
  // The on-mesh answer per position id. It is a property of the POINT but sat inside the pair test, so
  // a 40-unit floor asked it up to 40 times per position per step.
  mesh: (boolean | undefined)[];
}

const byMap = new Map<number, MapMemo>();
let memoLive = false;

/** Pair key radix. Ids are per-step and per-map; ~10^2 units, so 2^20 is unreachable. */
const ID_RADIX = 1 << 20;

export function resetNavSightMemo(): void {
  if (memoLive) {
    byMap.clear();
    memoLive = false;
  }
}

function internPos(m: MapMemo, x: number, y: number, z: number): number {
  let ys = m.xs.get(x);
  if (ys === undefined) {
    ys = new Map<number, Map<number, number>>();
    m.xs.set(x, ys);
  }
  let zs = ys.get(y);
  if (zs === undefined) {
    zs = new Map<number, number>();
    ys.set(y, zs);
  }
  let id = zs.get(z);
  if (id === undefined) {
    id = m.next++;
    zs.set(z, id);
  }
  return id;
}

/** Same two shapes toWorld produces: z carried only when the caller had a finite one. */
function worldPos(x: number, y: number, z: number): CombatPosYd {
  return Number.isNaN(z) ? { x, y } : { x, y, z };
}

function onMeshCached(m: MapMemo, id: number, mapId: number, p: CombatPosYd): boolean {
  const hit = m.mesh[id];
  if (hit !== undefined) return hit;
  const ans = onMesh(mapId, p);
  m.mesh[id] = ans;
  return ans;
}

function sightUncached(mapId: number | undefined, aw: CombatPosYd, bw: CombatPosYd): boolean {
  if (!onMesh(mapId, aw) || !onMesh(mapId, bw)) return true;
  return (mapId != null ? sightClearForMap(mapId, aw, bw) : null) ?? true;
}

// True when nothing opaque stands between two combat positions. FAILS OPEN with no registered geometry,
// with a missing position, and when either end is off-mesh: the mask is authoritative only where it says
export function navSightClear(
  cfg: NavSightCfg,
  a: CombatPosYd | undefined,
  b: CombatPosYd | undefined,
): boolean {
  if (!a || !b) return true;
  const anchor = cfg.geometryAnchor;
  const mapId = anchor?.mapId;
  // Memo only when the registry keys the geometry (live maps). A session with no map id has
  // nothing registered to ask, and inventing geometry is what this fails open to avoid.
  if (mapId == null) return true;
  const o = anchor?.frame === 'world-translated' ? anchor.origin : undefined;
  const ax = o ? o.x + a.x : a.x;
  const ay = o ? o.y + a.y : a.y;
  const az = a.z != null && Number.isFinite(a.z) ? a.z : NaN;
  const bx = o ? o.x + b.x : b.x;
  const by = o ? o.y + b.y : b.y;
  const bz = b.z != null && Number.isFinite(b.z) ? b.z : NaN;
  let m = byMap.get(mapId);
  if (m === undefined) {
    m = { xs: new Map(), next: 0, pairs: new Map(), mesh: [] };
    byMap.set(mapId, m);
    memoLive = true;
  }
  const ia = internPos(m, ax, ay, az);
  const ib = internPos(m, bx, by, bz);
  // The world positions are the only allocation left, and only a miss pays for them.
  if (ia >= ID_RADIX || ib >= ID_RADIX) {
    return sightUncached(mapId, worldPos(ax, ay, az), worldPos(bx, by, bz));
  }
  const k = ia < ib ? ia * ID_RADIX + ib : ib * ID_RADIX + ia;
  const hit = m.pairs.get(k);
  if (hit !== undefined) return hit;
  const aw = worldPos(ax, ay, az);
  const bw = worldPos(bx, by, bz);
  const ans = !onMeshCached(m, ia, mapId, aw) || !onMeshCached(m, ib, mapId, bw)
    ? true
    : (sightClearForMap(mapId, aw, bw) ?? true);
  m.pairs.set(k, ans);
  return ans;
}
