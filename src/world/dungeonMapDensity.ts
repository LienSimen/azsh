/**
 * dmapfid W8 — map density helpers (D4).
 *
 * Pure geometry: convex hulls from real cluster members, room-level proximity
 * clustering above the 80-pack readability ceiling, fog-of-progress masks.
 * No free parameters for PLACEMENT — every point comes from a projected origin
 * or a pack-clusters member coordinate.
 *
 * ⚠️ TUNING, NOT FIDELITY. The three constants below are readability dials chosen
 * against a legibility probe; they have no WoW source and never had one. Do not
 * "correct" them against DBC/world-DB values — there is nothing there to match.
 * Change them only with a new legibility measurement. Cite: FIDELITY-AUDIT.md §4
 * worklist row 8. (The placement geometry in this file IS sourced; the dials are not.)
 *
 * Cite: docs/archive/DUNGEON-MAP-RUNSHEET.md §5 W8 + D4;
 * docs/dungeons/dmap/run/agents/04-probe-runtime.md (~60 readable / 150 jank).
 */

import { getClusterMap } from '../data/dungeons/pack-from-clusters.ts';
import { dungeonNpcsForMap, resolveSpawnMembers } from '../data/dungeonSpawns.ts';
import type { MapPct, WorldPos } from './dungeonMapProjection.ts';
import { projectWorld, type Viewport } from './dungeonMapProjection.ts';

/** TUNING. Above this pack count, room-level clustering kicks in (probe: ~60 readable, BRD full=260). */
export const ROOM_CLUSTER_THRESHOLD = 80;

/** TUNING. Map-% cell size for room proximity clustering (≈ one small room on a 360 px stage). */
export const ROOM_GRID_PCT = 6;

/** TUNING. Soft fog alpha for uncleared-ahead floor cells. */
export const FOG_AHEAD_ALPHA = 0.45;

export type HullPoint = MapPct;

export interface PackHull {
  encounterId: string;
  /** Convex hull in map% (closed path, first point repeated at end for SVG). */
  points: HullPoint[];
  /** Centroid map% (same as the pack pin). */
  center: MapPct;
  state: string;
}

export interface RoomCluster {
  id: string;
  /** Representative pin (centroid of members). */
  pct: MapPct;
  encounterIds: string[];
  count: number;
  /** Aggregate state: fighting > next > pending > cleared. */
  state: string;
  kind: 'trash' | 'boss' | 'mixed';
}

export interface FogCell {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type DensityPack = {
  encounterId: string;
  pct: MapPct;
  state: string;
  kind: 'trash' | 'boss';
  combatantCount: number;
  z?: number;
};

// Andrew's monotone chain convex hull. Input points in map%. Returns hull vertices CCW; empty when fewer
// than 1 distinct point.
export function convexHullMapPct(pts: readonly MapPct[]): MapPct[] {
  const uniq = new Map<string, MapPct>();
  for (const p of pts) {
    if (!Number.isFinite(p.left) || !Number.isFinite(p.top)) continue;
    const k = `${p.left.toFixed(4)},${p.top.toFixed(4)}`;
    uniq.set(k, p);
  }
  const points = [...uniq.values()].sort((a, b) =>
    a.left === b.left ? a.top - b.top : a.left - b.left,
  );
  if (points.length <= 1) return points.slice();
  if (points.length === 2) return points.slice();

  const cross = (o: MapPct, a: MapPct, b: MapPct): number =>
    (a.left - o.left) * (b.top - o.top) - (a.top - o.top) * (b.left - o.left);

  const lower: MapPct[] = [];
  for (const p of points) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: MapPct[] = [];
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * One resolved pack member: which spawn, which creature, and where it stands.
 *
 * `entry` is 0 for the 633 cluster members the bake carries without one (CSE pool slots
 * whose entry is rolled at run start). Kept as 0 rather than dropped — the member has a
 * real position even when its identity is unknown, and a generic silhouette at the right
 * spot beats no dot at all.
 * Cite: docs/archive/TACTICAL-VIEW-RUNSHEET.md T4.
 */
export interface PackMemberWorld {
  guid: number;
  entry: number;
  world: WorldPos;
}

// Resolved members for a pack from pack-clusters via spawnGuids, with identity. Returns [] when the map has
// no cluster data or no guid resolves — the caller falls back to the centroid pin (no invented spread).
export function packMembersForGuids(
  mapId: number,
  spawnGuids: readonly number[] | undefined,
  /** Sim-time since instance enter — advances MT=2 along creature_movement. */
  elapsedMs = 0,
): PackMemberWorld[] {
  if (!spawnGuids?.length) return [];
  // Prefer dungeonSpawns bake (W14/L05) — full MT=2 paths + pathConnected.
  const fromBake = resolveSpawnMembers(spawnGuids, { elapsedMs });
  if (fromBake) {
    return fromBake.map((m) => ({
      guid: m.guid,
      entry: m.entry,
      world: { x: m.x, y: m.y, z: m.z },
    }));
  }
  const map = getClusterMap(mapId);
  if (!map) return [];
  const byGuid = new Map<number, PackMemberWorld>();
  for (const pack of map.packs) {
    for (const m of pack.members) {
      if (Number.isFinite(m.x) && Number.isFinite(m.y)) {
        byGuid.set(m.guid, { guid: m.guid, entry: m.entry ?? 0, world: { x: m.x, y: m.y, z: m.z } });
      }
    }
  }
  const out: PackMemberWorld[] = [];
  for (const g of spawnGuids) {
    const m = byGuid.get(g);
    if (m) out.push(m);
  }
  return out;
}

// Member world positions only — the hull path never needed identity. Thin wrapper so widening the lookup
// did not touch the hull call sites.
export function memberWorldsForGuids(
  mapId: number,
  spawnGuids: readonly number[] | undefined,
  elapsedMs = 0,
): WorldPos[] {
  return packMembersForGuids(mapId, spawnGuids, elapsedMs).map((m) => m.world);
}

// L09 — placeable instance NPCs (npcFlags ≠ 0) as map members. Positions from dungeonSpawns bake; empty
// when the map has none in the DB.
export function npcMembersForMap(mapId: number): PackMemberWorld[] {
  return dungeonNpcsForMap(mapId).map((n) => ({
    guid: n.guid,
    entry: n.entry,
    world: { x: n.x, y: n.y, z: n.z },
  }));
}

/** Project member worlds → map% hull for one pack. */
export function packHullFromMembers(
  vp: Viewport,
  encounterId: string,
  center: MapPct,
  members: readonly WorldPos[],
  state: string,
  // Optional world→map% projector. Bake surface passes projectBakeWorld for the same asset the view drew
  // (dbake W17); default is the floorplan viewport.
  project?: (p: WorldPos) => MapPct,
): PackHull {
  if (members.length < 2) {
    return { encounterId, points: [center], center, state };
  }
  const toMap = project ?? ((m: WorldPos) => projectWorld(vp, m));
  const projected = members.map((m) => toMap(m));
  const hull = convexHullMapPct(projected);
  return {
    encounterId,
    points: hull.length ? hull : [center],
    center,
    state,
  };
}

// Room-level proximity clustering in map% space. Only applied when packs.length > ROOM_CLUSTER_THRESHOLD;
// otherwise each pack is its own cluster of 1 (identity).
export function clusterPacksForDensity(
  packs: readonly DensityPack[],
  threshold = ROOM_CLUSTER_THRESHOLD,
  gridPct = ROOM_GRID_PCT,
): RoomCluster[] {
  if (packs.length === 0) return [];
  if (packs.length <= threshold) {
    return packs.map((p) => ({
      id: `solo-${p.encounterId}`,
      pct: p.pct,
      encounterIds: [p.encounterId],
      count: 1,
      state: p.state,
      kind: p.kind,
    }));
  }

  // Grid bucket → packs
  const buckets = new Map<string, DensityPack[]>();
  for (const p of packs) {
    const gx = Math.floor(p.pct.left / gridPct);
    const gy = Math.floor(p.pct.top / gridPct);
    const key = `${gx},${gy}`;
    const list = buckets.get(key) ?? [];
    list.push(p);
    buckets.set(key, list);
  }

  const rank = (s: string): number =>
    s === 'fighting' ? 4 : s === 'next' ? 3 : s === 'pending' ? 2 : s === 'cleared' ? 1 : 0;

  const out: RoomCluster[] = [];
  let i = 0;
  for (const [, group] of buckets) {
    let sx = 0;
    let sy = 0;
    let state = 'cleared';
    let hasTrash = false;
    let hasBoss = false;
    const ids: string[] = [];
    for (const p of group) {
      sx += p.pct.left;
      sy += p.pct.top;
      ids.push(p.encounterId);
      if (rank(p.state) > rank(state)) state = p.state;
      if (p.kind === 'boss') hasBoss = true;
      else hasTrash = true;
    }
    const n = group.length;
    out.push({
      id: `room-${i++}`,
      pct: { left: sx / n, top: sy / n },
      encounterIds: ids,
      count: n,
      state,
      kind: hasBoss && hasTrash ? 'mixed' : hasBoss ? 'boss' : 'trash',
    });
  }
  return out;
}

/**
 * Fog-of-progress: dim grid cells that contain only pending packs beyond the
 * current "frontier" (next/fighting). Cleared cells stay clear. When nothing
 * is in progress, fog only packs past the first pending.
 */
export function fogCellsForProgress(
  packs: readonly DensityPack[],
  gridPct = ROOM_GRID_PCT,
): FogCell[] {
  if (!packs.length) return [];
  const frontier = packs.find((p) => p.state === 'fighting' || p.state === 'next');
  // Cells that are "behind" progress (have a cleared/next/fighting pack) stay open.
  // Cells that only contain pending packs get fogged.
  const cellState = new Map<string, { left: number; top: number; open: boolean }>();
  for (const p of packs) {
    const gx = Math.floor(p.pct.left / gridPct);
    const gy = Math.floor(p.pct.top / gridPct);
    const key = `${gx},${gy}`;
    const open = p.state === 'cleared' || p.state === 'fighting' || p.state === 'next'
      || (frontier == null && p.state !== 'pending');
    const prev = cellState.get(key);
    if (!prev) {
      cellState.set(key, {
        left: gx * gridPct,
        top: gy * gridPct,
        open,
      });
    } else if (open) {
      prev.open = true;
    }
  }
  // Without a frontier (all pending at start), do not fog the entrance-side first cell.
  if (!frontier) {
    // Reveal cells that hold the overall nearest-to-origin pack (min left+top).
    let best: DensityPack | null = null;
    let bestScore = Infinity;
    for (const p of packs) {
      const s = p.pct.left + p.pct.top;
      if (s < bestScore) {
        bestScore = s;
        best = p;
      }
    }
    if (best) {
      const gx = Math.floor(best.pct.left / gridPct);
      const gy = Math.floor(best.pct.top / gridPct);
      const cell = cellState.get(`${gx},${gy}`);
      if (cell) cell.open = true;
    }
  }
  const fog: FogCell[] = [];
  for (const c of cellState.values()) {
    if (c.open) continue;
    fog.push({ left: c.left, top: c.top, width: gridPct, height: gridPct });
  }
  return fog;
}

/** Hover composition line from pack member rows (sourced counts only). */
export function hoverComposition(
  name: string,
  kind: 'trash' | 'boss',
  combatantCount: number,
  members?: readonly { creatureEntry: number; count: number; name?: string }[],
): string {
  const tag = kind === 'boss' ? 'Boss' : 'Trash';
  if (!members?.length) return `${name} · ${tag} ×${combatantCount}`;
  const bits = members
    .map((m) => {
      const label = m.name?.trim() || `#${m.creatureEntry}`;
      return m.count > 1 ? `${label} ×${m.count}` : label;
    })
    .join(', ');
  return `${name} · ${tag} ×${combatantCount} - ${bits}`;
}
