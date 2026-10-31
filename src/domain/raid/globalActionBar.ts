// Raid action bar: one empty-by-default bar whose slots every living raid member at least tries.
// Keys stay unbound and a single Settings keybind fires the whole bar. Cite: actionbar.ts.

import type { ItemDef } from '../../data/schema.ts';
import {
  SLOTS_PER_BAR,
  slotAt,
  emptyItems,
  emptyMacros,
  emptyOutfits,
  type ActionBar,
  type SlotContent,
} from '../character/actionbar.ts';
import { countItem, type Inventory } from '../items/inventory.ts';
import { classHasParallelMana } from '../character/forms.ts';
import { classPowerType } from '../core/ids.ts';

export type GlobalItemKind = 'restore_health' | 'restore_power' | 'buff' | 'other';

/** Per-member snapshot the try-gate reads. Built by the game module from bags / the live session. */
export interface GlobalMemberSnap {
  alive: boolean;
  classId: number;
  health: number;
  maxHealth: number;
  power: number;
  maxPower: number;
  itemCount: number;
  canUse: boolean;
  hasOutfit: boolean;
}

function outfitNameAt(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** Empty raid bar. No default spells, items, outfits, or keys. */
export function emptyGlobalBar(): ActionBar {
  return {
    slots: Array(SLOTS_PER_BAR).fill(null),
    keys: Array(SLOTS_PER_BAR).fill(null),
    items: emptyItems(),
    macros: emptyMacros(),
    outfits: emptyOutfits(),
  };
}

/** Load/migrate: keep items + outfits, drop spells/macros/keys (this bar has one global bind). */
export function normalizeGlobalBar(bar: unknown): ActionBar {
  if (!bar || typeof bar !== 'object') return emptyGlobalBar();
  const b = bar as { items?: unknown; outfits?: unknown };
  const items = Array.isArray(b.items) ? b.items : [];
  const outfits = Array.isArray(b.outfits) ? b.outfits : [];
  return {
    slots: Array(SLOTS_PER_BAR).fill(null),
    keys: Array(SLOTS_PER_BAR).fill(null),
    items: Array.from({ length: SLOTS_PER_BAR }, (_, i) => {
      const v = items[i];
      return typeof v === 'number' ? v : null;
    }),
    macros: emptyMacros(),
    outfits: Array.from({ length: SLOTS_PER_BAR }, (_, i) => outfitNameAt(outfits[i])),
  };
}

export function globalBarHasContent(bar: ActionBar | undefined | null): boolean {
  const b = normalizeGlobalBar(bar);
  for (let i = 0; i < SLOTS_PER_BAR; i++) if (slotAt(b, i) != null) return true;
  return false;
}

/** Opt-in dock: a bound key or any filled slot. Neither → the combat dock stays blank. */
export function showGlobalActionBar(
  bar: ActionBar | undefined | null,
  keybind: string | null | undefined,
): boolean {
  if (globalBarHasContent(bar)) return true;
  return typeof keybind === 'string' && keybind.trim().length > 0;
}

export function firstEmptyGlobalSlot(bar: ActionBar | undefined | null): number | null {
  const b = normalizeGlobalBar(bar);
  for (let i = 0; i < SLOTS_PER_BAR; i++) if (slotAt(b, i) == null) return i;
  return null;
}

export function setGlobalBarItem(
  bar: ActionBar | undefined | null,
  slot: number,
  entry: number | null,
): ActionBar {
  const next = normalizeGlobalBar(bar);
  if (slot < 0 || slot >= SLOTS_PER_BAR) return next;
  if (entry != null) {
    for (let i = 0; i < SLOTS_PER_BAR; i++) if (next.items![i] === entry) next.items![i] = null;
    next.outfits![slot] = null;
  }
  next.items![slot] = entry;
  return next;
}

export function setGlobalBarOutfit(
  bar: ActionBar | undefined | null,
  slot: number,
  name: string | null,
): ActionBar {
  const next = normalizeGlobalBar(bar);
  if (slot < 0 || slot >= SLOTS_PER_BAR) return next;
  const trimmed = name && name.trim() ? name.trim() : null;
  if (trimmed) {
    const low = trimmed.toLowerCase();
    for (let i = 0; i < SLOTS_PER_BAR; i++) {
      if (next.outfits![i]?.toLowerCase() === low) next.outfits![i] = null;
    }
    next.items![slot] = null;
  }
  next.outfits![slot] = trimmed;
  return next;
}

export function clearGlobalBarSlot(bar: ActionBar | undefined | null, slot: number): ActionBar {
  const next = normalizeGlobalBar(bar);
  if (slot < 0 || slot >= SLOTS_PER_BAR) return next;
  next.items![slot] = null;
  next.outfits![slot] = null;
  return next;
}

export function globalItemKind(it: Pick<ItemDef, 'useInCombat' | 'useBuff'> | undefined): GlobalItemKind | null {
  if (!it) return null;
  const fx = it.useInCombat?.effect;
  if (fx === 'restore_health' || fx === 'restore_power') return fx;
  if (it.useBuff) return 'buff';
  return 'other';
}

export function classUsesMana(classId: number): boolean {
  return classPowerType(classId) === 'mana' || classHasParallelMana(classId);
}

// Whether this member should attempt the slot. Count 0 is "do not have it"; give flasks only to the people
// who should drink them.
export function shouldTryGlobalAction(
  content: SlotContent,
  member: GlobalMemberSnap,
  kind: GlobalItemKind | null,
): boolean {
  if (!content || !member.alive) return false;
  if (content.kind === 'outfit') return member.hasOutfit;
  if (content.kind !== 'item') return false;
  if (member.itemCount <= 0) return false;
  if (!member.canUse) return false;
  if (kind === 'restore_power' && !classUsesMana(member.classId)) return false;
  if (kind === 'restore_health') {
    if (member.maxHealth <= 0) return false;
    if (member.health / member.maxHealth >= 0.99) return false;
  }
  if (kind === 'restore_power') {
    if (member.maxPower <= 0) return false;
    if (member.power / member.maxPower >= 0.99) return false;
  }
  return true;
}

/** The engine's own accept gate (game/globalActionBar.ts setGlobalItemSlot): an on-use consumable. */
export function isGlobalBarItem(
  it: Pick<ItemDef, 'useInCombat' | 'useBuff' | 'useSpell'> | undefined,
): boolean {
  return !!it && !!(it.useInCombat || it.useBuff || it.useSpell != null);
}

export interface GlobalBarCandidate {
  entry: number;
  count: number;
}

// Every on-use consumable the raid is carrying, held-count first. This is the list a player picks from; it
// runs the same gate `setGlobalItemSlot` does so it can never offer a row the engine then silently refuses.
export function globalBarCandidates(
  bags: readonly (Inventory | undefined | null)[],
  lookup: (entry: number) => Pick<ItemDef, 'useInCombat' | 'useBuff' | 'useSpell'> | undefined,
): GlobalBarCandidate[] {
  const seen = new Set<number>();
  for (const inv of bags) {
    if (!inv) continue;
    for (const st of inv.stacks) if (isGlobalBarItem(lookup(st.item))) seen.add(st.item);
  }
  const out: GlobalBarCandidate[] = [];
  for (const entry of seen) {
    let count = 0;
    for (const inv of bags) if (inv) count += countItem(inv, entry);
    if (count > 0) out.push({ entry, count });
  }
  return out.sort((a, b) => (b.count - a.count) || (a.entry - b.entry));
}
