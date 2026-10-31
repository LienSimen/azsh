/** SI2.5 / SI3 handlers — auras-misc (split from handlers.ts, pure move). */

import type { BuffMod, RawSpellEffect, School, SpellEffect } from '../../../../data/schema.ts';
import { effectAmountRange } from '../amount.ts';
import type {
  InterpretIntent,
} from '../types.ts';
import { STAT_MOD_PCT, withHostile } from '../targeting.ts';
import {
  SPELL_AURA_MOD_INCREASE_SWIM_SPEED,
  SPELL_AURA_MOD_MOUNTED_SPEED_ALWAYS,
  SPELL_AURA_MOD_PERCENT_STAT,
  SPELL_AURA_MOD_SPEED_ALWAYS,
  SPELL_AURA_USE_NORMAL_MOVEMENT_SPEED,
} from '../opcodes.ts';
import type {
  HandlerState,
} from './shared.ts';
import {
  SPELLFAMILY_MAGE,
  MANA_SHIELD_FAMILY_FLAGS,
  MANA_SHIELD_SPD_COEFF,
  LEVEL_PENALTY_THRESHOLD,
  LEVEL_PENALTY_PER_LEVEL,
  REP_FRIENDLY,
  schoolOf,
  schoolFromSingleBitMask,
  familyOf,
  flagsOf,
  durationMsResolved,
  withPpc,
  trunc,
  SCHOOLS,
} from './shared.ts';
import {
  OVERRIDE_SCRIPT_PROC_TRIGGERS,
  OVERRIDE_SCRIPT_ROLLS_OWN_AMOUNT,
} from '../../overrideClassScripts.ts';
import { SPELL_AFFECT_MASK_ADD_TARGET_TRIGGER } from '../class-scripts-kit.ts';
// ── SPELL_AURA_MOD_SPELL_CRIT_CHANCE_SCHOOL (71) ────────────────────────── Cite: SpellAuras.cpp:3891–3911
// HandleModSpellCritChanceShool Bake empty (aura === 71 return). Cite: map-spell-effects.mjs:814.
export function handleModSpellCritChanceSchool(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++: if (!Real) return. Cite: :3893–3894.
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  const schoolMask = raw.miscValue | 0;
  // Spell crit % buff — combat applies via spellCritChance. Cite: SpellAuras.cpp:3897–3909.
  state.effects.push({
    kind: 'buff',
    mod: 'spell_crit',
    amount: min,
    durationMs: dur,
    ...(schoolMask ? { schoolMask } : {}),
  } as never);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_LANGUAGE (75) ── unmapped in the bake. Hostility comes from targetA, since Curse of
// Tongues targets an enemy and is not a self buff. Cite: SpellAuras.cpp:136; ChatHandler.cpp:151-155.
export function handleModLanguage(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const dur = durationMsResolved(state);
  // m_miscvalue = language id. Cite: ChatHandler.cpp:154–155.
  state.effects.push(withHostile({
    kind: 'mod_language',
    languageId: raw.miscValue | 0,
    durationMs: dur,
  }, raw.targetA | 0, 0) as never);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_WATER_BREATHING (82) ── the play surface is an aura chip plus a breathing effect, which
// suppresses the hazard when wired. Cite: SpellAuras.cpp:1688-1699 HandleWaterBreathing.
export function handleWaterBreathing(
  state: HandlerState,
  _raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++: player only SetWaterBreathingIntervalMultiplier. Cite: :1692–1698.
  // Non-player: no-op body. Cite: TYPEID_PLAYER gate :1692.
  if (state.ctx.unitTargetIsPlayer === false) return;
  // apply || HasAuraType(WATER_BREATHING) → multiplier 0. Cite: :1694–1695.
  // Interpret apply snapshot always sets 0 (aura present).
  const dur = durationMsResolved(state);
  state.intents.push({
    kind: 'water_breathing',
    intervalMultiplier: 0,
    durationMs: dur,
  });
  // Catalog / OOC: not a pure mana sink. Cite: schema water_breathing; KI inert castables.
  if (!state.effects.some((e) => e.kind === 'water_breathing')) {
    state.effects.push({ kind: 'water_breathing', durationMs: dur < 0 ? 0 : dur });
  }
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_DETECT_RANGE (91) ── unmapped in the bake; the C++ adds it to the attack distance.
// Cite: SpellAuras.cpp:152; Unit.cpp:11772 GetAttackDistance.
export function handleModDetectRange(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // Amount is signed yards (Mind Soothe −10). Cite: Unit.cpp:11772.
  state.intents.push({
    kind: 'mod_detect_range',
    amount: min,
    durationMs: dur,
  });
  // Catalog / OOC / combat kit surface (Mind Soothe). Cite: schema mod_detect_range; KI-186.
  state.effects.push({ kind: 'mod_detect_range', amount: min, durationMs: dur });
  state.role = state.role || 'control';
}

// ── SPELL_AURA_MANA_SHIELD (97) ── baked as a mana shield, whose absorb is paid from mana at the
// effect's multiple value. Cite: SpellAuras.cpp:5063-5093; Unit.cpp:2457-2496.
export function handleManaShield(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++: if (!Real) return. Cite: :5065–5066.
  const { min, max } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // Pool from basepoints; clamp ≥ 1. Cite: map-spell-effects.mjs:972–975.
  let poolMin = Math.max(1, min);
  let poolMax = Math.max(1, max || min);
  // manaMultiplier = EffectMultipleValue (Mana Shield ranks: 2). Cite: Unit.cpp:2473.
  const manaMultiplier = Number(raw.multipleValue) || 0;

  // At cast time a mage of the right family adds half its spell damage bonus. Gated on the caller
  // supplying that bonus; nothing produces it today, as it would need the school.
  if (state.ctx.spellBaseDamageBonusDone != null) {
    if (
      familyOf(state.spell) === SPELLFAMILY_MAGE
      && (flagsOf(state.spell) & MANA_SHIELD_FAMILY_FLAGS) !== 0
    ) {
      const spellLevel = state.spell.spellLevel ?? state.spell.reqLevel ?? 0;
      const levelPenalty =
        spellLevel < LEVEL_PENALTY_THRESHOLD && spellLevel > 0
          ? 1.0 - (LEVEL_PENALTY_THRESHOLD - spellLevel) * LEVEL_PENALTY_PER_LEVEL
          : 1.0;
      const bonus = trunc(
        state.ctx.spellBaseDamageBonusDone * MANA_SHIELD_SPD_COEFF * levelPenalty,
      );
      if (bonus) {
        poolMin += bonus;
        poolMax += bonus;
        state.intents.push({ kind: 'mana_shield_spd_bonus', bonusAmount: bonus });
      }
    }
  }

  state.effects.push({
    kind: 'mana_shield',
    schoolMask: raw.miscValue | 0,
    min: poolMin,
    max: poolMax,
    manaMultiplier,
    durationMs: dur,
  });
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_OVERRIDE_CLASS_SCRIPTS (112) ── empty in the bake; the C++ registers the script id.
// Cite: SpellAuras.cpp:5096-5099; Unit.cpp:11980-11985 RegisterOverrideScriptAura.
export function handleOverrideClassScripts(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  const scriptId = raw.miscValue | 0;
  // RegisterOverrideScriptAura(this, m_modifier.m_miscvalue, apply). Cite: :5098.
  state.intents.push({
    kind: 'override_class_scripts',
    scriptId,
    amount: min,
    durationMs: dur,
  });
  // A per-id switch: proc ids become proc triggers and two register on apply. The remaining ids are
  // listed as not implemented rather than given an invented payload.
  const triggerSpellId = OVERRIDE_SCRIPT_PROC_TRIGGERS[scriptId];
  if (triggerSpellId != null) {
    state.effects.push({
      kind: 'proc_trigger_spell',
      triggerSpellId,
      durationMs: dur,
      amount: min,
      // Improved Mend Pet rolls the aura amount (15%/50%), not ProcChance 101.
      // Dreamwalker 2pc (4533) requires roll_chance_i(50). Cite: UnitAuraProcHandler.cpp:1630.
      ...(OVERRIDE_SCRIPT_ROLLS_OWN_AMOUNT.has(scriptId) && min > 0
        ? { procChancePct: min }
        : scriptId === 4533 ? { procChancePct: 50 } : {}),
    });
    state.role = state.role || 'buff';
  }
}

// ── SPELL_AURA_MOD_MELEE_DAMAGE_TAKEN (125) ── baked as physical_taken, the non-ranged flat.
// Cite: SpellAuras.cpp:186; Unit.cpp:7618 MeleeDamageBonusTaken.
export function handleModMeleeDamageTaken(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // GetTotalAuraModifier(SPELL_AURA_MOD_MELEE_DAMAGE_TAKEN). Cite: Unit.cpp:7618.
  // Bake collapses to physical_taken BuffMod. Cite: map-spell-effects.mjs:1060–1061.
  const tagged = withHostile(
    { kind: 'buff' as const, mod: 'physical_taken' as const, amount: min, durationMs: dur },
    raw.targetA | 0,
    min,
  );
  state.effects.push(tagged as SpellEffect);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_FORCE_REACTION (139) ─────────────────────────────────────── Cite: SpellAuras.cpp:2034–2052
// HandleForceReaction Bake unmapped.
export function handleForceReaction(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++: non-player return. Cite: :2036–2037.
  if (state.ctx.unitTargetIsPlayer === false) return;
  // C++: if (!Real) return. Cite: :2039–2040.
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  const factionId = raw.miscValue | 0;
  const reputationRank = min;
  // ApplyForceReaction(faction_id, rank, apply) + SendForceReactions. Cite: :2046–2047.
  state.effects.push({
    kind: 'force_reaction',
    factionId,
    reputationRank,
    durationMs: dur,
    ...(reputationRank >= REP_FRIENDLY ? { stopAttackFaction: true } : {}),
  });
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_EFFECT_IMMUNITY (37) ──────────────────────────────────────── Cite:
// SpellAuras.cpp:2962–2970 HandleAuraModEffectImmunity Bake empty.
export function handleEffectImmunity(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const effectId = raw.miscValue | 0;
  const dur = durationMsResolved(state);
  // Emitted as an EFFECT as well as an intent: the resolver drops intents, so intent-only left the
  // WSG flag auras resolving to a send-event alone and the carrier's immunity did nothing.
  if (effectId > 0) {
    state.effects.push({
      kind: 'effect_immunity',
      effectId,
      durationMs: dur,
      positive: true,
    });
  }
  const intent: InterpretIntent = {
    kind: 'effect_immunity',
    effectId,
    durationMs: dur,
  };
  // apply + IsPositive → RemoveAurasWithInterruptFlags INVULNERABILITY. Cite: :2968–2969.
  // Interpret is apply-time on a positive immunity aura → always purge flag.
  intent.purgeInvulnerabilityBuffs = true;
  state.intents.push(intent);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_STATE_IMMUNITY (38) ───────────────────────────────────────── Cite:
// SpellAuras.cpp:2972–2989 HandleAuraModStateImmunity Bake empty.
export function handleStateImmunity(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const auraType = raw.miscValue | 0;
  const dur = durationMsResolved(state);
  // Emitted as an EFFECT as well as an intent: the resolver drops intents, so an intent-only state
  // immunity never reaches combat — the same defect as the dispel immunity aura.
  if (auraType > 0) {
    state.effects.push({
      kind: 'state_immunity',
      stateAuraType: auraType,
      durationMs: dur,
      positive: true,
    });
  }
  const intent: InterpretIntent = {
    kind: 'state_immunity',
    auraType,
    durationMs: dur,
  };
  // apply + Real + ATTR_EX IMMUNITY_PURGES_EFFECT → remove auras of that AuraType.
  // Cite: :2974–2987. Gate: ctx.immunityPurgesEffect.
  if (state.ctx.immunityPurgesEffect === true) {
    intent.purgeAuraType = true;
  }
  state.intents.push(intent);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_DAMAGE_IMMUNITY (40) ── baked as a damage immunity.
// Cite: SpellAuras.cpp:3046-3051 HandleAuraModDmgImmunity.
export function handleDamageImmunity(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const schoolMask = raw.miscValue | 0;
  const dur = durationMsResolved(state);
  // ApplySpellImmune(IMMUNITY_DAMAGE, misc). Cite: :3048.
  // Hostile-ref suppress is runtime. Cite: :3050.
  state.effects.push({
    kind: 'damage_immunity',
    schoolMask,
    durationMs: dur,
    positive: true,
  });
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_TRACK_RESOURCES (45) ──────────────────────────────────────── Cite:
// SpellAuras.cpp:2163–2171 HandleAuraTrackResources Bake empty (minimap tracking).
export function handleTrackResources(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++: non-player → return. Cite: :2165–2166.
  if (state.ctx.unitTargetIsPlayer === false) return;

  const resourceType = raw.miscValue | 0;
  // Bit = 1 << (misc − 1). Cite: :2169–2170.
  const trackFlag = resourceType > 0 ? (1 << (resourceType - 1)) : 0;
  const dur = durationMsResolved(state);
  state.intents.push({
    kind: 'track_resources',
    resourceType,
    trackFlag,
    durationMs: dur,
  });
  // Catalog / OOC: not a pure no-op. Cite: schema track_resources; KI-567 Find Treasure.
  if (!state.effects.some((e) => e.kind === 'track_resources')) {
    state.effects.push({
      kind: 'track_resources',
      resourceType,
      trackFlag,
      durationMs: dur < 0 ? 0 : dur,
    });
  }
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_INCREASE_SWIM_SPEED (58) ── baked as a signed speed percent on the swim rate.
// Cite: SpellAuras.cpp:2898-2905 HandleAuraModIncreaseSwimSpeed.
export function handleModIncreaseSwimSpeed(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++ requires Real. Cite: :2900–2902.
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  const tagged = withHostile(
    {
      kind: 'speed' as const,
      aura: SPELL_AURA_MOD_INCREASE_SWIM_SPEED,
      pct: min,
      durationMs: dur,
    },
    raw.targetA | 0,
    min,
  );
  state.effects.push(tagged as SpellEffect);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_PACIFY_SILENCE (60) ── the bake carries the silence half only and omits the pacify.
// Cite: SpellAuras.cpp:4390-4394; HandleAuraModPacify :4382; HandleAuraModSilence :2778.
export function handleModPacifySilence(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const dur = durationMsResolved(state);
  // Pacify: SetFlag UNIT_FLAG_PACIFIED. Cite: HandleAuraModPacify :4384–4387.
  state.effects.push({
    kind: 'pacify',
    durationMs: dur || 1000,
  });
  // Silence: SetFlag UNIT_FLAG_SILENCED + interrupt PreventionType SILENCE. Cite: :2778–2794.
  // C++ silence path requires Real — interpret is apply-time. Cite: :2781–2783.
  state.effects.push({
    kind: 'cc',
    control: 'silence',
    mechanic: 'silence',
    durationMs: dur,
    school: schoolOf(state.spell),
  });
  state.role = state.role || 'control';
  state.intents.push({ kind: 'mod_silence_interrupt' });
}

// ── SPELL_AURA_PREVENTS_FLEEING (92) ── empty in the bake. Hostility comes from targetA, since Curse
// of Recklessness targets an enemy and is not a self-buff. Cite: SpellAuras.cpp:5047-5060.
export function handlePreventsFleeing(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++: if (!Real) return. Cite: :5049–5050. If fear auras present: apply → SetFleeing(false); remove →
  // restore flee. Cite: :5052–5059. Fear presence is runtime unit state — emit intent.
  const dur = durationMsResolved(state);
  state.effects.push(withHostile({
    kind: 'prevents_fleeing',
    durationMs: dur,
  }, raw.targetA | 0, 0) as never);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_RANGED_ATTACK_POWER_ATTACKER_BONUS (127) ── the VICTIM's aura adds to the attacker's
// ranged attack power. Cite: SpellAuras.cpp:188; Unit.cpp:7470 MeleeDamageBonusDone.
export function handleRangedAttackPowerAttackerBonus(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // Victim aura: attackers gain RAP while debuff is up. Cite: Unit.cpp:7470.
  const tagged = withHostile(
    {
      kind: 'buff' as const,
      mod: 'attacker_attack_power' as const,
      amount: min,
      durationMs: dur,
    },
    raw.targetA | 0,
    min,
  );
  state.effects.push(tagged as SpellEffect);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_RANGED_AMMO_HASTE (141) ───────────────────────────────── Cite:
// SpellAuras.cpp:3945–3980 HandleRangedAmmoHaste Bake: haste buff. Cite: map-spell-effects.mjs:1065–1069.
export function handleRangedAmmoHaste(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++: non-player → return. Cite: :3947–3948.
  if (state.ctx.unitTargetIsPlayer === false) return;

  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);

  // EquippedItemClass != −1 requires fitted ranged weapon. Cite: :3957–3959.
  // Gate: ctx.equippedItemClass set and no fit (ctx.rangedWeaponFitsSpell === false).
  const equipClass = state.ctx.equippedItemClass;
  if (
    equipClass != null
    && equipClass !== -1
    && state.ctx.rangedWeaponFitsSpell === false
  ) {
    return;
  }

  // Highest-only stacking: only max positive amount applies. Cite: :3951–3954 / :3975–3980.
  // Bake-thin always emits this aura's amount; intent documents highest-only policy.
  state.intents.push({ kind: 'ranged_ammo_haste_highest', amount: min });

  // ApplyAttackTimePercentMod(RANGED_ATTACK, amount). Cite: :3975–3978.
  const tagged = withHostile(
    { kind: 'buff' as const, mod: 'haste' as const, amount: min, durationMs: dur },
    raw.targetA | 0,
    min,
  );
  state.effects.push(tagged as SpellEffect);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_FLAT_SPELL_DAMAGE_VERSUS (180) ── the misc value is a creature type MASK.
// Cite: SpellAuras.cpp:241; Unit.cpp:7055 SpellDamageBonusDone, :4538 GetCreatureTypeMask.
export function handleModFlatSpellDamageVersus(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  const creatureTypeMask = raw.miscValue | 0;
  state.intents.push({
    kind: 'mod_flat_spell_damage_versus',
    creatureTypeMask,
    amount: min,
    durationMs: dur,
  });
  state.effects.push({
    kind: 'buff',
    mod: 'spell_damage_versus',
    amount: min,
    durationMs: dur,
    creatureTypeMask,
  } as SpellEffect);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_SPELL_HIT_CHANCE (55) ────────────────────────────────── Cite: SpellAuras.cpp:3868–3870
// HandleModSpellHitChance Bake empty (aura === 54 || 55 return). Cite: map-spell-effects.mjs:801–802.
export function handleModSpellHitChance(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // m_modSpellHitChance += ±amount. Cite: :3870.
  // Player recompute: GetTotalAuraModifier(55). Cite: StatSystem.cpp:538.
  state.intents.push({
    kind: 'mod_spell_hit_chance',
    amount: min,
    durationMs: dur,
  });
  // Unread intent → Nature's Guidance and every Increased Spell Hit Chance item granted nothing.
  if (min !== 0) {
    state.effects.push({
      kind: 'buff',
      mod: 'spell_hit',
      amount: min,
      durationMs: dur,
      hostile: min < 0,
    });
    state.role = state.role || 'buff';
  }
}

// ── SPELL_AURA_PERIODIC_DAMAGE_PERCENT (89) ── the tick is a percent of the target's max health,
// baked as a flat dot from base points. Cite: SpellAuras.cpp:3242-3244; PeriodicTick :4506-4525.
export function handlePeriodicDamagePercent(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min, pointsPerComboPoint } = effectAmountRange(raw, state.ctx);
  // The tick ignores a non-positive amount. Bake-thin keeps the flat value; with a target maximum
  // supplied it is the full formula, that maximum times the amount over 100.
  let amount = Math.max(1, min);
  if (state.ctx.targetMaxHealth != null && min > 0) {
    amount = Math.max(1, trunc((state.ctx.targetMaxHealth * min) / 100));
  }
  const tickMs = (raw.amplitude | 0) || 3000;
  const dur = durationMsResolved(state);
  // Bake fallback duration when unset. Cite: map-spell-effects.mjs:1100 dur || 12000.
  const durationMs = dur > 0 ? dur : 12_000;
  state.effects.push(
    withPpc(
      {
        kind: 'dot',
        school: schoolOf(state.spell),
        min: amount,
        max: amount,
        durationMs,
        tickMs,
      },
      pointsPerComboPoint,
    ) as SpellEffect,
  );
}

// ── SPELL_AURA_WATER_WALK (104) ─────────────────────────────────────────── Cite: SpellAuras.cpp:1661–1667
// HandleAuraWaterWalk Play surface: aura chip (no water-surface movement sim — feather_fall pattern).
export function handleAuraWaterWalk(
  state: HandlerState,
  _raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++: if (!Real) return. Cite: :1663–1664.
  // SetWaterWalk(apply). Cite: :1666; Unit.cpp:12486 SMSG_MOVE_WATER_WALK.
  const dur = durationMsResolved(state);
  state.intents.push({ kind: 'water_walk', durationMs: dur });
  if (!state.effects.some((e) => e.kind === 'water_walk')) {
    state.effects.push({ kind: 'water_walk', durationMs: dur < 0 ? 0 : dur });
  }
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_ADD_TARGET_TRIGGER (109) ── the payload fires on the spell's victim.
// Cite: SpellAuras.cpp:170; Spell.cpp:7433-7468 ProcSpellAuraTriggers.
export function handleAddTargetTrigger(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const trig = raw.triggerSpell | 0;
  if (!trig) return;
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  const id = state.spell.id | 0;
  // procid = EffectTriggerSpell[eff]. Cite: Spell.cpp:7454. chance = CalculateSpellEffectValue (amount).
  // Cite: :7457–7458. Mask = spell_affect row, else EffectItemType. Cite: SpellMgr.h:1950–1958.
  const itemType = (raw.itemType ?? 0) | 0;
  const affect = SPELL_AFFECT_MASK_ADD_TARGET_TRIGGER[id] ?? 0;
  state.effects.push({
    kind: 'add_target_trigger',
    triggerSpellId: trig,
    chancePct: min,
    durationMs: dur,
    familyName: (state.spell.spellFamilyName ?? 0) | 0,
    familyFlags: itemType || affect,
  });
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_POWER_REGEN_PERCENT (110) ── a percent of the spirit-based mana regen, not a flat
// mana per five. Cite: SpellAuras.cpp:3644-3655; StatSystem.cpp:551-552.
export function handleModPowerRegenPercent(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++: if (!Real) return; player only; POWER_MANA → UpdateManaRegen. Cite: :3646–3655.
  if (state.ctx.unitTargetIsPlayer === false) return;

  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  const powerType = raw.miscValue | 0;

  // POWER_MANA = 0: catalog + combat buff. Cite: StatSystem.cpp:551–552.
  if (powerType === 0) {
    const tagged = withHostile(
      { kind: 'buff' as const, mod: 'mana_regen_pct' as const, amount: min, durationMs: dur },
      raw.targetA | 0,
      min,
    );
    state.effects.push(tagged as SpellEffect);
    state.role = state.role || 'buff';
  }

  // C++ use sites: mana spirit × multiplier; rage/energy (100+amount)/100.
  // Cite: StatSystem.cpp:551–552; Player.cpp:2340–2353. POWER_MANA = 0.
  const intent: InterpretIntent = {
    kind: 'mod_power_regen_percent',
    powerType,
    amount: min,
    durationMs: dur,
  };
  if (powerType === 0) intent.updateManaRegen = true;
  state.intents.push(intent);
}

// ── SPELL_AURA_SAFE_FALL (144) ── an empty body in the C++; the modifier reduces the fall distance.
// Cite: SpellAuras.cpp:5649-5651; Player.cpp:19535-19537.
export function handleAuraSafeFall(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // damageperc = 0.018 * (z_diff - safe_fall) - 0.2426. Cite: Player.cpp:19537.
  state.intents.push({
    kind: 'safe_fall',
    amount: min,
    durationMs: dur,
  });
  // Catalog / OOC: not a pure no-op. Cite: schema safe_fall; KI-693.
  if (!state.effects.some((e) => e.kind === 'safe_fall')) {
    state.effects.push({ kind: 'safe_fall', amount: min, durationMs: dur < 0 ? 0 : dur });
  }
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_STEALTH_LEVEL (154) ──────────────────────────────────── Cite: SpellAuras.cpp:2621–2623
// HandleModStealthLevel Bake: stealth_level. Cite: map-spell-effects.mjs:1077–1079.
export function handleModStealthLevel(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  // AddStealthStrength(StealthType(misc), ±amount). Cite: :2623.
  // Bake: Math.max(0, min). Cite: map-spell-effects.mjs:1078.
  state.effects.push({
    kind: 'stealth_level',
    amount: Math.max(0, min),
  });
}

// ── SPELL_AURA_BIND_SIGHT (1) ───────────────────────────────────────────── Cite: SpellAuras.cpp:2126–2136
// HandleBindSight Bake empty. (Distinct from SPELL_EFFECT_BIND_SIGHT EffectNULL.)
export function handleAuraBindSight(
  state: HandlerState,
  _raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++: caster must be player. Cite: :2128–2129.
  if (state.ctx.casterIsPlayer === false) return;
  // apply → camera.SetView(target); remove → ResetView. Cite: :2133–2136.
  const dur = durationMsResolved(state);
  state.intents.push({ kind: 'bind_sight', durationMs: dur });
  // Player-visible channel chip (no multi-session camera). Cite: schema bind_sight; KI-187.
  state.effects.push({ kind: 'bind_sight', durationMs: dur });
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_POWER_COST_SCHOOL (73) ───────────────────────────────── Cite: SpellAuras.cpp:4208–4216
// HandleModPowerCost Bake empty.
export function handleModPowerCost(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++: if (!Real) return. Cite: :4210–4211.
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // Per school bit in misc: ApplyModInt32Value(POWER_COST_MODIFIER+i, amount).
  // Cite: :4214–4216.
  const schoolMask = raw.miscValue | 0;
  state.intents.push({
    kind: 'mod_power_cost_school',
    schoolMask,
    amount: min,
    durationMs: dur,
  });
  // The intent had no consumer, so the Focus set bonuses and Burst of Knowledge / Insight
  // changed no cast cost at all. `power_cost` is read in spellCost.
  if (min !== 0) {
    state.effects.push({
      kind: 'buff',
      mod: 'power_cost',
      amount: min,
      durationMs: dur,
      hostile: min > 0,
      ...schoolScope(schoolMask),
    });
    state.role = state.role || 'buff';
  }
}

// A single-bit school mask narrows a cost buff to that school; a multi-bit or empty mask means every
// school, which is what applyBuffMod does with no school named. Cite: SpellAuras.cpp:4199-4216.
function schoolScope(schoolMask: number): { school?: School } {
  const school = schoolFromSingleBitMask(schoolMask);
  return school ? { school } : {};
}

// ── SPELL_AURA_FAR_SIGHT (76) ───────────────────────────────────────────── Cite: SpellAuras.cpp:2139–2149
// HandleFarSight Bake empty. Same camera body as BIND_SIGHT.
export function handleAuraFarSight(
  state: HandlerState,
  _raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++: caster must be player. Cite: :2141–2142.
  if (state.ctx.casterIsPlayer === false) return;
  // apply → camera.SetView(target); remove → ResetView. Cite: :2146–2149.
  const dur = durationMsResolved(state);
  state.intents.push({ kind: 'far_sight', durationMs: dur });
}

// ── SPELL_AURA_SPLIT_DAMAGE_PCT (81) ── a percent of the remaining damage is redirected.
// Cite: SpellAuras.cpp:142; Unit.cpp:2539-2570 CalculateAbsorbAndResist.
export function handleSplitDamagePct(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // The split is the remaining damage times the amount over 100, gated on the school mask and on a
  // living linked caster, which is a runtime check. Cite: Unit.cpp:2545-2553.
  state.effects.push({
    kind: 'split_damage',
    pct: Math.max(1, min),
    schoolMask: raw.miscValue | 0,
    durationMs: dur,
  });
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_UNATTACKABLE (93) ────────────────────────────────────── Cite: SpellAuras.cpp:4454–4459
// HandleModUnattackable Bake empty.
export function handleModUnattackable(
  state: HandlerState,
  _raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // Real && Apply → CombatStop(). Cite: :4456–4457.
  // ApplyModFlag(UNIT_FLAG_UNTARGETABLE, apply). Cite: :4459.
  const dur = durationMsResolved(state);
  state.intents.push({
    kind: 'mod_unattackable',
    durationMs: dur,
    combatStopOnApply: true,
  });
  // Phase Shift (Imp): catalog surface so Grimoire teach is not a pure no-op. Cite: KI-490.
  if (!state.effects.some((e) => e.kind === 'mod_unattackable')) {
    state.effects.push({
      kind: 'mod_unattackable',
      durationMs: dur < 0 ? 0 : dur,
      combatStopOnApply: true,
    });
  }
  state.role = state.role || 'buff';
}

/** Enrage (5229) / Bloodrage (29131) SetInDummyCombatState. Cite: SpellAuras.cpp:5116–5119. */
export const INTERRUPT_REGEN_DUMMY_COMBAT_IDS = new Set([5229, 29131]);

// ── SPELL_AURA_INTERRUPT_REGEN (94) ───────────────────────────────────────
// Cite: SpellAuras.cpp:5111–5119 HandleInterruptRegen; Player.cpp:2303–2304 HasAuraType.
export function handleInterruptRegen(
  state: HandlerState,
  _raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++: if (!Real) return. Cite: :5113–5114.
  const dur = durationMsResolved(state);
  const dummy = INTERRUPT_REGEN_DUMMY_COMBAT_IDS.has(state.spell.id | 0);
  const intent: InterpretIntent = { kind: 'interrupt_regen', durationMs: dur };
  if (dummy) intent.setInDummyCombatState = true;
  state.intents.push(intent);
  if (!state.effects.some((e) => e.kind === 'interrupt_regen')) {
    state.effects.push({
      kind: 'interrupt_regen',
      durationMs: dur < 0 ? 0 : dur,
      ...(dummy ? { setInDummyCombatState: true as const } : {}),
    });
  }
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_MELEE_DAMAGE_TAKEN_PCT (126) ── emitted as physical_taken_pct, shared with aura 87.
// Cite: SpellAuras.cpp:187; Unit.cpp:7634 MeleeDamageBonusTaken.
export function handleModMeleeDamageTakenPct(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // GetTotalAuraMultiplier product of (100+amount)/100. Cite: Unit.cpp:7634.
  // Surface: signed whole-percent on physical_taken_pct (Shadowform −20).
  const tagged = withHostile(
    { kind: 'buff' as const, mod: 'physical_taken_pct' as const, amount: min, durationMs: dur },
    raw.targetA | 0,
    min,
  );
  state.effects.push(tagged as SpellEffect);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_SPEED_ALWAYS (129) ── the same body as aura 31, but it stacks as a product on the
// run rate whether mounted or not. Cite: SpellAuras.cpp:190; Unit.cpp UpdateSpeed.
export function handleModSpeedAlways(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++ requires Real. Cite: :2882–2884.
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  const tagged = withHostile(
    {
      kind: 'speed' as const,
      aura: SPELL_AURA_MOD_SPEED_ALWAYS,
      pct: min,
      durationMs: dur,
    },
    raw.targetA | 0,
    min,
  );
  state.effects.push(tagged as SpellEffect);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_USE_NORMAL_MOVEMENT_SPEED (191) ────────────────────────────
// Cite: SpellAuras.cpp:2920–2930 HandleAuraModUseNormalSpeed → UpdateSpeed RUN/SWIM.
export function handleAuraUseNormalMovementSpeed(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  const tagged = withHostile(
    {
      kind: 'speed' as const,
      aura: SPELL_AURA_USE_NORMAL_MOVEMENT_SPEED,
      pct: min,
      durationMs: dur,
    },
    raw.targetA | 0,
    min,
  );
  state.effects.push(tagged as SpellEffect);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_RESIST_PUSHBACK (149) ── empty in the bake; the C++ applies it to cast and channel
// delay. Cite: SpellAuras.cpp:210; Spell.cpp:6817-6820 Delayed, :6849-6852 DelayedChannel.
export function handleResistPushback(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // resistChance starts 100; spellmod; then += GetTotalAuraModifier − 100.
  // Cite: Spell.cpp:6817–6819. Presence of aura amount alone drives chance.
  state.intents.push({
    kind: 'resist_pushback',
    amount: min,
    durationMs: dur,
  });
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_SPLIT_DAMAGE_FLAT (153) ── empty in the bake; a flat share is redirected.
// Cite: SpellAuras.cpp:214; Unit.cpp:2501-2537 CalculateAbsorbAndResist.
export function handleSplitDamageFlat(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // currentAbsorb = min(remaining, amount). Cite: Unit.cpp:2516–2519.
  // School mask + alive linked caster gates. Cite: :2507–2513 — SI5 runtime.
  state.intents.push({
    kind: 'split_damage_flat',
    amount: min,
    schoolMask: raw.miscValue | 0,
    durationMs: dur,
  });
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_POWER_BURN_MANA (162) ── empty in the bake; the tick burns power and deals it back as
// damage. Cite: SpellAuras.cpp:3124-3126 HandleAuraPowerBurn; PeriodicTick :4892-4946.
export function handlePowerBurnMana(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // Handler body only arms m_isPeriodic. Cite: :3125–3126.
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // The burn is capped at the amount, the power type must match the target, and the damage dealt is
  // the burn times the effect's multiple value. Cite: SpellAuras.cpp:4902-4943.
  const multRaw = Number(raw.multipleValue);
  // C++ multiplies by EffectMultipleValue as-is (0 → 0 damage). Cite: :4922.
  const multiplier = Number.isFinite(multRaw) ? multRaw : 0;
  state.intents.push({
    kind: 'power_burn_mana',
    powerType: raw.miscValue | 0,
    amountPerTick: Math.max(0, min),
    tickMs: (raw.amplitude | 0) || 1000,
    multiplier,
    durationMs: dur,
  });
  // Periodic mana burn → school damage: ACTIVE dot role (not invalid 'damage'). Cite: roles.ts.
  state.role = state.role || 'dot';
}

// ── SPELL_AURA_MOD_DAMAGE_DONE_VERSUS (168) ── empty in the bake; a multiplier by creature type mask.
// Cite: SpellAuras.cpp:229; Unit.cpp:7058 SpellDamageBonusDone, :7503 MeleeDamageBonusDone.
export function handleModDamageDoneVersus(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // An intent alone was dead: nothing read that kind, so all eight Echoes of Lordaeron ranks resolved
  // to zero effects. Emit the buff row combat actually consumes.
  const mask = raw.miscValue | 0;
  if (mask) {
    state.effects.push({
      kind: 'buff',
      mod: 'damage_done_versus_pct',
      amount: min,
      creatureTypeMask: mask,
      durationMs: dur,
      hostile: false,
    } as SpellEffect);
  }
  state.intents.push({
    kind: 'mod_damage_done_versus',
    creatureTypeMask: mask,
    amount: min,
    durationMs: dur,
  });
  state.role = state.role || 'buff';
}

// Dead-talent gap: seven auras a shipped talent carries. Each is a no-immediate-effect or a stat
// modifier in C++, so the ROW is the behaviour and an intent alone would be dead here.

// SPELL_AURA_MOD_OFFHAND_DAMAGE_PCT (122) - Dual Wield Specialization. Cite: SpellAuras.cpp:4175-4184
// HandleStatModifier(UNIT_MOD_DAMAGE_OFFHAND, TOTAL_PCT).
export function handleModOffhandDamagePercent(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  if (!min) return;
  state.effects.push({
    kind: 'buff',
    mod: 'offhand_damage_pct' as BuffMod,
    amount: min,
    durationMs: durationMsResolved(state),
    hostile: false,
  } as SpellEffect);
  state.role = state.role || 'buff';
}

// SPELL_AURA_MOD_CRIT_PERCENT_VERSUS (169) - Monster / Humanoid Slaying crit multiplier. Cite:
// Unit.cpp:3555-3563 GetCritMultiplier bonus += ...ByMiscMask(169, creatureTypeMask).
export function handleModCritPercentVersus(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const mask = raw.miscValue | 0;
  const { min } = effectAmountRange(raw, state.ctx);
  if (!mask || !min) return;
  state.effects.push({
    kind: 'buff',
    mod: 'crit_damage_versus_pct' as BuffMod,
    amount: min,
    creatureTypeMask: mask,
    durationMs: durationMsResolved(state),
    hostile: false,
  } as SpellEffect);
  state.role = state.role || 'buff';
}

// MOD_RESISTANCE_OF_STAT_PERCENT (182), Arcane Resilience's armor from intellect. The C++ supports the
// physical school only and logs an error otherwise, so an unsupported mask emits nothing.
export function handleModResistanceOfStatPercent(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const mask = raw.miscValue | 0;
  const { min } = effectAmountRange(raw, state.ctx);
  if (!min || !(mask & 1)) return;
  state.effects.push({
    kind: 'buff',
    mod: 'armor_from_intellect_pct' as BuffMod,
    amount: min,
    durationMs: durationMsResolved(state),
    hostile: false,
  } as SpellEffect);
  state.role = state.role || 'buff';
}

/** Victim-side attacker-chance auras (185-188). The amount is signed and used as-is. */
function attackerChanceAura(state: HandlerState, raw: RawSpellEffect, mod: BuffMod): void {
  const { min } = effectAmountRange(raw, state.ctx);
  if (!min) return;
  const mask = raw.miscValue | 0;
  state.effects.push({
    kind: 'buff',
    mod,
    amount: min,
    ...(mask ? { schoolMask: mask } : {}),
    durationMs: durationMsResolved(state),
    hostile: false,
  } as SpellEffect);
  state.role = state.role || 'buff';
}

/** 185. Cite: Unit.cpp:3794 CalculateEffectiveMissChance victim modifier. */
export function handleModAttackerRangedHitChance(
  state: HandlerState, raw: RawSpellEffect, _slot: number, _effectType: number,
): void {
  attackerChanceAura(state, raw, 'attacker_ranged_hit' as BuffMod);
}

/** 186. Cite: Unit.cpp:3873-3874 MagicSpellHitResult victim modifier (school mask). */
export function handleModAttackerSpellHitChance(
  state: HandlerState, raw: RawSpellEffect, _slot: number, _effectType: number,
): void {
  attackerChanceAura(state, raw, 'attacker_spell_hit' as BuffMod);
}

/** 187. Cite: Unit.cpp:3523-3525 GetCritTakenChance MELEE. */
export function handleModAttackerMeleeCritChance(
  state: HandlerState, raw: RawSpellEffect, _slot: number, _effectType: number,
): void {
  attackerChanceAura(state, raw, 'attacker_melee_crit' as BuffMod);
}

/** 188. Cite: Unit.cpp:3526-3528 GetCritTakenChance RANGED. */
export function handleModAttackerRangedCritChance(
  state: HandlerState, raw: RawSpellEffect, _slot: number, _effectType: number,
): void {
  attackerChanceAura(state, raw, 'attacker_ranged_crit' as BuffMod);
}

// SPELL_AURA_MOD_DAMAGE_DONE_CREATURE (59): flat damage vs a creature-type mask.
// Cite: Unit.cpp:7061 SpellDamageBonusDone; :7465 MeleeDamageBonusDone.
export function handleModDamageDoneCreature(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  const mask = raw.miscValue | 0;
  if (mask) {
    state.effects.push({
      kind: 'buff',
      mod: 'damage_done_creature',
      amount: min,
      creatureTypeMask: mask,
      durationMs: dur,
      hostile: false,
    } as SpellEffect);
  }
  state.intents.push({
    kind: 'mod_damage_done_creature',
    creatureTypeMask: mask,
    amount: min,
    durationMs: dur,
  });
  state.role = state.role || 'buff';
}

// SPELL_AURA_MOD_INCREASE_ENERGY (35) → handlers/mod-increase-energy.ts (KI-907 peel).

// ── SI3 aura batch 13 (this claim list) ────────────────────────────────────

// ── SPELL_AURA_PERIODIC_MANA_FUNNEL (63) ── unused in the C++ and empty in the bake; the obsolete
// Mana Funnel row still carries it. Cite: SpellAuras.h:279-282 HandleUnused.
export function handlePeriodicManaFunnel(
  state: HandlerState,
  _raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++ body empty: "NOT USED BY ANY SPELL OR USELESS". Cite: SpellAuras.h:279–282.
  state.intents.push({ kind: 'periodic_mana_funnel_unused' });
}

// ── SPELL_AURA_FEIGN_DEATH (66) ─────────────────────────────────────────── Cite: SpellAuras.cpp:2382–2424
// HandleFeignDeath; Unit.cpp:10083–10140 SetFeignDeath. Bake empty.
export function handleFeignDeath(
  state: HandlerState,
  _raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++: if (!Real) return. Cite: :2384–2385.
  // Remove while another FEIGN_DEATH remains → no-op. Cite: :2389–2391 — SI5 runtime.
  const dur = durationMsResolved(state);
  const intent: InterpretIntent = {
    kind: 'feign_death',
    durationMs: dur,
  };
  // For a player-controlled target, the highest miss chance among NPC attackers is rolled against, and
  // only a success interrupts the spells cast on them. Cite: SpellAuras.cpp:2390-2416.
  if (state.ctx.unitTargetPlayerControlled === true) {
    intent.playerControlledResistRoll = true;
  }
  state.intents.push(intent);
  // The hate wipe is what this aura DOES: it was gated on one spell id, so Torpor, Fake Death and
  // Play Dead emitted nothing. Wipe current hate, then generate none for the duration.
  state.effects.push(
    { kind: 'modify_threat_pct', pct: -100 },
    { kind: 'buff', mod: 'threat_mod', amount: -100, durationMs: dur, hostile: false },
    {
      kind: 'feign_death',
      durationMs: dur,
      ...(intent.playerControlledResistRoll ? { playerControlledResistRoll: true } : {}),
    },
  );
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_POWER_COST_SCHOOL_PCT (72) ───────────────────────────── Cite: SpellAuras.cpp:4190–4204
// HandleModPowerCostPCT Bake empty. Use site: Spell.cpp:6368 powerCost × (1 + POWER_COST_MULTIPLIER).

/** Expire-cast special on spell 30422 (not Classic 1.12 content). Cite: :4202–4204. */
export const MOD_POWER_COST_PCT_EXPIRE_CAST: ReadonlyMap<number, number> = new Map([
  [30422, 38638],
]);

export function handleModPowerCostPct(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++: if (!Real) return. Cite: :4192–4193.
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // amount/100 written to UNIT_FIELD_POWER_COST_MULTIPLIER+school. Cite: :4197–4200.
  const intent: InterpretIntent = {
    kind: 'mod_power_cost_school_pct',
    schoolMask: raw.miscValue | 0,
    amount: min,
    durationMs: dur,
  };
  // Expire remove → CastSpell(38638) for id 30422. Cite: :4202–4204.
  const expireCast = MOD_POWER_COST_PCT_EXPIRE_CAST.get(state.spell.id | 0);
  if (expireCast != null) intent.expireCastSpellId = expireCast;
  state.intents.push(intent);
  // Unread intent → Lucifron's Curse charged normal mana. `power_cost_pct` is read in spellCost.
  if (min !== 0) {
    state.effects.push({
      kind: 'buff',
      mod: 'power_cost_pct',
      amount: min,
      durationMs: dur,
      hostile: min > 0,
      ...schoolScope(raw.miscValue | 0),
    });
  }
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_PERCENT_STAT (80) ── a BASE percent, unlike 137's total, so there is no stamina
// health rescale. Cite: SpellAuras.cpp:3489-3505 HandleModPercentStat.
export function handleModPercentStat(
  state: HandlerState,
  raw: RawSpellEffect,
  slot: number,
  effectType: number,
): void {
  const misc = raw.miscValue | 0;
  // C++: misc < −1 || > 4 → error return. Cite: :3491–3495.
  if (misc < -1 || misc > 4) {
    state.unhandled.push({
      slot,
      effect: effectType,
      auraName: SPELL_AURA_MOD_PERCENT_STAT,
      reason: `MOD_PERCENT_STAT miscValue ${misc} out of range [-1,4]`,
    });
    return;
  }
  // only players have base stats. Cite: :3498–3500.
  if (state.ctx.unitTargetIsPlayer === false) return;

  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // A misc value of -1 means all five stats. Always the percent name, never the flat one — see
  // STAT_MOD_PCT. Cite: SpellAuras.cpp:3501-3504.
  const mod: BuffMod = STAT_MOD_PCT[String(misc)] ?? 'all_stats_pct';
  const tagged = withHostile(
    { kind: 'buff' as const, mod, amount: min, durationMs: dur },
    raw.targetA | 0,
    min,
  );
  state.effects.push(tagged as SpellEffect);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_GHOST (95) ───────────────────────────────────────────────── Cite: SpellAuras.cpp:4396–4420
// HandleAuraGhost Bake empty.
export function handleAuraGhost(
  state: HandlerState,
  _raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // SetVisFlags(UNIT_VIS_FLAG_GHOST); player PLAYER_FLAGS_GHOST + water-walk.
  // Cite: :4401–4408 apply / :4411–4418 remove.
  const dur = durationMsResolved(state);
  state.intents.push({
    kind: 'ghost',
    durationMs: dur,
    setWaterWalkUnlessWaterWalkAura: true,
  });
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_SPELL_MAGNET (96) ── baked as a magnet, which redirects a harmful single-target spell.
// Cite: SpellAuras.cpp:157; Unit.cpp:6894-6919 SelectMagnetTarget.
export function handleSpellMagnet(
  state: HandlerState,
  _raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const dur = durationMsResolved(state);
  // Magic/none DmgClass; skip ABILITY / NO_REDIRECTION / NO_IMMUNITIES. Alive magnet caster + CanAttack →
  // UseMagnet() + redirect target. Cite: Unit.cpp:6899–6916.
  state.intents.push({ kind: 'spell_magnet', durationMs: dur });
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_AURAS_VISIBLE (100) ──────────────────────────────────────── Cite: SpellAuras.cpp:3383–3385
// HandleAurasVisible Bake empty.
export function handleAurasVisible(
  state: HandlerState,
  _raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // ApplyModFlag(UNIT_FLAG_AURAS_VISIBLE, apply). Cite: :3385.
  const dur = durationMsResolved(state);
  state.intents.push({ kind: 'auras_visible', durationMs: dur });
  // Detect Magic catalog / OOC aura surface. Cite: schema auras_visible; KI-124.
  state.effects.push({ kind: 'auras_visible', durationMs: dur });
  state.role = state.role || 'buff';
}

// SPELL_AURA_HOVER (106). Cite: SpellAuras.cpp:1681–1688 HandleAuraHover; Unit.cpp:12428 SetHover.
export function handleAuraHover(
  state: HandlerState,
  _raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++: if (!Real) return; SetHover(apply). Cite: :1683–1687.
  const dur = durationMsResolved(state);
  state.intents.push({ kind: 'hover', durationMs: dur });
  if (!state.effects.some((e) => e.kind === 'hover')) {
    state.effects.push({ kind: 'hover', durationMs: dur < 0 ? 0 : dur });
  }
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_REGEN_DURING_COMBAT (116) ── health regen that keeps running in combat.
// Cite: SpellAuras.cpp:177; Player.cpp:2297-2299 RegenerateAll, :2390-2400 RegenerateHealth.
export function handleModRegenDuringCombat(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // In combat + HasAuraType(116) → spirit HP regen; ×= amount/100. Cite: :2399–2400.
  state.intents.push({
    kind: 'mod_regen_during_combat',
    amount: min,
    durationMs: dur,
  });
  // Catalog surface (fillEmptyEffectsFromRaw) needs effects[], not intents alone.
  state.effects.push({
    kind: 'mod_regen_during_combat',
    amount: min,
    durationMs: dur,
  } as never);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_UNTRACKABLE (120) ────────────────────────────────────────── Cite: SpellAuras.cpp:4374–4379
// HandleAuraUntrackable Bake empty.
export function handleAuraUntrackable(
  state: HandlerState,
  _raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // apply SetVisFlags(UNIT_VIS_FLAG_UNTRACKABLE); else RemoveVisFlags. Cite: :4376–4379.
  const dur = durationMsResolved(state);
  state.intents.push({ kind: 'untrackable', durationMs: dur });
  state.role = state.role || 'buff';
}

// SharedDefines.h CREATURE_TYPE_BEAST = 1. Cite: SharedDefines.h:1141.

export const CREATURE_TYPE_BEAST = 1;

// ── SPELL_AURA_EMPATHY (121) ────────────────────────────────────────────── Cite: SpellAuras.cpp:4351–4371
// HandleAuraEmpathy Bake empty. Beast Lore 1462.
export function handleAuraEmpathy(
  state: HandlerState,
  _raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // Player or (unit + CREATURE_TYPE_BEAST) → UNIT_DYNFLAG_SPECIALINFO. Cite: :4355–4357.
  // Bake-thin: omit gates → eligible (emit applySpecialInfo).
  let applySpecialInfo = true;
  if (state.ctx.unitTargetIsPlayer === false) {
    // Non-player: only beasts. Cite: :4356–4357.
    if (
      state.ctx.unitTargetCreatureType != null
      && state.ctx.unitTargetCreatureType !== CREATURE_TYPE_BEAST
    ) {
      applySpecialInfo = false;
    }
  }
  // apply + player caster → BuildValuesUpdateBlockForPlayerWithFlags. Cite: :4359–4369.
  // Bake-thin omit casterIsPlayer → player path.
  const sendSpecialInfoUpdate = state.ctx.casterIsPlayer !== false;

  const dur = durationMsResolved(state);
  const intent: InterpretIntent = {
    kind: 'empathy',
    durationMs: dur,
    applySpecialInfo,
  };
  if (sendSpecialInfoUpdate) intent.sendSpecialInfoUpdate = true;
  state.intents.push(intent);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_POSSESS_PET (128) ── Eyes of the Beast possesses your OWN pet's vision, not an
// enemy: emitting a control effect put it in the combat kit and incapacitated the fight target.
export function handleModPossessPet(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++: if (!Real) return. Cite: :2260–2261. Non-player caster → return. Cite: :2263–2264. Bake-thin: omit
  // casterIsPlayer → player path (emit).
  if (state.ctx.casterIsPlayer === false) return;
  // Target must be unit pet. Cite: :2266–2267.
  // Bake-thin: omit unitTargetIsPet → assume pet (emit).
  if (state.ctx.unitTargetIsPet === false) return;

  const dur = durationMsResolved(state);
  // An intent plus a play-surface effect, the bind-sight pattern. No control kind, because this is
  // not enemy control. Cite: SpellAuras.cpp:2269-2278.
  const durationMs = dur || 10_000;
  state.intents.push({
    kind: 'mod_possess_pet',
    spellId: state.spell.id | 0,
    durationMs,
    breakOutgoing: true,
  });
  state.effects.push({
    kind: 'mod_possess_pet',
    spellId: state.spell.id | 0,
    durationMs,
  } as never);
  // Pet vision utility — never combat control (KI-097 residual).
  state.role = state.role || 'utility';
}

// ── SPELL_AURA_MOD_MOUNTED_SPEED_ALWAYS (130) ── the mounted run rate, stacking as a product while
// mounted. Cite: SpellAuras.cpp:2889-2895; Unit.cpp:8340.
export function handleModMountedSpeedAlways(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++ requires Real. Cite: :2891–2893.
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  const tagged = withHostile(
    {
      kind: 'speed' as const,
      aura: SPELL_AURA_MOD_MOUNTED_SPEED_ALWAYS,
      pct: min,
      durationMs: dur,
    },
    raw.targetA | 0,
    min,
  );
  state.effects.push(tagged as SpellEffect);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_HEALING_DONE_PERCENT (136) ── baked as a healing-done percent.
// Cite: SpellAuras.cpp:197; Unit.cpp:7200-7203 SpellHealingBonusDone.
export function handleModHealingDonePercent(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // Whole percent from base points (Power Infusion +20). Cite: Unit.cpp:7202.
  const tagged = withHostile(
    { kind: 'buff' as const, mod: 'healing_done_pct' as const, amount: min, durationMs: dur },
    raw.targetA | 0,
    min,
  );
  state.effects.push(tagged as SpellEffect);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_BASE_RESISTANCE_PCT (142) ── a physical mask becomes a base armor percent, never
// flat armor. Cite: SpellAuras.cpp:3425-3437 HandleAuraModBaseResistancePercent.
export function handleModBaseResistancePct(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  // C++: if (!m_modifier.m_amount) return. Cite: :3427–3428.
  if (!min) return;
  const dur = durationMsResolved(state);
  const mask = raw.miscValue | 0;
  // Physical bit (SPELL_SCHOOL_MASK_NORMAL = 1) is base armor percent. Cite: :3432–3435.
  if ((mask & 1) !== 0) {
    const tagged = withHostile(
      { kind: 'buff' as const, mod: 'armor_base_pct' as const, amount: min, durationMs: dur },
      raw.targetA | 0,
      min,
    );
    state.effects.push(tagged as SpellEffect);
  }
  // Magic bits are the same BASE_PCT on that school's resistance — Ossirian's five Weaknesses
  // strip 100%. Cite: boss_ossirian.cpp:54-58; SpellAuras.cpp:3432-3435.
  for (let bit = 1; bit <= 6; bit++) {
    if ((mask & (1 << bit)) === 0) continue;
    state.effects.push(withHostile(
      { kind: 'resist' as const, school: SCHOOLS[bit]!, amount: 0, pct: min },
      raw.targetA | 0,
      min,
    ) as SpellEffect);
  }
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_TRACK_STEALTHED (151) ────────────────────────────────────── Cite: SpellAuras.cpp:2174–2179
// HandleAuraTrackStealthed Bake empty. Track Hidden 19885.
export function handleAuraTrackStealthed(
  state: HandlerState,
  _raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++: non-player → return. Cite: :2176–2177.
  if (state.ctx.unitTargetIsPlayer === false) return;
  // ApplyModByteFlag PLAYER_FIELD_BYTES TRACK_STEALTHED. Cite: :2179.
  const dur = durationMsResolved(state);
  state.intents.push({ kind: 'track_stealthed', durationMs: dur });
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_WATER_BREATHING (155) ── distinct from aura 82, which is infinite. Empty in the
// bake; the Undead racial carries it. Cite: SpellAuras.cpp:1701-1706 HandleModWaterBreathing.
export function handleModWaterBreathing(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++: player only. Cite: :1705–1706.
  if (state.ctx.unitTargetIsPlayer === false) return;

  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // GetTotalAuraMultiplier: product of (100+amount)/100. Cite: Unit.cpp:4492–4500.
  // Single-aura contribution for this slot.
  const intervalMultiplier = (100 + min) / 100;
  state.intents.push({
    kind: 'mod_water_breathing',
    amount: min,
    intervalMultiplier,
    durationMs: dur,
  });
  // Undead racial Underwater Breathing 5227 — catalog surface. Cite: KI-686.
  if (!state.effects.some((e) => e.kind === 'mod_water_breathing' || e.kind === 'water_breathing')) {
    state.effects.push({
      kind: 'mod_water_breathing',
      amount: min,
      intervalMultiplier,
      durationMs: dur < 0 ? 0 : dur,
    });
  }
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_REPUTATION_GAIN (156) ── an effect row for the catalog and combat surface, plus an
// intent for the reputation pipelines. Cite: SpellAuras.cpp:217; Player.cpp:6297-6302.
export function handleModReputationGain(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // repMod = GetTotalAuraModifier(156); percent += rep > 0 ? repMod : -repMod.
  // Cite: Player.cpp:6297, :6302.
  state.intents.push({
    kind: 'mod_reputation_gain',
    amount: min,
    durationMs: dur,
  });
  // Catalog / fillEmptyEffectsFromRaw needs a SpellEffect row (intents alone leave effects[]).
  state.effects.push({
    kind: 'mod_reputation_gain',
    amount: min,
    durationMs: dur,
  } as never);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_NO_PVP_CREDIT (159) ── empty in the bake; the honor reward returns false while it is
// held, and Honorless Target is the only Classic consumer. Cite: Player.cpp:6626-6627.
export function handleNoPvpCredit(
  state: HandlerState,
  _raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const dur = durationMsResolved(state);
  // Victim carrying this aura grants no honor. Cite: Player.cpp:6626–6627.
  state.intents.push({ kind: 'no_pvp_credit', durationMs: dur });
  state.effects.push({ kind: 'no_pvp_credit', durationMs: dur });
  state.role = state.role || 'buff';
}

// SPELL_AURA_MOD_AOE_AVOIDANCE (160). Miss chance += GetTotalAuraModifier vs area spells. Cite:
// SpellAuras.cpp:221 HandleNoImmediateEffect; Unit.cpp:3713–3715.
export function handleModAoEAvoidance(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  state.effects.push({ kind: 'buff', mod: 'aoe_avoidance', amount: min, durationMs: dur });
  state.role = state.role || 'buff';
}

// SPELL_AURA_MECHANIC_IMMUNITY_MASK (147). misc is a mechanic bitmask; IsImmuneToSpell reads it. Cite:
// SpellAuras.cpp:2951–2959 HandleModMechanicImmunityMask.
export function handleModMechanicImmunityMask(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const mask = raw.miscValue | 0;
  const dur = durationMsResolved(state);
  state.effects.push({
    kind: 'mechanic_immunity',
    mechanic: mask,
    durationMs: dur,
    positive: true,
  });
  state.role = state.role || 'buff';

  // On apply + SPELL_ATTR_EX_IMMUNITY_PURGES_EFFECT → RemoveAurasAtMechanicImmunity.
  // Cite: SpellAuras.cpp:2955-2956. Bake-thin: attr unknown unless ctx.immunityPurgesEffect === true.
  if (state.ctx.immunityPurgesEffect === true && mask > 0) {
    state.intents.push({
      kind: 'mechanic_immunity_purge',
      mechanic: 0,
      mechanicMask: mask,
    });
  }
}

// SPELL_AURA_MOD_FACTION_REPUTATION_GAIN (190). GetTotalAuraModifierByMiscValue(faction). Cite:
// Player.cpp:6301.
export function handleModFactionReputationGain(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  const factionId = raw.miscValue | 0;
  state.effects.push({
    kind: 'mod_reputation_gain',
    amount: min,
    durationMs: dur,
    factionId,
  });
  state.role = state.role || 'buff';
}

/** SPELL_AURA_MOD_BLOCK_SKILL (50) — HandleUnused obsolete. Cite: SpellAuras.cpp:111. */
export function handleModBlockSkillUnused(
  state: HandlerState,
  _raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  state.effects.push({ kind: 'client_inform' });
}

/** SPELL_AURA_CHARISMA (145) — HandleUnused obsolete. Cite: SpellAuras.cpp:206. */
export function handleAuraCharismaUnused(
  state: HandlerState,
  _raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  state.effects.push({ kind: 'client_inform' });
}

/** SPELL_AURA_164 — unused aura id. Cite: SpellAuraDefines.h:299. */
export function handleAura164Unused(
  state: HandlerState,
  _raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  state.effects.push({ kind: 'client_inform' });
}

// SPELL_AURA_DETECT_AMORE (170) — PLAYER_FIELD_BYTES2 client flag, no combat payload. Cite:
// SpellAuras.cpp:2719–2725 HandleDetectAmore.
export function handleDetectAmoreUnused(
  state: HandlerState,
  _raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  state.effects.push({ kind: 'client_inform' });
}

