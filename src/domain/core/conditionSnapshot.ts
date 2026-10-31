// The PLAYER half of a ConditionSnapshot in ONE place. The evaluator reports `unsupported` when a
// supplier is absent, so an omitted field silently turns content off. Cite: Conditions.cpp Meets.

import type { Character } from '../character/character.ts';
import type { DataStore } from '../../data/dataStore.ts';
import type { SpellBook } from '../character/spellbook.ts';
import { SKILL_LINE_BY_ID } from '../../data/schema/profession.ts';
import { activeEventIds, activeHolidayIds } from '../world/gameEvents.ts';
import { calculateHonorRank } from '../run/honor.ts';
import { factionOf } from '../character/races.ts';
import { getRank } from '../creature/reputation.ts';
import { professionSkillValue } from '../professions/professions.ts';

/** SharedDefines.h Team. Cite: Conditions.cpp:206-214 CONDITION_TEAM. */
export const TEAM_ALLIANCE = 469;
export const TEAM_HORDE = 67;

/** Every skill id the trade-line store can answer for, so a caller can enumerate them. */
export const TRADE_SKILL_IDS: readonly number[] = Object.freeze(
  Object.keys(SKILL_LINE_BY_ID).map(Number),
);

// GetSkillValueBase over BOTH stores: combatSkills by id and the trade lines by name. Undefined
// means !HasSkill, which must stay distinct from a trained 0. Cite: Conditions.cpp:377-385.
export function playerSkillValue(
  char: Character,
  ds?: DataStore | null,
  sb?: SpellBook | null,
): (skillId: number) => number | undefined {
  return (skillId: number): number | undefined => {
    const combat = (char.combatSkills ?? {})[skillId];
    if (combat) return combat.current;
    const line = SKILL_LINE_BY_ID[skillId];
    if (!line) return undefined;
    return professionSkillValue(char, line, ds, sb);
  };
}

// CONDITION_RACE_CLASS masks. The DB stores 1 << (race - 1), so race or class 0 has no bit and
// must stay undefined — mask 1 would answer "yes, human" for every unset character.
export function playerRaceClassMasks(
  char: Pick<Character, 'race' | 'cls'>,
): { raceMask?: number; classMask?: number } {
  const out: { raceMask?: number; classMask?: number } = {};
  if ((char.race | 0) > 0) out.raceMask = 1 << ((char.race | 0) - 1);
  if ((char.cls | 0) > 0) out.classMask = 1 << ((char.cls | 0) - 1);
  return out;
}

/** Player-derived suppliers. Context (floor bodies, waypoints, instance data) is the caller's. */
export interface PlayerConditionFacts {
  level: number;
  team: number;
  gender: number;
  raceMask?: number;
  classMask?: number;
  knownSpells: number[];
  reputationRank: (factionId: number) => number;
  skillValue: (skillId: number) => number | undefined;
  activeEvents: number[];
  activeHolidays: number[];
  pvpRank: number;
}

/** Everything the evaluator can learn from the character sheet alone; spread it into a snapshot.
 *  @param nowMs game-event clock, passed by the caller so this stays pure. */
export function playerConditionFacts(
  ds: DataStore,
  char: Character,
  spellbook: SpellBook | null | undefined,
  nowMs: number,
): PlayerConditionFacts {
  const events = ds.gameEvents();
  return {
    level: char.level,
    team: factionOf(ds, char.race) === 'horde' ? TEAM_HORDE : TEAM_ALLIANCE,
    // 0 male / 1 female, the convention Conditions.cpp:373-376 compares against.
    gender: char.gender ?? 0,
    ...playerRaceClassMasks(char),
    knownSpells: [...(spellbook?.known ?? [])],
    // Rank, not standing: CONDITION_REPUTATION_RANK_* compares ReputationMgr GetRank.
    reputationRank: (factionId: number): number => {
      const fac = ds.faction(factionId);
      if (!fac) return 0;
      return getRank(char.reputations, fac, char.race, char.cls);
    },
    skillValue: playerSkillValue(char, ds, spellbook),
    activeEvents: [...activeEventIds(events, nowMs)],
    activeHolidays: [...activeHolidayIds(events, nowMs)],
    pvpRank: calculateHonorRank(char.honor?.rp ?? 0).rank,
  };
}
