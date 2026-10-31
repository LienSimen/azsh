// Limited vendor stock, restock and BuyCount multiples — pure helpers. maxcount 0 is unlimited,
// restock is lazy by incrtime. Cite: Creature.cpp:2512 / :2547; Player.cpp:17516; npc_vendor.

/** npc_vendor row fidelity (Creature.h VendorItem). maxcount 0 = infinite stock. */
export interface VendorStockDef {
  item: number;
  /** 0 = unlimited. */
  maxcount: number;
  /** Seconds per restock tick when maxcount != 0. */
  incrtime: number;
  // item_template.BuyCount — vendor sells and restocks in multiples of this. Defaults to 1 when omitted by
  // caller.
  buyCount: number;
}

/** Per-NPC runtime stock tracker (Creature.h VendorItemCount). Times in unix seconds. */
export interface VendorItemCountState {
  itemId: number;
  count: number;
  lastIncrementTime: number;
}

export type VendorStockMap = Map<number, VendorItemCountState>;

export function emptyVendorStock(): VendorStockMap {
  return new Map();
}

/** True when the vendor never tracks this line (infinite supply). */
export function isUnlimitedStock(def: VendorStockDef): boolean {
  return def.maxcount === 0;
}

// Items granted for one "buy N" action: BuyCount × count. CMaNGOS Player.cpp:17516 `totalCount =
// pProto->BuyCount * count`.
export function vendorBuyTotal(buyCount: number, count: number): number {
  const bc = buyCount > 0 ? buyCount : 1;
  const n = count > 0 ? count : 0;
  return bc * n;
}

// Current available stock after applying pending restock ticks, with `nowSec` as unix time. When
// fully restocked the tracking entry drops. Cite: Creature.cpp:2512 GetVendorItemCurrentCount.
export function getVendorItemCurrentCount(
  def: VendorStockDef,
  state: VendorItemCountState | undefined,
  nowSec: number,
): { available: number; state: VendorItemCountState | undefined } {
  if (isUnlimitedStock(def)) return { available: 0, state: undefined }; // C++ returns maxcount (0)

  if (!state) return { available: def.maxcount, state: undefined };

  let count = state.count;
  let last = state.lastIncrementTime;
  const buyCount = def.buyCount > 0 ? def.buyCount : 1;

  if (def.incrtime > 0 && last + def.incrtime <= nowSec) {
    const diff = Math.floor((nowSec - last) / def.incrtime);
    if (count + diff * buyCount >= def.maxcount) {
      // Fully restocked — erase tracker (Creature.cpp:2536–2537).
      return { available: def.maxcount, state: undefined };
    }
    count += diff * buyCount;
    last = nowSec;
  }

  return {
    available: count,
    state: { itemId: def.item, count, lastIncrementTime: last },
  };
}

// Apply a purchase of `usedCount` units, already BuyCount × player count. Unlimited stock is a
// no-op returning 0 remaining. Cite: Creature.cpp:2547 UpdateVendorItemCurrentCount.
export function updateVendorItemCurrentCount(
  def: VendorStockDef,
  state: VendorItemCountState | undefined,
  usedCount: number,
  nowSec: number,
): { remaining: number; state: VendorItemCountState | undefined } {
  if (isUnlimitedStock(def)) return { remaining: 0, state: undefined };

  const buyCount = def.buyCount > 0 ? def.buyCount : 1;
  let count: number;
  let last: number;

  if (!state) {
    count = def.maxcount > usedCount ? def.maxcount - usedCount : 0;
    last = nowSec;
  } else {
    count = state.count;
    last = state.lastIncrementTime;
    if (def.incrtime > 0 && last + def.incrtime <= nowSec) {
      const diff = Math.floor((nowSec - last) / def.incrtime);
      if (count + diff * buyCount < def.maxcount) count += diff * buyCount;
      else count = def.maxcount;
    }
    count = count > usedCount ? count - usedCount : 0;
    last = nowSec;
  }

  return {
    remaining: count,
    state: { itemId: def.item, count, lastIncrementTime: last },
  };
}

export interface VendorStockCheck {
  ok: boolean;
  reason?: string;
  /** Total item units that would leave the vendor (BuyCount × count). */
  totalCount: number;
  available: number;
}

// Whether the player can buy `count` vendor "stacks" given limited stock. Does not check gold/bags —
// compose with trading.canBuy.
export function canBuyWithStock(
  def: VendorStockDef,
  state: VendorItemCountState | undefined,
  count: number,
  nowSec: number,
): VendorStockCheck {
  if (count < 1) return { ok: false, reason: 'Invalid quantity', totalCount: 0, available: 0 };
  const totalCount = vendorBuyTotal(def.buyCount, count);
  if (isUnlimitedStock(def)) {
    return { ok: true, totalCount, available: Number.POSITIVE_INFINITY };
  }
  const { available } = getVendorItemCurrentCount(def, state, nowSec);
  if (available < totalCount) {
    return { ok: false, reason: 'Item already sold out', totalCount, available };
  }
  return { ok: true, totalCount, available };
}

/** Put an updated tracker into a stock map (drop entry when fully restocked / unlimited). */
export function setVendorStockEntry(
  map: VendorStockMap,
  itemId: number,
  state: VendorItemCountState | undefined,
): VendorStockMap {
  const next = new Map(map);
  if (!state) next.delete(itemId);
  else next.set(itemId, state);
  return next;
}
