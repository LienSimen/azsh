/**
 * Geometric dungeon route order — entrance-first, nav-graph nearest-neighbour,
 * hard gates and boss sequence preserved.
 *
 * Root cause this closes: `routeEncounterIdList` used InstanceDef declaration order,
 * so "go here" fought every pack typed earlier in the file regardless of where it
 * stood on the map (see mission brief; instances.ts routeEncounterIdList).
 *
 * ⚠️ TUNING, NOT FIDELITY. The *constraints* here are sourced — hard gates from
 * key-sources.json, boss sequence from the authored routes, geometry from the nav grid.
 * The *ordering policy* is not: the rank key at `fillRank` (segment, lastness, room,
 * nearest-neighbour tour, euclid-from-entrance) and `UNREACHABLE_BASE` are pacing dials
 * picked against route probes, and vanilla has no route table to match them against. Do
 * not "correct" them from DBC/world-DB — there is nothing there. Change them only with a
 * new probe-route-detour / probe-walk-follows-route measurement.
 * Cite: FIDELITY-AUDIT.md §4 worklist row 8.
 *
 * Pure module — no DOM, no I/O, no Math.random.
 */

import type { EncounterDef, EncounterEvent, InstanceDef } from '../data/schema.ts';
import { entranceForInstance } from '../data/dungeons/pack-from-clusters.ts';
import viewportsJson from '../data/maps/dungeon-viewports.json' with { type: 'json' };
import keySourcesJson from '../data/dungeons/key-sources.json' with { type: 'json' };
import authoredRoutesJson from '../data/tables/dungeonAuthoredRoutes.json' with { type: 'json' };
import {
  projectWorld,
  type MapPct,
  type Viewport,
  type WorldPos,
} from './dungeonMapProjection.ts';
import {
  dijkstraCosts,
  instanceNavGrid,
  navGridFor,
  snapToFloor,
  type NavFloorDoc,
  type NavGrid,
  type NavWaypoint,
} from './dungeonNav.ts';
import {
  stripAbsentPoolEncountersFromRoute,
  type DungeonPoolRoll,
  type PoolMapSpawn,
} from './rareRoll.ts';
import { STOREY_DZ_YD } from '../domain/nav/storey.ts';

// Viewport / projection (local — avoid importing dungeonRouteGeometry → instances)

function viewportFor(instanceId: string): Viewport | null {
  const raw = (viewportsJson as Record<string, unknown>)[instanceId];
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as { box?: number[] };
  if (!Array.isArray(v.box) || v.box.length !== 4) return null;
  const box = v.box.map(Number) as [number, number, number, number];
  if (!box.every(Number.isFinite)) return null;
  return { box };
}

function clampPct(p: MapPct): MapPct {
  const FULL = 50 + 50;
  return {
    left: Math.max(0, Math.min(FULL, p.left)),
    top: Math.max(0, Math.min(FULL, p.top)),
  };
}

function worldOf(enc: EncounterDef): WorldPos | null {
  const o = enc.origin;
  if (!o || !Number.isFinite(o.x) || !Number.isFinite(o.y)) return null;
  return { x: o.x, y: o.y, z: o.z };
}

function waypointOf(
  instanceId: string,
  world: WorldPos,
): NavWaypoint | null {
  const vp = viewportFor(instanceId);
  if (!vp) return null;
  const pct = clampPct(projectWorld(vp, world));
  const wp: NavWaypoint = { pct };
  if (world.z != null && Number.isFinite(world.z)) wp.z = world.z;
  return wp;
}

function entranceWorld(
  instanceId: string,
  route: readonly EncounterDef[],
  triggerId?: number,
): WorldPos | null {
  const ent = entranceForInstance(instanceId, triggerId);
  if (ent) return { x: ent.x, y: ent.y, z: ent.z };
  for (const e of route) {
    const w = worldOf(e);
    if (w) return w;
  }
  return null;
}

// Flag / boss constraints (sourced from EncounterDef.events — no new mechanism)

/** Flags this encounter requires before it can be engaged. */
export function routeRequiredFlags(enc: EncounterDef): string[] {
  const out: string[] = [];
  for (const ev of enc.events ?? []) {
    if (ev.kind === 'requiresFlag') out.push(ev.flag);
  }
  return out;
}

// Flags this encounter produces when cleared / gated (setsFlag + objectGate.setsFlag). Mirrors
// instances.flagsSetOnClear + objectGate hosted flags.
export function routeProducedFlags(enc: EncounterDef): string[] {
  const out: string[] = [];
  for (const ev of enc.events ?? []) {
    if (ev.kind === 'setsFlag') {
      if (!out.includes(ev.flag)) out.push(ev.flag);
    } else if (ev.kind === 'objectGate') {
      const g = ev as Extract<EncounterEvent, { kind: 'objectGate' }>;
      if (!out.includes(g.setsFlag)) out.push(g.setsFlag);
    }
  }
  return out;
}

// Key-item constraints (`objectGate.requiredItem`)

type KeySourceRow = { encounters: string[]; outside: boolean; fromFloorObject?: boolean };
const KEY_SOURCES = keySourcesJson as Record<string, Record<string, KeySourceRow>>;

/** Gate items this encounter must hold before it can be engaged. */
export function routeRequiredItems(enc: EncounterDef): number[] {
  const out: number[] = [];
  for (const ev of enc.events ?? []) {
    if (ev.kind !== 'objectGate') continue;
    const g = ev as Extract<EncounterEvent, { kind: 'objectGate' }>;
    if (g.requiredItem != null && !out.includes(g.requiredItem)) out.push(g.requiredItem);
  }
  return out;
}

/**
 * Encounters on this instance whose loot can hand the party `itemEntry`
 * (`src/data/dungeons/key-sources.json`, emitted by emit-dungeon-key-sources.mjs).
 * Empty ⇒ outside key: the auto-run bypasses that gate, so it is not a route constraint.
 */
export function routeItemSources(instanceId: string, itemEntry: number): readonly string[] {
  return KEY_SOURCES[instanceId]?.[String(itemEntry)]?.encounters ?? [];
}

// Authored itinerary anchors (`src/data/tables/dungeonAuthoredRoutes.json`)

type AuthoredNode = { kind?: string; name?: string };
const AUTHORED_ROUTES = (authoredRoutesJson as { routes?: Record<string, AuthoredNode[]> }).routes
  ?? {};

/** In-session Seed writes (dev route editor) so ordering does not wait on a JSON HMR. */
const authoredNameOverride: Record<string, string[]> = {};

/** Called by `routeEdit.rememberAuthoredRoute` — a Seeded route reorders the next run. */
export function setAuthoredRouteAnchors(instanceId: string, names: readonly string[]): void {
  authoredNameOverride[instanceId] = [...names];
}

/** Ordered anchor names for this instance (walk pins; `use` gates are not encounters). */
function authoredAnchorNames(instanceId: string): string[] {
  const over = authoredNameOverride[instanceId];
  if (over?.length) return over;
  const raw = AUTHORED_ROUTES[instanceId];
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const n of raw) {
    if (n?.kind === 'use' || !n?.name) continue;
    out.push(n.name);
  }
  return out;
}

/**
 * Encounter ids the operator drew, in the order they drew them.
 *
 * `feat(route): authored itinerary, not the geometric pack tour` (0f65f584c) shipped this table
 * and wired it to the editor and `nextAutoBossId`, but never to `run.routeEncounterIds` — which
 * is what `routeEncounterList` / `minimapBosses` / `isUnlocked` actually read. So the HUD named a
 * boss off the authored spine while the tour walked the geometric one.
 */
export function authoredAnchorIds(
  instanceId: string,
  route: readonly EncounterDef[],
): string[] {
  const names = authoredAnchorNames(instanceId);
  if (!names.length) return [];
  const byKey = new Map<string, string>();
  for (const e of route) {
    if (!byKey.has(e.name)) byKey.set(e.name, e.id);
    if (!byKey.has(e.id)) byKey.set(e.id, e.id);
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const id = byKey.get(name);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Tour distance between two stops. z is not optional here.
 *
 * A "room" is a WMO group, and 59 of the 126 multi-stop rooms span 20+ yd of z — lbrs
 * `chamber-of-battle` spans 109 across 18 stops. With z dropped, two stops on opposite floors
 * of one shaft read as neighbours: BRD's `230-a5b5fab6` pair is 23 yd apart in plan and 66 yd
 * apart vertically, and the tour books them consecutively, so the party walks 2,203 yd of mesh
 * route between them (probe-route-detour ×97.1). Its room ping-pongs down 57, up 66, down 67,
 * up 45 for the same reason.
 *
 * Guarded rather than `?? 0`: a stop with no z must not be pulled toward the floor.
 *
 * `Math.sqrt` rather than `Math.hypot`: hypot's rescaling buys nothing at instance coordinates
 * (a dungeon spans hundreds of yards, nowhere near the overflow it guards) and this runs once
 * per candidate per pick at dungeon entry. sqrt is exactly rounded by IEEE754, so the only
 * daylight between the two is hypot's extra accuracy in the last bit — no pair of stops in the
 * tree re-orders on it (`src/dev/capabilities/routeOrder.mjs`).
 */
function euclid(a: WorldPos, b: WorldPos): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z != null && b.z != null ? a.z - b.z : 0;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Penalty band for packs A* cannot reach — still ordered, but after connected ones. */
const UNREACHABLE_BASE = 1e9;

export type OrderRouteOpts = {
  /** Nav grid; when omitted, uses `instanceNavGrid(def.id)` then null. */
  grid?: NavGrid | null;
  /** Floorplan doc — builds a grid when `grid` is absent. */
  floorplan?: NavFloorDoc | null;
  // When set with `mapSpawns`, drop pool-lost rares and collapse multi-location rare candidates (same boss
  // name) before ordering. Same roll as floor spawns.
  poolRoll?: DungeonPoolRoll | null;
  mapSpawns?: readonly PoolMapSpawn[];
  // Party inventory at route-order time. A key already carried (Seal of Ascension brought in) lifts that
  // gate's ordering constraint. Absent ⇒ nothing carried.
  hasItem?: (itemEntry: number) => boolean;
  /**
   * True when a listed inside-key can drop for THIS party (loot conditionId).
   * 13523 only drops after quest 5384 is rewarded. Absent ⇒ treat listed sources
   * as farmable (legacy). False + not in bags ⇒ skip that gate (don't cheat-open it).
   */
  itemObtainable?: (itemEntry: number) => boolean;
  /** Alternate world door (areatrigger_teleport id) for entrance-first order. */
  entranceTriggerId?: number;
};

// Apply pool strip + multi-slot rare collapse, preserving relative order. No-op when `poolRoll` /
// `mapSpawns` absent — callers that only order keep every authored candidate until a run rolls pools.
export function filterRouteByPoolRoll(
  route: readonly EncounterDef[],
  poolRoll: DungeonPoolRoll | null | undefined,
  mapSpawns: readonly PoolMapSpawn[] | undefined,
): EncounterDef[] {
  if (!mapSpawns) return [...route];
  // Always run strip when mapSpawns provided: multi-slot collapse needs no pool
  // members (Forresten has no bake pool but still ×4 candidates → one pin).
  const ids = stripAbsentPoolEncountersFromRoute(
    route.map((e) => e.id),
    route,
    poolRoll,
    mapSpawns,
  );
  const byId = new Map(route.map((e) => [e.id, e]));
  const out: EncounterDef[] = [];
  for (const id of ids) {
    const e = byId.get(id);
    if (e) out.push(e);
  }
  return out;
}

/**
 * Order a density-filtered (and optionally budget-split) encounter list for a run.
 *
 * - Starts at the instance entrance (`entranceForInstance`).
 * - **Room first:** named WMO rooms are ordered by the min nav-graph distance of any
 *   pack in that room from the entrance. Within a room, packs sort by nav distance.
 *   That stops the zig-zag when two rooms interleave in raw distance (the live-play
 *   complaint: "routes then 2 3 5 6 7 8 all over the map").
 * - Unassigned packs (no room / terrain maps) keep the previous per-pack nav rank —
 *   each is a singleton "room" keyed by encounter id so they still order by distance.
 * - Hard gates: `requiresFlag` packs wait until a producer is already on the route
 *   (or no remaining producer exists — orphan flags auto-advance in the engine).
 * - Inside-key trash sources: drain that source's room (Reliquary / Blood Steward)
 *   before a nearer named room (Chamber of Summoning), then walk the gate that
 *   wanted the key. Skip a source whose room holds a later boss (ST Bloodkeepers).
 * - Bags / farmability: have the key → walk the gate; can loot it → source then
 *   gate; neither → mark the gate optional and do not detour (Scholo: Jandice).
 * - Bosses keep their InstanceDef relative order (survey sequence).
 * - Deterministic: ties break on Euclidean-to-entrance, then encounter id.
 * - Optional `poolRoll` + `mapSpawns`: strip pool losers and multi-slot rare dups first.
 *
 * Defect (reintroduce to go red): replace roomKey with per-pack nav only
 * (`return rankOfPack(enc)` without the roomOrder prefix) → room re-entries rise.
 */
export function orderRouteByGeometry(
  def: InstanceDef,
  route: readonly EncounterDef[],
  opts?: OrderRouteOpts,
): EncounterDef[] {
  if (opts?.mapSpawns) {
    route = filterRouteByPoolRoll(route, opts.poolRoll, opts.mapSpawns);
  }
  if (route.length <= 1) return [...route];

  const grid =
    opts?.grid
    ?? (opts?.floorplan ? navGridFor(opts.floorplan) : null)
    ?? instanceNavGrid(def.id);

  // Synthetic / fixture dungeons with no pack origins (testdelve event tests): keep density/def relative
  // order. Reordering by id among origin-less packs was breaking hand-authored sequential unlock graphs.
  const anyOrigin = route.some((e) => worldOf(e) != null);
  if (!anyOrigin) return [...route];

  const entrance = entranceWorld(def.id, route, opts?.entranceTriggerId);
  const bossOrder = def.encounters.filter((e) => e.kind === 'boss').map((e) => e.id);
  const bossRank = new Map(bossOrder.map((id, i) => [id, i]));

  // Maps with zero named rooms (ragefire-chasm, shadowfang-keep, razorfen-kraul,
  // zul-farrak) have every pack as a `~enc:` singleton, so the room-sticky greedy
  // below degrades to a pure sort by nav-from-entrance. On a spread-out terrain map
  // that ping-pongs: two packs at the same radius but opposite sides rank adjacent,
  // so the tour bounces N↔S (zul-farrak walked 300-575 yd legs the stepper could not
  // follow — 24 of 95 stalled legs, probe-walk-follows-route). For those maps order
  // as a nearest-neighbour tour from the LAST placed pack instead.
  const anyRoom = route.some((e) => e.roomId != null && e.roomId !== '');
  const worldById = new Map<string, WorldPos>();
  for (const e of route) {
    const w = worldOf(e);
    if (w) worldById.set(e.id, w);
  }
  let lastPlaced: WorldPos = entrance ?? { x: 0, y: 0 };

  /**
   * ANCHOR SEGMENTS — the operator's itinerary decides WHEN a boss is walked, geometry only
   * decides what gets cleared on the way there.
   *
   * Without this the greedy is a pure trash drain: nothing pulls the tour toward a boss, so
   * blackrock-depths (257 stops, 22 bosses) put Lord Roccor at stop 94 and then stranded the
   * other 21 in one back-to-back block at stops 236-256 — `bossOk` released them in rank order
   * only once no trash was left anywhere. The party cleared the instance, then ping-ponged it
   * end to end boss to boss, while the HUD named a boss 140 stops ahead of the pack being walked.
   *
   * With no authored route, the InstanceDef boss sequence is the itinerary — the same order
   * `bossOk` already enforces. The tour without any anchors ordered all 54 blackwing-lair
   * packs (every one an upper storey, z 440-449) before Razorgore at z 413 (operator, 2026-08-29).
   *
   * Each non-anchor pack joins the leg of the anchor it stands nearest (ties to the earlier
   * anchor), preferring anchors on its own storey: BWL's tower packs sit ~100 yd from Razorgore
   * in plan but 27-36 yd overhead, and euclid alone booked all of them into his leg, so the tour
   * climbed off the entrance floor before the first boss. `STOREY_DZ_YD` is the engine's own
   * "another floor" line (domain/nav/storey.ts:6; the euclid doc above says why z 1:1 is not
   * enough). An anchor sorts after its own leg's trash — fight through to the boss, then move on.
   */
  let anchorIds = authoredAnchorIds(def.id, route);
  if (anchorIds.length < 2) {
    const inRoute = new Set(route.map((e) => e.id));
    anchorIds = bossOrder.filter((id) => inRoute.has(id));
  }
  const anchorSeg = new Map<string, number>();
  anchorIds.forEach((id, i) => anchorSeg.set(id, i));
  const segOf = new Map<string, number>();
  if (anchorIds.length >= 2) {
    const nearestAnchor = (w: WorldPos, sameStorey: boolean): number | null => {
      let best: number | null = null;
      let bestD = Infinity;
      for (let i = 0; i < anchorIds.length; i++) {
        const aw = worldById.get(anchorIds[i]!);
        if (!aw) continue;
        if (sameStorey && (w.z == null || aw.z == null || Math.abs(w.z - aw.z) > STOREY_DZ_YD)) {
          continue;
        }
        const d = euclid(w, aw);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    };
    // A room moves as ONE leg (a split room is a re-entry per split): a room holding exactly one
    // anchor is that leg, an anchor-less room joins by centroid. A room holding SEVERAL anchors
    // (the-stockade is one room over the whole map) keeps per-pack assignment — binding it whole
    // re-creates the trash drain.
    const roomSeg = new Map<string, number>();
    const multiAnchorRooms = new Set<string>();
    const centroids = new Map<string, { x: number; y: number; z: number; nz: number; n: number }>();
    for (const e of route) {
      if (!e.roomId) continue;
      const own = anchorSeg.get(e.id);
      if (own != null) {
        if (roomSeg.has(e.roomId)) {
          multiAnchorRooms.add(e.roomId);
          roomSeg.delete(e.roomId);
        } else if (!multiAnchorRooms.has(e.roomId)) {
          roomSeg.set(e.roomId, own);
        }
        continue;
      }
      const w = worldById.get(e.id);
      if (!w) continue;
      let c = centroids.get(e.roomId);
      if (!c) {
        c = { x: 0, y: 0, z: 0, nz: 0, n: 0 };
        centroids.set(e.roomId, c);
      }
      c.x += w.x;
      c.y += w.y;
      c.n++;
      if (w.z != null && Number.isFinite(w.z)) {
        c.z += w.z;
        c.nz++;
      }
    }
    for (const [roomId, c] of centroids) {
      if (roomSeg.has(roomId) || multiAnchorRooms.has(roomId) || !c.n) continue;
      const w: WorldPos = { x: c.x / c.n, y: c.y / c.n };
      if (c.nz) w.z = c.z / c.nz;
      const best = nearestAnchor(w, true) ?? nearestAnchor(w, false);
      if (best != null) roomSeg.set(roomId, best);
    }
    for (const e of route) {
      const own = anchorSeg.get(e.id);
      if (own != null) {
        segOf.set(e.id, own);
        continue;
      }
      const room = e.roomId != null ? roomSeg.get(e.roomId) : undefined;
      if (room != null) {
        segOf.set(e.id, room);
        continue;
      }
      const w = worldById.get(e.id);
      const best = w ? nearestAnchor(w, true) ?? nearestAnchor(w, false) : null;
      segOf.set(e.id, best ?? anchorIds.length - 1);
    }
  }
  const segKey = (enc: EncounterDef): number => segOf.get(enc.id) ?? 0;
  /** Anchor walks last in its own leg, after the trash that leads to it. */
  const anchorLast = (enc: EncounterDef): number => (anchorSeg.has(enc.id) ? 1 : 0);

  // One Dijkstra from the entrance → nav distance for every pack (wall-aware).
  const navFromEntrance = new Map<string, number>();
  const euclidFromEntrance = new Map<string, number>();
  if (entrance) {
    for (const e of route) {
      const w = worldOf(e);
      if (w) euclidFromEntrance.set(e.id, euclid(entrance, w));
    }
  }
  if (grid && entrance) {
    const entWp = waypointOf(def.id, entrance);
    const from = entWp ? snapToFloor(grid, entWp) : null;
    if (from) {
      const cellId = (band: number, x: number, y: number): number =>
        band * grid.res * grid.res + y * grid.res + x;
      const stops = new Set<number>();
      const snapByEnc = new Map<string, number>();
      for (const e of route) {
        const w = worldOf(e);
        const wp = w ? waypointOf(def.id, w) : null;
        if (!wp) continue;
        const s = snapToFloor(grid, wp);
        if (!s) continue;
        const id = cellId(s.band, s.x, s.y);
        snapByEnc.set(e.id, id);
        stops.add(id);
      }
      const costs = dijkstraCosts(grid, from, stops.size ? stops : undefined);
      if (costs) {
        for (const [encId, cid] of snapByEnc) {
          const c = costs[cid]!;
          if (Number.isFinite(c)) navFromEntrance.set(encId, c);
        }
      }
    }
  }

  const packPrimary = (enc: EncounterDef): number => {
    const nav = navFromEntrance.get(enc.id);
    const euc = euclidFromEntrance.get(enc.id) ?? UNREACHABLE_BASE;
    return nav != null ? nav : UNREACHABLE_BASE + euc;
  };

  // Room key: named roomId, else singleton so unassigned packs keep pure pack order.
  // Maps with zero named rooms → every pack is a singleton → identical to #599.
  const roomKeyOf = (enc: EncounterDef): string => {
    if (enc.roomId) return enc.roomId;
    return `~enc:${enc.id}`;
  };

  /**
   * Per-stop facts, walked once instead of once per candidate per pick.
   *
   * The rank key and all three gates below used to re-walk `enc.events` and rebuild a Set on
   * every call, inside a pool scan inside the tour. Nothing here reads a field the
   * `{ ...e, optional: true }` clone drops, so a stop's row is the same whether the greedy is
   * holding the original or the clone.
   */
  type StopFacts = {
    world: WorldPos | null;
    roomKey: string;
    seg: number;
    reqFlags: string[];
    prodFlags: string[];
    selfProduces: Set<string>;
    reqItems: number[];
    bossRank: number | undefined;
  };
  const factsById = new Map<string, StopFacts>();
  const factsOf = (enc: EncounterDef): StopFacts => {
    let f = factsById.get(enc.id);
    if (!f) {
      const prodFlags = routeProducedFlags(enc);
      f = {
        world: worldById.get(enc.id) ?? worldOf(enc),
        roomKey: roomKeyOf(enc),
        seg: segKey(enc),
        reqFlags: routeRequiredFlags(enc),
        prodFlags,
        selfProduces: new Set(prodFlags),
        reqItems: routeRequiredItems(enc),
        bossRank: bossRank.get(enc.id),
      };
      factsById.set(enc.id, f);
    }
    return f;
  };
  for (const e of route) factsOf(e);
  /** `objectGate.requiredItem` holders. Empty on most instances, and then the two key blocks in
   * the tour have nothing to find, so they do not run at all. */
  const gateStops = route.filter((e) => factsOf(e).reqItems.length > 0);
  /** `routeItemSources` is a JSON lookup behind a `String(item)` key; one per item is enough. */
  const sourcesCache = new Map<number, readonly string[]>();
  const sourcesOf = (item: number): readonly string[] => {
    let v = sourcesCache.get(item);
    if (!v) {
      v = routeItemSources(def.id, item);
      sourcesCache.set(item, v);
    }
    return v;
  };

  // ---------------------------------------------------------------------------
  // Room-sticky greedy (boss + flag constraints hard; rooms soft but sticky)
  //
  // Rank rooms by min nav-from-entrance of their members. Among currently legal
  // packs (flags + boss sequence — same as #599), prefer the active room if it
  // still has legal members; otherwise open the entrance-nearest legal room and
  // stick to it until drained of legal packs. That stops Festival↔Gauntlet zig-zag
  // from raw distance interleave while preserving InstanceDef boss order.
  // ---------------------------------------------------------------------------

  const remaining = new Map<string, EncounterDef>();
  const itemFarmable = (item: number): boolean => {
    if (opts?.hasItem?.(item)) return true;
    if (opts?.itemObtainable) return opts.itemObtainable(item);
    return true;
  };
  const gateUnsatisfiable = (enc: EncounterDef): boolean => {
    for (const item of factsOf(enc).reqItems) {
      if (opts?.hasItem?.(item)) continue;
      if (!sourcesOf(item).length) continue;
      if (!itemFarmable(item)) return true;
    }
    return false;
  };
  for (const e of route) {
    remaining.set(
      e.id,
      gateUnsatisfiable(e) && !e.optional ? { ...e, optional: true } : e,
    );
  }

  // Same min over the same members. The scan this replaces walked EVERY remaining stop and threw
  // away the ones in another room, once per candidate per pick; these buckets hold the members it
  // was looking for, so a query reads only the room it asked about. Membership is what changes as
  // stops are placed, and that is one splice per placement. With no anchors `segKey` is 0 for
  // every stop, so the leg half of the key is constant and the bucket is the room alone — which
  // is what the scan did when `segOf.size` sent it past the leg filter.
  //
  // The memo, not the buckets, is what a new pick invalidates: `lastPlaced` moves, so every
  // distance moves with it, but who stands in a room does not.
  const roomCostKey = (rk: string, seg: number): string => `${seg}:${rk}`;
  const roomMembers = new Map<string, { id: string; world: WorldPos }[]>();
  const roomCostMemo = new Map<string, number>();
  for (const e of remaining.values()) {
    const f = factsOf(e);
    if (!f.world) continue;
    const key = roomCostKey(f.roomKey, f.seg);
    let bucket = roomMembers.get(key);
    if (!bucket) {
      bucket = [];
      roomMembers.set(key, bucket);
    }
    bucket.push({ id: e.id, world: f.world });
  }
  const dropRoomMember = (enc: EncounterDef): void => {
    const f = factsOf(enc);
    if (!f.world) return;
    const bucket = roomMembers.get(roomCostKey(f.roomKey, f.seg));
    if (!bucket) return;
    const i = bucket.findIndex((m) => m.id === enc.id);
    if (i < 0) return;
    const last = bucket.pop();
    if (last && i < bucket.length) bucket[i] = last;
  };

  /**
   * How far the party is from a room, by its nearest stop still to clear.
   *
   * The room primary used to be min nav distance from the ENTRANCE, fixed for the whole
   * run. That is a radial sweep: it clears everything at one radius before moving outward,
   * which is why maraudon walked 66.5 km over 176 stops with 43 legs longer than 120 yd.
   * Ranking a room by where the party actually stands turns this same pick-best-remaining
   * loop into a tour over rooms, and keeps a room sticky once entered because its nearest
   * uncleared stop is then a few yards away.
   *
   * Hard gates and boss sequence are unaffected — `flagsOk` and `bossOk` are checked per
   * candidate below, not encoded in this rank.
   */
  const roomTourCost = (rk: string, seg: number): number => {
    const key = roomCostKey(rk, seg);
    const memo = roomCostMemo.get(key);
    if (memo !== undefined) return memo;
    let best = Infinity;
    for (const m of roomMembers.get(key) ?? []) {
      const d = euclid(lastPlaced, m.world);
      if (d < best) best = d;
    }
    const out = Number.isFinite(best) ? best : UNREACHABLE_BASE;
    roomCostMemo.set(key, out);
    return out;
  };
  const ordered: EncounterDef[] = [];
  const produced = new Set<string>();
  const placed = new Set<string>();

  // Producers still in `remaining`, per flag, decremented as stops are placed. `producersLeft`
  // scanned every remaining stop and re-walked its events for one boolean; every caller below
  // has already established that the asking stop is not itself a producer of that flag, so the
  // count needs no `exceptId`.
  const producersByFlag = new Map<string, number>();
  for (const e of remaining.values()) {
    for (const f of factsOf(e).prodFlags) {
      producersByFlag.set(f, (producersByFlag.get(f) ?? 0) + 1);
    }
  }
  const dropProducer = (enc: EncounterDef): void => {
    for (const f of factsOf(enc).prodFlags) {
      const n = producersByFlag.get(f);
      if (n != null) producersByFlag.set(f, n - 1);
    }
  };

  const flagsOk = (enc: EncounterDef): boolean => {
    const facts = factsOf(enc);
    if (!facts.reqFlags.length) return true;
    for (const f of facts.reqFlags) {
      if (produced.has(f) || facts.selfProduces.has(f)) continue;
      if (!(producersByFlag.get(f) ?? 0)) continue;
      return false;
    }
    return true;
  };

  /**
   * A gate wanting a key that DROPS INSIDE waits for a source to be placed first.
   *
   * `flagsOk` cannot see this: an encounter hosting its own `objectGate` also produces that
   * gate's flag, so `selfProduces` makes it legal from stop 0. Measured 2026-08-14 with
   * probe-dungeon-completion — scholomance ordered kirtonos-the-herald at stop 9 while every
   * Blood of Innocents (13523) source sat at 17/48/58, `autoFireObjectGates` refused to bypass
   * an inside key (`honest`), and `isUnlocked`'s sequential prefix then blocked all 49 stops
   * behind it: 9/58 cleared, 0/13 bosses.
   *
   * Outside keys (empty source list) stay unconstrained — the auto-run bypasses those gates.
   */
  const itemsOk = (enc: EncounterDef): boolean => {
    const items = factsOf(enc).reqItems;
    if (!items.length) return true;
    for (const item of items) {
      if (opts?.hasItem?.(item)) continue;
      const sources = sourcesOf(item);
      if (!sources.length) continue;
      // A source already placed (or the encounter itself — sunken-temple's Bloodkeepers ride
      // in avatar-of-hakkar's own pack) means the party holds the key on arrival.
      if (sources.some((id) => id === enc.id || placed.has(id))) continue;
      if (!sources.some((id) => remaining.has(id))) continue;
      return false;
    }
    return true;
  };

  // The lowest-ranked boss still remaining and not skipped. `bossOk` walked the whole rank map
  // per candidate to learn one number that is the same for every candidate in a pick, and
  // `bossOrder` is already in ascending rank, so the first hit is the min.
  const seqBossIds = bossOrder.filter((id) => remaining.has(id));
  let firstBossRank = Infinity;
  const rebuildBossGate = (): void => {
    firstBossRank = Infinity;
    for (const id of seqBossIds) {
      const e = remaining.get(id);
      // Skipped Kirtonos (no 13523) must not hold Jandice off the Chamber tour.
      if (!e || e.optional) continue;
      firstBossRank = bossRank.get(id) ?? Infinity;
      break;
    }
  };
  const bossOk = (enc: EncounterDef): boolean => {
    if (enc.kind !== 'boss') return true;
    const rank = factsOf(enc).bossRank;
    if (rank == null) return true;
    return firstBossRank >= rank;
  };

  // seg / anchorLast lead so the authored itinerary decides the leg; the rest is #883's tour.
  type RankKey = [number, number, number, number, number, string];
  // Written into a caller-owned tuple rather than returned: the pool scan runs once per stop
  // placed, so a fresh 6-element array per candidate is a quadratic number of them, and this
  // whole call is dungeon-entry latency (smoke section 7).
  const fillRank = (enc: EncounterDef, out: RankKey): void => {
    const facts = factsOf(enc);
    const seg = facts.seg;
    const tour = facts.world ? euclid(lastPlaced, facts.world) : UNREACHABLE_BASE;
    out[0] = seg;
    out[1] = anchorLast(enc);
    if (!anyRoom) {
      // Nearest-neighbour tour: primary = distance from the last placed pack.
      out[2] = tour;
      out[3] = packPrimary(enc);
    } else {
      // Room chosen by min nav-from-entrance (primary, identical for every member of a
      // room). WITHIN a room, order as a nearest-neighbour tour from the last placed pack,
      // not by nav-from-entrance — the latter ping-pongs when a room's packs sit at similar
      // radii on opposite walls (stockade is one named room over the whole map, so the
      // #883 !anyRoom tour never fired and it walked d=171/156/242 yd legs the stepper
      // wedges on; probe-walk-follows-route). This is #883's tour applied inside a room.
      out[2] = roomTourCost(facts.roomKey, seg);
      out[3] = tour;
    }
    out[4] = euclidFromEntrance.get(enc.id) ?? UNREACHABLE_BASE;
    out[5] = enc.id;
  };
  const better = (a: RankKey, b: RankKey): boolean => {
    for (let i = 0; i < 5; i++) {
      if (a[i]! < b[i]!) return true;
      if (a[i]! > b[i]!) return false;
    }
    return a[5] < b[5];
  };
  const pickBest = (pool: EncounterDef[]): EncounterDef | null => {
    let best: EncounterDef | null = null;
    let cand: RankKey = [0, 0, 0, 0, 0, ''];
    let bestKey: RankKey = [0, 0, 0, 0, 0, ''];
    for (const e of pool) {
      fillRank(e, cand);
      if (!best || better(cand, bestKey)) {
        best = e;
        const swap = bestKey;
        bestKey = cand;
        cand = swap;
      }
    }
    return best;
  };

  let activeRoom: string | null = null;

  while (remaining.size > 0) {
    // Everything a candidate could ask about `remaining` or `lastPlaced`, answered once. Both
    // are fixed for the whole of this pick, so a candidate reading these gets the same number
    // the per-candidate scans returned.
    rebuildBossGate();
    roomCostMemo.clear();
    let pool: EncounterDef[] = [];
    for (const e of remaining.values()) {
      if (flagsOk(e) && bossOk(e) && itemsOk(e)) pool.push(e);
    }
    // Relax in the order the constraints matter: key items before flags before boss sequence.
    // A pool that never empties is what keeps an unsatisfiable gate from wedging the tour.
    if (!pool.length) {
      for (const e of remaining.values()) {
        if (flagsOk(e) && bossOk(e)) pool.push(e);
      }
    }
    if (!pool.length) {
      for (const e of remaining.values()) {
        if (bossOk(e)) pool.push(e);
      }
    }
    if (!pool.length) pool = [...remaining.values()];

    // The authored leg is a hard partition: room-stick, key-focus and the tour all run INSIDE it.
    // Without this the sticky-room filter can hold the tour in a room whose only legal members
    // belong to a later boss's leg, which is the stranding this anchoring exists to stop.
    if (anchorIds.length >= 2) {
      let minSeg = Infinity;
      for (const e of pool) minSeg = Math.min(minSeg, segKey(e));
      if (Number.isFinite(minSeg)) {
        const inSeg = pool.filter((e) => segKey(e) === minSeg);
        if (inSeg.length) pool = inSeg;
      }
    }

    // Trash sources of a still-needed inside key outrank room-stick and nearness.
    // Scholomance: Chamber of Summoning is closer to the porch than Reliquary, so
    // the tour drained Jandice's room (stops 7-15) before Blood Steward
    // 289-dc725300 at stop 38. itemsOk only delays the GATE, not the room.
    // Focus the nearest remaining trash source's room until that key is placed.
    let keyFocusRoom: string | null = null;
    if (gateStops.length) {
      const sourceIds = new Set<string>();
      for (const gate of gateStops) {
        const e = remaining.get(gate.id);
        if (!e) continue;
        for (const item of factsOf(e).reqItems) {
          if (opts?.hasItem?.(item)) continue;
          if (!itemFarmable(item)) continue;
          const sources = sourcesOf(item);
          if (!sources.length) continue;
          if (sources.some((id) => placed.has(id))) continue;
          for (const id of sources) {
            const src = remaining.get(id);
            if (src && src.kind !== 'boss') sourceIds.add(id);
          }
        }
      }
      if (sourceIds.size) {
        let nextBossRank = Infinity;
        for (const e of remaining.values()) {
          if (e.kind !== 'boss') continue;
          const r = bossRank.get(e.id);
          if (r != null && r < nextBossRank) nextBossRank = r;
        }
        const roomHasLaterBoss = (rk: string): boolean => {
          if (rk.startsWith('~enc:')) return false;
          for (const e of remaining.values()) {
            if (e.kind !== 'boss' || factsOf(e).roomKey !== rk) continue;
            const r = bossRank.get(e.id);
            if (r != null && r > nextBossRank) return true;
          }
          return false;
        };
        const ranked = [...sourceIds].map((id) => {
          const w = worldById.get(id);
          return { id, d: w ? euclid(lastPlaced, w) : UNREACHABLE_BASE };
        }).sort((a, b) => a.d - b.d || (a.id < b.id ? -1 : 1));
        for (const { id: bestId } of ranked) {
          const src = remaining.get(bestId);
          const rk = src ? roomKeyOf(src) : `~enc:${bestId}`;
          // ST Bloodkeepers live in Avatar's Sanctum — do not open a later
          // boss room just because the key sits there.
          if (roomHasLaterBoss(rk)) continue;
          const focused = pool.filter(
            (e) =>
              e.id === bestId
              || e.id.startsWith(`${bestId}__budget`)
              || (!rk.startsWith('~enc:') && factsOf(e).roomKey === rk),
          );
          if (focused.length) {
            pool = focused;
            keyFocusRoom = rk.startsWith('~enc:') ? null : rk;
            break;
          }
        }
      }
    }

    // Drain the room we're in before spending the key. Reliquary still has
    // neophytes after Blood Steward; jumping to Kirtonos left them for stop 49.
    if (!keyFocusRoom && activeRoom) {
      const inRoom = pool.filter((e) => factsOf(e).roomKey === activeRoom);
      if (inRoom.length) pool = inRoom;
      else activeRoom = null;
    }

    // Once an inside-key source is placed, its gate outranks nearness (Reliquary →
    // Kirtonos). Carried hasItem must not — that yanked Deadmines to GO 16398 (KI-975).
    if (!keyFocusRoom && !activeRoom && gateStops.length) {
      const gated: EncounterDef[] = [];
      for (const e of pool) {
        const items = factsOf(e).reqItems;
        if (!items.length) continue;
        const ready = items.some((item) => {
          const sources = sourcesOf(item);
          if (!sources.length) return false;
          return sources.some((id) => placed.has(id) || id === e.id);
        });
        if (ready) gated.push(e);
      }
      if (gated.length) {
        let gate: EncounterDef | null = null;
        let bestD = Infinity;
        for (const e of gated) {
          const w = factsOf(e).world;
          const d = w ? euclid(lastPlaced, w) : UNREACHABLE_BASE;
          if (d < bestD || (d === bestD && e.id < (gate?.id ?? ''))) {
            bestD = d;
            gate = e;
          }
        }
        if (gate) {
          const rk = factsOf(gate).roomKey;
          const focused = pool.filter(
            (e) => e.id === gate.id || (!rk.startsWith('~enc:') && factsOf(e).roomKey === rk),
          );
          if (focused.length) pool = focused;
        }
      }
    }

    const best = pickBest(pool);
    if (!best) break;
    ordered.push(best);
    remaining.delete(best.id);
    dropRoomMember(best);
    dropProducer(best);
    placed.add(best.id);
    const bestFacts = factsOf(best);
    if (bestFacts.world) lastPlaced = bestFacts.world;
    for (const f of bestFacts.prodFlags) produced.add(f);

    const rk = bestFacts.roomKey;
    // Stay in this room if any remaining members (even gated) — only leave when
    // the next legal pick is forced elsewhere by boss/flags. Soft stick: if the
    // room still has *legal* members next iteration, inRoom filter keeps us here.
    activeRoom = rk.startsWith('~enc:') ? null : rk;
  }

  return ordered;
}

// Count how many times the route leaves a named room and later returns to it. Singleton / null rooms
// (`roomId` null/undefined) do not count as re-entries.
export function countRoomReentries(route: readonly EncounterDef[]): number {
  const seen = new Set<string>();
  let prev: string | null = null;
  let reentries = 0;
  for (const e of route) {
    const r = e.roomId ?? null;
    if (!r) {
      prev = null;
      continue;
    }
    if (prev !== r) {
      if (seen.has(r)) reentries++;
      seen.add(r);
      prev = r;
    }
  }
  return reentries;
}

/** Distinct named-room sequence along a route (null rooms skipped). */
export function roomSequence(route: readonly EncounterDef[]): string[] {
  const out: string[] = [];
  for (const e of route) {
    if (!e.roomId || !e.roomName) continue;
    if (out[out.length - 1] === e.roomName) continue;
    out.push(e.roomName);
  }
  return out;
}

/**
 * Apply geometric order to a run's materialized route ids / budget atoms.
 * Safe when `defeated` is empty (fresh enter / pace change / floorplan late-load).
 * No-op when the run already has progress (would reshuffle cleared prefixes).
 */
export function applyGeometricRouteToRun(
  def: InstanceDef,
  run: {
    dungeonId: string;
    defeated: string[];
    routeEncounterIds?: string[];
    routeEncounters?: EncounterDef[];
  },
  opts?: OrderRouteOpts,
): {
  routeEncounterIds: string[];
  routeEncounters?: EncounterDef[];
} {
  // Resolve the encounter list currently driving the run.
  let route: EncounterDef[];
  if (run.routeEncounters?.length) {
    const byId = new Map(run.routeEncounters.map((e) => [e.id, e]));
    const ids = run.routeEncounterIds?.length
      ? run.routeEncounterIds
      : run.routeEncounters.map((e) => e.id);
    route = [];
    for (const id of ids) {
      const e = byId.get(id);
      if (e) route.push(e);
    }
  } else if (run.routeEncounterIds?.length) {
    const byId = new Map(def.encounters.map((e) => [e.id, e]));
    route = [];
    for (const id of run.routeEncounterIds) {
      const e = byId.get(id);
      if (e) route.push(e);
    }
  } else {
    route = [...def.encounters];
  }

  // Pool strip before geometry so multi-location rares never re-enter as dups.
  if (opts?.mapSpawns) {
    route = filterRouteByPoolRoll(route, opts.poolRoll, opts.mapSpawns);
  }

  const ordered = orderRouteByGeometry(def, route, {
    grid: opts?.grid,
    floorplan: opts?.floorplan,
    hasItem: opts?.hasItem,
    itemObtainable: opts?.itemObtainable,
    // Already filtered above — avoid double strip.
  });
  const routeEncounterIds = ordered.map((e) => e.id);
  if (run.routeEncounters?.length) {
    return { routeEncounterIds, routeEncounters: ordered };
  }
  return { routeEncounterIds };
}
