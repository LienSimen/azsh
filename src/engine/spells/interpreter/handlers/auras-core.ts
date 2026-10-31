/** SI2.5 / SI3 handlers — auras-core (split from handlers.ts, pure move). */

import type { BuffMod, RawSpellEffect, School, SpellEffect } from '../../../../data/schema.ts';
import {
  buildModStunCcEffect,
  resolveModStunMechanicId,
} from '../../../../domain/spells/breakableStunCc.ts';
import { effectAmountRange, clampPositiveRange } from '../amount.ts';
import type {
  InterpretIntent,
} from '../types.ts';
import { STAT_MOD, TARGET_PET, withHostile, HOSTILE_IMPLICIT } from '../targeting.ts';
import {
  SPELL_AURA_MOD_DECREASE_SPEED,
  SPELL_AURA_MOD_INCREASE_MOUNTED_SPEED,
  SPELL_AURA_MOD_INCREASE_SPEED,
  SPELL_AURA_MOD_STAT,
  SPELL_AURA_MOD_SPELL_DAMAGE_OF_STAT_PERCENT,
} from '../opcodes.ts';
import type {
  HandlerState,
} from './shared.ts';
import {
  POWER_RAGE,
  SPELLFAMILY_GENERIC,
  SPELLFAMILY_MAGE,
  SPELLFAMILY_WARRIOR,
  SPELLFAMILY_PRIEST,
  SPELLFAMILY_DRUID,
  SPELLFAMILY_ROGUE,
  SPELLFAMILY_HUNTER,
  SPELLFAMILY_PALADIN,
  CLASSMASK_WAND_USERS,
  TRANSFORM_MISSING_CREATURE_DISPLAY,
  IN_MILLISECONDS,
  RIP_FLAGS,
  RUPTURE_FLAGS,
  SCORPID_STING_FLAGS,
  SPELL_SCHOOL_MASK_NORMAL,
  MECHANIC_BANISH,
  MOD_DMG_PCT_EXPIRE_CAST,
  SCHOOLS,
  WYVERN_STING_SLEEP,
  WYVERN_STING_FAMILY_FLAGS,
  SEAL_OF_THE_CRUSADER_IDS,
  QUEST_TAME_FINAL,
  BURNING_ADRENALINE_REMOVE_CASTS,
  schoolOf,
  familyOf,
  flagsOf,
  iconIdOf,
  durationMsResolved,
  withPpc,
  trunc,
  schoolFromSingleBitMask,
  pushModSkillIntent,
  pushAddModifierIntent,
  pushOrMergePolymorphIncapacitate,
} from './shared.ts';
import { emitPeriodicTriggerSpellZero } from './periodic-trigger-zero.ts';
import {
  HEALING_WAY_BUFF_SPELL_ID,
  HEALING_WAY_MAX_STACKS,
} from '../class-scripts-kit.ts';
// ── SPELL_AURA_NONE (0) ── a no-op: no modifier and no combat effect. The only classic castable is
// the Orc racial Command stub; the real pet-damage Command uses auras 107 and 108.
export function handleAuraNone(
  state: HandlerState,
  _raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++ HandleNULL — intentionally empty body; still a held aura (Command 21563 stub).
  // Cite: SpellAuras.cpp:61 HandleNULL; AURA_SLOT_DISPOSITIONS[0].
  state.effects.push({
    kind: 'script_handled_noop',
    spellId: state.spell.id | 0,
  } as never);
}

// ── SPELL_AURA_PERIODIC_DAMAGE (3) ──────────────────────────────────────────
// Cite: SpellAuras.cpp:3156–3228 HandlePeriodicDamage
export function handlePeriodicDamage(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min, pointsPerComboPoint } = effectAmountRange(raw, state.ctx);
  let amount = min;
  const fam = familyOf(state.spell);
  const flags = flagsOf(state.spell);
  const ctx = state.ctx;

  // Rip / Rupture AP terms when AP+CP supplied. Cite: SpellAuras.cpp:3182–3210.
  if (ctx.attackPower != null && ctx.comboPoints != null && ctx.comboPoints > 0) {
    if (fam === SPELLFAMILY_DRUID && (flags & RIP_FLAGS) !== 0) {
      // AP * min(cp, 4) / 100
      let cp = ctx.comboPoints | 0;
      if (cp > 4) cp = 4;
      amount += trunc(ctx.attackPower * cp / 100);
    } else if (fam === SPELLFAMILY_ROGUE && (flags & RUPTURE_FLAGS) !== 0) {
      // AP * min(cp, 3) / 100
      let cp = ctx.comboPoints | 0;
      if (cp > 3) cp = 3;
      amount += trunc(ctx.attackPower * cp / 100);
    }
  }

  amount = Math.max(1, amount);
  const tickMs = (raw.amplitude | 0) || 3000;
  const dur = durationMsResolved(state);
  // ImplicitTargetA tags self-cost dots (Hellfire tgtA=1) vs foe DoTs (Corruption tgtA=6).
  // Cite: SpellTargetDefines.h TARGET_UNIT_CASTER=1; applySpell isSelfTargetedDot.
  const base = withPpc(
    {
      kind: 'dot',
      school: schoolOf(state.spell),
      min: amount,
      max: amount,
      durationMs: dur,
      tickMs,
    },
    pointsPerComboPoint,
  );
  state.effects.push(withHostile(base, raw.targetA | 0, amount) as SpellEffect);
}

// ── SPELL_AURA_PERIODIC_HEAL (8) ────────────────────────────────────────────
// Cite: SpellAuras.cpp:3129–3153 HandlePeriodicHeal
export function handlePeriodicHeal(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  let amount = min;

  // Polymorph Heal Effect 12939: amount = maxHealth / 10. Cite: SpellAuras.cpp:3150.
  if (state.spell.id === 12939 && state.ctx.targetMaxHealth != null) {
    amount = trunc(state.ctx.targetMaxHealth / 10);
  }

  amount = Math.max(1, amount);
  const tickMs = (raw.amplitude | 0) || 1000;
  const dur = durationMsResolved(state);
  // TARGET_PET: still periodic (Health Funnel 755 amp 1000 / DurIndex 1). Cite: SpellAuras.cpp:3129.
  if ((raw.targetA | 0) === TARGET_PET) {
    state.effects.push({
      kind: 'restore_health',
      amountPerTick: amount,
      tickMs,
      durationMs: dur,
      applyTo: 'pet',
    });
    state.role = state.role || 'pet_heal';
    return;
  }
  state.effects.push({
    kind: 'restore_health',
    amountPerTick: amount,
    tickMs,
    durationMs: dur,
  });
}

// ── SPELL_AURA_MOD_STAT (29) ────────────────────────────────────────────────
// Cite: SpellAuras.cpp:3443–3487 HandleAuraModStat
export function handleModStat(
  state: HandlerState,
  raw: RawSpellEffect,
  slot: number,
  effectType: number,
): void {
  const misc = raw.miscValue | 0;
  // C++: miscvalue < -2 || > 4 → error return. Cite: :3445–3448.
  if (misc < -2 || misc > 4) {
    state.unhandled.push({
      slot,
      effect: effectType,
      auraName: SPELL_AURA_MOD_STAT,
      reason: `MOD_STAT miscValue ${misc} out of range [-2,4]`,
    });
    return;
  }
  const mod = STAT_MOD[String(misc)];
  if (!mod) {
    state.unhandled.push({
      slot,
      effect: effectType,
      auraName: SPELL_AURA_MOD_STAT,
      reason: `MOD_STAT miscValue ${misc} not in STAT_MOD map`,
    });
    return;
  }
  // Signed amount — debuffs must not clamp to 1. Cite: bake map-spell-effects; :3480.
  const { min, pointsPerComboPoint } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  const base = withPpc(
    { kind: 'buff' as const, mod, amount: min, durationMs: dur },
    pointsPerComboPoint,
  );
  const tagged = withHostile(base, raw.targetA | 0, min);
  state.effects.push(tagged as SpellEffect);

  // Improved Scorpid Sting: on apply, scan the override-class-scripts auras for the talent rank and
  // remove that percent of the sting's stat modifier. Cite: SpellAuras.cpp:3453-3472.
  if ((flagsOf(state.spell) & SCORPID_STING_FLAGS) !== 0) {
    let staminaToRemove = 0;
    for (const script of state.ctx.classScriptAuras ?? []) {
      switch (script.miscValue | 0) {
        case 2388:
          staminaToRemove = trunc(min * 10 / 100);
          break;
        case 2389:
          staminaToRemove = trunc(min * 20 / 100);
          break;
        case 2390:
          staminaToRemove = trunc(min * 30 / 100);
          break;
        default:
          break;
      }
    }
    // C++: if (staminaToRemove) CastCustomSpell(19486, …). Zero → no cast.
    // Without classScriptAuras, branch is evaluated (no cast) — bake-thin parity.
    if (staminaToRemove) {
      state.intents.push({
        kind: 'cast_custom_spell',
        spellId: 19486,
        bp0: staminaToRemove,
      });
    }
  }
}

// ── SPELL_AURA_MOD_SPELL_DAMAGE_OF_STAT_PERCENT (174) & HEALING (175) ───────
// Cite: SpellAuras.cpp:3513–3531 HandleModSpellDamagePercentFromStat / HandleModSpellHealingPercentFromStat
export function handleModSpellDamageHealingOfStatPercent(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  const mod: BuffMod = raw.auraName === SPELL_AURA_MOD_SPELL_DAMAGE_OF_STAT_PERCENT 
    ? 'spell_power_of_spirit_pct' 
    : 'healing_power_of_spirit_pct';
  const tagged = withHostile(
    { kind: 'buff' as const, mod, amount: min, durationMs: dur },
    raw.targetA | 0,
    min,
  );
  state.effects.push(tagged as SpellEffect);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_DAMAGE_DONE (13) ── a physical-only mask becomes attack power; any magic bit
// becomes spell power. Cite: SpellAuras.cpp:4026-4106 HandleModDamageDone.
export function handleModDamageDone(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const misc = raw.miscValue | 0;
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // The bake-thin oracle surface collapses schools to one buff mod: exactly one magic school becomes
  // that school's spell damage. Cite: SpellAuras.cpp:4047-4106; SharedDefines.h:175-197.
  const physicalOnly = misc === SPELL_SCHOOL_MASK_NORMAL;
  const oneSchool = schoolFromSingleBitMask(misc);
  const mod: BuffMod = physicalOnly ? 'attack_power'
    : oneSchool && oneSchool !== 'physical' ? (`spell_damage_${oneSchool}` as BuffMod)
    : 'spell_power';
  const tagged = withHostile(
    { kind: 'buff' as const, mod, amount: min, durationMs: dur },
    raw.targetA | 0,
    min,
  );
  state.effects.push(tagged as SpellEffect);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_STUN (12) ── the C++ always stuns; mechanic and interrupt flags decide hard stun
// versus break-on-damage. Duration reuses a bake-stamped ms when the index is absent; never invented.
function modStunDurationMs(state: HandlerState): number {
  const fromIndex = durationMsResolved(state);
  if (fromIndex > 0) return fromIndex;
  // durationIndex present (incl. 21 → 0 infinite) → trust resolved value.
  if (state.spell.durationIndex != null || state.ctx.durationIndex != null) {
    return fromIndex;
  }
  if (state.ctx.durationMs != null) return fromIndex;
  let best = 0;
  for (const e of state.spell.effects ?? []) {
    if (e.kind === 'cc' && (e.durationMs | 0) > best) best = e.durationMs | 0;
  }
  return best > 0 ? best : fromIndex;
}

export function handleModStun(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const dur = modStunDurationMs(state);
  const school = schoolOf(state.spell);
  // Prefer raw.mechanic (spell-level Mechanic folded by mapRawEffects); name/tooltip
  // fallback when older bakes left mechanic 0. Cite: breakableStunCc.resolveModStunMechanicId.
  const mechId = resolveModStunMechanicId(state.spell, raw.mechanic | 0);
  // The interrupt flags: the dump is 0 on every row, so the bake stamps the DBC field, and the context
  // overrides only when a caller supplies them. Cite: SpellDefines.h AURA_INTERRUPT_FLAG_DAMAGE.
  const spellAif = ((state.spell as { auraInterruptFlags?: number }).auraInterruptFlags ?? 0) | 0;
  const aif = ((state.ctx.auraInterruptFlags ?? 0) | 0) || spellAif;
  state.effects.push(buildModStunCcEffect(mechId, dur, school, state.spell.name, aif));
  state.role = state.role || 'control';

  // Specials (not in bake effects) — intents for SI5+ apply/remove.
  const frostFreeze = school === 'frost';
  let wyvernStingSleepSpellId: number | undefined;
  let wyvernBossNatureDamage: { expire: number; dispel: number } | undefined;

  // Wyvern Sting family specials fire on *remove*; document mapping at interpret.
  // Cite: :2525–2573.
  if (familyOf(state.spell) === SPELLFAMILY_HUNTER) {
    const flags = flagsOf(state.spell);
    const id = state.spell.id | 0;
    if ((flags & WYVERN_STING_FAMILY_FLAGS) !== 0) {
      const sleepId = WYVERN_STING_SLEEP[id];
      if (sleepId) wyvernStingSleepSpellId = sleepId;
    } else if (id === 26180) {
      // Princess Huhuran: 500 nature on expire, 3000 on dispel. Cite: :2561–2564.
      wyvernBossNatureDamage = { expire: 500, dispel: 3000 };
    }
  }

  if (frostFreeze || wyvernStingSleepSpellId != null || wyvernBossNatureDamage) {
    const intent: InterpretIntent = { kind: 'mod_stun_special' };
    if (frostFreeze) intent.frostFreeze = true;
    if (wyvernStingSleepSpellId != null) intent.wyvernStingSleepSpellId = wyvernStingSleepSpellId;
    if (wyvernBossNatureDamage) intent.wyvernBossNatureDamage = wyvernBossNatureDamage;
    state.intents.push(intent);
  }
}

// ── SPELL_AURA_MOD_RESISTANCE (22) ── physical becomes armor and magic bits become resistances.
// Cite: SpellAuras.cpp:3362-3381 HandleAuraModResistance; map-spell-effects mapModResistanceEffects.
export function handleModResistance(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min, pointsPerComboPoint } = effectAmountRange(raw, state.ctx);
  // The C++ returns early on a zero amount, but at interpret time the base can be 0 while the
  // per-combo or per-level term is not — Expose Armor and the NPC armor shreds. Keep the row.
  const perLevel = Number(raw.perLevel) || 0;
  if (!min && !pointsPerComboPoint && !perLevel) {
    state.effects.push({ kind: 'client_inform' });
    return;
  }

  const mask = raw.miscValue | 0;
  const dur = durationMsResolved(state);
  const tgtA = raw.targetA | 0;

  // Physical / armor (SPELL_SCHOOL_MASK_NORMAL = 1). Mask 0 → armor fallback.
  // Cite: map-spell-effects.mjs:67–76; C++ loops all schools with misc bit. Cite: :3370–3379.
  if (!mask || (mask & SPELL_SCHOOL_MASK_NORMAL) !== 0) {
    // Hostile when the amount is negative, or when only the per-combo or per-level term is (Expose
    // Armor, NPC Sunder). An enemy targetA already forces hostile; this covers the other shapes.
    const hostilityAmt = min
      || (pointsPerComboPoint != null && pointsPerComboPoint < 0 ? -1 : 0)
      || (perLevel < 0 ? -1 : 0);
    const base = withPpc(
      { kind: 'buff' as const, mod: 'armor' as const, amount: min, durationMs: dur },
      pointsPerComboPoint,
    );
    state.effects.push(withHostile(base, tgtA, hostilityAmt) as SpellEffect);
  }
  // Magic schools by bit. Hostility is stamped from targetA so Curse of the Elements does not
  // self-apply on the caster. Cite: SpellTargetDefines TARGET_UNIT_ENEMY = 6.
  for (let bit = 1; bit <= 6; bit++) {
    if ((mask & (1 << bit)) !== 0) {
      state.effects.push(withHostile(
        { kind: 'resist', school: SCHOOLS[bit]!, amount: min },
        tgtA,
        min,
      ) as SpellEffect);
    }
  }
}

// ── SPELL_AURA_MOD_BASE_RESISTANCE (83) ── the same player-visible surface as aura 22; only the
// UnitMods layer differs, base value rather than total. Cite: SpellAuras.cpp:3411-3422.
export function handleModBaseResistance(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  // C++: if (!m_modifier.m_amount) return. Cite: SpellAuras.cpp:3413–3414.
  if (!min) return;

  const mask = raw.miscValue | 0;
  const dur = durationMsResolved(state);
  const tgtA = raw.targetA | 0;

  // Physical / armor (SPELL_SCHOOL_MASK_NORMAL = 1). Mask 0 → armor fallback.
  // Cite: map-spell-effects.mjs:67–76; C++ school loop :3418–3421.
  if (!mask || (mask & SPELL_SCHOOL_MASK_NORMAL) !== 0) {
    const base = { kind: 'buff' as const, mod: 'armor' as const, amount: min, durationMs: dur };
    state.effects.push(withHostile(base, tgtA, min) as SpellEffect);
  }
  // Magic schools: bit i → SCHOOLS[i] (holy=1 … arcane=6). Hostile from targetA (KI-765).
  // Cite: map-spell-effects.mjs:79–82; SharedDefines SpellSchoolMask; withHostile.
  for (let bit = 1; bit <= 6; bit++) {
    if ((mask & (1 << bit)) !== 0) {
      state.effects.push(withHostile(
        { kind: 'resist', school: SCHOOLS[bit]!, amount: min },
        tgtA,
        min,
      ) as SpellEffect);
    }
  }
}

// Does an aura slot sit on the cast target rather than the caster? A channel holder is caster-targeted
// and stays; 92 of 445 periodic-trigger slots name someone else and were all landing on the caster.
function auraSitsOnTarget(raw: RawSpellEffect): boolean {
  const a = raw.targetA | 0;
  const b = raw.targetB | 0;
  if (a === 21 || a === 25) return true;
  // The cone, nearby-enemy and dest-enemy families. Missing these put dummy and periodic holders on
  // the caster as a self-buff. Cite: SpellTargetDefines.h; targeting.ts HOSTILE_IMPLICIT.
  if (HOSTILE_IMPLICIT.has(a) || HOSTILE_IMPLICIT.has(b)) return true;
  return (a === 22 || a === 53) && b === 15;
}

function auraIsHostileImplicit(raw: RawSpellEffect): boolean {
  return HOSTILE_IMPLICIT.has(raw.targetA | 0) || HOSTILE_IMPLICIT.has(raw.targetB | 0);
}

// ── SPELL_AURA_PERIODIC_TRIGGER_SPELL (23) ── baked as a proc trigger with a tick. A zero trigger id
// goes through the per-id switch in periodic-trigger-zero.ts. Cite: SpellAuras.cpp:3092-3111.
export function handlePeriodicTriggerSpell(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const trig = raw.triggerSpell | 0;
  if (!trig) {
    // Scripted empty-trigger specials (or intentional no-ops). Cite: periodic-trigger-zero.ts.
    emitPeriodicTriggerSpellZero(state, raw);
    return;
  }

  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // Amplitude from EffectAmplitude (Aura ctor SetModifier periodictime). Cite: :280.
  // 0 = on-hit (applySpell drops it); truthy tickMs is the periodic while gate. Do not || fallback.
  const tickMs = raw.amplitude | 0;
  state.effects.push({
    kind: 'proc_trigger_spell',
    triggerSpellId: trig,
    durationMs: dur,
    amount: min,
    tickMs,
    ...(auraSitsOnTarget(raw) ? { auraOnTarget: true } : {}),
  });
  state.role = state.role || 'buff';

  // On remove specials (Burning Adrenaline). Documented for SI5 remove path.
  // Cite: :3098–3106.
  const id = state.spell.id | 0;
  if (id === 18173 || id === 23620) {
    state.intents.push({
      kind: 'periodic_trigger_remove',
      castSpellIds: [...BURNING_ADRENALINE_REMOVE_CASTS],
    });
  }
}

// ── SPELL_AURA_MOD_DECREASE_SPEED (33) ── baked as a signed speed percent. Snare immunity reads the
// spell's own mechanic, defaulting to snare when the effect carries none. Cite: SpellAuras.cpp:2907.
export function handleModDecreaseSpeed(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // Signed pct (slows negative). Cite: map-spell-effects.mjs:727–738.
  const tagged = withHostile(
    {
      kind: 'speed' as const,
      aura: SPELL_AURA_MOD_DECREASE_SPEED,
      pct: min,
      durationMs: dur,
    },
    raw.targetA | 0,
    min,
    raw.targetB | 0,
  );
  state.effects.push(tagged as SpellEffect);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_DUMMY (4) ── the bake is empty for this aura, so the specials become intents only.
// Cite: SpellAuras.cpp:1229-1620 HandleAuraDummy; PeriodicDummyTick :5025.
export function handleAuraDummy(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++ requires Real; interpret is apply-time snapshot (Real=true). Cite: :1231–1233.
  const id = state.spell.id | 0;
  const fam = familyOf(state.spell);

  // ── AT APPLY family/id specials ──────────────────────────────────────────
  // Cite: :1238–1355.
  if (fam === SPELLFAMILY_GENERIC) {
    switch (id) {
      case 126: // Eye of Kilrogg — charm pet 4277 casts 2585. Cite: :1245–1255.
        state.intents.push({
          kind: 'aura_dummy',
          spellId: id,
          action: 'cast_spell',
          relatedSpellId: 2585,
          on: 'apply',
        });
        return;
      case 6946: // Curse of the Bleakheart
      case 41170:
        state.intents.push({
          kind: 'aura_dummy',
          spellId: id,
          action: 'periodic',
          periodMs: 5 * IN_MILLISECONDS,
          // The C++ overrides the payload damage with this spell's second effect value, which our
          // single-slot row does not carry, so 6945's own baked range stands.
          relatedSpellId: id === 6946 ? 6945 : 41356,
          chancePct: 5,
          on: 'apply',
        });
        return;
      case 7057: // Haunting Spirits — 30s period. Cite: :1265–1269.
        state.intents.push({
          kind: 'aura_dummy',
          spellId: id,
          action: 'periodic',
          periodMs: 30 * IN_MILLISECONDS,
          on: 'apply',
        });
        state.effects.push({ kind: 'client_inform' });
        return;
      case 7054: // Forsaken Skill — 1s period. Cite: :1270–1273.
        state.intents.push({
          kind: 'aura_dummy',
          spellId: id,
          action: 'periodic',
          periodMs: 1 * IN_MILLISECONDS,
          on: 'apply',
        });
        break;
      case 13139: // net-o-matic root self 13138. Cite: :1274–1278.
        state.intents.push({
          kind: 'aura_dummy',
          spellId: id,
          action: 'cast_spell',
          relatedSpellId: 13138,
          on: 'apply',
        });
        return;
      case 21094: // Separation Anxiety (Majordomo)
      case 23487: // Separation Anxiety (Garr)
        state.intents.push({
          kind: 'aura_dummy',
          spellId: id,
          action: 'periodic',
          periodMs: 5 * IN_MILLISECONDS,
          on: 'apply',
        });
        return;
      case 23183: // Mark of Frost → 23186 if has 23182. Cite: :1289–1293.
        state.intents.push({
          kind: 'aura_dummy',
          spellId: id,
          action: 'cast_spell',
          relatedSpellId: 23186,
          on: 'apply',
        });
        return;
      case 25042: // Mark of Nature → 25043 if has 25040. Cite: :1295–1299.
        state.intents.push({
          kind: 'aura_dummy',
          spellId: id,
          action: 'cast_spell',
          relatedSpellId: 25043,
          on: 'apply',
        });
        return;
      case 25471: // Attack Order → 25473. Cite: :1301–1304.
        state.intents.push({
          kind: 'aura_dummy',
          spellId: id,
          action: 'cast_spell',
          relatedSpellId: 25473,
          on: 'apply',
        });
        return;
      case 26681: // Cologne removes Perfume 26682. Cite: :1306–1312.
        state.intents.push({
          kind: 'aura_dummy',
          spellId: id,
          action: 'remove_aura',
          relatedSpellId: 26682,
          on: 'apply',
        });
        state.effects.push({ kind: 'client_inform' });
        return;
      case 26682: // Perfume removes Cologne 26681. Cite: :1314–1320.
        state.intents.push({
          kind: 'aura_dummy',
          spellId: id,
          action: 'remove_aura',
          relatedSpellId: 26681,
          on: 'apply',
        });
        state.effects.push({ kind: 'client_inform' });
        return;
      default:
        break;
    }
  } else if (fam === SPELLFAMILY_WARRIOR) {
    if (id === 23427) {
      // Summon Infernals (Nefarian). Cite: :1328–1333.
      state.intents.push({
        kind: 'aura_dummy',
        spellId: id,
        action: 'cast_spell',
        relatedSpellId: 23426,
        on: 'apply',
      });
      return;
    }
  } else if (fam === SPELLFAMILY_PRIEST) {
    if (id === 30238) {
      // Lordaeron's Blessing → 31906. Cite: :1340–1344.
      state.intents.push({
        kind: 'aura_dummy',
        spellId: id,
        action: 'cast_spell',
        relatedSpellId: 31906,
        on: 'apply',
      });
      return;
    }
  }

  // ── AT REMOVE specials ───────────────────────────────────────────────────
  // Cite: :1356–1448. Emit as remove-phase intents (SI5 consumes on expire/dispel/death).
  const tameFinal = QUEST_TAME_FINAL[id];
  if (tameFinal) {
    state.intents.push({
      kind: 'aura_dummy',
      spellId: id,
      action: 'quest_tame_final',
      relatedSpellId: tameFinal,
      on: 'remove',
    });
    return;
  }

  switch (id) {
    case 11129: // Combustion clear 28682 stacks. Cite: :1386–1388.
      state.intents.push({
        kind: 'aura_dummy',
        spellId: id,
        action: 'combustion_clear_stacks',
        relatedSpellId: 28682,
        on: 'remove',
      });
      return;
    case 11826: // Electromagnetic Gigaflux Reactivator expire → 11828. Cite: :1389–1398.
      state.intents.push({
        kind: 'aura_dummy',
        spellId: id,
        action: 'cast_spell',
        relatedSpellId: 11828,
        on: 'remove_expire',
      });
      return;
    case 12774: // Belnistrasz Idol → 12816 unless death. Cite: :1399–1409.
      state.intents.push({
        kind: 'aura_dummy',
        spellId: id,
        action: 'cast_spell',
        relatedSpellId: 12816,
        on: 'remove',
      });
      return;
    case 17189: // Frostwhisper's Lifeblood full heal. Cite: :1410–1414.
      state.intents.push({
        kind: 'aura_dummy',
        spellId: id,
        action: 'cast_spell',
        on: 'remove',
      });
      return;
    case 25185: // Itch → 25187. Cite: :1415–1418.
      state.intents.push({
        kind: 'aura_dummy',
        spellId: id,
        action: 'cast_spell',
        relatedSpellId: 25187,
        on: 'remove',
      });
      return;
    case 26077: // Itch → 26078. Cite: :1420–1423.
      state.intents.push({
        kind: 'aura_dummy',
        spellId: id,
        action: 'cast_spell',
        relatedSpellId: 26078,
        on: 'remove',
      });
      return;
    case 29104: // Anub'Rekhan Aura death → 29105. Cite: :1425–1429.
      state.intents.push({
        kind: 'aura_dummy',
        spellId: id,
        action: 'cast_spell',
        relatedSpellId: 29105,
        on: 'remove_death',
      });
      return;
    case 30238: // Lordaeron's Blessing remove 31906. Cite: :1431–1434.
      state.intents.push({
        kind: 'aura_dummy',
        spellId: id,
        action: 'remove_aura',
        relatedSpellId: 31906,
        on: 'remove',
      });
      return;
    default:
      break;
  }

  // Mage Arcane Missiles channel interrupt on target death. Cite: :1437–1446.
  // Family MAGE + flag 0x800 — document for remove_death path.
  if (fam === SPELLFAMILY_MAGE && (flagsOf(state.spell) & 0x800) !== 0) {
    state.intents.push({
      kind: 'aura_dummy',
      spellId: id,
      action: 'interrupt_channel_on_death',
      on: 'remove_death',
    });
    return;
  }

  // ── AT APPLY & REMOVE ────────────────────────────────────────────────────
  // Cite: :1450–1620.
  if (fam === SPELLFAMILY_GENERIC) {
    switch (id) {
      case 6606: // Sleep Until Cancelled visual
      case 16093:
        state.intents.push({
          kind: 'aura_dummy',
          spellId: id,
          action: 'sleep_visual',
          on: 'both',
        });
        return;
      case 24658: // Unstable Power → 24659. Cite: :1482–1493.
        state.intents.push({
          kind: 'aura_dummy',
          spellId: id,
          action: 'cast_spell',
          relatedSpellId: 24659,
          on: 'apply',
        });
        return;
      case 24661: // Restless Strength → 24662. Cite: :1495–1506.
        state.intents.push({
          kind: 'aura_dummy',
          spellId: id,
          action: 'cast_spell',
          relatedSpellId: 24662,
          on: 'both',
        });
        return;
      case 28819: // Submerge Visual. Cite: :1508–1518.
        state.intents.push({
          kind: 'aura_dummy',
          spellId: id,
          action: 'sleep_visual',
          on: 'both',
        });
        return;
      case 29266: // Permanent Feign Death. Cite: :1520–1530.
        state.intents.push({
          kind: 'aura_dummy',
          spellId: id,
          action: 'feign_death',
          on: 'both',
        });
        return;
      default:
        break;
    }
  }

  // Predatory Strikes — icon 1563 player AP recalc. Cite: :1537–1543.
  if (fam === SPELLFAMILY_DRUID && iconIdOf(state) === 1563) {
    state.intents.push({
      kind: 'aura_dummy',
      spellId: id,
      action: 'predatory_strikes_ap',
      on: 'both',
    });
    return;
  }

  // Seal of the Crusader ranks — 40% BASE_ATTACK DPS. Cite: :1576–1584.
  if (fam === SPELLFAMILY_PALADIN && SEAL_OF_THE_CRUSADER_IDS.has(id)) {
    state.intents.push({
      kind: 'aura_dummy',
      spellId: id,
      action: 'seal_crusader_dps',
      dpsPct: 40,
      on: 'both',
    });
    return;
  }

  // Healing Way 29203 — dummy amount is the % Healing Wave taken. Cite: Shaman.cpp:77–89.
  if (id === HEALING_WAY_BUFF_SPELL_ID) {
    const { min } = effectAmountRange(raw, state.ctx);
    const dur = durationMsResolved(state);
    state.effects.push({
      kind: 'healing_way',
      amountPct: min,
      durationMs: dur > 0 ? dur : 15_000,
      maxStacks: HEALING_WAY_MAX_STACKS,
    });
    state.role = state.role || 'buff';
    return;
  }

  // A generic dummy still attaches the aura holder — duration, icon, stacking — even with an empty
  // handler body, so materialize a timed shell rather than leave the slot hollow.
  const dur = durationMsResolved(state);
  state.effects.push({
    kind: 'aura_dummy_holder',
    spellId: id,
    durationMs: dur > 0 ? dur : 0,
    // Whose icon is it? 106 of the 401 spells reaching here name a unit other than the caster, and
    // every one of them was putting the timer on the CASTER.
    ...(auraSitsOnTarget(raw) ? { auraOnTarget: true } : {}),
    ...(auraIsHostileImplicit(raw) ? { hostile: true } : {}),
  } as never);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_MELEE_HASTE (138) ── baked as a haste buff.
// Cite: SpellAuras.cpp:3929-3936 HandleModMeleeSpeedPct.
export function handleModMeleeHaste(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // C++: ApplyAttackTimePercentMod BASE+OFF with amount (signed). Cite: :3931–3935.
  const tagged = withHostile(
    { kind: 'buff' as const, mod: 'haste' as const, amount: min, durationMs: dur },
    raw.targetA | 0,
    min,
  );
  state.effects.push(tagged as SpellEffect);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_ATTACK_POWER (99) ── baked as an attack-power buff.
// Cite: SpellAuras.cpp:3987-3991 HandleAuraModAttackPower.
export function handleModAttackPower(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min, pointsPerComboPoint } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // C++: HandleStatModifier(UNIT_MOD_ATTACK_POWER, TOTAL_VALUE, amount). Cite: :3989–3990.
  const base = withPpc(
    { kind: 'buff' as const, mod: 'attack_power' as const, amount: min, durationMs: dur },
    pointsPerComboPoint,
  );
  state.effects.push(withHostile(base, raw.targetA | 0, min) as SpellEffect);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_ATTACK_POWER_PCT (166) ── an attack-power-only percent, which applySpell converts
// to a flat delta at apply. Cite: SpellAuras.cpp:4004-4010.
export function handleModAttackPowerPercent(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min, pointsPerComboPoint } = effectAmountRange(raw, state.ctx);
  const base = withPpc(
    {
      kind: 'buff' as const,
      mod: 'attack_power_pct' as const,
      amount: min,
      durationMs: durationMsResolved(state),
    },
    pointsPerComboPoint,
  );
  state.effects.push(withHostile(base, raw.targetA | 0, min) as SpellEffect);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_HEALING_DONE (135) ── player-only, consumed by the healing bonus, since Classic
// has no client field for it. Cite: SpellAuras.cpp:3528-3535 HandleModHealingDone.
export function handleModHealingDone(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++: non-player → return. Cite: :3530–3531.
  // Bake-thin default: emit (player path); skip when ctx.unitTargetIsPlayer === false.
  if (state.ctx.unitTargetIsPlayer === false) return;

  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // Flat +healing for equip auras (Increase Healing N). Cite: Unit.cpp SpellHealingBonusDone.
  const tagged = withHostile(
    { kind: 'buff' as const, mod: 'healing_done' as const, amount: min, durationMs: dur },
    raw.targetA | 0,
    min,
  );
  state.effects.push(tagged as SpellEffect);
  state.role = state.role || 'buff';
  state.intents.push({
    kind: 'mod_healing_done',
    amount: min,
    schoolMask: raw.miscValue | 0,
    durationMs: dur,
  });
}

// ── SPELL_AURA_MOUNTED (78) ── emitted as a real EFFECT, not an intent: the census counted intents
// while consumers of the effect list saw only the speed aura. Cite: SpellAuras.cpp:1629-1656.
export function handleAuraMounted(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++ requires Real. Cite: :1631–1633.
  const creatureEntry = raw.miscValue | 0;
  // Missing creature template → error log + return. Cite: :1638–1642.
  if (!creatureEntry) return;
  // The interpreter emits the creature entry; the display id comes from the runtime creature DB.
  // Cite: SpellAuras.cpp:1644-1650 ChooseDisplayId; Unit.cpp:7741-7756 Mount.
  state.effects.push({ kind: 'mounted', creatureEntry });
  state.intents.push({ kind: 'mounted', creatureEntry });
  // World/travel utility — keep out of combat kit roles (aura 32 alone stays utility).
  // Cite: roles.ts mounted-speed world mounts; SpellAuras HandleAuraMounted is OOC.
  state.role = state.role || 'utility';
}

// ── SPELL_AURA_MOD_DAMAGE_TAKEN (14) ── a physical mask becomes physical_taken, else spell_taken.
// Cite: SpellAuras.cpp:75; Unit.cpp:7160 MeleeDamageBonusTaken, :7597 SpellBaseDamageBonusTaken.
export function handleModDamageTaken(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const misc = raw.miscValue | 0;
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // Physical-only mask (SPELL_SCHOOL_MASK_NORMAL=1) vs magic. Cite: map-spell-effects.mjs:783–791.
  const physicalOnly = misc === SPELL_SCHOOL_MASK_NORMAL;
  const mod: BuffMod = physicalOnly ? 'physical_taken' : 'spell_taken';
  const tagged = withHostile(
    { kind: 'buff' as const, mod, amount: min, durationMs: dur },
    raw.targetA | 0,
    min,
  );
  state.effects.push(tagged as SpellEffect);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_ROOT (26) ── Real applications only, baked as a root with its duration. Immunity
// reads the spell's own mechanic. Cite: SpellAuras.cpp:2727-2775 HandleAuraModRoot.
export function handleModRoot(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++: if (!Real) return. Interpret is apply-time snapshot (Real=true). Cite: :2729–2731.
  const dur = durationMsResolved(state);
  state.effects.push({ kind: 'root', durationMs: dur });
  state.role = state.role || 'control';

  // Frost root → AURA_STATE_FROZEN on apply (and clear on remove if no other frost freeze).
  // Cite: SpellAuras.cpp:2737–2739 apply; :2748–2765 remove scan.
  if (schoolOf(state.spell) === 'frost') {
    state.intents.push({ kind: 'mod_root_special', frostFreeze: true });
  }
  // Caster AI JustRootedTarget is runtime-only (no bake surface). Cite: :2741–2743.
}

export function handleModSkill(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  pushModSkillIntent(state, raw, false);
}

export function handleModSkillTalent(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  pushModSkillIntent(state, raw, true);
}

// ── SPELL_AURA_MOD_INCREASE_SPEED (31) ── baked as a signed speed percent on the run rate.
// Cite: SpellAuras.cpp:2880-2886 HandleAuraModIncreaseSpeed.
export function handleModIncreaseSpeed(
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
      aura: SPELL_AURA_MOD_INCREASE_SPEED,
      pct: min,
      durationMs: dur,
    },
    raw.targetA | 0,
    min,
    raw.targetB | 0,
  );
  state.effects.push(tagged as SpellEffect);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_INCREASE_MOUNTED_SPEED (32) ── the run rate is only recalculated while mounted,
// so this is world travel and not fight kit — aura 31 is the combat speed buff.
export function handleModIncreaseMountedSpeed(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++ requires Real. Cite: SpellAuras.cpp:2891–2893.
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  const tagged = withHostile(
    {
      kind: 'speed' as const,
      aura: SPELL_AURA_MOD_INCREASE_MOUNTED_SPEED,
      pct: min,
      durationMs: dur,
    },
    raw.targetA | 0,
    min,
  );
  state.effects.push(tagged as SpellEffect);
  // Utility, not buff — pure world travel (KI-479 / roles.ts aura-32 contract). Aura 31 alone is the combat
  // buff path; do not stamp 'buff' here or roleOf promotes mount bridles into knownCombatSpells.
  state.role = state.role || 'utility';
}

// ── SPELL_AURA_TRANSFORM (56) ── baked as a breakable incapacitate.
// Cite: SpellAuras.cpp:1979-2052 HandleAuraTransform.
export function handleAuraTransform(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // Merge with a confuse slot when both remap to the same incapacitate (Polymorph carries both), so
  // diminishing returns advance once per cast rather than twice.
  pushOrMergePolymorphIncapacitate(state, {
    kind: 'cc',
    control: 'incapacitate',
    mechanic: 'polymorph',
    durationMs: dur,
    school: schoolOf(state.spell),
    breakOnDamage: true,
  });

  // C++ display path: misc = creature entry → ChooseDisplayId into m_amount.
  // misc 0 → script override amount or error. Cite: :1985–2021.
  const creatureEntry = raw.miscValue | 0;
  const intent: InterpretIntent = {
    kind: 'transform',
    creatureEntry,
  };
  // Unknown template → pig pink display 16358. Cite: :2000–2004.
  // Bake-thin has no creature DB; emit fallback id when entry non-zero so SI5 can resolve.
  if (creatureEntry) {
    intent.missingCreatureDisplayId = TRANSFORM_MISSING_CREATURE_DISPLAY;
  } else if (!min) {
    // misc 0 and amount 0 → C++ error log only (no SetDisplayId from entry). Cite: :1991–1996.
  }
  state.intents.push(intent);
}

// ── SPELL_AURA_SCHOOL_ABSORB (69) ── baked as an absorb pool, with a caster-master target applying to
// the owner (Voidwalker Sacrifice). Cite: SpellAuras.cpp:130; Spell.cpp:2422-2424 GetMaster.
export function handleSchoolAbsorb(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min, max } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // Pool from basepoints; clamp ≥ 1. Cite: map-spell-effects.mjs:952–957.
  // Bonus coefficient path is cast-time (ctx not on bake-thin). Cite: :6053–6059.
  const clamped = clampPositiveRange(min, max);
  // Cite: SpellTargetDefines.h TARGET_UNIT_CASTER_MASTER = 27; targeting.ts TARGET_CASTER_MASTER.
  const applyTo =
    (raw.targetA | 0) === 27 ? ('owner' as const) : undefined;
  state.effects.push({
    kind: 'school_absorb',
    schoolMask: raw.miscValue | 0,
    min: clamped.min,
    max: clamped.max,
    durationMs: dur,
    ...(applyTo ? { applyTo } : {}),
  });
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MECHANIC_IMMUNITY (77) ── baked as a mechanic immunity.
// Cite: SpellAuras.cpp:2936-2948 HandleModMechanicImmunity.
export function handleModMechanicImmunity(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const misc = raw.miscValue | 0;
  const dur = durationMsResolved(state);
  // ApplySpellImmune(IMMUNITY_MECHANIC, misc). Cite: :2947.
  state.effects.push({
    kind: 'mechanic_immunity',
    mechanic: misc,
    durationMs: dur,
    positive: true,
  });
  state.role = state.role || 'buff';

  // On apply + SPELL_ATTR_EX_IMMUNITY_PURGES_EFFECT → RemoveAurasAtMechanicImmunity. mechanic bit mask = 1
  // << (misc − 1). Cite: :2941–2945. Bake-thin: attr unknown unless ctx.immunityPurgesEffect === true.
  if (state.ctx.immunityPurgesEffect === true && misc > 0) {
    state.intents.push({
      kind: 'mechanic_immunity_purge',
      mechanic: misc,
      mechanicMask: 1 << (misc - 1),
    });
  }
}

// ── SPELL_AURA_MOD_POWER_REGEN (85) ── a finite duration bakes as a drink-style restore, else a flat
// mana-per-five buff. Cite: SpellAuras.cpp:3621-3641; PeriodicTick :4959-4985.
export function handleModPowerRegen(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++ requires Real. Cite: :3623–3625.
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // The C++ arms the period when it is 0 — 3000 for rage, else 2000 — while the bake's drink path
  // uses the amplitude or 5000 for its ticks. Rage Anger Management is three fifths in combat.

  // Finite duration = drink sit-and-sip (category 59). Cite: map-spell-effects.mjs:1025–1033.
  if (dur > 0) {
    // The tick only lands when the bearer's own power type IS this one. Cite: SpellAuras.cpp:4965-4967.
    state.effects.push({
      kind: 'restore_power',
      amountPerTick: Math.max(1, min),
      powerType: raw.miscValue | 0,
      tickMs: (raw.amplitude | 0) || 5000,
      durationMs: dur,
    });
    return;
  }

  // Permanent / gear path → flat mp5. Cite: map-spell-effects.mjs:1035–1038.
  // withHostile stamps hostile:false for friendly targets (oracle field parity).
  const amount = Math.max(1, min);
  const tagged = withHostile(
    { kind: 'buff' as const, mod: 'mp5' as const, amount, durationMs: dur },
    raw.targetA | 0,
    amount,
  );
  state.effects.push(tagged as SpellEffect);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_RANGED_ATTACK_POWER (124) ── baked as an attack-power buff, as melee AP is.
// Cite: SpellAuras.cpp:3994-4000 HandleAuraModRangedAttackPower.
export function handleModRangedAttackPower(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // Wand users (priest/mage/warlock) skip RAP. Cite: :3996–3997 CLASSMASK_WAND_USERS.
  // Bake-thin: no class → emit. Cast-time: unitTargetClass set and wand → return.
  const cls = state.ctx.unitTargetClass;
  if (cls != null) {
    const classMask = 1 << (cls - 1);
    if ((classMask & CLASSMASK_WAND_USERS) !== 0) return;
  }

  const { min, pointsPerComboPoint } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // UNIT_MOD_ATTACK_POWER_RANGED TOTAL_VALUE. Cite: :3999.
  const base = withPpc(
    { kind: 'buff' as const, mod: 'attack_power' as const, amount: min, durationMs: dur },
    pointsPerComboPoint,
  );
  state.effects.push(withHostile(base, raw.targetA | 0, min) as SpellEffect);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_DAMAGE_SHIELD (15) ── baked as a damage shield, paid out in DealMeleeDamage.
// Cite: SpellAuras.cpp:76; Unit.cpp:2242-2293.
export function handleDamageShield(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min, max } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  const clamped = clampPositiveRange(min, max || min);
  // Retaliation amount is modifier m_amount; school from spell. Cite: Unit.cpp:2267–2288.
  const effect: SpellEffect = {
    kind: 'damage_shield',
    school: schoolOf(state.spell),
    min: clamped.min,
    max: clamped.max,
    durationMs: dur,
  };
  // Optional proc charges / CD from spell row (bake opts.procCharges / peCd).
  // Cite: map-spell-effects.mjs:504–505, :619–622.
  const charges = (state.spell.procCharges ?? 0) | 0;
  if (charges > 0) effect.charges = charges;
  state.effects.push(effect);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_SCALE (61) ── a cosmetic scale percent, emitted as an effect so the census credits
// the slot and combat stores the display scale. Cite: SpellAuras.cpp:2182-2185.
export function handleModScale(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // ApplyPercentModFloatValue(OBJECT_FIELD_SCALE_X, float(amount), apply). Cite: :2184.
  state.effects.push({ kind: 'mod_scale', pct: min, durationMs: dur });
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_MOD_FEAR (7) ── Real applications only, baked as a fear with a one-second pulse.
// Cite: SpellAuras.cpp:2368-2379 HandleModFear.
export function handleModFear(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // C++: if (!Real) return. Interpret is apply-time snapshot (Real=true). Cite: :2370–2371.
  // Remove path: keep fleeing while any MOD_FEAR remains. Cite: :2373–2375.
  const dur = durationMsResolved(state);
  state.effects.push({
    kind: 'cc',
    control: 'fear',
    mechanic: 'fear',
    durationMs: dur,
    school: schoolOf(state.spell),
    pulseMs: 1000,
  });
  state.role = state.role || 'control';
  // getHostileRefManager().HandleSuppressed is runtime threat list only. Cite: :2379.
}

// ── SPELL_AURA_SCHOOL_IMMUNITY (39) ── baked as a school immunity.
// Cite: SpellAuras.cpp:2992-3043 HandleAuraModSchoolImmunity.
export function handleSchoolImmunity(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const schoolMask = raw.miscValue | 0;
  const dur = durationMsResolved(state);
  // ApplySpellImmune(IMMUNITY_SCHOOL, misc). Cite: :2995.
  state.effects.push({
    kind: 'school_immunity',
    schoolMask,
    durationMs: dur,
    positive: true,
  });
  state.role = state.role || 'buff';

  // Apply-time specials (purge / banish isolate). Cite: :2996–3030.
  const intent: InterpretIntent = { kind: 'school_immunity_special', schoolMask };
  // Positive + SPELL_ATTR_EX_IMMUNITY_PURGES_EFFECT → remove negative school auras.
  // Bake-thin always tags positive; purge only when attr gated. Cite: :3002–3023.
  if (state.ctx.immunityPurgesEffect === true) {
    intent.purgeNegativeSchoolAuras = true;
  }
  // MECHANIC_BANISH → UNIT_STAT_ISOLATED. Cite: :3025–3030.
  const spellMech = state.spell.mechanic;
  const rawMech = raw.mechanic | 0;
  if (spellMech === 'banish' || rawMech === MECHANIC_BANISH) {
    intent.isolated = true;
  }
  if (intent.purgeNegativeSchoolAuras || intent.isolated) {
    state.intents.push(intent);
  }
  // UNIT_FLAG_IMMUNE + hostile-ref suppress are runtime flags. Cite: :3033–3042.
}

// ── SPELL_AURA_MOD_REGEN (84) ── baked as a food-style health restore.
// Cite: SpellAuras.cpp:3612-3617 HandleModRegen; PeriodicTick :4948-4957.
export function handleModRegen(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // C++: periodictime default 5000; m_periodicTimer = 5000; m_isPeriodic. Cite: :3614–3617.
  // Tick: ModifyHealth(amount). Cite: :4954.
  state.effects.push({
    kind: 'restore_health',
    amountPerTick: Math.max(1, min),
    tickMs: (raw.amplitude | 0) || 5000,
    durationMs: dur,
  });
  // map-spell-effects sets outOfCombatOnly on the spell roll for food — SI5.
}

// ── SPELL_AURA_MOD_DAMAGE_PERCENT_DONE (79) ── baked as a damage-done percent, with the school when
// the mask is a single bit. Cite: SpellAuras.cpp:4109-4173 HandleModDamagePercentDone.
export function handleModDamagePercentDone(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  const misc = raw.miscValue | 0;
  // Physical TOTAL_PCT weapon mods + magic SpellDamageBonusDone are runtime.
  // Cite: :4131–4168. Bake surface is the percent buff.
  const buff: {
    kind: 'buff';
    mod: BuffMod;
    amount: number;
    durationMs: number;
    school?: School;
  } = {
    kind: 'buff',
    mod: 'damage_done_pct',
    amount: min,
    durationMs: dur,
  };
  const sch = schoolFromSingleBitMask(misc);
  if (sch) buff.school = sch;
  state.effects.push(withHostile(buff, raw.targetA | 0, min) as SpellEffect);
  state.role = state.role || 'buff';

  // Expire special. Cite: :4170–4172.
  const expireCast = MOD_DMG_PCT_EXPIRE_CAST[state.spell.id | 0];
  if (expireCast != null) {
    state.intents.push({ kind: 'mod_damage_percent_done_expire', castSpellId: expireCast });
  }
  // The weapon-dependent path runs at equip time and has no interpret surface, and the magic percent
  // fields are gated on the magic school mask. Cite: SpellAuras.cpp:4115-4168.
}

// ── SPELL_AURA_PERIODIC_ENERGIZE (24) ── baked as a periodic power restore.
// Cite: SpellAuras.cpp:3119-3121 HandlePeriodicEnergize; PeriodicTick :4809-4852.
export function handlePeriodicEnergize(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // Handler body only arms m_isPeriodic. Cite: :3121.
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // Rage is stored ten times larger in spell data than the display units combat uses, so it is
  // converted here: Bloodrage ticks +1 display rage, not +10. Cite: Unit.h POWER_RAGE_DEFAULT.
  const power = raw.miscValue | 0;
  let amountPerTick = Math.max(1, min);
  if (power === POWER_RAGE) {
    amountPerTick = Math.max(1, Math.round(min / 10));
  }
  state.effects.push({
    kind: 'restore_power',
    amountPerTick,
    powerType: power,
    tickMs: (raw.amplitude | 0) || 1000,
    durationMs: dur,
  });
}

export function handleAddFlatModifier(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  pushAddModifierIntent(state, raw, 'add_flat_modifier');
}

export function handleAddPctModifier(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  pushAddModifierIntent(state, raw, 'add_pct_modifier');
}

// ── SPELL_AURA_MOD_HIT_CHANCE (54) ── baked as a hit buff; a player sums it into the per-hand weapon
// hit chances and an NPC into its own. Cite: SpellAuras.cpp:3850-3866; StatSystem.cpp:523-533.
export function handleModHitChance(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // Whole percentage points → BuffMod hit. Cite: schema BuffMod hit; characterRatings hitChance.
  const tagged = withHostile(
    { kind: 'buff' as const, mod: 'hit' as const, amount: min, durationMs: dur },
    raw.targetA | 0,
    min,
  );
  state.effects.push(tagged as SpellEffect);
  state.role = state.role || 'buff';
  const intent: InterpretIntent = {
    kind: 'mod_hit_chance',
    amount: min,
    durationMs: dur,
  };
  // Non-player flat path. Cite: :3860–3865.
  if (state.ctx.unitTargetIsPlayer === false) {
    intent.nonPlayerFlat = true;
  }
  // Player recompute + EquippedItemClass gate is SI5/runtime (weapon equip state).
  // Cite: StatSystem.cpp:527–531.
  state.intents.push(intent);
}

// ── SPELL_AURA_MOD_RESISTANCE_EXCLUSIVE (143) ── a per-school exclusive maximum against other auras of
// the same type, on the same bake surface as aura 22. Cite: SpellAuras.cpp:3314-3360.
export function handleModResistanceExclusive(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min, pointsPerComboPoint } = effectAmountRange(raw, state.ctx);
  // C++: if (!m_modifier.m_amount) return. Cite: :3316–3317.
  if (!min) return;

  const mask = raw.miscValue | 0;
  const dur = durationMsResolved(state);
  const tgtA = raw.targetA | 0;

  // Exclusivity is a runtime rule across co-active auras, so interpret emits this aura's amount and
  // the apply path enforces it. A zero mask falls back to armor, as the resistance bake does.
  if (!mask || (mask & SPELL_SCHOOL_MASK_NORMAL) !== 0) {
    const base = withPpc(
      { kind: 'buff' as const, mod: 'armor' as const, amount: min, durationMs: dur },
      pointsPerComboPoint,
    );
    state.effects.push(withHostile(base, tgtA, min) as SpellEffect);
  }
  for (let bit = 1; bit <= 6; bit++) {
    if ((mask & (1 << bit)) !== 0) {
      state.effects.push({ kind: 'resist', school: SCHOOLS[bit]!, amount: min });
    }
  }
}

// ── SPELL_AURA_MOD_CASTING_SPEED_NOT_STACK (65) ── baked as cast_haste, NOT haste: one shared scalar
// made Burning Adrenaline's 100000 a 1001x weapon speed. Cite: SpellAuras.cpp:3915-3920.
export function handleModCastingSpeedNotStack(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // Signed percent (Curse of Tongues negative). Cite: :3917–3919.
  const tagged = withHostile(
    { kind: 'buff' as const, mod: 'cast_haste' as const, amount: min, durationMs: dur },
    raw.targetA | 0,
    min,
  );
  state.effects.push(tagged as SpellEffect);
  state.role = state.role || 'buff';
  // NOT_STACK exclusivity is aura-stacking policy (SI5), not interpret amount.
}

// ── SPELL_AURA_MOD_MELEE_ATTACK_POWER_VERSUS (102) ── the misc value is a creature TYPE MASK, not an
// index, matched against the target's type. Cite: Unit.cpp:7475-7476; Unit.h:1432-1436.
export function handleModMeleeAttackPowerVersus(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  // misc = creature type mask (e.g. undead = 1<<(6-1) = 32). Cite: Unit.cpp:7476.
  const creatureTypeMask = raw.miscValue | 0;
  state.intents.push({
    kind: 'mod_melee_attack_power_versus',
    creatureTypeMask,
    amount: min,
    durationMs: dur,
  });
  // Play surface: consumable BuffMod + mask. Applied at damage time, not sheet AP.
  state.effects.push({
    kind: 'buff',
    mod: 'attack_power_versus',
    amount: min,
    durationMs: dur,
    creatureTypeMask,
  } as SpellEffect);
  state.role = state.role || 'buff';
}
