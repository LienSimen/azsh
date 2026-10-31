// Pre-run food and water, engine half: the party as supply members, the plan, and the buy off your purse
// into each member's OWN bags, where its rest reads (liveFloorRecovery bagsOf). Remote vendor as reagentBuyIn.ts.

import { companionCharacter, companionLevel } from '../../domain/bots/squad.ts';
import {
  planRunSupply,
  type RunSupplyPlan,
  type RunSupplyPrefs,
  type SupplyBuy,
  type SupplyMember,
} from '../../domain/bots/runSupply.ts';
import { bagCapacity } from '../../domain/items/equipment.ts';
import { addItem, canFit, emptyInventory } from '../../domain/items/inventory.ts';
import { buyCostCopper } from '../../domain/economy/trading.ts';
import { moneyMarked } from '../../domain/economy/money.ts';
import type { GameCtx } from './context.ts';
import type { Game } from './types.ts';

export function createRunSupplyModule(
  ctx: GameCtx,
): Pick<Game, 'runSupplyMembers' | 'runSupplyPlan' | 'buyRunSupplies'> {
  const { ds, state, log, cap } = ctx;

  const members = (): SupplyMember[] => {
    const out: SupplyMember[] = [{
      id: 'player', name: state.char.name, char: state.char, bags: state.inventory, cap: cap(),
    }];
    for (const comp of state.squad ?? []) {
      const shell = companionCharacter(comp, companionLevel(comp, state.char.level), ds);
      out.push({
        id: comp.id, name: comp.name, char: shell, bags: comp.bags ?? emptyInventory(), cap: bagCapacity(shell, ds),
      });
    }
    return out;
  };

  return {
    runSupplyMembers: members,

    runSupplyPlan(prefs?: RunSupplyPrefs): RunSupplyPlan {
      return planRunSupply({
        ds, members: members(), gold: state.char.gold, race: state.char.race, ...(prefs ? { prefs } : {}),
      });
    },

    buyRunSupplies(buys) {
      let spent = 0;
      let units = 0;
      let landed = 0;
      let refusal: string | undefined;
      for (const b of buys) {
        const def = ds.item(b.item);
        if (!def) { refusal ??= 'Unknown item'; continue; }
        const cost = buyCostCopper(def, b.purchases);
        if (state.char.gold < cost) { refusal ??= 'Not enough money'; continue; }
        const stack = Math.max(1, def.stackable ?? 1);
        if (b.memberId === 'player') {
          if (!canFit(state.inventory, b.item, b.units, stack, cap())) { refusal ??= 'Not enough bag space'; continue; }
          state.inventory = addItem(state.inventory, b.item, b.units, stack);
        } else {
          const comp = (state.squad ?? []).find((c) => c.id === b.memberId);
          if (!comp) { refusal ??= 'Companion is not in the party'; continue; }
          const shell = companionCharacter(comp, companionLevel(comp, state.char.level), ds);
          const bags = comp.bags ?? emptyInventory();
          if (!canFit(bags, b.item, b.units, stack, bagCapacity(shell, ds))) { refusal ??= 'Not enough bag space'; continue; }
          comp.bags = addItem(bags, b.item, b.units, stack);
        }
        state.char = { ...state.char, gold: state.char.gold - cost };
        spent += cost;
        units += b.units;
        landed++;
        log(`Bought ${b.units}x ${def.name} for ${b.memberId === 'player' ? 'you' : b.memberName} (${moneyMarked(cost)}).`);
      }
      if (landed <= 0) return { ok: false, reason: refusal ?? 'Nothing to buy' };
      return { ok: true, spent, units, rows: landed, ...(refusal ? { refusal } : {}) };
    },
  };
}

export type { SupplyBuy };
