// Party healthstone upkeep — the same conjure-and-trade the dungeon runs before a pull
// (squadDungeon.ts:741), on a timer instead of once, so a stone that got eaten is replaced and a
// party that never zoned into an instance gets one at all. Warlock.cpp:107-174.

import type { DataStore } from '../../data/dataStore.ts';
import {
  companionCharacter, companionLevel, companionSpellbook,
} from '../../domain/bots/squad.ts';
import { healthstoneRunLog, runPrePullHealthstones, stoneHolder, type StoneHolder } from './prePullHealthstones.ts';
import type { HealthstoneRunResult } from './prePullHealthstones.ts';
import type { GameState } from './types.ts';

/** How often one party re-checks its stones. A conjure is instant, the walk between them is not. */
export const HEALTHSTONE_UPKEEP_MS = 30_000;

/** The player and every squad companion as stone holders, reading and writing their real bags. */
export function partyStoneHolders(state: GameState, ds: DataStore): StoneHolder[] {
  return [
    stoneHolder({
      name: state.char.name,
      char: state.char,
      role: state.squadRole ?? 'dps',
      specName: state.rotation?.autoSig?.spec ?? null,
      knownSpellIds: state.spellbook.known,
      auraSpellIds: (state.char.activeAuras ?? []).map((a) => a.spellId),
      read: () => state.inventory,
      write: (inv) => { state.inventory = inv; },
    }),
    ...(state.squad ?? []).map((c) => {
      const lvl = companionLevel(c, state.char.level);
      return stoneHolder({
        name: c.name,
        char: companionCharacter(c, lvl, ds),
        role: c.role,
        specName: c.rotation?.autoSig?.spec ?? ds.botSpecs(c.cls)[c.specIdx ?? 0]?.name ?? null,
        knownSpellIds: companionSpellbook(c, lvl, ds).known,
        auraSpellIds: (c.prePullAuras ?? []).map((a) => a.spellId),
        read: () => c.bags,
        write: (inv) => { c.bags = inv; },
      });
    }),
  ];
}

/**
 * Top every party member back up to one healthstone. Silent when nobody is short or no warlock can
 * pay — only a run that actually handed something over writes a feed line.
 */
export function runHealthstoneUpkeep(
  state: GameState,
  ds: DataStore,
  log: (msg: string) => void,
): HealthstoneRunResult {
  const result = runPrePullHealthstones(partyStoneHolders(state, ds), ds, state.char.name);
  if (result.handouts.length > 0) {
    for (const line of healthstoneRunLog(result, ds, state.char.name)) log(line);
  }
  return result;
}
