// The phase timer for the engine tick, installed by the UI and absent everywhere else. The engine must
// not import the UI, and there is one profiler per page, so one sink is the right shape.
type PerfFn = <T>(name: string, fn: () => T) => T;
/** enter/leave for a phase whose body is too large to wrap in a closure. Same self-time contract. */
interface SpanSink { enter: (name: string) => void; leave: (name: string) => void }

let sink: PerfFn | null = null;
let spans: SpanSink | null = null;

/** Null uninstalls. runProfiler.time is already a no-op while the profiler is stopped. */
export function setCombatPerfSink(fn: PerfFn | null, span?: SpanSink | null): void {
  sink = fn;
  spans = span ?? null;
}

/** One extra frame when no sink is installed; the JIT inlines it. */
export function combatPerf<T>(name: string, fn: () => T): T {
  return sink ? sink(name, fn) : fn();
}

/** Balanced pair around one tick phase, for a block a closure would have to re-indent. */
export function combatPerfEnter(name: string): void {
  spans?.enter(name);
}

export function combatPerfLeave(name: string): void {
  spans?.leave(name);
}
