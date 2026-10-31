// MOD_TAUNT (11) — the session-side apply and clear of threat-list taunt state. It does NOT equalize
// threat, which is the separate attack-me effect; while it holds, victim selection prefers the taunter.
import type { ActiveEffect, Fighter } from './types.ts';
import type { ThreatManager } from './threat.ts';
import { TAUNT_STATE } from './threat.ts';
import { isEnemySide } from '../core/events.ts';

// Apply MOD_TAUNT on an enemy threat list: ensure taunter is listed, set STATE_TAUNTED, force current
// victim. Returns the ActiveEffect row to track duration (or null if skipped).
export function applyModTauntAura(
  tm: ThreatManager,
  src: Fighter,
  tgt: Fighter,
  spellId: number,
  name: string,
  expiresAt: number,
): ActiveEffect | null {
  if (!isEnemySide(tgt.side)) return null;
  // Ensure the taunter is on the list so SetTauntState has a reference.
  // Cite: ThreatManager.cpp:557–575 — taunt states keyed by caster guid on threat refs.
  tm.addThreatDirectly(src.side, 0, false);
  tm.setTauntState(src.side, TAUNT_STATE.TAUNTED);
  tm.setCurrentVictimByTarget(src.side);
  return {
    kind: 'mod_taunt',
    source: src.side,
    target: tgt.side,
    spellId,
    name,
    expiresAt,
  };
}

// Clear MOD_TAUNT when the aura expires or is stripped. The C++ re-scans the remaining taunt auras, so
// the state clears only when no other same-source row still holds on this target.
function clearModTauntAura(
  tm: ThreatManager,
  taunterId: string,
  remainingSameSource: boolean,
): void {
  if (remainingSameSource) return;
  tm.setTauntState(taunterId, TAUNT_STATE.NONE);
}
