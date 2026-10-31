// The per-instance item model: ONE serializable object carries an item's FULL identity, so BoP,
// random property, enchant and charges never force a second inventory migration. Pure.

import type { ItemDef, EquipSlot } from '../../data/schema.ts';
import { ITEM_BONDING } from './itemBonding.ts';

/** A temporary weapon enchant reference on an instance (TEMP_ENCHANTMENT_SLOT). */
export interface InstanceTempEnchant {
  /** SpellItemEnchantment id (oil / poison / imbue). */
  id: number;
  /** Epoch ms the imbue expires; absent = until replaced. */
  expiresAt?: number;
}

/** Per-piece durability carried on the instance (future rider; char.durability stays live until Wave C). */
export interface InstanceDurability {
  cur: number;
  max: number;
}

// Item instance — the canonical LOCK-1 shape, where `item` is the item_template entry. Every
// identity field is OPTIONAL, so a plain mat is just { item, count } and stacks freely.
export interface ItemInstance {
  /** item_template entry id. */
  item: number;
  /** Stack size (1 for identity gear; stackables keep a real count). */
  count: number;
  /** ItemRandomProperties id ("of the Falcon"); 0/absent = no roll. Q P2 sets it, Q P3 applies it. */
  randomPropertyId?: number;
  /** Soulbound (BoP / BoU / quest already bound; BoE binds on equip). Absent = unbound. */
  bound?: boolean;
  /** Unique / unique-equipped marker (FI enforces on the P1 field — not a second pass). */
  unique?: boolean;
  /** PERM_ENCHANTMENT_SLOT — profession enchant id. Wave C moves char.enchants[slot] here. */
  permEnchantId?: number;
  /** TEMP_ENCHANTMENT_SLOT — oil/poison/imbue. Wave C moves char.tempEnchants[hand] here. */
  tempEnchant?: InstanceTempEnchant;
  /** Per-piece durability. char.durability[slot] stays the live source until Wave C folds it in. */
  durability?: InstanceDurability;
  /** Remaining limited-use charges (wands/trinkets). Absent = not charge-based. */
  charges?: number;
  /** FI9 gift wrap: original entry sealed inside a gift shell. Pre-existing rider. */
  wrappedItemEntry?: number;
}

// item_template.spellcharges_1 has THREE states, and "let the database control the sign here"
// (ItemHandler.cpp:366) is why. Cite: Spell.cpp:4209 TakeCastItem.

/** Uses a fresh unit carries: |spellcharges_1|, or 1 when the row is not charge-based. */
export function maxChargesOf(it: Pick<ItemDef, 'charges'> | null | undefined): number {
  const c = it?.charges;
  if (c == null || c === 0) return 1;
  return Math.abs(c | 0);
}

/** spellcharges_1 == 0 → unlimited uses, and the use destroys nothing. */
export function isPermanentCastItem(it: Pick<ItemDef, 'charges'> | null | undefined): boolean {
  return it?.charges === 0;
}

/** Destroyed when its last charge goes — a NEGATIVE count, worn or bagged. */
export function isExpendableCastItem(it: Pick<ItemDef, 'charges'> | null | undefined): boolean {
  return it != null && it.charges != null && it.charges < 0;
}

/** The unit SURVIVES its own use: unlimited, or a positive count that merely runs out. */
export function castItemSurvivesUse(it: Pick<ItemDef, 'charges'> | null | undefined): boolean {
  return isPermanentCastItem(it) || (it?.charges != null && it.charges > 0);
}

// True while this unit can still cast. Cite: Spell.cpp:6462-6465 SPELL_FAILED_NO_CHARGES_REMAIN.
export function hasChargesLeft(
  it: Pick<ItemDef, 'charges'> | null | undefined,
  remaining: number | null | undefined,
): boolean {
  if (it?.charges == null || it.charges === 0) return true;
  return (remaining ?? maxChargesOf(it)) > 0;
}

/** Refusal shown when a charged item is spent but still in the bags. */
export const NO_CHARGES_REMAIN = 'No charges remain';

// True when an item can carry per-instance identity: equippable gear and bags, anything bindable,
// or a rollable green. Mats and plain consumables stay quantity stacks.
export function identityCapable(def: ItemDef | null | undefined): boolean {
  if (!def) return false;
  if (def.slot != null) return true; // equippable gear (weapon / armor / bag)
  if ((def.binding ?? ITEM_BONDING.NO_BIND) !== ITEM_BONDING.NO_BIND) return true; // BoP/BoE/BoU/quest
  if (def.randomProperty != null && def.randomProperty > 0) return true; // rollable suffix pool
  return false;
}

/** True when the instance carries ANY per-instance identity (so it must not merge with a plain stack). */
export function hasIdentity(inst: ItemInstance | null | undefined): boolean {
  if (!inst) return false;
  return (inst.randomPropertyId != null && inst.randomPropertyId > 0)
    || inst.bound === true
    || inst.unique === true
    || inst.permEnchantId != null
    || inst.tempEnchant != null
    || inst.durability != null
    || inst.charges != null
    || (inst.wrappedItemEntry != null && inst.wrappedItemEntry > 0);
}

/** Normalize two nullable identity scalars for equality (absent ≡ 0). */
const eq0 = (a: number | undefined, b: number | undefined): boolean => (a ?? 0) === (b ?? 0);

// Two instances may occupy the same stack only when the entry AND every identity field match. Two "of the
// Owl" and "of the Bear" swords never merge; two identical bound mats do.
export function instancesStackable(a: ItemInstance, b: ItemInstance): boolean {
  if (a.item !== b.item) return false;
  if (!eq0(a.randomPropertyId, b.randomPropertyId)) return false;
  if (!!a.bound !== !!b.bound) return false;
  if (!!a.unique !== !!b.unique) return false;
  if (!eq0(a.permEnchantId, b.permEnchantId)) return false;
  if (!eq0(a.tempEnchant?.id, b.tempEnchant?.id)) return false;
  if (!eq0(a.tempEnchant?.expiresAt, b.tempEnchant?.expiresAt)) return false;
  if (!eq0(a.wrappedItemEntry, b.wrappedItemEntry)) return false;
  // Distinct charge counts / per-piece durability never merge (each is its own instance).
  if ((a.charges ?? null) !== (b.charges ?? null)) return false;
  if (!eq0(a.durability?.cur, b.durability?.cur) || !eq0(a.durability?.max, b.durability?.max)) return false;
  return true;
}

// Copy only the identity fields onto a fresh { item, count } when moving an instance between
// containers, so nothing is dropped and no container-specific field leaks. Absent stays absent.
export function copyInstance(src: ItemInstance, count: number = src.count): ItemInstance {
  const out: ItemInstance = { item: src.item, count };
  if (src.randomPropertyId != null && src.randomPropertyId > 0) out.randomPropertyId = src.randomPropertyId;
  if (src.bound) out.bound = true;
  if (src.unique) out.unique = true;
  if (src.permEnchantId != null) out.permEnchantId = src.permEnchantId;
  if (src.tempEnchant != null) out.tempEnchant = { ...src.tempEnchant };
  if (src.durability != null) out.durability = { ...src.durability };
  if (src.charges != null) out.charges = src.charges;
  if (src.wrappedItemEntry != null && src.wrappedItemEntry > 0) out.wrappedItemEntry = src.wrappedItemEntry;
  return out;
}

// ---- Equipped-slot occupant (LOCK 1 migration union) ------------------------
// An ItemInstance when the item carries identity, else a bare entry. Read it through these helpers.

/** A paperdoll slot's occupant: a full instance, or a bare item entry. */
export type EquippedValue = ItemInstance | number;

/** The item_template entry of an equipped value (instance or bare entry). undefined when empty. */
export function equippedEntry(v: EquippedValue | undefined | null): number | undefined {
  if (v == null) return undefined;
  return typeof v === 'number' ? v : v.item;
}

/** Normalize an equipped value to a full instance (`{item,count:1}` for a bare entry). */
export function equippedInstance(v: EquippedValue | undefined | null): ItemInstance | undefined {
  if (v == null) return undefined;
  return typeof v === 'number' ? { item: v, count: 1 } : v;
}

/** A pure slot -> entry map (for display / snapshot / portrait code that only wants entries). */
export function equippedEntries(
  eq: Partial<Record<EquipSlot, EquippedValue>> | undefined | null,
): Partial<Record<EquipSlot, number>> {
  const out: Partial<Record<EquipSlot, number>> = {};
  if (!eq) return out;
  for (const [slot, v] of Object.entries(eq) as [EquipSlot, EquippedValue | undefined][]) {
    const e = equippedEntry(v);
    if (e != null) out[slot as EquipSlot] = e;
  }
  return out;
}

/** Build an instance from an entry + optional identity fields (create-site helper for P2 / tests / mail). */
export function makeInstance(
  item: number,
  count: number = 1,
  identity?: Omit<Partial<ItemInstance>, 'item' | 'count'>,
): ItemInstance {
  const base: ItemInstance = { item, count };
  if (!identity) return base;
  return copyInstance({ ...base, ...identity }, count);
}
