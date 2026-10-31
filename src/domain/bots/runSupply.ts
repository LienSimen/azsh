// Pre-run food and water, pure domain: who is short, what the vendor ladder sells at their level, what
// it costs, whether it fits. A mage conjures both mid-run (liveFloorRecovery.ts conjureFor); no mage asks.

import type { DataStore } from '../../data/dataStore.ts';
import type { ItemDef } from '../../data/schema.ts';
import { CLASS } from '../../data/schema.ts';
import type { Character } from '../character/character.ts';
import { powerType } from '../character/character.ts';
import { addItem, canFit, type Inventory } from '../items/inventory.ts';
import { foodDrinkReqLevel } from '../items/staleConsumables.ts';
import { buyCostCopper } from '../economy/trading.ts';
import { unlimitedVendorFor } from '../professions/vendorReagents.ts';
import { vendorsSelling } from '../../world/world.ts';
import { listAutoConsumableOptions } from './autoConsumables.ts';
import { clampTarget, DEFAULT_RUN_SUPPLY_PREFS, type RunSupplyPrefs } from './runSupplyPrefs.ts';

export {
  clampTarget, DEFAULT_RUN_SUPPLY_PREFS, normalizeRunSupplyPrefs, RUN_SUPPLY_TARGET, type RunSupplyPrefs,
} from './runSupplyPrefs.ts';

export type SupplyKind = 'food' | 'drink';
export const SUPPLY_KINDS: readonly SupplyKind[] = ['drink', 'food'];

/** One party member as the check sees them: a body, its own bags, and the room those bags have. */
export interface SupplyMember {
  /** 'player', or the companion id. */
  id: string;
  name: string;
  char: Character;
  bags: Inventory;
  cap: number;
}

/** One vendor row on the ladder for a kind. */
export interface SupplyRung {
  item: ItemDef;
  reqLevel: number;
  vendorEntry: number;
  price: number;
  buyCount: number;
  vendors: number;
}

const ladderMemo = new WeakMap<DataStore, Map<string, SupplyRung[]>>();

// One vendor row per gate this race can buy, best gate first, the cheapest then most stocked inside a
// gate. Bandages bake as food and are not a meal (consumables.ts isOocFoodOrDrinkItem); a 1-unit row is pet food.
export function runSupplyLadder(ds: DataStore, race: number, kind: SupplyKind): SupplyRung[] {
  let memo = ladderMemo.get(ds);
  if (!memo) {
    memo = new Map();
    ladderMemo.set(ds, memo);
  }
  const key = `${race}:${kind}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const out: SupplyRung[] = [];
  for (const it of ds.items()) {
    const c = it.consumable;
    if (!c || c.effect !== kind || it.useBuff != null || it.conjured === true) continue;
    if (it.buyPrice <= 0 || (it.stackable ?? 1) <= 1) continue;
    const sp = it.useSpell != null ? ds.spell(it.useSpell) : undefined;
    if (sp?.mechanic === 'bandage') continue;
    const vendorEntry = unlimitedVendorFor(ds, it.entry, race);
    if (vendorEntry == null) continue;
    out.push({
      item: it,
      reqLevel: foodDrinkReqLevel(it),
      vendorEntry,
      price: it.buyPrice,
      buyCount: Math.max(1, it.buyCount ?? 1),
      vendors: vendorsSelling(ds, it.entry).length,
    });
  }
  out.sort((a, b) => b.reqLevel - a.reqLevel
    || a.price - b.price
    || b.vendors - a.vendors
    || a.item.entry - b.item.entry);
  // One rung per gate: "a rank down" is the next gate, never a sibling at the same price.
  const ladder = out.filter((r, i) => i === 0 || out[i - 1]!.reqLevel !== r.reqLevel);
  memo.set(key, ladder);
  return ladder;
}

export interface SupplyRow {
  memberId: string;
  memberName: string;
  kind: SupplyKind;
  /** Usable units of this kind already in their bags. */
  have: number;
  short: number;
  /** Rungs this member can use, best first; `rung` indexes it. */
  ladder: SupplyRung[];
  rung: number;
  item: number;
  purchases: number;
  units: number;
  cost: number;
  /** Units their bags take right now, after the rows before this one landed. */
  fitUnits: number;
  fitPurchases: number;
  fitCost: number;
}

export interface RunSupplyPlan {
  /** A mage is in the party: nothing to buy, the mage conjures both kinds mid-run. */
  mage: boolean;
  rows: SupplyRow[];
  cost: number;
  gold: number;
  /** Stepped down to the bottom rung and the purse is still short. */
  unaffordable: boolean;
  /** Members whose bags could not take every row. */
  full: { id: string; name: string }[];
}

export const supplyRowKey = (row: Pick<SupplyRow, 'memberId' | 'kind'>): string => `${row.memberId}:${row.kind}`;

export function partyHasMage(members: readonly Pick<SupplyMember, 'char'>[]): boolean {
  return members.some((m) => m.char.cls === CLASS.MAGE);
}

/** Usable units of one kind in a member's own bags, the same read the rest picks from. */
export function supplyHave(member: SupplyMember, kind: SupplyKind, ds: DataStore): number {
  let n = 0;
  for (const o of listAutoConsumableOptions(member.char, member.bags, ds)) {
    if (o.kind === kind) n += o.count;
  }
  return n;
}

function priceRow(row: SupplyRow): SupplyRow {
  const r = row.ladder[row.rung]!;
  const purchases = Math.ceil(row.short / r.buyCount);
  return {
    ...row,
    item: r.item.entry,
    purchases,
    units: purchases * r.buyCount,
    cost: buyCostCopper(r.item, purchases),
  };
}

const total = (rows: readonly SupplyRow[]): number => rows.reduce((s, r) => s + r.cost, 0);

// Every row opens on the best rung its member can use; while the purse is short, the dearest row
// that still has a cheaper rung below it steps down one. The bottom of every ladder is where it stops.
export function planRunSupply(args: {
  ds: DataStore;
  members: readonly SupplyMember[];
  gold: number;
  race: number;
  prefs?: RunSupplyPrefs;
}): RunSupplyPlan {
  const { ds, members, gold, race } = args;
  const prefs = args.prefs ?? DEFAULT_RUN_SUPPLY_PREFS;
  const target = clampTarget(prefs.target);
  const none: RunSupplyPlan = { mage: false, rows: [], cost: 0, gold, unaffordable: false, full: [] };
  if (partyHasMage(members)) return { ...none, mage: true };
  let rows: SupplyRow[] = [];
  for (const m of members) {
    for (const kind of SUPPLY_KINDS) {
      if (!prefs[kind]) continue;
      if (kind === 'drink' && powerType(m.char) !== 'mana') continue;
      const have = supplyHave(m, kind, ds);
      const short = target - have;
      if (short <= 0) continue;
      const ladder = runSupplyLadder(ds, race, kind).filter((r) => r.reqLevel <= m.char.level);
      if (!ladder.length) continue;
      rows.push(priceRow({
        memberId: m.id, memberName: m.name, kind, have, short, ladder, rung: 0,
        item: 0, purchases: 0, units: 0, cost: 0, fitUnits: 0, fitPurchases: 0, fitCost: 0,
      }));
    }
  }
  let unaffordable = false;
  while (total(rows) > gold) {
    let pick = -1;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      const next = r.ladder[r.rung + 1];
      if (!next || next.price >= r.ladder[r.rung]!.price) continue;
      if (pick < 0 || r.cost > rows[pick]!.cost) pick = i;
    }
    if (pick < 0) { unaffordable = true; break; }
    rows[pick] = priceRow({ ...rows[pick]!, rung: rows[pick]!.rung + 1 });
  }
  rows = fitRows(rows, members, ds);
  const full = members
    .filter((m) => rows.some((r) => r.memberId === m.id && r.fitUnits < r.units))
    .map((m) => ({ id: m.id, name: m.name }));
  return { mage: false, rows, cost: total(rows), gold, unaffordable, full };
}

/** How much of each row the member's bags take, rows landing in order on a copy of the bags. */
function fitRows(rows: readonly SupplyRow[], members: readonly SupplyMember[], ds: DataStore): SupplyRow[] {
  const working = new Map<string, Inventory>();
  const capOf = new Map(members.map((m) => [m.id, m.cap]));
  for (const m of members) working.set(m.id, m.bags);
  return rows.map((row) => {
    const rung = row.ladder[row.rung]!;
    const stack = Math.max(1, rung.item.stackable ?? 1);
    const inv = working.get(row.memberId) ?? { stacks: [] };
    const cap = capOf.get(row.memberId) ?? 0;
    let p = row.purchases;
    while (p > 0 && !canFit(inv, row.item, p * rung.buyCount, stack, cap)) p--;
    const fitUnits = p * rung.buyCount;
    if (fitUnits > 0) working.set(row.memberId, addItem(inv, row.item, fitUnits, stack));
    return { ...row, fitUnits, fitPurchases: p, fitCost: buyCostCopper(rung.item, p) };
  });
}

/** One purchase the engine lands: `units` of `item` into this member's bags for `cost`. */
export interface SupplyBuy {
  memberId: string;
  memberName: string;
  kind: SupplyKind;
  item: number;
  purchases: number;
  units: number;
  cost: number;
  vendorEntry: number;
}

// The buys the purse covers, in row order, sized to what fits when `fitOnly`. A row the gold runs
// out on is trimmed to the purchases still affordable, so "buy what we can" is one pass.
export function supplyBuys(rows: readonly SupplyRow[], gold: number, fitOnly: boolean): SupplyBuy[] {
  const out: SupplyBuy[] = [];
  let left = gold;
  for (const row of rows) {
    const rung = row.ladder[row.rung]!;
    const want = fitOnly ? row.fitPurchases : row.purchases;
    const purchases = Math.min(want, Math.floor(left / Math.max(1, rung.price)));
    if (purchases <= 0) continue;
    const cost = buyCostCopper(rung.item, purchases);
    left -= cost;
    out.push({
      memberId: row.memberId,
      memberName: row.memberName,
      kind: row.kind,
      item: row.item,
      purchases,
      units: purchases * rung.buyCount,
      cost,
      vendorEntry: rung.vendorEntry,
    });
  }
  return out;
}

export const supplyKindLabel = (kind: SupplyKind): string => (kind === 'drink' ? 'Water' : 'Food');
