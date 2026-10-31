// Drop items the dataset no longer carries out of bags, bank, keyring and equipped. THE GATE: this
// deletes on a missing catalog entry, so it is only safe once the whole item catalog is loaded.

import type { DataStore } from '../../data/dataStore.ts';
import { emptyKeyring, migrateKeysToKeyring } from '../../domain/items/keyring.ts';
import { equippedEntry } from '../../domain/items/itemInstance.ts';
import type { EquippedValue } from '../../domain/items/itemInstance.ts';
import type { EquipSlot } from '../../data/schema.ts';
import type { GameState } from './types.ts';
import { removeItem } from '../../domain/items/inventory.ts';
import {
  countOwned,
  uniqueSignalsOf,
} from '../../domain/items/itemRestrictions.ts';
import { mailboxAsInventory, spendMailItem } from '../../domain/economy/mail.ts';

export interface DriftSanitizeResult {
  /** False when the item catalog was incomplete: nothing was touched. */
  ran: boolean;
  /** Stacks dropped from bags + bank + keyring. */
  stacksDropped: number;
  /** Equipped slots emptied. */
  slotsDropped: number;
  /** Keys swept from the backpack into the keyring. */
  keysMoved: number;
}

export function sanitizeDriftedItems(
  ds: DataStore,
  state: GameState,
  log: (msg: string) => void = () => {},
): DriftSanitizeResult {
  if (!state.keyring) state.keyring = emptyKeyring();
  const out: DriftSanitizeResult = { ran: false, stacksDropped: 0, slotsDropped: 0, keysMoved: 0 };
  if (ds.itemCatalogComplete?.() === false) {
    console.warn('[sanitizeDriftedItems] item catalog incomplete — keeping every item as-is');
    return out;
  }
  out.ran = true;

  const cleanStacks = (inv: { stacks: { item: number; count: number }[] } | undefined, where: string): void => {
    if (!inv?.stacks) return;
    const before = inv.stacks.length;
    inv.stacks = inv.stacks.filter((s) => {
      if (ds.item(s.item)) return true;
      console.warn(`[sanitizeDriftedItems] dropping nonexistent item ${s.item}x${s.count} from ${where}`);
      return false;
    });
    const n = before - inv.stacks.length;
    if (n > 0) {
      out.stacksDropped += n;
      log(`Removed ${n} nonexistent item(s) from your ${where}.`);
    }
  };
  cleanStacks(state.inventory, 'bags');
  cleanStacks(state.bank, 'bank');
  cleanStacks(state.keyring, 'keyring');

  // v40: move BagFamily KEYS out of the backpack into the keyring (unbounded).
  // Cite: Player.cpp keyring store; domain/items/keyring.ts migrateKeysToKeyring.
  const swept = migrateKeysToKeyring(state.inventory, state.keyring, (e) => ds.item(e));
  state.inventory = swept.bags;
  state.keyring = swept.keyring;
  out.keysMoved = swept.moved;
  if (swept.moved > 0) log(`Moved ${swept.moved} key(s) to your keyring.`);

  for (const [slot, v] of Object.entries(state.char.equipped || {})) {
    const entry = equippedEntry(v as EquippedValue | undefined);
    if (entry != null && !ds.item(entry)) {
      delete state.char.equipped[slot as EquipSlot];
      out.slotsDropped++;
    }
  }

  // Unique / MaxCount extras from bags-full overflow. Keep equipped, spend mailbox first,
  // then bags / bank / keyring. Cite: Player.cpp CanStoreNewItem ~8552.
  const seen = new Set<number>();
  const note = (entry: number): void => {
    if (entry > 0) seen.add(entry);
  };
  for (const s of state.inventory.stacks) note(s.item);
  for (const s of state.bank?.stacks ?? []) note(s.item);
  for (const s of state.keyring?.stacks ?? []) note(s.item);
  for (const s of mailboxAsInventory(state.mailbox ?? []).stacks) note(s.item);
  for (const v of Object.values(state.char.equipped || {})) {
    const entry = equippedEntry(v as EquippedValue | undefined);
    if (entry != null) note(entry);
  }
  let uniqueTrimmed = 0;
  for (const entry of seen) {
    const def = ds.item(entry);
    if (!def) continue;
    const sig = uniqueSignalsOf(def);
    const cap =
      sig.maxCount != null && sig.maxCount > 0
        ? sig.maxCount
        : sig.unique === true
          ? 1
          : 0;
    if (cap <= 0) continue;
    const extras = {
      bank: state.bank,
      keyring: state.keyring,
      mailbox: mailboxAsInventory(state.mailbox ?? []),
    };
    let excess = countOwned(state.inventory, state.char, entry, extras) - cap;
    if (excess <= 0) continue;
    const mail = spendMailItem(state.mailbox ?? [], entry, excess);
    state.mailbox = mail.mailbox;
    uniqueTrimmed += mail.removed;
    excess -= mail.removed;
    if (excess > 0) {
      const [nextBags, fromBags] = removeItem(state.inventory, entry, excess);
      state.inventory = nextBags;
      uniqueTrimmed += fromBags;
      excess -= fromBags;
    }
    if (excess > 0 && state.bank) {
      const [nextBank, fromBank] = removeItem(state.bank, entry, excess);
      state.bank = nextBank;
      uniqueTrimmed += fromBank;
      excess -= fromBank;
    }
    if (excess > 0 && state.keyring) {
      const [nextKeys, fromKeys] = removeItem(state.keyring, entry, excess);
      state.keyring = nextKeys;
      uniqueTrimmed += fromKeys;
    }
  }
  if (uniqueTrimmed > 0) {
    log(`Removed ${uniqueTrimmed} extra unique item${uniqueTrimmed === 1 ? '' : 's'}.`);
  }

  return out;
}
