/**
 * Undo instance seating. Promoted bodies return to bench / test roster; whoever stood down to fit
 * the cap rejoins the active party. A `fill` body is a battleground merc the queue generated for
 * one match (squadDungeonSeating.ts queueFill) - it belongs to no roster, so it is dropped.
 */

import type { DataStore } from '../../data/dataStore.ts';
import type { Companion } from '../../domain/bots/squad.ts';
import { reconcileGamePartyAuras } from './partyAuras.ts';
import type { GameState } from './types.ts';

export function restoreRaidPartySeating(state: GameState, ds: DataStore): void {
  const rec = state.raidParty;
  if (!rec) return;
  const back = new Map(rec.promoted.map((p) => [p.id, p.from]));
  const bench = { ...(state.botRoster ?? {}) };
  const devMembers = { ...(state.raidRoster?.members ?? {}) };
  const squad: Companion[] = [];
  for (const c of state.squad ?? []) {
    const from = back.get(c.id);
    if (from === 'raid') devMembers[c.id] = c;
    else if (from === 'bench') bench[c.id] = c;
    else if (from === 'fill') continue;
    else squad.push(c);
  }
  for (const c of rec.benched) if (!squad.some((s) => s.id === c.id)) squad.push(c);
  state.squad = squad;
  state.botRoster = bench;
  if (state.raidRoster) state.raidRoster = { ...state.raidRoster, members: devMembers };
  delete state.raidParty;
  reconcileGamePartyAuras(state, ds);
}
