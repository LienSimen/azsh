import type { EquippedValue } from '../items/itemInstance.ts';
import { equippedEntry } from '../items/itemInstance.ts';

/** Minimal read-only slice of GameState the entry lock chain needs. */
export interface EntryLockState {
  readonly inventory: { readonly stacks: readonly { readonly item: number; readonly count: number }[] };
  readonly char: { readonly equipped: Record<string, EquippedValue | undefined> };
  readonly questlog: { readonly quests: readonly { readonly entry: number; readonly status: string }[] };
}

export interface EntryLockInputs {
  ownedItems: Set<number>;
  completedQuests: number[];
  nameFragment: string;
}

// Inventory, equipped gear and turned-in quests for canEnter's sourced lock chain. Shared so the
// portal list and enterInstance cannot drift — they did, and raids read enterable while unattuned.
export function buildEntryLockInputs(state: EntryLockState, dungeonName: string): EntryLockInputs {
  const ownedItems = new Set<number>();
  for (const s of state.inventory.stacks) if (s.count > 0) ownedItems.add(s.item);
  for (const v of Object.values(state.char.equipped)) {
    const e = equippedEntry(v);
    if (e != null) ownedItems.add(e);
  }
  return {
    ownedItems,
    completedQuests: state.questlog.quests.filter((q) => q.status === 'turnedIn').map((q) => q.entry),
    // Strip leading "The " so "The Deadmines" matches "Deadmines - Entering".
    nameFragment: dungeonName.replace(/^the\s+/i, ''),
  };
}
