// Named gear sets — Outfitter 1.4 behaviour (addons/Outfitter-master). Pure: no DOM/RNG/Date.

import type { DataStore } from '../../data/dataStore.ts';
import type { EquipSlot, ItemDef, Stat } from '../../data/schema.ts';
import { CLASS, SHAPESHIFT_FORM } from '../../data/schema.ts';
import type { Character } from '../character/character.ts';
import { DUAL_WIELD_SPELL_ID, EQUIP_SLOTS, itemSlotTargets, type EquipOpts } from '../items/equipment.ts';
import { canEquipItem } from '../items/itemRestrictions.ts';
import { equippedEntry, equippedInstance, type ItemInstance } from '../items/itemInstance.ts';
import type { Inventory } from '../items/inventory.ts';
import { gearEnchantGrant } from '../professions/gearEnchant.ts';
import {
  characterPlayerbotSpecId,
  playerbotWeightScale,
  specRejectsArmorMaterial,
} from './playerbotStatWeight.ts';
import { knows, type SpellBook } from '../character/spellbook.ts';

export type OutfitOwnerId = 'player' | (string & {});

export type OutfitCategory = 'Complete' | 'Partial' | 'Accessory' | 'Special';

export type OutfitStatId =
  | 'str' | 'agi' | 'sta' | 'int' | 'spi' | 'armor' | 'defense'
  | 'mana' | 'health' | 'mp5' | 'healthRegen'
  | 'crit' | 'hit' | 'spellPower' | 'spellHoly' | 'spellFire' | 'spellNature'
  | 'spellFrost' | 'spellShadow' | 'spellArcane'
  | 'meleeDmg' | 'attack' | 'dodge' | 'block'
  | 'resArcane' | 'resFire' | 'resFrost' | 'resNature' | 'resShadow'
  | 'fishing' | 'herbalism' | 'mining' | 'skinning' | 'riding' | 'argentDawn';

export type OutfitSpecialId =
  | 'ArgentDawn' | 'Riding' | 'Dining' | 'Battleground' | 'AB' | 'AV' | 'WSG' | 'City'
  | 'Battle' | 'Defensive' | 'Berserker'
  | 'Bear' | 'Cat' | 'Aquatic' | 'Travel' | 'Moonkin'
  | 'Shadowform' | 'Stealth' | 'GhostWolf'
  | 'Monkey' | 'Hawk' | 'Cheetah' | 'Pack' | 'Beast' | 'Wild'
  | 'Evocate';

export interface OutfitItemRef {
  /** 0 = explicit empty (Birthday Suit / unequip this slot). */
  entry: number;
  permEnchantId?: number;
  randomPropertyId?: number;
}

export interface Outfit {
  id: string;
  name: string;
  category: OutfitCategory;
  items: Partial<Record<EquipSlot, OutfitItemRef>>;
  ammoEntry?: number | null;
  specialId?: OutfitSpecialId;
  statId?: OutfitStatId;
  isAccessory?: boolean;
  disabled?: boolean;
  bgDisabled?: boolean;
  instanceDisabled?: boolean;
  /** The auto-seeded base outfit: tracks the paperdoll instead of freezing it. */
  seeded?: boolean;
}

export interface OutfitterState {
  outfits: Outfit[];
  stack: string[];
  selectedId?: string | null;
}

export const MAX_OUTFITS = 40;
export const OUTFITTER_ICON = 'inv_chest_cloth_23';

export const OUTFIT_CATEGORY_LABEL: Record<OutfitCategory, string> = {
  Complete: 'Complete wardrobes',
  Partial: 'Mix-n-match',
  Accessory: 'Accessories',
  Special: 'Special occasions',
};

export const OUTFIT_STAT_MENU: ReadonlyArray<{
  group: string;
  items: ReadonlyArray<{ id: OutfitStatId; name: string }>;
}> = [
  { group: 'Stats', items: [
    { id: 'str', name: 'Strength' }, { id: 'agi', name: 'Agility' }, { id: 'sta', name: 'Stamina' },
    { id: 'int', name: 'Intellect' }, { id: 'spi', name: 'Spirit' }, { id: 'armor', name: 'Armor' },
    { id: 'defense', name: 'Defense' },
  ] },
  { group: 'Melee', items: [
    { id: 'crit', name: 'Melee Critical Strike' }, { id: 'hit', name: 'Melee Chance to Hit' },
    { id: 'meleeDmg', name: 'Melee Damage' }, { id: 'attack', name: 'Attack Power' },
    { id: 'dodge', name: 'Dodge' }, { id: 'block', name: 'Block' },
  ] },
  { group: 'Spell', items: [
    { id: 'spellPower', name: 'Spell Damage' }, { id: 'spellHoly', name: 'Holy Spell Damage' },
    { id: 'spellFire', name: 'Fire Spell Damage' }, { id: 'spellNature', name: 'Nature Spell Damage' },
    { id: 'spellFrost', name: 'Frost Spell Damage' }, { id: 'spellShadow', name: 'Shadow Spell Damage' },
    { id: 'spellArcane', name: 'Arcane Spell Damage' },
  ] },
  { group: 'Regen', items: [
    { id: 'mp5', name: 'Mana Regeneration' }, { id: 'healthRegen', name: 'Health Regeneration' },
    { id: 'mana', name: 'Mana' }, { id: 'health', name: 'Health' },
  ] },
  { group: 'Resist', items: [
    { id: 'resFire', name: 'Fire Resistance' }, { id: 'resNature', name: 'Nature Resistance' },
    { id: 'resFrost', name: 'Frost Resistance' }, { id: 'resShadow', name: 'Shadow Resistance' },
    { id: 'resArcane', name: 'Arcane Resistance' },
  ] },
  { group: 'Trade', items: [
    { id: 'fishing', name: 'Fishing' }, { id: 'herbalism', name: 'Herbalism' },
    { id: 'mining', name: 'Mining' }, { id: 'skinning', name: 'Skinning' },
  ] },
];

export const SMART_OUTFITS: ReadonlyArray<{
  name: string;
  statId: OutfitStatId;
  accessory?: boolean;
}> = [
  { name: 'Fishing', statId: 'fishing', accessory: true },
  { name: 'Herbalism', statId: 'herbalism', accessory: true },
  { name: 'Mining', statId: 'mining', accessory: true },
  { name: 'Skinning', statId: 'skinning', accessory: true },
  { name: 'Fire Resist', statId: 'resFire' },
  { name: 'Nature Resist', statId: 'resNature' },
  { name: 'Shadow Resist', statId: 'resShadow' },
  { name: 'Arcane Resist', statId: 'resArcane' },
  { name: 'Frost Resist', statId: 'resFrost' },
];

const FISHING_POLES = new Set([19970, 19022, 12224, 6367, 6365, 6256]);
const RIDING_ITEMS = new Set([11122]);
const ARGENT_DAWN_ITEMS = new Set([13209, 19812, 12846]);
const ITEM_ALIASES: Readonly<Record<number, number>> = {
  18608: 18609, 18609: 18608,
  17223: 17074, 17074: 17223,
};
const IGNORED_UNUSED = new Set([
  2901, 5956, 6219, 7005, 7297, 10696, 10697, 10698, 20406, 20407, 20408,
]);

const SKILL_FISHING = 356;
const SKILL_HERBALISM = 182;
const SKILL_MINING = 186;
const SKILL_SKINNING = 393;
const SKILL_RIDING = 762;

const ARGENT_DAWN_ZONES = new Set([
  'western plaguelands', 'eastern plaguelands',
]);
const ARGENT_DAWN_INSTANCES = new Set([
  'scholomance', 'stratholme-live', 'stratholme-undead', 'naxxramas',
]);
const CITY_ZONES = new Set([
  'ironforge', 'city of ironforge', 'darnassus', 'stormwind city', 'stormwind',
  'orgrimmar', 'thunder bluff', 'undercity',
]);
const RIDING_INSTANCE_IDS = new Set([
  'ruins-of-ahnqiraj', 'temple-of-ahnqiraj', 'zul-gurub',
]);

const CLASS_SPECIALS: Partial<Record<number, ReadonlyArray<{ name: string; specialId: OutfitSpecialId }>>> = {
  [CLASS.WARRIOR]: [
    { name: 'Battle Stance', specialId: 'Battle' },
    { name: 'Defensive Stance', specialId: 'Defensive' },
    { name: 'Berserker Stance', specialId: 'Berserker' },
  ],
  [CLASS.DRUID]: [
    { name: 'Bear Form', specialId: 'Bear' },
    { name: 'Cat Form', specialId: 'Cat' },
    { name: 'Aquatic Form', specialId: 'Aquatic' },
    { name: 'Travel Form', specialId: 'Travel' },
    { name: 'Moonkin Form', specialId: 'Moonkin' },
  ],
  [CLASS.PRIEST]: [{ name: 'Shadowform', specialId: 'Shadowform' }],
  [CLASS.ROGUE]: [{ name: 'Stealth', specialId: 'Stealth' }],
  [CLASS.SHAMAN]: [{ name: 'Ghost Wolf', specialId: 'GhostWolf' }],
  [CLASS.HUNTER]: [
    { name: 'Aspect of the Monkey', specialId: 'Monkey' },
    { name: 'Aspect of the Hawk', specialId: 'Hawk' },
    { name: 'Aspect of the Cheetah', specialId: 'Cheetah' },
    { name: 'Aspect of the Pack', specialId: 'Pack' },
    { name: 'Aspect of the Beast', specialId: 'Beast' },
    { name: 'Aspect of the Wild', specialId: 'Wild' },
  ],
  [CLASS.MAGE]: [{ name: 'Evocate', specialId: 'Evocate' }],
};

const FORM_TO_SPECIAL: Partial<Record<number, OutfitSpecialId>> = {
  [SHAPESHIFT_FORM.BATTLESTANCE]: 'Battle',
  [SHAPESHIFT_FORM.DEFENSIVESTANCE]: 'Defensive',
  [SHAPESHIFT_FORM.BERSERKERSTANCE]: 'Berserker',
  [SHAPESHIFT_FORM.BEAR]: 'Bear',
  [SHAPESHIFT_FORM.DIREBEAR]: 'Bear',
  [SHAPESHIFT_FORM.CAT]: 'Cat',
  [SHAPESHIFT_FORM.AQUA]: 'Aquatic',
  [SHAPESHIFT_FORM.TRAVEL]: 'Travel',
  [SHAPESHIFT_FORM.MOONKIN]: 'Moonkin',
  [SHAPESHIFT_FORM.SHADOWFORM]: 'Shadowform',
  [SHAPESHIFT_FORM.STEALTH]: 'Stealth',
  [SHAPESHIFT_FORM.GHOSTWOLF]: 'GhostWolf',
};

const STAT_TO_ITEM: Partial<Record<Stat, OutfitStatId>> = {
  str: 'str', agi: 'agi', sta: 'sta', int: 'int', spi: 'spi',
  defense: 'defense', mana: 'mana', health: 'health', mp5: 'mp5',
  crit: 'crit', hit: 'hit', dodge: 'dodge', block: 'block',
  spellPower: 'spellPower',
  spellHoly: 'spellHoly', spellFire: 'spellFire', spellNature: 'spellNature',
  spellFrost: 'spellFrost', spellShadow: 'spellShadow', spellArcane: 'spellArcane',
  resArcane: 'resArcane', resFire: 'resFire', resFrost: 'resFrost',
  resNature: 'resNature', resShadow: 'resShadow',
};

const EQUIP_MOD_TO_STAT: Record<string, OutfitStatId> = {
  spell_power: 'spellPower', mp5: 'mp5', dodge: 'dodge', block: 'block',
  crit: 'crit', hit: 'hit', defense: 'defense',
  strength: 'str', agility: 'agi', stamina: 'sta', intellect: 'int', spirit: 'spi',
  spell_damage_holy: 'spellHoly', spell_damage_fire: 'spellFire',
  spell_damage_nature: 'spellNature', spell_damage_frost: 'spellFrost',
  spell_damage_shadow: 'spellShadow', spell_damage_arcane: 'spellArcane',
  attack_power: 'attack',
};

const CATEGORY_ORDER: OutfitCategory[] = ['Complete', 'Partial', 'Accessory', 'Special'];

export function nextOutfitId(existing: readonly Outfit[]): string {
  let n = existing.length + 1;
  const taken = new Set(existing.map((o) => o.id));
  while (taken.has(`o${n}`)) n++;
  return `o${n}`;
}

export function sanitizeOutfitName(raw: unknown, fallback = 'Outfit'): string {
  const s = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, 32) : '';
  return s || fallback;
}

export function uniqueOutfitName(existing: readonly Outfit[], want: string): string {
  const base = sanitizeOutfitName(want);
  const taken = new Set(existing.map((o) => o.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; i < 100; i++) {
    const cand = `${base} ${i}`;
    if (!taken.has(cand.toLowerCase())) return cand;
  }
  return base;
}

export function namesMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function findOutfitByName(state: OutfitterState, name: string): Outfit | undefined {
  const low = name.trim().toLowerCase();
  return state.outfits.find((o) => o.name.toLowerCase() === low);
}

export function findOutfitById(state: OutfitterState, id: string): Outfit | undefined {
  return state.outfits.find((o) => o.id === id);
}

export function emptyOutfitterState(): OutfitterState {
  return { outfits: [], stack: [], selectedId: null };
}

function asNum(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function parseRef(raw: unknown): OutfitItemRef | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<OutfitItemRef>;
  const entry = asNum(r.entry);
  if (entry == null || entry < 0) return null;
  const ref: OutfitItemRef = { entry };
  const pe = asNum(r.permEnchantId);
  if (pe != null && pe > 0) ref.permEnchantId = pe;
  const rp = asNum(r.randomPropertyId);
  if (rp != null && rp > 0) ref.randomPropertyId = rp;
  return ref;
}

const SPECIAL_IDS = new Set<string>([
  'ArgentDawn', 'Riding', 'Dining', 'Battleground', 'AB', 'AV', 'WSG', 'City',
  'Battle', 'Defensive', 'Berserker', 'Bear', 'Cat', 'Aquatic', 'Travel', 'Moonkin',
  'Shadowform', 'Stealth', 'GhostWolf', 'Monkey', 'Hawk', 'Cheetah', 'Pack', 'Beast', 'Wild',
  'Evocate',
]);

const STAT_IDS = new Set<string>(OUTFIT_STAT_MENU.flatMap((g) => g.items.map((i) => i.id)));
STAT_IDS.add('riding');
STAT_IDS.add('argentDawn');

export function normalizeOutfit(raw: unknown, fallbackId: string): Outfit | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<Outfit>;
  const id = typeof r.id === 'string' && r.id ? r.id : fallbackId;
  const name = sanitizeOutfitName(r.name, 'Outfit');
  const items: Partial<Record<EquipSlot, OutfitItemRef>> = {};
  if (r.items && typeof r.items === 'object') {
    for (const slot of EQUIP_SLOTS) {
      const ref = parseRef((r.items as Record<string, unknown>)[slot]);
      if (ref) items[slot] = ref;
    }
  }
  const specialId = typeof r.specialId === 'string' && SPECIAL_IDS.has(r.specialId)
    ? r.specialId as OutfitSpecialId
    : undefined;
  const statId = typeof r.statId === 'string' && STAT_IDS.has(r.statId)
    ? r.statId as OutfitStatId
    : undefined;
  const isAccessory = r.isAccessory === true;
  const outfit: Outfit = {
    id,
    name,
    category: specialId ? 'Special' : calculateCategory(items, isAccessory),
    items,
    specialId,
    statId,
  };
  if (isAccessory) outfit.isAccessory = true;
  if (r.seeded === true) outfit.seeded = true;
  if (r.disabled === true) outfit.disabled = true;
  if (r.bgDisabled === true) outfit.bgDisabled = true;
  if (r.instanceDisabled === true) outfit.instanceDisabled = true;
  if (r.ammoEntry === null) outfit.ammoEntry = null;
  else if (typeof r.ammoEntry === 'number' && r.ammoEntry > 0) outfit.ammoEntry = r.ammoEntry;
  return outfit;
}

export function normalizeOutfitterState(raw: unknown): OutfitterState {
  if (!raw || typeof raw !== 'object') return emptyOutfitterState();
  const r = raw as Partial<OutfitterState>;
  const outfits: Outfit[] = [];
  const seen = new Set<string>();
  if (Array.isArray(r.outfits)) {
    for (const row of r.outfits) {
      const o = normalizeOutfit(row, nextOutfitId(outfits));
      if (!o) continue;
      if (seen.has(o.id)) o.id = nextOutfitId(outfits);
      seen.add(o.id);
      outfits.push(o);
      if (outfits.length >= MAX_OUTFITS) break;
    }
  }
  const ids = new Set(outfits.map((o) => o.id));
  const stack = Array.isArray(r.stack)
    ? r.stack.filter((id): id is string => typeof id === 'string' && ids.has(id))
    : [];
  const selectedId = typeof r.selectedId === 'string' && ids.has(r.selectedId) ? r.selectedId : null;
  // Saves written before the flag existed: seedOutfits always pushed the snapshot first, and only
  // it is a Complete outfit with worn slots and no special/stat of its own.
  const first = outfits[0];
  if (
    first && first.seeded !== true && first.category === 'Complete'
    && !first.specialId && !first.statId
    && EQUIP_SLOTS.some((slot) => (first.items[slot]?.entry ?? 0) > 0)
  ) {
    first.seeded = true;
  }
  return { outfits, stack, selectedId };
}

/**
 * Re-point the seeded base outfit at what is worn NOW. It is a snapshot of the paperdoll at seed
 * time and the specials sync re-applies the whole stack on every zone change, meal and mount, so a
 * frozen base stripped every piece equipped since back into the bags.
 */
export function refreshSeededBase(
  state: OutfitterState,
  equipped: Character['equipped'],
  ammoEntry?: number,
): OutfitterState {
  const baseId = state.stack[0];
  if (baseId == null) return state;
  const idx = state.outfits.findIndex((o) => o.id === baseId);
  const base = state.outfits[idx];
  if (!base?.seeded) return state;
  // Slots a special layered on top owns stay as that special wrote them.
  const covered = new Set<EquipSlot>();
  for (const id of state.stack.slice(1)) {
    const o = state.outfits.find((x) => x.id === id);
    if (!o || o.disabled) continue;
    for (const slot of EQUIP_SLOTS) if (o.items[slot]) covered.add(slot);
  }
  const items: Partial<Record<EquipSlot, OutfitItemRef>> = { ...base.items };
  for (const slot of EQUIP_SLOTS) {
    if (covered.has(slot)) continue;
    const inst = equippedInstance(equipped[slot]);
    items[slot] = inst ? refFromInstance(inst) : { entry: 0 };
  }
  const next: Outfit = { ...base, items };
  if (ammoEntry != null && ammoEntry > 0) next.ammoEntry = ammoEntry;
  else delete next.ammoEntry;
  const outfits = [...state.outfits];
  outfits[idx] = next;
  return { ...state, outfits };
}

export function calculateCategory(
  items: Partial<Record<EquipSlot, OutfitItemRef>>,
  isAccessory = false,
): OutfitCategory {
  if (isOutfitComplete(items)) return 'Complete';
  if (isAccessory) return 'Accessory';
  return 'Partial';
}

export function isOutfitComplete(items: Partial<Record<EquipSlot, OutfitItemRef>>): boolean {
  for (const slot of EQUIP_SLOTS) {
    if (!items[slot]) return false;
  }
  return true;
}

export function emptyOutfit(id: string, name: string): Outfit {
  return { id, name: sanitizeOutfitName(name), category: 'Partial', items: {} };
}

export function nakedOutfit(id: string, name: string): Outfit {
  const items: Partial<Record<EquipSlot, OutfitItemRef>> = {};
  for (const slot of EQUIP_SLOTS) items[slot] = { entry: 0 };
  return { id, name: sanitizeOutfitName(name, 'Birthday Suit'), category: 'Complete', items };
}

export function snapshotOutfit(
  id: string,
  name: string,
  equipped: Character['equipped'],
  ammoEntry?: number,
): Outfit {
  const items: Partial<Record<EquipSlot, OutfitItemRef>> = {};
  for (const slot of EQUIP_SLOTS) {
    const inst = equippedInstance(equipped[slot]);
    items[slot] = inst
      ? refFromInstance(inst)
      : { entry: 0 };
  }
  const o: Outfit = { id, name: sanitizeOutfitName(name, 'Normal'), category: 'Complete', items };
  if (ammoEntry != null && ammoEntry > 0) o.ammoEntry = ammoEntry;
  return o;
}

export function refFromInstance(inst: ItemInstance): OutfitItemRef {
  const ref: OutfitItemRef = { entry: inst.item };
  if (inst.permEnchantId != null && inst.permEnchantId > 0) ref.permEnchantId = inst.permEnchantId;
  if (inst.randomPropertyId != null && inst.randomPropertyId > 0) {
    ref.randomPropertyId = inst.randomPropertyId;
  }
  return ref;
}

export function entriesMatch(a: number, b: number): boolean {
  if (a === b) return true;
  return ITEM_ALIASES[a] === b;
}

export function refsEqual(a: OutfitItemRef, b: OutfitItemRef): boolean {
  if (a.entry === 0 && b.entry === 0) return true;
  if (a.entry === 0 || b.entry === 0) return false;
  if (!entriesMatch(a.entry, b.entry)) return false;
  return (a.permEnchantId ?? 0) === (b.permEnchantId ?? 0)
    && (a.randomPropertyId ?? 0) === (b.randomPropertyId ?? 0);
}

export function instanceMatchesRef(inst: ItemInstance, ref: OutfitItemRef, exact: boolean): boolean {
  if (ref.entry === 0) return false;
  if (!entriesMatch(inst.item, ref.entry)) return false;
  if (!exact) return true;
  return (inst.permEnchantId ?? 0) === (ref.permEnchantId ?? 0)
    && (inst.randomPropertyId ?? 0) === (ref.randomPropertyId ?? 0);
}

export function itemStatValue(
  it: ItemDef,
  inst: ItemInstance | undefined,
  statId: OutfitStatId,
  ds: DataStore,
): number {
  if (statId === 'fishing' && FISHING_POLES.has(it.entry)) return 1;
  if (statId === 'riding' && RIDING_ITEMS.has(it.entry)) return 3;
  if (statId === 'argentDawn' && ARGENT_DAWN_ITEMS.has(it.entry)) {
    if (it.entry === 13209 || it.entry === 19812) return 2;
    return 1;
  }

  let n = 0;
  if (statId === 'armor') n += it.armor ?? 0;
  if (statId === 'meleeDmg' && it.weapon) {
    n += (it.weapon.dmgMin + it.weapon.dmgMax) / 2;
  }

  for (const s of it.stats ?? []) {
    if (STAT_TO_ITEM[s.stat] === statId) n += s.value;
  }
  for (const m of it.equipMods ?? []) {
    if (EQUIP_MOD_TO_STAT[m.mod] === statId) n += m.amount;
    if (statId === 'armor' && m.mod === 'armor') n += m.amount;
  }

  const eid = inst?.permEnchantId;
  if (eid != null) {
    const grant = gearEnchantGrant(eid, ds);
    if (grant) {
      for (const s of grant.stats) {
        if (STAT_TO_ITEM[s.stat] === statId) n += s.value;
      }
      if (statId === 'armor') n += grant.armor;
      if (statId === 'attack' && grant.weaponDamageFlat) n += grant.weaponDamageFlat;
      const resistSchool: Partial<Record<OutfitStatId, string>> = {
        resFire: 'fire', resFrost: 'frost', resNature: 'nature',
        resShadow: 'shadow', resArcane: 'arcane',
      };
      const school = resistSchool[statId];
      if (school && grant.resists) {
        n += (grant.resists as Record<string, number>)[school] ?? 0;
      }
      const skillWant: Partial<Record<OutfitStatId, number>> = {
        fishing: SKILL_FISHING, herbalism: SKILL_HERBALISM,
        mining: SKILL_MINING, skinning: SKILL_SKINNING, riding: SKILL_RIDING,
      };
      const skill = skillWant[statId];
      for (const g of grant.grants) {
        if (skill != null && g.kind === 'skill' && g.skillLine === skill) n += g.amount;
        if (statId === 'riding' && g.kind === 'mount_speed_pct') n += g.amount;
        if (statId === 'mp5' && g.kind === 'mp5') n += g.amount;
        if (statId === 'healthRegen' && (g.kind === 'hp5' || g.kind === 'hp5_combat')) n += g.amount;
        if (statId === 'attack' && g.kind === 'attack_power') n += g.amount;
        if (statId === 'spellPower' && g.kind === 'spell_power' && !g.school) n += g.amount;
        if (statId === 'mana' && g.kind === 'mana') n += g.amount;
        if (statId === 'health' && g.kind === 'health') n += g.amount;
      }
    }
  }
  return n;
}

export interface OutfitPoolItem {
  inst: ItemInstance;
  it: ItemDef;
  where: 'equipped' | 'bags' | 'bank';
  slot?: EquipSlot;
}

export function collectPool(
  equipped: Character['equipped'],
  bags: Inventory | undefined,
  bank: Inventory | undefined,
  ds: DataStore,
): OutfitPoolItem[] {
  const out: OutfitPoolItem[] = [];
  for (const slot of EQUIP_SLOTS) {
    const inst = equippedInstance(equipped[slot]);
    if (!inst) continue;
    const it = ds.item(inst.item);
    if (it) out.push({ inst, it, where: 'equipped', slot });
  }
  for (const inst of bags?.stacks ?? []) {
    const it = ds.item(inst.item);
    if (it?.slot) out.push({ inst, it, where: 'bags' });
  }
  for (const inst of bank?.stacks ?? []) {
    const it = ds.item(inst.item);
    if (it?.slot) out.push({ inst, it, where: 'bank' });
  }
  return out;
}

function specNameFor(char: Character, ds: DataStore): string {
  const id = characterPlayerbotSpecId(char, ds);
  return playerbotWeightScale(id)?.name ?? '';
}

export function generateOutfitForStat(
  name: string,
  statId: OutfitStatId,
  char: Character,
  bags: Inventory | undefined,
  bank: Inventory | undefined,
  ds: DataStore,
  spellbook?: SpellBook,
  id = 'o-gen',
): Outfit | null {
  const pool = collectPool(char.equipped, bags, bank, ds);
  const opts: EquipOpts = { canDualWield: spellbook ? knows(spellbook, DUAL_WIELD_SPELL_ID) : false };
  const spec = specNameFor(char, ds);
  const best = new Map<EquipSlot, { ref: OutfitItemRef; value: number }>();

  for (const row of pool) {
    if (!canEquipItem(char, row.it, ds)) continue;
    if (spec && specRejectsArmorMaterial(char.cls, spec, row.it)) continue;
    const value = itemStatValue(row.it, row.inst, statId, ds);
    if (value <= 0) continue;
    const targets = itemSlotTargets(row.it, opts);
    if (!targets.length) continue;
    const ref = refFromInstance(row.inst);
    // Prefer the first target that is empty or worse; rings/trinkets overflow to the pair.
    let placed = false;
    for (const slot of targets) {
      const cur = best.get(slot);
      if (!cur || cur.value < value) {
        if (cur && targets.length > 1) {
          const alt = targets.find((s) => s !== slot);
          if (alt) {
            const altCur = best.get(alt);
            if (!altCur || altCur.value < cur.value) best.set(alt, cur);
          }
        }
        best.set(slot, { ref, value });
        placed = true;
        break;
      }
    }
    if (!placed && targets.length > 1) {
      const alt = targets[1]!;
      const cur = best.get(alt);
      if (!cur || cur.value < value) best.set(alt, { ref, value });
    }
  }

  collapseWeapons(best, statId, pool, ds);

  if (best.size === 0) return null;
  const items: Partial<Record<EquipSlot, OutfitItemRef>> = {};
  for (const [slot, row] of best) items[slot] = row.ref;
  const accessory = SMART_OUTFITS.find((s) => s.statId === statId)?.accessory === true
    || statId === 'fishing' || statId === 'herbalism' || statId === 'mining' || statId === 'skinning'
    || statId === 'riding' || statId === 'argentDawn';
  return {
    id,
    name: sanitizeOutfitName(name),
    category: calculateCategory(items, accessory),
    items,
    statId,
    ...(accessory ? { isAccessory: true } : {}),
  };
}

function collapseWeapons(
  best: Map<EquipSlot, { ref: OutfitItemRef; value: number }>,
  statId: OutfitStatId,
  pool: OutfitPoolItem[],
  ds: DataStore,
): void {
  const mh = best.get('mainhand');
  const oh = best.get('offhand');
  const mhItem = mh ? ds.item(mh.ref.entry) : undefined;
  if (mh && mhItem?.slot === 'twohand' && oh) {
    if (mh.value >= mh.value + oh.value) best.delete('offhand');
  }
  // If we have a 2H candidate not chosen that beats MH+OH, prefer it.
  let best2h: { ref: OutfitItemRef; value: number } | null = null;
  for (const row of pool) {
    if (row.it.slot !== 'twohand') continue;
    const v = itemStatValue(row.it, row.inst, statId, ds);
    if (v > 0 && (!best2h || v > best2h.value)) best2h = { ref: refFromInstance(row.inst), value: v };
  }
  if (!best2h) return;
  const combo = (mh && mhItem?.slot !== 'twohand' ? mh.value : 0) + (oh?.value ?? 0);
  if (best2h.value > combo) {
    best.set('mainhand', best2h);
    best.delete('offhand');
  }
}

export interface SeedWearer {
  char: Character;
  bags?: Inventory;
  bank?: Inventory;
  spellbook?: SpellBook;
}

export function seedOutfits(wearer: SeedWearer, ds: DataStore): OutfitterState {
  const outfits: Outfit[] = [];
  const normal = snapshotOutfit(nextOutfitId(outfits), 'Normal', wearer.char.equipped, wearer.char.ammoItem);
  normal.seeded = true;
  outfits.push(normal);
  outfits.push(nakedOutfit(nextOutfitId(outfits), 'Birthday Suit'));

  for (const smart of SMART_OUTFITS) {
    const gen = generateOutfitForStat(
      smart.name, smart.statId, wearer.char, wearer.bags, wearer.bank, ds, wearer.spellbook,
      nextOutfitId(outfits),
    );
    if (gen) outfits.push(gen);
  }

  const specials: Array<{ name: string; specialId: OutfitSpecialId; statId?: OutfitStatId; bgDisabled?: boolean }> = [
    { name: 'Argent Dawn', specialId: 'ArgentDawn', statId: 'argentDawn' },
    { name: 'Riding', specialId: 'Riding', statId: 'riding', bgDisabled: true },
    { name: 'Dining', specialId: 'Dining' },
    { name: 'Battleground', specialId: 'Battleground' },
    { name: 'Battleground: Arathi Basin', specialId: 'AB' },
    { name: 'Battleground: Alterac Valley', specialId: 'AV' },
    { name: 'Battleground: Warsong Gulch', specialId: 'WSG' },
    { name: 'Around Town', specialId: 'City' },
  ];
  for (const spec of specials) {
    let o: Outfit | null = null;
    if (spec.statId) {
      o = generateOutfitForStat(
        spec.name, spec.statId, wearer.char, wearer.bags, wearer.bank, ds, wearer.spellbook,
        nextOutfitId(outfits),
      );
    }
    if (!o) o = emptyOutfit(nextOutfitId(outfits), spec.name);
    o.specialId = spec.specialId;
    o.category = 'Special';
    if (spec.bgDisabled) o.bgDisabled = true;
    if (spec.specialId === 'Riding') o.instanceDisabled = true;
    outfits.push(o);
  }

  for (const row of CLASS_SPECIALS[wearer.char.cls] ?? []) {
    const o = emptyOutfit(nextOutfitId(outfits), row.name);
    o.specialId = row.specialId;
    o.category = 'Special';
    outfits.push(o);
  }

  return { outfits, stack: [normal.id], selectedId: null };
}

export function ensureSeeded(state: OutfitterState | undefined, wearer: SeedWearer, ds: DataStore): OutfitterState {
  const n = normalizeOutfitterState(state);
  if (n.outfits.length > 0) return n;
  return seedOutfits(wearer, ds);
}

export function outfitsByCategory(state: OutfitterState): Array<{ category: OutfitCategory; outfits: Outfit[] }> {
  return CATEGORY_ORDER.map((category) => ({
    category,
    outfits: state.outfits.filter((o) => o.category === category),
  })).filter((g) => g.outfits.length > 0);
}

export function wearingOutfit(state: OutfitterState, id: string): boolean {
  return state.stack.includes(id);
}

export function applyWearToStack(state: OutfitterState, outfit: Outfit): OutfitterState {
  if (outfit.disabled) return state;
  let stack = [...state.stack];
  if (outfit.category === 'Complete') {
    stack = [];
  } else if (outfit.category === 'Partial') {
    stack = stack.filter((id) => {
      const o = findOutfitById(state, id);
      return o && o.category !== 'Partial' && o.category !== 'Accessory';
    });
  }
  stack = stack.filter((id) => id !== outfit.id);
  stack.push(outfit.id);
  return { ...state, stack, selectedId: outfit.id };
}

export function applyUnwearToStack(state: OutfitterState, outfitId: string): OutfitterState {
  const stack = state.stack.filter((id) => id !== outfitId);
  const selectedId = state.selectedId === outfitId ? (stack[stack.length - 1] ?? null) : state.selectedId;
  return { ...state, stack, selectedId };
}

export function applyToggleToStack(state: OutfitterState, outfit: Outfit): { state: OutfitterState; wearing: boolean } {
  if (wearingOutfit(state, outfit.id) && outfit.category !== 'Complete') {
    return { state: applyUnwearToStack(state, outfit.id), wearing: false };
  }
  return { state: applyWearToStack(state, outfit), wearing: true };
}

export function mergedTarget(state: OutfitterState): {
  items: Partial<Record<EquipSlot, OutfitItemRef>>;
  ammoEntry?: number | null;
} {
  const items: Partial<Record<EquipSlot, OutfitItemRef>> = {};
  let ammoEntry: number | null | undefined;
  for (const id of state.stack) {
    const o = findOutfitById(state, id);
    if (!o || o.disabled) continue;
    for (const slot of EQUIP_SLOTS) {
      const ref = o.items[slot];
      if (ref) items[slot] = ref;
    }
    if (o.ammoEntry !== undefined) ammoEntry = o.ammoEntry;
  }
  return { items, ammoEntry };
}

export type WearOp =
  | { kind: 'unequip'; slot: EquipSlot }
  | { kind: 'equip'; slot: EquipSlot; entry: number; from: 'bags' | 'bank' | 'equipped'; fromSlot?: EquipSlot }
  | { kind: 'setAmmo'; entry: number | null }
  | { kind: 'missing'; slot: EquipSlot; ref: OutfitItemRef };

export interface WearPlan {
  ops: WearOp[];
  missing: Array<{ slot: EquipSlot; ref: OutfitItemRef }>;
}

function findRefInPool(
  pool: OutfitPoolItem[],
  ref: OutfitItemRef,
  used: Set<string>,
): OutfitPoolItem | undefined {
  const keyOf = (p: OutfitPoolItem) => `${p.where}:${p.slot ?? p.inst.item}:${p.inst.permEnchantId ?? 0}:${p.inst.randomPropertyId ?? 0}:${p.inst.item}`;
  const exact = pool.find((p) => !used.has(keyOf(p)) && instanceMatchesRef(p.inst, ref, true));
  if (exact) return exact;
  return pool.find((p) => !used.has(keyOf(p)) && instanceMatchesRef(p.inst, ref, false));
}

export function planWear(
  target: Partial<Record<EquipSlot, OutfitItemRef>>,
  equipped: Character['equipped'],
  bags: Inventory | undefined,
  bank: Inventory | undefined,
  ds: DataStore,
  ammoWant?: number | null,
  ammoHave?: number,
): WearPlan {
  const pool = collectPool(equipped, bags, bank, ds);
  const used = new Set<string>();
  const ops: WearOp[] = [];
  const missing: Array<{ slot: EquipSlot; ref: OutfitItemRef }> = [];
  const keyOf = (p: OutfitPoolItem) => `${p.where}:${p.slot ?? p.inst.item}:${p.inst.permEnchantId ?? 0}:${p.inst.randomPropertyId ?? 0}:${p.inst.item}`;

  for (const slot of EQUIP_SLOTS) {
    const ref = target[slot];
    if (!ref) continue;
    const cur = equippedInstance(equipped[slot]);
    if (ref.entry === 0) {
      if (cur) ops.push({ kind: 'unequip', slot });
      continue;
    }
    if (cur && instanceMatchesRef(cur, ref, true)) continue;
    if (cur && instanceMatchesRef(cur, ref, false) && (ref.permEnchantId ?? 0) === 0) continue;
    const hit = findRefInPool(pool, ref, used);
    if (!hit) {
      ops.push({ kind: 'missing', slot, ref });
      missing.push({ slot, ref });
      continue;
    }
    used.add(keyOf(hit));
    if (hit.where === 'equipped' && hit.slot === slot) continue;
    ops.push({
      kind: 'equip',
      slot,
      entry: hit.inst.item,
      from: hit.where === 'equipped' ? 'equipped' : hit.where,
      fromSlot: hit.slot,
    });
  }

  if (ammoWant !== undefined) {
    const have = ammoHave ?? 0;
    if (ammoWant === null || ammoWant === 0) {
      if (have) ops.push({ kind: 'setAmmo', entry: null });
    } else if (have !== ammoWant) {
      ops.push({ kind: 'setAmmo', entry: ammoWant });
    }
  }

  return { ops, missing };
}

export function resolveOutfitItems(
  outfit: Outfit,
  equipped: Character['equipped'],
  bags: Inventory | undefined,
  bank: Inventory | undefined,
  ds: DataStore,
): Array<{ slot: EquipSlot; ref: OutfitItemRef; where: 'equipped' | 'bags' | 'bank' | 'missing' }> {
  const pool = collectPool(equipped, bags, bank, ds);
  const used = new Set<string>();
  const keyOf = (p: OutfitPoolItem) => `${p.where}:${p.slot ?? p.inst.item}:${p.inst.permEnchantId ?? 0}:${p.inst.randomPropertyId ?? 0}:${p.inst.item}`;
  const out: Array<{ slot: EquipSlot; ref: OutfitItemRef; where: 'equipped' | 'bags' | 'bank' | 'missing' }> = [];
  for (const slot of EQUIP_SLOTS) {
    const ref = outfit.items[slot];
    if (!ref) continue;
    if (ref.entry === 0) {
      out.push({ slot, ref, where: 'equipped' });
      continue;
    }
    const hit = findRefInPool(pool, ref, used);
    if (!hit) {
      out.push({ slot, ref, where: 'missing' });
      continue;
    }
    used.add(keyOf(hit));
    out.push({ slot, ref, where: hit.where });
  }
  return out;
}

export function outfitMissing(outfit: Outfit, equipped: Character['equipped'], bags: Inventory | undefined, bank: Inventory | undefined, ds: DataStore): boolean {
  return resolveOutfitItems(outfit, equipped, bags, bank, ds).some((r) => r.where === 'missing' && r.ref.entry !== 0);
}

export function oddsNEnds(
  state: OutfitterState,
  equipped: Character['equipped'],
  bags: Inventory | undefined,
  bank: Inventory | undefined,
  ds: DataStore,
): OutfitPoolItem[] {
  const used = new Set<string>();
  const mark = (entry: number, pe?: number, rp?: number) => {
    used.add(`${entry}:${pe ?? 0}:${rp ?? 0}`);
    const alias = ITEM_ALIASES[entry];
    if (alias) used.add(`${alias}:${pe ?? 0}:${rp ?? 0}`);
  };
  for (const o of state.outfits) {
    for (const ref of Object.values(o.items)) {
      if (!ref || ref.entry === 0) continue;
      mark(ref.entry, ref.permEnchantId, ref.randomPropertyId);
    }
  }
  return collectPool(equipped, bags, bank, ds).filter((p) => {
    if (IGNORED_UNUSED.has(p.inst.item)) return false;
    if (!p.it.slot || p.it.slot === 'bag') return false;
    const key = `${p.inst.item}:${p.inst.permEnchantId ?? 0}:${p.inst.randomPropertyId ?? 0}`;
    return !used.has(key);
  });
}

export interface SpecialContext {
  zoneName?: string;
  instanceId?: string | null;
  battleground?: 'wsg' | 'ab' | 'av' | null;
  mounted?: boolean;
  dining?: boolean;
  form?: number;
  auraSpecials?: OutfitSpecialId[];
  inBattleground?: boolean;
}

export function specialIdsForContext(ctx: SpecialContext): OutfitSpecialId[] {
  const out: OutfitSpecialId[] = [];
  const zone = (ctx.zoneName ?? '').trim().toLowerCase();
  const inst = ctx.instanceId ?? '';

  if (ARGENT_DAWN_ZONES.has(zone) || ARGENT_DAWN_INSTANCES.has(inst)) out.push('ArgentDawn');
  if (CITY_ZONES.has(zone)) out.push('City');
  if (ctx.battleground || ctx.inBattleground) {
    out.push('Battleground');
    if (ctx.battleground === 'av') out.push('AV');
    if (ctx.battleground === 'ab') out.push('AB');
    if (ctx.battleground === 'wsg') out.push('WSG');
  }
  if (ctx.mounted) out.push('Riding');
  if (ctx.dining) out.push('Dining');
  const formSpec = FORM_TO_SPECIAL[ctx.form ?? 0];
  if (formSpec) out.push(formSpec);
  for (const a of ctx.auraSpecials ?? []) {
    if (!out.includes(a)) out.push(a);
  }
  return out;
}

export function ridingBlocked(outfit: Outfit, ctx: SpecialContext): boolean {
  if (outfit.specialId !== 'Riding') return false;
  if (outfit.bgDisabled && (ctx.battleground || ctx.inBattleground)) return true;
  if (outfit.instanceDisabled && ctx.instanceId && RIDING_INSTANCE_IDS.has(ctx.instanceId)) return true;
  return false;
}

export function addOutfit(state: OutfitterState, outfit: Outfit): OutfitterState {
  if (state.outfits.length >= MAX_OUTFITS) return state;
  const name = uniqueOutfitName(state.outfits, outfit.name);
  const id = outfit.id && !state.outfits.some((o) => o.id === outfit.id)
    ? outfit.id
    : nextOutfitId(state.outfits);
  const category = outfit.specialId ? 'Special' : calculateCategory(outfit.items, outfit.isAccessory === true);
  return { ...state, outfits: [...state.outfits, { ...outfit, id, name, category }] };
}

export function updateOutfit(state: OutfitterState, id: string, patch: Partial<Outfit>): OutfitterState {
  const outfits = state.outfits.map((o) => {
    if (o.id !== id) return o;
    const next = { ...o, ...patch, id: o.id };
    if (next.specialId) next.category = 'Special';
    else next.category = calculateCategory(next.items, next.isAccessory === true);
    return next;
  });
  return { ...state, outfits };
}

export function renameOutfit(state: OutfitterState, id: string, name: string): OutfitterState {
  const others = state.outfits.filter((o) => o.id !== id);
  return updateOutfit(state, id, { name: uniqueOutfitName(others, name) });
}

export function deleteOutfit(state: OutfitterState, id: string): OutfitterState {
  const outfits = state.outfits.filter((o) => o.id !== id);
  const stack = state.stack.filter((s) => s !== id);
  const selectedId = state.selectedId === id ? null : state.selectedId;
  return { outfits, stack, selectedId };
}

export function setOutfitSlot(
  state: OutfitterState,
  id: string,
  slot: EquipSlot,
  ref: OutfitItemRef | null,
): OutfitterState {
  const o = findOutfitById(state, id);
  if (!o) return state;
  const items = { ...o.items };
  if (ref) items[slot] = ref;
  else delete items[slot];
  return updateOutfit(state, id, { items });
}

export function setAllSlots(
  state: OutfitterState,
  id: string,
  equipped: Character['equipped'],
  enable: boolean,
): OutfitterState {
  const o = findOutfitById(state, id);
  if (!o) return state;
  const items: Partial<Record<EquipSlot, OutfitItemRef>> = enable ? {} : { ...o.items };
  if (enable) {
    for (const slot of EQUIP_SLOTS) {
      const inst = equippedInstance(equipped[slot]);
      items[slot] = inst ? refFromInstance(inst) : { entry: 0 };
    }
  } else {
    for (const slot of EQUIP_SLOTS) delete items[slot];
  }
  return updateOutfit(state, id, { items });
}

export function parseOutfitterCommand(raw: string): { action: 'wear' | 'unwear' | 'toggle'; name: string } | null {
  const s = raw.trim();
  const m = /^(wear|unwear|toggle)\s+(.+)$/i.exec(s);
  if (!m) return null;
  const action = m[1]!.toLowerCase() as 'wear' | 'unwear' | 'toggle';
  const name = m[2]!.trim();
  if (!name) return null;
  return { action, name };
}

export function auraSpecialFromSpellName(name: string): OutfitSpecialId | undefined {
  const n = name.toLowerCase();
  if (n.includes('aspect of the cheetah')) return 'Cheetah';
  if (n.includes('aspect of the pack')) return 'Pack';
  if (n.includes('aspect of the beast')) return 'Beast';
  if (n.includes('aspect of the wild')) return 'Wild';
  if (n.includes('aspect of the monkey')) return 'Monkey';
  if (n.includes('aspect of the hawk') || n.includes('aspect of the raptor')) return 'Hawk';
  if (n === 'evocation' || n === 'evocate') return 'Evocate';
  return undefined;
}

export function equippedEntryOf(equipped: Character['equipped'], slot: EquipSlot): number | undefined {
  return equippedEntry(equipped[slot]);
}
