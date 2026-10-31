/** Thaddius Polarity Shift / Charge / ChargeDamage. Cite: boss_thaddius.cpp:363-468. */

import type { Fighter } from './types.ts';
import type { SpellDef } from '../../data/schema.ts';

export const SPELL_POLARITY_SHIFT = 28089;
export const SPELL_POSITIVE_CHARGE = 28059;
export const SPELL_NEGATIVE_CHARGE = 28084;
export const SPELL_POSITIVE_CHARGE_BUFF = 29659;
export const SPELL_NEGATIVE_CHARGE_BUFF = 29660;
export const SPELL_POSITIVE_CHARGE_DAMAGE = 28062;
export const SPELL_NEGATIVE_CHARGE_DAMAGE = 28085;
/** SpellRadius of 28062/28085. Cite: boss_thaddius.cpp:453. */
export const POLARITY_RANGE_YD = 13;

let scriptAt = -1;
let scriptValue = 0;
let stackKey = '';

export function polarityStackDue(t: number, side: string): boolean {
  const k = `${t}:${side}`;
  if (k === stackKey) return false;
  stackKey = k;
  return true;
}

export function isPolarityShift(spellId: number): boolean {
  return (spellId | 0) === SPELL_POLARITY_SHIFT;
}

export function polarityDamageSkipped(spellId: number, tgt: { buffActive: Set<number> }): boolean {
  const id = spellId | 0;
  if (id === SPELL_POSITIVE_CHARGE_DAMAGE && tgt.buffActive.has(SPELL_POSITIVE_CHARGE)) return true;
  if (id === SPELL_NEGATIVE_CHARGE_DAMAGE && tgt.buffActive.has(SPELL_NEGATIVE_CHARGE)) return true;
  return false;
}

/** First target random; second the other; rest random. Cite: cpp:380-395. */
export function pickPolarityCharge(t: number, coin: 0 | 1): number {
  if (t !== scriptAt) {
    scriptAt = t;
    scriptValue = 0;
  }
  if (scriptValue === 0) {
    const c = coin === 0 ? SPELL_POSITIVE_CHARGE : SPELL_NEGATIVE_CHARGE;
    scriptValue = c;
    return c;
  }
  if (scriptValue === SPELL_POSITIVE_CHARGE) {
    scriptValue = 1;
    return SPELL_NEGATIVE_CHARGE;
  }
  if (scriptValue === SPELL_NEGATIVE_CHARGE) {
    scriptValue = 1;
    return SPELL_POSITIVE_CHARGE;
  }
  return coin === 0 ? SPELL_POSITIVE_CHARGE : SPELL_NEGATIVE_CHARGE;
}

export function polarityBuffForCharge(chargeId: number): number {
  return (chargeId | 0) === SPELL_POSITIVE_CHARGE
    ? SPELL_POSITIVE_CHARGE_BUFF
    : SPELL_NEGATIVE_CHARGE_BUFF;
}

export function countSameChargeNear(
  self: Fighter,
  others: readonly Fighter[],
  distanceYd: (a: Fighter, b: Fighter) => number | undefined,
): number {
  const aura = self.buffActive.has(SPELL_POSITIVE_CHARGE)
    ? SPELL_POSITIVE_CHARGE
    : self.buffActive.has(SPELL_NEGATIVE_CHARGE)
      ? SPELL_NEGATIVE_CHARGE
      : 0;
  if (!aura) return 0;
  let n = 0;
  for (const o of others) {
    if (o === self || !(o.hp > 0)) continue;
    if (!o.buffActive.has(aura)) continue;
    const d = distanceYd(self, o);
    if (d != null && d <= POLARITY_RANGE_YD) n += 1;
  }
  return n;
}

export function polarityStackSpell(base: SpellDef, stacks: number): SpellDef {
  const amt = Math.max(0, stacks | 0);
  return {
    ...base,
    effects: base.effects.map((e) => (
      e.kind === 'buff' && e.mod === 'damage_done_pct'
        ? { ...e, amount: (e.amount ?? 10) * amt }
        : e
    )),
  };
}
