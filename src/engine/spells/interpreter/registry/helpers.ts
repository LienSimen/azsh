/** Shared helpers for SI4 registry packs. Amount path mirrors amount.ts (bake + CalculateSimpleValue). */

import type { RawSpellEffect } from '../../../../data/schema.ts';
import { effectAmountRange } from '../amount.ts';
import type { InterpretContext } from '../types.ts';

// The effect's minimum amount, base points plus the dice floor — the same value the C++ computes when
// the die is not rolled. Cite: amount.ts; DBCStructure CalculateSimpleValue.
export function effectBaseAmount(raw: RawSpellEffect, ctx?: InterpretContext): number {
  return effectAmountRange(raw, ctx).min;
}

/** Truncate toward zero (C++ int32 cast from float multiply). */
export function truncTowardZero(n: number): number {
  return n < 0 ? Math.ceil(n) : Math.floor(n);
}
