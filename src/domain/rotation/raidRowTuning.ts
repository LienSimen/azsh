// A distance the player retuned on a shipped raid row. Own module because build.ts writes it
// and the hot evaluate.ts applies it, and the evaluator must not import the rotation builder.

import type { RotationRule, RuleMove } from './types.ts';

/** Extra yards a run-out clears past the payload radius. Cite: probe-vael-floor.mjs. */
export const FLEE_CLEAR_MARGIN_YD = 5;

/** Per-verb, because each keeps its yards under a different field name. */
export function raidRuleWithYd(rule: RotationRule, yd: number): RotationRule {
  if (rule.action.kind !== 'move' || !(yd > 0)) return rule;
  const m = rule.action.move;
  const next: RuleMove | null = m.kind === 'flee_raid'
    ? { ...m, yd }
    : m.kind === 'spread'
      ? { ...m, minYd: yd }
      : m.kind === 'keep_range'
        ? { ...m, minYd: yd }
        : m.kind === 'split_by_aura'
          ? { ...m, awayYd: yd }
          : null;
  if (!next) return rule;
  return { ...rule, action: { kind: 'move', move: next } };
}

/** True when this row has a distance the Raid tab may offer to retune. */
export function raidRuleYdOf(rule: RotationRule): number | null {
  if (rule.action.kind !== 'move') return null;
  const m = rule.action.move;
  if (m.kind === 'flee_raid') return m.yd;
  if (m.kind === 'spread' || m.kind === 'keep_range') return m.minYd;
  if (m.kind === 'split_by_aura') return m.awayYd;
  return null;
}
