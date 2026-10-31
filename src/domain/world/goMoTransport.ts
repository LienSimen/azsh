// GAMEOBJECT_TYPE_MO_TRANSPORT (15) ride against gd.transports — not type 11 elevators.
// Cite: SharedDefines.h:532; Transports.cpp:271 AddPassenger; :349 Update; :206 TeleportTransport.

import { GAMEOBJECT_TYPE_MO_TRANSPORT } from './gameObjects.ts';
import { waitSecondsUntilDeparture, type TransportRow } from '../nav/travel.ts';
import type { GameObjectDef } from '../../data/schema.ts';

export type Type15Ride =
  | {
      kind: 'crossing';
      from: string;
      to: string;
      transportEntry: number;
      waitSeconds: number;
      seconds: number;
    }
  | { kind: 'board' }
  | { kind: 'not_at_dock' };

export function isType15MoTransport(go: Pick<GameObjectDef, 'type'>): boolean {
  return go.type === GAMEOBJECT_TYPE_MO_TRANSPORT;
}

// Resolve a type-15 Use against the existing transports bake. Continent boats/zepps take the next
// other-zone crossing; Naxx / same-zone ferry only board.
export function resolveType15Ride(
  go: Pick<GameObjectDef, 'entry' | 'type'>,
  zoneId: string,
  transports: readonly TransportRow[],
  nowMs: number,
): Type15Ride {
  if (!isType15MoTransport(go)) return { kind: 'board' };
  let tr: TransportRow | undefined;
  for (const row of transports) {
    if (row.entry === go.entry) {
      tr = row;
      break;
    }
  }
  if (!tr || tr.periodMs <= 0) return { kind: 'board' };
  const stop = tr.stops.find((s) => s.zone === zoneId);
  if (!stop) return { kind: 'not_at_dock' };
  const crossing = tr.crossings.find((c) => c.from === zoneId && !!c.to && c.to !== zoneId);
  if (!crossing?.to) return { kind: 'board' };
  const waitSeconds = waitSecondsUntilDeparture(nowMs, stop.departMs, tr.periodMs);
  return {
    kind: 'crossing',
    from: zoneId,
    to: crossing.to,
    transportEntry: tr.entry,
    waitSeconds,
    seconds: waitSeconds + crossing.seconds,
  };
}

/** Type-15 templates whose baked stops attribute this zone (no new bake). */
export function type15GameObjectsInZone(
  zoneId: string,
  transports: readonly TransportRow[],
  gameObject: (entry: number) => GameObjectDef | undefined,
): GameObjectDef[] {
  const out: GameObjectDef[] = [];
  const seen = new Set<number>();
  for (const tr of transports) {
    if (seen.has(tr.entry)) continue;
    if (!tr.stops.some((s) => s.zone === zoneId)) continue;
    const go = gameObject(tr.entry);
    if (go && go.type === GAMEOBJECT_TYPE_MO_TRANSPORT) {
      seen.add(tr.entry);
      out.push(go);
    }
  }
  return out;
}
