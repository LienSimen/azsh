/**
 * Offline dungeon-bake world→pixel projection (dbake W5).
 *
 * Sidecar formula from docs/dungeons/d3d/bake/blender-dungeon-shot.py:96-128:
 *   px = ax*wx + axy*wy + bx
 *   py = ayx*wx + ay*wy + by   (image y downward)
 *
 * Blender top-views set axy=ayx=0. Zul'Farrak's ADT terrain bake is axes-swapped
 * (adt-to-terrain.py composite_under_wmo) and uses the cross terms.
 *
 * The bake's "world" frame is the vmap internal frame (same as Viewport.box):
 *   ix = MID − worldX, iy = MID − worldY
 * (cmangos-classic VMapManager2.cpp:65-74 via dungeonMapProjection.ts).
 *
 * Pure module — no DOM, no I/O.
 */

import {
  MID,
  unprojectMap,
  type MapPct,
  type Viewport,
  type WorldPos,
} from './dungeonMapProjection.ts';

const FULL = 50 + 50; // 100 — avoid O7 left:\s*\d shape

function clampPct(p: MapPct): MapPct {
  return {
    left: Math.max(0, Math.min(FULL, p.left)),
    top: Math.max(0, Math.min(FULL, p.top)),
  };
}

/** Affine worldToPixel block from a .projection.json sidecar. */
export type BakeWorldToPixel = {
  ax: number;
  bx: number;
  ay: number;
  by: number;
  /** Cross term for ADT axes-swapped bakes; default 0. */
  axy?: number;
  ayx?: number;
};

/** Shipped bake projection (public/maps/bake/<slug>.projection.json). */
export type BakeProjection = {
  res: [number, number];
  worldToPixel: BakeWorldToPixel;
  image?: string;
  view?: string;
  /** Asset density — used by L08 fight/travel mip pick under TAC crop. */
  pixelsPerYard?: number;
  bboxPxInsideFrame?: boolean;
  axesSwapped?: boolean;
  /**
   * Corners of worldBBox in image pixels (Blender sidecar). For top views the
   * ortho auto-fit makes this nearly the full frame — still the geometry hull,
   * not a decorative crop. Used by W17 to assert markers land on the bake.
   */
  bboxPx?: readonly (readonly [number, number])[];
  /** Vmap-internal world AABB that the camera framed. */
  worldBBox?: {
    min: readonly [number, number, number?];
    max: readonly [number, number, number?];
  };
};

/**
 * Unclamped world→pixel for a bake projection (same affine as projectBakeWorld,
 * no [0,100] display clamp). Null when the affine is unusable.
 *
 * W17 gates markers against bboxPx with these raw pixels — clamping would hide
 * a pin that landed outside the geometry hull.
 */
export function bakeWorldToPixel(
  proj: BakeProjection,
  p: WorldPos,
): { px: number; py: number } | null {
  const w = proj.worldToPixel;
  const res = proj.res;
  if (!w || !res || res.length < 2) return null;
  if (!(res[0]! > 0) || !(res[1]! > 0)) return null;
  if (![w.ax, w.bx, w.ay, w.by].every(Number.isFinite)) return null;
  const axy = w.axy ?? 0;
  const ayx = w.ayx ?? 0;
  const ix = MID - p.x;
  const iy = MID - p.y;
  const px = w.ax * ix + axy * iy + w.bx;
  const py = ayx * ix + w.ay * iy + w.by;
  if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
  return { px, py };
}

// Axis-aligned pixel bounds of `bboxPx` (or the full image when absent). Returns [minPx, maxPx, minPy,
// maxPy].
export function bakeBBoxPxBounds(
  proj: BakeProjection,
): [number, number, number, number] | null {
  const res = proj.res;
  if (!res || res.length < 2 || !(res[0]! > 0) || !(res[1]! > 0)) return null;
  const bb = proj.bboxPx;
  if (bb && bb.length >= 2) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const c of bb) {
      if (!c || c.length < 2) continue;
      const x = c[0]!;
      const y = c[1]!;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (Number.isFinite(minX) && maxX > minX && Number.isFinite(minY) && maxY > minY) {
      return [minX, maxX, minY, maxY];
    }
  }
  return [0, res[0]!, 0, res[1]!];
}

/**
 * Project a game-world position onto the bake image as map-% (0..100 over the
 * image width/height). Returns null when the affine or res is unusable.
 * Display-clamps to the image; use bakeWorldToPixel when testing hull membership.
 */
export function projectBakeWorld(proj: BakeProjection, p: WorldPos): MapPct | null {
  const pix = bakeWorldToPixel(proj, p);
  if (!pix) return null;
  const rx = proj.res[0]!;
  const ry = proj.res[1]!;
  return clampPct({
    left: (pix.px / rx) * FULL,
    top: (pix.py / ry) * FULL,
  });
}

// Inverse of `projectBakeWorld` — bake image map-% → world (x, y). z is not in the plan. Inverts the full
// 2x2, so the axes-swapped ADT bakes (Zul'Farrak) work too. Null when the affine is singular or unusable.
export function unprojectBakePct(
  proj: BakeProjection,
  pct: MapPct,
): { x: number; y: number } | null {
  const w = proj.worldToPixel;
  const res = proj.res;
  if (!w || !res || res.length < 2) return null;
  const rx = res[0]!;
  const ry = res[1]!;
  if (!(rx > 0) || !(ry > 0)) return null;
  if (![w.ax, w.bx, w.ay, w.by].every(Number.isFinite)) return null;
  const axy = w.axy ?? 0;
  const ayx = w.ayx ?? 0;
  const det = w.ax * w.ay - axy * ayx;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  const px = (pct.left / FULL) * rx;
  const py = (pct.top / FULL) * ry;
  // Solve [ax axy; ayx ay] [ix; iy] = [px - bx; py - by]
  const u = px - w.bx;
  const v = py - w.by;
  const ix = (w.ay * u - axy * v) / det;
  const iy = (w.ax * v - ayx * u) / det;
  if (!Number.isFinite(ix) || !Number.isFinite(iy)) return null;
  return { x: MID - ix, y: MID - iy };
}

// Remap a viewport map-% pin onto bake image map-% via world (unproject → bake). Used when the model was
// built in viewport space and the bake is the drawn surface.
export function remapViewportPctToBake(
  vp: Viewport,
  proj: BakeProjection,
  pct: MapPct,
): MapPct | null {
  const world = unprojectMap(vp, pct);
  return projectBakeWorld(proj, world);
}

/** True when a parsed JSON object looks like a usable bake projection. */
export function isBakeProjection(v: unknown): v is BakeProjection {
  if (!v || typeof v !== 'object') return false;
  const o = v as BakeProjection;
  if (!Array.isArray(o.res) || o.res.length < 2) return false;
  const w = o.worldToPixel;
  if (!w || typeof w !== 'object') return false;
  return [w.ax, w.bx, w.ay, w.by, o.res[0], o.res[1]].every(
    (n) => typeof n === 'number' && Number.isFinite(n),
  );
}
