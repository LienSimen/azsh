// Shared route-editor session: parse, undo snapshots, insert/delete, plan seed.
// Both the live run bar and the standalone path editor call this. One click, one undo.

import type { InstanceDef } from '../data/schema.ts';
import { dungeonGameObjectsForMap } from '../data/dungeonGameObjects.ts';
import {
  flagsSetByEncounter,
  hasFlag,
  isCleared,
  type InstanceRun,
} from './instances.ts';
import { worldPosForEncounter } from './dungeonRouteGeometry.ts';
import { routeInsertIndex } from './routeAuthoring.ts';
import { objectiveItinerary } from './dungeonObjectives.ts';
import { setAuthoredRouteAnchors } from './dungeonRouteOrder.ts';
import authoredRoutesJson from '../data/tables/dungeonAuthoredRoutes.json' with { type: 'json' };

export type RouteEditNode = {
  kind: 'walk' | 'use';
  x: number;
  y: number;
  z?: number;
  goEntry?: number;
  name?: string;
};

export const ROUTE_EDIT_UNDO_CAP = 40;

export function parseRouteEditNodes(raw: unknown): RouteEditNode[] {
  if (!Array.isArray(raw)) return [];
  return (raw as RouteEditNode[]).filter(
    (n) => n && (n.kind === 'walk' || n.kind === 'use')
      && Number.isFinite(n.x) && Number.isFinite(n.y),
  );
}

export function cloneRouteEditNodes(nodes: readonly RouteEditNode[]): RouteEditNode[] {
  return nodes.map((n) => ({ ...n }));
}

export function pushRouteEditUndo(stack: RouteEditNode[][], nodes: readonly RouteEditNode[]): void {
  stack.push(cloneRouteEditNodes(nodes));
  if (stack.length > ROUTE_EDIT_UNDO_CAP) stack.shift();
}

/** Splice `n` into the nearest drawn leg, or append when `forceAppend`. Returns the index. */
export function insertRouteEditNode(
  nodes: RouteEditNode[],
  n: RouteEditNode,
  forceAppend = false,
): number {
  const at = forceAppend ? nodes.length : routeInsertIndex(nodes, n);
  nodes.splice(at, 0, n);
  return at;
}

export function deleteRouteEditNode(nodes: RouteEditNode[], idx: number): boolean {
  if (!Number.isFinite(idx) || idx < 0 || idx >= nodes.length) return false;
  nodes.splice(idx, 1);
  return true;
}

/**
 * Remaining bosses, flag packs, unmet object gates — InstanceDef spine order.
 * Geometric NN (live pack tour) is not the itinerary: it put BRD's vault doors
 * after Roccor because the vault is 235 yd away and Gerstahn is 345 yd back.
 */
export function seedRouteFromPlan(def: InstanceDef, run: InstanceRun): RouteEditNode[] {
  const gos = dungeonGameObjectsForMap(def.mapId);
  const seenGate = new Set<number>();
  const out: RouteEditNode[] = [];
  for (const enc of def.encounters) {
    if (isCleared(run, enc.id)) continue;
    // Quest-started side content (Gor'shak) is not on the default itinerary.
    if (enc.startQuestId) continue;
    for (const ev of enc.events ?? []) {
      if (ev.kind !== 'objectGate') continue;
      if (ev.setsFlag && hasFlag(run, ev.setsFlag)) continue;
      const entries = [ev.goEntry, ...(ev.goEntries ?? [])]
        .filter((e): e is number => typeof e === 'number' && e > 0);
      for (const goEntry of entries) {
        if (seenGate.has(goEntry)) continue;
        seenGate.add(goEntry);
        const go = gos.find((g) => g.entry === goEntry);
        if (!go) continue;
        const un: RouteEditNode = { kind: 'use', goEntry, name: go.name, x: go.x, y: go.y };
        if (Number.isFinite(go.z)) un.z = go.z;
        out.push(un);
      }
    }
    if (enc.kind !== 'boss' && flagsSetByEncounter(enc).length === 0) continue;
    const w = worldPosForEncounter(def, run, enc.id);
    if (!w) continue;
    const n: RouteEditNode = { kind: 'walk', x: w.x, y: w.y, name: enc.name || enc.id };
    if (w.z != null && Number.isFinite(w.z)) n.z = w.z;
    out.push(n);
  }
  return out;
}

/**
 * Route to ONE picked objective — the atlas pin the operator set before walking in.
 *
 * `seedRouteFromPlan` above is the whole dungeon in def order. This is the run the
 * operator asked for: `objectiveItinerary` resolves the target's prerequisite graph
 * (Baron Rivendare wants three ziggurats, nine abominations, Ramstein and the Black
 * Guard gauntlet; Emberseer wants his seven rune rooms) and each stop still gets its
 * unmet object gates as a ⚙ use-step in front of it. Ends ON the target — nothing
 * behind it is on the itinerary.
 *
 * Empty when the target resolves to nothing walkable; callers fall back to the plan.
 */
export function objectiveRouteFor(
  def: InstanceDef,
  run: InstanceRun,
  targetEncounterId: string,
): RouteEditNode[] {
  const gos = dungeonGameObjectsForMap(def.mapId);
  const seenGate = new Set<number>();
  const out: RouteEditNode[] = [];
  for (const enc of objectiveItinerary(def, run, targetEncounterId)) {
    if (isCleared(run, enc.id)) continue;
    for (const ev of enc.events ?? []) {
      if (ev.kind !== 'objectGate') continue;
      if (ev.setsFlag && hasFlag(run, ev.setsFlag)) continue;
      const entries = [ev.goEntry, ...(ev.goEntries ?? [])]
        .filter((e): e is number => typeof e === 'number' && e > 0);
      for (const goEntry of entries) {
        if (seenGate.has(goEntry)) continue;
        seenGate.add(goEntry);
        const go = gos.find((g) => g.entry === goEntry);
        if (!go) continue;
        const un: RouteEditNode = { kind: 'use', goEntry, name: go.name, x: go.x, y: go.y };
        if (Number.isFinite(go.z)) un.z = go.z;
        out.push(un);
      }
    }
    const w = worldPosForEncounter(def, run, enc.id);
    if (!w) continue;
    const n: RouteEditNode = { kind: 'walk', x: w.x, y: w.y, name: enc.name || enc.id };
    if (w.z != null && Number.isFinite(w.z)) n.z = w.z;
    out.push(n);
  }
  return out;
}

/** In-session Seed writes land here so Reset does not wait on a JSON HMR. */
const authoredOverride: Record<string, RouteEditNode[]> = {};

export function rememberAuthoredRoute(instanceId: string, nodes: readonly RouteEditNode[]): void {
  authoredOverride[instanceId] = serializeRouteEditNodes(nodes);
  // The itinerary is also the route ORDER (dungeonRouteOrder anchors), not just the drawn line.
  setAuthoredRouteAnchors(
    instanceId,
    nodes.filter((n) => n.kind !== 'use' && n.name).map((n) => n.name!),
  );
}

/** Shipped default for this instance, or [] if none has been Seeded yet. */
export function authoredRouteFor(instanceId: string): RouteEditNode[] {
  const over = authoredOverride[instanceId];
  if (over?.length) return cloneRouteEditNodes(over);
  const raw = (authoredRoutesJson as { routes?: Record<string, unknown> }).routes?.[instanceId];
  return parseRouteEditNodes(raw ?? []);
}

// The route to walk. A picked atlas objective wins over both the shipped route and the whole-dungeon plan —
// that pick IS the run the operator planned.
export function defaultRouteFor(
  def: InstanceDef,
  run: InstanceRun,
  targetEncounterId?: string | null,
): RouteEditNode[] {
  if (targetEncounterId) {
    const toTarget = objectiveRouteFor(def, run, targetEncounterId);
    if (toTarget.length) return toTarget;
  }
  const shipped = authoredRouteFor(def.id);
  return shipped.length ? shipped : seedRouteFromPlan(def, run);
}

export function serializeRouteEditNodes(nodes: readonly RouteEditNode[]): RouteEditNode[] {
  return nodes.map((n) => {
    const o: RouteEditNode = { kind: n.kind, x: n.x, y: n.y };
    if (n.z != null && Number.isFinite(n.z)) o.z = n.z;
    if (n.goEntry != null && Number.isFinite(n.goEntry)) o.goEntry = n.goEntry;
    if (n.name) o.name = n.name;
    return o;
  });
}

// Hand-edited routes survive. Unmarked storage takes the shipped default, else the plan
// (probe-path-editor-authoring: a stale 45-step seed without the flag is disposable).
export function resolveRouteLoad(
  stored: readonly RouteEditNode[],
  handEdited: boolean,
  def: InstanceDef,
  run: InstanceRun,
  targetEncounterId?: string | null,
): { nodes: RouteEditNode[]; seeded: boolean } {
  // An atlas pick outranks a hand-edited route: the operator just said, on the pre-run
  // screen, where this run goes. A stale stored path is not that answer.
  if (targetEncounterId) {
    const toTarget = objectiveRouteFor(def, run, targetEncounterId);
    if (toTarget.length) return { nodes: toTarget, seeded: true };
  }
  if (handEdited) return { nodes: cloneRouteEditNodes(stored), seeded: false };
  return { nodes: defaultRouteFor(def, run), seeded: true };
}
