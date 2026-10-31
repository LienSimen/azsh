import { SPIRIT_OF_REDEMPTION_AURA_SPELL_ID } from '../spells/cmangos-special-cases.ts';
// Peeled from createSession (Wave 4 hub: applySpell). Pattern (D). Extracted modules must not import
// combat.ts. NOTE: imports may need expanding when first run against seam tests.

import type { CombatContext } from './context.ts';
import { applySpellEffectLate } from './applySpellLate.ts';
import { bindLateEffectBag } from './applySpellLateBag.ts';
import { applySchoolAbsorbEffect, applyInstakillEffect } from './applySchoolAbsorb.ts';
import { runCastSummons } from './summonCast.ts';
import { upgradeBreakOnDamageMirror } from './ccMirrorUpgrade.ts';
import {
  beginChannel,
  channelInterruptCtx,
  interruptChannel,
  isChannelSpell,
} from './channel.ts';
import {
  wantsRaidAndClass, filterSameClass, filterPartyFanByRadius, isPartyFanBody, sameSubgroup,
  auraHolderIsCastTarget, auraHolderExcludesCaster, auraRadiatesToParty, selectedOrSelfFriendly,
} from './healTargets.ts';
import { spellBuffApplyToFromRaw } from '../spells/interpreter/targeting.ts';
import type { Fighter, ActiveEffect } from './types.ts';
import type { SpellDef, SpellEffect, School, BuffMod, ControlKind, Mechanic } from '../../data/schema.ts';
import type { Side, HitResult } from '../core/events.ts';
import { isEnemySide, isAllySide, isTotemSide, isPlayerCharacterSide } from '../core/events.ts';
import {
  TUNING, rollBetween, meleeBaseDamage, spellCritChance, critMultiplierWithVersus,
} from './formulas.ts';
import { schoolMaskFromSchool } from '../spells/procs.ts';
import { resolveCombatSpell } from '../spells/interpreter/index.ts';
import { applyConsumeAuraEffect, targetAurasFromLive } from './applyConsumeAura.ts';
import { AURA_INTERRUPT } from '../../domain/spells/stealth.ts';
import { BASE_RUN_SPEED, effectiveSpeeds } from '../../domain/nav/speed.ts';
import { pickBattleRezTarget, battleRezPayload, reviveInCombat } from './battleRez.ts';
import { durMs } from '../spells/interpreter/duration.ts';
import { flametongueSwingDamage } from '../spells/interpreter/weapon-imbue-kit.ts';
import {
  FLAMETONGUE_TOTEM_PROC_RANKS,
  FLAMETONGUE_WEAPON_PROC_RANKS,
} from '../spells/interpreter/registry/packs/shaman.ts';
import { DIRE_BEAR_FORM_SPELL_ID } from '../spells/interpreter/registry/packs/class-abilities.ts';
import { isAttackSpeedOverriddenShapeShift } from '../../domain/character/forms.ts';
import { JUDGEMENT_OF_COMMAND_DAMAGE_IDS } from '../spells/interpreter/paladin-seals.ts';
import { fighterSpellCrit, applyBuffMod, reverseBuffMod, signedAtLeastOne } from './fighterFactory.ts';
import {
  applyOwnedSpellMod,
  SPELLMOD_CRITICAL_CHANCE, SPELLMOD_DAMAGE, SPELLMOD_DOT,
  SPELLMOD_DURATION, SPELLMOD_ALL_EFFECTS,
} from '../spells/spellModIntents.ts';
import { improvedSprintShouldProc } from '../spells/cmangos-special-cases-s21.ts';
import {
  SPELL_NEGATIVE_CHARGE,
  SPELL_NEGATIVE_CHARGE_BUFF,
  SPELL_POSITIVE_CHARGE,
  SPELL_POSITIVE_CHARGE_BUFF,
  countSameChargeNear,
  isPolarityShift,
  pickPolarityCharge,
  polarityBuffForCharge,
  polarityDamageSkipped,
  polarityStackDue,
  polarityStackSpell,
} from './thaddiusPolarity.ts';

/** Aura::isAffectedOnSpell for aura 109. Cite: SpellAuras.cpp:696–713; SpellMgr.h:1950–1958. */
function addTargetTriggerAffects(
  row: { familyName: number; familyFlags: number; triggerSpellId: number },
  spell: SpellDef,
): boolean {
  if ((spell.id | 0) === (row.triggerSpellId | 0)) return false;
  if (((spell.spellFamilyName ?? 0) | 0) !== (row.familyName | 0)) return false;
  const mask = row.familyFlags >>> 0;
  if (!mask) return false;
  return ((Number(spell.spellFamilyFlags ?? 0) >>> 0) & mask) !== 0;
}
import { roleOf } from './roles.ts';
import {
  isHostileSpellDef,
  isDrainSoulSpell,
  spellTargetTypeAllowed,
  normalizeDivineIntervention,
  normalizeIceBlock,
  isIceBlockSpell,
  isDivineInterventionSpell,
  isDivineInterventionCast,
  isHostileBuffEffect,
  isSelfTargetedDot,
  isSelfTargetedSpell,
  isFoeLandingLateEffect,
  spellWantsFriendlyTarget,
} from './predicates.ts';
import { isHostileSpeedEffect } from './speedAura.ts';
import { applySpellDamageBonusIfPresent } from '../spells/spellBonus.ts';
import { sumVersusForCreatureType } from '../../domain/character/characterStats.ts';
import {
  selectMagnetTarget,
  isMagnetRedirectableSpell,
  magnetCandidatesOnVictim,
} from '../spells/absorbs.ts';
import {
  isImmuneToMechanic,
  isImmuneToMechanicId,
  isImmuneToHarmfulAura,
  isTotemCreatureType,
  totemRefusesNegativeAuraApply,
  isEveryEffectSlotImmune,
  isImmuneToSpellEffectSlot,
  AURA_TYPE,
  MECHANIC,
  SPELL_SCHOOL_MASK_ALL,
  schoolMaskFromSchoolName,
  ccImmunityRiderMaskForSpell,
  mechanicIdFromName,
  makeCcImmunityAura,
  immunityBoostAurasForSpell,
} from '../spells/immunity.ts';
import {
  SPELL_ATTR, SPELL_ATTR_EX, SPELL_ATTR_EX3, SPELL_ATTR_EX4,
  hasAttr, hasAttrEx, hasAttrEx3, hasAttrEx4, spellCanCrit, spellPiercesSchoolImmunity,
} from '../spells/spellAttributes.ts';
import { armHeartbeatResist } from './heartbeatResist.ts';
import { laySpellTrapSites } from './useObjectTrap.ts';
import { drStepOf } from './crowdControl.ts';
import {
  isResistableDmgClass,
  resolveSpellBinary,
  spellDamageLandChance,
  SPELL_DAMAGE_CLASS,
} from './mitigation.ts';
import {
  resolveHealMaxHealth,
  resolvePowerDrain,
  resolvePowerBurn,
  resolveHealthLeech,
  resolveEnergize,
  resolveAddExtraAttacks,
  resolveWeaponPercentDamage,
  POWER_MANA,
} from '../spells/effects.ts';
import {
  planAuraApply, auraHolderCharges, resolveChainPair,
  auraStackIdentity, existingStackIsStronger, stackIdentitiesExclude,
} from '../spells/auraStacking.ts';
import {
  BROOD_AFFLICTION_BRONZE_SPELL_ID,
  captureSpiritAllowsEntry,
  HOURGLASS_SAND_SPELL_ID,
  ONYXIA_SCALE_CLOAK_SPELL_ID,
  SHADOW_FLAME_SPELL_ID,
  shadowFlameAppliesDot,
} from '../spells/cmangos-special-cases.ts';
import {
  BRITTLE_ARMOR_PEEL_SPELL_ID,
  BRITTLE_ARMOR_STACK_SPELL_ID,
  expandHakkarBloodSiphonFunnel,
  HAKKAR_BLOOD_SIPHON_FUNNEL_SPELL_ID,
  HAKKAR_BLOOD_SIPHON_POISON_SPELL_ID,
  HAKKAR_BLOOD_SIPHON_SPELL_ID,
  POISONOUS_BLOOD_CLOUD_SPELL_ID,
} from '../spells/cmangos-special-cases-s18.ts';
import {
  MERCURIAL_SHIELD_PEEL_SPELL_ID,
  MERCURIAL_SHIELD_STACK_SPELL_ID,
} from '../spells/cmangos-special-cases-s19.ts';
import {
  MAGIC_ABSORPTION_TRIGGER_SPELL_ID,
  magicAbsorptionManaAmount,
} from '../spells/cmangos-special-cases-s20.ts';
import {
  FAERLINA_ENRAGE_SPELL_ID,
  WIDOWS_EMBRACE_CD_SPELL_ID,
  WIDOWS_EMBRACE_INSTAKILL_SPELL_ID,
  WIDOWS_EMBRACE_SPELL_ID,
  widowsEmbraceLockoutMs,
} from '../spells/cmangos-special-cases-s22.ts';
import {
  CHROMAGGUS_BREATH_SELECTION_SPELL_ID,
  ELEMENTAL_SHIELD_DUMMY_SPELL_ID,
  pickChromaggusBreathPair,
  TYPE_CHROMA_LBREATH,
  TYPE_CHROMA_RBREATH,
} from '../spells/cmangos-special-cases-s23.ts';
import { buffProcChargesForSpell, refuseCmangosCheckCast, RECENTLY_BANDAGED_SPELL_ID } from './cmangosCastGates.ts';
import { isPlayerCharacterTarget } from './castTargetGates.ts';
import {
  CORRUPTED_MIND_PRIMER_SPELL_ID,
  corruptedMindLockoutSpellId,
  overrideScriptAuraTargetIsCaster,
  overrideScriptsOnSpell,
  refuseOverrideClassScriptCheckCast,
  unitHasOverrideScript,
} from '../spells/overrideClassScripts.ts';
import { refuseForMissingCorpse } from '../spells/scriptTargets.ts';
import { isReflectableSpell, rollSpellReflect } from '../../domain/spells/spellReflect.ts';
import {
  SAP_SPELL_IDS,
  IMPROVED_SAP_TRIGGER_SPELL_ID,
  improvedSapHolderFromKnown,
  procChanceUnitFromRow,
  SWIFTMEND_SPELL_ID,
  hasSwiftmendHot,
  shatterFrozenCritBonus,
  targetIsFrozenForShatter,
  effectsWithScriptRiders,
} from '../spells/interpreter/class-scripts-kit.ts';
import {
  areaAuraCarrierSides, hasAreaAuraRow, stripAreaAuraRowsFrom, stripHolderRowsInGroup,
} from './areaAura.ts';
import { isPartyAreaAura } from '../../domain/spells/areaAuraMembership.ts';
import {
  createGroundPool, hasLaterPersistentAreaOrFarsight, isPersistentAreaEffect, upsertGroundPool,
} from '../game/dynamicObject.ts';
import { spellAoeFromCaster } from './combatGeometry.ts';
import { isCastInterruptible, applySchoolLockout, interruptEffectMechanicId } from '../spells/interrupt.ts';
import { isWarriorExecuteSpell } from '../spells/interpreter/warrior-druid-kit.ts';
import { mechanicResistBonus } from '../../domain/creature/creatureAiConstants.ts';
import { clearCombatFlag } from './combatFlag.ts';
import { isHunterTrapTriggerSpellId } from '../spells/interpreter/hunter-kit.ts';
import { trapObjectPoolFor } from '../spells/trapObjects.ts';
import { emitSimEffect } from './simEffects.ts';

/** One clock per SpellAuraHolder. CC owns it when present so Blind's snare does not. Cite: Spell.cpp:1483-1489. */
function heartbeatSlotOf(spell: SpellDef): 'cc' | 'root' | 'speed' | null {
  if (!hasAttr(spell, SPELL_ATTR.HEARTBEAT_RESIST)) return null;
  let cc = false;
  let root = false;
  let speed = false;
  for (const e of spell.effects) {
    if (e.kind === 'cc') cc = true;
    else if (e.kind === 'root') root = true;
    else if (e.kind === 'speed') speed = true;
  }
  if (cc) return 'cc';
  if (root) return 'root';
  if (speed) return 'speed';
  return null;
}

export type installApplySpellDeps = {
  dead: (...args: any[]) => any;
  sanitizeHp: (...args: any[]) => any;
  spend: (...args: any[]) => any;
  gainRage: (...args: any[]) => any;
  addComboPoints: (...args: any[]) => any;
  clearComboPoints: (...args: any[]) => any;
  comboOn: (...args: any[]) => any;
  scaleDurationByCp: (...args: any[]) => any;
  spellCost: (...args: any[]) => any;
  canAffordSpell: (...args: any[]) => any;
  leaveForm: (...args: any[]) => any;
  enterForm: (...args: any[]) => any;
  applyStealth: (...args: any[]) => any;
  breakStealth: (...args: any[]) => any;
  maybeBreakStealthOn: (...args: any[]) => any;
  behindOk: (...args: any[]) => any;
  foeOf: (...args: any[]) => any;
  ensurePlayerFocus: (...args: any[]) => any;
  lowestHpFriendly: (...args: any[]) => any;
  isControlled: (...args: any[]) => any;
  isControlledHard: (...args: any[]) => any;
  isWeaponAction: (...args: any[]) => any;
  isBreaker: (...args: any[]) => any;
  spellTemplateImmune: (...args: any[]) => any;
  ccImmune: (...args: any[]) => any;
  applyDr: (...args: any[]) => any;
  applyControl: (...args: any[]) => any;
  breakControl: (...args: any[]) => any;
  onDamaged: (...args: any[]) => any;
  rollHeal: (...args: any[]) => any;
  unsummonTotem: (...args: any[]) => any;
  checkDeaths: (...args: any[]) => any;
  finalize: (...args: any[]) => any;
  seedDamageShields: (...args: any[]) => any;
  seedProcTriggers: (...args: any[]) => any;
  seedSchoolAbsorbs: (...args: any[]) => any;
  seedManaShields: (...args: any[]) => any;
  seedRestoreHealth: (...args: any[]) => any;
  seedDisplayAuras: (...args: any[]) => any;
  sealRighteousnessSwing: (...args: any[]) => any;
  materializeSpecForCombat: (...args: any[]) => any;
};

export function installApplySpell(ctx: CombatContext, deps: installApplySpellDeps): void {
  const push = (e: any) => ctx.push(e);
  const player = ctx.player;
  const pet = ctx.pet;
  const effects = ctx.effects;
  const groundPools = ctx.groundPools;
  const touchEffect = (e: ActiveEffect): void => { ctx.touchEffect(e); };
  const rng = ctx.rng;
  const tickMs = ctx.tickMs;
  const cfg = ctx.cfg;
  const threatOf = ctx.threatOf;
  const livingEnemies = ctx.livingEnemies;
  const livingFriendlies = ctx.livingFriendlies;
  const friendlyPoolOf = ctx.friendlyPoolOf;
  const lowestHpFriendlyOf = ctx.lowestHpFriendlyOf;
  const livingHostilesFor = ctx.livingHostilesFor;
  const distanceBetween = ctx.distanceBetween;
  const fightersOrder = ctx.fightersOrder;
  const isCharmed = ctx.isCharmed;
  const bySide = ctx.bySide;
  const registerAreaAuraSource = (...args: any[]) => (ctx.registerAreaAuraSource as Function)(...args);
  /** Same-tick bounce guard for Gothik 29317 scriptValue=1. Cite: boss_gothik.cpp:520. */
  const gothikShadowboltBounceAt = new WeakMap<Fighter, number>();
  /** Initial-cast fan for Renataki 24649. Cite: boss_renataki.cpp:98 m_IsTriggeredSpell. */
  const renatakiBladesFanAt = new WeakMap<Fighter, number>();
  /** First mana player hit by this 29107 tick. Cite: boss_razuvious.cpp:90 m_oneHit. */
  const razuviousShoutAt = new WeakMap<Fighter, number>();
  /** 28673 picks 3 skip-tank players once per cast. Cite: boss_maexxna.cpp:211-223. */
  const maexxnaWrapAt = new WeakMap<Fighter, number>();
  /** One chow per 28236 tick. Cite: boss_gluth.cpp:92-99 m_zombieChow. */
  const gluthChowAt = new WeakMap<Fighter, number>();
  /** Per-player stacks of 28832-35. Cite: boss_four_horsemen.cpp:388-411 GetStackAmount. */
  const horsemenMarkStacks = new WeakMap<Fighter, Map<number, number>>();
  const reverseActiveEffect = (unit: Fighter, e: ActiveEffect) => (ctx.reverseActiveEffect as Function)(unit, e);
  const applyFlatThreat = (...args: any[]) => (ctx.applyFlatThreat as Function)(...args);
  const applySpellThreatBonus = (...args: any[]) => (ctx.applySpellThreatBonus as Function)(...args);
  const engageOnHostileSpell = (...args: any[]) => (ctx.engageOnHostileSpell as Function)(...args);
  const applyHealThreat = (...args: any[]) => (ctx.applyHealThreat as Function)(...args);
  const grantImmunityAura = (...args: any[]) => (ctx.grantImmunityAura as Function)(...args);
  const dispelTypeOfSpell = (...args: any[]) => (ctx.dispelTypeOfSpell as Function)(...args);
  const dispellableAurasOn = (...args: any[]) => (ctx.dispellableAurasOn as Function)(...args);
  const reflectChanceFor = (...args: any[]) => (ctx.reflectChanceFor as Function)(...args);
  const stripAuraOnDispel = (...args: any[]) => (ctx.stripAuraOnDispel as Function)(...args);
  const resolveDispelTarget = (...args: any[]) => (ctx.resolveDispelTarget as Function)(...args);
  const dealDamage = (...args: any[]) => (ctx.dealDamage as Function)(...args);
  const startOrCast = (...args: any[]) => (ctx.startOrCast as Function)(...args);
  const step = (...args: any[]) => (ctx.step as Function)(...args);
  const triggerProcs = (...args: any[]) => (ctx.triggerProcs as Function)(...args);
  const applyProc = (...args: any[]) => (ctx.applyProc as Function)(...args);
  const rollGearProcs = (...args: any[]) => (ctx.rollGearProcs as Function)(...args);
  const fireDamageShields = (...args: any[]) => (ctx.fireDamageShields as Function)(...args);
  const fireDealMeleeAura42 = (...args: any[]) => (ctx.fireDealMeleeAura42 as Function)(...args);
  const powerOfType = (...args: any[]) => (ctx.powerOfType as Function)(...args);
  const maxPowerOfType = (...args: any[]) => (ctx.maxPowerOfType as Function)(...args);
  const setPowerOfType = (...args: any[]) => (ctx.setPowerOfType as Function)(...args);
  const casterPowerTypeId = (...args: any[]) => (ctx.casterPowerTypeId as Function)(...args);
  const powerTypeName = (...args: any[]) => (ctx.powerTypeName as Function)(...args);
  // Ground-pool id counter lives in createSession (ctx.nextGroundPoolId bumps it).
  const nextGroundPoolId = () => (ctx.nextGroundPoolId as () => number)();
  const dead = deps.dead;
  const sanitizeHp = deps.sanitizeHp;
  const spend = deps.spend;
  const gainRage = deps.gainRage;
  const addComboPoints = deps.addComboPoints;
  const clearComboPoints = deps.clearComboPoints;
  const comboOn = deps.comboOn;
  const scaleDurationByCp = deps.scaleDurationByCp;
  const spellCost = deps.spellCost;
  const canAffordSpell = deps.canAffordSpell;
  const leaveForm = deps.leaveForm;
  const enterForm = deps.enterForm;
  const applyStealth = deps.applyStealth;
  const breakStealth = deps.breakStealth;
  const maybeBreakStealthOn = deps.maybeBreakStealthOn;
  const behindOk = deps.behindOk;
  const foeOf = deps.foeOf;
  const ensurePlayerFocus = deps.ensurePlayerFocus;
  const lowestHpFriendly = deps.lowestHpFriendly;
  const isControlled = deps.isControlled;
  const isControlledHard = deps.isControlledHard;
  const isWeaponAction = deps.isWeaponAction;
  const isBreaker = deps.isBreaker;
  const spellTemplateImmune = deps.spellTemplateImmune;
  const ccImmune = deps.ccImmune;
  const applyDr = deps.applyDr;
  const applyControl = deps.applyControl;
  const breakControl = deps.breakControl;
  const onDamaged = deps.onDamaged;
  const rollHeal = deps.rollHeal;
  const unsummonTotem = deps.unsummonTotem;
  const checkDeaths = deps.checkDeaths;
  const finalize = deps.finalize;
  const seedDamageShields = deps.seedDamageShields;
  const seedProcTriggers = deps.seedProcTriggers;
  const seedSchoolAbsorbs = deps.seedSchoolAbsorbs;
  const seedManaShields = deps.seedManaShields;
  const seedRestoreHealth = deps.seedRestoreHealth;
  const seedDisplayAuras = deps.seedDisplayAuras;
  const sealRighteousnessSwing = deps.sealRighteousnessSwing;
  const materializeSpecForCombat = deps.materializeSpecForCombat;

  const L: Record<string, any> = {};
  const applySpell = (src: Fighter, tgtIn: Fighter, spellIn: SpellDef, reflected = false, hitCount = 1): void => {
    const t = ctx.t;
    // SPELLFAMILY_GENERIC: else if (Mechanic == MECHANIC_INVULNERABILITY) AddPrecastSpell(25771);
    // SPELLFAMILY_PALADIN: if (Mechanic == MECHANIC_INVULNERABILITY && Id != 25771) AddPrecastSpell(25771);
    // Cite: Spell.cpp:3116-3117, 3144-3145 at de8f72993b9e1faa1bf92dd5505f3daec5cea3ce.
    if (spellIn.mechanic === 'invulnerability' && (spellIn.id | 0) !== 25771) {
      let forbearance: SpellDef | undefined = src.spec.spells.find((s) => (s.id | 0) === 25771);
      if (!forbearance) {
        for (const f of ctx.fightersOrder()) {
          forbearance = f.spec.spells.find((s) => (s.id | 0) === 25771);
          if (forbearance) break;
        }
      }
      forbearance = forbearance ?? ctx.spellOf?.(25771);
      if (forbearance) applySpell(src, tgtIn, forbearance);
    }
    // DO_NOT_DISPLAY: no aura icon. The session view folds in the roster's kits, but a triggered
    // payload sits in no kit, so stamp it here where the SpellDef is in hand.
    if (spellIn.hiddenClientside) ctx.hiddenAuraSpellIds.add(spellIn.id);
    // Capture Spirit 7914 CheckCast entry allowlist. Cite: Spell.cpp:7914–7920.
    if ((spellIn.id | 0) === 7914 && !captureSpiritAllowsEntry((tgtIn.spec.creatureEntry ?? 0) | 0)) return;
    if ((spellIn.id | 0) === SPIRIT_OF_REDEMPTION_AURA_SPELL_ID) {
      tgtIn.castingSpell = null;
      tgtIn.castFinishAt = 0;
      tgtIn.castStartedAt = 0;
      // SpellDefines.h:367, MiscHandler.cpp:413
      ctx.removeAurasWithInterruptFlags?.(tgtIn, AURA_INTERRUPT.ANIM_CANCELS, 'anim cancels');
      ctx.push({ t, kind: 'stand_state', actor: tgtIn.side, standState: 0 });
      if (tgtIn.channeling) {
        interruptChannel(tgtIn, channelInterruptCtx(ctx), { quiet: true });
      }
      if (tgtIn.spec.powerType === 'mana') {
        tgtIn.power = tgtIn.spec.maxPower;
      }
      tgtIn.hp = tgtIn.spec.maxHealth;
    }

    // Cite: boss_thaddius.cpp:410-418 ThaddiusChargeDamage OnCheckTarget.
    if (polarityDamageSkipped(spellIn.id | 0, tgtIn)) return;
    // PI and DI CheckCast the friendly recipient. Hostile focus remaps to self.
    // Cite: Priest.cpp:36-40 GetAuraCount(12042); Paladin.cpp:144-151 HasAura(23333/23335).
    const ccSid = spellIn.id | 0;
    const ccOnRecipient = ccSid === 10060 || ccSid === 19752 || ccSid === 19754;
    // Bandage CheckCast / 11196 land on the heal recipient, not the hostile focus.
    // Cite: Spell.cpp:3114 AddPrecastSpell(11196); Spell.cpp:2298-2306 TARGET_UNIT_FRIEND.
    const bandageLockTgt = spellIn.mechanic === 'bandage' && ccSid !== RECENTLY_BANDAGED_SPELL_ID
      ? selectedOrSelfFriendly(
        src, tgtIn, src.friendlyPin ? bySide(src.friendlyPin) : null, dead, isEnemySide,
      )
      : null;
    const checkTgt = bandageLockTgt ?? ((ccOnRecipient && isEnemySide(tgtIn.side)) ? src : tgtIn);
    if (refuseCmangosCheckCast(spellIn, {
      flags: checkTgt.spec.flags,
      creatureEntry: checkTgt.spec.creatureEntry,
      powerType: checkTgt.spec.powerType,
      classId: checkTgt.spec.classId,
      auraSpellIds: checkTgt.buffActive,
      isPlayer: isPlayerCharacterTarget(checkTgt),
    }, {
      // AQ40 mounts: caster map. Cite: Spell.cpp:5762 GetMapId().
      mapId: src.spec.mapId,
      hasActivePet: !!ctx.livingPetOf?.(src) || ctx.isCharmed(src),
    })) return;
    // Precast after CheckCast so this bandage is not refused by the aura it just applied.
    if (bandageLockTgt) {
      const recently = ctx.spellOf?.(RECENTLY_BANDAGED_SPELL_ID)
        ?? src.spec.spells.find((s) => (s.id | 0) === RECENTLY_BANDAGED_SPELL_ID);
      if (recently) applySpell(bandageLockTgt, bandageLockTgt, recently);
    }
    // Loatheb Corrupted Mind / Nefarian class-call scripts. Cite: Spell.cpp:4655–4686.
    if (refuseOverrideClassScriptCheckCast(spellIn, src.buffActive)) return;
    // spell_script_target type 2 (DEAD): the spell explodes/eats a CORPSE, so with none in the
    // fight CheckScriptTargeting returns SPELL_FAILED_BAD_TARGETS. Cite: Spell.cpp:2599-2615.
    if (refuseForMissingCorpse(spellIn.id | 0, spellIn.rawEffects, (entry) =>
      ctx.fightersOrder().some((f) => (f.spec.creatureEntry ?? 0) === entry && f.hp <= 0),
    )) return;
    // Swiftmend CheckCast + HoT snapshot read the heal recipient, not the hostile focus.
    // Cite: Druid.cpp:26-30; applyHealEffect triage; PI remap 7b26759d5.
    let auraTgt = tgtIn;
    // A friendly-only spell that resolved onto a body HOSTILE TO ITS CASTER lands on the caster's
    // own side. In 1.12 that cast does not land at all, so landing it for 0 is the bug: side B's
    // priest cast Power Word: Fortitude onto `player` at 0.0/1.5/3.0/4.5 s in a bracket-2 mirror,
    // it was never HELD by any friendly, and the keep-up row re-fired all fight. Faction-relative
    // on purpose — the Swiftmend clause below reads `isEnemySide`, so it only ever fired for a
    // player-side caster. AFTER the row's own target resolution, so a self keep-up is untouched.
    // Cite: Spell.cpp:5947-5951 IsPositiveSpell -> CanAssistSpell -> SPELL_FAILED_BAD_TARGETS.
    if (
      // PLAYER-SHAPED casters only. `isHostileSpellDef` does not catch every harmful creature
      // spell, so judging a boss's kit by this predicate redirected real casts back at the boss:
      // Jin'do's wards stopped standing, Thaddius's adds stopped reviving, Tharil'zun's payload
      // never fired and the drakonid constructs found no corpses (smoke:slow, measured).
      // The defect this fixes is a player-shaped SEAT's keep-up buff, which is what it now covers.
      src.spec.classId != null
      && spellWantsFriendlyTarget(spellIn)
      && ctx.factionOfFighter(src) !== ctx.factionOfFighter(tgtIn)
    ) {
      // The CASTER, not the lowest-HP mate: a triage row already carries `{lowestHp:true}` from
      // `spellActionWithTriageAim` and arrives with a friendly target, so this clause only ever
      // sees a row that named nobody — and TARGET_UNIT_FRIEND with no selection is self.
      // Cite: Spell.cpp:2298-2306; src/dev/smoke/hotKeepUpCloses.mjs is the closure gate.
      auraTgt = src;
    }
    if ((spellIn.id | 0) === SWIFTMEND_SPELL_ID) {
      if (isEnemySide(tgtIn.side)) auraTgt = lowestHpFriendlyOf(src) ?? src;
      const hots = targetAurasFromLive(src, auraTgt, ctx.effectsOn(auraTgt.side));
      if (!hasSwiftmendHot(hots)) return;
    }
    // Divine Intervention and Ice Block are self school-immunity plus a self lock, never a hostile
    // stun. Resolve rebuilds effects from raw, so the role stamps are re-normalized after.
    let spell = expandHakkarBloodSiphonFunnel(normalizeIceBlock(normalizeDivineIntervention(resolveCombatSpell(spellIn, {
      attackPower: src.attackPower,
      energy: src.spec.powerType === 'energy' ? src.power : undefined,
      // The target's own bucket, not the whole session array: this scanned every live effect in the
      // fight per application. It is version-exact and keeps array order, so the summary is identical.
      targetAuras: targetAurasFromLive(src, auraTgt, ctx.effectsOn(auraTgt.side)),
      casterAuras: targetAurasFromLive(src, src, ctx.effectsOn(src.side)),
      // Display rage 0–100 for Execute (Warrior.cpp stored*10 * DmgMultiplier).
      rage: src.spec.powerType === 'rage' ? src.power : undefined,
      comboPoints: src.comboPoints,
      casterLevel: src.spec.level,
      casterRunSpeedRate: (() => {
        let speedEffects = [];
        for (const p of src.spec.permanentSpeedAuras ?? []) speedEffects.push({ aura: p.aura, pct: p.pct });
        for (const e of ctx.effectsOn(src.side)) {
          if (e.kind === 'speed' && e.aura != null) speedEffects.push({ aura: e.aura, pct: e.pct ?? 0 });
        }

        const speed = speedEffects.length === 0 ? BASE_RUN_SPEED : effectiveSpeeds({ effects: speedEffects, mounted: false }).run;
        return speed / BASE_RUN_SPEED;
      })(),
      casterGender: src.spec.gender,
      // Player GetSpellRank is skill (level x 5); creature GetSpellRank is GetLevel, then /5.
      // Cite: Unit.cpp:11855; Player.cpp:5874; Object.cpp:2928.
      casterIsPlayer: isPlayerCharacterSide(src.side),
      // The per-level term is clamped into the spell's own [baseLevel, maxLevel] band before spellLevel is
      // subtracted; without these two a rank-1 nuke kept scaling to 60. Cite: Object.cpp:2926-2934.
      ...(spellIn.baseLevel != null ? { spellBaseLevel: spellIn.baseLevel } : {}),
      ...(spellIn.maxLevel != null ? { spellMaxLevel: spellIn.maxLevel } : {}),
      // SPELL_ATTR_SCALES_WITH_CREATURE_LEVEL. C++ also requires a real spellLevel
      // (the CLS ratio denominator). Cite: Object.cpp:2969-2971.
      ...(!isPlayerCharacterSide(src.side)
        && hasAttr(spellIn, SPELL_ATTR.SCALES_WITH_CREATURE_LEVEL)
        && (spellIn.spellLevel ?? 0) > 0
        && ctx.creatureBaseDamageAt
        ? {
          creatureLevelScaling: {
            unitClass: src.spec.unitClass ?? 1,
            baseDamageAt: ctx.creatureBaseDamageAt,
          },
        }
        : {}),
      shieldBlock: src.spec.blockValue,
      // Berserking (icon 1661) haste_mod from health %. Cite: SpellEffects.cpp:1270–1275; KI-125.
      casterHealthPercent: (src.hp / Math.max(1, src.spec.maxHealth)) * 100,
      casterMaxHealth: src.spec.maxHealth,
      // % of target max health (Frost Blast 26%, PERIODIC_DAMAGE_PERCENT). Cite: boss_kelthuzad.cpp:604.
      targetMaxHealth: auraTgt.spec.maxHealth,
      targetMaxMana: auraTgt.spec.powerType === 'mana' ? auraTgt.spec.maxPower : undefined,
      // Flametongue dummy needs weapon delay. Cite: SpellEffects.cpp:1472–1504.
      weaponSpeedMs: src.spec.weapon.speedMs,
      castItemPresent: true,
      // Enrage 5229: −16% armor in Dire Bear vs −27% Bear. Cite: SpellEffects.cpp:1373 HasAura(9634).
      hasDireBearForm:
        src.formSpellId === DIRE_BEAR_FORM_SPELL_ID || src.buffActive.has(DIRE_BEAR_FORM_SPELL_ID),
      // Only 22276 draws; passing rng on every resolve would roll chance specials that
      // currently always-fire when rng is omitted. Cite: SpellEffects.cpp:827 urand(0,4).
      ...((spellIn.id | 0) === ELEMENTAL_SHIELD_DUMMY_SPELL_ID
        ? { rng: () => rng.next() }
        : {}),
    }))));
    // Flametongue proc: the bake ships flat direct damage with no rawEffects dummy, so scale it here
    // as trunc(damage * 0.01 * weaponSpeed). A flat 489 a swing was the bug.
    {
      const sid = spell.id | 0;
      const isFtProc =
        (FLAMETONGUE_TOTEM_PROC_RANKS as readonly number[]).includes(sid)
        || (FLAMETONGUE_WEAPON_PROC_RANKS as readonly number[]).includes(sid);
      if (isFtProc) {
        const speedSec = src.spec.weapon.speedMs / 1000;
        spell = {
          ...spell,
          effects: spell.effects.map((e) => {
            if (e.kind !== 'direct_damage' || !(e.min > 0)) return e;
            const scaled = flametongueSwingDamage(e.min, speedSec);
            return { ...e, min: scaled, max: scaled };
          }),
        };
      }
    }
    // spell_threat flat and AP bonus, once per successful hostile hit and independent of damage. The
    // damage branch owned the only call, so Sunder Armor and Demoralizing Shout made ZERO threat.
    let hostileResistHitDone = false;
    // SPELL_AURA_SPELL_MAGNET (96) — victim auras only, magic or none, and the caster must be able to
    // attack the magnet. Cite: Unit.cpp SelectMagnetTarget :6896–6922.
    let tgt = auraTgt;
    if (isMagnetRedirectableSpell(spell) && tgt.side !== src.side) {
      const magnetCandidates = magnetCandidatesOnVictim(
        effects, tgt.side, t,
        (side) => bySide(side),
        (magnetSide) => ctx.factionOf(src.side) !== ctx.factionOf(magnetSide),
      );
      if (magnetCandidates.length > 0) {
        const mag = selectMagnetTarget(magnetCandidates, true);
        if (mag.redirected && mag.magnetUnitId) {
          const magnetF = bySide(mag.magnetUnitId);
          if (magnetF) {
            tgt = magnetF;
            if (isTotemSide(magnetF.side)) unsummonTotem(magnetF.side, 'expire');
            push({
              t, kind: 'flavor',
              text: `${spell.name} is redirected to ${magnetF.spec.name}.`,
            });
          }
        }
      }
    }

    // The friendly this cast is AIMED at, or null. Two records, only one ever set: the PIN a macro or
    // Pre-buff order leaves, and `tgt` itself for the ally queue. Same-faction only.
    const aimedFriendlyOf = (caster: Fighter): Fighter | null => {
      const sameSide = (u: Fighter): boolean =>
        isEnemySide(u.side) === isEnemySide(caster.side) && !dead(u);
      const pinned = caster.friendlyPin ? bySide(caster.friendlyPin) : null;
      if (pinned && sameSide(pinned)) return pinned;
      return sameSide(tgt) ? tgt : null;
    };

    // EVENT_T_SPELLHIT pulse — fires for whichever unit the spell was delivered to, hit or miss, so it
    // is stamped before the immunity gates. Cite: Spell.cpp:1345 unit->AI()->SpellHit.
    tgt.spellHitId = spell.id;
    tgt.spellHitSchoolMask = schoolMaskFromSchoolName(spell.school) || schoolMaskFromSchool(spell.school);
    tgt.spellHitAt = t;
    // The same hook on the scripted side, running on the delivered unit before the immunity gates,
    // exactly where the EVENT_T stamp above sits.
    ctx.runScriptDevSpellHit?.(tgt, src, spell.id);

    // Cite: boss_thaddius.cpp:363-400 PolarityShift OnEffectExecute.
    if (isPolarityShift(spell.id) && !isEnemySide(tgt.side) && tgt.hp > 0) {
      const coin = (rng.int(0, 1) === 0 ? 0 : 1) as 0 | 1;
      const chargeId = pickPolarityCharge(t, coin);
      (ctx.removeAurasDueToSpell as ((u: Fighter, id: number) => number) | undefined)?.(tgt, SPELL_POSITIVE_CHARGE);
      (ctx.removeAurasDueToSpell as ((u: Fighter, id: number) => number) | undefined)?.(tgt, SPELL_NEGATIVE_CHARGE);
      (ctx.removeAurasDueToSpell as ((u: Fighter, id: number) => number) | undefined)?.(tgt, SPELL_POSITIVE_CHARGE_BUFF);
      (ctx.removeAurasDueToSpell as ((u: Fighter, id: number) => number) | undefined)?.(tgt, SPELL_NEGATIVE_CHARGE_BUFF);
      let charge: SpellDef | undefined = src.spec.spells.find((s) => (s.id | 0) === chargeId);
      if (!charge) {
        for (const f of fightersOrder()) {
          charge = f.spec.spells.find((s) => (s.id | 0) === chargeId);
          if (charge) break;
        }
      }
      if (charge) applySpell(tgt, tgt, charge);
    }
    if (
      ((spell.id | 0) === 28062 || (spell.id | 0) === 28085)
      && (src.buffActive.has(SPELL_POSITIVE_CHARGE) || src.buffActive.has(SPELL_NEGATIVE_CHARGE))
      && polarityStackDue(t, src.side)
    ) {
      const n = countSameChargeNear(src, fightersOrder(), (a, b) => ctx.distanceBetween(a, b));
      const buffId = polarityBuffForCharge(
        src.buffActive.has(SPELL_POSITIVE_CHARGE) ? SPELL_POSITIVE_CHARGE : SPELL_NEGATIVE_CHARGE,
      );
      (ctx.removeAurasDueToSpell as ((u: Fighter, id: number) => number) | undefined)?.(src, buffId);
      if (n > 0) {
        let base: SpellDef | undefined = src.spec.spells.find((s) => (s.id | 0) === buffId);
        if (!base) {
          for (const f of fightersOrder()) {
            base = f.spec.spells.find((s) => (s.id | 0) === buffId);
            if (base) break;
          }
        }
        if (base) applySpell(src, src, polarityStackSpell(base, n));
      }
    }

    // Template school/mechanic immune (Creature::IsImmuneToSpell) — skip hostile apply.
    // Self-buffs/heals still land (castOnSelf path in C++ skips mask).
    const hostileSpell = isHostileSpellDef(spell);
    // Unit.cpp:2902 positive spells with EX3_IGNORE_CASTER_AND_TARGET_RESTRICTIONS roll miss/immune.
    const bypassPositiveAutoHit = hasAttrEx3(spell, SPELL_ATTR_EX3.IGNORE_CASTER_AND_TARGET_RESTRICTIONS);
    const hostileSpellOrBypass = hostileSpell || bypassPositiveAutoHit;
    // Spell reflection. SpellHitResult checks reflect BEFORE immunity, and only magic reflects, so a
    // warrior ability never does. A reflected spell cannot re-reflect.
    if (!reflected && hostileSpell && tgt.side !== src.side) {
      const dmgClass = typeof spell.dmgClass === 'number'
        ? spell.dmgClass
        : (spell.school === 'physical' ? SPELL_DAMAGE_CLASS.MELEE : SPELL_DAMAGE_CLASS.MAGIC);
      const reflectable = isReflectableSpell({
        dmgClass,
        passive: spell.passive,
        positive: false,
        noReflection: hasAttrEx(spell, SPELL_ATTR_EX.NO_REFLECTION),
      });
      if (reflectable) {
        const chance = reflectChanceFor(tgt, spell.school);
        // Draw the RNG only when a reflect aura is actually present — otherwise a fight with no
        // reflect would consume a draw here and shift every downstream roll (golden-log determinism).
        if (chance > 0 && rollSpellReflect(true, chance, rng.next())) {
          push({ t, kind: 'flavor', text: `${tgt.spec.name} reflects ${spell.name} back at ${src.spec.name}.` });
          // SPELL_MISS_REFLECT is still a failed hostile hit on the reflector (Spell.cpp:1226).
          engageOnHostileSpell(src, tgt, spell, false);
          applySpell(tgt, src, spellIn, true); // caster becomes the target; guard blocks a re-reflect
          return;
        }
      }
    }
    // CheckTargetCreatureType — the whole-spell valid-target gate. A cc spell reports cc_immune to
    // match the prior gate and the UI; anything else reads as a flat miss, a bad target not immunity.
    if (hostileSpell && !spellTargetTypeAllowed(spell, tgt.creatureType)) {
      const ccEff = spell.effects.find((e) => e.kind === 'cc');
      if (ccEff && ccEff.kind === 'cc') {
        push({ t, kind: 'cc_immune', target: tgt.side, control: ccEff.control, name: spell.name });
      } else {
        push({ t, kind: 'spell_hit', actor: src.side, target: tgt.side, spellId: spell.id, name: spell.name, result: 'miss', amount: 0, school: spell.school });
      }
      return;
    }
    // Template school/mechanic + aura SCHOOL_IMMUNITY → combat log "Immune" (not miss).
    // Cite: Unit.cpp IsImmuneToSpell; KI-695 school-immunity-logged-as-miss.
    if (hostileSpell && spellTemplateImmune(tgt, spell)) {
      push({ t, kind: 'spell_hit', actor: src.side, target: tgt.side, spellId: spell.id, name: spell.name, result: 'immune', amount: 0, school: spell.school });
      // SPELL_MISS_IMMUNE is not SPELL_MISS_EVADE — the core still counts it as an attack.
      engageOnHostileSpell(src, tgt, spell, false);
      return;
    }
    // creature_immunities set 0: every populated effect slot immune means nothing can land. A partly
    // immune spell still resolves, with the per-effect skips at the apply sites.
    if (hostileSpell && isEveryEffectSlotImmune(
      tgt.immunity,
      spell.rawEffects,
      {
        schoolImmuneMask: tgt.spec.schoolImmuneMask,
        mechanicImmuneMask: tgt.spec.mechanicImmuneMask,
        immunities: tgt.spec.immunities,
      },
      hasAttr(spell, SPELL_ATTR.NO_IMMUNITIES),
      hasAttrEx4(spell, SPELL_ATTR_EX4.NO_PARTIAL_IMMUNITY),
    )) {
      push({ t, kind: 'spell_hit', actor: src.side, target: tgt.side, spellId: spell.id, name: spell.name, result: 'immune', amount: 0, school: spell.school });
      engageOnHostileSpell(src, tgt, spell, false);
      return;
    }
    // Aura school immunity blocks harmful auras/spells (not positive self-buffs).
    if (hostileSpell && isImmuneToHarmfulAura(tgt.immunity, {
      schoolMask: schoolMaskFromSchoolName(spell.school) || schoolMaskFromSchool(spell.school),
      positive: false,
      noSchoolImmunities: spellPiercesSchoolImmunity(spell),
    }, {
      schoolImmuneMask: tgt.spec.schoolImmuneMask,
      mechanicImmuneMask: tgt.spec.mechanicImmuneMask,
    })) {
      push({ t, kind: 'spell_hit', actor: src.side, target: tgt.side, spellId: spell.id, name: spell.name, result: 'immune', amount: 0, school: spell.school });
      engageOnHostileSpell(src, tgt, spell, false);
      return;
    }

    // Combo points spent by this cast (finishers read them before clear; builders add after a hit).
    // Self-buff finishers (Slice and Dice) still use the caster's current CP regardless of target.
    const cp = src.comboPoints;
    const isFinisher = !!spell.requiresComboPoints;
    let finisherHit = false; // any hostile effect that landed (for CP clear; miss retains CP)
    // One DR advance and one control land per target, control and mechanic per cast, so a multi-aura
    // remap like Polymorph does not double-step DR.
    const appliedCcThisCast = new Set<string>();
    // One SpellHitResult per target gates ALL effects, damage and root and aura alike — a Frost Nova
    // damage miss must not still apply the root.
    let hostileLanded: boolean | null = null;
    // Does this cast carry damage at all? Decides whether a land failure logs as a spell miss or as
    // the control resisting.
    const spellHasDamagePayload = spell.effects.some(
      (e) => e.kind === 'direct_damage' || e.kind === 'dot' || e.kind === 'health_leech'
        || e.kind === 'weapon_percent_damage' || e.kind === 'weapon_damage' || e.kind === 'weapon_strike',
    );
    // The miss and full-resist side of the land die, in percentage points, memorised when the die was
    // built: heartbeat resist must roll the SAME number, not a recomputation.
    let landMissPlusResistPct: number | null = null;
    const rollHostileLand = (school: School, ccControl?: ControlKind): boolean => {
      if (hostileLanded !== null) return hostileLanded;
      const binary = resolveSpellBinary(spell);
      const dmgClass = typeof spell.dmgClass === 'number' ? spell.dmgClass : SPELL_DAMAGE_CLASS.MAGIC;
      // Unit.cpp:2952 — with NO_AVOIDANCE the caster never enters a hit-result die, so there is
      // nothing to roll and the cast lands whatever the resistances say.
      if (hasAttrEx3(spell, SPELL_ATTR_EX3.NO_AVOIDANCE)) {
        hostileLanded = true;
        landMissPlusResistPct = 0;
        return true;
      }
      const mechanicResistPercent = mechanicResistBonus(
        tgt.spec.mechanicResistPct,
        [spell.mechanic, ...spell.effects.map((e) => (e as { mechanic?: string }).mechanic)],
      );
      // A melee-class spell rolls MeleeSpellHitResult, never the magic die: Bash lands like a strike.
      // Cite: Unit.cpp:2957-2958 SpellHitResult; :2816 MeleeSpellHitResult.
      let failResult: HitResult | 'resist' = 'miss';
      let landed: boolean;
      const meleeDie = dmgClass === SPELL_DAMAGE_CLASS.MELEE && ctx.meleeSpellHitResult;
      if (meleeDie) {
        const r = ctx.meleeSpellHitResult!(src, tgt, spell, mechanicResistPercent);
        landMissPlusResistPct = r.failPct;
        failResult = r.result;
        landed = r.result === 'hit' || r.result === 'crit';
      } else {
        const land = spellDamageLandChance({
          atkLevel: src.spec.level,
          defLevel: tgt.spec.level,
          school,
          resistance: tgt.resistances[school] ?? 0,
          binary,
          resistable: isResistableDmgClass(dmgClass) && dmgClass === SPELL_DAMAGE_CLASS.MAGIC,
          spellHitBonusPercent: src.spellHitBonusPercent,
          // Victim aura 186 for this school. Cite: Unit.cpp:3874.
          attackerSpellHitPercent: tgt.attackerSpellHitBySchool[school] ?? 0,
          aoeAvoidancePercent: spell.aoe ? (tgt.aoeAvoidancePercent ?? 0) : 0,
          attackerPlayerControlled: src.side === 'player' || src.side === 'pet' || isAllySide(src.side),
          victimIsNpc: isEnemySide(tgt.side),
          victimPlayerControlled: tgt.side === 'player' || tgt.side === 'pet' || isAllySide(tgt.side),
          // ALWAYS_HIT and a totem victim zero the MISS component only — resistance and mechanic resist
          // still add. NO_AVOIDANCE skips the switch entirely and is handled as a straight land below.
          alwaysHit: hasAttrEx3(spell, SPELL_ATTR_EX3.ALWAYS_HIT),
          victimIsTotem: isTotemCreatureType(tgt.spec.creatureType) || isTotemSide(tgt.side),
          mechanicResistPercent,
        });
        landMissPlusResistPct = Math.max(0, Math.min(100, (1 - land) * 100));
        landed = rng.chance(land);
      }
      if (!landed) {
        hostileLanded = false;
        // DISCOUNT_POWER_ON_MISS: 80% of the cost back on a miss. Cite: Spell.cpp:3647-3663.
        ctx.refundPowerOnMiss?.(src, spell, failResult === 'resist' ? 'miss' : failResult);

        // SPELL_ATTR_EX_FAILURE_BREAKS_STEALTH: remove stealth auras when the spell land fails.
        // Cite: Unit.cpp:6012 bypassStealthAndEndIt.
        if (hasAttrEx(spell, SPELL_ATTR_EX.FAILURE_BREAKS_STEALTH)) {
          ctx.breakStealth?.(src, 'miss');
        }

        // One SpellHitResult gates every effect, so the log carries ONE line for the cast. A damage
        // spell with a control rider (Frostbolt's snare) reads as the spell missing; cc_resist is for
        // a cast whose only payload is the control. Logging the rider hid every Frostbolt miss from
        // the meter. Cite: Spell.cpp:1227 SPELL_MISS_MISS.
        const logResult: HitResult = failResult === 'resist' ? 'miss' : failResult;
        if (ccControl && !spellHasDamagePayload) {
          push({ t, kind: 'cc_resist', target: tgt.side, control: ccControl, name: spell.name, ...(meleeDie ? { result: logResult } : {}) });
        } else {
          push({ t, kind: 'spell_hit', actor: src.side, target: tgt.side, spellId: spell.id, name: spell.name, result: logResult, amount: 0, school });
        }
        // Merged miss+resist land die is not SPELL_MISS_RESIST; do not stamp RESIST (procEx 0x18).

        // Magic Absorption: a magic-die fail restores pct% max mana; a melee-die fail is a TAKEN_MELEE_SPELL
        // proc, not the 0x20000 flag 29441 carries. Cite: UnitAuraProcHandler.cpp:938–947 icon 459 → 29442.
        if (
          !meleeDie
          && tgt.magicAbsorptionPct > 0
          && tgt.spec.powerType === 'mana'
          && !dead(tgt)
        ) {
          const gain = magicAbsorptionManaAmount(tgt.spec.maxPower, tgt.magicAbsorptionPct);
          if (gain > 0) {
            const before = tgt.power;
            tgt.power = Math.min(tgt.spec.maxPower, tgt.power + gain);
            if (tgt.power !== before) {
              push({
                t,
                kind: 'resource',
                actor: tgt.side,
                power: 'mana',
                value: tgt.power,
                delta: tgt.power - before,
              });
              push({
                t,
                kind: 'spell_hit',
                actor: tgt.side,
                target: tgt.side,
                spellId: MAGIC_ABSORPTION_TRIGGER_SPELL_ID,
                name: 'Magic Absorption',
                result: 'hit',
                amount: tgt.power - before,
                school: 'arcane',
              });
            }
          }
        }
        return false;
      }
      hostileLanded = true;
      return true;
    };

    // Interpreter-off fallback: consume_aura effect is the live path.
    // Cite: SpellEffects.cpp:1048–1052 / :3809–3810 / :3989–3991.
    if (!spell.effects.some((e) => e.kind === 'consume_aura')) {
      if ((spell.id | 0) === HOURGLASS_SAND_SPELL_ID) {
        (ctx.removeAurasDueToSpell as ((u: Fighter, id: number) => number) | undefined)?.(
          src,
          BROOD_AFFLICTION_BRONZE_SPELL_ID,
        );
      }
      if ((spell.id | 0) === BRITTLE_ARMOR_PEEL_SPELL_ID) {
        (ctx.stripAuraOnDispel as ((u: Fighter, id: number, n: number) => void) | undefined)?.(
          tgt,
          BRITTLE_ARMOR_STACK_SPELL_ID,
          1,
        );
      }
      // Widow's Embrace: strip Faerlina's Enrage, arm the lockout that keeps it off for the Embrace's
      // own 30 s window, and the caster dies for it. Cite: boss_faerlina.cpp:89-109.
      if ((spell.id | 0) === 28157 && tgt.side !== src.side && tgt.hp > 0) {
        // SpellHitTarget Slime Spray: one Fallout Slime per player. Cite: boss_grobbulus.cpp:75-80.
        if (isPlayerCharacterSide(tgt.side) || isAllySide(tgt.side)) {
          const pos = ctx.posOf?.(tgt.side);
          ctx.injectSummonForCaster?.(
            src,
            16290,
            0,
            pos ? { x: pos.x, y: pos.y } : undefined,
          );
        }
      }
      // EntangleFankriss: caster casts the matching hatchling dest-spell; first fire fills the
      // other two alcoves. Cite: boss_fankriss.cpp:186-203 OnEffectExecute; :173-178.
      if (((src.spec.creatureEntry ?? 0) | 0) === 15510 && tgt.side !== src.side && tgt.hp > 0) {
        const hatchByEntangle: Record<number, number> = { 720: 26630, 731: 26631, 1121: 26632 };
        const hatchId = hatchByEntangle[spell.id | 0];
        if (hatchId) {
          const hatch = src.spec.spells.find((s) => (s.id | 0) === hatchId);
          if (hatch) runCastSummons(ctx, src, hatch);
          const sd = isEnemySide(src.side)
            ? ctx.enemyCastBySide.get(src.side)?.scriptDev
            : undefined;
          const tags = sd?.oneshotTags;
          if (tags && !tags.has('fankriss_init_entangle')) {
            tags.add('fankriss_init_entangle');
            for (const otherId of Object.values(hatchByEntangle)) {
              if (otherId === hatchId) continue;
              const other = src.spec.spells.find((s) => (s.id | 0) === otherId);
              if (other) runCastSummons(ctx, src, other);
            }
          }
        }
      }
      if ((spell.id | 0) === 28236 && ((src.spec.creatureEntry ?? 0) | 0) === 15932
        && gluthChowAt.get(src) !== t) {
        // 28236 hits a live Zombie Chow 16360 → 28239. Cite: boss_gluth.cpp:203-220,151-156.
        const chow = ctx.livingEnemies().find((e) => ((e.spec.creatureEntry ?? 0) | 0) === 16360);
        if (chow) {
          gluthChowAt.set(src, t);
          const kill = src.spec.spells.find((s) => (s.id | 0) === 28239);
          if (kill) applySpell(src, chow, kill);
        }
      }
      if ((spell.id | 0) === 28239 && ((src.spec.creatureEntry ?? 0) | 0) === 15932 && tgt.hp > 0) {
        // Chow casts 28238: Gluth +5% max HP. Cite: boss_gluth.cpp:234-242,227-231.
        const gain = Math.floor(src.spec.maxHealth * 0.05);
        if (gain > 0) src.hp = Math.min(src.spec.maxHealth, src.hp + gain);
        ctx.applyScriptDevCombatActions?.(src, [{
          kind: 'yell',
          textId: 12242,
          cite: 'boss_gluth.cpp:97 DoBroadcastText(EMOTE_DEVOURS_ZOMBIE_CHOW 12242)',
        }]);
      }
      if (
        [28832, 28833, 28834, 28835].includes(spell.id | 0)
        && [16062, 16063, 16064, 16065].includes((src.spec.creatureEntry ?? 0) | 0)
      ) {
        // HorsemenMark OnApply: stack 1 is silent; 2+ cast 28836. Cite: boss_four_horsemen.cpp:388-411.
        const markTargets = (isPlayerCharacterSide(tgt.side) || isAllySide(tgt.side))
          ? [tgt]
          : livingHostilesFor(src).filter((h) => (
            h.hp > 0 && (isPlayerCharacterSide(h.side) || isAllySide(h.side))
          ));
        const bolt = src.spec.spells.find((s) => (s.id | 0) === 28836);
        for (const p of markTargets) {
          if (p.hp <= 0) continue;
          let stacks = horsemenMarkStacks.get(p);
          if (!stacks) {
            stacks = new Map();
            horsemenMarkStacks.set(p, stacks);
          }
          const sid = spell.id | 0;
          const n = Math.min(100, (stacks.get(sid) ?? 0) + 1);
          stacks.set(sid, n);
          if (n < 2 || !bolt) continue;
          const dmg = n === 2 ? 250 : n === 3 ? 1000 : n === 4 ? 3000 : 1000 * n;
          applySpell(src, p, {
            ...bolt,
            effects: bolt.effects.map((e) => (
              e.kind === 'direct_damage' ? { ...e, min: dmg, max: dmg } : e
            )),
          });
        }
      }
      if ((spell.id | 0) === 28035 && ((src.spec.creatureEntry ?? 0) | 0) === 16060) {
        // Reset Gothik Event: strip balcony periodics. Cite: boss_gothik.cpp:501-512.
        for (const id of [28007, 28009, 28011]) {
          (ctx.removeAurasDueToSpell as ((u: Fighter, spellId: number) => number) | undefined)?.(src, id);
        }
      }
      if ((spell.id | 0) === 29230 && ((src.spec.creatureEntry ?? 0) | 0) === 16060 && tgt.side === src.side) {
        // 29230 effects[] is empty; raw aura 39 misc 127. Cite: boss_gothik.cpp:53,169-171.
        grantImmunityAura(src, {
          spellId: 29230,
          auraType: AURA_TYPE.SCHOOL_IMMUNITY,
          schoolMask: SPELL_SCHOOL_MASK_ALL,
          positive: true,
          immunityPurgesEffect: true,
          durationMs: 274_000,
        }, t + 274_000, spell.name, src.side);
      }
      if ((spell.id | 0) === 29252 && ((src.spec.creatureEntry ?? 0) | 0) === 15954) {
        // OnPeriodicTrigger disables the empty tick and casts 29247/29248/29249.
        // Cite: boss_noth.cpp:321-331 SummonSkeletonsNoth.
        for (const id of [29247, 29248, 29249]) {
          const skel = src.spec.spells.find((s) => (s.id | 0) === id);
          if (skel) runCastSummons(ctx, src, skel);
        }
      }
      if ((spell.id | 0) === 28673 && ((src.spec.creatureEntry ?? 0) | 0) === 15952
        && maexxnaWrapAt.get(src) !== t) {
        // 3 skip-tank players get 28622 (triggered by 28618-21). Cite: boss_maexxna.cpp:207-246.
        maexxnaWrapAt.set(src, t);
        const tankId = threatOf(src)?.getCurrentVictimId() ?? null;
        const pool = livingHostilesFor(src).filter((h) => (
          h.hp > 0
          && h.side !== tankId
          && (isPlayerCharacterSide(h.side) || isAllySide(h.side))
        ));
        for (let i = pool.length - 1; i > 0; i--) {
          const j = rng.int(0, i);
          const tmp = pool[i]!;
          pool[i] = pool[j]!;
          pool[j] = tmp;
        }
        const wrap = src.spec.spells.find((s) => (s.id | 0) === 28622);
        const n = Math.min(3, pool.length);
        if (wrap) {
          for (let i = 0; i < n; i++) applySpell(src, pool[i]!, wrap);
        }
      }
      if ((spell.id | 0) === 799 && ((src.spec.creatureEntry ?? 0) | 0) === 15276) {
        // SpellHit 799: swap with Veknilash, DoResetThreat, stun 800. Cite: boss_twinemperors.cpp:332-356.
        const partner = ctx.livingEnemies().find((e) => ((e.spec.creatureEntry ?? 0) | 0) === 15275);
        if (partner) {
          const a = ctx.posOf?.(src.side);
          const b = ctx.posOf?.(partner.side);
          if (a && b && ctx.setPos) {
            ctx.setPos(src.side, { x: b.x, y: b.y, z: b.z });
            ctx.setPos(partner.side, { x: a.x, y: a.y, z: a.z });
          }
          const srcTm = threatOf(src);
          const partnerTm = threatOf(partner);
          if (srcTm) srcTm.modifyAllThreatPercent(-100);
          if (partnerTm) partnerTm.modifyAllThreatPercent(-100);
          push({ t, kind: 'threat_all_pct', actor: src.side, percent: -100 });
          push({ t, kind: 'threat_all_pct', actor: partner.side, percent: -100 });
          const stun = src.spec.spells.find((s) => (s.id | 0) === 800);
          if (stun) {
            applySpell(src, src, stun);
            applySpell(partner, partner, stun);
          }
        }
      }
      if ((spell.id | 0) === 29107 && ((src.spec.creatureEntry ?? 0) | 0) === 16061
        && tgt.hp > 0 && isPlayerCharacterSide(tgt.side)
        && tgt.spec.powerType === 'mana' && razuviousShoutAt.get(src) !== t) {
        // First mana player of this Disrupting Shout. Cite: boss_razuvious.cpp:85-102.
        razuviousShoutAt.set(src, t);
        ctx.applyScriptDevCombatActions?.(src, [{
          kind: 'yell',
          textId: 13082,
          cite: 'boss_razuvious.cpp:92 DoBroadcastText(EMOTE_TRIUMPHANT_SHOOT 13082)',
        }]);
      }
      if ((spell.id | 0) === 24649 && ((src.spec.creatureEntry ?? 0) | 0) === 15084
        && tgt.hp > 0 && renatakiBladesFanAt.get(src) !== t) {
        // Non-triggered initial cast fans to 9 other players. Cite: boss_renataki.cpp:93-114.
        renatakiBladesFanAt.set(src, t);
        const pool = livingHostilesFor(src).filter((h) => (
          h.hp > 0 && h !== tgt && (isPlayerCharacterSide(h.side) || isAllySide(h.side))
        ));
        for (let i = pool.length - 1; i > 0; i--) {
          const j = rng.int(0, i);
          const tmp = pool[i]!;
          pool[i] = pool[j]!;
          pool[j] = tmp;
        }
        const n = Math.min(9, pool.length);
        for (let i = 0; i < n; i++) applySpell(src, pool[i]!, spell);
      }
      if ((spell.id | 0) === 28374 && ((src.spec.creatureEntry ?? 0) | 0) === 15932 && tgt.hp > 0) {
        // Players, pets, Zombie Chow 16360 drop to 5% via 28375. Cite: boss_gluth.cpp:162-182.
        const playerish = isPlayerCharacterSide(tgt.side) || isAllySide(tgt.side);
        const chow = ((tgt.spec.creatureEntry ?? 0) | 0) === 16360;
        if (playerish || chow) {
          const floor = Math.max(1, Math.floor(tgt.spec.maxHealth * 0.05));
          const dmg = tgt.hp - floor;
          if (dmg > 0) {
            const bolt = src.spec.spells.find((s) => (s.id | 0) === 28375);
            if (bolt) {
              const scaled = {
                ...bolt,
                effects: bolt.effects.map((e) => (
                  e.kind === 'direct_damage' ? { ...e, min: dmg, max: dmg } : e
                )),
              };
              applySpell(src, tgt, scaled);
            } else {
              tgt.hp = floor;
            }
          }
        }
      }
      if ((spell.id | 0) === 29317 && ((src.spec.creatureEntry ?? 0) | 0) === 16060
        && tgt.side !== src.side && tgt.hp > 0 && gothikShadowboltBounceAt.get(src) !== t) {
        // EFFECT_INDEX_1 SCRIPT 50% recast at a random player. Cite: boss_gothik.cpp:516-535.
        if (rng.int(0, 1) === 1) {
          const pool = livingHostilesFor(src).filter((h) => (
            h.hp > 0 && (isPlayerCharacterSide(h.side) || isAllySide(h.side))
          ));
          if (pool.length > 0) {
            gothikShadowboltBounceAt.set(src, t);
            applySpell(src, pool[rng.int(0, pool.length - 1)]!, spell);
          }
        }
      }
      if ((spell.id | 0) === HAKKAR_BLOOD_SIPHON_SPELL_ID && tgt.side !== src.side && tgt.hp > 0) {
        // target->CastSpell(caster, HasAura(24321) ? 24323 : 24322). Cite: boss_hakkar.cpp:126.
        const siphonId = tgt.buffActive.has(POISONOUS_BLOOD_CLOUD_SPELL_ID)
          ? HAKKAR_BLOOD_SIPHON_POISON_SPELL_ID
          : HAKKAR_BLOOD_SIPHON_FUNNEL_SPELL_ID;
        const siphon = src.spec.spells.find((s) => (s.id | 0) === siphonId);
        if (siphon) applySpell(tgt, src, siphon);
      }
      if ((spell.id | 0) === CHROMAGGUS_BREATH_SELECTION_SPELL_ID && tgt.side === src.side) {
        // Ctor DoCast 23195 once; instance stores the pair for the lifetime.
        // Cite: boss_chromaggus.cpp:60; SpellEffects.cpp:993-1010; blackwing_lair.cpp:644-652.
        const store = ctx.instanceData;
        if ((store.get(TYPE_CHROMA_LBREATH) ?? 0) === 0) {
          const pair = pickChromaggusBreathPair(rng.next(), rng.next());
          store.set(TYPE_CHROMA_LBREATH, pair.left);
          store.set(TYPE_CHROMA_RBREATH, pair.right);
          emitSimEffect(ctx, { kind: 'instanceData', store: new Map(store), openDoors: [] });
        }
      }
      if ((spell.id | 0) === CORRUPTED_MIND_PRIMER_SPELL_ID && tgt.side === src.side) {
        // Dummy 3 PBAoE; OnEffectExecute class-branch. Cite: boss_loatheb.cpp:89-117.
        const radius = spell.radiusYd ?? 0;
        const lockoutMs = durMs(3) ?? 0;
        if (lockoutMs > 0) {
          for (const h of livingHostilesFor(src)) {
            if (h.hp <= 0) continue;
            const lockoutId = corruptedMindLockoutSpellId(h.spec.classId ?? 0);
            if (lockoutId == null) continue;
            if (radius > 0) {
              const d = distanceBetween(src, h);
              if (d != null && d > radius) continue;
            }
            h.buffActive.add(lockoutId);
            effects.push({
              kind: 'buff',
              source: src.side,
              target: h.side,
              spellId: lockoutId,
              name: 'Corrupted Mind',
              expiresAt: t + lockoutMs,
            });
            push({ t, kind: 'aura', actor: h.side, name: 'Corrupted Mind', applied: true, spellId: lockoutId });
          }
        }
      }
      if ((spell.id | 0) === WIDOWS_EMBRACE_SPELL_ID) {
        (ctx.removeAurasDueToSpell as ((u: Fighter, id: number) => number) | undefined)?.(
          tgt,
          FAERLINA_ENRAGE_SPELL_ID,
        );
        const lockoutMs = widowsEmbraceLockoutMs(
          spell.effects.flatMap((e) => ('durationMs' in e && e.durationMs ? [e.durationMs] : []))[0],
        );
        if (lockoutMs > 0) {
          tgt.buffActive.add(WIDOWS_EMBRACE_CD_SPELL_ID);
          effects.push({
            kind: 'buff',
            source: src.side,
            target: tgt.side,
            spellId: WIDOWS_EMBRACE_CD_SPELL_ID,
            name: "Widow's Embrace",
            expiresAt: t + lockoutMs,
          });
          push({ t, kind: 'aura', actor: tgt.side, name: "Widow's Embrace", applied: true, spellId: WIDOWS_EMBRACE_CD_SPELL_ID });
        }
        // The add spends its life on the cast (effect index 1 → 28748 on the CASTER). Only a creature body
        // dies: the player character is never suicided by this, whatever it is controlling.
        if (src.side !== 'player' && src.spec.creatureEntry != null && src.hp > 0) {
          src.hp = 0;
          push({ t, kind: 'spell_hit', actor: src.side, target: src.side, spellId: WIDOWS_EMBRACE_INSTAKILL_SPELL_ID, name: 'Instakill Self', result: 'hit', amount: 0, school: spell.school });
        }
      }
      if ((spell.id | 0) === MERCURIAL_SHIELD_PEEL_SPELL_ID) {
        (ctx.stripAuraOnDispel as ((u: Fighter, id: number, n: number) => void) | undefined)?.(
          src,
          MERCURIAL_SHIELD_STACK_SPELL_ID,
          1,
        );
      }
    }

    // Caster-side script riders (Improved Scorpid Sting stamina). Cite: SpellAuras.cpp:3453-3473.
    const castEffects = effectsWithScriptRiders(
      spell,
      (scriptId) => unitHasOverrideScript(src, scriptId),
    ) as typeof spell.effects;
    // IsImmuneToSpellEffect is per effect INDEX, so a half-immune spell still runs its other half:
    // Thunder Clap keeps its damage and drops the attack slow. An effect with no slot is never gated.
    const immuneSlot = (eff: { effectSlot?: number }): boolean => {
      if (!hostileSpell || eff.effectSlot == null) return false;
      const raw = spell.rawEffects?.[eff.effectSlot];
      if (!raw) return false;
      return isImmuneToSpellEffectSlot(
        tgt.immunity,
        raw,
        {
          schoolImmuneMask: tgt.spec.schoolImmuneMask,
          mechanicImmuneMask: tgt.spec.mechanicImmuneMask,
          immunities: tgt.spec.immunities,
        },
        hasAttr(spell, SPELL_ATTR.NO_IMMUNITIES),
      );
    };
    // Multirank identity for this cast, mirrored onto every buff/resist row it leaves so a later
    // sibling in the same class spell family can strip it with no data-store lookup.
    const stackIdent = auraStackIdentity(spell);
    const stackFields = stackIdent ? { stackIdent } : {};
    // A row this cast must replace: same exclusive spell_group, or the same family+aura pair.
    const isStackSibling = (e: ActiveEffect, group: number | undefined): boolean =>
      (group != null && group !== 0 && e.exclusionGroup === group)
      || stackIdentitiesExclude(stackIdent, e.stackIdent);
    // A stronger multirank sibling already on the unit refuses this apply outright, so Gift of the
    // Wild rank 1 cannot downgrade Mark of the Wild rank 7. Cite: Unit.cpp:5013-5015.
    const strongerSiblingOn = (side: Side): boolean =>
      stackIdent != null
      && ctx.effectsOn(side).some(
        (e) =>
          e.spellId !== spell.id
          && stackIdentitiesExclude(stackIdent, e.stackIdent)
          && existingStackIsStronger(stackIdent, e.stackIdent),
      );
    // One paladin aura per caster: a new area aura in an exclusive group removes the holder's previous
    // one from the caster and so from every carrier. Cite: Unit.cpp:4907; SpellAuras.cpp:597.
    if (isPartyAreaAura(spell) && spell.exclusionGroup) {
      stripHolderRowsInGroup(
        effects, src.side, spell.id, spell.exclusionGroup,
        (id) => ctx.spellOf?.(id)?.exclusionGroup, bySide, reverseActiveEffect,
        ctx.effectsFrom(src.side),
      );
    }
    for (const eff of castEffects) {
      if (immuneSlot(eff)) continue;
      // Per-effect CP value add (Object.cpp CalculateSpellEffectValue).
      const ppc = ('pointsPerComboPoint' in eff && eff.pointsPerComboPoint && hasAttrEx(spell, SPELL_ATTR_EX.FINISHING_MOVE_DAMAGE)) ? eff.pointsPerComboPoint * cp : 0;
      // Duration finishers / Rupture: scale base duration toward durationMaxMs by CP/5.
      const durFor = (base: number): number => {
        const scaled = scaleDurationByCp(base, spell.durationMaxMs, isFinisher || spell.durationMaxMs != null ? cp : 0);
        const withDur = applyOwnedSpellMod(src, spell, SPELLMOD_DURATION, scaled);
        return applyOwnedSpellMod(src, spell, SPELLMOD_ALL_EFFECTS, withDur);
      };

      if (eff.kind === 'direct_damage') {
        // hostile:false is TARGET_UNIT_CASTER — the row burns whoever cast it, and lands only on a
        // self-cast. 40 src_spell_template rows are that shape (every backfire, Sacrifice, Dark
        // Rune). Everything else keeps the friendly-fire guard that stops Frost Nova hitting its
        // own caster. Cite: effects-core.ts selfHit; SpellEffects.cpp EffectSchoolDMG.
        if (eff.hostile === false) {
          if (tgt !== src) continue;
        } else if (isEnemySide(src.side) === isEnemySide(tgt.side)) continue;
        // Hit, miss or full resist, shared with the root and other effects through rollHostileLand.
        // The binary and dmgClass inputs come from the ETL or spell_template when present.
        const binary = resolveSpellBinary(spell);
        if (!rollHostileLand(eff.school)) continue;
        let spellCrit = applyOwnedSpellMod(
          src, spell, SPELLMOD_CRITICAL_CHANCE,
          fighterSpellCrit(src) * 100 + ((spell ? (spell as { _talentCritBonus?: number })._talentCritBonus : 0) || 0),
        ) / 100 + (src.castCritAdd ?? 0);
        // SPELL_AURA_MOD_ATTACKER_SPELL_CRIT_CHANCE on victim. Cite: Unit.cpp:3530–3531.
        spellCrit += (tgt.attackerSpellCritBySchool[eff.school] ?? 0) / 100;
        // Shatter: +10..50 crit vs frozen. Cite: Mage.cpp:58–70 ShatterMage.
        {
          const known = new Set<number>([
            ...src.spec.spells.map((s) => s.id),
            ...src.buffActive,
          ]);
          const shatterPts = shatterFrozenCritBonus(known);
          if (shatterPts > 0 && targetIsFrozenForShatter({ auras: effects, targetSide: tgt.side, now: t })) {
            spellCrit += shatterPts / 100;
          }
        }
        // EX2_CANT_CRIT plus the IsSpellAbleToCrit effect filter — a spell with no crittable
        // effect never rolls. Cite: SpellMgr.h:307-339; Unit.cpp:3878 RollSpellCritOutcome.
        const crit = spellCanCrit(spell)
          && rng.chance(spellCritChance(spellCrit, src.spec.level, tgt.spec.level, spell.dmgClass));
        let raw = rollBetween(eff.min + ppc, eff.max + ppc, rng.next());
        raw = applyOwnedSpellMod(src, spell, SPELLMOD_DAMAGE, raw);
        raw = applyOwnedSpellMod(src, spell, SPELLMOD_ALL_EFFECTS, raw);
        if (src.castEffectPct) raw *= (1 + src.castEffectPct / 100); // Amplify Curse (empowered cast)
        // Eviscerate AP term — CMaNGOS SpellEffects.cpp:330: damage += AP * combo * 0.03f
        if (spell.comboApCoeff && cp > 0 && hasAttrEx(spell, SPELL_ATTR_EX.FINISHING_MOVE_DAMAGE)) raw += src.attackPower * cp * spell.comboApCoeff;
        // Runtime SpellDamageBonusDone when coeffs present; else baked min/max unchanged.
        raw = applySpellDamageBonusIfPresent(raw, spell, eff.effectSlot ?? 0, {
          spellPower: src.spec.spellPower,
          spellDamageBySchool: src.spec.spellDamageBySchool,
          school: eff.school,
          attackPower: src.attackPower,
          // school % still applied below for talent path when no coeff; with coeff,
          // spellBonus folds damagePct — avoid double-applying when coeffs present.
          damagePct: spell.effectBonusCoefficient?.some((c) => c > 0) || spell.effectBonusCoefficientFromAP?.some((c) => c > 0)
            ? (src.damagePctBySchool[eff.school] ?? 0)
            : 0,
        });
        const ignoreCasterModifiers = hasAttrEx3(spell, SPELL_ATTR_EX3.IGNORE_CASTER_MODIFIERS);
        if (!ignoreCasterModifiers) {
          // MOD_FLAT_SPELL_DAMAGE_VERSUS (180). Cite: Unit.cpp:7055 DoneTotal += …
          raw += sumVersusForCreatureType(src.spellDamageVersus, tgt.creatureType);
          // MOD_DAMAGE_DONE_CREATURE (59). Cite: Unit.cpp:7061 DoneTotal += …
          raw += sumVersusForCreatureType(src.damageDoneCreature, tgt.creatureType);
        }
        // Aura 169 raises the crit multiplier vs a creature type. Cite: Unit.cpp:3561.
        if (crit && !ignoreCasterModifiers) raw *= critMultiplierWithVersus(TUNING.spellCritMult, src.critDamageVersusPct, tgt.creatureType);
        const dmgPct = src.damagePctBySchool[eff.school] ?? 0;
        const usedCoeffBonus = !!(spell.effectBonusCoefficient?.some((c) => (c ?? 0) > 0)
          || spell.effectBonusCoefficientFromAP?.some((c) => (c ?? 0) > 0));
        if (!ignoreCasterModifiers && dmgPct && !usedCoeffBonus) raw *= (1 + dmgPct / 100);
        // MOD_DAMAGE_DONE_VERSUS (168) multiplier. Cite: Unit.cpp:7058 DoneTotalMod *= …
        const versusPct = sumVersusForCreatureType(src.damageDoneVersusPct, tgt.creatureType);
        if (!ignoreCasterModifiers && versusPct) raw *= (1 + versusPct / 100);
        // JoC: unstunned target takes half. Cite: Paladin.cpp:160-161 SetDamage(/2).
        if (JUDGEMENT_OF_COMMAND_DAMAGE_IDS.has(spell.id | 0) && !(tgt.stunnedUntil > t)) {
          raw = Math.trunc(raw / 2);
        }
        const amount = dealDamage(tgt, raw, eff.school, src.spec.level, {
          binary, damageType: 'spell', attacker: src, spell, crit,
        });
        push({ t, kind: 'spell_hit', actor: src.side, target: tgt.side, spellId: spell.id, name: spell.name, result: crit ? 'crit' : 'hit', amount, school: eff.school });
        finisherHit = true;
        // Warrior Execute dumps the remaining rage on a successful hit, since it is already folded
        // into the damage. A miss keeps the leftover rage after the cast cost. Cite: Warrior.cpp:32.
        if (isWarriorExecuteSpell(spell) && src.spec.powerType === 'rage' && src.power > 0) {
          const before = src.power;
          src.power = 0;
          push({
            t, kind: 'resource', actor: src.side, power: 'rage', value: 0, delta: -before,
          });
        }
        if (amount > 0) {
          applySpellThreatBonus(src, spell, tgt && isEnemySide(tgt.side) ? tgt : undefined, hitCount);
          triggerProcs(src, tgt, !!crit, 'spell', spell);
          rollGearProcs(src, tgt, crit ? 'crit' : 'hit', spell);
          // Execute / Bloodthirst are melee-class school damage and never reach weaponStrike.
          // Cite: UnitAuraProcHandler.cpp:810-841 PROC_FLAG_DEAL_MELEE_ABILITY.
          if ((spell.dmgClass ?? -1) === SPELL_DAMAGE_CLASS.MELEE) {
            const extra = ctx.trySweepingStrikesExtra;
            if (typeof extra === 'function') extra(src, tgt, amount, spell, ignoreCasterModifiers);
          }
        }
      } else if (
        eff.kind === 'persistent_area'
        || (eff.kind === 'dot' && isPersistentAreaEffect(spell, eff))
      ) {
        // PERSISTENT_AREA_AURA (27) is a session ground pool, not a unit-applied DoT — an explicit
        // kind or the equivalent bake. One pool per caster and spell; a recast refreshes it.
        const paaSchool = eff.school;
        const paaMin = eff.min;
        const paaMax = eff.max;
        const paaDur = eff.durationMs;
        const paaTick = eff.tickMs;
        // Radius: effect.radius (explicit PAA) or SpellDef.radiusYd (SpellRadius.dbc bake).
        // Cite: dynamicObject.persistentAreaFromSpell; game-data Consecration 26573 radiusYd=8.
        const paaRadius =
          (eff.kind === 'persistent_area' && eff.radius != null && eff.radius > 0
            ? eff.radius
            : undefined)
          ?? (spell.radiusYd != null && spell.radiusYd > 0 ? spell.radiusYd : undefined);
        const dur = durFor(paaDur);
        let dmin = paaMin + ppc, dmax = paaMax + ppc;
        if (src.castEffectPct) {
          const f2 = 1 + src.castEffectPct / 100;
          dmin *= f2;
          dmax *= f2;
        }
        dmin = applySpellDamageBonusIfPresent(dmin, spell, eff.effectSlot ?? 0, {
          spellPower: src.spec.spellPower,
          spellDamageBySchool: src.spec.spellDamageBySchool,
          school: paaSchool,
          attackPower: src.attackPower,
          damagePct: src.damagePctBySchool[paaSchool] ?? 0,
        });
        dmax = applySpellDamageBonusIfPresent(dmax, spell, eff.effectSlot ?? 0, {
          spellPower: src.spec.spellPower,
          spellDamageBySchool: src.spec.spellDamageBySchool,
          school: paaSchool,
          attackPower: src.attackPower,
          damagePct: src.damagePctBySchool[paaSchool] ?? 0,
        });
        const ignoreCasterModifiers = hasAttrEx3(spell, SPELL_ATTR_EX3.IGNORE_CASTER_MODIFIERS);
        const dmgPct = src.damagePctBySchool[paaSchool] ?? 0;
        const usedCoeffBonus = !!(spell.effectBonusCoefficient?.some((c) => (c ?? 0) > 0)
          || spell.effectBonusCoefficientFromAP?.some((c) => (c ?? 0) > 0));
        if (!ignoreCasterModifiers && dmgPct && !usedCoeffBonus) {
          dmin = Math.round(dmin * (1 + dmgPct / 100));
          dmax = Math.round(dmax * (1 + dmgPct / 100));
        } else {
          dmin = Math.round(dmin);
          dmax = Math.round(dmax);
        }
        // The pool origin is the cast-time position, NOT the live caster: a dest-bearing player cast
        // uses castDest, and otherwise targetA decides. Snapshot, so the pool stays put as bodies walk.
        const posOf = ctx.posOf;
        const destPos = src.castDest;
        const originSide = spellAoeFromCaster(spell) ? src.side : tgt.side;
        const originPos = destPos ?? posOf?.(originSide);
        const poolOrigin =
          originPos != null
            ? {
              x: originPos.x,
              y: originPos.y,
              ...(originPos.z != null && Number.isFinite(originPos.z) ? { z: originPos.z } : {}),
            }
            : undefined;
        const pool = createGroundPool({
          id: nextGroundPoolId(),
          spellId: spell.id,
          name: spell.name,
          source: src.side,
          school: paaSchool,
          min: dmin,
          max: dmax,
          durationMs: dur,
          tickMs: paaTick,
          nowMs: t,
          radius: paaRadius,
          origin: poolOrigin,
          binary: resolveSpellBinary(spell),
          effIndex: eff.effectSlot ?? 0,
          laterPersistentEffect: hasLaterPersistentAreaOrFarsight(spell, eff.effectSlot ?? 0),
          onlyOnPlayer: hasAttrEx3(spell, SPELL_ATTR_EX3.ONLY_ON_PLAYER),
        });
        upsertGroundPool(groundPools, pool);
        ctx.touchGroundPool(pool);
        push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true, spellId: spell.id });
        finisherHit = true;
      } else if (eff.kind === 'activate_object') {
        // The floor half of ACTIVATE_OBJECT: a named type-6 trap fires its payload where it stands.
        // Nothing else in the effect list moves, and a spell whose objects are doors lays nothing.
        const laid = laySpellTrapSites(ctx, cfg, spell.id, eff.effectSlot ?? 0, src.side);
        if (laid > 0) {
          push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true, spellId: spell.id });
        }
      } else if (eff.kind === 'summon_object_wild') {
        // A trap GO whose spell damages IS a ground pool: it stands where the cast landed, casts on
        // whoever is inside and re-arms on its cooldown. Every number is read off the trap spell bake.
        const trapPool = trapObjectPoolFor(eff.goEntry | 0);
        const trapKit = trapPool
          ? src.spec.spells.find((s) => (s.id | 0) === trapPool.spellId)
          : undefined;
        const trapSpell = trapKit ? resolveCombatSpell(trapKit) : null;
        // A dot payload (Conflagration) ticks on its own amplitude; a one-shot (Blaze) on the re-arm.
        const trapHit = trapSpell?.effects.find(
          (te): te is Extract<SpellEffect, { kind: 'dot' | 'direct_damage' }> =>
            te.kind === 'dot' || te.kind === 'direct_damage',
        );
        const trapRadius = trapSpell?.radiusYd != null && trapSpell.radiusYd > 0
          ? trapSpell.radiusYd
          : undefined;
        if (trapPool && trapSpell && trapHit && trapRadius != null) {
          const trapOrigin = src.castDest ?? ctx.posOf?.(tgt.side);
          const trapGround = createGroundPool({
            id: nextGroundPoolId(),
            spellId: spell.id,
            name: trapSpell.name,
            source: src.side,
            school: trapHit.school,
            min: trapHit.min,
            max: trapHit.max,
            // The GO's own life, off the summon effect — not the payload's aura duration.
            durationMs: eff.durationMs | 0,
            tickMs: trapHit.kind === 'dot' && trapHit.tickMs > 0 ? trapHit.tickMs : trapPool.cooldownMs,
            nowMs: t,
            radius: trapRadius,
            ...(trapOrigin != null
              ? {
                origin: {
                  x: trapOrigin.x,
                  y: trapOrigin.y,
                  ...(trapOrigin.z != null && Number.isFinite(trapOrigin.z) ? { z: trapOrigin.z } : {}),
                },
              }
              : {}),
            binary: resolveSpellBinary(trapSpell),
            effIndex: eff.effectSlot ?? 0,
            laterPersistentEffect: false,
            onlyOnPlayer: hasAttrEx3(trapSpell, SPELL_ATTR_EX3.ONLY_ON_PLAYER),
          });
          upsertGroundPool(groundPools, trapGround);
          ctx.touchGroundPool(trapGround);
          push({ t, kind: 'aura', actor: src.side, name: trapSpell.name, applied: true, spellId: trapSpell.id });
          finisherHit = true;
        }
      } else if (eff.kind === 'dot') {
        // Totem.cpp:282–287 — negative auras including PERIODIC_DAMAGE never land.
        if (!isSelfTargetedDot(spell, eff)
          && (isTotemCreatureType(tgt.creatureType) || isTotemSide(tgt.side))) {
          push({ t, kind: 'spell_hit', actor: src.side, target: tgt.side, spellId: spell.id, name: spell.name, result: 'immune', amount: 0, school: spell.school });
          continue;
        }
        // Self-cost PERIODIC_DAMAGE (Hellfire tgtA=1) lands on the caster, not the foe.
        // Cite: Spell.dbc 1949 EffectImplicitTargetA; isSelfTargetedDot; KI-878.
        const selfDot = isSelfTargetedDot(spell, eff);
        const dotTgt = selfDot ? src : tgt;
        // One SpellHitResult gates the aura too: a resisted Holy Fire lands no DoT. Self-cost dots
        // skip the foe hit roll, since a unit always hits itself.
        if (!selfDot && (hostileSpell || (bypassPositiveAutoHit && tgt.side !== src.side)) && !rollHostileLand(eff.school)) continue;
        // Shadow Flame SCRIPT_EFFECT: skip DoT 22682 when target has Onyxia Scale Cloak dummy.
        // Cite: SpellEffects.cpp:3756–3760 GetDummyAura(22683).
        if ((spell.id | 0) === SHADOW_FLAME_SPELL_ID) {
          const hasCloak = ctx.effectsOn(dotTgt.side).some(
            (e) => e.spellId === ONYXIA_SCALE_CLOAK_SPELL_ID && e.expiresAt > t,
          ) || dotTgt.buffActive.has(ONYXIA_SCALE_CLOAK_SPELL_ID);
          if (!shadowFlameAppliesDot(hasCloak)) {
            continue;
          }
        }
        // Recasting a DoT REFRESHES the running instance rather than stacking a second copy: one per
        // caster, spell and target. A stackAmount above 1 may stack; absent is refresh-only.
        const dur = durFor(eff.durationMs);
        let dmin = eff.min + ppc, dmax = eff.max + ppc;
        dmin = applyOwnedSpellMod(src, spell, SPELLMOD_DOT, dmin);
        dmax = applyOwnedSpellMod(src, spell, SPELLMOD_DOT, dmax);
        dmin = applyOwnedSpellMod(src, spell, SPELLMOD_ALL_EFFECTS, dmin);
        dmax = applyOwnedSpellMod(src, spell, SPELLMOD_ALL_EFFECTS, dmax);
        if (src.castEffectPct) { const f2 = 1 + src.castEffectPct / 100; dmin *= f2; dmax *= f2; } // Amplify Curse
        dmin = applySpellDamageBonusIfPresent(dmin, spell, eff.effectSlot ?? 0, {
          spellPower: src.spec.spellPower,
          spellDamageBySchool: src.spec.spellDamageBySchool,
          school: eff.school,
          attackPower: src.attackPower,
          damagePct: src.damagePctBySchool[eff.school] ?? 0,
        });
        dmax = applySpellDamageBonusIfPresent(dmax, spell, eff.effectSlot ?? 0, {
          spellPower: src.spec.spellPower,
          spellDamageBySchool: src.spec.spellDamageBySchool,
          school: eff.school,
          attackPower: src.attackPower,
          damagePct: src.damagePctBySchool[eff.school] ?? 0,
        });
        const ignoreCasterModifiers = hasAttrEx3(spell, SPELL_ATTR_EX3.IGNORE_CASTER_MODIFIERS);
        const dmgPct = src.damagePctBySchool[eff.school] ?? 0;
        const usedCoeffBonus = !!(spell.effectBonusCoefficient?.some((c) => (c ?? 0) > 0)
          || spell.effectBonusCoefficientFromAP?.some((c) => (c ?? 0) > 0));
        if (!ignoreCasterModifiers && dmgPct && !usedCoeffBonus) {
          dmin = Math.round(dmin * (1 + dmgPct / 100));
          dmax = Math.round(dmax * (1 + dmgPct / 100));
        } else {
          dmin = Math.round(dmin);
          dmax = Math.round(dmax);
        }
        const binary = resolveSpellBinary(spell);
        const liveDot = ctx.effectsOn(dotTgt.side).find(
          (e) => e.kind === 'dot' && e.spellId === spell.id && e.source === src.side,
        );
        const plan = planAuraApply(
          liveDot
            ? [{ spellId: liveDot.spellId, source: liveDot.source, target: liveDot.target, kind: 'dot', stacks: liveDot.stacks, charges: liveDot.charges }]
            : [],
          { spellId: spell.id, source: src.side, target: dotTgt.side, kind: 'dot' },
          {
            stackAmount: spell.stackAmount,
            procCharges: spell.procCharges,
            matchAnyCaster: hasAttrEx3(spell, SPELL_ATTR_EX3.DOT_STACKING_RULE) ? false : undefined,
          },
        );
        // PERIODIC_LEECH transfers heal = dealt × EffectMultipleValue; HEALTH_FUNNEL is the reverse,
        // damaging the caster to heal the aura target. Cite: SpellAuras.cpp PeriodicTick :4645.
        const leechMultiple =
          typeof eff.leechMultiple === 'number' && eff.leechMultiple > 0
            ? eff.leechMultiple
            : undefined;
        const healthFunnel = !!eff.healthFunnel;
        // durationMs 0 = until-cancelled channel (no DurationIndex) → fight-long like buffs.
        // Cite: applySpell buff branch expAt; Blood Funnel 24617 has no durationIndex.
        const expAt = dur > 0 ? t + dur : Number.POSITIVE_INFINITY;
        if (plan.action === 'blocked') {
          // no-op
        } else if (plan.action === 'add' || !liveDot) {
          effects.push({
            kind: 'dot', source: src.side, target: dotTgt.side, spellId: spell.id, name: spell.name,
            school: eff.school, min: dmin, max: dmax, nextTickAt: t + eff.tickMs, tickMs: eff.tickMs,
            expiresAt: expAt, binary, stacks: plan.stacks, charges: plan.charges,
            // Prefer baked flag; isDrainSoulSpell also covers twin name fallback.
            grantsSoulShardOnKill: isDrainSoulSpell(spell) || undefined,
            // Family flags for Pyroclasm (Hellfire/RoF) on DoT ticks.
            // Cite: UnitAuraProcHandler.cpp:1355–1362.
            ...(spell.spellFamilyFlags != null ? { spellFamilyFlags: spell.spellFamilyFlags } : {}),
            ...(leechMultiple != null ? { leechMultiple } : {}),
            ...(healthFunnel ? { healthFunnel: true } : {}),
          });
          // Health funnel damages the caster; aura row still shows on the heal target.
          // Self-cost dots (Hellfire) show on the caster.
          push({ t, kind: 'aura', actor: healthFunnel || selfDot ? src.side : dotTgt.side, name: spell.name, applied: true, spellId: spell.id });
        } else {
          liveDot.school = eff.school;
          liveDot.min = dmin; liveDot.max = dmax;
          liveDot.tickMs = eff.tickMs; liveDot.nextTickAt = t + eff.tickMs; liveDot.expiresAt = expAt;
          liveDot.binary = binary;
          touchEffect(liveDot);
          liveDot.stacks = plan.stacks;
          if (plan.charges != null) liveDot.charges = plan.charges;
          if (isDrainSoulSpell(spell)) liveDot.grantsSoulShardOnKill = true;
          if (spell.spellFamilyFlags != null) liveDot.spellFamilyFlags = spell.spellFamilyFlags;
          if (leechMultiple != null) liveDot.leechMultiple = leechMultiple;
          else delete liveDot.leechMultiple;
          if (healthFunnel) liveDot.healthFunnel = true;
          else delete liveDot.healthFunnel;
        }
        finisherHit = true;
      } else if (eff.kind === 'root') {
        // Hostile root never lands on the caster / same team (self-centered Nova primary).
        if (isEnemySide(src.side) === isEnemySide(tgt.side)) continue;
        if (isTotemCreatureType(tgt.creatureType) || isTotemSide(tgt.side)) {
          push({ t, kind: 'cc_immune', target: tgt.side, control: 'root', name: spell.name });
          continue;
        }
        // Free Action / template root immunity. Cite: Unit.cpp IsImmuneToSpellEffect.
        const rootMech = (eff as { mechanic?: string }).mechanic || spell.mechanic || 'root';
        if (isImmuneToMechanic(tgt.immunity, rootMech, {
          schoolImmuneMask: tgt.spec.schoolImmuneMask,
          mechanicImmuneMask: tgt.spec.mechanicImmuneMask,
        })) {
          ctx.consumeChargedImmunityOnMechanicBlock?.(tgt, rootMech);
          push({ t, kind: 'cc_immune', target: tgt.side, control: 'root', name: spell.name });
          continue;
        }
        // Hostile root shares the spell's hit roll with damage (binary Frost Nova, etc.).
        // Cite: Spell.cpp:1211–1212; KI-805 miss must not root.
        if ((hostileSpell || (bypassPositiveAutoHit && tgt.side !== src.side)) && !rollHostileLand(spell.school)) continue;
        const dur = durFor(eff.durationMs);
        // Entangling Roots holds one target per druid. Cite: Unit.cpp:4774-4830; SpellMgr.h:2230.
        ctx.purgeTrackedAuraTargets?.(src, tgt, spell);
        tgt.rootedUntil = Math.max(tgt.rootedUntil, t + dur);
        // The school is the SPELL's, not the effect's: root effects bake without one, and the frozen
        // aura state and the immunity purge both read the spell's mask. Heartbeat is on the holder.
        const heartbeat = heartbeatSlotOf(spell) === 'root'
          ? armHeartbeatResist({
            now: t,
            missPlusResistPercent: landMissPlusResistPct ?? 0,
            originalDurationMs: dur,
            drLevel: drStepOf(tgt, rootMech as Mechanic, t),
          })
          : null;
        effects.push({
          kind: 'root', source: src.side, target: tgt.side, spellId: spell.id, name: spell.name,
          school: spell.school, expiresAt: t + dur, appliedAt: t,
          ...(heartbeat ? { heartbeat } : {}),
        });
        push({ t, kind: 'root', target: tgt.side, applied: true, spellId: spell.id, name: spell.name });
        finisherHit = true;
      } else if (eff.kind === 'cc') {
        // Self and friendly lockouts that must never land on the foe, skipping resist and DR. Ice Block
        // is silence only, and Divine Intervention's stun locks the protected member.
        if (isTotemCreatureType(tgt.creatureType) || isTotemSide(tgt.side)) {
          push({ t, kind: 'cc_immune', target: tgt.side, control: eff.control, name: spell.name });
          continue;
        }
        if (isIceBlockSpell(spell) || isDivineInterventionSpell(spell)) {
          const durMs = durFor(eff.durationMs);
          if (durMs > 0 && (isDivineInterventionSpell(spell) || eff.control === 'silence')) {
            applyControl(src, src, spell, eff, durMs);
          }
          finisherHit = true;
          continue;
        }
        // Self-only DBC targeting must never land CC on a foe, while a true self-cast still lands.
        // Cite: SpellTargetDefines.h TARGET_UNIT_CASTER=1; boss_jandice_barov.cpp:52-55; KI-1017.
        if (isSelfTargetedSpell(spell) && tgt !== src) continue;
        // Hostile CC never lands on an ally. Self-stun is allowed (same cite).
        if (tgt !== src && isEnemySide(src.side) === isEnemySide(tgt.side)) continue;
        // Immunity first, with no rng. Hostile CC shares the cast's one SpellHitResult — school plus
        // mechanic resist — rather than rolling a second chance of its own.
        if (ccImmune(tgt, eff.mechanic, eff.onlyTypes)) { push({ t, kind: 'cc_immune', target: tgt.side, control: eff.control, name: spell.name }); continue; }
        // Aura mechanic immunity (Free Action / Divine Shield class) — compose with template.
        // Cite: GAP.md G2 step 3; Unit.cpp IsImmuneToSpellEffect.
        if (isImmuneToMechanic(tgt.immunity, eff.mechanic, {
          schoolImmuneMask: tgt.spec.schoolImmuneMask,
          mechanicImmuneMask: tgt.spec.mechanicImmuneMask,
        })) {
          ctx.consumeChargedImmunityOnMechanicBlock?.(tgt, eff.mechanic);
          push({ t, kind: 'cc_immune', target: tgt.side, control: eff.control, name: spell.name });
          continue;
        }
        // Creature-type targeting is gated whole-spell at the top now. The same control and mechanic
        // landing twice this cast must not re-roll resist or re-apply DR; breakOnDamage may upgrade.
        const ccLandKey = `${tgt.side}|${eff.control}|${eff.mechanic}`;
        if (appliedCcThisCast.has(ccLandKey)) {
          if (eff.breakOnDamage === true) {
            upgradeBreakOnDamageMirror(ctx.effectsOn(tgt.side), tgt.side, spell.id, eff.control, eff.mechanic);
          }
          continue;
        }
        if ((hostileSpell || bypassPositiveAutoHit) && tgt.side !== src.side
          && !rollHostileLand(eff.school ?? spell.school, eff.control)) continue;
        const scaled = durFor(eff.durationMs);
        const drLevelBefore = drStepOf(tgt, eff.mechanic, t);
        const durMs = applyDr(src, tgt, eff.mechanic, scaled);
        if (durMs <= 0) { push({ t, kind: 'cc_immune', target: tgt.side, control: eff.control, name: spell.name }); continue; }
        // HEARTBEAT_RESIST: arm the early-break clock off the ORIGINAL duration, before DR shortened
        // it, and off the die chance this cast already rolled. Cite: Spell.cpp:1483-1489.
        const heartbeat = heartbeatSlotOf(spell) === 'cc'
          ? armHeartbeatResist({
            now: t,
            missPlusResistPercent: landMissPlusResistPct ?? 0,
            originalDurationMs: scaled,
            drLevel: drLevelBefore,
          })
          : null;
        applyControl(src, tgt, spell, eff, durMs, heartbeat);
        appliedCcThisCast.add(ccLandKey);
        // Sap strips MOD_STEALTH on hit (SUPPRESS_TARGET_PROCS would otherwise skip).
        // Cite: Rogue.cpp:96–99 SapRogue OnHit.
        if (SAP_SPELL_IDS.has(spell.id | 0) && tgt.stealthed) {
          breakStealth(tgt, 'sap');
        }
        // Banish also grants school-immunity + isolated (MECHANIC_BANISH). Driven by the baked
        // cc mechanic (Wave C5: Banish ranks bake mechanic:'banish'), not a spell-id allowlist.
        if (eff.mechanic === 'banish') {
          grantImmunityAura(tgt, {
            spellId: spell.id,
            auraType: AURA_TYPE.SCHOOL_IMMUNITY,
            schoolMask: SPELL_SCHOOL_MASK_ALL,
            spellMechanic: MECHANIC.BANISH,
            positive: false,
            immunityPurgesEffect: true,
            durationMs: durMs,
          }, t + durMs, spell.name, src.side);
        }
        finisherHit = true;
      } else if (eff.kind === 'interrupt_cast') {
        // INTERRUPT_CAST (68): cancel an interruptible cast and lock out its school for the interrupt
        // spell's own duration. No cast, or a non-interruptible one, means no lockout.
        const releaseInterruptClaim = (): void => {
          if (ctx.interruptClaim.get(tgt.side) === src.side) ctx.interruptClaim.delete(tgt.side);
        };
        // EffectInterruptCast walks every non-melee slot, so a CHANNEL is a legal kick target too —
        // reading only the hardcast slot made Mind Flay and every boss channel immune to Kick.
        const channelHit = tgt.castingSpell == null && tgt.channeling != null && t < tgt.channeling.endsAt;
        const casting = tgt.castingSpell ?? (channelHit ? tgt.channeling!.spell : null);
        // MECHANIC_INTERRUPT immunity, per effect: the strike still lands its damage and the kick just
        // does not stick. Say so only when a cast was there to lose, or every kick prints a line.
        if (isImmuneToMechanicId(tgt.immunity, interruptEffectMechanicId(spell), {
          schoolImmuneMask: tgt.spec.schoolImmuneMask,
          mechanicImmuneMask: tgt.spec.mechanicImmuneMask,
        })) {
          releaseInterruptClaim();
          if (casting && isCastInterruptible(casting, true)) {
            push({ t, kind: 'flavor', text: `${tgt.spec.name} is immune to interrupt.` });
          }
          continue;
        }
        if (!casting || !isCastInterruptible(casting, true)) {
          releaseInterruptClaim();
          continue;
        }
        // Magic pure-interrupt (Counterspell): land/resist roll. Mixed damage+interrupt kits
        // (Kick/Earth Shock) apply interrupt when the ability resolves — damage has its own roll.
        const onlyInterrupt = spell.effects.every(
          (e) => e.kind === 'interrupt_cast' || e.kind === 'trigger_spell',
        );
        if (onlyInterrupt) {
          const binary = resolveSpellBinary(spell);
          const dmgClass = typeof spell.dmgClass === 'number' ? spell.dmgClass : SPELL_DAMAGE_CLASS.MAGIC;
          if (isResistableDmgClass(dmgClass) && dmgClass === SPELL_DAMAGE_CLASS.MAGIC) {
            const land = spellDamageLandChance({
              atkLevel: src.spec.level,
              defLevel: tgt.spec.level,
              school: spell.school,
              resistance: tgt.resistances[spell.school] ?? 0,
              binary,
              resistable: true,
              spellHitBonusPercent: src.spellHitBonusPercent,
              attackerSpellHitPercent: tgt.attackerSpellHitBySchool[spell.school] ?? 0,
              aoeAvoidancePercent: spell.aoe ? (tgt.aoeAvoidancePercent ?? 0) : 0,
              attackerPlayerControlled: src.side === 'player' || src.side === 'pet' || isAllySide(src.side),
              victimIsNpc: isEnemySide(tgt.side),
              victimPlayerControlled: tgt.side === 'player' || tgt.side === 'pet' || isAllySide(tgt.side),
            });
            if (!rng.chance(land)) {
              push({
                t, kind: 'spell_hit', actor: src.side, target: tgt.side, spellId: spell.id, name: spell.name,
                result: 'miss', amount: 0, school: spell.school,
              });
              releaseInterruptClaim();
              continue;
            }
          }
        }
        const lockSchool = casting.school;
        const lockoutMs = Math.max(0, eff.lockoutMs | 0);
        const interruptedId = casting.id;
        const interruptedName = casting.name;
        if (channelHit) {
          // Quiet: the interrupt + flavor rows below already name the spell and the lockout.
          interruptChannel(tgt, channelInterruptCtx(ctx), { quiet: true });
        } else {
          tgt.castingSpell = null;
          tgt.castStartedAt = 0;
          tgt.castFinishAt = 0;
          // Kicked before Spell::cast() ran — TakePower never happened, so the held cost is dropped.
          tgt.castCost = 0;
          tgt.castCostPower = undefined;
        }
        if (lockoutMs > 0) {
          applySchoolLockout(tgt.schoolLockoutUntil, lockSchool, t + lockoutMs);
        }
        releaseInterruptClaim();
        push({
          t,
          kind: 'interrupt',
          actor: src.side,
          target: tgt.side,
          school: lockSchool,
          lockoutMs,
          name: spell.name,
          interruptedSpellId: interruptedId,
          interruptedName,
        });
        finisherHit = true;
        // Improved Kick/CS/SB: talent procs fire on successful interrupt ability hit.
        // Only fire here when damage did not already trigger procs (mixed kits).
        if (onlyInterrupt) {
          triggerProcs(src, tgt, false, 'spell', spell);
          rollGearProcs(src, tgt, 'hit', spell);
        }
      } else if (eff.kind === 'trigger_spell') {
        // TRIGGER_SPELL (64): apply the triggered spell's effects, looking in the caster's kit, then
        // the target's, then the global store — a payload in no kit is real.
        const trig =
          src.spec.spells.find((s) => s.id === eff.spellId)
          ?? tgt.spec.spells.find((s) => s.id === eff.spellId)
          ?? ctx.spellOf?.(eff.spellId);
        if (trig) {
          // EffectDummy 13489: unitTarget->CastSpell(unitTarget, 14744).
          // Cite: SpellEffects.cpp:497-502; boss_ambassador_flamelash.cpp:76.
          if ((spell.id | 0) === 13489) {
            applySpell(tgt, tgt, trig);
            finisherHit = true;
          } else if ((spell.id | 0) === ELEMENTAL_SHIELD_DUMMY_SPELL_ID) {
            // m_caster->CastSpell(m_caster, elemshields[urand(0,4)], TRIGGERED).
            // Cite: SpellEffects.cpp:827; never the fight target.
            applyProc(src, src, trig);
            finisherHit = true;
          } else {
            // KI-175: DI parent triggers protect aura 19753 onto the friendly protect target
            // (solo → caster), never the hostile fight target.
            const procTgt = isDivineInterventionCast(spell) ? src : tgt;
            applyProc(src, procTgt, trig);
            finisherHit = true;
          }
        }
      } else if (eff.kind === 'cleanse') {
        // Self-cast control-breaker: strip the listed controls from the CASTER and (with immuneMs)
        // grant brief immunity to their categories. ControlKind names double as the DR-category key.
        for (const c of eff.controls) {
          breakControl(src, c);
          // Longest immunity wins. An unconditional set let a WEAKER cleanse shorten an immunity
          // already running, and a shorter re-application never shortens an aura in the core either.
          if (eff.immuneMs) {
            const until = t + eff.immuneMs;
            const cur = src.ccImmuneUntil.get(c) ?? 0;
            if (until > cur) src.ccImmuneUntil.set(c, until);
          }
        }
        push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true, spellId: spell.id });
      } else if (eff.kind === 'damage_shield') {
        // Thorns / LShield-style. Cite: DAMAGE_SHIELD / PROC_TRIGGER_DAMAGE / LShield override.
        const dur = durFor(eff.durationMs);
        const charges = (eff.charges ?? spell.procCharges ?? 0) > 0
          ? (eff.charges ?? spell.procCharges!)
          : undefined;
        const cd = eff.cooldownMs ?? spell.spellProcEvent?.cooldownMs;
        // WHO wears it: a self row is the caster, and a row naming a friendly wears on the unit the
        // cast SELECTED. An UNAIMED cast still keeps the caster — triage burned 44,595 raid mana.
        const shieldFan = (): Fighter[] => filterPartyFanByRadius(
          src, friendlyPoolOf(src), spell, 'party', distanceBetween,
        ).filter((u) => !dead(u));
        // TARGET_UNIT_PARTY may not be the caster, so an unaimed cast takes a party member — the
        // master first, as the core does. Cite: Spell.cpp:2325-2330 (fire shield from imp).
        const excludesCaster = auraHolderExcludesCaster(spell);
        let shieldAim = auraHolderIsCastTarget(spell) ? aimedFriendlyOf(src) : null;
        if (excludesCaster && (shieldAim == null || shieldAim === src)) {
          const others = friendlyPoolOf(src).filter((u) => u !== src && !dead(u) && isPartyFanBody(u));
          shieldAim = (src === pet && player && others.includes(player) ? player : others[0]) ?? null;
        }
        const shieldHolders: Fighter[] = auraRadiatesToParty(spell)
          // APPLY_AREA_AURA_PARTY (Retribution Aura) radiates to the subgroup, never the caster
          // alone. Cite: SpellEffects.cpp EffectApplyAreaAura; SpellAuras.cpp AreaAura::Update.
          ? shieldFan()
          : excludesCaster
            ? (shieldAim ? [shieldAim] : [])
            : shieldAim == null
              ? [src]
              : wantsRaidAndClass(spell)
                ? filterSameClass(shieldAim, shieldFan())
                : [shieldAim];
        // durationMs 0 is permanent-until-cancelled, the same idiom the buff branch uses. Expiring on
        // the cast tick wiped buffActive, so the rotation recast it every GCD — 20 casts in 30 s.
        const shieldExpAt = dur > 0 ? t + dur : Number.POSITIVE_INFINITY;
        for (const holder of shieldHolders) {
          const live = ctx.effectsOn(holder.side).find(
            (e) => e.kind === 'damage_shield' && e.spellId === spell.id,
          );
          if (live) {
            live.expiresAt = shieldExpAt;
            if (charges != null) live.charges = charges;
            live.min = eff.min;
            live.max = eff.max;
            live.school = eff.school;
            live.cooldownMs = cd && cd > 0 ? cd : live.cooldownMs;
            live.nextProcAt = t;
            ctx.setEffectSource(live, src.side);
            if (spell.exclusionGroup != null) live.exclusionGroup = spell.exclusionGroup;
            touchEffect(live);
          } else {
            effects.push({
              kind: 'damage_shield',
              source: src.side,
              target: holder.side,
              spellId: spell.id,
              name: spell.name,
              // Mirrored so a sibling paladin aura can strip Retribution with no store lookup.
              ...(spell.exclusionGroup != null ? { exclusionGroup: spell.exclusionGroup } : {}),
              school: eff.school,
              min: eff.min,
              max: eff.max,
              expiresAt: shieldExpAt,
              charges,
              nextProcAt: 0,
              cooldownMs: cd && cd > 0 ? cd : undefined,
            });
          }
          holder.buffActive.add(spell.id);
          push({ t, kind: 'aura', actor: holder.side, name: spell.name, applied: true, spellId: spell.id });
        }
      } else if (eff.kind === 'proc_trigger_spell') {
        // PROC_TRIGGER_SPELL (42) on hit, or PERIODIC_TRIGGER_SPELL (23) when there is a tick. A
        // periodic channel fires at the foe every amplitude; take-hit and deal-melee procs route apart.
        const dur = durFor(eff.durationMs);
        const charges = (eff.charges ?? spell.procCharges ?? 0) > 0
          ? (eff.charges ?? spell.procCharges!)
          : undefined;
        const cd = eff.cooldownMs ?? spell.spellProcEvent?.cooldownMs;
        const tickMs = eff.tickMs && eff.tickMs > 0 ? eff.tickMs : undefined;
        // Proc match fields from bake — never invent ppm/chance.
        const procFlags = spell.procFlags ?? spell.spellProcEvent?.procFlags;
        const procPpm = spell.spellProcEvent?.ppmRate ?? null;
        let procChance: number | null = null;
        if (spell.spellProcEvent?.customChance != null && spell.spellProcEvent.customChance > 0) {
          const c = spell.spellProcEvent.customChance;
          procChance = c > 1 ? Math.min(1, c / 100) : Math.min(1, c);
        }
        // A scripted roll on the aura's own amount beats spell_proc_event: Improved Mend Pet is chance
        // 101, always, while the class script rolls 15% or 50%.
        if (eff.procChancePct != null && eff.procChancePct > 0) {
          procChance = Math.min(1, eff.procChancePct / 100);
        }
        // Whose aura is this? A channel holder stays on the caster; a periodic debuff names the victim.
        // 92 of 445 aura-23 slots name a non-caster and every one was landing on the caster.
        const holder = eff.auraOnTarget === true && tgt !== src ? tgt : src;
        // Hunter trap SLOT1: one GO — deactivate the previous arm. Snapshot yards at
        // caster feet. Cite: SpellEffects.cpp EffectSummonObject :4746–4764.
        const trapTrigger = isHunterTrapTriggerSpellId(eff.triggerSpellId);
        if (trapTrigger) {
          const mine = ctx.effectsOn(holder.side);
          for (let i = mine.length - 1; i >= 0; i--) {
            const old = mine[i]!;
            if (old.kind !== 'proc_trigger_spell') continue;
            if (!old.triggerSpellId || !isHunterTrapTriggerSpellId(old.triggerSpellId)) continue;
            holder.buffActive.delete(old.spellId);
            const idx = effects.lastIndexOf(old);
            if (idx >= 0) effects.splice(idx, 1);
            push({ t, kind: 'aura', actor: holder.side, name: old.name, applied: false });
          }
        }
        const live = ctx.effectsOn(holder.side).find(
          (e) => e.kind === 'proc_trigger_spell' && e.spellId === spell.id
            // A spell can carry both a real proc and a removal holder — they are separate rows.
            && !!e.onRemove === !!eff.onRemove,
        );
        if (live) {
          live.expiresAt = t + (dur > 0 ? dur : Number.POSITIVE_INFINITY);
          live.triggerSpellId = eff.triggerSpellId;
          if (charges != null) live.charges = charges;
          live.cooldownMs = cd && cd > 0 ? cd : live.cooldownMs;
          live.procFlags = procFlags;
          live.procPpm = procPpm;
          live.procChance = procChance;
          if (tickMs) {
            live.tickMs = tickMs;
            live.nextTickAt = t + tickMs;
            live.nextProcAt = undefined;
            live.tickChance = eff.tickChance;
          } else {
            live.tickMs = undefined;
            live.nextTickAt = undefined;
            live.nextProcAt = t;
          }
          touchEffect(live);
        } else {
          effects.push({
            kind: 'proc_trigger_spell',
            source: src.side,
            target: holder.side,
            spellId: spell.id,
            name: spell.name,
            triggerSpellId: eff.triggerSpellId,
            expiresAt: t + (dur > 0 ? dur : Number.POSITIVE_INFINITY),
            charges,
            nextProcAt: tickMs ? undefined : 0,
            cooldownMs: cd && cd > 0 ? cd : undefined,
            tickMs,
            nextTickAt: tickMs ? t + tickMs : undefined,
            tickChance: tickMs ? eff.tickChance : undefined,
            procFlags,
            procPpm,
            procChance,
            ...(eff.onRemove ? { onRemove: eff.onRemove } : {}),
            ...(trapTrigger && ctx.posOf?.(holder.side)
              ? { trapPosYd: { ...ctx.posOf(holder.side)! } }
              : {}),
          });
        }
        if (trapTrigger && live) {
          const p = ctx.posOf?.(holder.side);
          if (p) live.trapPosYd = { ...p };
        }
        // A removal-body holder is invisible: the aura it belongs to (Wyvern Sting's CC, the
        // injection's own row) already owns the icon, so adding a second one double-logs it.
        if (eff.onRemove) continue;
        holder.buffActive.add(spell.id);
        // Trap SLOT1 is a placed GO, not a unit aura chip. Keep buffActive so rotation
        // gates still see the arm; the floor chip is trapsView(). Cite: EffectSummonObject.
        if (trapTrigger) {
          push({ t, kind: 'flavor', text: `${src.spec.name} places ${spell.name}.` });
        } else {
          push({ t, kind: 'aura', actor: holder.side, name: spell.name, applied: true, spellId: spell.id });
        }
      } else if (eff.kind === 'resist') {
        // MOD_RESISTANCE (22) magic schools — Mage Armor is resist-only, with no buff row. The duration
        // comes from durationIndex, and a hostile minus-resist lands on the foe, not the caster.
        if ((eff.amount ?? 0) === 0 && !eff.pct) continue;
        const baseDur = durMs(spell.durationIndex) ?? 0;
        const dur = durFor(baseDur);
        const expAt = dur > 0 ? t + dur : Number.POSITIVE_INFINITY;
        const school = eff.school;
        // Prefer baked/interpreter `hostile`; legacy: amount < 0 = debuff (CoE −45 resist).
        // Positive self resists (Ice Armor frost) stay on caster.
        const resistHostile = isHostileBuffEffect(eff, eff.amount || eff.pct || 0);
        const resistTgt: Fighter | null = resistHostile
          ? (tgt.side === src.side
            ? (livingHostilesFor(src).find((h) => h.side !== src.side) ?? null)
            : tgt)
          : src;
        if (!resistTgt) continue;
        if (
          totemRefusesNegativeAuraApply(
            resistTgt.creatureType ?? resistTgt.spec.creatureType,
            resistHostile,
          )
          || (resistHostile && isTotemSide(resistTgt.side))
        ) {
          continue;
        }
        // Drop exclusive siblings on the actual resist target (Frost/Ice Armor group 13 self; curse
        // group 12 for CoE ranks; Prayer of Shadow Protection, which no group covers).
        {
          const group = spell.exclusionGroup;
          if (strongerSiblingOn(resistTgt.side)) continue;
          if ((group != null && group !== 0) || stackIdent != null) {
            const mine = ctx.effectsOn(resistTgt.side);
            for (let i = mine.length - 1; i >= 0; i--) {
              const e = mine[i]!;
              if (e.spellId === spell.id) continue;
              if (!isStackSibling(e, group)) continue;
              if (e.kind === 'buff') {
                reverseBuffMod(resistTgt, e.mod, e.amount ?? 0, e.school, {
                  creatureTypeMask: e.creatureTypeMask,
                  schoolMask: e.schoolMask,
                });
              } else if (e.kind === 'resist' && e.school) {
                resistTgt.resistances[e.school] = (resistTgt.resistances[e.school] ?? 0) - (e.amount ?? 0);
              } else {
                continue;
              }
              resistTgt.buffActive.delete(e.spellId);
              const idx = effects.lastIndexOf(e);
              if (idx >= 0) effects.splice(idx, 1);
              push({ t, kind: 'aura', actor: resistTgt.side, name: e.name, applied: false });
            }
          }
        }
        const live = ctx.effectsOn(resistTgt.side).find(
          (e) =>
            e.kind === 'resist'
            && e.spellId === spell.id
            && e.school === school,
        );
        // BASE_PCT (aura 142 magic mask) resolves against the target's own resistance, minus what
        // this same aura already took, so a refresh does not compound. Cite: SpellAuras.cpp:3432-3435.
        const amount = eff.pct != null
          ? Math.round(((resistTgt.resistances[school] ?? 0) - (live?.amount ?? 0)) * eff.pct / 100)
          : eff.amount;
        if (live) {
          live.expiresAt = expAt;
          if ((live.amount ?? 0) !== amount) {
            resistTgt.resistances[school] = (resistTgt.resistances[school] ?? 0) - (live.amount ?? 0) + amount;
            live.amount = amount;
          }
          if (spell.exclusionGroup != null) live.exclusionGroup = spell.exclusionGroup;
          touchEffect(live);
        } else {
          resistTgt.resistances[school] = (resistTgt.resistances[school] ?? 0) + amount;
          effects.push({
            kind: 'resist',
            source: src.side,
            target: resistTgt.side,
            spellId: spell.id,
            name: spell.name,
            school,
            amount,
            expiresAt: expAt,
            exclusionGroup: spell.exclusionGroup,
            ...stackFields,
          });
        }
        resistTgt.buffActive.add(spell.id);
        // One applied event per school row (Ice Armor frost resist is a single row).
        push({ t, kind: 'aura', actor: resistTgt.side, name: spell.name, applied: true, spellId: spell.id });
        if (resistHostile && resistTgt.side !== src.side && !hostileResistHitDone) {
          hostileResistHitDone = true;
          push({
            t, kind: 'spell_hit', actor: src.side, target: resistTgt.side,
            spellId: spell.id, name: spell.name, result: 'hit', amount: 0, school: spell.school,
          });
        }
        finisherHit = true;
      } else if (eff.kind === 'buff') {
        // Amplify Curse scales the empowered curse's debuff magnitude (Curse of Weakness −AP, etc).
        const baseAmount = src.castEffectPct
          ? Math.round((eff.amount + ppc) * (1 + src.castEffectPct / 100))
          : eff.amount + ppc;
        const dur = durFor(eff.durationMs);
        // Friendly buffs route from raw implicit targets. Baked applyTo is the fallback.
        const buffAudience = spellBuffApplyToFromRaw(spell) ?? eff.applyTo;
        const friendPool = filterPartyFanByRadius(
          src,
          friendlyPoolOf(src),
          spell,
          buffAudience,
          distanceBetween,
        );
        const friendTriage = lowestHpFriendlyOf(src) ?? src;
        // TARGET_UNIT_FRIEND is the caster's SELECTED unit, and an untargeted keep-up selects the
        // caster: routing it through heal triage burned 44,595 raid mana in 15 s. The PIN comes first.
        const friendBuffTarget = (kind: string): Fighter =>
          (kind === 'buff' || kind === 'resist'
            ? (aimedFriendlyOf(src) ?? (!isEnemySide(tgt.side) ? tgt : src))
            : friendTriage);
        const buffTargets: Fighter[] = isHostileBuffEffect(eff, baseAmount)
          ? (tgt.side === src.side
            // Self-centered hostile AOE: SpellRadius when known. On the endless floor a missing radius
            // means free-fire only — failing open flat-threatened every passive in the 48 yd stream.
            ? (() => {
              const r = spell.radiusYd;
              const all = livingHostilesFor(src).filter((h) => h.side !== src.side);
              if (r != null && r > 0) {
                return all.filter((h) => {
                  const d = distanceBetween(src, h);
                  // Geometry live: missing dist is not "in range".
                  if (cfg.endless && d == null) return false;
                  return d == null || d <= r;
                });
              }
              if (cfg.endless) {
                const combat =
                  typeof ctx.livingCombatEnemies === 'function'
                    ? ctx.livingCombatEnemies()
                    : all;
                return combat.filter((h) => h.side !== src.side);
              }
              return all;
            })()
            : [tgt])
          : buffAudience === 'pet' ? (pet && !dead(pet) ? [pet] : [])
            : buffAudience === 'friendly' ? [friendBuffTarget(eff.kind)]
              : buffAudience === 'party'
                ? (wantsRaidAndClass(spell)
                  // The PIN names the class the fan follows, as the shield branch does at :1876.
                  // Reading `src` fanned an ally-aimed Greater over the CASTER's class.
                  ? filterSameClass(
                    aimedFriendlyOf(src) ?? (!isEnemySide(tgt.side) ? tgt : src), friendPool,
                  )
                  : friendPool)
                : [src];
        // Applying one aura drops the target's other auras in the same exclusion group (Aspects, Mage
        // Armors, curses) or multirank family (Gift of the Wild), resist-only rows included.
        const dropExclusionGroupSiblings = (buffTgt: Fighter): boolean => {
          const group = spell.exclusionGroup;
          if ((group == null || group === 0) && stackIdent == null) return false;
          if (strongerSiblingOn(buffTgt.side)) return true;
          const mine = ctx.effectsOn(buffTgt.side);
          for (let i = mine.length - 1; i >= 0; i--) {
            const e = mine[i]!;
            if (e.spellId === spell.id) continue;
            if (!isStackSibling(e, group)) continue;
            if (e.kind === 'buff') {
              reverseBuffMod(buffTgt, e.mod, e.amount ?? 0, e.school, {
                creatureTypeMask: e.creatureTypeMask,
                schoolMask: e.schoolMask,
              });
            } else if (e.kind === 'resist' && e.school) {
              buffTgt.resistances[e.school] = (buffTgt.resistances[e.school] ?? 0) - (e.amount ?? 0);
            } else {
              continue;
            }
            buffTgt.buffActive.delete(e.spellId);
            const idx = effects.lastIndexOf(e);
            if (idx >= 0) effects.splice(idx, 1);
            push({ t, kind: 'aura', actor: buffTgt.side, name: e.name, applied: false });
          }
          return false;
        };
        // One-target apply, hoisted so the area-aura maintain pass can RE-apply it when an ally walks
        // back into radius. Idempotent: an existing row refreshes duration and never re-adds flat mods.
        const applyBuffToTarget = (buffTgt: Fighter): void => {
          // Totem.cpp:282-287: mixed-hit school damage still lands; the APPLY_AURA index does not.
          const hostileBuff = isHostileBuffEffect(eff, baseAmount);
          if (
            totemRefusesNegativeAuraApply(
              buffTgt.creatureType ?? buffTgt.spec.creatureType,
              hostileBuff,
            )
            || (hostileBuff && isTotemSide(buffTgt.side))
          ) return;
          // A debuff rider on a hostile cast shares the spell's one SpellHitResult, so a resisted
          // Thunder Clap slows nothing. Self and ally riders on the same cast are untouched.
          if ((hostileSpell || bypassPositiveAutoHit) && buffTgt === tgt && tgt.side !== src.side
            && !rollHostileLand(eff.school ?? spell.school)) return;
          let amount = baseAmount;
          let mod: BuffMod | undefined = eff.mod;
          let school = eff.school;
          // Percent-of-current mods become a flat delta at apply, so expiry reverses the exact amount
          // rather than compounding. Signed, not floored at 1 — hostile auras go negative.
          if (eff.mod === 'max_health_pct') {
            amount = signedAtLeastOne((buffTgt.spec.maxHealth * amount) / 100);
            mod = 'max_health';
          } else if (eff.mod === 'max_mana_pct') {
            const baseMana = buffTgt.spec.powerType === 'mana' ? buffTgt.spec.maxPower : (buffTgt.maxMana ?? 0);
            amount = signedAtLeastOne((baseMana * amount) / 100);
            mod = 'max_mana';
          } else if (eff.mod === 'all_stats_pct') {
            amount = signedAtLeastOne((buffTgt.attackPower * amount) / 100);
            mod = 'attack_power';
            school = undefined;
          } else if (eff.mod === 'attack_power_pct') {
            // AP-only percent (aura 166, Unleashed Rage) — no max-health arm.
            amount = signedAtLeastOne((buffTgt.attackPower * amount) / 100);
            mod = 'attack_power';
            school = undefined;
          } else if (eff.mod === 'stamina_pct') {
            // Per-stat percent (auras 80/137 with a single stat). Stamina's live derivative is
            // max health — Demonic Embrace +15%. Cite: SpellAuras.cpp:3537-3568.
            amount = signedAtLeastOne((buffTgt.spec.maxHealth * amount) / 100);
            mod = 'max_health';
            school = undefined;
          } else if (eff.mod === 'intellect_pct' || eff.mod === 'spirit_pct') {
            // An int or spirit percent becomes a flat delta of that stat, so the whole live cascade
            // lands and reverses exactly. Cite: SpellAuras.cpp:3537-3568 HandleModTotalPercentStat.
            const isInt = eff.mod === 'intellect_pct';
            const stat = (isInt ? buffTgt.spec.intellect : buffTgt.spec.spirit) || 0;
            amount = signedAtLeastOne((stat * amount) / 100);
            mod = isInt ? 'intellect' : 'spirit';
            school = undefined;
          } else if (eff.mod === 'strength_pct' || eff.mod === 'agility_pct') {
            // str/agi's live derivative is attack power (same arm as all_stats_pct).
            amount = signedAtLeastOne((buffTgt.attackPower * amount) / 100);
            mod = 'attack_power';
            school = undefined;
          } else if (eff.mod === 'spell_power_of_spirit_pct') {
            amount = signedAtLeastOne(((buffTgt.spec.spirit || 0) * amount) / 100);
            mod = 'spell_power';
            school = undefined;
          } else if (eff.mod === 'healing_power_of_spirit_pct') {
            amount = signedAtLeastOne(((buffTgt.spec.spirit || 0) * amount) / 100);
            mod = 'healing_done';
            school = undefined;
          }
          if (dropExclusionGroupSiblings(buffTgt)) return;
          // Hunter's Mark is tracked too — aura 68 MOD_STALKED, one marked target per hunter.
          ctx.purgeTrackedAuraTargets?.(src, buffTgt, spell);
          // Match spellId and mod, plus school, so a multi-effect spell registers separate reversible
          // rows. Prefer the same caster, then any caster, then a display-only sheet-baked row.
          const onBuffTgt = ctx.effectsOn(buffTgt.side);
          const liveBuff =
            onBuffTgt.find(
              (e) =>
                e.kind === 'buff'
                && e.spellId === spell.id
                && e.source === src.side
                && e.mod === mod
                && e.school === school,
            )
            ?? (spell.stacksPerCaster === true
              ? undefined
              : onBuffTgt.find(
                (e) =>
                  e.kind === 'buff'
                  && e.spellId === spell.id
                  && e.mod === mod
                  && e.school === school,
              ))
            ?? onBuffTgt.find(
              (e) =>
                e.kind === 'buff'
                && e.spellId === spell.id
                && e.mod == null,
            );
          // durationMs 0 = permanent until cancelled (DurationIndex 21 / -1 in DBC).
          const expAt = dur > 0 ? t + dur : Number.POSITIVE_INFINITY;
          // Sheet-baked OOC carry refreshes only (no re-applyBuffMod). Immunity-first multi-effect
          // (Stoneform) sets buffActive without a combat mod row — still live-apply. Cite: KI-436/789.
          const anyCombatModRow = onBuffTgt.some(
            (e) =>
              e.kind === 'buff'
              && e.spellId === spell.id
              && e.mod != null,
          );
          const hasImmunityRow = onBuffTgt.some(
            (e) =>
              e.kind === 'immunity'
              && e.spellId === spell.id,
          );
          const sheetBaked =
            (!!liveBuff && liveBuff.mod == null)
            || (!liveBuff && buffTgt.buffActive.has(spell.id) && !anyCombatModRow && !hasImmunityRow);
          // plan.action for rider: sheet-baked refresh always "succeeds"; blocked only from stack plan.
          let planAction: 'add' | 'refresh' | 'stack' | 'blocked' = 'refresh';
          if (sheetBaked) {
            if (liveBuff && liveBuff.mod == null) {
              liveBuff.expiresAt = expAt;
              liveBuff.name = spell.name;
              touchEffect(liveBuff);
            } else if (!liveBuff) {
              // Permanent chip had no effect row — materialize a display-only tracker so later
              // multi-effect / recasts hit this refresh path without double-dipping flat mods.
              effects.push({
                kind: 'buff',
                source: src.side,
                target: buffTgt.side,
                spellId: spell.id,
                name: spell.name,
                expiresAt: expAt,
                ...stackFields,
                // No mod/amount — sheet owns the stats; expiry must not reverseBuffMod.
              });
            }
            buffTgt.buffActive.add(spell.id);
            push({ t, kind: 'aura', actor: buffTgt.side, name: spell.name, applied: true, spellId: spell.id });
            if (buffTgt.side !== src.side) {
              push({
                t, kind: 'spell_hit', actor: src.side, target: buffTgt.side,
                spellId: spell.id, name: spell.name, result: 'hit', amount: 0, school: spell.school,
              });
            }
          } else {
            // Same-chain other ranks (rank-1 roots recovered). Live same-id stays in
            // `liveBuff` so the index lookup below still finds it. Cite: Unit.cpp:4988-5028.
            const chainOf = ctx.spellChainOf;
            const identityRows: ActiveEffect[] = [];
            if (chainOf) {
              for (const e of ctx.effectsOn(buffTgt.side)) {
                if (e.spellId === spell.id) continue;
                if (!resolveChainPair(spell.id, e.spellId, chainOf)) continue;
                identityRows.push(e);
              }
            }
            // C++ m_amount is per-tick * stacks (SpellAuras.cpp:389); IsSimilarExistingAuraStronger
            // then divides by GetStackAmount (SpellMgr.h:1589). Live rows store per-stack amount.
            const stackedAmount = (e: { amount?: number; stacks?: number }): number | undefined =>
              e.amount != null ? e.amount * Math.max(1, e.stacks ?? 1) : undefined;
            const plan = planAuraApply(
              [
                ...(liveBuff
                  ? [{ spellId: liveBuff.spellId, source: liveBuff.source, target: liveBuff.target, kind: 'buff', stacks: liveBuff.stacks, charges: liveBuff.charges, amount: stackedAmount(liveBuff), mod: liveBuff.mod }]
                  : []),
                ...identityRows.map((e) => ({
                  spellId: e.spellId, source: e.source, target: e.target, kind: 'buff',
                  stacks: e.stacks, charges: e.charges, amount: stackedAmount(e), mod: e.mod,
                })),
              ],
              { spellId: spell.id, source: src.side, target: buffTgt.side, kind: 'buff' },
              {
                stackAmount: spell.stackAmount,
                procCharges: auraHolderCharges(spell, eff) || buffProcChargesForSpell(spell.id, 0),
                // liveBuff above falls back to another caster's row on purpose; without this the plan
                // re-rejected on source, so four warriors left four 1-stack Sunders, not one 5-stack.
                matchAnyCaster: spell.stacksPerCaster !== true && !hasAttrEx3(spell, SPELL_ATTR_EX3.DOT_STACKING_RULE),
                identity: {
                  ...(chainOf ? { chainOf } : {}),
                  auraUnique: hasAttrEx(spell, SPELL_ATTR_EX.AURA_UNIQUE),
                  ...(mod != null ? { incomingMod: mod, incomingAmount: amount } : {}),
                },
              },
            );
            // Same-chain lower rank: RemoveAurasDueToSpell drops the whole holder, not one effect row. The
            // offset is the liveBuff row, which is never in `identityRows`. Cite: Unit.cpp:5023-5024.
            if (plan.action === 'add' && plan.replaces?.length) {
              const offset = liveBuff ? 1 : 0;
              const dropIds = new Set<number>();
              for (const i of plan.replaces) {
                const row = identityRows[i - offset];
                if (row) dropIds.add(row.spellId);
              }
              if (dropIds.size) {
                for (let at = effects.length - 1; at >= 0; at--) {
                  const row = effects[at]!;
                  if (row.target !== buffTgt.side || !dropIds.has(row.spellId)) continue;
                  if (row.kind === 'buff') {
                    reverseBuffMod(buffTgt, row.mod, row.amount ?? 0, row.school, {
                      creatureTypeMask: row.creatureTypeMask,
                      schoolMask: row.schoolMask,
                    });
                  } else if (row.kind === 'resist' && row.school) {
                    buffTgt.resistances[row.school] =
                      (buffTgt.resistances[row.school] ?? 0) - (row.amount ?? 0);
                  }
                  buffTgt.buffActive.delete(row.spellId);
                  effects.splice(at, 1);
                  push({ t, kind: 'aura', actor: buffTgt.side, name: row.name, applied: false });
                }
              }
            }
            planAction = plan.action;
            // Apply live mods only on first add or when stacking increases the total.
            // Refresh (same stacks) re-applies duration without double-adding flat mods.
            const maskOpts = {
              creatureTypeMask: eff.creatureTypeMask,
              schoolMask: eff.schoolMask,
            };
            const applyMods = (delta: number): void =>
              applyBuffMod(buffTgt, mod as BuffMod, delta, school, maskOpts);
            if (plan.action === 'blocked') {
              // no-op
            } else if (plan.action === 'add' || !liveBuff) {
              applyMods(amount);
              buffTgt.buffActive.add(spell.id);
              effects.push({
                kind: 'buff', source: src.side, target: buffTgt.side, spellId: spell.id, name: spell.name,
                mod, amount, school, expiresAt: expAt,
                creatureTypeMask: eff.creatureTypeMask,
                schoolMask: eff.schoolMask,
                exclusionGroup: spell.exclusionGroup,
                ...stackFields,
                fromTotem: isTotemSide(src.side) ? src.side : undefined,
                stacks: plan.stacks, charges: plan.charges,
                ...((plan.charges != null && (spell.procFlags ?? 0) !== 0)
                  ? { procFlags: spell.procFlags }
                  : {}),
              });
              // The aura row lives on the target's buff bar. Also emit a spell_hit for the caster so a
              // damageless hostile debuff shows in the fight log as a cast.
              push({ t, kind: 'aura', actor: buffTgt.side, name: spell.name, applied: true, spellId: spell.id });
              if (buffTgt.side !== src.side) {
                push({
                  t, kind: 'spell_hit', actor: src.side, target: buffTgt.side,
                  spellId: spell.id, name: spell.name, result: 'hit', amount: 0, school: spell.school,
                });
              }
            } else if (plan.action === 'stack') {
              applyMods(amount); // +1 stack worth of the flat amount
              liveBuff.amount = amount;
              liveBuff.expiresAt = expAt;
              liveBuff.stacks = plan.stacks;
              if (plan.charges != null) {
                liveBuff.charges = plan.charges;
                if ((spell.procFlags ?? 0) !== 0) liveBuff.procFlags = spell.procFlags;
              }
              if (spell.exclusionGroup != null) liveBuff.exclusionGroup = spell.exclusionGroup;
              touchEffect(liveBuff);
            } else {
              // refresh — duration only; do not re-add flat mods (would double-dip).
              liveBuff.expiresAt = expAt;
              liveBuff.stacks = plan.stacks;
              touchEffect(liveBuff);
              if (plan.charges != null) {
                liveBuff.charges = plan.charges;
                if ((spell.procFlags ?? 0) !== 0) liveBuff.procFlags = spell.procFlags;
              }
              if (spell.exclusionGroup != null) liveBuff.exclusionGroup = spell.exclusionGroup;
              if (liveBuff.amount != null && liveBuff.amount !== amount && liveBuff.mod) {
                applyMods(amount - liveBuff.amount);
                liveBuff.amount = amount;
              }
            }
          }
          // Divine Shield's immunity rides its baked school_immunity effects, so there is no id set
          // here. Bestial Wrath's CC-immunity rider is attached from the sourced mask for the duration.
          if (planAction !== 'blocked' && isEnemySide(buffTgt.side)) {
            applySpellThreatBonus(src, spell, buffTgt, hitCount);
          }
          if (planAction !== 'blocked') {
            const riderMask = ccImmunityRiderMaskForSpell(spell.id);
            if (riderMask) {
              grantImmunityAura(
                buffTgt,
                makeCcImmunityAura(spell.id, {
                  mechanicMask: riderMask,
                  durationMs: dur,
                  expiresAt: expAt,
                }),
                expAt,
                spell.name,
                src.side,
              );
            }
          }
        };
        for (const buffTgt of buffTargets) applyBuffToTarget(buffTgt);
        // ---- Party area aura (APPLY_AREA_AURA_PARTY, effect 35), timed or not: Trueshot Aura's
        // 30 min ride the rows and still leave with the hunter. A timed effect-6 buff is not this.
        if (
          buffAudience === 'party'
          && !isHostileBuffEffect(eff, baseAmount)
          && (!(eff.durationMs > 0) || isPartyAreaAura(spell))
        ) {
          registerAreaAuraSource({
            holderSide: src.side,
            spellId: spell.id,
            name: spell.name,
            baseRadiusYd: spell.radiusYd,
            modOwnerSide: src.side,
            exclusionGroup: spell.exclusionGroup,
            // AreaAura::Update applies the MISSING rank only. An unguarded re-apply emitted 50 events
            // for one Blood Pact in a 2.5 s fight — the totem kit path guards the same way.
            apply: (m: Fighter) => {
              if (hasAreaAuraRow(ctx.effectsOn(m.side), m, spell.id, src.side)) return;
              applyBuffToTarget(m);
            },
            strip: (m: Fighter) => {
              stripAreaAuraRowsFrom(effects, m, spell.id, src.side, reverseActiveEffect, ctx.effectsOn(m.side));
            },
            // AreaAura::Update drops a target that is "not same subgroup" — the reason a
            // 40-man needs a paladin per group, not one Devotion Aura for the raid.
            members: () => friendlyPoolOf(src)
              .filter((m: Fighter) => sameSubgroup(src, m) && (m === src || isPartyFanBody(m))),
            // A unit that LEFT the subgroup falls out of members() and would never be
            // re-checked; the remove arm is per-target, so the sweep needs the carrier list.
            carriers: () => areaAuraCarrierSides(ctx.effectsFrom(src.side), spell.id, src.side),
            // `!caster->HasAura(originalRankSpellId)`: the holder row expiring or being cancelled on
            // the caster ends the aura for everyone. Cite: SpellAuras.cpp:597.
            alive: () => {
              const holder = bySide(src.side);
              return !!holder && !dead(holder) && hasAreaAuraRow(ctx.effectsOn(holder.side), holder, spell.id, src.side);
            },
          });
        }
        // Self/friendly-buff finishers (SnD) always "hit"; hostile armor debuff finishers count too.
        finisherHit = true;
      } else if (
        eff.kind === 'school_immunity' || eff.kind === 'damage_immunity'
        || eff.kind === 'mechanic_immunity' || eff.kind === 'dispel_immunity'
        || eff.kind === 'state_immunity' || eff.kind === 'effect_immunity'
      ) {
        // Aura-granted immunities — Divine Protection, Blessing of Protection, Free Action. Self and
        // friendly only. With a pet-targeted buff on the same spell, the immunity routes to the pet.
        const dur = durFor(eff.durationMs);
        // DurationIndex 21 bakes 0, permanent until cancelled, so adding it tore the row down a tick
        // later — and with it the FORM's buff chip. 22 spells carry a permanent immunity.
        const immExpiresAt = dur > 0 ? t + dur : Number.POSITIVE_INFINITY;
        const auraType = eff.kind === 'school_immunity' ? AURA_TYPE.SCHOOL_IMMUNITY
          : eff.kind === 'damage_immunity' ? AURA_TYPE.DAMAGE_IMMUNITY
            : eff.kind === 'dispel_immunity' ? AURA_TYPE.DISPEL_IMMUNITY
              : eff.kind === 'state_immunity' ? AURA_TYPE.STATE_IMMUNITY
                : eff.kind === 'effect_immunity' ? AURA_TYPE.EFFECT_IMMUNITY
                  : AURA_TYPE.MECHANIC_IMMUNITY;
        const petBuff = spell.effects.some((e) => e.kind === 'buff' && e.applyTo === 'pet');
        // TARGET_UNIT_FRIEND immunities hold on the unit the cast NAMED, as the absorb branch
        // aims its holder (:1832). BoP on an ally was immunising the paladin instead.
        const immAim = auraHolderIsCastTarget(spell) ? aimedFriendlyOf(src) : null;
        const immOwner = petBuff && pet && !dead(pet) ? pet : (immAim ?? src);
        const immCharges = auraHolderCharges(spell, eff);
        grantImmunityAura(immOwner, {
          spellId: spell.id,
          auraType,
          schoolMask: (eff.kind === 'school_immunity' || eff.kind === 'damage_immunity')
            ? (eff.schoolMask | 0)
            : undefined,
          mechanic: eff.kind === 'mechanic_immunity' ? (eff.mechanic | 0) : undefined,
          // The SPELL's own mechanic, which is what CanPierceImmuneAura excludes on. Without it
          // Divine Shield and Ice Block read as pierceable. Cite: SpellMgr.h:1306-1310.
          spellMechanic: mechanicIdFromName(spell.mechanic) || undefined,
          // Cite: Unit.cpp ApplySpellDispelImmunity ~7699 (41) / HandleAuraModStateImmunity ~2972 (38).
          dispelType: eff.kind === 'dispel_immunity' ? (eff.dispelType | 0) : undefined,
          stateAuraType: eff.kind === 'state_immunity' ? (eff.stateAuraType | 0) : undefined,
          effectId: eff.kind === 'effect_immunity' ? (eff.effectId | 0) : undefined,
          positive: eff.positive !== false,
          immunityPurgesEffect: true,
          durationMs: dur,
          ...(immCharges > 0 ? { charges: immCharges } : {}),
        }, immExpiresAt, spell.name, src.side);
        // Scripted boost spells ride along on apply: Stoneform carries its disease and bleed immunity,
        // and Bestial Wrath its four. Cite: SpellAuras.cpp:5567 HandleSpellSpecificBoosts.
        for (const boost of immunityBoostAurasForSpell(spell.id, dur)) {
          grantImmunityAura(immOwner, boost, immExpiresAt, spell.name, src.side);
        }
        // Cite: SpellAuras.cpp:2968 if (apply && IsPositive()) RemoveAurasWithInterruptFlags(INVULNERABILITY_BUFF_CANCELS)
        if (eff.positive !== false) {
          ctx.removeAurasWithInterruptFlags?.(immOwner, AURA_INTERRUPT.INVULNERABILITY_BUFF_CANCELS, 'invulnerability');
        }
        finisherHit = true;
      } else if (eff.kind === 'pacify') {
        // MOD_PACIFY: cannot melee/ranged attack; can still cast. Holds on the unit the cast named
        // (BoP is TARGET_UNIT_FRIEND 57), else the caster. Cite: SpellAuras.cpp HandleAuraModPacify ~4382.
        const dur = durFor(eff.durationMs);
        const pacTgt = (auraHolderIsCastTarget(spell) ? aimedFriendlyOf(src) : null) ?? src;
        pacTgt.pacifiedUntil = Math.max(pacTgt.pacifiedUntil, t + dur);
        pacTgt.buffActive.add(spell.id);
        const live = ctx.effectsOn(pacTgt.side).find(
          (e) => e.kind === 'buff' && e.spellId === spell.id,
        );
        if (live) {
          live.expiresAt = Math.max(live.expiresAt, t + dur);
          touchEffect(live);
        } else {
          effects.push({
            kind: 'buff', source: src.side, target: pacTgt.side, spellId: spell.id, name: spell.name,
            expiresAt: t + dur,
          });
          push({ t, kind: 'aura', actor: pacTgt.side, name: spell.name, applied: true });
        }
        finisherHit = true;
      } else if (eff.kind === 'mod_unattackable') {
        // MOD_UNATTACKABLE (93): Phase Shift — untargetable plus a combat stop. DurationIndex 21 is
        // permanent until cancelled. Cite: SpellAuras.cpp:4454–4459; KI-732.
        const dur = durFor(eff.durationMs);
        const expAt = dur > 0 ? t + dur : Number.POSITIVE_INFINITY;
        src.unattackableUntil = Math.max(src.unattackableUntil, expAt);
        // Real && Apply → CombatStop(): drop combat timer + hold white swings (AIF ATTACKING
        // on 4511 cancels the aura if the imp attacks). Cite: :4456–4457; auraInterruptFlags 0x1000.
        if (eff.combatStopOnApply) {
          src.combatUntil = 0; src.combatEnteredAt = 0;
          src.autoAttackEnabled = false;
          src.pendingSwing = null;
        }
        grantImmunityAura(src, {
          spellId: spell.id,
          auraType: AURA_TYPE.MOD_UNATTACKABLE,
          positive: true,
          immunityPurgesEffect: false,
          durationMs: dur,
        }, expAt, spell.name, src.side);
        src.buffActive.add(spell.id);
        const live = ctx.effectsOn(src.side).find(
          (e) => e.kind === 'buff' && e.spellId === spell.id,
        );
        if (live) {
          live.expiresAt = Math.max(live.expiresAt, expAt);
          touchEffect(live);
        } else {
          effects.push({
            kind: 'buff', source: src.side, target: src.side, spellId: spell.id, name: spell.name,
            expiresAt: expAt,
          });
          push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true });
        }
        finisherHit = true;
      } else if (eff.kind === 'school_absorb') {
        // SPELL_AURA_SCHOOL_ABSORB (69). Cite: Unit.cpp ~2391; applySchoolAbsorb.ts.
        if (applySchoolAbsorbEffect({
          src, tgt: aimedFriendlyOf(src) ?? src,
          player, spell, eff, effects, effectsOn: (side) => ctx.effectsOn(side), t, durFor, rngNext: () => rng.next(), push,
          touchEffect,
        })) {
          finisherHit = true;
        }
      } else if (eff.kind === 'instakill') {
        // SPELL_EFFECT_INSTAKILL (1). Cite: SpellEffects.cpp:205–221; applySchoolAbsorb.ts.
        applyInstakillEffect({ src, tgt, eff, dead, checkDeaths });
        finisherHit = true;
      } else if (eff.kind === 'mana_shield') {
        // SPELL_AURA_MANA_SHIELD (97) — pool + manaMultiplier from EffectMultipleValue.
        // Cite: Unit.cpp ~2457; Mana Shield ranks EffectMultipleValue = 2.
        const amount = Math.max(0, Math.round(rollBetween(eff.min, eff.max, rng.next())));
        const dur = durFor(eff.durationMs);
        src.manaShields = src.manaShields.filter((a) => a.id !== spell.id);
        src.manaShields.push({
          schoolMask: eff.schoolMask,
          amount,
          manaMultiplier: eff.manaMultiplier,
          id: spell.id,
        });
        const live = ctx.effectsOn(src.side).find(
          (e) => e.kind === 'mana_shield' && e.spellId === spell.id,
        );
        if (live) {
          live.expiresAt = t + dur;
          live.min = amount;
          live.max = amount;
          touchEffect(live);
        } else {
          effects.push({
            kind: 'mana_shield', source: src.side, target: src.side,
            spellId: spell.id, name: spell.name, expiresAt: t + dur, min: amount, max: amount,
          });
        }
        src.buffActive.add(spell.id);
        push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true });
        finisherHit = true;
      } else if (eff.kind === 'heal_max_health') {
        // SPELL_EFFECT_HEAL_MAX_HEALTH (67) — heal = CASTER max health (Lay on Hands).
        // Cite: SpellEffects.cpp:3579–3589; effects.ts resolveHealMaxHealth.
        const { healAmount } = resolveHealMaxHealth({ casterMaxHealth: src.spec.maxHealth });
        if (!dead(tgt) && healAmount > 0) {
          const hpBefore = tgt.hp;
          tgt.hp = Math.min(tgt.spec.maxHealth, Math.round(tgt.hp + healAmount));
          push({
            t, kind: 'heal', actor: tgt.side, amount: healAmount,
            source: src.side, name: spell.name, spellId: spell.id,
          });
          // Effective gain only — overheal generates no threat (Unit.cpp ModifyHealth gain).
          applyHealThreat(src, tgt.hp - hpBefore, spell, tgt.side);
        }
        finisherHit = true;
      } else if (eff.kind === 'power_drain') {
        // SPELL_EFFECT_POWER_DRAIN (8) — cap at current power; caster gains × multiplier.
        // Cite: SpellEffects.cpp:1750–1792.
        if ((hostileSpell || (bypassPositiveAutoHit && tgt.side !== src.side)) && !rollHostileLand(spell.school)) continue;
        const amount = Math.round(rollBetween(eff.min, eff.max, rng.next()));
        const cur = powerOfType(tgt, eff.powerType);
        const match = casterPowerTypeId(src) === eff.powerType;
        const { drained, casterGain } = resolvePowerDrain({
          amount,
          targetCurrentPower: cur,
          multiplier: eff.multiplier,
          powerTypesMatch: match,
          isSelf: src === tgt,
        });
        if (drained > 0) {
          setPowerOfType(tgt, eff.powerType, cur - drained);
          if (casterGain > 0 && match) {
            const cCur = powerOfType(src, eff.powerType);
            setPowerOfType(src, eff.powerType, cCur + casterGain);
            // Cite: SpellEffects.cpp:1791 EnergizeBySpell triggers threatAssist
            applyHealThreat(src, casterGain, spell);
          }
          push({
            t, kind: 'spell_hit', actor: src.side, target: tgt.side, spellId: spell.id, name: spell.name,
            result: 'hit', amount: drained, school: spell.school,
          });
          finisherHit = true;
        }
      } else if (eff.kind === 'power_burn') {
        // SPELL_EFFECT_POWER_BURN (62) — burn power, deal burned × mult as school damage.
        // Cite: SpellEffects.cpp:1801–1829.
        if ((hostileSpell || (bypassPositiveAutoHit && tgt.side !== src.side)) && !rollHostileLand(eff.school)) continue;
        const amount = Math.round(rollBetween(eff.min, eff.max, rng.next()));
        const cur = powerOfType(tgt, eff.powerType);
        const { burned, damage } = resolvePowerBurn({
          amount,
          targetCurrentPower: cur,
          multiplier: eff.multiplier,
        });
        if (burned > 0) {
          setPowerOfType(tgt, eff.powerType, cur - burned);
          const dealt = dealDamage(tgt, damage, eff.school, src.spec.level, {
            damageType: 'spell', attacker: src, spell,
          });
          push({
            t, kind: 'spell_hit', actor: src.side, target: tgt.side, spellId: spell.id, name: spell.name,
            result: 'hit', amount: dealt, school: eff.school,
          });
          finisherHit = true;
        }
      } else if (eff.kind === 'health_leech') {
        // SPELL_EFFECT_HEALTH_LEECH (9) — damage capped at current HP; heal caster × mult.
        // Cite: SpellEffects.cpp:1905–1934.
        if ((hostileSpell || (bypassPositiveAutoHit && tgt.side !== src.side)) && !rollHostileLand(eff.school)) continue;
        const amount = Math.round(rollBetween(eff.min, eff.max, rng.next()));
        const { damage, heal } = resolveHealthLeech({
          amount,
          targetCurrentHealth: tgt.hp,
          multiplier: eff.multiplier,
        });
        if (damage > 0) {
          const dealt = dealDamage(tgt, damage, eff.school, src.spec.level, {
            damageType: 'spell', attacker: src, spell,
          });
          if (!dead(src) && heal > 0) {
            src.hp = Math.min(src.spec.maxHealth, Math.round(src.hp + heal));
            push({
              t, kind: 'heal', actor: src.side, amount: heal,
              source: src.side, name: spell.name, spellId: spell.id,
            });
          }
          push({
            t, kind: 'spell_hit', actor: src.side, target: tgt.side, spellId: spell.id, name: spell.name,
            result: 'hit', amount: dealt, school: eff.school,
          });
          finisherHit = true;
        }
      } else if (eff.kind === 'energize') {
        // SPELL_EFFECT_ENERGIZE (30) non-rage — rage stays on rageGenerated.
        // Cite: SpellEffects.cpp:2079–2124.
        const amount = Math.round(rollBetween(eff.min, eff.max, rng.next()));
        const cur = powerOfType(tgt, eff.powerType);
        const max = maxPowerOfType(tgt, eff.powerType);
        const { restored, skipped } = resolveEnergize({
          amount,
          powerType: eff.powerType,
          targetCurrentPower: cur,
          targetMaxPower: max,
        });
        if (!skipped && restored > 0) {
          setPowerOfType(tgt, eff.powerType, cur + restored);
          push({
            t, kind: 'resource', actor: tgt.side,
            power: powerTypeName(eff.powerType) ?? tgt.spec.powerType,
            value: Math.round(powerOfType(tgt, eff.powerType)),
            delta: restored,
          });
          // ENERGIZE threat lands on the caster, off the ENERGIZED unit's own ref list.
          // Cite: Unit.cpp:6961 EnergizeBySpell; SpellEffects.cpp:2123 EffectEnergize.
          applyHealThreat(src, restored, spell, tgt.side);
        }
        finisherHit = true;
      } else if (eff.kind === 'life_tap') {
        // Warlock Life Tap — a health cost plus a mana energize, self only. It fizzles when the health
        // cost exceeds current HP, costing neither mana nor health. Cite: Warlock.cpp:67–102.
        const cost = Math.max(0, Math.trunc(eff.healthCost));
        const mana = Math.max(0, Math.trunc(eff.manaGain));
        // script value > health → SPELL_FAILED_FIZZLE. Cite: Warlock.cpp:69–70.
        if (cost > 0 && cost > src.hp) {
          // Cast already selected by AI; silent fizzle (no HP, no mana).
        } else if (cost > 0 || mana > 0) {
          if (cost > 0) {
            src.hp = Math.max(0, src.hp - cost);
          }
          if (mana > 0) {
            const cur = powerOfType(src, POWER_MANA);
            const max = maxPowerOfType(src, POWER_MANA);
            const { restored, skipped } = resolveEnergize({
              amount: mana,
              powerType: POWER_MANA,
              targetCurrentPower: cur,
              targetMaxPower: max,
            });
            if (!skipped && restored > 0) {
              setPowerOfType(src, POWER_MANA, cur + restored);
              push({
                t, kind: 'resource', actor: src.side,
                power: 'mana',
                value: Math.round(powerOfType(src, POWER_MANA)),
                delta: restored,
              });
              // Life Tap energize triggers threatAssist (Unit.cpp EnergizeBySpell)
              applyHealThreat(src, restored, spell);
            }
          }
          finisherHit = true;
        }
      } else if (eff.kind === 'extra_attacks') {
        // SPELL_EFFECT_ADD_EXTRA_ATTACKS (19) — cap 5.
        // Cite: SpellEffects.cpp:4873–4882; effects.ts resolveAddExtraAttacks.
        src.extraAttacks = resolveAddExtraAttacks({ current: src.extraAttacks, add: eff.count });
        // Meter: drained extras must show as this spell (Windfury Totem), not white Melee.
        src.extraAttackSource = { spellId: spell.id, name: spell.name };
        finisherHit = true;
      } else if (eff.kind === 'reset_own_threat') {
        // DoResetThreat: everyone's hate on the CASTER to zero, so the tank has to re-grab.
        // Cite: UnitAI.cpp:773-781; boss_twinemperors.cpp:332-356 does the same by hand.
        threatOf(src)?.modifyAllThreatPercent(-100);
        push({ t, kind: 'threat_all_pct', actor: src.side, percent: -100 });
        finisherHit = true;
      } else if (eff.kind === 'modify_threat_pct') {
        // MODIFY_THREAT_PERCENT (125) on the target's threat list toward the caster. A self-cast like
        // Feign Death walks every living enemy's manager instead of one targeted unit.
        const pct = Math.trunc(eff.pct);
        if (isEnemySide(tgt.side)) {
          const tm = threatOf(tgt);
          if (tm) tm.modifyThreatPercent(src.side, pct);
        } else {
          for (const ef of livingEnemies()) {
            if (dead(ef)) continue;
            const tm = threatOf(ef);
            if (tm) tm.modifyThreatPercent(src.side, pct);
          }
        }
        finisherHit = true;
      } else if (eff.kind === 'feign_death') {
        // SPELL_AURA_FEIGN_DEATH (66): CombatStop so IsNonCombatSpell (traps) can fire.
        // Cite: Unit.cpp SetFeignDeath :10091–10103 CombatStop; Spell.cpp :4598.
        const dur = durFor(eff.durationMs);
        clearCombatFlag(src);
        src.autoAttackEnabled = false;
        src.pendingSwing = null;
        src.feigningUntil = dur > 0 ? t + dur : Number.POSITIVE_INFINITY;
        src.feignSpellId = spell.id;
        ctx.clearPullSpentFor?.(src.side);
        finisherHit = true;
      } else if (eff.kind === 'threat_temporary') {
        // MOD_TOTAL_THREAT (103) — Fade's temporary flat reverse-hate reduction, signed and capped per
        // list at minus the current value. A refresh extends the duration without re-applying it.
        const amount = Math.trunc(eff.amount);
        const dur = eff.durationMs ?? 0;
        const expAt = dur > 0 ? t + dur : Number.POSITIVE_INFINITY;
        const liveFade = ctx.effectsOn(src.side).find(
          (e) =>
            e.kind === 'buff'
            && e.spellId === spell.id
            && e.threatFadeDeltas != null,
        );
        if (liveFade) {
          liveFade.expiresAt = expAt;
          liveFade.name = spell.name;
          touchEffect(liveFade);
          src.buffActive.add(spell.id);
          push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true, spellId: spell.id });
        } else {
          const deltas: Array<{ id: Side; delta: number }> = [];
          for (const ef of livingEnemies()) {
            if (dead(ef)) continue;
            const tm = threatOf(ef);
            if (!tm || !tm.hasThreat(src.side)) continue;
            const cur = tm.getThreat(src.side);
            // reducedThreat = max(-curThreat, amount). Cite: HostileRefManager.cpp:90–91.
            const reduced = Math.max(-cur, amount);
            if (reduced === 0) continue;
            tm.addThreatDirectly(src.side, reduced, false);
            deltas.push({ id: ef.side, delta: reduced });
          }
          src.buffActive.add(spell.id);
          effects.push({
            kind: 'buff',
            source: src.side,
            target: src.side,
            spellId: spell.id,
            name: spell.name,
            amount,
            expiresAt: expAt,
            threatFadeDeltas: deltas,
          });
          push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true, spellId: spell.id });
        }
        finisherHit = true;
      } else if (eff.kind === 'weapon_percent_damage') {
        // WEAPON_PERCENT_DAMAGE (31) — a percent of a weapon damage sample. A ranged dmgClass or shoot
        // role samples the ranged weapon, the safety net when impact lands via castOnTargets.
        const isRanged = (spell.dmgClass ?? -1) === SPELL_DAMAGE_CLASS.RANGED
          || roleOf(spell) === 'shoot';
        const wpn = (isRanged && src.spec.ranged) ? src.spec.ranged : src.spec.weapon;
        // Hunter's Mark aura 127: victim grants attackers +RAP. Cite: Unit.cpp:7470; weapon.ts markRap.
        const markAp = tgt.attackerAttackPowerBonus || 0;
        const ap = (isRanged && src.spec.ranged)
          ? (src.spec.rangedAttackPower ?? src.attackPower) + markAp
          : src.attackPower + markAp;
        const formOverride = !isRanged && isAttackSpeedOverriddenShapeShift(src.form);
        const wd = meleeBaseDamage(wpn.dmgMin, wpn.dmgMax, ap, wpn.speedMs, rng.next(), {
          formOverride,
          level: src.spec.level,
        });
        const { damage } = resolveWeaponPercentDamage({ weaponDamage: wd, pct: eff.pct });
        const school = (isRanged && src.spec.ranged?.school) ? src.spec.ranged.school : 'physical';
        const dealt = dealDamage(tgt, damage, school, src.spec.level, {
          damageType: 'weapon', attacker: src, spell,
        });
        push({
          t, kind: 'spell_hit', actor: src.side, target: tgt.side, spellId: spell.id, name: spell.name,
          result: 'hit', amount: dealt, school,
        });
        finisherHit = true;
      } else if (eff.kind === 'consume_aura') {
        applyConsumeAuraEffect(
          src,
          tgt,
          effects,
          eff,
          (who, id) => {
            (ctx.removeAurasDueToSpell as ((u: Fighter, spellId: number) => number) | undefined)?.(who, id);
          },
          (who, id, n) => {
            (ctx.stripAuraOnDispel as ((u: Fighter, spellId: number, stacks: number) => void) | undefined)?.(who, id, n);
          },
        );
      } else if (eff.kind === 'resurrect' || eff.kind === 'resurrect_pct') {
        // Battle rez (druid Rebirth) re-picks its own target: the cast resolved against the FOE, and
        // the corpse is on our side. Claim-aware, so two druids never stand up the same body.
        const corpse = isEnemySide(src.side)
          ? null
          : pickBattleRezTarget(ctx.partyUnits(), src, (c) => ctx.rezClaim.get(c.side));
        for (const [corpseId, claimerId] of [...ctx.rezClaim.entries()]) {
          if (claimerId === src.side) ctx.rezClaim.delete(corpseId);
        }
        if (corpse) {
          const payload = battleRezPayload(eff, corpse.spec.maxHealth, corpse.spec.maxPower);
          reviveInCombat(corpse, payload.health, payload.mana, t);
          ctx.deathEmitted.delete(corpse.side);
          ctx.bumpPool?.();
          ctx.invalidateViewMemo?.();
          push({
            t, kind: 'spell_hit', actor: src.side, target: corpse.side, spellId: spell.id,
            name: spell.name, result: 'hit', amount: payload.health, school: spell.school || 'holy',
          });
          push({
            t, kind: 'flavor',
            text: `${src.spec.name} brings ${corpse.spec.name} back to life with ${spell.name}.`,
          });
          finisherHit = true;
        }
      } else if (eff.kind === 'zero_energy') {
        // Ferocious Bite dumps energy after a landed school hit (already folded into damage).
        // Cite: SpellEffects.cpp:311–320 EffectSchoolDMG.
        if (hostileLanded === true && src.spec.powerType === 'energy' && src.power > 0) {
          const before = src.power;
          src.power = 0;
          push({ t, kind: 'resource', actor: src.side, power: 'energy', value: 0, delta: -before });
        }
      }
      else {
        // A resisted cast lands no late rider either: Frostbolt's aura-33 snare had no roll.
        // Cite: Spell.cpp:1211-1212 missInfo -> DoSpellHitOnUnit (every effect on a target, or none).
        if (
          (hostileSpell || bypassPositiveAutoHit)
          && isEnemySide(src.side) !== isEnemySide(tgt.side)
          && isFoeLandingLateEffect(eff)
          && !rollHostileLand(spell.school, eff.kind === 'speed' ? 'snare' : undefined)
        ) continue;
        // Late cases recompute land/crit locally where needed; pass spell-level binary only.
        // finisherHit is mutated by late cases (shared with early loop).
        const hitBox = { finisherHit };
        // Speed-only HEARTBEAT_RESIST (Frost Shot) has no cc/root slot. Cite: Spell.cpp:1483-1489.
        const speedHeartbeat = heartbeatSlotOf(spell) === 'speed' && isHostileSpeedEffect(eff)
          ? armHeartbeatResist({
            now: t,
            missPlusResistPercent: landMissPlusResistPct ?? 0,
            // eff is the broad late-effect union here; armHeartbeatResist refuses 0 the way
            // Spell.cpp:1483 refuses originalDuration <= 0, so a missing field is a no-arm.
            originalDurationMs: durFor(Number((eff as { durationMs?: number }).durationMs) || 0),
            drLevel: drStepOf(tgt, ((eff as { mechanic?: Mechanic }).mechanic || spell.mechanic || 'snare'), t),
          })
          : null;
        applySpellEffectLate(L, src, tgt, spell, eff, {
          t,
          durFor,
          crit: false,
          binary: resolveSpellBinary(spell),
          hitBox,
          hitCount,
          unitTargetGender: tgtIn.spec.gender,
          ...(speedHeartbeat ? { heartbeat: speedHeartbeat } : {}),
        });
        if (hitBox.finisherHit) finisherHit = true;
        // Recast-to-leave (Ghost Wolf / Travel): do not apply the speed rider after form drop.
        // Cite: oocCastEffects KI-699.
        if (eff.kind === 'shapeshift' && src.form === 0) break;
      }
    }

    // SPELL_AURA_ADD_TARGET_TRIGGER: after immediate effects, chance-cast on this hit.
    // Cite: Spell.cpp:3384 / :7433–7468 ProcSpellAuraTriggers.
    if (finisherHit && src.addTargetTriggers.length) {
      src.addTargetTriggers = src.addTargetTriggers.filter((r) => r.expiresAt > t);
      for (const row of src.addTargetTriggers) {
        if (!addTargetTriggerAffects(row, spell)) continue;
        const auraSpell = ctx.spellOf?.(row.spellId);
        if (auraSpell && hasAttrEx4(auraSpell, SPELL_ATTR_EX4.CLASS_TRIGGER_ONLY_ON_TARGET) && src !== tgt) continue;
        if (!improvedSprintShouldProc(row.chancePct, rng.next())) continue;
        const trig = src.spec.spells.find((s) => s.id === row.triggerSpellId);
        if (trig) applyProc(src, tgt, trig);
      }
    }

    // RegisterOverrideScriptAura — aura 112 exists on the target even when the slot
    // has no combat mod. Cite: SpellAuras.cpp:5096–5098; Unit.cpp:11980–11985.
    if (overrideScriptsOnSpell(spell).length) {
      const holder = overrideScriptAuraTargetIsCaster(spell) ? src : tgt;
      const dur = durMs(spell.durationIndex) ?? 0;
      const expAt = dur > 0 ? t + dur : Number.POSITIVE_INFINITY;
      holder.buffActive.add(spell.id);
      if (!ctx.effectsOn(holder.side).some((e) => e.kind === 'buff' && e.spellId === spell.id)) {
        effects.push({
          kind: 'buff',
          source: src.side,
          target: holder.side,
          spellId: spell.id,
          name: spell.name,
          expiresAt: expAt,
        });
        push({ t, kind: 'aura', actor: holder.side, name: spell.name, applied: true, spellId: spell.id });
      }
    }

    // The cast resolved against this target, so seat the caster on its threat list even when nothing
    // landed. A false land is the miss arm; anything else counts as a hit for THREAT_ONLY_ON_MISS.
    if (hostileSpell) engageOnHostileSpell(src, tgt, spell, hostileLanded !== false);

    // Finisher: clear combo points on a successful finish (Spell.cpp finish path). A full miss on a
    // hostile finisher retains CP — self-only finishers (SnD) always clear via finisherHit=true.
    if (isFinisher && finisherHit) {
      clearComboPoints(src);
    }
    // Builder: award CP from effect 80 after a successful cast that also has a land path. When
    // combo_points is already in effects[], applySpellLate granted it once — do not fire twice.
    else if (
      !isFinisher
      && spell.comboPointsGenerated
      && spell.role !== 'strike'
      && !spell.strikeBonus
      && !spell.effects.some((e) => e.kind === 'combo_points')
    ) {
      // Bake-only builders (no combo_points row yet): grant when something landed.
      if (finisherHit || spell.effects.length === 0) addComboPoints(src, tgt, spell.comboPointsGenerated);
    }
    // Seal Fate and Ruthlessness grant CP AFTER the current ability finishes: a finisher after the
    // clear, a builder after its own grant. A white swing never arms pending.
    if (src.pendingFinisherComboPoints > 0 && (finisherHit || !isFinisher)) {
      addComboPoints(src, tgt, src.pendingFinisherComboPoints);
      src.pendingFinisherComboPoints = 0;
    }

    // Improved Sap: talent aura 42 rolls; 14093 OnSuccessfulFinish recasts Stealth.
    // Cite: Rogue.cpp:105–109; sql/scriptdev2/spell.sql 14093; UnitAuraProcHandler.cpp:592–597,679.
    if ((spell.id | 0) === IMPROVED_SAP_TRIGGER_SPELL_ID) {
      ctx.castHighestStealthRank?.(src);
    } else if (SAP_SPELL_IDS.has(spell.id | 0) && finisherHit && isPlayerCharacterSide(src.side)) {
      const savedProcs = src.procs;
      let kitProc: NonNullable<typeof savedProcs>[number] | null = null;
      if (!(savedProcs ?? []).some((p) => (p.triggerSpellId | 0) === IMPROVED_SAP_TRIGGER_SPELL_ID)) {
        const holder = improvedSapHolderFromKnown(src.spec.spells);
        const chance = holder ? procChanceUnitFromRow(holder) : null;
        if (holder && chance != null) {
          kitProc = {
            triggerSpellId: IMPROVED_SAP_TRIGGER_SPELL_ID,
            chance,
            ppm: holder.spellProcEvent?.ppmRate ?? null,
            procFlags: holder.procFlags ?? holder.spellProcEvent?.procFlags,
            spellFamilyName: holder.spellProcEvent?.spellFamilyName ?? holder.spellFamilyName,
            spellFamilyMask: holder.spellProcEvent?.spellFamilyMask,
          };
          src.procs = (savedProcs ?? []).concat(kitProc);
        }
      }
      triggerProcs(src, tgt, false, 'spell', spell);
      if (kitProc) src.procs = savedProcs;
    }

    // Stop attack for some spells. Cite: Spell.cpp:3691-3700.
    // The ranged autorepeat check is implied by autoAttackEnabled handling both here.
    if (hasAttr(spell, SPELL_ATTR.CANCELS_AUTO_ATTACK_COMBAT)) {
      src.autoAttackEnabled = false;
      src.pendingSwing = null;
    }

    // Channel arm / action interrupt. Cite: engine/combat/channel.ts; Unit.cpp InterruptSpellsWithChannelFlags.
    if (isChannelSpell(spell)) {
      // One channelled slot per caster: arming a second overwrote the state and stranded the first
      // channel's auras on their targets forever. Cite: Unit.cpp:4236-4239.
      if (src.channeling && src.channeling.spellId !== spell.id) {
        interruptChannel(src, channelInterruptCtx(ctx), { quiet: true });
      }
      beginChannel(src, spell, t, tgt.side);
    }
    // No ACTION cancel here. applySpell is the LANDING, where every triggered payload also arrives,
    // so a channel cancelled itself on its own tick. The cancel lives at the cast site instead.
  };

  ctx.applySpell = applySpell;

  // Late-effect bag: same bindings the peeled late cases closed over.
  // Assembled in applySpellLateBag.ts — pure wiring, kept out of this module.
  bindLateEffectBag(L, ctx, deps, { push });
}
