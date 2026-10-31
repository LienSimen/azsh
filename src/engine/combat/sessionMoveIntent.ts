// Held-direction locomotion — peeled from sessionMotion (E4.2 arm 5, ENGINE-REBUILD.md). Pure move: same
// body, same claim, same aim distance as `advanceMoveIntent`. Extracted modules must not import combat.ts.

import { moveStepYd, type CombatPosYd } from './combatGeometry.ts';
import type { MotionOwner } from './motionClaim.ts';
import type { MotionGenerator } from './motionGenerator.ts';
import type { CombatContext } from './context.ts';
import type { Fighter } from './types.ts';

/** Closures the held-key arm needs from installSessionMotion. */
export interface MoveIntentDeps {
  ctx: CombatContext;
  tickMs: number;
  posOf: (side: string) => CombatPosYd | undefined;
  setPos: (side: string, p: CombatPosYd) => void;
  takeMotion: (side: string, owner: MotionOwner, goal: CombatPosYd | null) => CombatPosYd | null;
  navStepToward: (
    side: string, from: CombatPosYd, to: CombatPosYd,
    step: number, stopAtDist: number, searchCorridor?: boolean,
  ) => CombatPosYd;
  runSpeedYdPerSec: (f: Fighter) => number;
}

// Held-direction locomotion (WASD / virtual stick), the same step every other mover takes and behind the
// same root gate. Aim a full second ahead: navStepToward stops AT the goal, so one step out shaved away.
const INTENT_AIM_SEC = 1;

export function createMoveIntentArm(deps: MoveIntentDeps): { moveIntent: MotionGenerator } {
  const { ctx, tickMs, posOf, setPos, takeMotion, navStepToward, runSpeedYdPerSec } = deps;

  const advanceMoveIntent = (f: Fighter): boolean => {
    const intents = (ctx as { unitMoveIntents?: Map<string, CombatPosYd> }).unitMoveIntents;
    const dir = intents?.get(f.side);
    if (!dir) return false;
    const from = posOf(f.side);
    if (!from) return false;
    const speed = runSpeedYdPerSec(f);
    if (!(speed > 0)) return true; // snared to a standstill — the intent is still held
    const reach = Math.max(speed * INTENT_AIM_SEC, moveStepYd(speed, tickMs));
    const aim: CombatPosYd = { x: from.x + dir.x * reach, y: from.y + dir.y * reach };
    // A held key is intent: it re-aims every tick with no dead band, and only fear or a knockback
    // outranks it. The aim is the claim goal — a null goal made grant and refusal the same answer.
    if (takeMotion(f.side, 'key', aim) == null) return true;
    setPos(f.side, navStepToward(f.side, from, aim, moveStepYd(speed, tickMs), 0, true));
    return true;
  };

  return { moveIntent: { owner: 'key', update: (f) => advanceMoveIntent(f) } };
}
