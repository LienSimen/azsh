// Out-of-combat auto-consumables — player-picked food, drink and buff items that regenTick re-uses,
// mirroring pet autoFeed. Food and drink fire on low vitals, buffs when the aura is missing.
import type { DataStore } from '../../data/dataStore.ts';
import type { ItemDef } from '../../data/schema.ts';
import type { Character } from '../character/character.ts';
import { getActiveBuffIds, maxHealth, maxPower, powerType } from '../character/character.ts';
import type { Inventory } from '../items/inventory.ts';
import { countItem } from '../items/inventory.ts';

/** HP/mana fraction at or below which auto food/drink fires. */
export const AUTO_CONSUMABLE_VITAL_THRESHOLD = 0.7;

export type AutoConsumableKind = 'food' | 'drink' | 'buff' | 'heal' | 'other';

export interface AutoConsumablePrefs {
  /** Food item entry — auto when HP ≤ threshold. */
  food?: number;
  /** Drink item entry — auto when mana ≤ threshold (mana users only). */
  drink?: number;
  /** Buff consumables (elixirs/scrolls/flasks) — auto when aura/mod missing. */
  buffs?: number[];
}

export function emptyAutoConsumables(): AutoConsumablePrefs {
  return {};
}

export function normalizeAutoConsumables(raw: unknown): AutoConsumablePrefs | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const out: AutoConsumablePrefs = {};
  if (typeof r.food === 'number' && r.food > 0) out.food = r.food;
  if (typeof r.drink === 'number' && r.drink > 0) out.drink = r.drink;
  if (Array.isArray(r.buffs)) {
    const buffs = r.buffs.filter((x): x is number => typeof x === 'number' && x > 0);
    if (buffs.length) out.buffs = [...new Set(buffs)];
  }
  return out.food != null || out.drink != null || (out.buffs && out.buffs.length)
    ? out
    : undefined;
}

/** Classify a bag item for the auto-consumable picker. */
export function classifyConsumable(it: ItemDef, char: Character): AutoConsumableKind | null {
  // Only a real consumable qualifies. "Recipe: Elixir of Fortitude" matched the elixir heuristic
  // below, so the picker ate the book. Cite: item_template.class 0 ITEM_CLASS_CONSUMABLE.
  if (it.itemClass !== 0 && it.consumable == null && it.useBuff == null) return null;
  if (it.consumable?.effect === 'food') return 'food';
  if (it.consumable?.effect === 'drink') return 'drink';
  // useSpell restore paths often bake food/drink without consumable{}
  if (it.useSpell != null && !it.useBuff && !it.useInCombat && it.consumable) {
    return it.consumable.effect;
  }
  if (it.useBuff) return 'buff';
  if (it.useInCombat?.effect === 'restore_health') return 'heal';
  if (it.useInCombat?.effect === 'restore_power') return 'drink';
  // useSpell-only: buff / restore / heal — treat buff-like as buff for auto
  if (it.useSpell != null) {
    // Food/drink named items with useSpell only
    const n = (it.name ?? '').toLowerCase();
    if (/\b(food|bread|meat|cheese|fish|steak|rib|haunch|sausage|pie|cake|muffin|apple)\b/.test(n)
      || it.foodType != null) {
      return 'food';
    }
    if (/\b(water|juice|milk|tea|refreshing|sweet nectar|moonberry|melon juice)\b/.test(n)) {
      return 'drink';
    }
    if (/\b(elixir|flask|scroll|potion of|oil of|juju)\b/.test(n)) return 'buff';
    if (/\bpotion\b/.test(n)) return 'heal';
    // Unrecognised on-use is NOT a buff. Defaulting to one auto-fired 2,575 items nothing asked
    // for: 1,571 recipes, mounts, armour kits, and quest items (4941 Glue, 4945 Skull).
    return null;
  }
  if (char && it.slot) return null; // equippable gear is not a bag consumable for this panel
  return null;
}

/** True when this item is a reasonable auto-use candidate from bags. */
export function isAutoConsumableCandidate(it: ItemDef, char: Character): boolean {
  if (char.level < (it.requiredLevel || 1)) return false;
  // Quest-provided items are never auto-consumables. The useSpell fallthrough classifies any
  // unrecognised on-use item as a buff, which pulled the Taming the Beast rods into the picker.
  if (it.questItem) return false;
  const kind = classifyConsumable(it, char);
  if (!kind || kind === 'other') return false;
  if (kind === 'drink' && powerType(char) !== 'mana') return false;
  // Combat-only heal pots are still useful OOC; allow them as heal.
  return true;
}

// Whether the character already has the buff this consumable would apply. Matches by useSpell aura id, or
// by useBuff.mod when no spell id is present.
export function hasMatchingConsumableBuff(
  char: Character,
  it: ItemDef,
  ds: DataStore,
  now = Date.now(),
): boolean {
  const active = new Set(getActiveBuffIds(char, now, ds));
  const useSp = it.useSpell;
  if (useSp != null && useSp > 0 && active.has(useSp)) return true;

  // Pure useBuff without useSpell: match by effect mod on any active spell that grants it,
  // or treat as present when any aura is a "consumable-shaped" match is unavailable — use mod scan.
  const mod = it.useBuff?.mod;
  if (mod) {
    for (const id of active) {
      const sp = ds.spell(id);
      if (!sp) continue;
      for (const e of sp.effects ?? []) {
        if (e.kind === 'buff' && (e as { mod?: string }).mod === mod) return true;
      }
    }
    // useBuff with pseudo-aura id 0 may not land in getActiveBuffIds the same way;
    // also check activeAuras for spellId 0 + recent consume (rare). Skip false positive.
  }
  return false;
}

export function needsAutoFood(char: Character, ds: DataStore): boolean {
  const max = maxHealth(char, ds);
  if (max <= 0) return false;
  return char.health / max <= AUTO_CONSUMABLE_VITAL_THRESHOLD;
}

export function needsAutoDrink(char: Character, ds: DataStore): boolean {
  if (powerType(char) !== 'mana') return false;
  const max = maxPower(char, ds);
  if (max <= 0) return false;
  return char.power / max <= AUTO_CONSUMABLE_VITAL_THRESHOLD;
}

export type AutoConsumeAction =
  | { kind: 'food' | 'drink' | 'heal'; entry: number }
  | { kind: 'buff'; entry: number };

// Decide which auto-consumable to use this tick (at most one). Priority: food (if low HP) → drink (if low
// mana) → first missing buff.
export function pickAutoConsume(
  char: Character,
  inv: Inventory,
  ds: DataStore,
  prefs: AutoConsumablePrefs | undefined,
  now = Date.now(),
): AutoConsumeAction | null {
  if (!prefs) return null;

  if (prefs.food != null && needsAutoFood(char, ds) && countItem(inv, prefs.food) > 0) {
    const it = ds.item(prefs.food);
    if (it && isAutoConsumableCandidate(it, char)) {
      return { kind: 'food', entry: prefs.food };
    }
  }

  if (prefs.drink != null && needsAutoDrink(char, ds) && countItem(inv, prefs.drink) > 0) {
    const it = ds.item(prefs.drink);
    if (it && isAutoConsumableCandidate(it, char)) {
      return { kind: 'drink', entry: prefs.drink };
    }
  }

  for (const entry of prefs.buffs ?? []) {
    if (countItem(inv, entry) <= 0) continue;
    const it = ds.item(entry);
    if (!it || !isAutoConsumableCandidate(it, char)) continue;
    const kind = classifyConsumable(it, char);
    if (kind === 'heal') {
      if (needsAutoFood(char, ds)) return { kind: 'heal', entry };
      continue;
    }
    if (kind === 'buff' || kind === 'other') {
      if (!hasMatchingConsumableBuff(char, it, ds, now)) {
        return { kind: 'buff', entry };
      }
    }
  }
  return null;
}

/** Inventory rows eligible for the auto-consumable picker. */
export function listAutoConsumableOptions(
  char: Character,
  inv: Inventory,
  ds: DataStore,
): { entry: number; count: number; kind: AutoConsumableKind; item: ItemDef }[] {
  const counts = new Map<number, number>();
  for (const s of inv.stacks) {
    counts.set(s.item, (counts.get(s.item) ?? 0) + s.count);
  }
  const out: { entry: number; count: number; kind: AutoConsumableKind; item: ItemDef }[] = [];
  for (const [entry, count] of counts) {
    const item = ds.item(entry);
    if (!item) continue;
    if (!isAutoConsumableCandidate(item, char)) continue;
    const kind = classifyConsumable(item, char);
    if (!kind) continue;
    out.push({ entry, count, kind, item });
  }
  return out.sort((a, b) =>
    a.kind.localeCompare(b.kind)
    || (b.item.itemLevel ?? 0) - (a.item.itemLevel ?? 0)
    || a.item.name.localeCompare(b.item.name));
}

export function isAutoFood(prefs: AutoConsumablePrefs | undefined, entry: number): boolean {
  return prefs?.food === entry;
}
export function isAutoDrink(prefs: AutoConsumablePrefs | undefined, entry: number): boolean {
  return prefs?.drink === entry;
}
export function isAutoBuff(prefs: AutoConsumablePrefs | undefined, entry: number): boolean {
  return !!prefs?.buffs?.includes(entry);
}

// Prefs entries with no row in `listAutoConsumableOptions` — the item left the bags or stopped
// being eligible. Rendering them is what gives a stuck pref a way off. Undefined item = not baked.
export function staleAutoConsumables(
  prefs: AutoConsumablePrefs | undefined,
  char: Character,
  inv: Inventory,
  ds: DataStore,
): { entry: number; slot: 'food' | 'drink' | 'buff'; item?: ItemDef }[] {
  if (!prefs) return [];
  const live = new Set(listAutoConsumableOptions(char, inv, ds).map((o) => o.entry));
  const out: { entry: number; slot: 'food' | 'drink' | 'buff'; item?: ItemDef }[] = [];
  const add = (entry: number, slot: 'food' | 'drink' | 'buff'): void => {
    if (live.has(entry)) return;
    out.push({ entry, slot, ...(ds.item(entry) ? { item: ds.item(entry)! } : {}) });
  };
  if (prefs.food != null) add(prefs.food, 'food');
  if (prefs.drink != null) add(prefs.drink, 'drink');
  for (const e of prefs.buffs ?? []) add(e, 'buff');
  return out;
}

// Remove an entry from every slot, whatever it was set as. `toggleAutoConsumable` needs a `kind`
// from the live item def, which fails exactly when clearing matters most.
export function clearAutoConsumable(
  prefs: AutoConsumablePrefs | undefined,
  entry: number,
): AutoConsumablePrefs | undefined {
  if (!prefs) return undefined;
  const cur: AutoConsumablePrefs = { ...prefs };
  if (cur.food === entry) delete cur.food;
  if (cur.drink === entry) delete cur.drink;
  if (cur.buffs) {
    const buffs = cur.buffs.filter((e) => e !== entry);
    if (buffs.length) cur.buffs = buffs;
    else delete cur.buffs;
  }
  return normalizeAutoConsumables(cur);
}

/** Toggle food/drink (single slot) or buff list membership. Returns next prefs (or undefined if empty). */
export function toggleAutoConsumable(
  prefs: AutoConsumablePrefs | undefined,
  entry: number,
  kind: AutoConsumableKind,
): AutoConsumablePrefs | undefined {
  const cur = { ...(prefs ?? {}) };
  if (kind === 'food' || kind === 'heal') {
    // heal pots share the food slot when used as OOC top-up, but buffs stay separate
    if (kind === 'heal') {
      // heal pots go on buffs list so they re-use when low HP via pickAutoConsume
      const set = new Set(cur.buffs ?? []);
      if (set.has(entry)) set.delete(entry);
      else set.add(entry);
      cur.buffs = set.size ? [...set] : undefined;
      if (!cur.buffs?.length) delete cur.buffs;
    } else {
      cur.food = cur.food === entry ? undefined : entry;
      if (cur.food == null) delete cur.food;
    }
  } else if (kind === 'drink') {
    cur.drink = cur.drink === entry ? undefined : entry;
    if (cur.drink == null) delete cur.drink;
  } else {
    const set = new Set(cur.buffs ?? []);
    if (set.has(entry)) set.delete(entry);
    else set.add(entry);
    cur.buffs = set.size ? [...set] : undefined;
    if (!cur.buffs?.length) delete cur.buffs;
  }
  return normalizeAutoConsumables(cur);
}
