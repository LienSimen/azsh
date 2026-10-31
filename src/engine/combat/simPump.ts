// The tick seam (PERF-RUNSHEET S6a). `combatView.step` POSTS a tick and DRAINS the result instead of
// calling `session.tick()` inline, so the async contract lands before the Worker does.

import type { CombatAction, SimTickInputs } from './types.ts';
import type { CombatEvent, Side } from '../core/events.ts';
import type { CombatSession } from './session-types.ts';
import { combatPerf } from './perfSink.ts';
import type { DiscreteSnapshot, DiscreteWant, SimPoseFrame } from './simSnapshot.ts';
import type { SimEffect } from './simEffects.ts';

/** One write the reading side made, in the shape it rides to the far side. */
export type SimCommand = {
  m: string;
  a: unknown[];
  // What this side's copy answered. A seat allocation (`injectEnemy`) is forced to the same name on the
  // far side, or the two rosters name different bodies after the first death.
  r?: string;
  /** Set when the arguments could not be cloned; the far side fails loudly on it. */
  err?: string;
};

/** One completed tick, in the shape it will arrive from the worker. */
export type SimTickDone = {
  // Monotonic post number. A reply that arrives out of order or not at all is countable rather than
  // silent, which is the whole reason the stub carries it too.
  seq: number;
  events: CombatEvent[];
  /** Sim clock after the tick. */
  t: number;
  ended: boolean;
  // Who WON, not only that it stopped. `ended` alone left `result()` reading the local `ctx.winner`,
  // which off-thread is never set, so every far kill settled as `winner ?? 'timeout'` — no xp, no loot,
  // no kill credit. Absent on this thread, where the step set it.
  winner?: Side | 'timeout' | null;
  // The snapshot halves, present only when the sim ran somewhere the reader cannot see.
  poses?: SimPoseFrame;
  views?: DiscreteSnapshot;
  // Effects the far side RECORDED instead of applying (S6b mechanism 1). Absent on this thread, where
  // the step already applied them.
  effects?: SimEffect[];
};

export interface SimPump {
  // Queue one tick: the player's tap, the game-layer inputs (else the session's own `cfg.tickInputs`),
  // the writes since the last post. Returns the post's seq, which the reply carries back; 0 = not posted.
  post(
    action?: CombatAction,
    inputs?: SimTickInputs,
    wantViews?: boolean,
    commands?: readonly SimCommand[],
    want?: DiscreteWant | null,
  ): number;
  /** Completed ticks, oldest first. Empties the queue. */
  drain(): SimTickDone[];
  /** Posted and not yet returned. 0 on the same-thread stub. */
  inFlight(): number;
  /** `ended` as of the last COMPLETED tick — never a live read of the session. */
  ended(): boolean;
  /** Sim clock as of the last completed tick. */
  t(): number;
  dispose(): void;
}

// S6a: the sim runs on THIS thread behind the queue the Worker will use, so the async risk lands
// without the worker risk. `combat.sim` is timed here so the bucket travels with the tick.
export function sameThreadPump(session: CombatSession): SimPump {
  const done: SimTickDone[] = [];
  let seq = 0;
  let ended = false;
  let t = session.t;
  return {
    post(action?: CombatAction, inputs?: SimTickInputs): number {
      if (ended) return 0;
      const n = ++seq;
      const events = combatPerf('combat.sim', () => session.tick(action, inputs));
      ended = session.ended;
      t = session.t;
      done.push({ seq: n, events, t, ended, winner: session.winner });
      return n;
    },
    drain(): SimTickDone[] {
      if (done.length === 0) return [];
      return done.splice(0, done.length);
    },
    inFlight(): number {
      return 0;
    },
    ended(): boolean {
      return ended;
    },
    t(): number {
      return t;
    },
    dispose(): void {
      done.length = 0;
    },
  };
}


// The minimum of a Worker this pump needs, so a fallback can be built over anything message-shaped.
export type SimWorkerPort = {
  postMessage(msg: unknown): void;
  onmessage: ((ev: MessageEvent) => unknown) | null;
  terminate?(): void;
};

// S6b: the sim runs in a Worker and this pump is the only thing that talks to it. A tick posted during
// the boot is dropped (a replayed backlog is the spiral frameClock avoids); its COMMANDS are held.
export function workerPump(port: SimWorkerPort, init: unknown): SimPump & {
  bootDropped(): number;
  bootMs(): number | null;
  failed(): boolean;
  failReason(): string;
} {
  const done: SimTickDone[] = [];
  let seq = 0;
  let inFlight = 0;
  let ready = false;
  let dropped = 0;
  let boot: number | null = null;
  let ended = false;
  let failed = false;
  // What the far side threw. Swallowing it cost a session: the caller read `ended` and stopped
  // ticking, and the floor froze with no line anywhere saying why.
  let failReason = '';
  let t = 0;
  /** Commands from the ticks the boot dropped, in order, for the first post that goes out. */
  let held: SimCommand[] = [];
  let heldViews = false;
  let heldWant: DiscreteWant | null = null;
  port.onmessage = (ev: MessageEvent): void => {
    const msg = ev.data as {
      kind?: string; seq?: number; bootMs?: number;
    } & Partial<SimTickDone>;
    if (msg.kind === 'ready') { ready = true; boot = msg.bootMs ?? 0; return; }
    if (msg.kind === 'error') {
      // A worker that threw is a fight that stopped. Say so rather than hang on a reply that is not
      // coming; the caller swaps back to the main thread.
      failed = true;
      failReason = String((msg as { error?: unknown }).error ?? 'unknown');
      ended = true;
      inFlight = 0;
      return;
    }
    if (msg.kind !== 'done') return;
    // The worker outlives one fight (a re-init is ~20 ms against an 800 ms boot), so a batch that
    // arrives before THIS fight's `ready` belongs to the previous one.
    if (!ready) return;
    inFlight = Math.max(0, inFlight - 1);
    ended = msg.ended === true;
    t = msg.t ?? t;
    done.push({
      seq: msg.seq ?? 0,
      events: msg.events ?? [],
      t,
      ended,
      winner: msg.winner ?? null,
      ...(msg.poses ? { poses: msg.poses } : {}),
      ...(msg.views ? { views: msg.views } : {}),
      ...(msg.effects ? { effects: msg.effects } : {}),
    });
  };
  port.postMessage(init);
  return {
    post(
      action?: CombatAction,
      inputs?: SimTickInputs,
      wantViews?: boolean,
      commands?: readonly SimCommand[],
      want?: DiscreteWant | null,
    ): number {
      if (ended) return 0;
      if (!ready) {
        dropped += 1;
        if (commands && commands.length) held.push(...commands);
        if (wantViews === true) heldViews = true;
        if (want) heldWant = mergeWant(heldWant, want);
        return 0;
      }
      seq += 1;
      inFlight += 1;
      let cmds: readonly SimCommand[] | undefined = commands;
      if (held.length) {
        cmds = commands && commands.length ? [...held, ...commands] : held;
        held = [];
      }
      const views = wantViews === true || heldViews;
      heldViews = false;
      const wanted = heldWant ? mergeWant(heldWant, want ?? null) : want ?? null;
      heldWant = null;
      port.postMessage({
        kind: 'tick', seq, action, inputs, wantViews: views, commands: cmds,
        ...(wanted ? { want: wanted } : {}),
      });
      return seq;
    },
    drain(): SimTickDone[] {
      if (done.length === 0) return [];
      return done.splice(0, done.length);
    },
    inFlight: () => inFlight,
    ended: () => ended,
    t: () => t,
    bootDropped: () => dropped,
    bootMs: () => boot,
    failed: () => failed,
    failReason: () => failReason,
    dispose(): void {
      done.length = 0;
      held = [];
      port.onmessage = null;
      port.terminate?.();
    },
  };
}

/** What a caller knows about its worker when it asks whether the fight is still being simulated. */
export type WorkerHealth = {
  /** The far side reported a throw. */
  failed: boolean;
  /** Boot time once `ready` landed, else null. */
  bootMs: number | null;
  /** Ticks posted and not yet answered. */
  inFlight: number;
  /** Real ms since the pump was opened. */
  sinceOpenMs: number;
  /** Real ms of unanswered silence, from `unansweredSilenceMs`. Read only once the worker has booted. */
  sinceReplyMs: number;
};

/**
 * Ms of unanswered silence on a booted worker: since the last batch came back, or since the BOOT when
 * none has come back yet. The boot is not silence - a cold boot slower than `stallMs` leaves the
 * last-reply stamp at pump-open time, and then the FIRST posted tick already reads as a full stall
 * window of silence. Firefox dev-server boots pass 8 s (combatView.ts:3253).
 */
export function unansweredSilenceMs(now: number, lastReplyMs: number, bootAtMs: number | null): number {
  return now - Math.max(lastReplyMs, bootAtMs ?? 0);
}

// Is this worker still worth waiting on? A thread that never boots (`readyMs`), and one that booted and
// went silent: `terminate()` posts no error, so that second death froze the fight for good.
export function workerStillAnswering(h: WorkerHealth, readyMs: number, stallMs: number): boolean {
  if (h.failed) return false;
  if (h.bootMs === null) return h.sinceOpenMs < readyMs;
  // Nothing outstanding is a quiet worker, not a dead one — only an unanswered post starts the clock.
  return h.inFlight === 0 || h.sinceReplyMs < stallMs;
}

/** Union of two demand lists, so a boot's dropped ticks lose no reader. */
function mergeWant(a: DiscreteWant | null, b: DiscreteWant | null): DiscreteWant | null {
  if (!a) return b;
  if (!b) return a;
  const zero = [...new Set([...a.zero, ...b.zero])];
  const one: Record<string, unknown[]> = {};
  for (const src of [a.one, b.one]) {
    for (const [name, args] of Object.entries(src)) {
      const cur = one[name] ?? (one[name] = []);
      for (const x of args) if (!cur.includes(x)) cur.push(x);
    }
  }
  return { zero, one };
}
