import type { DataStore } from '../../../data/dataStore.ts';
import type { InstanceDef } from '../../../data/schema.ts';
import {
  MAX_COMPANIONS, maxCompanionsFor, stableIdHash, type Companion,
} from '../../../domain/bots/squad.ts';
import { DEFAULT_HIRE_GEAR_PROFILE } from '../../../domain/bots/botGear.ts';
import { generateBgBots } from '../../../domain/bg/bgRoster.ts';
import { isAvInstance } from '../../../domain/bg/avInstanceScore.ts';
import type { BgTeam } from '../../../domain/bg/types.ts';
import { raidRoleQuota } from '../../../domain/raid/raidComp.ts';
import { resolveOwnedLineup } from '../../../domain/raid/instanceRoster.ts';
import { hashSeed } from '../../core/rng.ts';
import { reconcileGamePartyAuras } from '../partyAuras.ts';
import type { GameState } from '../types.ts';

/** Where a seated body came back from on leave. `fill` came from nowhere and goes back there. */
export type SeatFrom = 'bench' | 'raid' | 'fill';

export function commitSeating(
  state: GameState,
  ds: DataStore,
  log: (msg: string) => void,
  def: InstanceDef,
  cap: number,
  squad: Companion[],
  bench: Record<string, Companion>,
  devRoster: Record<string, Companion>,
  promoted: { id: string; from: SeatFrom }[],
  benched: Companion[],
  force: boolean,
): void {
  if (!force && !promoted.length && !benched.length) return;
  state.squad = squad;
  state.botRoster = bench;
  if (state.raidRoster?.dungeonId === def.id) {
    state.raidRoster = { ...state.raidRoster, members: devRoster };
  }
  state.raidParty = { dungeonId: def.id, promoted, benched };
  reconcileGamePartyAuras(state, ds);
  if (benched.length) log(`${benched.length} stand down - ${def.name} seats ${cap + 1}.`);
  if (!promoted.length) return;
  const fromRaid = promoted.filter((p) => p.from === 'raid').length;
  const fromFill = promoted.filter((p) => p.from === 'fill').length;
  const fromPicks = promoted.filter((p) => p.from === 'bench').length;
  log(fromRaid
    ? `${promoted.length} join for the raid - ${fromRaid} from the test roster (${squad.length}/${cap}).`
    : fromFill
      ? `${promoted.length} join for ${def.name} - ${fromFill} from the queue (${squad.length + 1}/${cap + 1}).`
      : `${fromPicks} companions join from your roster (${squad.length}/${cap}).`);
}

/**
 * Alterac Valley is a 40-man BATTLEGROUND: the QUEUE fills a side, never your roster, so two
 * companions gave the valley a 3-man side against a 40-man push. Whatever the owned pool cannot
 * seat, generated pvp bodies do — the fill bgRoster.ts buildFriendlySeats already puts on your own
 * side (generateBgBots), to AV_DATA.teamSize. The door's own Roster pick stops it: that IS a roster.
 */
function queueFill(
  state: GameState,
  ds: DataStore,
  def: InstanceDef,
  cap: number,
  squad: Companion[],
  promoted: { id: string; from: SeatFrom }[],
): void {
  // The one battleground that runs on the instance surface. A raid's empty seats are yours to fill.
  if (!isAvInstance(def.id)) return;
  if (state.instanceRoster?.dungeonId === def.id) return;
  const want = cap - squad.length;
  if (want <= 0) return;
  const team: BgTeam = def.wing === 'horde' ? 'horde' : 'alliance';
  const quota = raidRoleQuota(def.maxPlayers ?? cap + 1);
  const healers = (state.squadRole === 'healer' ? 1 : 0)
    + squad.filter((c) => c.role === 'healer').length;
  const seated = new Set(squad.map((c) => c.id));
  const bots = generateBgBots(
    ds, team, want, state.char.level, DEFAULT_HIRE_GEAR_PROFILE,
    hashSeed(stableIdHash(def.id), cap), Math.max(0, quota.healers - healers), true,
  );
  for (const c of bots) {
    if (squad.length >= cap || seated.has(c.id)) continue;
    seated.add(c.id);
    squad.push(c);
    promoted.push({ id: c.id, from: 'fill' });
  }
}

export function seatPartyForRun(
  state: GameState,
  ds: DataStore,
  log: (msg: string) => void,
  def: InstanceDef,
  asRaid: boolean,
): void {
  const cap = asRaid ? maxCompanionsFor(def.maxPlayers) : MAX_COMPANIONS;
  const squad = [...(state.squad ?? [])];
  const bench = { ...(state.botRoster ?? {}) };
  const benched: Companion[] = [];
  const promoted: { id: string; from: SeatFrom }[] = [];
  // The dev raid roster fields the raid only when it was built FOR this raid; otherwise the raid is
  // fought by the companions you own. A roster built for another tier is not silently reused.
  const devRoster = asRaid && state.raidRoster?.dungeonId === def.id
    ? { ...state.raidRoster.members }
    : {};

  const owned = new Map<string, Companion>();
  for (const c of squad) owned.set(c.id, c);
  for (const [id, c] of Object.entries(bench)) owned.set(id, c);

  const picks = resolveOwnedLineup({
    dungeonId: def.id,
    cap,
    asRaid,
    ownedIds: new Set(owned.keys()),
    dungeonPicks: state.instanceRoster,
    raidLineup: state.raidLineup,
  });

  if (picks != null) {
    const want = new Set(picks);
    for (const c of squad) if (!want.has(c.id)) benched.push(c);
    squad.length = 0;
    for (const id of picks) {
      const c = owned.get(id);
      if (!c) continue;
      squad.push(c);
      if (bench[id]) {
        delete bench[id];
        promoted.push({ id, from: 'bench' });
      }
    }
    // A hand pick is the whole lineup — leftover seats stay empty (Fill if you want more). A
    // battleground is the exception: the queue tops the side up unless the pick was made AT its door.
    queueFill(state, ds, def, cap, squad, promoted);
    commitSeating(state, ds, log, def, cap, squad, bench, devRoster, promoted, benched, true);
    return;
  } else if (squad.length > cap) {
    // The cap is a CAP, not a target: this only ever topped a squad up, so a squad already past it
    // walked straight through — which is how a 40-man entered a sourced 10-man UBRS.
    const keepBase = Math.min(MAX_COMPANIONS, cap);
    const rest = squad.slice(keepBase)
      .sort((a, b) => (b.level ?? 1) - (a.level ?? 1) || a.id.localeCompare(b.id));
    benched.push(...rest.slice(cap - keepBase));
    squad.length = 0;
    squad.push(...(state.squad ?? []).slice(0, keepBase), ...rest.slice(0, cap - keepBase));
  }

  if (!asRaid) {
    // Party entry with no picks only trims — it never pulls anyone off a bench.
    commitSeating(state, ds, log, def, cap, squad, bench, devRoster, promoted, benched, false);
    return;
  }
  if (squad.length >= cap) {
    commitSeating(state, ds, log, def, cap, squad, bench, devRoster, promoted, benched, false);
    return;
  }
  // Fill the raid's ROLE QUOTA first, then top up, taking the HIGHEST level within a role: roster key
  // order promoted whoever was hired first, so level 1-10 bodies outranked real companions.
  const quota = raidRoleQuota(def.maxPlayers ?? cap + 1);
  const need: Record<string, number> = {
    tank: quota.tanks,
    healer: quota.healers,
    dps: quota.dps,
  };
  for (const c of squad) need[c.role] = Math.max(0, (need[c.role] ?? 0) - 1);
  const taken = new Set(squad.map((c) => c.id));
  const pool = [
    ...Object.entries(devRoster).map(([id, comp]) => ({ id, from: 'raid' as const, comp })),
    ...Object.entries(bench).map(([id, comp]) => ({ id, from: 'bench' as const, comp })),
  ].sort((a, b) =>
    (a.from === b.from ? 0 : a.from === 'raid' ? -1 : 1)
    || (b.comp.level ?? 1) - (a.comp.level ?? 1)
    || a.id.localeCompare(b.id));
  const take = (row: (typeof pool)[number]): void => {
    squad.push(row.comp);
    taken.add(row.id);
    if (row.from === 'raid') delete devRoster[row.id];
    else delete bench[row.id];
    promoted.push({ id: row.id, from: row.from });
  };
  for (const pass of ['tank', 'healer', 'dps'] as const) {
    for (const row of pool) {
      if (squad.length >= cap || (need[pass] ?? 0) <= 0) break;
      if (taken.has(row.id) || row.comp.role !== pass) continue;
      need[pass] = (need[pass] ?? 0) - 1;
      take(row);
    }
  }
  for (const row of pool) {
    if (squad.length >= cap) break;
    if (taken.has(row.id)) continue;
    take(row);
  }
  // Owned bodies first, then the battleground queue for the seats they left.
  queueFill(state, ds, def, cap, squad, promoted);
  commitSeating(state, ds, log, def, cap, squad, bench, devRoster, promoted, benched, false);
}
