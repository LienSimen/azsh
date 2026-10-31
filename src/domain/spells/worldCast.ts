// World and out-of-combat castability. The UI used to gate Cast on `outOfCombatOnly`, which the ETL
// stamps only for pure armor buffs, so Arcane Intellect had no button while Frost Armor did.

import type { SpellDef } from '../../data/schema.ts';
import { durMs } from '../../engine/spells/interpreter/duration.ts';
import { SPELL_EFFECT_CHARGE } from '../../engine/spells/interpreter/opcodes.ts';

/** Hostile buff/snare that needs an enemy (OOC has none — never self-apply). */
function isHostileTargetBuffOrSnare(eff: {
  kind: string;
  hostile?: boolean;
  amount?: number;
  pct?: number;
}): boolean {
  if (eff.kind === 'buff') {
    if (eff.hostile === true) return true;
    if (eff.hostile === false) return false;
    return (eff.amount ?? 0) < 0;
  }
  if (eff.kind === 'speed') {
    return !!eff.hostile || (eff.pct ?? 0) < 0;
  }
  return false;
}

/** Effect that only makes sense on an enemy. */
function isEnemyTargetOnlyEffect(eff: {
  kind: string;
  hostile?: boolean;
  amount?: number;
  pct?: number;
  amountPerTick?: number;
  powerType?: number;
}): boolean {
  if (isHostileTargetBuffOrSnare(eff)) return true;
  switch (eff.kind) {
    case 'direct_damage':
    case 'dot':
    case 'root':
    case 'cc':
    case 'interrupt_cast':
    case 'health_leech':
    case 'power_burn':
    case 'weapon_percent_damage':
    case 'taunt':
    case 'mod_taunt':
    case 'threat':
    case 'modify_threat_pct':
      return true;
    // POWER_HAPPINESS (4) = Dismiss Pet mood drain — not enemy-targeted.
    case 'power_drain':
      return ((eff.powerType ?? 0) | 0) !== 4;
    case 'restore_power':
      // PERIODIC_MANA_LEECH (Drain Mana / Viper Sting) — hostile only (KI-660).
      return eff.hostile === true || (eff.amountPerTick ?? 0) < 0;
    // Soothe Animal / Mind Soothe — negative detect range on enemy.
    case 'mod_detect_range':
      return (eff.amount ?? 0) < 0;
    default:
      return false;
  }
}

/** SpellTargetDefines.h enemy-family ImplicitTargetA — mirror oocCast.ts / targeting.ts. */
const HOSTILE_IMPLICIT = new Set([2, 6, 15, 16, 24, 28, 36, 54]);

function rawHasHostileUnitTarget(spell: SpellDef): boolean {
  const raw = spell.rawEffects;
  if (!raw?.length) return false;
  for (const r of raw) {
    if (HOSTILE_IMPLICIT.has((r.targetA ?? 0) | 0)) return true;
    if (HOSTILE_IMPLICIT.has((r.targetB ?? 0) | 0)) return true;
  }
  return false;
}

// Warrior Charge: SPELL_EFFECT_CHARGE plus rageGenerated, so out of combat it grants rage with no
// free-world enemy. Intercept has no rageGenerated and stays enemy-gated.
function isChargeRageOpener(spell: SpellDef): boolean {
  if ((spell.rageGenerated ?? 0) <= 0) return false;
  if (spell.rawEffects?.some((r) => ((r.effect ?? 0) | 0) === SPELL_EFFECT_CHARGE)) return true;
  return !!(spell.notInCombatOnly || spell.outOfCombatOnly);
}

// True when the spell needs an enemy target OOC (UI + engine parity). Cite: game/oocCast.ts
// oocSpellRequiresEnemyTarget (KI-049, KI-136, KI-655/675/721, KI-170, KI-728).
export function spellRequiresEnemyTarget(spell: SpellDef): boolean {
  if (isChargeRageOpener(spell)) return false;
  // Mirror oocCast pet_tame skip (KI-728).
  if (spell.role === 'pet_tame') return false;
  const effects = spell.effects ?? [];
  if (effects.length > 0 && effects.every((eff) => isEnemyTargetOnlyEffect(eff))) return true;
  if (effects.some((eff) => isEnemyTargetOnlyEffect(eff)) && ((spell.rangeMax ?? 0) > 0)) {
    return true;
  }
  if (rawHasHostileUnitTarget(spell)) return true;
  return false;
}

// Effects that land on the caster (or a friendly) out of combat without an enemy. Mirrors the beneficial
// branches of game.castOutOfCombat.
function hasSelfApplicableOocEffect(spell: SpellDef): boolean {
  for (const e of spell.effects) {
    if (e.kind === 'buff' && !isHostileTargetBuffOrSnare(e)) return true;
    // Mage Armor: resist-only self aura (no armor buff row). Cite: KI-482; game.castOutOfCombat.
    if (e.kind === 'resist' && (e.amount ?? 0) > 0) return true;
    if (e.kind === 'heal' || e.kind === 'heal_max_health') return true;
    if (e.kind === 'restore_health') return true;
    if (e.kind === 'restore_power' && (e.amountPerTick ?? 0) >= 0) return true;
    if (e.kind === 'school_absorb' || e.kind === 'mana_shield') return true;
    if (e.kind === 'damage_shield' || e.kind === 'proc_trigger_spell') return true;
    // Self-range SPELL_EFFECT_TRIGGER_SPELL parents (Vanish, Bloodrage): OOC applies payloads.
    // Hostile/ranged triggers (e.g. DI) stay combat/target gated. Cite: KI-458.
    if (e.kind === 'trigger_spell' && (spell.rangeMax ?? 0) === 0) return true;
    if (e.kind === 'weapon_imbue') return true;
    if (e.kind === 'conjure' || e.kind === 'summon_pet' || e.kind === 'dismiss_pet') return true;
    if (e.kind === 'stealth' || e.kind === 'stealth_detect' || e.kind === 'shapeshift') return true;
    if (e.kind === 'feather_fall' || e.kind === 'hover') return true;
    if (e.kind === 'speed' && !isHostileTargetBuffOrSnare(e)) return true;
    if (
      e.kind === 'school_immunity'
      || e.kind === 'damage_immunity'
      || e.kind === 'mechanic_immunity'
      || e.kind === 'pacify'
    ) return true;
    if (e.kind === 'cleanse' || e.kind === 'dispel' || e.kind === 'dispel_mechanic') return true;
    if (e.kind === 'next_cast_mod' || e.kind === 'reset_cooldowns') return true;
    if (e.kind === 'seal') return true;
  }
  // Charge-style: spell-level rage grant with no foe effect.
  if ((spell.rageGenerated ?? 0) > 0 && !spell.effects.some((e) => isEnemyTargetOnlyEffect(e))) {
    return true;
  }
  return false;
}

// Spells the player can cast from the world with no enemy target: a superset of outOfCombatOnly that
// adds the beneficial buffs castOutOfCombat can already apply. Nukes, CC and finishers stay inert.
export function isWorldCastableSpell(spell: SpellDef): boolean {
  if (spell.passive) return false;
  if (spell.outOfCombatOnly) return true;

  // Role-tagged utilities that are inherently world actions.
  const role = spell.role;
  if (role === 'pet_summon' || role === 'pet_tame' || role === 'stealth' || role === 'form'
    || role === 'conjure' || role === 'seal') {
    return true;
  }

  // Finisher buffs (Slice and Dice) need combo points from combat.
  if (spell.requiresComboPoints) return false;

  // Pure enemy-target spells cannot land OOC.
  if (spellRequiresEnemyTarget(spell)) return false;

  // Effect-driven: beneficial buffs/heals/shields/summons even when role is unset
  // (Arcane Intellect / Fortitude bake with no role and ooc=false).
  return hasSelfApplicableOocEffect(spell);
}

// Long-duration beneficial buffs belonging in the OOC keep-up phase rather than a one-shot pull cast.
// The threshold is five minutes, or permanent-until-cancelled on a beneficial buff.
const KEEP_UP_MIN_MS = 5 * 60 * 1000;

export function isKeepUpBuffSpell(spell: SpellDef): boolean {
  if (spell.outOfCombatOnly) return true;
  if (spell.requiresComboPoints) return false;
  if (spell.effects.some(
    (e) => e.kind === 'damage_shield' || e.kind === 'proc_trigger_spell' || e.kind === 'weapon_imbue',
  )) return true;

  // Resist-only long auras (Mage Armor DurationIndex 30 → 30 min). Keep-up so rotation
  // does not thrash OOC when buffPresent==0. Cite: KI-482; duration.ts FALLBACK 30.
  if (spell.effects.some((e) => e.kind === 'resist' && (e.amount ?? 0) > 0)) {
    const ms = durMs(spell.durationIndex);
    // 0 = until-cancelled; ≥5 min keep-up threshold (same as buff path).
    if (ms === 0 || (ms != null && ms >= KEEP_UP_MIN_MS)) return true;
  }

  return spell.effects.some((e) => {
    if (e.kind !== 'buff') return false;
    if (isHostileTargetBuffOrSnare(e)) return false;
    // Permanent-until-cancelled (Aspects, some auras) bake durationMs 0.
    if (e.durationMs === 0) return true;
    return e.durationMs >= KEEP_UP_MIN_MS;
  });
}
