// Plain-text group dump for debugging a parse: who is in the group, what build each runs and what
// their meter row spent casts on. The per-ability casts column is what names a blocked rotation.

import type { DpsMateSnapshot, ActorMetrics } from './dpsMate.ts';
import type { Companion } from './squad.ts';
import type { DataStore } from '../../data/dataStore.ts';
import { CLASS_NAMES } from '../core/ids.ts';
import { resolveAoeMode, resolveOffHeal } from './squad.ts';

/** One seat, already resolved to the fields a reader needs. */
export interface GroupCompSeat {
  side: string;
  name: string;
  level: number;
  cls: number;
  role: string;
  /** BotSpecDef.name — the talent build this seat runs ("pve heal holy (sanctuary)"). */
  build: string;
  aoeMode: string;
  offHeal: boolean;
  /** Rotation.standYards as stamped for the pull, when the caller knows it. */
  standYards?: number;
}

export interface GroupCompReportInput {
  snapshot: DpsMateSnapshot;
  seats: readonly GroupCompSeat[];
  /** Header context: zone / instance / boss, whatever the caller can name. */
  where?: string;
  /** 'fight' | 'run' — which segment the snapshot covers. */
  segment?: string;
}

/** Squad + player → seats, using the same index alignment displayNames uses (squad[i] → ally_i). */
export function groupCompSeats(opts: {
  ds: DataStore;
  playerSide?: string;
  playerName: string;
  playerLevel: number;
  playerCls: number;
  playerRole?: string;
  squad: readonly Companion[];
  allySideAt: (i: number) => string;
  standYardsOf?: (side: string) => number | undefined;
}): GroupCompSeat[] {
  const { ds } = opts;
  const buildOf = (cls: number, specIdx: number | undefined): string => {
    if (specIdx == null) return '(no specIdx)';
    return ds.botSpecs(cls)[specIdx]?.name ?? `spec#${specIdx}`;
  };
  const playerSide = opts.playerSide ?? 'player';
  const seats: GroupCompSeat[] = [{
    side: playerSide,
    name: opts.playerName,
    level: opts.playerLevel,
    cls: opts.playerCls,
    role: opts.playerRole ?? 'player',
    build: '(player talents)',
    aoeMode: '-',
    offHeal: false,
    ...(opts.standYardsOf?.(playerSide) != null ? { standYards: opts.standYardsOf(playerSide) } : {}),
  }];
  opts.squad.forEach((c, i) => {
    const side = opts.allySideAt(i);
    seats.push({
      side,
      name: c.name,
      level: c.level ?? 0,
      cls: c.cls,
      role: c.role ?? 'dps',
      build: buildOf(c.cls, c.specIdx),
      aoeMode: resolveAoeMode(c),
      offHeal: resolveOffHeal(c),
      ...(opts.standYardsOf?.(side) != null ? { standYards: opts.standYardsOf(side) } : {}),
    });
  });
  return seats;
}

const pad = (s: string, n: number): string => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));
const lpad = (s: string, n: number): string => (s.length >= n ? s : ' '.repeat(n - s.length) + s);
const num = (n: number): string => (n >= 10000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)));

/** Top abilities for one actor, as "Name x<casts> @<avgHit>". */
function topAbilities(a: ActorMetrics | undefined, limit: number): string {
  if (!a) return '';
  return [...a.abilities]
    .sort((x, y) => (y.damage + y.healing) - (x.damage + x.healing))
    .slice(0, limit)
    .map((ab) => {
      const n = ab.casts > 0 ? ab.casts : ab.swings;
      return `${ab.name} x${n}${ab.avgHit > 0 ? `@${Math.round(ab.avgHit)}` : ''}`;
    })
    .join(', ');
}

// The whole dump as plain text. Stable column widths so a paste stays readable, and every number comes off
// the snapshot the meter is already showing — this adds no second source.
export function groupCompReport(input: GroupCompReportInput): string {
  const { snapshot, seats } = input;
  const byId = new Map(snapshot.actors.map((a) => [a.id, a]));
  const secs = snapshot.durationMs / 1000;
  const out: string[] = [];
  out.push(
    `group comp · ${input.where ?? 'unknown'} · ${input.segment ?? 'fight'} · ${secs.toFixed(1)}s`
    + ` · ${seats.length} seats`,
  );
  out.push(
    `total damage ${num(snapshot.totalDamage)} (${num(snapshot.totalDamage / Math.max(1, secs))} dps)`
    + ` · healing ${num(snapshot.totalHealing)}`,
  );
  out.push('');
  out.push(
    `${pad('name', 14)}${pad('lvl', 4)}${pad('class', 8)}${pad('role', 7)}${pad('aoe', 7)}`
    + `${pad('oheal', 6)}${pad('yd', 4)}${lpad('dps', 7)}${lpad('dmg', 8)}${lpad('heal', 8)}  build / top abilities`,
  );
  // Rank by the same value the meter ranks by, so a pasted dump and the on-screen bars agree.
  const ordered = [...seats].sort((x, y) => (byId.get(y.side)?.dps ?? 0) - (byId.get(x.side)?.dps ?? 0));
  for (const s of ordered) {
    const a = byId.get(s.side);
    out.push(
      `${pad(s.name, 14)}${pad(String(s.level || '-'), 4)}${pad(CLASS_NAMES[s.cls] ?? String(s.cls), 8)}`
      + `${pad(s.role, 7)}${pad(s.aoeMode, 7)}${pad(s.offHeal ? 'on' : 'off', 6)}`
      + `${pad(s.standYards != null ? String(Math.round(s.standYards)) : '-', 4)}`
      + `${lpad(a ? num(a.dps) : '0', 7)}${lpad(a ? num(a.damage) : '0', 8)}${lpad(a ? num(a.healing) : '0', 8)}`
      + `  ${s.build}`,
    );
    const top = topAbilities(a, 6);
    if (top) out.push(`${' '.repeat(16)}${top}`);
  }
  return out.join('\n');
}
