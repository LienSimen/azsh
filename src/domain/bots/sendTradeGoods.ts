// Plan a dump of trade goods into companion bags. A companion takes a stack when a recipe consumes
// it, or when it is a gather mat for a craft they run. Cite: Spell.cpp CheckItems; ItemPrototype.h.

import type { DataStore } from '../../data/dataStore.ts';
import type { EquipSlot, RecipeDef } from '../../data/schema.ts';
import type { Character } from '../character/character.ts';
import { bagCapacity } from '../items/equipment.ts';
import {
  addItem,
  emptyInventory,
  freeSlots,
  transferItem,
  type Inventory,
} from '../items/inventory.ts';
import { hasIdentity } from '../items/itemInstance.ts';
import {
  companionCharacter,
  companionLevel,
  companionSkillMap,
  type Companion,
} from './squad.ts';

/** item_template.class 7 — Trade Goods. Cite: ItemPrototype.h ITEM_CLASS_TRADE_GOODS. */
export const ITEM_CLASS_TRADE_GOODS = 7;

/** Cite: ItemPrototype.h ItemSubclassTradeGoods. */
const ITEM_SUBCLASS_LEATHER = 6;
const ITEM_SUBCLASS_METAL_STONE = 7;
const ITEM_SUBCLASS_HERB = 9;

type GatherLine = 'mining' | 'herbalism' | 'skinning';

export interface TradeGoodsGift {
  companionId: string;
  companionName: string;
  entry: number;
  qty: number;
}

/** Same shape as Game.squadUpgradePlan. Cite: engine/game/types.ts SquadUpgradeRow. */
export interface SendGoodsUpgradeRow {
  companionId: string;
  companionName: string;
  benched: boolean;
  entry: number;
  targetSlot: EquipSlot;
  currentEntry?: number;
  delta: number;
  from: 'theirs' | 'you' | 'bank';
}

/** Bag-bar confirm: trade goods, roster upgrades, and the keys the player clicked off. */
export interface SendGoodsModalState {
  rows: TradeGoodsGift[];
  blocked: string[];
  upgrades: SendGoodsUpgradeRow[];
  blockedGear: string[];
}

/** Matches applySquadUpgrades skip keys (`companionId|entry|targetSlot`). */
export function sendGoodsUpgradeKey(
  r: Pick<SendGoodsUpgradeRow, 'companionId' | 'entry' | 'targetSlot'>,
): string {
  return `${r.companionId}|${r.entry}|${r.targetSlot}`;
}

export function activeSendGoodsUpgrades(
  rows: readonly SendGoodsUpgradeRow[],
  blocked: ReadonlySet<string> | readonly string[],
): SendGoodsUpgradeRow[] {
  const skip = blocked instanceof Set ? blocked : new Set(blocked);
  return rows.filter((r) => !skip.has(sendGoodsUpgradeKey(r)));
}

export function planCompanionShare(
  args: PlanSendTradeGoodsArgs & { upgrades: readonly SendGoodsUpgradeRow[] },
): SendGoodsModalState | null {
  const rows = planSendTradeGoods(args);
  const upgrades = [...args.upgrades];
  if (!rows.length && !upgrades.length) return null;
  return { rows, blocked: [], upgrades, blockedGear: [] };
}

export function applyCompanionShare(
  game: {
    applySquadUpgrades(max?: number, allowKeys?: Iterable<string>): { ok: boolean; equipped?: number };
    giveItemToBot(id: string, entry: number, qty?: number): { ok: boolean; moved?: number };
  },
  modal: SendGoodsModalState,
): { equipped: number; moved: number; lastGoodsEntry?: number } {
  const upgrades = activeSendGoodsUpgrades(modal.upgrades ?? [], modal.blockedGear ?? []);
  const gifts = activeTradeGoodsGifts(modal.rows, modal.blocked);
  let equipped = 0;
  if (upgrades.length) {
    const r = game.applySquadUpgrades(40, upgrades.map(sendGoodsUpgradeKey));
    if (r.ok) equipped = r.equipped ?? 0;
  }
  let moved = 0;
  let lastGoodsEntry: number | undefined;
  for (const g of gifts) {
    const r = game.giveItemToBot(g.companionId, g.entry, g.qty);
    if (r.ok) {
      moved += r.moved ?? 0;
      lastGoodsEntry = g.entry;
    }
  }
  return lastGoodsEntry != null ? { equipped, moved, lastGoodsEntry } : { equipped, moved };
}

export function companionShareResultLine(r: { equipped: number; moved: number }): string {
  if (r.equipped && r.moved) return `Equipped ${r.equipped}, sent ${r.moved}`;
  if (r.equipped) return `Equipped ${r.equipped} upgrade${r.equipped === 1 ? '' : 's'}`;
  if (r.moved) return `Sent ${r.moved} item${r.moved === 1 ? '' : 's'} to companions`;
  return 'Nothing applied';
}

export function tradeGoodsGiftKey(g: Pick<TradeGoodsGift, 'companionId' | 'entry'>): string {
  return `${g.companionId}:${g.entry}`;
}

export function activeTradeGoodsGifts(
  rows: readonly TradeGoodsGift[],
  blocked: ReadonlySet<string> | readonly string[],
): TradeGoodsGift[] {
  const skip = blocked instanceof Set ? blocked : new Set(blocked);
  return rows.filter((g) => !skip.has(tradeGoodsGiftKey(g)));
}

export interface PlanSendTradeGoodsArgs {
  inventory: Inventory;
  squad: readonly Companion[];
  playerLevel: number;
  ds: DataStore;
  /** When set, mining/herb/skinning mats dump to the matching crafter even with no recipe. */
  playerSkills?: Character['skills'];
}

/** Squad plus benched roster, first-seen order. Raid-bench bodies stay out. */
export function goodsCompanions(state: {
  squad?: readonly Companion[] | null;
  botRoster?: Record<string, Companion> | null;
}): Companion[] {
  const seen = new Set<string>();
  const out: Companion[] = [];
  for (const c of state.squad ?? []) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  for (const c of Object.values(state.botRoster ?? {})) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out;
}

/** How many of `item` still fit in `inv` under `cap` (partial stacks first). */
function spaceFor(inv: Inventory, item: number, maxStack: number, cap: number): number {
  const capStack = Math.max(1, maxStack);
  let room = 0;
  for (const s of inv.stacks) {
    if (s.item === item && s.count < capStack && !hasIdentity(s)) {
      room += capStack - s.count;
    }
  }
  room += freeSlots(inv, cap) * capStack;
  return room;
}

function recipeIsUsable(
  recipe: RecipeDef,
  skillCurrent: number,
  known: ReadonlySet<number>,
): boolean {
  if (skillCurrent < recipe.orange) return false;
  if (known.has(recipe.id)) return true;
  return recipe.source === 'trainer' || recipe.source === 'vendor';
}

function reagentEntriesFor(
  skills: ReturnType<typeof companionSkillMap>,
  knownRecipes: readonly number[] | undefined,
  ds: DataStore,
): Set<number> {
  const known = new Set(knownRecipes ?? []);
  const out = new Set<number>();
  for (const recipe of ds.recipes()) {
    const sk = skills[recipe.skill];
    if (!sk || !recipeIsUsable(recipe, sk.current, known)) continue;
    for (const rg of recipe.reagents) {
      if (rg.item > 0) out.add(rg.item);
    }
  }
  return out;
}

function miningMaterialEntries(ds: DataStore): Set<number> {
  const out = new Set<number>();
  for (const recipe of ds.recipes()) {
    if (recipe.skill !== 'mining') continue;
    if (recipe.product.item > 0) out.add(recipe.product.item);
    for (const rg of recipe.reagents) {
      if (rg.item > 0) out.add(rg.item);
    }
  }
  return out;
}

function gatherMaterialSets(
  ds: DataStore,
  playerLines: Set<GatherLine>,
): Record<GatherLine, Set<number>> {
  const mining = playerLines.has('mining') ? miningMaterialEntries(ds) : new Set<number>();
  const herbalism = new Set<number>();
  const skinning = new Set<number>();
  if (playerLines.size === 0) return { mining, herbalism, skinning };
  for (const n of ds.gatherNodes()) {
    if (n.skill !== 'mining' && n.skill !== 'herbalism' && n.skill !== 'skinning') continue;
    if (!playerLines.has(n.skill)) continue;
    const dest = n.skill === 'mining' ? mining : n.skill === 'herbalism' ? herbalism : skinning;
    for (const y of n.yield) {
      if (y.item > 0) dest.add(y.item);
    }
  }
  return { mining, herbalism, skinning };
}

function playerGatherLines(skills: Character['skills'] | undefined): Set<GatherLine> {
  const out = new Set<GatherLine>();
  if (!skills) return out;
  if (skills.mining) out.add('mining');
  if (skills.herbalism) out.add('herbalism');
  if (skills.skinning) out.add('skinning');
  return out;
}

function gatherCraftsOf(skills: ReturnType<typeof companionSkillMap>): Record<GatherLine, boolean> {
  return {
    mining: !!(skills.blacksmithing || skills.engineering),
    herbalism: !!skills.alchemy,
    skinning: !!skills.leatherworking,
  };
}

function gatherLineOf(
  it: { entry: number; itemClass?: number; itemSubclass?: number; questItem?: boolean },
  sets: Record<GatherLine, Set<number>>,
): GatherLine | null {
  if (it.itemClass !== ITEM_CLASS_TRADE_GOODS || it.questItem) return null;
  if (it.itemSubclass === ITEM_SUBCLASS_METAL_STONE || sets.mining.has(it.entry)) return 'mining';
  if (it.itemSubclass === ITEM_SUBCLASS_HERB || sets.herbalism.has(it.entry)) return 'herbalism';
  if (it.itemSubclass === ITEM_SUBCLASS_LEATHER || sets.skinning.has(it.entry)) return 'skinning';
  return null;
}

type GoodsMode = 'all' | 'gather';

type Bucket = {
  id: string;
  name: string;
  reagents: Set<number>;
  crafts: Record<GatherLine, boolean>;
  bags: Inventory;
  cap: number;
};

function planGifts(args: PlanSendTradeGoodsArgs, mode: GoodsMode): TradeGoodsGift[] {
  const { inventory, squad, playerLevel, ds, playerSkills } = args;
  if (!squad.length) return [];

  const remaining = new Map<number, number>();
  const order: number[] = [];
  for (const stk of inventory.stacks) {
    const it = ds.item(stk.item);
    if (!it || it.itemClass !== ITEM_CLASS_TRADE_GOODS || it.questItem) continue;
    if (!remaining.has(stk.item)) order.push(stk.item);
    remaining.set(stk.item, (remaining.get(stk.item) ?? 0) + stk.count);
  }
  if (!order.length) return [];

  const playerLines = playerGatherLines(playerSkills);
  const gatherSets = gatherMaterialSets(ds, playerLines);
  const buckets: Bucket[] = [];
  for (const comp of squad) {
    if (comp.mission) continue;
    const lvl = companionLevel(comp, playerLevel);
    const skills = companionSkillMap(comp, lvl);
    const crafts = gatherCraftsOf(skills);
    const reagents = mode === 'gather' ? new Set<number>() : reagentEntriesFor(skills, comp.knownRecipes, ds);
    if (mode === 'gather') {
      if (!crafts.mining && !crafts.herbalism && !crafts.skinning) continue;
    } else if (reagents.size === 0 && !crafts.mining && !crafts.herbalism && !crafts.skinning) {
      continue;
    }
    const shell = companionCharacter(comp, lvl, ds);
    buckets.push({
      id: comp.id,
      name: comp.name,
      reagents,
      crafts,
      bags: { stacks: (comp.bags ?? emptyInventory()).stacks.map((s) => ({ ...s })) },
      cap: bagCapacity(shell, ds),
    });
  }
  if (!buckets.length) return [];

  const gifts: TradeGoodsGift[] = [];
  for (const entry of order) {
    let left = remaining.get(entry) ?? 0;
    if (left <= 0) continue;
    const it = ds.item(entry);
    if (!it) continue;
    const itemLine = gatherLineOf(it, gatherSets);
    const stackable = Math.max(1, it.stackable || 1);
    for (const b of buckets) {
      if (left <= 0) break;
      const recipeHit = mode !== 'gather' && b.reagents.has(entry);
      const gatherHit = !!itemLine && playerLines.has(itemLine) && b.crafts[itemLine];
      if (!recipeHit && !gatherHit) continue;
      const n = Math.min(left, spaceFor(b.bags, entry, stackable, b.cap));
      if (n <= 0) continue;
      b.bags = addItem(b.bags, entry, n, stackable);
      left -= n;
      gifts.push({ companionId: b.id, companionName: b.name, entry, qty: n });
    }
  }
  return gifts;
}

// Greedy squad-order allocation: each player trade-good stack goes to the first companion who can craft
// with it and still has room, then the next, until gone.
export function planSendTradeGoods(args: PlanSendTradeGoodsArgs): TradeGoodsGift[] {
  return planGifts(args, 'all');
}

/** Gather mats only — mining → BS/eng, herbs → alchemy, leather → LW. */
export function planSendGatherGoods(args: PlanSendTradeGoodsArgs): TradeGoodsGift[] {
  return planGifts(args, 'gather');
}

export function tradeGoodsGiftCount(rows: readonly TradeGoodsGift[]): number {
  let n = 0;
  for (const g of rows) n += g.qty;
  return n;
}

export function dumpGatherGoodsToCompanions(
  args: PlanSendTradeGoodsArgs & { log?: (msg: string) => void },
): { inventory: Inventory; moved: number } {
  const gifts = planSendGatherGoods(args);
  if (!gifts.length) return { inventory: args.inventory, moved: 0 };
  const byId = new Map<string, Companion>();
  for (const c of args.squad) byId.set(c.id, c);
  let inv = args.inventory;
  let moved = 0;
  for (const g of gifts) {
    const comp = byId.get(g.companionId);
    if (!comp) continue;
    const it = args.ds.item(g.entry);
    if (!it) continue;
    const lvl = companionLevel(comp, args.playerLevel);
    const cap = bagCapacity(companionCharacter(comp, lvl, args.ds), args.ds);
    const xfer = transferItem(inv, comp.bags ?? emptyInventory(), g.entry, g.qty, it.stackable ?? 1, cap);
    if (xfer.moved <= 0) continue;
    inv = xfer.from;
    comp.bags = xfer.to;
    moved += xfer.moved;
    args.log?.(`You give ${it.name}${xfer.moved > 1 ? ` ×${xfer.moved}` : ''} to ${comp.name}.`);
  }
  return { inventory: inv, moved };
}

export function dumpGatherGoodsFromState(
  state: {
    inventory: Inventory;
    squad?: readonly Companion[] | null;
    botRoster?: Record<string, Companion> | null;
    char: { level: number; skills: Character['skills'] };
  },
  ds: DataStore,
  log?: (msg: string) => void,
): number {
  const result = dumpGatherGoodsToCompanions({
    inventory: state.inventory,
    squad: goodsCompanions(state),
    playerLevel: state.char.level,
    playerSkills: state.char.skills,
    ds,
    log,
  });
  state.inventory = result.inventory;
  return result.moved;
}
