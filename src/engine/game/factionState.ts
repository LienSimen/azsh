// Reputation-pane list state: At War, Inactive and the watched faction, plus the derived at-war set the
// interaction gates read. The rules live in domain/creature/reputation.ts; this owns the mutation.

import type { DataStore } from '../../data/dataStore.ts';
import type { Character } from '../../domain/character/character.ts';
import type { ActionResult } from './types.ts';
import {
  FACTION_FLAG,
  atWarFactionIds,
  canToggleAtWar,
  canToggleInactive,
  effectiveFactionFlags,
  isFactionVisible,
  setFactionFlagBit,
} from '../../domain/creature/reputation.ts';

export interface FactionStateApi {
  atWarFactions(): ReadonlySet<number>;
  setFactionAtWar(factionId: number, on: boolean): ActionResult<{ atWar: boolean }>;
  setFactionInactive(factionId: number, on: boolean): ActionResult<{ inactive: boolean }>;
  setWatchedFaction(factionId: number): ActionResult<{ watched: number }>;
}

export interface FactionStateDeps {
  ds: DataStore;
  char: () => Character;
  setChar: (next: Character) => void;
  log: (line: string) => void;
}

// Bind the reputation-pane mutators to a game's character slot. The at-war set is memoized on the
// identity of the two maps it derives from, which are replaced wholesale, so a stale set is impossible.
export function createFactionStateApi(deps: FactionStateDeps): FactionStateApi {
  const { ds, char, setChar, log } = deps;
  let cache: {
    reps: Character['reputations'];
    flags: Character['factionFlags'];
    set: ReadonlySet<number>;
  } | null = null;

  const atWarFactions = (): ReadonlySet<number> => {
    const c = char();
    if (cache && cache.reps === c.reputations && cache.flags === c.factionFlags) return cache.set;
    const set = atWarFactionIds(ds.factions(), c.reputations, c.factionFlags, c.race, c.cls);
    cache = { reps: c.reputations, flags: c.factionFlags, set };
    return set;
  };

  /** Flip one FACTION_FLAG bit on the character, seeding from the FactionDef defaults. */
  const writeFlag = (factionId: number, bit: number, on: boolean): void => {
    const c = char();
    const fac = ds.faction(factionId)!;
    setChar({ ...c, factionFlags: setFactionFlagBit(c.factionFlags, fac, bit, on, c.race, c.cls) });
  };

  return {
    atWarFactions,

    setFactionAtWar(factionId, on) {
      const c = char();
      const fac = ds.faction(factionId);
      if (!fac) return { ok: false, reason: 'Unknown faction' };
      if (!canToggleAtWar(effectiveFactionFlags(fac, c.factionFlags, c.race, c.cls), on)) {
        return {
          ok: false,
          reason: on
            ? `You cannot declare war on ${fac.name}.`
            : `You cannot change your stance toward ${fac.name}.`,
        };
      }
      writeFlag(factionId, FACTION_FLAG.AT_WAR, on);
      log(on ? `You are now at war with ${fac.name}.` : `You are now at peace with ${fac.name}.`);
      return { ok: true, atWar: on };
    },

    setFactionInactive(factionId, on) {
      const c = char();
      const fac = ds.faction(factionId);
      if (!fac) return { ok: false, reason: 'Unknown faction' };
      if (!canToggleInactive(effectiveFactionFlags(fac, c.factionFlags, c.race, c.cls), on)) {
        return { ok: false, reason: `${fac.name} cannot be made inactive.` };
      }
      writeFlag(factionId, FACTION_FLAG.INACTIVE, on);
      // A parked faction can't stay on the XP bar (the client drops the watch too).
      if (on && char().watchedFaction === factionId) {
        setChar({ ...char(), watchedFaction: undefined });
      }
      return { ok: true, inactive: on };
    },

    setWatchedFaction(factionId) {
      const c = char();
      if (!factionId) {
        setChar({ ...c, watchedFaction: undefined });
        return { ok: true, watched: 0 };
      }
      const fac = ds.faction(factionId);
      if (!fac) return { ok: false, reason: 'Unknown faction' };
      if (!isFactionVisible(fac, c.reputations, c.factionFlags, c.race, c.cls)) {
        return { ok: false, reason: `You have no standing with ${fac.name}.` };
      }
      // Same button toggles off (the client's checkbox).
      const next = c.watchedFaction === factionId ? undefined : factionId;
      setChar({ ...c, watchedFaction: next });
      return { ok: true, watched: next ?? 0 };
    },
  };
}
