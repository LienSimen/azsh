// Classic hunter ammo pipeline — pure helpers, with no invented DPS or levels: callers pass
// ItemDef fields from the bake. Cite: Player.cpp _ApplyAmmoBonuses 7591–7621; Spell.cpp TakeAmmo.

import type { DataStore } from '../../data/dataStore.ts';
import type { ItemDef } from '../../data/schema.ts';
import type { Character } from '../character/character.ts';
import { equippedEntry } from './itemInstance.ts';
import { BAG_SLOTS } from './equipment.ts';
import type { Inventory } from './inventory.ts';
import { BACKPACK_SLOTS, addItem, countItem, removeItem } from './inventory.ts';

// ---- ItemPrototype.h constants (Classic 1.12) --------------------------------

/** ITEM_CLASS_PROJECTILE */
export const ITEM_CLASS_PROJECTILE = 6;
/** ITEM_CLASS_WEAPON */
export const ITEM_CLASS_WEAPON = 2;
/** ITEM_CLASS_QUIVER */
export const ITEM_CLASS_QUIVER = 11;

/** ITEM_SUBCLASS_ARROW / BULLET (class 6) */
export const ITEM_SUBCLASS_ARROW = 2;
export const ITEM_SUBCLASS_BULLET = 3;

/** Weapon subclasses that interact with ammo (ItemPrototype.h ~197–214) */
export const ITEM_SUBCLASS_WEAPON_BOW = 2;
export const ITEM_SUBCLASS_WEAPON_GUN = 3;
export const ITEM_SUBCLASS_WEAPON_THROWN = 16;
export const ITEM_SUBCLASS_WEAPON_CROSSBOW = 18;
export const ITEM_SUBCLASS_WEAPON_WAND = 19;

/** Quiver subclasses (class 11) */
export const ITEM_SUBCLASS_QUIVER = 2;
export const ITEM_SUBCLASS_AMMO_POUCH = 3;

/** BagFamily: ARROWS=1, BULLETS=2 (ItemPrototype.h ~95–104) */
export const BAG_FAMILY_ARROWS = 1;
export const BAG_FAMILY_BULLETS = 2;

/** INVTYPE_AMMO = 24; INVTYPE_THROWN = 25; INVTYPE_QUIVER = 27 (often 18 on class-11 in DB) */
export const INVTYPE_AMMO = 24;
export const INVTYPE_THROWN = 25;

// ---- Failure reasons (source-aligned strings for domain/game) ----------------

export const AMMO_ERR = {
  DEAD: 'You are dead',
  ONLY_AMMO: 'Only ammo can go here',
  NOT_FOUND: 'Item not found',
  LEVEL: (lvl: number) => `Requires level ${lvl}`,
  CLASS: 'Your class cannot use that',
  NO_AMMO: 'Out of ammo',
  ONLY1_QUIVER: 'You can only equip one quiver',
  ONLY1_AMMOPOUCH: 'You can only equip one ammo pouch',
  BAG_FAMILY: 'That item cannot go in this bag',
} as const;

// ---- Type helpers ------------------------------------------------------------

/** Resolve weapon subclass from ItemDef (weaponSubclass preferred; typeName fallback). */
export function weaponSubclassOf(item: ItemDef | undefined): number | undefined {
  if (!item) return undefined;
  if (item.weaponSubclass != null) return item.weaponSubclass;
  // typeName fallback for fixtures / pre-subclass bakes
  switch (item.typeName) {
    case 'Bow': return ITEM_SUBCLASS_WEAPON_BOW;
    case 'Gun': return ITEM_SUBCLASS_WEAPON_GUN;
    case 'Crossbow': return ITEM_SUBCLASS_WEAPON_CROSSBOW;
    case 'Wand': return ITEM_SUBCLASS_WEAPON_WAND;
    case 'Thrown': return ITEM_SUBCLASS_WEAPON_THROWN;
    default: return undefined;
  }
}

/** Projectile subclass (arrow=2 / bullet=3) from ItemDef. */
export function projectileSubclassOf(item: ItemDef | undefined): number | undefined {
  if (!item) return undefined;
  if (item.itemSubclass != null && (
    item.itemClass === ITEM_CLASS_PROJECTILE
    || item.ammoDps
    || item.inventoryType === INVTYPE_AMMO
  )) {
    return item.itemSubclass;
  }
  // bagFamily mirrors arrow/bullet when subclass not baked
  if (item.bagFamily === BAG_FAMILY_ARROWS) return ITEM_SUBCLASS_ARROW;
  if (item.bagFamily === BAG_FAMILY_BULLETS) return ITEM_SUBCLASS_BULLET;
  return undefined;
}

/** True when item is INVTYPE_AMMO / class-6 projectile (CanUseAmmo inventory-type gate). */
export function isAmmoItem(item: ItemDef | undefined): boolean {
  if (!item) return false;
  if (item.inventoryType === INVTYPE_AMMO) return true;
  if (item.itemClass === ITEM_CLASS_PROJECTILE) return true;
  // Pre-class bake: ammoDps is only set on class-6 projectiles (enrich-item-economy).
  return !!item.ammoDps;
}

/** True when weapon needs projectile ammo (bow/gun/crossbow). Wand and thrown do not. */
export function weaponNeedsProjectileAmmo(weapon: ItemDef | undefined): boolean {
  const sub = weaponSubclassOf(weapon);
  return (
    sub === ITEM_SUBCLASS_WEAPON_BOW
    || sub === ITEM_SUBCLASS_WEAPON_GUN
    || sub === ITEM_SUBCLASS_WEAPON_CROSSBOW
  );
}

export function weaponIsWand(weapon: ItemDef | undefined): boolean {
  return weaponSubclassOf(weapon) === ITEM_SUBCLASS_WEAPON_WAND;
}

export function weaponIsThrown(weapon: ItemDef | undefined): boolean {
  if (!weapon) return false;
  const sub = weaponSubclassOf(weapon);
  if (sub === ITEM_SUBCLASS_WEAPON_THROWN) return true;
  if (weapon.inventoryType === INVTYPE_THROWN) return true;
  return weapon.typeName === 'Thrown';
}

/** Class-11 quiver or ammo pouch. */
export function isQuiverOrPouch(item: ItemDef | undefined): boolean {
  if (!item) return false;
  if (item.itemClass === ITEM_CLASS_QUIVER) return true;
  // Fallback: subclass + bag slot when itemClass not yet baked
  if (item.slot === 'bag' && item.itemSubclass != null) {
    return item.itemSubclass === ITEM_SUBCLASS_QUIVER || item.itemSubclass === ITEM_SUBCLASS_AMMO_POUCH;
  }
  return false;
}

export function isQuiver(item: ItemDef | undefined): boolean {
  if (!isQuiverOrPouch(item)) return false;
  return (item!.itemSubclass ?? -1) === ITEM_SUBCLASS_QUIVER;
}

export function isAmmoPouch(item: ItemDef | undefined): boolean {
  if (!isQuiverOrPouch(item)) return false;
  return (item!.itemSubclass ?? -1) === ITEM_SUBCLASS_AMMO_POUCH;
}

// ---- CanUseAmmo / SetAmmo / RemoveAmmo ----------------------------------------

export interface CanUseAmmoResult {
  ok: boolean;
  reason?: string;
}

// Player::CanUseAmmo — alive + INVTYPE_AMMO + CanUseItem (level / class). Cite: Player.cpp 9805–9830.
// Skill/spell/honor gates omitted when data absent.
export function canUseAmmo(
  char: Pick<Character, 'level' | 'cls' | 'health'>,
  item: ItemDef | undefined,
): CanUseAmmoResult {
  if (!item) return { ok: false, reason: AMMO_ERR.NOT_FOUND };
  // Alive: health > 0 when tracked; absent health treated as alive (fixtures).
  if (char.health != null && !(char.health > 0)) return { ok: false, reason: AMMO_ERR.DEAD };
  if (!isAmmoItem(item)) return { ok: false, reason: AMMO_ERR.ONLY_AMMO };
  if (char.level < (item.requiredLevel ?? 0)) {
    return { ok: false, reason: AMMO_ERR.LEVEL(item.requiredLevel ?? 0) };
  }
  if (item.allowClass && !item.allowClass.includes(char.cls)) {
    return { ok: false, reason: AMMO_ERR.CLASS };
  }
  return { ok: true };
}

/** Pure SetAmmo: returns new char with ammoItem set, or error. Cite: Player.cpp SetAmmo 9832–9855. */
export function setAmmo(
  char: Character,
  ds: DataStore,
  entry: number,
): { ok: true; char: Character } | { ok: false; reason: string; char: Character } {
  if (!entry) return { ok: false, reason: AMMO_ERR.NOT_FOUND, char };
  const item = ds.item(entry);
  const gate = canUseAmmo(char, item);
  if (!gate.ok) return { ok: false, reason: gate.reason ?? AMMO_ERR.NOT_FOUND, char };
  if (char.ammoItem === entry) return { ok: true, char };
  return { ok: true, char: { ...char, ammoItem: entry } };
}

// Pure RemoveAmmo: clear selection (DPS zeroed by buildCombatant when ammoItem absent). Cite: Player.cpp
// RemoveAmmo 9857–9866.
export function removeAmmo(char: Character): Character {
  if (char.ammoItem == null) return char;
  const next = { ...char };
  delete next.ammoItem;
  return next;
}

// ---- Compatibility + DPS -----------------------------------------------------

/** Player::CheckAmmoCompatibility — bow/xbow→arrow, gun→bullet; else false. Cite: Player.cpp 7623–7654. */
export function checkAmmoCompatibility(
  weapon: ItemDef | undefined,
  ammo: ItemDef | undefined,
): boolean {
  if (!weapon || !ammo) return false;
  // Weapon must be a weapon class (or have weapon damage / subclass).
  const wSub = weaponSubclassOf(weapon);
  if (wSub == null && !weapon.weapon) return false;
  const aSub = projectileSubclassOf(ammo);
  if (aSub == null) return false;
  switch (wSub) {
    case ITEM_SUBCLASS_WEAPON_BOW:
    case ITEM_SUBCLASS_WEAPON_CROSSBOW:
      return aSub === ITEM_SUBCLASS_ARROW;
    case ITEM_SUBCLASS_WEAPON_GUN:
      return aSub === ITEM_SUBCLASS_BULLET;
    default:
      return false;
  }
}

export interface AmmoDpsPair {
  dpsMin: number;
  dpsMax: number;
}

// Effective ammo DPS for ranged min/max (mirrors _ApplyAmmoBonuses zeroing). Zero when missing selection,
// missing count, incompatible, or no baked ammoDps. Cite: Player.cpp 7591–7621.
export function ammoDpsFromSelection(
  char: Pick<Character, 'ammoItem' | 'equipped'>,
  inv: Inventory,
  ds: DataStore,
): AmmoDpsPair {
  const zero = { dpsMin: 0, dpsMax: 0 };
  if (char.ammoItem == null) return zero;
  const ammo = ds.item(char.ammoItem);
  if (!ammo?.ammoDps) return zero;
  if (countItem(inv, char.ammoItem) < 1) return zero;
  const weaponEntry = equippedEntry(char.equipped.ranged);
  const weapon = weaponEntry != null ? ds.item(weaponEntry) : undefined;
  if (!checkAmmoCompatibility(weapon, ammo)) return zero;
  return { dpsMin: ammo.ammoDps.dpsMin, dpsMax: ammo.ammoDps.dpsMax };
}

// ---- FindAmmo (bot-style scan) ------------------------------------------------

// Scan inventory for a compatible projectile the character can use. Cite: PlayerbotAI.cpp FindAmmo
// 2107–2136.
export function findCompatibleAmmo(
  char: Character,
  inv: Inventory,
  ds: DataStore,
): number | undefined {
  const weaponEntry = equippedEntry(char.equipped.ranged);
  const weapon = weaponEntry != null ? ds.item(weaponEntry) : undefined;
  // Without a weapon, create-pass still SetAmmo if CanUseAmmo — prefer any usable projectile.
  for (const s of inv.stacks) {
    if (s.count < 1) continue;
    const it = ds.item(s.item);
    if (!it || !isAmmoItem(it)) continue;
    if (!canUseAmmo(char, it).ok) continue;
    if (weapon && weaponNeedsProjectileAmmo(weapon) && !checkAmmoCompatibility(weapon, it)) continue;
    // If no weapon yet, any canUseAmmo projectile is fine (DPS stays 0 until compatible weapon).
    if (!weapon || !weaponNeedsProjectileAmmo(weapon) || checkAmmoCompatibility(weapon, it)) {
      return s.item;
    }
  }
  return undefined;
}

// Best compatible ammo for an equipped projectile weapon, from the STORE rather than a bag: bots
// never buy arrows, so every generated hunter fought at ammoDps 0. Memoized on catalog length.
const ammoMemo = new WeakMap<DataStore, { catalog: number; best: Map<string, number | undefined> }>();

export function bestAmmoForWeapon(
  ds: DataStore,
  weapon: ItemDef | undefined,
  level: number,
): number | undefined {
  if (!weaponNeedsProjectileAmmo(weapon)) return undefined;
  const all = ds.allItems?.() ?? [];
  const key = `${weapon?.entry ?? 0}:${level}`;
  let memo = ammoMemo.get(ds);
  if (!memo || memo.catalog !== all.length) {
    memo = { catalog: all.length, best: new Map() };
    ammoMemo.set(ds, memo);
  } else {
    const hit = memo.best.get(key);
    if (hit !== undefined || memo.best.has(key)) return hit;
  }
  let best: { entry: number; dps: number } | undefined;
  for (const it of all) {
    if (!isAmmoItem(it)) continue;
    if ((it.requiredLevel ?? 0) > level) continue;
    if (!checkAmmoCompatibility(weapon, it)) continue;
    const dps = it.ammoDps ? (it.ammoDps.dpsMin + it.ammoDps.dpsMax) / 2 : 0;
    if (dps <= 0) continue;
    // Deterministic: higher dps wins, lower entry breaks ties.
    if (!best || dps > best.dps || (dps === best.dps && it.entry < best.entry)) {
      best = { entry: it.entry, dps };
    }
  }
  memo.best.set(key, best?.entry);
  return best?.entry;
}

// Auto-select ammo when none valid (count 0 or unset), after acquiring a projectile. Cite: Player create
// second pass 939–942 + bot FindAmmo policy.
export function maybeAutoSelectAmmo(
  char: Character,
  inv: Inventory,
  ds: DataStore,
  acquiredEntry?: number,
): Character {
  const selected = char.ammoItem;
  const selectedOk =
    selected != null
    && countItem(inv, selected) >= 1
    && canUseAmmo(char, ds.item(selected)).ok;
  if (selectedOk) {
    // Keep selection; if weapon exists, compatibility only affects DPS not selection.
    return char;
  }
  if (acquiredEntry != null) {
    const acq = ds.item(acquiredEntry);
    if (acq && canUseAmmo(char, acq).ok && countItem(inv, acquiredEntry) >= 1) {
      const rangedEntry = equippedEntry(char.equipped.ranged);
      const weapon = rangedEntry != null ? ds.item(rangedEntry) : undefined;
      if (!weapon || !weaponNeedsProjectileAmmo(weapon) || checkAmmoCompatibility(weapon, acq)) {
        return { ...char, ammoItem: acquiredEntry };
      }
    }
  }
  const found = findCompatibleAmmo(char, inv, ds);
  if (found != null) return { ...char, ammoItem: found };
  // Clear dead selection
  if (char.ammoItem != null && countItem(inv, char.ammoItem) < 1) return removeAmmo(char);
  return char;
}

// ---- Need-ammo gate (Spell CheckCast NO_AMMO) --------------------------------

export type RangedAmmoGate =
  | { ok: true; mode: 'wand' | 'none' | 'projectile' | 'thrown'; ammoEntry?: number }
  | { ok: false; reason: string };

// Whether a ranged physical/weapon shot may fire given selection + inventory. Cite: Spell.cpp CheckCast
// 6730–6793.
export function rangedAmmoGate(
  char: Pick<Character, 'ammoItem' | 'equipped'>,
  inv: Inventory,
  ds: DataStore,
): RangedAmmoGate {
  const weaponEntry = equippedEntry(char.equipped.ranged);
  const weapon = weaponEntry != null ? ds.item(weaponEntry) : undefined;
  if (!weapon) return { ok: false, reason: AMMO_ERR.NO_AMMO };

  if (weaponIsWand(weapon)) return { ok: true, mode: 'wand' };
  if (weaponIsThrown(weapon)) {
    // The thrown stack is the equipped item itself. Phonecraft equips one entry and keeps extras
    // in bags, so ownership of at least 1 is the gate — the paperdoll counts.
    const entry = weaponEntry!;
    const bagCount = countItem(inv, entry);
    // Equipped thrown always "has" the one on the paperdoll.
    if (bagCount + 1 < 1) return { ok: false, reason: AMMO_ERR.NO_AMMO };
    return { ok: true, mode: 'thrown', ammoEntry: entry };
  }
  if (!weaponNeedsProjectileAmmo(weapon)) return { ok: true, mode: 'none' };

  const ammoId = char.ammoItem;
  if (!ammoId) return { ok: false, reason: AMMO_ERR.NO_AMMO };
  const ammo = ds.item(ammoId);
  if (!ammo || !isAmmoItem(ammo)) return { ok: false, reason: AMMO_ERR.NO_AMMO };
  if (!checkAmmoCompatibility(weapon, ammo)) return { ok: false, reason: AMMO_ERR.NO_AMMO };
  if (countItem(inv, ammoId) < 1) return { ok: false, reason: AMMO_ERR.NO_AMMO };
  return { ok: true, mode: 'projectile', ammoEntry: ammoId };
}

// ---- TakeAmmo after successful shot ------------------------------------------

export interface TakeAmmoResult {
  inventory: Inventory;
  char: Character;
  /** Entry destroyed (ammo or thrown stack), if any. */
  consumedEntry?: number;
  consumedCount: number;
  /** True when ranged slot thrown was fully depleted (unequip needed by caller). */
  thrownDepleted?: boolean;
}

// Spell::TakeAmmo order: wand early-out, thrown stack or durability, else destroy 1 selected ammo.
// Non-stacking thrown returns consumedCount 0 and leaves thrownDurability for the caller.
export function takeAmmoAfterRangedShot(
  char: Character,
  inv: Inventory,
  ds: DataStore,
): TakeAmmoResult {
  const weaponEntry = equippedEntry(char.equipped.ranged);
  const weapon = weaponEntry != null ? ds.item(weaponEntry) : undefined;
  if (!weapon || weaponIsWand(weapon)) {
    return { inventory: inv, char, consumedCount: 0 };
  }

  if (weaponIsThrown(weapon)) {
    const stackable = weapon.stackable ?? 1;
    if (stackable <= 1) {
      // Non-stack thrown: durability path (DurabilityPointLossForEquipSlot). No inventory mutate.
      return {
        inventory: inv,
        char,
        consumedCount: 0,
        consumedEntry: weaponEntry,
        thrownDepleted: false,
      };
    }
    // Stackable thrown: remove from bags first and unequip only when bags are empty, since our
    // model is 1 equipped entry plus optional bag stacks.
    const bagCount = countItem(inv, weaponEntry!);
    if (bagCount >= 1) {
      const [nextInv, n] = removeItem(inv, weaponEntry!, 1);
      return { inventory: nextInv, char, consumedEntry: weaponEntry, consumedCount: n };
    }
    // No bag stacks: consume the equipped unit → clear ranged slot.
    const equipped = { ...char.equipped };
    delete equipped.ranged;
    return {
      inventory: inv,
      char: { ...char, equipped },
      consumedEntry: weaponEntry,
      consumedCount: 1,
      thrownDepleted: true,
    };
  }

  const ammoId = char.ammoItem;
  if (!ammoId) return { inventory: inv, char, consumedCount: 0 };
  const [nextInv, n] = removeItem(inv, ammoId, 1);
  let nextChar = char;
  if (n > 0 && countItem(nextInv, ammoId) < 1) {
    // Selection exhausted — clear and optionally find next (bot-like once).
    nextChar = removeAmmo(char);
    const found = findCompatibleAmmo(nextChar, nextInv, ds);
    if (found != null) nextChar = { ...nextChar, ammoItem: found };
  }
  return { inventory: nextInv, char: nextChar, consumedEntry: ammoId, consumedCount: n };
}

// ---- Bag family / one quiver -------------------------------------------------

/** ItemCanGoIntoBag for class-11 quiver/pouch (and generic containers). Cite: Item.cpp 134–181. */
export function itemCanGoIntoBag(
  item: ItemDef | undefined,
  bag: ItemDef | undefined,
): boolean {
  if (!item || !bag) return false;
  const bagClass = bag.itemClass;
  const bagSub = bag.itemSubclass;

  // Class-1 generic containers accept anything.
  if (bagClass === 1 || (bag.slot === 'bag' && bagClass == null && !isQuiverOrPouch(bag))) {
    return true;
  }

  if (bagClass === ITEM_CLASS_QUIVER || isQuiverOrPouch(bag)) {
    const sub = bagSub ?? bag.itemSubclass;
    if (sub === ITEM_SUBCLASS_QUIVER || isQuiver(bag)) {
      // Arrows only: BagFamily ARROWS or projectile subclass arrow
      if (item.bagFamily === BAG_FAMILY_ARROWS) return true;
      if (projectileSubclassOf(item) === ITEM_SUBCLASS_ARROW) return true;
      return false;
    }
    if (sub === ITEM_SUBCLASS_AMMO_POUCH || isAmmoPouch(bag)) {
      if (item.bagFamily === BAG_FAMILY_BULLETS) return true;
      if (projectileSubclassOf(item) === ITEM_SUBCLASS_BULLET) return true;
      return false;
    }
    return false;
  }

  // Unknown specialized bags: conservative reject only if bagFamily on bag is set.
  if (bag.bagFamily != null && bag.bagFamily !== 0) {
    return item.bagFamily === bag.bagFamily;
  }
  return true;
}

/** Only one class-11 among bag bar slots. Cite: Player.cpp 9452–9469 ONLY1_QUIVER / ONLY1_AMMOPOUCH. */
export function canEquipQuiverOrPouch(
  char: Pick<Character, 'equipped'>,
  ds: DataStore,
  entry: number,
  opts?: { swapSlot?: string },
): CanUseAmmoResult {
  const item = ds.item(entry);
  if (!item || !isQuiverOrPouch(item)) return { ok: true }; // not a class-11 — no extra gate
  for (const slot of BAG_SLOTS) {
    if (opts?.swapSlot === slot) continue;
    const worn = equippedEntry(char.equipped[slot]);
    if (worn == null || worn === entry) continue;
    const bag = ds.item(worn);
    if (bag && isQuiverOrPouch(bag)) {
      return {
        ok: false,
        reason: isAmmoPouch(bag) ? AMMO_ERR.ONLY1_AMMOPOUCH : AMMO_ERR.ONLY1_QUIVER,
      };
    }
  }
  return { ok: true };
}

// Whether a ranged physical auto/shot may consume projectile ammo at this combat tick. Used by the combat
// engine with a live remaining count (not full inventory).
export function combatProjectileAmmoOk(
  weaponSubclass: number | undefined,
  ammoEntry: number | undefined,
  ammoCount: number,
  ammoSubclass: number | undefined,
): boolean {
  if (
    weaponSubclass !== ITEM_SUBCLASS_WEAPON_BOW
    && weaponSubclass !== ITEM_SUBCLASS_WEAPON_GUN
    && weaponSubclass !== ITEM_SUBCLASS_WEAPON_CROSSBOW
  ) {
    return true; // wand/thrown/none — not this gate
  }
  if (!ammoEntry || ammoCount < 1 || ammoSubclass == null) return false;
  if (
    weaponSubclass === ITEM_SUBCLASS_WEAPON_BOW
    || weaponSubclass === ITEM_SUBCLASS_WEAPON_CROSSBOW
  ) {
    return ammoSubclass === ITEM_SUBCLASS_ARROW;
  }
  if (weaponSubclass === ITEM_SUBCLASS_WEAPON_GUN) {
    return ammoSubclass === ITEM_SUBCLASS_BULLET;
  }
  return false;
}

// ---- Quiver / pouch ranged haste (SPELL_AURA_MOD_RANGED_AMMO_HASTE) -----------

// Parse Classic equip-spell text "Increases ranged attack speed by N%." Cite: SpellAuras.cpp
// HandleRangedAmmoHaste; item equipSpells 14824–14829 descriptions.
export function rangedAmmoHastePctFromSpell(ds: DataStore, spellId: number): number {
  const sp = ds.spell(spellId);
  if (!sp?.description) return 0;
  const m = sp.description.match(/ranged attack speed by\s+(\d+)\s*%/i);
  return m ? Number(m[1]) : 0;
}

// Highest MOD_RANGED_AMMO_HASTE % on a single quiver/pouch (its equipSpells). One item never stacks
// multiple haste auras with itself — take max.
export function ammoHastePctFromItem(ds: DataStore, item: ItemDef | undefined): number {
  if (!item || !isQuiverOrPouch(item)) return 0;
  let best = 0;
  for (const sid of item.equipSpells ?? []) {
    best = Math.max(best, rangedAmmoHastePctFromSpell(ds, sid));
  }
  return best;
}

// Whether this class-11 container matches the equipped projectile weapon family. Bow/crossbow → quiver
// (arrows); gun → ammo pouch (bullets). No projectile weapon → either is allowed (storage / prep).
export function quiverPouchMatchesRangedWeapon(
  container: ItemDef | undefined,
  rangedWeapon: ItemDef | undefined,
): boolean {
  if (!container || !isQuiverOrPouch(container)) return false;
  const wsub = weaponSubclassOf(rangedWeapon);
  if (wsub === ITEM_SUBCLASS_WEAPON_BOW || wsub === ITEM_SUBCLASS_WEAPON_CROSSBOW) {
    return isQuiver(container);
  }
  if (wsub === ITEM_SUBCLASS_WEAPON_GUN) {
    return isAmmoPouch(container);
  }
  return true;
}

// Highest ammo-haste % from equipped class-11 quiver or pouch equipSpells. Only the max applies —
// the source never stacks MOD_RANGED_AMMO_HASTE. Cite: HandleRangedAmmoHaste.
export function equippedQuiverRangedHastePct(
  char: Pick<Character, 'equipped'>,
  ds: DataStore,
): number {
  let best = 0;
  for (const slot of BAG_SLOTS) {
    const entry = equippedEntry(char.equipped[slot]);
    if (entry == null) continue;
    const bag = ds.item(entry);
    if (!bag || !isQuiverOrPouch(bag)) continue;
    best = Math.max(best, ammoHastePctFromItem(ds, bag));
  }
  return best;
}

// ---- Bag sections / family capacity (quiver = arrows only, pouch = bullets) -

export interface CapacitySplit {
  /** Backpack + generic class-1 bags. */
  generic: number;
  /** Class-11 quiver slots (arrows only). */
  arrows: number;
  /** Class-11 ammo pouch slots (bullets only). */
  bullets: number;
}

export function capacitySplit(
  char: Pick<Character, 'equipped'>,
  ds: DataStore,
): CapacitySplit {
  let generic = BACKPACK_SLOTS;
  let arrows = 0;
  let bullets = 0;
  for (const slot of BAG_SLOTS) {
    const entry = equippedEntry(char.equipped[slot]);
    if (entry == null) continue;
    const it = ds.item(entry);
    if (!it || it.slot !== 'bag') continue;
    const n = it.bagSlots ?? 0;
    if (isQuiver(it)) arrows += n;
    else if (isAmmoPouch(it)) bullets += n;
    else generic += n;
  }
  return { generic, arrows, bullets };
}

export type BagSectionKind = 'backpack' | 'bag' | 'quiver' | 'ammo_pouch';

export interface BagSection {
  kind: BagSectionKind;
  /** UI label (Backpack / item name). */
  label: string;
  /** Equipped bag entry when not the backpack. */
  bagEntry?: number;
  /** Absolute start index in the packed flat inventory layout. */
  startIndex: number;
  slots: number;
  /** BagFamily filter: 0 generic, 1 arrows, 2 bullets. */
  bagFamily: number;
}

// Ordered bag sections for UI + packing (backpack, then bag1..4). Cite: Player bag bar; ItemCanGoIntoBag
// for class 11.
export function bagSections(
  char: Pick<Character, 'equipped'>,
  ds: DataStore,
): BagSection[] {
  const out: BagSection[] = [];
  let idx = 0;
  out.push({
    kind: 'backpack',
    label: 'Backpack',
    startIndex: idx,
    slots: 16,
    bagFamily: 0,
  });
  idx += 16;
  for (const slot of BAG_SLOTS) {
    const entry = equippedEntry(char.equipped[slot]);
    if (entry == null) continue;
    const it = ds.item(entry);
    if (!it || it.slot !== 'bag') continue;
    const n = it.bagSlots ?? 0;
    if (n <= 0) continue;
    let kind: BagSectionKind = 'bag';
    let bagFamily = 0;
    if (isQuiver(it)) {
      kind = 'quiver';
      bagFamily = BAG_FAMILY_ARROWS;
    } else if (isAmmoPouch(it)) {
      kind = 'ammo_pouch';
      bagFamily = BAG_FAMILY_BULLETS;
    }
    out.push({
      kind,
      label: it.name,
      bagEntry: entry,
      startIndex: idx,
      slots: n,
      bagFamily,
    });
    idx += n;
  }
  return out;
}

function isArrowProjectile(item: ItemDef | undefined): boolean {
  return projectileSubclassOf(item) === ITEM_SUBCLASS_ARROW;
}

function isBulletProjectile(item: ItemDef | undefined): boolean {
  return projectileSubclassOf(item) === ITEM_SUBCLASS_BULLET;
}

export interface SlotUsage {
  genericUsed: number;
  arrowsInSpecialty: number;
  bulletsInSpecialty: number;
  freeGeneric: number;
  freeArrows: number;
  freeBullets: number;
}

// How stacks occupy generic vs specialty capacity (prefer specialty for matching ammo). Overflow
// arrows/bullets sit in generic slots.
export function slotUsage(
  inv: Inventory,
  char: Pick<Character, 'equipped'>,
  ds: DataStore,
): SlotUsage {
  const cap = capacitySplit(char, ds);
  let arrowStacks = 0;
  let bulletStacks = 0;
  let otherStacks = 0;
  for (const s of inv.stacks) {
    const it = ds.item(s.item);
    if (isArrowProjectile(it)) arrowStacks += 1;
    else if (isBulletProjectile(it)) bulletStacks += 1;
    else otherStacks += 1;
  }
  const arrowsInSpecialty = Math.min(arrowStacks, cap.arrows);
  const bulletsInSpecialty = Math.min(bulletStacks, cap.bullets);
  const arrowsInGeneric = arrowStacks - arrowsInSpecialty;
  const bulletsInGeneric = bulletStacks - bulletsInSpecialty;
  const genericUsed = otherStacks + arrowsInGeneric + bulletsInGeneric;
  return {
    genericUsed,
    arrowsInSpecialty,
    bulletsInSpecialty,
    freeGeneric: Math.max(0, cap.generic - genericUsed),
    freeArrows: Math.max(0, cap.arrows - arrowsInSpecialty),
    freeBullets: Math.max(0, cap.bullets - bulletsInSpecialty),
  };
}

// Free specialty+generic slots that can accept this item (new stacks after merge). Non-ammo cannot use
// quiver/pouch capacity. Cite: ItemCanGoIntoBag.
export function freeSlotsForItem(
  inv: Inventory,
  char: Pick<Character, 'equipped'>,
  ds: DataStore,
  entry: number,
): number {
  const it = ds.item(entry);
  const usage = slotUsage(inv, char, ds);
  if (isArrowProjectile(it)) return usage.freeGeneric + usage.freeArrows;
  if (isBulletProjectile(it)) return usage.freeGeneric + usage.freeBullets;
  return usage.freeGeneric;
}

/** Family-aware canFit: fills existing stacks first, then needs free specialty/generic slots. */
export function canFitWithBagFamily(
  inv: Inventory,
  char: Pick<Character, 'equipped'>,
  ds: DataStore,
  entry: number,
  count: number,
  maxStack: number,
): boolean {
  if (count <= 0) return true;
  const capStack = Math.max(1, maxStack);
  let remaining = count;
  for (const s of inv.stacks) {
    if (s.item === entry && s.count < capStack) remaining -= capStack - s.count;
    if (remaining <= 0) return true;
  }
  const needSlots = Math.ceil(remaining / capStack);
  return needSlots <= freeSlotsForItem(inv, char, ds, entry);
}

// Pack stacks so specialty bag index ranges hold matching ammo first, with overflow and other gear
// filling generic bags. Relative order inside each bucket is preserved.
export function packInventoryByBagFamily(
  inv: Inventory,
  char: Pick<Character, 'equipped'>,
  ds: DataStore,
): Inventory {
  const sections = bagSections(char, ds);
  if (!sections.some((s) => s.kind === 'quiver' || s.kind === 'ammo_pouch')) {
    return { stacks: inv.stacks.map((s) => ({ ...s })) };
  }

  const arrows: Inventory['stacks'] = [];
  const bullets: Inventory['stacks'] = [];
  const others: Inventory['stacks'] = [];
  for (const s of inv.stacks) {
    const it = ds.item(s.item);
    if (isArrowProjectile(it)) arrows.push({ ...s });
    else if (isBulletProjectile(it)) bullets.push({ ...s });
    else others.push({ ...s });
  }

  const cap = capacitySplit(char, ds);
  // Specialty fill first, then remaining projectiles overflow into generic with others.
  const arrowSpec = arrows.slice(0, cap.arrows);
  const arrowOver = arrows.slice(cap.arrows);
  const bulletSpec = bullets.slice(0, cap.bullets);
  const bulletOver = bullets.slice(cap.bullets);
  const generic = [...others, ...arrowOver, ...bulletOver];

  // Flat layout in section order: generic stacks first up to the generic cap, then arrow specialty,
  // then bullet specialty. Empties are not stored — the UI pads them.
  const genericCap = cap.generic;
  const genericKept = generic.slice(0, genericCap);
  // If somehow over generic+specialty, keep remainder at end (canFit should prevent).
  const genericExtra = generic.slice(genericCap);

  return {
    stacks: [...genericKept, ...arrowSpec, ...bulletSpec, ...genericExtra],
  };
}

/** addItem then pack so projectiles fill quiver/pouch before overflowing into bags. */
export function addItemPreferAmmoBag(
  inv: Inventory,
  char: Pick<Character, 'equipped'>,
  ds: DataStore,
  entry: number,
  count: number,
  maxStack: number,
): Inventory {
  const next = addItem(inv, entry, count, maxStack);
  return packInventoryByBagFamily(next, char, ds);
}
