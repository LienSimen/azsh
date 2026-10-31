// Buying from and selling to NPC vendors. Pure: takes the item def and returns a NEW character and
// inventory. Buyback is a 12-slot FIFO ring (Player.h BUYBACK_SLOT_START 69), owned by the caller.

import type { Character } from '../character/character.ts';
import type { Inventory } from '../items/inventory.ts';
import { addItem, addInstance, removeItem, removeStack, canFit, countItem } from '../items/inventory.ts';
import type { ItemDef } from '../../data/schema.ts';
import type { Rng } from '../../engine/core/rng.ts';
import { createItemInstance, type CreateItemData, type CreateItemOpts } from '../items/createItem.ts';
import { applyBindToInstance, resolveBonding } from '../items/itemBonding.ts';
import type { ItemInstance } from '../items/itemInstance.ts';

// Hard cap on player coinage in copper. CMaNGOS: `#define MAX_MONEY_AMOUNT (0x7FFFFFFF-1)` in Player.h (≈
// 2147483646). ModifyMoney / SetMoney clamp gains to this value.
export const MAX_MONEY = 0x7FFFFFFF - 1;

// Vendor buyback slot count. CMaNGOS Player.h: `BUYBACK_SLOT_START = 69`, `BUYBACK_SLOT_END = 81` → 12
// slots.
export const BUYBACK_SLOTS = 12;

/** One sold stack the vendor will sell back at the refund price. */
export interface BuybackEntry {
  entry: number;
  qty: number;
  refundCopper: number;
  /** Monotonic / wall-clock timestamp used for oldest-first eviction. */
  soldAt: number;
  /** Companion whose bags the stack was sold out of. Absent = your own bags. */
  owner?: string;
  ownerName?: string;
}

/** Fixed-capacity list of recent sales (max BUYBACK_SLOTS). Plain data for the caller to store. */
export type BuybackState = BuybackEntry[];

export function emptyBuyback(): BuybackState {
  return [];
}

// Append a buyback entry, evicting the existing entry with the oldest soldAt when the list is
// full. Cite: Player::AddItemToBuyBackSlot — the lowest buyback timestamp is replaced.
export function pushBuyback(state: BuybackState, entry: BuybackEntry): BuybackState {
  if (state.length < BUYBACK_SLOTS) return [...state, entry];
  let oldestIdx = 0;
  for (let i = 1; i < state.length; i++) {
    if (state[i].soldAt < state[oldestIdx].soldAt) oldestIdx = i;
  }
  const next = state.filter((_, i) => i !== oldestIdx);
  next.push(entry);
  return next;
}

export interface TradeCheck {
  ok: boolean;
  reason?: string;
}
export interface TradeResult extends TradeCheck {
  char: Character;
  inventory: Inventory;
  amount: number; // copper spent (buy) or earned (sell); 0 on failure
}

/** Clamp copper so player gold never exceeds MAX_MONEY (CMaNGOS ModifyMoney). */
export function clampGold(copper: number): number {
  if (copper < 0) return 0;
  return copper > MAX_MONEY ? MAX_MONEY : copper;
}

// Vendor trade quantities must be positive integers: copper and stack counts are integers, and
// NaN must not enter price math, since NaN < 1 is false so a bare qty < 1 check is not enough.
export function isValidTradeQty(qty: number): boolean {
  return Number.isInteger(qty) && qty >= 1;
}

// Unit buy cost in copper after the optional reputation price multiplier, which defaults to 1 and
// is 0.9 at Honored+. Floors the total so copper stays integer.
export function buyCostCopper(def: ItemDef, qty: number = 1, priceMultiplier: number = 1): number {
  const base = def.buyPrice * qty;
  return Math.floor(base * priceMultiplier);
}

export function canBuy(
  char: Character,
  inv: Inventory,
  def: ItemDef,
  qty: number = 1,
  cap?: number,
  priceMultiplier: number = 1,
  unitsPerPurchase: number = 1,
): TradeCheck {
  if (!isValidTradeQty(qty)) return { ok: false, reason: 'Invalid quantity' };
  if (def.buyPrice <= 0) return { ok: false, reason: 'Not for sale' };
  const cost = buyCostCopper(def, qty, priceMultiplier);
  if (char.gold < cost) return { ok: false, reason: 'Not enough money' };
  const units = qty * Math.max(1, unitsPerPurchase);
  if (!canFit(inv, def.entry, units, def.stackable, cap)) return { ok: false, reason: 'Not enough bag space' };
  return { ok: true };
}

// Optional create-time deps for Wave Q P2 random-property rolls at vendor buy. When omitted, falls back to
// plain `addItem` (mats / tests without a pool table).
export interface BuyCreateCtx {
  ds: CreateItemData;
  rng: Rng;
  lookupProp?: CreateItemOpts['lookupProp'];
}

// unitsPerPurchase is item_template.BuyCount: BuyPrice buys that many units, e.g. ammo 200-packs.
// Pass `create` so rollable greens mint a randomPropertyId at purchase. Cite: Player.cpp:17516.
export function buy(
  char: Character,
  inv: Inventory,
  def: ItemDef,
  qty: number = 1,
  cap?: number,
  priceMultiplier: number = 1,
  unitsPerPurchase: number = 1,
  create?: BuyCreateCtx,
): TradeResult {
  const check = canBuy(char, inv, def, qty, cap, priceMultiplier, unitsPerPurchase);
  if (!check.ok) return { ok: false, reason: check.reason, char, inventory: inv, amount: 0 };
  const cost = buyCostCopper(def, qty, priceMultiplier);
  const units = qty * Math.max(1, unitsPerPurchase);
  let inventory: Inventory;
  if (create) {
    // New-copy path: roll (or skip) random property once for the purchased stack.
    // Classic: vendor BoP binds on buy (same trigger as loot / pick-up).
    const inst = applyBindToInstance(
      createItemInstance(def.entry, units, create.ds, create.rng, {
        lookupProp: create.lookupProp,
      }),
      resolveBonding(def),
      'loot',
    );
    inventory = addInstance(inv, inst, def.stackable);
  } else {
    // Bare path (tests / mats): stamp BoP/quest bind when the def binds on loot.
    const base: ItemInstance = { item: def.entry, count: units };
    const minted = applyBindToInstance(base, resolveBonding(def), 'loot');
    inventory = minted.bound
      ? addInstance(inv, minted, def.stackable)
      : addItem(inv, def.entry, units, def.stackable);
  }
  return {
    ok: true,
    char: { ...char, gold: char.gold - cost },
    inventory,
    amount: cost,
  };
}

export function canSell(_char: Character, inv: Inventory, def: ItemDef, qty: number = 1): TradeCheck {
  if (!isValidTradeQty(qty)) return { ok: false, reason: 'Invalid quantity' };
  if (def.sellPrice <= 0) return { ok: false, reason: 'No one will buy that' };
  if (countItem(inv, def.entry) < qty) return { ok: false, reason: "You don't have that" };
  return { ok: true };
}

// Max units of `def` that fit under MAX_MONEY before gold clamps. CMaNGOS removes items then
// clamps, so items vanish for zero copper at the cap; sizing first keeps unsold units in bags.
export function maxSellQtyForGold(char: Character, def: ItemDef, qty: number): number {
  if (qty < 1 || def.sellPrice <= 0) return 0;
  const room = MAX_MONEY - char.gold;
  if (room <= 0) return 0;
  return Math.min(qty, Math.floor(room / def.sellPrice));
}

// Vendor sell copper for `count` units, scaled by remaining/max charges when the item is
// consume-on-empty (SpellCharges < 0). Cite: ItemHandler.cpp:545-556. Unused stacks stay full.
export function sellCopperChargeRatio(
  def: Pick<ItemDef, 'sellPrice' | 'charges'>,
  count: number,
  remainingCharges?: number | null,
): number {
  // Money = SellPrice * count, then scaled by remaining/max for a NEGATIVE charge row only: "the
  // value of this item is relative to how many charges are remaining". Cite: ItemHandler.cpp:551-557.
  let money = def.sellPrice * count;
  const max = def.charges != null && def.charges < 0 ? Math.abs(def.charges) : 0;
  if (max > 0 && remainingCharges != null) {
    money = Math.floor(money * (remainingCharges / max));
  }
  return money;
}

export interface SellResult extends TradeResult {
  /** Units actually sold (may be < requested near MAX_MONEY). Present on success. */
  qty?: number;
  /** Present on success so the caller can `pushBuyback` (caller owns buyback state). */
  buybackEntry?: BuybackEntry;
}

// Sell items for charge-ratio copper × qty, reducing qty so gold never passes MAX_MONEY, and stamp
// the caller's clock onto the buyback entry. Takes from the first matching stacks — see sellStack.
export function sell(char: Character, inv: Inventory, def: ItemDef, qty: number = 1, soldAt: number = 0): SellResult {
  const check = canSell(char, inv, def, qty);
  if (!check.ok) return { ok: false, reason: check.reason, char, inventory: inv, amount: 0 };
  const n = maxSellQtyForGold(char, def, qty);
  if (n <= 0) {
    return { ok: false, reason: 'You cannot carry any more money', char, inventory: inv, amount: 0 };
  }

  let earned = 0;
  let remaining = n;
  for (const s of inv.stacks) {
    if (s.item === def.entry && remaining > 0) {
      const take = Math.min(s.count, remaining);
      earned += sellCopperChargeRatio(def, take, s.charges);
      remaining -= take;
    }
  }

  const [inventory] = removeItem(inv, def.entry, n);
  return {
    ok: true,
    char: { ...char, gold: clampGold(char.gold + earned) },
    inventory,
    amount: earned,
    qty: n,
    buybackEntry: { entry: def.entry, qty: n, refundCopper: earned, soldAt },
  };
}

// Sell up to `qty` from the specific stack at `slotIndex`, leaving other stacks of the same item
// alone. Qty is also capped by the remaining gold room under MAX_MONEY, as in `sell`.
export function sellStack(
  char: Character,
  inv: Inventory,
  def: ItemDef,
  slotIndex: number,
  qty: number = 1,
  soldAt: number = 0,
): SellResult {
  if (!isValidTradeQty(qty)) return { ok: false, reason: 'Invalid quantity', char, inventory: inv, amount: 0 };
  if (def.sellPrice <= 0) return { ok: false, reason: 'No one will buy that', char, inventory: inv, amount: 0 };
  if (slotIndex < 0 || slotIndex >= inv.stacks.length) {
    return { ok: false, reason: 'Invalid slot', char, inventory: inv, amount: 0 };
  }
  const src = inv.stacks[slotIndex];
  if (src.item !== def.entry) {
    return { ok: false, reason: "You don't have that", char, inventory: inv, amount: 0 };
  }
  const want = Math.min(qty, src.count);
  if (want <= 0) return { ok: false, reason: "You don't have that", char, inventory: inv, amount: 0 };
  const n = maxSellQtyForGold(char, def, want);
  if (n <= 0) {
    return { ok: false, reason: 'You cannot carry any more money', char, inventory: inv, amount: 0 };
  }

  const earned = sellCopperChargeRatio(def, n, src.charges);

  const [inventory] = removeStack(inv, slotIndex, n);
  return {
    ok: true,
    char: { ...char, gold: clampGold(char.gold + earned) },
    inventory,
    amount: earned,
    qty: n,
    buybackEntry: { entry: def.entry, qty: n, refundCopper: earned, soldAt },
  };
}

export interface BuyBackResult extends TradeResult {
  buyback: BuybackState;
}

// Repurchase the buyback entry at `index` for its `refundCopper`, removing it from state and returning the
// items to the bags. `maxStack` is the item's stackable (from ItemDef).
export function buyBack(
  char: Character,
  inv: Inventory,
  state: BuybackState,
  index: number,
  maxStack: number = 1,
  cap?: number,
): BuyBackResult {
  if (index < 0 || index >= state.length) {
    return { ok: false, reason: 'Nothing to buy back', char, inventory: inv, amount: 0, buyback: state };
  }
  const e = state[index];
  if (char.gold < e.refundCopper) {
    return { ok: false, reason: 'Not enough money', char, inventory: inv, amount: 0, buyback: state };
  }
  if (!canFit(inv, e.entry, e.qty, maxStack, cap)) {
    return { ok: false, reason: 'Not enough bag space', char, inventory: inv, amount: 0, buyback: state };
  }
  const buyback = state.filter((_, i) => i !== index);
  // Spending gold — no gain path; still clamp defensively after any future refund logic.
  const gold = clampGold(char.gold - e.refundCopper);
  return {
    ok: true,
    char: { ...char, gold },
    inventory: addItem(inv, e.entry, e.qty, maxStack),
    amount: e.refundCopper,
    buyback,
  };
}
