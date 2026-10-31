// SPELL_EFFECT_* / SPELL_AURA_* ids used by the SI2 / SI3 interpreter. Cite: SpellEffectDefines.h /
// SpellAuraDefines.h (cmangos-classic).

// ── Effects (SpellEffectDefines.h) ──────────────────────────────────────────
/** Cite: SpellEffectDefines.h SPELL_EFFECT_INSTAKILL = 1. */
export const SPELL_EFFECT_INSTAKILL = 1;
export const SPELL_EFFECT_SCHOOL_DAMAGE = 2;
// Cite: SpellEffectDefines.h SPELL_EFFECT_DUMMY = 3. SI4 registry: SpellEffects.cpp EffectDummy ~346 →
// dispatchDummy.
export const SPELL_EFFECT_DUMMY = 3;
/** Cite: SpellEffectDefines.h SPELL_EFFECT_TELEPORT_UNITS = 5. */
export const SPELL_EFFECT_TELEPORT_UNITS = 5;
export const SPELL_EFFECT_APPLY_AURA = 6;
// Cite: SpellEffectDefines.h SPELL_EFFECT_ENVIRONMENTAL_DAMAGE = 7. Handler: SpellEffects.cpp:223–238
// EffectEnvironmentalDMG — CalculateSimpleValue + EnvironmentalDamage.
export const SPELL_EFFECT_ENVIRONMENTAL_DAMAGE = 7;
// Cite: SpellEffectDefines.h SPELL_EFFECT_PORTAL = 12. Dispatch → EffectUnused (unused from pre-1.2.1; 2
// spells, no real usage data). Cite: SpellEffects.cpp:70.
export const SPELL_EFFECT_PORTAL = 12;
/** Cite: SpellEffectDefines.h SPELL_EFFECT_POWER_DRAIN = 8. Handler: SpellEffects.cpp EffectPowerDrain. */
export const SPELL_EFFECT_POWER_DRAIN = 8;
/** Cite: SpellEffectDefines.h SPELL_EFFECT_HEALTH_LEECH = 9. */
export const SPELL_EFFECT_HEALTH_LEECH = 9;
export const SPELL_EFFECT_HEAL = 10;
// Cite: SpellEffectDefines.h SPELL_EFFECT_BIND = 11. Handler: SpellEffects.cpp EffectBind :5544–5578 —
// SetHomebindToLocation at current position.
export const SPELL_EFFECT_BIND = 11;
/** Cite: SpellEffectDefines.h SPELL_EFFECT_QUEST_COMPLETE = 16. */
export const SPELL_EFFECT_QUEST_COMPLETE = 16;
export const SPELL_EFFECT_WEAPON_DAMAGE_NOSCHOOL = 17;
// Cite: SpellEffectDefines.h SPELL_EFFECT_RESURRECT = 18. Shared EffectResurrect with RESURRECT_NEW (113) —
// percent health/mana path. Handler: SpellEffects.cpp EffectResurrect.
export const SPELL_EFFECT_RESURRECT = 18;
// Cite: SpellEffectDefines.h SPELL_EFFECT_ADD_EXTRA_ATTACKS = 19. Handler: SpellEffects.cpp
// EffectAddExtraAttacks.
export const SPELL_EFFECT_ADD_EXTRA_ATTACKS = 19;
// Cite: SpellEffectDefines.h SPELL_EFFECT_DODGE = 20. Dispatch → EffectEmpty (marker / client inform).
// Cite: SpellEffects.cpp:78, :190–193.
export const SPELL_EFFECT_DODGE = 20;
// Cite: SpellEffectDefines.h SPELL_EFFECT_EVADE = 21. Dispatch → EffectEmpty (one spell: Evade (DND)).
// Cite: SpellEffects.cpp:79, :190–193.
export const SPELL_EFFECT_EVADE = 21;
// Cite: SpellEffectDefines.h SPELL_EFFECT_PARRY = 22. Handler: SpellEffects.cpp EffectParry —
// SetCanParry(true).
export const SPELL_EFFECT_PARRY = 22;
// Cite: SpellEffectDefines.h SPELL_EFFECT_BLOCK = 23. Handler: SpellEffects.cpp EffectBlock —
// SetCanBlock(true).
export const SPELL_EFFECT_BLOCK = 23;
export const SPELL_EFFECT_CREATE_ITEM = 24;
// Cite: SpellEffectDefines.h SPELL_EFFECT_WEAPON = 25. EffectEmpty — weapon-type proficiency marker
// (ItemSubclass mask); no server body. Cite: SpellEffects.cpp:83 dispatch → EffectEmpty :190–193.
export const SPELL_EFFECT_WEAPON = 25;
// Cite: SpellEffectDefines.h SPELL_EFFECT_DEFENSE = 26. EffectEmpty — skill-line marker ("one spell:
// Defense"). Cite: SpellEffects.cpp:84, :190–193.
export const SPELL_EFFECT_DEFENSE = 26;
export const SPELL_EFFECT_PERSISTENT_AREA_AURA = 27;
// Cite: SpellEffectDefines.h SPELL_EFFECT_SUMMON = 28. Handler: SpellEffects.cpp EffectSummon — controlled
// GUARDIAN_PET from EffectMiscValue.
export const SPELL_EFFECT_SUMMON = 28;
// Cite: SpellEffectDefines.h SPELL_EFFECT_LEAP = 29. Handler: SpellEffects.cpp EffectLeapForward —
// NearTeleportTo dest, keep orientation.
export const SPELL_EFFECT_LEAP = 29;
export const SPELL_EFFECT_ENERGIZE = 30;
export const SPELL_EFFECT_WEAPON_PERCENT_DAMAGE = 31;
// Cite: SpellEffectDefines.h SPELL_EFFECT_TRIGGER_MISSILE = 32. Handler: SpellEffects.cpp:1645–1681
// EffectTriggerMissileSpell — CastSpell(EffectTriggerSpell).
export const SPELL_EFFECT_TRIGGER_MISSILE = 32;
/** Cite: SpellEffectDefines.h SPELL_EFFECT_OPEN_LOCK = 33 (shared EffectOpenLock with 59). */
export const SPELL_EFFECT_OPEN_LOCK = 33;
// Cite: SpellEffectDefines.h SPELL_EFFECT_SUMMON_CHANGE_ITEM = 34. Handler: SpellEffects.cpp
// EffectSummonChangeItem — ConvertItem cast item → EffectItemType.
export const SPELL_EFFECT_SUMMON_CHANGE_ITEM = 34;
export const SPELL_EFFECT_APPLY_AREA_AURA_PARTY = 35;
export const SPELL_EFFECT_LEARN_SPELL = 36;
/** Cite: SpellEffectDefines.h SPELL_EFFECT_DISPEL = 38. */
export const SPELL_EFFECT_DISPEL = 38;
// Cite: SpellEffectDefines.h SPELL_EFFECT_SPELL_DEFENSE = 37. EffectEmpty — marker ("SPELLDEFENSE (DND)").
// Cite: SpellEffects.cpp:95, :190–193.
export const SPELL_EFFECT_SPELL_DEFENSE = 37;
// Cite: SpellEffectDefines.h SPELL_EFFECT_LANGUAGE = 39. EffectEmpty — misc stores language id
// (client/chat). Cite: SpellEffects.cpp:97, :190–193.
export const SPELL_EFFECT_LANGUAGE = 39;
// Cite: SpellEffectDefines.h SPELL_EFFECT_DUAL_WIELD = 40. Handler: SpellEffects.cpp EffectDualWield —
// SetCanDualWield(true).
export const SPELL_EFFECT_DUAL_WIELD = 40;
export const SPELL_EFFECT_SUMMON_WILD = 41;
export const SPELL_EFFECT_SUMMON_GUARDIAN = 42;
// Cite: SpellEffectDefines.h SPELL_EFFECT_TELEPORT_UNITS_FACE_CASTER = 43. Handler: SpellEffects.cpp
// EffectTeleUnitsFaceCaster.
export const SPELL_EFFECT_TELEPORT_UNITS_FACE_CASTER = 43;
// Cite: SpellEffectDefines.h SPELL_EFFECT_SKILL_STEP = 44. Handler: SpellEffects.cpp EffectLearnSkill —
// SetSkillStep(misc, damage).
export const SPELL_EFFECT_SKILL_STEP = 44;
// Cite: SpellEffectDefines.h SPELL_EFFECT_ADD_HONOR = 45. Handler: SpellEffects.cpp:3026–3035
// EffectAddHonor — AddHonorCP(damage, HONORABLE).
export const SPELL_EFFECT_ADD_HONOR = 45;
// Cite: SpellEffectDefines.h SPELL_EFFECT_SPAWN = 46. Handler: SpellEffects.cpp EffectSpawn — clear
// UNIT_FLAG_SPAWNING for 15750/26262.
export const SPELL_EFFECT_SPAWN = 46;
// Cite: SpellEffectDefines.h SPELL_EFFECT_TRADE_SKILL = 47. Handler: SpellEffects.cpp EffectTradeSkill —
// player gate only (body commented out).
export const SPELL_EFFECT_TRADE_SKILL = 47;
// Cite: SpellEffectDefines.h SPELL_EFFECT_STEALTH = 48. Dispatch → EffectUnused (one spell: Base Stealth).
// Cite: SpellEffects.cpp:106, :200–203.
export const SPELL_EFFECT_STEALTH = 48;
// Cite: SpellEffectDefines.h SPELL_EFFECT_DETECT = 49. Dispatch → EffectUnused (no server body). Cite:
// SpellEffects.cpp:107, :200–203.
export const SPELL_EFFECT_DETECT = 49;
/** Cite: SpellEffectDefines.h SPELL_EFFECT_TRANS_DOOR = 50 (EffectTransmitted). */
export const SPELL_EFFECT_TRANS_DOOR = 50;
export const SPELL_EFFECT_ENCHANT_ITEM = 53;
export const SPELL_EFFECT_ENCHANT_ITEM_TEMPORARY = 54;
// Cite: SpellEffectDefines.h SPELL_EFFECT_TAMECREATURE = 55. Handler: SpellEffects.cpp EffectTameCreature —
// create hunter pet from creature target.
export const SPELL_EFFECT_TAMECREATURE = 55;
/** Cite: SpellEffectDefines.h SPELL_EFFECT_SUMMON_PET = 56. */
export const SPELL_EFFECT_SUMMON_PET = 56;
// Cite: SpellEffectDefines.h SPELL_EFFECT_LEARN_PET_SPELL = 57. Handler: SpellEffects.cpp:3386–3404
// EffectLearnPetSpell — pet->learnSpell(EffectTriggerSpell).
export const SPELL_EFFECT_LEARN_PET_SPELL = 57;
export const SPELL_EFFECT_WEAPON_DAMAGE = 58;
/** Shared EffectOpenLock with SPELL_EFFECT_OPEN_LOCK (33). */
export const SPELL_EFFECT_OPEN_LOCK_ITEM = 59;
/** Cite: SpellEffectDefines.h SPELL_EFFECT_PROFICIENCY = 60. */
export const SPELL_EFFECT_PROFICIENCY = 60;
export const SPELL_EFFECT_SEND_EVENT = 61;
/** Cite: SpellEffectDefines.h SPELL_EFFECT_POWER_BURN = 62. */
export const SPELL_EFFECT_POWER_BURN = 62;
/** Cite: SpellEffectDefines.h SPELL_EFFECT_THREAT = 63. */
export const SPELL_EFFECT_THREAT = 63;
export const SPELL_EFFECT_TRIGGER_SPELL = 64;
// Cite: SpellEffectDefines.h SPELL_EFFECT_HEAL_MAX_HEALTH = 67. Handler: SpellEffects.cpp
// EffectHealMaxHealth — heal = caster max health.
export const SPELL_EFFECT_HEAL_MAX_HEALTH = 67;
/** Cite: SpellEffectDefines.h SPELL_EFFECT_INTERRUPT_CAST = 68. */
export const SPELL_EFFECT_INTERRUPT_CAST = 68;
// Cite: SpellEffectDefines.h SPELL_EFFECT_DISTRACT = 69. Handler: SpellEffects.cpp EffectDistract — face
// dest + MoveDistract(damage*IN_MILLISECONDS).
export const SPELL_EFFECT_DISTRACT = 69;
// Cite: SpellEffectDefines.h SPELL_EFFECT_PULL = 70. Handler: SpellEffects.cpp:2634–2638 EffectPull — TODO
// dummy (DEBUG_LOG only).
export const SPELL_EFFECT_PULL = 70;
// Cite: SpellEffectDefines.h SPELL_EFFECT_PICKPOCKET = 71. Handler: SpellEffects.cpp EffectPickPocket —
// open LOOT_PICKPOCKETING on creature.
export const SPELL_EFFECT_PICKPOCKET = 71;
// Cite: SpellEffectDefines.h SPELL_EFFECT_ADD_FARSIGHT = 72. Handler: SpellEffects.cpp EffectAddFarsight —
// DynamicObject FARSIGHT_FOCUS + camera.
export const SPELL_EFFECT_ADD_FARSIGHT = 72;
// Cite: SpellEffectDefines.h SPELL_EFFECT_SUMMON_POSSESSED = 73. Handler: SpellEffects.cpp
// EffectSummonPossessed — TakePossessOf(misc creature).
export const SPELL_EFFECT_SUMMON_POSSESSED = 73;
/** Cite: SpellEffectDefines.h SPELL_EFFECT_SUMMON_TOTEM = 74 (shared EffectSummonTotem, slot NONE). */
export const SPELL_EFFECT_SUMMON_TOTEM = 74;
// Cite: SpellEffectDefines.h SPELL_EFFECT_HEAL_MECHANICAL = 75. Handler: SpellEffects.cpp
// EffectHealMechanical — bonus-adjusted heal; mechanical via TargetCreatureType.
export const SPELL_EFFECT_HEAL_MECHANICAL = 75;
export const SPELL_EFFECT_SUMMON_OBJECT_WILD = 76;
// Cite: SpellEffectDefines.h SPELL_EFFECT_SCRIPT_EFFECT = 77. SI4 registry: SpellEffects.cpp
// EffectScriptEffect ~3664 → dispatchScript.
export const SPELL_EFFECT_SCRIPT_EFFECT = 77;
// Cite: SpellEffectDefines.h SPELL_EFFECT_ATTACK = 78. Dispatch → EffectUnused (no server body). Cite:
// SpellEffects.cpp:136, :200–203.
export const SPELL_EFFECT_ATTACK = 78;
// Cite: SpellEffectDefines.h SPELL_EFFECT_SANCTUARY = 79. Handler: SpellEffects.cpp EffectSanctuary —
// CombatStop + Vanish root clear special.
export const SPELL_EFFECT_SANCTUARY = 79;
/** Cite: SpellEffectDefines.h SPELL_EFFECT_ADD_COMBO_POINTS = 80. */
export const SPELL_EFFECT_ADD_COMBO_POINTS = 80;
// Cite: SpellEffectDefines.h SPELL_EFFECT_CREATE_HOUSE = 81. Dispatch → EffectUnused (one spell: Create
// House (TEST)). Cite: SpellEffects.cpp:139, :200–203.
export const SPELL_EFFECT_CREATE_HOUSE = 81;
// Cite: SpellEffectDefines.h SPELL_EFFECT_BIND_SIGHT = 82. Dispatch → EffectNULL (DEBUG_LOG only). Cite:
// SpellEffects.cpp:140, :195–198.
export const SPELL_EFFECT_BIND_SIGHT = 82;
// Cite: SpellEffectDefines.h SPELL_EFFECT_DUEL = 83. Handler: SpellEffects.cpp EffectDuel — duel flag GO +
// request packets + DuelInfo.
export const SPELL_EFFECT_DUEL = 83;
// Cite: SpellEffectDefines.h SPELL_EFFECT_STUCK = 84. Handler: SpellEffects.cpp EffectStuck — /stuck hearth
// or nudge / dungeon entrance.
export const SPELL_EFFECT_STUCK = 84;
// Cite: SpellEffectDefines.h SPELL_EFFECT_SUMMON_PLAYER = 85. Handler: SpellEffects.cpp:4356–4375
// EffectSummonPlayer — SetSummonPoint + SMSG_SUMMON_REQUEST.
export const SPELL_EFFECT_SUMMON_PLAYER = 85;
/** Cite: SpellEffectDefines.h SPELL_EFFECT_ACTIVATE_OBJECT = 86. */
export const SPELL_EFFECT_ACTIVATE_OBJECT = 86;
// Cite: SpellEffectDefines.h SPELL_EFFECT_SUMMON_TOTEM_SLOT1 = 87 (shared EffectSummonTotem). Slot mapping:
// SLOT1→FIRE, SLOT2→EARTH, SLOT3→WATER, SLOT4→AIR (SharedDefines TotemSlot).
export const SPELL_EFFECT_SUMMON_TOTEM_SLOT1 = 87;
/** Cite: SpellEffectDefines.h SPELL_EFFECT_SUMMON_TOTEM_SLOT2 = 88 (shared EffectSummonTotem). */
export const SPELL_EFFECT_SUMMON_TOTEM_SLOT2 = 88;
/** Cite: SpellEffectDefines.h SPELL_EFFECT_SUMMON_TOTEM_SLOT3 = 89 (shared EffectSummonTotem → WATER). */
export const SPELL_EFFECT_SUMMON_TOTEM_SLOT3 = 89;
/** Cite: SpellEffectDefines.h SPELL_EFFECT_SUMMON_TOTEM_SLOT4 = 90 (shared EffectSummonTotem → AIR). */
export const SPELL_EFFECT_SUMMON_TOTEM_SLOT4 = 90;
// Cite: SpellEffectDefines.h SPELL_EFFECT_ENCHANT_HELD_ITEM = 92. Handler: SpellEffects.cpp
// EffectEnchantHeldItem — temp enchant on target MH.
export const SPELL_EFFECT_ENCHANT_HELD_ITEM = 92;
// Cite: SpellEffectDefines.h SPELL_EFFECT_SELF_RESURRECT = 94. Handler: SpellEffects.cpp
// EffectSelfResurrect — caster ResurrectPlayer + SetHealth/Mana.
export const SPELL_EFFECT_SELF_RESURRECT = 94;
// SPELL_EFFECT_SKINNING (95): a player and a creature target show the skinning loot and update the
// gather skill. Cite: SpellEffects.cpp:4970-5006 EffectSkinning.
export const SPELL_EFFECT_SKINNING = 95;
/** Cite: SpellEffectDefines.h SPELL_EFFECT_CHARGE = 96. */
export const SPELL_EFFECT_CHARGE = 96;
/** Cite: SpellEffectDefines.h SPELL_EFFECT_SUMMON_CRITTER = 97. */
export const SPELL_EFFECT_SUMMON_CRITTER = 97;
export const SPELL_EFFECT_KNOCK_BACK = 98;
// SPELL_EFFECT_DISENCHANT (99): a player and an item with a disenchant id update the craft skill and
// show the loot. Cite: SpellEffects.cpp:4640-4666 EffectDisEnchant.
export const SPELL_EFFECT_DISENCHANT = 99;
// Cite: SpellEffectDefines.h SPELL_EFFECT_INEBRIATE = 100. Handler: SpellEffects.cpp EffectInebriate —
// drunk value += damage * 256.
export const SPELL_EFFECT_INEBRIATE = 100;
// SPELL_EFFECT_FEED_PET (101): destroy the food item and cast the benefit spell. The handler emits a
// skip only, since there are no combat effects without an item target. Cite: SpellEffects.cpp:4681.
export const SPELL_EFFECT_FEED_PET = 101;
// Cite: SpellEffectDefines.h SPELL_EFFECT_DISMISS_PET = 102. Handler: SpellEffects.cpp EffectDismissPet —
// unsummon the active pet (Dismiss Pet 2641).
export const SPELL_EFFECT_DISMISS_PET = 102;
// SPELL_EFFECT_SUMMON_DEAD_PET (109): revive the slain pet at the amount as a percent of its max
// health, and no-op while the pet is alive. Cite: SpellEffects.cpp:5164.
export const SPELL_EFFECT_SUMMON_DEAD_PET = 109;
// Cite: SpellEffectDefines.h SPELL_EFFECT_DESTROY_ALL_TOTEMS = 110. Handler: SpellEffects.cpp:5202–5207
// EffectDestroyAllTotems — UnSummon every totem slot.
export const SPELL_EFFECT_DESTROY_ALL_TOTEMS = 110;
// Cite: SpellEffectDefines.h SPELL_EFFECT_REPUTATION = 103. Handler: SpellEffects.cpp EffectReputation —
// ModifyReputation via CalculateReputationGain.
export const SPELL_EFFECT_REPUTATION = 103;
/** Cite: SpellEffectDefines.h SPELL_EFFECT_SUMMON_OBJECT_SLOT1 = 104 (shared EffectSummonObject slot 0). */
export const SPELL_EFFECT_SUMMON_OBJECT_SLOT1 = 104;
/** Cite: SpellEffectDefines.h SPELL_EFFECT_SUMMON_OBJECT_SLOT2 = 105 (shared EffectSummonObject slot 1). */
export const SPELL_EFFECT_SUMMON_OBJECT_SLOT2 = 105;
/** Cite: SpellEffectDefines.h SPELL_EFFECT_DISPEL_MECHANIC = 108. */
export const SPELL_EFFECT_DISPEL_MECHANIC = 108;
// Cite: SpellEffectDefines.h SPELL_EFFECT_DURABILITY_DAMAGE = 111. Handler: SpellEffects.cpp
// EffectDurabilityDamage — points loss on slot / all equipped.
export const SPELL_EFFECT_DURABILITY_DAMAGE = 111;
// Cite: SpellEffectDefines.h SPELL_EFFECT_DURABILITY_DAMAGE_PCT = 115. Handler: SpellEffects.cpp
// EffectDurabilityDamagePCT — DurabilityLoss(percent = damage/100).
export const SPELL_EFFECT_DURABILITY_DAMAGE_PCT = 115;
// Cite: SpellEffectDefines.h SPELL_EFFECT_SUMMON_DEMON = 112. Handler: SpellEffects.cpp EffectSummonDemon —
// count from CalculateSimpleValue, misc creature.
export const SPELL_EFFECT_SUMMON_DEMON = 112;
/** Cite: SpellEffectDefines.h SPELL_EFFECT_RESURRECT_NEW = 113 (shared EffectResurrect with 18). */
export const SPELL_EFFECT_RESURRECT_NEW = 113;
// Cite: SpellEffectDefines.h SPELL_EFFECT_ATTACK_ME = 114. Handler: SpellEffects.cpp EffectTaunt — equalize
// threat to highest + force victim.
export const SPELL_EFFECT_ATTACK_ME = 114;
// Cite: SpellEffectDefines.h SPELL_EFFECT_SKIN_PLAYER_CORPSE = 116. Handler: SpellEffects.cpp
// EffectSkinPlayerCorpse — Remove Insignia (BG).
export const SPELL_EFFECT_SKIN_PLAYER_CORPSE = 116;
// Cite: SpellEffectDefines.h SPELL_EFFECT_SPIRIT_HEAL = 117. Handler: SpellEffects.cpp:5462–5496
// EffectSpiritHeal — ResurrectPlayer(1.0f).
export const SPELL_EFFECT_SPIRIT_HEAL = 117;
// Cite: SpellEffectDefines.h SPELL_EFFECT_SKILL = 118. Handler: SpellEffects.cpp EffectSkill — DEBUG_LOG
// only ("professions and more").
export const SPELL_EFFECT_SKILL = 118;
/** Thin gateway same mapAura path as 6/35 — SpellEffectDefines SPELL_EFFECT_APPLY_AREA_AURA_PET. */
export const SPELL_EFFECT_APPLY_AREA_AURA_PET = 119;
// SPELL_EFFECT_TELEPORT_GRAVEYARD (120): the nearest graveyard the target's team owns, which is the
// battleground resurrection payload a spirit guide pulses every 30 s.
export const SPELL_EFFECT_TELEPORT_GRAVEYARD = 120;
export const SPELL_EFFECT_NORMALIZED_WEAPON_DMG = 121;
// Cite: SpellEffectDefines.h SPELL_EFFECT_PULL_TOWARDS = 124. Handler: SpellEffects.cpp EffectPullTowards —
// KnockBackWithAngle toward caster.
export const SPELL_EFFECT_PULL_TOWARDS = 124;
// Cite: SpellEffectDefines.h SPELL_EFFECT_122 = 122. Dispatch → EffectUnused. Cite: SpellEffects.cpp:180,
// :200–203.
export const SPELL_EFFECT_122 = 122;
// Cite: SpellEffectDefines.h SPELL_EFFECT_SEND_TAXI = 123. Handler: SpellEffects.cpp:5124–5130
// EffectSendTaxi — ActivateTaxiPathTo(misc, spellId).
export const SPELL_EFFECT_SEND_TAXI = 123;
// Cite: SpellEffectDefines.h SPELL_EFFECT_126 = 126. Dispatch → EffectUnused (one test spell). Cite:
// SpellEffects.cpp:184, :200–203.
export const SPELL_EFFECT_126 = 126;
// Cite: SpellEffectDefines.h SPELL_EFFECT_129 = 129 (future APPLY_AREA_AURA_ENEMY). Dispatch →
// EffectUnused. Cite: SpellEffects.cpp:188, :200–203.
export const SPELL_EFFECT_APPLY_AREA_AURA_ENEMY = 129;

// ── Auras (SpellAuraDefines.h) ── SPELL_AURA_NONE (0) dispatches to an empty body; the Orc Command
// stub is the classic castable that carries it. Cite: SpellAuras.cpp:61; SpellAuras.h:275-278.
export const SPELL_AURA_NONE = 0;
/** Cite: SpellAuraDefines.h SPELL_AURA_DUMMY = 4. Handler: SpellAuras.cpp HandleAuraDummy :1229. */
export const SPELL_AURA_DUMMY = 4;
/** Cite: SpellAuraDefines.h SPELL_AURA_PERIODIC_DAMAGE = 3. */
export const SPELL_AURA_PERIODIC_DAMAGE = 3;
/** Cite: SpellAuraDefines.h SPELL_AURA_PERIODIC_HEAL = 8. */
export const SPELL_AURA_PERIODIC_HEAL = 8;
/** Cite: SpellAuraDefines.h SPELL_AURA_MOD_FEAR = 7. Handler: SpellAuras.cpp HandleModFear :2368. */
export const SPELL_AURA_MOD_FEAR = 7;
/** Cite: SpellAuraDefines.h SPELL_AURA_MOD_STUN = 12. Handler: SpellAuras.cpp HandleAuraModStun :2453. */
export const SPELL_AURA_MOD_STUN = 12;
// Cite: SpellAuraDefines.h SPELL_AURA_DAMAGE_SHIELD = 15. Handler: HandleNoImmediateEffect —
// Unit::DealMeleeDamage damage-shield loop. Cite: SpellAuras.cpp:76; Unit.cpp:2242–2293.
export const SPELL_AURA_DAMAGE_SHIELD = 15;
// Cite: SpellAuraDefines.h SPELL_AURA_PERIODIC_ENERGIZE = 24. Handler: SpellAuras.cpp
// HandlePeriodicEnergize :3119; PeriodicTick :4809.
export const SPELL_AURA_PERIODIC_ENERGIZE = 24;
// Cite: SpellAuraDefines.h SPELL_AURA_SCHOOL_IMMUNITY = 39. Handler: SpellAuras.cpp
// HandleAuraModSchoolImmunity :2992.
export const SPELL_AURA_SCHOOL_IMMUNITY = 39;
// Cite: SpellAuraDefines.h SPELL_AURA_DISPEL_IMMUNITY = 41. Handler: SpellAuras.cpp
// HandleAuraModDispelImmunity :3053; Unit.cpp ApplySpellDispelImmunity :7697.
export const SPELL_AURA_DISPEL_IMMUNITY = 41;
// Cite: SpellAuraDefines.h SPELL_AURA_PERIODIC_LEECH = 53. Handler: SpellAuras.cpp HandlePeriodicLeech
// :3247; PeriodicTick :4592.
export const SPELL_AURA_PERIODIC_LEECH = 53;
// SPELL_AURA_PERIODIC_HEALTH_FUNNEL (62): damage the caster and heal the aura target, the opposite of
// periodic leech. Cite: SpellAuras.cpp:3285; PeriodicTick :4592-4684.
export const SPELL_AURA_PERIODIC_HEALTH_FUNNEL = 62;
/** Cite: SpellAuraDefines.h SPELL_AURA_MOD_SCALE = 61. Handler: SpellAuras.cpp HandleAuraModScale :2182. */
export const SPELL_AURA_MOD_SCALE = 61;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_DAMAGE_PERCENT_DONE = 79. Handler: SpellAuras.cpp
// HandleModDamagePercentDone :4109.
export const SPELL_AURA_MOD_DAMAGE_PERCENT_DONE = 79;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_REGEN = 84. Handler: SpellAuras.cpp HandleModRegen :3612;
// PeriodicTick :4948.
export const SPELL_AURA_MOD_REGEN = 84;
// Cite: SpellAuraDefines.h SPELL_AURA_ADD_FLAT_MODIFIER = 107. Handler: SpellAuras.cpp HandleAddModifier
// :899.
export const SPELL_AURA_ADD_FLAT_MODIFIER = 107;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_DAMAGE_DONE = 13. Handler: SpellAuras.cpp HandleModDamageDone
// :4026.
export const SPELL_AURA_MOD_DAMAGE_DONE = 13;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_DAMAGE_TAKEN = 14. Handler: HandleNoImmediateEffect —
// Unit::MeleeDamageBonusTaken / SpellBaseDamageBonusTaken. Cite: SpellAuras.cpp:75; Unit.cpp:7160 / :7597.
export const SPELL_AURA_MOD_DAMAGE_TAKEN = 14;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_RESISTANCE = 22. Handler: SpellAuras.cpp HandleAuraModResistance
// :3362.
export const SPELL_AURA_MOD_RESISTANCE = 22;
// Cite: SpellAuraDefines.h SPELL_AURA_PERIODIC_TRIGGER_SPELL = 23. Handler: SpellAuras.cpp
// HandlePeriodicTriggerSpell :3092; PeriodicTick TriggerSpell.
export const SPELL_AURA_PERIODIC_TRIGGER_SPELL = 23;
/** Cite: SpellAuraDefines.h SPELL_AURA_MOD_ROOT = 26. Handler: SpellAuras.cpp HandleAuraModRoot :2727. */
export const SPELL_AURA_MOD_ROOT = 26;
/** Cite: SpellAuraDefines.h SPELL_AURA_MOD_STAT = 29. */
export const SPELL_AURA_MOD_STAT = 29;
/** Cite: SpellAuraDefines.h SPELL_AURA_MOD_SKILL = 30. Handler: SpellAuras.cpp HandleAuraModSkill :2055. */
export const SPELL_AURA_MOD_SKILL = 30;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_INCREASE_SPEED = 31. Handler: SpellAuras.cpp
// HandleAuraModIncreaseSpeed :2880.
export const SPELL_AURA_MOD_INCREASE_SPEED = 31;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_INCREASE_MOUNTED_SPEED = 32. Handler: SpellAuras.cpp
// HandleAuraModIncreaseMountedSpeed :2889.
export const SPELL_AURA_MOD_INCREASE_MOUNTED_SPEED = 32;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_DECREASE_SPEED = 33. Handler: SpellAuras.cpp
// HandleAuraModDecreaseSpeed :2907.
export const SPELL_AURA_MOD_DECREASE_SPEED = 33;
// Cite: SpellAuraDefines.h SPELL_AURA_TRANSFORM = 56. Handler: SpellAuras.cpp HandleAuraTransform :1979.
export const SPELL_AURA_TRANSFORM = 56;
// SPELL_AURA_SCHOOL_ABSORB (69): no immediate effect; the pool is spent in the absorb path.
// Cite: SpellAuras.cpp:130; Unit.cpp CalculateAbsorbAndResist; CalculateAuraEffectValue :6050.
export const SPELL_AURA_SCHOOL_ABSORB = 69;
// Cite: SpellAuraDefines.h SPELL_AURA_MECHANIC_IMMUNITY = 77. Handler: SpellAuras.cpp
// HandleModMechanicImmunity :2936.
export const SPELL_AURA_MECHANIC_IMMUNITY = 77;
/** Cite: SpellAuraDefines.h SPELL_AURA_MOUNTED = 78. Handler: SpellAuras.cpp HandleAuraMounted :1629. */
export const SPELL_AURA_MOUNTED = 78;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_POWER_REGEN = 85. Handler: SpellAuras.cpp HandleModPowerRegen
// :3621; PeriodicTick :4959.
export const SPELL_AURA_MOD_POWER_REGEN = 85;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_ATTACK_POWER = 99. Handler: SpellAuras.cpp
// HandleAuraModAttackPower :3987.
export const SPELL_AURA_MOD_ATTACK_POWER = 99;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_ATTACK_POWER_PCT = 166. Handler: SpellAuras.cpp
// HandleAuraModAttackPowerPercent :4004.
export const SPELL_AURA_MOD_ATTACK_POWER_PCT = 166;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_RANGED_ATTACK_POWER = 124. Handler: SpellAuras.cpp
// HandleAuraModRangedAttackPower :3994.
export const SPELL_AURA_MOD_RANGED_ATTACK_POWER = 124;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_HEALING_DONE = 135. Handler: SpellAuras.cpp HandleModHealingDone
// :3528 (SpellHealingBonusDone data).
export const SPELL_AURA_MOD_HEALING_DONE = 135;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_MELEE_HASTE = 138. Handler: SpellAuras.cpp HandleModMeleeSpeedPct
// :3929.
export const SPELL_AURA_MOD_MELEE_HASTE = 138;

// ── SI3 aura batch 4 (this claim list) ────────────────────────────────────── Cite: SpellAuraDefines.h
// SPELL_AURA_MOD_CONFUSE = 5. Handler: SpellAuras.cpp HandleModConfuse :2354.
export const SPELL_AURA_MOD_CONFUSE = 5;
/** Cite: SpellAuraDefines.h SPELL_AURA_MOD_CHARM = 6. Handler: SpellAuras.cpp HandleModCharm :2282. */
export const SPELL_AURA_MOD_CHARM = 6;
// Cite: SpellAuraDefines.h SPELL_AURA_AOE_CHARM = 177. Handler: SpellAuras.cpp HandleAoECharm :2331
// TakeCharmOf(..., false).
export const SPELL_AURA_AOE_CHARM = 177;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_SILENCE = 27. Handler: SpellAuras.cpp HandleAuraModSilence :2778.
export const SPELL_AURA_MOD_SILENCE = 27;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_HIT_CHANCE = 54. Handler: SpellAuras.cpp HandleModHitChance
// :3850; Player path: StatSystem.cpp UpdateWeaponHitChances :523–533.
export const SPELL_AURA_MOD_HIT_CHANCE = 54;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_CASTING_SPEED_NOT_STACK = 65. Handler: SpellAuras.cpp
// HandleModCastingSpeed :3915.
export const SPELL_AURA_MOD_CASTING_SPEED_NOT_STACK = 65;
// SPELL_AURA_MOD_DAMAGE_PERCENT_TAKEN (87): no immediate effect; a multiplier read by mask in the
// damage-taken paths. Cite: SpellAuras.cpp:148; Unit.cpp:7108, :7628.
export const SPELL_AURA_MOD_DAMAGE_PERCENT_TAKEN = 87;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_MELEE_ATTACK_POWER_VERSUS = 102. Handler: HandleNoImmediateEffect
// — Unit::MeleeDamageBonusDone AP vs creature type. Cite: SpellAuras.cpp:163; Unit.cpp:7476.
export const SPELL_AURA_MOD_MELEE_ATTACK_POWER_VERSUS = 102;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_HEALING_PCT = 118. Handler: HandleNoImmediateEffect —
// Unit::SpellHealingBonusTaken max ±pct. Cite: SpellAuras.cpp:179; Unit.cpp:7239–7245.
export const SPELL_AURA_MOD_HEALING_PCT = 118;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_RESISTANCE_EXCLUSIVE = 143. Handler: SpellAuras.cpp
// HandleAuraModResistanceExclusive :3314.
export const SPELL_AURA_MOD_RESISTANCE_EXCLUSIVE = 143;
// SPELL_AURA_MOD_HEALTH_REGEN_IN_COMBAT (161): an always-on flat regen, where the DBC amount is health
// per five seconds and a zero amplitude bakes a 5000 ms tick. Cite: Player.cpp:2407-2412.
export const SPELL_AURA_MOD_HEALTH_REGEN_IN_COMBAT = 161;

// ── SI3 aura batch 5 (this claim list) ────────────────────────────────────── Cite: SpellAuraDefines.h
// SPELL_AURA_MOD_STEALTH = 16. Handler: SpellAuras.cpp HandleModStealth :2563.
export const SPELL_AURA_MOD_STEALTH = 16;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_INVISIBILITY = 18. Handler: SpellAuras.cpp HandleInvisibility
// :2626.
export const SPELL_AURA_MOD_INVISIBILITY = 18;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_SHAPESHIFT = 36. Handler: SpellAuras.cpp HandleAuraModShapeshift
// :1709; HandleShapeshiftBoosts :4223.
export const SPELL_AURA_MOD_SHAPESHIFT = 36;
// SPELL_AURA_PROC_TRIGGER_SPELL (42): applied with its charge specials and fired through the proc
// handler; the chance, PPM and cooldown subsystem is proc.ts. Cite: SpellAuras.cpp:3062.
export const SPELL_AURA_PROC_TRIGGER_SPELL = 42;
// Cite: SpellAuraDefines.h SPELL_AURA_PROC_TRIGGER_DAMAGE = 43. Handler: HandleNoImmediateEffect —
// Unit::HandleProcTriggerDamageAuraProc. Cite: SpellAuras.cpp:104; UnitAuraProcHandler.cpp:1557.
export const SPELL_AURA_PROC_TRIGGER_DAMAGE = 43;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_DODGE_PERCENT = 49. Handler: SpellAuras.cpp
// HandleAuraModDodgePercent :3775.
export const SPELL_AURA_MOD_DODGE_PERCENT = 49;
// SPELL_AURA_MOD_BLOCK_PERCENT (51) is handled at SpellAuras.cpp:3789. Below, MOD_BLOCK_SKILL (50)
// dispatches to the unused handler — it is obsolete. Cite: SpellAuras.cpp:111.
export const SPELL_AURA_MOD_BLOCK_SKILL = 50;
export const SPELL_AURA_MOD_BLOCK_PERCENT = 51;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_CRIT_PERCENT = 52. Handler: SpellAuras.cpp
// HandleAuraModCritPercent :3815.
export const SPELL_AURA_MOD_CRIT_PERCENT = 52;
// Cite: SpellAuraDefines.h SPELL_AURA_PERIODIC_MANA_LEECH = 64. Handler: SpellAuras.cpp
// HandlePeriodicManaLeech :3268; PeriodicTick :4740.
export const SPELL_AURA_PERIODIC_MANA_LEECH = 64;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_RESISTANCE_PCT = 101. Handler: SpellAuras.cpp
// HandleModResistancePercent :3388.
export const SPELL_AURA_MOD_RESISTANCE_PCT = 101;
// SPELL_AURA_MOD_RANGED_ATTACK_POWER_VERSUS (131): no immediate effect; ranged attack power against a
// creature type. Cite: SpellAuras.cpp:192; Unit.cpp:7471.
export const SPELL_AURA_MOD_RANGED_ATTACK_POWER_VERSUS = 131;

// ── SI3 aura batch 6 (this claim list) ────────────────────────────────────── Cite: SpellAuraDefines.h
// SPELL_AURA_MOD_ATTACKSPEED = 9. Handler: SpellAuras.cpp HandleModAttackSpeed :3922.
export const SPELL_AURA_MOD_ATTACKSPEED = 9;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_INVISIBILITY_DETECTION = 19. Handler: SpellAuras.cpp
// HandleInvisibilityDetect :2677.
export const SPELL_AURA_MOD_INVISIBILITY_DETECTION = 19;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_PACIFY = 25. Handler: SpellAuras.cpp HandleAuraModPacify :4382.
export const SPELL_AURA_MOD_PACIFY = 25;
// Cite: SpellAuraDefines.h SPELL_AURA_TRACK_CREATURES = 44. Handler: SpellAuras.cpp
// HandleAuraTrackCreatures :2152.
export const SPELL_AURA_TRACK_CREATURES = 44;
// Cite: SpellAuraDefines.h SPELL_AURA_REFLECT_SPELLS_SCHOOL = 74. Handler: HandleNoImmediateEffect —
// Unit::SpellHitResult / GetReflectChance. Cite: SpellAuras.cpp:135; Unit.cpp:3425–3431.
export const SPELL_AURA_REFLECT_SPELLS_SCHOOL = 74;
// Cite: SpellAuraDefines.h SPELL_AURA_CHANNEL_DEATH_ITEM = 86. Handler: SpellAuras.cpp
// HandleChannelDeathItem :2070.
export const SPELL_AURA_CHANNEL_DEATH_ITEM = 86;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_HEALTH_REGEN_PERCENT = 88. Handler: HandleNoImmediateEffect —
// Player::RegenerateHealth out-of-combat % mult. Cite: SpellAuras.cpp:149; Player.cpp:2395–2398.
export const SPELL_AURA_MOD_HEALTH_REGEN_PERCENT = 88;
// SPELL_AURA_MOD_TARGET_RESISTANCE (123): no immediate effect; resistance and armor penetration.
// Cite: SpellAuras.cpp:184; Unit.cpp:3890-3895, :2329, :3911.
export const SPELL_AURA_MOD_TARGET_RESISTANCE = 123;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_TOTAL_STAT_PERCENTAGE = 137. Handler: SpellAuras.cpp
// HandleModTotalPercentStat :3537.
export const SPELL_AURA_MOD_TOTAL_STAT_PERCENTAGE = 137;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_SHIELD_BLOCKVALUE = 158. Handler: SpellAuras.cpp
// HandleShieldBlockValue :4426 (FLAT_MOD path).
export const SPELL_AURA_MOD_SHIELD_BLOCKVALUE = 158;

// Cite: SpellAuraDefines.h SPELL_AURA_MOD_SHIELD_BLOCKVALUE_PCT = 150. Handler: SpellAuras.cpp
// HandleShieldBlockValue :4426 (PCT_MOD path).
export const SPELL_AURA_MOD_SHIELD_BLOCKVALUE_PCT = 150;

// ── SPELL_AURA_REFLECT_SPELLS (28) ── no immediate effect; read by the reflect chance.
// Cite: SpellAuras.cpp:89; Unit.cpp:3425-3431 GetReflectChance.
export const SPELL_AURA_REFLECT_SPELLS = 28;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_INCREASE_HEALTH = 34. Handler: SpellAuras.cpp
// HandleAuraModIncreaseHealth :3658.
export const SPELL_AURA_MOD_INCREASE_HEALTH = 34;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_DISARM = 67. Handler: SpellAuras.cpp HandleAuraModDisarm :2426.
export const SPELL_AURA_MOD_DISARM = 67;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_SKILL_TALENT = 98. Handler: SpellAuras.cpp HandleAuraModSkill
// :2055 (permanent=true).
export const SPELL_AURA_MOD_SKILL_TALENT = 98;
// Cite: SpellAuraDefines.h SPELL_AURA_ADD_PCT_MODIFIER = 108. Handler: SpellAuras.cpp HandleAddModifier
// :899 (SpellModType = aura name).
export const SPELL_AURA_ADD_PCT_MODIFIER = 108;
/** Cite: SpellAuraDefines.h SPELL_AURA_MOD_THREAT = 10. Handler: SpellAuras.cpp HandleModThreat :2806. */
export const SPELL_AURA_MOD_THREAT = 10;
/** Cite: SpellAuraDefines.h SPELL_AURA_MOD_TAUNT = 11. Handler: SpellAuras.cpp HandleModTaunt :2860. */
export const SPELL_AURA_MOD_TAUNT = 11;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_STEALTH_DETECT = 17. Handler: SpellAuras.cpp
// HandleModStealthDetect :2616.
export const SPELL_AURA_MOD_STEALTH_DETECT = 17;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_HEALING = 115. Handler: HandleNoImmediateEffect —
// Unit::SpellBaseHealingBonusTaken. Cite: SpellAuras.cpp:176; Unit.cpp:7301–7309.
export const SPELL_AURA_MOD_HEALING = 115;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_MECHANIC_RESISTANCE = 117. Handler: HandleNoImmediateEffect —
// Unit::MagicSpellHitResult resist chance. Cite: SpellAuras.cpp:178; Unit.cpp:4015–4031.
export const SPELL_AURA_MOD_MECHANIC_RESISTANCE = 117;

// ── SI3 aura batch 8 (this claim list) ────────────────────────────────────── Cite: SpellAuraDefines.h
// SPELL_AURA_MOD_POSSESS = 2. Handler: SpellAuras.cpp HandleModPossess :2188.
export const SPELL_AURA_MOD_POSSESS = 2;
// SPELL_AURA_OBS_MOD_HEALTH (20): a periodic percent-of-max health regen.
// Cite: SpellAuras.cpp:3590 HandleAuraModTotalHealthPercentRegen; PeriodicTick :4687-4738.
export const SPELL_AURA_OBS_MOD_HEALTH = 20;
// SPELL_AURA_OBS_MOD_MANA (21): a periodic percent-of-max mana regen.
// Cite: SpellAuras.cpp:3595 HandleAuraModTotalManaPercentRegen; PeriodicTick :4854-4890.
export const SPELL_AURA_OBS_MOD_MANA = 21;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_STALKED = 68. Handler: SpellAuras.cpp HandleAuraModStalked :3079.
export const SPELL_AURA_MOD_STALKED = 68;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_TOTAL_THREAT = 103. Handler: SpellAuras.cpp
// HandleAuraModTotalThreat :2841.
export const SPELL_AURA_MOD_TOTAL_THREAT = 103;
// Cite: SpellAuraDefines.h SPELL_AURA_FEATHER_FALL = 105. Handler: SpellAuras.cpp HandleAuraFeatherFall
// :1670.
export const SPELL_AURA_FEATHER_FALL = 105;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_RANGED_DAMAGE_TAKEN = 113. Handler: HandleNoImmediateEffect —
// Unit::MeleeDamageBonusTaken. Cite: SpellAuras.cpp:174; Unit.cpp:7615–7617.
export const SPELL_AURA_MOD_RANGED_DAMAGE_TAKEN = 113;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_INCREASE_HEALTH_PERCENT = 133. Handler: SpellAuras.cpp
// HandleAuraModIncreaseHealthPercent :3740.
export const SPELL_AURA_MOD_INCREASE_HEALTH_PERCENT = 133;
// SPELL_AURA_MOD_MANA_REGEN_INTERRUPT (134): the percent of regen kept while casting.
// Cite: SpellAuras.cpp:3803 HandleAuraModRegenInterrupt; StatSystem.cpp:558-562.
export const SPELL_AURA_MOD_MANA_REGEN_INTERRUPT = 134;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_RANGED_HASTE = 140. Handler: SpellAuras.cpp
// HandleAuraModRangedHaste :3938.
export const SPELL_AURA_MOD_RANGED_HASTE = 140;

// ── SPELL_AURA_MOD_PARRY_PERCENT (47) ── added to the parry chance.
// Cite: SpellAuras.cpp:3762 HandleAuraModParryPercent; StatSystem.cpp:454-463.
export const SPELL_AURA_MOD_PARRY_PERCENT = 47;
// SPELL_AURA_MOD_SPELL_CRIT_CHANCE (57): added to every school's spell crit.
// Cite: SpellAuras.cpp:3873 HandleModSpellCritChance; StatSystem.cpp:505-545.
export const SPELL_AURA_MOD_SPELL_CRIT_CHANCE = 57;
// SPELL_AURA_MOD_SPELL_CRIT_CHANCE_SCHOOL (71): added to one school's spell crit.
// Cite: SpellAuras.cpp:3891 HandleModSpellCritChanceShool; StatSystem.cpp:512-513.
export const SPELL_AURA_MOD_SPELL_CRIT_CHANCE_SCHOOL = 71;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_LANGUAGE = 75. Handler: HandleNoImmediateEffect — ChatHandler
// language overwrite. Cite: SpellAuras.cpp:136; ChatHandler.cpp:151–155.
export const SPELL_AURA_MOD_LANGUAGE = 75;
// Cite: SpellAuraDefines.h SPELL_AURA_WATER_BREATHING = 82. Handler: SpellAuras.cpp HandleWaterBreathing
// :1688.
export const SPELL_AURA_WATER_BREATHING = 82;
// SPELL_AURA_MOD_BASE_RESISTANCE (83): a BASE value per school bit, unlike aura 22's total. The bake
// surface is the same — physical becomes armor and magic bits resistances.
export const SPELL_AURA_MOD_BASE_RESISTANCE = 83;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_DETECT_RANGE = 91. Handler: HandleNoImmediateEffect —
// Unit::GetAttackDistance. Cite: SpellAuras.cpp:152; Unit.cpp:11772.
export const SPELL_AURA_MOD_DETECT_RANGE = 91;
// SPELL_AURA_MANA_SHIELD (97): the absorb is paid from mana.
// Cite: SpellAuras.cpp:5063 HandleManaShield; Unit.cpp:2457-2496.
export const SPELL_AURA_MANA_SHIELD = 97;
// SPELL_AURA_OVERRIDE_CLASS_SCRIPTS (112): registers the script id on the unit.
// Cite: SpellAuras.cpp:5096 HandleOverrideClassScript; Unit.cpp:11980.
export const SPELL_AURA_OVERRIDE_CLASS_SCRIPTS = 112;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_MELEE_DAMAGE_TAKEN = 125. Handler: HandleNoImmediateEffect —
// Unit::MeleeDamageBonusTaken. Cite: SpellAuras.cpp:186; Unit.cpp:7618.
export const SPELL_AURA_MOD_MELEE_DAMAGE_TAKEN = 125;
// Cite: SpellAuraDefines.h SPELL_AURA_FORCE_REACTION = 139. Handler: SpellAuras.cpp HandleForceReaction
// :2034.
export const SPELL_AURA_FORCE_REACTION = 139;

// ── SI3 aura batch 10 (this claim list) ───────────────────────────────────── Cite: SpellAuraDefines.h
// SPELL_AURA_EFFECT_IMMUNITY = 37. Handler: SpellAuras.cpp HandleAuraModEffectImmunity :2962.
export const SPELL_AURA_EFFECT_IMMUNITY = 37;
// Cite: SpellAuraDefines.h SPELL_AURA_STATE_IMMUNITY = 38. Handler: SpellAuras.cpp
// HandleAuraModStateImmunity :2972.
export const SPELL_AURA_STATE_IMMUNITY = 38;
// Cite: SpellAuraDefines.h SPELL_AURA_DAMAGE_IMMUNITY = 40. Handler: SpellAuras.cpp
// HandleAuraModDmgImmunity :3046.
export const SPELL_AURA_DAMAGE_IMMUNITY = 40;
// Cite: SpellAuraDefines.h SPELL_AURA_TRACK_RESOURCES = 45. Handler: SpellAuras.cpp
// HandleAuraTrackResources :2163.
export const SPELL_AURA_TRACK_RESOURCES = 45;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_INCREASE_SWIM_SPEED = 58. Handler: SpellAuras.cpp
// HandleAuraModIncreaseSwimSpeed :2898.
export const SPELL_AURA_MOD_INCREASE_SWIM_SPEED = 58;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_DAMAGE_DONE_CREATURE = 59. Handler: Unit.cpp:7061
// SpellDamageBonusDone and :7465 MeleeDamageBonusDone.
export const SPELL_AURA_MOD_DAMAGE_DONE_CREATURE = 59;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_PACIFY_SILENCE = 60. Handler: SpellAuras.cpp
// HandleAuraModPacifyAndSilence :4390.
export const SPELL_AURA_MOD_PACIFY_SILENCE = 60;
// Cite: SpellAuraDefines.h SPELL_AURA_PREVENTS_FLEEING = 92. Handler: SpellAuras.cpp HandlePreventFleeing
// :5047.
export const SPELL_AURA_PREVENTS_FLEEING = 92;
// SPELL_AURA_RANGED_ATTACK_POWER_ATTACKER_BONUS (127): the victim's aura adds to the attacker's ranged
// attack power. Cite: SpellAuras.cpp:188; Unit.cpp:7470 MeleeDamageBonusDone.
export const SPELL_AURA_RANGED_ATTACK_POWER_ATTACKER_BONUS = 127;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_RANGED_AMMO_HASTE = 141. Handler: SpellAuras.cpp
// HandleRangedAmmoHaste :3945.
export const SPELL_AURA_MOD_RANGED_AMMO_HASTE = 141;
/** Cite: SpellAuraDefines.h SPELL_AURA_MOD_SPELL_DAMAGE_OF_STAT_PERCENT = 174. */
export const SPELL_AURA_MOD_SPELL_DAMAGE_OF_STAT_PERCENT = 174;

/** Cite: SpellAuraDefines.h SPELL_AURA_MOD_SPELL_HEALING_OF_STAT_PERCENT = 175. */
export const SPELL_AURA_MOD_SPELL_HEALING_OF_STAT_PERCENT = 175;

// Cite: SpellAuraDefines.h SPELL_AURA_MOD_FLAT_SPELL_DAMAGE_VERSUS = 180. Handler: HandleNoImmediateEffect
// — Unit::SpellDamageBonusDone flat vs creature type. Cite: SpellAuras.cpp:241; Unit.cpp:7055.
export const SPELL_AURA_MOD_FLAT_SPELL_DAMAGE_VERSUS = 180;

// ── SI3 aura batch 11 (this claim list) ───────────────────────────────────── Cite: SpellAuraDefines.h
// SPELL_AURA_MOD_SPELL_HIT_CHANCE = 55. Handler: SpellAuras.cpp HandleModSpellHitChance :3868.
export const SPELL_AURA_MOD_SPELL_HIT_CHANCE = 55;
// Cite: SpellAuraDefines.h SPELL_AURA_PERIODIC_DAMAGE_PERCENT = 89. Handler: SpellAuras.cpp
// HandlePeriodicDamagePCT :3242; PeriodicTick :4506–4525.
export const SPELL_AURA_PERIODIC_DAMAGE_PERCENT = 89;
// Cite: SpellAuraDefines.h SPELL_AURA_WATER_WALK = 104. Handler: SpellAuras.cpp HandleAuraWaterWalk :1661.
export const SPELL_AURA_WATER_WALK = 104;
// Cite: SpellAuraDefines.h SPELL_AURA_ADD_TARGET_TRIGGER = 109. Handler: HandleNoImmediateEffect —
// Spell::ProcSpellAuraTriggers. Cite: SpellAuras.cpp:170; Spell.cpp:7433–7468.
export const SPELL_AURA_ADD_TARGET_TRIGGER = 109;
// SPELL_AURA_MOD_POWER_REGEN_PERCENT (110): a percent of the power regen rate.
// Cite: SpellAuras.cpp:3644 HandleModPowerRegenPCT; StatSystem.cpp:551-552.
export const SPELL_AURA_MOD_POWER_REGEN_PERCENT = 110;
// SPELL_AURA_SAFE_FALL (144): an empty handler body; the modifier reduces fall damage.
// Cite: SpellAuras.cpp:5649; Player.cpp:19535-19537.
export const SPELL_AURA_SAFE_FALL = 144;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_STEALTH_LEVEL = 154. Handler: SpellAuras.cpp
// HandleModStealthLevel :2621.
export const SPELL_AURA_MOD_STEALTH_LEVEL = 154;
/** Cite: SpellAuraDefines.h SPELL_AURA_BIND_SIGHT = 1. Handler: SpellAuras.cpp HandleBindSight :2126. */
export const SPELL_AURA_BIND_SIGHT = 1;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_POWER_COST_SCHOOL = 73. Handler: SpellAuras.cpp
// HandleModPowerCost :4208.
export const SPELL_AURA_MOD_POWER_COST_SCHOOL = 73;
/** Cite: SpellAuraDefines.h SPELL_AURA_FAR_SIGHT = 76. Handler: SpellAuras.cpp HandleFarSight :2139. */
export const SPELL_AURA_FAR_SIGHT = 76;

// ── SPELL_AURA_SPLIT_DAMAGE_PCT (81) ── no immediate effect; the split path of the absorb.
// Cite: SpellAuras.cpp:142; Unit.cpp:2539-2570.
export const SPELL_AURA_SPLIT_DAMAGE_PCT = 81;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_UNATTACKABLE = 93. Handler: SpellAuras.cpp HandleModUnattackable
// :4454.
export const SPELL_AURA_MOD_UNATTACKABLE = 93;
// SPELL_AURA_INTERRUPT_REGEN (94): while held, rage regen is skipped.
// Cite: SpellAuras.cpp:5109 HandleInterruptRegen; Player.cpp:2301 RegenerateAll.
export const SPELL_AURA_INTERRUPT_REGEN = 94;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_MELEE_DAMAGE_TAKEN_PCT = 126. Handler: HandleNoImmediateEffect —
// Unit::MeleeDamageBonusTaken. Cite: SpellAuras.cpp:187; Unit.cpp:7634.
export const SPELL_AURA_MOD_MELEE_DAMAGE_TAKEN_PCT = 126;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_SPEED_ALWAYS = 129. Handler: SpellAuras.cpp
// HandleAuraModIncreaseSpeed :2880 (shared with 31).
export const SPELL_AURA_MOD_SPEED_ALWAYS = 129;
// SPELL_AURA_RETAIN_COMBO_POINTS (148): on expiry by time only, remove the points the grant added.
// Cite: SpellAuras.cpp:4436 HandleAuraRetainComboPoints (Premeditation).
export const SPELL_AURA_RETAIN_COMBO_POINTS = 148;
// Cite: SpellAuraDefines.h SPELL_AURA_RESIST_PUSHBACK = 149. Handler: HandleNoImmediateEffect —
// Spell::Delayed / DelayedChannel. Cite: SpellAuras.cpp:210; Spell.cpp:6819, :6851.
export const SPELL_AURA_RESIST_PUSHBACK = 149;
// SPELL_AURA_MOD_ATTACKER_SPELL_CRIT_CHANCE (179): crit taken for a magic damage class, by school.
// Cite: SpellAuras.cpp:240; Unit.cpp:3516-3536 GetCritTakenChance.
export const SPELL_AURA_MOD_ATTACKER_SPELL_CRIT_CHANCE = 179;
// Cite: SpellAuraDefines.h SPELL_AURA_SPLIT_DAMAGE_FLAT = 153. Handler: HandleNoImmediateEffect —
// Unit::CalculateAbsorbAndResist. Cite: SpellAuras.cpp:214; Unit.cpp:2501–2537.
export const SPELL_AURA_SPLIT_DAMAGE_FLAT = 153;
// Cite: SpellAuraDefines.h SPELL_AURA_POWER_BURN_MANA = 162. Handler: SpellAuras.cpp HandleAuraPowerBurn
// :3124; PeriodicTick :4892–4946.
export const SPELL_AURA_POWER_BURN_MANA = 162;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_DAMAGE_DONE_VERSUS = 168. Handler: HandleNoImmediateEffect —
// SpellDamageBonusDone / MeleeDamageBonusDone. Cite: SpellAuras.cpp:229; Unit.cpp:7058, :7503.
export const SPELL_AURA_MOD_DAMAGE_DONE_VERSUS = 168;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_INCREASE_ENERGY = 35. Handler: SpellAuras.cpp
// HandleAuraModIncreaseEnergy :3719.
export const SPELL_AURA_MOD_INCREASE_ENERGY = 35;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_INCREASE_ENERGY_PERCENT = 132. Handler: SpellAuras.cpp
// HandleAuraModIncreaseEnergyPercent :3734.
export const SPELL_AURA_MOD_INCREASE_ENERGY_PERCENT = 132;

// ── SPELL_AURA_PERIODIC_MANA_FUNNEL (63) ── an unused handler; the aura is obsolete.
// Cite: SpellAuras.cpp:124 dispatch; SpellAuras.h HandleUnused.
export const SPELL_AURA_PERIODIC_MANA_FUNNEL = 63;
/** Cite: SpellAuraDefines.h SPELL_AURA_FEIGN_DEATH = 66. Handler: SpellAuras.cpp HandleFeignDeath :2382. */
export const SPELL_AURA_FEIGN_DEATH = 66;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_POWER_COST_SCHOOL_PCT = 72. Handler: SpellAuras.cpp
// HandleModPowerCostPCT :4190.
export const SPELL_AURA_MOD_POWER_COST_SCHOOL_PCT = 72;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_PERCENT_STAT = 80. Handler: SpellAuras.cpp HandleModPercentStat
// :3489.
export const SPELL_AURA_MOD_PERCENT_STAT = 80;
/** Cite: SpellAuraDefines.h SPELL_AURA_GHOST = 95. Handler: SpellAuras.cpp HandleAuraGhost :4396. */
export const SPELL_AURA_GHOST = 95;
// Cite: SpellAuraDefines.h SPELL_AURA_SPELL_MAGNET = 96. Handler: HandleNoImmediateEffect —
// Unit::SelectMagnetTarget. Cite: SpellAuras.cpp:157; Unit.cpp:6894–6919.
export const SPELL_AURA_SPELL_MAGNET = 96;
// Cite: SpellAuraDefines.h SPELL_AURA_AURAS_VISIBLE = 100. Handler: SpellAuras.cpp HandleAurasVisible
// :3383.
export const SPELL_AURA_AURAS_VISIBLE = 100;
/** Cite: SpellAuraDefines.h SPELL_AURA_HOVER = 106. Handler: SpellAuras.cpp HandleAuraHover :1679. */
export const SPELL_AURA_HOVER = 106;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_REGEN_DURING_COMBAT = 116. Handler: HandleNoImmediateEffect —
// Player::RegenerateAll / RegenerateHealth. Cite: SpellAuras.cpp:177; Player.cpp:2297–2400.
export const SPELL_AURA_MOD_REGEN_DURING_COMBAT = 116;
// Cite: SpellAuraDefines.h SPELL_AURA_UNTRACKABLE = 120. Handler: SpellAuras.cpp HandleAuraUntrackable
// :4374.
export const SPELL_AURA_UNTRACKABLE = 120;

// ── SI3 aura batch 14 (this claim list) ───────────────────────────────────── Cite: SpellAuraDefines.h
// SPELL_AURA_EMPATHY = 121. Handler: SpellAuras.cpp HandleAuraEmpathy :4351.
export const SPELL_AURA_EMPATHY = 121;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_POSSESS_PET = 128. Handler: SpellAuras.cpp HandleModPossessPet
// :2258.
export const SPELL_AURA_MOD_POSSESS_PET = 128;
// SPELL_AURA_MOD_MOUNTED_SPEED_ALWAYS (130): shared with auras 32 and 172, stacking as a product on
// the run rate. Cite: SpellAuras.cpp:2889; Unit.cpp:8340 UpdateSpeed.
export const SPELL_AURA_MOD_MOUNTED_SPEED_ALWAYS = 130;
// Cite: SpellAuraDefines.h SPELL_AURA_CHARISMA = 145. Dispatch → HandleUnused (obsolete). Cite:
// SpellAuras.cpp:206.
export const SPELL_AURA_CHARISMA = 145;
// Cite: SpellAuraDefines.h SPELL_AURA_MECHANIC_IMMUNITY_MASK = 147. Handler: SpellAuras.cpp:2951–2959
// HandleModMechanicImmunityMask (IsImmuneToSpell check).
export const SPELL_AURA_MECHANIC_IMMUNITY_MASK = 147;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_AOE_AVOIDANCE = 160. Handler: HandleNoImmediateEffect —
// Unit.cpp:3713–3715 MagicSpellHitResult AoE miss.
export const SPELL_AURA_MOD_AOE_AVOIDANCE = 160;
/** Cite: SpellAuraDefines.h SPELL_AURA_164 = 164. Unused aura id. Cite: SpellAuraDefines.h:299. */
export const SPELL_AURA_164 = 164;
// Cite: SpellAuraDefines.h SPELL_AURA_DETECT_AMORE = 170. Handler: SpellAuras.cpp:2719–2725
// HandleDetectAmore — PLAYER_FIELD_BYTES2 client flag.
export const SPELL_AURA_DETECT_AMORE = 170;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_MOUNTED_SPEED_NOT_STACK = 172. Handler: SpellAuras.cpp
// HandleAuraModIncreaseMountedSpeed (shared with 32/130).
export const SPELL_AURA_MOD_MOUNTED_SPEED_NOT_STACK = 172;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_FACTION_REPUTATION_GAIN = 190. Handler: HandleNoImmediateEffect —
// Player.cpp:6301 CalculateReputationGain by faction.
export const SPELL_AURA_MOD_FACTION_REPUTATION_GAIN = 190;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_HEALING_DONE_PERCENT = 136. Handler: HandleNoImmediateEffect —
// Unit::SpellHealingBonusDone. Cite: SpellAuras.cpp:197; Unit.cpp:7200–7203.
export const SPELL_AURA_MOD_HEALING_DONE_PERCENT = 136;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_BASE_RESISTANCE_PCT = 142. Handler: SpellAuras.cpp
// HandleAuraModBaseResistancePercent :3425.
export const SPELL_AURA_MOD_BASE_RESISTANCE_PCT = 142;
// Cite: SpellAuraDefines.h SPELL_AURA_TRACK_STEALTHED = 151. Handler: SpellAuras.cpp
// HandleAuraTrackStealthed :2174.
export const SPELL_AURA_TRACK_STEALTHED = 151;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_WATER_BREATHING = 155. Handler: SpellAuras.cpp
// HandleModWaterBreathing :1701.
export const SPELL_AURA_MOD_WATER_BREATHING = 155;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_REPUTATION_GAIN = 156. Handler: HandleNoImmediateEffect —
// Player::CalculateReputationGain. Cite: SpellAuras.cpp:217; Player.cpp:6297.
export const SPELL_AURA_MOD_REPUTATION_GAIN = 156;
// Cite: SpellAuraDefines.h SPELL_AURA_NO_PVP_CREDIT = 159. Handler: HandleNoImmediateEffect —
// Player::RewardHonor (Honorless Target 2479). Cite: SpellAuras.cpp:220; Player.cpp:6626–6627.
export const SPELL_AURA_NO_PVP_CREDIT = 159;
// Cite: SpellAuraDefines.h SPELL_AURA_USE_NORMAL_MOVEMENT_SPEED = 191. Handler: SpellAuras.cpp
// HandleAuraModUseNormalSpeed :2920; Unit.cpp:8374–8384.
export const SPELL_AURA_USE_NORMAL_MOVEMENT_SPEED = 191;

// Dead-talent gap. SPELL_AURA_MOD_OFFHAND_DAMAGE_PCT (122): an off-hand damage percent.
// Cite: SpellAuras.cpp:4175 HandleModOffhandDamagePercent.
export const SPELL_AURA_MOD_OFFHAND_DAMAGE_PCT = 122;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_CRIT_PERCENT_VERSUS = 169. Handler: HandleNoImmediateEffect -
// Unit.cpp:3561 GetCritMultiplier creature slaying bonus.
export const SPELL_AURA_MOD_CRIT_PERCENT_VERSUS = 169;
// SPELL_AURA_MOD_RESISTANCE_OF_STAT_PERCENT (182): intellect times the percent added to armor. Only
// the physical mask is supported; the C++ logs an error for any other. Cite: StatSystem.cpp:125-138.
export const SPELL_AURA_MOD_RESISTANCE_OF_STAT_PERCENT = 182;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_ATTACKER_RANGED_HIT_CHANCE = 185. Handler:
// HandleNoImmediateEffect - Unit.cpp:3794 CalculateEffectiveMissChance (victim aura).
export const SPELL_AURA_MOD_ATTACKER_RANGED_HIT_CHANCE = 185;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_ATTACKER_SPELL_HIT_CHANCE = 186. Handler: HandleNoImmediateEffect
// - Unit.cpp:3874 MagicSpellHitResult (victim aura, schoolMask).
export const SPELL_AURA_MOD_ATTACKER_SPELL_HIT_CHANCE = 186;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_ATTACKER_MELEE_CRIT_CHANCE = 187. Handler:
// HandleNoImmediateEffect - Unit.cpp:3525 GetCritTakenChance (victim aura).
export const SPELL_AURA_MOD_ATTACKER_MELEE_CRIT_CHANCE = 187;
// Cite: SpellAuraDefines.h SPELL_AURA_MOD_ATTACKER_RANGED_CRIT_CHANCE = 188. Handler:
// HandleNoImmediateEffect - Unit.cpp:3528 GetCritTakenChance (victim aura).
export const SPELL_AURA_MOD_ATTACKER_RANGED_CRIT_CHANCE = 188;

/** Effect family that routes into the aura dispatch table. */
export function isApplyAuraFamily(effect: number): boolean {
  return (
    effect === SPELL_EFFECT_APPLY_AURA
    || effect === SPELL_EFFECT_APPLY_AREA_AURA_PARTY
    || effect === SPELL_EFFECT_APPLY_AREA_AURA_PET
    || effect === SPELL_EFFECT_PERSISTENT_AREA_AURA
  );
}
