// A companion trains a profession rank the moment their skill and level reach the trainer's gate,
// free — the same rule that hands them the trainer/vendor recipe catalog (botProfessions.learnNpcCatalog).

import type { DataStore } from '../../data/dataStore.ts';
import {
  companionCharacter,
  companionSkillMap,
  trainCompanionProfessionRanks,
  type Companion,
} from '../../domain/bots/squad.ts';
import { initInventorySkill } from '../../domain/bots/botProfessions.ts';
import { emptyInventory } from '../../domain/items/inventory.ts';

/** Stamp any newly reached rank and say so once. Silent on a save that had no stamp yet. */
export function announceCompanionRanks(
  comp: Companion,
  level: number,
  ds: DataStore,
  log: (line: string) => void,
): void {
  for (const t of trainCompanionProfessionRanks(comp, level)) {
    log(`${comp.name} learns ${t.name} ${ds.profession(t.line)?.name ?? t.line} (skill to ${t.cap}).`);
  }
}

// The tool for every line this body now holds, the same InitInventorySkill grant the hire kit and
// learnCompanionProfession make (squadDungeon.ts:2890). Idempotent, so a level-up costs one pass.
// A primary has no trained rank below level 5, so a companion hired at 1-4 left the inn with no
// pick, knife or rod and never got one: their skinning was real and every hide was lost.
export function syncCompanionProfessionTools(
  comp: Companion,
  level: number,
  ds: DataStore,
): void {
  const skills = companionSkillMap(comp, level);
  if (Object.keys(skills).length === 0) return;
  const shell = companionCharacter(comp, level, ds);
  shell.skills = skills;
  comp.bags = initInventorySkill(shell, comp.bags ?? emptyInventory(), ds);
}
