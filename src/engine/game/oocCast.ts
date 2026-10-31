// Out-of-combat cast helpers: hostile-target gating, plus the effect kinds that bake empty and need an
// explicit OOC apply path (Life Tap, Blessing of Light, Concentration Aura).
import type { DataStore } from '../../data/dataStore.ts';
import type { SpellDef, SpellEffect } from '../../data/schema.ts';
import type { Character } from '../../domain/character/character.ts';
import {
  applyAura, maxMana, maxPower, powerType,
} from '../../domain/character/character.ts';
import { SPELL_EFFECT_CHARGE } from '../spells/interpreter/opcodes.ts';
import type { CombatSession } from '../combat/session-types.ts';
import { HOSTILE_IMPLICIT } from '../spells/interpreter/targeting.ts';

// Hostile buff/snare that needs an enemy target (combat isHostileBuffEffect parity). OOC has no target -
// must not self-apply (KI-049 Curse of Weakness).
export function isHostileTargetBuffOrSnare(eff: {
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

/** Effect that only makes sense on an enemy (damage, DoT, root/CC, leech/burn, threat). */
function isEnemyTargetOnlyEffect(eff: {
  kind: string;
  powerType?: number;
  amountPerTick?: number;
  amount?: number;
  hostile?: boolean;
  pct?: number;
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
    // POWER_HAPPINESS (4) drains pet mood on Dismiss Pet — self/pet utility, not enemy mana.
    // Cite: SpellEffects.cpp:1750–1791; SharedDefines.h POWER_HAPPINESS=4; spell 2641.
    case 'power_drain':
      return ((eff.powerType ?? 0) | 0) !== 4;
    // Periodic mana leech bakes as a restore with a negative per-tick amount. Hostile only: an OOC cast
    // must not self-stick a hollow leech aura. Cite: SpellAuras.cpp HandlePeriodicManaLeech.
    case 'restore_power':
      return eff.hostile === true || (eff.amountPerTick ?? 0) < 0;
    // Soothe Animal / Mind Soothe: negative MOD_DETECT_RANGE on enemy (targetA ENEMY).
    // Cite: SpellAuras HandleAuraModDetectRange; spell 2908 targetA=6; KI-711.
    case 'mod_detect_range':
      return (eff.amount ?? 0) < 0;
    default:
      return false;
  }
}

// True when raw ImplicitTargetA/B marks a hostile unit family. Cite: SpellTargetDefines.h
// TARGET_UNIT_ENEMY=6; interpreter/targeting.ts HOSTILE_IMPLICIT.
function rawHasHostileUnitTarget(spell: SpellDef): boolean {
  const raw = spell.rawEffects;
  if (!raw?.length) return false;
  for (const r of raw) {
    if (HOSTILE_IMPLICIT.has((r.targetA ?? 0) | 0)) return true;
    if (HOSTILE_IMPLICIT.has((r.targetB ?? 0) | 0)) return true;
  }
  return false;
}

// Warrior Charge ranks carry the charge effect plus a self rage grant, so the OOC path grants the rage
// with no enemy present. Intercept has no rage grant and stays gated. Cite: SpellEffects.cpp:5009-5028.
function isChargeRageOpener(spell: SpellDef): boolean {
  if ((spell.rageGenerated ?? 0) <= 0) return false;
  if (spell.rawEffects?.some((r) => ((r.effect ?? 0) | 0) === SPELL_EFFECT_CHARGE)) return true;
  // Fixtures / stamp path without raw opcodes.
  return !!(spell.notInCombatOnly || spell.outOfCombatOnly);
}

// True when the OOC cast needs an enemy target: pure hostiles, a mixed dot and proc, an empty-effect
// script on an enemy, a hostile dispel. A self-centred range-0 hostile stays castable.
export function oocSpellRequiresEnemyTarget(spell: SpellDef): boolean {
  // Charge: self rage is product OOC; raw TARGET_UNIT_ENEMY must not block (KI-170).
  if (isChargeRageOpener(spell)) return false;
  // pet_tame (1515): Effect 63 THREAT looks enemy-only; OOC path uses opts.targetCreature.
  // Cite: KI-728; Spell.cpp EffectTameCreature:3149–3225.
  if (spell.role === 'pet_tame') return false;
  // Pick Pocket 921: targetA 6 reads enemy-only, and the OOC path takes opts.targetCreature the same
  // way taming does. Cite: SpellEffects.cpp:2662 EffectPickPocket; Spell.cpp:5501-5511 CheckCast.
  if ((spell.effects ?? []).some((e) => e.kind === 'pickpocket')) return false;

  const effects = spell.effects ?? [];
  // Pure hostile schema payload (Corruption, Hammer of Justice, CoW).
  if (effects.length > 0 && effects.every((eff) => isEnemyTargetOnlyEffect(eff))) return true;
  // Mixed: any enemy-only effect + positive range (Drain Soul dot+proc_trigger, range 30).
  // Hellfire is range 0 self-channel — not gated here.
  if (effects.some((eff) => isEnemyTargetOnlyEffect(eff)) && ((spell.rangeMax ?? 0) > 0)) {
    return true;
  }
  // Empty / non-enemy-classified effects still aimed at enemy via ImplicitTarget:
  // Judgement 20271 SCRIPT targetA=6; Purge 370 DISPEL targetA=6.
  if (rawHasHostileUnitTarget(spell)) return true;
  return false;
}

/** Pre-spend fizzle when Life Tap healthCost exceeds current HP. Cite: Warlock.cpp:67–70. */
export function lifeTapOocFailReason(
  effects: readonly SpellEffect[],
  health: number,
): string | null {
  const lt = effects.find((e) => e.kind === 'life_tap');
  if (!lt || lt.kind !== 'life_tap') return null;
  const hpCost = Math.max(0, Math.trunc(lt.healthCost));
  if (hpCost > 0 && hpCost > health) return 'Not enough health';
  return null;
}

// Totems are fight-scoped fighters with no world entity, so refuse before the spend rather than leave
// Searing Totem a pure mana sink. In combat the summon runs through applySpellLate.
export function oocTotemSummonFailReason(
  effects: readonly SpellEffect[],
  role?: string | null,
): string | null {
  if (role === 'totem_summon') return 'Totems are only available in combat';
  if (effects.some((e) => e.kind === 'summon_totem')) {
    return 'Totems are only available in combat';
  }
  return null;
}

// Call Pet and Revive Pet pre-spend gates, shared with the OOC snapshot so a missing pet does not win
// the buffs-phase pick and starve Aspect of the Hawk. Cite: Spell.cpp CheckCast ~5555-5580.
export function oocPetCallReviveFailReason(
  effects: readonly SpellEffect[],
  char: { pet?: { health: number } | null; storedPet?: { health: number } | null },
): string | null {
  if (effects.some((e) => e.kind === 'summon_pet' && e.creature === 0)) {
    if (char.pet) return char.pet.health <= 0 ? 'Your pet is dead' : 'You already have a pet';
    if (!char.storedPet) return 'You have no pet';
    if (char.storedPet.health <= 0) return 'Your pet is dead';
    return null;
  }
  if (effects.some((e) => e.kind === 'revive_pet')) {
    const target = char.pet ?? char.storedPet;
    if (target == null) return 'You have no pet';
    if (target.health > 0) return 'Your pet is not dead';
    return null;
  }
  return null;
}

// A summoning-ritual gameobject needs the caster plus one click per other participant, and the solo
// product has no party channel — refuse before the spend. Cite: GameObject.cpp:1821-1823.
export function oocSummoningRitualFailReason(
  effects: readonly SpellEffect[],
  lookupGo: (entry: number) =>
    | { type?: number; summoningRitual?: { reqParticipants?: number } }
    | undefined
    | null,
): string | null {
  for (const e of effects) {
    if (e.kind !== 'transmitted_object') continue;
    const goEntry = (e.goEntry ?? 0) | 0;
    if (goEntry <= 0) continue;
    const go = lookupGo(goEntry);
    if (!go || ((go.type ?? 0) | 0) !== 18) continue;
    const need = (go.summoningRitual?.reqParticipants ?? 0) | 0;
    // EffectTransmitted already counts the caster as unique use #1.
    if (need > 1) return `Requires a group of ${need}`;
  }
  return null;
}

/** Apply life_tap resource conversion on the caster. Pre-spend already gated HP. */
export function applyOocLifeTap(
  char: Character,
  eff: Extract<SpellEffect, { kind: 'life_tap' }>,
  ds: DataStore,
): Character {
  const hpCost = Math.max(0, Math.trunc(eff.healthCost));
  const manaGain = Math.max(0, Math.trunc(eff.manaGain));
  const next = { ...char };
  if (hpCost > 0) next.health = Math.max(0, next.health - hpCost);
  if (manaGain > 0) {
    if (powerType(next) === 'mana') {
      next.power = Math.min(maxPower(next, ds), next.power + manaGain);
    } else {
      next.mana = Math.min(maxMana(next, ds), (next.mana ?? 0) + manaGain);
    }
  }
  return next;
}

const OOC_SI_AURA_KINDS = new Set([
  'blessing_of_light',
  'resist_pushback',
  'split_damage_flat',
]);

export function isOocSiAuraKind(kind: string): boolean {
  return OOC_SI_AURA_KINDS.has(kind);
}

// Stick SI aura OOC (buff bar). durationMs ≤ 0 → until cancelled (Concentration Aura). Cite: applyAura
// expiresAt undefined when duration omitted/0.
export function applyOocSiAura(
  char: Character,
  spellId: number,
  durationMs: number,
  now: number,
  ds: DataStore,
): Character {
  const dur = durationMs > 0 ? durationMs : undefined;
  return applyAura(char, spellId, dur, now, ds);
}

// Unit::IsInCombat for the player at the world layer: the open fight owns UNIT_FLAG_IN_COMBAT, and a
// world screen with no session has none. Cite: sessionApi unitInCombat; combatFlag.ts fighterIsInCombat.
export function playerCombatFlagSet(live: CombatSession | null | undefined): boolean {
  return live?.unitInCombat?.('player') === true;
}

// IsNonCombatSpell — SPELL_ATTR_NOT_IN_COMBAT_ONLY_PEACEFUL. Stealth/Shadowmeld, Charge, traps, food,
// mounts, teleports, rez, pet summons. Cite: SpellMgr.h:454; Spell.cpp:4598.
export function isNonCombatSpell(spell: SpellDef): boolean {
  return spell.notInCombatOnly === true;
}
