// The auction house: a shared marketplace, stocked and traded against by autofill bots. Pure and
// serializable — every op returns new Inventory, gold and AuctionHouseState. Bids escrow at once.

import type { Inventory } from '../items/inventory.ts';
import { addItem, addInstance, removeItem, takeStack, countItem, canFit, BACKPACK_SLOTS } from '../items/inventory.ts';
import type { ItemInstance } from '../items/itemInstance.ts';
import { copyInstance, hasIdentity, instancesStackable } from '../items/itemInstance.ts';
import { canTradeItem } from '../items/itemBonding.ts';

export interface Auction {
  id: number;
  item: number;
  quantity: number;
  bidCopper: number;        // current high bid; equals the opening bid while highBidder is null
  highBidder: string | null; // who currently holds the bid (null = no bids yet)
  buyoutCopper: number;     // instant-buy price (>= bidCopper)
  seller: string;
  /** AHBot listing (C++ owner == 0). Named seller is display-only. */
  bot?: boolean;
  expiresAt: number;        // ms epoch
  // The listed item's full identity (rolled suffix, bound, enchant), so a green "of the Falcon"
  // sells and delivers as itself. Absent is a plain entry+quantity listing. This is the wire format.
  instance?: ItemInstance;
}

export interface AuctionHouseState {
  auctions: Auction[];
  nextId: number; // monotonic id source so listings never collide across a session
  /** Last AHBot world tick (ms). Catch-up uses 120s slices. Cite: World.cpp:1363. */
  lastTickMs?: number;
}

export function emptyAuctionHouse(): AuctionHouseState {
  return { auctions: [], nextId: 1, lastTickMs: 0 };
}

// ---- CMaNGOS-faithful fees (AuctionHouseMgr.cpp) ----------------------------

/** Shortest auction duration unit in seconds. CMaNGOS: `#define MIN_AUCTION_TIME (2*HOUR)` with HOUR=3600. */
export const MIN_AUCTION_TIME = 2 * 3600; // 7200s - AuctionHouseMgr.h

// Faction AH deposit rate from AuctionHouse.dbc (`depositPercent` / m_depositRate). Classic faction houses
// use 5 (the neutral Blackwater house uses 25). // DBC-sourced (bake-dependent)
export const AUCTION_DEPOSIT_PERCENT = 5;

// Faction AH house cut from AuctionHouse.dbc (`cutPercent` / m_consignmentRate). Classic faction houses use
// 5 (neutral houses use 15). // DBC-sourced (bake-dependent)
export const AUCTION_CUT_PERCENT = 5;

// Listing deposit in copper: SellPrice * count * (time / MIN_AUCTION_TIME) * depositPercent / 100,
// truncating like the C++ uint. Cite: AuctionHouseMgr.cpp:65 GetAuctionDeposit.
export function auctionDeposit(sellPrice: number, count: number, durationSeconds: number): number {
  const steps = Math.floor(durationSeconds / MIN_AUCTION_TIME);
  const deposit = sellPrice * count * steps * (AUCTION_DEPOSIT_PERCENT / 100);
  return Math.floor(deposit);
}

// House cut of a successful sale: uint32(cutPercent * bid * rate / 100.0f), rate 1.0. Seller gets
// the bid minus the cut; the deposit is charged at list and never refunded. Cite: cpp:733.
export function auctionCut(winningBid: number): number {
  return Math.floor((AUCTION_CUT_PERCENT * winningBid) / 100);
}

// The minimum next bid on an auction: the opening bid if untouched, otherwise the current bid plus WoW's 5%
// increment (at least 1 copper so cheap listings still move).
export function minNextBid(a: Auction): number {
  if (a.highBidder == null) return a.bidCopper;
  return a.bidCopper + Math.max(1, Math.floor(a.bidCopper * 0.05));
}

export interface Check {
  ok: boolean;
  reason?: string;
}
export interface ListResult extends Check {
  inventory: Inventory;
  ah: AuctionHouseState;
  gold: number;             // seller gold after deposit (unchanged when listing fails before charge)
  deposit?: number;         // copper charged for this listing (0 when free / unpriced)
  auction?: Auction;
}
export interface BuyResult extends Check {
  inventory: Inventory;
  ah: AuctionHouseState;
  gold: number;
  bought?: { item: number; quantity: number };
  refundToBuyer?: number; // if the buyer was the high bidder, their escrowed bid comes back
}
export interface BidResult extends Check {
  ah: AuctionHouseState;
  gold: number;
}
export interface CancelResult extends Check {
  inventory: Inventory;
  ah: AuctionHouseState;
}

const failList = (reason: string, inventory: Inventory, ah: AuctionHouseState, gold: number): ListResult =>
  ({ ok: false, reason, inventory, ah, gold });
const failBuy = (reason: string, ah: AuctionHouseState, inventory: Inventory, gold: number): BuyResult => ({ ok: false, reason, ah, inventory, gold });
const failBid = (reason: string, ah: AuctionHouseState, gold: number): BidResult => ({ ok: false, reason, ah, gold });
const failCancel = (reason: string, ah: AuctionHouseState, inventory: Inventory): CancelResult => ({ ok: false, reason, ah, inventory });

export interface ListParams {
  item: number;
  quantity: number;
  bidCopper: number;    // opening bid
  buyoutCopper: number;
  seller: string;
  expiresAt: number;
  /** Vendor sell price (copper) of one unit - drives the CMaNGOS deposit. Defaults to 0 (free post). */
  sellPrice?: number;
  /** Listing duration in seconds for deposit scaling (time / MIN_AUCTION_TIME). Defaults to 0. */
  durationSeconds?: number;
  /** Seller's gold; deposit is deducted when listing. Defaults to 0. */
  gold?: number;
  // The specific instance being listed. When present, the listing — and the item delivered on
  // buyout or returned on cancel — carries its full identity. Absent is a plain listing.
  instance?: ItemInstance;
}

/** List `quantity` of an item from the bags for sale. Pulls the items out of the backpack and charges the deposit. */
export function listAuction(inv: Inventory, ah: AuctionHouseState, p: ListParams): ListResult {
  const gold = p.gold ?? 0;
  if (p.quantity < 1) return failList('Invalid quantity', inv, ah, gold);
  if (p.buyoutCopper < 1 || p.bidCopper < 1) return failList('Invalid price', inv, ah, gold);
  if (p.bidCopper > p.buyoutCopper) return failList('Bid cannot exceed buyout', inv, ah, gold);
  if (countItem(inv, p.item) < p.quantity) return failList("You don't have that many", inv, ah, gold);
  // Soulbound instances cannot be auctioned (ItemHandler / canTradeItem).
  if (p.instance && !canTradeItem(!!p.instance.bound)) {
    return failList('That item is soulbound', inv, ah, gold);
  }
  // CMaNGOS GetAuctionDeposit - charged at list time; never refunded on cancel/expiry.
  const deposit = auctionDeposit(p.sellPrice ?? 0, p.quantity, p.durationSeconds ?? 0);
  if (gold < deposit) return failList('Not enough money', inv, ah, gold);
  const auction: Auction = {
    id: ah.nextId, item: p.item, quantity: p.quantity,
    bidCopper: p.bidCopper, highBidder: null, buyoutCopper: p.buyoutCopper, seller: p.seller, expiresAt: p.expiresAt,
    // Carry the listed instance's identity (LOCK 1). Stored count tracks the listing quantity.
    ...(p.instance ? { instance: copyInstance(p.instance, p.quantity) } : {}),
  };
  // Remove the EXACT instance when the listing carries identity, so a rolled copy is pulled rather
  // than a plain same-entry stack earlier in the bags. Plain listings remove by entry+quantity.
  let inventory: Inventory;
  if (p.instance && hasIdentity(p.instance)) {
    const idx = inv.stacks.findIndex((s) => instancesStackable(s, p.instance!));
    inventory = idx >= 0 ? takeStack(inv, idx, p.quantity)[0] : removeItem(inv, p.item, p.quantity)[0];
  } else {
    inventory = removeItem(inv, p.item, p.quantity)[0];
  }
  return {
    ok: true,
    inventory,
    ah: { auctions: [...ah.auctions, auction], nextId: ah.nextId + 1 },
    gold: gold - deposit,
    deposit,
    auction,
  };
}

// Place a bid, escrowing the gold at once. The amount must reach minNextBid and stay below the
// buyout. A bot's prior escrow is fictional, and a human is never their own prior high bidder.
export function placeBid(ah: AuctionHouseState, gold: number, auctionId: number, bidder: string, amount: number, nowMs: number): BidResult {
  const auction = ah.auctions.find((a) => a.id === auctionId);
  if (!auction) return failBid('That auction is gone', ah, gold);
  if (auction.expiresAt <= nowMs) return failBid('That auction has ended', ah, gold);
  if (auction.seller === bidder) return failBid('You cannot bid on your own auction', ah, gold);
  if (auction.highBidder === bidder) return failBid("You're already the high bidder", ah, gold);
  if (amount >= auction.buyoutCopper) return failBid('That meets the buyout - use Buyout', ah, gold);
  if (amount < minNextBid(auction)) return failBid('Bid too low', ah, gold);
  if (gold < amount) return failBid('Not enough money', ah, gold);
  return {
    ok: true,
    gold: gold - amount,
    ah: { ...ah, auctions: ah.auctions.map((a) => (a.id === auctionId ? { ...a, bidCopper: amount, highBidder: bidder } : a)) },
  };
}

/** Buy an auction outright: pay its buyout, receive the items (bag space permitting). */
export function buyoutAuction(
  ah: AuctionHouseState, inv: Inventory, gold: number, auctionId: number, buyer: string, maxStack: number, cap: number = BACKPACK_SLOTS,
): BuyResult {
  const auction = ah.auctions.find((a) => a.id === auctionId);
  if (!auction) return failBuy('That auction is gone', ah, inv, gold);
  if (auction.seller === buyer) return failBuy('You cannot buy your own auction', ah, inv, gold);
  if (gold < auction.buyoutCopper) return failBuy('Not enough money', ah, inv, gold);
  if (!canFit(inv, auction.item, auction.quantity, maxStack, cap)) return failBuy('Your bags are full', ah, inv, gold);
  // If the buyer already held the high bid, that escrow returns - they only pay the buyout.
  const refundToBuyer = auction.highBidder === buyer ? auction.bidCopper : 0;
  return {
    ok: true,
    ah: { ...ah, auctions: ah.auctions.filter((a) => a.id !== auctionId) },
    inventory: auction.instance
      ? addInstance(inv, copyInstance(auction.instance, auction.quantity), maxStack)
      : addItem(inv, auction.item, auction.quantity, maxStack),
    gold: gold - auction.buyoutCopper + refundToBuyer,
    bought: { item: auction.item, quantity: auction.quantity },
    refundToBuyer,
  };
}

/** Cancel your own auction and reclaim the items. */
export function cancelAuction(
  ah: AuctionHouseState, inv: Inventory, auctionId: number, seller: string, maxStack: number, cap: number = BACKPACK_SLOTS,
): CancelResult {
  const auction = ah.auctions.find((a) => a.id === auctionId);
  if (!auction) return failCancel('That auction is gone', ah, inv);
  if (auction.seller !== seller) return failCancel('Not your auction', ah, inv);
  if (!canFit(inv, auction.item, auction.quantity, maxStack, cap)) return failCancel('Your bags are full', ah, inv);
  return {
    ok: true,
    ah: { ...ah, auctions: ah.auctions.filter((a) => a.id !== auctionId) },
    inventory: auction.instance
      ? addInstance(inv, copyInstance(auction.instance, auction.quantity), maxStack)
      : addItem(inv, auction.item, auction.quantity, maxStack),
  };
}

/** Active (non-expired) auctions, optionally hiding the viewer's own listings. */
export function activeAuctions(ah: AuctionHouseState, nowMs: number, excludeSeller?: string): Auction[] {
  return ah.auctions.filter((a) => a.expiresAt > nowMs && (excludeSeller == null || a.seller !== excludeSeller));
}

/** A player's own live listings. */
export function myAuctions(ah: AuctionHouseState, seller: string): Auction[] {
  return ah.auctions.filter((a) => a.seller === seller);
}

/** Auctions on which `bidder` currently holds the high bid (their gold is escrowed here). */
export function myBids(ah: AuctionHouseState, bidder: string): Auction[] {
  return ah.auctions.filter((a) => a.highBidder === bidder);
}

/** A single item stack owed to the player as a result of settlement. */
export interface Delivery {
  item: number;
  quantity: number;
  /** Wave Q P1: full identity of the delivered item (won bid / expired-unsold return). Absent = plain. */
  instance?: ItemInstance;
}

export interface SettleResult {
  ah: AuctionHouseState;
  wonItems: Delivery[];     // auctions the player won by bid
  returnedItems: Delivery[]; // the player's own listings that expired unsold
  soldGold: number;         // proceeds from the player's listings that sold on a bid
}

/** A Delivery carrying the auction's item + full instance identity (Wave Q P1). */
function deliveryOf(a: Auction): Delivery {
  return a.instance
    ? { item: a.item, quantity: a.quantity, instance: copyInstance(a.instance, a.quantity) }
    : { item: a.item, quantity: a.quantity };
}

// Resolve every auction past its expiry, dropping it and computing what the player receives.
// Bot-vs-bot auctions vanish; a won auction was paid at bid time, so winners only collect items.
export function settleExpired(ah: AuctionHouseState, nowMs: number, player: string): SettleResult {
  const expired = ah.auctions.filter((a) => a.expiresAt <= nowMs);
  if (expired.length === 0) return { ah, wonItems: [], returnedItems: [], soldGold: 0 };
  const wonItems: Delivery[] = [];
  const returnedItems: Delivery[] = [];
  let soldGold = 0;
  for (const a of expired) {
    if (a.seller === player) {
      // someone bid → sold; seller receives bid − house cut (AuctionHouseMgr.cpp:733 / :193)
      if (a.highBidder != null) soldGold += a.bidCopper - auctionCut(a.bidCopper);
      else returnedItems.push(deliveryOf(a)); // no buyer → comes back (deposit kept)
    } else if (a.highBidder === player) {
      wonItems.push(deliveryOf(a));   // you won the bid
    }
    // else: a bot auction with a bot/no winner - nothing owed to the player
  }
  return { ah: { ...ah, auctions: ah.auctions.filter((a) => a.expiresAt > nowMs) }, wonItems, returnedItems, soldGold };
}

/** Drop expired auctions, returning them so the caller can mail a player's items back. */
export function expireAuctions(ah: AuctionHouseState, nowMs: number): { ah: AuctionHouseState; expired: Auction[] } {
  const expired = ah.auctions.filter((a) => a.expiresAt <= nowMs);
  if (expired.length === 0) return { ah, expired };
  return { ah: { ...ah, auctions: ah.auctions.filter((a) => a.expiresAt > nowMs) }, expired };
}
