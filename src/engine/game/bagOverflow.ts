// One bag owner the junk filter, the make-room pass and the overflow queue all run against, so the
// player and a companion share one implementation. Cite: equipmentHelper.ts handleFullBags.

import type { Character } from '../../domain/character/character.ts';
import type { Companion } from '../../domain/bots/squad.ts';
import { companionCharacter, companionLevel } from '../../domain/bots/squad.ts';
import { companionBags } from '../../domain/bots/companionQuests.ts';
import { bagCapacity } from '../../domain/items/equipment.ts';
import { bankCapacity } from '../../domain/items/bank.ts';
import { addInstance, addItem, canFit, emptyInventory } from '../../domain/items/inventory.ts';
import { copyInstance, type ItemInstance } from '../../domain/items/itemInstance.ts';
import type { DataStore } from '../../data/dataStore.ts';
import type { BagHandle, FullBagsHandle, GameCtx } from './context.ts';
import { mailOverflow } from './mail.ts';

export type { BagHandle };

/** Your backpack; the overflow queue is the mailbox, the same spill loot already uses. */
export function playerBagHandle(ctx: GameCtx): BagHandle {
  return {
    name: 'You',
    isPlayer: true,
    get: () => ctx.state.inventory,
    set: (inv) => { ctx.state.inventory = inv; },
    cap: () => ctx.cap(),
    overflow: (item, count, instance) => {
      mailOverflow(ctx, {
        item,
        quantity: count,
        ...(instance ? { instance } : {}),
        subject: ctx.ds.item(item)?.name ?? '',
      });
      return true;
    },
  };
}

// A companion's bags. Their overflow queue is their own bank first — gear they earned stays theirs —
// then your mailbox, so a full crew never silently eats a reward.
export function companionBagHandle(ctx: GameCtx, comp: Companion): BagHandle {
  const { ds, state } = ctx;
  const charOf = (): Character => companionCharacter(comp, companionLevel(comp, state.char.level), ds);
  return {
    name: comp.name,
    isPlayer: false,
    companionId: comp.id,
    get: () => companionBags(comp),
    set: (inv) => { comp.bags = inv; },
    cap: () => bagCapacity(charOf(), ds),
    overflow: (item, count, instance) => {
      const def = ds.item(item);
      if (!def) return false;
      const maxStack = def.stackable ?? 1;
      const bank = comp.bank ?? emptyInventory();
      if (canFit(bank, item, count, maxStack, bankCapacity(comp.bankBags ?? [], ds))) {
        comp.bank = addInstance(bank, instance ? { ...instance, count } : { item, count }, maxStack);
        return true;
      }
      mailOverflow(ctx, {
        item,
        quantity: count,
        ...(instance ? { instance } : {}),
        sender: comp.name,
        subject: def.name ?? '',
      });
      return true;
    },
  };
}

/** Roster body by id — party seat or bench, the same lookup the junk filter's companion list uses. */
export function bagOwnerCompanion(state: GameCtx['state'], id: string): Companion | undefined {
  return (state.squad ?? []).find((c) => c.id === id)
    ?? Object.values(state.botRoster ?? {}).find((c) => c.id === id);
}

/** What became of a stack that could not simply go in the bags. */
export type StoreOutcome = 'stored' | 'worn' | 'sold' | 'destroyed' | 'overflow';

// The one place a full-bag grant is resolved, for you or a companion: junk-filter it, free a slot,
// wear it, else queue it. Cite: game.ts takeDrop; Player.cpp:12548 CanRewardQuest.
export function storeOrOverflow(
  bags: BagHandle,
  ds: DataStore,
  handleFullBags: (item: number, count: number, owner?: BagHandle) => FullBagsHandle,
  item: number,
  count: number,
  instance?: ItemInstance,
): StoreOutcome {
  const def = ds.item(item);
  if (!def || count <= 0) return 'overflow';
  const maxStack = def.stackable ?? 1;
  const put = (): StoreOutcome => {
    bags.set(instance
      ? addInstance(bags.get(), copyInstance(instance, count), maxStack)
      : addItem(bags.get(), item, count, maxStack));
    return 'stored';
  };
  if (canFit(bags.get(), item, count, maxStack, bags.cap())) return put();
  const handled = handleFullBags(item, count, bags);
  if (handled.soldIncoming >= count) return 'sold';
  if (handled.destroyedIncoming >= count) return 'destroyed';
  if (handled.madeRoom && canFit(bags.get(), item, count, maxStack, bags.cap())) return put();
  // Nothing freed a slot: wear it if it beats what is on, otherwise it goes to the queue.
  if (bags.wear?.(item, count, instance)) return 'worn';
  bags.overflow(item, count, instance);
  return 'overflow';
}

/** Feed line for a stack that did not fit: names the owner, the stack and where it went. */
export function overflowLine(bags: BagHandle, ds: DataStore, item: number, count: number): string {
  const name = ds.item(item)?.name ?? String(item);
  return bags.isPlayer
    ? `Bags full - ${count}x ${name} sent to your mailbox.`
    : `${bags.name}'s bags are full - ${count}x ${name} put aside.`;
}

/** Everything a party-wide grant needs to resolve one companion's full bags. */
export interface PartyOverflow {
  bagsFor: (comp: Companion) => BagHandle;
  handleFullBags: (item: number, count: number, owner?: BagHandle) => FullBagsHandle;
}

/** The crew's side of the player's own overflow system — same junk pass, their bags. */
export function partyOverflow(ctx: GameCtx): PartyOverflow {
  return {
    bagsFor: (comp) => companionBagHandle(ctx, comp),
    handleFullBags: (item, count, owner) => ctx.handleFullBags(item, count, owner),
  };
}
