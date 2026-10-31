// Detour navmesh router — real 3-D polygons, so a floor 60 yd below another in the same column is
// a different poly sharing no edge. Source: the cmangos mmap output. Pure and deterministic.

import { detHypot } from '../../engine/core/detMath.ts';
import { STOREY_DZ_YD } from './storey.ts';
import {
  fillAllowMask,
  roomAndRing,
  roomGraphForMesh,
  clearRoomGraphCache,
  type RoomGraph,
} from './navRoomGraph.ts';

/** Poly area bits, MoveMapSharedDefines.h:55 (NavTerrainFlag). */
export const NAV_GROUND = 1;
export const NAV_GROUND_STEEP = 2;
export const NAV_WATER = 4;
export const NAV_MAGMA_SLIME = 8;
/** Runtime-only. Closed GO doors; not a mmap terrain bit. */
export const NAV_BLOCKED = 16;

/** Lava/slime is not a floor a party walks across; cost it out of every path. */
const MAGMA_COST_MUL = 40;
/** Swim is slower than run — same ratio nav.ts SWIM_STEP_COST uses. */
const WATER_COST_MUL = 7.0 / 4.722222;

/** Emitted path steps are subdivided to this length so every step carries a floor z. */
const STEP_YD = 4;

// How far outside a polygon a unit may stand. The mesh is eroded by walkableRadius 0.533 yd and
// bridged gaps reach 1.33 yd, so a walker held to the edge wedges mid-doorway.
const OFF_POLY_TOL_YD = 1.6;

// Floor this far from a hint is still the same floor. `isWalkableNavMesh` and `snapOntoNavMesh` both
// default to it; a storey is STOREY_DZ_YD 10 (storey.ts).
const MESH_STEP_DZ_YD = 4;

export type NavMeshArrays = {
  mapId: number;
  /** World (x, y, z) per polygon vertex. */
  verts: Float32Array;
  /** Prefix into corner arrays, length polyCount + 1. */
  polyStart: Uint32Array;
  cornerVert: Uint32Array;
  /** Neighbour poly per corner edge, or -1 for a wall. */
  cornerNei: Int32Array;
  polyFlags: Uint8Array;
  /** Detail sub-mesh prefixes, length polyCount + 1. */
  dVStart: Uint32Array;
  dTStart: Uint32Array;
  dVerts: Float32Array;
  /** 4 bytes per triangle: a, b, c, edgeFlags (Detour convention). */
  dTris: Uint8Array;
  // Extra links across recast's agent-radius erosion gaps, prefix-indexed by poly. `linkVia` is the
  // source poly's corner whose edge acts as the portal. Measured by bake-navmesh bridgeComponents.
  linkStart: Uint32Array;
  linkTo: Int32Array;
  linkVia: Uint32Array;
};

export type NavMesh = NavMeshArrays & {
  polyCount: number;
  // Author cost multiplier per poly, or null until something stamps one; 1 is untouched. Without
  // this field the operator's floor carves and the Rookery hazard were inert wherever a mesh loads.
  authorCost: Float32Array | null;
  /** minX, minY, minZ, maxX, maxY, maxZ. */
  bounds: Float64Array;
  /** minX, minY, maxX, maxY per poly. */
  polyBBox: Float32Array;
  polyCenter: Float32Array;
  grid: {
    cell: number;
    nx: number;
    ny: number;
    ox: number;
    oy: number;
    start: Uint32Array;
    items: Uint32Array;
  };
};

export type NavMeshPos = { x: number; y: number; z?: number };

const GRID_CELL_YD = 12;

/** Index the raw arrays for query: bboxes, centres, and a uniform poly grid. */
export function buildNavMesh(a: NavMeshArrays): NavMesh {
  const polyCount = a.polyStart.length - 1;
  const polyBBox = new Float32Array(polyCount * 4);
  const polyCenter = new Float32Array(polyCount * 3);
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (let p = 0; p < polyCount; p++) {
    const s = a.polyStart[p]!;
    const e = a.polyStart[p + 1]!;
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    let cx = 0, cy = 0, cz = 0;
    for (let i = s; i < e; i++) {
      const v = a.cornerVert[i]! * 3;
      const x = a.verts[v]!, y = a.verts[v + 1]!, z = a.verts[v + 2]!;
      if (x < bx0) bx0 = x;
      if (y < by0) by0 = y;
      if (x > bx1) bx1 = x;
      if (y > by1) by1 = y;
      cx += x; cy += y; cz += z;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    const n = Math.max(1, e - s);
    polyBBox[p * 4] = bx0; polyBBox[p * 4 + 1] = by0;
    polyBBox[p * 4 + 2] = bx1; polyBBox[p * 4 + 3] = by1;
    polyCenter[p * 3] = cx / n; polyCenter[p * 3 + 1] = cy / n; polyCenter[p * 3 + 2] = cz / n;
    if (bx0 < minX) minX = bx0;
    if (by0 < minY) minY = by0;
    if (bx1 > maxX) maxX = bx1;
    if (by1 > maxY) maxY = by1;
  }

  const cell = GRID_CELL_YD;
  const nx = Math.max(1, Math.ceil((maxX - minX) / cell) + 1);
  const ny = Math.max(1, Math.ceil((maxY - minY) / cell) + 1);
  const counts = new Uint32Array(nx * ny + 1);
  const cellRange = (p: number) => {
    const gx0 = Math.max(0, Math.floor((polyBBox[p * 4]! - minX) / cell));
    const gy0 = Math.max(0, Math.floor((polyBBox[p * 4 + 1]! - minY) / cell));
    const gx1 = Math.min(nx - 1, Math.floor((polyBBox[p * 4 + 2]! - minX) / cell));
    const gy1 = Math.min(ny - 1, Math.floor((polyBBox[p * 4 + 3]! - minY) / cell));
    return [gx0, gy0, gx1, gy1] as const;
  };
  for (let p = 0; p < polyCount; p++) {
    const [gx0, gy0, gx1, gy1] = cellRange(p);
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) counts[gy * nx + gx + 1]!++;
  }
  for (let i = 1; i <= nx * ny; i++) counts[i]! += counts[i - 1]!;
  const items = new Uint32Array(counts[nx * ny]!);
  const cursor = counts.slice(0, nx * ny);
  for (let p = 0; p < polyCount; p++) {
    const [gx0, gy0, gx1, gy1] = cellRange(p);
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        items[cursor[gy * nx + gx]!++] = p;
      }
    }
  }

  return {
    ...a,
    polyCount,
    bounds: new Float64Array([minX, minY, minZ, maxX, maxY, maxZ]),
    polyBBox,
    polyCenter,
    authorCost: null,
    grid: { cell, nx, ny, ox: minX, oy: minY, start: counts, items },
  };
}

function polyContains2D(m: NavMesh, p: number, x: number, y: number): boolean {
  const s = m.polyStart[p]!;
  const e = m.polyStart[p + 1]!;
  let inside = false;
  for (let i = s, j = e - 1; i < e; j = i++) {
    const vi = m.cornerVert[i]! * 3;
    const vj = m.cornerVert[j]! * 3;
    const xi = m.verts[vi]!, yi = m.verts[vi + 1]!;
    const xj = m.verts[vj]!, yj = m.verts[vj + 1]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Detail-mesh vertex k of poly p (Detour: index < vertCount means a poly corner). `cb` is the poly's
 * corner base, `vc` its corner count, `db` its detail-vert base — the callers hoist all three.
 */
function detailVertAt(
  m: NavMesh, cb: number, vc: number, db: number, k: number, out: Float32Array, o: number,
): void {
  if (k < vc) {
    const v = m.cornerVert[cb + k]! * 3;
    out[o] = m.verts[v]!; out[o + 1] = m.verts[v + 1]!; out[o + 2] = m.verts[v + 2]!;
  } else {
    const v = (db + (k - vc)) * 3;
    out[o] = m.dVerts[v]!; out[o + 1] = m.dVerts[v + 1]!; out[o + 2] = m.dVerts[v + 2]!;
  }
}

const triScratch = new Float32Array(9);

/** Floor height inside a poly, from its detail triangles (Detour getPolyHeight). */
export function polyHeightAt(m: NavMesh, p: number, x: number, y: number): number {
  const t0 = m.dTStart[p]!;
  const t1 = m.dTStart[p + 1]!;
  const cb = m.polyStart[p]!;
  const vc = m.polyStart[p + 1]! - cb;
  const db = m.dVStart[p]!;
  let bestZ = Number.NaN;
  let bestD = Infinity;
  for (let t = t0; t < t1; t++) {
    detailVertAt(m, cb, vc, db, m.dTris[t * 4]!, triScratch, 0);
    detailVertAt(m, cb, vc, db, m.dTris[t * 4 + 1]!, triScratch, 3);
    detailVertAt(m, cb, vc, db, m.dTris[t * 4 + 2]!, triScratch, 6);
    const ax = triScratch[0]!, ay = triScratch[1]!;
    const v0x = triScratch[3]! - ax, v0y = triScratch[4]! - ay;
    const v1x = triScratch[6]! - ax, v1y = triScratch[7]! - ay;
    const v2x = x - ax, v2y = y - ay;
    const den = v0x * v1y - v1x * v0y;
    if (Math.abs(den) < 1e-9) continue;
    let u = (v2x * v1y - v1x * v2y) / den;
    let v = (v0x * v2y - v2x * v0y) / den;
    const outside = Math.max(0, -u) + Math.max(0, -v) + Math.max(0, u + v - 1);
    if (outside < bestD) {
      u = Math.min(1, Math.max(0, u));
      v = Math.min(1, Math.max(0, v));
      if (u + v > 1) { const s = u + v; u /= s; v /= s; }
      bestD = outside;
      bestZ = triScratch[2]! + u * (triScratch[5]! - triScratch[2]!) + v * (triScratch[8]! - triScratch[2]!);
      if (outside === 0) return bestZ;
    }
  }
  if (Number.isFinite(bestZ)) return bestZ;
  return m.polyCenter[p * 3 + 2]!;
}

/** Closest point on a poly's detail triangles (clamped barycentric). */
function closestOnPoly(m: NavMesh, p: number, x: number, y: number): { x: number; y: number; z: number } {
  const t0 = m.dTStart[p]!;
  const t1 = m.dTStart[p + 1]!;
  const cb = m.polyStart[p]!;
  const vc = m.polyStart[p + 1]! - cb;
  const db = m.dVStart[p]!;
  let bestX = x;
  let bestY = y;
  let bestZ = Number.NaN;
  let bestD = Infinity;
  for (let t = t0; t < t1; t++) {
    detailVertAt(m, cb, vc, db, m.dTris[t * 4]!, triScratch, 0);
    detailVertAt(m, cb, vc, db, m.dTris[t * 4 + 1]!, triScratch, 3);
    detailVertAt(m, cb, vc, db, m.dTris[t * 4 + 2]!, triScratch, 6);
    const ax = triScratch[0]!, ay = triScratch[1]!;
    const v0x = triScratch[3]! - ax, v0y = triScratch[4]! - ay;
    const v1x = triScratch[6]! - ax, v1y = triScratch[7]! - ay;
    const v2x = x - ax, v2y = y - ay;
    const den = v0x * v1y - v1x * v0y;
    if (Math.abs(den) < 1e-9) continue;
    let u = (v2x * v1y - v1x * v2y) / den;
    let v = (v0x * v2y - v2x * v0y) / den;
    const outside = Math.max(0, -u) + Math.max(0, -v) + Math.max(0, u + v - 1);
    if (outside < bestD) {
      u = Math.min(1, Math.max(0, u));
      v = Math.min(1, Math.max(0, v));
      if (u + v > 1) { const s = u + v; u /= s; v /= s; }
      bestD = outside;
      bestX = ax + u * v0x + v * v1x;
      bestY = ay + u * v0y + v * v1y;
      bestZ = triScratch[2]! + u * (triScratch[5]! - triScratch[2]!) + v * (triScratch[8]! - triScratch[2]!);
      if (outside === 0) return { x, y, z: bestZ };
    }
  }
  if (Number.isFinite(bestZ)) return { x: bestX, y: bestY, z: bestZ };
  return { x: m.polyCenter[p * 3]!, y: m.polyCenter[p * 3 + 1]!, z: m.polyCenter[p * 3 + 2]! };
}

function forEachNearbyPoly(
  m: NavMesh,
  x: number,
  y: number,
  radius: number,
  visit: (p: number) => void,
): void {
  const { cell, nx, ny, ox, oy, start, items } = m.grid;
  const gx0 = Math.max(0, Math.floor((x - radius - ox) / cell));
  const gy0 = Math.max(0, Math.floor((y - radius - oy) / cell));
  const gx1 = Math.min(nx - 1, Math.floor((x + radius - ox) / cell));
  const gy1 = Math.min(ny - 1, Math.floor((y + radius - oy) / cell));
  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      const c = gy * nx + gx;
      for (let i = start[c]!; i < start[c + 1]!; i++) visit(items[i]!);
    }
  }
}

function distToPolyBBox(m: NavMesh, p: number, x: number, y: number): number {
  const dx = Math.max(m.polyBBox[p * 4]! - x, 0, x - m.polyBBox[p * 4 + 2]!);
  const dy = Math.max(m.polyBBox[p * 4 + 1]! - y, 0, y - m.polyBBox[p * 4 + 3]!);
  return detHypot(dx, dy);
}

/** Exact 3-D length — `Math.hypot` is implementation-approximated (detMath.ts). */
function dist3(dx: number, dy: number, dz: number): number {
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export type PolyHit = { poly: number; z: number; dist: number };

// Nearest polygon to a point. With a z hint this is the whole reason the module exists: two floors of one
// column are separate polys, so the hint picks the floor instead of a height byte that averaged both.
export function findNearestPoly(
  m: NavMesh,
  x: number,
  y: number,
  z?: number,
  radius = 6,
  /** When set with `z`, ignore floors further than this (dest snap must not pick the storey below). */
  maxDz?: number,
): PolyHit | null {
  let best: PolyHit | null = null;
  let bestScore = Infinity;
  forEachNearbyPoly(m, x, y, radius, (p) => {
    const flags = m.polyFlags[p]!;
    if (flags & NAV_MAGMA_SLIME) return;
    // polyBBox is the exact min/max of the corner verts polyContains2D walks, so containment
    // implies d === 0; the ring walk is left for the blocked poly a unit may be standing in.
    const d = distToPolyBBox(m, p, x, y);
    if (d > radius) return;
    // dz is never negative, so a candidate at d*4 >= bestScore cannot win and does not need
    // its height: polyHeightAt walks every detail triangle in the poly (3.7% of live JS).
    if (d * 4 >= bestScore) return;
    if ((flags & NAV_BLOCKED) && (d > 0 || !polyContains2D(m, p, x, y))) return;
    const h = polyHeightAt(m, p, x, y);
    const dz = z == null ? 0 : Math.abs(h - z);
    if (maxDz != null && z != null && Number.isFinite(z) && dz > maxDz) return;
    // Plan distance dominates; z breaks the tie between stacked floors.
    const score = d * 4 + dz;
    if (score < bestScore) {
      bestScore = score;
      best = { poly: p, z: h, dist: d };
    }
  });
  return best;
}

/** Floor z at a point, choosing the floor nearest `zHint` when columns stack. */
export function heightAtNavMesh(m: NavMesh, x: number, y: number, zHint?: number): number | null {
  const hit = findNearestPoly(m, x, y, zHint, 4);
  return hit ? hit.z : null;
}

// Floor z at a point for a mover standing at `fromZ`, refusing a hint floor the standing floor
// does not CONNECT to. Judge adjacency, not endpoint z. Null means no floor near fromZ here.
export function connectedFloorZNavMesh(
  m: NavMesh,
  x: number,
  y: number,
  fromZ: number,
  hintZ?: number,
  radius = 4,
): number | null {
  const stand = findNearestPoly(m, x, y, fromZ, radius);
  if (!stand) return null;
  if (hintZ == null || Math.abs(stand.z - hintZ) <= 0.001) return stand.z;
  const hinted = findNearestPoly(m, x, y, hintZ, radius);
  if (!hinted || hinted.poly === stand.poly) return stand.z;
  return polyWithinHops(m, stand.poly, hinted.poly, STEP_HOPS) ? hinted.z : stand.z;
}

/** Is there a real floor under this point (within `tol` of the hint when given)? */
export function isWalkableNavMesh(m: NavMesh, x: number, y: number, zHint?: number, tol = 4): boolean {
  const hit = findNearestPoly(m, x, y, zHint, 2);
  if (!hit || hit.dist > 0.75) return false;
  return zHint == null || Math.abs(hit.z - zHint) <= tol;
}

// Is the floor under this point swim water? Same gates as `isWalkableNavMesh` plus the terrain bit
// `polyCost` already charges `WATER_COST_MUL` for (MoveMapSharedDefines.h:55).
export function isSwimNavMesh(m: NavMesh, x: number, y: number, zHint?: number, tol = 4): boolean {
  const hit = findNearestPoly(m, x, y, zHint, 2);
  if (!hit || hit.dist > 0.75) return false;
  if (zHint != null && Math.abs(hit.z - zHint) > tol) return false;
  return (m.polyFlags[hit.poly]! & NAV_WATER) !== 0;
}

// Land ON the mesh: the same XY when already on a poly, else the closest point on the nearest
// one. Null when nothing is in `radius` — a move dest must not keep a void XY.
export function snapOntoNavMesh(
  m: NavMesh,
  x: number,
  y: number,
  zHint?: number,
  radius = 4,
  maxDz?: number,
): { x: number; y: number; z: number } | null {
  const hit = findNearestPoly(m, x, y, zHint, radius, maxDz);
  if (!hit) return null;
  if (zHint != null && Number.isFinite(zHint) && Math.abs(hit.z - zHint) > (maxDz ?? 4)) return null;
  // Bbox dist is 0 inside the AABB of a convex poly, which is still void in the corners.
  // Closest-point dist is the one that means "on the floor".
  const on = closestOnPoly(m, hit.poly, x, y);
  if (detHypot(on.x - x, on.y - y) <= 0.75) return { x, y, z: on.z };
  return on;
}

/** Poly -> connected-component id, links included, cached per mesh like the room graph. */
const meshComponents = new WeakMap<NavMesh, Int32Array>();
function componentsOf(m: NavMesh): Int32Array {
  const had = meshComponents.get(m);
  if (had) return had;
  const comp = new Int32Array(m.polyCount).fill(-1);
  const stack: number[] = [];
  let next = 0;
  for (let seed = 0; seed < m.polyCount; seed++) {
    if (comp[seed] !== -1) continue;
    const id = next++;
    comp[seed] = id;
    stack.length = 0;
    stack.push(seed);
    while (stack.length) {
      const p = stack.pop()!;
      for (let i = m.polyStart[p]!; i < m.polyStart[p + 1]!; i++) {
        const q = m.cornerNei[i]!;
        if (q >= 0 && comp[q] === -1) { comp[q] = id; stack.push(q); }
      }
      for (let l = m.linkStart[p]!; l < m.linkStart[p + 1]!; l++) {
        const q = m.linkTo[l]!;
        if (q >= 0 && comp[q] === -1) { comp[q] = id; stack.push(q); }
      }
    }
  }
  meshComponents.set(m, comp);
  return comp;
}

/** How far under a perched boss a stand may sit: Gothik's balcony is 18.1 yd over the fight floor. */
const STAND_DROP_MAX_YD = 25;

/** Do these two points sit on one connected component (bake links included)? */
export function reachableOnMesh(m: NavMesh, from: NavMeshPos, to: NavMeshPos): boolean {
  const a = findNearestPoly(m, from.x, from.y, from.z, 8) ?? findNearestPoly(m, from.x, from.y, from.z, 20);
  const b = findNearestPoly(m, to.x, to.y, to.z, 8) ?? findNearestPoly(m, to.x, to.y, to.z, 20);
  if (!a || !b) return false;
  const comp = componentsOf(m);
  return comp[a.poly] === comp[b.poly];
}

/** Stand for a dest `from` cannot reach: Gothik's balcony is 14 polys, 18.1 yd over the fight floor.
 *  Null when the dest is already reachable, or nothing reachable is within `radius` (Frostwyrm Lair). */
export function reachableStandNavMesh(
  m: NavMesh,
  from: NavMeshPos,
  to: NavMeshPos,
  radius = 12,
): { x: number; y: number; z: number } | null {
  const a = findNearestPoly(m, from.x, from.y, from.z, 8);
  const b = findNearestPoly(m, to.x, to.y, to.z, 8) ?? findNearestPoly(m, to.x, to.y, to.z, 20);
  if (!a || !b) return null;
  const comp = componentsOf(m);
  if (comp[a.poly] === comp[b.poly]) return null;
  let best: PolyHit | null = null;
  let bestScore = Infinity;
  forEachNearbyPoly(m, to.x, to.y, radius, (p) => {
    if (comp[p] !== comp[a.poly]) return;
    const flags = m.polyFlags[p]!;
    if (flags & (NAV_MAGMA_SLIME | NAV_BLOCKED)) return;
    const d = distToPolyBBox(m, p, to.x, to.y);
    if (d > radius || d * 4 >= bestScore) return;
    const z = polyHeightAt(m, p, to.x, to.y);
    const dz = to.z != null && Number.isFinite(to.z) ? Math.abs(z - to.z) : 0;
    // A stand is floor the party fights the boss FROM, so it stays near him in z as well as in
    // plan. Plan-only picked whatever lay under the spawn: stratholme bosses moved 110 yd down.
    if (dz > STAND_DROP_MAX_YD) return;
    const score = d * 4 + dz;
    if (score >= bestScore) return;
    bestScore = score;
    best = { poly: p, z, dist: d };
  });
  if (!best) return null;
  const on = closestOnPoly(m, (best as PolyHit).poly, to.x, to.y);
  return on;
}

// Can I walk the straight line on the mesh without leaving the standing floor? Sample the line:
// every sample must hit a poly locally connected to the last, so another storey is not a hop.
export function walkLosClearNavMesh(
  m: NavMesh,
  from: NavMeshPos,
  to: NavMeshPos,
  /** Sample must sit this close to a poly. Hop uses ~0.55 so a thin wall is a wall. */
  onPolyYd = OFF_POLY_TOL_YD,
): boolean {
  const a = findNearestPoly(m, from.x, from.y, from.z, OFF_POLY_TOL_YD + 0.5);
  if (!a || a.dist > OFF_POLY_TOL_YD) return false;
  const b = findNearestPoly(m, to.x, to.y, to.z ?? from.z, OFF_POLY_TOL_YD + 0.5);
  if (!b || b.dist > OFF_POLY_TOL_YD) return false;
  if (a.poly !== b.poly && !polyWithinHops(m, a.poly, b.poly, STEP_HOPS)) return false;
  const dist = detHypot(to.x - from.x, to.y - from.y);
  if (!(dist > 1e-9)) return true;
  // 0.2 yd — a Stockade wall cell is 0.45 yd; 0.5 yd samples skipped it and the
  // 12 yd hop crawled the lip (probe-los-pathing with mesh: 391 hops, 5.7 yd short).
  const n = Math.max(2, Math.ceil(dist / 0.2));
  let z = from.z ?? a.z;
  let prev = a.poly;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    // Most samples are still inside the poly the last one was on, and re-running the grid search
    // to be told that was 81% of live findNearestPoly time. A sample that left prev falls through.
    const hit = polyContains2D(m, prev, x, y)
      ? { poly: prev, z: polyHeightAt(m, prev, x, y), dist: 0 }
      : findNearestPoly(m, x, y, z, OFF_POLY_TOL_YD + 0.5);
    if (!hit || hit.dist > onPolyYd) return false;
    if (hit.poly !== prev && !polyWithinHops(m, prev, hit.poly, STEP_HOPS)) return false;
    z = hit.z;
    prev = hit.poly;
  }
  return true;
}

// One walkable surface rises from `from` to `to` — sight up a ramp or a stairway. It is
// walkLosClearNavMesh plus one term: floor within dzTol of the straight-line interpolation.
export function rampSightNavMesh(
  m: NavMesh,
  from: NavMeshPos,
  to: NavMeshPos,
  dzTol = MESH_STEP_DZ_YD,
  onPolyYd = OFF_POLY_TOL_YD,
): boolean {
  const a = findNearestPoly(m, from.x, from.y, from.z, OFF_POLY_TOL_YD + 0.5);
  if (!a || a.dist > OFF_POLY_TOL_YD) return false;
  const b = findNearestPoly(m, to.x, to.y, to.z ?? from.z, OFF_POLY_TOL_YD + 0.5);
  if (!b || b.dist > OFF_POLY_TOL_YD) return false;
  if (a.poly === b.poly) return true;
  const dist = detHypot(to.x - from.x, to.y - from.y);
  // Same plan column, two floors: there is no line to sample, so the z gap is the answer.
  if (!(dist > 1e-9)) return Math.abs(b.z - a.z) <= dzTol;
  const n = Math.max(2, Math.ceil(dist / 0.2));
  let prev = a.poly;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    const want = a.z + (b.z - a.z) * t;
    const hit = polyContains2D(m, prev, x, y)
      ? { poly: prev, z: polyHeightAt(m, prev, x, y), dist: 0 }
      : findNearestPoly(m, x, y, want, OFF_POLY_TOL_YD + 0.5);
    if (!hit || hit.dist > onPolyYd) return false;
    if (Math.abs(hit.z - want) > dzTol) return false;
    if (hit.poly !== prev && !polyWithinHops(m, prev, hit.poly, STEP_HOPS)) return false;
    prev = hit.poly;
  }
  return true;
}

// A* over polygons

class MinHeap {
  private keys: Float64Array;
  private vals: Int32Array;
  private n = 0;
  constructor(cap: number) {
    this.keys = new Float64Array(cap);
    this.vals = new Int32Array(cap);
  }
  get size(): number { return this.n; }
  clear(): void { this.n = 0; }
  push(key: number, val: number): void {
    if (this.n === this.keys.length) {
      const k = new Float64Array(this.n * 2); k.set(this.keys); this.keys = k;
      const v = new Int32Array(this.n * 2); v.set(this.vals); this.vals = v;
    }
    let i = this.n++;
    this.keys[i] = key; this.vals[i] = val;
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (this.keys[par]! <= this.keys[i]!) break;
      const tk = this.keys[par]!, tv = this.vals[par]!;
      this.keys[par] = this.keys[i]!; this.vals[par] = this.vals[i]!;
      this.keys[i] = tk; this.vals[i] = tv;
      i = par;
    }
  }
  pop(): number {
    const top = this.vals[0]!;
    this.n--;
    if (this.n > 0) {
      this.keys[0] = this.keys[this.n]!; this.vals[0] = this.vals[this.n]!;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let s = i;
        if (l < this.n && this.keys[l]! < this.keys[s]!) s = l;
        if (r < this.n && this.keys[r]! < this.keys[s]!) s = r;
        if (s === i) break;
        const tk = this.keys[s]!, tv = this.vals[s]!;
        this.keys[s] = this.keys[i]!; this.vals[s] = this.vals[i]!;
        this.keys[i] = tk; this.vals[i] = tv;
        i = s;
      }
    }
    return top;
  }
}

// Reused A* working set. A per-search Float64Array(polyCount).fill(Infinity) on an 11.5k-poly mesh
// was the sim lagspike bill — three searches a tick. Generation stamps touch only visited nodes.
let polyPathCap = 0;
let polyPathG: Float64Array | null = null;
let polyPathGStamp: Int32Array | null = null;
let polyPathParent: Int32Array | null = null;
let polyPathClosed: Int32Array | null = null;
let polyPathHeap: MinHeap | null = null;
let polyPathGen = 1;

function ensurePolyPathScratch(n: number): void {
  if (polyPathCap >= n && polyPathG) return;
  polyPathCap = n;
  polyPathG = new Float64Array(n);
  polyPathGStamp = new Int32Array(n);
  polyPathParent = new Int32Array(n);
  polyPathClosed = new Int32Array(n);
  polyPathHeap = new MinHeap(Math.min(4096, Math.max(1024, n >> 2)));
}

/** Shared edge between two adjacent polys, as its two endpoint vertex indices. */
function sharedEdge(m: NavMesh, from: number, to: number): [number, number] | null {
  const s = m.polyStart[from]!;
  const e = m.polyStart[from + 1]!;
  for (let i = s; i < e; i++) {
    if (m.cornerNei[i] !== to) continue;
    const a = m.cornerVert[i]!;
    const b = m.cornerVert[i + 1 < e ? i + 1 : s]!;
    return [a, b];
  }
  for (let l = m.linkStart[from]!; l < m.linkStart[from + 1]!; l++) {
    if (m.linkTo[l] !== to) continue;
    const i = m.linkVia[l]!;
    return [m.cornerVert[i]!, m.cornerVert[i + 1 < e ? i + 1 : s]!];
  }
  return null;
}

function polyCost(m: NavMesh, p: number): number {
  const f = m.polyFlags[p]!;
  if (f & NAV_BLOCKED) return 1e6;
  // Author cost multiplies the terrain cost rather than replacing it: an operator lane drawn
  // through water is still slower than the same lane on dry floor.
  const author = m.authorCost ? m.authorCost[p]! : 1;
  if (f & NAV_MAGMA_SLIME) return MAGMA_COST_MUL * author;
  if (f & NAV_WATER) return WATER_COST_MUL * author;
  return author;
}

/** Poly corridor from `startPoly` to `endPoly`, or null. */
function findPolyPath(
  m: NavMesh,
  startPoly: number,
  endPoly: number,
  maxVisited = 200_000,
  allow?: Uint8Array | null,
  stats?: { visited: number; capped?: boolean },
): number[] | null {
  if (startPoly === endPoly) {
    if (stats) stats.visited = 0;
    return [startPoly];
  }
  ensurePolyPathScratch(m.polyCount);
  // Wrap gen before stamp collision; zero stamps so a fresh gen is unambiguous.
  if (polyPathGen >= 0x7ffffffe) {
    polyPathGStamp!.fill(0);
    polyPathClosed!.fill(0);
    polyPathGen = 1;
  }
  const gen = ++polyPathGen;
  const g = polyPathG!;
  const gStamp = polyPathGStamp!;
  const parent = polyPathParent!;
  const closed = polyPathClosed!;
  const heap = polyPathHeap!;
  heap.clear();
  const ex = m.polyCenter[endPoly * 3]!, ey = m.polyCenter[endPoly * 3 + 1]!, ez = m.polyCenter[endPoly * 3 + 2]!;
  const h = (p: number) => dist3(
    m.polyCenter[p * 3]! - ex,
    m.polyCenter[p * 3 + 1]! - ey,
    m.polyCenter[p * 3 + 2]! - ez,
  );
  const gOf = (p: number): number => (gStamp[p] === gen ? g[p]! : Infinity);
  g[startPoly] = 0;
  gStamp[startPoly] = gen;
  parent[startPoly] = -1;
  heap.push(h(startPoly), startPoly);
  let visited = 0;
  while (heap.size > 0) {
    const cur = heap.pop();
    if (closed[cur] === gen) continue;
    closed[cur] = gen;
    if (cur === endPoly) break;
    if (++visited > maxVisited) {
      // Out of budget, NOT out of mesh. The caller has to be able to tell them apart.
      if (stats) {
        stats.visited = visited;
        stats.capped = true;
      }
      return null;
    }
    const gCur = gOf(cur);
    const relax = (nb: number) => {
      if (nb < 0 || closed[nb] === gen) return;
      if (m.polyFlags[nb]! & NAV_BLOCKED) return;
      if (allow && allow[nb] !== 1) return;
      const step = dist3(
        m.polyCenter[nb * 3]! - m.polyCenter[cur * 3]!,
        m.polyCenter[nb * 3 + 1]! - m.polyCenter[cur * 3 + 1]!,
        m.polyCenter[nb * 3 + 2]! - m.polyCenter[cur * 3 + 2]!,
      ) * polyCost(m, nb);
      const ng = gCur + step;
      if (ng + 1e-6 >= gOf(nb)) return;
      g[nb] = ng;
      gStamp[nb] = gen;
      parent[nb] = cur;
      heap.push(ng + h(nb), nb);
    };
    for (let i = m.polyStart[cur]!; i < m.polyStart[cur + 1]!; i++) relax(m.cornerNei[i]!);
    for (let l = m.linkStart[cur]!; l < m.linkStart[cur + 1]!; l++) relax(m.linkTo[l]!);
  }
  if (stats) stats.visited = visited;
  if (closed[endPoly] !== gen) return null;
  const out: number[] = [];
  for (let p = endPoly; p !== -1; p = parent[p]!) {
    out.push(p);
    if (p === startPoly) break;
  }
  out.reverse();
  return out[0] === startPoly ? out : null;
}

function sharesEdge(m: NavMesh, a: number, b: number): boolean {
  if (a === b) return true;
  for (let c = m.polyStart[a]!; c < m.polyStart[a + 1]!; c++) if (m.cornerNei[c] === b) return true;
  return false;
}

/** A bake link out of `from` landing on `to` or on a poly sharing an edge with it. */
function linksOnto(m: NavMesh, from: number, to: number): boolean {
  for (let l = m.linkStart[from]!; l < m.linkStart[from + 1]!; l++) {
    if (sharesEdge(m, m.linkTo[l]!, to)) return true;
  }
  return false;
}

/** Plan distance from (x, y) to the nearest boundary edge of poly `p`; 0 inside. */
function distToPolyEdges2D(m: NavMesh, p: number, x: number, y: number): number {
  if (polyContains2D(m, p, x, y)) return 0;
  const s = m.polyStart[p]!;
  const e = m.polyStart[p + 1]!;
  let best = Infinity;
  for (let i = s; i < e; i++) {
    const a = m.cornerVert[i]! * 3;
    const b = m.cornerVert[i + 1 < e ? i + 1 : s]! * 3;
    const ax = m.verts[a]!, ay = m.verts[a + 1]!;
    const dx = m.verts[b]! - ax, dy = m.verts[b + 1]! - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
    const d = detHypot(x - (ax + dx * t), y - (ay + dy * t));
    if (d < best) best = d;
  }
  return best;
}

/** A bake link out of `from` or its edge neighbours whose landing reaches `to` within STEP_HOPS. */
function linksToward(m: NavMesh, from: number, to: number): boolean {
  const lands = (p: number): boolean => {
    for (let l = m.linkStart[p]!; l < m.linkStart[p + 1]!; l++) {
      if (polyWithinHops(m, m.linkTo[l]!, to, STEP_HOPS)) return true;
    }
    return false;
  };
  if (lands(from)) return true;
  for (let c = m.polyStart[from]!; c < m.polyStart[from + 1]!; c++) {
    const nb = m.cornerNei[c]!;
    if (nb >= 0 && lands(nb)) return true;
  }
  return false;
}

// A bake link from `from` (or its edge neighbour) onto `to` (or its edge neighbour). A link, never
// a hop chain: six hops through a ramp reach the hall floor under a bridge, a fall through the deck.
function dropLinked(m: NavMesh, from: number, to: number): boolean {
  if (from === to || linksOnto(m, from, to)) return true;
  for (let c = m.polyStart[from]!; c < m.polyStart[from + 1]!; c++) {
    const nb = m.cornerNei[c]!;
    if (nb >= 0 && linksOnto(m, nb, to)) return true;
  }
  return false;
}

function corridorConnected(m: NavMesh, corr: readonly number[]): boolean {
  for (let i = 0; i < corr.length - 1; i++) {
    if (!sharedEdge(m, corr[i]!, corr[i + 1]!)) return false;
  }
  return true;
}

function corridorLen(m: NavMesh, corr: readonly number[]): number {
  let s = 0;
  for (let i = 1; i < corr.length; i++) {
    const a = corr[i - 1]!, b = corr[i]!;
    s += dist3(
      m.polyCenter[b * 3]! - m.polyCenter[a * 3]!,
      m.polyCenter[b * 3 + 1]! - m.polyCenter[a * 3 + 1]!,
      m.polyCenter[b * 3 + 2]! - m.polyCenter[a * 3 + 2]!,
    );
  }
  return s;
}

type PortalRep = {
  a: number;
  b: number;
  polyA: number;
  polyB: number;
};

type PortalNet = {
  reps: PortalRep[];
  /** i < j pairs that share a room, mesh cost through that room. */
  cost: Float64Array;
  n: number;
  byRoom: number[][];
};

const portalNetByMap = new Map<number, PortalNet>();

function polyInRoom(rep: PortalRep, room: number): number {
  return rep.a === room ? rep.polyA : rep.polyB;
}

function meshHop(
  m: NavMesh,
  graph: RoomGraph,
  from: number,
  to: number,
  room: number,
  maxVisited: number,
  allow: Uint8Array,
  stats?: { visited: number },
  ring = false,
): number[] | null {
  const band = ring ? roomAndRing(graph, room) : new Uint8Array(graph.names.length);
  if (!ring) band[room] = 1;
  fillAllowMask(graph, band, allow);
  return findPolyPath(m, from, to, maxVisited, allow, stats);
}

function buildPortalNet(m: NavMesh, graph: RoomGraph): PortalNet {
  const nRooms = graph.names.length;
  const best = new Map<number, PortalRep & { score: number }>();
  const pairKey = (a: number, b: number) => (a < b ? a * nRooms + b : b * nRooms + a);
  for (let a = 0; a < nRooms; a++) {
    for (const p of graph.portals[a]!) {
      if (a > p.to) continue;
      const score = dist3(
        graph.cx[a]! - m.polyCenter[p.polyA * 3]!,
        graph.cy[a]! - m.polyCenter[p.polyA * 3 + 1]!,
        graph.cz[a]! - m.polyCenter[p.polyA * 3 + 2]!,
      ) + dist3(
        graph.cx[p.to]! - m.polyCenter[p.polyB * 3]!,
        graph.cy[p.to]! - m.polyCenter[p.polyB * 3 + 1]!,
        graph.cz[p.to]! - m.polyCenter[p.polyB * 3 + 2]!,
      );
      const k = pairKey(a, p.to);
      const prev = best.get(k);
      if (!prev || score < prev.score) {
        best.set(k, { a, b: p.to, polyA: p.polyA, polyB: p.polyB, score });
      }
    }
  }
  const reps = [...best.values()].map(({ a, b, polyA, polyB }) => ({ a, b, polyA, polyB }));
  const n = reps.length;
  const byRoom: number[][] = Array.from({ length: nRooms }, () => []);
  for (let i = 0; i < n; i++) {
    const r = reps[i]!;
    byRoom[r.a]!.push(i);
    byRoom[r.b]!.push(i);
  }
  const cost = new Float64Array(n * n).fill(Infinity);
  for (let room = 0; room < nRooms; room++) {
    const ps = byRoom[room]!;
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const ia = ps[i]!, ib = ps[j]!;
        const pa = polyInRoom(reps[ia]!, room);
        const pb = polyInRoom(reps[ib]!, room);
        // Same-room doorways often connect only via a neighbour room (BRD West Garrison between
        // two Shadowforge doors). Honest mesh distance, or the portal net splits.
        const corr = findPolyPath(m, pa, pb, 20_000);
        if (!corr) continue;
        const d = corridorLen(m, corr);
        const use = d > 0 ? d : 1;
        if (use < cost[ia * n + ib]!) {
          cost[ia * n + ib] = use;
          cost[ib * n + ia] = use;
        }
      }
    }
  }
  return { reps, cost, n, byRoom };
}

function portalNetFor(m: NavMesh, graph: RoomGraph): PortalNet {
  const id = m.mapId | 0;
  let net = portalNetByMap.get(id);
  if (!net) {
    net = buildPortalNet(m, graph);
    portalNetByMap.set(id, net);
  }
  return net;
}

function findPolyPathViaRooms(
  m: NavMesh,
  graph: RoomGraph,
  startPoly: number,
  endPoly: number,
  maxVisited: number,
  stats: { visited: number; hops: number; rooms: string[] },
): number[] | null {
  const sr = graph.polyRoom[startPoly]!;
  const er = graph.polyRoom[endPoly]!;
  if (sr < 0 || er < 0) return null;

  const allow = new Uint8Array(m.polyCount);
  const hopStats = { visited: 0 };
  let remaining = maxVisited;

  const runHop = (from: number, to: number, room: number): number[] | null => {
    if (from === to) return [from];
    if (remaining <= 0) return null;
    hopStats.visited = 0;
    let seg = meshHop(m, graph, from, to, room, remaining, allow, hopStats);
    if (!seg) {
      hopStats.visited = 0;
      seg = meshHop(m, graph, from, to, room, remaining, allow, hopStats, true);
    }
    if (!seg) {
      hopStats.visited = 0;
      seg = findPolyPath(m, from, to, remaining, null, hopStats);
    }
    stats.visited += hopStats.visited;
    remaining -= hopStats.visited;
    return seg;
  };

  if (sr === er) {
    const seg = runHop(startPoly, endPoly, sr);
    if (!seg || !corridorConnected(m, seg)) return null;
    stats.hops = 1;
    stats.rooms = [graph.names[sr]!];
    return seg;
  }

  const net = portalNetFor(m, graph);
  const n = net.n;
  const startN = n;
  const endN = n + 1;
  const nn = n + 2;
  const dist = new Float64Array(nn).fill(Infinity);
  const parent = new Int32Array(nn).fill(-1);
  const viaRoom = new Int32Array(nn).fill(-1);
  const seen = new Uint8Array(nn);
  dist[startN] = 0;

  const startCost = new Float64Array(n).fill(Infinity);
  const endCost = new Float64Array(n).fill(Infinity);
  for (const i of net.byRoom[sr]!) {
    const p = polyInRoom(net.reps[i]!, sr);
    const corr = meshHop(m, graph, startPoly, p, sr, 8_000, allow);
    if (corr) startCost[i] = corridorLen(m, corr);
  }
  for (const i of net.byRoom[er]!) {
    const p = polyInRoom(net.reps[i]!, er);
    const corr = meshHop(m, graph, p, endPoly, er, 8_000, allow);
    if (corr) endCost[i] = corridorLen(m, corr);
  }

  const relaxTo = (u: number, v: number, w: number, room: number) => {
    if (!(w < Infinity)) return;
    const nd = dist[u]! + w;
    if (nd + 1e-6 < dist[v]!) {
      dist[v] = nd;
      parent[v] = u;
      viaRoom[v] = room;
    }
  };

  for (let k = 0; k < nn; k++) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < nn; i++) {
      if (!seen[i] && dist[i]! < best) {
        best = dist[i]!;
        u = i;
      }
    }
    if (u < 0) break;
    if (u === endN) break;
    seen[u] = 1;
    if (u === startN) {
      for (let i = 0; i < n; i++) relaxTo(u, i, startCost[i]!, sr);
      continue;
    }
    if (u < n) {
      relaxTo(u, endN, endCost[u]!, er);
      for (let v = 0; v < n; v++) {
        if (v === u) continue;
        const c = net.cost[u * n + v]!;
        if (!(c < Infinity)) continue;
        const ru = net.reps[u]!;
        const rv = net.reps[v]!;
        const room = ru.a === rv.a || ru.a === rv.b ? ru.a : ru.b;
        relaxTo(u, v, c, room);
      }
    }
  }
  if (!Number.isFinite(dist[endN]!)) return null;

  const nodes: number[] = [];
  for (let p = endN; p !== -1; p = parent[p]!) nodes.push(p);
  nodes.reverse();
  if (nodes[0] !== startN) return null;

  const out: number[] = [startPoly];
  let cur = startPoly;
  const roomsUsed: number[] = [sr];
  for (let i = 1; i < nodes.length; i++) {
    const prev = nodes[i - 1]!;
    const node = nodes[i]!;
    const room = viaRoom[node]!;
    let target: number;
    if (node === endN) target = endPoly;
    else target = polyInRoom(net.reps[node]!, room);
    if (cur !== target) {
      const seg = runHop(cur, target, room);
      if (!seg) return null;
      for (let k = 1; k < seg.length; k++) out.push(seg[k]!);
      cur = target;
    }
    if (node !== endN) {
      const rep = net.reps[node]!;
      const other = rep.a === room ? rep.polyB : rep.polyA;
      if (cur !== other) {
        out.push(other);
        cur = other;
      }
      const nextRoom = rep.a === room ? rep.b : rep.a;
      if (roomsUsed[roomsUsed.length - 1] !== nextRoom) roomsUsed.push(nextRoom);
    }
  }
  if (!corridorConnected(m, out)) return null;
  stats.hops = roomsUsed.length;
  stats.rooms = roomsUsed.map((i) => graph.names[i]!);
  return out;
}

// dtTriArea2D in our frame. Detour works in its (x, z) plane and we map world.x = detour.z, which
// mirrors the plane and flips the sign. Backwards, the funnel swaps portals and leaves the corridor.
const triarea2D = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number =>
  (cy - ay) * (bx - ax) - (by - ay) * (cx - ax);

// Simple stupid funnel (Detour findStraightPath) over the corridor's portal edges. Each corner
// carries its corridor index: a helix overlaps in plan, so poly identity needs corridor order.
function stringPull(
  m: NavMesh,
  corridor: readonly number[],
  start: NavMeshPos,
  end: NavMeshPos,
): { x: number; y: number; at: number }[] {
  const n = corridor.length;
  const leftX = new Float64Array(n + 1), leftY = new Float64Array(n + 1);
  const rightX = new Float64Array(n + 1), rightY = new Float64Array(n + 1);
  for (let i = 0; i < n - 1; i++) {
    const edge = sharedEdge(m, corridor[i]!, corridor[i + 1]!);
    if (!edge) return [{ x: start.x, y: start.y, at: 0 }, { x: end.x, y: end.y, at: n - 1 }];
    const a = edge[0]! * 3, b = edge[1]! * 3;
    leftX[i] = m.verts[a]!; leftY[i] = m.verts[a + 1]!;
    rightX[i] = m.verts[b]!; rightY[i] = m.verts[b + 1]!;
  }
  leftX[n - 1] = end.x; leftY[n - 1] = end.y;
  rightX[n - 1] = end.x; rightY[n - 1] = end.y;

  const pts: { x: number; y: number; at: number }[] = [{ x: start.x, y: start.y, at: 0 }];
  let portalApexX = start.x, portalApexY = start.y;
  let portalLeftX = start.x, portalLeftY = start.y;
  let portalRightX = start.x, portalRightY = start.y;
  let apexIndex = 0, leftIndex = 0, rightIndex = 0;

  for (let i = 0; i < n; i++) {
    const lx = i < n ? leftX[i]! : end.x, ly = i < n ? leftY[i]! : end.y;
    const rx = i < n ? rightX[i]! : end.x, ry = i < n ? rightY[i]! : end.y;
    if (triarea2D(portalApexX, portalApexY, portalRightX, portalRightY, rx, ry) <= 0) {
      if (
        (portalApexX === portalRightX && portalApexY === portalRightY)
        || triarea2D(portalApexX, portalApexY, portalLeftX, portalLeftY, rx, ry) > 0
      ) {
        portalRightX = rx; portalRightY = ry; rightIndex = i;
      } else {
        pts.push({ x: portalLeftX, y: portalLeftY, at: leftIndex });
        portalApexX = portalLeftX; portalApexY = portalLeftY;
        apexIndex = leftIndex;
        portalLeftX = portalApexX; portalLeftY = portalApexY;
        portalRightX = portalApexX; portalRightY = portalApexY;
        leftIndex = apexIndex; rightIndex = apexIndex;
        i = apexIndex;
        continue;
      }
    }
    if (triarea2D(portalApexX, portalApexY, portalLeftX, portalLeftY, lx, ly) >= 0) {
      if (
        (portalApexX === portalLeftX && portalApexY === portalLeftY)
        || triarea2D(portalApexX, portalApexY, portalRightX, portalRightY, lx, ly) < 0
      ) {
        portalLeftX = lx; portalLeftY = ly; leftIndex = i;
      } else {
        pts.push({ x: portalRightX, y: portalRightY, at: rightIndex });
        portalApexX = portalRightX; portalApexY = portalRightY;
        apexIndex = rightIndex;
        portalLeftX = portalApexX; portalLeftY = portalApexY;
        portalRightX = portalApexX; portalRightY = portalApexY;
        leftIndex = apexIndex; rightIndex = apexIndex;
        i = apexIndex;
        continue;
      }
    }
  }
  pts.push({ x: end.x, y: end.y, at: n - 1 });
  return pts;
}

// Corridor slot owning (x, y), searched only inside [lo, hi] — the two corners' own corridor
// indices. Outside that window the same plan cell belongs to another floor of the same helix.
function corridorPolyAt(
  m: NavMesh,
  corridor: readonly number[],
  lo: number,
  hi: number,
  prev: number,
  x: number,
  y: number,
  zHint?: number,
): number {
  const a = Math.max(0, Math.min(lo, hi) - 1);
  const b = Math.min(corridor.length - 1, Math.max(lo, hi) + 1);
  // Stacked xy (Rotgrip 349: dest z=-196 vs standing z=-206 in Zaetar's Grave): prefer dest.z.
  if (zHint != null && Number.isFinite(zHint)) {
    let bestZ = Infinity;
    let bestI = -1;
    for (let i = a; i <= b; i++) {
      if (!polyContains2D(m, corridor[i]!, x, y)) continue;
      const dz = Math.abs(polyHeightAt(m, corridor[i]!, x, y) - zHint);
      if (dz < bestZ) { bestZ = dz; bestI = i; }
    }
    if (bestI >= 0) return bestI;
  }
  let best = -1;
  let bestD = Infinity;
  for (let i = a; i <= b; i++) {
    if (polyContains2D(m, corridor[i]!, x, y)) {
      const d = Math.abs(i - prev);
      if (d < bestD) { bestD = d; best = i; }
    }
  }
  if (best >= 0) return best;
  for (let i = a; i <= b; i++) {
    const d = distToPolyBBox(m, corridor[i]!, x, y);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best >= 0 ? best : prev;
}

export type NavMeshPathOpts = {
  /** Snap radius for the endpoints (yards). */
  radius?: number;
  /** Emitted step length; smaller means a denser vertical profile. */
  stepYd?: number;
  // Filled on failure, and the three answers differ: `unsnappable` has no floor under an endpoint,
  // `disconnected` is an honest no, and `exhausted` hit maxVisited and may still have a path.
  diag?: {
    reason?: 'unsnappable' | 'disconnected' | 'exhausted';
    visited?: number;
    roomHops?: number;
    roomNames?: string[];
    roomFallback?: boolean;
  };
  /** Poly visits before giving up. Live walks pass 8k so a miss cannot flood the mesh. */
  maxVisited?: number;
  /** Room-graph refine (C5). Default on when the map has a room bake. Probes pass false to A/B. */
  roomGraph?: boolean;
};

// Path between two world points, every step carrying its floor z. Returns null when the polys are
// genuinely disconnected — an honest null, rather than a beeline through rock.
export function findPathNavMesh(
  m: NavMesh,
  from: NavMeshPos,
  to: NavMeshPos,
  opts: NavMeshPathOpts = {},
): { x: number; y: number; z: number }[] | null {
  const radius = opts.radius ?? 8;
  const step = opts.stepYd ?? STEP_YD;
  const a = findNearestPoly(m, from.x, from.y, from.z, radius);
  // Dest must stay on dest.z. Plan-first scoring otherwise picks dest.xy on
  // THIS floor (stacked column) and the walk stands on top of the boss.
  const storey = to.z != null && Number.isFinite(to.z) ? 8 : undefined;
  let b = findNearestPoly(m, to.x, to.y, to.z, radius, storey);
  if (!b && storey != null) b = findNearestPoly(m, to.x, to.y, to.z, Math.max(radius, 20), storey);
  if (!a || !b) {
    if (opts.diag) opts.diag.reason = 'unsnappable';
    return null;
  }
  const maxVisited = opts.maxVisited ?? 200_000;
  const hopStats = { visited: 0, capped: false };
  let corridor: number[] | null = null;
  const useRooms = opts.roomGraph !== false;
  const graph = useRooms ? roomGraphForMesh(m) : null;
  if (graph) {
    const roomStats = { visited: 0, hops: 0, rooms: [] as string[] };
    corridor = findPolyPathViaRooms(m, graph, a.poly, b.poly, maxVisited, roomStats);
    if (corridor) {
      if (opts.diag) {
        opts.diag.visited = roomStats.visited;
        opts.diag.roomHops = roomStats.hops;
        opts.diag.roomNames = roomStats.rooms;
        opts.diag.roomFallback = false;
      }
    } else if (opts.diag) {
      opts.diag.roomFallback = true;
    }
  }
  if (!corridor) {
    hopStats.visited = 0;
    corridor = findPolyPath(m, a.poly, b.poly, maxVisited, null, hopStats);
    if (opts.diag && opts.diag.visited == null) opts.diag.visited = hopStats.visited;
  }
  if (!corridor) {
    if (opts.diag) opts.diag.reason = hopStats.capped ? 'exhausted' : 'disconnected';
    return null;
  }

  const corners = stringPull(m, corridor, from, to);
  const out: { x: number; y: number; z: number }[] = [];
  let hint = 0;
  const emit = (
    x: number, y: number, lo: number, hi: number, interior = false, zHint?: number,
  ) => {
    hint = corridorPolyAt(m, corridor, lo, hi, hint, x, y, zHint);
    // Open air between a lip and its linked landing (bake-navmesh.mjs jumpLinks) gets no waypoint:
    // the stepper flies lip -> landing on the link. Corners and endpoints always emit.
    if (interior && distToPolyEdges2D(m, corridor[hint]!, x, y) > OFF_POLY_TOL_YD) return;
    const z = polyHeightAt(m, corridor[hint]!, x, y);
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - x) < 1e-4 && Math.abs(last.y - y) < 1e-4) {
      last.z = z;
      return;
    }
    out.push({ x, y, z });
  };
  emit(corners[0]!.x, corners[0]!.y, 0, 0, false, from.z);
  for (let i = 1; i < corners.length; i++) {
    const p0 = corners[i - 1]!;
    const p1 = corners[i]!;
    const z0 = polyHeightAt(m, corridor[p0.at]!, p0.x, p0.y);
    const z1 = polyHeightAt(m, corridor[p1.at]!, p1.x, p1.y);
    const d = dist3(p1.x - p0.x, p1.y - p0.y, z1 - z0);
    const n = Math.max(1, Math.ceil(d / step));
    const destHint = i === corners.length - 1 ? to.z : undefined;
    for (let k = 1; k <= n; k++) {
      emit(
        p0.x + ((p1.x - p0.x) * k) / n, p0.y + ((p1.y - p0.y) * k) / n,
        p0.at, p1.at, k < n, k === n ? destHint : undefined,
      );
    }
  }
  // Zero-length leg (rare spawns share one origin): a path to where you stand is a
  // path, not a failure — returning null here made 9 legs read as beelines.
  if (out.length === 1) out.push({ ...out[0]! });
  return out;
}

// Walking — the other half. A router the stepper cannot follow is worth nothing.

/** Hops explored from the standing poly; a `stepYd` step crosses very few. */
const STEP_HOPS = 6;
/** 64 filled in 2–3 hops on dense Detour clusters (4–6 nei + bridges) and dropped the rest. */
let hopScratch = new Int32Array(256);

function hopPush(nb: number, n: number): number {
  if (hopScratch.lastIndexOf(nb, n - 1) >= 0) return n;
  if (n >= hopScratch.length) {
    const grown = new Int32Array(hopScratch.length * 2);
    grown.set(hopScratch);
    hopScratch = grown;
  }
  hopScratch[n] = nb;
  return n + 1;
}

/** Is `to` reachable from `from` across shared edges / bridged links within `hops`? */
function polyWithinHops(m: NavMesh, from: number, to: number, hops: number): boolean {
  if (from === to) return true;
  let n = 0;
  hopScratch[n++] = from;
  let readStart = 0;
  for (let h = 0; h < hops; h++) {
    const readEnd = n;
    for (let i = readStart; i < readEnd; i++) {
      const p = hopScratch[i]!;
      for (let c = m.polyStart[p]!; c < m.polyStart[p + 1]!; c++) {
        const nb = m.cornerNei[c]!;
        if (nb < 0) continue;
        if (nb === to) return true;
        n = hopPush(nb, n);
      }
      for (let l = m.linkStart[p]!; l < m.linkStart[p + 1]!; l++) {
        const nb = m.linkTo[l]!;
        if (nb === to) return true;
        n = hopPush(nb, n);
      }
    }
    if (n === readEnd) break;
    readStart = readEnd;
  }
  return false;
}

// Step toward `to` by at most `stepYd`, clamped to the mesh, sliding on a blocked axis. A steep
// step is legal when the landing poly CONNECTS to the standing one — another storey does not.
export function stepWalkableNavMesh(
  m: NavMesh,
  from: NavMeshPos,
  to: NavMeshPos,
  stepYd: number,
  zTol = 4,
  // followPathNavMesh sets this: greedy slides must not Euclidean-fall at a lower dest.
  allowJump = false,
): { x: number; y: number; z?: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = detHypot(dx, dy);
  if (!(dist > 1e-9)) {
    if (to.z != null && from.z != null && Math.abs(to.z - from.z) > 0.2) {
      const here = findNearestPoly(m, from.x, from.y, from.z, OFF_POLY_TOL_YD + 0.5);
      const hit = findNearestPoly(m, from.x, from.y, to.z, OFF_POLY_TOL_YD + 0.5);
      if (hit && hit.dist <= 1 && here
        && polyWithinHops(m, here.poly, hit.poly, STEP_HOPS)) {
        const climb = Math.min(Math.abs(hit.z - from.z), stepYd);
        return { x: from.x, y: from.y, z: from.z + Math.sign(hit.z - from.z) * climb };
      }
    }
    return { x: from.x, y: from.y, z: from.z };
  }
  const travel = Math.min(stepYd, dist);
  const ux = dx / dist;
  const uy = dy / dist;
  const stand = findNearestPoly(m, from.x, from.y, from.z, OFF_POLY_TOL_YD + 0.5);
  // Stepping DOWN off a linked lip (dropLinks): the landing is the floor at the waypoint's height.
  // The nearest-by-own-z search below hands back the lip's slope past its edge; that wedged 1 in 6 drops.
  const dropping = to.z != null && from.z != null && from.z - to.z > WALKABLE_CLIMB_YD && stand != null;
  const at = (x: number, y: number) => {
    if (dropping) {
      const low = findNearestPoly(m, x, y, to.z, OFF_POLY_TOL_YD + 0.5);
      if (low && low.dist <= OFF_POLY_TOL_YD && low.z < from.z! - WALKABLE_CLIMB_YD
        && dropLinked(m, stand!.poly, low.poly)) {
        return { x, y, z: low.z };
      }
    }
    // Snap on the SEGMENT's height, not the walker's: hinting from.z holds a step on the floor it is
    // already on, which is how a walk drifts a storey off its corridor (zul-gurub 8502 over 8515).
    const segZ = to.z != null && from.z != null && Number.isFinite(to.z) && Number.isFinite(from.z)
      ? from.z + (to.z - from.z) * Math.min(1, travel / dist)
      : from.z;
    const hit = findNearestPoly(m, x, y, segZ, OFF_POLY_TOL_YD + 0.5);
    if (!hit || hit.dist > OFF_POLY_TOL_YD) return null;
    // Storey climb only. Same-floor dest.z is a mesh height; a 0.5 yd dip then
    // read as "away from dest" and the step was refused — walk froze on every bump.
    if (to.z != null && from.z != null && Math.abs(from.z - to.z) > 3
      && Math.abs(hit.z - to.z) > Math.abs(from.z - to.z) + 0.5) {
      return null;
    }
    if (from.z == null) return { x, y, z: hit.z };
    const rise = hit.z - from.z;
    // Unconnected floor: UP is walkableClimb (MapBuilder.cpp:358) — the symmetric zTol mounted 4 yd
    // walls; DOWN is a fall (MotionMaster.cpp:575 MoveFall) and keeps zTol.
    if (rise <= WALKABLE_CLIMB_YD && -rise <= zTol) return { x, y, z: hit.z };
    if (stand && polyWithinHops(m, stand.poly, hit.poly, STEP_HOPS)) return { x, y, z: hit.z };
    // A long ramp step crosses more than STEP_HOPS tiny polys: walk the segment on connected floor.
    if (rise <= zTol && stand && walkLosClearNavMesh(m, from, { x, y, z: hit.z })) return { x, y, z: hit.z };
    return null;
  };
  // Off a lip whose bake link lands toward the waypoint, or already airborne (edge distance, not bbox):
  // step out over nothing with z falling toward the landing (MotionMaster.cpp:575 MoveFall).
  // Only the corridor follower opts in — a greedy slide onto a lower dest is not a jump.
  if (allowJump && to.z != null && from.z != null && dist <= JUMP_REACH_MAX_YD + OFF_POLY_TOL_YD) {
    const land = findNearestPoly(m, to.x, to.y, to.z, OFF_POLY_TOL_YD + 0.5);
    if (land && land.dist <= OFF_POLY_TOL_YD && land.z < from.z - WALKABLE_CLIMB_YD) {
      // Mid-flight over a gap that has floor UNDER it: plan geometry alone calls that standing, so the
      // jump ended on naxxramas' lower floor 16.8 yd below Thaddius' platform. A unit further above its
      // floor than one climb step (MapBuilder.cpp:1219 walkableClimb) is not standing on it.
      const airborne = !stand || distToPolyEdges2D(m, stand.poly, from.x, from.y) > OFF_POLY_TOL_YD
        || from.z - stand.z > WALKABLE_CLIMB_YD;
      const nx = from.x + ux * travel;
      const ny = from.y + uy * travel;
      const offLip = !airborne && stand!.poly !== land.poly
        && !polyContains2D(m, stand!.poly, nx, ny) && linksToward(m, stand!.poly, land.poly);
      if (airborne || offLip) {
        return { x: nx, y: ny, z: from.z + (land.z - from.z) * (travel / dist) };
      }
    }
  }
  const direct = at(from.x + ux * travel, from.y + uy * travel);
  if (direct) return direct;
  const tryX = at(from.x + ux * travel, from.y);
  const tryY = at(from.x, from.y + uy * travel);
  if (tryX && tryY) return Math.abs(ux) >= Math.abs(uy) ? tryX : tryY;
  if (tryX) return tryX;
  if (tryY) return tryY;
  return { x: from.x, y: from.y, z: from.z };
}

/** Left/right mesh hop off a blocked heading. Prefers the side that closes on `to`. */
export function sidestepNavMesh(
  m: NavMesh,
  from: NavMeshPos,
  to: NavMeshPos,
  hopYd: number,
): { x: number; y: number; z?: number } | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = detHypot(dx, dy);
  if (!(len > 1e-6) || !(hopYd > 0)) return null;
  const px = -dy / len;
  const py = dx / len;
  let best: { x: number; y: number; z?: number } | null = null;
  let bestClose = Infinity;
  for (const sign of [1, -1] as const) {
    const aim = {
      x: from.x + px * hopYd * sign,
      y: from.y + py * hopYd * sign,
      ...(from.z != null ? { z: from.z } : {}),
    };
    const s = stepWalkableNavMesh(m, from, aim, hopYd);
    if (detHypot(s.x - from.x, s.y - from.y) < 0.4) continue;
    const close = detHypot(to.x - s.x, to.y - s.y);
    const here = detHypot(to.x - from.x, to.y - from.y);
    if (close >= here - 0.2) continue;
    if (close < bestClose) { bestClose = close; best = s; }
  }
  return best;
}

// Server climb-arrival: walkableClimb 4 cells × BASE_UNIT_DIM 0.2666666f = 1.0667 yd. Cite: MapBuilder.h:50
// BASE_UNIT_DIM; MapBuilder.cpp:1219 walkableClimb=4.
export const WALKABLE_CLIMB_YD = 4 * 0.2666666;

// A running jump: run 7.0 yd/s (Unit.cpp:66 baseMoveSpeed MOVE_RUN), 7.958 yd/s up at take-off
// (Anticheat/module/Movement/movement.cpp:609 MSG_MOVE_JUMP), gravity 19.291 (Movement/util.cpp:24).
export const RUN_SPEED_YD_S = 7.0;
export const JUMP_SPEED_YD_S = 7.95797334;
export const GRAVITY_YD_S2 = 19.29110527038574;
/** Plan distance a running jump covers by the time it has fallen `dz` yd below the lip. */
export function jumpReachYd(dz: number): number {
  const up = JUMP_SPEED_YD_S;
  return RUN_SPEED_YD_S * (up + Math.sqrt(up * up + 2 * GRAVITY_YD_S2 * Math.max(0, dz))) / GRAVITY_YD_S2;
}
/** jumpReachYd at the deepest fall HandleFall charges nothing for (Player.cpp:19530, 14.57 yd). */
export const JUMP_REACH_MAX_YD = 12;

/** `followPath` over the mesh — drops reached waypoints, carries the floor z. */
export function followPathNavMesh(
  m: NavMesh,
  from: NavMeshPos,
  path: NavMeshPos[],
  stepYd: number,
  arriveYd = 0.35,
): { x: number; y: number; z?: number } {
  while (path.length > 0) {
    const wp = path[0]!;
    const planClose = detHypot(wp.x - from.x, wp.y - from.y) <= arriveYd;
    // A waypoint still more than walkableClimb ABOVE the unit is an unboarded ramp, not arrival:
    // popping bfd's 2.3 yd risers stranded the walker between storeys. Descents keep 4.
    const zBelow = wp.z != null && from.z != null ? wp.z - from.z : 0;
    const zClose = wp.z == null || from.z == null
      || (zBelow <= WALKABLE_CLIMB_YD && -zBelow <= 4);
    // Keep the ramp wp until we climb. Plan-only skip left the unit on the
    // start floor walking dest-XY; dist≈0 below climbs in place.
    if (planClose && zClose) {
      path.shift();
      continue;
    }
    // Connectivity carries the ramp now, so the tolerance stays tight: widening it to the
    // whole remaining rise let a step land on any floor the leg happened to end on.
    const next = stepWalkableNavMesh(m, from, wp, stepYd, 4, true);
    // Climb-pending wp the mesh refuses to climb in place (no poly at wp.z within
    // reach): the old tolerance-4 arrival was benign there — pop, don't wedge.
    if (planClose && !zClose && zBelow > 0 && zBelow <= 4
      && Math.abs(next.x - from.x) < 1e-9 && Math.abs(next.y - from.y) < 1e-9
      && (next.z == null || from.z == null || Math.abs(next.z - from.z) < 1e-9)) {
      path.shift();
      continue;
    }
    return next;
  }
  return { x: from.x, y: from.y, z: from.z };
}

// Binary artifact (<slug>.navmesh.bin) — written by src/dev/etl/bake-navmesh.mjs

const MAGIC = 0x4d4e4350; // 'PCNM' little-endian
const VERSION = 1;

export function encodeNavMesh(a: NavMeshArrays): Uint8Array {
  const polyCount = a.polyStart.length - 1;
  const head = 40;
  const sizes = [
    a.verts.byteLength, a.polyStart.byteLength, a.cornerVert.byteLength,
    a.cornerNei.byteLength, (polyCount + 3) & ~3,
    a.dVStart.byteLength, a.dTStart.byteLength, a.dVerts.byteLength,
    (a.dTris.byteLength + 3) & ~3,
    a.linkStart.byteLength, a.linkTo.byteLength, a.linkVia.byteLength,
  ];
  const total = head + sizes.reduce((s, n) => s + n, 0);
  const buf = new ArrayBuffer(total);
  const dv = new DataView(buf);
  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, VERSION, true);
  dv.setInt32(8, a.mapId, true);
  dv.setUint32(12, polyCount, true);
  dv.setUint32(16, a.verts.length / 3, true);
  dv.setUint32(20, a.cornerVert.length, true);
  dv.setUint32(24, a.dVerts.length / 3, true);
  dv.setUint32(28, a.dTris.length / 4, true);
  dv.setUint32(32, a.linkTo.length, true);
  dv.setUint32(36, 0, true);
  const u8 = new Uint8Array(buf);
  let o = head;
  const put = (src: ArrayBufferView) => {
    u8.set(new Uint8Array(src.buffer, src.byteOffset, src.byteLength), o);
    o += (src.byteLength + 3) & ~3;
  };
  put(a.verts); put(a.polyStart); put(a.cornerVert); put(a.cornerNei);
  put(a.polyFlags); put(a.dVStart); put(a.dTStart); put(a.dVerts); put(a.dTris);
  put(a.linkStart); put(a.linkTo); put(a.linkVia);
  return u8;
}

export function decodeNavMesh(bytes: Uint8Array): NavMesh {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('navmesh: bad magic');
  if (dv.getUint32(4, true) !== VERSION) throw new Error('navmesh: bad version');
  const mapId = dv.getInt32(8, true);
  const polyCount = dv.getUint32(12, true);
  const vertCount = dv.getUint32(16, true);
  const cornerCount = dv.getUint32(20, true);
  const dVertCount = dv.getUint32(24, true);
  const dTriCount = dv.getUint32(28, true);
  const linkCount = dv.getUint32(32, true);
  let o = 40;
  // Copy, never view: typed arrays need natural alignment and `bytes.byteOffset`
  // (a fetch/readFile slice) is not guaranteed to be 4-aligned.
  const grab = (byteLen: number): ArrayBuffer => {
    const out = bytes.slice(o, o + byteLen).buffer;
    o += (byteLen + 3) & ~3;
    return out;
  };
  const verts = new Float32Array(grab(vertCount * 12));
  const polyStart = new Uint32Array(grab((polyCount + 1) * 4));
  const cornerVert = new Uint32Array(grab(cornerCount * 4));
  const cornerNei = new Int32Array(grab(cornerCount * 4));
  const polyFlags = new Uint8Array(grab(polyCount));
  const dVStart = new Uint32Array(grab((polyCount + 1) * 4));
  const dTStart = new Uint32Array(grab((polyCount + 1) * 4));
  const dVerts = new Float32Array(grab(dVertCount * 12));
  const dTris = new Uint8Array(grab(dTriCount * 4));
  const linkStart = new Uint32Array(grab((polyCount + 1) * 4));
  const linkTo = new Int32Array(grab(linkCount * 4));
  const linkVia = new Uint32Array(grab(linkCount * 4));
  return buildNavMesh({
    mapId, verts, polyStart, cornerVert, cornerNei, polyFlags,
    dVStart, dTStart, dVerts, dTris, linkStart, linkTo, linkVia,
  });
}

/**
 * A CLOSED DOOR IS NOT A WALL TO THE ROUTER. (Operator direction, 2026-09-05.)
 *
 * This used to stamp NAV_BLOCKED across the doorway of every shut progress door, so the walker
 * could not cross a shut Emberseer Out. Making that correct needs all three halves in sync — the
 * door baked into the plate, a physical stopper in the mesh that lifts when it opens, and a route
 * step that clicks the door — and only the middle one existed. What shipped was a clickable
 * picture with no wall behind it and a router that refused to path past it anyway, so the party
 * could not follow its own route until someone dragged them through by hand.
 *
 * So the block is gone and the mesh is what the client's own mmaps say: doorways are walkable.
 * Progression is unchanged — it never lived here. `requiresFlag` / `objectGate` on the encounter
 * graph is what still holds a boss shut until his door is opened.
 *
 * Kept as a named no-op returning 0 so the UBRS floor state keeps ONE call site to delete when a
 * real dynamic-obstacle pass lands, rather than the caller quietly forgetting doors exist.
 */
export function stampNavMeshDoors(
  _m: NavMesh,
  _closed: readonly { x: number; y: number; z?: number; o: number }[],
): number {
  return 0;
}

/** Lazily allocate the author cost field. 1 everywhere until something stamps. */
function authorCostOf(m: NavMesh): Float32Array {
  if (!m.authorCost) m.authorCost = new Float32Array(m.polyCount).fill(1);
  return m.authorCost;
}

// Mark world points as HAZARDS the router should walk around — the mesh's stampNavAvoid. Cost,
// never a block: UBRS has 271 Rookery Eggs at 1.77 yd spacing, so blocking them seals the room.
export function stampNavMeshAvoid(
  m: NavMesh,
  points: readonly { x: number; y: number; z?: number }[],
  radiusYd: number,
  mul: number,
): number {
  if (!points.length || !(mul > 1)) return 0;
  const cost = authorCostOf(m);
  const seen = new Set<number>();
  for (const pt of points) {
    forEachNearbyPoly(m, pt.x, pt.y, radiusYd, (p) => {
      if (seen.has(p)) return;
      const dx = m.polyCenter[p * 3]! - pt.x;
      const dy = m.polyCenter[p * 3 + 1]! - pt.y;
      if (detHypot(dx, dy) > radiusYd) return;
      // A hazard on the floor below is not this floor's hazard.
      if (pt.z != null && Number.isFinite(pt.z)
        && Math.abs(m.polyCenter[p * 3 + 2]! - pt.z) > STOREY_DZ_YD) return;
      seen.add(p);
      cost[p] = mul;
    });
  }
  clearRoomGraphCache(m.mapId);
  return seen.size;
}

// Operator-authored lane: make the drawn corridor CHEAPER than the floor around it. Takes the
// MINIMUM, so a lane through a hazard wins. Where the mesh has no floor, re-bake — never mint.
export function stampNavMeshLane(
  m: NavMesh,
  segments: readonly { x1: number; y1: number; x2: number; y2: number; z?: number }[],
  widthYd = 2.5,
  preferMul = 0.55,
): number {
  if (!segments.length || !(preferMul > 0) || preferMul >= 1) return 0;
  const cost = authorCostOf(m);
  const half = widthYd / 2;
  const seen = new Set<number>();
  for (const sg of segments) {
    const vx = sg.x2 - sg.x1;
    const vy = sg.y2 - sg.y1;
    const len = detHypot(vx, vy);
    if (!(len > 1e-6)) continue;
    const steps = Math.max(1, Math.ceil(len / STEP_YD));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = sg.x1 + vx * t;
      const py = sg.y1 + vy * t;
      forEachNearbyPoly(m, px, py, half, (p) => {
        if (seen.has(p)) return;
        const dx = m.polyCenter[p * 3]! - px;
        const dy = m.polyCenter[p * 3 + 1]! - py;
        if (detHypot(dx, dy) > half) return;
        if (sg.z != null && Number.isFinite(sg.z)
          && Math.abs(m.polyCenter[p * 3 + 2]! - sg.z) > STOREY_DZ_YD) return;
        seen.add(p);
        if (preferMul < cost[p]!) cost[p] = preferMul;
      });
    }
  }
  clearRoomGraphCache(m.mapId);
  return seen.size;
}

/** Drop every author stamp on a mesh (mask reload, editor clear). */
export function clearNavMeshAuthorCost(m: NavMesh): void {
  m.authorCost = null;
  clearRoomGraphCache(m.mapId);
}

// Registry — same shape as nav.ts's, so findPathForMap can prefer the mesh

const meshByMapId = new Map<number, NavMesh>();
/** Where each registered mesh was fetched from, so another thread can load the same bytes. */
const meshUrlByMapId = new Map<number, string>();

export function registerNavMeshForMap(mapId: number, mesh: NavMesh, sourceUrl?: string): void {
  meshByMapId.set(mapId | 0, mesh);
  if (sourceUrl) meshUrlByMapId.set(mapId | 0, sourceUrl);
}

/** The URL the map's mesh came from, or null for a mesh registered from memory. */
export function navMeshSourceUrl(mapId: number): string | null {
  return meshUrlByMapId.get(mapId | 0) ?? null;
}

export function navMeshForMap(mapId: number): NavMesh | null {
  return meshByMapId.get(mapId | 0) ?? null;
}

export function clearNavMeshRegistry(mapId?: number): void {
  if (mapId == null) {
    meshByMapId.clear();
    meshUrlByMapId.clear();
    portalNetByMap.clear();
  } else {
    meshByMapId.delete(mapId | 0);
    meshUrlByMapId.delete(mapId | 0);
    portalNetByMap.delete(mapId | 0);
  }
  clearRoomGraphCache(mapId);
}
