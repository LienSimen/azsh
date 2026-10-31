// Top-opcode handlers with the full C++ bodies. The generic path matches the bake mapper, and the
// family and id specials apply when the context supplies cast-time inputs. Cites sit on each handler.


import type { RawSpellEffect, School, SpellDef, SpellEffect } from '../../../../data/schema.ts';
import { effectAmountRange } from '../amount.ts';
import { resolveDurationMs } from '../duration.ts';
import type {
  InterpretContext,
  InterpretIntent,
  InterpretResult,
  UnhandledSlot,
  WeaponDamageModel,
} from '../types.ts';
import { spellBuffApplyToFromRaw, withHostile } from '../targeting.ts';

// ── SharedDefines SpellFamily (classic) ─────────────────────────────────────
export const SPELLFAMILY_GENERIC = 0;
export const SPELLFAMILY_MAGE = 3;
export const SPELLFAMILY_WARRIOR = 4;
export const SPELLFAMILY_WARLOCK = 5;
export const SPELLFAMILY_PRIEST = 6;
export const SPELLFAMILY_DRUID = 7;
export const SPELLFAMILY_ROGUE = 8;
export const SPELLFAMILY_HUNTER = 9;
export const SPELLFAMILY_PALADIN = 10;

/** SharedDefines Classes. Cite: SharedDefines.h:65–78. */
export const CLASS_HUNTER = 3;
export const CLASS_ROGUE = 4;
export const CLASS_PRIEST = 5;
export const CLASS_MAGE = 8;
export const CLASS_WARLOCK = 9;

// Priest | Mage | Warlock class mask — RAP early-out. Cite: SharedDefines.h:96 CLASSMASK_WAND_USERS;
// SpellAuras.cpp:3996.
export const CLASSMASK_WAND_USERS =
  (1 << (CLASS_PRIEST - 1)) | (1 << (CLASS_MAGE - 1)) | (1 << (CLASS_WARLOCK - 1));

// Missing creature template display for TRANSFORM (pig pink). Cite: SpellAuras.cpp:2003 m_modifier.m_amount
// = 16358.
export const TRANSFORM_MISSING_CREATURE_DISPLAY = 16358;

/** ItemPrototype.h ITEM_CLASS_*. Cite: EffectProficiency :2322–2327. */
export const ITEM_CLASS_WEAPON = 2;
export const ITEM_CLASS_ARMOR = 4;

// SpellTargetDefines TARGET_LOCATION_DATABASE — TeleportTo database dest flag path. Cite:
// SpellTargetDefines.h:41; EffectTeleportUnits :1712–1713.
export const TARGET_LOCATION_DATABASE = 17;

// Demonic Sacrifice override script id removed on warlock summon. Cite: SpellEffects.cpp:3254–3255
// GetOverrideScript(2228).
export const DEMONIC_SACRIFICE_SCRIPT = 2228;

// Demonic Sacrifice result auras, one per pet entry.
// Cite: Warlock.cpp:225-228 DemonicSacrifice; spell_template 18789-18792.
export const DEMONIC_SACRIFICE_RESULT_SPELL_IDS = [18789, 18790, 18791, 18792] as const;
export const DEMONIC_SACRIFICE_RESULT_SPELL_ID_SET: ReadonlySet<number> = new Set(
  DEMONIC_SACRIFICE_RESULT_SPELL_IDS,
);

// Common.h TimeConstants IN_MILLISECONDS. Cite: Common.h:119; EffectDistract MoveDistract(damage *
// IN_MILLISECONDS).
export const IN_MILLISECONDS = 1000;

// EffectStuck hearthstone CastSpell id (item 6948 Hearthstone counted separately). Cite:
// SpellEffects.cpp:4335–4336 IsSpellReady(8690) && HasItemCount(6948, 1).
export const STUCK_HEARTHSTONE_SPELL = 8690;

// EffectStuck alive non-hearth nudge distance (yards). Cite: SpellEffects.cpp:4350 GetNearPoint(..., 10.0f,
// ...).
export const STUCK_NUDGE_DISTANCE = 10;

/** Meteor-like split ids. Cite: SpellEffects.cpp:251–253. */
export const METEOR_SPLIT_IDS = new Set([24340, 26558, 28884, 26789]);

// Bloodthirst ranks (vanilla) — icon 38 + family flag 0x2000000. Cite: Spell.cpp:1305–1308;
// SpellEffects.cpp:279–283.
export const BLOODTHIRST_IDS = new Set([23881, 23892, 23893, 23894]);

/** Shield Slam ranks (vanilla) — icon 413 + family flag 0x2000000. Cite: SpellEffects.cpp:284–286. */
export const SHIELD_SLAM_IDS = new Set([23922, 23923, 23924, 23925]);

/** Immolate family flag for Conflagrate consume. Cite: SpellEffects.cpp:300. */
export const IMMOLATE_FAMILY_FLAGS = 0x4;
/** Conflagrate family flag. Cite: SpellEffects.cpp:292. */
export const CONFLAGRATE_FAMILY_FLAGS = 0x200;
/** Ferocious Bite family flag. Cite: SpellEffects.cpp:312. */
export const FEROCIOUS_BITE_FLAGS = 0x000800000;
/** Eviscerate family flag. Cite: SpellEffects.cpp:326. */
export const EVISCERATE_FLAGS = 0x00020000;
/** Ambush family flag. Cite: SpellEffects.cpp:3483. */
export const AMBUSH_FLAGS = 0x00000200;
/** Rip DoT AP flag. Cite: SpellAuras.cpp:3186. */
export const RIP_FLAGS = 0x800000;
/** Rupture DoT AP flag. Cite: SpellAuras.cpp:3201. */
export const RUPTURE_FLAGS = 0x100000;
/** Regrowth | Rejuvenation for Swiftmend. Cite: SpellEffects.cpp:1852. */
export const SWIFTMEND_HOT_FLAGS = 0x50;
/** Improved Scorpid Sting family mask on MOD_STAT. Cite: SpellAuras.cpp:3453. */
export const SCORPID_STING_FLAGS = 0x8000;

// SharedDefines SpellSchoolMask bits. Cite: SharedDefines.h; SpellAuras.cpp HandleModDamageDone :4040–4044;
// map-spell-effects.mjs SPELL_SCHOOL_MASK_NORMAL / MAGIC.
export const SPELL_SCHOOL_MASK_NORMAL = 1;

// SharedDefines MECHANIC_BANISH — school-immunity isolated state. Cite: SharedDefines.h:371;
// SpellAuras.cpp:3025–3030.
export const MECHANIC_BANISH = 18;

// SpellDefines.h MAX_SPELLMOD — AddModifier misc op gate. Cite: SpellDefines.h:425; SpellAuras.cpp:905–906.
export const MAX_SPELLMOD = 32;

// ADD_FLAT / ADD_PCT charge specials: SetAuraCharges(1). Cite: SpellAuras.cpp:915–918 HandleAddModifier.
export const ADD_MODIFIER_CHARGE_1_IDS = new Set([17941, 22008]); // Shadow Trance, Netherwind Focus

/** Clearcasting — raise spellmod priority before Elemental Mastery. Cite: SpellAuras.cpp:919–921. */
export const CLEARCASTING_SHAMAN_ID = 16246;
export const CLEARCASTING_SPELLMOD_PRIORITY = 100;

/** MOD_INCREASE_HEALTH: also ModifyHealth(±amount) on Real apply/remove. Cite: SpellAuras.cpp:3671–3695. */
export const MOD_INCREASE_HEALTH_CUR_HP_IDS = new Set([4148, 12976, 16609]);

// MOD_INCREASE_HEALTH: preserve health % across max change (bear form passives). Cite:
// SpellAuras.cpp:3698–3707.
export const MOD_INCREASE_HEALTH_PRESERVE_PCT_IDS = new Set([1178, 9635]);

// MOD_THREAT level-scaled amount: (level − 60) × multiplier when level > 60. Cite:
// SpellAuras.cpp:2819–2834.
export const MOD_THREAT_LEVEL_SCALE: Readonly<Record<number, number>> = {
  26400: 2, // Arcane Shroud
  28862: 1, // The Eye of Diminution
};

// Player main-hand attack time when disarmed (ms). Cite: Unit.h:68 BASE_ATTACK_TIME;
// SpellAuras.cpp:2444–2445.
export const BASE_ATTACK_TIME_MS = 2000;

/** MOD_DAMAGE_PERCENT_DONE expire cast (CMaNGOS tree special). Cite: SpellAuras.cpp:4170–4172. */
export const MOD_DMG_PCT_EXPIRE_CAST: Readonly<Record<number, number>> = {
  30423: 38639,
};

// Mana Shield family flag — SPELLFAMILY_MAGE + 0x8000 → +50% SPD absorb. Cite: SpellAuras.cpp:5075–5083;
// game-data spellFamilyFlags 32768.
export const MANA_SHIELD_FAMILY_FLAGS = 0x8000;

/** Mana Shield SPD absorb coefficient (0.5f). Cite: SpellAuras.cpp:5081. */
export const MANA_SHIELD_SPD_COEFF = 0.5;

// CalculateLevelPenalty: spellLevel < 20 && > 0 → 1 − (20 − spellLevel) × 0.0375. Else 1.0. Cite:
// Unit.cpp:2791–2794.
export const LEVEL_PENALTY_THRESHOLD = 20;
export const LEVEL_PENALTY_PER_LEVEL = 0.0375;

// SharedDefines ReputationRank REP_FRIENDLY — force-reaction stop-attack gate. Cite: SharedDefines.h:110;
// SpellAuras.cpp:2050–2051.
export const REP_FRIENDLY = 4;

/** Using Control Console — creature spell table for slot 5 on apply. Cite: SpellAuras.cpp:2209–2213. */
export const CONTROL_CONSOLE_APPLY_SPELLS = [25026, 25024, 27759, 25027] as const;
/** Close Control Console + Stun on remove. Cite: SpellAuras.cpp:2245–2246. */
export const CONTROL_CONSOLE_REMOVE_CASTER_SPELLS = [24938, 27880] as const;
/** Quiet Suicide on creature target remove. Cite: SpellAuras.cpp:2249. */
export const CONTROL_CONSOLE_REMOVE_TARGET_SPELL = 3617;
/** ForcedDespawn delay after Quiet Suicide. Cite: SpellAuras.cpp:2250. */
export const CONTROL_CONSOLE_DESPAWN_MS = 5000;
/** Spell 24937 Using Control Console. Cite: SpellAuras.cpp:2209 / :2242. */
export const CONTROL_CONSOLE_SPELL_ID = 24937;
/** Mutate Bug — on apply ModifyHealth(+max health delta). Cite: SpellAuras.cpp:3748–3753. */
export const MUTATE_BUG_SPELL_ID = 802;
/** Shade of Aran drink — OBS_MOD_MANA remove-by-default AI event. Cite: SpellAuras.cpp:3603–3609. */
export const SHADE_OF_ARAN_DRINK_SPELL_ID = 30024;

/** ShapeshiftForm ids — SpellDefines.h. Cite: SpellDefines.h:457–475. */
export const FORM_CAT = 0x01;
export const FORM_TREE = 0x02;
export const FORM_TRAVEL = 0x03;
export const FORM_AQUA = 0x04;
export const FORM_BEAR = 0x05;
export const FORM_GHOUL = 0x07;
export const FORM_DIREBEAR = 0x08;
export const FORM_CREATUREBEAR = 0x0e;
export const FORM_GHOSTWOLF = 0x10;
export const FORM_BATTLESTANCE = 0x11;
export const FORM_DEFENSIVESTANCE = 0x12;
export const FORM_BERSERKERSTANCE = 0x13;
export const FORM_MOONKIN = 0x1f;
export const FORM_SPIRITOFREDEMPTION = 0x20;

/** SharedDefines Powers. Cite: SharedDefines.h; SpellAuras.cpp shapeshift PowerType. */
export const POWER_MANA = 0;
export const POWER_RAGE = 1;
export const POWER_ENERGY = 3;

/** Tranquilizing Poison → Sleep on mana-leech expire. Cite: SpellAuras.cpp:3274–3280. */
export const TRANQUILIZING_POISON_IDS = new Set([24002, 24003]);
export const TRANQUILIZING_POISON_SLEEP = 24004;

/** Spirit Shade Visual uses moonkin form value but native display. Cite: SpellAuras.cpp:1767–1774. */
export const SPIRIT_SHADE_VISUAL_ID = 24809;

/** FORM_CAT Track Humanoids auto-cast. Cite: SpellAuras.cpp:1940–1942. */
export const TRACK_HUMANOIDS_SPELL = 5225;

/** Furor proc spells. Cite: SpellAuras.cpp:1961–1969. */
export const FUROR_ENERGY_SPELL = 17099;
export const FUROR_RAGE_SPELL = 17057;

// School name by SpellSchools index for MOD_RESISTANCE magic bits. Cite: map-spell-effects.mjs SCHOOLS;
// SharedDefines SpellSchools.
export const SCHOOLS: readonly School[] = [
  'physical',
  'holy',
  'fire',
  'nature',
  'frost',
  'shadow',
  'arcane',
];

/** Wyvern Sting rank → sleep DoT spell on stun remove. Cite: SpellAuras.cpp:2538–2542 HandleAuraModStun. */
export const WYVERN_STING_SLEEP: Readonly<Record<number, number>> = {
  19386: 24131,
  24132: 24134,
  24133: 24135,
};

/** Hunter family flag for player Wyvern Sting ranks. Cite: :2533. */
export const WYVERN_STING_FAMILY_FLAGS = 0x0001_0000;

// Seal of the Crusader ranks — 40% BASE_ATTACK DPS mod via dummy. Cite: SpellAuras.cpp:1576–1584
// HandleAuraDummy.
export const SEAL_OF_THE_CRUSADER_IDS = new Set([21082, 20162, 20305, 20306, 20307, 20308]);

// Quest tame channel dummy → final tame spell on remove (alive target). Cite: SpellAuras.cpp:1360–1382
// HandleAuraDummy.
export const QUEST_TAME_FINAL: Readonly<Record<number, number>> = {
  19548: 19597,
  19674: 19677,
  19687: 19676,
  19688: 19678,
  19689: 19679,
  19692: 19680,
  19693: 19684,
  19694: 19681,
  19696: 19682,
  19697: 19683,
  19699: 19685,
  19700: 19686,
};

// Burning Adrenaline remove → AoE + self-kill prevent durability. Cite: SpellAuras.cpp:3100–3106
// HandlePeriodicTriggerSpell.
export const BURNING_ADRENALINE_REMOVE_CASTS = [23478, 23644] as const;

// Battleground mark create-item specials (mail overflow path is runtime). Cite: SpellEffects.cpp:1954–1967;
// BattleGround.h SPELL_*_MARK_*.
export const BG_MARK_CREATE_IDS = new Set([
  24950, // SPELL_WS_MARK_LOSER
  24951, // SPELL_WS_MARK_WINNER
  24952, // SPELL_AB_MARK_LOSER
  24953, // SPELL_AB_MARK_WINNER
  24954, // SPELL_AV_MARK_LOSER
  24955, // SPELL_AV_MARK_WINNER
]);

/** Classic DEFAULT_MAX_CREATURE_LEVEL. Cite: SharedDefines / EffectSummonWild. */
export const DEFAULT_MAX_CREATURE_LEVEL = 63;

/** SharedDefines MAX_POWERS. Cite: SharedDefines.h:149; EffectPowerBurn :1803. */
export const MAX_POWERS = 5;

// SharedDefines POWER_HAPPINESS — EffectPowerDrain allows drain even when unitTarget GetPowerType()
// differs. Cite: SpellEffects.cpp:1758; SharedDefines Powers.
export const POWER_HAPPINESS = 4;

/** ADD_EXTRA_ATTACKS hard cap. Cite: SpellEffects.cpp:4878–4880. */
export const MAX_EXTRA_ATTACKS = 5;

// ENCHANT_HELD_ITEM default duration seconds when no spell duration / base points. Cite:
// SpellEffects.cpp:4607–4608.
export const ENCHANT_HELD_DEFAULT_SECS = 10;

// Movement::gravity for EffectPullTowards projectile motion. Cite: Movement/util.cpp:24;
// SpellEffects.cpp:5158.
export const MOVEMENT_GRAVITY = 19.29110527038574;

/** SUMMON_DEMON fixed despawn ms (TEMPSPAWN_TIMED_OR_DEAD_DESPAWN). Cite: SpellEffects.cpp:5447. */
export const SUMMON_DEMON_DURATION_MS = 3_600_000;

/** DYNAMIC_OBJECT_FARSIGHT_FOCUS. Cite: DynamicObject.h:31. */
export const DYNAMIC_OBJECT_FARSIGHT_FOCUS = 2;

// Vanish family flag for EffectSanctuary rogue special. IsFitToFamily(SPELLFAMILY_ROGUE, 0x800). Cite:
// SpellEffects.cpp:4203.
export const VANISH_SANCTUARY_FAMILY_FLAGS = 0x800;

/** Vanish SetCannotBeDetectedTimer ms. Cite: SpellEffects.cpp:4208. */
export const VANISH_CANNOT_BE_DETECTED_MS = 1000;

// Improved Weapon Totems family mask (Flametongue/Windfury totem effects). Cite: SpellEffects.cpp:4625
// IsFitToFamilyMask(0x0000000004000000).
export const IMPROVED_WEAPON_TOTEMS_FAMILY_MASK = 0x0400_0000;

/** EffectSpawn spell ids that clear UNIT_FLAG_SPAWNING. Cite: SpellEffects.cpp:3041–3043. */
export const SPAWN_CLEAR_FLAG_IDS = new Set([15750, 26262]);

// Shield Slam dispel family flag bit 32 (0x1_0000_0000). JS bitwise is 32-bit — use BigInt for the high
// flag. Cite: SpellEffects.cpp:2472–2475.
export const SHIELD_SLAM_DISPEL_FLAG = 0x1_0000_0000n;

/** SpellMgr.h SPELLCATEGORY_DEVOUR_MAGIC = 12. Cite: SpellEffects.cpp:2598. */
export const SPELLCATEGORY_DEVOUR_MAGIC = 12;

/** Devour Magic rank → heal spell. Cite: SpellEffects.cpp:2601–2610. */
export const DEVOUR_MAGIC_HEAL: Readonly<Record<number, number>> = {
  19505: 19658,
  19731: 19732,
  19734: 19733,
  19736: 19735,
};

// GameObjectActions (GameObject.h). Cite: EffectActivateObject switch. Values match enum class
// GameObjectActions order starting at NONE=0.
export const GO_ACTION = {
  NONE: 0,
  ANIMATE_CUSTOM_0: 1,
  ANIMATE_CUSTOM_1: 2,
  ANIMATE_CUSTOM_2: 3,
  ANIMATE_CUSTOM_3: 4,
  DISTURB: 5,
  UNLOCK: 6,
  LOCK: 7,
  OPEN: 8,
  OPEN_AND_UNLOCK: 9,
  CLOSE: 10,
  TOGGLE_OPEN: 11,
  DESTROY: 12,
  REBUILD: 13,
  CREATION: 14,
  DESPAWN: 15,
  MAKE_INERT: 16,
  MAKE_ACTIVE: 17,
  CLOSE_AND_LOCK: 18,
} as const;

/** GAMEOBJECT_TYPE_FISHINGNODE. Cite: SharedDefines / EffectTransmitted :5351. */
export const GO_TYPE_FISHINGNODE = 17;

/** FISHING_BOBBER_READY_TIME seconds. Cite: GameObject.h:684; EffectTransmitted :5367. */
export const FISHING_BOBBER_READY_TIME = 5;

/** Twilight Council summon tables for MAKE_ACTIVE/MAKE_INERT. Cite: SpellEffects.cpp:4425–4463. */
export const TWILIGHT_TEMPLARS = [15209, 15211, 15212, 15307] as const;
export const TWILIGHT_DUKES = [15206, 15207, 15208, 15220] as const;
export const TWILIGHT_ROYALS = [15203, 15204, 15205, 15305] as const;
export const TWILIGHT_FIXED_NPC: Readonly<Record<number, number>> = {
  24744: 15209,
  24756: 15212,
  24758: 15307,
  24760: 15211,
  24765: 15206,
  24768: 15220,
  24770: 15208,
  24772: 15207,
  24786: 15203,
  24788: 15204,
  24789: 15205,
  24790: 15305,
};

// The weapon-imbue family from the spell name, matching the bake mapper for named combat families.
// The generic family is omitted so the thin-bake oracle matches, and no combat kit is invented here.
export function weaponImbueFamilyFromName(name: string | undefined): string | undefined {
  const n = (name || '').toLowerCase();
  if (!n) return undefined;
  if (n.includes('rockbiter')) return 'rockbiter';
  if (n.includes('windfury')) return 'windfury';
  if (n.includes('flametongue')) return 'flametongue';
  if (n.includes('frostbrand')) return 'frostbrand';
  if (n.includes('poison')) return 'poison';
  // mapper may return 'other'; bake often omits — leave undefined for LOCK 9a.
  return undefined;
}

/** Summon count: damage > 0 ? damage : 1. Cite: EffectSummonWild :2767; EffectSummonGuardian :2902. */
export function summonCount(raw: RawSpellEffect, ctx: InterpretContext): number {
  const { min } = effectAmountRange(raw, ctx);
  return min > 0 ? min : 1;
}

export interface HandlerState {
  spell: SpellDef;
  ctx: InterpretContext;
  effects: SpellEffect[];
  unhandled: UnhandledSlot[];
  intents: InterpretIntent[];
  strikeBonus?: number;
  role?: SpellDef['role'];
  /** Shared EffectWeaponDmg accumulation across slots. */
  weapon: {
    fixedBonus: number;
    weaponPercentMod: number;
    normalized: boolean;
    ambush: boolean;
    sawFlat: boolean;
    sawPercent: boolean;
  };
}

export type EffectHandler = (state: HandlerState, raw: RawSpellEffect, slot: number) => void;
export type AuraHandler = (
  state: HandlerState,
  raw: RawSpellEffect,
  slot: number,
  effectType: number,
) => void;

export function schoolOf(spell: SpellDef): School {
  return spell.school;
}


export function familyOf(spell: SpellDef): number {
  return spell.spellFamilyName ?? 0;
}

export function flagsOf(spell: SpellDef): number {
  return (spell.spellFamilyFlags ?? 0) | 0;
}

export function iconIdOf(state: HandlerState): number {
  return state.ctx.spellIconId ?? state.spell.spellIconId ?? 0;
}

/** Resolve duration ms — never invent 12_000 / 10_000. Cite: duration.ts; spell-duration.mjs. */
export function durationMsResolved(state: HandlerState): number {
  const resolved = resolveDurationMs(
    state.ctx.durationMs,
    state.ctx.durationIndex,
    state.spell.durationIndex,
  );
  return resolved ?? 0;
}

// Push one incapacitate, merging with an existing same-mechanic remap: Polymorph stacks a confuse and
// a transform, and emitting both would advance diminishing returns twice per cast.
export function pushOrMergePolymorphIncapacitate(
  state: HandlerState,
  cc: Extract<SpellEffect, { kind: 'cc' }>,
): void {
  const existingIdx = state.effects.findIndex(
    (e) =>
      e.kind === 'cc'
      && e.control === 'incapacitate'
      && e.mechanic === 'polymorph',
  );
  if (existingIdx >= 0) {
    const prev = state.effects[existingIdx]! as Extract<SpellEffect, { kind: 'cc' }>;
    const merged: Extract<SpellEffect, { kind: 'cc' }> = {
      kind: 'cc',
      control: 'incapacitate',
      mechanic: 'polymorph',
      durationMs: Math.max(prev.durationMs ?? 0, cc.durationMs ?? 0),
      school: prev.school ?? cc.school,
    };
    if (prev.breakOnDamage === true || cc.breakOnDamage === true) {
      merged.breakOnDamage = true;
    }
    const onlyTypes = prev.onlyTypes ?? cc.onlyTypes;
    if (onlyTypes) merged.onlyTypes = onlyTypes;
    const pulseMs = prev.pulseMs ?? cc.pulseMs;
    if (pulseMs != null) merged.pulseMs = pulseMs;
    state.effects[existingIdx] = merged;
  } else {
    state.effects.push(cc);
  }
  state.role = state.role || 'control';
}

export function withPpc<T extends Record<string, unknown>>(
  obj: T,
  ppc: number | undefined,
): T {
  if (ppc) return { ...obj, pointsPerComboPoint: ppc };
  return obj;
}

export function trunc(n: number): number {
  return n < 0 ? Math.ceil(n) : Math.floor(n);
}

// SpellEntry::CalculateSimpleValue — EffectBasePoints + EffectBaseDice. Caches as m_currentBasePoints[eff].
// Cite: DBCStructure.h:817; Spell.cpp:425.
export function calculateSimpleValue(raw: RawSpellEffect): number {
  return (raw.basePoints | 0) + (raw.baseDice | 0);
}

// Single-bit school mask → school name (multi-bit / 0 → undefined). Cite: map-spell-effects.mjs
// schoolFromSingleBitMask :31–43.
export function schoolFromSingleBitMask(mask: number): School | undefined {
  if (!mask) return undefined;
  let found: School | undefined;
  let bits = 0;
  for (let i = 0; i < 7; i++) {
    if ((mask & (1 << i)) !== 0) {
      found = SCHOOLS[i];
      bits++;
    }
  }
  return bits === 1 ? found : undefined;
}

// ── SPELL_AURA_MOD_SKILL (30) / MOD_SKILL_TALENT (98) ── player-only, unmapped in the bake, with the
// intent carrying the skill line and signed amount. Below: skill line 95 is Defense.
const SKILL_DEFENSE = 95;

export function pushModSkillIntent(
  state: HandlerState,
  raw: RawSpellEffect,
  permanent: boolean,
): void {
  // C++: non-player → return. Cite: :2057–2058.
  if (state.ctx.unitTargetIsPlayer === false) return;

  const skillId = raw.miscValue | 0;
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  if (!skillId || min === 0) return;
  // Defense also surfaces on the paperdoll. Every skill line gets the modifier so the weapon and
  // defense skill values include racials, talents and equip bonuses above the level cap.
  if (skillId === SKILL_DEFENSE) {
    const tagged = withHostile(
      { kind: 'buff' as const, mod: 'defense' as const, amount: min, durationMs: dur },
      raw.targetA | 0,
      min,
    );
    state.effects.push(tagged as SpellEffect);
  }
  state.effects.push({
    kind: 'mod_skill',
    skillId,
    amount: min,
    permanent,
    durationMs: dur,
  } as never);
  state.role = state.role || 'buff';
}

// ── SPELL_AURA_ADD_FLAT_MODIFIER (107) / ADD_PCT_MODIFIER (108) ── empty in the bake; the intent
// carries the player spell modifier. Cite: SpellAuras.cpp:899-939 HandleAddModifier.
export function pushAddModifierIntent(
  state: HandlerState,
  raw: RawSpellEffect,
  kind: 'add_flat_modifier' | 'add_pct_modifier',
): void {
  // C++: player + Real only; misc >= MAX_SPELLMOD return. Cite: :901–906.
  if (state.ctx.unitTargetIsPlayer === false) return;
  const spellModOp = raw.miscValue | 0;
  if (spellModOp >= MAX_SPELLMOD) return;

  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  const id = state.spell.id | 0;
  // Narrow to the modifier variants that carry auraCharges / priority.
  const intent: Extract<InterpretIntent, { kind: 'add_flat_modifier' | 'add_pct_modifier' }> = {
    kind,
    spellModOp,
    amount: min,
    durationMs: dur,
    // EffectItemType is the vanilla family mask when spell_affect has no row.
    // Cite: SpellMgr.h GetSpellAffectMask; Player.cpp:350–357.
    familyFlags: (raw.itemType ?? 0) | 0,
  };
  // Charge / priority specials on apply. Cite: :912–922.
  if (ADD_MODIFIER_CHARGE_1_IDS.has(id)) {
    intent.auraCharges = 1;
  }
  if (id === CLEARCASTING_SHAMAN_ID) {
    intent.priority = CLEARCASTING_SPELLMOD_PRIORITY;
  }
  // A stack amount above one zeroes the modifier's charges, so it expires on a proc event rather than
  // on use. The id specials above set a charge on the aura holder; both paths coexist in the C++.
  if (((state.spell.stackAmount ?? 0) | 0) > 1) {
    intent.auraCharges = 0;
  }
  state.intents.push(intent);
}

// After all slots: integrate Ambush custom fixed-bonus percent when fullWeaponPath. Cite:
// SpellEffects.cpp:3512–3516.
export function finalizeWeaponModel(state: HandlerState): WeaponDamageModel | undefined {
  if (!state.weapon.sawFlat && !state.weapon.sawPercent) return undefined;

  let resolvedFixed = state.weapon.fixedBonus;
  let ambushBonusPct: number | undefined;

  if (state.weapon.ambush) {
    ambushBonusPct = 2.5;
    if (state.ctx.fullWeaponPath && state.weapon.sawPercent) {
      // customBonusDamagePercentMod: fixed *= 2.5 (not the weapon % mod).
      resolvedFixed = trunc(resolvedFixed * 2.5);
      // Optionally stamp strikeBonus with full path (tests); bake-thin keeps max flat.
      state.strikeBonus = resolvedFixed > 0 ? resolvedFixed : state.strikeBonus;
    }
  } else if (state.ctx.fullWeaponPath && state.weapon.sawPercent && state.weapon.sawFlat) {
    // Non-Ambush: fixed_bonus *= weaponDamagePercentMod.
    resolvedFixed = trunc(resolvedFixed * state.weapon.weaponPercentMod);
    state.strikeBonus = resolvedFixed > 0 ? resolvedFixed : state.strikeBonus;
  }

  return {
    fixedBonus: state.weapon.fixedBonus,
    weaponPercentMod: state.weapon.weaponPercentMod,
    normalized: state.weapon.normalized,
    ambushBonusPct,
    resolvedFixedBonus: resolvedFixed,
  };
}

// Stamp buff.applyTo from raw implicit targets. Overwrite a baked party fan when the DBC row
// names one selected unit (21/35/57/58). Cite: targeting.ts spellBuffApplyToFromRaw.
export function applySpellBuffAudience(state: HandlerState): void {
  const best = spellBuffApplyToFromRaw(state.spell);
  if (!best) return;
  for (let i = 0; i < state.effects.length; i++) {
    const e = state.effects[i]!;
    if (e.kind === 'buff' && e.hostile !== true) {
      state.effects[i] = { ...e, applyTo: best };
    }
  }
}

export function finalizeResult(state: HandlerState): InterpretResult {
  applySpellBuffAudience(state);
  const weaponDamageModel = finalizeWeaponModel(state);
  const out: InterpretResult = {
    effects: state.effects,
    unhandled: state.unhandled,
  };
  if (state.strikeBonus != null) out.strikeBonus = state.strikeBonus;
  if (state.role) out.role = state.role;
  if (weaponDamageModel) out.weaponDamageModel = weaponDamageModel;
  if (state.intents.length > 0) out.intents = state.intents;
  return out;
}

/** Create initial handler state for interpretSpell. */
export function createHandlerState(spell: SpellDef, ctx: InterpretContext): HandlerState {
  return {
    spell,
    ctx,
    effects: [],
    unhandled: [],
    intents: [],
    weapon: {
      fixedBonus: 0,
      weaponPercentMod: 1,
      normalized: false,
      ambush: false,
      sawFlat: false,
      sawPercent: false,
    },
  };
}
