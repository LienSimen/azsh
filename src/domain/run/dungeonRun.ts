// Dungeon full-run records and the between-pull downtime model. Pure.

import type { SquadPullModel } from '../bots/squadRun.ts';
import type { CombatEvent } from '../../engine/core/events.ts';
import {
  createDpsMateMeter,
  dpsMateFromEvents,
  type DpsMateSnapshot,
  type MeterSortKind,
} from '../bots/dpsMate.ts';

export interface PullLoot {
  item: number;
  count: number;
  randomPropertyId?: number;
}

// After-action DPS and HPS meter row. Every number is a real session tally from the combat event
// log; the old modelled companion numbers are retired.
export interface MemberStatRow {
  name: string;
  role: 'player' | 'tank' | 'healer' | 'dps' | 'pet';
  damage: number;
  healing: number;
  // Damage this member TOOK. Unlike the others it does not come from the event log: the caller
  // passes the session's push-time tally, which survives the ring trim. Absent when none was given.
  damageTaken?: number;
}

/** Real ally ending vitals for watch-mode party frames (ally_0.. order). */
export interface AllyEndVitals {
  hp: number;
  power: number;
  /** Companion max HP at pull time (for HP% bars). */
  maxHp: number;
}

export interface PullRecord {
  encounterId: string;
  name: string;
  kind: 'trash' | 'boss';
  /** `timeout` = combat cap with the party still standing — not a wipe (KI-1007 / KI-740). */
  outcome: 'win' | 'defeat' | 'timeout';
  /** Combat time for this pull from the deterministic session log. */
  durationMs: number;
  xpGained: number;
  goldGained: number;
  loot: PullLoot[];
  /** Player HP fraction (0..1) when the pull ended — the "close call" signal. */
  endHpPct: number;
  /** Modeled rest before this pull (seconds to full via real OOC regen rates). */
  downtimeSec: number;
  // Legacy Track-A squad model (optional, back-compat). New runs (S5+) do not write this field — meters and
  // wipe rules use real group sessions instead.
  squad?: SquadPullModel;
  /** Per-member damage/healing for this pull (real event tallies). */
  memberStats?: MemberStatRow[];
  // Optional combat log for a watch-mode replay of this pull, present only when the caller asked to
  // keep logs — headless callers pay nothing. Group runs attach the full squad log.
  log?: CombatEvent[];
  // Which scripted mechanics fired in this pull. Always present when the fight fired any, log or not:
  // the event ring keeps 8192 rows, so a raid boss's early phases are gone from the log by the end.
  mechanics?: Record<string, { count: number; firstT: number; lastT: number }>;
  // How the enemy side ended: the primary enemy's HP fraction plus bodies still standing. Separates
  // "we nearly had him" from "he cannot be killed at all", which no damage or death count can tell.
  enemyEnd?: {
    hpPct: number;
    alive: number;
    total: number;
    /** Every body in the pull with its end HP fraction — where the damage actually went. */
    bodies?: Array<{ name: string; hpPct: number }>;
  };
  // Real ally end-of-pull vitals (ally_0.. order, matching squad order). Optional additive field for Watch
  // Run companion bars; absent on solo / old summaries.
  allyEnd?: AllyEndVitals[];
  // Every death in this pull in order, with the killing blow and the role that took it, from the
  // session's push-time roll — so the first friendly death of a wipe is here even if the ring dropped it.
  deaths?: Array<{
    side: string;
    name: string;
    role: 'player' | 'tank' | 'healer' | 'dps' | 'pet' | 'enemy';
    /** Milliseconds into the pull, on the same clock as `durationMs`. */
    t: number;
    /** Killing blow ability name, when a damaging row landed before the death. */
    cause?: string;
    /** Who landed it, as a display name. */
    by?: string;
  }>;
  /** Deaths counted including any the 512-row roll cap dropped. */
  deathsTotal?: number;
  // Damage whose row named no victim, so it reached no member's damageTaken. Every push site sets a
  // target, so anything but 0 means a new site forgot one and the per-role columns undercount.
  damageTakenUnattributed?: number;
  // Rows the session event ring discarded during this pull. Non-zero means the log and the damage
  // columns cover only the fight's tail; damageTaken, mechanics and deaths stay complete.
  eventsDropped?: number;
}

export interface DungeonRunSummary {
  dungeonId: string;
  dungeonName: string;
  outcome: 'clear' | 'wipe' | 'partial';
  pulls: PullRecord[];
  bossesDown: number;
  bossTotal: number;
  encountersCleared: number;
  encounterTotal: number;
  totalXp: number;
  totalGold: number;
  totalLoot: PullLoot[];
  combatMs: number;
  downtimeSec: number;
  /** Present on 'wipe'/'partial': what stopped the run. */
  stopReason?: string;
  /** D2 after-action extras: per-member role performance + narrative highlights. */
  roleGrades?: Array<{ name: string; role: string; detail: string }>;
  keyMoments?: string[];
  /** D3.5: memberStats summed across pulls (DPS-meter totals). */
  memberTotals?: MemberStatRow[];
  /** Greys the run auto-sold (bots never roll, so junk piles up fast in a dungeon). */
  autoSoldGrays?: { count: number; gold: number };
  /** Item stacks that overflowed full bags into the mailbox during the run. */
  mailedStacks?: number;
  /** DR: route density used for this run. */
  routeDensity?: 'full' | 'bosses';
  /** DR: pull fusion used for this run. */
  pullFusion?: 'single' | 'link' | 'chain' | 'mayhem';
  /** Trash packs available on Full density (for “packs fought vs available”). */
  packsAvailable?: number;
  /** Trash packs on the chosen route density. */
  packsOnRoute?: number;
}

// Seconds of out-of-combat rest needed to refill vitals, from the real per-second regen rates the
// caller computes. Rage empties on rest and never gates downtime; a zero rate skips that pool.
export function downtimeToFullSec(args: {
  missingHp: number;
  hpPerSec: number;
  missingMana?: number;
  manaPerSec?: number;
  missingEnergy?: number;
  energyPerSec?: number;
}): number {
  const times: number[] = [];
  if (args.missingHp > 0 && args.hpPerSec > 0) times.push(args.missingHp / args.hpPerSec);
  if ((args.missingMana ?? 0) > 0 && (args.manaPerSec ?? 0) > 0) {
    times.push(args.missingMana! / args.manaPerSec!);
  }
  if ((args.missingEnergy ?? 0) > 0 && (args.energyPerSec ?? 0) > 0) {
    times.push(args.missingEnergy! / args.energyPerSec!);
  }
  if (times.length === 0) return 0;
  return Math.ceil(Math.max(...times));
}

/** Sum per-pull memberStats into run totals (stable first-seen order). */
export function sumMemberTotals(pulls: readonly PullRecord[]): MemberStatRow[] | undefined {
  const order: string[] = [];
  const map = new Map<string, MemberStatRow>();
  for (const p of pulls) {
    for (const m of p.memberStats ?? []) {
      const key = `${m.role}\0${m.name}`;
      const ex = map.get(key);
      if (ex) {
        ex.damage += m.damage;
        ex.healing += m.healing;
        if (m.damageTaken != null) ex.damageTaken = (ex.damageTaken ?? 0) + m.damageTaken;
      } else {
        map.set(key, {
          name: m.name,
          role: m.role,
          damage: m.damage,
          healing: m.healing,
          ...(m.damageTaken != null ? { damageTaken: m.damageTaken } : {}),
        });
        order.push(key);
      }
    }
  }
  if (order.length === 0) return undefined;
  return order.map((k) => map.get(k)!);
}

// Real event-log tallies for party members. Damage is melee, spell hits and DoT ticks by actor;
// healing is credited to the caster, not the target. For per-spell metrics use the DpsMate path.
export function memberStatsFromEvents(
  events: readonly CombatEvent[],
  opts: {
    playerName: string;
    petName?: string;
    /** Ordered allies matching ally_0 … ally_N (humans; pets fold in via guardianOwners). */
    allies: Array<{ name: string; role: 'tank' | 'healer' | 'dps' }>;
    // guardian side → owner side (pet→player, ally_k→ally_i). Details-style merge: pet damage/healing is
    // credited to the owner row, not a freestanding pet line.
    guardianOwners?: Readonly<Record<string, string>>;
    // The session's push-time damage-taken tally, passed in rather than derived here because
    // `events` is a tail: on a fight long enough to wipe, the early rows are already gone.
    damageTakenBySide?: Readonly<Record<string, number>>;
  },
): MemberStatRow[] {
  const dmg = new Map<string, number>();
  const heal = new Map<string, number>();
  const taken = new Map<string, number>();
  const owners = opts.guardianOwners ?? {};
  const credit = (id: string): string => {
    const o = owners[id];
    return o && o !== id ? o : id;
  };
  const bump = (map: Map<string, number>, id: string, n: number): void => {
    map.set(id, (map.get(id) ?? 0) + n);
  };
  for (const e of events) {
    if (e.kind === 'melee' || e.kind === 'spell_hit' || e.kind === 'dot_tick') {
      if (Number.isFinite(e.amount) && e.amount !== 0) bump(dmg, credit(e.actor), e.amount);
    } else if (e.kind === 'heal') {
      if (!Number.isFinite(e.amount) || e.amount === 0) continue;
      const caster = e.source ?? e.actor;
      bump(heal, credit(caster), e.amount);
    }
  }
  // Guardians fold into their owner here too, so a warlock's row carries what the felhunter ate.
  for (const [side, n] of Object.entries(opts.damageTakenBySide ?? {})) {
    if (Number.isFinite(n) && n !== 0) bump(taken, credit(side), n);
  }
  const hasTaken = opts.damageTakenBySide !== undefined;
  const takenOf = (id: string): { damageTaken?: number } =>
    (hasTaken ? { damageTaken: Math.round(taken.get(id) ?? 0) } : {});
  const rows: MemberStatRow[] = [];
  const pD = Math.round(dmg.get('player') ?? 0);
  const pH = Math.round(heal.get('player') ?? 0);
  // Always include the player row (matches runFullDungeon meter shape). Pet damage is
  // already folded into player when guardianOwners.pet === 'player'.
  rows.push({ name: opts.playerName, role: 'player', damage: pD, healing: pH, ...takenOf('player') });
  // Standalone pet row only when the caller did not merge pets into the owner.
  if (!owners.pet) {
    const petD = Math.round(dmg.get('pet') ?? 0);
    const petH = Math.round(heal.get('pet') ?? 0);
    const petT = Math.round(taken.get('pet') ?? 0);
    if (petD > 0 || petH > 0 || petT > 0) {
      rows.push({ name: opts.petName ?? 'Pet', role: 'pet', damage: petD, healing: petH, ...takenOf('pet') });
    }
  }
  opts.allies.forEach((a, i) => {
    const id = `ally_${i}`;
    rows.push({
      name: a.name,
      role: a.role,
      damage: Math.round(dmg.get(id) ?? 0),
      healing: Math.round(heal.get(id) ?? 0),
      ...takenOf(id),
    });
  });
  return rows;
}

// S4D: full DPSMate snapshot from a pull/run event log (per-actor + per-ability metrics). Complements
// {@link memberStatsFromEvents} which only returns party damage/healing totals.
export function memberDpsMateFromEvents(
  events: readonly CombatEvent[],
  sortKind: MeterSortKind = 'damage',
): DpsMateSnapshot {
  return dpsMateFromEvents(events, sortKind);
}

// Build a whole-run DPSMate snapshot by concatenating per-pull logs (when keepLogs). Falls back to empty
// snapshot when no logs are present.
export function runDpsMateFromPulls(
  pulls: readonly PullRecord[],
  sortKind: MeterSortKind = 'damage',
): DpsMateSnapshot {
  const meter = createDpsMateMeter();
  for (const p of pulls) {
    meter.beginFight();
    if (p.log?.length) meter.ingest(p.log);
  }
  // Whole-run segment accumulates across beginFight boundaries.
  return meter.snapshot(sortKind, 'run');
}

export type { DpsMateSnapshot, MeterSortKind };

/** Assemble the summary from pull records (pure aggregation). */
export function buildRunSummary(args: {
  dungeonId: string;
  dungeonName: string;
  pulls: PullRecord[];
  encounterTotal: number;
  bossTotal: number;
  /** Encounters cleared across the whole run state (includes earlier manual pulls). */
  encountersCleared: number;
  bossesDown: number;
  stopReason?: string;
  roleGrades?: Array<{ name: string; role: string; detail: string }>;
  keyMoments?: string[];
  routeDensity?: DungeonRunSummary['routeDensity'];
  pullFusion?: DungeonRunSummary['pullFusion'];
  packsAvailable?: number;
  packsOnRoute?: number;
  // When true, every non-optional route encounter is done (`isComplete`) — grade `clear` even if skipped
  // optionals leave encountersCleared < encounterTotal (KI-1051).
  routeComplete?: boolean;
  /** Bags-full stacks mailed during the run (live autopilot / runFullDungeon). */
  mailedStacks?: number;
}): DungeonRunSummary {
  const wins = args.pulls.filter((p) => p.outcome === 'win');
  // Timeouts are not wipes — combat cap with the party still standing (KI-1007).
  const wiped = args.pulls.some((p) => p.outcome === 'defeat');
  const cleared = args.routeComplete === true || args.encountersCleared >= args.encounterTotal;
  const combatMs = args.pulls.reduce((n, p) => n + p.durationMs, 0);
  const downtimeSec = args.pulls.reduce((n, p) => n + p.downtimeSec, 0);
  const totalLoot: PullLoot[] = [];
  for (const p of args.pulls) {
    for (const l of p.loot) {
      const ex = totalLoot.find((x) => x.item === l.item);
      if (ex) ex.count += l.count;
      else totalLoot.push({ ...l });
    }
  }
  const memberTotals = sumMemberTotals(args.pulls);
  return {
    dungeonId: args.dungeonId,
    dungeonName: args.dungeonName,
    outcome: cleared ? 'clear' : wiped ? 'wipe' : 'partial',
    pulls: args.pulls,
    bossesDown: args.bossesDown,
    bossTotal: args.bossTotal,
    encountersCleared: args.encountersCleared,
    encounterTotal: args.encounterTotal,
    totalXp: wins.reduce((n, p) => n + p.xpGained, 0),
    totalGold: wins.reduce((n, p) => n + p.goldGained, 0),
    totalLoot,
    combatMs,
    downtimeSec,
    ...(args.stopReason ? { stopReason: args.stopReason } : {}),
    ...(args.roleGrades?.length ? { roleGrades: args.roleGrades } : {}),
    ...(args.keyMoments?.length ? { keyMoments: args.keyMoments } : {}),
    ...(memberTotals ? { memberTotals } : {}),
    ...(args.routeDensity ? { routeDensity: args.routeDensity } : {}),
    ...(args.pullFusion ? { pullFusion: args.pullFusion } : {}),
    ...(args.packsAvailable != null ? { packsAvailable: args.packsAvailable } : {}),
    ...(args.packsOnRoute != null ? { packsOnRoute: args.packsOnRoute } : {}),
    ...(args.mailedStacks != null && args.mailedStacks > 0 ? { mailedStacks: args.mailedStacks } : {}),
  };
}
