// After-cast retreat, peeled from sessionMotion. Same body, gates and hop ladder as the inlines it
// replaced. Extracted modules must not import combat.ts.

import { isEnemySide } from '../core/events.ts';
import {
  moveStepYd, combatDistanceYd, type CombatPosYd,
} from './combatGeometry.ts';
import { alongDir, pickStepBackDir, planStepBackHop } from './stepBackMotion.ts';
import { clearStepBack, isStepBackWalking, STEP_BACK_HOLD_MS } from './ruleAfter.ts';
import { NOVA_KITE_NEAR_YD } from '../../domain/rotation/classify.ts';
import type { MotionOwner } from './motionClaim.ts';
import type { MotionGenerator } from './motionGenerator.ts';
import type { CombatContext } from './context.ts';
import type { Fighter } from './types.ts';

/** Retreat headings all blocked for this long ⇒ the corner owns it. Drop it and fight. */
const STEP_BACK_BLOCKED_MS = 400;

/** Closures the after-cast retreat needs from installSessionMotion. */
export interface StepBackDeps {
  ctx: CombatContext;
  tickMs: number;
  posOf: (side: string) => CombatPosYd | undefined;
  setPos: (side: string, p: CombatPosYd) => void;
  dead: (f: Fighter) => boolean;
  foeOf: (f: Fighter) => Fighter | null;
  takeMotion: (side: string, owner: MotionOwner, goal: CombatPosYd | null) => CombatPosYd | null;
  dropStaleCorridor: (side: string) => void;
  runSpeedYdPerSec: (f: Fighter) => number;
  /** GetFirstCollisionPosition along from→dest. No A*. */
  clampDest: (from: CombatPosYd, dest: CombatPosYd) => CombatPosYd;
  /** Where each unit stood before its last step — the retreat measures gain against it. */
  lastMoveFrom: Map<string, CombatPosYd>;
}

// Authored after-cast retreat as its own generator. It sits above engage and the leftover walk-in
// because the yards it owes are the point: a unit that casts and walks back into the Nova has not.
export function createStepBackArm(deps: StepBackDeps): { stepBack: MotionGenerator } {
  const {
    ctx, tickMs, posOf, setPos, dead, foeOf, takeMotion, dropStaleCorridor,
    runSpeedYdPerSec, clampDest, lastMoveFrom,
  } = deps;

  // Straight-line floor clamp, never navStepToward (body-separation re-aim fails the gain test)
  // and never stepWalkableNavMesh's axis-slide (that is the wall-smash).
  const retreatHop = (from: CombatPosYd, aim: CombatPosYd): CombatPosYd => clampDest(from, aim);

  const lockDir = (
    f: Fighter, from: CombatPosYd, to: CombatPosYd, remain: number,
  ): { x: number; y: number } | null => {
    const dir = pickStepBackDir(
      from, to, lastMoveFrom.get(f.side) ?? null, remain, (aim) => clampDest(from, aim),
    );
    if (!dir) return null;
    f.stepBackDirX = dir.x;
    f.stepBackDirY = dir.y;
    return dir;
  };

  const tryStepBack = (f: Fighter): boolean => {
    if (isEnemySide(f.side) || f.castingSpell) return false;
    // A live player dest outranks after-cast retreat — do not steal the click.
    if ((ctx as { unitHoldCourse?: Set<string> }).unitHoldCourse?.has(f.side)) return false;
    const need = f.pendingStepBackYd ?? 0;
    // The hold is a stand-off distance (`holdExtra` below), not a motion lock — claiming
    // motion for it would delete the player's own click-to-move for 2 s after every Nova.
    if (!isStepBackWalking(f, ctx.t)) return false;
    const from = posOf(f.side);
    if (!from) {
      clearStepBack(f);
      return false;
    }
    // Walk off the nearest body (the one in the Nova disc), not the 30 yd frostbolt focus.
    let tgt = foeOf(f);
    let bestD = Infinity;
    for (const h of ctx.livingHostilesFor(f)) {
      if (dead(h) || h === f) continue;
      const d = combatDistanceYd(from, posOf(h.side));
      if (d != null && d < bestD) {
        bestD = d;
        tgt = h;
      }
    }
    // Empty / at-range Nova still armed a kite; walking away from a 25 yd bolt target
    // parked the caster out of Frostbolt and silenced them for the retreat window.
    if (!tgt || tgt === f || dead(tgt) || !(bestD <= NOVA_KITE_NEAR_YD)) {
      clearStepBack(f);
      return false;
    }
    const to = posOf(tgt.side);
    if (!to) {
      clearStepBack(f);
      return false;
    }
    (ctx as { unitMoveOrders?: Map<string, CombatPosYd[]> }).unitMoveOrders?.delete(f.side);
    dropStaleCorridor(f.side);
    const walked = f.stepBackWalkedYd ?? 0;
    const remain = need - walked;
    if (f.stepBackDirX == null || f.stepBackDirY == null) {
      if (!lockDir(f, from, to, remain)) {
        clearStepBack(f);
        return false;
      }
      f.stepBackWalkedYd = 0;
    }
    let dir = { x: f.stepBackDirX!, y: f.stepBackDirY! };
    const hop = moveStepYd(runSpeedYdPerSec(f), tickMs);
    let next = hop > 0
      ? planStepBackHop(from, to, dir, hop, (aim) => retreatHop(from, aim))
      : null;
    if (!next && hop > 0) {
      const again = pickStepBackDir(
        from, to, lastMoveFrom.get(f.side) ?? null, remain, (aim) => clampDest(from, aim),
      );
      if (again && (again.x !== dir.x || again.y !== dir.y)) {
        f.stepBackDirX = again.x;
        f.stepBackDirY = again.y;
        dir = again;
        next = planStepBackHop(from, to, dir, hop, (aim) => retreatHop(from, aim));
      }
    }
    if (!next) {
      // Cornered, or snared to a standstill. The retreat gates motion AND every hostile spell, so
      // sitting on it for the full deadline silences the unit — give nav a window, then let it fight.
      const blocked = (f.stepBackBlockedMs ?? 0) + tickMs;
      f.stepBackBlockedMs = blocked;
      if (blocked < STEP_BACK_BLOCKED_MS) return true;
      f.pendingStepBackYd = undefined;
      f.stepBackDeadline = undefined;
      f.stepBackBlockedMs = undefined;
      return false;
    }
    f.stepBackBlockedMs = undefined;
    if (takeMotion(f.side, 'stepback', next) == null) return true;
    const gained = alongDir(from, next, dir);
    setPos(f.side, next);
    const walkedNow = walked + gained;
    f.stepBackWalkedYd = walkedNow;
    // Completion is checked AFTER the hop: above the walk, `isStepBackWalking` had already proved
    // walked < need, so the hold could never arm and the unit closed back into the pile.
    if (walkedNow >= need) {
      f.pendingStepBackYd = undefined;
      f.stepBackDeadline = undefined;
      f.stepBackHoldYd = combatDistanceYd(next, to) ?? need;
      f.stepBackHoldUntil = ctx.t + STEP_BACK_HOLD_MS;
    }
    return true;
  };

  return { stepBack: { owner: 'stepback', update: (f) => tryStepBack(f) } };
}
