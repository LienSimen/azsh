// SI2 / SI2.5 spell interpreter types — pure engine, no DOM / wall-clock. Design:
// docs/archive/SPELL-INTERPRETER.md §2.2 + §2.5.

import type { SpellDef, SpellEffect } from '../../../data/schema.ts';

// Snapshot of an aura on the target for consume / Swiftmend specials. Pure data — no Unit graph. Cite:
// EffectSchoolDMG Conflagrate; EffectHeal Swiftmend.
export interface TargetAuraSummary {
  spellId: number;
  /** SPELL_AURA_* (3 periodic damage, 8 periodic heal, …). */
  auraType: number;
  spellFamilyName?: number;
  spellFamilyFlags?: number;
  /** Tick amount (modifier m_amount). */
  amount: number;
  /** Remaining or full duration ms (Swiftmend uses GetSpellDuration / tick count). */
  durationMs?: number;
  /** EffectAmplitude for the periodic slot (ms). */
  amplitudeMs?: number;
  /** True when aura was applied by the casting unit (Conflagrate caster-only). */
  casterIsSelf?: boolean;
}

import type { InterpretIntent } from './types-intent.ts';
export type { InterpretIntent };

// The optional cast-time context. Amounts are NOT rolled here: min and max ranges are emitted like the
// bake mapper. Omitting a field is the thin-bake path, and a cast-time special applies only when set.
export interface InterpretContext {
  // Explicit duration override (ms). Highest priority for duration resolution. Oracle injects baked effect
  // durationMs for parity.
  durationMs?: number;
  // The duration index, used when no explicit duration is given. Honestly 0 or undefined when unknown
  // — no magic ten or twelve second fallback. Cite: interpreter/duration.ts.
  durationIndex?: number;
  // The caster level for per-level scaling and the energize level scripts. Omitted by default for bake
  // parity: the mapper does not apply the per-level term. Cite: Object.cpp CalculateSpellEffectValue.
  casterLevel?: number;
  // Caster gender (0=male, 1=female) for gender-morphed morph outcomes like Cooked Deviate Delight.
  // Defaults to 0 (male) when absent, aligning with getGender. Cite: getGender GENDER_MALE=0.
  casterGender?: 0 | 1;
  /** SpellLevel for perLevel delta (defaults to spell.spellLevel ?? spell.reqLevel ?? 0). */
  spellLevel?: number;
  // SpellEntry.baseLevel — the floor the caster level is clamped to before spellLevel is subtracted. 6,128
  // baked rows. Cite: Object.cpp:2930-2931.
  spellBaseLevel?: number;
  /** SpellEntry.maxLevel — the ceiling of the same clamp (only when > 0). 1,306 rows. */
  spellMaxLevel?: number;
  // Creature-level scaling on a CREATURE cast. The CALLER owns both halves of the C++ gate — a creature
  // caster AND the attribute — so absent means no scaling, which every player cast wants.
  creatureLevelScaling?: {
    unitClass: number;
    baseDamageAt: (level: number, unitClass: number) => number | undefined;
  };
  // Combo points on the target. Finisher AP terms (Eviscerate, Ferocious Bite, Rip, Rupture) use this when
  // set. Bake attaches pointsPerComboPoint on effects but does not fold CP×AP.
  comboPoints?: number;
  // The injected rng for chance rolls, returning a value in [0,1) with the draw order documented at the
  // call site. Absent, a chance special takes the always-fire path the bake emits.
  rng?: () => number;
  // Combat clock ms for aura-42 ICD (SpellAuraHolder::IsProcReady). Never wall-clock. Cite: SpellAuras.cpp
  // SetProcCooldown :5990; LOCK 9b.
  nowMs?: number;
  /** Weapon attack time ms for PPM (GetAttackTime). Cite: UnitAuraProcHandler.cpp:598–600. */
  weaponSpeedMs?: number;
  // The combat event for an optional proc roll during interpretation. With an rng, the proc aura
  // evaluates its chance and cooldown. A thin bake omits it, so no roll is drawn.
  procEvent?: {
    procFlags: number;
    procEx: number;
    schoolMask?: number;
    spellFamilyName?: number;
    spellFamilyFlags?: number;
  };
  // Per-holder ICD readyAt for optional proc roll (same clock as nowMs). Cite:
  // SpellAuraHolder::IsProcReady.
  procCooldownReadyAt?: number;
  // Resolve triggered spell defs for `proc_triggered_cast` (SI6 / tests). Cite: UnitAuraProcHandler
  // TriggerProccedSpell LookupEntry.
  spellLookup?: (spellId: number) => import('../../../data/schema.ts').SpellDef | undefined;
  // SI5 gate: `false` forces bake `effects[]` fallback; `true` forces interpreter. Default (omit) =
  // interpreter on when rawEffects exist. Env: `PHONECRAFT_SI_INTERPRETER=0` disables globally.
  useInterpreter?: boolean;

  // ── SI2.5 cast-time inputs for EffectSchoolDMG / weapon / heal specials ──

  /** Total attack power (BASE_ATTACK). Bloodthirst / Eviscerate / FB / Rip / Rupture. */
  attackPower?: number;
  /** GetShieldBlockValue() — Shield Slam. */
  shieldBlock?: number;
  /** Current energy (Ferocious Bite dump). */
  energy?: number;
  // Current rage in *display* units (0–100). Execute multiplies by 10 for CMaNGOS storage. Cite:
  // Warrior.cpp:26–28 GetPower(POWER_RAGE) * DmgMultiplier; engine maxPower 100.
  rage?: number;
  // Effect DmgMultiplier for energy→damage (Ferocious Bite). CMaNGOS: damage += energy *
  // DmgMultiplier[eff]. Default 1 when omitted and energy set.
  dmgMultiplier?: number;
  /** Meteor-like split: damage /= count. Cite: EffectSchoolDMG 24340/26558/28884/26789. */
  targetCount?: number;
  /** Target current health — Thundercrash 25599. */
  targetHealth?: number;
  /** Target max health — Polymorph Heal Effect 12939. */
  targetMaxHealth?: number;
  /** SpellIconID when not on SpellDef. Bloodthirst=38, Shield Slam=413. Cite: SpellEffects.cpp:280–286. */
  spellIconId?: number;
  /** Active auras on the unit target (Conflagrate consume Immolate; Swiftmend HoT pick). */
  targetAuras?: TargetAuraSummary[];
  casterAuras?: TargetAuraSummary[];
  // Active aura spell ids on the *caster* (Entrapment talent holders for Frost Trap pulse). Cite:
  // SpellEffects.cpp:690–695 m_caster->GetSpellAuraHolder(spellId).
  casterAuraSpellIds?: number[];
  // SPELL_AURA_OVERRIDE_CLASS_SCRIPTS auras on the *target* (miscValue = script id). Improved Scorpid Sting
  // ranks: 2388/2389/2390 → 10/20/30% of MOD_STAT amount as stamina remove. Cite: SpellAuras.cpp:3458–3467.
  classScriptAuras?: { miscValue: number }[];
  // Caster class id (SharedDefines Classes). CLASS_ROGUE = 4 — Energize 5530 skip. Cite:
  // SpellEffects.cpp:2094–2097.
  casterClass?: number;
  casterRunSpeedRate?: number;
  // When true, run full EffectWeaponDmg shared-path mods (Ambush 2.5× fixed bonus). Default false →
  // bake-thin strikeBonus (map-spell-effects max flat min). Cite: SpellEffects.cpp:3482–3516.
  fullWeaponPath?: boolean;

  // ── SI3 cast-time inputs ─────────────────────────────────────────────────

  // Unit target is a player. Default true (trainer learn path). False → EffectLearnPetSpell when caster is
  // player. Cite: SpellEffects.cpp:2450–2455.
  unitTargetIsPlayer?: boolean;
  // Target gender (0 male, 1 female). Default 0 (male) when omitted. Cite:
  // SpellEffects.cpp:358 GENDER_MALE.
  unitTargetGender?: 0 | 1;
  // The target's creature type, for the empathy eligibility test when the target is not a player.
  // Omitted, the thin-bake path assumes eligible. Cite: SpellAuras.cpp:4355-4357.
  unitTargetCreatureType?: number;
  // Target is a pet (Creature::IsPet). SPELL_AURA_MOD_POSSESS_PET requires this. Omit → bake-thin assume
  // pet path. Cite: SpellAuras.cpp:2266–2267.
  unitTargetIsPet?: boolean;
  // Unit target class id (SharedDefines Classes). Used by MOD_RANGED_ATTACK_POWER wand-user early-out
  // (priest/mage/warlock). Cite: SpellAuras.cpp:3996–3997; SharedDefines.h CLASSMASK_WAND_USERS.
  unitTargetClass?: number;
  // Whether the spell's immunity-purges-effect attribute is present: with it, a mechanic immunity also
  // removes matching auras on apply. Cite: SpellAuras.cpp:2941-2945.
  immunityPurgesEffect?: boolean;
  // Spell Attributes bit SPELL_ATTR_IS_ABILITY present. Gates MOD_TOTAL_STAT_PERCENTAGE stamina HP rescale.
  // Omit → bake-thin (no HP rescale intent). Cite: SpellAuras.cpp:3561–3567.
  spellIsAbility?: boolean;
  // Unit target level (HandleModThreat Arcane Shroud / Eye of Diminution level scale). Falls back to
  // casterLevel when omitted. Cite: SpellAuras.cpp:2821–2834.
  unitTargetLevel?: number;
  // Target is in a no-weapon shapeshift (cat/bear/…): MOD_DISARM skips attack-time reset. Omit → not feral
  // (attack-time intent may emit for players). Cite: SpellAuras.cpp:2438–2440.
  unitTargetNoWeaponShapeShift?: boolean;
  // Target has UNIT_FLAG_PLAYER_CONTROLLED — FEIGN_DEATH runs resist roll vs NPC attackers. Omit →
  // bake-thin (no resist-roll flag on intent). Cite: SpellAuras.cpp:2390–2410.
  unitTargetPlayerControlled?: boolean;
  // Caster is a player. Default true. Cite: EffectLearnSpell pet branch; EffectSummonGuardian replace path.
  casterIsPlayer?: boolean;
  /** Target has UNIT_STAT_ROOT — KnockBack returns early. Cite: SpellEffects.cpp:5117–5118. */
  targetRooted?: boolean;
  // Item prototype Stackable cap for CREATE_ITEM (DoCreateItem num_to_add clamp). Omit → no stack clamp
  // beyond count ≥ 1. Cite: SpellEffects.cpp:1974–1977.
  itemStackable?: number;
  // Creature template MinLevel/MaxLevel for summon level clamp. Cite: EffectSummonWild :2753–2757;
  // EffectSummonGuardian :2868–2870.
  creatureMinLevel?: number;
  creatureMaxLevel?: number;
  // Engineering skill value when cast from engineering trinket (guardian level = skill/5). Cite:
  // SpellEffects.cpp:2884–2892.
  engineeringSkill?: number;
  /** Cast item is engineering trinket (RequiredSkill ENGINEERING + INVTYPE_TRINKET). */
  castFromEngineeringTrinket?: boolean;
  // Spell is triggered (m_IsTriggeredSpell) — skip guardian replace-on-recast early out. Cite:
  // SpellEffects.cpp:2840.
  isTriggeredSpell?: boolean;
  // Player already has a guardian with this entry (second cast found path). With replaceExisting + no
  // DurationIndex+Category → skip re-summon. Cite: SpellEffects.cpp:2844–2851.
  hasExistingGuardian?: boolean;
  // Spell Category (for guardian recast: DurationIndex && Category keeps re-summon after unsummon). Cite:
  // SpellEffects.cpp:2850.
  spellCategory?: number;
  // Target current power for POWER_BURN / POWER_DRAIN clamp. Cite: SpellEffects.cpp:1814–1818
  // EffectPowerBurn (min(curPower, damage)).
  targetPower?: number;
  // Target power type must match EffectMiscValue for POWER_BURN. Cite: SpellEffects.cpp:1808 GetPowerType()
  // != powertype → return.
  targetPowerType?: number;
  // Existing mini-pet entry for SUMMON_CRITTER same-entry despawn path. Cite: SpellEffects.cpp:5041–5048.
  existingMiniPetEntry?: number;
  // GameObject type (GAMEOBJECT_TYPE_*) for TRANS_DOOR type specials. Cite: SpellEffects.cpp:5349–5397;
  // GameObjectInfo::type.
  gameObjectType?: number;
  // Whether the unit target is alive, which gates the kill, resurrect, damage, heal and aura effects
  // when supplied. Omitted, the thin-bake path emits, since there is no live unit graph.
  unitTargetIsAlive?: boolean;
  // Spell is death-only (IsDeathOnlySpell) — APPLY_AURA may apply on corpse. Cite:
  // SpellEffects.cpp:1737–1739.
  isDeathOnlySpell?: boolean;
  // Spell is death-persistent (IsDeathPersistentSpell) — APPLY_AURA may apply on corpse. Cite:
  // SpellEffects.cpp:1737–1739.
  isDeathPersistentSpell?: boolean;
  /** Caster == unitTarget. INSTAKILL calls finish() before DealDamage. Cite: SpellEffects.cpp:210–211. */
  unitTargetIsSelf?: boolean;
  /** Target is taxi-flying — TELEPORT_UNITS returns early. Cite: SpellEffects.cpp:1685. */
  unitTargetTaxiFlying?: boolean;
  // Dest map id for TELEPORT_UNITS. UINT32_MAX / same as unit map → NearTeleport. Cite:
  // SpellEffects.cpp:1707–1728.
  teleportMapId?: number;
  /** Current map id of unitTarget for same-map check. */
  unitTargetMapId?: number;
  // Player already has an active resurrect request — EffectResurrect early out. Cite:
  // SpellEffects.cpp:4857–4858.
  hasResurrectRequest?: boolean;
  // SpellEntry.speed when not on SpellDef — CHARGE MoveCharge speed. Cite: SpellEffects.cpp:5021; Unit.h
  // BASE_CHARGE_SPEED 27.0f.
  spellSpeed?: number;
  // SpellEntry.EquippedItemClass / EquippedItemSubClassMask when not on SpellDef. PROFICIENCY (60). Cite:
  // SpellEffects.cpp:2321–2330.
  equippedItemClass?: number;
  equippedItemSubClassMask?: number;
  // OPEN_LOCK: target is item (vs gameobject). When set, overrides opcode default (33 → GO path, 59 → item
  // path). Cite: SpellEffects.cpp:2217–2228.
  openLockTargetIsItem?: boolean;
  // Caster power type (Powers enum) for POWER_DRAIN gain-multiplier branch. Cite: SpellEffects.cpp:1780
  // GetPowerType() == powerType && caster != target.
  casterPowerType?: number;
  // Existing m_extraAttacks on unitTarget before ADD_EXTRA_ATTACKS grant. When set, count is clamped so
  // final total ≤ 5. Cite: SpellEffects.cpp:4878–4880.
  existingExtraAttacks?: number;
  // Target player main-hand TEMP_ENCHANTMENT_SLOT id for ENCHANT_HELD_ITEM conflict check. Different id →
  // skip. Cite: SpellEffects.cpp:4618–4619.
  existingTempEnchantId?: number;
  // Target has equipped main-hand item. False → ENCHANT_HELD_ITEM returns. Cite:
  // SpellEffects.cpp:4592–4599.
  targetHasMainHand?: boolean;
  /** Player drunk value 0..0xFFFF for INEBRIATE clamp. Cite: SpellEffects.cpp:4672–4677. */
  currentDrunk?: number;
  /** Cast item entry for SetDrunkValue second arg. Cite: SpellEffects.cpp:4678. */
  castItemEntry?: number;
  // Improved Weapon Totems dummy aura amount (29192/29193) for ENCHANT_HELD_ITEM. Cite:
  // SpellEffects.cpp:4625–4632.
  improvedWeaponTotemsAmount?: number;
  // Caster already has a pet (GetPetGuid non-empty). SUMMON (28) early out. Cite:
  // SpellEffects.cpp:2348–2349.
  hasPet?: boolean;
  // Caster's pet is alive (pet && pet->isAlive()). LEARN_PET_SPELL (57) early out. Cite:
  // SpellEffects.cpp:3386-3404.
  petIsAlive?: boolean;
  // Caster max health — HEAL_MAX_HEALTH amount when full path desired. Bake surface is bare `{ kind:
  // 'heal_max_health' }` without amount. Cite: SpellEffects.cpp:3586–3588.
  casterMaxHealth?: number;
  /** Target max mana for RESURRECT (18) percent path. Cite: SpellEffects.cpp:4823. */
  targetMaxMana?: number;
  // Cast item present and owned by caster — SUMMON_CHANGE_ITEM gate. Omit → bake-thin emit when itemType
  // set. False → skip. Cite: SpellEffects.cpp:2284–2289.
  castItemPresent?: boolean;
  // spell_template.AuraInterruptFlags for MOD_STEALTH breakFlags bake parity. Cite:
  // map-spell-effects.mjs:628–631; SpellAuras.cpp HandleModStealth.
  auraInterruptFlags?: number;
  // Whether the ranged weapon fits the spell's equipped-item requirements, for the ammo-haste aura:
  // with an item class set and this false, the apply is skipped. Cite: SpellAuras.cpp:3957-3959.
  rangedWeaponFitsSpell?: boolean;

  // ── SI3 batch 6 cast-time inputs ─────────────────────────────────────────

  // 2D/3D distance unitTarget → caster (or dest for PULL_TOWARDS_DEST). When < 0.1, EffectPullTowards
  // returns early. Cite: SpellEffects.cpp:5152–5153.
  pullDistance?: number;
  // Dest Z − unitTarget Z for pull projectile speedZ. For PULL_TOWARDS dest is caster position. Cite:
  // SpellEffects.cpp:5139–5158.
  pullHeightDelta?: number;
  // GetTotalAuraModifier(SPELL_AURA_MOD_REPUTATION_GAIN) for CalculateReputationGain. Cite:
  // Player.cpp:6297.
  reputationAuraMod?: number;
  // CONFIG_FLOAT_RATE_REPUTATION_GAIN world rate. Default 1 when finalRep computed. Cite: Player.cpp:6369.
  reputationGainRate?: number;
  /** RepRewardRate.spell_rate for faction (0 → no gain). Cite: Player.cpp:6357–6364. */
  reputationSpellRate?: number;

  // ── SI3 batch 7 cast-time inputs ─────────────────────────────────────────

  /** unitTarget IsInCombat — DISTRACT returns early. Cite: SpellEffects.cpp:2643. */
  unitTargetInCombat?: boolean;
  /** unitTarget has UNIT_STAT_CAN_NOT_REACT — DISTRACT returns. Cite: :2647. */
  unitTargetCanNotReact?: boolean;
  // unitTarget is TYPEID_UNIT (creature). DISTRACT MoveDistract; PICKPOCKET victim gate. Cite:
  // SpellEffects.cpp:2652–2653; :2668.
  unitTargetIsCreature?: boolean;
  // Caster CanAttackNow(unitTarget). PICKPOCKET gate. Cite: :2668. Omit → bake-thin emit (no live unit
  // graph).
  canAttackTarget?: boolean;
  /** Creature already pickpocketed (CREATURE_LOOT_STATUS_PICKPOCKETED). Cite: :2683. */
  pickpocketAlreadyLooted?: boolean;
  /** Creature CanRestockPickpocketLoot(). Cite: :2685. */
  pickpocketCanRestock?: boolean;
  /** Existing loot type is already LOOT_PICKPOCKETING. Cite: :2681. */
  pickpocketLootExists?: boolean;
  /** Caster or target already has duel. Cite: EffectDuel :4236. */
  casterOrTargetHasDuel?: boolean;
  /** Target social HasIgnore(caster). Cite: :4236. */
  targetIgnoresCaster?: boolean;
  // Area allows dueling (AREA_FLAG_DUEL). False → SPELL_FAILED_NO_DUELING. Cite: :4240–4252. Omit →
  // bake-thin allow.
  areaAllowsDuel?: boolean;
  // CONFIG_BOOL_CAST_UNSTUCK. False → EffectStuck return. Cite: :4315–4316. Omit → assume enabled (default
  // world config).
  castUnstuckEnabled?: boolean;
  /** Caster is taxi flying — STUCK return. Cite: :4323–4324. */
  casterTaxiFlying?: boolean;
  /** PLAYER_FLAGS_GHOST — STUCK → RepopAtGraveyard. Cite: :4327–4330. */
  casterIsGhost?: boolean;
  /** IsSpellReady(8690) for hearth path. Cite: :4335. */
  hearthstoneReady?: boolean;
  /** HasItemCount(6948, 1) Hearthstone item. Cite: :4335. */
  hasHearthstoneItem?: boolean;
  /** GetMap()->IsDungeon() — entrance teleport vs nudge. Cite: :4339. */
  casterInDungeon?: boolean;

  // ── SI3 batch 8 cast-time inputs ─────────────────────────────────────────

  // unitTarget's current victim is the caster — ATTACK_ME early out for non-players. Cite:
  // SpellEffects.cpp:3420–3426.
  unitTargetVictimIsCaster?: boolean;
  // unitTarget CanHaveThreatList(). False → AI AttackStart path instead of equalize. Omit → threat-list /
  // bake taunt path. Cite: SpellEffects.cpp:3430–3440.
  canHaveThreatList?: boolean;
  // UNIT_STAT_CAN_NOT_REACT_OR_LOST_CONTROL — blocks AI AttackStart branch. Cite: SpellEffects.cpp:3437.
  unitTargetCanNotReactOrLostControl?: boolean;
  // Equipment/bag slot has an item for DURABILITY_DAMAGE single-slot path. False → silent no-op (C++ if
  // (Item*) gate). Omit → assume present. Cite: SpellEffects.cpp:5229–5233.
  durabilitySlotHasItem?: boolean;
  // Skin player corpse with only the corpse present: true converts it and shows the insignia loot,
  // while false takes the live-owner path. Cite: SpellEffects.cpp:5510-5541.
  skinCorpseOnly?: boolean;

  // ── SI3 batch 9 cast-time inputs ─────────────────────────────────────────

  // The caster's base spell damage bonus for the mana shield and Flametongue folds. No producer today,
  // so omitting it is the thin-bake path; a producer must pass the effect's school.
  spellBaseDamageBonusDone?: number;

  // ── SI4 registry cast-time inputs ─────────────────────────────────────────

  // The cost modifier delta for Life Tap's initialization, where the C++ mutates the cost in place.
  // When set, the cost is the base plus this. Cite: Warlock.cpp:58-60.
  spellModCost?: number;
  // Extra flat from SpellDamageBonusDone/Taken on self for Life Tap script value. Omit → bake-thin script
  // value = base cost. Cite: Warlock.cpp:62–64.
  lifeTapSpellDamageBonus?: number;
  // The caster's dummy auras that affect Life Tap: Improved Life Tap and Plagueheart, the latter
  // changing the health cost without scaling the mana. Cite: Warlock.cpp:87-100.
  lifeTapDummyAuras?: ReadonlyArray<{ spellId: number; amount: number }>;
  // Current caster health for Life Tap OnCheckCast fizzle gate. When set and script value > health →
  // life_tap.fizzled = true (no mana cast). Cite: Warlock.cpp:69–70 GetScriptValue() > GetHealth().
  casterHealth?: number;
  // Active seal for Judgement 20271 when unit graph is not available. judgementSpellId = seal
  // CalculateSimpleValue(EFFECT_INDEX_2) (or equivalent slot). Cite: Paladin.cpp spell_judgement ~93–115.
  activeSeal?: {
    spellId: number;
    judgementSpellId: number;
  };
  // Whether the caster can assist the target, which picks Holy Shock's heal or hurt branch. Omitted,
  // the thin-bake path emits the dual effect only. Cite: SpellEffects.cpp:1449-1452.
  targetCanAssist?: boolean;
  // The spell id of the aura that triggered this cast, used by the judgement intermediates and the
  // shared dummy trigger. Cite: Paladin.cpp:42-71; SpellEffects.cpp:679-715.
  triggeredByAuraSpellId?: number;
  // SpellBaseDamageBonusTaken(schoolMask) for Flametongue Weapon Proc bonusDamage. Added to
  // spellBaseDamageBonusDone before SpellBonusWithCoeffs. Cite: SpellEffects.cpp:1478–1479.
  spellBaseDamageBonusTaken?: number;
  // Cast item GetEnchantmentModifier() for Flametongue Totem Proc. Cite: SpellEffects.cpp:1498
  // GetEnchantmentModifier.
  castItemEnchantmentModifier?: number;
  // Caster health percent 0..100 for Berserking haste formula. Omit → full-health floor haste buff 10% (no
  // CastCustomSpell 26635). Cite: SpellEffects.cpp EffectDummy icon 1661 ~1270–1284; KI-125.
  casterHealthPercent?: number;
  // Caster has Dire Bear Form aura 9634 — Enrage armor reduction −16% vs −27%. Cite:
  // SpellEffects.cpp:1370–1375 case 5229 HasAura(9634).
  hasDireBearForm?: boolean;
  // The Improved Healthstone rank for the create-item table: 0 or omitted is the base item, and the two
  // ranks come from their dummy auras. Cite: Warlock.cpp GetUsableHealthStoneItemType ~136-172.
  improvedHealthstoneRank?: 0 | 1 | 2;
  // Caster channel object is TYPEID_UNIT (Tame Beast dummy 13535 gates on this). Omit/false → silent (C++
  // early skip). True → CastSpell(13481). Cite: Hunter.cpp TameBeastDummy :35–38.
  channelObjectIsUnit?: boolean;
}

export interface UnhandledSlot {
  slot: number;
  effect: number;
  auraName: number;
  reason: string;
}

/** Full EffectWeaponDmg shared accumulation (SI2.5). */
export interface WeaponDamageModel {
  fixedBonus: number;
  weaponPercentMod: number;
  normalized: boolean;
  /** Ambush custom fixed-bonus multiplier (2.5) when family matches. */
  ambushBonusPct?: number;
  /** fixedBonus after Ambush/custom percent integration. */
  resolvedFixedBonus: number;
}

export interface InterpretResult {
  /** Normalized effects comparable to baked SpellDef.effects[]. */
  effects: SpellEffect[];
  // Flat weapon bonus from WEAPON_DAMAGE / NOSCHOOL / NORMALIZED when min > 0. Bake stores this on
  // SpellDef.strikeBonus (not in effects[]). Cite: map-spell-effects.mjs eff 17/58/121.
  strikeBonus?: number;
  /** Hint when a weapon or strike opcode was seen. */
  role?: SpellDef['role'];
  /** Full weapon path model when any weapon opcode ran (for Ambush / normalized tests). */
  weaponDamageModel?: WeaponDamageModel;
  /** Slots skipped (unknown opcode / unmapped aura / empty trigger). */
  unhandled: UnhandledSlot[];
  /** Special-case side effects (consume aura, zero energy, …) — not bake kinds. */
  intents?: InterpretIntent[];
}
