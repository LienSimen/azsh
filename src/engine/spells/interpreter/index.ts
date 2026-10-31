// The pure client-side spell interpreter: it reads the raw effects and dispatches by opcode into a
// normalized effect list. Live combat resolves through it by default; an env var falls back to bake.

import type { SpellDef } from '../../../data/schema.ts';
import {
  EFFECT_HANDLERS,
  finalizeResult,
  createHandlerState,
  type HandlerState,
} from './handlers.ts';
import type { InterpretContext, InterpretResult } from './types.ts';
import {
  materializeOverrideClassScriptIntents,
  materializeSpellModIntents,
  talentScriptedEffects,
  talentScriptedAppendEffects,
} from './talent-scripted.ts';
import { materializePaladinSeal, sealMaterializedEffects } from './paladin-seals.ts';
import { materializePaladinKitEffects } from './paladin-kit.ts';
import { materializeHunterKitEffects } from './hunter-kit.ts';
import { materializePriestWarlockKitEffects } from './priest-warlock-kit.ts';
import {
  materializeWarriorDruidKitEffects,
  applyExecuteRageToEffects,
} from './warrior-druid-kit.ts';
import { materializeMissingSpeedFromRaw } from './materialize-speed.ts';
import { materializeAuraRemoveEffects } from './handlers/aura-remove.ts';
import { liftConsumeEnergyIntents } from './lift-consume-energy.ts';
import { materializeDispelMechanicIntents } from './materialize-dispel-mechanic.ts';
import { materializeUnreadIntents } from '../intentEffects.ts';
import { materializeSpellMagnetIntents } from './materialize-spell-magnet.ts';
import { stampProcChargesOnEffects } from '../auraStacking.ts';

export type {
  InterpretContext,
  InterpretResult,
  UnhandledSlot,
  InterpretIntent,
  TargetAuraSummary,
  WeaponDamageModel,
} from './types.ts';
export { effectAmountRange, clampPositiveRange } from './amount.ts';
import { durMs } from './duration.ts';

export { durMs, resolveDurationMs, FALLBACK_DURATION_MS } from './duration.ts';
export {
  EFFECT_HANDLERS,
  AURA_HANDLERS,
} from './handlers.ts';
export {
  LIGHTNING_SHIELD_TRIGGER,
  LIGHTNING_SHIELD_DEFAULT_COOLDOWN_MS,
  LIGHTNING_SHIELD_DEFAULT_CHARGES,
  ASCENDANCE_PROC_CHARGES,
  ASCENDANCE_SPELL_ID,
  buildProcTriggerSpellMeta,
  bakeEffectFromProcMeta,
  tryProcTriggerSpell,
  resolveProcTriggerProbability,
  getPpmProcChancePercent,
  resolveProcTriggerSpellId,
  procMatchInputFromMeta,
  type ProcTriggerSpellMeta,
} from './proc.ts';
export {
  SPELL_EFFECT_INSTAKILL,
  SPELL_EFFECT_SCHOOL_DAMAGE,
  SPELL_EFFECT_DUMMY,
  SPELL_EFFECT_TELEPORT_UNITS,
  SPELL_EFFECT_APPLY_AURA,
  SPELL_EFFECT_APPLY_AREA_AURA_PARTY,
  SPELL_EFFECT_APPLY_AREA_AURA_PET,
  SPELL_EFFECT_PERSISTENT_AREA_AURA,
  SPELL_EFFECT_POWER_DRAIN,
  SPELL_EFFECT_HEALTH_LEECH,
  SPELL_EFFECT_HEAL,
  SPELL_EFFECT_BIND,
  SPELL_EFFECT_QUEST_COMPLETE,
  SPELL_EFFECT_WEAPON_DAMAGE_NOSCHOOL,
  SPELL_EFFECT_RESURRECT,
  SPELL_EFFECT_ADD_EXTRA_ATTACKS,
  SPELL_EFFECT_DODGE,
  SPELL_EFFECT_PARRY,
  SPELL_EFFECT_BLOCK,
  SPELL_EFFECT_CREATE_ITEM,
  SPELL_EFFECT_WEAPON,
  SPELL_EFFECT_DEFENSE,
  SPELL_EFFECT_SUMMON,
  SPELL_EFFECT_LEAP,
  SPELL_EFFECT_ENERGIZE,
  SPELL_EFFECT_WEAPON_PERCENT_DAMAGE,
  SPELL_EFFECT_OPEN_LOCK,
  SPELL_EFFECT_SUMMON_CHANGE_ITEM,
  SPELL_EFFECT_LEARN_SPELL,
  SPELL_EFFECT_SPELL_DEFENSE,
  SPELL_EFFECT_DISPEL,
  SPELL_EFFECT_LANGUAGE,
  SPELL_EFFECT_DUAL_WIELD,
  SPELL_EFFECT_SUMMON_WILD,
  SPELL_EFFECT_SUMMON_GUARDIAN,
  SPELL_EFFECT_TELEPORT_UNITS_FACE_CASTER,
  SPELL_EFFECT_SKILL_STEP,
  SPELL_EFFECT_SPAWN,
  SPELL_EFFECT_TRADE_SKILL,
  SPELL_EFFECT_DETECT,
  SPELL_EFFECT_TRANS_DOOR,
  SPELL_EFFECT_ENCHANT_ITEM,
  SPELL_EFFECT_ENCHANT_ITEM_TEMPORARY,
  SPELL_EFFECT_SUMMON_PET,
  SPELL_EFFECT_WEAPON_DAMAGE,
  SPELL_EFFECT_OPEN_LOCK_ITEM,
  SPELL_EFFECT_PROFICIENCY,
  SPELL_EFFECT_SEND_EVENT,
  SPELL_EFFECT_POWER_BURN,
  SPELL_EFFECT_THREAT,
  SPELL_EFFECT_TRIGGER_SPELL,
  SPELL_EFFECT_HEAL_MAX_HEALTH,
  SPELL_EFFECT_INTERRUPT_CAST,
  SPELL_EFFECT_DISTRACT,
  SPELL_EFFECT_PICKPOCKET,
  SPELL_EFFECT_SKINNING,
  SPELL_EFFECT_DISENCHANT,
  SPELL_EFFECT_ADD_FARSIGHT,
  SPELL_EFFECT_SUMMON_POSSESSED,
  SPELL_EFFECT_SUMMON_TOTEM,
  SPELL_EFFECT_HEAL_MECHANICAL,
  SPELL_EFFECT_SUMMON_OBJECT_WILD,
  SPELL_EFFECT_SCRIPT_EFFECT,
  SPELL_EFFECT_ATTACK,
  SPELL_EFFECT_SANCTUARY,
  SPELL_EFFECT_ADD_COMBO_POINTS,
  SPELL_EFFECT_BIND_SIGHT,
  SPELL_EFFECT_DUEL,
  SPELL_EFFECT_STUCK,
  SPELL_EFFECT_ACTIVATE_OBJECT,
  SPELL_EFFECT_SUMMON_TOTEM_SLOT1,
  SPELL_EFFECT_SUMMON_TOTEM_SLOT2,
  SPELL_EFFECT_SUMMON_TOTEM_SLOT3,
  SPELL_EFFECT_SUMMON_TOTEM_SLOT4,
  SPELL_EFFECT_ENCHANT_HELD_ITEM,
  SPELL_EFFECT_CHARGE,
  SPELL_EFFECT_SUMMON_CRITTER,
  SPELL_EFFECT_KNOCK_BACK,
  SPELL_EFFECT_INEBRIATE,
  SPELL_EFFECT_REPUTATION,
  SPELL_EFFECT_SUMMON_OBJECT_SLOT1,
  SPELL_EFFECT_SUMMON_OBJECT_SLOT2,
  SPELL_EFFECT_DISPEL_MECHANIC,
  SPELL_EFFECT_DURABILITY_DAMAGE,
  SPELL_EFFECT_DURABILITY_DAMAGE_PCT,
  SPELL_EFFECT_SUMMON_DEMON,
  SPELL_EFFECT_RESURRECT_NEW,
  SPELL_EFFECT_ATTACK_ME,
  SPELL_EFFECT_SKIN_PLAYER_CORPSE,
  SPELL_EFFECT_SKILL,
  SPELL_EFFECT_NORMALIZED_WEAPON_DMG,
  SPELL_EFFECT_PULL_TOWARDS,
  SPELL_AURA_DUMMY,
  SPELL_AURA_PERIODIC_DAMAGE,
  SPELL_AURA_PERIODIC_HEAL,
  SPELL_AURA_MOD_FEAR,
  SPELL_AURA_MOD_STUN,
  SPELL_AURA_MOD_DAMAGE_DONE,
  SPELL_AURA_MOD_DAMAGE_TAKEN,
  SPELL_AURA_DAMAGE_SHIELD,
  SPELL_AURA_MOD_RESISTANCE,
  SPELL_AURA_MOD_BASE_RESISTANCE,
  SPELL_AURA_PERIODIC_TRIGGER_SPELL,
  SPELL_AURA_PERIODIC_ENERGIZE,
  SPELL_AURA_MOD_ROOT,
  SPELL_AURA_MOD_STAT,
  SPELL_AURA_MOD_SKILL,
  SPELL_AURA_MOD_INCREASE_SPEED,
  SPELL_AURA_MOD_INCREASE_MOUNTED_SPEED,
  SPELL_AURA_MOD_DECREASE_SPEED,
  SPELL_AURA_SCHOOL_IMMUNITY,
  SPELL_AURA_DISPEL_IMMUNITY,
  SPELL_AURA_PERIODIC_LEECH,
  SPELL_AURA_TRANSFORM,
  SPELL_AURA_MOD_SCALE,
  SPELL_AURA_SCHOOL_ABSORB,
  SPELL_AURA_MECHANIC_IMMUNITY,
  SPELL_AURA_MOUNTED,
  SPELL_AURA_MOD_DAMAGE_PERCENT_DONE,
  SPELL_AURA_MOD_REGEN,
  SPELL_AURA_MOD_POWER_REGEN,
  SPELL_AURA_MOD_ATTACK_POWER,
  SPELL_AURA_ADD_FLAT_MODIFIER,
  SPELL_AURA_MOD_RANGED_ATTACK_POWER,
  SPELL_AURA_MOD_HEALING_DONE,
  SPELL_AURA_MOD_MELEE_HASTE,
  SPELL_AURA_MOD_CONFUSE,
  SPELL_AURA_MOD_CHARM,
  SPELL_AURA_AOE_CHARM,
  SPELL_AURA_MOD_SILENCE,
  SPELL_AURA_MOD_HIT_CHANCE,
  SPELL_AURA_MOD_CASTING_SPEED_NOT_STACK,
  SPELL_AURA_MOD_DAMAGE_PERCENT_TAKEN,
  SPELL_AURA_MOD_MELEE_ATTACK_POWER_VERSUS,
  SPELL_AURA_MOD_HEALING_PCT,
  SPELL_AURA_MOD_RESISTANCE_EXCLUSIVE,
  SPELL_AURA_MOD_HEALTH_REGEN_IN_COMBAT,
  SPELL_AURA_MOD_STEALTH,
  SPELL_AURA_MOD_INVISIBILITY,
  SPELL_AURA_MOD_SHAPESHIFT,
  SPELL_AURA_PROC_TRIGGER_SPELL,
  SPELL_AURA_PROC_TRIGGER_DAMAGE,
  SPELL_AURA_MOD_DODGE_PERCENT,
  SPELL_AURA_MOD_BLOCK_PERCENT,
  SPELL_AURA_MOD_CRIT_PERCENT,
  SPELL_AURA_PERIODIC_MANA_LEECH,
  SPELL_AURA_MOD_RESISTANCE_PCT,
  SPELL_AURA_MOD_RANGED_ATTACK_POWER_VERSUS,
  SPELL_AURA_MOD_ATTACKSPEED,
  SPELL_AURA_MOD_INVISIBILITY_DETECTION,
  SPELL_AURA_MOD_PACIFY,
  SPELL_AURA_TRACK_CREATURES,
  SPELL_AURA_REFLECT_SPELLS_SCHOOL,
  SPELL_AURA_CHANNEL_DEATH_ITEM,
  SPELL_AURA_MOD_HEALTH_REGEN_PERCENT,
  SPELL_AURA_MOD_TARGET_RESISTANCE,
  SPELL_AURA_MOD_TOTAL_STAT_PERCENTAGE,
  SPELL_AURA_MOD_SHIELD_BLOCKVALUE,
  SPELL_AURA_MOD_SHIELD_BLOCKVALUE_PCT,
  SPELL_AURA_REFLECT_SPELLS,
  SPELL_AURA_MOD_INCREASE_HEALTH,
  SPELL_AURA_MOD_DISARM,
  SPELL_AURA_MOD_SKILL_TALENT,
  SPELL_AURA_ADD_PCT_MODIFIER,
  SPELL_AURA_MOD_THREAT,
  SPELL_AURA_MOD_TAUNT,
  SPELL_AURA_MOD_STEALTH_DETECT,
  SPELL_AURA_MOD_HEALING,
  SPELL_AURA_MOD_MECHANIC_RESISTANCE,
  SPELL_AURA_MOD_POSSESS,
  SPELL_AURA_OBS_MOD_HEALTH,
  SPELL_AURA_OBS_MOD_MANA,
  SPELL_AURA_MOD_STALKED,
  SPELL_AURA_MOD_TOTAL_THREAT,
  SPELL_AURA_FEATHER_FALL,
  SPELL_AURA_MOD_RANGED_DAMAGE_TAKEN,
  SPELL_AURA_MOD_INCREASE_HEALTH_PERCENT,
  SPELL_AURA_MOD_MANA_REGEN_INTERRUPT,
  SPELL_AURA_MOD_RANGED_HASTE,
  SPELL_AURA_MOD_PARRY_PERCENT,
  SPELL_AURA_MOD_SPELL_CRIT_CHANCE,
  SPELL_AURA_MOD_SPELL_CRIT_CHANCE_SCHOOL,
  SPELL_AURA_MOD_LANGUAGE,
  SPELL_AURA_WATER_BREATHING,
  SPELL_AURA_MOD_DETECT_RANGE,
  SPELL_AURA_MANA_SHIELD,
  SPELL_AURA_OVERRIDE_CLASS_SCRIPTS,
  SPELL_AURA_MOD_MELEE_DAMAGE_TAKEN,
  SPELL_AURA_FORCE_REACTION,
  SPELL_AURA_EFFECT_IMMUNITY,
  SPELL_AURA_STATE_IMMUNITY,
  SPELL_AURA_DAMAGE_IMMUNITY,
  SPELL_AURA_TRACK_RESOURCES,
  SPELL_AURA_MOD_INCREASE_SWIM_SPEED,
  SPELL_AURA_MOD_PACIFY_SILENCE,
  SPELL_AURA_PREVENTS_FLEEING,
  SPELL_AURA_RANGED_ATTACK_POWER_ATTACKER_BONUS,
  SPELL_AURA_MOD_RANGED_AMMO_HASTE,
  SPELL_AURA_MOD_FLAT_SPELL_DAMAGE_VERSUS,
  SPELL_AURA_MOD_SPELL_HIT_CHANCE,
  SPELL_AURA_PERIODIC_DAMAGE_PERCENT,
  SPELL_AURA_WATER_WALK,
  SPELL_AURA_ADD_TARGET_TRIGGER,
  SPELL_AURA_MOD_POWER_REGEN_PERCENT,
  SPELL_AURA_SAFE_FALL,
  SPELL_AURA_MOD_STEALTH_LEVEL,
  SPELL_AURA_BIND_SIGHT,
  SPELL_AURA_MOD_POWER_COST_SCHOOL,
  SPELL_AURA_FAR_SIGHT,
  SPELL_AURA_SPLIT_DAMAGE_PCT,
  SPELL_AURA_MOD_UNATTACKABLE,
  SPELL_AURA_INTERRUPT_REGEN,
  SPELL_AURA_MOD_MELEE_DAMAGE_TAKEN_PCT,
  SPELL_AURA_MOD_SPEED_ALWAYS,
  SPELL_AURA_RESIST_PUSHBACK,
  SPELL_AURA_SPLIT_DAMAGE_FLAT,
  SPELL_AURA_POWER_BURN_MANA,
  SPELL_AURA_MOD_DAMAGE_DONE_VERSUS,
  SPELL_AURA_MOD_INCREASE_ENERGY,
  SPELL_AURA_PERIODIC_MANA_FUNNEL,
  SPELL_AURA_FEIGN_DEATH,
  SPELL_AURA_MOD_POWER_COST_SCHOOL_PCT,
  SPELL_AURA_MOD_PERCENT_STAT,
  SPELL_AURA_GHOST,
  SPELL_AURA_SPELL_MAGNET,
  SPELL_AURA_AURAS_VISIBLE,
  SPELL_AURA_HOVER,
  SPELL_AURA_MOD_REGEN_DURING_COMBAT,
  SPELL_AURA_UNTRACKABLE,
  SPELL_AURA_EMPATHY,
  SPELL_AURA_MOD_POSSESS_PET,
  SPELL_AURA_MOD_MOUNTED_SPEED_ALWAYS,
  SPELL_AURA_MOD_HEALING_DONE_PERCENT,
  SPELL_AURA_MOD_BASE_RESISTANCE_PCT,
  SPELL_AURA_TRACK_STEALTHED,
  SPELL_AURA_MOD_WATER_BREATHING,
  SPELL_AURA_MOD_REPUTATION_GAIN,
  SPELL_AURA_NO_PVP_CREDIT,
  SPELL_AURA_USE_NORMAL_MOVEMENT_SPEED,
  isApplyAuraFamily,
} from './opcodes.ts';
export { STAT_MOD } from './targeting.ts';
export {
  dispatchDummy,
  dispatchScript,
  registeredDummySpellIds,
  registeredScriptSpellIds,
  LIFE_TAP_MANA_SPELL_ID,
  PLAGUEHEART_LIFE_TAP_SPELL_ID,
  JUDGEMENT_SPELL_ID,
  LAST_STAND_SPELL_ID,
  LAST_STAND_BUFF_SPELL_ID,
  CREATE_HEALTHSTONE_SPELL_IDS,
  SOUL_LINK_SPELL_ID,
  SOUL_LINK_PET_AURA_SPELL_ID,
  TAME_BEAST_DUMMY_SPELL_ID,
  TAME_BEAST_FINAL_SPELL_ID,
  healthstoneItemType,
  improvedHealthstoneRankFromTalents,
  IMPROVED_HEALTHSTONE_RANK1_SPELL_ID,
  IMPROVED_HEALTHSTONE_RANK2_SPELL_ID,
} from './registry/index.ts';

// SI5/SI6 — combat + ItemDef on-use / on-equip / chance-on-hit routing.
export {
  isBakeEffectsEmpty,
  DURATION_SURFACE_HOLLOW_SPELL_IDS,
  materializeHollowSpellsInPlace,
  resolveSpellEffects,
  resolveCombatSpell,
  resolveItemOnUse,
  combatUseEffectFromInterpret,
  resolveCombatUseFromItem,
  resolveEquipSpells,
  resolveEquipBuffMods,
  buildItemProcMeta,
  tryItemChanceOnHit,
  resolveGearProcApplySpell,
  gearProcTriggerSpellIds,
  type SpellLookup,
  type ItemProcRow,
  type ResolveSpellEffectsOpts,
} from './item-triggers.ts';

// J2 runtime speed merge (KI-476 Hamstring / Frostbolt snares, …).
export {
  materializeMissingSpeedFromRaw,
  stampMissingSpeedFromRaw,
} from './materialize-speed.ts';

// Partial-bake charm/possess stamp (KI-801 Enslave Demon / Mind Control).
export {
  materializeMissingCharmFromRaw,
  stampMissingCharmFromRaw,
} from './materialize-charm.ts';

// Interpret a spell's raw effects into normalized engine effects. An unknown opcode is recorded as
// unhandled and never invented; ranges are emitted like the bake mapper, and the spell is not mutated.
export function interpretSpell(spell: SpellDef, ctx: InterpretContext = {}): InterpretResult {
  // When casterLevel is set for perLevel / energize scripts, default spellLevel
  // from spell row (Object.cpp uses spell level for the delta).
  const resolvedCtx: InterpretContext = {
    ...ctx,
    spellLevel:
      ctx.spellLevel
      ?? (ctx.casterLevel != null ? (spell.spellLevel ?? spell.reqLevel ?? 0) : undefined),
  };

  const state = createHandlerState(spell, resolvedCtx);

  const rawList = spell.rawEffects;
  if (!rawList || rawList.length === 0) {
    // Proc payloads and enricher stamps often have baked effects with no raw effects, so surface them
    // or the census flags a working payload as inert.
    for (const e of spell.effects ?? []) state.effects.push(e);
    return finalizeInterpret(state, spell);
  }

  for (let slot = 0; slot < rawList.length; slot++) {
    const raw = rawList[slot]!;
    const effect = raw.effect | 0;
    if (!effect) continue;
    const handler = EFFECT_HANDLERS[effect];
    if (!handler) {
      state.unhandled.push({
        slot,
        effect,
        auraName: raw.auraName | 0,
        reason: `unhandled effect ${effect} (SI3+)`,
      });
      continue;
    }
    const before = state.effects.length;
    handler(state, raw, slot);
    // Stamp the DBC slot on everything this handler appended — the coefficient index.
    for (let i = before; i < state.effects.length; i++) {
      const e = state.effects[i]!;
      if (e.effectSlot == null) e.effectSlot = slot;
    }
  }

  return finalizeInterpret(state, spell);
}

// Post-slot materialization shared by the raw and bake-only paths: spell-mod intents become the live
// effects, and the scripted talent table fills in when the list is still empty.
function finalizeInterpret(state: HandlerState, spell: SpellDef): InterpretResult {
  let result = finalizeResult(state);
  let effects = materializeSpellModIntents(result.intents, result.effects ?? [], spell);
  effects = materializeOverrideClassScriptIntents(result.intents, effects, spell);
  {
    const scripted = talentScriptedEffects(spell.id);
    if (scripted?.length) {
      const onlyAtt = effects.length === 0
        || effects.every((e) => e.kind === 'add_target_trigger');
      if (onlyAtt) effects = scripted.map((e) => ({ ...e }));
    }
  }
  {
    // Combustion and kin: the DBC slots are real, so the C++ payload is appended, not swapped in.
    const extra = talentScriptedAppendEffects(spell.id);
    if (extra?.length) {
      const have = new Set(effects.map((e) => e.kind));
      effects = [...effects, ...extra.filter((e) => !have.has(e.kind))];
    }
  }
  if (effects.length === 0) {
    // The dummy-script packs resolve the payload id and then push only a cast intent, which combat
    // does not read — 12 spells stopped there. Only when nothing else was produced.
    const seen = new Set<number>();
    for (const intent of result.intents ?? []) {
      if (intent.kind !== 'cast_triggered_spell') continue;
      const id = intent.spellId | 0;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      effects.push({ kind: 'trigger_spell', spellId: id });
    }
    // The same shape one layer up: a dummy aura body whose whole job is "cast X" resolves X into the
    // intent and stops. Remove-side bodies go through the aura-removal materializer below.
    for (const intent of result.intents ?? []) {
      if (intent.kind !== 'aura_dummy') continue;
      const id = (intent.relatedSpellId ?? 0) | 0;
      if (!id || seen.has(id)) continue;
      if (intent.on !== 'apply' && intent.on !== 'both') continue;
      if (intent.action === 'cast_spell') {
        seen.add(id);
        effects.push({ kind: 'trigger_spell', spellId: id });
      } else if (intent.action === 'periodic' && (intent.periodMs ?? 0) > 0) {
        seen.add(id);
        effects.push({
          kind: 'proc_trigger_spell',
          triggerSpellId: id,
          durationMs: durMs(spell.durationIndex) ?? 0,
          tickMs: intent.periodMs,
          ...(intent.chancePct != null ? { tickChance: intent.chancePct / 100 } : {}),
        });
      }
    }
  }
  // Class kits + seals (same post-pass as resolveCombatSpell).
  // Cite: warrior-druid/hunter/priest-warlock/paladin kits; paladin-seals.ts.
  effects = materializeWarriorDruidKitEffects(spell, result, effects);
  effects = materializeDispelMechanicIntents(result.intents, effects);
  effects = materializeSpellMagnetIntents(result.intents, effects, spell);
  if (state.ctx.rage != null) {
    effects = applyExecuteRageToEffects(spell, effects, state.ctx.rage);
  }
  effects = materializeHunterKitEffects(spell, result, effects);
  effects = materializePriestWarlockKitEffects(spell, result, effects);
  effects = materializePaladinKitEffects(spell, result, effects);
  const sealFx = materializePaladinSeal(spell);
  if (sealFx) effects = sealMaterializedEffects(sealFx, spell, effects);
  effects = materializeMissingSpeedFromRaw(spell, effects);
  // Aura-removal bodies (Grobbulus's injection, Huhuran's sting, Itch, Combustion's stacks).
  // After the kits so a kit rewrite cannot drop the holder. Cite: handlers/aura-remove.ts.
  effects = materializeAuraRemoveEffects(spell, effects);
  // mod_resistance_pct (aura 101 physical) → armor_pct buff — same as resolveCombatSpell.
  for (const intent of result.intents ?? []) {
    if (intent.kind !== 'mod_resistance_pct') continue;
    if ((intent.schoolMask & 1) === 0) continue;
    const rawSlot = (spell.rawEffects ?? []).find(
      (r) => r.effect === 6 && r.auraName === 101,
    );
    const hostile = rawSlot != null && rawSlot.targetA !== 1;
    effects = [
      ...effects,
      {
        kind: 'buff',
        mod: 'armor_pct',
        amount: intent.amount,
        durationMs: intent.durationMs,
        ...(hostile ? { hostile: true as const } : {}),
      },
    ];
  }
  effects = liftConsumeEnergyIntents(result.intents, effects);
  effects = materializeUnreadIntents(result.intents, effects);
  stampProcChargesOnEffects(effects as Array<{ kind: string; charges?: number }>, spell.procCharges);
  // Do not bulk-lift intents into effects: the dual-push handlers already put combat payloads there,
  // so a blanket lift doubled those rows and stripping intents broke intent-keyed consumers.
  const intents = result.intents ? [...result.intents] : [];
  result = {
    ...result,
    effects,
    ...(intents.length ? { intents } : {}),
  };
  if (!intents.length) delete (result as { intents?: unknown }).intents;
  return result;
}

// The interpreter is ON by default for live combat; a false context flag or the env var turns it off.
// Read once: the env lookup goes through a V8 interceptor and this sits on the per-cast path.
const ENV_SI_OFF = typeof process !== 'undefined'
  && process.env?.PHONECRAFT_SI_INTERPRETER === '0';
export function isInterpreterEnabled(ctx?: InterpretContext): boolean {
  if (ctx?.useInterpreter === false) return false;
  if (ctx?.useInterpreter === true) return true;
  // Legacy env `=1` still forces on — a no-op while the default is on.
  return !ENV_SI_OFF;
}
