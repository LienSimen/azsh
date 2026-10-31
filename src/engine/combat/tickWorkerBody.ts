// The sim, running in a Worker (PERF-RUNSHEET S6b). `perf-measure.mjs simOffThread` reads the entry
// file `simWorker.ts`, the pump in `combatView.ts` and the open channel in `combatSession.ts`.
//
// It owns a session built from PLAIN DATA — specs, a seed, a cloneable config — and answers `tick`
// messages with the batch. Everything the tick used to call out for arrives as `SimTickInputs` and
// everything it used to fire arrives back as `SimEffect[]` (mechanisms 2 and 1, already landed).

import type { CombatantSpec, CombatAction, SimTickInputs } from './types.ts';
import type { CombatEvent, Side } from '../core/events.ts';
import type { SimEffect } from './simEffects.ts';
import {
  createPoseFiller, DISCRETE_BY_SIDE, DISCRETE_ZERO,
  type DiscreteSnapshot, type DiscreteWant, type SimPoseFrame,
} from './simSnapshot.ts';
import type { CombatSession } from './session-types.ts';
import type { SimCommand } from './simPump.ts';

/** Everything the far side needs to build the same fight. No functions, no live references. */
export type TickWorkerInit = {
  kind: 'init';
  player: CombatantSpec;
  enemies: CombatantSpec[];
  allies?: CombatantSpec[];
  pet?: CombatantSpec | null;
  seed: number;
  /** Cloneable half of `CombatConfig`. The function-typed members are rebuilt here or arrive per tick. */
  cfg: Record<string, unknown>;
  // One per ally seat, in the same order: the plain-data half of a companion's action provider. The
  // far side rebuilds each with `buildActionProvider` (actionProviderSpec.ts).
  allyProviderSpecs?: (import('../../domain/bots/actionProviderSpec.ts').ActionProviderSpec | null)[];
  /** The player's own rotation, when the engine drives them, in the same plain shape. */
  playerProviderSpec?: import('../../domain/bots/actionProviderSpec.ts').ActionProviderSpec | null;
  // The floor, by the URLs the main thread loaded it from: the worker's own nav registry is empty, and
  // a session that cannot see the mesh walks and fires through walls (CLAUDE.md 0c.1).
  navAssets?: { mapId: number; meshUrl?: string; collisionUrl?: string; outdoorsUrl?: string };
  // Config members the payload could not carry because they hold closures. The far side rebuilds
  // these from its own store; a name here that nothing rebuilds is a silent behaviour gap.
  droppedCfg?: readonly string[];
  // Set once every WRITE the caller can make is posted to the far side instead of landing on a
  // session this side holds. Until then the sim cannot move off-thread: the fight would receive no
  // orders. `combatView.openPump` says so in `sim_pump` while it is false.
  commandChannel?: boolean;
};

export type TickWorkerReq =
  | TickWorkerInit
  | {
    kind: 'tick';
    seq: number;
    action?: CombatAction;
    inputs?: SimTickInputs;
    // Ask for the discrete half. The caller sets it at its DOM rate, never per tick — 17 members of
    // view JSON at 40 ticks a second is what the payload contract was written against.
    wantViews?: boolean;
    /** Beyond the fixed tables: the memo keys the reading side actually asked for. */
    want?: DiscreteWant;
    // Writes the reading side made since the last tick, in the order it made them. Applied BEFORE the
    // step, so an order given this frame is in effect for the tick it was meant for.
    commands?: readonly SimCommand[];
  };

export type TickWorkerRes =
  | { kind: 'ready'; bootMs: number }
  | {
    kind: 'done';
    seq: number;
    events: CombatEvent[];
    t: number;
    ended: boolean;
    /** The VERDICT, not only that the fight stopped — the reading side settles xp and loot off it. */
    winner: Side | 'timeout' | null;
    effects: SimEffect[];
    // The pose channel, the RETURN half of the payload contract. A facade on the other side has no
    // live session to read, so the frame has to travel with the batch.
    poses?: SimPoseFrame;
    /** Present only when the request asked for it. */
    views?: DiscreteSnapshot;
  }
  | { kind: 'error'; error: string };

type Port = {
  onmessage: ((ev: MessageEvent<TickWorkerReq>) => void) | null;
  postMessage(message: TickWorkerRes): void;
};

/** Seat allocations whose name the reading side already handed out. The far side takes the same one. */
const SEAT_COMMANDS = new Set(['injectEnemy', 'injectAlly']);

// Apply one command from the reading side. A seat command is FORCED to the name this side's copy
// answered with, or the two rosters diverge after the first death (only one of them recycles).
export function applySimCommand(session: CombatSession, cmd: SimCommand): void {
  if (cmd.err) {
    throw new Error(`command ${cmd.m} could not cross the seam: ${cmd.err}`);
  }
  const fn = (session as unknown as Record<string, unknown>)[cmd.m];
  // A command this session does not have is dropped rather than thrown: the member list comes
  // from the READING side, and an optional member may be absent on a stub.
  if (typeof fn !== 'function') return;
  let args = cmd.a;
  if (SEAT_COMMANDS.has(cmd.m) && typeof cmd.r === 'string') {
    args = [...args];
    const opts = (args[2] ?? {}) as Record<string, unknown>;
    args[2] = { ...opts, side: cmd.r };
    const got = (fn as (...a: unknown[]) => unknown).apply(session, args);
    if (got !== cmd.r) {
      throw new Error(`${cmd.m}: this side seated ${String(got)}, the reading side ${cmd.r}`);
    }
    return;
  }
  (fn as (...a: unknown[]) => unknown).apply(session, args);
}

// Wire a port to a session the worker builds itself. Split from the module top level so a test can
// drive it on THIS thread and compare the two sides event for event (`smoke/tickOverAPort.mjs`).
export function serveTickWorker(
  port: Port,
  build: (init: TickWorkerInit, effectSink: SimEffect[]) => Promise<CombatSession> | CombatSession,
): void {
  let session: CombatSession | null = null;
  // The session's `applyEffect` pushes here instead of acting; `build` must wire it.
  const effects: SimEffect[] = [];
  // One filler for the whole fight: the frame is refilled in place and cloned by `postMessage`.
  let filler = createPoseFiller();
  port.onmessage = async (ev): Promise<void> => {
    const msg = ev.data;
    try {
      if (msg.kind === 'init') {
        const t0 = Date.now();
        // A tick for the OLD fight that lands during this build must not step the new one.
        session = null;
        effects.length = 0;
        filler = createPoseFiller();
        session = await build(msg, effects);
        port.postMessage({ kind: 'ready', bootMs: Date.now() - t0 });
        return;
      }
      if (!session) return;
      effects.length = 0;
      for (const cmd of msg.commands ?? []) applySimCommand(session, cmd);
      const events = session.tick(msg.action, msg.inputs);
      const poses = session.poseFrame?.(filler);
      const views = msg.wantViews === true
        ? discreteSnapshot(session, poses?.sides ?? [], msg.want)
        : undefined;
      port.postMessage({
        kind: 'done',
        seq: msg.seq,
        events,
        t: session.t,
        ended: session.ended,
        winner: session.winner,
        effects: effects.slice(),
        ...(poses ? { poses } : {}),
        ...(views ? { views } : {}),
      });
    } catch (e) {
      port.postMessage({ kind: 'error', error: String((e as Error)?.message ?? e) });
    }
  };
}

// Every member the facade would otherwise pull off a live session: the view family by name, the two
// fixed tables, and whatever the reading side's memo was asked for since the last snapshot.
export function discreteSnapshot(
  session: CombatSession,
  sides: readonly string[],
  want?: DiscreteWant | null,
): DiscreteSnapshot {
  const s = session as unknown as Record<string, unknown>;
  const zero: Record<string, unknown> = {
    playerView: session.playerView(),
    enemyView: session.enemyView(),
    petView: session.petView(),
    alliesView: session.alliesView(),
    enemiesView: session.enemiesView(),
    livingEnemiesView: session.livingEnemiesView(),
  };
  const zeroNames = want?.zero.length ? [...DISCRETE_ZERO, ...want.zero] : DISCRETE_ZERO;
  for (const name of zeroNames) {
    if (name in zero) continue;
    const fn = s[name];
    if (typeof fn === 'function') zero[name] = (fn as () => unknown).call(session);
  }
  const bySide: Record<string, Record<string, unknown>> = { viewOfSide: {} };
  for (const side of sides) bySide.viewOfSide![side] = session.viewOfSide?.(side) ?? null;
  for (const name of DISCRETE_BY_SIDE) {
    const fn = s[name];
    if (typeof fn !== 'function') continue;
    const per: Record<string, unknown> = {};
    for (const side of sides) per[side] = (fn as (a: string) => unknown).call(session, side);
    bySide[name] = per;
  }
  if (want) {
    for (const [name, args] of Object.entries(want.one)) {
      const fn = s[name];
      if (typeof fn !== 'function') continue;
      const per = bySide[name] ?? (bySide[name] = {});
      for (const a of args) {
        const key = String(a);
        if (key in per) continue;
        per[key] = (fn as (a: unknown) => unknown).call(session, a);
      }
    }
  }
  return { zero, bySide };
}

/** The `applyEffect` a worker-side session gets: record, never act. The main thread owns the acting. */
export function recordingApplyEffect(sink: SimEffect[]): (effect: SimEffect) => void {
  return (effect) => { sink.push(effect); };
}
