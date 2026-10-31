// ONE motion decision per unit at a time. The chain already runs one arm a tick; what this book fixes
// is re-deciding from scratch, per-arm latches nobody else could see, and 19 producers with no priority.

import type { CombatPosYd } from './combatGeometry.ts';
import { detHypot } from '../core/detMath.ts';

// Who is moving the unit. The priority table below mirrors the `advanceGapClose` chain, so arbitration
// cannot silently re-order what the chain already decides inside one tick.
export type MotionOwner =
  /** Knockback / leap / charge arrival / teleport — a displacement, not a decision. */
  | 'forced'
  /** Fear, DoFlee, NO_MELEE_FLEE. Cite: FleeingMovementGenerator. */
  | 'flee'
  /** Scripted mechanic move (a rotation `move` row). */
  | 'mechanic'
  /** Held direction — WASD / virtual stick. */
  | 'key'
  /** Explicit player dest that must survive a pre-cast: the `holdCourse` click. */
  | 'course'
  /** Authored after-cast retreat (`after.stepBackYd`). */
  | 'stepback'
  /** Explicit player dest — floor click, RTS order, summon reposition. */
  | 'click'
  /** Policy dest — autopilot route step, loot approach, formation, camera recentre. */
  | 'route'
  /** Pet bar Stay / Follow. */
  | 'pet'
  /** Guardian / spirit MoveFollow. */
  | 'follow'
  /** Hold-ground return to anchor (`cfg.friendlyHoldYd`). */
  | 'home'
  /** Melee flank slot / cone rotation slide. */
  | 'flank'
  /** AI gap-close and the ranged stand band. */
  | 'chase';

/** Higher wins. Same order as the chain in `advanceGapClose`. */
export const MOTION_PRIO: Record<MotionOwner, number> = {
  forced: 110,
  flee: 100,
  mechanic: 90,
  key: 80,
  course: 75,
  stepback: 70,
  click: 60,
  route: 55,
  pet: 50,
  follow: 45,
  home: 40,
  flank: 30,
  chase: 20,
};

// How long a live claim may not be taken by an owner at or BELOW its priority. Zero for anything a
// person does or a script forces; non-zero only where the flip was actually measured.
export const MOTION_HOLD_MS: Record<MotionOwner, number> = {
  forced: 0,
  flee: 0,
  mechanic: 0,
  key: 0,
  course: 0,
  stepback: 0,
  click: 0,
  // A policy walk owns the unit until it arrives, capped so a wedged one cannot hold it for the fight.
  // Two seconds measured best: 246 yd walked and 99 reversals became 87 and 12.
  route: 2_000,
  pet: 0,
  follow: 0,
  home: 0,
  flank: 800,
  // Chase is the floor of the order, so a hold here could only ever block chase itself.
  chase: 0,
};

// After an owner releases, how long before that SAME owner may claim again — the settle latch
// generalised. Without it a slide that just finished re-solves against the boundary and walks back in.
export const MOTION_SETTLE_MS: Record<MotionOwner, number> = {
  forced: 0,
  flee: 0,
  mechanic: 0,
  key: 0,
  course: 0,
  stepback: 0,
  click: 0,
  route: 0,
  pet: 0,
  follow: 0,
  home: 0,
  flank: 1_500,
  chase: 0,
};

// Yards the goal must move before the SAME owner may re-aim. A mob that walked half a yard is not a new
// destination. Zero for a person: every click is a new goal, however small.
export const MOTION_REAIM_YD: Record<MotionOwner, number> = {
  forced: 0,
  flee: 0,
  mechanic: 0,
  key: 0,
  course: 0,
  stepback: 0,
  click: 0,
  route: 2.5,
  pet: 0,
  follow: 0,
  home: 0,
  flank: 1,
  // Zero on purpose. A chase goal is a moving body, and the corridor churn a band would stop is already
  // stopped by the path regrid. With a 2 yd band the aim lagged and catch-up cost 200 yd for 37 net.
  chase: 0,
};

export type MotionClaim = {
  owner: MotionOwner;
  /** Goal in combat yards. `key` passes its per-tick aim — a null goal reads as a refusal
   *  through `takeMotion`, which is exactly how WASD shipped dead (sessionMoveIntent.ts:54). */
  goal: CombatPosYd | null;
  since: number;
  /** No owner at or below this priority may take the claim before this. */
  holdUntil: number;
  /** Last tick this owner moved the unit — a claim nobody refreshes is stale, not eternal. */
  touched: number;
};

// A claim nobody refreshed for this many ticks is dead. Motion runs every tick for every living unit,
// so staleness IS the release for every arm whose settle window is zero.
const CLAIM_STALE_TICKS = 3;

export type MotionClaimOpts = {
  /** Skip the dead band and the settle window (a person acted). */
  force?: boolean;
  /** Override the owner's hold window — the authored step-back walks its own deadline. */
  holdMs?: number;
};

export type MotionClaims = {
  // Take motion for `owner` toward `goal`, or return false and move nothing this tick. A refusal is final
  // for the tick: the caller returns, it never falls through to a lower arm.
  take: (
    side: string,
    owner: MotionOwner,
    goal: CombatPosYd | null,
    now: number,
    opts?: MotionClaimOpts,
  ) => boolean;
  /** Owner of this unit's live motion, or null. */
  ownerOf: (side: string, now: number) => MotionOwner | null;
  /** Goal the live claim is walking, or null. */
  goalOf: (side: string, now: number) => CombatPosYd | null;
  /** Arrived / cancelled: drop the claim and start this owner's settle window. */
  release: (side: string, owner: MotionOwner, now: number) => void;
  /** A displacement landed (knockback, leap, teleport): nothing anyone was walking survives. */
  breakAll: (side: string) => void;
  /** Priority / settle denials since session start — proves the gate is not inert. */
  refused: () => number;
  /** Same-owner re-aims kept inside the dead band: the goal churn that no longer happens. */
  reaimsKept: () => number;
  /** Grants where the owner changed. High means the arms are still trading the unit. */
  handovers: () => number;
};

export function createMotionClaims(tickMs: number): MotionClaims {
  const staleMs = Math.max(1, tickMs) * CLAIM_STALE_TICKS;
  const live = new Map<string, MotionClaim>();
  /** side -> owner -> earliest tick that owner may claim again. */
  const settle = new Map<string, Map<MotionOwner, number>>();
  // Per side and owner, the last goal that owner walked, kept AFTER the claim ends. The dead band has to
  // outlive arrival or a wobbling dest re-claims as brand new — 220 yd walked for 40 net.
  const lastGoal = new Map<string, Map<MotionOwner, CombatPosYd>>();
  let refused = 0;
  let reaimsKept = 0;
  let handovers = 0;

  const fresh = (cur: MotionClaim | undefined, now: number, side: string): MotionClaim | null => {
    if (!cur) return null;
    // The owner stopped moving without releasing (a cast started, its arm went ineligible).
    // Without this a one-tick claim would hold the unit for the rest of the fight.
    if (now - cur.touched > staleMs) {
      live.delete(side);
      return null;
    }
    return cur;
  };

  return {
    take: (side, owner, goal, now, opts) => {
      const held = fresh(live.get(side), now, side);
      const prio = MOTION_PRIO[owner];
      if (held && held.owner !== owner) {
        // Below the holder always waits. At or above it waits only out the hold window.
        if (prio < MOTION_PRIO[held.owner] || now < held.holdUntil) {
          refused += 1;
          return false;
        }
      } else if (held) {
        // Same owner re-aiming. A goal inside the dead band IS the live goal: keep the claim and
        // its corridor instead of issuing a new one every tick.
        const band = opts?.force === true ? 0 : MOTION_REAIM_YD[owner];
        if (band > 0 && held.goal && goal
          && detHypot(goal.x - held.goal.x, goal.y - held.goal.y) <= band) {
          // Not a denial: the owner keeps the unit and keeps walking the goal it already has.
          held.touched = now;
          reaimsKept += 1;
          return false;
        }
        // A NEW goal from the same owner inside its own hold window is a re-plan, and a re-plan is not
        // an intention. This is the arm that stops a policy producer redrawing the walk every few ticks.
        if (opts?.force !== true && now < held.holdUntil) {
          held.touched = now;
          refused += 1;
          return false;
        }
      } else if (opts?.force !== true) {
        if ((settle.get(side)?.get(owner) ?? 0) > now) {
          refused += 1;
          return false;
        }
        const band = MOTION_REAIM_YD[owner];
        const prevGoal = band > 0 ? lastGoal.get(side)?.get(owner) : undefined;
        if (prevGoal && goal
          && detHypot(goal.x - prevGoal.x, goal.y - prevGoal.y) <= band) {
          reaimsKept += 1;
          return false;
        }
      }
      if (!held || held.owner !== owner) handovers += 1;
      if (goal) {
        let byOwner = lastGoal.get(side);
        if (!byOwner) {
          byOwner = new Map();
          lastGoal.set(side, byOwner);
        }
        byOwner.set(owner, { x: goal.x, y: goal.y });
      }
      live.set(side, {
        owner,
        goal: goal ? { ...goal } : null,
        since: held && held.owner === owner ? held.since : now,
        holdUntil: now + (opts?.holdMs ?? MOTION_HOLD_MS[owner]),
        touched: now,
      });
      return true;
    },
    ownerOf: (side, now) => fresh(live.get(side), now, side)?.owner ?? null,
    goalOf: (side, now) => fresh(live.get(side), now, side)?.goal ?? null,
    release: (side, owner, now) => {
      const cur = live.get(side);
      if (cur && cur.owner !== owner) return;
      live.delete(side);
      const ms = MOTION_SETTLE_MS[owner];
      if (ms <= 0) return;
      let byOwner = settle.get(side);
      if (!byOwner) {
        byOwner = new Map();
        settle.set(side, byOwner);
      }
      byOwner.set(owner, now + ms);
    },
    breakAll: (side) => {
      live.delete(side);
      settle.delete(side);
      lastGoal.delete(side);
    },
    refused: () => refused,
    reaimsKept: () => reaimsKept,
    handovers: () => handovers,
  };
}
