// The player equipped-item cast gate. The C++ runs it only for a player, so creatures skip it — their
// kits bake mainhand only and still Shoot. Ranged bits come off the baked mask, never an invented one.

import { SPELL_ATTR, hasAttr, SPELL_ATTR_EX3, hasAttrEx3 } from "../spells/spellAttributes.ts";
import { SHAPESHIFT_FORM } from '../../data/schema.ts';
import type { SpellDef } from '../../data/schema.ts';
import { roleOf } from './roles.ts';
import type { CombatantSpec } from './types.ts';

/** ItemPrototype.h ITEM_CLASS_WEAPON */
export const EQUIP_ITEM_CLASS_WEAPON = 2;

// Forms whose attack speed the client overrides: the equipped weapon is not usable in them, so every
// weapon-enchant proc is dead — a cat druid swings paws, not the enchanted item.
export function formOverridesWeapon(form: number | undefined): boolean {
  return form === SHAPESHIFT_FORM.CAT
    || form === SHAPESHIFT_FORM.BEAR
    || form === SHAPESHIFT_FORM.DIREBEAR;
}

// CanUseEquippedWeapon whole. A form that overrides attack speed kills every hand, while disarm kills
// only the main one, so an off hand or a bow still swings its enchant. The form arm returns first.
export function canUseEquippedWeapon(
  hand: 'mainhand' | 'offhand' | 'ranged',
  form: number | undefined,
  disarmed: boolean,
): boolean {
  if (formOverridesWeapon(form)) return false;
  return hand === 'mainhand' ? !disarmed : true;
}
/** ItemPrototype.h ITEM_CLASS_ARMOR */
export const EQUIP_ITEM_CLASS_ARMOR = 4;

// Weapon subclasses that occupy the ranged slot (bow/gun/thrown/crossbow/wand). Cite: ItemPrototype.h
// ITEM_SUBCLASS_WEAPON_*.
const RANGED_WEAPON_SUBCLASS_BITS =
  (1 << 2)  // bow
  | (1 << 3)  // gun
  | (1 << 16) // thrown
  | (1 << 18) // crossbow
  | (1 << 19); // wand

/** Minimal item shape for IsFitToSpellRequirements. */
export interface FitItemProbe {
  /** ItemPrototype.Class */
  itemClass: number;
  /** ItemPrototype.SubClass */
  subclass: number;
  /** ItemPrototype.InventoryType — only required when inv-type mask applies. */
  inventoryType?: number;
  /** Paperdoll slot, required for item-target CheckCast against HELD_ITEM_ONLY. */
  equipSlot?: string;
}

/** Spec fields the equipped-item gate reads (player paperdoll / hand-built fixtures). */
export type EquippedItemFitSpec = Pick<
  CombatantSpec,
  | 'ranged'
  | 'rangedWeaponSubclass'
  | 'mainhandWeaponSubclass'
  | 'offhandWeaponSubclass'
  | 'brokenMainhandWeaponSubclass'
  | 'brokenOffhandWeaponSubclass'
  | 'brokenRangedWeaponSubclass'
  | 'offhandArmorSubclass'
  | 'bodyArmorSubclasses'
  | 'rangedArmorSubclass'
  | 'equippedItemFitReady'
>;

// Item::IsFitToSpellRequirements (Item.cpp:834–862). `itemTarget` mirrors (spell.Targets &
// TARGET_FLAG_ITEM) — inventory-type mask is only checked on the enchant / item-target path.
export function itemFitsSpellRequirements(
  spell: SpellDef,
  item: FitItemProbe,
  opts?: { itemTarget?: boolean },
): boolean {
  // Cite: Spell.cpp:6534-6536 if (HasAttribute(HELD_ITEM_ONLY) && (slot < EQUIPMENT_SLOT_MAINHAND || slot > EQUIPMENT_SLOT_RANGED))
  if (opts?.itemTarget && hasAttr(spell, SPELL_ATTR.HELD_ITEM_ONLY)) {
    // The gate must check the item's equipped slot, not its inventory type.
    // Equipment slots: 'mainhand', 'offhand', 'ranged'.
    const eq = item.equipSlot;
    if (eq !== 'mainhand' && eq !== 'offhand' && eq !== 'ranged') return false;
  }
  const eic = spell.equippedItemClass;
  if (eic != null && eic >= 0) {
    if (eic !== (item.itemClass | 0)) return false;
    const mask = (spell.equippedItemSubClassMask ?? 0) | 0;
    if (mask !== 0 && (mask & (1 << (item.subclass | 0))) === 0) return false;
  }
  // Cite: Item.cpp:856–860 — inv-type only when Targets includes TARGET_FLAG_ITEM.
  const invMask = (spell.equippedItemInventoryTypeMask ?? 0) | 0;
  if (invMask !== 0 && opts?.itemTarget) {
    if (item.inventoryType == null) return false;
    if ((invMask & (1 << (item.inventoryType | 0))) === 0) return false;
  }
  return true;
}

// The HasItemFitToSpellReqirements slot scan: any equipped probe the fit test accepts is enough, and
// an absent item class is no requirement. Probes carry a real item class, so the masks cannot cross.
export function hasItemFitToSpellRequirements(
  spell: SpellDef,
  probes: readonly FitItemProbe[],
  opts?: { itemTarget?: boolean },
): boolean {
  const eic = spell.equippedItemClass;
  if (eic == null || eic < 0) return true;
  for (const p of probes) {
    if (itemFitsSpellRequirements(spell, p, opts)) return true;
  }
  return false;
}

// Build FitItemProbe[] from CombatantSpec weapon/armor subclass fields. Cite: Player.cpp weapon scan
// MH/OH/ranged; armor scan body+OH+ranged.
export function fitProbesFromSpec(spec: EquippedItemFitSpec): FitItemProbe[] {
  const out: FitItemProbe[] = [];
  if (spec.mainhandWeaponSubclass != null) {
    out.push({ itemClass: EQUIP_ITEM_CLASS_WEAPON, subclass: spec.mainhandWeaponSubclass | 0, equipSlot: "mainhand" });
  }
  if (spec.offhandWeaponSubclass != null) {
    out.push({ itemClass: EQUIP_ITEM_CLASS_WEAPON, subclass: spec.offhandWeaponSubclass | 0, equipSlot: "offhand" });
  }
  if (spec.rangedWeaponSubclass != null) {
    out.push({ itemClass: EQUIP_ITEM_CLASS_WEAPON, subclass: spec.rangedWeaponSubclass | 0, equipSlot: "ranged" });
  }
  if (spec.offhandArmorSubclass != null) {
    out.push({ itemClass: EQUIP_ITEM_CLASS_ARMOR, subclass: spec.offhandArmorSubclass | 0, equipSlot: "offhand" });
  }
  if (spec.rangedArmorSubclass != null) {
    out.push({ itemClass: EQUIP_ITEM_CLASS_ARMOR, subclass: spec.rangedArmorSubclass | 0, equipSlot: "ranged" });
  }
  for (const sub of spec.bodyArmorSubclasses ?? []) {
    out.push({ itemClass: EQUIP_ITEM_CLASS_ARMOR, subclass: sub | 0 });
  }
  return out;
}

// Resolve probes for enforcement: a ready paperdoll always enforces, any set subclass field enforces
// against known probes, and otherwise null — the hand-built fixture grace.
export function resolveFitProbes(spec: EquippedItemFitSpec): FitItemProbe[] | null {
  if (spec.equippedItemFitReady) return fitProbesFromSpec(spec);
  const hasAny =
    spec.mainhandWeaponSubclass != null
    || spec.offhandWeaponSubclass != null
    || spec.rangedWeaponSubclass != null
    || spec.offhandArmorSubclass != null
    || spec.rangedArmorSubclass != null
    || ((spec.bodyArmorSubclasses?.length ?? 0) > 0);
  if (!hasAny) return null;
  return fitProbesFromSpec(spec);
}

// True when the spell's cast requirements include an equipped ranged weapon. Data-driven when EquippedItem*
// is baked; otherwise shoot / dmgClass RANGED.
export function spellRequiresEquippedRangedWeapon(spell: SpellDef): boolean {
  const eic = spell.equippedItemClass;
  if (eic != null && eic >= 0) {
    if (eic !== EQUIP_ITEM_CLASS_WEAPON) return false;
    const mask = (spell.equippedItemSubClassMask ?? 0) | 0;
    // mask 0 = any weapon subclass (not specifically ranged).
    if (mask === 0) return false;
    // All required bits are ranged subclasses (Multi-Shot / wand Shoot shape).
    return (mask & ~RANGED_WEAPON_SUBCLASS_BITS) === 0
      && (mask & RANGED_WEAPON_SUBCLASS_BITS) !== 0;
  }
  // Unbaked EquippedItem* fallback — covers rows still missing the columns. A baked `shoot` role is
  // the only safe signal: every real ranged ability HAS the columns (Auto Shot / Aimed Shot /
  // Multi-Shot / Volley eic 2 mask 262156, wand Shoot 524288, Throw 65536), so an absent class means
  // no requirement, exactly as Player.cpp:18572-18575 reads it. Deriving one from DmgClass instead
  // invented a ranged weapon for 59 rows that need none — the paladin's Hammer of Wrath (24239, 30 yd)
  // and the rogue's Blind among them (KI-1075).
  return roleOf(spell) === 'shoot';
}

// Whether the player's ranged slot satisfies a ranged EquippedItem mask. A known mask and subclass
// require a bit match, so wand Shoot does not accept a bow; an unknown subclass accepts.
export function rangedWeaponFitsSpell(
  spell: SpellDef,
  hasRangedWeapon: boolean,
  rangedWeaponSubclass?: number | null,
): boolean {
  if (!hasRangedWeapon) return false;
  const eic = spell.equippedItemClass;
  if (eic == null || eic < 0) return true; // fallback path: presence only
  if (eic !== EQUIP_ITEM_CLASS_WEAPON) return false;
  const mask = (spell.equippedItemSubClassMask ?? 0) | 0;
  if (mask === 0) return true;
  if (rangedWeaponSubclass == null) return true;
  return itemFitsSpellRequirements(spell, {
    itemClass: EQUIP_ITEM_CLASS_WEAPON,
    subclass: rangedWeaponSubclass | 0,
  });
}

// Player usability / cast refuse: needs a ranged weapon and does not have one that fits the spell's
// EquippedItem* mask. Reuses the existing 'no ranged weapon' reason (createSession abilities).
export function playerMissingRequiredRangedWeapon(
  spell: SpellDef,
  hasRangedWeapon: boolean,
  rangedWeaponSubclass?: number | null,
): boolean {
  if (!spellRequiresEquippedRangedWeapon(spell)) return false;
  return !rangedWeaponFitsSpell(spell, hasRangedWeapon, rangedWeaponSubclass);
}

// The full player equipped-item refusal. Creatures never reach it. With unknown paperdoll subclasses
// the melee and armor masks are not refused, while a pure-ranged mask still gates Multi-Shot.
export function playerMissingRequiredEquippedItem(
  spell: SpellDef,
  spec: EquippedItemFitSpec,
): boolean {
  // Only with a resolved paperdoll: an unknown mainhand is not an absent one, same rule as the
  // fit probes below. Cite: Player.h:1129 hasWeaponForAttack -> GetWeaponForAttack(t, true, true).
  if (spec.equippedItemFitReady && hasAttrEx3(spell, SPELL_ATTR_EX3.REQUIRES_MAIN_HAND_WEAPON)) {
    if (spec.mainhandWeaponSubclass == null) return true;
  }

  const eic = spell.equippedItemClass;

  // Unbaked EquippedItem* — ranged fallback only.
  if (eic == null || eic < 0) {
    return playerMissingRequiredRangedWeapon(
      spell,
      !!spec.ranged,
      spec.rangedWeaponSubclass,
    );
  }

  const probes = resolveFitProbes(spec);
  if (probes === null) {
    // Fixture grace for non-ranged; keep pure-ranged enforcement.
    if (spellRequiresEquippedRangedWeapon(spell)) {
      return playerMissingRequiredRangedWeapon(
        spell,
        !!spec.ranged,
        spec.rangedWeaponSubclass,
      );
    }
    return false;
  }

  return !hasItemFitToSpellRequirements(spell, probes);
}

// Probes for weapons still on the paperdoll at 0 durability (combat-inert). Cite: buildCombatant
// broken*WeaponSubclass; durability.ts isBroken.
export function brokenWeaponFitProbes(spec: EquippedItemFitSpec): FitItemProbe[] {
  const out: FitItemProbe[] = [];
  if (spec.brokenMainhandWeaponSubclass != null) {
    out.push({ itemClass: EQUIP_ITEM_CLASS_WEAPON, subclass: spec.brokenMainhandWeaponSubclass | 0, equipSlot: 'mainhand' });
  }
  if (spec.brokenOffhandWeaponSubclass != null) {
    out.push({ itemClass: EQUIP_ITEM_CLASS_WEAPON, subclass: spec.brokenOffhandWeaponSubclass | 0, equipSlot: 'offhand' });
  }
  if (spec.brokenRangedWeaponSubclass != null) {
    out.push({ itemClass: EQUIP_ITEM_CLASS_WEAPON, subclass: spec.brokenRangedWeaponSubclass | 0, equipSlot: 'ranged' });
  }
  return out;
}

// True when a broken-but-equipped weapon would satisfy EquippedItem* / ranged need. Distinguishes empty
// slot from "repair your gear" (KI-891 / KI-798).
export function brokenWeaponWouldSatisfySpell(
  spell: SpellDef,
  spec: EquippedItemFitSpec,
): boolean {
  const broken = brokenWeaponFitProbes(spec);
  if (broken.length === 0) return false;

  if (hasAttrEx3(spell, SPELL_ATTR_EX3.REQUIRES_MAIN_HAND_WEAPON)) {
    if (spec.brokenMainhandWeaponSubclass != null) return true;
  }

  const eic = spell.equippedItemClass;
  // Unbaked EquippedItem* — ranged presence fallback only.
  if (eic == null || eic < 0) {
    return spellRequiresEquippedRangedWeapon(spell) && spec.brokenRangedWeaponSubclass != null;
  }
  if (eic !== EQUIP_ITEM_CLASS_WEAPON) return false;
  return hasItemFitToSpellRequirements(spell, broken);
}

// The ability-strip reason when the equipped-item gate refuses. Broken gear still equipped reads as
// broken rather than empty, and a missing ranged slot keeps its own wording.
export function playerEquippedItemRefuseReason(
  spell: SpellDef,
  spec: EquippedItemFitSpec,
): string | undefined {
  if (!playerMissingRequiredEquippedItem(spell, spec)) return undefined;
  // Prefer broken over empty: paperdoll still shows the weapon (KI-891 / KI-798).
  if (brokenWeaponWouldSatisfySpell(spell, spec)) return 'broken weapon';
  if (spellRequiresEquippedRangedWeapon(spell)) return 'no ranged weapon';
  if ((spell.equippedItemClass ?? -1) === EQUIP_ITEM_CLASS_ARMOR) return 'no required armor';
  return 'no required weapon';
}
