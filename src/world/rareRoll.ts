/**
 * Once-per-instance dungeon pool roll (rare-elite + equal-chance substitutes).
 *
 * Cite: PoolManager.cpp RollOne / SpawnObject / Initialize;
 * MapPersistentStateMgr.cpp InitPools ~198-207 — run once per persistent state, no
 * respawn re-roll in v1. Chances come only from baked `pools.json` members.
 *
 * Multi-location rares (Bannok ×2, Forresten ×4, …) are authored as several boss
 * encounters sharing a display name. Pool roll picks spawn guids; the route must
 * keep at most one of those candidates so the map does not walk every spawn point.
 */

import type { Rng } from '../engine/core/rng.ts';
import {
  populateFromBakedPool,
  type BakedPoolRow,
} from '../domain/world/pools.ts';
import type { DungeonSpawn } from '../data/dungeonSpawns.ts';
import type { EncounterDef } from '../data/schema/encounter.ts';

/** Sub-seed salt for instance pool rolls (ASCII "pool"). */
export const DUNGEON_POOL_ROLL_SALT = 0x706f6f6c;

export type DungeonPoolRoll = {
  /** Pool template ids rolled for this map (stable ascending). */
  poolIds: readonly number[];
  /** Guids that won populatePool for those pools. */
  spawnedGuids: readonly number[];
  /** Union of every member guid in those pools (winners + losers). */
  memberGuids: readonly number[];
};

/** Map spawn rows used for pool membership / multi-slot rebinding. */
export type PoolMapSpawn = {
  guid: number;
  entry: number;
  /** CSE candidates on the spawn (SM grave rares). */
  poolCandidates?: readonly number[];
  x?: number;
  y?: number;
};

/** Pools with at least one member guid on this floor (or authored encounter list). */
export function poolsForMapGuids(
  pools: readonly BakedPoolRow[],
  mapGuids: ReadonlySet<number>,
): BakedPoolRow[] {
  const out: BakedPoolRow[] = [];
  for (const p of pools) {
    if (p.members.some((m) => mapGuids.has(m.guid))) out.push(p);
  }
  out.sort((a, b) => a.id - b.id);
  return out;
}

// Roll every map-relevant pool once. Deterministic given `rng`. Cite: MapPersistentState::InitPools — once
// per persistent state.
export function rollDungeonPools(
  pools: readonly BakedPoolRow[],
  mapGuids: ReadonlySet<number>,
  rng: Rng,
): DungeonPoolRoll {
  const relevant = poolsForMapGuids(pools, mapGuids);
  const poolIds: number[] = [];
  const spawned: number[] = [];
  const members: number[] = [];
  for (const row of relevant) {
    poolIds.push(row.id);
    for (const m of row.members) members.push(m.guid);
    // Fresh pool each call — no prior spawns (v1 no respawn re-roll).
    spawned.push(...populateFromBakedPool(row, { spawned: [] }, rng));
  }
  return {
    poolIds,
    spawnedGuids: [...new Set(spawned)],
    memberGuids: [...new Set(members)],
  };
}

/** Rebuild a roll from persisted winners (re-mount). Member set re-derived from bake. */
export function poolRollFromPersisted(
  pools: readonly BakedPoolRow[],
  mapGuids: ReadonlySet<number>,
  spawnedGuids: readonly number[],
): DungeonPoolRoll {
  const relevant = poolsForMapGuids(pools, mapGuids);
  const poolIds: number[] = [];
  const members: number[] = [];
  for (const row of relevant) {
    poolIds.push(row.id);
    for (const m of row.members) members.push(m.guid);
  }
  return {
    poolIds,
    spawnedGuids: [...spawnedGuids],
    memberGuids: [...new Set(members)],
  };
}

/** True unless `guid` is a rolled-pool member that lost. */
export function spawnAllowedByPoolRoll(
  guid: number,
  roll: DungeonPoolRoll | null | undefined,
): boolean {
  if (!roll || roll.memberGuids.length === 0) return true;
  // Hot path: sets once when filtering many spawns — callers prefer filterSpawnsByPoolRoll.
  const members = new Set(roll.memberGuids);
  if (!members.has(guid)) return true;
  return new Set(roll.spawnedGuids).has(guid);
}

/** Drop pool losers from dungeon floor spawns; keep non-members and winners. */
export function filterSpawnsByPoolRoll(
  spawns: readonly DungeonSpawn[],
  roll: DungeonPoolRoll | null | undefined,
): DungeonSpawn[] {
  if (!roll || roll.memberGuids.length === 0) return spawns.slice();
  const members = new Set(roll.memberGuids);
  const spawned = new Set(roll.spawnedGuids);
  return spawns.filter((s) => !members.has(s.guid) || spawned.has(s.guid));
}

/** Pool member guids that can materialize this encounter's creature entry. */
function poolGuidsForEncounter(
  enc: { spawnGuids?: readonly number[]; creatureEntry: number },
  members: ReadonlySet<number>,
  mapSpawns: readonly PoolMapSpawn[],
): Set<number> {
  const poolGuids = new Set<number>();
  const authored = enc.spawnGuids ?? [];
  // Authored slots are the encounter's presence set (SM CSE graves ×6, each with a
  // unique name). Do not union every map spawn that shares poolCandidates — any
  // winner would then mark every grave up (KI-970; pool 46001 max_limit=1).
  if (authored.length > 0) {
    for (const g of authored) {
      if (members.has(g)) poolGuids.add(g);
    }
    if (poolGuids.size > 0) return poolGuids;
  }
  for (const s of mapSpawns) {
    if (!members.has(s.guid)) continue;
    if (s.entry === enc.creatureEntry) poolGuids.add(s.guid);
    // CSE rare graves (SM): base entry differs; candidates include this rare.
    if (s.poolCandidates?.includes(enc.creatureEntry)) poolGuids.add(s.guid);
  }
  return poolGuids;
}

/**
 * Pool-gated encounter presence. Not gated when no map/pool member shares the
 * encounter's entry (or authored spawnGuids / CSE poolCandidates). Multi-slot
 * same-entry rares count any winning same-entry guid for *presence*; route
 * dedupe (stripAbsentPoolEncountersFromRoute) keeps a single candidate pin.
 */
export function isEncounterUpAfterPoolRoll(
  enc: { spawnGuids?: readonly number[]; creatureEntry: number },
  roll: DungeonPoolRoll | null | undefined,
  mapSpawns: readonly PoolMapSpawn[],
): boolean {
  if (!roll || roll.memberGuids.length === 0) return true;
  const members = new Set(roll.memberGuids);
  const spawned = new Set(roll.spawnedGuids);
  const poolGuids = poolGuidsForEncounter(enc, members, mapSpawns);
  if (poolGuids.size === 0) return true;
  for (const g of poolGuids) if (spawned.has(g)) return true;
  return false;
}

// Point the encounter at the winning pool guid(s) for its entry (multi-slot rares). No-op when the
// encounter is not pool-gated or lost the roll.
export function rebindSpawnGuidsAfterPoolRoll(
  enc: EncounterDef,
  roll: DungeonPoolRoll | null | undefined,
  mapSpawns: readonly PoolMapSpawn[],
): EncounterDef {
  if (!roll || roll.memberGuids.length === 0) return enc;
  const members = new Set(roll.memberGuids);
  const spawned = new Set(roll.spawnedGuids);
  const winners = new Set<number>();
  // Same authored-slot rule as poolGuidsForEncounter (KI-970 CSE graves).
  const authored = enc.spawnGuids ?? [];
  if (authored.length > 0) {
    for (const g of authored) {
      if (members.has(g) && spawned.has(g)) winners.add(g);
    }
  }
  if (!winners.size) {
    for (const s of mapSpawns) {
      if (!members.has(s.guid) || !spawned.has(s.guid)) continue;
      if (s.entry === enc.creatureEntry || s.poolCandidates?.includes(enc.creatureEntry)) {
        winners.add(s.guid);
      }
    }
  }
  if (!winners.size) return enc;
  const sorted = [...winners].sort((a, b) => a - b);
  const prev = enc.spawnGuids ?? [];
  if (prev.length === sorted.length && prev.every((g, i) => g === sorted[i])) return enc;
  return { ...enc, spawnGuids: sorted };
}

/**
 * Boss-kind encounters that share a display name are multi-location rare candidates
 * (Bannok ×2, Forresten ×4). Trash reusing a name is a different pack each time —
 * only `kind === 'boss'` groups are multi-slot rares.
 */
export function multiSlotBossGroups(
  encounters: readonly EncounterDef[],
): Map<string, EncounterDef[]> {
  const byName = new Map<string, EncounterDef[]>();
  for (const e of encounters) {
    if (e.kind !== 'boss') continue;
    const list = byName.get(e.name);
    if (list) list.push(e);
    else byName.set(e.name, [e]);
  }
  for (const [name, list] of [...byName]) {
    if (list.length < 2) byName.delete(name);
  }
  return byName;
}

/**
 * Pick the single route representative for a multi-location rare group.
 * Prefers an encounter whose spawnGuids include a pool winner; else nearest
 * origin to the winning spawn; else first id in route order (`orderedIds`).
 */
export function selectMultiSlotRareRepresentative(
  group: readonly EncounterDef[],
  orderedIds: readonly string[],
  roll: DungeonPoolRoll | null | undefined,
  mapSpawns: readonly PoolMapSpawn[],
): EncounterDef {
  if (group.length === 1) return group[0]!;
  const orderRank = new Map(orderedIds.map((id, i) => [id, i]));
  const byRoute = (a: EncounterDef, b: EncounterDef): number =>
    (orderRank.get(a.id) ?? 1e9) - (orderRank.get(b.id) ?? 1e9)
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  if (!roll || roll.memberGuids.length === 0) {
    return [...group].sort(byRoute)[0]!;
  }

  const members = new Set(roll.memberGuids);
  const spawned = new Set(roll.spawnedGuids);
  const entry = group[0]!.creatureEntry;
  const winners: PoolMapSpawn[] = [];
  for (const s of mapSpawns) {
    if (!members.has(s.guid) || !spawned.has(s.guid)) continue;
    if (s.entry === entry || s.poolCandidates?.includes(entry)) winners.push(s);
  }
  for (const enc of group) {
    for (const g of enc.spawnGuids ?? []) {
      if (members.has(g) && spawned.has(g) && !winners.some((w) => w.guid === g)) {
        const hit = mapSpawns.find((s) => s.guid === g);
        winners.push(hit ?? { guid: g, entry });
      }
    }
  }
  winners.sort((a, b) => a.guid - b.guid);

  if (winners.length) {
    const winGuids = new Set(winners.map((w) => w.guid));
    const bound = group.filter((e) => e.spawnGuids?.some((g) => winGuids.has(g)));
    if (bound.length) return [...bound].sort(byRoute)[0]!;

    const win = winners[0]!;
    if (win.x != null && win.y != null && group.some((e) => e.origin)) {
      return [...group].sort((a, b) => {
        const da = a.origin
          ? Math.hypot(a.origin.x - win.x!, a.origin.y - win.y!)
          : Number.POSITIVE_INFINITY;
        const db = b.origin
          ? Math.hypot(b.origin.x - win.x!, b.origin.y - win.y!)
          : Number.POSITIVE_INFINITY;
        if (da !== db) return da - db;
        return byRoute(a, b);
      })[0]!;
    }
  }

  return [...group].sort(byRoute)[0]!;
}

// Among boss multi-slot groups, keep exactly one id per display name. Losers stay in the def; they only
// leave the route.
export function dedupeMultiSlotBossRoute(
  encounterIds: readonly string[],
  encounters: readonly EncounterDef[],
  roll: DungeonPoolRoll | null | undefined,
  mapSpawns: readonly PoolMapSpawn[],
): string[] {
  const byId = new Map(encounters.map((e) => [e.id, e]));
  const groups = multiSlotBossGroups(encounters);
  if (groups.size === 0) return encounterIds.slice();

  const keepOne = new Map<string, string>(); // name → chosen id
  for (const [name, group] of groups) {
    const onRoute = group.filter((e) => encounterIds.includes(e.id));
    if (onRoute.length < 2) continue;
    const pick = selectMultiSlotRareRepresentative(onRoute, encounterIds, roll, mapSpawns);
    keepOne.set(name, pick.id);
  }
  if (keepOne.size === 0) return encounterIds.slice();

  return encounterIds.filter((id) => {
    const enc = byId.get(id);
    if (!enc || enc.kind !== 'boss') return true;
    const chosen = keepOne.get(enc.name);
    if (chosen == null) return true;
    return id === chosen;
  });
}

// Drop pool-absent encounters from the run route, then collapse multi-location rare candidates (same boss
// name) to a single pin. Defs keep every candidate.
export function stripAbsentPoolEncountersFromRoute(
  encounterIds: readonly string[],
  encounters: readonly EncounterDef[],
  roll: DungeonPoolRoll | null | undefined,
  mapSpawns: readonly PoolMapSpawn[],
): string[] {
  const byId = new Map(encounters.map((e) => [e.id, e]));
  let kept: string[];
  if (!roll || roll.memberGuids.length === 0) {
    kept = encounterIds.slice();
  } else {
    kept = encounterIds.filter((id) => {
      const enc = byId.get(id);
      if (!enc) return true;
      return isEncounterUpAfterPoolRoll(enc, roll, mapSpawns);
    });
  }
  return dedupeMultiSlotBossRoute(kept, encounters, roll, mapSpawns);
}
