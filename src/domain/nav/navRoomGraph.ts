// Room graph for navmesh HAPFS: WMO rooms as the coarse band, mesh A* only room-to-portal. Rooms
// come from dungeon-rooms.json, never nearest-snapped. Gap components stay walkable.
import dungeonRoomsJson from '../../data/dungeons/dungeon-rooms.json' with { type: 'json' };
import type { NavMesh } from './navmesh.ts';

type RoomRow = {
  id: string;
  name: string;
  bbox: { min: number[]; max: number[] };
};

export type RoomPortal = {
  to: number;
  polyA: number;
  polyB: number;
};

export type RoomGraph = {
  mapId: number;
  names: readonly string[];
  ids: readonly string[];
  /** 1 = hallway component, not a named WMO room. */
  synthetic: Uint8Array;
  namedCount: number;
  /** poly → room index. */
  polyRoom: Int16Array;
  adj: readonly (readonly { to: number; cost: number }[])[];
  portals: readonly (readonly RoomPortal[])[];
  cx: Float64Array;
  cy: Float64Array;
  cz: Float64Array;
  /** Named-room AABBs only; gap rooms have empty min/max. */
  bboxMin: Float64Array;
  bboxMax: Float64Array;
};

/** Matches dungeonWingRooms inBox z-pad — doorway polys sit on the AABB face. */
const BOX_PAD_YD = 2;

const cache = new Map<number, RoomGraph | null>();

export function clearRoomGraphCache(mapId?: number): void {
  if (mapId == null) cache.clear();
  else cache.delete(mapId | 0);
}

function roomsForMap(mapId: number): readonly RoomRow[] {
  const file = dungeonRoomsJson as {
    maps?: Record<string, { rooms?: RoomRow[] }>;
  };
  return file.maps?.[String(mapId)]?.rooms ?? [];
}

function volumeOf(r: RoomRow): number {
  const [x0, y0, z0] = r.bbox.min;
  const [x1, y1, z1] = r.bbox.max;
  const v = (x1! - x0!) * (y1! - y0!) * (z1! - z0!);
  return v > 0 ? v : Infinity;
}

function contains(r: RoomRow, x: number, y: number, z: number): boolean {
  const p = BOX_PAD_YD;
  return x >= r.bbox.min[0]! - p && x <= r.bbox.max[0]! + p
    && y >= r.bbox.min[1]! - p && y <= r.bbox.max[1]! + p
    && z >= r.bbox.min[2]! - p && z <= r.bbox.max[2]! + p;
}

function dist3(dx: number, dy: number, dz: number): number {
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function forEachNeighbor(m: NavMesh, p: number, fn: (nb: number) => void): void {
  for (let i = m.polyStart[p]!; i < m.polyStart[p + 1]!; i++) {
    const nb = m.cornerNei[i]!;
    if (nb >= 0) fn(nb);
  }
  for (let l = m.linkStart[p]!; l < m.linkStart[p + 1]!; l++) {
    const nb = m.linkTo[l]!;
    if (nb >= 0) fn(nb);
  }
}

function assignNamed(m: NavMesh, rooms: readonly RoomRow[], polyRoom: Int16Array): void {
  for (let p = 0; p < m.polyCount; p++) {
    const x = m.polyCenter[p * 3]!;
    const y = m.polyCenter[p * 3 + 1]!;
    const z = m.polyCenter[p * 3 + 2]!;
    let best = -1;
    let bestV = Infinity;
    for (let i = 0; i < rooms.length; i++) {
      const r = rooms[i]!;
      if (!contains(r, x, y, z)) continue;
      const v = volumeOf(r);
      if (v < bestV || (v === bestV && i < best)) {
        bestV = v;
        best = i;
      }
    }
    polyRoom[p] = best;
  }
}

function floodGaps(
  m: NavMesh,
  polyRoom: Int16Array,
  names: string[],
  ids: string[],
  synthetic: number[],
  namedCount: number,
): void {
  const stack: number[] = [];
  for (let p = 0; p < m.polyCount; p++) {
    if (polyRoom[p] !== -1) continue;
    const id = names.length;
    const gapI = id - namedCount;
    names.push(`gap/${gapI}`);
    ids.push(`gap/${m.mapId}/${gapI}`);
    synthetic.push(1);
    stack.length = 0;
    stack.push(p);
    polyRoom[p] = id;
    while (stack.length) {
      const cur = stack.pop()!;
      forEachNeighbor(m, cur, (nb) => {
        if (polyRoom[nb] === -1) {
          polyRoom[nb] = id;
          stack.push(nb);
        }
      });
    }
  }
}

function buildRoomGraph(m: NavMesh): RoomGraph | null {
  const named = roomsForMap(m.mapId);
  if (named.length < 2) return null;

  const names = named.map((r) => r.name.trim() || r.id);
  const ids = named.map((r) => r.id);
  const syntheticFlags = named.map(() => 0);
  const polyRoom = new Int16Array(m.polyCount);
  assignNamed(m, named, polyRoom);
  floodGaps(m, polyRoom, names, ids, syntheticFlags, named.length);

  const n = names.length;
  const synthetic = Uint8Array.from(syntheticFlags);
  const bboxMin = new Float64Array(n * 3);
  const bboxMax = new Float64Array(n * 3);
  for (let i = 0; i < named.length; i++) {
    const b = named[i]!.bbox;
    bboxMin[i * 3] = b.min[0]!;
    bboxMin[i * 3 + 1] = b.min[1]!;
    bboxMin[i * 3 + 2] = b.min[2]!;
    bboxMax[i * 3] = b.max[0]!;
    bboxMax[i * 3 + 1] = b.max[1]!;
    bboxMax[i * 3 + 2] = b.max[2]!;
  }
  const cx = new Float64Array(n);
  const cy = new Float64Array(n);
  const cz = new Float64Array(n);
  const counts = new Uint32Array(n);
  for (let p = 0; p < m.polyCount; p++) {
    const r = polyRoom[p]!;
    if (r < 0) continue;
    cx[r] += m.polyCenter[p * 3]!;
    cy[r] += m.polyCenter[p * 3 + 1]!;
    cz[r] += m.polyCenter[p * 3 + 2]!;
    counts[r]!++;
  }
  for (let i = 0; i < n; i++) {
    const c = counts[i]!;
    if (c === 0) continue;
    cx[i]! /= c;
    cy[i]! /= c;
    cz[i]! /= c;
  }

  const inBoxAt = (room: number, x: number, y: number, z: number): boolean => {
    if (synthetic[room]) return false;
    const p = BOX_PAD_YD;
    const o = room * 3;
    return x >= bboxMin[o]! - p && x <= bboxMax[o]! + p
      && y >= bboxMin[o + 1]! - p && y <= bboxMax[o + 1]! + p
      && z >= bboxMin[o + 2]! - p && z <= bboxMax[o + 2]! + p;
  };
  /** Overlapping AABBs share interior polys — that is not a doorway. */
  const overlapPortal = (a: number, b: number, p: number, nb: number): boolean => {
    if (synthetic[a] || synthetic[b]) return false;
    const ax = m.polyCenter[p * 3]!, ay = m.polyCenter[p * 3 + 1]!, az = m.polyCenter[p * 3 + 2]!;
    const bx = m.polyCenter[nb * 3]!, by = m.polyCenter[nb * 3 + 1]!, bz = m.polyCenter[nb * 3 + 2]!;
    return inBoxAt(a, bx, by, bz) && inBoxAt(b, ax, ay, az);
  };

  const portals: RoomPortal[][] = Array.from({ length: n }, () => []);
  const minCost: Map<number, number>[] = Array.from({ length: n }, () => new Map());
  for (let p = 0; p < m.polyCount; p++) {
    const rp = polyRoom[p]!;
    if (rp < 0) continue;
    forEachNeighbor(m, p, (nb) => {
      const rn = polyRoom[nb]!;
      if (rn < 0 || rn === rp) return;
      if (overlapPortal(rp, rn, p, nb)) return;
      portals[rp]!.push({ to: rn, polyA: p, polyB: nb });
      const cost = dist3(cx[rp]! - cx[rn]!, cy[rp]! - cy[rn]!, cz[rp]! - cz[rn]!);
      const use = cost > 0 ? cost : 1;
      const prev = minCost[rp]!.get(rn);
      if (prev == null || use < prev) minCost[rp]!.set(rn, use);
    });
  }

  const adj: { to: number; cost: number }[][] = Array.from({ length: n }, () => []);
  for (let a = 0; a < n; a++) {
    for (const [b, cost] of minCost[a]!) adj[a]!.push({ to: b, cost });
  }

  return {
    mapId: m.mapId,
    names,
    ids,
    synthetic,
    namedCount: named.length,
    polyRoom,
    adj,
    portals,
    cx,
    cy,
    cz,
    bboxMin,
    bboxMax,
  };
}

export function roomGraphForMesh(m: NavMesh): RoomGraph | null {
  const id = m.mapId | 0;
  if (cache.has(id)) return cache.get(id)!;
  const g = buildRoomGraph(m);
  cache.set(id, g);
  return g;
}

export function roomPath(g: RoomGraph, startRoom: number, endRoom: number): number[] | null {
  const n = g.names.length;
  if (startRoom < 0 || endRoom < 0 || startRoom >= n || endRoom >= n) return null;
  if (startRoom === endRoom) return [startRoom];
  const dist = new Float64Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  const seen = new Uint8Array(n);
  dist[startRoom] = 0;
  for (let k = 0; k < n; k++) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      if (seen[i] || !(dist[i]! < best)) continue;
      best = dist[i]!;
      u = i;
    }
    if (u < 0) break;
    if (u === endRoom) break;
    seen[u] = 1;
    for (const ed of g.adj[u]!) {
      const nd = dist[u]! + ed.cost;
      if (nd + 1e-6 < dist[ed.to]!) {
        dist[ed.to] = nd;
        parent[ed.to] = u;
      }
    }
  }
  if (!Number.isFinite(dist[endRoom]!)) return null;
  const out: number[] = [];
  for (let p = endRoom; p !== -1; p = parent[p]!) out.push(p);
  out.reverse();
  return out[0] === startRoom ? out : null;
}

/** Rooms on the coarse path plus one ring of neighbours (HAPFS refine band). */
export function roomBand(g: RoomGraph, path: readonly number[]): Uint8Array {
  const allow = new Uint8Array(g.names.length);
  for (const r of path) {
    allow[r] = 1;
    for (const ed of g.adj[r]!) allow[ed.to] = 1;
  }
  return allow;
}

/** One room plus its doorway neighbours. */
export function roomAndRing(g: RoomGraph, room: number): Uint8Array {
  return roomBand(g, [room]);
}

/** Polys in `rooms` plus hallway components — blocks other named rooms. */
export function fillAllowMask(
  g: RoomGraph,
  rooms: Uint8Array,
  out: Uint8Array,
): void {
  out.fill(0);
  const n = g.polyRoom.length;
  for (let p = 0; p < n; p++) {
    const r = g.polyRoom[p]!;
    if (r >= 0 && (rooms[r] || g.synthetic[r])) out[p] = 1;
  }
}
