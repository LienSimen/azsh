// Peeled from createSession (createSession.md P10) — pattern (D).
// Public CombatSession surface (return object of createSession).

import type { CombatContext } from './context.ts';
import { AURA_INTERRUPT } from '../../domain/spells/stealth.ts';
import { dispelClaimedByOtherSeat } from './dispelDuty.ts';
import type {
  AbilityStatus,
  AllyActionProvider,
  CombatAction,
  CombatantSpec,
  CombatItemStatus,
  CombatResult,
  CombatSession,
  CombatantView,
  Fighter,
  GroupRole,
  SimTickInputs,
  TotemView,
  TrapView,
} from './types.ts';
import type { QueuedCast } from './session-types.ts';
import { resolveStandYards } from '../../domain/rotation/stand.ts';
import type { SpellDef, TotemSlot } from '../../data/schema.ts';
import type { CombatEvent, Side, TotemSide, EnemySide } from '../core/events.ts';
import { isAllySide, isEnemySide, isDuelistSide, sideForTotemSlot } from '../core/events.ts';
import type { CombatantId } from './threat.ts';
import type { CombatPosYd, PullGeometryAnchor } from './combatGeometry.ts';
import { fillPoseFrame, POSE_STRIDE, type PoseFiller, type SimPoseFrame } from './simSnapshot.ts';
import { isInSpellRange, BASE_RUN_SPEED, MELEE_REACH_YD, MELEE_PARK_SLACK_YD } from './combatGeometry.ts';
import { AURA_INCREASE_MOUNTED_SPEED } from '../../domain/nav/speed.ts';
import type { MotionGateReport } from './motionGate.ts';
import { detHypot } from '../core/detMath.ts';
import { channelInterruptCtx, interruptChannel } from './channel.ts';
import { wakeForDecision } from './slowUpdate.ts';
import { CORRIDOR_STAND_SHORT_YD, standShortYdFor } from './sessionPathTo.ts';
import { isFormSpell, resolveFormCast } from '../../domain/character/forms.ts';
import { SPELL_ATTR_EX2, SPELL_ATTR_EX4, hasAttrEx2, hasAttrEx4 } from '../spells/spellAttributes.ts';
import {
  isHostileSpellDef,
  spellNeedsRangeGate,
  spellGateRangeMaxYd,
  spellGateRangeMinYd,
  spellFoeDirectedGeometry,
  spellNeedsLosGate,
  spellTargetTypeAllowed,
  isNonCastableTalentProc,
  isSelfCenteredAoe,
  focusImmunityBlocksSpell,
} from './predicates.ts';
import { isGroundTargetedMulti } from '../../domain/rotation/classify.ts';
import { reactiveCastGate } from './reactiveGates.ts';
import { isPlayerCharacterTarget, targetCastGate } from './castTargetGates.ts';
import { playerEquippedItemRefuseReason } from './equippedItemGate.ts';
import { roleOf } from './roles.ts';
import { SPELL_DAMAGE_CLASS } from './mitigation.ts';
import { canPaySpellReagents } from './spellReagents.ts';
import { isPureDispelSpell, firstDispelEffect } from '../../domain/spells/dispel.ts';
import { navSightClear } from './navSight.ts';
import { fighterIsInCombat, maybeAggroZonePulse } from './combatFlag.ts';
import { applyRuleAfter, armRuleAfter, consumeFollowUp, isStepBackWalking } from './ruleAfter.ts';
import type { RuleAfter } from '../../domain/rotation/rotation.ts';
import { totemGrantedAuras } from './totemAuras.ts';
import { resetCreatureCastSlotsOnEvade } from '../../domain/creature/creatureCastList.ts';
import { runEvadeLifecycle } from './evadeLifecycle.ts';
import { HUNTER_TRAP_RADIUS_YD, isHunterTrapArmProc } from '../spells/interpreter/hunter-kit.ts';
import { spellAllowedAtLocation } from '../spells/spellAttributes.ts';
import { effectiveSpeeds } from '../../domain/nav/speed.ts';
import {
  isPacifyPrevented, isSilencePrevented, pruneInterruptClaims,
} from '../spells/interrupt.ts';
import { HOME_DESPAWN_DISTANCE_SQ } from '../../domain/creature/creatureAiConstants.ts';

export type SessionApiHooks = {
  dead: (f: Fighter) => boolean;
  step: (action?: CombatAction, inputs?: SimTickInputs) => CombatEvent[];
  result: () => CombatResult;
  memoView: (f: Fighter) => CombatantView;
  invalidateViewMemo: () => void;
  enemiesView: () => CombatantView[];
  alliesView: () => CombatantView[];
  finalize: () => void;
  totemOwnerMeta: Map<TotemSide, { ownerSide: Side; name: string }>;
  unitMoveOrders: Map<string, CombatPosYd[]>;
  unitMoveIntents: Map<string, CombatPosYd>;
  unitManualMotion: Set<string>;
  unitStance: Map<string, 'retaliate' | 'passive' | 'hold' | 'patrol'>;
  unitPatrolLoop: Map<string, CombatPosYd[]>;
  unitAnchors: Map<string, CombatPosYd>;
  unitCastOrders: Map<Side, QueuedCast[]>;
  clearManualMotion: (side: string) => void;
  cancelCastForMove: (unit: Fighter) => void;
  /** Optional: pull-detect stealth at session build (called once by createSession before return). */
  stealthStrengthOf?: (f: Fighter) => number;
};

// A cooldown-on-event entry that has not started holds a permanent sentinel, so its remaining reads as
// infinite. Every reader wants a finite number, and the honest one is the duration that will run.
function displayCooldownMs(unit: Fighter, spellId: number, remaining: number): number {
  if (Number.isFinite(remaining)) return remaining;
  return unit.deferredCooldowns?.get(spellId) ?? 0;
}

export function buildCombatSessionApi(ctx: CombatContext, hooks: SessionApiHooks): CombatSession {
  const {
    dead, step, result, memoView, invalidateViewMemo, enemiesView, alliesView, finalize,
    totemOwnerMeta, unitMoveOrders, unitMoveIntents, unitManualMotion, unitStance,
    unitPatrolLoop, unitAnchors, unitCastOrders,
    clearManualMotion, cancelCastForMove,
  } = hooks;

  const {
    player, pet, allies, enemies, enemy, totems, effects, cfg,
    playerItems, itemCd, deathEmitted, instanceData, allyManualTarget,
  } = ctx;

  // WHO IS IN THIS SEAT — asked of the side-to-unit store, never by scanning a seat array. The map has
  // been the storage since the axis flip; the arrays hold ORDER. The faction guard stays in each helper.
  const allyUnitOfSide = (side: string): Fighter | null =>
    (isAllySide(side) ? ctx.sideFighter?.(side) ?? null : null);
  const enemyUnitOfSide = (side: string): Fighter | null =>
    (isEnemySide(side) ? ctx.sideFighter?.(side) ?? null : null);
  /** Player, its pet, or an ally. Null for an enemy or a totem - the party-command seats. */
  const partyUnitOfSide = (side: string): Fighter | null => {
    if (side === 'player') return player;
    if (side === 'pet') return pet;
    return allyUnitOfSide(side);
  };
  /** The party seats plus enemy seats. Totems stay out (5 hp summons, not revivable bodies). */
  const fightingUnitOfSide = (side: string): Fighter | null =>
    partyUnitOfSide(side) ?? enemyUnitOfSide(side);
  // The Fighter for a side id, or null when no seat holds it. The store misses to the primary enemy or
  // the PLAYER rather than throwing, so the old catch arm was dead and cancelled the wrong cast.
  const fighterOfSide = (side: CombatantId | Side | string): Fighter | null =>
    ctx.sideFighter?.(side as Side) ?? null;

  const ensurePlayerFocus = ctx.ensurePlayerFocus!;
  const foeOf = ctx.foeOf!;
  const hostileTargetOf = ctx.hostileTargetOf!;
  const nearestPartyInAcquire = ctx.nearestPartyInAcquire!;
  const posOf = ctx.posOf;
  const setPos = ctx.setPos;
  const placeEnemyAt = ctx.placeEnemyAt!;
  const snapToMesh = ctx.snapToMesh!;
  const distanceBetween = ctx.distanceBetween;
  const livingEnemies = ctx.livingEnemies;
  const isUnattackable = ctx.isUnattackable;
  const isCharmed = ctx.isCharmed;
  const threatOf = ctx.threatOf;
  const bySide = ctx.bySide;
  const injectEnemySpec = ctx.injectEnemySpec!;
  const castOnTargets = ctx.castOnTargets!;
  const useItem = ctx.useItem!;
  const resolveItemTarget = ctx.resolveItemTarget!;
  const comboOn = ctx.comboOn!;
  let abilitiesHold: AbilityStatus[] | null = null;
  let abilitiesHoldT = -1;
  let abilitiesHoldGcd = -1;
  let abilitiesHoldCast: unknown = null;
  let abilitiesHoldChan: unknown = null;
  let abilitiesHoldForm = 0;
  let abilitiesHoldFocus = '';
  let abilitiesHoldSwing = 0;
  let abilitiesHoldPower = 0;
  let abilitiesHoldCc = 0;
  let allyAbilitiesHold: AbilityStatus[] | null = null;
  let allyAbilitiesHoldKey = '';
  // The loss-of-control mask the strip greys on and the memo keys off. One expression, two readers.
  const ccMaskOf = (u: Fighter): number =>
    (u.stunnedUntil > ctx.t ? 1 : 0)
    | (u.fearedUntil > ctx.t ? 2 : 0)
    | (u.incapUntil > ctx.t ? 4 : 0)
    | (u.silencedUntil > ctx.t ? 8 : 0)
    | (u.disarmedUntil > ctx.t ? 16 : 0)
    | (u.pacifiedUntil > ctx.t ? 32 : 0);

  // EVERY CheckCast gate the action bar shows, for one unit against one focus. `abilities()` is this
  // plus the player memo; `abilitiesFor` is the same answer for a seat that is not the lead.
  const abilityStatusesFor = (unit: Fighter, focus: Fighter): AbilityStatus[] => {
    const cc = ccMaskOf(unit);
    const underCc = cc !== 0;
    const casterPos = posOf(unit.side);
    const focusPos = posOf(focus.side);
    const losOk = !cfg.navLos || navSightClear(cfg, casterPos, focusPos);
    const livingN = (unit === player ? livingEnemies() : ctx.livingHostilesFor(unit)).length;
    const combo = comboOn(unit, focus);
    const list = unit.spec.spells
    .filter((spell) => !(ctx.isTriggeredCompanion as (f: Fighter, s: SpellDef) => boolean)(unit, spell) && !isNonCastableTalentProc(spell))
    .map((spell) => {
    const ownRem = Math.max(0, (unit.cooldowns.get(spell.id) ?? 0) - ctx.t);
    let catRem = 0;
    if (spell.category != null) {
      catRem = Math.max(0, (unit.categoryCooldowns.get(spell.category) ?? 0) - ctx.t);
    }
    const cdRem = displayCooldownMs(unit, spell.id, Math.max(ownRem, catRem));
    const onSwing = !!spell.onNextSwing;
    const armed = onSwing && unit.pendingSwing?.id === spell.id;
    let usable = true; let reason: string | undefined;
    // Breaker usable only under controls it cleanses (WotF under fear, not stun). Cite: KI-741.
    // Skip the effects walk when no CC is on the unit (Firefox 2026-08-23 ZG: isBreaker 30ms self).
    const breaker = underCc && (ctx.isBreaker as (s: SpellDef, f?: Fighter) => boolean)(spell, unit);
    // Loss of control outranks every other reason: hard control greys the whole bar, silence greys the
    // spells it prevents, pacify greys its own, and disarm greys weapon strikes.
    if (!breaker && unit.stunnedUntil > ctx.t) { usable = false; reason = 'stunned'; }
    else if (!breaker && unit.fearedUntil > ctx.t) { usable = false; reason = 'feared'; }
    else if (!breaker && unit.incapUntil > ctx.t) { usable = false; reason = 'incapacitated'; }
    else if (!breaker && unit.silencedUntil > ctx.t && isSilencePrevented(spell)) { usable = false; reason = 'silenced'; }
    else if (!breaker && unit.disarmedUntil > ctx.t && (ctx.isWeaponAction as (s: SpellDef) => boolean)(spell)) { usable = false; reason = 'disarmed'; }
    else if (!breaker && unit.pacifiedUntil > ctx.t && isPacifyPrevented(spell)) { usable = false; reason = 'pacified'; }
    else if (!breaker && (ctx.schoolLocked as (f: Fighter, s: SpellDef) => boolean)(unit, spell)) { usable = false; reason = 'school_lockout'; }
    else if (armed) { usable = false; reason = 'armed'; }                       // this strike is already waiting for your swing
    else if (onSwing && unit.pendingSwing) { usable = false; reason = 'armed'; } // a different on-next-swing is queued
    // A next-swing arm lands in CURRENT_MELEE_SPELL, which breaks nothing and nothing breaks.
    // Cite: Unit.cpp:4207-4272 SetCurrentCastedSpell default case.
    else if (!onSwing && unit.castingSpell && !hasAttrEx4(spell, SPELL_ATTR_EX4.ALLOW_CAST_WHILE_CASTING)) { usable = false; reason = 'casting'; }
    // A channel OCCUPIES the caster for its whole duration. Beginning one sets no cast bar, so nothing
    // here blocked the next cast and a channel was spammable while delivering one tick.
    else if (!onSwing && unit.channeling && ctx.t < unit.channeling.endsAt && !hasAttrEx4(spell, SPELL_ATTR_EX4.ALLOW_CAST_WHILE_CASTING)) { usable = false; reason = 'channeling'; }
    else if ((ctx.spellIncursGcd as (s: SpellDef) => boolean)(spell) && ctx.t < unit.gcdUntil) { usable = false; reason = 'gcd'; }  // only GCD-incurring spells wait for it; off-GCD may fire during
    else if (cdRem > 0) { usable = false; reason = 'cooldown'; }
    else {
      // Form gate before resource (better feedback: "Must be in Cat Form" vs bare "energy").
      const gate = resolveFormCast(spell, unit.form);
      if (!gate.ok) { usable = false; reason = gate.reason; }
      else if (!(ctx.canAfford as (f: Fighter, s: SpellDef) => boolean)(unit, spell)) {
        usable = false;
        const need = spell.powerType === 'health' ? 'health'
          : spell.powerType === 'rage' ? 'rage'
            : spell.powerType === 'energy' ? 'energy'
              : (spell.powerType === 'mana' || isFormSpell(spell) || spell.costPct) ? 'mana'
                : unit.spec.powerType === 'rage' ? 'rage' : unit.spec.powerType === 'energy' ? 'energy' : 'mana';
        reason = need;
      }
      else if (!canPaySpellReagents(unit, spell)) { usable = false; reason = 'reagents'; }
      // The outdoors-only refusal. The bar has to grey it: the cast is already refused, so a lit button
      // under a roof would arm the queue and then do nothing.
      else if (!spellAllowedAtLocation(spell, cfg.outdoors !== false, cfg.battlegroundMap)) {
        usable = false;
        reason = 'wrong location';
      }
      else if (spell.requiresComboPoints && combo <= 0) { usable = false; reason = 'combo points'; }
      // SpellLevel / baseLevel: grey over-level ranks kept in the kit for visibility (KI-641).
      // Cite: Spell.cpp CheckCast SPELL_FAILED_LEVEL_REQUIREMENT.
      else if (((spell.spellLevel ?? spell.reqLevel ?? 0) | 0) > (unit.spec.level | 0)
        && ((spell.spellLevel ?? spell.reqLevel ?? 0) | 0) > 0) {
        usable = false;
        reason = 'level';
      }
      else if (
        // Bow / gun / crossbow shots — Auto Shot (role shoot) and Arcane/Tranq (dmgClass RANGED).
        // Cite: Spell.cpp CheckCast NO_AMMO 6730–6793; weapon.ts rangedStrike ammo gate.
        unit.spec.rangedWeaponSubclass != null
        && (unit.spec.rangedWeaponSubclass === 2 || unit.spec.rangedWeaponSubclass === 3 || unit.spec.rangedWeaponSubclass === 18)
        && (unit.spec.ammoRemaining != null && unit.spec.ammoRemaining <= 0)
        && (roleOf(spell) === 'shoot' || (spell.dmgClass ?? -1) === SPELL_DAMAGE_CLASS.RANGED)
      ) {
        usable = false;
        reason = 'no ammo';
      }
      // Player-only EquippedItem full slot scan (creatures skip — Spell.cpp:6542).
      // Cite: Spell.cpp:6539–6543; Player.cpp:18572 HasItemFitToSpellReqirements; equippedItemGate.ts.
      else {
        const equipReason = (unit === player || isPlayerCharacterTarget(unit))
            ? playerEquippedItemRefuseReason(spell, unit.spec) : undefined;
        if (equipReason) { usable = false; reason = equipReason; }
        else {
          // Ground dest (Blizzard / RoF): no unit target — dest range is checked at place / startOrCast.
          // Cite: SpellEffects.cpp EffectPersistentAA; isGroundTargetedMulti.
          const groundDest = isGroundTargetedMulti(spell);
          // Endless floor: focus is the caster between pulls. Hostile spells need a live foe.
          // Cite: pickAction needsLiveHostile; Spell.cpp SPELL_FAILED_BAD_TARGETS.
          if (!groundDest && isHostileSpellDef(spell) && !isSelfCenteredAoe(spell) && (focus === unit || (dead(focus) && !hasAttrEx2(spell, SPELL_ATTR_EX2.ALLOW_DEAD_TARGET)))) {
            usable = false;
            reason = 'No target';
          } else if (!groundDest && isHostileSpellDef(spell) && !isSelfCenteredAoe(spell) && !spellTargetTypeAllowed(spell, focus.creatureType)) {
            usable = false;
            reason = 'invalid target';
          } else if (
            // The immune refusal, which greys the bar to match the cast gate and includes weapon
            // strikes. A ground rain in a pack can still hit others, so only the 1v1 case is skipped.
            (!groundDest || livingN <= 1)
            && focusImmunityBlocksSpell(spell, focus, livingN)
          ) {
            usable = false;
            reason = 'immune';
          } else if ((ctx.requiresLivingPetTarget as (s: SpellDef) => boolean)(spell) && !(ctx.livingPetOf as (f: Fighter) => Fighter | null)(unit)) {
            usable = false;
            reason = 'invalid target';
          } else {
            const se = (ctx.stealthPosError as (f: Fighter, focus: Fighter, s: SpellDef) => string | null)(unit, focus, spell);
            if (se) { usable = false; reason = se; }
            else if (
              // DG + W13: strip must match canCastSpell / chosenPlayerSpell (range + LOS).
              // A usable:true bar over a refused cast is the classic facade.
              !groundDest
              && (spellNeedsRangeGate(spell) || spellFoeDirectedGeometry(spell))
              && !isInSpellRange(
                distanceBetween(unit, focus),
                spellGateRangeMaxYd(spell), spellGateRangeMinYd(spell),
                ctx.isMoving(unit.side) && ctx.isMoving(focus.side),
                unit.spec.combatReachYd, focus.spec.combatReachYd,
              )
            ) {
              usable = false;
              reason = 'out of range';
            } else if (
              !groundDest
              && cfg.navLos
              && !losOk
              && spellNeedsLosGate(spell)
            ) {
              // The LOS arm used to sit on the else-chain without testing sight, so a
              // hostile ranged spell skipped the reactive/dispel arms below entirely.
              usable = false;
              reason = 'line of sight';
            } else {
              // Reactive windows (Mongoose Bite after self dodge, Overpower after target dodge, …).
              const react = reactiveCastGate(unit, focus, spell, ctx.t)
                ?? targetCastGate(unit, focus, spell, ctx.t);
              if (react) { usable = false; reason = react; }
              else if (isPureDispelSpell(spell)) {
                // Classic pure-DISPEL CheckCast: NOTHING_TO_DISPEL when no matching aura.
                // Cite: Spell.cpp:4890–4919; KI-610 Purge mana sink with empty target.
                const de = firstDispelEffect(spell);
                if (de && ctx.resolveDispelTarget!(unit, focus, de.dispelType) == null) {
                  usable = false;
                  reason = 'nothing to dispel';
                }
              }
            }
          }
        }
      }
    }
    return { spell, usable, reason, cooldownRemainingMs: cdRem, queued: armed };
  });
    return list;
  };

  const pullSpentSpellsFor = ctx.pullSpentSpellsFor;
  const pullSpentItemsFor = ctx.pullSpentItemsFor;
  const push = ctx.push;

  const pruneInterruptClaimsOnCtx = (): void => {
    pruneInterruptClaims(
      ctx.interruptClaim,
      (id) => {
        const f = fighterOfSide(id);
        return !!f && !dead(f);
      },
      (id) => {
        const f = fighterOfSide(id);
        return !!f && f.castingSpell != null;
      },
    );
  };
  const interruptClaimedByOther = (targetId: CombatantId, actorId: CombatantId): boolean => {
    pruneInterruptClaimsOnCtx();
    const owner = ctx.interruptClaim.get(targetId);
    return owner != null && owner !== actorId;
  };
  /** One answer for every seat, player included. See dispelDuty.ts. */
  const dispelClaimedByOther = (
    targetId: CombatantId,
    actorId: CombatantId,
    cat: number,
  ): boolean => dispelClaimedByOtherSeat(ctx, targetId, actorId, cat, dead);

  // Put one step on a friendly seat's cast list — the twin of the move order, where null clears and the
  // queue flag appends. EVERY friendly seat queues here, or the Pre-buff order's own caster cannot cast.
  const queueUnitCast = (side: string, cast: QueuedCast | null, queue = false): boolean => {
    const isPetSide = side === 'pet';
    const isPlayerSide = side === player.side;
    const al = isPetSide ? pet : isPlayerSide ? player : allyUnitOfSide(side);
    if (!isPetSide && !isPlayerSide && !isAllySide(side as Side)) return false;
    if (!al || dead(al)) return false;
    // null = clear, the setMoveOrder(side, null) idiom. Nothing is dropped on the floor: the
    // caller is saying it no longer wants the steps it queued.
    if (cast === null) {
      unitCastOrders.delete(side as Side);
      return true;
    }
    let step = cast;
    const tgt = step.targetSide;
    // An explicit target must be legal NOW or the whole step is refused — a CC menu entry that
    // silently retargets to whatever the AI likes is worse than a dead click.
    if (tgt != null) {
      if (isEnemySide(tgt)) {
        const ef = enemyUnitOfSide(tgt);
        if (!ef || dead(ef) || isUnattackable(ef)) return false;
        // Creature type is the one gate that can NEVER come good, so refuse now rather than hold a step
        // that silently expires. Cooldown, GCD and range are transient and stay in the list.
        const wantId = step.spellId;
        if (wantId != null) {
          const kit = isPetSide ? (al.spec.petFullKit ?? al.spec.spells) : al.spec.spells;
          const sp = kit.find((s) => s.id === wantId);
          if (sp && isHostileSpellDef(sp) && !spellTargetTypeAllowed(sp, ef.creatureType)) return false;
        }
      } else {
        // Friendly aim (Pre-buff): a HoT / shield on a named party member. Without it a
        // non-hostile queued spell is a self-cast, which put the imp's Fire Shield on the imp.
        const ff = resolveItemTarget(tgt as CombatantId);
        if (!ff || dead(ff)) return false;
        // Store the RESOLVED body — resolveItemTarget is what turns a party alias into a side.
        step = { ...step, targetSide: ff.side as Side };
      }
    }
    const list = unitCastOrders.get(side as Side);
    if (queue && list) list.push(step);
    else unitCastOrders.set(side as Side, [step]);
    // The list reports itself. Nothing polls it, and nothing keeps a clock beside it.
    if (step.spellId != null) {
      push({
        t: ctx.t,
        kind: 'cast_order',
        actor: side as Side,
        spellId: step.spellId,
        ...(step.targetSide != null ? { target: step.targetSide } : {}),
        state: 'queued',
      });
    }
    return true;
  };

  /** The four seats a rest, a revive or a BG drink may top up. */
  const restorableUnitOf = (side: string): Fighter | null => {
    if (side === 'player') return player;
    if (side === 'pet') return pet;
    return allyUnitOfSide(side) ?? enemyUnitOfSide(side);
  };
  // Write health, power and the out-of-combat flags, touching nothing IN FLIGHT — the whole difference
  // from the full restore, and why a 500 ms rest tick can run beside a 2 s heal.
  const writeVitals = (side: string, hpPct: number, powerPct: number): Fighter | null => {
    const unit = restorableUnitOf(side);
    if (!unit || !(unit.hp > 0)) return null;
    unit.hp = Math.max(1, Math.round(unit.spec.maxHealth * Math.max(0.01, Math.min(1, hpPct))));
    // Rage empties out of combat; mana/energy refill. Cite: Player.cpp Regenerate / rage decay.
    unit.power = unit.spec.powerType === 'rage'
      ? 0
      : Math.round(unit.spec.maxPower * Math.max(0, Math.min(1, powerPct)));
    // The endless floor keeps ONE session per run, so chargeUsed held Charge to once per DUNGEON
    // instead of once per pull (operator 2026-08-06 evening).
    unit.chargeUsed = false;
    unit.combatUntil = 0;
    unit.combatEnteredAt = 0; // full OOC after rest — Charge / Stealth legal again
    // Do NOT clear move orders. The out-of-combat refill ran every few seconds while walking, and
    // deleting them made the floor treat mid-corridor as arrival, then aggro the boss from across the map.
    invalidateViewMemo();
    return unit;
  };

  return {
    get events() { return ctx.events; },
    /** Rows the ring has discarded. `absoluteIndex - eventsDropped` = index into `events`. */
    get eventsDropped() { return ctx.eventsDropped ?? 0; },
    get t() { return ctx.t; },
    get ended() { return ctx.ended; },
    get winner() { return ctx.winner; },
    get aiPlayer() { return ctx.aiPlayer; },
    set aiPlayer(v: boolean) { ctx.aiPlayer = v; },
    playerView: () => memoView(player),
    // Focus target (not always enemies[0]). After a pack member dies, auto-retarget so the
    // unit frame / rotation see the living foe instead of a 0 HP corpse that "won't die".
    enemyView: () => memoView(ensurePlayerFocus()),
    // Advertised charm occupies the pet bar (Enslave Demon thrall). Cite: Unit.cpp:11328
    // TakeCharmOf UnsummonPetTemporaryIfAny + CharmSpellInitialize; KI-896.
    petView: () => {
      const thrall = ctx.livingEnemies().find(
        (e) => ctx.isCharmed(e) && e.charmedBy === 'player',
      );
      if (thrall) return memoView(thrall);
      return pet ? memoView(pet) : null;
    },
    alliesView: () => alliesView(),
    // The view row for ONE seat, or null — the same memoized object the list views hand out, found
    // through the store instead of by scanning. Eleven UI sites scanned the whole raid per row per frame.
    viewOfSide: (side: string): CombatantView | null => {
      const unit = ctx.sideFighter?.(side as Side) ?? null;
      return unit ? memoView(unit) : null;
    },
    totemsView: (): TotemView[] => {
      const out: TotemView[] = [];
      // Every seat the party holds, not four: each shaman owns its own four (Unit.h:2625).
      for (const tot of totems.values()) {
        const slot = tot.totemSlot;
        if (!slot || dead(tot)) continue;
        // Real kit auras this totem grants right now — what the UI shows instead of a phantom chip.
        const auras = totemGrantedAuras(ctx.effectsOn('player'), tot.side as TotemSide, ctx.t);
        const side = tot.side as TotemSide;
        const ownerSide = tot.totemOwnerSide ?? totemOwnerMeta.get(side)?.ownerSide ?? 'player';
        // The ground this totem covers, stamped at summon from the whole kit. `auras` is
        // party-facing only, and `spec.spells` holds TotemAI casts only (empty for passives).
        const auraRadiusYd = tot.totemAuraRadiusYd ?? 0;
        out.push({
          slot,
          side,
          name: tot.spec.name,
          hp: Math.max(0, Math.round(tot.hp)),
          maxHp: tot.spec.maxHealth,
          remainingMs: tot.totemExpiresAt != null ? Math.max(0, Math.round(tot.totemExpiresAt - ctx.t)) : 0,
          ...(tot.totemSummonSpellId ? { summonSpellId: tot.totemSummonSpellId } : {}),
          ownerSide,
          ...(auras.length ? { auras } : {}),
          ...(auraRadiusYd > 0 ? { auraRadiusYd } : {}),
          casting: tot.castingSpell
            ? { spellId: tot.castingSpell.id, name: tot.castingSpell.name, startedAt: tot.castStartedAt, endsAt: tot.castFinishAt }
            : null,
        });
      }
      return out;
    },
    trapsView: (): TrapView[] => {
      const out: TrapView[] = [];
      const now = ctx.t;
      for (const u of ctx.fightersOrder()) {
      for (const e of ctx.effectsOn(u.side)) {
        if (!isHunterTrapArmProc(e) || e.expiresAt <= now) continue;
        if (e.charges != null && e.charges <= 0) continue;
        const pos = e.trapPosYd ?? posOf?.(e.target);
        out.push({
          spellId: e.spellId,
          name: e.name,
          remainingMs: Number.isFinite(e.expiresAt) ? Math.max(0, Math.round(e.expiresAt - now)) : 0,
          radiusYd: HUNTER_TRAP_RADIUS_YD,
          ownerSide: e.target,
          triggerSpellId: e.triggerSpellId ?? 0,
          ...(pos ? { pos: { x: pos.x, y: pos.y, ...(pos.z != null ? { z: pos.z } : {}) } } : {}),
        });
      }
      }
      return out;
    },
    /** Totem→owner map for meter merge; includes despawned totems this fight. */
    totemOwners: (): Array<{ side: TotemSide; ownerSide: Side; name: string }> =>
      [...totemOwnerMeta.entries()].map(([side, m]) => ({ side, ownerSide: m.ownerSide, name: m.name })),
    // A companion pet mapped to its owner, off the roster's own field. It replaces a parallel array of
    // seat INDICES keyed by seat index, which ten readers had to hop through and three had to parse.
    companionPets: (): Array<{ side: Side; ownerSide: Side; name: string }> => {
      const out: Array<{ side: Side; ownerSide: Side; name: string }> = [];
      for (const a of ctx.allyBlock()) {
        const petSide = a.spec.petSide;
        if (petSide == null) continue;
        const petUnit = ctx.sideFighter?.(petSide);
        out.push({ side: petSide, ownerSide: a.side, name: petUnit?.spec.name ?? 'Pet' });
      }
      return out;
    },
    hasTotem: (slot: TotemSlot, owner: Side = 'player') => {
      const tot = totems.get(sideForTotemSlot(slot, owner));
      return !!(tot && !dead(tot));
    },
    unsummonAllTotems: (reason: 'owner' | 'expire' | 'zone', owner?: Side): void => {
      ctx.unsummonAllTotems?.(reason, owner);
    },
    // The player kit strip: only castable parents. Trigger and proc payloads are re-attached for lookup
    // but must never surface as free castables, and free talent procs stay off the bar too.
    abilities: (): AbilityStatus[] => {
      const focus = ensurePlayerFocus();
      const power = player.power;
      const cc = ccMaskOf(player);
      if (
        abilitiesHold
        && abilitiesHoldT === ctx.t
        && abilitiesHoldGcd === player.gcdUntil
        && abilitiesHoldCast === player.castingSpell
        && abilitiesHoldChan === player.channeling
        && abilitiesHoldForm === (player.form ?? 0)
        && abilitiesHoldFocus === focus.side
        && abilitiesHoldSwing === (player.pendingSwing?.id ?? 0)
        && abilitiesHoldPower === power
        && abilitiesHoldCc === cc
      ) return abilitiesHold;
      const list = abilityStatusesFor(player, focus);
      abilitiesHold = list;
      abilitiesHoldT = ctx.t;
      abilitiesHoldGcd = player.gcdUntil;
      abilitiesHoldCast = player.castingSpell;
      abilitiesHoldChan = player.channeling;
      abilitiesHoldForm = player.form ?? 0;
      abilitiesHoldFocus = focus.side;
      abilitiesHoldSwing = player.pendingSwing?.id ?? 0;
      abilitiesHoldPower = power;
      abilitiesHoldCc = cc;
      return list;
    },
    // The same strip for ANY seat: a non-lead ally, or the `enemy` lead of the other team. No memo,
    // for the reason `rotationSnapshot` has none — the pinned-target form is not one key.
    abilitiesFor: (side: string, targetSide?: string | null): AbilityStatus[] => {
      const f = fighterOfSide(side);
      if (!f) return [];
      let foe: Fighter | null = null;
      if (targetSide != null) {
        const cand = fighterOfSide(targetSide);
        if (cand && !dead(cand)) foe = cand;
      }
      // The player seat keeps its own resolver, so this and `abilities()` answer for the same body.
      if (!foe) {
        foe = f === player ? ensurePlayerFocus()
          : isEnemySide(f.side) ? hostileTargetOf(f) : foeOf(f);
      }
      return abilityStatusesFor(f, foe);
    },
    items: () => playerItems.map((it) => {
      const cdRem = Math.max(0, (itemCd.get(it.entry) ?? 0) - ctx.t);
      const catRem = (it.category != null && it.categoryCooldownMs != null && it.categoryCooldownMs > 0)
        ? Math.max(0, (player.categoryCooldowns.get(it.category) ?? 0) - ctx.t)
        : 0;
      let usable = true; let reason: string | undefined;
      if (it.count <= 0) { usable = false; reason = 'none left'; }
      else if (player.castingSpell) { usable = false; reason = 'casting'; }
      else if (cdRem > 0 || catRem > 0) { usable = false; reason = 'cooldown'; }
      return { item: it, usable, reason, cooldownRemainingMs: Math.max(cdRem, catRem), count: it.count };
    }),
    tick: (action, inputs) => step(action, inputs),
    // The two halves of the seam a pump needs off this side: replay what a far tick recorded, and
    // build what the next far tick reads (sessionStepWrap.ts:85 is the on-thread twin of both).
    applySimEffect: (effect) => { ctx.cfg.applyEffect?.(effect); },
    tickInputsNow: () => ctx.cfg.tickInputs?.(),
    runToEnd: () => { ctx.aiPlayer = true; let guard = 0; while (!ctx.ended && guard++ < 100000) step(); finalize(); return result(); },
    result,
    cooldownRemainingMs: (id: number) => displayCooldownMs(
      player, id, Math.max(0, (player.cooldowns.get(id) ?? 0) - ctx.t),
    ),
    categoryCooldownRemainingMs: (c: number) => Math.max(0, (player.categoryCooldowns.get(c) ?? 0) - ctx.t),
    cooldownSnapshot: (side?: Side) => {
      const spell: Record<number, number> = {};
      const category: Record<number, number> = {};
      // Any friendly body, not just the player: a companion's Bloodlust or a pet's Dash has to
      // leave the session on the world clock or the next pull re-arms the whole squad's kit.
      const unit = side == null || side === 'player'
        ? player
        : side === 'pet' ? pet
        : allyUnitOfSide(side);
      if (!unit) return { spell, category };
      // A cooldown-on-event entry is the permanent sentinel while its aura is up. Leaving the session
      // ends that aura, so the real timer is what leaves with the unit — and infinity would save as null.
      unit.cooldowns.forEach((ready, id) => {
        const r = Number.isFinite(ready)
          ? Math.max(0, ready - ctx.t)
          : (unit.deferredCooldowns?.get(id) ?? 0);
        if (r > 0) spell[id] = r;
      });
      unit.categoryCooldowns.forEach((ready, c) => {
        let r = Math.max(0, ready - ctx.t);
        if (!Number.isFinite(ready)) {
          r = 0;
          for (const pending of unit.deferredCategoryCooldowns?.values() ?? []) {
            if (pending.category === c) r = Math.max(r, pending.ms);
          }
        }
        if (r > 0) category[c] = r;
      });
      return { spell, category };
    },
    enemyThreatList: (ownerId?: CombatantId) => {
      // Threat lists exist only on enemy owners, and a possessed ally is not one. With no primary — a
      // floor session between pulls — there is no default owner and so no list.
      const id = ownerId ?? enemy?.side;
      if (id == null || !isEnemySide(id)) return [];
      const tm = threatOf(id);
      return tm ? tm.getThreatList() : [];
    },
    enemyThreatVictim: (ownerId?: CombatantId) => {
      // The autopilot may pass a focus that is a possessed ally, since focus prefers a charmed
      // friendly. A missing manager reads null and never throws — only enemy sides own one.
      const id = ownerId ?? enemy?.side;
      if (id == null || !isEnemySide(id)) return null;
      const tm = threatOf(id);
      return tm ? tm.getCurrentVictimId() : null;
    },
    enemiesView: () => enemiesView(),
    livingEnemiesView: () => livingEnemies().map((ef) => memoView(ef)),
    /** Geometry v2.1b: live position snapshot (undefined when no-geometry session). */
    unitPosYd: (side: Side | string): CombatPosYd | undefined => posOf(side),
    /** The heading the unit is actually facing - the same `facingOf` the dodge/parry arc reads
     *  (sessionGeometry.ts:94). Undefined on a session with no geometry. */
    unitFacing: (side: Side | string): number | undefined => {
      const f = fighterOfSide(side);
      return f ? ctx.facingOf?.(f) : undefined;
    },
    // The per-tick payload channel (PERF-RUNSHEET S6). The same two reads as `unitPosYd` and
    // `unitHpPct` over the whole roster in one pass, written into the caller's buffer.
    mirrorPoseFrame: (frame: SimPoseFrame): void => {
      let poolMoved = false;
      for (let i = 0; i < frame.sides.length; i++) {
        const side = frame.sides[i]!;
        const o = i * POSE_STRIDE;
        const x = frame.buf[o]!;
        if (!Number.isNaN(x)) {
          const z = frame.buf[o + 2]!;
          setPos(side, Number.isNaN(z) ? { x, y: frame.buf[o + 1]! } : { x, y: frame.buf[o + 1]!, z });
        }
        const pct = frame.buf[o + 3]!;
        const unit = fighterOfSide(side);
        if (!unit || Number.isNaN(pct)) continue;
        const hp = Math.round(unit.spec.maxHealth * (pct / 100));
        if (hp === unit.hp) continue;
        // Crossing zero either way is pool membership (sessionPools.ts living* walks).
        if ((hp > 0) !== (unit.hp > 0)) poolMoved = true;
        unit.hp = hp;
      }
      if (poolMoved) ctx.bumpPool?.();
      invalidateViewMemo();
    },
    // The far side is the authority for what the fight DID, so its verdict lands here rather than
    // being re-derived: this copy's death sweep never ran (mirrorPoseFrame only writes hp).
    mirrorOutcome: (isEnded: boolean, who: Side | 'timeout' | null): void => {
      let moved = false;
      if (isEnded && !ctx.ended) { ctx.ended = true; moved = true; }
      if (who != null && ctx.winner == null) { ctx.winner = who; moved = true; }
      // Only when something actually changed: this runs on every drained reply, and dropping the
      // memo per tick rebuilt every view and cost the log and the icons their smoothness.
      if (moved) invalidateViewMemo();
    },
    poseFrame: (filler: PoseFiller): SimPoseFrame => fillPoseFrame(
      filler,
      ctx.allSeats(),
      ctx.unitPositionsMutable,
      (side) => posOf(side),
      (side) => fighterOfSide(side) ?? undefined,
    ),
    /** Live hp 0..100 for the Recoil hp-fill lerp — a raw fighter read, no view build. */
    unitHpPct: (side: Side | string): number | undefined => {
      const f = fighterOfSide(side);
      if (!f || !(f.spec.maxHealth > 0)) return undefined;
      return Math.max(0, Math.min(100, (f.hp / f.spec.maxHealth) * 100));
    },
    /** Live DynamicObject ground pools for stage / tactical discs. */
    groundPools: () => ctx.groundPools.map((p) => ({
      id: p.id,
      spellId: p.spellId,
      name: p.name,
      school: p.school,
      ...(p.radius != null ? { radius: p.radius } : {}),
      ...(p.origin ? { origin: { ...p.origin } } : {}),
      expiresAt: p.expiresAt,
      source: p.source,
    })),
    /** In-flight SpellEntry.speed missiles for stage VFX (empty without geometry). */
    missilesInFlight: () => {
      const list = ctx.pendingMissiles;
      if (!list.length) return [];
      return list.map((m) => ({
        launchAt: m.launchAt,
        landAt: m.landAt,
        casterSide: m.casterSide,
        targetSide: m.targetSide,
        spellId: m.spell.id,
        ...(m.school ? { school: m.school } : {}),
      }));
    },
    /** Per-side motion-resolution tally — diagnosis surface, empty until motion runs. */
    navDiag: (): Record<string, Record<string, number>> =>
      Object.fromEntries(ctx.navDiag ?? new Map()),
    /** The gate that resolved this unit's motion last tick — null until motion has run. */
    motionExplain: (side: string): MotionGateReport | null =>
      ctx.motionGates?.read(side) ?? null,
    motionExplainAll: (): Record<string, MotionGateReport> =>
      ctx.motionGates?.all() ?? {},
    /** C2 SlowUpdate think/skip tallies. */
    slowDiag: () => ctx.slowDiag ?? {
      pickThink: 0, pickSkip: 0, eventAiThink: 0, eventAiSkip: 0,
      areaAuraRadius: 0, areaAuraSkip: 0,
    },
    // Which frame the offsets live in, so a renderer knows whether origin plus offset is a real world
    // position. Undefined when the session was created without geometry — never guess for a fixture.
    geometryAnchor: (): PullGeometryAnchor | undefined =>
      ctx.unitPositionsMutable ? (cfg.geometryAnchor ?? { frame: 'pull-local' }) : undefined,
    /** Reposition a unit; number = pull-axis yards → {x:n,y:0}. No-op without geometry. */
    setUnitPosYd: (side: Side | string, pos: CombatPosYd | number): void => {
      const p: CombatPosYd = typeof pos === 'number' ? { x: pos, y: 0 } : pos;
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
      const targetPos: CombatPosYd = p.z != null && Number.isFinite(p.z)
        ? { x: p.x, y: p.y, z: p.z }
        : { x: p.x, y: p.y };
      setPos(side, targetPos);
      // A repositioned friendly holds ITS NEW ground (revive / world resync).
      if (cfg.friendlyHoldYd != null && !isEnemySide(side)) {
        unitAnchors.set(side, { x: p.x, y: p.y });
      }
      // A teleported enemy (scripted move / BG resync) evades to where it was PUT, not to the
      // room it came from. Cite: Creature.h:834-835 SetRespawnCoord on a relocation.
      if (isEnemySide(side)) {
        const at = posOf(side);
        if (at) ctx.enemyHomeYd?.set(side, { ...at });
      }
    },
    setUnitAnchor: (side: string, pos: CombatPosYd): void => {
      if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return;
      unitAnchors.set(side, { x: pos.x, y: pos.y });
    },
    // One companion's castable kit with live usability for the takeover bar. Leaner than the player
    // pipeline — no equipped-item or stealth nuances — and the cast gate is the same final one.
    allyAbilities: (allySide: string, targetSide?: string | null): AbilityStatus[] => {
      const al = allyUnitOfSide(allySide);
      if (!al) return [];
      const holdKey = `${allySide}|${targetSide ?? ''}|${ctx.t}|${al.gcdUntil}|${al.castingSpell?.id ?? 0}|${al.form ?? 0}`;
      if (allyAbilitiesHold && allyAbilitiesHoldKey === holdKey) return allyAbilitiesHold;
      // A named target asks "can this companion cast X at THAT mob", which is a different question
      // from "at whatever it is fighting". The cast gate then applies the type mask for real.
      const named = targetSide != null ? enemyUnitOfSide(targetSide) : null;
      if (targetSide != null && (!named || dead(named) || isUnattackable(named))) return [];
      const foe = named ?? foeOf(al);
      const out = al.spec.spells
        .filter((spell) => !(ctx.isTriggeredCompanion as (f: Fighter, s: SpellDef) => boolean)(al, spell))
        .map((spell) => {
          const ownRem = Math.max(0, (al.cooldowns.get(spell.id) ?? 0) - ctx.t);
          const catRem = spell.category != null
            ? Math.max(0, (al.categoryCooldowns.get(spell.category) ?? 0) - ctx.t)
            : 0;
          const cdRem = displayCooldownMs(al, spell.id, Math.max(ownRem, catRem));
          let usable = true;
          let reason: string | undefined;
          if ((ctx.isControlledHard as ((u: Fighter) => boolean) | undefined)?.(al)) {
            usable = false; reason = 'controlled';
          }
          // Same CheckCast gates as the player bar — a silenced companion greys its casts.
          else if (al.silencedUntil > ctx.t && isSilencePrevented(spell)) { usable = false; reason = 'silenced'; }
          else if (al.pacifiedUntil > ctx.t && isPacifyPrevented(spell)) { usable = false; reason = 'pacified'; }
          else if ((ctx.schoolLocked as (f: Fighter, s: SpellDef) => boolean)(al, spell)) { usable = false; reason = 'school_lockout'; }
          else if (!spell.onNextSwing && al.castingSpell && !hasAttrEx4(spell, SPELL_ATTR_EX4.ALLOW_CAST_WHILE_CASTING)) { usable = false; reason = 'casting'; }
          else if (!spell.onNextSwing && al.channeling && ctx.t < al.channeling.endsAt && !hasAttrEx4(spell, SPELL_ATTR_EX4.ALLOW_CAST_WHILE_CASTING)) { usable = false; reason = 'channeling'; }
          else if ((ctx.spellIncursGcd as (s: SpellDef) => boolean)(spell) && ctx.t < al.gcdUntil) { usable = false; reason = 'gcd'; }
          else if (cdRem > 0) { usable = false; reason = 'cooldown'; }
          else if (!(ctx.canCastSpell as (f: Fighter, tgt: Fighter, s: SpellDef) => boolean)(al, foe, spell)) {
            usable = false; reason = 'unusable';
          }
          return { spell, usable, reason, cooldownRemainingMs: cdRem, queued: false };
        });
      allyAbilitiesHold = out;
      allyAbilitiesHoldKey = holdKey;
      return out;
    },
    /** Direct one companion's hostile actions at a specific enemy (null = release to AI). */
    setAllyTarget: (allySide: string, targetSide: string | null, opts?: { skipMove?: boolean }): boolean => {
      const al = allyUnitOfSide(allySide);
      if (!al) return false;
      if (targetSide == null) {
        allyManualTarget.delete(allySide as Side);
        return true;
      }
      const ef = enemyUnitOfSide(targetSide);
      if (!ef || dead(ef) || isUnattackable(ef)) return false;
      allyManualTarget.set(allySide as Side, targetSide as EnemySide);
      if (opts?.skipMove) return true;
      const dest = posOf(targetSide);
      // The ORDERED ally, not the player: measuring from the player's body issued no path at all
      // when the player already stood in melee of the mob, so "send this one in" did nothing.
      const from = posOf(allySide) ?? posOf('player');
      if (dest && from) {
        const planar = detHypot(dest.x - from.x, dest.y - from.y);
        const floorOk = dest.z == null || from.z == null || Math.abs(dest.z - from.z) <= 4;
        if (planar > MELEE_REACH_YD + MELEE_PARK_SLACK_YD || !floorOk) {
          const q = unitMoveOrders.get(allySide)?.[0];
          const already = q != null && detHypot(q.x - dest.x, q.y - dest.y) <= 8 + MELEE_REACH_YD
            && (dest.z == null || q.z == null || Math.abs(q.z - dest.z) <= 4);
          if (!already) {
            ctx.pathTo?.(allySide, dest, {
              keepFocus: true,
              standShortYd: standShortYdFor(al.spec.standYards),
            });
          }
        }
      }
      return true;
    },
    /** Mid-fight role stamp — groupRole + stand + decideDirty (+ optional provider swap). */
    setAllyGroupRole: (
      allySide: string,
      role: GroupRole,
      provider?: AllyActionProvider | null,
    ): boolean => {
      if (!isAllySide(allySide as Side)) return false;
      if (role !== 'tank' && role !== 'healer' && role !== 'damage') return false;
      const al = allyUnitOfSide(allySide);
      if (!al) return false;
      al.spec.groupRole = role;
      // Motion closes to standYards; restamp so tank holds melee and healer parks back.
      al.spec.standYards = resolveStandYards({
        groupRole: role,
        classId: al.spec.classId,
        rangedAuto: al.spec.rangedAuto,
      });
      al.decideDirty = true;
      // One seat write. This used to COPY the whole seat-indexed cfg array, pad it out to the
      // seat with undefined, and write the slot (E1.1).
      if (provider !== undefined) {
        if (provider) ctx.unitActionProvider.set(al.side, provider);
        else ctx.unitActionProvider.delete(al.side);
      }
      invalidateViewMemo();
      return true;
    },
    // Latch the pet's standing kill-target (or null to release). Does not flip Follow/Stay. A player-only
    // retarget uses this so owner-assist does not drag the pet onto the new focus.
    setPetTarget: (targetSide: string | null): boolean => {
      if (!pet || dead(pet)) return false;
      if (targetSide == null) {
        ctx.petManualTarget = null;
        return true;
      }
      const ef = enemyUnitOfSide(targetSide);
      if (!ef || dead(ef) || isUnattackable(ef)) return false;
      ctx.petManualTarget = targetSide as EnemySide;
      return true;
    },
    // The pet bar commands. Attack sends the pet at a named enemy, defaulting to the player's focus as
    // the bare button does, while follow and stay release the victim and take over its motion.
    setPetCommand: (cmd: 'attack' | 'follow' | 'stay', targetSide?: string | null): boolean => {
      if (!pet || dead(pet)) return false;
      if (cmd === 'attack') {
        // RESOLVE the focus, never read the raw field: it holds the player itself as the stand-down
        // sentinel and may sit on a corpse, so a bare Attack read a non-enemy side and refused.
        let want = targetSide ?? null;
        if (want == null) {
          const focus = ensurePlayerFocus();
          if (isEnemySide(focus.side)) want = focus.side;
          else {
            const own = ctx.freeFireHostilesFor!(pet).find((h) => !dead(h) && !isUnattackable(h))
              ?? ctx.livingHostilesFor(pet).find((h) => !dead(h) && !isUnattackable(h));
            want = own && isEnemySide(own.side) ? own.side : null;
          }
        }
        if (want == null) return false;
        const ef = enemyUnitOfSide(want);
        if (!ef || dead(ef) || isUnattackable(ef)) return false;
        ctx.petManualTarget = want as EnemySide;
        ctx.petCommand = 'attack';
        // An Attack order cancels a recall in progress (PetHandler.cpp:190 SetIsRetreating()).
        ctx.petRetreating = false;
        // Attack while passive is a legal order and does NOT change the react state
        // (PetAI.cpp:480 only gates the unprompted fight-back).
        return true;
      }
      ctx.petManualTarget = null;
      ctx.petCommand = cmd;
      // Follow is a RECALL: it holds the pet off every victim until it is back at heel, which is the
      // only reason the button does anything mid-fight. Stay just stops where it is.
      ctx.petRetreating = cmd === 'follow';
      // The stay spot is wherever the pet stands when the order lands (UpdateStayPosition);
      // motion stamps it if geometry is not up yet.
      ctx.petStayPos = cmd === 'stay' ? (posOf('pet') ?? null) : null;
      // Follow/Stay drop the current victim the way COMMAND_FOLLOW does (AttackStop).
      unitMoveOrders.delete('pet');
      unitMoveIntents.delete('pet');
      unitManualMotion.delete('pet');
      ctx.unitHoldCourse?.delete('pet');
      ctx.unitDirectMove?.delete('pet');
      // The attack stop interrupts what it was doing. Without this the recall stalls on its own cast,
      // since motion's first guard is the cast bar and a channel holds still.
      if (pet.castingSpell) {
        pet.castingSpell = null;
        pet.castStartedAt = 0;
        pet.castFinishAt = 0;
      }
      if (pet.channeling) interruptChannel(pet, channelInterruptCtx(ctx), { quiet: true });
      pet.pendingCharge = null;
      return true;
    },
    /** Pet bar react state (PetActionButton slots 8-10). Cite: UnitAI.h:81-86 ReactStates. */
    setPetReact: (react: 'aggressive' | 'defensive' | 'passive'): boolean => {
      if (!pet || dead(pet)) return false;
      ctx.petReact = react;
      // Going passive is also a stand-down: it drops the victim it was told to keep.
      if (react === 'passive') ctx.petManualTarget = null;
      return true;
    },
    petBarState: () => ({
      command: ctx.petCommand,
      react: ctx.petReact,
      targetSide: ctx.petManualTarget,
      /** Recall in progress — the pet is walking home and will not fight until it arrives. */
      retreating: ctx.petRetreating,
      /** Ability ids the pet KNOWS, and which of them the AI is currently allowed to pick. */
      kit: (pet?.spec.petFullKit ?? pet?.spec.spells ?? []).map((s) => {
        // Same max(own, category) the player's own bar reads, off the PET's maps - the bar
        // had no cooldown source at all, so Dash and Growl drew as ready mid-recovery.
        const ownRem = pet ? Math.max(0, (pet.cooldowns.get(s.id) ?? 0) - ctx.t) : 0;
        const catRem = (pet && s.category != null)
          ? Math.max(0, (pet.categoryCooldowns.get(s.category) ?? 0) - ctx.t)
          : 0;
        return {
          id: s.id,
          autocast: (pet?.spec.spells ?? []).some((k) => k.id === s.id),
          cooldownRemainingMs: pet ? displayCooldownMs(pet, s.id, Math.max(ownRem, catRem)) : 0,
          cooldownMs: s.cooldownMs || 0,
        };
      }),
    }),
    // A pet ability slot, right-clicked: flip autocast for THIS fight. The kit is read off the spec, so
    // the toggle has to move the entry in and out of that array or a mid-fight flip is inert.
    setPetAutocast: (spellId: number, on: boolean): boolean => {
      if (!pet || dead(pet)) return false;
      const full = pet.spec.petFullKit ?? pet.spec.spells;
      const def = full.find((s) => s.id === spellId);
      if (!def) return false;
      const live = pet.spec.spells;
      const at = live.findIndex((s) => s.id === spellId);
      if (on && at < 0) {
        // Back in the kit in its authored order, so pick priority does not depend on
        // the order the player happened to click the buttons.
        const want = full.findIndex((s) => s.id === spellId);
        const before = live.findIndex((s) => full.findIndex((k) => k.id === s.id) > want);
        live.splice(before < 0 ? live.length : before, 0, def);
      } else if (!on && at >= 0) {
        live.splice(at, 1);
      }
      return true;
    },
    // A pet ability slot, left-clicked: cast it NOW on the pet's current victim. An autocast-off
    // ability is castable this way, which is the whole point of the client's left click.
    queuePetAction: (spellId: number): boolean => {
      if (!pet || dead(pet)) return false;
      const full = pet.spec.petFullKit ?? pet.spec.spells;
      const def = full.find((s) => s.id === spellId);
      if (!def) return false;
      unitCastOrders.set('pet' as Side, [{ spellId }]);
      // Hostile bar clicks need a victim. foeOf(self) is the OOC sentinel and
      // canCastSpell refuses it, so the queue sat armed and the button did nothing.
      if (isHostileSpellDef(def) && !isSelfCenteredAoe(def)) {
        const cur = ctx.foeOf?.(pet);
        if (!cur || cur === pet || dead(cur)) {
          let want: string | null = null;
          const focus = ensurePlayerFocus();
          if (isEnemySide(focus.side)) want = focus.side;
          else {
            const own = ctx.freeFireHostilesFor!(pet).find((h) => !dead(h) && !isUnattackable(h))
              ?? ctx.livingHostilesFor(pet).find((h) => !dead(h) && !isUnattackable(h));
            want = own && isEnemySide(own.side) ? own.side : null;
          }
          const ef = want != null ? enemyUnitOfSide(want) : null;
          if (ef && !dead(ef) && !isUnattackable(ef)) ctx.petManualTarget = want as EnemySide;
        }
      }
      return true;
    },
    // A click-to-move order: walk a friendly unit to a combat-yard point, outranking gap-close until
    // arrival. Null clears it, and it is a no-op without geometry or for an enemy or dead side.
    setMoveOrder: (
      side: string,
      pos: CombatPosYd | null,
      queue = false,
      opts?: { keepFocus?: boolean; keepTravel?: boolean; holdCourse?: boolean; direct?: boolean },
    ): boolean => {
      if (!ctx.unitPositionsMutable) return false;
      const unit = partyUnitOfSide(side);
      if (!unit || dead(unit)) return false;
      if (pos == null) {
        // Stop / ground-clear cancels a kill-target the way an RTS does — not a queued append.
        if (!queue && !opts?.keepFocus) {
          if (side === 'player') ctx.explicitEnemyFocus = null;
          else if (isAllySide(side as Side)) allyManualTarget.delete(side as Side);
        }
        unitMoveOrders.delete(side);
        ctx.unitHoldCourse?.delete(side);
        ctx.unitDirectMove?.delete(side);
        // Stop is a release, not a refusal: whoever held motion no longer does.
        ctx.motionClaims?.breakAll(side);
        const cur = posOf(side);
        if (cfg.friendlyHoldYd != null && cur) unitAnchors.set(side, { x: cur.x, y: cur.y });
        return true;
      }
      if (!ctx.pathTo) return false;
      return ctx.pathTo(side, pos, {
        queue,
        keepFocus: opts?.keepFocus,
        holdCourse: opts?.holdCourse,
        direct: opts?.direct,
      });
    },
    pathTo: (side, dest, opts) => ctx.pathTo?.(side, dest, opts) ?? false,
    motionOwnerOf: (side: string): string | null => ctx.motionClaims?.ownerOf(side, ctx.t) ?? null,
    motionClaimStats: () => ({
      refused: ctx.motionClaims?.refused() ?? 0,
      reaimsKept: ctx.motionClaims?.reaimsKept() ?? 0,
      handovers: ctx.motionClaims?.handovers() ?? 0,
    }),
    standShortYd: (side: string): number => {
      if (side === 'player') return standShortYdFor(player.spec.standYards);
      if (side === 'pet') return CORRIDOR_STAND_SHORT_YD;
      const a = allyUnitOfSide(side);
      if (a) return standShortYdFor(a.spec.standYards);
      return CORRIDOR_STAND_SHORT_YD;
    },
    /** Current manual move dest for a side, or null when AI motion drives. */
    moveOrderOf: (side: string): CombatPosYd | null =>
      unitMoveOrders.get(side)?.[0] ?? null,
    holdCourseOf: (side: string): boolean => ctx.unitHoldCourse?.has(side) === true,
    noteRuleAfter: (side: string, after: RuleAfter | null | undefined): void => {
      if (!after) return;
      const unit = partyUnitOfSide(side);
      if (!unit) return;
      applyRuleAfter(unit, after, ctx.t);
    },
    armRuleAfter: (side: string, spellId: number, after: RuleAfter | null | undefined): void => {
      const unit = partyUnitOfSide(side);
      if (!unit) return;
      armRuleAfter(unit, spellId, after);
    },
    stepBackActive: (side: string): boolean => {
      const unit = partyUnitOfSide(side);
      return !!unit && isStepBackWalking(unit);
    },
    consumeFollowUp: (side: string, pickedSpellId: number): void => {
      const unit = partyUnitOfSide(side);
      if (!unit) return;
      consumeFollowUp(unit, pickedSpellId, ctx.t);
    },
    // Snap combat yards to walkable floor, null when there is none within radius. A reference z
    // restricts the answer to that floor and reports its height back; without it the search is planar.
    snapMoveDest: (
      pos: CombatPosYd,
      radiusYd = 20,
      refZ?: number | null,
    ): CombatPosYd | null => {
      if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return null;
      if (!ctx.unitPositionsMutable) return { x: pos.x, y: pos.y };
      return snapToMesh(pos, radiusYd > 0 ? radiusYd : 20, refZ ?? pos.z ?? null);
    },
    // Held-direction locomotion. The vector is normalised so a diagonal is not faster than a cardinal,
    // and it outranks a queued click route while latching ownership, so letting go leaves it standing.
    setMoveIntent: (side: string, dir: { x: number; y: number } | null): boolean => {
      if (!ctx.unitPositionsMutable) return false;
      const unit = partyUnitOfSide(side);
      if (!unit || dead(unit)) return false;
      if (dir == null) {
        unitMoveIntents.delete(side);
        return true;
      }
      if (!Number.isFinite(dir.x) || !Number.isFinite(dir.y)) return false;
      const len = detHypot(dir.x, dir.y);
      if (!(len > 1e-6)) {
        unitMoveIntents.delete(side);
        return true;
      }
      unitMoveIntents.set(side, { x: dir.x / len, y: dir.y / len });
      unitManualMotion.add(side);
      unitMoveOrders.delete(side);
      ctx.unitHoldCourse?.delete(side);
      ctx.unitDirectMove?.delete(side);
      // WASD / stick is a plain "go now" — cancel the cast the same way a ground click does.
      cancelCastForMove(unit);
      if (side === 'player') ctx.explicitEnemyFocus = null;
      else if (isAllySide(side as Side)) allyManualTarget.delete(side as Side);
      return true;
    },
    moveIntentOf: (side: string): CombatPosYd | null => unitMoveIntents.get(side) ?? null,
    // Who the player is driving as one unit. The `partyFollowYd` bubble tows only these sides, and only
    // while the player's own body is among them; null hands every side back to the default.
    setFollowGroup: (sides: readonly string[] | null): boolean => {
      ctx.followGroupSides = sides ? new Set(sides) : undefined;
      return true;
    },
    followGroupOf: (): readonly string[] | null =>
      (ctx.followGroupSides ? [...ctx.followGroupSides] : null),
    /** Take (or hand back) motion ownership for a side. Abilities are never affected. */
    setManualMotion: (side: string, on: boolean): boolean => {
      if (!ctx.unitPositionsMutable) return false;
      if (on) {
        unitManualMotion.add(side);
        return true;
      }
      unitManualMotion.delete(side);
      unitMoveIntents.delete(side);
      return true;
    },
    manualMotionOf: (side: string): boolean => unitManualMotion.has(side),
    // The RTS stance for a friendly: hold stops moving now and keeps fighting, passive stands after the
    // current walk, patrol needs two waypoints, and retaliate restores AI gap-close.
    setUnitStance: (
      side: string,
      stance: 'retaliate' | 'passive' | 'hold' | 'patrol',
      opts?: { patrolWaypoints?: readonly CombatPosYd[] },
    ): boolean => {
      if (!ctx.unitPositionsMutable) return false;
      const unit = partyUnitOfSide(side);
      if (!unit || dead(unit)) return false;
      if (stance === 'retaliate') {
        unitStance.delete(side);
        unitPatrolLoop.delete(side);
        unitManualMotion.delete(side);
        unit.autoAttackEnabled = true;
        return true;
      }
      unitStance.set(side, stance);
      if (stance === 'hold') {
        unitMoveOrders.delete(side);
        unitMoveIntents.delete(side);
        ctx.unitHoldCourse?.delete(side);
        ctx.unitDirectMove?.delete(side);
        unitManualMotion.add(side);
        unitPatrolLoop.delete(side);
        // Cancel an in-flight Charge — otherwise the tank finishes the leap and "hold" lost.
        // A charge is motion; the rotation, heals and white swings are not, so they stay on.
        unit.pendingCharge = null;
        const cur = posOf(side);
        if (cur) unitAnchors.set(side, { x: cur.x, y: cur.y });
        return true;
      }
      if (stance === 'passive') {
        unitManualMotion.add(side);
        unitPatrolLoop.delete(side);
        // Move-only: no free-fire / charge while walking or standing.
        unit.pendingCharge = null;
        unit.autoAttackEnabled = false;
        return true;
      }
      // patrol
      const pts = opts?.patrolWaypoints?.length
        ? opts.patrolWaypoints.map((p) => ({ x: p.x, y: p.y }))
        : (unitMoveOrders.get(side) ?? []).map((p) => ({ x: p.x, y: p.y }));
      if (pts.length >= 2) {
        unitPatrolLoop.set(side, pts);
        unitMoveOrders.set(side, pts.slice());
      } else if (pts.length === 1) {
        // Single point: A = here, B = that point.
        const cur = posOf(side);
        if (cur) {
          const loop = [{ x: cur.x, y: cur.y }, pts[0]!];
          unitPatrolLoop.set(side, loop);
          unitMoveOrders.set(side, [pts[0]!]);
        }
      }
      unitManualMotion.delete(side);
      return true;
    },
    unitStanceOf: (side: string): 'retaliate' | 'passive' | 'hold' | 'patrol' =>
      unitStance.get(side) ?? 'retaliate',
    /** Late-bind the floor flags when the bake lands. `los` opts into sight gating. */
    setFloorFlags: (opts?: { clampOnly?: boolean; los?: boolean }): void => {
      if (opts?.clampOnly) cfg.navClampOnly = true;
      else delete cfg.navClampOnly;
      if (opts?.los === true) cfg.navLos = true;
    },
    /** Roof over the CURRENT pull (floor shell re-points it per inject). */
    setOutdoors: (outdoors: boolean): void => {
      if (outdoors) delete cfg.outdoors;
      else cfg.outdoors = false;
    },
    // An external world-rules hook, such as a BG powerup: apply a spell's effects to ONE unit as a free
    // self-cast — no cost, no cooldown and no GCD, because the trap is the caster and not the unit.
    applySpellToUnit: (
      side: string,
      spell: SpellDef,
      opts?: { weaponImbueHand?: 'mainhand' | 'offhand' },
    ): boolean => {
      const unit = fightingUnitOfSide(side);
      if (!unit || dead(unit)) return false;
      // The caller already picked the hand (bag coat / rotation item rule); applySpellLate
      // consumes this one-shot. Cite: SpellEffects.cpp:3099 EffectEnchantItemTmp itemTarget.
      if (opts?.weaponImbueHand) unit.pendingWeaponImbueHand = opts.weaponImbueHand;
      castOnTargets(unit, unit, spell);
      invalidateViewMemo();
      return true;
    },
    useUnitItem: (side: string, entry: number, targetId?: CombatantId): boolean => {
      const f = resolveItemTarget(side as CombatantId);
      if (!f || dead(f)) return false;
      // Hard control refuses everything except the item whose own immunity cancels it —
      // the same CheckCasterAuras exemption as the player's manual tap (W12).
      if ((ctx.isControlledHard as (u: Fighter) => boolean)(f)) {
        const bag = f === player ? playerItems : ctx.unitItems.get(side as Side);
        const it = bag?.find((x) => x.entry === entry);
        if (!it || it.effect.kind !== 'friendly_cast'
          || ctx.spellCancelsOwnControl?.(f, it.effect.spell) !== true) return false;
      }
      return useItem(entry, targetId, side as Side);
    },
    consumeUnitItemsGained: (): { side: Side; entry: number; count: number }[] => {
      const out: { side: Side; entry: number; count: number }[] = [];
      for (const [side, got] of ctx.unitItemsGained) {
        for (const [entry, count] of got) if (count > 0) out.push({ side, entry, count });
        got.clear();
      }
      return out;
    },
    unitItems: (side: string): CombatItemStatus[] => {
      const f = resolveItemTarget(side as CombatantId);
      const bag = side === 'player' ? playerItems
        : (isAllySide(side as Side) || isEnemySide(side as Side))
            ? ctx.unitItems.get(side as Side)
            : undefined;
      if (!f || !bag) return [];
      const cdMap = side === 'player'
        ? itemCd
        : ctx.unitItemCd.get(side as Side) ?? new Map<number, number>();
      return bag.map((it) => {
        const cdRem = Math.max(0, (cdMap.get(it.entry) ?? 0) - ctx.t);
        const catRem = (it.category != null && it.categoryCooldownMs != null && it.categoryCooldownMs > 0)
          ? Math.max(0, (f.categoryCooldowns.get(it.category) ?? 0) - ctx.t)
          : 0;
        let usable = true; let reason: string | undefined;
        if (it.count <= 0) { usable = false; reason = 'none left'; }
        else if (f.castingSpell) { usable = false; reason = 'casting'; }
        else if (cdRem > 0 || catRem > 0) { usable = false; reason = 'cooldown'; }
        return { item: it, usable, reason, cooldownRemainingMs: Math.max(cdRem, catRem), count: it.count };
      });
    },
    unitRunSpeedYd: (side: string): number => {
      const live: { aura: number; pct: number }[] = [];
      // Same bucket as sessionMotionKit: permanent enchant and talent speed is MAXed against
      // whatever is running, never added to it.
      const unit = fightingUnitOfSide(side);
      for (const p of unit?.spec.permanentSpeedAuras ?? []) live.push({ aura: p.aura, pct: p.pct });
      const mount = unit?.spec.mount;
      if (mount) live.push({ aura: AURA_INCREASE_MOUNTED_SPEED, pct: mount.speedPct });
      for (const e of ctx.effectsOn(side as Side)) {
        if (e.kind !== 'speed' || e.aura == null) continue;
        live.push({ aura: e.aura, pct: e.pct ?? 0 });
      }
      // Template SpeedRun rides on the rate, the same multiply sessionMotionKit makes. Cite: Unit.cpp:8409.
      const baseRate = unit?.spec.speedRun ?? 1;
      if (live.length === 0) return BASE_RUN_SPEED * baseRate;
      return effectiveSpeeds({ effects: live, mounted: mount != null }).run * baseRate;
    },
    unitBaseRunSpeedYd: (side: string): number => {
      const unit = fightingUnitOfSide(side);
      const rows = [...(unit?.spec.permanentSpeedAuras ?? [])];
      const mount = unit?.spec.mount;
      if (mount) rows.push({ aura: AURA_INCREASE_MOUNTED_SPEED, pct: mount.speedPct });
      const baseRate = unit?.spec.speedRun ?? 1;
      if (rows.length === 0) return BASE_RUN_SPEED * baseRate;
      return effectiveSpeeds({ effects: rows, mounted: mount != null }).run * baseRate;
    },
    /**
     * Ride or step off. Unit::Mount / Unit::Unmount — the caller owns WHETHER (mounting.ts gates
     * the ground, mounts.ts the rider); this only carries it into UpdateSpeed.
     */
    setUnitMounted: (side: string, mount: { speedPct: number } | null): boolean => {
      const unit = fightingUnitOfSide(side);
      if (!unit) return false;
      const had = unit.spec.mount != null;
      if (mount && !had) {
        // Mount path strips holders of spells with AURA_INTERRUPT_FLAG_MOUNTING
        ctx.removeAurasWithInterruptFlags?.(unit, AURA_INTERRUPT.MOUNTING, 'mounting');
      }
      if (mount) unit.spec.mount = { speedPct: mount.speedPct };
      else delete unit.spec.mount;
      if (had && !mount) {
        ctx.removeAurasWithInterruptFlags?.(unit, AURA_INTERRUPT.DISMOUNT, 'unmount');
      }
      if (had !== (mount != null)) unit.speedDirty = true;
      return true;
    },
    unitMounted: (side: string): boolean => fightingUnitOfSide(side)?.spec.mount != null,
    unitInCombat: (side: string): boolean => {
      const unit = fightingUnitOfSide(side);
      return unit ? fighterIsInCombat(unit, ctx.t) : false;
    },
    reviveUnit: (side: string, hpPct = 1): boolean => {
      const unit = fightingUnitOfSide(side);
      if (!unit) return false;
      if (!dead(unit)) return true;
      unit.hp = Math.max(1, Math.round(unit.spec.maxHealth * Math.max(0.01, Math.min(1, hpPct))));
      unit.castingSpell = null;
      if (unit.channeling) interruptChannel(unit, channelInterruptCtx(ctx), { quiet: true });
      unit.pendingCharge = null;
      // Fresh life, fresh pull — the opener is available again (same rule as restoreUnit).
      unit.chargeUsed = false;
      unit.combatUntil = 0;
      unit.combatEnteredAt = 0;
      clearManualMotion(side);
      // Rez is pool membership. living* stale-hp walks only drop corpses (sessionPools.ts).
      ctx.bumpPool?.();
      invalidateViewMemo();
      return true;
    },
    // Endless-floor downtime: an eat-and-drink refill for a friendly between pulls. The revive path
    // skips the living, and without this a survivor limped into the next pack and chain-wiped the run.
    restoreVitals: (side: string, hpPct = 1, powerPct = 1): boolean =>
      writeVitals(side, hpPct, powerPct) != null,
    partyWiped: (): boolean => ctx.partyWiped!(),
    restoreUnit: (side: string, hpPct = 1, powerPct = 1): boolean => {
      const unit = writeVitals(side, hpPct, powerPct);
      if (!unit) return false;
      // The RESET half. A revive and a between-pull reset want whatever was in flight gone; a repeating
      // rest trickle does NOT, and calling this from one wiped a cast bar every 500 ms.
      unit.castingSpell = null;
      if (unit.channeling) interruptChannel(unit, channelInterruptCtx(ctx), { quiet: true });
      unit.pendingCharge = null;
      return true;
    },
    interruptClaimedByOther,
    dispelClaimedByOther,
    /** Current manual target of a companion, or null when the AI drives. */
    allyTargetOf: (allySide: string): string | null =>
      allyManualTarget.get(allySide as Side) ?? null,
    // The held one-shot action armed for this seat, or null. Read by the tick's action chooser so an
    // automatic rotation pick cannot starve a queued Pre-buff cast.
    queuedActionOf: (side: string): number | { item: number } | null => {
      const head = unitCastOrders.get(side as Side)?.[0];
      if (!head) return null;
      if (head.spellId != null) return head.spellId;
      return head.itemEntry != null ? { item: head.itemEntry } : null;
    },
    queueUnitCast,
    unitCastOrderOf: (side: string): readonly QueuedCast[] =>
      unitCastOrders.get(side as Side) ?? [],
    // Queue ONE manual action for a companion — it wins the next pick and then the rotation resumes. An
    // unknown or uncastable pick is dropped in favour of the rotation, never a wedge.
    queueAllyAction: (
      allySide: string,
      action: number | { item: number } | null,
      targetSide?: string | null,
    ): boolean => {
      if (action === null) return queueUnitCast(allySide, null);
      const aim = targetSide != null ? { targetSide: targetSide as Side } : {};
      return queueUnitCast(
        allySide,
        typeof action === 'number'
          ? { spellId: action, ...aim }
          : { itemEntry: action.item, ...aim },
      );
    },
    setPlayerTarget: (side: CombatantId, opts?: { skipMove?: boolean }): boolean => {
      // Allow focusing a possessed ally (burn-to-50% Anastari) as well as enemies.
      // Cite: boss_baroness_anastari.cpp — party damages possessed player to break possess.
      if (isEnemySide(side)) {
        const ef = enemyUnitOfSide(side);
        if (!ef || dead(ef)) return false;
        if (isUnattackable(ef)) {
          const possessed = ctx.partyUnits().find(
            (u) => !dead(u) && isCharmed(u) && !isUnattackable(u),
          );
          if (!possessed) return false;
          ctx.playerFocusFighter = possessed;
          ctx.explicitEnemyFocus = null;
          return true;
        }
        ctx.playerFocusFighter = ef;
        // Click / kill-target: free-fire this side even while still threat-empty (floor passive).
        ctx.explicitEnemyFocus = side as EnemySide;
        if (opts?.skipMove) return true;
        const dest = posOf(side);
        const from = posOf('player');
        if (dest && from) {
          const planar = detHypot(dest.x - from.x, dest.y - from.y);
          const floorOk = dest.z == null || from.z == null || Math.abs(dest.z - from.z) <= 4;
          if (planar > MELEE_REACH_YD + MELEE_PARK_SLACK_YD || !floorOk) {
            const q = unitMoveOrders.get('player')?.[0];
            const already = q != null && detHypot(q.x - dest.x, q.y - dest.y) <= 8 + MELEE_REACH_YD
              && (dest.z == null || q.z == null || Math.abs(q.z - dest.z) <= 4);
            if (!already) {
              ctx.pathTo?.('player', dest, {
                keepFocus: true,
                standShortYd: standShortYdFor(player.spec.standYards),
              });
              // NOT the pet. Clicking a target is not a pet order: the pet takes the focus and gap-closes
              // on its own. This aimed it at the mob's CENTRE and outranked that, so it stood inside it.
              for (const a of ctx.livingAllies()) {
                ctx.pathTo?.(a.side, dest, {
                  keepFocus: true,
                  standShortYd: standShortYdFor(a.spec.standYards),
                });
              }
            }
          }
        }
        return true;
      }
      if (side === 'player' && isCharmed(player) && !dead(player)) {
        ctx.playerFocusFighter = player;
        return true;
      }
      if (side === 'pet' && pet && isCharmed(pet) && !dead(pet)) {
        ctx.playerFocusFighter = pet;
        return true;
      }
      if (isAllySide(side)) {
        const al = allyUnitOfSide(side);
        if (!al || dead(al) || !isCharmed(al)) return false;
        ctx.playerFocusFighter = al;
        return true;
      }
      return false;
    },
    playerTargetId: () => ensurePlayerFocus().side,
    targetOf: (side: string): CombatantId | null => {
      if (side === 'pet' && !pet) return null;
      const f = fighterOfSide(side);
      if (!f || dead(f)) return null;
      const foe = isEnemySide(f.side) ? hostileTargetOf(f) : foeOf(f);
      if (!foe || foe === f || dead(foe)) return null;
      return foe.side;
    },
    pullSpentSpellsFor,
    pullSpentItemsFor,
    // The engine's own rotation snapshot for one unit, byte-for-byte what a companion provider gets.
    // Exposed so the autopilot delegates: two builders for one evaluator is how they drifted.
    rotationSnapshot: (side: Side, foeSide?: string) => {
      const f = fighterOfSide(side);
      if (!f) return null;
      // A dead unit still gets a snapshot (self.alive false) — callers gate on it, and
      // returning null there would silently degrade the player's rotation on a death tick.
      let foe: Fighter | null = null;
      // A pinned foe, because the player's focus may be a possessed ally the foe lookup would not pick.
      // Without it the delegated target could describe a different unit than the caller resolved.
      if (foeSide) {
        const cand = fighterOfSide(foeSide);
        if (cand && !dead(cand)) foe = cand;
      }
      if (!foe) foe = isEnemySide(f.side) ? hostileTargetOf(f) : foeOf(f);
      return (ctx.allySnapshot as Function)(f, foe);
    },
    // WHO, not which slot. A side is a seat handed to a new body the moment the last is recycled, so
    // this is derived from the roster on every call and a recycled seat cannot answer for its predecessor.
    sideOfGuid: (guid: number): CombatantId | null => {
      const g = guid | 0;
      if (g === 0) return null;
      // Index, not a walk: callers ask this inside loops over streamed bodies. Maintained by the
      // one roster writer, same as bySideMap. E1.2.
      return ctx.unitByGuid?.(g)?.side ?? null;
    },
    // Record a world id on a seat combat created itself, since a summon enters with no floor guid. It
    // NEVER re-mints: a seat already carrying one refuses, so a recycled seat cannot inherit an id.
    stampUnitGuid: (side: string, guid: number): boolean => {
      const g = guid | 0;
      if (g === 0) return false;
      const f = ctx.sideFighter?.(side as Side);
      if (!f || (f.spec.guid ?? 0) !== 0) return false;
      f.spec.guid = g;
      ctx.noteUnitGuid?.(f.side, g);
      return true;
    },
    // The un-bind half: this seat is no longer the world body it was bound to. De-streaming drops a body
    // without killing it, and before this the two sides only ever BOUND together.
    releaseUnitGuid: (side: string, expectGuid?: number): boolean => {
      const f = fighterOfSide(side);
      if (!f || (f.spec.guid ?? 0) === 0) return false;
      // The expected guid is for a caller moving ONE body between seats: release the seat it left,
      // unless that seat was already recycled onto someone else, whose id would be stripped.
      if (expectGuid != null && (f.spec.guid ?? 0) !== (expectGuid | 0)) return false;
      f.spec.guid = undefined;
      ctx.noteUnitGuid?.(f.side, null);
      return true;
    },
    // The level this seat's unit was BUILT at, rolled from the template band rather than the row's
    // static midpoint — which is why the live layer kept a third store to remember it.
    unitLevelOf: (side: string): number | undefined => fighterOfSide(side)?.spec.level,
    /** The inverse, read the same way. Null on a seat the world never minted (fixtures, Pull +1). */
    guidOfSide: (side: string): number | null => {
      const g = fighterOfSide(side)?.spec.guid;
      return g != null && (g | 0) !== 0 ? g | 0 : null;
    },
    // A battleground NPC that walked into the fight on OUR side — AV's tower guards, marshals and
    // general are creature bodies, and they only fight if they hold a real seat.
    injectAlly: (
      spec: CombatantSpec,
      position?: CombatPosYd,
      opts?: { side?: string },
    ): CombatantId | null => {
      const add = ctx.injectAllySpec?.(spec, { ownerSide: 'player', position, side: opts?.side });
      if (!add) return null;
      invalidateViewMemo();
      return add.side;
    },
    /** S4A conveyor / floor pool: mid-fight inject with optional geometry slot position. */
    injectEnemy: (
      spec: CombatantSpec,
      position?: CombatPosYd,
      opts?: { passive?: boolean; side?: string },
    ): CombatantId | null => {
      const add = injectEnemySpec(spec, {
        summonerSide: 'player',
        creatureId: spec.creatureEntry,
        position,
        passive: opts?.passive === true,
        side: opts?.side,
      });
      invalidateViewMemo(); // a new enemy slot changes enemiesView length
      return add ? add.side : null;
    },
    // An attack-start seed on an already-present enemy, the floor's passive-to-aggro path. Refused when
    // geometry says the unit is out of local combat, so a skipped check cannot re-open combat at 600 yd.
    seedEnemyThreat: (enemySide: string, _on: CombatantId = 'player', opts?: { force?: boolean }): boolean => {
      const ef = enemyUnitOfSide(enemySide);
      if (!ef || dead(ef)) return false;
      // Event spawns (Solakar / stadium waves) AttackStart the raid from the tunnel.
      // Cite: instance_blackrock_spire.cpp:628-634 MovePoint then combat; CreatureAI AttackStart.
      const seedOn = opts?.force
        ? (!dead(player) ? 'player'
          : pet && !dead(pet) ? 'pet'
            : ctx.livingAllies()[0]?.side ?? null)
        : nearestPartyInAcquire(enemySide);
      if (!seedOn) return false;
      const tm = threatOf(ef);
      const opened = !!tm && tm.isEmpty();
      if (tm) {
        // Where it stood when combat opened is where it evades back to — the spawn coord is
        // only the fallback. Cite: HomeMovementGenerator.cpp:48-51.
        if (opened) {
          const at = posOf(enemySide);
          if (at) ctx.enemyHomeYd?.set(enemySide, { ...at });
        }
        tm.addThreatDirectly(seedOn, 1, false);
      }
      // S2 OOC nextWakeAt=Inf; seed skips combatUntil so combat-enter dirty never fires.
      if (opened) {
        wakeForDecision(ef);
        for (const f of ctx.partyUnits()) wakeForDecision(f);
      }
      maybeAggroZonePulse(ef, ctx.partyUnits(), ctx.t);
      invalidateViewMemo(); // `engaged` is threat-derived
      return true;
    },
    // Endless floor wipe: drop every living hostile so an inject can recycle the slots. It does not end
    // the session. Prefer the scoped disengage so the passive stream is not nuked with the pull.
    disengageAllEnemies: (): number => {
      let n = 0;
      for (const ef of ctx.livingEnemies()) {
        ef.hp = 0;
        deathEmitted.add(ef.side); // despawn only — not a combat kill
        push({ t: ctx.t, kind: 'despawn', actor: ef.side });
        n += 1;
      }
      invalidateViewMemo();
      return n;
    },
    /** The ally-block mirror: de-stream injected friendly bodies (AV's guards) without a death. Only
     *  a seat THIS session summoned goes, which is the same seat seatFriendly recycles. */
    disengageAllySides: (sides: readonly string[]): number => {
      if (!sides.length) return 0;
      const want = new Set(sides);
      let n = 0;
      for (const af of ctx.livingAllies()) {
        if (!want.has(af.side) || af.spec.summonOwnerSide == null) continue;
        af.hp = 0;
        deathEmitted.add(af.side); // stream GC, not a combat death
        push({ t: ctx.t, kind: 'despawn', actor: af.side });
        n += 1;
      }
      invalidateViewMemo();
      return n;
    },
    /** Drop only listed living sides — passives not listed stay. */
    disengageEnemySides: (sides: readonly string[]): number => {
      if (!sides.length) return 0;
      const want = new Set(sides);
      let n = 0;
      for (const ef of ctx.livingEnemies()) {
        if (!want.has(ef.side)) continue;
        ef.hp = 0;
        deathEmitted.add(ef.side); // stream GC / evade pool drop — not a combat kill
        push({ t: ctx.t, kind: 'despawn', actor: ef.side });
        n += 1;
      }
      invalidateViewMemo();
      return n;
    },
    // Evade / wipe survivor: empty threat table + full vitals + back to its home spot, still in the pool as
    // passive. Cite: Unit::EvadeTimerExpired — reset without despawn when the session owns the floor.
    releaseEnemyToPassive: (enemySide: string): boolean => {
      const ef = enemyUnitOfSide(enemySide);
      if (!ef || dead(ef)) return false;
      const tm = threatOf(ef);
      if (tm) tm.clear();
      ef.hp = Math.max(1, ef.spec.maxHealth);
      ef.power = ef.spec.powerType === 'rage' ? 0 : ef.spec.maxPower;
      // EnterEvadeMode is the timer reset plus Reset(), so a wiped boss re-opens on its ctor state —
      // without it a re-pull faced a full-health Vaelastrasz, over three times the written bar.
      const cast = ctx.enemyCastBySide.get(enemySide as EnemySide);
      if (cast) {
        resetCreatureCastSlotsOnEvade(cast.slots, ctx.t, ctx.rng);
        cast.pendingSlot = null;
      }
      ef.castingSpell = null;
      // An evading mob drops its channel with everything else — otherwise the motion freeze
      // holds it in place on a channel nothing will ever interrupt.
      if (ef.channeling) interruptChannel(ef, channelInterruptCtx(ctx), { quiet: true });
      ef.pendingCharge = null;
      // Reset() runs after the CombatStop half, so a Reset cast is not cleared by it.
      // Cite: UnitAI.cpp:113-126 then CreatureAI.cpp:69-70.
      runEvadeLifecycle(ctx, ef);
      unitMoveOrders.delete(enemySide);
      // MoveTargetedHome, snapped rather than walked: the motion phase skips an enemy with an empty
      // threat table, so a returning mob has no mover, and the far-evade despawn guard was dropped.
      const home = ctx.cfg.dungeonMap ? undefined : ctx.enemyHomeYd?.get(enemySide);
      const curr = posOf(enemySide);
      if (home && curr) {
        const dx = curr.x - home.x;
        const dy = curr.y - home.y;
        if (dx * dx + dy * dy > HOME_DESPAWN_DISTANCE_SQ) {
          ef.hp = 0;
          deathEmitted.add(ef.side);
          push({ t: ctx.t, kind: 'despawn', actor: ef.side });
          invalidateViewMemo();
          return true;
        }
      }
      const walkHome = ctx.enemyHomeYd?.get(enemySide);
      if (walkHome && ctx.unitPositionsMutable) {
        setPos(enemySide, placeEnemyAt({ ...walkHome }));
        ctx.clearMotionCaches?.(enemySide);
      }
      invalidateViewMemo();
      return true;
    },
    // S2 D1: full spell-aura strip. Cite: Unit.cpp RemoveAurasDueToSpell ~5165–5178. Side may be
    // player/enemy/pet/ally_N/enemy_N.
    removeAurasDueToSpell: (side: CombatantId | Side, spellId: number): number => {
      const unit = fighterOfSide(side);
      if (!unit) return 0;
      invalidateViewMemo();
      return ctx.removeAurasDueToSpell!(unit, spellId | 0);
    },
    removeAurasWithInterruptFlags: (
      side: string | Side,
      flags: number,
      reason: string,
      opts?: { skipStealth?: boolean; exceptSpellId?: number; skipInvisibility?: boolean },
    ) => {
      const unit = fighterOfSide(side);
      if (unit) ctx.removeAurasWithInterruptFlags?.(unit, flags, reason, opts);
    },
    // Surrender: both sides stop, the loser Grovels and the opponent wins. The emote is pushed as a cast
    // rather than routed through the cast path, which would need a GCD, a range and a school for nothing.
    forfeit: (side: CombatantId | Side): boolean => {
      if (ctx.ended) return false;
      const unit = fighterOfSide(side);
      if (!unit) return false;
      // Same predicate the yield clamp uses (events.ts), not a second spelling of it.
      if (!isDuelistSide(unit.side)) return false;
      ctx.ended = true;
      ctx.winner = unit.side === 'player' ? 'enemy' : 'player';
      const beg = ctx.cfg.spellOf?.(7267);
      ctx.push({
        t: ctx.t, kind: 'cast_finish', actor: unit.side,
        spellId: 7267, name: beg?.name ?? 'Grovel',
      });
      ctx.push({ t: ctx.t, kind: 'flavor', text: `${unit.spec.name} forfeits.` });
      invalidateViewMemo();
      return true;
    },
    // The cancel-aura gate inputs for the player. The possessed flag reads the charm state directly,
    // since the view resolves a stun first and would hide a possess. Own-aura is the caster test.
    auraCancelState: (spellId: number): { possessed: boolean; ownAura: boolean } | null => {
      const id = spellId | 0;
      if (!id) return null;
      const unit = bySide('player');
      if (!unit) return null;
      const rows = ctx.effectsOn(unit.side).filter((e) => e.spellId === id);
      if (!rows.length) return null;
      return {
        possessed: ctx.isCharmed(unit),
        // Every row of this holder must be self-cast for it to be "own"; a party area aura
        // supplied by an ally carries that ally's side as `source`.
        ownAura: rows.every((e) => e.source === unit.side),
      };
    },
    // Cite: CreatureAI.cpp:130-135; boss_razorgore.cpp:97 CUSTOM_A SetDeathPrevention(false).
    setDeathPrevention: (side: CombatantId | Side, enabled: boolean): boolean => {
      if (!isEnemySide(side)) return false;
      const cast = ctx.enemyCastBySide.get(side as EnemySide);
      if (!cast) return false;
      cast.eventAi.deathPrevention = enabled;
      return true;
    },
    leaveForm: (side?: CombatantId | Side): void => {
      const unit = fighterOfSide(side ?? 'player');
      if (!unit) return;
      ctx.leaveForm?.(unit);
      invalidateViewMemo();
    },
    /** `/stopcasting` — the cast-cancel a move order already performs, on demand. */
    stopCasting: (side?: CombatantId | Side): boolean => {
      const unit = fighterOfSide(side ?? 'player');
      if (!unit || dead(unit)) return false;
      const had = !!unit.castingSpell || !!unit.channeling;
      cancelCastForMove(unit);
      invalidateViewMemo();
      return had;
    },
    /** `/startattack` / `/stopattack` — swing state only; motion and rotation are untouched. */
    setAutoAttack: (side: CombatantId | Side | string, on: boolean): boolean => {
      const unit = fighterOfSide(side);
      if (!unit || dead(unit)) return false;
      if (unit.autoAttackEnabled === on) return true;
      unit.autoAttackEnabled = on;
      // Starting a swing must not hand the unit a free instant hit: the next swing lands on
      // its own timer, exactly as Unit::Attack schedules it.
      if (on && unit.swingReadyAt > ctx.t + 60_000) unit.swingReadyAt = ctx.t;
      invalidateViewMemo();
      return true;
    },
    getInstanceData: (field: number): number => instanceData.get(field | 0) ?? 0,
    instanceDataView: (): ReadonlyMap<number, number> => instanceData,
  };
}
