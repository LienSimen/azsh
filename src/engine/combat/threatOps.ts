// Peeled from createSession (Wave 4 S31) — session-side threat application.
// Distinct from pure engine/combat/threat.ts. Pattern (D): install onto CombatContext.

import type { CombatContext } from './context.ts';
import type { Fighter } from './types.ts';
import type { School, SpellDef } from '../../data/schema.ts';
import { isEnemySide, isDuelistSide, type EnemySide, type Side } from '../core/events.ts';
import { CREATURE_STATIC_FLAGS, CREATURE_STATIC_FLAGS2, CRITTER_FLEE_MS } from '../../domain/creature/creatureAiConstants.ts';
import { AURA_INTERRUPT } from '../../domain/spells/stealth.ts';
import { touchCombatFlag } from './combatFlag.ts';
import {
  SPELL_ATTR_EX, SPELL_ATTR_EX2, SPELL_ATTR_EX3, SPELL_ATTR_EX4, hasAttrEx, hasAttrEx2, hasAttrEx3, hasAttrEx4,
} from '../spells/spellAttributes.ts';
import {
  ThreatManager,
  damageToRawThreat,
  spellThreatFromDef,
  HEAL_THREAT_FACTOR,
  type CombatantId,
} from './threat.ts';

export function installThreatOps(ctx: CombatContext): void {
  // ApplyTotalThreatModifier multiplier for the dealer: form package × talent school MOD_THREAT. Cite:
  // Unit.cpp ApplyTotalThreatModifier; form package via formThreatPct; talents via threatModifierBySchool.
  const threatSchoolMult = (dealer: Fighter, school: School): number => {
    const formMult = 1 + (dealer.formThreatPct || 0) / 100;
    // Fade / SPELL_AURA_MOD_TOTAL_THREAT (103) + multi-bit MOD_THREAT (Salvation all schools).
    const fadeMult = 1 + (dealer.threatModPct || 0) / 100;
    // Single-bit SPELL_AURA_MOD_THREAT (10) — Righteous Fury holy +60 only.
    // Cite: SpellAuras.cpp:2836–2838 ApplyPercentModFloatVar(m_threatModifier[x]).
    const schoolAuraMult = 1 + (dealer.threatSchoolPct?.[school] || 0) / 100;
    const talentMult = dealer.spec.threatModifierBySchool?.[school] ?? 1;
    return formMult * fadeMult * schoolAuraMult * talentMult;
  };
  ctx.applyDamageThreat = (
    dealer: Fighter | undefined,
    victim: Fighter,
    damage: number,
    crit: boolean,
    spell?: SpellDef | null,
  ): void => {
    if (!dealer || damage <= 0) return;
    if (!isEnemySide(victim.side)) return; // only enemies hold threat lists
    if (isEnemySide(dealer.side)) return; // NPC→NPC damage does not generate threat here
    const tm = ctx.threatOf(victim);
    if (!tm) return;
    if (spell && hasAttrEx4(spell, SPELL_ATTR_EX4.NO_HARMFUL_THREAT)) return;
    const { multiplier } = spellThreatFromDef(spell);
    const school = (spell?.school ?? 'physical') as School;
    const raw = damageToRawThreat(damage, multiplier);
    tm.addThreat(dealer.side, raw, {
      crit,
      threatSchoolMultiplier: threatSchoolMult(dealer, school),
      spellThreatPct: spell?.threatSpellModPct ?? 0,
    });
    // Pet damage also ensures the owner is on the list at 0 (ThreatManager.cpp:484–486).
    if (dealer.side === 'pet') {
      if (!((dealer.spec.staticFlags2 ?? 0) & CREATURE_STATIC_FLAGS2.NO_OWNER_THREAT)) {
        tm.addThreatDirectly('player', 0, false);
      }
    }
  };

  // A hostile action RESOLVING seats the actor on the target's threat list at 0, whether it hit,
  // missed, resisted or was immune. Only damage did before, so a resisted opener never pulled.
  ctx.engageOnHostileSpell = (
    caster: Fighter,
    target: Fighter,
    spell: SpellDef | null | undefined,
    success: boolean,
    melee = false,
  ): void => {
    // The hostile-action interrupt fires on the TARGET of any resolving hostile spell, whoever cast
    // it, so it sits above the threat-list returns: a curse ends stealth with no damage at all.
    if (success && !hasAttrEx2(spell, SPELL_ATTR_EX2.NOT_AN_ACTION) && caster !== target && !hasAttrEx(spell, SPELL_ATTR_EX.THREAT_ONLY_ON_MISS)) {
      ctx.removeAurasWithInterruptFlags?.(target, AURA_INTERRUPT.HOSTILE_ACTION, 'hostile action');
    }
    // UpdateMeleeAttackingState: if victim's beneficiary player IsPvP and !IsInDuelWith → UpdatePvP(true);
    // RemoveAurasWithInterruptFlags(AURA_INTERRUPT_FLAG_PVP_ACTIVE_CANCELS).
    const pvpEnabling = hasAttrEx3(spell, SPELL_ATTR_EX3.PVP_ENABLING);
    if ((melee || pvpEnabling) && ctx.isPlayerOrPetSide?.(caster) && ctx.isPlayerOrPetSide?.(target) && !isDuelistSide(caster.side)) {
      ctx.removeAurasWithInterruptFlags?.(caster, AURA_INTERRUPT.PVP_ACTIVE_CANCELS, 'PvP enter');
    }
    if (!isEnemySide(target.side)) return; // only enemies hold threat lists
    if (isEnemySide(caster.side)) return;  // NPC→NPC is not a player pull; also rules out self
    if (spell?.noThreat || (spell?.noInitialThreat && !pvpEnabling)) return;
    if (success && (spell?.threatOnlyOnMiss || hasAttrEx(spell, SPELL_ATTR_EX.THREAT_ONLY_ON_MISS))) return;
    const tm = ctx.threatOf(target);
    if (!tm) return;
    const wasOutOfCombat = tm.isEmpty();
    tm.addThreatDirectly(caster.side, 0, false);
    // A resolving hostile SPELL puts both sides in combat, hit or miss — AddThreat and SetInCombatWith
    // are one step in the core, and only landed damage armed the flag here, so a missed opener on a
    // target that cannot swing back left the caster out of combat forever and the rotation stuck in
    // its pull phase. Melee keeps its own path (procsDamage on the landed swing).
    // Cite: Unit.cpp:6022-6026; Spell.cpp:1227 calls it with success=false.
    if (!melee) {
      touchCombatFlag(caster, ctx.t);
      touchCombatFlag(target, ctx.t);
    }
    // Pet/totem casts seat the owner too (ThreatManager.cpp:484–486), same as pet damage.
    if (caster.side === 'pet') {
      if (!((caster.spec.staticFlags2 ?? 0) & CREATURE_STATIC_FLAGS2.NO_OWNER_THREAT)) {
        tm.addThreatDirectly('player', 0, false);
      }
    }
    if (wasOutOfCombat) armCritterFlee(target);
  };

  // NO_MELEE_FLEE: a critter put into combat by a player-controlled unit runs for 30 s instead of
  // fighting. Armed on the FIRST engage only, behind the same five guards the C++ carries.
  const armCritterFlee = (target: Fighter): void => {
    if ((((target.spec.staticFlags ?? 0) & CREATURE_STATIC_FLAGS.NO_MELEE_FLEE)) === 0) return;
    // A mid-fight summon is not a critter that wandered into a pull. The summoner record is the only
    // way to tell: there is no template flag, because in the core there is not one.
    for (const set of ctx.guardianSidesBySummoner.values()) {
      if (set.has(target.side)) return;
    }
    if (target.rootedUntil > ctx.t) return;      // !IsRooted()
    if (target.castingSpell) return;             // !IsNonMeleeSpellCasted(false)
    const cs = ctx.enemyCastBySide.get(target.side as EnemySide);
    if (!cs || cs.eventAi.fleeing) return;       // !IsInPanic()
    cs.eventAi.fleeing = true;
    cs.eventAi.fleeUntil = ctx.t + CRITTER_FLEE_MS;
    ctx.push({ t: ctx.t, kind: 'flee', actor: target.side });
  };

  // SPELL_EFFECT_THREAT: add flat threat on the target's list. With `onEnemy` set only that manager
  // is updated; otherwise every living enemy takes the pulse. Cite: SpellEffects.cpp:3567.
  const applyFlatThreatOn = (
    tm: ThreatManager,
    caster: Fighter,
    amount: number,
    spell?: SpellDef | null,
  ): void => {
    if (amount === 0 && !spell) {
      tm.addThreatDirectly(caster.side, 0, false);
      return;
    }
    if (spell && hasAttrEx4(spell, SPELL_ATTR_EX4.NO_HARMFUL_THREAT)) return;
    const { multiplier } = spellThreatFromDef(spell);
    const school = (spell?.school ?? 'physical') as School;
    tm.addThreat(caster.side, amount * (multiplier || 1), {
      threatSchoolMultiplier: threatSchoolMult(caster, school),
      spellThreatPct: spell?.threatSpellModPct ?? 0,
    });
  };

  ctx.applyFlatThreat = (
    caster: Fighter,
    amount: number,
    spell?: SpellDef | null,
    onEnemy?: Fighter,
  ): void => {
    if (onEnemy && isEnemySide(onEnemy.side)) {
      const tm = ctx.threatOf(onEnemy);
      if (tm) applyFlatThreatOn(tm, caster, amount, spell);
      return;
    }
    // With no explicit target, pulse hostiles inside the spell radius of the caster when geometry is
    // live. An empty list is a no-op: falling back to the first enemy slot reached 572 yd.
    const origin = ctx.posOf?.(caster.side);
    const radius = spell?.radiusYd;
    const allLiving = ctx.livingEnemies();
    let targets: typeof allLiving;
    if (origin && radius != null && radius > 0) {
      targets = allLiving.filter((ef) => {
        const at = ctx.posOf?.(ef.side);
        if (!at) return false;
        const dx = at.x - origin.x;
        const dy = at.y - origin.y;
        return dx * dx + dy * dy <= radius * radius;
      });
    } else {
      targets =
        typeof ctx.livingCombatEnemies === 'function'
          ? ctx.livingCombatEnemies()
          : allLiving;
    }
    if (targets.length === 0) return;
    for (const ef of targets) {
      const tm = ctx.threatOf(ef);
      if (tm) applyFlatThreatOn(tm, caster, amount, spell);
    }
  };

  // Optional spell_threat flat bonus after a hostile spell lands, on the target enemy's list; no
  // enemy target is a no-op. One loop per Spell, so damage plus debuff must not double it.
  const threatBonusOnce = new WeakMap<Fighter, { t: number; spellId: number; side: string }>();
  ctx.applySpellThreatBonus = (caster: Fighter, spell: SpellDef, onEnemy?: Fighter, hitCount = 1): void => {
    const { flat, apBonus } = spellThreatFromDef(spell);
    if (!flat && !apBonus) return;
    if (hasAttrEx4(spell, SPELL_ATTR_EX4.NO_HARMFUL_THREAT)) return;
    let threat = flat;
    if (apBonus) threat += apBonus * caster.attackPower;
    if (threat === 0) return;
    if (!onEnemy || !isEnemySide(onEnemy.side)) return;
    const prev = threatBonusOnce.get(caster);
    if (prev && prev.t === ctx.t && prev.spellId === spell.id && prev.side === onEnemy.side) return;
    threatBonusOnce.set(caster, { t: ctx.t, spellId: spell.id, side: onEnemy.side });
    // Spell.cpp:4418-4420: if (!positive) threat /= m_UniqueTargetInfo.size();
    // This helper is the negative path only (onEnemy required). Positive is applyHealThreat.
    threat /= Math.max(1, hitCount);
    const school = spell.school as School;
    const opts = {
      threatSchoolMultiplier: threatSchoolMult(caster, school),
      spellThreatPct: spell.threatSpellModPct ?? 0,
    };
    const tm = ctx.threatOf(onEnemy);
    if (tm) tm.addThreat(caster.side, threat, opts);
  };

  // Heal assist threat: the haters are the creatures whose table already holds the HEALED unit, and
  // the threat lands on the healer, split across them. Healing through a sheeped add feeds it none.
  ctx.applyHealThreat = (
    healer: Fighter,
    amount: number,
    spell?: SpellDef | null,
    healedSide?: Side,
  ): void => {
    const { multiplier, flat } = spellThreatFromDef(spell);
    if ((amount <= 0 && flat <= 0) || isEnemySide(healer.side)) return;
    // The three attribute early-returns, before any ref is walked.
    if (spell && (
      (hasAttrEx2(spell, SPELL_ATTR_EX2.NO_INITIAL_THREAT) && !hasAttrEx3(spell, SPELL_ATTR_EX3.PVP_ENABLING))
      || hasAttrEx(spell, SPELL_ATTR_EX.NO_THREAT)
      || hasAttrEx4(spell, SPELL_ATTR_EX4.NO_HELPFUL_THREAT)
    )) return;
    const healed = healedSide ?? healer.side;
    const controlled = ctx.isControlledHard as ((f: Fighter) => boolean) | undefined;
    // `livingEnemies` applies the same liveness rule and is memoized on the pool gen, so this stopped
    // re-filtering the seat array per heal.
    const haters = ctx.livingEnemies().filter((ef) => {
      if (ef.side === healer.side) return false;
      const tm = ctx.threatOf(ef);
      // The ref list of the HEALED unit: this hater must already hate them.
      if (!tm || !tm.hasThreat(healed)) return false;
      // `!owner->IsCrowdControlled()` — a sheeped add is not a valid ref.
      return !(controlled?.(ef) ?? false);
    });
    if (haters.length === 0) return; // no valid ref — assist no-ops
    const school = (spell?.school ?? 'holy') as School;
    let total = HEAL_THREAT_FACTOR * amount * multiplier;
    if (flat > 0) {
      // Priest.cpp:80-86 SetHelpfulThreatCoefficient(0.5f). Spells 527, 988.
      if (spell?.id === 527 || spell?.id === 988) {
        total += flat * 0.5;
      } else {
        total += flat;
      }
    }
    const n = haters.length;
    const opts = {
      threatSchoolMultiplier: threatSchoolMult(healer, school),
      spellThreatPct: spell?.threatSpellModPct ?? 0,
    };
    for (const ef of haters) {
      const tm = ctx.threatOf(ef);
      if (tm) tm.threatAssist(healer.side, total, n, opts);
    }
  };

  /** Drop a combatant from every enemy threat list (pet/totem death or unsummon). */
  ctx.removeFromAllThreat = (id: CombatantId): void => {
    for (const tm of ctx.threatByOwner.values()) tm.remove(id);
  };

  /** Clear every enemy threat list (player death / fight end). */
  ctx.clearAllThreat = (): void => {
    for (const tm of ctx.threatByOwner.values()) tm.clear();
  };
}
