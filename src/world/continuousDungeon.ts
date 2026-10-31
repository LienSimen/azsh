// The continuous dungeon party world: walk on nav, live DB spawns, and a player-driven pull. The live
// controller must drive this module; the instant hop and auto-chain are dead.

/** Product policy — live UI and probes assert these stay false. */
export const CONTINUOUS_PRODUCT = {
  autoPullOnEnter: false,
  autoChainAfterKill: false,
  hopOnTravel: false,
} as const;

import {
  isDungeonNpcSpawn,
  type DungeonSpawn,
} from '../data/dungeonSpawns.ts';
import { spawnsForInstanceWing } from './dungeonWingRooms.ts';
import { getCreatureAttackDistance } from '../domain/creature/creatureAggro.ts';
import { AGGRO_LEVEL_DIFF_CAP, DEFAULT_DETECTION_RANGE } from '../domain/creature/creatureAiConstants.ts';
import {
  createNearGrid,
  getNear,
  nearClear,
  nearGet,
  nearInsert,
  nearMove,
  nearRemove,
  type NearGrid,
} from './nearGrid.ts';
import {
  findPathForMap,
  isSwimPointForMap,
  isWalkablePointForMap,
  pathLength,
  connectedFloorZForMap,
  floorZForMap,
  SWIM_STEP_COST,
  Z_HINT_TOL,
  type NavPos,
} from '../domain/nav/nav.ts';
// Not on the barrel; `pathEditorView.ts` and `walkSurface.ts` import the mesh leaf the same way.
import { followPathNavMesh, navMeshForMap, snapOntoNavMesh } from '../domain/nav/navmesh.ts';
import type { EncounterDef } from '../data/schema/encounter.ts';
import { entranceWorld, type WorldPos } from './dungeonRouteGeometry.ts';
import { floorGauntletWaves, hasFlag, requiredFlags, type InstanceRun } from './instances.ts';
import { filterSpawnsByPoolRoll, type DungeonPoolRoll } from './rareRoll.ts';
import { STOREY_DZ_YD } from '../domain/nav/storey.ts';

/** Same radius as the dest snap in liveDungeonController. */
const ENTRANCE_SNAP_YD = 20;

/** First finite z stamp on a path (findPathStack); overview paths leave z unset. */
export function pathFloorHint(path: readonly NavPos[]): number | undefined {
  for (let i = 0; i < path.length; i++) {
    const z = path[i]!.z;
    if (z != null && Number.isFinite(z)) return z;
  }
  return undefined;
}

// The floor z for one step. A route stamp beats the sticky previous z, since once latched wrong the
// stacked read re-picks that storey every tick. Null keeps the prior z and never invents one.
export function partyFloorZ(
  x: number,
  y: number,
  prevZ: number | undefined,
  pathZ?: number,
  mapId?: number,
): number | null {
  // The route z is the z of the waypoint being walked TOWARD, so hinting the resolver with it adopts
  // the destination's storey on the FIRST step. Ask for the floor the party STANDS on instead.
  if (mapId != null && prevZ != null) {
    const cz = connectedFloorZForMap(mapId, x, y, prevZ, pathZ);
    if (cz != null) return cz;
  }
  const hint = pathZ ?? prevZ;
  // The mesh keeps stacked floors as separate polys. With no map id there is nothing
  // registered to ask — the raster tier that used to answer that case is gone (E7.6).
  const z = mapId != null ? floorZForMap(mapId, x, y, hint) : null;
  if (z == null || pathZ == null) return z;
  return Math.abs(z - pathZ) > Z_HINT_TOL ? pathZ : z;
}

/** Snap start onto the mesh; nothing near → keep raw (never invent a far floor). */
function snapStartToNav(mapId: number, start: WorldPos): WorldPos {
  // Any registered surface calling this floor keeps the authored entrance; `null` is nothing
  // registered at all (navRegistry.ts isWalkablePointForMap), which is also "not ours to judge".
  if (isWalkablePointForMap(mapId, start.x, start.y) !== false) return start;
  const mesh = navMeshForMap(mapId);
  const s = mesh ? snapOntoNavMesh(mesh, start.x, start.y, start.z, ENTRANCE_SNAP_YD) : null;
  if (!s) return start;
  const hz = (start.z != null ? connectedFloorZForMap(mapId, s.x, s.y, start.z) : null)
    ?? floorZForMap(mapId, s.x, s.y, start.z);
  return { x: s.x, y: s.y, z: hz ?? start.z };
}

export type ContinuousEntityState = 'alive' | 'engaged' | 'dead' | 'skipped';

export type ContinuousEntity = {
  guid: number;
  entry: number;
  // The party SEAT this body is, absent on every DB spawn. The party was not in the world at all: a
  // mob was a body in the near grid while we were one coordinate plus a session.
  party?: string;
  x: number;
  y: number;
  z?: number;
  /** Facing from SET_FACING / MOVE_TO. Cite: ScriptMgr.cpp:2757–2776 / :1829–1874. */
  o?: number;
  // WHERE THIS BODY STOOD WHEN THE PULL OPENED, stamped once on engage. The live coordinates used to
  // mean both "where it is" and "where it was", which blocked the fight write-back entirely.
  homeX?: number;
  homeY?: number;
  homeZ?: number;
  state: ContinuousEntityState;
  /** creature_template Detection when known; else default. */
  detectionRange: number;
  /** Midpoint of creature min/max level when known; else default for GetAttackDistance. */
  level: number;
  /** MovementType from bake (2 = waypoint patrol). */
  movementType: number;
  npcFlags: number;
  /** Live SetDefaultGossipMenuId override; unset = template gossipMenuId. */
  gossipMenuId?: number;
  // Faction reaction below unfriendly toward the player. A critter or a friendly service NPC is false
  // and never aggros or pulls, but still lives on the floor for paint.
  hostile: boolean;
  /** True when walking (not running). Cite: ScriptMgr.cpp:2439–2456 SET_RUN. */
  walking?: boolean;
  /** Waypoint pause. Cite: ScriptMgr.cpp:2684–2692 PAUSE_WAYPOINTS. */
  waypointsPaused?: boolean;
  // How far this body's patrol clock is BEHIND the run's elapsed time, because it was paused. The C++
  // holds the body where it stands and resumes from THERE, and the pose is a function of elapsed time.
  waypointPauseMs?: number;
  waypointPausedAtMs?: number;
  /** DESPAWN_SELF delay>0 pending ms — no ticker. Cite: ScriptMgr.cpp:2237–2250. */
  despawnDelay?: number;
  /** UNIT_FIELD_MOUNTDISPLAYID. Cite: Unit.cpp:7748 Mount; ScriptMgr.cpp:2409–2437. */
  mounted?: boolean;
  mountDisplayId?: number;
  mountCreatureId?: number;
};

export type ContinuousWorld = {
  instanceId: string;
  mapId: number;
  party: WorldPos;
  entities: ContinuousEntity[];
  // The party rows inside the entity list, by reference — an INDEX, not a second store. Re-filtering a
  // 1,120-row wing every controller tick to find at most 41 bodies is the cost this avoids.
  partyBodies?: ContinuousEntity[];
  /** Cumulative yards walked via pathfind steps (never hop). */
  walkedYd: number;
  /** True only if a hop/teleport API was invoked — continuous path keeps this false. */
  hopUsed: boolean;
  /** Guids that received clear credit (kill). Skip does not add here. */
  clearedGuids: number[];
  /** Active move path (world waypoints); mutated by tickWalk. */
  movePath: NavPos[];
  /** Last ordered destination — kept even when A* found no corridor, so tickWalk can slide. */
  moveDest?: { x: number; y: number };
  /** Currently engaged guids (combat in place). */
  engagedGuids: number[];
  /** 8 yd instance grid (recoil-scale C3). Built lazily; query via floorBodiesNear. */
  near?: NearGrid<ContinuousEntity>;
  /** `entities.length` last time the tail was indexed. */
  nearIndexed?: number;
  /** Max template Detection seen while indexing — sizes the aggro query. */
  maxDetectionYd?: number;
};

export type CreateContinuousOpts = {
  instanceId: string;
  mapId: number;
  /** Override entrance (default: areatrigger entrance for instance). */
  start?: WorldPos | null;
  /** Include service NPCs (npcFlags ≠ 0). Default false — combat trash only. */
  includeNpcs?: boolean;
  // The faction reaction gate, threaded in from the caller that holds the data store so this pure layer
  // does not import it. Absent, a service NPC is non-hostile and trash stays hostile.
  isHostile?: (entry: number) => boolean;
  /** Filter spawns (e.g. on-walk only). Default: all map spawns. */
  spawns?: readonly DungeonSpawn[];
  /** Guids already killed this run — restored dead so a re-mount does not resurrect them. */
  clearedGuids?: readonly number[];
  // The once-per-run pool roll: a losing pool member stays off the floor while a winning substitute
  // spawns. Absent means no pool filter. Cite: MapPersistentStateMgr.cpp InitPools ~198-207.
  poolRoll?: DungeonPoolRoll;
  /** See LiveEntitiesFromSpawnsOpts.skipEntry. */
  skipEntry?: (entry: number) => boolean;
  // The party seats that get a floor body. Absent is the player alone, which is the stand every reader
  // already measures to; the live controller passes its real squad.
  partySides?: readonly string[];
};

export type LiveEntitiesFromSpawnsOpts = {
  includeNpcs?: boolean;
  /** See CreateContinuousOpts.isHostile. */
  isHostile?: (entry: number) => boolean;
  // Entries with no floor body at all — the script triggers, whose template the caller reads. One is
  // invisible in Classic; here it stood in a boss chamber with a health bar.
  skipEntry?: (entry: number) => boolean;
};

/** Default hostility when no faction lookup is threaded in. */
function defaultHostile(npcFlags: number): boolean {
  // Service / questgiver / vendor rows are talk targets — nearestTalkableNpc skips hostile.
  return (npcFlags | 0) === 0;
}

/** Hostile / trash spawns as floor entities at DB coordinates. */
export function liveEntitiesFromSpawns(
  spawns: readonly DungeonSpawn[],
  opts?: LiveEntitiesFromSpawnsOpts,
): ContinuousEntity[] {
  const out: ContinuousEntity[] = [];
  for (const s of spawns) {
    if (!opts?.includeNpcs && isDungeonNpcSpawn(s)) continue;
    if (opts?.skipEntry?.(s.entry)) continue;
    const npcFlags = s.npcFlags ?? 0;
    out.push({
      guid: s.guid,
      entry: s.entry,
      x: s.x,
      y: s.y,
      z: s.z,
      state: 'alive',
      detectionRange: DEFAULT_DETECTION_RANGE,
      level: 18,
      movementType: s.MovementType | 0,
      npcFlags,
      // Cite: domain/creature/faction.ts isHostileCreature (caller-supplied); npcFlags fallback.
      hostile: opts?.isHostile ? opts.isHostile(s.entry) : defaultHostile(npcFlags),
    });
  }
  return out;
}

/** Open a continuous instance world: party at entrance, every combat spawn on the floor. */
export function createContinuousWorld(opts: CreateContinuousOpts): ContinuousWorld {
  const rawStart =
    opts.start
    ?? entranceWorld(opts.instanceId)
    ?? { x: 0, y: 0 };
  const start = snapStartToNav(opts.mapId, rawStart);
  // Shared mapIds (SM/BRS/DM/Strat) filter to this wing's rooms; opts.spawns still wins.
  const base = opts.spawns ?? spawnsForInstanceWing(opts.instanceId, opts.mapId);
  // Pool losers never spawn; winners (rare or equal-chance substitute) do.
  const raw = opts.poolRoll ? filterSpawnsByPoolRoll(base, opts.poolRoll) : base;
  const entities = liveEntitiesFromSpawns(raw, {
    includeNpcs: opts.includeNpcs,
    isHostile: opts.isHostile,
    skipEntry: opts.skipEntry,
  });
  // Restore prior kills. The floor is rebuilt from the spawn bake on every mount, so without
  // this a Continue after a wipe handed back a full dungeon.
  const cleared = opts.clearedGuids?.length ? new Set(opts.clearedGuids) : null;
  if (cleared) {
    for (const e of entities) if (cleared.has(e.guid)) e.state = 'dead';
  }
  // THE PARTY IS IN THE WORLD: one row per seat, appended before any grid exists so the grid indexes
  // them with the tail. Placing them here would force the whole wing to index at open for nothing.
  const partyBodies = partyFloorBodies(opts.partySides ?? DEFAULT_PARTY_SIDES, start);
  for (const p of partyBodies) entities.push(p);
  // The party point IS the player's row, the same object. Aliasing is the collapse the phase asked for,
  // with no accessor and no sweep. A roster with no player seat keeps the plain point.
  const playerBody = partyBodies.find((e) => e.party === 'player');
  return {
    instanceId: opts.instanceId,
    mapId: opts.mapId,
    party: playerBody ?? { x: start.x, y: start.y, z: start.z },
    entities,
    partyBodies,
    walkedYd: 0,
    hopUsed: false,
    clearedGuids: cleared ? [...cleared] : [],
    movePath: [],
    engagedGuids: [],
  };
}

// A stable floor guid for an encounter the world DB never spawns. Negative so it cannot collide with a
// real guid, and derived from the id so the cleared set still matches after a re-mount.
export function summonedBodyGuid(encounterId: string): number {
  let h = 2166136261;
  for (let i = 0; i < encounterId.length; i++) {
    h ^= encounterId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return -(1 + ((h >>> 0) % 0x7fffffff));
}

/** Body key for a death-script summon whose summoner was not a route encounter. */
export function deathSummonKey(fromGuid: number, creatureEntry: number): string {
  return `death-summon#${fromGuid | 0}#${creatureEntry | 0}`;
}

/** The seat that owns the party point when no roster is threaded in. */
const DEFAULT_PARTY_SIDES: readonly string[] = ['player'];

/** Stable floor guid for a party seat. Negative, like every other body the DB never spawns. */
export function partyBodyGuid(side: string): number {
  return summonedBodyGuid(`party#${side}`);
}

// ONE FLOOR BODY PER PARTY SEAT. A party row has no entry, is not hostile and has no flags, which is
// what makes this additive: every floor reader is already keyed on one of those.
function partyFloorBodies(
  sides: readonly string[],
  at: { x: number; y: number; z?: number },
): ContinuousEntity[] {
  const out: ContinuousEntity[] = [];
  for (const side of sides) {
    out.push({
      guid: partyBodyGuid(side),
      entry: 0,
      party: side,
      x: at.x,
      y: at.y,
      ...(at.z != null ? { z: at.z } : {}),
      state: 'alive',
      detectionRange: 0,
      level: 0,
      movementType: 0,
      npcFlags: 0,
      hostile: false,
    });
  }
  return out;
}

// Move every party body to one point — a teleport, a regroup or a walk step — through the placer, which
// REINDEXES. This also moves the party point, because the player's row IS that point.
export function placePartyBodies(
  world: ContinuousWorld,
  x: number,
  y: number,
  z?: number,
): boolean {
  const bodies = world.partyBodies;
  if (!bodies || bodies.length === 0) return false;
  for (const e of bodies) placeFloorBody(world, e, x, y, z);
  return true;
}

// The party point and the bodies standing on it, moved in one statement. The plain assignment is the
// NO-ROWS case only: with rows the point IS the player's row, and a fresh object breaks the aliasing.
function stepPartyTo(world: ContinuousWorld, x: number, y: number, z: number | undefined): void {
  if (placePartyBodies(world, x, y, z)) return;
  world.party = { x, y, z };
}

// Inject the quest-end script's temp-spawn bodies onto the free-walk floor, at the absolute map yards
// the baked rows carry. Idempotent per quest, creature and index, and friendly ambient by default.
export function injectQuestEndTempSpawns(
  world: ContinuousWorld,
  questEntry: number,
  spawns: ReadonlyArray<{
    creatureEntry: number;
    x: number;
    y: number;
    z?: number;
    o?: number;
  }>,
  opts?: {
    /** When true (default), bodies are non-hostile ambient. */
    friendly?: boolean;
    level?: number;
    detectionRange?: number;
    npcFlags?: number;
  },
): ContinuousEntity[] {
  const friendly = opts?.friendly !== false;
  const created: ContinuousEntity[] = [];
  for (let i = 0; i < spawns.length; i++) {
    const sp = spawns[i]!;
    const entry = sp.creatureEntry | 0;
    if (!(entry > 0)) continue;
    const guid = summonedBodyGuid(`quest-end-${questEntry | 0}#${entry}#${i}`);
    // Idempotent per script row index — batch mates may sit <10 yd apart (7461 spirits).
    if (world.entities.some((e) => e.guid === guid)) continue;
    const ent: ContinuousEntity = {
      guid,
      entry,
      x: sp.x,
      y: sp.y,
      z: sp.z,
      state: 'alive',
      detectionRange: opts?.detectionRange ?? 0,
      level: opts?.level ?? 56,
      movementType: 0,
      npcFlags: opts?.npcFlags ?? 0,
      hostile: !friendly,
    };
    world.entities.push(ent);
    created.push(ent);
  }
  return created;
}

/** The summoned body for this encounter if it is on the floor — `[]` when it is not. */
export function summonedBodyGuids(
  world: ContinuousWorld,
  encounter: { id: string; spawnGuids?: readonly number[] },
): number[] {
  if (encounter.spawnGuids?.length) return [];
  const guid = summonedBodyGuid(encounter.id);
  return world.entities.some((e) => e.guid === guid) ? [guid] : [];
}

// Put a body on the floor for every boss the spawn bake cannot: 32 of 212 boss encounters have no
// creature row, so free-walk left them unfightable AND unclearable. The gate is every required flag.
export function spawnUnlockedBodies(
  world: ContinuousWorld,
  encounters: readonly EncounterDef[],
  run: InstanceRun,
  isQuestOpen?: (questId: number) => boolean,
): ContinuousEntity[] {
  const cleared = new Set(world.clearedGuids);
  const added: ContinuousEntity[] = [];
  for (const enc of encounters) {
    if (enc.kind !== 'boss' || enc.spawnGuids?.length) continue;
    const entry = enc.creatureEntry ?? 0;
    // Path-dependent summons (Strat Malown) stamp run.encounterOrigins at gate complete.
    const o = run.encounterOrigins?.[enc.id] ?? enc.origin;
    if (!(entry > 0) || !o || !Number.isFinite(o.x) || !Number.isFinite(o.y)) continue;
    // Same quest gate the auto-route obeys (questBlockReason): a startQuestId body
    // (Gor'shak jail 9398) must not appear at mount before the quest is in the log.
    if (enc.startQuestId && isQuestOpen && !isQuestOpen(enc.startQuestId)) continue;
    const need = requiredFlags(enc);
    const waves = floorGauntletWaves(enc);
    const selfWave = !!waves && waves.length === 1
      && waves[0]!.every((m) => m.entry === enc.creatureEntry);
    // Gauntlet owns multi-wave (adds first) and flag-gated self-wave (Kirtonos 5s after brazier).
    // A body here made tickGauntlet abort on need.length + existing summonedBodyGuid.
    if (waves && (!selfWave || need.length)) continue;
    if (need.some((f) => !hasFlag(run, f))) continue;
    // One body per entry. Emberseer 9816 already stands as guid 2290394 from the spawn
    // bake; synthesizing summonedBodyGuid beside him is a second Pyroguard.
    if (world.entities.some((e) => e.entry === entry)) continue;
    const guid = summonedBodyGuid(enc.id);
    if (world.entities.some((e) => e.guid === guid)) continue;
    const ent: ContinuousEntity = {
      guid,
      entry,
      x: o.x,
      y: o.y,
      ...(o.z != null && Number.isFinite(o.z) ? { z: o.z } : {}),
      state: cleared.has(guid) ? 'dead' : 'alive',
      detectionRange: DEFAULT_DETECTION_RANGE,
      level: 18,
      movementType: 0,
      npcFlags: 0,
      // Emberseer stands UNINTERACTIBLE from Reset (boss_pyroguard_emberseer.cpp:79-80)
      // until 20 Growing stacks. Other synthesized bosses are live on spawn.
      hostile: !selfWave,
    };
    world.entities.push(ent);
    if (ent.state === 'alive') added.push(ent);
  }
  // ScriptDev GO-use queue (postmen / Malown) with authored coords → floor bodies.
  // Idempotent by guid; leaves the queue on the run (resume-safe without clearing).
  added.push(...injectScriptPendingSummons(world, run));
  return added;
}

// Materialise the run's pending script summons that carry coordinates onto the floor. A row without
// them is skipped, since the combat inject is a separate surface. Cite: stratholmeScripts.cpp:110.
export function injectScriptPendingSummons(
  world: ContinuousWorld,
  run: InstanceRun,
): ContinuousEntity[] {
  const pending = run.scriptPendingSummons;
  if (!pending?.length) return [];
  const cleared = new Set(world.clearedGuids);
  const added: ContinuousEntity[] = [];
  for (let rowIdx = 0; rowIdx < pending.length; rowIdx++) {
    const row = pending[rowIdx]!;
    const entry = row.creatureEntry | 0;
    const count = row.count | 0;
    if (!(entry > 0) || !(count > 0)) continue;
    if (row.x == null || row.y == null || !Number.isFinite(row.x) || !Number.isFinite(row.y)) {
      continue;
    }
    for (let i = 0; i < count; i++) {
      const guid =
        row.encounterId && i === 0
          ? summonedBodyGuid(row.encounterId)
          : summonedBodyGuid(`script-pending#${rowIdx}.${entry}.${i}`);
      if (world.entities.some((e) => e.guid === guid)) continue;
      // Postmen: GetRandomPoint radius 3.0f about the box. Cite: stratholmeScripts.cpp:118-122.
      const ang = (i * 2.399963) % (2 * Math.PI);
      const r = row.encounterId && i === 0 ? 0 : count > 1 ? 3 : 0;
      const ent: ContinuousEntity = {
        guid,
        entry,
        x: row.x + r * Math.cos(ang),
        y: row.y + r * Math.sin(ang),
        ...(row.z != null && Number.isFinite(row.z) ? { z: row.z } : {}),
        state: cleared.has(guid) ? 'dead' : 'alive',
        detectionRange: DEFAULT_DETECTION_RANGE,
        level: 18,
        movementType: 0,
        npcFlags: 0,
        hostile: true,
      };
      world.entities.push(ent);
      if (ent.state === 'alive') added.push(ent);
    }
  }
  return added;
}

// Put one gauntlet wave on the floor. A standing friendly body of a wave entry is CLAIMED, as the C++
// flips its faction; a missing member is synthesized at the spawn point with a small deterministic jitter.
export function spawnGauntletWave(
  world: ContinuousWorld,
  enc: EncounterDef,
  wave: readonly { entry: number; count: number }[],
  phase: number,
  isFinal: boolean,
  spawnAt?: { x: number; y: number; z?: number },
  claimMaxYd?: number,
): { claimed: ContinuousEntity[]; created: ContinuousEntity[] } {
  const cleared = new Set(world.clearedGuids);
  const o = spawnAt ?? enc.origin;
  const claimed: ContinuousEntity[] = [];
  const created: ContinuousEntity[] = [];
  let memberIdx = 0;
  for (const m of wave) {
    if (!(m.entry > 0)) continue;
    for (let i = 0; i < Math.max(1, m.count | 0); i++, memberIdx++) {
      // Claim the NEAREST standing non-hostile body of this entry, capped to the same room: a
      // whole-map nearest plus an aggro sweep is a far pull. Default 48; Rajaxx passes 200.
      const CLAIM_MAX_YD = claimMaxYd ?? 48;
      const candidates = world.entities
        .filter((e) => {
          if (e.entry !== m.entry || e.state !== 'alive') return false;
          // Standing event actors (Emberseer grow) may already be hostile from the floor
          // applier on the same tick — still claim, or the wave synthesizes a second body.
          if (e.hostile && m.entry !== enc.creatureEntry) return false;
          if (!o) return true;
          return Math.hypot(e.x - o.x, e.y - o.y) <= CLAIM_MAX_YD;
        })
        .sort((a, b) =>
          (o ? Math.hypot(a.x - o.x, a.y - o.y) - Math.hypot(b.x - o.x, b.y - o.y) : 0));
      const claimable = candidates.find((e) => !claimed.includes(e));
      if (claimable) {
        claimed.push(claimable);
        continue;
      }
      if (!o || !Number.isFinite(o.x) || !Number.isFinite(o.y)) continue;
      const guid = isFinal && m.entry === enc.creatureEntry && i === 0
        ? summonedBodyGuid(enc.id)
        : summonedBodyGuid(`${enc.id}#w${phase}.${memberIdx}`);
      if (world.entities.some((e) => e.guid === guid)) continue;
      const ang = (memberIdx * 2.399963) % (2 * Math.PI); // golden-angle fan, deterministic
      const r = memberIdx === 0 ? 0 : 2;
      const ent: ContinuousEntity = {
        guid,
        entry: m.entry,
        x: o.x + r * Math.cos(ang),
        y: o.y + r * Math.sin(ang),
        ...(o.z != null && Number.isFinite(o.z) ? { z: o.z } : {}),
        state: cleared.has(guid) ? 'dead' : 'alive',
        detectionRange: DEFAULT_DETECTION_RANGE,
        level: 18,
        movementType: 0,
        npcFlags: 0,
        hostile: true,
      };
      world.entities.push(ent);
      if (ent.state === 'alive') created.push(ent);
    }
  }
  return { claimed, created };
}

// Yards between the party and a point, 3-D when both ends have a z. The server's own default is 3-D,
// and planar makes every range an infinite cylinder — 60.6% of Blackrock Spire pairs are cross-storey.
export function partyDistTo(
  world: ContinuousWorld,
  x: number,
  y: number,
  z?: number,
): number {
  const planar = Math.hypot(world.party.x - x, world.party.y - y);
  const pz = world.party.z;
  if (z == null || pz == null || !Number.isFinite(z) || !Number.isFinite(pz)) return planar;
  const dz = Math.abs(pz - z);
  if (dz <= STOREY_DZ_YD) return planar;
  return Math.hypot(planar, dz - STOREY_DZ_YD);
}

// A deprecated alias of the one owner in domain/nav/storey.ts, kept exported because two dev
// instruments import this name. There is one such constant in the tree; this is not a second value.
export const STOREY_DZ_TOLERANCE_YD = STOREY_DZ_YD;


export type StreamOrigin = { x: number; y: number; z?: number };

// Extra stream origins past the party stand, and how far apart two must be to both count. Each origin
// costs a grid query per floor tick, so a formation collapses to the stand and only a scout adds one.
export const STREAM_ORIGIN_MAX = 4;
export const STREAM_ORIGIN_DEDUP_YD = 16;

// Where the floor is watched from: the party stand plus any member standing away from it. With the
// stand alone, a unit sent ahead to pull walks into an empty room — nothing streams and nothing draws.
export function streamOriginsFrom(
  stand: StreamOrigin,
  sensors: readonly StreamOrigin[],
  opts?: { max?: number; dedupYd?: number },
): StreamOrigin[] {
  const max = opts?.max ?? STREAM_ORIGIN_MAX;
  const dedup = opts?.dedupYd ?? STREAM_ORIGIN_DEDUP_YD;
  const out: StreamOrigin[] = [
    { x: stand.x, y: stand.y, ...(stand.z != null ? { z: stand.z } : {}) },
  ];
  for (const s of sensors) {
    if (out.length > max) break;
    if (out.some((o) => Math.hypot(s.x - o.x, s.y - o.y) <= dedup)) continue;
    out.push({ x: s.x, y: s.y, ...(s.z != null ? { z: s.z } : {}) });
  }
  return out;
}

// The distance to the NEAREST origin. Same shape as the party distance: a z inside the storey tolerance
// is free and the overshoot past it costs. Both stream bands must use this one function or they thrash.
export function nearestOriginDist(
  origins: readonly StreamOrigin[],
  x: number,
  y: number,
  z?: number,
): number {
  let best = Infinity;
  for (const o of origins) {
    const planar = Math.hypot(o.x - x, o.y - y);
    const dz = z == null || o.z == null || !Number.isFinite(z) || !Number.isFinite(o.z)
      ? null
      : Math.abs(o.z - z);
    const d = dz == null || dz <= STOREY_DZ_YD
      ? planar
      : Math.hypot(planar, dz - STOREY_DZ_YD);
    if (d < best) best = d;
  }
  return best;
}

/** Same floor as the party? Missing z stays true (HEIGHT_UNSTAMPED). */
export function sameStoreyAsParty(world: ContinuousWorld, z?: number): boolean {
  const pz = world.party.z;
  if (z == null || pz == null || !Number.isFinite(z) || !Number.isFinite(pz)) return true;
  return Math.abs(pz - z) <= STOREY_DZ_YD;
}

// ON THE STOREY OF ANY PARTY MEMBER, not just the stand's. The sensor SET was widened to every member
// and the storey test was left on the player, so a companion down a ramp had its surroundings filtered.
export function sameStoreyAsAnyParty(world: ContinuousWorld, z?: number): boolean {
  if (z == null || !Number.isFinite(z)) return true;
  const bodies = world.partyBodies;
  if (bodies && bodies.length > 0) {
    let anyZ = false;
    for (const e of bodies) {
      const pz = e.z;
      if (pz == null || !Number.isFinite(pz)) continue;
      anyZ = true;
      if (Math.abs(pz - z) <= STOREY_DZ_YD) return true;
    }
    if (anyZ) return false;
  }
  return sameStoreyAsParty(world, z);
}

/** Alive entities (still on floor, not dead/skipped). */
export function floorEntities(world: ContinuousWorld): ContinuousEntity[] {
  return world.entities.filter((e) => e.state === 'alive' || e.state === 'engaged');
}

// Ambient detection admits the NEAREST authored pack, never two at once — the rule every other pull
// already follows. Packs already in the fight are never scoped out, and unclustered bodies never grouped.
export function scopeToNearestPack(
  world: ContinuousWorld,
  detected: readonly ContinuousEntity[],
  packOf: ReadonlyMap<number, string>,
  sensors?: readonly AggroSensor[],
): ContinuousEntity[] {
  if (detected.length < 2) return [...detected];
  if (!packOf.size) return [...detected];
  const engagedPacks = new Set<string>();
  for (const guid of world.engagedGuids) {
    const id = packOf.get(guid);
    if (id) engagedPacks.add(id);
  }
  const distOf = sensors && sensors.length > 0
    ? (e: ContinuousEntity) => nearestOriginDist(sensors, e.x, e.y, e.z)
    : (e: ContinuousEntity) => partyDistTo(world, e.x, e.y, e.z);
  let nearest: string | null = null;
  let nearestD = Infinity;
  for (const e of detected) {
    const id = packOf.get(e.guid);
    if (!id || engagedPacks.has(id)) continue;
    const d = distOf(e);
    if (d < nearestD) { nearestD = d; nearest = id; }
  }
  if (!nearest) return [...detected];
  return detected.filter((e) => {
    const id = packOf.get(e.guid);
    return !id || id === nearest || engagedPacks.has(id);
  });
}

// Aggro radius for a spawn vs player level — Unit::GetAttackDistance. Cite: creatureAggro.ts / Unit.cpp
// GetAttackDistance.
export function detectionYdFor(
  entity: ContinuousEntity,
  creatureLevel: number,
  playerLevel: number,
): number {
  return getCreatureAttackDistance(creatureLevel, playerLevel, {
    detectionRange: entity.detectionRange,
  });
}

/** World point that can pull (player / ally / pet). Cite: MoveInLineOfSight any unit. */
export type AggroSensor = { x: number; y: number; z?: number };

/** Sight test between two world points. `z` picks the storey on stacked masks. */
export type AggroSight = (
  from: { x: number; y: number; z?: number },
  to: { x: number; y: number; z?: number },
) => boolean;

function considerDetection(world: ContinuousWorld, e: ContinuousEntity): void {
  const d = e.detectionRange ?? 0;
  if (d > (world.maxDetectionYd ?? 0)) world.maxDetectionYd = d;
}

function indexOne(world: ContinuousWorld, e: ContinuousEntity): void {
  if (e.state === 'dead' || e.state === 'skipped') return;
  nearInsert(world.near!, e.guid, e.x, e.y, e);
  considerDetection(world, e);
}

/** Rebuild the instance grid from living / engaged floor bodies. */
export function indexFloorGrid(world: ContinuousWorld): NearGrid<ContinuousEntity> {
  const g = world.near ?? createNearGrid<ContinuousEntity>();
  nearClear(g);
  world.near = g;
  world.maxDetectionYd = 0;
  for (const e of world.entities) indexOne(world, e);
  if (!(world.maxDetectionYd! > 0)) world.maxDetectionYd = DEFAULT_DETECTION_RANGE;
  world.nearIndexed = world.entities.length;
  return g;
}

/** Insert new tail + first-query build. Callers of getNear go through this. */
export function ensureFloorGrid(world: ContinuousWorld): NearGrid<ContinuousEntity> {
  if (!world.near) return indexFloorGrid(world);
  const from = world.nearIndexed ?? 0;
  if (from < world.entities.length) {
    for (let i = from; i < world.entities.length; i++) indexOne(world, world.entities[i]!);
    world.nearIndexed = world.entities.length;
  }
  return world.near;
}

/** Detection query radius: max template Detection plus the GetAttackDistance level pad. */
export function floorAggroQueryYd(world: ContinuousWorld): number {
  const det = world.maxDetectionYd ?? DEFAULT_DETECTION_RANGE;
  return det - AGGRO_LEVEL_DIFF_CAP;
}

export function noteFloorDetection(world: ContinuousWorld, detectionYd: number): void {
  if (detectionYd > (world.maxDetectionYd ?? 0)) world.maxDetectionYd = detectionYd;
}

export function floorBodiesNear(
  world: ContinuousWorld,
  x: number,
  y: number,
  r: number,
  out?: ContinuousEntity[],
): ContinuousEntity[] {
  return getNear(ensureFloorGrid(world), x, y, r, out);
}

export function floorBodyByGuid(
  world: ContinuousWorld,
  guid: number,
): ContinuousEntity | undefined {
  const hit = nearGet(ensureFloorGrid(world), guid);
  if (hit) return hit;
  return world.entities.find((e) => e.guid === guid);
}

export function reindexFloorBody(world: ContinuousWorld, e: ContinuousEntity): void {
  const g = ensureFloorGrid(world);
  if (e.state === 'dead' || e.state === 'skipped') {
    nearRemove(g, e.guid);
    return;
  }
  nearMove(g, e.guid, e.x, e.y, e);
  considerDetection(world, e);
}

export function dropFloorBody(world: ContinuousWorld, guid: number): void {
  if (world.near) nearRemove(world.near, guid);
}

export function placeFloorBody(
  world: ContinuousWorld,
  e: ContinuousEntity,
  x: number,
  y: number,
  z?: number,
): void {
  e.x = x;
  e.y = y;
  if (z != null) e.z = z;
  reindexFloorBody(world, e);
}

// Alive hostiles whose detection covers ANY party sensor. Distance first, then sight for the shortlist,
// and the sight test runs against EVERY in-range sensor — nearest-only turned a real pull into none.
export function entitiesInAggroRange(
  world: ContinuousWorld,
  playerLevel: number,
  creatureLevel = 18,
  hasLos?: AggroSight,
  sensors?: readonly AggroSensor[],
): ContinuousEntity[] {
  const pts = sensors && sensors.length > 0
    ? sensors
    : [{ x: world.party.x, y: world.party.y, z: world.party.z }];
  const g = ensureFloorGrid(world);
  const q = floorAggroQueryYd(world);
  const seen = new Set<number>();
  const out: ContinuousEntity[] = [];
  const tmp: ContinuousEntity[] = [];
  for (const p of pts) {
    getNear(g, p.x, p.y, q, tmp);
    for (const e of tmp) {
      if (seen.has(e.guid)) continue;
      if (e.state !== 'alive') continue;
      // Hostile is the combat gate — gossip/npcFlags do not make a hostile body unfightable.
      if (!e.hostile) continue;
      const r = detectionYdFor(e, e.level > 0 ? e.level : creatureLevel, playerLevel);
      const ez = e.z;
      const ezOk = ez != null && Number.isFinite(ez);
      const pz = p.z;
      const d = ezOk && pz != null && Number.isFinite(pz)
        ? Math.hypot(p.x - e.x, p.y - e.y, pz - ez)
        : Math.hypot(p.x - e.x, p.y - e.y);
      if (d > r) continue;
      if (ezOk && pz != null && Number.isFinite(pz)
        && Math.abs(pz - ez) > STOREY_DZ_YD) continue;
      if (hasLos && !hasLos(p, e)) continue;
      seen.add(e.guid);
      out.push(e);
    }
  }
  out.sort((a, b) => a.guid - b.guid);
  return out;
}

// Set a pathfind move order, replacing any prior path, and return its length or null. The destination is
// recorded EVEN WHEN the search fails, so the walk can still slide toward it.
export function setMoveOrder(
  world: ContinuousWorld,
  dest: NavPos,
  mapId?: number,
): { path: NavPos[]; pathYd: number } | null {
  world.moveDest = { x: dest.x, y: dest.y };
  // The path search is mesh-first and needs only the map id. The id-less arm below it was a raster call
  // with no mesh twin — a mesh is only reachable by map id — so it went with the one caller that had none.
  if (mapId == null) { world.movePath = []; return null; }
  const path = findPathForMap(mapId, world.party, dest);
  if (!path || path.length < 1) { world.movePath = []; return null; }
  // Overview paths have no z; bake answering-mask height so tickWalk cannot sticky-latch
  // a wrong storey (ras: overview ends 83.8, sticky pins 143.8). HEIGHT_UNSTAMPED stays unset.
  if (pathFloorHint(path) == null) {
    for (const p of path) {
      const hz = floorZForMap(mapId, p.x, p.y);
      if (hz != null) p.z = hz;
    }
  }
  world.movePath = path.slice();
  return { path: world.movePath, pathYd: pathLength(path) };
}

// Advance party along movePath by at most stepYd (nav followPath). Counts walkedYd from actual displacement
// — never a hop teleport.
export function tickWalk(
  world: ContinuousWorld,
  stepYd: number,
): { moved: number; arrived: boolean } {
  if (!(stepYd > 0)) return { moved: 0, arrived: world.movePath.length === 0 };
  const from = { x: world.party.x, y: world.party.y };
  const walkMesh = navMeshForMap(world.mapId);
  if (!walkMesh || world.movePath.length === 0) {
    // This used to promise a Euclidean fallback in the comment and return "moved nothing, arrived",
    // which is why a walk order the search could not solve froze the party and reported success.
    const dest = world.moveDest;
    if (!dest) return { moved: 0, arrived: true };
    const dx = dest.x - from.x;
    const dy = dest.y - from.y;
    const d = Math.hypot(dx, dy);
    if (d <= 0.4) { world.moveDest = undefined; return { moved: 0, arrived: true }; }
    const travel = Math.min(stepYd, d);
    const nx = from.x + (dx / d) * travel;
    const ny = from.y + (dy / d) * travel;
    // Prefer staying on mesh; refuse only the step that would leave it, so we slide along a
    // wall instead of walking into the void. Off-mesh already (bad spawn) → move freely back.
    if (isWalkablePointForMap(world.mapId, from.x, from.y) === true
      && isWalkablePointForMap(world.mapId, nx, ny) === false) {
      return { moved: 0, arrived: false };
    }
    const z = partyFloorZ(nx, ny, world.party.z, undefined, world.mapId);
    stepPartyTo(world, nx, ny, z ?? world.party.z);
    world.walkedYd += travel;
    return { moved: travel, arrived: false };
  }
  // Swimming is slower than running, so crossing a cove costs real time rather than a glide. Null means
  // nothing is registered for this map, which is dry as far as this walk knows.
  const swim = isSwimPointForMap(world.mapId, from.x, from.y, world.party.z) === true;
  const eff = swim ? stepYd / SWIM_STEP_COST : stepYd;
  // Mesh first, raster below. The mesh follower gets the party z because its arrival test is the server
  // climb; without a z it degrades to the plan-only arrival the raster twin already does.
  const next = walkMesh
    ? followPathNavMesh(walkMesh, { ...from, z: world.party.z }, world.movePath, eff)
    : from;
  const moved = Math.hypot(next.x - from.x, next.y - from.y);
  // Route stamp > sticky prev (no re-pin); no stamp → sticky (deck over water).
  const pathZ = pathFloorHint(world.movePath);
  const z = partyFloorZ(next.x, next.y, world.party.z, pathZ, world.mapId);
  stepPartyTo(world, next.x, next.y, z ?? world.party.z);
  world.walkedYd += moved;
  return { moved, arrived: world.movePath.length === 0 };
}

// Walk the full current path (or a fresh pathfind to dest) in steps. Prefer this over teleport for probes
// and continuous product.
export function walkTo(
  world: ContinuousWorld,
  dest: NavPos,
  opts?: { stepYd?: number; maxSteps?: number },
): {
  ok: boolean;
  walkedYd: number;
  pathYd: number | null;
  usedPathfind: boolean;
  reason?: string;
} {
  const stepYd = opts?.stepYd ?? 2;
  const maxSteps = opts?.maxSteps ?? 50_000;
  let pathYd: number | null = null;
  let usedPathfind = false;

  // `setMoveOrder` routes off the map id alone, mesh-first through `findPathForMap`.
  const planned = setMoveOrder(world, dest, world.mapId > 0 ? world.mapId : undefined);
  if (planned) {
    pathYd = planned.pathYd;
    usedPathfind = true;
    const startWalk = world.walkedYd;
    for (let i = 0; i < maxSteps; i++) {
      const { arrived } = tickWalk(world, stepYd);
      if (arrived) break;
    }
    return {
      ok: world.movePath.length === 0,
      walkedYd: world.walkedYd - startWalk,
      pathYd,
      usedPathfind,
      reason: world.movePath.length ? 'maxSteps' : undefined,
    };
  }

  // The Euclidean step fallback — never freeze — still accumulating walked yards rather than hopping.
  // Prefer walkable cells, but keep stepping when the nav components disconnect.
  const startWalk = world.walkedYd;
  let guard = 0;
  let blockedStreak = 0;
  while (guard++ < maxSteps) {
    const dx = dest.x - world.party.x;
    const dy = dest.y - world.party.y;
    const d = Math.hypot(dx, dy);
    if (d <= 0.4) break;
    const travel = Math.min(stepYd, d);
    const nx = world.party.x + (dx / d) * travel;
    const ny = world.party.y + (dy / d) * travel;
    if (
      blockedStreak < 3
      && isWalkablePointForMap(world.mapId, world.party.x, world.party.y) === true
      && isWalkablePointForMap(world.mapId, nx, ny) === false
    ) {
      blockedStreak += 1;
      // Try a half-step; if still blocked thrice, cross the gap (disconnected storeys/ship).
      if (blockedStreak < 3) continue;
    }
    blockedStreak = 0;
    const z = partyFloorZ(nx, ny, world.party.z, undefined, world.mapId);
    stepPartyTo(world, nx, ny, z ?? world.party.z);
    world.walkedYd += travel;
  }
  const walked = world.walkedYd - startWalk;
  // Last-resort: if still multi-yard away after blocked corridor, close the remaining gap.
  const remain = Math.hypot(dest.x - world.party.x, dest.y - world.party.y);
  if (remain > 1 && walked < 0.5) {
    const z = partyFloorZ(dest.x, dest.y, world.party.z, undefined, world.mapId);
    stepPartyTo(world, dest.x, dest.y, z ?? world.party.z);
    world.walkedYd += remain;
  }
  const walkedFinal = world.walkedYd - startWalk;
  return {
    ok: Math.hypot(dest.x - world.party.x, dest.y - world.party.y) <= 1,
    walkedYd: walkedFinal,
    pathYd,
    usedPathfind,
    reason: usedPathfind ? undefined : (walkedFinal > walked ? 'euclidean-disconnected' : 'euclidean-fallback'),
  };
}

// Attempt proximity pull. Fails unless party is within detection of every guid (or of the pack centroid
// when pulling a set).
export function tryEngage(
  world: ContinuousWorld,
  guids: readonly number[],
  opts?: { playerLevel?: number; creatureLevel?: number },
): { ok: true; guids: number[] } | { ok: false; reason: string } {
  if (world.hopUsed) {
    return { ok: false, reason: 'hop path is not continuous engage' };
  }
  if (!guids.length) return { ok: false, reason: 'no guids' };
  const playerLevel = opts?.playerLevel ?? 20;
  const creatureLevel = opts?.creatureLevel ?? 18;
  const resolved: ContinuousEntity[] = [];
  for (const g of guids) {
    const e = world.entities.find((x) => x.guid === g);
    if (!e) return { ok: false, reason: `unknown guid ${g}` };
    if (e.state === 'dead') return { ok: false, reason: `guid ${g} already dead` };
    if (e.state === 'skipped') return { ok: false, reason: `guid ${g} was skipped` };
    const r = detectionYdFor(e, e.level > 0 ? e.level : creatureLevel, playerLevel);
    const d = partyDistTo(world, e.x, e.y, e.z);
    if (!sameStoreyAsParty(world, e.z) || d > r) {
      return {
        ok: false,
        reason: `out of range guid ${g}: ${d.toFixed(1)} yd > detection ${r.toFixed(1)}`,
      };
    }
    resolved.push(e);
  }
  // Anyone leaving the list stops being engaged in the ROW too. Replacing the whole list left a body
  // marked engaged from an earlier pull with nothing pointing at it. Only that flag resets: a corpse stays.
  const keep = new Set(resolved.map((e) => e.guid));
  for (const g of world.engagedGuids) {
    if (keep.has(g)) continue;
    const prev = world.entities.find((x) => x.guid === g);
    if (prev && prev.state === 'engaged') prev.state = 'alive';
  }
  for (const e of resolved) e.state = 'engaged';
  world.engagedGuids = resolved.map((e) => e.guid);
  return { ok: true, guids: world.engagedGuids.slice() };
}

// Walk past without pull — no clear credit, entities stay alive or mark skipped. Product skip: player never
// engaged; route progress does not clear them.
export function skipEntities(
  world: ContinuousWorld,
  guids: readonly number[],
): { skipped: number[] } {
  const skipped: number[] = [];
  for (const g of guids) {
    const e = world.entities.find((x) => x.guid === g);
    if (!e || e.state === 'dead' || e.state === 'engaged') continue;
    e.state = 'skipped';
    dropFloorBody(world, g);
    skipped.push(g);
  }
  return { skipped };
}

// Drop bodies from the roster and REBUILD the grid. The entity list is otherwise append-only and the
// grid indexes only the tail, so shortening it by hand corrupts the index for the rest of the run.
export function removeFloorEntities(
  world: ContinuousWorld,
  keep: (e: ContinuousEntity) => boolean,
): number {
  const before = world.entities.length;
  const kept = world.entities.filter(keep);
  if (kept.length === before) return 0;
  world.entities = kept;
  // The party index is filtered by the CALLER'S OWN predicate, so it can never name a row the roster
  // dropped. That is what makes it an index rather than a store that can disagree.
  if (world.partyBodies?.length) world.partyBodies = world.partyBodies.filter(keep);
  indexFloorGrid(world);
  return before - kept.length;
}

// A body that LEFT the floor without being killed — a script's forced despawn. State plus the grid drop,
// and deliberately not a clear: the player cleared nothing and the script owns whether it returns.
export function despawnFloorBody(world: ContinuousWorld, guid: number): void {
  const e = world.entities.find((x) => x.guid === guid);
  // A skipped body owns its own list and its own drop, so leave it alone. Already-dead is NOT a reason
  // to return: the caller sets the state first, so the drop is the only thing left to do.
  if (!e || e.state === 'skipped') return;
  e.state = 'dead';
  dropFloorBody(world, guid);
}

/** After a win: mark dead, grant clear credit, leave party where it stands. */
export function resolveKill(
  world: ContinuousWorld,
  guids: readonly number[],
): void {
  for (const g of guids) {
    const e = world.entities.find((x) => x.guid === g);
    if (e) e.state = 'dead';
    dropFloorBody(world, g);
    if (!world.clearedGuids.includes(g)) world.clearedGuids.push(g);
  }
  world.engagedGuids = world.engagedGuids.filter((g) => !guids.includes(g));
}

// Scaffolding only — marks hopUsed so probes/gates can reject hop success paths. Continuous product code
// must not call this.
export function markHopUsed(world: ContinuousWorld): void {
  world.hopUsed = true;
}

/** World-space unit positions for createSession (party + engaged guids in place). */
export function combatPositionsInPlace(
  world: ContinuousWorld,
  guids: readonly number[],
): Record<string, { x: number; y: number; z?: number }> {
  const positions: Record<string, { x: number; y: number; z?: number }> = {
    player: { x: world.party.x, y: world.party.y, z: world.party.z },
  };
  guids.forEach((g, i) => {
    const e = world.entities.find((x) => x.guid === g);
    if (!e) return;
    const side = i === 0 ? 'enemy' : `enemy_${i}`;
    // z carried, not dropped: the floor knows every body's storey and combat used to throw
    // it away at exactly this line.
    positions[side] = { x: e.x, y: e.y, z: e.z };
  });
  return positions;
}

/** Nearest alive hostile — pull / skip target. Gossip flags do not exclude combat. */
export function nearestAlive(world: ContinuousWorld): ContinuousEntity | null {
  let best: ContinuousEntity | null = null;
  let bestD = Infinity;
  for (const e of world.entities) {
    if (e.state !== 'alive') continue;
    if (!e.hostile) continue;
    const d = partyDistTo(world, e.x, e.y, e.z);
    if (d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

/** Service NPCs still on the continuous floor (npcFlags ≠ 0). */
export function floorNpcs(world: ContinuousWorld): ContinuousEntity[] {
  return world.entities.filter((e) => e.npcFlags !== 0 && e.state !== 'dead');
}

// The nearest non-hostile service NPC within range, never hostile trash. The range matches the
// interaction distance at the call site. Cite: Unit.h UNIT_NPC_FLAG_*; ObjectDefines.h.
export function nearestTalkableNpc(
  world: ContinuousWorld,
  maxYd: number,
): ContinuousEntity | null {
  let best: ContinuousEntity | null = null;
  let bestD = Infinity;
  for (const e of world.entities) {
    if (e.npcFlags === 0 || e.state === 'dead' || e.hostile) continue;
    const d = partyDistTo(world, e.x, e.y, e.z);
    if (d > maxYd || d >= bestD) continue;
    best = e;
    bestD = d;
  }
  return best;
}

// Continuous pull resolution (shipped controller path — probes drive these)

export type ContinuousEncounterRef = {
  id: string;
  name?: string;
  spawnGuids?: readonly number[];
};

// Map floor guids → route encounter by spawnGuids overlap. null when no encounter owns any of the guids
// (never invent next-route pack).
export function encounterForSpawnGuids(
  encounters: readonly ContinuousEncounterRef[],
  guids: readonly number[],
): ContinuousEncounterRef | null {
  if (!guids.length) return null;
  const set = new Set(guids);
  let best: ContinuousEncounterRef | null = null;
  let bestN = 0;
  for (const e of encounters) {
    const sg = e.spawnGuids;
    if (!sg?.length) continue;
    let n = 0;
    for (const g of sg) if (set.has(g)) n++;
    if (n > bestN) {
      bestN = n;
      best = e;
    }
  }
  return bestN > 0 ? best : null;
}

// Resolve which encounter a continuous pull may begin: it requires the guid-to-encounter map with no
// substitute, refuses an already-defeated encounter, and does not check the sequential unlock.
export function resolveContinuousPullEncounter(
  encounters: readonly ContinuousEncounterRef[],
  defeated: readonly string[],
  guids: readonly number[],
): { ok: true; encounter: ContinuousEncounterRef } | { ok: false; reason: string } {
  if (!guids.length) return { ok: false, reason: 'no guids' };
  const enc = encounterForSpawnGuids(encounters, guids);
  if (!enc) {
    return { ok: false, reason: 'unmapped guids - refuse nextEncounter substitute' };
  }
  if (defeated.includes(enc.id)) {
    return { ok: false, reason: `already defeated ${enc.id}` };
  }
  return { ok: true, encounter: enc };
}

// Whether beginEncounter should be allowed for continuous floor product. continuousFloor=true → only block
// if already defeated (not sequential path lock).
export function continuousBeginAllowed(
  defeated: readonly string[],
  encounterId: string,
  opts: { continuousFloor: boolean; sequentialUnlocked: boolean },
): { ok: true } | { ok: false; reason: string } {
  if (defeated.includes(encounterId)) {
    return { ok: false, reason: 'Already defeated' };
  }
  if (!opts.continuousFloor && !opts.sequentialUnlocked) {
    return { ok: false, reason: 'Clear the path to it first' };
  }
  return { ok: true };
}

