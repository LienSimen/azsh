// Hold-ground return — peeled from sessionChase (E4.2 arm 2, ENGINE-REBUILD.md). Pure move: same body, same
// gate, same order as the block at the top of `advanceChase`. Extracted modules must not import combat.ts.

import { isEnemySide } from '../core/events.ts';
import { moveStepYd, combatDistanceYd, type CombatPosYd } from './combatGeometry.ts';
import type { MotionOwner } from './motionClaim.ts';
import type { MotionGenerator } from './motionGenerator.ts';
import type { MotionGateName, MotionGateInfo } from './motionGate.ts';
import type { CombatContext } from './context.ts';
import type { Fighter } from './types.ts';

// The bubble a friendly may fight inside, or null. The anchor is wherever the unit first stood under
// the setting, minted here so the walk-home arm and the gap-close clamp read ONE answer.
export function holdAnchorOf(
  ctx: CombatContext,
  side: string,
  posOf: (side: string) => CombatPosYd | undefined,
): { holdYd: number; anchor: CombatPosYd } | null {
  const holdYd = ctx.cfg.friendlyHoldYd;
  if (holdYd == null || isEnemySide(side)) return null;
  const anchors = (ctx as { unitAnchors?: Map<string, CombatPosYd> }).unitAnchors;
  let anchor = anchors?.get(side);
  if (!anchor) {
    const at = posOf(side);
    if (!at) return null;
    anchor = { x: at.x, y: at.y };
    anchors?.set(side, anchor);
  }
  return { holdYd, anchor };
}

/** Closures the hold-ground arm needs from installSessionMotion. */
export interface HomeDeps {
  ctx: CombatContext;
  tickMs: number;
  posOf: (side: string) => CombatPosYd | undefined;
  setPos: (side: string, p: CombatPosYd) => void;
  gate: (side: string, name: MotionGateName, info?: MotionGateInfo) => void;
  takeMotion: (side: string, owner: MotionOwner, goal: CombatPosYd | null) => CombatPosYd | null;
  navStepToward: (
    side: string, from: CombatPosYd, to: CombatPosYd,
    step: number, stopAtDist: number, searchCorridor?: boolean,
  ) => CombatPosYd;
  watchPartyStuck: (f: Fighter, from: CombatPosYd, to: CombatPosYd, aim: CombatPosYd) => void;
  runSpeedYdPerSec: (f: Fighter) => number;
}

// Outside its bubble a friendly walks HOME, never toward a foe. This is the fix for "my warrior charged
// across the map", and it sits above gap-close because such a unit has no business picking a target.
export function createHomeArm(deps: HomeDeps): { home: MotionGenerator } {
  const {
    ctx, tickMs, posOf, setPos, gate, takeMotion, navStepToward, watchPartyStuck,
    runSpeedYdPerSec,
  } = deps;

  const advanceHome = (f: Fighter): boolean => {
    const hold = holdAnchorOf(ctx, f.side, posOf);
    if (!hold) return false;
    const at = posOf(f.side);
    if (!at) return false;
    const dHome = combatDistanceYd(at, hold.anchor);
    if (dHome == null || dHome <= hold.holdYd) return false;
    const speed = runSpeedYdPerSec(f);
    // Friendly return home — corridor pathfind, not clamp.
    if (speed > 0 && takeMotion(f.side, 'home', hold.anchor) != null) {
      const next = navStepToward(f.side, at, hold.anchor, moveStepYd(speed, tickMs), 0, true);
      setPos(f.side, next);
      watchPartyStuck(f, at, posOf(f.side) ?? next, hold.anchor);
    }
    gate(f.side, 'holdGround', { dist: dHome });
    return true;
  };

  return { home: { owner: 'home', update: (f) => advanceHome(f) } };
}
