// The "then cast" CHAIN a rule's after-clause owns. One reading of the order, shared by the editor,
// the evaluator and the engine, so a stored `spellId` and an authored `steps` list cannot disagree.

import { sanitizeStepBackYd } from './stand.ts';
import type { Condition, RuleAfter, RuleAfterStep } from './types.ts';

/** Steps one chain may hold, so a hand-edited save cannot hand the engine an endless queue. */
export const RULE_AFTER_STEPS_MAX = 8;
/** Conditions one step may carry, same reason. Matches what the rule row itself stays readable at. */
export const RULE_AFTER_STEP_CONDS_MAX = 8;

const isCondition = (c: unknown): c is Condition =>
  typeof c === 'object' && c != null && typeof (c as { metric?: unknown }).metric === 'string';

/** Every authored step in cast order, unset ones included: the shape the EDITOR reads and writes. */
export function ruleAfterSteps(after: RuleAfter | null | undefined): readonly RuleAfterStep[] {
  if (!after) return [];
  const legacy = typeof after.spellId === 'number' && after.spellId > 0
    ? [{ spellId: after.spellId | 0 }]
    : [];
  const steps = Array.isArray(after.steps) ? after.steps : [];
  return [...legacy, ...steps].slice(0, RULE_AFTER_STEPS_MAX);
}

/** The steps the ENGINE runs: same order, minus the ones still waiting for a spell to be picked. */
export function ruleAfterChain(after: RuleAfter | null | undefined): readonly RuleAfterStep[] {
  const out: RuleAfterStep[] = [];
  for (const s of ruleAfterSteps(after)) {
    if (!s || typeof s.spellId !== 'number' || !(s.spellId > 0)) continue;
    const conds = Array.isArray(s.conditions)
      ? s.conditions.filter(isCondition).slice(0, RULE_AFTER_STEP_CONDS_MAX)
      : [];
    out.push({ spellId: s.spellId | 0, ...(conds.length ? { conditions: conds } : {}) });
  }
  return out;
}

// Normalize to the one stored shape: a step-back plus a runnable chain. The legacy single `spellId`
// folds into step 1 and is dropped, so nothing downstream reads the same follow-up twice.
export function sanitizeRuleAfter(raw: RuleAfter | null | undefined): RuleAfter | undefined {
  if (!raw) return undefined;
  const stepBackYd = sanitizeStepBackYd(raw.stepBackYd);
  const steps = [...ruleAfterChain(raw)];
  if (!stepBackYd && !steps.length) return undefined;
  return {
    ...(stepBackYd ? { stepBackYd } : {}),
    ...(steps.length ? { steps } : {}),
  };
}
