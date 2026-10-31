// GAMEOBJECT_TYPE_TRANSPORT (11) Use — elevators and the Deeprun Tram, not MO_TRANSPORT (15).
// Boarding is AddPassenger; the tram's period and one-way time live on the travel edges.

import { GAMEOBJECT_TYPE_TRANSPORT } from './gameObjects.ts';
import { tramWaitSeconds, type TravelEdgeRow } from '../nav/travel.ts';
import type { GameObjectDef } from '../../data/schema.ts';

/** Deeprun Tram cars. Cite: core.travel SUBWAY_ENTRIES; DataBundle.travelEdges tram note. */
export const SUBWAY_GO_ENTRIES: ReadonlySet<number> = new Set([
  176080, 176081, 176082, 176083, 176084, 176085,
]);

export type Type11Ride =
  | {
      kind: 'tram';
      from: string;
      to: string;
      periodMs: number;
      oneWaySeconds: number;
      waitSeconds: number;
      seconds: number;
    }
  | { kind: 'elevator' }
  | { kind: 'not_at_station' };

function tramEdgeOf(
  travelEdges: readonly TravelEdgeRow[],
): Extract<TravelEdgeRow, { kind: 'tram' }> | undefined {
  for (const e of travelEdges) {
    if (e.kind === 'tram') return e;
  }
  return undefined;
}

/** True when this template is a type-11 elevator/tram car (not a type-15 boat/zep). */
export function isType11Transport(go: Pick<GameObjectDef, 'type'>): boolean {
  return go.type === GAMEOBJECT_TYPE_TRANSPORT;
}

// Resolve a type-11 Use against the existing travel bake: a subway car rides the tram edge, whose
// period is already baked, while the elevators stay in-zone with no map change.
export function resolveType11Ride(
  go: Pick<GameObjectDef, 'entry' | 'type'>,
  zoneId: string,
  travelEdges: readonly TravelEdgeRow[],
  nowMs: number,
): Type11Ride {
  if (!isType11Transport(go) || !SUBWAY_GO_ENTRIES.has(go.entry)) {
    return { kind: 'elevator' };
  }
  const edge = tramEdgeOf(travelEdges);
  if (!edge) return { kind: 'elevator' };
  if (zoneId !== edge.a && zoneId !== edge.b) return { kind: 'not_at_station' };
  const to = zoneId === edge.a ? edge.b : edge.a;
  const waitSeconds = tramWaitSeconds(nowMs, edge.periodMs);
  return {
    kind: 'tram',
    from: zoneId,
    to,
    periodMs: edge.periodMs,
    oneWaySeconds: edge.oneWaySeconds,
    waitSeconds,
    seconds: waitSeconds + edge.oneWaySeconds,
  };
}

// Subway templates the tram edge onto this zone, needing no new bake. ONE car, not six: the six
// entries are the same ride, and a flat clickable list would show five duplicate rows.
export function type11GameObjectsInZone(
  zoneId: string,
  travelEdges: readonly TravelEdgeRow[],
  gameObject: (entry: number) => GameObjectDef | undefined,
): GameObjectDef[] {
  const edge = tramEdgeOf(travelEdges);
  if (!edge || (zoneId !== edge.a && zoneId !== edge.b)) return [];
  for (const entry of SUBWAY_GO_ENTRIES) {
    const go = gameObject(entry);
    if (go && go.type === GAMEOBJECT_TYPE_TRANSPORT) return [go];
  }
  return [];
}
