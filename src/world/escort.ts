/**
 * Dungeon escort run state — pure (no DOM / clock / nav).
 *
 * Walks an authored script_waypoint polyline at MOVE_WALK. Live floor mirrors
 * position onto ContinuousEntity; quest credit is recordEventHappens / finishEscort.
 *
 * Cite: ScriptDevAI base/escort_ai.h; Unit.cpp MOVE_WALK 2.5; script_waypoint rows.
 */

import { PATROL_WALK_SPEED_YD } from '../data/dungeonSpawns.ts';

/** One row of script_waypoint (PositionX/Y/Z + WaitTime). Point is 1-based. */
export type EscortWaypoint = {
  point: number;
  x: number;
  y: number;
  z?: number;
  /** Wait at this point after arrival (ms). Cite: script_waypoint.WaitTime. */
  waitMs?: number;
};

// Authored escort definition. Waypoints must come from script_waypoint / survey / baked creature origins —
// never invented.
export type EscortDef = {
  id: string;
  questId: number;
  npcEntry: number;
  mapId: number;
  instanceId: string;
  waypoints: readonly EscortWaypoint[];
  // Point id that grants EventHappens / explore credit. Cite: e.g. razorfen_kraul.cpp:122-128 WP46 →
  // RewardPlayerAndGroupAtEventExplored.
  creditPoint: number;
  /** Points that emit ambush hooks (controller may spawn packs). */
  ambushPoints?: readonly number[];
  // Optional door/cell pause hooks — live layer opens GOs when these fire. Not required for travel-only
  // escorts.
  doorPoints?: readonly number[];
  /**
   * Pause when party is farther than this (yards). Omit → never distance-pause.
   * Classic escort AI fails/despawns far players; we only pause so the path stays
   * followable without inventing a fail-despawn timer.
   */
  maxPartyDistYd?: number;
};

export type EscortStatus = 'active' | 'paused' | 'done' | 'failed';

export type EscortRun = {
  defId: string;
  questId: number;
  npcGuid: number;
  npcEntry: number;
  /** Index into def.waypoints for the current target. */
  waypointIndex: number;
  status: EscortStatus;
  /** Remaining wait after arriving at the current target (ms). */
  waitRemainingMs: number;
  x: number;
  y: number;
  z?: number;
  /** Point ids already arrived (ambush/credit once). */
  reachedPoints: number[];
  failReason?: string;
};

export type EscortTickEvent =
  | { kind: 'arrived'; point: number }
  | { kind: 'ambush'; point: number }
  | { kind: 'door'; point: number }
  | { kind: 'credit'; questId: number }
  | { kind: 'done' }
  | { kind: 'failed'; reason: string }
  | { kind: 'paused'; reason: 'party_far' }
  | { kind: 'resumed' };

function dist2(dx: number, dy: number): number {
  return Math.sqrt(dx * dx + dy * dy);
}

/** Begin an escort at the first waypoint (or start override). */
export function startEscort(opts: {
  def: EscortDef;
  npcGuid: number;
  start?: { x: number; y: number; z?: number };
}): EscortRun {
  const { def, npcGuid } = opts;
  const wp0 = def.waypoints[0];
  if (!wp0) {
    return {
      defId: def.id,
      questId: def.questId,
      npcGuid,
      npcEntry: def.npcEntry,
      waypointIndex: 0,
      status: 'failed',
      waitRemainingMs: 0,
      x: opts.start?.x ?? 0,
      y: opts.start?.y ?? 0,
      z: opts.start?.z,
      reachedPoints: [],
      failReason: 'no_waypoints',
    };
  }
  const start = opts.start ?? { x: wp0.x, y: wp0.y, z: wp0.z };
  return {
    defId: def.id,
    questId: def.questId,
    npcGuid,
    npcEntry: def.npcEntry,
    waypointIndex: 0,
    status: 'active',
    waitRemainingMs: 0,
    x: start.x,
    y: start.y,
    z: start.z,
    reachedPoints: [],
  };
}

export function failEscort(run: EscortRun, reason: string): EscortRun {
  if (run.status === 'done' || run.status === 'failed') return run;
  return { ...run, status: 'failed', failReason: reason };
}

// Advance escort by dtMs along the waypoint polyline at walk speed. Pure — mutates nothing; returns next
// run + discrete events.
export function tickEscort(
  run: EscortRun,
  def: EscortDef,
  dtMs: number,
  opts?: {
    /** Default Unit.cpp MOVE_WALK 2.5 yd/s. */
    speedYdPerSec?: number;
    partyPos?: { x: number; y: number };
  },
): { run: EscortRun; events: EscortTickEvent[] } {
  if (run.status === 'done' || run.status === 'failed') {
    return { run, events: [] };
  }
  if (!(dtMs > 0) || def.waypoints.length === 0) {
    return { run, events: [] };
  }

  const events: EscortTickEvent[] = [];
  let next: EscortRun = { ...run, reachedPoints: run.reachedPoints.slice() };
  const speed = opts?.speedYdPerSec ?? PATROL_WALK_SPEED_YD;
  const maxDist = def.maxPartyDistYd;

  // Distance leash — pause while party is too far (resume when back).
  if (maxDist != null && maxDist > 0 && opts?.partyPos) {
    const d = dist2(opts.partyPos.x - next.x, opts.partyPos.y - next.y);
    if (d > maxDist) {
      if (next.status !== 'paused') {
        next = { ...next, status: 'paused' };
        events.push({ kind: 'paused', reason: 'party_far' });
      }
      return { run: next, events };
    }
    if (next.status === 'paused') {
      next = { ...next, status: 'active' };
      events.push({ kind: 'resumed' });
    }
  } else if (next.status === 'paused') {
    // No leash check this tick — stay paused only if we had a prior distance pause
    // without partyPos would softlock; clear if partyPos absent.
    next = { ...next, status: 'active' };
    events.push({ kind: 'resumed' });
  }

  let budget = dtMs;
  // Bound segment hops (path length * a few) so a huge dt cannot loop forever.
  const hopCap = Math.max(8, def.waypoints.length * 4);
  for (let hop = 0; hop < hopCap && budget > 0 && next.status === 'active'; hop++) {
    if (next.waypointIndex >= def.waypoints.length) {
      next = { ...next, status: 'done' };
      events.push({ kind: 'done' });
      break;
    }
    const target = def.waypoints[next.waypointIndex]!;

    // Finish wait at current target before advancing.
    if (next.waitRemainingMs > 0) {
      const w = Math.min(budget, next.waitRemainingMs);
      next = { ...next, waitRemainingMs: next.waitRemainingMs - w };
      budget -= w;
      if (next.waitRemainingMs > 0) break;
      // Wait finished — step to next waypoint index.
      const afterWait = next.waypointIndex + 1;
      if (afterWait >= def.waypoints.length) {
        next = { ...next, status: 'done', waypointIndex: afterWait };
        events.push({ kind: 'done' });
        break;
      }
      next = { ...next, waypointIndex: afterWait };
      continue;
    }

    const dx = target.x - next.x;
    const dy = target.y - next.y;
    const dist = dist2(dx, dy);
    if (dist <= 0.35) {
      // Arrived.
      if (!next.reachedPoints.includes(target.point)) {
        next.reachedPoints.push(target.point);
        events.push({ kind: 'arrived', point: target.point });
        if (def.ambushPoints?.includes(target.point)) {
          events.push({ kind: 'ambush', point: target.point });
        }
        if (def.doorPoints?.includes(target.point)) {
          events.push({ kind: 'door', point: target.point });
        }
        if (target.point === def.creditPoint) {
          events.push({ kind: 'credit', questId: def.questId });
        }
      }
      const wait = Math.max(0, target.waitMs ?? 0);
      if (wait > 0) {
        next = {
          ...next,
          x: target.x,
          y: target.y,
          z: target.z ?? next.z,
          waitRemainingMs: wait,
        };
        continue;
      }
      const after = next.waypointIndex + 1;
      next = {
        ...next,
        x: target.x,
        y: target.y,
        z: target.z ?? next.z,
        waypointIndex: after,
      };
      if (after >= def.waypoints.length) {
        next = { ...next, status: 'done' };
        events.push({ kind: 'done' });
        break;
      }
      continue;
    }

    const stepYd = (speed * budget) / 1000;
    if (stepYd >= dist) {
      const travelMs = (dist / speed) * 1000;
      budget -= travelMs;
      next = {
        ...next,
        x: target.x,
        y: target.y,
        z: target.z ?? next.z,
      };
      // Fall through to arrival handling next hop with remaining budget.
      continue;
    }
    const t = stepYd / dist;
    next = {
      ...next,
      x: next.x + dx * t,
      y: next.y + dy * t,
    };
    budget = 0;
  }

  return { run: next, events };
}

/** Escort defs registered for live floor + probes. */
const REGISTRY: EscortDef[] = [];

export function registerEscortDef(def: EscortDef): void {
  const i = REGISTRY.findIndex((d) => d.id === def.id);
  if (i >= 0) REGISTRY[i] = def;
  else REGISTRY.push(def);
}

export function escortDefs(): readonly EscortDef[] {
  return REGISTRY;
}

export function escortDefById(id: string): EscortDef | undefined {
  return REGISTRY.find((d) => d.id === id);
}

export function escortDefForQuest(questId: number, mapId?: number): EscortDef | undefined {
  return REGISTRY.find(
    (d) => d.questId === questId && (mapId == null || d.mapId === mapId),
  );
}

export function escortDefForNpc(npcEntry: number, mapId?: number): EscortDef | undefined {
  return REGISTRY.find(
    (d) => d.npcEntry === npcEntry && (mapId == null || d.mapId === mapId),
  );
}
