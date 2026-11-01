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
          this.world.kill(u, this.respawnWaitMs());
          this.deaths++;
        }
      }
    }

  }

  // The spirit healer raises everyone waiting at once, every respawnMs on the match clock; a body that
  // fell just before the wave has not released yet and waits for the next. Cite: BattleGround.cpp
  // RESURRECTION_INTERVAL, m_LastResurrectTime. Per-death timers made the dead trickle back one at a
  // time, each walking alone into the side that had just killed them: 95 deaths, 0-0 after 20 minutes.
  respawnWaitMs(): number {
    const cycle = this.respawnMs;
    if (!(cycle > 0)) return 0;
    const t = this.world.t;
    let wait = cycle - (((t % cycle) + cycle) % cycle);
    if (wait < RELEASE_MS) wait += cycle;
    return wait;
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

/** A body that fell this close to the wave misses it: the ghost has not released yet. */
const RELEASE_MS = 3000;

/** Classes that can hold someone up: paladin, priest, druid, shaman. Cite: domain/ids CLASS. */
const HEALER_CLASSES = new Set([2, 5, 7, 11]);

// A seat heals if its roster role says so; a seat with no role falls back to the class. The class
// alone made six of ten bodies a side "healers" on a real roster (every paladin, priest, shaman and
// druid), so four attackers chipped at six healers and a 10v10 ran minutes without a death.
const isHealer = (u: BgUnit): boolean => u.heals ?? HEALER_CLASSES.has(u.cls);

// The body the flat rates were tuned on: a level-60 seat. Damage and healing scale with the FIELD's
// average pool, so a level-20 field of 560-hp bodies trades as a level-60 field of 3,000 does, while
// a 970-hp warrior on it still outlasts a 380-hp warlock. Flat 60 dps killed a level-22 flag carrier
// in nine seconds, so every pickup was a drop and a 12-minute match ended 0-0. Scaling by the
// target's own pool was the first fix and made every body die in the same time, hp or no hp.
export const ATTRITION_REF_HP = 3000;

/** The field's mean max hp over the reference, recomputed once per match tick. */
function poolScale(world: BgWorld, cache: { t: number; scale: number }): number {
  if (cache.t === world.t) return cache.scale;
  let sum = 0;
  let n = 0;
  for (const u of world.units.values()) { sum += u.maxHp; n++; }
  cache.t = world.t;
  cache.scale = n ? (sum / n) / ATTRITION_REF_HP : 1;
  return cache.scale;
}

// A deliberately simple shard resolver for probes and auto-resolve: each side focuses one enemy (the
// flag carrier if one is in the shard, else the most hurt) and healers top up allies. Without the
// healing half, 112 pickups gave 2 captures; with "nearest" targeting instead of a focus, two healers
// a side out-healed a 10v10 indefinitely.
export function attritionResolver(dpsPerSecond = 60, hpsPerSecond = dpsPerSecond * 0.55): ShardResolver {
  // Who each attacker hit last tick, so a side stays on its target until it drops.
  const lastTarget = new WeakMap<BgUnit, BgUnit>();
  const pool = { t: NaN, scale: 1 };
  return (world, shard, dtMs, rng) => {
    const scale = poolScale(world, pool);
    const dead: BgUnitId[] = [];
    const units = shard.units.map((id) => world.units.get(id)!).filter((u) => world.alive(u));
    const dt = dtMs / 1000;
    const focus: Record<BgTeam, BgUnit | null> = {
      alliance: pickFocus(world, 'alliance', units, rng, lastTarget),
      horde: pickFocus(world, 'horde', units, rng, lastTarget),
    };
    for (const u of units) {
      // Dropped earlier this tick: no dead man's swing. The side iterated first used to take one from
      // every body it killed, since the corpse's own turn still came round.
      if (u.hp <= 0) continue;
      if (isHealer(u)) {
        // Heal the most hurt friendly in the shard, self included.
        let target: BgUnit | null = null;
        let worst = Infinity;
        for (const o of units) {
          if (o.team !== u.team || !world.alive(o)) continue;
          const pct = o.hp / Math.max(1, o.maxHp);
          if (pct < worst) { worst = pct; target = o; }
        }
        if (target && worst < 1) {
          target.hp = Math.min(target.maxHp, target.hp + hpsPerSecond * dt * scale);
          continue; // healing IS this unit's action for the tick
        }
      }
      // The focus fell this tick: the rest of the side turns to the next one.
      let foe = focus[u.team];
      if (foe && !world.alive(foe)) foe = focus[u.team] = pickFocus(world, u.team, units, rng, lastTarget);
      if (!foe) continue;
      lastTarget.set(u, foe);
      foe.hp -= dpsPerSecond * dt * scale;
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

/** Health fraction within which two foes count as equally hurt, so the pick is a real choice. */
const FOCUS_TIE_PCT = 0.1;

// One side's target in a shard: the enemy carrying a flag; else the target the side was already on,
// while it stands; else the most hurt enemy, ties broken from the seeded stream. The tie-break is
// what makes the seed mean anything: a strict pick never touched the rng, so five seeds produced one
// identical match. Sticking matters as much as focusing: re-picking "most hurt" every tick with a
// tie band spread the damage over every body in reach, so a 10v10 ran 70 s with no death and then
// seven bodies fell in the same five seconds.
function pickFocus(world: BgWorld, team: BgTeam, pool: BgUnit[], rng: Rng, lastTarget: WeakMap<BgUnit, BgUnit>): BgUnit | null {
  const foes = pool.filter((o) => o.team !== team && world.alive(o));
  if (!foes.length) return null;
  const carriers = foes.filter((o) => o.carryingFlag);
  if (!carriers.length) {
    for (const u of pool) {
      if (u.team !== team || !world.alive(u)) continue;
      const held = lastTarget.get(u);
      if (held && foes.includes(held)) return held;
    }
  }
  const among = carriers.length ? carriers : foes;
  let worst = Infinity;
  for (const o of among) worst = Math.min(worst, o.hp / Math.max(1, o.maxHp));
  const close = among.filter((o) => o.hp / Math.max(1, o.maxHp) <= worst + FOCUS_TIE_PCT);
  if (close.length <= 1) return close[0] ?? null;
  return close[Math.min(close.length - 1, Math.floor(rng.next() * close.length))]!;
}
