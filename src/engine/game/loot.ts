// The loot container facade: hold a haul, then take from it a row at a time. Close discards outdoors,
// bags the remainder for an instance whose guid is already burned, and KEEPS it for a bag container.

import {
  isLootEmpty,
  removeLootRow,
  markLootBlocked,
  type PendingLoot,
  type PendingLootRow,
} from '../../domain/items/pendingLoot.ts';
import { createItemInstance } from '../../domain/items/createItem.ts';
import { applyBindToInstance, resolveBonding } from '../../domain/items/itemBonding.ts';
import { identityCapable, copyInstance } from '../../domain/items/itemInstance.ts';
import { addItem, addInstance, canFit } from '../../domain/items/inventory.ts';
import { canAcceptUnique, uniqueSignalsOf } from '../../domain/items/itemRestrictions.ts';
import { dumpGatherGoodsFromState } from '../../domain/bots/sendTradeGoods.ts';
import { mailboxAsInventory } from '../../domain/economy/mail.ts';
import { clampGold } from '../../domain/economy/trading.ts';
import { mulberry32, hashSeed } from '../core/rng.ts';
import type { LootDrop } from '../../domain/items/loot.ts';
import type { ItemInstance } from '../../domain/items/itemInstance.ts';
import type { Game } from './types.ts';
import type { GameCtx } from './context.ts';
import { formatItemName } from '../../domain/items/itemDisplayName.ts';
import { mailOverflow } from './mail.ts';

/** What a loot act needs to describe the container it is filling. */
export type LootSourceInfo = Omit<PendingLoot, 'rows' | 'copper'> & { copper?: number };

function rowName(ds: GameCtx['ds'], row: Pick<PendingLootRow, 'item' | 'instance'>): string {
  const base = ds.item(row.item)?.name ?? String(row.item);
  const rp = row.instance?.randomPropertyId;
  return formatItemName(base, rp != null && rp > 0 ? ds.itemRandomProperty(rp)?.nameSuffix : undefined);
}

/** Copy rolled suffix ids from the just-opened container onto this fight's loot list. */
export function withPendingIdentities(
  drops: readonly LootDrop[],
  pending: PendingLoot | null | undefined,
): LootDrop[] {
  if (!pending?.rows.length || !drops.length) return [...drops];
  const fresh = pending.rows.slice(-drops.length);
  return drops.map((d, i) => {
    const rp = fresh[i]?.item === d.item ? fresh[i]?.instance?.randomPropertyId : undefined;
    return rp != null && rp > 0 ? { ...d, randomPropertyId: rp } : d;
  });
}

// Turn rolled drops into held rows, rolling each item's identity NOW (LOCK 1: the suffix belongs to the
// drop, not to the moment you clicked it) and binding it on loot like the direct-to-bags path does.
export function buildLootRows(ctx: GameCtx, drops: readonly LootDrop[]): PendingLootRow[] {
  const { ds, state } = ctx;
  const rows: PendingLootRow[] = [];
  for (const d of drops) {
    const def = ds.item(d.item);
    if (!def) continue; // item dropped out of the dataset — nothing to hand over
    const row: PendingLootRow = { item: d.item, count: d.count };
    if (identityCapable(def)) {
      const rng = mulberry32(hashSeed(state.rngSeed, state.fightCounter++));
      const inst = applyBindToInstance(
        createItemInstance(d.item, d.count, ds, rng),
        resolveBonding(def),
        'loot',
      );
      row.instance = inst;
    }
    rows.push(row);
  }
  return rows;
}

/** Add one held row to the bags, preserving its rolled identity. Null when it does not fit. */
function storeRow(ctx: GameCtx, row: PendingLootRow): { count: number; mailed?: boolean; sold?: boolean; destroyed?: boolean; unique?: boolean } | null {
  const { ds, state, cap, log } = ctx;
  const def = ds.item(row.item);
  if (!def) return null;
  const uniq = canAcceptUnique(
    state.inventory,
    state.char,
    row.item,
    uniqueSignalsOf(def),
    row.instance,
    {
      bank: state.bank,
      keyring: state.keyring,
      mailbox: mailboxAsInventory(state.mailbox ?? []),
    },
  );
  let want = row.count;
  if (uniq.room != null && Number.isFinite(uniq.room)) want = Math.min(want, uniq.room);
  if (!uniq.ok || want <= 0) {
    log(uniq.ok ? 'Unique: you may only carry one' : uniq.reason);
    return { count: 0, unique: true };
  }
  const maxStack = def.stackable ?? 1;
  if (!canFit(state.inventory, row.item, want, maxStack, cap())) {
    const handled = ctx.handleFullBags(row.item, want);
    if (handled.soldIncoming >= want) return { count: want, sold: true };
    if (handled.destroyedIncoming >= want) return { count: want, destroyed: true };
    if (!(handled.madeRoom && canFit(state.inventory, row.item, want, maxStack, cap()))) {
      // Same overflow takeDrop uses in an instance — mailbox, not a stuck LootFrame.
      if (state.instance) {
        const inst = row.instance ? copyInstance(row.instance, want) : undefined;
        mailOverflow(ctx, {
          item: row.item,
          quantity: want,
          ...(inst ? { instance: inst } : {}),
          subject: def.name ?? '',
        });
        log(`Bags full - ${want}x ${def.name ?? row.item} sent to your mailbox.`);
        return { count: want, mailed: true };
      }
      return null;
    }
  }
  if (row.instance) {
    state.inventory = addInstance(state.inventory, copyInstance(row.instance, want), maxStack);
  } else if (identityCapable(def)) {
    state.inventory = addItem(state.inventory, row.item, want, maxStack);
  } else {
    state.inventory = addItem(state.inventory, row.item, want, maxStack);
  }
  return { count: want };
}

export interface LootModuleDeps {
  onOpenLoot?: () => void;
}

export function createLootModule(ctx: GameCtx, deps?: LootModuleDeps): Pick<
  Game, 'openLoot' | 'pendingLoot' | 'takeLoot' | 'takeLootMoney' | 'takeAllLoot' | 'closeLoot'
> {
  const { ds, state, log, refreshQuests } = ctx;

  // Put a haul in the container, collecting anything held from a previous source into the bags first:
  // one window at a time, and the player never loses a drop by walking to the next chest.
  const openLoot = (info: LootSourceInfo, drops: readonly LootDrop[], copper = 0): PendingLoot => {
    deps?.onOpenLoot?.();
    const carried = collectRemainder();
    const rows = buildLootRows(ctx, drops);
    const loot: PendingLoot = {
      ...info,
      rows: [...carried, ...rows],
      copper: (info.copper ?? 0) + copper,
    };
    state.pendingLoot = loot;
    return loot;
  };

  // Sweep whatever is still held into the bags (called when a new source opens). Returns the rows that
  // would not fit so they can ride along in the new window instead of vanishing.
  function collectRemainder(): PendingLootRow[] {
    const held = state.pendingLoot;
    if (!held) return [];
    if (held.copper > 0) {
      state.char = { ...state.char, gold: clampGold(state.char.gold + held.copper) };
    }
    const stuck: PendingLootRow[] = [];
    for (const row of held.rows) {
      if (!storeRow(ctx, row)) stuck.push({ ...row, blocked: true });
    }
    state.pendingLoot = null;
    if (held.rows.length > stuck.length || held.copper > 0) refreshQuests();
    return stuck;
  }

  // Take everything that fits, in order. Rows that do not fit stay held and are counted, so "Loot All" on a
  // full backpack is honest instead of half-silent.
  function takeAllHeld(): {
    ok: true;
    taken: Array<{ item: number; count: number }>;
    copper: number;
    remaining: number;
    emptied: boolean;
  } | { ok: false; reason: string } {
    const held = state.pendingLoot;
    if (!held) return { ok: false, reason: 'Nothing to loot' };
    const taken: Array<{ item: number; count: number }> = [];
    const stuck: PendingLootRow[] = [];
    let copper = 0;
    if (held.copper > 0) {
      const before = state.char.gold;
      state.char = { ...state.char, gold: clampGold(before + held.copper) };
      copper = state.char.gold - before;
    }
    const bagged: Array<{ item: number; count: number; name: string }> = [];
    for (const row of held.rows) {
      const stored = storeRow(ctx, row);
      if (stored) {
        taken.push({ item: row.item, count: row.count });
        if (!stored.mailed && !stored.sold && !stored.destroyed && !stored.unique) {
          bagged.push({ item: row.item, count: row.count, name: rowName(ds, row) });
        }
      } else {
        stuck.push({ ...row, blocked: true });
      }
    }
    const next: PendingLoot = { ...held, copper: 0, rows: stuck };
    state.pendingLoot = isLootEmpty(next) ? null : next;
    if (bagged.length || copper) {
      const line = bagged.map((t) => `${t.count}× ${t.name}`).join(', ');
      log(`Looted ${[line, copper ? `${copper} copper` : ''].filter(Boolean).join(', ')}.`);
      refreshQuests();
    } else if (taken.length) {
      refreshQuests();
    }
    if (bagged.length && (held.kind === 'mining' || held.kind === 'herbalism' || held.kind === 'skinning')) {
      dumpGatherGoodsFromState(state, ds, log);
    }
    return {
      ok: true,
      taken,
      copper,
      remaining: stuck.length,
      emptied: state.pendingLoot == null,
    };
  }

  return {
    openLoot,

    pendingLoot: () => state.pendingLoot ?? null,

    takeLoot(index) {
      const held = state.pendingLoot;
      if (!held) return { ok: false, reason: 'Nothing to loot' };
      const row = held.rows[index];
      if (!row) return { ok: false, reason: 'That is already looted' };
      const stored = storeRow(ctx, row);
      if (!stored) {
        state.pendingLoot = markLootBlocked(held, index, true);
        return { ok: false, reason: 'Your bags are full' };
      }
      const next = removeLootRow(held, index);
      if (stored.unique) {
        state.pendingLoot = isLootEmpty(next) ? null : next;
        return { ok: false, reason: 'Unique: you may only carry one' };
      }
      const name = rowName(ds, row);
      if (!stored.mailed && !stored.sold && !stored.destroyed) log(`Looted ${row.count}× ${name}.`);
      refreshQuests(); // a looted item can complete a gather objective
      state.pendingLoot = isLootEmpty(next) ? null : next;
      if (!stored.mailed && !stored.sold && !stored.destroyed && !stored.unique
        && (held.kind === 'mining' || held.kind === 'herbalism' || held.kind === 'skinning')) {
        dumpGatherGoodsFromState(state, ds, log);
      }
      return {
        ok: true,
        item: row.item,
        count: row.count,
        remaining: state.pendingLoot ? state.pendingLoot.rows.length : 0,
        emptied: state.pendingLoot == null,
        mailed: stored.mailed,
        sold: stored.sold,
        destroyed: stored.destroyed,
      };
    },

    takeLootMoney() {
      const held = state.pendingLoot;
      if (!held || held.copper <= 0) return { ok: false, reason: 'No money to take' };
      const before = state.char.gold;
      state.char = { ...state.char, gold: clampGold(before + held.copper) };
      const copper = state.char.gold - before;
      const next: PendingLoot = { ...held, copper: 0 };
      state.pendingLoot = isLootEmpty(next) ? null : next;
      if (copper > 0) log(`Looted ${copper} copper.`);
      return { ok: true, copper, emptied: state.pendingLoot == null };
    },

    takeAllLoot: takeAllHeld,

    // Close the window. Outdoors leftovers are discarded, an instance source is already consumed so the
    // remainder is bagged, and a bag container keeps its remainder held — contents must not vanish.
    closeLoot() {
      const held = state.pendingLoot;
      if (!held) return { ok: true };
      if (held.kind === 'container') {
        // Bag box / clam / lockbox: remainder stays claimable until taken or a new source
        // auto-collects it. Only clear when empty.
        if (isLootEmpty(held)) state.pendingLoot = null;
        return { ok: true };
      }
      if (state.instance) {
        takeAllHeld();
        return { ok: true };
      }
      state.pendingLoot = null;
      return { ok: true };
    },
  };
}

export type { PendingLoot, PendingLootRow, ItemInstance };
