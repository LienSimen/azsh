// PURE: which BODY a spell's aura lands on. `buffPresent` asks the caster's bar and
// `debuffPresent` the enemy's, so a keep-up on the wrong side can never close.
import type { SpellDef } from '../../data/schema.ts';
import type { Condition } from './types.ts';
import { cond } from './classify.ts';
import { isApplyAuraFamily, SPELL_EFFECT_APPLY_AREA_AURA_ENEMY } from '../../engine/spells/interpreter/opcodes.ts';
import { withHostile } from '../../engine/spells/interpreter/targeting.ts';

export type AuraSide = 'hostile' | 'friendly';

/** A rawEffect row that routes into the aura dispatch. Cite: opcodes.ts isApplyAuraFamily. */
function auraRow(re: { effect?: number }): boolean {
  const eff = (re.effect ?? 0) | 0;
  return isApplyAuraFamily(eff) || eff === SPELL_EFFECT_APPLY_AREA_AURA_ENEMY;
}

// A BAKED effect that lasts. `applyTo` (pet/party/friendly) and `hostile` are the enricher's own
// answer, and this is the only view of a spell the bake grew out of a DUMMY row (Soul Link 19028).
function bakedAuraSide(e: { durationMs?: number; hostile?: boolean; applyTo?: string }): AuraSide | null {
  if (!((e.durationMs ?? 0) > 0) && e.hostile === undefined && e.applyTo === undefined) return null;
  return e.hostile === true ? 'hostile' : 'friendly';
}

// Every side this spell puts an aura on — none, one, or both (Drain Soul leeches on the enemy and
// procs on the caster). Cite: targeting.ts HOSTILE_IMPLICIT; SpellTargetDefines.h.
export function auraSidesOfSpell(
  s: Pick<SpellDef, 'rawEffects' | 'effects'> | null | undefined,
): Set<AuraSide> {
  const out = new Set<AuraSide>();
  for (const re of s?.rawEffects ?? []) {
    if (!auraRow(re)) continue;
    const { hostile } = withHostile({}, (re.targetA ?? 0) | 0, (re.basePoints ?? 0) | 0, (re.targetB ?? 0) | 0);
    out.add(hostile ? 'hostile' : 'friendly');
  }
  for (const e of s?.effects ?? []) {
    const side = bakedAuraSide(e);
    if (side) out.add(side);
  }
  return out;
}

/** The single side, or null when the spell applies no aura or applies one to each side. */
export function auraSideOfSpell(s: Pick<SpellDef, 'rawEffects' | 'effects'> | null | undefined): AuraSide | null {
  const sides = auraSidesOfSpell(s);
  return sides.size === 1 ? [...sides][0] : null;
}

// The presence gate a "keep it up" row gets when nothing smarter applies: ask the body the aura
// lands on. A both-sides or aura-less spell keeps the caster's own bar, which is the old default.
export function keepUpPresenceCondition(s: Pick<SpellDef, 'id' | 'rawEffects' | 'effects'>): Condition {
  const sides = auraSidesOfSpell(s);
  return sides.size === 1 && sides.has('hostile')
    ? cond('target', 'debuffPresent', '==', 0, s.id)
    : cond('self', 'buffPresent', '==', 0, s.id);
}

// The "about to fall off" twin of the gate above, for a "then cast this" step that refreshes an
// aura: same body, read as ms left rather than present/absent, so one row covers both "not up" and
// "nearly gone" (types.ts buffRemainingMs — absent reads 0 ms).
export function keepUpRemainingCondition(
  s: Pick<SpellDef, 'id' | 'rawEffects' | 'effects'>,
  ms: number,
): Condition {
  const sides = auraSidesOfSpell(s);
  return sides.size === 1 && sides.has('hostile')
    ? cond('target', 'debuffRemainingMs', '<', ms, s.id)
    : cond('self', 'buffRemainingMs', '<', ms, s.id);
}
