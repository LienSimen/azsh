// Peeled from createSession (Wave 4 createSession.md P6) — pattern (D).
// spend/canAfford, leave/enter form, stealth, rage/regen, combo, rollHeal.

import type { CombatContext } from './context.ts';
import type { Fighter } from './types.ts';
import type { PowerType, ShapeshiftFormId, SpellDef } from '../../data/schema.ts';
import {
  formAttackTimeMs, formIdFromSpell, formPowerType, formResourceMax, formResourceOnEnter,
  formBreaksRootAndSlow, formZerosPoolOnEnter,
  isFormSpell, isMobilityFormSpellId, isMobilityTravelForm, MOBILITY_FORM_SPELL_IDS,
  isStealthShapeshift, isWarriorStance,
  resolveSpellCost, FORM_LABEL, resolveMeleeWeaponDamageRange,
} from '../../domain/character/forms.ts';
import {
  AURA_INTERRUPT, canUseBehindAbility, totalStealthStrength,
} from '../../domain/spells/stealth.ts';
import { SHAPESHIFT_FORM } from '../../data/schema.ts';
import { ENERGY_MAX, RAGE_MAX } from '../../domain/core/ids.ts';
import {
  FUROR_BEAR_RAGE, FUROR_CAT_ENERGY, furorChancePct,
} from '../spells/interpreter/class-scripts-kit.ts';
import {
  TUNING, rollBetween, scaleTime,
  updateManaRegen,
  petCombatManaRegenAmount,
  octRegenHpPerSpirit,
  rageDecayAmount,
  LAST_MANA_USE_MS,
} from './formulas.ts';
import { fighterIsInCombat } from './combatFlag.ts';
import {
  clearFormCombatBonuses,
  applyFormCombatEnter,
} from './fighterFactory.ts';
import { unitHasOverrideScript, stanceRetainedRage } from '../spells/overrideClassScripts.ts';
import { isAllySide, isEnemySide, isPlayerCharacterSide } from '../core/events.ts';
import { lookupHighestLearnedStealth } from '../spells/interpreter/class-scripts-kit.ts';
import {
  SPELL_ATTR_EX, hasAttrEx,
  SPELL_ATTR_EX2, hasAttrEx2, powerRefundOnMiss,
} from '../spells/spellAttributes.ts';

/** Unit.h:1005 REGEN_TIME_FULL — the period Player::Update hands RegenerateAll. */
const REGEN_TIME_FULL_MS = 2000;

export function installPowerForm(ctx: CombatContext): void {
  const effects = ctx.effects;

  // Roll a heal with the live modifiers: a healing percent scales the value and an armed guaranteed
  // crit multiplies it. Only the base roll consumes RNG, so an unbuffed heal is byte-identical.
  const rollHeal = (healer: Fighter, min: number, max: number): { amount: number; crit: boolean } => {
    let amt = rollBetween(min, max, ctx.rng.next());
    if (healer.healingPct) amt *= (1 + healer.healingPct / 100);
    const crit = (healer.castCritAdd ?? 0) > 0;
    if (crit) amt *= TUNING.spellCritMult;
    return { amount: Math.round(amt), crit };
  };

  // `spell` is read for one thing: the attribute that skips the last-mana-use stamp, so Life Tap and
  // Dark Pact do not start the five-second rule. Cite: SpellDefines.h:127; Spell.cpp TakePower.
  const spend = (f: Fighter, amount: number, pt?: PowerType, spell?: SpellDef): void => {
    if (amount <= 0) return;
    const powerKind = pt ?? f.spec.powerType;
    const stampManaUse = !hasAttrEx2(spell, SPELL_ATTR_EX2.DONT_BLOCK_MANA_REGEN);
    // POWER_HEALTH (Bloodrage): ModifyHealth(-cost). Cite: Spell.cpp TakePower :4280–4282.
    if (powerKind === 'health') {
      const before = f.hp;
      f.hp = Math.max(0, f.hp - amount);
      if (f.hp !== before) {
        ctx.push({ t: ctx.t, kind: 'resource', actor: f.side, power: 'health', value: Math.round(f.hp), delta: f.hp - before });
      }
      return;
    }
    // Mana spends from the parallel mana pool when the active form resource is rage/energy.
    if (powerKind === 'mana' && f.spec.powerType !== 'mana') {
      const before = f.mana;
      f.mana = Math.max(0, f.mana - amount);
      if (f.mana !== before) {
        // Unit.h SetLastManaUse — 5-second rule starts on mana expenditure.
        if (stampManaUse) f.lastManaUseAt = ctx.t;
        ctx.push({ t: ctx.t, kind: 'resource', actor: f.side, power: 'mana', value: Math.round(f.mana), delta: f.mana - before });
      }
      return;
    }
    f.power = Math.max(0, f.power - amount);
    if (powerKind === 'mana' && stampManaUse) f.lastManaUseAt = ctx.t;
    ctx.push({ t: ctx.t, kind: 'resource', actor: f.side, power: powerKind, value: Math.round(f.power), delta: -amount });
  };

  // DISCOUNT_POWER_ON_MISS, on 179 playable rows: a miss, dodge, parry or deflect refunds 80% of the
  // cost, while a block, resist or immune refunds nothing. The five-second rule is not unwound.
  const refundPowerOnMiss = (
    f: Fighter,
    spell: SpellDef,
    outcome: string,
  ): void => {
    const back = powerRefundOnMiss(spell, spellCost(f, spell), outcome);
    if (back <= 0) return;
    const powerKind = spell.powerType ?? f.spec.powerType;
    if (powerKind === 'health') {
      const before = f.hp;
      f.hp = Math.min(f.spec.maxHealth, f.hp + back);
      if (f.hp !== before) {
        ctx.push({ t: ctx.t, kind: 'resource', actor: f.side, power: 'health', value: Math.round(f.hp), delta: f.hp - before });
      }
      return;
    }
    if (powerKind === 'mana' && f.spec.powerType !== 'mana') {
      const before = f.mana;
      f.mana = Math.min(f.maxMana || f.spec.maxPower, f.mana + back);
      if (f.mana !== before) {
        ctx.push({ t: ctx.t, kind: 'resource', actor: f.side, power: 'mana', value: Math.round(f.mana), delta: f.mana - before });
      }
      return;
    }
    const before = f.power;
    f.power = Math.min(f.spec.maxPower, f.power + back);
    if (f.power !== before) {
      ctx.push({ t: ctx.t, kind: 'resource', actor: f.side, power: powerKind, value: Math.round(f.power), delta: f.power - before });
    }
  };

  /** Effective cast cost (flat or ManaCostPercentage × createMana/createHealth). */
  const spellCost = (f: Fighter, spell: SpellDef): number => {
    if (hasAttrEx(spell, SPELL_ATTR_EX.USE_ALL_MANA)) {
      if (spell.powerType === 'health') return f.hp;
      if (spell.powerType === 'mana' && f.spec.powerType !== 'mana' && f.maxMana > 0) return f.mana;
      return f.power;
    }
    const base = resolveSpellCost(
      spell,
      f.createMana || f.maxMana || f.spec.maxPower,
      f.createHealth || f.spec.createHealth || 0,
      f.spec.level | 0,
    );
    // Auras 73 / 72 by spell school: (base + flat) × (1 + pct/100), clamped at 0.
    // Cite: Spell.cpp:6358, :6368 CalculatePowerCost.
    const school = spell.school;
    const flat = school ? (f.powerCostFlatBySchool[school] ?? 0) : 0;
    const pct = school ? (f.powerCostPctBySchool[school] ?? 0) : 0;
    if (!flat && !pct) return base;
    return Math.max(0, Math.trunc((base + flat) * (1 + pct / 100)));
  };

  /** Whether the fighter can pay for this spell (respecting mana-vs-form resource). */
  const canAffordSpell = (f: Fighter, spell: SpellDef): boolean => {
    const cost = spellCost(f, spell);
    if (cost <= 0) return true;
    // POWER_HEALTH: CheckPower requires GetHealth() > cost. Cite: Spell.cpp:6383–6387.
    if (spell.powerType === 'health') return f.hp > cost;
    // Multi-power druids spend the parallel mana pool while shifted for a form cost or a mana spell.
    // Pets and single-power fighters still pay from the one bar even if a fixture labels it mana.
    const wantsMana = spell.powerType === 'mana' || isFormSpell(spell) || !!spell.costPct;
    if (wantsMana && f.spec.powerType !== 'mana' && f.maxMana > 0) {
      return f.mana >= cost;
    }
    // Form abilities that spend rage/energy need that power type active.
    if ((spell.powerType === 'energy' || spell.powerType === 'rage') && f.spec.powerType !== spell.powerType) {
      return false;
    }
    return f.power >= cost;
  };

  // Leave form to humanoid and, for a druid, back to mana. Stealth only clears the stance bit and keeps
  // energy or rage, since a rogue's stealth is not a mana form.
  const formSpellIdOf = (f: Fighter, form: ShapeshiftFormId): number => {
    if (f.formSpellId) return f.formSpellId;
    if (form) {
      const kit = (f.spec.spells ?? []).find((s) => isFormSpell(s) && formIdFromSpell(s) === form);
      if (kit) return kit.id;
    }
    for (const s of f.spec.spells ?? []) {
      if (isFormSpell(s) && isMobilityTravelForm(formIdFromSpell(s)) && f.buffActive.has(s.id)) {
        return s.id;
      }
    }
    for (const id of f.buffActive) if (isMobilityFormSpellId(id)) return id;
    return 0;
  };

  const leaveForm = (f: Fighter): void => {
    const was = f.form;
    const wasSpell = formSpellIdOf(f, was);
    if (!was && !wasSpell) return;
    f.form = 0;
    f.spec.form = 0;
    f.formSpellId = 0;
    if (wasSpell) f.buffActive.delete(wasSpell);
    for (const id of [...f.buffActive]) {
      if (isMobilityFormSpellId(id)) f.buffActive.delete(id);
    }
    if (isStealthShapeshift(was)) {
      // Stealth stance only — power type unchanged. Aura clear is breakStealth's job when linked.
      ctx.push({ t: ctx.t, kind: 'form', actor: f.side, form: 0, name: 'Stealth' });
      return;
    }
    // Drop form package + Cat AGI AP (HandleShapeshiftBoosts remove + form flag off).
    clearFormCombatBonuses(f);
    // Restore gear weapon speed and damage bands.
    f.spec.weapon = {
      ...f.spec.weapon,
      speedMs: f.baseWeaponSpeedMs,
      dmgMin: f.baseWeaponDmgMin,
      dmgMax: f.baseWeaponDmgMax,
    };
    // Re-arm OH timer if dual-wield gear is still on the spec (forms suppress OH only).
    if (f.spec.dualWield && f.spec.offhand) {
      f.ohSwingReadyAt = ctx.t + Math.floor(scaleTime(f.spec.offhand.speedMs, f.haste, 0) / 2);
    }
    // A multi-power druid leaving a form takes mana from the parallel pool, detected by max mana since
    // a fixture may carry no class id. A warrior stance is rage with no parallel pool, so rage stays.
    const wasFormPt = formPowerType(was);
    if (wasFormPt !== 'mana' && f.maxMana > 0) {
      f.spec.powerType = 'mana';
      f.spec.maxPower = f.maxMana;
      f.power = f.mana;
      ctx.push({ t: ctx.t, kind: 'form', actor: f.side, form: 0, name: 'Caster Form' });
      ctx.push({ t: ctx.t, kind: 'resource', actor: f.side, power: 'mana', value: Math.round(f.power), delta: 0 });
    } else {
      // Keep current powerType + power (warrior stance off, etc.).
      ctx.push({ t: ctx.t, kind: 'form', actor: f.side, form: 0, name: FORM_LABEL[was] ? `leave ${FORM_LABEL[was]}` : 'leave form' });
    }
    ctx.push({ t: ctx.t, kind: 'flavor', text: `${f.spec.name} leaves ${FORM_LABEL[was] || 'form'}.` });
    // Tear down the rows the form spell itself owns, its permanent mechanic immunity above all. Now
    // that permanent means permanent, clearing only the buff flag would leave that immunity forever.
    if (wasSpell) ctx.removeAurasDueToSpell?.(f, wasSpell);
    for (const id of MOBILITY_FORM_SPELL_IDS) {
      if (id !== wasSpell) ctx.removeAurasDueToSpell?.(f, id);
    }
  };

  // Enter a form, or toggle it off when already in it, switching power type per Classic rules. Stealth
  // changes neither power nor weapon speed. Cat re-syncs its agility AP on entry.
  const enterForm = (f: Fighter, form: ShapeshiftFormId, spellName: string, spellId = 0): void => {
    if (f.form === form) {
      // KI-518 warrior no-op; else toggle leave (stealth drops aura). Cite: HandleAuraModShapeshift.
      if (isWarriorStance(form)) { if (spellId) f.buffActive.add(spellId); return; }
      if (isStealthShapeshift(form) && f.stealthed) breakStealth(f, 'toggle'); else leaveForm(f);
      return;
    }
    // Switching forms strips the previous package before entering the new one. Power type is only
    // written when it actually changes, so a same-resource swap keeps the bar.
    const prevPt = f.spec.powerType;
    if (f.form && !isStealthShapeshift(form)) {
      if (isStealthShapeshift(f.form)) {
        f.form = 0;
        f.spec.form = 0;
        f.formSpellId = 0;
      } else {
        const wasForm = f.form;
        const wasSpell = f.formSpellId;
        const sameResource = formPowerType(wasForm) === formPowerType(form);
        if (sameResource) {
          // Stance dance / same-pool form swap: clear package + chip, keep power pool.
          clearFormCombatBonuses(f);
          if (wasSpell) f.buffActive.delete(wasSpell);
          f.form = 0;
          f.spec.form = 0;
          f.formSpellId = 0;
          f.spec.weapon = {
            ...f.spec.weapon,
            speedMs: f.baseWeaponSpeedMs,
            dmgMin: f.baseWeaponDmgMin,
            dmgMax: f.baseWeaponDmgMax,
          };
          // Same teardown leaveForm does — this branch skips it (Bear -> Dire Bear is rage to
          // rage), and each form carries its OWN permanent immunity row under its own spell id.
          if (wasSpell) ctx.removeAurasDueToSpell?.(f, wasSpell);
          ctx.push({ t: ctx.t, kind: 'form', actor: f.side, form: 0, name: FORM_LABEL[wasForm] || 'form' });
        } else {
          leaveForm(f);
        }
      }
    }
    // Snapshot mana if currently on mana as active power (druid forms).
    if (!isStealthShapeshift(form) && f.spec.powerType === 'mana') f.mana = f.power;

    f.form = form;
    f.spec.form = form;
    f.formSpellId = spellId | 0;
    // Stance / form shows on the buff bar (same as aspects / until-cancelled auras).
    if (spellId) f.buffActive.add(spellId);

    // Cite: SpellAuras.cpp:1915-1917 HandleAuraModShapeshift apply
    // target->SetShapeshiftForm(form);
    // target->RemoveAurasWithInterruptFlags(AURA_INTERRUPT_FLAG_SHAPESHIFTING);
    ctx.removeAurasWithInterruptFlags?.(f, AURA_INTERRUPT.SHAPESHIFTING, 'shapeshift');

    if (isStealthShapeshift(form)) {
      // Stance bit only — keep energy/rage/mana as-is.
      const label = FORM_LABEL[form] || spellName;
      ctx.push({ t: ctx.t, kind: 'form', actor: f.side, form, name: label });
      ctx.push({ t: ctx.t, kind: 'aura', actor: f.side, name: spellName, applied: true });
      return;
    }

    // Shifting strips root and snare - the IR resolved `removeRootAndSlow` for these seven
    // forms and nothing read it. Cite: SpellAuras.cpp:1803-1841 HandleAuraModShapeshift.
    if (formBreaksRootAndSlow(form)) {
      ctx.breakControl?.(f, 'root');
      ctx.breakControl?.(f, 'snare');
    }

    const pt = formPowerType(form);
    f.spec.powerType = pt;
    if (pt === 'mana') {
      f.spec.maxPower = f.maxMana > 0 ? f.maxMana : f.spec.maxPower;
      f.power = f.mana;
    } else {
      const max = formResourceMax(pt) || (pt === 'energy' ? ENERGY_MAX : RAGE_MAX);
      f.spec.maxPower = max;
      // SetPowerType only resets when the *power type* changes (energy full / rage 0). A same-pool swap
      // keeps the pool here; the stance cap below is a separate step. Cite: Unit.cpp SetPowerType.
      if (prevPt !== pt) {
        const start = formResourceOnEnter(pt);
        f.power = start >= 0 ? start : f.power;
      } else {
        f.power = Math.min(max, f.power);
      }
    }
    // Cat, Bear and Dire Bear zero the pool on APPLY whatever the previous type was — that is the
    // shapeshift handler's own reset, which is why a Bear to Dire Bear swap kept its rage.
    if (formZerosPoolOnEnter(form)) {
      f.power = 0;
      const furorPct = furorChancePct(f.spec.spells);
      if (furorPct > 0 && ctx.rng.chance(furorPct / 100)) {
        const gain = form === SHAPESHIFT_FORM.CAT ? FUROR_CAT_ENERGY : FUROR_BEAR_RAGE;
        f.power = Math.min(f.spec.maxPower, gain);
      }
    }
    // Entering any warrior stance caps rage at what Tactical Mastery keeps, 0 without it.
    // Cite: SpellAuras.cpp:1870–1907 case FORM_BATTLESTANCE/DEFENSIVESTANCE/BERSERKERSTANCE.
    if (isWarriorStance(form)) {
      const keep = stanceRetainedRage((scriptId) => unitHasOverrideScript(f, scriptId));
      if (f.power > keep) f.power = keep;
    }
    const atk = formAttackTimeMs(form);
    if (atk > 0) {
      const dmgRange = resolveMeleeWeaponDamageRange(form, f.spec.level, f.baseWeaponDmgMin, f.baseWeaponDmgMax, atk);
      f.spec.weapon = { ...f.spec.weapon, speedMs: atk, dmgMin: dmgRange.min, dmgMax: dmgRange.max };
    } else {
      f.spec.weapon = {
        ...f.spec.weapon,
        speedMs: f.baseWeaponSpeedMs,
        dmgMin: f.baseWeaponDmgMin,
        dmgMax: f.baseWeaponDmgMax,
      };
    }
    // Form package + mid-fight Cat AGI AP (sheet agility snapshot).
    applyFormCombatEnter(f, form);
    f.swingReadyAt = ctx.t; // reset swing on form change (matches form weapon equip feel)
    f.pendingSwing = null; // clear armed next-swing (can't use Maul out of bear mid-arm)
    const label = FORM_LABEL[form] || spellName;
    ctx.push({ t: ctx.t, kind: 'form', actor: f.side, form, name: label });
    ctx.push({ t: ctx.t, kind: 'resource', actor: f.side, power: pt, value: Math.round(f.power), delta: 0 });
    ctx.push({ t: ctx.t, kind: 'aura', actor: f.side, name: spellName, applied: true });
  };

  const stealthStrengthOf = (f: Fighter): number =>
    totalStealthStrength(f.stealthAuraStrength, f.stealthLevelBonus);

  /** Enter MOD_STEALTH (and optional FORM_STEALTH via paired shapeshift effect). */
  const applyStealth = (
    f: Fighter,
    strength: number,
    durationMs: number,
    breakFlags: number | undefined,
    spell: SpellDef,
  ): void => {
    // Cite: SpellAuras.cpp:2572
    ctx.removeAurasWithInterruptFlags?.(f, AURA_INTERRUPT.STEALTH_INVIS_CANCELS, 'stealth invis cancels');
    f.stealthed = true;
    f.stealthAuraStrength = Math.max(0, strength | 0);
    f.stealthBreakFlags = breakFlags
      ?? (AURA_INTERRUPT.DAMAGE | AURA_INTERRUPT.ACTION | AURA_INTERRUPT.ATTACKING);
    f.stealthSpellId = spell.id;
    // Stealthed and FORM_STEALTH are one fact: fighterFactory.ts:813 seeds the form for a seat that
    // opens stealthed and breakStealth clears it, so the way back in stamps it too (KI-1070).
    if (!f.form) {
      f.form = SHAPESHIFT_FORM.STEALTH;
      f.spec.form = SHAPESHIFT_FORM.STEALTH;
      ctx.push({ t: ctx.t, kind: 'form', actor: f.side, form: SHAPESHIFT_FORM.STEALTH, name: 'Stealth' });
    }
    f.autoAttackEnabled = false; // CANCELS_AUTO_ATTACK on stealth enter
    f.pendingSwing = null;
    f.buffActive.add(spell.id);
    const expires = durationMs > 0 ? ctx.t + durationMs : Number.POSITIVE_INFINITY;
    effects.push({
      kind: 'buff', source: f.side, target: f.side, spellId: spell.id, name: spell.name,
      expiresAt: expires,
    });
    ctx.push({ t: ctx.t, kind: 'aura', actor: f.side, name: spell.name, applied: true });
    ctx.push({ t: ctx.t, kind: 'flavor', text: `${f.spec.name} enters stealth (${stealthStrengthOf(f)} strength).` });
  };

  const castHighestStealthRank = (caster: Fighter): void => {
    // Cite: Rogue.cpp:61–77 CastHighestStealthRank — player-only, RemoveSpellCooldown, CastSpell triggered.
    if (!isPlayerCharacterSide(caster.side)) return;
    const st = lookupHighestLearnedStealth(caster.spec.spells, ctx.spellChainOf);
    if (!st) return;
    caster.cooldowns.delete(st.id);
    if (st.category != null) caster.categoryCooldowns.delete(st.category);
    caster.deferredCooldowns?.delete(st.id);
    const se = st.effects.find((e) => e.kind === 'stealth');
    if (se && se.kind === 'stealth') {
      applyStealth(caster, se.strength, se.durationMs, se.breakFlags, st);
    }
  };

  /** Strip stealth aura + FORM_STEALTH stance. Reason is for flavor only. */
  const breakStealth = (f: Fighter, reason: string): void => {
    if (!f.stealthed && !isStealthShapeshift(f.form)) return;
    const was = f.stealthed;
    f.stealthed = false;
    f.stealthAuraStrength = 0;
    const sid = f.stealthSpellId;
    f.stealthSpellId = 0;
    if (sid) {
      f.buffActive.delete(sid);
      for (const e of ctx.effectsOn(f.side)) {
        if (e.kind === 'buff' && e.spellId === sid) {
          e.expiresAt = Math.min(e.expiresAt, ctx.t);
          ctx.touchEffect(e);
        }
      }
    }
    if (isStealthShapeshift(f.form)) {
      f.form = 0;
      f.spec.form = 0;
      f.formSpellId = 0;
      ctx.push({ t: ctx.t, kind: 'form', actor: f.side, form: 0, name: 'Stealth' });
    }
    // Enter cancelled AA (CANCELS_AUTO_ATTACK); break restores so whites/AI can resume (KI-825).
    f.autoAttackEnabled = true;
    if (was) {
      ctx.push({ t: ctx.t, kind: 'aura', actor: f.side, name: 'Stealth', applied: false });
      ctx.push({ t: ctx.t, kind: 'flavor', text: `${f.spec.name}'s stealth breaks (${reason}).` });
    }
  };

  const maybeBreakStealthOn = (f: Fighter, flag: number, reason: string): void => {
    if (!f.stealthed) return;
    if ((f.stealthBreakFlags & flag) !== 0) breakStealth(f, reason);
  };

  // The real arc test when this session has geometry, and only then the old non-spatial proxy. The
  // proxy stood in for a position; with real coordinates the arc IS the rule and Backstab refuses.
  const behindOk = (caster: Fighter, target: Fighter): boolean => {
    // Stealth is where the approach happens, and this session has no pre-pull position to pick an
    // angle from. Without this clause every stealth opener is unreachable outside a group.
    if (caster.stealthed) return true;
    const arc = ctx.facingTargetsBack?.(caster, target);
    if (arc != null) return arc;
    return canUseBehindAbility({
      casterStealthed: caster.stealthed,
      targetStunned: target.stunnedUntil > ctx.t,
      targetIncapacitated: target.incapUntil > ctx.t,
      // Solo 1v1: mob faces the player once combat started. Group threat "no aggro on me" is future.
      targetHasAggroOnCaster: caster.side === 'player' || isAllySide(caster.side) || isEnemySide(caster.side),
    });
  };

  const gainRage = (f: Fighter, amount: number): void => {
    if (f.spec.powerType !== 'rage' || amount <= 0) return;
    const before = f.power;
    f.power = Math.min(f.spec.maxPower, f.power + amount);
    if (f.power !== before) ctx.push({ t: ctx.t, kind: 'resource', actor: f.side, power: 'rage', value: Math.round(f.power), delta: f.power - before });
  };
  // SPELL_AURA_INTERRUPT_REGEN (94) holds rage while it is up. Read off the aura row, not a name
  // list; in 1.12 it is Enrage 5229 and Bloodrage 29131. Cite: Player.cpp:2301.
  const interruptsRegenMemo = new Map<number, boolean>();
  const spellInterruptsRegen = (id: number): boolean => {
    const hit = interruptsRegenMemo.get(id);
    if (hit !== undefined) return hit;
    const sp = ctx.spellOf?.(id);
    const yes = (sp?.effects ?? []).some((e) => e.kind === 'interrupt_regen')
      || (sp?.rawEffects ?? []).some((r) => (r.auraName | 0) === 94);
    interruptsRegenMemo.set(id, yes);
    return yes;
  };
  // Rage DECAYS out of combat, 1.25 a second. Only the world rest path did this, so on the endless
  // floor a warrior held its last pull's rage all run. Cite: Player.cpp:2294-2310, :2322-2344.
  const regenRage = (f: Fighter, dt: number): void => {
    if (f.spec.powerType !== 'rage' || f.power <= 0 || dt <= 0) return;
    if (fighterIsInCombat(f, ctx.t)) { f.rageDecayAccMs = 0; return; }
    for (const id of f.buffActive) if (spellInterruptsRegen(id)) return;
    // On the C++ CADENCE (Player.cpp:1517), not per tick: 2000 ms is exactly 2.5 rage, where 0.25
    // every 200 ms lost 0.2 a step to tenth-rounding — 4 rage over 4 s instead of 5.
    f.rageDecayAccMs += dt;
    if (f.rageDecayAccMs < REGEN_TIME_FULL_MS) return;
    const periods = Math.floor(f.rageDecayAccMs / REGEN_TIME_FULL_MS);
    f.rageDecayAccMs -= periods * REGEN_TIME_FULL_MS;
    const lost = rageDecayAmount(periods * REGEN_TIME_FULL_MS);
    if (lost <= 0) return;
    const before = f.power;
    f.power = Math.max(0, Math.round((f.power - lost) * 10) / 10);
    if (f.power !== before) ctx.push({ t: ctx.t, kind: 'resource', actor: f.side, power: 'rage', value: Math.round(f.power), delta: f.power - before });
  };
  /** Creature::RegenerateAll period. Cite: Unit.h:1006 REGEN_TIME_FULL_UNIT 5000. */
  const CREATURE_REGEN_PERIOD_MS = 5000;
  /** Creature.h:427 REGEN_FLAG_POWER_IN_COMBAT, and the 14 that 10,350 of 10,384 rows carry. */
  const REGEN_FLAG_POWER_IN_COMBAT = 0x4;
  const CREATURE_REGEN_DEFAULT = 14;

  // One chunk per period, never a trickle: 20 energy per 2 s player period, 20 per 5 s creature one.
  // Cite: Player.cpp:1517-1519,:2345-2356; Creature.cpp:786-798,:831-833.
  const regenEnergy = (f: Fighter, dt: number): void => {
    if (f.spec.powerType !== 'energy' || dt <= 0) return;
    const creature = (f.spec.classId ?? 0) <= 0;
    const period = creature ? CREATURE_REGEN_PERIOD_MS : REGEN_TIME_FULL_MS;
    // The timer runs while the bar is full, so a spend never re-starts the beat.
    f.energyAccMs += dt;
    const periods = Math.floor(f.energyAccMs / period);
    if (periods <= 0) return;
    // RegenerateAll(m_regenTimer / 100 * 100): the player spends whole 100 ms quanta, keeps the rest.
    const quanta = creature ? periods * 20 : Math.floor(f.energyAccMs / 100);
    f.energyAccMs -= creature ? periods * period : quanta * 100;
    if (f.power >= f.spec.maxPower) return;
    if (creature && ((f.spec.regenerateStats ?? CREATURE_REGEN_DEFAULT) & REGEN_FLAG_POWER_IN_COMBAT) === 0) return;
    // curValue += uint32(addvalue): aura 110 scales the amount, and the sum truncates.
    const add = Math.trunc(quanta * (1 + (f.energyRegenPctMod ?? 0) / 100));
    if (add <= 0) return;
    const before = f.power;
    f.power = Math.min(f.spec.maxPower, f.power + add);
    if (f.power !== before) {
      ctx.push({ t: ctx.t, kind: 'resource', actor: f.side, power: 'energy', value: Math.round(f.power), delta: f.power - before });
    }
  };
  // Mana regen: whole-second quanta at the interrupted rate while inside the five-second rule and the
  // full rate outside it. A PET uses the creature branch, never the player class path.

  const regenMana = (f: Fighter, dt: number): void => {
    if (dt <= 0) return;

    // Pet mana path — separate from player classId OCT (classId is null on pets).
    if (f.side === 'pet' && f.spec.powerType === 'mana' && f.spec.maxPower > 0) {
      if (f.power >= f.spec.maxPower) return;
      f.manaAccMs += dt;
      const periods = Math.floor(f.manaAccMs / TUNING.focusRegenPeriodMs);
      if (periods <= 0) return;
      f.manaAccMs -= periods * TUNING.focusRegenPeriodMs;
      // lastManaUseAt === -1 means never spent (same 5SR gate as player path).
      const under5sr = f.lastManaUseAt >= 0 && (ctx.t - f.lastManaUseAt) < LAST_MANA_USE_MS;
      if (under5sr) return;
      // Pet mana regen: petCombatManaRegenAmount using intellect + spirit + classId
      // fed into CombatantSpec from pet_levelstats + creature scaling. Cite: Unit.cpp:11886.
      const add = petCombatManaRegenAmount(
        periods * TUNING.focusRegenPeriodMs,
        f.spec.intellect ?? 0,
        f.spec.spirit ?? 0,
        f.spec.classId,
      );
      if (add <= 0) return;
      const before = f.power;
      f.power = Math.min(f.spec.maxPower, f.power + add);
      if (f.power !== before) {
        ctx.push({ t: ctx.t, kind: 'resource', actor: f.side, power: 'mana', value: Math.round(f.power), delta: f.power - before });
      }
      return;
    }

    // Creature mana, the same shape as the pet path above: RegenerateAll every 5 s, and POWER regen
    // is not gated on being out of combat the way health is. Cite: Creature.cpp:786-798,:800-830.
    if ((f.spec.classId ?? 0) <= 0 && f.spec.powerType === 'mana' && f.spec.maxPower > 0) {
      // RegenerateStats & REGEN_FLAG_POWER_IN_COMBAT. 20 of 10,384 rows clear it — Shade of Hakkar
      // and the AQ40 entries drink their pool once. Cite: Creature.cpp:1803-1808; Creature.h:427.
      if (((f.spec.regenerateStats ?? CREATURE_REGEN_DEFAULT) & REGEN_FLAG_POWER_IN_COMBAT) === 0) return;
      if (f.power >= f.spec.maxPower) return;
      f.manaAccMs += dt;
      const periods = Math.floor(f.manaAccMs / CREATURE_REGEN_PERIOD_MS);
      if (periods <= 0) return;
      f.manaAccMs -= periods * CREATURE_REGEN_PERIOD_MS;
      // SetLastManaUse holds it off for 5 s. Cite: Unit.h:2216; Spell.cpp:4298.
      if (f.lastManaUseAt >= 0 && (ctx.t - f.lastManaUseAt) < LAST_MANA_USE_MS) return;
      // The non-pet fallback the moment sqrt(intellect) * OCTRegenMPPerSpirit() is 0, which it is for
      // a creature with no baked spirit: (maxMana / 20) / 5 x timerMultiplier 5. Cite: Creature.cpp:824.
      const add = periods * Math.trunc(f.spec.maxPower / 20);
      if (add <= 0) return;
      const before = f.power;
      f.power = Math.min(f.spec.maxPower, f.power + add);
      if (f.power !== before) {
        ctx.push({ t: ctx.t, kind: 'resource', actor: f.side, power: 'mana', value: Math.round(f.power), delta: f.power - before });
      }
      return;
    }

    const classId = f.spec.classId;
    if (classId == null || classId <= 0) return;
    const parallel = f.spec.powerType !== 'mana' && f.maxMana > 0;
    const usesPrimaryMana = f.spec.powerType === 'mana' && f.spec.maxPower > 0;
    if (!parallel && !usesPrimaryMana) return;
    const maxM = usesPrimaryMana ? f.spec.maxPower : f.maxMana;
    const cur = usesPrimaryMana ? f.power : f.mana;
    if (cur >= maxM) return;

    f.manaAccMs += dt;
    const wholeSec = Math.floor(f.manaAccMs / 1000);
    if (wholeSec <= 0) return;
    f.manaAccMs -= wholeSec * 1000;

    // Aura 110 product (Evocation/Innervate) + aura 134 interrupt bonus.
    // Cite: StatSystem.cpp:547–564; Unit.cpp:4611–4622; KI-424.
    const interruptPct = Math.min(
      100,
      Math.max(0, (f.spec.manaRegenInterruptPct ?? 0) + (f.manaRegenInterruptBonus || 0)),
    );
    const pctMult = f.manaRegenPctMult > 0 ? f.manaRegenPctMult : 1;
    const { modManaRegen, modManaRegenInterrupt } = updateManaRegen(
      classId,
      f.spec.spirit ?? 0,
      (f.spec.mp5 ?? 0) + (f.mp5Bonus || 0),
      interruptPct,
      pctMult,
    );
    // lastManaUseAt === -1 means never spent (do not use >0: first-tick spend at t=0 must count).
    const under5sr = f.lastManaUseAt >= 0 && (ctx.t - f.lastManaUseAt) < LAST_MANA_USE_MS;
    const rate = under5sr ? modManaRegenInterrupt : modManaRegen;
    const add = rate * wholeSec;
    if (add <= 0) return;

    if (usesPrimaryMana) {
      const before = f.power;
      f.power = Math.min(maxM, f.power + add);
      if (f.power !== before) {
        ctx.push({ t: ctx.t, kind: 'resource', actor: f.side, power: 'mana', value: Math.round(f.power), delta: f.power - before });
      }
    } else {
      const before = f.mana;
      f.mana = Math.min(maxM, f.mana + add);
      if (f.mana !== before) {
        ctx.push({ t: ctx.t, kind: 'resource', actor: f.side, power: 'mana', value: Math.round(f.mana), delta: f.mana - before });
      }
    }
  };
  // Hunter pet focus: Pet::RegenerateAll every 4s → RegeneratePower(4) → +24 * Rate.Focus. source:
  // Pet.cpp:698–707; Creature.cpp:836–837
  const regenFocus = (f: Fighter, dt: number): void => {
    if (f.spec.powerType !== 'focus' || f.power >= f.spec.maxPower || dt <= 0) return;
    f.focusAccMs += dt;
    const periods = Math.floor(f.focusAccMs / TUNING.focusRegenPeriodMs);
    if (periods <= 0) return;
    f.focusAccMs -= periods * TUNING.focusRegenPeriodMs;
    const add = periods * TUNING.focusPer4Sec;
    const before = f.power;
    f.power = Math.min(f.spec.maxPower, f.power + add);
    if (f.power !== before) {
      ctx.push({ t: ctx.t, kind: 'resource', actor: f.side, power: 'focus', value: Math.round(f.power), delta: f.power - before });
    }
  };
  // Health per second for a player-shaped body that is OUT of combat: the spirit OCT curve times the
  // aura-88 percent auras. A controlled body with no class curve takes the flat 13% of max per 4s.
  // Cite: Player.cpp:2378-2404 RegenerateHealth; Creature.cpp:875; Pet.cpp:701-709 (4s quantum).
  const oocHealthRatePerSec = (f: Fighter): number => {
    const classId = f.spec.classId ?? 0;
    if (classId > 0) {
      return Math.max(0, octRegenHpPerSpirit(classId, f.spec.spirit ?? 0)) * (f.spec.healthRegenPctMult ?? 1);
    }
    return (f.spec.maxHealth * 0.13) / 4;
  };
  // Spirit health regen. Out of combat every player-shaped body regenerates; in combat only one that
  // carries the regen-during-combat aura does. The fractional residual is kept so rounding cannot
  // erase a sub-1 rate. Cite: Player.cpp:2390 `if (!IsInCombat() || HasAuraType(...))`.
  const regenHealth = (f: Fighter, dt: number): void => {
    if (dt <= 0 || f.hp <= 0 || f.hp >= f.spec.maxHealth) return;
    if (f.spec.isPlayerOrPet !== true) return;
    const pct = f.spec.healthRegenDuringCombatPct ?? 0;
    const ooc = !fighterIsInCombat(f, ctx.t);
    if (!ooc && pct <= 0) return;
    const classId = f.spec.classId ?? 0;
    if (!ooc && classId <= 0) return;
    const rate = ooc
      ? oocHealthRatePerSec(f)
      : Math.max(0, octRegenHpPerSpirit(classId, f.spec.spirit ?? 0)) * (pct / 100);
    if (rate <= 0) return;
    f.healthRegenFrac += rate * (dt / 1000);
    const whole = Math.floor(f.healthRegenFrac);
    if (whole <= 0) return;
    f.healthRegenFrac -= whole;
    const before = f.hp;
    f.hp = Math.min(f.spec.maxHealth, f.hp + whole);
    if (f.hp !== before) {
      ctx.push({
        t: ctx.t,
        kind: 'resource',
        actor: f.side,
        power: 'health',
        value: Math.round(f.hp),
        delta: f.hp - before,
      });
    }
  };
  // Combo points — CMaNGOS Unit::AddComboPoints / ClearComboPoints (cap 0..5, target-bound).
  const addComboPoints = (f: Fighter, target: Fighter, count: number): void => {
    if (!count) return;
    if (f.comboTarget === target.side) f.comboPoints += count;
    else { f.comboTarget = target.side; f.comboPoints = count; }
    f.comboPoints = Math.max(0, Math.min(TUNING.comboPointsMax, f.comboPoints));
  };
  const clearComboPoints = (f: Fighter): void => {
    f.comboPoints = 0;
    f.comboTarget = null;
  };
  /** Combo points usable for a finisher against `tgt` (0 if wrong/no target). */
  const comboOn = (f: Fighter, tgt: Fighter): number =>
    (f.comboTarget === tgt.side || (f.comboTarget === null && f.comboPoints === 0)) ? f.comboPoints : 0;
  // Duration after combo-point scaling: the base plus the spread times the points over five, and only
  // when the minimum and maximum differ.
  const scaleDurationByCp = (baseMs: number, maxMs: number | undefined, cp: number): number => {
    if (maxMs == null || maxMs === baseMs || cp <= 0) return baseMs;
    return Math.max(0, Math.round(baseMs + (maxMs - baseMs) * cp / 5));
  };

  ctx.rollHeal = rollHeal;
  ctx.spend = spend;
  ctx.refundPowerOnMiss = refundPowerOnMiss;
  ctx.spellCost = spellCost;
  ctx.canAffordSpell = canAffordSpell;
  ctx.leaveForm = leaveForm;
  ctx.enterForm = enterForm;
  ctx.applyStealth = applyStealth;
  ctx.castHighestStealthRank = castHighestStealthRank;
  ctx.breakStealth = breakStealth;
  ctx.maybeBreakStealthOn = maybeBreakStealthOn;
  ctx.behindOk = behindOk;
  ctx.gainRage = gainRage;
  ctx.regenRage = regenRage;
  ctx.regenEnergy = regenEnergy;
  ctx.regenMana = regenMana;
  ctx.regenFocus = regenFocus;
  ctx.regenHealth = regenHealth;
  ctx.addComboPoints = addComboPoints;
  ctx.clearComboPoints = clearComboPoints;
  ctx.comboOn = comboOn;
  ctx.scaleDurationByCp = scaleDurationByCp;
}
