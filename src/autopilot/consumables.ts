// Pick the best food / drink to auto-consume between fights, purely from DB `consumable`
// data — no hardcoded item ids. "Best" = the highest total restore the character can use
// at its level. PURE: no DOM/RNG/Date.

import type { DataStore } from '../data/dataStore.ts';
import type { Inventory } from '../domain/items/inventory.ts';
import type { Character } from '../domain/character/character.ts';
import { maxHealth, maxPower } from '../domain/character/characterStats.ts';

export type ConsumeEffect = 'food' | 'drink';

export interface ConsumablePick {
  itemEntry: number;
  effect: ConsumeEffect;
  restore: number; // total restored over the full duration
}

/**
 * Total restored by a periodic consumable = per-tick amount × number of ticks.
 *
 * OBS_MOD_HEALTH/MANA food (`pctOfMax`) ticks a PERCENTAGE of max, so its worth scales with the
 * eater (SpellAuras.cpp:4706). Ranking those by `amountPerTick` made every harvest/holiday food
 * look like a 2-point trickle and the picker always passed them over. `maxResource` is the
 * eater's max health (food) or max mana (drink).
 */
function totalRestore(
  c: { amountPerTick: number; tickMs: number; durationMs: number; pctOfMax?: number },
  maxResource: number,
): number {
  const ticks = Math.max(1, Math.floor(c.durationMs / c.tickMs));
  const perTick = c.pctOfMax ? Math.floor((maxResource * c.pctOfMax) / 100) : c.amountPerTick;
  return perTick * ticks;
}

// The best usable consumable of `effect` in the bags: level-eligible and maximising total restore. Returns
// null when the character carries none it can use.
export function bestConsumable(char: Character, inv: Inventory, ds: DataStore, effect: ConsumeEffect): ConsumablePick | null {
  let best: ConsumablePick | null = null;
  const seen = new Set<number>();
  // Percent-of-max food is worth more the bigger the eater — resolve it against this character.
  const maxResource = effect === 'food' ? maxHealth(char, ds) : maxPower(char, ds);
  for (const stack of inv.stacks) {
    if (seen.has(stack.item)) continue;
    seen.add(stack.item);
    const it = ds.item(stack.item);
    const c = it?.consumable;
    if (!c || c.effect !== effect) continue;
    if (c.reqLevel > char.level) continue;
    const restore = totalRestore(c, maxResource);
    if (!best || restore > best.restore) best = { itemEntry: it!.entry, effect, restore };
  }
  return best;
}

/** Does the character carry any usable consumable of this effect? */
export function hasConsumable(char: Character, inv: Inventory, ds: DataStore, effect: ConsumeEffect): boolean {
  return bestConsumable(char, inv, ds, effect) !== null;
}
