// Peeled from createSession (Wave 4 hub: stepSession). Pattern (D). Extracted modules must not import
// combat.ts. NOTE: imports may need expanding when first run against seam tests.

import { createItemRescue } from './itemRescue.ts';
import { clearCombustion } from './combustion.ts';
import { COMBUSTION_SPELL_ID, COMBUSTION_STACK_SPELL_ID } from '../spells/cmangos-special-cases-combustion.ts';
import { CURSE_OF_IDIOCY_SPELL_ID, curseOfIdiocyMayRetriggerFromBuffs } from '../spells/cmangos-special-cases.ts';
import type { CombatContext, EnemyCastState } from './context.ts';
import type { Fighter, ActiveEffect, CombatAction } from './types.ts';

// True when this unit still holds another live aura row for the SAME spell. `buffActive` is keyed
// by spell id, so an expiring row must not clear the id out from under a sibling that is still up.
function hasOtherLiveAuraRow(
  effects: readonly ActiveEffect[],
  expiring: ActiveEffect,
): boolean {
  return effects.some((o) => (
    o !== expiring
    && o.spellId === expiring.spellId
    && o.target === expiring.target
    && o.expiresAt > expiring.expiresAt
  ));
}
import type { QueuedCast } from './session-types.ts';
import { channelInterruptCtx, interruptChannel, maybeCancelChannelOnAction } from './channel.ts';
import { dropFeignDeath, expireCombatFlag, fighterIsInCombat, maybeAggroZonePulse, touchCombatFlag } from './combatFlag.ts';
import { emptySlowDiag, hardCcMustDecide, nextDecideWakeAt, slowEngaged, wakeForDecision } from './slowUpdate.ts';
import { installStepWrap } from './sessionStepWrap.ts';
import { combatPerf, combatPerfEnter, combatPerfLeave } from './perfSink.ts';
import type { SpellDef, PowerType } from '../../data/schema.ts';
import type { Side, EnemySide, CombatEvent } from '../core/events.ts';
import { isEnemySide, isAllySide, isPlayerCharacterSide, isTotemSide } from '../core/events.ts';
import {
  TUNING, rollBetween, BASE_ATTACK_TIME_MS, spellCritChance, scaleTime,
  critMultiplierWithVersus,
} from './formulas.ts';
import {
  fighterSpellCrit,
  reverseBuffMod,
  applyResistMod,
  reverseMechanicResist,
  canPayPower,
} from './fighterFactory.ts';
import { roleOf, nextCastModApplies } from './roles.ts';
import { maxPowerOfType, powerOfType, powerTypeName, setPowerOfType } from './powerPools.ts';
import { POWER_MANA } from '../spells/effects.ts';
import {
  curseOfAgonyTickAmount, isCurseOfAgonySpellId, isHealingWayTalentSpellId,
} from '../spells/interpreter/class-scripts-kit.ts';
import {
  applyOwnedSpellMod, stripOwnedSpellMods,
  SPELLMOD_COST, SPELLMOD_CASTING_TIME, SPELLMOD_COOLDOWN,
} from '../spells/spellModIntents.ts';
import { SPELL_ATTR_EX2, SPELL_ATTR_EX3, hasAttrEx2, hasAttrEx3 } from '../spells/spellAttributes.ts';
import {
  isHostileSpellDef,
  spellTargetTypeAllowed,
  isCreatureRangedMainAttack,
  spellNeedsRangeGate,
  spellGateRangeMaxYd,
  spellGateRangeMinYd,
  spellFoeDirectedOpaque,
  spellFoeDirectedGeometry,
  spellNeedsFriendlyLosGate,
  spellNeedsLosGate,
  isSelfCenteredAoe,
  isCasterOriginAoe,
  focusImmunityBlocksSpell,
  aoeTotalTargetCap,
  nextSwingFanCap,
  nextSwingFanRadiusYd,
  rangedAutoMinYards,
  wantsChainFan,
  isNonCastableTalentProc,
  isRangedAutoRepeatToggle,
  rangedAutoSpellOf,
} from './predicates.ts';
import { selectHostileChainTargets, CHAIN_SPELL_JUMP_RADIUS_YD } from './chainFan.ts';
import { isFriendlyFannedEffect } from './friendlyFan.ts';
import { dispelOwnerThisTick } from './dispelDuty.ts';
import { playerMissingRequiredEquippedItem } from './equippedItemGate.ts';
import { canPaySpellReagents, takeSpellReagents } from './spellReagents.ts';
import { pickBattleRezTarget } from './battleRez.ts';
import { haltDpsCoversEntry, haltDpsRefusesSchool } from '../../domain/rotation/evaluate.ts';
import { reactiveCastGate, consumeReactiveWindow } from './reactiveGates.ts';
import { targetCastGate } from './castTargetGates.ts';
import { spellFromKit } from './kitById.ts';
import { payloadAtCasterLevel } from './triggerPayload.ts';

import { applySpellDamageBonusIfPresent } from '../spells/spellBonus.ts';
import { removeImmunityAura } from '../spells/immunity.ts';
import { resolveSpellBinary, SPELL_DAMAGE_CLASS } from './mitigation.ts';
import { resolvePeriodicPctOfMax } from '../spells/effects.ts';
import {
  FRENZIED_REGEN_SPELL_IDS,
  frenziedRegenLifePerRage,
  frenziedRegenTick,
} from '../spells/interpreter/warrior-druid-kit.ts';
import {
  NITROUS_BOOST_SPELL_ID,
  NITROUS_MANA_COST_PER_TICK,
} from '../spells/interpreter/handlers/periodic-trigger-zero.ts';
import {
  categoryCooldownMs, gcdIsHasted, isNextMeleeSwingSpell, personalCooldownMs, recoveryReadyAts,
  cooldownStartsOnAuraFade, PERMANENT_COOLDOWN_READY_AT,
} from '../spells/recovery.ts';
import { maybeResetMeleeAttackTimersOnCast } from '../spells/meleeAttackReset.ts'; // Spell.cpp:3344
import { isPureDispelSpell, firstDispelEffect, dispelClaimKey } from '../../domain/spells/dispel.ts';
import { AURA_INTERRUPT, isStealthSpell, spellCancelsAutoAttack } from '../../domain/spells/stealth.ts';
import { navSightClear } from './navSight.ts';
import { installStealthDetect } from './stealthDetect.ts';
import { isFormSpell, isStealthShapeshift, resolveFormCast } from '../../domain/character/forms.ts';
import { tickGroundPools } from './groundPoolTick.ts';
import {
  isWithinRadiusYd, isInSpellRange, combatDistanceYd, BASE_CHARGE_SPEED, missileTravelMs,
  MELEE_CONTACT_YD, meleeContactYd, isWithinConeYd, coneArcOf, type CombatPosYd,
} from './combatGeometry.ts';
import { isItemCombatAction, combatActionSpellId, combatActionDest } from './castAction.ts';
import { isGroundTargetedMulti, isDispelSpell, isBattleRezSpell } from '../../domain/rotation/classify.ts';
import {
  isCastInterruptible, isPacifyPrevented, isSilencePrevented, spellHasInterruptCast,
} from '../spells/interrupt.ts';
import { TAUNT_STATE, type CombatantId } from './threat.ts';
import { passesConditionGate } from '../spells/conditions.ts';
import {
  CAST_FLAG,
  markCreatureCastRowUsed,
  countCreatureCastFire,
  paceMainSpellSlot,
  eventPhaseBlocked,
  MIN_AGGRO_DISTANCE,
} from '../../domain/creature/creatureAi.ts';
import { SPELL_LIST_TARGET, TARGET_T } from '../../domain/creature/aiTargeting.ts';

// The spell-list selectors whose pool can be genuinely EMPTY, where the C++ then casts nothing.
// Cite: CreatureSpellList.h:34-44; UnitAI.cpp:1305-1330.
const SPELL_LIST_FRIENDLY_TARGETS = new Set<number>([
  SPELL_LIST_TARGET.DISPELLABLE_FRIENDLY,
  SPELL_LIST_TARGET.DISPELLABLE_FRIENDLY_NO_SELF,
  SPELL_LIST_TARGET.FRIENDLY_MISSING_BUFF,
  SPELL_LIST_TARGET.FRIENDLY_MISSING_BUFF_NO_SELF,
]);
import { ALLY_HEAL_THRESHOLD } from './types.ts';
import { applyRuleAfter, clearStepBack, commitRuleAfter, isStepBackWalking } from './ruleAfter.ts';
import { isNovaKiteSpell, NOVA_KITE_NEAR_YD, NOVA_KITE_STEP_BACK_YD } from '../../domain/rotation/classify.ts';
import { installSessionMotion } from './sessionMotion.ts';
import { createDuelBounds } from './duelBounds.ts';
import { hasAttrEx, SPELL_ATTR_EX } from '../spells/spellAttributes.ts';

/** Locals from createSession that step still closes over (not already on ctx). */
export type installStepSessionDeps = {
  dead: (...args: any[]) => any;
  sanitizeHp: (...args: any[]) => any;
  spend: (...args: any[]) => any;
  gainRage: (...args: any[]) => any;
  addComboPoints: (...args: any[]) => any;
  clearComboPoints: (...args: any[]) => any;
  comboOn: (...args: any[]) => any;
  foeOf: (...args: any[]) => any;
  ensurePlayerFocus: (...args: any[]) => any;
  hostileTargetOf: (...args: any[]) => any;
  isWeaponAction: (...args: any[]) => any;
  isBreaker: (...args: any[]) => any;
  spellCost: (...args: any[]) => any;
  allySnapshot: (...args: any[]) => any;
  castOnTargets: (...args: any[]) => any;
  useItem: (...args: any[]) => any;
  enterForm: (...args: any[]) => any;
  applyStealth: (...args: any[]) => any;
  maybeBreakStealthOn: (...args: any[]) => any;
  checkDeaths: (...args: any[]) => any;
  finalize: (...args: any[]) => any;
  unsummonTotem: (...args: any[]) => any;
  preferFocusHostile: (...args: any[]) => any;
  allEnemiesDead: (...args: any[]) => any;
  regenRage: (...args: any[]) => any;
  regenEnergy: (...args: any[]) => any;
  regenMana: (...args: any[]) => any;
  regenFocus: (...args: any[]) => any;
  regenHealth: (...args: any[]) => any;
};

export function installStepSession(ctx: CombatContext, deps: installStepSessionDeps): void {
  // E3.6. Earliest tick a cast bar in this session can land. 0 seeds it OPEN, so the first tick walks and
  // stamps the real value rather than trusting an assumption at construction.
  let castFinishDue = 0;
  // Hubs defined in OTHER peels (not re-declared as const in this module).
  const dealDamage = (...args: any[]) => (ctx.dealDamage as Function)(...args);
  const applySpell = (...args: any[]) => (ctx.applySpell as Function)(...args);
  const pickAction = (...args: any[]) => (ctx.pickAction as Function)(...args);
  // startOrCast / step / runMotionPhase / creatureRanged* are DEFINED below — do not alias.
  const onDamaged = (...args: any[]) => (ctx.onDamaged as Function)(...args);
  const breakControl = (...args: any[]) => (ctx.breakControl as Function)(...args);
  const breakCharm = (...args: any[]) => (ctx.breakCharm as Function)(...args);
  const leaveForm = (...args: any[]) => (ctx.leaveForm as Function)(...args);
  const breakStealth = (...args: any[]) => (ctx.breakStealth as Function)(...args);
  const applyEventAiIntent = (...args: any[]) => (ctx.applyEventAiIntent as Function)(...args);
  const resolveEventAiCastTarget = (...args: any[]) => (ctx.resolveEventAiCastTarget as Function)(...args);
  // Wave 4 fix-up: createSession/pickAction closures the peel left as bare identifiers.
  const fighterByThreatId = (...args: any[]) => (ctx.fighterByThreatId as Function)(...args);
  const selectAoeSecondaries = (...args: any[]) => (ctx.selectAoeSecondaries as Function)(...args);
  const aoeUnitInRadius = (...args: any[]) => (ctx.aoeUnitInRadius as Function)(...args);
  const conditionSnapshotFor = (...args: any[]) => (ctx.conditionSnapshotFor as Function)(...args);
  const runEnemyEventAi = (...args: any[]) => (ctx.runEnemyEventAi as Function)(...args);
  const runEnemyDeathEventAi = (...args: any[]) => (ctx.runEnemyDeathEventAi as Function)(...args);
  const applyProc = (...args: any[]) => (ctx.applyProc as Function)(...args);
  const triggerProcs = (...args: any[]) => (ctx.triggerProcs as Function)(...args);
  const rollGearProcs = (...args: any[]) => (ctx.rollGearProcs as Function)(...args);
  const fireDamageShields = (...args: any[]) => (ctx.fireDamageShields as Function)(...args);
  const fireDealMeleeAura42 = (...args: any[]) => (ctx.fireDealMeleeAura42 as Function)(...args);
  const weaponStrike = (...args: any[]) => (ctx.weaponStrike as Function)(...args);
  const rangedStrike = (...args: any[]) => (ctx.rangedStrike as Function)(...args);
  const fighterDualWield = (...args: any[]) => (ctx.fighterDualWield as Function)(...args);
  const tryMeleeSkillGains = (...args: any[]) => (ctx.tryMeleeSkillGains as Function)(...args);
  const isPlayerOrPetSide = (...args: any[]) => (ctx.isPlayerOrPetSide as Function)(...args);
  const onCooldown = (...args: any[]) => (ctx.onCooldown as Function)(...args);
  const canCastSpell = (...args: any[]) => (ctx.canCastSpell as Function)(...args);
  const pickNextSwingArm = (...args: any[]) =>
    (ctx.pickNextSwingArm as Function | undefined)?.(...args) as SpellDef | null | undefined;
  const schoolLocked = (...args: any[]) => (ctx.schoolLocked as Function)(...args);
  const spellIncursGcd = (...args: any[]) => (ctx.spellIncursGcd as Function)(...args);
  const getGcdMs = (...args: any[]) => (ctx.getGcdMs as Function)(...args);
  // Main-hand swing interval. A disarmed unit swings at the flat base time: haste applies to the
  // weapon's own delay, not to that substitute. Cite: SpellAuras.cpp:2443-2448.
  const mainHandSwingMs = (f: Fighter): number => (
    f.disarmedUntil > ctx.t
      ? BASE_ATTACK_TIME_MS
      : scaleTime(f.spec.weapon.speedMs, f.haste, 0)
  );
  // GCD expiry. Haste only shortens the narrow case AddGCD hastens; everything else is the flat
  // recovery time. The clamp matters because Curse of Tongues is negative haste. Cite: Player.cpp:20080.
  const gcdExpiryFor = (f: Fighter, spell: SpellDef, baseMs: number): number => (
    gcdIsHasted(spell, isPlayerCharacterSide(f.side))
      ? ctx.t + Math.min(TUNING.gcdMs, scaleTime(baseMs, f.castHaste, TUNING.minGcdMs))
      : ctx.t + baseMs
  );
  const stealthPosError = (...args: any[]) => (ctx.stealthPosError as Function)(...args);
  const chargeCastOk = (...args: any[]) => (ctx.chargeCastOk as Function)(...args);
  const isInMeleeOf = (...args: any[]) => (ctx.isInMeleeOf as Function)(...args);
  const isChargeRole = (...args: any[]) => (ctx.isChargeRole as Function)(...args);
  const controlActive = (...args: any[]) => (ctx.controlActive as Function)(...args);
  const isControlled = (...args: any[]) => (ctx.isControlled as Function)(...args);
  const isControlledHard = (...args: any[]) => (ctx.isControlledHard as Function)(...args);
  const activeControl = (...args: any[]) => (ctx.activeControl as Function)(...args);
  const isEngagedMelee = (...args: any[]) => (ctx.isEngagedMelee as Function)(...args);
  const requiresLivingPetTarget = (...args: any[]) => (ctx.requiresLivingPetTarget as Function)(...args);
  const isTriggeredCompanion = (...args: any[]) => (ctx.isTriggeredCompanion as Function)(...args);
  const livingPetOf = (...args: any[]) => (ctx.livingPetOf as Function)(...args);
  const find = (...args: any[]) => (ctx.find as Function)(...args);
  const resolveDispelTarget = (...args: any[]) => (ctx.resolveDispelTarget as Function)(...args);
  const canAfford = (...args: any[]) => (ctx.canAfford as Function)(...args);
  const allySnapshot = (...args: any[]) => (ctx.allySnapshot as Function)(...args);
  const push = (e: any) => ctx.push(e);
  const enemyCastBySide = ctx.enemyCastBySide;
  const player = ctx.player;
  const enemy = ctx.enemy;
  const pet = ctx.pet;
  // Friendly seats that drive off an ordered cast list: player, pet and companion, with no third rule.
  // Excluding the player queued every Pre-buff row into a hole, and the player is that order's caster.
  const usesHeldQueue = (f: Fighter): boolean =>
    f === player || f.side === 'pet' || isAllySide(f.side);
  /** Every seat's cast list. Read lazily: createSession hangs it on ctx after this installs. */
  const allCastOrders = (): Map<Side, QueuedCast[]> | undefined =>
    (ctx as { unitCastOrders?: Map<Side, QueuedCast[]> }).unitCastOrders;
  /** This seat's ordered cast list, or undefined when it owns none. */
  const castOrdersOf = (f: Fighter): QueuedCast[] | undefined =>
    (usesHeldQueue(f) ? allCastOrders()?.get(f.side) : undefined);
  /** What the cast list yielded this tick: the spell to cast, plus its one-shot target. */
  interface HeldPick { spell: SpellDef | null; castTgt: Fighter | null }
  /** Spell.cpp TakeReagents → itemsSpent / bagItemCounts. */
  const takeReagentsFor = (f: Fighter, spell: SpellDef): boolean =>
    takeSpellReagents(f, spell, ctx.itemsSpent, { unitItemsSpent: ctx.unitItemsSpent });
  const totems = ctx.totems;
  const effects = ctx.effects;
  const events = ctx.events;
  const invalidTargetReported = ctx.invalidTargetReported;
  const rng = ctx.rng;
  const tickMs = ctx.tickMs;
  const maxMs = ctx.maxMs;
  const cfg = ctx.cfg;
  const distanceBetween = ctx.distanceBetween;
  // White Auto Shot / wand / Throw: SpellEntry.speed is real (75=40, 5019=20, 2764=20) but the
  // swing never went through deliverOrQueueMissile. Cite: Spell.cpp GetSpellSpeed; Unit.cpp:4192.
  const fireRangedAuto = (f: Fighter, tgt: Fighter): boolean => {
    const shot = rangedAutoSpellOf(f);
    const speed = shot?.speed ?? 0;
    if (!ctx.unitPositionsMutable || !shot || !(speed > 0)) {
      return rangedStrike(f, tgt, null);
    }
    const dist = distanceBetween(f, tgt);
    const travelMs = dist != null ? missileTravelMs(dist, speed) : 0;
    if (!(travelMs > 0)) return rangedStrike(f, tgt, null);
    ctx.pendingMissiles.push({
      launchAt: ctx.t, landAt: ctx.t + travelMs,
      casterSide: f.side, targetSide: tgt.side, spell: shot,
      castCritAdd: 0, castEffectPct: 0,
      whiteRanged: true,
      ...(f.spec.ranged?.school ? { school: f.spec.ranged.school } : {}),
    });
    return true;
  };
  const livingEnemies = ctx.livingEnemies;
  const livingFriendlies = ctx.livingFriendlies;
  const bySide = ctx.bySide;
  const duelBounds = createDuelBounds(ctx);
  const fightersOrder = ctx.fightersOrder;
  /**
   * The ACTION walk only. `fightersOrder()` is `[player, pet, allies, totems, enemies]` and nine
   * bookkeeping loops depend on that shape, so it is left alone — but resolving ACTIONS in it
   * hands the same side every tie, and the opener is a tie: `Spell::cast:3223`
   * SetInCombatWithVictim puts both units in combat, and Charge is `notInCombatOnly`, so whoever
   * resolves first denies the other. Measured in a warrior 1v1 mirror: Charge 20/0, and reversing
   * the order flips it to 0/20 and takes the mirror from 5/15 to 10/10.
   *
   * An ARENA rotates this walk per fight so neither side owns the opener. Derived from the bodies'
   * own names, NOT from the session RNG: consuming a roll here would move every existing fight.
   * `enemiesAreATeam` gates it, so every dungeon and raid pull keeps the canonical order.
   */
  let actionRotation = -1;
  const actionOrder = (): Fighter[] => {
    const order = fightersOrder();
    if (cfg.enemiesAreATeam !== true || order.length < 2) return order;
    if (actionRotation < 0) {
      let h = 0;
      for (const f of order) {
        const n = f.spec.name ?? '';
        for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) | 0;
      }
      actionRotation = Math.abs(h) % order.length;
    }
    if (actionRotation === 0) return order;
    return [...order.slice(actionRotation), ...order.slice(0, actionRotation)];
  };
  const isCharmed = ctx.isCharmed;
  const posOf = ctx.posOf;
  const setPos = ctx.setPos;
  const applyDamageThreat = (...args: any[]) => (ctx.applyDamageThreat as Function)(...args);
  const applyHealThreat = (...args: any[]) => (ctx.applyHealThreat as Function)(...args);
  const threatOf = (owner: Fighter) => (ctx.threatOf as Function)(owner);
  const dead = deps.dead;
  const sanitizeHp = deps.sanitizeHp;
  const spend = deps.spend;
  const gainRage = deps.gainRage;
  const addComboPoints = deps.addComboPoints;
  const clearComboPoints = deps.clearComboPoints;
  const comboOn = deps.comboOn;
  const foeOf = deps.foeOf;
  const ensurePlayerFocus = deps.ensurePlayerFocus;
  const hostileTargetOf = deps.hostileTargetOf;
  // isControlled / isControlledHard already bound from ctx hubs above
  const isWeaponAction = deps.isWeaponAction;
  const isBreaker = deps.isBreaker;
  // onCooldown/canCastSpell/schoolLocked/weaponStrike/etc. already bound from ctx hubs above.
  const spellCost = deps.spellCost;
  const castOnTargets = deps.castOnTargets;
  const useItem = deps.useItem;
  /** This unit's own kit + item-cooldown map (player / ally / BG enemy bot), or null. */
  const { bagAndCdOf, itemBreaksControl, tryItemRescue } = createItemRescue(ctx, useItem);
  const enterForm = deps.enterForm;
  const applyStealth = deps.applyStealth;
  const maybeBreakStealthOn = deps.maybeBreakStealthOn;
  const breakFeignDeath = (f: Fighter): void => {
    const sid = dropFeignDeath(f);
    if (!sid) return;
    f.buffActive.delete(sid);
    let name = 'Feign Death';
    for (const e of ctx.effectsOn(f.side)) {
      if (e.spellId === sid) {
        name = e.name;
        e.expiresAt = Math.min(e.expiresAt, ctx.t);
        ctx.touchEffect(e);
      }
    }
    push({ t: ctx.t, kind: 'aura', actor: f.side, name, applied: false, spellId: sid });
  };
  const checkDeaths = deps.checkDeaths;
  const finalize = deps.finalize;
  const unsummonTotem = deps.unsummonTotem;
  // runEnemyDeathEventAi already from ctx hub above
  const preferFocusHostile = deps.preferFocusHostile;
  const allEnemiesDead = deps.allEnemiesDead;
  const regenRage = deps.regenRage;
  const regenEnergy = deps.regenEnergy;
  const regenMana = deps.regenMana;
  const regenFocus = deps.regenFocus;
  const regenHealth = deps.regenHealth;

  const creatureRangedMainReady = (cs: EnemyCastState, f: Fighter): boolean => {
    if (cs.eventAi.rangedMode) return true;
    const phase = cs.eventAi.phase ?? 0;
    const foe = hostileTargetOf(f);
    for (const slot of cs.slots) {
      if (slot.exhausted || ctx.t < slot.readyAt) continue;
      if (eventPhaseBlocked(slot.entry.eventInversePhaseMask, phase)) continue;
      const flags = slot.entry.castFlags ?? 0;
      if (!isCreatureRangedMainAttack(slot.spell, flags)) continue;
      if (onCooldown(f, slot.spell)) continue;
      const forceCast =
        (flags & (CAST_FLAG.FORCE_CAST | CAST_FLAG.FORCE_TARGET_SELF)) !== 0;
      const triggered = (flags & CAST_FLAG.TRIGGERED) !== 0;
      if (!forceCast && !triggered && !canAfford(f, slot.spell)) continue;
      if (
        !forceCast
        && (spellNeedsRangeGate(slot.spell) || spellFoeDirectedGeometry(slot.spell))
        && !isInSpellRange(
          distanceBetween(f, foe),
          spellGateRangeMaxYd(slot.spell), spellGateRangeMinYd(slot.spell),
          ctx.isMoving(f.side) && ctx.isMoving(foe.side),
          f.spec.combatReachYd, foe.spec.combatReachYd,
        )
      ) {
        continue;
      }
      return true;
    }
    return false;
  };

  /** Drop an armed next-cast modifier (consumed by a matching cast, or replaced by a new one). */
  const consumePendingSpellMod = (f: Fighter): void => {
    const m = f.pendingSpellMod;
    if (!m) return;
    f.pendingSpellMod = null;
    f.buffActive.delete(m.spellId);
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i]!;
      if (e.kind === 'buff' && e.spellId === m.spellId && e.target === f.side) {
        effects.splice(i, 1);
        push({ t: ctx.t, kind: 'aura', actor: f.side, name: e.name, applied: false });
      }
    }
  };
  ctx.consumePendingSpellMod = consumePendingSpellMod;

  // Charge travel, gap-close, area-aura maintain — see sessionMotion.ts.
  const {
    finishChargeArrival,
    advanceChargeMove,
    enemyEngaged,
    runMotionPhase: motionCore,
    areaAuraMaintainPhase: areaAuraCore,
  } = installSessionMotion({
    ctx,
    dead,
    fighterByThreatId,
    hostileTargetOf,
    foeOf,
    isChargeRole,
    onCooldown,
    canAfford,
    weaponStrike,
    castOnTargets,
    posOf,
    setPos,
    fightersOrder,
    bySide,
    effects,
    tickMs,
  });

  // Phases split out of combat.sim, which is otherwise the whole tick under one bucket name.
  const runMotionPhase = (): void => combatPerf('sim.motion', motionCore);
  const areaAuraMaintainPhase = (): void => combatPerf('sim.areaAuras', areaAuraCore);
  const eventAiCore = (): void => {
    for (const ef of ctx.livingEnemies()) runEnemyEventAi(ef);
    // Ally-seat summons have no EventAI pass of their own. Cite: SpellEffects.cpp:2765.
    ctx.expireFriendlySummons?.();
  };
  const eventAiPhase = (): void => combatPerf('sim.eventAi', eventAiCore);
  // Stealth detect on the core's own timer (BG 500 ms / world 2000 ms) — self-gated.
  installStealthDetect(ctx, { dead });

  const nearestHostileYd = (f: Fighter): number | null => {
    const from = ctx.posOf(f.side);
    if (!from) return null;
    let best = Infinity;
    for (const h of ctx.livingHostilesFor(f)) {
      if (dead(h) || h === f) continue;
      const d = combatDistanceYd(from, ctx.posOf(h.side));
      if (d != null && d < best) best = d;
    }
    return Number.isFinite(best) ? best : null;
  };

  const novaPileNear = (f: Fighter, spell: SpellDef): boolean => {
    const d = nearestHostileYd(f);
    const cap = (spell.radiusYd != null && spell.radiusYd > 0)
      ? spell.radiusYd + 2
      : NOVA_KITE_NEAR_YD;
    return d != null && d <= cap;
  };

  const commitAfterCast = (f: Fighter, spell: SpellDef): void => {
    if (isEnemySide(f.side)) return;
    const kite = isNovaKiteSpell(spell);
    if (commitRuleAfter(f, spell.id, ctx.t)) {
      if (kite && !novaPileNear(f, spell)) clearStepBack(f);
      return;
    }
    if (kite && !isStepBackWalking(f, ctx.t) && novaPileNear(f, spell)) {
      applyRuleAfter(f, { stepBackYd: NOVA_KITE_STEP_BACK_YD }, ctx.t);
    }
  };

  const startOrCast = (f: Fighter, foe: Fighter, spell: SpellDef): void => {
    // Hard reactive gate so a force-cast cannot freecast Mongoose Bite. Do NOT consume the window
    // here — a later early-return on range, form or school must leave it open.
    if (reactiveCastGate(f, foe, spell, ctx.t) != null) return;
    if (targetCastGate(f, foe, spell, ctx.t) != null) return;
    // OOC stand-down / no live foe: never arm a hostile into the caster (or a corpse).
    // pickAction gates this; EventAI force paths and mid-cast finish still hit deliver below.
    const destRow = ctx.castDestOverride?.get(f.side);
    const dest = destRow && destRow.spellId === spell.id ? destRow.dest : undefined;
    if (isHostileSpellDef(spell) && (foe === f || dead(foe)) && !isCasterOriginAoe(spell) && !dest) return;
    // Player EquippedItem full slot refuse before spend (creatures skip — Spell.cpp:6542).
    // Cite: Spell.cpp:6539–6543; Player.cpp:18572; equippedItemGate.ts.
    if (isPlayerCharacterSide(f.side) && playerMissingRequiredEquippedItem(spell, f.spec)) return;
    // Spell.cpp CheckItems — Soul Shard on Shadowburn etc. before GCD/spend.
    // Cite: Spell.cpp:6560–6593; KI-804.
    if (!canPaySpellReagents(f, spell)) return;
    // Classic pure-DISPEL CheckCast: no matching aura → SPELL_FAILED_NOTHING_TO_DISPEL
    // (no mana / no GCD). Cite: Spell.cpp:4890–4919; KI-610 Purge combat mana sink.
    if (isPureDispelSpell(spell)) {
      const de = firstDispelEffect(spell);
      if (de && resolveDispelTarget(f, foe, de.dispelType) == null) return;
    }
    // Attack is the melee auto-attack toggle, off the GCD and free. Stealth enter cancels auto-attack,
    // and pressing Attack is the interrupt flag that re-enables swings. Cite: Unit.cpp Attack.
    if (roleOf(spell) === 'attack') {
      f.mode = 'melee';
      f.autoAttackEnabled = true;
      if (f.stealthed) maybeBreakStealthOn(f, AURA_INTERRUPT.ATTACKING, 'attacking');
      if (f.feigningUntil > ctx.t) breakFeignDeath(f);
      f.autoAttackEnabled = true;
      if (f.swingReadyAt > ctx.t + 60_000) f.swingReadyAt = ctx.t;
      return;
    }
    // EventAI castFlags for the armed creature slot (DoCastSpellIfCan).
    // Cite: UnitAI.cpp DoCastSpellIfCan ~160–223; UnitAI.h CastFlags ~64–79.
    let castFlags = 0;
    if (isEnemySide(f.side)) {
      const cs = enemyCastBySide.get(f.side as EnemySide);
      if (cs?.pendingSlot && cs.pendingSlot.spell.id === spell.id) {
        castFlags = cs.pendingSlot.entry.castFlags ?? 0;
      }
    }
    // Clip on commit. A different instant replaces CURRENT_GENERIC_SPELL.
    // Cite: Spell.cpp Prepare ~2921; Unit.cpp:4203-4212 SetCurrentCastedSpell.
    const clipInFlightCast = (): void => {
      if (
        f.castingSpell
        && (
          (castFlags & CAST_FLAG.INTERRUPT_PREVIOUS) !== 0
          || (!isEnemySide(f.side) && spellHasInterruptCast(spell) && (spell.castTimeMs ?? 0) <= 0)
          || (f.side === 'player' && !ctx.aiPlayer && (spell.castTimeMs ?? 0) <= 0 && !isNextMeleeSwingSpell(spell))
          || (
            cfg.enemiesAreATeam === true
            && !isEnemySide(f.side)
            && (spell.castTimeMs ?? 0) <= 0
            && !isNextMeleeSwingSpell(spell)
            && f.castingSpell.id !== spell.id
          )
        )
      ) {
        f.castingSpell = null;
        f.castFinishAt = 0;
        f.castStartedAt = 0;
        f.castBaseMs = 0;
        f.castPushbacks = 0;
        f.castCost = 0;
        f.castCostPower = undefined;
      }
    };
    // FORCE_TARGET_SELF makes the caster the target; SWITCH_CASTER_TARGET swaps the two and is rare
    // in the bake. Cite: UnitAI.cpp ~167-170.
    if ((castFlags & (CAST_FLAG.FORCE_TARGET_SELF | CAST_FLAG.SWITCH_CASTER_TARGET)) !== 0) {
      foe = f;
    }
    const forceCast =
      (castFlags & (CAST_FLAG.FORCE_CAST | CAST_FLAG.FORCE_TARGET_SELF)) !== 0;
    const triggered = (castFlags & CAST_FLAG.TRIGGERED) !== 0;

    // Stance gate: NOT_SHAPESHIFT leaves form then casts, but the positional and stealth gates run
    // FIRST — otherwise Backstab breaks stealth, behindOk flips, and the cast returns with no hit.
    const gate = resolveFormCast(spell, f.form);
    if (!gate.ok) return;
    if (stealthPosError(f, foe, spell)) return;
    // DG / Geometry v2.1b: out-of-range foe specials do not land (Spell.cpp CheckCast before spend).
    // FORCE_CAST / FORCE_TARGET_SELF skip range (UnitAI.cpp ~196–202).
    if (!forceCast) {
      if (isChargeRole(spell)) {
        if (!chargeCastOk(f, foe, spell)) return;
      } else if (spellNeedsRangeGate(spell) || spellFoeDirectedGeometry(spell)) {
        const rangeD = dest
          ? combatDistanceYd(ctx.posOf(f.side), dest)
          : distanceBetween(f, foe);
        if (!isInSpellRange(
          rangeD, spellGateRangeMaxYd(spell), spellGateRangeMinYd(spell),
          !dest && ctx.isMoving(f.side) && ctx.isMoving(foe.side),
          f.spec.combatReachYd, foe.spec.combatReachYd,
        )) return;
      }
      // Spell.cpp:4742 CheckCast unit-target LOS. FORCE_CAST / TRIGGERED skip CanCastSpell.
      if (!triggered && cfg.navLos && spellNeedsLosGate(spell)) {
        const destSight = dest ?? posOf(foe.side);
        if (!navSightClear(cfg, posOf(f.side), destSight)) return;
      }
    }
    if (dest) f.castDest = dest;
    else if (!spell.onNextSwing) f.castDest = null;
    // Pick Pocket must NOT leave stealth: 1.12 keeps the thief stealthed after a successful pocket,
    // and NOT_SHAPESHIFT on the bake would otherwise strip the form. Cite: SpellEffects.cpp.
    const isPickPocketSpell = (spell.effects ?? []).some((e) => e.kind === 'pickpocket')
      && !(spell.effects ?? []).some((e) => e.kind !== 'pickpocket');
    if (gate.leaveForm && f.form && !isPickPocketSpell) {
      // Leaving FORM_STEALTH via NOT_SHAPESHIFT also drops the stealth aura.
      if (isStealthShapeshift(f.form) && f.stealthed) breakStealth(f, 'action');
      else leaveForm(f);
    }
    // School lockout (PreventionType SILENCE + locked school). Cite: Object.cpp IsSpellReady ~2736.
    if (schoolLocked(f, spell)) return;

    // A hostile cast start puts both in combat, AFTER CheckCast as in Spell::prepare. Flagging first
    // made Charge refuse itself on the flag it had just set, so every pull lost its opener.
    if (isHostileSpellDef(spell) && foe !== f) {
      touchCombatFlag(f, ctx.t);
      touchCombatFlag(foe, ctx.t);
      if (isEnemySide(foe.side)) maybeAggroZonePulse(foe, ctx.partyUnits(), ctx.t);
    }

    // Party interrupt: one Kick/CS/Spell Lock per casting target. Miss releases the claim so
    // the next free interrupter can cover; a landed kick clears the cast (and the claim).
    if (
      spellHasInterruptCast(spell)
      && isEnemySide(foe.side)
      && (f.side === 'player' || f.side === 'pet' || isAllySide(f.side))
    ) {
      const owner = ctx.interruptClaim.get(foe.side);
      if (owner != null && owner !== f.side) {
        const o = ctx.bySide(owner as Side);
        if (o && !dead(o)) return;
      }
      ctx.interruptClaim.set(foe.side, f.side);
    }

    // Party dispel: one Tranq/Purge/Cleanse per (target, category). Cite: AUTOPILOT-PLAN §4 row 21.
    if (
      isDispelSpell(spell)
      && (f.side === 'player' || f.side === 'pet' || isAllySide(f.side))
    ) {
      for (const e of spell.effects) {
        if (e.kind !== 'dispel') continue;
        const res = resolveDispelTarget(f, foe, e.dispelType);
        if (!res) continue;
        // The take used to accept any live owner, without asking whether the category was still
        // on the target or the owner still casting — a kicked holder kept the key. dispelDuty.ts.
        const owner = dispelOwnerThisTick(ctx, res.unit.side, e.dispelType, dead);
        if (owner != null && owner !== f.side) return;
        ctx.dispelClaim.set(dispelClaimKey(res.unit.side, e.dispelType), f.side);
      }
    }

    // Party battle rez: one Rebirth per corpse. Every druid ranks corpses the same way, so without the
    // claim they all open on one body and every cast but the first spends a 30 min cooldown for nothing.
    if (isBattleRezSpell(spell) && (f.side === 'player' || isAllySide(f.side))) {
      const corpse = pickBattleRezTarget(
        ctx.partyUnits(),
        f,
        (c) => ctx.rezClaim.get(c.side),
      );
      if (!corpse) return;
      ctx.rezClaim.set(corpse.side, f.side);
    }

    // Past CheckCast-style gates: consume the react window (one use per proc; CD ≈ window).
    consumeReactiveWindow(f, foe, spell);

    // CAST_TRIGGERED — zero mana + no cast time. UnitAI.cpp ~214 TRIGGERED_OLD_TRIGGERED.
    let cost = triggered ? 0 : spellCost(f, spell);
    // FORCE_CAST still spends mana if affordable; OOM is allowed only because canCast was skipped.
    if (forceCast && !triggered && !canAfford(f, spell)) {
      cost = 0; // force through without mana (C++ CastSpell with FORCE_CAST path)
    }
    const spendPt: PowerType | undefined =
      spell.powerType === 'health' ? 'health'
        : spell.powerType === 'mana' || isFormSpell(spell) ? 'mana'
          : spell.powerType === 'rage' || spell.powerType === 'energy' ? spell.powerType
            : undefined;

    // On-next-swing abilities do not hit now and do not trigger the GCD: they arm the next white swing.
    // CheckPower is current rage, not a predicted next-hit term. Cite: Spell.cpp CheckPower; Prepare.
    if (isNextMeleeSwingSpell(spell)) {
      if (f.pendingSwing) return; // already armed — don't re-spend
      if (!triggered && !forceCast && !canAfford(f, spell)) return;
      clipInFlightCast();
      // The arm is Spell::prepare, which sends SPELL_START and stops — cast() runs later, off the
      // swing that carries it, so cast_finish is pushed there. Cite: Spell.cpp:2978-2981.
      if (isEnemySide(f.side)) ctx.notifyEventAiSpellCast?.(f, spell.id);
      spend(f, cost, spendPt, spell);
      takeReagentsFor(f, spell);
      if (spell.rageGenerated) gainRage(f, spell.rageGenerated);
      f.pendingSwing = spell;
      return;
    }
    // Pure Auto Shot / Shoot / Throw enables ranged auto with the equipped weapon, paced by weapon
    // speed on ONE path. Re-tapping in ranged mode is a no-op; Multi and Aimed fall through to cast.
    if (isRangedAutoRepeatToggle(spell)) {
      const rw = f.spec.ranged;
      if (!rw) return; // no ranged weapon equipped — nothing to fire (also gated in usability)
      // SpellRange min dead zone — Throw / Auto Shot cannot fire in melee.
      // Cite: SpellRange.dbc min; isInSpellRange; Spell.cpp range check.
      {
        const dist = distanceBetween(f, foe);
        if (!isInSpellRange(dist, spell.rangeMax, spell.rangeMin ?? rangedAutoMinYards(f))) {
          return;
        }
      }
      const wasRanged = f.mode === 'ranged';
      f.mode = 'ranged'; // exclusive with melee white (swing uses ranged when mode=ranged)
      f.autoAttackEnabled = true;
      // Already wanding/Auto Shot: swing phase owns the stream. Do not stack a second hit
      // or burn GCD (healer AI re-picking Shoot every CD must not lock out heals).
      if (wasRanged) return;
      clipInFlightCast();
      spend(f, cost, spendPt, spell);
      const rangedHaste = f.haste + (f.spec.rangedHastePct ?? 0);
      const effRwSpeed = scaleTime(rw.speedMs, rangedHaste, 0);
      f.cooldowns.set(spell.id, ctx.t + Math.max(personalCooldownMs(spell), effRwSpeed));
      {
        const catMs = categoryCooldownMs(spell);
        if (spell.category != null && catMs > 0) {
          f.categoryCooldowns.set(spell.category, ctx.t + catMs);
        }
      }
      const gShoot = getGcdMs(spell);
      if (gShoot > 0) f.gcdUntil = gcdExpiryFor(f, spell, gShoot);
      // First enable: one shot now, then lock the shared swing timer to weapon pace.
      fireRangedAuto(f, foe);
      f.swingReadyAt = Math.max(f.swingReadyAt, ctx.t + effRwSpeed);
      return;
    }
    // Consume an armed next-cast modifier (Presence of Mind, Cold Blood, Nature's Swiftness): zero the
    // cost, zero the cast time, and arm the per-cast crit bonus read at the rolls below.
    let effCost = applyOwnedSpellMod(f, spell, SPELLMOD_COST, cost);
    let effCastMs = triggered ? 0 : applyOwnedSpellMod(f, spell, SPELLMOD_CASTING_TIME, spell.castTimeMs);
    if (f.pendingSpellMod && nextCastModApplies(f.pendingSpellMod, spell)) {
      const m = f.pendingSpellMod;
      if (m.freeCost) effCost = 0;
      // costModPct = SPELLMOD_COST on the resolved cost — not SpellDef.costPct (base-mana %).
      // Cite: SpellDefines.h SPELLMOD_COST=14; Fel Domination −50.
      else if (m.costModPct) effCost = Math.max(0, Math.round(effCost * (1 + m.costModPct / 100)));
      // ApplySpellMod adds the FLAT rows before the PCT (Warrior's Wrath −50, Retributive Smite −300).
      if (m.costFlat) effCost = Math.max(0, effCost + m.costFlat);
      if (m.instant) effCastMs = 0;
      else if (m.castTimeFlat) effCastMs = Math.max(0, effCastMs + m.castTimeFlat);
      if (m.critAdd) f.castCritAdd = m.critAdd;
      if (m.effectPct) f.castEffectPct = m.effectPct; // Amplify Curse +50% next-curse effect
      consumePendingSpellMod(f);
    }
    // Check if we need to cancel autorepeat (like wand Shoot). Auto Shot lacks the bit.
    // Cite: Unit.cpp:4256-4259 case CURRENT_AUTOREPEAT_SPELL and case CURRENT_CHANNELED_SPELL.
    if (!triggered && f.mode === 'ranged' && f.autoAttackEnabled) {
      const autorepeatSpell = f.spec.spells.find(isRangedAutoRepeatToggle);
      if (autorepeatSpell && hasAttrEx3(autorepeatSpell, SPELL_ATTR_EX3.CASTING_CANCELS_AUTOREPEAT)) {
        f.autoAttackEnabled = false;
      }
    }

    // Prepare only starts the timer and adds the GCD; the power cost and cooldown are taken in cast(),
    // and cancel() takes neither, so an interrupted cast is free. Cost is held post-mod, paid at finish.
    if (effCastMs > 0) {
      clipInFlightCast();
      const gCast = getGcdMs(spell);
      if (gCast > 0) f.gcdUntil = gcdExpiryFor(f, spell, gCast);
      // Starting a bar drops a live channel HERE, at Prepare, not when the new spell lands: waiting
      // let a 3 s Frostbolt tick a Mind Flay through its whole cast. Cite: Unit.cpp:4221-4224.
      if (f.channeling) interruptChannel(f, channelInterruptCtx(ctx));
      f.castingSpell = spell;
      f.castStartedAt = ctx.t;
      // Haste-modified cast time (m_casttime). Cite: Unit.cpp / Spell.cpp cast timer;
      // formulas.scaleTime; Berserking MOD_HASTE (KI-125).
      f.castBaseMs = scaleTime(effCastMs, f.castHaste, 0);
      f.castFinishAt = ctx.t + f.castBaseMs;
      // E3.6: the only write that can move the session's next cast landing EARLIER. Miss this and
      // the bar hangs until some later cast happens to reopen the walk.
      if (f.castFinishAt < castFinishDue) castFinishDue = f.castFinishAt;
      f.castPushbacks = 0;
      f.castCost = effCost;
      f.castCostPower = spendPt;
      // Non-default aim survives the bar. Finish otherwise re-resolves foeOf (the kill target).
      if (isEnemySide(foe.side)) {
        const fallback = isEnemySide(f.side) ? hostileTargetOf(f) : foeOf(f);
        if (foe !== fallback) {
          (ctx.castTargetOverride ??= new Map()).set(f.side, {
            spellId: spell.id,
            side: foe.side as EnemySide,
          });
        }
      }
      // cast_start.castMs is the live bar duration (haste-scaled), not the spell row base.
      push({ t: ctx.t, kind: 'cast_start', actor: f.side, spellId: spell.id, name: spell.name, castMs: f.castBaseMs });
      return;
    }
    // A deliberate instant breaks a live channel at the cast, as the bar branch does. Triggered
    // payloads are exempt — they are the channel's own output. Cite: Unit.cpp:4236-4243.
    if (!triggered && f.channeling) maybeCancelChannelOnAction(f, channelInterruptCtx(ctx));
    clipInFlightCast();
    // Instant: Prepare falls through to cast() this tick, so cost and cooldown land now and cast_finish
    // is emitted here too. Everything downstream keys off it; "a bar was shown" is cast_start.
    push({ t: ctx.t, kind: 'cast_finish', actor: f.side, spellId: spell.id, name: spell.name });
    // EVENT_T_SPELL_CAST (37) on the caster. Cite: CreatureEventAI.cpp OnSpellCast.
    if (isEnemySide(f.side)) ctx.notifyEventAiSpellCast?.(f, spell.id);
    commitAfterCast(f, spell);
    spend(f, effCost, spendPt, spell);
    maybeResetMeleeAttackTimersOnCast(f, spell, ctx.t, triggered);
    // TakeReagents after TakePower (Spell.cpp cast ~3168–3176). Cite: KI-804 Shadowburn.
    takeReagentsFor(f, spell);
    if (!triggered && !hasAttrEx2(spell, SPELL_ATTR_EX2.NOT_AN_ACTION)) {
      ctx.removeAurasWithInterruptFlags?.(f, AURA_INTERRUPT.ACTION_LATE, 'action late');
    }
    // Personal + category recovery (SpellMgr.h GetSpellRecoveryTime / separate timers).
    // Cite: spells/recovery.ts; category may use categoryRecoveryMs when sourced.
    {
      const rec = recoveryReadyAts(spell, ctx.t);
      // COOLDOWN_ON_EVENT: the cast installs a permanent entry and the real timer starts when the aura
      // fades. Re-stealth used to be free the instant stealth broke. Cite: Spell.cpp:3414.
      const deferred = cooldownStartsOnAuraFade(spell);
      if (rec.personalReadyAt != null) {
        const adj = applyOwnedSpellMod(f, spell, SPELLMOD_COOLDOWN, rec.personalReadyAt - ctx.t);
        if (adj > 0) {
          if (deferred) {
            f.cooldowns.set(spell.id, PERMANENT_COOLDOWN_READY_AT);
            (f.deferredCooldowns ??= new Map()).set(spell.id, adj);
          } else {
            f.cooldowns.set(spell.id, ctx.t + adj);
          }
        }
      }
      if (rec.category != null && rec.categoryReadyAt != null) {
        const adj = applyOwnedSpellMod(f, spell, SPELLMOD_COOLDOWN, rec.categoryReadyAt - ctx.t);
        if (adj > 0) {
          // The client keeps the category cd by the original spell id, and the category entry
          // defers with it. Cite: Player.cpp:20197-20208.
          f.categoryCooldowns.set(
            rec.category,
            deferred ? PERMANENT_COOLDOWN_READY_AT : ctx.t + adj,
          );
          if (deferred) (f.deferredCategoryCooldowns ??= new Map()).set(spell.id, { category: rec.category, ms: adj });
        }
      }
    }
    const g = getGcdMs(spell);
    if (g > 0) f.gcdUntil = gcdExpiryFor(f, spell, g);
    if (spell.rageGenerated) gainRage(f, spell.rageGenerated);

    // Hostile / actionable cast: break stealth (AIF ACTION) unless this spell *is* the stealth enter.
    // Pick Pocket does not break stealth (vanilla 1.12; KI-612).
    const isStealthEnter = isStealthSpell(spell);
    const isPickPocketCast = (spell.effects ?? []).some((e) => e.kind === 'pickpocket')
      && !(spell.effects ?? []).some((e) => e.kind !== 'pickpocket');
    const isSpellBreakStealth = !hasAttrEx(spell, SPELL_ATTR_EX.ALLOW_WHILE_STEALTHED);
    if (!isStealthEnter && !isPickPocketCast && isSpellBreakStealth) maybeBreakStealthOn(f, AURA_INTERRUPT.ACTION, 'action');
    // The rest of RemoveAurasOnCast: every OTHER ACTION-flagged holder goes, the caster's own
    // excepted. Stealth is skipped because the guarded break above owns it. Cite: Spell.cpp:2943-2944;
    // Unit.cpp:5239-5252.
    if (!triggered && !hasAttrEx2(spell, SPELL_ATTR_EX2.NOT_AN_ACTION)) {
      ctx.removeAurasWithInterruptFlags?.(f, AURA_INTERRUPT.ACTION, 'action', {
        skipStealth: true, exceptSpellId: spell.id,
        skipInvisibility: hasAttrEx2(spell, SPELL_ATTR_EX2.ALLOW_WHILE_INVISIBLE),
      });
    }
    // Feign Death AIF includes ACTION (0x4) — any cast (except FD itself) drops the pose.
    // CheckCast already ran, so a trap still places while OOC. Cite: Spell.cpp:2944; 5384 AIF 0x3c3c.
    if (!spell.effects.some((e) => e.kind === 'feign_death')) breakFeignDeath(f);

    // AttackStop on the flag, or on Gouge/Sap incapacitate. Do not fall through to the combo-point
    // re-enable — Gouge generates one. Cite: Spell.cpp:3691-3700.
    if (spellCancelsAutoAttack(spell)) {
      f.autoAttackEnabled = false;
      f.pendingSwing = null;
    } else if (roleOf(spell) === 'strike' || roleOf(spell) === 'shoot'
      || spell.requiresBehind || spell.comboPointsGenerated
      || (spell.dmgClass ?? -1) === SPELL_DAMAGE_CLASS.MELEE
      || ((spell.dmgClass ?? -1) === SPELL_DAMAGE_CLASS.RANGED
        && spell.effects.some((e) => e.kind === 'weapon_percent_damage'))) {
      // Openers, builders, melee abilities and ranged shots re-enable auto-attack. A MELEE dmgClass
      // flips off Auto Shot so whites can finish a totem; Multi and Aimed keep ranged mode.
      if (((spell.dmgClass ?? -1) === SPELL_DAMAGE_CLASS.RANGED || roleOf(spell) === 'shoot')
        && f.spec.ranged) {
        f.mode = 'ranged';
      } else if ((spell.dmgClass ?? -1) === SPELL_DAMAGE_CLASS.MELEE) {
        f.mode = 'melee';
      }
      f.autoAttackEnabled = true;
      if (f.swingReadyAt > ctx.t + 60_000) f.swingReadyAt = ctx.t;
    }

    // Charge and Intercept spend above, then travel at charge speed until melee before the effects
    // apply. Arrival can act on the same tick. Without geometry it falls through to an instant cast.
    if (isChargeRole(spell) && ctx.unitPositionsMutable) {
      f.chargeUsed = true;
      f.autoAttackEnabled = true;
      if (f.swingReadyAt > ctx.t + 60_000) f.swingReadyAt = ctx.t;
      const dist = distanceBetween(f, foe);
      const speed = (spell.speed != null && spell.speed > 0) ? spell.speed : BASE_CHARGE_SPEED;
      if (dist != null && dist > MIN_AGGRO_DISTANCE) {
        f.pendingCharge = { spell, targetSide: foe.side, speed };
        // One charge step this tick; if already in band after step, resolve effects now.
        advanceChargeMove(f);
        return;
      }
      finishChargeArrival(f, foe, spell);
      return;
    }

    // Weapon strike / nuke / etc. — missiles with SpellEntry.speed delay impact.
    deliverOrQueueMissile(f, foe, spell);
    // Immediate path clears next-cast mods inside deliverOrQueueMissile; delayed keeps
    // the snapshot on the pending row and zeros the fighter so a second cast does not double-dip.
  };

  // Apply spell effects / weapon strike at impact time (cast finish or missile land). Cite: Spell.cpp
  // handle_immediate after travel.
  const deliverSpellImpact = (f: Fighter, castTgt: Fighter, spell: SpellDef): void => {
    // Weapon sample path: melee strikes and ranged weapon shots, which still carry weapon_percent
    // and a RANGED dmgClass. Pure Auto Shot never reaches here — the toggle returns early.
    const hasWeaponPct = spell.effects.some((e) => e.kind === 'weapon_percent_damage');
    const weaponSample = roleOf(spell) === 'strike' || roleOf(spell) === 'shoot'
      || !!spell.strikeBonus
      || (hasWeaponPct && (spell.dmgClass ?? -1) === SPELL_DAMAGE_CLASS.RANGED);
    if (weaponSample) {
      // A ranged normalized strike goes to rangedStrike when a ranged weapon is equipped; NPC kits
      // bake main-hand only, so they fall back rather than silently dealing melee damage.
      const isRanged = (spell.dmgClass ?? -1) === SPELL_DAMAGE_CLASS.RANGED
        || roleOf(spell) === 'shoot';
      if (isRanged && f.spec.ranged) {
        // Multi-Shot chain / single Aimed: primary via rangedStrike, then chain jumps.
        const primaryInRadius = !spell.aoe || aoeUnitInRadius(f, castTgt, castTgt, spell);
        const landed = primaryInRadius ? rangedStrike(f, castTgt, spell) : false;
        const riders = spell.effects.filter(
          (e) => e.kind === 'buff' || e.kind === 'dot' || e.kind === 'cc' || e.kind === 'root'
            || e.kind === 'knock_back' || e.kind === 'modify_threat_pct'
            // Target-borne periodic-trigger debuffs (Nefarian's class calls) fan with the AoE;
            // channel holders (targetA CASTER) carry no auraOnTarget and stay off the rider.
            || (e.kind === 'proc_trigger_spell' && e.auraOnTarget === true),
        );
        const riderSpell = riders.length
          ? { ...spell, effects: riders, rawEffects: undefined }
          : null;
        if (landed && riderSpell) applySpell(f, castTgt, riderSpell);
        if (spell.aoe) {
          let pool = isEnemySide(f.side) ? livingFriendlies() : livingEnemies();
          if (cfg.endless && !isEnemySide(f.side)
            && !(spell.radiusYd != null && spell.radiusYd > 0)) {
            pool = pool.filter((e) => {
              if (e === castTgt) return true;
              const tm = threatOf(e); return !!tm && !tm.isEmpty();
            });
          }
          const cap = aoeTotalTargetCap(spell);
          const others = selectAoeSecondaries(f, castTgt, spell, pool, cap);
          for (const other of others) {
            const otherLanded = rangedStrike(f, other, spell);
            if (otherLanded && riderSpell) applySpell(f, other, riderSpell);
          }
        } else if (wantsChainFan(spell)) {
          // Multi-Shot: EffectChainTarget 3, SCHEME_CLOSEST_CHAIN.
          // Cite: chainFan.ts; Spell.cpp SCHEME_CLOSEST_CHAIN; raw chainTargets=3.
          let pool = isEnemySide(f.side) ? livingFriendlies() : livingEnemies();
          if (cfg.endless && !isEnemySide(f.side)
            && !(spell.radiusYd != null && spell.radiusYd > 0)) {
            pool = pool.filter((e) => {
              if (e === castTgt) return true;
              const tm = threatOf(e); return !!tm && !tm.isEmpty();
            });
          }
          const cap = aoeTotalTargetCap(spell) ?? 1;
          const chain = selectHostileChainTargets(
            castTgt, pool.filter((u) => !dead(u)), cap, distanceBetween,
            CHAIN_SPELL_JUMP_RADIUS_YD, undefined,
            // Cleave and Swipe jump from the CASTER, not from the first target. Cite: Spell.cpp:2179
            // PUSH_SELF_CENTER; 11 carriers, all Cleave/Swipe ranks.
            hasAttrEx2(spell, SPELL_ATTR_EX2.CHAIN_FROM_CASTER) ? f : undefined,
          );
          for (let i = 1; i < chain.length; i++) {
            const other = chain[i]!;
            const otherLanded = rangedStrike(f, other, spell);
            if (otherLanded && riderSpell) applySpell(f, other, riderSpell);
          }
        }
      } else if (isRanged && f.side === 'player') {
        // Player missing required ranged weapon — no MH fallback.
        return;
      } else {
        // AoE weapon strikes (Whirlwind): primary uses the same SpellRadius gate as
        // secondaries when radiusYd is set — mirrors castOnTargets (KI-650 sibling).
        const primaryInRadius = !spell.aoe || aoeUnitInRadius(f, castTgt, castTgt, spell);
        const landed = primaryInRadius ? weaponStrike(f, castTgt, spell) : false;
        // Riders applied after a landed strike: buff, dot, cc, root, knock_back. `rawEffects` is
        // cleared on the shell or applySpell rebuilds the full list and double-awards combo points.
        const riders = spell.effects.filter(
          (e) => e.kind === 'buff' || e.kind === 'dot' || e.kind === 'cc' || e.kind === 'root'
            || e.kind === 'knock_back' || e.kind === 'modify_threat_pct'
            // Target-borne periodic-trigger debuffs (Nefarian's class calls) fan with the AoE;
            // channel holders (targetA CASTER) carry no auraOnTarget and stay off the rider.
            || (e.kind === 'proc_trigger_spell' && e.auraOnTarget === true),
        );
        const riderSpell = riders.length
          ? { ...spell, effects: riders, rawEffects: undefined }
          : null;
        if (landed && riderSpell) applySpell(f, castTgt, riderSpell);
        if (spell.aoe) {
          // Whirlwind shape: one cost on cast, a weapon strike per target, each carrying `spell` so
          // no attacker rage is rewarded. On the endless floor, free-fire only — not every passive.
          let pool = isEnemySide(f.side) ? livingFriendlies() : livingEnemies();
          if (cfg.endless && !isEnemySide(f.side)
            && !(spell.radiusYd != null && spell.radiusYd > 0)) {
            pool = pool.filter((e) => {
              if (e === castTgt) return true;
              const tm = threatOf(e); return !!tm && !tm.isEmpty();
            });
          }
          const cap = aoeTotalTargetCap(spell);
          const others = selectAoeSecondaries(f, castTgt, spell, pool, cap);
          for (const other of others) {
            const otherLanded = weaponStrike(f, other, spell);
            if (otherLanded && riderSpell) applySpell(f, other, riderSpell);
          }
        } else if (wantsChainFan(spell)) {
          // Multi-Shot / non-aoe chain strikes: jump nearby hostiles (not aoe splash).
          // Cite: chainFan.ts; Spell.cpp SCHEME_CLOSEST_CHAIN; EffectChainTarget.
          let pool = isEnemySide(f.side) ? livingFriendlies() : livingEnemies();
          if (cfg.endless && !isEnemySide(f.side)
            && !(spell.radiusYd != null && spell.radiusYd > 0)) {
            pool = pool.filter((e) => {
              if (e === castTgt) return true;
              const tm = threatOf(e); return !!tm && !tm.isEmpty();
            });
          }
          const cap = aoeTotalTargetCap(spell) ?? 1;
          const chain = selectHostileChainTargets(
            castTgt, pool.filter((u) => !dead(u)), cap, distanceBetween,
            CHAIN_SPELL_JUMP_RADIUS_YD, undefined,
            // Cleave and Swipe jump from the CASTER, not from the first target. Cite: Spell.cpp:2179
            // PUSH_SELF_CENTER; 11 carriers, all Cleave/Swipe ranks.
            hasAttrEx2(spell, SPELL_ATTR_EX2.CHAIN_FROM_CASTER) ? f : undefined,
          );
          for (let i = 1; i < chain.length; i++) {
            const other = chain[i]!;
            const otherLanded = weaponStrike(f, other, spell);
            if (otherLanded && riderSpell) applySpell(f, other, riderSpell);
          }
        }
      }
    } else {
      castOnTargets(f, castTgt, spell);
    }
    // The pin exists for exactly one cast: its effects have now applied (or fizzled).
    if (f.friendlyPin) f.friendlyPin = null;
  };

  // Queue a missile flight when the spell has a speed and geometry is live, else impact now. Charge
  // travels as a body and is never queued. A session without geometry stays byte-identical.
  const deliverOrQueueMissile = (f: Fighter, castTgt: Fighter, spell: SpellDef): void => {
    // Local-combat backstop: an offensive spell with a MISSING baked rangeMax skips every range gate
    // and landed cross-map — Mortal Strike at 490 yd. Nothing offensive delivers past its cap.
    if (cfg.acquireRangeYd != null && ctx.unitPositionsMutable && !isChargeRole(spell)
      && !isSelfCenteredAoe(spell)) {
      const meleeShaped = !!spell.strikeBonus || !!spell.onNextSwing || roleOf(spell) === 'strike';
      if (meleeShaped || isHostileSpellDef(spell) || roleOf(spell) === 'shoot'
        || spellFoeDirectedOpaque(spell)) {
        const d = distanceBetween(f, castTgt);
        const cap = Math.max(
          meleeShaped && !((spell.rangeMax ?? 0) > 0) ? MIN_AGGRO_DISTANCE : cfg.acquireRangeYd,
          spell.rangeMax ?? 0,
        );
        if (d != null && d > cap) {
          f.castCritAdd = 0;
          f.castEffectPct = 0;
          return;
        }
      }
    }
    const critAdd = f.castCritAdd;
    const effectPct = f.castEffectPct;
    // Always clear fighter one-shots at "cast resolve" time; delayed rows hold a snapshot.
    f.castCritAdd = 0;
    f.castEffectPct = 0;
    // Pack wiped mid-cast: foeOf is self — fizzle single-target hostile (mana already spent).
    // Self-centered AoE still fans living hostiles around the caster (Frost Nova).
    if (isHostileSpellDef(spell) && (castTgt === f || dead(castTgt))
      && !isCasterOriginAoe(spell) && !f.castDest) return;

    if (isChargeRole(spell) || !ctx.unitPositionsMutable) {
      f.castCritAdd = critAdd;
      f.castEffectPct = effectPct;
      deliverSpellImpact(f, castTgt, spell);
      f.castCritAdd = 0;
      f.castEffectPct = 0;
      return;
    }
    const speed = spell.speed ?? 0;
    if (!(speed > 0)) {
      f.castCritAdd = critAdd;
      f.castEffectPct = effectPct;
      deliverSpellImpact(f, castTgt, spell);
      f.castCritAdd = 0;
      f.castEffectPct = 0;
      return;
    }
    const dist = distanceBetween(f, castTgt);
    const travelMs = dist != null ? missileTravelMs(dist, speed) : 0;
    if (!(travelMs > 0)) {
      f.castCritAdd = critAdd;
      f.castEffectPct = effectPct;
      deliverSpellImpact(f, castTgt, spell);
      f.castCritAdd = 0;
      f.castEffectPct = 0;
      return;
    }
    ctx.pendingMissiles.push({
      launchAt: ctx.t, landAt: ctx.t + travelMs,
      casterSide: f.side, targetSide: castTgt.side, spell,
      castCritAdd: critAdd, castEffectPct: effectPct,
    });
  };

  /** Land due missiles this tick (before motion so chill applies to the same gap-close step). */
  const landDueMissiles = (): void => {
    const list = ctx.pendingMissiles;
    if (!list.length) return;
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i]!;
      if (ctx.t < m.landAt) continue;
      list.splice(i, 1);
      let caster: Fighter | undefined;
      let tgt: Fighter | undefined;
      caster = bySide(m.casterSide as Side);
      tgt = bySide(m.targetSide as Side);
      if (!caster || !tgt) continue;
      if (dead(caster) || dead(tgt)) continue;
      if (m.whiteRanged) {
        rangedStrike(caster, tgt, null);
        continue;
      }
      caster.castCritAdd = m.castCritAdd;
      caster.castEffectPct = m.castEffectPct;
      deliverSpellImpact(caster, tgt, m.spell);
      caster.castCritAdd = 0;
      caster.castEffectPct = 0;
    }
  };

  /** Armed when the first enemy enters combat; fires once, like m_AlreadyCallAssistance. */
  let packAssistAt: number | null = null;
  /** The caller's victim, captured when the call goes out — the event carries it. */
  let packAssistOn: CombatantId | null = null;
  let packAssistCalled = false;
  // The pack joins when the mob you hit CALLS it, never at t=0. `packAssistForPull` already picked
  // who; before this, two helpers nobody had touched sprinted 27 yd with the opener still in the air.
  const packAssistPhase = (): void => {
    const delay = cfg.packAssistDelayMs;
    if (delay == null || packAssistCalled || cfg.endless) return;
    const threatEmpty = (ef: Fighter): boolean => {
      const tm = threatOf(ef);
      return !tm || tm.isEmpty();
    };
    if (packAssistAt == null) {
      let caller: Fighter | null = null;
      let idle = false;
      for (const ef of ctx.livingEnemies()) {
        if (threatEmpty(ef)) idle = true;
        else if (!caller) caller = ef;
      }
      if (!caller) return;                          // nobody in combat: no call went out
      if (!idle) { packAssistCalled = true; return; } // nothing left to call
      // The event carries the caller's victim and is queued NOW — killing the caller
      // inside the delay does not recall it (Creature.cpp:2163 AssistDelayEvent).
      const victim = hostileTargetOf(caller);
      packAssistOn = victim && victim !== caller ? victim.side : 'player';
      packAssistAt = ctx.t + delay;
      return;
    }
    if (ctx.t < packAssistAt) return;
    packAssistCalled = true;
    const on = packAssistOn ?? 'player';
    for (const ef of ctx.livingEnemies()) {
      if (!threatEmpty(ef)) continue;
      const tm = threatOf(ef);
      if (tm) {
        tm.addThreatDirectly(on, 1, false);
        wakeForDecision(ef);
      }
    }
  };

  const chosenPlayerSpell = (
    castSpellId: number | null | undefined,
    dest?: CombatPosYd,
  ): SpellDef | null => {
    if (castSpellId == null) return null;
    const s = spellFromKit(player.spec.spells, castSpellId);
    if (!s || onCooldown(player, s) || !canAfford(player, s)) return null;
    // Re-attached trigger and proc payloads resolve for the applySpell lookup but are never cast by
    // the player — their parents apply them. Cite: pickAction isTriggeredCompanion.
    if (isTriggeredCompanion(player, s)) return null;
    // Ruthlessness-style free talent CP grants — never player-cast (KI-691).
    if (isNonCastableTalentProc(s)) return null;
    if (schoolLocked(player, s)) return null;
    const offSide = ctx.rotationOffTarget?.get(player.side);
    const offAim = offSide ? bySide(offSide) : null;
    const focus = offAim && !dead(offAim) ? offAim : ensurePlayerFocus();
    const groundDest = isGroundTargetedMulti(s) && dest != null;
    // Endless floor stand-down: focus is the caster. Hostile casts need a live foe.
    // Cite: pickAction needsLiveHostile; Spell.cpp SPELL_FAILED_BAD_TARGETS.
    if (!groundDest && isHostileSpellDef(s) && !isSelfCenteredAoe(s) && (focus === player || (dead(focus) && !hasAttrEx2(s, SPELL_ATTR_EX2.ALLOW_DEAD_TARGET)))) {
      if (!invalidTargetReported.has(s.id)) {
        invalidTargetReported.add(s.id);
        if (!hasAttrEx2(s, SPELL_ATTR_EX2.DO_NOT_REPORT_SPELL_FAILURE)) {
          push({ t: ctx.t, kind: 'flavor', text: `${s.name}: No target.` });
        }
      }
      return null;
    }
    // CheckTargetCreatureType: refuse the cast up front, so no mana or GCD is wasted. One log line
    // per spell per fight, so a rotation retrying it does not spam.
    if (!groundDest && isHostileSpellDef(s) && !isSelfCenteredAoe(s) && !spellTargetTypeAllowed(s, focus.creatureType)) {
      if (!invalidTargetReported.has(s.id)) {
        invalidTargetReported.add(s.id);
        if (!hasAttrEx2(s, SPELL_ATTR_EX2.DO_NOT_REPORT_SPELL_FAILURE)) {
          push({ t: ctx.t, kind: 'flavor', text: `${s.name}: invalid target.` });
        }
      }
      return null;
    }
    // CheckCast SPELL_FAILED_IMMUNE: refuse before the cast, including weapon strikes that are not
    // hostile spell defs. A forced impact still reports immune in applySpell if one slips through.
    const nLive = (isSelfCenteredAoe(s) || groundDest) ? livingEnemies().length : 1;
    if (
      (!groundDest || nLive <= 1)
      && focusImmunityBlocksSpell(s, focus, nLive)
    ) {
      if (!invalidTargetReported.has(s.id)) {
        invalidTargetReported.add(s.id);
        if (!hasAttrEx2(s, SPELL_ATTR_EX2.DO_NOT_REPORT_SPELL_FAILURE)) {
          push({ t: ctx.t, kind: 'flavor', text: `${focus.spec.name} is immune to ${s.name}.` });
        }
      }
      return null;
    }
    // FS3: pet-only heals/buffs (Mend Pet, Bestial Wrath shape) — no living pet → bad target.
    if (requiresLivingPetTarget(s) && !livingPetOf(player)) {
      if (!invalidTargetReported.has(s.id)) {
        invalidTargetReported.add(s.id);
        if (!hasAttrEx2(s, SPELL_ATTR_EX2.DO_NOT_REPORT_SPELL_FAILURE)) {
          push({ t: ctx.t, kind: 'flavor', text: `${s.name}: invalid target.` });
        }
      }
      return null;
    }
    if (s.requiresComboPoints && comboOn(player, focus) <= 0) return null;
    if (isNextMeleeSwingSpell(s) && player.pendingSwing) return null; // only one on-next-swing armed at a time
    // Player EquippedItem full slot gate (same helper as abilities()).
    // Cite: Spell.cpp:6539–6543; equippedItemGate.ts.
    if (playerMissingRequiredEquippedItem(s, player.spec)) return null;
    // Spell.cpp CheckItems — refuse Shadowburn etc. with no Soul Shard (KI-804).
    if (!canPaySpellReagents(player, s)) return null;
    const gate = resolveFormCast(s, player.form);
    if (!gate.ok) return null;
    if (!groundDest && stealthPosError(player, focus, s)) return null;
    // DG: player spell picker respects SpellRange when yards are seeded.
    // Dest-bearing ground rain measures caster → dest, not caster → focus.
    if (isChargeRole(s)
      ? !chargeCastOk(player, focus, s)
      : (spellNeedsRangeGate(s) || spellFoeDirectedGeometry(s))
        && !isInSpellRange(
          groundDest ? combatDistanceYd(ctx.posOf(player.side), dest) : distanceBetween(player, focus),
          spellGateRangeMaxYd(s),
          spellGateRangeMinYd(s),
          !groundDest && ctx.isMoving(player.side) && ctx.isMoving(focus.side),
          player.spec.combatReachYd, focus.spec.combatReachYd,
        )) {
      return null;
    }
    // Refuse a cast through a wall when navLos is on. Off-mask ends fail open inside
    // navSightClear — a mob half a yard into a wall column must stay killable.
    if (cfg.navLos && spellNeedsLosGate(s)) {
      const destSight = groundDest ? dest : posOf(focus.side);
      if (!navSightClear(cfg, posOf(player.side), destSight)) return null;
    }
    if (s.condition || (s.conditionId != null && s.conditionId !== 0)) {
      if (!passesConditionGate(s, conditionSnapshotFor(player), cfg.conditionTable).ok) return null;
    }
    // Mongoose Bite / Overpower / Revenge — CasterAuraState / reactive windows.
    // Cite: Player.cpp IsSpellReady; UnitAuraProcHandler ProcSkillsAndReactives.
    if (reactiveCastGate(player, focus, s, ctx.t) != null) return null;
    if (targetCastGate(player, focus, s, ctx.t) != null) return null;
    // Classic pure-DISPEL CheckCast: NOTHING_TO_DISPEL (Purge / Remove Curse / Cure*).
    // Cite: Spell.cpp:4890–4919; KI-610.
    if (isPureDispelSpell(s)) {
      const de = firstDispelEffect(s);
      if (de && resolveDispelTarget(player, focus, de.dispelType) == null) return null;
    }
    // leaveForm applied at startOrCast time so cost checks use pre-leave mana correctly
    return s;
  };

  // Decision gating: skip pickAction when the unit is not dirty and its wake time has not come. An
  // off-GCD next-swing still arms on the skip path, and item rules wake on HP or aura dirty.
  const KIT_NONE: SpellDef[] = [];
  const kitOffGcdCache = new WeakMap<SpellDef[], { len: number; list: SpellDef[] }>();
  /** Bake-constant: kit has an on-next-swing arm (HS / Cleave / Maul / …). */
  const kitHasNextSwing = (f: Fighter): boolean => {
    const spells = f.spec.spells ?? KIT_NONE;
    const hit = kitOffGcdCache.get(spells);
    if (hit !== undefined && hit.len === spells.length) return hit.list.length > 0;
    const list = spells.filter((s) => isNextMeleeSwingSpell(s));
    kitOffGcdCache.set(spells, { len: spells.length, list });
    return list.length > 0;
  };
  // Sides carrying at least one item, refreshed once per tick. Rescue-item CC break still needs this; item
  // *rotation* rules no longer force a think.
  let bagScanTick = -1;
  const itemSides = new Set<Side>();
  const sidesWithItems = (): Set<Side> => {
    if (bagScanTick === ctx.t) return itemSides;
    itemSides.clear();
    if (ctx.playerItems.length > 0) itemSides.add(player.side);
    for (const [side, bag] of ctx.unitItems) if (bag.length > 0) itemSides.add(side);
    bagScanTick = ctx.t;
    return itemSides;
  };
  // These four were WeakMaps keyed on the Fighter, whose lifetime is the Fighter's — a field written
  // the long way round, at four map lookups per unit per tick.
  const belowHealByFac = new Map<string, Set<string>>();
  const inCombatByFac = new Map<string, Set<string>>();
  // The spare half of each pair: a rebuild fills the spare, compares, then swaps the references, so
  // an unchanged answer costs no allocation. Both are per FACTION and two samples can share one.
  const belowHealSpare = new Map<string, Set<string>>();
  const inCombatSpare = new Map<string, Set<string>>();
  const samples: Fighter[] = [];
  /** Cheap O(N) once per tick — not a livingHostilesFor fingerprint. */
  const refreshCheapDirty = (): void => {
    for (const f of fightersOrder()) {
      if (dead(f)) continue;
      if (f.seenDecideHp !== f.hp) {
        const dropped = f.hp < f.seenDecideHp;
        f.seenDecideHp = f.hp;
        // OOC regen toward full is not a decision input; damage and in-combat changes are. A unit
        // under ALLY_HEAL_THRESHOLD keeps waking: its OOC self-heal may have been refused on mana.
        const hurt = f.hp / Math.max(1, f.spec.maxHealth) < ALLY_HEAL_THRESHOLD;
        if (dropped || hurt || fighterIsInCombat(f, ctx.t)) f.decideDirty = true;
      }
      if (f.seenDodgedAt !== f.lastDodgedAt) {
        f.decideDirty = true;
        f.seenDodgedAt = f.lastDodgedAt;
      }
      if (f.seenDefenseReactAt !== f.lastDefenseReactAt) {
        f.decideDirty = true;
        f.seenDefenseReactAt = f.lastDefenseReactAt;
      }
      if (f.seenHunterParryAt !== f.lastHunterParryAt) {
        f.decideDirty = true;
        f.seenHunterParryAt = f.lastHunterParryAt;
      }
    }
    samples.length = 0;
    samples.push(player);
    // The block's first seat, not `ctx.enemy`: that field is captured once at construction
    // (createSession.ts:148) and a recycled seat 0 leaves it pointing at the corpse. E1.1.
    const firstFoe = ctx.enemyBlock()[0];
    if (firstFoe) samples.push(firstFoe);
    // One pool pass answers both questions. They were two loops over the same pool, so a 40-man
    // walked 40 allies four times a tick. Interleaving is exact: both bodies read, both only mark.
    for (const sample of samples) {
      const pool = ctx.friendlyPoolOf(sample);
      const fac = ctx.factionOf(sample.side);
      const prevBelow = belowHealByFac.get(fac);
      const prevFighting = inCombatByFac.get(fac);
      let below = belowHealSpare.get(fac);
      if (!below) { below = new Set<string>(); belowHealSpare.set(fac, below); }
      let fighting = inCombatSpare.get(fac);
      if (!fighting) { fighting = new Set<string>(); inCombatSpare.set(fac, fighting); }
      below.clear();
      fighting.clear();
      for (const u of pool) {
        if (isTotemSide(u.side)) continue;
        if (u.hp / Math.max(1, u.spec.maxHealth) < ALLY_HEAL_THRESHOLD) below.add(u.side);
        if (fighterIsInCombat(u, ctx.t)) fighting.add(u.side);
      }
      belowHealByFac.set(fac, below);
      belowHealSpare.set(fac, prevBelow ?? new Set<string>());
      inCombatByFac.set(fac, fighting);
      inCombatSpare.set(fac, prevFighting ?? new Set<string>());
      if (prevBelow) {
        let crossed = prevBelow.size !== below.size;
        if (!crossed) {
          for (const s of below) if (!prevBelow.has(s)) { crossed = true; break; }
        }
        if (crossed) {
          for (const u of pool) {
            if (u.spec.groupRole === 'healer') u.decideDirty = true;
          }
        }
      }
      // Combat enter listed as an S2 dirty, but touchCombatFlag only marks THAT body.
      // A full-HP mage with nextWakeAt=Inf never joins the pull until they take a hit.
      if (prevFighting) {
        let entered = false;
        for (const s of fighting) if (!prevFighting.has(s)) { entered = true; break; }
        if (entered) for (const u of pool) wakeForDecision(u);
      }
    }
  };
  /** Cached per tick: an enemy is holding an interruptible bar. */
  let interruptibleCastTick = -1;
  let interruptibleCastLive = false;
  const anyInterruptibleHostileCast = (): boolean => {
    if (interruptibleCastTick === ctx.t) return interruptibleCastLive;
    interruptibleCastTick = ctx.t;
    interruptibleCastLive = false;
    for (const ef of ctx.livingEnemies()) {
      if (ef.castingSpell && isCastInterruptible(ef.castingSpell, true)) {
        interruptibleCastLive = true;
        break;
      }
      if (
        ef.channeling
        && ctx.t < ef.channeling.endsAt
        && isCastInterruptible(ef.channeling.spell, true)
      ) {
        interruptibleCastLive = true;
        break;
      }
    }
    return interruptibleCastLive;
  };
  // Off-GCD kicker with a ready instant interrupt while a hostile bar is up, cached per kit array:
  // both filter halves are SpellDef fields, and the walk ran per friendly per tick of every boss bar.
  const kitInterruptCache = new WeakMap<SpellDef[], { len: number; list: SpellDef[] }>();
  const kitInstantInterrupts = (f: Fighter): SpellDef[] => {
    const spells = f.spec.spells ?? KIT_NONE;
    const hit = kitInterruptCache.get(spells);
    if (hit !== undefined && hit.len === spells.length) return hit.list;
    const list = spells.filter((s) => spellHasInterruptCast(s) && (s.castTimeMs ?? 0) <= 0);
    kitInterruptCache.set(spells, { len: spells.length, list });
    return list;
  };
  const friendlyCanAttemptInterrupt = (f: Fighter): boolean => {
    if (isEnemySide(f.side)) return false;
    if (ctx.t < f.gcdUntil) return false;
    const kit = kitInstantInterrupts(f);
    // Ahead of the hostile-bar query on purpose: a unit with no kicker never needs the answer, and
    // that query walks every living enemy the first time it is asked in a tick.
    if (kit.length === 0) return false;
    if (!anyInterruptibleHostileCast()) return false;
    for (const s of kit) {
      if (onCooldown(f, s) || !canAfford(f, s)) continue;
      return true;
    }
    return false;
  };
  const mustDecide = (f: Fighter, action?: CombatAction): boolean => {
    if (f.pendingCharge) return false;
    const midCast = f.castingSpell != null
      || (f.channeling != null && ctx.t < f.channeling.endsAt);
    // Enemies may pick CAST_INTERRUPT_PREVIOUS. Cite: UnitAI.h CAST_INTERRUPT_PREVIOUS.
    if (midCast && isEnemySide(f.side)) return true;
    if (isControlledHard(f)) {
      return hardCcMustDecide(
        f,
        !!(cfg.autoRescueItems && sidesWithItems().has(f.side)),
        isBreaker,
        onCooldown,
        canAfford,
      );
    }
    // A bar press arrives as `action` from nextCast. Always-thinking the manual player
    // defeated SlowUpdate (profiler.md Maraudon: combat.sim leftover 26.6%, pickAction every tick).
    if (action != null && f === player) return true;
    // Ready kicker: think now even if SlowUpdate parked us, and even mid-cast so we can clip.
    if (friendlyCanAttemptInterrupt(f)) return true;
    // Queued Kick/CS must wake mid-cast or the clip never runs (kickClipKeepsCast).
    if ((allCastOrders()?.get(f.side)?.length ?? 0) > 0) return true;
    // Arena rotation-driven friendlies still think mid-cast so a higher instant can replace the bar.
    // Cite: Unit.cpp:4203-4212 SetCurrentCastedSpell. Raids keep sleeping the bar (SlowUpdate).
    if (midCast) {
      if (
        cfg.enemiesAreATeam === true
        && !isEnemySide(f.side)
        && ((f === player && ctx.aiPlayer) || ctx.unitActionProvider.get(f.side))
      ) {
        return true;
      }
      return false;
    }
    if (f.stealthed) return true;
    if (f.decideDirty === true) return true;
    if (ctx.t < (f.nextWakeAt ?? 0)) return false;
    return true;
  };
  const skipsDecision = (f: Fighter, action?: CombatAction): boolean => !mustDecide(f, action);

  const step = (action?: CombatAction): CombatEvent[] => {
    if (ctx.ended) return [];
    const startLen = events.length;
    if (events.length === 0) {
      // The start event stays primary-enemy shaped for the UI; pack size is flavour above one. A
      // floor session has no primary: the event still fires for its playerHp seed and drops the name.
      push({
        t: 0,
        kind: 'start',
        playerName: player.spec.name,
        playerHp: player.hp,
        ...(enemy ? { enemyName: enemy.spec.name, enemyHp: enemy.hp } : {}),
      });
      // Off the store, which is the only roster there is now. E1.1.
      const foes = ctx.enemyBlock();
      if (foes.length > 1) {
        push({
          t: 0,
          kind: 'flavor',
          text: `${foes.length} foes engage (${foes.map((e) => e.spec.name).join(', ')}).`,
        });
      }
      const mates = ctx.allyBlock();
      if (mates.length > 0) {
        push({
          t: 0,
          kind: 'flavor',
          text: `${mates.map((a) => a.spec.name).join(', ')} fight${mates.length === 1 ? 's' : ''} alongside ${player.spec.name}.`,
        });
      }
    }

    // S3: skip totem / pool / effects sweeps until the next due instant.
    // Cite: EventProcessor.cpp:39; SpellAuras.cpp:396–406 Aura::Update.
    if (ctx.t >= ctx.nextPeriodicDue) {
    combatPerfEnter('sim.periodic');
    // Totem duration expiry (CMaNGOS Totem::Update m_duration).
    for (const [side, tot] of [...totems.entries()]) {
      if (tot && tot.totemExpiresAt != null && ctx.t >= tot.totemExpiresAt) unsummonTotem(side, 'expire');
    }

    // DynamicObject::Update — visit/apply/refresh auras, pulse, expire.
    // Cite: DynamicObject.cpp:122 VisitAllObjects; groundPoolTick.ts.
    tickGroundPools(ctx, dead);

    // SpellAuraHolder::Update — a negative aura with HEARTBEAT_RESIST rolls to break early on its own
    // interval. No armed holder means no draw, so goldens do not move. Cite: SpellAuras.cpp:5713.
    ctx.tickHeartbeatResists?.();

    // COOLDOWN_ON_EVENT: start the real cooldown once the aura is gone. A poll, not a hook — this
    // engine has many removal paths and `buffActive` is the one flag every one of them maintains.
    const startFadedCooldowns = (f: Fighter): void => {
      const pending = f.deferredCooldowns;
      if (!pending || pending.size === 0) return;
      for (const [spellId, ms] of pending) {
        const stillUp = f.buffActive.has(spellId)
          || ctx.effectsOn(f.side).some((e) => e.spellId === spellId && !e.broken
            && e.expiresAt > ctx.t);
        if (stillUp) continue;
        f.cooldowns.set(spellId, ctx.t + ms);
        pending.delete(spellId);
        const cat = f.deferredCategoryCooldowns?.get(spellId);
        if (cat) {
          f.categoryCooldowns.set(cat.category, ctx.t + cat.ms);
          f.deferredCategoryCooldowns!.delete(spellId);
        }
      }
    };
    // Every unit, not player + enemies + allies + pet: that list left TOTEMS out, so a totem
    // holding a deferred COOLDOWN_ON_EVENT entry never started it. No-op for a unit with none.
    for (const f of fightersOrder()) startFadedCooldowns(f);

    // Aura-removal bodies fire AFTER the sweep: their payloads push and splice `effects`, which this
    // reverse walk cannot survive mid-pass. Cite: dispelReflect fireAuraRemoveBodies.
    const removalBodies: Array<[ActiveEffect, 'expire' | 'death']> = [];
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i];
      // removeAurasDueToSpell mid-pass can shrink the array while i walks downward.
      if (!e) continue;
      // Holder died while the aura still had time on it (Anub'Rekhan's Aura → Corpse Scarabs).
      // Cite: SpellAuras.cpp:1425-1430 AURA_REMOVE_BY_DEATH.
      const eHolder = bySide(e.target);
      const isDeathPersistent = hasAttrEx3(ctx.spellOf?.(e.spellId), SPELL_ATTR_EX3.ALLOW_AURA_WHILE_DEAD);
      if (e.onRemove && ctx.t < e.expiresAt && dead(eHolder) && !isDeathPersistent) {
        removalBodies.push([e, 'death']);
        effects.splice(i, 1);
        continue;
      }
      if (
        e.kind === 'dot'
        && e.nextTickAt !== undefined
        // > 0, not !== undefined: `nextTickAt += 0` never advances and this while never exits.
        && e.tickMs !== undefined && e.tickMs > 0
        && e.fromDynamicObject == null
      ) {
        while (e.nextTickAt <= ctx.t && e.nextTickAt < e.expiresAt + 1) {
          const tgt = bySide(e.target);
          const src = bySide(e.source);
          // SPELL_AURA_PERIODIC_HEALTH_FUNNEL (62): victim = caster, beneficiary = aura target.
          // Cite: SpellAuras.cpp PeriodicTick :4606–4612, :4661–4683.
          if (e.healthFunnel) {
            if (src && !dead(src)) {
              const amount = dealDamage(
                src,
                rollBetween(e.min ?? 0, e.max ?? 0, rng.next()),
                e.school ?? 'physical',
                src.spec.level,
                { binary: e.binary ?? true, damageType: 'dot', attacker: src },
              );
              push({
                t: ctx.t, kind: 'dot_tick', actor: e.source, target: src.side, spellId: e.spellId,
                name: e.name, amount, school: e.school ?? 'physical',
              });
              const mult = e.leechMultiple != null && e.leechMultiple > 0 ? e.leechMultiple : 1;
              if (amount > 0 && tgt && !dead(tgt)) {
                const heal = Math.trunc(amount * mult);
                if (heal > 0) {
                  const hpBefore = tgt.hp;
                  tgt.hp = Math.min(tgt.spec.maxHealth, Math.round(tgt.hp + heal));
                  const effective = tgt.hp - hpBefore;
                  const overheal = Math.max(0, heal - effective);
                  push({
                    t: ctx.t, kind: 'heal', actor: tgt.side, amount: effective,
                    name: e.name, spellId: e.spellId, periodic: true,
                    ...(e.source !== tgt.side ? { source: e.source } : {}),
                    ...(overheal > 0 ? { overheal } : {}),
                  });
                }
              }
            }
          } else {
            // Pass spell id + family flags so Dimension-C procs (Pyroclasm) see Hellfire/RoF ticks.
            // Cite: UnitAuraProcHandler.cpp:1355–1362; ActiveEffect.spellFamilyFlags.
            const dotSpellStub = {
              id: e.spellId,
              name: e.name,
              school: e.school ?? 'physical',
              spellFamilyFlags: e.spellFamilyFlags,
            } as SpellDef;
            let tickAmt = rollBetween(e.min ?? 0, e.max ?? 0, rng.next());
            if (isCurseOfAgonySpellId(e.spellId)) {
              e.auraTicks = (e.auraTicks ?? 0) + 1;
              tickAmt = curseOfAgonyTickAmount(tickAmt, e.auraTicks);
            }
            const amount = dealDamage(
              tgt,
              tickAmt,
              e.school ?? 'physical',
              src.spec.level,
              { binary: e.binary ?? true, damageType: 'dot', attacker: src, spell: dotSpellStub },
            );
            // DoT ticks still cause threat via dealDamage (Unit.cpp HandleDamageDealt; damagetype DOT).
            push({ t: ctx.t, kind: 'dot_tick', actor: e.source, target: tgt.side, spellId: e.spellId, name: e.name, amount, school: e.school ?? 'physical' });
            // PERIODIC_LEECH: heal the caster for the damage dealt times the effect multiplier. The
            // victim is the aura target and the beneficiary the caster; that heal carries no threat.
            if (
              e.leechMultiple != null
              && e.leechMultiple > 0
              && amount > 0
              && src
              && !dead(src)
            ) {
              const heal = Math.trunc(amount * e.leechMultiple);
              if (heal > 0) {
                const hpBefore = src.hp;
                src.hp = Math.min(src.spec.maxHealth, Math.round(src.hp + heal));
                const effective = src.hp - hpBefore;
                const overheal = Math.max(0, heal - effective);
                push({
                  t: ctx.t, kind: 'heal', actor: src.side, amount: effective,
                  name: e.name, spellId: e.spellId, periodic: true,
                  ...(overheal > 0 ? { overheal } : {}),
                });
              }
            }
          }
          e.nextTickAt += e.tickMs;
        }
      }
      // Healing Stream / Mana Spring periodic ticks, hostile mana-leech (Viper Sting), and
      // OBS_MOD_HEALTH/MANA percent-of-max regen (Demonic Sacrifice Voidwalker/Felhunter).
      if ((e.kind === 'restore_health' || e.kind === 'restore_power') && e.nextTickAt !== undefined && e.tickMs !== undefined && e.tickMs > 0) {
        while (e.nextTickAt <= ctx.t && e.nextTickAt < e.expiresAt + 1) {
          const tgt = bySide(e.target);
          // Frenzied Regeneration: rage→health per tick (not flat max HoT).
          // Cite: SpellAuras.cpp:1104–1115; warrior-druid-kit frenziedRegenTick.
          if (
            e.kind === 'restore_health'
            && FRENZIED_REGEN_SPELL_IDS.has(e.spellId | 0)
            && tgt.spec.powerType === 'rage'
            && !dead(tgt)
          ) {
            const lifePerRage = frenziedRegenLifePerRage(e.amountPerTick ?? 0);
            const { heal, displayRageSpent } = frenziedRegenTick(lifePerRage, tgt.power);
            if (displayRageSpent > 0) {
              const before = tgt.power;
              tgt.power = Math.max(0, tgt.power - displayRageSpent);
              if (tgt.power !== before) {
                push({
                  t: ctx.t, kind: 'resource', actor: tgt.side, power: tgt.spec.powerType,
                  value: Math.round(tgt.power), delta: tgt.power - before,
                });
              }
            }
            if (heal > 0) {
              const hpBefore = tgt.hp;
              tgt.hp = Math.min(tgt.spec.maxHealth, Math.round(tgt.hp + heal));
              const effective = tgt.hp - hpBefore;
              const overheal = Math.max(0, heal - effective);
              push({
                t: ctx.t, kind: 'heal', actor: tgt.side, amount: effective,
                name: e.name, spellId: e.spellId, periodic: true,
                ...(overheal > 0 ? { overheal } : {}),
              });
            }
            e.nextTickAt += e.tickMs;
            continue;
          }
          // Nitrous Boost 27746: under 10 mana the aura is removed outright, which strips the speed
          // aura and the maintain drain together. Cite: SpellAuras.cpp:1031-1042.
          if (
            e.kind === 'restore_power'
            && (e.spellId | 0) === NITROUS_BOOST_SPELL_ID
            && !dead(tgt)
            && powerOfType(tgt, POWER_MANA) < NITROUS_MANA_COST_PER_TICK
          ) {
            ctx.removeAurasDueToSpell?.(tgt, NITROUS_BOOST_SPELL_ID);
            // Holder gone (speed + drain). Skip remaining tick body and outer checks on e.
            i = -1; // end reverse for — array indices shifted by multi-row splice
            break;
          }
          // pctOfMax: floor(max × pct / 100); else flat amountPerTick.
          // Cite: SpellAuras.cpp PeriodicTick OBS_MOD_HEALTH / OBS_MOD_MANA.
          // The pool a restore_power row names, never the bearer's primary bar: Mana Spring on a
          // warrior fills nothing, and on a bear druid it fills the parallel mana. A row with no
          // powerType is an older bake and reads as mana. Cite: SpellAuras.cpp:4833-4844.
          const pwr = e.kind === 'restore_power' ? (e.powerType ?? POWER_MANA) | 0 : POWER_MANA;
          const maxPwr = e.kind === 'restore_power' ? maxPowerOfType(tgt, pwr) : 0;
          const raw = e.pctOfMax != null && e.pctOfMax > 0
            ? resolvePeriodicPctOfMax({
              maxResource: e.kind === 'restore_health' ? tgt.spec.maxHealth : maxPwr,
              pctOfMax: e.pctOfMax,
            })
            : Math.round(e.amountPerTick ?? 0);
          if (e.kind === 'restore_health') {
            // Skip corpse ticks — a 0 HP unit must stay dead until checkDeaths ends the fight.
            // Flat HoTs keep min-1; pure %-of-max may legitimately compute 0 (no heal event).
            const amt = e.pctOfMax != null && e.pctOfMax > 0 ? raw : Math.max(1, raw);
            if (!dead(tgt) && Number.isFinite(amt) && amt > 0) {
              const hpBefore = tgt.hp;
              const intended = Math.round(amt);
              tgt.hp = Math.min(tgt.spec.maxHealth, Math.round(tgt.hp + amt));
              const effective = tgt.hp - hpBefore;
              const overheal = Math.max(0, intended - effective);
              push({
                t: ctx.t, kind: 'heal', actor: tgt.side, amount: effective,
                name: e.name, spellId: e.spellId, periodic: true,
                ...(e.source !== tgt.side ? { source: e.source } : {}),
                ...(overheal > 0 ? { overheal } : {}),
              });
            }
          } else if (!dead(tgt) && maxPwr > 0) {
            // Signed: positive restore (Mana Spring); negative = PERIODIC_MANA_LEECH drain.
            const before = powerOfType(tgt, pwr);
            if (raw < 0) {
              const drain = Math.min(before, Math.abs(raw));
              setPowerOfType(tgt, pwr, before - drain);
              // Drain Mana: transfer drained × leechMultiple to caster. Viper Sting has no mult.
              // Cite: SpellAuras.cpp:4747–4806; schema restore_power.leechMultiple; KI-702.
              if (
                drain > 0
                && e.source !== e.target
                && e.leechMultiple != null
                && e.leechMultiple > 0
              ) {
                const srcF = bySide(e.source);
                // The gain lands in the SAME pool the drain came out of, and only when the caster has
                // one. Cite: SpellAuras.cpp:4789 `pCaster->GetMaxPower(power) > 0`; :4803 ModifyPower.
                const srcMax = srcF ? maxPowerOfType(srcF, pwr) : 0;
                if (srcF && !dead(srcF) && srcMax > 0) {
                  const gain = Math.trunc(drain * e.leechMultiple);
                  if (gain > 0) {
                    const srcBefore = powerOfType(srcF, pwr);
                    setPowerOfType(srcF, pwr, Math.min(srcMax, srcBefore + gain));
                    const srcAfter = powerOfType(srcF, pwr);
                    if (srcAfter !== srcBefore) {
                      push({
                        t: ctx.t, kind: 'resource', actor: srcF.side,
                        power: powerTypeName(pwr) ?? 'mana',
                        value: Math.round(srcAfter), delta: srcAfter - srcBefore,
                      });
                    }
                  }
                }
              }
            } else {
              const amt = e.pctOfMax != null && e.pctOfMax > 0 ? raw : Math.max(1, raw);
              if (amt > 0) {
                setPowerOfType(tgt, pwr, Math.min(maxPwr, before + amt));
              }
            }
            const after = powerOfType(tgt, pwr);
            if (after !== before) {
              // spellId: Enrage 5229 / Bloodrage 29131 vs white-hit rage (KI-703).
              push({
                t: ctx.t, kind: 'resource', actor: tgt.side,
                power: powerTypeName(pwr) ?? tgt.spec.powerType,
                value: Math.round(after), delta: after - before,
                spellId: e.spellId,
              });
            }
          }
          e.nextTickAt += e.tickMs;
        }
      }
      // PERIODIC_TRIGGER_SPELL: fire the trigger spell every amplitude while the channel lives, as
      // Arcane Missiles 5143 fires 7268. Cite: SpellAuras PERIODIC_TRIGGER_SPELL; EffectTriggerSpell.
      if (
        e.kind === 'proc_trigger_spell'
        && e.tickMs !== undefined && e.tickMs > 0
        && e.nextTickAt !== undefined
        && e.triggerSpellId
      ) {
        while (e.nextTickAt <= ctx.t && e.nextTickAt < e.expiresAt + 1) {
          const src = bySide(e.source);
          // Scripted per-tick roll (Brood Affliction: Bronze 10%). Drawn only when the field is
          // set, so every fight without one stays byte-identical. Cite: SpellAuras.cpp:975–981.
          if (e.tickChance != null && !rng.chance(e.tickChance)) {
            e.nextTickAt += e.tickMs;
            continue;
          }
          if (!dead(src)) {
            if (e.triggerSpellId === CURSE_OF_IDIOCY_SPELL_ID) {
              // Cite: SpellAuras.cpp HandlePeriodicTriggerSpell case 1010
              // skip if casterGUID == triggerTarget (prevent self-triggered recast)
              // sum SPELL_AURA_MOD_STAT amounts on the target for spell id 1010
              // if (intelectLoss <= -90 && spiritLoss <= -90) return;
              if (src.side === e.target || !curseOfIdiocyMayRetriggerFromBuffs(ctx.effectsOn(e.target), e.target)) {
                e.nextTickAt += e.tickMs;
                continue;
              }
            }
            // A totem's payload lives on `totemTriggerSpells`, off `spec.spells` so TotemAI never
            // casts it directly. The global store is the last resort: a payload in no kit is real.
            let trig = spellFromKit(src.spec.spells, e.triggerSpellId)
              ?? src.totemTriggerSpells?.find((s) => s.id === e.triggerSpellId)
              ?? ctx.spellOf?.(e.triggerSpellId);
            // The inline damage loop below never reaches applySpell, so nothing else scales the
            // payload to the caster. Hellfire Effect paid its rank-1 base at 60. Cite: applySpell.ts:496.
            if (trig) trig = payloadAtCasterLevel(trig, src.spec.level, isPlayerCharacterSide(src.side));
            if (trig && e.spellId === 16191 && e.amount != null) {
              trig = { ...trig, effects: trig.effects.map((te, i) => i === 0 && 'min' in te ? { ...te, min: e.amount as number, max: e.amount as number } : te) };
            }
            if (trig) {
              // Friendly payloads reach the totem's party. Hostile Magma and Fire Nova are PBAoE
              // around the SOURCE, not whatever `foeOf` is across the map. Cite: AREA_PARTY_SRC 22.
              if (src.totemSlot) ctx.firePartyTotemPulse?.(src, trig);
              const hostileFx = trig.effects.filter((te) => te.kind === 'direct_damage');
              // An AoE payload need not pay in direct_damage: Locust Swarm 28786 is a radius-30 dot
              // and silence, and the holder-cast below put all of it on the boss itself.
              const fanAoe = trig.aoe === true && trig.radiusYd != null && trig.radiusYd > 0;
              if (!hostileFx.length && !fanAoe && !src.totemSlot) {
                // Non-damage payload. Reading only direct_damage dropped 190 periodic payloads that
                // could never fire — stun, polymorph, heal, root, knock_back. Totems keep the pulse.
                const holder = bySide(e.target);
                const targetA = trig.rawEffects?.[0]?.targetA ?? 0;
                const dest = targetA === 6 || targetA === 25 ? foeOf(holder) ?? holder : holder;
                if (holder && !dead(holder) && dest && !dead(dest)) applySpell(holder, dest, trig);
              } else if (hostileFx.length || (fanAoe && !src.totemSlot)) {
                // Stand-down / OOC: no free-fire focus and not an AoE pulse → skip.
                const focus = foeOf(src);
                const origin = posOf?.(src.side);
                const radius = trig.radiusYd != null && trig.radiusYd > 0 ? trig.radiusYd : null;
                const rangeMax = trig.rangeMax != null && trig.rangeMax > 0 ? trig.rangeMax : null;
                let targets: Fighter[] = [];
                // A friendly payload pulses the CASTER'S OWN side: an enemy Healing Ward heals
                // its pack, it does not heal the raid. Cite: friendlyFan.ts isFriendlyFannedEffect.
                const ownSidePulse = !hostileFx.length && trig.effects.length > 0
                  && trig.effects.every(isFriendlyFannedEffect);
                const atEnemySide = isEnemySide(src.side) === ownSidePulse;
                if (trig.aoe && radius != null) {
                  // Magma / Fire Nova: every living hostile in SpellRadius of the totem.
                  // Geometry missing → only the current focus (never the whole stream).
                  const pool = atEnemySide ? livingEnemies() : livingFriendlies();
                  // A payload whose aoeShape is `cone` is an ARC, not a disc: the radius alone gave
                  // Lava Breath 19272 every raider inside 35 yd. Facing is the caster's own victim.
                  const arc = trig.aoeShape === 'cone' ? coneArcOf(trig.coneDeg) : null;
                  const facingAt = arc && focus && focus !== src ? posOf?.(focus.side) : undefined;
                  if (origin) {
                    for (const u of pool) {
                      if (dead(u) || u === src) continue;
                      if (!isWithinRadiusYd(origin, posOf?.(u.side), radius)) continue;
                      if (arc && facingAt && !isWithinConeYd(
                        origin, facingAt, posOf?.(u.side), arc.halfAngleRad, arc.rear,
                      )) continue;
                      if (cfg.navLos && !navSightClear(cfg, origin, posOf?.(u.side))) continue;
                      targets.push(u);
                    }
                  } else if (!ownSidePulse && focus && focus !== src && !dead(focus)) {
                    targets = [focus];
                  }
                } else if (focus && focus !== src && !dead(focus)) {
                  // Single-target pulse (Arcane Missiles etc.): range gate when known.
                  const d = distanceBetween(src, focus);
                  if (d == null || rangeMax == null || d <= rangeMax) targets = [focus];
                }
                // A payload with a speed is a real missile, and the inline delivery applied damage at
                // the caster, so the channel drew no orb at all. Same launcher every cast uses.
                if ((trig.speed ?? 0) > 0 && targets.length === 1 && ctx.unitPositionsMutable) {
                  deliverOrQueueMissile(src, targets[0]!, trig);
                  e.nextTickAt += e.tickMs;
                  continue;
                }
                if (!hostileFx.length) {
                  // Nothing for the inline direct-damage loop to pay, so the payload rides the ordinary
                  // cast path once per fanned target. Cite: SpellAuras.cpp:1218-1222 CastTriggeredSpell.
                  for (const tgt of targets) applySpell(src, tgt, trig);
                  e.nextTickAt += e.tickMs;
                  continue;
                }
                const bin = resolveSpellBinary(trig);
                for (const tgt of targets) {
                  for (const te of hostileFx) {
                    if (te.kind !== 'direct_damage') continue;
                    let r = rollBetween(te.min, te.max, rng.next());
                    r = applySpellDamageBonusIfPresent(r, trig, te.effectSlot ?? 0, {
                      spellPower: src.spec.spellPower,
                      spellDamageBySchool: src.spec.spellDamageBySchool,
                      school: te.school,
                      attackPower: src.attackPower,
                      damagePct: src.damagePctBySchool[te.school],
                    });
                    const critHere = rng.chance(
                      spellCritChance(fighterSpellCrit(src), src.spec.level, tgt.spec.level, trig.dmgClass),
                    );
                    if (critHere) r *= critMultiplierWithVersus(TUNING.spellCritMult, src.critDamageVersusPct, tgt.creatureType);
                    const amount = dealDamage(tgt, r, te.school, src.spec.level, {
                      binary: bin, damageType: 'spell', attacker: src,
                    });
                    if (amount > 0) {
                      push({ t: ctx.t, kind: 'spell_hit', actor: src.side, target: tgt.side, spellId: trig.id, name: trig.name,
                        result: critHere ? 'crit' : 'hit', amount, school: te.school,
                      });
                      applyDamageThreat(src, tgt, amount, false, undefined);
                    }
                  }
                }
              }
            }
          }
          e.nextTickAt += e.tickMs;
        }
      }
      // No periodic self-break: a fear runs its full duration unless damage rolls it off or it is
      // dispelled. The 6%-per-second pulse that sat here ended ~39% of 8 s fears for free.
      if (ctx.t >= e.expiresAt) {
        if (e.kind === 'buff') {
          const owner = bySide(e.target);
          if (e.spellId) {
            stripOwnedSpellMods(owner, e.spellId);
            if (owner.radiusSpellMods?.length) {
              owner.radiusSpellMods = owner.radiusSpellMods.filter((m) => m.id !== `owned:${e.spellId}:6`);
            }
          }
          reverseBuffMod(owner, e.mod, e.amount ?? 0, e.school, {
            creatureTypeMask: e.creatureTypeMask,
            schoolMask: e.schoolMask,
          });
          // SPELL_AURA_MOD_TOTAL_THREAT (103) Fade — restore each reverse-hate offset.
          // Cite: HostileReference::resetFadeoutThreatReduction addThreat(−iFadeout).
          if (e.threatFadeDeltas && e.threatFadeDeltas.length > 0) {
            for (const { id, delta } of e.threatFadeDeltas) {
              if (!delta) continue;
              const host = bySide(id);
              if (!host || dead(host)) continue;
              const tm = threatOf(host);
              if (tm) tm.addThreatDirectly(e.target, -delta, false);
            }
          }
          // SPELL_AURA_RETAIN_COMBO_POINTS: expire-by-time only strips CP.
          // Cite: SpellAuras.cpp:4447–4451 AURA_REMOVE_BY_EXPIRE + AddComboPoints(−amount).
          if (e.retainComboAmount != null && e.retainComboAmount > 0 && owner.comboTarget != null) {
            const comboTgt = bySide(owner.comboTarget);
            if (comboTgt) {
              owner.comboPoints = Math.max(0, owner.comboPoints - e.retainComboAmount);
              if (owner.comboPoints === 0) owner.comboTarget = null;
            }
          }
          // Only when this spell has no OTHER live row on the same unit. A spell with two aura
          // rows of different length (Strength of Ossirian 25176 is a permanent +300% beside a
          // cosmetic scale) had the short row delete the id, so `buffPresent` read false while
          // the real aura was still applied — and the rule that answers it never fired.
          if (!hasOtherLiveAuraRow(ctx.effectsOn(e.target), e)) owner.buffActive.delete(e.spellId);
          // A seal buff wearing off (or consumed by Judgement) must also drop the live seal state so
          // it stops proccing on swings. (Judgement already nulls it; this covers the 30s timeout.)
          if (owner.activeSeal && owner.activeSeal.spellId === e.spellId) owner.activeSeal = null;
          // A next-cast-mod aura timing out (unconsumed) drops its armed modifier too.
          if (owner.pendingSpellMod && owner.pendingSpellMod.spellId === e.spellId) owner.pendingSpellMod = null;
          // Soul Link wearing off drops the damage-split redirect it armed.
          if (owner.splitDamage && owner.splitDamage.id === e.spellId) owner.splitDamage = null;
          // Blessing of Sacrifice flat split.
          if (owner.splitDamageFlat && owner.splitDamageFlat.id === e.spellId) owner.splitDamageFlat = null;
          // Blessing of Light dual heal bonus.
          if (owner.blessingOfLight && owner.blessingOfLight.spellId === e.spellId) owner.blessingOfLight = null;
          if (owner.healingWay && owner.healingWay.spellId === e.spellId) owner.healingWay = null;
          if (owner.healingWayChancePct > 0 && isHealingWayTalentSpellId(e.spellId)) {
            owner.healingWayChancePct = 0;
          }
          // Sweeping Strikes 20s window ends — drop remaining cleave charges.
          // Cite: UnitAuraProcHandler.cpp:810–841; spell_template DurIndex 18 / ProcCharges 5.
          if (e.spellId === 12292 || e.spellId === 18765) {
            owner.sweepingStrikesCharges = 0;
          }
          // Combustion window ends -> the crit stacks go with it. Cite: Unit.cpp:5372-5375.
          if (e.spellId === COMBUSTION_SPELL_ID || e.spellId === COMBUSTION_STACK_SPELL_ID) {
            clearCombustion(owner, COMBUSTION_STACK_SPELL_ID);
          }
          // Concentration Aura: amount is pushback resist % (no BuffMod).
          // Cite: Spell.cpp:6817–6820; only reverse when mod is absent (not a real stat buff).
          if (e.mod == null && (e.amount ?? 0) > 0 && !e.mechanicResist && owner.pushbackResistChance > 0) {
            owner.pushbackResistChance = Math.max(0, owner.pushbackResistChance - (e.amount ?? 0));
          }
          reverseMechanicResist(owner, e);
          // SPELL_AURA_MOD_DETECT_RANGE (91) — reverse yards into GetAttackDistance.
          // Cite: Unit.cpp:11772; applySpellLate mod_detect_range; KI-796.
          if (e.detectRangeAmount != null) {
            owner.detectRangeMod = (owner.detectRangeMod ?? 0) - e.detectRangeAmount;
          }
          push({ t: ctx.t, kind: 'aura', actor: e.target, name: e.name, applied: false });
        } else if (e.kind === 'resist') {
          // MOD_RESISTANCE / Mage Armor — reverse via applyResistMod (clamps ≥0).
          // Cite: applySpell resist; fighterFactory applyResistMod; KI-482.
          const owner = bySide(e.target);
          applyResistMod(owner, e.school, -(e.amount ?? 0));
          owner.buffActive.delete(e.spellId);
          push({ t: ctx.t, kind: 'aura', actor: e.target, name: e.name, applied: false });
        } else if (e.kind === 'damage_shield' || e.kind === 'proc_trigger_spell') {
          const owner = bySide(e.target);
          owner.buffActive.delete(e.spellId);
          // Removal-body holders never took an icon on apply, so they must not drop one here.
          if (e.onRemove) removalBodies.push([e, 'expire']);
          else push({ t: ctx.t, kind: 'aura', actor: e.target, name: e.name, applied: false });
        } else if (e.kind === 'school_absorb' || e.kind === 'mana_shield') {
          const owner = bySide(e.target);
          if (e.kind === 'school_absorb') {
            owner.schoolAbsorbs = owner.schoolAbsorbs.filter((a) => a.id !== e.spellId);
          } else {
            owner.manaShields = owner.manaShields.filter((a) => a.id !== e.spellId);
          }
          owner.buffActive.delete(e.spellId);
          push({ t: ctx.t, kind: 'aura', actor: e.target, name: e.name, applied: false });
        } else if (e.kind === 'immunity') {
          const owner = bySide(e.target);
          owner.immunity = removeImmunityAura(owner.immunity, e.spellId);
          owner.buffActive.delete(e.spellId);
          push({ t: ctx.t, kind: 'aura', actor: e.target, name: e.name, applied: false });
        } else if (e.kind === 'restore_health' || e.kind === 'restore_power') {
          const owner = bySide(e.target);
          owner.buffActive.delete(e.spellId);
          push({ t: ctx.t, kind: 'aura', actor: e.target, name: e.name, applied: false });
        } else if (e.kind === 'root') {
          // Early break (breakRootOnDamage / breakControl) already emitted applied:false.
          if (!e.broken) push({ t: ctx.t, kind: 'root', target: e.target, applied: false });
        } else if (e.kind === 'speed') {
          // Beneficial sprints/aspects register on buffActive for playerView().buffs;
          // hostile snares never do (delete is a no-op). Clear so chips do not ghost.
          bySide(e.target).buffActive.delete(e.spellId);
          push({ t: ctx.t, kind: 'aura', actor: e.target, name: e.name, applied: false });
        } else if (e.kind === 'reflect') {
          // FS4 reflect self-buff wearing off — no fighter-field state to reverse (read on the fly).
          bySide(e.target).buffActive.delete(e.spellId);
          push({ t: ctx.t, kind: 'aura', actor: e.target, name: e.name, applied: false });
        } else if (e.kind === 'spell_magnet') {
          bySide(e.target).buffActive.delete(e.spellId);
          push({ t: ctx.t, kind: 'aura', actor: e.target, name: e.name, applied: false });
        } else if (e.kind === 'mod_taunt') {
          // SPELL_AURA_MOD_TAUNT expire → TauntUpdate clears STATE_TAUNTED for this caster.
          // Cite: SpellAuras.cpp:2860–2875 apply=false; ThreatManager.cpp:557–575.
          const host = bySide(e.target);
          if (isEnemySide(host.side)) {
            const stillHeld = ctx.effectsOn(e.target).some(
              (o) =>
                o !== e
                && o.kind === 'mod_taunt'
                && o.source === e.source
                && o.expiresAt > ctx.t,
            );
            if (!stillHeld) {
              const tm = threatOf(host);
              if (tm) tm.setTauntState(e.source, TAUNT_STATE.NONE);
            }
          }
          push({ t: ctx.t, kind: 'aura', actor: e.target, name: e.name, applied: false });
        } else if (e.kind === 'cc') {
          // Charm expiry → full Uncharm (Anastari inv/possessed teardown).
          // Cite: SpellAuras.cpp HandleModCharm apply=false → Uncharm.
          if (!e.broken && (e.control === 'charm' || e.mechanic === 'charm')) {
            const owner = bySide(e.target);
            // charmedUntil has already elapsed here so isCharmed is false — still Uncharm
            // so Possess Inv (17250) drops. Cite: SpellAuras HandleModCharm apply=false.
            breakCharm(owner);
          } else if (!e.broken && e.control && !controlActive(bySide(e.target), e.control)) {
            // Faded event only when no overlapping same-kind CC still holds the timer, and not if it
            // was already broken early (breakControl already emitted that).
            push({ t: ctx.t, kind: 'control', target: e.target, control: e.control, applied: false, name: e.name });
          }
          // Banish immunity rides the CC duration — clear when the banish CC expires (baked mechanic).
          if (e.mechanic === 'banish') {
            const owner = bySide(e.target);
            owner.immunity = removeImmunityAura(owner.immunity, e.spellId);
          }
        }
        effects.splice(i, 1);
      }
    }
    for (const [e, mode] of removalBodies) ctx.fireAuraRemoveBodies?.(e, mode);
    ctx.recomputePeriodicDue();
    combatPerfLeave('sim.periodic');
    }

    // Lightwell (724): a placed well reactively renews the most-hurt friendly (< half HP) each
    // interval, spending a charge, until exhausted or expired. Owner-side only; no charges → no-op.
    for (const owner of fightersOrder()) {
      const lw = owner.lightwell;
      if (!lw) continue;
      if (ctx.t >= lw.expiresAt || lw.charges <= 0) {
        owner.lightwell = null;
        owner.buffActive.delete(lw.spellId);
        for (const e of ctx.effectsOn(owner.side)) if (e.kind === 'buff' && e.spellId === lw.spellId) {
          e.expiresAt = Math.min(e.expiresAt, ctx.t);
          ctx.touchEffect(e);
        }
        push({ t: ctx.t, kind: 'aura', actor: owner.side, name: 'Lightwell', applied: false });
        continue;
      }
      while (ctx.t >= lw.nextHealAt && lw.charges > 0) {
        // Most-hurt living friendly below half health (the "clicker").
        let target: Fighter | null = null;
        let worst = 0.5;
        for (const fr of livingFriendlies()) {
          const pct = fr.hp / Math.max(1, fr.spec.maxHealth);
          if (pct < worst) { worst = pct; target = fr; }
        }
        lw.nextHealAt += lw.intervalMs;
        if (!target) break; // nobody hurt enough this interval — hold the charge
        const before = target.hp;
        target.hp = Math.min(target.spec.maxHealth, Math.round(target.hp + lw.healPerCharge));
        lw.charges--;
        if (target.hp !== before) push({ t: ctx.t, kind: 'heal', actor: target.side, amount: target.hp - before, ...(target !== owner && ctx.allyBlock().length > 0 ? { source: owner.side } : {}) });
        applyHealThreat(owner, target.hp - before, null, target.side);
      }
    }
    combatPerf('sim.deaths', checkDeaths);
    if (ctx.ended) { finalize(); return events.slice(startLen); }

    // Missiles whose travel timer elapsed this tick (SpellEntry.speed). Before cast-finish
    // and motion so a chill that lands slows the same-tick gap-close step.
    combatPerf('sim.missiles', landDueMissiles);

    // CombatManager::Update — expire PvP combat timer, re-arm Charge for next engage.
    // Cite: CombatManager.cpp:64–72 countdown; :88–104 HandleExitCombat; chargeUsed clear.
    for (const f of fightersOrder()) expireCombatFlag(f, ctx.t);

    // CallAssistance: the pack joins because the mob you hit called them, not because the session
    // existed. Who joins was fixed at pull build; this is the when, and it fires once.
    packAssistPhase();
    // AGGRO_ZONE raid bosses: first threat → whole party in combat (not trash).
    // Cite: Unit.cpp:7986–7988 ExtraFlags AGGRO_ZONE; Creature.cpp SetInCombatWithZone.
    for (const ef of ctx.livingEnemies()) {
      const tm = threatOf(ef);
      if (!tm || tm.isEmpty()) continue;
      maybeAggroZonePulse(ef, ctx.partyUnits(), ctx.t);
    }

    // The cast bar is a TIMER, so the walk that lands one advances to the next instead of asking all
    // 40 seats every tick. A bar with no finish time counts as due NOW, never Infinity.
    const castFinishDueOf = (): number => {
      let due = Number.POSITIVE_INFINITY;
      for (const f of fightersOrder()) {
        if (!f.castingSpell) continue;
        const at = f.castFinishAt > 0 ? f.castFinishAt : ctx.t;
        if (at < due) due = at;
      }
      return due;
    };
    combatPerfEnter('sim.castFinish');
    if (ctx.t >= castFinishDue) {
    for (const f of fightersOrder()) {
      if (f.castingSpell && ctx.t >= f.castFinishAt) {
        // Drop the bar even on a corpse — skipping dead left castingSpell set and the UI
        // cast bar stuck with the spell name after the unit died mid-cast.
        if (dead(f)) {
          f.castingSpell = null;
          f.castCost = 0;
          f.castCostPower = undefined;
          f.castFinishAt = 0;
          f.castStartedAt = 0;
          continue;
        }
        const spell = f.castingSpell;
        const heldCost = f.castCost;
        const heldCostPower = f.castCostPower;
        f.castingSpell = null;
        f.castCost = 0;
        f.castCostPower = undefined;
        // cast() re-runs CheckPower: a cast that finishes with the bar drained fizzles — nothing
        // spent, no cooldown, no effects. Cite: Spell.cpp cast ~3095-3105; CheckPower ~6374-6403.
        if (!canPayPower(f, heldCost, heldCostPower)) {
          if (!hasAttrEx2(spell, SPELL_ATTR_EX2.DO_NOT_REPORT_SPELL_FAILURE)) {
            push({ t: ctx.t, kind: 'flavor', text: `${spell.name} fizzles: not enough power.` });
          }
          continue;
        }
        // Re-check reagents at cast() (bag may have changed mid-cast). Cite: TakeReagents; KI-804.
        if (!canPaySpellReagents(f, spell)) {
          if (!hasAttrEx2(spell, SPELL_ATTR_EX2.DO_NOT_REPORT_SPELL_FAILURE)) {
            push({ t: ctx.t, kind: 'flavor', text: `${spell.name} fizzles: missing reagents.` });
          }
          continue;
        }
        // Carry the SCHEDULED finish, not the tick that observed it, so a health-scaled payload (Berserking
        // icon 1661) is read at the instant the cast completed. Cite: SpellEffects.cpp:1270-1284; KI-897.
        const finishT = f.castFinishAt > 0 ? f.castFinishAt : ctx.t;
        push({ t: finishT, kind: 'cast_finish', actor: f.side, spellId: spell.id, name: spell.name });
        if (isEnemySide(f.side)) ctx.notifyEventAiSpellCast?.(f, spell.id);
        commitAfterCast(f, spell);
        // TakePower + TakeReagents + SendSpellCooldown (Spell.cpp ~3168–3176).
        spend(f, heldCost, heldCostPower, spell);
        takeReagentsFor(f, spell);
        if (!hasAttrEx2(spell, SPELL_ATTR_EX2.NOT_AN_ACTION)) {
          ctx.removeAurasWithInterruptFlags?.(f, AURA_INTERRUPT.ACTION_LATE, 'action late');
        }
        maybeResetMeleeAttackTimersOnCast(f, spell, ctx.t, false);
        {
          const rec = recoveryReadyAts(spell, ctx.t);
          if (rec.personalReadyAt != null) {
            const adj = applyOwnedSpellMod(f, spell, SPELLMOD_COOLDOWN, rec.personalReadyAt - ctx.t);
            if (adj > 0) f.cooldowns.set(spell.id, ctx.t + adj);
          }
          if (rec.category != null && rec.categoryReadyAt != null) {
            const adj = applyOwnedSpellMod(f, spell, SPELLMOD_COOLDOWN, rec.categoryReadyAt - ctx.t);
            if (adj > 0) f.categoryCooldowns.set(rec.category, ctx.t + adj);
          }
        }
        if (spell.rageGenerated) gainRage(f, spell.rageGenerated);
        // An explicitly aimed cast lands where it was aimed. Only the spell that set the
        // override may claim it; a dead target falls back to the live resolve.
        const ovMap = (ctx as {
          castTargetOverride?: Map<Side, { spellId: number; side: EnemySide }>;
        }).castTargetOverride;
        const ov = ovMap?.get(f.side);
        if (ov) ovMap?.delete(f.side);
        const aimed = ov?.spellId === spell.id ? bySide(ov.side) : null;
        const castTgt = aimed && !dead(aimed)
          ? aimed
          : (isEnemySide(f.side) ? hostileTargetOf(f) : foeOf(f));
        // Re-check spell range at finish, since the target may have walked out. Missile flight still
        // starts only when in range at cast(), which is the Classic CheckCast gate.
        if (
          !(spellNeedsRangeGate(spell) || spellFoeDirectedGeometry(spell))
          || isInSpellRange(
            distanceBetween(f, castTgt), spellGateRangeMaxYd(spell), spellGateRangeMinYd(spell),
            ctx.isMoving(f.side) && ctx.isMoving(castTgt.side),
            f.spec.combatReachYd, castTgt.spec.combatReachYd,
          )
        ) {
          // CheckTarget unit LOS at launch. Cite: Spell.cpp:7015-7037 TARGET_LOS_CASTER. The
          // friendly arm asks the SAME resolver applyHealEffect uses, or it prices another body.
          const healTgt = cfg.navLos && spellNeedsFriendlyLosGate(spell)
            ? ctx.lowestHpFriendlyOf(f)
            : null;
          if (cfg.navLos && spellNeedsLosGate(spell)
            && !navSightClear(cfg, posOf(f.side), posOf(castTgt.side))) {
            f.castCritAdd = 0;
            f.castEffectPct = 0;
          } else if (healTgt && healTgt !== f
            && !navSightClear(cfg, posOf(f.side), posOf(healTgt.side))) {
            f.castCritAdd = 0;
            f.castEffectPct = 0;
          } else {
            // Cost/CD already taken; impact may be delayed by SpellEntry.speed.
            // Cite: Spell.cpp cast → missile; stepSession deliverOrQueueMissile.
            deliverOrQueueMissile(f, castTgt, spell);
          }
        } else {
          // OOR fizzle of effects — still drop one-shot cast bonuses.
          f.castCritAdd = 0;
          f.castEffectPct = 0;
        }
      }
    }
      castFinishDue = castFinishDueOf();
    }
    combatPerfLeave('sim.castFinish');
    combatPerf('sim.deaths', checkDeaths);
    ctx.dropIdlePossessInv?.();
    if (ctx.ended) { finalize(); return events.slice(startLen); }

    // VE EventAI: phase / spawn / flee for living enemies (independent of cast GCD).
    eventAiPhase();

    // Geometry v2.1b: straight-line motion before swings/casts. When a unit arrives in band this tick, the
    // same tick may swing/cast (deterministic). Absent unitPositionsYd → no-op (1v1 byte-identical).
    runMotionPhase();
    // P0b: continuous area auras re-check radius + membership against the fresh
    // positions before anybody acts on the buffed stats this tick.
    areaAuraMaintainPhase();
    // Detect sweep against those same fresh positions: a stealthed body that walked into
    // someone's front arc is seen here, before the enemy-idle gate below reads `stealthed`.
    ctx.stealthDetectPhase?.();
    // Hunter traps: GO radius of the placed point, not fight-wide. Cite: GameObject.cpp:436–503.
    if (typeof ctx.springProximityHunterTraps === 'function') {
      (ctx.springProximityHunterTraps as () => void)();
    }

    const armNextSwing = (f: Fighter, tgt: Fighter): void => {
      if (f.pendingSwing || isEnemySide(f.side)) return;
      const arm = pickNextSwingArm(f, tgt);
      if (!arm) return;
      // Per-spell, not blanket: Heroic Strike carries the main-hand bit AND PreventionType
      // PACIFY, so both refuse it — but a swing ability with neither is still armable.
      if (f.disarmedUntil > ctx.t && isWeaponAction(arm)) return;
      if (f.pacifiedUntil > ctx.t && isPacifyPrevented(arm)) return;
      if (canCastSpell(f, tgt, arm)) startOrCast(f, tgt, arm);
    };
    // CURRENT_MELEE_SPELL must already sit when AttackerStateUpdate runs, or the due blow is a
    // white and that white's rage pays for the queue. Cite: Unit.cpp:2632-2641.
    let playerNextSwingPreArmed = false;
    // Next-swing arm needs a combat victim; livingEnemies is true for seated idle hostiles.
    // Cite: Unit.cpp AttackerStateUpdate; S2 idle foeOf.
    const liveHostiles = livingEnemies();
    const hasLiveHostile = liveHostiles.length > 0;
    const hasEngagedHostile = liveHostiles.some((e) => {
      const tm = threatOf(e);
      return !!tm && !tm.isEmpty();
    });
    if (hasEngagedHostile) {
    if (!ctx.aiPlayer && action != null && !isItemCombatAction(action) && !dead(player)
      && !isControlledHard(player) && !player.pendingSwing) {
      const pressed = chosenPlayerSpell(combatActionSpellId(action), combatActionDest(action));
      if (pressed && isNextMeleeSwingSpell(pressed)) {
        startOrCast(player, foeOf(player), pressed);
        playerNextSwingPreArmed = player.pendingSwing != null;
      }
    }
    for (const f of fightersOrder()) {
      if (dead(f) || isEnemySide(f.side) || f.pendingSwing) continue;
      if (f === player && !ctx.aiPlayer) continue;
      if (isControlledHard(f) || !kitHasNextSwing(f)) continue;
      armNextSwing(f, foeOf(f));
    }
    }
    if (hasLiveHostile) {
    combatPerfEnter('sim.swings');
    for (const f of fightersOrder()) {
      // Root immobilizes only — white swings continue in range. Cite: Unit.h
      // UNIT_STAT_CAN_NOT_REACT (stun/fear/…, no ROOT); Unit.cpp AttackerStateUpdate ~2600.
      if (dead(f) || f.castingSpell) continue;
      // Mid-charge travel: no white swings until arrival resolves the charge.
      if (f.pendingCharge) continue;
      // Totems never white-melee (TotemAI only CastSpell).
      if (isTotemSide(f.side)) continue;
      // While the player is still stealthed (opener window / undetected), enemies do not engage.
      // Cite: Unit.cpp IsVisibleForOrDetect — undetected stealth is not attackable.
      if (isEnemySide(f.side) && player.stealthed) continue;
      // EventAI FLEE / AUTO_ATTACK / REACT_PASSIVE — stop meaningful melee.
      // Cite: UnitAI.cpp DoFlee ~829–841; SetMeleeEnabled ~794; AttackStart REACT_PASSIVE ~285.
      if (isEnemySide(f.side)) {
        const cs = enemyCastBySide.get(f.side as EnemySide);
        if (cs?.eventAi.fleeing) continue;
        if (cs && !cs.eventAi.meleeEnabled) continue;
        if (cs && cs.eventAi.reactState === 0 /* REACT_PASSIVE */) continue;
        // MAIN_SPELL / NPC Shoot ready this tick → cast phase owns the attack (no white+shoot).
        // Cite: UnitAI CAST_MAIN_SPELL; isCreatureRangedAuto.
        if (cs && creatureRangedMainReady(cs, f)) continue;
      }
      // Hard CC and pacify stop auto-attacks. DISARM is deliberately NOT here: it drops the main hand
      // to unarmed damage rather than stopping the swing, and root is motion-only.
      if (f.stunnedUntil > ctx.t || f.fearedUntil > ctx.t || f.incapUntil > ctx.t || f.pacifiedUntil > ctx.t) continue;
      // After-cast kite: a white the next tick shatters Frost Nova (AIF_DAMAGE).
      if (isStepBackWalking(f, ctx.t)) continue;
      // CANCELS_AUTO_ATTACK (Gouge/Stealth/Sap) holds white swings until re-enabled.
      if (!f.autoAttackEnabled) continue;
      // A halt covering PHYSICAL stops the white swing too, because what it answers is threat gained.
      // `haltDpsUntil` is its expiry: without one a unit stayed muted for a 1,800,100 ms stalemate.
      if (
        f.haltDpsSchool !== undefined
        && f.haltDpsEntries === undefined
        && ctx.t <= (f.haltDpsUntil ?? -1)
        && haltDpsRefusesSchool(f.haltDpsSchool, 'physical')
      ) continue;
      // Move-only: no free white swings (autoAttackEnabled is cleared on stance set).
      // 'hold' is NOT here — it forbids motion only, so a held unit still swings what it reaches.
      if (!isEnemySide(f.side)) {
        const st = (ctx as { unitStance?: Map<string, string> }).unitStance?.get(f.side);
        if (st === 'passive') continue;
      }
      // No threat yet → not in combat engagement (stand until missile land / AttackStart).
      if (!enemyEngaged(f)) continue;
      // Dual-wield: MH and OH have independent timers (Unit.cpp update timers + AttackerStateUpdate).
      // Same-tick both-ready: delay the other hand by ATTACK_DISPLAY_DELAY (200ms).
      const ATTACK_DISPLAY_DELAY_MS = 200; // Unit.h ATTACK_DISPLAY_DELAY
      // A swing the unit cannot land (out of range) re-checks in 100 ms, it does not consume the
      // swing. Cite: Unit.cpp:696-699 setAttackTimer(BASE_ATTACK/OFF_ATTACK, 100) on swingError.
      const SWING_ERROR_RETRY_MS = 100;
      const tgt = isEnemySide(f.side) ? hostileTargetOf(f) : foeOf(f);
      // Endless floor OOC: foeOf returns self when no living hostiles — do not swing air.
      if (!tgt || tgt === f || tgt.hp <= 0) continue;
      // Neither hand is due, so nothing below is read: all four sources are pure reads and at 10 Hz
      // a unit is due one tick in 20 to 36. The target resolve stays ABOVE — it PRUNES the list.
      if (ctx.t < f.swingReadyAt && ctx.t < f.ohSwingReadyAt) continue;
      // Scoped halt: the same physical refusal as above, once the body it names is known.
      if (
        f.haltDpsSchool !== undefined
        && f.haltDpsEntries !== undefined
        && ctx.t <= (f.haltDpsUntil ?? -1)
        && haltDpsRefusesSchool(f.haltDpsSchool, 'physical')
        && haltDpsCoversEntry(f.haltDpsEntries, tgt.spec.creatureEntry)
      ) continue;
      const dw = fighterDualWield(f);
      // Melee white only inside the melee band when pairwise yards exist. Undefined distance allows
      // the swing, except on the endless floor, where failing open hit stream injects miles away.
      const meleeDist = distanceBetween(f, tgt);
      // The park stop is ON reach plus slack and the contact ring is 0.05 yd past it, so a chase that
      // drifts a hair loses its swings. The server pays a running pair 2.67 yd more reach.
      const meleeReach = meleeContactYd(
        ctx.isMoving(f.side) && ctx.isMoving(tgt.side),
        f.spec.combatReachYd,
        tgt.spec.combatReachYd,
      );
      const meleeInReach = cfg.endless
        ? meleeDist != null && meleeDist <= meleeReach
        : meleeDist == null || meleeDist <= meleeReach;

      if (ctx.t >= f.swingReadyAt) {
        // Auto-attack mode: ranged fires the equipped weapon, melee swings main hand. An armed
        // on-next-swing strike owns the swing only while the blow can be attempted.
        const armedStrike = f.pendingSwing;
        let shootAuto = f.mode === 'ranged' && !!f.spec.ranged && !(armedStrike && meleeInReach);
        // Classic dead zone: Auto Shot and Throw cannot fire inside min range. Too close drops to
        // melee when a real main hand exists; a pure ranged kit skips the shot and advances the timer.
        if (shootAuto && meleeDist != null) {
          const minRangedYd = rangedAutoMinYards(f);
          if (minRangedYd > 0 && meleeDist < minRangedYd) {
            const hasMelee = (f.spec.weapon?.dmgMax ?? 0) > 1;
            if (hasMelee) {
              f.mode = 'melee';
              shootAuto = false;
            } else {
              const rangedHaste = f.haste + (f.spec.rangedHastePct ?? 0);
              f.swingReadyAt = ctx.t + scaleTime(f.spec.ranged!.speedMs, rangedHaste, 0);
              continue;
            }
          } else if (meleeDist > 35) {
            // SpellRange MAX for the auto shot: only the dead-zone min was checked, so a hunter bot
            // shot 670 white damage at 490 yd. 35 yd is Auto Shot's own bound (spell 75).
            const rangedHaste = f.haste + (f.spec.rangedHastePct ?? 0);
            f.swingReadyAt = ctx.t + scaleTime(f.spec.ranged!.speedMs, rangedHaste, 0);
            continue;
          }
        }
        // Wand / Auto Shot / Throw is SpellStart of the auto-repeat, so CheckCast LOS applies.
        // Cite: Unit.cpp:4192 _UpdateAutoRepeatSpell; Spell.cpp:4742.
        if (shootAuto && cfg.navLos) {
          const shot = rangedAutoSpellOf(f);
          if (!shot || spellNeedsLosGate(shot)) {
            if (!navSightClear(cfg, posOf(f.side), posOf(tgt.side))) {
              f.swingReadyAt = ctx.t + SWING_ERROR_RETRY_MS;
              continue;
            }
          }
        }
        // A swing that cannot reach is a SWING ERROR: both hands retry in 100 ms and do not spend the
        // weapon swing. Charging a full swing threw away up to 3.8 s each time a mob stepped out.
        if (!shootAuto && !meleeInReach) {
          f.swingReadyAt = ctx.t + SWING_ERROR_RETRY_MS;
          f.ohSwingReadyAt = ctx.t + SWING_ERROR_RETRY_MS;
        } else {
        // Consume armed next-swing only when we actually attempt the blow — a shot fired
        // while the strike waits out of reach must leave it armed.
        const strike = shootAuto ? null : f.pendingSwing;
        if (!shootAuto) f.pendingSwing = null;
        // The swing IS the cast: AttackerStateUpdate runs Spell::cast() here and returns without a
        // white blow, so SPELL_GO belongs to this tick. Cite: Unit.cpp:2619-2627.
        if (strike) {
          push({ t: ctx.t, kind: 'cast_finish', actor: f.side, spellId: strike.id, name: strike.name });
        }
        // Melee white/on-next-swing: rewardRage inside weaponStrike + taken rage in dealDamage.
        // Ranged does not grant attacker rage (Unit.cpp attackType != RANGED_ATTACK).
        const landed = shootAuto ? fireRangedAuto(f, tgt) : weaponStrike(f, tgt, strike, 'mainhand');
        if (landed) {
          if (!shootAuto) ctx.removeAurasWithInterruptFlags?.(f, AURA_INTERRUPT.ATTACKING, 'attack');
          maybeBreakStealthOn(f, AURA_INTERRUPT.ATTACKING, 'attack');
          breakFeignDeath(f);
        }
        // On-next-swing riders: weaponStrike deals the weapon damage only, so pendingSwing must apply
        // the riders too or every on-next-swing CC lands as damage with zero control.
        if (landed && strike) {
          // rawEffects cleared — same re-resolve trap as the instant-strike rider path above.
          const riders = strike.effects.filter(
            (e) => e.kind === 'buff' || e.kind === 'dot' || e.kind === 'cc' || e.kind === 'root'
              || e.kind === 'knock_back',
          );
          const riderSpell = riders.length
            ? { ...strike, effects: riders, rawEffects: undefined }
            : null;
          if (riderSpell) applySpell(f, tgt, riderSpell);
          // Cleave fans to additional living enemies up to the cap. Heroic Strike and Maul do not.
          // Cite: Cleave EffectChainTarget 2; Maul chainTargets 0.
          const fanCap = nextSwingFanCap(strike);
          if (fanCap != null && fanCap > 1) {
            const pool = isEnemySide(f.side) ? livingFriendlies() : livingEnemies();
            // Multi-enemy only — single living foe → no extra strikes (1v1 RNG intact).
            if (pool.length > 1) {
              // The secondary must be in the CASTER's melee reach, not within N yards of the primary:
              // primary-origin made two mobs 5 yd apart read as single-target. Rage must not refund.
              const radiusYd = (strike.radiusYd != null && strike.radiusYd > 0)
                ? strike.radiusYd
                : nextSwingFanRadiusYd(strike);
              const fanSpell = { ...strike, radiusYd, aoeShape: 'pbaoe' as const };
              const others = selectAoeSecondaries(f, tgt, fanSpell, pool, fanCap);
              for (const other of others) {
                const otherLanded = weaponStrike(f, other, strike, 'mainhand');
                if (otherLanded && riderSpell) {
                  applySpell(f, other, riderSpell);
                }
              }
            }
          }
        }
        // ADD_EXTRA_ATTACKS pending whites, with the cap applied at grant. The executing flag blocks
        // a Windfury re-proc on the extras themselves. Cite: Unit::DoExtraAttacks :2666-2692.
        if (landed && !shootAuto && f.extraAttacks > 0) {
          f.extraAttacksExecuting = true;
          while (f.extraAttacks > 0 && !dead(tgt) && !dead(f)) {
            f.extraAttacks -= 1;
            weaponStrike(f, tgt, null, 'mainhand');
          }
          f.extraAttacksExecuting = false;
          if (f.extraAttacks <= 0) f.extraAttackSource = null;
        }
        // Ranged keeps its own haste; the melee arm goes through mainHandSwingMs so a disarm
        // reads BASE_ATTACK_TIME instead of the (now unusable) weapon's delay.
        f.swingReadyAt = ctx.t + (shootAuto
          ? scaleTime(f.spec.ranged!.speedMs, f.haste + (f.spec.rangedHastePct ?? 0), 0)
          : mainHandSwingMs(f));
        // Prevent MH+OH same-tick display clash (Unit.cpp ~675–679).
        if (dw && !shootAuto && f.ohSwingReadyAt - ctx.t < ATTACK_DISPLAY_DELAY_MS) {
          f.ohSwingReadyAt = ctx.t + ATTACK_DISPLAY_DELAY_MS;
        }
        if (strike) {
          // The on-next-swing cooldown starts when the blow lands, through the shared recovery rules
          // so a category-only cooldown counts — Raptor Strike rank 1 bakes 0 plus a 6000 category.
          const rec = recoveryReadyAts(strike, ctx.t);
          if (rec.personalReadyAt != null) f.cooldowns.set(strike.id, rec.personalReadyAt);
          if (rec.category != null && rec.categoryReadyAt != null) {
            f.categoryCooldowns.set(rec.category, rec.categoryReadyAt);
          }
        }
        } // end in-reach / ranged auto branch
      }

      // Off-hand white auto, with no on-next-swing and not in ranged mode. Out of reach it takes the
      // same 100 ms swing-error retry and draws no RNG. Cite: Unit.cpp ~683-691.
      if (dw && f.mode === 'melee' && ctx.t >= f.ohSwingReadyAt) {
        if (!meleeInReach) {
          // Same swing error, same 100 ms retry on both hands. Cite: Unit.cpp:694-699.
          f.ohSwingReadyAt = ctx.t + SWING_ERROR_RETRY_MS;
          f.swingReadyAt = ctx.t + SWING_ERROR_RETRY_MS;
        } else {
        const landedOh = weaponStrike(f, tgt, null, 'offhand');
        if (landedOh) {
          ctx.removeAurasWithInterruptFlags?.(f, AURA_INTERRUPT.ATTACKING, 'attack');
          maybeBreakStealthOn(f, AURA_INTERRUPT.ATTACKING, 'attack');
          breakFeignDeath(f);
        }
        // Extra attacks granted by an OFF-hand proc execute immediately as MAIN-hand strikes; without
        // this drain they idled until the next main-hand swing fired them late.
        if (landedOh && f.extraAttacks > 0) {
          f.extraAttacksExecuting = true;
          while (f.extraAttacks > 0 && !dead(tgt) && !dead(f)) {
            f.extraAttacks -= 1;
            weaponStrike(f, tgt, null, 'mainhand');
          }
          f.extraAttacksExecuting = false;
          if (f.extraAttacks <= 0) f.extraAttackSource = null;
        }
        const ohSpd = f.spec.offhand!.speedMs;
        f.ohSwingReadyAt = ctx.t + scaleTime(ohSpd, f.haste, 0);
        if (f.swingReadyAt - ctx.t < ATTACK_DISPLAY_DELAY_MS) {
          f.swingReadyAt = ctx.t + ATTACK_DISPLAY_DELAY_MS;
        }
        }
      }
    }
    combatPerfLeave('sim.swings');
    }
    combatPerf('sim.deaths', checkDeaths);
    ctx.dropIdlePossessInv?.();
    if (ctx.ended) { finalize(); return events.slice(startLen); }

    // nextWakeAt is written AFTER this unit's startOrCast (gcdUntil moves). Finish the
    // previous thinker at the next iteration / after the loop.
    let wakeF: Fighter | null = null;
    const finishPrevWake = (): void => {
      if (!wakeF) return;
      wakeF.nextWakeAt = nextDecideWakeAt(
        wakeF, ctx.t, tickMs, slowEngaged(wakeF, ctx.t, threatOf),
      );
      // A halt is a DECISION, so it expires with the decision: the latch is only cleared by pickAction
      // and S2 sleeps the unit. An unengaged unit wakes at Infinity, so leave it unstamped.
      wakeF.haltDpsUntil = wakeF.haltDpsSchool && Number.isFinite(wakeF.nextWakeAt)
        ? wakeF.nextWakeAt
        : undefined;
      wakeF = null;
    };
    combatPerfEnter('sim.acts');
    refreshCheapDirty();
    for (const f of actionOrder()) {
      finishPrevWake();
      if (dead(f)) continue;
      if (skipsDecision(f, action)) {
        (ctx.slowDiag ??= emptySlowDiag()).pickSkip++;
        // Next-swing abilities still arm while the rotation snapshot is asleep. Enemies never arm one,
        // so resolving their target here threw the answer away. Skip foeOf when nobody has threat.
        if (hasEngagedHostile && !isEnemySide(f.side) && !isControlledHard(f) && kitHasNextSwing(f)) {
          armNextSwing(f, foeOf(f));
        }
        continue;
      }
      (ctx.slowDiag ??= emptySlowDiag()).pickThink++;
      f.decideDirty = false;
      wakeF = f;
      // Mid-cast: enemies may pick CAST_INTERRUPT_PREVIOUS. Friendlies keep the bar unless the pick below
      // is an instant interrupt (or the player pressed an instant). Cite: UnitAI.h CAST_INTERRUPT_PREVIOUS.
      const wasCasting = f.castingSpell != null;
      const wasChanneling = f.channeling != null && ctx.t < f.channeling.endsAt;
      // Mid-charge: travel-only until arrival (effects applied in motion phase).
      if (f.pendingCharge) continue;
      // Move-only stance: AI free-fire and charge kits stay off, while a player action or a queued
      // takeover still wins below. 'passive' is "do not fight"; 'hold' is "do not move".
      if (!isEnemySide(f.side)) {
        const st = (ctx as { unitStance?: Map<string, string> }).unitStance?.get(f.side);
        if (st === 'passive') {
          const hasManualQueue = (castOrdersOf(f)?.length ?? 0) > 0
            || (f === player && !ctx.aiPlayer && action != null);
          if (!hasManualQueue) continue;
        }
      }
      // A live walk order or WASD intent still fights: only cast-time and channel spells are refused.
      // The old gate skipped the whole pick, so instants and heals went dark for every walking tick.
      let walkingFriendly = false;
      let walkManualQueue = false;
      const walkOrders = (ctx as { unitMoveOrders?: Map<string, unknown[]> }).unitMoveOrders;
      const walkIntents = (ctx as { unitMoveIntents?: Map<string, unknown> }).unitMoveIntents;
      if (!isEnemySide(f.side)) {
        walkingFriendly = (walkOrders?.get(f.side)?.length ?? 0) > 0 || walkIntents?.has(f.side) === true;
        if (walkingFriendly) {
          walkManualQueue = (castOrdersOf(f)?.length ?? 0) > 0
            || (f === player && !ctx.aiPlayer && action != null);
        }
      }
      // Enemy (and pet) idle while player remains stealthed — opener window.
      if (f.side !== 'player' && player.stealthed) continue;
      const hardCC = isControlledHard(f); // stun / fear / polymorph
      // A player item-use is the whole action for the tick, blocked by hard control UNLESS the item is
      // what breaks it — otherwise a feared flag carrier can never trinket out.
      const breaksOwnCC = hardCC
        && isItemCombatAction(action)
        && itemBreaksControl(f, action.item);
      if (f === player && !ctx.aiPlayer && (!hardCC || breaksOwnCC) && isItemCombatAction(action)) {
        // Pass the target through UNRESOLVED. Defaulting to the player aimed every untargeted use at
        // the user, so an offensive item went off in your hand; useItem picks the default per kind.
        useItem(action.item, action.target);
        continue;
      }
      let spell: SpellDef | null = null;
      // Did a HUMAN press produce this pick? Only that may clip a cast bar in flight. A held one-shot
      // is not a keypress: treating it as one let a queued Rejuvenation cancel its own Regrowth bar.
      let fromHumanPress = false;
      const aiTgt = isEnemySide(f.side) ? hostileTargetOf(f) : foeOf(f);
      // Player, pet and companion share ONE ordered cast list: a pet-bar slot, a menu entry and a
      // Pre-buff row are the same one-shot on the same hold-through-a-GCD terms.
      const castList = castOrdersOf(f);
      const headCast = castList?.[0];
      // The enemy the head step named, live only while that step is. Kept SEPARATE from the AI target:
      // while the step waits for a GCD the rotation must keep hitting what it was already fighting.
      let queuedTgt: Fighter | null = null;
      /** Set only when the queued spell actually wins this tick — consumed at startOrCast. */
      let queuedCastTgt: Fighter | null = null;
      if (headCast?.targetSide != null && isEnemySide(headCast.targetSide)) {
        const qf = bySide(headCast.targetSide);
        if (qf && !dead(qf)) queuedTgt = qf;
      }
      // The head of the cast list for whichever friendly seat owns one. Extracted so the player runs
      // the identical path; `idle` is what the seat does on a tick the head cannot win.
      const takeHeldQueue = (idle: () => SpellDef | null): HeldPick => {
        const q = headCast;
        if (!castList || !q) return { spell: idle(), castTgt: null };
        // Retire the head, spent or proven impossible. The list is the ONLY copy of the step, so one
        // splice is the whole clear and no second map keeps a stale aim.
        const dropHead = (): void => {
          castList.shift();
          if (!castList.length) allCastOrders()?.delete(f.side);
        };
        // Say what became of the step: one line per cast, skip and drop is the whole progress report.
        // Only the engine can tell "waiting on a GCD" from "impossible", and the UI renders these.
        const orderEvent = (
          state: 'cast' | 'already_up' | 'dropped',
          reason?: string,
        ): void => {
          if (q.spellId == null) return; // an item-only step names no spell
          push({
            t: ctx.t,
            kind: 'cast_order',
            actor: f.side,
            spellId: q.spellId,
            ...(q.targetSide != null ? { target: q.targetSide } : {}),
            state,
            ...(reason != null ? { reason } : {}),
          });
        };
        let picked: SpellDef | null = null;
        let heldTgt: Fighter | null = null;
        // Party takeover: the queued step wins the next pick it CAN win, held rather than consumed on
        // sight. A self-cast is aimed at the CASTER, or a rangeMax-0 buff measures out of range.
        const kit = f.side === 'pet' ? (f.spec.petFullKit ?? f.spec.spells) : f.spec.spells;
        const qSpell = q.spellId != null ? spellFromKit(kit, q.spellId) : undefined;
        // Missing kit row → same as empty effects: not foe-directed.
        const qSelfCast = q.spellId != null && !(qSpell && isHostileSpellDef(qSpell));
        // Friendly aim: the step named a party member, so the cast is neither foe-directed nor aimed
        // at the caster. Range-gate against THAT body, or a 40 yd Rejuvenation lands on the caster.
        let qFriendly: Fighter | null = null;
        if (qSelfCast && q.targetSide != null && !isEnemySide(q.targetSide)) {
          const wf = bySide(q.targetSide);
          if (wf && !dead(wf)) qFriendly = wf;
          else {
            // The body it named is gone. Falling through would make it a SELF cast, which is
            // how a HoT aimed at a dead ally landed on the caster.
            dropHead();
            orderEvent('dropped', 'target died');
            return { spell: idle(), castTgt: null };
          }
        }
        // Already up. The ENGINE owns this and reads `buffActive`, the authoritative set. Deciding it
        // again from the view missed auras its seven filters drop, so the order retried until timeout.
        if (q.skipIfActive === true && q.spellId != null) {
          const holder = qFriendly ?? (qSelfCast ? f : null);
          if (holder?.buffActive.has(q.spellId)) {
            dropHead();
            orderEvent('already_up');
            return { spell: idle(), castTgt: null };
          }
        }
        const qTgt = qFriendly ?? (qSelfCast ? f : (queuedTgt ?? aiTgt));
        // An instant that is allowed to CLIP a cast bar already in flight: a Kick, or a live human press.
        // The same test the mid-cast gate below makes, so the two cannot drift. Cite: Spell.cpp cancel.
        const clipsCastInFlight = (sp: SpellDef): boolean =>
          (sp.castTimeMs ?? 0) <= 0 && (spellHasInterruptCast(sp) || q.fromPress === true);
        // Every gate the scheduler applies BELOW this pick that `canCastSpell` does not cover. Each
        // must read as WAIT: consuming the head and then hitting a `continue` casts nothing.
        const blockedBelow = (sp: SpellDef): boolean =>
          (hardCC && !isBreaker(sp, f))
          || ((wasCasting || wasChanneling) && !isEnemySide(f.side) && !clipsCastInFlight(sp))
          || (isStepBackWalking(f, ctx.t) && isHostileSpellDef(sp))
          || (spellIncursGcd(sp) && ctx.t < f.gcdUntil)
          || (f.silencedUntil > ctx.t && isSilencePrevented(sp))
          || (f.disarmedUntil > ctx.t && isWeaponAction(sp))
          || (f.pacifiedUntil > ctx.t && isPacifyPrevented(sp))
          || schoolLocked(f, sp);
        if (q.itemEntry != null) {
          dropHead();
          orderEvent('cast');
          useItem(q.itemEntry, f.side, f.side); // kit item on self (potion/healthstone)
          return { spell: null, castTgt: null };
        } else if (q.spellId != null) {
          // The pet resolves against everything it KNOWS, not the autocast subset: left-clicking a
          // greyed-out slot casts it once, as the client's pet bar does. Cite: Pet.h ACT_DISABLED.
          const sp = qSpell;
          if (!sp) {
            dropHead(); // no longer in the kit — cannot ever fire
            orderEvent('dropped', 'not in the kit');
            return { spell: idle(), castTgt: null };
          } else if (canCastSpell(f, qTgt, sp) && !blockedBelow(sp)) {
            dropHead();
            orderEvent('cast');
            picked = sp;
            // hand the one-shot target to the cast below (self-casts aim at the caster)
            heldTgt = qFriendly ?? (qSelfCast ? f : queuedTgt);
            // The heal/buff pool re-picks by triage unless pinned, so a Renew aimed at the
            // tank would still land on whoever was lowest. Cite: sessionPools lowestHpFriendlyOf.
            if (qFriendly) f.friendlyPin = qFriendly.side;
          } else {
            return { spell: idle(), castTgt: null }; // stay armed; rotation carries this tick
          }
        } else {
          dropHead(); // neither a spell nor an item — cannot ever fire
          return { spell: idle(), castTgt: null };
        }
        return { spell: picked, castTgt: heldTgt };
      };
      if (f === player && !ctx.aiPlayer) {
        const dest = combatActionDest(action);
        const spellId = combatActionSpellId(action);
        if (dest && spellId != null) {
          (ctx.castDestOverride ??= new Map()).set(player.side, { spellId, dest });
        } else {
          ctx.castDestOverride?.delete(player.side);
        }
        spell = chosenPlayerSpell(spellId, dest);
        fromHumanPress = spell != null;
        // Friendly aim travels with the action (macro `[@party2]`). Only a spell-bearing action
        // writes it, so a null tick mid-cast cannot wipe the pin of the cast in flight.
        if (spellId != null) {
          const wanted = typeof action === 'object' && action !== null && 'ally' in action
            ? (action as { ally?: CombatantId }).ally
            : undefined;
          player.friendlyPin = wanted ? (wanted as Side) : null;
        }
        // The player is a Pre-buff CASTER like any other seat, so an idle tick spends the held queue
        // instead of dropping to white swings. A live player has no rotation fallback.
        if (spell == null && headCast) {
          const held = takeHeldQueue(() => null);
          spell = held.spell;
          queuedCastTgt = held.castTgt;
        }
      }
      else if (headCast) {
        const held = takeHeldQueue(() => pickAction(f, aiTgt));
        spell = held.spell;
        queuedCastTgt = held.castTgt;
      }
      else spell = pickAction(f, aiTgt); // pet/totem/enemy AI; empty spells → null → idle
      // BG auto-rescue: hard-CC'd with no breaker SPELL picked, try a breaker ITEM from the unit's own
      // kit. All sides — an ally or an enemy bot escapes a stun the same way a player tap would.
      if (hardCC && cfg.autoRescueItems && (!spell || !isBreaker(spell, f)) && tryItemRescue(f)) continue;
      // Off-GCD next-swing arm. The provider returns one pick, so pack Cleave starved whenever a GCD
      // ability won: arm even when the pick is null or GCD-blocked, using the rage remainder.
      const tryArmNextSwing = (): void => {
        // An ARENA seat is a player and owns its next-swing kit; a creature has none, which is
        // why enemies were skipped outright. Measured without this: side B's warrior cast Heroic
        // Strike 0 times against side A's 10 over 5 bracket-2 mirrors (plan §W11).
        if (hardCC || f.pendingSwing) return;
        if (isEnemySide(f.side) && cfg.enemiesAreATeam !== true) return;
        if (f.disarmedUntil > ctx.t || f.pacifiedUntil > ctx.t) return;
        const arm = pickNextSwingArm(f, aiTgt);
        if (arm && canCastSpell(f, aiTgt, arm)) startOrCast(f, aiTgt, arm);
      };
      if (!spell) {
        // A null pick is the white-swing plan. Stealth enter cancelled auto-attack, so AI parked in
        // melee idled at full HP forever. Start it in the white band only, so openers walk in stealthed.
        const aiDriven = f === player ? ctx.aiPlayer : true;
        if (aiDriven && f.stealthed && !f.autoAttackEnabled) {
          const d = distanceBetween(f, aiTgt);
          const inMelee = d == null || d <= MELEE_CONTACT_YD;
          if (inMelee) {
            f.mode = 'melee';
            f.autoAttackEnabled = true;
            maybeBreakStealthOn(f, AURA_INTERRUPT.ATTACKING, 'attacking');
            breakFeignDeath(f);
            f.autoAttackEnabled = true;
            if (f.swingReadyAt > ctx.t + 60_000) f.swingReadyAt = ctx.t;
          }
        }
        tryArmNextSwing();
        continue;
      }
      // Mid-cast friendly: an instant Kick/CS, a player-pressed instant, or a different instant
      // the rotation just picked. Same-spell re-picks keep the bar. Cite: Unit.cpp:4203-4212.
      if ((wasCasting || wasChanneling) && !isEnemySide(f.side)) {
        const instant = (spell.castTimeMs ?? 0) <= 0;
        const kickClip = instant && spellHasInterruptCast(spell);
        const manualClip = instant && fromHumanPress;
        const rotationClip = cfg.enemiesAreATeam === true && instant && (
          (f.castingSpell != null && spell.id !== f.castingSpell.id)
          || (wasChanneling && (f.channeling?.spell.id ?? 0) !== spell.id)
        );
        if (!kickClip && !manualClip && !rotationClip) {
          tryArmNextSwing();
          continue;
        }
      }
      // Walking on WASD or a "go here" keeps instants only, for kiting; an engage or click-mob dest
      // still stops and pre-casts. The after-cast step-back skips cast-time until its yards are walked.
      if (isStepBackWalking(f, ctx.t) && isHostileSpellDef(spell)) continue;
      if ((spell.castTimeMs ?? 0) > 0 || (spell.channelMs ?? 0) > 0) {
        if (walkingFriendly && !walkManualQueue) {
          const hold = (ctx as { unitHoldCourse?: Set<string> }).unitHoldCourse?.has(f.side) === true;
          if (walkIntents?.has(f.side) === true || hold) {
            tryArmNextSwing();
            continue;
          }
          walkOrders?.delete(f.side);
        }
      }
      // Mid-cast enemy: only proceed when the armed slot carries CAST_INTERRUPT_PREVIOUS.
      if (wasCasting && isEnemySide(f.side)) {
        const cs = enemyCastBySide.get(f.side as EnemySide);
        const flags = cs?.pendingSlot?.entry.castFlags ?? 0;
        if ((flags & CAST_FLAG.INTERRUPT_PREVIOUS) === 0) {
          // Leave the in-flight cast alone; drop the pending slot so it is not marked used.
          if (cs) cs.pendingSlot = null;
          continue;
        }
      }
      // Hard control locks out everything EXCEPT a breaker that strips the active control(s)
      // (WotF under fear/sleep/charm — not under stun). Cite: KI-741 isBreaker mechanic gate.
      if (hardCC && !isBreaker(spell, f)) continue;
      if (!hardCC) {
        // Silence refuses PreventionType SILENCE and pacify refuses PACIFY. NOT "cast versus weapon
        // strike": Kick and Shield Bash are PACIFY and fire under a silence. Cite: Spell.cpp:6049-6052.
        if (f.silencedUntil > ctx.t && isSilencePrevented(spell)) {
          tryArmNextSwing();
          continue;
        }
        if (f.disarmedUntil > ctx.t && isWeaponAction(spell)) continue;
        if (f.pacifiedUntil > ctx.t && isPacifyPrevented(spell)) continue;
        // School lockout blocks silence-prevention casts of the locked school only.
        if (schoolLocked(f, spell)) {
          tryArmNextSwing();
          continue;
        }
      }
      // Only spells that incur GCD wait for the global cooldown to be clear. Off-GCD abilities
      // (gcdMs=0 and not defaulted for their role) and on-next-swing can fire through an active GCD.
      if (spellIncursGcd(spell) && ctx.t < f.gcdUntil) {
        tryArmNextSwing();
        continue;
      }
      // chargeUsed is set inside startOrCast when geometry charge travels / lands;
      // no-geometry path still marks it here for the classic once-per-combat gate.
      if (roleOf(spell) === 'charge' && !ctx.unitPositionsMutable) f.chargeUsed = true;
      // EventAI CAST or a spell-list TargetId through the shared selectTarget, defaulting to the
      // current victim. A rotation rule with target 'other' aims off-focus, one-shot and cleared on read.
      const offMap = (ctx as { rotationOffTarget?: Map<Side, EnemySide> }).rotationOffTarget;
      const offSide = offMap?.get(f.side);
      const offTgt = offSide ? bySide(offSide) : null;
      if (offSide) offMap?.delete(f.side);
      let castTgt = queuedCastTgt ?? (offTgt && !dead(offTgt) ? offTgt : null) ?? aiTgt;
      if (isEnemySide(f.side)) {
        const castState = enemyCastBySide.get(f.side as EnemySide);
        const pendingEntry = castState?.pendingSlot?.entry;
        const mode = pendingEntry?.target;
        const space = pendingEntry?.targetSpace === 'spell_list' ? 'spell_list' : 'eventai';
        const lowestHpYd = pendingEntry?.friendlyLowestHpYd ?? 0;
        const topN = pendingEntry?.highestHpTopThreat ?? 0;
        if (lowestHpYd > 0) {
          // DoSelectLowestHpFriendly: no wounded friendly in range means NO cast, which is what
          // `if (Unit* target = ...)` does. Cite: boss_sulfuron_harbinger.cpp:162-166.
          const healed = ctx.resolveLowestHpFriendly?.(
            f, lowestHpYd, pendingEntry?.friendlyHpDeficit ?? 1,
          ) ?? null;
          if (healed) castTgt = healed;
          else {
            if (castState?.pendingSlot) {
              markCreatureCastRowUsed(castState.slots, castState.pendingSlot, ctx.t, rng);
              castState.pendingSlot = null;
            }
            continue;
          }
        } else if (topN > 0) {
          const resolved = ctx.resolveHighestHpTopThreat?.(f, topN) ?? null;
          if (resolved) castTgt = resolved;
          else {
            // Primer CAST_OK, no 28308. Cite: boss_patchwerk.cpp:117-127 OnCheckTarget false.
            if (castState?.pendingSlot) {
              markCreatureCastRowUsed(castState.slots, castState.pendingSlot, ctx.t, rng);
              castState.pendingSlot = null;
            }
            continue;
          }
        } else if (mode != null && (space === 'spell_list' || mode !== TARGET_T.HOSTILE)) {
          const resolved = resolveEventAiCastTarget(
            f, spell, mode, space, pendingEntry?.selectClass ?? 0,
            // DoFindFriendlyEligibleDispel's own range literal. Cite: boss_bug_trio.cpp:371 50.0f.
            pendingEntry?.friendlyRadiusYd ?? 0,
            pendingEntry?.selectInMelee === true,
          );
          if (resolved) castTgt = resolved;
          else if (
            space === 'spell_list' && SPELL_LIST_FRIENDLY_TARGETS.has(mode | 0)
            && pendingEntry?.friendlyFallbackSelf === true
          ) {
            // `if (!target) target = m_creature;` — Sulfuron's Inspire buffs himself when no priest
            // is missing it. Cite: boss_sulfuron_harbinger.cpp:104-105.
            castTgt = f;
          } else if (space === 'spell_list' && SPELL_LIST_FRIENDLY_TARGETS.has(mode | 0)) {
            // An empty FRIENDLY pool casts NOTHING; keeping the AI victim aimed Yauj's Dispel at the
            // raid. Scoped to the four support selectors. Cite: UnitAI.cpp:1305-1318.
            if (castState) castState.pendingSlot = null;
            continue;
          } else if (pendingEntry?.selectInMelee === true) {
            // `if (Unit* target = SelectAttackingTarget(..., IN_MELEE_RANGE))` — nobody in melee is
            // NO cast, not a cast at whoever holds threat. Cite: boss_twinemperors.cpp:256-259.
            if (castState) castState.pendingSlot = null;
            continue;
          } else if ((pendingEntry?.selectClass ?? 0) > 0) {
            // SelectAttackingTarget returned no unit of that class — do not hit the tank.
            // Cite: boss_nefarian.cpp:266-287; no ResetCombatAction when the pick is null.
            if (castState) castState.pendingSlot = null;
            continue;
          } else if (
            space === 'eventai'
            && (mode === TARGET_T.HOSTILE_RANDOM_NOT_TOP || mode === TARGET_T.HOSTILE_RANDOM_NOT_TOP_PLAYER)
          ) {
            // Nobody below the top of the threat list is NO cast: solo, Jandice's Banish stunned the
            // tank 15 s of every 20. Cite: boss_jandice_barov.cpp:75; CreatureEventAI.cpp ACTION_T_CAST.
            if (castState) castState.pendingSlot = null;
            continue;
          }
        }
      }
      // Remember an explicit aim for the cast-completion path, which otherwise re-resolves the target.
      // Set and cleared only here, so a later pick supersedes it and nothing below can clobber it.
      {
        const ov = (ctx as {
          castTargetOverride?: Map<Side, { spellId: number; side: EnemySide }>;
        }).castTargetOverride;
        if (ov) {
          if (queuedCastTgt) ov.set(f.side, { spellId: spell.id, side: queuedCastTgt.side as EnemySide });
          else ov.delete(f.side);
        }
      }
      // One Prepare per press: the pre-swing arm already filled CURRENT_MELEE_SPELL for this blow.
      if (playerNextSwingPreArmed && f === player && isNextMeleeSwingSpell(spell)) continue;
      startOrCast(f, castTgt, spell);
      // After a GCD cast, queue Cleave/HS with remaining rage (next-swing is off-GCD).
      if (!isNextMeleeSwingSpell(spell)) tryArmNextSwing();
      // Arm EventAI repeat / exhaust after a cast attempt leaves the scheduler (per-enemy).
      if (isEnemySide(f.side)) {
        const castState = enemyCastBySide.get(f.side as EnemySide);
        if (castState?.pendingSlot && castState.pendingSlot.spell.id === spell.id) {
          const pending = castState.pendingSlot;
          // Row-level re-arm: EFLAG_RANDOM_ACTION siblings share the fired slot's timer.
          markCreatureCastRowUsed(castState.slots, pending, ctx.t, rng);
          countCreatureCastFire(pending);
          ctx.applyScriptDevTimerActions?.(f, spell.id, castTgt);
          // CAST_MAIN_SPELL only: pace by weapon speed so Shoot does not re-fire every
          // tick. D4 — specials never use weapon-pace filler. Cite: UnitAI.h CAST_MAIN_SPELL.
          const paceMs = Math.max(
            f.spec.weapon.speedMs | 0,
            personalCooldownMs(spell),
            1500,
          );
          paceMainSpellSlot(pending, ctx.t, paceMs);
          // Main-spell / NPC Shoot: exclusive with white melee for this weapon window.
          // Cite: UnitAI CAST_MAIN_SPELL; isCreatureRangedAuto.
          const flags = pending.entry.castFlags ?? 0;
          if (isCreatureRangedMainAttack(spell, flags)) {
            f.swingReadyAt = Math.max(f.swingReadyAt, ctx.t + paceMs);
          }
          // CAST_DISTANCE_YOURSELF — stop combat chase / keep ranged gap after cast.
          // Cite: CreatureEventAI.cpp ~144–145 AddDistanceSpell; UnitAI.h ~76.
          if ((flags & CAST_FLAG.DISTANCE_YOURSELF) !== 0) {
            castState.eventAi.combatMovement = false;
            castState.eventAi.rangedMode = true;
            castState.eventAi.meleeEnabled = false;
            f.mode = 'ranged';
            f.autoAttackEnabled = false;
          }
          // CAST_NO_MELEE_IF_OOM — after a cast attempt, if still OOM, suppress melee approach.
          // Cite: UnitAI.h ~69 (header semantics; bake uses rarely).
          if ((flags & CAST_FLAG.NO_MELEE_IF_OOM) !== 0 && !canAfford(f, spell)) {
            castState.eventAi.meleeEnabled = false;
            f.autoAttackEnabled = false;
          }
          castState.pendingSlot = null;
        }
      }
    }
    finishPrevWake();
    combatPerfLeave('sim.acts');
    combatPerf('sim.deaths', checkDeaths);
    if (ctx.ended) { finalize(); return events.slice(startLen); }

    // Power regen at end of tick (after spends): rage decay 200ms quanta while OOC, energy 100ms
    // quanta, mana 1s + 5SR (players) / pet mana 4s + 5SR, pet focus 4s, aura 116 combat HP.
    combatPerfEnter('sim.regen');
    for (const f of fightersOrder()) {
      if (dead(f)) continue;
      regenRage(f, tickMs);
      regenEnergy(f, tickMs);
      regenMana(f, tickMs);
      regenFocus(f, tickMs);
      regenHealth(f, tickMs);
    }
    combatPerfLeave('sim.regen');

    ctx.t += tickMs;
    // Player::CheckDuelDistance — a duelist who runs out of the arbiter's ring forfeits.
    const fled = cfg.duel ? duelBounds.fled() : null;
    if (fled) {
      ctx.winner = fled === 'player' ? 'enemy' : 'player';
      ctx.ended = true;
      push({ t: ctx.t, kind: 'flavor', text: `${bySide(fled)?.spec.name ?? fled} fled the duel.` });
      finalize();
      return events.slice(startLen);
    }
    if (ctx.t > maxMs) { ctx.winner = 'timeout'; ctx.ended = true; finalize(); }
    return events.slice(startLen);
  };

  // finishChargeArrival / runMotionPhase / areaAuraMaintainPhase installed by sessionMotion.
  ctx.startOrCast = startOrCast;
  // P11 ring trim + evade wrap sets ctx.step; deps passed so the captures stay identical.
  installStepWrap(ctx, { stepCore: step, events, push, player, pet, cfg, dead, isControlledHard });
}
