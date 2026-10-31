// Apply a successful type-11 Use: board (AddPassenger) and, for Subway, depart the tram bake.
// Cite: Transports.cpp:271 AddPassenger; :454 ElevatorTransport::Update; travelEdges kind tram.

import { departJourney } from '../../domain/nav/travel.ts';
import type { JourneyLeg } from '../../domain/nav/travelTypes.ts';
import { resolveType11Ride } from '../../domain/world/goTransport.ts';
import { refuseIfDead } from '../../domain/run/death.ts';
import type { GameObjectDef } from '../../data/schema.ts';
import type { LootDrop } from '../../domain/items/loot.ts';
import type { ActionResult } from './types.ts';
import type { GameCtx } from './context.ts';

export type Type11DepartHooks = {
  afterDepart: (nowMs: number) => void;
};

export function applyType11TransportUse(
  ctx: GameCtx,
  go: GameObjectDef,
  nowMs: number,
  hooks: Type11DepartHooks,
): ActionResult<{ yielded: LootDrop[]; destination?: string; travelMs?: number; boarded?: boolean }> {
  const { ds, state, log } = ctx;
  const dead = refuseIfDead(state.char.health, state.deathFlow);
  if (dead) return dead;
  if (state.char.journey) return { ok: false, reason: 'You are already travelling' };

  const ride = resolveType11Ride(go, state.char.zoneId, ds.travelEdges(), nowMs);
  if (ride.kind === 'not_at_station') {
    return { ok: false, reason: 'The tram is not here' };
  }
  if (ride.kind === 'elevator') {
    log(`You board ${go.name}.`);
    return { ok: true, yielded: [], boarded: true };
  }

  const leg: JourneyLeg = {
    kind: 'tram',
    from: ride.from,
    to: ride.to,
    seconds: ride.seconds,
    costCopper: 0,
    waitSeconds: ride.waitSeconds,
  };
  if (state.instance) state.instance = null;
  const journey = departJourney([leg], nowMs);
  state.char = { ...state.char, journey };
  state.corpse = null;
  hooks.afterDepart(nowMs);

  const destName = ds.zone(ride.to)?.name ?? ride.to;
  const etaMin = Math.max(1, Math.round(ride.seconds / 60));
  log(`You board ${go.name} for ${destName} (ETA ~${etaMin} min).`);
  return {
    ok: true,
    yielded: [],
    destination: ride.to,
    travelMs: ride.seconds * 1000,
  };
}
