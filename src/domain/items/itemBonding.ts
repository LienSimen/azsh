// Item soulbind rules. Cite: ItemPrototype.h ItemBondingType ~55–62; Player.cpp StoreItem bind
// paths ~9934; Item.h IsSoulBound ITEM_DYNFLAG_BINDED. Pure: no I/O.

/** ItemBondingType (ItemPrototype.h). */
export const ITEM_BONDING = {
  NO_BIND: 0,
  BIND_WHEN_PICKED_UP: 1, // BoP
  BIND_WHEN_EQUIPPED: 2,  // BoE
  BIND_WHEN_USE: 3,       // BoU
  BIND_QUEST_ITEM: 4,
  BIND_QUEST_ITEM1: 5,    // unused in game
} as const;

export type ItemBondingType = (typeof ITEM_BONDING)[keyof typeof ITEM_BONDING];

/** Event that may trigger soulbind. */
export type BindTrigger = 'loot' | 'equip' | 'use';

// Whether this trigger should set the soulbound flag on an unbound item. Already-bound items stay bound
// (no-op).
export function shouldBindOnTrigger(
  bonding: number | undefined,
  trigger: BindTrigger,
  alreadyBound: boolean,
): boolean {
  if (alreadyBound) return false;
  const b = bonding ?? ITEM_BONDING.NO_BIND;
  if (b === ITEM_BONDING.NO_BIND) return false;
  if (b === ITEM_BONDING.BIND_WHEN_PICKED_UP || b === ITEM_BONDING.BIND_QUEST_ITEM || b === ITEM_BONDING.BIND_QUEST_ITEM1) {
    return trigger === 'loot';
  }
  if (b === ITEM_BONDING.BIND_WHEN_EQUIPPED) return trigger === 'equip';
  if (b === ITEM_BONDING.BIND_WHEN_USE) return trigger === 'use';
  return false;
}

/** Apply bind: returns new bound flag. Cite: Player store / equip / use paths set ITEM_DYNFLAG_BINDED. */
export function applyBind(
  bonding: number | undefined,
  trigger: BindTrigger,
  bound: boolean,
): boolean {
  return bound || shouldBindOnTrigger(bonding, trigger, bound);
}

// Set bound: true on an instance when the trigger says so. Already-bound instances and
// non-matching triggers return it unchanged. Rides the existing ItemInstance.bound field.
export function applyBindToInstance<T extends { bound?: boolean }>(
  inst: T,
  bonding: number | undefined,
  trigger: BindTrigger,
): T {
  if (!shouldBindOnTrigger(bonding, trigger, !!inst.bound)) return inst;
  return { ...inst, bound: true };
}

/** Prefer baked `bonding`, fall back to legacy `binding`. */
export function resolveBonding(
  def: { bonding?: number; binding?: number } | null | undefined,
): number | undefined {
  if (!def) return undefined;
  return def.bonding ?? def.binding;
}

/** Soulbound items cannot be traded/mailed/auctioned (ItemHandler checks). */
export function canTradeItem(bound: boolean): boolean {
  return !bound;
}

// Conjured item — the bake carries ITEM_FLAG_CONJURED as `conjured`; name rules are a
// transitional fallback for old fixtures. Conjured items may be taken BACK from a bot's bags.
export function isConjuredItem(
  it: { conjured?: boolean; name?: string } | undefined | null,
): boolean {
  if (it?.conjured === true) return true;
  // Transitional name fallback for fixtures without the flag (prefer updating fixtures).
  const n = it?.name ?? '';
  return /^Conjured /.test(n)
    || / Healthstone$|^Healthstone$/.test(n)
    || / Soulstone$|^Soulstone$/.test(n)
    || /^Mana (Agate|Jade|Citrine|Ruby)$/.test(n);
}

export function bondingLabel(bonding: number | undefined): string {
  switch (bonding) {
    case ITEM_BONDING.BIND_WHEN_PICKED_UP: return 'Binds when picked up';
    case ITEM_BONDING.BIND_WHEN_EQUIPPED: return 'Binds when equipped';
    case ITEM_BONDING.BIND_WHEN_USE: return 'Binds when used';
    case ITEM_BONDING.BIND_QUEST_ITEM:
    case ITEM_BONDING.BIND_QUEST_ITEM1: return 'Quest Item';
    default: return '';
  }
}
