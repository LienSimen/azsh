// Auction house facade methods. Pattern C: createAuctionMailModule(ctx) — no import of game.ts. Settlement
// items/gold go through the mailbox (AuctionHouseMgr.cpp:168–240).

import type { Delivery } from '../../domain/economy/auction.ts';
import {
  listAuction as doListAuction,
  buyoutAuction as doBuyout,
  cancelAuction as doCancel,
  placeBid as doPlaceBid,
  settleExpired,
  activeAuctions,
  myAuctions,
  myBids,
} from '../../domain/economy/auction.ts';
import {
  botMarketPass,
  itemStackValue,
  collectAhBotSources,
  ahBotSellPass,
  appendSellPass,
  vendorBundleCopper,
  LIST_VENDOR_CAP_REASON,
  AHBOT_TICK_MS,
  AHBOT_CATCHUP_MAX,
  AHBOT_WARM_SELL_PASSES,
  AHBOT_STOCK_FLOOR,
  AHBOT_FILL_PASSES,
  DEFAULT_BUY_CHANCE,
  type AhBotSources,
} from '../../domain/economy/auctionBot.ts';
import { hasIdentity } from '../../domain/items/itemInstance.ts';
import { appendSystemMail, MAIL_AUCTION } from '../../domain/economy/mail.ts';
import { mulberry32, hashSeed } from '../core/rng.ts';
import type { Game } from './types.ts';
import { AH_DURATIONS_MS } from './types.ts';
import type { GameCtx } from './context.ts';
import { moneyMarked } from '../../domain/economy/money.ts';

function mailAhItems(ctx: GameCtx, items: Delivery[], nowMs: number, subject: string): void {
  for (const d of items) {
    const applied = appendSystemMail(ctx.state.mailbox ?? [], {
      sender: 'Auction House',
      subject,
      nowMs,
      messageType: MAIL_AUCTION,
      attachments: [{
        entry: d.item,
        quantity: d.quantity,
        ...(d.instance ? { instance: d.instance } : {}),
      }],
    });
    ctx.state.mailbox = applied.mailbox;
  }
}

function mailAhGold(ctx: GameCtx, copper: number, nowMs: number, subject: string): void {
  if (copper <= 0) return;
  const applied = appendSystemMail(ctx.state.mailbox ?? [], {
    sender: 'Auction House',
    subject,
    money: copper,
    nowMs,
    messageType: MAIL_AUCTION,
  });
  ctx.state.mailbox = applied.mailbox;
}

export function createAuctionMailModule(ctx: GameCtx): Pick<
  Game,
  | 'refillAuctions'
  | 'browseAuctions'
  | 'ownAuctions'
  | 'myBidAuctions'
  | 'listAuction'
  | 'buyoutAuction'
  | 'bidAuction'
  | 'cancelAuction'
> {
  const { ds, state, log, cap } = ctx;
  let cachedSources: AhBotSources | null = null;
  let cachedCatalog: ReturnType<typeof ds.allItems> | null = null;
  const ahSources = (): AhBotSources => {
    if (cachedSources) return cachedSources;
    cachedSources = collectAhBotSources({
      creatures: ds.creatures(),
      lootHas: () => true,
      lootIds: ds.lootTemplateIds(),
      recipes: ds.recipes(),
      vendors: ds.vendors(),
      itemOf: (id) => ds.item(id),
    });
    return cachedSources;
  };
  const lootOf = (id: number | string): ReturnType<typeof ds.lootTable> | undefined => {
    const rows = ds.lootTable(id);
    return rows.length ? rows : undefined;
  };
  const applyBuyPass = (rngSeedSalt: number, nowMs: number, buyChance: number): void => {
    const player = state.char.name;
    const sources = ahSources();
    const valueOf = (item: number, quantity = 1): number => {
      const it = ds.item(item);
      return it
        ? itemStackValue(it, quantity, {
          vendorItems: sources.infiniteVendorItems,
          craftFloor: sources.craftFloor,
        })
        : 1;
    };
    const rng = mulberry32(hashSeed(state.rngSeed, rngSeedSalt));
    const pass = botMarketPass(state.auctionHouse, rng, { valueOf, player, nowMs, buyChance });
    state.auctionHouse = pass.ah;
    if (pass.playerProceeds > 0) {
      mailAhGold(ctx, pass.playerProceeds, nowMs, 'Auction successful');
      log(`A buyer took your listing - ${moneyMarked(pass.playerProceeds)} mailed.`);
    }
    if (pass.playerRefund > 0) {
      mailAhGold(ctx, pass.playerRefund, nowMs, 'Auction outbid');
      log(`You were outbid - ${moneyMarked(pass.playerRefund)} mailed.`);
    }
  };
  const applySellPass = (rngSeedSalt: number, nowMs: number): void => {
    const rng = mulberry32(hashSeed(state.rngSeed, rngSeedSalt));
    const added = ahBotSellPass(ahSources(), lootOf, (id) => ds.item(id), rng, {
      nowMs,
      startId: state.auctionHouse.nextId,
      createDs: ds,
      names: ds.botNames(),
      catalog: () => {
        if (!cachedCatalog) cachedCatalog = ds.allItems().filter((it) => !it.notObtainable);
        return cachedCatalog;
      },
      maxRequiredLevel: 60,
    });
    state.auctionHouse = appendSellPass(state.auctionHouse, added);
  };
  return {
    refillAuctions(nowMs, opts) {
      const player = state.char.name;
      // Settle expired (AuctionHouseMgr.cpp SendAuctionSuccessfulMail / Won / Expired).
      const s = settleExpired(state.auctionHouse, nowMs, player);
      state.auctionHouse = s.ah;
      if (s.soldGold > 0) {
        mailAhGold(ctx, s.soldGold, nowMs, 'Auction successful');
        log(`Your auctions sold - ${moneyMarked(s.soldGold)} mailed.`);
      }
      if (s.wonItems.length > 0) {
        mailAhItems(ctx, s.wonItems, nowMs, 'Auction won');
        log(`You won ${s.wonItems.length} auction${s.wonItems.length > 1 ? 's' : ''} - mailed.`);
      }
      if (s.returnedItems.length > 0) {
        mailAhItems(ctx, s.returnedItems, nowMs, 'Auction expired');
        log(`${s.returnedItems.length} unsold listing${s.returnedItems.length > 1 ? 's' : ''} returned by mail.`);
      }
      if (opts?.bot === false) return;

      // CMaNGOS Update: 10% sell / 10% buy per 120s house tick. Cite: AuctionHouseBot.cpp:166–191.
      const last = state.auctionHouse.lastTickMs ?? 0;
      const listed = state.auctionHouse.auctions.length;
      // A house that never ticked needs the warm start even when the player already listed
      // something. Keying this on auctions.length let one own listing skip stocking entirely.
      const warmStart = last === 0 || listed === 0;
      const belowFloor = listed < AHBOT_STOCK_FLOOR;
      if (!warmStart && !belowFloor && nowMs - last < AHBOT_TICK_MS) return;

      let salt = state.fightCounter;
      if (warmStart || belowFloor) {
        // Rebuild is sell-only (cpp:317–318). Buy after the floor, not during the dump.
        const passes = warmStart ? AHBOT_WARM_SELL_PASSES : AHBOT_FILL_PASSES;
        for (let i = 0; i < passes; i++) applySellPass(salt++, nowMs);
        if (state.auctionHouse.auctions.length >= AHBOT_STOCK_FLOOR) applyBuyPass(salt++, nowMs, 1);
      } else {
        const elapsed = last > 0 ? nowMs - last : AHBOT_TICK_MS;
        const slices = Math.min(AHBOT_CATCHUP_MAX, Math.max(1, Math.floor(elapsed / AHBOT_TICK_MS)));
        // One sell + one buy so a visit rotates stock. Extra 120s slices stay 10%.
        applySellPass(salt++, nowMs);
        applyBuyPass(salt++, nowMs, 1);
        for (let i = 1; i < slices; i++) {
          const sliceRng = mulberry32(hashSeed(state.rngSeed, salt++));
          if (sliceRng.next() < DEFAULT_BUY_CHANCE) applySellPass(salt++, nowMs);
          if (sliceRng.next() < DEFAULT_BUY_CHANCE) applyBuyPass(salt++, nowMs, 1);
        }
      }
      state.fightCounter = salt;
      state.auctionHouse = { ...state.auctionHouse, lastTickMs: nowMs };
    },

    browseAuctions(nowMs) {
      return activeAuctions(state.auctionHouse, nowMs, state.char.name);
    },

    ownAuctions() {
      return myAuctions(state.auctionHouse, state.char.name);
    },

    myBidAuctions() {
      return myBids(state.auctionHouse, state.char.name);
    },

    listAuction(itemEntry, quantity, bidCopper, buyoutCopper, duration, nowMs, stacks = 1) {
      const it = ds.item(itemEntry);
      if (it && ahSources().infiniteVendorItems.has(itemEntry)) {
        const cap = vendorBundleCopper(it, quantity);
        if (cap > 0 && buyoutCopper > cap) {
          return { ok: false, reason: LIST_VENDOR_CAP_REASON };
        }
      }
      const durationMs = AH_DURATIONS_MS[duration] ?? AH_DURATIONS_MS.long;
      const durationSeconds = Math.floor(durationMs / 1000);
      const n = Math.max(1, Math.floor(stacks));
      let lastId = 0;
      let listed = 0;
      for (let i = 0; i < n; i++) {
        const idStack = state.inventory.stacks.find((s) => s.item === itemEntry && hasIdentity(s));
        const res = doListAuction(state.inventory, state.auctionHouse, {
          item: itemEntry, quantity, bidCopper, buyoutCopper,
          seller: state.char.name, expiresAt: nowMs + durationMs,
          sellPrice: it?.sellPrice ?? 0,
          durationSeconds,
          gold: state.char.gold,
          ...(idStack ? { instance: idStack } : {}),
        });
        if (!res.ok) {
          if (listed === 0) return { ok: false, reason: res.reason ?? 'Cannot list' };
          break;
        }
        state.inventory = res.inventory;
        state.auctionHouse = res.ah;
        state.char.gold = res.gold;
        lastId = res.auction!.id;
        listed++;
      }
      log(`Listed ${listed} stack${listed === 1 ? '' : 's'} of ${quantity}x ${it?.name ?? itemEntry}.`);
      return { ok: true, auctionId: lastId, listed };
    },

    buyoutAuction(auctionId) {
      const auction = state.auctionHouse.auctions.find((a) => a.id === auctionId);
      const maxStack = auction ? ds.item(auction.item)?.stackable ?? 1 : 1;
      const res = doBuyout(state.auctionHouse, state.inventory, state.char.gold, auctionId, state.char.name, maxStack, cap());
      if (!res.ok) return { ok: false, reason: res.reason ?? 'Cannot buy' };
      state.auctionHouse = res.ah;
      state.inventory = res.inventory;
      state.char.gold = res.gold;
      log(`Bought ${res.bought!.quantity}x ${ds.item(res.bought!.item)?.name ?? res.bought!.item}.`);
      return { ok: true, spent: auction!.buyoutCopper };
    },

    bidAuction(auctionId, amount, nowMs) {
      const res = doPlaceBid(state.auctionHouse, state.char.gold, auctionId, state.char.name, amount, nowMs);
      if (!res.ok) return { ok: false, reason: res.reason ?? 'Cannot bid' };
      state.auctionHouse = res.ah;
      state.char.gold = res.gold;
      log(`Bid ${moneyMarked(amount)} placed.`);
      return { ok: true, bid: amount };
    },

    cancelAuction(auctionId) {
      const auction = state.auctionHouse.auctions.find((a) => a.id === auctionId);
      const maxStack = auction ? ds.item(auction.item)?.stackable ?? 1 : 1;
      const res = doCancel(state.auctionHouse, state.inventory, auctionId, state.char.name, maxStack, cap());
      if (!res.ok) return { ok: false, reason: res.reason ?? 'Cannot cancel' };
      state.auctionHouse = res.ah;
      state.inventory = res.inventory;
      log('Cancelled your auction and reclaimed the items.');
      return { ok: true };
    },
  };
}
