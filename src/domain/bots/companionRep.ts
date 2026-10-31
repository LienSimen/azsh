// Companion kill reputation — the same RewardReputation(Creature) math as the player, against
// THIS companion's race, class, level and standing. Cite: Player.cpp ~6373.

import type { DataStore } from '../../data/dataStore.ts';
import type { CreatureDef } from '../../data/schema.ts';
import type { Character } from '../character/character.ts';
import { factionOf, racialSpells } from '../character/races.ts';
import {
  reputationAuraModFromSpells,
  rewardKillReputation,
  type RewardApplied,
} from '../creature/reputation.ts';
import {
  companionCharacter,
  companionLevel,
  companionSpellbook,
  type Companion,
} from './squad.ts';

export function writeCompanionStandings(comp: Companion, char: Character): void {
  if (char.reputations) comp.reputations = { ...char.reputations };
  if (char.factionFlags) comp.factionFlags = { ...char.factionFlags };
}

// Personal kill reputation for one active-squad companion vs a creature. No-op when the creature has no
// onKillRep. Does not consult the player's map.
export function applyCompanionKillReputation(
  comp: Companion,
  cdef: CreatureDef,
  playerLevel: number,
  ds: DataStore,
  mobLevel?: number,
  log?: (msg: string) => void,
): { applied: RewardApplied[] } {
  if (!cdef.onKillRep) return { applied: [] };
  const lvl = companionLevel(comp, playerLevel);
  const char = companionCharacter(comp, lvl, ds);
  const team = factionOf(ds, comp.race) ?? 'alliance';
  const book = companionSpellbook(comp, lvl, ds);
  const repSpells = [
    ...racialSpells(ds, comp.race),
    ...(book.known ?? [])
      .map((id) => ds.spell(id))
      .filter((s): s is NonNullable<typeof s> => !!s?.passive),
  ];
  const repMod = reputationAuraModFromSpells(repSpells);
  const result = rewardKillReputation({
    onKillRep: cdef.onKillRep,
    playerTeam: team,
    playerLevel: lvl,
    creatureLevel: mobLevel ?? cdef.level,
    raceId: char.race,
    classId: char.cls,
    reputations: char.reputations ?? {},
    factions: ds.factions(),
    rates: ds.reputationRates(),
    spillover: ds.reputationSpillover(),
    flags: char.factionFlags ?? {},
    ...(repMod ? { repMod } : {}),
  });
  writeCompanionStandings(comp, {
    ...char,
    reputations: result.reputations,
    factionFlags: result.flags ?? char.factionFlags,
  });
  if (log) {
    for (const a of result.applied) {
      if (a.delta === 0) continue;
      const name = ds.faction(a.faction)?.name ?? `faction ${a.faction}`;
      const sign = a.delta > 0 ? '+' : '';
      log(`${comp.name} ${sign}${a.delta} reputation with ${name}`);
    }
  }
  return { applied: result.applied };
}
