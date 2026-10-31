// Auto-quester / auto-battler: snap spendable mana (and the pet bar) to full so
// OOC buffs/conjure/summon cannot open the next pull at 0. Rage is left alone.

import type { DataStore } from '../data/dataStore.ts';
import { maxMana, maxPower, powerType, type Character } from '../domain/character/character.ts';
import { petMaxPower } from '../domain/pet/pet.ts';

/** Full mana (or parallel mana) and a full pet bar. Does not touch rage or energy. */
export function topOffAutopilotPower(char: Character, ds: DataStore): Character {
  const pt = powerType(char);
  let next: Character = char;
  if (pt === 'mana') {
    const mp = maxPower(char, ds);
    if (char.power !== mp) next = { ...next, power: mp };
  } else {
    const mm = maxMana(char, ds);
    if (mm > 0 && (char.mana ?? 0) !== mm) next = { ...next, mana: mm };
  }
  const pet = next.pet;
  if (!pet || pet.health <= 0) return next;
  const cdef = ds.creature(pet.creature);
  if (!cdef) return next;
  const { maxPower: pmp } = petMaxPower(next, cdef, ds);
  if (pmp <= 0 || pet.power === pmp) return next;
  return { ...next, pet: { ...pet, power: pmp } };
}
