// CombatAction helpers — dest-bearing ground casts vs item uses.

import type { CombatPosYd } from './combatGeometry.ts';
import type { CombatantId } from './threat.ts';
import type { CombatAction } from './types.ts';

export function isItemCombatAction(
  a: CombatAction | undefined,
): a is { item: number; target?: CombatantId } {
  return typeof a === 'object' && a !== null && 'item' in a;
}

export function isSpellDestAction(
  a: CombatAction,
): a is { spell: number; dest?: CombatPosYd } {
  return typeof a === 'object' && a !== null && 'spell' in a;
}

export function combatActionSpellId(a: CombatAction | undefined | null): number | null {
  if (a == null) return null;
  if (typeof a === 'number') return a;
  if (isSpellDestAction(a)) return a.spell;
  return null;
}

export function combatActionDest(a: CombatAction | undefined | null): CombatPosYd | undefined {
  if (!a || typeof a !== 'object' || !('dest' in a)) return undefined;
  const d = (a as { dest?: CombatPosYd }).dest;
  if (!d || !Number.isFinite(d.x) || !Number.isFinite(d.y)) return undefined;
  return d;
}

/** Rotation `target: 'other'` — sheep the second mob, never the kill target. */
export function combatActionOffTarget(a: CombatAction | undefined | null): boolean {
  return typeof a === 'object' && a !== null && 'offTarget' in a && a.offTarget === true;
}
