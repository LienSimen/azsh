// A patrol is a PACK: FLAG_FOLLOW slaves hold their spawn offset behind a patrolling master, and a
// spawn_group_formation walks its own waypoint_path in shape. Rows: creaturePatrolPacks.json.

import packsJson from '../../data/tables/creaturePatrolPacks.json' with { type: 'json' };
import { detAtan2, detCos, detSin } from '../../engine/core/detMath.ts';

/** SpawnGroupFormationType. Cite: SpawnGroupDefines.h:128-138 (0 = RANDOM, the default arm). */
export const FORMATION_SINGLE_FILE = 1;
export const FORMATION_SIDE_BY_SIDE = 2;
export const FORMATION_LIKE_GEESE = 3;
export const FORMATION_FANNED_OUT_BEHIND = 4;
export const FORMATION_FANNED_OUT_IN_FRONT = 5;
export const FORMATION_CIRCLE_THE_LEADER = 6;

/** MotionMaster.h:54 — a linear path is walked out and back; 2 (WAYPOINT) loops. */
export const LINEAR_WP_MOTION_TYPE = 4;

/** [x, y, z, o, waitMs, scriptId] — waypoint_path row, in world yards. */
type PackPathRow = readonly [number, number, number, number, number, number];
/** [guid, masterGuid, distYd, angleRad, mapId, flag] — creature_linking FLAG_FOLLOW. */
type FollowRow = readonly [number, number, number, number, number, number];

export type PackWaypoint = {
  x: number; y: number; z: number; o: number; waitMs: number; scriptId: number;
};

export type PatrolFormation = {
  id: number;
  map: number;
  type: number;
  spread: number;
  options: number;
  pathId: number;
  movementType: number;
  mirroring: boolean;
  modelWidth: number;
  slots: readonly number[];
};

type PacksFile = {
  follow: readonly FollowRow[];
  formations: readonly PatrolFormation[];
  paths: Readonly<Record<string, readonly PackPathRow[]>>;
};

const file = packsJson as PacksFile;

export type FollowLink = { guid: number; masterGuid: number; dist: number; angle: number };

const followByMaster = new Map<number, FollowLink[]>();
const followByGuid = new Map<number, FollowLink>();
for (const [guid, masterGuid, dist, angle] of file.follow) {
  const link = { guid, masterGuid, dist, angle };
  followByGuid.set(guid, link);
  if (!followByMaster.has(masterGuid)) followByMaster.set(masterGuid, []);
  followByMaster.get(masterGuid)!.push(link);
}

const formationByGuid = new Map<number, PatrolFormation>();
for (const f of file.formations) {
  for (const g of f.slots) formationByGuid.set(g, f);
}

/** FLAG_FOLLOW slaves of a patrolling master, by its spawn guid. */
export function followersOfMaster(masterGuid: number): readonly FollowLink[] {
  return followByMaster.get(masterGuid | 0) ?? [];
}

export function followLinkOf(guid: number): FollowLink | undefined {
  return followByGuid.get(guid | 0);
}

export function formationOfGuid(guid: number): PatrolFormation | undefined {
  return formationByGuid.get(guid | 0);
}

// MT=1/2/4 mover, formation slot or FLAG_FOLLOW slave. Mirroring the frozen inject
// pose onto one of these fights the stamp (livePullLifecycle.ts:272 floorWorldFromSession).
export function patrolOwnsOocPose(guid: number, movementType: number): boolean {
  if (movementType === 2 || movementType === 1 || movementType === LINEAR_WP_MOTION_TYPE) return true;
  const g = guid | 0;
  return formationByGuid.has(g) || followByGuid.has(g);
}

/** Slot 0 owns the path; the rest hold shape offsets. Cite: SpawnGroup.cpp:866-873. */
export function formationMasterGuid(f: PatrolFormation): number {
  return f.slots[0] ?? 0;
}

const pathCache = new Map<number, readonly PackWaypoint[]>();

/** waypoint_path points for a formation, [] when the bake carries none. */
export function formationPath(pathId: number): readonly PackWaypoint[] {
  const id = pathId | 0;
  const hit = pathCache.get(id);
  if (hit) return hit;
  const rows = file.paths[String(id)];
  const out: PackWaypoint[] = (rows ?? []).map(([x, y, z, o, waitMs, scriptId]) => ({
    x, y, z, o, waitMs, scriptId,
  }));
  pathCache.set(id, out);
  return out;
}

// LINEAR_WP walks 1..N then back N..1, so the looping pose function sees the path doubled with
// both endpoints kept once. Cite: WaypointMovementGenerator.cpp:617-645 SwitchToNextNode.
export function pingPongPath<T>(path: readonly T[]): readonly T[] {
  if (path.length < 3) return path;
  const back = path.slice(1, path.length - 1).reverse();
  return [...path, ...back];
}

// Slot offset (dist yd, angle rad off the master's facing) for follower `n` of `followers`,
// 1-based in slot order. Cite: SpawnGroup.cpp:1560-1840 SetFormationSlots.
export function formationSlotOffset(
  f: PatrolFormation,
  n: number,
  followers: number,
): { dist: number; angle: number } {
  const spread = f.spread;
  const total = Math.max(1, followers);
  const TAU = Math.PI * 2;
  switch (f.type) {
    case FORMATION_SINGLE_FILE:
      return { dist: spread * n, angle: Math.PI };
    case FORMATION_SIDE_BY_SIDE:
      return {
        dist: spread * (Math.floor((n - 1) / 2) + 1),
        angle: (n & 1) === 0 ? Math.PI / 2 + Math.PI : Math.PI / 2,
      };
    case FORMATION_LIKE_GEESE:
      return {
        dist: spread * (Math.floor((n - 1) / 2) + 1),
        angle: (n & 1) === 0 ? Math.PI + Math.PI / 4 : Math.PI - Math.PI / 4,
      };
    case FORMATION_FANNED_OUT_BEHIND:
      return { dist: spread, angle: Math.PI / 2 + (Math.PI / total) * (n - 1) };
    case FORMATION_FANNED_OUT_IN_FRONT: {
      let a = Math.PI + Math.PI / 2 + (Math.PI / total) * (n - 1);
      if (a > TAU) a -= TAU;
      return { dist: spread, angle: a };
    }
    case FORMATION_CIRCLE_THE_LEADER:
      return { dist: spread, angle: (TAU / total) * (n - 1) };
    default:
      return randomShapeSlot(f, n);
  }
}

// SPAWN_GROUP_FORMATION_TYPE_RANDOM. The core then jitters every slot with `frand`
// (FormationSlotData::AddPositionVariation); a lockstep floor cannot, so the base slot stands.
function randomShapeSlot(f: PatrolFormation, n: number): { dist: number; angle: number } {
  const inter = f.modelWidth * 3;
  const hypAt = (mult: number): number => {
    const back = f.spread + inter * mult;
    return Math.sqrt(back * back + inter * inter);
  };
  const skew = (mult: number, sign: number): { dist: number; angle: number } => {
    const hyp = hypAt(mult);
    const back = f.spread + inter * mult;
    return { dist: hyp, angle: Math.PI + sign * detAtan2(inter, back) };
  };
  switch (n) {
    case 1: return skew(1, -1);
    case 2: return skew(1, 1);
    case 3: return { dist: f.spread + inter * 2, angle: Math.PI };
    case 4: return { dist: f.spread + inter * 3, angle: Math.PI };
    case 5: return skew(2, -1);
    case 6: return skew(2, 1);
    case 7: return skew(3, -1);
    case 8: return skew(3, 1);
    case 9: return { dist: f.spread + inter, angle: Math.PI };
    default:
      return {
        dist: inter * (Math.floor((n - 10) / 2) + 1),
        angle: (n & 1) === 0 ? Math.PI / 2 + Math.PI : Math.PI / 2,
      };
  }
}

// `dist` yards from the master at `angle` off its facing. Cite: TargetedMovementGenerator.cpp:1001
// (to + GetAngle()); Object.cpp:2305 GetNearPoint2dAt.
export function followPose(
  master: { x: number; y: number; z?: number; o?: number },
  dist: number,
  angle: number,
): { x: number; y: number; z?: number } {
  const a = (master.o ?? 0) + angle;
  return {
    x: master.x + detCos(a) * dist,
    y: master.y + detSin(a) * dist,
    ...(master.z != null ? { z: master.z } : {}),
  };
}

/** Mirrored slot angle on a linear path's return leg. Cite: SpawnGroup.cpp:1857-1865 GetAngle. */
export function mirrorAngle(angle: number): number {
  return Math.PI * 2 - angle;
}

export function patrolPackCounts(): {
  follow: number; formations: number; members: number; paths: number;
} {
  return {
    follow: file.follow.length,
    formations: file.formations.length,
    members: file.formations.reduce((n, f) => n + f.slots.length, 0),
    paths: Object.keys(file.paths).length,
  };
}
