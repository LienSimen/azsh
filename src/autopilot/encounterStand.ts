// Whether the party is actually at an encounter, not at a mid-route walk cut. Autopilot stops
// PATH_ENGAGE_OPEN_YD short of the first on-path pack; that cut is not the boss.
import { DEFAULT_OPEN_YD } from '../engine/combat/combatGeometry.ts';
import { routeArrived } from '../world/routeAuthoring.ts';

/** Same 8 yd as `ROUTE_LEAD_ARRIVE_YD` — on the approach stand, not the pack cut. */
export const ENCOUNTER_ARRIVE_YD = 8;

type Pt = { x: number; y: number; z?: number };

const reachYd = (a: Pt, b: Pt): number => {
  const flat = Math.hypot(a.x - b.x, a.y - b.y);
  const az = a.z;
  const bz = b.z;
  if (az == null || bz == null || !Number.isFinite(az) || !Number.isFinite(bz)) return flat;
  return Math.hypot(flat, Math.abs(az - bz));
};

/** Approach stand: DEFAULT_OPEN_YD short of origin toward `from` (same as approachStandWorld). */
export function standOffFrom(from: Pt, origin: Pt, standOffYd: number = DEFAULT_OPEN_YD): Pt {
  const dx = origin.x - from.x;
  const dy = origin.y - from.y;
  const len = Math.hypot(dx, dy);
  if (!(len > 1e-6) || !(standOffYd > 0)) {
    return { x: origin.x - standOffYd, y: origin.y, z: origin.z };
  }
  return {
    x: origin.x - (dx / len) * standOffYd,
    y: origin.y - (dy / len) * standOffYd,
    z: origin.z,
  };
}

// True only when standing on the encounter origin, its 18 yd approach stand, or a body of that encounter.
// 80 yd short (a corridor pack) is false.
export function partyAtEncounterStep(
  party: Pt,
  origin: Pt | null | undefined,
  bodies: readonly Pt[] = [],
): boolean {
  if (origin) {
    if (reachYd(party, origin) <= DEFAULT_OPEN_YD + ENCOUNTER_ARRIVE_YD) return true;
    if (reachYd(party, standOffFrom(party, origin)) <= ENCOUNTER_ARRIVE_YD) return true;
  }
  for (const b of bodies) {
    if (reachYd(party, b) <= DEFAULT_OPEN_YD + 6) return true;
  }
  return false;
}

/** On the pin itself — not the 18 yd approach stand. A truncated pack cut is false. */
export function partyOnWaypoint(
  party: Pt,
  node: Pt | null | undefined,
  arriveYd: number = ENCOUNTER_ARRIVE_YD,
): boolean {
  if (!node) return false;
  return routeArrived(party, node, arriveYd);
}

// Living allies this far from the player are not "the party". They rejoin the lead corridor — the player
// does not stop for them.
export const PARTY_TRAVEL_LEASH_YD = 22;

export type PartyMemberPt = Pt & { side: string };

/** Sides (not the player) whose reach to the player is past the travel leash. */
export function partyStragglers(
  player: Pt | null | undefined,
  members: readonly PartyMemberPt[],
  leashYd: number = PARTY_TRAVEL_LEASH_YD,
): string[] {
  if (!player) return [];
  const out: string[] = [];
  for (const m of members) {
    if (m.side === 'player') continue;
    if (reachYd(player, m) > leashYd) out.push(m.side);
  }
  return out;
}

// Dest that would walk past the live pack. 8 yd is past melee park (2) and inside a 25 yd stand, so a
// click-in dest is kept and a leftover corridor is not.
export const DEST_PAST_FIGHT_SLACK_YD = 8;

export function destWalksPastFight(
  at: Pt,
  dest: Pt,
  fight: Pt,
  slackYd: number = DEST_PAST_FIGHT_SLACK_YD,
): boolean {
  return reachYd(at, dest) > reachYd(at, fight) + slackYd;
}

/** Leftover corridor dests that would walk a unit through the live pack. */
export function destsPastFight(args: {
  sides: readonly string[];
  posOf(side: string): Pt | null | undefined;
  destOf(side: string): Pt | null | undefined;
  fights: readonly Pt[];
}): { side: string; fight: Pt }[] {
  if (args.fights.length === 0) return [];
  const out: { side: string; fight: Pt }[] = [];
  for (const side of args.sides) {
    const at = args.posOf(side);
    const dest = args.destOf(side);
    if (!at || !dest) continue;
    let nearest: Pt | null = null;
    let best = Infinity;
    for (const f of args.fights) {
      const d = reachYd(at, f);
      if (d < best) {
        best = d;
        nearest = f;
      }
    }
    if (!nearest || !destWalksPastFight(at, dest, nearest)) continue;
    out.push({ side, fight: nearest });
  }
  return out;
}
