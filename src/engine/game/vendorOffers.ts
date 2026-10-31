// Vendor shelf resolution: what one purchase costs and delivers, and what limited supply is left. The
// single resolver every vendor surface reads, so a tile cannot promise what the buy then refuses.

import { buyCostCopper } from '../../domain/economy/trading.ts';
import { getRank, reputationPriceDiscount, REP_RANK } from '../../domain/creature/reputation.ts';
import {
  calculateHonorRank,
  highestInternalRank,
  honorRankRequirementTitle,
} from '../../domain/run/honor.ts';
import { honorPriceOf } from '../../domain/economy/honorPrice.ts';
import { factionOf } from '../../domain/character/races.ts';
import { RANK_NAMES } from '../../domain/creature/reputation.ts';
import { getFactionReaction, playerFactionTemplateId } from '../../domain/creature/faction.ts';
import { creatureRepFactionId } from '../../domain/creature/faction.ts';
import { getVendorItemCurrentCount, type VendorStockDef, type VendorItemCountState } from '../../domain/economy/vendorStock.ts';
import type { Character } from '../../domain/character/character.ts';
import type { DataStore } from '../../data/dataStore.ts';
import type { ItemDef } from '../../data/schema.ts';
import type { Game, VendorOffer } from './types.ts';
import type { GameCtx } from './context.ts';

export interface VendorOffersExtras {
  /** Reputation price multiplier for this vendor (1 = no discount). */
  vendorPriceMultiplier: (vendorEntry: number) => number;
  /** Persisted limited-stock tracker for one line, in domain shape. */
  vendorStockTracker: (vendorEntry: number, itemEntry: number) => VendorItemCountState | undefined;
  /** Family-aware bag-space check (quiver/pouch vs general bags). */
  canFitUnits: (itemEntry: number, units: number, stackable: number) => boolean;
  // npc_vendor.condition_id evaluator (Player.cpp:17545 CONDITION_FROM_VENDOR). Required: the 445 baked
  // conditional lines are the WSG/AB rep gear, and omitting it sells them ungated.
  vendorConditionSatisfied: VendorConditionCheck;
}

// GetReputationPriceDiscount for a creature entry (vendor or trainer). Cite: Player.cpp:18339–18357;
// NPCHandler.cpp SendTrainerList / HandleTrainerBuySpellOpcode.
export function vendorPriceMultiplierFor(
  ds: DataStore,
  char: Character,
  creatureEntry: number,
): number {
  const facId = creatureRepFactionId(ds, creatureEntry);
  const fac = facId != null ? ds.faction(facId) : undefined;
  if (!fac) return 1;
  const rank = getRank(char.reputations, fac, char.race, char.cls);
  let visualRank = undefined;
  if (char.honor?.rp) {
    visualRank = calculateHonorRank(char.honor.rp).visualRank;
  }
  let isFriendly = false;
  const playerTemplateId = playerFactionTemplateId(ds, char.race);
  if (playerTemplateId != null && facId != null) {
    const pTemplate = ds.factionTemplate(playerTemplateId);
    const vTemplateId = ds.creature(creatureEntry)?.factionId;
    const vTemplate = vTemplateId != null ? ds.factionTemplate(vTemplateId) : undefined;
    if (pTemplate && vTemplate) {
      isFriendly = getFactionReaction(pTemplate, vTemplate) >= REP_RANK.FRIENDLY;
    }
  }
  return reputationPriceDiscount(rank, visualRank, isFriendly);
}

/** A refusal from the purchase requirement gates, or `ok` when the line may be bought. */
export type VendorRequirement = { ok: true } | { ok: false; reason: string };

// The vendor condition, evaluated by the caller, which owns the snapshot and the table. Undefined means
// no evaluator is wired and the line is NOT refused: a missing supplier must not turn real stock off.
export type VendorConditionCheck = (conditionId: number) => boolean;

// The item's required reputation, with the fallback the item bake cannot carry: an item naming a RANK
// but no faction is gated on the VENDOR's faction. No rows hit it in 1.12. Cite: Player.cpp:17528.
function repRequirement(
  ds: DataStore,
  char: Character,
  vendorEntry: number,
  def: ItemDef,
): VendorRequirement {
  const named = def.requiredRep;
  const wantRank = named?.rank ?? 0;
  if (wantRank <= 0) return { ok: true };
  const facId = named && named.faction > 0 ? named.faction : creatureRepFactionId(ds, vendorEntry);
  const fac = facId != null ? ds.faction(facId) : undefined;
  // Fail closed: a rank is demanded and we cannot resolve who it is with.
  if (!fac) return { ok: false, reason: 'Requires higher reputation' };
  if (getRank(char.reputations, fac, char.race, char.cls) < wantRank) {
    const rankName = RANK_NAMES[wantRank] ?? 'higher';
    return { ok: false, reason: `Requires ${rankName} with ${fac.name}` };
  }
  return { ok: true };
}

// The item's required honor rank against the HIGHEST ever held, plus a required level: PvP bonus items
// are exempt from the normal level gate, so this branch re-checks it. Cite: Player.cpp:17539-17543.
// PRODUCT RULE: rank is status now, so the gate only holds the rows Honor Points do NOT buy — the
// nine war mounts at visual 11, the four tabards and the two battle standards.
function honorRequirement(ds: DataStore, char: Character, def: ItemDef): VendorRequirement {
  const want = def.requiredHonorRank ?? 0;
  if (want <= 0 || honorPriceOf(ds, def) > 0) return { ok: true };
  const faction = factionOf(ds, char.race) === 'horde' ? 'horde' : 'alliance';
  const title = honorRankRequirementTitle(want, faction);
  if (highestInternalRank(char.honor) < want) {
    return { ok: false, reason: `Requires the rank of ${title}` };
  }
  if (char.level < def.requiredLevel) {
    return { ok: false, reason: `Requires level ${def.requiredLevel}` };
  }
  return { ok: true };
}

// Every requirement the vendor purchase checks before it looks at price, in C++ order, so the merchant
// tile and the buy can never disagree. Stock, bag space, gold and unique ownership stay with callers.
export function vendorPurchaseRequirement(
  ds: DataStore,
  char: Character,
  vendorEntry: number,
  def: ItemDef,
  conditionId: number,
  conditionSatisfied?: VendorConditionCheck,
): VendorRequirement {
  const rep = repRequirement(ds, char, vendorEntry, def);
  if (!rep.ok) return rep;
  const honor = honorRequirement(ds, char, def);
  if (!honor.ok) return honor;
  if (conditionId > 0 && conditionSatisfied && !conditionSatisfied(conditionId)) {
    return { ok: false, reason: 'You do not meet the requirements for that' };
  }
  return { ok: true };
}

/** npc_vendor.condition_id for one line, from the baked `itemConditions` list. */
export function vendorLineConditionId(
  vendor: { itemConditions?: ReadonlyArray<{ item: number; conditionId: number }> } | undefined,
  itemEntry: number,
): number {
  if (!vendor?.itemConditions?.length) return 0;
  for (const c of vendor.itemConditions) {
    if (c.item === itemEntry) return c.conditionId | 0;
  }
  return 0;
}

// C++ floor(spellCost * GetReputationPriceDiscount). Cite: NPCHandler.cpp SendTrainerSpellHelper (list
// packet) and HandleTrainerBuySpellOpcode (buy).
export function trainerSpellCost(cost: number, discountMod: number): number {
  return Math.floor(cost * discountMod);
}

// The two lookups the buy path and the shelf must agree on. Kept here (not in game.ts) so there is exactly
// one definition of "what does this cost" and "how much is left".
export function makeVendorHelpers(ctx: GameCtx): Pick<VendorOffersExtras, 'vendorPriceMultiplier' | 'vendorStockTracker'> {
  const { ds, state } = ctx;
  return {
    // The reputation price discount comes off the creature's FACTION TEMPLATE mapped to a real faction:
    // looking up the template id directly misses ~651 capital vendors and collides with real ids.
    vendorPriceMultiplier: (vendorEntry) => vendorPriceMultiplierFor(ds, state.char, vendorEntry),
    // The save omits `itemId` (it is the map key); rebuild the domain shape once, here.
    vendorStockTracker: (vendorEntry, itemEntry) => {
      const row = state.vendorStock?.[vendorEntry]?.[itemEntry];
      return row ? { itemId: itemEntry, count: row.count, lastIncrementTime: row.lastIncrementTime } : undefined;
    },
  };
}

export function createVendorOffersModule(
  ctx: GameCtx,
  extras: VendorOffersExtras,
): Pick<Game, 'vendorOffers'> {
  const { ds, state } = ctx;
  const { vendorPriceMultiplier, vendorStockTracker, canFitUnits, vendorConditionSatisfied } = extras;

  return {
    vendorOffers(vendorEntry, nowMs = Date.now()) {
      const vendor = ds.vendor(vendorEntry);
      if (!vendor) return [];
      const nowSec = Math.floor(nowMs / 1000);
      const priceMultiplier = vendorPriceMultiplier(vendorEntry);
      const offers: VendorOffer[] = [];

      for (const itemEntry of vendor.items) {
        const def = ds.item(itemEntry);
        if (!def || def.buyPrice <= 0) continue; // not purchasable (the panel hides these too)
        const unitsPerPurchase = Math.max(1, def.buyCount ?? 1);
        // A PvP gear line is paid in Honor Points, so its coin price is not what the tile quotes.
        const honorPrice = honorPriceOf(ds, def);
        const pricePerPurchase = honorPrice > 0 ? 0 : buyCostCopper(def, 1, priceMultiplier);

        const row = vendor.stock?.find((s) => s.item === itemEntry);
        let maxStock: number | null = null;
        let stockRemaining: number | null = null;
        let restockInMs: number | null = null;
        let restockEverySec: number | null = null;
        let inStock = true;
        if (row && row.maxcount > 0) {
          const stockDef: VendorStockDef = {
            item: itemEntry,
            maxcount: row.maxcount,
            incrtime: row.incrtime,
            buyCount: unitsPerPurchase,
          };
          const cur = getVendorItemCurrentCount(stockDef, vendorStockTracker(vendorEntry, itemEntry), nowSec);
          maxStock = row.maxcount;
          stockRemaining = cur.available;
          restockEverySec = row.incrtime > 0 ? row.incrtime : null;
          inStock = cur.available >= unitsPerPurchase;
          // Next tick is incrtime after the last one; a full shelf has nothing pending.
          if (cur.state && row.incrtime > 0 && cur.available < row.maxcount) {
            restockInMs = Math.max(0, (cur.state.lastIncrementTime + row.incrtime) * 1000 - nowMs);
          }
        }

        // The requirement gates the buy path runs, so a tile can never promise a rank-gated
        // set piece the purchase then refuses. Cite: Player.cpp:17528-17549.
        const req = vendorPurchaseRequirement(
          ds,
          state.char,
          vendorEntry,
          def,
          vendorLineConditionId(vendor, itemEntry),
          vendorConditionSatisfied,
        );

        offers.push({
          itemEntry,
          unitsPerPurchase,
          pricePerPurchase,
          basePricePerPurchase: def.buyPrice,
          maxStock,
          stockRemaining,
          restockInMs,
          restockEverySec,
          inStock,
          fits: canFitUnits(itemEntry, unitsPerPurchase, def.stackable ?? 1),
          honorPrice,
          affordable: honorPrice > 0
            ? (state.char.honor?.honorPoints ?? 0) >= honorPrice
            : state.char.gold >= pricePerPurchase,
          meetsRequirements: req.ok,
          ...(req.ok ? {} : { requirementReason: req.reason }),
        });
      }
      return offers;
    },
  };
}
