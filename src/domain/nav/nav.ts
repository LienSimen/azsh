// The dungeon floor, and what blocks sight across it: the navmesh carries floor, height, walk, swim
// and routing; the collision blob is the only thing that knows where a wall is. Pure, deterministic.

export {
  NAV_MID,
  SWIM_STEP_COST,
  Z_HINT_TOL,
  pathLength,
  type FindPathDiag,
  type NavPos,
} from './navTypes.ts';

export {
  NAV_WATER,
  clearNavMeshAuthorCost,
  navMeshForMap,
  reachableOnMesh,
  reachableStandNavMesh,
  registerNavMeshForMap,
  stampNavMeshAvoid,
  stampNavMeshLane,
  type NavMesh,
} from './navmesh.ts';

export {
  clearCollisionRegistry,
  collisionForMap,
  decodeCollision,
  losClearCollision,
  registerCollisionForMap,
  type CollisionMap,
} from './navCollision.ts';

export {
  sightClearForMap,
  connectedFloorZForMap,
  floorZForMap,
  isSwimPointForMap,
  isWalkablePointForMap,
  findPathForMap,
  WALK_MAX_VISITED,
  clearNavRegistry,
} from './navRegistry.ts';
