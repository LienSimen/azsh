// One sort verb for every container surface: your bags, your bank, a companion's bags, their bank,
// and the whole crew at once. Pattern C: createSortContainersModule(ctx) — no import of game.ts.
// The order itself lives in domain/items/sortContainer.ts, ported from addons/SortBags.

import type { Companion } from '../../domain/bots/squad.ts';
import { emptyInventory } from '../../domain/items/inventory.ts';
import { sortInventory } from '../../domain/items/sortContainer.ts';
import type { Game, SortContainerTarget } from './types.ts';
import type { GameCtx } from './context.ts';

export function createSortContainersModule(ctx: GameCtx): Pick<Game, 'sortContainer'> {
  const { ds, state, log } = ctx;

  const findComp = (id: string): Companion | undefined =>
    state.squad?.find((c) => c.id === id)
    ?? state.botRoster?.[id]
    ?? state.raidRoster?.members?.[id];

  // The same population the Companion storage grid merges (companionsPanel.ts partyVaultFromGame):
  // active squad + world roster. The DEV raid bench is deliberately out.
  const everyCompanion = (): Companion[] => [
    ...(state.squad ?? []),
    ...Object.values(state.botRoster ?? {}),
  ];

  return {
    sortContainer(where: SortContainerTarget, companionId?: string) {
      let freed = 0;
      let changed = false;
      let what = '';

      if (where === 'bags') {
        const res = sortInventory(state.inventory, ds);
        state.inventory = res.inventory;
        freed = res.freed;
        changed = res.changed;
        what = 'your bags';
      } else if (where === 'bank') {
        const res = sortInventory(state.bank ?? emptyInventory(), ds);
        state.bank = res.inventory;
        freed = res.freed;
        changed = res.changed;
        what = 'your bank';
      } else if (where === 'companion-bags' || where === 'companion-bank') {
        if (!companionId) return { ok: false, reason: 'No companion' };
        const comp = findComp(companionId);
        if (!comp) return { ok: false, reason: 'No such companion' };
        const src = (where === 'companion-bags' ? comp.bags : comp.bank) ?? emptyInventory();
        const res = sortInventory(src, ds);
        if (where === 'companion-bags') comp.bags = res.inventory;
        else comp.bank = res.inventory;
        freed = res.freed;
        changed = res.changed;
        what = `${comp.name}'s ${where === 'companion-bags' ? 'bags' : 'bank'}`;
      } else if (where === 'companions') {
        const crew = everyCompanion();
        for (const comp of crew) {
          if (comp.bags) {
            const r = sortInventory(comp.bags, ds);
            comp.bags = r.inventory;
            freed += r.freed;
            changed = changed || r.changed;
          }
          if (comp.bank) {
            const r = sortInventory(comp.bank, ds);
            comp.bank = r.inventory;
            freed += r.freed;
            changed = changed || r.changed;
          }
        }
        if (!crew.length) return { ok: false, reason: 'No companions' };
        what = `${crew.length} companion${crew.length === 1 ? '' : 's'}`;
      } else {
        return { ok: false, reason: 'Nothing to sort' };
      }

      if (changed) {
        log(freed > 0
          ? `Sorted ${what} - ${freed} slot${freed === 1 ? '' : 's'} freed.`
          : `Sorted ${what}.`);
      }
      return { ok: true, freed, changed };
    },
  };
}
