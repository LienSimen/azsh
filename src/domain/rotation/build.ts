// PURE: no DOM/RNG/Date. Rotation build pipeline: defaults, resolve, gates, normalize.

import type { DataStore } from '../../data/dataStore.ts';
import { CLASS, SHAPESHIFT_FORM, type SpellDef } from '../../data/schema.ts';
import {
  isRaidRuleId,
  raidTacticsForSlug,
  killOrderEntriesForBoss,
  useObjectEntriesForBoss,
} from '../raid/raidEncounterTactics.ts';
import {
  normalizeRaidCustomRows,
  raidCustomRowRule,
  type RaidCustomRow,
} from '../raid/raidCustomRows.ts';
import type { Character } from '../character/character.ts';
import {
  knownUsableSpells,
  combatItems,
  isHunterAspectSpell,
  isTriggeredSecondarySpell,
  isHiddenInternalSpell,
} from '../character/character.ts';
import type { SpellBook } from '../character/spellbook.ts';
import { auraSidesOfSpell, keepUpPresenceCondition } from './auraSide.ts';
import type { Inventory } from '../items/inventory.ts';
import { inferRole } from '../../engine/combat.ts';
import { classUsesRangedAuto, classPowerType, SOUL_SHARD_ITEM } from '../core/ids.ts';
import { sanitizeStepBackYd } from './stand.ts';
import { isHealthstoneItem } from '../bots/healthstoneSupply.ts';
import { totemSlotIndex, totemSlotOfSpell } from '../spells/totem.ts';
import {
  getClassSuggestions,
  normalizeSpellName,
  rankBaseSpellName,
  selectBand,
  suggestionClassKeyFromClassId,
  type BandMode,
  type SuggestionClassKey,
  type SuggestionPhase,
  type SuggestionRule,
  SUGGESTION_PHASES,
} from './rotationSuggestions.ts';
import {
  formIdFromLabel,
  mapWhen,
  materializeConditions,
} from '../run/whenMap.ts';
import { isFormSpell, shapeshiftCastError } from '../character/forms.ts';
import { SND_MIN_COMBO_POINTS } from './finisherLadder.ts';
import type {
  CondMetric,
  CondSubject,
  Condition,
  Rotation,
  RotationAutoSig,
  RotationPhase,
  RotationRule,
  RuleAction,
} from './types.ts';
import { DEFAULT_THRESHOLDS, REQUIRED_ROTATION_PHASES, ROTATION_PHASES } from './types.ts';
import { bestFamilyItem, consumableFamilyOfEntry } from '../items/consumableFamily.ts';
import { FLEE_CLEAR_MARGIN_YD } from './raidRowTuning.ts';
import { ensurePrebuffRows } from './prebuff.ts';

/** Mind Control. Every MC target lives in RAID_BOSS_TACTICS.mcEntries. */
const SPELL_MIND_CONTROL = 605;
import {
  applyDefenseReactGate,
  applyFormEnterGate,
  applyMultiTargetCombatGates,
  channeledAoeDamageConditions,
  collapseExclusiveFamilyRules,
  exclusiveKeepupFamily,
  bindConjureStockGate,
  ccBreakGateConditions,
  cond,
  conjureItemCountThreshold,
  repairConjureStockGates,
  dispelGateConditions,
  ensureCondition,
  formIdForRotationSpell,
  hostileAuraEffect,
  hostileStackCap,
  isBloodrageSpell,
  isChanneledAoeDamageSpell,
  isCombatDamageShield,
  isComboPointConsumer,
  isDefenseReactSpell,
  isDispelSpell,
  isFeignDeathSpell,
  isThreatDumpUtility,
  isHostileSelfUtilityBuff,
  isInterruptSpell,
  isPureInterruptSpell,
  isLongArmorKeepUp,
  isSingleTargetPartyBuff,
  isMageArmorSpell,
  isManaDrainKeepUp,
  isMaxHealthPctEmergency,
  isDamagelessHardCc,
  isFearSpell,
  isMultiTargetCombatSpell,
  isNovaKiteSpell,
  isPiercingHowlSpell,
  novaKiteConditions,
  NOVA_KITE_STEP_BACK_YD,
  piercingHowlGapConditions,
  multiTargetNeedsPackDensity,
  isNonKeepUpUtility,
  isOffensiveBurstCooldown,
  burstCooldownConditions,
  isOverpowerSpell,
  isHunterParryReactSpell,
  isPresenceKeepUpOnly,
  isPureHotSpell,
  pureHotSelfConditions,
  isBattleRezSpell,
  isResurrectSpell,
  isSealSpell,
  isSelfDefensiveSpell,
  isThreatOrTauntUtility,
  isTrueWeaponImbueSpell,
  isUseHealthstoneLabel,
  requiredFormIdFromStances,
  resurrectGateConditions,
  sealKindOf,
  sealKindPriority,
  shouldDropEmptyEffectRule,
  shouldScheduleTargetDebuffKeepUp,
  shouldSkipBuffKeepUp,
  spellAppliesTargetAura,
  UNDEAD_DEMON_CREATURE_MASK,
} from './classify.ts';
import { bestCombatConsumables, combatConsumableConditions, friendlyCastItemGate } from './consumables.ts';
import { primarySpec } from './spec.ts';
import {
  applyClassAfterFallback,
  applyClassAfterSuggestion,
  spellAllowedInRoleBucketFallback,
  type FinalizeContext,
} from './classes/index.ts';

// Default conditions and phase for a manually added spell rule. Mirrors the generator's
// classification and returns `phase` as a HINT — the editor keeps whatever the user chose.
export function defaultSpellRuleConditions(
  s: SpellDef,
  char: Character,
): { conditions: Condition[]; phase: RotationPhase } {
  // Interrupts first: even a dual-role spell gets the casting gate on a manual add, since the
  // generator already lists the nuke usage. The gate is visible and deletable.
  if (isInterruptSpell(s)) {
    return { conditions: [cond('target', 'castingPresent', '==', 1)], phase: 'combat' };
  }
  // Dispel: prefill the gate for its primary category — a friendly debuff for cures, an enemy buff
  // for offensive-only ones. The user adds the other subject; the generator lists both.
  if (isDispelSpell(s)) {
    const cats = s.effects.filter((e) => e.kind === 'dispel').map((e) => (e as { dispelType: number }).dispelType);
    const cat = cats[0] ?? 1;
    const offensiveOnly = cat === 5 || cat === 6 || cat === 8 || cat === 9; // stealth/invisibility/npc/enrage
    return {
      conditions: [offensiveOnly
        ? cond('target', 'dispellablePresent', '==', 1, cat)
        : cond('self', 'dispellablePresent', '==', 1, cat)],
      phase: 'combat',
    };
  }
  // True TEMP imbues only — poison conjure vials use itemCount via role:'conjure' (KI-369).
  if (isTrueWeaponImbueSpell(s)) {
    // ref 2: cast while any eligible weapon hand is open (MH-first empty fill on spell path).
    return { conditions: [cond('self', 'weaponImbuePresent', '==', 0, 2)], phase: 'buffs' };
  }
  // Party rez: never buffPresent keep-up (no self aura → thrash at costPct 75–90%).
  // Gate on a dead friendly; snapshot defaults deadAllyCount to 0 until death is modelled.
  if (isResurrectSpell(s)) {
    // Rebirth is combat-castable (battle rez, long CD); classic OOC rezzes stay buffs-phase.
    return {
      conditions: resurrectGateConditions(),
      phase: isBattleRezSpell(s) ? 'combat' : 'buffs',
    };
  }
  // Overpower: post-dodge react only (never CP — warriors have no combo points).
  if (isOverpowerSpell(s)) {
    return { conditions: [cond('target', 'dodgedRecently', '==', 1)], phase: 'combat' };
  }
  if (isComboPointConsumer(s)) {
    const isSnd = s.effects.some((e) => e.kind === 'buff' && e.mod === 'haste');
    return {
      conditions: isSnd
        ? [
          cond('self', 'comboPoints', '>=', SND_MIN_COMBO_POINTS),
          cond('self', 'buffPresent', '==', 0, s.id),
        ]
        : [cond('self', 'comboPoints', '>=', 4)],
      phase: 'combat',
    };
  }
  const totemSlot = totemSlotOfSpell(s);
  if (totemSlot && totemSlot !== 'none') {
    return { conditions: [cond('self', 'totemPresent', '==', 0, totemSlotIndex(totemSlot))], phase: 'pull' };
  }
  if (isSealSpell(s)) {
    return { conditions: [cond('self', 'buffPresent', '==', 0, s.id)], phase: 'combat' };
  }
  // Form / stance enter: only when not already in that form. Recasting the same form
  // toggles OFF in combat — empty conditions → enter/leave spam every GCD.
  if (isFormSpell(s) || formIdFromLabel(s.name) != null) {
    const formId = formIdForRotationSpell(s);
    return {
      conditions: formId ? [cond('self', 'formId', '!=', formId)] : [],
      phase: 'combat',
    };
  }
  // Feign Death: an enemy is on you. NOT gated on a live pet — the source has no pet term, and that
  // gate kept it from firing exactly when the hunter is about to be the one that dies.
  if (isFeignDeathSpell(s)) {
    return {
      conditions: [cond('self', 'hasAggro', '==', 1)],
      phase: 'combat',
    };
  }
  // Damage cooldowns / racials: spend it into the fight, never a low-health panic.
  if (isOffensiveBurstCooldown(s)) {
    return { conditions: burstCooldownConditions(s), phase: 'combat' };
  }
  // Pure mechanic-immunity casts (Berserker Rage) gate on the control they remove. Only the first
  // mechanic can be prefilled here, since this returns one set; the defaults emit the rest.
  {
    const ccBreaks = ccBreakGateConditions(s);
    if (ccBreaks[0]) return { conditions: ccBreaks[0], phase: 'combat' };
  }
  // Self defensives (Ice Block, Divine Shield, Shield Wall): health gate in combat,
  // never enemy debuff keep-up (KI-213 / KI-395 / KI-407).
  if (isSelfDefensiveSpell(s)) {
    return {
      conditions: [cond('self', 'healthPct', '<', DEFAULT_THRESHOLDS.emergencyDefensivePct)],
      phase: 'combat',
    };
  }
  // A threat DUMP is not a taunt and had the taunt's gate, so Feint and Cower fired only while the
  // target was on somebody else — never the situation they exist for. Dumps take the inverse.
  if (isThreatDumpUtility(s)) {
    return { conditions: [cond('self', 'targetAttackingMe', '==', 1)], phase: 'combat' };
  }
  if (isThreatOrTauntUtility(s)) {
    return { conditions: [cond('self', 'targetAttackingMe', '==', 0)], phase: 'combat' };
  }
  // Frost Nova: fire when anyone is in the disc, then step back. Not "target is casting".
  if (isNovaKiteSpell(s)) {
    return { conditions: novaKiteConditions(s), phase: 'combat' };
  }
  // Fear: only when the target is not already feared. Not "enemy is casting" — that default
  // is for sheep/poly. Any fear (this spell, Howl, Scream) counts as detected.
  if (isFearSpell(s)) {
    return { conditions: [cond('target', 'feared', '==', 0)], phase: 'combat' };
  }
  // Howl is control (hostile speed) so the generic branch below would stamp "enemy is casting".
  if (isPiercingHowlSpell(s)) {
    return { conditions: piercingHowlGapConditions(s), phase: 'combat' };
  }
  // Pure CC (sheep/poly/sap): default to "enemy is casting" so free-form kits
  // sheep casters without a hand-written gate. User can ✕ the condition for hard-CC any target.
  if ((s.role ?? inferRole(s)) === 'control' && !isInterruptSpell(s)) {
    return { conditions: [cond('target', 'castingPresent', '==', 1)], phase: 'combat' };
  }
  // Hostile aura appliers (Sunder Armor, Faerie Fire, curses): a stacking aura reapplies below its
  // cap, a single-instance one only when missing. Respects hostile:false — true enemy auras only.
  if (shouldScheduleTargetDebuffKeepUp(s) && hostileAuraEffect(s)) {
    const cap = hostileStackCap(s);
    return {
      conditions: cap
        ? [cond('target', 'debuffStacks', '<', cap, s.id)]
        : [cond('target', 'debuffPresent', '==', 0, s.id)],
      phase: 'combat',
    };
  }

  const role = s.role ?? inferRole(s);
  const hasHeal = s.effects.some((e) => e.kind === 'heal' || e.kind === 'restore_health');
  const conjured = s.effects.find((e) => e.kind === 'conjure');
  switch (role) {
    case 'pet_summon':
      return { conditions: [cond('pet', 'alive', '==', 0)], phase: 'buffs' };
    case 'pet_heal': {
      // Health Funnel spends the owner's HP — don't start it inside the potion band.
      const petHeal = [
        cond('pet', 'alive', '==', 1),
        cond('pet', 'healthPct', '<', DEFAULT_THRESHOLDS.petHealLowPct),
        ...(s.powerType === 'health'
          ? [cond('self', 'healthPct', '>', DEFAULT_THRESHOLDS.potionLowPct)]
          : []),
      ];
      return { conditions: petHeal, phase: 'recovery' };
    }
    case 'conjure': {
      return {
        conditions: conjured
          ? [cond('self', 'itemCount', '<', conjureItemCountThreshold(s), conjured.item)]
          : [],
        phase: 'buffs',
      };
    }
    case 'dot':
      // Mana drains are situational — not permanent missing-debuff keep-ups (KI-324).
      if (isManaDrainKeepUp(s)) {
        return { conditions: [], phase: 'combat' };
      }
      // Channeled multi-target damage (Blizzard / RoF / Hellfire / …) is multi-gated,
      // never single-target DoT keep-up (KI-216 family).
      if (isChanneledAoeDamageSpell(s)) {
        return { conditions: channeledAoeDamageConditions(s), phase: 'combat' };
      }
      // Refresh the DoT only when the target doesn't already have it.
      return { conditions: [cond('target', 'debuffPresent', '==', 0, s.id)], phase: 'combat' };
    case 'control':
      // Situational CC (Polymorph, Fear, Sap, Bash, …) is not a solo trash keep-up.
      // Editor prefill: empty conditions (user can add gates); never force target.debuffPresent.
      return { conditions: [], phase: 'combat' };
    case 'buff':
      if (isBloodrageSpell(s)) {
        return {
          conditions: [cond('self', 'powerPct', '<', DEFAULT_THRESHOLDS.bloodrageBelowPowerPct)],
          phase: 'pull',
        };
      }
      if (isLongArmorKeepUp(s) || isHostileSelfUtilityBuff(s) || isNonKeepUpUtility(s)) {
        if (isHostileSelfUtilityBuff(s) || isNonKeepUpUtility(s)) {
          return { conditions: [], phase: 'combat' }; // editor hint only; builder omits from auto
        }
        return {
          conditions: [cond('self', 'buffPresent', '==', 0, s.id)],
          phase: 'buffs',
        };
      }
      if (hasHeal && !isLongArmorKeepUp(s)) {
        // Pure HoTs (Renew/Rejuv): also require buff missing — never thrash while ticking.
        if (isPureHotSpell(s)) {
          return { conditions: pureHotSelfConditions(s.id), phase: 'recovery' };
        }
        return { conditions: [cond('self', 'healthPct', '<', DEFAULT_THRESHOLDS.healLowPct)], phase: 'recovery' };
      }
      if (isMaxHealthPctEmergency(s)) {
        return {
          conditions: [cond('self', 'healthPct', '<', DEFAULT_THRESHOLDS.emergencyDefensivePct)],
          phase: 'recovery',
        };
      }
      // Keep-up buffs recast only once the buff has fallen off. Long-cooldown self mitigation is
      // already handled above, and long-CD arms default to combat rather than pull thrash.
      const longPartyBuff = s.effects.some(
        (e) =>
          e.kind === 'buff'
          && (e as { applyTo?: string }).applyTo === 'party'
          && (e.durationMs ?? 0) >= 300_000,
      );
      return {
        conditions: [cond('self', 'buffPresent', '==', 0, s.id)],
        phase: s.outOfCombatOnly
          || s.effects.some((e) => e.kind === 'damage_shield' || e.kind === 'proc_trigger_spell')
          || longPartyBuff
          ? 'buffs'
          : shouldSkipBuffKeepUp(s)
            ? 'combat'
            : 'pull',
      };
    case 'charge':
      return { conditions: [], phase: 'pull' };
    case 'shoot':
      return {
        conditions: classPowerType(char.cls) === 'mana'
          ? [cond('self', 'powerPct', '<', DEFAULT_THRESHOLDS.shootBelowPowerPct)]
          : [],
        phase: 'combat',
      };
    default:
      return { conditions: [], phase: 'combat' };
  }
}

// Default conditions for a manually added ITEM rule — potions, gems, healthstones, elixirs. An
// apply_buff item defaults to COMBAT so a mid-fight re-apply works; the OOC path stays unusable.
export function defaultItemRuleConditions(
  effectKind: 'restore_health' | 'restore_power' | 'apply_buff' | 'hostile_cast'
    | 'friendly_cast' | 'weapon_imbue' | string,
  opts?: {
    itemEntry?: number; buffSpellId?: number; hand?: 'mainhand' | 'offhand';
    // The on-use SpellDef of a `friendly_cast` item, so the gate can read what it actually lands.
    // Absent keeps the pre-payload behaviour (the CC gate), which is right for the trinkets.
    spell?: SpellDef; spellId?: number; ds?: DataStore;
  },
): { conditions: Condition[]; phase: RotationPhase; autoOff?: boolean; neverAuto?: boolean } {
  if (effectKind === 'restore_health') {
    return { conditions: [cond('self', 'healthPct', '<', DEFAULT_THRESHOLDS.potionLowPct)], phase: 'recovery' };
  }
  if (effectKind === 'restore_power') {
    return { conditions: [cond('self', 'powerPct', '<', DEFAULT_THRESHOLDS.manaRestoreLowPct)], phase: 'recovery' };
  }
  if (effectKind === 'apply_buff') {
    const ref = opts?.buffSpellId ?? opts?.itemEntry;
    return {
      conditions: ref != null
        ? [cond('self', 'buffPresent', '==', 0, ref)]
        : [],
      phase: 'combat',
    };
  }
  // Grenades / bombs / Tidal Charm. The old catch-all put these in recovery with NO
  // conditions, i.e. "throw a bomb whenever off cooldown, ahead of everything else".
  if (effectKind === 'hostile_cast') {
    return { conditions: [cond('target', 'healthPct', '>', 30)], phase: 'combat' };
  }
  // `friendly_cast` is six unrelated shapes (immunity, cure, summon, absorb, speed, damage coat).
  // With the payload in hand each gets its own gate; without it the CC gate is the old default.
  if (effectKind === 'friendly_cast') {
    if (opts?.spell && opts.spellId != null) {
      return friendlyCastItemGate(opts.spell, opts.spellId, opts.ds);
    }
    return { conditions: [cond('self', 'controlled', '==', 1)], phase: 'combat' };
  }
  // Temp weapon imbue (stone, oil, poison), buffs phase only: EffectEnchantItemTmp is
  // out-of-combat, so this is pre-pull prep. ref 0 is mainhand and 1 is offhand.
  if (effectKind === 'weapon_imbue') {
    const ref = opts?.hand === 'offhand' ? 1 : 0;
    return { conditions: [cond('self', 'weaponImbuePresent', '==', 0, ref)], phase: 'buffs' };
  }
  return { conditions: [], phase: 'recovery' };
}

// True when the label tokens match the DB name exactly, or as a consecutive token run, so
// "healing potion" fits "minor healing potion". No inside-token match: "Rip" is not "Riptide".
function labelMatchKind(dbName: string, label: string): 'exact' | 'fuzzy' | null {
  const a = normalizeSpellName(dbName);
  const b = normalizeSpellName(label);
  if (!a || !b) return null;
  if (a === b) return 'exact';
  const aTok = a.split(' ').filter(Boolean);
  const bTok = b.split(' ').filter(Boolean);
  if (!bTok.length || bTok.length > aTok.length) return null;
  // Single-token labels only match as a full token (not "rip" inside "riptide").
  for (let i = 0; i <= aTok.length - bTok.length; i++) {
    if (bTok.every((t, j) => aTok[i + j] === t)) return 'fuzzy';
  }
  return null;
}

/** True when two free-text labels refer to the same spell/item (exact or token containment). */
function labelMatchesName(dbName: string, label: string): boolean {
  return labelMatchKind(dbName, label) != null;
}

function spellRankScore(s: SpellDef): number {
  if ((s.rank ?? 0) > 0) return s.rank ?? 0;
  return s.spellLevel ?? s.reqLevel ?? 0;
}

function betterKnownRank(a: SpellDef, b: SpellDef): boolean {
  // Prefer weapon_imbue apply spells over create-item / empty same-name ranks (poison vials).
  const aImbue = a.effects?.some((e) => e.kind === 'weapon_imbue') ? 1 : 0;
  const bImbue = b.effects?.some((e) => e.kind === 'weapon_imbue') ? 1 : 0;
  if (aImbue !== bImbue) return aImbue > bImbue;
  // Prefer castable parent (trigger_spell Charge/Bloodrage) over aura/stun companion of the same name.
  const aTrig = a.effects?.some((e) => e.kind === 'trigger_spell') ? 1 : 0;
  const bTrig = b.effects?.some((e) => e.kind === 'trigger_spell') ? 1 : 0;
  if (aTrig !== bTrig) return aTrig > bTrig;
  const ra = spellRankScore(a);
  const rb = spellRankScore(b);
  return ra > rb || (ra === rb && a.id > b.id);
}

// Best known rank for any of `labels`. Rank parentheses (Create Healthstone (Major)) share a base
// name; "Charge" still does not bind "Charge Stun".
export function resolveBestKnownSpell(
  labels: readonly string[],
  known: readonly SpellDef[],
  level: number,
): SpellDef | null {
  for (const label of labels) {
    const labelBase = rankBaseSpellName(label);
    let best: SpellDef | null = null;
    for (const s of known) {
      if ((s.reqLevel ?? 0) > level) continue;
      const exact = labelMatchKind(s.name, label) === 'exact';
      const sameRank = !exact && labelBase.length > 0 && rankBaseSpellName(s.name) === labelBase;
      if (!exact && !sameRank) continue;
      if (!best || betterKnownRank(s, best)) best = s;
    }
    if (best) return best;
  }
  return null;
}

/** Catalog inject for trainer-gap identities only — not talent-gated (Stormstrike/Holy Shield = KI-889). */
function isIdentityCatalogLabel(label: string): boolean {
  const n = normalizeSpellName(label);
  return n === 'judgement' || n === 'auto shot';
}

// Prefer the player castable over LEARN_SPELL stubs and creature clones when resolving identity
// labels from the full catalog. Cite: LEARN_SPELL Effect1=36 is never the castable action.
function betterCatalogIdentity(a: SpellDef, b: SpellDef): boolean {
  const raw0 = (s: SpellDef) => s.rawEffects?.[0]?.effect ?? 0;
  const score = (s: SpellDef): number => {
    const e0 = raw0(s);
    if (e0 === 36) return -100; // LEARN_SPELL wrapper — not the castable
    let sc = 0;
    if ((s.spellFamilyName ?? 0) > 0) sc += 10;
    sc += (s.rank ?? 0);
    sc += (s.reqLevel ?? 0);
    sc -= s.id * 1e-9;
    return sc;
  };
  return score(a) > score(b);
}

/** Classic player Judgement (seal unleash). Cite: spell_template Id 20271, Effect1=77 SCRIPT_EFFECT. */
const PLAYER_JUDGEMENT_ID = 20271;

// Best catalog rank for identity labels, beyond the current spellbook: exact name, reqLevel at or
// under the character's, no LEARN stubs. Judgement always resolves to player spell 20271.
export function resolveBestCatalogSpell(
  labels: readonly string[],
  ds: DataStore,
  level: number,
): SpellDef | null {
  for (const label of labels) {
    if (!isIdentityCatalogLabel(label)) continue;
    // Player Judgement is a single unranked SCRIPT_EFFECT spell — never pick LEARN/creature clones.
    if (normalizeSpellName(label) === 'judgement') {
      const j = ds.spell(PLAYER_JUDGEMENT_ID);
      if (j && !j.passive && (j.reqLevel ?? 0) <= level) return j;
      continue;
    }
    let bestExact: SpellDef | null = null;
    let bestFuzzy: SpellDef | null = null;
    for (const s of ds.allSpells()) {
      if (s.passive) continue;
      if ((s.reqLevel ?? 0) > level) continue;
      // Never schedule a LEARN_SPELL wrapper as the combat action.
      if ((s.rawEffects?.[0]?.effect ?? 0) === 36) continue;
      const kind = labelMatchKind(s.name, label);
      if (kind === 'exact') {
        if (!bestExact || betterCatalogIdentity(s, bestExact)) bestExact = s;
      } else if (kind === 'fuzzy') {
        if (!bestFuzzy || betterCatalogIdentity(s, bestFuzzy)) bestFuzzy = s;
      }
    }
    if (bestExact) return bestExact;
    if (bestFuzzy) return bestFuzzy;
  }
  return null;
}

// Authored potion, healthstone and bandage rows are stored as `spell:` but resolve to catalog
// items. A real ability label must never fall through to gear, librams, tomes or scrolls.
function suggestionAllowsItemResolve(sug: SuggestionRule): boolean {
  if (sug.kind === 'item') return true;
  return sug.labels.some((l) => {
    const n = normalizeSpellName(l);
    return /\bpotion\b/.test(n) || /\bhealthstone\b/.test(n) || /\bbandage\b/.test(n);
  });
}

// All non-passive known spells at their highest rank, including bake "utility" stubs like Life Tap
// that have empty effects. For suggestion name resolve only — session usability is still the gate.
export function knownSpellsForSuggestionResolve(
  char: Character,
  sb: SpellBook,
  ds: DataStore,
): SpellDef[] {
  // level gating for RANKS is in resolveBestKnownSpell; `char.level` here only feeds the
  // interpreter so level-scaled scripted effects resolve before the inert-phantom check.
  const byName = new Map<string, SpellDef>();
  for (const id of sb.known) {
    const s = ds.spell(id);
    if (!s || s.passive) continue;
    // Client-hidden internals (Opening / Grovel / Duel / Attacking) are never rotation actions.
    if (isHiddenInternalSpell(s)) continue;
    // Never resolve authored "Charge"/"Intercept"/"Pounce" labels onto stun/bleed payloads
    // (fuzzy token match would otherwise prefer "Charge Stun" over a missing Charge).
    if (isTriggeredSecondarySpell(s, ds)) continue;
    const key = rankBaseSpellName(s.name) || s.name;
    const prev = byName.get(key);
    if (!prev || betterKnownRank(s, prev)) byName.set(key, s);
  }
  return [...byName.values()];
}

// Labels that may intentionally resolve to bag or catalog items when authored as spell rows. An
// unlearned class spell must NOT fall through to a training scroll (KI-278 / KI-334).
function isConsumableItemLabel(label: string): boolean {
  const n = normalizeSpellName(label);
  if (!n) return false;
  return (
    /\b(potion|elixir|flask|healthstone|bandage|food|water|drink|oil|juju|salt|mana gem|mana agate|mana jade|mana citrine|mana ruby)\b/.test(n)
    || /^(minor|lesser|greater|superior|major|mighty)\s+healing\b/.test(n)
    || /^healing\s+potion$/.test(n)
    || /^health\s+potion$/.test(n)
    || /^potion$/.test(n)
  );
}

/** Training / recipe items that fuzzy-match spell names but are not combat consumables. */
function isSpellTrainingItemName(itemName: string): boolean {
  const n = normalizeSpellName(itemName);
  return (
    /\b(scroll|tablet|tome|grimoire|libram|codex|book of|manual of|formula:|plans:|pattern:|schematic:|recipe:)\b/.test(n)
  );
}

// The catalog half of one label resolve, memoized per store (0 caches "no match") — every label
// comparison runs through normalizeSpellName, so the normalized string is a complete key.
const catalogItemMemo = new WeakMap<DataStore, Map<string, number>>();

function resolveCatalogItem(
  label: string,
  ds: DataStore,
  level: number,
  spellFallthrough: boolean,
): number | null {
  let memo = catalogItemMemo.get(ds);
  if (!memo) { memo = new Map(); catalogItemMemo.set(ds, memo); }
  const key = `${normalizeSpellName(label)}|${level}|${spellFallthrough ? 1 : 0}`;
  const hit = memo.get(key);
  if (hit !== undefined) return hit === 0 ? null : hit;
  let found = 0;
  for (const it of ds.allItems()) {
    // HJ1: catalog fallthrough must never pick classic-db GM/QA/test junk (e.g. "Monster - …" weapons
    // matching short combat labels). Bags still win above — only the unowned catalog scan is filtered.
    if (it.notObtainable) continue;
    if (
      labelMatchesName(it.name, label)
      && (it.requiredLevel ?? 0) <= level
      && !(spellFallthrough && isSpellTrainingItemName(it.name))
    ) {
      found = it.entry;
      break;
    }
  }
  memo.set(key, found);
  return found === 0 ? null : found;
}

// Resolve an item label to an entry: bags first, else the first catalog name match at or under the
// character's level. With spellFallthrough, only consumable-style names are accepted.
export function resolveBestItem(
  labels: readonly string[],
  ds: DataStore,
  level: number,
  inventory?: Inventory,
  opts?: { spellFallthrough?: boolean },
): number | null {
  const spellFallthrough = opts?.spellFallthrough === true;
  for (const label of labels) {
    if (spellFallthrough && !isConsumableItemLabel(label)) continue;
    if (inventory) {
      for (const stack of inventory.stacks) {
        const it = ds.item(stack.item);
        if (
          it
          && labelMatchesName(it.name, label)
          && (it.requiredLevel ?? 0) <= level
          && !(spellFallthrough && isSpellTrainingItemName(it.name))
        ) {
          return it.entry;
        }
      }
    }
    const fromCatalog = resolveCatalogItem(label, ds, level, spellFallthrough);
    if (fromCatalog != null) return fromCatalog;
  }
  return null;
}

// Resolve a pack item label to a ROW: the entry to show plus its rank ladder. The packs author the
// bottom rung by name, so a level 60 character drank 70 HP until the row carried the family.
export function resolveBestItemRow(
  labels: readonly string[],
  ds: DataStore,
  char: Character,
  inventory?: Inventory,
  opts?: { spellFallthrough?: boolean },
): { itemEntry: number; family?: string } | null {
  const entry = resolveBestItem(labels, ds, char.level, inventory, opts);
  if (entry == null) return null;
  const family = consumableFamilyOfEntry(entry, ds);
  if (!family) return { itemEntry: entry };
  const best = bestFamilyItem(family, ds, { char, ...(inventory ? { inventory } : {}) });
  return { itemEntry: best?.entry ?? entry, family };
}

// ---- Role-bucket default (pre-suggestion fallback) ------------------------

// Classify known spells into role buckets — control, DoT, nuke and the rest. The full default when
// no suggestion pack applies, and the fallback tail after suggestion rules.
export function buildRoleBucketRotation(
  char: Character,
  sb: SpellBook,
  ds: DataStore,
  inventory?: Inventory,
): Rotation {
  const spells = knownUsableSpells(char, sb, ds);
  const buffs: RotationRule[] = [];
  const pull: RotationRule[] = [];
  const combat: RotationRule[] = [];
  const recovery: RotationRule[] = [];
  let n = 0;
  const rule = (action: RuleAction, conditions: Condition[]): RotationRule => ({ id: `d${n++}`, action, conditions, enabled: true });
  const spellRule = (s: SpellDef, conditions: Condition[]): RotationRule => rule({ kind: 'spell', spellId: s.id }, conditions);

  // Combat abilities are ordered by role priority so higher-value actions sit earlier in the list.
  const combatByRole: Record<string, RotationRule[]> = { control: [], dot: [], instant_nuke: [], nuke: [], strike: [], shoot: [] };
  // Spells whose rules are enemyCount>=2-gated (Cleave/Whirlwind/Arcane Explosion…)
  // — emitted before unconditional single-target rules in the same bucket.
  const multiTargetSpellIds = new Set<number>();
  const seals: SpellDef[] = [];       // paladin seals (only ONE is kept up — added after the loop)
  const judgements: SpellDef[] = [];  // paladin Judgement (unleashes the active seal)
  const finishers: RotationRule[] = []; // rogue finishers (CP-gated)
  const builders: RotationRule[] = [];  // rogue combo builders
  const reacts: RotationRule[] = [];    // post-dodge Overpower etc.
  const interrupts: RotationRule[] = []; // Kick/Pummel/Counterspell… fire only while the enemy casts
  const dispels: RotationRule[] = [];    // Cleanse/Cure/Remove Curse/Purge/Dispel Magic — fire only when a matching aura is up
  const cooldowns: RotationRule[] = [];  // damage CDs + racials (Death Wish, Blood Fury, Arcane Power…) and CC breaks
  // Spec for seal kind priority (Ret prefers Command). Guard missing talentTrees in unit stubs.
  const sealSpec = typeof (ds as { talentTrees?: unknown }).talentTrees === 'function'
    ? primarySpec(char, ds)
    : null;

  for (const s of spells) {
    if (isResurrectSpell(s)) {
      // Rebirth is the one resurrection that belongs in a rotation: near-instant, castable in
      // combat, and wasted if unused. Every other rez is a 10 s OOC cast and stays out.
      if (isBattleRezSpell(s)) {
        combat.push(spellRule(s, resurrectGateConditions()));
      }
      continue;
    }
    // Paladin seals are an exclusive family, collected for single-seal combat upkeep. Bake residual:
    // a seal often lacks role 'seal' and would otherwise land in buffs via proc_trigger_spell.
    if (isSealSpell(s)) {
      seals.push(s);
      continue;
    }
    // True weapon imbues (shaman Rockbiter/WF/…): OOC keep-up while any eligible hand open.
    // Poison *conjure* vials are NOT imbues — they fall through to role:'conjure' (KI-369/388).
    if (isTrueWeaponImbueSpell(s)) {
      buffs.push(spellRule(s, [cond('self', 'weaponImbuePresent', '==', 0, 2)]));
      continue;
    }
    // Interrupts sit at the very top of combat, gated on the enemy actually casting —
    // never wasted as a filler nuke, always ready when the cast bar appears.
    if (isInterruptSpell(s)) {
      interrupts.push(spellRule(s, [cond('target', 'castingPresent', '==', 1)]));
      continue;
    }
    // Dispels sit next to interrupts, gated on a matching aura being present — one rule per
    // category, so a multi-cure fires on poison OR disease OR magic, and only when it would act.
    if (isDispelSpell(s)) {
      for (const conds of dispelGateConditions(s)) dispels.push(spellRule(s, conds));
      continue;
    }
    // Damage cooldowns and racials are placed HERE, ahead of the role switch: most bake empty, and
    // isNonKeepUpUtility drops every empty-effect long CD, so the role path could only discard them.
    if (isOffensiveBurstCooldown(s, (id) => ds.spell(id))) {
      cooldowns.push(spellRule(s, burstCooldownConditions(s)));
      continue;
    }
    // Pure mechanic-immunity self casts (Berserker Rage): cast to shed the control, never on
    // low health. One rule per mechanic the snapshot can see — conditions are ANDed.
    {
      const ccBreaks = ccBreakGateConditions(s);
      if (ccBreaks.length) {
        for (const conds of ccBreaks) cooldowns.push(spellRule(s, conds));
        continue;
      }
    }

    const role = s.role ?? inferRole(s);
    // Direct heals + HoTs (Renew / Rejuvenation are restore_health in bake).
    const hasHeal = s.effects.some((e) => e.kind === 'heal' || e.kind === 'restore_health');
    const conjured = s.effects.find((e) => e.kind === 'conjure');
    // Overpower: dodge react — not a CP finisher (bake wrongly flags requiresComboPoints).
    if (isOverpowerSpell(s)) {
      reacts.push(spellRule(s, [cond('target', 'dodgedRecently', '==', 1)]));
      continue;
    }
    // Revenge / Riposte: self defense-react only — never bare strike/control thrash (KI-251).
    if (isDefenseReactSpell(s)) {
      reacts.push(spellRule(s, [cond('self', 'defenseReactRecently', '==', 1)]));
      continue;
    }
    // Counterattack: the hunter's own parry (AURA_STATE_HUNTER_PARRY), not the defense window.
    if (isHunterParryReactSpell(s)) {
      reacts.push(spellRule(s, [cond('self', 'hunterParryRecently', '==', 1)]));
      continue;
    }
    // Combo-point kit: gate finishers on CP and leave builders as free fillers, so Eviscerate is
    // not cast at 0 CP ahead of Sinister Strike. Real energy consumers only, not rage bake noise.
    if (isComboPointConsumer(s)) {
      const isSnd = s.effects.some((e) => e.kind === 'buff' && e.mod === 'haste');
      if (isSnd) {
        finishers.push(spellRule(s, [
          cond('self', 'comboPoints', '>=', 1),
          cond('self', 'buffPresent', '==', 0, s.id),
        ]));
      } else {
        finishers.push(spellRule(s, [cond('self', 'comboPoints', '>=', 4)]));
      }
      continue;
    }
    if (s.comboPointsGenerated && !isComboPointConsumer(s)) {
      builders.push(spellRule(s, []));
      continue;
    }
    switch (role) {
      case 'pet_summon':
        // Summon/Call when there is no living pet. (Summon Imp is free; the other demons cost a
        // soul shard, but those aren't in the current data slice — no shard gate here.)
        buffs.push(spellRule(s, [cond('pet', 'alive', '==', 0)]));
        break;
      case 'totem_summon': {
        // Drop totem on pull when the element slot is empty (Wave 1D). Slot gate stops thrash
        // across ranks/families (Searing vs Magma both fire), not only the same spell id.
        const slot = totemSlotOfSpell(s);
        if (slot && slot !== 'none') {
          pull.push(spellRule(s, [cond('self', 'totemPresent', '==', 0, totemSlotIndex(slot))]));
        }
        break;
      }
      case 'pet_heal':
        recovery.push(spellRule(s, [
          cond('pet', 'alive', '==', 1),
          cond('pet', 'healthPct', '<', DEFAULT_THRESHOLDS.petHealLowPct),
          ...(s.powerType === 'health'
            ? [cond('self', 'healthPct', '>', DEFAULT_THRESHOLDS.potionLowPct)]
            : []),
        ]));
        break;
      case 'pet_tame':
        // Taming is a deliberate, target-specific action — not part of the auto rotation by default.
        break;
      case 'conjure': {
        // Conjure Food/Water stock a few (conjureBelow=5); stones/gems/reagents hold one (KI-225/311/370/376).
        buffs.push(spellRule(s, conjured
          ? [cond('self', 'itemCount', '<', conjureItemCountThreshold(s), conjured.item)]
          : []));
        break;
      }
      case 'buff': {
        // knownUsableSpells may fill effects via the interpreter while the bake row is still
        // empty — never schedule a permanent missing-debuff keep-up on an empty bake (KI-359).
        const bakeHasEffects = ((ds.spell(s.id)?.effects?.length) ?? 0) > 0;
        if (
          bakeHasEffects
          && shouldScheduleTargetDebuffKeepUp(s)
          && hostileAuraEffect(s)
        ) {
          // A hostile aura applier keeps it ON THE TARGET — reapply below the stack cap or when
          // missing — never as a self-buff. hostile:false self mods fall through to the buff paths.
          const hostileCap = hostileStackCap(s);
          combatByRole.control.push(spellRule(s, hostileCap
            ? [cond('target', 'debuffStacks', '<', hostileCap, s.id)]
            : [cond('target', 'debuffPresent', '==', 0, s.id)]));
        } else if (isHostileSelfUtilityBuff(s) || isNonKeepUpUtility(s)) {
          // Amplify Magic (raises damage taken), Blink/Cold Snap/PoM empty keep-ups: omit from auto.
          break;
        } else if (isBloodrageSpell(s)) {
          // Rage generator — only when low on rage (KI-330), never unconditional always.
          pull.push(spellRule(s, [cond('self', 'powerPct', '<', DEFAULT_THRESHOLDS.bloodrageBelowPowerPct)]));
        } else if (isLongArmorKeepUp(s) || isMageArmorSpell(s) || isHunterAspectSpell(s)) {
          // Long armor keep-ups belong here, never recovery-on-low-HP (KI-398/412). Mage Armor is six
          // resists and Monkey a bare dodge, so the exclusion family (group 13 / 10) is the real test.
          buffs.push(spellRule(s, [cond('self', 'buffPresent', '==', 0, s.id)]));
        } else if (hasHeal && !isLongArmorKeepUp(s)) {
          // A heal is a recovery action (fire below the health threshold).
          // Pure HoTs also require the buff missing — never thrash while already ticking.
          recovery.push(spellRule(
            s,
            isPureHotSpell(s)
              ? pureHotSelfConditions(s.id)
              : [cond('self', 'healthPct', '<', DEFAULT_THRESHOLDS.healLowPct)],
          ));
        } else if (isMaxHealthPctEmergency(s)) {
          // Last Stand (+30% HP): emergency recovery, never pull buffPresent thrash (KI-375).
          recovery.push(spellRule(s, [
            cond('self', 'healthPct', '<', DEFAULT_THRESHOLDS.emergencyDefensivePct),
          ]));
        } else if (s.effects.some((e) => e.kind === 'weapon_imbue')) {
          // Weapon imbues: exclusive TEMP hand gate, OOC keep-up.
          buffs.push(spellRule(s, [cond('self', 'weaponImbuePresent', '==', 0, 0)]));
        } else if (isCombatDamageShield(s)) {
          // Short combat damage shields (Holy Shield) are tank identity in combat, not OOC prep
          // thrash; long shields stay OOC below. Protection knows it while the packs omit it.
          combatByRole.control.push(spellRule(s, [cond('self', 'buffPresent', '==', 0, s.id)]));
        } else if (isSelfDefensiveSpell(s)) {
          // Divine Shield / Shield Wall / similar: panic self CD in combat (health gate),
          // never enemy debuff / pull thrash (KI-213 / KI-259).
          combatByRole.control.push(spellRule(s, [
            cond('self', 'healthPct', '<', DEFAULT_THRESHOLDS.emergencyDefensivePct),
          ]));
        } else if (shouldSkipBuffKeepUp(s)) {
          // Long-CD combat CDs / next-cast arms / pure immunity bursts (Recklessness,
          // Fel Domination, Berserker Rage) — not maintainable keep-ups (KI-373/374/377).
          break;
        } else if (
          s.effects.some((e) => e.kind === 'damage_shield' || e.kind === 'proc_trigger_spell')
          || s.outOfCombatOnly
          // Long party blessings (Salvation/Dampen ≥5m) — OOC buffs phase, not enemy debuff.
          // Short combat shouts (Battle Shout 2m) stay pull keep-ups.
          || s.effects.some(
            (e) =>
              e.kind === 'buff'
              && (e as { applyTo?: string }).applyTo === 'party'
              && (e.durationMs ?? 0) >= 300_000,
          )
        ) {
          // Keep-up OOC: Lightning Shield / long proc auras / armor buffs / long party blessings.
          // Gate on buffPresent so we never thrash-cast every prep tick (weapon imbues handled above).
          buffs.push(spellRule(s, [cond('self', 'buffPresent', '==', 0, s.id)]));
        } else {
          // A combat buff (Battle Shout): fire once during the opener.
          pull.push(spellRule(s, [cond('self', 'buffPresent', '==', 0, s.id)]));
        }
        break;
      }
      case 'charge':
        // Charge Stun / Intercept Stun are trigger companions — never pull openers.
        if (normalizeSpellName(s.name).includes('stun')) break;
        pull.push(spellRule(s, []));
        break;
      case 'control':
        // Self defensives mis-roled as control (Ice Block, Divine Intervention: self CC+immunity).
        // Combat + self.healthPct so panic CDs stay in the fight list (KI-395 / KI-407).
        if (isSelfDefensiveSpell(s)) {
          combatByRole.control.push(spellRule(s, [
            cond('self', 'healthPct', '<', DEFAULT_THRESHOLDS.emergencyDefensivePct),
          ]));
          break;
        }
        // Threat dumps / taunts / pure threat — never enemy debuff keep-ups (KI-268/271/277…).
        if (isThreatOrTauntUtility(s)) break;
        // Frost Nova: root whoever is in the 10 yd disc, then walk out. Other CC stays
        // off the default list (poly/fear/sap are not trash keep-ups).
        if (isNovaKiteSpell(s)) {
          combatByRole.control.push({
            ...spellRule(s, novaKiteConditions(s)),
            after: { stepBackYd: NOVA_KITE_STEP_BACK_YD },
          });
          break;
        }
        // Situational CC is not a permanent solo keep-up, but dropping it left the generated
        // rotation with none at all. Emit the authored packs' shape: hold a SECOND mob in a pack.
        if (isDamagelessHardCc(s)) {
          combatByRole.control.push(
            rule(
              { kind: 'spell', spellId: s.id, target: 'other' },
              [cond('self', 'enemyCount', '>=', 2)],
            ),
          );
        }
        break;
      case 'dot':
        // Pure mana drains (Drain Mana) — situational, not missing-debuff keep-ups (KI-324).
        if (isManaDrainKeepUp(s)) break;
        // Channeled multi-target damage → radius/pack gate only (never ST debuff keep-up).
        // True single-target DoTs still reapply when missing on the primary target.
        if (isChanneledAoeDamageSpell(s)) {
          combatByRole.dot.push(spellRule(s, channeledAoeDamageConditions(s)));
        } else {
          combatByRole.dot.push(spellRule(s, [cond('target', 'debuffPresent', '==', 0, s.id)]));
        }
        break;
      case 'instant_nuke':
        if (isMultiTargetCombatSpell(s)) multiTargetSpellIds.add(s.id);
        combatByRole.instant_nuke.push(spellRule(s, []));
        break;
      case 'nuke':
        if (isMultiTargetCombatSpell(s)) multiTargetSpellIds.add(s.id);
        combatByRole.nuke.push(spellRule(s, []));
        break;
      case 'strike':
        if (isMultiTargetCombatSpell(s)) multiTargetSpellIds.add(s.id);
        combatByRole.strike.push(spellRule(s, []));
        break;
      case 'seal':
        seals.push(s);
        break;
      case 'judgement':
        judgements.push(s);
        break;
      case 'form':
        // Form and stance enter is authored by suggestion bands with formId gates. Role-bucket does
        // NOT auto-list every known form — Travel and Aquatic would thrash the combat forms.
        break;
      case 'shoot':
        // Wand Shoot is a caster's out-of-mana filler. Hunters also get Auto Shot as combat filler,
        // since packs often omit it. Rage and energy Throw is NOT auto-cast — it flips to ranged.
        if (classUsesRangedAuto(char.cls)) {
          combatByRole.shoot.push(spellRule(s, []));
        } else if (classPowerType(char.cls) === 'mana') {
          combatByRole.shoot.push(spellRule(s, [cond('self', 'powerPct', '<', DEFAULT_THRESHOLDS.shootBelowPowerPct)]));
        }
        break;
      default:
        break; // utility etc. — not auto-used by default
    }
  }

  // Interrupts first (casting-gated, so they cost nothing when the enemy isn't casting),
  // then dodge reacts (Overpower), then SnD/finishers (already CP-gated), then control/dots.
  for (const r of interrupts) combat.push(r);
  for (const r of dispels) combat.push(r);
  for (const r of reacts) combat.push(r);
  // Cooldowns above the damage buckets: a burst is worth more than the filler it displaces, and
  // once spent its own cooldown makes it unusable, so the pick falls straight through.
  for (const r of cooldowns) combat.push(r);
  for (const r of finishers) combat.push(r);
  // Within each offensive bucket, multi-target rules go FIRST: they fire only on packs, and behind
  // an unconditional single-target rule the pick would starve them on every GCD.
  const isMultiRule = (r: RotationRule): boolean =>
    r.action.kind === 'spell' && multiTargetSpellIds.has(r.action.spellId);
  for (const key of ['control', 'dot', 'instant_nuke', 'nuke', 'strike', 'shoot'] as const) {
    const bucket = combatByRole[key];
    for (const r of bucket) if (isMultiRule(r)) combat.push(r);
    for (const r of bucket) if (!isMultiRule(r)) combat.push(r);
  }
  for (const r of builders) combat.push(r);

  // Paladin seal-and-Judgement loop: only ONE seal can be up, so keep a single spec-aware seal
  // rather than one rule per seal. Seal upkeep is top priority; Judgement fires while it is up.
  if (seals.length) {
    const pri = sealKindPriority(sealSpec);
    const best = [...seals].sort(
      (a, b) =>
        (pri[sealKindOf(b)] ?? -1) - (pri[sealKindOf(a)] ?? -1)
        || b.rank - a.rank,
    )[0]!;
    combat.unshift(spellRule(best, [cond('self', 'buffPresent', '==', 0, best.id)]));
    // Judgement(s) right after seal upkeep: only when the (best) seal is up.
    let at = 1;
    for (const j of judgements) combat.splice(at++, 0, spellRule(j, [cond('self', 'buffPresent', '==', 1, best.id)]));
  }

  // In-combat RESTORE items become recovery rules: a potion or healthstone as an emergency backup
  // below the heals, a mana item when mana runs low. Appended AFTER heals so a real heal wins.
  // Every other kit kind is seeded by syncCompanionBagItemRules with its own gate: folded here, a
  // Skull of Impending Doom (4984, friendly_cast) read "use when mana is low" and drained the mana.
  if (inventory) {
    // A conjured stone is FREE and sits on its own cooldown category, so spending it first costs
    // nothing and keeps the bought potion for the next spike. Stable — everything else keeps order.
    const kit = combatItems(char, inventory, ds)
      .filter((it) => it.effect.kind === 'restore_health' || it.effect.kind === 'restore_power');
    const stones = kit.filter((it) => isHealthstoneItem(ds.item(it.entry)));
    const rest = kit.filter((it) => !isHealthstoneItem(ds.item(it.entry)));
    for (const it of [...stones, ...rest]) {
      const health = it.effect.kind === 'restore_health';
      recovery.push(rule({ kind: 'item', itemEntry: it.entry }, [
        cond('self', health ? 'healthPct' : 'powerPct', '<', health ? DEFAULT_THRESHOLDS.potionLowPct : DEFAULT_THRESHOLDS.manaRestoreLowPct),
      ]));
    }
  }

  // Collapse exclusive families (aspects, auras, stings, curses, weapon imbues, …) so
  // role-bucket never ships multi keep-ups that thrash every GCD (KI-246+ cluster).
  const resolve = (id: number) => spells.find((s) => s.id === id) ?? ds.spell(id);
  return {
    version: 1,
    cls: char.cls,
    phases: {
      prebuff: [],
      buffs: collapseExclusiveFamilyRules(buffs, resolve),
      pull: collapseExclusiveFamilyRules(pull, resolve),
      combat: collapseExclusiveFamilyRules(combat, resolve),
      recovery: collapseExclusiveFamilyRules(recovery, resolve),
    },
  };
}

/** Vanilla execute-style finishers (tooltip ≤20% HP or long-cast execute filler). */
const EXECUTE_SPELL_NAMES = new Set([
  'hammer of wrath',
  'execute',
  'shadowburn',
  'soul fire',
  'kill shot',
]);

/** Stealth openers that must gate formId==STEALTH even when Stances is unset in bake. */
const STEALTH_OPENER_NAMES = new Set([
  'cheap shot',
  'ambush',
  'garrote',
  'sap',
  'premeditation',
  'pick pocket',
  'garrote - silence',
]);

// Dodge-reactive melee. Counterattack is NOT here: its CasterAuraState is 7 HUNTER_PARRY, so a hunter's
// parry arms it and a dodge does not (isHunterParryReactSpell). Cite: UnitAuraProcHandler.cpp:310-316.
const DODGE_REACT_NAMES = new Set([
  'overpower',
  'mongoose bite',
]);

// Snares / slows that often bake as direct_damage-only (no speed effect), so hostile-aura inference cannot
// attach a keep-up. Name list is the shared if-statement source.
const SNARE_KEEPUP_NAMES = new Set([
  'hamstring',
  'wing clip',
  'frost shock',
  'concussive shot',
  'crippling poison',
]);

// Self haste / enrage CDs that may have empty effects in bake still need buffPresent keep-up so they never
// sit as unconditional ALWAYS combat noise.
const SELF_CD_BUFF_NAMES = new Set([
  'rapid fire',
  'bestial wrath',
  'adrenaline rush',
  'inner focus',
  'bloodlust',
  'heroism',
  'iced veins',
  // Ice Block is a long-CD self immunity (isSelfDefensiveSpell) — health gate, not buff thrash.
  'evasion',
  'sprint',
  'blade flurry',
]);

function hasMetric(conditions: readonly Condition[], metric: CondMetric, subject?: CondSubject): boolean {
  return conditions.some(
    (c) => c.metric === metric && (subject == null || c.subject === subject),
  );
}

function spellNameKey(spell: { name?: string }): string {
  return normalizeSpellName(spell.name ?? '');
}

// One row per single-target party buff becomes two: the caster's keep-up, then the same spell aimed
// at whoever still lacks it. Out of combat only — buffing four people is a between-pulls act.
export function ensurePartyBuffRows(rot: Rotation, ds: DataStore): Rotation {
  const buffs = rot.phases.buffs;
  const already = new Set<number>();
  for (const r of buffs) {
    const t = r.action.kind === 'spell' ? r.action.target : undefined;
    if (t && typeof t === 'object' && 'allyMissingAura' in t) already.add(t.allyMissingAura);
  }
  const out: RotationRule[] = [];
  for (const r of buffs) {
    out.push(r);
    if (r.action.kind !== 'spell' || r.enabled === false || r.action.target != null) continue;
    const id = r.action.spellId;
    if (already.has(id)) continue;
    const sp = ds.spell(id);
    if (!sp || !isSingleTargetPartyBuff(sp)) continue;
    already.add(id);
    out.push({
      // Deterministic, like the `g-item-` bag rules: a re-sync of a stored list must not churn ids.
      id: `pb-ally-${id}`,
      action: { kind: 'spell', spellId: id, target: { allyMissingAura: id } },
      conditions: [cond('self', 'inCombat', '==', 0)],
      enabled: true,
    });
  }
  return out.length === buffs.length ? rot : { ...rot, phases: { ...rot.phases, buffs: out } };
}

// Shared semantic gates for auto-battler rules. Authored "usable" rows and role-bucket tails leave
// no conditions, which spams GCDs on execute tools, keep-ups and interrupts. Only appends.
export function applySemanticSpellGates(
  spell: SpellDef,
  conditions: Condition[],
  opts?: {
    immolateSpellId?: number;
    /** Kit/rotation knows Cleave — HS must not dump rage on packs (classic swap). */
    hasCleave?: boolean;
    /** Kit/rotation knows Swipe — Maul must not dump rage on packs. */
    hasSwipe?: boolean;
    /** Kit has a cooldown-bearing rage spender (MS/BT/Shield Slam/WW) — HS pools rage. */
    hasRageSignature?: boolean;
    /** Rotation carries a single-target taunt, i.e. this is a tank build. */
    hasTaunt?: boolean;
  },
): Condition[] {
  let c = bindConjureStockGate(spell, conditions);
  const name = spellNameKey(spell);

  // A Stances bit does NOT mean "only in that form": Balance nukes carry the Moonkin bit and the
  // allow-while-not-shapeshifted attr. Ask the engine's own classifier rather than the raw mask.
  const stanceForm = requiredFormIdFromStances(spell.stances ?? 0);
  const refusedUnshifted = shapeshiftCastError(spell, 0) !== 'ok';
  if (stanceForm != null && refusedUnshifted && !hasMetric(c, 'formId')) {
    c = ensureCondition(c, cond('self', 'formId', '==', stanceForm));
  } else if (STEALTH_OPENER_NAMES.has(name) && !hasMetric(c, 'formId')) {
    c = ensureCondition(c, cond('self', 'formId', '==', SHAPESHIFT_FORM.STEALTH));
  }

  // Heroic Strike and Cleave compete for the same next swing and rage, so with both in the kit HS
  // is 1v1 only — otherwise the cheaper HS spends every 12–19 rage and Cleave never affords.
  if (name === 'heroic strike' && opts?.hasCleave && !hasMetric(c, 'enemyCount')) {
    c = ensureCondition(c, cond('self', 'enemyCount', '<', 2));
  }
  if (name === 'maul' && opts?.hasSwipe && !hasMetric(c, 'enemyCount')) {
    c = ensureCondition(c, cond('self', 'enemyCount', '<', 2));
  }
  if (name === 'slam' && opts?.hasCleave && !hasMetric(c, 'enemyCount')) {
    c = ensureCondition(c, cond('self', 'enemyCount', '<', 2));
  }
  // Sunder's ST gate lives in classes/warrior.ts, the only pass that knows the spec. Here it fired
  // before tankize inserted Taunt, so Protection was gated too and stopped generating threat.

  // Pure interrupts only. Earth Shock is also the shaman instant filler, and injecting
  // castingPresent onto an authored always-copy made both rows interrupt-gated.
  if (isPureInterruptSpell(spell) && !hasMetric(c, 'castingPresent')) {
    c = ensureCondition(c, cond('target', 'castingPresent', '==', 1));
  }

  // Reacts (Revenge, Riposte) lived only in the suggestion path, so a spec that picked the spell up
  // from the role-bucket tail got it as bare unconditional filler.
  c = applyDefenseReactGate(spell, c);

  // The shipped packs carry a low-health gate on Recklessness and Berserker Rage, authored when
  // fear immunity read as a panic button. Repair the row here so the fix lands on packs on disk.
  const stripLowHealthGate = (conds: readonly Condition[]): Condition[] => conds.filter(
    (x) => !(x.subject === 'self' && x.metric === 'healthPct' && (x.op === '<' || x.op === '<=')),
  );
  // A burst and a CC break both OWN their gate: neither may fall through to the self-defensive
  // block below, which would re-add `healthPct < 35` precisely because this pass just removed it.
  let gateOwnedHere = false;
  if (isOffensiveBurstCooldown(spell)) {
    c = stripLowHealthGate(c);
    for (const g of burstCooldownConditions(spell)) {
      if (!hasMetric(c, g.metric, g.subject)) c = ensureCondition(c, g);
    }
    gateOwnedHere = true;
  } else {
    const ccBreaks = ccBreakGateConditions(spell);
    const first = ccBreaks[0]?.[0];
    if (first) {
      // Berserker Rage: health has nothing to do with it — the cast strips the fear.
      c = stripLowHealthGate(c);
      // A row that already names ANY mechanic this spell breaks owns its gate. Checking only the
      // highest-priority one ANDed a second condition onto an authored row, so it never fired.
      const named = ccBreaks.some((g) => g[0] != null && hasMetric(c, g[0].metric, 'self'));
      if (!named) c = ensureCondition(c, first);
      gateOwnedHere = true;
    }
  }

  // Self defensives: a self-stun plus school immunity bakes as `cc` and used to pick up an enemy
  // debuff keep-up. Strip that thrash and require a self health panic gate.
  if (!gateOwnedHere && isSelfDefensiveSpell(spell)) {
    c = c.filter(
      (x) => !(x.subject === 'target' && (x.metric === 'debuffPresent' || x.metric === 'debuffStacks')),
    );
    if (!hasMetric(c, 'healthPct', 'self')) {
      c = ensureCondition(
        c,
        cond('self', 'healthPct', '<', DEFAULT_THRESHOLDS.emergencyDefensivePct),
      );
    }
  }
  // Defense-react strikes (Riposte/Revenge) may have been authored as missing-debuff keep-ups
  // because of a secondary disarm/stun rider (KI-251). Keep only the react window.
  if (isDefenseReactSpell(spell)) {
    c = c.filter(
      (x) => !(x.subject === 'target' && (x.metric === 'debuffPresent' || x.metric === 'debuffStacks')),
    );
  }

  // Non-stacking hostile debuff keep-up. Armor shreds bake as a hostile buff with a negative mod,
  // so the dot bucket's gate never reached them. Sunder is excluded — its stacks are the point.
  const stacks = spell.stackAmount ?? 0;
  const hostileDebuff = (spell.effects ?? []).some(
    (e) => e.kind === 'dot'
      || (e.kind === 'buff' && (e.hostile === true || ((e as { pointsPerComboPoint?: number }).pointsPerComboPoint ?? 0) < 0)),
  );
  if (
    hostileDebuff
    && stacks <= 1
    && !isSelfDefensiveSpell(spell)
    && !isDefenseReactSpell(spell)
    && !isChanneledAoeDamageSpell(spell)
    && !multiTargetNeedsPackDensity(spell)
    && !hasMetric(c, 'debuffPresent')
    && !hasMetric(c, 'debuffStacks')
  ) {
    c = ensureCondition(c, cond('target', 'debuffPresent', '==', 0, spell.id));
  }

  // ---- Creature-type restricted (Exorcism / Holy Wrath / Turn …) ----------
  const bakedMask = spell.targetCreatureTypeMask ?? 0;
  const undeadDemonByName =
    name === 'exorcism' ||
    name === 'holy wrath' ||
    name === 'turn undead' ||
    name === 'turn evil';
  const typeMask = bakedMask || (undeadDemonByName ? UNDEAD_DEMON_CREATURE_MASK : 0);
  if (typeMask && !hasMetric(c, 'creatureTypeMask')) {
    c = ensureCondition(c, cond('target', 'creatureTypeMask', '==', 1, typeMask));
  }

  // ---- Execute window -----------------------------------------------------
  if (EXECUTE_SPELL_NAMES.has(name) && !hasMetric(c, 'healthPct', 'target')) {
    c = ensureCondition(
      c,
      cond('target', 'healthPct', '<', DEFAULT_THRESHOLDS.executeHealthPct),
    );
  }

  // ---- Reagents (Soul Shard on Shadowburn / Soul Fire / …) ----------------
  for (const r of spell.reagents ?? []) {
    if (!r?.item) continue;
    const need = Math.max(1, r.count ?? 1);
    if (!c.some((x) => x.metric === 'itemCount' && x.ref === r.item)) {
      c = ensureCondition(c, cond('self', 'itemCount', '>=', need, r.item));
    }
  }
  // Shadowburn/Soul Fire must not dump shards mid-fight even if reagents[] is empty in a stub.
  if (
    (name === 'shadowburn' || name === 'soul fire') &&
    !c.some((x) => x.metric === 'itemCount' && x.ref === SOUL_SHARD_ITEM)
  ) {
    c = ensureCondition(c, cond('self', 'itemCount', '>=', 1, SOUL_SHARD_ITEM));
  }

  // Gap snare, not a melee keep-up: rangeMax 0 makes Howl always "in range", and an own-id
  // debuffPresent gate retried every GCD while Hamstring already snared the target.
  if (isPiercingHowlSpell(spell)) {
    c = c.filter(
      (x) =>
        x.metric !== 'inMelee'
        && x.metric !== 'enemiesWithinYd'
        && x.metric !== 'enemyCount'
        && x.metric !== 'debuffPresent'
        && x.metric !== 'snared'
        && x.metric !== 'targetDistanceYd'
        && x.metric !== 'castingPresent',
    );
    for (const g of piercingHowlGapConditions(spell)) c = ensureCondition(c, g);
  }

  // Skip multi when a creature-type gate already restricts the spell: Holy Wrath must still fire on
  // a single undead. Radius-aware — a PBAoE counts enemies within its own radius, not fight-wide.
  if (
    multiTargetNeedsPackDensity(spell) &&
    !hasMetric(c, 'enemyCount') &&
    !hasMetric(c, 'enemiesWithinYd') &&
    !hasMetric(c, 'creatureTypeMask')
  ) {
    c = applyMultiTargetCombatGates(spell, c);
  }

  // Rage pooling: HS and Cleave spend rage off the GCD, so ungated they pin rage in the 20–29 band
  // and a 30-rage signature never casts. Pool at 50%+ so Bloodthirst can still fire.
  if (
    (name === 'heroic strike' || name === 'cleave')
    && opts?.hasRageSignature
    && !hasMetric(c, 'powerPct')
  ) {
    c = ensureCondition(c, cond('self', 'powerPct', '>=', name === 'cleave' ? 50 : 40));
  }

  // ---- Conflagrate requires Immolate on target (vanilla 1.12) --------------
  if (name === 'conflagrate' && !hasMetric(c, 'debuffPresent', 'target')) {
    const immolateId = opts?.immolateSpellId;
    if (immolateId) {
      c = ensureCondition(c, cond('target', 'debuffPresent', '==', 1, immolateId));
    } else {
      // No Immolate rank in the kit — still express the if-statement so the rule is
      // never unconditional ALWAYS (repro gate). Runtime will not match a foreign id.
      c = ensureCondition(c, cond('target', 'debuffPresent', '==', 1, spell.id));
    }
  }

  // ---- Pet-sourced drains (Dark Pact) -------------------------------------
  if (name === 'dark pact' && !hasMetric(c, 'alive', 'pet')) {
    c = ensureCondition(c, cond('pet', 'alive', '==', 1));
  }

  // ---- Dodge-reactive -----------------------------------------------------
  if (DODGE_REACT_NAMES.has(name) && !hasMetric(c, 'dodgedRecently')) {
    // Overpower: after the *target* dodges your swing. Mongoose Bite: after *you* dodge
    // (a hunter's dodge sets AURA_STATE_DEFENSE). combatSnapshot fills both subjects.
    const subject: CondSubject = name === 'overpower' ? 'target' : 'self';
    c = ensureCondition(c, cond(subject, 'dodgedRecently', '==', 1));
  }
  if (isHunterParryReactSpell(spell) && !hasMetric(c, 'hunterParryRecently')) {
    c = ensureCondition(c, cond('self', 'hunterParryRecently', '==', 1));
  }

  // Keep-ups for hostile auras, CC, DoTs and snares. Self immunities and parry reacts carry
  // secondary `cc` effects that must NOT become target debuff thrash.
  const hasTargetDebuffGate =
    hasMetric(c, 'debuffPresent', 'target') || hasMetric(c, 'debuffStacks', 'target');
  const skipEnemyDebuffKeepUp =
    isSelfDefensiveSpell(spell) || isDefenseReactSpell(spell) || isThreatOrTauntUtility(spell);

  // Channeled multi-target damage is multi-gated, never a single-target debuff keep-up, even though
  // it carries `dot` effects. Skipping the keep-up branch is what keeps that strip in place.
  if (!hasTargetDebuffGate && !isChanneledAoeDamageSpell(spell) && !skipEnemyDebuffKeepUp) {
    const hostile = hostileAuraEffect(spell);
    if (hostile) {
      const cap = (spell.stackAmount ?? 0) > 1 ? spell.stackAmount! : 0;
      c = ensureCondition(
        c,
        cap
          ? cond('target', 'debuffStacks', '<', cap, spell.id)
          : cond('target', 'debuffPresent', '==', 0, spell.id),
      );
    } else if (spell.effects.some((e) => e.kind === 'cc')) {
      c = ensureCondition(c, cond('target', 'debuffPresent', '==', 0, spell.id));
    } else if (spell.effects.some((e) => e.kind === 'dot')) {
      c = ensureCondition(c, cond('target', 'debuffPresent', '==', 0, spell.id));
    } else if (SNARE_KEEPUP_NAMES.has(name) && auraSidesOfSpell(spell).has('hostile')) {
      // By NAME, so the rogue's Crippling Poison VIAL (a conjure) matched too and got a gate on an
      // id that never lands on anyone — the row could not fire at all.
      c = ensureCondition(c, cond('target', 'debuffPresent', '==', 0, spell.id));
    }
  }

  // ---- Empty / self CD buff keep-up ---------------------------------------
  // Blade Flurry is also multi-gated above; still wants buff keep-up so it does not thrash.
  if (SELF_CD_BUFF_NAMES.has(name) && !hasMetric(c, 'buffPresent', 'self')) {
    c = ensureCondition(c, cond('self', 'buffPresent', '==', 0, spell.id));
  }

  // Mana Burn: empty-effects stub + Shadowform-only. Stances usually applied formId already;
  // fallback so Disc/Holy never list it as unconditional ALWAYS.
  if (name === 'mana burn' && c.length === 0) {
    c = ensureCondition(c, cond('self', 'formId', '==', SHAPESHIFT_FORM.SHADOWFORM));
  }

  // Party rez: rewrite buffPresent / ALWAYS thrash into deadAllyCount>=1 (custom saves).
  if (isResurrectSpell(spell)) {
    const thrash =
      c.length === 0
      || isPresenceKeepUpOnly(c)
      || c.every((x) => x.metric === 'buffPresent' || x.metric === 'debuffPresent');
    if (thrash) c = resurrectGateConditions();
    else if (!hasMetric(c, 'deadAllyCount')) {
      c = ensureCondition(c, cond('self', 'deadAllyCount', '>=', 1));
    }
  }

  return c;
}

// Final safety pass: every spell rule gets the shared semantic gates. Walks all phases so packs and
// role-bucket tails never ship an unconditional ALWAYS for a gated tool.
export function ensureSemanticSpellGates(rot: Rotation, ds: DataStore): Rotation {
  // Prefer an Immolate already listed in this rotation so Conflagrate matches the live rank.
  let immolateSpellId: number | undefined;
  let hasCleave = false;
  let hasSwipe = false;
  let hasRageSignature = false;
  let hasTaunt = false;
  for (const phase of ROTATION_PHASES) {
    for (const r of rot.phases[phase] ?? []) {
      if (r.action.kind !== 'spell') continue;
      const sp = ds.spell(r.action.spellId);
      if (!sp) continue;
      const key = spellNameKey(sp);
      if (key === 'immolate' && immolateSpellId == null) immolateSpellId = sp.id;
      if (key === 'cleave') hasCleave = true;
      if (key === 'swipe') hasSwipe = true;
      if (key === 'taunt' || key === 'growl') hasTaunt = true;
      // A cooldown-bearing rage spender (Mortal Strike, Shield Slam, Whirlwind) means HS and Cleave
      // must pool rage rather than spam. Those often bake empty effects, so count them too.
      if (
        sp.powerType === 'rage'
        && (sp.cooldownMs ?? 0) > 0
        && key !== 'heroic strike'
        && key !== 'cleave'
        && (
          sp.effects.some((e) => e.kind === 'direct_damage' || e.kind === 'weapon_percent_damage')
          || (sp.strikeBonus ?? 0) > 0
          || sp.role === 'strike'
          || key === 'bloodthirst'
          || key === 'mortal strike'
          || key === 'whirlwind'
          || key === 'shield slam'
        )
      ) {
        hasRageSignature = true;
      }
    }
  }
  const gateOpts = { immolateSpellId, hasCleave, hasSwipe, hasRageSignature, hasTaunt };

  const mapRules = (rules: RotationRule[]): RotationRule[] =>
    rules.flatMap((r) => {
      if (r.action.kind !== 'spell') return [r];
      const spell = ds.spell(r.action.spellId);
      if (!spell) return [r];
      // Drop party rez from auto-generated lists entirely: the role bucket already skips it, and
      // this catches thrash that would spend costPct with no corpse. Manual adds keep their gate.
      if (isResurrectSpell(spell) && (r.conditions.length === 0 || isPresenceKeepUpOnly(r.conditions))) {
        return [];
      }
      // Form enter stays on applyFormEnterGate (formId != form); do not add formId == form.
      // Never stamp emergency healthPct on form ENTER (leave-to-heal keeps formId== + health).
      if (isFormSpell(spell) || formIdFromLabel(spell.name) != null) {
        const fid = formIdForRotationSpell(spell);
        const isLeave =
          fid > 0
          && r.conditions.some((c) => c.metric === 'formId' && c.op === '==' && c.value === fid);
        let next = applySemanticSpellGates(
          { ...spell, stances: 0 }, // enter spells must not get formId==
          r.conditions,
          gateOpts,
        );
        if (!isLeave) {
          // Only the gate this pass STAMPED goes: a health term the row was authored with is the
          // author saying which form to be in at what health, and dropping it made the pvp feral
          // band's "bear when it is going badly" fire at any health at all.
          const authored = new Set(
            r.conditions.filter((c) => c.subject === 'self' && c.metric === 'healthPct')
              .map((c) => `${c.op}${c.value}`),
          );
          next = next.filter(
            (c) => !(c.subject === 'self' && c.metric === 'healthPct' && !authored.has(`${c.op}${c.value}`)),
          );
        }
        if (next === r.conditions) return [r];
        return [{ ...r, conditions: next }];
      }
      const next = applySemanticSpellGates(spell, r.conditions, gateOpts);
      if (next === r.conditions) return [r];
      return [{ ...r, conditions: next }];
    });

  return {
    ...rot,
    phases: {
      prebuff: mapRules(rot.phases.prebuff ?? []),
      buffs: mapRules(rot.phases.buffs),
      pull: mapRules(rot.phases.pull),
      combat: mapRules(rot.phases.combat),
      recovery: mapRules(rot.phases.recovery),
    },
    ...(rot.overrides
      ? {
          overrides: Object.fromEntries(
            Object.entries(rot.overrides).map(([k, rules]) => [k, mapRules(rules)]),
          ),
        }
      : {}),
  };
}

// Every category a dispel spell can actually cure gets its own rule. Each pack authored ONE gate
// per cure, so 8 Molten Core seats knew Dispel Magic and none could strip a magic debuff.
// A pure `buffPresent == 0` keep-up in a UNIQUE_PER_CASTER family must also require the family's
// SITUATIONAL rows to be absent. Applying one member strips the others (applySpell.ts
// dropExclusionGroupSiblings; spell_group 10 Aspects), so a buffs-phase Aspect of the Hawk and a
// combat Aspect of the Monkey traded the GCD every 1.5 s forever — 27 aspect casts in 40 s.
export function ensureExclusiveFamilyKeepUpYields(rot: Rotation, ds: DataStore): Rotation {
  const situationalByFamily = new Map<string, Set<number>>();
  const pureByFamily = new Map<string, Set<number>>();
  for (const phase of ROTATION_PHASES) {
    for (const r of rot.phases[phase] ?? []) {
      if (r.action.kind !== 'spell') continue;
      const sp = ds.spell(r.action.spellId);
      if (!sp) continue;
      const fam = exclusiveKeepupFamily(sp);
      if (fam == null) continue;
      const bucket = isPresenceKeepUpOnly(r.conditions) ? pureByFamily : situationalByFamily;
      let ids = bucket.get(fam);
      if (!ids) bucket.set(fam, (ids = new Set()));
      ids.add(r.action.spellId);
    }
  }
  if (pureByFamily.size === 0) return rot;
  const mapRules = (rules: RotationRule[]): RotationRule[] => rules.map((r) => {
    if (r.action.kind !== 'spell') return r;
    if (!isPresenceKeepUpOnly(r.conditions)) return r;
    const sp = ds.spell(r.action.spellId);
    const fam = sp ? exclusiveKeepupFamily(sp) : null;
    if (fam == null) return r;
    const siblings = situationalByFamily.get(fam);
    if (!siblings) return r;
    let conditions = r.conditions;
    for (const sid of siblings) {
      if (sid === r.action.spellId) continue;
      // The sibling's OWN side. Hardcoding the caster's bar was right for Aspects and wrong for
      // Curses, which land on the target: Curse of Agony's pull row could never close.
      const sib = ds.spell(sid);
      if (!sib) continue;
      conditions = ensureCondition(conditions, keepUpPresenceCondition(sib));
    }
    return conditions === r.conditions ? r : { ...r, conditions };
  });
  return {
    ...rot,
    phases: {
      prebuff: mapRules(rot.phases.prebuff ?? []),
      buffs: mapRules(rot.phases.buffs),
      pull: mapRules(rot.phases.pull),
      combat: mapRules(rot.phases.combat),
      recovery: mapRules(rot.phases.recovery),
    },
  };
}

export function ensureDispelGates(rot: Rotation, ds: DataStore): Rotation {
  let n = 0;
  const mapRules = (rules: RotationRule[]): RotationRule[] => {
    // (spellId, subject, category) already present anywhere in this phase — including the
    // authored row itself, so a re-run adds nothing.
    const have = new Set<string>();
    for (const r of rules) {
      if (r.action.kind !== 'spell') continue;
      for (const c of r.conditions) {
        if (c.metric !== 'dispellablePresent') continue;
        have.add(`${r.action.spellId}|${c.subject}|${c.ref ?? -1}`);
      }
    }
    return rules.flatMap((r) => {
      if (r.action.kind !== 'spell') return [r];
      const spell = ds.spell(r.action.spellId);
      if (!spell || !isDispelSpell(spell)) return [r];
      if (!r.conditions.some((c) => c.metric === 'dispellablePresent')) return [r];
      const spellId = r.action.spellId;
      // Anything the author gated on besides the category (health, enemy count) rides along.
      const carried = r.conditions.filter((c) => c.metric !== 'dispellablePresent');
      // An OR group cannot share an AND factor (conditionsPass has no parentheses), so a row that
      // carries other gates takes ONE category per row; an ungated one keeps the group OR-joined.
      const groups = carried.length
        ? dispelGateConditions(spell).flatMap((g) => g.map((c) => {
          const { join: _drop, ...one } = c;
          return [one];
        }))
        : dispelGateConditions(spell);
      const key = (c: Condition): string => `${spellId}|${c.subject}|${c.ref ?? -1}`;
      let head = r;
      const out: RotationRule[] = [];
      for (const conds of groups) {
        const fresh = conds.filter((c) => !have.has(key(c)));
        if (!fresh.length) continue;
        for (const c of fresh) have.add(key(c));
        // Same subject, nothing else on the row: fold the categories in. Purify shipped "disease"
        // and "poison" as two rows the player then kept in sync by hand.
        if (!carried.length && head.conditions.some(
          (c) => c.metric === 'dispellablePresent' && c.subject === fresh[0]!.subject,
        )) {
          head = {
            ...head,
            conditions: [...head.conditions, ...fresh.map((c) => ({ ...c, join: 'or' as const }))],
          };
          continue;
        }
        // Dropping a covered category off the front would leave an `or` leading the group.
        const { join: _lead, ...lead } = fresh[0]!;
        out.push({
          ...r,
          id: `dg${n++}_${r.id}`,
          conditions: [...carried, lead, ...fresh.slice(1)],
        });
      }
      return [head, ...out];
    });
  };
  return {
    ...rot,
    phases: {
      prebuff: mapRules(rot.phases.prebuff ?? []),
      buffs: mapRules(rot.phases.buffs),
      pull: mapRules(rot.phases.pull),
      combat: mapRules(rot.phases.combat),
      recovery: mapRules(rot.phases.recovery),
    },
    ...(rot.overrides
      ? {
          overrides: Object.fromEntries(
            Object.entries(rot.overrides).map(([k, rules]) => [k, mapRules(rules)]),
          ),
        }
      : {}),
  };
}

// A known cure with no authored pair gets a combat row. Same re-sync as party buffs: a stored
// list predates learning Tranq 19801, and only a level/respec rebuilds a default.
export function ensureKnownDispelRows(rot: Rotation, sb: SpellBook, ds: DataStore): Rotation {
  // Never a pvp band: those omissions are decisions. Filling them moved
  // pvpBands.rowsThatCancelTheirOwnBandsForm 22 -> 27 (Shadowform dropped for Abolish Disease).
  if (rot.autoSig?.mode === 'pvp') return rot;
  // Pairs any phase already gates on, so this adds nothing to a list the packs covered.
  const have = new Set<string>();
  for (const phase of ROTATION_PHASES) {
    for (const r of rot.phases[phase] ?? []) {
      for (const c of r.conditions) {
        if (c.metric === 'dispellablePresent') have.add(`${c.subject}|${c.ref ?? -1}`);
      }
    }
  }
  // Highest-level cure wins the pair: Abolish Poison (32) supersedes Cure Poison (16).
  const known: SpellDef[] = [];
  for (const id of sb.known) {
    const s = ds.spell(id);
    if (s && isDispelSpell(s)) known.push(s);
  }
  known.sort((a, b) => (b.spellLevel ?? 0) - (a.spellLevel ?? 0) || (b.rank ?? 0) - (a.rank ?? 0) || a.id - b.id);
  const add: RotationRule[] = [];
  for (const s of known) {
    for (const conds of dispelGateConditions(s)) {
      // Only the categories nothing covers yet. Dropping one off the front of an OR-joined group
      // would leave the group led by an `or`, which conditionsPass reads as a new group.
      const fresh = conds.filter((c) => !have.has(`${c.subject}|${c.ref ?? -1}`));
      if (!fresh.length) continue;
      for (const c of fresh) have.add(`${c.subject}|${c.ref ?? -1}`);
      const { join: _lead, ...head } = fresh[0]!;
      add.push({
        // Deterministic, like the `pb-ally-` party rows: a re-sync must not churn ids.
        id: `dispel-${s.id}-${head.subject}-${fresh.map((c) => c.ref ?? -1).join('-')}`,
        action: { kind: 'spell', spellId: s.id },
        conditions: [head, ...fresh.slice(1)],
        enabled: true,
      });
    }
  }
  if (!add.length) return rot;
  // hoistDispelRules owns WHERE a dispel row sits; a covered list returned above, so nothing moves.
  return {
    ...rot,
    phases: { ...rot.phases, combat: hoistDispelRules([...rot.phases.combat, ...add]) },
  };
}

// Same gates as the role-bucket defaults: 4+ so a low-CP dump cannot jump the builders, and Slice
// and Dice at the top rung (finisherLadder.ts SND_MIN_COMBO_POINTS says why).
function applyComboPointGates(spell: SpellDef, conditions: Condition[]): Condition[] {
  if (!isComboPointConsumer(spell)) return conditions;
  const isSnd = spell.effects.some((e) => e.kind === 'buff' && e.mod === 'haste');
  return ensureCondition(
    conditions,
    cond('self', 'comboPoints', '>=', isSnd ? SND_MIN_COMBO_POINTS : 4),
  );
}

// Overpower (and any post-dodge react): ensure target.dodgedRecently even when role-bucket/fallback or
// partial when-map omitted it.
function applyOverpowerDodgeGate(spell: SpellDef, conditions: Condition[]): Condition[] {
  if (!isOverpowerSpell(spell)) return conditions;
  // Strip bogus CP gates left from older defaults / hand-edited rules.
  const cleaned = conditions.filter((c) => c.metric !== 'comboPoints');
  return ensureCondition(cleaned, cond('target', 'dodgedRecently', '==', 1));
}

// Drop keep-up debuffPresent/debuffStacks gates when the spell never applies a target aura (Scorch is
// direct_damage only without Improved Scorch talent wiring — gate never clears).
function stripFalseDebuffKeepUp(spell: SpellDef, conditions: Condition[]): Condition[] {
  if (spellAppliesTargetAura(spell)) return conditions;
  const next = conditions.filter(
    (c) => !(c.subject === 'target' && (c.metric === 'debuffPresent' || c.metric === 'debuffStacks') && c.ref === spell.id),
  );
  return next;
}

// Final safety pass for a default build: every form or stance enter rule gets `formId != form`.
// Walks all phases so no path leaves a form cast as a bare always-when-ready toggle thrash.
export function ensureFormEnterGates(rot: Rotation, ds: DataStore): Rotation {
  const mapRules = (rules: RotationRule[]): RotationRule[] =>
    rules.map((r) => {
      if (r.action.kind !== 'spell') return r;
      const spell = ds.spell(r.action.spellId);
      if (!spell) return r;
      const formId = formIdForRotationSpell(spell);
      if (!formId && !isFormSpell(spell)) return r;
      if (!formId) return r;
      const next = applyFormEnterGate(spell, r.conditions);
      if (next === r.conditions) return r;
      return { ...r, conditions: next };
    });
  return {
    ...rot,
    phases: {
      prebuff: mapRules(rot.phases.prebuff ?? []),
      buffs: mapRules(rot.phases.buffs),
      pull: mapRules(rot.phases.pull),
      combat: mapRules(rot.phases.combat),
      recovery: mapRules(rot.phases.recovery),
    },
    ...(rot.overrides
      ? {
          overrides: Object.fromEntries(
            Object.entries(rot.overrides).map(([k, rules]) => [k, mapRules(rules)]),
          ),
        }
      : {}),
  };
}

// Expand a multi-label combat suggestion into one rule per distinct known spell, preserving author
// order and skipping labels that do not resolve. With none resolving, fall back to first-match.
function expandCombatAlternativeRules(
  sug: SuggestionRule,
  known: readonly SpellDef[],
  char: Character,
  ds: DataStore,
  inventory: Inventory | undefined,
  nextId: () => string,
): RotationRule[] {
  const out: RotationRule[] = [];
  const seen = new Set<number>();
  for (const label of sug.labels) {
    const spell = resolveBestKnownSpell([label], known, char.level);
    if (!spell || seen.has(spell.id)) continue;
    seen.add(spell.id);
    const rule = suggestionRuleToRotationRule(
      { ...sug, label: spell.name, labels: [label] },
      known,
      char,
      ds,
      inventory,
      nextId(),
    );
    if (rule) out.push(rule);
  }
  if (out.length) return out;
  const fallback = suggestionRuleToRotationRule(sug, known, char, ds, inventory, nextId());
  return fallback ? [fallback] : [];
}

// Pack-baked conditions → live Condition[]. `ACTION_SPELL` refs bind to the resolved spell id so rank
// upgrades stay correct inside a level band.
function bakeSuggestionConditions(
  baked: NonNullable<SuggestionRule['conditions']>,
  opts: { actionSpellId?: number; itemEntry?: number },
): Condition[] {
  const out: Condition[] = [];
  for (const c of baked) {
    const metric = c.metric as Condition['metric'];
    const op = c.op as Condition['op'];
    if (!metric || !op) continue;
    const subject = (c.subject ?? 'self') as Condition['subject'];
    let ref: number | undefined;
    if (c.ref === 'ACTION_SPELL') {
      if (opts.actionSpellId == null) continue;
      ref = opts.actionSpellId;
    } else if (c.ref === 'ITEM') {
      if (opts.itemEntry == null) continue;
      ref = opts.itemEntry;
    } else if (typeof c.ref === 'number') {
      ref = c.ref;
    }
    out.push({
      subject,
      metric,
      op,
      value: c.value | 0,
      ...(ref != null ? { ref } : {}),
    });
  }
  return out;
}

function suggestionRuleToRotationRule(
  sug: SuggestionRule,
  known: readonly SpellDef[],
  char: Character,
  ds: DataStore,
  inventory: Inventory | undefined,
  id: string,
): RotationRule | null {
  // A `move` row resolves no spell, so it is settled before the label guards below. Cite:
  // RuleAction `{ kind: 'move' }` (types.ts:227), executed at the top of advanceGapClose.
  if (sug.kind === 'move') {
    if (!sug.move) return null;
    const authored = Array.isArray(sug.conditions) ? sug.conditions : [];
    return {
      id,
      action: { kind: 'move', move: sug.move },
      conditions: authored.length ? bakeSuggestionConditions(authored, {}) : [],
      enabled: true,
    };
  }
  if (sug.kind === 'noop' || sug.labels.length === 0) return null;

  const hasBaked = Array.isArray(sug.conditions) && sug.conditions.length > 0;

  // ---- Fully authored pack row: pack conditions win, no invent -----------------
  if (hasBaked) {
    const wantsHealthstoneItem = isUseHealthstoneLabel(sug.label, sug.labels);
    if (wantsHealthstoneItem || sug.kind === 'item') {
      const row = resolveBestItemRow(sug.labels, ds, char, inventory);
      if (row == null) return null;
      return {
        id,
        action: { kind: 'item', ...row },
        conditions: bakeSuggestionConditions(sug.conditions!, { itemEntry: row.itemEntry }),
        enabled: true,
      };
    }
    let spell =
      resolveBestKnownSpell(sug.labels, known, char.level)
      ?? resolveBestCatalogSpell(sug.labels, ds, char.level);
    if (!spell) return null;
    if (!spell.effects.some((e) => e.kind === 'trigger_spell')) {
      const parent = known.find(
        (k) =>
          k.id !== spell!.id
          && k.effects.some((e) => e.kind === 'trigger_spell' && e.spellId === spell!.id),
      );
      if (parent) spell = parent;
    }
    // Pack rows used fight-wide enemyCount and a debuff keep-up, so Nova fired at bolt range. Only
    // those two gates are dropped now, so an authored root-DR or proximity gate survives.
    if (isNovaKiteSpell(spell)) {
      const authored = bakeSuggestionConditions(sug.conditions!, { actionSpellId: spell.id });
      return {
        id,
        action: { kind: 'spell', spellId: spell.id },
        conditions: [
          ...novaKiteConditions(spell),
          ...authored.filter((c) => c.metric !== 'enemyCount'
            && !(c.subject === 'target'
              && (c.metric === 'debuffPresent' || c.metric === 'debuffStacks'))),
        ],
        enabled: true,
        after: { stepBackYd: NOVA_KITE_STEP_BACK_YD },
      };
    }
    // G15: every pvp band row is pre-baked, so this is the branch an authored retreat must ride.
    const bakedStep = sanitizeStepBackYd(sug.after?.stepBackYd);
    return {
      id,
      // `target: 'other'` is the CC selector — sheep the SECOND mob, not the tank's target.
      action: {
        kind: 'spell',
        spellId: spell.id,
        ...(sug.target === 'other' ? { target: 'other' as const } : {}),
      },
      conditions: bakeSuggestionConditions(sug.conditions!, { actionSpellId: spell.id }),
      enabled: true,
      ...(bakedStep ? { after: { stepBackYd: bakedStep } } : {}),
    };
  }

  const whenResult = mapWhen(sug.when, sug.label);
  // Unmapped with zero conditions and hard engine gap (no partial gates) — skip.
  if (whenResult.status === 'unmapped' && whenResult.conditions.length === 0) {
    return null;
  }
  if (whenResult.status === 'noop') return null;

  // "Use Healthstone" / plain healthstone labels → consumable item, never Create Healthstone (KI-397/405).
  const wantsHealthstoneItem = isUseHealthstoneLabel(sug.label, sug.labels);
  if (wantsHealthstoneItem) {
    const row = resolveBestItemRow(sug.labels, ds, char, inventory);
    if (row != null) {
      let conditions = materializeConditions(whenResult.conditions, { itemEntry: row.itemEntry });
      if (!conditions.some((c) => c.metric === 'healthPct')) {
        conditions = [...conditions, cond('self', 'healthPct', '<', DEFAULT_THRESHOLDS.potionLowPct)];
      }
      return {
        id,
        action: { kind: 'item', ...row },
        conditions,
        enabled: true,
      };
    }
    // No item in catalog/bags — drop rather than bind Create Healthstone as a "heal".
    return null;
  }

  // Known first; catalog only for trainer-gap identities (Judgement/Auto Shot). Talent rows need knows() (KI-889).
  // Item fallthrough restricted to consumable labels (KI-227 / KI-278 / KI-334).
  let spell =
    resolveBestKnownSpell(sug.labels, known, char.level)
    ?? resolveBestCatalogSpell(sug.labels, ds, char.level);
  if (spell) {
    // Create Healthstone* with no conjure effect cannot stock bags (empty bake thrash).
    if (
      /^create healthstone/i.test(spell.name) &&
      !spell.effects.some((e) => e.kind === 'conjure')
    ) {
      return null;
    }
    // Prefer castable parent over trigger companion (Charge Stun / Bloodrage tick).
    if (!spell.effects.some((e) => e.kind === 'trigger_spell')) {
      const parent = known.find(
        (k) =>
          k.id !== spell!.id
          && k.effects.some((e) => e.kind === 'trigger_spell' && e.spellId === spell!.id),
      );
      if (parent) spell = parent;
    }
    // Drop solo-hostile / thrash keep-ups even if a band listed them (KI-289, KI-408–410, KI-418).
    {
      const n = normalizeSpellName(spell.name);
      if (
        n === 'amplify magic'
        || n === 'blink'
        || n === 'cold snap'
        || n === 'presence of mind'
        || n === 'amplify curse'
      ) {
        return null;
      }
    }
    const slot = totemSlotOfSpell(spell);
    const conjured = spell.effects.find((e) => e.kind === 'conjure');
    const conjureItem = conjured && conjured.kind === 'conjure' ? conjured.item : undefined;
    // KI-249: mapWhen emits itemCount with ref:'ITEM'; resolve via conjure output entry so
    // Conjure Food / Mana Agate keep their stocked-bag gate (role-bucket already did this).
    let conditions = materializeConditions(whenResult.conditions, {
      actionSpellId: spell.id,
      itemEntry: conjureItem,
      totemSlot: slot && slot !== 'none' ? slot : undefined,
      actionStackAmount: spell.stackAmount,
    });
    // Create Healthstone/Soulstone: always gate on missing product even if when materialize dropped ITEM.
    if (conjured && conjured.kind === 'conjure' && /create (health|soul)stone/i.test(spell.name)) {
      if (!conditions.some((c) => c.metric === 'itemCount')) {
        conditions = [
          ...conditions,
          cond('self', 'itemCount', '<', DEFAULT_THRESHOLDS.conjureConsumableBelow, conjured.item),
        ];
      }
    }
    // Bloodrage: situational low-rage gate even when pack says "always" (KI-330).
    if (isBloodrageSpell(spell)) {
      conditions = ensureCondition(
        conditions,
        cond('self', 'powerPct', '<', DEFAULT_THRESHOLDS.bloodrageBelowPowerPct),
      );
    }
    // Long armor keep-ups must never inherit healthPct recovery gates from fuzzy when.
    if (isLongArmorKeepUp(spell)) {
      conditions = conditions.filter((c) => c.metric !== 'healthPct');
      conditions = ensureCondition(conditions, cond('self', 'buffPresent', '==', 0, spell.id));
    }
    // True weapon imbues only — never gate conjure-poison on weaponImbuePresent (KI-369/388).
    if (isTrueWeaponImbueSpell(spell)) {
      if (!conditions.some((c) => c.metric === 'weaponImbuePresent')) {
        conditions = [...conditions, cond('self', 'weaponImbuePresent', '==', 0, 2)];
      }
    } else if (
      conjureItem != null &&
      !conditions.some((c) => c.metric === 'itemCount')
    ) {
      // Conjure without a resolved itemCount clause (when "always" / dropped ITEM) → stock gate.
      conditions = [
        cond('self', 'itemCount', '<', DEFAULT_THRESHOLDS.conjureBelow, conjureItem),
        ...conditions,
      ];
    }
    // Wave 2-ROG: CP finishers + multi gates (Blade Flurry / channeled AoE).
    conditions = applyComboPointGates(spell, conditions);
    // Overpower: dodge react only (never CP; bake flags requiresComboPoints wrongly).
    conditions = applyOverpowerDodgeGate(spell, conditions);
    // Scorch-class: do not keep-up on a debuff the spell never applies.
    conditions = stripFalseDebuffKeepUp(spell, conditions);
    // Form/stance: never toggle-thrash (formId != form), even if when was "always"/empty.
    conditions = applyFormEnterGate(spell, conditions);
    // Revenge: never unconditional filler (must follow dodge/parry/block).
    conditions = applyDefenseReactGate(spell, conditions);
    // Multi-target: enemiesWithinYd (PBAoE) / enemyCount (ground). Channeled AoE damage
    // also strips ST debuff keep-up (Hellfire/Hurricane/RoF/Blizzard/Volley — KI-216).
    conditions = applyMultiTargetCombatGates(spell, conditions);
    if (isNovaKiteSpell(spell)) {
      // The disc gate exists to correct exactly two authored mistakes on a self-centred root: a
      // debuff keep-up and a fight-wide enemyCount. It used to replace the WHOLE list.
      conditions = [
        ...novaKiteConditions(spell),
        ...conditions.filter((c) => c.metric !== 'enemyCount'
          && !(c.subject === 'target'
            && (c.metric === 'debuffPresent' || c.metric === 'debuffStacks'))),
      ];
    }
    // Empty-bake ALWAYS / presence keep-ups burn GCDs on inert CDs (KI-364 Holy Shock, …).
    if (shouldDropEmptyEffectRule(spell, conditions)) return null;
    // Long-CD / next-cast / immunity arms authored as pull keep-ups → drop (KI-373–377).
    if (
      isPresenceKeepUpOnly(conditions)
      && (isMaxHealthPctEmergency(spell) || shouldSkipBuffKeepUp(spell))
    ) {
      return null;
    }
    // G15: an authored retreat wins over the nova-kite injection, which stays the default.
    const authoredStep = sanitizeStepBackYd(sug.after?.stepBackYd);
    const after = authoredStep
      ? { stepBackYd: authoredStep }
      : isNovaKiteSpell(spell) ? { stepBackYd: NOVA_KITE_STEP_BACK_YD } : null;
    return {
      id,
      action: { kind: 'spell', spellId: spell.id },
      conditions,
      enabled: true,
      ...(after ? { after } : {}),
    };
  }

  if (!suggestionAllowsItemResolve(sug)) {
    return null; // unlearned / phantom spell label — drop, do not catalog-fuzzy to items
  }

  // Authored item rows: full catalog resolve. Spell rows: consumable fallthrough only (block scrolls/tomes).
  const row = resolveBestItemRow(sug.labels, ds, char, inventory, {
    spellFallthrough: sug.kind !== 'item',
  });
  if (row != null) {
    const conditions = materializeConditions(whenResult.conditions, { itemEntry: row.itemEntry });
    return {
      id,
      action: { kind: 'item', ...row },
      conditions,
      enabled: true,
    };
  }

  return null; // unknown / unlearned — drop
}

// Build a rotation from the authored suggestion bands for this level and talent tree, keeping list
// order as priority. Known combat spells the bands omit are appended from the role buckets.
export function buildSuggestionRotation(
  char: Character,
  sb: SpellBook,
  ds: DataStore,
  inventory?: Inventory,
  classKey?: SuggestionClassKey,
  specOverride?: string | null,
  opts?: RotationBandOptions,
): Rotation {
  const key = classKey ?? suggestionClassKeyFromClassId(char.cls);
  if (!key) return buildRoleBucketRotation(char, sb, ds, inventory);

  const pack = getClassSuggestions(key);
  const spec = primarySpec(char, ds, specOverride);
  const band = selectBand(
    pack, char.level, spec,
    opts?.mode ? { mode: opts.mode, ...(opts.variant ? { variant: opts.variant } : {}) } : undefined,
  );
  if (!band) return buildRoleBucketRotation(char, sb, ds, inventory);

  // Wave 2-LOCK: resolve suggestions from full known book (Life Tap / Dark Pact utility stubs).
  const known = knownSpellsForSuggestionResolve(char, sb, ds);
  const knownById = new Map(known.map((s) => [s.id, s]));
  const phases: Record<RotationPhase, RotationRule[]> = {
    prebuff: [],
    buffs: [],
    pull: [],
    combat: [],
    recovery: [],
  };
  let n = 0;
  /** Per-phase used sets: a pull opener (LB) must still be eligible as combat filler (KI-278). */
  const usedSpellsByPhase: Record<RotationPhase, Set<number>> = {
    prebuff: new Set(),
    buffs: new Set(),
    pull: new Set(),
    combat: new Set(),
    recovery: new Set(),
  };
  const usedItemsByPhase: Record<RotationPhase, Set<number>> = {
    prebuff: new Set(),
    buffs: new Set(),
    pull: new Set(),
    combat: new Set(),
    recovery: new Set(),
  };
  /** Suggestion already picked a tree armor — suppress rival mage armors in fallback. */
  let suggestionHasMageArmor = false;

  for (const phase of SUGGESTION_PHASES) {
    const rotPhase: RotationPhase = phase;
    for (const sug of band.phases[phase as SuggestionPhase]) {
      // Combat slash-alts must expand to one rule per known alternative: first-label-wins collapsed
      // Assassination into Combat's kit. Buffs and pull keep first-match so upgrades do not thrash.
      const rules =
        phase === 'combat' && sug.kind === 'spell' && sug.labels.length > 1
          ? expandCombatAlternativeRules(sug, known, char, ds, inventory, () => `s${n++}`)
          : (() => {
              const r = suggestionRuleToRotationRule(sug, known, char, ds, inventory, `s${n++}`);
              return r ? [r] : [];
            })();
      for (const rule of rules) {
        phases[rotPhase].push(rule);
        if (rule.action.kind === 'spell') {
          usedSpellsByPhase[rotPhase].add(rule.action.spellId);
          const def = knownById.get(rule.action.spellId) ?? ds.spell(rule.action.spellId);
          if (def && isMageArmorSpell(def)) suggestionHasMageArmor = true;
        } else if (rule.action.kind === 'item') {
          usedItemsByPhase[rotPhase].add(rule.action.itemEntry);
        }
      }
    }
  }

  let f = 0;
  const nextFallbackId = () => `f${f++}`;
  const classCtx = (): FinalizeContext => ({
    char,
    ds,
    sb,
    inventory,
    spec,
    classKey: key,
    known,
    knownById,
    phases,
    usedSpellsByPhase,
    usedItemsByPhase,
    nextFallbackId,
    ...(opts?.mode === 'pvp' ? { mode: 'pvp' as const } : {}),
  });

  // Per-class post-pass after authored rows (e.g. paladin seal collapse).
  applyClassAfterSuggestion(classCtx());

  // Role-bucket fallback is OFF by default — packs are the sole source of default rows. The
  // materialize script flips PH_ROTATION_INVENT once to snapshot invent into packs, then reverts.
  const invent = typeof process !== 'undefined' && process.env?.PH_ROTATION_INVENT === '1';
  if (invent) {
    const authoredPull = band.phases.pull.length > 0;
    const authoredMeleeFiller = band.phases.combat.some(
      (r) => /auto-?attack/i.test(r.label ?? '') || r.labels.some((l) => /auto-?attack/i.test(l)),
    );
    const isCastTimeNukeRule = (r: RotationRule): boolean => {
      if (r.action.kind !== 'spell' || r.conditions.length > 0) return false;
      const def = knownById.get(r.action.spellId) ?? ds.spell(r.action.spellId);
      return !!def && (def.castTimeMs ?? 0) > 0 && def.effects.some((e) => e.kind === 'direct_damage' || e.kind === 'dot');
    };
    const fallback = buildRoleBucketRotation(char, sb, ds, inventory);
    for (const phase of ROTATION_PHASES) {
      if (phase === 'pull' && authoredPull) continue;
      for (const r of fallback.phases[phase] ?? []) {
        if (r.action.kind === 'spell' && usedSpellsByPhase[phase].has(r.action.spellId)) continue;
        if (r.action.kind === 'item' && usedItemsByPhase[phase].has(r.action.itemEntry)) continue;
        if (phase === 'combat' && authoredMeleeFiller && isCastTimeNukeRule(r)) continue;
        if (suggestionHasMageArmor && r.action.kind === 'spell') {
          const def = knownById.get(r.action.spellId) ?? ds.spell(r.action.spellId);
          if (def && isMageArmorSpell(def)) continue;
        }
        if (phase === 'recovery' && r.action.kind === 'spell') {
          const def = knownById.get(r.action.spellId) ?? ds.spell(r.action.spellId);
          if (def && isLongArmorKeepUp(def)) continue;
          if (def && /^create healthstone/i.test(def.name)) continue;
        }
        if (r.action.kind === 'spell' && (phase === 'combat' || phase === 'buffs' || phase === 'pull')) {
          const def = knownById.get(r.action.spellId) ?? ds.spell(r.action.spellId);
          if (def && !spellAllowedInRoleBucketFallback(def, key, spec)) continue;
        }
        let rule = { ...r, id: nextFallbackId() };
        if (rule.action.kind === 'spell') {
          const def = knownById.get(rule.action.spellId) ?? ds.spell(rule.action.spellId);
          if (def && isOverpowerSpell(def)) {
            rule = { ...rule, conditions: applyOverpowerDodgeGate(def, rule.conditions) };
          }
        }
        phases[phase].push(rule);
        if (r.action.kind === 'spell') usedSpellsByPhase[phase].add(r.action.spellId);
        else if (r.action.kind === 'item') usedItemsByPhase[phase].add(r.action.itemEntry);
      }
    }
  }

  // Casting-gated interrupt rules must sit ABOVE unconditional damage rules or first-match means
  // they never fire. Authored pack rules for the same spell keep their author's slot.
  const isInterruptRule = (r: RotationRule): boolean =>
    r.conditions.some((c) => c.metric === 'castingPresent' && c.op === '==' && c.value === 1);
  const hoisted = phases.combat.filter(isInterruptRule);
  if (hoisted.length) {
    phases.combat = [...hoisted, ...phases.combat.filter((r) => !isInterruptRule(r))];
  }

  // Stance reconcile (global) + class post-pass (hunter Auto Shot, mage PoM, paladin re-seal, …).
  applyClassAfterFallback(classCtx());

  // Rebirth: the packs never list it and invent is off, so nothing else puts a battle rez in a
  // druid rotation. Before the defensive pass, which also unshifts a low-health panic CD.
  ensureBattleRezCombatRow(classCtx());

  // Self immunities and defense-reacts are often missing from authored packs, and invent is off in
  // product, so inject the known ones with correct gates — never as enemy-debuff thrash.
  ensureKnownDefensiveAndReactCombat(classCtx());

  // Potions the packs never list. Gated on itemCount so an empty bag leaves them inert.
  ensureCombatConsumableRows(classCtx());

  // Pre-buff phase: the HoTs / shields this unit knows, for the in-dungeon Pre-buff order.
  // Button-driven only — no automatic loop reads this phase.
  ensurePrebuffRows(classCtx());

  // Exclusive keep-up collapse (all phases): one Aspect / Aura / Seal / Sting / Curse /
  // weapon imbue / poison conjure / mage armor. Suggestion order wins over fallback (KI-246+).
  const resolveExcl = (id: number) => knownById.get(id) ?? ds.spell(id);
  for (const phase of ROTATION_PHASES) {
    phases[phase] = collapseExclusiveFamilyRules(phases[phase], resolveExcl);
  }

  // Form enter gates plus the shared semantic gates for execute, multi, keep-up, creature type,
  // interrupt and reagent, so no tail ships an unconditional ALWAYS for a gated tool.
  let rot: Rotation = { version: 1, cls: char.cls, phases };
  rot = ensureFormEnterGates(rot, ds);
  rot = ensureSemanticSpellGates(rot, ds);
  // Every category a cure can strip gets its own rule — the packs authored one gate each.
  rot = ensureDispelGates(rot, ds);
  // The PARTY half of every single-target keep-up: `applyTo: 'friendly'` routes to the caster
  // (applySpell friendBuffTarget). After the semantic pass, so no self buffPresent gate is stamped.
  rot = ensurePartyBuffRows(rot, ds);
  // After the semantic pass attached enemyCount gates, hoist multi-target rules, empty-slot totems
  // and DoT upkeep above the unconditional filler that first-match would starve them behind.
  const defOf = (id: number) => knownById.get(id) ?? ds.spell(id);
  rot = {
    ...rot,
    phases: {
      ...rot.phases,
      combat: hoistDispelRules(
        hoistDotUpkeepAboveFiller(
          hoistEmptySlotTotemsAboveFiller(
            hoistMultiTargetAboveFiller(rot.phases.combat, defOf),
            defOf,
          ),
          defOf,
        ),
      ),
    },
  };
  return rot;
}

// Dispels sit next to interrupts. Authored packs list them under the wand, so first-match never
// strips a curse. After ensureDispelGates so the extra category rows move with the authored one.
function hoistDispelRules(combat: RotationRule[]): RotationRule[] {
  const isInterrupt = (r: RotationRule): boolean =>
    r.conditions.some((c) => c.metric === 'castingPresent' && c.op === '==' && c.value === 1);
  const isDispel = (r: RotationRule): boolean =>
    r.action.kind === 'spell'
    && r.enabled !== false
    && r.conditions.some((c) => c.metric === 'dispellablePresent');
  const dispels = combat.filter((r) => isDispel(r) && !isInterrupt(r));
  if (!dispels.length) return combat;
  return [
    ...combat.filter(isInterrupt),
    ...dispels,
    ...combat.filter((r) => !isInterrupt(r) && !isDispel(r)),
  ];
}

// The same first-match starvation one bucket over: authored bands put the spammable nuke above the
// DoTs. Only self-limiting DoT upkeep and mana rules move — CC, wand Shoot and spenders stay put.
function hoistDotUpkeepAboveFiller(
  combat: RotationRule[],
  defOf: (id: number) => SpellDef | undefined,
): RotationRule[] {
  const wallIdx = combat.findIndex(
    (r) => r.action.kind === 'spell' && r.enabled !== false && r.conditions.length === 0
      && ((defOf(r.action.spellId)?.cooldownMs ?? 0) <= 0),
  );
  if (wallIdx < 0) return combat;
  const shouldHoist = (r: RotationRule): boolean => {
    if (r.action.kind !== 'spell') return false;
    const sp = defOf(r.action.spellId);
    if (!sp || sp.role === 'shoot') return false;
    const appliesDot = (sp.effects ?? []).some((e) => e.kind === 'dot');
    if (appliesDot && r.conditions.some((c) => c.metric === 'debuffPresent' && (c.value | 0) === 0)) return true;
    return r.conditions.some((c) => c.subject === 'self' && c.metric === 'powerPct' && c.op === '<');
  };
  const toHoist = combat.slice(wallIdx + 1).filter(shouldHoist);
  if (!toHoist.length) return combat;
  const kept = combat.filter((r, i) => i <= wallIdx || !shouldHoist(r));
  return [...kept.slice(0, wallIdx), ...toHoist, ...kept.slice(wallIdx)];
}

// Elemental packs list unconditional Lightning Bolt above the totems, so first-match never leaves
// the filler. Empty-slot totemPresent gates are self-limiting, so hoist them above that wall.
function hoistEmptySlotTotemsAboveFiller(
  combat: RotationRule[],
  defOf: (id: number) => SpellDef | undefined,
): RotationRule[] {
  const wallIdx = combat.findIndex(
    (r) => r.action.kind === 'spell' && r.enabled !== false && r.conditions.length === 0
      && ((defOf(r.action.spellId)?.cooldownMs ?? 0) <= 0),
  );
  if (wallIdx < 0) return combat;
  const shouldHoist = (r: RotationRule): boolean => {
    if (r.action.kind !== 'spell' || r.enabled === false) return false;
    if (!r.conditions.some((c) =>
      c.subject === 'self' && c.metric === 'totemPresent' && c.op === '==' && (c.value | 0) === 0
    )) {
      return false;
    }
    const sp = defOf(r.action.spellId);
    if (!sp) return false;
    const role = sp.role ?? inferRole(sp);
    if (role === 'totem_summon') return true;
    const slot = totemSlotOfSpell(sp);
    return !!slot && slot !== 'none';
  };
  const toHoist = combat.slice(wallIdx + 1).filter(shouldHoist);
  if (!toHoist.length) return combat;
  const kept = combat.filter((r, i) => i <= wallIdx || !shouldHoist(r));
  return [...kept.slice(0, wallIdx), ...toHoist, ...kept.slice(wallIdx)];
}

// First-match starvation fix: authored bands list the unconditional single-target filler above the
// enemyCount-gated pack tools, so Cleave never fires even on six mobs. Hoist above the filler.
function hoistMultiTargetAboveFiller(
  combat: RotationRule[],
  defOf: (id: number) => SpellDef | undefined,
): RotationRule[] {
  // The wall is the first unconditional SPAMMABLE rule — the true filler. Cooldown spenders are
  // high-value per cast and stay above the hoisted pack tools, or the rage budget goes to AoE.
  const wallIdx = combat.findIndex(
    (r) => r.action.kind === 'spell' && r.enabled !== false && r.conditions.length === 0
      && ((defOf(r.action.spellId)?.cooldownMs ?? 0) <= 0),
  );
  if (wallIdx < 0) return combat;
  const isGatedMulti = (r: RotationRule): boolean =>
    r.action.kind === 'spell'
    && isMultiTargetCombatSpell(defOf(r.action.spellId))
    && r.conditions.some((c) => c.metric === 'enemyCount' && (c.op === '>=' || c.op === '>'));
  const toHoist = combat.slice(wallIdx + 1).filter(isGatedMulti);
  if (!toHoist.length) return combat;
  const kept = combat.filter((r, i) => i <= wallIdx || !isGatedMulti(r));
  return [...kept.slice(0, wallIdx), ...toHoist, ...kept.slice(wallIdx)];
}

// When packs omit long-cooldown self immunities, mitigation or defense reacts, put them into combat
// with the correct gate. Also the damage cooldowns and racials, which no pack lists. Idempotent.
export function ensureKnownDefensiveAndReactCombat(ctx: FinalizeContext): void {
  const combatIds = ctx.usedSpellsByPhase.combat;
  const inject = (spellId: number, conditions: Condition[]): void => {
    if (combatIds.has(spellId)) return;
    // Prefer near the head so panic CDs / reacts outrank unconditional fillers.
    ctx.phases.combat.unshift({
      id: ctx.nextFallbackId(),
      action: { kind: 'spell', spellId },
      conditions,
      enabled: true,
    });
    combatIds.add(spellId);
  };

  const resolve = (id: number): SpellDef | null | undefined =>
    ctx.knownById.get(id) ?? ctx.ds.spell(id);

  for (const s of ctx.known) {
    // Forms are never panic injects (mechanic_immunity on Bear/Cat/Travel fooled isSelfDefensive).
    if (isFormSpell(s) || formIdFromLabel(s.name) != null) continue;
    // Bursts first: Death Wish and Recklessness carry fear immunity, so the defensive branch
    // below would otherwise claim them and stamp the low-health gate this replaces.
    if (isOffensiveBurstCooldown(s, resolve)) {
      inject(s.id, burstCooldownConditions(s));
      continue;
    }
    {
      // Berserker Rage: one row per mechanic the snapshot can see (conditions are ANDed).
      // `inject` is id-keyed, so only the first lands here; the rest come from the pack.
      const ccBreaks = ccBreakGateConditions(s);
      if (ccBreaks.length) {
        for (const conds of ccBreaks) inject(s.id, conds);
        continue;
      }
    }
    if (isSelfDefensiveSpell(s)) {
      inject(s.id, [
        cond('self', 'healthPct', '<', DEFAULT_THRESHOLDS.emergencyDefensivePct),
      ]);
      continue;
    }
    if (isDefenseReactSpell(s)) {
      inject(s.id, [cond('self', 'defenseReactRecently', '==', 1)]);
      continue;
    }
  }
}

// Battle rez (druid Rebirth) into combat when the authored pack never listed it — no band in
// druid.json names it, so no druid has ever carried one. Highest usable rank; idempotent.
export function ensureBattleRezCombatRow(ctx: FinalizeContext): void {
  let best: SpellDef | null = null;
  for (const id of ctx.sb.known) {
    const s = ctx.ds.spell(id);
    if (!s || !isBattleRezSpell(s)) continue;
    if ((s.spellLevel ?? 0) > (ctx.char.level | 0)) continue;
    if (!best || (s.rank ?? 0) > (best.rank ?? 0)) best = s;
  }
  if (!best || ctx.usedSpellsByPhase.combat.has(best.id)) return;
  ctx.phases.combat.unshift({
    id: ctx.nextFallbackId(),
    action: { kind: 'spell', spellId: best.id },
    conditions: resurrectGateConditions(),
    enabled: true,
  });
  ctx.usedSpellsByPhase.combat.add(best.id);
}

// The health band an emergency ITEM may fire at: below every heal SPELL the list already casts, by
// EMERGENCY_ITEM_GAP_PCT. A potion tied with a heal at the same 35% raced it for the GCD and won
// half the time, burning a 2-minute category-4 lock (itemUseCooldown.ts) on damage a free cast
// covered. Returns the default when the list has no heal spell — a warrior's potion IS its heal.
const EMERGENCY_ITEM_GAP_PCT = 10;
// A potion is instant and costs no form drop, so a shifted druid or a bear tank reaches for it before
// its 25% caster heals. That makes 25 the floor, not a number to keep subtracting past.
const EMERGENCY_ITEM_FLOOR_PCT = 25;

function emergencyItemHpBand(ctx: FinalizeContext): number {
  let lowestHeal = Number.POSITIVE_INFINITY;
  for (const r of ctx.phases.recovery) {
    if (!r.enabled || r.action.kind !== 'spell') continue;
    const s = ctx.knownById.get(r.action.spellId) ?? ctx.ds.spell(r.action.spellId);
    // Same heal test build.ts:279 uses; a HoT counts, since it is the cast that beats the potion.
    if (!s?.effects.some((e) => e.kind === 'heal' || e.kind === 'restore_health')) continue;
    for (const c of r.conditions) {
      if (c.subject !== 'self' || c.metric !== 'healthPct') continue;
      if (c.op !== '<' && c.op !== '<=') continue;
      lowestHeal = Math.min(lowestHeal, c.value);
    }
  }
  if (!Number.isFinite(lowestHeal)) return DEFAULT_THRESHOLDS.potionLowPct;
  return Math.max(
    EMERGENCY_ITEM_FLOOR_PCT,
    Math.min(DEFAULT_THRESHOLDS.potionLowPct, lowestHeal - EMERGENCY_ITEM_GAP_PCT),
  );
}

// Lower an existing self-health item row onto that band. Only ever LOWERS: a pack that deliberately
// authored a potion under the band keeps its number.
function lowerEmergencyItemRows(ctx: FinalizeContext, band: number): void {
  for (const r of ctx.phases.recovery) {
    if (r.action.kind !== 'item') continue;
    if (r.action.target != null && r.action.target !== 'self') continue;
    const it = ctx.ds.item(r.action.itemEntry);
    if (!it?.useInCombat || it.useInCombat.effect !== 'restore_health') continue;
    for (const c of r.conditions) {
      if (c.subject !== 'self' || c.metric !== 'healthPct') continue;
      if (c.op !== '<' && c.op !== '<=') continue;
      if (c.value > band) c.value = band;
    }
  }
}

// Standing consumable rows — a health potion and the one that refills this class's power — gated on
// itemCount, so the row is visible while the bag is empty and starts working when you pick one up.
export function ensureCombatConsumableRows(ctx: FinalizeContext): void {
  const usedItems = ctx.usedItemsByPhase.recovery;
  // Dedup by LADDER as well as by entry: a pack potion row and this one are the same row even
  // when they resolved to different rungs, and two rows off one family is a duplicate.
  const usedFamilies = new Set<string>();
  for (const r of ctx.phases.recovery) {
    if (r.action.kind === 'item' && r.action.family) usedFamilies.add(r.action.family);
  }
  const band = emergencyItemHpBand(ctx);
  lowerEmergencyItemRows(ctx, band);
  for (const c of bestCombatConsumables(ctx.char, ctx.ds)) {
    if (usedItems.has(c.entry)) continue;
    if (c.family && usedFamilies.has(c.family)) continue;
    // Appended, not unshifted: a real heal spell should always be preferred to a potion.
    ctx.phases.recovery.push({
      id: ctx.nextFallbackId(),
      action: { kind: 'item', itemEntry: c.entry, ...(c.family ? { family: c.family } : {}) },
      conditions: combatConsumableConditions(c, c.kind === 'health' ? band : undefined),
      enabled: true,
    });
    usedItems.add(c.entry);
    if (c.family) usedFamilies.add(c.family);
  }
}

// What the player did to this raid's row set on the Raid tab.
export interface RaidRowOptions {
  /** Baked row ids switched OFF (`AutopilotConfig.raidRowsOff`). */
  off?: readonly string[];
  /** Rows the player wrote (`AutopilotConfig.raidRows`); any raid, filtered by slug here. */
  own?: readonly RaidCustomRow[];
  /** Distances the player retuned on a shipped row (`AutopilotConfig.raidRowYd`). */
  yd?: Readonly<Record<string, number>>;
}

// The row options carried on a save, for the two composers. Reads state.autopilot structurally so
// this module keeps its one-way imports, and normalizes here since a hand-edited save is any shape.

export function raidRowOptionsOf(state: {
  autopilot?: { raidRowsOff?: unknown; raidRows?: unknown; raidRowYd?: unknown } | null;
} | null | undefined): RaidRowOptions {
  const ap = state?.autopilot;
  if (!ap) return {};
  const off = Array.isArray(ap.raidRowsOff)
    ? ap.raidRowsOff.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  const own = normalizeRaidCustomRows(ap.raidRows);
  const yd: Record<string, number> = {};
  if (ap.raidRowYd && typeof ap.raidRowYd === 'object' && !Array.isArray(ap.raidRowYd)) {
    for (const [id, v] of Object.entries(ap.raidRowYd)) {
      if (id && typeof v === 'number' && Number.isFinite(v) && v > 0) yd[id] = Math.round(v);
    }
  }
  return {
    ...(off.length ? { off } : {}),
    ...(own.length ? { own } : {}),
    ...(Object.keys(yd).length ? { yd } : {}),
  };
}


// Raid-response rows for ONE raid, scoped by `slug` rather than built into every save — a level-10
// warrior used to carry the Grobbulus run-out forever. Scoped by RAID, not by focus.
export function raidResponseRows(
  slug: string | undefined,
  char: Character,
  sb: SpellBook,
  ds: DataStore,
  opts?: RaidRowOptions,
): readonly RotationRule[] {
  if (!slug) return [];
  const tactics = raidTacticsForSlug(slug);
  if (!tactics.length) return [];
  const rows: RotationRule[] = [];
  const seen = new Set<string>();
  // Content-derived ids, so two bosses sharing an aura contribute one row (Mortal Wound 25646
  // is Kurinnaxx, Fankriss and Gluth) and the Raid tab can name every fight it covers.
  const tuned = opts?.yd;
  const add = (id: string, action: RuleAction, conditions: Condition[]): void => {
    if (seen.has(id)) return;
    seen.add(id);
    rows.push({ id, action, conditions, enabled: true });
  };

  // Priest MC on the adds that ARE the mechanic (Faerlina Worshipper, Razuvious Understudy):
  // 605 already charms; this chooses to cast it.
  if (char.cls === CLASS.PRIEST) {
    const known = knownUsableSpells(char, sb, ds);
    let mc = known.find(
      (s) => s.id === SPELL_MIND_CONTROL || (s.name ?? '').toLowerCase() === 'mind control',
    );
    // Fallback: spellbook id present even when the usable filter drops it (fixture stubs).
    if (!mc && sb.known.includes(SPELL_MIND_CONTROL) && ds.spell(SPELL_MIND_CONTROL)) {
      mc = ds.spell(SPELL_MIND_CONTROL) ?? undefined;
    }
    if (mc) {
      for (const t of tactics) {
        for (const m of t.mcEntries ?? []) {
          const conditions: Condition[] = [
            cond('self', 'inCombat', '==', 1),
            cond('self', 'charmedHostileCount', '==', 0),
          ];
          if (m.requireTargetBuff != null) {
            conditions.push(cond('target', 'buffPresent', '==', 1, m.requireTargetBuff));
          }
          add(
            `raid_resp_mc_${m.entry}`,
            { kind: 'spell', spellId: mc.id, target: { creatureEntry: m.entry } },
            conditions,
          );
        }
      }
    }
  }

  // The off-tank taunt needs THIS unit's taunt spell, which is why these rows cannot be a
  // static table: warrior Taunt and druid Growl are different ids.
  const known = knownUsableSpells(char, sb, ds);
  const taunt = known.find((s) => s.effects.some((e) => e.kind === 'taunt'));
  // Same shape as the taunt: a kick row can only compose on a body that knows one.
  const kick = known.find((s) => s.effects.some((e) => e.kind === 'interrupt_cast'));
  // `cc` is an incapacitate that BREAKS on damage, or a banish — not a 3 s stun and not a fear.
  // Longest wins. Narrowed in the ternary: a boolean filter callback does not narrow the union.
  const ccSpell = known
    .flatMap((sp) => sp.effects.flatMap((e) => (
      e.kind === 'cc'
        && ((e.control === 'incapacitate' && e.breakOnDamage === true) || e.mechanic === 'banish')
        ? [{ id: sp.id, ms: (e.durationMs ?? 0) | 0 }]
        : []
    )))
    .sort((a, b) => b.ms - a.ms)[0];
  if (taunt) {
    for (const t of tactics) {
      if (t.tankSwapAura == null) continue;
      add(`raid_resp_swap_${t.tankSwapAura}`, { kind: 'spell', spellId: taunt.id }, [
        cond('self', 'isOffTank', '==', 1),
        cond('self', 'targetAttackingMe', '==', 0),
        cond('target', 'aggroHolderDebuffPresent', '==', 1, t.tankSwapAura),
      ]);
    }
  }

  // Own-debuff bomb run-outs, highest priority: walking out beats any filler, at the BAKED payload
  // radius. The alliesWithinYd half is what ENDS the run-out, so the holder resumes casting.
  for (const t of tactics) {
    for (const f of t.fleeAuras ?? []) {
      // Run PAST the blast, not to its edge: parking on the baked radius let drift walk the bomb
      // back into the raid, costing 15.0 bodies a run against 12.8. The margin is hysteresis.
      const id = `raid_resp_flee_${f.aura}`;
      // A retuned distance has to move the GATE with the walk, since alliesWithinYd at clearYd is
      // what ends the run-out. Rewriting only the action leaves the two halves disagreeing.
      const clearYd = tuned?.[id] ?? f.radiusYd + FLEE_CLEAR_MARGIN_YD;
      add(
        id,
        { kind: 'move', move: { kind: 'flee_raid', yd: clearYd } },
        [
          cond('self', 'debuffPresent', '==', 1, f.aura),
          cond('self', 'alliesWithinYd', '>', 0, clearYd),
        ],
      );
    }
  }
  // Rows were added MC -> swap -> flee; combat reads top-down, so reverse to put flee first.
  rows.reverse();

  // Own rows and shipped cureAuras compose per-body: a priest and a mage each press their own
  // spell. `dispel` is null when the aura is not dispellable or this unit has no cure.
  const dispelKitFor = (aura: number): { dispelSpellId: number | null; dispelCategory: number | null } => {
    const cat = aura > 0 ? (ds.spell(aura)?.dispel ?? 0) | 0 : 0;
    if (!(cat > 0)) return { dispelSpellId: null, dispelCategory: null };
    const cure = known.find((sp) => sp.effects.some(
      (e) => e.kind === 'dispel' && (e.dispelType | 0) === cat,
    ));
    return { dispelSpellId: cure ? cure.id : null, dispelCategory: cat };
  };
  for (const t of tactics) {
    for (const c of t.cureAuras ?? []) {
      const composed = raidCustomRowRule({
        id: `tmp_cure_${c.aura}`,
        slug,
        entry: t.entry,
        trigger: 'aura',
        aura: c.aura,
        on: c.on,
        response: 'dispel',
        enabled: true,
      }, { ...dispelKitFor(c.aura) });
      if (composed) add(`raid_resp_cure_${c.aura}`, composed.action, composed.conditions);
    }
  }
  const own: RotationRule[] = [];
  for (const r of opts?.own ?? []) {
    if (r.slug !== slug || !r.enabled) continue;
    const rule = raidCustomRowRule(r, {
      tauntSpellId: taunt ? taunt.id : null,
      interruptSpellId: kick ? kick.id : null,
      // `focus` wraps the shipped kill-order for the fight the row was written on.
      focusEntries: r.entry ? killOrderEntriesForBoss(r.entry) : [],
      clickGoEntries: r.entry ? useObjectEntriesForBoss(r.entry) : [],
      ccSpellId: ccSpell ? ccSpell.id : null,
      ...dispelKitFor(r.aura),
    });
    if (rule && !seen.has(rule.id)) {
      seen.add(rule.id);
      own.push(rule);
    }
  }
  const all = own.length ? [...own, ...rows] : rows;
  const off = opts?.off && opts.off.length ? new Set(opts.off) : null;
  return off ? all.filter((r) => !off.has(r.id)) : all;
}

// The combat list this raid actually runs: any stored raid row dropped, then this raid's set
// prepended. Never written back. The prune is what migrates old saves that still hold the old rows.
export function withRaidTacticRows(
  rot: Rotation,
  slug: string | undefined,
  char: Character,
  sb: SpellBook,
  ds: DataStore,
  opts?: RaidRowOptions,
): Rotation {
  const stored = rot.phases.combat;
  const kept = stored.filter((r) => !isRaidRuleId(r.id));
  const add = raidResponseRows(slug, char, sb, ds, opts);
  // The per-fight rows are prepended later inside evaluate, off an index keyed on the live focus, so
  // the composer cannot filter them here. Carrying the two knobs is how they reach that prepend.
  const tuning: Pick<Rotation, 'raidRowsOff' | 'raidRowYd'> = {
    ...(opts?.off?.length ? { raidRowsOff: opts.off } : {}),
    ...(opts?.yd && Object.keys(opts.yd).length ? { raidRowYd: opts.yd } : {}),
  };
  const changed = Object.keys(tuning).length > 0;
  if (!add.length && kept.length === stored.length && !changed) return rot;
  return { ...rot, ...tuning, phases: { ...rot.phases, combat: [...add, ...kept] } };
}

/** Which fight the caller is building for. Absent = PvE, and PvE never selects a pvp band. */
export interface RotationBandOptions {
  mode?: BandMode;
  /** Names a pvp band variant; only meaningful with `mode: 'pvp'`. Absent = the default band. */
  variant?: string;
}

export function buildDefaultRotation(
  char: Character,
  sb: SpellBook,
  ds: DataStore,
  inventory?: Inventory,
  specOverride?: string | null,
  opts?: RotationBandOptions,
): Rotation {
  const key = suggestionClassKeyFromClassId(char.cls);
  let rot = key
    ? buildSuggestionRotation(char, sb, ds, inventory, key, specOverride, opts)
    : buildRoleBucketRotation(char, sb, ds, inventory);
  // Always gate form/stance enter (Cat Form, Battle Stance, Shadowform, …). This is what
  // "Reset to recommended" must ship — bare form rules toggle off every GCD.
  rot = ensureFormEnterGates(rot, ds);
  // Shared semantic if-statements for execute / creature-type / multi / keep-up / …
  // (role-bucket-only path also needs this; suggestion path re-applies idempotently).
  rot = ensureSemanticSpellGates(rot, ds);
  // One exclusive-family aura at a time: the plain keep-up yields to the situational sibling.
  rot = ensureExclusiveFamilyKeepUpYields(rot, ds);
  // Raid rows are NOT built in here any more — they are composed per raid, so a save holds only what
  // the player authored. Stamp the signature so rotation() can auto-refresh this default.
  rot.autoSig = rotationAutoSig(char, sb, ds, specOverride, opts);
  return rot;
}

// Bump when a change to the packs or a class hook must reach rotations ALREADY STORED in a save.
// Untouched defaults rebuild once; a hand-edited rotation is never auto-wiped.
export const ROTATION_PACK_REV = 13;

/** The build-time inputs an auto rotation depends on, for staleness detection. */
export function rotationAutoSig(
  char: Character,
  sb: SpellBook,
  ds: DataStore,
  specOverride?: string | null,
  opts?: RotationBandOptions,
): RotationAutoSig {
  return {
    spec: primarySpec(char, ds, specOverride),
    level: char.level | 0,
    spells: sb.known.length,
    packRev: ROTATION_PACK_REV,
    ...(opts?.mode ? { mode: opts.mode } : {}),
    ...(opts?.mode && opts.variant ? { variant: opts.variant } : {}),
  };
}

// True when the recommended default for the current level, spec and spellbook would differ from
// what this rotation was generated for. Ignores `custom` — callers decide. No autoSig is drift.
export function rotationSigDiffers(
  rot: Rotation,
  char: Character,
  sb: SpellBook,
  ds: DataStore,
  specOverride?: string | null,
  opts?: RotationBandOptions,
): boolean {
  const cur = rotationAutoSig(char, sb, ds, specOverride, opts);
  const s = rot.autoSig;
  if (!s || s.spec !== cur.spec || s.level !== cur.level || s.spells !== cur.spells) return true;
  // A PvE list stored where a pvp one is now wanted is drift: the four fields above describe
  // the character, and a pvp band changes only the LIST.
  if ((s.mode ?? undefined) !== (cur.mode ?? undefined)) return true;
  // Same for the variant: two pvp lists for one tree are different fighters (duel plan G1).
  if ((s.variant ?? undefined) !== (cur.variant ?? undefined)) return true;
  // Pack / hook revision: the three fields above all describe the character, so nothing here
  // could ever notice that the RECOMMENDED list changed under a save.
  return (s.packRev ?? 0) < ROTATION_PACK_REV;
}

// Which LIST a stored rotation was built from. A refresh must rebuild the same list: every caller
// below passes only the band, so a stored pvp list read as drift against the PvE ladder every time.
export function rotationBandOptionsOf(rot: Rotation | null | undefined): RotationBandOptions | undefined {
  const sig = rot?.autoSig;
  if (!sig?.mode) return undefined;
  return { mode: sig.mode, ...(sig.variant ? { variant: sig.variant } : {}) };
}

// Keep a player rotation live with the current kit: untouched defaults rebuild when level, spec,
// known-spell count or squad role drifts, and hand-edited ones are left alone. Shared by three paths.
export function ensureLivePlayerRotation(
  rot: Rotation | null | undefined,
  char: Character,
  sb: SpellBook,
  ds: DataStore,
  inventory: Inventory | undefined,
  opts?: {
    /** Spec band (rotationSpec or role→Holy/Resto/Protection). */
    band?: string | null;
    /** Squad role for autoSig.role drift. */
    role?: string | null;
  },
): Rotation {
  const band = opts?.band ?? undefined;
  const role = opts?.role === 'healer' || opts?.role === 'tank' ? opts.role : 'dps';
  // The stored list's own sig says which pool it came from; without it a `+ PvP` profile rebuilt
  // as the PvE default on the first read after it was made (rotation.ts liveRotation).
  const mode = rotationBandOptionsOf(rot);
  const build = (): Rotation => ({
    ...buildDefaultRotation(char, sb, ds, inventory, band, mode),
    autoSig: {
      ...rotationAutoSig(char, sb, ds, band ?? null, mode),
      role,
    },
  });
  let next: Rotation;
  if (!rot || !isRotationValid(rot, char.cls)) {
    next = build();
  } else if (!rot.custom) {
    const roleDrift = !!rot.autoSig && (rot.autoSig.role ?? 'dps') !== role;
    next = (rotationSigDiffers(rot, char, sb, ds, band, mode) || roleDrift) ? build() : rot;
  } else {
    next = rot;
  }
  // A dispel this character KNOWS but no row names — a hand-edited list, or a book read after the
  // list was built — on the same always-re-sync footing as the party buff rows.
  const dispelled = ensureKnownDispelRows(
    stripStoredRaidRows(stripThrashResurrectRules(withPrebuffPhase(next), ds)),
    sb,
    ds,
  );
  return repairConjureStockGates(dispelled, (id) => ds.spell(id));
}

// True if a stored rotation is shaped right and still matches the character's class. Checks the
// REQUIRED phases, not all of them — requiring `prebuff` would rebuild every save and lose edits.
export function isRotationValid(rot: unknown, cls: number): rot is Rotation {
  if (!rot || typeof rot !== 'object') return false;
  const r = rot as Rotation;
  if (r.version !== 1 || r.cls !== cls || !r.phases) return false;
  return REQUIRED_ROTATION_PHASES.every((p) => Array.isArray(r.phases[p]));
}

// Backfill any phase list a stored rotation predates, so every `ROTATION_PHASES` loop can index `phases[p]`
// without an undefined. Runs on every read path before the strip/repair passes, which do exactly that.
export function withPrebuffPhase(rot: Rotation): Rotation {
  let missing = false;
  for (const p of ROTATION_PHASES) if (!Array.isArray(rot.phases[p])) missing = true;
  if (!missing) return rot;
  const phases = { ...rot.phases };
  for (const p of ROTATION_PHASES) if (!Array.isArray(phases[p])) phases[p] = [];
  return { ...rot, phases };
}

/** Return the stored rotation if it's valid for this class, else a freshly generated default. */
export function normalizeRotation(stored: unknown, char: Character, sb: SpellBook, ds: DataStore, inventory?: Inventory): Rotation {
  return isRotationValid(stored, char.cls)
    ? withPrebuffPhase(stored)
    : buildDefaultRotation(char, sb, ds, inventory);
}

// Drop every raid tactic row out of a STORED rotation. Raid rows are composed per raid and were
// never meant to reach a save; invisible in the Combat list, they still shift every printed index.
export function stripStoredRaidRows(rot: Rotation): Rotation {
  let changed = false;
  const phases = { ...rot.phases };
  for (const p of ROTATION_PHASES) {
    const cur = rot.phases[p] ?? [];
    const next = cur.filter((r) => !isRaidRuleId(r.id));
    if (next.length !== cur.length) {
      phases[p] = next;
      changed = true;
    }
  }
  // The two composed-only knobs are the config's, not the save's. A save that somehow holds
  // them would pin the Raid tab's switches to whatever they were when it was written.
  const stale = rot.raidRowsOff != null || rot.raidRowYd != null;
  if (!changed && !stale) return rot;
  const out: Rotation = { ...rot, phases };
  delete out.raidRowsOff;
  delete out.raidRowYd;
  return out;
}

// Drop thrash party-rez rules from a stored rotation, so a custom save that listed Redemption stops
// spending mana with no dead target. Rules already gated on deadAllyCount stay.
export function stripThrashResurrectRules(rot: Rotation, ds: DataStore): Rotation {
  const strip = (rules: RotationRule[]): RotationRule[] =>
    rules.filter((r) => {
      if (r.action.kind !== 'spell') return true;
      const sp = ds.spell(r.action.spellId);
      if (!sp || !isResurrectSpell(sp)) return true;
      // Keep only rules that already require a dead ally.
      return r.conditions.some((c) => c.metric === 'deadAllyCount');
    });
  let changed = false;
  const phases = { ...rot.phases };
  for (const p of ROTATION_PHASES) {
    const cur = rot.phases[p] ?? [];
    const next = strip(cur);
    if (next.length !== cur.length) {
      phases[p] = next;
      changed = true;
    }
  }
  if (!changed) return rot;
  return { ...rot, phases };
}

// Replace any rule actions that reference one of the `oldIds` with `newId`. Also migrate presence
// refs and `{ allyMissingAura }` so a rank-up cannot leave the keep-up gate on the old id.
const UPGRADE_PRESENCE_METRICS: ReadonlySet<string> = new Set([
  'buffPresent', 'debuffPresent', 'buffStacks', 'debuffStacks',
  'buffRemainingMs', 'debuffRemainingMs', 'canAfford',
  'allyLowestBuffPresent', 'allyAuraPresent', 'allyAuraStacks',
  'aggroHolderDebuffPresent', 'aggroHolderDebuffStacks',
]);

export function upgradeSpellInRotation(rot: Rotation, oldIds: number[], newId: number): Rotation {
  if (!oldIds.length) return rot;
  const oldSet = new Set(oldIds);
  const replaceAction = (a: RuleAction): RuleAction => {
    if (a.kind !== 'spell') return a;
    const spellId = oldSet.has(a.spellId) ? newId : a.spellId;
    const t = a.target;
    const target = t && typeof t === 'object' && 'allyMissingAura' in t && oldSet.has(t.allyMissingAura)
      ? { allyMissingAura: newId, ...('among' in t && t.among ? { among: t.among } : {}) }
      : t;
    if (spellId === a.spellId && target === t) return a;
    return { ...a, spellId, ...(target !== undefined ? { target } : {}) };
  };
  const upgradeRules = (rules: RotationRule[]): RotationRule[] =>
    rules.map((r) => {
      const action = replaceAction(r.action);
      let dirty = action !== r.action;
      const conditions = r.conditions.map((c) => {
        if (c.ref == null || !oldSet.has(c.ref) || !UPGRADE_PRESENCE_METRICS.has(c.metric)) return c;
        dirty = true;
        return { ...c, ref: newId };
      });
      return dirty ? { ...r, action, conditions } : r;
    });
  return {
    ...rot,
    phases: {
      prebuff: upgradeRules(rot.phases.prebuff ?? []),
      buffs: upgradeRules(rot.phases.buffs),
      pull: upgradeRules(rot.phases.pull),
      combat: upgradeRules(rot.phases.combat),
      recovery: upgradeRules(rot.phases.recovery),
    },
    overrides: rot.overrides
      ? Object.fromEntries(Object.entries(rot.overrides).map(([k, rs]) => [k, upgradeRules(rs)]))
      : undefined,
  };
}
