// The match driver — strategy at ~1 Hz, orders at the world tick, and the engagement shards combat
// resolves inside. Combat is a callback so the world layer stays pure and deterministic.

import { mulberry32, hashSeed, type Rng } from '../../engine/core/rng.ts';
import type { BgShard } from './bgWorld.ts';
import { BgWorld } from './bgWorld.ts';
import {
  bgActionsOf,
  pickBgOrder,
  type BgTeam,
  type BgUnit,
  type BgUnitId,
} from './types.ts';
import { hkHonorAtLevel } from '../run/honor.ts';
import { strategiesForRole } from './strategies.ts';

/** Resolve one tick of one engagement. Return the ids that died this tick. */
export type ShardResolver = (
  world: BgWorld,
  shard: BgShard,
  dtMs: number,
  rng: Rng,
) => readonly BgUnitId[];

export interface BgMatchOpts {
  world: BgWorld;
  seed: number;
  /** How often the strategy layer re-decides, ms. §6a: ~1 Hz. */
  strategyMs?: number;
  /** Per-team override of `strategyMs` — the difficulty tier's honest reaction axis (§6a). */
  strategyMsByTeam?: Partial<Record<BgTeam, number>>;
  /** Resolve one tick of one engagement. Omit it when combat lives somewhere else (the BG
   *  screen's endless session): the world then stops building shards nothing reads. */
  resolveShard?: ShardResolver;
  /** Where a dead unit of `team` respawns. */
  graveyard: (team: BgTeam) => { x: number; y: number };
  /** Respawn cycle, ms. Cite: BattleGround.h 30 s resurrection cycle. */
  respawnMs?: number;
  // Units the player is commanding right now. Without this the strategy layer overwrites every RTS order
  // within one second, so a click-to-move on an ally does nothing visible.
  playerCommanded?: (id: BgUnitId) => boolean;
}

export interface BgMatchStats {
  ticks: number;
  /** Peak simultaneous engagement shards — what the budget in §8a is spent on. */
  peakShards: number;
  /** Largest single shard, in units. Must stay under the W1-measured session ceiling. */
  peakShardUnits: number;
  /** Sum of shards over ticks / ticks. */
  meanShards: number;
  deaths: number;
}

export class BgMatch {
  readonly world: BgWorld;
  private readonly rng: Rng;
  private readonly strategyMs: Record<BgTeam, number>;
  private readonly resolveShard: ShardResolver | null;
  private readonly graveyard: (team: BgTeam) => { x: number; y: number };
  private readonly respawnMs: number;
  private readonly playerCommanded: ((id: BgUnitId) => boolean) | null;
  private nextStrategyAt: Record<BgTeam, number> = { alliance: -Infinity, horde: -Infinity };

  ticks = 0;
  peakShards = 0;
  peakShardUnits = 0;
  private shardSum = 0;
  deaths = 0;

  constructor(o: BgMatchOpts) {
    this.world = o.world;
    this.rng = mulberry32(hashSeed(o.seed, 0x62676d74)); // "bgmt"
    const base = o.strategyMs ?? 1000;
    this.strategyMs = {
      alliance: o.strategyMsByTeam?.alliance ?? base,
      horde: o.strategyMsByTeam?.horde ?? base,
    };
    this.resolveShard = o.resolveShard ?? null;
    if (!this.resolveShard) this.world.trackShards = false;
    this.graveyard = o.graveyard;
    this.respawnMs = o.respawnMs ?? 30_000;
    this.playerCommanded = o.playerCommanded ?? null;
  }

  // Re-decide every living unit's order from its team's view — the ONLY place a bot order is
  // produced. No arg = both teams; tick() passes one so tiers can pace teams apart.
  runStrategy(only?: BgTeam): void {
    for (const team of only ? [only] : (['alliance', 'horde'] as const)) {
      const view = this.world.viewFor(team);
      const cache = new Map<string, ReturnType<typeof bgActionsOf>>();
      for (const u of view.own) {
        if (!u.alive) continue;
        const unit = this.world.units.get(u.id);
        if (!unit || unit.human) continue; // a human's orders are their own
        if (this.playerCommanded?.(u.id)) continue; // …and so are the ones they issued
        let actions = cache.get(u.role);
        if (!actions) {
          actions = bgActionsOf(strategiesForRole(u.role));
          cache.set(u.role, actions);
        }
        const picked = pickBgOrder(u, view, actions);
        if (picked) this.world.issue(u.id, picked.order, team);
      }
    }
  }

  /** One world tick: strategy (at its own rate) → movement → shards → combat → deaths. */
  tick(dtMs = this.world.tickMs): void {
    for (const team of ['alliance', 'horde'] as const) {
      if (this.world.t >= this.nextStrategyAt[team]) {
        this.runStrategy(team);
        this.nextStrategyAt[team] = this.world.t + this.strategyMs[team];
      }
    }

    const stats = this.world.tick(dtMs);
    this.ticks++;
    this.shardSum += stats.shards;
    if (stats.shards > this.peakShards) this.peakShards = stats.shards;
    if (stats.largestShard > this.peakShardUnits) this.peakShardUnits = stats.largestShard;

    if (this.resolveShard && this.world.gatesOpen && !this.world.ended) {
      for (const shard of this.world.currentShards()) {
        const dead = this.resolveShard(this.world, shard, dtMs, this.rng);
        for (const id of dead) {
          const u = this.world.units.get(id);
          // Guard on "already registered dead", NOT alive(): a unit the resolver just took to 0 hp
          // is already !alive, so that guard skipped kill() and the roster piled up as corpses.
          if (!u || u.deadUntilMs != null) continue;
          this.world.kill(u, this.respawnMs);
          this.deaths++;
        }
      }
    }

  }

  stats(): BgMatchStats {
    return {
      ticks: this.ticks,
      peakShards: this.peakShards,
      peakShardUnits: this.peakShardUnits,
      meanShards: this.ticks ? this.shardSum / this.ticks : 0,
      deaths: this.deaths,
    };
  }

  // Contribution points for one honorable kill at `level` (Formulas.h hk_honor_at_level). BG bonus honor
  // uses the same function — wire score screens through this, not a curve.
  honorForKill(level: number, count = 1): number {
    return hkHonorAtLevel(level, count);
  }
}

/** Classes that can hold someone up: paladin, priest, druid, shaman. Cite: domain/ids CLASS. */
const HEALER_CLASSES = new Set([2, 5, 7, 11]);

// A deliberately simple shard resolver for probes and auto-resolve: units in contact chip the
// nearest enemy and healers top up allies. Without the healing half, 112 pickups gave 2 captures.
export function attritionResolver(dpsPerSecond = 60, hpsPerSecond = dpsPerSecond * 0.55): ShardResolver {
  return (world, shard, dtMs, rng) => {
    const dead: BgUnitId[] = [];
    const units = shard.units.map((id) => world.units.get(id)!).filter((u) => world.alive(u));
    const dt = dtMs / 1000;
    for (const u of units) {
      if (HEALER_CLASSES.has(u.cls)) {
        // Heal the most hurt friendly in the shard, self included.
        let target: BgUnit | null = null;
        let worst = Infinity;
        for (const o of units) {
          if (o.team !== u.team || !world.alive(o)) continue;
          const pct = o.hp / Math.max(1, o.maxHp);
          if (pct < worst) { worst = pct; target = o; }
        }
        if (target && worst < 1) {
          target.hp = Math.min(target.maxHp, target.hp + hpsPerSecond * dt);
          continue; // healing IS this unit's action for the tick
        }
      }
      const foe = pickFoe(world, u, units, rng);
      if (!foe) continue;
      foe.hp -= dpsPerSecond * dt;
      if (foe.hp <= 0 && !dead.includes(foe.id)) {
        dead.push(foe.id);
        // `u` landed the killing chip — the only place the killer is known, and what the
        // weekly standing list is built from. Cite: Player.cpp:6626 RewardHonor.
        world.creditKill(u.id, foe.id);
      }
    }
    return dead;
  };
}

/** Yards within which two foes count as equally close, so the pick is a real choice. */
const FOE_TIE_YD = 8;

// Nearest enemy, with ties broken from the seeded stream. The tie-break is what makes the seed mean
// anything: strict nearest-first never touched the rng, so five seeds produced one identical match.
function pickFoe(world: BgWorld, u: BgUnit, pool: BgUnit[], rng: Rng): BgUnit | null {
  let bd = Infinity;
  for (const o of pool) {
    if (o.team === u.team || !world.alive(o)) continue;
    const d = world.distance(u, o);
    if (d < bd) bd = d;
  }
  if (!Number.isFinite(bd)) return null;
  const close: BgUnit[] = [];
  for (const o of pool) {
    if (o.team === u.team || !world.alive(o)) continue;
    if (world.distance(u, o) <= bd + FOE_TIE_YD) close.push(o);
  }
  if (close.length <= 1) return close[0] ?? null;
  return close[Math.min(close.length - 1, Math.floor(rng.next() * close.length))]!;
}
