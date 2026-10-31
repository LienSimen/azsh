// Pure spell-effect resolution plus item trigger routing: on-use, on-equip and chance-on-hit take the
// same resolver. It never invents an effect and never rolls without an injected rng.

import type { ItemDef, Mechanic, SpellDef, SpellEffect, BuffMod } from '../../../data/schema.ts';
import type { Rng } from '../../core/rng.ts';
import type { ProcEventContext } from '../procs.ts';
import { MECHANIC_ID } from '../../../domain/creature/creatureAiConstants.ts';
import {
  EFFECT_HANDLERS,
  createHandlerState,
  finalizeResult,
} from './handlers.ts';

/** SharedDefines Mechanics id → name (inverse of MECHANIC_ID). */
const MECHANIC_NAME_FROM_ID: Readonly<Record<number, Mechanic>> = Object.freeze(
  Object.fromEntries(
    Object.entries(MECHANIC_ID)
      .filter(([, id]) => id != null && id > 0)
      .map(([name, id]) => [id as number, name as Mechanic]),
  ),
);
import {
  buildProcTriggerSpellMeta,
  resolveProcTriggerSpellId,
  tryProcTriggerSpell,
  type ProcTriggerSpellMeta,
} from './proc.ts';
import { effectAmountRange } from './amount.ts';
import {
  applyWeaponImbueKit,
  applyWeaponImbueKitFromItemEnchant,
  weaponImbueHasCombatKit,
} from './weapon-imbue-kit.ts';
import { SPELL_ATTR_EX2, hasAttrEx2 } from '../spellAttributes.ts';
// The extracted enchantment table. The resolver fills thin weapon-imbue rows from it so poisons,
// stones and oils work without re-running the docker-only enricher. Cite: extract-item-enchants.mjs.
import itemEnchantsTable from '../../../data/tables/itemEnchants.json' with { type: 'json' };

// Baked roles no effect payload can imply, so role inference never returns them: the two auto-attack
// toggles, the tame channel, and the pet heal — which must be rescued or combat heals the owner.
const NON_DERIVABLE_ROLES: ReadonlySet<string> = new Set(['shoot', 'attack', 'pet_tame', 'pet_heal']);
import {
  SPELL_AURA_PROC_TRIGGER_SPELL,
  SPELL_EFFECT_APPLY_AURA,
} from './opcodes.ts';
import type { InterpretContext, InterpretResult } from './types.ts';
import {
  materializeOverrideClassScriptIntents,
  materializeSpellModIntents,
  talentScriptedEffects,
  talentScriptedAppendEffects,
} from './talent-scripted.ts';
import { materializePaladinSeal, sealMaterializedEffects } from './paladin-seals.ts';
import {
  applyExecuteRageToEffects,
  materializeWarriorDruidKitEffects,
} from './warrior-druid-kit.ts';
import { materializeHunterKitEffects } from './hunter-kit.ts';
import { materializePriestWarlockKitEffects } from './priest-warlock-kit.ts';
import { materializePaladinKitEffects } from './paladin-kit.ts';
import { applyFormAttrPatch } from './form-attrs.ts';
import { materializeAuraRemoveEffects } from './handlers/aura-remove.ts';
import { liftConsumeEnergyIntents } from './lift-consume-energy.ts';
import {
  materializeMissingSpeedFromRaw,
  stampMissingSpeedFromRaw,
} from './materialize-speed.ts';
import {
  materializeMissingRatingBuffsFromRaw,
  stampMissingRatingBuffsFromRaw,
} from './materialize-rating-buffs.ts';
import {
  materializeMissingCharmFromRaw,
  stampMissingCharmFromRaw,
} from './materialize-charm.ts';
import { withHostile } from './targeting.ts';
import { materializeDispelMechanicIntents } from './materialize-dispel-mechanic.ts';
import { materializeSpellMagnetIntents } from './materialize-spell-magnet.ts';

// Local interpret entry (same body as index.interpretSpell) — avoids circular import with index.ts
// re-exports of this module.
function interpretSpellLocal(spell: SpellDef, ctx: InterpretContext = {}): InterpretResult {
  const resolvedCtx: InterpretContext = {
    ...ctx,
    spellLevel:
      ctx.spellLevel
      ?? (ctx.casterLevel != null ? (spell.spellLevel ?? spell.reqLevel ?? 0) : undefined),
  };
  const state = createHandlerState(spell, resolvedCtx);
  const rawList = spell.rawEffects;
  if (!rawList || rawList.length === 0) {
    return finalizeResult(state);
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
    // Same stamp as index.interpretSpell; this is the copy the combat path actually calls.
    for (let i = before; i < state.effects.length; i++) {
      const e = state.effects[i]!;
      if (e.effectSlot == null) e.effectSlot = slot;
    }
  }
  return finalizeResult(state);
}

/** Spell id → SpellDef lookup (DataStore.spell / combatant spell list). */
export type SpellLookup = (id: number) => SpellDef | undefined | null;

/** ItemDef.procs row shape (FI2 bake). */
export type ItemProcRow = NonNullable<ItemDef['procs']>[number];

export interface ResolveSpellEffectsOpts extends InterpretContext {
  // Force interpreter even when the SI gate is off. SI5 default already prefers interpreter when rawEffects
  // exist.
  forceInterpreter?: boolean;
}

/** True when bake synthesized no usable SpellEffect list. */
export function isBakeEffectsEmpty(spell: SpellDef): boolean {
  return !spell.effects || spell.effects.length === 0;
}

// Catalog materializer for a hollow baked effect list that still has raw effects. Allowlisted opcodes
// only: a full-catalog materialize would flip rotation's "empty bake means skip the keep-up" gate.
const FILL_EMPTY_EFFECT_OPCODES = new Set([
  2, // SCHOOL_DAMAGE
  3, // SPELL_EFFECT_DUMMY — Holy Shock parent ranks (materializePaladinKit)
  5, // SPELL_EFFECT_TELEPORT_UNITS
  8, // POWER_DRAIN
  9, // HEALTH_LEECH (Death Coil)
  10, // HEAL
  17, // WEAPON_DAMAGE_NOSCHOOL (Heroic Strike / Overpower)
  22, // SPELL_EFFECT_PARRY — Parry 3127 SetCanParry; KI-818
  23, // SPELL_EFFECT_BLOCK — Block 107 SetCanBlock
  28, // SUMMON (pet family)
  31, // WEAPON_PERCENT_DAMAGE
  33, // SPELL_EFFECT_OPEN_LOCK — Pick Lock 1804 / Opening (catalog + OOC; KI-613)
  38, // SPELL_EFFECT_DISPEL — Cleanse / Cure / Remove Curse
  41, // SPELL_EFFECT_SUMMON_WILD
  50, // SPELL_EFFECT_TRANS_DOOR — mage capital Portals only materialize teleport (handleTransDoor)
  56, // SUMMON_PET
  58, // WEAPON_DAMAGE
  59, // SPELL_EFFECT_OPEN_LOCK_ITEM — shared EffectOpenLock with 33
  64, // TRIGGER_SPELL
  67, // HEAL_MAX_HEALTH (Lay on Hands)
  69, // SPELL_EFFECT_DISTRACT
  71, // SPELL_EFFECT_PICKPOCKET
  95, // SPELL_EFFECT_SKINNING — 8613/8617/8618/10768; KI must-impl #18
  99, // SPELL_EFFECT_DISENCHANT — Disenchant 13262 / 10694 (PT); KI must-impl #18
  73, // SUMMON_POSSESSED (Eye of Kilrogg)
  77, // SCRIPT_EFFECT (healthstone / friend-heal)
  112, // SUMMON_DEMON (Inferno)
  121, // NORMALIZED_WEAPON_DMG
]);
/** Aura opcodes safe to materialize on the catalog surface. */
const FILL_EMPTY_AURA_OPCODES = new Set([
  1, // SPELL_AURA_BIND_SIGHT (Mind Vision)
  4, // SPELL_AURA_DUMMY — seals / VE / soulstone / scripted holders (resolveCombatSpell kits)
  5, // MOD_CONFUSE / polymorph (higher ranks)
  2, // SPELL_AURA_MOD_POSSESS — Mind Control; KI-801 family
  6, // SPELL_AURA_MOD_CHARM — Enslave Demon / Dominate Mind; KI-801
  177, // SPELL_AURA_AOE_CHARM — TakeCharmOf advertised=false; HandleAoECharm :2348
  7, // SPELL_AURA_MOD_FEAR — creature/player fear (Terrify 7399); KI-448
  9, // MOD_ATTACKSPEED
  10, // MOD_THREAT (Blessing of Salvation / Greater)
  13, // MOD_DAMAGE_DONE (Tiger's Fury)
  14, // MOD_DAMAGE_TAKEN (Blessing of Sanctuary)
  15, // DAMAGE_SHIELD (Thorns / Retribution)
  17, // SPELL_AURA_MOD_STEALTH_DETECT (Catseye Elixir) — KI-593 catalog surface
  18, // SPELL_AURA_MOD_INVISIBILITY (Lesser/Greater Invis pots) — KI-592
  19, // SPELL_AURA_MOD_INVISIBILITY_DETECTION (Detect Lesser/Greater Invisibility)
  22, // MOD_RESISTANCE
  23, // PERIODIC_TRIGGER_SPELL
  28, // SPELL_AURA_REFLECT_SPELLS (Sheen of Zanza when bake drops parent aura) — KI-625
  29, // MOD_STAT
  31, // MOD_INCREASE_SPEED (Dash / Ghost Wolf)
  32, // MOD_INCREASE_MOUNTED_SPEED
  33, // MOD_DECREASE_SPEED
  36, // MOD_SHAPESHIFT
  42, // PROC_TRIGGER_SPELL
  44, // SPELL_AURA_TRACK_CREATURES (Detect Undead / Beast) — KI-592
  45, // TRACK_RESOURCES (Find Treasure)
  47, // MOD_PARRY_PERCENT
  49, // MOD_DODGE_PERCENT
  51, // MOD_BLOCK_PERCENT (Shield Block / Holy Shield)
  52, // MOD_CRIT_PERCENT
  56, // TRANSFORM (Polymorph variants)
  65, // MOD_CASTING_SPEED
  67, // MOD_DISARM
  68, // SPELL_AURA_MOD_STALKED — track flag (Hunter's Mark effect 1); KI-849
  69, // SPELL_AURA_SCHOOL_ABSORB — PW:S / Fire Ward / Frost Ward; KI-426
  77, // MECHANIC_IMMUNITY (Fear Ward)
  78, // MOUNTED (Warhorse / Felsteed)
  79, // MOD_DAMAGE_PERCENT_DONE (Power Infusion)
  80, // SPELL_AURA_MOD_PERCENT_STAT (BoK)
  82, // SPELL_AURA_WATER_BREATHING (Water Breathing / Unending Breath)
  91, // SPELL_AURA_MOD_DETECT_RANGE (Mind Soothe)
  93, // MOD_UNATTACKABLE (Phase Shift)
  97, // SPELL_AURA_MANA_SHIELD — Mana Shield ranks; KI-423
  98, // SPELL_AURA_MOD_SKILL_TALENT — racial weapon/eng skill (Gun/Axe/Sword/Mace Spec, Eng Spec)
  99, // MOD_ATTACK_POWER
  100, // SPELL_AURA_AURAS_VISIBLE (Detect Magic)
  104, // SPELL_AURA_WATER_WALK (Water Walking)
  105, // FEATHER_FALL
  107, // ADD_FLAT_MODIFIER → next_cast_mod (Inner Focus / Combustion)
  108, // ADD_PCT_MODIFIER → next_cast_mod
  110, // SPELL_AURA_MOD_POWER_REGEN_PERCENT — Evocation / Innervate; KI-424
  88, // SPELL_AURA_MOD_HEALTH_REGEN_PERCENT — Troll Regeneration OOC +10%; KI-876
  116, // SPELL_AURA_MOD_REGEN_DURING_COMBAT — Troll Regeneration combat 10%; KI-876
  117, // SPELL_AURA_MOD_MECHANIC_RESISTANCE — Orc Hardiness stun resist
  127, // SPELL_AURA_RANGED_ATTACK_POWER_ATTACKER_BONUS — Hunter's Mark +RAP; KI-849
  134, // SPELL_AURA_MOD_MANA_REGEN_INTERRUPT — channel full spirit (Evocation/Innervate)
  136, // MOD_HEALING_DONE_PERCENT (Power Infusion)
  137, // SPELL_AURA_MOD_TOTAL_STAT_PERCENTAGE (GBK)
  138, // MOD_MELEE_HASTE (Curse of Tongues)
  144, // SAFE_FALL
  149, // SPELL_AURA_RESIST_PUSHBACK — Concentration Aura 19746 (35%); Barkskin uses same aura
  153, // SPELL_AURA_SPLIT_DAMAGE_FLAT — Blessing of Sacrifice; KI-821
  155, // MOD_WATER_BREATHING (Undead racial)
  156, // SPELL_AURA_MOD_REPUTATION_GAIN — Human Diplomacy
  165, // SPELL_AURA_MELEE_ATTACK_POWER_ATTACKER_BONUS — melee twin of 127
  168, // SPELL_AURA_MOD_DAMAGE_DONE_VERSUS — Beast Slaying / Echoes; KI-875
  30, // SPELL_AURA_MOD_SKILL — equip/temp skill auras (same surface as 98)
]);

/** Blessing of Sanctuary ranks — empty effects[] + aura 14/43; catalog must match combat (KI-180). */
const FILL_EMPTY_SPELL_IDS = new Set([20911, 20912, 20913, 20914, 25899]);

export function fillEmptyEffectsFromRaw(
  spell: SpellDef,
  ctx: ResolveSpellEffectsOpts = {},
): SpellDef {
  if (!isBakeEffectsEmpty(spell)) return spell;
  const raw = spell.rawEffects;
  if (!raw?.length) return spell;
  const eligible = FILL_EMPTY_SPELL_IDS.has(spell.id | 0) || raw.some((r) => {
    const eff = r.effect | 0;
    const aura = r.auraName | 0;
    return FILL_EMPTY_EFFECT_OPCODES.has(eff) || FILL_EMPTY_AURA_OPCODES.has(aura);
  });
  if (!eligible) return spell;
  const resolved = resolveCombatSpell(spell, ctx);
  if (!resolved.effects.length) return spell;
  // Warriors never use combo points — DBC ATTR_EX_FINISH on Overpower is not NeedsComboPoints.
  // Cite: SpellMgr.h NeedsComboPoints energy/rogue finishers; KI-569.
  if (resolved.requiresComboPoints && resolved.powerType === 'rage') {
    const out = { ...resolved };
    delete (out as { requiresComboPoints?: boolean }).requiresComboPoints;
    delete (out as { finishingScalesDamage?: boolean }).finishingScalesDamage;
    return out;
  }
  return resolved;
}

// The interpreter gate, kept local to avoid a circular import. Read once: the env lookup goes through
// a V8 interceptor and ran per spell resolution per cast — 2.3% of a 40-unit tick profile.
const ENV_INTERPRETER_OFF = typeof process !== 'undefined'
  && process.env?.PHONECRAFT_SI_INTERPRETER === '0';
function interpreterGateOn(ctx?: InterpretContext): boolean {
  if (ctx?.useInterpreter === false) return false;
  if (ctx?.useInterpreter === true) return true;
  return !ENV_INTERPRETER_OFF;
}

// Resolve spell effects for the combat and item paths: raw effects with the gate on are interpreted,
// otherwise the baked list stands. No Math.random or wall clock — callers pass an injected rng.
export function resolveSpellEffects(
  spell: SpellDef,
  ctx: ResolveSpellEffectsOpts = {},
): InterpretResult {
  const rawLen = spell.rawEffects?.length ?? 0;
  const preferInterp =
    ctx.forceInterpreter === true ||
    (rawLen > 0 && interpreterGateOn(ctx));

  if (preferInterp && rawLen > 0) {
    const { forceInterpreter: _f, ...rest } = ctx;
    return interpretSpellLocal(spell, { ...rest, useInterpreter: true });
  }

  return {
    effects: spell.effects ? spell.effects.slice() : [],
    unhandled: [],
    ...(spell.strikeBonus != null ? { strikeBonus: spell.strikeBonus } : {}),
  };
}

// Spell ids whose hollow effect list hid the duration-scale surface. Mass-filling every hollow spell
// belongs to its own lane, since it re-classifies situational CC as a rotation keep-up.
export const DURATION_SURFACE_HOLLOW_SPELL_IDS: ReadonlySet<number> = new Set([
  // Turn Undead — creature 19725 (20s di=18), player ranks 2878 (10s di=1), 10326 (20s di=18)
  19725, 2878, 10326, 5627,
  // Rapid Fire 3045 — 15s di=8
  3045,
  // Volley ranks — 6s di=32 (often already filled; materialize is no-op then)
  1510, 14294, 14295, 14296,
  // Creature Psychic Scream 13704 — same 6s di=32 pattern as KI-152 notes
  13704,
]);

// Fill a bake-hollow effect list in place from the raw effects, for the duration-surface ids only:
// combat re-resolves, but data-store consumers and repros read the effect list for its duration.
export function materializeHollowSpellsInPlace(
  spells: Iterable<SpellDef>,
  ctx: ResolveSpellEffectsOpts = {},
  opts: { onlyIds?: ReadonlySet<number> } = {},
): number {
  const only = opts.onlyIds ?? DURATION_SURFACE_HOLLOW_SPELL_IDS;
  let n = 0;
  for (const spell of spells) {
    if (!only.has(spell.id | 0)) continue;
    if (spell.passive) continue;
    if (!isBakeEffectsEmpty(spell)) continue;
    if (!(spell.rawEffects?.length)) continue;
    const resolved = resolveCombatSpell(spell, ctx);
    if (!resolved.effects.length) continue;
    spell.effects = resolved.effects.map((e) => ({ ...e }));
    if (resolved.role && !spell.role) spell.role = resolved.role;
    if (resolved.strikeBonus != null && spell.strikeBonus == null) {
      spell.strikeBonus = resolved.strikeBonus;
    }
    if (resolved.rageGenerated != null && spell.rageGenerated == null) {
      spell.rageGenerated = resolved.rageGenerated;
    }
    if (resolved.aoe != null && spell.aoe == null) spell.aoe = resolved.aoe;
    n += 1;
  }
  return n;
}

// The combat materializer: a SpellDef with effects and strike bonus from the interpreter when raw
// effects exist. A shallow copy, so the bake row is not mutated; without raw it returns the input.
export function resolveCombatSpell(
  spell: SpellDef,
  ctx: ResolveSpellEffectsOpts = {},
): SpellDef {
  if (!interpreterGateOn(ctx)) {
    // Still stamp form attrs (notShapeshift / costPct) — independent of effect opcodes.
    return applyFormAttrPatch(spell);
  }

  const rawLen = spell.rawEffects?.length ?? 0;
  // Scripted talent residuals, the port of the talent-actives enricher. Filled only when the baked
  // effects are empty, so a hand-built fixture or an already-resolved def is never clobbered.
  const scripted = talentScriptedEffects(spell.id);

  if (rawLen === 0) {
    if (scripted && isBakeEffectsEmpty(spell)) {
      return applyFormAttrPatch({ ...spell, effects: scripted.map((e) => ({ ...e })) });
    }
    return applyFormAttrPatch(spell);
  }

  const result = resolveSpellEffects(spell, { ...ctx, forceInterpreter: true });
  let effects = result.effects.slice();
  // Prefer the concrete scripted effects when the generic path left the list empty. Deep Wounds
  // materializes intermediate dummy triggers that the C++ rewrites, so keep the holder.
  if (
    scripted
    && (
      effects.length === 0
      || scripted.some((e) =>
        e.kind === 'deep_wounds'
        || e.kind === 'pyroclasm'
        || e.kind === 'sweeping_strikes'
        // C++ rewrites these dummy/proc holders (generic aura-42 would double-fire without the gate).
        // Cite: UnitAuraProcHandler.cpp Cheat Death 28845; Adaptive Warding 28764; set/talent s20.
        || e.kind === 'cheat_death'
        || e.kind === 'adaptive_warding'
        || e.kind === 'class_power_set'
        || e.kind === 'vestments_greater_heal'
        || e.kind === 'dreamwalker_healing_touch'
        || e.kind === 'idol_healing_touch_refund'
        || e.kind === 'totem_lesser_healing_wave'
        || e.kind === 'master_of_elements'
        || e.kind === 'magic_absorption'
        || e.kind === 'oracle_healing_bonus'
        || e.kind === 'obsidian_armor'
        || e.kind === 'eye_for_an_eye'
        || e.kind === 'ignite'
        // Aura 109 Improved Sprint stays scripted so generic add_target_trigger does not replace it.
        // Cite: Spell.cpp:7433–7468; SpellEffects.cpp:4140–4147 case 30918.
        || e.kind === 'improved_sprint'
        // Vampiric Embrace and Demonic Sacrifice leave a bare holder on the generic path, so the
        // scripted payload is kept or the pickers classify them as utility rather than castable.
        || e.kind === 'vampiric_embrace'
        || e.kind === 'demonic_sacrifice',
      )
    )
  ) {
    effects = scripted.map((e) => ({ ...e }));
  }
  {
    // Combustion and kin: the DBC slots are real, so the C++ payload rides alongside them.
    const extra = talentScriptedAppendEffects(spell.id);
    if (extra?.length) {
      const have = new Set(effects.map((e) => e.kind));
      effects = [...effects, ...extra.filter((e) => !have.has(e.kind))];
    }
  }
  // Runtime speed merge: when the bake dropped a speed aura the raw effects still carry, append it to
  // both the resolved list and the shared bake row, so inspection sees the snare without a re-bake.
  effects = materializeMissingSpeedFromRaw(spell, effects);
  stampMissingSpeedFromRaw(spell);
  // Second-slot rating buffs (Mongoose crit aura 52) when bake only mapped the first aura.
  // Cite: materialize-rating-buffs.ts; KI-591.
  effects = materializeMissingRatingBuffsFromRaw(spell, effects);
  stampMissingRatingBuffsFromRaw(spell);
  // Charm/possess (Enslave Demon / Mind Control) when bake only mapped the haste rider.
  // Cite: materialize-charm.ts; SpellAuras HandleModCharm; KI-801.
  effects = materializeMissingCharmFromRaw(spell, effects);
  stampMissingCharmFromRaw(spell);
  // Will of the Forsaken and Escape Artist: the seed layers stamp a cleanse for the control-breaker
  // path, which the mechanic-immunity interpretation would drop, so it is merged back.
  {
    const bakeCleanses = (spell.effects ?? []).filter((e) => e.kind === 'cleanse');
    if (bakeCleanses.length > 0 && !effects.some((e) => e.kind === 'cleanse')) {
      effects = [...bakeCleanses.map((e) => ({ ...e })), ...effects];
    }
  }
  // Spell-mod residuals such as a free cost or a crit bonus become a next-cast modifier, rank-generic
  // from the intents. The scripted table wins above when it has a row.
  effects = materializeSpellModIntents(result.intents, effects, spell);
  effects = materializeOverrideClassScriptIntents(result.intents, effects, spell);
  // The Orc Command racial is a permanent 5% pet damage buff, and the generic modifier materialize
  // turns it into a 15-second self buff — the wrong target and the wrong duration.
  if (spell.id === 20575 || spell.id === 20576) {
    let amount = 5;
    for (const r of spell.rawEffects ?? []) {
      const aura = r.auraName | 0;
      if (aura !== 107 && aura !== 108) continue;
      const { min } = effectAmountRange(r, ctx);
      if (min !== 0) { amount = min; break; }
    }
    effects = [{
      kind: 'buff',
      mod: 'damage_done_pct',
      amount,
      durationMs: 0,
      applyTo: 'pet',
    }];
  }
  // A resistance-percent intent on a physical mask becomes a live armor buff or debuff, and hostility
  // comes from targetA: without the flag, Death Wish's own -20% armor read as a foe debuff.
  for (const intent of result.intents ?? []) {
    if (intent.kind !== 'mod_resistance_pct') continue;
    if ((intent.schoolMask & 1) === 0) continue; // armor is the physical bit only
    const rawSlot = (spell.rawEffects ?? []).find(
      (r) => r.effect === 6 && r.auraName === 101,
    );
    const tgtA = (rawSlot?.targetA ?? 0) | 0;
    effects.push(withHostile(
      {
        kind: 'buff' as const,
        mod: 'armor_pct' as const,
        amount: intent.amount,
        durationMs: intent.durationMs,
      },
      tgtA,
      intent.amount,
    ));
  }

  // SESSION 3 — Warrior/Druid kit: block%, cleanse, Retaliation, Barkskin, FR, Execute.
  // Cite: warrior-druid-kit.ts; SPELL-FIDELITY-RUNSHEET SESSION 3.
  effects = materializeWarriorDruidKitEffects(spell, result, effects);
  effects = materializeDispelMechanicIntents(result.intents, effects);
  effects = materializeSpellMagnetIntents(result.intents, effects, spell);
  if (ctx.rage != null) {
    effects = applyExecuteRageToEffects(spell, effects, ctx.rage);
  }

  // SESSION 4 — Hunter kit: traps (armed proc), Feign Death, Aspect of the Beast.
  // Cite: hunter-kit.ts; SPELL-FIDELITY-RUNSHEET SESSION 4.
  effects = materializeHunterKitEffects(spell, result, effects);

  // SESSION 5 — Priest/Warlock kit: Life Tap (health→mana), Lightwell ranks.
  // Cite: priest-warlock-kit.ts; Warlock.cpp LifeTap; SPELL-FIDELITY-RUNSHEET SESSION 5.
  effects = materializePriestWarlockKitEffects(spell, result, effects);

  // SESSION 11 — Paladin kit: Blessing of Sacrifice / Light / Concentration Aura.
  // Cite: paladin-kit.ts; SPELL-FIDELITY-RUNSHEET SESSION 11.
  effects = materializePaladinKitEffects(spell, result, effects);

  // Paladin seals replace their dummy and proc shells with a real seal effect so the active seal arms.
  // Cite: paladin-seals.ts; enrich-paladin-seals.mjs.
  const sealFx = materializePaladinSeal(spell);
  if (sealFx) effects = sealMaterializedEffects(sealFx, spell, effects);

  // Preserve a totem's ability kit through re-resolution: the handler emits only the slot, creature,
  // health and duration, while the kit comes from the creature spell list.
  for (let i = 0; i < effects.length; i++) {
    const e = effects[i]!;
    if (e.kind !== 'summon_totem') continue;
    const bake = (spell.effects ?? []).find(
      (be) => be.kind === 'summon_totem'
        && be.creature === e.creature
        && be.slot === e.slot,
    );
    if (!bake || bake.kind !== 'summon_totem') continue;
    const hasKit = !!(bake.abilities && bake.abilities.length);
    const hasTrigs = !!(bake.triggerAbilities && bake.triggerAbilities.length);
    if (!hasKit && !hasTrigs && !bake.name) continue;
    effects[i] = {
      ...e,
      ...(bake.name ? { name: bake.name } : {}),
      ...(hasKit
        ? { abilities: bake.abilities!.map((a) => ({ ...a, effects: a.effects.map((x) => ({ ...x })) })) }
        : {}),
      // The trigger abilities must survive re-resolution too, or every periodic totem loses its
      // payload the moment combat re-resolves the spell and goes back to summoning a decoration.
      ...(hasTrigs
        ? { triggerAbilities: bake.triggerAbilities!.map((a) => ({ ...a, effects: a.effects.map((x) => ({ ...x })) })) }
        : {}),
    };
  }

  // Weapon imbue: prefer the offline kit, then merge the richer baked fields, then fill from the
  // extracted enchantment table — so re-resolving never strips the combat payload.
  for (let i = 0; i < effects.length; i++) {
    const e = effects[i]!;
    if (e.kind !== 'weapon_imbue') continue;
    applyWeaponImbueKit(e);
    if (!weaponImbueHasCombatKit(e)) {
      const bake = (spell.effects ?? []).find(
        (be) => be.kind === 'weapon_imbue' && be.enchantId === e.enchantId,
      );
      if (bake && bake.kind === 'weapon_imbue' && weaponImbueHasCombatKit(bake)) {
        effects[i] = {
          ...e,
          ...(bake.attackPower != null ? { attackPower: bake.attackPower } : {}),
          ...(bake.equipSpellId != null ? { equipSpellId: bake.equipSpellId } : {}),
          ...(bake.combatSpellId != null ? { combatSpellId: bake.combatSpellId } : {}),
          ...(bake.combatChancePct != null ? { combatChancePct: bake.combatChancePct } : {}),
          ...(bake.combatPpm != null ? { combatPpm: bake.combatPpm } : {}),
          ...(bake.damageFlat != null ? { damageFlat: bake.damageFlat } : {}),
          ...(bake.rockbiterAmount != null ? { rockbiterAmount: bake.rockbiterAmount } : {}),
          ...(bake.combat
            ? {
                combat: {
                  ...bake.combat,
                  ...(bake.combat.direct ? { direct: { ...bake.combat.direct } } : {}),
                  ...(bake.combat.dot ? { dot: { ...bake.combat.dot } } : {}),
                },
              }
            : {}),
          ...(bake.family && !e.family ? { family: bake.family } : {}),
        };
      }
    }
    // itemEnchant fallback — poisons (chance-only), stones (damageFlat), oils (equipSpellId).
    // spellLookup fills combat.direct so Instant Poison actually deals nature damage on swing.
    const cur = effects[i]!;
    if (cur.kind !== 'weapon_imbue') continue;
    const ench =
      (ctx as { itemEnchantLookup?: (id: number) => unknown }).itemEnchantLookup?.(cur.enchantId)
      ?? (itemEnchantsTable as Record<string, { effects: unknown[] }>)[String(cur.enchantId)];
    if (ench) {
      applyWeaponImbueKitFromItemEnchant(
        cur,
        ench as Parameters<typeof applyWeaponImbueKitFromItemEnchant>[1],
        ctx.spellLookup,
      );
    }
  }

  const bakeRole = spell.role;
  // Safety net: an opcode with NO HANDLER AT ALL means the resolution is incomplete, not empty, and
  // returning it erases a row the ETL got right. Gated on unhandled, so a real empty answer stands.
  if (effects.length === 0 && (spell.effects?.length ?? 0) > 0 && result.unhandled.length > 0) {
    return applyFormAttrPatch(spell);
  }
  // Pet-management rows survive regardless, because the ETL SYNTHESIZES them onto learn-spell rows
  // whose opcode is handled and correctly emits nothing — so the guard above cannot see the drop.
  {
    const PET_KINDS = new Set(['summon_pet', 'dismiss_pet', 'revive_pet']);
    // A guardian summon covers the same creature, so do not re-add a bake stamp of a plain pet summon
    // on top of it. Cite: SpellEffects.cpp:2820-2992 EffectSummonGuardian.
    const missing = (spell.effects ?? []).filter((b) => {
      if (!PET_KINDS.has(b.kind)) return false;
      if (effects.some((e) => e.kind === b.kind)) return false;
      if (
        b.kind === 'summon_pet'
        && effects.some(
          (e) => e.kind === 'summon_guardian' && e.creature === b.creature,
        )
      ) {
        return false;
      }
      return true;
    });
    if (missing.length) effects = [...effects, ...missing.map((e) => ({ ...e }))];
  }
  // Aura-removal bodies, last so no earlier rewrite drops the holder. Cite: handlers/aura-remove.ts.
  effects = materializeAuraRemoveEffects(spell, effects);
  // interpretSpellLocal skips finalizeInterpret — lift consume/energy on this path too.
  effects = liftConsumeEnergyIntents(result.intents, effects);
  const out: SpellDef = {
    ...spell,
    effects,
  };
  if (result.strikeBonus != null) {
    out.strikeBonus = result.strikeBonus;
  }
  // A rage energize becomes generated rage in display units. The ETL stamps it from the spell's power
  // type, but Bloodrage's spell is mana while the EFFECT is rage, so the bake never stamped it.
  {
    const POWER_RAGE = 1;
    let fromEnergize = 0;
    for (const e of effects) {
      if (e.kind === 'energize' && e.powerType === POWER_RAGE) {
        fromEnergize = Math.max(fromEnergize, Math.round((e.min ?? 0) / 10));
      }
    }
    if (fromEnergize > 0) {
      out.rageGenerated = Math.max(out.rageGenerated ?? 0, fromEnergize);
    }
  }
  // ADD_COMBO_POINTS is stamped as the top-level generated count: strike riders never re-apply the
  // effect, so a thin raw-only row would land the damage and drop the combo point.
  {
    let fromCp = 0;
    for (const e of effects) {
      if (e.kind === 'combo_points') fromCp = Math.max(fromCp, e.amount | 0);
    }
    if (fromCp > 0) {
      out.comboPointsGenerated = Math.max(out.comboPointsGenerated ?? 0, fromCp);
    }
  }
  // Drop the bake-time role when the effects were replaced: enrichers often stamped utility while the
  // interpreter yields combat-usable kinds. Consumers re-derive it from the resolved list.
  if (effects !== spell.effects) {
    delete (out as { role?: string }).role;
  }
  // Phase Shift's combat stop is on APPLY, not a cast-time gate: the peaceful-only attribute on the
  // bake row made the cast a no-op mid-fight, so pet AI never autocast it.
  if (effects.some((e) => e.kind === 'mod_unattackable')) {
    delete (out as { notInCombatOnly?: boolean }).notInCombatOnly;
    delete (out as { outOfCombatOnly?: boolean }).outOfCombatOnly;
  }
  // A weapon-damage slot sets the strike role, preferred over a later buff-slot stamp — but NEVER over
  // a non-derivable bake role: effect 58 says nothing about melee versus ranged, only SpellRange does.
  if (
    (result.role === 'strike' || (result.strikeBonus != null && result.strikeBonus > 0))
    && !(bakeRole && NON_DERIVABLE_ROLES.has(bakeRole))
  ) {
    // Ranged weapon sample (Multi/Aimed, dmgClass RANGED) is not a melee strike.
    // Cite: SpellEffects.cpp EffectWeaponDmg RANGED_ATTACK; KI-745.
    if ((spell.dmgClass ?? -1) === 3) {
      out.role = (spell.castTimeMs ?? 0) > 0 ? 'nuke' : 'instant_nuke';
    } else {
      out.role = 'strike';
    }
  }
  // Seal materialization is the combat role (rotation classify / AI seal upkeep).
  if (sealFx) {
    out.role = 'seal';
  }
  // Preserve baked roles that are NOT a function of the resolved effects. For those the bake is the
  // only source there will ever be, so discarding one drops the spell out of the spellbook entirely.
  if (!out.role && bakeRole && NON_DERIVABLE_ROLES.has(bakeRole)) {
    out.role = bakeRole;
  }
  // Paid role=shoot casts (Multi/Aimed) are not Auto Shot toggles — reclass after preserve.
  // Pure Auto Shot / Shoot / Throw stay shoot (cost 0, cast 0, gcd 0). Cite: KI-745.
  if (
    out.role === 'shoot'
    && ((out.cost ?? 0) > 0 || (out.castTimeMs ?? 0) > 0 || (out.gcdMs ?? 0) > 0)
  ) {
    out.role = (out.castTimeMs ?? 0) > 0 ? 'nuke' : 'instant_nuke';
  }
  // The spell mechanic: prefer the bake, else fold the raw slots. Template immunity masks and the
  // diminishing-returns key both read this field. Cite: SharedDefines.h Mechanics.
  if (!out.mechanic || out.mechanic === 'none') {
    // Adopt a slot mechanic ONLY when every real slot carries the same one. Taking any slot's made
    // Frostbolt's snare the SPELL's mechanic, and 146 damage spells went unusable on snare immunes.
    const slots = (spell.rawEffects ?? []).filter((r) => (r.effect | 0) > 0);
    const mechs = slots.map((r) => r.mechanic | 0);
    const distinct = [...new Set(mechs.filter((m) => m > 0))];
    if (distinct.length === 1 && mechs.every((m) => m === distinct[0])) {
      const named = MECHANIC_NAME_FROM_ID[distinct[0]!];
      if (named) out.mechanic = named;
    }
  }
  // Warriors never use combo points: the finisher attribute on Overpower is not the combo-point one,
  // so clear it or the ability list is unusable after a dodge. Cite: SpellMgr.h NeedsComboPoints.
  if (out.requiresComboPoints && out.powerType === 'rage') {
    delete (out as { requiresComboPoints?: boolean }).requiresComboPoints;
    delete (out as { finishingScalesDamage?: boolean }).finishingScalesDamage;
  }
  // The interpreter can set the pet-heal role from a pet target even with no bake role — keep that
  // stamp, or combat's health restore heals the owner instead of the pet.
  if (!out.role && result.role && NON_DERIVABLE_ROLES.has(result.role)) {
    out.role = result.role;
  }
  // AoE: enemy-area ImplicitTarget on raw slots (enrich-spell-aoe retired).
  // Cite: SharedDefines Targets 15/16/22/24/28; combat castOnTargets.
  if (out.aoe == null) {
    const AREA_ENEMY = new Set([15, 16, 22, 24, 28]);
    for (const r of spell.rawEffects ?? []) {
      const a = r.targetA | 0;
      const b = r.targetB | 0;
      if (AREA_ENEMY.has(a) || AREA_ENEMY.has(b)) {
        out.aoe = true;
        break;
      }
    }
  }
  // The not-shapeshift and allow-while-not attributes plus the form cost percent, from the ClassicDB
  // map: the bake keeps only the stance columns, and the form attributes were lost with the enricher.
  return applyFormAttrPatch(out);
}

// On-use: resolve ItemDef.useSpell through resolveSpellEffects. Returns null when the item has no useSpell
// or the spell is missing.
export function resolveItemOnUse(
  item: Pick<ItemDef, 'useSpell'>,
  lookup: SpellLookup,
  ctx: ResolveSpellEffectsOpts = {},
): { spellId: number; spell: SpellDef; result: InterpretResult } | null {
  const spellId = item.useSpell;
  if (spellId == null) return null;
  const spell = lookup(spellId) ?? undefined;
  if (!spell) return null;
  return { spellId, spell, result: resolveSpellEffects(spell, ctx) };
}

// Combat bag-item surface: first buff or instant heal from an interpret result. Same shapes as
// character.combatItems today (apply_buff / restore_health).
export function combatUseEffectFromInterpret(
  result: InterpretResult,
  spellId: number,
):
  | {
      kind: 'apply_buff';
      mod: BuffMod;
      amount: number;
      durationMs: number;
      spellId: number;
    }
  | { kind: 'restore_health'; min: number; max: number }
  | null {
  for (const e of result.effects) {
    if (e.kind === 'buff') {
      return {
        kind: 'apply_buff',
        mod: e.mod,
        amount: e.amount,
        durationMs: e.durationMs,
        spellId,
      };
    }
  }
  for (const e of result.effects) {
    if (e.kind === 'heal') {
      return { kind: 'restore_health', min: e.min, max: e.max };
    }
  }
  return null;
}

// On-use → combatItems effect when bake path is empty/inert but interpreter yields buff/heal. Skips
// food/drink restore_* (OOC only) when those appear on bake effects.
export function resolveCombatUseFromItem(
  item: Pick<ItemDef, 'useSpell' | 'requiredLevel'>,
  lookup: SpellLookup,
  opts: { level: number; ctx?: ResolveSpellEffectsOpts } = { level: 1 },
):
  | {
      kind: 'apply_buff';
      mod: BuffMod;
      amount: number;
      durationMs: number;
      spellId: number;
      cooldownMs: number;
    }
  | {
      kind: 'restore_health';
      min: number;
      max: number;
      cooldownMs: number;
      spellId: number;
    }
  | null {
  const resolved = resolveItemOnUse(item, lookup, opts.ctx);
  if (!resolved) return null;
  const { spell, spellId, result } = resolved;

  // Skip OOC food/drink when bake still tags them (interpreter may not re-emit restore_*)
  const hasFoodDrinkRestore = (spell.effects ?? []).some(
    (e) => e.kind === 'restore_health' || e.kind === 'restore_power',
  );
  if (hasFoodDrinkRestore) return null;

  // Item.RequiredLevel only — spell.reqLevel over-gates pots (KI-855); alone under-gates (KI-837).
  // Cite: Player.cpp:9797 CanUseItem.
  const req = (item.requiredLevel | 0) || 1;
  if (opts.level < req) return null;

  const use = combatUseEffectFromInterpret(result, spellId);
  if (!use) return null;
  const cooldownMs = spell.cooldownMs ?? 0;
  if (use.kind === 'apply_buff') {
    return { ...use, cooldownMs };
  }
  return { ...use, cooldownMs, spellId };
}

// On-equip: resolve each equipSpells[] id through the interpreter. Additive path for previously inert
// empty-effects equip auras (does not replace equipMods).
export function resolveEquipSpells(
  equipSpellIds: number[] | undefined | null,
  lookup: SpellLookup,
  ctx: ResolveSpellEffectsOpts = {},
): Array<{ spellId: number; spell: SpellDef; result: InterpretResult }> {
  const out: Array<{ spellId: number; spell: SpellDef; result: InterpretResult }> = [];
  if (!equipSpellIds?.length) return out;
  for (const spellId of equipSpellIds) {
    const spell = lookup(spellId) ?? undefined;
    if (!spell) continue;
    out.push({ spellId, spell, result: resolveSpellEffects(spell, ctx) });
  }
  return out;
}

// Buff mods from equip spells (interpreter when bake empty). Non-hostile buff only. Caller may merge with
// ItemDef.equipMods without dropping either side.
export function resolveEquipBuffMods(
  equipSpellIds: number[] | undefined | null,
  lookup: SpellLookup,
  ctx: ResolveSpellEffectsOpts = {},
): Array<{ mod: string; amount: number; spellId: number }> {
  const mods: Array<{ mod: string; amount: number; spellId: number }> = [];
  for (const { spellId, result } of resolveEquipSpells(equipSpellIds, lookup, ctx)) {
    for (const e of result.effects) {
      if (e.kind !== 'buff') continue;
      if (e.hostile) continue;
      mods.push({ mod: e.mod, amount: e.amount, spellId });
    }
  }
  return mods;
}

// Build the proc metadata from an item's proc row and an optional holder spell. The rates and flags
// come from the item first, then the holder's proc event and spell row — never invented.
export function buildItemProcMeta(
  proc: ItemProcRow,
  holderSpell?: SpellDef | null,
): ProcTriggerSpellMeta {
  const holderId = (holderSpell?.id ?? proc.spell) | 0;
  const pe = holderSpell?.spellProcEvent;

  // Aura-42 trigger chain when holder rawEffects expose it.
  let triggerSpellId = proc.spell | 0;
  let amount = 0;
  let fromAura42 = false;
  if (holderSpell?.rawEffects?.length) {
    for (const raw of holderSpell.rawEffects) {
      if ((raw.effect | 0) !== SPELL_EFFECT_APPLY_AURA) continue;
      if ((raw.auraName | 0) !== SPELL_AURA_PROC_TRIGGER_SPELL) continue;
      fromAura42 = true;
      const rawTrig = raw.triggerSpell | 0;
      triggerSpellId = resolveProcTriggerSpellId(
        holderId,
        rawTrig,
        holderSpell.spellFamilyName,
        holderSpell.spellFamilyFlags,
      );
      const { min } = effectAmountRange(raw);
      amount = min;
      break;
    }
  }
  // Prefer full meta builder when aura-42 raw is present (Lightning Shield specials, etc.).
  if (fromAura42 && holderSpell?.rawEffects) {
    const raw42 = holderSpell.rawEffects.find(
      (r) =>
        (r.effect | 0) === SPELL_EFFECT_APPLY_AURA &&
        (r.auraName | 0) === SPELL_AURA_PROC_TRIGGER_SPELL,
    );
    if (raw42) {
      const { min, max } = effectAmountRange(raw42);
      const built = buildProcTriggerSpellMeta(
        holderSpell,
        raw42,
        min,
        max || min,
        0,
        holderSpell.school ?? 'physical',
      );
      if (built) {
        // Overlay the item row's rates when the bake exposes them — the same sourced numbers. Flags
        // come from the item row only, so a fight with no item filters stays seed-stable.
        return {
          ...built,
          // ITEM/enchant proc: `chancePct > 100` is the "use GetWeaponProcChance()" sentinel here,
          // not "always". Cite: Player.cpp:7388. Aura procs must NOT carry this.
          isItemProc: true,
          chancePct:
            proc.chancePct != null && proc.chancePct > 0
              ? proc.chancePct
              : built.chancePct,
          ppmRate:
            proc.ppm != null && proc.ppm > 0
              ? proc.ppm
              : built.ppmRate,
          cooldownMs:
            proc.cooldownMs != null && proc.cooldownMs > 0
              ? proc.cooldownMs
              : built.cooldownMs,
          procFlags: (proc.flags ?? 0) | 0,
          procEx:
            proc.procEx != null && proc.procEx !== 0
              ? proc.procEx
              : undefined,
          schoolMask: proc.schoolMask,
          spellFamilyName: proc.spellFamilyName,
          spellFamilyMask: proc.spellFamilyMask,
        };
      }
    }
  }

  // Flat ItemDef-driven meta (no aura-42 body, or builder returned null).
  let chancePct = 0;
  if (proc.chancePct != null && proc.chancePct > 0) {
    chancePct = proc.chancePct;
  } else if (pe?.customChance != null && pe.customChance > 0) {
    chancePct = pe.customChance;
  } else if (holderSpell?.procChance != null && holderSpell.procChance > 0) {
    chancePct = holderSpell.procChance;
  }

  const ppmRate =
    proc.ppm != null && proc.ppm > 0
      ? proc.ppm
      : pe?.ppmRate != null && pe.ppmRate > 0
        ? pe.ppmRate
        : undefined;

  // ICD: ItemDef.cooldownMs first; else spell_proc_event.Cooldown (sourced bake).
  const cooldownMs =
    proc.cooldownMs != null && proc.cooldownMs > 0
      ? proc.cooldownMs
      : pe?.cooldownMs != null && pe.cooldownMs > 0
        ? pe.cooldownMs
        : undefined;

  return {
    holderSpellId: holderId,
    triggerSpellId,
    amount,
    // ITEM/enchant proc: `chancePct > 100` is the "use GetWeaponProcChance()" sentinel on this path,
    // not "always". Cite: Player.cpp:7388. Aura procs must NOT carry this.
    isItemProc: true,
    // ItemDef.flags only — 0 = no ProcFlags filter (legacy gear path).
    procFlags: (proc.flags ?? 0) | 0,
    procEx:
      proc.procEx != null && proc.procEx !== 0
        ? proc.procEx
        : undefined,
    chancePct,
    ppmRate,
    cooldownMs,
    schoolMask: proc.schoolMask,
    spellFamilyName: proc.spellFamilyName,
    spellFamilyMask: proc.spellFamilyMask,
    cooldownOnFailure: holderSpell ? (hasAttrEx2(holderSpell, SPELL_ATTR_EX2.PROC_COOLDOWN_ON_FAILURE) ? true : undefined) : undefined,
    bakeKind: 'proc_trigger_spell',
  };
}

// Chance-on-hit roll via SI-PROC subsystem (PPM / flat chance + ICD). Does not apply effects — caller
// resolves trigger on fire.
export function tryItemChanceOnHit(
  proc: ItemProcRow,
  holderSpell: SpellDef | undefined | null,
  eventCtx: ProcEventContext,
  rng: Rng,
  opts?: { cooldownReadyAt?: number },
): { fired: boolean; cooldownReadyAt: number | null; meta: ProcTriggerSpellMeta } {
  const meta = buildItemProcMeta(proc, holderSpell);
  const roll = tryProcTriggerSpell(meta, eventCtx, rng, opts);
  return { fired: roll.fired, cooldownReadyAt: roll.cooldownReadyAt, meta };
}

// After a successful gear-proc roll, produce a SpellDef whose `effects` are applyable. Empty bake holders:
// interpret → follow aura-42 triggerSpell when present.
export function resolveGearProcApplySpell(
  holderSpell: SpellDef,
  lookup: SpellLookup,
  ctx: ResolveSpellEffectsOpts = {},
): SpellDef | null {
  // Non-empty bake: legacy path (unchanged surface).
  if (!isBakeEffectsEmpty(holderSpell)) {
    return holderSpell;
  }
  if (!holderSpell.rawEffects?.length) return null;

  const result = resolveSpellEffects(holderSpell, ctx);

  const hasDirect = result.effects.some(
    (e) =>
      e.kind === 'direct_damage' ||
      e.kind === 'dot' ||
      e.kind === 'heal' ||
      e.kind === 'buff' ||
      e.kind === 'cc' ||
      e.kind === 'conjure',
  );
  if (hasDirect) {
    return withEffects(holderSpell, result.effects);
  }

  // Aura-42 / intent: cast the trigger spell's effects.
  let triggerId: number | undefined;
  for (const e of result.effects) {
    if (e.kind === 'proc_trigger_spell') {
      triggerId = e.triggerSpellId;
      break;
    }
  }
  if (triggerId == null && result.intents) {
    for (const i of result.intents) {
      if (i.kind === 'proc_trigger_spell') {
        triggerId = i.triggerSpellId;
        break;
      }
      if (i.kind === 'proc_triggered_cast') {
        triggerId = i.triggerSpellId;
        break;
      }
    }
  }
  // Raw trigger when interpret only left unhandled/empty secondary.
  if (triggerId == null) {
    for (const raw of holderSpell.rawEffects) {
      if (
        (raw.effect | 0) === SPELL_EFFECT_APPLY_AURA &&
        (raw.auraName | 0) === SPELL_AURA_PROC_TRIGGER_SPELL &&
        (raw.triggerSpell | 0) > 0
      ) {
        triggerId = resolveProcTriggerSpellId(
          holderSpell.id,
          raw.triggerSpell | 0,
          holderSpell.spellFamilyName,
          holderSpell.spellFamilyFlags,
        );
        break;
      }
    }
  }

  if (triggerId != null && triggerId > 0) {
    const trig = lookup(triggerId) ?? undefined;
    if (!trig) return null;
    const trigResult = resolveSpellEffects(trig, ctx);
    const effects =
      trigResult.effects.length > 0 ? trigResult.effects : (trig.effects ?? []);
    if (!effects.length) return null;
    return withEffects(trig, effects);
  }

  if (result.effects.length > 0) {
    return withEffects(holderSpell, result.effects);
  }
  return null;
}

function withEffects(spell: SpellDef, effects: SpellEffect[]): SpellDef {
  return { ...spell, effects };
}

// Nested trigger spell ids for gear procs (aura-42 holders) so combat kits can resolve them. Pure; does not
// invent ids.
export function gearProcTriggerSpellIds(
  procs: ItemProcRow[] | undefined | null,
  lookup: SpellLookup,
): number[] {
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const p of procs ?? []) {
    if (!p.spell || seen.has(p.spell)) continue;
    seen.add(p.spell);
    ids.push(p.spell);
    const holder = lookup(p.spell) ?? undefined;
    if (!holder?.rawEffects) continue;
    for (const raw of holder.rawEffects) {
      if (
        (raw.effect | 0) === SPELL_EFFECT_APPLY_AURA &&
        (raw.auraName | 0) === SPELL_AURA_PROC_TRIGGER_SPELL
      ) {
        const tid = resolveProcTriggerSpellId(
          holder.id,
          raw.triggerSpell | 0,
          holder.spellFamilyName,
          holder.spellFamilyFlags,
        );
        if (tid > 0 && !seen.has(tid)) {
          seen.add(tid);
          ids.push(tid);
        }
      }
    }
  }
  return ids;
}
