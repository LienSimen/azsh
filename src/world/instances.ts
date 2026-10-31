// Instanced-dungeon rules (Phase 5), pure and deterministic. Given an InstanceDef
// (static data) and an InstanceRun (per-character progress) it answers: what can I
// fight next, is the dungeon cleared, am I locked out? No DOM, no clock — any "now"
// is injected by the caller (the UI boundary), so this stays testable and the
// arch.test purity guard is satisfied.
//
// D-4 event primitives (flags, gates, wave/phase progress) live here as pure
// helpers; game.ts is the wiring layer only.

import type { DataStore } from '../data/dataStore.ts';
import type {
  InstanceDef,
  EncounterDef,
  EncounterEvent,
  EncounterPackMember,
} from '../data/schema.ts';
import {
  checkAreaTriggerLock,
  findEntranceTeleport,
  type AreaTriggerTeleportRow,
} from '../domain/world/areaTriggerLocks.ts';
import type { PullFusion, RouteDensity } from './dungeonRoute.ts';
import {
  DEFAULT_PULL_FUSION,
  DEFAULT_ROUTE_DENSITY,
  selectRouteEncounters,
} from './dungeonRoute.ts';
import type { CreatureLookup, SpellLookup, PackBudgetPreset } from './packBudget.ts';
import {
  expandRouteByPackBudget,
  packBudgetPresetFor,
} from './packBudget.ts';
import {
  filterRouteByPoolRoll,
  orderRouteByGeometry,
  routeItemSources,
} from './dungeonRouteOrder.ts';
import type { NavFloorDoc, NavGrid } from './dungeonNav.ts';
import { dungeonGameObjectsForMap } from '../data/dungeonGameObjects.ts';
import {
  STRATH_LIVE_POSTBOX,
  postboxOrigin,
} from '../data/dungeons/stratholme-live.ts';
import type { DungeonPoolRoll, PoolMapSpawn } from './rareRoll.ts';
import { INSTANCE_DATA } from '../domain/scriptdev/types.ts';
import {
  applyMajordomoSpawnOnPlayerEnter,
  applyMoltenCoreRuneSpecial,
  moltenCoreRuneField,
} from '../domain/scriptdev/moltenCore.ts';

/** Per-character progress through one active dungeon run. */
export interface InstanceRun {
  dungeonId: string;
  defeated: string[]; // encounter ids cleared so far this run
  /**
   * Free-walk floor progress: spawn guids already killed. `defeated` tracks ENCOUNTER ids,
   * which the continuous floor does not use — so without this every mob you killed came back
   * alive the moment the controller re-mounted ("Continue run" rebuilds the floor from the
   * spawn bake). Optional: absent ≡ nothing cleared, so old saves stay valid.
   */
  floorClearedGuids?: number[];
  /**
   * Guids that won dungeon `pool_creature` rolls at first mount. Restored on re-mount so
   * rares / substitutes do not re-roll mid-run. Absent ≡ not rolled yet (legacy) — mount
   * rolls once and stamps this. Empty array = map had no relevant pools (or all failed).
   * Cite: MapPersistentStateMgr.cpp InitPools ~198-207; pools.json member chances only.
   */
  floorPoolSpawnedGuids?: number[];
  /**
   * Guids that won the map's GAMEOBJECT pool rolls at first mount — the herb, vein, crate and
   * chest positions that hold an object this run. Losers are candidate spots the DB allows and
   * nothing stands on. Absent ≡ not rolled yet (legacy save): every candidate stays, which is
   * what every surface did before the pool bake. Cite: PoolManager.cpp:1087 SpawnPool.
   */
  floorPoolSpawnedGoGuids?: number[];
  // Where the party stands on the free-walk floor. Absent ≡ start at the instance entrance. Restored on
  // re-mount so a Continue does not teleport you back to the door.
  floorPartyPos?: { x: number; y: number; z?: number };
  /**
   * Deaths this run has taken, for Alterac Valley's reinforcement race — one death is one
   * reinforcement (BattleGroundAV.cpp:38-45 HandleKillPlayer). Counted in liveFloorRecovery's
   * `chargeDeaths`, which is already the once-per-death moment. Optional: absent ≡ 0, so every
   * existing save stays valid and every non-AV run simply never writes it.
   */
  avDeaths?: number;
  /**
   * Alterac Valley's capture board — node id -> owner/state/assault clock, mine id -> owner, and
   * the mines' banked reinforcement income. State, not a read, because a node has an assault
   * clock; see src/domain/bg/avInstanceNodes.ts. Optional throughout: absent ≡ the DB's own
   * starting board, so every existing save stays valid and no non-AV run ever writes it.
   */
  avNodes?: Record<string, { o: 'alliance' | 'horde' | null; s: 'owned' | 'assaulted'; m?: number }>;
  avMines?: Record<string, 'alliance' | 'horde'>;
  avMineTickAtMs?: number;
  avMineIncome?: number;
  /**
   * Instance flags set by boss-death `setsFlag`, object-use gates, HP phases, etc.
   * Optional for save back-compat (absent ≡ []). Survives mid-run save without a
   * SAVE_VERSION bump (migrate treats missing as empty).
   */
  flags?: string[];
  /**
   * SPELL_AURA_FORCE_REACTION (139) map — Faction.dbc id → ReputationRank. Lives on the run
   * because the crown is stripped on leaving the instance. Optional (absent ≡ none).
   * Cite: instance_dire_maul.cpp:75-79; domain/creature/forcedReaction.ts.
   */
  forcedReactions?: import('../domain/creature/forcedReaction.ts').ForcedReactionMap;
  /**
   * ScriptDev numeric instance data store (TYPE_* → NOT_STARTED/IN_PROGRESS/…).
   * Written by GO-use / boss SetData paths. Optional — absent ≡ empty (all NOT_STARTED).
   * Cite: sc_instance.h; stratholme.h TYPE_*; host handleGoUse / applyInstanceSetData.
   */
  scriptInstanceData?: Record<number, number>;
  // Stratholme postbox open counter (m_postboxesUsed). After the 2nd IN_PROGRESS write to TYPE_POSTMASTER
  // the store promotes to SPECIAL. Cite: stratholme.cpp:463-471 TYPE_POSTMASTER SetData.
  postboxesUsed?: number;
  /**
   * Gnomeregan bomb faces (`instance_gnomeregan::m_asBombFaces`). On the RUN because the C++
   * keeps it on the instance, not on the boss AI: `DoActivateBombFace` is reached from the boss
   * spell script and `DoDeactivateBombFace` from `GOUse_go_gnomeface_button`, and both go through
   * the instance. It lived on the UI-layer dungeon ctx here, so a click that was not a hand click
   * could not see it. Absent = no run has engaged him (all faces off).
   * Cite: instance_gnomeregan.cpp:250-274; gnomeregan.h:47-51 sBombFace; boss_thermaplugg.cpp:263-281.
   */
  thermapluggFaces?: import('../data/dungeons/gnomeregan.ts').ThermapluggFightState;
  // Multi-step objectGate progress: setsFlag → successful use count toward needUses. Optional — absent ≡
  // {}. Survives mid-run save without SAVE_VERSION bump.
  objectGateUses?: Record<string, number>;
  // Multi-entry objectGate: setsFlag → goEntries already counted (each entry ≤1). Optional — absent ≡ {}.
  // Used when gate.goEntries has length > 1.
  objectGateUsedEntries?: Record<string, number[]>;
  /**
   * ScriptDev summon_count queue from GO-use (e.g. 3× Undead Postman per postbox).
   * Optional coords = authored GO origin for floor inject; encounterId pins the
   * summoned-body guid (Malown → postmaster-malown). Absent ≡ none pending.
   * Cite: stratholmeScripts.cpp:110,118-122; docs/dungeons/malown/README.md.
   */
  scriptPendingSummons?: Array<{
    creatureEntry: number;
    count: number;
    x?: number;
    y?: number;
    z?: number;
    /** Floor guid = summonedBodyGuid(encounterId) for the first body of this row. */
    encounterId?: string;
  }>;
  /**
   * Path-dependent encounter origins stamped at gate complete (Strat Malown 3rd box).
   * Optional — absent ≡ use EncounterDef.origin. Survives mid-run save without bump.
   * Cite: stratholmeScripts.cpp:108-110; docs/dungeons/malown/README.md.
   */
  encounterOrigins?: Record<string, { x: number; y: number; z?: number }>;
  // DR route density for this run (PACK-COMBAT-VISION §8b). Absent ≡ `bosses` for new runs; legacy mid-run
  // saves without the field still use full def order when `routeEncounterIds` is also absent.
  routeDensity?: RouteDensity;
  // DR pull fusion for this run. Absent ≡ `single`. Rest pacing stays GameState.squadStrategy /
  // SQUAD_PACING (careful|aggressive|sip).
  pullFusion?: PullFusion;
  /**
   * Materialized ordered encounter ids for this run's route (enterInstance).
   * When set, unlock / next / complete drive off this list; non-route packs are
   * never required. Absent ≡ full `def.encounters` order (legacy saves).
   */
  routeEncounterIds?: string[];
  /**
   * Budget-split route atoms (COMBAT-INTERACTION-V2 §Pack-strength budget).
   * Materialized at enter when pack-budget context is supplied. Synthetic
   * sub-pull ids (e.g. `pack__budget2`) resolve from here, not the static def.
   * Absent ≡ lookup encounters from InstanceDef only (legacy / no budget).
   */
  routeEncounters?: EncounterDef[];
  /** Pack-budget preset stamped at enter (optional; for UI / score tags). */
  packBudgetPreset?: PackBudgetPreset;
}

/** dungeonId -> epoch ms at which a timed lockout expires (5-mans never add one). */
export type LockoutMap = Record<string, number>;

export interface EnterRunOpts {
  routeDensity?: RouteDensity;
  pullFusion?: PullFusion;
  /** Precomputed route; when omitted, density is applied against a def if provided. */
  routeEncounterIds?: string[];
  /** Full encounter defs for budget-split atoms (same order as routeEncounterIds). */
  routeEncounters?: EncounterDef[];
  packBudgetPreset?: PackBudgetPreset;
}

/** Begin a fresh run of a dungeon (no progress yet). */
export function enterRun(dungeonId: string, opts?: EnterRunOpts): InstanceRun {
  const routeDensity = opts?.routeDensity ?? DEFAULT_ROUTE_DENSITY;
  const pullFusion = opts?.pullFusion ?? DEFAULT_PULL_FUSION;
  const run: InstanceRun = {
    dungeonId,
    defeated: [],
    flags: [],
    routeDensity,
    pullFusion,
  };
  if (opts?.routeEncounterIds?.length) {
    run.routeEncounterIds = [...opts.routeEncounterIds];
  }
  if (opts?.routeEncounters?.length) {
    run.routeEncounters = opts.routeEncounters.map((e) => ({ ...e }));
  }
  if (opts?.packBudgetPreset) {
    run.packBudgetPreset = opts.packBudgetPreset;
  }
  return run;
}

export interface EnterRunWithRouteOpts {
  routeDensity?: RouteDensity;
  pullFusion?: PullFusion;
  // When set with creature/spell lookups, over-budget trash packs are split into sequential sub-pulls
  // (COMBAT-INTERACTION-V2 §Pack-strength budget). Omitted → density filter only (tests / legacy).
  packBudget?: {
    partyLevel: number;
    creatureOf: CreatureLookup;
    spellOf: SpellLookup;
    /** Override preset; default derived from density + fusion. */
    preset?: PackBudgetPreset;
  };
  /**
   * Nav grid / floorplan for geometric route order (entrance-first, A* distance).
   * When omitted, uses the instance nav registry (primed when a floorplan loads).
   * Without any grid the orderer still applies flag/boss constraints and Euclidean
   * nearest-neighbour as a last-resort rank — better than declaration order, but
   * wall-aware only once a floorplan is registered.
   */
  navGrid?: NavGrid | null;
  floorplan?: NavFloorDoc | null;
  // Skip geometric reorder (tests that assert declaration / density relative order). Production enter
  // always orders geometrically.
  skipGeometricOrder?: boolean;
  /** Bags at enter — a carried 13523 sends the tour to Kirtonos, not Reliquary. */
  hasItem?: (itemEntry: number) => boolean;
  // True when the party can loot this inside-key NOW (quest conditions). 13523 is only farmable after 5384
  // is rewarded; otherwise skip Kirtonos.
  itemObtainable?: (itemEntry: number) => boolean;
  // Once-per-run pool roll (liveDungeonController.ts:252-291). When set with mapSpawns,
  // orderRouteByGeometry strips pool-absent rares + multi-slot dups.
  poolRoll?: DungeonPoolRoll | null;
  mapSpawns?: readonly PoolMapSpawn[];
  /** Persist winners on the run (MapPersistentStateMgr InitPools). */
  floorPoolSpawnedGuids?: readonly number[];
  /** Same, for the map's gameobject pools (goPoolRoll.rollDungeonGoPools). */
  floorPoolSpawnedGoGuids?: readonly number[];
  /** Alternate world door; route orders from that areatrigger dest. */
  entranceTriggerId?: number;
}

/**
 * Begin a run and materialize the density-filtered route from `def`.
 * Preferred entry from game.enterInstance.
 * Optional pack-budget context splits over-strong trash (never nerfs stats).
 * Route ids are ordered geometrically (nav-graph from entrance), not def order.
 */
export function enterRunWithRoute(
  def: InstanceDef,
  opts?: EnterRunWithRouteOpts,
): InstanceRun {
  const routeDensity = opts?.routeDensity ?? DEFAULT_ROUTE_DENSITY;
  const pullFusion = opts?.pullFusion ?? DEFAULT_PULL_FUSION;
  let route = selectRouteEncounters(def, routeDensity);
  let packBudgetPreset: PackBudgetPreset | undefined;
  if (opts?.packBudget) {
    packBudgetPreset =
      opts.packBudget.preset
      ?? packBudgetPresetFor(routeDensity, pullFusion);
    // def.maxPlayers picks the table: a 40-man keeps the legacy raid budget, a 5/10-man gets
    // the one measured against probe-dungeon-completion at band (packBudget.ts).
    route = expandRouteByPackBudget(
      route,
      opts.packBudget.partyLevel,
      opts.packBudget.creatureOf,
      opts.packBudget.spellOf,
      packBudgetPreset,
      def.maxPlayers,
    );
  }
  // Geometric order: declaration order was the player-visible scatter bug.
  // Pool strip + multi-slot rare collapse ride the same path as the live floor
  // (liveDungeonController.ts:271 stripAbsentPoolEncountersFromRoute).
  if (!opts?.skipGeometricOrder) {
    route = orderRouteByGeometry(def, route, {
      grid: opts?.navGrid,
      floorplan: opts?.floorplan,
      hasItem: opts?.hasItem,
      itemObtainable: opts?.itemObtainable,
      poolRoll: opts?.poolRoll,
      mapSpawns: opts?.mapSpawns,
      entranceTriggerId: opts?.entranceTriggerId,
    });
  } else if (opts?.mapSpawns) {
    route = filterRouteByPoolRoll(route, opts.poolRoll, opts.mapSpawns);
  }
  const run = enterRun(def.id, {
    routeDensity,
    pullFusion,
    routeEncounterIds: route.map((e) => e.id),
    ...(opts?.packBudget
      ? { routeEncounters: route, packBudgetPreset }
      : {}),
  });
  if (opts?.floorPoolSpawnedGuids) {
    run.floorPoolSpawnedGuids = [...opts.floorPoolSpawnedGuids];
  } else if (opts?.poolRoll) {
    run.floorPoolSpawnedGuids = [...opts.poolRoll.spawnedGuids];
  }
  if (opts?.floorPoolSpawnedGoGuids) {
    run.floorPoolSpawnedGoGuids = [...opts.floorPoolSpawnedGoGuids];
  }
  // molten_core.cpp:62-65 OnPlayerEnter → DoSpawnMajordomoIfCan(true).
  return applyMajordomoSpawnOnPlayerEnter(run);
}

/**
 * Re-select and re-order the route once the nav bake lands.
 *
 * Selection itself is nav-free now that density is `bosses`/`full` — the corridor spine
 * that needed the bake was deleted 2026-08-17. What still needs it is `orderRouteByGeometry`:
 * at enter time it ranks stops without a mesh, so the itinerary can start in walking order
 * and settle once the bake is in.
 *
 * Fresh runs only, and never over budget-split atoms: `routeEncounters` was materialized
 * from the route this would replace, so in practice this is the legacy-save path —
 * `enterInstance` always passes a packBudget and `reapplyGeometricRouteOrder` handles the rest.
 */
/**
 * Bring an IN-FLIGHT run route in line with its density.
 *
 * `reapplyRouteSelection` below returns early on `run.routeEncounters`, and EVERY live run has
 * that field (enterInstance always passes packBudget), so a run entered before a density change
 * keeps its old stop list for the rest of its life. `state.instance` is persisted, so that means
 * across reloads too: a blackrock-depths run entered under the old `normal` default still walks
 * its 235 trash stops after the default moved to `bosses`, and the autopilot still names them.
 *
 * Cleared stops are KEPT so isCleared / isComplete / routeBossProgress stay coherent; only
 * UNCLEARED stops the current density would not select are dropped. Budget-split atoms
 * (`<id>__budgetN`, packBudget.ts:526) resolve to their base encounter before the test.
 */
export function pruneRouteToDensity(def: InstanceDef, run: InstanceRun): InstanceRun {
  const ids = run.routeEncounterIds;
  if (!ids?.length) return run;
  const density = run.routeDensity ?? DEFAULT_ROUTE_DENSITY;
  const keep = new Set(selectRouteEncounters(def, density).map((e) => e.id));
  const baseOf = (id: string): string => id.split('__budget')[0] ?? id;
  const next = ids.filter((id) => isCleared(run, id) || keep.has(baseOf(id)));
  if (next.length === ids.length) return run;
  const out: InstanceRun = { ...run, routeEncounterIds: next };
  if (run.routeEncounters?.length) {
    const kept = new Set(next);
    out.routeEncounters = run.routeEncounters.filter((e) => kept.has(e.id));
  }
  return out;
}

export function reapplyRouteSelection(
  def: InstanceDef,
  run: InstanceRun,
  opts?: {
    navGrid?: NavGrid | null;
    floorplan?: NavFloorDoc | null;
    hasItem?: (itemEntry: number) => boolean;
    itemObtainable?: (itemEntry: number) => boolean;
  },
): InstanceRun {
  if (run.defeated.length > 0 || (run.flags?.length ?? 0) > 0) return run;
  if (run.routeEncounters?.length) return run;
  const density = run.routeDensity ?? DEFAULT_ROUTE_DENSITY;
  const ids = orderRouteByGeometry(def, selectRouteEncounters(def, density), {
    grid: opts?.navGrid,
    floorplan: opts?.floorplan,
    hasItem: opts?.hasItem,
    itemObtainable: opts?.itemObtainable,
  }).map((e) => e.id);
  const prev = run.routeEncounterIds ?? [];
  if (prev.length === ids.length && prev.every((id, i) => id === ids[i])) return run;
  return { ...run, routeEncounterIds: ids };
}

// Re-apply geometric route order on a fresh run (defeated empty) once a floorplan nav grid becomes
// available. No-op when progress has started.
export function reapplyGeometricRouteOrder(
  def: InstanceDef,
  run: InstanceRun,
  opts?: {
    navGrid?: NavGrid | null;
    floorplan?: NavFloorDoc | null;
    hasItem?: (itemEntry: number) => boolean;
    itemObtainable?: (itemEntry: number) => boolean;
  },
): InstanceRun {
  if (run.defeated.length > 0) return run;
  // Resolve current route atoms (budget splits live on run.routeEncounters).
  let route: EncounterDef[];
  if (run.routeEncounters?.length) {
    const byId = new Map(run.routeEncounters.map((e) => [e.id, e]));
    const ids = run.routeEncounterIds ?? run.routeEncounters.map((e) => e.id);
    route = [];
    for (const id of ids) {
      const e = byId.get(id);
      if (e) route.push(e);
    }
  } else {
    const ids = run.routeEncounterIds ?? def.encounters.map((e) => e.id);
    route = [];
    for (const id of ids) {
      const e = encounterOf(def, id, run);
      if (e) route.push(e);
    }
  }
  const ordered = orderRouteByGeometry(def, route, {
    grid: opts?.navGrid,
    floorplan: opts?.floorplan,
    hasItem: opts?.hasItem,
    itemObtainable: opts?.itemObtainable,
  });
  const ids = ordered.map((e) => e.id);
  const prev = run.routeEncounterIds ?? [];
  if (
    prev.length === ids.length
    && prev.every((id, i) => id === ids[i])
    && (!run.routeEncounters?.length
      || ordered.every((e, i) => !e.optional || run.routeEncounters?.[i]?.optional === e.optional))
  ) {
    return run;
  }
  const next: InstanceRun = {
    ...run,
    routeEncounterIds: ids,
  };
  if (run.routeEncounters?.length) {
    next.routeEncounters = ordered;
  }
  return next;
}

/** Wipe progress for a fresh attempt — keeps density / fusion / route list. */
export function resetRun(run: InstanceRun): InstanceRun {
  return {
    dungeonId: run.dungeonId,
    defeated: [],
    flags: [],
    ...(run.routeDensity != null ? { routeDensity: run.routeDensity } : {}),
    ...(run.pullFusion != null ? { pullFusion: run.pullFusion } : {}),
    ...(run.routeEncounterIds?.length
      ? { routeEncounterIds: [...run.routeEncounterIds] }
      : {}),
    ...(run.routeEncounters?.length
      ? { routeEncounters: run.routeEncounters.map((e) => ({ ...e })) }
      : {}),
    ...(run.packBudgetPreset != null ? { packBudgetPreset: run.packBudgetPreset } : {}),
  };
  // objectGateUses / objectGateUsedEntries intentionally dropped (fresh attempt).
}

// Ordered encounter ids for progress checks. Prefers the run's materialized route; falls back to full def
// order (legacy saves without DR fields).
export function routeEncounterIdList(def: InstanceDef, run: InstanceRun): string[] {
  if (run.routeEncounterIds?.length) return run.routeEncounterIds;
  return def.encounters.map((e) => e.id);
}

/** Encounter defs on the active route (lookup from full def; preserves route order). */
export function routeEncounterList(def: InstanceDef, run: InstanceRun): EncounterDef[] {
  // Prefer budget-materialized atoms (may include synthetic sub-pull ids).
  if (run.routeEncounters?.length) {
    const byId = new Map(run.routeEncounters.map((e) => [e.id, e]));
    const out: EncounterDef[] = [];
    for (const id of routeEncounterIdList(def, run)) {
      const e = byId.get(id) ?? encounterOf(def, id);
      if (e) out.push(e);
    }
    return out;
  }
  const out: EncounterDef[] = [];
  for (const id of routeEncounterIdList(def, run)) {
    const e = encounterOf(def, id, run);
    if (e) out.push(e);
  }
  return out;
}

// Resolve an encounter by id. When `run` carries budget-split `routeEncounters`, those take precedence
// (synthetic `__budgetN` atoms are not on InstanceDef).
export function encounterOf(
  def: InstanceDef,
  encounterId: string,
  run?: InstanceRun | null,
): EncounterDef | undefined {
  if (run?.routeEncounters?.length) {
    const fromRun = run.routeEncounters.find((e) => e.id === encounterId);
    if (fromRun) return fromRun;
  }
  return def.encounters.find((e) => e.id === encounterId);
}

export function isCleared(run: InstanceRun, encounterId: string): boolean {
  return run.defeated.includes(encounterId);
}

// ---- flags -----------------------------------------------------------------

/** Flags present on this run (empty when unset). */
export function runFlags(run: InstanceRun): readonly string[] {
  return run.flags ?? [];
}

export function hasFlag(run: InstanceRun, flag: string): boolean {
  return (run.flags ?? []).includes(flag);
}

/** Add a flag (pure; idempotent — same reference when already present). */
export function setFlag(run: InstanceRun, flag: string): InstanceRun {
  if ((run.flags ?? []).includes(flag)) return run;
  return { ...run, flags: [...(run.flags ?? []), flag] };
}

/** `requiresFlag` entries on an encounter (empty when none). */
export function requiredFlags(enc: EncounterDef): string[] {
  const out: string[] = [];
  for (const ev of enc.events ?? []) {
    if (ev.kind === 'requiresFlag') out.push(ev.flag);
  }
  return out;
}

/** `setsFlag` entries applied when the encounter fully clears. */
export function flagsSetOnClear(enc: EncounterDef): string[] {
  const out: string[] = [];
  for (const ev of enc.events ?? []) {
    if (ev.kind === 'setsFlag') out.push(ev.flag);
  }
  return out;
}

/**
 * An encounter is engageable once every `requiresFlag` on it is satisfied. Encounters
 * not on the run's route are never unlocked.
 *
 * THE ROUTE ORDER IS AN ITINERARY, NOT A LOCK. This used to also require every
 * non-optional route stop listed before it to be cleared, and that prefix was invented
 * scaffolding — vanilla gates a dungeon with doors, keys and script flags, never with
 * "kill the pack in front first". Three measurements against it:
 *
 *   - blackrock-depths 2026-08-17 (probe-run-trace, band L55, 300 s at 8x): the route was
 *     257 stops, so boss 4 sat behind 235 trash prerequisites. 3/22 bosses, 8/257 stops,
 *     and the autopilot's target at the end was `230-3fe13518` — a trash pack, because
 *     `nextAutoBossId` is forced to walk to "the first uncleared non-optional predecessor".
 *   - scholomance (dungeonRouteOrder.ts:531): one mis-ordered key gate "blocked all 49
 *     stops behind it: 9/58 cleared, 0/13 bosses".
 *   - UBRS / SFK (liveAutopilot.ts:472): the prefix read as sealed for nearby trash, so
 *     8-10 of ~10 packs never streamed and chips never painted.
 *
 * The order still decides what the party WALKS to (`nextEncounter`, `routeEncounterList`,
 * `nextAutoBossId`); it no longer decides what it may pull once it is standing there.
 */
export function isUnlocked(def: InstanceDef, run: InstanceRun, encounterId: string): boolean {
  const seq = routeEncounterIdList(def, run);
  if (!seq.includes(encounterId)) return false;
  const enc = encounterOf(def, encounterId, run);
  if (!enc) return false;
  for (const flag of requiredFlags(enc)) {
    if (!hasFlag(run, flag)) return false;
  }
  return true;
}

/**
 * Optional route encounter that drops an inside-key for a missing gate flag.
 * Same "sealed boss is not a destination — walk to what opens it" rule as
 * liveAutopilot, for keys that only drop from optional pulls (DMN Inner Door
 * key 18268 ← Guard Mol'dar). Kromcrush hosts the GO but is not the dropper.
 */
function optionalKeyOpenerForFlags(
  def: InstanceDef,
  run: InstanceRun,
  seq: readonly string[],
  missingFlags: readonly string[],
): EncounterDef | undefined {
  if (missingFlags.length === 0) return undefined;
  const need = new Set(missingFlags);
  const items = new Set<number>();
  for (const other of def.encounters) {
    for (const gate of objectGateEvents(other)) {
      if (!need.has(gate.setsFlag) || gate.requiredItem == null) continue;
      items.add(gate.requiredItem);
    }
  }
  for (const item of items) {
    const sources = routeItemSources(def.id, item);
    // Empty ⇒ outside key; autoAdvanceRouteGates bypasses those — not a dest.
    if (sources.length === 0) continue;
    for (const id of seq) {
      if (!sources.includes(id)) continue;
      if (isCleared(run, id) || !isUnlocked(def, run, id)) continue;
      const enc = encounterOf(def, id, run);
      // Only the optional exception — non-optional sources are primary dests above.
      if (!enc || enc.optional !== true) continue;
      return enc;
    }
  }
  return undefined;
}

/**
 * The next engageable uncleared **non-optional** route encounter, or undefined
 * if none remain (route complete, only optionals left, or remaining pulls are
 * flag-gated). Matches `isComplete` and liveAutopilot destination skips — an
 * optional boss is skippable, not deleted; `beginEncounter(def, optionalId)`
 * still works when the player pulls it by hand.
 *
 * Exception: when a required encounter is sealed on a flag whose objectGate key
 * drops only from an optional encounter still on the route, dest that opener
 * (e.g. Guard Mol'dar for Gordok Inner Door key 18268) so the door can fire
 * without pulling unrelated optionals like Captain Kromcrush.
 */
export function nextEncounter(def: InstanceDef, run: InstanceRun): EncounterDef | undefined {
  const seq = routeEncounterIdList(def, run);
  for (const id of seq) {
    if (isCleared(run, id) || !isUnlocked(def, run, id)) continue;
    const enc = encounterOf(def, id, run);
    // Optional tribute / skippable rares are not auto-run destinations.
    if (enc?.optional === true) continue;
    return enc;
  }
  // No unlocked required stop — look for an optional key-dropper that opens one.
  for (const id of seq) {
    if (isCleared(run, id)) continue;
    const enc = encounterOf(def, id, run);
    if (!enc || enc.optional === true) continue;
    const missing = requiredFlags(enc).filter((f) => !hasFlag(run, f));
    const opener = optionalKeyOpenerForFlags(def, run, seq, missing);
    if (opener) return opener;
  }
  return undefined;
}

/** True once every non-optional route encounter has been cleared this run. */
export function isComplete(def: InstanceDef, run: InstanceRun): boolean {
  return routeEncounterIdList(def, run).every((id) => {
    if (isCleared(run, id)) return true;
    return encounterOf(def, id, run)?.optional === true;
  });
}

/** Record an encounter as defeated (returns a new run; idempotent). */
export function markDefeated(run: InstanceRun, encounterId: string): InstanceRun {
  if (run.defeated.includes(encounterId)) return run;
  return { ...run, defeated: [...run.defeated, encounterId] };
}

/**
 * Mark an encounter cleared and apply its `setsFlag` events (and optional extra
 * flags, e.g. HP phase markers). Pure; idempotent for the defeat list.
 *
 * Object gates are **not** applied here — use `useObjectGate` (manual, item
 * checked) or `autoAdvanceRouteGates` (auto-run, item-bypassed + orphan flags).
 */
export function applyEncounterCleared(
  run: InstanceRun,
  enc: EncounterDef,
  extraFlags?: readonly string[],
): InstanceRun {
  let next = markDefeated(run, enc.id);
  for (const f of flagsSetOnClear(enc)) next = setFlag(next, f);
  if (extraFlags) {
    for (const f of extraFlags) next = setFlag(next, f);
  }
  return next;
}

/** How many bosses this dungeon has, and how many are down — for a progress hint. */
export function bossProgress(def: InstanceDef, run: InstanceRun): { down: number; total: number } {
  const bosses = def.encounters.filter((e) => e.kind === 'boss');
  return { down: bosses.filter((e) => isCleared(run, e.id)).length, total: bosses.length };
}

// Boss progress on the **active route only** (density-filtered). Use for run scoring / "route cleared" UI
// so Normal/Speedrun aren't graded against Full.
export function routeBossProgress(def: InstanceDef, run: InstanceRun): { down: number; total: number } {
  // Optional tribute guards do not count toward "route cleared" progress.
  const bosses = routeEncounterList(def, run).filter((e) => e.kind === 'boss' && !e.optional);
  return { down: bosses.filter((e) => isCleared(run, e.id)).length, total: bosses.length };
}

// ---- event DSL: waves / death-summon / HP thresholds / object gates --------

/** First `waves` event on the encounter, if any. */
export function wavesEvent(
  enc: EncounterDef,
): Extract<EncounterEvent, { kind: 'waves' }> | undefined {
  return (enc.events ?? []).find((e): e is Extract<EncounterEvent, { kind: 'waves' }> => e.kind === 'waves');
}

/**
 * Waves this encounter can run ON THE FLOOR: authored `waves` whose primary
 * appears on the final wave (Ring / Doom'rel / Grubbis) OR on the first wave
 * with a later follow-up pack (SFK Fenrus → voidwalkers after death). Flattened
 * to entry/count for the live controller sequencer.
 * Cite: instance_shadowfang_keep.cpp:184-191 TYPE_FENRUS DONE → Arugal + voidwalkers;
 * shadowfang_keep.cpp:443-460 ARCHMAGE_VOIDWALKERS summon NPC_VOIDWALKER×4.
 * Null when there are no waves or neither accepted shape matches.
 */
export function floorGauntletWaves(
  enc: EncounterDef,
): { entry: number; count: number }[][] | null {
  const w = wavesEvent(enc);
  if (!w?.waves.length) return null;
  const primary = enc.creatureEntry;
  if (!(primary > 0)) return null;
  const first = w.waves[0]!.pack ?? [];
  const last = w.waves[w.waves.length - 1]!.pack ?? [];
  const lastHas = last.some((m) => m.creatureEntry === primary);
  const firstHas = first.some((m) => m.creatureEntry === primary);
  if (!lastHas && !firstHas) return null;
  return w.waves.map((wave) =>
    (wave.pack ?? []).map((m) => ({ entry: m.creatureEntry, count: m.count })),
  );
}

/** Ordered `onDeathSummon` events (phase-chain after primary). */
export function onDeathSummons(
  enc: EncounterDef,
): Extract<EncounterEvent, { kind: 'onDeathSummon' }>[] {
  return (enc.events ?? []).filter(
    (e): e is Extract<EncounterEvent, { kind: 'onDeathSummon' }> => e.kind === 'onDeathSummon',
  );
}

/** Ordered `hpThreshold` events (stable authored order). */
export function hpThresholdEvents(
  enc: EncounterDef,
): Extract<EncounterEvent, { kind: 'hpThreshold' }>[] {
  return (enc.events ?? []).filter(
    (e): e is Extract<EncounterEvent, { kind: 'hpThreshold' }> => e.kind === 'hpThreshold',
  );
}

// Object-gate events on this encounter (and, when scanning a dungeon, callers iterate all encounters).
// `once` defaults to true.
export function objectGateEvents(
  enc: EncounterDef,
): Extract<EncounterEvent, { kind: 'objectGate' }>[] {
  return (enc.events ?? []).filter(
    (e): e is Extract<EncounterEvent, { kind: 'objectGate' }> => e.kind === 'objectGate',
  );
}

/** Entries that satisfy an objectGate (`goEntries` or sole `goEntry`). */
export function objectGateAcceptedEntries(
  gate: Extract<EncounterEvent, { kind: 'objectGate' }>,
): number[] {
  if (gate.goEntries?.length) return [...gate.goEntries];
  return [gate.goEntry];
}

/** Uses required before setsFlag (default 1). */
export function objectGateNeedUses(
  gate: Extract<EncounterEvent, { kind: 'objectGate' }>,
): number {
  const n = gate.needUses ?? 1;
  return n > 0 ? n : 1;
}

/** Find the first objectGate in the instance matching `goEntry` (primary or goEntries). */
export function findObjectGate(
  def: InstanceDef,
  goEntry: number,
): { encounter: EncounterDef; gate: Extract<EncounterEvent, { kind: 'objectGate' }> } | undefined {
  for (const enc of def.encounters) {
    for (const g of objectGateEvents(enc)) {
      if (g.goEntry === goEntry || g.goEntries?.includes(goEntry)) {
        return { encounter: enc, gate: g };
      }
    }
  }
  return undefined;
}

/**
 * How many auto-chained phases this encounter has (including the initial phase 0).
 * - waves: waves.length
 * - onDeathSummon: 1 + summons.length
 * - hpThreshold with spawn: 1 (primary) + number of thresholds that have spawn
 * - otherwise: 1
 *
 * When both waves and onDeathSummon are authored, waves win (mutually exclusive
 * authoring intent for Wave 1).
 */
export function encounterPhaseCount(enc: EncounterDef): number {
  const waves = wavesEvent(enc);
  if (waves && waves.waves.length > 0) return waves.waves.length;

  const summons = onDeathSummons(enc);
  const hpSpawns = hpThresholdEvents(enc).filter((t) => (t.spawn?.length ?? 0) > 0);
  // Primary + each death-summon + each HP-spawn phase (HP spawns chain after summons).
  return 1 + summons.length + hpSpawns.length;
}

/**
 * Uniform CSE roll over survey/DB candidates only.
 * CMaNGOS pattern: Creature::ResetEntry / GetRandomCreatureEntry (creature_spawn_entry).
 * `rng` must return [0, 1) — inject mulberry32 / LOCK 4 (never Math.random / wall clock).
 */
export function pickPoolCandidate(candidates: readonly number[], rng: () => number): number {
  if (candidates.length === 0) {
    throw new Error('pickPoolCandidate: empty candidates');
  }
  if (candidates.length === 1) return candidates[0]!;
  const u = rng();
  const idx = Math.min(candidates.length - 1, Math.floor(u * candidates.length));
  return candidates[idx]!;
}

// Resolve CSE placeholders on one pack row to a concrete creatureEntry. Non-pool rows pass through. count
// preserved.
export function materializePackMember(
  row: EncounterPackMember,
  rng: () => number,
): EncounterPackMember {
  if (!row.poolCandidates?.length) {
    return { creatureEntry: row.creatureEntry, count: row.count };
  }
  // One CSE slot per guid: count must be 1; still materialize count times if mis-authored.
  if (row.count <= 1) {
    return { creatureEntry: pickPoolCandidate(row.poolCandidates, rng), count: 1 };
  }
  // Degenerate: expand multi-count CSE into one roll each (should not be authored).
  return {
    creatureEntry: pickPoolCandidate(row.poolCandidates, rng),
    count: row.count,
  };
}

// Materialize CSE on an encounter (primary poolCandidates + pack rows). Returns a concrete pull safe for
// combat / kill credit. Injected RNG only.
export function materializeEncounterCse(
  enc: EncounterDef,
  rng: () => number,
): EncounterDef {
  const next: EncounterDef = {
    ...enc,
    creatureEntry: enc.poolCandidates?.length
      ? pickPoolCandidate(enc.poolCandidates, rng)
      : enc.creatureEntry,
  };
  delete next.poolCandidates;
  if (enc.pack?.length) {
    next.pack = enc.pack.map((row) => materializePackMember(row, rng));
  }
  return next;
}

/**
 * Resolved pull for one phase of a multi-phase encounter.
 * Returns null when `phaseIndex` is out of range.
 *
 * Phase layout:
 *   waves:           phase i → waves[i].pack (first row is primary)
 *   else:            phase 0 → primary + pack
 *                    next phases → each onDeathSummon in order
 *                    then each hpThreshold with spawn (pack becomes the pull)
 *
 * Optional `rng`: when provided, CSE poolCandidates are rolled to concrete entries
 * (run/fight start — CMaNGOS ResetEntry). Without rng, placeholders remain
 * (first candidate) for pure graph inspection.
 */
export function resolveEncounterPhase(
  enc: EncounterDef,
  phaseIndex: number,
  rng?: () => number,
): {
  creatureEntry: number;
  bossSpells?: number[];
  pack?: EncounterPackMember[];
} | null {
  if (phaseIndex < 0) return null;

  const base = rng ? materializeEncounterCse(enc, rng) : enc;

  const waves = wavesEvent(base);
  if (waves && waves.waves.length > 0) {
    const w = waves.waves[phaseIndex];
    if (!w) return null;
    const pack = rng
      ? w.pack.map((row) => materializePackMember(row, rng))
      : w.pack;
    return packToPull(pack);
  }

  if (phaseIndex === 0) {
    return {
      creatureEntry: base.creatureEntry,
      bossSpells: base.bossSpells,
      pack: base.pack,
    };
  }

  const summons = onDeathSummons(base);
  if (phaseIndex <= summons.length) {
    const s = summons[phaseIndex - 1]!;
    return { creatureEntry: s.creatureEntry, bossSpells: s.bossSpells };
  }

  const hpSpawns = hpThresholdEvents(base).filter((t) => (t.spawn?.length ?? 0) > 0);
  const hi = phaseIndex - 1 - summons.length;
  const thr = hpSpawns[hi];
  if (!thr?.spawn) return null;
  const spawn = rng
    ? thr.spawn.map((row) => materializePackMember(row, rng))
    : thr.spawn;
  return packToPull(spawn);
}

/** Expand a pack table into primary + remaining pack members (first count>0 row wins as primary). */
export function packToPull(
  pack: EncounterPackMember[],
): { creatureEntry: number; pack?: EncounterPackMember[] } | null {
  const expanded: EncounterPackMember[] = [];
  for (const row of pack) {
    if (row.count <= 0) continue;
    // Drop poolCandidates from combat pull (callers should materialize first).
    expanded.push({ creatureEntry: row.creatureEntry, count: row.count });
  }
  if (expanded.length === 0) return null;
  const head = expanded[0]!;
  const rest: EncounterPackMember[] = [];
  if (head.count > 1) rest.push({ creatureEntry: head.creatureEntry, count: head.count - 1 });
  for (let i = 1; i < expanded.length; i++) rest.push(expanded[i]!);
  return {
    creatureEntry: head.creatureEntry,
    pack: rest.length ? rest : undefined,
  };
}

/**
 * Which HP thresholds fire at the given primary HP percent (0–100).
 * `fired` is the set of threshold keys already consumed (`once` default true).
 * Key format: `hp:<pct>` or `hp:<pct>:phase:<n>` when phase is authored.
 */
export function hpThresholdKey(t: Extract<EncounterEvent, { kind: 'hpThreshold' }>): string {
  return t.phase != null ? `hp:${t.pct}:phase:${t.phase}` : `hp:${t.pct}`;
}

export function thresholdsAtHp(
  thresholds: readonly Extract<EncounterEvent, { kind: 'hpThreshold' }>[],
  hpPct: number,
  fired: ReadonlySet<string> | readonly string[],
): Extract<EncounterEvent, { kind: 'hpThreshold' }>[] {
  const done = fired instanceof Set ? fired : new Set(fired);
  const out: Extract<EncounterEvent, { kind: 'hpThreshold' }>[] = [];
  for (const t of thresholds) {
    if (hpPct > t.pct) continue;
    const key = hpThresholdKey(t);
    const once = t.once !== false;
    if (once && done.has(key)) continue;
    out.push(t);
  }
  return out;
}

// Flags to set when the primary has been reduced to `hpPct` (and/or killed at 0). Includes `phase:<n>` for
// authored phase numbers and the stable `hpThresholdKey`.
export function flagsForHpThresholds(
  thresholds: readonly Extract<EncounterEvent, { kind: 'hpThreshold' }>[],
  hpPct: number,
  already: ReadonlySet<string> | readonly string[],
): string[] {
  const fired = thresholdsAtHp(thresholds, hpPct, already);
  const out: string[] = [];
  for (const t of fired) {
    out.push(hpThresholdKey(t));
    if (t.phase != null) out.push(`phase:${t.phase}`);
  }
  return out;
}

// Result of attempting to use an instance object (GO entry). Pure: does not touch inventory (caller checks
// item presence and spends `consumeItem`).
export type UseObjectResult =
  | {
      ok: true;
      run: InstanceRun;
      flag: string;
      already: boolean;
      /** Uses counted toward needUses after this call (0 when already). */
      uses: number;
      needUses: number;
      /** True when this call set (or already had) setsFlag. */
      completed: boolean;
      /** Entry to destroy one of (successful use, spellcharges_1 < 0). Cite: Spell.cpp:4209 TakeCastItem. */
      consumeItem?: number;
    }
  | { ok: false; reason: string };

/**
 * Apply an object-use gate. `hasItem` is true when the optional required item is
 * available (caller owns inventory). When `once` (default true) and the flag is
 * already set, returns ok with `already: true` and an unchanged run (no-op).
 *
 * Multi-step: increments objectGateUses[setsFlag]; sets flag only when uses ≥ needUses
 * (default 1). Multi-entry gates (goEntries length > 1) count each entry at most once.
 * Each successful use reports `consumeItem` independently (ST 4× Hakkari Blood).
 */
export function useObjectGate(
  run: InstanceRun,
  gate: Extract<EncounterEvent, { kind: 'objectGate' }>,
  hasItem: boolean,
  opts?: { goEntry?: number; /** ItemDef.charges for gate.requiredItem (0 = keep). */ itemCharges?: number },
): UseObjectResult {
  const need = objectGateNeedUses(gate);
  const allowed = objectGateAcceptedEntries(gate);
  const usedEntry = opts?.goEntry ?? gate.goEntry;
  if (!allowed.includes(usedEntry)) {
    return { ok: false, reason: 'Nothing happens' };
  }
  // already before the item check: a consumed key must not turn a no-op into "you lack".
  const once = gate.once !== false;
  if (once && hasFlag(run, gate.setsFlag)) {
    return {
      ok: true,
      run,
      flag: gate.setsFlag,
      already: true,
      uses: need,
      needUses: need,
      completed: true,
    };
  }

  const multiEntry = allowed.length > 1;
  const prevUsed = run.objectGateUsedEntries?.[gate.setsFlag] ?? [];
  if (multiEntry && prevUsed.includes(usedEntry)) {
    const uses = run.objectGateUses?.[gate.setsFlag] ?? prevUsed.length;
    return {
      ok: true,
      run,
      flag: gate.setsFlag,
      already: true,
      uses,
      needUses: need,
      completed: hasFlag(run, gate.setsFlag),
    };
  }

  if (gate.requiredItem != null && !hasItem) {
    return { ok: false, reason: 'You lack the required item' };
  }

  let next: InstanceRun = run;
  if (multiEntry) {
    const usedEntries = [...prevUsed, usedEntry];
    next = {
      ...next,
      objectGateUsedEntries: {
        ...(next.objectGateUsedEntries ?? {}),
        [gate.setsFlag]: usedEntries,
      },
    };
  }
  const prevCount = next.objectGateUses?.[gate.setsFlag] ?? 0;
  const count = prevCount + 1;
  next = {
    ...next,
    objectGateUses: { ...(next.objectGateUses ?? {}), [gate.setsFlag]: count },
  };
  if (count >= need) {
    next = setFlag(next, gate.setsFlag);
    // Strat postboxes: Malown spawns at the box that completed needUses=3.
    // Cite: stratholmeScripts.cpp:108-110; docs/dungeons/malown/README.md.
    if (gate.setsFlag === STRATH_LIVE_POSTBOX.setsFlag) {
      const origin = postboxOrigin(usedEntry);
      if (origin) {
        next = {
          ...next,
          encounterOrigins: {
            ...(next.encounterOrigins ?? {}),
            [STRATH_LIVE_POSTBOX.encId]: { x: origin.x, y: origin.y, z: origin.z },
          },
        };
      }
    }
  }
  // TakeCastItem destroys only when SpellCharges < 0; bake stamps 0 and omits −1.
  const consumeItem =
    gate.requiredItem != null && opts?.itemCharges !== 0 ? gate.requiredItem : undefined;
  return {
    ok: true,
    run: next,
    flag: gate.setsFlag,
    already: false,
    uses: count,
    needUses: need,
    completed: count >= need,
    ...(consumeItem != null ? { consumeItem } : {}),
  };
}

/** Flags an encounter sets on clear (setsFlag events + hosted objectGate.setsFlag). */
export function flagsSetByEncounter(enc: EncounterDef): string[] {
  const out: string[] = [...flagsSetOnClear(enc)];
  for (const gate of objectGateEvents(enc)) {
    if (!out.includes(gate.setsFlag)) out.push(gate.setsFlag);
  }
  return out;
}

/**
 * Auto-run helper: for every uncleared encounter that is sequentially reachable
 * but missing flags, try matching objectGates anywhere in the instance.
 *
 * `hasItem` gates real inventory for UI-driven use. Pass
 * `opts.ignoreRequiredItem: true` on squad/live/headless auto-runs so OUTSIDE key
 * items (Seal of Ascension, Staff of Prehistoria, …) do not soft-lock the route.
 * Keys that drop inside this instance stay honest via `opts.keyDropsInside`.
 * Manual object-use still enforces items via `useObjectGate`.
 */
export function autoFireObjectGates(
  def: InstanceDef,
  run: InstanceRun,
  hasItem: (itemEntry: number) => boolean,
  opts?: {
    ignoreRequiredItem?: boolean;
    /** True when the key drops from creatures/GOs in this instance (plan 4d). */
    keyDropsInside?: (itemEntry: number) => boolean;
  },
): { run: InstanceRun; fired: number; consumedItems: number[] } {
  let next = run;
  let fired = 0;
  const consumedItems: number[] = [];
  const seq = routeEncounterIdList(def, run);
  const ignoreItem = opts?.ignoreRequiredItem === true;
  const dropsInside = opts?.keyDropsInside;
  // Iterate until no new gates fire (flags can unlock further gated uses).
  for (let guard = 0; guard < 32; guard++) {
    let progressed = false;
    for (const encId of seq) {
      const enc = encounterOf(def, encId, next);
      if (!enc) continue;
      if (isCleared(next, enc.id)) continue;
      // Sequential **route** prefix must be clear before we auto-open gates.
      // Optional tribute guards do not block gate firing for later pulls.
      const idx = seq.indexOf(enc.id);
      let seqOk = true;
      for (let i = 0; i < idx; i++) {
        const prev = encounterOf(def, seq[i]!, next);
        if (prev?.optional) continue;
        if (!isCleared(next, seq[i]!)) {
          seqOk = false;
          break;
        }
      }
      if (!seqOk) continue;

      const missing = requiredFlags(enc).filter((f) => !hasFlag(next, f));
      if (missing.length === 0) continue;

      // Search whole instance for objectGates that set a missing flag.
      for (const other of def.encounters) {
        for (const gate of objectGateEvents(other)) {
          if (!missing.includes(gate.setsFlag)) continue;
          const req = gate.requiredItem;
          const honest = req != null && dropsInside?.(req) === true;
          const owned = req == null || hasItem(req);
          const okItem = owned || (ignoreItem && !honest);
          // Multi-step: walk accepted entries (or repeat sole entry needUses times).
          const allowed = objectGateAcceptedEntries(gate);
          const need = objectGateNeedUses(gate);
          if (allowed.length > 1) {
            for (const entry of allowed) {
              if (hasFlag(next, gate.setsFlag)) break;
              const field = moltenCoreRuneField(entry);
              // molten_coreScripts.cpp:47-52 GetData != DONE → no SetData SPECIAL.
              if (
                field != null
                && (next.scriptInstanceData?.[field] ?? INSTANCE_DATA.NOT_STARTED)
                  !== INSTANCE_DATA.DONE
              ) {
                continue;
              }
              const r = useObjectGate(next, gate, okItem, { goEntry: entry });
              if (r.ok && !r.already) {
                next = r.run;
                if (field != null) next = applyMoltenCoreRuneSpecial(next, field);
                fired++;
                progressed = true;
                // Spend only when the party actually held the item (not outside-key bypass).
                if (r.consumeItem != null && owned) consumedItems.push(r.consumeItem);
              }
            }
          } else {
            for (let i = 0; i < need; i++) {
              if (hasFlag(next, gate.setsFlag)) break;
              const entry = allowed[0]!;
              const field = moltenCoreRuneField(entry);
              if (
                field != null
                && (next.scriptInstanceData?.[field] ?? INSTANCE_DATA.NOT_STARTED)
                  !== INSTANCE_DATA.DONE
              ) {
                break;
              }
              const r = useObjectGate(next, gate, okItem, { goEntry: entry });
              if (r.ok && !r.already) {
                next = r.run;
                if (field != null) next = applyMoltenCoreRuneSpecial(next, field);
                fired++;
                progressed = true;
                if (r.consumeItem != null && owned) consumedItems.push(r.consumeItem);
              } else {
                break;
              }
            }
          }
        }
      }
    }
    if (!progressed) break;
  }
  return { run: next, fired, consumedItems };
}

/**
 * When route density skips the packs that would `setsFlag` a gate (e.g. SFK
 * top-floor worgs, Strat courtyard band, UBRS rune rooms), auto-set those flags
 * so the run does not soft-lock on Normal/Speedrun.
 *
 * Density orphans are `setsFlag`-on-clear only. Never stamp a flag that any
 * `objectGate.setsFlag` produces — key doors stay on autoFire honesty + manual use
 * (Deadmines iron-clad / Defias Gunpowder 5397).
 */
export function autoSatisfyOrphanRouteFlags(
  def: InstanceDef,
  run: InstanceRun,
): { run: InstanceRun; fired: number } {
  let next = run;
  let fired = 0;
  const seq = routeEncounterIdList(def, run);

  const objectGateFlags = new Set<string>();
  for (const enc of def.encounters) {
    for (const gate of objectGateEvents(enc)) objectGateFlags.add(gate.setsFlag);
  }

  for (let guard = 0; guard < 32; guard++) {
    let progressed = false;
    for (const encId of seq) {
      const enc = encounterOf(def, encId, next);
      if (!enc || isCleared(next, enc.id)) continue;
      const idx = seq.indexOf(enc.id);
      let seqOk = true;
      for (let i = 0; i < idx; i++) {
        // Optional stops are skippable, not prerequisites — the same read `diagnose` and
        // `nextEncounter` take. Counting them here meant one un-pulled optional boss held the
        // stamp forever, so `wc-disciple-ritual` (no setter anywhere) read as an authoring gap.
        if (encounterOf(def, seq[i]!, next)?.optional) continue;
        if (!isCleared(next, seq[i]!)) {
          seqOk = false;
          break;
        }
      }
      if (!seqOk) continue;

      for (const flag of requiredFlags(enc)) {
        if (hasFlag(next, flag)) continue;
        // Key / GO doors: never density-orphan-stamp (KI-940).
        if (objectGateFlags.has(flag)) continue;

        // Route encounters that set this flag on clear (setsFlag events only).
        const setters: string[] = [];
        for (const sid of seq) {
          const sEnc = encounterOf(def, sid, next);
          if (!sEnc) continue;
          if (flagsSetOnClear(sEnc).includes(flag)) setters.push(sid);
        }

        // Orphan: nothing on this route sets the flag (density skipped them).
        // Or all setters already cleared but flag still missing (authoring gap).
        const orphan =
          setters.length === 0
          || setters.every((sid) => isCleared(next, sid));
        if (!orphan) continue;

        next = setFlag(next, flag);
        fired++;
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  return { run: next, fired };
}

// Full auto-run unlock pass: object gates (outside keys bypassed; in-instance keys honest) + orphan density
// flags. Call before every `nextEncounter` in live / headless / runFullDungeon.
export function autoAdvanceRouteGates(
  def: InstanceDef,
  run: InstanceRun,
  hasItem: (itemEntry: number) => boolean = () => false,
  opts?: { keyDropsInside?: (itemEntry: number) => boolean },
): { run: InstanceRun; fired: number; consumedItems: number[] } {
  let next = run;
  let fired = 0;
  const consumedItems: number[] = [];
  for (let guard = 0; guard < 8; guard++) {
    const a = autoFireObjectGates(def, next, hasItem, {
      ignoreRequiredItem: true,
      keyDropsInside: opts?.keyDropsInside,
    });
    next = a.run;
    fired += a.fired;
    consumedItems.push(...a.consumedItems);
    const b = autoSatisfyOrphanRouteFlags(def, next);
    next = b.run;
    fired += b.fired;
    if (a.fired + b.fired === 0) break;
  }
  return { run: next, fired, consumedItems };
}

type LootRow = { item: number; conditionId?: number };

/**
 * True when `itemEntry` appears on a creature or GO loot table for this instance def.
 * Used to keep auto-run honest for keys that drop inside (Gordok Courtyard/Inner keys).
 *
 * Sources: encounter creature loot, objectGate GO lootIds, `def.lootObjects`, and
 * floor GOs from `dungeonGameObjectsForMap(def.mapId)` (Defias Gunpowder GO 17155).
 *
 * `rowAllowed` filters condition-gated rows (13523 / condition 213 QUESTREWARDED 5384).
 * Omit it to ask "does any row exist"; pass lootDropAllowed to ask "can THIS party loot it".
 */
export function itemDropsInsideInstance(
  def: InstanceDef,
  itemEntry: number,
  lootTable: (lootId: number | string) => readonly LootRow[],
  goLootId?: (goEntry: number) => number | undefined,
  rowAllowed?: (row: LootRow) => boolean,
): boolean {
  const seen = new Set<number>();
  const seenGoLoot = new Set<number>();
  const hits = (rows: readonly LootRow[]): boolean =>
    rows.some((r) => r.item === itemEntry && (rowAllowed ? rowAllowed(r) : true));
  const checkCreature = (entry: number): boolean => {
    if (seen.has(entry)) return false;
    seen.add(entry);
    return hits(lootTable(entry));
  };
  const checkGoLoot = (lid: number | undefined): boolean => {
    if (lid == null || !(lid > 0) || seenGoLoot.has(lid)) return false;
    seenGoLoot.add(lid);
    return hits(lootTable(`go:${lid}`));
  };
  for (const enc of def.encounters) {
    if (checkCreature(enc.creatureEntry)) return true;
    for (const p of enc.pack ?? []) {
      if (checkCreature(p.creatureEntry)) return true;
    }
    for (const ev of enc.events ?? []) {
      if (ev.kind !== 'objectGate') continue;
      if (checkGoLoot(goLootId?.(ev.goEntry))) return true;
    }
  }
  for (const lo of def.lootObjects ?? []) {
    if (checkGoLoot(goLootId?.(lo.goEntry))) return true;
  }
  // Floor chests / powder piles are not on encounters or lootObjects (KI-940).
  for (const go of dungeonGameObjectsForMap(def.mapId)) {
    if (checkGoLoot(go.lootId)) return true;
  }
  return false;
}

// ---- instance save (5-mans: 30 min; raids: until lockout / reset_delay) ------

/**
 * How long a normal (5-man) instance keeps its state after you walk out.
 * Cite: MapPersistentStateMgr.h:41 `#define NORMAL_INSTANCE_RESET_TIME 30 * MINUTE`.
 * Raid/heroic saves are NOT this macro — they use `def.lockoutMs` (instance_template
 * reset_delay); do not reuse this constant for them.
 */
export const NORMAL_INSTANCE_RESET_TIME_MS = 30 * 60 * 1000;

/** A walked-out-of run, held until `expiresAtMs` (30 min or lockout). Cite: MapPersistentState unload-or-reset. */
export interface InstanceSave {
  run: InstanceRun;
  expiresAtMs: number;
}

/**
 * dungeonId -> held instance state. A map, not one slot: saves are per-instance in
 * CMaNGOS (`MapPersistentStateManager` keyed by instance id), so entering Deadmines
 * must not reset your Wailing Caverns clear. Raids land here too — the lockout is
 * the bind clock, this map is the instance itself.
 */
export type InstanceSaveMap = Record<string, InstanceSave>;

/** Does this run hold progress worth keeping across a step outside? */
function runHasProgress(run: InstanceRun): boolean {
  return run.defeated.length > 0
    || (run.floorClearedGuids?.length ?? 0) > 0
    || (run.flags?.length ?? 0) > 0;
}

/** Drop saves whose `expiresAtMs` has passed — those instances reset. */
export function pruneInstanceSaves(saves: InstanceSaveMap, nowMs: number): InstanceSaveMap {
  const out: InstanceSaveMap = {};
  for (const [id, s] of Object.entries(saves)) {
    if (s.expiresAtMs > nowMs) out[id] = s;
  }
  return out;
}

/** 5-man: 30 min. Raid: existing lockout, else now + reset_delay. Cite: MapPersistentStateMgr.cpp:348-352. */
function saveExpiresAtMs(def: InstanceDef, nowMs: number, lockouts?: LockoutMap): number {
  if (def.lockoutMs > 0) {
    const until = lockouts?.[def.id];
    if (until != null && until > nowMs) return until;
    return nowMs + def.lockoutMs;
  }
  return nowMs + NORMAL_INSTANCE_RESET_TIME_MS;
}

// File the run on leaving, pruning expired ones. No progress → drop. 5-mans expire in 30 min; raids expire
// at the lockout (reset_delay), so a mid-raid leave is not a reset.
export function saveRunOnLeave(
  saves: InstanceSaveMap,
  run: InstanceRun,
  def: InstanceDef,
  nowMs: number,
  lockouts?: LockoutMap,
): InstanceSaveMap {
  const pruned = pruneInstanceSaves(saves, nowMs);
  if (!runHasProgress(run)) {
    delete pruned[def.id];
    return pruned;
  }
  return { ...pruned, [def.id]: { run, expiresAtMs: saveExpiresAtMs(def, nowMs, lockouts) } };
}

// The saved run to re-enter with, or null when there is none for this dungeon or `expiresAtMs` has passed
// (the instance reset while you were out).
export function restoreSavedRun(
  saves: InstanceSaveMap | undefined,
  dungeonId: string,
  nowMs: number,
): InstanceRun | null {
  const save = saves?.[dungeonId];
  if (!save || save.expiresAtMs <= nowMs) return null;
  if (save.run.dungeonId !== dungeonId) return null;
  // molten_core.cpp:62-65 OnPlayerEnter on a saved instance.
  return applyMajordomoSpawnOnPlayerEnter(save.run);
}

// ---- lockouts (raid/heroic; 5-mans use lockoutMs 0 and never lock) ----------

export function isLocked(lockouts: LockoutMap, dungeonId: string, nowMs: number): boolean {
  const until = lockouts[dungeonId];
  return until != null && until > nowMs;
}

export function lockRemainingMs(lockouts: LockoutMap, dungeonId: string, nowMs: number): number {
  const until = lockouts[dungeonId];
  return until != null && until > nowMs ? until - nowMs : 0;
}

/** Save the player to a dungeon on completion (no-op for freely-resettable 5-mans). */
export function applyLockout(lockouts: LockoutMap, def: InstanceDef, nowMs: number): LockoutMap {
  if (def.lockoutMs <= 0) return lockouts;
  return { ...lockouts, [def.id]: nowMs + def.lockoutMs };
}

// ---- portals ----------------------------------------------------------------

/** Dungeons whose entrance portal is in the given world zone. */
export function instancePortals(ds: DataStore, zoneId: string): InstanceDef[] {
  return ds.instances().filter((d) => d.portalZone === zoneId);
}

export interface EnterCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Optional bag for areatrigger_teleport lock chain (GetAreaTriggerLockStatus).
 * When `teleports` is provided and an entrance row matches `def.portalZone`,
 * the trigger's requiredLevel/item/quest gates replace authored minLevel.
 * When no matching row (or teleports omitted), authored `def.minLevel` remains.
 *
 * Wiring (game.ts enterInstance — do not implement here):
 *   canEnter(def, level, lockouts, nowMs, {
 *     teleports: b.areatriggerTeleports,
 *     ownedItems: inventory item entry set,
 *     completedQuests: turned-in quest id set,
 *     nameFragment: optional dungeon name hint,
 *   })
 */
export interface CanEnterContext {
  /** Baked areatrigger_teleport rows (DataBundle.areatriggerTeleports). */
  teleports?: readonly AreaTriggerTeleportRow[];
  /** Narrow entrance match by name substring (e.g. "Deadmines", "Onyxia"). */
  nameFragment?: string;
  ownedItems?: ReadonlySet<number> | readonly number[];
  hasItem?: (entry: number) => boolean;
  completedQuests?: ReadonlySet<number> | readonly number[];
  hasQuestRewarded?: (questId: number) => boolean;
  /** Filed run(s). Lockout + a live save is re-entry of YOUR instance, not a bar. */
  instanceSaves?: InstanceSaveMap;
}

/**
 * Whether a character may enter a dungeon right now.
 * Lockout without a filed save refuses a *fresh* raid; lockout + save allows
 * re-entry of that same instance. Level/item/quest: sourced lock chain when a
 * matching entrance teleport exists; otherwise authored `def.minLevel`.
 */
export function canEnter(
  def: InstanceDef,
  level: number,
  lockouts: LockoutMap,
  nowMs: number,
  ctx?: CanEnterContext,
): EnterCheck {
  // Sourced lock chain when teleports supplied and an entrance matches portalZone.
  // requiredLevel on the trigger replaces authored minLevel when present;
  // if the trigger has no requiredLevel, fall back to def.minLevel.
  if (ctx?.teleports) {
    const entrance = def.entranceTriggerId != null
      ? ctx.teleports.find((t) => t.id === def.entranceTriggerId)
      : findEntranceTeleport(def.portalZone, ctx.teleports, ctx.nameFragment);
    if (entrance) {
      const teleport = {
        requiredLevel:
          (entrance.requiredLevel ?? 0) > 0 ? entrance.requiredLevel : def.minLevel,
        requiredItem: entrance.requiredItem,
        requiredItem2: entrance.requiredItem2,
        requiredQuest: entrance.requiredQuest,
        statusFailedText: entrance.statusFailedText,
      };
      const lock = checkAreaTriggerLock({
        level,
        ownedItems: ctx.ownedItems,
        hasItem: ctx.hasItem,
        completedQuests: ctx.completedQuests,
        hasQuestRewarded: ctx.hasQuestRewarded,
        teleport,
      });
      if (!lock.ok) return { ok: false, reason: lock.reason };
    } else if (level < def.minLevel) {
      // No matching trigger row → keep authored minLevel (jasperlode / unbaked)
      return { ok: false, reason: `Requires level ${def.minLevel}` };
    }
  } else if (level < def.minLevel) {
    return { ok: false, reason: `Requires level ${def.minLevel}` };
  }

  // Perm bind is to YOUR instance. HAS_BIND only fires when the target is a *different*
  // instance. Cite: Player.cpp:19990-19994; Map.cpp:1797-1812.
  if (isLocked(lockouts, def.id, nowMs) && !restoreSavedRun(ctx?.instanceSaves, def.id, nowMs)) {
    return { ok: false, reason: 'You are saved to this instance' };
  }
  return { ok: true };
}

/** Re-export for callers that only import world/instances. */
export { findEntranceTeleport, checkAreaTriggerLock } from '../domain/world/areaTriggerLocks.ts';
export type { AreaTriggerTeleportRow, AreaTriggerLockResult } from '../domain/world/areaTriggerLocks.ts';
