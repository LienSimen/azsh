// Combat consume of `{ kind: 'dispel_mechanic' }`. Cite: SpellEffects.cpp:2499–2519 EffectDispelMechanic;
// ProcessDispelList :2521–2575.

import type { SpellDef } from '../../data/schema.ts';
import { processDispelList, type DispelRng } from '../../domain/spells/dispel.ts';
import { collectMechanicHolders } from '../../domain/spells/dispelMechanic.ts';
import type { ActiveEffect, Fighter } from './types.ts';

export function applyDispelMechanicOnUnit(
  unit: Fighter,
  mechanic: number,
  count: number,
  live: readonly ActiveEffect[],
  lookup: (spellId: number) => SpellDef | undefined,
  rng: DispelRng,
  strip: (spellId: number, n: number) => void,
): number {
  const onUnit = live.filter((e) => e.target === unit.side);
  const candidates = collectMechanicHolders(onUnit, mechanic, lookup);
  if (!candidates.length) return 0;
  const { success } = processDispelList(candidates, count, rng);
  const removed = new Map<number, number>();
  for (const row of success) removed.set(row.spellId, (removed.get(row.spellId) ?? 0) + 1);
  let stripped = 0;
  for (const [spellId, n] of removed) {
    strip(spellId, n);
    stripped += n;
  }
  return stripped;
}
