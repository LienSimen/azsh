/**
 * Instance spatial hash — Recoil QuadField shape, 8 yd cells (one melee hop).
 * Cite: Recoil rts/Sim/Misc/QuadField.h; docs/perf/recoil-scale.md C3.
 *
 * getNear returns the occupants of every cell the circle overlaps (1–9 when
 * r ≤ cellYd). Callers apply the exact radius / storey / faction gates.
 * Out-array is pooled (3 slots, Recoil QueryVectorCache) unless the caller
 * passes `out` — a pooled result dies on the 4th pooled getNear.
 */

export const NEAR_CELL_YD = 8;
const POOL_SLOTS = 3;

export type NearItem<T> = {
  id: number;
  x: number;
  y: number;
  data: T;
};

type NearLoc<T> = { cx: number; cy: number; item: NearItem<T> };

export type NearGrid<T> = {
  cellYd: number;
  cells: Map<number, Map<number, NearItem<T>>>;
  byId: Map<number, NearLoc<T>>;
  lastCells: number;
  lastExamined: number;
};

const pools: unknown[][] = Array.from({ length: POOL_SLOTS }, () => []);
let poolCursor = 0;

function acquirePool<T>(): T[] {
  const slot = pools[poolCursor] as T[];
  poolCursor = (poolCursor + 1) % POOL_SLOTS;
  slot.length = 0;
  return slot;
}

/** Pack signed cell coords. Safe for |cx|,|cy| < 32768 (262 km at 8 yd). */
export function nearCellKey(cx: number, cy: number): number {
  return ((cx + 0x8000) << 16) | ((cy + 0x8000) & 0xffff);
}

export function createNearGrid<T>(cellYd = NEAR_CELL_YD): NearGrid<T> {
  return {
    cellYd: cellYd > 0 ? cellYd : NEAR_CELL_YD,
    cells: new Map(),
    byId: new Map(),
    lastCells: 0,
    lastExamined: 0,
  };
}

export function nearClear<T>(grid: NearGrid<T>): void {
  grid.cells.clear();
  grid.byId.clear();
  grid.lastCells = 0;
  grid.lastExamined = 0;
}

export function nearSize<T>(grid: NearGrid<T>): number {
  return grid.byId.size;
}

export function nearGet<T>(grid: NearGrid<T>, id: number): T | undefined {
  return grid.byId.get(id)?.item.data;
}

function cellOf(x: number, y: number, cellYd: number): { cx: number; cy: number } {
  return { cx: Math.floor(x / cellYd), cy: Math.floor(y / cellYd) };
}

function bucketOf<T>(grid: NearGrid<T>, cx: number, cy: number): Map<number, NearItem<T>> {
  const k = nearCellKey(cx, cy);
  let b = grid.cells.get(k);
  if (!b) {
    b = new Map();
    grid.cells.set(k, b);
  }
  return b;
}

function dropFromCell<T>(grid: NearGrid<T>, cx: number, cy: number, id: number): void {
  const k = nearCellKey(cx, cy);
  const b = grid.cells.get(k);
  if (!b) return;
  b.delete(id);
  if (b.size === 0) grid.cells.delete(k);
}

export function nearRemove<T>(grid: NearGrid<T>, id: number): boolean {
  const loc = grid.byId.get(id);
  if (!loc) return false;
  dropFromCell(grid, loc.cx, loc.cy, id);
  grid.byId.delete(id);
  return true;
}

export function nearInsert<T>(grid: NearGrid<T>, id: number, x: number, y: number, data: T): void {
  const existing = grid.byId.get(id);
  if (existing) {
    nearMove(grid, id, x, y, data);
    return;
  }
  const { cx, cy } = cellOf(x, y, grid.cellYd);
  const item: NearItem<T> = { id, x, y, data };
  bucketOf(grid, cx, cy).set(id, item);
  grid.byId.set(id, { cx, cy, item });
}

export function nearMove<T>(
  grid: NearGrid<T>,
  id: number,
  x: number,
  y: number,
  data?: T,
): void {
  const loc = grid.byId.get(id);
  if (!loc) {
    if (data !== undefined) nearInsert(grid, id, x, y, data);
    return;
  }
  loc.item.x = x;
  loc.item.y = y;
  if (data !== undefined) loc.item.data = data;
  const { cx, cy } = cellOf(x, y, grid.cellYd);
  if (cx === loc.cx && cy === loc.cy) return;
  dropFromCell(grid, loc.cx, loc.cy, id);
  loc.cx = cx;
  loc.cy = cy;
  bucketOf(grid, cx, cy).set(id, loc.item);
}

// Occupants of every cell the circle (x,y,r) overlaps. Does not clip to the circle — callers do the exact
// test.
export function getNear<T>(
  grid: NearGrid<T>,
  x: number,
  y: number,
  r: number,
  out?: T[],
): T[] {
  const dest = out ?? acquirePool<T>();
  dest.length = 0;
  const rad = r > 0 && Number.isFinite(r) ? r : 0;
  const cell = grid.cellYd;
  const minCx = Math.floor((x - rad) / cell);
  const maxCx = Math.floor((x + rad) / cell);
  const minCy = Math.floor((y - rad) / cell);
  const maxCy = Math.floor((y + rad) / cell);
  grid.lastCells = (maxCx - minCx + 1) * (maxCy - minCy + 1);
  let examined = 0;
  for (let cx = minCx; cx <= maxCx; cx++) {
    for (let cy = minCy; cy <= maxCy; cy++) {
      const b = grid.cells.get(nearCellKey(cx, cy));
      if (!b) continue;
      for (const item of b.values()) {
        dest.push(item.data);
        examined++;
      }
    }
  }
  grid.lastExamined = examined;
  return dest;
}
