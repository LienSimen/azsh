// Combat types (Wave 4 S24) — extracted from engine/combat.ts.
// Public surface re-exported via combat.ts barrel; Fighter/ActiveEffect/etc. for combat/* modules.

import type {
  SpellDef,
  PowerType,
  School,
  BuffMod,
  ControlKind,
  Mechanic,
  ShapeshiftFormId,
  TotemSlot,
  CreatureCastEntry,
  CreatureAiBundle,
  CreatureSpellListEntry,
  CombatConditionDef,
  UnitConditionDef,
} from '../../data/schema.ts';
import type { CombatEvent, Side, TotemSide } from '../core/events.ts';
import type { CombatantId } from './threat.ts';
import type { AllyFilter, HaltDpsSchool, RotationSnapshot, RuleAfter, RuleAfterStep, RuleMove } from '../../domain/rotation/rotation.ts';
import type { CombatPosYd, PullGeometryAnchor, UnitPositionsYd } from './combatGeometry.ts';
import type {
  SchoolAbsorbAura,
  ManaShieldAura,
  SplitDamagePctAura,
  SplitDamageFlatAura,
} from '../spells/absorbs.ts';
import type { CreatureImmunitySet, ImmunityState } from '../spells/immunity.ts';
import type { SpellMod } from '../spells/spellMods.ts';
import type { OwnedSpellMod } from '../spells/spellModIntents.ts';
import type { ActiveSeal, StartActiveSeal } from './activeSeal.ts';
import type { AuraStackIdentity } from '../spells/auraStacking.ts';

export type { ActiveSeal, StartActiveSeal } from './activeSeal.ts';

export interface ActiveWeaponImbue {
  spellId: number;
  name: string;
  expiresAt: number;
  enchantId?: number;
  family?: string;
  attackPower?: number;
  // TYPE_EQUIP_SPELL passive (oil mp5/SP, lure), cast on apply and dropped with the enchant.
  // Rockbiter carries `attackPower` instead — never both. Cite: Player.cpp:11299-11310.
  equipSpellId?: number;
  combatChancePct?: number;
  combatPpm?: number;
  damageFlat?: number;
  rockbiterAmount?: number;
  combat?: {
    spellId: number;
    name: string;
    direct?: { school: School; min: number; max: number };
    dot?: { school: School; min: number; max: number; durationMs: number; tickMs: number };
    extraAttacks?: number;
    apBonus?: number;
    /** Frostbrand / Crippling Poison snare. Cite: KI-581 / KI-717. */
    speed?: {
      aura: number;
      pct: number;
      durationMs: number;
      hostile?: boolean;
      mechanic?: string;
    };
    /** Mind-numbing / Wound Poison hostile buffs. Cite: KI-717. */
    buffs?: Array<{
      mod: string;
      amount: number;
      durationMs: number;
      hostile?: boolean;
    }>;
  };
}

export interface WeaponProfile {
  dmgMin: number;
  dmgMax: number;
  speedMs: number;
  school: School;
  twoHand?: boolean;   // true for a two-handed weapon (item slot 'twohand'); selects the 2H seal formula
}

export interface ProcDef {
  triggerSpellId: number;
  // `SPELL_ATTR_EX3_CAN_PROC_FROM_PROCS` on the aura that owns the proc, not the payload; 34 rows.
  // Absent = the proc cannot fire from a triggered cast. Cite: UnitAuraProcHandler.cpp:610.
  canProcFromProcs?: boolean;
  // `SPELL_ATTR_PROC_FAILURE_BURNS_CHARGE` on the aura — a failed roll still spends a charge.
  // 12 rows: every Windfury Weapon and Totem rank, Drain Soul. Cite: UnitAuraProcHandler.cpp:505.
  failureBurnsCharge?: boolean;
  spellIconId?: number;
  chance: number | null; // 0..1 probability per trigger event, or null if ppm-driven
  ppm: number | null;    // procs-per-minute (requires speed scaling at trigger sites)
  /** SpellMgr.h ProcFlags bitmask; absent = match any damage hit context. */
  procFlags?: number;
  // SpellEntry.Stances of the talent rank that owns the proc — Blood Frenzy is cat, Primal Fury is
  // bear/dire. 0 or absent = no form requirement. Cite: DBCStructure.h:864 CanBeUsedInForm.
  stances?: number;
  /** SpellMgr.h ProcFlagsEx; e.g. CRITICAL_HIT only. Absent = no ex filter. */
  procEx?: number;
  /** Hidden CD on the triggered spell (ms) from SpellProcEventEntry.cooldown. */
  cooldownMs?: number;
  /** SpellProcEventEntry.customChance as 0..1 (overrides chance when set). */
  customChance?: number;
  /** spell_proc_event.schoolMask — filter by triggering spell school. */
  schoolMask?: number;
  /** spell_proc_event.spellFamilyName. */
  spellFamilyName?: number;
  /** spell_proc_event.spellFamilyMask[3]. */
  spellFamilyMask?: number[];
}

/** Per-school damage multiplier from talents (and future sources). Values are percentage points, e.g. 10 = +10%. */
export type DamagePctBySchool = Partial<Record<School, number>>;

/** Group role hint for ally combatants (drives the S0 role-branched AI; S1 replaces with rotations). */
export type GroupRole = 'tank' | 'healer' | 'damage';

export interface CombatantSpec {
  name: string;
  level: number;
  /** 0 male, 1 female (Character.gender convention; GENDER_MALE=0). Absent defaults male. */
  gender?: 0 | 1;
  // Live player drunkenness 0..0xFFFF during a fight (mirrors Character.drunkValue).
  // Cite: Player.cpp m_drunk / SetDrunkValue; SPELL_EFFECT_INEBRIATE; KI-734.
  drunkValue?: number;
  /** Unit m_movementInfo.moveFlags. Cite: Object.h:750 MOVEFLAG_HOVER; Unit.cpp:12428 SetHover. */
  movementFlags?: number;
  // healer heals the lowest friendly, tank taunts when not the victim and prefers threat kit,
  // damage or absent falls back to class heuristics. Ignored on pet/enemy specs.
  groupRole?: GroupRole;
  // World cooldowns carried into the fight, as remaining ms at t=0 — the same relative form
  // `CombatConfig.initialSpellCooldowns` gives the player.
  initialSpellCooldowns?: Record<number, number>;
  initialCategoryCooldowns?: Record<number, number>;
  // 0-based raid subgroup; party targets reach only the caster's subgroup, and absent = ungrouped
  // so every party fan fails open. Cite: Spell.cpp:7325–7345 FillRaidOrPartyTargets.
  subgroup?: number;
  // Friendlies only, absent = 'auto'. 'auto' closes or steps back to `standYards`, 'hold' never
  // auto-moves, 'melee' always closes to reach.
  movement?: 'auto' | 'hold' | 'melee';
  // Yards to hold from the focus (Rotation.standYards). Absent → kitWantsMeleeBand.
  // 5 = melee pile; 20–30 = ranged default.
  standYards?: number;
  /** False suppresses the voluntary PBAoE pack walk-in (autopilot aoeMode 'single'). Absent = allowed. */
  packClose?: boolean;
  /** Player class id (schema CLASS / SharedDefines). Used for live strength→AP cascades. */
  classId?: number;
  maxHealth: number;
  startHealth?: number;
  powerType: PowerType;
  maxPower: number;
  startPower: number;
  armor: number;
  // The BASE (item) slice of `armor` — what a mid-fight aura 142 BASE_PCT multiplies. Absent on
  // mobs and fixtures. Cite: Unit.cpp:9067 (base_value * base_pct) + total_value.
  baseArmor?: number;
  weapon: WeaponProfile;         // main-hand melee auto-attack
  // Off-hand weapon when dual-wielding. Absent when empty, shield, or form-overridden speed.
  // Cite: hasOffhandWeaponForAttack; UNIT_FIELD_*OFFHANDDAMAGE.
  offhand?: WeaponProfile;
  ranged?: WeaponProfile;        // equipped ranged weapon (wand/bow/gun); powers Shoot / Auto Shot
  rangedAuto?: boolean;          // true → auto-attacks at range with `ranged` (a Hunter with a bow) instead of meleeing
  // Ammo DPS from the selected projectile; 0 or absent when no ammo is selected, incompatible,
  // count 0, or not baked. Cite: Player.cpp _ApplyAmmoBonuses.
  ammoDpsMin?: number;
  ammoDpsMax?: number;
  // Live projectile ammo for the mid-fight gate and consume, decremented into itemsConsumed.
  // Cite: Spell.cpp TakeAmmo / CheckCast NO_AMMO.
  ammoEntry?: number;
  ammoRemaining?: number;
  /** Projectile subclass (arrow=2 / bullet=3) for compatibility re-check. */
  ammoSubclass?: number;
  /** Equipped ranged weapon subclass (bow/gun/xbow/wand/thrown). */
  rangedWeaponSubclass?: number;
  /** MH weapon subclass for HasItemFitToSpellReqirements. Cite: Player.cpp:18595–18601. */
  mainhandWeaponSubclass?: number;
  /** OH weapon subclass when dual-wielding (not shield). Cite: Player.cpp:18595–18601. */
  offhandWeaponSubclass?: number;
  /** 0-dur paperdoll weapon subclass (fit omits; reason → 'broken weapon'). KI-891/798. */
  brokenMainhandWeaponSubclass?: number;
  brokenOffhandWeaponSubclass?: number;
  brokenRangedWeaponSubclass?: number;
  /** OH armor subclass (shield/holdable). Cite: Player.cpp:18611–18614. */
  offhandArmorSubclass?: number;
  /** Body-slot armor subclasses for ITEM_CLASS_ARMOR fit. Cite: Player.cpp:18605–18609. */
  bodyArmorSubclasses?: number[];
  /** Ranged-slot relic armor subclass. Cite: Player.cpp:18616–18619. */
  rangedArmorSubclass?: number;
  /** Paperdoll scanned at pull; absent → fixture grace for non-ranged EquippedItem*. */
  equippedItemFitReady?: boolean;
  // Stackable thrown remaining (equipped + bags); absent when not thrown, 0 → NO_AMMO.
  // Cite: Spell.cpp TakeAmmo thrown path.
  thrownRemaining?: number;
  /** Thrown weapon item entry when ranged slot is thrown (for itemsConsumed). */
  thrownEntry?: number;
  // SpellItemEnchantment TYPE_DAMAGE flats per hand. Cite: Player.cpp SetEnchantmentModifier ~11281.
  enchantFlatMh?: number;
  enchantFlatOh?: number;
  enchantFlatRanged?: number;
  attackPower: number;
  // Sheet agility at pull, for the mid-fight Cat AGI→AP re-sync; absent or 0 → no form AGI AP delta.
  // Cite: StatSystem.cpp UpdateAttackPowerAndDamage.
  agility?: number;
  /** Ranged AP when computed (hunters etc.); optional for test/mob specs. */
  rangedAttackPower?: number;
  critChance: number;
  /** Spell crit from intellect curves (0..1). Falls back to critChance for mobs/tests. */
  spellCritChance?: number;
  hitChance: number;
  // Gear SPELL_AURA_MOD_SPELL_HIT_CHANCE (55) in percentage points, seeding
  // Fighter.spellHitBonusPercent. Cite: Unit.cpp CalculateSpellMissChance.
  spellHitBonusPercent?: number;
  haste?: number;          // percent, e.g. 10 = +10% attack/cast/GCD speed
  // Ranged-only haste % from quiver/ammo pouch equip spells (SPELL_AURA_MOD_RANGED_AMMO_HASTE).
  // Cite: SpellAuras.cpp HandleRangedAmmoHaste.
  rangedHastePct?: number;
  dodgeChance?: number;    // base dodge chance (agi + class base) as 0..1
  parryChance?: number;
  blockChance?: number;
  /** Flat damage reduced on a successful block (Player::GetShieldBlockValue). Optional. */
  blockValue?: number;
  blockValuePct?: number;
  canBlock?: boolean; // has a shield equipped → can block incoming melee
  canParry?: boolean; // wields a weapon → can parry incoming melee
  // MH weapon skill for attack-table math (pure trained + MOD_SKILL bonuses).
  // Cite: Unit.h GetSkillMaxForLevel; Unit.cpp GetWeaponSkillValue.
  weaponSkill?: number;
  // Defense skill for attack-table math (pure + bonuses). Cite: Unit.cpp GetDefenseSkillValue.
  defenseSkill?: number;
  /** CMaNGOS skill id for MH weapon (Item::GetSkill). Used for skill gain. */
  weaponSkillId?: number;
  /** OH weapon skill id when dual-wielding. */
  offhandSkillId?: number;
  /** Ranged weapon skill id. */
  rangedSkillId?: number;
  // OH / ranged effective skill (trained + bonuses), falling back to weaponSkill when absent.
  // Cite: GetWeaponSkillValue(OFF_ATTACK / RANGED_ATTACK).
  offhandWeaponSkill?: number;
  rangedWeaponSkill?: number;
  // MOD_SKILL bonuses by skill line id, kept separate from pure combatSkills so a mid-fight gain
  // recomputes GetSkillValue = pure + bonus. Cite: Player.cpp ModifySkillBonus.
  skillBonuses?: Partial<Record<number, number>>;
  // Live combat skill map (pure trained values) for skill gain, mutated during the fight and
  // returned on CombatResult. Absent → pure L×5, with bonuses still stacking via skillBonuses.
  combatSkills?: Partial<Record<number, { current: number; max: number }>>;
  /** Intellect for UpdateCombatSkills weapon intellect bonus. */
  intellect?: number;
  // Player-controlled unit, which decides glance/crush eligibility and NPC skill-diff factors.
  // Absent → inferred from the combat side (player/pet/totem = true).
  isPlayerOrPet?: boolean;
  // Pet bar state the session opens with (pet spec only).
  // Absent = the summon default, COMMAND_FOLLOW + REACT_DEFENSIVE.
  petCommand?: 'attack' | 'follow' | 'stay';
  petReact?: 'aggressive' | 'defensive' | 'passive';
  // GuardianAI unit (IsPet && GUARDIAN_PET); follow parks at 1.5, not PET_FOLLOW_DIST.
  // Cite: GuardianAI.cpp:31, :76–81 Permissible.
  isGuardian?: boolean;
  /** UNIT_CREATED_BY_SPELL. GuardianAI.cpp:33–37 spell 11939 → follow 3. */
  createdBySpell?: number;
  // The unit that summoned this ally seat: marks the seat recyclable and keeps the body out of the
  // party-wipe test. Cite: SpellEffects.cpp AddGuardian.
  summonOwnerSide?: Side;
  // A creature-cast totem body (not one of the party's four slots): its health comes from the summon
  // spell and it unsummons with its owner. Cite: SpellEffects.cpp:4538; Totem.cpp:79-84.
  isTotem?: boolean;
  // Every ability the pet knows, autocast-off included; `spells` is only the enabled subset the AI
  // may pick, and a pet-bar press may still fire a disabled one. Cite: Pet.h PetSpellMap.
  petFullKit?: SpellDef[];
  // Dual-wield equipped: auto swings get +19% miss (not abilities or on-next-swing) and a second
  // OH swing timer runs. Cite: Unit.cpp CalculateEffectiveMissChance ~3767.
  dualWield?: boolean;
  // Active TEMP_ENCHANTMENT_SLOT imbues/poisons at pull (from Character.tempEnchants).
  // Cite: EffectEnchantItemTmp; Player::CastItemCombatSpell.
  tempEnchants?: Partial<Record<'mainhand' | 'offhand', ActiveWeaponImbue>>;
  // Preferred hand for mid-fight weapon_imbue casts, read by applySpellLate; omitted → mainhand.
  // Cite: SpellEffects.cpp EffectEnchantItemTmp itemTarget.
  weaponImbueCastHand?: 'mainhand' | 'offhand';
  // OOC damage shields (Lightning Shield) carried in, seeded from Character.activeAuras when the
  // spell has a damage_shield effect. Cite: SPELL_AURA_PROC_TRIGGER_SPELL.
  startDamageShields?: Array<{
    spellId: number;
    name: string;
    school: School;
    min: number;
    max: number;
    remainingMs: number;
    charges?: number;
    cooldownMs?: number;
  }>;
  /** OOC generic aura-42 proc triggers carried into combat. */
  startProcTriggers?: Array<{
    spellId: number;
    name: string;
    triggerSpellId: number;
    remainingMs: number;
    charges?: number;
    cooldownMs?: number;
    /** SpellDef.procFlags / spell_proc_event — deal vs take filtering. */
    procFlags?: number;
    /** spell_proc_event.ppmRate when present. */
    procPpm?: number | null;
    /** Flat 0..1 chance when present. */
    procChance?: number | null;
    // World/combat yards where the GO was placed (caster feet at arm).
    // Cite: SpellEffects.cpp EffectSummonObject GetClosePoint; GameObject trap Use.
    trapPosYd?: CombatPosYd;
  }>;
  // SPELL_AURA_ADD_TARGET_TRIGGER (109) talent passives, seeded onto Fighter.addTargetTriggers
  // until cancelled. Cite: Spell.cpp:7433–7468 ProcSpellAuraTriggers.
  startAddTargetTriggers?: Array<{
    spellId: number;
    triggerSpellId: number;
    chancePct: number;
    familyName: number;
    familyFlags: number;
  }>;
  // OOC school_absorb auras carried in from Character.activeAuras; the pool rolls once at fight
  // start, as an in-combat apply does. Cite: SPELL_AURA_SCHOOL_ABSORB; Unit.cpp ~2391; KI-181.
  startSchoolAbsorbs?: Array<{
    spellId: number;
    name: string;
    schoolMask: number;
    min: number;
    max: number;
    remainingMs: number;
  }>;
  // Speed auras a body carries with nothing running: the boots enchant and spent talent ranks
  // (Pursuit of Justice, Feline Swiftness in cat). Not effect rows — they never expire, never show
  // a buff icon and cannot be dispelled. UpdateSpeed buckets them by aura and takes the max of each,
  // so they can only replace a weaker source, never add to one. Cite: Unit.cpp:8352.
  permanentSpeedAuras?: Array<{ aura: number; pct: number }>;
  // Talent auras the shapeshift handler casts on form APPLY, keyed by form id, as a delta on the
  // form-free spec above. Feline Swiftness (cat), Sharpened Claws (cat/bear/dire), Defiance
  // (defensive stance). applyFormCombatEnter adds one row, clearFormCombatBonuses takes it back, so a
  // stance dance moves them live. Cite: SpellAuras.cpp:4296-4304 HandleShapeshiftBoosts.
  formTalentAuras?: Record<number, {
    crit: number;
    dodge: number;
    threatPctBySchool: Partial<Record<School, number>>;
    speedAuras: Array<{ aura: number; pct: number }>;
    stealthLevel: number;
    damagePctBySchool: Partial<Record<School, number>>;
    formThreatPct: number;
    attackPower?: number;
    health?: number;
  }>;
  // The mount this body is riding, absent when on foot. Its percent enters as aura 32 and swings
  // UpdateSpeed onto the mounted buckets (32/130/172). Cite: Unit.cpp:8345-8348; Unit::IsMounted.
  mount?: { speedPct: number };
  /** OOC HoT / OBS_MOD_HEALTH (KI-182; Fel Stamina 18790 pctOfMax — KI-833). */
  startRestoreHealth?: Array<{ spellId: number; name: string; amountPerTick: number; tickMs: number; remainingMs: number; pctOfMax?: number }>;
  /** OOC OBS_MOD_MANA Fel Energy 18792. Cite: Warlock.cpp DemonicSacrifice; KI-833. */
  startRestorePower?: Array<{ spellId: number; name: string; amountPerTick: number; tickMs: number; remainingMs: number; pctOfMax?: number; powerType?: number }>;
  // OOC mana_shield auras carried into combat (same import path as school_absorb).
  // Cite: SPELL_AURA_MANA_SHIELD; Unit.cpp ~2457.
  startManaShields?: Array<{
    spellId: number;
    name: string;
    schoolMask: number;
    min: number;
    max: number;
    manaMultiplier: number;
    remainingMs: number;
  }>;
  // Display/duration carry of OOC buffs; stats are already folded into CombatantSpec, so these only
  // seed buffActive and a duration row. `liveBuffs` and the immunity maps do apply combat state.
  startDisplayAuras?: Array<{
    spellId: number;
    name: string;
    remainingMs?: number;
    permanent?: boolean;
    /** Live buff mods to apply at pull (threat_mod, armor_pct, etc.). Reversed on expiry. */
    liveBuffs?: Array<{ mod: BuffMod; amount: number; school?: School }>;
    /** SPELL_AURA_MECHANIC_IMMUNITY (77) mechanic ids to grant at pull. */
    mechanicImmunities?: number[];
    /** SPELL_AURA_DISPEL_IMMUNITY (41) DispelType ids to grant at pull (Stoneform poison). */
    dispelImmunities?: number[];
    /** Remaining SpellEntry.procCharges. Cite: SpellAuras.cpp DropAuraCharge. */
    charges?: number;
    /** SpellDef.procFlags so take-hit consume matches without the holder in spec.spells. */
    procFlags?: number;
    // Sheet-baked buff mods (armor / AP) already in CombatantSpec, seeded as reverseable rows
    // without applyBuffMod so the last-charge reverse subtracts the sheet.
    chargedSheetBuffs?: Array<{ mod: BuffMod; amount: number; school?: School }>;
    // A party AREA aura (effect 35): its sheet-baked mods seed as reversible rows, since a sibling
    // rank or the holder's remove arm can take it mid-fight. Cite: SpellAuras.cpp:591-620.
    sheetBuffs?: Array<{ mod: BuffMod; amount: number; school?: School }>;
    exclusionGroup?: number;
    stackIdent?: AuraStackIdentity;
  }>;
  // OOC next_cast_mod (Presence of Mind, Nature's Swiftness, Cold Blood) armed into combat.
  // durationMs 0 = until-consumed; combat uses 600s when bake duration is 0. Cite: KI-540.
  startPendingSpellMod?: {
    spellId: number;
    name: string;
    appliesTo: 'any' | 'nature' | 'heal' | 'summon' | 'curse';
    critAdd?: number;
    instant?: boolean;
    freeCost?: boolean;
    /** SPELLMOD_COST % on resolved cost. Prefer costModPct; costPct kept for buildCombatant. */
    costModPct?: number;
    /** @deprecated Use costModPct — not SpellDef.costPct / ManaCostPercentage. */
    costPct?: number;
    /** SPELLMOD_COST flat. Cite: SpellDefines.h SPELLMOD_COST=14. */
    costFlat?: number;
    effectPct?: number;
    castTimeFlat?: number;
    /** Source SpellFamilyName — consume only same-family casts. Cite: Player.cpp:354. */
    spellFamilyName?: number;
    /** EffectItemType mask; 0 = family-name only. Cite: Player.cpp:350–357. */
    familyFlags?: number;
    /** The holder's 107/108 rows. Cite: spellModIntents.chargedSpellModsFromSpell. */
    rows?: readonly OwnedSpellMod[];
    remainingMs: number;
  };
  // OOC Sweeping Strikes (12292) carried into combat: remaining charges + duration.
  // Cite: UnitAuraProcHandler.cpp:810–841; applySpellLate sweeping_strikes.
  startSweepingStrikes?: {
    spellId: number;
    name: string;
    charges: number;
    remainingMs: number;
  };
  // OOC Combustion (11129) carried into combat: fire crits left plus the stacks already up.
  // Cite: UnitAuraProcHandler.cpp:991-1003; applySpellLate combustion.
  startCombustion?: {
    spellId: number;
    name: string;
    charges: number;
    stacks: number;
    remainingMs: number;
  };
  // OOC Vampiric Embrace (15286) pct carried into combat.
  // Cite: UnitAuraProcHandler.cpp:1015–1028; applySpellLate vampiric_embrace.
  startVampiricEmbrace?: {
    spellId: number;
    name: string;
    pct: number;
    remainingMs: number;
  };
  /** OOC paladin seal → ActiveSeal + buff chip. Cite: activeSeal.ts; KI-894. */
  startActiveSeal?: StartActiveSeal;
  // OOC school_immunity auras carried in from Character.activeAuras; createSession grants the live
  // ImmunityState via grantImmunityAura. Cite: SpellAuras HandleAuraModSchoolImmunity; KI-086.
  startSchoolImmunities?: Array<{
    spellId: number;
    name: string;
    schoolMask: number;
    remainingMs: number;
    positive?: boolean;
    /** The spell's own mechanic id, so a carried-in Divine Shield stays unpierceable. */
    mechanic?: number;
  }>;
  // Per-school magic resistance; absent or 0 = no mitigation. Reduces incoming magic damage and
  // raises the chance to fully resist a crowd-control land.
  resistances?: Partial<Record<School, number>>;
  // CREATURE_TYPE for CC immunity: Polymorph lands only on Humanoid/Beast/Critter, Turn Evil only on
  // Undead/Demon, undead mobs are fear-immune. Absent = treated as Humanoid.
  creatureType?: number;
  // creature_template.RegenerateStats — REGEN_FLAG_POWER_IN_COMBAT 0x4 gates the creature mana
  // tick. Absent means the default 14 every other row carries. Cite: Creature.cpp:1803-1808.
  regenerateStats?: number;
  // creature_template.entry when this combatant is spawned from a creature, so scripted effects key
  // off it (Demonic Sacrifice picks its self-buff by demon entry). Absent on player specs.
  creatureEntry?: number;
  /** creature.MovementType = GetDefaultMovementType(); absent = unknown, not idle. Cite: naxxramas.cpp:995 */
  movementType?: number;
  // Who this unit is for its whole life in the instance, minted by the world and never re-minted on
  // inject; the side is a recycled slot, not an identity. Cite: liveAggroStream.ts:301-318.
  guid?: number;
  // The seat this companion's pet occupies, stamped once at session build from
  // `CombatConfig.allyPetIndex`. Not `summonOwnerSide`, which points the other way.
  petSide?: Side;
  // UNIT_FIELD_COMBATREACH in yards; melee contact sums both bodies' reach plus 1.33, floored at 5,
  // so Onyxia 23.4 is meleeable from 26.2 yd. Cite: Object.cpp:1741-1758 GetCombinedCombatReach.
  combatReachYd?: number;
  // creature_template.UnitClass (1 warrior, 2 paladin, 4 rogue, 8 mage) — the key
  // creature_template_classlevelstats uses for creature-level spell scaling. Cite: Object.cpp:3005.
  unitClass?: number;
  // creature_template.ExtraFlags. AGGRO_ZONE (512) → SetInCombatWithZone on enter combat.
  // Cite: Creature.h CREATURE_EXTRA_FLAG_AGGRO_ZONE; Unit.cpp:7986–7988.
  extraFlags?: number;
  // creature_template.StaticFlags: UNKILLABLE 0x8 clamps damage to 1 HP, SESSILE 0x100 cannot close,
  // LARGE_AOI 0x80000000 widens visibility. Cite: CreatureDefines.h CreatureStaticFlags.
  staticFlags?: number;
  // creature_template.StaticFlags2. NO_CRUSHING_BLOWS (0x10) gates crush.
  // Cite: CreatureDefines.h CreatureStaticFlags2; Unit.cpp:3109.
  staticFlags2?: number;
  // creature_template.SpeedRun, the rate a creature multiplies onto the 7 yd/s base; 8793 of 10384
  // templates carry 1.14286 = 8 yd/s. Cite: Creature.cpp:2857 SetBaseRunSpeed; Unit.cpp:8409.
  speedRun?: number;
  // Current map id for CheckCast gates that key off GetMapId() (AQ40 mounts require 531).
  // Cite: Spell.cpp:5762–5775.
  mapId?: number;
  // Mutable string-key flags for one-shot CheckCast bookkeeping (e.g. Screecher Spirit hit).
  // Cite: Spell.cpp Summon Screecher Spirit already-hit gate.
  flags?: Record<string, boolean>;
  // ScriptDev UpdateEntry morph targets resolved at spec build time; `update_entry` swaps name, max
  // health (refilled), armor and weapon. Cite: boss_dathrohan_balnazzar.cpp UpdateEntry.
  scriptDevMorphs?: Array<{
    creatureEntry: number;
    name: string;
    maxHealth: number;
    armor?: number;
    weapon?: WeaponProfile;
  }>;
  // When present, combat uses the creature cast scheduler instead of class-heuristic pickAction.
  // Absent → bare spells[] still get a synthetic schedule so trash can cast.
  creatureCasts?: CreatureCastEntry[];
  // Top-level creature_spell_list schedule, armed as TIMER_IN_COMBAT slots on the creatureCasts
  // scheduler. Cite: UnitAI.cpp AddInitialCooldowns / UpdateSpellLists.
  spellList?: CreatureSpellListEntry[];
  // EventAI bundle; the combat interpreter runs non-CAST actions (SET_PHASE / SPAWN / SUMMON_ID /
  // FLEE) and phase-gates casts. Absent → cast-only path. Cite: CreatureEventAI.
  ai?: CreatureAiBundle;
  /** creature_template.SchoolImmuneMask — (1 << school). */
  schoolImmuneMask?: number;
  /** creature_template.MechanicImmuneMask — (1 << (mechanic-1)). */
  mechanicImmuneMask?: number;
  // creature_template.UnitFlags as spawned. STUNNED / PACIFIED seed the fighter's own timers, so a
  // Target Dummy stands there instead of swinging. Cite: Unit.h:483-485.
  spawnUnitFlags?: number;
  // creature_immunities set 0 (effect ids / aura-type ids / dispel mask), applied at spawn.
  // Cite: Creature.cpp:613 UpdateImmunitiesSet(0).
  immunities?: CreatureImmunitySet;
  // SPELL_AURA_MOD_MECHANIC_RESISTANCE (117) totals by mechanic id, added to the one SpellHitResult
  // resist chance. Cite: Unit.cpp:4015–4031; KI-823.
  mechanicResistPct?: Partial<Record<number, number>>;
  /** CLASSMASK_WAND_USERS glance-chance special (pre-30 curve). Cite: Unit.cpp:3310. */
  wandUser?: boolean;
  /** Caster glance amount bases (CLASSMASK_WAND_USERS). Cite: Unit.cpp:3349. */
  casterGlance?: boolean;
  // Talent-driven (Phase C): school damage % (e.g. +fire damage), extra crit, and procs.
  // Absent values mean no change from baseline (pre-talent bakes unaffected).
  damagePctBySchool?: DamagePctBySchool;
  critChanceBonus?: number; // flat percentage points to add to critChance (e.g. 5 for +5%)
  procs?: ProcDef[];
  // Gear procs (ItemDef.procs) collected at buildCombatant time for the on-hit/on-equip engine (E1).
  gearProcs?: Array<{
    spell: number;
    trigger: number;
    chancePct?: number;
    ppm?: number;
    flags?: number;
    procEx?: number;
    cooldownMs?: number;
    schoolMask?: number;
    spellFamilyName?: number;
    spellFamilyMask?: number[];
  }>;
  // Advertised generic spell damage, read only when the spell has effectBonusCoefficient*; absent
  // or 0 leaves the baked min/max path unchanged. Cite: Unit.cpp SpellBaseDamageBonusDone ~7129.
  spellPower?: number;
  // Per-school flat +spell damage; benefit = spellPower + spellDamageBySchool[school].
  // Cite: Unit.cpp SpellBaseDamageBonusDone mask ∩ school.
  spellDamageBySchool?: Partial<Record<School, number>>;
  // Flat +healing done (SIE healing_power / equipMods healing_done).
  // Cite: SpellAuras.cpp HandleModHealingDone; KI-590.
  healingPower?: number;
  // SPELLMOD_RADIUS (op 6) mods this unit owns, read by `effectiveAreaRadiusYd` for every area aura
  // and totem it owns. Cite: SpellAuras.cpp:307–309; Spell.cpp:7550.
  radiusSpellMods?: SpellMod[];
  // Lasting SPELL_AURA_ADD_*_MODIFIER owned at pull; charged next-cast auras stay on
  // startPendingSpellMod. Cite: Player.cpp AddSpellMod.
  startOwnedSpellMods?: OwnedSpellMod[];
  spells: SpellDef[];
  items?: CombatItem[]; // consumables usable mid-fight (health/mana potion, healthstone, mana gem)
  // Live bag counts for CheckItems / TakeReagents, decremented into itemsConsumed on a successful
  // cast; absent on NPCs without bags. Cite: Spell.cpp CheckItems ~6560; TakeReagents ~4332.
  bagItemCounts?: Record<number, number>;
  /** Paperdoll item entries. Rotation `itemEquipped` reads this; absent → 0. */
  equippedItemEntries?: readonly number[];
  /** Active shapeshift form id at fight start (0 / absent = humanoid). */
  form?: ShapeshiftFormId;
  // Parallel mana pool for Druid multi-power: mirrors startPower when the active power is mana,
  // else holds the mana bar for form costs and the dual-bar UI.
  mana?: number;
  maxMana?: number;
  /** Base/create mana for ManaCostPercentage form costs (player_classlevelstats.basemana). */
  createMana?: number;
  // Base/create health for POWER_HEALTH ManaCostPercentage (player_classlevelstats.basehp).
  // Cite: Spell.cpp CalculatePowerCost POWER_HEALTH (Bloodrage).
  createHealth?: number;
  /** Gear weapon speed (ms) before any form override — restored on leave form. */
  baseWeaponSpeedMs?: number;
  /** Gear weapon min damage before any form override — restored on leave form. */
  baseWeaponDmgMin?: number;
  /** Gear weapon max damage before any form override — restored on leave form. */
  baseWeaponDmgMax?: number;
  // Start the fight already stealthed. `spellId` is the aura that granted it, and without it
  // breakStealth cannot fade the chip seedDisplayAuras put on the frame.
  stealth?: { spellId?: number; strength: number; levelBonus?: number; breakFlags?: number };
  /** Passive MOD_STEALTH_LEVEL when not bundled into stealth.levelBonus. */
  stealthLevelBonus?: number;
  /** Detector strength on this unit (Perception etc. if pre-applied). */
  stealthDetectStrength?: number;
  // Spirit for OCT mana regen; absent → no combat mana regen.
  // Cite: Player::UpdateManaRegen / OCTRegenMPPerSpirit.
  spirit?: number;
  /** Flat MP5 from gear/auras (SPELL_AURA_MOD_POWER_REGEN total over 5s). */
  mp5?: number;
  // SPELL_AURA_MOD_MANA_REGEN_INTERRUPT percent (0–100).
  // Classic baseline 0 → the 5SR window allows only mp5.
  manaRegenInterruptPct?: number;
  // Product of (100+amount)/100 over OOC SPELL_AURA_MOD_POWER_REGEN_PERCENT (110) auras; default 1.
  // Cite: StatSystem.cpp:551–552; KI-424.
  manaRegenPctMult?: number; healthRegenDuringCombatPct?: number; // aura116 KI-898
  // Product of (100+amount)/100 over SPELL_AURA_MOD_HEALTH_REGEN_PERCENT (88) auras; default 1.
  // OOC only, exactly as the C++ gates it. Cite: Player.cpp:2393-2398.
  healthRegenPctMult?: number;
  // GetResistancePenetration per school (positive values); physical → armor pen, magic → resist pen.
  // Cite: Unit.cpp GetResistancePenetration ~3890.
  resistancePenetration?: Partial<Record<School, number>>;
  // SPELL_AURA_MOD_MELEE_ATTACK_POWER_VERSUS (102) — flat AP vs a creature-type mask, applied in
  // MeleeDamageBonusDone as APbonus rather than sheet AP. Cite: Unit.cpp:7476.
  attackPowerVersus?: Array<{ creatureTypeMask: number; amount: number }>;
  // SPELL_AURA_MOD_RANGED_ATTACK_POWER_VERSUS (131). Cite: Unit.cpp:7471.
  rangedAttackPowerVersus?: Array<{ creatureTypeMask: number; amount: number }>;
  // SPELL_AURA_MOD_FLAT_SPELL_DAMAGE_VERSUS (180). Cite: Unit.cpp:7055.
  spellDamageVersus?: Array<{ creatureTypeMask: number; amount: number }>;
  // SPELL_AURA_MOD_DAMAGE_DONE_VERSUS (168) — whole-percent multiplier vs a creature-type mask.
  // Cite: Unit.cpp:7058, :7503.
  damageDoneVersusPct?: Array<{ creatureTypeMask: number; amount: number }>;
  // SPELL_AURA_MOD_DAMAGE_DONE_CREATURE (59) — flat melee DoneFlat vs a creature-type mask; the
  // spell path folds the same rows into spellDamageVersus. Cite: Unit.cpp:7465; KI-1043.
  damageDoneCreature?: Array<{ creatureTypeMask: number; amount: number }>;
  // SPELL_AURA_MOD_CRIT_PERCENT_VERSUS (169) — whole percent onto the crit multiplier vs a
  // creature-type mask. Cite: Unit.cpp:3555-3563.
  critDamageVersusPct?: Array<{ creatureTypeMask: number; amount: number }>;
  // SPELL_AURA_MOD_OFFHAND_DAMAGE_PCT (122) — whole percent onto the 0.5 off-hand TOTAL_PCT.
  // Cite: SpellAuras.cpp:4175-4184.
  offhandDamagePct?: number;
  // Victim-side attacker-chance auras (185-188), signed percentage points as the DBC ships them.
  // Cite: Unit.cpp:3525-3528, :3794, :3874.
  attackerMeleeCrit?: number;
  attackerRangedCrit?: number;
  attackerRangedHit?: number;
  /** Aura 186 is mask-bearing, so it is kept per school like its crit twin (179). */
  attackerSpellHitBySchool?: Partial<Record<School, number>>;
  /** OVERRIDE_CLASS_SCRIPTS (112) misc values the sheet carries. Cite: Unit.cpp:11969-11985. */
  overrideScriptIds?: readonly number[];
  // SPELL_AURA_MOD_THREAT multipliers by school (default 1), multiplied with formThreatPct in
  // ApplyTotalThreatModifier. Cite: Unit.cpp ~8626; SpellAuras.cpp HandleModThreat.
  threatModifierBySchool?: Partial<Record<School, number>>;
  // Player-state snapshot for the conditions evaluator, captured at fight start by game.ts.
  // Absent (mobs/tests) → those condition types fail closed. Cite: Conditions.cpp Meets.
  conditionCtx?: {
    /** Reputation rank (0–7) by faction id, precomputed for every baked faction. */
    reputationRanks?: Record<number, number>;
    /** Base skill value by skill line id (professions + weapon/defense). */
    skillValues?: Record<number, number>;
    /** Game event ids active at fight start (GameEventMgr::IsActiveEvent). */
    activeEvents?: number[];
    /** Holidays.dbc ids active at fight start (GameEventMgr::IsActiveHoliday). */
    activeHolidays?: number[];
    /** SharedDefines.h Team: ALLIANCE=469 / HORDE=67. */
    team?: number;
    /** HonorRankInfo.rank 0..18. Cite: Conditions.cpp:236-243 CONDITION_PVP_RANK. */
    pvpRank?: number;
    /** GetVariable map. Cite: Conditions.cpp:496 WORLDSTATE. */
    worldStates?: Record<number, number>;
  };
}

/** A consumable the player can use mid-fight (restore potion or self buff). Built from ItemDef.useInCombat / useBuff / useSpell. */
export interface CombatItem {
  entry: number;
  name: string;
  /** Real ItemDef.icon basename for UI (action bar / combat strip). */
  icon?: string;
  // Rank-ladder key (domain/items/consumableFamily.ts) and this rung's itemLevel, stamped by
  // `combatItems`. A family row resolves against these; the session holds no DataStore.
  family?: string;
  rank?: number;
  effect:
    | { kind: 'restore_health' | 'restore_power'; min: number; max: number; powerType?: number }
    // Buff consumable (elixir / flask / scroll / drink / on-use trinket). mod+amount is the PRIMARY
    // mod only; a multi-effect item rides its SpellDef so itemUse casts it whole via castOnTargets.
    | { kind: 'apply_buff'; mod: BuffMod; amount: number; durationMs: number; spellId?: number; spell?: SpellDef }
    // A thrown/offensive item (grenades, Tidal Charm, Slumber Sand), carrying the resolved SpellDef so
    // the session routes it through `castOnTargets` — AoE fan, resists, immunities and threat for free.
    | { kind: 'hostile_cast'; spellId: number; spell: SpellDef }
    // A defensive on-use whose payload is an immunity or a cleanse rather than a stat buff: Free
    // Action Potion 5634, Living Action Potion 20008, PvP Insignia 23273/23274/23276/23277.
    | { kind: 'friendly_cast'; spellId: number; spell: SpellDef };
  cooldownMs: number;
  // item_template.spellcategory_N — shared category cooldown (bombs=24, potions=4), honoured via
  // Fighter.categoryCooldowns so throwing one grenade locks the whole category.
  category?: number;
  /** item_template.spellcategorycooldown_N (ms). Bombs: 60000. */
  categoryCooldownMs?: number;
  count: number; // how many are carried into the fight
  // Gear whose use never costs a UNIT: spellcharges_1 == 0 (unlimited) or positive (runs out, item
  // kept). Set by combatItems from that column, never from equippability.
  reusable?: boolean;
  // Charges left on THIS unit (|spellcharges_1| when the row has one). Absent = not charge-based; at 0
  // the item refuses instead of firing. Cite: Spell.cpp:6462 NO_CHARGES_REMAIN; spendKitItem below.
  charges?: number;
  // An on-use that can fail on the user instead of firing: Goblin Rocket Boots roll 8893 and are
  // destroyed into `destroysInto`. Cite: domain/items/rocketBoots.ts.
  malfunction?: { chancePct: number; spell: SpellDef; destroysInto: number };
}

// One kit item, one use: the charge counter drops first, and the UNIT goes only when a destroy-at-zero
// row runs out. `reusable` gear never loses a unit. Cite: Spell.cpp:4209 TakeCastItem.
export function spendKitItem(it: CombatItem, spentMap: Map<number, number>): void {
  if (it.charges != null) {
    it.charges = Math.max(0, it.charges - 1);
    if (it.charges > 0 || it.reusable) return;
  } else if (it.reusable) {
    return;
  }
  it.count -= 1;
  spentMap.set(it.entry, (spentMap.get(it.entry) ?? 0) + 1);
}

/** The player's chosen action for a tick: a spell id, a dest-bearing ground cast, an item use, or nothing. */
export type CombatAction =
  | number
  | {
    spell: number;
    dest?: CombatPosYd;
    after?: RuleAfter;
    // Cast at a living hostile that is not the focus and is not already CC'd (sheep the second
    // mob). No such hostile ⇒ skip the spell.
    offTarget?: boolean;
    // Aim a friendly cast at this ally instead of letting triage pick. Ignored for hostile spells,
    // and dropped if that unit is dead or out of the caster's friendly pool.
    ally?: CombatantId;
  }
  | { item: number; target?: CombatantId }
  | null;

// Ally pick for a tick: spell id, item use, or null. `lowestAlly: true` targets the lowest-HP
// living friendly, the same semantics as the player's item-rule `lowest_ally` selector.
export type AllyCombatAction =
  | number
  // `offTarget: true` casts at a living hostile that is not this unit's focus and is not already
  // crowd-controlled; no such hostile ⇒ the rule is skipped rather than redirected onto the focus.
  | {
    spell: number;
    after?: RuleAfter;
    offTarget?: boolean;
    ally?: CombatantId;
    dest?: CombatPosYd;
    creatureEntry?: number;
    role?: 'tank' | 'healer' | 'damage';
    /** RuleSpellTarget `{ priority }` — first living of these creature_template.entry ids. */
    priority?: readonly number[];
    /** RuleSpellTarget `{ allyMissingAura }` — nearest living friendly not holding this aura. */
    allyMissingAura?: number;
    /** RuleSpellTarget `{ lowestHp }` — pin the lowest-HP living friendly. */
    lowestAlly?: boolean;
    /** `{ lowestHp, among }` / `{ allyMissingAura, among }` — narrow to role / class / one seat. */
    among?: AllyFilter;
  }
  | { item: number; target?: CombatantId; lowestAlly?: boolean; among?: AllyFilter }
  // A mechanic run-out. `altSpell` is what the rotation would have cast without that row, fired
  // only when it is instant, because movement cancels a cast with time left on it.
  | { move: RuleMove; altSpell?: number }
  | { haltDps: true; school?: HaltDpsSchool; entries?: readonly number[] }
  | { useObject: number }
  | null;

// Which O(roster) snapshot fields a provider's rotation can actually read, stamped on the closure
// at build time so allySnapshot skips a row this unit never reads. Absent ⇒ assume everything.
export interface ProviderNeeds {
  /** metric `nearbyAlliesBelowHpCount` → allyDistHp */
  allyDistHp: boolean;
  /** metric `allyLowestBuffPresent` → allyTriageBuffs */
  allyTriageBuffs: boolean;
  /** any condition with `subject: 'ally'` → allySubject (one aura walk per filter per tick) */
  allySubject: boolean;
  /** metric `charmedHostileCount` */
  charmedHostileCount: boolean;
  /** metric `enemiesWithinYd` with subject `target` → enemyDistsFromTarget */
  enemyDistsFromTarget: boolean;
  /** metric `enemiesWithinYd` on self → enemyDists (PBAoE density at the caster) */
  enemyDists: boolean;
  /** metric `enemyHealersWithinYd` → enemyHealerDists */
  enemyHealerDists: boolean;
  /** metric `hasAggro` */
  hasAggro: boolean;
  /** metric `enemyCastingOnAlly` — walks the hostiles' threat tables, so it is opt-in */
  enemyCastingOnAlly: boolean;
  /** metric `enemyCastingOnSelf` — same walk, vid === acting unit */
  enemyCastingOnSelf: boolean;
  /** any `kind: 'item'` rule — allySnapshot still fills itemCounts when set */
  items: boolean;
  /** metric `hazardProximityYd` → nearest ground-pool edge yards */
  groundPools: boolean;
  /** metric `inTargetCone` → the target's facing arc test */
  targetCone: boolean;
  /** RuleSpellTarget `{ creatureEntry }` / hostileCreatureEntries snapshot */
  hostileCreatureEntries: boolean;
  // metric `canAfford` → price the acting unit's whole kit. O(kit) per pick, so it stays opt-in the
  // way enemyCastingOnAlly does: no rotation naming the metric, no walk.
  spellCosts: boolean;
  /** metric `dispellablePresent` — walks the friendly and hostile pools for a cure/purge */
  dispellablePresent: boolean;
  /** metric `castingPresent` on subject `target` — walks hostiles for an interruptible add bar */
  kickableCastPresent: boolean;
  /** metric `aggroHolderDebuffPresent` / `aggroHolderDebuffStacks` — tank-swap chips */
  aggroHolder: boolean;
}

// A per-ally combat brain: given a rotation snapshot it returns a spell id, an item use, or null.
// Composed in engine/game.ts as a closure over the editable Rotation. Must be pure — no rng, no clock.
export type AllyActionProvider = ((snap: RotationSnapshot) => AllyCombatAction) & {
  needs?: ProviderNeeds;
  // Arm school halt before evaluate. pickAction sets `f.haltDpsSchool` from this so `usableSpell`
  // can refuse the wrong school while a lower rule still casts.
  peekHalt?: (snap: RotationSnapshot) => {
    school: HaltDpsSchool;
    entries?: readonly number[];
  } | null;
  /** Arm kill-order before evaluate. pickAction retargets DPS onto the first living entry. */
  peekKillOrder?: (snap: RotationSnapshot) => readonly number[] | null;
  /** Spell ids this rotation's keep_aura rows forbid auto-dispelling. */
  keepAuraIds?: ReadonlySet<number>;
};

// One `spell_script_target` gameobject an ACTIVATE_OBJECT spell lights, already resolved.
// Cite: Spell.cpp:2599-2615 CheckScriptTargeting; GameObject.cpp:1513-1532 GAMEOBJECT_TYPE_TRAP Use.
export interface SpellTrapSite {
  /** The ACTIVATE_OBJECT spell. */
  spellId: number;
  /** The gameobject it names. */
  goEntry: number;
  /** inverseEffectMask: a SET bit means that effect slot may NOT hit this object. */
  inverseEffectMask: number;
  /** trap.spellId payload, already through resolveCombatSpell. */
  spell: SpellDef;
  cooldownMs: number;
  durationMs: number;
  /** The object's own spawn, in COMBAT yards. */
  origin: CombatPosYd;
}

export interface CombatObjectTrap {
  /** The GO a raider clicks. */
  goEntry: number;
  /** buddyEntry the command activates - the trap that fires. */
  buddyEntry: number;
  /** trap.spellId payload, already through resolveCombatSpell. */
  spell: SpellDef;
  /** trap.cooldown re-arm. GameObject.cpp:1532 defaults to 4 s when the field is 0. */
  cooldownMs: number;
  /** How long the activated trap stays live. */
  durationMs: number;
  /** Trap position in COMBAT yards; absent falls back to the clicker's own spot. */
  origin?: CombatPosYd;
}

// Values the game layer supplies WITH each tick, because a sim on another thread cannot reach back for
// them mid-step (PERF-RUNSHEET S6b mechanism 2). An omitted call keeps the last set given.
export type SimTickInputs = {
  // Bag entries worth clicking THIS tick. A dark gnomeface button is present but inert and only the
  // game layer knows which. Undefined = every bag entry is actionable. Cite: instance_gnomeregan.cpp:264.
  actionableObjects?: ReadonlySet<number>;
  // Quest entries the player's log currently holds as 'active'. A ScriptDev spell-hit row gated on
  // `requireQuestIncomplete` reads this. Undefined = no log, and such a row stays shut.
  activeQuests?: ReadonlySet<number>;
  // Per-ally companion knobs, keyed by side. The provider used to read these off a LIVE companion ref
  // it closed over; a worker cannot hold one, so they ride in. Cite: PERF-RUNSHEET S6b.
  companionKnobs?: ReadonlyMap<string, { aoeMode: number; offHeal: boolean }>;
};

export interface CombatConfig {
  tickMs?: number;
  sitting?: boolean;
  maxMs?: number;
  // A killing blow on either duelist floors HP at 1 and ends the fight instead of killing; a pet is
  // TYPEID_UNIT with no duel pointer and dies normally. Cite: Unit.cpp:966-978 DealDamage.
  duel?: boolean;
  // Per-ally action providers, index-aligned with `allySpecs`. A missing or null slot falls back to
  // the role-branched heuristics for that ally; solo sessions ignore this.
  allyActionProviders?: readonly (AllyActionProvider | null | undefined)[];
  // The player's own rotation, for the ticks the engine drives them: same closure type and
  // evaluator as an ally's. Absent → the engine heuristics.
  playerActionProvider?: AllyActionProvider | null;
  // Per-enemy action providers, index-aligned with `enemySpecs`. A missing or null slot keeps the
  // class heuristics for that body; absent → never consulted.
  enemyActionProviders?: readonly (AllyActionProvider | null | undefined)[];
  // Companion → pet mapping, index-aligned with the human companions in `allySpecs`: the ally index
  // of that companion's pet, or null when they have none. Pet allies themselves are not listed.
  allyPetIndex?: readonly (number | null | undefined)[];
  // SPELL_ATTR_SCALES_WITH_CREATURE_LEVEL multiplies a creature-cast amount by BaseDamage(caster) /
  // BaseDamage(spell); absent means creature spells keep their baked numbers. Cite: Object.cpp:3005.
  creatureBaseDamageAt?: (level: number, unitClass: number) => number | undefined;
  // The rank ladder (2,212 baked rows) that aura identity needs: a higher rank of the same chain
  // refuses the apply, a different rank replaces its sibling. Cite: Unit.cpp:5014-5017.
  spellChainOf?: (spellId: number) => { first: number; rank: number } | undefined;
  // Spell 1604 Dazed, the -50% snare an NPC white hit from behind lands on a player; absent = no
  // daze. Cite: Unit.cpp:2227 CastSpell(victim, 1604); :3124 CanDazeInCombat.
  dazeSpell?: SpellDef;
  // `SpellEntry.AuraInterruptFlags` by spell id (582 of 22,374 rows), needed because a live holder
  // is an `effects` row with a spell id, not a SpellDef. Cite: Unit.cpp:5197.
  auraInterruptFlagsOf?: (spellId: number) => number;
  // The global spell store, so a triggered payload resolves by id instead of by membership in the
  // caster kit. Cite: Unit.cpp:1447-1449 sSpellTemplate.LookupEntry.
  spellOf?: (id: number) => SpellDef | undefined;
  /** Seeded remainings (ms) at the start of this session (t=0) for persisting long CDs across fights / from OOC. */
  initialSpellCooldowns?: Record<number, number>;
  initialCategoryCooldowns?: Record<number, number>;
  // Encounter distance (yards) for the stealth detect formula on pull; absent = skip detect. Legacy
  // single-distance EVENT_T_RANGE fallback. Cite: ObjectVisibility.cpp GetStealthVisibilityDistance.
  encounterDistanceYd?: number;
  // Per-combatant yards from pull origin: pairwise EVENT_T_RANGE, rangeMax, AoE fan, pool radius.
  // Seeded from the pack layout, never RNG. Cite: docs/dungeons/PACK-COMBAT-VISION.md §7.
  unitPositionsYd?: UnitPositionsYd;
  // PvP match session: deaths bench units but NEVER end it — only `maxMs` or the caller does.
  // Pair with `reviveUnit` for graveyard cycles.
  endless?: boolean;
  // `Map::IsDungeon()`, supplied by the caller. Gates far-evade despawn: outdoors a mob dragged
  // 150 yd from home despawns, in a dungeon it walks back. Cite: HomeMovementGenerator.cpp:52-62.
  dungeonMap?: boolean;
  // `Map::IsBattleGround()` — gates only the stealth detect cadence (500 ms vs 2000 ms).
  // Absent = world/dungeon. Cite: Player.cpp:1546.
  battlegroundMap?: boolean;
  // RTS hand mode: friendly AI gap-close may only move within this radius of the unit's anchor,
  // and beyond it walks back. Enemies unaffected. Absent → dungeon chase behaviour.
  friendlyHoldYd?: number;
  // The party bubble: a friendly with no target inside `acquireRangeYd` walks back to the player
  // until it is this close (sessionFollow.ts advancePartyFollow). Also caps how far a TANK's peel
  // scan may look for a mob eating someone else (sessionFocus.ts:180).
  partyFollowYd?: number;
  // Local target acquisition (BG + endless): auto-acquire only hostiles within this many yards,
  // nearest first. Product 45; absent → full-list, order-first. Cite: World.cpp visibility floor 45.
  acquireRangeYd?: number;
  // BG: a hard-CC'd unit with an idle action auto-pops a bag item whose immunity cancels the control
  // (PvP Insignia / Free Action Potion), the same CheckCasterAuras exemption. Absent → manual only.
  autoRescueItems?: boolean;
  /**
   * The enemy side is a TEAM of player-shaped seats (an arena match), not a mob pack, so its seats
   * pick a target the way the player faction does — `preferFocusHostile`, healers first — instead of
   * off the creature threat list. Absent → threat, which is what every dungeon and raid pull wants.
   * Measured at 3v3 without it: side A put 42% of its damage on the enemy HEALER and side B only
   * 18%, and B's healer died first in 4 of 5 mirrors (`repro-arena-seat-gap.mjs`).
   */
  enemiesAreATeam?: boolean;
  /**
   * DEV ONLY. Pass a Map and `allySnapshot` stores the last snapshot it built for each side — the
   * only way to read a NON-LEAD or enemy-side seat's rotation CONDITION values. The seat's CAST
   * gates are `session.abilitiesFor(side)`, which is a different question. Absent, nothing is
   * written and a normal fight pays one branch. Cite: arena-setup-wars.md §W11 link 1.
   */
  snapshotCapture?: Map<string, unknown>;
  // Which frame `unitPositionsYd` live in, set by the product seeder from the layout it produced.
  // Absent means `pull-local`, which forbids a renderer pinning offsets to world coordinates.
  geometryAnchor?: PullGeometryAnchor;
  // Motion clamps to the walkable surface but never runs A*: one `isWalkable` per unit per tick,
  // at the price of a greedy wall-slide that `noProgressStuck` gives up on after 1 s.
  navClampOnly?: boolean;
  // Hostile casts require `losClear`. Default false, so a false LOS reading cannot freeze a
  // dungeon pull.
  navLos?: boolean;
  // Whether this pull sits under open sky, gating SPELL_ATTR_ONLY_OUTDOORS. Absent means outdoors,
  // as TerrainInfo::IsOutdoors does. Cite: Spell.cpp:4604-4612; GridMap.cpp:892-903.
  outdoors?: boolean;
  // AttackStart-equivalent: put the player on every enemy threat list at t=0. Default false, so a
  // mob you have not touched does not move; the endless floor forces it false.
  seedAttackStart?: boolean;
  // Team match (arena): an enemy whose threat list empties re-opens on the nearest living hostile
  // instead of standing down. Default false — a CREATURE with an empty list is meant to stand down
  // and walk home. Cite: sessionFocus.ts reacquireEmptyThreat.
  reacquireOnEmptyThreat?: boolean;
  // GameObject entries present in this fight, one slot per baked spawn; a `use_object` rotation
  // click consumes one matching entry. Cite: dungeonGameObjects.
  combatObjects?: readonly number[];
  // Bag entries a click does not spend: a button resets to its default state instead of despawning,
  // so Thermaplugg's six faces stay pressable all fight. Cite: GameObject.cpp:1458.
  combatObjectsReusable?: readonly number[];
  // The main-thread supplier of `SimTickInputs`, called ONCE at the top of each step. Off-thread the
  // caller passes the same shape to `tick(action, inputs)` instead; exactly one of the two exists.
  tickInputs?: () => SimTickInputs;
  // Where each bag entry stands in combat yards, so a clicker walks to it instead of pressing it
  // from across the room. Absent = no site, and the click needs no walk.
  combatObjectSites?: readonly { goEntry: number; origin: CombatPosYd }[];
  /** Fired after a successful combat GO click (game layer may call useInstanceObject). */
  // Apply one recorded effect. Called at the END of a step, never from inside the tick, so the sim
  // can run where these writes are unreachable (S6b mechanism 1). Replaced the five `on*` closures.
  applyEffect?: (effect: import('./simEffects.ts').SimEffect) => void;
  // Traps the clickable combat GOs activate, resolved by the game layer off the bake; `applySpell`
  // reads `src.spec.spells` and cannot reach a trap that belongs to a gameobject.
  combatObjectTraps?: readonly CombatObjectTrap[];
  // Traps a cast activates, one row per named gameobject. `spell_script_target` and
  // `gameobject_template` are unreachable from a pure engine module, so the sites arrive resolved.
  spellTrapSites?: readonly SpellTrapSite[];
  // CallAssistance: ms after a creature enters combat before its pack neighbours join (core default
  // 1500). Who joins is decided at pull build. Cite: Unit.cpp:7993; Creature.cpp:2163.
  packAssistDelayMs?: number;
  // Baked `conditions` rows by id so spells carrying only a conditionId resolve.
  // Absent → conditionId-gated spells fail closed.
  conditionTable?: import('../spells/conditions.ts').ConditionTable;
  // EventAI summon inject: resolve a summoned creatureId → CombatantSpec.
  // Cite: CreatureEventAI.cpp ACTION_T_SPAWN / SUMMON_ID SummonCreature.
  resolveSummon?: (creatureId: number) => CombatantSpec | null;
  // combat_condition / unit_condition lookups for the creature_spell_list gate; absent leaves every
  // gated row open. Cite: UnitAI.cpp:1218-1224 UpdateSpellLists.
  combatConditionTable?: {
    combatCondition: (id: number) => CombatConditionDef | undefined;
    unitCondition: (id: number) => UnitConditionDef | undefined;
  };
  // Seed for ACTION_T_SET_INST_DATA; ScriptDev instance scripts read the same store.
  // Cite: CreatureEventAI.cpp ACTION_T_SET_INST_DATA ~1044–1054.
  instanceData?: Record<number, number>;
  // After OnCreatureDeath → applyInstanceSetData: persist the store and stamp openDoors onto
  // goRuntime. Cite: sunken_temple.cpp:162-178 TYPE_PROTECTORS + GO 149431.

  // ACTION_T_QUEST_EVENT credit hook; the caller applies recordEventHappens, and group credit when
  // rewardGroup. Cite: CreatureEventAI.cpp ~847–862; Player.cpp AreaExploredOrEventHappens.

  // Is this quest still incomplete? Some ScriptDev SpellHit rows only fire while their quest is
  // open; absent → the gate stays shut. Cite: stranglethorn_vale.cpp:55-64.
  // `isQuestIncomplete` used to sit here. It is `SimTickInputs.activeQuests` now (S6b mechanism 2).
  // ACTION_T_KILLED_MONSTER (33) credits an entry that is not the one that died; absent = inert.
  // Cite: CreatureEventAI.cpp ProcessAction case 33.

  // ACTION_T_START_RELAY_SCRIPT (53) hands a `dbscripts_on_relay` id to the host; absent = the relay
  // is only logged. Cite: CreatureEventAI.cpp:1225-1244 ScriptsStart(SCRIPT_TYPE_RELAY, …).

  // SPELL_EFFECT_PICKPOCKET in a live fight: grants loot and gold without breaking stealth, and
  // returns both for the event text. Cite: SpellEffects.cpp EffectPickPocket; KI-612.
  onPickPocket?: (creatureEntry: number) => {
    ok: boolean;
    drops?: { item: number; count: number }[];
    goldCopper?: number;
    reason?: string;
  };
}

export interface CombatResult {
  events: CombatEvent[];
  // Scripted-mechanic counts for the whole fight, tallied at push time, so unlike the 8192-row
  // `events` ring this still reports a boss's early phase transitions. Absent when nothing fired.
  mechanics?: Record<string, { count: number; firstT: number; lastT: number }>;
  // Damage that landed, keyed by the side that took it, plus `_unattributed` for rows with no
  // target. Push-time like `mechanics`, because anything derived from `events` undercounts.
  damageTakenBySide?: Record<string, number>;
  // Every death in order with the killing blow that caused it, tallied at push time so an early
  // wipe death survives the ring. Capped at 512 rows; `deathsTotal` counts them all.
  deaths?: { side: string; name: string; t: number; by?: string; byName?: string; cause?: string }[];
  deathsTotal?: number;
  // Rows the session event ring discarded. Non-zero means `events`, and anything read off it,
  // covers only the tail of the fight.
  eventsDropped?: number;
  winner: Side | 'timeout';
  durationMs: number;
  player: {
    hp: number;
    power: number;
    /** Ending form id (0/absent = humanoid). */
    form?: ShapeshiftFormId;
    /** Ending mana (parallel pool for multi-power / always for mana users). */
    mana?: number;
    powerType?: PowerType;
    // Ending combat skill map after mid-fight gains (only when the fight started with combatSkills).
    // Applied onto Character.combatSkills in resolveFight.
    combatSkills?: Partial<Record<number, { current: number; max: number }>>;
  };
  /** Absent when the session held no primary enemy (continuous floor run). E1.3. */
  enemy?: {
    hp: number;
    power: number;
    // Primary enemy's creatureEntry at fight end. After a scriptdev UpdateEntry morph (Dathrohan →
    // Balnazzar) loot, XP and kill credit follow the final form, not the pulled template.
    finalCreatureEntry?: number;
  };
  itemsConsumed?: { entry: number; count: number }[]; // player in-combat consumables spent, to remove from bags
  // Charges left on surviving charged units (spellcharges_1 < -1), written back onto the bag stack or
  // the worn instance. Cite: Spell.cpp:4209 TakeCastItem; domain/items/inventory.ts.
  itemChargesLeft?: { entry: number; charges: number }[];
  // Items a fight PUT in the player's bags: a Rocket Boots malfunction leaves Scorched Rocket Boots
  // where the boots were. Cite: src_spell_template 8893 EffectItemType3 = 7190.
  itemsGained?: { entry: number; count: number }[];
  // M7: consumables spent by allies (ally_0 → index 0). Debited from companion bags in
  // resolveFight, never from the player's inventory.
  allyItemsConsumed?: { allyIndex: number; entry: number; count: number }[];
  // The mirror of `itemsGained` for a companion: a Drain Soul kill puts a Soul Shard in its own bag.
  allyItemsGained?: { allyIndex: number; entry: number; count: number }[];
  // Pet's ending vitals, to carry back onto the character. `unsummoned` marks the owner's death
  // taking it (RemovePet), so `hp` is what it left with and the writeback must not read a slaying.
  pet?: { hp: number; power: number; unsummoned?: boolean } | null;
  soulShardsGained?: number; // warlock: 1 per Drain Soul kill that had the DoT active
  /** Ally ending vitals in ally_0.. order. Present only when the session had allies. */
  allies?: { hp: number; power: number }[];
}

/** Live view of a combatant for the UI (unit frames + cast bar). */
export interface CombatantView {
  // WHICH SEAT this row is, so a reader never recomputes `enemySideAt(i)` from its own loop index
  // and reads a filtered view against the wrong seat. Cite: ENGINE-REBUILD E1.1.
  side: Side;
  name: string;
  // Creature template entry for an NPC combatant (absent for the player). Without it every pack
  // member drew the primary's icon. Cite: docs/archive/TACTICAL-VIEW-RUNSHEET.md T3.
  creatureEntry?: number;
  // UNIT_FIELD_LEVEL — the level SelectLevel rolled for this body, so a frame can print it
  // without re-reading the template's min/max. Cite: combatEnemySpec.ts:42 buildEnemySpecFromCreature.
  level: number;
  /** True on an ally seat holding one of OUR summons — the map draws it as a minion. */
  summoned?: boolean;
  /** UNIT_FIELD_MOUNTDISPLAYID. Spread-omitted when 0. Cite: Unit.cpp:7748. */
  mountDisplayId?: number;
  mounted?: boolean;
  /** Party job (tank/healer/damage) — absent for solo player/pet/enemies. */
  groupRole?: GroupRole;
  /** 0-based raid subgroup; omitted for group 0, so read it as `subgroup ?? 0`. */
  subgroup?: number;
  /** Present ('ranged') only for units in ranged attack mode; melee is the omitted default. */
  attackMode?: 'ranged';
  hp: number;
  maxHp: number;
  power: number;
  maxPower: number;
  powerType: PowerType;
  // `school`/`isHeal` describe the in-flight cast so rotations can gate interrupts without a
  // DataStore lookup. `channeled` drains the bar from full and puts `endsAt` at the channel end.
  casting: {
    spellId: number; name: string; startedAt: number; endsAt: number;
    school?: School; isHeal?: boolean; channeled?: true;
  } | null;
  rooted: boolean;
  // The active crowd-control on this combatant (most-severe: stun > fear > incapacitate > silence
  // > disarm), for the UI badge + "you can't act" banner; null when free. (Root is `rooted` above.)
  controlled: { control: ControlKind; until: number } | null;
  mode: 'melee' | 'ranged'; // which auto-attack is active: melee (Attack) or ranged/wand (Shoot)
  /** Present (true) only on an enemy with a live threat table — floor passives omit it. */
  engaged?: boolean;
  /** Present (true) only while untargetable/immune mid-mechanic — floor leash holds on it. */
  unattackable?: boolean;
  // `stacks` is present only when the aura is stacked above 1 (Sunder Armor x5); `charges` is the
  // remaining SpellEntry.procCharges (Inner Fire 20, Lightning Shield 3).
  buffs: Array<{ spellId: number; remainingMs?: number; stacks?: number; charges?: number }>;
  debuffs: Array<{ spellId: number; remainingMs?: number; stacks?: number; charges?: number }>;
  /** Combo points this fighter currently has on its combo target (0..5). Rogue/feral. */
  comboPoints?: number;
  /** Active shapeshift form id (0 = none). */
  form?: ShapeshiftFormId;
  // Spell id that entered the current form, for the RemoveAurasDueToSpell reverse.
  // Absent or 0 when the form is none or not owned by a spell.
  formSpellId?: number;
  /** Parallel mana for dual-bar display (Druid). Present when maxMana is set. */
  mana?: number;
  maxMana?: number;
  /** True while MOD_STEALTH is active. */
  stealthed?: boolean;
  /** Combined stealth strength (aura 16 + 154) for UI / debug. */
  stealthStrength?: number;
  /** Live melee AP (includes form package + Cat AGI when shapeshifted). */
  attackPower?: number;
  /** Live armor (includes form MOD_BASE_RESISTANCE_PCT package when shapeshifted). */
  armor?: number;
  /** Hands with an active TEMP weapon enchant (imbue / poison). */
  weaponImbueHands?: Array<'mainhand' | 'offhand'>;
  /** True within 5s of this combatant DODGING a melee swing (Overpower-style gates). */
  dodgedRecently?: boolean;
  /** CMaNGOS CreatureType (1 Beast, 3 Demon, 6 Undead, 7 Humanoid, …). Rotation creatureTypeMask gates. */
  creatureType?: number;
  // Auto-attack is on, with `mode` saying melee or ranged. Read by `/startattack` and by
  // `/cast !Attack`, which must not toggle a swing already running.
  autoAttack?: boolean;
  // True within 5s of this combatant setting AURA_STATE_DEFENSE: its own dodge (not rogues), parry
  // (not hunters) or block. Cite: UnitAuraProcHandler.cpp:296-328.
  defenseReactRecently?: boolean;
  // True within 5s of this combatant setting AURA_STATE_HUNTER_PARRY, which is Counterattack's
  // gate. Cite: UnitAuraProcHandler.cpp:310-316.
  hunterParryRecently?: boolean;
}

/** How long a dodge stays "recent" for dodge-reactive attacks (classic Overpower: 5 sec). */
export const RECENT_DODGE_MS = 5000;

// PvP combat flag duration after the last combat touch.
// Cite: CombatManager.cpp:192 `m_combatTimer = pvp ? 5000 : m_owner->GetPursuit()`.
export const PVP_COMBAT_TIMER_MS = 5000;

/** How long a dodge/parry/block stays "recent" for defense-react attacks (classic Revenge: 5 sec). */
export const RECENT_DEFENSE_REACT_MS = 5000;

// Healer-ally triage threshold: heal the lowest friendly below this HP fraction. A heuristic, not a
// sourced formula — rotations replace it with editable gates.
export const ALLY_HEAL_THRESHOLD = 0.75;

/** An ability offered on the action bar, with its current usability. */
export interface AbilityStatus {
  spell: SpellDef;
  usable: boolean;
  reason?: string;
  cooldownRemainingMs: number;
  queued?: boolean; // an on-next-swing ability that's armed and waiting for your next swing
}

/** A usable in-combat item, with its current usability (mirrors AbilityStatus). */
export interface CombatItemStatus {
  item: CombatItem;
  usable: boolean;
  reason?: string;
  cooldownRemainingMs: number;
  count: number;
}

export interface ActiveEffect {
  kind: 'dot' | 'buff' | 'root' | 'cc' | 'restore_health' | 'restore_power' | 'damage_shield' | 'proc_trigger_spell' | 'school_absorb' | 'mana_shield' | 'immunity' | 'speed' | 'reflect' | 'resist' | 'mod_taunt' | 'spell_magnet';
  source: Side;
  target: Side;
  spellId: number;
  name: string;
  school?: School;
  min?: number;
  max?: number;
  nextTickAt?: number;
  tickMs?: number;
  amountPerTick?: number;
  // When set, restore_health/power ticks use floor(max × pctOfMax / 100) instead of flat
  // amountPerTick (SPELL_AURA_OBS_MOD_HEALTH/MANA). Cite: SpellAuras PeriodicTick.
  pctOfMax?: number;
  // restore_power: the Powers index this row fills (0 mana … 3 energy). Absent reads as mana, so a
  // rage or energy bearer gets nothing rather than the wrong pool. Cite: SpellAuras.cpp:4836-4844.
  powerType?: number;
  /** damage_shield / proc_trigger_spell: next time this may retaliate. */
  nextProcAt?: number;
  /** damage_shield / proc_trigger_spell: internal proc CD (ms). */
  cooldownMs?: number;
  /** proc_trigger_spell: EffectTriggerSpell (or CMaNGOS override) id. */
  triggerSpellId?: number;
  // Aura-removal bodies. Present → this row is a pure holder: it never procs and never ticks, it
  // only fires when the aura goes away. Cite: SpellAuras.cpp HandleAuraDummy(!apply).
  onRemove?: readonly import('../../data/schema.ts').AuraRemoveBody[];
  // Judgement of Light target debuff: heal the striker on a landed melee hit. Applied directly
  // because the 5373 intermediate and its heal rows are absent from the bake. Cite: Paladin.cpp.
  onHitHeal?: number;
  // Judgement of Wisdom target debuff: restore mana to the striker on a landed melee hit.
  // Cite: Paladin.cpp JudgementOfWisdomIntermediate; Spell.sql energize carriers (20268…).
  onHitMana?: number;
  // Aura-42 / talent-style proc match, filtering deal-side (Seal of Justice) from take-side (Touch
  // of Weakness). Cite: SpellMgr.h ProcFlags; spell_proc_event.
  procFlags?: number;
  /** spell_proc_event.ppmRate for Classic PPM on melee deal. */
  procPpm?: number | null;
  /** Flat proc chance 0..1 when present (customChance / ProcChance). */
  procChance?: number | null;
  // PERIODIC_TRIGGER_SPELL (23) per-tick roll, 0..1, separate from `procChance` so a spell carrying
  // both keeps them independent. Cite: SpellAuras.cpp:975–981 Brood Affliction: Bronze.
  tickChance?: number;
  // Copied from SpellDef.spellFamilyFlags at DoT apply, for family-gated procs on ticks.
  // Cite: UnitAuraProcHandler.cpp:1355–1362 Hellfire 0x40 / RoF 0x20.
  spellFamilyFlags?: number;
  // Aura::GetAuraTicks() after the current periodic (1-based), for the CoA tick curve.
  // Cite: Warlock.cpp:23–34; SpellAuras PeriodicTick.
  auraTicks?: number;
  // Copied from SpellDef.grantsSoulShardOnKill at apply: a death under this aura yields a shard.
  // Cite: EffectItemType 6265.
  grantsSoulShardOnKill?: boolean;
  // SpellMgr.h IsBinarySpell for the source spell, used on DoT ticks (binary DoTs get ×0.1 partial
  // resist). Absent → treat as non-binary.
  binary?: boolean;
  // SPELL_AURA_PERIODIC_LEECH (53): heal the caster for dealt × this multiplier each tick.
  // Cite: SpellAuras.cpp PeriodicTick :4645, :4677–4682.
  leechMultiple?: number;
  // SPELL_AURA_PERIODIC_HEALTH_FUNNEL (62): reverse leech — damage the source, heal the target for
  // dealt × leechMultiple. Cite: SpellAuras.cpp PeriodicTick :4606–4612.
  healthFunnel?: boolean;
  // SPELL_AURA_RETAIN_COMBO_POINTS (148): on expire-by-time only, remove this many CP.
  // Cite: SpellAuras.cpp HandleAuraRetainComboPoints :4436–4452.
  retainComboAmount?: number;
  // cc-only: the control kind, its DR mechanic, and whether it shatters on damage. `broken` flags
  // an early break so the expiry sweep removes the mirror silently.
  control?: ControlKind;
  mechanic?: Mechanic;
  breakOnDamage?: boolean;
  broken?: boolean;
  // SPELL_ATTR_HEARTBEAT_RESIST (0x40000000, 146 rows): the holder rolls to break early on its own
  // clock, armed from the same land-die chance the cast used. Cite: SpellAuras.cpp:5995-6032.
  heartbeat?: import('./heartbeatResist.ts').HeartbeatHolder;
  // Only attack_power/armor/haste/stamina/strength/physical_taken are applied live in combat;
  // other BuffMod values are out-of-combat attribute buffs.
  mod?: BuffMod;
  amount?: number;
  // SPELL_AURA_MOD_DETECT_RANGE yards on this buff row, reversed into Fighter.detectRangeMod on
  // expire or dispel. Cite: Unit.cpp:11772; KI-796.
  detectRangeAmount?: number;
  // SPELL_AURA_MOD_MECHANIC_RESISTANCE (117) on this buff row, distinct from pushback `amount` so
  // expiry does not subtract pushbackResistChance. Cite: Unit.cpp:4015–4031.
  mechanicResist?: { mechanic: number; amount: number };
  // Creature-type mask for versus BuffMods (102/131/180), the EffectMiscValue mask.
  // Cite: Unit.cpp GetTotalAuraModifierByMiscMask; Unit.h GetCreatureTypeMask.
  creatureTypeMask?: number;
  // SpellSchoolMask for target_resistance (123). Cite: Unit.cpp:3894.
  schoolMask?: number;
  // SpellDef.exclusionGroup mirrored at apply time so sibling auras in the same exclusive
  // spell_group can be stripped without a data-store lookup. Cite: SpellGroupStackRule.
  exclusionGroup?: number;
  // AuraStackIdentity mirrored the same way, for the pairs no spell_group covers — Gift of the
  // Wild over Mark of the Wild. Cite: engine/spells/auraStacking.ts; SpellStacking.cpp:135,352.
  stackIdent?: AuraStackIdentity;
  /** speed aura id (31/32/33/…) when kind === 'speed'. */
  aura?: number;
  /** speed percent (signed) when kind === 'speed'; reflect chance % when kind === 'reflect'. */
  pct?: number;
  /** Hostile snare vs beneficial aspect/sprint when kind === 'speed'. */
  hostile?: boolean;
  // SPELL_AURA_MOD_TOTAL_THREAT (103) Fade: per-enemy flat threat deltas applied at cast and
  // reversed on expire. Cite: HostileRefManager.cpp:82–99; ThreatManager.cpp:693–702.
  threatFadeDeltas?: ReadonlyArray<{ id: Side; delta: number }>;
  expiresAt: number;
  /** Tick this aura was applied. Same-tick white must not break Frost Nova. Cite: Spell.cpp effect order; KI-1062. */
  appliedAt?: number;
  /** When set, this aura is tied to a totem side and is stripped on unsummon. */
  fromTotem?: TotemSide;
  // This proc row IS a weapon enchant. Dead wherever CanUseEquippedWeapon is false — a form whose
  // attack speed is overridden, or a disarmed hand. Cite: Unit.cpp:10877-10891 (per attack type).
  fromWeaponEnchant?: boolean;
  // DynamicObject pool id for a PersistentAreaAura membership row; the pulse path deals the damage
  // and this row is enter/leave/refresh. Cite: DynamicObject.h m_affected.
  fromDynamicObject?: number;
  /** Current stack count (SpellEntry.StackAmount). Absent/1 = single stack. */
  stacks?: number;
  /** Remaining proc charges (SpellEntry.procCharges). Absent = unlimited. */
  charges?: number;
  // SPELL_AURA_MECHANIC_IMMUNITY EffectMiscValue ids when kind === 'immunity'.
  // Cite: SpellAuras.cpp HandleModMechanicImmunity; Fear Ward mechanic 5.
  immunityMechanics?: number[];
  // Hunter trap GO yards at arm time; proximity is vs this point, not the hunter.
  // Cite: SpellEffects.cpp EffectSummonObject; GameObject.cpp:436–503.
  trapPosYd?: CombatPosYd;
}

export interface Fighter {
  side: Side;
  spec: CombatantSpec;
  // Live SPELLMOD_RADIUS mods (mirrors `spec.radiusSpellMods`, on the fighter so gear procs and
  // talent auras can push rows mid-fight). Cite: areaAura.ts effectiveAreaRadiusYd.
  radiusSpellMods: SpellMod[];
  // Live lasting SpellModifiers (Arcane Power COST, Barkskin CASTING_TIME, set bonuses).
  // Cite: Player.cpp m_spellMods; spellModIntents.ts applyOwnedSpellMod.
  ownedSpellMods: OwnedSpellMod[];
  hp: number;
  power: number;
  attackPower: number;
  armor: number;
  // Percent armor modifier from aura 101 MOD_RESISTANCE_PCT (Pierce Armor −50); effective armor =
  // max(0, armor × (1 + armorPctMod/100)). Cite: SpellAuras.cpp HandleModResistancePercent.
  armorPctMod: number;
  // Live BASE (item) armor, the slice `armorBasePctMod` multiplies. Seeded from spec.baseArmor;
  // flat armor buffs and agi×2 land on `armor` only.
  baseArmor: number;
  // Aura 142 MOD_BASE_RESISTANCE_PCT: multiplies baseArmor only, before armorPctMod, and is
  // additive across auras. Cite: SpellAuras.cpp:3435; Unit.cpp:9067.
  armorBasePctMod: number;
  /** ATTACK-speed percent: MH/OH/ranged swing timers only (auras 9 / 138 / 140 / 141 + gear). */
  haste: number;
  sitting?: boolean;
  // Cast-speed percent (aura 65): cast time and the hasted GCD, never a swing timer — the core
  // keeps UNIT_MOD_CAST_SPEED off the attack timers. Cite: Unit.cpp:10481; SpellAuras.cpp:3915.
  castHaste: number;
  // Live form package and Cat AGI AP currently baked into attackPower/armor/maxHealth, cleared on
  // leave so a mid-fight form switch re-syncs without double-counting.
  formApBonus: number;
  formArmorBonus: number;
  formHealthBonus: number;
  /** SPELL_AURA_MOD_THREAT percent from form package (cat −29 / bear +30 / battle −20). */
  formThreatPct: number;
  // physical_taken_pct from the form package, tracked so leave reverses applyBuffMod exactly.
  // Cite: HandleShapeshiftBoosts 7376/7381.
  formPhysicalTakenPctBonus: number;
  // damage_done_pct from the form package, tracked so leave reverses applyBuffMod exactly.
  // Cite: HandleShapeshiftBoosts 7376.
  formDamageDonePctBonus: number;
  swingReadyAt: number;
  // Off-hand auto-attack ready time, advanced only when dual-wielding with an OH weapon; combat
  // enter delays OH to half period. Cite: Unit.cpp Attack ~6312–6314.
  ohSwingReadyAt: number;
  /** A death marked this unit (sessionDeaths): decide at the first GCD-ready tick, not the slow-update slice. */
  decideDirty?: boolean;
  // Earliest t this unit will run pickAction again unless decideDirty; 0 = think now.
  // Set after each think via nextDecideWakeAt.
  nextWakeAt: number;
  // Last values `refreshCheapDirty` compared against, for the four inputs that dirty a decision
  // without a mark of their own. Undefined at birth so a unit's first tick still dirties.
  seenDecideHp?: number;
  seenDodgedAt?: number;
  seenDefenseReactAt?: number;
  seenHunterParryAt?: number;
  gcdUntil: number;
  // Friendly target this unit's current cast was aimed at, set when the cast starts and cleared
  // once the effects apply. Null or absent = triage picks, which is every AI cast.
  friendlyPin?: Side | null;
  castingSpell: SpellDef | null;
  // Ground dest for this in-flight or instant cast, set at startOrCast from a dest-bearing
  // CombatAction. Cite: SpellEffects.cpp EffectPersistentAA DynamicObject at dest.
  castDest: CombatPosYd | null;
  // Active channelled cast, armed when a spell with `channelMs` lands and cleared on natural end,
  // damage cancel, or action interrupt.
  channeling: import('./channel.ts').ChannelState | null;
  // Session time of this fighter's last dodge; dodge-reactive attacks such as Overpower are usable
  // against it for 5s after.
  lastDodgedAt: number;
  // Session time this fighter last set AURA_STATE_DEFENSE; Revenge / Riposte / Mongoose Bite are
  // usable for 5s after. Cite: UnitAuraProcHandler.cpp:296-328.
  lastDefenseReactAt: number;
  // Ms this unit has been unable to close on its victim, the counter sessionMotion runs toward its
  // 5 s unreachable-evade; 0 = closing fine. Cite: CreatureEventAI.cpp:545-547.
  targetUnreachableMs: number;
  // Explicit orientation override in radians. Null = derive it: face the current foe unless walking
  // away from it, else the last movement heading. Cite: Object.cpp:1515-1573.
  facing: number | null;
  // Session time this fighter last set AURA_STATE_HUNTER_PARRY; Counterattack reads it, and every
  // other class routes a parry to lastDefenseReactAt. Cite: UnitAuraProcHandler.cpp:310-316.
  lastHunterParryAt: number;
  // EVENT_T_SPELLHIT pulse: the spell that last landed on this unit, its school mask, and when.
  // Cite: Spell.cpp:1345 unit->AI()->SpellHit; CreatureEventAI.cpp:1666-1670.
  spellHitId?: number;
  spellHitSchoolMask?: number;
  spellHitAt?: number;
  castStartedAt: number;
  castFinishAt: number;
  // Damage pushbacks applied to the current cast (the GetNextDelayAtDamageMsTime ladder index) and
  // the haste-modified full cast time for the remaining-cannot-exceed-cast-time cap.
  castPushbacks: number;
  castBaseMs: number;
  // Power cost held for the in-flight cast (0 when nothing is owed): cast() takes it when the timer
  // reaches 0 and cancel() takes none, so an interrupted cast costs nothing. Cite: Spell.cpp ~3168.
  castCost: number;
  /** Pool the held cast cost is drawn from (undefined = the fighter's active power type). */
  castCostPower?: PowerType;
  cooldowns: Map<number, number>;
  categoryCooldowns: Map<number, number>;
  // SPELL_ATTR_COOLDOWN_ON_EVENT spells whose timer has not started: spellId → the ms to stamp once
  // the aura fades, with `cooldowns` holding PERMANENT_COOLDOWN_READY_AT. Cite: Spell.cpp:3414.
  deferredCooldowns?: Map<number, number>;
  /** The category half of the same defer: spellId → its category and duration. */
  deferredCategoryCooldowns?: Map<number, { category: number; ms: number }>;
  rootedUntil: number;
  // Crowd-control lockout timers (0 = free), set only when a cc effect lands, so a fight with no CC
  // leaves them all 0 and the swing/action gates below evaluate false.
  stunnedUntil: number;
  fearedUntil: number;
  incapUntil: number;
  silencedUntil: number;
  disarmedUntil: number;
  // Caster sides whose break-on-damage CC on this body our own damage shattered. A CC rule never
  // re-picks such a body, because the party chose to kill it.
  ccDamageBrokenBy?: Set<Side>;
  // SPELL_AURA_MOD_CHARM: the target fights for the charmer until this time (0 = free). Not a hard
  // lockout — the unit keeps acting, against its former allies. Cite: SpellAuras.cpp HandleModCharm.
  charmedUntil: number;
  /** Side id of the unit that charmed this fighter (TakeCharmOf caster). */
  charmedBy: Side | null;
  /** Holder spell id for the active charm (e.g. 17244 Possess). */
  charmSpellId: number;
  // Scripted HP-fraction break: remove charm when hp ≤ frac × maxHealth, 0 = no HP break.
  // Cite: boss_baroness_anastari.cpp AnastariPossess OnPeriodicTickEnd.
  charmBreakHpFrac: number;
  /** Next ScriptDev aura onPeriodic tick (Anastari ForcePeriodicity 1000). 0 = none. */
  charmPeriodicAt: number;
  // Untargetable and unattackable until this time (Possess Inv 17250 while Anastari possesses).
  // Cite: boss_baroness_anastari.cpp SPELL_POSSESS_INV = 17250.
  unattackableUntil: number;
  // SPELL_AURA_FEIGN_DEATH pose: CombatStop and untargetable until cancelled.
  // Cite: Unit.cpp SetFeignDeath :10083–10140; SpellDefines AuraInterruptFlags 0x3c3c.
  feigningUntil: number;
  /** Aura spell id that armed feigningUntil (5384, creature Fake Death, …). */
  feignSpellId: number;
  /** SPELL_AURA_MOD_PACIFY — cannot melee/ranged attack (can still cast). Cite: HandleAuraModPacify. */
  pacifiedUntil: number;
  // Per-school interrupt lockout readyAt, indexed by SpellSchools (physical=0 … arcane=6), 0 = free.
  // Distinct from silencedUntil. Cite: Object.cpp m_lockoutMap / LockOutSpells / CheckLockout.
  schoolLockoutUntil: number[];
  // active CC immunity by DR-category (Will of the Forsaken), and per-category diminishing-returns
  // bookkeeping (application step + reset time). Both empty unless CC is involved.
  ccImmuneUntil: Map<string, number>;
  dr: Map<string, { step: number; resetAt: number }>;
  resistances: Partial<Record<School, number>>;
  creatureType: number;
  mode: 'melee' | 'ranged'; // auto-attack mode (Attack vs Shoot); melee by default, ranged for a rangedAuto class
  buffActive: Set<number>;
  /** Unit m_movementInfo.moveFlags. Cite: Object.h:750; Unit.cpp:12428 SetHover. */
  movementFlags?: number;
  activeSeal: ActiveSeal | null; // paladin: the one seal currently up (procs on swing, consumed by Judgement)
  /** Active weapon temp enchants (MH/OH). Replaced on re-imbue. */
  weaponImbues: Partial<Record<'mainhand' | 'offhand', ActiveWeaponImbue>>;
  // One-shot hand override for the next weapon_imbue cast, consumed by applySpellLate. Unset falls
  // back to CombatantSpec.weaponImbueCastHand, then mainhand.
  pendingWeaponImbueHand?: 'mainhand' | 'offhand';
  // Once-per-engagement gate for Charge, cleared on leave combat: Charge is
  // SPELL_ATTR_NOT_IN_COMBAT_ONLY_PEACEFUL. Cite: Spell.cpp:4598–4599 IsNonCombatSpell.
  chargeUsed: boolean;
  // Session clock when UNIT_FLAG_IN_COMBAT drops (0 = already out), refreshed to now+timer on every
  // combat touch. Cite: CombatManager.cpp:192 TriggerCombatTimer; Unit.cpp:7895 SetInCombatState.
  combatUntil: number;
  /** Session clock when THIS unit entered combat (0 = OOC). Per-unit, not party-wide. */
  combatEnteredAt: number;
  // Multi-tick charge/intercept travel: spend and CD apply on cast, and dest is melee-reach short
  // of the target. Cite: SpellEffects.cpp EffectCharge MoveCharge; BASE_CHARGE_SPEED.
  pendingCharge: { spell: SpellDef; targetSide: Side; speed: number; dest?: CombatPosYd } | null;
  pendingSwing: SpellDef | null; // armed on-next-swing ability, consumed by the next auto-attack
  damagePctBySchool: Partial<Record<School, number>>;
  // UNIT_FIELD_POWER_COST_MODIFIER / _MULTIPLIER per school (auras 73 flat, 72 percent):
  // CalculatePowerCost is (base + flat) × (1 + pct/100), clamped at 0. Cite: Spell.cpp:6358, :6368.
  powerCostFlatBySchool: Partial<Record<School, number>>;
  powerCostPctBySchool: Partial<Record<School, number>>;
  // SPELL_AURA_MOD_SPELL_HIT_CHANCE (55) in percentage points, subtracted from the magic miss roll.
  // Cite: Unit.cpp CalculateSpellMissChance `chance -= m_modSpellHitChance`.
  spellHitBonusPercent: number;
  // SPELL_AURA_MOD_AOE_AVOIDANCE (160) miss percentage points vs area spells.
  // Cite: Unit.cpp:3713–3715 MagicSpellHitResult.
  aoeAvoidancePercent: number;
  procs: ProcDef[];
  gearProcs: Array<{
    spell: number;
    trigger: number;
    chancePct?: number;
    ppm?: number;
    flags?: number;
    procEx?: number;
    cooldownMs?: number;
    schoolMask?: number;
    spellFamilyName?: number;
    spellFamilyMask?: number[];
  }>;
  // Hidden proc cooldowns (triggered spell id → readyAt ms), deterministic, from
  // SpellProcEventEntry.cooldown. Cite: SpellMgr.h SpellProcEventEntry ~1749.
  procCooldowns: Map<number, number>;
  // Combo points (CMaNGOS Unit::m_comboPoints / m_comboTargetGuid). Points are on a target;
  // switching builder target resets to the new count. Cap 0..5.
  comboPoints: number;
  comboTarget: Side | null;
  // Energy regen accumulator (ms toward the next energy tick quantum of 100ms).
  energyAccMs: number;
  /** Mana regen accumulator (ms toward whole-second quanta; Player::Regenerate POWER_MANA). */
  manaAccMs: number;
  /** Session time of last mana spend (−1 = never). 5SR while t − lastManaUseAt < LAST_MANA_USE_MS. */
  lastManaUseAt: number;
  /** Focus regen accumulator for hunter pets (Pet::RegenerateAll 4s quantum). */
  focusAccMs: number; healthRegenFrac: number; // residual aura116 KI-898
  /** OOC rage decay accumulator (ms toward the 200 ms quantum; Player::Regenerate POWER_RAGE). */
  rageDecayAccMs: number;
  // Shapeshift form + parallel mana (Druid multi-power). See domain/character/forms.ts.
  form: ShapeshiftFormId;
  // Spell id that entered the current form — RemoveAurasDueToSpell needs it to leave form.
  // Cite: SpellAuras.cpp HandleAuraModShapeshift apply=false.
  formSpellId: number;
  mana: number;
  maxMana: number;
  createMana: number;
  /** Base/create health for POWER_HEALTH % costs (Bloodrage). 0 when unknown (mobs/fixtures). */
  createHealth: number;
  /** Gear weapon speed (ms) before form override — restored on leave form. */
  baseWeaponSpeedMs: number;
  /** Gear weapon min damage before form override — restored on leave form. */
  baseWeaponDmgMin: number;
  /** Gear weapon max damage before form override — restored on leave form. */
  baseWeaponDmgMax: number;
  /** Flat add to incoming physical damage after armor (Stoneskin: negative). */
  physicalTakenMod: number;
  // SPELL_AURA_MOD_RANGED_DAMAGE_TAKEN (113) — flat, ranged weapon attacks only (Windwall Totem).
  // Cite: SpellAuras.cpp :174 → Unit::MeleeDamageBonusTaken.
  rangedTakenMod: number;
  // Sum of SPELL_AURA_MOD_DAMAGE_PERCENT_TAKEN (physical mask) / MOD_MELEE_DAMAGE_TAKEN_PCT;
  // physical dmg *= (1 + pct/100) after armor + flat. Cite: Unit.cpp:7628 / :7634.
  physicalTakenPctMod: number;
  // School-scoped SPELL_AURA_MOD_DAMAGE_PERCENT_TAKEN (87) — CoE fire/frost, CoS shadow/arcane;
  // applied after resist/armor + flat taken. Cite: Unit.cpp:7628 GetTotalAuraMultiplierByMiscMask.
  damageTakenPctBySchool: DamagePctBySchool;
  /** Flat add to incoming spell/magic damage after resist (Dampen Magic: negative). */
  spellTakenMod: number;
  // Victim aura: attackers gain this much AP when striking this fighter (Hunter's Mark).
  // Cite: SPELL_AURA_RANGED_ATTACK_POWER_ATTACKER_BONUS (127).
  attackerAttackPowerBonus: number;
  // Victim aura: attackers gain whole-percent spell crit vs this fighter, keyed by school.
  // SPELL_AURA_MOD_ATTACKER_SPELL_CRIT_CHANCE (179), Winter's Chill. Cite: Unit.cpp:3530–3531.
  attackerSpellCritBySchool: Partial<Record<School, number>>;
  // Victim auras 185-188: signed percentage points off an attacker's roll against this fighter.
  // Cite: Unit.cpp:3525-3528 GetCritTakenChance; :3794; :3874.
  attackerMeleeCrit: number;
  attackerRangedCrit: number;
  attackerRangedHit: number;
  attackerSpellHitBySchool: Partial<Record<School, number>>;
  /** Aura 169 rows: crit MULTIPLIER percent vs a creature-type mask. Cite: Unit.cpp:3561. */
  critDamageVersusPct: Array<{ creatureTypeMask: number; amount: number }>;
  /** Aura 122: whole percent onto the 0.5 off-hand TOTAL_PCT. Cite: SpellAuras.cpp:4183. */
  offhandDamagePct: number;
  // OVERRIDE_CLASS_SCRIPTS (112) misc values from the sheet; `buffActive` only holds live auras, so
  // a script consumer must read both. Cite: Unit.cpp:11969-11985 HasOverrideScript.
  overrideScriptIds: ReadonlySet<number>;
  // Live MOD_MELEE_ATTACK_POWER_VERSUS rows (equip seed + mid-fight elixirs).
  // Cite: Unit.cpp:7476 MeleeDamageBonusDone.
  attackPowerVersus: Array<{ creatureTypeMask: number; amount: number }>;
  /** Live MOD_RANGED_ATTACK_POWER_VERSUS. Cite: Unit.cpp:7471. */
  rangedAttackPowerVersus: Array<{ creatureTypeMask: number; amount: number }>;
  /** Live MOD_FLAT_SPELL_DAMAGE_VERSUS. Cite: Unit.cpp:7055. */
  spellDamageVersus: Array<{ creatureTypeMask: number; amount: number }>;
  // Live SPELL_AURA_MOD_DAMAGE_DONE_VERSUS (168): whole-percent multiplier on melee, ranged and
  // spell damage when the creature-type mask matches. Cite: Unit.cpp:7058, :7503.
  damageDoneVersusPct: Array<{ creatureTypeMask: number; amount: number }>;
  // Live SPELL_AURA_MOD_DAMAGE_DONE_CREATURE (59) flats for melee DoneFlat.
  // Cite: Unit.cpp:7465; KI-1043.
  damageDoneCreature: Array<{ creatureTypeMask: number; amount: number }>;
  /** SPELL_AURA_MOD_TOTAL_THREAT (103) percent on threat generation (Fade: negative). */
  threatModPct: number;
  // Live SPELL_AURA_MOD_THREAT (10) school-scoped percent, additive; threatOps multiplies
  // (1 + pct/100) for that school only. Cite: SpellAuras.cpp:2836–2838.
  threatSchoolPct: Partial<Record<School, number>>;
  /** Flat healing taken modifier (SPELL_AURA_MOD_HEALING = 115). */
  healingTakenMod: number;
  // Percent healing taken (aura 118): the heal path is (amount + flat) × (1 + pct/100).
  // Cite: Unit.cpp:7239–7245 SpellHealingBonusTaken TakenTotalMod.
  healingTakenPctMod: number;
  // Live buff mp5 (SPELL_AURA_MOD_POWER_REGEN over 5s) beyond spec.mp5.
  // Cite: StatSystem.cpp UpdateManaRegen power_regen_mp5.
  mp5Bonus: number;
  // Live product of (100+amount)/100 for SPELL_AURA_MOD_POWER_REGEN_PERCENT (110): starts at 1, a
  // buff apply multiplies and the reverse divides. Cite: Unit.cpp:4611–4622; KI-424.
  manaRegenPctMult: number;
  /** Live additive % for SPELL_AURA_MOD_POWER_REGEN_PERCENT (110) on energy (Adrenaline Rush). */
  energyRegenPctMod: number;
  // Live additive SPELL_AURA_MOD_MANA_REGEN_INTERRUPT (134) percent beyond the spec baseline.
  // Cite: StatSystem.cpp:558–562.
  manaRegenInterruptBonus: number;
  // Live SPELL_AURA_SCHOOL_ABSORB (69) pools, consumed in dealDamage after resist.
  // Cite: Unit.cpp CalculateDamageAbsorbAndResist ~2391.
  schoolAbsorbs: SchoolAbsorbAura[];
  // Live SPELL_AURA_MANA_SHIELD (97) pools, applied after school absorb with mana paid per point.
  // Cite: Unit.cpp ~2457–2496.
  manaShields: ManaShieldAura[];
  /** SPELL_AURA_SPLIT_DAMAGE_PCT (81) — Soul Link style; at most one active. */
  splitDamage: SplitDamagePctAura | null;
  // SPELL_AURA_SPLIT_DAMAGE_FLAT (153), at most one active. Cite: Unit.cpp:2501–2537.
  splitDamageFlat: SplitDamageFlatAura | null;
  // SPELL_AURA_RESIST_PUSHBACK (149) total chance % to ignore cast pushback.
  // Cite: Spell.cpp:6817–6820.
  pushbackResistChance: number;
  // Live sum of SPELL_AURA_MOD_DETECT_RANGE (91) in signed yards, fed into GetAttackDistance.
  // Cite: Unit.cpp:11772; KI-796.
  detectRangeMod?: number;
  // Blessing of Light dual flat heal bonuses, family-flag filtered to Holy Light and Flash of Light.
  // Cite: Paladin.cpp BlessingOfLight; Unit.cpp:7261–7265.
  blessingOfLight: { holyLight: number; flashOfLight: number; spellId: number } | null;
  // Healing Way 29203 stacks on this unit (Healing Wave taken %).
  // Cite: Shaman.cpp:77–89; spell_template StackAmount 3.
  healingWay: { pct: number; stacks: number; spellId: number } | null;
  // Healing Way talent proc chance while the ADD_TARGET_TRIGGER holder is up.
  // Cite: Spell.cpp:7457–7458; spell_template 29206/29205/29202.
  healingWayChancePct: number;
  // Aura-granted immunities, composed with the creature_template masks by immunity.ts.
  // Cite: Unit.cpp IsImmuneToDamage ~7310.
  immunity: ImmunityState;
  // Pending white-swing extras from SPELL_EFFECT_ADD_EXTRA_ATTACKS (19), capped at 5 and consumed
  // after landed MH white swings. Cite: SpellEffects.cpp:4878–4880.
  extraAttacks: number;
  // True while DoExtraAttacks drains the queue; Windfury-class procs must not re-fire in this
  // window. Cite: Player.cpp:7383–7385; UnitAuraProcHandler.cpp:1550–1551.
  extraAttacksExecuting: boolean;
  // Spell that last granted extraAttacks, so the meter labels the drained whites as that ability
  // instead of anonymous Melee. Cleared when the queue hits 0.
  extraAttackSource?: { spellId: number; name: string } | null;
  // Summon timed despawn: the summoning spell's duration, 0 or absent = until killed.
  // Cite: SpellEffects.cpp:2765 EffectSummonWild duration = GetSpellDuration.
  summonDespawnAt?: number;
  // Totem-only: expire time, slot, and the player summon spell id for buffActive upkeep.
  totemExpiresAt?: number;
  totemSlot?: TotemSlot;
  totemSummonSpellId?: number;
  // Totem-only: which unit summoned it. The summon-spell rotation marker lives on that unit's
  // buffActive, so unsummon clears it from the owner, not from the player.
  totemOwnerSide?: Side;
  // Totem-only: `Totem::GetSpell()`, the first kit spell id and so the only aura UnSummon strips —
  // anything the kit triggered survives a slot swap. Cite: Totem.cpp UnSummon :131–158.
  totemKitSpellId?: number;
  // Totem-only: payload SpellDefs for kit `proc_trigger_spell` ids, kept off `spec.spells` so a
  // passive totem cannot cast them through TotemAI. Cite: Totem.cpp Summon TOTEM_PASSIVE.
  totemTriggerSpells?: SpellDef[];
  // Totem-only: widest SpellRadius yards over the whole kit, for the UI's reach readout. Not
  // derivable from `spec.spells`, which is empty by design on a passive totem.
  totemAuraRadiusYd?: number;
  // The player-side seat whose grantsSoulShardOnKill spell dealt the lethal blow, consumed in
  // checkDeaths alongside the active DoT flags. The shard is that warlock's, not the party's.
  soulShardLethalCredit?: Side | null;
  // ---- Stealth (docs/archive/classes/stealth.md) ------------------------------------
  /** MOD_STEALTH active (HasStealthAura). */
  stealthed: boolean;
  /** Active stealth aura strength (aura 16). */
  stealthAuraStrength: number;
  /** Passive/talent stealth level (aura 154) — stacks with aura strength for detect math. */
  stealthLevelBonus: number;
  /** Detect strength on this unit (aura 17). */
  stealthDetectStrength: number;
  /** AuraInterruptFlags of the active stealth aura (0 = use default damage|action|attack). */
  stealthBreakFlags: number;
  /** When false, white swings are suppressed (CANCELS_AUTO_ATTACK_COMBAT). */
  autoAttackEnabled: boolean;
  /** Spell id of the active stealth aura (for buff strip / UI). */
  stealthSpellId: number;
  // A one-shot spell modifier armed by a `next_cast_mod` self-buff, consumed by the next matching
  // cast in startOrCast. Null when nothing is armed.
  pendingSpellMod: PendingSpellMod | null;
  // Crit fraction (0..1) added to this cast only, set when a `next_cast_mod` with `critAdd` is
  // consumed and cleared once the empowered spell resolves.
  castCritAdd: number;
  // Signed percent added to this cast's rolled effect magnitude, read as a (1 + pct/100) multiplier
  // on its damage, dot, buff and heal rolls. Cleared once the empowered spell resolves.
  castEffectPct: number;
  // Live % healing-done bonus (SPELL_AURA_MOD_HEALING_DONE_PERCENT), applied as (1 + pct/100) when
  // this fighter's heal amounts are rolled.
  healingPct: number;
  // Flat +healing done (aura 135), added after the base roll and before healingPct.
  // Cite: Unit.cpp SpellHealingBonusDone.
  healingDoneFlat: number;
  /** Sweeping Strikes (12292): remaining melee attacks that also cleave a second enemy (0 = none). */
  sweepingStrikesCharges: number;
  // Combustion (11129): fire crits left before the buff ends, and the live 28682 stack count.
  // Cite: UnitAuraProcHandler.cpp:991-1003.
  combustionCharges: number;
  combustionStacks: number;
  // Vampiric Embrace (15286) on the afflicted target: % of the VE caster's shadow damage healed
  // back to caster and party, 0 = inactive. Cite: UnitAuraProcHandler.cpp:1015–1028; KI-701.
  vampiricEmbracePct: number;
  /** Side of the priest who applied VE — only that caster's Shadow damage procs the heal. */
  vampiricEmbraceCasterSide?: Side;
  // Eye for an Eye (9799/25988): % of magic damage taken returned to the attacker, capped at 50% of
  // max health, 0 = inactive. Cite: UnitAuraProcHandler.cpp:795–808.
  eyeForAnEyePct: number;
  // Oracle Healing Bonus (26169): % of heals dealt returned as a self-heal via 26170, 0 = inactive.
  // Cite: UnitAuraProcHandler.cpp:1046–1052.
  oracleHealingBonusPct: number;
  // Obsidian Armor (27539) dummy active: school damage taken → school resist buff.
  // Cite: UnitAuraProcHandler.cpp:910–930.
  obsidianArmorActive: boolean;
  // Adaptive Warding (28764) dummy active: school damage taken under Mage Armor → resist buff.
  // Cite: UnitAuraProcHandler.cpp:870–907.
  adaptiveWardingActive: boolean;
  // Holy Power / Totemic Power set bonus currently active. Cite: UnitAuraProcHandler.cpp:1153–1219.
  classPowerSetKind: 'holy_power' | 'totemic_power' | null;
  /** Vestments of Faith 4pc (28809). Cite: UnitAuraProcHandler.cpp:1055–1058. */
  vestmentsGreaterHealActive: boolean;
  /** Dreamwalker Raiment HT mana refund (28719). Cite: UnitAuraProcHandler.cpp:1068–1074. */
  dreamwalkerHealingTouchActive: boolean;
  /** Idol of Longevity HT refund (28847). Cite: UnitAuraProcHandler.cpp:1077–1081. */
  idolHealingTouchRefundActive: boolean;
  /** Totem of Flowing Water LHW (28849). Cite: UnitAuraProcHandler.cpp:1222–1226. */
  totemLesserHealingWaveActive: boolean;
  /** Cheat Death set (28845) 20% HP gate. Cite: UnitAuraProcHandler.cpp:1378–1383. */
  cheatDeathActive: boolean;
  // Master of Elements refund percent while the dummy is up, 0 = inactive.
  // Cite: UnitAuraProcHandler.cpp:949–964.
  masterOfElementsPct: number;
  // Magic Absorption percent of max mana on a full resist, 0 = inactive.
  // Cite: UnitAuraProcHandler.cpp:938–947.
  magicAbsorptionPct: number;
  // Ignite talent rank spell id while the dummy aura is up, 0 = none; fire damage → DoT 12654.
  // Cite: UnitAuraProcHandler.cpp:970–985.
  igniteRankSpellId: number;
  // Setup hidden trigger 15250 while the talent proc is on the sheet, 0 = none.
  // Cite: Rogue.cpp:112–118 SetupRogue; talent ranks 13983/14070/14071.
  setupTriggerSpellId: number;
  // Deep Wounds talent rank spell id while the passive is up, 0 = none; melee crit → DoT 12721.
  // Cite: UnitAuraProcHandler.cpp:1316–1342.
  deepWoundsRankSpellId: number;
  // Improved Sprint proc chance % while the talent passive is up (0 = inactive); on a successful
  // Sprint cast, roll → cast 30918. Cite: SpellEffects.cpp:4140–4147; spell_template 13743/13875.
  improvedSprintChancePct: number;
  // SPELL_AURA_ADD_TARGET_TRIGGER (109) holders: on a later successful hit, isAffectedOnSpell +
  // roll_chance_i → applyProc(triggerSpellId). Cite: Spell.cpp:7433–7468 ProcSpellAuraTriggers.
  addTargetTriggers: Array<{
    spellId: number;
    triggerSpellId: number;
    chancePct: number;
    familyName: number;
    familyFlags: number;
    expiresAt: number;
  }>;
  // Pyroclasm talent rank spell id while the dummy is up (0 = none); Hellfire/RoF tick → stun 18093.
  // Cite: UnitAuraProcHandler.cpp:1347–1375.
  pyroclasmRankSpellId: number;
  // Leader of the Pack form crit bonus currently applied (0 = none), reversed on leave form.
  // Cite: SpellAuras.cpp:4306–4311; spell_template 24932 bp2 → +3% crit.
  leaderOfThePackCritBonus: number;
  // Form whose `spec.formTalentAuras` row is currently applied (0 = none). Held so the leave path
  // reverses exactly the row the enter path added, never a re-read of the current form.
  formTalentAuraForm: number;
  // Combo points to grant after the current finisher clears CP (Seal Fate / Ruthlessness).
  // Cite: UnitAuraProcHandler.cpp:1510–1519 AddTriggeredSpell.
  pendingFinisherComboPoints: number;
  /** Lightwell (724): a placed well this fighter owns — reactive party heal with charges (null = none). */
  lightwell: { charges: number; healPerCharge: number; intervalMs: number; expiresAt: number; nextHealAt: number; spellId: number } | null;
  // Dirty run-speed cache; recompute only when a speed aura is applied or removed.
  // Cite: SpellAuras.cpp:2880–2917 HandleAuraMod*Speed → UpdateSpeed.
  speedDirty: boolean;
  /** Last effective run yd/s. Valid when `speedDirty` is false. */
  speedCache: number;
  /** Armed after-cast; applied only when this spellId actually starts/lands. */
  armedRuleAfter?: { spellId: number; after: RuleAfter };
  /** After-cast: walk this many yards away from focus once the cast is no longer in flight. */
  pendingStepBackYd?: number;
  /** Locked retreat heading, mesh-probed for walkable yards. Set on first retreat tick. */
  stepBackDirX?: number;
  stepBackDirY?: number;
  /** Yards already walked along {@link stepBackDirX}/{@link stepBackDirY}. */
  stepBackWalkedYd?: number;
  // Wall clock the retreat gives up at. A step-back suppresses every hostile spell, so a unit whose
  // nav cannot produce a hop was silenced for the rest of the fight (measured: 3 casts in 20 s).
  stepBackDeadline?: number;
  /** Consecutive ms in which no retreat heading produced a hop (wall / corner / snare). */
  stepBackBlockedMs?: number;
  /** After-cast chain still owed, in cast order (see RotationSnapshot.followUpChain). */
  pendingFollowUp?: RuleAfterStep[];
  pendingFollowUpUntil?: number;
  /** After a step-back, do not close below the dest distance until this time. */
  stepBackHoldUntil?: number;
  stepBackHoldYd?: number;
  // Armed mechanic move from a rotation `kind:'move'` row, honoured at the TOP of
  // `advanceGapClose` (before held-key / step-back / engage). Cite: PLAN.md §7.5.
  pendingMechanicMove?: RuleMove;
  // The bag object this unit is WALKING to press: a click needs INTERACTION_DISTANCE, so a far pick
  // becomes a `move_to` that outlives `RUNOUT_YIELD_AFTER_MS`. Cite: ObjectDefines.h:25.
  pendingObjectClick?: number;
  // This move WINDOW already reported `mechanic_move_done`. Per-window or the two counters cannot be
  // compared: naxxramas read move 303 and moveDone 2016 before it. Cleared at the new-claim edge.
  mechanicMoveDone?: boolean;
  // School halt from a `kind:'halt_dps'` row this tick. `'all'` = any damaging cast, else one or
  // more SpellDef.school strings. Cleared when a non-halt rule wins.
  haltDpsSchool?: HaltDpsSchool;
  // creature_template.entry bodies the armed halt covers; absent = every body. Set and cleared with
  // `haltDpsSchool` in the same three places. Cite: ENGINE-REBUILD E5.6.
  haltDpsEntries?: readonly number[];
  // When that halt stops being this unit's live answer — `nextWakeAt` at the arming decision, since
  // `haltDpsSchool` is a latch only pickAction clears. Absent or non-finite = do not trust per tick.
  haltDpsUntil?: number;
  // Kill-order creature_template.entry list for this tick, on DPS and off-tanks only, never the main
  // tank. pickAction.ts:2259 publishes it; sessionFocus.ts:183 reads it without re-deriving.
  killOrderEntries?: readonly number[];
  // Last body-avoidance heading (null when nothing is in the way), reused 2 of 3 ticks while it
  // still points toward dest. Cite: recoil-rts.md §3.
  lastAvoidanceDir: { x: number; y: number } | null;
}

/** A consumed-on-next-cast spell modifier (see SpellEffect `next_cast_mod`). */
export interface PendingSpellMod {
  spellId: number;
  name: string;
  appliesTo: 'any' | 'nature' | 'heal' | 'summon' | 'curse';
  critAdd?: number;
  instant?: boolean;
  freeCost?: boolean;
  // SPELLMOD_COST signed % applied to the already-resolved cast cost (Fel Domination −50).
  // Not SpellDef.costPct (ManaCostPercentage × create mana).
  costModPct?: number;
  /** SPELLMOD_COST flat (Warrior's Wrath −50 rage, Retributive Smite −300 mana). */
  costFlat?: number;
  effectPct?: number;
  /** SPELLMOD_CASTING_TIME flat ms (Nature's Grace −500). */
  castTimeFlat?: number;
  /** Source SpellFamilyName. Cite: SpellModifier::isAffectedOnSpell family equality. */
  spellFamilyName?: number;
  /** EffectItemType / spell_affect mask. 0 = family-name only. */
  familyFlags?: number;
  // The holder's own 107/108 rows. When present these decide what consumes it and what applies;
  // the fields above are derived shorthand. Cite: spellModIntents.chargedSpellModsFromSpell.
  rows?: readonly OwnedSpellMod[];
}

export interface TotemView {
  slot: TotemSlot;
  side: TotemSide;
  name: string;
  hp: number;
  maxHp: number;
  remainingMs: number;
  casting: { spellId: number; name: string; startedAt: number; endsAt: number } | null;
  iconSpellId?: number;
  /** The player spell that summoned this totem — lets the UI name/icon it and the auto-battler twist. */
  summonSpellId?: number;
  /** Who dropped it (player or ally_N) — meter folds totem damage into this owner. */
  ownerSide?: Side;
  /** Kit auras this totem is currently granting the party, with their real remaining time. */
  auras?: { spellId: number; name: string; remainingMs: number }[];
  // Widest SpellRadius yards across this totem's kit — the ground it covers. `auras` only lists what
  // it grants the PLAYER, so Searing / Magma / Earthbind reported no reach. Omitted, never defaulted.
  auraRadiusYd?: number;
}

/** Armed hunter trap GO (SUMMON_OBJECT_SLOT1) — the chip lives on the ground at `pos`, not on a unit. */
export interface TrapView {
  spellId: number;
  name: string;
  remainingMs: number;
  /** GO trigger radius (yards). Classic trap GOs bake trap.radius = 5. */
  radiusYd: number;
  /** Who armed it (player or ally_N). */
  ownerSide: Side;
  triggerSpellId: number;
  /** Placement yards (caster feet at arm). Absent when the session has no geometry. */
  pos?: CombatPosYd;
}

export type { CombatSession } from './session-types.ts';
