// ONE sim Worker for the whole app (combatView.warmSimWorker): its boot builds the worker's own store
// (1.3 s Chrome, 4.7 s Firefox), a re-init on a warm thread ~20 ms.

// A fight ENDING must not take it with it. combatView.stop() terminated it and left the handle on the
// corpse, so the next pull posted `init` to a dead thread and froze out the pump's 30 s deadline.

/** All this module needs of a Worker. A gate drives it with a stub. */
export type SimThread = { terminate(): void };

let shared: SimThread | null = null;

/** The app's sim thread, started with `make` when nothing is warm yet. */
export function acquireSimThread<T extends SimThread>(make: () => T): T {
  if (shared) return shared as T;
  const t = make();
  shared = t;
  return t;
}

/** A view is done with it. The thread stays warm for the next pull — that is the whole point of it. */
export function releaseSimThread(t: SimThread | null): void {
  // A thread nobody shares (a caller that built its own) is the only one a release may end.
  if (t && t !== shared) t.terminate();
}

/** The thread is dead to us: it threw, or it never answered. Terminate it and forget the handle. */
export function killSimThread(t: SimThread | null): void {
  t?.terminate();
  if (t && t === shared) shared = null;
}

/** True while a warm thread is held. */
export function simThreadLive(): boolean {
  return shared !== null;
}
