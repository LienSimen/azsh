/** SI2.5 / SI3 handlers — effects-core (split from handlers.ts, pure move). */

import type { RawSpellEffect, SpellEffect } from '../../../../data/schema.ts';
import { effectAmountRange, clampPositiveRange } from '../amount.ts';
import {
  SPELL_AURA_PERIODIC_DAMAGE,
  SPELL_AURA_PERIODIC_HEAL,
  SPELL_EFFECT_NORMALIZED_WEAPON_DMG,
} from '../opcodes.ts';
import type {
  HandlerState,
} from './shared.ts';
import {
  SPELLFAMILY_GENERIC,
  SPELLFAMILY_MAGE,
  SPELLFAMILY_WARRIOR,
  SPELLFAMILY_WARLOCK,
  SPELLFAMILY_PRIEST,
  SPELLFAMILY_DRUID,
  SPELLFAMILY_ROGUE,
  SPELLFAMILY_HUNTER,
  SPELLFAMILY_PALADIN,
  CLASS_ROGUE,
  METEOR_SPLIT_IDS,
  BLOODTHIRST_IDS,
  SHIELD_SLAM_IDS,
  IMMOLATE_FAMILY_FLAGS,
  CONFLAGRATE_FAMILY_FLAGS,
  FEROCIOUS_BITE_FLAGS,
  EVISCERATE_FLAGS,
  AMBUSH_FLAGS,
  SWIFTMEND_HOT_FLAGS,
  schoolOf,
  familyOf,
  flagsOf,
  iconIdOf,
  withPpc,
  trunc,
} from './shared.ts';
import { bloodthirstSelfAuraSpellId } from '../../cmangos-special-cases.ts';
// ── SPELL_EFFECT_SCHOOL_DAMAGE (2) ──────────────────────────────────────────
// Cite: SpellEffects.cpp:240–343 EffectSchoolDMG
export function handleSchoolDamage(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  // C++: if (unitTarget && unitTarget->IsAlive()). Bake-thin omits → always emit.
  // Cite: SpellEffects.cpp:242.
  if (state.ctx.unitTargetIsAlive === false) {
    state.intents.push({ kind: 'skip_effect', reason: 'SCHOOL_DAMAGE target not alive' });
    return;
  }

  const { min: baseMin, max: baseMax, pointsPerComboPoint } = effectAmountRange(raw, state.ctx);
  let min = baseMin;
  let max = baseMax;
  const spell = state.spell;
  const ctx = state.ctx;
  const fam = familyOf(spell);
  const flags = flagsOf(spell);
  const icon = iconIdOf(state);
  const id = spell.id | 0;

  // ── family / id specials (Classic bodies) ──
  switch (fam) {
    case SPELLFAMILY_GENERIC: {
      // Meteor-like: damage /= target count. Cite: SpellEffects.cpp:251–260.
      if (METEOR_SPLIT_IDS.has(id) && ctx.targetCount != null && ctx.targetCount > 0) {
        min = trunc(min / ctx.targetCount);
        max = trunc(max / ctx.targetCount);
      }
      // Thundercrash 25599: health/2, min 200 + threat. Cite: SpellEffects.cpp:263–269.
      if (id === 25599) {
        state.intents.push({ kind: 'threat_percent', percent: 100, target: 'unit' });
        if (ctx.targetHealth != null) {
          let dmg = trunc(ctx.targetHealth / 2);
          if (dmg < 200) dmg = 200;
          min = dmg;
          max = dmg;
        }
      }
      break;
    }
    case SPELLFAMILY_MAGE:
      break;
    case SPELLFAMILY_WARRIOR: {
      // Bloodthirst: damage = damage * AP / 100. Cite: SpellEffects.cpp:279–283.
      const isBloodthirst =
        BLOODTHIRST_IDS.has(id)
        || (icon === 38 && (flags & 0x2000000) !== 0);
      // Shield Slam: damage += block. Cite: SpellEffects.cpp:284–286.
      const isShieldSlam =
        SHIELD_SLAM_IDS.has(id)
        || (icon === 413 && (flags & 0x2000000) !== 0);

      if (isBloodthirst && ctx.attackPower != null) {
        min = trunc(min * ctx.attackPower / 100);
        max = trunc(max * ctx.attackPower / 100);
      } else if (isShieldSlam && ctx.shieldBlock != null) {
        min = min + (ctx.shieldBlock | 0);
        max = max + (ctx.shieldBlock | 0);
      }
      // Bloodthirst self-heal aura after school damage. Cite: Spell.cpp:1299–1314.
      // Track via state flag so we emit the aura after the damage row is pushed.
      if (isBloodthirst) {
        (state as { _bloodthirstAuraId?: number })._bloodthirstAuraId =
          bloodthirstSelfAuraSpellId(id);
      }
      break;
    }
    case SPELLFAMILY_WARLOCK: {
      // Conflagrate — consume caster's Immolate DoT. Cite: SpellEffects.cpp:291–306.
      if ((flags & CONFLAGRATE_FAMILY_FLAGS) !== 0) {
        let consumedId: number | undefined;
        if (ctx.targetAuras) {
          for (const a of ctx.targetAuras) {
            if (
              a.auraType === SPELL_AURA_PERIODIC_DAMAGE
              && a.casterIsSelf
              && (a.spellFamilyName ?? 0) === SPELLFAMILY_WARLOCK
              && ((a.spellFamilyFlags ?? 0) & IMMOLATE_FAMILY_FLAGS) !== 0
            ) {
              consumedId = a.spellId;
              break;
            }
          }
        }
        state.intents.push({
          kind: 'consume_aura',
          spellId: consumedId,
          spellFamilyName: SPELLFAMILY_WARLOCK,
          spellFamilyFlags: IMMOLATE_FAMILY_FLAGS,
          auraType: SPELL_AURA_PERIODIC_DAMAGE,
          casterOnly: true,
        });
      }
      break;
    }
    case SPELLFAMILY_DRUID: {
      // Ferocious Bite spends energy at the effect's multiplier plus attack power per combo point.
      // Cite: SpellEffects.cpp:311-320; the family flag is the finisher mask in the classic ranks.
      if ((flags & FEROCIOUS_BITE_FLAGS) !== 0) {
        if (ctx.energy != null) {
          const mult = ctx.dmgMultiplier ?? 1;
          const energyTerm = trunc(ctx.energy * mult);
          min += energyTerm;
          max += energyTerm;
          state.intents.push({ kind: 'zero_energy' });
        }
        if (ctx.attackPower != null && ctx.comboPoints != null && ctx.comboPoints > 0) {
          const apTerm = trunc(ctx.attackPower * 0.03 * ctx.comboPoints);
          min += apTerm;
          max += apTerm;
        }
      }
      break;
    }
    case SPELLFAMILY_ROGUE: {
      // Eviscerate: + AP * combo * 0.03. Cite: SpellEffects.cpp:325–331.
      // Also spell.comboApCoeff when bake stamped it (0.03).
      if ((flags & EVISCERATE_FLAGS) !== 0 || spell.comboApCoeff != null) {
        if (ctx.attackPower != null && ctx.comboPoints != null && ctx.comboPoints > 0) {
          const coeff = spell.comboApCoeff ?? 0.03;
          const apTerm = trunc(ctx.attackPower * ctx.comboPoints * coeff);
          min += apTerm;
          max += apTerm;
        }
      }
      break;
    }
    case SPELLFAMILY_HUNTER:
    case SPELLFAMILY_PALADIN:
    case SPELLFAMILY_PRIEST:
      break;
    default:
      break;
  }

  const clamped = clampPositiveRange(min, max);
  // TARGET_UNIT_CASTER with no chained targetB: the damage lands on the CASTER. 40 src_spell_template
  // rows are this shape and every one is a backfire, a misfire, a sacrifice or a health-for-mana
  // rune. Without the flag applySpell's friendly-fire guard swallowed all 40. Cite:
  // SpellTargetDefines.h TARGET_UNIT_CASTER = 1; SpellEffects.cpp EffectSchoolDMG unitTarget.
  const selfHit = (raw.targetA | 0) === 1 && (raw.targetB | 0) === 0;
  state.effects.push(
    withPpc(
      {
        kind: 'direct_damage',
        school: schoolOf(spell),
        min: clamped.min,
        max: clamped.max,
        ...(selfHit ? { hostile: false } : {}),
      },
      pointsPerComboPoint,
    ) as SpellEffect,
  );

  // Bloodthirst casts its own aura after the damage, so the trigger applies the 23885-family aura
  // when the companion row is in the kit — the same surface as the C++ cast.
  const btAura = ((state as { _bloodthirstAuraId?: number })._bloodthirstAuraId ?? 0) | 0;
  if (btAura) {
    state.intents.push({ kind: 'cast_triggered_spell', spellId: btAura });
    state.effects.push({ kind: 'trigger_spell', spellId: btAura } as SpellEffect);
  }
}

// ── SPELL_EFFECT_HEAL (10) ──────────────────────────────────────────────────
// Cite: SpellEffects.cpp:1831–1885 EffectHeal
export function handleHeal(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  // C++: if (unitTarget && unitTarget->IsAlive() && damage >= 0). Cite: :1833.
  if (state.ctx.unitTargetIsAlive === false) {
    state.intents.push({ kind: 'skip_effect', reason: 'HEAL target not alive' });
    return;
  }

  const { min: baseMin, max: baseMax } = effectAmountRange(raw, state.ctx);
  let min = baseMin;
  let max = baseMax;

  // Swiftmend 18562 — consume shortest Regrowth/Rejuvenation remaining ticks.
  // Cite: SpellEffects.cpp:1842–1877.
  if (state.spell.id === 18562) {
    const hots = (state.ctx.targetAuras ?? []).filter(
      (a) =>
        a.auraType === SPELL_AURA_PERIODIC_HEAL
        && (a.spellFamilyName ?? 0) === SPELLFAMILY_DRUID
        && ((a.spellFamilyFlags ?? 0) & SWIFTMEND_HOT_FLAGS) !== 0,
    );
    if (hots.length > 0) {
      let pick = hots[0]!;
      for (const h of hots) {
        const d = h.durationMs ?? Number.POSITIVE_INFINITY;
        const pd = pick.durationMs ?? Number.POSITIVE_INFINITY;
        if (d < pd) pick = h;
      }
      const tickheal = pick.amount | 0;
      const amp = ((pick.amplitudeMs ?? 0) | 0) || 1;
      // C++: tickcount = GetSpellDuration / EffectAmplitude (full spell duration, not remaining).
      // When only remaining duration is supplied, use it as the duration input (fixture pattern).
      const dur = pick.durationMs ?? 0;
      const tickcount = amp > 0 ? trunc(dur / amp) : 0;
      const bonus = tickheal * tickcount;
      min += bonus;
      max += bonus;
      state.intents.push({
        kind: 'consume_aura',
        spellId: pick.spellId,
        spellFamilyName: SPELLFAMILY_DRUID,
        spellFamilyFlags: SWIFTMEND_HOT_FLAGS,
        auraType: SPELL_AURA_PERIODIC_HEAL,
      });
    }
    // C++ returns early with no heal if no matching aura — without targetAuras we still
    // emit the base heal range (bake-thin / fixture without HoTs).
  }

  const clamped = clampPositiveRange(min, max);
  state.effects.push({ kind: 'heal', min: clamped.min, max: clamped.max });
}

// ── SPELL_EFFECT_ENERGIZE (30) ──────────────────────────────────────────────
// Cite: SpellEffects.cpp:2079–2124 EffectEnergize
export function handleEnergize(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  const power = raw.miscValue | 0;
  if (power < 0 || power >= 5 /* MAX_POWERS classic */) {
    return;
  }

  let { min, max } = effectAmountRange(raw, state.ctx);
  const id = state.spell.id | 0;
  const level = state.ctx.casterLevel;

  // Level-dependent scripts. Cite: SpellEffects.cpp:2092–2115.
  switch (id) {
    case 5530:
      // Warrior/rogue shared — rogue must not gain resource. Cite: :2094–2097.
      if (state.ctx.casterClass === CLASS_ROGUE) {
        state.intents.push({ kind: 'skip_effect', reason: '5530 Energize skipped for CLASS_ROGUE' });
        return;
      }
      break;
    case 9512: // Restore Energy — level_diff = level - 40, mult 2
      if (level != null) {
        const levelDiff = (level | 0) - 40;
        if (levelDiff > 0) {
          min -= 2 * levelDiff;
          max -= 2 * levelDiff;
        }
      }
      break;
    case 24571: // Blood Fury — level - 60, mult 10
      if (level != null) {
        const levelDiff = (level | 0) - 60;
        if (levelDiff > 0) {
          min -= 10 * levelDiff;
          max -= 10 * levelDiff;
        }
      }
      break;
    case 24532: // Burst of Energy — level - 60, mult 4
      if (level != null) {
        const levelDiff = (level | 0) - 60;
        if (levelDiff > 0) {
          min -= 4 * levelDiff;
          max -= 4 * levelDiff;
        }
      }
      break;
    default:
      break;
  }

  // C++: if (damage < 0) return;
  if (min < 0 && max < 0) return;
  if (min < 0) min = 0;
  if (max < 0) max = 0;

  const clamped = clampPositiveRange(min, max);
  state.effects.push({
    kind: 'energize',
    powerType: power,
    min: clamped.min,
    max: clamped.max,
  });
}

// ── SPELL_EFFECT_TRIGGER_SPELL (64) ─────────────────────────────────────────
// Cite: SpellEffects.cpp:1534–1643 EffectTriggerSpell
export function handleTriggerSpell(state: HandlerState, raw: RawSpellEffect, slot: number): void {
  let trig = raw.triggerSpell | 0;
  if (!trig) {
    state.effects.push({ kind: 'client_inform' });
    return;
  }

  // Special cases on *triggered* id. Cite: SpellEffects.cpp:1538–1563.
  switch (trig) {
    case 16630: {
      // Temporal Parasite #2 — DBC 101% but description 67%.
      // Draw: one rng() in [0,1) → roll = floor(rng * 101) equivalent to urand(0,100).
      if (state.ctx.rng) {
        const roll = Math.floor(state.ctx.rng() * 101); // 0..100
        if (roll >= 67) return;
      }
      // No rng → always fire (bake emits trigger unconditionally).
      break;
    }
    case 16631: {
      // Temporal Parasite #3 — 34%.
      if (state.ctx.rng) {
        const roll = Math.floor(state.ctx.rng() * 101);
        if (roll >= 34) return;
      }
      break;
    }
    case 23770:
      // Sayge's Dark Fortune — trigger spell does not exist. Cite: :1552–1554.
      state.effects.push({ kind: 'client_inform' });
      return;
    case 29284:
      // Brittle Armor — max stack via 24575. Cite: :1556–1558.
      trig = 24575;
      state.intents.push({ kind: 'max_stack_trigger', spellId: 24575 });
      break;
    case 29286:
      // Mercurial Shield — max stack via 26464. Cite: :1559–1562.
      trig = 26464;
      state.intents.push({ kind: 'max_stack_trigger', spellId: 26464 });
      break;
    default:
      break;
  }

  // Custom targeting after specials. Cite: SpellEffects.cpp:1608–1612.
  // Lash 6608: formal caster = unitTarget (not m_caster).
  if (trig === 6608) {
    state.intents.push({ kind: 'trigger_spell_as_unit_target', spellId: 6608 });
  }

  // Equipment gates (AttributesEx3 main/off-hand fit) are cast-time Unit/item graph — optional via ctx when
  // SI5 wires equipment. Bake-thin always emits. Cite: SpellEffects.cpp:1576–1605.

  state.effects.push({ kind: 'trigger_spell', spellId: trig });
}

// ── WEAPON_DAMAGE family (17 / 58 / 121) ────────────────────────────────────
// Cite: SpellEffects.cpp:3445–3565 EffectWeaponDmg (shared)
export function handleWeaponFlat(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  // C++: if (!unitTarget || !unitTarget->IsAlive()) return. Cite: :3447–3450.
  if (state.ctx.unitTargetIsAlive === false) {
    state.intents.push({ kind: 'skip_effect', reason: 'WEAPON_DAMAGE target not alive' });
    return;
  }

  const effect = raw.effect | 0;
  const { min } = effectAmountRange(raw, state.ctx);
  if (min > 0) {
    // Bake-thin: strikeBonus = max over flat slots. Cite: map-spell-effects.mjs:312–314.
    state.strikeBonus = Math.max(state.strikeBonus ?? 0, min);
    state.weapon.fixedBonus += min;
    state.weapon.sawFlat = true;
  }
  if (effect === SPELL_EFFECT_NORMALIZED_WEAPON_DMG) {
    state.weapon.normalized = true;
  }
  // Ambush detection once. Cite: SpellEffects.cpp:3482–3487.
  if (familyOf(state.spell) === SPELLFAMILY_ROGUE && (flagsOf(state.spell) & AMBUSH_FLAGS) !== 0) {
    state.weapon.ambush = true;
  }
  state.role = state.role || 'strike';
  // Stamp a 100% marker for a flat weapon-damage slot, replaced when a real percent co-slot fires.
  // Combat excludes this row as a rider. Cite: SpellEffects.cpp EffectWeaponDmg.
  if (!state.effects.some((e) => e.kind === 'weapon_percent_damage' && (e as { pct?: number }).pct === 100)) {
    state.effects.push({ kind: 'weapon_percent_damage', pct: 100 });
  }
}

// ── SPELL_EFFECT_WEAPON_PERCENT_DAMAGE (31) ─────────────────────────────────
// Cite: SpellEffects.cpp:3509–3516; map-spell-effects.mjs:316–320
export function handleWeaponPercent(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const pct = Math.max(1, min);
  // Replace flat-slot 100% census marker so consumers see the true co-slot pct.
  const markerIdx = state.effects.findIndex(
    (e) => e.kind === 'weapon_percent_damage' && (e as { pct?: number }).pct === 100,
  );
  if (markerIdx >= 0) state.effects.splice(markerIdx, 1);
  state.effects.push({ kind: 'weapon_percent_damage', pct });
  state.weapon.weaponPercentMod *= pct / 100;
  state.weapon.sawPercent = true;
  if (familyOf(state.spell) === SPELLFAMILY_ROGUE && (flagsOf(state.spell) & AMBUSH_FLAGS) !== 0) {
    state.weapon.ambush = true;
  }
  state.role = state.role || 'strike';
}
