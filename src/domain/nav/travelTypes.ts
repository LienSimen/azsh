// Wave J shared contract, so the parallel missions agree on shapes without importing each other.
// A journey is a departure timestamp plus frozen leg seconds; position is always DERIVED from now.

/** How one leg of a journey is traversed. 'hearth'/'portal' land in Wave K. */
export type JourneyLegKind = 'ground' | 'taxi' | 'transport' | 'tram' | 'hearth' | 'portal';

// One planned leg. Seconds come from sourced speeds at planning time: ground yards ÷ effective
// yd/s, taxi from gd.taxiRoutes.seconds, transport crossing plus the dock wait at planning time.
export interface JourneyLeg {
  kind: JourneyLegKind;
  /** Zone id at leg start. */
  from: string;
  /** Zone id at leg end. */
  to: string;
  /** Wall-clock seconds for this leg (includes `waitSeconds` when present). */
  seconds: number;
  /** Copper paid for this leg (taxi fares; 0 otherwise). */
  costCopper: number;
  /** Ground legs: navmesh-true yardages traversed (UI). */
  yardsRun?: number;
  yardsSwim?: number;
  /** Taxi legs: the TaxiPath.dbc hop ids flown, in order. */
  taxiPathIds?: number[];
  /** Transport legs: gd.transports entry serving the crossing. */
  transportEntry?: number;
  /** Transport/tram legs: dock wait until the departure used by the plan. */
  waitSeconds?: number;
}

// Wall-clock journey state (D5). Persisted on the character (J3, save v24). Sim Pause folds its idle time
// into `pausedMs`, so arrival = departedAtEpochMs + Σ(legs.seconds)·1000 + pausedMs.
export interface Journey {
  departedAtEpochMs: number;
  legs: JourneyLeg[];
  /** Final destination zone id (== legs.at(-1)?.to). */
  destination: string;
  /** Accumulated pause milliseconds (Sim Pause idle time so far). */
  pausedMs: number;
  // Fast-forward factor: journey seconds elapse at timeScale × real time, so 2× really arrives
  // sooner. Changing it mid-journey rebases departedAtEpochMs; persisted for offline arrival.
  timeScale?: number;
  // Class-teleport spell id from castTeleport only, not map portal edges. Reagents are gated at
  // cast start but taken on arrival, so a cancel must not consume them (KI-428).
  teleportSpellId?: number;
}

/** Derived (never stored) position along a journey at a given `now`. */
export interface JourneyProgress {
  /** Index into legs (clamped to last while arriving). */
  legIndex: number;
  /** Zone the traveler is currently in: legs[legIndex].from until the leg completes. */
  zone: string;
  legElapsedSeconds: number;
  totalElapsedSeconds: number;
  remainingSeconds: number;
  arrived: boolean;
}

/** Effective movement speeds in yd/s — produced by J2 (speed.ts), consumed by J1. */
export interface TravelSpeeds {
  /** Ground speed with the auto-best mount/form/passive already applied. */
  run: number;
  /** Swim speed (aura 58 bucket). */
  swim: number;
}

/** Hearthstone bind (K2 wires the cast; J3 persists it). Zone-anchored: the bind
 *  target is a baked tavern/innkeeper location (gd.tavernTriggers). */
export interface HearthBind {
  zone: string;
  /** areatrigger_tavern trigger id when bound at a tavern trigger. */
  trigger?: number;
  /** Display name of the inn/innkeeper for UI. */
  name?: string;
}
