// Raid team composition. Sourced here: which classes can hold which role, and the class mix inside
// each role, apportioned from botSpecs.json. NOT sourced: the tank and healer head-counts below.

import type { DataStore } from '../../data/dataStore.ts';
import { CLASS } from '../../data/schema.ts';
import { companionRaceFor, type SquadRole } from '../bots/squad.ts';

export interface RaidSeat {
  cls: number;
  role: SquadRole;
}

export interface RaidRoleQuota {
  tanks: number;
  healers: number;
  dps: number;
}

// One tank per 10 raiders, never fewer than 2 — a main tank plus an off-tank is the floor for any
// encounter with a second body to pick up. Yields 4 at 40, 2 at 20, 2 at 10.
function tanksFor(size: number): number {
  return Math.max(2, Math.round(size / 10));
}

// Healers at 22.5% of the raid: 9 at 40, 5 at 20, 2 at 10. Anchored on bgRoster's shipped 30% and
// stepped down, because a raid fields dedicated tanks that a BG team does not.
function healersFor(size: number): number {
  return Math.max(1, Math.round(size * 0.225));
}

/** Role head-counts for a raid of `size` seats, player included. */
export function raidRoleQuota(size: number): RaidRoleQuota {
  const n = Math.max(1, Math.floor(size));
  const tanks = Math.min(tanksFor(n), n);
  const healers = Math.min(healersFor(n), Math.max(0, n - tanks));
  return { tanks, healers, dps: Math.max(0, n - tanks - healers) };
}

/** Classes this player's faction can field, in ascending class id. */
function factionClasses(ds: DataStore, playerRace: number): number[] {
  const out: number[] = [];
  for (let cls = 1; cls <= 11; cls++) {
    if (cls === 10) continue; // no class 10 in Classic
    if (!ds.botSpecs(cls).length) continue;
    if (companionRaceFor(ds, playerRace, cls) == null) continue;
    out.push(cls);
  }
  return out;
}

/** How many premade builds of `role` this class ships — the apportionment weight. */
function specWeight(ds: DataStore, cls: number, role: SquadRole): number {
  return ds.botSpecs(cls).filter((s) => s.role === role).length;
}

// Largest-remainder apportionment of `total` seats across `weights`, so the class mix follows the
// sourced spec counts and still sums exactly. Ties break on weight then class id — no RNG.
function apportion(total: number, weights: { cls: number; w: number }[]): Map<number, number> {
  const out = new Map<number, number>();
  const sum = weights.reduce((a, b) => a + b.w, 0);
  if (total <= 0 || sum <= 0) return out;
  const rows = weights.map((r) => {
    const exact = (total * r.w) / sum;
    const floor = Math.floor(exact);
    out.set(r.cls, floor);
    return { cls: r.cls, w: r.w, rem: exact - floor };
  });
  let left = total - rows.reduce((a, b) => a + (out.get(b.cls) ?? 0), 0);
  rows.sort((a, b) => b.rem - a.rem || b.w - a.w || a.cls - b.cls);
  for (let i = 0; left > 0; i++, left--) {
    const r = rows[i % rows.length]!;
    out.set(r.cls, (out.get(r.cls) ?? 0) + 1);
  }
  return out;
}

/** Seats of one role, class-apportioned by sourced spec counts. Empty when nothing can fill it. */
function seatsForRole(ds: DataStore, classes: number[], role: SquadRole, count: number): RaidSeat[] {
  const weights = classes
    .map((cls) => ({ cls, w: specWeight(ds, cls, role) }))
    .filter((r) => r.w > 0);
  if (!weights.length) return [];
  const alloc = apportion(count, weights);
  const out: RaidSeat[] = [];
  for (const { cls } of weights) {
    for (let i = 0; i < (alloc.get(cls) ?? 0); i++) out.push({ cls, role });
  }
  return out;
}

// The companion seats for a raid of `size`, with the player's own role already deducted. Tank,
// healer and dps are interleaved, so a roster cap part-way still leaves a balanced subset.
export function raidCompanionSeats(args: {
  ds: DataStore;
  playerRace: number;
  playerRole?: SquadRole;
  size: number;
}): RaidSeat[] {
  const { ds, playerRace, playerRole = 'dps', size } = args;
  const quota = raidRoleQuota(size);
  const classes = factionClasses(ds, playerRace);
  if (!classes.length) return [];

  const key = playerRole === 'tank' ? 'tanks' : playerRole === 'healer' ? 'healers' : 'dps';
  const want: RaidRoleQuota = { ...quota, [key]: Math.max(0, quota[key] - 1) };

  const tanks = seatsForRole(ds, classes, 'tank', want.tanks);
  const healers = seatsForRole(ds, classes, 'healer', want.healers);
  // A role no class can fill spills into dps rather than shrinking the raid.
  const shortfall = (want.tanks - tanks.length) + (want.healers - healers.length);
  const dps = seatsForRole(ds, classes, 'dps', want.dps + shortfall);

  const out: RaidSeat[] = [];
  const lanes = [tanks, healers, dps];
  for (let i = 0; out.length < tanks.length + healers.length + dps.length; i++) {
    for (const lane of lanes) if (i < lane.length) out.push(lane[i]!);
  }
  return out;
}

/** Members per raid subgroup — the Classic party cap. Cite: Group.h MAX_GROUP_SIZE. */
export const RAID_SUBGROUP_SIZE = 5;

/** Subgroups a raid can hold: 8 × 5 = the 40-man cap. Cite: Group.h MAX_RAID_SIZE 40. */
export const MAX_RAID_SUBGROUPS = 8;

// How many group boxes a roster of `members` has — the number the window draws, a drag may address
// and the seating clamps to. One definition, or the window offers a group seating folds away.
export function raidGroupCount(members: number): number {
  const n = Math.max(1, Math.floor(members));
  return Math.min(MAX_RAID_SUBGROUPS, Math.max(1, Math.ceil(n / RAID_SUBGROUP_SIZE)));
}

// 0-based subgroup for seat `n`, dealt round-robin rather than sliced: a role-ordered list sliced
// into fives puts every healer in two groups. Position-only, so a raid uses raidSubgroupPlan.
export function raidSubgroupOfSeat(seat: number, size: number): number {
  const groups = Math.max(1, Math.ceil(Math.max(1, size) / RAID_SUBGROUP_SIZE));
  return Math.max(0, seat | 0) % groups;
}

// Classes that supply a SUBGROUP-ONLY buff at 60, best first. DERIVED by walking each class's
// level-60 kit, not asserted — re-measure with scripts/raids/roster-census.mjs.
export const SUBGROUP_SUPPLY_CLASSES: readonly number[] = [
  CLASS.SHAMAN, CLASS.PALADIN, CLASS.WARRIOR, CLASS.HUNTER, CLASS.MAGE,
];

const SUPPLY_RANK = new Map<number, number>(
  SUBGROUP_SUPPLY_CLASSES.map((c, i): [number, number] => [c, i]),
);

// Tanks seated in group 0 before the rest spill outward — a main tank plus one off-tank, the floor
// tanksFor sets. Two, not the blueprint's three: raidPlan splits camps on subgroup parity.
const MAIN_TANK_GROUP_SEATS = 2;

/** Everything the seating needs to know about a body: what it is, and what it does. */
export interface SubgroupMember {
  cls: number;
  role: SquadRole;
  // Stable identity for a hand-placed seat — PLAYER_SEAT_KEY or Companion.id, never the positional
  // ally_N. A dismissal renumbers every later seat, which would move someone else's drag.
  key?: string;
}

/** The player's own key in a seating override map. */
export const PLAYER_SEAT_KEY = 'player';

// Where the player DRAGGED each body, by SubgroupMember.key. A key with no entry keeps the
// formula's seat, so an override is a correction rather than a hand-authored roster.
export type RaidSeatingOverrides = Readonly<Record<string, number>>;

// Fold hand-placed seats into a formula seating, then repair the 5-per-group cap the drag broke.
// Non-overridden bodies move first, capacity always fits, and ties break on the lower group.
export function applyRaidSeatingOverrides(
  members: readonly SubgroupMember[],
  base: readonly number[],
  overrides: RaidSeatingOverrides | null | undefined,
): number[] {
  const out = members.map((_, i) => base[i] ?? 0);
  if (!overrides) return out;
  const groups = raidGroupCount(members.length);
  const pinned = new Set<number>();
  for (let i = 0; i < members.length; i++) {
    const key = members[i]!.key;
    if (key == null) continue;
    const want = overrides[key];
    if (typeof want !== 'number' || !Number.isFinite(want)) continue;
    out[i] = Math.min(Math.max(Math.floor(want), 0), groups - 1);
    pinned.add(i);
  }
  if (pinned.size === 0) return out;

  const held = (g: number): number[] => {
    const seats: number[] = [];
    for (let i = 0; i < out.length; i++) if (out[i] === g) seats.push(i);
    return seats;
  };
  // Emptiest group, lowest index on a tie - full ones included. Demanding room returned -1 on a roster past
  // `groups x 5`, so a drag there had nowhere to spill and lumped every body it displaced onto one group.
  const roomiest = (): number => {
    let best = 0;
    for (let g = 1; g < groups; g++) if (held(g).length < held(best).length) best = g;
    return best;
  };
  // Bounded: every pass moves one body into a group with strictly fewer members.
  for (let guard = 0; guard < members.length * groups; guard++) {
    let over = -1;
    for (let g = 0; g < groups; g++) {
      if (held(g).length <= RAID_SUBGROUP_SIZE) continue;
      // FULLEST, not first: on a roster past `groups x 5` every group is over the cap, and
      // draining the first one just measured itself against a group as full and stopped.
      if (over < 0 || held(g).length > held(over).length) over = g;
    }
    if (over < 0) break;
    const seats = held(over);
    const loose = seats.filter((i) => !pinned.has(i));
    const evict = (loose.length ? loose : seats).at(-1)!;
    const to = roomiest();
    // Only a move that strictly lowers the fullest group, or a full roster ping-pongs one body.
    if (to === over || held(to).length + 1 >= held(over).length) break;
    out[evict] = to;
  }
  return out;
}

// Composition-aware raid seating: 0-based subgroup per member, player at index 0. Tanks fill group
// 0 to its floor, then one supplier per group, then one healer per group, then the emptiest.
export function raidSubgroupPlan(members: readonly SubgroupMember[]): number[] {
  const n = members.length;
  const out = new Array<number>(n).fill(0);
  const groups = raidGroupCount(n);
  if (groups <= 1) return out;

  const held: SubgroupMember[][] = Array.from({ length: groups }, () => []);
  const free = (g: number): number => RAID_SUBGROUP_SIZE - held[g]!.length;
  const unseated = new Set(members.map((_, i) => i));
  const take = (i: number, g: number): void => {
    out[i] = g;
    held[g]!.push(members[i]!);
    unseated.delete(i);
  };
  const holdsClass = (g: number, cls: number): boolean => held[g]!.some((m) => m.cls === cls);
  const holdsHealer = (g: number): boolean => held[g]!.some((m) => m.role === 'healer');
  // Emptiest group, lowest index on a tie. It must NOT skip a full group: past groups × 5 none has
  // room, and the skip then returned 0, stacking every overflow body on the main tank group.
  const emptiest = (): number => {
    let best = 0;
    for (let g = 1; g < groups; g++) if (held[g]!.length < held[best]!.length) best = g;
    return best;
  };

  // 1. tanks: group 0 to the MT/OT floor, then the emptiest group.
  const tanks = [...unseated].filter((i) => members[i]!.role === 'tank');
  for (const i of tanks) {
    take(i, held[0]!.length < MAIN_TANK_GROUP_SEATS && free(0) > 0 ? 0 : emptiest());
  }

  // 2. suppliers: one per group, group 0 first, preferring a class the group lacks.
  const suppliers = [...unseated]
    .filter((i) => SUPPLY_RANK.has(members[i]!.cls))
    .sort((a, b) => (SUPPLY_RANK.get(members[a]!.cls)! - SUPPLY_RANK.get(members[b]!.cls)!) || a - b);
  for (let g = 0; g < groups; g++) {
    if (free(g) <= 0) continue;
    const pick = suppliers.find((i) => unseated.has(i) && !holdsClass(g, members[i]!.cls))
      ?? suppliers.find((i) => unseated.has(i));
    if (pick == null) break;
    take(pick, g);
  }

  // 3. healers: one per group before any group takes a second. A healer already seated as a
  // supplier (a holy paladin, a resto shaman) counts — the group is covered, skip it.
  const healers = [...unseated].filter((i) => members[i]!.role === 'healer');
  for (const i of healers) {
    let g = -1;
    for (let k = 0; k < groups; k++) {
      if (free(k) > 0 && !holdsHealer(k)) { g = k; break; }
    }
    take(i, g >= 0 ? g : emptiest());
  }

  // 4. the rest fill out, emptiest first.
  for (const i of [...unseated]) take(i, emptiest());
  return out;
}

// The one seating every raid surface must read — combat specs, the buff plan, the aura check and
// the assignments editor. `overrides` is the hand-arranged roster, and all of them must pass it.
export function partyRaidSubgroups(
  player: SubgroupMember,
  squad: readonly SubgroupMember[],
  overrides?: RaidSeatingOverrides | null,
): number[] {
  const members: SubgroupMember[] = [
    { ...player, key: player.key ?? PLAYER_SEAT_KEY },
    ...squad,
  ];
  return applyRaidSeatingOverrides(members, raidSubgroupPlan(members), overrides);
}

/** "4 tank / 9 healer / 26 dps" — every measurement that fields a raid must print this. */
export function describeRaidComp(seats: readonly RaidSeat[]): string {
  let t = 0, h = 0, d = 0;
  for (const s of seats) {
    if (s.role === 'tank') t++;
    else if (s.role === 'healer') h++;
    else d++;
  }
  return `${t} tank / ${h} healer / ${d} dps`;
}

// UBRS is a 10-man: one missing mage means the whole raid sits on spirit regen once the bags run dry.
// 20/40-man apportionment already fields Mag 2–5. Cite: floorRest.ts.
export function instanceWantsWaterMage(dungeonId: string): boolean {
  return dungeonId === 'ubrs';
}

// Guarantee `cls` among companion seats when the player is not already that class. Replaces a
// duplicate-class DPS first so a unique hunter/shaman is not the one dropped.
export function ensureClassSeat(
  seats: readonly RaidSeat[],
  cls: number,
  playerCls: number,
): RaidSeat[] {
  if (playerCls === cls) return [...seats];
  if (seats.some((s) => s.cls === cls)) return [...seats];
  const dpsAt: number[] = [];
  for (let i = 0; i < seats.length; i++) if (seats[i]!.role === 'dps') dpsAt.push(i);
  if (!dpsAt.length) return [...seats];
  const counts = new Map<number, number>();
  for (const s of seats) counts.set(s.cls, (counts.get(s.cls) ?? 0) + 1);
  const pick = [...dpsAt].reverse().find((i) => (counts.get(seats[i]!.cls) ?? 0) > 1)
    ?? dpsAt[dpsAt.length - 1]!;
  const out = [...seats];
  out[pick] = { cls, role: 'dps' };
  return out;
}
