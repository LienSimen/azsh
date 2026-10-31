// ---- Creatures ------------------------------------------------------------

import type { School } from './primitives.ts';

// One `creature_template_classlevelstats` row after loader adjustments. Primary stats are optional:
// this DB dump lacks the Strength/Agility columns, so treat missing as 0. Cite: ObjectMgr.cpp:779.
export interface CreatureClassLvlStatsRow {
  level: number;
  unitClass: number;         // creature UnitClass: 1 Warrior, 2 Paladin, 8 Mage
  baseHealth: number;
  baseMana: number;
  baseDamage: number;
  baseMeleeAttackPower: number;
  baseRangedAttackPower: number;
  baseArmor: number;
  strength?: number;
  agility?: number;
  stamina?: number;
  intellect?: number;
  spirit?: number;
}

// One `pet_levelstats` row. Hunter pets always look up creature_entry = 1; summons use their own
// template entry. Cite: ObjectMgr.cpp ~2946–3055; Pet.cpp InitStatsForLevel ~1199–1398.
export interface PetLevelStatsRow {
  creatureEntry: number;
  level: number;
  hp: number;
  mana: number;
  armor: number;
  str: number;
  agi: number;
  sta: number;
  inte: number;
  spi: number;
}

// Raw `creature_template` SelectLevel inputs, preferred over legacy baked hpMin/dmgMin. A NEGATIVE
// multiplier means ignore that CLS branch and fall back to the Min/Max template fields.
export interface CreatureTemplateScaling {
  minLevel: number;
  maxLevel: number;
  unitClass: number;
  rank: number;              // CREATURE_ELITE_*
  healthMultiplier: number;
  powerMultiplier: number;
  damageMultiplier: number;
  damageVariance: number;
  armorMultiplier: number;
  experienceMultiplier: number;
  /** Optional primary-stat multipliers (creature_template z2822). Absent ⇒ treat as 1 / unused. */
  strengthMultiplier?: number;
  agilityMultiplier?: number;
  staminaMultiplier?: number;
  intellectMultiplier?: number;
  spiritMultiplier?: number;
  minLevelHealth: number;
  maxLevelHealth: number;
  minLevelMana: number;
  maxLevelMana: number;
  minMeleeDmg: number;
  maxMeleeDmg: number;
  minRangedDmg: number;
  maxRangedDmg: number;
  armor: number;
  meleeAttackPower: number;
  rangedAttackPower: number;
  meleeBaseAttackTime: number;
  rangedBaseAttackTime: number;
}

// One creature's `creature_immunities` set 0. Types 2/3/5 hold zero rows in both tiers and the baker
// throws rather than drop one, so they have no field here. Cite: Creature.cpp:2412-2431.
export interface CreatureImmunities {
  /** IMMUNITY_EFFECT (0) — SpellEffect ids this creature ignores. 18 of 19 rows are ATTACK_ME. */
  effects?: number[];
  /** IMMUNITY_STATE (1) — AuraType ids that never apply (11 MOD_TAUNT, 65, 137, 33 snare). */
  states?: number[];
  /** IMMUNITY_DISPEL (4) — OR of `1 << DispelType`; 127 of 144 rows are poison. */
  dispelMask?: number;
}

export interface CreatureDef {
  entry: number;
  name: string;
  level: number;
  hpMin: number;
  hpMax: number;
  dmgMin: number;            // per-swing melee range (baked)
  dmgMax: number;
  attackTimeMs: number;
  armor: number;
  lootId: number;
  minGold: number;           // copper
  maxGold: number;
  // Legacy display kill-XP scalar. The grant path does NOT use it — killXpAmount computes
  // Formulas.h Gain from player and mob levels, rank and ExperienceMultiplier.
  xp: number;
  // Template `ExperienceMultiplier`, applied once at the XP grant choke after BaseGain and the
  // elite mult. Default 1. Not pre-multiplied into baked `xp`, so it cannot double-apply.
  experienceMultiplier?: number;
  // Raw SelectLevel inputs from creature_template. When present, fight setup uses selectCreatureLevel
  // instead of rolling `hpMin`/`hpMax` alone; fixtures without it keep the legacy behaviour.
  scaling?: CreatureTemplateScaling;
  // CreatureDisplayInfo id (most-probable ModelId per creature_template_model, baked by
  // enrich-creature-display.mjs). Keys public/portraits/creature/<displayId>.webp sprites.
  displayId?: number;
  creatureType?: number;     // CMaNGOS CreatureType (see CREATURE_TYPE: 1 Beast, 6 Undead, 7 Humanoid, …); baked for all typed mobs
  // creature_template.DamageSchool — the SPELL_SCHOOL index for this creature's WHITE hits. Non-zero
  // (100 of 10,384) means the swing is magical: resistance applies, armor does not, no block.
  damageSchool?: number;
  // creature_template.ResistanceHoly..Arcane. Non-zero on 532 of 10,384; Ossirian carries 1000 in
  // five schools, which is what his crystals strip. Cite: Creature.cpp:585-590 SetCreateResistance.
  resistances?: Partial<Record<School, number>>;
  // creature_template.RegenerateStats. Absent means the 14 every other row carries
  // (HEALTH|POWER_IN_COMBAT|POWER). Cite: Creature.h:425-428; Creature.cpp:1803-1808.
  regenerateStats?: number;
  // creature_template.CreatureTypeFlags. TAMEABLE 0x1 is the third half of isTameable.
  // Cite: CreatureDefines.h:282-317; Creature.h:199-202.
  typeFlags?: number;
  // UNIT_FIELD_COMBATREACH in yards. Melee reach is BOTH bodies' reach plus 1.33, floored at 5,
  // which is why a boss is meleeable from further out. Cite: Object.cpp:1741-1758.
  combatReachYd?: number;
  family?: number;           // CreatureFamily (1 Wolf, 3 Spider, 5 Boar, …) — pet diet/abilities
  tameable?: boolean;        // a Beast a Hunter can tame as a pet
  mana?: number;             // baked max mana pool (MaxLevelMana); Demons carry one, Beasts 0 (Focus)
  // Pet ability spell ids a pet from this creature CAN use — every ability and rank it could ever
  // have. buildPet keeps only the innate kit plus ranks a book unlocked; absent => auto-attack only.
  petSpells?: number[];
  // The innate ability ranks a pet of this creature knows for free — its default kit. Everything
  // else in `petSpells` is book-taught, and this must be a subset of it.
  petDefaultSpells?: number[];
  // Auto-applied family passives for a pet of this family, using the exact sPetFamilySpellsStore
  // filter: IS_ABILITY|PASSIVE|DO_NOT_DISPLAY|DO_NOT_LOG all set. Cite: DBCStores.cpp ~365.
  petFamilyPassives?: number[];
  // CreatureFamily.PetFoodMask for tameable beasts (bit = 1<<(FoodType-1); wolf=1 meat-only,
  // cat=3 meat+fish). Pet::HaveInDiet gates feeding on it. Baked by enrich-pet-diet.mjs.
  petFoodMask?: number;
  // Spells this creature casts IN COMBAT: EventAI ACTION_T_CAST rows plus its creature_spell_list.
  // `creature_template_spells` is deliberately NOT here — see `charmSpells`; totems are the exception.
  spells?: number[];
  // The charm / pet ACTION BAR from creature_template_spells, loaded Disabled so it never casts on
  // the creature's own AI. Totem::Summon ignores the flag, so reading `spells` left 91 totems hollow.
  charmSpells?: number[];
  // Structured cast list (System 9): EventAI ACTION_T_CAST rows with optional combat-timer / on-aggro / HP%
  // params from creature_ai_scripts, plus armed spell-list rows.
  creatureCasts?: CreatureCastEntry[];
  // Top-level creature_spell_list schedule, rows verbatim. The engine arms these as TIMER_IN_COMBAT
  // slots on the same scheduler as creatureCasts. Distinct from ai.spellLists. Cite: UnitAI.cpp:1186.
  spellList?: CreatureSpellListEntry[];
  // FE1 full EventAI bake (extract only; FE2 interprets): raw DB-shaped scripts plus optional
  // summons and spell-list rows. Does not replace creatureCasts/spells.
  ai?: CreatureAiBundle;
  // creature_template.SpeedRun — run RATE, multiplied by Unit.cpp:66 baseMoveSpeed[MOVE_RUN] 7.0
  // for yd/s. The DB default 1.14286 is 8 yd/s. Cite: Creature.cpp:1580-1584 SetBaseRunSpeed.
  speedRun?: number;
  // creature_template.Detection — base aggro LOS yards for GetAttackDistance. Absent → engine default 18
  // (Unit.h GetDetectionRange).
  detectionRange?: number;
  // creature_template.CallForHelp — assist radius override; 0/absent →
  // CONFIG_FLOAT_CREATURE_FAMILY_ASSISTANCE_RADIUS (5).
  callForHelpRadius?: number;
  /** creature_template.Leash — evade range (baked for future; not full pathing this system). */
  leash?: number;
  // How many of this creature stand in the open world at once, when that is FEWER than its spawn
  // rows: spawn_group.MaxCount / pool_template.max_limit over its guids. Absent = every row is a
  // body. Cite: spawn_group 19983 "Hogger 448" MaxCount 1 over 6 rows; ObjectMgr LoadSpawnGroups.
  spawnCap?: number;
  /** creature_template.MechanicImmuneMask — (1 << (mechanic-1)); gates spell application. */
  mechanicImmuneMask?: number;
  /** creature_template.SchoolImmuneMask — (1 << school); gates spell application. */
  schoolImmuneMask?: number;
  // creature_immunities set 0, applied on spawn — the per-creature immunity SET, separate from the
  // two template masks above. Cite: Creature.cpp:613; ObjectMgr.cpp:945-975.
  immunities?: CreatureImmunities;
  // creature_template.ExtraFlags — selected bits: NO_AGGRO_ON_SIGHT (2), NO_CALL_ASSIST (2048), GUARD
  // (1024), AGGRO_ZONE (512). See domain/creatureAi CREATURE_EXTRA_FLAG.
  extraFlags?: number;
  // creature_template.StaticFlags1 (DB) / CreatureInfo.StaticFlags — raw bitfield. Wave E: NO_XP bit
  // exposed as `noXp`. Cite: CreatureDefines.h CreatureStaticFlags.
  staticFlags?: number;
  // creature_template.StaticFlags2. NO_CRUSHING_BLOWS (0x10) is the combat consumer. Cite:
  // CreatureDefines.h CreatureStaticFlags2; Unit.cpp:3109 CanCrushInCombat.
  staticFlags2?: number;
  // creature_template.UnitFlags — UNIT_FIELD_FLAGS at spawn, raw. Read it with the masks in
  // `domain/creature/unitFlags.ts`, never bit-by-bit at the call site. Cite: Unit.h:468-503.
  unitFlags?: number;
  // CreatureStaticFlags::NO_XP (0x2) from StaticFlags — kill grants 0 XP. Cite: Creature.cpp IsNoXp;
  // Formulas.h Gain early-out. Wave E bake.
  noXp?: boolean;
  // creature_template.GossipMenuId — join key into GameData.gossipMenus. Cite: Creature.h
  // CreatureInfo.GossipMenuId. Wave E bake; 0/absent = no gossip tree.
  gossipMenuId?: number;
  // creature_template.Faction — for CanAssistTo same-faction check (Wave 4B pack assist). Cite:
  // Creature.cpp CanAssistTo GetFaction match.
  factionId?: number;
  // Reputation awarded on kill: up to 2 factions with a standing `value`, a `maxStanding` cap and
  // an `isTeamAward` spread. `teamDependent` means only the player's own team variant applies.
  onKillRep?: {
    teamDependent: boolean;
    rewards: Array<{ faction: number; value: number; maxStanding: number; isTeamAward: boolean }>;
  };
}

// FE1 — the full EventAI payload on CreatureDef. Fields are DB-shaped and action/event semantics
// are NOT interpreted here. Cite: CreatureEventAI.h; sql creature_ai_scripts.
export interface CreatureAiBundle {
  /** Raw EventAI scripts (creature_ai_scripts), one entry per script row. */
  scripts?: CreatureAiScript[];
  /** creature_ai_summons placements referenced by this creature's scripts (keyed by id). */
  summons?: CreatureAiSummon[];
  /** creature_spell_list rows for creature_template.SpellList when tables exist. */
  spellLists?: CreatureSpellListEntry[];
  // Optional targeting defs (creature_spell_targeting) used by spellLists.targetId. Only attached when the
  // targeting table is present and referenced.
  spellTargeting?: CreatureSpellTargeting[];
}

/** One creature_ai_scripts row — event + up to 3 actions of any type (not CAST-only). */
export interface CreatureAiScript {
  /** creature_ai_scripts.id (script PK). */
  id: number;
  /** event_type (EventAI_Type). */
  eventType: number;
  /** event_chance 0–100. */
  eventChance: number;
  /** event_flags bitfield (EFLAG_REPEATABLE = 0x01, …). */
  eventFlags: number;
  /** event_inverse_phase_mask — phases where this event does NOT fire. */
  eventInversePhaseMask?: number;
  eventParam1: number;
  eventParam2: number;
  eventParam3: number;
  eventParam4: number;
  /** Wider dumps may have event_param5/6 (CreatureEventAIMgr SELECT). */
  eventParam5?: number;
  eventParam6?: number;
  /** Up to 3 actions; trailing NONE (type 0) slots may be omitted. */
  actions: CreatureAiAction[];
}

/** One actionN_* triple from creature_ai_scripts. */
export interface CreatureAiAction {
  /** actionN_type (EventAI_ActionType; ACTION_T_CAST = 11, ACTION_T_SUMMON_ID = 32, …). */
  type: number;
  param1: number;
  param2: number;
  param3: number;
}

// creature_ai_summons placement. Referenced by ACTION_T_SUMMON_ID param3 (SpawnId). Cite: CreatureEventAI.h
// CreatureEventAI_Summon; sql creature_ai_summons.
export interface CreatureAiSummon {
  id: number;
  x: number;
  y: number;
  z: number;
  o: number;
  /** spawntimesecs — despawn/respawn window (seconds). */
  spawnTimeSecs: number;
}

// One creature_spell_list row (list Id + Position). Linked via creature_template.SpellList. Cite: sql
// creature_spell_list / ObjectMgr LoadCreatureSpellLists.
export interface CreatureSpellListEntry {
  listId: number;
  position: number;
  spellId: number;
  flags: number;
  targetId: number;
  scriptId?: number;
  availability?: number;
  probability?: number;
  initialMin?: number;
  initialMax?: number;
  repeatMin?: number;
  repeatMax?: number;
  combatCondition?: number;
  listName?: string;
  chanceSupportAction?: number;
  chanceRangedAttack?: number;
}

// One unit_condition Variable/Op/Value slot. `op` is ConditionOperation and `variable` is
// UnitCondition, both defaulting to 0 (NONE), which CheckOp passes.
export interface UnitConditionTerm {
  variable: number;
  op?: number;
  value?: number;
}

// unit_condition row. Terms AND together unless `flags` carries UNIT_CONDITION_FLAG_OR (0x1). Cite:
// UnitCondition.cpp Meets; UnitCondition.h:118-121.
export interface UnitConditionDef {
  id: number;
  terms: UnitConditionTerm[];
  flags?: number;
  // OR row with a spare slot: the empty slot's meets() returns true and the loop returns on the
  // first true, so the row always passes. Source behaviour, recorded at bake time.
  orShortCircuit?: boolean;
}

/** One friend/enemy clause: count units meeting `condition`, compare with `op` against `count`. */
export interface CombatConditionClause {
  condition: number;
  op?: number;
  count?: number;
}

// combat_condition row — the gate on a creature_spell_list entry. Cite: Globals/CombatCondition.h
// CombatConditionEntry; CombatCondition.cpp Meets.
export interface CombatConditionDef {
  id: number;
  worldStateExpression?: number;
  selfCondition?: number;
  targetCondition?: number;
  friend?: CombatConditionClause[];
  friendLogic?: number;
  enemy?: CombatConditionClause[];
  enemyLogic?: number;
}

/** creature_spell_targeting row when table present. */
export interface CreatureSpellTargeting {
  id: number;
  type: number;
  param1: number;
  param2: number;
  param3: number;
  unitCondition?: number;
}

// One enemy cast from creature_template_spells and/or EventAI ACTION_T_CAST (11). Timers and
// conditions appear only when sourced from event_param*; never invented.
export interface CreatureCastEntry {
  spellId: number;
  // creature_spell_list.CombatCondition — a combat_condition id gating this row at pick time. Cite:
  // UnitAI.cpp:1218-1224 UpdateSpellLists.
  combatCondition?: number;
  /** ScriptDev instance-data gate (IR timer.gate). Cite: zulgurub.h TYPE_*; dataGatePasses. */
  instanceDataField?: number;
  instanceDataEquals?: number;
  instanceDataNotEquals?: number;
  // Skip unless the current victim is known out of melee. Cite: boss_grobbulus.cpp:97-110
  // CanReachWithMeleeAttack.
  requireVictimNotInMelee?: boolean;
  /** Fire timer actions without casting. Cite: boss_four_horsemen.cpp:169-174. */
  pollOnly?: boolean;
  /** Exhaust after this many CAST_OK. Cite: boss_gothik.cpp:305 m_teleportCount >= 4. */
  maxFires?: number;
  /** SCHEME_HIGHEST_HP among the first N threat entries in melee. Cite: boss_patchwerk.cpp:114-127. */
  highestHpTopThreat?: number;
  /** Shuffle and cast `ids[waveLeft-1]`. Cite: boss_fankriss.cpp:91-99,141-157. */
  rotateSpellIds?: number[];
  // One urand pick per SPAWN, held for the whole fight. Cite: zulgurubScripts.cpp:61,110-115.
  pickPerSpawnSpellIds?: number[];
  // An empty friendly-selector pool falls back to SELF. Cite: boss_sulfuron_harbinger.cpp:104-105.
  friendlyFallbackSelf?: boolean;
  // DoSelectLowestHpFriendly radius; pairs with friendlyHpDeficit as its minHPDiff.
  // Cite: UnitAI.cpp DoSelectLowestHpFriendly; boss_sulfuron_harbinger.cpp:162.
  friendlyLowestHpYd?: number;
  waveMinCount?: number;
  waveMaxCount?: number;
  intraWaveMinMs?: number;
  intraWaveMaxMs?: number;
  /** EventAI event_type: 0 TIMER_IN_COMBAT, 2 HP, 3 MANA, 4 AGGRO, 9 RANGE, 12 TARGET_HP, … */
  eventType?: number;
  initialMinMs?: number;
  initialMaxMs?: number;
  repeatMinMs?: number;
  repeatMaxMs?: number;
  /** EVENT_T_HP / TARGET_HP: percentMax / percentMin (CreatureEventAI.cpp percent_range). */
  hpPctMax?: number;
  hpPctMin?: number;
  /** EVENT_T_MANA / TARGET_MANA: ManaMax% / ManaMin%. */
  manaPctMax?: number;
  manaPctMin?: number;
  /** EVENT_T_RANGE: MinDist / MaxDist yards. */
  rangeMinYd?: number;
  rangeMaxYd?: number;
  /** EVENT_T_MISSING_AURA / TARGET_MISSING_AURA / AURA: SpellID + stack threshold. */
  auraSpellId?: number;
  /** Stack amount required (MISSING: re-cast when below; default 1). */
  auraStacks?: number;
  // EVENT_T_FRIENDLY_HP: absolute HP deficit (or percent when friendlyHpIsPercent). Cite: CreatureEventAI.h
  // friendly_hp ~697–704; CheckEvent ~379–390.
  friendlyHpDeficit?: number;
  /** EVENT_T_FRIENDLY_HP / FRIENDLY_IS_CC / FRIENDLY_MISSING_BUFF: scan radius yards. */
  friendlyRadiusYd?: number;
  /** EVENT_T_FRIENDLY_HP isPercent (event_param5). */
  friendlyHpIsPercent?: boolean;
  // EVENT_T_FRIENDLY_MISSING_BUFF: required buff spell id. Cite: CreatureEventAI.h friendly_buff ~713–721.
  friendlyBuffSpellId?: number;
  // EVENT_T_FRIENDLY_MISSING_BUFF inCombat mode: 0 combat-only, 1 both, 2 OOC-only. Cite:
  // CreatureEventAI.cpp ~409–428.
  friendlyBuffInCombat?: number;
  /** EVENT_T_FACING_TARGET: 0 = expect back, 1 = expect front. Cite: facingTarget ~770–777. */
  facingBackOrFront?: number;
  /** EVENT_T_SELECT_ATTACKING_TARGET / OOC_LOS range band. */
  selectMinRangeYd?: number;
  selectMaxRangeYd?: number;
  /** EVENT_T_RECEIVE_AI_EVENT: AIEventType + optional sender entry. Cite: receiveAIEvent ~754–761. */
  receiveAiEventType?: number;
  receiveAiSenderEntry?: number;
  /** EVENT_T_RECEIVE_EMOTE: emote id. Cite: receive_emote ~737–742. */
  receiveEmoteId?: number;
  /** EVENT_T_SUMMONED_UNIT / SUMMONED_JUST_DIED / DESPAWN: creature entry filter (0 = any). */
  summonedCreatureId?: number;
  /** EVENT_T_SPELLHIT / SPELLHIT_TARGET / SPELL_CAST: spell id filter (0 = any for hit). */
  spellHitSpellId?: number;
  /** EVENT_T_SPELLHIT school mask (-1 / 0xffffffff = any). */
  spellHitSchoolMask?: number;
  // event_chance 0–100. Absent = 100. Cite: CreatureEventAI.cpp ProcessEvent `event_chance <= rnd % 100` →
  // fail and reset timer.
  chancePct?: number;
  // event_flags bitfield. EFLAG_REPEATABLE = 0x01 — without it, timer-based events exhaust after one fire
  // (CreatureEventAI.cpp ResetEvent).
  eventFlags?: number;
  // event_inverse_phase_mask — event is skipped when `(mask & (1 << m_Phase)) != 0`. Cite:
  // CreatureEventAI.cpp CheckEvent ~266–270.
  eventInversePhaseMask?: number;
  castFlags?: number;
  // SPELL_LIST_FLAG_NON_BLOCKING — cast outside the one-action roll, so it never competes for the slot. 1
  // armed row. Cite: UnitAI.cpp:1265-1269.
  nonBlocking?: boolean;
  // SPELL_LIST_FLAG_CATEGORY_COOLDOWN — impose the category cooldown, not the personal one. 4 armed rows on
  // one list (the Four Horsemen). Cite: Creature.cpp:1553.
  categoryCooldown?: boolean;
  // `creature_spell_list.ScriptId` — a `dbscripts_on_relay` id started when this cast succeeds. 5 armed
  // rows. Cite: UnitAI.cpp:1259 ScriptsStart(SCRIPT_TYPE_RELAY, …).
  relayScriptId?: number;
  target?: number;
  // When 'spell_list', `target` is a creature_spell_list TargetId, not an EventAI TARGET_T_*, and
  // combat routes through selectTarget(..., 'spell_list') to disambiguate the overlapping 0–7 ids.
  targetSpace?: 'eventai' | 'spell_list';
  // This row's cadence belongs to creature_spell_list, so it obeys the 1200 ms poll even though it
  // reached the scheduler as a ScriptDev timer. 164 IR timers across 43 lists are in that shape.
  spellListPolled?: boolean;
  /** Unit::getClass() filter (enum Classes). Cite: SharedDefines.h:65-79; boss_nefarian.cpp:270-280. */
  selectClass?: number;
  /** SELECT_FLAG_IN_MELEE_RANGE as a target PICK. Cite: boss_twinemperors.cpp:256. */
  selectInMelee?: boolean;
  // The same flag as an EXISTENCE test before a self-centred cast: fire only while somebody is in
  // melee reach. Cite: shadowfang_keep.cpp:477 Thundershock; darkshore.cpp:805 Thunderclap.
  requireMeleeTargetExists?: boolean;
  // creature_spell_list Probability (weight among ready spells; 0 = position priority). Kept for scheduler
  // / tests; not EventAI event_chance (0–100). Cite: UnitAI.cpp UpdateSpellLists ~1199–1292.
  spellListProbability?: number;
  /** creature_ai_scripts.id — stable priority key. */
  scriptId?: number;
  // ScriptDev startDisabled — slot arms exhausted until arm_timer. Cite: boss_marli.cpp:72
  // AddCombatAction(MARLI_CHARGE, true).
  startDisabled?: boolean;
}
