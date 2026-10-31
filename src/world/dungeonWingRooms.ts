/**
 * Wing-scoped dungeon spawn filter for shared classic mapIds (SM / BRS / DM / Strat).
 *
 * Room ownership = which InstanceDef's encounter origins fall in a baked AABox
 * (dungeon-rooms.json). Contested tall columns (multi-wing rooms) resolve by:
 *   1) creature entry → wing (WING_BOSS_ENTRIES + WING_SIGNATURE_ENTRIES)
 *   2) navmesh floor band → unique wing (NAVMESH_FLOORS / probe-storey-cuts.mjs)
 *   3) nearest 3D encounter among co-owners of the hit contested room(s)
 *   4) encounter z-range distance (legacy fallback)
 * NONE rooms + out-of-box spawns stay on every wing (shared approach / unboxed).
 */

import DUNGEON_ROOMS from '../data/dungeons/dungeon-rooms.json' with { type: 'json' };
import { DUNGEON_INSTANCES } from '../data/dungeons/index.ts';
import {
  WING_BOSS_ENTRIES,
  WING_SIGNATURE_ENTRIES,
} from '../data/dungeons/pack-from-clusters.ts';
import {
  dungeonSpawnsForMap,
  type DungeonSpawn,
} from '../data/dungeonSpawns.ts';
// Non-overlapping physical floors (probe-storey-cuts.mjs --write); same bands as drawBandIdForZ.
import {
  NAVMESH_FLOORS,
  type NavFloorBand,
} from './navmeshFloors.ts';
// BAKE_SLUG_BY_INSTANCE — lbrs/ubrs→blackrock-spire, dire-maul-*→dire-maul, sm-*→…, strat-*→…
import { bakeSlugForInstance } from './bakeSlug.ts';

type BBox = { min: number[]; max: number[] };
type RoomRow = { name: string; bbox: BBox };
type RoomOwner = string | 'CONTESTED' | 'NONE';

type WingZRange = { min: number; max: number };

/** How a contested-room spawn was attributed to a wing. */
export type ContestedStrength = 'entry' | 'storey' | 'nearest' | 'z-range';

type MapWingPlan = {
  wingIds: readonly string[];
  /** room name → owner instance id | CONTESTED | NONE */
  owner: Map<string, RoomOwner>;
  rooms: readonly RoomRow[];
  /** contested room name → wingId → z-range of that wing's encounters in the room */
  contestedZ: Map<string, Map<string, WingZRange>>;
  /** contested room name → wingId → encounter origins in that room */
  contestedEncs: Map<string, Map<string, readonly { x: number; y: number; z: number }[]>>;
  /** creature entry → instance id (boss + signature trash) */
  entryWing: Map<number, string>;
  /** storey id → instance id when exactly one wing has encounters on that storey */
  storeyWing: Map<number, string>;
  storeys: readonly NavFloorBand[];
};

/** Same predicate as probe-storey-collapse wing-bleed (z pad ±2). Missing z fails. */
const inBox = (
  p: { x: number; y: number; z?: number },
  b: BBox,
): boolean =>
  p.x >= b.min[0] && p.x <= b.max[0]
  && p.y >= b.min[1] && p.y <= b.max[1]
  && p.z != null
  && p.z >= b.min[2] - 2 && p.z <= b.max[2] + 2;

/** Tightest containing band, else nearest mean-z — matches dungeonBakeLoader storeyIdsForZ. */
function storeyIdForZ(storeys: readonly NavFloorBand[], z: number): number | null {
  if (!storeys.length) return null;
  const inside = storeys.filter((f) => z >= f.z0 && z <= f.z1);
  if (inside.length) {
    let best = inside[0]!;
    let bestW = best.z1 - best.z0;
    for (let i = 1; i < inside.length; i++) {
      const f = inside[i]!;
      const w = f.z1 - f.z0;
      if (w < bestW || (w === bestW && f.id < best.id)) {
        best = f;
        bestW = w;
      }
    }
    return best.id;
  }
  let best = storeys[0]!;
  let bestD = Math.abs(z - best.zm);
  for (let i = 1; i < storeys.length; i++) {
    const f = storeys[i]!;
    const d = Math.abs(z - f.zm);
    if (d < bestD || (d === bestD && f.id < best.id)) {
      best = f;
      bestD = d;
    }
  }
  return best.id;
}

function defsForMap(mapId: number) {
  return DUNGEON_INSTANCES.filter((d) => d.mapId === mapId);
}

/** Build entry→instanceId from WING_* tables + InstanceDef.wing short keys. */
function buildEntryWing(mapId: number): Map<number, string> {
  const defs = defsForMap(mapId);
  const wingKeyToId = new Map<string, string>();
  for (const d of defs) {
    const key = (d as { wing?: string }).wing;
    if (key) wingKeyToId.set(key, d.id);
    // BRS keys already match instance ids; always allow id→id.
    wingKeyToId.set(d.id, d.id);
  }
  const out = new Map<number, string>();
  const add = (key: string, entries: readonly number[]) => {
    const id = wingKeyToId.get(key);
    if (!id) return;
    for (const e of entries) out.set(e, id);
  };
  for (const [key, entries] of Object.entries(WING_BOSS_ENTRIES[mapId] ?? {})) {
    add(key, entries);
  }
  for (const [key, entries] of Object.entries(WING_SIGNATURE_ENTRIES[mapId] ?? {})) {
    add(key, entries);
  }
  return out;
}

function buildPlan(mapId: number): MapWingPlan | null {
  const defs = defsForMap(mapId);
  if (defs.length < 2) return null;
  const m = (DUNGEON_ROOMS as {
    maps?: Record<string, { rooms?: RoomRow[] }>;
  }).maps?.[String(mapId)];
  const rooms = m?.rooms ?? [];
  if (!rooms.length) return null;

  const owner = new Map<string, RoomOwner>();
  const contestedZ = new Map<string, Map<string, WingZRange>>();
  const contestedEncs = new Map<
    string,
    Map<string, readonly { x: number; y: number; z: number }[]>
  >();

  for (const r of rooms) {
    const hits: { id: string; zs: number[]; pts: { x: number; y: number; z: number }[] }[] = [];
    for (const d of defs) {
      const zs: number[] = [];
      const pts: { x: number; y: number; z: number }[] = [];
      for (const e of d.encounters) {
        const o = e.origin;
        // Match probe: finite x; inBox also requires z (rejects missing).
        if (!o || !Number.isFinite(o.x)) continue;
        if (!inBox(o, r.bbox)) continue;
        const z = o.z as number;
        zs.push(z);
        pts.push({ x: o.x, y: o.y as number, z });
      }
      if (zs.length) hits.push({ id: d.id, zs, pts });
    }
    if (hits.length === 1) {
      owner.set(r.name, hits[0]!.id);
    } else if (hits.length > 1) {
      owner.set(r.name, 'CONTESTED');
      const byWingZ = new Map<string, WingZRange>();
      const byWingPts = new Map<string, readonly { x: number; y: number; z: number }[]>();
      for (const h of hits) {
        let min = h.zs[0]!;
        let max = h.zs[0]!;
        for (const z of h.zs) {
          if (z < min) min = z;
          if (z > max) max = z;
        }
        byWingZ.set(h.id, { min, max });
        byWingPts.set(h.id, h.pts);
      }
      contestedZ.set(r.name, byWingZ);
      contestedEncs.set(r.name, byWingPts);
    } else {
      owner.set(r.name, 'NONE');
    }
  }

  // Overview slug via bakeSlugForInstance (shared plate per multi-wing map).
  let bakeSlug: string | null = null;
  for (const d of defs) {
    bakeSlug = bakeSlugForInstance(d.id);
    if (bakeSlug) break;
  }
  const storeys = (bakeSlug ? NAVMESH_FLOORS[bakeSlug] : undefined) ?? [];
  const storeyWing = new Map<number, string>();
  if (storeys.length) {
    const counts = new Map<number, Map<string, number>>();
    for (const d of defs) {
      for (const e of d.encounters) {
        const o = e.origin;
        if (!o || !Number.isFinite(o.z)) continue;
        const sid = storeyIdForZ(storeys, o.z as number);
        if (sid == null) continue;
        let m2 = counts.get(sid);
        if (!m2) {
          m2 = new Map();
          counts.set(sid, m2);
        }
        m2.set(d.id, (m2.get(d.id) ?? 0) + 1);
      }
    }
    for (const [sid, m2] of counts) {
      if (m2.size === 1) storeyWing.set(sid, [...m2.keys()][0]!);
    }
  }

  return {
    wingIds: defs.map((d) => d.id),
    owner,
    rooms,
    contestedZ,
    contestedEncs,
    entryWing: buildEntryWing(mapId),
    storeyWing,
    storeys,
  };
}

/** Distance from z to [min,max]: 0 inside, else gap to nearest edge. */
function zDist(z: number, r: WingZRange): number {
  if (z >= r.min && z <= r.max) return 0;
  if (z < r.min) return r.min - z;
  return z - r.max;
}

type ContestedPick = { wingId: string; strength: ContestedStrength };

// Pick the wing for a spawn inside one or more CONTESTED rooms. Prefer entry → unique storey → nearest
// encounter → z-range. Tie → lex smaller id.
function wingForContested(
  s: DungeonSpawn,
  roomNames: readonly string[],
  plan: MapWingPlan,
): ContestedPick | null {
  // 1) Signature / boss creature entry (pack-from-clusters wing tables).
  const byEntry = plan.entryWing.get(s.entry);
  if (byEntry) return { wingId: byEntry, strength: 'entry' };
  if (s.poolCandidates?.length) {
    const votes = new Map<string, number>();
    for (const e of s.poolCandidates) {
      const w = plan.entryWing.get(e);
      if (w) votes.set(w, (votes.get(w) ?? 0) + 1);
    }
    if (votes.size === 1) {
      return { wingId: [...votes.keys()][0]!, strength: 'entry' };
    }
  }

  // 2) Measured storey uniquely owned by one wing's encounters.
  if (plan.storeys.length && Number.isFinite(s.z)) {
    const sid = storeyIdForZ(plan.storeys, s.z);
    if (sid != null) {
      const w = plan.storeyWing.get(sid);
      if (w) return { wingId: w, strength: 'storey' };
    }
  }

  // 3) Nearest 3D encounter among co-owners of hit contested rooms.
  let bestNear: string | null = null;
  let bestD = Infinity;
  for (const name of roomNames) {
    const byWing = plan.contestedEncs.get(name);
    if (!byWing) continue;
    for (const [wid, pts] of byWing) {
      for (const o of pts) {
        const dx = s.x - o.x;
        const dy = s.y - o.y;
        const dz = s.z - o.z;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < bestD || (d === bestD && (bestNear == null || wid < bestNear))) {
          bestD = d;
          bestNear = wid;
        }
      }
    }
  }
  if (bestNear != null) return { wingId: bestNear, strength: 'nearest' };

  // 4) Legacy z-range distance.
  const merged = new Map<string, WingZRange>();
  for (const name of roomNames) {
    const byWing = plan.contestedZ.get(name);
    if (!byWing) continue;
    for (const [wid, r] of byWing) {
      const prev = merged.get(wid);
      if (!prev) merged.set(wid, { min: r.min, max: r.max });
      else {
        merged.set(wid, {
          min: Math.min(prev.min, r.min),
          max: Math.max(prev.max, r.max),
        });
      }
    }
  }
  if (!merged.size || !Number.isFinite(s.z)) return null;

  let bestId: string | null = null;
  let bestDist = Infinity;
  for (const [wid, r] of merged) {
    const d = zDist(s.z, r);
    if (d < bestDist || (d === bestDist && (bestId == null || wid < bestId))) {
      bestDist = d;
      bestId = wid;
    }
  }
  return bestId != null ? { wingId: bestId, strength: 'z-range' } : null;
}

const planByMap = new Map<number, MapWingPlan | null>();
function planForMap(mapId: number): MapWingPlan | null {
  if (planByMap.has(mapId)) return planByMap.get(mapId)!;
  const p = buildPlan(mapId);
  planByMap.set(mapId, p);
  return p;
}

function spawnBelongsToWing(
  s: DungeonSpawn,
  wingId: string,
  plan: MapWingPlan,
): boolean {
  const hitRooms = plan.rooms.filter((r) => inBox(s, r.bbox));
  if (!hitRooms.length) return true; // no baked box — keep on every wing

  const owners = hitRooms.map((r) => plan.owner.get(r.name) ?? 'NONE');
  if (owners.includes(wingId)) return true;

  const hasContested = owners.includes('CONTESTED');
  if (hasContested) {
    const contestedNames = hitRooms
      .filter((r) => plan.owner.get(r.name) === 'CONTESTED')
      .map((r) => r.name);
    const assigned = wingForContested(s, contestedNames, plan);
    // Missing attribution: keep only for wings that co-own the box.
    if (assigned == null) {
      return contestedNames.some((name) => plan.contestedZ.get(name)?.has(wingId));
    }
    return assigned.wingId === wingId;
  }

  if (owners.every((o) => o === 'NONE')) return true;
  return false; // foreign-owned room only
}

// Census class for one spawn already on `wingId`'s floor. Contested = multi-wing room membership resolved
// only by the z-range fallback. Entry / storey / nearest count as own (definitive measured attribution).
export type FloorSpawnClass = 'own' | 'foreign' | 'contested' | 'noRoom';

export function classifyFloorSpawn(
  s: DungeonSpawn,
  wingId: string,
  mapId: number,
): FloorSpawnClass {
  const plan = planForMap(mapId);
  if (!plan || !plan.wingIds.includes(wingId)) return 'own';

  const hitRooms = plan.rooms.filter((r) => inBox(s, r.bbox));
  if (!hitRooms.length) return 'noRoom';

  const owners = hitRooms.map((r) => plan.owner.get(r.name) ?? 'NONE');
  if (owners.includes(wingId)) return 'own';

  if (owners.includes('CONTESTED')) {
    const contestedNames = hitRooms
      .filter((r) => plan.owner.get(r.name) === 'CONTESTED')
      .map((r) => r.name);
    const assigned = wingForContested(s, contestedNames, plan);
    if (assigned == null) {
      // Same as filter: co-owners keep the spawn; census calls it contested.
      return contestedNames.some((name) => plan.contestedZ.get(name)?.has(wingId))
        ? 'contested'
        : 'foreign';
    }
    if (assigned.wingId !== wingId) return 'foreign';
    return assigned.strength === 'z-range' ? 'contested' : 'own';
  }

  if (owners.every((o) => o === 'NONE')) return 'noRoom';
  return 'foreign';
}

const cache = new Map<string, readonly DungeonSpawn[]>();

// Spawns placed on `instanceId`'s continuous floor. Single-wing maps (and maps with no room bake) return
// the full map list unchanged (same array reference / order as dungeonSpawnsForMap).
export function spawnsForInstanceWing(
  instanceId: string,
  mapId: number,
): readonly DungeonSpawn[] {
  const hit = cache.get(instanceId);
  if (hit) return hit;

  const all = dungeonSpawnsForMap(mapId);
  const plan = planForMap(mapId);
  if (!plan || !plan.wingIds.includes(instanceId)) {
    cache.set(instanceId, all);
    return all;
  }

  // Safety net: a wing's OWN authored encounters must always keep their spawns, whatever
  // room the box attribution put them in. Stratholme's rare Skul is authored on
  // `stratholme-undead` but every one of his candidate spawn points sits in a live-wing
  // room, so room attribution alone filtered him off the undead floor entirely — a boss
  // that can never appear is a worse bug than one standing in the wrong wing.
  // Gated by probe-wing-boss-completability.
  const ownGuids = new Set<number>();
  for (const def of DUNGEON_INSTANCES) {
    if (def.id !== instanceId) continue;
    for (const enc of def.encounters) {
      for (const g of enc.spawnGuids ?? []) ownGuids.add(g);
    }
  }
  const filtered = all.filter(
    (s) => ownGuids.has(s.guid) || spawnBelongsToWing(s, instanceId, plan),
  );
  cache.set(instanceId, filtered);
  return filtered;
}

/** Clear memo (tests / probes that rebuild registry mid-process). */
export function clearWingSpawnCache(): void {
  cache.clear();
  planByMap.clear();
}
