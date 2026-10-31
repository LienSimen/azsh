// Direct-heal apply (party / chain / triage). Peeled from applySpellLate so that file
// stays under the wave-4 line budget. Cite: healTargets.ts; chainFan.ts; Spell.cpp chain.

import type { SpellDef, SpellEffect } from '../../data/schema.ts';
import { isAllySide, isTotemSide } from '../core/events.ts';
import { HOLY_LIGHT_FAMILY_FLAGS, FLASH_OF_LIGHT_FAMILY_FLAGS } from '../spells/interpreter/paladin-kit.ts';
import {
  HEALING_WAY_AMOUNT_PCT,
  HEALING_WAY_BUFF_SPELL_ID,
  HEALING_WAY_DURATION_MS,
  HEALING_WAY_MAX_STACKS,
  healingWayTakenPct,
  isHealingWaveSpell,
} from '../spells/interpreter/class-scripts-kit.ts';
import { improvedSprintShouldProc } from '../spells/cmangos-special-cases-s21.ts';
import type { ActiveEffect, Fighter } from './types.ts';
import { roleOf } from './roles.ts';
import { spellFromKit } from './kitById.ts';
import { hasSpellBonusData, spellHealingBonusDone } from '../spells/spellBonus.ts';
import { SPELL_ATTR_EX2, hasAttrEx2 } from '../spells/spellAttributes.ts';
import { resolveHealApplyTo, resolvePetHealFighter, filterPartyFanByRadius } from './healTargets.ts';
import {
  wantsChainFan, isFriendlyChainSpell, selectFriendlyChainTargets,
  chainJumpMultiplier, CHAIN_SPELL_JUMP_RADIUS_YD,
} from './chainFan.ts';
import { aoeTotalTargetCap, sideIdSortKey } from './predicates.ts';
import {
  classSetPowerBuffSpellId,
  dreamwalkerManaBackAmount,
  IDOL_HEALING_TOUCH_REFUND_TRIGGER_SPELL_ID,
  isGreaterHealSpell,
  isHealingTouchSpell,
  isLesserHealingWaveSpell,
  TOTEM_LESSER_HEALING_WAVE_TRIGGER_SPELL_ID,
  VESTMENTS_GREATER_HEAL_TRIGGER_SPELL_ID,
} from '../spells/cmangos-special-cases-s20.ts';

type HealEff = SpellEffect & {
  kind: 'heal';
  min: number;
  max: number;
  applyTo?: 'self' | 'pet' | 'friendly' | 'party';
};

/** Apply or refresh Healing Way 29203 on the heal target. Cite: Shaman.cpp:77–89. */
export function applyHealingWayStack(
  tgt: Fighter,
  src: Fighter,
  t: number,
  effects: ActiveEffect[],
  push: (e: { t: number; kind: string; actor: string; name: string; applied: boolean; spellId: number }) => void,
  amountPct: number,
  durationMs: number,
  maxStacks: number,
  held?: readonly ActiveEffect[],
): void {
  const existing = (held ?? effects).find(
    (e) => e.kind === 'buff' && e.spellId === HEALING_WAY_BUFF_SPELL_ID && e.target === tgt.side,
  );
  const stacks = Math.min(maxStacks, (existing?.stacks ?? 0) + 1);
  const pct = healingWayTakenPct(stacks, amountPct);
  const exp = t + (durationMs > 0 ? durationMs : HEALING_WAY_DURATION_MS);
  tgt.healingWay = { pct, stacks, spellId: HEALING_WAY_BUFF_SPELL_ID };
  tgt.buffActive.add(HEALING_WAY_BUFF_SPELL_ID);
  if (existing) {
    existing.stacks = stacks;
    existing.expiresAt = exp;
    return;
  }
  effects.push({
    kind: 'buff',
    source: src.side,
    target: tgt.side,
    spellId: HEALING_WAY_BUFF_SPELL_ID,
    name: 'Healing Way',
    expiresAt: exp,
    stacks,
  });
  push({
    t, kind: 'aura', actor: tgt.side, name: 'Healing Way', applied: true, spellId: HEALING_WAY_BUFF_SPELL_ID,
  });
}

/** Apply one heal effect to all resolved targets (party fan / chain jumps / triage). */
export function applyHealEffect(
  L: Record<string, any>,
  src: Fighter,
  _tgt: Fighter,
  spell: SpellDef,
  eff: SpellEffect,
  t: number,
): void {
  const {
    push, allyBlock, pet, cfg, dead, friendlyPoolOf, lowestHpFriendlyOf,
    distanceBetween, rollHeal, applyHealThreat, applySpell, onHealed, sideFighter,
    effects, rng,
  } = L;
  const healEff = eff as HealEff;
  const applyTo = resolveHealApplyTo(spell, healEff);
  // Faction-relative friendlies, never livingFriendlies() — that list is always the player's side and
  // made enemy healers heal the party. Totems are same-faction but heal-immune.
  const sameSide = (): Fighter[] =>
    (typeof friendlyPoolOf === 'function' ? friendlyPoolOf(src) : [src])
      .filter((f: Fighter) => !dead(f) && !isTotemSide(f.side));
  const triage = (): Fighter | null =>
    (typeof lowestHpFriendlyOf === 'function' ? lowestHpFriendlyOf(src) : null) ?? src;

  const resolvePetHealTarget = (): Fighter | null =>
    resolvePetHealFighter(src, sideFighter, pet, dead, isAllySide);

  let healTargets: Fighter[] = [];
  let jumpMult: number | null = null;

  if (roleOf(spell) === 'pet_heal') {
    const pt = resolvePetHealTarget();
    if (pt) healTargets = [pt];
  } else if (isFriendlyChainSpell(spell) && wantsChainFan(spell)) {
    const pool = sameSide();
    const primary = triage() ?? src;
    const cap = aoeTotalTargetCap(spell) ?? 1;
    const dist = (a: Fighter, b: Fighter) => distanceBetween?.(a, b) as number | undefined;
    healTargets = selectFriendlyChainTargets(
      primary, pool, cap, dist, CHAIN_SPELL_JUMP_RADIUS_YD,
      (f) => sideIdSortKey(f.side),
      hasAttrEx2(spell, SPELL_ATTR_EX2.CHAIN_FROM_CASTER) ? src : undefined,
    );
    jumpMult = chainJumpMultiplier(spell);
  } else if (applyTo === 'party') {
    // Class-B party heal: SpellRadius at cast — not every friendly in the session.
    // Cite: RANGE-ARCHITECTURE §4.8.2; Prayer of Healing radius; endless floor stream.
    healTargets = filterPartyFanByRadius(
      src,
      sameSide(),
      spell,
      applyTo,
      (a, b) => distanceBetween?.(a, b) as number | undefined,
    );
  } else if (applyTo === 'pet') {
    const pt = resolvePetHealTarget();
    if (pt) healTargets = [pt];
  } else if (
    applyTo === 'friendly'
    || isAllySide(src.side)
    || src.spec.groupRole === 'healer'
    || (src.side === 'player' && allyBlock().length > 0)
  ) {
    const one = triage();
    if (one && !dead(one)) healTargets = [one];
  } else if (!dead(src)) {
    healTargets = [src];
  }

  let anyLanded = false;
  let jumpProduct = 1;
  for (let hi = 0; hi < healTargets.length; hi++) {
    const healTarget = healTargets[hi]!;
    if (dead(healTarget)) continue;
    if (hi > 0 && jumpMult != null) jumpProduct *= jumpMult;
    const scale = hi === 0 ? 1 : jumpProduct;
    const { amount, crit: hCrit } = rollHeal(
      src,
      Math.max(1, Math.round(healEff.min * scale)),
      Math.max(1, Math.round(healEff.max * scale)),
    );
    // +healing is scaled by the spell's own coefficient, not applied flat. A spell with no
    // coefficient keeps the flat number so nothing that worked before changes.
    const healSlot = (healEff as { effectSlot?: number }).effectSlot ?? 0;
    const healBonus = hasSpellBonusData(spell, healSlot)
      ? spellHealingBonusDone(spell, healSlot, src.healingDoneFlat || 0)
      : (src.healingDoneFlat || 0);
    let adjusted = amount + healBonus + (healTarget.healingTakenMod || 0);
    if (healTarget.blessingOfLight) {
      const flags = Number(spell.spellFamilyFlags) || 0;
      if ((flags & HOLY_LIGHT_FAMILY_FLAGS) !== 0) {
        adjusted += healTarget.blessingOfLight.holyLight;
      } else if ((flags & FLASH_OF_LIGHT_FAMILY_FLAGS) !== 0) {
        adjusted += healTarget.blessingOfLight.flashOfLight;
      }
    }
    // Existing stacks apply to this Healing Wave; the proc below arms the next one.
    // Cite: Unit.cpp:7261–7265 isAffectedOnSpell; Shaman.cpp:85–88.
    if (
      healTarget.healingWay
      && isHealingWaveSpell(spell.spellFamilyName, spell.spellFamilyFlags)
    ) {
      adjusted *= (1 + healTarget.healingWay.pct / 100);
    }
    if (healTarget.healingTakenPctMod) {
      adjusted *= (1 + healTarget.healingTakenPctMod / 100);
    }
    if (!(Number.isFinite(adjusted) && adjusted > 0)) continue;
    anyLanded = true;
    const hpBefore = healTarget.hp;
    healTarget.hp = Math.min(healTarget.spec.maxHealth, Math.round(healTarget.hp + adjusted));
    // EventAI HealedBy — uses pre-clamp heal amount. Cite: CreatureEventAI.cpp:1885–1895.
    L.notifyEventAiHealedBy?.(healTarget, hpBefore, adjusted);
    push({
      t, kind: 'heal', actor: healTarget.side, amount: adjusted,
      // Always credit the caster — self-heals still need source for HPS meter.
      source: src.side,
      name: spell.name,
      spellId: spell.id,
      ...(hCrit ? { crit: true } : {}),
    });
    // Threat from the effective gain only: overheal is threat-free. Using the pre-clamp amount made a
    // full-HP spam heal splash full threat onto every mob.
    const gained = healTarget.hp - hpBefore;
    // The refs walked are the HEALED unit's, not the healer's. Cite: Spell.cpp:1249.
    applyHealThreat(src, gained, spell, healTarget.side);
    // HealedBy gets addhealth (pre-clamp), not ModifyHealth gain. Cite: Unit.cpp:6877-6889.
    if (typeof onHealed === 'function' && adjusted > 0) {
      onHealed(healTarget, Math.round(adjusted), spell.id);
    }
    // ADD_TARGET_TRIGGER after the land: current heal used existing stacks; this arms the next.
    // Cite: Spell.cpp:7433–7468 ProcSpellAuraTriggers; mangos.sql spell_affect 0x40.
    if (
      Array.isArray(effects)
      && rng
      && src.healingWayChancePct > 0
      && isHealingWaveSpell(spell.spellFamilyName, spell.spellFamilyFlags)
      && improvedSprintShouldProc(src.healingWayChancePct, rng.next())
    ) {
      applyHealingWayStack(
        healTarget,
        src,
        t,
        effects,
        push,
        HEALING_WAY_AMOUNT_PCT,
        HEALING_WAY_DURATION_MS,
        HEALING_WAY_MAX_STACKS,
        typeof L.effectsOn === 'function' ? L.effectsOn(healTarget.side) : undefined,
      );
    }
    if (src.oracleHealingBonusPct > 0 && !dead(src)) {
      const bonus = Math.trunc((adjusted * src.oracleHealingBonusPct) / 100);
      if (bonus > 0) {
        const before = src.hp;
        src.hp = Math.min(src.spec.maxHealth, Math.round(src.hp + bonus));
        if (src.hp !== before) {
          push({ t, kind: 'heal', actor: src.side, amount: src.hp - before });
        }
      }
    }
    if (src.classPowerSetKind && !dead(healTarget)) {
      const buffId = classSetPowerBuffSpellId(
        src.classPowerSetKind,
        healTarget.spec.classId ?? 0,
      );
      if (buffId > 0) {
        const trig =
          spellFromKit(src.spec.spells, buffId)
          ?? spellFromKit(healTarget.spec.spells, buffId);
        if (trig) applySpell(src, healTarget, trig);
      }
    }
    if (
      src.vestmentsGreaterHealActive
      && isGreaterHealSpell(spell.id, spell.spellFamilyName, spell.spellFamilyFlags as number | undefined)
    ) {
      const trig = spellFromKit(src.spec.spells, VESTMENTS_GREATER_HEAL_TRIGGER_SPELL_ID);
      if (trig) applySpell(src, src, trig);
    }
    if (
      src.dreamwalkerHealingTouchActive
      && isHealingTouchSpell(spell.id, spell.spellFamilyName, spell.spellFamilyFlags as number | undefined)
      && src.spec.powerType === 'mana'
    ) {
      const refund = dreamwalkerManaBackAmount(spell.cost ?? 0);
      if (refund > 0) {
        const before = src.power;
        src.power = Math.min(src.spec.maxPower, src.power + refund);
        if (src.power !== before) {
          push({
            t, kind: 'resource', actor: src.side, power: 'mana',
            value: src.power, delta: src.power - before,
          });
        }
      }
    }
    if (
      src.idolHealingTouchRefundActive
      && isHealingTouchSpell(spell.id, spell.spellFamilyName, spell.spellFamilyFlags as number | undefined)
    ) {
      const trig = spellFromKit(src.spec.spells, IDOL_HEALING_TOUCH_REFUND_TRIGGER_SPELL_ID);
      if (trig) applySpell(src, src, trig);
    }
    if (
      src.totemLesserHealingWaveActive
      && isLesserHealingWaveSpell(spell.id, spell.spellFamilyName, spell.spellFamilyFlags as number | undefined)
    ) {
      const trig = spellFromKit(src.spec.spells, TOTEM_LESSER_HEALING_WAVE_TRIGGER_SPELL_ID);
      if (trig) applySpell(src, src, trig);
    }
  }
  if (!anyLanded && roleOf(spell) === 'pet_heal') {
    if (!hasAttrEx2(spell, SPELL_ATTR_EX2.DO_NOT_REPORT_SPELL_FAILURE)) {
      push({ t, kind: 'flavor', text: `${spell.name}: invalid target.` });
    }
  }
}
