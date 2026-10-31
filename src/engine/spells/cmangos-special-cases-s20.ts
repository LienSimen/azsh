// Stage s20 special-case spell ids from the CMaNGOS Spells sources: pure rule helpers and
// dispositions, with the combat wiring in the owning layer. Cite: census-spell-opcodes.mjs.

import { CLASS } from '../../data/schema/constants.ts';

// ── Already closed by prior stages (still listed for stage floor) ───────────

/** Nitrous Boost — PERIODIC_TRIGGER zero: −10 mana/tick or strip aura. */
export const NITROUS_BOOST_SPELL_ID = 27746;
/** Holy Nova damage ranks 4–6. Cite: Spell.cpp:3133–3135. */
export const HOLY_NOVA_RANK4_SPELL_ID = 27799;
export const HOLY_NOVA_RANK5_SPELL_ID = 27800;
export const HOLY_NOVA_RANK6_SPELL_ID = 27801;
/** Holy Nova heal companions. Cite: Spell.cpp:3133–3135 AddTriggeredSpell. */
export const HOLY_NOVA_HEAL_RANK4_SPELL_ID = 27803;
export const HOLY_NOVA_HEAL_RANK5_SPELL_ID = 27804;
export const HOLY_NOVA_HEAL_RANK6_SPELL_ID = 27805;
/** Forceful Howl — Knock Away SCRIPT threat −50%. Cite: SpellEffects.cpp:3706–3712. */
export const FORCEFUL_HOWL_SPELL_ID = 30121;

// ── Boss / toy SCRIPT multi-cast ────────────────────────────────────────────

// Summon Bone Minions (Ras Frostwhisper) — unitTarget casts four minion summons. Cite:
// SpellEffects.cpp:4110–4119 case 27687.
export const SUMMON_BONE_MINIONS_SPELL_ID = 27687;
export const BONE_MINION_SUMMON_SPELL_IDS = Object.freeze([
  27690, 27691, 27692, 27693,
] as const);

/** Summon Bone Mages — unitTarget casts four mage summons. Cite: SpellEffects.cpp:4121–4130 case 27695. */
export const SUMMON_BONE_MAGES_SPELL_ID = 27695;
export const BONE_MAGE_SUMMON_SPELL_IDS = Object.freeze([
  27696, 27697, 27698, 27699,
] as const);

// Initialize Tank (Darkmoon RC) — cast 24936 RC Tank Control + 27747 Steam Tank Passive. Cite:
// SpellEffects.cpp:1240–1247 case 27749.
export const INITIALIZE_TANK_SPELL_ID = 27749;
export const RC_TANK_CONTROL_SPELL_ID = 24936;
export const STEAM_TANK_PASSIVE_SPELL_ID = 27747;

// Land Mine Periodic — aura-23 holder; detonation path removes it. Cite: SpellEffects.cpp:1236 case 28000
// RemoveAurasDueToSpell(27999).
export const LAND_MINE_PERIODIC_SPELL_ID = 27999;
/** Land Mine Trigger dummy. Cite: SpellEffects.cpp:1230–1238. */
export const LAND_MINE_TRIGGER_SPELL_ID = 28000;
/** Detonation payload. Cite: SpellEffects.cpp:1235 CastSpell(…, 25099). */
export const LAND_MINE_DETONATION_SPELL_ID = 25099;

// Grobbulus Poison cloud parent (aura triggers 28241; radius grows with 28158 age). Cite:
// Spell.cpp:7567–7571 case 28241 GetSpellAuraHolder(28158).
export const GROBBULUS_POISON_CLOUD_SPELL_ID = 28158;
/** Poison bolt payload with custom radius. Cite: Spell.cpp:7567–7571. */
export const GROBBULUS_POISON_SPELL_ID = 28241;
// Duration of 28158, used by the radius formula: duration index 3 is 60,000 ms.
// Cite: spell-data 28158 durationIndex 3; Spell.cpp:7570.
export const GROBBULUS_POISON_CLOUD_DURATION_MS = 60_000;
/** Radius coeff. Cite: Spell.cpp:7570 radius = 0.3f * (60000 - dur) * 0.001f. */
export const GROBBULUS_POISON_RADIUS_PER_SEC = 0.3;

// Call of the Ashbringer — PlayDirectSound only (no combat payload). Cite: SpellEffects.cpp:1249–1255 case
// 28414.
export const FORGIVENESS_SPELL_ID = 28697;
export const FORGIVENESS_PERMANENT_FEIGN_DEATH_SPELL_ID = 29266;

export const CALL_OF_THE_ASHBRINGER_SPELL_ID = 28414;

// ── Set / talent dummy auras ────────────────────────────────────────────────

// Healing Touch (Dreamwalker Raiment set) — HT cast → mana back 30% of manaCost as 28742. Cite:
// UnitAuraProcHandler.cpp:1068–1074 case 28719.
export const DREAMWALKER_HEALING_TOUCH_SPELL_ID = 28719;
export const DREAMWALKER_MANA_BACK_SPELL_ID = 28742;
/** Percent of HT manaCost refunded. Cite: UnitAuraProcHandler.cpp:1071. */
export const DREAMWALKER_MANA_BACK_PCT = 30;
/** SPELLFAMILY_DRUID. Cite: SharedDefines.h. */
export const SPELLFAMILY_DRUID = 7;
/** Healing Touch family flag. Cite: spell_template HT ranks SpellFamilyFlags=32. */
export const HEALING_TOUCH_FAMILY_FLAGS = 32;

// Adaptive Warding (Frostfire Regalia) — requires Mage Armor; school → resist buff. Cite:
// UnitAuraProcHandler.cpp:870–907 case 28764.
export const ADAPTIVE_WARDING_SPELL_ID = 28764;
/** Mage Armor SpellFamilyFlags bit. Cite: UnitAuraProcHandler.cpp:882 0x10000000. */
export const MAGE_ARMOR_FAMILY_FLAGS = 0x10000000;
/** Rank rows with MOD_MANA_REGEN_INTERRUPT + mage armor flag. Cite: spell_template 6117/22782/22783. */
export const MAGE_ARMOR_SPELL_IDS = Object.freeze([6117, 22782, 22783] as const);
export const ADAPTIVE_WARDING_BY_SCHOOL: Readonly<Record<string, number>> = Object.freeze({
  fire: 28765,
  frost: 28766,
  nature: 28768,
  shadow: 28769,
  arcane: 28770,
});

// Holy Power (Redemption Armor set) — heal target class → buff. Cite: UnitAuraProcHandler.cpp:1153–1181
// case 28789.
export const HOLY_POWER_SET_SPELL_ID = 28789;
export const HOLY_POWER_ARMOR_SPELL_ID = 28790;
export const HOLY_POWER_ATTACK_POWER_SPELL_ID = 28791;
export const HOLY_POWER_SPELL_POWER_SPELL_ID = 28793;
export const HOLY_POWER_MANA_REGEN_SPELL_ID = 28795;

// Greater Heal (Vestments of Faith 4pc) — trigger 28810. Cite: UnitAuraProcHandler.cpp:1055–1058 case
// 28809.
export const VESTMENTS_GREATER_HEAL_SPELL_ID = 28809;
export const VESTMENTS_GREATER_HEAL_TRIGGER_SPELL_ID = 28810;
/** SPELLFAMILY_PRIEST. */
export const SPELLFAMILY_PRIEST = 6;
/** Greater Heal family flag. Cite: spell_template GH ranks SpellFamilyFlags=4096. */
export const GREATER_HEAL_FAMILY_FLAGS = 4096;

// Totemic Power (The Earthshatterer set) — heal target class → buff. Cite:
// UnitAuraProcHandler.cpp:1191–1219 case 28823.
export const TOTEMIC_POWER_SET_SPELL_ID = 28823;
export const TOTEMIC_POWER_MANA_REGEN_SPELL_ID = 28824;
export const TOTEMIC_POWER_SPELL_POWER_SPELL_ID = 28825;
export const TOTEMIC_POWER_ATTACK_POWER_SPELL_ID = 28826;
export const TOTEMIC_POWER_ARMOR_SPELL_ID = 28827;

// Cheat Death (set) — PROC_TRIGGER 28846 only when damage crosses below 20% HP. Cite:
// UnitAuraProcHandler.cpp:1378–1383 case 28845.
export const CHEAT_DEATH_SPELL_ID = 28845;
export const CHEAT_DEATH_HEALING_TAKEN_SPELL_ID = 28846;
/** health20 = maxHealth / 5. Cite: UnitAuraProcHandler.cpp:1381. */
export const CHEAT_DEATH_HEALTH_DIVISOR = 5;

// Healing Touch Refund (Idol of Longevity) — HT cast → 28848. Cite: UnitAuraProcHandler.cpp:1077–1081 case
// 28847.
export const IDOL_HEALING_TOUCH_REFUND_SPELL_ID = 28847;
export const IDOL_HEALING_TOUCH_REFUND_TRIGGER_SPELL_ID = 28848;

// Lesser Healing Wave (Totem of Flowing Water) — LHW cast → 28850. Cite: UnitAuraProcHandler.cpp:1222–1226
// case 28849.
export const TOTEM_LESSER_HEALING_WAVE_SPELL_ID = 28849;
export const TOTEM_LESSER_HEALING_WAVE_TRIGGER_SPELL_ID = 28850;
/** SPELLFAMILY_SHAMAN. */
export const SPELLFAMILY_SHAMAN = 11;
/** LHW family flag. Cite: spell_template LHW ranks SpellFamilyFlags=128. */
export const LESSER_HEALING_WAVE_FAMILY_FLAGS = 128;

// Master of Elements payload (talent ranks 29074/75/76 dummy → custom energize). Cite:
// UnitAuraProcHandler.cpp:949–964 triggered_spell_id = 29077.
export const MASTER_OF_ELEMENTS_TRIGGER_SPELL_ID = 29077;
export const MASTER_OF_ELEMENTS_RANK1_SPELL_ID = 29074;
export const MASTER_OF_ELEMENTS_RANK2_SPELL_ID = 29075;
export const MASTER_OF_ELEMENTS_RANK3_SPELL_ID = 29076;
/** Rank → refund percent (bp+die). Cite: tables/spells.json 29074 bp9+1=10, 29075=20, 29076=30. */
export const MASTER_OF_ELEMENTS_PCT: Readonly<Record<number, number>> = Object.freeze({
  [MASTER_OF_ELEMENTS_RANK1_SPELL_ID]: 10,
  [MASTER_OF_ELEMENTS_RANK2_SPELL_ID]: 20,
  [MASTER_OF_ELEMENTS_RANK3_SPELL_ID]: 30,
});

// Magic Absorption mana payload (talent ranks dummy → custom energize). Cite:
// UnitAuraProcHandler.cpp:938–947 triggered_spell_id = 29442.
export const MAGIC_ABSORPTION_TRIGGER_SPELL_ID = 29442;
export const MAGIC_ABSORPTION_RANK1_SPELL_ID = 29441;
export const MAGIC_ABSORPTION_RANK2_SPELL_ID = 29444;
export const MAGIC_ABSORPTION_RANK3_SPELL_ID = 29445;
export const MAGIC_ABSORPTION_RANK4_SPELL_ID = 29446;
export const MAGIC_ABSORPTION_RANK5_SPELL_ID = 29447;
// Rank to percent of max mana restored on a full resist, from the first effect's base points plus die.
// Cite: tables/spells.json 29441..29447; UnitAuraProcHandler.cpp:944.
export const MAGIC_ABSORPTION_PCT: Readonly<Record<number, number>> = Object.freeze({
  [MAGIC_ABSORPTION_RANK1_SPELL_ID]: 1,
  [MAGIC_ABSORPTION_RANK2_SPELL_ID]: 2,
  [MAGIC_ABSORPTION_RANK3_SPELL_ID]: 3,
  [MAGIC_ABSORPTION_RANK4_SPELL_ID]: 4,
  [MAGIC_ABSORPTION_RANK5_SPELL_ID]: 5,
});

// ── Stage s20 id list (census floor + test gate) ────────────────────────────

export const STAGE_S20_SPELL_IDS: readonly number[] = Object.freeze([
  SUMMON_BONE_MINIONS_SPELL_ID,
  SUMMON_BONE_MAGES_SPELL_ID,
  NITROUS_BOOST_SPELL_ID,
  INITIALIZE_TANK_SPELL_ID,
  HOLY_NOVA_RANK4_SPELL_ID,
  HOLY_NOVA_RANK5_SPELL_ID,
  HOLY_NOVA_RANK6_SPELL_ID,
  HOLY_NOVA_HEAL_RANK4_SPELL_ID,
  HOLY_NOVA_HEAL_RANK5_SPELL_ID,
  HOLY_NOVA_HEAL_RANK6_SPELL_ID,
  LAND_MINE_PERIODIC_SPELL_ID,
  GROBBULUS_POISON_CLOUD_SPELL_ID,
  GROBBULUS_POISON_SPELL_ID,
  FORGIVENESS_SPELL_ID,
  CALL_OF_THE_ASHBRINGER_SPELL_ID,
  DREAMWALKER_HEALING_TOUCH_SPELL_ID,
  ADAPTIVE_WARDING_SPELL_ID,
  HOLY_POWER_SET_SPELL_ID,
  VESTMENTS_GREATER_HEAL_SPELL_ID,
  TOTEMIC_POWER_SET_SPELL_ID,
  CHEAT_DEATH_SPELL_ID,
  IDOL_HEALING_TOUCH_REFUND_SPELL_ID,
  TOTEM_LESSER_HEALING_WAVE_SPELL_ID,
  MASTER_OF_ELEMENTS_TRIGGER_SPELL_ID,
  MAGIC_ABSORPTION_TRIGGER_SPELL_ID,
  FORCEFUL_HOWL_SPELL_ID,
]);

// Cited dispositions for Dimension-C ids that are pure world/RP/toy utility here. Combat-visible rules are
// implemented (not listed as dispositions).
export const STAGE_S20_CPP_DISPOSITIONS = Object.freeze({
  [FORGIVENESS_SPELL_ID]: {
    id: FORGIVENESS_SPELL_ID,
    name: 'Forgiveness',
    reason: 'CastSpell(29266) - permanent feign death dummy script',
    cite: 'SpellEffects.cpp:1257-1261',
  },
  [CALL_OF_THE_ASHBRINGER_SPELL_ID]: {
    id: CALL_OF_THE_ASHBRINGER_SPELL_ID,
    name: 'Call of the Ashbringer',
    reason:
      'EffectDummy: PlayDirectSound(AshbringerSounds[urand(0,11)]) to casting player only. ' +
      'No combat damage/CC/buff body - pure RP voice line on Corrupted Ashbringer equip',
    cite: 'SpellEffects.cpp:1249–1255 case 28414 PlayDirectSound AshbringerSounds[urand(0,11)]',
  },
  [INITIALIZE_TANK_SPELL_ID]: {
    id: INITIALIZE_TANK_SPELL_ID,
    name: 'Initialize Tank',
    reason:
      'Darkmoon Faire RC tank setup: CastSpell 24936 (RC Tank Control) + 27747 (Steam Tank Passive). ' +
      'Toy/world vehicle init, not player combat rewrite',
    cite: 'SpellEffects.cpp:1240–1247 case 27749 CastSpell 24936 + 27747',
  },
  [SUMMON_BONE_MINIONS_SPELL_ID]: {
    id: SUMMON_BONE_MINIONS_SPELL_ID,
    name: 'Summon Bone Minions',
    reason:
      'Boss SCRIPT_EFFECT: unitTarget casts four summon scripts 27690–27693. World/boss AI summons ' +
      '(payloads absent from player combat bake); multi-cast rule is in helpers + script handler',
    cite: 'SpellEffects.cpp:4110–4119 case 27687 CastSpell 27690/27691/27692/27693',
  },
  [SUMMON_BONE_MAGES_SPELL_ID]: {
    id: SUMMON_BONE_MAGES_SPELL_ID,
    name: 'Summon Bone Mages',
    reason:
      'Boss SCRIPT_EFFECT: unitTarget casts four summon scripts 27696–27699. World/boss AI summons; ' +
      'multi-cast rule is in helpers + script handler',
    cite: 'SpellEffects.cpp:4121–4130 case 27695 CastSpell 27696/27697/27698/27699',
  },
} as const);

// ── Pure helpers ────────────────────────────────────────────────────────────

/** Bone Minions / Mages multi-cast payload ids. Cite: SpellEffects.cpp:4115–4118 / 4126–4129. */
function boneMinionSummonSpellIds(): readonly number[] {
  return BONE_MINION_SUMMON_SPELL_IDS;
}

function boneMageSummonSpellIds(): readonly number[] {
  return BONE_MAGE_SUMMON_SPELL_IDS;
}

/** Initialize Tank secondary casts. Cite: SpellEffects.cpp:1245–1246. */
function initializeTankSpellIds(): readonly number[] {
  return [RC_TANK_CONTROL_SPELL_ID, STEAM_TANK_PASSIVE_SPELL_ID];
}

// Land Mine Trigger side-effects: detonation spell + remove periodic aura. Cite:
// SpellEffects.cpp:1235–1236.
function landMineDetonationSpellId(): number {
  return LAND_MINE_DETONATION_SPELL_ID;
}

// Grobbulus Poison AOE radius from remaining ms on parent cloud aura 28158. radius = 0.3 * (60000 -
// remainingMs) * 0.001 (yards). Cite: Spell.cpp:7567–7571.
function grobbulusPoisonRadiusYd(cloudRemainingMs: number): number {
  const remaining = Math.max(0, Math.min(GROBBULUS_POISON_CLOUD_DURATION_MS, cloudRemainingMs | 0));
  const elapsedMs = GROBBULUS_POISON_CLOUD_DURATION_MS - remaining;
  return GROBBULUS_POISON_RADIUS_PER_SEC * elapsedMs * 0.001;
}

// Dreamwalker mana refund: trunc(manaCost * 30 / 100). Cite: UnitAuraProcHandler.cpp:1071 basepoints[0] =
// spellInfo->manaCost * 30 / 100.
export function dreamwalkerManaBackAmount(manaCost: number): number {
  return Math.trunc(((manaCost | 0) * DREAMWALKER_MANA_BACK_PCT) / 100);
}

// True when spell is a real Healing Touch rank (not the set dummy 28719). Cite: spell_template
// SpellFamilyName=7 SpellFamilyFlags=32.
export function isHealingTouchSpell(
  spellId: number,
  spellFamilyName: number | undefined,
  spellFamilyFlags: number | undefined,
): boolean {
  if ((spellId | 0) === DREAMWALKER_HEALING_TOUCH_SPELL_ID) return false;
  if ((spellId | 0) === IDOL_HEALING_TOUCH_REFUND_SPELL_ID) return false;
  return (
    ((spellFamilyName ?? 0) | 0) === SPELLFAMILY_DRUID
    && ((Number(spellFamilyFlags) || 0) & HEALING_TOUCH_FAMILY_FLAGS) !== 0
  );
}

// True when spell is Greater Heal (not set dummy 28809). Cite: spell_template SpellFamilyName=6
// SpellFamilyFlags=4096.
export function isGreaterHealSpell(
  spellId: number,
  spellFamilyName: number | undefined,
  spellFamilyFlags: number | undefined,
): boolean {
  if ((spellId | 0) === VESTMENTS_GREATER_HEAL_SPELL_ID) return false;
  return (
    ((spellFamilyName ?? 0) | 0) === SPELLFAMILY_PRIEST
    && ((Number(spellFamilyFlags) || 0) & GREATER_HEAL_FAMILY_FLAGS) !== 0
  );
}

// True when spell is Lesser Healing Wave (not set dummy 28849). Cite: spell_template SpellFamilyName=11
// SpellFamilyFlags=128.
export function isLesserHealingWaveSpell(
  spellId: number,
  spellFamilyName: number | undefined,
  spellFamilyFlags: number | undefined,
): boolean {
  if ((spellId | 0) === TOTEM_LESSER_HEALING_WAVE_SPELL_ID) return false;
  return (
    ((spellFamilyName ?? 0) | 0) === SPELLFAMILY_SHAMAN
    && ((Number(spellFamilyFlags) || 0) & LESSER_HEALING_WAVE_FAMILY_FLAGS) !== 0
  );
}

// Adaptive Warding triggered resist buff; physical/holy/unknown → 0. Cite: UnitAuraProcHandler.cpp:892–903.
export function adaptiveWardingTriggeredSpellId(school: string): number {
  return ADAPTIVE_WARDING_BY_SCHOOL[school] ?? 0;
}

// Holy Power / Totemic Power class → buff spell id (0 if unknown class). Cite:
// UnitAuraProcHandler.cpp:1159–1179 / 1197–1217.
export function classSetPowerBuffSpellId(
  setKind: 'holy_power' | 'totemic_power',
  classId: number,
): number {
  const cls = classId | 0;
  const healer =
    cls === CLASS.PALADIN
    || cls === CLASS.PRIEST
    || cls === CLASS.SHAMAN
    || cls === CLASS.DRUID;
  const caster = cls === CLASS.MAGE || cls === CLASS.WARLOCK;
  const melee = cls === CLASS.HUNTER || cls === CLASS.ROGUE;
  const warrior = cls === CLASS.WARRIOR;
  if (setKind === 'holy_power') {
    if (healer) return HOLY_POWER_MANA_REGEN_SPELL_ID;
    if (caster) return HOLY_POWER_SPELL_POWER_SPELL_ID;
    if (melee) return HOLY_POWER_ATTACK_POWER_SPELL_ID;
    if (warrior) return HOLY_POWER_ARMOR_SPELL_ID;
    return 0;
  }
  if (healer) return TOTEMIC_POWER_MANA_REGEN_SPELL_ID;
  if (caster) return TOTEMIC_POWER_SPELL_POWER_SPELL_ID;
  if (melee) return TOTEMIC_POWER_ATTACK_POWER_SPELL_ID;
  if (warrior) return TOTEMIC_POWER_ARMOR_SPELL_ID;
  return 0;
}

// Cheat Death gate: proc only when current health is at or above a fifth of maximum and the hit would
// take it below. Cite: UnitAuraProcHandler.cpp:1381-1383.
export function cheatDeathShouldProc(
  currentHealth: number,
  maxHealth: number,
  incomingDamage: number,
): boolean {
  const health20 = Math.trunc((maxHealth | 0) / CHEAT_DEATH_HEALTH_DIVISOR);
  const hp = currentHealth | 0;
  const dmg = incomingDamage | 0;
  if (hp - dmg >= health20) return false;
  if (hp < health20) return false;
  return true;
}

// Master of Elements mana refund: trunc(manaCost * pct / 100); ≤0 → 0 (proc fails). Cite:
// UnitAuraProcHandler.cpp:956–959.
export function masterOfElementsRefundAmount(manaCost: number, pct: number): number {
  const amt = Math.trunc(((manaCost | 0) * (pct | 0)) / 100);
  return amt > 0 ? amt : 0;
}

/** Magic Absorption mana gain: trunc(pct * maxMana / 100). Cite: UnitAuraProcHandler.cpp:944. */
export function magicAbsorptionManaAmount(maxMana: number, pct: number): number {
  return Math.trunc(((pct | 0) * (maxMana | 0)) / 100);
}
