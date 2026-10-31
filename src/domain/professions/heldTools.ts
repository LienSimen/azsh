// A crafting tool is HELD, never spent (Spell.cpp:6599-6615 CheckItems), so ONE copy in any party
// bag serves every crafter: no rod per enchanter, no hammer per smith.

import type { DataStore } from '../../data/dataStore.ts';
import type { Inventory } from '../items/inventory.ts';
import { protectLookupFor } from '../items/junkCategories.ts';

/** Anything that carries bags: a Companion, or a bench body. */
export interface ToolBearer { bags?: Inventory }

/** Every held-tool entry the party carries, across the player's bags and every companion's. */
export function partyHeldTools(
  inv: Inventory | undefined,
  companions: readonly ToolBearer[],
  ds: DataStore,
): Set<number> {
  // craftTools is memoized per DataStore; ds.recipes() materializes 1,135 rows and must not rebuild.
  const tools = protectLookupFor(ds).craftTools;
  const rods = new Set(ds.enchantRods().map((r) => r.entry));
  const out = new Set<number>();
  const scan = (bag: Inventory | undefined): void => {
    for (const stk of bag?.stacks ?? []) {
      if (tools.has(stk.item) || rods.has(stk.item)) out.add(stk.item);
    }
  };
  scan(inv);
  for (const c of companions) scan(c.bags);
  return out;
}
