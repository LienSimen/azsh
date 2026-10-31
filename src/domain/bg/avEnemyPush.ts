/**
 * The other side's push, simulated as ONE agent instead of forty bodies.
 *
 * Operator direction (2026-09-01): "there must be an enemy team doing pve tactics as in running to
 * balinda and galv and clearing their way down the lieutenant bosses, and towers etc until they
 * reach base where they capture it and start boss themselves. preferably coded smart where its
 * same fog of war and we dont need to do all their calculations if we dont see them."
 *
 * So this is deliberately NOT a second raid of live bodies. It is a cursor walking the mirror of
 * your own objective list — their captain, their four tower garrisons, their general — on a clock.
 * The valley is 2,800 yards; you cannot see their push from yours, and a body you never see costs
 * nothing to be right about. What you DO see is the consequence, which is the half that matters:
 *
 *   - they take one of your towers   -> you lose 75 reinforcements   (BattleGroundAV.h:62)
 *   - they kill your captain         -> you lose 100                 (BattleGroundAV.h:57)
 *   - they reach and kill YOUR general -> you lose the battle        (BattleGroundAV.cpp:57)
 *
 * That is what makes the 600/600 a RACE rather than a decoration: their bar falls because you push,
 * yours falls because they do, and the first general to die ends it.
 *
 * PACE, and the MARCH is why nobody stands on your captain at the horn. `elapsedMs` is time since
 * the horn (the instance surface's own prep is AV_PREP_MS, and it ends before this clock starts):
 * they walk their gate to the first commander and then commander to commander at BASE_RUN_SPEED
 * over corridor yards — their gate to Galvangar is 1,455 yd straight, so ~6.5 min before they touch
 * him — then FIGHT for `AV_CAPTIME_MS` per objective, AV's own node assault clock and one constant
 * to tune rather than a behaviour tree nobody can see.
 *
 * MATERIALISING. `avEnemyVisible` says whether the player is close enough to the cursor to see the
 * push. A caller that wants real bodies spawns them ONLY then — everywhere else the cursor is the
 * whole simulation. That is the fog of war, and it is why this is cheap.
 */

import { AV_CAPTIME_MS, AV_RES_CAPTAIN, AV_RES_TOWER } from './av.ts';
import { AV_DATA, avNode, type AvTeam } from '../../data/alteracValley.ts';
import { BASE_RUN_SPEED } from '../nav/speed.ts';
import { detHypot } from '../../engine/core/detMath.ts';

/** How near the push you must be to see it at all. */
export const AV_ENEMY_SIGHT_YD = 120;

/** Corridor over straight line, mean 1.94 of the four gate-to-commander legs (routed vs straight
 *  2 yd samples 963/417, 1249/729, 1695/830, 1917/1132). Cite: src/dev/capabilities/avRoute.mjs. */
export const AV_PATH_FACTOR = 1.9;

export type AvEnemyObjectiveKind = 'captain' | 'tower' | 'general';

export interface AvEnemyObjective {
  kind: AvEnemyObjectiveKind;
  /** Creature entry of the commander they are killing. */
  entry: number;
  name: string;
  x: number;
  y: number;
  z: number;
  /** Reinforcements the defender loses when this falls. */
  cost: number;
  /** Where this leg starts — their gate for the first, the last commander after that. */
  from: { x: number; y: number; z: number };
  /** Corridor yards walked on this leg. */
  marchYd: number;
  /** Time on the road before this fight starts, ms. */
  marchMs: number;
}

/** One objective per this many ms of FIGHTING. Cite: AV_CAPTIME_MS, AV's own node assault clock. */
export const AV_ENEMY_OBJECTIVE_MS = AV_CAPTIME_MS;

/** Corridor yards between two field points, and what walking them costs. */
function marchOf(
  from: { x: number; y: number },
  to: { x: number; y: number },
): { marchYd: number; marchMs: number } {
  const marchYd = detHypot(to.x - from.x, to.y - from.y) * AV_PATH_FACTOR;
  return { marchYd, marchMs: (marchYd / BASE_RUN_SPEED) * 1000 };
}

/**
 * What the enemy of `team` works through, in order: your captain, your four towers nearest their
 * gate first, then your general — each leg carrying the walk that reaches it. The mirror of
 * `commandersOf` in data/dungeons/alterac-valley.ts, read off the same bake.
 */
export function avEnemyRoute(team: AvTeam): AvEnemyObjective[] {
  const c = AV_DATA.commanders;
  const foe: AvTeam = team === 'alliance' ? 'horde' : 'alliance';
  const gate = AV_DATA.start[foe] ?? { x: 0, y: 0, z: 0 };
  const out: AvEnemyObjective[] = [];
  let from = { x: gate.x, y: gate.y, z: gate.z ?? 0 };
  const push = (o: Omit<AvEnemyObjective, 'from' | 'marchYd' | 'marchMs'>): void => {
    out.push({ ...o, from, ...marchOf(from, o) });
    from = { x: o.x, y: o.y, z: o.z };
  };

  const captain = c.captain[team];
  if (captain) {
    push({
      kind: 'captain',
      entry: captain.entry,
      name: captain.name,
      x: captain.x,
      y: captain.y,
      z: captain.z,
      cost: AV_RES_CAPTAIN,
    });
  }
  // Your towers, nearest THEIR gate first — the order a push actually meets them.
  const towers = c.lieutenants
    .map((l) => ({ l, node: l.node ? avNode(l.node) : undefined }))
    .filter((r) => r.l.entry != null && r.node != null && r.node.owner === team)
    .sort((a, b) => detHypot(a.node!.x - gate.x, a.node!.y - gate.y)
      - detHypot(b.node!.x - gate.x, b.node!.y - gate.y));
  for (const { l, node } of towers) {
    push({
      kind: 'tower',
      entry: l.entry!,
      name: l.name ?? node!.name,
      x: node!.x,
      y: node!.y,
      z: node!.z,
      cost: AV_RES_TOWER,
    });
  }
  const general = c.boss[team];
  if (general) {
    push({
      kind: 'general',
      entry: general.entry,
      name: general.name,
      x: general.x,
      y: general.y,
      z: general.z,
      // The general ending the battle is not a reinforcement cost — it is the end.
      cost: 0,
    });
  }
  return out;
}

/** On the road, in the fight, or finished. */
export type AvEnemyPhase = 'march' | 'fight' | 'done';

export interface AvEnemyState {
  /** How many objectives they have taken. */
  taken: number;
  /** What they are working on now, or null once the general is down. */
  current: AvEnemyObjective | null;
  /** Reinforcements this push has cost the defender so far. */
  costSoFar: number;
  /** Their general kill — the defender has lost. */
  generalDown: boolean;
  /** Fraction of the current FIGHT done, 0..1 — still 0 while they are walking to it. */
  progress: number;
  phase: AvEnemyPhase;
  /** ms left in this phase; 0 once the push is done. */
  phaseLeftMs: number;
  /** Where the push is right now, interpolated along the leg it is walking. */
  at: { x: number; y: number; z: number };
}

function lerp(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  f: number,
): { x: number; y: number; z: number } {
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f };
}

/**
 * Where the enemy push stands at `elapsedMs`. Pure: the same clock always gives the same board, so
 * nothing has to be ticked, stored or kept in sync, and a re-mount recomputes it exactly.
 */
export function avEnemyStateAt(team: AvTeam, elapsedMs: number): AvEnemyState {
  const route = avEnemyRoute(team);
  const first = route[0];
  if (!first) {
    const nowhere = { x: 0, y: 0, z: 0 };
    return {
      taken: 0, current: null, costSoFar: 0, generalDown: true, progress: 1,
      phase: 'done', phaseLeftMs: 0, at: nowhere,
    };
  }
  let t = Math.max(0, elapsedMs);
  let cost = 0;
  for (let i = 0; i < route.length; i++) {
    const o = route[i]!;
    if (t < o.marchMs) {
      return {
        taken: i, current: o, costSoFar: cost, generalDown: false, progress: 0,
        phase: 'march', phaseLeftMs: o.marchMs - t,
        at: lerp(o.from, o, o.marchMs > 0 ? t / o.marchMs : 1),
      };
    }
    t -= o.marchMs;
    if (t < AV_ENEMY_OBJECTIVE_MS) {
      return {
        taken: i, current: o, costSoFar: cost, generalDown: false,
        progress: t / AV_ENEMY_OBJECTIVE_MS,
        phase: 'fight', phaseLeftMs: AV_ENEMY_OBJECTIVE_MS - t,
        at: { x: o.x, y: o.y, z: o.z },
      };
    }
    t -= AV_ENEMY_OBJECTIVE_MS;
    cost += o.cost;
  }
  const last = route[route.length - 1]!;
  return {
    taken: route.length, current: null, costSoFar: cost, generalDown: true, progress: 1,
    phase: 'done', phaseLeftMs: 0, at: { x: last.x, y: last.y, z: last.z },
  };
}

/** Can the player see the push? Only then is a body worth spawning. */
export function avEnemyVisible(
  state: AvEnemyState,
  at: { x: number; y: number },
  yd = AV_ENEMY_SIGHT_YD,
): boolean {
  if (!state.current) return false;
  return detHypot(state.at.x - at.x, state.at.y - at.y) <= yd;
}
