// Raid assignment plan (E6): RaidJob mirrors BgRole, RaidIntent mirrors BgOrder and RaidSeatPlan
// mirrors BgUnit. Pure — no RNG, no clock, deterministic from the raidComp seat order.

import { CLASS } from '../../data/schema.ts';
import { FOUR_HORSEMEN_ENTRIES, TWIN_EMPEROR_ENTRIES } from './raidEncounterTactics.ts';

export type RaidSeatId = string;

/** Job on this raid. Not a class role — mirrors BgRole. */
export type RaidJob = 'main-tank' | 'off-tank' | 'healer' | 'dps';

// Standing assignment intent — mirrors the BgOrder union as a small raid set. `tank-focus.bossKey` is an
// abstract key (`boss-a` / `boss-b`), never a creature entry.
export type RaidIntent =
  | { kind: 'tank-focus'; bossKey: string }
  | { kind: 'heal-subgroup'; subgroup: number }
  | { kind: 'camp'; camp: string }
  | { kind: 'none' };

export interface RaidCampAssignment {
  camp: string;
  seats: readonly RaidSeatId[];
}

export interface RaidHealAssignment {
  healer: RaidSeatId;
  subgroup: number;
}

/** Per-seat view rotations and frames read — BgUnit-shaped. */
export interface RaidSeatPlan {
  seatId: RaidSeatId;
  job: RaidJob;
  intent: RaidIntent;
}

// Plan a rotation row can read: `{ mainTank, offTanks[], camps?, healAssignments? }`. `seats` is the flat
// BgUnit-style projection.
export interface RaidPlan {
  mainTank: RaidSeatId;
  offTanks: readonly RaidSeatId[];
  camps?: readonly RaidCampAssignment[];
  healAssignments?: readonly RaidHealAssignment[];
  seats: readonly RaidSeatPlan[];
}

/** Input seat from raidComp / live party (role is the class/comp role, not RaidJob). */
export interface RaidPlanSeatInput {
  seatId: RaidSeatId;
  role: 'tank' | 'healer' | 'dps' | 'damage';
  /** 0-based raid subgroup; omitted → 0. */
  subgroup?: number;
  /** Forces MT vs OT when several tanks exist (player combatRole). */
  tankJob?: 'main-tank' | 'off-tank';
  /** Class id when known — Twin Emperors warlock camp. Cite: SharedDefines.h. */
  cls?: number;
}

/** Abstract multi-boss keys — index 0 = boss-a, 1 = boss-b. Never creature entries. */
export const RAID_BOSS_KEYS = ['boss-a', 'boss-b'] as const;

/** CondMetric `myJob` codes — stable, documented for the picker. */
export const RAID_JOB_CODE: Readonly<Record<RaidJob, number>> = Object.freeze({
  dps: 0,
  healer: 1,
  'off-tank': 2,
  'main-tank': 3,
});

export function raidJobFromCode(n: number): RaidJob | null {
  if (n === 0) return 'dps';
  if (n === 1) return 'healer';
  if (n === 2) return 'off-tank';
  if (n === 3) return 'main-tank';
  return null;
}

/** CondMetric `myCamp`: 0 = unassigned; 1 = camp a; 2 = camp b; … */
export function raidCampCode(camp: string | undefined): number {
  if (!camp) return 0;
  const m = /^([a-z])$/i.exec(camp.trim());
  if (m) return (m[1]!.toLowerCase().charCodeAt(0) - 96) | 0;
  const n = Number(camp);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function normalizeRole(role: RaidPlanSeatInput['role']): 'tank' | 'healer' | 'dps' {
  if (role === 'tank') return 'tank';
  if (role === 'healer') return 'healer';
  return 'dps';
}

function rebuildSeats(plan: Omit<RaidPlan, 'seats'>): RaidSeatPlan[] {
  const jobOf = new Map<RaidSeatId, RaidJob>();
  if (plan.mainTank) jobOf.set(plan.mainTank, 'main-tank');
  for (const id of plan.offTanks) jobOf.set(id, 'off-tank');
  for (const h of plan.healAssignments ?? []) jobOf.set(h.healer, 'healer');

  const campOf = new Map<RaidSeatId, string>();
  for (const c of plan.camps ?? []) {
    for (const id of c.seats) campOf.set(id, c.camp);
  }
  const healOf = new Map<RaidSeatId, number>();
  for (const h of plan.healAssignments ?? []) healOf.set(h.healer, h.subgroup);

  const ids = new Set<RaidSeatId>();
  if (plan.mainTank) ids.add(plan.mainTank);
  for (const id of plan.offTanks) ids.add(id);
  for (const h of plan.healAssignments ?? []) ids.add(h.healer);
  for (const c of plan.camps ?? []) for (const id of c.seats) ids.add(id);

  const out: RaidSeatPlan[] = [];
  for (const seatId of ids) {
    const job = jobOf.get(seatId) ?? 'dps';
    let intent: RaidIntent = { kind: 'none' };
    if (job === 'main-tank') intent = { kind: 'tank-focus', bossKey: RAID_BOSS_KEYS[0]! };
    else if (job === 'off-tank') {
      const otIdx = plan.offTanks.indexOf(seatId);
      const key = RAID_BOSS_KEYS[Math.min(Math.max(otIdx, 0) + 1, RAID_BOSS_KEYS.length - 1)]!;
      intent = { kind: 'tank-focus', bossKey: key };
    } else if (job === 'healer' && healOf.has(seatId)) {
      intent = { kind: 'heal-subgroup', subgroup: healOf.get(seatId)! };
    } else if (campOf.has(seatId)) {
      intent = { kind: 'camp', camp: campOf.get(seatId)! };
    }
    out.push({ seatId, job, intent });
  }
  return out;
}

// Author a plan from the roster seats: the first tank is MT, the rest OTs, and each healer takes a
// subgroup. With two or more tanks, camps a and b follow subgroup parity.
export function buildRaidPlan(
  inputs: readonly RaidPlanSeatInput[],
  overrides?: Partial<Pick<RaidPlan, 'mainTank' | 'offTanks' | 'camps' | 'healAssignments'>>,
): RaidPlan {
  const rows = inputs.map((s) => ({
    seatId: s.seatId,
    role: normalizeRole(s.role),
    subgroup: Math.max(0, s.subgroup ?? 0) | 0,
    tankJob: s.tankJob,
  }));

  const tanks = rows.filter((r) => r.role === 'tank');
  const healers = rows.filter((r) => r.role === 'healer');

  let mainTank = overrides?.mainTank ?? '';
  if (!mainTank || !tanks.some((t) => t.seatId === mainTank)) {
    const forced = tanks.find((t) => t.tankJob === 'main-tank');
    const forcedOtOnly = tanks.length > 0 && tanks.every((t) => t.tankJob === 'off-tank');
    mainTank = forced?.seatId
      ?? (!forcedOtOnly ? tanks[0]?.seatId : '')
      ?? tanks[0]?.seatId
      ?? rows[0]?.seatId
      ?? 'player';
  }

  let offTanks = overrides?.offTanks ? [...overrides.offTanks] : tanks
    .map((t) => t.seatId)
    .filter((id) => id !== mainTank);
  // Drop seats that are not tanks / not in the roster.
  const tankIds = new Set(tanks.map((t) => t.seatId));
  offTanks = offTanks.filter((id) => tankIds.has(id) && id !== mainTank);

  const healAssignments: RaidHealAssignment[] = overrides?.healAssignments
    ? overrides.healAssignments.map((h) => ({ healer: h.healer, subgroup: h.subgroup | 0 }))
    : healers.map((h) => ({ healer: h.seatId, subgroup: h.subgroup }));

  let camps = overrides?.camps ? overrides.camps.map((c) => ({
    camp: c.camp,
    seats: [...c.seats],
  })) : undefined;

  if (!camps && tanks.length >= 2) {
    const a: RaidSeatId[] = [mainTank];
    const b: RaidSeatId[] = offTanks[0] ? [offTanks[0]] : [];
    for (const h of healAssignments) {
      if ((h.subgroup % 2) === 0) a.push(h.healer);
      else b.push(h.healer);
    }
    for (const r of rows) {
      if (r.role === 'tank' || r.role === 'healer') continue;
      if ((r.subgroup % 2) === 0) a.push(r.seatId);
      else b.push(r.seatId);
    }
    camps = [
      { camp: 'a', seats: a },
      { camp: 'b', seats: b },
    ];
  }

  const base: Omit<RaidPlan, 'seats'> = {
    mainTank,
    offTanks,
    ...(camps && camps.length ? { camps } : {}),
    ...(healAssignments.length ? { healAssignments } : {}),
  };
  // Ensure every input seat appears in `seats` (dps included).
  const seatPlans = rebuildSeats(base);
  const have = new Set(seatPlans.map((s) => s.seatId));
  for (const r of rows) {
    if (have.has(r.seatId)) continue;
    const camp = camps?.find((c) => c.seats.includes(r.seatId))?.camp;
    seatPlans.push({
      seatId: r.seatId,
      job: 'dps',
      intent: camp ? { kind: 'camp', camp } : { kind: 'none' },
    });
  }
  return { ...base, seats: seatPlans };
}

export function seatPlanOf(plan: RaidPlan, seatId: RaidSeatId): RaidSeatPlan | null {
  return plan.seats.find((s) => s.seatId === seatId) ?? null;
}

export function isMainTankSeat(plan: RaidPlan, seatId: RaidSeatId): boolean {
  return plan.mainTank === seatId;
}

export function isOffTankSeat(plan: RaidPlan, seatId: RaidSeatId): boolean {
  return plan.offTanks.includes(seatId);
}

/** Boss-focus index for a tank seat: MT → 0, first OT → 1, … Absent / non-tank → null. */
export function tankBossIndex(plan: RaidPlan, seatId: RaidSeatId): number | null {
  if (plan.mainTank === seatId) return 0;
  const ot = plan.offTanks.indexOf(seatId);
  if (ot < 0) return null;
  return ot + 1;
}

// True when OT glue-to-hostiles[n] is the fight (Twins, Horsemen). On a one-boss pull hostiles[1] is an add
// — leave the OT on sessionFocus peel. Cite: overlayEncounterRaidPlan; tankPlanFocus.
export function tankFocusSplitsBosses(creatureEntries: readonly number[]): boolean {
  for (const e of creatureEntries) {
    const id = e | 0;
    if (TWIN_EMPEROR_ENTRIES.has(id) || FOUR_HORSEMEN_ENTRIES.has(id)) return true;
  }
  return false;
}

export function assignedHealSubgroupOf(plan: RaidPlan, seatId: RaidSeatId): number | null {
  const row = plan.healAssignments?.find((h) => h.healer === seatId);
  return row ? row.subgroup : null;
}

export function campOfSeat(plan: RaidPlan, seatId: RaidSeatId): string | undefined {
  for (const c of plan.camps ?? []) {
    if (c.seats.includes(seatId)) return c.camp;
  }
  const sp = seatPlanOf(plan, seatId);
  return sp?.intent.kind === 'camp' ? sp.intent.camp : undefined;
}

/** Coerce stored JSON into a RaidPlan, or null when absent/empty. */
export function normalizeRaidPlan(raw: unknown): RaidPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<RaidPlan>;
  if (typeof r.mainTank !== 'string' || !r.mainTank) return null;
  const offTanks = Array.isArray(r.offTanks)
    ? r.offTanks.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  const camps = Array.isArray(r.camps)
    ? r.camps
      .filter((c): c is RaidCampAssignment => !!c && typeof c === 'object'
        && typeof (c as RaidCampAssignment).camp === 'string'
        && Array.isArray((c as RaidCampAssignment).seats))
      .map((c) => ({
        camp: String(c.camp),
        seats: c.seats.filter((id): id is string => typeof id === 'string' && id.length > 0),
      }))
    : undefined;
  const healAssignments = Array.isArray(r.healAssignments)
    ? r.healAssignments
      .filter((h): h is RaidHealAssignment => !!h && typeof h === 'object'
        && typeof (h as RaidHealAssignment).healer === 'string'
        && typeof (h as RaidHealAssignment).subgroup === 'number')
      .map((h) => ({ healer: h.healer, subgroup: h.subgroup | 0 }))
    : undefined;
  const base: Omit<RaidPlan, 'seats'> = {
    mainTank: r.mainTank,
    offTanks,
    ...(camps && camps.length ? { camps } : {}),
    ...(healAssignments && healAssignments.length ? { healAssignments } : {}),
  };
  if (Array.isArray(r.seats) && r.seats.length) {
    const seats: RaidSeatPlan[] = [];
    for (const s of r.seats) {
      if (!s || typeof s !== 'object') continue;
      const seatId = typeof s.seatId === 'string' ? s.seatId : '';
      if (!seatId) continue;
      const job: RaidJob =
        s.job === 'main-tank' || s.job === 'off-tank' || s.job === 'healer' || s.job === 'dps'
          ? s.job
          : 'dps';
      const intent = normalizeIntent(s.intent);
      seats.push({ seatId, job, intent });
    }
    if (seats.length) return { ...base, seats };
  }
  return { ...base, seats: rebuildSeats(base) };
}

function normalizeIntent(raw: unknown): RaidIntent {
  if (!raw || typeof raw !== 'object') return { kind: 'none' };
  const i = raw as RaidIntent;
  if (i.kind === 'tank-focus' && typeof i.bossKey === 'string') {
    return { kind: 'tank-focus', bossKey: i.bossKey };
  }
  if (i.kind === 'heal-subgroup' && typeof i.subgroup === 'number') {
    return { kind: 'heal-subgroup', subgroup: i.subgroup | 0 };
  }
  if (i.kind === 'camp' && typeof i.camp === 'string') {
    return { kind: 'camp', camp: i.camp };
  }
  return { kind: 'none' };
}

// Re-assign one seat's job and rebuild MT / OT / heal lists. Deterministic. Promoting a seat to main-tank
// demotes the previous MT to off-tank when they were a tank.
export function assignRaidJob(plan: RaidPlan, seatId: RaidSeatId, job: RaidJob): RaidPlan {
  const seats = plan.seats.map((s) => ({ ...s, intent: { ...s.intent } as RaidIntent }));
  let row = seats.find((s) => s.seatId === seatId);
  if (!row) {
    row = { seatId, job, intent: { kind: 'none' } };
    seats.push(row);
  }
  const prevJob = row.job;
  row.job = job;

  let mainTank = plan.mainTank;
  let offTanks = [...plan.offTanks];
  let healAssignments = [...(plan.healAssignments ?? [])];

  if (job === 'main-tank') {
    if (mainTank && mainTank !== seatId) {
      const prev = seats.find((s) => s.seatId === mainTank);
      if (prev && (prev.job === 'main-tank' || prevJob === 'main-tank')) {
        prev.job = 'off-tank';
        if (!offTanks.includes(mainTank)) offTanks.push(mainTank);
      }
    }
    mainTank = seatId;
    offTanks = offTanks.filter((id) => id !== seatId);
    healAssignments = healAssignments.filter((h) => h.healer !== seatId);
    row.intent = { kind: 'tank-focus', bossKey: RAID_BOSS_KEYS[0]! };
  } else if (job === 'off-tank') {
    if (mainTank === seatId) {
      mainTank = offTanks[0] ?? mainTank;
      offTanks = offTanks.filter((id) => id !== mainTank);
    }
    if (!offTanks.includes(seatId) && seatId !== mainTank) offTanks.push(seatId);
    healAssignments = healAssignments.filter((h) => h.healer !== seatId);
    const otIdx = offTanks.indexOf(seatId);
    const key = RAID_BOSS_KEYS[Math.min(otIdx + 1, RAID_BOSS_KEYS.length - 1)]!;
    row.intent = { kind: 'tank-focus', bossKey: key };
  } else if (job === 'healer') {
    if (mainTank === seatId) mainTank = offTanks[0] ?? mainTank;
    offTanks = offTanks.filter((id) => id !== seatId);
    const sub = row.intent.kind === 'heal-subgroup'
      ? row.intent.subgroup
      : (healAssignments.find((h) => h.healer === seatId)?.subgroup ?? 0);
    healAssignments = [
      ...healAssignments.filter((h) => h.healer !== seatId),
      { healer: seatId, subgroup: sub },
    ];
    row.intent = { kind: 'heal-subgroup', subgroup: sub };
  } else {
    if (mainTank === seatId) mainTank = offTanks[0] ?? mainTank;
    offTanks = offTanks.filter((id) => id !== seatId);
    healAssignments = healAssignments.filter((h) => h.healer !== seatId);
    const camp = campOfSeat(plan, seatId);
    row.intent = camp ? { kind: 'camp', camp } : { kind: 'none' };
  }

  // Sync job flags on seat rows for MT/OT lists.
  for (const s of seats) {
    if (s.seatId === mainTank) s.job = 'main-tank';
    else if (offTanks.includes(s.seatId) && s.job !== 'healer') s.job = 'off-tank';
  }

  const base: Omit<RaidPlan, 'seats'> = {
    mainTank,
    offTanks,
    ...(plan.camps ? { camps: plan.camps } : {}),
    ...(healAssignments.length ? { healAssignments } : {}),
  };
  return { ...base, seats };
}

/** Set a healer's assigned subgroup (heal-assignment intent). */
export function assignHealSubgroup(plan: RaidPlan, healer: RaidSeatId, subgroup: number): RaidPlan {
  const sub = Math.max(0, subgroup | 0);
  let next = plan;
  const sp = seatPlanOf(plan, healer);
  if (!sp || sp.job !== 'healer') next = assignRaidJob(plan, healer, 'healer');
  const healAssignments = [
    ...(next.healAssignments ?? []).filter((h) => h.healer !== healer),
    { healer, subgroup: sub },
  ];
  const seats = next.seats.map((s) =>
    s.seatId === healer
      ? { ...s, job: 'healer' as const, intent: { kind: 'heal-subgroup' as const, subgroup: sub } }
      : s,
  );
  return {
    mainTank: next.mainTank,
    offTanks: next.offTanks,
    ...(next.camps ? { camps: next.camps } : {}),
    healAssignments,
    seats,
  };
}

// Per-encounter camp overlay. Runs at fight time on the live hostile entries, so it is the plan the
// snapshot's `myCamp` is read from - the editor still shows the base plan.
export function overlayEncounterRaidPlan(
  plan: RaidPlan,
  inputs: readonly RaidPlanSeatInput[],
  creatureEntries: readonly number[],
): RaidPlan {
  if (creatureEntries.some((e) => TWIN_EMPEROR_ENTRIES.has(e | 0))) {
    return overlayTwinEmperors(plan, inputs);
  }
  if (creatureEntries.some((e) => FOUR_HORSEMEN_ENTRIES.has(e | 0))) {
    return overlayFourHorsemen(plan, inputs);
  }
  return plan;
}

// Twin Emperors: warriors on Vek'nilash (camp a / boss-a), warlocks on Vek'lor (camp b / boss-b). Cite:
// boss_twinemperors.cpp:300-302 Vek'lor melee off, 40 yd; :332-356 teleport swap.
function overlayTwinEmperors(
  plan: RaidPlan,
  inputs: readonly RaidPlanSeatInput[],
): RaidPlan {
  const clsOf = new Map<RaidSeatId, number>();
  const subOf = new Map<RaidSeatId, number>();
  for (const s of inputs) {
    if (s.cls != null) clsOf.set(s.seatId, s.cls);
    subOf.set(s.seatId, s.subgroup ?? 0);
  }

  const a: RaidSeatId[] = [];
  const b: RaidSeatId[] = [];
  for (const s of plan.seats) {
    const cls = clsOf.get(s.seatId);
    if (cls === CLASS.WARLOCK) b.push(s.seatId);
    else if (cls === CLASS.WARRIOR || s.job === 'main-tank' || s.job === 'off-tank') a.push(s.seatId);
    else if (((subOf.get(s.seatId) ?? 0) % 2) === 0) a.push(s.seatId);
    else b.push(s.seatId);
  }
  if (!a.length || !b.length) return plan;

  const camps: RaidCampAssignment[] = [
    { camp: 'a', seats: a },
    { camp: 'b', seats: b },
  ];
  const seats = plan.seats.map((s) => {
    const camp = b.includes(s.seatId) ? 'b' : 'a';
    const bossKey = camp === 'b' ? RAID_BOSS_KEYS[1]! : RAID_BOSS_KEYS[0]!;
    if (s.job === 'healer') return s;
    return { ...s, intent: { kind: 'tank-focus' as const, bossKey } };
  });
  return { ...plan, camps, seats };
}

// Four Horsemen: four bodies, four corners, one camp each. The tanks are already index-correct, so
// this is the other half — every non-tank seat gets a corner, leaving no camp without healers.
function overlayFourHorsemen(
  plan: RaidPlan,
  inputs: readonly RaidPlanSeatInput[],
): RaidPlan {
  const subOf = new Map<RaidSeatId, number>();
  for (const s of inputs) subOf.set(s.seatId, s.subgroup ?? 0);

  const CAMPS = ['a', 'b', 'c', 'd'] as const;
  const buckets: RaidSeatId[][] = [[], [], [], []];
  // Seed one tank per corner in plan order (MT first), then fill by subgroup so a 40-man
  // spreads its eight subgroups two to a corner.
  const tanks: RaidSeatId[] = [];
  if (plan.mainTank) tanks.push(plan.mainTank);
  for (const id of plan.offTanks) if (!tanks.includes(id)) tanks.push(id);
  const placed = new Set<RaidSeatId>();
  tanks.forEach((id, i) => {
    buckets[i % CAMPS.length]!.push(id);
    placed.add(id);
  });
  for (const s of plan.seats) {
    if (placed.has(s.seatId)) continue;
    buckets[(subOf.get(s.seatId) ?? 0) % CAMPS.length]!.push(s.seatId);
  }
  if (buckets.every((b) => !b.length)) return plan;

  const camps: RaidCampAssignment[] = CAMPS
    .map((camp, i) => ({ camp, seats: buckets[i]! }))
    .filter((c) => c.seats.length > 0);
  const campOf = new Map<RaidSeatId, string>();
  for (const c of camps) for (const id of c.seats) campOf.set(id, c.camp);

  const seats = plan.seats.map((s) => {
    // Tanks keep tank-focus (index-correct already); healers keep their subgroup.
    if (s.job !== 'dps') return s;
    const camp = campOf.get(s.seatId);
    return camp ? { ...s, intent: { kind: 'camp' as const, camp } } : s;
  });
  return { ...plan, camps, seats };
}
