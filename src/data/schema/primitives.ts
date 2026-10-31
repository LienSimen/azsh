// The data contract between the offline ETL and the runtime engine: the ETL bakes FINAL numbers
// into JSON matching these shapes. No TS `enum`/`namespace` — only erasable syntax.

export type Stat = 'str' | 'agi' | 'sta' | 'int' | 'spi' |
  // secondary combat ratings (Item 5 data track + later engine)
  'crit' | 'hit' | 'haste' | 'dodge' | 'parry' | 'block' | 'defense' |
  // SPELL_AURA_MOD_SPELL_HIT_CHANCE (55) / MOD_SPELL_CRIT_CHANCE (57) — not melee hit/crit.
  // Cite: SpellAuras.cpp HandleModSpellHitChance; HandleModSpellCritChance.
  'spellHit' | 'spellCrit' |
  'spellPower' | 'mp5' |
  // flat pools (ITEM_MOD_MANA 0 / ITEM_MOD_HEALTH 1)
  'mana' | 'health' |
  // resistances (by school)
  'resHoly' | 'resFire' | 'resNature' | 'resFrost' | 'resShadow' | 'resArcane' |
  // per-school flat +spell damage (SPELL_AURA_MOD_DAMAGE_DONE one-school). Mirrors resHoly..resArcane.
  'spellHoly' | 'spellFire' | 'spellNature' | 'spellFrost' | 'spellShadow' | 'spellArcane';
export type School =
  | 'physical' | 'holy' | 'fire' | 'nature' | 'frost' | 'shadow' | 'arcane';
// 'focus' is pet-only and 'energy' is the rogue's fixed 0..100 pool. 'health' is only a spell COST
// power type (POWER_HEALTH = −2), never an active bar. Cite: SharedDefines.h Powers.
export type PowerType = 'mana' | 'rage' | 'focus' | 'energy' | 'health';

// Shapeshift form id from SpellShapeshiftForm / spell_template EffectMiscValue of SPELL_AURA_MOD_SHAPESHIFT
// (36). Values match CMaNGOS `ShapeshiftForm` (SpellDefines.h). 0 / absent = humanoid (no form).
export type ShapeshiftFormId = number;

export type ItemQuality = 0 | 1 | 2 | 3 | 4 | 5; // poor, common, uncommon, rare, epic, legendary

// The kind of slot an item can go into, its intrinsic WoW InventoryType mapped to a name.
// `twohand` occupies the main hand but blocks the off hand; `bag` grows the backpack.
export type ItemSlot =
  | 'head' | 'neck' | 'shoulder' | 'back' | 'chest' | 'wrist'
  | 'hands' | 'waist' | 'legs' | 'feet' | 'finger' | 'trinket'
  | 'shirt' // INVTYPE_BODY (4) — starter harnesses/shirts; under chest on paperdoll
  | 'mainhand' | 'offhand' | 'twohand' | 'ranged' | 'bag';

// A physical slot on the character's paperdoll. Rings and trinkets have two each, a two-hander
// keeps `offhand` empty, `bag1..4` extend the backpack, and `shirt` is INVTYPE_BODY.
export type EquipSlot =
  | 'head' | 'neck' | 'shoulder' | 'back' | 'chest' | 'shirt' | 'wrist'
  | 'hands' | 'waist' | 'legs' | 'feet' | 'finger1' | 'finger2'
  | 'trinket1' | 'trinket2' | 'mainhand' | 'offhand' | 'ranged'
  | 'bag1' | 'bag2' | 'bag3' | 'bag4';

export interface PrimaryStats {
  str: number;
  agi: number;
  sta: number;
  int: number;
  spi: number;
}

// ---- Spells ---------------------------------------------------------------

// One conditions-table row (ConditionEntry) for cast/use/loot/gossip gates. Combinators are
// AND/OR/NOT (-1/-2/-3) with value1/value2 as nested ids. Production data must be ETL-sourced.
export type ConditionTypeId =
  | -3 | -2 | -1 // NOT, OR, AND
  | 0  // NONE
  | 1  // AURA
  | 2  // ITEM
  | 3  // ITEM_EQUIPPED
  | 4  // AREAID
  | 5  // REPUTATION_RANK_MIN (Conditions.h)
  | 6  // TEAM
  | 7  // SKILL
  | 8  // QUESTREWARDED
  | 9  // QUESTTAKEN
  | 10 // AD_COMMISSION_AURA (Conditions.h)
  | 11 // PVP_RANK (Conditions.h)
  | 12 // ACTIVE_GAME_EVENT
  | 26 // ACTIVE_HOLIDAY
  | 14 // RACE_CLASS
  | 15 // LEVEL
  | 17 // SPELL
  | 22 // QUEST_NONE
  | 30 // REPUTATION_RANK_MAX
  | 31 // COMPLETED_ENCOUNTER
  | 35 // GENDER
  | 43 // IS_IN_COMBAT
  | number; // allow full enum for future types

export interface ConditionDef {
  id: number;
  type: ConditionTypeId;
  value1: number;
  value2?: number;
  value3?: number;
  value4?: number;
  /** CONDITION_FLAG_REVERSE_RESULT = 0x1 */
  flags?: number;
  // Optional nested defs for AND/OR/NOT when not using a flat id→def map (value1/value2 still hold nested
  // condition ids when map lookup is used).
  nested?: ConditionDef[];
}

// What a `buff` effect raises. Every mod here is applied live, and the primary-stat names cascade
// to the same derivatives the sheet folds them into. Cite: characterStats effectiveStats.
export type BuffMod =
  // MOD_ATTACK_POWER (99) and MOD_RANGED_ATTACK_POWER (124) are different auras and different
  // pools: UpdateAttackPowerAndDamage runs twice, the ranged pass reading its own.
  | 'attack_power' | 'ranged_attack_power' | 'armor'
  // Percent armor modifier (aura 101 with the physical school mask — Pierce Armor, Expose Armor).
  // TOTAL_PCT: effective armor = armor × (1 + Σamount/100). Cite: HandleModResistancePercent.
  | 'armor_pct'
  // Percent modifier on BASE (item) armor only (aura 142, physical mask — Toughness, Thick Hide).
  // BASE_PCT, so the agility and flat-buff terms are NOT multiplied. Cite: Unit.cpp:9067.
  | 'armor_base_pct'
  | 'strength' | 'agility' | 'stamina' | 'intellect' | 'spirit' | 'all_stats'
  // Auras 80 / 137 with a SINGLE stat in EffectMiscValue — whole percent on that stat's TOTAL_PCT.
  // Not interchangeable with the flat names: Demonic Embrace is +15% Stamina, not +15 Stamina.
  | 'strength_pct' | 'agility_pct' | 'stamina_pct' | 'intellect_pct' | 'spirit_pct'
  | 'spell_power' | 'mp5'
  // SPELL_AURA_MOD_DAMAGE_DONE (13) with EXACTLY ONE magic school bit in EffectMiscValue.
  // Paperdoll Stat spellFire..spellArcane; live map spellDamageBySchool. Cite: Unit.cpp ~7129.
  | 'spell_damage_holy' | 'spell_damage_fire' | 'spell_damage_nature'
  | 'spell_damage_frost' | 'spell_damage_shadow' | 'spell_damage_arcane'
  // SPELL_AURA_MOD_POWER_REGEN_PERCENT (110) for POWER_MANA — whole percent on the spirit OCT
  // (Evocation +1500 → ×16). Cite: StatSystem.cpp:551–552; Unit.cpp:4611–4622.
  | 'mana_regen_pct'
  // SPELL_AURA_MOD_POWER_REGEN_PERCENT (110) for POWER_ENERGY — whole percent on energy regen (Adrenaline Rush +100%).
  | 'energy_regen_pct'
  // SPELL_AURA_MOD_MANA_REGEN_INTERRUPT (134) — additive % of spirit regen while casting
  // (Evocation/Innervate 100; Meditation talent ranks). Cite: StatSystem.cpp:558–562.
  | 'mana_regen_interrupt'
  // Melee haste % (Slice and Dice SPELL_AURA_MOD_MELEE_HASTE = 138). Applied live on Fighter.haste.
  | 'haste'
  // Cast speed % (aura 65), applied live on Fighter.castHaste. Separate from 'haste' because the
  // C++ never routes it to a swing timer: Burning Adrenaline's 100000 would be 1001x attack speed.
  | 'cast_haste'
  // Flat physical damage taken modifier (SPELL_AURA_MOD_DAMAGE_TAKEN = 125). Stoneskin Totem stores
  // a negative amount (e.g. -5) so incoming melee is reduced by that many points after armor.
  | 'physical_taken'
  // Flat RANGED damage taken (aura 113) — the ranged-only twin of physical_taken, and the whole
  // content of Windwall Totem. Cite: SpellAuras.cpp:174 → Unit::MeleeDamageBonusTaken.
  | 'ranged_taken'
  // Percent physical damage taken (aura 87 physical mask, aura 126). dealDamage multiplies by
  // (1 + Σamount/100) after armor and flat physical_taken. Cite: Unit.cpp:7628 / :7634.
  | 'physical_taken_pct'
  // School-scoped percent damage taken (aura 87 with a magic or multi-bit mask): CoE fire|frost +6,
  // CoS shadow|arcane +8. The buff carries `school` or `schoolMask`; absent mask → all schools.
  | 'damage_taken_pct'
  // Flat spell/magic damage taken (aura 14 with a magic school mask). Negative reduces incoming
  // spell damage and Amplify Magic is positive. Applied on the non-physical dealDamage path.
  | 'spell_taken'
  // Flat healing taken modifier (SPELL_AURA_MOD_HEALING = 115) — Dampen/Amplify Magic effect 2.
  | 'healing_taken'
  // Percent healing taken (aura 118). The heal path multiplies by (1 + Σamount/100) after flat
  // healing_taken. Mortal Strike −50, Wound Poison −75. Cite: Unit.cpp:7239–7245.
  | 'healing_taken_pct'
  // Victim aura granting attackers +AP (aura 127), applied on the VICTIM — attackers use the bonus
  // when striking the marked target. Hunter's Mark effect 2, not +AP on the mob itself.
  | 'attacker_attack_power'
  // Victim aura granting attackers +spell crit % for the schools in schoolMask (aura 179, Winter's
  // Chill). Whole percentage points. Cite: Unit.cpp:3516–3536 GetCritTakenChance.
  | 'attacker_spell_crit'
  // SPELL_AURA_MOD_TOTAL_THREAT (103) — Fade: signed temporary total-threat modifier on the caster.
  // Amount is EffectBasePoints+dice (Fade R1 bp −56 → −55). Live wire multiplies threat generation.
  | 'threat_mod'
  // Temporary max-health % (aura 137, Last Stand's 12976 +30% for 20s). The engine converts it to a
  // flat `max_health` delta at apply time so expiry reverses the exact amount.
  | 'max_health_pct'
  | 'max_health'
  // Flat max mana (aura 35 with EffectMiscValue POWER_MANA = 0) — Flask of Distilled Wisdom +2000.
  // Cite: SpellAuras.cpp HandleAuraModIncreaseEnergy; map-spell-effects.mjs aura === 35.
  | 'max_mana'
  // SPELL_AURA_MOD_INCREASE_ENERGY_PERCENT = 132 for POWER_MANA.
  // Mental Strength +10% max mana. Cite: SpellAuras.cpp HandleAuraModIncreaseEnergyPercent.
  | 'max_mana_pct'
  // Flat parry / dodge / block percentage points (auras 47 / 49 / 51). The engine applies
  // amount/100 to the fighter's chance and reverses it on expiry. Cite: SpellAuras.cpp:3789–3800.
  | 'parry'
  | 'dodge'
  | 'block'
  // MOD_CRIT_PERCENT (52) / MOD_HIT_CHANCE (54) — whole percentage points, from gear equip auras
  // and temporary buffs. Paperdoll Stat.crit / Stat.hit; combat spec.critChance / hitChance.
  | 'crit'
  | 'hit'
  // SPELL_AURA_MOD_AOE_AVOIDANCE (160) — whole miss %points vs area spells.
  // Cite: Unit.cpp:3713–3715 MagicSpellHitResult GetTotalAuraModifier.
  | 'aoe_avoidance'
  // SPELL_AURA_MOD_SKILL (30) with EffectMiscValue = SKILL_DEFENSE (95) — flat defense skill, not
  // a chance field. Paperdoll Stat.defense → defenseSkill(). Cite: SpellAuras.cpp:2055.
  | 'defense'
  // SPELL_AURA_MOD_HEALING_DONE (135) — flat +healing from Increase Healing N equip auras,
  // consumed by SpellHealingBonusDone. Distinct from healing_done_pct (136).
  | 'healing_done'
  // SPELL_AURA_MOD_SHIELD_BLOCKVALUE (158) — flat shield block value points.
  // Player HandleBaseModValue(SHIELD_BLOCK_VALUE, FLAT_MOD). Cite: SpellAuras.cpp:4426–4433.
  | 'block_value' | 'block_value_pct'
  // SPELL_AURA_MOD_SPELL_DAMAGE_OF_STAT_PERCENT (174) — spell power equal to a % of spirit,
  // pre-converted to a flat `spell_power` delta at apply so expiry reverses the exact amount.
  | 'spell_power_of_spirit_pct'
  // SPELL_AURA_MOD_SPELL_HEALING_OF_STAT_PERCENT (175) — healing equal to a % of spirit,
  // pre-converted to a flat `healing_done` delta using the target's spirit at apply time.
  | 'healing_power_of_spirit_pct'
  // SPELL_AURA_MOD_DAMAGE_PERCENT_DONE (79) — whole percent added live to damagePctBySchool. A
  // `school` on the buff raises only that school; absent raises every one. Reverses on expiry.
  | 'damage_done_pct'
  // SPELL_AURA_MOD_HEALING_DONE_PERCENT (136) — % increase to healing done (Power Infusion +20%).
  // Whole percent; raises the fighter's live `healingPct`, read when a heal amount is rolled.
  | 'healing_done_pct'
  // Aura 137 with EffectMiscValue −1 (all stats) — Blessing of Kings +10%. The engine holds
  // derived stats, so this moves attack power and max health only; spell power is fixed at build.
  | 'all_stats_pct'
  // SPELL_AURA_MOD_ATTACK_POWER_PCT (166) — TOTAL_PCT on UNIT_MOD_ATTACK_POWER, so AP only.
  // Converted to a flat attack_power delta at apply so expiry reverses instead of compounding.
  | 'attack_power_pct'
  // Auras 73 (flat) and 72 (percent), both scoped to the EffectMiscValue school mask.
  // CalculatePowerCost is (base + flat) × (1 + pct/100), clamped at 0. Cite: Spell.cpp:6358/:6368.
  | 'power_cost'
  | 'power_cost_pct'
  // SPELL_AURA_MOD_SPELL_HIT_CHANCE (55) — whole percentage points off the magic miss roll.
  // Distinct from 'hit' (aura 54), which is the melee/ranged table.
  | 'spell_hit'
  // SPELL_AURA_MOD_SPELL_CRIT_CHANCE (57) — whole percentage points of SPELL crit, the twin of
  // 'crit' (aura 52). Raises spec.spellCritChance, which defaults from critChance when unset.
  | 'spell_crit'
  // Auras 102 / 131 — flat AP only when the target's creature type matches the EffectMiscValue
  // MASK (1 << (type−1)). Applied in MeleeDamageBonusDone as APbonus, not sheet AP.
  | 'attack_power_versus'
  | 'ranged_attack_power_versus'
  // SPELL_AURA_MOD_FLAT_SPELL_DAMAGE_VERSUS (180). Flat spell damage when target type matches
  // creature-type mask. Cite: Unit.cpp:7055 SpellDamageBonusDone.
  | 'spell_damage_versus'
  // SPELL_AURA_MOD_DAMAGE_DONE_VERSUS (168) — whole-percent multiplier on melee, ranged AND spell
  // damage vs a creature-type mask. Percent, not flat, which is why it is not spell_damage_versus.
  | 'damage_done_versus_pct'
  // SPELL_AURA_MOD_DAMAGE_DONE_CREATURE (59) - flat damage vs a creature-type mask
  // (Beastslayer / Elemental Slayer). Cite: Unit.cpp:7061 SpellDamageBonusDone; :7465 melee.
  | 'damage_done_creature'
  // SPELL_AURA_MOD_TARGET_RESISTANCE (123). The aura amount is typically NEGATIVE in the DBC, so
  // penetration = −amount. The buff carries `schoolMask`. Cite: Unit.cpp:3890–3894.
  | 'target_resistance'
  // SPELL_AURA_MOD_OFFHAND_DAMAGE_PCT (122) — whole percent onto UNIT_MOD_DAMAGE_OFFHAND
  // TOTAL_PCT, which starts at 0.5, so Dual Wield Specialization 5/5 makes it 0.625.
  | 'offhand_damage_pct'
  // SPELL_AURA_MOD_CRIT_PERCENT_VERSUS (169) — whole percent onto the crit MULTIPLIER, not the
  // chance, when the type matches: Monster Slaying 3/3 turns a 2x melee crit into 2.06x.
  | 'crit_damage_versus_pct'
  // SPELL_AURA_MOD_RESISTANCE_OF_STAT_PERCENT (182) — armor gains `amount`% of INTELLECT. Classic
  // only supports the NORMAL school mask; others log an error. Cite: StatSystem.cpp:125-138.
  | 'armor_from_intellect_pct'
  // Victim-side "attacker chance" auras. The amount is the DBC value, normally NEGATIVE on a
  // defensive talent, and is SUBTRACTED from the attacker's roll. Cite: Unit.cpp:3525-3528.
  | 'attacker_melee_crit'
  | 'attacker_ranged_crit'
  | 'attacker_ranged_hit'
  | 'attacker_spell_hit';

/** Classic shaman totem element slot (CMaNGOS TotemSlot: FIRE=0 EARTH=1 WATER=2 AIR=3). */
export type TotemSlot = 'fire' | 'earth' | 'water' | 'air';

// A crowd-control school of effect; `root` lives here so all loss-of-control shares one path.
// stun/fear/incapacitate lock out fully, silence blocks casts, disarm melee, snare only speed.
export type ControlKind = 'stun' | 'fear' | 'incapacitate' | 'silence' | 'disarm' | 'root' | 'snare' | 'charm';

// The DB "Mechanic": groups diminishing-returns categories and gates creature-type immunity. A
// superset of ControlKind, since a damage spell can carry one. Cite: SharedDefines.h:351–384.
export type Mechanic =
  | 'none'
  | 'charm'            // 1
  | 'disoriented'      // 2
  | 'disarm'           // 3
  | 'distract'         // 4
  | 'fear'             // 5
  | 'fumble'           // 6
  | 'root'             // 7
  | 'pacify'           // 8
  | 'silence'          // 9
  | 'sleep'            // 10
  | 'snare'            // 11
  | 'stun'             // 12
  | 'freeze'           // 13
  | 'knockout'         // 14
  | 'bleed'            // 15
  | 'bandage'          // 16
  | 'polymorph'        // 17
  | 'banish'           // 18
  | 'shield'           // 19
  | 'shackle'          // 20
  | 'mount'            // 21
  | 'persuade'         // 22
  | 'turn'             // 23
  | 'horror'           // 24
  | 'invulnerability'  // 25
  | 'interrupt'        // 26
  | 'daze'             // 27
  | 'discovery'        // 28
  | 'immune_shield'    // 29
  | 'sap';              // 30 MECHANIC_SAPPED

// Paladin seal school — a 30s self-aura whose per-swing holy the engine computes from the real
// formula, since the DB stores coefficients. `crusader` has no on-swing holy, only the Judgement.
export type SealKind = 'righteousness' | 'command' | 'light' | 'wisdom' | 'justice' | 'crusader';
