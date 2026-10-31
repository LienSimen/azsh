// The enemy re-decide cadence on the COMBAT surface. `enemyStrategyMs` was read only by the BG
// screen (bgScreen.ts:385), so the 1v1 and 2v2 honoured no skill lever at all.

import type { AllyActionProvider } from '../../engine/combat/types.ts';

// One decision per `decideMs`. Between them the seat picks nothing, which is white swings rather
// than the class heuristics (pickAction.ts:2355) - a slow opponent still hits, it reacts late.
export function pacedActionProvider(
  inner: AllyActionProvider,
  decideMs: number,
): AllyActionProvider {
  if (!Number.isFinite(decideMs) || decideMs <= 0) return inner;
  let nextAtMs = -Infinity;
  const paced: AllyActionProvider = (snap) => {
    // The SESSION clock, never a wall clock (a provider is pure, types.ts:729) and never the unit's
    // combat clock, which reads 0 until somebody hits the seat: a healer sat muted 35 s on it.
    const t = snap.sessionMs ?? snap.combatTimeMs ?? 0;
    if (t < nextAtMs) return null;
    const pick = inner(snap);
    // Only a decision the inner provider MADE opens the next window; a null pick is an empty bar.
    if (pick != null) nextAtMs = t + decideMs;
    return pick;
  };
  // pickAction reads these OFF the closure (types.ts:731-741); dropping them disarms school halt,
  // kill order and dispel protection.
  if (inner.needs) paced.needs = inner.needs;
  if (inner.peekHalt) paced.peekHalt = inner.peekHalt;
  if (inner.peekKillOrder) paced.peekKillOrder = inner.peekKillOrder;
  if (inner.keepAuraIds) paced.keepAuraIds = inner.keepAuraIds;
  return paced;
}
