// Stage s19 special-case spell ids from the CMaNGOS Spells sources: pure rule helpers and
// dispositions, with the combat wiring in the owning layer. Cite: census-spell-opcodes.mjs.

// ── Stage s19 spell ids ─────────────────────────────────────────────────────

// AQ40 regular mounts — CheckCast map 531 only else SPELL_FAILED_NOT_HERE. Cite: Spell.cpp:5765–5775 cases
// 25953/26054/26055/26056.
export const SUMMON_BLUE_QIRAJI_BATTLE_TANK_SPELL_ID = 25953;
export const SUMMON_RED_QIRAJI_BATTLE_TANK_SPELL_ID = 26054;
export const SUMMON_YELLOW_QIRAJI_BATTLE_TANK_SPELL_ID = 26055;
export const SUMMON_GREEN_QIRAJI_BATTLE_TANK_SPELL_ID = 26056;
/** Black Qiraji mount parent (works outside AQ; enables mounts inside map 531). */
export const SUMMON_BLACK_QIRAJI_BATTLE_TANK_SPELL_ID = 26656;
/** MapId of Temple of Ahn'Qiraj. Cite: Spell.cpp:5762 GetMapId()==531. */
export const AQ40_MAP_ID = 531;
/** Ahn'Qiraj area for black mount visual. Cite: item_scripts.cpp:262 case 3428. */
export const AQ40_AREA_ID = 3428;
/** Black mount payloads. Cite: item_scripts.cpp:262–263 CastSpell 25863 / 26655. */
export const BLACK_QIRAJI_MOUNT_IN_AQ_SPELL_ID = 25863;
export const BLACK_QIRAJI_MOUNT_WORLD_SPELL_ID = 26655;

// Eye for an Eye r2 holder + damage payload (already in main special-cases; re-exported here so STAGE_S19
// list is complete). Cite: UnitAuraProcHandler.cpp:795–808.
export const EYE_FOR_AN_EYE_RANK2_SPELL_ID = 25988;
export const EYE_FOR_AN_EYE_DAMAGE_SPELL_ID = 25997;

// Mistletoe (Winter Veil) — SCRIPT emote cheer on target; spirit buff is generic. Cite:
// SpellEffects.cpp:3963–3969 case 26004 HandleEmote.
export const MISTLETOE_CHEER_SPELL_ID = 26004;

// Poison Bolt Volley (Huhuran) — SCHEME_CLOSEST; MaxAffectedTargets 15. Cite: SpellTargets.cpp:505
// GetSpellTargetingFilterScheme → SCHEME_CLOSEST; spell_template MaxAffectedTargets=15.
export const POISON_BOLT_VOLLEY_SPELL_ID = 26052;
/** Closest-target cap. Cite: SpellTargets.cpp:505; bake maxTargets. */
export const POISON_BOLT_VOLLEY_MAX_TARGETS = 15;

// Holiday Cheer — client-side only (server EffectDummy returns immediately). Cite:
// SpellEffects.cpp:1196–1199 case 26074 // implemented at client side.
export const HOLIDAY_CHEER_SPELL_ID = 26074;

// Stinger Charge Primer (Huhuran path) — HasAura(26078) ? 26082 : 26081. Distinct from AQ40 Primer 24150
// (mark 25187). Cite: SpellEffects.cpp:1133–1139.
export const STINGER_CHARGE_PRIMER_26080_SPELL_ID = 26080;
export const STINGER_CHARGE_MARK_26078_AURA_SPELL_ID = 26078;
export const STINGER_CHARGE_PROTECT_26082_SPELL_ID = 26082;
export const STINGER_CHARGE_NORMAL_26081_SPELL_ID = 26081;

// Oracle Healing Bonus (Garments of the Oracle set) — heal done → self-heal 10% as 26170. Cite:
// UnitAuraProcHandler.cpp:1046–1052 case 26169 basepoints = damage*10/100 → 26170.
export const ORACLE_HEALING_BONUS_SPELL_ID = 26169;
export const ORACLE_HEALING_BONUS_TRIGGER_SPELL_ID = 26170;
/** Percent of heal amount returned to caster. Cite: UnitAuraProcHandler.cpp:1049. */
export const ORACLE_HEALING_BONUS_PCT = 10;

// Mistletoe (random gift) — player target only; urand 26206 / 26207. Cite: SpellEffects.cpp:3971–3979 case
// 26218.
export const MISTLETOE_RANDOM_SPELL_ID = 26218;
export const MISTLETOE_RANDOM_OUTCOMES = Object.freeze([26206, 26207] as const);

// Elune's Candle — Omen entry 15467 → random damage visuals; else 26636 harmless. Cite:
// SpellEffects.cpp:1201–1211 case 26374.
export const ELUNES_CANDLE_SPELL_ID = 26374;
export const OMEN_CREATURE_ENTRY = 15467;
export const ELUNES_CANDLE_OMEN_SPELLS = Object.freeze([
  26622, 26623, 26624, 26625, 26649,
] as const);
export const ELUNES_CANDLE_DEFAULT_SPELL_ID = 26636;

// Drain Mana family (Obsidian Eradicator / Nullifier). OnCheckTarget POWER_MANA (shared gate); SCRIPT casts
// 25755 / 25671. Cite: Spell.cpp:8041–8046; SpellEffects.cpp:3951–3961.
export const DRAIN_MANA_ERADICATOR_SPELL_ID = 26457;
export const DRAIN_MANA_ERADICATOR_TRIGGER_SPELL_ID = 25755;
export const DRAIN_MANA_NULLIFIER_SPELL_ID = 26559;
export const DRAIN_MANA_NULLIFIER_TRIGGER_SPELL_ID = 25671;

// Mercurial Shield SCRIPT_EFFECT — peel one stack of 26464. Cite: SpellEffects.cpp:3989–3991 case 26465
// RemoveAuraHolderFromStack(26464).
export const MERCURIAL_SHIELD_PEEL_SPELL_ID = 26465;
export const MERCURIAL_SHIELD_STACK_SPELL_ID = 26464;

// Persistent Shield (Scarab Brooch) — already rewritten 13567→26470 at 15% heal. Cite:
// UnitAuraProcHandler.cpp:1307–1313.
export const PERSISTENT_SHIELD_HOLDER_SPELL_ID = 26467;
export const PERSISTENT_SHIELD_ABSORB_SPELL_ID = 26470;
/** Absorb = heal * 15 / 100. Cite: UnitAuraProcHandler.cpp:1310. */
export const PERSISTENT_SHIELD_HEAL_PCT = 15;

// Summon Reindeer — SUMMON_MOUNT creature 15706 (triggered by 26528). Cite: SpellEffects.cpp:3998–4002 case
// 26528 CastSpell(26529).
export const SUMMON_REINDEER_SPELL_ID = 26529;

// Create Heart Candy — urand 0..7 → one of 26668/26670–26676. Cite: SpellEffects.cpp:4044–4060 case 26678.
export const CREATE_HEART_CANDY_SPELL_ID = 26678;
export const HEART_CANDY_OUTCOME_SPELL_IDS = Object.freeze([
  26668, 26670, 26671, 26672, 26673, 26674, 26675, 26676,
] as const);

// Give Friendship Bracelet — if player has Heartbroken 26898, remove + cast 26921. Cite:
// SpellEffects.cpp:1221–1228 case 26899.
export const GIVE_FRIENDSHIP_BRACELET_SPELL_ID = 26899;
export const HEARTBROKEN_AURA_SPELL_ID = 26898;
export const CANCEL_HEARTBROKEN_CREATE_BRACELET_SPELL_ID = 26921;

// Defile — PERIODIC_TRIGGER empty C++ stub (stun co-slot remains). Cite: SpellAuras.cpp:1027–1028 // case
// 27177: break;
export const DEFILE_SPELL_ID = 27177;

// Instill Lord Valthalak's Spirit DND — channel unit-target override for research. Cite:
// Spell.cpp:4141–4143 case 27360 getUnitTarget when not used in targeting.
export const INSTILL_VALTHALAK_SPIRIT_SPELL_ID = 27360;

// Mana Drain Trigger — on melee/ranged proc: self 29471 + victim 27526. Cite:
// UnitAuraProcHandler.cpp:1284–1291 case 27522.
export const MANA_DRAIN_TRIGGER_SPELL_ID = 27522;
export const MANA_DRAIN_SELF_GAIN_SPELL_ID = 29471;
export const MANA_DRAIN_VICTIM_DRAIN_SPELL_ID = 27526;

// Obsidian Armor (Justice Bearer's Pauldrons) — school of damaging spell → resist buff. Physical ignored.
// Cite: UnitAuraProcHandler.cpp:910–930 case 27539.
export const OBSIDIAN_ARMOR_SPELL_ID = 27539;
export const OBSIDIAN_ARMOR_BY_SCHOOL: Readonly<Record<string, number>> = Object.freeze({
  holy: 27536,
  fire: 27533,
  nature: 27538,
  frost: 27534,
  shadow: 27535,
  arcane: 27540,
});

// ── Stage s19 id list (census floor + test gate) ────────────────────────────

export const STAGE_S19_SPELL_IDS: readonly number[] = Object.freeze([
  SUMMON_BLUE_QIRAJI_BATTLE_TANK_SPELL_ID,
  EYE_FOR_AN_EYE_RANK2_SPELL_ID,
  EYE_FOR_AN_EYE_DAMAGE_SPELL_ID,
  MISTLETOE_CHEER_SPELL_ID,
  POISON_BOLT_VOLLEY_SPELL_ID,
  SUMMON_RED_QIRAJI_BATTLE_TANK_SPELL_ID,
  SUMMON_YELLOW_QIRAJI_BATTLE_TANK_SPELL_ID,
  SUMMON_GREEN_QIRAJI_BATTLE_TANK_SPELL_ID,
  HOLIDAY_CHEER_SPELL_ID,
  STINGER_CHARGE_PRIMER_26080_SPELL_ID,
  ORACLE_HEALING_BONUS_SPELL_ID,
  MISTLETOE_RANDOM_SPELL_ID,
  ELUNES_CANDLE_SPELL_ID,
  DRAIN_MANA_ERADICATOR_SPELL_ID,
  MERCURIAL_SHIELD_PEEL_SPELL_ID,
  PERSISTENT_SHIELD_HOLDER_SPELL_ID,
  SUMMON_REINDEER_SPELL_ID,
  DRAIN_MANA_NULLIFIER_SPELL_ID,
  SUMMON_BLACK_QIRAJI_BATTLE_TANK_SPELL_ID,
  CREATE_HEART_CANDY_SPELL_ID,
  GIVE_FRIENDSHIP_BRACELET_SPELL_ID,
  DEFILE_SPELL_ID,
  INSTILL_VALTHALAK_SPIRIT_SPELL_ID,
  MANA_DRAIN_TRIGGER_SPELL_ID,
  OBSIDIAN_ARMOR_SPELL_ID,
]);

// Cited dispositions for Dimension-C ids that are pure world/RP/holiday utility here. Combat-visible rules
// are implemented (not listed as dispositions).
export const STAGE_S19_CPP_DISPOSITIONS = Object.freeze({
  [MISTLETOE_CHEER_SPELL_ID]: {
    id: MISTLETOE_CHEER_SPELL_ID,
    name: 'Mistletoe',
    reason:
      'Winter Veil SCRIPT_EFFECT: only HandleEmote(EMOTE_ONESHOT_CHEER) on unitTarget; ' +
      'spirit buff is generic MOD_STAT. Emote is client cosmetic, not combat payload',
    cite: 'SpellEffects.cpp:3963–3969 case 26004 HandleEmote(EMOTE_ONESHOT_CHEER)',
  },
  [HOLIDAY_CHEER_SPELL_ID]: {
    id: HOLIDAY_CHEER_SPELL_ID,
    name: 'Holiday Cheer',
    reason:
      'EffectDummy returns immediately - CMaNGOS comment "implemented at client side". ' +
      'No server combat/world payload',
    cite: 'SpellEffects.cpp:1196–1199 case 26074 // implemented at client side return',
  },
  [MISTLETOE_RANDOM_SPELL_ID]: {
    id: MISTLETOE_RANDOM_SPELL_ID,
    name: 'Mistletoe',
    reason:
      'Holiday SCRIPT: player target only; urand CastSpell 26206 or 26207. Winter Veil gift, ' +
      'not a combat damage/CC rule',
    cite: 'SpellEffects.cpp:3971–3979 case 26218 spells[urand(0,1)] 26206|26207',
  },
  [ELUNES_CANDLE_SPELL_ID]: {
    id: ELUNES_CANDLE_SPELL_ID,
    name: "Elune's Candle",
    reason:
      'Lunar Festival dummy: Omen (entry 15467) → random visual damage cast; else 26636 ' +
      'harmless. World event toy, not player combat rewrite',
    cite: 'SpellEffects.cpp:1201–1211 case 26374 GetEntry()==15467 eluneCandle[] else 26636',
  },
  [SUMMON_REINDEER_SPELL_ID]: {
    id: SUMMON_REINDEER_SPELL_ID,
    name: 'Summon Reindeer',
    reason:
      'Holiday SUMMON_MOUNT payload cast by 26528. World/RP mount cosmetic, not combat',
    cite: 'SpellEffects.cpp:3998–4002 case 26528 CastSpell(…, 26529)',
  },
  [CREATE_HEART_CANDY_SPELL_ID]: {
    id: CREATE_HEART_CANDY_SPELL_ID,
    name: 'Create Heart Candy',
    reason:
      'Love is in the Air: urand(0,7) → Create Item scripts 26668/26670–26676. Vendor/RP item, ' +
      'not combat',
    cite: 'SpellEffects.cpp:4044–4060 case 26678 switch urand CastSpell candy create',
  },
  [GIVE_FRIENDSHIP_BRACELET_SPELL_ID]: {
    id: GIVE_FRIENDSHIP_BRACELET_SPELL_ID,
    name: 'Give Friendship Bracelet',
    reason:
      'Valentine dummy: only if player has Heartbroken 26898 - remove aura + cast 26921. ' +
      'Holiday quest utility, not combat',
    cite: 'SpellEffects.cpp:1221–1228 case 26899 HasAura(26898) RemoveAuras CastSpell 26921',
  },
  [INSTILL_VALTHALAK_SPIRIT_SPELL_ID]: {
    id: INSTILL_VALTHALAK_SPIRIT_SPELL_ID,
    name: "Instill Lord Valthalak's Spirit DND",
    reason:
      'Quest channel research override: when no GO/unique target, use m_targets unit target. ' +
      'Targeting plumbing only; no combat damage/CC body',
    cite: 'Spell.cpp:4141–4143 case 27360 target = m_targets.getUnitTarget()',
  },
  [DEFILE_SPELL_ID]: {
    id: DEFILE_SPELL_ID,
    name: 'Defile',
    reason:
      'PERIODIC_TRIGGER_SPELL co-slot is an empty C++ stub (// case 27177: break). Stun co-slot ' +
      'is generic MOD_STUN; no extra periodic body to port',
    cite: 'SpellAuras.cpp:1027–1028 // case 27177: break; // Defile',
  },
} as const);

// ── Pure helpers ────────────────────────────────────────────────────────────

/** True when spell is one of the 4 regular AQ40 color mounts. Cite: Spell.cpp:5765–5768. */
export function isRegularAq40MountSpell(spellId: number): boolean {
  const id = spellId | 0;
  return (
    id === SUMMON_BLUE_QIRAJI_BATTLE_TANK_SPELL_ID
    || id === SUMMON_RED_QIRAJI_BATTLE_TANK_SPELL_ID
    || id === SUMMON_YELLOW_QIRAJI_BATTLE_TANK_SPELL_ID
    || id === SUMMON_GREEN_QIRAJI_BATTLE_TANK_SPELL_ID
  );
}

// CheckCast: a regular AQ mount needs map 531 while the Black one is allowed anywhere. True means the
// cast is refused as not-here. Cite: Spell.cpp:5756-5775.
export function aqMountCheckCastRefused(spellId: number, mapId: number | undefined): boolean {
  const id = spellId | 0;
  if (isRegularAq40MountSpell(id)) {
    return ((mapId ?? 0) | 0) !== AQ40_MAP_ID;
  }
  return false;
}

/** Black Qiraji mount EffectDummy: area 3428 → 25863 else 26655. Cite: item_scripts.cpp:260–263. */
export function blackQirajiMountSpellId(areaId: number): number {
  return (areaId | 0) === AQ40_AREA_ID
    ? BLACK_QIRAJI_MOUNT_IN_AQ_SPELL_ID
    : BLACK_QIRAJI_MOUNT_WORLD_SPELL_ID;
}

/** Stinger Charge Primer 26080: mark 26078 → 26082 else 26081. Cite: SpellEffects.cpp:1135–1138. */
export function stingerChargePrimer26080SpellId(hasMarkAura26078: boolean): number {
  return hasMarkAura26078
    ? STINGER_CHARGE_PROTECT_26082_SPELL_ID
    : STINGER_CHARGE_NORMAL_26081_SPELL_ID;
}

// Oracle Healing Bonus self-heal amount: trunc(heal * 10 / 100). Cite: UnitAuraProcHandler.cpp:1049
// basepoints[0] = damage * 10 / 100.
function oracleHealingBonusAmount(healAmount: number): number {
  return Math.trunc(((healAmount | 0) * ORACLE_HEALING_BONUS_PCT) / 100);
}

// Obsidian Armor triggered resist buff for the first school of the damaging spell. Physical / unknown → 0
// (proc fails). Cite: UnitAuraProcHandler.cpp:915–926.
export function obsidianArmorTriggeredSpellId(school: string): number {
  return OBSIDIAN_ARMOR_BY_SCHOOL[school] ?? 0;
}

// Persistent Shield absorb pool from heal amount (15%). Cite: UnitAuraProcHandler.cpp:1310 basepoints[0] =
// damage * 15 / 100.
function persistentShieldAbsorbAmount(healAmount: number): number {
  return Math.trunc(((healAmount | 0) * PERSISTENT_SHIELD_HEAL_PCT) / 100);
}

/** Heart Candy create outcome from urand(0,7). Cite: SpellEffects.cpp:4048–4058. */
function pickHeartCandySpellId(roll0to7: number): number {
  const i = Math.min(7, Math.max(0, roll0to7 | 0));
  return HEART_CANDY_OUTCOME_SPELL_IDS[i]!;
}

/** Mistletoe random gift: roll01 → 26206 or 26207. Cite: SpellEffects.cpp:3976–3978 spells[urand(0, 1)]. */
function pickMistletoeRandomSpellId(roll01: number): number {
  return roll01 < 0.5 ? MISTLETOE_RANDOM_OUTCOMES[0]! : MISTLETOE_RANDOM_OUTCOMES[1]!;
}

// Elune's Candle payload: Omen entry → table pick; else default 26636. Cite: SpellEffects.cpp:1203–1210.
export function elunesCandleSpellId(
  targetCreatureEntry: number,
  omenRoll0to4: number,
): number {
  if ((targetCreatureEntry | 0) === OMEN_CREATURE_ENTRY) {
    const i = Math.min(4, Math.max(0, omenRoll0to4 | 0));
    return ELUNES_CANDLE_OMEN_SPELLS[i]!;
  }
  return ELUNES_CANDLE_DEFAULT_SPELL_ID;
}

// Drain Mana SCRIPT parent → triggered spell id (0 if not this family). Cite: SpellEffects.cpp:3951–3961.
function drainManaScriptTriggerSpellId(spellId: number): number {
  switch (spellId | 0) {
    case DRAIN_MANA_ERADICATOR_SPELL_ID:
      return DRAIN_MANA_ERADICATOR_TRIGGER_SPELL_ID;
    case DRAIN_MANA_NULLIFIER_SPELL_ID:
      return DRAIN_MANA_NULLIFIER_TRIGGER_SPELL_ID;
    default:
      return 0;
  }
}
