// Whole categories the junk filter refuses to sell or destroy. Every test reads item_template
// CLASS, never the consumable SUBCLASS, which the 1.12 tier renumbers against the header enum.

import type { ItemDef, RecipeDef } from '../../data/schema.ts';
import { ITEM_CLASS_TRADE_GOODS } from '../bots/sendTradeGoods.ts';
import { itemTeachIntent, type TeachLookup } from './itemTeaches.ts';
import { isFishingPole, isMiningPick, isSkinningKnife } from '../professions/professions.ts';
import { SPELL_EFFECT_SUMMON_CRITTER } from '../../engine/spells/interpreter/opcodes.ts';

/** Cite: ItemPrototype.h:144-159. Only the classes a category asks about. */
const ITEM_CLASS_CONSUMABLE = 0;
const ITEM_CLASS_CONTAINER = 1;
const ITEM_CLASS_REAGENT = 5;
const ITEM_CLASS_PROJECTILE = 6;
const ITEM_CLASS_RECIPE = 9;
const ITEM_CLASS_QUIVER = 11;
const ITEM_CLASS_QUEST = 12;
const ITEM_CLASS_KEY = 13;

/** INVTYPE_AMMO. Cite: ItemPrototype.h InventoryType; Item.cpp ItemCanGoIntoBag. */
const INVTYPE_AMMO = 24;
/** item_template.BagFamily ARROWS / BULLETS. Cite: Item.cpp ItemCanGoIntoBag. */
const BAG_FAMILY_ARROWS = 1;
const BAG_FAMILY_BULLETS = 2;

export type JunkProtectCategory =
  | 'ammo'
  | 'quiver'
  | 'foodDrink'
  | 'consumable'
  | 'reagent'
  | 'tradeGoods'
  | 'container'
  | 'teaches'
  | 'key'
  | 'quest'
  | 'mountPet'
  | 'tool';

export interface JunkProtectCategoryDef {
  id: JunkProtectCategory;
  /** Checkbox label, in the player's own words. */
  label: string;
  /** One line of why, for the settings row and the skipped-row reason. */
  hint: string;
}

// Display order is "most likely to be in a bag" first. Every one is on by default: the point of the list is
// that a fresh player can press Sell All without reading it.
export const JUNK_PROTECT_CATEGORIES: readonly JunkProtectCategoryDef[] = [
  { id: 'ammo', label: 'Arrows and bullets', hint: 'Ammunition your bow or gun still needs' },
  { id: 'quiver', label: 'Quivers and ammo pouches', hint: 'The bag your ammo lives in' },
  { id: 'foodDrink', label: 'Food and drink', hint: 'What the party eats and drinks between pulls' },
  { id: 'consumable', label: 'Potions, scrolls and bandages', hint: 'Every other consumable' },
  { id: 'reagent', label: 'Spell reagents', hint: 'Powders, ankhs, symbols a spell consumes' },
  { id: 'tradeGoods', label: 'Crafting materials', hint: 'Cloth, ore, herbs, leather, essences' },
  { id: 'container', label: 'Bags and containers', hint: 'Spare bags, not the ones you wear' },
  { id: 'teaches', label: 'Recipes, formulas and books', hint: 'Anything somebody can still read' },
  { id: 'key', label: 'Keys and lockpicks', hint: 'Dungeon keys and skeleton keys' },
  { id: 'quest', label: 'Quest items', hint: 'Quest drops and items that start a quest' },
  { id: 'mountPet', label: 'Mounts and pets', hint: 'Reins, whistles, pet carriers' },
  { id: 'tool', label: 'Profession tools', hint: 'Hammer, spanner, rods, pick, knife, pole' },
];

const CATEGORY_IDS = new Set<string>(JUNK_PROTECT_CATEGORIES.map((c) => c.id));

export const DEFAULT_PROTECT_CATEGORIES: readonly JunkProtectCategory[] =
  JUNK_PROTECT_CATEGORIES.map((c) => c.id);

export function junkProtectCategoryLabel(id: JunkProtectCategory): string {
  return JUNK_PROTECT_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

// Coerce a stored list. An ABSENT list means "never configured" and takes the defaults — an EMPTY array is
// a player who unchecked every box and must stay empty.
export function normalizeProtectCategories(raw: unknown): JunkProtectCategory[] {
  if (!Array.isArray(raw)) return [...DEFAULT_PROTECT_CATEGORIES];
  const out: JunkProtectCategory[] = [];
  for (const x of raw) {
    if (typeof x === 'string' && CATEGORY_IDS.has(x) && !out.includes(x as JunkProtectCategory)) {
      out.push(x as JunkProtectCategory);
    }
  }
  return out;
}

// Item entries held, never spent, by some recipe — hammers, spanners, enchanting rods. Nine in the
// bake, all white with a real sell price, so "sell all common" ate the crafting kit.
export function craftToolEntries(recipes: readonly RecipeDef[]): Set<number> {
  const out = new Set<number>();
  for (const r of recipes) {
    for (const t of r.requiredTools ?? []) if (t > 0) out.add(t);
  }
  return out;
}

export interface ProtectLookup extends TeachLookup {
  /** From craftToolEntries(ds.recipes()). Empty set = tools fall through to their item class. */
  craftTools: ReadonlySet<number>;
}

/** DataStore slice protectLookupFor needs. */
export type ProtectSource = TeachLookup & { recipes(): RecipeDef[] };

const toolsByStore = new WeakMap<object, Set<number>>();

// One craft-tool set per DataStore. dispositionForEntry runs per bag entry and ds.recipes() materializes
// 1,135 rows, so this must never be rebuilt inside the loop.
export function protectLookupFor(ds: ProtectSource): ProtectLookup {
  let tools = toolsByStore.get(ds);
  if (!tools) {
    tools = craftToolEntries(ds.recipes());
    toolsByStore.set(ds, tools);
  }
  return { spell: ds.spell, recipe: ds.recipe, enchant: ds.enchant, craftTools: tools };
}

// A mount or a mini-pet. mountSpell is the baked aura-78 marker; a critter has none, so its on-use
// spell is read for SPELL_EFFECT_SUMMON_CRITTER — a Cat Carrier is class 15 like any trinket.
function isMountOrPet(it: ItemDef, look: ProtectLookup): boolean {
  if (it.mountSpell != null) return true;
  if (it.useSpell == null) return false;
  const sp = look.spell(it.useSpell);
  return !!sp?.rawEffects?.some((e) => e.effect === SPELL_EFFECT_SUMMON_CRITTER);
}

// Which protected category this item falls in, or null when nothing claims it. First match wins,
// since the earlier tests are the ones whose reason a player would recognise.
export function itemProtectCategory(
  it: ItemDef | undefined | null,
  look: ProtectLookup,
): JunkProtectCategory | null {
  if (!it) return null;
  const cls = it.itemClass;

  if (it.questItem || (it.startQuest ?? 0) > 0 || cls === ITEM_CLASS_QUEST) return 'quest';
  // Tools before their item class: the enchanting rods are class 7, the pick a class-2 weapon.
  if (look.craftTools.has(it.entry) || isFishingPole(it) || isMiningPick(it) || isSkinningKnife(it)) {
    return 'tool';
  }
  if (cls === ITEM_CLASS_PROJECTILE
    || it.inventoryType === INVTYPE_AMMO
    || it.bagFamily === BAG_FAMILY_ARROWS
    || it.bagFamily === BAG_FAMILY_BULLETS) {
    return 'ammo';
  }
  if (cls === ITEM_CLASS_QUIVER) return 'quiver';
  if (cls === ITEM_CLASS_CONSUMABLE) {
    // The bake only stamps `consumable` on the food/drink rows it could derive (Skin of Dwarven
    // Stout has none), so the split is cosmetic — both halves are class 0 and both are protected.
    return it.consumable != null || it.foodType != null ? 'foodDrink' : 'consumable';
  }
  if (cls === ITEM_CLASS_REAGENT) return 'reagent';
  if (cls === ITEM_CLASS_CONTAINER || it.slot === 'bag') return 'container';
  if (cls === ITEM_CLASS_KEY) return 'key';
  // itemTeachIntent, not the baked teach fields: 855 of the 1,672 teaching rows carry no field.
  if (cls === ITEM_CLASS_RECIPE || itemTeachIntent(it, look) != null) return 'teaches';
  if (isMountOrPet(it, look)) return 'mountPet';
  if (cls === ITEM_CLASS_TRADE_GOODS) return 'tradeGoods';
  return null;
}

/** The category blocking this item under `active`, or null when it is free to sell. */
export function protectedCategoryFor(
  it: ItemDef | undefined | null,
  active: Iterable<JunkProtectCategory>,
  look: ProtectLookup,
): JunkProtectCategory | null {
  const cat = itemProtectCategory(it, look);
  if (cat == null) return null;
  // Iterable, not array-or-Set: 12 ids at most, so a membership walk beats a cast either way.
  for (const on of active) if (on === cat) return cat;
  return null;
}
