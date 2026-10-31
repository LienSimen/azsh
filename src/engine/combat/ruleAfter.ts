// Apply a rotation rule's after-cast — a step back or a follow-up spell — onto the fighter. The
// evaluator returns it on the action and the pickers stamp it here.

import type { RuleAfter, RuleAfterStep } from '../../domain/rotation/types.ts';
import { ruleAfterChain, sanitizeRuleAfter } from '../../domain/rotation/ruleAfterChain.ts';
import type { Fighter } from './types.ts';

export { sanitizeRuleAfter };

const FOLLOW_UP_HOLD_MS = 3000;
const STEP_BACK_HOLD_MS = 2000;
/** Retreat give-up window. 10 yd at classic run speed is ~1.4 s; past this the nav is stuck. */
const STEP_BACK_MAX_MS = 2500;

export function armRuleAfter(f: Fighter, spellId: number, after: RuleAfter | null | undefined): void {
  const clean = sanitizeRuleAfter(after);
  if (!clean || !(spellId > 0)) {
    f.armedRuleAfter = undefined;
    return;
  }
  f.armedRuleAfter = { spellId: spellId | 0, after: clean };
}

/** Stamp after-cast only if `spellId` is the armed pick (a failed start must not walk). */
export function commitRuleAfter(f: Fighter, spellId: number, now: number): boolean {
  const armed = f.armedRuleAfter;
  f.armedRuleAfter = undefined;
  if (!armed || armed.spellId !== spellId) return false;
  applyRuleAfter(f, armed.after, now);
  return true;
}

export function applyRuleAfter(f: Fighter, after: RuleAfter | null | undefined, now: number): void {
  const clean = sanitizeRuleAfter(after);
  if (!clean) return;
  if (clean.stepBackYd) {
    f.pendingStepBackYd = clean.stepBackYd;
    f.stepBackWalkedYd = 0;
    f.stepBackDirX = undefined;
    f.stepBackDirY = undefined;
    f.stepBackHoldYd = undefined;
    f.stepBackHoldUntil = undefined;
    f.stepBackBlockedMs = undefined;
    f.stepBackDeadline = now + STEP_BACK_MAX_MS;
  }
  const chain = ruleAfterChain(clean);
  if (chain.length) {
    f.pendingFollowUp = chain.map((s) => ({ ...s }));
    f.pendingFollowUpUntil = now + FOLLOW_UP_HOLD_MS;
  }
}

/** Drop an owed retreat without touching a completed stand-off hold. */
export function clearStepBack(f: Fighter): void {
  f.pendingStepBackYd = undefined;
  f.stepBackWalkedYd = undefined;
  f.stepBackDirX = undefined;
  f.stepBackDirY = undefined;
  f.stepBackDeadline = undefined;
  f.stepBackBlockedMs = undefined;
}

// True while the unit still owes after-cast yards, so a cast must wait. The deadline expires a retreat
// the nav could not walk, or a blocked unit owed yards forever and was silenced all fight.
export function isStepBackWalking(f: Fighter, now?: number): boolean {
  const need = f.pendingStepBackYd ?? 0;
  if (!(need > 0)) return false;
  if (now != null && (f.stepBackDeadline ?? 0) <= now) {
    clearStepBack(f);
    return false;
  }
  return (f.stepBackWalkedYd ?? 0) < need;
}

export { STEP_BACK_HOLD_MS };

const NO_CHAIN: readonly RuleAfterStep[] = [];

/** The follow-up chain the snapshot should prefer, in cast order. Empty if none / expired. */
export function liveFollowUpChain(f: Fighter, now: number): readonly RuleAfterStep[] {
  const chain = f.pendingFollowUp;
  if (!chain || !chain.length) return NO_CHAIN;
  if ((f.pendingFollowUpUntil ?? 0) <= now && !isStepBackWalking(f)) {
    f.pendingFollowUp = undefined;
    f.pendingFollowUpUntil = undefined;
    return NO_CHAIN;
  }
  return chain;
}

// Advance the chain past the step that just fired. Steps BEFORE it were skipped by their own gate,
// so they go too; the rest get a fresh hold, or a four-step chain would expire mid-walk.
export function consumeFollowUp(f: Fighter, pickedSpellId: number, now?: number): void {
  const chain = f.pendingFollowUp;
  if (!chain || !chain.length) return;
  const at = chain.findIndex((s) => s.spellId === pickedSpellId);
  if (at < 0) return;
  const rest = chain.slice(at + 1);
  if (!rest.length) {
    f.pendingFollowUp = undefined;
    f.pendingFollowUpUntil = undefined;
    return;
  }
  f.pendingFollowUp = rest;
  if (now != null) f.pendingFollowUpUntil = now + FOLLOW_UP_HOLD_MS;
}
