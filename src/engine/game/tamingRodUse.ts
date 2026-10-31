// Taming Rod practice-channel credit. A bare bag use never free-completes: credit lands only when the
// rod is used on its sourced practice beast, and the rod itself is never consumed.

import type { DataStore } from '../../data/dataStore.ts';
import { countItem, type Inventory } from '../../domain/items/inventory.ts';
import { getQuest, recordEventHappens, type QuestLog } from '../../domain/quests/questlog.ts';
import { tamingRodByItem } from '../../domain/quests/questTameRods.ts';
import type { ActionResult } from './types.ts';

/** Bare consumeItem path: refuse free-complete; tell player to target the practice beast. */
export function refuseBareTamingRodUse(
  itemEntry: number,
  inventory: Inventory,
  ds: DataStore,
): ActionResult<{ restored: number }> | null {
  const tameRod = tamingRodByItem(itemEntry);
  if (!tameRod) return null;
  if (countItem(inventory, itemEntry) < 1) {
    return { ok: false, reason: "You don't have this" };
  }
  const want = ds.creature(tameRod.targetCreature)?.name ?? 'the practice beast';
  return { ok: false, reason: `You must use the Taming Rod on ${want}` };
}

export type TamingRodTargetResult =
  | { handled: false }
  | { handled: true; ok: false; reason: string }
  | { handled: true; ok: true; questlog: QuestLog; logLine: string };

// useQuestItemOnTarget path: grant AreaExploredOrEventHappens only for the named beast. Caller applies
// questlog mutation + refreshQuests + activity log on ok:true.
export function tryTamingRodOnTarget(opts: {
  itemEntry: number;
  targetCreatureEntry?: number;
  inventory: Inventory;
  questlog: QuestLog;
  ds: DataStore;
}): TamingRodTargetResult {
  const tameRod = tamingRodByItem(opts.itemEntry);
  if (!tameRod) return { handled: false };
  if (countItem(opts.inventory, opts.itemEntry) < 1) {
    return { handled: true, ok: false, reason: 'You do not have that item' };
  }
  const qst = getQuest(opts.questlog, tameRod.questId);
  if (!qst || qst.status === 'turnedIn') {
    return { handled: true, ok: false, reason: 'You have no matching taming quest' };
  }
  const target = opts.targetCreatureEntry;
  if (target == null) {
    return { handled: true, ok: false, reason: 'You must use the Taming Rod on a beast' };
  }
  if (target !== tameRod.targetCreature) {
    const want = opts.ds.creature(tameRod.targetCreature)?.name
      ?? `creature ${tameRod.targetCreature}`;
    return { handled: true, ok: false, reason: `That is not the right beast (need ${want})` };
  }
  const questlog = recordEventHappens(opts.questlog, tameRod.questId);
  const itName = opts.ds.item(opts.itemEntry)?.name ?? 'Taming Rod';
  const beastName = opts.ds.creature(target)?.name ?? 'the beast';
  return {
    handled: true,
    ok: true,
    questlog,
    logLine: `You use the ${itName} on ${beastName} (practice tame).`,
  };
}
