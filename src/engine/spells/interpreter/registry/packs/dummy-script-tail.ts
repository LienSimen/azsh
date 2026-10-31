// The remaining dummy and script zoo: healthstones, Soul Link, Tame Beast, the intermediate proc
// dummies, the mount and city-teleport secondaries, the ward talents, and the explicit no-ops.

import type { RegistryHandler, RegistryPack } from '../types.ts';
import { SPELL_AURA_MOUNTED } from '../../opcodes.ts';
import { POWER_ENERGY } from '../../handlers/shared.ts';
import {
  SHADOWGUARD_INTERMEDIATE_SPELL_ID,
  SHADOWGUARD_TRIGGER,
  TOUCH_OF_WEAKNESS_INTERMEDIATE_SPELL_ID,
  TOUCH_OF_WEAKNESS_TRIGGER,
} from '../../proc.ts';
import {
  SHADOW_PORTAL_SPELL_ID,
  pickShadowPortalOutcome,
  ARCANITE_DRAGONLING_SPELL_ID,
  BENDING_SHINBONE_SPELL_ID,
  COOKED_DEVIATE_FISH_SPELL_ID,
  CURSE_OF_THE_EYE_DUMMY_SPELL_ID,
  DEVIATE_FISH_SPELL_ID,
  GIFT_OF_LIFE_MAX_HEALTH_DURATION_MS,
  GIFT_OF_LIFE_MAX_HEALTH_SPELL_ID,
  GIFT_OF_LIFE_HEAL_SPELL_ID,
  GIFT_OF_LIFE_SPELL_ID,
  GNOMISH_BATTLE_CHICKEN_SPELL_ID,
  GNOMISH_MIND_CONTROL_CAP_SPELL_ID,
  GOBLIN_BOMB_SPELL_ID,
  GNOMISH_TRANSPORTER_SPELL_ID,
  TRANSPORTER_ARRIVAL_SPELL_ID,
  HOURGLASS_SAND_SPELL_ID,
  BROOD_AFFLICTION_BRONZE_SPELL_ID,
  MECHANICAL_DRAGONLING_SPELL_ID,
  MITHRIL_MECHANICAL_DRAGONLING_SPELL_ID,
  KNOCK_AWAY_10101_SPELL_ID,
  KNOCK_AWAY_18103_SPELL_ID,
  KNOCK_AWAY_18670_SPELL_ID,
  KNOCK_AWAY_18813_SPELL_ID,
  KNOCK_AWAY_18945_SPELL_ID,
  KNOCK_AWAY_19633_SPELL_ID,
  KNOCK_AWAY_20686_SPELL_ID,
  KNOCK_AWAY_22920_SPELL_ID,
  KNOCK_AWAY_23382_SPELL_ID,
  KNOCK_AWAY_25778_SPELL_ID,
  KNOCK_AWAY_30013_SPELL_ID,
  KNOCK_AWAY_30121_SPELL_ID,
  LAVA_BOMB_20474_SPELL_ID,
  LAVA_BOMB_SPELL_ID,
  LAVA_BOMB_SUMMON_2_SPELL_ID,
  LAVA_BOMB_SUMMON_SPELL_ID,
  NET_O_MATIC_SPELL_ID,
  NOGGENFOGGER_ELIXIR_SPELL_ID,
  VOODOO_SPELL_ID,
  pickVoodooOutcome,
  ONYXIA_SCALE_CLOAK_SPELL_ID,
  POLLY_EATS_ECAC_SPELL_ID,
  POLLY_JR_SPELL_ID,
  SHADOW_FLAME_DOT_AMOUNT,
  SHADOW_FLAME_DOT_DURATION_MS,
  SHADOW_FLAME_DOT_SPELL_ID,
  SHADOW_FLAME_DOT_TICK_MS,
  SHADOW_FLAME_SPELL_ID,
  SHRINK_RAY_SPELL_ID,
  SIX_DEMON_BAG_SPELL_ID,
  TEST_FETID_SKULL_SPELL_ID,
  UNIVERSAL_REMOTE_SPELL_ID,
  WARRIORS_WRATH_MOD_AMOUNT,
  WARRIORS_WRATH_MOD_DURATION_MS,
  WARRIORS_WRATH_MOD_SPELL_ID,
  WARRIORS_WRATH_SPELL_ID,
  WOLFSHEAD_HELM_ENERGY_AMOUNT,
  WOLFSHEAD_HELM_ENERGY_SPELL_ID,
  WOLFSHEAD_HELM_ENERGY_TRIGGER_SPELL_ID,
  curseOfTheEyeTransformSpellId,
  knockAwayScriptThreatPct,
  engineeringCompanionSummonSpellId,
  giftOfLifeBasepoints,
  gnomishTransporterOutcomeSpellId,
  transporterArrivalOutcomeSpellId,
  pickBendingShinboneOutcome,
  pickCookedDeviateOutcome,
  pickDeviateFishOutcome,
  pickGoblinBombOutcome,
  pickMindControlCapOutcome,
  pickNetOMaticOutcome,
  pickNoggenfoggerOutcome,
  pickShrinkRayOutcome,
  pickSixDemonBagOutcome,
  pickTestFetidSkullOutcome,
  pickUniversalRemoteOutcome,
  shadowFlameAppliesDot,
} from '../../../cmangos-special-cases.ts';
import {
  AXE_FLURRY_DAMAGE_SPELL_ID,
  AXE_FLURRY_SPELL_ID,
  BRITTLE_ARMOR_PEEL_SPELL_ID,
  BRITTLE_ARMOR_STACK_SPELL_ID,
  DRAIN_MANA_MOAM_SPELL_ID,
  DRAIN_MANA_MOAM_TRIGGER_SPELL_ID,
  HALLOWS_END_CANDY_SPELL_ID,
  HALLOWS_END_TRICK_SPELL_ID,
  POISONOUS_BLOOD_CLOUD_SPELL_ID,
  POISONOUS_BLOOD_SPELL_ID,
  STINGER_CHARGE_MARK_AURA_SPELL_ID,
  STINGER_CHARGE_PRIMER_SPELL_ID,
  pickHallowsEndCandyOutcome,
  pickHallowsEndTrickOutcome,
  stingerChargePrimerSpellId,
  RANDOM_COSTUME_SPELL_ID,
  REINDEER_TRANSFORMATION_SPELL_ID,
  reindeerTransformSpellId,
} from '../../../cmangos-special-cases-s18.ts';
import {
  blackQirajiMountSpellId,
  DRAIN_MANA_ERADICATOR_SPELL_ID,
  DRAIN_MANA_ERADICATOR_TRIGGER_SPELL_ID,
  DRAIN_MANA_NULLIFIER_SPELL_ID,
  DRAIN_MANA_NULLIFIER_TRIGGER_SPELL_ID,
  MERCURIAL_SHIELD_PEEL_SPELL_ID,
  MERCURIAL_SHIELD_STACK_SPELL_ID,
  ELUNES_CANDLE_SPELL_ID,
  elunesCandleSpellId,
  STINGER_CHARGE_MARK_26078_AURA_SPELL_ID,
  STINGER_CHARGE_PRIMER_26080_SPELL_ID,
  stingerChargePrimer26080SpellId,
  SUMMON_BLACK_QIRAJI_BATTLE_TANK_SPELL_ID,
} from '../../../cmangos-special-cases-s19.ts';
import {
  BONE_MAGE_SUMMON_SPELL_IDS,
  BONE_MINION_SUMMON_SPELL_IDS,

  FORGIVENESS_SPELL_ID,
  FORGIVENESS_PERMANENT_FEIGN_DEATH_SPELL_ID,
  CALL_OF_THE_ASHBRINGER_SPELL_ID,

  INITIALIZE_TANK_SPELL_ID,
  LAND_MINE_DETONATION_SPELL_ID,
  LAND_MINE_PERIODIC_SPELL_ID,
  LAND_MINE_TRIGGER_SPELL_ID,
  RC_TANK_CONTROL_SPELL_ID,
  STEAM_TANK_PASSIVE_SPELL_ID,
  SUMMON_BONE_MAGES_SPELL_ID,
  SUMMON_BONE_MINIONS_SPELL_ID,
} from '../../../cmangos-special-cases-s20.ts';
import {
  ELEMENTAL_SHIELD_DUMMY_SPELL_ID,
  ELEMENTAL_SHIELD_PAYLOAD_SPELL_IDS,
  pickElementalShieldSpellId,
} from '../../../cmangos-special-cases-s23.ts';

// ── Spell ids ───────────────────────────────────────────────────────────────

// Create Healthstone ranks. CMaNGOS switches on spell id → item row. Cite: Warlock.cpp:161–172; scriptdev2
// spell.sql.
export const CREATE_HEALTHSTONE_SPELL_IDS = [6201, 6202, 5699, 11729, 11730] as const;

/** Improved Healthstone talent auras. Cite: Warlock.cpp:140–149. */
export const IMPROVED_HEALTHSTONE_RANK1_SPELL_ID = 18692;
export const IMPROVED_HEALTHSTONE_RANK2_SPELL_ID = 18693;

/** Transformation 7671 → CastSpell(24085) on unitTarget. Cite: SpellEffects.cpp:362-368 case 7671. */
export const TRANSFORMATION_SPELL_ID = 7671;
export const TRANSFORM_VISUAL_SPELL_ID = 24085;

// Burning Spirit dummy 13489 — unitTarget casts 14744 on self. Cite: SpellEffects.cpp:497-502 case 13489.
export const BURNING_SPIRIT_DUMMY_SPELL_ID = 13489;
export const BURNING_SPIRIT_BUFF_SPELL_ID = 14744;

// Soul Link cast (dummy). Pet aura 25228 via spell_pet_auras. Cite: mangos.sql spell_pet_auras
// (19028,0,25228); Warlock.cpp SoulLink on 25228.
export const SOUL_LINK_SPELL_ID = 19028;
/** Soul Link pet split / damage-pct holder. Cite: scriptdev2 spell.sql (25228,'spell_soul_link'). */
export const SOUL_LINK_PET_AURA_SPELL_ID = 25228;

/** Tame Beast dummy finish. Cite: Hunter.cpp TameBeastDummy; scriptdev2 spell.sql 13535. */
export const TAME_BEAST_DUMMY_SPELL_ID = 13535;
/** Tame Beast final apply. Cite: Hunter.cpp:38 CastSpell(…, 13481, …). */
export const TAME_BEAST_FINAL_SPELL_ID = 13481;

// Touch of Weakness intermediate dummy (single id — CMaNGOS case 28598). Apply-rank → payload rewrite also
// lives in proc.ts (play-surface path). Cite: SpellEffects.cpp:1340 case 28598.
export const TOUCH_OF_WEAKNESS_TRIGGER_SPELL_ID = TOUCH_OF_WEAKNESS_INTERMEDIATE_SPELL_ID;

// Shadowguard intermediate dummy (single id — scriptdev2 spell_shadowguard). Apply-rank → payload rewrite
// also lives in proc.ts. Cite: Priest.cpp Shadowguard; scriptdev2 spell.sql 28376.
export const SHADOWGUARD_PROC_SPELL_ID = SHADOWGUARD_INTERMEDIATE_SPELL_ID;

/** Summon mounts with empty SCRIPT_EFFECT secondary. Cite: game-data raw effect 77. */
export const MOUNT_SCRIPT_SPELL_IDS = [5784, 13819, 23161, 23214] as const;

/** City teleports — real work is TELEPORT_UNITS (5); SCRIPT_EFFECT empty. */
export const TELEPORT_CITY_SCRIPT_SPELL_IDS = [3561, 3562, 3563, 3565, 3566, 3567] as const;

// Improved Fire Ward talent ranks (dummy amount for Fire Ward absorb). CMaNGOS has no EffectDummy body —
// two talent ranks only. Cite: Mage.cpp FireWardMage.
export const IMPROVED_FIRE_WARD_SPELL_IDS = [11094, 13043] as const;

/** Frost Warding talent ranks (dummy e1 amount for Frost Ward absorb). Cite: Mage.cpp FrostWardMage. */
export const FROST_WARDING_SPELL_IDS = [11189, 28332] as const;

/** Riding skill dummies. Cite: game-data 33388 / 33391. */
export const RIDING_APPRENTICE_SPELL_ID = 33388;
export const RIDING_JOURNEYMAN_SPELL_ID = 33391;

/** zzOLD / unused junk — explicit no-op. Cite: game-data names; no EffectDummy body. */
export const ZZOLD_DUMMY_SPELL_IDS = [966, 2866, 2894, 2895] as const;

// ── Healthstone item table ────────────────────────────────────────────────── Cite: Warlock.cpp:152–172
// itypes[5][3] + switch on spell id. Rows: Minor / Lesser / Healthstone / Greater / Major × rank 0/1/2.

const HEALTHSTONE_ITEM_TYPES: ReadonlyArray<readonly [number, number, number]> = [
  [5512, 19004, 19005], // Minor — spell 6201
  [5511, 19006, 19007], // Lesser — spell 6202
  [5509, 19008, 19009], // Healthstone — spell 5699
  [5510, 19010, 19011], // Greater — spell 11729
  [9421, 19012, 19013], // Major — spell 11730
];

const HEALTHSTONE_SPELL_ROW: Readonly<Record<number, number>> = {
  6201: 0,
  6202: 1,
  5699: 2,
  11729: 3,
  11730: 4,
};

// Resolve healthstone item id from cast spell + Improved Healthstone rank. Cite: Warlock.cpp:130–174
// GetUsableHealthStoneItemType.
export function healthstoneItemType(spellId: number, rank: 0 | 1 | 2 = 0): number {
  const row = HEALTHSTONE_SPELL_ROW[spellId | 0];
  if (row == null) return 0;
  const r = rank === 1 || rank === 2 ? rank : 0;
  return HEALTHSTONE_ITEM_TYPES[row][r] | 0;
}

// The Improved Healthstone rank from spent talent points. The C++ scans for its two dummy auras, and
// the same ranks are stored on the character's talents here. Cite: Warlock.cpp:137-149.
export function improvedHealthstoneRankFromTalents(
  spent: Readonly<Record<number, number>> | undefined | null,
  talentLookup: (id: number) => { ranks?: ReadonlyArray<{ spellId?: number }> } | undefined | null,
  knownAuraSpellIds?: ReadonlyArray<number> | null,
): 0 | 1 | 2 {
  // Prefer live auras (matches C++ GetAurasByType order: 18693 checked after 18692 with break).
  if (knownAuraSpellIds?.length) {
    if (knownAuraSpellIds.includes(IMPROVED_HEALTHSTONE_RANK2_SPELL_ID)) return 2;
    if (knownAuraSpellIds.includes(IMPROVED_HEALTHSTONE_RANK1_SPELL_ID)) return 1;
  }
  if (!spent) return 0;
  for (const [tidStr, rankRaw] of Object.entries(spent)) {
    const tal = talentLookup(Number(tidStr));
    if (!tal?.ranks?.length) continue;
    const isImprovedHs = tal.ranks.some(
      (r) =>
        ((r.spellId ?? 0) | 0) === IMPROVED_HEALTHSTONE_RANK1_SPELL_ID
        || ((r.spellId ?? 0) | 0) === IMPROVED_HEALTHSTONE_RANK2_SPELL_ID,
    );
    if (!isImprovedHs) continue;
    const rank = rankRaw | 0;
    if (rank >= 2) return 2;
    if (rank >= 1) return 1;
    return 0;
  }
  return 0;
}

// Soul Link bake surface: a 30% split on the pet aura, plus 3% damage for self and pet from the
// scripted talent row, over a 30 minute toggle window. Cite: game-data 19028; Unit.cpp absorb split.

const SOUL_LINK_DAMAGE_PCT = 3;
const SOUL_LINK_SPLIT_PCT = 30;
const SOUL_LINK_SCHOOL_MASK = 127;
const SOUL_LINK_DURATION_MS = 1_800_000;

// Riding mounted-speed bake surface. Cite: game-data 33388 pct 60 / 33391 pct 100; aura 32.
const RIDING_APPRENTICE_SPEED_PCT = 60;
const RIDING_JOURNEYMAN_SPEED_PCT = 100;
/** SPELL_AURA_MOD_INCREASE_MOUNTED_SPEED. Cite: SpellAuraDefines.h. */
const AURA_MOD_INCREASE_MOUNTED_SPEED = 32;

// ── Handlers ────────────────────────────────────────────────────────────────

// Create Healthstone picks the item type by Improved Healthstone rank and creates it. The default rank
// matches the baked conjure item ids. Cite: Warlock.cpp:119-174.
const handleCreateHealthstone: RegistryHandler = (state, _raw, _slot) => {
  const spellId = state.spell.id | 0;
  const rank = (state.ctx.improvedHealthstoneRank ?? 0) as 0 | 1 | 2;
  const item = healthstoneItemType(spellId, rank);
  if (!item) return true; // unknown rank/spell — handled empty
  // DoCreateItem count = max(1, amount); SCRIPT_EFFECT amount 0 → 1.
  // Cite: SpellEffects.cpp DoCreateItem :1974–1975; Warlock.cpp:127 DoCreateItem.
  state.effects.push({ kind: 'conjure', item, count: 1 });
  return true;
};

// Soul Link's dummy has no per-id body: the work is the pet aura and its own script. Below: Burning
// Spirit casts its buff on the target, and the parent also kills the spirit itself.

/** Transformation 7671 → CastSpell(24085) on unitTarget. Cite: SpellEffects.cpp EffectDummy case 7671. */
const handleTransformation: RegistryHandler = (state, _raw, _slot) => {
  state.intents.push({ kind: 'cast_triggered_spell', spellId: TRANSFORM_VISUAL_SPELL_ID });
  state.effects.push({ kind: 'trigger_spell', spellId: TRANSFORM_VISUAL_SPELL_ID });
  return true;
};

const handleBurningSpiritDummy: RegistryHandler = (state, _raw, _slot) => {
  state.intents.push({ kind: 'cast_triggered_spell', spellId: BURNING_SPIRIT_BUFF_SPELL_ID });
  // Push effects even when INSTAKILL already filled effects[] (finalizeInterpret
  // only promotes intents when effects are empty).
  state.effects.push({ kind: 'trigger_spell', spellId: BURNING_SPIRIT_BUFF_SPELL_ID });
  return true;
};

const handleSoulLink: RegistryHandler = (state, _raw, _slot) => {
  state.effects.push({
    kind: 'buff',
    mod: 'damage_done_pct',
    amount: SOUL_LINK_DAMAGE_PCT,
    durationMs: SOUL_LINK_DURATION_MS,
    applyTo: 'self',
  });
  state.effects.push({
    kind: 'buff',
    mod: 'damage_done_pct',
    amount: SOUL_LINK_DAMAGE_PCT,
    durationMs: SOUL_LINK_DURATION_MS,
    applyTo: 'pet',
  });
  state.effects.push({
    kind: 'split_damage',
    pct: SOUL_LINK_SPLIT_PCT,
    schoolMask: SOUL_LINK_SCHOOL_MASK,
    durationMs: SOUL_LINK_DURATION_MS,
  });
  // spell_pet_auras applies 25228 to pet when owner has 19028.
  // Cite: mangos.sql:13629 (19028,0,25228).
  state.intents.push({ kind: 'cast_spell', spellId: SOUL_LINK_PET_AURA_SPELL_ID });
  return true;
};

// The Tame Beast dummy casts the tame on the channel's unit target.
// Cite: Hunter.cpp:33-40.
const handleTameBeastDummy: RegistryHandler = (state, _raw, _slot) => {
  if (state.ctx.channelObjectIsUnit) {
    state.intents.push({ kind: 'cast_spell', spellId: TAME_BEAST_FINAL_SPELL_ID });
  } else {
    // Standalone interpret (no channel) still "handles" the intermediate.
    state.effects.push({ kind: 'script_handled_noop', spellId: TAME_BEAST_DUMMY_SPELL_ID } as never);
  }
  return true;
};

// The Touch of Weakness intermediate dummy, the runtime path when the trigger was not already
// rewritten: it switches on the triggering rank and casts the debuff. Cite: SpellEffects.cpp:1340.
const handleTouchOfWeaknessTrigger: RegistryHandler = (state, _raw, _slot) => {
  const byAura = state.ctx.triggeredByAuraSpellId;
  if (byAura == null) {
    // Standalone: intermediate is empty without a triggering aura rank.
    state.effects.push({ kind: 'script_handled_noop', spellId: TOUCH_OF_WEAKNESS_TRIGGER_SPELL_ID } as never);
    return true;
  }
  const spellId = TOUCH_OF_WEAKNESS_TRIGGER[byAura];
  if (spellId) {
    state.intents.push({ kind: 'cast_spell', spellId });
  }
  return true;
};

// The Shadowguard intermediate dummy, the runtime path when the trigger was not already rewritten:
// it switches on the triggering rank and casts the damage. Cite: Priest.cpp:56-77.
const handleShadowguard: RegistryHandler = (state, _raw, _slot) => {
  const byAura = state.ctx.triggeredByAuraSpellId;
  if (byAura == null) {
    state.effects.push({ kind: 'script_handled_noop', spellId: SHADOWGUARD_INTERMEDIATE_SPELL_ID } as never);
    return true;
  }
  const spellId = SHADOWGUARD_TRIGGER[byAura];
  if (spellId) {
    state.intents.push({ kind: 'cast_spell', spellId });
  }
  return true;
};

// The mount script secondary has no switch body — the mount is its aura slots — so this is an honest
// handled no-op, which keeps the opcode from reading as unhandled.
const handleMountScriptNoop: RegistryHandler = (_state, _raw, _slot) => true;

// The city teleport script secondary is empty; the real teleport is its own effect.
// Cite: SpellEffects.cpp:1683 EffectTeleportUnits; mangos.sql spell_target_position.
const handleTeleportCityScriptNoop: RegistryHandler = (_state, _raw, _slot) => true;

// The Improved Fire Ward and Frost Warding talent dummies have no body: the absorb bonus is applied
// later when the ward calculates. A handled no-op, with the amount left on the row for that consumer.
const handleWardTalentDummy: RegistryHandler = (_state, _raw, _slot) => true;

// The riding skill dummies are empty and the skill step is its own effect, while the bake stamps the
// mounted-speed surface. Re-emitted here for the oracle. Cite: game-data 33388 and 33391.
const handleRidingDummy: RegistryHandler = (state, _raw, _slot) => {
  const id = state.spell.id | 0;
  const pct =
    id === RIDING_JOURNEYMAN_SPELL_ID
      ? RIDING_JOURNEYMAN_SPEED_PCT
      : RIDING_APPRENTICE_SPEED_PCT;
  state.effects.push({
    kind: 'speed',
    aura: AURA_MOD_INCREASE_MOUNTED_SPEED,
    pct,
    durationMs: 0,
    hostile: false,
  });
  return true;
};

// zzOLD / unused DUMMY or SCRIPT_EFFECT — explicit handled no-op. Cite: game-data zzOLD* rows;
// SpellEffects.cpp EffectDummy fallthrough / no case.
const handleZzOldNoop: RegistryHandler = (_state, _raw, _slot) => true;

/** Deterministic [0,1) from interpret ctx.rng, else 0 (first table row). */
function roll01(state: { ctx: { rng?: (() => number) | { next?: () => number } } }): number {
  const r = state.ctx.rng;
  if (typeof r === 'function') return r();
  if (r && typeof r.next === 'function') return r.next();
  return 0;
}

/** Deviate Fish 8063 → random one of 8064–8068. Cite: SpellEffects.cpp:369–377. */
const handleDeviateFish: RegistryHandler = (state, _raw, _slot) => {
  const spellId = pickDeviateFishOutcome(roll01(state));
  state.intents.push({ kind: 'cast_triggered_spell', spellId });
  return true;
};

/** Cooked Deviate Fish 8213 → ninja/pirate morph by gender. Cite: SpellEffects.cpp:380–386. */
const handleCookedDeviate: RegistryHandler = (state, _raw, _slot) => {
  // Gender defaults male when ctx omits it (bake-thin / tests). Cite: getGender GENDER_MALE=0.
  const male = state.ctx.casterGender !== 1;
  const spellId = pickCookedDeviateOutcome(roll01(state), male);
  state.intents.push({ kind: 'cast_triggered_spell', spellId });
  return true;
};

function pickRandomCostumeOutcome(roll: number, male: boolean): number {
  switch (roll) {
    case 0: return male ? 24708 : 24709;
    case 1: return male ? 24711 : 24710;
    case 2: return male ? 24712 : 24713;
    case 3: return 24723;
    case 4: return 24732;
    case 5: return male ? 24735 : 24736;
    case 6: return 24740;
    default: return 24723; // Fallback
  }
}

/** Random Costume 24720 → urand(0,6) table. Cite: SpellEffects.cpp:3865–3898. */
const handleRandomCostume: RegistryHandler = (state, _raw, _slot) => {
  if (state.ctx.unitTargetIsPlayer === false) return true;

  const roll = state.ctx.rng ? Math.floor(state.ctx.rng() * 7) : 0;
  // Gender defaults male when ctx omits it (bake-thin / tests). Cite: getGender GENDER_MALE=0.
  const male = state.ctx.unitTargetGender !== 1;
  const spellId = pickRandomCostumeOutcome(roll, male);
  state.intents.push({ kind: 'cast_triggered_spell', spellId });
  return true;
};

/** Universal Remote 8344 → random 8345/8346/8347 on unitTarget. Cite: SpellEffects.cpp:389–397. */
const handleUniversalRemote: RegistryHandler = (state, _raw, _slot) => {
  const spellId = pickUniversalRemoteOutcome(roll01(state));
  state.intents.push({ kind: 'cast_triggered_spell', spellId });
  return true;
};

/** Curse of the Eye dummy 3360 → gender transform 10651/10653. Cite: SpellEffects.cpp:355–360. */
const handleCurseOfTheEyeDummy: RegistryHandler = (state, _raw, _slot) => {
  // Default male transform when target gender omitted. Cite: SpellEffects.cpp:358 GENDER_MALE.
  const male = state.ctx.unitTargetGender !== 1;
  const spellId = curseOfTheEyeTransformSpellId(male);
  state.intents.push({ kind: 'cast_triggered_spell', spellId });
  return true;
};

// Polly Eats the E.C.A.C. 9976 → CastSpell(9998) + ForcedDespawn(100). ForcedDespawn is world despawn (not
// a combat effect); intent is the summon payload. Cite: SpellEffects.cpp:419–426.
const handlePollyEatsEcac: RegistryHandler = (state, _raw, _slot) => {
  state.intents.push({ kind: 'cast_triggered_spell', spellId: POLLY_JR_SPELL_ID });
  return true;
};

/** Six Demon Bag 14537 — roll table includes Frostbolt 11538. Cite: SpellEffects.cpp:522–541. */
const handleSixDemonBag: RegistryHandler = (state, _raw, _slot) => {
  const roll = state.ctx.rng ? Math.floor(state.ctx.rng() * 100) : 0;
  const { spellId } = pickSixDemonBagOutcome(roll);
  state.intents.push({ kind: 'cast_triggered_spell', spellId });
  return true;
};

// Bending Shinbone 8856 SCRIPT_EFFECT: urand(1,5) → 8854 (1) else 8855. Cite: SpellEffects.cpp:3680–3694.
const handleBendingShinbone: RegistryHandler = (state, _raw, _slot) => {
  const roll15 = state.ctx.rng ? 1 + Math.floor(state.ctx.rng() * 5) : 2;
  const spellId = pickBendingShinboneOutcome(roll15);
  state.intents.push({ kind: 'cast_triggered_spell', spellId });
  return true;
};

/** Gnomish Shrink Ray 13006 — roll table of grow/shrink outcomes. Cite: SpellEffects.cpp:447–467. */
const handleShrinkRay: RegistryHandler = (state, _raw, _slot) => {
  const roll = state.ctx.rng ? Math.floor(state.ctx.rng() * 100) : 50;
  const { spellId } = pickShrinkRayOutcome(roll);
  state.intents.push({ kind: 'cast_triggered_spell', spellId });
  return true;
};

/** Net-o-Matic 13120 — 2% self root / 2% charge root / else normal root. Cite: SpellEffects.cpp:469–482. */
const handleNetOMatic: RegistryHandler = (state, _raw, _slot) => {
  const roll = state.ctx.rng ? Math.floor(state.ctx.rng() * 100) : 50;
  const spellId = pickNetOMaticOutcome(roll);
  state.intents.push({ kind: 'cast_triggered_spell', spellId });
  return true;
};

// Gnomish Mind Control Cap 13180 — urand(0,9); reverse on player when roll==1. Cite:
// SpellEffects.cpp:484–495.
const handleMindControlCap: RegistryHandler = (state, _raw, _slot) => {
  const roll = state.ctx.rng ? Math.floor(state.ctx.rng() * 10) : 2;
  // Target type unknown at interpret time — treat as player for reverse chance path.
  const outcome = pickMindControlCapOutcome(roll, true);
  if (outcome) {
    state.intents.push({
      kind: outcome.reverse ? 'trigger_spell_as_unit_target' : 'cast_triggered_spell',
      spellId: outcome.spellId,
    });
  }
  return true;
};

// Voodoo 17009 — casts random spell from list on player target. Cite: SpellEffects.cpp:616-626.
const handleVoodoo: RegistryHandler = (state, _raw, _slot) => {
  if (state.ctx.unitTargetIsPlayer !== false) {
    const spellId = pickVoodooOutcome(roll01(state));
    state.intents.push({ kind: 'cast_triggered_spell', spellId });
  }
  return true;
};

// Noggenfogger Elixir 16589 — equal pick of 16595/16593/16591. Also stamps trigger_spell so
// resolveCombatSpell / OOC consume see a non-empty effects[]. Cite: SpellEffects.cpp:606–614; KI-592.
const handleNoggenfogger: RegistryHandler = (state, _raw, _slot) => {
  const spellId = pickNoggenfoggerOutcome(roll01(state));
  state.intents.push({ kind: 'cast_triggered_spell', spellId });
  state.effects.push({ kind: 'trigger_spell', spellId });
  return true;
};

// Shadow Portal 17950 — uniform roll of 6 portal spells. Cite: SpellEffects.cpp:667-676.
const handleShadowPortalDummy: RegistryHandler = (state, _raw, _slot) => {
  const spellId = pickShadowPortalOutcome(roll01(state));
  state.intents.push({ kind: 'cast_triggered_spell', spellId });
  state.effects.push({ kind: 'trigger_spell', spellId });
  return true;
};

/** Test Fetid Skull 17271 — 50/50 create item 17269/17270. Cite: SpellEffects.cpp:642–648. */
const handleTestFetidSkull: RegistryHandler = (state, _raw, _slot) => {
  const spellId = pickTestFetidSkullOutcome(roll01(state));
  state.intents.push({ kind: 'cast_triggered_spell', spellId });
  return true;
};

// Wolfshead Helm Energy 17770 — CastSpell(29940) energize 20 energy. Cite: SpellEffects.cpp:661–665;
// spell_template 29940 bp19 → 20.
const handleWolfsheadHelmEnergy: RegistryHandler = (state, _raw, _slot) => {
  state.intents.push({
    kind: 'cast_triggered_spell',
    spellId: WOLFSHEAD_HELM_ENERGY_TRIGGER_SPELL_ID,
  });
  // The play surface is an instant energy restore, since this is an energize and not a periodic, so it
  // is modelled as a one-tick restore to keep the effect list non-empty at resolve.
  state.effects.push({
    kind: 'restore_power',
    amountPerTick: WOLFSHEAD_HELM_ENERGY_AMOUNT,
    powerType: POWER_ENERGY,
    tickMs: 0,
    durationMs: 0,
  });
  return true;
};

// Knock Away SCRIPT_EFFECT family — modifyThreatPercent on unitTarget. Cite: SpellEffects.cpp:3695–3727
// case 10101/18813/18945/….
const handleKnockAwayScriptThreat: RegistryHandler = (state, _raw, _slot) => {
  const pct = knockAwayScriptThreatPct(state.spell.id | 0);
  if (pct == null) return true;
  state.effects.push({ kind: 'modify_threat_pct', pct });
  return true;
};

/** Lava Bomb 19411 — unitTarget casts 20494 (Summon Lava Bomb 1). Cite: SpellEffects.cpp:737–742. */
const handleLavaBomb: RegistryHandler = (state, _raw, _slot) => {
  state.intents.push({ kind: 'cast_triggered_spell', spellId: LAVA_BOMB_SUMMON_SPELL_ID });
  // Play surface: trigger_spell so applySpell can fire when 20494 is in kit.
  state.effects.push({ kind: 'trigger_spell', spellId: LAVA_BOMB_SUMMON_SPELL_ID });
  return true;
};

/** Lava Bomb 20474 → 20495. Cite: SpellEffects.cpp:753–757. */
const handleLavaBomb2: RegistryHandler = (state, _raw, _slot) => {
  state.intents.push({ kind: 'cast_triggered_spell', spellId: LAVA_BOMB_SUMMON_2_SPELL_ID });
  state.effects.push({ kind: 'trigger_spell', spellId: LAVA_BOMB_SUMMON_2_SPELL_ID });
  return true;
};

// Elemental Shield 22276: strip 22277-22281, then self-cast one. Cite: SpellEffects.cpp:819-829. Consume
// effects must precede trigger_spell or applySpell peels the shield it just applied.
const handleElementalShield: RegistryHandler = (state, _raw, _slot) => {
  const picked = pickElementalShieldSpellId(roll01(state));
  // C++ RemoveAurasDueToSpell loop then CastSpell. Cite: SpellEffects.cpp:824-827.
  for (const id of ELEMENTAL_SHIELD_PAYLOAD_SPELL_IDS) {
    state.intents.push({
      kind: 'consume_aura',
      spellId: id,
      spellFamilyName: 0,
      spellFamilyFlags: 0,
      auraType: 0,
    });
    state.effects.push({
      kind: 'consume_aura',
      spellId: id,
      spellFamilyName: 0,
      spellFamilyFlags: 0,
      auraType: 0,
    });
  }
  state.intents.push({ kind: 'cast_triggered_spell', spellId: picked });
  state.effects.push({ kind: 'trigger_spell', spellId: picked });
  return true;
};

// Warrior's Wrath 21977 — CastSpell(21887) spellmod on unitTarget. Cite: SpellEffects.cpp:1319–1324;
// ClassicDB 21887 aura 107 bp-51 → −50, DurIndex 1 → 10s.
const handleWarriorsWrath: RegistryHandler = (state, _raw, _slot) => {
  state.intents.push({ kind: 'cast_triggered_spell', spellId: WARRIORS_WRATH_MOD_SPELL_ID });
  // Play surface: SPELL_AURA_ADD_FLAT_MODIFIER all-effects −50 for 10s (next_cast_mod shape).
  // Cite: SpellEffects.cpp:1322; spell_template 21887; schema next_cast_mod effectPct.
  state.effects.push({
    kind: 'next_cast_mod',
    appliesTo: 'any',
    effectPct: WARRIORS_WRATH_MOD_AMOUNT,
    durationMs: WARRIORS_WRATH_MOD_DURATION_MS,
  });
  return true;
};

// Shadow Flame 22539 SCRIPT_EFFECT — CastSpell(22682) unless Onyxia Scale Cloak 22683. Cite:
// SpellEffects.cpp:3738–3761.
const handleShadowFlameScript: RegistryHandler = (state, _raw, _slot) => {
  // GetDummyAura(22683) on unitTarget. Cite: SpellEffects.cpp:3756–3757.
  const auras = state.ctx.targetAuras ?? [];
  const hasCloak = auras.some((a) => (a.spellId | 0) === ONYXIA_SCALE_CLOAK_SPELL_ID);
  if (!shadowFlameAppliesDot(hasCloak)) return true;
  state.intents.push({ kind: 'cast_triggered_spell', spellId: SHADOW_FLAME_DOT_SPELL_ID });
  // Sourced DoT payload (22682 absent from live bake). Cite: ClassicDB 22682.
  state.effects.push({
    kind: 'dot',
    school: 'shadow',
    min: SHADOW_FLAME_DOT_AMOUNT,
    max: SHADOW_FLAME_DOT_AMOUNT,
    tickMs: SHADOW_FLAME_DOT_TICK_MS,
    durationMs: SHADOW_FLAME_DOT_DURATION_MS,
  });
  return true;
};

// Engineering dragonling / battle chicken dummies → summon companion spell. Cite: SpellEffects.cpp:882–908
// (requires CastItem on C++; item path always here).
const handleEngineeringCompanionDummy: RegistryHandler = (state, _raw, _slot) => {
  const summonId = engineeringCompanionSummonSpellId(state.spell.id | 0);
  if (!summonId) return true;
  state.intents.push({ kind: 'cast_triggered_spell', spellId: summonId });
  state.effects.push({ kind: 'trigger_spell', spellId: summonId });
  return true;
};

const handleGoblinBomb: RegistryHandler = (state, _raw, _slot) => {
  const roll = state.ctx.rng ? Math.floor(state.ctx.rng() * 100) : 50;
  // Goblin Bomb requires a target to malfunction upon. Without one, target defaults to player as unit?
  // C++: target->CastSpell(caster, ...) vs caster->CastSpell(caster, ...).
  const outcome = pickGoblinBombOutcome(roll);
  state.intents.push({
    kind: outcome.reverse ? 'trigger_spell_as_unit_target' : 'cast_triggered_spell',
    spellId: outcome.spellId,
  });
  return true;
};

// Gnomish Transporter 23453 — urand(0,5) ? 23441 success : 23446 fail. Cite: SpellEffects.cpp:1041–1046.
const handleGnomishTransporter: RegistryHandler = (state, _raw, _slot) => {
  const roll = state.ctx.rng ? Math.floor(state.ctx.rng() * 6) : 1;
  const spellId = gnomishTransporterOutcomeSpellId(roll);
  state.intents.push({ kind: 'cast_triggered_spell', spellId });
  state.effects.push({ kind: 'trigger_spell', spellId });
  return true;
};

// Transporter Arrival (Gadgetzan + Everlook) 23450 — urand(0,5). 0 -> 23444, 1-2 -> 23445. Cite: SpellEffects.cpp:1031-1040.
const handleTransporterArrival: RegistryHandler = (state, _raw, _slot) => {
  const roll = state.ctx.rng ? Math.floor(state.ctx.rng() * 6) : 3;
  const spellId = transporterArrivalOutcomeSpellId(roll);
  if (spellId) {
    state.intents.push({ kind: 'cast_triggered_spell', spellId });
    state.effects.push({ kind: 'trigger_spell', spellId });
  }
  return true;
};

// Hourglass Sand 23645 — RemoveAurasDueToSpell(23170) Brood Affliction: Bronze. Lifted to effects[]
// consume_aura; applySpell peels live. Cite: SpellEffects.cpp:1048–1052.
const handleHourglassSand: RegistryHandler = (state, _raw, _slot) => {
  state.intents.push({
    kind: 'consume_aura',
    spellId: BROOD_AFFLICTION_BRONZE_SPELL_ID,
    spellFamilyName: 0,
    spellFamilyFlags: 0,
    auraType: 0,
  });
  return true;
};

// Gift of Life 23725 — basepoints = maxHealth * 0.15 → 23782 max-health + 23783 heal. Cite:
// SpellEffects.cpp:1054–1060.
const handleGiftOfLife: RegistryHandler = (state, _raw, _slot) => {
  const maxHp = state.ctx.casterMaxHealth ?? state.ctx.targetMaxHealth ?? 0;
  const bp = giftOfLifeBasepoints(maxHp);
  state.intents.push({ kind: 'cast_triggered_spell', spellId: GIFT_OF_LIFE_MAX_HEALTH_SPELL_ID });
  state.intents.push({ kind: 'cast_triggered_spell', spellId: GIFT_OF_LIFE_HEAL_SPELL_ID });
  // Play surface when companions absent: flat heal + max_health buff for 20s.
  // Cite: ClassicDB 23782 aura 34 DurIndex 18 → 20s; 23783 HEAL with custom bp.
  if (bp > 0) {
    state.effects.push({
      kind: 'buff',
      mod: 'max_health',
      amount: bp,
      durationMs: GIFT_OF_LIFE_MAX_HEALTH_DURATION_MS,
      applyTo: 'self',
    });
    state.effects.push({
      kind: 'heal',
      min: bp,
      max: bp,
    });
  }
  return true;
};

// Axe Flurry 24019 — CastSpell(24020) when LOS (LOS always true in session). Cite:
// SpellEffects.cpp:1080–1085.
const handleAxeFlurry: RegistryHandler = (state, _raw, _slot) => {
  state.intents.push({ kind: 'cast_triggered_spell', spellId: AXE_FLURRY_DAMAGE_SPELL_ID });
  state.effects.push({ kind: 'trigger_spell', spellId: AXE_FLURRY_DAMAGE_SPELL_ID });
  return true;
};

/** Stinger Charge Primer 24150 — HasAura(25187) ? 25191 : 25190. Cite: SpellEffects.cpp:1087–1094. */
const handleStingerChargePrimer: RegistryHandler = (state, _raw, _slot) => {
  const auras = state.ctx.targetAuras ?? [];
  const hasMark = auras.some((a) => (a.spellId | 0) === STINGER_CHARGE_MARK_AURA_SPELL_ID);
  const spellId = stingerChargePrimerSpellId(hasMark);
  state.intents.push({ kind: 'cast_triggered_spell', spellId });
  state.effects.push({ kind: 'trigger_spell', spellId });
  return true;
};

/** Stinger Charge Primer 26080 — HasAura(26078) ? 26082 : 26081. Cite: SpellEffects.cpp:1133–1139. */
const handleStingerChargePrimer26080: RegistryHandler = (state, _raw, _slot) => {
  const auras = state.ctx.targetAuras ?? [];
  const hasMark = auras.some((a) => (a.spellId | 0) === STINGER_CHARGE_MARK_26078_AURA_SPELL_ID);
  const spellId = stingerChargePrimer26080SpellId(hasMark);
  state.intents.push({ kind: 'cast_triggered_spell', spellId });
  state.effects.push({ kind: 'trigger_spell', spellId });
  return true;
};

/** Poisonous Blood 24320 → CastSpell(24321) on unitTarget. Cite: SpellEffects.cpp:3804–3807. */
const handlePoisonousBlood: RegistryHandler = (state, _raw, _slot) => {
  state.intents.push({ kind: 'cast_triggered_spell', spellId: POISONOUS_BLOOD_CLOUD_SPELL_ID });
  state.effects.push({ kind: 'trigger_spell', spellId: POISONOUS_BLOOD_CLOUD_SPELL_ID });
  return true;
};

// Brittle Armor 24590 — peel one stack of 24575 (applySpell also peels live). Cite:
// SpellEffects.cpp:3809–3810 RemoveAuraHolderFromStack(24575).
const handleBrittleArmorPeel: RegistryHandler = (state, _raw, _slot) => {
  state.intents.push({
    kind: 'consume_aura',
    spellId: BRITTLE_ARMOR_STACK_SPELL_ID,
    spellFamilyName: 0,
    spellFamilyFlags: 0,
    auraType: 0,
    stacks: 1,
  });
  return true;
};

/** Hallow's End Trick dummy — urand of 13 morphs. Cite: SpellEffects.cpp:3812–3836 case 24714. */
const handleHallowsEndTrick: RegistryHandler = (state, _raw, _slot) => {
  if (state.ctx.casterIsPlayer === false) return true;
  const spellId = pickHallowsEndTrickOutcome(roll01(state));
  state.intents.push({ kind: 'cast_triggered_spell', spellId });
  state.effects.push({ kind: 'trigger_spell', spellId });
  return true;
};

/** Hallow's End Candy 24930 — equal pick of 24924–24927. Cite: SpellEffects.cpp:1176–1181. */
const handleHallowsEndCandy: RegistryHandler = (state, _raw, _slot) => {
  const spellId = pickHallowsEndCandyOutcome(roll01(state));
  state.intents.push({ kind: 'cast_triggered_spell', spellId });
  state.effects.push({ kind: 'trigger_spell', spellId });
  return true;
};


const handleReindeerTransformation: RegistryHandler = (state, _raw, _slot) => {
  const auras = state.ctx.casterAuras ?? [];
  const isMounted = auras.some((a) => (a.auraType | 0) === SPELL_AURA_MOUNTED);
  if (isMounted) {
    const runSpeed = state.ctx.casterRunSpeedRate ?? 1.0;
    const spellId = reindeerTransformSpellId(runSpeed);
    state.intents.push({
      kind: 'consume_aura',
      spellFamilyName: 0,
      spellFamilyFlags: 0,
      auraType: SPELL_AURA_MOUNTED
    });
    state.intents.push({ kind: 'cast_triggered_spell', spellId });
    state.effects.push({ kind: 'trigger_spell', spellId });
  }
  return true;
};

// Drain Mana (Moam) 25676 — CastSpell(25671) on unitTarget. Mana-power gate is refuseCmangosCheckCast.
// Cite: SpellEffects.cpp:3951–3955.
const handleDrainManaMoam: RegistryHandler = (state, _raw, _slot) => {
  state.intents.push({ kind: 'cast_triggered_spell', spellId: DRAIN_MANA_MOAM_TRIGGER_SPELL_ID });
  state.effects.push({ kind: 'trigger_spell', spellId: DRAIN_MANA_MOAM_TRIGGER_SPELL_ID });
  return true;
};

/** Drain Mana Obsidian Eradicator 26457 → 25755. Cite: SpellEffects.cpp:3957–3961. */
const handleDrainManaEradicator: RegistryHandler = (state, _raw, _slot) => {
  state.intents.push({ kind: 'cast_triggered_spell', spellId: DRAIN_MANA_ERADICATOR_TRIGGER_SPELL_ID });
  state.effects.push({ kind: 'trigger_spell', spellId: DRAIN_MANA_ERADICATOR_TRIGGER_SPELL_ID });
  return true;
};

/** Drain Mana Obsidian Nullifier 26559 → 25671. Cite: SpellEffects.cpp:3951–3955. */
const handleDrainManaNullifier: RegistryHandler = (state, _raw, _slot) => {
  state.intents.push({ kind: 'cast_triggered_spell', spellId: DRAIN_MANA_NULLIFIER_TRIGGER_SPELL_ID });
  state.effects.push({ kind: 'trigger_spell', spellId: DRAIN_MANA_NULLIFIER_TRIGGER_SPELL_ID });
  return true;
};

// Mercurial Shield 26465 — peel one stack of 26464. Cite: SpellEffects.cpp:3989–3991
// RemoveAuraHolderFromStack(26464).
const handleMercurialShieldPeel: RegistryHandler = (state, _raw, _slot) => {
  state.intents.push({
    kind: 'consume_aura',
    spellId: MERCURIAL_SHIELD_STACK_SPELL_ID,
    spellFamilyName: 0,
    spellFamilyFlags: 0,
    auraType: 0,
    stacks: 1,
  });
  return true;
};

// Black Qiraji Battle Tank 26656 — area 3428 → 25863 else 26655. Area from ctx.areaId when present; default
// world mount. Cite: item_scripts.cpp:248–264.
const handleBlackQirajiMount: RegistryHandler = (state, _raw, _slot) => {
  const areaId = (state.ctx as { areaId?: number }).areaId ?? 0;
  const spellId = blackQirajiMountSpellId(areaId);
  state.intents.push({ kind: 'cast_triggered_spell', spellId });
  state.effects.push({ kind: 'trigger_spell', spellId });
  return true;
};

// Summon Bone Minions 27687 — cast four minion summon scripts on unitTarget. Cite:
// SpellEffects.cpp:4110–4119.
const handleSummonBoneMinions: RegistryHandler = (state, _raw, _slot) => {
  for (const spellId of BONE_MINION_SUMMON_SPELL_IDS) {
    state.intents.push({ kind: 'cast_triggered_spell', spellId });
    state.effects.push({ kind: 'trigger_spell', spellId });
  }
  return true;
};

// Summon Bone Mages 27695 — cast four mage summon scripts on unitTarget. Cite: SpellEffects.cpp:4121–4130.
const handleSummonBoneMages: RegistryHandler = (state, _raw, _slot) => {
  for (const spellId of BONE_MAGE_SUMMON_SPELL_IDS) {
    state.intents.push({ kind: 'cast_triggered_spell', spellId });
    state.effects.push({ kind: 'trigger_spell', spellId });
  }
  return true;
};

// Initialize Tank 27749 — RC Tank Control 24936 + Steam Tank Passive 27747. Cite:
// SpellEffects.cpp:1240–1247.
const handleInitializeTank: RegistryHandler = (state, _raw, _slot) => {
  for (const spellId of [RC_TANK_CONTROL_SPELL_ID, STEAM_TANK_PASSIVE_SPELL_ID] as const) {
    state.intents.push({ kind: 'cast_triggered_spell', spellId });
    state.effects.push({ kind: 'trigger_spell', spellId });
  }
  return true;
};

// Land Mine Trigger 28000 — detonation 25099 + remove Land Mine Periodic 27999. Cite:
// SpellEffects.cpp:1230–1238.
const handleLandMineTrigger: RegistryHandler = (state, _raw, _slot) => {
  state.intents.push({ kind: 'cast_triggered_spell', spellId: LAND_MINE_DETONATION_SPELL_ID });
  state.effects.push({ kind: 'trigger_spell', spellId: LAND_MINE_DETONATION_SPELL_ID });
  // Peel the maintain aura so the mine stops re-arming. Cite: :1236 RemoveAurasDueToSpell(27999).
  state.intents.push({
    kind: 'consume_aura',
    spellId: LAND_MINE_PERIODIC_SPELL_ID,
    spellFamilyName: 0,
    spellFamilyFlags: 0,
    auraType: 0,
  });
  return true;
};

// Call of the Ashbringer 28414 — PlayDirectSound only (no combat payload). Cite:
// SpellEffects.cpp:1249–1255.
const handleCallOfTheAshbringer: RegistryHandler = (_state, _raw, _slot) => {
  // Emote/sound cosmetic — intentionally empty effects (disposition + mention).
  return true;
};

// Forgiveness 28697 — CastSpell(29266) on unitTarget. Cite:
// SpellEffects.cpp:1257-1261.
const handleForgiveness: RegistryHandler = (state, _raw, _slot) => {
  state.intents.push({ kind: 'trigger_spell_as_unit_target', spellId: FORGIVENESS_PERMANENT_FEIGN_DEATH_SPELL_ID });
  state.effects.push({ kind: 'trigger_spell', spellId: FORGIVENESS_PERMANENT_FEIGN_DEATH_SPELL_ID });
  return true;
};

const handleElunesCandle: RegistryHandler = (state) => {
  const roll = state.ctx.rng ? Math.floor(state.ctx.rng() * 5) : 0;
  // InterpretContext currently lacks a target entry field, so we default to 0.
  // This safely guarantees the fallback to ELUNES_CANDLE_DEFAULT_SPELL_ID (26636).
  const targetEntry = 0;
  const spellId = elunesCandleSpellId(targetEntry, roll);
  state.intents.push({ kind: 'cast_triggered_spell', spellId });
  return true;
};

// ── Pack maps ───────────────────────────────────────────────────────────────

const dummy: Record<number, RegistryHandler> = {
  [ELUNES_CANDLE_SPELL_ID]: handleElunesCandle,
  [TRANSFORMATION_SPELL_ID]: handleTransformation,
  [BURNING_SPIRIT_DUMMY_SPELL_ID]: handleBurningSpiritDummy,
  [SOUL_LINK_SPELL_ID]: handleSoulLink,
  [TAME_BEAST_DUMMY_SPELL_ID]: handleTameBeastDummy,
  [TOUCH_OF_WEAKNESS_TRIGGER_SPELL_ID]: handleTouchOfWeaknessTrigger,
  [SHADOWGUARD_PROC_SPELL_ID]: handleShadowguard,
  [RIDING_APPRENTICE_SPELL_ID]: handleRidingDummy,
  [RIDING_JOURNEYMAN_SPELL_ID]: handleRidingDummy,
  [DEVIATE_FISH_SPELL_ID]: handleDeviateFish,
  [COOKED_DEVIATE_FISH_SPELL_ID]: handleCookedDeviate,
  [RANDOM_COSTUME_SPELL_ID]: handleRandomCostume,
  [UNIVERSAL_REMOTE_SPELL_ID]: handleUniversalRemote,
  [CURSE_OF_THE_EYE_DUMMY_SPELL_ID]: handleCurseOfTheEyeDummy,
  [POLLY_EATS_ECAC_SPELL_ID]: handlePollyEatsEcac,
  [SIX_DEMON_BAG_SPELL_ID]: handleSixDemonBag,
  [SHRINK_RAY_SPELL_ID]: handleShrinkRay,
  [NET_O_MATIC_SPELL_ID]: handleNetOMatic,
  [GNOMISH_MIND_CONTROL_CAP_SPELL_ID]: handleMindControlCap,
  [VOODOO_SPELL_ID]: handleVoodoo,
  [NOGGENFOGGER_ELIXIR_SPELL_ID]: handleNoggenfogger,
  [SHADOW_PORTAL_SPELL_ID]: handleShadowPortalDummy,
  [TEST_FETID_SKULL_SPELL_ID]: handleTestFetidSkull,
  [WOLFSHEAD_HELM_ENERGY_SPELL_ID]: handleWolfsheadHelmEnergy,
  [LAVA_BOMB_SPELL_ID]: handleLavaBomb,
  [LAVA_BOMB_20474_SPELL_ID]: handleLavaBomb2,
  // Chromaggus school shield. Cite: SpellEffects.cpp:819-829 case 22276.
  [ELEMENTAL_SHIELD_DUMMY_SPELL_ID]: handleElementalShield,
  [WARRIORS_WRATH_SPELL_ID]: handleWarriorsWrath,
  [ARCANITE_DRAGONLING_SPELL_ID]: handleEngineeringCompanionDummy,
  [MITHRIL_MECHANICAL_DRAGONLING_SPELL_ID]: handleEngineeringCompanionDummy,
  [MECHANICAL_DRAGONLING_SPELL_ID]: handleEngineeringCompanionDummy,
  [GNOMISH_BATTLE_CHICKEN_SPELL_ID]: handleEngineeringCompanionDummy,
  [GOBLIN_BOMB_SPELL_ID]: handleGoblinBomb,
  [GNOMISH_TRANSPORTER_SPELL_ID]: handleGnomishTransporter,
  [TRANSPORTER_ARRIVAL_SPELL_ID]: handleTransporterArrival,
  [HOURGLASS_SAND_SPELL_ID]: handleHourglassSand,
  [GIFT_OF_LIFE_SPELL_ID]: handleGiftOfLife,
  [AXE_FLURRY_SPELL_ID]: handleAxeFlurry,
  [STINGER_CHARGE_PRIMER_SPELL_ID]: handleStingerChargePrimer,
  [STINGER_CHARGE_PRIMER_26080_SPELL_ID]: handleStingerChargePrimer26080,
  [HALLOWS_END_TRICK_SPELL_ID]: handleHallowsEndTrick,
  [HALLOWS_END_CANDY_SPELL_ID]: handleHallowsEndCandy,
  // Land Mine Trigger + Ashbringer are EffectDummy (3). Cite: SpellEffects.cpp:1230 / 1249.
  [LAND_MINE_TRIGGER_SPELL_ID]: handleLandMineTrigger,
  [CALL_OF_THE_ASHBRINGER_SPELL_ID]: handleCallOfTheAshbringer,
  [FORGIVENESS_SPELL_ID]: handleForgiveness,
  [REINDEER_TRANSFORMATION_SPELL_ID]: handleReindeerTransformation,
};

for (const id of IMPROVED_FIRE_WARD_SPELL_IDS) {
  dummy[id] = handleWardTalentDummy;
}
for (const id of FROST_WARDING_SPELL_IDS) {
  dummy[id] = handleWardTalentDummy;
}
// zzOLD dummies (2866/2894/2895 are effect 3; 966 is script — see script map).
for (const id of [2866, 2894, 2895] as const) {
  dummy[id] = handleZzOldNoop;
}

const script: Record<number, RegistryHandler> = {};
for (const id of CREATE_HEALTHSTONE_SPELL_IDS) {
  script[id] = handleCreateHealthstone;
}
for (const id of MOUNT_SCRIPT_SPELL_IDS) {
  script[id] = handleMountScriptNoop;
}
for (const id of TELEPORT_CITY_SCRIPT_SPELL_IDS) {
  script[id] = handleTeleportCityScriptNoop;
}
script[966] = handleZzOldNoop; // zzOLD Group Astral Recall
script[BENDING_SHINBONE_SPELL_ID] = handleBendingShinbone;
// Knock Away SCRIPT_EFFECT threat reduction family. Cite: SpellEffects.cpp:3695–3727.
for (const id of [
  KNOCK_AWAY_10101_SPELL_ID,
  KNOCK_AWAY_18103_SPELL_ID,
  KNOCK_AWAY_18670_SPELL_ID,
  KNOCK_AWAY_18813_SPELL_ID,
  KNOCK_AWAY_18945_SPELL_ID,
  KNOCK_AWAY_19633_SPELL_ID,
  KNOCK_AWAY_20686_SPELL_ID,
  KNOCK_AWAY_22920_SPELL_ID,
  KNOCK_AWAY_23382_SPELL_ID,
  KNOCK_AWAY_25778_SPELL_ID,
  KNOCK_AWAY_30013_SPELL_ID,
  KNOCK_AWAY_30121_SPELL_ID,
] as const) {
  script[id] = handleKnockAwayScriptThreat;
}
script[SHADOW_FLAME_SPELL_ID] = handleShadowFlameScript;
script[POISONOUS_BLOOD_SPELL_ID] = handlePoisonousBlood;
script[BRITTLE_ARMOR_PEEL_SPELL_ID] = handleBrittleArmorPeel;
script[DRAIN_MANA_MOAM_SPELL_ID] = handleDrainManaMoam;
script[DRAIN_MANA_ERADICATOR_SPELL_ID] = handleDrainManaEradicator;
script[DRAIN_MANA_NULLIFIER_SPELL_ID] = handleDrainManaNullifier;
script[MERCURIAL_SHIELD_PEEL_SPELL_ID] = handleMercurialShieldPeel;
script[SUMMON_BLACK_QIRAJI_BATTLE_TANK_SPELL_ID] = handleBlackQirajiMount;
// Boss multi-summon SCRIPT_EFFECT. Cite: SpellEffects.cpp:4110–4130.
script[SUMMON_BONE_MINIONS_SPELL_ID] = handleSummonBoneMinions;
script[SUMMON_BONE_MAGES_SPELL_ID] = handleSummonBoneMages;
// Darkmoon RC tank init. Cite: SpellEffects.cpp:1240–1247 case 27749.
script[INITIALIZE_TANK_SPELL_ID] = handleInitializeTank;

export const dummyScriptTailPack: RegistryPack = {
  id: 'dummy-script-tail',
  dummy,
  script,
};
