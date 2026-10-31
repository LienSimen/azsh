// Spell reagent CheckItems / TakeReagents for combat casts. Cite: Spell.cpp CheckItems ~6560-6593;
// TakeReagents ~4332-4350. The OOC path is game.ts castOutOfCombat and must gate the same way.

import type { SpellDef } from '../../data/schema.ts';
import { isAllySide, type Side } from '../core/events.ts';
import type { Fighter } from './types.ts';

/** Seed live bag counts for every reagent listed on a kit (entry → count). */
export function seedReagentBagCounts(
  spells: readonly SpellDef[] | undefined,
  countOf: (item: number) => number,
): Record<number, number> | undefined {
  if (!spells?.length) return undefined;
  const bag: Record<number, number> = {};
  let any = false;
  for (const sp of spells) {
    for (const r of sp.reagents ?? []) {
      const item = r.item | 0;
      if (!item || bag[item] !== undefined) continue;
      bag[item] = countOf(item) | 0;
      any = true;
    }
  }
  return any ? bag : undefined;
}

// CheckItems: every reagent row needs count >= need in the live bag snapshot. Creatures and fixtures
// with no bag counts pass, since they never carry reagents; a seeded player without enough fails.
export function canPaySpellReagents(f: Fighter, spell: SpellDef): boolean {
  const reagents = spell.reagents;
  if (!reagents?.length) return true;
  const bag = f.spec.bagItemCounts;
  // No snapshot: NPCs and bare createSession fixtures allow. Real pulls seed bagItemCounts
  // from inventory for any kit that lists reagents (combatSession / companion build).
  if (!bag) return true;
  for (const r of reagents) {
    const need = r.count | 0;
    if (need <= 0) continue;
    if ((bag[r.item] ?? 0) < need) return false;
  }
  return true;
}

// Spell.cpp TakeReagents — decrement live bag + record itemsSpent for resolveFight. Returns false if
// CheckItems would fail (caller should fizzle, no mana spend if pre-check).
export function takeSpellReagents(
  f: Fighter,
  spell: SpellDef,
  itemsSpent: Map<number, number>,
  opts?: {
    unitItemsSpent?: ReadonlyMap<Side, Map<number, number>>;
  },
): boolean {
  const reagents = spell.reagents;
  if (!reagents?.length) return true;
  if (!canPaySpellReagents(f, spell)) return false;
  const bag = f.spec.bagItemCounts;
  if (!bag) return true;
  for (const r of reagents) {
    const n = r.count | 0;
    if (n <= 0) continue;
    bag[r.item] = Math.max(0, (bag[r.item] ?? 0) - n);
    if (f.side === 'player') {
      itemsSpent.set(r.item, (itemsSpent.get(r.item) ?? 0) + n);
    } else if (opts?.unitItemsSpent && isAllySide(f.side as Side)) {
      const m = opts.unitItemsSpent.get(f.side);
      if (m) m.set(r.item, (m.get(r.item) ?? 0) + n);
    }
  }
  return true;
}
