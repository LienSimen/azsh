// Gameplay id helpers and display names. (Numeric race/class ids live in
// data/schema.ts as the RACE/CLASS constants; the ETL uses the same numbers.)

import { CLASS, RACE } from '../../data/schema.ts';
import type { PowerType } from '../../data/schema.ts';

/** Rage is a fixed 0..100 pool; mana comes from the stat tables. */
export const RAGE_MAX = 100;

// Energy pool max (rogue / later feral cat). Sourced from CMaNGOS `Unit.h`
// PowerDefaults::POWER_ENERGY_DEFAULT = 100 (UI units 1:1, not ×10 like rage).
export const ENERGY_MAX = 100;

/** Soul Shard item entry from the MaNGOS DB. Warlocks get these when a target dies under Drain
 * Soul; we map the real DB item instead of synthesizing a counter. */
export const SOUL_SHARD_ITEM = 6265;

export function classPowerType(cls: number): PowerType {
  if (cls === CLASS.WARRIOR) return 'rage';
  if (cls === CLASS.ROGUE) return 'energy';
  return 'mana';
}

// Whether a class auto-attacks at range with its equipped ranged weapon instead of the main hand.
// Hunters are the ranged-primary class; everyone else melees and only fires ranged via Shoot.
export function classUsesRangedAuto(cls: number): boolean {
  return cls === CLASS.HUNTER;
}

export const CLASS_NAMES: Record<number, string> = {
  [CLASS.WARRIOR]: 'Warrior',
  [CLASS.PALADIN]: 'Paladin',
  [CLASS.HUNTER]: 'Hunter',
  [CLASS.ROGUE]: 'Rogue',
  [CLASS.PRIEST]: 'Priest',
  [CLASS.SHAMAN]: 'Shaman',
  [CLASS.MAGE]: 'Mage',
  [CLASS.WARLOCK]: 'Warlock',
  [CLASS.DRUID]: 'Druid',
};

export const RACE_NAMES: Record<number, string> = {
  [RACE.HUMAN]: 'Human',
  [RACE.ORC]: 'Orc',
  [RACE.DWARF]: 'Dwarf',
  [RACE.NIGHTELF]: 'Night Elf',
  [RACE.UNDEAD]: 'Undead',
  [RACE.TAUREN]: 'Tauren',
  [RACE.GNOME]: 'Gnome',
  [RACE.TROLL]: 'Troll',
};

export function className(cls: number): string {
  return CLASS_NAMES[cls] ?? `Class ${cls}`;
}
export function raceName(race: number): string {
  return RACE_NAMES[race] ?? `Race ${race}`;
}
