// Peeled from createSession (Wave 4 hub: pickAction). Pattern (D).
// Extracted modules must not import combat.ts.
import { castableKitIds } from './castableKit.ts';
import { triggeredIdsOf } from './triggeredCompanion.ts';
import { dispelClaimedByOtherSeat } from './dispelDuty.ts';
// NOTE: imports may need expanding when first run against seam tests.

import type { CombatContext } from './context.ts';
import type { Fighter, AllyActionProvider, CombatantView, ProviderNeeds } from './types.ts';
import { fighterCombatTimeMs, fighterIsInCombat } from './combatFlag.ts';
import type { SpellDef, TotemSlot, SpellRole } from '../../data/schema.ts';
import type { CcEffect } from './crowdControl.ts';
import { spellThreatFromDef } from './threat.ts';
import type { Side, EnemySide } from '../core/events.ts';
import { isEnemySide, isAllySide, isPlayerCharacterSide, isTotemSide } from '../core/events.ts';
import { TUNING, drFactor } from './formulas.ts';
import { schoolMaskFromSchool } from '../spells/procs.ts';
import { roleOf, spellHeals } from './roles.ts';
import { SPELL_ATTR, SPELL_ATTR_EX2, SPELL_ATTR_EX4, hasAttr, hasAttrEx2, hasAttrEx4, spellPiercesSchoolImmunity } from '../spells/spellAttributes.ts';
import {
  isHostileSpellDef,
  spellTargetTypeAllowed,
  isHostileBuffEffect,
  spellNeedsRangeGate,
  spellGateRangeMaxYd,
  spellGateRangeMinYd,
  spellFoeDirectedOpaque,
  spellFoeDirectedGeometry,
  spellNeedsFriendlyLosGate,
  spellNeedsLosGate,
  isSelfCenteredAoe,
  isFoeDirectedOffense,
  focusImmunityBlocksSpell,
  nextSwingFanCap,
  sideIdSortKey,
  isNonCastableTalentProc,
  isRangedAutoRepeatToggle,
} from './predicates.ts';
import { reactiveCastGate } from './reactiveGates.ts';
import { isPlayerCharacterTarget, targetCastGate } from './castTargetGates.ts';
import { refuseCmangosCheckCast, RECENTLY_BANDAGED_SPELL_ID } from './cmangosCastGates.ts';
import { kitById } from './kitById.ts';
import { auraHolderExcludesCaster, isPartyFanBody, selectedOrSelfFriendly } from './healTargets.ts';
// INTERACTION_DISTANCE 5.0f. One definition for the hand click and the rotation click alike.
// Cite: ObjectDefines.h:25; world/instanceObjects.ts GO_INTERACT_YD.
import { GO_INTERACT_YD } from '../../world/instanceObjects.ts';
import { detHypot } from '../core/detMath.ts';
import {
  isImmuneToMechanic,
  isImmuneToMechanicId,
  isImmuneToHarmfulAura,
  isAbilityIneffectiveOnTarget,
  isTotemCreatureType,
  spellAppliesHostileAura,
  schoolMaskFromSchoolName,
} from '../spells/immunity.ts';
import { captureSpiritAllowsEntry } from '../spells/cmangos-special-cases.ts';
import { CHROMAGGUS_BREATH_SELECTION_SPELL_ID } from '../spells/cmangos-special-cases-s23.ts';
import {
  CORRUPTED_MIND_PRIMER_SPELL_ID,
  refuseOverrideClassScriptCheckCast,
} from '../spells/overrideClassScripts.ts';
import { spellAllowedAtLocation } from '../spells/spellAttributes.ts';
import { categoryCooldownMs, getGcdMs, spellIncursGcd } from '../spells/recovery.ts';
import { DISPEL_TYPE, getDispelMask } from '../../domain/spells/dispel.ts';
import {
  isDiminishingReturnsGroupDurationDiminished, DIMINISHING_GROUP_ORDER,
} from '../../domain/spells/diminishing.ts';
import {
  resolveFormCast,
  isFormSpell,
  formIdFromSpell,
  isMobilityFormSpellId,
  isMobilityTravelForm,
} from '../../domain/character/forms.ts';
import {
  isInSpellRange,
  combatDistanceYd,
  planarRangeHonestYd,
  coneArcsOfKit,
  coneCovers,
  meleeContactYd,
} from './combatGeometry.ts';
import { layCombatObjectTrap } from './useObjectTrap.ts';
import { isHunterTrapArmProc } from '../spells/interpreter/hunter-kit.ts';
import { keepUpAlreadyPresent } from '../spells/auraStacking.ts';
import { hazardMatches, hostileHazardsThisTick } from './hazards.ts';
import type { RuleMove } from '../../domain/rotation/rotation.ts';
import { navSightClear } from './navSight.ts';
import { spellFromKit } from './kitById.ts';
import {
  isSpellSchoolLocked,
  interruptEffectMechanicId,
  schoolIndexFromSchool,
  spellHasInterruptCast,
  pruneInterruptClaims,
  unitIsCastingOrChanneling,
  unitInterruptibleCast,
} from '../spells/interrupt.ts';
import { combatConditionMeets, type ConditionUnit } from '../../domain/creature/combatCondition.ts';
import type { CombatantId } from './threat.ts';
import type { AllyFilter, RotationSnapshot, RuleAfterStep, SubjectState } from '../../domain/rotation/rotation.ts';
import { killOrderEntryMatches, killOrderTakesCharmed } from '../../domain/rotation/killOrder.ts';
import {
  allyFilterIsAny,
  haltDpsCoversEntry,
  haltDpsRefusesSchool,
  isGroundTargetedMulti,
  isNovaKiteSpell,
  isPiercingHowlSpell,
  piercingHowlRefused,
  multiTargetNeedsPackDensity,
  isPackSuppressedStFiller,
  multiTargetGateYards,
  novaDiscOccupied,
  isDispelSpell,
  isBattleRezSpell,
  isPureInterruptSpell,
} from '../../domain/rotation/rotation.ts';
import {
  assignedHealSubgroupOf,
  buildRaidPlan,
  campOfSeat,
  isMainTankSeat,
  isOffTankSeat,
  normalizeRaidPlan,
  overlayEncounterRaidPlan,
  raidCampCode,
  RAID_JOB_CODE,
  seatPlanOf,
  tankBossIndex,
  tankFocusSplitsBosses,
  type RaidPlan,
  type RaidPlanSeatInput,
} from '../../domain/raid/raidPlan.ts';
import { passesConditionGate, type ConditionSnapshot } from '../spells/conditions.ts';
import { getVariable, isConditionFulfilled } from '../game/worldState.ts';
import { SPELL_EFFECT_CHARGE } from '../spells/interpreter/opcodes.ts';
import {
  CAST_FLAG,
  EVENT_T,
  pickCreatureCast,
  resolveRandomActionCastSlot,
  resolveClassCallCastSlot,
  rollCreatureCastChance,
  markCreatureCastRowUsed,
  countCreatureCastFire,
  MIN_AGGRO_DISTANCE,
  isMechanicImmune,
  SPELL_LIST_POLL_MS,
} from '../../domain/creature/creatureAi.ts';
import { TARGET_T } from '../../domain/creature/aiTargeting.ts';
import { getAuraScript, dataGatePasses } from '../../domain/scriptdev/index.ts';
import { isNefarianClassCallSpell } from '../../domain/scriptdev/classFilter.ts';
import {
  WIDOWS_EMBRACE_CD_SPELL_ID,
  widowsEmbraceRefusesCast,
} from '../spells/cmangos-special-cases-s22.ts';
import { ALLY_HEAL_THRESHOLD } from './types.ts';
import { SLOW_IDLE_RATE } from './slowUpdate.ts';
import { drGroupOf } from './crowdControl.ts';
import { playerMissingRequiredEquippedItem } from './equippedItemGate.ts';
import { canPaySpellReagents } from './spellReagents.ts';
import { armRuleAfter, consumeFollowUp, liveFollowUpChain } from './ruleAfter.ts';
import { channelInterruptCtx, maybeCancelChannelOnMove } from './channel.ts';
import {
  flagAuraId, inMeleeBand, isRezzableCorpse, rezzableDeadCount, unitClassId, unitIsCaster,
  unitIsHunter,
} from './rotationSubject.ts';
import { pickBattleRezTarget, pruneRezClaims } from './battleRez.ts';
import { emitSimEffect } from './simEffects.ts';
import { maxPowerOfType } from './powerPools.ts';

export type installPickActionDeps = {
  dead: (...args: any[]) => any;
  isControlled: (...args: any[]) => any;
  isControlledHard: (...args: any[]) => any;
  isWeaponAction: (...args: any[]) => any;
  isBreaker: (...args: any[]) => any;
  ccImmune: (...args: any[]) => any;
  spellTemplateImmune: (...args: any[]) => any;
  canAffordSpell: (...args: any[]) => any;
  spellCost: (...args: any[]) => any;
  comboOn: (...args: any[]) => any;
  foeOf: (...args: any[]) => any;
  ensurePlayerFocus: (...args: any[]) => any;
  lowestHpFriendly: (...args: any[]) => any;
};

// A pure function of a frozen bake row, asked per candidate spell per unit per tick — 4.6% of a tick
// profile. Module scope, not per session: spell defs are interned, so the map is shared and self-evicting.
const chargeRoleCache = new WeakMap<SpellDef, boolean>();
const memoSpellBool = (
  map: WeakMap<SpellDef, boolean>,
  fn: (s: SpellDef) => boolean,
  s: SpellDef,
): boolean => {
  let v = map.get(s);
  if (v === undefined) { v = fn(s); map.set(s, v); }
  return v;
};
const pureInterruptCache = new WeakMap<SpellDef, boolean>();
const interruptCastCache = new WeakMap<SpellDef, boolean>();
const packDensityCache = new WeakMap<SpellDef, boolean>();
const groundMultiFlagCache = new WeakMap<SpellDef, boolean>();
const novaKiteFlagCache = new WeakMap<SpellDef, boolean>();
const selfCenteredCache = new WeakMap<SpellDef, boolean>();
const dotPayloadCache = new WeakMap<SpellDef, boolean>();
const pureInterruptOf = (s: SpellDef): boolean => memoSpellBool(pureInterruptCache, isPureInterruptSpell, s);
const interruptCastOf = (s: SpellDef): boolean => memoSpellBool(interruptCastCache, spellHasInterruptCast, s);
const packDensityOf = (s: SpellDef): boolean => memoSpellBool(packDensityCache, multiTargetNeedsPackDensity, s);
const groundMultiOf = (s: SpellDef): boolean => memoSpellBool(groundMultiFlagCache, isGroundTargetedMulti, s);
const novaKiteOf = (s: SpellDef): boolean => memoSpellBool(novaKiteFlagCache, isNovaKiteSpell, s);
const selfCenteredOf = (s: SpellDef): boolean => memoSpellBool(selfCenteredCache, isSelfCenteredAoe, s);

// Per-kit Cleave/Swipe flags the rotation asks for every candidate spell. Keyed on `spec.spells` so a
// shapeshift kit swap misses naturally (same as kitById).
const packFillerCache = new WeakMap<readonly SpellDef[], { hasCleave: boolean; hasSwipe: boolean }>();
const packFillersOf = (spells: readonly SpellDef[]): { hasCleave: boolean; hasSwipe: boolean } => {
  let v = packFillerCache.get(spells);
  if (!v) {
    let hasCleave = false;
    let hasSwipe = false;
    for (const sp of spells) {
      const n = (sp.name ?? '').toLowerCase();
      if (n === 'cleave') hasCleave = true;
      if (n === 'swipe') hasSwipe = true;
    }
    v = { hasCleave, hasSwipe };
    packFillerCache.set(spells, v);
  }
  return v;
};

// Self-centred hard-control AoEs in a kit — Frost Nova and its ranks. Empty for every class but mage, so
// the holdability scan costs 39 of 40 raid seats nothing.
const novaKiteKitCache = new WeakMap<readonly SpellDef[], readonly SpellDef[]>();
const novaKiteKitOf = (spells: readonly SpellDef[]): readonly SpellDef[] => {
  let v = novaKiteKitCache.get(spells);
  if (!v) {
    v = spells.filter((sp) => novaKiteOf(sp));
    novaKiteKitCache.set(spells, v);
  }
  return v;
};

const kitHasGroundMultiCache = new WeakMap<readonly SpellDef[], boolean>();
const kitHasGroundMulti = (spells: readonly SpellDef[]): boolean => {
  let v = kitHasGroundMultiCache.get(spells);
  if (v === undefined) {
    v = false;
    for (const s of spells) if (groundMultiOf(s)) { v = true; break; }
    kitHasGroundMultiCache.set(spells, v);
  }
  return v;
};

const kitHasFanStrikeCache = new WeakMap<readonly SpellDef[], boolean>();
const kitHasFanStrike = (spells: readonly SpellDef[]): boolean => {
  let v = kitHasFanStrikeCache.get(spells);
  if (v === undefined) {
    v = false;
    for (const s of spells) {
      if (roleOf(s) === 'strike' && (s.aoe || nextSwingFanCap(s) != null)) { v = true; break; }
    }
    kitHasFanStrikeCache.set(spells, v);
  }
  return v;
};

const kitNeedsSelfPackDistsCache = new WeakMap<readonly SpellDef[], boolean>();
const kitNeedsSelfPackDists = (spells: readonly SpellDef[]): boolean => {
  let v = kitNeedsSelfPackDistsCache.get(spells);
  if (v === undefined) {
    const fillers = packFillersOf(spells);
    v = fillers.hasCleave || fillers.hasSwipe || novaKiteKitOf(spells).length > 0;
    if (!v) {
      for (const s of spells) {
        if (packDensityOf(s) && !groundMultiOf(s)) { v = true; break; }
      }
    }
    kitNeedsSelfPackDistsCache.set(spells, v);
  }
  return v;
};

export function installPickAction(ctx: CombatContext, deps: installPickActionDeps): void {
  const resolveDispelTarget = (...args: any[]) => (ctx.resolveDispelTarget as Function)(...args);
  const dispellableAurasOn = (...args: any[]) => (ctx.dispellableAurasOn as Function)(...args);
  const push = (e: any) => ctx.push(e);
  const enemyCastBySide = ctx.enemyCastBySide;
  const player = ctx.player;
  const pet = ctx.pet;
  const totems = ctx.totems;
  const effects = ctx.effects;
  const unitItems = ctx.unitItems;
  const unitItemCd = ctx.unitItemCd;
  const rng = ctx.rng;
  const cfg = ctx.cfg;
  const combatObjectBag = [...(cfg.combatObjects ?? [])];
  // A button re-arms instead of despawning, so its slot is never spent.
  // Cite: GameObject.cpp:1458 UseDoorOrButton; types.ts combatObjectsReusable.
  const reusableObjects = new Set((cfg.combatObjectsReusable ?? []).map((e) => e | 0));
  // Worth clicking THIS tick, off the per-tick input the game layer supplies (S6b mechanism 2). No
  // input at all means the fight has no instance rule, and every bag entry is actionable.
  const objectActionable = (goEntry: number): boolean =>
    ctx.tickInputs?.actionableObjects?.has(goEntry | 0) ?? true;

  // The two companion knobs, stamped onto the snapshot from the tick input. The provider reads them
  // off a LIVE companion when nothing supplies them, which a worker cannot hold (S6b).
  const stampCompanionKnobs = (side: string, snap: RotationSnapshot): void => {
    const k = ctx.tickInputs?.companionKnobs?.get(side);
    if (!k) return;
    snap.aoeMode = k.aoeMode;
    snap.offHealAllowed = k.offHeal ? 1 : 0;
  };
  /** Where a bag object stands, in combat yards, for the walk to it. */
  const objectSites = new Map(
    (cfg.combatObjectSites ?? []).map((sp) => [sp.goEntry | 0, sp.origin] as const),
  );

  const distanceBetween = ctx.distanceBetween;
  const threatOf = ctx.threatOf;
  const livingHostilesFor = ctx.livingHostilesFor;
  const livingEnemies = ctx.livingEnemies;
  /** Endless: multi AI counts combat hostiles only (not the passive stream). */
  const combatEnemyCount = (): number =>
    (typeof ctx.livingCombatEnemies === 'function' ? ctx.livingCombatEnemies() : livingEnemies()).length;
  /** EVENT_T_SPELLHIT pulse still live: the spell landed on `f` this tick or the last one. */
  const freshSpellHit = (f: Fighter): boolean =>
    f.spellHitAt != null && ctx.t - f.spellHitAt <= ctx.tickMs * SLOW_IDLE_RATE;
  /** Break-on-damage CC (poly/sap/gouge/shackle/blind) — our blast must not count it as pack. */
  const ccProtected = (u: Fighter): boolean => ctx.ccProtected?.(u) === true;
  /** combatEnemyCount minus the mobs an AoE would only free. Positionless fallback. */
  const blastEnemyCount = (): number => {
    const pool = typeof ctx.livingCombatEnemies === 'function'
      ? ctx.livingCombatEnemies()
      : livingEnemies();
    let n = 0;
    for (const e of pool) if (!ccProtected(e)) n++;
    return n;
  };
  // Hoisted at install scope on purpose: two readers ~500 lines apart both need these, and a const
  // arrow would sit in its temporal dead zone for one of them. Interrupt immunity is 144 rows.
  function interruptCanLand(tgt: Fighter, s: SpellDef): boolean {
    return !isImmuneToMechanicId(tgt.immunity, interruptEffectMechanicId(s), {
      schoolImmuneMask: tgt.spec.schoolImmuneMask,
      mechanicImmuneMask: tgt.spec.mechanicImmuneMask,
    });
  }
  /** Soonest interruptible bar this unit can actually land a kick on. */
  function pickInterruptTarget(f: Fighter, focus: Fighter, spell: SpellDef): Fighter | null {
    const remainingMs = (u: Fighter): number => {
      if (u.castingSpell) return Math.max(0, u.castFinishAt - ctx.t);
      if (u.channeling) return Math.max(0, u.channeling.endsAt - ctx.t);
      return Number.POSITIVE_INFINITY;
    };
    const ok = (u: Fighter): boolean =>
      !dead(u)
      && u !== f
      && unitInterruptibleCast(u, ctx.t) != null
      && interruptCanLand(u, spell)
      && !interruptClaimedByOther(u.side, f.side)
      && canCastSpell(f, u, spell);
    let best: Fighter | null = null;
    let bestRem = Number.POSITIVE_INFINITY;
    const consider = (u: Fighter): void => {
      if (!ok(u)) return;
      const rem = remainingMs(u);
      if (best == null || rem < bestRem) {
        best = u;
        bestRem = rem;
      }
    };
    consider(focus);
    for (const h of hostilesOf(f)) {
      if (h !== focus) consider(h);
    }
    return best;
  }
  // A CC whose whole hold ends on the first hit — Shackle Undead, Polymorph, Banish, Hibernate, Freezing
  // Trap. Exactly the rows breakBreakableCcOnDamage shatters.
  const isBreakOnDamageCc = (s: SpellDef): boolean =>
    s.effects.some((e) => e.kind === 'cc' && e.breakOnDamage === true);

  function hardControlCanLand(src: Fighter, tgt: Fighter, s: SpellDef): boolean {
    if (isHostileSpellDef(s) && !spellTargetTypeAllowed(s, tgt.creatureType)) return false;
    if (spellTemplateImmune(tgt, s)) return false;
    if (
      isHostileSpellDef(s)
      && isImmuneToHarmfulAura(
        tgt.immunity,
        {
          schoolMask: schoolMaskFromSchoolName(s.school) || schoolMaskFromSchool(s.school),
          positive: false,
          noSchoolImmunities: spellPiercesSchoolImmunity(s),
        },
        {
          schoolImmuneMask: tgt.spec.schoolImmuneMask,
          mechanicImmuneMask: tgt.spec.mechanicImmuneMask,
        },
      )
    ) {
      return false;
    }
    // The caster's tracked seat is already on another live body: casting here would only MOVE it,
    // freeing that mob, so no rule offers a second sheep. Cite: PlayerbotAI.cpp:4523 CanReceive.
    if ((ctx.trackedAuraSeats?.(src, s) ?? []).some((seat) => seat.side !== tgt.side)) return false;
    const ccEffs = s.effects.filter((e): e is CcEffect => e.kind === 'cc');
    const hasRoot = s.effects.some((e) => e.kind === 'root');
    // Taunt / threat / pure utility under role control â€” no hard-CC gate.
    if (ccEffs.length === 0 && !hasRoot) return true;

    const srcIsPc =
      src.spec.isPlayerOrPet ?? (src.side === 'player' || src.side === 'pet' || isAllySide(src.side));
    const tgtIsPc =
      tgt.spec.isPlayerOrPet ?? (tgt.side === 'player' || tgt.side === 'pet' || isAllySide(tgt.side));
    const isPvp = !!(srcIsPc && tgtIsPc);

    for (const eff of ccEffs) {
      if (ccImmune(tgt, eff.mechanic, eff.onlyTypes)) continue;
      if (
        isImmuneToMechanic(tgt.immunity, eff.mechanic, {
          schoolImmuneMask: tgt.spec.schoolImmuneMask,
          mechanicImmuneMask: tgt.spec.mechanicImmuneMask,
        })
      ) {
        continue;
      }
      // Peek DR without advancing (applyDr mutates). Duration-dim groups go immune at step 3.
      const key = drGroupOf(eff.mechanic);
      const rec = tgt.dr.get(key);
      const step = rec && rec.resetAt > ctx.t ? rec.step : 0;
      if (isDiminishingReturnsGroupDurationDiminished(key, isPvp) && drFactor(step) <= 0) continue;
      return true;
    }
    if (hasRoot) {
      if (isMechanicImmune(tgt.spec.mechanicImmuneMask, 'root')) return false;
      if (
        isImmuneToMechanic(tgt.immunity, 'root', {
          schoolImmuneMask: tgt.spec.schoolImmuneMask,
          mechanicImmuneMask: tgt.spec.mechanicImmuneMask,
        })
      ) {
        return false;
      }
      const rootKey = drGroupOf('root');
      const rec = tgt.dr.get(rootKey);
      const step = rec && rec.resetAt > ctx.t ? rec.step : 0;
      if (isDiminishingReturnsGroupDurationDiminished(rootKey, isPvp) && drFactor(step) <= 0) return false;
      return true;
    }
    return false;
  }

  // A living hostile that is NOT the focus and is NOT already under hard control — the mob a CC rule
  // should land on. Deterministic: nearest, then lowest side, and no rng.
  function pickHostileByKillOrder(
    f: Fighter,
    hostiles: readonly Fighter[],
    order: readonly number[],
  ): Fighter | null {
    // A charmed body of the picker's OWN side is already in `hostiles`, because charm flips a
    // unit's faction (sessionPools.ts:170-173). Damaging it is what frees it.
    const mine = isEnemySide(f.side);
    for (const entry of order) {
      for (const h of hostiles) {
        if (dead(h)) continue;
        if (killOrderTakesCharmed(entry | 0, isCharmed(h), isEnemySide(h.side) === mine)) return h;
        if (killOrderEntryMatches(entry | 0, h.spec.creatureEntry ?? 0)) return h;
      }
    }
    return null;
  }

  function pickCcTarget(f: Fighter, focus: Fighter | null, spell?: SpellDef): Fighter | null {
    // Hard control only: stun/fear/incap/charm. Root is not in IsNeutralized
    // (PlayerbotAI.cpp:5458-5485) and isControlledHard (crowdControl.ts) omits it.
    const cands = hostilesOf(f).filter((e) => (
      !dead(e)
      && e !== focus
      && !(e.stunnedUntil > ctx.t || e.fearedUntil > ctx.t || e.incapUntil > ctx.t
        || e.charmedUntil > ctx.t)
      // Our own damage already shattered this caster's CC on this body once. The timer test only sees
      // a LIVE control, so the rule re-fired every GCD. An expired CC may be refreshed; a broken one not.
      && e.ccDamageBrokenBy?.has(f.side) !== true
      // The CC has to be able to LAND on this body. Without it the rule only asked "is there another
      // mob", so a Polymorph fired every GCD at a mechanic-immune elite and got immune back forever.
      && (spell == null || hardControlCanLand(f, e, spell))
    ));
    if (!cands.length) return null;
    // Blind peel: FindAttacker then Blind that body (PlayerbotRogueAI.cpp:208-219). Party form —
    // prefer the hostile whose GetVictim is a living ally, not the off-healer Poly still wants.
    // Mechanic `disoriented` is Blind (2094); Polymorph is `polymorph` and keeps healer preference.
    const isBlind = spell != null && spell.effects.some(
      (e) => e.kind === 'cc' && e.breakOnDamage === true && e.mechanic === 'disoriented',
    );
    const peelTrainers = isBlind && cfg.enemiesAreATeam === true
      ? cands.filter((e) => {
        const v = foeOf(e);
        return v !== e && !dead(v) && friendlyPoolOf(f).includes(v);
      })
      : [];
    // Arena: off-target CC prefers the healer that is not the kill focus.
    // Cite: PlayerbotClassAI.cpp:659 GetBotJob; sessionPools preferFocusHostile.
    const arenaHealers = cfg.enemiesAreATeam === true
      ? cands.filter((e) => e.spec.groupRole === 'healer')
      : [];
    // Break-on-damage CC (Blind/Poly) on a melee in the pile dies to the next swing/cleave.
    // With no off-healer, prefer a caster so the hold lasts. Cite: spells.json 2094 breakOnDamage;
    // PlayerbotAI.cpp:5458-5485 IsNeutralized (do not attack the CC'd body).
    let pool = peelTrainers.length > 0
      ? peelTrainers
      : (arenaHealers.length > 0 ? arenaHealers : cands);
    if (
      peelTrainers.length === 0
      && arenaHealers.length === 0
      && cfg.enemiesAreATeam === true
      && spell != null
      && isBreakOnDamageCc(spell)
    ) {
      const casters = cands.filter((e) => unitIsCaster(e, ctx.spellOf));
      if (casters.length > 0) pool = casters;
    }
    if (!ctx.unitPositionsMutable) return pool[0]!;
    // Prefer a body the spell can actually reach. Hard-skipping out-of-range candidates broke
    // the same-comp mirror (repro-duel-offtarget-range.mjs); sorting still picks someone so the
    // row fires, but Blind 10 yd no longer prefers a 20 yd peeler over one in the disc.
    // Cite: Spell.cpp:6217-6244 CheckRange.
    const inSpellRange = (e: Fighter): boolean => {
      if (spell == null) return true;
      const dist = distanceBetween(f, e);
      if (dist == null) return true;
      return isInSpellRange(
        dist, spellGateRangeMaxYd(spell), spellGateRangeMinYd(spell),
        ctx.isMoving(f.side) && ctx.isMoving(e.side),
        f.spec.combatReachYd, e.spec.combatReachYd,
      );
    };
    return pool.slice().sort((a, b) => {
      const aIn = inSpellRange(a);
      const bIn = inSpellRange(b);
      if (aIn !== bIn) return aIn ? -1 : 1;
      const da = distanceBetween(f, a);
      const db = distanceBetween(f, b);
      if (da == null && db == null) return String(a.side).localeCompare(String(b.side));
      if (da == null) return 1;
      if (db == null) return -1;
      const d = da - db;
      return d !== 0 ? d : String(a.side).localeCompare(String(b.side));
    })[0]!;
  }

  /** Hostiles relative to `f` — BG enemy providers must not see "livingEnemies" (their own team). */
  const hostilesOf = (f: Fighter): Fighter[] => {
    if (isEnemySide(f.side)) return livingHostilesFor(f);
    return (typeof ctx.livingCombatEnemies === 'function' ? ctx.livingCombatEnemies() : livingEnemies());
  };
  const friendlyPoolOf = ctx.friendlyPoolOf;
  const foePoolOf = ctx.foePoolOf;
  const keepUpLookup = {
    spell: (id: number) => ctx.spellOf?.(id),
    chainOf: ctx.spellChainOf,
  };
  const auraCovered = (ids: ReadonlySet<number>, ref: number): boolean =>
    keepUpAlreadyPresent(ids, ref, keepUpLookup);
  // False when `aura` is a periodic energize and this body has no such pool at all.
  const canHoldEnergizeAura = (u: Fighter, aura: number): boolean => {
    const sp = ctx.spellOf?.(aura);
    if (!sp) return true;
    for (const e of sp.effects ?? []) {
      if (e.kind !== 'restore_power' || (e.amountPerTick ?? 0) < 0) continue;
      const pool = e.powerType != null
        ? e.powerType | 0
        : (sp.rawEffects?.[(sp.effects ?? []).indexOf(e)]?.miscValue ?? 0) | 0;
      if (maxPowerOfType(u, pool) <= 0) return false;
    }
    return true;
  };
  // Living friendlies OTHER than `f` that do not hold `aura` (or a same-or-stronger rank/family).
  // ONE list, so a party keep-up's gate and its cast target cannot disagree.
  const alliesMissingAura = (f: Fighter, aura: number, among?: AllyFilter): Fighter[] => {
    const id = aura | 0;
    const out: Fighter[] = [];
    if (id <= 0) return out;
    const want = allyFilterIsAny(among) ? undefined : among;
    for (const u of friendlyPoolOf(f)) {
      if (u === f || dead(u) || auraCovered(u.buffActive, id)) continue;
      // The row's own filter. A pet carries no player class, so `classId: 0` is the board's `pet`
      // column — the same split blessingCellKey writes. Cite: paladinBuffs.ts:38.
      if (want) {
        if (want.unit && u.side !== want.unit) continue;
        if (want.role != null && u.spec.groupRole !== want.role) continue;
        if (want.notRole != null && u.spec.groupRole === want.notRole) continue;
        if (want.classId != null && unitClassId(u) !== want.classId) continue;
      }
      // The cast can only reach what the fan enumerates: a totem or a guardian never registers the
      // aura, so leaving it here spends the buffer's mana on it every window.
      if (!isPartyFanBody(u)) continue;
      // Nor can a body with no pool hold an energize aura, so the row would re-fire forever on it.
      // Cite: SpellAuras.cpp:4838 GetMaxPower(power) == 0 → the aura never lands.
      if (!canHoldEnergizeAura(u, id)) continue;
      out.push(u);
    }
    return out;
  };
  // Nearest of those in planar yards. Without geometry (headless / fixtures) the first in pool order
  // — a session that cannot measure the room still buffs the party.
  const nearestAllyMissingAura = (f: Fighter, aura: number, among?: AllyFilter): Fighter | null => {
    const pool = alliesMissingAura(f, aura, among);
    if (!pool.length) return null;
    const here = ctx.posOf?.(f.side);
    if (!here) return pool[0]!;
    let best: Fighter | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const u of pool) {
      const p = ctx.posOf?.(u.side);
      if (!p) continue;
      const d = combatDistanceYd(here, p);
      if (d != null && d < bestD) { bestD = d; best = u; }
    }
    return best ?? pool[0]!;
  };
  // The ally a friendly cast would land on, once per tick per caster: canCastSpell asks it for every
  // heal in the kit and the resolver walks the pool. Cite: applyHealEffect.ts:104 same resolver.
  const healTargetBySide = new Map<string, Fighter | null>();
  let healTargetTick = -1;
  const healTargetOf = (f: Fighter): Fighter | null => {
    if (ctx.t !== healTargetTick) {
      healTargetBySide.clear();
      healTargetTick = ctx.t;
    }
    const hit = healTargetBySide.get(f.side);
    if (hit !== undefined) return hit;
    const tgt = lowestHpFriendlyOf(f);
    healTargetBySide.set(f.side, tgt);
    return tgt;
  };
  // A cast refused for SIGHT waits on the unit's own feet, so it must re-decide while it walks or it
  // sleeps through its own arrival. Cite: slowUpdate.ts:133-135, the same rule a relocating unit gets.
  const blockedBySight = (f: Fighter): false => {
    f.decideDirty = true;
    return false;
  };
  // CheckCast refuses a heal without sight, and one started anyway holds the caster still for its whole
  // cast time. Cite: Spell.cpp:4742; sessionMotion.ts:1366 `casting` gates motion.
  const friendlyCastReaches = (f: Fighter, ally: Fighter): boolean => {
    if (!cfg.navLos || ally === f) return true;
    const ps = ctx.unitPositionsMutable;
    if (navSightClear(cfg, ps?.[f.side], ps?.[ally.side])) return true;
    blockedBySight(f);
    return false;
  };
  const isCharmed = ctx.isCharmed;
  const applyDr = (...args: any[]) => (ctx.applyDr as Function)(...args);
  const applySpell = (...args: any[]) => (ctx.applySpell as Function)(...args);
  const startOrCast = (...args: any[]) => (ctx.startOrCast as Function)(...args);
  const step = (...args: any[]) => (ctx.step as Function)(...args);
  // Wave 4 fix-up: createSession closures the peel left as bare identifiers.
  const behindOk = (...args: any[]) => (ctx.behindOk as Function)(...args);
  const view = (f: Fighter): CombatantView => (ctx.view as (f: Fighter) => CombatantView)(f);
  const useItem = (...args: any[]) => (ctx.useItem as Function)(...args);
  const controlActive = (...args: any[]) => (ctx.controlActive as Function)(...args);
  const dead = deps.dead;
  const isControlled = deps.isControlled;
  const isControlledHard = deps.isControlledHard;
  const isWeaponAction = deps.isWeaponAction;
  const isBreaker = deps.isBreaker;

  // The plan is a property of the ROSTER, not of the asking fighter, and every seat rebuilt it: a
  // 40-man raid built a 40-seat plan 40 times a tick. Roles are fixed, so one build per tick is exact.
  let raidPlanAt = -1;
  let raidPlanSeats: readonly Fighter[] | null = null;
  let raidPlanCached: RaidPlan | null = null;
  const liveRaidPlan = (): RaidPlan => {
    const now = ctx.t;
    // Keyed on the BLOCK's identity, not its length: the same array object comes back until the roster
    // gen moves, and a length compare cannot see a seat RECYCLED onto a different occupant.
    const seats = ctx.allyBlock();
    if (raidPlanCached && raidPlanAt === now && raidPlanSeats === seats) return raidPlanCached;
    const plan = buildLiveRaidPlan();
    raidPlanAt = now;
    raidPlanSeats = seats;
    raidPlanCached = plan;
    return plan;
  };
  const buildLiveRaidPlan = (): RaidPlan => {
    const saved = normalizeRaidPlan(Reflect.get(cfg, 'raidPlan'));
    const inputs: RaidPlanSeatInput[] = [];
    const pushSeat = (f: Fighter): void => {
      const role = f.spec.groupRole;
      if (!role) return;
      inputs.push({
        seatId: f.side,
        role: role === 'damage' ? 'dps' : role,
        subgroup: f.spec.subgroup ?? 0,
        ...(f.spec.classId != null ? { cls: f.spec.classId } : {}),
      });
    };
    pushSeat(player);
    for (const al of ctx.allyBlock()) pushSeat(al);
    if (!inputs.length) {
      return saved ?? buildRaidPlan([{ seatId: player.side, role: 'dps', subgroup: 0 }]);
    }
    const base = !saved
      ? buildRaidPlan(inputs)
      : buildRaidPlan(inputs, {
        mainTank: saved.mainTank,
        offTanks: saved.offTanks,
        camps: saved.camps,
        healAssignments: saved.healAssignments,
      });
    const entries: number[] = [];
    for (const e of livingEnemies()) {
      const id = e.spec.creatureEntry;
      if (id != null) entries.push(id);
    }
    return overlayEncounterRaidPlan(base, inputs, entries);
  };

  const raidSnapFields = (f: Fighter, plan: RaidPlan): Pick<
    RotationSnapshot,
    'isMainTank' | 'isOffTank' | 'myJob' | 'myCamp' | 'assignedHealSubgroup'
  > => {
    const sp = seatPlanOf(plan, f.side);
    const job = sp?.job ?? 'dps';
    const healSub = assignedHealSubgroupOf(plan, f.side);
    return {
      isMainTank: isMainTankSeat(plan, f.side),
      isOffTank: isOffTankSeat(plan, f.side),
      myJob: RAID_JOB_CODE[job],
      myCamp: raidCampCode(campOfSeat(plan, f.side)),
      ...(healSub != null ? { assignedHealSubgroup: healSub } : {}),
    };
  };

  // The main tank takes the first in-combat hostile and the off-tank the second when there is one,
  // never an unpulled stream inject. On a one-boss pull the second is an add, so the off-tank peels.
  const tankPlanFocus = (f: Fighter, foe: Fighter, plan: RaidPlan): Fighter => {
    const idx = tankBossIndex(plan, f.side);
    if (idx == null) return foe;
    const pool = typeof ctx.freeFireHostilesFor === 'function'
      ? ctx.freeFireHostilesFor(f)
      : livingHostilesOf(f);
    const hostiles = pool.filter((h) => !dead(h) && isEnemySide(h.side)
      && (typeof ctx.enemyHasThreat !== 'function' || ctx.enemyHasThreat(h)));
    if (hostiles.length <= 1) return foe;
    if (idx > 0 && !tankFocusSplitsBosses(hostiles.map((h) => (h.spec.creatureEntry ?? 0) | 0))) {
      return foe;
    }
    const sorted = hostiles.slice().sort((a, b) => {
      const ka = sideIdSortKey(a.side);
      const kb = sideIdSortKey(b.side);
      return ka < kb ? -1 : ka > kb ? 1 : String(a.side).localeCompare(String(b.side));
    });
    return sorted[Math.min(idx, sorted.length - 1)] ?? foe;
  };
  const ccImmune = deps.ccImmune;
  const spellTemplateImmune = deps.spellTemplateImmune;
  const canAffordSpell = deps.canAffordSpell;
  const spellCost = deps.spellCost;
  const comboOn = deps.comboOn;
  const foeOf = deps.foeOf;
  const ensurePlayerFocus = deps.ensurePlayerFocus;
  const lowestHpFriendly = deps.lowestHpFriendly;
  // Faction-relative triage: the resolver applyHealEffect lands on. Cite: applyHealEffect.ts:104.
  const lowestHpFriendlyOf = (f: Fighter): Fighter | null => ctx.lowestHpFriendlyOf?.(f) ?? lowestHpFriendly();

  const onCooldown = (f: Fighter, spell: SpellDef): boolean => {
    const t = ctx.t;
    if ((f.cooldowns.get(spell.id) ?? 0) > t) return true;
    const c = spell.category;
    if (c != null && (f.categoryCooldowns.get(c) ?? 0) > t) return true;
    return false;
  };

  // StartRecoveryTime is the whole rule. The role fallback that lived here synthesized a GCD onto rows
  // the DBC leaves off it, and it was a second copy of recovery.ts that drifted.
  const canAfford = (f: Fighter, spell: SpellDef): boolean => canAffordSpell(f, spell);

  /** Stealth / positional cast gates (Spell.cpp ONLY_STEALTHED / behind / front). */
  const stealthPosError = (f: Fighter, foe: Fighter, spell: SpellDef): string | null => {
    // Stealth enter and Charge refuse while in combat; Vanish is not flagged and may re-stealth. The
    // combat flag is the real 5 s timer, so leaving combat lets the next engagement Charge again.
    if (spell.notInCombatOnly && fighterIsInCombat(f, ctx.t)) return 'not in combat only';
    if (spell.requiresStealth && !f.stealthed) return 'must be stealthed';
    if (spell.requiresBehind && !behindOk(f, foe)) return 'not behind';
    // The in-front facing gate is PLAYERS ONLY — the C++ test is `m_trueCaster->IsPlayer()`, so a
    // creature never refuses on it and neither does a pet. Player-ness, not seat: a duel seats a
    // player body on `enemy` too, and gating on the seat alone made facing one-sided (KI-1076).
    // Cite: Spell.cpp:6249 SPELL_FAILED_UNIT_NOT_INFRONT; types.ts:143 classId is the player marker.
    if (
      spell.requiresFacing
      && (f.side === 'player' || isAllySide(f.side) || f.spec.classId != null)
      && ctx.isInFrontArc
      && !ctx.isInFrontArc(f, foe)
    ) return 'must be facing target';
    // requiresFront: the eight Gouge ranks, with a real arc test now that geometry exists. BOTH units
    // must have each other in front, and no geometry still allows.
    if (spell.requiresFront && ctx.facingTargetsFront?.(f, foe) === false) return 'not in front';
    return null;
  };

  /** Snapshot for optional condition gates (fights without conditions skip entirely). */
  const conditionSnapshotFor = (f: Fighter): ConditionSnapshot => {
    const cctx = f.spec.conditionCtx;
    return {
      level: f.spec.level,
      auras: f.buffActive,
      knownSpells: f.spec.spells.map((s) => s.id),
      inCombat: fighterIsInCombat(f, ctx.t),
      // Player-state suppliers captured at fight start (game.ts). Absent on mobs/tests →
      // REPUTATION_RANK/SKILL/GAME_EVENT/TEAM/PVP_RANK conditions stay unsupported (fail closed).
      ...(cctx?.reputationRanks
        ? { reputationRank: (fid: number): number => cctx.reputationRanks![fid] ?? 0 }
        : {}),
      ...(cctx?.skillValues
        ? { skillValue: (sid: number): number | undefined => cctx.skillValues![sid] }
        : {}),
      ...(cctx?.activeEvents ? { activeEvents: cctx.activeEvents } : {}),
      ...(cctx?.activeHolidays ? { activeHolidays: cctx.activeHolidays } : {}),
      ...(cctx?.team != null ? { team: cctx.team } : {}),
      ...(cctx?.pvpRank != null ? { pvpRank: cctx.pvpRank } : {}),
      ...(cctx?.worldStates
        ? { worldState: (id: number): number => getVariable(cctx.worldStates, id) }
        : {}),
      worldScript: isConditionFulfilled,
    };
  };

  // School lockout gate (Object.cpp IsSpellReady CheckLockout branch). Only PreventionType == SILENCE
  // spells are blocked; prefer baked field.
  const schoolLocked = (f: Fighter, spell: SpellDef): boolean =>
    isSpellSchoolLocked(spell, f.schoolLockoutUntil, ctx.t);

  // Living pet for pet_heal / applyTo:'pet' target rules (FS3). Player â†’ session pet; ally â†’ the seat
  // its own spec names (E1.1), no seat index.
  const livingPetOf = (f: Fighter): Fighter | null => {
    if (f.side === 'player') return pet && !dead(pet) ? pet : null;
    if (isAllySide(f.side)) {
      const ps = f.spec.petSide;
      if (!ps) return null;
      const mapped = ctx.bySide(ps);
      return mapped && mapped.side === ps && !dead(mapped) ? mapped : null;
    }
    return null;
  };

  /** Spell needs a living pet target (Mend Pet role, or all buff effects are applyTo pet). */
  const requiresLivingPetTarget = (spell: SpellDef): boolean => {
    if (roleOf(spell) === 'pet_heal') return true;
    const buffs = spell.effects.filter((e) => e.kind === 'buff' && !isHostileBuffEffect(e, e.amount));
    return buffs.length > 0 && buffs.every((e) => e.kind === 'buff' && e.applyTo === 'pet');
  };

  // A unit is "engaged" for Charge when it is in the melee band of a living hostile, and Charge cannot
  // re-fire while engaged. Without geometry nothing is engaged by distance, so the used flag alone gates.
  const isInMeleeOf = (a: Fighter, b: Fighter): boolean => {
    const d = distanceBetween(a, b);
    if (d == null) return false; // no geometry â†’ do not invent engagement
    return d <= MIN_AGGRO_DISTANCE;
  };
  const livingHostilesOf = (f: Fighter): Fighter[] => livingHostilesFor(f);
  const isEngagedMelee = (f: Fighter): boolean => {
    if (!ctx.unitPositionsMutable) return false;
    for (const h of livingHostilesOf(f)) {
      if (isInMeleeOf(f, h)) return true;
    }
    return false;
  };
  // The Charge and Intercept detector, symmetric across sides. Prefer the raw charge opcode over the
  // baked role: the real spells bake as control or strike, while fixtures use the role.
  const isChargeRole = (spell: SpellDef): boolean => {
    const hit = chargeRoleCache.get(spell);
    if (hit !== undefined) return hit;
    const v = roleOf(spell) === 'charge'
      || (spell.rawEffects?.some((r) => (r.effect | 0) === SPELL_EFFECT_CHARGE) ?? false)
      // Free rage dump opener (Charge ranks) even when bake role is control/utility.
      || ((spell.rageGenerated ?? 0) > 0 && (spell.cost ?? 0) === 0
        && (spell.rangeMax ?? 0) > MIN_AGGRO_DISTANCE);
    chargeRoleCache.set(spell, v);
    return v;
  };
  // The Charge band. CheckRange uses SpellRange min and max; melee is SPELL_FAILED_TOO_CLOSE.
  // Cite: Spell.cpp:6242-6246. No geometry still allows (legacy 1v1).
  const chargeCastOk = (f: Fighter, foe: Fighter, spell: SpellDef): boolean => {
    if (!isChargeRole(spell)) return true;
    if (f.pendingCharge) return false;
    // 'hold' bans motion and a charge IS motion — advanceChargeMove cancels the leap, so
    // picking one here would spend the rage/CD on a step the unit may not take.
    if (ctx.unitStance?.get(f.side) === 'hold') return false;
    const dist = distanceBetween(f, foe);
    if (dist == null) return true;
    // Other storey: planar 8–25 is a ledge Charge. Walk the ramp instead.
    if (!planarRangeHonestYd(ctx.posOf?.(f.side), ctx.posOf?.(foe.side))) return false;
    return isInSpellRange(
      dist, spellGateRangeMaxYd(spell), spellGateRangeMinYd(spell),
      ctx.isMoving(f.side) && ctx.isMoving(foe.side),
      f.spec.combatReachYd, foe.spec.combatReachYd,
    );
  };

  // A local-combat backstop: an offensive spell with a MISSING baked range skips the range gate and used
  // to fire cross-map. Melee-shaped picks cap at reach and the rest at the acquire radius.
  const beyondAcquireRange = (f: Fighter, foe: Fighter, spell: SpellDef): boolean => {
    const acq = cfg.acquireRangeYd;
    if (acq == null) return false;
    if (selfCenteredOf(spell)) return false;
    const meleeShaped = !!spell.strikeBonus || !!spell.onNextSwing || roleOf(spell) === 'strike';
    if (!meleeShaped && !isHostileSpellDef(spell) && roleOf(spell) !== 'shoot'
      && !spellFoeDirectedOpaque(spell)) return false;
    const d = distanceBetween(f, foe);
    const cap = Math.max(
      meleeShaped && !((spell.rangeMax ?? 0) > 0) ? MIN_AGGRO_DISTANCE : acq,
      spell.rangeMax ?? 0,
    );
    return d != null && d > cap;
  };

  /** Combat roles that require a living hostile (not self/stand-down sentinel). */
  const needsLiveHostile = (spell: SpellDef): boolean => {
    if (selfCenteredOf(spell)) return false;
    if (isHostileSpellDef(spell)) return true;
    const r = roleOf(spell);
    return r === 'nuke' || r === 'instant_nuke' || r === 'dot' || r === 'shoot'
      || r === 'strike' || r === 'charge' || r === 'judgement';
  };

  /** Judgement / Holy Shock geometry gate. Cite: predicates.spellFoeDirectedGeometry. */
  const foeDirectedOpaqueCast = spellFoeDirectedGeometry;

  // When each unit's current mechanic run-out started, so one that cannot succeed stops eating the GCD.
  // In a 40-man stacked on a boss the row's own end condition is never true — 4 of 5 windows, 0 casts.
  const runoutSince = new Map<Side, { kind: string; at: number }>();
  /** Live halt window per side, so `halt_dps` is pushed once per window and not once per tick. */
  const haltSince = new Map<Side, string>();
  const RUNOUT_YIELD_AFTER_MS = 4_000;

  // Does this move still own the unit past the give-up? The MECHANIC answers, not a name list: a bomb is
  // clear after 4 s, while a stance row is its whole phase and an avoid lives as long as its hazard.
  const moveOwnsPastDeadline = (f: Fighter, move: RuleMove): boolean => {
    if (move.kind === 'keep_range' || move.kind === 'spread') return true;
    // A walk to a bag object owns the unit while that object is still worth pressing, for the same reason
    // an avoid does. A gnomeface button is ~40 yd off, so the flat give-up abandoned every press.
    if (move.kind === 'move_to') {
      const go = f.pendingObjectClick;
      return go != null && combatObjectBag.includes(go | 0)
        && objectActionable(go);
    }
    if (move.kind !== 'avoid_zone') return false;
    return hostileHazardsThisTick(ctx, dead).some((h) => hazardMatches(h, move.id));
  };

  const canCastSpell = (
    f: Fighter, foe: Fighter, spell: SpellDef,
    // Skip ONLY the shapeshift gate, so a caller can ask "ready but for the stance". Every other
    // refusal stands. Cite: stancePrereq.ts:22 stanceIntentForPress, the press-side twin of this.
    opts?: { ignoreForm?: boolean },
  ): boolean => {
    const t = ctx.t;
    if (isNonCastableTalentProc(spell)) return false;
    // A live channel OCCUPIES the caster until it ends. Beginning one sets no cast bar, so the GCD
    // released the caster halfway through and the next pick cancelled it. An instant kick still clips.
    if (f.channeling && t < f.channeling.endsAt && !interruptCastOf(spell) && !hasAttrEx4(spell, SPELL_ATTR_EX4.ALLOW_CAST_WHILE_CASTING)) return false;
    if (!canAfford(f, spell) || onCooldown(f, spell)) return false;
    if (schoolLocked(f, spell)) return false;
    // Spell.cpp:4604-4612 CheckCast SPELL_FAILED_ONLY_OUTDOORS. `outdoors` is absent on every
    // surface but a measured-indoors dungeon pull, and absent is outdoors.
    if (!spellAllowedAtLocation(spell, cfg.outdoors !== false, cfg.battlegroundMap)) return false;
    // Player EquippedItem gate â€” Backstab with mace was canCast true then startOrCast silent
    // no-op every GCD (KI-604). Cite: Spell.cpp:6539â€“6543; equippedItemGate.ts; stepSession.
    if (isPlayerCharacterSide(f.side) && playerMissingRequiredEquippedItem(spell, f.spec)) return false;
    // Spell.cpp CheckItems — Soul Shard reagents etc. (KI-804 Shadowburn).
    if (!canPaySpellReagents(f, spell)) return false;
    // Spell.cpp CheckTargetCreatureType â€” don't pick a hostile spell this target can't receive.
    if (isHostileSpellDef(spell) && !selfCenteredOf(spell) && !spellTargetTypeAllowed(spell, foe.creatureType)) return false;
    // Skip abilities the focus will be immune to, weapon strikes included — a Heroic Strike into a
    // Blessing of Protection is refused here rather than fizzling. Cite: Unit.cpp IsImmuneToSpell.
    if (focusImmunityBlocksSpell(
      spell,
      foe,
      selfCenteredOf(spell) ? blastEnemyCount() : 1,
    )) return false;
    // The foe lookup hands the caster ITSELF back as the stand-down sentinel when no hostile lives, so a
    // hostile cast needs a live non-self target. A self-centred AoE still fans with no focus.
    if (needsLiveHostile(spell) && (foe === f || (dead(foe) && !hasAttrEx2(spell, SPELL_ATTR_EX2.ALLOW_DEAD_TARGET)))) return false;
    // FS3: pet-only heals/buffs refuse without a living pet (no silent self-apply).
    if (requiresLivingPetTarget(spell) && !livingPetOf(f)) return false;
    if (spell.requiresComboPoints && comboOn(f, foe) <= 0) return false;
    // Form-only abilities blocked; NOT_SHAPESHIFT leaves form then casts (resolveFormCast).
    if (opts?.ignoreForm !== true && !resolveFormCast(spell, f.form).ok) return false;
    if (stealthPosError(f, foe, spell)) return false;
    // Howl is dest-at-caster (rangeMax 0), so the yard gate below never sees it. Melee already
    // has Hamstring; a live snare is the keep-up. Cite: classify.ts piercingHowlRefused.
    if (isPiercingHowlSpell(spell) && foe !== f && !dead(foe)) {
      const howlDist = distanceBetween(f, foe);
      if (piercingHowlRefused({
        inMelee: inMeleeBand(howlDist ?? null, !!ctx.unitPositionsMutable),
        snared: controlActive(foe, 'snare') === true,
        snareImmune: isImmuneToMechanic(foe.immunity, 'snare', {
          mechanicImmuneMask: foe.spec.mechanicImmuneMask,
        }),
        distanceYd: howlDist ?? null,
        radiusYd: spell.radiusYd,
      })) return false;
    }
    // Spell range plus the charge engagement, symmetric across sides. A non-positive rangeMax is no yard
    // limit, and an undefined distance allows. Cite: combatGeometry.isInSpellRange.
    if (isChargeRole(spell)) {
      // Warrior Charge is NOT_IN_COMBAT_ONLY; pet Charge / Intercept recast on CD.
      // Cite: Spell.cpp:4598 IsNonCombatSpell; spell 7371 attributes lack 0x10000000.
      if (f.chargeUsed && spell.notInCombatOnly) return false;
      if (!chargeCastOk(f, foe, spell)) return false;
    } else if ((spellNeedsRangeGate(spell) || foeDirectedOpaqueCast(spell))
      && (!planarRangeHonestYd(ctx.posOf?.(f.side), ctx.posOf?.(foe.side))
        || !isInSpellRange(
          distanceBetween(f, foe), spellGateRangeMaxYd(spell), spellGateRangeMinYd(spell),
        ))) {
      return false;
    } else if (beyondAcquireRange(f, foe, spell)) {
      return false;
    }
    // Hostile casts through walls fail when navLos is on (the free-walk floor turns it on).
    // Cite: Spell.cpp:4742 CheckCast; UnitAI IsWithinLOSInMap.
    if (cfg.navLos && spellNeedsLosGate(spell)) {
      const positions = ctx.unitPositionsMutable;
      if (!navSightClear(cfg, positions?.[f.side], positions?.[foe.side])) return blockedBySight(f);
    }
    // The same gate for a cast aimed at an ALLY. Off-mesh ends and a map with no collision bake still
    // fail open, so this refuses only where real geometry says rock. Cite: Spell.cpp:4742.
    if (cfg.navLos && spellNeedsFriendlyLosGate(spell)) {
      const ally = healTargetOf(f);
      if (ally && ally !== f) {
        const positions = ctx.unitPositionsMutable;
        if (!navSightClear(cfg, positions?.[f.side], positions?.[ally.side])) return blockedBySight(f);
      }
    }
    // Conditions: only when spell carries condition/conditionId (no data â†’ always pass).
    if (spell.condition || (spell.conditionId != null && spell.conditionId !== 0)) {
      if (!passesConditionGate(spell, conditionSnapshotFor(f), cfg.conditionTable).ok) return false;
    }
    // Reactive CasterAuraState / Overpower windows (Mongoose Bite after self dodge, â€¦).
    // Cite: Player.cpp IsSpellReady CasterAuraState; UnitAuraProcHandler ProcSkillsAndReactives.
    if (reactiveCastGate(f, foe, spell, t) != null) return false;
    // MaxTargetLevel / ONLY_PEACEFUL_TARGETS / EX3_ONLY_ON_PLAYER. Cite: castTargetGates.ts.
    if (targetCastGate(f, foe, spell, t) != null) return false;
    // Capture Spirit 7914 entry allowlist. Cite: Spell.cpp:7914â€“7920; captureSpiritAllowsEntry.
    if ((spell.id | 0) === 7914 && !captureSpiritAllowsEntry((foe.spec.creatureEntry ?? 0) | 0)) {
      return false;
    }
    // Cite: Spell.cpp:4655–4686 HasOverrideScript 3654/3655/4327.
    if (refuseOverrideClassScriptCheckCast(spell, f.buffActive)) return false;
    // Inspect the cast gates applySpell already refuses — Drain Mana, the class calls, the AQ mounts —
    // without stamping any flag here. A friendly cast checks the CASTER when the focus is hostile.
    const ccSid = spell.id | 0;
    const bandageLock = spell.mechanic === 'bandage' && ccSid !== RECENTLY_BANDAGED_SPELL_ID;
    const checkTgt = (ccSid === 10060 || ccSid === 19752 || ccSid === 19754) ? f
      : bandageLock
        ? selectedOrSelfFriendly(
          f, foe, f.friendlyPin ? ctx.bySide(f.friendlyPin) : null, dead, isEnemySide,
        )
        : foe;
    if (refuseCmangosCheckCast(spell, {
      flags: checkTgt.spec.flags,
      creatureEntry: checkTgt.spec.creatureEntry,
      powerType: checkTgt.spec.powerType,
      classId: checkTgt.spec.classId,
      auraSpellIds: checkTgt.buffActive,
      isPlayer: isPlayerCharacterTarget(checkTgt),
    }, {
      mapId: f.spec.mapId,
      hasActivePet: !!livingPetOf(f) || isCharmed(f),
    }, false)) return false;

    // Cite: Spell.cpp:5001-5007 if player caster has mount and !triggered && !passive && !HasAttribute(ALLOW_WHILE_MOUNTED) -> SPELL_FAILED_NOT_MOUNTED
    if (f.side === 'player' && f.spec.mount != null && !isTriggeredCompanion(f, spell) && !hasAttr(spell, SPELL_ATTR.PASSIVE) && !hasAttr(spell, SPELL_ATTR.ALLOW_WHILE_MOUNTED)) {
      return false;
    }

    return true;
  };
  // Spells appended only so a trigger, talent or gear proc can RESOLVE them; parents fire them, so they
  // must never be auto-selected. The kit-derived half is memoized — it was 4.6% of a 46-body profile.
  const isTriggeredCompanion = (f: Fighter, s: SpellDef): boolean =>
    triggeredIdsOf(f.spec.spells).has(s.id)
    || f.procs.some((p) => p.triggerSpellId === s.id);

  const find = (f: Fighter, role: SpellRole): SpellDef | undefined =>
    f.spec.spells.find((s) => roleOf(s) === role && !isTriggeredCompanion(f, s));

  // ids and stacks in ONE pass. The pair used to be a Set built from a map plus a second walk, so three
  // iterations and a throwaway array per aura list, twice per subject, for every unit every tick.
  const auraIdsAndStacks = (
    auras: ReadonlyArray<{ spellId: number; remainingMs?: number; stacks?: number }>,
  ): { ids: Set<number>; stacks: Map<number, number>; remaining: Map<number, number> | null } => {
    const ids = new Set<number>();
    const stacks = new Map<number, number>();
    // Allocated on the first FINITE remainingMs, so a bar of permanents costs nothing extra and a
    // missing entry keeps its evaluate.ts meaning: permanent.
    let remaining: Map<number, number> | null = null;
    for (const a of auras) {
      ids.add(a.spellId);
      if ((a.stacks ?? 1) > 1) stacks.set(a.spellId, a.stacks!);
      const rem = a.remainingMs;
      if (rem != null && Number.isFinite(rem)) (remaining ??= new Map()).set(a.spellId, Math.max(0, rem));
    }
    return { ids, stacks, remaining };
  };
  // Spell ids in the caster's kit whose hostile aura cannot land on this unit. Only computed for a
  // hostile subject: a keep-up gated on the aura's absence is otherwise unsatisfiable and re-fires.
  const auraMechSlots = new WeakMap<SpellDef, ReadonlyArray<{ mechanic: number }>>();
  const mechanicAuraSlotsOf = (sp: SpellDef): ReadonlyArray<{ mechanic: number }> => {
    let hit = auraMechSlots.get(sp);
    if (!hit) {
      const slots = sp.rawEffects ?? [];
      hit = slots.filter((r) => (r.effect | 0) === 6 && (r.mechanic | 0) > 0);
      auraMechSlots.set(sp, hit);
    }
    return hit;
  };
  type ImmunityIds = { auras?: Set<number>; spells?: Set<number> };
  const NO_IMMUNITY: ImmunityIds = {};
  const computeTargetImmunityIds = (u: Fighter, caster: Fighter): ImmunityIds => {
    const mechMask = u.spec.mechanicImmuneMask ?? 0;
    const imm = u.immunity;
    const totem = isTotemCreatureType(u.creatureType) || isTotemCreatureType(u.spec.creatureType)
      || isTotemSide(u.side);
    // No template mask and no live immunity → every hostile aura can land; skip the kit walk.
    // Totems carry empty masks but Totem.cpp still eats every negative aura.
    if (
      mechMask === 0
      && !(u.spec.schoolImmuneMask)
      && !imm.schoolImmuneMask
      && !imm.damageImmuneMask
      && !imm.mechanicImmuneMask
      && !imm.dispelImmuneMask
      && !totem
    ) return NO_IMMUNITY;
    let auras: Set<number> | undefined;
    let spells: Set<number> | undefined;
    const template = {
      schoolImmuneMask: u.spec.schoolImmuneMask,
      mechanicImmuneMask: u.spec.mechanicImmuneMask,
      creatureType: u.spec.creatureType ?? u.creatureType,
    };
    for (const sp of caster.spec.spells) {
      const ineffective = isAbilityIneffectiveOnTarget(u.immunity, sp, template);
      let auraBlocked = ineffective;
      // Per-effect mechanic (live FAP mask OR template): Hamstring's hit still lands on a snare-immune
      // target, so the whole-spell test cannot be the keep-up skip.
      const auraMechMask = mechMask | (imm.mechanicImmuneMask ?? 0);
      if (!auraBlocked && auraMechMask !== 0) {
        const auraSlots = mechanicAuraSlotsOf(sp);
        auraBlocked = auraSlots.length > 0
          && auraSlots.every((r) => (auraMechMask & (1 << ((r.mechanic | 0) - 1))) !== 0);
      }
      // Totem.cpp:282–287 immune to all negative auras (Wing Clip snare, Serpent Sting, Fear).
      if (!auraBlocked && totem && spellAppliesHostileAura(sp)) auraBlocked = true;
      if (auraBlocked) (auras ??= new Set()).add(sp.id);
      // Self-centered hostile AoE (Piercing Howl) is not foe-directed, so the old filter left
      // Howl out of immuneSpellIds and the snared==0 keep-up recast into Free Action forever.
      if (
        ineffective
        && (isFoeDirectedOffense(sp) || (selfCenteredOf(sp) && isHostileSpellDef(sp)))
      ) {
        (spells ??= new Set()).add(sp.id);
      }
    }
    return { auras, spells };
  };
  interface ImmunityIdsEntry {
    immunity: Fighter['immunity'];
    spells: Fighter['spec']['spells'];
    spec: Fighter['spec'];
    value: ImmunityIds;
  }
  // Pure in (caster kit, u.spec, u.immunity) and every .immunity write replaces the object, so the
  // ref is the version. 6.3% of all JS (Firefox 40-man MC 4x); result Sets are ReadonlySet.
  const immunityIdsCache = new WeakMap<Fighter, WeakMap<Fighter, ImmunityIdsEntry>>();
  const targetImmunityIdsFor = (u: Fighter, caster: Fighter | null): ImmunityIds => {
    if (!caster || caster === u) return NO_IMMUNITY;
    let byTarget = immunityIdsCache.get(caster);
    if (byTarget === undefined) {
      byTarget = new WeakMap<Fighter, ImmunityIdsEntry>();
      immunityIdsCache.set(caster, byTarget);
    }
    const hit = byTarget.get(u);
    if (
      hit !== undefined
      && hit.immunity === u.immunity
      && hit.spells === caster.spec.spells
      && hit.spec === u.spec
    ) return hit.value;
    const value = computeTargetImmunityIds(u, caster);
    byTarget.set(u, { immunity: u.immunity, spells: caster.spec.spells, spec: u.spec, value });
    return value;
  };

  const manaPctOf = (v: CombatantView): { manaPct?: number } => {
    const maxMana = v.maxMana ?? 0;
    if (maxMana > 0) return { manaPct: ((v.mana ?? 0) / maxMana) * 100 };
    if (v.powerType !== 'mana') return {};
    return { manaPct: v.maxPower > 0 ? (v.power / v.maxPower) * 100 : 0 };
  };

  // Kit ids this unit can pay for right now, off the same canAffordSpell the pick path spends
  // through — so a `canAfford` row and the cast it guards can never disagree.
  const affordableIdsOf = (u: Fighter): Set<number> => {
    const out = new Set<number>();
    for (const s of u.spec.spells ?? []) if (canAffordSpell(u, s)) out.add(s.id);
    return out;
  };

  const subjectFromView = (
    u: Fighter,
    caster?: Fighter | null,
    priceKit = false,
  ): SubjectState => {
    const v = view(u);
    const buffs = auraIdsAndStacks(v.buffs);
    // The view hides a trap arm (a ground object, not a bar chip), so a `buffPresent(trap)` keep-up
    // re-laid it every cooldown at the hunter's feet. The gate reads the armed trap; the bar does not.
    if (unitIsHunter(u)) {
      for (const e of ctx.effectsOn(u.side)) {
        if (isHunterTrapArmProc(e) && e.expiresAt > ctx.t && (e.charges == null || e.charges > 0)) {
          buffs.ids.add(e.spellId);
        }
      }
    }
    const debuffs = auraIdsAndStacks(v.debuffs);
    const flag = flagAuraId(buffs.ids);
    const immune = caster ? targetImmunityIdsFor(u, caster) : {};
    return {
      ...(immune.auras ? { immuneAuraSpellIds: immune.auras } : {}),
      ...(immune.spells ? { immuneSpellIds: immune.spells } : {}),
      alive: v.hp > 0,
      healthPct: v.maxHp > 0 ? (v.hp / v.maxHp) * 100 : 0,
      powerPct: v.maxPower > 0 ? (v.power / v.maxPower) * 100 : 0,
      // The mana bar even while the ACTIVE bar is energy or rage — the dual-bar druid. A unit whose
      // power already IS mana has no second bar, so powerPct is the same number.
      ...manaPctOf(v),
      // Priced only for the acting unit, and only when a rule named the metric — see ProviderNeeds.
      ...(priceKit ? { affordableSpellIds: affordableIdsOf(u) } : {}),
      level: u.spec.level,
      buffs: buffs.ids,
      debuffs: debuffs.ids,
      comboPoints: v.comboPoints ?? 0,
      // The live DR ladder this unit stands on, one step per group, using the same expiry test the apply
      // path does. Built ONLY when the unit has a record — an unconditional map cost 1.9 tick points.
      ...(u.dr.size > 0
        ? {
          drSteps: DIMINISHING_GROUP_ORDER.map((g) => {
            const rec = u.dr.get(g);
            return rec && rec.resetAt > ctx.t ? rec.step : 0;
          }),
        }
        : {}),
      formId: (v.form ?? 0) | 0,
      casting: v.casting
        ? {
          school: schoolIndexFromSchool(v.casting.school),
          isHeal: v.casting.isHeal ?? false,
          spellId: (v.casting.spellId | 0) || undefined,
        }
        : null,
      buffStacks: buffs.stacks,
      debuffStacks: debuffs.stacks,
      ...(buffs.remaining ? { buffRemainingMs: buffs.remaining } : {}),
      ...(debuffs.remaining ? { debuffRemainingMs: debuffs.remaining } : {}),
      dodgedRecently: v.dodgedRecently ?? false,
      defenseReactRecently: v.defenseReactRecently ?? false,
      hunterParryRecently: v.hunterParryRecently ?? false,
      inMelee: false,
      creatureType: u.creatureType || v.creatureType,
      isCaster: unitIsCaster(u, ctx.spellOf),
      isHunter: unitIsHunter(u),
      classId: unitClassId(u),
      ...(flag != null ? { carryingFlag: flag } : {}),
      charmed: v.controlled?.control === 'charm',
      groupRole: u.spec.groupRole,
      // W10 CC metrics — these gate a trinket / Free Action Potion rotation row; a rotation
      // cannot decide to break CC it cannot see. Declared since W10, filled never (until now).
      // silenced: Spell.cpp:6049-6050 UNIT_FLAG_SILENCED -> SPELL_FAILED_SILENCED.
      rooted: u.rootedUntil > ctx.t,
      stunned: u.stunnedUntil > ctx.t,
      feared: u.fearedUntil > ctx.t,
      snared: controlActive(u, 'snare') === true,
      silenced: u.silencedUntil > ctx.t,
    };
  };
  const prunePartyInterruptClaims = (): void => {
    pruneInterruptClaims(
      ctx.interruptClaim,
      (id) => {
        const u = ctx.bySide(id as Side);
        return !!u && !dead(u);
      },
      (id) => {
        const u = ctx.bySide(id as Side);
        return !!u && unitIsCastingOrChanneling(u, ctx.t);
      },
    );
  };
  /** Another party member already owns the kick on this casting target. */
  const interruptClaimedByOther = (targetId: CombatantId, actorId: CombatantId): boolean => {
    prunePartyInterruptClaims();
    const owner = ctx.interruptClaim.get(targetId);
    return owner != null && owner !== actorId;
  };
  /** Another party member already owns this (target, dispel category). See dispelDuty.ts. */
  const dispelCatClaimedByOther = (
    targetId: CombatantId,
    actorId: CombatantId,
    cat: number,
  ): boolean => dispelClaimedByOtherSeat(ctx, targetId, actorId, cat, dead);
  const prunePartyRezClaims = (): void => {
    pruneRezClaims(
      ctx.rezClaim,
      (id) => {
        const u = ctx.bySide(id as Side);
        // Same predicate the pick uses, so a claim cannot outlive the body being a valid target.
        return !!u && isRezzableCorpse(u);
      },
      // The claim is taken in startOrCast, never at pick time, so requiring a live cast bar has
      // no gap to cover — and an interrupted Rebirth must free its body for the next druid.
      (id) => {
        const u = ctx.bySide(id as Side);
        return !!u && !dead(u) && unitIsCastingOrChanneling(u, ctx.t);
      },
    );
  };
  // Every corpse this caster could stand up is already claimed by another live member, so the row falls
  // through rather than spending a 30 min cooldown on a body that will be up before the cast lands.
  const battleRezClaimedByOther = (f: Fighter, s: SpellDef): boolean => {
    if (!isBattleRezSpell(s)) return false;
    // Party-side only, and the enemy arm this replaces was dead code: no built creature kit carries a
    // battle rez, and the resurrect effect refuses a non-player target anyway.
    if (isEnemySide(f.side)) return false;
    prunePartyRezClaims();
    return pickBattleRezTarget(ctx.partyUnits(), f, (c) => ctx.rezClaim.get(c.side)) == null;
  };
  const dispelSpellClaimedByOther = (f: Fighter, foe: Fighter, s: SpellDef): boolean => {
    if (!isDispelSpell(s)) return false;
    let any = false;
    let unclaimed = false;
    for (const e of s.effects) {
      if (e.kind !== 'dispel') continue;
      const res = resolveDispelTarget(f, foe, e.dispelType);
      if (!res) continue;
      any = true;
      if (!dispelCatClaimedByOther(res.unit.side, f.side, e.dispelType)) unclaimed = true;
    }
    return any && !unclaimed;
  };

  // Which dispel categories a companion could strip right now, so a cure rule only fires when it would
  // do something. Hoisted out of the per-ally body: the friendly answer is a property of the POOL.
  const EMPTY_CATS: ReadonlySet<number> = new Set<number>();
  const EMPTY_KEEP: ReadonlySet<number> = new Set<number>();
  const friendlyDispelCats = new Map<string, Set<number>>();
  const targetDispelCats = new Map<string, Set<number>>();
  let dispelCacheTick = -1;
  let keepAuraTick = -1;
  const refreshKeepAuras = (): void => {
    if (ctx.t === keepAuraTick) return;
    keepAuraTick = ctx.t;
    const out = new Set<number>();
    const add = (p?: AllyActionProvider | null): void => {
      if (!p?.keepAuraIds) return;
      for (const id of p.keepAuraIds) if (id > 0) out.add(id);
    };
    add(cfg.playerActionProvider);
    // ALLY seats only. The provider map also holds the BG enemy bots', and the keep-set is consulted for
    // every unit a dispel touches, so folding theirs in would protect party buffs from a party dispel.
    for (const [side, p] of ctx.unitActionProvider) if (isAllySide(side)) add(p);
    ctx.keepAuraSpellIds = out.size ? out : EMPTY_KEEP;
  };
  const resetDispelCaches = (): void => {
    if (ctx.t === dispelCacheTick) return;
    dispelCacheTick = ctx.t;
    friendlyDispelCats.clear();
    targetDispelCats.clear();
    refreshKeepAuras();
  };
  const dispellableOnFriendliesOf = (f: Fighter): ReadonlySet<number> => {
    if (!ctx.anyDispellableEffect?.()) return EMPTY_CATS;
    resetDispelCaches();
    const key = String(ctx.factionOf(f.side));
    const hit = friendlyDispelCats.get(key);
    if (hit) return hit;
    const out = new Set<number>();
    const pool = friendlyPoolOf(f);
    for (const cat of [DISPEL_TYPE.MAGIC, DISPEL_TYPE.CURSE, DISPEL_TYPE.DISEASE, DISPEL_TYPE.POISON]) {
      const mask = getDispelMask(cat);
      if (pool.some((u) => dispellableAurasOn(u, mask, true).length > 0)) out.add(cat);
    }
    friendlyDispelCats.set(key, out);
    return out;
  };
  // Enrage / stealth / invisibility read the WHOLE hostile pool, the question resolveDispelTarget
  // answers on the cast (dispelReflect.ts:371); MAGIC stays focus-only, an offensive Purge is a pick.
  const dispellableOnTargetOf = (f: Fighter, foe: Fighter): ReadonlySet<number> => {
    if (!isEnemySide(foe.side) || dead(foe)) return EMPTY_CATS;
    if (!ctx.anyDispellableEffect?.()) return EMPTY_CATS;
    resetDispelCaches();
    const key = `${f.side}|${foe.side}`;
    const hit = targetDispelCats.get(key);
    if (hit) return hit;
    const out = new Set<number>();
    if (dispellableAurasOn(foe, getDispelMask(DISPEL_TYPE.MAGIC), false).length > 0) {
      out.add(DISPEL_TYPE.MAGIC);
    }
    // The pool resolveDispelTarget picks from, acquire-range included — the gate cannot outrun the act.
    const pool = foePoolOf(f);
    for (const cat of [DISPEL_TYPE.ENRAGE, DISPEL_TYPE.STEALTH, DISPEL_TYPE.INVISIBILITY]) {
      const mask = getDispelMask(cat);
      if (pool.some((u) => dispellableAurasOn(u, mask, false).length > 0)) out.add(cat);
    }
    targetDispelCats.set(key, out);
    return out;
  };

  // One friendly HP and distance snapshot per tick per side, with callers sharing the same rows — no
  // getters, which fired on spread and made it worse. Rebuilt on pool or position change.
  type DistHp = { hpPct: number; distYd: number | null };
  type PartySnap = {
    pool: Fighter[];
    hps: number[];
    modes: Array<Fighter['mode']>;
    hpPcts: number[];
    meleeAllyCount: number;
    posGen: number;
    distHpBySide: Map<string, DistHp[]>;
  };
  const partySnapByFac = new Map<string, PartySnap>();
  let partySnapTick = -1;
  const fillPartyDerived = (snap: PartySnap): void => {
    snap.meleeAllyCount = 0;
    for (let i = 0; i < snap.pool.length; i++) {
      const u = snap.pool[i]!;
      const hpPct = (u.hp / Math.max(1, u.spec.maxHealth)) * 100;
      snap.hps[i] = u.hp;
      snap.modes[i] = u.mode;
      snap.hpPcts[i] = hpPct;
      if (u.spec.groupRole !== 'healer' && u.mode !== 'ranged') snap.meleeAllyCount++;
    }
    for (const row of snap.distHpBySide.values()) {
      for (let i = 0; i < row.length; i++) row[i]!.hpPct = snap.hpPcts[i]!;
    }
  };
  const partySnapOf = (f: Fighter): PartySnap => {
    if (ctx.t !== partySnapTick) {
      partySnapByFac.clear();
      partySnapTick = ctx.t;
    }
    // Endless enemy pool is per-unit (self ∪ threat), not faction-wide.
    const fac = cfg.endless && ctx.factionOf(f.side) === 'enemy'
      ? `end:${f.side}`
      : String(ctx.factionOf(f.side));
    // Totems out of party triage: heal-immune and 5 HP, so one splash made a Searing Totem the
    // group's lowest-HP body. Cite: Entities/Totem.cpp:261-280 IsImmuneToSpellEffect.
    const rawPool = friendlyPoolOf(f);
    let pool = rawPool;
    for (const u of rawPool) {
      if (isTotemSide(u.side)) { pool = rawPool.filter((x) => !isTotemSide(x.side)); break; }
    }
    const posGen = ctx.posGen;
    let snap = partySnapByFac.get(fac);
    if (snap && snap.posGen === posGen && snap.pool.length === pool.length) {
      let same = true;
      let hpModeDirty = false;
      for (let i = 0; i < pool.length; i++) {
        const u = pool[i]!;
        if (u !== snap.pool[i]) { same = false; break; }
        if (u.hp !== snap.hps[i] || u.mode !== snap.modes[i]) hpModeDirty = true;
      }
      if (same) {
        if (hpModeDirty) fillPartyDerived(snap);
        return snap;
      }
    }
    snap = {
      pool,
      hps: new Array(pool.length),
      modes: new Array(pool.length),
      hpPcts: new Array(pool.length),
      meleeAllyCount: 0,
      posGen,
      distHpBySide: new Map(),
    };
    fillPartyDerived(snap);
    partySnapByFac.set(fac, snap);
    return snap;
  };
  const distHpRowOf = (snap: PartySnap, f: Fighter): DistHp[] => {
    let row = snap.distHpBySide.get(f.side);
    if (row) return row;
    row = [];
    const hasGeo = !!ctx.unitPositionsMutable;
    for (let i = 0; i < snap.pool.length; i++) {
      const u = snap.pool[i]!;
      const d = hasGeo ? distanceBetween(f, u) : undefined;
      // `healersWithinYd` reads isHealer off this row and only the BG snapshot ever set it, so the
      // metric answered 0 in every PvE fight (evaluate.ts healersWithinYd).
      row.push({
        hpPct: snap.hpPcts[i]!,
        distYd: d == null ? null : d,
        ...(u.spec.groupRole === 'healer' ? { isHealer: true } : {}),
      });
    }
    snap.distHpBySide.set(f.side, row);
    return row;
  };

  // Mana of the healer SEATS on one side. Seats, not the living pool: a dead healer is the case that
  // matters and reads 0. Built once per tick and faction, or a 40-man asks it 40 times.
  type HealerSeats = { seats: Array<{ side: Side; pct: number }>; groupSeats: number };
  const healerSeatsByFaction = new Map<string, HealerSeats>();
  let healerSeatsTick = -1;
  const healerSeatsOf = (f: Fighter): HealerSeats => {
    if (ctx.t !== healerSeatsTick) {
      healerSeatsByFaction.clear();
      healerSeatsTick = ctx.t;
    }
    const fac = ctx.factionOfFighter(f);
    const hit = healerSeatsByFaction.get(fac);
    if (hit) return hit;
    const out: HealerSeats = { seats: [], groupSeats: 0 };
    for (const u of ctx.fightersOrder()) {
      // A PARTY seat. The pet is not one — it has no group role and cannot heal — and counting it made
      // the seat count read 2 for a solo hunter. A class id cannot see this: a pet carries one.
      if (isTotemSide(u.side) || u.side === 'pet' || u.spec.classId == null) continue;
      if (ctx.factionOfFighter(u) !== fac) continue;
      out.groupSeats++;
      if (u.spec.groupRole !== 'healer') continue;
      const maxPower = u.spec.maxPower;
      out.seats.push({
        side: u.side,
        pct: u.hp > 0 && maxPower > 0 ? (u.power / maxPower) * 100 : 0,
      });
    }
    healerSeatsByFaction.set(fac, out);
    return out;
  };
  // Interruptible bar on any combat hostile, not only the kill focus. Kick/CS `target.castingPresent`
  // reads this; one walk per faction per tick, and only when a rule named that metric.
  let kickableTick = -1;
  const kickableByFac = new Map<string, boolean>();
  const kickableCastPresentOf = (f: Fighter, hostiles: readonly Fighter[]): boolean => {
    if (ctx.t !== kickableTick) {
      kickableByFac.clear();
      kickableTick = ctx.t;
    }
    // Key on what hostilesOf branches on: an enemy seat's list is per unit under acquireRangeYd, and
    // a charmed mob keeps its enemy side, so the party's answer must not come off its radius.
    const key = isEnemySide(f.side)
      ? (cfg.acquireRangeYd != null ? `side:${String(f.side)}` : 'enemy-side')
      : 'party-side';
    const hit = kickableByFac.get(key);
    if (hit !== undefined) return hit;
    let v = false;
    for (const h of hostiles) {
      if (!dead(h) && unitInterruptibleCast(h, ctx.t) != null) { v = true; break; }
    }
    kickableByFac.set(key, v);
    return v;
  };
  let totemOwnerTick = -1;
  const totemOwnerSides = new Set<string>();
  const totemOwnerSidesNow = (): Set<string> => {
    if (ctx.t === totemOwnerTick) return totemOwnerSides;
    totemOwnerSides.clear();
    totemOwnerTick = ctx.t;
    for (const tot of totems.values()) {
      if (dead(tot) || !tot.totemSlot) continue;
      totemOwnerSides.add(tot.totemOwnerSide ?? 'player');
    }
    return totemOwnerSides;
  };
  let deadAllyTick = -1;
  let deadAllyN = 0;
  const deadAllyCountNow = (): number => {
    if (ctx.t === deadAllyTick) return deadAllyN;
    deadAllyTick = ctx.t;
    deadAllyN = rezzableDeadCount(ctx.allyBlock()) + (isRezzableCorpse(player) ? 1 : 0);
    return deadAllyN;
  };
  // Tank-swap chips: every thinker with the same threat victim was rebuilding the same set.
  let aggroHolderTick = -1;
  const aggroHolderBySide = new Map<string, { ids: Set<number>; stacks: Map<number, number> }>();
  let hurtTick = -1;
  const hurtByFac = new Map<string, Fighter | null>();
  const sharedHurtOf = (f: Fighter): Fighter | null => {
    if (f.friendlyPin || cfg.acquireRangeYd != null || cfg.navLos) {
      return ctx.lowestHpFriendlyOf?.(f) ?? lowestHpFriendly();
    }
    if (ctx.t !== hurtTick) {
      hurtByFac.clear();
      hurtTick = ctx.t;
    }
    const fac = String(ctx.factionOfFighter(f));
    if (hurtByFac.has(fac)) return hurtByFac.get(fac) ?? null;
    const v = ctx.lowestHpFriendlyOf?.(f) ?? lowestHpFriendly();
    hurtByFac.set(fac, v);
    return v;
  };
  // The most-hurt living friendly matching every field of the filter. An empty filter returns
  // EXACTLY sharedHurtOf, so no stored row changes body. Totems are out, as in partySnapOf.
  const aimedAllyOf = (f: Fighter, filter?: AllyFilter): Fighter | null => {
    if (allyFilterIsAny(filter)) return sharedHurtOf(f);
    const want = filter as AllyFilter;
    let best: Fighter | null = null;
    let bestPct = Number.POSITIVE_INFINITY;
    for (const u of friendlyPoolOf(f)) {
      if (dead(u) || isTotemSide(u.side)) continue;
      if (want.unit && u.side !== want.unit) continue;
      if (want.role != null && u.spec.groupRole !== want.role) continue;
      if (want.notRole != null && u.spec.groupRole === want.notRole) continue;
      if (want.classId != null && unitClassId(u) !== want.classId) continue;
      const pct = (u.hp / Math.max(1, u.spec.maxHealth)) * 100;
      if (pct < bestPct) { bestPct = pct; best = u; }
    }
    return best;
  };
  // One SubjectState per (actor, filter) per tick: building one walks the body's aura chips, and a
  // 40-man asks the same question once per rule.
  let allySubjTick = -1;
  const allySubjCache = new Map<string, SubjectState | null>();
  const allyFilterKey = (fl?: AllyFilter): string => (allyFilterIsAny(fl)
    ? ''
    : `${fl?.role ?? ''}|${fl?.notRole ?? ''}|${fl?.classId ?? ''}|${fl?.unit ?? ''}`);
  const allySubjectOf = (f: Fighter, filter?: AllyFilter): SubjectState | null => {
    if (ctx.t !== allySubjTick) { allySubjCache.clear(); allySubjTick = ctx.t; }
    const key = `${f.side}#${allyFilterKey(filter)}`;
    const hit = allySubjCache.get(key);
    if (hit !== undefined) return hit;
    const body = aimedAllyOf(f, filter);
    const out = body ? subjectFromView(body, f) : null;
    allySubjCache.set(key, out);
    return out;
  };
  const aggroHolderChipsOf = (victim: Fighter): { ids: Set<number>; stacks: Map<number, number> } => {
    if (ctx.t !== aggroHolderTick) {
      aggroHolderBySide.clear();
      aggroHolderTick = ctx.t;
    }
    const hit = aggroHolderBySide.get(victim.side);
    if (hit) return hit;
    const chips = ctx.debuffChipsOf?.(victim) ?? view(victim).debuffs;
    const parsed = auraIdsAndStacks(chips);
    const row = { ids: parsed.ids, stacks: parsed.stacks };
    aggroHolderBySide.set(victim.side, row);
    return row;
  };
  // What this unit sees: the OTHER seats' mana. A group with no healer among its members reads zero,
  // the same emergency as a dead one. Solo, and a healer asking about itself, are absent.
  const healerPowerPctsOf = (f: Fighter): readonly number[] | undefined => {
    const { seats, groupSeats } = healerSeatsOf(f);
    const mine = seats.some((s) => s.side === f.side);
    const others = seats.length - (mine ? 1 : 0);
    if (others === 0) return groupSeats > 1 && !mine ? NO_HEALER_MANA : undefined;
    if (!mine) return seats.map((s) => s.pct);
    return seats.filter((s) => s.side !== f.side).map((s) => s.pct);
  };

  // Is this unit's side fighting? Own combat flag or any party member's — a back-line healer never swings
  // or gets hit, so its own flag alone reads OOC all pull. Cite: combatFlag.ts.
  let facEngagedTick = -1;
  const facEngagedByFac = new Map<string, boolean>();
  const factionEngaged = (f: Fighter, now: number): boolean => {
    if (fighterIsInCombat(f, now)) return true;
    if (ctx.t !== facEngagedTick) {
      facEngagedByFac.clear();
      facEngagedTick = ctx.t;
    }
    const fac = String(ctx.factionOfFighter(f));
    const hit = facEngagedByFac.get(fac);
    if (hit !== undefined) return hit;
    let v = false;
    for (const u of partySnapOf(f).pool) {
      if (fighterIsInCombat(u, now)) { v = true; break; }
    }
    facEngagedByFac.set(fac, v);
    return v;
  };

  /** Everything on, for pets / fixtures / providers that never advertised what they read. */
  const NEEDS_ALL: ProviderNeeds = {
    allyDistHp: true,
    allyTriageBuffs: true,
    charmedHostileCount: true,
    enemyDistsFromTarget: true,
    enemyDists: true,
    enemyHealerDists: true,
    hasAggro: true,
    enemyCastingOnAlly: true,
    enemyCastingOnSelf: true,
    items: true,
    groundPools: true,
    targetCone: true,
    hostileCreatureEntries: true,
    spellCosts: true,
    dispellablePresent: true,
    kickableCastPresent: true,
    aggroHolder: true,
    allySubject: true,
  };
  // Shared empties. A snapshot is built for every unit every tick and these four are empty in nearly
  // all of them, which was four allocations to say "nothing". The evaluator only reads them.
  const NO_SLOTS: Set<TotemSlot> = new Set();
  /** A group with no healer seat at all: nobody is healing, same emergency as a dead one. */
  const NO_HEALER_MANA: readonly number[] = [0];
  const NO_COUNTS: Map<number, number> = new Map();
  const NO_HANDS_SET: Set<'mainhand' | 'offhand'> = new Set();
  const imbueSetOf = (f: Fighter, now: number): Set<'mainhand' | 'offhand'> => {
    const mh = f.weaponImbues.mainhand != null && f.weaponImbues.mainhand.expiresAt > now;
    const oh = f.weaponImbues.offhand != null && f.weaponImbues.offhand.expiresAt > now;
    if (!mh && !oh) return NO_HANDS_SET;
    const out = new Set<'mainhand' | 'offhand'>();
    if (mh) out.add('mainhand');
    if (oh) out.add('offhand');
    return out;
  };
  /** Dual-wield open hands: weapon profiles only (shield → no spec.offhand). */
  const openHandsOf = (f: Fighter, now: number): Set<'mainhand' | 'offhand'> => {
    const mhOk = !(f.weaponImbues.mainhand && f.weaponImbues.mainhand.expiresAt > now);
    const ohOk = !!f.spec.offhand && !(f.weaponImbues.offhand && f.weaponImbues.offhand.expiresAt > now);
    if (!mhOk && !ohOk) return NO_HANDS_SET;
    const open = new Set<'mainhand' | 'offhand'>();
    if (mhOk) open.add('mainhand');
    if (ohOk) open.add('offhand');
    return open;
  };
  /**
   * Dev capture of the snapshot a seat's rotation conditions are evaluated against, keyed by side.
   * `session.abilities()` reports for the `player` seat only (sessionApi.ts:385), so a NON-LEAD or
   * enemy-side seat's condition values were unreadable — which is what left plan §W11 link 1 stuck
   * ("side B's warrior never casts Hamstring, gate `target.debuffPresent==0 & target.drLevel<2`,
   * and nothing can say which clause is false"). Written only when a caller asks, so a normal
   * fight pays nothing: `allySnapshot` runs per unit per tick.
   */
  const allySnapshotOf = (f: Fighter, foe: Fighter, needs: ProviderNeeds = NEEDS_ALL): RotationSnapshot => {
    const t = ctx.t;
    refreshKeepAuras();
    // Totems are an engagement action, not a follow behaviour (radius gate + usableSpell below).
    const engaged = factionEngaged(f, t);
    // Off-heal emergency gate (`healerPowerPct`): the party healer's mana, 0 when it is dead.
    const healerSeatPowerPcts = healerPowerPctsOf(f);
    // Seats on this side, self included — the `partySeats` gate a healer's damage rows read. Seats,
    // not living bodies, so a party mid-wipe does not read as solo. Memoized with the healer seats.
    const partySeats = healerSeatsOf(f).groupSeats;
    let occupied: Set<TotemSlot> = NO_SLOTS;
    if (totems.size > 0 && totemOwnerSidesNow().has(f.side)) {
      for (const tot of totems.values()) {
        if (dead(tot)) continue;
        // This unit's OWN four seats. Reading the party's made two shamans out of each other's radius
        // each see the slot as empty, and every recast stole the other's. Cite: Unit.h:2625.
        if ((tot.totemOwnerSide ?? 'player') !== f.side) continue;
        const slot = tot.totemSlot;
        if (!slot) continue;
        // Out of the totem's baked aura radius the slot reads empty so the rotation recasts, but only
        // while fighting, or walking leaves the set behind and re-drops it. A missing radius fails open.
        if (ctx.unitPositionsMutable && engaged) {
          const r = tot.totemAuraRadiusYd ?? 0;
          if (r > 0) {
            const d = distanceBetween(f, tot);
            if (d != null && d > r) continue;
          }
        }
        if (occupied === NO_SLOTS) occupied = new Set<TotemSlot>();
        occupied.add(slot);
      }
    }
    // Faction-relative triage — BG enemy healers must not look at the player's party.
    const hurt = sharedHurtOf(f);
    // Which dispel categories this companion could actually strip right now, so a cure rule fires only
    // when it would do something. Friendlies give curable debuffs; the enemy target strippable buffs.
    const dispellableOnFriendlies = needs.dispellablePresent ? dispellableOnFriendliesOf(f) : EMPTY_CATS;
    const dispellableOnTarget = needs.dispellablePresent ? dispellableOnTargetOf(f, foe) : EMPTY_CATS;
    // The bag is keyed by side, so no roster index is looked up to find it (E1.1).
    const bag = f.side === 'player'
      ? (ctx.playerItems ?? [])
      : (unitItems.get(f.side) ?? []);
    const cdMap = f.side === 'player'
      ? (ctx.itemCd ?? new Map<number, number>())
      : (unitItemCd.get(f.side) ?? new Map<number, number>());
    let itemCounts: Map<number, number> = NO_COUNTS;
    if (needs.items) {
      for (const it of bag) {
        if (itemCounts === NO_COUNTS) itemCounts = new Map<number, number>();
        itemCounts.set(it.entry, it.count);
      }
      // Reagent bag snapshot (Soul Shard etc.) so rotation itemCount gates see live counts.
      // Cite: spellReagents.ts; KI-804; domain/rotation itemCount metric.
      if (f.spec.bagItemCounts) {
        for (const [k, v] of Object.entries(f.spec.bagItemCounts)) {
          const entry = Number(k);
          if (!Number.isFinite(entry)) continue;
          if (itemCounts === NO_COUNTS) itemCounts = new Map<number, number>();
          itemCounts.set(entry, v | 0);
        }
      }
    }
    // Player pet is ctx.pet; a companion names its own pet seat (spec.petSide). Allies-only
    // lookup left snap.pet null for the player, so Health Funnel / Mend Pet never fired.
    const mappedPet = livingPetOf(f);
    const petSubj = mappedPet ? subjectFromView(mappedPet) : null;
    const selfSubj = subjectFromView(f, null, needs.spellCosts);
    // foeOf self-sentinel is NOT a target (types.ts: null = no target): as target-self, every
    // `target.debuffPresent == 0` keep-up read the unit's own clean list and re-fired at nothing.
    const targetSubj = dead(foe) || foe === f ? null : subjectFromView(foe, f);
    const hasGeo = !!ctx.unitPositionsMutable;
    selfSubj.inMelee = hasGeo
      ? livingHostilesOf(f).some((h) => inMeleeBand(distanceBetween(f, h) ?? null, true))
      : true;
    if (targetSubj) targetSubj.inMelee = inMeleeBand(distanceBetween(f, foe) ?? null, hasGeo);
    if (petSubj && mappedPet && !dead(foe) && foe !== f) {
      petSubj.inMelee = inMeleeBand(distanceBetween(mappedPet, foe) ?? null, hasGeo);
    }
    // Charmed hostiles from this companion's faction view (possessed party members).
    const charmedHostileCount = needs.charmedHostileCount
      ? livingHostilesFor(f).filter((h) => isCharmed(h)).length
      : 0;
    // Shared party HP/melee; per-actor distances for AOE heal gates (PoH / Chain Heal).
    const party = partySnapOf(f);
    const allyHpPcts = party.hpPcts;
    // Shared row (same object for this actor this tick). Built once; not a getter.
    const allyDistHp = needs.allyDistHp ? distHpRowOf(party, f) : undefined;
    // One resolver for "who is the triage body": `hurt` is the same lowestHpFriendlyOf the
    // `{ lowestHp }` aim resolves below, so the gate reads the bar the HoT actually lands on.
    const triageBuffs = needs.allyTriageBuffs && hurt ? new Set(hurt.buffActive.keys()) : undefined;
    const meleeAllyCount = party.meleeAllyCount;
    // Enemy distances for the multi and AoE gates, geometry only — missing degrades to a fight-wide
    // count. Faction-relative, so a Horde bot's enemies are Alliance rather than its own team.
    const hostiles = hostilesOf(f);
    // Ally skips vid === f.side (enemyCastingOnAlly.mjs). Self is that case: Grounding on the healer.
    // Cite: Unit.cpp:6894-6916 SelectMagnetTarget.
    let enemyCastingOnAlly = false;
    let enemyCastingOnSelf = false;
    if (needs.enemyCastingOnAlly || needs.enemyCastingOnSelf) {
      const myFaction = ctx.factionOf(f.side);
      for (const e of hostiles) {
        if (dead(e) || !unitIsCastingOrChanneling(e, t)) continue;
        const vid = threatOf(e)?.getCurrentVictimId();
        if (vid == null || isTotemSide(vid as Side)) continue;
        if (ctx.factionOf(vid as Side) !== myFaction) continue;
        const victim = ctx.bySide(vid as Side);
        if (!victim || dead(victim)) continue;
        if (vid === f.side) enemyCastingOnSelf = true;
        else enemyCastingOnAlly = true;
        if (enemyCastingOnAlly && enemyCastingOnSelf) break;
      }
    }
    // A free variable until now: the three uses below read it off the context where crowd control
    // installs it. Unbound it threw the moment a rotation named the metric. Absent protects nothing.
    const ccProtected = ctx.ccProtected ?? (() => false);
    let enemyDists: number[] | undefined;
    let enemyDistsFromTarget: number[] | undefined;
    let enemyHealerDists: number[] | undefined;
    // The blast-legal twin of the enemy distances: the same pack MINUS anything holding CC our own AoE
    // would shatter. The honest pack count stays for the rotation; this is the is-it-worth-it decision.
    let blastDists: number[] | undefined;
    let blastDistsFromTarget: number[] | undefined;
    if (ctx.unitPositionsMutable) {
      const needSelfDists = kitNeedsSelfPackDists(f.spec.spells)
        || needs.enemyDists
        || needs.enemyHealerDists;
      if (needSelfDists) {
        enemyDists = [];
        blastDists = [];
        for (const e of hostiles) {
          if (dead(e)) continue;
          const d = distanceBetween(f, e);
          if (d == null) continue;
          enemyDists.push(d);
          if (!ccProtected(e)) blastDists.push(d);
          if (needs.enemyHealerDists && e.spec.groupRole === 'healer') {
            (enemyHealerDists ??= []).push(d);
          }
        }
      }
      // usableSpell reads blastDistsFromTarget for ground-rain density; the snapshot field is
      // enemiesWithinYd subject target. Skip the walk when this kit and rotation name neither.
      const fromTargetForUsable = kitHasGroundMulti(f.spec.spells);
      const fromTargetForSnap = needs.enemyDistsFromTarget;
      if (!dead(foe) && foe !== f && (fromTargetForUsable || fromTargetForSnap)) {
        if (fromTargetForSnap) enemyDistsFromTarget = [];
        blastDistsFromTarget = [];
        for (const e of hostiles) {
          if (dead(e)) continue;
          let d = 0;
          if (e !== foe) {
            const dist = distanceBetween(foe, e);
            if (dist == null) continue;
            d = dist;
          }
          if (enemyDistsFromTarget) enemyDistsFromTarget.push(d);
          if (!ccProtected(e)) blastDistsFromTarget.push(d);
        }
      }
    }
    // Self-centred hard control whose disc holds no body the control can hold. Counting bodies alone
    // let a root-immune boss eat the GCD and the authored step-back on every cooldown.
    let unholdableAoeCc: Set<number> | undefined;
    for (const nova of novaKiteKitOf(f.spec.spells)) {
      const discDists = blastDists ?? enemyDists;
      // Empty disc is the older gate's answer and needs no per-body test. Skipping it keeps
      // the scan below off the endless floor's passive stream, which `hostiles` includes.
      if (discDists && !novaDiscOccupied(discDists, nova)) continue;
      const yards = multiTargetGateYards(nova);
      let holdable = false;
      for (const e of hostiles) {
        if (dead(e) || ccProtected(e)) continue;
        // No geometry (hop fights): the whole pack is "in the disc", same as novaDiscOccupied.
        if (enemyDists) {
          const d = distanceBetween(f, e);
          if (d == null || d > yards) continue;
        }
        if (!hardControlCanLand(f, e, nova)) continue;
        holdable = true;
        break;
      }
      if (!holdable) (unholdableAoeCc ??= new Set()).add(nova.id);
    }
    // Pull sequence spent set for this ally (same contract as player combatSnapshot).
    // Maintained on push — the rescan here was O(whole run) per ally per tick.
    const pullSpentSpellIds = ctx.pullSpentSpellsFor(f.side);
    const pullSpentItemEntries = ctx.pullSpentItemsFor(f.side);
    // The nearest hazard edge in yards, 0 while inside, off the same registry the avoid move reads — so
    // the condition and the move cannot disagree. Walking the pools directly could not see a body.
    let hazardProximityYd: number | undefined;
    if (needs.groundPools && ctx.unitPositionsMutable) {
      const here = ctx.posOf?.(f.side);
      if (here) {
        let best: number | undefined;
        for (const h of hostileHazardsThisTick(ctx, dead)) {
          const d = combatDistanceYd(here, h.at);
          if (d == null) continue;
          const edge = Math.max(0, d - h.radiusYd);
          if (best == null || edge < best) best = edge;
        }
        if (best != null) hazardProximityYd = best;
      }
    }
    // Am I in an arc one of the focus's own cones would hit? The same test the fan runs. The widest arc
    // wins and a REAR cone counts, so "behind him" is not a safe answer and the flank row clears both.
    let inTargetCone: boolean | undefined;
    if (needs.targetCone && ctx.unitPositionsMutable && !dead(foe) && foe !== f) {
      const here = ctx.posOf?.(f.side);
      const there = ctx.posOf?.(foe.side);
      const victim = ctx.foeOf?.(foe);
      const facingAt = victim && victim !== foe ? ctx.posOf?.(victim.side) : undefined;
      if (here && there && facingAt) {
        const arcs = coneArcsOfKit(foe.spec.spells, castableKitIds(foe, ctx.spellOf));
        // coneCovers, not the bare arc: 41 of the 129 cone spells stop at 10 yd, so an
        // angle-only test told a healer at 30 yd it was standing in a Cleave.
        inTargetCone = arcs.length === 0
          ? false
          : arcs.some((a) => coneCovers(there, facingAt, here, a));
      }
    }
    let hostileCreatureEntries: Set<number> | undefined;
    if (needs.hostileCreatureEntries) {
      hostileCreatureEntries = new Set();
      for (const e of hostiles) {
        if (dead(e)) continue;
        const entry = e.spec.creatureEntry;
        if (entry != null) hostileCreatureEntries.add(entry);
      }
    }
    // One body, two questions: the real gate, and the same gate with the shapeshift check
    // skipped so a rotation can ask "ready but for the stance".
    const usableSpellWith = (id: number, ignoreForm: boolean): boolean => {
      const s = kitById(f.spec.spells).get(id);
      if (!s || isTriggeredCompanion(f, s)) return false;
      if (s.onNextSwing && f.pendingSwing) return false;
      // Indoors: the cast would fail CheckCast, so the rule must not win the GCD with it.
      if (!spellAllowedAtLocation(s, cfg.outdoors !== false, cfg.battlegroundMap)) return false;
      // halt_dps row: refuse damaging casts matching the school (or all / a set).
      const halt = f.haltDpsSchool;
      // A SCOPED halt stops damage only on the bodies it names, so a both-up phase can hold fire on
      // the invulnerable one. Unscoped is every body, which is what a row written before this meant.
      if (
        halt && isHostileSpellDef(s) && haltDpsRefusesSchool(halt, s.school)
        && haltDpsCoversEntry(f.haltDpsEntries, foe.spec.creatureEntry)
      ) return false;
      // Pets already fight as session units — never GCD-cast summon mid-fight
      // (combat has no summon_pet apply; that path is OOC).
      if (roleOf(s) === 'pet_summon') return false;
      // Totems only once the pull is on — a totem placed while the party walks is left behind
      // at once, and the empty slot re-fires the rule. Cite: oocTotemSummonFailReason.
      if (!engaged && roleOf(s) === 'totem_summon') return false;
      // pet_heal only when this unit's pet is alive (health gate is the rotation rule).
      if (roleOf(s) === 'pet_heal' && (!mappedPet || dead(mappedPet))) return false;
      // Pure Kick/CS/Pummel: only when a body can actually take it (interruptible bar,
      // in range, not already claimed). Earth Shock keeps its filler when nobody is casting.
      if (pureInterruptOf(s)) {
        if (!kickableCastPresentOf(f, hostiles)) return false;
        if (!pickInterruptTarget(f, foe, s)) return false;
      } else if (interruptCastOf(s)) {
        if (interruptClaimedByOther(foe.side, f.side)) return false;
        if (!interruptCanLand(foe, s)) return false;
      }
      // One party Tranq/Purge/Cleanse per (target, category). Cite: AUTOPILOT-PLAN §4 row 21.
      if (dispelSpellClaimedByOther(f, foe, s)) return false;
      // One party battle rez per corpse — N druids stand up N bodies, not one body N times.
      if (battleRezClaimedByOther(f, s)) return false;
      // The pack swap: the single-target filler must not dump rage when its multi counterpart is on
      // the kit. Counted in the melee band, not fight-wide — a spread pack still wants the filler.
      {
        const { hasCleave, hasSwipe } = packFillersOf(f.spec.spells);
        if (hasCleave || hasSwipe) {
          let packNear = 0;
          if (blastDists) {
            for (const d of blastDists) if (d <= 8) packNear++;
          } else {
            packNear = blastEnemyCount();
          }
          if (
            isPackSuppressedStFiller(s, {
              enemyCount: packNear,
              hasCleave,
              hasSwipe,
            })
          ) {
            return false;
          }
        }
      }
      // Multi and AoE damage dumps refuse under two hostiles in the blast geometry, measured around
      // the caster or the focus. A hostile-aura PBAoE stays fine at one target.
      if (packDensityOf(s)) {
        const yards = multiTargetGateYards(s);
        const dists = groundMultiOf(s) ? blastDistsFromTarget : blastDists;
        let near = 0;
        if (dists) {
          for (const d of dists) if (d <= yards) near++;
        } else {
          near = blastEnemyCount();
        }
        if (near < 2) return false;
      }
      // Authored mage packs gated Nova on fight-wide enemyCount — it fired at 25 yd
      // with an empty disc, then the kite walked the caster out of Frostbolt.
      if (novaKiteOf(s) && (blastDists || enemyDists)
        && !novaDiscOccupied(blastDists ?? enemyDists, s)) {
        return false;
      }
      // Nothing in the disc the root can hold (immune boss / full root DR) — see above.
      // Pre-fix A/B on this ledger family: 1 nova and 7.7 yd of drift into a root-immune mob.
      if (unholdableAoeCc?.has(s.id)) return false;
      return canCastSpell(f, foe, s, ignoreForm ? { ignoreForm: true } : undefined);
    };

    // "Is the thing I am about to apply already on the body it lands on?" — asked by the engine,
    // so no authored row has to remember it. Periodic damage aims at the focus; a periodic heal is
    // the selected friendly or the caster. Cite: Spell.cpp:2298-2306 TARGET_UNIT_FRIEND.
    const periodicAlreadyOnAimedBody = (id: number, triageAim: boolean): boolean => {
      const s = kitById(f.spec.spells).get(id);
      if (!s) return false;
      const heals = s.effects.some((e) => e.kind === 'restore_health');
      const damages = s.effects.some((e) => e.kind === 'dot');
      if (heals === damages) return false; // neither, or a drain that is both — leave those to rows
      if (heals) {
        if (s.effects.some((e) => e.kind === 'restore_health' && e.applyTo === 'pet')) return false;
        const pin = f.friendlyPin ? ctx.bySide(f.friendlyPin) : null;
        const body = triageAim
          ? (hurt ?? f)
          : selectedOrSelfFriendly(f, foe, pin, dead, isEnemySide);
        if (body === f) return auraCovered(selfSubj.buffs, id);
        return auraCovered(body.buffActive, id);
      }
      if (dead(foe) || foe === f || !targetSubj) return false;
      return auraCovered(targetSubj.debuffs, id);
    };

    // A living foe that still holds this unit on its threat list means the fight is on, whatever the
    // 5 s combat timer says. A Razormane Scout that stopped shooting let the timer lapse on the shaman
    // it held, and an "out of combat" rotation re-armed its opener and waited for ever on an out-of-
    // range Flame Shock. Session time stands in for combat time: the opener is long over.
    const flagged = fighterIsInCombat(f, t);
    const held = !flagged && hostiles.some((e) => !dead(e) && threatOf(e)?.hasThreat(f.side) === true);

    return {
      self: selfSubj,
      target: targetSubj,
      pet: petSubj,
      inCombat: flagged || held,
      combatTimeMs: held ? t : fighterCombatTimeMs(f, t),
      sessionMs: t,
      enemyCount: hostiles.length,
      ...(enemyDists ? { enemyDists } : {}),
      ...(enemyDistsFromTarget ? { enemyDistsFromTarget } : {}),
      ...(unholdableAoeCc ? { unholdableAoeCcSpellIds: unholdableAoeCc } : {}),
      ...(needs.kickableCastPresent && kickableCastPresentOf(f, hostiles)
        ? { kickableCastPresent: true }
        : {}),
      ...(cfg.outdoors === false ? { outdoors: false } : {}),
      totemSlots: occupied,
      weaponImbueHands: imbueSetOf(f, t),
      // Dual-wield open hands: weapon profiles only (shield → no spec.offhand).
      weaponImbueOpenHands: openHandsOf(f, t),
      // M7: unit's own kit counts (ally / BG enemy / player — never another seat's bags).
      itemCounts,
      ...(f.spec.equippedItemEntries?.length
        ? { equippedItemEntries: new Set(f.spec.equippedItemEntries) }
        : {}),
      allyLowestHpPct: hurt ? (hurt.hp / Math.max(1, hurt.spec.maxHealth)) * 100 : 0,
      ...(triageBuffs ? { allyTriageBuffs: triageBuffs } : {}),
      ...(needs.allySubject
        ? {
          allySubject: (fl?: AllyFilter) => allySubjectOf(f, fl),
          allyAimSide: (fl?: AllyFilter) => aimedAllyOf(f, fl)?.side ?? null,
        }
        : {}),
      allyHpPcts,
      ...(allyDistHp ? { allyDistHp } : {}),
      // Arena seats pick via foeOf (GetVictim), not the creature threat list seeded on
      // the lead dps. Cite: PlayerbotRogueAI.cpp:318 pTarget->GetVictim().
      // allyHasAggro is the party peel half of the same walk (Blind the trainer on the healer).
      // Cite: PlayerbotRogueAI.cpp:208-219 FindAttacker(AIT_VICTIMSELF) then Blind.
      ...(needs.hasAggro
        ? {
          hasAggro: hostiles.some((e) => {
            if (dead(e) || e === f) return false;
            const v = foeOf(e);
            return (v !== e && v === f) || threatOf(e)?.getCurrentVictimId() === f.side;
          }),
          allyHasAggro: hostiles.some((e) => {
            if (dead(e) || e === f) return false;
            const v = foeOf(e);
            if (v !== e && v !== f && !dead(v) && friendlyPoolOf(f).includes(v)) return true;
            const vid = threatOf(e)?.getCurrentVictimId();
            if (vid == null || vid === f.side) return false;
            const victim = ctx.bySide(vid as Side);
            return !!victim && victim !== f && !dead(victim) && friendlyPoolOf(f).includes(victim);
          }),
        }
        : {}),
      targetAttackingMe: !dead(foe) && foe !== f && (
        (foeOf(foe) !== foe && foeOf(foe) === f)
        || threatOf(foe)?.getCurrentVictimId() === f.side
      ),
      ...(enemyCastingOnAlly ? { enemyCastingOnAlly } : {}),
      ...(enemyCastingOnSelf ? { enemyCastingOnSelf } : {}),
      ...(needs.aggroHolder ? ((): {
        aggroHolderDebuffs?: Set<number>;
        aggroHolderDebuffStacks?: Map<number, number>;
      } => {
        if (dead(foe) || foe === f) return {};
        const vid = threatOf(foe)?.getCurrentVictimId();
        if (vid == null) return {};
        const victim = ctx.bySide(vid as Side);
        if (!victim || dead(victim)) return {};
        const { ids, stacks } = aggroHolderChipsOf(victim);
        return {
          aggroHolderDebuffs: ids,
          ...(stacks.size ? { aggroHolderDebuffStacks: stacks } : {}),
        };
      })() : {}),
      charmedHostileCount,
      meleeAllyCount,
      // Counted in place: the spread built two throwaway arrays per fighter per tick. The PET term is
      // gone — a pet carries a class id, so a dead one added 1 to a metric no resurrect can act on.
      deadAllyCount: deadAllyCountNow(),
      ...(enemyHealerDists ? { enemyHealerDists } : {}),
      ...(healerSeatPowerPcts ? { healerPowerPcts: healerSeatPowerPcts } : {}),
      partySeats,
      ...(hazardProximityYd != null ? { hazardProximityYd } : {}),
      ...(() => {
        if (dead(foe) || foe === f) return {};
        const d = ctx.distanceBetween(f, foe);
        return d != null ? { targetDistanceYd: d } : {};
      })(),
      creatureDistanceYd: (entry) => {
        const id = entry | 0;
        if (id <= 0) return null;
        const here = ctx.posOf?.(f.side);
        if (!here) return null;
        let best: number | null = null;
        for (const h of hostiles) {
          if (dead(h) || ((h.spec.creatureEntry ?? 0) | 0) !== id) continue;
          const p = ctx.posOf?.(h.side);
          if (!p) continue;
          const d = combatDistanceYd(here, p);
          if (d != null && (best == null || d < best)) best = d;
        }
        return best;
      },
      // Lazy on purpose: a closure costs nothing until a camp-split row asks, so this needs no
      // ProviderNeeds flag. Cite: boss_thaddius.cpp:443-468 the same 13 yd both halves read.
      allyWithoutAuraNearYd: (aura) => {
        const here = ctx.posOf?.(f.side);
        if (!here) return null;
        let best: number | null = null;
        for (const u of alliesMissingAura(f, aura)) {
          const p = ctx.posOf?.(u.side);
          if (!p) continue;
          const d = combatDistanceYd(here, p);
          if (d != null && (best == null || d < best)) best = d;
        }
        return best;
      },
      // Does anyone in the party still need this buff? The gate on a `{ allyMissingAura }` row, and
      // it reads the same list the cast will pick from, so the row cannot fire with nobody to aim at.
      allyMissingAura: (aura, among) => alliesMissingAura(f, aura, among).length > 0,
      // Max stacks of `aura` on any living friendly. 0 when nobody holds it.
      // Cite: raidCustomRows RaidTriggerOn 'anyone'; buffActive is every live aura.
      allyAuraStacks: (aura) => {
        const id = aura | 0;
        if (id <= 0) return 0;
        let best = 0;
        for (const u of party.pool) {
          if (dead(u) || !u.buffActive.has(id)) continue;
          let stacks = 1;
          for (const e of ctx.effectsOn(u.side)) {
            if (e.spellId !== id) continue;
            const n = e.stacks ?? 1;
            if (n > stacks) stacks = n;
          }
          if (stacks > best) best = stacks;
        }
        return best;
      },
      ...(inTargetCone != null ? { inTargetCone } : {}),
      ...(hostileCreatureEntries ? { hostileCreatureEntries } : {}),
      pullSpentSpellIds,
      pullSpentItemEntries,
      ...((): { followUpChain?: readonly RuleAfterStep[] } => {
        const chain = liveFollowUpChain(f, t);
        return chain.length ? { followUpChain: chain } : {};
      })(),
      dispellableOnFriendlies,
      dispellableOnTarget,
      ...raidSnapFields(f, liveRaidPlan()),
      // `target: 'other'` rules ask this before they win the tick — same selector the cast
      // uses, so "the rule fired" and "a legal second mob exists" can never disagree.
      offTargetSpell: (id) => pickCcTarget(f, foe, kitById(f.spec.spells).get(id)) != null,
      // Same selector, as a subject: the gate on an off-target row reads the mob the cast hits.
      offTargetSubject: (id) => {
        const other = pickCcTarget(f, foe, kitById(f.spec.spells).get(id));
        return other ? subjectFromView(other, f) : null;
      },
      // Same record the off-target selector reads, asked about the focus: a rule with no
      // pack-density gate casts AT the focus, and re-applying there is the spam this fixes.
      ccBrokenOnTarget: (id) => {
        if (foe.ccDamageBrokenBy?.has(f.side) !== true) return false;
        const s = kitById(f.spec.spells).get(id);
        return s != null && isBreakOnDamageCc(s);
      },
      auraCovered,
      periodicAlreadyOnAimedBody,
      usableSpell: (id) => usableSpellWith(id, false),
      // The stance-row probe: the same gates with the shapeshift one skipped. Paired with
      // `stanceSpellForForm`, it lets the evaluator swap stance FOR a row instead of skipping it.
      usableSpellIgnoringForm: (id) => usableSpellWith(id, true),
      stanceSpellForForm: (formId) => {
        const want = formId | 0;
        if (!want) return null;
        for (const s of f.spec.spells) {
          if (!isFormSpell(s) || formIdFromSpell(s) !== want) continue;
          return canCastSpell(f, f, s) ? s.id : null;
        }
        return null;
      },
      formEnteredBySpell: (id) => {
        const s = kitById(f.spec.spells).get(id);
        return s && isFormSpell(s) ? (formIdFromSpell(s) || null) : null;
      },
      usableOnCreatureEntry: (id, entry) => {
        const s = kitById(f.spec.spells).get(id);
        if (!s || isTriggeredCompanion(f, s)) return false;
        if (s.onNextSwing && f.pendingSwing) return false;
        if (!spellAllowedAtLocation(s, cfg.outdoors !== false, cfg.battlegroundMap)) return false;
        const halt = f.haltDpsSchool;
        if (
          halt && isHostileSpellDef(s) && haltDpsRefusesSchool(halt, s.school)
          && haltDpsCoversEntry(f.haltDpsEntries, entry)
        ) return false;
        const tgt = livingHostilesFor(f).find(
          (h) => !dead(h) && h.spec.creatureEntry === entry,
        );
        if (!tgt) return false;
        return canCastSpell(f, tgt, s);
      },
      // The bag says the object EXISTS; the actionable test says it is worth pressing now. All six
      // gnomeface buttons are present all fight and only the lit one does anything.
      usableObject: (goEntry) => combatObjectBag.includes(goEntry | 0)
        && objectActionable(goEntry),
      usableItem: (entry) => {
        const it = bag.find((x) => x.entry === entry);
        if (!it || it.count <= 0) return false;
        if (f.castingSpell) return false;
        if ((cdMap.get(entry) ?? 0) > t) return false;
        if (
          it.category != null
          && it.categoryCooldownMs != null
          && it.categoryCooldownMs > 0
          && (f.categoryCooldowns.get(it.category) ?? 0) > t
        ) {
          return false;
        }
        return true;
      },
      // Rank ladder: a family row drinks the best rung this unit actually carries. The kit
      // stamped `family`/`rank` (combatItems) because the session holds no DataStore.
      bestFamilyEntry: (family) => {
        let bestEntry: number | null = null;
        let bestRank = -1;
        for (const it of bag) {
          if (it.family !== family || it.count <= 0) continue;
          const rank = it.rank ?? 0;
          if (rank > bestRank) { bestRank = rank; bestEntry = it.entry; }
        }
        return bestEntry;
      },
    };
  };

  /**
   * The capture wrapper. Absent `ctx.snapshotCapture` this is one call and one branch, so a
   * normal fight pays nothing; a probe sets the Map and then reads any seat's condition values.
   */
  const allySnapshot = (f: Fighter, foe: Fighter, needs: ProviderNeeds = NEEDS_ALL): RotationSnapshot => {
    const snap = allySnapshotOf(f, foe, needs);
    cfg.snapshotCapture?.set(f.side, snap);
    return snap;
  };

  // A rotation whose damage rows the focus is immune to returns nothing, and a null pick is white
  // swings a caster holding at range never throws: the fire mage stood off a Fire Elemental forever.
  // Only then does the kit speak, in the class heuristics' order: a DoT not yet ticking, an instant,
  // a cast nuke, the wand. Single-target before ground AoE (Blizzard is a dot), and never a self AoE:
  // Hellfire burned a warlock to death. Healers keep their idle GCDs. Cite: Unit.cpp IsImmuneToSpell ~7329.
  // Only a SCHOOL wall, only a mana caster, only out of form: a bleed-immune mob is most mobs, and a
  // cat pooling energy against one shifted out to Wrath (feral vs Mana Surge 19 s -> 49 s).
  const IMMUNE_FILLER_ROLES = ['dot', 'instant_nuke', 'nuke'] as const;
  const immuneFallbackFiller = (f: Fighter, foe: Fighter): SpellDef | null => {
    if (f.spec.groupRole === 'healer' || foe === f || dead(foe)) return null;
    if (f.spec.powerType !== 'mana' || f.form) return null;
    if (((foe.immunity?.schoolImmuneMask ?? 0) | (foe.immunity?.damageImmuneMask ?? 0)
      | (foe.spec.schoolImmuneMask ?? 0)) === 0) return null;
    if (!targetImmunityIdsFor(foe, f).spells?.size) return null;
    // A reach, too: Hellfire is a self channel that passes the foe test and burns its caster.
    const usable = (s: SpellDef): boolean =>
      (s.rangeMax ?? 0) > 0 && isFoeDirectedOffense(s) && !isTriggeredCompanion(f, s)
      && !isNonCastableTalentProc(s) && canCastSpell(f, foe, s);
    for (const aoe of [false, true]) {
      for (const role of IMMUNE_FILLER_ROLES) {
        // Any of our DoTs already ticking is skipped, hybrids too: Immolate went out 30 times a fight.
        const hit = f.spec.spells.find((s) => roleOf(s) === role && !!s.aoe === aoe && usable(s)
          && !(s.effects.some((e) => e.kind === 'dot') && ctx.effectsOn(foe.side).some(
            (e) => e.kind === 'dot' && e.spellId === s.id && e.source === f.side,
          )));
        if (hit) return hit;
      }
    }
    const shoot = f.spec.spells.find((s) => isRangedAutoRepeatToggle(s) && usable(s));
    return shoot && f.spec.ranged && f.mode !== 'ranged' ? shoot : null;
  };

  const pickAction = (f: Fighter, foe: Fighter): SpellDef | null => {
    const t = ctx.t;
    // E6: MT/OT focus from the raid plan (boss-a / boss-b by stable side order — no entry id).
    // Latch onto allyManualTarget so the next foeOf / swing follows the same body.
    if (f.spec.groupRole === 'tank' && !dead(foe) && isEnemySide(foe.side)) {
      const planned = tankPlanFocus(f, foe, liveRaidPlan());
      if (planned !== foe && isAllySide(f.side) && isEnemySide(planned.side)) {
        ctx.allyManualTarget.set(f.side, planned.side);
        foe = planned;
      } else if (planned !== foe) {
        foe = planned;
      }
    }
    // Hard-controlled: only a breaker that strips the active control(s) (WotF under fear, not stun).
    // Cite: KI-741/KI-737 mechanic-aware isBreaker.
    if (isControlledHard(f)) {
      return f.spec.spells.find((s) => isBreaker(s, f) && !onCooldown(f, s) && canAfford(f, s)) ?? null;
    }

    // Ghost Wolf is a 3s cast — recast never lands while walking in. Buff-cancel, then kit.
    // Also cancel when the chip is up but formSpellId never seeded (display-aura path).
    if (
      isMobilityTravelForm(f.form)
      || [...f.buffActive].some((id) => isMobilityFormSpellId(id))
    ) {
      ctx.leaveForm?.(f);
    }

    // The foe lookup returns the caster when no hostile lives. Enemies and charmed bodies idle here,
    // while friendlies fall through so the rotation can recast keep-ups.
    if (foe === f && (isCharmed(f) || isEnemySide(f.side))) return null;

    // A charmed thrall and our own summons are PetAI-style: melee, or the first usable kit spell. Both
    // are creature bodies with no class rotation, so the ally path would leave them auto-attacking.
    if (isCharmed(f) || f.spec.summonOwnerSide != null) {
      const breaker = f.spec.spells.find((s) => isBreaker(s, f) && !onCooldown(f, s) && canAfford(f, s));
      if (breaker) return breaker; // WotF / similar if available while charmed
      const nuke = f.spec.spells.find(
        (s) =>
          !isTriggeredCompanion(f, s)
          && s.effects.some((e) => e.kind === 'direct_damage' || e.kind === 'weapon_percent_damage')
          && (!s.onNextSwing || !f.pendingSwing)
          && canCastSpell(f, foe, s),
      );
      if (nuke) return nuke;
      // PetAI autocast over the rest of the charmed body's kit: the core puts a charmed creature's
      // spells on the pet bar, which is what lets a mind-controlled add perform a mechanic at all.
      const autocast = f.spec.spells.find(
        (s) =>
          !isTriggeredCompanion(f, s)
          && s.passive !== true
          && (s.effects.length > 0 || (s.rawEffects?.length ?? 0) > 0)
          && (!s.onNextSwing || !f.pendingSwing)
          && canCastSpell(f, foe, s),
      );
      return autocast ?? null; // null â†’ auto-attack / swing
    }

    // The enemy EventAI cast scheduler. A seat owning a Rotation skips it (the empty-slot return
    // would mute a BG playerbot), and so does a seat's PET, which takes the ally pet's heuristics.
    if (isEnemySide(f.side) && !ctx.unitActionProvider.get(f.side) && f.spec.petFullKit == null) {
      const castState = enemyCastBySide.get(f.side as EnemySide);
      if (castState) {
        // Fleeing: stop selecting casts (SetCombatScriptStatus / ORDER_FLEEING).
        // Cite: UnitAI.cpp DoFlee ~829â€“841.
        if (castState.eventAi.fleeing) return null;
        if (castState.slots.length === 0) return null;
        // No threat means no victim and so not in combat, and no cast is selectable. Only the endless
        // path was gated, so a world-fight mob cast at t=0 before the player's opener landed.
        const tm1 = threatOf(f);
        if (!tm1 || tm1.isEmpty()) return null;
        // UpdateSpellLists consumes its timer at the top of every evaluation, cast or not, so the poll
        // is a cadence rather than a cooldown on success. Off-poll ticks still run the other slots.
        const spellListPollOpen = t >= castState.spellListPollAt;
        if (spellListPollOpen) castState.spellListPollAt = t + SPELL_LIST_POLL_MS;
        castState.pendingSlot = null;
        const maxHp = Math.max(1, f.spec.maxHealth);
        const hpPct = Math.floor((f.hp * 100) / maxHp);
        const manaMax = f.maxMana > 0 ? f.maxMana : (f.spec.powerType === 'mana' ? f.spec.maxPower : 0);
        const manaNow = f.spec.powerType === 'mana' ? f.power : f.mana;
        const manaPct = manaMax > 0 ? Math.floor((manaNow * 100) / manaMax) : undefined;
        const foeMaxHp = Math.max(1, foe.spec.maxHealth);
        const targetHpPct = Math.floor((foe.hp * 100) / foeMaxHp);
        const foeManaMax = foe.maxMana > 0 ? foe.maxMana : (foe.spec.powerType === 'mana' ? foe.spec.maxPower : 0);
        const foeManaNow = foe.spec.powerType === 'mana' ? foe.power : foe.mana;
        const targetManaPct = foeManaMax > 0 ? Math.floor((foeManaNow * 100) / foeManaMax) : undefined;
        // The friendly-condition rows scan living pack mates. On the endless floor only engaged injects
        // are pack mates — a passive standing nearby is not.
        const isCcLocked = (u: Fighter): boolean =>
          u.stunnedUntil > t || u.fearedUntil > t || u.incapUntil > t;
        const packMate = (ally: Fighter): boolean => {
          if (ally === f || !(ally.hp > 0)) return false;
          if (!cfg.endless) return true;
          const tm2 = threatOf(ally);
          return !!tm2 && !tm2.isEmpty();
        };
        const friendlies = ctx.livingEnemies()
          .filter(packMate)
          .map((ally) => {
            const aMax = Math.max(1, ally.spec.maxHealth);
            return {
              hp: ally.hp,
              maxHp: aMax,
              hpPct: Math.floor((ally.hp * 100) / aMax),
              distanceYd: distanceBetween(f, ally),
              hasAura: (spellId: number, stacks: number) =>
                ally.buffActive.has(spellId) && stacks <= 1,
              hasCc: isCcLocked(ally),
            };
          });
        // Include self so healers can top themselves up (DoSelectLowestHpFriendly targetSelf).
        {
          const sMax = Math.max(1, f.spec.maxHealth);
          friendlies.push({
            hp: f.hp,
            maxHp: sMax,
            hpPct,
            distanceYd: 0,
            hasAura: (spellId: number, stacks: number) =>
              f.buffActive.has(spellId) && stacks <= 1,
            hasCc: isCcLocked(f),
          });
        }
        // The combat-condition gate for spell-list rows, built here because only this scope can count
        // who is attacking whom. Counts stay undefined without geometry, which reads as not modelled.
        const condTable = cfg.combatConditionTable;
        const attackersOf = (u: Fighter): Fighter[] =>
          livingHostilesFor(u).filter((h) => !dead(h) && foeOf(h) === u);
        const conditionUnit = (u: Fighter): ConditionUnit => {
          const att = attackersOf(u);
          const uMaxHp = Math.max(1, u.spec.maxHealth);
          const out: ConditionUnit = {
            hpPct: Math.floor((u.hp * 100) / uMaxHp),
            attackers: att.length,
            casting: unitIsCastingOrChanneling(u, t),
          };
          // One null distance means the session has no geometry; a fabricated 0 would make
          // Thaddius throw Ball Lightning while tanked. Cite: isInMeleeOf "do not invent".
          let melee = 0;
          let known = true;
          for (const h of att) {
            const d = distanceBetween(u, h);
            if (d == null) { known = false; break; }
            if (d <= MIN_AGGRO_DISTANCE) melee++;
          }
          if (known) out.meleeAttackers = melee;
          return out;
        };

        // ANY living hostile inside melee reach, for the existence-test rows. Undefined distances
        // leave it undefined, which reads as "not modelled" rather than "nobody".
        const anyHostileInMelee = ((): boolean | undefined => {
          let known = false;
          for (const h of livingHostilesFor(f)) {
            if (dead(h)) continue;
            const d = distanceBetween(f, h);
            if (d == null) continue;
            known = true;
            const reach = meleeContactYd(
              ctx.isMoving(f.side) && ctx.isMoving(h.side),
              f.spec.combatReachYd,
              h.spec.combatReachYd,
            );
            if (d <= reach) return true;
          }
          return known ? false : undefined;
        })();

        let slot = pickCreatureCast(castState.slots, {
          t,
          spellListPollOpen,
          // A bar up / a live channel refuses every non-TRIGGERED, non-INTERRUPT_PREVIOUS row.
          // Cite: UnitAI.cpp:178,:280,:941,:1194.
          selfCasting: unitIsCastingOrChanneling(f, t),
          rng,
          hpPct,
          manaPct,
          targetHpPct,
          targetManaPct,
          // EventAI m_Phase for event_inverse_phase_mask. Cite: CheckEvent ~266â€“270.
          phase: castState.eventAi.phase,
          // Reaching here means the threat gate above passed, so the creature has a victim.
          inCombat: true,
          friendlies,
          // buffActive is spell-id presence (stacks modeled as 1 when present).
          hasAura: (spellId, stacks) => f.buffActive.has(spellId) && stacks <= 1,
          targetHasAura: (spellId, stacks) => foe.buffActive.has(spellId) && stacks <= 1,
          // CAST_AURA_NOT_PRESENT reads the SPELL'S target: the victim for a hostile row,
          // the caster for a self-cast. Cite: UnitAI.cpp:184-192.
          targetHasSpellAura: (spellId) => foe.buffActive.has(spellId),
          selfHasSpellAura: (spellId) => f.buffActive.has(spellId),
          targetCasting: unitIsCastingOrChanneling(foe, t),
          // EVENT_T_SPELLHIT: only a hit from this tick or the last one counts. The stamp
          // expires so a hit no row filters on cannot satisfy an "any spell" row later.
          spellHitId: freshSpellHit(f) ? f.spellHitId : undefined,
          spellHitSchoolMask: freshSpellHit(f) ? f.spellHitSchoolMask : undefined,
          // CAST_PLAYER_ONLY â€” player side is always a player; pets are not.
          // Cite: CreatureEventAI.cpp ~790â€“791 SELECT_FLAG_PLAYER.
          targetIsPlayer: foe.side === 'player' || isAllySide(foe.side),
          // getClass() pool for selectClass slots. Cite: boss_nefarian.cpp:266-280.
          hostileHasClass: (classId) => livingHostilesFor(f).some(
            (h) => (h.side === 'player' || isAllySide(h.side))
              && ((h.spec.classId ?? 0) | 0) === (classId | 0),
          ),
          // creature_spell_list CombatCondition. Cite: UnitAI.cpp:1218-1224.
          instanceDataOk: (field, equals, notEquals) => dataGatePasses(
            { field, equals, notEquals, cite: 'pick' },
            ctx.instanceData,
          ),
          anyHostileInMelee,
          victimInMelee: (() => {
            const d = distanceBetween(f, foe);
            const reach = meleeContactYd(
              ctx.isMoving(f.side) && ctx.isMoving(foe.side),
              f.spec.combatReachYd,
              foe.spec.combatReachYd,
            );
            return d == null ? undefined : d <= reach;
          })(),
          combatConditionOk: !condTable ? undefined : (conditionId: number) => combatConditionMeets(conditionId, {
            self: conditionUnit(f),
            target: conditionUnit(foe),
            // Friend/enemy pools are the same bodies the friendlies scan above walks.
            friends: ctx.livingEnemies().map(conditionUnit),
            enemies: livingHostilesFor(f).filter((h) => !dead(h)).map(conditionUnit),
            combatCondition: (cid) => condTable.combatCondition(cid),
            unitCondition: (uid) => condTable.unitCondition(uid),
          }),
          // CAST_IGNORE_UNSELECTABLE â€” player is never unselectable in this engine.
          targetUnselectable: false,
          // DG: pairwise yards to current threat target when unitPositionsYd seeded;
          // else legacy encounterDistanceYd. EVENT_T_RANGE gates when defined.
          distanceYd: distanceBetween(f, foe),
          spellReady: (s) => !onCooldown(f, s),
          canCast: (s) => {
            // Resolve the cast flags for this spell from the armed slots. A forced cast already bypassed
            // the check, so this path is non-force only, and a triggered one skips the power cost.
            const slotEntry = castState.slots.find(
              (sl) => sl.spell.id === s.id && !sl.exhausted,
            )?.entry;
            const slotFlags = slotEntry?.castFlags ?? 0;
            const triggered = (slotFlags & CAST_FLAG.TRIGGERED) !== 0;
            if (!triggered && !canAfford(f, s)) return false;
            if (onCooldown(f, s)) return false;
            // The Widow's Embrace lockout: while its debuff is on her, Faerlina's Enrage is refused —
            // that dummy's whole job. Without this the strip buys the raid nothing at all.
            if (widowsEmbraceRefusesCast(s.id, f.buffActive.has(WIDOWS_EMBRACE_CD_SPELL_ID))) {
              return false;
            }
            // Charge may be effect-only with empty effects after the bake and still has to cast so the
            // gap-close travel runs. Script holders and raw summon or knock opcodes cast too.
            if (s.effects.length === 0 && !isChargeRole(s) && !(s.strikeBonus)) {
              const rawOk = (s.rawEffects ?? []).some((r) => {
                const e = r.effect | 0;
                // The raw opcodes that still cast with empty effects: apply-aura holders, the two summon
                // kinds, charge, script and knock-back. Cite: SpellEffectDefines.h:67-68.
                return e === 6 || e === 41 || e === 42 || e === 58 || e === 77 || e === 98;
              });
              // Dummy 3 (Gate 23138) has no mapped effects; CAST_OK still runs timer.actions.
              // Cite: SpellEffects.cpp:910-933; SpellEffectDefines.h SPELL_EFFECT_DUMMY=3.
              const timerActions = (castState.scriptDev?.ir.timers ?? []).some(
                (tm) => tm.spellId === s.id && (tm.actions?.length ?? 0) > 0,
              );
              if (
                !getAuraScript(s.id) && !rawOk && !timerActions
                && !isNefarianClassCallSpell(s.id)
                && (s.id | 0) !== CORRUPTED_MIND_PRIMER_SPELL_ID
                && (s.id | 0) !== CHROMAGGUS_BREATH_SELECTION_SPELL_ID
              ) return false;
            }
            // CheckTargetCreatureType for creature casters too (e.g. beast-only scripts).
            if (isHostileSpellDef(s) && !spellTargetTypeAllowed(s, foe.creatureType)) return false;
            // Spell range plus charge engagement for a creature cast when geometry is known. The used
            // flag is the boar gap-close gate, and a random-target Charge repeats on its own timer.
            if (isChargeRole(s)) {
              const sl = castState.slots.find((x) => x.spell.id === s.id && !x.exhausted);
              const mode = sl?.entry.target;
              const randomCharge = mode === TARGET_T.HOSTILE_RANDOM
                || mode === TARGET_T.HOSTILE_RANDOM_PLAYER
                || mode === TARGET_T.HOSTILE_RANDOM_NOT_TOP
                || mode === TARGET_T.HOSTILE_RANDOM_NOT_TOP_PLAYER;
              if (f.chargeUsed && !randomCharge) return false;
              if (!chargeCastOk(f, foe, s)) return false;
            } else if (slotEntry?.requireMeleeTargetExists && anyHostileInMelee === true) {
              // The reach test is ANY hostile, not the victim: a cast at nullptr over a threat-list
              // pick. Cite: darkshore.cpp:803-809; shadowfang_keep.cpp:477-481.
              return true;
            } else if ((spellNeedsRangeGate(s) || foeDirectedOpaqueCast(s))
              && (!planarRangeHonestYd(ctx.posOf?.(f.side), ctx.posOf?.(foe.side))
                || !isInSpellRange(
                  distanceBetween(f, foe), spellGateRangeMaxYd(s), spellGateRangeMinYd(s),
                  ctx.isMoving(f.side) && ctx.isMoving(foe.side),
                  f.spec.combatReachYd, foe.spec.combatReachYd,
                ))) {
              return false;
            }
            return true;
          },
        });
        if (slot) {
          // One SpellHit enqueues one execution, so spend the pulse here: a repeatable row with no
          // repeat timer re-arms immediately and would otherwise re-fire off the same hit next tick.
          if (slot.entry.eventType === EVENT_T.SPELLHIT) f.spellHitAt = undefined;
          // getClass() switch: one CombatAI action, pick by a random player's class.
          // Cite: boss_nefarian.cpp:266-287. Do not ResetCombatAction when no arm matches.
          if ((slot.entry.selectClass ?? 0) > 0 && slot.entry.scriptId != null) {
            // getClass() is spec.classId (Fighter has none). Cite: boss_nefarian.cpp:266-280.
            const players = livingHostilesFor(f)
              .filter((h) => h.hp > 0 && (h.side === 'player' || isAllySide(h.side)))
              .map((h) => ({ classId: h.spec.classId }));
            const classSlot = resolveClassCallCastSlot(castState.slots, slot, players, rng);
            if (!classSlot) return null;
            slot = classSlot;
          } else {
            // EFLAG_RANDOM_ACTION: one script row fires ONE of its CAST slots per period.
            // Cite: CreatureEventAI.cpp ProcessEvent ~625–650.
            slot = resolveRandomActionCastSlot(castState.slots, slot, rng);
          }
          // event_chance â€” fail â†’ ResetEvent (re-arm) without casting.
          // Cite: CreatureEventAI.cpp ProcessEvent ~607â€“612.
          if (!rollCreatureCastChance(slot.entry, rng)) {
            markCreatureCastRowUsed(castState.slots, slot, t, rng);
            return null;
          }
          if (slot.entry.pollOnly) {
            markCreatureCastRowUsed(castState.slots, slot, t, rng);
            countCreatureCastFire(slot);
            ctx.applyScriptDevTimerActions?.(f, slot.entry.spellId);
            return null;
          }
          // A single outgoing possess: while this caster already holds a living victim, do not re-cast
          // the charm, and do not mark the timer used — wait until it is free.
          const isCharmCast = slot.spell.effects.some(
            (e) => e.kind === 'cc' && (e.mechanic === 'charm' || e.control === 'charm'),
          );
          if (isCharmCast) {
            const holding = ctx.partyUnits().some(
              (u) => isCharmed(u) && u.charmedBy === f.side,
            );
            if (holding) {
              // Poll again soon; do not burn the 30s re-arm on a refused cast.
              slot.readyAt = t + 1000;
              return null;
            }
          }
          castState.pendingSlot = slot;
          return slot.spell;
        }
        return null;
      }
    }

    // Run one unit's editable Rotation. When a provider exists it IS the brain, so a null pick means
    // auto-attack rather than "ask the heuristics". Shared by companions and the PLAYER alike.

    const runRotationProvider = (provider: AllyActionProvider): SpellDef | null | undefined => {
      // Clear before evaluate so a prior tick's halt cannot veto a higher-priority nuke.
      f.haltDpsSchool = undefined;
      f.haltDpsEntries = undefined;
      f.haltDpsUntil = undefined;
      f.killOrderEntries = undefined;
      const needs = provider.needs ?? NEEDS_ALL;
      let snap = allySnapshot(f, foe, needs);
      stampCompanionKnobs(f.side, snap);
      const killOrder = provider.peekKillOrder?.(snap);
      if (killOrder?.length) {
        // The main tank keeps its assigned boss while DPS and off-tanks switch to the first living add.
        // This is the ONLY place answering "does this unit follow the order"; focus reads the answer.
        if (f.spec.groupRole !== 'tank' || isOffTankSeat(liveRaidPlan(), f.side)) {
          f.killOrderEntries = killOrder;
          const preferred = pickHostileByKillOrder(f, livingHostilesFor(f), killOrder);
          if (preferred && preferred !== foe) {
            foe = preferred;
            snap = allySnapshot(f, foe, needs);
            stampCompanionKnobs(f.side, snap);
          }
        }
      }
      // Arm school halt BEFORE evaluate so usableSpell can refuse the wrong school while a
      // lower frost/heal rule still fires (PLAN halt_dps(school) "swap or wait").
      const peeked = provider.peekHalt?.(snap);
      if (peeked) {
        f.haltDpsSchool = peeked.school;
        f.haltDpsEntries = peeked.entries;
      }
      // `let`, because a click whose object is out of reach becomes the WALK to it and falls
      // through to the move branch below - one executor, one arrival test, one feed line.
      let pick = provider(snap);
      if (pick != null && typeof pick === 'object' && 'haltDps' in pick) {
        f.pendingMechanicMove = undefined;
        const haltSchool = pick.school ?? 'all';
        f.haltDpsSchool = haltSchool;
        f.haltDpsEntries = pick.entries;
        // A multi-school halt is an ARRAY, so key the activation edge on its TEXT: comparing the
        // array by identity re-fires every tick, which is the per-tick push the event forbids.
        const haltKey = typeof haltSchool === 'string' ? haltSchool : haltSchool.join('+');
        if (haltSince.get(f.side) !== haltKey) {
          haltSince.set(f.side, haltKey);
          push({ t: ctx.t, kind: 'halt_dps', actor: f.side, school: haltKey });
        }
        return null;
      }
      if (pick != null && typeof pick === 'object' && 'useObject' in pick) {
        const go = pick.useObject | 0;
        const i = combatObjectBag.indexOf(go);
        if (i < 0) { f.pendingMechanicMove = undefined; return null; }
        // YOU WALK TO A BUTTON. Thermaplugg's six stand ~40 yd off his spawn, which IS the mechanic.
        // The walk is the move row the tree already ships, so one executor and one arrival test cover it.
        const site = objectSites.get(go);
        const at = ctx.posOf?.(f.side);
        if (site && at) {
          const gap = detHypot(site.x - at.x, site.y - at.y);
          if (gap > GO_INTERACT_YD) {
            f.pendingObjectClick = go;
            pick = {
              move: {
                kind: 'move_to',
                x: site.x,
                y: site.y,
                ...(site.z != null ? { z: site.z } : {}),
              },
            };
          }
        }
      }
      if (pick != null && typeof pick === 'object' && 'useObject' in pick) {
        const go = pick.useObject | 0;
        const i = combatObjectBag.indexOf(go);
        if (i < 0) { f.pendingMechanicMove = undefined; return null; }
        f.pendingObjectClick = undefined;
        f.pendingMechanicMove = undefined;
        if (!reusableObjects.has(go)) combatObjectBag.splice(i, 1);
        push({ t: ctx.t, kind: 'use_object', actor: f.side, goEntry: go });
        emitSimEffect(ctx, { kind: 'useCombatObject', goEntry: go, side: f.side });
        // The click's own payload: a GO whose DB script activates a trap lays that trap's pool
        // here, because the trap spell is in no creature kit. Cite: useObjectTrap.ts.
        const trapName = layCombatObjectTrap(ctx, cfg, go, f.side);
        if (trapName) push({ t: ctx.t, kind: 'aura', actor: f.side, name: trapName, applied: true });
        return null;
      }
      if (pick != null && typeof pick === 'object' && 'move' in pick) {
        f.pendingMechanicMove = pick.move;
        // The run-out owns MOTION, not the whole tick: an instant fires while walking, since only a cast
        // with time left is cancelled by movement. Otherwise a bomb holder casts nothing all window.
        const alt = 'altSpell' in pick && pick.altSpell != null
          ? spellFromKit(f.spec.spells, pick.altSpell)
          : undefined;
        const since = runoutSince.get(f.side);
        // The claim EDGE: the motion phase has not run this row yet, so it may still abort on its
        // first step. Nothing it did is worth a cast until it has actually moved the unit.
        let justClaimed = false;
        if (!since || since.kind !== pick.move.kind) {
          runoutSince.set(f.side, { kind: pick.move.kind, at: ctx.t });
          // ONE push per row activation, not per tick: this branch is the new-claim edge and a
          // held row re-enters here every tick with `since.kind` unchanged.
          push({ t: ctx.t, kind: 'mechanic_move', actor: f.side, move: pick.move.kind });
          f.mechanicMoveDone = false;
          justClaimed = true;
        } else if (f.mechanicMoveDone) {
          // The row is STANDING, not walking. A condition is a latch, not a countdown, so owning the
          // tick here spent the whole fight's GCDs on a unit already where the row wanted it.
          return alt && canCastSpell(f, foe, alt) ? alt : null;
        } else if (ctx.t - since.at > RUNOUT_YIELD_AFTER_MS && !moveOwnsPastDeadline(f, pick.move)) {
          // Bomb flee_raid gives up after 4 s (Vael).
          f.pendingMechanicMove = undefined;
          return alt && canCastSpell(f, foe, alt) ? alt : null;
        }
        if (alt && (alt.castTimeMs ?? 0) <= 0 && canCastSpell(f, foe, alt)) return alt;
        // A keep_range row that aborts on its first step used to bin the Frostbolt anyway: the frost
        // mage cast 3 in a 39 s duel. Cancel once the row has proven it walks.
        if (justClaimed) return null;
        // Same cancel path as click-to-move / WASD (createSession cancelCastForMove).
        if (f.castingSpell) {
          f.castingSpell = null;
          f.castStartedAt = 0;
          f.castFinishAt = 0;
          f.castPushbacks = 0;
          f.castCost = 0;
          f.castCostPower = undefined;
          f.castCritAdd = 0;
          f.castEffectPct = 0;
        }
        if (f.channeling) maybeCancelChannelOnMove(f, channelInterruptCtx(ctx));
        f.pendingCharge = null;
        return null;
      }
      // A spell/item/null pick means the bomb run-out (etc.) no longer owns motion.
      f.pendingMechanicMove = undefined;
      f.pendingObjectClick = undefined;
      runoutSince.delete(f.side);
      // A spell/item/null pick is the halt row NOT winning this tick, so the window is over.
      haltSince.delete(f.side);
      if (pick != null && typeof pick === 'object' && 'item' in pick) {
        let targetId: CombatantId = f.side;
        if (pick.lowestAlly) {
          // Faction-relative: BG enemy healers triage their own team.
          const hurt = pick.among
            ? aimedAllyOf(f, pick.among)
            : (ctx.lowestHpFriendlyOf?.(f) ?? lowestHpFriendly());
          if (!hurt) return null;
          targetId = hurt.side;
        } else if (pick.target != null) {
          targetId = pick.target;
        }
        useItem(pick.item, targetId, f.side);
        return null;
      }
      let spellId = typeof pick === 'number' ? pick : 0;
      let offTarget: Fighter | null = null;
      // Written to `friendlyPin` only on the branch that actually returns the spell: a pin the pick
      // then failed to use would redirect the NEXT friendly cast. applySpell's aimedFriendlyOf reads
      // it once and deliverSpellImpact clears it, the one-shot the queued Pre-buff order uses.
      let aimAlly: Fighter | null = null;
      const offMap = (ctx as { rotationOffTarget?: Map<Side, EnemySide> }).rotationOffTarget;
      offMap?.delete(f.side);
      if (pick != null && typeof pick === 'object' && 'spell' in pick) {
        spellId = pick.spell;
        armRuleAfter(f, spellId, pick.after);
        if (pick.offTarget) {
          offTarget = pickCcTarget(f, foe, kitById(f.spec.spells).get(spellId));
          // No second mob to control ⇒ skip the rule. Redirecting CC onto the focus is the
          // exact behaviour that makes hard CC useless (and breaks it on the next swing).
          if (!offTarget) return null;
        } else if (pick.creatureEntry != null) {
          // Mind Control that Worshipper (entry selector) — not a BWL hardcode.
          offTarget = livingHostilesFor(f).find(
            (h) => !dead(h) && h.spec.creatureEntry === pick.creatureEntry,
          ) ?? null;
          if (!offTarget) return null;
        } else if (pick.priority != null) {
          offTarget = pickHostileByKillOrder(f, livingHostilesFor(f), pick.priority);
          if (!offTarget) return null;
        } else if (pick.role != null) {
          const role = pick.role;
          const pool = friendlyPoolOf(f).filter(
            (u) => !dead(u) && u !== f && u.spec.groupRole === role,
          );
          const ally = pool[0];
          if (!ally) return null;
          aimAlly = ally;
        } else if (pick.allyMissingAura != null) {
          // Same list the row's usability gate read, so the body the gate saw is the body hit.
          const ally = nearestAllyMissingAura(f, pick.allyMissingAura | 0, pick.among);
          if (!ally) return null;
          aimAlly = ally;
        } else if (pick.lowestAlly) {
          // `among` is the filter the row's ally gates read, so the cast lands on the body measured.
          const hurt = pick.among
            ? aimedAllyOf(f, pick.among)
            : (ctx.lowestHpFriendlyOf?.(f) ?? lowestHpFriendly());
          if (!hurt) return null;
          aimAlly = hurt;
        }
        if (pick.dest && ctx.unitPositionsMutable) {
          (ctx as { rotationSpellDest?: Map<Side, { x: number; y: number; z?: number }> })
            .rotationSpellDest?.set(f.side, pick.dest);
        }
        if (pick.ally != null) {
          const ally = ctx.bySide(pick.ally as Side);
          if (ally && !dead(ally)) aimAlly = ally;
        }
      }
      if (spellId > 0) {
        consumeFollowUp(f, spellId, t);
        const sp = kitById(f.spec.spells).get(spellId);
        // Defensive re-gate: the snapshot's usableSpell already vetted the pick, but a
        // misbehaving provider must not bypass cost/cooldown/target/form rules.
        if (sp && pureInterruptOf(sp) && !offTarget) {
          if (!kickableCastPresentOf(f, hostilesOf(f))) return null;
          const kickTgt = pickInterruptTarget(f, foe, sp);
          if (!kickTgt) return null;
          if (kickTgt !== foe) offTarget = kickTgt;
        }
        // The dispel twin of the kick re-gate: aim at the body carrying the category, so canCastSpell
        // prices range and sight against the unit the effect handler will actually strip.
        if (sp && !offTarget && isDispelSpell(sp)) {
          const de = sp.effects.find((e) => e.kind === 'dispel');
          if (de && de.kind === 'dispel') {
            const res = resolveDispelTarget(f, foe, de.dispelType) as
              { unit: Fighter; friendlyDispel: boolean } | null;
            if (res && !res.friendlyDispel && res.unit !== foe && isEnemySide(res.unit.side)) {
              offTarget = res.unit;
            }
          }
        }
        const aimed = offTarget ?? foe;
        if (sp && !isTriggeredCompanion(f, sp) && (!sp.onNextSwing || !f.pendingSwing) && canCastSpell(f, aimed, sp)) {
          if (offTarget && offMap) offMap.set(f.side, offTarget.side as EnemySide);
          if (aimAlly) f.friendlyPin = aimAlly.side;
          return sp;
        }
      }
      if (pick == null && !f.haltDpsSchool) return immuneFallbackFiller(f, foe);
      return null;
    };

    // The player, on the ticks the engine drives them (instant resolve / chained phases /
    // headless): their own rotation, not a second hidden brain.
    if (f.side === 'player' && cfg.playerActionProvider) {
      return runRotationProvider(cfg.playerActionProvider) ?? null;
    }

    // The enemy rotation provider, for BG playerbots: a null pick is white swings, never the class
    // heuristics for a seat that owns a Rotation. Null slots, like pets, fall through.
    if (isEnemySide(f.side)) {
      const provider = ctx.unitActionProvider.get(f.side);
      if (provider) return runRotationProvider(provider) ?? null;
    }

    // The ally role branch — healer triage and the tank threat kit — then FALL THROUGH to the class
    // heuristics, which key off spec fields rather than side and so drive companions unchanged.
    if (isAllySide(f.side)) {
      // No provider for this slot (companion pets) → S0 role AI below.
      const provider = ctx.unitActionProvider.get(f.side);
      if (provider) return runRotationProvider(provider) ?? null;
      const role = f.spec.groupRole;
      const isFriendlyHeal = (s: SpellDef): boolean =>
        roleOf(s) !== 'pet_heal' && s.effects.some((e) => e.kind === 'heal');
      if (role === 'healer') {
        // lowestHpFriendlyOf, never lowestHpFriendly: the same body applyHealEffect lands on, or the
        // sight gate below prices a different one. Cite: applyHealEffect.ts:104 triage().
        const hurt = lowestHpFriendlyOf(f);
        if (hurt && hurt.hp / Math.max(1, hurt.spec.maxHealth) < ALLY_HEAL_THRESHOLD
          && friendlyCastReaches(f, hurt)) {
          const heal = f.spec.spells.find(
            (s) => isFriendlyHeal(s) && !isTriggeredCompanion(f, s) && !onCooldown(f, s) && canAfford(f, s),
          );
          if (heal) return heal;
        }
      } else if (role === 'tank' && isEnemySide(foe.side) && !dead(foe)) {
        // Taunt back when the target is beating on someone else (EffectTaunt via applySpell).
        const victim = threatOf(foe)?.getCurrentVictimId();
        if (victim != null && victim !== f.side) {
          const taunt = f.spec.spells.find(
            (s) => s.effects.some((e) => e.kind === 'taunt' || e.kind === 'mod_taunt')
              && !onCooldown(f, s) && canAfford(f, s),
          );
          if (taunt) return taunt;
        }
        // Prefer the threat kit (spell_threat flat/multiplier rows, SPELL_EFFECT_THREAT).
        const threatKit = f.spec.spells.find(
          (s) => !isTriggeredCompanion(f, s)
            && !s.effects.some((e) => e.kind === 'taunt' || e.kind === 'mod_taunt')
            && (spellThreatFromDef(s).flat > 0
              || (s.threatMultiplier ?? 1) > 1
              || s.effects.some((e) => e.kind === 'threat' && e.amount > 0))
            && (!s.onNextSwing || !f.pendingSwing)
            && canCastSpell(f, foe, s),
        );
        if (threatKit) return threatKit;
      }
    }

    // Owner mends a hurt pet first (so the Auto-resolve AI keeps it alive, like the rotation does).
    if (f.side === 'player' && pet && !dead(pet) && pet.hp / pet.spec.maxHealth < TUNING.mendPetThreshold) {
      const mend = find(f, 'pet_heal');
      if (mend && !pet.buffActive.has(mend.id) && canCastSpell(f, pet, mend)) return mend;
    }
    // The player as party healer: triage the lowest-HP friendly, the same gate ally healers use.
    // Without it, signing as healer only self-healed and never topped the tank.
    if (
      f.side === 'player'
      && f.spec.groupRole === 'healer'
      && (f.spec.powerType === 'mana' || f.spec.powerType === 'focus')
    ) {
      const hurt = lowestHpFriendlyOf(f);
      if (hurt && hurt.hp / Math.max(1, hurt.spec.maxHealth) < ALLY_HEAL_THRESHOLD
        && friendlyCastReaches(f, hurt)) {
        const heal = f.spec.spells.find(
          (s) =>
            roleOf(s) !== 'pet_heal'
            && spellHeals(s)
            && !isTriggeredCompanion(f, s)
            && !onCooldown(f, s)
            && canAfford(f, s)
            && !hurt.buffActive.has(s.id),
        );
        if (heal) return heal;
      }
    }
    // A player self-heal when hurt, for mana casters only — the rage and energy branches own their own
    // kits. Skipped while already acting as group healer, since triage covers self and party.
    if (
      f.side === 'player'
      && f.spec.groupRole !== 'healer'
      && (f.spec.powerType === 'mana' || f.spec.powerType === 'focus')
      && f.hp / Math.max(1, f.spec.maxHealth) < ALLY_HEAL_THRESHOLD
    ) {
      const heal = f.spec.spells.find(
        (s) =>
          roleOf(s) !== 'pet_heal'
          && spellHeals(s)
          && !isTriggeredCompanion(f, s)
          && !onCooldown(f, s)
          && canAfford(f, s)
          // Skip while a HoT from this spell is already ticking (refresh starves ticks).
          && !f.buffActive.has(s.id),
      );
      if (heal) return heal;
    }
    // Multi-target strike preference for the party's auto-resolve: two or more hostiles in the melee
    // band, not fight-wide. Party-side only, and byte-identical with one living enemy.
    const fanStrike = (): SpellDef | undefined => {
      if (isEnemySide(f.side)) return undefined;
      if (!kitHasFanStrike(f.spec.spells)) return undefined;
      let near = 0;
      if (ctx.unitPositionsMutable) {
        for (const e of livingEnemies()) {
          if (dead(e) || ccProtected(e)) continue;
          const d = distanceBetween(f, e);
          if (d != null && d <= 8) near++;
        }
      } else {
        near = blastEnemyCount();
      }
      if (near < 2) return undefined;
      return f.spec.spells.find(
        (s) =>
          roleOf(s) === 'strike'
          && !isTriggeredCompanion(f, s)
          && (s.aoe || nextSwingFanCap(s) != null),
      );
    };
    if (f.spec.powerType === 'rage') {
      const charge = find(f, 'charge');
      // Charge: OOC only (notInCombatOnly + combat timer). Re-arms after leave combat.
      // Cite: Spell.cpp IsNonCombatSpell; canCastSpell stealthPosError / chargeUsed.
      if (charge && canCastSpell(f, foe, charge)) return charge;
      // Find the first CASTABLE buff: mid kits list Shield Wall and Recklessness before Battle Shout,
      // and those cost nothing but need a stance the AI never enters, so the branch stuck on them.
      const shout = f.spec.spells.find(
        (s) =>
          roleOf(s) === 'buff'
          && !isTriggeredCompanion(f, s)
          && !f.buffActive.has(s.id)
          && canCastSpell(f, foe, s),
      );
      if (shout) return shout;
      // Keep a snare on. The heuristic path only — rotations already keep these — but without it BG
      // bots on rage never cast a slow at all: the engine applied them and nobody pressed them.
      if (controlActive(foe, 'snare') !== true) {
        const snareImmune = targetImmunityIdsFor(foe, f).auras;
        const dist = distanceBetween(f, foe);
        const geo = !!ctx.unitPositionsMutable;
        const foeInMelee = inMeleeBand(dist ?? null, geo);
        const snare = f.spec.spells.find((s) => {
          if (isTriggeredCompanion(f, s) || snareImmune?.has(s.id)) return false;
          const speedSnare = s.effects.some((e) =>
            (e.kind === 'speed' && (e.hostile === true || (e.hostile !== false && (e.pct ?? 0) < 0)))
            || (e.kind === 'cc' && (e as { mechanic?: string }).mechanic === 'snare'),
          );
          // Hamstring's snare is only on the APPLY_AURA slot (effects[] is the 5-damage hit).
          const auraSnare = mechanicAuraSlotsOf(s).some((r) => (r.mechanic | 0) === 11);
          if (!speedSnare && !auraSnare) return false;
          if (isPiercingHowlSpell(s) && piercingHowlRefused({
            inMelee: foeInMelee,
            snared: false,
            snareImmune: isImmuneToMechanic(foe.immunity, 'snare', {
              mechanicImmuneMask: foe.spec.mechanicImmuneMask,
            }),
            distanceYd: dist ?? null,
            radiusYd: s.radiusYd,
          })) return false;
          return canCastSpell(f, foe, s);
        });
        if (snare) return snare;
      }
      const rend = f.spec.spells.find(
        (s) =>
          roleOf(s) === 'dot'
          && !isTriggeredCompanion(f, s)
          && !ctx.effectsOn(foe.side).some((e) =>
            e.kind === 'dot' && e.source === f.side && e.spellId === s.id)
          && canCastSpell(f, foe, s),
      );
      if (rend) return rend;
      // Prefer fan strike (Cleave/WW) when multi-target, else first castable single strike.
      // canCastSpell covers stance/form, cost, CD; onNextSwing still needs free pendingSwing.
      const fan = fanStrike();
      if (fan && (!fan.onNextSwing || !f.pendingSwing) && canCastSpell(f, foe, fan)) return fan;
      const strike = f.spec.spells.find(
        (s) =>
          roleOf(s) === 'strike'
          && !isTriggeredCompanion(f, s)
          && (!s.onNextSwing || !f.pendingSwing)
          && canCastSpell(f, foe, s),
      );
      if (strike) return strike;
      return null;
    }
    // Energy (rogue): keep Slice and Dice up, dump finishers at 4â€“5 CP, otherwise builders.
    // canCastSpell already drops Ruthlessness-style free talent procs and weapon-gated Backstab.
    if (f.spec.powerType === 'energy') {
      const snd = f.spec.spells.find((s) => s.requiresComboPoints && s.effects.some((e) => e.kind === 'buff' && e.mod === 'haste'));
      if (snd && !f.buffActive.has(snd.id) && f.comboPoints > 0 && canCastSpell(f, foe, snd)) return snd;
      const evis = f.spec.spells.find((s) => s.requiresComboPoints && s.effects.some((e) => e.kind === 'direct_damage'));
      if (evis && f.comboPoints >= 4 && canCastSpell(f, foe, evis)) return evis;
      const builder = f.spec.spells.find((s) => !!s.comboPointsGenerated && !s.requiresComboPoints && canCastSpell(f, foe, s));
      if (builder) return builder;
      const strike = fanStrike() ?? find(f, 'strike');
      if (strike && canCastSpell(f, foe, strike)) return strike;
      return null;
    }
    // Pet upkeep before it starts nuking: self-heal when hurt, keep its self-buffs up, and pulse
    // positive threat. Heals are excluded from the buff scan so a full-health pet does not re-cast one.
    if (f.side === 'pet') {
      const isHeal = (s: SpellDef): boolean =>
        s.effects.some((e) => e.kind === 'heal' || e.kind === 'restore_health');
      if (f.hp / f.spec.maxHealth < TUNING.mendPetThreshold) {
        const heal = f.spec.spells.find(
          (s) =>
            isHeal(s)
            && !isTriggeredCompanion(f, s)
            && canAfford(f, s)
            && !onCooldown(f, s)
            // Direct heals never set buffActive; HoTs do â€” skip while the aura is live.
            && !f.buffActive.has(s.id),
        );
        if (heal) return heal;
      }
      // PetAI CanAutoCast → CheckRange: Charge fires in the 8–25 band, not from melee.
      // Cite: Spell.cpp:6126 CanAutoCast; :5971 CheckPetCast → CheckCast(true).
      const charge = f.spec.spells.find((s) => isChargeRole(s) && canCastSpell(f, foe, s));
      if (charge) return charge;
      // A buff the DBC aims at a party member is checked on the ALLY, not on the pet: the imp's
      // Fire Shield sits on its master, so a self buffActive gate re-cast it every GCD.
      // Cite: PetAI.cpp:292-305 walk m_AllySet until CanAutoCast; Spell.cpp:2325-2330.
      const buff = f.spec.spells.find(
        (s) =>
          roleOf(s) === 'buff'
          && !isHeal(s)
          && !isTriggeredCompanion(f, s)
          && (auraHolderExcludesCaster(s)
            ? nearestAllyMissingAura(f, s.id) != null
            : !f.buffActive.has(s.id))
          && canAfford(f, s)
          && !onCooldown(f, s),
      );
      if (buff) {
        if (auraHolderExcludesCaster(buff)) {
          const ally = nearestAllyMissingAura(f, buff.id);
          if (ally) f.friendlyPin = ally.side;
        }
        return buff;
      }
      // Keep its damage-over-time up — the caster branch below only nukes, so without this a pet would
      // never apply one. Refresh only when this pet has no dot of its own already ticking.
      const dot = find(f, 'dot');
      if (dot && canCastSpell(f, foe, dot) && !ctx.effectsOn(foe.side).some((e) => e.kind === 'dot' && e.source === f.side)) return dot;
    }
    // Paladin: keep a seal up, since it procs on every swing, then spend Judgement on cooldown to
    // unleash it. It fires only for a fighter that knows seals, so every other pick order is unchanged.
    const seals = f.spec.spells.filter((s) => roleOf(s) === 'seal');
    if (seals.length) {
      if (!f.activeSeal) {
        // Command before Righteousness: the talent seal is the stronger swing proc, and the order the
        // spell list happens to come in must not decide which one a Ret paladin keeps up.
        const sealKind = (s: SpellDef): string => { const e = s.effects.find((x) => x.kind === 'seal'); return e && e.kind === 'seal' ? e.seal : ''; };
        const best = seals.find((s) => sealKind(s) === 'command')
          ?? seals.find((s) => sealKind(s) === 'righteousness')
          ?? seals[0];
        if (best && canAfford(f, best) && !onCooldown(f, best)) return best;
      } else {
        const judge = find(f, 'judgement');
        if (judge && canCastSpell(f, foe, judge)) return judge;
      }
    }
    // Control: hard CC under the existing gate, and interrupt-type control only while the foe is mid
    // interruptible cast. Never pick CC that cannot land — a cost-free fear would re-select every GCD.

    const control = f.spec.spells.find((s) => {
      if (roleOf(s) !== 'control' || isTriggeredCompanion(f, s)) return false;
      if (isNonCastableTalentProc(s)) return false;
      if (onCooldown(f, s) || !canAfford(f, s)) return false;
      // Interrupts only mid-cast (Earth Shock / Kick / Spell Lock), on whoever is actually
      // casting — foeOf can be a melee dummy while the healer add holds the bar.
      if (s.effects.some((e) => e.kind === 'interrupt_cast')) {
        return kickableCastPresentOf(f, hostilesOf(f)) && pickInterruptTarget(f, foe, s) != null;
      }
      // Pure dispel â†’ dispel branch (Purge was starving resto shaman nukes â€” KI-600).
      const hasHardCc = s.effects.some((e) => e.kind === 'cc' || e.kind === 'root');
      if (!hasHardCc) return false;
      // ONE brain decides player-faction CC, and it is the rotation the player can see and edit. This
      // heuristic was a second one, aimed at the party's kill focus. Enemies keep it: their list IS it.
      if (!isEnemySide(f.side)) return false;
      if (isControlledHard(foe) || foe.rootedUntil > t) return false;
      // Hard CC / root must be able to land â€” otherwise fall through to DoT/nuke (KI-148).
      return hardControlCanLand(f, foe, s);
    });
    if (control) {
      if (interruptCastOf(control)) {
        const kickTgt = pickInterruptTarget(f, foe, control);
        if (kickTgt && kickTgt !== foe) {
          (ctx as { rotationOffTarget?: Map<Side, EnemySide> }).rotationOffTarget
            ?.set(f.side, kickTgt.side as EnemySide);
        }
      }
      return control;
    }
    // Dispel, auto-placed like interrupts: a companion uses its cure whenever a valid target exists.
    // The same selector the effect handler uses, so "would it do anything" equals "does it fire".
    const dispelSpell = f.spec.spells.find((s) => {
      if (isTriggeredCompanion(f, s)) return false;
      if (onCooldown(f, s) || !canAfford(f, s)) return false;
      const de = s.effects.find((e) => e.kind === 'dispel');
      if (!de || de.kind !== 'dispel') return false;
      const res = resolveDispelTarget(f, foe, de.dispelType);
      if (!res) return false;
      if (dispelCatClaimedByOther(res.unit.side, f.side, de.dispelType)) return false;
      return true;
    });
    if (dispelSpell) return dispelSpell;
    // The pet tank pulse, after the interrupt and before the nuke tail. Positive threat only, so a
    // negative-amount kiss is not treated as an offensive cast. Pet-scoped, so other AI is unchanged.
    if (f.side === 'pet') {
      const torment = f.spec.spells.find(
        (s) =>
          !isTriggeredCompanion(f, s)
          && s.effects.some((e) => e.kind === 'threat' && e.amount > 0)
          && !f.buffActive.has(s.id)
          && canCastSpell(f, foe, s),
      );
      if (torment) return torment;
    }
    // DoT upkeep for mana and focus casters, per spell rather than any-dot, so two curses each keep
    // themselves. A hybrid applies once. Range and stand-down are checked, never cost and cooldown alone.
    const hasDotPayload = (s: SpellDef): boolean => memoSpellBool(dotPayloadCache, (sp) => sp.effects.some((e) => e.kind === 'dot'), s);
    const ownDotLive = (s: SpellDef): boolean =>
      ctx.effectsOn(foe.side).some(
        (e) => e.kind === 'dot' && e.spellId === s.id && e.source === f.side,
      );
    if (f.side !== 'pet') {
      // Pure DoTs first (Corruption / CoA), then hybrid openers (Immolate) — multi-DoT kit.
      // canCastSpell already skips school-immune first picks (KI-695 Flame Shock vs nature mask).
      const missingDotOf = (want: 'pure' | 'hybrid'): SpellDef | undefined =>
        f.spec.spells.find((s) => {
          if (isTriggeredCompanion(f, s) || isNonCastableTalentProc(s)) return false;
          const r = roleOf(s);
          const pureDot = r === 'dot';
          const hybrid = hasDotPayload(s) && (r === 'nuke' || r === 'instant_nuke');
          if (want === 'pure' ? !pureDot : !hybrid) return false;
          if (!canCastSpell(f, foe, s)) return false;
          return !ownDotLive(s);
        });
      const missingDot = missingDotOf('pure') ?? missingDotOf('hybrid');
      if (missingDot) return missingDot;
    }
    // Instant / cast-time fillers: skip hybrids already ticking (Immolate spam → Shadow Bolt, KI-633).
    const pickFiller = (role: 'instant_nuke' | 'nuke'): SpellDef | undefined => {
      const pure = f.spec.spells.find(
        (s) =>
          roleOf(s) === role
          && !isTriggeredCompanion(f, s)
          && !isNonCastableTalentProc(s)
          && !hasDotPayload(s)
          && canCastSpell(f, foe, s),
      );
      if (pure) return pure;
      return f.spec.spells.find(
        (s) =>
          roleOf(s) === role
          && !isTriggeredCompanion(f, s)
          && !isNonCastableTalentProc(s)
          && canCastSpell(f, foe, s)
          && !(hasDotPayload(s) && ownDotLive(s)),
      );
    };
    const instant = pickFiller('instant_nuke');
    if (instant) return instant;
    const nuke = pickFiller('nuke');
    if (nuke) return nuke;
    // Free Shoot/Auto Shot when not already ranged (casters OOM; hunters after melee weave). Cite: KI-745/870.
    const shoot = f.spec.spells.find(
      (s) => isRangedAutoRepeatToggle(s) && !isTriggeredCompanion(f, s) && canCastSpell(f, foe, s),
    );
    if (shoot && f.spec.ranged && f.mode !== 'ranged') {
      return shoot;
    }
    return null;
  };

  // The off-GCD next-swing arm. Classic queues these beside the GCD, and a single provider pick made
  // pack Cleave starve whenever a GCD ability won. The rage reserve holds only a ready signature dump.
  const isCooldownGatedSpender = (s: SpellDef): boolean => {
    if (s.onNextSwing || (s.cost ?? 0) < 20 || ((s.cooldownMs ?? 0) | 0) <= 0) return false;
    const n = (s.name ?? '').toLowerCase();
    if (n === 'mortal strike' || n === 'bloodthirst' || n === 'whirlwind' || n === 'shield slam') return true;
    return roleOf(s) === 'strike' && !s.aoe && (s.cost ?? 0) >= 25;
  };
  /** canCastSpell without the cost gate â€” used to reserve rage while still short. */
  const canCastIgnoringCost = (f: Fighter, foe: Fighter, spell: SpellDef): boolean => {
    if (onCooldown(f, spell)) return false;
    if (schoolLocked(f, spell)) return false;
    if (isHostileSpellDef(spell) && !spellTargetTypeAllowed(spell, foe.creatureType)) return false;
    if (focusImmunityBlocksSpell(
      spell,
      foe,
      selfCenteredOf(spell) ? blastEnemyCount() : 1,
    )) return false;
    if (requiresLivingPetTarget(spell) && !livingPetOf(f)) return false;
    if (spell.requiresComboPoints && comboOn(f, foe) <= 0) return false;
    const gate = resolveFormCast(spell, f.form);
    if (!gate.ok) return false;
    if (stealthPosError(f, foe, spell)) return false;
    if (isChargeRole(spell)) {
      if (f.chargeUsed && spell.notInCombatOnly) return false;
      if (!chargeCastOk(f, foe, spell)) return false;
    } else if ((spellNeedsRangeGate(spell) || foeDirectedOpaqueCast(spell))
      && (!planarRangeHonestYd(ctx.posOf?.(f.side), ctx.posOf?.(foe.side))
        || !isInSpellRange(
          distanceBetween(f, foe), spellGateRangeMaxYd(spell), spellGateRangeMinYd(spell),
          ctx.isMoving(f.side) && ctx.isMoving(foe.side),
          f.spec.combatReachYd, foe.spec.combatReachYd,
        ))) {
      return false;
    } else if (beyondAcquireRange(f, foe, spell)) {
      return false;
    }
    if (spell.condition || (spell.conditionId != null && spell.conditionId !== 0)) {
      if (!passesConditionGate(spell, conditionSnapshotFor(f), cfg.conditionTable).ok) return false;
    }
    if (reactiveCastGate(f, foe, spell, ctx.t) != null) return false;
    if (targetCastGate(f, foe, spell, ctx.t) != null) return false;
    if (isPlayerCharacterSide(f.side) && playerMissingRequiredEquippedItem(spell, f.spec)) return false;
    return true;
  };
  // The only spells this can return are the five named arms, so a kit without one has nothing to find —
  // yet every fighter paid the reserve scan, 17.2% of an 80-unit profile. Pre-split per kit array.
  const SWING_ARM_MULTI = new Set(['cleave', 'swipe']);
  const SWING_ARM_SINGLE = new Set(['heroic strike', 'maul', 'raptor strike']);
  type SwingArms = { arms: SpellDef[]; spenders: SpellDef[] };
  const swingArmCache = new WeakMap<readonly SpellDef[], SwingArms>();
  const swingArmsOf = (spells: readonly SpellDef[]): SwingArms => {
    let hit = swingArmCache.get(spells);
    if (!hit) {
      const arms: SpellDef[] = [];
      for (const s of spells) {
        if (!s.onNextSwing) continue;
        const n = (s.name ?? '').toLowerCase();
        if (SWING_ARM_MULTI.has(n) || SWING_ARM_SINGLE.has(n)) arms.push(s);
      }
      hit = { arms, spenders: arms.length ? spells.filter(isCooldownGatedSpender) : [] };
      swingArmCache.set(spells, hit);
    }
    return hit;
  };

  const pickNextSwingArm = (f: Fighter, foe: Fighter): SpellDef | null => {
    if (f.pendingSwing || isEnemySide(f.side) || dead(f)) return null;
    // The self-sentinel means no living hostiles. Every arm here is a hostile ability the cast path
    // refuses at that sentinel, so the whole search could only pick something then dropped.
    if (foe === f || dead(foe)) return null;
    const { arms, spenders } = swingArmsOf(f.spec.spells);
    if (arms.length === 0) return null;
    let hasMultiArm = false;
    for (const a of arms) {
      if (SWING_ARM_MULTI.has((a.name ?? '').toLowerCase())) { hasMultiArm = true; break; }
    }
    // The loop below refuses anything the unit cannot pay for INCLUDING the reserve, which is never
    // negative — so failing the CHEAPEST arm first skips the distance loop and the spender walk.
    let cheapestArm = Number.POSITIVE_INFINITY;
    for (const a of arms) {
      const c = a.cost ?? 0;
      if (c < cheapestArm) cheapestArm = c;
    }
    if (f.power < cheapestArm) return null;
    // Cleave arm only when 2+ hostiles are actually in the fan band (CC'd ones do not count —
    // a Cleave that only frees the sheep is not a pack).
    let multi = false;
    if (hasMultiArm) {
      if (ctx.unitPositionsMutable) {
        let near = 0;
        for (const e of livingEnemies()) {
          if (dead(e) || ccProtected(e)) continue;
          const d = distanceBetween(f, e);
          if (d != null && d <= 8) near++;
        }
        multi = near >= 2;
      } else {
        multi = blastEnemyCount() >= 2;
      }
    }
    let reserve = 0;
    for (const s of spenders) {
      if (isTriggeredCompanion(f, s)) continue;
      if (!canCastIgnoringCost(f, foe, s)) continue;
      const c = s.cost ?? 0;
      if (c > reserve) reserve = c;
    }
    let best: SpellDef | null = null;
    let bestKey = -1;
    for (const s of arms) {
      if (isTriggeredCompanion(f, s)) continue;
      const n = (s.name ?? '').toLowerCase();
      if (multi) {
        if (hasMultiArm ? !SWING_ARM_MULTI.has(n) : !SWING_ARM_SINGLE.has(n)) continue;
      } else if (!SWING_ARM_SINGLE.has(n)) {
        continue;
      }
      // Pool via reserve (signatures), not flat powerPct — provider still has powerPct>=40.
      const armCost = s.cost ?? 0;
      if (f.power < armCost + reserve) continue;
      if (!canCastSpell(f, foe, s)) continue;
      const key = (s.rank ?? 0) * 1000 + (s.reqLevel ?? 0);
      if (key > bestKey) {
        best = s;
        bestKey = key;
      }
    }
    return best;
  };

  ctx.onCooldown = onCooldown;
  ctx.canCastSpell = canCastSpell;
  ctx.allySnapshot = allySnapshot;
  ctx.pickAction = pickAction;
  ctx.pickCcTarget = pickCcTarget;
  ctx.pickNextSwingArm = pickNextSwingArm;
  ctx.schoolLocked = schoolLocked;
  ctx.stealthPosError = stealthPosError;
  ctx.chargeCastOk = chargeCastOk;
  ctx.isInMeleeOf = isInMeleeOf;
  ctx.isEngagedMelee = isEngagedMelee;
  ctx.isChargeRole = isChargeRole;
  ctx.requiresLivingPetTarget = requiresLivingPetTarget;
  ctx.isTriggeredCompanion = isTriggeredCompanion;
  ctx.find = find;
  ctx.livingPetOf = livingPetOf;
  ctx.conditionSnapshotFor = conditionSnapshotFor;
  ctx.canAfford = canAfford;
  ctx.getGcdMs = getGcdMs;
  ctx.spellIncursGcd = spellIncursGcd;
}
