// Who walks into an instance from the companions you own. The raid template is a recipe of class
// and role seats, not a second roster: this matches those seats against the squad and bench.

import { CLASS } from '../../data/schema.ts';
import {
  ensureClassSeat,
  instanceWantsWaterMage,
  raidRoleQuota,
  type RaidSeat,
} from './raidComp.ts';
import { maxCompanionsFor, type SquadRole } from '../bots/squad.ts';

export interface RosterPickBody {
  id: string;
  cls: number;
  role: SquadRole;
  level: number;
}

/** 5-man is 1 tank / 1 healer / rest dps. Larger sizes use the raid quota. */
export function instanceRoleQuota(size: number): { tanks: number; healers: number; dps: number } {
  const n = Math.max(1, Math.floor(size));
  if (n <= 5) {
    const tanks = Math.min(1, n);
    const healers = Math.min(1, Math.max(0, n - tanks));
    return { tanks, healers, dps: Math.max(0, n - tanks - healers) };
  }
  return raidRoleQuota(n);
}

function better(a: RosterPickBody, b: RosterPickBody): boolean {
  return a.level !== b.level ? a.level > b.level : a.id.localeCompare(b.id) < 0;
}

function takeBest(
  pool: readonly RosterPickBody[],
  taken: ReadonlySet<string>,
  pred: (c: RosterPickBody) => boolean,
): RosterPickBody | undefined {
  let best: RosterPickBody | undefined;
  for (const c of pool) {
    if (taken.has(c.id) || !pred(c)) continue;
    if (!best || better(c, best)) best = c;
  }
  return best;
}

function seatsFromQuota(
  quota: { tanks: number; healers: number; dps: number },
  playerRole: SquadRole,
): RaidSeat[] {
  const want = {
    tanks: quota.tanks,
    healers: quota.healers,
    dps: quota.dps,
  };
  if (playerRole === 'tank') want.tanks = Math.max(0, want.tanks - 1);
  else if (playerRole === 'healer') want.healers = Math.max(0, want.healers - 1);
  else want.dps = Math.max(0, want.dps - 1);
  const out: RaidSeat[] = [];
  for (let i = 0; i < want.tanks; i++) out.push({ cls: 0, role: 'tank' });
  for (let i = 0; i < want.healers; i++) out.push({ cls: 0, role: 'healer' });
  for (let i = 0; i < want.dps; i++) out.push({ cls: 0, role: 'dps' });
  return out;
}

function swapInClass(
  ids: string[],
  owned: readonly RosterPickBody[],
  cls: number,
  cap: number,
): string[] {
  if (ids.some((id) => owned.find((c) => c.id === id)?.cls === cls)) return ids;
  const mage = takeBest(owned, new Set(ids), (c) => c.cls === cls);
  if (!mage) return ids;
  if (ids.length < cap) return [...ids, mage.id];
  const byId = new Map(owned.map((c) => [c.id, c]));
  // Drop the lowest-level DPS who is not that class.
  let worst = -1;
  let worstLevel = Infinity;
  for (let i = ids.length - 1; i >= 0; i--) {
    const c = byId.get(ids[i]!);
    if (!c || c.role !== 'dps' || c.cls === cls) continue;
    if (c.level <= worstLevel) {
      worst = i;
      worstLevel = c.level;
    }
  }
  if (worst < 0) return ids;
  const out = ids.slice();
  out[worst] = mage.id;
  return out;
}

// Pick up to `cap` owned companions. With the raid template, match class and role, then class,
// then role; without it, a role quota. UBRS still swaps a DPS for an owned mage.
export function fillOwnedInstanceRoster(args: {
  dungeonId: string;
  /** Companion seats — instance maxPlayers minus the player. */
  cap: number;
  owned: readonly RosterPickBody[];
  playerCls: number;
  playerRole: SquadRole;
  /** Template companion seats. Empty/omitted → role quota. */
  seats?: readonly RaidSeat[] | null;
}): string[] {
  const cap = Math.max(0, Math.floor(args.cap));
  if (cap <= 0 || !args.owned.length) return [];
  const wantMage = instanceWantsWaterMage(args.dungeonId);
  let seats: RaidSeat[] = args.seats && args.seats.length
    ? [...args.seats]
    : seatsFromQuota(instanceRoleQuota(cap + 1), args.playerRole);
  if (wantMage) seats = ensureClassSeat(seats, CLASS.MAGE, args.playerCls);

  const taken = new Set<string>();
  const ids: string[] = [];
  const take = (c: RosterPickBody | undefined): void => {
    if (!c || taken.has(c.id) || ids.length >= cap) return;
    taken.add(c.id);
    ids.push(c.id);
  };

  for (const seat of seats) {
    if (ids.length >= cap) break;
    if (seat.cls > 0) {
      take(
        takeBest(args.owned, taken, (c) => c.cls === seat.cls && c.role === seat.role)
        ?? takeBest(args.owned, taken, (c) => c.cls === seat.cls)
        ?? takeBest(args.owned, taken, (c) => c.role === seat.role),
      );
    } else {
      take(takeBest(args.owned, taken, (c) => c.role === seat.role));
    }
  }
  while (ids.length < cap) {
    const next = takeBest(args.owned, taken, () => true);
    if (!next) break;
    take(next);
  }
  if (wantMage && args.playerCls !== CLASS.MAGE) {
    return swapInClass(ids, args.owned, CLASS.MAGE, cap);
  }
  return ids;
}

/** Cap and de-dupe a hand-edited lineup against the owned set. */
export function clampRosterPicks(
  ids: readonly string[],
  ownedIds: ReadonlySet<string>,
  cap: number,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (out.length >= cap) break;
    if (!ownedIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Player-count sizes a raid lineup can be built for. Companion seats = size − 1. */
export const RAID_LINEUP_SIZES = [10, 20, 40] as const;
export type RaidLineupSize = (typeof RAID_LINEUP_SIZES)[number];

export function isRaidLineupSize(n: number): n is RaidLineupSize {
  return (RAID_LINEUP_SIZES as readonly number[]).includes(n);
}

/** Companion seats for a 10/20/40-man raid lineup. Cite: squad.ts maxCompanionsFor. */
export function raidLineupCap(size: number): number {
  return maxCompanionsFor(size);
}

// Who walks in from owned companions: a per-dungeon door pick wins, else a raid-sized enter uses
// the Companions-tab lineup. Null means auto — party for a 5-man, role quota for a raid.
export function resolveOwnedLineup(args: {
  dungeonId: string;
  cap: number;
  asRaid: boolean;
  ownedIds: ReadonlySet<string>;
  dungeonPicks?: { dungeonId: string; ids: readonly string[] } | null;
  raidLineup?: { size: number; ids: readonly string[] } | null;
}): string[] | null {
  const dungeon = args.dungeonPicks;
  if (dungeon && dungeon.dungeonId === args.dungeonId) {
    return clampRosterPicks(dungeon.ids, args.ownedIds, args.cap);
  }
  if (args.asRaid && args.raidLineup) {
    return clampRosterPicks(args.raidLineup.ids, args.ownedIds, args.cap);
  }
  return null;
}
