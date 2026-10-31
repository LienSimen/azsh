// Race and faction rules, derived entirely from the baked RaceDef data — the race/class matrix and
// racials come from playercreateinfo. Faction is derived from race, so it needs no save migration.

import type { DataStore } from '../../data/dataStore.ts';
import type { Faction, RaceDef, SpellDef } from '../../data/schema.ts';

/** The character's faction, derived from its race (undefined if the race is unknown). */
export function factionOf(ds: DataStore, race: number): Faction | undefined {
  return ds.race(race)?.faction;
}

/** Class ids this race may roll — the restriction matrix, straight from the data. */
export function classesForRace(ds: DataStore, race: number): number[] {
  return ds.race(race)?.classes ?? [];
}

/** Whether a race/class combination is allowed (empty race list => nothing allowed). */
export function canRoll(ds: DataStore, race: number, cls: number): boolean {
  return classesForRace(ds, race).includes(cls);
}

/** Races grouped by faction, preserving the data's race order — for the create screen. */
export function racesByFaction(ds: DataStore): Record<Faction, RaceDef[]> {
  const out: Record<Faction, RaceDef[]> = { alliance: [], horde: [] };
  for (const r of ds.races()) out[r.faction]?.push(r);
  return out;
}

/** The racial-ability spells a race is granted at creation (resolved to SpellDefs). */
export function racialSpells(ds: DataStore, race: number): SpellDef[] {
  const ids = ds.race(race)?.racials ?? [];
  return ids.map((id) => ds.spell(id)).filter((s): s is SpellDef => !!s);
}

/** True if two races sit on opposing factions (hostile in the shared world / PvP). */
export function areHostile(ds: DataStore, raceA: number, raceB: number): boolean {
  const a = factionOf(ds, raceA);
  const b = factionOf(ds, raceB);
  return !!a && !!b && a !== b;
}
