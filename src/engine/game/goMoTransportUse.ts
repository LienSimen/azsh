// Apply a successful type-15 Use: AddPassenger, then TeleportTransport via the transports bake.
// Cite: Transports.cpp:271 AddPassenger; :349 Transport::Update; :206 TeleportTransport.

import { departJourney } from '../../domain/nav/travel.ts';
import type { JourneyLeg } from '../../domain/nav/travelTypes.ts';
import { resolveType15Ride } from '../../domain/world/goMoTransport.ts';
import { refuseIfDead } from '../../domain/run/death.ts';
import type { GameObjectDef } from '../../data/schema.ts';
import type { LootDrop } from '../../domain/items/loot.ts';
import type { ActionResult } from './types.ts';
import type { GameCtx } from './context.ts';

export type Type15DepartHooks = {
  afterDepart: (nowMs: number) => void;
};

export function applyType15MoTransportUse(
  ctx: GameCtx,
  go: GameObjectDef,
  nowMs: number,
  hooks: Type15DepartHooks,
): ActionResult<{ yielded: LootDrop[]; destination?: string; travelMs?: number; boarded?: boolean }> {
  const { ds, state, log } = ctx;
  const dead = refuseIfDead(state.char.health, state.deathFlow);
  if (dead) return dead;
  if (state.char.journey) return { ok: false, reason: 'You are already travelling' };

  const ride = resolveType15Ride(go, state.char.zoneId, ds.transports(), nowMs);
  if (ride.kind === 'not_at_dock') {
    return { ok: false, reason: 'The transport is not here' };
  }
  if (ride.kind === 'board') {
    log(`You board ${go.name}.`);
    return { ok: true, yielded: [], boarded: true };
  }

  const leg: JourneyLeg = {
    kind: 'transport',
    from: ride.from,
    to: ride.to,
    seconds: ride.seconds,
    costCopper: 0,
    transportEntry: ride.transportEntry,
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
