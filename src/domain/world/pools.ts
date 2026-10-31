// Pool population caps, weighted and equal-chance spawn rolls, and pool_pool recursion. Pure, with an
// injected rng. Cite: PoolManager.cpp AddEntry ~139, RollOne ~196, SpawnObject ~391, SpawnPool ~1087.

import type { Rng } from '../../engine/core/rng.ts';

/** pool_template row shape. Cite: PoolTemplateData MaxLimit. */
export interface PoolTemplate {
  poolId: number;
  /** Max simultaneous spawns from this pool. */
  maxLimit: number;
  description?: string;
}

// pool_creature / pool_gameobject row. Cite: PoolObject { guid, chance } — chance is absolute percent when
// in explicit list.
export interface PoolCreature {
  poolId: number;
  /** Creature/GO guid or entry key used by the pool. */
  guid: number;
  // Explicit percent chance (0 = equal-chance bucket). Cite: PoolObject.chance; AddEntry routes chance!=0
  // && maxLimit==1 to explicit.
  chance: number;
  /** Optional marker for rare mobs (Phonecraft helper; not a CMaNGOS field). */
  rare?: boolean;
}

export interface PoolSpawnState {
  /** Guids currently considered spawned for this pool. */
  spawned: ReadonlySet<number> | readonly number[];
}

function asSet(s: PoolSpawnState['spawned']): Set<number> {
  if (s instanceof Set) return s;
  return new Set(s);
}

// How many more objects this pool may spawn. Cite: SpawnObject — `int count = limit -
// spawns.GetSpawnedObjects(poolId)`.
export function remainingSpawnSlots(
  pool: PoolTemplate,
  state: PoolSpawnState,
): number {
  const n = asSet(state.spawned).size;
  return Math.max(0, pool.maxLimit - n);
}

// Partition members like PoolGroup::AddEntry. Explicit list only when chance != 0 AND maxLimit == 1; else
// equal-chance. Cite: PoolManager.cpp:139-145.
export function partitionPoolMembers(
  members: readonly PoolCreature[],
  maxLimit: number,
): { explicit: PoolCreature[]; equal: PoolCreature[] } {
  const explicit: PoolCreature[] = [];
  const equal: PoolCreature[] = [];
  for (const m of members) {
    if (m.chance !== 0 && maxLimit === 1) explicit.push(m);
    else equal.push(m);
  }
  return { explicit, equal };
}

/** Fisher–Yates via injected rng. Cite: RollOne std::shuffle ~214, ~247. */
function shuffleInPlace<T>(arr: T[], rng: Rng): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}

type ChanceGuid = { guid: number; chance: number };

/** Generic RollOne over chance-bearing members. Cite: PoolGroup::RollOne PoolManager.cpp:196-266. */
function rollOneGuid(
  members: readonly ChanceGuid[],
  maxLimit: number,
  isSpawned: (guid: number) => boolean,
  rng: Rng,
  triggerFrom = 0,
): ChanceGuid | undefined {
  const explicit: ChanceGuid[] = [];
  const equal: ChanceGuid[] = [];
  for (const m of members) {
    if (m.chance !== 0 && maxLimit === 1) explicit.push(m);
    else equal.push(m);
  }

  let explicitlyObjFound: ChanceGuid | undefined;

  if (explicit.length > 0) {
    const order = explicit.slice();
    shuffleInPlace(order, rng);
    // rand_chance() → float 0..100
    const roll = rng.next() * 100;
    for (const obj of order) {
      if (obj.guid !== triggerFrom && isSpawned(obj.guid)) continue;
      if (!explicitlyObjFound) explicitlyObjFound = obj;
      if (roll < obj.chance) return obj;
    }
  }

  if (equal.length > 0) {
    const order = equal.slice();
    shuffleInPlace(order, rng);
    for (const obj of order) {
      if (obj.guid !== triggerFrom && isSpawned(obj.guid)) continue;
      return obj;
    }
  }

  return explicitlyObjFound;
}

// Pure RollOne: pick one unspawned pool member. The explicit branch rolls 0..100 against each shuffled
// candidate's chance and falls back to the equal-chance list; the equal branch shuffles and takes one.
export function rollPoolSpawn(
  pool: PoolTemplate,
  members: readonly PoolCreature[],
  state: PoolSpawnState,
  rng: Rng,
): PoolCreature | undefined {
  if (remainingSpawnSlots(pool, state) <= 0) return undefined;

  const spawned = asSet(state.spawned);
  const poolMembers = members.filter((m) => m.poolId === pool.poolId);
  const pick = rollOneGuid(
    poolMembers,
    pool.maxLimit,
    (g) => spawned.has(g),
    rng,
  );
  if (!pick) return undefined;
  return poolMembers.find((m) => m.guid === pick.guid);
}

// "Is the rare up?" — true when any rare member guid is currently spawned. Used by world sim / UI; pure
// read of pool state.
export function isRareUp(
  members: readonly PoolCreature[],
  state: PoolSpawnState,
): boolean {
  const spawned = asSet(state.spawned);
  for (const m of members) {
    if (m.rare && spawned.has(m.guid)) return true;
  }
  return false;
}

// Fill a pool up to maxLimit with successive RollOne picks, returning the newly chosen guids without
// mutating state. The loop always runs `count` times, even when a roll returns null.
export function populatePool(
  pool: PoolTemplate,
  members: readonly PoolCreature[],
  state: PoolSpawnState,
  rng: Rng,
): number[] {
  const spawned = asSet(state.spawned);
  const added: number[] = [];
  const count = Math.max(0, pool.maxLimit - spawned.size);
  for (let i = 0; i < count; i++) {
    const pick = rollPoolSpawn(
      pool,
      members,
      { spawned: new Set([...spawned, ...added]) },
      rng,
    );
    if (!pick) continue;
    added.push(pick.guid);
  }
  return added;
}

// ---- Baked pool_template / pool_creature rows (P-now spawn driver) ---------

// Shape of one `DataBundle.pools[]` row (pool_template + members bake). `members[].guid` is the pool object
// key (creature/GO guid in CMaNGOS).
export interface BakedPoolRow {
  id: number;
  maxLimit: number;
  description?: string;
  members: Array<{ guid: number; chance: number; description?: string }>;
}

/** Convert a baked pool row into PoolTemplate + PoolCreature[] for rollPoolSpawn. */
export function fromBakedPool(row: BakedPoolRow): {
  template: PoolTemplate;
  members: PoolCreature[];
} {
  return {
    template: {
      poolId: row.id,
      maxLimit: row.maxLimit,
      description: row.description,
    },
    members: row.members.map((m) => ({
      poolId: row.id,
      guid: m.guid,
      chance: m.chance,
    })),
  };
}

// Roll one spawn from a baked pool id-shaped row (prefer this over "first member"). Cite:
// PoolGroup::RollOne — explicit chance when maxLimit==1, else equal-chance.
export function rollFromBakedPool(
  row: BakedPoolRow,
  state: PoolSpawnState,
  rng: Rng,
): PoolCreature | undefined {
  const { template, members } = fromBakedPool(row);
  return rollPoolSpawn(template, members, state, rng);
}

/** Fill a baked pool up to maxLimit; returns newly chosen guids. */
export function populateFromBakedPool(
  row: BakedPoolRow,
  state: PoolSpawnState,
  rng: Rng,
): number[] {
  const { template, members } = fromBakedPool(row);
  return populatePool(template, members, state, rng);
}

// ---- Nested pool_pool recursion ---------------------------------------------

// Leaf object kind for SpawnPool group order. Cite: SpawnPool Pool→GameObject→Creature
// (PoolManager.cpp:1087-1092).
export type PoolObjectKind = 'creature' | 'gameobject';

/** pool_creature / pool_gameobject member with kind. Cite: PoolObject.guid. */
export interface PoolObjectMember {
  poolId: number;
  guid: number;
  chance: number;
  kind: PoolObjectKind;
}

// pool_pool row: child pool is a member of mother. Cite: LoadFromDB SELECT pool_id, mother_pool, chance
// (PoolManager.cpp:927-979).
export interface PoolPoolLink {
  motherPoolId: number;
  /** Child pool id — stored as PoolObject.guid in PoolGroup<Pool>. */
  childPoolId: number;
  chance: number;
}

// Instance spawn state. Cite: SpawnedPoolData (PoolManager.h:67-94, .cpp:35-108). `poolCounts` key presence
// = IsSpawnedObject<Pool>; value = GetSpawnedObjects count.
export interface SpawnedPoolData {
  creatures: Set<number>;
  gameobjects: Set<number>;
  /** poolId → count of members spawned into that pool. */
  poolCounts: Map<number, number>;
}

export function createSpawnedPoolData(): SpawnedPoolData {
  return {
    creatures: new Set(),
    gameobjects: new Set(),
    poolCounts: new Map(),
  };
}

/** Cite: SpawnedPoolData::GetSpawnedObjects (PoolManager.cpp:35-39). */
export function getSpawnedObjects(state: SpawnedPoolData, poolId: number): number {
  return state.poolCounts.get(poolId) ?? 0;
}

/** Cite: IsSpawnedObject<Pool> — key present in mSpawnedPools (PoolManager.cpp:57-60). */
export function isSpawnedChildPool(state: SpawnedPoolData, poolId: number): boolean {
  return state.poolCounts.has(poolId);
}

/** Cite: AddSpawn<Creature> (PoolManager.cpp:63-67). */
function addSpawnCreature(state: SpawnedPoolData, guid: number, poolId: number): void {
  state.creatures.add(guid);
  state.poolCounts.set(poolId, getSpawnedObjects(state, poolId) + 1);
}

/** Cite: AddSpawn<GameObject> (PoolManager.cpp:70-74). */
function addSpawnGameobject(state: SpawnedPoolData, guid: number, poolId: number): void {
  state.gameobjects.add(guid);
  state.poolCounts.set(poolId, getSpawnedObjects(state, poolId) + 1);
}

// Cite: AddSpawn<Pool> (PoolManager.cpp:77-81) — mSpawnedPools[sub_pool_id] = 0; ++mSpawnedPools[pool_id].
function addSpawnChildPool(
  state: SpawnedPoolData,
  childPoolId: number,
  motherPoolId: number,
): void {
  state.poolCounts.set(childPoolId, 0);
  state.poolCounts.set(motherPoolId, getSpawnedObjects(state, motherPoolId) + 1);
}

/** Static pool definitions for one world/dungeon roll. */
export interface PoolCatalog {
  templates: readonly PoolTemplate[];
  objects: readonly PoolObjectMember[];
  poolLinks: readonly PoolPoolLink[];
}

interface IndexedPools {
  templates: Map<number, PoolTemplate>;
  creatures: Map<number, ChanceGuid[]>;
  gameobjects: Map<number, ChanceGuid[]>;
  childPools: Map<number, ChanceGuid[]>;
  /** pool ids that appear as pool_pool children (AutoSpawn=false). Cite: :984. */
  childOfMother: Set<number>;
}

function indexCatalog(catalog: PoolCatalog): IndexedPools {
  const templates = new Map<number, PoolTemplate>();
  for (const t of catalog.templates) templates.set(t.poolId, t);

  const creatures = new Map<number, ChanceGuid[]>();
  const gameobjects = new Map<number, ChanceGuid[]>();
  for (const m of catalog.objects) {
    const bucket = m.kind === 'creature' ? creatures : gameobjects;
    let list = bucket.get(m.poolId);
    if (!list) {
      list = [];
      bucket.set(m.poolId, list);
    }
    list.push({ guid: m.guid, chance: m.chance });
  }

  const childPools = new Map<number, ChanceGuid[]>();
  const childOfMother = new Set<number>();
  for (const link of catalog.poolLinks) {
    if (link.motherPoolId === link.childPoolId) continue; // Cite: self-link skip :961-964
    childOfMother.add(link.childPoolId);
    let list = childPools.get(link.motherPoolId);
    if (!list) {
      list = [];
      childPools.set(link.motherPoolId, list);
    }
    list.push({ guid: link.childPoolId, chance: link.chance });
  }

  return { templates, creatures, gameobjects, childPools, childOfMother };
}

// Pools that auto-spawn at instance init (not a pool_pool child). Cite: AutoSpawn default true at load,
// false when listed as child (:642, :984); Initialize only AutoSpawn (:1050-1056).
export function autoSpawnPoolIds(catalog: PoolCatalog): number[] {
  const idx = indexCatalog(catalog);
  const ids: number[] = [];
  for (const id of idx.templates.keys()) {
    if (!idx.childOfMother.has(id)) ids.push(id);
  }
  return ids;
}

// SpawnObject for one PoolGroup — creature, gameobject or pool. triggerFrom is omitted, since this
// version has no respawn re-roll. Cite: PoolGroup::SpawnObject (PoolManager.cpp:391-438).
function spawnObjectGroup(
  state: SpawnedPoolData,
  poolId: number,
  maxLimit: number,
  members: readonly ChanceGuid[],
  isSpawned: (guid: number) => boolean,
  onSpawn: (guid: number) => void,
  rng: Rng,
): void {
  if (members.length === 0) return;
  // Cite: int count = limit - spawns.GetSpawnedObjects(poolId); (:396)
  const count = maxLimit - getSpawnedObjects(state, poolId);
  // Cite: for (int i = 0; i < count; ++i) (:410) — always count iterations
  for (let i = 0; i < count; i++) {
    const obj = rollOneGuid(members, maxLimit, isSpawned, rng, 0);
    if (!obj) continue;
    onSpawn(obj.guid);
  }
}

// Spawn one pool: child pools first, then gameobjects, then creatures. `stack` breaks a malformed
// pool_pool cycle, which CMaNGOS instead removes at load time.
export function spawnPool(
  catalog: PoolCatalog,
  poolId: number,
  state: SpawnedPoolData,
  rng: Rng,
  stack: Set<number> = new Set(),
  index: IndexedPools = indexCatalog(catalog),
): void {
  if (stack.has(poolId)) return;
  const template = index.templates.get(poolId);
  if (!template) return;

  stack.add(poolId);

  const maxLimit = template.maxLimit;

  // SpawnPoolGroup<Pool>
  const children = index.childPools.get(poolId) ?? [];
  spawnObjectGroup(
    state,
    poolId,
    maxLimit,
    children,
    (id) => isSpawnedChildPool(state, id),
    (childId) => {
      addSpawnChildPool(state, childId, poolId);
      spawnPool(catalog, childId, state, rng, stack, index);
    },
    rng,
  );

  // SpawnPoolGroup<GameObject>
  const gos = index.gameobjects.get(poolId) ?? [];
  spawnObjectGroup(
    state,
    poolId,
    maxLimit,
    gos,
    (guid) => state.gameobjects.has(guid),
    (guid) => addSpawnGameobject(state, guid, poolId),
    rng,
  );

  // SpawnPoolGroup<Creature>
  const creatures = index.creatures.get(poolId) ?? [];
  spawnObjectGroup(
    state,
    poolId,
    maxLimit,
    creatures,
    (guid) => state.creatures.has(guid),
    (guid) => addSpawnCreature(state, guid, poolId),
    rng,
  );

  stack.delete(poolId);
}

// Fresh instance: spawn every AutoSpawn pool once into `state`, which the caller keeps for the
// instance lifetime. Cite: PoolManager::Initialize; MapPersistentState::InitPools, once per state.
export function initializeInstancePools(
  catalog: PoolCatalog,
  state: SpawnedPoolData,
  rng: Rng,
): void {
  const index = indexCatalog(catalog);
  for (const poolId of index.templates.keys()) {
    if (index.childOfMother.has(poolId)) continue;
    spawnPool(catalog, poolId, state, rng, new Set(), index);
  }
}

// Convenience: empty state + initializeInstancePools. Roll once per instance run; reuse the returned state
// on every read.
export function rollInstancePools(
  catalog: PoolCatalog,
  rng: Rng,
): SpawnedPoolData {
  const state = createSpawnedPoolData();
  initializeInstancePools(catalog, state, rng);
  return state;
}

/** Leaf guids currently spawned (pin gating helper). */
export function spawnedLeafGuids(state: SpawnedPoolData): {
  creatures: number[];
  gameobjects: number[];
} {
  return {
    creatures: [...state.creatures],
    gameobjects: [...state.gameobjects],
  };
}
