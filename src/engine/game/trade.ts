// Trainer / buy / ammo / sell / discard / move / repair / wrap. Pattern C: createTradeModule(ctx, extras).
// No import of game.ts. Junk inners + runAutoEquipUpgrades come from equipmentHelper extras.

import { mulberry32, hashSeed } from '../core/rng.ts';
import { lowerRanksFor } from '../../domain/character/character.ts';
import {
  ensureLivePlayerRotation,
  upgradeSpellInRotation,
} from '../../domain/rotation/rotation.ts';
import { roleSpecOverride } from '../../domain/bots/companionRotation.ts';
import {
  setAmmo as doSetAmmo,
  removeAmmo as doRemoveAmmo,
  maybeAutoSelectAmmo,
  isAmmoItem,
  canFitWithBagFamily,
  packInventoryByBagFamily,
} from '../../domain/items/ammo.ts';
import {
  isKeyItem,
  addToKeyring,
  emptyKeyring,
  takeKeyringStack,
} from '../../domain/items/keyring.ts';
import {
  canAcceptUnique,
  uniqueSignalsOf,
} from '../../domain/items/itemRestrictions.ts';
import { mailboxAsInventory } from '../../domain/economy/mail.ts';
import {
  replaceSpell as replaceBarSpell,
} from '../../domain/character/actionbar.ts';
import { buy, sell, sellStack, isValidTradeQty } from '../../domain/economy/trading.ts';
import {
  canBuyWithStock, updateVendorItemCurrentCount,
  type VendorStockDef,
  type VendorItemCountState,
} from '../../domain/economy/vendorStock.ts';
import {
  repairAll as doRepairAll,
  repairSlot as doRepairSlot,
  repairCostParty,
  repairCostSlot,
} from '../../domain/items/durability.ts';
import {
  companionCharacter,
  companionLevel,
} from '../../domain/bots/squad.ts';
import {
  emptyInventory, removeStack, countItem, moveStack,
  isValidBagSlotIndex,
  isWrappingPaper, canWrapTarget, shouldBindOnWrap, resolveGiftEntryForPaper,
  wrapItem as wrapItemInInv, unwrapItem as unwrapItemInInv, isFilledGift,
} from '../../domain/items/inventory.ts';
import { resolveSpellId } from '../../domain/character/spellbook.ts';
import { canInteractWithCreature, type ForcedReactions } from '../../domain/creature/faction.ts';
import { train } from '../../progression/training.ts';
import { moneyMarked } from '../../domain/economy/money.ts';
import { honorPriceOf, honorPriceText } from '../../domain/economy/honorPrice.ts';
import { newHonorState, spendHonorPoints } from '../../domain/run/honor.ts';
import { refuseIfDead } from '../../domain/run/death.ts';
import {
  trainerSpellCost,
  vendorLineConditionId,
  vendorPurchaseRequirement,
  type VendorConditionCheck,
} from './vendorOffers.ts';
import type { Game } from './types.ts';
import type { GameCtx } from './context.ts';
import { autofillPlayerBars } from './barAutofill.ts';

export type TradeExtras = {
  vendorPriceMultiplier: (vendorEntry: number) => number;
  vendorStockTracker: (vendorEntry: number, itemEntry: number) => VendorItemCountState | undefined;
  /** npc_vendor.condition_id evaluator. Cite: Player.cpp:17545 CONDITION_FROM_VENDOR. */
  vendorConditionSatisfied: VendorConditionCheck;
  playerForcedReactions: () => ForcedReactions | undefined;
  atWarFactions: () => ReadonlySet<number>;
  repairDiscountMod: (vendorEntry?: number) => number;
  /** Cheapest canRepair vendor in the player's current zone (null when the zone has none). */
  zoneRepairVendor: () => { entry: number; name: string; mod: number } | null;
  runAutoEquipUpgrades: (max?: number) => number;
  sellAllJunkInner: () => { ok: true; earned: number; count: number } | { ok: false; reason: string };
  discardItemInner: (itemEntry: number, qty: number) => { ok: true; discarded: number } | { ok: false; reason: string };
  eligibleSpellIds: () => number[];
};

export function createTradeModule(
  ctx: GameCtx,
  extras: TradeExtras,
): Pick<
  Game,
  | 'learnFromTrainer'
  | 'buyItem'
  | 'setAmmo'
  | 'clearAmmo'
  | 'sellItem'
  | 'sellItemStack'
  | 'sellAllJunk'
  | 'discardItem'
  | 'discardBagStack'
  | 'discardKeyringStack'
  | 'moveItem'
  | 'repairAll'
  | 'repairQuote'
  | 'repairSlot'
  | 'wrapItem'
  | 'unwrapItem'
> {
  const { ds, state, log, cap, refreshQuests } = ctx;
  const {
    vendorPriceMultiplier,
    vendorStockTracker,
    vendorConditionSatisfied,
    playerForcedReactions,
    atWarFactions,
    repairDiscountMod,
    zoneRepairVendor,
    runAutoEquipUpgrades,
    sellAllJunkInner,
    discardItemInner,
    eligibleSpellIds,
  } = extras;

  // Party bill repairAll would charge right now — shared so the quote can never drift from it.
  const repairBill = (vendorEntry?: number): number => {
    const partyShells = (state.squad ?? []).map((comp) =>
      companionCharacter(comp, companionLevel(comp, state.char.level), ds),
    );
    return repairCostParty(state.char, partyShells, ds.item, repairDiscountMod(vendorEntry));
  };

  // The repairer has to be standing there and willing: a named NPC who refuses, or a zone with no
  // repairer, mends nothing. Cite: NPCHandler.cpp:996 GetNPCIfCanInteractWith(UNIT_NPC_FLAG_REPAIR).
  const repairRefusal = (vendorEntry?: number): { ok: false; reason: string } | null => {
    if (!vendorEntry) return zoneRepairVendor() ? null : { ok: false, reason: 'No repairs here' };
    if (!ds.vendor(vendorEntry)?.canRepair) return { ok: false, reason: 'No repairs here' };
    if (!canInteractWithCreature(ds, state.char.race, vendorEntry, atWarFactions(), playerForcedReactions())) {
      return { ok: false, reason: 'They refuse to deal with you.' };
    }
    return null;
  };

  return {
    learnFromTrainer(trainerEntry, spellId) {
      const trainer = ds.trainer(trainerEntry);
      // Enemy-faction / orphan service trainers refuse (Unit::CanInteract; KI-433 fail-closed).
      // force_reaction auras (crown / ogre suit) and the run map must open service doors.
      if (!canInteractWithCreature(ds, state.char.race, trainerEntry, atWarFactions(), playerForcedReactions())) {
        return { ok: false, reason: 'They refuse to deal with you.' };
      }
      // Match either the listed id or a LEARN stub that teaches it (pre-resolve trainer lists).
      const ts = trainer?.spells.find((s) => s.spell === spellId || resolveSpellId(s.spell, ds) === spellId);
      if (!ts) return { ok: false, reason: "The trainer doesn't offer that" };
      const discountMod = vendorPriceMultiplier(trainerEntry);
      const res = train(state.char, state.spellbook, ts, ds, discountMod);
      if (!res.ok) return { ok: false, reason: res.reason ?? 'Cannot learn' };
      const granted = res.learnedSpell ?? resolveSpellId(ts.spell, ds);
      state.char = res.char;
      state.spellbook = res.spellbook;
      // Rank-up: keep the bar slot + hand-edited rotation on the new id (not a full wipe).
      const lowers = lowerRanksFor(state.spellbook, granted, ds);
      if (lowers.length) {
        for (const oldId of lowers) {
          state.actionBars = replaceBarSpell(state.actionBars, oldId, granted);
        }
        if (state.rotation?.custom) {
          state.rotation = upgradeSpellInRotation(state.rotation, lowers, granted);
        }
      }
      // An untouched default is rebuilt so newly trained kit spells enter autofight without a UI-only
      // rotation call. A custom list stays; the kit signature is the gate.
      {
        const role = state.squadRole;
        const band = state.rotationSpec
          ?? ((role === 'healer' || role === 'tank')
            ? (roleSpecOverride(state.char.cls, role) ?? undefined)
            : undefined);
        state.rotation = ensureLivePlayerRotation(
          state.rotation,
          state.char,
          state.spellbook,
          ds,
          state.inventory,
          { band: band ?? null, role },
        );
      }
      // Drop any newly-learned (or first-time) abilities onto free slots (idempotent).
      autofillPlayerBars(state, eligibleSpellIds());
      log(`Learned ${ds.spell(granted)?.name ?? granted} for ${moneyMarked(trainerSpellCost(ts.cost, discountMod))}.`);
      return { ok: true };
    },

    buyItem(vendorEntry, itemEntry, qty = 1) {
      // Dead cannot trade (KI-914). Cite: Player.cpp:17470 BuyItemFromVendor !IsAlive.
      {
        const dead = refuseIfDead(state.char.health, state.deathFlow);
        if (dead) return dead;
      }
      // Before bag/stock math — else NaN→"bag space" and BigInt throws (KI-434).
      if (!isValidTradeQty(qty)) return { ok: false, reason: 'Invalid quantity' };
      const vendor = ds.vendor(vendorEntry);
      if (!vendor) return { ok: false, reason: 'No vendor here' };
      // Enemy-faction / orphan service vendors refuse (Unit::CanInteract; KI-433 fail-closed).
      // force_reaction auras (King of the Gordok / ogre suit) and the run map must open trade.
      if (!canInteractWithCreature(ds, state.char.race, vendorEntry, atWarFactions(), playerForcedReactions())) {
        return { ok: false, reason: 'They refuse to deal with you.' };
      }
      if (!vendor.items.includes(itemEntry)) return { ok: false, reason: "The vendor doesn't sell that" };
      const def = ds.item(itemEntry);
      if (!def) return { ok: false, reason: 'Unknown item' };
      // RequiredReputation + requiredhonorrank + npc_vendor.condition_id, in the C++ order and
      // through the same resolver the merchant tile reads. Cite: Player.cpp:17528-17549.
      {
        const req = vendorPurchaseRequirement(
          ds,
          state.char,
          vendorEntry,
          def,
          vendorLineConditionId(vendor, itemEntry),
          vendorConditionSatisfied,
        );
        if (!req.ok) return { ok: false, reason: req.reason };
      }
      // PvP gear is paid in Honor Points, not coin. `buy` below still mints the item and does the
      // bag/unique math, so it is charged a multiplier of 0 and the purse is debited after it lands.
      const honorCost = honorPriceOf(ds, def) * qty;
      if (honorCost > 0 && (state.char.honor?.honorPoints ?? 0) < honorCost) {
        return { ok: false, reason: `Requires ${honorPriceText(honorCost)}` };
      }
      const priceMultiplier = honorCost > 0 ? 0 : vendorPriceMultiplier(vendorEntry);
      // Limited stock (npc_vendor maxcount/incrtime): lazy restock then availability gate.
      // Cite: Creature.cpp:2512 GetVendorItemCurrentCount / :2547 UpdateVendorItemCurrentCount.
      const buyCount = Math.max(1, def.buyCount ?? 1);
      const stockRow = vendor.stock?.find((s) => s.item === itemEntry);
      const nowSec = Math.floor(Date.now() / 1000);
      let stockDef: VendorStockDef | undefined;
      if (stockRow && stockRow.maxcount > 0) {
        stockDef = { item: itemEntry, maxcount: stockRow.maxcount, incrtime: stockRow.incrtime, buyCount };
        const chk = canBuyWithStock(stockDef, vendorStockTracker(vendorEntry, itemEntry), qty, nowSec);
        if (!chk.ok) return { ok: false, reason: chk.reason ?? 'Item already sold out' };
      }
      // Family-aware bag space (quiver/pouch only hold matching ammo; else general bags).
      // Keys skip bag space — they land on the unbounded keyring.
      const unitsCheck = qty * Math.max(1, buyCount);
      const toKeyring = isKeyItem(def);
      if (!toKeyring && !canFitWithBagFamily(state.inventory, state.char, ds, itemEntry, unitsCheck, def.stackable ?? 1)) {
        return { ok: false, reason: 'Not enough bag space' };
      }
      // MaxCount / Unique ownership. Cite: Player.cpp CanStoreNewItem ~8552.
      const uniqBuy = canAcceptUnique(
        state.inventory,
        state.char,
        itemEntry,
        uniqueSignalsOf(def),
        undefined,
        {
          bank: state.bank,
          keyring: state.keyring ?? emptyKeyring(),
          mailbox: mailboxAsInventory(state.mailbox ?? []),
        },
      );
      if (!uniqBuy.ok) {
        return { ok: false, reason: uniqBuy.reason };
      }
      if (uniqBuy.room != null && Number.isFinite(uniqBuy.room) && unitsCheck > uniqBuy.room) {
        return {
          ok: false,
          reason: uniqBuy.room === 0
            ? 'Unique: you may only carry one'
            : `You may only carry ${uniqBuy.room} more`,
        };
      }
      // Wave Q P2: vendor buy is a new-copy create site — roll randomProperty at purchase.
      const buyRng = mulberry32(hashSeed(state.rngSeed, state.fightCounter++));
      // `res` must live outside the keyring/bags branch — log + return read res.amount.
      let res: ReturnType<typeof buy>;
      if (toKeyring) {
        // Charge gold via buy() against a disposable empty bag, then place on keyring.
        res = buy(state.char, emptyInventory(), def, qty, Number.MAX_SAFE_INTEGER, priceMultiplier, buyCount, {
          ds,
          rng: buyRng,
        });
        if (!res.ok) return { ok: false, reason: res.reason ?? 'Cannot buy' };
        state.char = res.char;
        const bought = res.inventory.stacks[0];
        state.keyring = addToKeyring(
          state.keyring ?? emptyKeyring(),
          itemEntry,
          unitsCheck,
          def,
          bought,
        );
      } else {
        res = buy(state.char, state.inventory, def, qty, cap(), priceMultiplier, buyCount, {
          ds,
          rng: buyRng,
        });
        if (!res.ok) return { ok: false, reason: res.reason ?? 'Cannot buy' };
        state.char = res.char;
        // Prefer quiver/pouch slots for projectiles; overflow into backpack/generic bags.
        state.inventory = packInventoryByBagFamily(res.inventory, state.char, ds);
      }
      if (stockDef) {
        const upd = updateVendorItemCurrentCount(
          stockDef, vendorStockTracker(vendorEntry, itemEntry), buyCount * qty, nowSec,
        );
        const byVendor = { ...(state.vendorStock ?? {}) };
        const byItem = { ...(byVendor[vendorEntry] ?? {}) };
        if (upd.state) byItem[itemEntry] = { count: upd.state.count, lastIncrementTime: upd.state.lastIncrementTime };
        else delete byItem[itemEntry];
        byVendor[vendorEntry] = byItem;
        state.vendorStock = byVendor;
      }
      if (honorCost > 0) {
        // Checked above and nothing between here and there touches the purse, so this cannot fail.
        const paid = spendHonorPoints(state.char.honor ?? newHonorState(), honorCost);
        if (paid) state.char = { ...state.char, honor: paid };
      }
      refreshQuests(); // a bought item may satisfy a gather objective
      const units = buyCount * qty;
      const spent = res.ok ? res.amount : 0;
      const paidLabel = honorCost > 0 ? honorPriceText(honorCost) : moneyMarked(spent);
      log(`Bought ${units > 1 ? `${units}x ` : ''}${def.name} for ${paidLabel}.`);

      // Auto-select ammo on vendor buy when no valid selection. Cite: FindAmmo / create SetAmmo.
      if (isAmmoItem(def)) {
        state.char = maybeAutoSelectAmmo(state.char, state.inventory, ds, itemEntry);
      }

      // Equipment helper auto (vendor purchase)
      if (def.slot) runAutoEquipUpgrades(3);
      return { ok: true, spent };
    },

    setAmmo(itemEntry) {
      const res = doSetAmmo(state.char, ds, itemEntry);
      if (!res.ok) return { ok: false, reason: res.reason ?? 'Cannot use that ammo' };
      // Must own at least one (HasItemCount) for a meaningful selection - allow set for
      // create-style when bags will fill next; still require presence for player API.
      if (countItem(state.inventory, itemEntry) < 1) {
        return { ok: false, reason: "You don't have that ammo" };
      }
      state.char = res.char;
      log(`Ammo set: ${ds.item(itemEntry)?.name ?? itemEntry}.`);
      return { ok: true };
    },

    clearAmmo() {
      state.char = doRemoveAmmo(state.char);
      log('Ammo cleared.');
      return { ok: true };
    },

    sellItem(itemEntry, qty = 1) {
      // Dead cannot sell (KI-914). Cite: GetNPCIfCanInteractWith + IsAlive vendor path.
      {
        const dead = refuseIfDead(state.char.health, state.deathFlow);
        if (dead) return dead;
      }
      const def = ds.item(itemEntry);
      if (!def) return { ok: false, reason: 'Unknown item' };
      const res = sell(state.char, state.inventory, def, qty);
      if (!res.ok) return { ok: false, reason: res.reason ?? 'Cannot sell' };
      state.char = res.char;
      state.inventory = res.inventory;
      refreshQuests(); // selling a quest item can revert a completed quest
      const sold = res.qty ?? res.buybackEntry?.qty ?? qty; // may partial-cap near MAX_MONEY
      log(`Sold ${sold > 1 ? `${sold}x ` : ''}${def.name} for ${moneyMarked(res.amount)}.`);
      return { ok: true, earned: res.amount, qty: sold };
    },

    sellItemStack(slotIndex, qty) {
      {
        const dead = refuseIfDead(state.char.health, state.deathFlow);
        if (dead) return dead;
      }
      const stacks = state.inventory.stacks;
      // KI-811: reject NaN/float/null like moveItem (KI-694); loose bounds let them index-crash.
      if (!isValidBagSlotIndex(slotIndex) || slotIndex >= stacks.length) {
        return { ok: false, reason: 'Invalid slot' };
      }
      const stk = stacks[slotIndex];
      if (!stk) return { ok: false, reason: 'Invalid slot' };
      const def = ds.item(stk.item);
      if (!def) return { ok: false, reason: 'Unknown item' };
      // Explicit qty must be a positive integer (matching sellItem); omit to sell whole stack.
      // Bare qty <= 0 misses NaN/floats (NaN <= 0 is false in JS).
      if (qty != null && !isValidTradeQty(qty)) return { ok: false, reason: 'Invalid quantity' };
      const q = qty != null ? qty : stk.count;
      const res = sellStack(state.char, state.inventory, def, slotIndex, q);
      if (!res.ok) return { ok: false, reason: res.reason ?? 'Cannot sell' };
      state.char = res.char;
      state.inventory = res.inventory;
      refreshQuests(); // selling a quest item can revert a completed quest
      const sold = res.qty ?? res.buybackEntry?.qty ?? q;
      log(`Sold ${sold > 1 ? `${sold}x ` : ''}${def.name} for ${moneyMarked(res.amount)}.`);
      return { ok: true, earned: res.amount, qty: sold };
    },

    sellAllJunk() {
      // Dead cannot sell junk (KI-930). Inner also gates for auto-sell paths.
      {
        const dead = refuseIfDead(state.char.health, state.deathFlow);
        if (dead) return dead;
      }
      // Filter-driven sell (default: greys with sell price). Quest/keep/upgrade/DE-claim protected.
      return sellAllJunkInner();
    },

    discardItem(itemEntry, qty = 1) {
      return discardItemInner(itemEntry, qty);
    },

    /** Destroy the bag stack at index only (multi-select destroy; does not drain other stacks). */
    discardBagStack(index: number, qty?: number) {
      if (!isValidBagSlotIndex(index)) return { ok: false, reason: 'Invalid slot' };
      const src = state.inventory.stacks[index];
      if (!src) return { ok: false, reason: 'Nothing there' };
      // Explicit qty must be a positive integer (matches discardItem); omit = whole stack.
      // Invalid qty must refuse — not fall through to full destroy (KI-928).
      if (qty != null && !isValidTradeQty(qty)) return { ok: false, reason: 'Invalid quantity' };
      const take = qty != null ? Math.min(qty, src.count) : src.count;
      const [inv, n] = removeStack(state.inventory, index, take);
      if (n <= 0) return { ok: false, reason: 'Nothing there' };
      state.inventory = inv;
      const def = ds.item(src.item);
      if (def && isAmmoItem(def)) {
        state.char = maybeAutoSelectAmmo(state.char, state.inventory, ds);
      }
      refreshQuests();
      log(`Destroyed ${n > 1 ? `${n}x ` : ''}${def?.name ?? src.item}.`);
      return { ok: true, discarded: n };
    },

    /** Destroy the keyring stack at index (UI keyring cells). */
    discardKeyringStack(index: number, qty?: number) {
      if (!isValidBagSlotIndex(index)) return { ok: false, reason: 'Invalid slot' };
      const kr = state.keyring ?? emptyKeyring();
      const src = kr.stacks[index];
      if (!src) return { ok: false, reason: 'Nothing there' };
      // Same qty gate as discardBagStack / discardItem (KI-928).
      if (qty != null && !isValidTradeQty(qty)) return { ok: false, reason: 'Invalid quantity' };
      const take = qty != null ? Math.min(qty, src.count) : src.count;
      const [next, taken] = takeKeyringStack(kr, index, take);
      if (!taken) return { ok: false, reason: 'Nothing there' };
      state.keyring = next;
      const def = ds.item(taken.item);
      refreshQuests();
      log(`Destroyed ${taken.count > 1 ? `${taken.count}x ` : ''}${def?.name ?? taken.item}.`);
      return { ok: true, discarded: taken.count };
    },

    moveItem(from, to, qty) {
      // Finite non-negative integers only: a NaN or float index must not reach stack indexing, where
      // the lookup is undefined and merge-key equality throws. An index past the end appends.
      if (!isValidBagSlotIndex(from) || !isValidBagSlotIndex(to)) {
        return { ok: false, reason: 'Invalid slot' };
      }
      // Explicit qty must be a positive finite integer (buy/sell/discard contract).
      // Omit qty to move the whole stack (UI bag rearrange never passes qty).
      if (qty != null && !isValidTradeQty(qty)) {
        return { ok: false, reason: 'Invalid quantity' };
      }
      const src = state.inventory.stacks[from];
      if (!src) return { ok: false, reason: 'Nothing to move' };
      if (qty != null && qty > src.count) {
        return { ok: false, reason: "You don't have that" };
      }
      const maxStack = ds.item(src.item)?.stackable ?? 1;
      // Pass qty so partial split/merge is honored (KI-899); omit → whole stack.
      state.inventory = moveStack(state.inventory, from, to, maxStack, qty);
      return { ok: true };
    },

    repairAll(vendorEntry?: number) {
      // Dead cannot repair (KI-929). Cite: vendor interact requires IsAlive.
      {
        const dead = refuseIfDead(state.char.health, state.deathFlow);
        if (dead) return dead;
      }
      {
        const refused = repairRefusal(vendorEntry);
        if (refused) return refused;
      }
      // Party bill: player paperdoll + every active squad companion. Player pays
      // from their gold (companions don't hold a separate purse for repair).
      const cost = repairBill(vendorEntry);
      if (cost <= 0) return { ok: false, reason: 'Nothing needs repair' };
      if (state.char.gold < cost) return { ok: false, reason: 'Not enough money' };
      state.char = { ...doRepairAll(state.char), gold: state.char.gold - cost };
      for (const comp of state.squad ?? []) {
        if (comp.durability && Object.keys(comp.durability).length > 0) {
          comp.durability = {};
        }
      }
      const n = (state.squad ?? []).length;
      log(n > 0
        ? `Repaired your gear and ${n} companion${n === 1 ? '' : 's'} for ${moneyMarked(cost)}.`
        : `Repaired all gear for ${moneyMarked(cost)}.`);
      return { ok: true, spent: cost };
    },

    repairQuote(vendorEntry?: number) {
      const v = vendorEntry != null ? ds.vendor(vendorEntry) : zoneRepairVendor();
      const canRepair = vendorEntry != null
        ? !!ds.vendor(vendorEntry)?.canRepair
        : v != null;
      return {
        cost: repairBill(vendorEntry),
        vendorEntry: canRepair ? (v?.entry ?? null) : null,
        vendorName: canRepair ? (v?.name ?? null) : null,
      };
    },

    // MerchantRepairItemButton path: mend one paperdoll slot (Player::DurabilityRepair).
    repairSlot(slot, vendorEntry?: number) {
      {
        const dead = refuseIfDead(state.char.health, state.deathFlow);
        if (dead) return dead;
      }
      {
        const refused = repairRefusal(vendorEntry);
        if (refused) return refused;
      }
      const cost = repairCostSlot(state.char, slot, ds.item, repairDiscountMod(vendorEntry));
      if (cost <= 0) return { ok: false, reason: 'Item does not need repair' };
      if (state.char.gold < cost) return { ok: false, reason: 'Not enough money' };
      state.char = { ...doRepairSlot(state.char, slot), gold: state.char.gold - cost };
      log(`Repaired ${slot} for ${moneyMarked(cost)}.`);
      return { ok: true, spent: cost };
    },

    // FI9 gift wrap: paper slot + target bag slot → gift shell with wrappedItemEntry.
    wrapItem(paperSlot, targetSlot) {
      const paperStack = state.inventory.stacks[paperSlot];
      if (!paperStack) return { ok: false, reason: 'No wrapping paper' };
      const paperDef = ds.item(paperStack.item);
      if (!isWrappingPaper(paperDef)) return { ok: false, reason: 'That is not wrapping paper' };

      const targetStack = state.inventory.stacks[targetSlot];
      const targetDef = targetStack ? ds.item(targetStack.item) : undefined;
      const gate = canWrapTarget(targetDef, targetStack);
      if (!gate.ok) return { ok: false, reason: gate.reason };

      const giftEntry = resolveGiftEntryForPaper(
        paperStack.item,
        paperDef?.name ?? '',
        (name) => {
          // Linear scan is fine: wrap is rare; avoids inventing gift entries.
          for (const it of ds.items()) {
            if (it.name === name) return it.entry;
          }
          return undefined;
        },
      );
      if (giftEntry == null) return { ok: false, reason: 'Unknown gift type' };

      const bind = shouldBindOnWrap(targetDef?.binding, !!targetStack?.bound);
      const res = wrapItemInInv(state.inventory, paperSlot, targetSlot, giftEntry, bind);
      if (!res.ok) return { ok: false, reason: res.reason };
      state.inventory = res.inventory;
      const paperName = paperDef?.name ?? 'wrapping paper';
      const targetName = targetDef?.name ?? String(res.wrappedEntry);
      const giftName = ds.item(res.giftEntry)?.name ?? 'gift';
      log(`You wrap ${targetName} with ${paperName} → ${giftName}.`);
      return { ok: true, giftEntry: res.giftEntry, wrappedEntry: res.wrappedEntry, bound: res.bound };
    },

    // FI9 unwrap: restore original entry from a filled gift stack.
    unwrapItem(slotIndex) {
      const stack = state.inventory.stacks[slotIndex];
      if (!stack || !isFilledGift(stack)) {
        return { ok: false, reason: 'This gift is empty' };
      }
      const res = unwrapItemInInv(state.inventory, slotIndex);
      if (!res.ok) return { ok: false, reason: res.reason };
      state.inventory = res.inventory;
      const giftName = ds.item(stack.item)?.name ?? 'gift';
      const restoredName = ds.item(res.restoredEntry)?.name ?? String(res.restoredEntry);
      log(`You unwrap ${giftName} and find ${restoredName}.`);
      runAutoEquipUpgrades(3);
      return { ok: true, restoredEntry: res.restoredEntry, bound: res.bound };
    },
  };
}
