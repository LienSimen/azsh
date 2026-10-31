import type { Character } from '../domain/character/character.ts';
import { maxHealth, maxPower, powerType } from '../domain/character/character.ts';
import type { DataStore } from '../data/dataStore.ts';
import {
  COMBAT_SKILL,
  raiseCombatSkillsToLevelCap,
  skillIdForItem,
  grantLevelUnlockedArmorSkills,
  updateCombatSkillsForLevel,
} from '../domain/character/combatSkills.ts';
import { equippedEntry } from '../domain/items/itemInstance.ts';
import { grantPetLevelTrainingPoints } from '../domain/pet/pet.ts';
import { CLASSIC_MAX_PLAYER_LEVEL } from './xpGain.ts';
import { raisePoisonsCapForLevel } from '../domain/professions/poisons.ts';

/** Defense + combat skill ids for equipped MH/OH/ranged (fist → unarmed via skillIdForItem). */
function equippedCombatSkillIds(char: Character, ds: DataStore): number[] {
  const ids: number[] = [COMBAT_SKILL.DEFENSE];
  let hasMhWeapon = false;
  for (const slot of ['mainhand', 'offhand', 'ranged'] as const) {
    const entry = equippedEntry(char.equipped[slot]);
    if (entry == null) continue;
    const it = ds.item(entry);
    if (!it) continue;
    if (slot === 'mainhand' && it.weapon) hasMhWeapon = true;
    const sid = skillIdForItem(it);
    if (sid) ids.push(sid);
  }
  if (!hasMhWeapon) ids.push(COMBAT_SKILL.UNARMED);
  return ids;
}

export interface LevelUpResult {
  char: Character;
  leveledTo: number[]; // the new level(s) reached, in order
}

// Add XP and apply any level-ups, hard-capped at level 60: the XP table still carries a 60-to-61 row,
// so without the gate you reach 61. Cite: Player.cpp GiveXP.
export function grantXp(char: Character, amount: number, ds: DataStore): LevelUpResult {
  const c: Character = { ...char };
  if (c.level >= CLASSIC_MAX_PLAYER_LEVEL) {
    c.level = CLASSIC_MAX_PLAYER_LEVEL;
    c.xp = 0;
    return { char: c, leveledTo: [] };
  }
  c.xp += Math.max(0, Math.round(amount));
  const leveledTo: number[] = [];
  // Stop before exceeding the cap; xpToNext returns Infinity past the table end.
  while (c.level < CLASSIC_MAX_PLAYER_LEVEL && c.xp >= ds.xpToNext(c.level)) {
    c.xp -= ds.xpToNext(c.level);
    c.level += 1;
    leveledTo.push(c.level);
  }
  if (c.level >= CLASSIC_MAX_PLAYER_LEVEL) {
    c.level = CLASSIC_MAX_PLAYER_LEVEL;
    c.xp = 0;
  }
  if (leveledTo.length > 0) {
    // Leveling refills the character (classic behaviour).
    c.health = maxHealth(c, ds);
    // Mana and energy refill on level-up (CMaNGOS sets ENERGY to max); rage stays empty.
    const pt = powerType(c);
    c.power = (pt === 'mana' || pt === 'energy') ? maxPower(c, ds) : 0;
    // Caps → L×5 (UpdateSkillsForLevel); equipped weapons + Defense snap to trained L×5
    // so pure-XP level-ups don't leave the player at create-kit current:1 vs maxed companions.
    const meta = ds.combatSkillMeta?.();
    c.combatSkills = updateCombatSkillsForLevel(c.combatSkills, c.level, meta);
    // Plate at 40 (warrior/paladin), Mail at 40 (hunter/shaman) — SkillRaceClassInfo gates
    // these behind a level and nothing else in the tree ever added them after create.
    c.combatSkills = grantLevelUnlockedArmorSkills(c.combatSkills, c.level, c.race, c.cls, meta);
    c.combatSkills = raiseCombatSkillsToLevelCap(
      c.combatSkills,
      c.level,
      equippedCombatSkillIds(c, ds),
      meta,
    );
    // A pet's level tracks its owner's, so each level here grants training points at loyalty minus one.
    // Without it a Content pet gained none over ten levels, and a dismissed pet levels with you.
    c.pet = grantPetLevelTrainingPoints(c.pet, leveledTo.length);
    c.storedPet = grantPetLevelTrainingPoints(c.storedPet, leveledTo.length);
    if (c.stablePets?.length) {
      c.stablePets = c.stablePets.map((p) => (p ? grantPetLevelTrainingPoints(p, leveledTo.length) ?? p : p));
    }
    const raised = raisePoisonsCapForLevel(c);
    c.skills = raised.skills;
  }
  return { char: c, leveledTo };
}
