// Session nav registry — map-id facades over the navmesh and the collision geometry. One surface
// per question: the mesh answers floor, height, walk, swim and routing; collision answers sight.

import {
  COLLISION_HEIGHT_YD, clearCollisionRegistry, collisionForMap, losClearCollision,
} from './navCollision.ts';
import {
  clearNavMeshRegistry, connectedFloorZNavMesh, findPathNavMesh, heightAtNavMesh,
  isSwimNavMesh, isWalkableNavMesh, navMeshForMap,
} from './navmesh.ts';
import { clearOutdoorsRegistry, outdoorsAtNavMesh, outdoorsForMap } from './navOutdoors.ts';
import { Z_HINT_TOL, type FindPathDiag, type NavPos } from './navTypes.ts';
import { detCos, detSin } from '../../engine/core/detMath.ts';

// Eye height for one endpoint of a sight query, or null when no surface knows the floor there. A
// caller carrying a finite z is standing somewhere; one that does not gets it from floorZForMap.
function eyeZ(mapId: number, p: NavPos): number | null {
  if (p.z != null && Number.isFinite(p.z)) return p.z + COLLISION_HEIGHT_YD;
  const z = floorZForMap(mapId, p.x, p.y);
  return z == null ? null : z + COLLISION_HEIGHT_YD;
}

// Sight between two world points on a registered map, collision geometry first. `null` means NO
// geometry is registered, so the caller decides whether to fail open rather than inventing any.
export function sightClearForMap(mapId: number, a: NavPos, b: NavPos): boolean | null {
  // Real collision geometry wins wherever it is loaded: it is the only tier that carries z, so it
  // neither blocks a sightline passing over a wall nor one between two storeys.
  const col = collisionForMap(mapId);
  if (col) {
    // IsWithinLOS (Object.cpp:1399-1404) adds GetCollisionHeight to BOTH ends. Without it the
    // ray runs along the floor and every pair reads blocked.
    const az = eyeZ(mapId, a);
    const bz = eyeZ(mapId, b);
    if (az != null && bz != null) {
      return losClearCollision(col, { x: a.x, y: a.y, z: az }, { x: b.x, y: b.y, z: bz });
    }
    // No floor under an endpoint means no honest 3-D question to ask. Fall through rather than
    // answer one at z = 0, which is underground on every map.
  }
  // Nothing registered: the caller decides whether to fail open. Never invent geometry.
  return null;
}

// Session registry (pure — UI primes, engine reads)


// Floor z for a mover already standing at `fromZ`, refusing a route hint on a storey the standing
// floor does not connect to. Null means no mesh, or no floor near fromZ here.
export function connectedFloorZForMap(
  mapId: number,
  x: number,
  y: number,
  fromZ: number,
  hintZ?: number,
): number | null {
  const mesh = navMeshForMap(mapId);
  return mesh ? connectedFloorZNavMesh(mesh, x, y, fromZ, hintZ) : null;
}

// Is this world point somewhere a unit can stand? `null` means no geometry is registered at all,
// so the caller decides. ANY tier saying yes is a yes — this asks "is there floor", not "which".
export function isWalkablePointForMap(
  mapId: number,
  x: number,
  y: number,
  zHint?: number,
): boolean | null {
  const mesh = navMeshForMap(mapId);
  return mesh ? isWalkableNavMesh(mesh, x, y, zHint) : null;
}

// Is this world point swim water on a registered map? `null` means no geometry is registered, so
// the caller decides. Cite: Unit::IsInWater — any liquid down to LIQUID_MAP_WATER_WALK counts.
export function isSwimPointForMap(
  mapId: number,
  x: number,
  y: number,
  zHint?: number,
): boolean | null {
  const mesh = navMeshForMap(mapId);
  return mesh ? isSwimNavMesh(mesh, x, y, zHint) : null;
}

/**
 * The nearest point to (x, y) a body can actually stand on, or null when it is already standing on
 * one (or no geometry is registered). Deterministic: a fixed ring of 16 bearings at 1 yd steps, so
 * a replay lands on the same square.
 *
 * A spawn row can sit a yard or two off the mesh edge — a tunnel seat fanned out across the
 * corridor, a keep doorway — and a body seeded there is refused every step by the floor clamp and
 * never moves again. Cite: Map.cpp GetHitPosition; PathFinder.cpp getPolyByLocation extents.
 */
export function nearestWalkablePointForMap(
  mapId: number,
  x: number,
  y: number,
  zHint?: number,
  radiusYd = 8,
): { x: number; y: number } | null {
  const mesh = navMeshForMap(mapId);
  if (!mesh) return null;
  if (isWalkableNavMesh(mesh, x, y, zHint) !== false) return null;
  for (let r = 1; r <= radiusYd; r++) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const nx = x + detCos(a) * r;
      const ny = y + detSin(a) * r;
      if (isWalkableNavMesh(mesh, nx, ny, zHint) !== false) return { x: nx, y: ny };
    }
  }
  return null;
}

// Is this world point under open sky? `null` means the map ships no outdoors bitset, so the caller
// decides — the same contract sightClearForMap keeps. Cite: GridMap.cpp:892-903 IsOutdoors.
export function isOutdoorsForMap(
  mapId: number,
  x: number,
  y: number,
  zHint?: number,
): boolean | null {
  const mesh = navMeshForMap(mapId);
  const bits = outdoorsForMap(mapId);
  if (!mesh || !bits) return null;
  return outdoorsAtNavMesh(bits, mesh, x, y, zHint);
}

export function floorZForMap(
  mapId: number,
  x: number,
  y: number,
  zHint?: number,
): number | null {
  const mesh = navMeshForMap(mapId);
  return mesh ? heightAtNavMesh(mesh, x, y, zHint) : null;
}

// Game entry for map-id pathing. One router. `diag.reason` distinguishes the three misses: only
// `disconnected` is an honest no; `unsnappable` and `exhausted` both mean ask again.
/** Dungeon click/autopilot walk. Same 40k as bgWorld.ts SEARCH_MAX_VISITED. Chase stays at 8k. */
export const WALK_MAX_VISITED = 40_000;

export function findPathForMap(
  mapId: number,
  from: NavPos,
  to: NavPos,
  diag?: FindPathDiag,
  opts?: { maxVisited?: number },
): NavPos[] | null {
  const mesh = navMeshForMap(mapId);
  if (!mesh) return null;
  if (diag) diag.source = 'navmesh';
  const meshDiag: { reason?: 'unsnappable' | 'disconnected' | 'exhausted' } = {};
  // A miss must not visit every poly (a disconnected dest was a 1-2 s flood inside floorLogic).
  // Chase stays at 8k. Dungeon/BG walk raises it: ZF Ukorz 8528, Ruuzlu 11449; bgWorld.ts 40_000.
  const viaMesh = findPathNavMesh(mesh, from, to, { maxVisited: opts?.maxVisited ?? 8_000, diag: meshDiag });
  if (viaMesh) {
    const end = viaMesh[viaMesh.length - 1]!;
    const destZ = to.z;
    // dest.xy on the standing floor is not a path to the pin (PROBE-MISTAKES A1z).
    if (destZ == null || !Number.isFinite(destZ) || end.z == null
      || Math.abs(end.z - destZ) <= Z_HINT_TOL) {
      return viaMesh;
    }
  }
  if (diag) {
    if (meshDiag.reason === 'unsnappable') diag.unsnappable = true;
    else if (meshDiag.reason === 'exhausted') diag.hitCap = true;
  }
  return null;
}

// Drop one or all registered maps. The mesh and the collision own their own registries
// (clearNavMeshRegistry, clearCollisionRegistry).
export function clearNavRegistry(mapId?: number): void {
  clearNavMeshRegistry(mapId);
  clearCollisionRegistry(mapId);
  clearOutdoorsRegistry(mapId);
}
