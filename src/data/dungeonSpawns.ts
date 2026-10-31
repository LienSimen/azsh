// W14 — dungeon creature spawn positions and patrol paths, baked from ClassicDB `creature` /
// `creature_movement`. World yards; mask cells are vmap-internal (MID − x, MID − y).

import dungeonSpawnsJson from './tables/dungeonSpawns.json' with { type: 'json' };

export type DungeonSpawnMaskHit = {
  asset: string | null;
  cx: number | null;
  cy: number | null;
  onWalk: boolean;
  status: 'on' | 'offWalk' | 'offFrame' | string;
  snapped?: number;
};

export type DungeonSpawnWaypoint = {
  x: number;
  y: number;
  z: number;
  o: number;
  waitMs: number;
  /** creature_movement.ScriptId → dbscripts_on_creature_movement. Cite: WaypointManager.cpp. */
  scriptId?: number;
  mask: DungeonSpawnMaskHit;
};

export type DungeonSpawn = {
  guid: number;
  entry: number;
  map: number;
  x: number;
  y: number;
  z: number;
  o: number;
  spawndist: number;
  MovementType: number;
  poolCandidates?: number[];
  /** spawn_group Id when this id=0 slot resolves via spawn_group_spawn (pool of N slots). */
  spawnGroupId?: number;
  mask: DungeonSpawnMaskHit;
  path?: DungeonSpawnWaypoint[];
  pathConnected?: boolean;
  pathOrigin?: 'guid' | 'entry';
  // creature_template.NpcFlags when ≠ 0 (trainers/vendors/quest/gossip…). Cite: Unit.h UNIT_NPC_FLAG_*; L09
  // bake-dungeon-spawns / enrich-dungeon-spawn-npcs.
  npcFlags?: number;
  /** Template name — only stamped when npcFlags ≠ 0. */
  name?: string;
  /** creature_template.CreatureType — only stamped when npcFlags ≠ 0. */
  creatureType?: number;
};

export type DungeonSpawnMap = {
  slug: string;
  mapId: number;
  dbCount: number;
  bakeCount: number;
  /** Spawns with npcFlags ≠ 0 (L09). */
  npcCount?: number;
  /** DB-side NPC count for this map (full extract ⇒ equals npcCount). */
  npcDbCount?: number;
  spawns: DungeonSpawn[];
  verify: {
    onWalk: number;
    offWalk: number;
    offFrame: number;
    onWalkFrac: number;
    mt2: {
      count: number;
      pathsOk: number;
      pathsMissing: number;
      pathDisconnected: number;
    };
  };
};

/** Cite: Unit.h UNIT_NPC_FLAG_GOSSIP | QUESTGIVER — service NPCs excluded from trash packs. */
export const NPCFLAGS_SERVICE_MASK = 0x1 | 0x2;

type File = {
  maps: Record<string, DungeonSpawnMap>;
  mid?: number;
};

const data = dungeonSpawnsJson as File;

const byGuid = new Map<number, DungeonSpawn>();
for (const m of Object.values(data.maps ?? {})) {
  for (const s of m.spawns ?? []) byGuid.set(s.guid, s);
}

export function getDungeonSpawnMap(mapId: number): DungeonSpawnMap | undefined {
  return data.maps?.[String(mapId)];
}

export function getDungeonSpawn(guid: number): DungeonSpawn | undefined {
  return byGuid.get(guid);
}

/** Spawns for a map (empty when bake missing this map). */
export function dungeonSpawnsForMap(mapId: number): readonly DungeonSpawn[] {
  return getDungeonSpawnMap(mapId)?.spawns ?? [];
}

/** True when the spawn carries a non-zero creature_template.NpcFlags. */
export function isDungeonNpcSpawn(s: DungeonSpawn): boolean {
  return (s.npcFlags ?? 0) !== 0;
}

// Non-hostile / service NPCs for a map (npcFlags ≠ 0), sorted by guid and placeable at (x,y,z).
// Empty when the map has none in the DB (Stockade / Deadmines). Deterministic order for lockstep.
export function dungeonNpcsForMap(mapId: number): readonly DungeonSpawn[] {
  const out = dungeonSpawnsForMap(mapId).filter(isDungeonNpcSpawn);
  return out.slice().sort((a, b) => a.guid - b.guid);
}

// Resolve cluster members from the spawn bake; null if any guid is missing. MT=2 with a path: pose advanced
// by `elapsedMs` along creature_movement (walk).
export function resolveSpawnMembers(
  spawnGuids: readonly number[],
  opts?: { elapsedMs?: number },
): { guid: number; entry: number; x: number; y: number; z?: number }[] | null {
  const elapsed = opts?.elapsedMs ?? 0;
  const out: { guid: number; entry: number; x: number; y: number; z?: number }[] = [];
  for (const g of spawnGuids) {
    const s = byGuid.get(g);
    if (!s) return null;
    let x = s.x;
    let y = s.y;
    let z = s.z;
    if (
      s.MovementType === 2
      && s.path
      && s.path.length >= 2
      && s.pathConnected !== false
      && elapsed > 0
    ) {
      const pose = patrolPoseAtElapsed(s.path, { x: s.x, y: s.y, z: s.z }, elapsed);
      x = pose.x;
      y = pose.y;
      z = pose.z ?? z;
    }
    out.push({ guid: s.guid, entry: s.entry, x, y, z });
  }
  return out.length ? out : null;
}

// MOVE_WALK base yd/s — waypoint generators default to walk. Cite: Unit.cpp:66 baseMoveSpeed[MOVE_WALK] =
// 2.5f; WaypointMovementGenerator SetWalk.
export const PATROL_WALK_SPEED_YD = 2.5;

/** Euclidean length — lockstep peers need exact IEEE-754 (+ - * / sqrt only). */
function dist2(dx: number, dy: number): number {
  return Math.sqrt(dx * dx + dy * dy);
}

// Advance a waypoint patrol by `stepYd` along the authored path (world yards). Loops when the path ends.
// Pure — no RNG, no Math.hypot.
export function stepPatrolPath(
  path: readonly { x: number; y: number }[],
  from: { x: number; y: number },
  stepYd: number,
  pathIndex = 0,
): { pos: { x: number; y: number }; pathIndex: number } {
  if (!path.length || !(stepYd > 0)) return { pos: { x: from.x, y: from.y }, pathIndex };
  let idx = ((pathIndex % path.length) + path.length) % path.length;
  let x = from.x;
  let y = from.y;
  let left = stepYd;
  // Cap segment hops so a huge step cannot infinite-loop on a degenerate path.
  for (let hops = 0; hops < path.length * 2 && left > 1e-6; hops++) {
    const target = path[idx]!;
    const dx = target.x - x;
    const dy = target.y - y;
    const dist = dist2(dx, dy);
    if (dist <= 1e-6) {
      idx = (idx + 1) % path.length;
      continue;
    }
    if (dist <= left) {
      x = target.x;
      y = target.y;
      left -= dist;
      idx = (idx + 1) % path.length;
    } else {
      const t = left / dist;
      x += dx * t;
      y += dy * t;
      left = 0;
    }
  }
  return { pos: { x, y }, pathIndex: idx };
}

// Deterministic pose after `elapsedMs` of waypoint motion (walk + waitMs); peers with the same
// elapsedMs compute the same pose. Cite: WaypointMovementGenerator delay; Unit.cpp MOVE_WALK 2.5.
export type PatrolPose = {
  x: number;
  y: number;
  z?: number;
  pathIndex: number;
  waiting: boolean;
  o?: number;
};

/** `o` 100 is creature_movement's "keep facing" sentinel; a z the row does not carry is omitted. */
function patrolPose(
  x: number,
  y: number,
  z: number | undefined,
  pathIndex: number,
  waiting: boolean,
  o?: number,
): PatrolPose {
  return {
    x,
    y,
    ...(z != null && Number.isFinite(z) ? { z } : {}),
    pathIndex,
    waiting,
    ...(o != null && o !== 100 ? { o } : {}),
  };
}

export function patrolPoseAtElapsed(
  path: readonly { x: number; y: number; z?: number; waitMs?: number; o?: number }[],
  home: { x: number; y: number; z?: number },
  elapsedMs: number,
  speedYd = PATROL_WALK_SPEED_YD,
): PatrolPose {
  if (!path.length || !(elapsedMs > 0) || !(speedYd > 0)) {
    return patrolPose(home.x, home.y, home.z, 0, true);
  }
  // Cycle length in ms: sum(segment travel) + sum(wait at each node).
  let cycleMs = 0;
  for (let i = 0; i < path.length; i++) {
    const a = path[i]!;
    const b = path[(i + 1) % path.length]!;
    const seg = dist2(b.x - a.x, b.y - a.y);
    cycleMs += (seg / speedYd) * 1000;
    cycleMs += Math.max(0, a.waitMs ?? 0);
  }
  if (!(cycleMs > 0)) return patrolPose(path[0]!.x, path[0]!.y, path[0]!.z, 0, true);

  let t = elapsedMs % cycleMs;
  // Start at path[0] (CMaNGOS initializes i_currentNode to first waypoint).
  let x = path[0]!.x;
  let y = path[0]!.y;
  let z = path[0]!.z;
  let idx = 0;
  for (let hops = 0; hops < path.length * 2; hops++) {
    const wait = Math.max(0, path[idx]!.waitMs ?? 0);
    // OnArrived / standing at idx. Cite: WaypointMovementGenerator.cpp:173–186.
    if (t < wait) return patrolPose(x, y, z, idx, true, path[idx]!.o);
    t -= wait;
    const next = (idx + 1) % path.length;
    const target = path[next]!;
    const dx = target.x - x;
    const dy = target.y - y;
    const seg = dist2(dx, dy);
    const travelMs = (seg / speedYd) * 1000;
    if (t < travelMs || travelMs <= 0) {
      if (!(seg > 1e-9) || !(travelMs > 0)) {
        return patrolPose(target.x, target.y, target.z ?? z, next, true, target.o);
      }
      const frac = t / travelMs;
      // Height rides the same lerp as x/y. Cite: creature_movement.position_z; the storey tests
      // (sameStoreyAsAnyParty) read it, so a patroller frozen at its spawn z reads off-floor.
      const dz = target.z != null && z != null ? target.z - z : 0;
      const walkHeading = Math.atan2(dy, dx);
      return patrolPose(x + dx * frac, y + dy * frac, z != null ? z + dz * frac : target.z, next, false, walkHeading);
    }
    t -= travelMs;
    x = target.x;
    y = target.y;
    z = target.z ?? z;
    idx = next;
  }
  return patrolPose(x, y, z, idx, true, path[idx]!.o);
}

// Random-wander candidate clamped to a circle of `spawndist` around home. Caller must clamp to walkable via
// nav (isWalkablePointForMap / stepOnSurface).
export function wanderTarget(
  home: { x: number; y: number },
  spawndist: number,
  angle: number,
  radiusFrac = 1,
): { x: number; y: number } {
  const r = Math.max(0, spawndist) * Math.max(0, Math.min(1, radiusFrac));
  return {
    x: home.x + Math.cos(angle) * r,
    y: home.y + Math.sin(angle) * r,
  };
}
