// Action bars: what sits in which numbered slot and the key that fires it. A slot holds EITHER a
// spell or an item, never both. Pure serializable data; bar 0 is always present.

import { isMacroId } from '../macro/types.ts';

export const SLOTS_PER_BAR = 12;
export const MAX_BARS = 5;

// One action bar. A non-null `items[i]` makes slot i an item slot and outranks `slots[i]`, and
// `macros[i]` outranks both. Older saves without those arrays load unchanged.
export interface ActionBar {
  slots: (number | null)[]; // length SLOTS_PER_BAR; spell id (null = empty / item slot)
  keys: (string | null)[];  // length SLOTS_PER_BAR; a normalized key, e.g. '1', 'q', 'shift+2'
  items?: (number | null)[]; // length SLOTS_PER_BAR; item entry (null = not an item slot)
  macros?: (string | null)[]; // length SLOTS_PER_BAR; macro id (null = not a macro slot)
  /** Outfit name (Outfitter). Outranks macro/item/spell. */
  outfits?: (string | null)[];
}

/** Tagged content of a single slot — what the UI/combat should render and fire. */
export type SlotContent =
  | { kind: 'spell'; id: number }
  | { kind: 'item'; entry: number }
  | { kind: 'macro'; id: string }
  | { kind: 'outfit'; name: string }
  | null;

// Bar 0 is the number row. Extra bars ship UNBOUND: Shift/Ctrl/Alt + digit are the browser's own
// tab-switch keys, so claiming them by default takes them from a player who never asked.
const NUMBER_ROW = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];

export function defaultKeys(barIndex: number): (string | null)[] {
  return barIndex === 0 ? [...NUMBER_ROW] : Array(SLOTS_PER_BAR).fill(null);
}

/** Empty item row (all slots spell-capable). */
export function emptyItems(): (number | null)[] {
  return Array(SLOTS_PER_BAR).fill(null);
}

/** Empty macro row (no slot is a macro slot). */
export function emptyMacros(): (string | null)[] {
  return Array(SLOTS_PER_BAR).fill(null);
}

/** Empty outfit row. */
export function emptyOutfits(): (string | null)[] {
  return Array(SLOTS_PER_BAR).fill(null);
}

function outfitNameAt(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export function emptyBar(barIndex = 0): ActionBar {
  return {
    slots: Array(SLOTS_PER_BAR).fill(null),
    keys: defaultKeys(barIndex),
    items: emptyItems(),
    macros: emptyMacros(),
    outfits: emptyOutfits(),
  };
}

export function defaultActionBars(): ActionBar[] {
  return [emptyBar(0)];
}

const cloneBars = (bars: ActionBar[]): ActionBar[] => bars.map((b) => ({
  slots: [...b.slots],
  keys: [...b.keys],
  // Always materialize items/macros/outfits so mutators can write into them without a guard.
  items: Array.from({ length: SLOTS_PER_BAR }, (_, i) => (typeof b.items?.[i] === 'number' ? b.items![i]! : null)),
  macros: Array.from({ length: SLOTS_PER_BAR }, (_, i) => (isMacroId(b.macros?.[i]) ? b.macros![i]! : null)),
  outfits: Array.from({ length: SLOTS_PER_BAR }, (_, i) => outfitNameAt(b.outfits?.[i])),
}));

/** Coerce a possibly-legacy/short/oversized bar list into exactly-shaped bars (for load/migrate). */
export function normalizeBars(bars: ActionBar[] | undefined | null): ActionBar[] {
  if (!Array.isArray(bars) || !bars.length) return defaultActionBars();
  return bars.slice(0, MAX_BARS).map((b, idx) => {
    // Only bar 0 backfills: a null key on an extra bar is a bind the player cleared, not a gap.
    const dk = idx === 0 ? defaultKeys(0) : null;
    return {
      slots: Array.from({ length: SLOTS_PER_BAR }, (_, i) => (typeof b?.slots?.[i] === 'number' ? b.slots[i] : null)),
      keys: Array.from({ length: SLOTS_PER_BAR }, (_, i) => (b?.keys?.[i] ?? dk?.[i] ?? null)),
      items: Array.from({ length: SLOTS_PER_BAR }, (_, i) => (typeof b?.items?.[i] === 'number' ? b.items![i]! : null)),
      // A malformed macro id never survives load: the slot reads empty instead of "?".
      macros: Array.from({ length: SLOTS_PER_BAR }, (_, i) => (isMacroId(b?.macros?.[i]) ? b.macros![i]! : null)),
      outfits: Array.from({ length: SLOTS_PER_BAR }, (_, i) => outfitNameAt(b?.outfits?.[i])),
    };
  });
}

/** What sits in bar/slot: outfit, macro, item, spell, or nothing (that precedence). */
export function slotAt(bar: ActionBar, i: number): SlotContent {
  if (i < 0 || i >= SLOTS_PER_BAR) return null;
  const outfitName = outfitNameAt(bar.outfits?.[i]);
  if (outfitName) return { kind: 'outfit', name: outfitName };
  const macroId = bar.macros?.[i];
  if (macroId != null && isMacroId(macroId)) return { kind: 'macro', id: macroId };
  const entry = bar.items?.[i];
  if (entry != null) return { kind: 'item', entry };
  const id = bar.slots[i];
  if (id != null) return { kind: 'spell', id };
  return null;
}

/** Every spellId currently placed on any bar. */
export function assignedSpellIds(bars: ActionBar[]): Set<number> {
  const set = new Set<number>();
  for (const b of bars) for (const s of b.slots) if (s != null) set.add(s);
  return set;
}

/** Every item entry currently placed on any bar. */
export function assignedItemEntries(bars: ActionBar[]): Set<number> {
  const set = new Set<number>();
  for (const b of bars) if (b.items) for (const e of b.items) if (e != null) set.add(e);
  return set;
}

/** Every macro id currently placed on any bar. */
export function assignedMacroIds(bars: ActionBar[]): Set<string> {
  const set = new Set<string>();
  for (const b of bars) if (b.macros) for (const m of b.macros) if (m != null) set.add(m);
  return set;
}

/** Put `spellId` (or null to clear) in bar/slot. De-dupes: the spell is removed from any other
 *  slot. Placing a spell clears any item that was in the same slot (a slot is spell OR item). */
export function setSlot(bars: ActionBar[], bar: number, slot: number, spellId: number | null): ActionBar[] {
  if (bar < 0 || bar >= bars.length || slot < 0 || slot >= SLOTS_PER_BAR) return bars;
  const next = cloneBars(bars);
  if (spellId != null) {
    for (const b of next) for (let i = 0; i < b.slots.length; i++) if (b.slots[i] === spellId) b.slots[i] = null;
    // A slot holds exactly one kind of content.
    next[bar].items![slot] = null;
    next[bar].macros![slot] = null;
    next[bar].outfits![slot] = null;
  }
  next[bar].slots[slot] = spellId;
  return next;
}

/** Put item `entry` (or null to clear) in bar/slot. De-dupes across bars. Placing an item clears
 *  any spell in the same slot. */
export function setItemSlot(bars: ActionBar[], bar: number, slot: number, entry: number | null): ActionBar[] {
  if (bar < 0 || bar >= bars.length || slot < 0 || slot >= SLOTS_PER_BAR) return bars;
  const next = cloneBars(bars);
  if (entry != null) {
    for (const b of next) for (let i = 0; i < b.items!.length; i++) if (b.items![i] === entry) b.items![i] = null;
    next[bar].slots[slot] = null;
    next[bar].macros![slot] = null;
    next[bar].outfits![slot] = null;
  }
  next[bar].items![slot] = entry;
  return next;
}

/** Put macro `id` (or null to clear) in bar/slot. De-dupes across bars, like a spell or an item. */
export function setMacroSlot(bars: ActionBar[], bar: number, slot: number, id: string | null): ActionBar[] {
  if (bar < 0 || bar >= bars.length || slot < 0 || slot >= SLOTS_PER_BAR) return bars;
  if (id != null && !isMacroId(id)) return bars;
  const next = cloneBars(bars);
  if (id != null) {
    for (const b of next) for (let i = 0; i < b.macros!.length; i++) if (b.macros![i] === id) b.macros![i] = null;
    next[bar].slots[slot] = null;
    next[bar].items![slot] = null;
    next[bar].outfits![slot] = null;
  }
  next[bar].macros![slot] = id;
  return next;
}

/** Drop every slot holding macro `id` (a deleted macro must not leave a live button). */
export function clearMacroFromBars(bars: ActionBar[], id: string): ActionBar[] {
  if (!assignedMacroIds(bars).has(id)) return bars;
  const next = cloneBars(bars);
  for (const b of next) for (let i = 0; i < b.macros!.length; i++) if (b.macros![i] === id) b.macros![i] = null;
  return next;
}

/** Put outfit `name` (or null to clear) in bar/slot. De-dupes by case-insensitive name. */
export function setOutfitSlot(bars: ActionBar[], bar: number, slot: number, name: string | null): ActionBar[] {
  if (bar < 0 || bar >= bars.length || slot < 0 || slot >= SLOTS_PER_BAR) return bars;
  const next = cloneBars(bars);
  const trimmed = name && name.trim() ? name.trim() : null;
  if (trimmed) {
    const low = trimmed.toLowerCase();
    for (const b of next) {
      for (let i = 0; i < b.outfits!.length; i++) {
        if (b.outfits![i]?.toLowerCase() === low) b.outfits![i] = null;
      }
    }
    next[bar].slots[slot] = null;
    next[bar].items![slot] = null;
    next[bar].macros![slot] = null;
  }
  next[bar].outfits![slot] = trimmed;
  return next;
}

/** Clear whatever (outfit, macro, item or spell) is in bar/slot. */
export function clearSlot(bars: ActionBar[], bar: number, slot: number): ActionBar[] {
  if (bar < 0 || bar >= bars.length || slot < 0 || slot >= SLOTS_PER_BAR) return bars;
  const next = cloneBars(bars);
  next[bar].slots[slot] = null;
  next[bar].items![slot] = null;
  next[bar].macros![slot] = null;
  next[bar].outfits![slot] = null;
  return next;
}

/** Bind `key` (null to clear) to bar/slot. Keys are unique across bars: binding here clears it elsewhere. */
export function setKey(bars: ActionBar[], bar: number, slot: number, key: string | null): ActionBar[] {
  if (bar < 0 || bar >= bars.length || slot < 0 || slot >= SLOTS_PER_BAR) return bars;
  const norm = key ? key.trim().toLowerCase() : null;
  const next = cloneBars(bars);
  if (norm) for (const b of next) for (let i = 0; i < b.keys.length; i++) if (b.keys[i] === norm) b.keys[i] = null;
  next[bar].keys[slot] = norm;
  return next;
}

/** First empty bar/slot, or null when every slot is filled. */
export function firstEmptySlot(bars: ActionBar[]): { bar: number; slot: number } | null {
  for (let bi = 0; bi < bars.length; bi++) {
    const b = bars[bi]!;
    for (let i = 0; i < SLOTS_PER_BAR; i++) {
      if (slotAt(b, i) == null) return { bar: bi, slot: i };
    }
  }
  return null;
}

export function addBar(bars: ActionBar[]): ActionBar[] {
  if (bars.length >= MAX_BARS) return bars;
  return [...cloneBars(bars), emptyBar(bars.length)];
}

/** Remove the last bar (never the only one). */
export function removeBar(bars: ActionBar[]): ActionBar[] {
  if (bars.length <= 1) return bars;
  return cloneBars(bars.slice(0, -1));
}

// Place every eligible spell not already on a bar into the first free slots of bars[0..lastBar], in
// order. Idempotent, so it is safe on every learn or load, and it skips item slots.
function fillFreeSlots(bars: ActionBar[], eligibleIds: number[], lastBar: number): ActionBar[] {
  const have = assignedSpellIds(bars);
  const missing = eligibleIds.filter((id) => !have.has(id));
  if (!missing.length) return bars;
  const next = cloneBars(bars);
  let mi = 0;
  for (const b of next.slice(0, lastBar + 1)) {
    for (let i = 0; i < b.slots.length && mi < missing.length; i++) {
      if (b.slots[i] == null && b.items![i] == null && b.macros![i] == null && b.outfits![i] == null) {
        b.slots[i] = missing[mi++];
      }
    }
    if (mi >= missing.length) break;
  }
  return next;
}

/** Autofill every bar — a fresh or legacy kit, and companion bars, which nobody hand-edits. */
export function autofill(bars: ActionBar[], eligibleIds: number[]): ActionBar[] {
  return fillFreeSlots(bars, eligibleIds, bars.length - 1);
}

// Autofill bar 0 only: a bar the player added is their own layout, and a learn used to stuff every
// free slot on it with the rest of the spellbook.
export function autofillPrimaryBar(bars: ActionBar[], eligibleIds: number[]): ActionBar[] {
  return fillFreeSlots(bars, eligibleIds, 0);
}

/** The spellId bound to `key` across all bars (null if unbound, empty, or an item slot). */
export function spellForKey(bars: ActionBar[], key: string): number | null {
  const c = slotForKey(bars, key);
  return c && c.kind === 'spell' ? c.id : null;
}

/** The slot content (spell OR item) bound to `key` across all bars (null if unbound/empty). */
export function slotForKey(bars: ActionBar[], key: string): SlotContent {
  const norm = key.toLowerCase();
  for (const b of bars) {
    for (let i = 0; i < b.keys.length; i++) if (b.keys[i] === norm) return slotAt(b, i);
  }
  return null;
}

// Copy keybinds from `keySource` onto `content` by bar and slot index — when driving a companion
// their slot CONTENT stays theirs but the keys match the player's. Extra bars keep their own.
export function overlayKeys(content: ActionBar[], keySource: ActionBar[]): ActionBar[] {
  const macrosOf = (bar: ActionBar): (string | null)[] =>
    Array.from({ length: SLOTS_PER_BAR }, (_, i) => (isMacroId(bar.macros?.[i]) ? bar.macros![i]! : null));
  const outfitsOf = (bar: ActionBar): (string | null)[] =>
    Array.from({ length: SLOTS_PER_BAR }, (_, i) => outfitNameAt(bar.outfits?.[i]));
  return content.map((bar, bi) => {
    const src = keySource[bi];
    if (!src) {
      return {
        slots: [...bar.slots],
        keys: [...bar.keys],
        items: bar.items ? [...bar.items] : emptyItems(),
        macros: macrosOf(bar),
        outfits: outfitsOf(bar),
      };
    }
    return {
      slots: [...bar.slots],
      keys: Array.from({ length: SLOTS_PER_BAR }, (_, i) => src.keys[i] ?? null),
      items: Array.from({ length: SLOTS_PER_BAR }, (_, i) =>
        typeof bar.items?.[i] === 'number' ? bar.items[i]! : null),
      macros: macrosOf(bar),
      outfits: outfitsOf(bar),
    };
  });
}

/** Bar/slot index of the first slot bound to `key` (for shared-keybind targeting). */
export function barSlotForKey(bars: ActionBar[], key: string): { bar: number; slot: number } | null {
  const norm = key.toLowerCase();
  for (let bi = 0; bi < bars.length; bi++) {
    const b = bars[bi]!;
    for (let i = 0; i < b.keys.length; i++) if (b.keys[i] === norm) return { bar: bi, slot: i };
  }
  return null;
}

// Replace all occurrences of `oldId` with `newId` on the bars (e.g. rank 1 -> rank 2 of same spell). Keeps
// the spell in the same slot(s). Does not de-dupe against other copies of newId (rare).
export function replaceSpell(bars: ActionBar[], oldId: number, newId: number): ActionBar[] {
  if (oldId === newId) return bars;
  const next = cloneBars(bars);
  let changed = false;
  for (const b of next) {
    for (let i = 0; i < b.slots.length; i++) {
      if (b.slots[i] === oldId) {
        b.slots[i] = newId;
        changed = true;
      }
    }
  }
  return changed ? next : bars;
}
