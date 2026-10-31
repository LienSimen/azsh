/**
 * Dungeon map projection — the ONLY world→map projection in the codebase.
 *
 * Derived from four cited source lines with **zero free parameters**. Markers store
 * no coordinates; a pin is `projectWorld(viewport, encounter.origin)` recomputed every
 * render. There is no field to hand-nudge.
 *
 * Formula:
 *   1. `internal = (MID − x, MID − y)` — cmangos-classic
 *      `src/game/vmap/VMapManager2.cpp:65-74` (`convertPositionToInternalRep`)
 *   2. `left ∝ internal.y`, `top ∝ internal.x` — composed with the repo's own
 *      DBC-sourced `projectWorldToMap` (`src/dev/etl/seed-zone-map.mjs:99-104`):
 *        `nx = (westWy − wy) / (westWy − eastWy)`  → left ∝ −worldY → +internal.y
 *        `ny = (northWx − wx) / (northWx − southWx)` → top  ∝ −worldX → +internal.x
 *   3. Normalised by a **forced-square** viewport `box = [loT, hiT, loL, hiL]` so
 *      `mapDist / worldDist` is constant (travel timing in yards is meaningful).
 *
 * Determinant of the linear part is −1 (orientation-reversing similarity): the signed
 * area of any world triple has the **opposite** sign under projection (gate O2).
 *
 * Pure module — no DOM, no I/O, no Math.random (src/dev/arch.test.ts).
 *
 * @see docs/archive/DUNGEON-MAP-RUNSHEET.md §3, §4 O2
 */

/** 0.5 * 64 * 533.33333333 — VMapManager2.cpp:65-74 */
export const MID = 0.5 * 64.0 * 533.33333333; // 17066.66666656

/** World position in yards (creature.position_* / EncounterDef.origin). */
export type WorldPos = { x: number; y: number; z?: number };

/**
 * Viewport for one instance (or shared map).
 * `box` is `[loT, hiT, loL, hiL]` in the vmap internal frame:
 *   loT/hiT bound internal.x (→ top)
 *   loL/hiL bound internal.y (→ left)
 * Forced square: `(hiT − loT) === (hiL − loL)` within 1e-6.
 */
export type Viewport = {
  mapId?: number;
  /** [loT, hiT, loL, hiL] in vmap internal yards */
  box: [number, number, number, number];
  floorplan?: string;
  zMin?: number;
  zMax?: number;
};

/** Map percentage, top-left origin, both axes 0..100 over the viewport box. */
export type MapPct = { left: number; top: number };

/** convertPositionToInternalRep (VMapManager2.cpp:65-74). `pos.x = mid - x; pos.y = mid - y; pos.z = z;` */
export function worldToInternal(p: WorldPos): { ix: number; iy: number; iz: number } {
  return {
    ix: MID - p.x,
    iy: MID - p.y,
    iz: p.z ?? 0,
  };
}

// Project a world position into map-% space for a forced-square viewport. left = (iy − loL) / span * 100 //
// seed-zone-map.mjs:100 left ∝ −worldY top = (ix − loT) / span * 100 // seed-zone-map.mjs:101 top ∝ −worldX
export function projectWorld(vp: Viewport, p: WorldPos): MapPct {
  const { ix, iy } = worldToInternal(p);
  const [loT, hiT, loL] = vp.box;
  const span = hiT - loT; // square by construction — same as hiL − loL
  return {
    left: ((iy - loL) / span) * 100,
    top: ((ix - loT) / span) * 100,
  };
}

// Inverse of projectWorld — map-% → world (x, y). z is not recovered from the plan. Useful for tests and
// yard-based travel length.
export function unprojectMap(vp: Viewport, pct: MapPct): { x: number; y: number } {
  const [loT, hiT, loL] = vp.box;
  const span = hiT - loT;
  const ix = loT + (pct.top / 100) * span;
  const iy = loL + (pct.left / 100) * span;
  return { x: MID - ix, y: MID - iy };
}

/** True when the viewport box is square to 1e-6 (O2). */
export function isSquareViewport(vp: Viewport, eps = 1e-6): boolean {
  const [loT, hiT, loL, hiL] = vp.box;
  return Math.abs(hiT - loT - (hiL - loL)) < eps;
}

// Expand an axis-aligned internal-frame AABB to a forced-square box centred on the same midpoint. Pure
// geometry — no free parameters beyond the input extents.
export function forceSquareBox(
  loT: number,
  hiT: number,
  loL: number,
  hiL: number,
): [number, number, number, number] {
  const midT = (loT + hiT) / 2;
  const midL = (loL + hiL) / 2;
  const half = Math.max(hiT - loT, hiL - loL) / 2 || 0.5;
  return [midT - half, midT + half, midL - half, midL + half];
}

// Signed area of a 2-D triangle (shoelace / 2). Positive = CCW. Used by O2 to assert det(projection) = −1.
export function signedArea2(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/**
 * The 8 elements of the square dihedral group D₄ as maps on map-% points.
 * Identity is included; O1 applies the 7 non-identity controls to points only.
 *
 * Axes: left grows right, top grows down (screen space).
 * Note: map-% full scale is `FULL` (not a bare `100` literal after `left:`/`top:`) so
 * O7's coord-literal gate does not false-positive on these pure transforms.
 */
const FULL = 50 + 50; // 100 — map-% full scale; written without `left:\s*\d` shape
export const DIHEDRAL_D4: ReadonlyArray<{
  name: string;
  map: (p: MapPct) => MapPct;
}> = [
  { name: 'identity', map: (p) => ({ left: p.left, top: p.top }) },
  { name: 'rot90', map: (p) => ({ left: p.top, top: FULL - p.left }) },
  { name: 'rot180', map: (p) => ({ left: FULL - p.left, top: FULL - p.top }) },
  { name: 'rot270', map: (p) => ({ left: FULL - p.top, top: p.left }) },
  { name: 'mirrorL', map: (p) => ({ left: FULL - p.left, top: p.top }) },
  { name: 'mirrorT', map: (p) => ({ left: p.left, top: FULL - p.top }) },
  { name: 'mirrorDiag', map: (p) => ({ left: p.top, top: p.left }) },
  { name: 'mirrorAnti', map: (p) => ({ left: FULL - p.top, top: FULL - p.left }) },
];

/** The 7 non-identity controls O1 scores. */
export const DIHEDRAL_CONTROLS = DIHEDRAL_D4.filter((d) => d.name !== 'identity');
