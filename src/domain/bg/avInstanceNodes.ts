/**
 * Alterac Valley's nodes and mines, for the instance surface.
 *
 * Operator direction (2026-09-01): "all AV things needs to stay, rest shud be exact same as raid".
 * The reinforcement race already rides the run as a pure read (avInstanceScore). Capture does not:
 * a node has an OWNER and an assault CLOCK, which is state, so it lives on `InstanceRun` beside the
 * rest of the floor's progress and is restored on a re-mount like everything else there.
 *
 * The rules, all from the same source `av.ts` reads for the battleground screen:
 *
 *   - a click starts an assault, 10 s              (AV_CAPTURE_CAST_MS, BattleGroundAV.h)
 *   - an assault matures to owned after 4 minutes  (AV_CAPTIME_MS, BattleGroundAV.h:296-300)
 *   - you may assault anything you do not own, and re-take your own assaulted point
 *     (avClaimIntent — .cpp:687/:645 refuse an assault by the current owner)
 *   - each mine you hold pays one reinforcement every 45 s  (AV_MINE_TICK_MS, .h:28-29)
 *
 * TOWERS ARE NOT HERE. On this surface a tower falls when its garrison dies, and that is already an
 * encounter — `avInstanceScore` reads it off `defeated` and charges the 75. Modelling tower capture
 * again would be two owners for one fact, which is the exact mistake that made the old AV screen
 * jiggle. This module owns the SEVEN graveyards and the TWO mines, and nothing else.
 */

import type { InstanceRun } from '../../world/instances.ts';
import { AV_DATA, AV_MINES, AV_NODES, type AvTeam } from '../../data/alteracValley.ts';
import { AV_CAPTIME_MS, AV_CAPTURE_CAST_MS, AV_MINE_TICK_MS } from './av.ts';
import { detHypot } from '../../engine/core/detMath.ts';

/** How close you must stand to claim a point. Cite: ObjectDefines.h:25 INTERACTION_DISTANCE is 5 yd
 *  for a click, but a flag is claimed from its base — av.ts uses the node radius the world does. */
export const AV_NODE_CLAIM_YD = 12;

export type AvNodeState = 'owned' | 'assaulted';

export interface AvNodeStatus {
  id: string;
  name: string;
  kind: 'graveyard' | 'tower';
  owner: AvTeam | null;
  state: AvNodeState;
  /** Run-clock ms the assault matures on; absent while owned. */
  maturesAtMs?: number;
  x: number;
  y: number;
  z: number;
}

/** Persisted shape — kept narrow so a save carries the least that rebuilds the board. */
export type AvNodeSave = { o: AvTeam | null; s: AvNodeState; m?: number };

/** Graveyards only: towers are encounters (see the header). */
export function avCaptureNodes(): typeof AV_NODES {
  return AV_NODES.filter((n) => n.kind === 'graveyard');
}

/** The board, defaults from the DB where the run has said nothing yet. */
export function avNodeBoard(run: InstanceRun): AvNodeStatus[] {
  const saved = run.avNodes ?? {};
  return avCaptureNodes().map((n) => {
    const s = saved[n.id];
    const out: AvNodeStatus = {
      id: n.id,
      name: n.name,
      kind: n.kind,
      owner: s ? s.o : n.owner,
      state: s ? s.s : 'owned',
      x: n.x,
      y: n.y,
      z: n.z,
    };
    if (s?.m != null) out.maturesAtMs = s.m;
    return out;
  });
}

/**
 * May `team` claim this node right now? Mirrors av.ts avClaimIntent: never your own controlled
 * point, and an assaulted point is claimable by anyone but the side that started the assault.
 */
export function avClaimable(node: AvNodeStatus, team: AvTeam): boolean {
  if (node.state === 'owned') return node.owner !== team;
  return node.owner !== team;
}

/** Nodes within claim range of a point, closest first. */
export function avNodesInReach(
  run: InstanceRun,
  at: { x: number; y: number },
  yd = AV_NODE_CLAIM_YD,
): AvNodeStatus[] {
  return avNodeBoard(run)
    .map((n) => ({ n, d: detHypot(n.x - at.x, n.y - at.y) }))
    .filter((r) => r.d <= yd)
    .sort((a, b) => a.d - b.d)
    .map((r) => r.n);
}

function writeNode(run: InstanceRun, id: string, row: AvNodeSave): void {
  const next: Record<string, AvNodeSave> = { ...(run.avNodes ?? {}) };
  next[id] = row;
  run.avNodes = next;
}

/**
 * Start an assault on `id` for `team`. Returns the ms the assault matures on, or null when the
 * node is not claimable. The 10 s cast is the CALLER's (a cast bar); this records the outcome.
 */
export function avBeginAssault(
  run: InstanceRun,
  id: string,
  team: AvTeam,
  nowMs: number,
): number | null {
  const node = avNodeBoard(run).find((n) => n.id === id);
  if (!node || !avClaimable(node, team)) return null;
  const matures = nowMs + AV_CAPTIME_MS;
  writeNode(run, id, { o: team, s: 'assaulted', m: matures });
  return matures;
}

/** Mature every assault whose clock has run out. Returns the ids that flipped to owned. */
export function avSettleAssaults(run: InstanceRun, nowMs: number): string[] {
  const flipped: string[] = [];
  for (const n of avNodeBoard(run)) {
    if (n.state !== 'assaulted' || n.maturesAtMs == null) continue;
    if (nowMs < n.maturesAtMs) continue;
    writeNode(run, n.id, { o: n.owner, s: 'owned' });
    flipped.push(n.id);
  }
  return flipped;
}

// ---- mines ----------------------------------------------------------------

export interface AvMineStatus {
  id: string;
  name: string;
  owner: AvTeam | null;
}

/** Both mines, neutral until a side takes one. Cite: BattleGroundAV.cpp:104-113. */
export function avMineBoard(run: InstanceRun): AvMineStatus[] {
  const saved = run.avMines ?? {};
  return AV_MINES.map((m) => ({ id: m.id, name: m.name, owner: saved[m.id] ?? null }));
}

export function avSetMineOwner(run: InstanceRun, id: string, team: AvTeam): void {
  run.avMines = { ...(run.avMines ?? {}), [id]: team };
}

/**
 * Pay every held mine's 45 s tick since the last call, and bank the result on the run.
 * Returns the reinforcements `team` gained this call. Cite: BattleGroundAV.cpp:319-341.
 */
export function avMineTick(run: InstanceRun, team: AvTeam, nowMs: number): number {
  const held = avMineBoard(run).filter((m) => m.owner === team).length;
  const last = run.avMineTickAtMs ?? nowMs;
  if (!held) { run.avMineTickAtMs = nowMs; return 0; }
  const ticks = Math.floor((nowMs - last) / AV_MINE_TICK_MS);
  if (ticks <= 0) return 0;
  run.avMineTickAtMs = last + ticks * AV_MINE_TICK_MS;
  const gained = ticks * held;
  run.avMineIncome = (run.avMineIncome ?? 0) + gained;
  return gained;
}

/** The capture cast a click owes, so a caller never re-derives it. */
export const AV_ASSAULT_CAST_MS = AV_CAPTURE_CAST_MS;
/** Match-clock ms an assault needs to mature. */
export const AV_ASSAULT_MATURE_MS = AV_CAPTIME_MS;
/** Graveyard a dead raider of `team` should rez at — the held one nearest the corpse. */
export function avNearestOwnedGraveyard(
  run: InstanceRun,
  team: AvTeam,
  at: { x: number; y: number },
): AvNodeStatus | null {
  const held = avNodeBoard(run).filter((n) => n.owner === team && n.state === 'owned');
  if (!held.length) return null;
  let best = held[0]!;
  let bestD = Infinity;
  for (const n of held) {
    const d = detHypot(n.x - at.x, n.y - at.y);
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
}

/** Start-of-match defaults, so a fresh run shows the DB's own board. */
export function avSeedBoard(run: InstanceRun): void {
  if (run.avNodes) return;
  const seed: Record<string, AvNodeSave> = {};
  for (const n of avCaptureNodes()) seed[n.id] = { o: n.owner, s: 'owned' };
  run.avNodes = seed;
  run.avMines = {};
  run.avMineTickAtMs = 0;
  run.avMineIncome = 0;
  void AV_DATA;
}
