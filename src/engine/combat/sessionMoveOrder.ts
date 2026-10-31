// Manual move orders — peeled from sessionMotion (E4.2 arm 3, ENGINE-REBUILD.md). Pure move: same body,
// same gate, same stuck ladder as `advanceMoveOrder`. Extracted modules must not import combat.ts.

import { isEnemySide } from '../core/events.ts';
import {
  moveStepYd, combatDistanceYd, planarRangeHonestYd, type CombatPosYd,
} from './combatGeometry.ts';
import { detHypot, detHypot3 } from '../core/detMath.ts';
import type { MotionClaims, MotionOwner } from './motionClaim.ts';
import type { MotionGenerator } from './motionGenerator.ts';
import type { CombatContext } from './context.ts';
import type { Fighter } from './types.ts';
import type { UnitNavPath } from './sessionPathTo.ts';

// Move-order stuck ladder: an order outranks gap-close and never expired, so an unreachable waypoint
// froze the unit and the party leash. Repath at 400 ms, then an on-mesh hop toward the dest.
const ORDER_REPATH_MS = 400;
const ORDER_NUDGE_MS = 1_200;

/** Closures the move-order arm needs from installSessionMotion. */
export interface MoveOrderDeps {
  ctx: CombatContext;
  tickMs: number;
  claims: MotionClaims;
  /** Within this many yards of the dest the order has arrived and pops. */
  arriveYd: number;
  /** Terminal rung of the unstuck ladder fires after this many failed soft hops. */
  unstuckFailsRecall: number;
  posOf: (side: string) => CombatPosYd | undefined;
  setPos: (side: string, p: CombatPosYd) => void;
  diag: (side: string, name: string) => void;
  takeMotion: (side: string, owner: MotionOwner, goal: CombatPosYd | null) => CombatPosYd | null;
  /** Who owns a stored dest: whoever issued it (`pathTo` records that). */
  orderOwnerOf: (side: string) => MotionOwner;
  navStepToward: (
    side: string, from: CombatPosYd, to: CombatPosYd,
    step: number, stopAtDist: number, searchCorridor?: boolean,
  ) => CombatPosYd;
  dropStaleCorridor: (side: string) => void;
  unitNavPaths: Map<string, UnitNavPath>;
  orderStall: Map<string, { ms: number; hops: number; best: number }>;
  nudgeOntoMesh: (f: Fighter) => boolean;
  softUnstuckToward: (f: Fighter, from: CombatPosYd, goal: CombatPosYd) => boolean;
  watchPartyStuck: (f: Fighter, from: CombatPosYd, to: CombatPosYd, goal: CombatPosYd) => boolean;
  recallToLastGood: (f: Fighter) => boolean;
  unstuckFails: Map<string, number>;
  runSpeedYdPerSec: (f: Fighter) => number;
}

// Manual move order, outranking AI gap-close until the unit arrives, then cleared. `advanceHeld` is the
// same body with the claim already taken: claiming twice with two goals cancelled the dead band out.
export function createMoveOrderArm(deps: MoveOrderDeps): {
  moveOrder: MotionGenerator;
  advanceHeld: (f: Fighter) => boolean;
} {
  const {
    ctx, tickMs, claims, arriveYd: ARRIVE_YD, unstuckFailsRecall: UNSTUCK_FAILS_RECALL,
    posOf, setPos, diag, takeMotion, orderOwnerOf, navStepToward, dropStaleCorridor,
    unitNavPaths, orderStall, nudgeOntoMesh, softUnstuckToward, watchPartyStuck, recallToLastGood,
    unstuckFails, runSpeedYdPerSec,
  } = deps;

  const advanceMoveOrder = (f: Fighter, heldClaim = false): boolean => {
    const orders = (ctx as { unitMoveOrders?: Map<string, CombatPosYd[]> }).unitMoveOrders;
    if (!orders) return false;
    const q = orders.get(f.side);
    if (!q || q.length === 0) {
      if (q) orders.delete(f.side);
      orderStall.delete(f.side);
      return false;
    }
    const dest = q[0]!;
    const from = posOf(f.side);
    if (!from) {
      orders.delete(f.side);
      orderStall.delete(f.side);
      f.decideDirty = true;
      return true;
    }
    // Waypoint reached → pop it; more queued (shift-click) → keep walking next tick.
    // Patrol stance: when the queue empties, reverse the stored loop and walk it again.
    const popArrived = (): void => {
      q.shift();
      orderStall.delete(f.side);
      if (q.length === 0) {
        const stance = (ctx as { unitStance?: Map<string, string> }).unitStance?.get(f.side);
        const loop = (ctx as { unitPatrolLoop?: Map<string, CombatPosYd[]> }).unitPatrolLoop
          ?.get(f.side);
        if (stance === 'patrol' && loop && loop.length >= 2) {
          const rev = loop.slice().reverse();
          (ctx as { unitPatrolLoop?: Map<string, CombatPosYd[]> }).unitPatrolLoop
            ?.set(f.side, rev);
          // Next leg starts at the second point (first is where we already stand).
          const next = rev.slice(1);
          if (next.length) {
            q.push(...next.map((p) => ({ x: p.x, y: p.y })));
            orders.set(f.side, q);
            unitNavPaths.delete(f.side);
            return;
          }
        }
        // Move now arrives and releases so Fight resumes. Hold / Move already latched stand.
        // Not keyed on unitHoldCourse: travel clicks carry it and froze the party.
        const owner = orderOwnerOf(f.side);
        const stanceNow = (ctx as { unitStance?: Map<string, string> }).unitStance?.get(f.side);
        orders.delete(f.side);
        unitNavPaths.delete(f.side);
        (ctx as { unitHoldCourse?: Set<string> }).unitHoldCourse?.delete(f.side);
        (ctx as { unitDirectMove?: Set<string> }).unitDirectMove?.delete(f.side);
        if (stanceNow === 'hold' || stanceNow === 'passive') {
          (ctx as { unitManualMotion?: Set<string> }).unitManualMotion?.add(f.side);
        }
        // Arrived: hand the unit back at once. A policy walk holds its claim for seconds, and
        // without this the next producer would wait out that window on an empty queue.
        claims.release(f.side, owner, ctx.t);
        f.decideDirty = true;
      }
    };
    const dist = combatDistanceYd(from, dest);
    // Planar close on the storey ABOVE the dest is not arrival: that is the stacked-ledge hop, where
    // dest XY is 12 yd away and 19 yd down and a 2-D arrive popped the order on the drop.
    const destFloorOk = dest.z == null || (from.z != null && planarRangeHonestYd(from, dest));
    if (dist == null || (dist <= ARRIVE_YD && destFloorOk)) {
      popArrived();
      return true;
    }
    const speed = runSpeedYdPerSec(f);
    if (!(speed > 0)) return true; // held by snare; keep the order
    const step = moveStepYd(speed, tickMs);
    if (!heldClaim && takeMotion(f.side, orderOwnerOf(f.side), dest) == null) return true;
    const next = navStepToward(f.side, from, dest, step, 0, true);
    setPos(f.side, next);
    const left3 = dest.z != null && next.z != null
      ? detHypot3(next.x - dest.x, next.y - dest.y, next.z - dest.z)
      : (combatDistanceYd(next, dest) ?? Infinity);
    const st = orderStall.get(f.side) ?? { ms: 0, hops: 0, best: Infinity };
    // A real corridor detours, so dest-distance grows around a corner and only a standstill is a stall.
    // z counts only when it CLOSES on the dest — an absolute delta would credit falls and rubber-banding.
    const zGain = dest.z != null && from.z != null && next.z != null
      ? Math.max(0, Math.abs(dest.z - from.z) - Math.abs(dest.z - next.z))
      : 0;
    const moved = Math.max(detHypot(next.x - from.x, next.y - from.y), zGain);
    if (moved > 0.05) {
      if (left3 < st.best) st.best = left3;
      st.ms = 0;
    } else {
      st.ms += tickMs;
      if (st.ms >= ORDER_REPATH_MS) {
        const e = unitNavPaths.get(f.side);
        if (e && !e.viaMesh && e.pts.length > 1) {
          e.pts.shift();
          e.wp = null;
          e.stuck = 0;
          e.noGain = 0;
          diag(f.side, 'unstickSkipWp');
        } else if (!e || !e.viaMesh) {
          dropStaleCorridor(f.side);
        }
      }
      if (st.ms >= ORDER_NUDGE_MS) {
        const lead = !isEnemySide(f.side) && f.side !== 'player' ? posOf('player') : null;
        const toward = lead && (combatDistanceYd(from, lead) ?? 0) > 6 ? lead : dest;
        if (!nudgeOntoMesh(f)) softUnstuckToward(f, posOf(f.side) ?? next, toward);
        if (toward === lead) {
          dropStaleCorridor(f.side);
          diag(f.side, 'followLead');
        }
        st.ms = 0;
        st.hops += 1;
        // Same spot through repeated failed rescues: recall and drop the order — grinding
        // the queue further is what froze the unit (and the party leash with it).
        if (st.hops >= 3 && (unstuckFails.get(f.side) ?? 0) >= UNSTUCK_FAILS_RECALL
          && recallToLastGood(f)) return true;
      }
      // 4 hops is not arrival. Popping a 40 yd dest here is "walk randomly stopped".
      if (st.hops >= 4 && left3 < 3
        && (dest.z == null || planarRangeHonestYd(posOf(f.side), dest))) {
        popArrived();
        orderStall.delete(f.side);
        return true;
      }
    }
    orderStall.set(f.side, st);
    // The clock above only counts a STANDSTILL, and a wedged walker zigzags: sidestep, body-steer and
    // wall-graze all move it, so `st.ms` reset every tick and the rungs below never ran. This is the
    // net-close watchdog the chase arm already runs (sessionChase.ts:308), off the player's own click.
    if (!isEnemySide(f.side) && f.side !== 'player'
      && watchPartyStuck(f, from, posOf(f.side) ?? next, dest)) return true;
    const at = posOf(f.side);
    const left = combatDistanceYd(at, dest);
    const leftFloorOk = dest.z == null || (at?.z != null && planarRangeHonestYd(at, dest));
    if (left == null || (left <= ARRIVE_YD && leftFloorOk)) popArrived();
    return true;
  };

  return {
    moveOrder: { owner: 'click', update: (f) => advanceMoveOrder(f) },
    advanceHeld: (f) => advanceMoveOrder(f, true),
  };
}
