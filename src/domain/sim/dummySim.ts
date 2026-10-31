// Target Dummy Sim Lab: bench the rotation you are editing against a real dummy creature_template,
// over N seeded fights, and report what a theorycrafter reads — DPS spread, the per-ability table,
// the attack-table split, and power spent per point of damage.
//
// It is the PRODUCT's own combat path, not a second model: a JSON clone of the live GameState, the
// same `game.beginFight` a world pull uses, the same `pickCombatAbility` bridge auto-combat asks
// every tick, and the shipped DPSMate meter for the numbers. Cite: src/dev/sim-rotations.mjs, the
// headless parse this is the player-facing half of.

import type { DataStore } from '../../data/dataStore.ts';
import type { GameState } from '../../engine/game.ts';
import { createGame } from '../../engine/game.ts';
import type { CombatSession, CombatAction } from '../../engine/combat.ts';
import { setEnemyHpHold } from '../../engine/game/combatEnemySpec.ts';
import { pickCombatAbility, pickOocAction, useOocPrepItem } from '../../autopilot/combatRotation.ts';
import { createDpsMateMeter, type DpsMateMeter } from '../bots/dpsMate.ts';
import { UNIT_FLAG } from '../creature/unitFlags.ts';
import { maxHealth, maxPower, powerType } from '../character/character.ts';
import type { PowerType } from '../../data/schema.ts';
import type { Rotation } from '../rotation/rotation.ts';

/** One engine tick. The whole game advances in exact 100 ms steps. Cite: combatView.ts:3008. */
export const SIM_ROUND_MS = 100;

// The dummy must outlast the parse or every iteration measures a different fight length. Same
// fixture combatEnemySpec.ts:22 already carries for sustained-load captures.
const DUMMY_HP_HOLD = 5_000;

export interface DummySimOptions {
  /** creature_template.entry of the dummy. */
  entry: number;
  /** How many separate fights to parse. */
  iterations: number;
  /** Seconds of combat per fight. */
  fightSecs: number;
  /** Base rng seed; iteration i runs on a derived one. */
  seed: number;
}

export interface DummySimAbilityRow {
  name: string;
  casts: number;
  damage: number;
  healing: number;
  /** Share of the parse's total damage, 0-100. */
  damagePct: number;
  minHit: number;
  maxHit: number;
  avgHit: number;
  hits: number;
  crits: number;
  misses: number;
  dodges: number;
  parries: number;
  blocks: number;
  resists: number;
  glancing: number;
  crushing: number;
  /** Crit share of landed attempts, 0-100. */
  critPct: number;
  /** Miss + dodge + parry + full resist share of all attempts, 0-100. */
  missPct: number;
  /** Aura / DoT seconds this ability held, summed over the parse. */
  uptimeSec: number;
}

export interface DummySimReport {
  target: {
    entry: number;
    name: string;
    level: number;
    armor: number;
    /** The dummy holds still for the parse (UNIT_FLAG_STUNNED). */
    stunned: boolean;
  };
  iterations: number;
  fightSecs: number;
  /** Engine ticks actually simulated. One round = 100 ms. */
  rounds: number;
  /** Per-iteration DPS, in run order. */
  samples: number[];
  dps: { min: number; avg: number; max: number; median: number; stdev: number };
  /** Damage in one fight. */
  damage: { min: number; avg: number; max: number };
  power: {
    type: PowerType;
    /** Average spent per fight. */
    spent: number;
    /** Average regained per fight (ticks, potions, Evocation). */
    regained: number;
    /** Damage per point spent. 0 when the class spends nothing. */
    damagePerPoint: number;
    /** Fights that ended under 5% of the pool. */
    oomFights: number;
  };
  /** Attack-table split over every ability, whole parse. */
  totals: {
    casts: number;
    hits: number;
    crits: number;
    misses: number;
    dodges: number;
    parries: number;
    blocks: number;
    resists: number;
    glancing: number;
    crushing: number;
    critPct: number;
    missPct: number;
    castsPerMin: number;
    /** Rounds the rotation had nothing to press while free to act, as a share of the parse. */
    idlePct: number;
  };
  abilities: DummySimAbilityRow[];
  /** Fights the player did not survive; their damage still counts, over their alive time. */
  deaths: number;
  /** Set when an iteration could not open — nothing else in the report is meaningful. */
  refusedReason?: string;
}

export interface DummySimRun {
  readonly iterations: number;
  /** Iterations finished so far. */
  readonly completed: number;
  readonly done: boolean;
  /** Run rounds until `budgetMs` of wall clock is spent, or the run ends. */
  step(budgetMs: number): void;
  /** The report as of now. Safe mid-run — it reads only completed iterations. */
  report(): DummySimReport;
}

const round1 = (v: number): number => Math.round(v * 10) / 10;
const round2 = (v: number): number => Math.round(v * 100) / 100;

/** ds with one creature row forced stunned, so the dummy stands there for the parse. */
function stunnedDummyStore(ds: DataStore, entry: number): DataStore {
  return {
    ...ds,
    creature: (e: number) => {
      const def = ds.creature(e);
      if (!def || e !== entry) return def;
      return { ...def, unitFlags: (def.unitFlags ?? 0) | UNIT_FLAG.STUNNED };
    },
  };
}

interface IterationTally {
  damage: number;
  aliveSec: number;
  spent: number;
  regained: number;
  died: boolean;
  oom: boolean;
}

interface LiveIteration {
  session: CombatSession;
  state: GameState;
  rot: Rotation;
  tally: IterationTally;
  poolMax: number;
  ticks: number;
  /** Round index the GCD from the last issued spell frees up on. */
  busyUntil: number;
}

/**
 * Build the sim. `state` is read, never written: every iteration runs on its own JSON clone, the
 * same round trip saveShape.ts:108 already puts a GameState through.
 */
export function createDummySim(
  ds: DataStore,
  state: GameState,
  rotation: Rotation,
  opts: DummySimOptions,
  nowMs: () => number,
): DummySimRun {
  const simDs = stunnedDummyStore(ds, opts.entry);
  const def = simDs.creature(opts.entry);
  const baseJson = JSON.stringify({ ...state, rotation });
  const maxRounds = Math.max(1, Math.round((opts.fightSecs * 1000) / SIM_ROUND_MS));

  const meter: DpsMateMeter = createDpsMateMeter();
  const tallies: IterationTally[] = [];
  let refusedReason: string | undefined;
  let completed = 0;
  let rounds = 0;
  let idleRounds = 0;
  let pool: PowerType = 'mana';
  let live: LiveIteration | null = null;

  const openIteration = (): boolean => {
    const st = JSON.parse(baseJson) as GameState;
    st.rngSeed = (opts.seed + completed * 7919) >>> 0;
    st.fightCounter = 0;
    // A dummy parse is solo by definition: a squad body would take the dummy's attention and land
    // its own damage in the meter.
    st.squad = [];
    pool = powerType(st.char);
    const game = createGame(simDs, st);

    // The buffs phase, run the way a pull runs it. Skipping it benches every self-toggle off —
    // Shadowform, Inner Fire, Aspect of the Hawk, the shaman imbues. Cite: liveRunControl.ts:683.
    for (let i = 0; i < 24; i++) {
      const action = pickOocAction(game.rotation(), st, simDs);
      if (!action) break;
      if (action.kind === 'spell') {
        if (!game.castOutOfCombat(action.spellId).ok) break;
      } else if (action.kind === 'item') {
        if (!useOocPrepItem(game, action)) break;
      } else break;
    }
    // Buffing costs mana and the product never pulls off the cast — the rest window follows it.
    // Cite: liveRunControl.ts:715 doReadyDrink.
    const poolMax = Math.max(1, maxPower(st.char, simDs));
    st.char.health = maxHealth(st.char, simDs);
    st.char.power = pool === 'rage' ? 0 : maxPower(st.char, simDs);

    setEnemyHpHold(DUMMY_HP_HOLD);
    let began;
    try {
      began = game.beginFight(opts.entry);
    } finally {
      setEnemyHpHold(1);
    }
    if (!began.ok) {
      refusedReason = began.reason;
      return false;
    }
    meter.beginFight();
    live = {
      session: began.session,
      state: st,
      rot: game.rotation(),
      tally: { damage: 0, aliveSec: 0, spent: 0, regained: 0, died: false, oom: false },
      poolMax,
      ticks: 0,
      busyUntil: 0,
    };
    return true;
  };

  const closeIteration = (): void => {
    if (!live) return;
    const snap = meter.snapshot('damage', 'fight');
    const me = snap.actors.find((a) => a.id === 'player');
    // Rate over the seconds the player was ALIVE. Dividing by the whole parse credits a corpse with
    // the time it spent dead. Cite: sim-rotations.mjs.
    const aliveSec = live.tally.died
      ? Math.max(0.1, live.tally.aliveSec)
      : Math.max(0.1, (live.ticks * SIM_ROUND_MS) / 1000);
    live.tally.damage = me?.damage ?? 0;
    live.tally.aliveSec = aliveSec;
    live.tally.oom = pool === 'mana' && (live.state.char.power ?? 0) < live.poolMax * 0.05;
    tallies.push(live.tally);
    completed++;
    live = null;
  };

  const runRound = (): void => {
    if (!live) return;
    const cur = live;
    let action: CombatAction | undefined;
    try {
      action = pickCombatAbility(cur.session, cur.rot, cur.state, simDs, opts.entry) ?? undefined;
    } catch {
      // A rotation the bridge cannot evaluate must not take the panel down: the round counts as
      // idle and the parse carries on.
      action = undefined;
    }
    // CombatAction is a bare spell id, a { spell } record, an { item } use, or null.
    const spellId = typeof action === 'number'
      ? action
      : (action && 'spell' in action ? action.spell : 0);
    if (spellId > 0) {
      const gcdMs = ds.spell(spellId)?.gcdMs ?? 0;
      if (gcdMs > 0) cur.busyUntil = Math.max(cur.busyUntil, cur.ticks + Math.ceil(gcdMs / SIM_ROUND_MS));
    }
    // Idle is a round the rotation passed on while FREE: counting every actionless round reads 96%
    // on a 3 s-cast caster, which is cast time, and on a melee, which auto-attacks through a null.
    if (!action && cur.ticks >= cur.busyUntil && cur.session.playerView().casting == null) idleRounds++;
    const events = cur.session.tick(action) ?? [];
    meter.ingest(events);
    for (const e of events) {
      if (e.kind === 'resource' && e.actor === 'player' && e.power === pool) {
        if (e.delta < 0) cur.tally.spent += -e.delta;
        else cur.tally.regained += e.delta;
      } else if (e.kind === 'death' && e.actor === 'player' && !cur.tally.died) {
        cur.tally.died = true;
        cur.tally.aliveSec = e.t / 1000;
      }
    }
    cur.ticks++;
    rounds++;
    if (cur.session.ended || cur.ticks >= maxRounds) closeIteration();
  };

  return {
    iterations: opts.iterations,
    get completed(): number { return completed; },
    get done(): boolean { return completed >= opts.iterations || refusedReason != null; },
    step(budgetMs: number): void {
      const until = nowMs() + Math.max(1, budgetMs);
      while (completed < opts.iterations && refusedReason == null) {
        if (!live && !openIteration()) break;
        runRound();
        if (nowMs() >= until) break;
      }
    },
    report(): DummySimReport {
      const snap = meter.snapshot('damage', 'run');
      const me = snap.actors.find((a) => a.id === 'player');
      const samples = tallies.map((t) => t.damage / t.aliveSec);
      const sorted = [...samples].sort((a, b) => a - b);
      const n = sorted.length;
      const avg = n ? samples.reduce((a, b) => a + b, 0) / n : 0;
      const variance = n > 1 ? samples.reduce((a, b) => a + (b - avg) ** 2, 0) / (n - 1) : 0;
      const dmgs = tallies.map((t) => t.damage);
      const totalDamage = dmgs.reduce((a, b) => a + b, 0);
      const spent = tallies.reduce((a, t) => a + t.spent, 0);
      const regained = tallies.reduce((a, t) => a + t.regained, 0);

      const rows = (me?.abilities ?? [])
        .filter((a) => a.casts > 0 || a.damage > 0 || a.healing > 0)
        .sort((a, b) => (b.damage + b.healing) - (a.damage + a.healing));
      const landed = (a: { hits: number; crits: number; glancing: number; blocks: number; crushing: number }): number =>
        a.hits + a.crits + a.glancing + a.blocks + a.crushing;
      const avoided = (a: { misses: number; dodges: number; parries: number; resists: number }): number =>
        a.misses + a.dodges + a.parries + a.resists;

      const tot = {
        casts: 0, hits: 0, crits: 0, misses: 0, dodges: 0, parries: 0,
        blocks: 0, resists: 0, glancing: 0, crushing: 0,
      };
      for (const a of rows) {
        tot.casts += a.casts; tot.hits += a.hits; tot.crits += a.crits;
        tot.misses += a.misses; tot.dodges += a.dodges; tot.parries += a.parries;
        tot.blocks += a.blocks; tot.resists += a.resists;
        tot.glancing += a.glancing; tot.crushing += a.crushing;
      }
      const totLanded = landed(tot);
      const totAttempts = totLanded + avoided(tot);
      const aliveSec = tallies.reduce((a, t) => a + t.aliveSec, 0);

      return {
        target: {
          entry: opts.entry,
          name: def?.name ?? `Creature ${opts.entry}`,
          level: def?.level ?? 0,
          armor: def?.armor ?? 0,
          stunned: true,
        },
        iterations: opts.iterations,
        fightSecs: opts.fightSecs,
        rounds,
        samples: samples.map(round1),
        dps: {
          min: round1(n ? sorted[0] : 0),
          avg: round1(avg),
          max: round1(n ? sorted[n - 1] : 0),
          median: round1(n ? (n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2) : 0),
          stdev: round1(Math.sqrt(variance)),
        },
        damage: {
          min: Math.round(n ? Math.min(...dmgs) : 0),
          avg: Math.round(n ? totalDamage / n : 0),
          max: Math.round(n ? Math.max(...dmgs) : 0),
        },
        power: {
          type: pool,
          spent: Math.round(n ? spent / n : 0),
          regained: Math.round(n ? regained / n : 0),
          damagePerPoint: spent > 0 ? round2(totalDamage / spent) : 0,
          oomFights: tallies.filter((t) => t.oom).length,
        },
        totals: {
          ...tot,
          critPct: totLanded ? round1((tot.crits / totLanded) * 100) : 0,
          missPct: totAttempts ? round1((avoided(tot) / totAttempts) * 100) : 0,
          castsPerMin: aliveSec > 0 ? round1((tot.casts / aliveSec) * 60) : 0,
          idlePct: rounds ? round1((idleRounds / rounds) * 100) : 0,
        },
        abilities: rows.map((a) => {
          const lands = landed(a);
          const attempts = lands + avoided(a);
          return {
            name: a.name,
            casts: a.casts,
            damage: Math.round(a.damage),
            healing: Math.round(a.healing),
            damagePct: totalDamage > 0 ? round1((a.damage / totalDamage) * 100) : 0,
            minHit: Math.round(a.minHit),
            maxHit: Math.round(a.maxHit),
            avgHit: Math.round(a.avgHit),
            hits: a.hits, crits: a.crits, misses: a.misses,
            dodges: a.dodges, parries: a.parries, blocks: a.blocks,
            resists: a.resists, glancing: a.glancing, crushing: a.crushing,
            critPct: lands ? round1((a.crits / lands) * 100) : 0,
            missPct: attempts ? round1((avoided(a) / attempts) * 100) : 0,
            uptimeSec: round1(a.uptimeMs / 1000),
          };
        }),
        deaths: tallies.filter((t) => t.died).length,
        refusedReason,
      };
    },
  };
}
