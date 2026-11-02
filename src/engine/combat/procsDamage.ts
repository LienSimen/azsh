import { formStanceMask } from '../../domain/character/forms.ts';
import { SPIRIT_OF_REDEMPTION_TALENT_SPELL_ID, SPIRIT_OF_REDEMPTION_AURA_SPELL_ID, SUICIDE_SPELL_ID } from '../spells/cmangos-special-cases.ts';
// Peeled from createSession (Wave 4 hub: procsDamage). Pattern (D) alias install.
// Extracted modules must not import combat.ts.

import type { CombatContext } from './context.ts';
import type { Fighter } from './types.ts';
import { maybeAggroZonePulse, touchCombatFlag } from './combatFlag.ts';
import type { Mechanic, School, SpellDef } from '../../data/schema.ts';
import { MECHANIC_ID } from '../../domain/creature/creatureAiConstants.ts';
import type { Side, EnemySide } from '../core/events.ts';
import { isEnemySide, isAllySide, isDuelistSide, isPlayerCharacterSide } from '../core/events.ts';
import {
  TUNING,
  critMultiplierWithVersus,
  rollBetween,
  armorMitigation,
  rewardRage,
  spellCritChance,
  ccResistChance,
} from './formulas.ts';
import { fighterSpellCrit, fighterEffectiveArmor, applyBuffMod, SPELL_DAMAGE_MOD_SCHOOL } from './fighterFactory.ts';
import {
  powerOfType, maxPowerOfType, setPowerOfType, casterPowerTypeId, powerTypeName,
} from './powerPools.ts';
import {
  tryProc, procCooldownReadyAt, procExFromOutcome, meleeSwingDealFlags, killDealFlags,
  meleeAbilityDealFlags, harmfulSpellDealFlags, rangedAttackDealFlags, rangedAbilityDealFlags,
  meleeSwingTakeFlags, meleeAbilityTakeFlags, harmfulSpellTakeFlags,
  schoolMaskFromSchool, SCHOOL_MASK,
  type ProcEventContext, type ProcFlagsHint,
} from '../spells/procs.ts';
import { consumeProcCharge } from '../spells/auraStacking.ts';
import { combustionEffectOf, combustionOnSpellLand } from './combustion.ts';
import { COMBUSTION_SPELL_ID } from '../spells/cmangos-special-cases-combustion.ts';
import {
  applySchoolAbsorb,
  applyManaShield,
  applySplitDamagePct,
  applySplitDamageFlat,
} from '../spells/absorbs.ts';
import { isImmuneToDamage } from '../spells/immunity.ts';
import { isTrivialLevelDifference } from '../../progression/xpGain.ts';
import { spellCanCrit, SPELL_ATTR_EX3, hasAttrEx3, SPELL_ATTR, hasAttr, SPELL_ATTR_EX4, hasAttrEx4, spellPiercesSchoolImmunity } from '../spells/spellAttributes.ts';
import {
  effectiveMagicResistancePercent,
  resolveSpellBinary,
  rollMagicResistanceMultiplier,
} from './mitigation.ts';
import { PROC_FLAGS_TAKE_MELEE, isDrainSoulSpell, gearProcIsOffensive, isHostileBuffEffect } from './predicates.ts';
import {
  BLACKOUT_STUN_SPELL_ID,
  blackoutProcAllowed,
  RETALIATION_AURA_SPELL_ID,
  SETUP_PROC_COOLDOWN_MS,
  setupProcAllowed,
} from '../spells/interpreter/class-scripts-kit.ts';
import { buffProcChargesForSpell } from './cmangosCastGates.ts';
import { canUseEquippedWeapon } from './equippedItemGate.ts';
import { PROC_FLAG } from '../spells/procs.ts';
import { resolveGearProcApplySpell, tryItemChanceOnHit } from '../spells/interpreter/index.ts';
import { applySpellDamageBonusIfPresent } from '../spells/spellBonus.ts';
import {
  IMPROVED_SAP_TRIGGER_SPELL_ID,
  SETUP_TRIGGER_SPELL_ID,
  syntheticTalentTriggerPayload,
} from '../spells/interpreter/class-scripts-kit.ts';
import {
  EYE_FOR_AN_EYE_DAMAGE_SPELL_ID,
  DEEP_WOUND_DOT_DURATION_MS,
  DEEP_WOUND_DOT_SPELL_ID,
  DEEP_WOUND_DOT_TICK_MS,
  ENTRAPMENT_RANK1_SPELL_ID,
  ENTRAPMENT_RANK2_SPELL_ID,
  ENTRAPMENT_RANK3_SPELL_ID,
  ENTRAPMENT_ROOT_DURATION_MS,
  ENTRAPMENT_ROOT_SPELL_ID,
  FROST_TRAP_AURA_FOR_ENTRAPMENT_SPELL_ID,
  IGNITE_DOT_SPELL_ID,
  PYROCLASM_STUN_DURATION_MS,
  PYROCLASM_STUN_SPELL_ID,
  deepWoundsAverageWeaponDamage,
  deepWoundsTickBasepoints,
  entrapmentChanceFromAuraIds,
  entrapmentRootFires,
  eyeForAnEyeReflectAmount,
  igniteBasepoints,
  isDeferredFinisherComboTrigger,
  pyroclasmChancePct,
  pyroclasmStunFires,
  pyroclasmTickCountForFamilyFlags,
  DEADLY_SWIFTNESS_SPELL_ID,
  SPEED_BONUS_10_PCT_SPELL_ID,
  deadlySwiftnessVictimEligible,
} from '../spells/cmangos-special-cases.ts';
import {
  MANA_DRAIN_SELF_GAIN_SPELL_ID,
  MANA_DRAIN_TRIGGER_SPELL_ID,
  MANA_DRAIN_VICTIM_DRAIN_SPELL_ID,
  obsidianArmorTriggeredSpellId,
} from '../spells/cmangos-special-cases-s19.ts';
import {
  adaptiveWardingTriggeredSpellId,
  CHEAT_DEATH_HEALING_TAKEN_SPELL_ID,
  cheatDeathShouldProc,
  MAGE_ARMOR_SPELL_IDS,
  masterOfElementsRefundAmount,
  MASTER_OF_ELEMENTS_TRIGGER_SPELL_ID,
} from '../spells/cmangos-special-cases-s20.ts';
import { combatDistanceYd } from './combatGeometry.ts';
import {
  HUNTER_TRAP_RADIUS_YD,
  isHunterTrapTriggerSpellId,
  syntheticHunterTrapPayload,
} from '../spells/interpreter/hunter-kit.ts';

// The victim-side proc flags for a landed damage packet. Melee and ranged share the take bits while
// magic and dots use the harmful-spell ones, and any real HP hit always sets take-any-damage.
function takeDamageEventFlags(
  damageType: string | undefined,
  opts?: { ranged?: boolean; spell?: SpellDef | null },
): number {
  let flags = PROC_FLAG.TAKE_ANY_DAMAGE;
  if (damageType === 'weapon') {
    // Ability (Sinister Strike) vs white swing: onNextSwing still rides the white table.
    if (opts?.spell && !opts.spell.onNextSwing) flags |= PROC_FLAG.TAKE_MELEE_ABILITY;
    else flags |= PROC_FLAG.TAKE_MELEE_SWING;
  } else if (damageType === 'spell' && opts?.ranged) {
    flags |= PROC_FLAG.TAKE_RANGED_ATTACK | PROC_FLAG.TAKE_RANGED_ABILITY;
  } else if (damageType === 'dot') {
    flags |= PROC_FLAG.TAKE_HARMFUL_PERIODIC;
  } else if (damageType === 'spell') {
    flags |= PROC_FLAG.TAKE_HARMFUL_SPELL;
  } else if (damageType == null || damageType === 'shield') {
    // Unlabeled residual / shield feedback — only TAKE_ANY_DAMAGE.
  } else {
    // Unknown weapon-like residual (physical flat) — treat as melee take.
    flags |= PROC_FLAG.TAKE_MELEE_SWING;
  }
  return flags;
}


export type installProcsDamageDeps = {
  dead: (f: Fighter) => boolean;
  gainRage: (f: Fighter, amount: number) => void;
};

export function installProcsDamage(ctx: CombatContext, deps: installProcsDamageDeps): void {
  const push = (e: any) => ctx.push(e);
  const enemyCastBySide = ctx.enemyCastBySide;
  const player = ctx.player;
  const pet = ctx.pet;
  const effects = ctx.effects;
  const rng = ctx.rng;
  const tickMs = ctx.tickMs;
  const livingFriendlies = ctx.livingFriendlies;
  const fightersOrder = ctx.fightersOrder;
  // Side -> unit is one store read (E1.1). The order array answers it too, by walking every
  // fighter, and a reachable second answer is the shape this phase exists to remove.
  const sideFighter = ctx.sideFighter;
  const isCharmed = ctx.isCharmed;
  const applyDamageThreat = (...args: any[]) => (ctx.applyDamageThreat as Function)(...args);
  const breakCharm = (...args: any[]) => (ctx.breakCharm as Function)(...args);
  const applyControl = (...args: any[]) => (ctx.applyControl as Function)(...args);
  const applyDr = (...args: any[]) => (ctx.applyDr as Function)(...args);
  const ccImmune = (...args: any[]) => (ctx.ccImmune as Function)(...args);
  const onDamaged = (...args: any[]) => (ctx.onDamaged as Function)(...args);
  const applySpell = (...args: any[]) => (ctx.applySpell as Function)(...args);
  const dead = deps.dead;
  const gainRage = deps.gainRage;

  const makeProcCtx = (
    src: Fighter,
    wasCrit: boolean,
    flagsHint: ProcFlagsHint = 'spell',
    fromSpell?: SpellDef | null,
  ): ProcEventContext => {
    const t = ctx.t;
    const procFlags =
      flagsHint === 'melee_swing' ? meleeSwingDealFlags()
        : flagsHint === 'melee_ability' ? meleeAbilityDealFlags()
          : flagsHint === 'ranged_attack' ? rangedAttackDealFlags()
            : flagsHint === 'ranged_ability' ? rangedAbilityDealFlags()
              : flagsHint === 'kill' ? killDealFlags()
                : harmfulSpellDealFlags();
    const procCtx: ProcEventContext = {
      procFlags,
      procEx: procExFromOutcome(wasCrit ? 'crit' : 'hit'),
      weaponSpeedMs: src.spec.weapon.speedMs,
      nowMs: t,
      outdoors: ctx.cfg.outdoors,
    };
    if (fromSpell) {
      procCtx.schoolMask = schoolMaskFromSchool(fromSpell.school);
      if (fromSpell.spellFamilyName != null) procCtx.spellFamilyName = fromSpell.spellFamilyName;
      if (fromSpell.spellFamilyFlags != null) procCtx.spellFamilyFlags = fromSpell.spellFamilyFlags;
    } else if (flagsHint !== 'spell') {
      // A weapon hit without a spellInfo → NORMAL school (SpellMgr.cpp ~899–903).
      procCtx.schoolMask = SCHOOL_MASK.NORMAL;
    }
    return procCtx;
  };

  // The chip shows crits left and stacks up. EVERY 11129 row is synced: the inert DUMMY holder
  // carries procCharges too, and the view reads the MAX. Cite: sessionView chargesBySpell.
  const syncCombustionChip = (src: Fighter): void => {
    for (const e of ctx.effectsOn(src.side)) {
      if (e.spellId !== COMBUSTION_SPELL_ID) continue;
      e.charges = src.combustionCharges;
      e.stacks = src.combustionStacks;
      ctx.touchEffect(e);
    }
  };

  // Combustion ends: both holders leave the bar together. Cite: Unit.cpp:5372-5375.
  const dropCombustionAuras = (src: Fighter, stackSpellId: number): void => {
    for (const id of [COMBUSTION_SPELL_ID, stackSpellId]) {
      src.buffActive.delete(id);
      for (let i = effects.length - 1; i >= 0; i--) {
        const e = effects[i]!;
        if (e.spellId !== id || e.target !== src.side) continue;
        effects.splice(i, 1);
        push({ t: ctx.t, kind: 'aura', actor: src.side, name: e.name, applied: false });
      }
    }
  };

  // After a successful aura proc fire, decrement charges on matching source auras and remove at 0. Cite:
  // SpellEntry.procCharges; auraStacking.consumeProcCharge.
  const consumeAuraChargesOnProc = (src: Fighter, triggerSpellId: number): void => {
    // Prefer aura whose spellId equals the triggered spell; else first charged buff on src.
    // DropAuraCharge removes the whole holder (not one effect row). Cite: SpellAuras.cpp:5750.
    const onSrc = ctx.effectsOn(src.side);
    let e = onSrc.find(
      (row) => row.kind === 'buff' && row.charges != null && row.spellId === triggerSpellId,
    );
    if (!e) {
      e = onSrc.find(
        (row) => row.kind === 'buff' && row.charges != null,
      );
    }
    if (!e) return;
    const { remaining, remove } = consumeProcCharge(e.charges);
    if (remove) {
      // DropAuraCharge removes the whole holder, not one effect row.
      ctx.removeAurasDueToSpell?.(src, e.spellId);
    } else {
      e.charges = remaining;
    }
  };


  // RemoveAuraHolderFromStack on proc. Cite: UnitAuraProcHandler.cpp.
  const consumeAuraStacksOnProc = (src: Fighter, stackSpellId: number): void => {
    const idx = effects.findIndex(
      (e) => e.target === src.side && e.kind === 'buff' && e.stacks != null && e.spellId === stackSpellId,
    );
    if (idx < 0) return;
    const e = effects[idx]!;
    if (e.stacks != null && e.stacks > 1) {
      e.stacks = e.stacks - 1;
      ctx.touchEffect(e);
    } else {
      effects.splice(idx, 1);
      push({ t: ctx.t, kind: 'aura', actor: src.side, name: e.name, applied: false });
    }
  };

  // A charged stat buff with DEAL spell flags (Chaos Fire 24389: "your next Fire spell") spends a
  // charge when the bearer lands a damaging spell. Aura 13 has no proc handler, so the generic path
  // drops the charge. A one-school damage mod only takes a spell of that school (24389 SchoolMask 0x04).
  // Cite: UnitAuraProcHandler.cpp:46,:500-509; sql/archive/0.10/5019_mangos_spell_proc_event.sql.
  const consumeChargedBuffsOnDealHit = (src: Fighter, fromSpell: SpellDef): void => {
    const t = ctx.t;
    const dealFlags = harmfulSpellDealFlags();
    const mine = ctx.effectsOn(src.side);
    for (let i = mine.length - 1; i >= 0; i--) {
      const e = mine[i]!;
      if (e.kind !== 'buff') continue;
      if (e.charges == null || e.charges <= 0) continue;
      if (e.expiresAt <= t) continue;
      // An aura cannot spend its own charge. Cite: UnitAuraProcHandler.cpp:543.
      if (e.spellId === fromSpell.id) continue;
      const pf = (e.procFlags ?? 0) | 0;
      if (pf === 0 || (pf & dealFlags) === 0) continue;
      const modSchool = e.mod ? SPELL_DAMAGE_MOD_SCHOOL[e.mod as keyof typeof SPELL_DAMAGE_MOD_SCHOOL] : undefined;
      if (modSchool && fromSpell.school !== modSchool) continue;
      const { remaining, remove } = consumeProcCharge(e.charges);
      if (remove) {
        ctx.removeAurasDueToSpell?.(src, e.spellId);
      } else {
        e.charges = remaining;
        ctx.touchEffect(e);
      }
    }
  };

  // Proc support: match the flags and the per-minute rate, then fire the trigger spell's effects as a
  // free, instant, no-cost side effect. The injected rng keeps it deterministic, and procs do not nest.
  const triggerProcs = (
    src: Fighter,
    tgt: Fighter,
    wasCrit: boolean,
    flagsHint: ProcFlagsHint = 'spell',
    fromSpell?: SpellDef | null,
  ): void => {
    const t = ctx.t;
    // SUPPRESS_CASTER_PROCS zeroes the attacker mask for this cast, so the CASTER's own procs do not
    // fire from it. 12 rows, including the Hunter's Mark ranks and Righteous Fury.
    if (fromSpell && hasAttrEx3(fromSpell, SPELL_ATTR_EX3.SUPPRESS_CASTER_PROCS)) return;
    // Combustion is a DUMMY proc with no trigger row, so it runs ahead of the trigger loop and
    // outlives a caster with no procs at all. Cite: UnitAuraProcHandler.cpp:991-1003.
    if (src.combustionCharges > 0 && flagsHint === 'spell' && fromSpell) {
      const ce = combustionEffectOf(src);
      if (ce) {
        const ended = combustionOnSpellLand(src, ce, fromSpell.school, wasCrit);
        if (ended) dropCombustionAuras(src, ce.stackSpellId);
        else syncCombustionChip(src);
      }
    }
    if (flagsHint === 'spell' && fromSpell) consumeChargedBuffsOnDealHit(src, fromSpell);
    const procs = src.procs || [];
    if (!procs.length) return;
    const procCtx = makeProcCtx(src, wasCrit, flagsHint, fromSpell);
    for (const p of procs) {
      if (!p.triggerSpellId) continue;
      // A form-gated talent aura is not on the body outside its form, so it cannot proc there.
      // Cite: DBCStructure.h:864 CanBeUsedInForm; SpellAuras.cpp:4296-4304.
      if (p.stances && !(p.stances & formStanceMask(src.form))) continue;
      // Blackout: not from heals / non-damage. Cite: Priest.cpp:50-51 OnCheckProc.
      if (p.triggerSpellId === BLACKOUT_STUN_SPELL_ID && !blackoutProcAllowed(fromSpell)) {
        continue;
      }
      // Unstable Power (24658) consumes 24659 stack on proc. Cite: UnitAuraProcHandler.cpp case 24658.
      if (p.triggerSpellId === 24658) {
        if (!fromSpell || fromSpell.id === 24659) continue;
        consumeAuraStacksOnProc(src, 24659);
        continue;
      }
      const readyAt = src.procCooldowns.get(p.triggerSpellId) ?? 0;
      const fired = tryProc({
          procFlags: p.procFlags,
          procEx: p.procEx,
          chance: p.chance,
          ppm: p.ppm,
          customChance: p.customChance,
          cooldownReadyAt: readyAt,
          cooldownMs: p.cooldownMs,
          schoolMask: p.schoolMask,
          spellFamilyName: p.spellFamilyName,
          spellFamilyMask: p.spellFamilyMask,
        },
        procCtx,
        rng,
      );
      if (!fired) {
        // PROC_FAILURE_BURNS_CHARGE, on 12 rows: a failed roll still spends a charge. Without it a
        // charged Windfury holder could roll forever on one charge.
        if (p.failureBurnsCharge === true) consumeAuraChargesOnProc(src, p.triggerSpellId);
        continue;
      }
      // Illumination: holy spell crit (heals/damage) -> refund original manaCost via 20272.
      // Cite: UnitAuraProcHandler.cpp HandleProcTriggerSpellAuraProc SPELLFAMILY_PALADIN Illumination.
      if (p.spellIconId === 241 && fromSpell) {
        let originalSpellId = fromSpell.id;
        if (originalSpellId === 25914) originalSpellId = 20473;
        else if (originalSpellId === 25913) originalSpellId = 20929;
        else if (originalSpellId === 25903) originalSpellId = 20930;

        const originalSpell = src.spec.spells.find((s) => s.id === originalSpellId);
        const manaCost = originalSpell?.cost ?? 0;
        if (manaCost > 0) {
          const trigId = 20272; // Illumination refund trigger spell
          const trigTemplate = ctx.spellOf?.(trigId);
          if (trigTemplate) {
            const scaled = {
              ...trigTemplate,
              effects: trigTemplate.effects.map((e) => (
                e.kind === 'energize' ? { ...e, min: manaCost, max: manaCost } as typeof e : e
              )),
            };
            applyProc(src, src, scaled);
          }
        }
        continue;
      }
      // Kit first, then the global store (E6.0) - a PROC_TRIGGER payload in no kit is still real.
      // Cite: Unit.cpp:1447-1449 sSpellTemplate.LookupEntry.
      const tid = p.triggerSpellId | 0;
      let trigSpell = src.spec.spells.find((s) => (s.id | 0) === tid)
        ?? ctx.spellOf?.(tid);
      if (!trigSpell || (tid === SETUP_TRIGGER_SPELL_ID
        && !trigSpell.effects.some((e) => e.kind === 'combo_points'))) {
        trigSpell = syntheticTalentTriggerPayload(tid) ?? trigSpell;
      }
      if (!trigSpell) continue;
      if (src.sitting && !hasAttr(trigSpell, SPELL_ATTR.ALLOW_WHILE_SITTING)) continue;
      const cdAt = procCooldownReadyAt(t, p.cooldownMs);
      if (cdAt != null) src.procCooldowns.set(p.triggerSpellId, cdAt);
      // 14093 / 15250: scripted payloads, not the inline damage/buff loop.
      // Cite: Rogue.cpp:105–109; SpellEffects.cpp:4213–4222; sql/scriptdev2/spell.sql 14093.
      if (tid === IMPROVED_SAP_TRIGGER_SPELL_ID || tid === SETUP_TRIGGER_SPELL_ID) {
        applyProc(src, tid === IMPROVED_SAP_TRIGGER_SPELL_ID ? src : tgt, trigSpell);
        consumeAuraChargesOnProc(src, tid);
        continue;
      }
      // Seal Fate and Ruthlessness attach to the current ability cast. A white swing has no generic
      // spell in flight, so the proc fails; an ability defers the points until after it finishes.
      if (isDeferredFinisherComboTrigger(trigSpell.id)) {
        if (!fromSpell) {
          // No current generic spell (white swing / pure auto) — fail the proc.
          continue;
        }
        const cp = trigSpell.comboPointsGenerated
          ?? (trigSpell.effects.find((e) => e.kind === 'combo_points')?.amount ?? 1);
        src.pendingFinisherComboPoints += Math.max(1, cp | 0);
        consumeAuraChargesOnProc(src, p.triggerSpellId);
        continue;
      }
      // A next-cast modifier has to go through applySpell so the pending mod is armed and the prior
      // chip dropped. The inline loop below cannot consume one.
      if (trigSpell.effects.some((e) => e.kind === 'next_cast_mod')) {
        applyProc(src, src, trigSpell);
        consumeAuraChargesOnProc(src, p.triggerSpellId);
        continue;
      }
      // Hostile buffs (Shadow Vulnerability / Vindication) apply to tgt via applySpell.
      // The inline buff branch always landed on src. Cite: SpellTargetDefines TARGET_UNIT_ENEMY=6.
      if (trigSpell.effects.some((e) => e.kind === 'buff' && isHostileBuffEffect(e, e.amount ?? 0))) {
        applyProc(src, tgt, trigSpell);
        consumeAuraChargesOnProc(src, p.triggerSpellId);
        continue;
      }
      // Apply its effects directly (bypass cost/gcd/cd).
      for (const eff of trigSpell.effects) {
        if (eff.kind === 'direct_damage') {
          let r = rollBetween(eff.min, eff.max, rng.next());
          r = applySpellDamageBonusIfPresent(r, trigSpell, eff.effectSlot ?? 0, {
            spellPower: src.spec.spellPower,
            spellDamageBySchool: src.spec.spellDamageBySchool,
            school: eff.school,
            attackPower: src.attackPower,
            damagePct: src.damagePctBySchool[eff.school],
          });
          const critHere = spellCanCrit(trigSpell)
            && rng.chance(spellCritChance(fighterSpellCrit(src), src.spec.level, tgt.spec.level, trigSpell.dmgClass));
          if (critHere) r *= critMultiplierWithVersus(TUNING.spellCritMult, src.critDamageVersusPct, tgt.creatureType);
          const bin = resolveSpellBinary(trigSpell);
          const amount = dealDamage(tgt, r, eff.school, src.spec.level, {
            binary: bin, damageType: 'spell', attacker: src,
          });
          push({ t, kind: 'spell_hit', actor: src.side, target: tgt.side, spellId: trigSpell.id, name: trigSpell.name, result: critHere ? 'crit' : 'hit', amount, school: eff.school });
        } else if (eff.kind === 'heal') {
          if (!dead(src)) {
            const amt = Math.round(rollBetween(eff.min, eff.max, rng.next()));
            if (Number.isFinite(amt) && amt > 0) {
              src.hp = Math.min(src.spec.maxHealth, Math.round(src.hp + amt));
              push({ t, kind: 'heal', actor: src.side, amount: amt });
            }
          }
        } else if (eff.kind === 'buff') {
          // Refresh-or-add, as the apply path does. Pushing a new row per proc gave a fury companion
          // 19 concurrent Flurry rows, and reading charges off the bake meant they never expired.
          const charges = buffProcChargesForSpell(trigSpell.id, trigSpell.procCharges);
          const live = ctx.effectsOn(src.side).find(
            (x) => x.kind === 'buff' && x.spellId === trigSpell.id
              && x.source === src.side && x.mod === eff.mod,
          );
          if (live) {
            live.expiresAt = t + eff.durationMs;
            live.amount = eff.amount;
            if (charges != null) live.charges = charges; // proc re-arms the charge count
            ctx.touchEffect(live);
          } else {
            applyBuffMod(src, eff.mod, eff.amount);
            src.buffActive.add(trigSpell.id);
            effects.push({
              kind: 'buff', source: src.side, target: src.side, spellId: trigSpell.id, name: trigSpell.name,
              mod: eff.mod, amount: eff.amount, expiresAt: t + eff.durationMs,
              ...(charges != null ? { charges } : {}),
            });
            push({ t, kind: 'aura', actor: src.side, name: trigSpell.name, applied: true });
          }
        } else if (eff.kind === 'dot') {
          effects.push({
            kind: 'dot', source: src.side, target: tgt.side, spellId: trigSpell.id, name: trigSpell.name,
            school: eff.school, min: eff.min, max: eff.max, nextTickAt: t + eff.tickMs, tickMs: eff.tickMs,
            expiresAt: t + eff.durationMs,
          });
          push({ t, kind: 'aura', actor: tgt.side, name: trigSpell.name, applied: true });
        } else if (eff.kind === 'cc') {
          // Improved Kick / Counterspell / Shield Bash silence companions (aura 27).
          // Cite: talent proc → EffectTriggerSpell silence spell; SpellAuras HandleAuraModSilence.
          if (ccImmune(tgt, eff.mechanic, eff.onlyTypes)) {
            push({ t, kind: 'cc_immune', target: tgt.side, control: eff.control, name: trigSpell.name });
            continue;
          }
          {
            let ccChance = ccResistChance(
              tgt.resistances[eff.school] ?? 0,
              src.spec.level,
              tgt.spec.level,
            );
            const mechId = MECHANIC_ID[eff.mechanic as Mechanic] ?? 0;
            const mechBonus = mechId ? (tgt.spec.mechanicResistPct?.[mechId] ?? 0) : 0;
            if (mechBonus) ccChance = Math.min(0.9, ccChance + mechBonus / 100);
            if (rng.chance(ccChance)) {
              push({ t, kind: 'cc_resist', target: tgt.side, control: eff.control, name: trigSpell.name });
              continue;
            }
          }
          const durMs = applyDr(src, tgt, eff.mechanic, eff.durationMs);
          if (durMs <= 0) {
            push({ t, kind: 'cc_immune', target: tgt.side, control: eff.control, name: trigSpell.name });
            continue;
          }
          applyControl(src, tgt, trigSpell, eff, durMs);
        }
      }
      consumeAuraChargesOnProc(src, p.triggerSpellId);
    }
  };

  // Defender-side Setup 15250 only. Cite: Rogue.cpp:112–118; UnitAuraProcHandler victim path.
  const triggerTakenProcs = (
    victim: Fighter,
    attacker: Fighter,
    outcome: 'dodge' | 'parry' | 'block' | 'resist',
    flagsHint: ProcFlagsHint,
  ): void => {
    if (!victim.setupTriggerSpellId) return;
    const procs = victim.procs || [];
    const t = ctx.t;
    const procFlags =
      flagsHint === 'melee_swing' ? meleeSwingTakeFlags()
        : flagsHint === 'melee_ability' ? meleeAbilityTakeFlags()
          : flagsHint === 'ranged_attack' ? PROC_FLAG.TAKE_RANGED_ATTACK
            : flagsHint === 'ranged_ability' ? PROC_FLAG.TAKE_RANGED_ABILITY
              : harmfulSpellTakeFlags();
    const procCtx: ProcEventContext = {
      procFlags,
      procEx: procExFromOutcome(outcome),
      weaponSpeedMs: attacker.spec.weapon.speedMs,
      nowMs: t,
      schoolMask: SCHOOL_MASK.NORMAL,
      outdoors: ctx.cfg.outdoors,
    };
    for (const p of procs) {
      if (p.stances && !(p.stances & formStanceMask(victim.form))) continue;
      // Setup only until other TAKE talents get a real applyProc path (rolling them here
      // burns ICD without applying Blood Craze / Enrage / Shield Spec payloads).
      if (p.triggerSpellId !== SETUP_TRIGGER_SPELL_ID) continue;
      const foe = ctx.foeOf?.(victim);
      if (!setupProcAllowed(foe?.side, attacker.side)) continue;
      const readyAt = victim.procCooldowns.get(p.triggerSpellId) ?? 0;
      const fired = tryProc({
        procFlags: p.procFlags,
        procEx: p.procEx,
        chance: p.chance,
        ppm: p.ppm,
        customChance: p.customChance,
        cooldownReadyAt: readyAt,
        cooldownMs: SETUP_PROC_COOLDOWN_MS,
        schoolMask: p.schoolMask,
        spellFamilyName: p.spellFamilyName,
        spellFamilyMask: p.spellFamilyMask,
      }, procCtx, rng);
      if (!fired) continue;
      const trigSpell = victim.spec.spells.find((s) => s.id === p.triggerSpellId);
      if (!trigSpell) continue;
      if (victim.sitting && !hasAttr(trigSpell, SPELL_ATTR.ALLOW_WHILE_SITTING)) continue;
      const cdAt = procCooldownReadyAt(t, SETUP_PROC_COOLDOWN_MS);
      if (cdAt != null) victim.procCooldowns.set(p.triggerSpellId, cdAt);
      const cpEff = trigSpell.effects.find((e) => e.kind === 'combo_points');
      const cp = trigSpell.comboPointsGenerated ?? (cpEff && 'amount' in cpEff ? cpEff.amount : 0);
      if (cp) ctx.addComboPoints?.(victim, attacker, Math.max(1, cp | 0));
    }
  };

  // Apply a proc spell's effects directly (free, no cost/gcd/cd, instant). Temporarily
  // clear procs on src to avoid recursive proc nesting from the applied spell's damage.
  const applyProc = (src: Fighter, tgt: Fighter, spell: SpellDef): void => {
    const t = ctx.t;
    // A spell cast BY a proc is triggered, and an aura procs from one only when the PAYLOAD is flagged
    // not-a-proc or the AURA may proc from procs. A proc with no holder keeps the blunt refusal.
    const payloadIsNotAProc = hasAttrEx3(spell, SPELL_ATTR_EX3.NOT_A_PROC);
    const savedP = src.procs;
    const savedG = src.gearProcs;
    if (!payloadIsNotAProc) {
      src.procs = savedP.filter((p) => p.canProcFromProcs === true);
      src.gearProcs = [];
    }
    applySpell(src, tgt, spell);
    // The Frost Trap aura spring into the Entrapment root. The C++ rolls on every pulse; our trap model
    // springs once on melee, which is the same gate.
    if ((spell.id | 0) === FROST_TRAP_AURA_FOR_ENTRAPMENT_SPELL_ID && !dead(tgt)) {
      const auraIds: number[] = [];
      for (const e of ctx.effectsOn(src.side)) {
        if (e.expiresAt > t && e.spellId) auraIds.push(e.spellId | 0);
      }
      // Passive talent may be kit-only until cast; include known rank ids on the kit.
      for (const s of src.spec.spells) {
        const sid = s.id | 0;
        if (
          sid === ENTRAPMENT_RANK1_SPELL_ID
          || sid === ENTRAPMENT_RANK2_SPELL_ID
          || sid === ENTRAPMENT_RANK3_SPELL_ID
        ) {
          auraIds.push(sid);
        }
      }
      const chance = entrapmentChanceFromAuraIds(auraIds);
      if (entrapmentRootFires(chance, rng.next())) {
        const root =
          src.spec.spells.find((s) => s.id === ENTRAPMENT_ROOT_SPELL_ID)
          ?? {
            id: ENTRAPMENT_ROOT_SPELL_ID,
            name: 'Entrapment',
            school: 'physical' as const,
            effects: [{
              kind: 'root' as const,
              durationMs: ENTRAPMENT_ROOT_DURATION_MS,
              mechanic: 'root' as const,
            }],
          };
        applySpell(src, tgt, root);
      }
    }
    src.procs = savedP;
    src.gearProcs = savedG;
  };

  // Roll the item procs for on-hit and on-equip. The hit path uses the per-minute and cooldown rules
  // and resolves empty-effect proc spells through the interpreter; the equip path is a flat chance.
  const rollGearProcs = (
    src: Fighter,
    tgt: Fighter,
    context: 'hit' | 'crit' | 'equip' = 'hit',
    fromSpell?: SpellDef | null,
  ): void => {
    const t = ctx.t;
    const gprocs = src.gearProcs || [];
    if (!gprocs.length) return;
    const procCtx: ProcEventContext = {
      procFlags: context === 'equip' ? 0 : meleeSwingDealFlags() | harmfulSpellDealFlags(),
      procEx: procExFromOutcome(context === 'crit' ? 'crit' : 'hit'),
      weaponSpeedMs: src.spec.weapon.speedMs,
      nowMs: t,
      outdoors: ctx.cfg.outdoors,
    };
    if (fromSpell) {
      procCtx.schoolMask = schoolMaskFromSchool(fromSpell.school);
      if (fromSpell.spellFamilyName != null) procCtx.spellFamilyName = fromSpell.spellFamilyName;
      if (fromSpell.spellFamilyFlags != null) procCtx.spellFamilyFlags = fromSpell.spellFamilyFlags;
    } else if (context !== 'equip') {
      procCtx.schoolMask = SCHOOL_MASK.NORMAL;
    }
    // An item's holder spell and its apply payload have no reason to be in the wearer's
    // spellbook, so the kit answer is a fallback here, not the source. Cite: Unit.cpp:1447-1449.
    const spellById = (id: number): SpellDef | undefined =>
      src.spec.spells.find((s) => s.id === id) ?? ctx.spellOf?.(id);
    for (const p of gprocs) {
      if (!p.spell) continue;
      const trig = p.trigger ?? 0;
      const matches =
        (context === 'equip' && trig === 1) ||
        ((context === 'hit' || context === 'crit') && trig === 2);
      if (!matches) continue;
      const readyAt = src.procCooldowns.get(p.spell) ?? 0;
      const holderSpell = spellById(p.spell);

      // Equip procs: flat chance only (no PPM on equip). Unchanged roll surface.
      if (context === 'equip') {
        let ch = p.chancePct != null ? p.chancePct / 100 : undefined;
        if (typeof ch !== 'number' || ch <= 0 || !rng.chance(ch)) continue;
        if (!holderSpell) continue;
        const cdAt = procCooldownReadyAt(t, p.cooldownMs);
        if (cdAt != null) src.procCooldowns.set(p.spell, cdAt);
        const applySpellDef = resolveGearProcApplySpell(holderSpell, spellById) ?? holderSpell;
        if (!applySpellDef.effects.length) continue;
        if (src.sitting && !hasAttr(applySpellDef, SPELL_ATTR.ALLOW_WHILE_SITTING)) continue;
        applyProc(src, gearProcIsOffensive(applySpellDef) ? tgt : src, applySpellDef);
        continue;
      }

      // On-hit / crit: SI-PROC subsystem (tryProcTriggerSpell via tryItemChanceOnHit).
      // Rates from ItemDef.procs + holder spell_proc_event — never invented.
      const roll = tryItemChanceOnHit(p, holderSpell, procCtx, rng, { cooldownReadyAt: readyAt });
      if (!roll.fired) continue;
      if (!holderSpell) continue;
      const applySpellDef = resolveGearProcApplySpell(holderSpell, spellById);
      if (!applySpellDef || !applySpellDef.effects.length) continue;
      if (src.sitting && !hasAttr(applySpellDef, SPELL_ATTR.ALLOW_WHILE_SITTING)) continue;
      if (roll.cooldownReadyAt != null) {
        src.procCooldowns.set(p.spell, roll.cooldownReadyAt);
      } else {
        // Fallback ICD when meta has cooldown but tryProc only sets on fire+cd.
        const cdAt = procCooldownReadyAt(t, p.cooldownMs ?? roll.meta.cooldownMs);
        if (cdAt != null) src.procCooldowns.set(p.spell, cdAt);
      }
      applyProc(src, gearProcIsOffensive(applySpellDef) ? tgt : src, applySpellDef);
    }
  };

  // The damage funnel: physical through armor, magic through the partial-resist table with gated RNG.
  // A binary direct hit skips the table, since its full resist is on the land roll; a binary DoT does not.
  const dealDamage = (
    target: Fighter,
    raw: number,
    school: School,
    attackerLevel: number,
    opts?: {
      binary?: boolean;
      /** 'spell' | 'dot' | 'weapon' — see mitigation MagicDamageType. */
      damageType?: 'spell' | 'dot' | 'weapon' | 'shield';
      // True for a ranged weapon attack — SPELL_AURA_MOD_RANGED_DAMAGE_TAKEN (113) applies only to these.
      // Cite: SpellAuras.cpp :174 "implemented in Unit::MeleeDamageBonusTaken".
      ranged?: boolean;
      attacker?: Fighter;
      /** Spell that caused this damage (for spell_threat multiplier). */
      spell?: SpellDef | null;
      /** Crit outcome for CalcThreat crit path. */
      crit?: boolean;
      // The melee clean damage for the victim's rage reward — post-outcome, pre-block and adjusted for
      // a glance or crush. It defaults to the raw amount, which is what the spell and dot paths want.
      cleanDamage?: number;
    },
  ): number => {
    const t = ctx.t;
    if (target.buffActive.has(SPIRIT_OF_REDEMPTION_AURA_SPELL_ID)) return 0;
    // Corpse / already-dead: no further damage (avoids NaN and post-death side effects).
    if (dead(target)) return 0;
    // Reject non-finite raw (missing effect min/max, broken bonus math) — never write NaN into HP.
    if (!Number.isFinite(raw)) return 0;
    let dmg = raw;
    // Victim rage base: cleanDamage when weapon path supplies it (includes blocked / glance).
    let rageRaw = opts?.cleanDamage != null && Number.isFinite(opts.cleanDamage)
      ? opts.cleanDamage
      : raw;
    // Attacker penetration from SPELL_AURA_MOD_TARGET_RESISTANCE (Wave 2B).
    // Cite: Unit.cpp GetResistancePenetration ~3890; CalcArmorReducedDamage ~2328.
    const pen = opts?.attacker?.spec.resistancePenetration?.[school] ?? 0;
    if (school === 'physical') {
      // aura 101 TOTAL_PCT (Pierce Armor −50% / Stoneform +10%): scale armor before mitigation.
      const effArmor = fighterEffectiveArmor(target);
      const armorFactor = 1 - armorMitigation(effArmor, attackerLevel, pen);
      dmg = dmg * armorFactor;
      rageRaw = rageRaw * armorFactor;
      if (!hasAttrEx4(opts?.spell, SPELL_ATTR_EX4.IGNORE_DAMAGE_TAKEN_MODIFIERS)) {
        // Stoneskin etc.: flat physical taken mod (negative reduces damage). Applied after armor %.
        if (target.physicalTakenMod) {
          dmg = dmg + target.physicalTakenMod;
          rageRaw = rageRaw + target.physicalTakenMod;
        }
        // Windwall Totem (aura 113 MOD_RANGED_DAMAGE_TAKEN): flat, ranged attacks only.
        // Cite: Unit::MeleeDamageBonusTaken; spell_template 15108 EffectBasePoints -33.
        if (opts?.ranged && target.rangedTakenMod) {
          dmg = dmg + target.rangedTakenMod;
          rageRaw = rageRaw + target.rangedTakenMod;
        }
        // Barkskin / form / aura 87 physical mask: percent taken after flat.
        // Cite: Unit.cpp:7628 / :7634 TakenTotalMod ×= (100+amount)/100.
        {
          const takenPct =
            (target.physicalTakenPctMod || 0)
            + (target.damageTakenPctBySchool.physical ?? 0);
          if (takenPct) {
            const f = 1 + takenPct / 100;
            dmg = dmg * f;
            rageRaw = rageRaw * f;
          }
        }
      }
    } else {
      // Magic: partial resist when canResist && (!binary || DOT) — Unit.cpp ~2357.
      const binary = opts?.binary ?? false;
      const damageType: import('./mitigation.ts').MagicDamageType =
        opts?.damageType === 'dot' || opts?.damageType === 'weapon' || opts?.damageType === 'spell'
          ? opts.damageType
          : 'spell';
      if (!binary || damageType === 'dot') {
        const attacker = opts?.attacker;
        const percent = effectiveMagicResistancePercent({
          school,
          resistance: target.resistances[school] ?? 0,
          penetration: pen,
          attackerLevel,
          victimLevel: target.spec.level,
          binary,
          victimIsNpc: isEnemySide(target.side),
        });
        const resisted = rollMagicResistanceMultiplier({
          percent,
          binary,
          damageType,
          attackerPlayerControlled: attacker
            ? (attacker.side === 'player' || attacker.side === 'pet' || isAllySide(attacker.side))
            : true,
          rng,
        });
        dmg = dmg * (1 - resisted);
        rageRaw = rageRaw * (1 - resisted);
      }
      if (!hasAttrEx4(opts?.spell, SPELL_ATTR_EX4.IGNORE_DAMAGE_TAKEN_MODIFIERS)) {
        // Dampen/Amplify Magic: flat spell taken mod (mirror physicalTakenMod). Negative = less taken.
        if (target.spellTakenMod) {
          dmg = dmg + target.spellTakenMod;
          rageRaw = rageRaw + target.spellTakenMod;
        }
        // CoE / CoS / Stormstrike: school-scoped MOD_DAMAGE_PERCENT_TAKEN after flat.
        // Cite: Unit.cpp:7628 GetTotalAuraMultiplierByMiscMask; KI-767.
        {
          const takenPct = target.damageTakenPctBySchool[school] ?? 0;
          if (takenPct) {
            const f = 1 + takenPct / 100;
            dmg = dmg * f;
            rageRaw = rageRaw * f;
          }
        }
      }
    }
    // Template and aura immunities together, which replaces the bare school test while keeping the
    // creature-mask path. Cite: Unit.cpp ~7310; immunity.ts isImmuneToDamage.
    if (isImmuneToDamage(target.immunity, school, {
      schoolImmuneMask: target.spec.schoolImmuneMask,
      mechanicImmuneMask: target.spec.mechanicImmuneMask,
    }, spellPiercesSchoolImmunity(opts?.spell))) {
      return 0;
    }
    if (!Number.isFinite(dmg) || !Number.isFinite(rageRaw)) return 0;
    dmg = Math.max(0, Math.round(dmg));
    rageRaw = Math.max(0, rageRaw);
    // Full block: HP packet 0 but cleanDamage > 0 → still victim rage (Unit.cpp:951–956 physical).
    if (dmg <= 0) {
      if (
        school === 'physical'
        && rageRaw > 0
        && target.spec.powerType === 'rage'
        && opts?.attacker !== target
      ) {
        gainRage(target, rewardRage(Math.round(rageRaw), target.spec.level, false));
      }
      return 0;
    }

    // Absorbs come AFTER resist and BEFORE HP, in the C++ order. The melee shield block stays on the
    // weapon path only, and the absorbed amount also lowers the clean damage for taken rage.
    const dmgSchoolMask = schoolMaskFromSchool(school);
    let absorbed = 0;
    if (target.schoolAbsorbs.length > 0 && dmg > 0) {
      const sa = applySchoolAbsorb(target.schoolAbsorbs, dmgSchoolMask, dmg);
      target.schoolAbsorbs = sa.auras;
      // Drop broken school-absorb effects (amount depleted).
      if (sa.absorbed > 0) {
        absorbed += sa.absorbed;
        rageRaw = Math.max(0, rageRaw - sa.absorbed);
        const absorbMine = ctx.effectsOn(target.side);
        for (let i = absorbMine.length - 1; i >= 0; i--) {
          const e = absorbMine[i]!;
          if (e.kind !== 'school_absorb') continue;
          if (!target.schoolAbsorbs.some((a) => a.id === e.spellId)) {
            target.buffActive.delete(e.spellId);
            const idx = effects.lastIndexOf(e);
            if (idx >= 0) effects.splice(idx, 1);
            push({ t, kind: 'aura', actor: target.side, name: e.name, applied: false });
          }
        }
      }
      dmg = sa.leftover;
    }
    if (target.manaShields.length > 0 && dmg > 0) {
      const manaNow = currentManaForShield(target);
      const ms = applyManaShield(target.manaShields, dmgSchoolMask, dmg, manaNow);
      target.manaShields = ms.auras;
      if (ms.manaSpent > 0) setManaForShield(target, ms.mana);
      if (ms.absorbed > 0) {
        absorbed += ms.absorbed;
        rageRaw = Math.max(0, rageRaw - ms.absorbed);
        const shieldMine = ctx.effectsOn(target.side);
        for (let i = shieldMine.length - 1; i >= 0; i--) {
          const e = shieldMine[i]!;
          if (e.kind !== 'mana_shield') continue;
          if (!target.manaShields.some((a) => a.id === e.spellId)) {
            target.buffActive.delete(e.spellId);
            const idx = effects.lastIndexOf(e);
            if (idx >= 0) effects.splice(idx, 1);
            push({ t, kind: 'aura', actor: target.side, name: e.name, applied: false });
          }
        }
      }
      dmg = ms.leftover;
    }
    // Split damage flat (Blessing of Sacrifice) — before pct. Cite: Unit.cpp:2501–2537 then pct.
    if (target.splitDamageFlat && dmg > 0) {
      const sp = applySplitDamageFlat(target.splitDamageFlat, dmgSchoolMask, dmg, target.side);
      if (sp.split > 0 && sp.redirectToId) {
        const linked = sideFighter?.(sp.redirectToId as Side);
        if (linked && !dead(linked)) {
          const curL = Number.isFinite(linked.hp) ? linked.hp : 0;
          linked.hp = Math.max(0, Math.round(curL - sp.split));
          // SPLIT_DAMAGE DealDamage on the linked unit — aura interrupt, no channel delay.
          // Cite: Unit.cpp:2537–2538, 1269–1270.
          onDamaged(linked, sp.split, opts?.damageType, opts?.spell?.id, {
            attacker: opts?.attacker,
            skipChannelDelay: true,
          });
        }
        // Split portion is dealt to the linked unit; victim cleanDamage follows leftover HP path.
        rageRaw = Math.max(0, rageRaw - sp.split);
        dmg = sp.leftover;
      }
    }
    // Split damage (Soul Link) — structure only; redirect to linked unit when present.
    if (target.splitDamage && dmg > 0) {
      const sp = applySplitDamagePct(target.splitDamage, dmgSchoolMask, dmg, target.side);
      if (sp.split > 0 && sp.redirectToId) {
        const linked = sideFighter?.(sp.redirectToId as Side);
        if (linked && !dead(linked)) {
          // Apply split as residual HP hit without re-entering absorb stack for the same packet.
          const curL = Number.isFinite(linked.hp) ? linked.hp : 0;
          linked.hp = Math.max(0, Math.round(curL - sp.split));
          onDamaged(linked, sp.split, opts?.damageType, opts?.spell?.id, {
            attacker: opts?.attacker,
            skipChannelDelay: true,
          });
        }
        rageRaw = Math.max(0, rageRaw - sp.split);
        dmg = sp.leftover;
      }
    }

    // Full absorb of the HP packet: physical residual cleanDamage still yields taken rage.
    // Cite: Unit.cpp:951–956 (damage==0 branch, SPELL_SCHOOL_MASK_NORMAL only).
    if (dmg <= 0) {
      if (
        school === 'physical'
        && rageRaw > 0
        && target.spec.powerType === 'rage'
        && opts?.attacker !== target
      ) {
        gainRage(target, rewardRage(Math.round(rageRaw), target.spec.level, false));
      }
      // takenOrAbsorbedDamage still strips AIF_DAMAGE auras / DAMAGE-flagged channels.
      // InterruptOrDelaySpell does not run (no DelayedChannel). Cite: Unit.cpp:915–950, 953–960.
      if (absorbed > 0) {
        onDamaged(target, 0, opts?.damageType, opts?.spell?.id, {
          absorbed,
          attacker: opts?.attacker,
        });
      }
      return 0;
    }
    // At least 1 residual damage reaches HP after absorbs only when leftover > 0.
    dmg = Math.max(1, dmg);
    const cur = Number.isFinite(target.hp) ? target.hp : 0;
    let nextHp = Math.max(0, Math.round(cur - dmg));

    if (nextHp <= 0 && target.buffActive.has(SPIRIT_OF_REDEMPTION_TALENT_SPELL_ID) && !target.buffActive.has(SPIRIT_OF_REDEMPTION_AURA_SPELL_ID) && opts?.spell?.id !== SUICIDE_SPELL_ID) {
      nextHp = target.spec.maxHealth;
      if (ctx.removeAllAurasOnDeath) ctx.removeAllAurasOnDeath(target);
      const spiritSpell = ctx.spellOf?.(SPIRIT_OF_REDEMPTION_AURA_SPELL_ID);
      if (spiritSpell && ctx.applySpell) ctx.applySpell(target, target, spiritSpell);
    }

    // UNKILLABLE / SetDeathPrevention — leave 1 HP. INSTAKILL sets hp=0 elsewhere.
    // Cite: CreatureDefines.h UNKILLABLE=0x08; CreatureAI.cpp:130-135; Unit.cpp:1000-1001.
    if (nextHp <= 0 && isEnemySide(target.side)) {
      const cs = enemyCastBySide.get(target.side as EnemySide);
      if (cs?.eventAi.deathPrevention || (((target.spec.staticFlags ?? 0) & 0x08) !== 0)) {
        nextHp = 1;
        if (cs && !cs.eventAi.deathPreventionFired) {
          cs.eventAi.deathPreventionFired = true;
          const acts = cs.scriptDev?.ir.lifecycle?.onPreventedDeath ?? [];
          if (acts.length) ctx.applyScriptDevCombatActions?.(target, acts);
        }
      }
    }
    // A duel never kills: the killing blow floors the loser at 1 HP and ends the fight. The clamp lives
    // HERE because finalize names the winner off the wipe flags, so a yield would report a timeout.
    if (nextHp <= 0 && ctx.cfg.duel === true && isDuelistSide(target.side)
      && opts?.attacker != null && opts.attacker !== target) {
      nextHp = 1;
      if (!ctx.ended) {
        ctx.ended = true;
        ctx.winner = target.side === 'player' ? 'enemy' : 'player';
        push({ t, kind: 'flavor', text: `${target.spec.name} yields.` });
      }
    }
    target.hp = nextHp;
    // EventAI DamageTaken health-step AI events (90/50/10). Cite: CreatureEventAI.cpp:1841–1871.
    ctx.notifyEventAiDamageTaken?.(target, cur, dmg);
    // FrostWeakness / Freeze OnProc. Cite: boss_viscidus.cpp:552-565,422-428.
    if (isEnemySide(target.side)) {
      ctx.notifyScriptDevHitCount?.(target, {
        school,
        melee: opts?.damageType === 'weapon' && !opts?.ranged,
      });
    }
    // EVENT_T_KILL fires the KILLER's AI once when the blow lands, not on the corpse sweep, because
    // that is where the killer is known. 25 DB rows, 14 on dungeon creatures.
    if (nextHp <= 0 && cur > 0 && opts?.attacker && opts.attacker !== target) {
      const killer = opts.attacker;
      if (isEnemySide(killer.side) && !isEnemySide(target.side)) ctx.notifyEventAiKill?.(killer, target);
      // PROC_FLAG_KILL, at the killing blow for the same reason the AI hook is here. Most rows need
      // the corpse to have been worth XP or honor. Cite: Unit.cpp:1080; UnitAuraProcHandler.cpp:536.
      if (!isTrivialLevelDifference(killer.spec.level, target.spec.level)) {
        triggerProcs(killer, target, false, 'kill', null);
      }
    }
    // PvP combat timer: damage dealt/taken refreshes IsInCombat for both parties.
    // Cite: Unit.cpp DealDamage → SetInCombatState; CombatManager TriggerCombatTimer(pvp).
    touchCombatFlag(target, t);
    if (opts?.attacker && opts.attacker !== target) touchCombatFlag(opts.attacker, t);
    if (isEnemySide(target.side)) maybeAggroZonePulse(target, ctx.partyUnits(), t);
    if (
      target.hp <= 0
      && opts?.spell
      && isDrainSoulSpell(opts.spell)
      && opts.attacker
      && isPlayerCharacterSide(opts.attacker.side)
    ) {
      target.soulShardLethalCredit = opts.attacker.side;
    }
    onDamaged(target, dmg, opts?.damageType, opts?.spell?.id, {
      absorbed,
      attacker: opts?.attacker,
    });
    // Anastari Possess: break when possessed unit ≤ 50% max health.
    // Cite: boss_baroness_anastari.cpp AnastariPossess OnPeriodicTickEnd + AI ≤ .5f.
    if (
      isCharmed(target)
      && target.charmBreakHpFrac > 0
      && target.hp <= target.spec.maxHealth * target.charmBreakHpFrac
    ) {
      breakCharm(target);
    }
    // Threat: damage to enemy → dealer gains threat (Unit.cpp HandleDamageDealt).
    applyDamageThreat(opts?.attacker, target, dmg, !!opts?.crit, opts?.spell);
    // Rage from damage taken — Unit.cpp DealDamage victim path ~1233 (cleanDamage, not HP packet).
    // Attacker rage is only from melee DIRECT_DAMAGE (weaponStrike); spell damage dealt does not RewardRage.
    if (rageRaw > 0 && target.spec.powerType === 'rage' && opts?.attacker !== target) {
      gainRage(target, rewardRage(Math.round(rageRaw), target.spec.level, false));
    }
    // Damage shields and charged take-hit buffs. Skipped for shield retaliation damage so the two
    // cannot loop, and a dot is rejected by the flag match rather than by a special case.
    if (
      dmg > 0
      && opts?.attacker
      && opts.attacker !== target
      && opts.damageType !== 'shield'
    ) {
      // Charge consume runs even if attacker already died mid-packet; shields need a live foe.
      const hit = {
        damageType: opts.damageType,
        ranged: opts.ranged,
        spell: opts.spell ?? null,
      };
      if (!dead(opts.attacker)) {
        fireDamageShields(target, opts.attacker, hit);
      } else {
        // Attacker dead — still drop Inner Fire charges on the real damage packet.
        consumeChargedBuffsOnTakeHit(
          target,
          takeDamageEventFlags(hit.damageType, hit),
        );
      }
    }
    // Vampiric Embrace: shadow damage the VE CASTER deals to the afflicted target heals the caster and
    // party for a percent. That percent lives on the target, not on the caster.
    if (
      dmg > 0
      && opts?.attacker
      && target.vampiricEmbracePct > 0
      && target.vampiricEmbraceCasterSide != null
      && opts.attacker.side === target.vampiricEmbraceCasterSide
      && school === 'shadow'
      && (opts.damageType === 'spell' || opts.damageType === 'dot')
      && opts.attacker !== target
    ) {
      const caster = opts.attacker;
      const healAmt = Math.round((dmg * target.vampiricEmbracePct) / 100);
      if (healAmt > 0) {
        const casterFriendly = caster.side === 'player' || caster.side === 'pet' || isAllySide(caster.side);
        for (const fr of (casterFriendly ? livingFriendlies() : [caster])) {
          if (dead(fr)) continue;
          const before = fr.hp;
          fr.hp = Math.min(fr.spec.maxHealth, fr.hp + healAmt);
          if (fr.hp !== before) push({ t, kind: 'heal', actor: fr.side, amount: fr.hp - before, ...(fr !== caster && ctx.allyBlock().length > 0 ? { source: caster.side } : {}) });
        }
      }
    }
    // Eye for an Eye: magic damage taken → return pct% (damage+absorb) to attacker, cap 50% max HP.
    // Weapon specials (physical/melee DmgClass) do not proc. Cite: UnitAuraProcHandler.cpp:795–808.
    if (
      dmg > 0
      && target.eyeForAnEyePct > 0
      && opts?.attacker
      && opts.attacker !== target
      && opts.damageType !== 'shield'
      && opts.damageType !== 'weapon'
      && school !== 'physical'
      && !dead(opts.attacker)
    ) {
      const reflect = eyeForAnEyeReflectAmount(
        target.eyeForAnEyePct,
        dmg, // absorb already stripped above; C++ uses damage+absorb pre-HP — residual dmg is the landed part
        target.spec.maxHealth,
      );
      if (reflect > 0) {
        const before = opts.attacker.hp;
        opts.attacker.hp = Math.max(0, Math.round(opts.attacker.hp - reflect));
        if (opts.attacker.hp !== before) {
          push({
            t,
            kind: 'spell_hit',
            actor: target.side,
            target: opts.attacker.side,
            spellId: EYE_FOR_AN_EYE_DAMAGE_SPELL_ID,
            name: 'Eye for an Eye',
            result: 'hit',
            amount: before - opts.attacker.hp,
            school: 'holy',
          });
        }
      }
    }
    // Obsidian Armor: non-physical school damage taken → cast school resist buff on self.
    // Cite: UnitAuraProcHandler.cpp:910–930 case 27539 GetFirstSchoolInMask → 27533–27540.
    if (
      dmg > 0
      && target.obsidianArmorActive
      && opts?.attacker
      && opts.attacker !== target
      && school !== 'physical'
    ) {
      const trigId = obsidianArmorTriggeredSpellId(school);
      if (trigId > 0) {
        const trig =
          target.spec.spells.find((s) => s.id === trigId)
          ?? opts.attacker.spec.spells.find((s) => s.id === trigId);
        // Payload must be on the kit (bake may omit trinket triggers). Cite: 27533–27540.
        if (trig) applyProc(target, target, trig);
      }
    }
    // Adaptive Warding: Mage Armor gate + school resist buff (ignore physical/holy).
    // Cite: UnitAuraProcHandler.cpp:870–907 case 28764.
    if (
      dmg > 0
      && target.adaptiveWardingActive
      && opts?.attacker
      && opts.attacker !== target
      && school !== 'physical'
      && school !== 'holy'
    ) {
      const hasMageArmor = MAGE_ARMOR_SPELL_IDS.some((id) => target.buffActive.has(id));
      if (hasMageArmor) {
        const trigId = adaptiveWardingTriggeredSpellId(school);
        if (trigId > 0) {
          const trig =
            target.spec.spells.find((s) => s.id === trigId)
            ?? opts.attacker.spec.spells.find((s) => s.id === trigId);
          if (trig) applyProc(target, target, trig);
        }
      }
    }
    // Cheat Death: damage that crosses below 20% max HP → cast 28846 healing-taken buff.
    // Gate uses pre-hit HP. Cite: UnitAuraProcHandler.cpp:1378–1383.
    if (
      dmg > 0
      && target.cheatDeathActive
      && opts?.attacker
      && opts.attacker !== target
    ) {
      // dealDamage already subtracted; reconstruct pre-hit as current + dmg (approx post-mitigation).
      const preHitHp = target.hp + dmg;
      if (cheatDeathShouldProc(preHitHp, target.spec.maxHealth, dmg)) {
        const trig =
          target.spec.spells.find((s) => s.id === CHEAT_DEATH_HEALING_TAKEN_SPELL_ID);
        if (trig) applyProc(target, target, trig);
      }
    }
    // Master of Elements: spell crit → refund pct% of mana cost via 29077.
    // Cite: UnitAuraProcHandler.cpp:949–964.
    if (
      dmg > 0
      && opts?.attacker
      && opts.attacker.masterOfElementsPct > 0
      && opts.crit
      && (opts.damageType === 'spell' || opts.damageType === 'dot')
      && opts.attacker !== target
      && opts.spell
      && opts.attacker.spec.powerType === 'mana'
    ) {
      const refund = masterOfElementsRefundAmount(
        opts.spell.cost ?? 0,
        opts.attacker.masterOfElementsPct,
      );
      if (refund > 0) {
        const caster = opts.attacker;
        const before = caster.power;
        caster.power = Math.min(caster.spec.maxPower, caster.power + refund);
        if (caster.power !== before) {
          push({
            t,
            kind: 'resource',
            actor: caster.side,
            power: 'mana',
            value: caster.power,
            delta: caster.power - before,
          });
          // Mention payload id for census + event surface.
          push({
            t,
            kind: 'spell_hit',
            actor: caster.side,
            target: caster.side,
            spellId: MASTER_OF_ELEMENTS_TRIGGER_SPELL_ID,
            name: 'Master of Elements',
            result: 'hit',
            amount: caster.power - before,
            school: 'arcane',
          });
        }
      }
    }
    // Ignite: fire spell damage the caster deals → DoT 12654 with rank% basepoints.
    // Cite: UnitAuraProcHandler.cpp:970–985 triggered_spell_id = 12654.
    if (
      dmg > 0
      && opts?.attacker
      && opts.attacker.igniteRankSpellId > 0
      && school === 'fire'
      && (opts.damageType === 'spell' || opts.damageType === 'dot')
      && opts.attacker !== target
      && !dead(target)
    ) {
      const bp = igniteBasepoints(opts.attacker.igniteRankSpellId, dmg);
      if (bp > 0) {
        // Ignite: a 4000 ms duration at a 2000 ms amplitude, so two ticks, and the custom base points
        // are the per-tick amount. Cite: UnitAuraProcHandler.cpp:978–985.
        const tickAmt = bp;
        const durationMs = 4000;
        const tickMs = 2000;
        const existing = ctx.effectsOn(target.side).find(
          (e) => e.kind === 'dot' && e.spellId === IGNITE_DOT_SPELL_ID && e.source === opts.attacker!.side,
        );
        if (existing && existing.kind === 'dot') {
          // Refresh/stack: classic re-applies; keep stronger tick.
          existing.min = Math.max(existing.min ?? 0, tickAmt);
          existing.max = Math.max(existing.max ?? 0, tickAmt);
          existing.expiresAt = t + durationMs;
          existing.nextTickAt = t + tickMs;
          ctx.touchEffect(existing);
        } else {
          effects.push({
            kind: 'dot',
            source: opts.attacker.side,
            target: target.side,
            spellId: IGNITE_DOT_SPELL_ID,
            name: 'Ignite',
            school: 'fire',
            min: tickAmt,
            max: tickAmt,
            expiresAt: t + durationMs,
            tickMs,
            nextTickAt: t + tickMs,
          });
          push({ t, kind: 'aura', actor: target.side, name: 'Ignite', applied: true });
        }
      }
    }
    // Deep Wounds: physical melee crit → DoT 12721 with weaponDamage×rank%/6 per tick.
    // Cite: UnitAuraProcHandler.cpp:1316–1342.
    if (
      dmg > 0
      && opts?.attacker
      && opts.attacker.deepWoundsRankSpellId > 0
      && opts.crit
      && school === 'physical'
      && (opts.damageType === 'weapon' || opts.damageType === 'spell')
      && opts.attacker !== target
      && !dead(target)
    ) {
      const wpn = opts.attacker.spec.weapon;
      const avg = deepWoundsAverageWeaponDamage(wpn.dmgMin, wpn.dmgMax);
      const tickAmt = deepWoundsTickBasepoints(opts.attacker.deepWoundsRankSpellId, avg);
      if (tickAmt > 0) {
        const durationMs = DEEP_WOUND_DOT_DURATION_MS;
        const tickMs = DEEP_WOUND_DOT_TICK_MS;
        const existing = ctx.effectsOn(target.side).find(
          (e) => e.kind === 'dot'
            && e.spellId === DEEP_WOUND_DOT_SPELL_ID
            && e.source === opts.attacker!.side,
        );
        if (existing && existing.kind === 'dot') {
          existing.min = Math.max(existing.min ?? 0, tickAmt);
          existing.max = Math.max(existing.max ?? 0, tickAmt);
          existing.expiresAt = t + durationMs;
          existing.nextTickAt = t + tickMs;
          ctx.touchEffect(existing);
        } else {
          effects.push({
            kind: 'dot',
            source: opts.attacker.side,
            target: target.side,
            spellId: DEEP_WOUND_DOT_SPELL_ID,
            name: 'Deep Wound',
            school: 'physical',
            min: tickAmt,
            max: tickAmt,
            expiresAt: t + durationMs,
            tickMs,
            nextTickAt: t + tickMs,
          });
          push({ t, kind: 'aura', actor: target.side, name: 'Deep Wound', applied: true });
        }
      }
    }
    // Pyroclasm: Hellfire/RoF periodic damage the caster deals → chance stun 18093.
    // chance = baseChance / tickCount. Cite: UnitAuraProcHandler.cpp:1347–1375.
    if (
      dmg > 0
      && opts?.attacker
      && opts.attacker.pyroclasmRankSpellId > 0
      && opts.damageType === 'dot'
      && opts.spell
      && opts.attacker !== target
      && !dead(target)
    ) {
      const famFlags = (opts.spell.spellFamilyFlags ?? 0) | 0;
      const ticks = pyroclasmTickCountForFamilyFlags(famFlags);
      if (ticks > 0) {
        const chance = pyroclasmChancePct(opts.attacker.pyroclasmRankSpellId, ticks);
        if (pyroclasmStunFires(chance, rng.next())) {
          // applyControl(src, tgt, spell, ccEff, durMs). Cite: createSession applyControl.
          const stunSpell: SpellDef = {
            id: PYROCLASM_STUN_SPELL_ID,
            name: 'Pyroclasm',
            rank: 0,
            school: 'fire',
            role: 'control',
            powerType: 'mana',
            cost: 0,
            castTimeMs: 0,
            cooldownMs: 0,
            gcdMs: 0,
            rangeMax: 30,
            reqLevel: 1,
            effects: [],
          };
          const stunEff = {
            kind: 'cc' as const,
            control: 'stun' as const,
            durationMs: PYROCLASM_STUN_DURATION_MS,
            school: 'fire' as const,
            mechanic: 'stun' as const,
          };
          const durMs = applyDr(opts.attacker, target, stunEff.mechanic, PYROCLASM_STUN_DURATION_MS);
          if (durMs > 0 && !ccImmune(target, stunEff.mechanic, undefined)) {
            applyControl(opts.attacker, target, stunSpell, stunEff, durMs);
            push({
              t,
              kind: 'aura',
              actor: target.side,
              name: 'Pyroclasm',
              applied: true,
              spellId: PYROCLASM_STUN_SPELL_ID,
            });
          }
        }
      }
    }
    return dmg;
  };

  /** Mana used by Mana Shield — primary mana bar or parallel (druid form) mana. */
  function currentManaForShield(f: Fighter): number {
    if (f.spec.powerType === 'mana') return f.power;
    return f.mana;
  }
  function setManaForShield(f: Fighter, mana: number): void {
    const m = Math.max(0, Math.trunc(mana));
    if (f.spec.powerType === 'mana') {
      f.power = Math.min(f.spec.maxPower, m);
    } else {
      f.mana = Math.min(f.maxMana, m);
    }
  }

  const grantImmunityAura = (
    owner: Fighter,
    aura: import('../spells/immunity.ts').ImmunityAura,
    expiresAt: number,
    name: string,
    source: Side,
  ): void => (ctx.grantImmunityAura as Function)(owner, aura, expiresAt, name, source);

  // Consume proc charges on buff auras when the bearer takes a real damage packet whose event flags
  // match. The Priest family only needs damage above 0; the generic system still gates on the flags.
  const consumeChargedBuffsOnTakeHit = (victim: Fighter, eventFlags: number): void => {
    if (eventFlags === 0) return;
    const t = ctx.t;
    const mine = ctx.effectsOn(victim.side);
    for (let i = mine.length - 1; i >= 0; i--) {
      const e = mine[i]!;
      if (e.kind !== 'buff') continue;
      if (e.charges == null || e.charges <= 0) continue;
      if (e.expiresAt <= t) continue;
      // ProcFlags on the live row (OOC seed / in-combat apply). Kit lookup is fallback
      // when the holder is also a known combat spell.
      const spell =
        victim.spec.spells.find((s) => s.id === e.spellId)
        ?? null;
      const pf = (e.procFlags ?? spell?.procFlags ?? 0) | 0;
      // No flags on the def → do not invent a take-hit consumer (unrelated charged buffs).
      if (pf === 0 || (pf & eventFlags) === 0) continue;
      const { remaining, remove } = consumeProcCharge(e.charges);
      if (remove) {
        ctx.removeAurasDueToSpell?.(victim, e.spellId);
      } else {
        e.charges = remaining;
      }
    }
  };

  // Fire damage shields and take-side proc auras on the victim at the attacker, with the shield damage
  // type preventing re-entry. A deal-only aura is skipped here — the deal path owns it.
  // Depth 1, which is CMaNGOS's shape: Unit::DealDamage deals damage-shield damage with a direct
  // DealDamage that does not re-enter proc handling. Without it two units that both punish being hit
  // never unwind - a warrior mirror with Retaliation on both sides overflowed the stack and killed
  // round 2026-08-29-r7 mid-cell (KI-1071, repro-duel-shield-recursion.mjs).
  let shieldDepth = 0;

  const fireDamageShields = (
    victim: Fighter,
    attacker: Fighter,
    hit?: { damageType?: string; ranged?: boolean; spell?: SpellDef | null },
  ): void => {
    if (shieldDepth > 0) return;
    shieldDepth++;
    try {
      fireDamageShieldsInner(victim, attacker, hit);
    } finally {
      shieldDepth--;
    }
  };

  const fireDamageShieldsInner = (
    victim: Fighter,
    attacker: Fighter,
    hit?: { damageType?: string; ranged?: boolean; spell?: SpellDef | null },
  ): void => {
    const t = ctx.t;
    // SUPPRESS_TARGET_PROCS zeroes the VICTIM's mask for this cast, so nothing on the target fires from
    // it. 23 rows, and it exists because Sap must not proc the target's own responses.
    if (hit?.spell && hasAttrEx3(hit.spell, SPELL_ATTR_EX3.SUPPRESS_TARGET_PROCS)) return;
    // Charged mod-buffs first: drop a charge on matching take-hit flags. Independent of the shield
    // retaliation, since a charge drop needs only the damage packet and not a living attacker.
    if (hit) {
      consumeChargedBuffsOnTakeHit(victim, takeDamageEventFlags(hit.damageType, hit));
    }
    const mine = ctx.effectsOn(victim.side);
    for (let i = mine.length - 1; i >= 0; i--) {
      // Shield damage can removeAurasDueToSpell the holder; skip already-dropped snapshot rows.
      // Repro: repro-duel-damage-shield-index.mjs.
      const e = mine[i];
      if (!e) continue;
      if (e.kind !== 'damage_shield' && e.kind !== 'proc_trigger_spell') continue;
      if (e.expiresAt <= t) continue;
      if (e.charges != null && e.charges <= 0) continue;
      if ((e.nextProcAt ?? 0) > t) continue;

      if (e.kind === 'damage_shield') {
        const school = e.school ?? 'nature';
        const lo = e.min ?? 1;
        const hi = e.max ?? lo;
        let raw = rollBetween(lo, hi, rng.next());
        // Fold spell power in, as the trigger path does — the shield path went straight to damage, so a
        // shield ignored it entirely. The magnitude is the CASTER's, and a shield can sit on someone else.
        const shieldCaster = e.source === victim.side
          ? victim
          : (sideFighter?.(e.source as Side) ?? victim);
        const shieldSpell = shieldCaster.spec.spells.find((s) => s.id === e.spellId);
        if (shieldSpell) {
          // The live effect carries no slot; recover it from the def effect it was applied from.
          const shieldSlot = shieldSpell.effects.find((x) => x.kind === 'damage_shield')?.effectSlot ?? 0;
          raw = applySpellDamageBonusIfPresent(raw, shieldSpell, shieldSlot, {
            spellPower: shieldCaster.spec.spellPower,
            spellDamageBySchool: shieldCaster.spec.spellDamageBySchool,
            school,
            attackPower: shieldCaster.attackPower,
            damagePct: shieldCaster.damagePctBySchool[school],
          });
        }
        const amount = dealDamage(attacker, raw, school, victim.spec.level, {
          damageType: 'shield',
          attacker: victim,
        });
        if (amount > 0) {
          push({
            t, kind: 'spell_hit', actor: victim.side, target: attacker.side, spellId: e.spellId, name: e.name,
            result: 'hit', amount, school,
          });
          applyDamageThreat(victim, attacker, amount, false, undefined);
        }
      } else if (e.kind === 'proc_trigger_spell') {
        // PERIODIC_TRIGGER_SPELL (tickMs) fires on the channel schedule, not on taken hits.
        // Cite: SpellAuras SPELL_AURA_PERIODIC_TRIGGER_SPELL (23) vs PROC_TRIGGER_SPELL (42).
        if (e.tickMs && e.tickMs > 0) continue;
        // Removal-body holder: fires when the aura ends, never on a hit (and it carries no
        // procFlags, which the pf === 0 rule below would otherwise read as "any taken hit").
        if (e.onRemove) continue;

        // Cite: UnitAuraProcHandler.cpp:585. ONLY_PROC_ON_CASTER refuse aura procs unless holder target is the caster.
        const holderSpell = e.spellId ? ctx.spellOf?.(e.spellId) : null;
        if (holderSpell && hasAttrEx3(holderSpell, SPELL_ATTR_EX3.ONLY_PROC_ON_CASTER)) {
          if (e.target !== e.source) continue;
        }

        // Retaliation fails when the attack comes from behind, using the same behind test the openers
        // do rather than inventing a cone. Cite: Warrior.cpp:55–57; UnitAuraProcHandler.cpp:846.
        if (e.spellId === RETALIATION_AURA_SPELL_ID) {
          const behindOk = ctx.behindOk;
          if (behindOk && behindOk(attacker, victim)) continue;
        }
        // Deal-only aura-42 (SoJ: procFlags 20) must not retaliate on taken hits.
        const pf = e.procFlags ?? 0;
        if (pf !== 0 && (pf & PROC_FLAGS_TAKE_MELEE) === 0) continue;
        // Roll the sourced chance or rate. The deal path already did; the take path used to fire at 100%
        // whenever the flags matched.
        if ((e.procChance != null && e.procChance > 0) || (e.procPpm != null && e.procPpm > 0)) {
          const takeFlags = hit
            ? takeDamageEventFlags(hit.damageType, hit)
            : (PROC_FLAG.TAKE_MELEE_SWING | PROC_FLAG.TAKE_MELEE_ABILITY | PROC_FLAG.TAKE_ANY_DAMAGE);
          const takeCtx: ProcEventContext = {
            procFlags: takeFlags,
            procEx: procExFromOutcome('hit'),
            weaponSpeedMs: attacker.spec.weapon.speedMs,
            nowMs: t,
            schoolMask: SCHOOL_MASK.NORMAL,
            outdoors: ctx.cfg.outdoors,
          };
          const fired = tryProc(
            {
              procFlags: pf !== 0 ? pf : takeFlags,
              chance: e.procChance ?? null,
              ppm: e.procPpm ?? null,
              customChance: e.procChance ?? null,
              cooldownReadyAt: 0,
              cooldownMs: e.cooldownMs,
            },
            takeCtx,
            rng,
          );
          if (!fired) continue;
        }

        // Judgement of Light and Wisdom heal or restore the STRIKER on a landed melee hit. The
        // intermediate carriers are absent in the live bake, so the amounts are applied here.
        if (e.onHitHeal != null && e.onHitHeal > 0) {
          if (!dead(attacker)) {
            const before = attacker.hp;
            const heal = Number.isFinite(e.onHitHeal) ? e.onHitHeal : 0;
            attacker.hp = Math.min(attacker.spec.maxHealth, Math.round(attacker.hp + heal));
            if (attacker.hp !== before) {
              push({ t, kind: 'heal', actor: attacker.side, amount: attacker.hp - before });
            }
          }
        } else if (e.onHitMana != null && e.onHitMana > 0) {
          if (attacker.spec.powerType === 'mana' && attacker.spec.maxPower > 0) {
            const before = attacker.power;
            const gain = Number.isFinite(e.onHitMana) ? e.onHitMana : 0;
            attacker.power = Math.min(attacker.spec.maxPower, attacker.power + gain);
            if (attacker.power !== before) {
              push({
                t,
                kind: 'resource',
                actor: attacker.side,
                power: 'mana',
                value: Math.round(attacker.power),
                delta: attacker.power - before,
              });
            }
          }
        } else if (e.triggerSpellId) {
          // Resolve the trigger off the fighter's spell list, since the kit may include proc ids. The
          // full apply covers damage, CC and debuffs; a trap payload may only exist as a synthetic row.
          const tid = e.triggerSpellId | 0;
          // GO trap Use is radius-of-placement, not "anyone who hits the hunter".
          // Geometry present → proximity path owns the spring. Cite: GameObject.cpp:436–503.
          if (isHunterTrapTriggerSpellId(tid)) {
            const trapPos = e.trapPosYd ?? ctx.posOf?.(victim.side);
            if (trapPos != null) continue;
          }
          const trig =
            victim.spec.spells.find((s) => s.id === tid)
            ?? attacker.spec.spells.find((s) => s.id === tid)
            ?? (isHunterTrapTriggerSpellId(tid) ? syntheticHunterTrapPayload(tid) : null)
            ?? ctx.spellOf?.(tid);
          if (trig) {
            applyProc(victim, attacker, trig);
            // Freezing Trap Effect is control-only; surface enemy aura for UI/QA (KI-608).
            if (isHunterTrapTriggerSpellId(tid)) {
              push({ t, kind: 'aura', actor: attacker.side, name: trig.name, applied: true });
            }
          }
        } else {
          continue; // no payload
        }
      }

      const cd = e.cooldownMs ?? 0;
      e.nextProcAt = t + cd;
      if (e.charges != null) {
        const { remaining, remove } = consumeProcCharge(e.charges);
        if (remove) {
          ctx.removeAurasDueToSpell?.(victim, e.spellId);
        } else {
          e.charges = remaining;
        }
      }
    }
  };

  // Aura-42 self-buffs that proc when the bearer DEALS melee, like a seal's stun. The session rng is
  // drawn only when a matching aura is live, so a fight without one stays byte-identical.
  const fireDealMeleeAura42 = (
    attacker: Fighter,
    victim: Fighter,
    wasCrit: boolean,
    flagsHint: 'melee_swing' | 'melee_ability',
    hand: 'mainhand' | 'offhand' = 'mainhand',
  ): void => {
    const t = ctx.t;
    const mine = ctx.effectsOn(attacker.side);
    let procCtx: ReturnType<typeof makeProcCtx> | undefined;
    for (let i = mine.length - 1; i >= 0; i--) {
      const e = mine[i]!;
      if (e.kind !== 'proc_trigger_spell' || !e.triggerSpellId) continue;
      if (e.expiresAt <= t) continue;
      if (e.tickMs && e.tickMs > 0) continue; // channel schedule only
      if (e.onRemove) continue; // removal-body holder — fires at expiry, not on a swing
      if (e.charges != null && e.charges <= 0) continue;
      if ((e.nextProcAt ?? 0) > t) continue;

      // Cite: UnitAuraProcHandler.cpp:585. ONLY_PROC_ON_CASTER refuse aura procs unless holder target is the caster.
      const holderSpell = e.spellId ? ctx.spellOf?.(e.spellId) : null;
      if (holderSpell && hasAttrEx3(holderSpell, SPELL_ATTR_EX3.ONLY_PROC_ON_CASTER)) {
        if (e.target !== e.source) continue;
      }

      // A weapon enchant cannot proc off paws, nor off a disarmed main hand: the C++ checks the hand is
      // usable before the roll. Windfury Totem hands its enchant to druids too, who were procing it.
      if (e.fromWeaponEnchant
        && !canUseEquippedWeapon(hand, attacker.form, attacker.disarmedUntil > t)) continue;
      // Deal path requires DEAL-side flags (SoJ = 20). No flags → take-path only.
      const pf = e.procFlags ?? 0;
      if (pf === 0) continue;
      procCtx ??= makeProcCtx(attacker, wasCrit, flagsHint);
      if ((procCtx.procFlags & pf) === 0) continue;

      const fired = tryProc({
          procFlags: pf,
          chance: e.procChance ?? null,
          ppm: e.procPpm ?? null,
          customChance: e.procChance ?? null,
          cooldownReadyAt: 0, // nextProcAt already gated above
          cooldownMs: e.cooldownMs,
        },
        procCtx,
        rng,
      );
      if (!fired) continue;

      // Mana Drain Trigger: dual cast self 29471 + victim 27526 (not single DBC trigger 18350).
      // Cite: UnitAuraProcHandler.cpp:1284–1291 case 27522.
      if ((e.spellId | 0) === MANA_DRAIN_TRIGGER_SPELL_ID) {
        if (!dead(attacker)) {
          const selfGain = attacker.spec.spells.find((s) => s.id === MANA_DRAIN_SELF_GAIN_SPELL_ID);
          if (selfGain) applyProc(attacker, attacker, selfGain);
        }
        if (!dead(victim)) {
          const drain = attacker.spec.spells.find((s) => s.id === MANA_DRAIN_VICTIM_DRAIN_SPELL_ID)
            ?? victim.spec.spells.find((s) => s.id === MANA_DRAIN_VICTIM_DRAIN_SPELL_ID);
          if (drain) applyProc(attacker, victim, drain);
        }
      } else if ((e.spellId | 0) === DEADLY_SWIFTNESS_SPELL_ID) {
        // Deadly Swiftness (Rank 1): deal damage to target below 20% health triggers 10% speed buff on self.
        // Cite: UnitAuraProcHandler.cpp:1293–1301.
        if (deadlySwiftnessVictimEligible(victim.hp, victim.spec.maxHealth)) {
          const buff = attacker.spec.spells.find((s) => s.id === SPEED_BONUS_10_PCT_SPELL_ID)
            ?? ctx.spellOf?.(SPEED_BONUS_10_PCT_SPELL_ID);
          if (buff) applyProc(attacker, attacker, buff);
        }
      } else if (e.triggerSpellId === -1 && (e.spellId | 0) === 4533) {
        // Dreamwalker Raiment 2 pieces bonus (override script 4533).
        // Trigger is chosen from victim power type at proc time. Cite: UnitAuraProcHandler.cpp:1629–1643.
        const victimPowerType = victim.spec.powerType;
        let triggered_spell_id = 0;
        if (victimPowerType === 'mana') {
          triggered_spell_id = 28722;
        } else if (victimPowerType === 'rage') {
          triggered_spell_id = 28723;
        } else if (victimPowerType === 'energy') {
          triggered_spell_id = 28724;
        }
        if (triggered_spell_id > 0 && !dead(victim)) {
          const trig = ctx.spellOf?.(triggered_spell_id);
          if (trig) {
            applyProc(attacker, victim, trig);
          }
        }
      } else {
        const trig =
          attacker.spec.spells.find((s) => s.id === e.triggerSpellId)
          ?? victim.spec.spells.find((s) => s.id === e.triggerSpellId)
          // Weapon-enchant procs handed over by a totem (Windfury 8516) live here — the party
          // member never had them in its own kit. Cite: EffectEnchantHeldItem TEMP_ENCHANTMENT_SLOT.
          ?? attacker.totemTriggerSpells?.find((s) => s.id === e.triggerSpellId)
          // Last is the global store (E6.2): a creature's proc payload is on no cast list.
          ?? ctx.spellOf?.(e.triggerSpellId | 0);
        // not allow proc extra attack spell at extra attack
        // Cite: Player.cpp:7383–7385 CastItemCombatSpell; UnitAuraProcHandler.cpp:1550–1551.
        if (
          trig
          && attacker.extraAttacksExecuting
          && trig.effects.some((x) => x.kind === 'extra_attacks')
        ) {
          continue;
        }
        if (trig) applyProc(attacker, victim, trig);
      }

      const cd = e.cooldownMs ?? 0;
      e.nextProcAt = t + cd;
      if (e.charges != null) {
        const { remaining, remove } = consumeProcCharge(e.charges);
        if (remove) {
          attacker.buffActive.delete(e.spellId);
          const idx = effects.lastIndexOf(e);
          if (idx >= 0) effects.splice(idx, 1);
          push({ t, kind: 'aura', actor: attacker.side, name: e.name, applied: false });
        } else {
          e.charges = remaining;
        }
      }
    }
  };

  // Resolve and apply a hunter trap's payload, then consume the arm charge. A freezing effect lands as
  // control rather than an aura, so an enemy aura row is emitted too for the debuff bar.
  const fireHunterTrapSpring = (
    owner: Fighter,
    tgt: Fighter,
    e: (typeof effects)[number],
    effectIndex: number,
  ): boolean => {
    const t = ctx.t;
    const tid = (e.triggerSpellId ?? 0) | 0;
    const trig =
      owner.spec.spells.find((s) => s.id === tid)
      ?? tgt.spec.spells.find((s) => s.id === tid)
      ?? syntheticHunterTrapPayload(tid)
      ?? ctx.spellOf?.(tid)
      ?? null;
    if (!trig) return false;

    applyProc(owner, tgt, trig);
    // Always surface enemy aura chip (CC path only emits kind:control; DoT path already
    // emits aura — a second applied:true is harmless and keeps QA filters simple).
    push({ t, kind: 'aura', actor: tgt.side, name: trig.name, applied: true });

    const cd = e.cooldownMs ?? 0;
    e.nextProcAt = t + cd;
    if (e.charges != null) {
      const { remaining, remove } = consumeProcCharge(e.charges);
      if (remove) {
        owner.buffActive.delete(e.spellId);
        effects.splice(effectIndex, 1);
        push({ t, kind: 'aura', actor: owner.side, name: e.name, applied: false });
      } else {
        e.charges = remaining;
      }
    } else {
      owner.buffActive.delete(e.spellId);
      effects.splice(effectIndex, 1);
      push({ t, kind: 'aura', actor: owner.side, name: e.name, applied: false });
    }
    return true;
  };

  // Spring hunter traps when an unfriendly unit enters the GO radius of the PLACED position — the caster's
  // feet at arm time, since the object does not follow the hunter. For that lock, diameter IS radius.
  const springProximityHunterTraps = (): void => {
    const t = ctx.t;
    const posOf = ctx.posOf;
    if (typeof posOf !== 'function') return;
    // `livingEnemies` is required on CombatContext (context.ts:367), so the old
    // `typeof === 'function'` else-branch was unreachable and filtered a different array.
    const living = ctx.livingEnemies();
    if (!living.length) return;

    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i]!;
      if (e.kind !== 'proc_trigger_spell') continue;
      if (!e.triggerSpellId || !isHunterTrapTriggerSpellId(e.triggerSpellId)) continue;
      if (e.expiresAt <= t) continue;
      if (e.charges != null && e.charges <= 0) continue;
      if ((e.nextProcAt ?? 0) > t) continue;
      if (e.tickMs && e.tickMs > 0) continue;

      const owner = sideFighter?.(e.target as Side);
      if (!owner || dead(owner)) continue;

      // A trap is a GO at the point it was armed and it never moves (GameObject.cpp:436-503, Use is
      // radius-of-placement). Re-reading the owner every tick instead let an unstamped trap ride the
      // hunter around the floor, springing on whatever the party walked past.
      if (!e.trapPosYd) {
        const p = posOf(owner.side);
        if (!p) continue;
        e.trapPosYd = { ...p };
      }
      const trapPos = e.trapPosYd;

      let tgt: Fighter | undefined;
      for (const en of living) {
        const d = combatDistanceYd(trapPos, posOf(en.side));
        if (d != null && d <= HUNTER_TRAP_RADIUS_YD) {
          tgt = en;
          break;
        }
      }
      if (!tgt || dead(tgt)) continue;

      fireHunterTrapSpring(owner, tgt, e, i);
    }
  };

  ctx.triggerProcs = triggerProcs;
  ctx.triggerTakenProcs = triggerTakenProcs;
  ctx.applyProc = applyProc;
  ctx.rollGearProcs = rollGearProcs;
  ctx.dealDamage = dealDamage;
  ctx.fireDamageShields = fireDamageShields;
  ctx.fireDealMeleeAura42 = fireDealMeleeAura42;
  ctx.springProximityHunterTraps = springProximityHunterTraps;
  ctx.powerOfType = powerOfType;
  ctx.maxPowerOfType = maxPowerOfType;
  ctx.setPowerOfType = setPowerOfType;
  ctx.casterPowerTypeId = casterPowerTypeId;
  ctx.powerTypeName = powerTypeName;
}
