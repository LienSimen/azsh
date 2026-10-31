// Pure selector: active pet's known abilities → display rows for the Spellbook Pet tab.
// No DOM. Maps petKnownSpells (SpellDef[]) into UI-ready fields without re-deriving names/icons.

import type { DataStore } from '../../data/dataStore.ts';
import type { Character } from '../character/character.ts';
import { getSpellRecoveryTime } from '../../engine/spells/recovery.ts';
import { petKnownSpells } from './pet.ts';

/** One spellbook Pet-tab row, shaped from a resolved SpellDef. */
export interface PetSpellbookEntry {
  id: number;
  name: string;
  icon?: string;
  rank: number;
  cost: number;
  /** SpellDef.cooldownMs (ms). */
  cooldown: number;
  passive: boolean;
}

// Display rows for the active living pet's known abilities. Empty when there is no pet, the pet is dead, or
// its creature def is missing.
export function petSpellbookEntries(char: Character, ds: DataStore): PetSpellbookEntry[] {
  const pet = char.pet;
  if (!pet || pet.health <= 0) return [];
  const cdef = ds.creature(pet.creature);
  if (!cdef) return [];
  return petKnownSpells(char, cdef, ds).map((s) => ({
    id: s.id,
    name: s.name,
    icon: s.icon,
    rank: s.rank,
    // Flat ManaCost: pet kit is not baked with costPct (ManaCostPercentage).
    // resolveSpellCost(s, 0, 0) would hide a pct cost; do not pass empty create pools.
    cost: s.cost,
    cooldown: getSpellRecoveryTime(s),
    passive: !!s.passive,
  }));
}
