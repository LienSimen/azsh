// Vendor Multi sell: pick quality colours, then the stacks (ItemHandler.cpp:539 / :545-556).
// Confirm starts Never-sell categories off — listed, not hidden (appInteractBulkBags.ts:34-66).

import type { DataStore } from '../../data/dataStore.ts';
import type { Inventory } from '../items/inventory.ts';
import type { JunkQuality } from '../items/junkFilter.ts';
import {
  DEFAULT_PROTECT_CATEGORIES,
  JUNK_PROTECT_CATEGORIES,
  itemProtectCategory,
  junkProtectCategoryLabel,
  protectLookupFor,
  type JunkProtectCategory,
} from '../items/junkCategories.ts';
import { sellCopperChargeRatio } from './trading.ts';

/** The five colours the picker offers. Cite: SharedDefines.h:250. */
export const SELL_ALL_TIERS: ReadonlyArray<{ quality: JunkQuality; colour: string }> = [
  { quality: 0, colour: 'Gray' },
  { quality: 1, colour: 'White' },
  { quality: 2, colour: 'Green' },
  { quality: 3, colour: 'Blue' },
  { quality: 4, colour: 'Purple' },
];

export type SellAllQualityMap = Record<JunkQuality, boolean>;

/** What the confirm list's filter buttons slice by: a never-sell box, gear, or the rest. */
export type SellAllFilter = JunkProtectCategory | 'gear' | 'other';

const SELL_ALL_FILTERS = new Set<string>([...JUNK_PROTECT_CATEGORIES.map((c) => c.id), 'gear', 'other']);

/** A dataset string off a filter button, or null when it names no filter. */
export function asSellAllFilter(raw: string | undefined | null): SellAllFilter | null {
  return raw != null && SELL_ALL_FILTERS.has(raw) ? (raw as SellAllFilter) : null;
}

export function sellAllFilterLabel(id: SellAllFilter): string {
  if (id === 'gear') return 'Gear';
  if (id === 'other') return 'Everything else';
  return junkProtectCategoryLabel(id);
}

export interface VendorSellAllRow {
  /** Bag slot index — the row IS this stack. */
  slot: number;
  /** Companion whose bags hold it. Absent = your own bags. */
  owner?: string;
  ownerName?: string;
  entry: number;
  qty: number;
  quality: JunkQuality;
  /** What the vendor pays for the whole stack, charge ratio included. */
  copper: number;
  /** Rolled suffix on this stack, so the confirm list names what it is about to sell. */
  randomPropertyId?: number;
  /** Never-sell category this stack belongs to, if any. Confirm starts these off. */
  protectCategory?: JunkProtectCategory;
  /** Which filter button owns this row. The category the item IS, even when a guard released it. */
  filter: SellAllFilter;
  /** Why this row starts switched OFF beyond a category (still an upgrade). Absent = on. */
  warn?: string;
  /** Sub-line for a row that is ON — why a guard let it through. */
  note?: string;
}

export interface VendorSellAllPlan {
  rows: VendorSellAllRow[];
  /** Stacks no vendor will buy at all (SellPrice 0). */
  noValue: number;
}

export interface PlanVendorSellAllGuards {
  /** Entries findUpgrades still wants on you or a companion — listed, but off by default. */
  upgradeEntries?: ReadonlySet<number>;
  // Teach items the whole group has already read (learnAllRecipes.ts knownTeachEntries). The
  // "Recipes, formulas and books" box cannot protect these: no reader is left to want them.
  knownTeachEntries?: ReadonlySet<number>;
  // Teach items no body in the group has the profession or class for (learnAllRecipes.ts
  // unlearnableTeachEntries). Same box, same reason: no reader is coming.
  unlearnableTeachEntries?: ReadonlySet<number>;
  // Food and drink ranks the bags have outgrown (staleConsumables.ts outdatedFoodDrinkEntries).
  // The "Food and drink" box still guards the best rank carried — this is what sits under it.
  outdatedFoodEntries?: ReadonlySet<number>;
  // Bags and quivers nobody would wear (spareContainers.ts spareContainerEntries): no bigger than
  // what is already on, and not an upgrade for anyone.
  spareContainerEntries?: ReadonlySet<number>;
  /** Companion these bags belong to. Stamped on every row so the run knows whose stack to sell. */
  owner?: { id: string; name: string };
}

// Why a never-sell box let this row through, or null when the box still owns it. Each answer is a
// dead end the guard cannot come back from: the book has no reader, the rank has been outgrown, the
// bag has nowhere to go. The row is still one click from being kept.
function releaseNote(
  cat: JunkProtectCategory | null,
  entry: number,
  guards?: PlanVendorSellAllGuards,
): string | null {
  if (cat == null || !guards) return null;
  if (cat === 'teaches') {
    if (guards.knownTeachEntries?.has(entry)) return 'Already known';
    if (guards.unlearnableTeachEntries?.has(entry)) return 'Nobody can learn it';
    return null;
  }
  if (cat === 'foodDrink') {
    return guards.outdatedFoodEntries?.has(entry) ? 'Outgrown rank' : null;
  }
  if (cat === 'container' || cat === 'quiver') {
    return guards.spareContainerEntries?.has(entry) ? 'Not an upgrade' : null;
  }
  return null;
}

/** Rows for every colour — the picker filters them, the confirm list toggles them. */
export function planVendorSellAll(
  inventory: Inventory,
  ds: DataStore,
  guards?: PlanVendorSellAllGuards,
): VendorSellAllPlan {
  const rows: VendorSellAllRow[] = [];
  let noValue = 0;
  const look = protectLookupFor(ds);

  inventory.stacks.forEach((stk, slot) => {
    const it = ds.item(stk.item);
    if (!it) return;
    const q = (it.quality ?? 0) as number;
    // Legendary and artifact have no checkbox: they leave through the single Sell button.
    if (q < 0 || q > 4) return;
    if (!(it.sellPrice > 0)) { noValue++; return; }
    const raw = itemProtectCategory(it, look);
    const released = releaseNote(raw, it.entry, guards);
    const cat = released ? null : raw;
    const warn = guards?.upgradeEntries?.has(it.entry) ? 'Still an upgrade' : undefined;
    rows.push({
      slot,
      entry: it.entry,
      qty: stk.count,
      quality: q as JunkQuality,
      copper: sellCopperChargeRatio(it, stk.count, stk.charges),
      filter: raw ?? (it.slot != null ? 'gear' : 'other'),
      ...(stk.randomPropertyId != null && stk.randomPropertyId > 0
        ? { randomPropertyId: stk.randomPropertyId }
        : {}),
      ...(cat ? { protectCategory: cat } : {}),
      ...(warn ? { warn } : {}),
      ...(released ? { note: released } : {}),
      ...(guards?.owner ? { owner: guards.owner.id, ownerName: guards.owner.name } : {}),
    });
  });

  return { rows, noValue };
}

/** Rows whose colour the player ticked. */
export function sellAllRowsForQualities(
  rows: readonly VendorSellAllRow[],
  qualities: SellAllQualityMap,
): VendorSellAllRow[] {
  return rows.filter((r) => !!qualities[r.quality]);
}

export function sellAllRowKey(row: Pick<VendorSellAllRow, 'slot' | 'entry' | 'owner'>): string {
  return `${row.owner ?? ''}:${row.slot}:${row.entry}`;
}

// Confirm starts these off. Same boxes as Settings → Never sell or destroy, plus any row the
// upgrade guard flagged. Listed so a click still sells them.
export function defaultSellAllBlocked(
  rows: readonly VendorSellAllRow[],
  qualities: SellAllQualityMap,
  protect: readonly JunkProtectCategory[] = DEFAULT_PROTECT_CATEGORIES,
): string[] {
  const on = new Set(protect);
  const out: string[] = [];
  for (const r of sellAllRowsForQualities(rows, qualities)) {
    if (r.warn != null) { out.push(sellAllRowKey(r)); continue; }
    if (r.protectCategory != null && on.has(r.protectCategory)) out.push(sellAllRowKey(r));
  }
  return out;
}

/** Rows that will actually be sold: not switched off. */
export function activeSellAllRows(
  rows: readonly VendorSellAllRow[],
  blocked: ReadonlySet<string> | readonly string[],
): VendorSellAllRow[] {
  const off = blocked instanceof Set ? blocked : new Set(blocked);
  return rows.filter((r) => !off.has(sellAllRowKey(r)));
}

export function sellAllTotals(rows: readonly VendorSellAllRow[]): { count: number; copper: number } {
  let count = 0;
  let copper = 0;
  for (const r of rows) { count += r.qty; copper += r.copper; }
  return { count, copper };
}

// The item, not the stack: one click on a stack of Wool moves every stack of Wool. A rolled suffix
// is part of the identity, so "of the Bear" and "of the Eagle" stay two items.
export function sellAllStackKey(row: Pick<VendorSellAllRow, 'entry' | 'randomPropertyId'>): string {
  return `${row.entry}:${row.randomPropertyId ?? 0}`;
}

/** Row keys of every stack of the same item as `key`, among the rows shown. */
export function sellAllPeerKeys(rows: readonly VendorSellAllRow[], key: string): string[] {
  const row = rows.find((r) => sellAllRowKey(r) === key);
  if (!row) return [key];
  const stack = sellAllStackKey(row);
  return rows.filter((r) => sellAllStackKey(r) === stack).map((r) => sellAllRowKey(r));
}

export interface SellAllFilterGroup {
  id: SellAllFilter;
  label: string;
  /** Stacks in this group among the rows shown. */
  stacks: number;
  /** Items still switched on, and what they pay. */
  count: number;
  copper: number;
  /** False when every stack in the group is switched off. */
  on: boolean;
}

/** One button per kind of item in the list, in the Never sell display order. */
export function sellAllFilterGroups(
  rows: readonly VendorSellAllRow[],
  blocked: ReadonlySet<string> | readonly string[],
): SellAllFilterGroup[] {
  const off = blocked instanceof Set ? blocked : new Set(blocked);
  const order: SellAllFilter[] = [...JUNK_PROTECT_CATEGORIES.map((c) => c.id), 'gear', 'other'];
  const by = new Map<SellAllFilter, SellAllFilterGroup>();
  for (const r of rows) {
    let g = by.get(r.filter);
    if (!g) {
      g = { id: r.filter, label: sellAllFilterLabel(r.filter), stacks: 0, count: 0, copper: 0, on: false };
      by.set(r.filter, g);
    }
    g.stacks++;
    if (off.has(sellAllRowKey(r))) continue;
    g.on = true;
    g.count += r.qty;
    g.copper += r.copper;
  }
  return order.filter((id) => by.has(id)).map((id) => by.get(id) as SellAllFilterGroup);
}

/** Row keys of every stack a filter button owns. */
export function sellAllFilterKeys(rows: readonly VendorSellAllRow[], id: SellAllFilter): string[] {
  return rows.filter((r) => r.filter === id).map((r) => sellAllRowKey(r));
}
