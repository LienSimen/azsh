// Consumable RANK LADDERS — "healing potion", not "Minor Healing Potion", so a rotation row binds
// a FAMILY resolved against the bags at use time. The key is derived by stripping rank adjectives.

import type { DataStore } from '../../data/dataStore.ts';
import type { ItemDef } from '../../data/schema.ts';
import type { Character } from '../character/character.ts';
import type { Inventory } from './inventory.ts';
import { countItem } from './inventory.ts';
import { isWeaponImbueItem } from '../professions/weaponImbueHand.ts';

/** SPELL_EFFECT_ENERGIZE. Cite: SharedDefines.h SpellEffects; SpellEffects.cpp EffectEnergize. */
const SPELL_EFFECT_ENERGIZE = 30;

// Which Powers index a restore_power consumable actually fills: the bake's own stamp first, else the
// use-spell — its energize effect, then the raw miscValue for a thin row. Thistle Tea is energy, and
// reading it as mana pays a rogue nothing (or, before the pool gate, paid them the wrong bar).
export function restoredPowerTypeIndex(it: ItemDef, ds: DataStore): number | null {
  if (it.useInCombat?.powerType != null) return it.useInCombat.powerType | 0;
  const spellId = it.useSpell ?? it.useInCombat?.spellId;
  if (spellId == null) return null;
  const sp = ds.spell(spellId);
  if (!sp) return null;
  for (const e of sp.effects ?? []) {
    if (e.kind === 'energize') return e.powerType | 0;
    if (e.kind === 'restore_power' && e.powerType != null) return e.powerType | 0;
  }
  for (const r of sp.rawEffects ?? []) {
    if ((r.effect | 0) === SPELL_EFFECT_ENERGIZE) return r.miscValue | 0;
  }
  return null;
}

/** What a consumable DOES. Two items only share a ladder when they share this. */
export type ConsumableRole = 'restore_health' | 'restore_power' | 'apply_buff' | 'weapon_imbue';

// Rank adjectives Classic uses on consumable ladders, read off the item names themselves: Minor to
// Major, Rough to Dense, Weak/Strong, the level-60 one-offs, and Combat / Discolored.
const RANK_WORDS = [
  'minor', 'lesser', 'greater', 'superior', 'major', 'mighty', 'strong', 'weak',
  'rough', 'coarse', 'heavy', 'solid', 'dense',
  'elemental', 'consecrated', 'brilliant', 'blessed', 'discolored', 'combat',
  'small', 'large', 'giant',
];
const RANK_RE = new RegExp(`\\b(${RANK_WORDS.join('|')})\\b`, 'g');

// The other rank marker Classic uses: a trailing numeral ("Instant Poison VI", "Scroll of Agility
// IV"). 34 of the 238 consumables carry one, and every one of them is a rank of the name before it.
const RANK_NUMERAL_RE = /\s+(?:i{1,3}|iv|vi{0,3}|ix|xi{0,2}|x)$/;

/** Rank-free remainder of an item name, lowercased ("Elixir of Greater Agility" → "elixir of agility"). */
export function rankFreeItemName(name: string): string {
  return name.toLowerCase()
    .replace(RANK_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(RANK_NUMERAL_RE, '');
}

/** What this consumable does, or null when it is not a usable consumable at all. */
export function consumableRoleOf(it: ItemDef | undefined, ds: DataStore): ConsumableRole | null {
  if (!it) return null;
  // Equippable on-use gear only works while worn — that is combatItems' job, not a ladder.
  if (it.slot != null) return null;
  if (isWeaponImbueItem(it, ds)) return 'weapon_imbue';
  const eff = it.useInCombat?.effect;
  if (eff === 'restore_health' || eff === 'restore_power') return eff;
  if (it.useBuff) return 'apply_buff';
  return null;
}

// Ladder key for one item, or null when it has no consumable role. Two items in the same family are the
// same consumable at different ranks.
export function consumableFamilyKey(it: ItemDef | undefined, ds: DataStore): string | null {
  const role = consumableRoleOf(it, ds);
  if (!role || !it) return null;
  const base = rankFreeItemName(it.name);
  if (!base) return null;
  return `${it.itemClass ?? -1}/${it.itemSubclass ?? -1}/${role}/${base}`;
}

/** Display label for a family key — the ladder's own name, title-cased ("Healing Potion"). */
export function consumableFamilyLabel(family: string): string {
  const base = family.split('/').slice(3).join('/');
  const small = new Set(['of', 'the', 'and']);
  return base
    .split(' ')
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

interface FamilyIndex {
  /** Item count the index was built at — the lazy catalog attach invalidates it. */
  n: number;
  byFamily: Map<string, ItemDef[]>;
}

const indexCache = new WeakMap<DataStore, FamilyIndex>();

/** Every catalog member of each family, lowest itemLevel first. Cached per DataStore. */
function familyIndex(ds: DataStore): Map<string, ItemDef[]> {
  const all = ds.items();
  const hit = indexCache.get(ds);
  if (hit && hit.n === all.length) return hit.byFamily;
  const byFamily = new Map<string, ItemDef[]>();
  for (const it of all) {
    if (it.notObtainable) continue;
    const key = consumableFamilyKey(it, ds);
    if (!key) continue;
    const list = byFamily.get(key);
    if (list) list.push(it);
    else byFamily.set(key, [it]);
  }
  for (const list of byFamily.values()) {
    // Ascending, so the last usable member is the best rank. itemLevel is the ladder, with quality
    // then requiredLevel breaking real ties (Blessed Wizard Oil beats Brilliant at itemLevel 55).
    list.sort((a, b) =>
      (a.itemLevel ?? 0) - (b.itemLevel ?? 0)
      || (a.quality ?? 0) - (b.quality ?? 0)
      || (a.requiredLevel | 0) - (b.requiredLevel | 0)
      // Fully tied ranks: the LOWER entry is the canonical one, so it sorts last and wins
      // (Superior Healing Potion 3928 over the identical PvP-reward Combat Healing Potion 18839).
      || b.entry - a.entry);
  }
  indexCache.set(ds, { n: all.length, byFamily });
  return byFamily;
}

/** Catalog members of a family, lowest rank first. Empty for an unknown key. */
export function consumableFamilyMembers(family: string, ds: DataStore): readonly ItemDef[] {
  return familyIndex(ds).get(family) ?? [];
}

/** The family this entry belongs to, or null. */
export function consumableFamilyOfEntry(entry: number, ds: DataStore): string | null {
  return consumableFamilyKey(ds.item(entry), ds);
}

export interface BestFamilyOpts {
  /** Owner of the item — gates requiredLevel and the engineering-device skill check. */
  char: Character;
  /** Bags to prefer. Omitted (or empty of this family) falls back to the catalog. */
  inventory?: Inventory;
}

// Level-legal for this character. requiredLevel is the only gate — useInCombat.reqLevel is the
// spell's own level and gating on it locked a level 20 out of the potion Classic sells at 12.
function usableBy(it: ItemDef, char: Character): boolean {
  return (it.requiredLevel | 0) <= char.level;
}

// Best rank of `family` for this character: the highest-itemLevel member they can use, out of the BAGS when
// they carry any, else out of the catalog so the row is still visible (and inert) while they carry none.
export function bestFamilyItem(
  family: string,
  ds: DataStore,
  opts: BestFamilyOpts,
): ItemDef | null {
  const members = consumableFamilyMembers(family, ds);
  if (!members.length) return null;
  let carried: ItemDef | null = null;
  let catalog: ItemDef | null = null;
  // members is ascending by itemLevel, so the last match in each bucket is the best.
  for (const it of members) {
    if (!usableBy(it, opts.char)) continue;
    catalog = it;
    if (opts.inventory && countItem(opts.inventory, it.entry) > 0) carried = it;
  }
  return carried ?? catalog;
}

// Best rank of `family` the character actually CARRIES, or null. This is the use-time resolve — a rotation
// row fires on what is in the bag, not on what it was built with.
export function bestCarriedFamilyItem(
  family: string,
  ds: DataStore,
  char: Character,
  inventory: Inventory | undefined,
): ItemDef | null {
  if (!inventory) return null;
  let best: ItemDef | null = null;
  for (const it of consumableFamilyMembers(family, ds)) {
    if (!usableBy(it, char)) continue;
    if (countItem(inventory, it.entry) <= 0) continue;
    best = it;
  }
  return best;
}

// Best rank of `family` out of a list of CARRIED entries — the live-session form, where the kit is
// `session.items()` / `unitItems(side)` rather than an Inventory object.
export function bestCarriedFamilyEntry(
  family: string,
  carried: readonly number[],
  char: Character,
  ds: DataStore,
): number | null {
  if (!carried.length) return null;
  const have = new Set(carried);
  let best: number | null = null;
  for (const it of consumableFamilyMembers(family, ds)) {
    if (!have.has(it.entry) || !usableBy(it, char)) continue;
    best = it.entry;
  }
  return best;
}
