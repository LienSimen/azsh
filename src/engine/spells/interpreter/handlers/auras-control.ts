/** SI2.5 / SI3 handlers — auras-control (split from handlers.ts, pure move). */

import type { BuffMod, RawSpellEffect, School, SpellEffect } from '../../../../data/schema.ts';
import { effectAmountRange } from '../amount.ts';
import type {
  InterpretIntent,
} from '../types.ts';
import { STAT_MOD_PCT, withHostile } from '../targeting.ts';
import {
  SPELL_AURA_MOD_TOTAL_STAT_PERCENTAGE,
} from '../opcodes.ts';
import type {
  HandlerState,
} from './shared.ts';
import {
  MOD_INCREASE_HEALTH_CUR_HP_IDS,
  MOD_INCREASE_HEALTH_PRESERVE_PCT_IDS,
  MOD_THREAT_LEVEL_SCALE,
  BASE_ATTACK_TIME_MS,
  CONTROL_CONSOLE_APPLY_SPELLS,
  CONTROL_CONSOLE_REMOVE_CASTER_SPELLS,
  CONTROL_CONSOLE_REMOVE_TARGET_SPELL,
  CONTROL_CONSOLE_DESPAWN_MS,
  CONTROL_CONSOLE_SPELL_ID,
  MUTATE_BUG_SPELL_ID,
  SHADE_OF_ARAN_DRINK_SPELL_ID,
  FORM_CAT,
  FORM_TREE,
  FORM_TRAVEL,
  FORM_AQUA,
  FORM_BEAR,
  FORM_GHOUL,
  FORM_DIREBEAR,
  FORM_CREATUREBEAR,
  FORM_GHOSTWOLF,
  FORM_BATTLESTANCE,
  FORM_DEFENSIVESTANCE,
  FORM_BERSERKERSTANCE,
  FORM_MOONKIN,
  FORM_SPIRITOFREDEMPTION,
  POWER_MANA,
  POWER_RAGE,
  POWER_ENERGY,
  TRANQUILIZING_POISON_IDS,
  TRANQUILIZING_POISON_SLEEP,
  SPIRIT_SHADE_VISUAL_ID,
  TRACK_HUMANOIDS_SPELL,
  FUROR_ENERGY_SPELL,
  FUROR_RAGE_SPELL,
  SCHOOLS,
  schoolOf,
  schoolFromSingleBitMask,
  durationMsResolved,
  withPpc,
  trunc,
  pushOrMergePolymorphIncapacitate,
} from './shared.ts';
// ── SPELL_AURA_MOD_SILENCE (27) ───────────────────────────────────────────── Cite:
// SpellAuras.cpp:2778–2804 HandleAuraModSilence Bake: cc silence. Cite: map-spell-effects.mjs:708–714.
export function handleModSilence(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++: if (!Real) return. Interpret is apply-time snapshot (Real=true). Cite: :2781–2783.
  const dur = durationMsResolved(state);
  // SetFlag UNIT_FLAG_SILENCED; remove only when no other MOD_SILENCE remains.
  // Cite: :2789 apply; :2799–2802 remove.
  state.effects.push({
    kind: 'cc',
    control: 'silence',
    mechanic: 'silence',
    durationMs: dur,
    school: schoolOf(state.spell),
  });
  state.role = state.role || 'control';
  // On apply: interrupt current spells with PreventionType == SILENCE.
  // Cite: :2790–2794.
  state.intents.push({ kind: 'mod_silence_interrupt' });
}

// ── SPELL_AURA_MOD_DAMAGE_PERCENT_TAKEN (87) ── a physical-only mask becomes physical_taken_pct;
// magic or multi-bit becomes damage_taken_pct with a schoolMask. Cite: Unit.cpp:7108, :7628.
export function handleModDamagePercentTaken(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  const misc = raw.miscValue | 0;
  // Physical-only (SPELL_SCHOOL_MASK_NORMAL=1): Barkskin-class. Cite: Unit.cpp:7628.
  if (misc === 1) {
    const tagged = withHostile(
      { kind: 'buff' as const, mod: 'physical_taken_pct' as const, amount: min, durationMs: dur },
      raw.targetA | 0,
      min,
    );
    state.effects.push(tagged as SpellEffect);
  } else {
    // CoE misc 20 fire|frost +6; CoS 96 shadow|arcane; Stormstrike 8 nature +20.
    // Cite: spell_template 1490/17862/17364 EffectMiscValue; Unit.cpp:7628; KI-767.
    const tagged = withHostile(
      {
        kind: 'buff' as const,
        mod: 'damage_taken_pct' as const,
        amount: min,
        durationMs: dur,
        ...(misc ? { schoolMask: misc } : {}),
      },
      raw.targetA | 0,
      min,
    );
    state.effects.push(tagged as SpellEffect);
  }
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_HEALTH_REGEN_IN_COMBAT (161) ── an always-on flat regen. The DBC amount is health
// per five seconds, so an amplitude of 0 becomes a 5000 ms tick. Cite: Player.cpp:2407-2412.
export function handleModHealthRegenInCombat(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // Amount is HP per 5 sec (Demon Skin "3 Health per 5 sec"); rate-match via tickMs 5000.
  // Cite: Player.cpp:2407–2412; StatSystem.cpp:555 mp5/5; KI-575/576/685.
  state.effects.push({
    kind: 'restore_health',
    amountPerTick: Math.max(1, min),
    tickMs: (raw.amplitude | 0) || 5000,
    durationMs: dur,
  });
  state.role = state.role || 'buff';
  // Does NOT set outOfCombatOnly — applies in combat. Cite: map-spell-effects.mjs aura 161.
}

// ── SPELL_AURA_MOD_HEALING_PCT (118) ── emitted as healing_taken_pct, a percent rather than a flat
// amount. The C++ takes the largest negative and the largest positive separately. Cite: Unit.cpp:7239.
export function handleModHealingPct(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // Signed percent (Mortal Strike −50). Live sum matches physical_taken_pct; single-debuff
  // MS/Wound is identical to C++ GetMaxNegativeAuraModifier. Cite: Unit.cpp:7239–7245.
  const tagged = withHostile(
    { kind: 'buff' as const, mod: 'healing_taken_pct' as const, amount: min, durationMs: dur },
    raw.targetA | 0,
    min,
  );
  state.effects.push(tagged as SpellEffect);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_CONFUSE (5) ── Real applications only, baked as an incapacitate with the polymorph
// mechanic. Cite: SpellAuras.cpp:2354-2366 HandleModConfuse.
export function handleModConfuse(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // TARGET_UNIT_CASTER stays a row: applySpell's isSelfTargetedSpell gate keeps it off a foe and
  // still lands the self-cast. Cite: roles.ts:27; applySpell.ts:1554; KI-1017.
  const dur = durationMsResolved(state);
  // Blind is disoriented and breaks on damage; Polymorph keeps polymorph. The default is polymorph so
  // a confuse and a transform still merge on one diminishing-returns step.
  const named = state.spell.mechanic;
  const mechanic =
    named === 'disoriented' || named === 'polymorph' || named === 'sleep' || named === 'shackle'
      ? named
      : 'polymorph';
  pushOrMergePolymorphIncapacitate(state, {
    kind: 'cc',
    control: 'incapacitate',
    mechanic,
    durationMs: dur,
    school: schoolOf(state.spell),
    breakOnDamage: true,
  });
  // SetConfused + getHostileRefManager().HandleSuppressed — runtime only. Cite: :2363–2365.
}

// ── SPELL_AURA_MOD_CHARM (6) / AOE_CHARM (177) ── the same TakeCharmOf thrall; the advertised form is
// the single-target handler and the other the AoE one. Cite: SpellAuras.cpp:2282-2351.
function emitTakeCharmOf(state: HandlerState, advertised: boolean): void {
  // Not charm yourself. Cite: HandleModCharm :2289–2291; HandleAoECharm :2338–2340.
  if (state.ctx.unitTargetIsSelf === true) return;
  // Missing caster → return. Cite: :2293–2295 / :2342–2344. Bake-thin has implicit caster.

  const dur = durationMsResolved(state);
  // TakeCharmOf thrall surface (faction flip + PetAI). Cite: Unit.cpp:11328; KI-896.
  state.effects.push({
    kind: 'cc',
    control: 'charm',
    mechanic: 'charm',
    durationMs: dur,
    school: schoolOf(state.spell),
  });
  state.role = state.role || 'control';

  const intent: InterpretIntent = {
    kind: 'mod_charm',
    spellId: state.spell.id | 0,
    durationMs: dur,
    advertised,
  };
  // Player advertised charm is unique: BreakCharmOutgoing(true) then TakeCharmOf.
  // AOE_CHARM is non-advertised — skip. Cite: :2304–2307 vs :2346–2348.
  if (advertised && state.ctx.casterIsPlayer !== false) {
    intent.breakOutgoing = true;
  }
  state.intents.push(intent);
}

export function handleModCharm(
  state: HandlerState,
  _raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++: if (!Real) return. Cite: :2284–2285.
  emitTakeCharmOf(state, true);
}

export function handleAoECharm(
  state: HandlerState,
  _raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++: if (!Real) return. Cite: :2333–2334. TakeCharmOf(target, GetId(), false) — private set, co-exists
  // with other charms. Cite: SpellAuras.cpp:2346–2348 (de8f729); Unit.cpp:11350 m_charmedUnitsPrivate.
  emitTakeCharmOf(state, false);
}

// ── SPELL_AURA_DISPEL_IMMUNITY (41) ── unmapped in the bake, so the intent carries the dispel type.
// Cite: SpellAuras.cpp:3053-3059; Unit.cpp ApplySpellDispelImmunity :7697-7702.
export function handleDispelImmunity(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++: if (!Real) return. Cite: :3056–3057.
  const dispelType = raw.miscValue | 0;
  const dur = durationMsResolved(state);
  // Emitted as an EFFECT, not only an intent: intents are dropped by the resolver, so an intent-only
  // dispel immunity never reached combat and Stoneform's poison immunity was inert.
  if (dispelType > 0) {
    state.effects.push({
      kind: 'dispel_immunity',
      dispelType,
      durationMs: dur,
      positive: true,
    });
    state.role = state.role || 'buff';
  }
  const intent: InterpretIntent = {
    kind: 'dispel_immunity',
    dispelType,
    durationMs: dur,
  };
  // apply + ATTR_EX IMMUNITY_PURGES_EFFECT → RemoveAurasWithDispelType. Cite: Unit.cpp:7701–7702.
  if (state.ctx.immunityPurgesEffect === true) {
    intent.purgeDispelType = true;
  }
  state.intents.push(intent);
}

// ── SPELL_AURA_PERIODIC_LEECH (53) ── baked as a plain dot with no heal transfer.
// Cite: SpellAuras.cpp:3247-3265 HandlePeriodicLeech; PeriodicTick :4592-4682.
export function handlePeriodicLeech(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // The bonus fold is cast-time and the bake keeps base points, so the dot shape matches the bake and
  // combat materializes the transfer from the leech-heal intent.
  const { min, pointsPerComboPoint } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  const tickMs = (raw.amplitude | 0) || 3000;
  const clamped = Math.max(1, min);
  state.effects.push(
    withPpc(
      {
        kind: 'dot' as const,
        school: schoolOf(state.spell),
        min: clamped,
        max: clamped,
        durationMs: dur,
        tickMs,
      },
      pointsPerComboPoint,
    ) as SpellEffect,
  );

  // The tick also heals the beneficiary: the damage times the multiplier, defaulting to 1. The resolver
  // stamps that multiple onto the matching dot. Cite: SpellAuras.cpp:4677-4682 (no heal threat).
  const multRaw = Number(raw.multipleValue) || 0;
  const multipleValue = multRaw > 0 ? multRaw : 1;
  state.intents.push({ kind: 'periodic_leech_heal', multipleValue });
}

// ── SPELL_AURA_PERIODIC_HEALTH_FUNNEL (62) ── the victim is the CASTER and the beneficiary the aura
// target, the opposite of periodic leech. Cite: SpellAuras.cpp:3285-3304.
export function handlePeriodicHealthFunnel(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // m_isPeriodic = apply; amount gets SpellDamageBonusDone on apply. Cite: :3287–3303.
  const { min, pointsPerComboPoint } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  const tickMs = (raw.amplitude | 0) || 3000;
  const clamped = Math.max(1, min);
  const multRaw = Number(raw.multipleValue) || 0;
  const multipleValue = multRaw > 0 ? multRaw : 1;
  state.effects.push(
    withPpc(
      {
        kind: 'dot' as const,
        school: schoolOf(state.spell),
        min: clamped,
        max: clamped,
        durationMs: dur,
        tickMs,
        leechMultiple: multipleValue,
        healthFunnel: true,
      },
      pointsPerComboPoint,
    ) as SpellEffect,
  );
  state.intents.push({ kind: 'periodic_health_funnel', multipleValue });
}

// ── SPELL_AURA_RETAIN_COMBO_POINTS (148) ── apply is a no-op; expiring by time removes the amount from
// the combo target. Premeditation is 2 points over 10 s. Cite: SpellAuras.cpp:4436-4452.
export function handleRetainComboPoints(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++: if (!Real) return; player only. Cite: :4438–4443.
  if (state.ctx.unitTargetIsPlayer === false) {
    state.intents.push({ kind: 'skip_effect', reason: 'RETAIN_COMBO_POINTS non-player target' });
    return;
  }
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  const amount = Math.max(0, Math.trunc(min));
  if (amount <= 0) return;
  state.effects.push({ kind: 'retain_combo_points', amount, durationMs: dur });
  state.intents.push({ kind: 'retain_combo_points', amount, durationMs: dur });
}

// ── SPELL_AURA_MOD_RANGED_ATTACK_POWER_VERSUS (131) ─────────────────────────
// Cite: SpellAuras.cpp:192; Unit.cpp:7471 GetTotalAuraModifierByMiscMask (creature type mask).
export function handleModRangedAttackPowerVersus(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  const creatureTypeMask = raw.miscValue | 0;
  state.intents.push({ kind: 'mod_ranged_attack_power_versus', creatureTypeMask, amount: min, durationMs: dur });
  state.effects.push({
    kind: 'buff', mod: 'ranged_attack_power_versus', amount: min, durationMs: dur, creatureTypeMask,
  } as SpellEffect);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_SHAPESHIFT (36) ── baked as a shapeshift effect carrying the form.
// Cite: SpellAuras.cpp:1709-1976 HandleAuraModShapeshift; HandleShapeshiftBoosts :4223-4344.
export function handleModShapeshift(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++: if (!Real) return. Cite: :1711–1712. Unknown SpellShapeshiftFormEntry → error log + return. SI5
  // DBC gate. Cite: :1716–1720.
  const form = raw.miscValue | 0;
  state.effects.push({ kind: 'shapeshift', form });
  state.role = state.role || 'form';

  const intent: InterpretIntent = { kind: 'mod_shapeshift', form };

  // Form → display / power. Cite: :1727–1800 switch (form).
  switch (form) {
    case FORM_CAT:
      intent.displayIdAlliance = 892;
      intent.displayIdHorde = 8571;
      intent.powerType = POWER_ENERGY;
      intent.boostSpellIds = [3025];
      intent.hotWSpellId = 24900;
      intent.removeRootAndSlow = true;
      intent.removeWaterWalk = true;
      intent.trackHumanoidsSpellId = TRACK_HUMANOIDS_SPELL;
      intent.furorEnergySpellId = FUROR_ENERGY_SPELL;
      break;
    case FORM_TRAVEL:
      intent.displayId = 632;
      intent.boostSpellIds = [5419];
      intent.removeRootAndSlow = true;
      intent.removeWaterWalk = true;
      break;
    case FORM_AQUA:
      intent.displayId = 2428;
      intent.boostSpellIds = [5421];
      intent.removeRootAndSlow = true;
      intent.removeWaterWalk = true;
      break;
    case FORM_BEAR:
      intent.displayIdAlliance = 2281;
      intent.displayIdHorde = 2289;
      intent.powerType = POWER_RAGE;
      intent.boostSpellIds = [1178, 21178];
      intent.hotWSpellId = 24899;
      intent.removeRootAndSlow = true;
      intent.removeWaterWalk = true;
      intent.furorRageSpellId = FUROR_RAGE_SPELL;
      break;
    case FORM_GHOUL:
      // Alliance-only display 10045; Horde leaves 0. Cite: :1749–1752.
      intent.displayIdAlliance = 10045;
      break;
    case FORM_DIREBEAR:
      intent.displayIdAlliance = 2281;
      intent.displayIdHorde = 2289;
      intent.powerType = POWER_RAGE;
      intent.boostSpellIds = [9635, 21178];
      intent.hotWSpellId = 24899;
      intent.removeRootAndSlow = true;
      intent.removeWaterWalk = true;
      intent.furorRageSpellId = FUROR_RAGE_SPELL;
      break;
    case FORM_CREATUREBEAR:
      intent.displayId = 902;
      break;
    case FORM_GHOSTWOLF:
      intent.displayId = 4613;
      intent.removeWaterWalk = true;
      break;
    case FORM_MOONKIN:
      // Spirit Shade Visual 24809 → native display + early return if non-player caster.
      // Cite: :1767–1774.
      if ((state.spell.id | 0) === SPIRIT_SHADE_VISUAL_ID) {
        intent.spiritShadeNativeDisplay = true;
      } else {
        intent.displayIdAlliance = 15374;
        intent.displayIdHorde = 15375;
      }
      intent.boostSpellIds = [24905];
      intent.removeRootAndSlow = true;
      intent.removeWaterWalk = true;
      break;
    case FORM_TREE:
      intent.displayId = 864;
      intent.boostSpellIds = [5420];
      intent.removeRootAndSlow = true;
      intent.removeWaterWalk = true;
      break;
    case FORM_BATTLESTANCE:
      intent.powerType = POWER_RAGE;
      intent.boostSpellIds = [21156];
      break;
    case FORM_DEFENSIVESTANCE:
      intent.powerType = POWER_RAGE;
      intent.boostSpellIds = [7376];
      break;
    case FORM_BERSERKERSTANCE:
      intent.powerType = POWER_RAGE;
      intent.boostSpellIds = [7381];
      break;
    case FORM_SPIRITOFREDEMPTION:
      intent.displayId = 16031;
      // spellId2 second for remove order. Cite: :4271–4272.
      intent.boostSpellIds = [27792, 27795];
      break;
    default:
      // FORM_AMBIENT / SHADOW / STEALTH / CREATURECAT / etc. — no model/power switch.
      // Cite: :1783–1786 / :4274–4283.
      break;
  }

  // Apply removes the other form, sets the display and power, and runs the boosts; remove restores the
  // display. Furor, Track Humanoids and Leader of the Pack are runtime, off the spellbook.
  state.intents.push(intent);
}

// ── SPELL_AURA_MOD_INVISIBILITY (18) ─────────────────────────────────────── Cite:
// SpellAuras.cpp:2626–2675 HandleInvisibility Bake: unmapped. Intent carries type + strength.
export function handleModInvisibility(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // AddInvisibilityValue(misc, ±amount); mask when value>0. Cite: :2630–2633. Visibility / glow / interrupt
  // flags are SI5 runtime. Cite: :2634–2674. Stealth/invis strength. Cite: SpellAuras.cpp:2626–2675.
  state.effects.push({
    kind: 'mod_invisibility',
    invisibilityType: raw.miscValue | 0,
    amount: min,
    durationMs: dur,
  } as never);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_BLOCK_PERCENT (51) ── baked as a block buff.
// Cite: SpellAuras.cpp:3789-3800 HandleAuraModBlockPercent.
export function handleModBlockPercent(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // Engine BuffMod block (same surface as dodge/parry). Cite: fighterFactory applyBuffMod.
  const tagged = withHostile(
    { kind: 'buff' as const, mod: 'block' as const, amount: min, durationMs: dur },
    raw.targetA | 0,
    min,
  );
  state.effects.push(tagged as SpellEffect);
  state.role = state.role || 'buff';
  // Intent retained for non-player flat path / SI5 exclusivity notes.
  const intent: InterpretIntent = {
    kind: 'mod_block_percent',
    amount: min,
    durationMs: dur,
  };
  // Non-player: m_modBlockChance ±amount. Cite: :3793–3796.
  // Player: UpdateBlockPercentage() recompute. Cite: :3799.
  if (state.ctx.unitTargetIsPlayer === false) {
    intent.nonPlayerFlat = true;
  }
  state.intents.push(intent);
}

// ── SPELL_AURA_PERIODIC_MANA_LEECH (64) ── baked as a negative power restore.
// Cite: SpellAuras.cpp:3268-3282 HandlePeriodicManaLeech; PeriodicTick :4740-4807.
export function handlePeriodicManaLeech(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // Handler arms m_isPeriodic; Tranquilizing Poison expire special on remove.
  // Cite: :3270 / :3272–3281.
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // Bake: amountPerTick = −max(1, |min|). Cite: map-spell-effects.mjs:825–827.
  // The drained pool is EffectMiscValue, and a tick on any other pool is skipped. Cite: :4746-4753.
  state.effects.push({
    kind: 'restore_power',
    amountPerTick: -Math.max(1, Math.abs(min)),
    powerType: raw.miscValue | 0,
    tickMs: (raw.amplitude | 0) || 1000,
    durationMs: dur,
  });

  // Tick: drain target power, gain = drain * EffectMultipleValue.
  // Cite: :4747–4806. Gain only when caster max power > 0.
  const multRaw = Number(raw.multipleValue) || 0;
  const intent: InterpretIntent = {
    kind: 'periodic_mana_leech',
    powerType: raw.miscValue | 0,
    multipleValue: multRaw,
  };
  // Expire special. Cite: :3274–3280.
  if (TRANQUILIZING_POISON_IDS.has(state.spell.id | 0)) {
    intent.expireCastSpellId = TRANQUILIZING_POISON_SLEEP;
  }
  state.intents.push(intent);
}

// ── SPELL_AURA_MOD_STEALTH (16) ── baked as a stealth strength plus its break flags.
// Cite: SpellAuras.cpp:2563-2614 HandleModStealth.
export function handleModStealth(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // Add the stealth strength for the type; a Real apply also fires the stealth interrupt flags and the
  // visibility change, and a remove restores it. Cite: SpellAuras.cpp:2566-2612.
  const effect: SpellEffect = {
    kind: 'stealth',
    strength: Math.max(0, min),
    durationMs: dur,
  };
  // The break flags come from the spell's own interrupt flags: the bake-time override is unset at
  // runtime, so every live stealth aura fell back to the default and lost four of its bits.
  const spellAif = ((state.spell as { auraInterruptFlags?: number }).auraInterruptFlags ?? 0) | 0;
  const aif = ((state.ctx.auraInterruptFlags ?? 0) | 0) || spellAif;
  if (aif) effect.breakFlags = aif;
  state.effects.push(effect);
  state.role = state.role || 'stealth';
}

// ── SPELL_AURA_MOD_CRIT_PERCENT (52) ── baked as a crit buff.
// Cite: SpellAuras.cpp:3815-3848 HandleAuraModCritPercent.
export function handleModCritPercent(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // Whole percentage points → BuffMod crit (equip Increased Critical / temporary crit auras).
  // Cite: schema BuffMod crit; characterRatings critChance; fighterFactory applyBuffMod.
  const tagged = withHostile(
    { kind: 'buff' as const, mod: 'crit' as const, amount: min, durationMs: dur },
    raw.targetA | 0,
    min,
  );
  state.effects.push(tagged as SpellEffect);
  state.role = state.role || 'buff';
  const intent: InterpretIntent = {
    kind: 'mod_crit_percent',
    amount: min,
    durationMs: dur,
  };
  // Non-player: all m_modCritChance ±amount. Cite: :3819–3823.
  if (state.ctx.unitTargetIsPlayer === false) {
    intent.nonPlayerFlat = true;
  }
  // A player Real apply is weapon-dependent: an equipped-item class of -1 lands flat on main, off and
  // ranged crit, and anything else goes through the weapon-dependent mods. Cite: :3827-3847.
  const eqClass = state.ctx.equippedItemClass;
  if (eqClass !== undefined) {
    intent.equippedItemClass = eqClass | 0;
  }
  state.intents.push(intent);
}

// ── SPELL_AURA_MOD_DODGE_PERCENT (49) ────────────────────────────────────── Cite:
// SpellAuras.cpp:3775–3787 HandleAuraModDodgePercent Bake: buff dodge. Cite: map-spell-effects.mjs:787–790.
export function handleModDodgePercent(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // Player: UpdateDodgePercentage(); NPC: m_modDodgeChance ±amount. Cite: :3778–3785. Bake surface is flat
  // dodge BuffMod points. Cite: map-spell-effects.mjs:787–790.
  const tagged = withHostile(
    { kind: 'buff' as const, mod: 'dodge' as const, amount: min, durationMs: dur },
    raw.targetA | 0,
    min,
  );
  state.effects.push(tagged as SpellEffect);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_RESISTANCE_PCT (101) ── a physical mask becomes armor_pct, not flat armor.
// Cite: SpellAuras.cpp:3388-3408 HandleModResistancePercent.
export function handleModResistancePct(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  // C++: if (!m_modifier.m_amount) return. Cite: :3390–3391.
  if (!min) return;
  const dur = durationMsResolved(state);
  // Per-school TOTAL_PCT for bits in misc mask. Cite: :3395–3407.
  state.intents.push({
    kind: 'mod_resistance_pct',
    schoolMask: raw.miscValue | 0,
    amount: min,
    durationMs: dur,
  });
}

// ── SPELL_AURA_MOD_SHIELD_BLOCKVALUE_PCT (150) ── the percent path of the block-value handler,
// player-only. Cite: SpellAuras.cpp:4426-4433 HandleShieldBlockValue.
export function handleModShieldBlockValuePct(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++: non-player → no-op (only Player branch). Cite: :4432–4433.
  if (state.ctx.unitTargetIsPlayer === false) return;

  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // HandleBaseModValue(SHIELD_BLOCK_VALUE, PCT_MOD, amount, apply). Cite: :4428–4433.
  // Aura 150 → PCT_MOD. Cite: :4429–4430.
  const tagged = withHostile(
    { kind: 'buff' as const, mod: 'block_value_pct' as const, amount: min, durationMs: dur },
    raw.targetA | 0,
    min,
  );
  state.effects.push(tagged as SpellEffect);
  state.role = state.role || 'buff';
  state.intents.push({
    kind: 'mod_shield_blockvalue_pct',
    amount: min,
    durationMs: dur,
  });
}

// ── SPELL_AURA_MOD_ATTACKSPEED (9) ── baked as a haste buff, and the C++ applies it to the MAIN hand
// only, unlike melee haste 138. Cite: SpellAuras.cpp:3922-3927.
export function handleModAttackSpeed(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // ApplyAttackTimePercentMod(BASE_ATTACK, amount, apply). Cite: :3924–3926.
  const tagged = withHostile(
    { kind: 'buff' as const, mod: 'haste' as const, amount: min, durationMs: dur },
    raw.targetA | 0,
    min,
  );
  state.effects.push(tagged as SpellEffect);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_INVISIBILITY_DETECTION (19) ── the play surface is an aura chip; the world
// invisibility simulation is residual. Cite: SpellAuras.cpp:2677-2717 HandleInvisibilityDetect.
export function handleModInvisibilityDetection(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // Set the detect mask and raise the value when higher; a remove takes the maximum among the
  // remaining auras of the same type. Cite: SpellAuras.cpp:2687-2712.
  state.intents.push({
    kind: 'mod_invisibility_detection',
    invisibilityType: raw.miscValue | 0,
    amount: min,
    durationMs: dur,
  });
  // Catalog / OOC: not a pure mana sink. Cite: schema mod_invisibility_detection.
  if (!state.effects.some((e) => e.kind === 'mod_invisibility_detection')) {
    state.effects.push({
      kind: 'mod_invisibility_detection',
      amount: min,
      durationMs: dur < 0 ? 0 : dur,
    });
  }
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_PACIFY (25) ── baked as pacify: no melee or ranged, casts still allowed.
// Cite: SpellAuras.cpp:4382-4388 HandleAuraModPacify.
export function handleModPacify(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // SetFlag / RemoveFlag UNIT_FLAG_PACIFIED. Cite: :4384–4387.
  const dur = durationMsResolved(state);
  state.effects.push({
    kind: 'pacify',
    durationMs: dur || 1000,
  });
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_TRACK_CREATURES (44) ── minimap tracking, so the bake is empty and the intent carries
// the creature-type bit. Cite: SpellAuras.cpp:2152-2161 HandleAuraTrackCreatures.
export function handleTrackCreatures(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++: non-player → return. Cite: :2154–2155.
  if (state.ctx.unitTargetIsPlayer === false) return;

  const creatureType = raw.miscValue | 0;
  // Bit = 1 << (misc − 1). Cite: :2158–2160.
  // misc ≤ 0 would shift into large values — still emit (C++ does the same).
  const trackFlag = creatureType > 0 ? (1 << (creatureType - 1)) : 0;
  const dur = durationMsResolved(state);
  // Minimap tracking aura. Cite: SpellAuras.cpp:2152–2161.
  state.effects.push({
    kind: 'track_creatures',
    creatureType,
    trackFlag,
    durationMs: dur,
  } as never);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_REFLECT_SPELLS_SCHOOL (74) ── one reflect effect per school bit.
// Cite: SpellAuras.cpp:135; Unit::GetReflectChance :3425-3431; enrich-dispel-reflect.mjs:74-91.
export function handleReflectSpellsSchool(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  // pct ≤ 0 → skip (Fire/Frost Ward carry aura 74 at 0%). Cite: enrich-dispel-reflect.mjs:81.
  if (min <= 0) return;
  const dur = durationMsResolved(state);
  const mask = raw.miscValue | 0;
  // GetTotalAuraModifierByMiscMask(SPELL_AURA_REFLECT_SPELLS_SCHOOL, schoolMask).
  // Cite: Unit.cpp:3430. Multi-bit → one reflect effect per school (enricher).
  const schools: School[] = [];
  for (let i = 0; i < 7; i++) {
    if ((mask & (1 << i)) !== 0) schools.push(SCHOOLS[i]!);
  }
  if (schools.length === 0) {
    // mask 0 → all-school reflect. Cite: enrich-dispel-reflect.mjs:87.
    state.effects.push({ kind: 'reflect', pct: min, durationMs: dur });
  } else {
    for (const school of schools) {
      state.effects.push({ kind: 'reflect', pct: min, school, durationMs: dur });
    }
  }
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_CHANNEL_DEATH_ITEM (86) ── apply is a no-op; the work runs on a Real remove by death
// for a player caster. Cite: SpellAuras.cpp:2070-2123 HandleChannelDeathItem.
export function handleChannelDeathItem(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  // C++: amount ≤ 0 → return. Cite: :2077–2078.
  if (min <= 0) {
    state.effects.push({ kind: 'client_inform' });
    return;
  }
  const itemType = (raw.itemType ?? 0) | 0;
  // EffectItemType == 0 → return. Cite: :2081–2082.
  // Bake rawEffects often omit itemType (column not extracted) → 0 → no intent.
  if (!itemType) return;
  // Drain Soul family: grant the item on a channel kill, with the Soul Shard specials only for 6265.
  // Cite: SpellAuras.cpp:2070-2123.
  state.effects.push({
    kind: 'channel_death_item',
    itemType,
    count: min,
    soulShard: itemType === 6265,
  } as never);
  state.role = state.role || 'dot';
}

// ── SPELL_AURA_MOD_HEALTH_REGEN_PERCENT (88) ── out-of-combat regen only.
// Cite: SpellAuras.cpp:149 HandleNoImmediateEffect; Player.cpp:2395-2398 RegenerateHealth.
export function handleModHealthRegenPercent(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // addvalue *= (100 + amount) / 100 while !IsInCombat(). Cite: Player.cpp:2395–2398.
  // Permanent racials (Troll Regeneration) have DurationIndex → 0; do not invent 15s.
  state.effects.push({
    kind: 'mod_health_regen_percent',
    amount: min,
    durationMs: dur,
  } as never);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_TARGET_RESISTANCE (123) ─────────────────────────────────
// Cite: SpellAuras.cpp:184; Unit.cpp:3890–3894 (pen = −aura amount; DBC amount typically negative).
export function handleModTargetResistance(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  const schoolMask = raw.miscValue | 0;
  state.intents.push({ kind: 'mod_target_resistance', schoolMask, amount: min, durationMs: dur });
  state.effects.push({
    kind: 'buff', mod: 'target_resistance', amount: min, durationMs: dur, schoolMask,
  } as SpellEffect);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_TOTAL_STAT_PERCENTAGE (137) ── all_stats_pct when the misc value is -1, else the
// per-stat percent mod. Cite: SpellAuras.cpp:3537-3568 HandleModTotalPercentStat.
export function handleModTotalStatPercentage(
  state: HandlerState,
  raw: RawSpellEffect,
  slot: number,
  effectType: number,
): void {
  const misc = raw.miscValue | 0;
  // C++: misc < −1 || > 4 → error return. Cite: :3539–3543.
  if (misc < -1 || misc > 4) {
    state.unhandled.push({
      slot,
      effect: effectType,
      auraName: SPELL_AURA_MOD_TOTAL_STAT_PERCENTAGE,
      reason: `MOD_TOTAL_STAT_PERCENTAGE miscValue ${misc} out of range [-1,4]`,
    });
    return;
  }
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // A misc value of -1 means all five stats. Always the percent name, never the flat one — see
  // STAT_MOD_PCT. Cite: SpellAuras.cpp:3551-3558.
  const mod: BuffMod = STAT_MOD_PCT[String(misc)] ?? 'all_stats_pct';
  const tagged = withHostile(
    { kind: 'buff' as const, mod, amount: min, durationMs: dur },
    raw.targetA | 0,
    min,
  );
  state.effects.push(tagged as SpellEffect);
  state.role = state.role || 'buff';

  // Stamina + SPELL_ATTR_IS_ABILITY: rescale current HP by max-HP ratio. Cite: :3561–3567. Gate:
  // ctx.spellIsAbility === true (bake-thin omits). STAT_STAMINA = 2. Cite: SharedDefines Stats.
  if (misc === 2 && state.ctx.spellIsAbility === true) {
    state.intents.push({ kind: 'mod_total_stat_pct_stamina_hp_scale' });
  }
}

// ── SPELL_AURA_MOD_SHIELD_BLOCKVALUE (158) ── the flat path of the block-value handler, player-only,
// baked as a block-value buff. Cite: SpellAuras.cpp:4426-4433 HandleShieldBlockValue.
export function handleModShieldBlockValue(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++: non-player → no-op (only Player branch). Cite: :4432–4433.
  if (state.ctx.unitTargetIsPlayer === false) return;

  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // HandleBaseModValue(SHIELD_BLOCK_VALUE, FLAT_MOD, amount, apply). Cite: :4428–4433.
  // Aura 158 → FLAT_MOD (150 → PCT_MOD). Cite: :4429–4430.
  const tagged = withHostile(
    { kind: 'buff' as const, mod: 'block_value' as const, amount: min, durationMs: dur },
    raw.targetA | 0,
    min,
  );
  state.effects.push(tagged as SpellEffect);
  state.role = state.role || 'buff';
  state.intents.push({
    kind: 'mod_shield_blockvalue',
    amount: min,
    durationMs: dur,
  });
}

// ── SI3 aura batch 7 (this claim list) ─────────────────────────────────────

// ── SPELL_AURA_REFLECT_SPELLS (28) ── all schools, no mask, unlike 74.
// Cite: SpellAuras.cpp:89; Unit::GetReflectChance :3425-3431; enrich-dispel-reflect.mjs:82-83.
export function handleReflectSpells(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  // pct ≤ 0 → skip. Cite: enrich-dispel-reflect.mjs:81.
  if (min <= 0) return;
  const dur = durationMsResolved(state);
  // No school field = all-school reflect. Cite: Unit.cpp:3428; enrich:83.
  state.effects.push({ kind: 'reflect', pct: min, durationMs: dur });
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_INCREASE_HEALTH (34) ── a FLAT max-health mod. Proxying it as stamina times ten
// turned Anastari's +2000 into +20k. Cite: SpellAuras.cpp:3658-3716.
export function handleModIncreaseHealth(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // A flat max-health amount, not stamina, which would multiply by the health-per-stamina factor.
  // Hostile is stamped for oracle parity with the enriched buffs.
  const tagged = withHostile(
    {
      kind: 'buff' as const,
      mod: 'max_health' as const,
      amount: Math.max(1, min),
      durationMs: dur,
    },
    raw.targetA | 0,
    min,
  );
  state.effects.push(tagged as SpellEffect);
  state.role = state.role || 'buff';

  const id = state.spell.id | 0;
  // Id specials beyond generic TOTAL_VALUE. Cite: :3662–3708.
  if (MOD_INCREASE_HEALTH_CUR_HP_IDS.has(id)) {
    // Real-only current HP adjust. Cite: :3675–3695.
    state.intents.push({
      kind: 'mod_increase_health_special',
      currentHealthAdjust: true,
    });
  } else if (MOD_INCREASE_HEALTH_PRESERVE_PCT_IDS.has(id)) {
    // Real-only preserve %. Cite: :3700–3707.
    state.intents.push({
      kind: 'mod_increase_health_special',
      preserveHealthPercent: true,
    });
  }
}

// ── SPELL_AURA_MOD_DISARM (67) ───────────────────────────────────────────── Cite:
// SpellAuras.cpp:2426–2451 HandleAuraModDisarm Bake: cc disarm. Cite: map-spell-effects.mjs:837–842.
export function handleModDisarm(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++: if (!Real) return. Cite: :2428–2429.
  // Remove: keep flag while any MOD_DISARM remains. Cite: :2433–2434 — SI5 runtime.
  const dur = durationMsResolved(state);
  // ApplyModFlag(UNIT_FLAG_DISARMED). Cite: :2436.
  state.effects.push({
    kind: 'cc',
    control: 'disarm',
    mechanic: 'disarm',
    durationMs: dur || 10_000,
    school: schoolOf(state.spell),
  });
  state.role = state.role || 'control';

  // Feral / no-weapon shapeshift: skip attack-time path. Cite: :2438–2440.
  if (state.ctx.unitTargetNoWeaponShapeShift === true) return;
  // Player: SetAttackTime(BASE_ATTACK, BASE_ATTACK_TIME) on apply. Cite: :2442–2447.
  // Bake-thin omit unitTargetIsPlayer → player path (emit intent).
  if (state.ctx.unitTargetIsPlayer === false) {
    // Non-player still UpdateDamagePhysical(BASE_ATTACK). Cite: :2450 — SI5 runtime.
    return;
  }
  state.intents.push({
    kind: 'mod_disarm_attack_time',
    baseAttackTimeMs: BASE_ATTACK_TIME_MS,
  });
}

// ── SPELL_AURA_MOD_THREAT (10) ── baked as a threat modifier buff by school mask.
// Cite: SpellAuras.cpp:2806-2838 HandleModThreat.
export function handleModThreat(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++: if (!Real) return; !IsAlive() return. Cite: :2808–2815.
  // Alive gate is SI5 runtime.
  let { min } = effectAmountRange(raw, state.ctx);
  const id = state.spell.id | 0;
  const levelMult = MOD_THREAT_LEVEL_SCALE[id];
  if (levelMult != null) {
    // level_diff = targetLevel − 60; amount += mult * level_diff when > 0.
    // Cite: :2821–2834. Gate: unitTargetLevel ?? casterLevel.
    const level = state.ctx.unitTargetLevel ?? state.ctx.casterLevel;
    if (level != null) {
      const levelDiff = level - 60;
      if (levelDiff > 0) min += levelMult * levelDiff;
    }
  }
  const dur = durationMsResolved(state);
  // A single-bit mask (Righteous Fury is holy) stamps the school so only that school is multiplied;
  // a multi-bit or all-schools mask (Salvation) stays global. Cite: SpellAuras.cpp:2836-2838.
  const school = schoolFromSingleBitMask(raw.miscValue | 0);
  const tagged = withHostile(
    {
      kind: 'buff' as const,
      mod: 'threat_mod' as const,
      amount: min,
      durationMs: dur,
      ...(school ? { school } : {}),
    },
    raw.targetA | 0,
    min,
  );
  state.effects.push(tagged as SpellEffect);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_TAUNT (11) ── the taunted state while the aura holds, distinct from the taunt
// EFFECT's threat equalize. Taunt and Growl carry both slots. Cite: SpellAuras.cpp:2860-2875.
export function handleModTaunt(
  state: HandlerState,
  _raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++: if (!Real) return. Cite: :2862–2864.
  // !IsAlive() || !CanHaveThreatList() → return. Cite: :2868–2869.
  if (state.ctx.canHaveThreatList === false) return;
  // Always emit: do NOT collapse this into the taunt effect's equalize row. The bake mapper emits
  // the same dual surface for a re-bake.
  const dur = durationMsResolved(state);
  state.effects.push({
    kind: 'mod_taunt',
    durationMs: dur < 0 ? 0 : dur,
  });
  state.role = state.role || 'control';
}

// ── SPELL_AURA_MOD_STEALTH_DETECT (17) ── baked as a stealth-detect value.
// Cite: SpellAuras.cpp:2616-2618 HandleModStealthDetect.
export function handleModStealthDetect(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // AddStealthDetectionStrength(StealthType(misc), ±amount). Cite: :2618.
  state.effects.push({
    kind: 'stealth_detect',
    amount: Math.max(0, min),
    durationMs: dur < 0 ? 0 : dur,
  });
}

// ── SPELL_AURA_MOD_HEALING (115) ── baked as a healing-taken buff, summed by school mask.
// Cite: SpellAuras.cpp:176; Unit.cpp:7301-7309 SpellBaseHealingBonusTaken.
export function handleModHealing(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // AdvertisedBenefit += amount when misc & schoolMask. Cite: Unit.cpp:7305–7307.
  // Bake folds school into flat healing_taken. Cite: map-spell-effects.mjs:939–944.
  const tagged = withHostile(
    { kind: 'buff' as const, mod: 'healing_taken' as const, amount: min, durationMs: dur },
    raw.targetA | 0,
    min,
  );
  state.effects.push(tagged as SpellEffect);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_MECHANIC_RESISTANCE (117) ── a full-resist chance by mechanic, as Orc Hardiness
// gives 25% against stun. Cite: SpellAuras.cpp:178; Unit.cpp:4015-4031 MagicSpellHitResult.
export function handleModMechanicResistance(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  const mechanic = raw.miscValue | 0;
  // GetTotalAuraModifierByMiscValue(MOD_MECHANIC_RESISTANCE, mechanic).
  // Cite: Unit.cpp:4016 (spell mechanic) / :4026 (effect mechanic max).
  state.effects.push({
    kind: 'mod_mechanic_resistance',
    mechanic,
    amount: min,
    durationMs: dur,
  } as never);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_POSSESS (2) ── baked as an incapacitate with the charm mechanic.
// Cite: SpellAuras.cpp:2188-2256 HandleModPossess.
export function handleModPossess(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++: if (!Real) return. Cite: :2190–2191.
  // Not possess yourself. Cite: :2195–2197.
  if (state.ctx.unitTargetIsSelf === true) return;
  // Non-player caster → return. Cite: :2199–2201.
  // Bake-thin: omit casterIsPlayer → player path (emit).
  if (state.ctx.casterIsPlayer === false) return;

  const dur = durationMsResolved(state);
  // TakePossessOf is the same thrall as TakeCharmOf, so the row is control:'charm' like every other
  // member of the family. Cite: SpellAuras.cpp:2219 TakePossessOf; map-spell-effects.mjs aura 2.
  state.effects.push({
    kind: 'cc',
    control: 'charm',
    mechanic: 'charm',
    durationMs: dur || 10_000,
    school: schoolOf(state.spell),
  });
  state.role = state.role || 'control';

  // TakePossessOf + BreakCharmOutgoing for player casters.
  // Cite: :2219–2222. Client field update :2224–2233 is network-only.
  const intent: InterpretIntent = {
    kind: 'mod_possess',
    spellId: state.spell.id | 0,
    durationMs: dur || 10_000,
    breakOutgoing: true,
  };

  // Spell 24937 Using Control Console apply/remove specials. Cite: :2207–2216 / :2238–2254.
  if ((state.spell.id | 0) === CONTROL_CONSOLE_SPELL_ID) {
    intent.controlConsoleApplySpells = CONTROL_CONSOLE_APPLY_SPELLS;
    intent.controlConsoleRemoveCasterSpells = CONTROL_CONSOLE_REMOVE_CASTER_SPELLS;
    intent.controlConsoleRemoveTargetSpell = CONTROL_CONSOLE_REMOVE_TARGET_SPELL;
    intent.controlConsoleDespawnMs = CONTROL_CONSOLE_DESPAWN_MS;
  }
  state.intents.push(intent);
}

// ── SPELL_AURA_MOD_INCREASE_HEALTH_PERCENT (133) ── baked as a max-health percent buff.
// Cite: SpellAuras.cpp:3740-3756 HandleAuraModIncreaseHealthPercent.
export function handleModIncreaseHealthPercent(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // HandleStatModifier(UNIT_MOD_HEALTH, TOTAL_PCT, amount). Cite: :3745.
  const tagged = withHostile(
    {
      kind: 'buff' as const,
      mod: 'max_health_pct' as const,
      amount: min,
      durationMs: dur,
    },
    raw.targetA | 0,
    min,
  );
  state.effects.push(tagged as SpellEffect);
  state.role = state.role || 'buff';

  // Mutate Bug 802: on apply ModifyHealth(+maxDelta). Cite: :3748–3753.
  if ((state.spell.id | 0) === MUTATE_BUG_SPELL_ID) {
    state.intents.push({
      kind: 'mod_increase_health_percent_special',
      mutateBugHealthGain: true,
    });
  }
}

// ── SPELL_AURA_MOD_MANA_REGEN_INTERRUPT (134) ── the percent of spirit regen kept while casting.
// Cite: SpellAuras.cpp:3803-3812; StatSystem.cpp:558-562 UpdateManaRegen.
export function handleModManaRegenInterrupt(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++: if (!Real) return. Cite: :3805–3806.
  // Non-player → return. Cite: :3808–3809.
  if (state.ctx.unitTargetIsPlayer === false) return;

  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // Player::UpdateManaRegen folds GetTotalAuraModifier(134). Cite: StatSystem.cpp:558–562.
  state.effects.push({
    kind: 'buff',
    mod: 'mana_regen_interrupt',
    amount: min,
    durationMs: dur > 0 ? dur : 15_000,
  } as never);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_STALKED (68) ──────────────────────────────────────────── Cite:
// SpellAuras.cpp:3079–3086 HandleAuraModStalked Bake: unmapped. Cite: map-spell-effects.mjs:882–883.
export function handleModStalked(
  state: HandlerState,
  _raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // SetFlag / RemoveFlag UNIT_DYNFLAG_TRACK_UNIT. Cite: :3082–3085.
  // Used by Hunter's Mark, Mind Vision, Syndicate Tracker. Cite: :3081.
  const dur = durationMsResolved(state);
  state.effects.push({
    kind: 'mod_stalked',
    durationMs: dur,
  } as never);
  // Hostile mark/track — ACTIVE control so combat kit keeps Hunter's Mark class. Cite: roles.ts.
  state.role = state.role || 'control';
}

// ── SPELL_AURA_MOD_TOTAL_THREAT (103) ── baked as a temporary flat threat reduction.
// Cite: SpellAuras.cpp:2841-2858 HandleAuraModTotalThreat.
export function handleModTotalThreat(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++: if (!Real) return. Cite: :2843–2844.
  // Target must be alive player. Cite: :2848–2849 — SI5 alive gate.
  if (state.ctx.unitTargetIsPlayer === false) return;
  // Caster must be alive. Cite: :2852–2854 — SI5 runtime.

  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // threatTemporaryFade(caster, amount, apply). Cite: :2857.
  // Flat signed amount (Fade r1 basePoints −56 → −55), not generation %.
  state.effects.push({
    kind: 'threat_temporary',
    amount: min,
    durationMs: dur,
  });
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_FEATHER_FALL (105) ────────────────────────────────────────── Cite:
// SpellAuras.cpp:1670–1677 HandleAuraFeatherFall Bake: feather_fall. Cite: map-spell-effects.mjs:930–935.
export function handleAuraFeatherFall(
  state: HandlerState,
  _raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++: if (!Real) return. Cite: :1672–1673.
  // SetFeatherFall(apply). Cite: :1675; Unit.cpp:12386–12410 (movement flag / packet).
  const dur = durationMsResolved(state);
  state.effects.push({ kind: 'feather_fall', durationMs: dur });
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_RANGED_DAMAGE_TAKEN (113) ── the ranged twin of the physical-taken aura.
// Cite: SpellAuras.cpp:174; Unit.cpp:7615-7617 MeleeDamageBonusTaken.
export function handleModRangedDamageTaken(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // This used to push ONLY an intent, which the resolver drops, so all three Windwall ranks baked an
  // empty effect list and the totem did nothing. Push the effect; the intent stays for its consumers.
  const tagged = withHostile(
    { kind: 'buff' as const, mod: 'ranged_taken' as const, amount: min, durationMs: dur },
    raw.targetA | 0,
    min,
  );
  state.effects.push(tagged as SpellEffect);
  state.role = state.role || 'buff';
  state.intents.push({
    kind: 'mod_ranged_damage_taken',
    amount: min,
    durationMs: dur,
  });
}

// ── SPELL_AURA_MOD_RANGED_HASTE (140) ── baked as a haste buff, like 138 and 141.
// Cite: SpellAuras.cpp:3938-3943 HandleAuraModRangedHaste.
export function handleModRangedHaste(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // ApplyAttackTimePercentMod(RANGED_ATTACK, amount, apply). Cite: :3940–3942.
  const tagged = withHostile(
    { kind: 'buff' as const, mod: 'haste' as const, amount: min, durationMs: dur },
    raw.targetA | 0,
    min,
  );
  state.effects.push(tagged as SpellEffect);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_OBS_MOD_HEALTH (20) ── a periodic heal of a PERCENT of max health.
// Cite: SpellAuras.cpp:3590-3593; PeriodicTick :4687-4738.
export function handleObsModHealth(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // Apply: m_isPeriodic = apply. Cite: :3590–3592.
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  const tickMs = (raw.amplitude | 0) || 1000;
  // The amount IS the percentage, so it is emitted as a percent of max for the consumer to scale
  // against its own maximum. Emitting only the flat value made Harvest Fish heal 2 HP a second.
  let amountPerTick = Math.max(1, min);
  if (state.ctx.targetMaxHealth != null && min > 0) {
    amountPerTick = Math.max(1, trunc((state.ctx.targetMaxHealth * min) / 100));
  }
  state.effects.push({
    kind: 'restore_health',
    amountPerTick,
    tickMs,
    durationMs: dur,
    ...(min > 0 ? { pctOfMax: min } : {}),
  });
}

// ── SPELL_AURA_OBS_MOD_MANA (21) ── a periodic restore of a PERCENT of max mana.
// Cite: SpellAuras.cpp:3595-3609; PeriodicTick :4854-4890.
export function handleObsModMana(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // Apply: periodictime default 1000; m_isPeriodic. Cite: :3597–3601.
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  const tickMs = (raw.amplitude | 0) || 1000;
  // The amount IS the percentage, emitted as a percent of max so the consumer resolves it against its
  // own maximum. The flat per-tick value remains only as the legacy fallback.
  state.effects.push({
    kind: 'restore_power',
    amountPerTick: Math.max(1, min),
    // The C++ tick names POWER_MANA outright, never the miscValue. Cite: SpellAuras.cpp:4865,:4880.
    powerType: POWER_MANA,
    tickMs,
    durationMs: dur,
    ...(min > 0 ? { pctOfMax: min } : {}),
  });

  // Spell 30024 Shade of Aran drink remove-by-default AI event. Cite: :3603–3609.
  if ((state.spell.id | 0) === SHADE_OF_ARAN_DRINK_SPELL_ID) {
    state.intents.push({
      kind: 'obs_mod_mana_remove_special',
      spellId: SHADE_OF_ARAN_DRINK_SPELL_ID,
    });
  }
}

// ── SPELL_AURA_MOD_PARRY_PERCENT (47) ───────────────────────────────────── Cite: SpellAuras.cpp:3762–3773
// HandleAuraModParryPercent Bake: buff parry. Cite: map-spell-effects.mjs:779–786.
export function handleModParryPercent(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // Player: UpdateParryPercentage(); NPC: m_modParryChance ±amount. Cite: :3765–3772. Bake surface is flat
  // parry BuffMod points. Cite: map-spell-effects.mjs:782–785.
  const tagged = withHostile(
    { kind: 'buff' as const, mod: 'parry' as const, amount: min, durationMs: dur },
    raw.targetA | 0,
    min,
  );
  state.effects.push(tagged as SpellEffect);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_SPELL_CRIT_CHANCE (57) ── baked as spell_crit, NOT the melee crit of aura 52:
// routing it there gave Slip'kik's Savvy a melee buff. Cite: SpellAuras.cpp:3873-3889.
export function handleModSpellCritChance(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++: if (!Real) return. Cite: :3875–3876. Interpret is apply-time (Real=true).
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // Spell crit % — combat buff. Cite: SpellAuras.cpp:3875–3888.
  state.effects.push({
    kind: 'buff',
    mod: 'spell_crit',
    amount: min,
    durationMs: dur,
  });
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_ATTACKER_SPELL_CRIT_CHANCE (179) ── added to crit taken for a magic-class hit, by
// school mask (Winter's Chill is frost). Cite: SpellAuras.cpp:240; Unit.cpp:3516-3536.
export function handleModAttackerSpellCritChance(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  const schoolMask = raw.miscValue | 0;
  const tagged = withHostile(
    {
      kind: 'buff' as const,
      mod: 'attacker_spell_crit' as const,
      amount: min,
      durationMs: dur,
      schoolMask,
    },
    raw.targetA | 0,
    min,
  );
  state.effects.push(tagged as SpellEffect);
  // Hostile crit-taken debuff (Winter's Chill / Imp. Scorpid) — ACTIVE control kit role.
  state.role = state.role || 'control';
  state.intents.push({
    kind: 'mod_attacker_spell_crit_chance',
    amount: min,
    schoolMask,
    durationMs: dur,
  });
}
