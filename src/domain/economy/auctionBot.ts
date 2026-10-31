// Auction-house market maker, a CMaNGOS AHBot fidelity port (AuctionHouseBot.cpp; ahbot.conf).
// Pure and deterministic: prices from item data, randomness from an injected Rng, `now` passed in.

import type { Rng } from '../../engine/core/rng.ts';
import type { ItemDef, CompactLoot, LootTuple, LootEntryDef, RandomPropertyDef } from '../../data/schema.ts';
import type { Auction, AuctionHouseState } from './auction.ts';
import { minNextBid, auctionCut } from './auction.ts';
import { rollLootDeep } from '../items/loot.ts';
import { createItemInstance, type CreateItemData, type CreateItemOpts } from '../items/createItem.ts';
import { hasIdentity, identityCapable } from '../items/itemInstance.ts';
import { randomPropPowerPoints } from '../items/itemRandomProps.ts';
import ahItemValuesJson from '../../data/tables/ahItemValues.json' with { type: 'json' };

// ---- sourced constants (ahbot.conf.dist.in / AuctionHouseBot.cpp) -----------

/** ITEM_QUALITY_* — matrix row index. */
export const ITEM_QUALITY_POOR = 0;
export const ITEM_QUALITY_NORMAL = 1;
export const ITEM_QUALITY_UNCOMMON = 2;
export const ITEM_QUALITY_RARE = 3;
export const ITEM_QUALITY_EPIC = 4;
export const ITEM_QUALITY_LEGENDARY = 5;
export const ITEM_QUALITY_ARTIFACT = 6;

// item_template.class (ItemPrototype.h ITEM_CLASS_*). Full bake stamps itemClass on every item;
// inferItemClass remains for fixtures and any row that still lacks the field.
export const ITEM_CLASS_WEAPON = 2;
export const ITEM_CLASS_ARMOR = 4;
/** Default inferred class for non-weapon/armor tradeables (Trade Goods). */
export const ITEM_CLASS_TRADE_GOODS = 7;

/** BIND_WHEN_PICKED_UP / BIND_QUEST_ITEM — sell-side exclusions. */
const BIND_WHEN_PICKED_UP = 1;
const BIND_QUEST_ITEM = 4;

// Quality×class PERCENT matrix from ahbot.conf.dist.in (rows quality 0–6, cols class 0–16), used
// after the BuyPrice or SellPrice×4/5 anchor. Poor, Legendary and Artifact are 0 — never traded.
export const QUALITY_CLASS_PERCENT: readonly (readonly number[])[] = [
  // Poor
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  // Normal
  [100, 100, 0, 100, 0, 100, 100, 100, 0, 100, 0, 100, 100, 100, 0, 100, 100],
  // Uncommon
  [200, 200, 200, 200, 200, 200, 200, 200, 0, 200, 0, 200, 200, 200, 0, 200, 200],
  // Rare
  [400, 400, 400, 400, 400, 400, 400, 400, 0, 400, 0, 400, 400, 400, 0, 400, 400],
  // Epic
  [800, 800, 800, 800, 800, 800, 800, 800, 0, 800, 0, 800, 800, 800, 0, 800, 800],
  // Legendary
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  // Artifact
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
] as const;

/** AuctionHouseBot.Value.Variance default (conf:168). */
export const DEFAULT_VALUE_VARIANCE = 10;
/** AuctionHouseBot.Bid.Min / Max (conf:176–177). */
export const BID_MIN_PCT = 75;
export const BID_MAX_PCT = 90;
/** AuctionHouseBot.Time.Min / Max hours (conf:185–186). */
export const AUCTION_TIME_MIN_H = 2;
export const AUCTION_TIME_MAX_H = 24;
/** AuctionHouseBot.Chance.Buy default 10 → 0.10 action gate. */
export const DEFAULT_BUY_CHANCE = 0.10;
/** AuctionHouseBot.Level.MaxRequired static cap (conf:110). */
export const MAX_REQUIRED_LEVEL = 60;

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_SELLER = 'Auctioneer-Bot';

// ---- class for quality×class matrix -----------------------------------------

// item_template.class for the AHBot matrix: explicit itemClass, else weapon 2, armor 4, else
// Trade Goods 7 — chosen over Misc 15 so the fallback stays a tradeable at 100%.
export function inferItemClass(it: ItemDef): number {
  if (it.itemClass != null) return it.itemClass;
  if (it.weapon != null || it.weaponSubclass != null) return ITEM_CLASS_WEAPON;
  if (it.armor != null || it.armorSubclass != null) return ITEM_CLASS_ARMOR;
  if (it.slot && it.slot !== 'bag') {
    if (it.slot === 'mainhand' || it.slot === 'twohand' || it.slot === 'ranged') {
      return ITEM_CLASS_WEAPON;
    }
    // offhand can be shield (armor) or weapon; without weapon fields treat as armor
    return ITEM_CLASS_ARMOR;
  }
  return ITEM_CLASS_TRADE_GOODS;
}

/** Prefer baked `bonding`, fall back to legacy `binding`. */
export function itemBonding(it: ItemDef): number {
  return it.bonding ?? it.binding ?? 0;
}

export function qualityClassPercent(quality: number, itemClass: number): number {
  const row = QUALITY_CLASS_PERCENT[quality];
  if (!row) return 0;
  if (itemClass < 0 || itemClass >= row.length) return 0;
  return row[itemClass]!;
}

// ---- pricing (CalculateBuyoutPrice + ValueWithVariance) ---------------------

/** Player.cpp:17516 — BuyCount is the vendor bundle size BuyPrice pays for. */
export function itemBuyCount(it: Pick<ItemDef, 'buyCount'>): number {
  return Math.max(1, it.buyCount ?? 1);
}

// Vendor copper for `quantity` units. BuyPrice is a BuyCount bundle, not a unit. Cite: Player.cpp:17516
// `totalCount = BuyCount * count`; :17551 `price = BuyPrice * count`.
export function vendorBundleCopper(it: Pick<ItemDef, 'buyPrice' | 'buyCount'>, quantity: number): number {
  const buy = it.buyPrice | 0;
  const qty = quantity | 0;
  if (buy <= 0 || qty < 1) return 0;
  return Math.floor((buy * qty) / itemBuyCount(it));
}

export const LIST_VENDOR_CAP_REASON = 'Vendors sell this for less';

// CalculateBuyoutPrice for `quantity` units. BuyPrice is a BuyCount BUNDLE, so unpack it first:
// treating it as a unit priced Solid Shot x200 at 6g when the vendor pack is 3s. Cite: cpp:613.
export function stackBuyoutPrice(
  it: ItemDef,
  quantity: number,
  vendorItems?: ReadonlySet<number>,
): number {
  const qty = Math.max(1, quantity | 0);
  const buyCount = itemBuyCount(it);
  const buy = it.buyPrice | 0;
  const sell = it.sellPrice | 0;
  const unitBuy = buyCount > 1 ? Math.floor(buy / buyCount) : buy;
  // buy==0 → SellPrice fallback. Do not treat floor(pack/BuyCount)==0 as "no buy
  // price" (Rough Arrow 10c/200). Ratio uses per-unit buy, not the pack.
  const useSellFallback = buy === 0 || (sell > 0 && Math.floor(unitBuy / sell) > 5);
  const unit = useSellFallback
    ? sell * (it.quality <= ITEM_QUALITY_NORMAL ? 4 : 5)
    : unitBuy;
  const pct = vendorItems?.has(it.entry)
    ? 100
    : qualityClassPercent(it.quality, inferItemClass(it));
  if (!useSellFallback && buyCount > 1 && buy > 0) {
    // Keep pack totals: Solid Shot 300c for 200, not floor(300/200)*200 = 200.
    return Math.floor((buy * qty * pct) / (buyCount * 100));
  }
  return Math.floor((unit * qty * pct) / 100);
}

/** Unit copper — stack of 1. Cite: AuctionHouseBot.cpp:613. */
export function calculateBuyoutPrice(it: ItemDef, vendorItems?: ReadonlySet<number>): number {
  return stackBuyoutPrice(it, 1, vendorItems);
}

// AuctionHouseBot.h ValueWithVariance: itemValue + (urand(0, variance*2+1) - variance) *
// (itemValue / 100). Variance 0 leaves it unchanged; callers passing an rng default to 10.
export function valueWithVariance(baseValue: number, variance: number, rng: Rng): number {
  if (variance <= 0 || baseValue <= 0) return baseValue;
  // urand inclusive both ends → rng.int(0, variance*2+1)
  const roll = rng.int(0, variance * 2 + 1);
  const delta = roll - variance;
  const stepped = Math.floor(baseValue / 100);
  const out = baseValue + delta * stepped;
  return out < 0 ? 0 : out;
}

// Optional identity for AH unit valuation (Wave Q P5). Prefer `randomProp` when the caller already resolved
// the def; otherwise `randomPropertyId` + `propLookup`. Id 0 / missing / failed lookup → no premium.
export interface ItemValueOpts {
  variance?: number;
  rng?: Rng;
  randomPropertyId?: number;
  /** Resolved prop — prefer this when caller already looked up. */
  randomProp?: RandomPropertyDef;
  propLookup?: (id: number) => RandomPropertyDef | undefined;
  /** Infinite-stock npc_vendor (maxcount 0) → matrix 100% + listing cap. */
  vendorItems?: ReadonlySet<number>;
  /** Per-unit craft-cost floor from buildCraftFloor — raises a craft to its reagents. */
  craftFloor?: ReadonlyMap<number, number>;
  /** ahbot_items value overrides; defaults to the shipped table. */
  valueOverrides?: ReadonlyMap<number, number>;
}

// Resolve a RandomPropertyDef for valuation without requiring a DataStore API. Prefer explicit
// `randomProp`; else lookup by id when propLookup is provided.
function resolveValueProp(opts?: ItemValueOpts): RandomPropertyDef | undefined {
  if (opts?.randomProp) return opts.randomProp;
  const id = opts?.randomPropertyId;
  if (id == null || id <= 0) return undefined;
  return opts?.propLookup?.(id);
}

// Phonecraft AH random-prop premium — CMaNGOS prices item_template only. About 2% of template AH
// unit value per power point. A documented heuristic; vendor sell price stays template-only.
export function randomPropPremiumCopper(baseBuyout: number, prop: RandomPropertyDef | undefined): number {
  if (!prop) return 0;
  const points = randomPropPowerPoints(prop);
  if (points <= 0) return 0;
  const base = baseBuyout | 0;
  if (base < 0) return 0;
  const copperPerPoint = Math.max(1, Math.floor(base * 0.02));
  return points * copperPerPoint;
}

// characters.ahbot_items value override (cpp:138-155). Replaces CalculateBuyoutPrice outright
// (cpp:242, :275); 0 blacklists the item both ways (cpp:229-231, :271-273). Ships empty like upstream.
export const AH_ITEM_VALUES: ReadonlyMap<number, number> = new Map(
  (ahItemValuesJson.items as Array<{ item: number; value: number }>)
    .filter((r) => (r.item | 0) > 0)
    .map((r) => [r.item | 0, Math.max(0, r.value | 0)]),
);

/** Override copper for one item, or undefined when the table has no row. */
export function ahItemValueOverride(
  entry: number,
  overrides: ReadonlyMap<number, number> = AH_ITEM_VALUES,
): number | undefined {
  return overrides.get(entry | 0);
}

/** A recipe as the craft floor reads it — matches profession-data rows and ds.recipes(). */
export interface CraftFloorRecipe {
  product: { item: number; count?: number };
  reagents?: ReadonlyArray<{ item: number; count: number }>;
}

/** Chain depth ore -> bar -> arcanite -> rod -> weapon; passes stop early once stable. */
const CRAFT_FLOOR_PASSES = 8;

// Per-unit floor for crafted items: 326 of 1024 recipes listed under their own reagents, Flask of
// the Titans at 2g against 4.35g of mats. Raises only, like randomPropPremiumCopper above.
export function buildCraftFloor(
  recipes: Iterable<CraftFloorRecipe>,
  itemOf: (id: number) => ItemDef | undefined,
  vendorItems?: ReadonlySet<number>,
): Map<number, number> {
  const rows = [...recipes].filter((r) => (r.reagents?.length ?? 0) > 0 && (r.product?.item | 0) > 0);
  const floor = new Map<number, number>();
  if (rows.length === 0) return floor;
  // Template unit value, already clamped for infinite-stock vendor rows so a vendor mat cannot
  // push a craft above what the vendor charges for the same goods.
  const unitOf = (id: number): number | null => {
    const it = itemOf(id);
    if (!it) return null;
    const ov = ahItemValueOverride(id);
    if (ov != null) return ov;
    const v = stackBuyoutPrice(it, 1, vendorItems);
    const cap = vendorItems?.has(id) ? vendorBundleCopper(it, 1) : 0;
    return cap > 0 && v > cap ? cap : v;
  };
  const valueOf = (id: number): number | null => floor.get(id) ?? unitOf(id);
  for (let pass = 0; pass < CRAFT_FLOOR_PASSES; pass++) {
    let changed = false;
    for (const r of rows) {
      const product = r.product.item | 0;
      // A vendor-stocked craft stays at the vendor price (conf:150-159 Value.Vendor).
      if (vendorItems?.has(product)) continue;
      let mats = 0;
      let known = true;
      for (const rg of r.reagents!) {
        const v = valueOf(rg.item | 0);
        if (v == null) { known = false; break; }
        mats += v * Math.max(1, rg.count | 0);
      }
      if (!known || mats <= 0) continue;
      const per = Math.floor(mats / Math.max(1, r.product.count | 0 || 1));
      if (per > (valueOf(product) ?? 0)) {
        floor.set(product, per);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return floor;
}

// AH copper for `quantity` units, with variance applied only at the final listing step and a
// deterministic prop premium before it. Infinite-stock vendor items clamp to the bundle price.
export function itemStackValue(
  it: ItemDef,
  quantity: number,
  opts?: ItemValueOpts,
): number {
  const qty = Math.max(1, quantity | 0);
  // cpp:242 — an ahbot_items row replaces CalculateBuyoutPrice, so the template and the floor
  // are both skipped. Value 0 means blacklisted and prices to nothing.
  const override = ahItemValueOverride(it.entry, opts?.valueOverrides);
  if (override != null) {
    if (override === 0) return 0;
    const capped = opts?.vendorItems?.has(it.entry) ? vendorBundleCopper(it, qty) : 0;
    const out0 = opts?.rng ? valueWithVariance(override * qty, opts.variance ?? DEFAULT_VALUE_VARIANCE, opts.rng) : override * qty;
    return capped > 0 && out0 > capped ? capped : out0;
  }
  const craftUnit = opts?.craftFloor?.get(it.entry) ?? 0;
  const base = Math.max(stackBuyoutPrice(it, qty, opts?.vendorItems), craftUnit * qty);
  const unit = Math.max(stackBuyoutPrice(it, 1, opts?.vendorItems), craftUnit);
  const prop = resolveValueProp(opts);
  const withPremium = base + randomPropPremiumCopper(unit, prop) * qty;
  let out = withPremium;
  if (opts?.rng) {
    const variance = opts.variance ?? DEFAULT_VALUE_VARIANCE;
    out = valueWithVariance(withPremium, variance, opts.rng);
  }
  const cap = opts?.vendorItems?.has(it.entry) ? vendorBundleCopper(it, qty) : 0;
  if (cap > 0 && out > cap) return cap;
  return out;
}

/** Unit copper — `itemStackValue(it, 1, opts)`. */
export function itemValue(
  it: ItemDef,
  opts?: ItemValueOpts,
): number {
  return itemStackValue(it, 1, opts);
}

// ---- sell-side filters ------------------------------------------------------

// Whether AHBot may list this item (cpp:224–240 + value≠0 at list time). Excludes BoP, quest-bound,
// questItem flag, matrix 0, computed value 0. Does not apply loot-container flag (GAP — flags not baked).
export function canBotListItem(it: ItemDef, maxRequiredLevel: number = MAX_REQUIRED_LEVEL): boolean {
  if (ahItemValueOverride(it.entry) === 0) return false; // cpp:229-231 blacklist
  const bonding = itemBonding(it);
  if (bonding === BIND_WHEN_PICKED_UP || bonding === BIND_QUEST_ITEM) return false;
  if (it.questItem) return false;
  if ((it.requiredLevel | 0) > maxRequiredLevel) return false;
  if (qualityClassPercent(it.quality, inferItemClass(it)) === 0) return false;
  // Pack value: Rough Arrow unit floors to 0c but the 200-bundle is 10c.
  if (stackBuyoutPrice(it, itemBuyCount(it)) === 0) return false;
  return true;
}

/** ahbot.conf.dist.in 4-tuple: minSources, maxSources, minLootings, maxLootings. */
export type AhBotLootConfig = readonly [number, number, number, number];

/** Cite: ahbot.conf.dist.in:45–54. */
export const AHBOT_LOOT: {
  creatureNormal: AhBotLootConfig;
  creatureRare: AhBotLootConfig;
  creatureElite: AhBotLootConfig;
  creatureRareElite: AhBotLootConfig;
  creatureWorldBoss: AhBotLootConfig;
  disenchant: AhBotLootConfig;
  fishing: AhBotLootConfig;
  gameobject: AhBotLootConfig;
  skinning: AhBotLootConfig;
} = {
  creatureNormal: [30, 35, 8, 12],
  creatureRare: [0, 10, 1, 1],
  creatureElite: [30, 34, 1, 2],
  creatureRareElite: [-10, 2, 1, 1],
  creatureWorldBoss: [-20, 1, 1, 1],
  disenchant: [10, 12, 1, 1],
  fishing: [3, 5, 30, 40],
  gameobject: [13, 16, 7, 11],
  skinning: [3, 5, 50, 50],
};

/** Profession 4-tuple: min items, max items, min % stack, max % stack. Cite: conf:70. */
export const AHBOT_PROFESSION: AhBotLootConfig = [80, 90, 0, 50];

/** One house sell+buy cycle. Cite: World.cpp:1363; 6-state round-robin → 120s. */
export const AHBOT_TICK_MS = 120_000;
/** Catch-up slices on visit (16 min). More than this hitch the UI on a loot sell pass. */
export const AHBOT_CATCHUP_MAX = 8;
/** Empty-house first paint. Cite: AuctionHouseBot.cpp Rebuild, bounded vs ~1170. */
export const AHBOT_WARM_SELL_PASSES = 3;
/** Keep selling to this many live lots. Measured: 0 cloth-wrist @ 552, 20 @ 7142. */
export const AHBOT_STOCK_FLOOR = 10_000;
/** Sell passes per refill while below the floor. */
export const AHBOT_FILL_PASSES = 3;

// ---- loot-template supply ---------------------------------------------------

export type LootTableGet = (id: number | string) => readonly LootTuple[] | readonly LootEntryDef[] | undefined;
export type LootTablesInput =
  | CompactLoot
  | Map<number | string, readonly LootTuple[] | readonly LootEntryDef[]>
  | LootTableGet;

function isLootEntryDef(e: LootTuple | LootEntryDef): e is LootEntryDef {
  return typeof e === 'object' && e !== null && 'item' in e && !Array.isArray(e);
}

function decodeLootTuple(t: LootTuple): LootEntryDef {
  const ent: LootEntryDef = {
    item: t[0],
    chance: t[1],
    groupId: t[2],
    minCount: t.length >= 5 ? t[3]! : 1,
    maxCount: t.length >= 5 ? t[4]! : 1,
  };
  if (t.length >= 6 && ((t[5] as number) | 0) !== 0) ent.conditionId = (t[5] as number) | 0;
  return ent;
}

function lootMapKey(id: number | string): number | string {
  if (typeof id === 'number') return id;
  if (/^\d+$/.test(id)) return Number(id);
  return id;
}

function decodeRows(rows: readonly (LootTuple | LootEntryDef)[]): LootEntryDef[] {
  return rows.map((r) => (isLootEntryDef(r) ? r : decodeLootTuple(r)));
}

/** Decode only tables that a roll actually touches — never the whole loot store. */
function asTableGet(lootTables: LootTablesInput): (id: number | string) => LootEntryDef[] | undefined {
  const cache = new Map<number | string, LootEntryDef[]>();
  return (id) => {
    const key = lootMapKey(id);
    const hit = cache.get(key);
    if (hit) return hit.length ? hit : undefined;
    let rows: readonly (LootTuple | LootEntryDef)[] | undefined;
    if (typeof lootTables === 'function') {
      rows = lootTables(id);
      if ((!rows || rows.length === 0) && id !== key) rows = lootTables(key);
    } else if (lootTables instanceof Map) {
      rows = lootTables.get(key) ?? lootTables.get(id);
    } else {
      const obj = lootTables;
      rows = obj[key as string] ?? obj[String(id)];
    }
    const decoded = rows && rows.length ? decodeRows(rows) : [];
    cache.set(key, decoded);
    return decoded.length ? decoded : undefined;
  };
}

// Simplified AddLootToItemMap (cpp:582–611): pick N template ids and process each
// urand(minLootings,maxLootings) times. C++: min<0 → urand(0, max-min)+min, else urand(min,max).
export function rollLootSourceCount(minSources: number, maxSources: number, rng: Rng): number {
  if (maxSources <= 0) return 0;
  if (minSources < 0) return rng.int(0, maxSources - minSources) + minSources;
  return rng.int(minSources, maxSources);
}

export function addLootToItemMap(
  templateIds: readonly (number | string)[],
  tables: LootTablesInput,
  rng: Rng,
  opts: {
    minSources?: number;
    maxSources?: number;
    minLootings?: number;
    maxLootings?: number;
    itemOf?: (itemId: number) => ItemDef | undefined;
    maxRequiredLevel?: number;
    maxItemLevel?: number;
  } = {},
): Map<number, number> {
  const itemMap = new Map<number, number>();
  if (templateIds.length === 0) return itemMap;
  const minSources = opts.minSources ?? 1;
  const maxSources = opts.maxSources ?? Math.min(3, templateIds.length);
  const minLootings = opts.minLootings ?? 1;
  const maxLootings = opts.maxLootings ?? 1;
  if (maxLootings <= 0) return itemMap;
  const maxTemplates = rollLootSourceCount(minSources, maxSources, rng);
  if (maxTemplates <= 0) return itemMap;
  const maxReq = opts.maxRequiredLevel ?? MAX_REQUIRED_LEVEL;
  const maxIlvl = opts.maxItemLevel ?? (maxReq >= 60 ? 255 : maxReq + 5);
  const get = asTableGet(tables);
  for (let t = 0; t < maxTemplates; t++) {
    const tid = templateIds[rng.int(0, templateIds.length - 1)]!;
    const entries = get(tid);
    if (!entries || entries.length === 0) continue;
    const repeats = rng.int(Math.min(minLootings, maxLootings), Math.max(minLootings, maxLootings));
    for (let r = 0; r < repeats; r++) {
      for (const drop of rollLootDeep(entries, (refId) => get(refId), rng)) {
        if (opts.itemOf) {
          const it = opts.itemOf(drop.item);
          if (it && ((it.requiredLevel | 0) > maxReq || (it.itemLevel ?? 0) > maxIlvl)) continue;
        }
        itemMap.set(drop.item, (itemMap.get(drop.item) ?? 0) + drop.count);
      }
    }
  }
  return itemMap;
}

// ---- market making (sell) ---------------------------------------------------

export interface SeedOptions {
  count: number;
  startId: number;
  nowMs: number;
  /** Fixed duration; when omitted, urand(2,24) hours (AHBot Time.Min/Max). */
  durationMs?: number;
  seller?: string;
  /** ValueWithVariance percent band; default 10. Pass 0 for exact prices. */
  variance?: number;
  maxRequiredLevel?: number;
  /** When set with itemLookup, supply is loot-template drawn (not uniform pool). */
  lootTables?: LootTablesInput;
  itemLookup?: (itemId: number) => ItemDef | undefined;
  /** Template ids to sample; default = keys of lootTables. */
  templateIds?: number[];
  minSources?: number;
  maxSources?: number;
  minLootings?: number;
  maxLootings?: number;
  // Wave Q P2/P5: when set, each listing of an identity-capable / randomProperty item mints `instance` with
  // a rolled `randomPropertyId` and prices via itemValue + prop premium.
  createDs?: CreateItemData;
  lookupProp?: CreateItemOpts['lookupProp'];
}

function listingDurationMs(rng: Rng, durationMs?: number): number {
  if (durationMs != null) return durationMs;
  return rng.int(AUCTION_TIME_MIN_H, AUCTION_TIME_MAX_H) * HOUR_MS;
}

function priceListing(
  it: ItemDef,
  quantity: number,
  rng: Rng,
  variance: number,
  valueOpts?: Pick<ItemValueOpts, 'randomPropertyId' | 'randomProp' | 'propLookup' | 'vendorItems' | 'craftFloor'>,
): { buyoutCopper: number; bidCopper: number } | null {
  const buyoutCopper = itemStackValue(it, quantity, { variance, rng, ...valueOpts });
  if (buyoutCopper <= 0) return null;
  const bidPct = rng.int(BID_MIN_PCT, BID_MAX_PCT);
  const bidCopper = Math.max(1, Math.floor((buyoutCopper * bidPct) / 100));
  return { buyoutCopper, bidCopper };
}

function pushListing(
  out: Auction[],
  it: ItemDef,
  quantity: number,
  rng: Rng,
  opts: {
    startId: number;
    nowMs: number;
    durationMs?: number;
    seller: string;
    variance: number;
    createDs?: CreateItemData;
    lookupProp?: CreateItemOpts['lookupProp'];
    vendorItems?: ReadonlySet<number>;
    craftFloor?: ReadonlyMap<number, number>;
    pickSeller?: () => string;
  },
): void {
  // Wave Q P2: mint instance first so Q P5 can price the rolled randomPropertyId.
  let instance: Auction['instance'];
  if (opts.createDs && (identityCapable(it) || (it.randomProperty != null && it.randomProperty > 0))) {
    const inst = createItemInstance(it.entry, quantity, opts.createDs, rng, {
      lookupProp: opts.lookupProp,
    });
    if (hasIdentity(inst) || identityCapable(it)) instance = inst;
  }
  const priced = priceListing(it, quantity, rng, opts.variance, {
    randomPropertyId: instance?.randomPropertyId,
    propLookup: opts.lookupProp,
    vendorItems: opts.vendorItems,
    craftFloor: opts.craftFloor,
  });
  if (!priced) return;
  const duration = listingDurationMs(rng, opts.durationMs);
  out.push({
    id: opts.startId + out.length,
    item: it.entry,
    quantity,
    bidCopper: priced.bidCopper,
    highBidder: null,
    buyoutCopper: priced.buyoutCopper,
    seller: opts.pickSeller ? opts.pickSeller() : opts.seller,
    bot: true,
    expiresAt: opts.nowMs + duration,
    ...(instance ? { instance } : {}),
  });
}

// Generate auctions from a pool of listable items: CalculateBuyoutPrice × ValueWithVariance,
// opening bid 75–90% of buyout, duration 2–24h. With lootTables, supply is drawn from loot.
export function seedAuctions(pool: ItemDef[], rng: Rng, opts: SeedOptions): Auction[] {
  if (opts.count <= 0) return [];
  const variance = opts.variance ?? DEFAULT_VALUE_VARIANCE;
  const seller = opts.seller ?? DEFAULT_SELLER;
  const maxReq = opts.maxRequiredLevel ?? MAX_REQUIRED_LEVEL;
  const listOpts = {
    startId: opts.startId,
    nowMs: opts.nowMs,
    durationMs: opts.durationMs,
    seller,
    variance,
    createDs: opts.createDs,
    lookupProp: opts.lookupProp,
  };

  if (opts.lootTables && opts.itemLookup) {
    return seedAuctionsFromLoot(opts.lootTables, opts.itemLookup, rng, opts);
  }

  const sellable = pool.filter((it) => canBotListItem(it, maxReq));
  if (sellable.length === 0) return [];
  const out: Auction[] = [];
  for (let i = 0; i < opts.count && out.length < opts.count; i++) {
    const it = sellable[rng.int(0, sellable.length - 1)]!;
    const quantity = it.stackable > 1 ? rng.int(1, Math.min(5, it.stackable)) : 1;
    pushListing(out, it, quantity, rng, listOpts);
  }
  return out;
}

// AHBot sell-side supply: roll loot templates into an item multiset, then list filtered items
// (BoP/quest/matrix-0 excluded). Stacks split by max stack size.
export function seedAuctionsFromLoot(
  lootTables: LootTablesInput,
  itemOf: (itemId: number) => ItemDef | undefined,
  rng: Rng,
  opts: SeedOptions,
): Auction[] {
  if (opts.count <= 0) return [];
  const templateIds = opts.templateIds ?? (
    typeof lootTables === 'function' ? []
      : lootTables instanceof Map ? [...lootTables.keys()]
        : Object.keys(lootTables)
  );
  if (templateIds.length === 0) return [];

  const variance = opts.variance ?? DEFAULT_VALUE_VARIANCE;
  const seller = opts.seller ?? DEFAULT_SELLER;
  const maxReq = opts.maxRequiredLevel ?? MAX_REQUIRED_LEVEL;
  const listOpts = {
    startId: opts.startId,
    nowMs: opts.nowMs,
    durationMs: opts.durationMs,
    seller,
    variance,
    createDs: opts.createDs,
    lookupProp: opts.lookupProp,
  };

  // Enough loot runs to fill `count` listings (may overshoot map, then take first N stacks).
  const itemMap = addLootToItemMap(templateIds, lootTables, rng, {
    minSources: opts.minSources ?? Math.min(1, templateIds.length),
    maxSources: opts.maxSources ?? Math.min(templateIds.length, Math.max(1, opts.count)),
    minLootings: opts.minLootings ?? 1,
    maxLootings: opts.maxLootings ?? Math.max(1, opts.count),
  });

  const out: Auction[] = [];
  for (const [itemId, totalCount] of itemMap) {
    if (out.length >= opts.count) break;
    const it = itemOf(itemId);
    if (!it || !canBotListItem(it, maxReq)) continue;
    const maxStack = Math.max(1, it.stackable | 0);
    for (let stacked = 0; stacked < totalCount && out.length < opts.count; stacked += maxStack) {
      const quantity = Math.min(maxStack, totalCount - stacked);
      pushListing(out, it, quantity, rng, listOpts);
    }
  }
  return out;
}

// Top the AH up to `target` live listings. Ids minted from `nextId`. Optional lootTables/itemLookup switch
// supply to loot-derived path.
export function refillAuctionHouse(
  ah: AuctionHouseState,
  pool: ItemDef[],
  rng: Rng,
  opts: {
    target: number;
    nowMs: number;
    durationMs?: number;
    seller?: string;
    variance?: number;
    maxRequiredLevel?: number;
    lootTables?: LootTablesInput;
    itemLookup?: (itemId: number) => ItemDef | undefined;
    templateIds?: number[];
    minSources?: number;
    maxSources?: number;
    minLootings?: number;
    maxLootings?: number;
    createDs?: CreateItemData;
    lookupProp?: CreateItemOpts['lookupProp'];
  },
): { ah: AuctionHouseState; added: Auction[] } {
  const need = Math.max(0, opts.target - ah.auctions.length);
  const added = seedAuctions(pool, rng, {
    count: need,
    startId: ah.nextId,
    nowMs: opts.nowMs,
    durationMs: opts.durationMs,
    seller: opts.seller,
    variance: opts.variance,
    maxRequiredLevel: opts.maxRequiredLevel,
    lootTables: opts.lootTables,
    itemLookup: opts.itemLookup,
    templateIds: opts.templateIds,
    minSources: opts.minSources,
    maxSources: opts.maxSources,
    minLootings: opts.minLootings,
    maxLootings: opts.maxLootings,
    createDs: opts.createDs,
    lookupProp: opts.lookupProp,
  });
  return {
    ah: { ...ah, auctions: [...ah.auctions, ...added], nextId: ah.nextId + added.length },
    added,
  };
}

// ---- buy side ---------------------------------------------------------------

// Standalone deal finder (unwired): flags listings whose stack value strictly exceeds buyout, the
// CMaNGOS buyout condition. Prefer botMarketPass for live trading — variance, chance, escrow.
export function botBuyPolicy(
  ah: AuctionHouseState,
  valueOf: (item: number, quantity?: number) => number,
  /** @deprecated Unused — CMaNGOS does not use a 0.9 deal threshold; kept for call-site compat. */
  _dealThreshold = 0.9,
): number[] {
  return ah.auctions
    .filter((a) => a.buyoutCopper > 0 && valueOf(a.item, a.quantity) > a.buyoutCopper)
    .map((a) => a.id);
}

export interface MarketEvent {
  kind: 'sold' | 'outbid';
  item: number;
  quantity: number;
  amount: number;
}

export interface MarketPassResult {
  ah: AuctionHouseState;
  playerProceeds: number;
  playerRefund: number;
  events: MarketEvent[];
}

export interface MarketPassOptions {
  /** Stack copper for (item, quantity). Variance applied inside. */
  valueOf: (item: number, quantity?: number) => number;
  player: string;
  nowMs: number;
  // Chance to *run* this pass. Default **0.10** (AuctionHouseBot.Chance.Buy = 10). Applied once per call —
  // then every live auction is scanned (cpp:255–287). Callers that already gated Chance.Buy should pass 1.
  buyChance?: number;
  // Optional extra gate on bid-only path. When omitted, any auction that passes buyChance and fails buyout
  // but meets bid threshold is bid (CMaNGOS style).
  bidChance?: number;
  botName?: string;
  /** ValueWithVariance percent; default 10. Pass 0 for exact willingness. */
  variance?: number;
}

// One round of bot demand (buy pass, cpp:255–287): skip the bot's own unbid listings, buy out when
// willingness beats buyout, else bid the minimum legal. Pays the player buyout minus the cut.
export function botMarketPass(ah: AuctionHouseState, rng: Rng, opts: MarketPassOptions): MarketPassResult {
  const { valueOf, player, nowMs } = opts;
  const buyChance = opts.buyChance ?? DEFAULT_BUY_CHANCE;
  const botName = opts.botName ?? DEFAULT_SELLER;
  const variance = opts.variance ?? DEFAULT_VALUE_VARIANCE;
  const events: MarketEvent[] = [];
  let playerProceeds = 0;
  let playerRefund = 0;
  // cpp:255 — Chance.Buy once per house pass, then scan every lot.
  if (buyChance < 1 && rng.next() >= buyChance) {
    return { ah, playerProceeds: 0, playerRefund: 0, events };
  }
  const remaining: Auction[] = [];

  for (const a of ah.auctions) {
    if (a.expiresAt <= nowMs) {
      remaining.push(a);
      continue;
    }
    // cpp:263 — ignore AHBot listings (owner==0 / a.bot) with no player bid yet
    if ((a.bot || a.seller === botName) && a.highBidder == null) {
      remaining.push(a);
      continue;
    }

    const fair = valueOf(a.item, a.quantity);
    const willingness = valueWithVariance(fair, variance, rng);

    // Buyout when value > buyout (cpp:280)
    if (a.buyoutCopper > 0 && willingness > a.buyoutCopper) {
      if (a.seller === player) {
        const proceeds = a.buyoutCopper - auctionCut(a.buyoutCopper);
        playerProceeds += proceeds;
        events.push({ kind: 'sold', item: a.item, quantity: a.quantity, amount: proceeds });
      }
      if (a.highBidder === player) {
        playerRefund += a.bidCopper;
        events.push({ kind: 'outbid', item: a.item, quantity: a.quantity, amount: a.bidCopper });
      }
      continue; // removed
    }

    // Else minimum-increment bid when value > next bid (cpp:277–283)
    const next = minNextBid(a);
    if (a.highBidder !== botName && willingness > next) {
      if (opts.bidChance !== undefined && rng.next() >= opts.bidChance) {
        remaining.push(a);
        continue;
      }
      if (a.highBidder === player) {
        playerRefund += a.bidCopper;
        events.push({ kind: 'outbid', item: a.item, quantity: a.quantity, amount: a.bidCopper });
      }
      remaining.push({ ...a, bidCopper: next, highBidder: botName });
      continue;
    }
    remaining.push(a);
  }

  return { ah: { ...ah, auctions: remaining }, playerProceeds, playerRefund, events };
}

/** Ike3-style named sellers. Empty pool → Auctioneer-Bot. */
export function pickBotSeller(rng: Rng, names?: { male?: readonly string[]; female?: readonly string[] }): string {
  const pool = [...(names?.male ?? []), ...(names?.female ?? [])].filter((n) => n.length > 0);
  if (pool.length === 0) return DEFAULT_SELLER;
  return pool[rng.int(0, pool.length - 1)]!;
}

export interface AhBotSources {
  creatureNormal: Array<number | string>;
  creatureRare: Array<number | string>;
  creatureElite: Array<number | string>;
  creatureRareElite: Array<number | string>;
  creatureWorldBoss: Array<number | string>;
  disenchant: Array<number | string>;
  fishing: Array<number | string>;
  gameobject: Array<number | string>;
  skinning: Array<number | string>;
  professionItems: number[];
  vendorItems: Set<number>;
  /** npc_vendor maxcount 0 on at least one vendor — buy infinitely. */
  infiniteVendorItems: Set<number>;
  /** Per-unit craft-cost floor; empty when the caller passed no itemOf. */
  craftFloor: Map<number, number>;
}

const RANK_NORMAL = 0;
const RANK_ELITE = 1;
const RANK_RAREELITE = 2;
const RANK_WORLDBOSS = 3;
const RANK_RARE = 4;

function prefixIds(lootIds: Iterable<number | string>, prefix: string): Array<number | string> {
  const out: Array<number | string> = [];
  for (const id of lootIds) {
    if (typeof id === 'string' && id.startsWith(prefix)) out.push(id);
  }
  return out;
}

// Build AHBot template lists from bake data. Creature buckets use lootId grouped by scaling.rank
// (CREATURE_ELITE_*). Namespaced loot keys match loot-chunk-port prefixes.
export function collectAhBotSources(input: {
  creatures: Iterable<{ lootId?: number; scaling?: { rank?: number } }>;
  lootHas: (id: number | string) => boolean;
  lootIds: Iterable<number | string>;
  recipes: Iterable<CraftFloorRecipe>;
  vendors: Iterable<{ items: number[]; stock?: Array<{ item: number }> }>;
  /** Supplied → craft-cost floor is built; omitted (fixtures) → empty floor. */
  itemOf?: (id: number) => ItemDef | undefined;
}): AhBotSources {
  const creatureNormal: Array<number | string> = [];
  const creatureRare: Array<number | string> = [];
  const creatureElite: Array<number | string> = [];
  const creatureRareElite: Array<number | string> = [];
  const creatureWorldBoss: Array<number | string> = [];
  const seen = new Set<string>();
  const pushUnique = (bucket: Array<number | string>, id: number) => {
    const k = String(id);
    if (seen.has(k) || id <= 0 || !input.lootHas(id)) return;
    seen.add(k);
    bucket.push(id);
  };
  for (const c of input.creatures) {
    const lootId = (c.lootId ?? 0) | 0;
    const rank = (c.scaling?.rank ?? 0) | 0;
    if (rank === RANK_ELITE) pushUnique(creatureElite, lootId);
    else if (rank === RANK_RAREELITE) pushUnique(creatureRareElite, lootId);
    else if (rank === RANK_WORLDBOSS) pushUnique(creatureWorldBoss, lootId);
    else if (rank === RANK_RARE) pushUnique(creatureRare, lootId);
    else if (rank === RANK_NORMAL) pushUnique(creatureNormal, lootId);
  }
  const professionItems: number[] = [];
  const profSeen = new Set<number>();
  for (const r of input.recipes) {
    const item = r.product.item | 0;
    if (item > 0 && !profSeen.has(item)) {
      profSeen.add(item);
      professionItems.push(item);
    }
  }
  const { vendorItems, infiniteVendorItems } = infiniteVendorItemsOf(input.vendors);
  const craftFloor = input.itemOf
    ? buildCraftFloor(input.recipes, input.itemOf, infiniteVendorItems)
    : new Map<number, number>();
  return {
    creatureNormal,
    creatureRare,
    creatureElite,
    creatureRareElite,
    creatureWorldBoss,
    disenchant: prefixIds(input.lootIds, 'disenchant:'),
    fishing: prefixIds(input.lootIds, 'fishing:'),
    gameobject: prefixIds(input.lootIds, 'go:'),
    skinning: prefixIds(input.lootIds, 'skinning:'),
    professionItems,
    vendorItems,
    infiniteVendorItems,
    craftFloor,
  };
}

// Vendor ids plus the infinite-stock subset — npc_vendor maxcount 0, since VendorDef.stock records
// only limited rows. An item limited on one vendor and unlimited on another is infinite.
export function infiniteVendorItemsOf(
  vendors: Iterable<{ items: number[]; stock?: Array<{ item: number }> }>,
): { vendorItems: Set<number>; infiniteVendorItems: Set<number> } {
  const vendorItems = new Set<number>();
  const infiniteVendorItems = new Set<number>();
  for (const v of vendors) {
    const limited = new Set((v.stock ?? []).map((s) => s.item | 0));
    for (const raw of v.items) {
      const item = raw | 0;
      if (item <= 0) continue;
      vendorItems.add(item);
      if (!limited.has(item)) infiniteVendorItems.add(item);
    }
  }
  return { vendorItems, infiniteVendorItems };
}

function mergeItemMap(into: Map<number, number>, add: Map<number, number>): void {
  for (const [item, count] of add) into.set(item, (into.get(item) ?? 0) + count);
}

function addConfiguredLoot(
  itemMap: Map<number, number>,
  templateIds: readonly (number | string)[],
  tables: LootTablesInput,
  rng: Rng,
  cfg: AhBotLootConfig,
  itemOf: (itemId: number) => ItemDef | undefined,
  maxRequiredLevel: number,
  maxItemLevel: number,
): void {
  if (cfg[1] <= 0 || cfg[3] <= 0 || templateIds.length === 0) return;
  mergeItemMap(itemMap, addLootToItemMap(templateIds, tables, rng, {
    minSources: cfg[0],
    maxSources: cfg[1],
    minLootings: cfg[2],
    maxLootings: cfg[3],
    itemOf,
    maxRequiredLevel,
    maxItemLevel,
  }));
}

export interface AhBotSellOpts {
  nowMs: number;
  startId: number;
  variance?: number;
  maxRequiredLevel?: number;
  createDs?: CreateItemData;
  lookupProp?: CreateItemOpts['lookupProp'];
  names?: { male?: readonly string[]; female?: readonly string[] };
  /** Fixture/smoke path when loot sources are empty. Not CMaNGOS. Called only then. */
  catalog?: ItemDef[] | (() => ItemDef[]);
}

// One AHBot sell pass (AuctionHouseBot.cpp:179–254): loot sources + profession crafts, then list every
// resulting stack. No listing cap.
export function ahBotSellPass(
  sources: AhBotSources,
  lootTables: LootTablesInput,
  itemOf: (itemId: number) => ItemDef | undefined,
  rng: Rng,
  opts: AhBotSellOpts,
): Auction[] {
  const maxReq = opts.maxRequiredLevel ?? MAX_REQUIRED_LEVEL;
  const maxIlvl = maxReq >= 60 ? 255 : maxReq + 5;
  const itemMap = new Map<number, number>();
  addConfiguredLoot(itemMap, sources.creatureNormal, lootTables, rng, AHBOT_LOOT.creatureNormal, itemOf, maxReq, maxIlvl);
  addConfiguredLoot(itemMap, sources.creatureRare, lootTables, rng, AHBOT_LOOT.creatureRare, itemOf, maxReq, maxIlvl);
  addConfiguredLoot(itemMap, sources.creatureElite, lootTables, rng, AHBOT_LOOT.creatureElite, itemOf, maxReq, maxIlvl);
  addConfiguredLoot(itemMap, sources.creatureRareElite, lootTables, rng, AHBOT_LOOT.creatureRareElite, itemOf, maxReq, maxIlvl);
  addConfiguredLoot(itemMap, sources.creatureWorldBoss, lootTables, rng, AHBOT_LOOT.creatureWorldBoss, itemOf, maxReq, maxIlvl);
  addConfiguredLoot(itemMap, sources.disenchant, lootTables, rng, AHBOT_LOOT.disenchant, itemOf, maxReq, maxIlvl);
  addConfiguredLoot(itemMap, sources.fishing, lootTables, rng, AHBOT_LOOT.fishing, itemOf, maxReq, maxIlvl);
  addConfiguredLoot(itemMap, sources.gameobject, lootTables, rng, AHBOT_LOOT.gameobject, itemOf, maxReq, maxIlvl);
  addConfiguredLoot(itemMap, sources.skinning, lootTables, rng, AHBOT_LOOT.skinning, itemOf, maxReq, maxIlvl);

  const prof = AHBOT_PROFESSION;
  if (prof[1] > 0 && prof[3] >= 0 && sources.professionItems.length > 0) {
    const maxTemplates = rollLootSourceCount(prof[0], prof[1], rng);
    for (let i = 0; i < maxTemplates; i++) {
      const itemId = sources.professionItems[rng.int(0, sources.professionItems.length - 1)]!;
      const it = itemOf(itemId);
      if (!it) continue;
      if ((it.requiredLevel | 0) > maxReq || (it.itemLevel ?? 0) > maxIlvl) continue;
      if (it.quality === 0 || rng.int(0, (1 << (it.quality - 1)) - 1) > 0) continue;
      const pct = rng.int(prof[2], prof[3]);
      const count = Math.max(1, Math.round(Math.max(1, it.stackable | 0) * pct / 100));
      itemMap.set(itemId, (itemMap.get(itemId) ?? 0) + count);
    }
  }

  if (itemMap.size === 0 && opts.catalog) {
    const catalog = typeof opts.catalog === 'function' ? opts.catalog() : opts.catalog;
    if (catalog && catalog.length > 0) {
      const sellable = catalog.filter((it) => canBotListItem(it, maxReq));
      if (sellable.length > 0) {
        const n = Math.min(80, sellable.length);
        for (let i = 0; i < n; i++) {
          const it = sellable[rng.int(0, sellable.length - 1)]!;
          const qty = it.stackable > 1 ? rng.int(1, Math.min(5, it.stackable)) : 1;
          itemMap.set(it.entry, (itemMap.get(it.entry) ?? 0) + qty);
        }
      }
    }
  }

  const variance = opts.variance ?? DEFAULT_VALUE_VARIANCE;
  const listOpts = {
    startId: opts.startId,
    nowMs: opts.nowMs,
    seller: DEFAULT_SELLER,
    variance,
    createDs: opts.createDs,
    lookupProp: opts.lookupProp,
    vendorItems: sources.infiniteVendorItems,
    craftFloor: sources.craftFloor,
    pickSeller: () => pickBotSeller(rng, opts.names),
  };
  const out: Auction[] = [];
  for (const [itemId, totalCount] of itemMap) {
    const it = itemOf(itemId);
    if (!it || !canBotListItem(it, maxReq)) continue;
    if ((it.itemLevel ?? 0) > maxIlvl) continue;
    const maxStack = Math.max(1, it.stackable | 0);
    for (let stacked = 0; stacked < totalCount; stacked += maxStack) {
      const quantity = Math.min(maxStack, totalCount - stacked);
      pushListing(out, it, quantity, rng, listOpts);
    }
  }
  return out;
}

export function appendSellPass(
  ah: AuctionHouseState,
  added: Auction[],
): AuctionHouseState {
  if (added.length === 0) return ah;
  return {
    ...ah,
    auctions: [...ah.auctions, ...added],
    nextId: ah.nextId + added.length,
  };
}
