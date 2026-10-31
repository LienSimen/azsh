// RANDOM_MOTION_TYPE: a body hops one to three times inside its spawndist, then stands 3-10 s.
// Cite: RandomMovementGenerator.h:32-33, :98-108; PathFinder.cpp:1366-1372; Creature.cpp:1677.

import { hashSeed, mulberry32 } from '../../engine/core/rng.ts';
import { PATROL_WALK_SPEED_YD, wanderTarget } from '../../data/dungeonSpawns.ts';
import {
  stepWalkableNavMesh, walkLosClearNavMesh, WALKABLE_CLIMB_YD, type NavMesh,
} from '../nav/navmesh.ts';

/** RandomMovementGenerator.h:33 — the stand between bursts. */
export const WANDER_PAUSE_MIN_MS = 3000;
export const WANDER_PAUSE_MAX_MS = 10000;
/** RandomMovementGenerator.h:32 — hops drawn per burst. */
export const WANDER_MOVES_MAX = 3;
// The core draws every hop with `urand`, which a lockstep floor cannot replay: the drift is a
// fixed 48-leg loop keyed on the guid, replayable from elapsedMs the way a waypoint patrol is.
export const WANDER_LEGS = 48;

export type WanderLeg = { x: number; y: number; z?: number; waitMs: number };

type CachedWander = { mesh: NavMesh | null; legs: readonly WanderLeg[] };
const byGuid = new Map<number, CachedWander>();

// The 48-leg drift loop for one spawn, mesh-clamped out from home once so the tick pays no nav
// query. The core's own path to the point is a straight line (PathFinder.cpp:1357 m_straightLine).
export function wanderPathFor(
  guid: number,
  home: { x: number; y: number; z?: number },
  spawndist: number,
  mesh?: NavMesh | null,
): readonly WanderLeg[] {
  const g = guid | 0;
  const meshKey = mesh ?? null;
  const hit = byGuid.get(g);
  if (hit && hit.mesh === meshKey) return hit.legs;
  const legs: WanderLeg[] = [];
  let count = 1;
  let prev: { x: number; y: number; z?: number } = home;
  for (let k = 0; k < WANDER_LEGS; k++) {
    const rng = mulberry32(hashSeed(g, k));
    const angle = rng.next() * 2 * Math.PI;
    const radiusFrac = rng.next();
    const at = wanderTarget(home, spawndist, angle, radiusFrac);
    const reach = spawndist * radiusFrac;
    let on = at;
    if (mesh) {
      const dest = { x: at.x, y: at.y, z: home.z };
      const stepped = stepWalkableNavMesh(mesh, prev, dest, reach, WALKABLE_CLIMB_YD);
      // Straight-line raycast: a blocked hop stays put (PathFinder.cpp:802 m_straightLine).
      // An off-mesh home has no LOS from itself; take the clamp so the first hop can board.
      const fromOn = walkLosClearNavMesh(mesh, prev, prev, 0.55);
      on = !fromOn || walkLosClearNavMesh(mesh, prev, stepped, 0.55) ? stepped : prev;
    }
    // The burst counter, verbatim: a pause lands only on the hop that ends one.
    let waitMs = 0;
    if (count > 1) count--;
    else {
      count = rng.int(1, WANDER_MOVES_MAX);
      waitMs = rng.int(WANDER_PAUSE_MIN_MS, WANDER_PAUSE_MAX_MS);
    }
    legs.push({ x: on.x, y: on.y, ...(on.z != null ? { z: on.z } : {}), waitMs });
    prev = { x: on.x, y: on.y, ...(on.z != null ? { z: on.z } : {}) };
  }
  byGuid.set(g, { mesh: meshKey, legs });
  return legs;
}

/** Walk speed is the generator's default (`i_walk`). Cite: RandomMovementGenerator.h:31. */
export const WANDER_SPEED_YD = PATROL_WALK_SPEED_YD;

/** True when this spawn drifts: RANDOM_MOTION_TYPE with a radius to drift in. */
export function wandersInPlace(movementType: number, spawndist: number | undefined): boolean {
  return movementType === 1 && (spawndist ?? 0) > 0;
}
