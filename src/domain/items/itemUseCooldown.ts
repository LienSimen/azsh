// One reader for an item's ON_USE cooldown, so the world and combat paths cannot disagree. Only
// 496 of the 1,122 rows with a real cooldown carry it inside useInCombat; the rest are top-level.

import type { ItemDef } from '../../data/schema.ts';

export interface ItemUseCooldown {
  /** Personal recovery, ms. 0 = none in item_template (the spell's own may still apply). */
  cooldownMs: number;
  /** Shared category id — potions 4, bombs 24. 0 = none. */
  category: number;
  /** Shared category recovery, ms. 0 = none. */
  categoryCooldownMs: number;
}

const pos = (...vals: (number | undefined)[]): number => {
  for (const v of vals) if (v != null && v > 0) return v;
  return 0;
};

// Sub-block first (it is the classifier's own, possibly richer, view), then the carrier. Never returns a
// negative: classic stores "no category CD" as −1.
export function itemUseCooldown(it: ItemDef | null | undefined): ItemUseCooldown {
  if (!it) return { cooldownMs: 0, category: 0, categoryCooldownMs: 0 };
  return {
    cooldownMs: pos(it.useBuff?.cooldownMs, it.useInCombat?.cooldownMs, it.useCooldownMs),
    category: pos(it.useInCombat?.category, it.useCategory),
    categoryCooldownMs: pos(it.useInCombat?.categoryCooldownMs, it.useCategoryCooldownMs),
  };
}

// Ms until this item may be used again, given the world cooldown maps; 0 is ready. The personal CD
// is keyed on the USE-SPELL id, which is how two items sharing a use-spell share the cooldown.
export function itemUseCooldownRemainingMs(
  it: ItemDef | null | undefined,
  spellCooldowns: Record<number, number> | undefined,
  categoryCooldowns: Record<number, number> | undefined,
  now: number,
): number {
  if (!it) return 0;
  const cd = itemUseCooldown(it);
  let rem = 0;
  const useSp = it.useSpell;
  // NOT gated on cd.cooldownMs: whatever wrote this key means the use-spell is on cooldown. 37 items
  // get theirs from the spell's RecoveryTime, and a precondition left those stamped-and-unenforced.
  if (useSp != null) {
    rem = Math.max(rem, (spellCooldowns?.[useSp] ?? 0) - now);
  }
  if (cd.category > 0 && cd.categoryCooldownMs > 0) {
    rem = Math.max(rem, (categoryCooldowns?.[cd.category] ?? 0) - now);
  }
  return Math.max(0, rem);
}
