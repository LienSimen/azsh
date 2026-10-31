// Player bank facade methods (deposit/withdraw, bank bag slots).
// Pattern C: createBankModule(ctx) — no import of game.ts.

import {
  deposit,
  withdraw,
  depositStack,
  withdrawStack,
  bankCapacity,
  buyBankBagSlot,
  equipBankBag,
  unequipBankBag,
} from '../../domain/items/bank.ts';
import type { Game } from './types.ts';
import type { GameCtx } from './context.ts';
import { moneyMarked } from '../../domain/economy/money.ts';

export function createBankModule(ctx: GameCtx): Pick<
  Game,
  | 'bankDeposit'
  | 'bankWithdraw'
  | 'bankDepositStack'
  | 'bankWithdrawStack'
  | 'buyBankBagSlot'
  | 'equipBankBag'
  | 'unequipBankBag'
> {
  const { ds, state, log, cap, refreshQuests } = ctx;
  return {
    bankDeposit(itemEntry, qty = 1) {
      const def = ds.item(itemEntry);
      const res = deposit(state.inventory, state.bank, itemEntry, qty, def?.stackable ?? 1, bankCapacity(state.bankBags, ds));
      if (!res.ok) return { ok: false, reason: res.reason ?? 'Cannot deposit' };
      state.inventory = res.inventory;
      state.bank = res.bank;
      refreshQuests(); // banking a quest item can revert a completed quest
      log(`Deposited ${res.moved}x ${def?.name ?? itemEntry}.`);
      return { ok: true, moved: res.moved };
    },

    bankWithdraw(itemEntry, qty = 1) {
      const def = ds.item(itemEntry);
      const res = withdraw(state.inventory, state.bank, itemEntry, qty, def?.stackable ?? 1, cap());
      if (!res.ok) return { ok: false, reason: res.reason ?? 'Cannot withdraw' };
      state.inventory = res.inventory;
      state.bank = res.bank;
      refreshQuests(); // withdrawing a quest item can complete a quest
      log(`Withdrew ${res.moved}x ${def?.name ?? itemEntry}.`);
      return { ok: true, moved: res.moved };
    },

    bankDepositStack(slotIndex, qty) {
      const invStacks = state.inventory.stacks;
      if (slotIndex < 0 || slotIndex >= invStacks.length) return { ok: false, reason: 'Invalid slot' };
      const stk = invStacks[slotIndex];
      const def = ds.item(stk.item);
      const q = (qty != null && qty > 0) ? qty : stk.count;
      const res = depositStack(state.inventory, state.bank, slotIndex, q, def?.stackable ?? 1, bankCapacity(state.bankBags, ds));
      if (!res.ok) return { ok: false, reason: res.reason ?? 'Cannot deposit' };
      state.inventory = res.inventory;
      state.bank = res.bank;
      refreshQuests(); // banking a quest item can revert a completed quest
      log(`Deposited ${res.moved}x ${def?.name ?? stk.item}.`);
      return { ok: true, moved: res.moved };
    },

    bankWithdrawStack(slotIndex, qty) {
      const bankStacks = state.bank.stacks;
      if (slotIndex < 0 || slotIndex >= bankStacks.length) return { ok: false, reason: 'Invalid slot' };
      const stk = bankStacks[slotIndex];
      const def = ds.item(stk.item);
      const q = (qty != null && qty > 0) ? qty : stk.count;
      const res = withdrawStack(state.inventory, state.bank, slotIndex, q, def?.stackable ?? 1, cap());
      if (!res.ok) return { ok: false, reason: res.reason ?? 'Cannot withdraw' };
      state.inventory = res.inventory;
      state.bank = res.bank;
      refreshQuests(); // withdrawing a quest item can complete a quest
      log(`Withdrew ${res.moved}x ${def?.name ?? stk.item}.`);
      return { ok: true, moved: res.moved };
    },

    buyBankBagSlot() {
      const res = buyBankBagSlot(state.bankBags, state.char.gold);
      if (!res.ok) return { ok: false, reason: res.reason ?? 'Cannot buy a bank bag slot' };
      state.bankBags = res.bankBags;
      state.char = { ...state.char, gold: state.char.gold - res.cost };
      log(`Bought a bank bag slot for ${moneyMarked(res.cost)}.`);
      return { ok: true, spent: res.cost };
    },

    equipBankBag(itemEntry, slotIndex) {
      const res = equipBankBag(state.inventory, state.bank, state.bankBags, ds, itemEntry, slotIndex);
      if (!res.ok) return { ok: false, reason: res.reason ?? 'Cannot slot that bag' };
      state.inventory = res.inventory;
      state.bankBags = res.bankBags;
      log(`Slotted ${ds.item(itemEntry)?.name ?? itemEntry} into the bank.`);
      return { ok: true };
    },

    unequipBankBag(slotIndex) {
      const entry = state.bankBags[slotIndex];
      const res = unequipBankBag(state.inventory, state.bank, state.bankBags, ds, slotIndex, cap());
      if (!res.ok) return { ok: false, reason: res.reason ?? 'Cannot remove that bag' };
      state.inventory = res.inventory;
      state.bankBags = res.bankBags;
      log(`Removed ${ds.item(entry ?? -1)?.name ?? 'a bag'} from the bank.`);
      return { ok: true };
    },
  };
}
