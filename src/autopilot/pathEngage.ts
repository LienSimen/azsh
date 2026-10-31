/**
 * Path-aware dungeon/raid pull: who a walk would aggro, and where to stand so Charge
 * and Auto Shot have a window. Who we pull is GetAttackDistance ∩ corridor — never a
 * bubble around the party (that would take side-room packs the walk would miss).
 *
 * The stand is inside Charge 100 rangeMax 25 and outside default GetAttackDistance 18
 * so the party does not walk into the room (that chain-pulls the next pack). Hold there;
 * do not path melee onto the pack after the target is set.
 *
 * Cite: Unit.cpp GetAttackDistance; playerbots MovementActions.cpp:1886-1940 (stop the
 * path when a target's own attack distance + LOS would pull); fixtures Charge 100
 * rangeMax 25; Auto Shot SpellRange min ~8; domain/nav/storey.ts STOREY_DZ_YD 10.
 */


/** Pull stand: Charge 100 rangeMax 25 minus 1, outside default detection 18. */
export const PATH_ENGAGE_OPEN_YD = 24;

export type PathPt = { x: number; y: number; z?: number };

import { STOREY_DZ_YD } from '../domain/nav/storey.ts';

export type PathHostile = {
  guid: number;
  x: number;
  y: number;
  z?: number;
  detectionYd: number;
};

export type PathEngageHit = {
  guid: number;
  /** Yards along the polyline to the closest path point. */
  pathYd: number;
  /** Planar distance from that path point to the mob. */
  distToPath: number;
  closest: PathPt;
  detectionYd: number;
};

const sameStorey = (a: PathPt, b: PathPt, dz = STOREY_DZ_YD): boolean => {
  const az = a.z;
  const bz = b.z;
  if (az == null || bz == null || !Number.isFinite(az) || !Number.isFinite(bz)) return true;
  return Math.abs(az - bz) <= dz;
};

export function closestOnSegment(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  px: number,
  py: number,
): { x: number; y: number; t: number; dist: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (!(len2 > 1e-12)) {
    return { x: ax, y: ay, t: 0, dist: Math.hypot(px - ax, py - ay) };
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const x = ax + t * dx;
  const y = ay + t * dy;
  return { x, y, t, dist: Math.hypot(px - x, py - y) };
}

export function closestOnPath(
  path: readonly PathPt[],
  p: PathPt,
): { pt: PathPt; pathYd: number; dist: number } | null {
  if (path.length === 0) return null;
  if (path.length === 1) {
    const a = path[0]!;
    return {
      pt: a.z != null ? { x: a.x, y: a.y, z: a.z } : { x: a.x, y: a.y },
      pathYd: 0,
      dist: Math.hypot(p.x - a.x, p.y - a.y),
    };
  }
  let bestPt: PathPt = path[0]!;
  let bestDist = Infinity;
  let bestPathYd = 0;
  let walked = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const hit = closestOnSegment(a.x, a.y, b.x, b.y, p.x, p.y);
    const pathYd = walked + hit.t * Math.hypot(b.x - a.x, b.y - a.y);
    if (hit.dist < bestDist) {
      bestDist = hit.dist;
      bestPathYd = pathYd;
      const z = a.z != null && b.z != null
        ? a.z + hit.t * (b.z - a.z)
        : (hit.t < 0.5 ? a.z : b.z);
      bestPt = z != null && Number.isFinite(z)
        ? { x: hit.x, y: hit.y, z }
        : { x: hit.x, y: hit.y };
    }
    walked += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return { pt: bestPt, pathYd: bestPathYd, dist: bestDist };
}

// Hostiles whose own GetAttackDistance intersects the corridor. Detection is theirs, never
// PATH_ENGAGE_OPEN_YD.
export function hostilesOnPath(
  path: readonly PathPt[],
  hostiles: readonly PathHostile[],
  opts?: {
    sameStoreyDz?: number;
    hasLos?: (pathPt: PathPt, hostile: PathHostile) => boolean;
  },
): PathEngageHit[] {
  if (path.length === 0 || hostiles.length === 0) return [];
  const dz = opts?.sameStoreyDz ?? STOREY_DZ_YD;
  const out: PathEngageHit[] = [];
  for (const h of hostiles) {
    if (!(h.detectionYd > 0)) continue;
    const c = closestOnPath(path, h);
    if (!c || c.dist > h.detectionYd) continue;
    if (!sameStorey(c.pt, h, dz)) continue;
    if (opts?.hasLos && !opts.hasLos(c.pt, h)) continue;
    out.push({
      guid: h.guid,
      pathYd: c.pathYd,
      distToPath: c.dist,
      closest: c.pt,
      detectionYd: h.detectionYd,
    });
  }
  out.sort((a, b) => a.pathYd - b.pathYd || a.guid - b.guid);
  return out;
}

export function firstPathEngage(hits: readonly PathEngageHit[]): PathEngageHit | null {
  return hits[0] ?? null;
}

// First point walking A→B where planar distance to H equals `openYd`. Null when the segment never enters
// that disc (or A is already inside — caller treats that as hold).
export function openPointOnSegment(
  a: PathPt,
  b: PathPt,
  h: PathPt,
  openYd: number,
): PathPt | null {
  if (!(openYd > 0)) return null;
  const d0 = Math.hypot(a.x - h.x, a.y - h.y);
  if (d0 <= openYd) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const fx = a.x - h.x;
  const fy = a.y - h.y;
  const aa = dx * dx + dy * dy;
  if (!(aa > 1e-12)) return null;
  const bb = 2 * (fx * dx + fy * dy);
  const cc = fx * fx + fy * fy - openYd * openYd;
  const disc = bb * bb - 4 * aa * cc;
  if (disc < 0) return null;
  const sqrt = Math.sqrt(disc);
  const t0 = (-bb - sqrt) / (2 * aa);
  const t1 = (-bb + sqrt) / (2 * aa);
  const t = t0 >= 0 && t0 <= 1 ? t0 : t1 >= 0 && t1 <= 1 ? t1 : -1;
  if (!(t >= 0 && t <= 1)) return null;
  const z = t < 0.5 ? a.z : b.z;
  return z != null && Number.isFinite(z)
    ? { x: a.x + dx * t, y: a.y + dy * t, z }
    : { x: a.x + dx * t, y: a.y + dy * t };
}

// Truncate `path` at the first point within `openYd` of `hostile`. Null when the start is already inside
// the disc (caller must not issue a zero-length walk).
export function cutPathAtOpen(
  path: readonly PathPt[],
  hostile: PathPt,
  openYd: number,
): { pts: PathPt[]; cutAt: number } | null {
  if (path.length === 0) return null;
  const start = path[0]!;
  if (Math.hypot(start.x - hostile.x, start.y - hostile.y) <= openYd) return null;
  const out: PathPt[] = [start.z != null ? { x: start.x, y: start.y, z: start.z } : { x: start.x, y: start.y }];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const hit = openPointOnSegment(a, b, hostile, openYd);
    if (hit) {
      out.push(hit);
      return { pts: out, cutAt: out.length };
    }
    out.push(b.z != null ? { x: b.x, y: b.y, z: b.z } : { x: b.x, y: b.y });
  }
  return null;
}

/** First vertex with LOS. Null if start already sees them, or the path never does. */
export function cutPathUntilLos(
  path: readonly PathPt[],
  hostile: PathPt,
  hasLos: (from: PathPt, to: PathPt) => boolean,
): { pts: PathPt[]; cutAt: number } | null {
  if (path.length === 0) return null;
  const start = path[0]!;
  const startPt: PathPt = start.z != null ? { x: start.x, y: start.y, z: start.z } : { x: start.x, y: start.y };
  if (hasLos(startPt, hostile)) return null;
  const out: PathPt[] = [startPt];
  for (let i = 1; i < path.length; i++) {
    const b = path[i]!;
    const pt: PathPt = b.z != null ? { x: b.x, y: b.y, z: b.z } : { x: b.x, y: b.y };
    out.push(pt);
    if (hasLos(pt, hostile)) return { pts: out, cutAt: out.length };
  }
  return null;
}

// On-path members of the first pack only. Off-path hostiles inside openYd of the party are not included —
// that is the side-room trap.
export function pathEngagePullGuids(
  hits: readonly PathEngageHit[],
  packOf: ReadonlyMap<number, string>,
): number[] {
  const first = hits[0];
  if (!first) return [];
  const packId = packOf.get(first.guid);
  if (!packId) return [first.guid];
  return hits.filter((h) => packOf.get(h.guid) === packId).map((h) => h.guid);
}
