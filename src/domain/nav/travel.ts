// Journey planner over the composite travel network, plus wall-clock journey state. Pure domain:
// every clock and rng is a param. Speeds are sourced (Unit.cpp:63-71); shapes live in travelTypes.

import type {
  Journey,
  JourneyLeg,
  JourneyProgress,
  TravelSpeeds,
} from './travelTypes.ts';

// Baked-data row shapes (narrow views of DataBundle fields — test-friendly)

export type TravelEdgeRow =
  | { a: string; b: string; kind: 'ground'; yardsRun: number; yardsSwim: number }
  | { a: string; b: string; kind: 'transport'; transport: number }
  | { a: string; b: string; kind: 'tram'; periodMs: number; oneWaySeconds: number }
  // World teleporter (areatrigger_teleport — enrich-portal-edges.mjs). DIRECTED a→b:
  // the walk to the pad (yardsRun ÷ run speed) is the whole cost, the teleport is instant.
  | { a: string; b: string; kind: 'portal'; yardsRun: number };

export interface TaxiNodeRow {
  id: number;
  name: string;
  map: number;
  x: number;
  y: number;
  z: number;
  zone?: string;
  faction: 'alliance' | 'horde' | 'both' | 'none';
}

export interface TaxiRouteRow {
  id: number;
  from: number;
  to: number;
  priceCopper: number;
  seconds: number;
  transportPath?: boolean;
}

export interface TransportStopRow {
  zone?: string;
  map: number;
  x: number;
  y: number;
  z: number;
  arriveMs: number;
  departMs: number;
}

export interface TransportCrossingRow {
  from: string | null;
  to: string | null;
  seconds: number;
}

export interface TransportRow {
  entry: number;
  name: string;
  pathId: number;
  periodMs: number;
  storedPeriodMs: number;
  stops: TransportStopRow[];
  crossings: TransportCrossingRow[];
}

export type TravelerFaction = 'alliance' | 'horde';
export type PlanObjective = 'fastest' | 'cheapest';

export interface PlanJourneyInput {
  from: string;
  to: string;
  /** Wall-clock epoch ms at planning time (dock wait = f(now % periodMs)). */
  now: number;
  speeds: TravelSpeeds;
  faction: TravelerFaction;
  /** D8: taxi edge usable only when BOTH endpoint node ids are discovered. */
  discoveredTaxiNodes: readonly number[];
  /** Copper on hand; taxi hops that would push path copper over this are not relaxed. */
  availableCopper: number;
  /** GetReputationPriceDiscount for the departure flight master. Cite: Player.cpp:17118. */
  taxiDiscountMod?: number;
  /** Default `fastest` (min seconds). `cheapest` min copper, tie-break seconds. */
  objective?: PlanObjective;
  travelEdges: readonly TravelEdgeRow[];
  taxiNodes: readonly TaxiNodeRow[];
  taxiRoutes: readonly TaxiRouteRow[];
  transports: readonly TransportRow[];
}

export type PlanJourneyOk = {
  ok: true;
  legs: JourneyLeg[];
  totalSeconds: number;
  totalCopper: number;
};

export type PlanJourneyFail = {
  ok: false;
  reason: 'unreachable' | 'same_zone';
};

export type PlanJourneyResult = PlanJourneyOk | PlanJourneyFail;

/** Taxi.cpp:149 `uint32(cost * discountMulti)` — same trunc as trainer/vendor floor. */
export function taxiFareCopper(priceCopper: number, discountMod = 1): number {
  return Math.floor(priceCopper * discountMod);
}

// Internal graph edge (one directed hop before taxi-chain collapse)

interface GraphHop {
  to: string;
  /** Seconds for this hop (includes wait for transport/tram). */
  seconds: number;
  costCopper: number;
  /** True for taxi hops — gold-aware filter + chain collapse apply. */
  isTaxi: boolean;
  // Taxi pad ids, present only when isTaxi. Two taxi hops chain only when hop N's taxiToNode is
  // hop N+1's taxiFromNode — landing at one flight master does not free-teleport to another.
  taxiFromNode?: number;
  taxiToNode?: number;
  /** Materialize a JourneyLeg for this single hop (taxiPathIds length 1). */
  toLeg: (from: string) => JourneyLeg;
}

// Speed / wait helpers (pure)

// Ground leg duration from navmesh yardages and effective speeds: yardsRun/run + yardsSwim/swim.
// The base constants come in on TravelSpeeds — never hardcode them here.
export function groundSeconds(
  yardsRun: number,
  yardsSwim: number,
  speeds: TravelSpeeds,
): number {
  const runPart = speeds.run > 0 ? yardsRun / speeds.run : 0;
  const swimPart = speeds.swim > 0 ? yardsSwim / speeds.swim : 0;
  return runPart + swimPart;
}

// Dock wait until the next departure after phase = now % periodMs. If phase is past departMs, wraps to the
// next loop iteration. Returns seconds (may be fractional if offsets are not whole seconds).
export function waitSecondsUntilDeparture(
  phaseMs: number,
  departMs: number,
  periodMs: number,
): number {
  if (periodMs <= 0) return 0;
  // Normalize phase into [0, periodMs).
  let phase = phaseMs % periodMs;
  if (phase < 0) phase += periodMs;
  if (phase <= departMs) return (departMs - phase) / 1000;
  return (periodMs - phase + departMs) / 1000;
}

// Tram departures at offsets 0 and periodMs/2 (out-and-back loop). Cite: Deeprun Tram — periodMs from
// TransportAnimation TotalTime; oneWay = period/2 (FLEET-ROADMAP-3 deviations ledger).
export function tramWaitSeconds(phaseMs: number, periodMs: number): number {
  if (periodMs <= 0) return 0;
  let phase = phaseMs % periodMs;
  if (phase < 0) phase += periodMs;
  const half = periodMs / 2;
  const w0 = waitSecondsUntilDeparture(phase, 0, periodMs);
  const w1 = waitSecondsUntilDeparture(phase, half, periodMs);
  return w0 < w1 ? w0 : w1;
}

function factionServes(nodeFaction: TaxiNodeRow['faction'], traveler: TravelerFaction): boolean {
  if (nodeFaction === 'both') return true;
  if (nodeFaction === 'none') return false;
  return nodeFaction === traveler;
}

// Composite network → adjacency list

function buildAdjacency(input: PlanJourneyInput): Map<string, GraphHop[]> {
  const adj = new Map<string, GraphHop[]>();
  const add = (from: string, hop: GraphHop): void => {
    let list = adj.get(from);
    if (!list) {
      list = [];
      adj.set(from, list);
    }
    list.push(hop);
  };

  const transportByEntry = new Map<number, TransportRow>();
  for (const t of input.transports) transportByEntry.set(t.entry, t);

  const phaseOf = (periodMs: number): number => {
    if (periodMs <= 0) return 0;
    let p = input.now % periodMs;
    if (p < 0) p += periodMs;
    return p;
  };

  // --- ground / transport / tram from travelEdges ---
  for (const edge of input.travelEdges) {
    if (edge.kind === 'ground') {
      const sec = groundSeconds(edge.yardsRun, edge.yardsSwim, input.speeds);
      const yardsRun = edge.yardsRun;
      const yardsSwim = edge.yardsSwim;
      const mk = (to: string): GraphHop => ({
        to,
        seconds: sec,
        costCopper: 0,
        isTaxi: false,
        toLeg: (from) => ({
          kind: 'ground',
          from,
          to,
          seconds: sec,
          costCopper: 0,
          yardsRun,
          yardsSwim,
        }),
      });
      add(edge.a, mk(edge.b));
      add(edge.b, mk(edge.a));
      continue;
    }

    if (edge.kind === 'portal') {
      // Directed (the DB pairs both directions when both pads exist).
      const sec = groundSeconds(edge.yardsRun, 0, input.speeds);
      const to = edge.b;
      add(edge.a, {
        to,
        seconds: sec,
        costCopper: 0,
        isTaxi: false,
        toLeg: (from) => ({
          kind: 'portal',
          from,
          to,
          seconds: sec,
          costCopper: 0,
        }),
      });
      continue;
    }

    if (edge.kind === 'tram') {
      const { periodMs, oneWaySeconds } = edge;
      const phase = phaseOf(periodMs);
      const wait = tramWaitSeconds(phase, periodMs);
      const sec = wait + oneWaySeconds;
      const mk = (to: string): GraphHop => ({
        to,
        seconds: sec,
        costCopper: 0,
        isTaxi: false,
        toLeg: (from) => ({
          kind: 'tram',
          from,
          to,
          seconds: sec,
          costCopper: 0,
          waitSeconds: wait,
        }),
      });
      add(edge.a, mk(edge.b));
      add(edge.b, mk(edge.a));
      continue;
    }

    // Transport hops follow the sourced stop and crossing zones. Edge a/b may be capital stand-ins
    // while stops stay at docks (KI-777), so wire every crossing to complete the route.
    const tr = transportByEntry.get(edge.transport);
    if (!tr || tr.periodMs <= 0) continue;
    const phase = phaseOf(tr.periodMs);

    const tryDirection = (fromZ: string, toZ: string): void => {
      const crossing = tr.crossings.find((c) => c.from === fromZ && c.to === toZ);
      if (!crossing) return;
      const stop = tr.stops.find((s) => s.zone === fromZ);
      if (!stop) return;
      const wait = waitSecondsUntilDeparture(phase, stop.departMs, tr.periodMs);
      const sec = wait + crossing.seconds;
      const entry = tr.entry;
      add(fromZ, {
        to: toZ,
        seconds: sec,
        costCopper: 0,
        isTaxi: false,
        toLeg: (from) => ({
          kind: 'transport',
          from,
          to: toZ,
          seconds: sec,
          costCopper: 0,
          transportEntry: entry,
          waitSeconds: wait,
        }),
      });
    };
    // Prefer exact edge.a/b match (Alliance boats, dock-aligned edges).
    tryDirection(edge.a, edge.b);
    tryDirection(edge.b, edge.a);
    // Capital-stand-in edges never match crossings; expose dock-zone hops.
    const stopZones = new Set(
      tr.stops.map((s) => s.zone).filter((z): z is string => typeof z === 'string' && z.length > 0),
    );
    if (!stopZones.has(edge.a) || !stopZones.has(edge.b)) {
      for (const c of tr.crossings) {
        if (c.from && c.to) tryDirection(c.from, c.to);
      }
    }
  }

  // --- taxi routes (directed; both endpoints must be discovered + faction-ok) ---
  const nodeById = new Map<number, TaxiNodeRow>();
  for (const n of input.taxiNodes) nodeById.set(n.id, n);

  const discovered = new Set(input.discoveredTaxiNodes);

  for (const route of input.taxiRoutes) {
    // Boat/zep splines live in transports — never offer as flights (schema note).
    if (route.transportPath) continue;
    if (!(route.seconds > 0)) continue;

    const fromNode = nodeById.get(route.from);
    const toNode = nodeById.get(route.to);
    if (!fromNode?.zone || !toNode?.zone) continue;
    if (!factionServes(fromNode.faction, input.faction)) continue;
    if (!factionServes(toNode.faction, input.faction)) continue;
    // D8: both nodes must be in discoveredTaxiNodes.
    if (!discovered.has(fromNode.id) || !discovered.has(toNode.id)) continue;

    const fromZ = fromNode.zone;
    const toZ = toNode.zone;
    if (fromZ === toZ) continue;

    const pathId = route.id;
    const sec = route.seconds;
    const copper = taxiFareCopper(route.priceCopper, input.taxiDiscountMod ?? 1);
    const fromNodeId = fromNode.id;
    const toNodeId = toNode.id;
    add(fromZ, {
      to: toZ,
      seconds: sec,
      costCopper: copper,
      isTaxi: true,
      taxiFromNode: fromNodeId,
      taxiToNode: toNodeId,
      toLeg: (from) => ({
        kind: 'taxi',
        from,
        to: toZ,
        seconds: sec,
        costCopper: copper,
        taxiPathIds: [pathId],
      }),
    });
  }

  return adj;
}

// Dijkstra (fastest / cheapest) with gold-aware taxi filter

interface PathNode {
  zone: string;
  // After a taxi hop, locked to the arrival pad (must depart that node to continue flying). null = free in
  // zone (can board any local flight master).
  atTaxiNode: number | null;
  /** Cumulative seconds from source. */
  seconds: number;
  /** Cumulative copper from source (taxi fares only). */
  copper: number;
  /** Lexicographic comparison key depending on objective. */
  primary: number;
  secondary: number;
}

/** Dijkstra state key: zone alone when free; zone#node when locked to a pad. */
function pathStateKey(zone: string, atTaxiNode: number | null): string {
  return atTaxiNode == null ? zone : `${zone}#${atTaxiNode}`;
}

function cmpPath(a: PathNode, b: PathNode): number {
  if (a.primary !== b.primary) return a.primary - b.primary;
  if (a.secondary !== b.secondary) return a.secondary - b.secondary;
  if (a.zone !== b.zone) return a.zone < b.zone ? -1 : 1;
  const an = a.atTaxiNode ?? -1;
  const bn = b.atTaxiNode ?? -1;
  return an - bn;
}

interface PredHop {
  fromZone: string;
  fromAtTaxi: number | null;
  hop: GraphHop;
}

// Gold-aware relaxation: a taxi hop whose accumulated copper exceeds the budget is excluded, and
// ground, transport and tram are never gold-gated. A taxi chain must depart the arrival pad.
function dijkstra(
  adj: Map<string, GraphHop[]>,
  source: string,
  target: string,
  availableCopper: number,
  objective: PlanObjective,
): { seconds: number; copper: number; pred: Map<string, PredHop>; endAtTaxi: number | null } | null {
  const best = new Map<string, PathNode>();
  const pred = new Map<string, PredHop>();
  // Binary heap would be nicer; zone×pad state count is small, linear scan is fine.
  const open: PathNode[] = [];

  const start: PathNode = {
    zone: source,
    atTaxiNode: null,
    seconds: 0,
    copper: 0,
    primary: 0,
    secondary: 0,
  };
  best.set(pathStateKey(source, null), start);
  open.push(start);

  while (open.length > 0) {
    // Pop minimum primary/secondary.
    let bi = 0;
    for (let i = 1; i < open.length; i++) {
      if (cmpPath(open[i]!, open[bi]!) < 0) bi = i;
    }
    const cur = open[bi]!;
    open[bi] = open[open.length - 1]!;
    open.pop();

    const curKey = pathStateKey(cur.zone, cur.atTaxiNode);
    const known = best.get(curKey);
    if (!known || cmpPath(cur, known) > 0) continue;
    if (cur.zone === target) {
      return { seconds: cur.seconds, copper: cur.copper, pred, endAtTaxi: cur.atTaxiNode };
    }

    const hops = adj.get(cur.zone);
    if (!hops) continue;

    for (const hop of hops) {
      // Gold-aware: skip taxi hops that would exceed the traveler's copper budget.
      if (hop.isTaxi && cur.copper + hop.costCopper > availableCopper) continue;
      // Pad lock: continuous multi-hop only through the same intermediate node.
      if (hop.isTaxi && cur.atTaxiNode != null && hop.taxiFromNode !== cur.atTaxiNode) {
        continue;
      }

      const nextSec = cur.seconds + hop.seconds;
      const nextCu = cur.copper + hop.costCopper;
      const nextAt: number | null = hop.isTaxi ? (hop.taxiToNode ?? null) : null;
      const next: PathNode = {
        zone: hop.to,
        atTaxiNode: nextAt,
        seconds: nextSec,
        copper: nextCu,
        primary: objective === 'cheapest' ? nextCu : nextSec,
        secondary: objective === 'cheapest' ? nextSec : nextCu,
      };

      const nextKey = pathStateKey(next.zone, next.atTaxiNode);
      const prev = best.get(nextKey);
      if (prev && cmpPath(next, prev) >= 0) continue;
      best.set(nextKey, next);
      pred.set(nextKey, { fromZone: cur.zone, fromAtTaxi: cur.atTaxiNode, hop });
      open.push(next);
    }
  }

  return null;
}

// Collapse consecutive taxi hops into one leg, gate to gate, since passengers do not dismount at
// relay nodes. taxiPathIds are in flight order, and only node-continuous chains reach here.
function collapseHops(
  source: string,
  target: string,
  endAtTaxi: number | null,
  pred: Map<string, PredHop>,
): JourneyLeg[] {
  // Walk predecessors target → source, reverse into hop list.
  const rev: { from: string; hop: GraphHop }[] = [];
  let z = target;
  let at: number | null = endAtTaxi;
  while (z !== source || at != null) {
    // Source is always entered free (atTaxiNode null). Stop only at that state.
    if (z === source && at == null) break;
    const p = pred.get(pathStateKey(z, at));
    if (!p) return []; // should not happen if dijkstra succeeded
    rev.push({ from: p.fromZone, hop: p.hop });
    z = p.fromZone;
    at = p.fromAtTaxi;
  }
  rev.reverse();

  const legs: JourneyLeg[] = [];
  let i = 0;
  while (i < rev.length) {
    const step = rev[i]!;
    if (!step.hop.isTaxi) {
      legs.push(step.hop.toLeg(step.from));
      i++;
      continue;
    }
    // Accumulate taxi chain (node-continuous by construction).
    let from = step.from;
    let to = step.hop.to;
    let seconds = step.hop.seconds;
    let costCopper = step.hop.costCopper;
    const pathIds: number[] = [];
    const firstLeg = step.hop.toLeg(step.from);
    if (firstLeg.taxiPathIds) pathIds.push(...firstLeg.taxiPathIds);
    i++;
    while (i < rev.length && rev[i]!.hop.isTaxi) {
      const n = rev[i]!;
      to = n.hop.to;
      seconds += n.hop.seconds;
      costCopper += n.hop.costCopper;
      const leg = n.hop.toLeg(n.from);
      if (leg.taxiPathIds) pathIds.push(...leg.taxiPathIds);
      i++;
    }
    legs.push({
      kind: 'taxi',
      from,
      to,
      seconds,
      costCopper,
      taxiPathIds: pathIds,
    });
  }
  return legs;
}

// Public planner

// Plan a journey over the composite ground, taxi, transport and tram network. Dijkstra on seconds,
// or on copper with objective 'cheapest'. Taxi hops over budget are never relaxed.
export function planJourney(input: PlanJourneyInput): PlanJourneyResult {
  if (input.from === input.to) {
    return { ok: false, reason: 'same_zone' };
  }

  const adj = buildAdjacency(input);
  const objective: PlanObjective = input.objective ?? 'fastest';
  const found = dijkstra(adj, input.from, input.to, input.availableCopper, objective);
  if (!found) {
    return { ok: false, reason: 'unreachable' };
  }

  const legs = collapseHops(input.from, input.to, found.endAtTaxi, found.pred);
  if (legs.length === 0) {
    return { ok: false, reason: 'unreachable' };
  }

  let totalSeconds = 0;
  let totalCopper = 0;
  for (const leg of legs) {
    totalSeconds += leg.seconds;
    totalCopper += leg.costCopper;
  }

  return { ok: true, legs, totalSeconds, totalCopper };
}

// Wall-clock journey state (D5) — all pure, all take `now`

function totalLegSeconds(legs: readonly JourneyLeg[]): number {
  let s = 0;
  for (const leg of legs) s += leg.seconds;
  return s;
}

/** Freeze planned legs into a wall-clock journey at departure. */
export function departJourney(legs: readonly JourneyLeg[], now: number): Journey {
  const destination = legs.length > 0 ? legs[legs.length - 1]!.to : '';
  return {
    departedAtEpochMs: now,
    legs: legs.map((l) => ({ ...l, taxiPathIds: l.taxiPathIds ? [...l.taxiPathIds] : undefined })),
    destination,
    pausedMs: 0,
  };
}

/** Sanitize a stored/requested fast-forward factor to the dial's 1|2|4. */
export function normalizeTimeScale(scale: unknown): 1 | 2 | 4 {
  return scale === 2 || scale === 4 ? scale : 1;
}

// Active travel elapsed journey-ms. effective = (now - departedAt - pausedMs) × timeScale (D9 revised: the
// dial fast-forwards — journey time runs at timeScale × real time).
export function journeyElapsedMs(journey: Journey, now: number): number {
  const raw = (now - journey.departedAtEpochMs - journey.pausedMs) * normalizeTimeScale(journey.timeScale);
  return raw < 0 ? 0 : raw;
}

/** Derived position along a journey at `now` (never stored). */
export function journeyProgress(journey: Journey, now: number): JourneyProgress {
  const legs = journey.legs;
  const totalSec = totalLegSeconds(legs);
  const elapsedSec = journeyElapsedMs(journey, now) / 1000;

  if (legs.length === 0) {
    return {
      legIndex: 0,
      zone: journey.destination,
      legElapsedSeconds: 0,
      totalElapsedSeconds: 0,
      remainingSeconds: 0,
      arrived: true,
    };
  }

  // ε covers float ULP after totalSec↔ms round-trips (completeJourneyNow / instant pace).
  if (elapsedSec + 1e-6 >= totalSec) {
    const last = legs[legs.length - 1]!;
    return {
      legIndex: legs.length - 1,
      zone: last.to,
      legElapsedSeconds: last.seconds,
      totalElapsedSeconds: totalSec,
      remainingSeconds: 0,
      arrived: true,
    };
  }

  let acc = 0;
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i]!;
    const end = acc + leg.seconds;
    if (elapsedSec < end || i === legs.length - 1) {
      const legElapsed = elapsedSec - acc;
      return {
        legIndex: i,
        // In the zone of leg.from until the leg completes (contract).
        zone: leg.from,
        legElapsedSeconds: legElapsed,
        totalElapsedSeconds: elapsedSec,
        remainingSeconds: totalSec - elapsedSec,
        arrived: false,
      };
    }
    acc = end;
  }

  // Unreachable, but satisfy the type checker.
  const last = legs[legs.length - 1]!;
  return {
    legIndex: legs.length - 1,
    zone: last.to,
    legElapsedSeconds: last.seconds,
    totalElapsedSeconds: totalSec,
    remainingSeconds: 0,
    arrived: true,
  };
}

/** Fold idle (sim Pause) into pausedMs so travel does not jump on unpause. */
export function addIdlePause(journey: Journey, pauseMs: number): Journey {
  const add = pauseMs > 0 ? pauseMs : 0;
  if (add === 0) return journey;
  return { ...journey, pausedMs: journey.pausedMs + add };
}

// Dev-only instant arrival: return a Journey whose wall-clock arrival is `now`, by rebasing
// departedAt to now − Σ legs and clearing the pause so progress reports arrived.
export function completeJourneyNow(journey: Journey, now: number): Journey {
  const totalMs = totalLegSeconds(journey.legs) * 1000;
  // −1 ms pad: (totalSec*1000)/1000 can be one ULP short of totalSec (KI-582).
  return {
    departedAtEpochMs: now - totalMs - 1,
    legs: journey.legs.map((l) => ({ ...l, taxiPathIds: l.taxiPathIds ? [...l.taxiPathIds] : undefined })),
    destination: journey.destination,
    pausedMs: 0,
    // Preserve deferred cast markers so arrival still commits TakeReagents (KI-428).
    teleportSpellId: journey.teleportSpellId,
  };
}

// Change the fast-forward factor mid-journey, rebasing departedAtEpochMs so derived progress is
// continuous at the switch.
export function setJourneyTimeScale(journey: Journey, scale: number, now: number): Journey {
  const s = normalizeTimeScale(scale);
  if (s === normalizeTimeScale(journey.timeScale)) return journey;
  const elapsed = journeyElapsedMs(journey, now);
  return {
    ...journey,
    departedAtEpochMs: now - journey.pausedMs - elapsed / s,
    timeScale: s,
  };
}

/** Wall-clock arrival epoch ms (accounts for accumulated pauses + timeScale). */
export function journeyArrivalEpochMs(journey: Journey): number {
  return journey.departedAtEpochMs
    + (totalLegSeconds(journey.legs) * 1000) / normalizeTimeScale(journey.timeScale)
    + journey.pausedMs;
}

// ---- Entrance yardages (P-now; DF corpse-run / dungeon walk-in) -------------

// Baked `DataBundle.entranceYards[]` row — hub-anchor → dungeon entrance yards. Sourced by
// enrich-travel-edges.mjs from areatrigger_teleport + navmesh.
export interface EntranceYardRow {
  trigger: number;
  zone: string;
  yardsRun: number;
  yardsSwim: number;
}

/** Look up entrance yardage by areatrigger id (unique). */
export function entranceYardForTrigger(
  rows: readonly EntranceYardRow[],
  trigger: number,
): EntranceYardRow | undefined {
  return rows.find((r) => r.trigger === trigger);
}

/** All entrance rows attributed to a zone id string (e.g. 'westernplaguelands'). */
export function entranceYardsForZone(
  rows: readonly EntranceYardRow[],
  zone: string,
): EntranceYardRow[] {
  return rows.filter((r) => r.zone === zone);
}
