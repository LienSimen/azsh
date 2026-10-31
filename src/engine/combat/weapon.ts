// Peeled from createSession (Wave 4 hub: weapon). Pattern (D). Extracted modules must not import combat.ts.
// NOTE: imports may need expanding when first run against seam tests.

import type { CombatContext } from './context.ts';
import type { Fighter, ActiveEffect, WeaponProfile } from './types.ts';
import type { SpellDef, BuffMod } from '../../data/schema.ts';
import type { HitResult } from '../core/events.ts';
import { isEnemySide, isAllySide, isTotemSide } from '../core/events.ts';
import {
  TUNING,
  meleeBaseDamage,
  offhandDamageTotalPct,
  critMultiplierWithVersus,
  disarmedWeaponProfile,
  meleeAttackTable,
  pickMeleeOutcome,
  pickMeleeSpellLand,
  remapRangedWhiteOutcome,
  meleeOutcomeMultiplier,
  spellCritChance,
  calculateEffectiveCritChance,
  calculateEffectiveBlockChance,
  calculateEffectiveDazeChance,
  SPELL_RANGE_IDX,
  scaleTime,
  applyShieldBlockAbsorb,
  rewardRage,
  BASE_ATTACK_TIME_MS,
} from './formulas.ts';
import { flametongueSwingDamage } from '../spells/interpreter/weapon-imbue-kit.ts';
import { fighterSpellCrit, applyBuffMod, reverseBuffMod } from './fighterFactory.ts';
import { applyOwnedSpellMod, SPELLMOD_CRITICAL_CHANCE } from '../spells/spellModIntents.ts';
import { roleOf } from './roles.ts';
import { sumVersusForCreatureType } from '../../domain/character/characterStats.ts';
import { markSpeedDirty } from './speedAura.ts';
import { canUseEquippedWeapon } from './equippedItemGate.ts';
import { creatureSkipsParryHaste, parryHasteRemaining } from '../spells/parryHaste.ts';
import { CREATURE_STATIC_FLAGS2 } from '../../domain/creature/creatureAiConstants.ts';
import { isNextMeleeSwingSpell } from '../spells/recovery.ts';

/** Versus AP for a creature type — thin alias for MeleeDamageBonusDone APbonus. */
function sumVersusAp(
  rows: Array<{ creatureTypeMask: number; amount: number }> | undefined,
  creatureType: number,
): number {
  return sumVersusForCreatureType(rows, creatureType);
}

// CanCrit for the ability crit roll: a creature can never crit with a spell, and the spell must carry
// a crittable effect. The white swing keeps its own crit. Cite: Unit.cpp:3434-3448.
function canCritWithAbility(src: Fighter, spell: SpellDef | null): boolean {
  if (isEnemySide(src.side)) return false;
  return !spell || spellCanCrit(spell);
}

// Instant-ability defense gates. Land-die block is not baked, so yellows partial-block after the crit
// roll. Cite: Unit.cpp:3129-3186 CanReactOnAbility / CanDodgeAbility / CanParryAbility.
function abilityDefense(
  spell: SpellDef | null,
  attackType: 'melee' | 'ranged',
): { dodge: boolean; parry: boolean; deflect: boolean; partialBlock: boolean; completelyBlocked: boolean } {
  if (!spell) return { dodge: true, parry: attackType !== 'ranged', deflect: false, partialBlock: false, completelyBlocked: false };
  if (hasAttr(spell, SPELL_ATTR.NO_ACTIVE_DEFENSE)) {
    return { dodge: false, parry: false, deflect: false, partialBlock: false, completelyBlocked: false };
  }
  const dc = spell.dmgClass;
  const melee = dc == null ? attackType === 'melee' : dc === SPELL_DAMAGE_CLASS.MELEE;
  const ranged = dc == null ? attackType === 'ranged' : dc === SPELL_DAMAGE_CLASS.RANGED;
  const physical = spell.school == null || spell.school === 'physical';
  // Parry versus deflect is one exclusive split: parry needs a MELEE class, a physical school and a
  // close-combat range index. Everything else deflects at the same chance. Cite: Unit.cpp:3145-3212.
  const ri = spell.rangeIndex ?? 0;
  const closeRange = ri === 0 || ri === SPELL_RANGE_IDX.SELF_ONLY || ri === SPELL_RANGE_IDX.COMBAT;
  const parry = melee && physical && closeRange;
  const completelyBlocked = hasAttrEx3(spell, SPELL_ATTR_EX3.COMPLETELY_BLOCKED);
  return {
    dodge: melee,
    parry,
    deflect: ranged || (melee && !parry),
    partialBlock: (melee || ranged) && !completelyBlocked,
    completelyBlocked,
  };
}
import { isTotemCreatureType } from '../spells/immunity.ts';
import {
  SPELL_ATTR, SPELL_ATTR_EX3, hasAttr, hasAttrEx3, spellCanCrit,
} from '../spells/spellAttributes.ts';
import { effectiveMagicResistancePercent, SPELL_DAMAGE_CLASS } from './mitigation.ts';
import { resolveWeaponPercentDamage } from '../spells/effects.ts';
import { consumeProcCharge } from '../spells/auraStacking.ts';
import {
  flurryMayConsumeCharge,
  isFlurryHasteRank,
  SWEEPING_STRIKES_PLAYER_SPELL_ID,
  SWEEPING_STRIKES_NPC_SPELL_ID,
  SWEEPING_STRIKES_COPY_DAMAGE_SPELL_ID,
  SWEEPING_STRIKES_NORMALIZED_SPELL_ID,
  isSweepingStrikesAuraSpell,
  normalizedMeleeSpeedSec,
  sweepingStrikesUsesNormalized,
  sealOfRighteousnessProcDamageSpellId,
} from '../spells/cmangos-special-cases.ts';
import {
  isAttackSpeedOverriddenShapeShift,
} from '../../domain/character/forms.ts';
import { COMBAT_SKILL, tryCombatSkillGain } from '../../domain/character/combatSkills.ts';
import { emitSimEffect } from './simEffects.ts';
import { CREATURE_TYPE } from '../../data/schema.ts';
import { MIN_AGGRO_DISTANCE } from '../../domain/creature/creatureAi.ts';
import { stampDefensiveAuraState } from './reactiveGates.ts';

export type installWeaponDeps = {
  dead: (...args: any[]) => any;
  sanitizeHp: (...args: any[]) => any;
  spend: (...args: any[]) => any;
  gainRage: (...args: any[]) => any;
  addComboPoints: (...args: any[]) => any;
  clearComboPoints: (...args: any[]) => any;
  comboOn: (...args: any[]) => any;
  onDamaged: (...args: any[]) => any;
  dealDamage: (...args: any[]) => any;
  applySpell: (...args: any[]) => any;
  triggerProcs: (...args: any[]) => any;
  triggerTakenProcs: (...args: any[]) => any;
  rollGearProcs: (...args: any[]) => any;
  fireDamageShields: (...args: any[]) => any;
  fireDealMeleeAura42: (...args: any[]) => any;
  breakStealth: (...args: any[]) => any;
  maybeBreakStealthOn: (...args: any[]) => any;
  sealRighteousnessSwing: (...args: any[]) => any;
};

export function installWeapon(ctx: CombatContext, deps: installWeaponDeps): void {
  const push = (e: any) => ctx.push(e);
  const player = ctx.player;
  const pet = ctx.pet;
  const effects = ctx.effects;
  const touchEffect = (e: ActiveEffect): void => { ctx.touchEffect(e); };
  const itemsSpent = ctx.itemsSpent;
  const rng = ctx.rng;
  const tickMs = ctx.tickMs;
  const livingEnemies = ctx.livingEnemies;
  const distanceBetween = ctx.distanceBetween;
  // CanReactInCombat plus the in-flight-spell clause all three avoidance gates carry: a controlled or
  // mid-cast unit sets no dodge, parry or block. Parry also needs a usable main hand, so disarm ends it.
  const canReactNow = (tgt: Fighter): boolean => {
    if ((ctx.isControlledHard as (u: Fighter) => boolean)(tgt)) return false;
    if (tgt.castingSpell) return false;
    return !(tgt.channeling && ctx.t < tgt.channeling.endsAt);
  };
  const canParryNow = (tgt: Fighter): boolean => {
    if (!tgt.spec.canParry) return false;
    if (tgt.disarmedUntil > ctx.t) return false;
    return canReactNow(tgt);
  };
  // Attack profile for this hand, with DISARM folded into the MAIN hand only: a disarmed unit keeps
  // swinging for 1-2 unarmed damage at the base time. Cite: Unit.h:1191-1204 CanUseEquippedWeapon.
  const handProfile = (src: Fighter, hand: 'mainhand' | 'offhand'): WeaponProfile => {
    if (hand === 'offhand' && src.spec.offhand) return src.spec.offhand;
    if (src.disarmedUntil > ctx.t) return disarmedWeaponProfile(src.spec.weapon);
    return src.spec.weapon;
  };
  const applyDamageThreat = (...args: any[]) => (ctx.applyDamageThreat as Function)(...args);
  /** DISCOUNT_POWER_ON_MISS refund; a no-op when powerForm has not installed. */
  const refundPowerOnMiss = (f: Fighter, spell: SpellDef | null, outcome: string): void => {
    if (spell) ctx.refundPowerOnMiss?.(f, spell, outcome);
  };
  const applySpellThreatBonus = (...args: any[]) => (ctx.applySpellThreatBonus as Function)(...args);
  const engageOnHostileSpell = (...args: any[]) => (ctx.engageOnHostileSpell as Function)(...args);
  const dead = deps.dead;
  const sanitizeHp = deps.sanitizeHp;
  const spend = deps.spend;
  const gainRage = deps.gainRage;
  const addComboPoints = deps.addComboPoints;
  const clearComboPoints = deps.clearComboPoints;
  const comboOn = deps.comboOn;
  const onDamaged = deps.onDamaged;
  const dealDamage = deps.dealDamage;
  const applySpell = deps.applySpell;
  /** ctx.isInFrontArc, resolved lazily — sessionGeometry installs it after this module. */
  const inFrontArc = (observer: Fighter, other: Fighter): boolean =>
    ctx.isInFrontArc ? ctx.isInFrontArc(observer, other) : true;
  const triggerProcs = deps.triggerProcs;
  const triggerTakenProcs = deps.triggerTakenProcs;
  const rollGearProcs = deps.rollGearProcs;
  const fireDamageShields = deps.fireDamageShields;
  const fireDealMeleeAura42 = deps.fireDealMeleeAura42;
  const breakStealth = deps.breakStealth;
  const maybeBreakStealthOn = deps.maybeBreakStealthOn;
  const sealRighteousnessSwing = deps.sealRighteousnessSwing;

  const applyWeaponImbueOnSwing = (
    src: Fighter,
    tgt: Fighter,
    hand: 'mainhand' | 'offhand' = 'mainhand',
  ): void => {
    const t = ctx.t;
    const imbue = src.weaponImbues[hand] ?? (hand === 'mainhand' ? src.weaponImbues.mainhand : undefined);
    if (!imbue || imbue.expiresAt <= t) return;
    // Cat and bear swings are paws, not the enchanted item, and a DISARMED main hand is not the item
    // either — so no imbue procs at all. The off hand is exempt from the disarm arm.
    if (!canUseEquippedWeapon(hand, src.form, src.disarmedUntil > t)) return;
    // Flametongue, Frostbrand and Rockbiter ride the swing target only. On the endless floor a fan bug
    // handed passives 40 yd out ~14 fire per white, so imbue damage is refused outside melee.
    if (ctx.cfg.endless) {
      const d = distanceBetween(src, tgt);
      if (d == null || d > MIN_AGGRO_DISTANCE) return;
    }
    const wpn = handProfile(src, hand);
    const speedSec = wpn.speedMs / 1000;

    // TYPE_TOTEM Rockbiter is speed-scaled weapon damage; Classic DBC ranks use an attack-power mod
    // instead, and never both — sheet AP plus a per-swing add double-counts.
    if (imbue.rockbiterAmount && !imbue.attackPower) {
      const add = imbue.rockbiterAmount * speedSec;
      if (add > 0) {
        const amount = dealDamage(tgt, add, 'physical', src.spec.level, { attacker: src });
        push({
          t, kind: 'spell_hit', actor: src.side, target: tgt.side, spellId: imbue.spellId, name: imbue.name,
          result: 'hit', amount, school: 'physical',
        });
      }
    }
    // TYPE_DAMAGE flat
    if (imbue.damageFlat) {
      const amount = dealDamage(tgt, imbue.damageFlat, 'physical', src.spec.level, { attacker: src });
      push({
        t, kind: 'spell_hit', actor: src.side, target: tgt.side, spellId: imbue.spellId, name: imbue.name,
        result: 'hit', amount, school: 'physical',
      });
    }

    const combat = imbue.combat;
    if (!combat) return;

    // Chance: PPM first, else the flat percent amount, else the weapon-speed heuristic. Flametongue's
    // DBC amount is 100, meaning 100% per landed swing. Cite: SpellItemEnchantment.
    let chance01: number;
    if (imbue.combatPpm && imbue.combatPpm > 0) {
      chance01 = Math.min(1, (wpn.speedMs * imbue.combatPpm) / 60000);
    } else if (imbue.combatChancePct != null && imbue.combatChancePct > 0) {
      chance01 = Math.min(1, imbue.combatChancePct / 100);
    } else {
      // GetWeaponProcChance: speed * 1.8 / 1000 as percent → /100 for probability.
      chance01 = Math.min(1, (speedSec * 1.8) / 100);
    }
    if (!rng.chance(chance01)) return;

    if (combat.direct) {
      // Flametongue's direct minimum is the DUMMY coefficient, not flat fire: the total is damage
      // times 0.01 times weapon speed. Detect by family or by id, so a gap deals no raw coefficient.
      const isFlametongue =
        imbue.family === 'flametongue'
        || combat.spellId === 10444
        || (combat.name ?? '').toLowerCase() === 'flametongue attack';
      let roll: number;
      if (isFlametongue) {
        roll = flametongueSwingDamage(combat.direct.min, speedSec);
      } else {
        roll = combat.direct.min + (combat.direct.max - combat.direct.min) * rng.next();
      }
      if (roll > 0) {
        const amount = dealDamage(tgt, roll, combat.direct.school, src.spec.level, {
          damageType: 'spell', attacker: src,
        });
        if (amount > 0) {
          push({
            t, kind: 'spell_hit', actor: src.side, target: tgt.side, spellId: combat.spellId, name: combat.name,
            result: 'hit', amount, school: combat.direct.school,
          });
        }
      }
    }
    if (combat.dot) {
      // Deadly Poison DoT. stepSession ticks read e.min/e.max (applySpell path); amount-only
      // left every tick at 0 (KI-716). Cite: applySpell.ts dot branch; stepSession rollBetween.
      const d = combat.dot;
      effects.push({
        kind: 'dot',
        source: src.side,
        target: tgt.side,
        spellId: combat.spellId,
        name: combat.name,
        school: d.school,
        min: d.min,
        max: d.max,
        amount: d.min,
        tickMs: d.tickMs,
        nextTickAt: t + d.tickMs,
        expiresAt: t + d.durationMs,
      });
      push({ t, kind: 'aura', actor: tgt.side, name: combat.name, applied: true });
    }
    // Frostbrand chill and Crippling Poison snare. The frostbrand family always snares even when the
    // bake stamped only direct damage. Cite: spell 8034 effects.
    const snare = combat.speed ?? (imbue.family === 'frostbrand'
      ? { aura: 33, pct: -25, durationMs: 8000, hostile: true, mechanic: 'snare' }
      : undefined);
    if (snare) {
      const exp = t + (snare.durationMs > 0 ? snare.durationMs : 8000);
      const live = ctx.effectsOn(tgt.side).find(
        (e) => e.kind === 'speed' && e.spellId === combat.spellId,
      );
      if (live) {
        live.expiresAt = exp;
        live.pct = snare.pct;
        live.hostile = snare.hostile !== false;
        markSpeedDirty(tgt);
        touchEffect(live);
      } else {
        effects.push({
          kind: 'speed',
          source: src.side,
          target: tgt.side,
          spellId: combat.spellId,
          name: combat.name,
          aura: snare.aura,
          pct: snare.pct,
          hostile: snare.hostile !== false,
          expiresAt: exp,
        });
      }
      push({ t, kind: 'aura', actor: tgt.side, name: combat.name, applied: true });
    }
    if (combat.buffs?.length) {
      for (const b of combat.buffs) {
        const exp = t + (b.durationMs > 0 ? b.durationMs : 10_000);
        const mod = b.mod as BuffMod;
        const live = ctx.effectsOn(tgt.side).find(
          (e) => e.kind === 'buff' && e.spellId === combat.spellId
            && e.mod === mod,
        );
        if (live) {
          reverseBuffMod(tgt, live.mod, live.amount ?? 0);
          live.amount = b.amount;
          live.expiresAt = exp;
          applyBuffMod(tgt, mod, b.amount);
          touchEffect(live);
        } else {
          applyBuffMod(tgt, mod, b.amount);
          effects.push({
            kind: 'buff',
            source: src.side,
            target: tgt.side,
            spellId: combat.spellId,
            name: combat.name,
            mod,
            amount: b.amount,
            expiresAt: exp,
          });
        }
      }
      push({ t, kind: 'aura', actor: tgt.side, name: combat.name, applied: true });
    }
    // Non-damage poison procs: Crippling snare / Mind-numbing haste / Wound healing_taken.
    // Cite: CastItemCombatSpell → combat spell; KI-717.
    if (combat.speed) {
      const s = combat.speed;
      const exp = t + (s.durationMs > 0 ? s.durationMs : 12_000);
      const live = ctx.effectsOn(tgt.side).find(
        (e) => e.kind === 'speed' && e.spellId === combat.spellId,
      );
      if (live) {
        live.expiresAt = exp;
        live.pct = s.pct;
        live.hostile = s.hostile !== false;
        markSpeedDirty(tgt);
        touchEffect(live);
      } else {
        effects.push({
          kind: 'speed',
          source: src.side,
          target: tgt.side,
          spellId: combat.spellId,
          name: combat.name,
          aura: s.aura,
          pct: s.pct,
          hostile: s.hostile !== false,
          expiresAt: exp,
        });
      }
      push({ t, kind: 'aura', actor: tgt.side, name: combat.name, applied: true });
      push({
        t, kind: 'spell_hit', actor: src.side, target: tgt.side,
        spellId: combat.spellId, name: combat.name, result: 'hit', amount: 0,
      });
    }
    if (combat.buffs?.length) {
      for (const b of combat.buffs) {
        const exp = t + (b.durationMs > 0 ? b.durationMs : 10_000);
        const mod = b.mod as BuffMod;
        const live = ctx.effectsOn(tgt.side).find(
          (e) => e.kind === 'buff' && e.spellId === combat.spellId
            && e.mod === mod,
        );
        if (live) {
          // Refresh: reverse old amount, re-apply new (same stack).
          reverseBuffMod(tgt, live.mod, live.amount ?? 0);
          live.amount = b.amount;
          live.expiresAt = exp;
          applyBuffMod(tgt, mod, b.amount);
          touchEffect(live);
        } else {
          applyBuffMod(tgt, mod, b.amount);
          effects.push({
            kind: 'buff',
            source: src.side,
            target: tgt.side,
            spellId: combat.spellId,
            name: combat.name,
            mod,
            amount: b.amount,
            expiresAt: exp,
          });
        }
      }
      push({ t, kind: 'aura', actor: tgt.side, name: combat.name, applied: true });
      // Do not emit amount:0 spell_hit for pure buff notifies — Windfury meters treat those
      // as failed extra attacks (KI-580). Damage rows come from extraAttacks / weaponStrike.
    }
    if (combat.extraAttacks && combat.extraAttacks > 0) {
      // not allow proc extra attack spell at extra attack
      // Cite: Player.cpp:7383–7385 CastItemCombatSpell; Unit.cpp m_extraAttacksExecuting.
      if (src.extraAttacksExecuting) return;
      // Windfury: extra white hits with a temporary AP bonus on the extras only, never a standing
      // aura. Through the full weaponStrike path so meters name the proc and mitigation is real.
      const apBonus = combat.apBonus ?? 0;
      const savedAp = src.attackPower;
      src.attackPower = savedAp + apBonus;
      src.extraAttacksExecuting = true;
      src.extraAttackSource = { spellId: combat.spellId, name: combat.name };
      for (let i = 0; i < combat.extraAttacks; i++) {
        if (dead(tgt) || dead(src)) break;
        weaponStrike(src, tgt, null, hand);
      }
      src.extraAttacksExecuting = false;
      src.extraAttackSource = null;
      src.attackPower = savedAp;
    }
  };

  // A paladin seal fires on each landed melee swing while it is up: Righteousness is deterministic
  // holy, Command a 7-PPM chance, Light a self-heal, Wisdom mana. Only Command draws rng.
  // The dealer is passed because DealDamage needs one: the duel yield, threat and kill credit all
  // hang off it (Unit.cpp:967 `if (dealer)`), and without it Seal of Command killed duelists.
  const applySealOnSwing = (src: Fighter, tgt: Fighter, hand: 'mainhand' | 'offhand' = 'mainhand'): void => {
    const t = ctx.t;
    const seal = src.activeSeal;
    if (!seal || seal.expiresAt <= t) return;
    const wpn = handProfile(src, hand);
    if (seal.seal === 'righteousness' && seal.coeff) {
      const amount = dealDamage(tgt, sealRighteousnessSwing(seal.coeff, wpn), 'holy', src.spec.level, { attacker: src });
      push({ t, kind: 'spell_hit', actor: src.side, target: tgt.side, spellId: sealOfRighteousnessProcDamageSpellId(seal.spellId) || seal.spellId, name: seal.name, result: 'hit', amount, school: 'holy' });
    } else if (seal.seal === 'command' && seal.onSwingWeaponPct) {
      // mangos PPM → per-swing chance: ppm * weaponSpeed / 60 (UnitAuraProcHandler proc gating).
      const speed = wpn.speedMs / 1000;
      const chance = Math.min(1, (seal.procPpm ?? 7) * speed / 60);
      if (rng.chance(chance)) {
        // Seal of Command uses weapon damage path; OH inherits the off-hand TOTAL_PCT.
        const oh = hand === 'offhand';
        const wd = meleeBaseDamage(wpn.dmgMin, wpn.dmgMax, src.attackPower, wpn.speedMs, rng.next(), {
          totalPct: oh ? offhandDamageTotalPct(src.offhandDamagePct) : 1,
        });
        const amount = dealDamage(tgt, wd * seal.onSwingWeaponPct / 100, 'holy', src.spec.level, { attacker: src });
        push({ t, kind: 'spell_hit', actor: src.side, target: tgt.side, spellId: seal.spellId, name: seal.name, result: 'hit', amount, school: 'holy' });
      }
    } else if (seal.seal === 'light' && seal.onSwingHeal) {
      if (dead(src)) return;
      const before = src.hp;
      const heal = Number.isFinite(seal.onSwingHeal) ? seal.onSwingHeal : 0;
      src.hp = Math.min(src.spec.maxHealth, Math.round(src.hp + heal));
      if (src.hp !== before) push({ t, kind: 'heal', actor: src.side, amount: src.hp - before });
    } else if (seal.seal === 'wisdom' && seal.onSwingMana) {
      const before = src.power;
      src.power = Math.min(src.spec.maxPower, src.power + seal.onSwingMana);
      if (src.power !== before) push({ t, kind: 'resource', actor: src.side, power: src.spec.powerType, value: Math.round(src.power), delta: src.power - before });
    }
  };

  /** Player-controlled: player / pet / totem sides, or explicit spec flag. */
  const isPlayerOrPetSide = (f: Fighter): boolean =>
    f.spec.isPlayerOrPet ?? (f.side === 'player' || f.side === 'pet' || isAllySide(f.side) || isTotemSide(f.side));

  // CanDazeInCombat: only a creature that is not player-controlled dazes, only a PLAYER can be dazed,
  // and the attacker must be facing the victim's back. Cite: Unit.cpp:2999 CanDaze, :3124.
  const maybeDaze = (
    src: Fighter,
    tgt: Fighter,
    atkCtx: { atkLevel: number; defLevel: number; attackerWeaponSkill?: number; defenderDefenseSkill?: number },
    attackType: 'melee' | 'ranged',
  ): void => {
    if (attackType !== 'melee') return;
    const spell = ctx.dazeSpell;
    if (!spell) return;
    if (isPlayerOrPetSide(src)) return;
    if (!(tgt.side === 'player' || isAllySide(tgt.side))) return;
    if (inFrontArc(tgt, src)) return;
    if (!inFrontArc(src, tgt)) return;
    const chance = calculateEffectiveDazeChance({
      atkLevel: atkCtx.atkLevel,
      defLevel: atkCtx.defLevel,
      baseCrit: 0,
      defenderParries: false,
      defenderBlocks: false,
      attackerWeaponSkill: atkCtx.attackerWeaponSkill,
      defenderDefenseSkill: atkCtx.defenderDefenseSkill,
    });
    if (!rng.chance(chance)) return;
    applySpell(src, tgt, spell);
  };

  const crushFields = (src: Fighter) => ({
    noCrushingBlows: ((src.spec.staticFlags2 ?? 0) & CREATURE_STATIC_FLAGS2.NO_CRUSHING_BLOWS) !== 0,
    attackerCharmerIsCreature: !!(
      ctx.isCharmed?.(src) && src.charmedBy != null && isEnemySide(src.charmedBy)
    ),
  });

  // Dual-wield active for attack tables / OH autos: gear flag + OH profile, not form override. source:
  // hasOffhandWeaponForAttack; IsAttackSpeedOverridenShapeShift suppresses OH.
  const fighterDualWield = (f: Fighter): boolean =>
    !!f.spec.dualWield && !!f.spec.offhand && !isAttackSpeedOverriddenShapeShift(f.form);

  // Shorten the defender's remaining MH/OH timer after a parry. Ranged mode overloads swingReadyAt as Auto
  // Shot — leave it. Cite: Unit.cpp:2158–2195.
  const applyParryHaste = (defender: Fighter): void => {
    if (creatureSkipsParryHaste(defender.spec.extraFlags)) return;
    if (defender.mode === 'ranged') return;
    const now = ctx.t;
    const mhPeriod = defender.disarmedUntil > now
      ? BASE_ATTACK_TIME_MS
      : scaleTime(defender.spec.weapon.speedMs, defender.haste, 0);
    const mhRemain = defender.swingReadyAt - now;
    if (fighterDualWield(defender) && defender.spec.offhand) {
      const ohPeriod = scaleTime(defender.spec.offhand.speedMs, defender.haste, 0);
      const ohRemain = defender.ohSwingReadyAt - now;
      if (ohRemain < mhRemain) {
        defender.ohSwingReadyAt = now + parryHasteRemaining(ohRemain, ohPeriod);
        return;
      }
    }
    defender.swingReadyAt = now + parryHasteRemaining(mhRemain, mhPeriod);
  };

  // Weapon/defense skill gain on melee-based outcomes. Cite: Unit.cpp ProcSkillsAndReactives →
  // Player::UpdateCombatSkills (hit/crit/miss/dodge/parry/block vs non-player non-critter).
  const SKILL_GAIN_RESULTS = new Set<HitResult>([
    'hit', 'crit', 'miss', 'dodge', 'parry', 'block', 'glancing', 'crushing',
  ]);
  /** GetSkillValue for a hand = pure trained + MOD_SKILL bonuses. */
  const weaponSkillForHand = (
    f: Fighter,
    hand: 'mainhand' | 'offhand' | 'ranged',
  ): number | undefined => {
    if (hand === 'offhand') {
      return f.spec.offhandWeaponSkill ?? f.spec.weaponSkill;
    }
    if (hand === 'ranged') {
      return f.spec.rangedWeaponSkill ?? f.spec.weaponSkill;
    }
    return f.spec.weaponSkill;
  };

  /** Refresh live attack-table skill after pure skill gain (keep bonuses). */
  const refreshWeaponSkillAfterGain = (
    f: Fighter,
    skillId: number,
    pure: number,
    hand: 'mainhand' | 'offhand' | 'ranged',
  ): void => {
    const bonus = f.spec.skillBonuses?.[skillId] ?? 0;
    const effective = Math.max(0, pure + bonus);
    if (hand === 'offhand') f.spec.offhandWeaponSkill = effective;
    else if (hand === 'ranged') f.spec.rangedWeaponSkill = effective;
    else f.spec.weaponSkill = effective;
  };

  const tryMeleeSkillGains = (
    attacker: Fighter,
    defender: Fighter,
    result: HitResult,
    hand: 'mainhand' | 'offhand' | 'ranged',
  ): void => {
    if (!SKILL_GAIN_RESULTS.has(result)) return;
    // Player attacker vs NPC: weapon skill (pure map only; bonuses stay on skillBonuses).
    if (
      attacker.side === 'player'
      && attacker.spec.combatSkills
      && !isPlayerOrPetSide(defender)
      && defender.creatureType !== CREATURE_TYPE.CRITTER
      && !isAttackSpeedOverriddenShapeShift(attacker.form)
    ) {
      let skillId = 0;
      if (hand === 'offhand') skillId = attacker.spec.offhandSkillId ?? 0;
      else if (hand === 'ranged') skillId = attacker.spec.rangedSkillId ?? 0;
      else skillId = attacker.spec.weaponSkillId ?? COMBAT_SKILL.UNARMED;
      if (skillId) {
        const r = tryCombatSkillGain(attacker.spec.combatSkills, skillId, attacker.spec.level, {
          defence: false,
          intellect: attacker.spec.intellect ?? 0,
          roll: () => rng.next(),
        });
        attacker.spec.combatSkills = r.map;
        if (r.gained) {
          const row = r.map[skillId];
          refreshWeaponSkillAfterGain(attacker, skillId, row?.current ?? 0, hand);
          if (row) emitSimEffect(ctx, { kind: 'skillGain', skillId, current: row.current, max: row.max });
        }
      }
    }
    // Player defender vs NPC: defense skill
    if (
      defender.side === 'player'
      && defender.spec.combatSkills
      && !isPlayerOrPetSide(attacker)
      && attacker.creatureType !== CREATURE_TYPE.CRITTER
    ) {
      const r = tryCombatSkillGain(
        defender.spec.combatSkills,
        COMBAT_SKILL.DEFENSE,
        defender.spec.level,
        {
          defence: true,
          intellect: defender.spec.intellect ?? 0,
          roll: () => rng.next(),
        },
      );
      defender.spec.combatSkills = r.map;
      if (r.gained) {
        const row = r.map[COMBAT_SKILL.DEFENSE];
        const bonus = defender.spec.skillBonuses?.[COMBAT_SKILL.DEFENSE] ?? 0;
        defender.spec.defenseSkill = Math.max(0, (row?.current ?? 0) + bonus);
        if (row) {
          emitSimEffect(ctx, {
            kind: 'skillGain', skillId: COMBAT_SKILL.DEFENSE, current: row.current, max: row.max,
          });
        }
      }
    }
  };

  // Extra hit for Sweeping Strikes. White/yellow weapon hits call this from weaponStrike; melee-class
  // school damage (Execute, Bloodthirst) calls it from applySpell. Cite: UnitAuraProcHandler.cpp:810-841.
  const trySweepingStrikesExtra = (
    src: Fighter,
    tgt: Fighter,
    amount: number,
    spell: SpellDef | null,
    isIgnoreMods: boolean,
  ): void => {
    if (src.sweepingStrikesCharges <= 0 || !isEnemySide(tgt.side) || amount <= 0) return;
    const procId = spell?.id;
    if (procId === SWEEPING_STRIKES_COPY_DAMAGE_SPELL_ID || procId === SWEEPING_STRIKES_NORMALIZED_SPELL_ID) return;
    const combatPool = ctx.livingCombatEnemies?.() ?? livingEnemies();
    const pool = combatPool.filter((e) => {
      if (e.side === tgt.side || dead(e)) return false;
      const d = distanceBetween(src, e);
      // No geometry → allow (legacy multi-pack fixtures). Else ATTACK_DISTANCE (5 yd).
      // Cite: Unit.cpp SelectRandomUnfriendlyTarget radius default ATTACK_DISTANCE.
      if (d == null) return true;
      return d <= MIN_AGGRO_DISTANCE;
    });
    if (pool.length === 0) return;
    const other = pool[Math.floor(rng.next() * pool.length)]!;
    src.sweepingStrikesCharges--;
    const maxHp = other.spec.maxHealth || other.hp;
    const hpFrac = maxHp > 0 ? other.hp / maxHp : 1;
    const useNorm = sweepingStrikesUsesNormalized(procId, hpFrac);
    let cleave: number;
    if (useNorm) {
      // 26654 NORMALIZED_WEAPON_DMG — roll MH normalized then armor-mitigate.
      // Cite: Unit.cpp GetAPMultiplier; SpellEffects.cpp EffectWeaponDmg normalized.
      const mh = src.spec.weapon;
      const normSpeed = normalizedMeleeSpeedSec({
        twoHand: mh.twoHand,
        weaponSubclass: src.spec.mainhandWeaponSubclass,
      });
      const markAp = other.attackerAttackPowerBonus || 0;
      const versusAp = sumVersusAp(src.attackPowerVersus, other.creatureType);
      const rawNorm = meleeBaseDamage(
        mh.dmgMin, mh.dmgMax, src.attackPower + markAp + versusAp, mh.speedMs, rng.next(),
        {
          normalized: true,
          normalizedSpeedSec: normSpeed,
          level: src.spec.level,
          enchantFlat: (src.spec.enchantFlatMh ?? 0)
            + (isIgnoreMods ? 0 : sumVersusForCreatureType(src.damageDoneCreature, other.creatureType)),
        },
      );
      const physPct = src.damagePctBySchool.physical ?? 0;
      const rawScaled = (!isIgnoreMods && physPct) ? rawNorm * (1 + physPct / 100) : rawNorm;
      cleave = dealDamage(other, rawScaled, 'physical', src.spec.level, {
        damageType: 'weapon', attacker: src, crit: false,
      });
    } else {
      // 12723: basepoints[0] = damage already dealt (no second armor pass).
      const beforeHp = other.hp;
      other.hp = Math.max(0, Math.round(other.hp - amount));
      cleave = beforeHp - other.hp;
      onDamaged(other, cleave, 'weapon');
    }
    if (cleave > 0) applyDamageThreat(src, other, cleave, false, spell ?? undefined);
    push({
      t: ctx.t, kind: 'spell_hit', actor: src.side, target: other.side,
      spellId: useNorm ? SWEEPING_STRIKES_NORMALIZED_SPELL_ID : SWEEPING_STRIKES_COPY_DAMAGE_SPELL_ID,
      name: 'Sweeping Strikes', result: 'hit', amount: cleave, school: 'physical',
    });
    if (src.sweepingStrikesCharges === 0) {
      for (const sid of [SWEEPING_STRIKES_PLAYER_SPELL_ID, SWEEPING_STRIKES_NPC_SPELL_ID]) {
        src.buffActive.delete(sid);
      }
      for (const e of ctx.effectsOn(src.side)) {
        if (e.kind === 'buff' && isSweepingStrikesAuraSpell(e.spellId)) {
          e.expiresAt = Math.min(e.expiresAt, ctx.t);
          touchEffect(e);
        }
      }
    }
  };
  ctx.trySweepingStrikesExtra = trySweepingStrikesExtra;

  type AbilityGates = ReturnType<typeof abilityDefense>;
  // One attack context for every melee land die: the white swing, the weapon ability and the melee-class
  // spell with no weapon damage. `white` is null for an ability. Cite: Unit.cpp:2816 MeleeSpellHitResult.
  const meleeAtkCtx = (
    src: Fighter,
    tgt: Fighter,
    spell: SpellDef | null,
    hand: 'mainhand' | 'offhand',
    gates: AbilityGates,
    white: { nextSwingQueued: boolean; magicWhite: boolean; magicWhiteResistPercent: number } | null,
  ) => {
    const isAbility = white === null;
    return {
      atkLevel: src.spec.level, defLevel: tgt.spec.level, baseCrit: src.spec.critChance + (src.castCritAdd ?? 0),
      defenderParries: gates.parry && canParryNow(tgt),
      defenderBlocks: (!isAbility || gates.completelyBlocked) && !!tgt.spec.canBlock && canReactNow(tgt),
      defenderDodge: gates.dodge && canReactNow(tgt) ? tgt.spec.dodgeChance : 0,
      defenderParry: tgt.spec.parryChance,
      defenderBlock: tgt.spec.blockChance,
      attackerHit: src.spec.hitChance,
      attackerWeaponSkill: weaponSkillForHand(src, hand),
      defenderDefenseSkill: tgt.spec.defenseSkill,
      attackerIsPlayerOrPet: isPlayerOrPetSide(src),
      defenderIsPlayerOrPet: isPlayerOrPetSide(tgt),
      dualWield: fighterDualWield(src),
      isAbility,
      onNextSwing: white?.nextSwingQueued ?? false,
      wandUser: src.spec.wandUser,
      casterGlance: src.spec.casterGlance,
      attackType: 'melee' as const,
      // Victim aura 187: signed points on the attacker's crit. Cite: Unit.cpp:3746.
      defenderCritTakenPp: tgt.attackerMeleeCrit,
      // Ex3 NO_AVOIDANCE bypasses the whole hit-result switch; NO_ACTIVE_DEFENSE clears the
      // three reaction sides; a totem victim has no inherent miss chance at all.
      noAvoidance: hasAttrEx3(spell, SPELL_ATTR_EX3.NO_AVOIDANCE),
      noActiveDefense: hasAttr(spell, SPELL_ATTR.NO_ACTIVE_DEFENSE),
      defenderIsTotem: isTotemCreatureType(tgt.spec.creatureType),
      // WHITE swings only: `CanBlockInCombat(weaponSchoolMask)` reads the melee damage school,
      // while an ability goes through CanBlockAbility, which `abilityDefense` already owns.
      attackSchoolIsMagic: white?.magicWhite ?? false,
      // Unit.cpp:3795-3806: the 100% resist bin of the partial-resist table is extra miss.
      ...((white?.magicWhiteResistPercent ?? 0) > 0 ? { magicWhiteResistPercent: white!.magicWhiteResistPercent } : {}),
      // Parry and block need the attacker in the defender's front arc; dodge needs it only
      // from a player. Cite: Unit.cpp:3051/:3070/:3100.
      attackerInDefendersFront: inFrontArc(tgt, src),
      abilityDeflects: gates.deflect,
      completelyBlocked: gates.completelyBlocked,
      ...crushFields(src),
    };
  };

  // Land die of a melee-class spell with no weapon damage (Bash, Kidney Shot): the strike's miss, dodge
  // and parry plus the mechanic-resist side; failPct is miss + resist. Cite: Unit.cpp:2816-2856; :3988.
  const meleeSpellHitResult = (
    src: Fighter,
    tgt: Fighter,
    spell: SpellDef,
    mechanicResistPct: number,
  ): { result: HitResult | 'resist'; failPct: number } => {
    const table = meleeAttackTable(meleeAtkCtx(src, tgt, spell, 'mainhand', abilityDefense(spell, 'melee'), null));
    const resist = Math.max(0, Math.min(1, mechanicResistPct / 100));
    const roll = rng.next();
    const failPct = Math.min(100, (table.miss + resist) * 100);
    if (roll < table.miss) { tryMeleeSkillGains(src, tgt, 'miss', 'mainhand'); return { result: 'miss', failPct }; }
    if (roll < table.miss + resist) return { result: 'resist', failPct };
    const result = pickMeleeSpellLand(table, roll - resist);
    tryMeleeSkillGains(src, tgt, result, 'mainhand');
    if (result === 'dodge' || result === 'parry' || result === 'block') {
      stampDefensiveAuraState(tgt, result, ctx.t);
      triggerTakenProcs(tgt, src, result, 'melee_ability');
    }
    if (result === 'parry') applyParryHaste(tgt);
    return { result, failPct };
  };

  // Melee weapon strike: main-hand white, off-hand white, or a special. The off hand uses the OH
  // weapon at 50% total and never arms an on-next-swing.
  const weaponStrike = (
    src: Fighter,
    tgt: Fighter,
    spell: SpellDef | null,
    hand: 'mainhand' | 'offhand' = 'mainhand',
  ): boolean => {
    const t = ctx.t;
    // The swing's real school. Non-physical for the 100 creature_template.DamageSchool rows, so
    // the combat log stops calling a Fire Elemental's hit physical.
    const swingSchool = handProfile(src, hand).school;
    const emit = (result: HitResult, amount: number, blocked?: number): void => {
      const extra = blocked && blocked > 0 ? { blocked } : {};
      if (spell) {
        push({ t, kind: 'spell_hit', actor: src.side, target: tgt.side, spellId: spell.id, name: spell.name, result, amount, school: swingSchool, ...extra });
      } else if (src.extraAttacksExecuting && src.extraAttackSource) {
        // DoExtraAttacks from Windfury Totem / Weapon — name the row for DPSMate.
        const srcSpell = src.extraAttackSource;
        push({
          t, kind: 'spell_hit', actor: src.side, target: tgt.side,
          spellId: srcSpell.spellId, name: srcSpell.name, result, amount, school: swingSchool, ...extra,
        });
      } else {
        push({ t, kind: 'melee', actor: src.side, target: tgt.side, result, amount, ...extra });
      }
    };
    // White and on-next-swing roll the full melee table; instant weapon abilities take the spell hit
    // result then the spell crit roll. The dual-wield miss penalty applies to autos only.
    const onNextSwing = !!spell && isNextMeleeSwingSpell(spell);
    const isAbility = !!spell && !onNextSwing;
    // The off-hand also skips the +19% while a strike still sits in CURRENT_MELEE_SPELL, which is
    // `pendingSwing` until the main hand consumes it. Cite: Unit.cpp:3767.
    const nextSwingQueued = onNextSwing || src.pendingSwing != null;
    const magicWhite = !isAbility && swingSchool !== 'physical';
    const magicWhiteResistPercent = magicWhite
      ? effectiveMagicResistancePercent({
        school: swingSchool,
        resistance: tgt.resistances[swingSchool] ?? 0,
        penetration: src.spec.resistancePenetration?.[swingSchool] ?? 0,
        attackerLevel: src.spec.level,
        victimLevel: tgt.spec.level,
        victimIsNpc: isEnemySide(tgt.side),
      })
      : 0;
    const gates = isAbility ? abilityDefense(spell, 'melee') : { dodge: true, parry: true, deflect: false, partialBlock: false, completelyBlocked: false };
    const atkCtx = meleeAtkCtx(src, tgt, spell, hand, gates, isAbility ? null : {
      nextSwingQueued, magicWhite, magicWhiteResistPercent,
    });
    // White DRAW ORDER: (1) table (2) glance amount if glancing (3) damage.
    // Ability DRAW ORDER: (1) land table (2) crit if land (3) damage (4) partial block.
    const tableRoll = rng.next();
    const table = meleeAttackTable(atkCtx);
    let result: HitResult = isAbility
      ? pickMeleeSpellLand(table, tableRoll)
      : pickMeleeOutcome(table, tableRoll);
    // Skill gain on melee-based outcomes (including miss/dodge/parry). Cite: ProcSkillsAndReactives
    tryMeleeSkillGains(src, tgt, result, hand);
    // Remember the defender's dodge: dodge-reactive attacks (Overpower) read this for 5s.
    // The aura state the outcome sets is class-dependent (rogue dodge and hunter parry differ).
    if (result === 'dodge' || result === 'parry' || result === 'block') {
      stampDefensiveAuraState(tgt, result, t);
      triggerTakenProcs(tgt, src, result, isAbility ? 'melee_ability' : 'melee_swing');
    }
    if (result === 'parry') applyParryHaste(tgt);
    // Any non-immune melee outcome is an attack: AttackedBy + EngageInCombatWithAggressor fire
    // before the damage is dealt, so a whiffed opener still pulls. Cite: Unit.cpp:2202–2212.
    engageOnHostileSpell(src, tgt, spell, true, true);
    let glanceRoll = 0.5;
    if (isAbility) {
      if (result !== 'hit') { refundPowerOnMiss(src, spell, result); emit(result, 0); return false; }
      // RollSpellCritOutcome: CanCrit(entry) refuses a non-player-controlled caster and any
      // spell with no crittable effect before the die is rolled.
      if (canCritWithAbility(src, spell) && rng.chance(calculateEffectiveCritChance(atkCtx))) result = 'crit';
    } else {
      glanceRoll = result === 'glancing' ? rng.next() : 0.5;
    }
    // Aura 169 raises the crit MULTIPLIER vs a creature type. Cite: Unit.cpp:3561.
    const isIgnoreMods = spell ? hasAttrEx3(spell, SPELL_ATTR_EX3.IGNORE_CASTER_MODIFIERS) : false;
    const critMult = isIgnoreMods ? 1.0 : critMultiplierWithVersus(
      TUNING.meleeCritMult, src.critDamageVersusPct, tgt.creatureType,
    );
    const mult = meleeOutcomeMultiplier(atkCtx, result, critMult, glanceRoll);
    if (mult === 0) { emit(result, 0); return false; } // miss / dodge / parry

    // Weapon + speed for this hand (OH never uses form weapon bands — forms suppress OH).
    const formOverride = hand === 'mainhand' && isAttackSpeedOverriddenShapeShift(src.form);
    const wpn = handProfile(src, hand);
    // CalculateMinMaxDamage: attack power over 14 times speed, plus the weapon, off hand halved. Melee
    // path only. Enchant flat damage and the creature-flat aura are added here. Cite: StatSystem.cpp:346.
    const enchantFlat =
      (hand === 'offhand'
        ? (src.spec.enchantFlatOh ?? 0)
        : (src.spec.enchantFlatMh ?? 0))
      + (isIgnoreMods ? 0 : sumVersusForCreatureType(src.damageDoneCreature, tgt.creatureType));
    // Hunter's Mark / aura 127: victim grants attackers +AP (not +AP on the mob).
    const markAp = tgt.attackerAttackPowerBonus || 0;
    // MOD_MELEE_ATTACK_POWER_VERSUS (102): AP only when target creature type matches mask.
    // Cite: Unit.cpp:7475–7476 MeleeDamageBonusDone APbonus; :7559 APbonus/14×speed.
    const versusAp = isIgnoreMods ? 0 : sumVersusAp(src.attackPowerVersus, tgt.creatureType);
    let raw = meleeBaseDamage(wpn.dmgMin, wpn.dmgMax, src.attackPower + markAp + versusAp, wpn.speedMs, rng.next(), {
      formOverride,
      level: src.spec.level,
      totalPct: hand === 'offhand' ? offhandDamageTotalPct(src.offhandDamagePct) : 1,
      enchantFlat,
    });
    // SPELL_EFFECT_WEAPON_PERCENT_DAMAGE multiplies the weapon roll; strikeBonus is the DBC
    // basePoints and stays additive AFTER it (Backstab r4 = pct 150 then flat 46).
    const pctEff = spell?.effects?.find((e) => e.kind === 'weapon_percent_damage');
    if (pctEff && ((pctEff as { pct?: number }).pct ?? 0) > 0) {
      raw = resolveWeaponPercentDamage({ weaponDamage: raw, pct: (pctEff as { pct: number }).pct }).damage;
    }
    if (spell?.strikeBonus) raw += spell.strikeBonus;
    // Outcome multiplier, then the victim's clean damage for taken rage: block is stripped from HP
    // only, a glance adds the glanced-away amount back, and a crush leaves clean at the base.
    const baseForOutcome = raw;
    raw *= mult; // glancing (<1) / crit|crush (>1) / hit|block (1)
    let cleanForRage =
      result === 'glancing' ? 2 * baseForOutcome - raw
      : result === 'crushing' ? baseForOutcome
      : raw;
    // White block: flat absorb on the land die. Yellow: independent partial-block roll after crit.
    // Cite: Unit.cpp MELEE_HIT_BLOCK ~2033; RollAbilityPartialBlockOutcome ~3388.
    let blockedAmt = 0;
    if (result === 'block') {
      raw = applyShieldBlockAbsorb(raw, tgt.spec.blockValue ?? 0, tgt.spec.blockValuePct ?? 0);
    } else if (isAbility && gates.partialBlock && tgt.spec.canBlock && canReactNow(tgt)) {
      const blockCtx = { ...atkCtx, defenderBlocks: true };
      if (rng.chance(calculateEffectiveBlockChance(blockCtx))) {
        const after = applyShieldBlockAbsorb(raw, tgt.spec.blockValue ?? 0, tgt.spec.blockValuePct ?? 0);
        blockedAmt = raw - after;
        raw = after;
        cleanForRage = Math.max(0, cleanForRage - blockedAmt);
        if (blockedAmt > 0) stampDefensiveAuraState(tgt, 'block', t);
      }
    }
    const physPct = src.damagePctBySchool.physical ?? 0;
    if (!isIgnoreMods && physPct) {
      const f = 1 + physPct / 100;
      raw *= f;
      cleanForRage *= f;
    }
    // MOD_DAMAGE_DONE_VERSUS (168) multiplier. Cite: Unit.cpp:7503 DoneTotalMod *= …
    const versusPct = sumVersusForCreatureType(src.damageDoneVersusPct, tgt.creatureType);
    if (!isIgnoreMods && versusPct) {
      const f = 1 + versusPct / 100;
      raw *= f;
      cleanForRage *= f;
    }
    // creature_template.DamageSchool: a white hit from 97 templates is MAGICAL, and dealDamage already
    // branches on school, so passing it is the whole fix — resistance applies and armor does not.
    const amount = dealDamage(tgt, raw, wpn.school, src.spec.level, {
      damageType: 'weapon', attacker: src, spell, crit: result === 'crit',
      cleanDamage: cleanForRage,
    });
    emit(result, amount, blockedAmt);
    // An NPC white hit landing in a player's back arc can daze (spell 1604, -50% speed). Melee
    // abilities do not go through DealMeleeDamage, so this is autos only. Cite: Unit.cpp:2225-2229.
    if (amount > 0 && !isAbility) maybeDaze(src, tgt, atkCtx, 'melee');
    // Attacker white-swing rage uses final HP damage (Unit.cpp:910 RewardRage(damage, true)).
    // Full block → amount 0 → no dealer rage; victim still gets cleanDamage rage inside dealDamage.
    if (amount > 0) {
      // Rage from weapon damage dealt, and only for a white swing: spell-driven weapon hits are
      // SPELL_DIRECT_DAMAGE and award none, and an on-next-swing replaces the white entirely.
      if (!spell && src.spec.powerType === 'rage') {
        gainRage(src, rewardRage(amount, src.spec.level, true));
      }
      if (spell) applySpellThreatBonus(src, spell, isEnemySide(tgt.side) ? tgt : undefined);
      // An ability hit is SUCCESSFUL_MELEE_SPELL_HIT (0x10), not a white swing (0x04): hardcoding the
      // swing flag failed every ability proc, Seal Fate included. Cite: Unit.cpp DealMeleeDamage.
      triggerProcs(src, tgt, result === 'crit', isAbility ? 'melee_ability' : 'melee_swing', spell ?? null);
      // Aura-42 self-buffs (Seal of Justice): proc on deal melee via session RNG + PPM.
      // Gated on live proc_trigger_spell with DEAL flags — no aura ⇒ no RNG draw.
      fireDealMeleeAura42(
        src,
        tgt,
        result === 'crit',
        spell && !isNextMeleeSwingSpell(spell) ? 'melee_ability' : 'melee_swing',
        hand,
      );
      // Flurry haste charges: main target only, not during Windfury extra attacks.
      // Cite: UnitAuraProcHandler.cpp:749–762 HandleHasteAuraProc.
      {
        const mainOk = flurryMayConsumeCharge({
          victimIsMainTarget: true, // weaponStrike is always the selected foe
          extraAttacksExecuting: !!src.extraAttacksExecuting,
        });
        if (mainOk) {
          const mine = ctx.effectsOn(src.side);
          for (let i = mine.length - 1; i >= 0; i--) {
            const e = mine[i]!;
            if (e.kind !== 'buff' || !isFlurryHasteRank(e.spellId)) continue;
            if (e.charges == null || e.charges <= 0) continue;
            const { remaining, remove } = consumeProcCharge(e.charges);
            if (remove) {
              reverseBuffMod(src, e.mod, e.amount ?? 0, e.school, {
                creatureTypeMask: e.creatureTypeMask,
                schoolMask: e.schoolMask,
              });
              src.buffActive.delete(e.spellId);
              const idx = effects.lastIndexOf(e);
              if (idx >= 0) effects.splice(idx, 1);
              push({ t, kind: 'aura', actor: src.side, name: e.name, applied: false });
            } else {
              e.charges = remaining;
            }
          }
        }
      }
      rollGearProcs(src, tgt, result === 'crit' ? 'crit' : 'hit', spell ?? null);
      applySealOnSwing(src, tgt, hand); // paladin seal holy proc rides a landed swing
      applyWeaponImbueOnSwing(src, tgt, hand); // Rockbiter / WF / FT / poison TEMP enchant
      // Builder combo points on a landed weapon strike; an off-hand white generates none. Prefer the
      // stamped count and fall back to the effect row. Cite: SpellEffects.cpp:4213-4225.
      const cpAmt = spell?.comboPointsGenerated
        ?? (spell?.effects ?? []).find((e) => e.kind === 'combo_points')?.amount;
      if (cpAmt) addComboPoints(src, tgt, cpAmt);
      trySweepingStrikesExtra(src, tgt, amount, spell, isIgnoreMods);
    }
    return true;
  };

  // A ranged attack with the equipped weapon: a bow rolls the full table with ranged attack type
  // (no parry), a wand keeps hit and crit. Bows and guns consume one ammo per shot; wands none.
  const rangedStrike = (src: Fighter, tgt: Fighter, spell: SpellDef | null): boolean => {
    const t = ctx.t;
    const rw = src.spec.ranged;
    if (!rw) return false;
    const emit = (result: HitResult, amount: number, blocked?: number): void => {
      const extra = blocked && blocked > 0 ? { blocked } : {};
      if (spell) {
        push({ t, kind: 'spell_hit', actor: src.side, target: tgt.side, spellId: spell.id, name: spell.name, result, amount, school: rw.school, ...extra });
        return;
      }
      // Tag free shoot-toggle id on whites (Auto Shot 75 / Shoot / Throw). Cite: KI-870; Unit.cpp ranged auto.
      let logId: number | undefined;
      let logName: string | undefined;
      for (const s of src.spec.spells ?? []) {
        if (roleOf(s) !== 'shoot') continue;
        if ((s.cost ?? 0) > 0 || (s.castTimeMs ?? 0) > 0 || (s.gcdMs ?? 0) > 0) continue;
        logId = s.id;
        logName = s.name;
        break;
      }
      if (logId != null) {
        push({ t, kind: 'melee', actor: src.side, target: tgt.side, result, amount, spellId: logId, name: logName, ...extra });
      } else {
        push({ t, kind: 'melee', actor: src.side, target: tgt.side, result, amount, ...extra });
      }
    };

    // Physical bow/gun: skill-based attack table (parry forced 0 via attackType ranged).
    if (rw.school === 'physical') {
      // --- Ammo gate (before table roll so misses don't free-fire without ammo) ---
      const wSub = src.spec.rangedWeaponSubclass;
      const isThrown = wSub === 16 || src.spec.thrownRemaining != null;
      // Bow / gun / crossbow need projectile ammo (player only — NPC ranged has no bags).
      // Cite: Spell.cpp CheckCast NO_AMMO 6730–6793 (player branch).
      const needsProjectile =
        src.side === 'player'
        && (wSub === 2 || wSub === 3 || wSub === 18
          // Fail closed when subclass missing on physical non-thrown player ranged.
          || (wSub == null && !isThrown));
      if (needsProjectile) {
        const rem = src.spec.ammoRemaining ?? 0;
        const aSub = src.spec.ammoSubclass;
        const okEntry = src.spec.ammoEntry != null && rem >= 1;
        // Known subclass → arrow/bullet match; unknown → any live projectile with count.
        const okCompat =
          wSub == null
            ? aSub != null
            : aSub != null
              && ((wSub === 2 || wSub === 18) ? aSub === 2 : wSub === 3 ? aSub === 3 : false);
        if (!okEntry || !okCompat) {
          // SPELL_FAILED_NO_AMMO — no free shot
          emit('miss', 0);
          return false;
        }
      } else if (isThrown && src.side === 'player') {
        if (src.spec.thrownRemaining != null && src.spec.thrownRemaining < 1) {
          emit('miss', 0);
          return false;
        }
      }

      const onNextSwing = !!spell?.onNextSwing;
      const isAbility = !!spell && !onNextSwing;
      const gates = isAbility ? abilityDefense(spell, 'ranged') : { dodge: true, parry: false, deflect: false, partialBlock: false, completelyBlocked: false };
      const atkCtx = {
        atkLevel: src.spec.level, defLevel: tgt.spec.level, baseCrit: src.spec.critChance + (src.castCritAdd ?? 0),
        defenderParries: gates.parry && canParryNow(tgt),
        defenderBlocks: (!isAbility || gates.completelyBlocked) && !!tgt.spec.canBlock && canReactNow(tgt),
        defenderDodge: gates.dodge && canReactNow(tgt) ? tgt.spec.dodgeChance : 0,
        defenderParry: tgt.spec.parryChance,
        defenderBlock: tgt.spec.blockChance,
        attackerHit: src.spec.hitChance,
        attackerWeaponSkill: weaponSkillForHand(src, 'ranged'),
        defenderDefenseSkill: tgt.spec.defenseSkill,
        attackerIsPlayerOrPet: isPlayerOrPetSide(src),
        defenderIsPlayerOrPet: isPlayerOrPetSide(tgt),
        dualWield: false,
        isAbility,
        onNextSwing,
        wandUser: src.spec.wandUser,
        casterGlance: src.spec.casterGlance,
        attackType: 'ranged' as const,
        // Victim auras 188 (crit) and 185 (hit). Cite: Unit.cpp:3746, :3794.
        defenderCritTakenPp: tgt.attackerRangedCrit,
        defenderHitTakenPp: tgt.attackerRangedHit,
        noAvoidance: hasAttrEx3(spell, SPELL_ATTR_EX3.NO_AVOIDANCE),
        noActiveDefense: hasAttr(spell, SPELL_ATTR.NO_ACTIVE_DEFENSE),
        defenderIsTotem: isTotemCreatureType(tgt.spec.creatureType),
        attackerInDefendersFront: inFrontArc(tgt, src),
        abilityDeflects: gates.deflect,
        completelyBlocked: gates.completelyBlocked,
        ...crushFields(src),
      };
      const tableRoll = rng.next();
      const table = meleeAttackTable(atkCtx);
      let result: HitResult = isAbility
        ? pickMeleeSpellLand(table, tableRoll)
        : remapRangedWhiteOutcome(pickMeleeOutcome(table, tableRoll));
      tryMeleeSkillGains(src, tgt, result, 'ranged');
      if (result === 'dodge' || result === 'parry' || result === 'block') {
        stampDefensiveAuraState(tgt, result, t);
        triggerTakenProcs(tgt, src, result, isAbility ? 'ranged_ability' : 'ranged_attack');
      }
      if (result === 'parry') applyParryHaste(tgt);
      engageOnHostileSpell(src, tgt, spell, true); // Unit.cpp:2202–2212 — a whiffed shot still pulls
      let glanceRoll = 0.5;
      if (isAbility) {
        if (result !== 'hit') { refundPowerOnMiss(src, spell, result); emit(result, 0); return false; }
        if (canCritWithAbility(src, spell) && rng.chance(calculateEffectiveCritChance(atkCtx))) result = 'crit';
      } else {
        glanceRoll = result === 'glancing' ? rng.next() : 0.5;
      }
      const isIgnoreMods = spell ? hasAttrEx3(spell, SPELL_ATTR_EX3.IGNORE_CASTER_MODIFIERS) : false;
    const critMult = isIgnoreMods ? 1.0 : critMultiplierWithVersus(
        TUNING.meleeCritMult, src.critDamageVersusPct, tgt.creatureType,
      );
      const mult = meleeOutcomeMultiplier(atkCtx, result, critMult, glanceRoll);
      if (mult === 0) { emit(result, 0); return false; }
      // MOD_RANGED_ATTACK_POWER_VERSUS (131). Cite: Unit.cpp:7471.
      const versusRap = isIgnoreMods ? 0 : sumVersusAp(src.rangedAttackPowerVersus, tgt.creatureType);
      const markRap = tgt.attackerAttackPowerBonus || 0;
      const ap = (src.spec.rangedAttackPower ?? src.attackPower) + versusRap + markRap;
      // Ammo DPS only while remaining count > 0 (zero after last arrow consumed).
      const ammoLive = needsProjectile && (src.spec.ammoRemaining ?? 0) > 0;
      let raw = meleeBaseDamage(rw.dmgMin, rw.dmgMax, ap, rw.speedMs, rng.next(), {
        enchantFlat: (src.spec.enchantFlatRanged ?? 0)
          + sumVersusForCreatureType(src.damageDoneCreature, tgt.creatureType),
        ammoDpsMin: ammoLive ? (src.spec.ammoDpsMin ?? 0) : 0,
        ammoDpsMax: ammoLive ? (src.spec.ammoDpsMax ?? 0) : 0,
      });
      // Aimed Shot ranks: SPELL_EFFECT_NORMALIZED_WEAPON_DMG flat bonus (bake strikeBonus).
      // Cite: SpellEffects.cpp EffectWeaponDmg :3445; map-spell-effects eff 121; KI-164.
      if (spell?.strikeBonus) raw += spell.strikeBonus;
      const baseForOutcome = raw;
      raw *= mult;
      let cleanForRage =
        result === 'glancing' ? 2 * baseForOutcome - raw
        : result === 'crushing' ? baseForOutcome
        : raw;
      let blockedAmt = 0;
      if (result === 'block') {
        raw = applyShieldBlockAbsorb(raw, tgt.spec.blockValue ?? 0, tgt.spec.blockValuePct ?? 0);
      } else if (isAbility && gates.partialBlock && tgt.spec.canBlock && canReactNow(tgt)) {
        const blockCtx = { ...atkCtx, defenderBlocks: true };
        if (rng.chance(calculateEffectiveBlockChance(blockCtx))) {
          const after = applyShieldBlockAbsorb(raw, tgt.spec.blockValue ?? 0, tgt.spec.blockValuePct ?? 0);
          blockedAmt = raw - after;
          raw = after;
          cleanForRage = Math.max(0, cleanForRage - blockedAmt);
          if (blockedAmt > 0) stampDefensiveAuraState(tgt, 'block', t);
        }
      }
      const dmgPct = src.damagePctBySchool.physical ?? 0;
      if (!isIgnoreMods && dmgPct) {
        const f = 1 + dmgPct / 100;
        raw *= f;
        cleanForRage *= f;
      }
      const amount = dealDamage(tgt, raw, 'physical', src.spec.level, {
        binary: false, damageType: 'spell', attacker: src, ranged: true,
        cleanDamage: cleanForRage,
      });
      emit(result, amount, blockedAmt);
      // TakeAmmo runs on the successful cast path, not per hit-table row, so consume one projectile
      // per attempt that passed the ammo gate.
      if (src.side === 'player') {
        if (needsProjectile && src.spec.ammoEntry != null && (src.spec.ammoRemaining ?? 0) > 0) {
          src.spec.ammoRemaining = (src.spec.ammoRemaining ?? 1) - 1;
          itemsSpent.set(src.spec.ammoEntry, (itemsSpent.get(src.spec.ammoEntry) ?? 0) + 1);
          if ((src.spec.ammoRemaining ?? 0) < 1) {
            src.spec.ammoDpsMin = 0;
            src.spec.ammoDpsMax = 0;
          }
        } else if (isThrown && src.spec.thrownRemaining != null && src.spec.thrownRemaining > 0) {
          src.spec.thrownRemaining -= 1;
          if (src.spec.thrownEntry != null) {
            itemsSpent.set(src.spec.thrownEntry, (itemsSpent.get(src.spec.thrownEntry) ?? 0) + 1);
          }
        }
      }
      if (amount > 0) {
        // A shot is a RANGED proc event, never a melee one: tagging it melee matched every melee
        // ability aura the shooter carried and no ranged aura at all.
        triggerProcs(src, tgt, result === 'crit', isAbility ? 'ranged_ability' : 'ranged_attack', spell);
        rollGearProcs(src, tgt, result === 'crit' ? 'crit' : 'hit', spell);
      }
      return true;
    }

    // Wand / non-physical school: legacy simple miss + separate crit (not full table).
    engageOnHostileSpell(src, tgt, spell, true);
    if (!rng.chance(src.spec.hitChance)) { emit('miss', 0); return false; }
    // White wand/Shoot may pass spell=null (stepSession shootAuto). Local white-swing
    // contract after Shoot toggle — CMaNGOS re-casts 5019 each shot (Unit.cpp:4192).
    let spellCrit = fighterSpellCrit(src) * 100 + ((spell ? (spell as { _talentCritBonus?: number })._talentCritBonus : 0) || 0);
    if (spell) spellCrit = applyOwnedSpellMod(src, spell, SPELLMOD_CRITICAL_CHANCE, spellCrit);
    spellCrit = spellCrit / 100 + (src.castCritAdd ?? 0);
    // A white wand/Shoot swing passes spell=null and keeps its crit; a real spell must pass
    // IsSpellAbleToCrit. Cite: SpellMgr.h:327-339; Unit.cpp:3878.
    const crit = (!spell || spellCanCrit(spell)) && rng.chance(spellCritChance(
      spellCrit, src.spec.level, tgt.spec.level,
      spell?.dmgClass ?? SPELL_DAMAGE_CLASS.RANGED,
    ));
    let raw = meleeBaseDamage(rw.dmgMin, rw.dmgMax, 0, rw.speedMs, rng.next());
    const isIgnoreMods = spell ? hasAttrEx3(spell, SPELL_ATTR_EX3.IGNORE_CASTER_MODIFIERS) : false;
    if (crit && !isIgnoreMods) raw *= TUNING.meleeCritMult;
    const dmgPct = src.damagePctBySchool[rw.school] ?? 0;
    if (!isIgnoreMods && dmgPct) raw *= (1 + dmgPct / 100);
    const amount = dealDamage(tgt, raw, rw.school, src.spec.level, {
      binary: false, damageType: 'spell', attacker: src,
    });
    emit(crit ? 'crit' : 'hit', amount);
    if (amount > 0) {
      // A wand shot is a ranged attack, not a harmful spell cast — the harmful-spell flag fired every
      // spell proc the wielder had on each wand tick. Cite: Unit.cpp:4192 ranged auto-repeat.
      triggerProcs(src, tgt, !!crit, spell && !spell.onNextSwing ? 'ranged_ability' : 'ranged_attack', spell);
      rollGearProcs(src, tgt, crit ? 'crit' : 'hit', spell);
    }
    return true;
  };

  ctx.weaponStrike = weaponStrike;
  ctx.meleeSpellHitResult = meleeSpellHitResult;
  ctx.rangedStrike = rangedStrike;
  ctx.tryMeleeSkillGains = tryMeleeSkillGains;
  ctx.isPlayerOrPetSide = isPlayerOrPetSide;
  ctx.fighterDualWield = fighterDualWield;
}
