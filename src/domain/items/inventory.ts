// Inventory is plain serializable data; all ops are pure and return a new value. A stack IS an
// ItemInstance, and one with no identity fields is just { item, count } and stacks freely.

import { ITEM_BONDING } from './itemBonding.ts';
import type { ItemDef } from '../../data/schema.ts';
import type { ItemInstance } from './itemInstance.ts';
import { hasIdentity, instancesStackable, copyInstance } from './itemInstance.ts';
import { isExpendableCastItem, isPermanentCastItem, maxChargesOf, NO_CHARGES_REMAIN } from './itemInstance.ts';

// The charge RULES live with ItemInstance.charges; re-exported so a caller that spends one needs a
// single import. Cite: itemInstance.ts spellcharges_1; Spell.cpp:4209 TakeCastItem.
export {
  castItemSurvivesUse,
  hasChargesLeft,
  isExpendableCastItem,
  maxChargesOf,
  NO_CHARGES_REMAIN,
} from './itemInstance.ts';

/** Default backpack size (WoW's starting 16-slot pack). Equipped gear is not in here. */
export const BACKPACK_SLOTS = 16;

/** ITEM_CLASS_CONSUMABLE (ItemPrototype.h). Wrapping papers are class 0. */
export const ITEM_CLASS_CONSUMABLE = 0;
// ITEM_SUBCLASS_CONSUMABLE_OTHER — classic wrapping papers are class 0 subclass 8. Cite: ItemPrototype.h;
// docs/archive/MASTER-ROADMAP.md FI9.
export const ITEM_SUBCLASS_CONSUMABLE_OTHER = 8;

// Paper entry → gift shell entry, from baked item_template pairs (src/data/tables, read-only). Not every
// paper row is listed (PT/test stubs omitted); name fallback covers fixtures.
export const WRAPPING_PAPER_TO_GIFT: Readonly<Record<number, number>> = {
  5042: 5043,   // Red Ribboned Wrapping Paper → Red Ribboned Gift
  5048: 5044,   // Blue Ribboned Wrapping Paper → Blue Ribboned Gift
  5047: 5045,   // Skull Wrapping Paper → Skull Gift
  17303: 17302, // Blue Ribboned Wrapping Paper → Blue Ribboned Holiday Gift
  17304: 17305, // Green Ribboned Wrapping Paper → Green Ribboned Holiday Gift
  17307: 17308, // Purple Ribboned Wrapping Paper → Purple Ribboned Holiday Gift
};

// An inventory stack is an item instance (Wave Q P1). Re-exported so the many callers that import
// `ItemStack` keep working; new code may use `ItemInstance` directly (same type).
export type ItemStack = ItemInstance;
export type { ItemInstance };

export interface Inventory {
  stacks: ItemStack[];
}

export function emptyInventory(): Inventory {
  return { stacks: [] };
}

/** Slots currently occupied (one per stack). */
export function usedSlots(inv: Inventory): number {
  return inv.stacks.length;
}

/** Free slots remaining under a capacity (never negative). */
export function freeSlots(inv: Inventory, cap: number = BACKPACK_SLOTS): number {
  return Math.max(0, cap - inv.stacks.length);
}

/** Two stacks may merge only when entry + every instance identity field match. */
function stackMergeKeyEqual(a: ItemStack, b: ItemStack): boolean {
  return instancesStackable(a, b);
}

// Would adding `count` of `item` fit within `cap` stacks? Fills existing partial stacks first, then needs a
// free slot per remaining `maxStack` worth. Plain stacks only (no instance fields on the added quantity).
export function canFit(inv: Inventory, item: number, count: number, maxStack: number, cap: number = BACKPACK_SLOTS): boolean {
  const capStack = Math.max(1, maxStack);
  let remaining = count;
  for (const s of inv.stacks) {
    // Only merge into plain stacks of the same entry (any instance identity blocks merge).
    if (s.item === item && s.count < capStack && !hasIdentity(s)) {
      remaining -= capStack - s.count;
    }
    if (remaining <= 0) return true;
  }
  return Math.ceil(remaining / capStack) <= freeSlots(inv, cap);
}

// canFit for a specific instance, merging only where addInstance would: an identity-bearing
// instance needs its own slot instead of counting a plain stack of the same entry as room.
export function canFitInstance(inv: Inventory, inst: ItemStack, maxStack: number, cap: number = BACKPACK_SLOTS): boolean {
  const capStack = Math.max(1, maxStack);
  let remaining = inst.count;
  for (const s of inv.stacks) {
    if (s.count < capStack && instancesStackable(s, inst)) remaining -= capStack - s.count;
    if (remaining <= 0) return true;
  }
  return Math.ceil(remaining / capStack) <= freeSlots(inv, cap);
}

function clone(inv: Inventory): Inventory {
  return { stacks: inv.stacks.map((s) => ({ ...s })) };
}

export function countItem(inv: Inventory, item: number): number {
  return inv.stacks.reduce((n, s) => (s.item === item ? n + s.count : n), 0);
}

/** Add `count` of an item, filling existing stacks up to `maxStack` first. */
export function addItem(inv: Inventory, item: number, count: number, maxStack: number): Inventory {
  const out = clone(inv);
  let remaining = count;
  const cap = Math.max(1, maxStack);
  for (const s of out.stacks) {
    // Keep stackable non-instance mats merging; never dump into an identity-bearing stack.
    if (s.item === item && s.count < cap && !hasIdentity(s)) {
      const room = cap - s.count;
      const put = Math.min(room, remaining);
      s.count += put;
      remaining -= put;
      if (remaining <= 0) return out;
    }
  }
  while (remaining > 0) {
    const put = Math.min(cap, remaining);
    out.stacks.push({ item, count: put });
    remaining -= put;
  }
  return out;
}

// Move up to `qty` of `item` from `from` into `to`, keeping each stack's identity (suffix / bind /
// enchant). Entry-only addItem/removeItem drops those fields.
export function transferItem(
  from: Inventory,
  to: Inventory,
  item: number,
  qty: number,
  maxStack: number,
  toCap: number,
): { from: Inventory; to: Inventory; moved: number } {
  const n = Math.min(Math.max(0, qty), countItem(from, item));
  if (n <= 0) return { from, to, moved: 0 };
  let src = from;
  let dst = to;
  let left = n;
  while (left > 0) {
    const idx = src.stacks.findIndex((s) => s.item === item);
    if (idx < 0) break;
    const take = Math.min(left, src.stacks[idx]!.count);
    // canFit assumes a plain stack can merge; identity stacks occupy a new slot.
    const preview = copyInstance(src.stacks[idx]!, take);
    if (!canFitInstance(dst, preview, maxStack, toCap)) break;
    const [next, taken] = takeStack(src, idx, take);
    if (!taken) break;
    src = next;
    dst = addInstance(dst, taken, maxStack);
    left -= taken.count;
  }
  return { from: src, to: dst, moved: n - left };
}

/** Most recently bagged suffix on `item` (takeDrop appends / merges at the end). */
export function latestRandomPropertyId(inv: Inventory, item: number): number | undefined {
  for (let i = inv.stacks.length - 1; i >= 0; i--) {
    const s = inv.stacks[i]!;
    if (s.item === item && s.randomPropertyId != null && s.randomPropertyId > 0) {
      return s.randomPropertyId;
    }
  }
  return undefined;
}

// Add a specific item instance, preserving identity. One with no identity merges into a matching
// plain stack like addItem; an identity-bearing one merges only with the same identity.
export function addInstance(inv: Inventory, inst: ItemInstance, maxStack: number): Inventory {
  const out = clone(inv);
  const cap = Math.max(1, maxStack);
  let remaining = inst.count;
  // Merge into an existing stack with an identical merge key (plain-into-plain, or same-identity).
  for (const s of out.stacks) {
    if (s.count < cap && instancesStackable(s, inst)) {
      const room = cap - s.count;
      const put = Math.min(room, remaining);
      s.count += put;
      remaining -= put;
      if (remaining <= 0) return out;
    }
  }
  while (remaining > 0) {
    const put = Math.min(cap, remaining);
    out.stacks.push(copyInstance(inst, put));
    remaining -= put;
  }
  return out;
}

// Remove up to `count` from the stack at `index`, returning the taken instance with its full
// identity so it can be re-homed. Splices when emptied; null on a bad index or nothing taken.
export function takeStack(inv: Inventory, index: number, count: number): [Inventory, ItemInstance | null] {
  const out = clone(inv);
  if (index < 0 || index >= out.stacks.length) return [out, null];
  const s = out.stacks[index]!;
  const take = Math.min(s.count, count > 0 ? count : 0);
  if (take <= 0) return [out, null];
  const taken = copyInstance(s, take);
  s.count -= take;
  if (s.count <= 0) out.stacks.splice(index, 1);
  return [out, taken];
}

// True when `index` is a finite non-negative integer usable as a bag slot. Rejects NaN and
// Infinity, which pass loose comparisons and become sparse array keys.
export function isValidBagSlotIndex(index: number): boolean {
  return Number.isInteger(index) && index >= 0;
}

// Reorder within the compact bag: array order IS slot order. Past the last item appends, a matching
// stackable MERGES, a different item SWAPS. Optional qty splits. Indices must be finite integers.
export function moveStack(inv: Inventory, from: number, to: number, maxStack: number, qty?: number): Inventory {
  const out = clone(inv);
  const n = out.stacks.length;
  // Number.isInteger rejects NaN, ±Infinity, and floats. Negative integers still rejected.
  if (!isValidBagSlotIndex(from) || !isValidBagSlotIndex(to) || from >= n || from === to) {
    return out;
  }
  const src = out.stacks[from]!;
  // qty omitted → whole stack; caller validates positive integer when provided.
  const want = qty != null ? Math.min(Math.max(0, qty), src.count) : src.count;
  if (want <= 0) return out;
  const fullMove = want >= src.count;

  if (to >= n) {
    if (fullMove) {
      // Dropped on empty space: pull whole stack out and append last.
      out.stacks.splice(from, 1);
      out.stacks.push(src);
    } else {
      // Split: leave remainder at from, append a new stack of `want`.
      const split = copyInstance(src, want);
      src.count -= want;
      out.stacks.push(split);
    }
    return out;
  }
  const dst = out.stacks[to]!;
  const cap = Math.max(1, maxStack);
  if (stackMergeKeyEqual(dst, src) && cap > 1 && dst.count < cap) {
    const room = cap - dst.count;
    const moved = Math.min(room, want);
    dst.count += moved;
    src.count -= moved;
    if (src.count <= 0) out.stacks.splice(from, 1);
    return out;
  }
  // Different items / instance keys (or a full/non-stackable target): swap only full stacks.
  if (!fullMove) return out;
  out.stacks[from] = dst;
  out.stacks[to] = src;
  return out;
}

/** Remove up to `count`; returns [newInventory, removedCount]. */
export function removeItem(inv: Inventory, item: number, count: number): [Inventory, number] {
  const out = clone(inv);
  let toRemove = count;
  for (const s of out.stacks) {
    if (s.item === item && toRemove > 0) {
      const take = Math.min(s.count, toRemove);
      s.count -= take;
      toRemove -= take;
    }
  }
  out.stacks = out.stacks.filter((s) => s.count > 0);
  return [out, count - toRemove];
}

// Remove up to `count` from the single stack at `index` (array position == slot). Returns [newInventory,
// removedCount]. Splices the slot if emptied. Pure.
export function removeStack(inv: Inventory, index: number, count: number): [Inventory, number] {
  const out = clone(inv);
  if (index < 0 || index >= out.stacks.length) return [out, 0];
  const s = out.stacks[index];
  const take = Math.min(s.count, count > 0 ? count : 0);
  s.count -= take;
  if (s.count <= 0) {
    out.stacks.splice(index, 1);
  }
  return [out, take];
}

/** SCRIPT_COMMAND_CREATE_ITEM (17) record. Cite: ScriptMgr.cpp:2220-2235. */
export type CreatedItemApply = {
  itemEntry: number;
  amount: number;
  destroyed?: boolean;
};

// Apply dbscript CREATE_ITEM records to bags — the one applier every host shares. Full bags skip the grant,
// as StoreNewItemInInventorySlot returns null.
export function applyCreatedItems(
  inv: Inventory,
  records: readonly CreatedItemApply[] | undefined,
  itemOf: (entry: number) => { stackable?: number } | undefined,
  cap: number,
): Inventory {
  let out = inv;
  for (const rec of records ?? []) {
    const item = rec.itemEntry | 0;
    const amount = rec.amount | 0;
    if (item <= 0 || amount <= 0) continue;
    if (rec.destroyed) {
      out = removeItem(out, item, amount)[0];
      continue;
    }
    const maxStack = itemOf(item)?.stackable ?? 1;
    if (!canFit(out, item, amount, maxStack, cap)) continue;
    out = addItem(out, item, amount, maxStack);
  }
  return out;
}

// ---- FI9 gift wrap / unwrap -------------------------------------------------

/** Minimal item surface for wrap detection (ItemDef or test fixture). */
export type WrapItemDef = {
  entry?: number;
  name?: string;
  itemClass?: number;
  itemSubclass?: number;
  questItem?: boolean;
  binding?: number;
};

// Detect wrapping paper: the name must end "Wrapping Paper", and where class is baked it must be
// a consumable. Classic dump papers are subclass 0, not the TBC "Other" 8.
export function isWrappingPaper(def: WrapItemDef | null | undefined): boolean {
  if (!def) return false;
  const name = def.name ?? '';
  if (!/Wrapping Paper/i.test(name)) return false;
  if (def.itemClass != null) {
    if (def.itemClass !== ITEM_CLASS_CONSUMABLE) return false;
    if (def.itemSubclass == null) return true;
    return def.itemSubclass === 0
      || def.itemSubclass === ITEM_SUBCLASS_CONSUMABLE_OTHER;
  }
  // Schema fields absent (pre-class bake): name is authoritative for papers.
  return true;
}

/** Stack is a filled gift carrying an original entry. */
export function isFilledGift(stack: ItemStack | null | undefined): boolean {
  return stack != null
    && stack.wrappedItemEntry != null
    && stack.wrappedItemEntry > 0;
}

// Invalid wrap targets: another wrapping paper, an already-wrapped gift, a quest item, or an
// empty slot.
export function canWrapTarget(
  targetDef: WrapItemDef | null | undefined,
  targetStack: ItemStack | null | undefined,
): { ok: true } | { ok: false; reason: string } {
  if (!targetStack || targetStack.count < 1) {
    return { ok: false, reason: 'Select an item to wrap' };
  }
  if (isFilledGift(targetStack)) {
    return { ok: false, reason: 'That item is already wrapped' };
  }
  if (!targetDef) {
    return { ok: false, reason: 'Unknown item' };
  }
  if (isWrappingPaper(targetDef)) {
    return { ok: false, reason: 'You cannot wrap wrapping paper' };
  }
  if (targetDef.questItem) {
    return { ok: false, reason: 'You cannot wrap quest items' };
  }
  const b = targetDef.binding ?? ITEM_BONDING.NO_BIND;
  if (b === ITEM_BONDING.BIND_QUEST_ITEM || b === ITEM_BONDING.BIND_QUEST_ITEM1) {
    return { ok: false, reason: 'You cannot wrap quest items' };
  }
  return { ok: true };
}

// Bind-on-wrap (vanilla): BoP items become bound when wrapped; already-bound stays bound. BoE does not bind
// until equip — wrap leaves it unbound so it can still be gifted.
export function shouldBindOnWrap(
  bonding: number | undefined,
  alreadyBound: boolean,
): boolean {
  if (alreadyBound) return true;
  const b = bonding ?? ITEM_BONDING.NO_BIND;
  return b === ITEM_BONDING.BIND_WHEN_PICKED_UP;
}

// Resolve the gift shell entry for a wrapping paper: the baked paper→gift map first, then the
// name transform "X Wrapping Paper" → "X Gift" or "X Holiday Gift".
export function resolveGiftEntryForPaper(
  paperEntry: number,
  paperName: string,
  lookupEntryByName?: (name: string) => number | undefined,
): number | undefined {
  const mapped = WRAPPING_PAPER_TO_GIFT[paperEntry];
  if (mapped != null) return mapped;
  if (!lookupEntryByName) return undefined;
  const base = paperName.replace(/\s*Wrapping Paper\s*$/i, '').trim();
  if (!base) return undefined;
  return lookupEntryByName(`${base} Gift`)
    ?? lookupEntryByName(`${base} Holiday Gift`);
}

export type WrapResult =
  | { ok: true; inventory: Inventory; giftEntry: number; wrappedEntry: number; bound: boolean }
  | { ok: false; reason: string };

// Consume 1 wrapping paper + 1 target unit; append a gift shell stack that references the original entry.
// Pure. Caller validates paper/target legality and supplies the resolved gift shell entry + bind flag.
export function wrapItem(
  inv: Inventory,
  paperIndex: number,
  targetIndex: number,
  giftEntry: number,
  bind: boolean,
): WrapResult {
  if (giftEntry <= 0) return { ok: false, reason: 'Unknown gift type' };
  if (paperIndex < 0 || paperIndex >= inv.stacks.length) {
    return { ok: false, reason: 'No wrapping paper' };
  }
  if (targetIndex < 0 || targetIndex >= inv.stacks.length) {
    return { ok: false, reason: 'Select an item to wrap' };
  }
  if (paperIndex === targetIndex) {
    return { ok: false, reason: 'Select a different item to wrap' };
  }

  const out = clone(inv);
  const paper = out.stacks[paperIndex]!;
  const target = out.stacks[targetIndex]!;
  if (paper.count < 1) return { ok: false, reason: 'No wrapping paper' };
  if (target.count < 1) return { ok: false, reason: 'Select an item to wrap' };
  if (isFilledGift(target)) return { ok: false, reason: 'That item is already wrapped' };

  const wrappedEntry = target.item;
  const bound = bind || !!target.bound;

  paper.count -= 1;
  target.count -= 1;

  // Splice emptied slots high-to-low so indices stay valid.
  const drop: number[] = [];
  if (paper.count <= 0) drop.push(paperIndex);
  if (target.count <= 0) drop.push(targetIndex);
  drop.sort((a, b) => b - a);
  for (const i of drop) out.stacks.splice(i, 1);

  const gift: ItemStack = { item: giftEntry, count: 1, wrappedItemEntry: wrappedEntry };
  if (bound) gift.bound = true;
  out.stacks.push(gift);

  return { ok: true, inventory: out, giftEntry, wrappedEntry, bound };
}

export type UnwrapResult =
  | { ok: true; inventory: Inventory; restoredEntry: number; bound: boolean }
  | { ok: false; reason: string };

// Open a filled gift stack: remove the gift shell, restore the original entry (preserving bound). Pure.
// Caller plays `unwrap` SFX on success.
export function unwrapItem(inv: Inventory, giftIndex: number): UnwrapResult {
  if (giftIndex < 0 || giftIndex >= inv.stacks.length) {
    return { ok: false, reason: 'Nothing to unwrap' };
  }
  const out = clone(inv);
  const gift = out.stacks[giftIndex]!;
  const original = gift.wrappedItemEntry;
  if (original == null || original <= 0 || gift.count < 1) {
    return { ok: false, reason: 'This gift is empty' };
  }
  const bound = !!gift.bound;

  gift.count -= 1;
  if (gift.count <= 0) out.stacks.splice(giftIndex, 1);

  const restored: ItemStack = { item: original, count: 1 };
  if (bound) restored.bound = true;
  out.stacks.push(restored);

  return { ok: true, inventory: out, restoredEntry: original, bound };
}

// ── spending a CHARGE rather than a unit ─────────────────────────────────────────────────────────
export type ConsumeChargesResult =
  | { ok: true; inventory: Inventory }
  | { ok: false; reason: string };

// Spend one use from bags: an unlimited item is untouched, a charged one decrements its instance
// counter, and only a NEGATIVE row loses the unit at zero. Cite: Spell.cpp:4209 TakeCastItem.
export function consumeItemCharges(
  inv: Inventory,
  itemEntry: number,
  it: ItemDef | null | undefined,
): ConsumeChargesResult {
  const stacks = inv.stacks ?? [];
  const idx = stacks.findIndex((s) => s.item === itemEntry);
  if (idx < 0) return { ok: false, reason: "You don't have that" };

  // Unlimited tool: the use succeeds and the item stays in the bag untouched.
  if (isPermanentCastItem(it)) return { ok: true, inventory: inv };

  const max = maxChargesOf(it);
  const expendable = isExpendableCastItem(it);

  if (max <= 1) {
    if (!expendable) return { ok: true, inventory: inv };
    // Single-use and expendable: drop one unit from the first matching stack.
    const out = { stacks: stacks.map((s) => ({ ...s })) };
    const s = out.stacks[idx]!;
    if (s.count > 1) out.stacks[idx] = { ...s, count: s.count - 1 };
    else out.stacks.splice(idx, 1);
    return { ok: true, inventory: out };
  }

  // Multi-charge: work on the instance.charges counter, which is the REMAINING count.
  const out = { stacks: stacks.map((s) => copyInstance(s, s.count)) };
  const s = out.stacks[idx]!;
  const remaining = s.charges != null ? s.charges : max;
  if (remaining <= 0) return { ok: false, reason: NO_CHARGES_REMAIN };

  if (remaining <= 1 && expendable) {
    // Last charge on a negative row — this unit is destroyed.
    if (s.count > 1) {
      out.stacks[idx] = copyInstance({ item: itemEntry, count: s.count - 1 }, s.count - 1);
    } else {
      out.stacks.splice(idx, 1);
    }
    return { ok: true, inventory: out };
  }

  // Decrement and keep the unit: every positive row, and every negative row above its last charge.
  const next: ItemInstance = { ...s, charges: remaining - 1, count: 1 };
  if (s.count > 1) {
    out.stacks[idx] = copyInstance({ item: itemEntry, count: s.count - 1 }, s.count - 1);
    out.stacks.push(next);
  } else {
    out.stacks[idx] = next;
  }
  void hasIdentity(next);
  return { ok: true, inventory: out };
}

// Spend one use from bags, then the keyring. No-op for unlimited tools (charges === 0).
// Cite: Spell.cpp:4209 TakeCastItem; domain/world/openLock.ts isExpendableLockKeyItem.
export function consumeOwnedCharges(
  bags: Inventory,
  keyring: Inventory | undefined,
  itemEntry: number,
  it: ItemDef | null | undefined,
): { bags: Inventory; keyring: Inventory } {
  const keys = keyring ?? { stacks: [] };
  if (isPermanentCastItem(it)) return { bags, keyring: keys };
  const fromBags = consumeItemCharges(bags, itemEntry, it);
  if (fromBags.ok) return { bags: fromBags.inventory, keyring: keys };
  const fromKeys = consumeItemCharges(keys, itemEntry, it);
  if (fromKeys.ok) return { bags, keyring: fromKeys.inventory };
  return { bags, keyring: keys };
}
