// Shared nav vocabulary — the words that outlive the surface that first defined them. A leaf
// module: it imports nothing else from this directory, and nothing raster-shaped is here.

import { detHypot } from '../../engine/core/detMath.ts';

// A world position. Optional z is a floor HINT — which storey — never a 3-D coordinate to interpolate
// through. Callers that carry a real z say so by making it finite.
export type NavPos = { x: number; y: number; z?: number };

// Half the vmap grid, 0.5 * 64 * 533.33333333 — VMapManager2.cpp:65-74. Client world and
// vmap-internal are related by (MID - x, MID - y, z), which is its own inverse on x and y.
export const NAV_MID = 0.5 * 64.0 * 533.33333333;

// Two floor heights within this are the same floor for hint purposes — two storeys of height quantisation.
// A larger gap means the caller is asking about a different storey.
export const Z_HINT_TOL = 8;

// Swim is this much slower than a run: MOVE_RUN 7.0 / MOVE_SWIM 4.722222 — Unit.cpp:63-71 `baseMoveSpeed`.
// A step cost multiplier, not a speed.
export const SWIM_STEP_COST = 7.0 / 4.722222;

/** Walked length of a route, in yards. Surface-agnostic: it only adds up the steps. */
export function pathLength(path: readonly NavPos[]): number {
  let d = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    d += detHypot(path[i + 1]!.x - path[i]!.x, path[i + 1]!.y - path[i]!.y);
  }
  return d;
}

/** Why a route came back the way it did. Filled by whichever router answered. */
export type FindPathDiag = {
  expanded: number;
  hitCap: boolean;
  unsnappable: boolean;
  /** Multi-storey only: band changes taken (ramps/stairs). */
  storeyTransfers?: number;
  /** Multi-storey only: distinct layers touched. */
  storeysUsed?: number;
  // Which router answered. `raster` means the 3-D navmesh could not — the caller is holding a 2-D collapse
  // whose vertical is not trustworthy.
  source?: 'navmesh' | 'raster';
};
