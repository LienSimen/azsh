// Paperdoll slots for /use 13 or /use trinket1, numbered as vanilla INVSLOT_*: 13 and 14 are the
// trinkets, 16 main hand, 17 off hand. A name alias parses to the same slot.

import type { EquipSlot } from '../../data/schema.ts';

/** INVSLOT id -> our EquipSlot. 20-23 are the bags Roid numbers after the tabard. */
const BY_ID: Readonly<Record<number, EquipSlot>> = {
  1: 'head', 2: 'neck', 3: 'shoulder', 4: 'shirt', 5: 'chest',
  6: 'waist', 7: 'legs', 8: 'feet', 9: 'wrist', 10: 'hands',
  11: 'finger1', 12: 'finger2', 13: 'trinket1', 14: 'trinket2',
  15: 'back', 16: 'mainhand', 17: 'offhand', 18: 'ranged',
  20: 'bag1', 21: 'bag2', 22: 'bag3', 23: 'bag4',
};

/** INVSLOT ids with no paperdoll place here, named so the refusal can say which slot you meant. */
const NO_SLOT_HERE: Readonly<Record<number, string>> = { 0: 'Ammo', 19: 'Tabard' };

const BY_NAME: Readonly<Record<string, EquipSlot>> = {
  head: 'head', helm: 'head', helmet: 'head', hat: 'head',
  neck: 'neck', amulet: 'neck', necklace: 'neck',
  shoulder: 'shoulder', shoulders: 'shoulder', pauldrons: 'shoulder', spaulders: 'shoulder',
  shirt: 'shirt',
  chest: 'chest', tunic: 'chest', robe: 'chest',
  waist: 'waist', belt: 'waist', girdle: 'waist',
  legs: 'legs', pants: 'legs', leggings: 'legs', trousers: 'legs',
  feet: 'feet', boots: 'feet', shoes: 'feet',
  wrist: 'wrist', wrists: 'wrist', bracer: 'wrist', bracers: 'wrist',
  hands: 'hands', gloves: 'hands', gauntlets: 'hands',
  back: 'back', cloak: 'back', cape: 'back',
  finger1: 'finger1', finger2: 'finger2', ring1: 'finger1', ring2: 'finger2',
  'finger 1': 'finger1', 'finger 2': 'finger2',
  ring: 'finger1', 'ring 1': 'finger1', 'ring 2': 'finger2',
  trinket1: 'trinket1', trinket2: 'trinket2', trinket: 'trinket1',
  'trinket 1': 'trinket1', 'trinket 2': 'trinket2',
  mainhand: 'mainhand', mh: 'mainhand', 'main hand': 'mainhand',
  offhand: 'offhand', oh: 'offhand', 'off hand': 'offhand',
  ranged: 'ranged',
  bag1: 'bag1', bag2: 'bag2', bag3: 'bag3', bag4: 'bag4',
  'bag 1': 'bag1', 'bag 2': 'bag2', 'bag 3': 'bag3', 'bag 4': 'bag4',
};

export const MACRO_INV_SLOT_LABEL: Readonly<Record<EquipSlot, string>> = {
  head: 'Head', neck: 'Neck', shoulder: 'Shoulder', back: 'Back', chest: 'Chest',
  shirt: 'Shirt', wrist: 'Wrists', hands: 'Hands', waist: 'Waist', legs: 'Legs',
  feet: 'Feet', finger1: 'Ring 1', finger2: 'Ring 2',
  trinket1: 'Trinket 1', trinket2: 'Trinket 2',
  mainhand: 'Main Hand', offhand: 'Off Hand', ranged: 'Ranged',
  bag1: 'Bag 1', bag2: 'Bag 2', bag3: 'Bag 3', bag4: 'Bag 4',
};

/** Slots the item picker offers for `/use 13` — the on-use ones a macro actually fires. */
export const MACRO_USE_SLOTS: ReadonlyArray<{ arg: string; slot: EquipSlot; label: string }> = [
  { arg: '13', slot: 'trinket1', label: 'Trinket 1' },
  { arg: '14', slot: 'trinket2', label: 'Trinket 2' },
  { arg: '16', slot: 'mainhand', label: 'Main Hand' },
  { arg: '17', slot: 'offhand', label: 'Off Hand' },
  { arg: '18', slot: 'ranged', label: 'Ranged' },
];

/** Parse `/use 13` or `/use boots` into a paperdoll slot. Null = not a slot token. */
export function parseMacroInvSlot(raw: string): EquipSlot | null {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  if (/^[0-9]{1,2}$/.test(s)) return BY_ID[Number(s)] ?? null;
  return BY_NAME[s] ?? null;
}

/** The slot a token names, even when this character has no such place (`/use 19`). */
export function macroInvSlotName(raw: string): string | null {
  const slot = parseMacroInvSlot(raw);
  if (slot) return MACRO_INV_SLOT_LABEL[slot];
  const s = String(raw ?? '').trim().toLowerCase();
  if (/^[0-9]{1,2}$/.test(s)) return NO_SLOT_HERE[Number(s)] ?? null;
  return s === 'ammo' ? 'Ammo' : s === 'tabard' ? 'Tabard' : null;
}

export function describeMacroInvSlot(raw: string): string | null {
  const slot = parseMacroInvSlot(raw);
  return slot ? MACRO_INV_SLOT_LABEL[slot] : null;
}

export interface MacroItemHit {
  entry: number;
  name: string;
  icon?: string;
  equipped: boolean;
}

/** Name, then paperdoll slot (`13` / `trinket1`), then a weapon type (`Shields`). */
export function resolveMacroItemArg(
  raw: string,
  find: {
    equipped(slot: EquipSlot): MacroItemHit | null;
    named(name: string): MacroItemHit | null;
    typed(type: string): MacroItemHit | null;
  },
): MacroItemHit | null {
  const slot = parseMacroInvSlot(raw);
  if (slot) return find.equipped(slot);
  return find.named(raw) ?? find.typed(raw);
}
