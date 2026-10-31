// [equipped:Shields] / [worn:Daggers]. Roid keys these plurals to a slot plus the localized
// tooltip name; we key them to the baked ItemDef — typeName first, item_template subclass after.

/** A worn piece, as the host reads it off the character. */
export interface MacroWornItem {
  slot: 'mainhand' | 'offhand' | 'ranged' | string;
  typeName?: string;
  weaponSubclass?: number;
  armorSubclass?: number;
}

interface WeaponTypeRule {
  /** Slots Roid looks in for this type. */
  slots: readonly string[];
  /** Baked `typeName` values that count. */
  typeNames: readonly string[];
  /** item_template.subclass values that count (weapon class 2 unless `armor`). */
  subclasses: readonly number[];
  armor?: true;
}

// Roid's WeaponTypeNames keys, plus the singular spelling so both parse. Weapon types are MAIN-HAND
// only, shields off-hand, ranged in the ranged slot — matching the off hand too would over-fire.
export const MACRO_WEAPON_TYPES: Readonly<Record<string, WeaponTypeRule>> = {
  daggers: { slots: ['mainhand'], typeNames: ['Dagger'], subclasses: [15] },
  fists: { slots: ['mainhand'], typeNames: ['Fist Weapon'], subclasses: [13] },
  axes: { slots: ['mainhand'], typeNames: ['Axe'], subclasses: [0, 1] },
  swords: { slots: ['mainhand'], typeNames: ['Sword'], subclasses: [7, 8] },
  staffs: { slots: ['mainhand'], typeNames: ['Staff'], subclasses: [10] },
  maces: { slots: ['mainhand'], typeNames: ['Mace'], subclasses: [4, 5] },
  polearms: { slots: ['mainhand'], typeNames: ['Polearm'], subclasses: [6] },
  shields: { slots: ['offhand'], typeNames: ['Shield'], subclasses: [6], armor: true },
  guns: { slots: ['ranged'], typeNames: ['Gun'], subclasses: [3] },
  crossbows: { slots: ['ranged'], typeNames: ['Crossbow'], subclasses: [18] },
  bows: { slots: ['ranged'], typeNames: ['Bow'], subclasses: [2] },
  thrown: { slots: ['ranged'], typeNames: ['Thrown'], subclasses: [16] },
  wands: { slots: ['ranged'], typeNames: ['Wand'], subclasses: [19] },
  // Generic 1H for `/equip [noequipped:Shields] One-Hand` — any one-hand weapon in bags.
  onehand: {
    slots: ['mainhand'],
    typeNames: ['Axe', 'Mace', 'Sword', 'Dagger', 'Fist Weapon'],
    subclasses: [0, 4, 7, 13, 15],
  },
};

const ALIASES: Readonly<Record<string, string>> = {
  dagger: 'daggers', fist: 'fists', 'fist weapon': 'fists', 'fist weapons': 'fists',
  axe: 'axes', sword: 'swords', staff: 'staffs', staves: 'staffs', mace: 'maces',
  polearm: 'polearms', shield: 'shields', gun: 'guns', crossbow: 'crossbows', bow: 'bows',
  wand: 'wands',
  'one-hand': 'onehand', 'onehand': 'onehand', '1h': 'onehand', 'one-handed': 'onehand',
  'one hand': 'onehand',
};

function weaponTypeRule(query: string): WeaponTypeRule | null {
  const key = String(query ?? '').trim().toLowerCase();
  return MACRO_WEAPON_TYPES[key] ?? MACRO_WEAPON_TYPES[ALIASES[key] ?? ''] ?? null;
}

/** True when a bag/equipped item is that weapon type (for `/equip Shields`). */
export function itemMatchesMacroWeaponType(
  query: string,
  item: { typeName?: string; weaponSubclass?: number; armorSubclass?: number },
): boolean {
  const rule = weaponTypeRule(query);
  if (!rule) return false;
  if (item.typeName && rule.typeNames.includes(item.typeName)) return true;
  const sub = rule.armor ? item.armorSubclass : item.weaponSubclass;
  return sub != null && rule.subclasses.includes(sub);
}

/** True when `query` names a weapon/shield type the character is currently wearing. */
export function hasMacroWeaponType(query: string, worn: readonly MacroWornItem[]): boolean {
  const rule = weaponTypeRule(query);
  if (!rule) return false;
  for (const item of worn) {
    if (!rule.slots.includes(item.slot)) continue;
    if (item.typeName && rule.typeNames.includes(item.typeName)) return true;
    const sub = rule.armor ? item.armorSubclass : item.weaponSubclass;
    if (sub != null && rule.subclasses.includes(sub)) return true;
  }
  return false;
}
