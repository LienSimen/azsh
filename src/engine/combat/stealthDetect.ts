// Periodic stealth detect sweep, the C++ predicate on the C++ cadence against fresh positions.
// Detection ran once at session build, so a unit that WALKED into a pack stayed unseen forever.

import { isEnemySide, isPlayerCharacterSide, isTotemSide } from '../core/events.ts';
import {
  PLAYER_COMBAT_REACH_YD,
  detectsStealth,
  stealthDetectIntervalMs,
  totalStealthStrength,
} from '../../domain/spells/stealth.ts';
import type { CombatContext } from './context.ts';
import { navSightClear } from './navSight.ts';
import { combatPerf } from './perfSink.ts';
import type { Fighter } from './types.ts';

export function installStealthDetect(
  ctx: CombatContext,
  deps: { dead: (f: Fighter) => boolean },
): void {
  const { dead } = deps;
  const cfg = ctx.cfg;
  const bg = !!cfg.battlegroundMap;
  const interval = stealthDetectIntervalMs(bg);
  // The core arms this a second after login and only then falls into its cadence, so the first sweep
  // is never on the frame the unit appeared. One interval of grace keeps the opener window.
  let nextAt = interval;

  /** UNIT_FLAG_PLAYER_CONTROLLED. In a battleground every enemy seat is a player too. */
  const playerControlled = (f: Fighter): boolean =>
    isPlayerCharacterSide(f.side) || f.side === 'pet' || (bg && isEnemySide(f.side));

  /** TYPEID_PLAYER — caps the detect range at 45 and floors it at the player's own reach. */
  const isPlayerUnit = (f: Fighter): boolean =>
    isPlayerCharacterSide(f.side) || (bg && isEnemySide(f.side));

  // `getAttackers()` — someone is already swinging at this unit, so stealth is moot. Threat list membership
  // is the engine's attacker set (ThreatManager owner -> victim ids).
  const hasAttackers = (f: Fighter): boolean => {
    for (const other of ctx.fightersOrder()) {
      if (other === f || dead(other)) continue;
      if (isEnemySide(other.side) === isEnemySide(f.side)) continue;
      const tm = ctx.threatOf?.(other);
      if (tm && tm.hasThreat(f.side)) return true;
    }
    return false;
  };

  const core = (): void => {
    if (ctx.t < nextAt) return;
    nextAt = ctx.t + interval;
    const all = ctx.fightersOrder();
    // Cheap early-out: the sweep only exists for stealthed bodies.
    let anyStealthed = false;
    for (const f of all) if (f.stealthed && !dead(f)) { anyStealthed = true; break; }
    if (!anyStealthed) return;
    const positions = ctx.unitPositionsMutable;
    for (const sneak of all) {
      if (!sneak.stealthed || dead(sneak)) continue;
      const strength = totalStealthStrength(sneak.stealthAuraStrength, sneak.stealthLevelBonus);
      const attacked = hasAttackers(sneak);
      const sneakControlled = playerControlled(sneak);
      for (const det of all) {
        if (det === sneak || dead(det)) continue;
        // Same team never blows the cover (IsFogOfWarVisibleStealth: group always sees).
        if (isEnemySide(det.side) === isEnemySide(sneak.side)) continue;
        // A totem has no detect sweep of its own (TotemAI never calls it).
        if (isTotemSide(det.side)) continue;
        const isPlayer = isPlayerUnit(det);
        const seen = detectsStealth({
          distanceYd: ctx.distanceBetween(det, sneak),
          detectorLevel: det.spec.level,
          detectorAlive: true,
          detectorStunned: det.stunnedUntil > ctx.t,
          detectorIsPlayer: isPlayer,
          detectorCombatReachYd: isPlayer ? PLAYER_COMBAT_REACH_YD : 0,
          stealthStrength: strength,
          detectStrength: det.stealthDetectStrength,
          stealtherPlayerControlled: sneakControlled,
          stealtherAttacked: attacked,
          inFrontArc: ctx.isInFrontArc(det, sneak),
          // navSightClear fails open with no mask, so an un-baked floor keeps the old answer.
          lineOfSight: navSightClear(cfg, positions?.[det.side], positions?.[sneak.side]),
        });
        if (seen) {
          ctx.breakStealth?.(sneak, 'detected');
          break;
        }
      }
    }
  };

  ctx.stealthDetectPhase = (): void => combatPerf('sim.stealthDetect', core);
}
