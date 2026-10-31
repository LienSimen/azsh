// The ScriptDev force-despawn action, shared by the two dispatch sites. DO NOT write the literal
// kind-comparison in a comment here: the census scans source text and a commented copy reads as wired.

import type { EnemySide } from '../core/events.ts';
import { isEnemySide } from '../core/events.ts';

/** The despawn action shape emitted by ScriptDev IR. */
export interface ForceDespawnAct {
  readonly delayMs?: number;
}

// The flavour line for set_combat_movement. The state write itself stays at the dispatch site, since
// the census requires that token in its window. Cite: UnitAI.cpp:301-318 SetCombatMovement.
export function combatMovementFlavor(name: string, enabled: boolean): string {
  return enabled ? `${name} resumes combat movement.` : `${name} stops combat movement.`;
}

export interface ForceDespawnDeps<F extends { side: string }> {
  /** Despawn now. No-ops on an already-dead fighter — see `alreadyDead` below. */
  forceDespawnEnemy: (ef: F) => void;
  /** Per-side cast state; carries the eventAi timer bag. */
  enemyCastBySide: Map<EnemySide, { eventAi: { forceDespawnAt?: number } }>;
  /** Emit a combat event. */
  push: (e: { t: number; kind: 'despawn'; actor: EnemySide }) => void;
  /** Is this fighter already dead? Only needed on the JustDied path. */
  dead?: (ef: F) => boolean;
  // JustDied dispatch: the unit is already dead, so `forceDespawnEnemy` no-ops and the despawn event has to
  // be emitted here for observability. False on the live path.
  emitWhenAlreadyDead?: boolean;
}

// Apply one `force_despawn` action. Immediate when no delay, otherwise arms `eventAi.forceDespawnAt` for
// the tick loop to collect.
export function applyForceDespawn<F extends { side: string }>(
  act: ForceDespawnAct,
  ef: F,
  t: number,
  deps: ForceDespawnDeps<F>,
): void {
  if (!isEnemySide(ef.side)) return;
  const side = ef.side;
  const delayMs = Math.max(0, (act.delayMs ?? 0) | 0);
  if (delayMs > 0) {
    const ocs = deps.enemyCastBySide.get(side);
    if (ocs) ocs.eventAi.forceDespawnAt = t + delayMs;
    return;
  }
  const alreadyDead = deps.emitWhenAlreadyDead === true && deps.dead?.(ef) === true;
  deps.forceDespawnEnemy(ef);
  if (alreadyDead) deps.push({ t, kind: 'despawn', actor: side });
}
