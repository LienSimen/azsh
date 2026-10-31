// Drops runtime-map entries whose timers have passed: a missing key already reads as pristine at every
// consumer (professions.ts nodeStartCharges, gameObjects.ts:336 and goRuntimeAvailability, canRestockPickpocket).
import type { GameState } from './types.ts';
import type { GoRuntimeState } from '../../domain/world/gameObjects.ts';

/** Keys a GO entry may hold and still be pure timing; any other key means state worth keeping. */
const GO_TIMER_KEYS: ReadonlySet<keyof GoRuntimeState> = new Set(['readyAtMs', 'armStartedAtMs', 'cooldownUntilMs']);

export function goEntryIsStale(rt: GoRuntimeState, nowMs: number): boolean {
  for (const k of Object.keys(rt) as (keyof GoRuntimeState)[]) {
    if (!GO_TIMER_KEYS.has(k)) return false;
    const v = rt[k];
    if (typeof v === 'number' && v > nowMs && k !== 'armStartedAtMs') return false;
  }
  return true;
}

export interface StaleRuntimePruned { nodes: number; objects: number; pockets: number }

/** Mutates `state` in place; returns how many keys each map lost. */
export function pruneStaleRuntime(state: GameState, nowMs: number): StaleRuntimePruned {
  const out: StaleRuntimePruned = { nodes: 0, objects: 0, pockets: 0 };
  if (state.nodeState) {
    for (const [k, v] of Object.entries(state.nodeState)) {
      if (v && v.charges <= 0 && v.readyAt <= nowMs) { delete state.nodeState[k]; out.nodes++; }
    }
  }
  if (state.goRuntime) {
    for (const [k, v] of Object.entries(state.goRuntime)) {
      if (!v || goEntryIsStale(v, nowMs)) { delete state.goRuntime[k]; out.objects++; }
    }
  }
  if (state.pickpocketRestock) {
    for (const [k, v] of Object.entries(state.pickpocketRestock)) {
      if (typeof v !== 'number' || v <= nowMs) { delete state.pickpocketRestock[k]; out.pockets++; }
    }
  }
  return out;
}
