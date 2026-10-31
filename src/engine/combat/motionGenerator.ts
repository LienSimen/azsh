// One motion behaviour as an object that owns its own state, mirroring the C++ generator: "am I stuck",
// "where do I reset to" and "what kind am I" are questions the behaviour answers about itself.

import type { MotionOwner } from './motionClaim.ts';
import type { CombatPosYd } from './combatGeometry.ts';
import type { Fighter } from './types.ts';

export interface MotionGenerator {
  /** GetMovementGeneratorType (MovementGenerator.h:48). MOTION_PRIO orders these. */
  readonly owner: MotionOwner;
  // Update: true when this generator HANDLED the unit this tick, so nothing below it may run — a
  // deliberate stand is handled. False means it declined and the chain falls through.
  update: (f: Fighter, tickMs: number) => boolean;
  /** Initialize (`:37`) — before this generator goes on the unit's stack. */
  initialize?: (f: Fighter) => void;
  /** Finalize (`:39`) — off the stack for good; drop the unit's per-leg state here. */
  finalize?: (f: Fighter) => void;
  /** Interrupt (`:42`) — something took the top; keep state, stop steering. */
  interrupt?: (f: Fighter) => void;
  /** Reset (`:44`) — back on top after the generator above it left. */
  reset?: (f: Fighter) => void;
  // IsReachable: false when this generator's own dest cannot be walked to from here. Today an outside
  // arm decides that off a plan-level test; the phase that makes this the input is still ahead.
  isReachable?: (f: Fighter) => boolean;
  /** GetResetPosition (`:55`) — where an evade sends the unit back to. */
  resetPosition?: (f: Fighter) => CombatPosYd | null;
}
