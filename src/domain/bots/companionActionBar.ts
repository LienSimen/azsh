// Per-companion action bars, the same ActionBar shape as the player's. Keybinds are not
// independent: combat overlays the player's keys by slot index. Pure — no DOM, rng or Date.

import type { DataStore } from '../../data/dataStore.ts';
import { knownUsableSpells, lowerRanksFor } from '../character/characterSpells.ts';
import {
  autofill,
  emptyBar,
  emptyItems,
  normalizeBars,
  replaceSpell,
  SLOTS_PER_BAR,
  type ActionBar,
} from '../character/actionbar.ts';
import { companionRotationOf } from './companionRotation.ts';
import { EQUIP_SLOTS } from '../items/equipment.ts';
import { equippedEntry } from '../items/itemInstance.ts';
import {
  companionCharacter,
  companionLevel,
  companionSpellbook,
  type Companion,
} from './squad.ts';
import { ROTATION_PHASES, type Rotation } from '../rotation/rotation.ts';

/** Max bars auto-seed will open (player can still add up to MAX_BARS in the editor). */
export const COMPANION_SEED_MAX_BARS = 3;

function hasContent(bars: ActionBar[]): boolean {
  for (const b of bars) {
    for (let i = 0; i < b.slots.length; i++) {
      if (b.slots[i] != null) return true;
      if (b.items?.[i] != null) return true;
      if (b.macros?.[i] != null) return true;
      if (b.outfits?.[i] != null) return true;
    }
  }
  return false;
}

/** Spell ids eligible for manual placement (highest usable rank per name). */
export function companionEligibleSpellIds(comp: Companion, level: number, ds: DataStore): number[] {
  const char = companionCharacter(comp, level, ds);
  const sb = companionSpellbook(comp, level, ds);
  return knownUsableSpells(char, sb, ds).map((s) => s.id);
}

// Enabled rotation actions in priority order (combat → pull → buffs → recovery). Spells and items
// interleaved as the rotation lists them — first appearance wins.
export function rotationBarActions(rot: Rotation): Array<
  | { kind: 'spell'; id: number }
  | { kind: 'item'; entry: number }
> {
  const seenSpell = new Set<number>();
  const seenItem = new Set<number>();
  const out: Array<{ kind: 'spell'; id: number } | { kind: 'item'; entry: number }> = [];
  // Combat first (what you press under takeover), then openers, buffs, recovery pots.
  const order = ['combat', 'pull', 'buffs', 'prebuff', 'recovery'] as const;
  for (const phase of order) {
    if (!ROTATION_PHASES.includes(phase)) continue;
    for (const r of rot.phases[phase] ?? []) {
      if (!r.enabled) continue;
      if (r.action.kind === 'spell') {
        const id = r.action.spellId;
        if (seenSpell.has(id)) continue;
        seenSpell.add(id);
        out.push({ kind: 'spell', id });
      } else if (r.action.kind === 'item') {
        const entry = r.action.itemEntry;
        if (seenItem.has(entry)) continue;
        seenItem.add(entry);
        out.push({ kind: 'item', entry });
      }
    }
  }
  return out;
}

// Equipped on-use gear (trinkets, engineering, etc.) — ItemDef with useInCombat / useBuff / useSpell. These
// are the "press on bar" actives, not passive stats.
export function equippedOnUseEntries(comp: Companion, level: number, ds: DataStore): number[] {
  const char = companionCharacter(comp, level, ds);
  const out: number[] = [];
  const seen = new Set<number>();
  for (const slot of EQUIP_SLOTS) {
    const entry = equippedEntry(char.equipped[slot]);
    if (entry == null || seen.has(entry)) continue;
    const it = ds.item(entry);
    if (!it) continue;
    if (!(it.useInCombat || it.useBuff || it.useSpell != null)) continue;
    // Item.RequiredLevel only (not inflated useInCombat/useBuff spell floors — KI-855).
    const req = it.requiredLevel ?? 0;
    if (req > char.level) continue;
    seen.add(entry);
    out.push(entry);
  }
  return out;
}

/** Lay out cells onto 1–`maxBars` bars (12 slots each). Extra bars only when needed. */
export function layoutCompanionBars(
  cells: ReadonlyArray<{ kind: 'spell'; id: number } | { kind: 'item'; entry: number }>,
  maxBars = COMPANION_SEED_MAX_BARS,
): ActionBar[] {
  const n = Math.min(cells.length, maxBars * SLOTS_PER_BAR);
  const barCount = Math.min(maxBars, Math.max(1, Math.ceil(Math.max(n, 1) / SLOTS_PER_BAR)));
  const bars: ActionBar[] = Array.from({ length: barCount }, (_, i) => emptyBar(i));
  for (let i = 0; i < n; i++) {
    const cell = cells[i]!;
    const bi = Math.floor(i / SLOTS_PER_BAR);
    const si = i % SLOTS_PER_BAR;
    const bar = bars[bi]!;
    if (!bar.items) bar.items = emptyItems();
    if (cell.kind === 'spell') {
      bar.slots[si] = cell.id;
      bar.items[si] = null;
    } else {
      bar.slots[si] = null;
      bar.items[si] = cell.entry;
    }
  }
  return bars;
}

/** Full hire/untouched seed: rotation kit + equipped on-use, grown to 2–3 bars if needed. */
export function seedCompanionActionBars(
  comp: Companion,
  playerLevel: number,
  ds: DataStore,
): ActionBar[] {
  const level = companionLevel(comp, playerLevel);
  const rot = companionRotationOf(comp, playerLevel, ds);
  const cells = rotationBarActions(rot);
  const seenItem = new Set(cells.filter((c) => c.kind === 'item').map((c) => c.entry));
  // On-use gear not already listed as a rotation item (trinkets rarely sit in the rotation).
  for (const entry of equippedOnUseEntries(comp, level, ds)) {
    if (seenItem.has(entry)) continue;
    seenItem.add(entry);
    cells.push({ kind: 'item', entry });
  }
  // Empty kit edge case: leave one empty bar so the editor still has drop targets.
  if (!cells.length) return [emptyBar(0)];
  return layoutCompanionBars(cells, COMPANION_SEED_MAX_BARS);
}

// Resolve a companion's action bars: normalize shape, seed from rotation + on-use when empty. Does not
// mutate `comp` — caller assigns the return when persisting.
export function resolveCompanionActionBars(
  comp: Companion,
  playerLevel: number,
  ds: DataStore,
): ActionBar[] {
  if (comp.actionBars && hasContent(normalizeBars(comp.actionBars))) {
    return normalizeBars(comp.actionBars);
  }
  return seedCompanionActionBars(comp, playerLevel, ds);
}

// Grow already-seeded bars to the companion's CURRENT kit: rewrite a superseded rank in place and
// drop newly known rotation actions into free slots. Never touches a hand-placed slot.
export function topUpCompanionActionBars(
  comp: Companion,
  playerLevel: number,
  ds: DataStore,
): ActionBar[] {
  const level = companionLevel(comp, playerLevel);
  const sb = companionSpellbook(comp, level, ds);
  let bars = resolveCompanionActionBars(comp, playerLevel, ds);
  const wanted: number[] = [];
  for (const cell of rotationBarActions(companionRotationOf(comp, playerLevel, ds))) {
    if (cell.kind !== 'spell') continue;
    for (const oldId of lowerRanksFor(sb, cell.id, ds)) bars = replaceSpell(bars, oldId, cell.id);
    wanted.push(cell.id);
  }
  return autofill(growBarsForAutofill(bars, wanted), wanted);
}

// Open another seeded bar when an autofill has more spells than free slots — the seed packs bars
// to fit EXACTLY, so a book-taught rank had nowhere to write. Stays inside COMPANION_SEED_MAX_BARS.
export function growBarsForAutofill(bars: ActionBar[], wanted: readonly number[]): ActionBar[] {
  const have = new Set<number>();
  for (const b of bars) for (const id of b.slots) if (id != null) have.add(id);
  let missing = wanted.filter((id) => !have.has(id)).length;
  if (!missing) return bars;
  for (const b of bars) {
    for (let i = 0; i < b.slots.length; i++) {
      if (b.slots[i] == null && b.items?.[i] == null && b.macros?.[i] == null) missing--;
    }
  }
  // No clone needed: autofill clones before it writes, and emptyBar arrives fully shaped
  // (items / macros / outfits initialised), which autofill's slot test requires.
  const out = [...bars];
  while (missing > 0 && out.length < COMPANION_SEED_MAX_BARS) {
    out.push(emptyBar(out.length));
    missing -= SLOTS_PER_BAR;
  }
  return out;
}

/** Mutate-and-return: ensure `comp.actionBars` is set (lazy seed like companion.rotation). */
export function ensureCompanionActionBars(
  comp: Companion,
  playerLevel: number,
  ds: DataStore,
): ActionBar[] {
  const bars = resolveCompanionActionBars(comp, playerLevel, ds);
  comp.actionBars = bars;
  return bars;
}
