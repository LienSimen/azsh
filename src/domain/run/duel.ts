// PvP dueling. A duel is two player-built combatants in the same deterministic engine, so this module
// owns only the challenge handshake and the two duel-only rules: a level gap, and yielding at 1 HP.

import type { Rng } from '../../engine/core/rng.ts';
import type {
  CombatantSpec, CombatSession, CombatResult, CombatConfig,
} from '../../engine/combat.ts';
import { createSession } from '../../engine/combat.ts';

// Duels are gated to opponents within a few levels. Retail has no such cap; this is a mobile-balance
// choice, kept as a named constant so it is trivially tunable or removable.
export const MAX_DUEL_LEVEL_GAP = 3;

/** The minimal identity a duel needs to check eligibility (name to disambiguate, level to gate). */
export interface DuelParty {
  name: string;
  level: number;
}

export interface Check {
  ok: boolean;
  reason?: string;
}

// Options for duel eligibility. A tavern trial bypasses the level gap because the inn slate already
// windows peers, and that window may be wider than MAX_DUEL_LEVEL_GAP.
export interface ChallengeOpts {
  /** When true, skip MAX_DUEL_LEVEL_GAP (tavern trial only). */
  ignoreLevelGap?: boolean;
}

// Can `challenger` propose a duel to `target`? Distinct players, within the level gap unless the
// caller waives it for an inn-gated trial. Liveness is the caller's concern — it holds that state.
export function canChallenge(challenger: DuelParty, target: DuelParty, opts?: ChallengeOpts): Check {
  if (challenger.name === target.name) return { ok: false, reason: 'You cannot duel yourself' };
  if (!opts?.ignoreLevelGap && Math.abs(challenger.level - target.level) > MAX_DUEL_LEVEL_GAP) {
    return { ok: false, reason: `Duels are limited to within ${MAX_DUEL_LEVEL_GAP} levels` };
  }
  return { ok: true };
}

// ---- The challenge handshake ----------------------------------------------
// Immutable, transitioning only out of 'pending', with total helpers, so an illegal click is a no-op.

export type DuelStatus = 'pending' | 'active' | 'finished' | 'declined' | 'cancelled';

export interface DuelState {
  status: DuelStatus;
  challenger: string; // who threw down the gauntlet
  target: string;     // who was challenged
}

export interface ProposeResult extends Check {
  state?: DuelState;
}

/** Open a challenge (status 'pending') if the two are eligible. */
export function proposeDuel(challenger: DuelParty, target: DuelParty, opts?: ChallengeOpts): ProposeResult {
  const chk = canChallenge(challenger, target, opts);
  if (!chk.ok) return chk;
  return { ok: true, state: { status: 'pending', challenger: challenger.name, target: target.name } };
}

/** Target accepts → the duel becomes 'active' (combat may begin). No-op unless pending. */
export function acceptDuel(state: DuelState): DuelState {
  return state.status === 'pending' ? { ...state, status: 'active' } : state;
}

/** Target declines → 'declined'. No-op unless pending. */
export function declineDuel(state: DuelState): DuelState {
  return state.status === 'pending' ? { ...state, status: 'declined' } : state;
}

/** Challenger withdraws before it starts → 'cancelled'. No-op unless pending. */
export function cancelDuel(state: DuelState): DuelState {
  return state.status === 'pending' ? { ...state, status: 'cancelled' } : state;
}

// ---- Combat -----------------------------------------------------------------

// The countdown between an accepted duel and a live one. Neither player is frozen for it — the duel
// simply is not in progress, so a cancel inside the window is an interrupt rather than a loss.
export const DUEL_COUNTDOWN_MS = 3000;

export function createDuelSession(
  challengerSpec: CombatantSpec,
  // An ARRAY when the target brings a pet: index 0 is the duelist, the rest are more enemy bodies.
  // Only `player` and `enemy` are duelists, so a pet dies normally (events.ts; Unit.cpp:970).
  targetSpec: CombatantSpec | CombatantSpec[],
  rng: Rng,
  cfg: CombatConfig = {},
  /** The challenger's own beast or demon, seated on side `pet`. */
  petSpec: CombatantSpec | null = null,
): CombatSession {
  // `duel` is what makes the fight a duel rather than a 1v1 to the death: the killing blow floors the
  // loser at 1 HP and names the winner, in the engine. Spread after so a caller can turn it off.
  // `autoRescueItems` is the PvP trinket out of hard CC (stepSession.ts:2576); only bgScreen.ts:455
  // set it, so no duel ever trinketed.
  return createSession(challengerSpec, targetSpec, rng, { duel: true, autoRescueItems: true, ...cfg }, petSpec);
}

export interface DuelOutcome {
  winner: string | null; // null on a draw (timeout)
  loser: string | null;
  challengerHp: number;   // post-duel HP (loser clamped to 1 — a duel never kills)
  targetHp: number;
  durationMs: number;
  timedOut: boolean;      // ran to the time limit with no winner → a draw
}

// Interpret a finished CombatResult as a duel outcome. The one rule that differs from PvE: a duel
// never kills — whoever would have died yields, so both walk away at 1 HP or better.
export function resolveDuelOutcome(result: CombatResult, challenger: string, target: string): DuelOutcome {
  // The clamps below are belt-and-braces on the duel path, where nobody reaches 0 HP. They stay
  // because this reads any CombatResult, including one from a session built without the flag.
  const timedOut = result.winner === 'timeout';
  const winner = result.winner === 'player' ? challenger : result.winner === 'enemy' ? target : null;
  const loser = result.winner === 'player' ? target : result.winner === 'enemy' ? challenger : null;
  return {
    winner,
    loser,
    // Clamp BOTH to ≥1: the loser yields instead of dying, and a mutual killing-blow tick
    // must not leave the declared winner "dead" either.
    challengerHp: Math.max(1, result.player.hp),
    targetHp: Math.max(1, result.enemy?.hp ?? 0),
    durationMs: result.durationMs,
    timedOut,
  };
}

// The both-players-agree auto-resolve path: run the whole duel instantly with the AI on both sides.
// Fully deterministic for a seed, the same replay guarantee simulate() gives.
export function autoResolveDuel(
  challengerSpec: CombatantSpec,
  targetSpec: CombatantSpec,
  rng: Rng,
  cfg: CombatConfig = {},
): DuelOutcome {
  const result = createDuelSession(challengerSpec, targetSpec, rng, cfg).runToEnd();
  return resolveDuelOutcome(result, challengerSpec.name, targetSpec.name);
}
