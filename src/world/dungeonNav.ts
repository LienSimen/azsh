/**
 * Route pathfinding over the traced floorplan.
 *
 * W6 put every pin on its real world origin, which was the fix — but it left the gold
 * route polyline drawn corner-to-corner between consecutive encounters. With real
 * geometry, consecutive pulls are frequently across the dungeon from each other, so the
 * "route" became long diagonals through solid rock. It looked worse than the pre-W6
 * version precisely because the pins had become correct: the old polyline was tidy
 * because `assignRoutePathT` smeared 1,845 packs along a hand-drawn path.
 *
 * This module walks the route through the floor instead. It rasterises the SAME polygons
 * the map draws (`public/maps/floorplan/<mapId>-<slug>.json`, 0..1000 space) into a
 * per-band occupancy grid and runs A* over it, so the line provably follows the floor the
 * player is looking at — no second source, no new bake, nothing to keep in sync.
 *
 * BAND AWARENESS IS NOT OPTIONAL HERE. UBRS and Scholomance are ~37 %/39 % plan-view
 * stacked (runsheet D1), so a plan-view-only search happily routes along an upper storey's
 * corridor to reach a basement pull — which draws a line that *looks* right over drawn
 * floor while describing a walk nobody can take. Nodes are (band, x, y); a band change is
 * only legal where both bands are walkable at the same cell (a ramp or stairwell overlaps
 * in plan) and costs extra.
 *
 * Holes: each traced loop is filled independently and OR'd, so a pillar's inner ring
 * becomes walkable. That is deliberate — it is exactly what `scoreOnFloor` in
 * bake-dungeon-floorplans.mjs does, so the nav mask and O1's mask agree.
 *
 * Pure module — no DOM, no I/O. The floorplan document is passed in (the UI owns the
 * fetch), and the structural types are declared locally so `src/world/` keeps no edge
 * into `src/ui/`.
 *
 * @see docs/archive/DUNGEON-MAP-RUNSHEET.md §3, decision D1
 */

import type { MapPct } from './dungeonMapProjection.ts';

// Types (structural — traced floor loops / NavFloorDoc shape, no UI import)

export type NavFloorPath = {
  /** Mean world-z of the loop. */
  z?: number;
  /** Band index from the bake. */
  b?: number;
  /** Polygon points in 0..1000 space. */
  pts?: number[][];
  /** SVG path `d` in 0..1000 space (parsed when `pts` is absent). */
  d?: string;
};

export type NavFloorDoc = {
  paths: NavFloorPath[];
  nBands?: number;
};

export type NavGrid = {
  res: number;
  nBands: number;
  /** `band * res * res + y * res + x` → 1 when that band has floor there. */
  cells: Uint8Array;
  /** Union across bands (band-agnostic fallback + line-of-sight on flat maps). */
  any: Uint8Array;
  /** Mean world-z per band; NaN when the band traced nothing. */
  bandZ: number[];
  /**
   * 1 where a walkable cell has a non-walkable 8-neighbour on its own band — a wall-adjacent
   * cell. Adding a small cost for these makes the search prefer the MIDDLE of a corridor over
   * scraping along its edge. It is not cosmetic: the drawn line's corners sit at cell
   * positions, so an edge-hugging path puts corners on the floor boundary, where any
   * independent mask disagrees about whether they are inside.
   */
  nearWall: Uint8Array;
  /**
   * A finer mask of the same polygons, used ONLY for line-of-sight when smoothing.
   *
   * The search runs coarse on purpose (see NAV_RES: finer pinches corridors and strands
   * legs), but a coarse mask is a GENEROUS mask, so a coarse-legal hop can clip a wall the
   * drawn line then visibly crosses — and it can make A* detour around a corridor that is
   * actually open. Validating the final hops against a finer mask fixes both, without
   * giving up the coarse search's connectivity.
   */
  fine: { res: number; nBands: number; cells: Uint8Array };
  /** Reusable A* scratch (allocated once per grid, stamped per search). */
  scratch: {
    g: Float32Array;
    parent: Int32Array;
    gen: Int32Array;
    seq: number;
  };
};

/** One drawn segment of the route. `routed:false` means A* found no floor path. */
export type RouteLeg = {
  points: MapPct[];
  routed: boolean;
};

export type NavWaypoint = {
  pct: MapPct;
  /** World z when the encounter carries one — picks the storey. */
  z?: number;
};

/**
 * Nav resolution: 1000/160 = 6.25 units per cell.
 *
 * MEASURED, not picked. `docs/dmapfid/route-on-floor.mjs` sweeps it, scoring against an
 * independent mask at O1's res=256 (scoring on the nav grid itself rewards coarseness —
 * a bigger cell touching any floor reads walkable, and the straight-line null rises with
 * it, which is how a "better" number gets manufactured):
 *
 *   res  onFloor  routed  routedOnFloor   (null = 0.7927 at every res)
 *   128   0.9374  94.1 %     0.9681
 *   160   0.9387  93.2 %     0.9759      ← here
 *   192   0.9331  91.7 %     0.9830
 *   256   0.9223  87.3 %     0.9912
 *
 * (Swept before NEAR_WALL_COST landed; that lifted the shipped row to 0.9446 / 93.4 % /
 * 0.9850 without changing which resolution wins. Re-sweep with `--res N` if this changes.)
 *
 * Finer is worse on coverage, not better: the traced loops are already RDP-simplified at eps
 * 1.2 px of the bake's 384 raster, so a finer nav grid pinches thin corridors into
 * disconnected components and the leg falls back to a straight line. It buys a little
 * `routedOnFloor` (the legs it still routes hug the floor tighter) at the cost of routing
 * fewer of them, and a leg we decline to route is a leg the player gets no line for. 160
 * is where the combined `onFloor` peaks.
 */
export const NAV_RES = 160;

// Cost of stepping between bands at an overlapping cell. Higher than a diagonal so the search prefers
// staying on one storey when a same-storey walk exists.
const BAND_STEP_COST = 6;

// Extra cost for stepping onto a wall-adjacent cell (see NavGrid.nearWall). Small enough that it never
// changes which corridor is chosen — only where inside it the line runs.
const NEAR_WALL_COST = 0.4;

/** Search abort. A 192² × 8 grid is 294,912 nodes; a real leg explores a few thousand. */
const MAX_EXPANDED = 120_000;

/**
 * How far (in cells) an endpoint may be snapped onto floor before the leg is declared
 * UNROUTED. Kept tight on purpose, and it is a correctness knob rather than a cosmetic one:
 * the drawn leg starts and ends at the real pin, so a generous snap produces a leg that is
 * marked `routed` while its first and last segment run from an off-floor pin to wherever the
 * search found floor. At radius 6 that stub dragged Zul'Farrak's routed legs to 0.71 on-floor
 * while still calling them paths. See the sweep in docs/dmapfid/route-on-floor.json.
 */
const SNAP_RADIUS = 2;

const SQRT2 = Math.SQRT2;

// Rasterisation

function parsePathD(d: string): number[][] {
  const nums = d
    .replace(/[MLZmlz]/g, ' ')
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter(Number.isFinite);
  const pts: number[][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i]!, nums[i + 1]!]);
  return pts;
}

function polyOf(p: NavFloorPath): number[][] | null {
  if (p.pts && p.pts.length >= 3) return p.pts;
  if (p.d) {
    const parsed = parsePathD(p.d);
    return parsed.length >= 3 ? parsed : null;
  }
  return null;
}

// Even-odd scanline fill of one 0..1000 polygon into a res×res grid. Same algorithm as the bake's
// `scoreOnFloor.fillPoly`, so mask and oracle agree.
function fillPoly(grid: Uint8Array, res: number, poly: number[][]): void {
  const n = poly.length;
  if (n < 3) return;
  const sx: number[] = new Array(n);
  const sy: number[] = new Array(n);
  let minY = res;
  let maxY = 0;
  for (let i = 0; i < n; i++) {
    const x = idxOfUnit(poly[i]![0]!, res);
    const y = idxOfUnit(poly[i]![1]!, res);
    sx[i] = x;
    sy[i] = y;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  for (let y = minY; y <= maxY; y++) {
    const xs: number[] = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const y1 = sy[i]!;
      const y2 = sy[j]!;
      if (y1 === y2) continue;
      if ((y < y1 && y < y2) || (y >= y1 && y >= y2)) continue;
      const t = (y - y1) / (y2 - y1);
      xs.push(sx[i]! + t * (sx[j]! - sx[i]!));
    }
    xs.sort((a, b) => a - b);
    const row = y * res;
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.max(0, Math.ceil(xs[k]!));
      const b = Math.min(res - 1, Math.floor(xs[k + 1]!));
      for (let x = a; x <= b; x++) grid[row + x] = 1;
    }
    // A polygon thinner than one scanline contributes no span pair above; stamp its
    // vertices so a 1-cell corridor never vanishes from the nav mask entirely.
    if (xs.length < 2) {
      for (let i = 0; i < n; i++) if (sy[i] === y) grid[row + sx[i]!] = 1;
    }
  }
}

/** Per-band occupancy at one resolution. */
function rasterise(
  paths: readonly NavFloorPath[],
  nBands: number,
  res: number,
): Uint8Array {
  const plane = res * res;
  const cells = new Uint8Array(plane * nBands);
  for (const p of paths) {
    const poly = polyOf(p);
    if (!poly) continue;
    const b = Number.isFinite(p.b) ? Math.max(0, Math.min(nBands - 1, p.b as number)) : 0;
    fillPoly(cells.subarray(b * plane, (b + 1) * plane), res, poly);
  }
  return cells;
}

/** Line-of-sight resolution for hop validation — 2× the search grid. */
const FINE_RES_FACTOR = 2;

/** Rasterise a floorplan document into a per-band occupancy grid. */
export function buildNavGrid(doc: NavFloorDoc, res: number = NAV_RES): NavGrid {
  const paths = doc.paths ?? [];
  let maxBand = 0;
  for (const p of paths) {
    const b = Number.isFinite(p.b) ? (p.b as number) : 0;
    if (b > maxBand) maxBand = b;
  }
  const nBands = Math.max(1, Math.min(64, maxBand + 1));
  const plane = res * res;
  const cells = rasterise(paths, nBands, res);
  const any = new Uint8Array(plane);
  const zSum = new Float64Array(nBands);
  const zCount = new Int32Array(nBands);

  for (const p of paths) {
    const b = Number.isFinite(p.b) ? Math.max(0, Math.min(nBands - 1, p.b as number)) : 0;
    if (Number.isFinite(p.z)) {
      zSum[b]! += p.z as number;
      zCount[b]! += 1;
    }
  }
  for (let b = 0; b < nBands; b++) {
    const off = b * plane;
    for (let i = 0; i < plane; i++) if (cells[off + i]) any[i] = 1;
  }
  const bandZ: number[] = [];
  for (let b = 0; b < nBands; b++) {
    bandZ.push(zCount[b] ? zSum[b]! / zCount[b]! : Number.NaN);
  }

  // Wall adjacency, per band.
  const nearWall = new Uint8Array(cells.length);
  for (let b = 0; b < nBands; b++) {
    const off = b * plane;
    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const i = off + y * res + x;
        if (!cells[i]) continue;
        let edge = 0;
        for (let dy = -1; dy <= 1 && !edge; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= res || ny >= res || !cells[off + ny * res + nx]) {
              edge = 1;
              break;
            }
          }
        }
        nearWall[i] = edge;
      }
    }
  }

  const fineRes = res * FINE_RES_FACTOR;
  return {
    res,
    nBands,
    cells,
    any,
    bandZ,
    nearWall,
    fine: { res: fineRes, nBands, cells: rasterise(paths, nBands, fineRes) },
    scratch: {
      g: new Float32Array(plane * nBands),
      parent: new Int32Array(plane * nBands),
      gen: new Int32Array(plane * nBands),
      seq: 0,
    },
  };
}

// Cell helpers

/**
 * ONE lattice convention, and it is the bake's.
 *
 * `traceGrid` in bake-dungeon-floorplans.mjs emits 0..1000 from a res×res raster by dividing
 * by `res - 1`, and `scoreOnFloor` inverts it with `round(u / 1000 * (res - 1))`. So a nav
 * cell is a LATTICE POINT, not a box: index i sits at 1000·i/(res−1). Mixing that with a
 * cell-box mapping (`floor(u / 1000 * res)`) shifts the mask against the points by up to a
 * cell, which is how the synthetic corner-seam case leaked a diagonal between two rooms that
 * only touch at a corner.
 */
function idxOfUnit(u: number, res: number): number {
  return Math.max(0, Math.min(res - 1, Math.round((u / 1000) * (res - 1))));
}

/** Map% → nav lattice cell (clamped). */
export function cellOfPct(grid: NavGrid, p: MapPct): { x: number; y: number } {
  return {
    x: idxOfUnit(p.left * 10, grid.res),
    y: idxOfUnit(p.top * 10, grid.res),
  };
}

/** Nav lattice cell → map%. */
function pctOfCell(grid: NavGrid, x: number, y: number): MapPct {
  const d = grid.res - 1 || 1;
  return {
    left: (x / d) * 100,
    top: (y / d) * 100,
  };
}

function walkable(grid: NavGrid, band: number, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= grid.res || y >= grid.res) return false;
  return grid.cells[band * grid.res * grid.res + y * grid.res + x] === 1;
}

// Band whose mean z is nearest the waypoint's world z. Falls back to the band that is actually walkable
// near the point, then to band 0.
function preferredBand(grid: NavGrid, wp: NavWaypoint): number {
  if (grid.nBands === 1) return 0;
  if (Number.isFinite(wp.z)) {
    let best = -1;
    let bestD = Infinity;
    for (let b = 0; b < grid.nBands; b++) {
      const bz = grid.bandZ[b]!;
      if (!Number.isFinite(bz)) continue;
      const d = Math.abs(bz - (wp.z as number));
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    if (best >= 0) return best;
  }
  return 0;
}

/**
 * Nearest walkable cell to `p`, searched outward by radius. Returns the preferred band
 * when it has floor within `SNAP_RADIUS`, otherwise the closest cell on ANY band — a
 * pack standing 2 cells off its own storey's traced edge (Deadmines' 0.897 coverage is
 * exactly this) still gets routed rather than silently dropped.
 */
export function snapToFloor(
  grid: NavGrid,
  wp: NavWaypoint,
  radius: number = SNAP_RADIUS,
): { band: number; x: number; y: number } | null {
  const c = cellOfPct(grid, wp.pct);
  const pref = preferredBand(grid, wp);
  const bandOrder: number[] = [pref];
  for (let b = 0; b < grid.nBands; b++) if (b !== pref) bandOrder.push(b);

  for (let r = 0; r <= radius; r++) {
    for (const band of bandOrder) {
      // Ring scan at Chebyshev radius r.
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (walkable(grid, band, c.x + dx, c.y + dy)) {
            return { band, x: c.x + dx, y: c.y + dy };
          }
        }
      }
    }
  }
  return null;
}

// A*

/** Binary min-heap over node ids keyed by f-score. */
class Heap {
  private ids: number[] = [];
  private fs: number[] = [];

  get size(): number {
    return this.ids.length;
  }

  push(id: number, f: number): void {
    this.ids.push(id);
    this.fs.push(f);
    let i = this.ids.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.fs[p]! <= this.fs[i]!) break;
      this.swap(i, p);
      i = p;
    }
  }

  pop(): number {
    const top = this.ids[0]!;
    const lastId = this.ids.pop()!;
    const lastF = this.fs.pop()!;
    if (this.ids.length) {
      this.ids[0] = lastId;
      this.fs[0] = lastF;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.ids.length && this.fs[l]! < this.fs[m]!) m = l;
        if (r < this.ids.length && this.fs[r]! < this.fs[m]!) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    const ti = this.ids[a]!;
    this.ids[a] = this.ids[b]!;
    this.ids[b] = ti;
    const tf = this.fs[a]!;
    this.fs[a] = this.fs[b]!;
    this.fs[b] = tf;
  }
}

const DIRS: readonly (readonly [number, number, number])[] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
];

function octile(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
}

export type NavCell = { band: number; x: number; y: number };

/**
 * Single-source Dijkstra over the nav grid. Returns g-score (path cost) for every
 * reachable walkable cell from `from`, or null when `from` is not walkable.
 *
 * Used by geometric route ordering to rank many candidate packs without running A*
 * once per candidate (n×A* is too heavy at enter). Stops early once every `stopAt`
 * cell id has been settled, when provided.
 */
export function dijkstraCosts(
  grid: NavGrid,
  from: NavCell,
  stopAt?: ReadonlySet<number>,
): Float32Array | null {
  const { res, nBands, cells, scratch, nearWall } = grid;
  const plane = res * res;
  const idOf = (b: number, x: number, y: number): number => b * plane + y * res + x;
  const startId = idOf(from.band, from.x, from.y);
  if (!cells[startId]) return null;

  const gen = ++scratch.seq;
  const { g, parent, gen: seen } = scratch;
  // parent[] is reused as a "settled this generation" stamp (negated gen) so a
  // lazy-heap re-pop of a stale entry does not re-expand or early-exit stopAt.
  const open = new Heap();
  g[startId] = 0;
  parent[startId] = -1;
  seen[startId] = gen;
  open.push(startId, 0);

  const pending = stopAt ? new Set(stopAt) : null;
  if (pending) pending.delete(startId);

  let expanded = 0;
  while (open.size) {
    const cur = open.pop();
    // Already settled with best g — skip stale heap entries.
    if (seen[cur] === gen && parent[cur] === -2) continue;
    if (seen[cur] === gen) parent[cur] = -2; // mark settled
    if (pending) {
      pending.delete(cur);
      if (pending.size === 0) break;
    }
    if (++expanded > MAX_EXPANDED) break;
    const b = Math.floor(cur / plane);
    const rem = cur - b * plane;
    const y = Math.floor(rem / res);
    const x = rem - y * res;
    const gc = g[cur]!;

    for (const [dx, dy, w] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= res || ny >= res) continue;
      const nid = idOf(b, nx, ny);
      if (!cells[nid]) continue;
      if (dx !== 0 && dy !== 0) {
        if (!cells[idOf(b, x + dx, y)] || !cells[idOf(b, x, y + dy)]) continue;
      }
      const ng = gc + w + (nearWall[nid] ? NEAR_WALL_COST : 0);
      if (seen[nid] === gen && ng >= g[nid]!) continue;
      // Do not reopen a settled node (uniform non-negative weights).
      if (seen[nid] === gen && parent[nid] === -2) continue;
      seen[nid] = gen;
      g[nid] = ng;
      parent[nid] = cur;
      open.push(nid, ng);
    }

    if (nBands > 1) {
      for (let ob = 0; ob < nBands; ob++) {
        if (ob === b) continue;
        const nid = idOf(ob, x, y);
        if (!cells[nid]) continue;
        const ng = gc + BAND_STEP_COST;
        if (seen[nid] === gen && ng >= g[nid]!) continue;
        if (seen[nid] === gen && parent[nid] === -2) continue;
        seen[nid] = gen;
        g[nid] = ng;
        parent[nid] = cur;
        open.push(nid, ng);
      }
    }
  }

  // Materialise costs: only cells visited this generation are finite.
  const out = new Float32Array(plane * nBands);
  out.fill(Number.POSITIVE_INFINITY);
  for (let i = 0; i < out.length; i++) {
    if (seen[i] === gen) out[i] = g[i]!;
  }
  return out;
}

// Nav-graph path cost between two waypoints (cell units), or null when either end cannot snap to floor or
// the components are disconnected.
export function navPathCost(
  grid: NavGrid,
  a: NavWaypoint,
  b: NavWaypoint,
): number | null {
  const sa = snapToFloor(grid, a);
  const sb = snapToFloor(grid, b);
  if (!sa || !sb) return null;
  if (sa.band === sb.band && sa.x === sb.x && sa.y === sb.y) return 0;
  const costs = dijkstraCosts(
    grid,
    sa,
    new Set([sb.band * grid.res * grid.res + sb.y * grid.res + sb.x]),
  );
  if (!costs) return null;
  const goalId = sb.band * grid.res * grid.res + sb.y * grid.res + sb.x;
  const c = costs[goalId]!;
  return Number.isFinite(c) ? c : null;
}

// A* from `from` to `to` over (band, x, y). Returns the cell chain inclusive of both endpoints, or null
// when the two cells are in disconnected floor components.
export function findCellPath(grid: NavGrid, from: NavCell, to: NavCell): NavCell[] | null {
  const { res, nBands, cells, scratch } = grid;
  const plane = res * res;
  const idOf = (b: number, x: number, y: number): number => b * plane + y * res + x;
  const startId = idOf(from.band, from.x, from.y);
  const goalId = idOf(to.band, to.x, to.y);
  if (!cells[startId] || !cells[goalId]) return null;
  if (startId === goalId) return [{ ...from }];

  const gen = ++scratch.seq;
  const { g, parent, gen: seen } = scratch;
  const { nearWall } = grid;
  const open = new Heap();
  g[startId] = 0;
  parent[startId] = -1;
  seen[startId] = gen;
  open.push(startId, octile(from.x, from.y, to.x, to.y));

  let expanded = 0;
  while (open.size) {
    const cur = open.pop();
    if (cur === goalId) break;
    if (++expanded > MAX_EXPANDED) return null;
    const b = Math.floor(cur / plane);
    const rem = cur - b * plane;
    const y = Math.floor(rem / res);
    const x = rem - y * res;
    const gc = g[cur]!;

    for (const [dx, dy, w] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= res || ny >= res) continue;
      const nid = idOf(b, nx, ny);
      if (!cells[nid]) continue;
      // No corner-cutting: a diagonal needs both orthogonal neighbours open, else the
      // line is drawn slipping through the seam between two rooms.
      if (dx !== 0 && dy !== 0) {
        if (!cells[idOf(b, x + dx, y)] || !cells[idOf(b, x, y + dy)]) continue;
      }
      const ng = gc + w + (nearWall[nid] ? NEAR_WALL_COST : 0);
      if (seen[nid] === gen && ng >= g[nid]!) continue;
      seen[nid] = gen;
      g[nid] = ng;
      parent[nid] = cur;
      open.push(nid, ng + octile(nx, ny, to.x, to.y));
    }

    // Storey change: only where the other band has floor at this very cell.
    if (nBands > 1) {
      for (let ob = 0; ob < nBands; ob++) {
        if (ob === b) continue;
        const nid = idOf(ob, x, y);
        if (!cells[nid]) continue;
        const ng = gc + BAND_STEP_COST;
        if (seen[nid] === gen && ng >= g[nid]!) continue;
        seen[nid] = gen;
        g[nid] = ng;
        parent[nid] = cur;
        open.push(nid, ng + octile(x, y, to.x, to.y));
      }
    }
  }

  if (seen[goalId] !== gen) return null;
  const out: NavCell[] = [];
  let cur = goalId;
  while (cur !== -1) {
    const b = Math.floor(cur / plane);
    const rem = cur - b * plane;
    const y = Math.floor(rem / res);
    out.push({ band: b, x: rem - y * res, y });
    cur = parent[cur]!;
  }
  out.reverse();
  return out;
}

/**
 * Straight walk from `a` to `b` stays on `band`, checked on the SEARCH grid.
 *
 * Sampled at half-cell steps rather than Bresenham-stepped: the seam case (a diagonal
 * slipping between two rooms that touch at one corner) is what a naive Bresenham misses,
 * and it is the failure that draws a line through a wall.
 */
export function lineOfSight(grid: NavGrid, band: number, a: NavCell, b: NavCell): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) * 2));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    if (!walkable(grid, band, Math.round(a.x + dx * t), Math.round(a.y + dy * t))) return false;
  }
  return true;
}

/** The same test on the fine mask, in map% — what the DRAWN line is validated against. */
export function lineOfSightPct(grid: NavGrid, band: number, a: MapPct, b: MapPct): boolean {
  const m = grid.fine;
  if (band < 0 || band >= m.nBands) return false;
  const off = band * m.res * m.res;
  const ax = idxOfUnit(a.left * 10, m.res);
  const ay = idxOfUnit(a.top * 10, m.res);
  const bx = idxOfUnit(b.left * 10, m.res);
  const by = idxOfUnit(b.top * 10, m.res);
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const x = Math.round(ax + (bx - ax) * t);
    const y = Math.round(ay + (by - ay) * t);
    if (x < 0 || y < 0 || x >= m.res || y >= m.res) return false;
    if (!m.cells[off + y * m.res + x]) return false;
  }
  return true;
}

/**
 * Aggro line-of-sight over the baked floorplan: same z-band and clear fine-mask walk.
 *
 * Classic aggro is radius **and** LoS — a mob through a wall or on another storey
 * must not join. Uses the same rasterised polylines as route A* (no second geometry).
 *
 * Cite: cmangos-classic `UnitAI.cpp` `DetectOrAttack` ~530–536
 *   `GetAttackDistance` then `IsWithinLOSInMap(who, true)`;
 *   `CheckForHelp` ~518 `IsWithinDistInMap` + `IsWithinLOSInMap`.
 *
 * Cost: O(cell samples along the segment) on the fine mask (2×NAV_RES) — no per-path
 * segment sweep. A dense Stratholme pull (~200 candidates) is a few thousand cell
 * lookups; measured under 1 ms on a hot path in the population gate.
 */
export function aggroHasLineOfSight(
  grid: NavGrid,
  a: NavWaypoint,
  b: NavWaypoint,
): boolean {
  const sa = snapToFloor(grid, a);
  const sb = snapToFloor(grid, b);
  if (!sa || !sb) return false;
  // Different storeys (no connection modelled as same-band LoS) — reject.
  if (sa.band !== sb.band) return false;
  return lineOfSightPct(grid, sa.band, a.pct, b.pct);
}

/**
 * String-pull: drop intermediate cells the line can see past. Turns the 8-connected
 * staircase into the few real corners a player would walk. A band change always survives
 * as a corner — that cell is the ramp.
 *
 * `los` defaults to the search grid; `legBetween` passes the fine-mask test instead so the
 * hops that survive are legal at twice the search resolution.
 */
export function stringPull(
  grid: NavGrid,
  path: NavCell[],
  los: (band: number, a: NavCell, b: NavCell) => boolean = (band, a, b) =>
    lineOfSight(grid, band, a, b),
): NavCell[] {
  if (path.length <= 2) return path.slice();
  const out: NavCell[] = [path[0]!];
  let i = 0;
  while (i < path.length - 1) {
    let best = i + 1;
    for (let j = i + 2; j < path.length; j++) {
      if (path[j]!.band !== path[i]!.band) break;
      if (!los(path[i]!.band, path[i]!, path[j]!)) break;
      best = j;
    }
    out.push(path[best]!);
    i = best;
  }
  return out;
}

// Route legs

// One routed leg between two waypoints. Unrouted legs keep the two endpoints for measurement/caption but
// set `routed:false`. The map view must NOT draw them as a full chord through walls (see routeLegsSvg).
export function legBetween(grid: NavGrid, a: NavWaypoint, b: NavWaypoint): RouteLeg {
  const sa = snapToFloor(grid, a);
  const sb = snapToFloor(grid, b);
  const unrouted: RouteLeg = { points: [a.pct, b.pct], routed: false };
  if (!sa || !sb) return unrouted;

  // Already walkable in a straight line at fine resolution? Then that IS the path, and A*
  // must not be allowed to invent a detour around a corridor the coarse mask pinched shut.
  if (sa.band === sb.band && lineOfSightPct(grid, sa.band, a.pct, b.pct)) {
    return { points: [a.pct, b.pct], routed: true };
  }

  const cells = findCellPath(grid, sa, sb);
  if (!cells || cells.length < 2) return unrouted;
  const pulled = stringPull(grid, cells, (band, p, q) =>
    lineOfSightPct(grid, band, pctOfCell(grid, p.x, p.y), pctOfCell(grid, q.x, q.y)),
  );
  // Keep the real endpoints so the line still touches the pin, not the snapped cell.
  const points: MapPct[] = [a.pct];
  for (let i = 1; i < pulled.length - 1; i++) {
    points.push(pctOfCell(grid, pulled[i]!.x, pulled[i]!.y));
  }
  points.push(b.pct);
  return { points, routed: true };
}

/** Instance-id → nav grid registry (primed when floorplan loads; pure, no I/O). */
const instanceNav = new Map<string, NavGrid>();

/** Map-id → nav grid (aggro LoS for spatial pulls when instance id is unknown). */
const mapNav = new Map<number, NavGrid>();

/** Register a nav grid for geometric route ordering at enter / reorder time. */
export function registerInstanceNav(instanceId: string, grid: NavGrid, mapId?: number): void {
  instanceNav.set(instanceId, grid);
  if (mapId != null) mapNav.set(mapId, grid);
}

/** Register a nav grid keyed by Classic map id (spatial pull LoS). */
export function registerMapNav(mapId: number, grid: NavGrid): void {
  mapNav.set(mapId, grid);
}

/** Drop one or all registered instance nav grids (tests). */
export function clearInstanceNav(instanceId?: string): void {
  if (instanceId == null) instanceNav.clear();
  else instanceNav.delete(instanceId);
}

/** Drop one or all map-id nav grids (tests). */
export function clearMapNav(mapId?: number): void {
  if (mapId == null) mapNav.clear();
  else mapNav.delete(mapId);
}

/** Registered nav grid for an instance, if primed. */
export function instanceNavGrid(instanceId: string): NavGrid | null {
  return instanceNav.get(instanceId) ?? null;
}

/** Registered nav grid for a Classic map id (aggro LoS). */
export function mapNavGrid(mapId: number): NavGrid | null {
  return mapNav.get(mapId) ?? null;
}

// Build the drawn route: one leg per consecutive waypoint pair (entrance first). Legs are cached per grid +
// endpoint cells, so a repaint costs nothing.
export function routeLegs(grid: NavGrid, waypoints: readonly NavWaypoint[]): RouteLeg[] {
  const out: RouteLeg[] = [];
  const cache = legCacheFor(grid);
  for (let i = 0; i + 1 < waypoints.length; i++) {
    const a = waypoints[i]!;
    const b = waypoints[i + 1]!;
    const ca = cellOfPct(grid, a.pct);
    const cb = cellOfPct(grid, b.pct);
    const key = `${ca.x},${ca.y},${a.z ?? ''}>${cb.x},${cb.y},${b.z ?? ''}`;
    let leg = cache.get(key);
    if (!leg) {
      leg = legBetween(grid, a, b);
      cache.set(key, leg);
    }
    out.push(leg);
  }
  return out;
}

const legCaches = new WeakMap<NavGrid, Map<string, RouteLeg>>();
function legCacheFor(grid: NavGrid): Map<string, RouteLeg> {
  let m = legCaches.get(grid);
  if (!m) {
    m = new Map();
    legCaches.set(grid, m);
  }
  return m;
}

const gridCaches = new WeakMap<NavFloorDoc, NavGrid>();

/** Memoised nav grid for a floorplan document (one rasterisation per document). */
export function navGridFor(doc: NavFloorDoc | null | undefined, res: number = NAV_RES): NavGrid | null {
  if (!doc || !Array.isArray(doc.paths) || !doc.paths.length) return null;
  const hit = gridCaches.get(doc);
  if (hit && hit.res === res) return hit;
  const grid = buildNavGrid(doc, res);
  gridCaches.set(doc, grid);
  return grid;
}

/**
 * Fraction of a polyline's length that lies on floor — the oracle O13 scores.
 * Samples every `stepPct` of map% along each segment (band-agnostic on purpose: the
 * question this answers is "does the drawn line sit on drawn floor").
 */
export function polylineOnFloor(
  grid: NavGrid,
  points: readonly MapPct[],
  stepPct = 0.25,
): { on: number; total: number } {
  let on = 0;
  let total = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const dist = Math.hypot(b.left - a.left, b.top - a.top);
    const n = Math.max(1, Math.ceil(dist / stepPct));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const p = { left: a.left + (b.left - a.left) * t, top: a.top + (b.top - a.top) * t };
      const c = cellOfPct(grid, p);
      total++;
      if (grid.any[c.y * grid.res + c.x]) on++;
    }
  }
  return { on, total };
}
