// Quest farm reverse-lookup filters — drop the absurd creature rows reverse-loot invents for
// low-level itemTargets. Level band only; zone preference over-scrubbed multi-item farms.

import { HUNTABLE_LEVEL_HI_SLACK } from '../data/raidInstanceCreatures.mjs';

export { HUNTABLE_LEVEL_HI_SLACK as FARM_LEVEL_HI_SLACK };

/** Quest level used as the farm band anchor (questLevel, else minLevel). */
export function questFarmLevelAnchor(questLevel, minLevel) {
  const ql = questLevel | 0;
  if (ql > 0) return ql;
  return minLevel | 0;
}

// Whether a creature level is a sane farm hint for this quest's band. High side only: drop elites
// 15+ above the quest. Low-level droppers stay, as valid "go back to the starter zone" farms.
export function creatureFitsQuestFarmLevel(creatureLevel, questLevel, minLevel) {
  const cl = creatureLevel | 0;
  if (cl <= 0) return false;
  const anchor = questFarmLevelAnchor(questLevel, minLevel);
  if (anchor <= 0) return true;
  if (cl > anchor + HUNTABLE_LEVEL_HI_SLACK) return false;
  return true;
}

/** Farm entries for one quest, filtered by level band; empty means the GO / reward / vendor path.
 *  @param {Iterable<number>} farmEntries @param {{questLevel?: number, minLevel?: number, levelOf: (e: number) => number}} opts @returns {number[]} */
export function filterQuestFarm(farmEntries, opts) {
  const farm = [];
  const seen = new Set();
  for (const raw of farmEntries ?? []) {
    const ce = raw | 0;
    if (ce <= 0 || seen.has(ce)) continue;
    seen.add(ce);
    farm.push(ce);
  }
  if (!farm.length) return [];

  return farm.filter((ce) =>
    creatureFitsQuestFarmLevel(opts.levelOf(ce), opts.questLevel, opts.minLevel),
  );
}
