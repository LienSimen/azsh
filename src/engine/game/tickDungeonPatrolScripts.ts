// Advance patrolling dungeon bodies from elapsed time and fire their movement scripts once per
// waypoint arrival; pack riders take the master's pose. Cite: WaypointMovementGenerator.cpp:173.
import { patrolPoseAtElapsed } from '../../data/dungeonSpawns.ts';
import {
  LINEAR_WP_MOTION_TYPE,
  followLinkOf,
  followPose,
  followersOfMaster,
  formationMasterGuid,
  formationOfGuid,
  formationPath,
  formationSlotOffset,
  mirrorAngle,
  pingPongPath,
  type PatrolFormation,
} from '../../domain/creature/patrolPacks.ts';
import { navMeshForMap, stepWalkableNavMesh } from '../../domain/nav/navmesh.ts';
import { WANDER_SPEED_YD, wanderPathFor, wandersInPlace } from '../../domain/creature/creatureWander.ts';
import { placeFloorBody, type ContinuousEntity, type ContinuousWorld } from '../../world/continuousDungeon.ts';

export type PatrolSpawnRef = {
  x: number;
  y: number;
  z?: number;
  /** creature.spawndist — the radius a RANDOM_MOTION_TYPE body drifts in. */
  spawndist?: number;
  path?: readonly {
    x: number; y: number; z?: number; waitMs?: number; scriptId?: number; o?: number;
  }[];
  pathConnected?: boolean;
};

export type PatrolPoseAt = { x: number; y: number; z?: number };
// Streamed: write session then take the settled pose back (placeEnemyAt snap). Null = world owns it.
export type PatrolPoseOwner = (e: ContinuousEntity, pose: PatrolPoseAt) => PatrolPoseAt | null;

/** The pose a follower rides — a master's stamped position plus the facing it walked with. */
type MasterPose = { x: number; y: number; z?: number; o?: number; mirrored: boolean };
/** Where one pack member stands relative to its master's facing. */
type PackRider = { masterGuid: number; dist: number; angle: number };

// For each living patroller, stamp its pose from elapsed time and fire the arrival script once when
// the waypoint index changes. First sight seeds the index without firing, as the core does.
export function tickDungeonPatrolScripts(
  // The real world, not `{ entities }`: stamping a pose owes the near-grid reindex, and
  // `placeFloorBody` needs the world to reach the grid. The one caller always passed this.
  world: ContinuousWorld,
  elapsedMs: number,
  lookupSpawn: (guid: number) => PatrolSpawnRef | undefined,
  apply: (scriptId: number, entity: ContinuousEntity) => void,
  lastPathIndex: Map<number, number>,
  poseOwner?: PatrolPoseOwner,
): void {
  /** guid -> the pose its followers hang off, filled as each master is stamped. */
  const masters = new Map<number, MasterPose>();
  /** Formation masters, pack riders and drifters, collected on the one pass over the floor. */
  const formationMasters: { e: ContinuousEntity; f: PatrolFormation }[] = [];
  const riders: { e: ContinuousEntity; link: PackRider }[] = [];
  const drifters: ContinuousEntity[] = [];

  for (const e of world.entities) {
    if (e.state === 'dead' || e.state === 'skipped') continue;
    const formation = formationOfGuid(e.guid);
    if (formation) {
      if (formationMasterGuid(formation) === e.guid) formationMasters.push({ e, f: formation });
      else {
        const link = formationRider(formation, e.guid);
        if (link) riders.push({ e, link });
      }
      continue;
    }
    const follow = followLinkOf(e.guid);
    if (follow) {
      riders.push({ e, link: { masterGuid: follow.masterGuid, dist: follow.dist, angle: follow.angle } });
      continue;
    }
    if (e.movementType !== 2 && e.movementType !== LINEAR_WP_MOTION_TYPE) {
      // A drifter's own pose lands below, so its slaves take it there, not here.
      if (e.movementType === 1) drifters.push(e);
      // A stationary master still anchors its slaves. Cite: CreatureLinkingMgr.cpp:757 TryFollowMaster.
      else if (followersOfMaster(e.guid).length) masters.set(e.guid, poseOf(e, false));
      continue;
    }
    const spawn = lookupSpawn(e.guid);
    const authored = spawn?.path;
    if (!spawn || !authored || authored.length < 2 || spawn.pathConnected === false) continue;
    // LINEAR_WP walks the path out and back; WAYPOINT loops it.
    const path = e.movementType === LINEAR_WP_MOTION_TYPE ? pingPongPath(authored) : authored;

    // Chase interrupts the waypoint generator; PAUSE_WAYPOINTS does the same. The clock holds
    // and resumes from here. Cite: WaypointMovementGenerator.cpp:141-152 Interrupt.
    const patrolMs = patrolClockMs(e, elapsedMs);
    if (patrolMs == null) {
      if (followersOfMaster(e.guid).length) masters.set(e.guid, poseOf(e, false));
      continue;
    }
    const pose = patrolPoseAtElapsed(path, { x: spawn.x, y: spawn.y, z: spawn.z }, patrolMs);
    const at = poseOwner?.(e, pose) ?? pose;
    // Through `placeFloorBody`, which REINDEXES the near grid. A patrol moves furthest of anything, and
    // writing the coordinates directly left it filed at its spawn cell, absent from every query.
    placeFloorBody(world, e, at.x, at.y, at.z);

    // Facing follows movement while walking; the waypoint's own `o` wins on arrival.
    if (pose.o !== undefined) e.o = pose.o;
    masters.set(e.guid, poseOf(e, false));
    fireArrival(e, pose, path, lastPathIndex, apply);
  }

  for (const { e, f: formation } of formationMasters) {
    const base = formationPath(formation.pathId);
    if (base.length < 2) continue;
    const linear = formation.movementType === LINEAR_WP_MOTION_TYPE;
    const path = linear ? pingPongPath(base) : base;
    const patrolMs = patrolClockMs(e, elapsedMs);
    if (patrolMs == null) {
      masters.set(e.guid, poseOf(e, false));
      continue;
    }
    const spawn = lookupSpawn(e.guid);
    const home = spawn ?? { x: base[0]!.x, y: base[0]!.y, z: base[0]!.z };
    const pose = patrolPoseAtElapsed(path, home, patrolMs);
    const at = poseOwner?.(e, pose) ?? pose;
    placeFloorBody(world, e, at.x, at.y, at.z);
    if (pose.o !== undefined) e.o = pose.o;
    // The group mirrors its shape on a linear path's way back. Cite: SpawnGroup.cpp:1857-1865.
    const mirrored = formation.mirroring && linear && pose.pathIndex >= base.length - 1;
    masters.set(e.guid, poseOf(e, mirrored));
    fireArrival(e, pose, path, lastPathIndex, apply);
  }

  const mesh = riders.length || drifters.length ? navMeshForMap(world.mapId) : null;

  for (const e of drifters) {
    const spawn = lookupSpawn(e.guid);
    if (!spawn || !wandersInPlace(e.movementType, spawn.spawndist)) continue;
    const patrolMs = patrolClockMs(e, elapsedMs);
    if (patrolMs == null) continue;
    const home = { x: spawn.x, y: spawn.y, z: spawn.z };
    const path = wanderPathFor(e.guid, home, spawn.spawndist ?? 0, mesh);
    const pose = patrolPoseAtElapsed(path, home, patrolMs, WANDER_SPEED_YD);
    const at = poseOwner?.(e, pose) ?? pose;
    placeFloorBody(world, e, at.x, at.y, at.z);
    if (pose.o !== undefined) e.o = pose.o;
    if (followersOfMaster(e.guid).length) masters.set(e.guid, poseOf(e, false));
  }

  // A follow slot is displacement: a loaded mesh that refuses the step wins, so the rider walks
  // the last walkable sample out from its master rather than into void (displaceFloor.ts:1-2).
  for (const { e, link } of riders) {
    const master = masters.get(link.masterGuid);
    // A slave only holds formation out of combat, and never on a dead or engaged master.
    // Cite: CreatureLinkingMgr.cpp:602 FLAG_FOLLOW && !IsInCombat.
    if (!master || e.state === 'engaged' || e.waypointsPaused === true) continue;
    const angle = master.mirrored ? mirrorAngle(link.angle) : link.angle;
    const slot = followPose(master, link.dist, angle);
    const pose = mesh ? stepWalkableNavMesh(mesh, master, slot, link.dist) : slot;
    const at = poseOwner?.(e, pose) ?? pose;
    placeFloorBody(world, e, at.x, at.y, at.z);
    if (master.o !== undefined) e.o = master.o;
  }
}

/** Elapsed patrol clock, or null while the body is holding (engaged / PAUSE_WAYPOINTS). */
function patrolClockMs(e: ContinuousEntity, elapsedMs: number): number | null {
  if (e.waypointsPaused === true || e.state === 'engaged') {
    if (e.waypointPausedAtMs == null) e.waypointPausedAtMs = elapsedMs;
    return null;
  }
  if (e.waypointPausedAtMs != null) {
    e.waypointPauseMs = (e.waypointPauseMs ?? 0) + Math.max(0, elapsedMs - e.waypointPausedAtMs);
    e.waypointPausedAtMs = undefined;
  }
  return Math.max(0, elapsedMs - (e.waypointPauseMs ?? 0));
}

function poseOf(e: ContinuousEntity, mirrored: boolean): MasterPose {
  return { x: e.x, y: e.y, z: e.z, o: e.o, mirrored };
}

/** Slot offset for a formation member, 1-based over the followers in slot order. */
function formationRider(f: PatrolFormation, guid: number): PackRider | null {
  const n = f.slots.indexOf(guid | 0);
  if (n < 1) return null;
  const { dist, angle } = formationSlotOffset(f, n, f.slots.length - 1);
  return { masterGuid: formationMasterGuid(f), dist, angle };
}

// OnArrived = enter wait at idx, not start of travel toward idx.
// Cite: WaypointMovementGenerator.cpp:173-186.
function fireArrival(
  e: ContinuousEntity,
  pose: { pathIndex: number; waiting: boolean },
  path: readonly { scriptId?: number }[],
  lastPathIndex: Map<number, number>,
  apply: (scriptId: number, entity: ContinuousEntity) => void,
): void {
  if (!pose.waiting) return;
  const prev = lastPathIndex.get(e.guid);
  if (prev === pose.pathIndex) return;
  lastPathIndex.set(e.guid, pose.pathIndex);
  // Seed on first observation — fire only on a subsequent arrival.
  if (prev === undefined) return;
  const scriptId = path[pose.pathIndex]?.scriptId ?? 0;
  if (scriptId > 0) apply(scriptId, e);
}
