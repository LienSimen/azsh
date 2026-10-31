// PURE: no DOM/RNG/Date. The combo-point spend ladder: flat energy cost and per-point damage make
// five the default rung, and only a dying target earns a lower one. Cite: types.ts timeToDieMs.

import type { SpellDef } from '../../data/schema.ts';
import { cond, isComboPointConsumer } from './classify.ts';
import type { Condition, RotationRule } from './types.ts';

/** Classic base GCD. Same number as formulas.ts:47 `gcdMs`; domain does not import engine. */
const BASE_GCD_MS = 1500;

/** Combo-point cap. Same number as formulas.ts TUNING.comboPointsMax. */
export const COMBO_POINTS_MAX = 5;

// Spend at `cp` once the target is at or under `healthPctAtMost`. The top rung carries no band —
// five is the cap, so there is nothing left to bank.
export const FINISHER_LADDER: readonly { cp: number; healthPctAtMost?: number }[] = [
  { cp: COMBO_POINTS_MAX },
  { cp: 4, healthPctAtMost: 40 },
  { cp: 3, healthPctAtMost: 30 },
  { cp: 1, healthPctAtMost: 20 },
];

// The rung every non-dump finisher spends at. SnD lasts 6000 + 3000*cp ms (dbc_SpellDuration 185),
// so under the cap it re-armed forever and ate every point: measured SnD x5, Eviscerate x0 over 60 s.
export const SND_MIN_COMBO_POINTS = COMBO_POINTS_MAX;

/** Ms of banking a rung skips — what the target has to die inside for the rung to be worth it. */
export function rungBankMs(cp: number): number {
  return Math.max(1, COMBO_POINTS_MAX - cp) * BASE_GCD_MS;
}

// A finisher whose whole payload is the hit: Eviscerate, Ferocious Bite. Rupture, Kidney Shot,
// Expose Armor and Slice and Dice buy something a dying target does not need, so they keep their gate.
export function isDumpFinisher(s: SpellDef): boolean {
  if (!isComboPointConsumer(s)) return false;
  const effects = s.effects ?? [];
  if (!effects.some((e) => e.kind === 'direct_damage')) return false;
  return !effects.some((e) => e.kind === 'dot' || e.kind === 'cc' || e.kind === 'root');
}

// Full duration of a DoT finisher at the combo cap: the spell-level max when the bake carries one
// (Rupture 16000), else the effect's own base. 0 when the finisher has no DoT at all.
function dotFinisherFullDurationMs(s: SpellDef): number {
  const dot = (s.effects ?? []).find((e) => e.kind === 'dot');
  if (!dot) return 0;
  return (s.durationMaxMs ?? 0) || ((dot as { durationMs?: number }).durationMs ?? 0);
}

/** The conditions for one rung, in the order a reader should meet them. */
export function ladderConditions(rung: { cp: number; healthPctAtMost?: number }): Condition[] {
  const out: Condition[] = [cond('self', 'comboPoints', '>=', rung.cp)];
  if (rung.healthPctAtMost == null) return out;
  out.push(cond('target', 'healthPct', '<=', rung.healthPctAtMost));
  out.push(cond('target', 'timeToDieMs', '<', rungBankMs(rung.cp)));
  return out;
}

/** True when `conditions` are one of the ladder's own rungs — the idempotence test. */
function isLadderRow(conditions: readonly Condition[]): boolean {
  return conditions.some((c) => c.metric === 'timeToDieMs')
    || (conditions.length === 1
      && conditions[0]!.metric === 'comboPoints'
      && conditions[0]!.value === COMBO_POINTS_MAX);
}

// Replace each dump-finisher row with the ladder in the slot it held, carrying its other conditions
// onto every rung. Idempotent: a list that already has the ladder comes back unchanged.
export function expandFinisherLadder(
  rules: RotationRule[],
  spellOf: (id: number) => SpellDef | undefined,
  nextId: () => string,
): boolean {
  let changed = false;
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i]!;
    if (r.action.kind !== 'spell') continue;
    const s = spellOf(r.action.spellId);
    if (!s) continue;
    // Every keep-up finisher pays the top rung, not just Slice and Dice: one gated at 4 above rows
    // gated at 5 takes the bank whenever it comes up. Measured Rupture x3, Eviscerate x0 over 40 s.
    if (isComboPointConsumer(s) && !isDumpFinisher(s)) {
      let conditions = r.conditions;
      const cp = conditions.find((c) => c.metric === 'comboPoints' && c.subject === 'self');
      if (cp && cp.op === '>=' && cp.value < SND_MIN_COMBO_POINTS) {
        conditions = conditions.map((c) => (c === cp ? { ...c, value: SND_MIN_COMBO_POINTS } : c));
      }
      // A DoT finisher is worth the bank only if the body lives to take the whole DoT; on a mob that
      // dies first the points belong to the dump. Same metric the rungs below use.
      const full = dotFinisherFullDurationMs(s);
      if (full > 0 && !conditions.some((c) => c.subject === 'target' && c.metric === 'timeToDieMs')) {
        conditions = [...conditions, cond('target', 'timeToDieMs', '>=', full)];
      }
      if (conditions !== r.conditions) {
        rules[i] = { ...r, conditions };
        changed = true;
      }
      continue;
    }
    if (!isDumpFinisher(s)) continue;
    if (isLadderRow(r.conditions)) continue;
    const kept = r.conditions.filter(
      (c) => !(c.metric === 'comboPoints' && c.subject === 'self')
        && !(c.metric === 'healthPct' && c.subject === 'target'),
    );
    const rows: RotationRule[] = FINISHER_LADDER.map((rung, n) => ({
      // The authored row keeps its id so a saved list still resolves it; the rungs under it are new.
      id: n === 0 ? r.id : nextId(),
      action: { ...r.action },
      conditions: [...ladderConditions(rung), ...kept],
      enabled: r.enabled,
    }));
    rules.splice(i, 1, ...rows);
    i += rows.length - 1;
    changed = true;
  }
  return hoistDyingTargetRungs(rules, spellOf) || changed;
}

// The banded rungs say "this body dies before it can pay a keep-up back", so they belong ABOVE the
// keep-ups. Left under them, Slice and Dice took the bank off a mob at 11% and the dump never fired.
function hoistDyingTargetRungs(
  rules: RotationRule[],
  spellOf: (id: number) => SpellDef | undefined,
): boolean {
  const isKeepUp = (r: RotationRule): boolean => {
    if (r.action.kind !== 'spell') return false;
    const s = spellOf(r.action.spellId);
    return !!s && isComboPointConsumer(s) && !isDumpFinisher(s);
  };
  const first = rules.findIndex(isKeepUp);
  if (first < 0) return false;
  const banded: RotationRule[] = [];
  for (let i = rules.length - 1; i > first; i--) {
    const r = rules[i]!;
    if (r.action.kind !== 'spell') continue;
    const s = spellOf(r.action.spellId);
    if (!s || !isDumpFinisher(s)) continue;
    if (!r.conditions.some((c) => c.metric === 'timeToDieMs' && c.op === '<')) continue;
    banded.unshift(r);
    rules.splice(i, 1);
  }
  if (!banded.length) return false;
  rules.splice(first, 0, ...banded);
  return true;
}
