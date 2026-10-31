// Per-game fight clock. World stamps use enter plus session.t and the chain advances to it, so the next
// pull seeds from the previous resolve. Wall mode is the live app, where the sim runs at 1x to 4x.

import { facadeOf } from '../combat/simFacade.ts';
import type { CombatSession } from '../combat/types.ts';

const chainByState = new WeakMap<object, number>();
const enterBySession = new WeakMap<object, number>();
// Callers hold the FACADE, the stamp belongs to the fight underneath, and a fight outlives one
// facade rebind. Normalising here covers every call site rather than each one remembering.
const fightKey = (k: object): object => facadeOf(k as CombatSession)?.raw() ?? k;
const wallWorldByState = new WeakSet<object>();

/** Live app: world timers stamp on Date.now() instead of the sim chain. See header. */
export function useWallWorldClock(stateKey: object): void {
  wallWorldByState.add(stateKey);
}

export function isWallWorldClock(stateKey: object): boolean {
  return wallWorldByState.has(stateKey);
}

/** Continue the chain, or anchor it once at `anchorMs` (caller's only wall read). */
export function peekOrAnchorFightChain(stateKey: object, anchorMs: number): number {
  if (wallWorldByState.has(stateKey)) return anchorMs;
  const existing = chainByState.get(stateKey);
  if (existing != null) return existing;
  chainByState.set(stateKey, anchorMs);
  return anchorMs;
}

/** Remember the enter stamp for this session (seed + later writeback). */
export function bindFightEnter(sessionKey: object, enterNowMs: number): void {
  enterBySession.set(fightKey(sessionKey), enterNowMs);
}

export function fightEnterOf(sessionKey: object): number | undefined {
  return enterBySession.get(fightKey(sessionKey));
}

export function peekFightChain(stateKey: object): number | undefined {
  if (wallWorldByState.has(stateKey)) return undefined;
  return chainByState.get(stateKey);
}

/** enter + session.t — does not advance the chain. */
export function fightClockNow(sessionKey: object, sessionT: number): number {
  const enter = enterBySession.get(fightKey(sessionKey));
  if (enter == null) {
    throw new Error('fightClockNow: session missing enter stamp');
  }
  return enter + Math.max(0, sessionT | 0);
}

// Writeback now, advancing the per-state chain for the next pull's seed. Wall mode returns the wall
// clock and keeps no chain: remaining values are carried as remaining, on the timeline the world reads.
export function commitFightClock(stateKey: object, sessionKey: object, sessionT: number): number {
  if (wallWorldByState.has(stateKey)) return Date.now();
  const now = fightClockNow(sessionKey, sessionT);
  chainByState.set(stateKey, now);
  return now;
}
