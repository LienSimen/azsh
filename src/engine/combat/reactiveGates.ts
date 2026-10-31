// Classic aura-state cast gates, read from the baked caster and target states. The 1.12 server does not
// repeat the test — the client owns it — so this engine, which is both, gates here.

import type { SpellDef } from '../../data/schema.ts';
import { RECENT_DODGE_MS, RECENT_DEFENSE_REACT_MS } from './types.ts';

/** AuraState values a 1.12 spell row can require. Cite: SpellAuraDefines.h:341-348. */
export const AURA_STATE = {
  DEFENSE: 1,
  HEALTHLESS_20_PERCENT: 2,
  BERSERKING: 3,
  FROZEN: 4,
  JUDGEMENT: 5,
  HUNTER_PARRY: 7,
} as const;

/** SharedDefines.h Classes — only the two with an aura-state exclusion. */
const CLASS_HUNTER = 3;
const CLASS_ROGUE = 4;

/** Overpower ranks — "Only useable after the target dodges." */
export function isOverpowerSpell(spell: SpellDef): boolean {
  return /^overpower$/i.test(spell.name ?? '');
}

/** Everything HasAuraState needs, as the Fighter already carries it. */
export interface AuraStateUnit {
  hp: number;
  spec: { maxHealth: number; classId?: number };
  lastDefenseReactAt: number;
  lastHunterParryAt: number;
  activeSeal: { spellId: number } | null;
}

export interface ReactiveGateCaster extends AuraStateUnit {
  lastDodgedAt: number;
}

export interface ReactiveGateTarget extends AuraStateUnit {
  lastDodgedAt: number;
}

/** UNIT_FIELD_AURASTATE test for one state. Cite: Unit.h:2163 HasAuraState. */
export function hasAuraState(state: number, u: AuraStateUnit, now: number): boolean {
  switch (state | 0) {
    case AURA_STATE.DEFENSE:
      return now - u.lastDefenseReactAt <= RECENT_DEFENSE_REACT_MS;
    case AURA_STATE.HEALTHLESS_20_PERCENT:
      return u.hp < Math.max(1, u.spec.maxHealth) * 0.2;
    case AURA_STATE.HUNTER_PARRY:
      return now - u.lastHunterParryAt <= RECENT_DEFENSE_REACT_MS;
    case AURA_STATE.JUDGEMENT:
      return u.activeSeal != null;
    // BERSERKING is set by the caster's own effect handler immediately before the triggered
    // cast, and no 1.12 spell sets FROZEN — neither can be absent at cast time.
    case AURA_STATE.BERSERKING:
    case AURA_STATE.FROZEN:
      return true;
    default:
      return true;
  }
}

/** The reason string the action bar shows for an absent state. */
function auraStateRefusal(state: number, u: AuraStateUnit, onTarget: boolean): string {
  switch (state | 0) {
    case AURA_STATE.DEFENSE: {
      const cls = (u.spec.classId ?? 0) | 0;
      if (cls === CLASS_ROGUE) return 'must parry first';
      if (cls === CLASS_HUNTER) return 'must dodge first';
      return 'must block, dodge or parry first';
    }
    case AURA_STATE.HEALTHLESS_20_PERCENT:
      return onTarget ? 'target must be below 20% health' : 'must be below 20% health';
    case AURA_STATE.HUNTER_PARRY:
      return 'must parry first';
    case AURA_STATE.JUDGEMENT:
      return 'requires a seal';
    default:
      return onTarget ? 'target is missing a required aura' : 'missing a required aura';
  }
}

// Records the defender's own dodge/parry/block as the aura state it sets, with the two class exclusions.
// Cite: UnitAuraProcHandler.cpp:296-328.
export function stampDefensiveAuraState(
  defender: ReactiveGateTarget,
  result: 'dodge' | 'parry' | 'block',
  t: number,
): void {
  const cls = (defender.spec.classId ?? 0) | 0;
  if (result === 'dodge') {
    // The attacker-side Overpower marker is set for every class; only DEFENSE skips the rogue.
    defender.lastDodgedAt = t;
    if (cls !== CLASS_ROGUE) defender.lastDefenseReactAt = t;
    return;
  }
  if (result === 'parry') {
    if (cls === CLASS_HUNTER) defender.lastHunterParryAt = t;
    else defender.lastDefenseReactAt = t;
    return;
  }
  defender.lastDefenseReactAt = t;
}

// Returns a short unusable reason when a required aura state is absent, else null. Does not mutate timers —
// call {@link consumeReactiveWindow} after a successful cast starts.
export function reactiveCastGate(
  caster: ReactiveGateCaster,
  target: ReactiveGateTarget,
  spell: SpellDef,
  now: number,
): string | null {
  const cas = (spell.casterAuraState ?? 0) | 0;
  if (cas && !hasAuraState(cas, caster, now)) return auraStateRefusal(cas, caster, false);
  const tas = (spell.targetAuraState ?? 0) | 0;
  if (tas && !hasAuraState(tas, target, now)) return auraStateRefusal(tas, target, true);
  if (isOverpowerSpell(spell) && !(now - target.lastDodgedAt <= RECENT_DODGE_MS)) {
    return 'target must dodge first';
  }
  return null;
}

// Close the react window after a successful cast of a reactive ability. Only the timed states are
// consumable: health and seal states are not windows, and clearing defense must not clear Overpower.
export function consumeReactiveWindow(
  caster: ReactiveGateCaster,
  target: ReactiveGateTarget,
  spell: SpellDef,
): void {
  const cas = (spell.casterAuraState ?? 0) | 0;
  if (cas === AURA_STATE.DEFENSE) caster.lastDefenseReactAt = Number.NEGATIVE_INFINITY;
  else if (cas === AURA_STATE.HUNTER_PARRY) caster.lastHunterParryAt = Number.NEGATIVE_INFINITY;
  if (isOverpowerSpell(spell)) target.lastDodgedAt = Number.NEGATIVE_INFINITY;
}
