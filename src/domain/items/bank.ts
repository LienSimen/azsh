// A personal bank: storage separate from the backpack. Pure — every op transfers between two
// Inventory values. Bank bag slots must be PURCHASED one at a time before a bag can go in.

import type { DataStore } from '../../data/dataStore.ts';
import type { Inventory } from './inventory.ts';
import { addItem, addInstance, removeItem, takeStack, transferItem, canFit, canFitInstance, countItem, usedSlots, BACKPACK_SLOTS } from './inventory.ts';
import { copyInstance } from './itemInstance.ts';

// WoW's default bank window size, the base grid before any bank bags. CMaNGOS BANK_SLOT_ITEM_START
// 39..63 is 24; we keep 28 for the existing Phonecraft grid, which is not DBC-driven.
export const BANK_SLOTS = 28;

// How many bank bag slots can ever be bought. Player.h comments BankBagSlots as 7 and purchase is
// sequential via CMSG_BUY_BANK_SLOT; we keep 7 to match BANK_BAG_SLOT_COSTS.
export const MAX_BANK_BAG_SLOTS = 7;

// Copper price to unlock the Nth bank bag slot, indexed by how many you already own, in the
// CMaNGOS purchase order. Values are BankBagSlotPrices.dbc-dependent — do not invent.
export const BANK_BAG_SLOT_COSTS: readonly number[] = [
  10_00, 1_00_00, 10_00_00, 25_00_00, 25_00_00, 25_00_00, 25_00_00,
];

// A bank's purchased bag slots: one entry per bought slot, holding the bag's item entry or null.
// Its length IS the number owned. Plain data, so it serializes straight into the save.
export type BankBags = (number | null)[];

// Total bank capacity: the base BANK_SLOTS grid plus the bagSlots of every bag in a purchased
// slot. Data-driven from the item's own bagSlots, never hardcoded.
export function bankCapacity(bankBags: BankBags, ds: DataStore): number {
  let cap = BANK_SLOTS;
  for (const entry of bankBags) {
    const it = entry != null ? ds.item(entry) : undefined;
    if (it?.slot === 'bag') cap += it.bagSlots ?? 0;
  }
  return cap;
}

/** The cost to buy the next bank bag slot, or null if all slots are already owned. */
export function nextBankBagSlotCost(bankBags: BankBags): number | null {
  if (bankBags.length >= MAX_BANK_BAG_SLOTS) return null;
  return BANK_BAG_SLOT_COSTS[bankBags.length] ?? BANK_BAG_SLOT_COSTS[BANK_BAG_SLOT_COSTS.length - 1];
}

export interface TransferResult {
  ok: boolean;
  reason?: string;
  inventory: Inventory;
  bank: Inventory;
  moved: number;
}

const fail = (reason: string, inventory: Inventory, bank: Inventory): TransferResult =>
  ({ ok: false, reason, inventory, bank, moved: 0 });

/** Move up to `qty` of an item from the backpack into the bank (bank space permitting). */
export function deposit(inv: Inventory, bank: Inventory, item: number, qty: number, maxStack: number, bankCap: number = BANK_SLOTS): TransferResult {
  if (qty < 1) return fail('Invalid quantity', inv, bank);
  const n = Math.min(qty, countItem(inv, item));
  if (n <= 0) return fail("You don't have that", inv, bank);
  if (!canFit(bank, item, n, maxStack, bankCap)) return fail('Your bank is full', inv, bank);
  const moved = transferItem(inv, bank, item, n, maxStack, bankCap);
  if (moved.moved !== n) return fail('Could not move that', inv, bank);
  return { ok: true, inventory: moved.from, bank: moved.to, moved: moved.moved };
}

/** Move up to `qty` of an item from the bank into the backpack (bag space permitting). */
export function withdraw(inv: Inventory, bank: Inventory, item: number, qty: number, maxStack: number, cap: number = BACKPACK_SLOTS): TransferResult {
  if (qty < 1) return fail('Invalid quantity', inv, bank);
  const n = Math.min(qty, countItem(bank, item));
  if (n <= 0) return fail("It's not in your bank", inv, bank);
  if (!canFit(inv, item, n, maxStack, cap)) return fail('Your bags are full', inv, bank);
  const moved = transferItem(bank, inv, item, n, maxStack, cap);
  if (moved.moved !== n) return fail('Could not move that', inv, bank);
  return { ok: true, inventory: moved.to, bank: moved.from, moved: moved.moved };
}

/** Move up to `qty` from the *specific stack* at `slotIndex` in the backpack into the bank
 *  (Wave Q P1: the moved instance keeps its full identity). */
export function depositStack(inv: Inventory, bank: Inventory, slotIndex: number, qty: number, maxStack: number, bankCap: number = BANK_SLOTS): TransferResult {
  if (qty < 1) return fail('Invalid quantity', inv, bank);
  if (slotIndex < 0 || slotIndex >= inv.stacks.length) return fail('Invalid slot', inv, bank);
  const src = inv.stacks[slotIndex];
  const item = src.item;
  const n = Math.min(qty, src.count);
  if (n <= 0) return fail("You don't have that", inv, bank);
  if (!canFitInstance(bank, copyInstance(src, n), maxStack, bankCap)) return fail('Your bank is full', inv, bank);
  const [inventory, taken] = takeStack(inv, slotIndex, n);
  return { ok: true, inventory, bank: taken ? addInstance(bank, taken, maxStack) : bank, moved: taken ? taken.count : 0 };
}

/** Move up to `qty` from the *specific stack* at `slotIndex` in the bank into the backpack
 *  (Wave Q P1: the moved instance keeps its full identity). */
export function withdrawStack(inv: Inventory, bank: Inventory, slotIndex: number, qty: number, maxStack: number, cap: number = BACKPACK_SLOTS): TransferResult {
  if (qty < 1) return fail('Invalid quantity', inv, bank);
  if (slotIndex < 0 || slotIndex >= bank.stacks.length) return fail('Invalid slot', inv, bank);
  const src = bank.stacks[slotIndex];
  const item = src.item;
  const n = Math.min(qty, src.count);
  if (n <= 0) return fail("It's not in your bank", inv, bank);
  if (!canFitInstance(inv, copyInstance(src, n), maxStack, cap)) return fail('Your bags are full', inv, bank);
  const [nextBank, taken] = takeStack(bank, slotIndex, n);
  return { ok: true, inventory: taken ? addInstance(inv, taken, maxStack) : inv, bank: nextBank, moved: taken ? taken.count : 0 };
}

export interface BuySlotResult {
  ok: boolean;
  reason?: string;
  bankBags: BankBags;
  cost: number;
}

/** Purchase the next bank bag slot (an empty slot appended). Gold is deducted by the caller. */
export function buyBankBagSlot(bankBags: BankBags, gold: number): BuySlotResult {
  const cost = nextBankBagSlotCost(bankBags);
  if (cost == null) return { ok: false, reason: 'All bank bag slots are bought', bankBags, cost: 0 };
  if (gold < cost) return { ok: false, reason: 'Not enough money', bankBags, cost };
  return { ok: true, bankBags: [...bankBags, null], cost };
}

export interface BagSlotResult {
  ok: boolean;
  reason?: string;
  inventory: Inventory;
  bankBags: BankBags;
}

const stack = (ds: DataStore, entry: number): number => ds.item(entry)?.stackable ?? 1;

// Slot a bag from the backpack into purchased bank bag slot `slotIndex`, swapping any bag already
// there back. Rejects a non-bag, an unpurchased slot, or a shrink that would overflow the bank.
export function equipBankBag(inv: Inventory, bank: Inventory, bankBags: BankBags, ds: DataStore, entry: number, slotIndex: number): BagSlotResult {
  const reject = (reason: string): BagSlotResult => ({ ok: false, reason, inventory: inv, bankBags });
  if (slotIndex < 0 || slotIndex >= bankBags.length) return reject('That bank bag slot is locked');
  const it = ds.item(entry);
  if (it?.slot !== 'bag') return reject('That is not a bag');
  if (countItem(inv, entry) <= 0) return reject("You don't have that bag");

  let inventory = removeItem(inv, entry, 1)[0];
  const bags = [...bankBags];
  const displaced = bags[slotIndex];
  if (displaced != null) inventory = addItem(inventory, displaced, 1, stack(ds, displaced));
  bags[slotIndex] = entry;

  // Swapping in a smaller bag shrinks capacity; block it if the bank would overflow.
  if (usedSlots(bank) > bankCapacity(bags, ds)) return reject('Not enough room - that bag is too small for what the bank holds');
  return { ok: true, inventory, bankBags: bags };
}

// Remove the bag in purchased bank bag slot `slotIndex`, returning it to the backpack. Rejects if the bags
// have no room for it, or if losing its slots would overflow the bank.
export function unequipBankBag(inv: Inventory, bank: Inventory, bankBags: BankBags, ds: DataStore, slotIndex: number, invCap: number = BACKPACK_SLOTS): BagSlotResult {
  const reject = (reason: string): BagSlotResult => ({ ok: false, reason, inventory: inv, bankBags });
  if (slotIndex < 0 || slotIndex >= bankBags.length) return reject('That bank bag slot is locked');
  const entry = bankBags[slotIndex];
  if (entry == null) return reject('That slot is empty');
  if (!canFit(inv, entry, 1, stack(ds, entry), invCap)) return reject('Your bags are full');

  const bags = [...bankBags];
  bags[slotIndex] = null;
  if (usedSlots(bank) > bankCapacity(bags, ds)) return reject('That bag is holding too much - free up bank space first');
  return { ok: true, inventory: addItem(inv, entry, 1, stack(ds, entry)), bankBags: bags };
}
