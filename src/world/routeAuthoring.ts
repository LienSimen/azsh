// Geometry for hand-authored dungeon routes: where a new click belongs in the step list, and
// which step the party is walking toward. Shared by both editors and the autopilot. Pure.

export type RoutePoint = { x: number; y: number; z?: number | null };

/** 3-D when both points carry z, plan-view otherwise (a click on a plate has no z yet). */
export function routeDist(a: RoutePoint, b: RoutePoint): number {
  const dz = a.z != null && b.z != null && Number.isFinite(a.z) && Number.isFinite(b.z)
    ? a.z - b.z
    : 0;
  return Math.hypot(a.x - b.x, a.y - b.y, dz);
}

/** Plan-view distance: what is drawn on the plate, whatever the storeys say. */
export function routeDist2(a: RoutePoint, b: RoutePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** One owner, in domain/nav/storey.ts, which also says why the floor gate is a different 10. */
import { REACH_STOREY_DZ_YD } from '../domain/nav/storey.ts';
export { REACH_STOREY_DZ_YD };

/** Same floor when both points carry z. Missing z stays compatible (legacy 2-D nodes). */
export function routeSameStorey(a: RoutePoint, b: RoutePoint): boolean {
  const az = a.z;
  const bz = b.z;
  if (az == null || bz == null || !Number.isFinite(az) || !Number.isFinite(bz)) return true;
  return Math.abs(az - bz) <= REACH_STOREY_DZ_YD;
}

// On the pin in plan view AND on its storey. Same-xy one floor up is not arrival — a click on any plate of
// a stacked map used to count the step done.
export function routeArrived(party: RoutePoint, dest: RoutePoint, xyYd: number): boolean {
  if (routeDist2(party, dest) > xyYd) return false;
  return routeSameStorey(party, dest);
}

// Z the walk must finish on. A stacked column is walkable at dest.xy on THIS floor; stamping the path's
// landing z completed the click a storey below the pin. Truncated (aggro-cut) walks keep the cut's z.
export function walkArriveZ(
  destZ: number | undefined,
  lastPtZ: number | undefined,
  truncated: boolean,
): number | undefined {
  const dest = destZ != null && Number.isFinite(destZ) ? destZ : undefined;
  const last = lastPtZ != null && Number.isFinite(lastPtZ) ? lastPtZ : undefined;
  if (truncated) return last ?? dest;
  return dest ?? last;
}

/**
 * Closest point on segment a→b. `d` is plan-view; `dz` is the height gap to it (0 when either
 * side has no z). 3-D distance is `hypot(d, dz)`. Kept separate because the two questions here
 * want different metrics: what the operator clicked is 2-D, where the party stands is 3-D.
 *
 * z interpolates only when BOTH ends have one. Inheriting one end's z put a leg 28 yd away
 * while its own start node read 21 yd, so routeForwardIndex aimed backwards for ever.
 */
export function segmentNearest(
  a: RoutePoint,
  b: RoutePoint,
  p: RoutePoint,
): { t: number; d: number; dz: number } {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  const gap = (z: number | null | undefined): number =>
    z != null && Number.isFinite(z) && p.z != null && Number.isFinite(p.z)
      ? Math.abs(z - p.z)
      : 0;
  if (len2 < 1e-6) return { t: 0, d: routeDist2(a, p), dz: gap(a.z ?? b.z) };
  let t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const bothZ = a.z != null && b.z != null && Number.isFinite(a.z) && Number.isFinite(b.z);
  return {
    t,
    d: Math.hypot(a.x + vx * t - p.x, a.y + vy * t - p.y),
    dz: gap(bothZ ? a.z! + (b.z! - a.z!) * t : null),
  };
}

/**
 * Where to splice a new step: into the DRAWN LEG NEAREST THE CLICK, or at an end when the click
 * is out past one. Nearest-leg, not cheapest-insertion — on a route that folds back through the
 * same corridor, cheapest-insertion answered "step 16" for a click beside leg 1-2
 * (probe-path-editor-authoring). Returns `nodes.length` for append.
 */
export function routeInsertIndex(nodes: readonly RoutePoint[], p: RoutePoint): number {
  const n = nodes.length;
  if (n === 0) return 0;
  if (n === 1) return 1;
  /** Legs this close in plan view are "the same place on the picture"; z then decides. */
  const TIE_YD = 6;
  const legs: { i: number; d: number; dz: number }[] = [];
  for (let i = 1; i < n; i++) {
    const { d, dz } = segmentNearest(nodes[i - 1]!, nodes[i]!, p);
    legs.push({ i, d, dz });
  }
  let best = legs[0]!;
  for (const l of legs) if (l.d < best.d) best = l;
  for (const l of legs) {
    if (l.d <= best.d + TIE_YD && l.dz < best.dz - TIE_YD) best = l;
  }
  // Out past an end (nearer the terminal step than any leg) → extend rather than splice.
  const dFirst = routeDist2(nodes[0]!, p);
  const dLast = routeDist2(nodes[n - 1]!, p);
  if (dLast <= best.d && dLast <= dFirst) return n;
  if (dFirst <= best.d) return 0;
  return best.i;
}

// The step the party is walking toward: far end of its nearest leg. Projection, not nearest node (halfway
// down a leg the nearest node is behind you). Past the end → `nodes.length`.
export function routeForwardIndex(nodes: readonly RoutePoint[], p: RoutePoint): number {
  const n = nodes.length;
  if (n === 0) return 0;
  if (n === 1) return 0;
  let bestIdx = 1;
  let bestD = Infinity;
  for (let i = 1; i < n; i++) {
    const { t, d, dz } = segmentNearest(nodes[i - 1]!, nodes[i]!, p);
    const d3 = Math.hypot(d, dz); // the party's z is real: a leg one floor up is not near
    if (d3 < bestD) {
      bestD = d3;
      // t≈1 means the party is standing on the leg's end node — lead to the one after it.
      bestIdx = t >= 0.999 ? i + 1 : i;
    }
  }
  // Before the route starts: closer to step 1 itself than to any leg → aim at step 1.
  if (routeDist(nodes[0]!, p) < bestD) return 0;
  return bestIdx;
}
