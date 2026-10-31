// Creature AI constants: EventAI type ids, action types, flags, school and mechanic maps, and
// immune-mask helpers. Pure domain, every default cited from CMaNGOS Classic sources.

import type {
  Mechanic,
  School,
  SpellDef,
} from '../../data/schema.ts';

// Config defaults (World.cpp setConfigPos)

/** CONFIG_FLOAT_RATE_CREATURE_AGGRO — World.cpp ~443, mangosd.conf Rate.Creature.Aggro */
export const RATE_CREATURE_AGGRO = 1.0;

// CONFIG_FLOAT_CREATURE_FAMILY_ASSISTANCE_RADIUS — World.cpp ~472, mangosd.conf
// CreatureFamilyAssistanceRadius = 5
export const CREATURE_FAMILY_ASSISTANCE_RADIUS = 5.0;

// CONFIG_FLOAT_CREATURE_CHECK_FOR_HELP_RADIUS — World.cpp:473, default 5. Same 5 yd as the
// assistance radius but continuous: CheckForHelp runs from MoveInLineOfSight all fight.
export const CREATURE_CHECK_FOR_HELP_RADIUS = 5.0;

// CONFIG_UINT32_CREATURE_FAMILY_ASSISTANCE_DELAY — World.cpp:661, default 1500. The gap between
// a creature entering combat and its neighbours joining. Cite: Creature.cpp:2163.
export const CREATURE_FAMILY_ASSISTANCE_DELAY_MS = 1500;

// CONFIG_UINT32_CREATURE_CHECK_FOR_HELP_AGGRO_DELAY — World.cpp:474, default 2000. SetInCombatState
// disables CheckForHelp on the newly engaged creature for this long. Cite: Unit.cpp:7995.
export const CREATURE_CHECK_FOR_HELP_AGGRO_DELAY_MS = 2000;

// Default detection when template Detection is absent. Unit.h GetDetectionRange returns 18; the
// Creature ctor seeds 20 then overwrites from cinfo->Detection.
export const DEFAULT_DETECTION_RANGE = 18;

/** Minimum aggro radius (yards) — Unit.cpp ~11777–11779 */
export const MIN_AGGRO_DISTANCE = 5;

/** Level-diff floor: player more than 25 levels below creature — Unit.cpp ~11758–11760 */
export const AGGRO_LEVEL_DIFF_CAP = -25;

/** Player-controlled pet aggro factor — Unit.cpp ~11781–11782 */
export const PET_AGGRO_FACTOR = 0.65;

// ExtraFlags bits we gate on this system (Creature.h ~49–60)

export const CREATURE_EXTRA_FLAG = {
  NO_AGGRO_ON_SIGHT: 0x00000002, // 2
  /** Creature.h:52 — skip parry-haste swing reduction. */
  NO_PARRY_HASTEN: 0x00000008, // 8
  RUN_DURING_WANDER: 0x00000020, // 32
  /** Creature.h:56 — always invisible (script triggers). */
  INVISIBLE: 0x00000080,         // 128
  AGGRO_ZONE: 0x00000200,        // 512
  GUARD: 0x00000400,             // 1024
  NO_CALL_ASSIST: 0x00000800,    // 2048
  /** Creature.h:65 — Civilian-column substitute. Classic IsCivilian is Creature.h:636. */
  CIVILIAN: 0x00010000,          // 65536
} as const;

// creature_template StaticFlags / StaticFlags2 bits this tree gates on, counted over the 10,384
// shipped rows. Cite: CreatureDefines.h:27-61.
export const CREATURE_STATIC_FLAGS = {
  /** 3 rows. Skinning and the corpse still work; the loot roll does not happen. */
  NO_LOOT: 0x00000004,
  /** 8 (0x8) — already read by the damage path as death prevention. */
  UNKILLABLE: 0x00000008,
  /** 256 (0x100) — immobilised, already read by sessionMotion. */
  SESSILE: 0x00000100,
  // 71 rows (Imp, Deer, Sheep, Earthbind Totem): never melees, and flees for 30 s when a
  // player-controlled unit engages it. Cite: CreatureDefines.h:49; Unit.cpp:7980 DoFlee(30000).
  NO_MELEE_FLEE: 0x00100000,
} as const;

// `CreatureStaticFlags2` — creature_template.StaticFlags2. Counts on the 10,384 shipped rows. Cite:
// CreatureDefines.h:65-90.
export const CREATURE_STATIC_FLAGS2 = {
  NO_CRUSHING_BLOWS: 0x00000010, // 2 rows — Unit.cpp:3109 CanCrushInCombat
  /** 8 rows (Sentry Totem, Eye of Kilrogg): the owner takes no threat for its actions. */
  NO_OWNER_THREAT: 0x00000020,
  // 369 of 10,384, so the slowdown is the DEFAULT. Below 30% health chase and wander speed take
  // a 1 - ((30 - min(hp%,30)) * 1.67)/100 multiplier. Cite: Creature.cpp:2938 IsSlowedInCombat.
  NO_WOUNDED_SLOWDOWN: 0x00000040,
  /** 72 rows — a guard with this bit keeps attacking a Feign Death'd hunter. */
  IGNORE_FEIGN_DEATH: 0x00000100,
} as const;

// Creature::IsSlowedInCombat — below 30% health and not opted out, reaching 0.67x at 10% hp and
// 0.50x at 0%. Returns 1 when nothing applies. Cite: Creature.cpp:2938-2941.
export function woundedSlowdownFactor(healthPercent: number, staticFlags2: number): number {
  if ((staticFlags2 & CREATURE_STATIC_FLAGS2.NO_WOUNDED_SLOWDOWN) !== 0) return 1;
  if (!(healthPercent < 30)) return 1;
  const hp = Math.max(0, Math.min(30, healthPercent));
  return 1 - ((30 - hp) * 1.67) / 100;
}

// GuardAI assist radii (GuardAI.cpp:54–76 MoveInLineOfSight)

export const GUARD_ASSIST_PLAYER_DIST_YD = 5.0;
export const GUARD_ASSIST_VICTIM_DIST_YD = 10.0;
export const GUARD_ASSIST_PVP_DIST_YD = 30.0;
export const GUARD_ASSIST_GUARD_CIVILIAN_DIST_YD = 20.0;

// Motion constants: Wander, Flee, Home (RandomMovementGenerator.cpp, HomeMovementGenerator.cpp)

/** RandomMovementGenerator.cpp:166 WanderMovementGenerator: 3000–10000 ms pause, 3 max moves */
export const WANDER_DELAY_MIN_MS = 3000;
export const WANDER_DELAY_MAX_MS = 10000;
export const WANDER_MAX_HOPS = 3;

/** RandomMovementGenerator.cpp:242–243 MIN_QUIET_DISTANCE 28.0f, MAX_QUIET_DISTANCE 43.0f */
/** `DoFlee(30000)` for a NO_MELEE_FLEE critter. Cite: Unit.cpp:7982. */
export const CRITTER_FLEE_MS = 30000;

export const FLEE_MIN_QUIET_DISTANCE_YD = 28.0;
export const FLEE_MAX_QUIET_DISTANCE_YD = 43.0;

/** HomeMovementGenerator.cpp:52–60 outdoor evade distance > 150 yd despawns */
export const HOME_DESPAWN_DISTANCE_YD = 150;
export const HOME_DESPAWN_DISTANCE_SQ = 22500;

// Chase movement: Backpedal & Fan-out (TargetedMovementGenerator.cpp)

/** TargetedMovementGenerator.cpp:35 CHASE_CLOSENESS_TIMER 2000 ms */
export const CHASE_CLOSENESS_TIMER_MS = 2000;

/** TargetedMovementGenerator.cpp:395 targetDist = min(combinedCombatReach, 3.75f) */
export const CHASE_BACKPEDAL_MAX_DIST_YD = 3.75;

/** TargetedMovementGenerator.cpp:408 inside model threshold: distSq < (targetDist^2) * 0.33f */
export const CHASE_BACKPEDAL_THRESHOLD_FACTOR = 0.33;

/** TargetedMovementGenerator.cpp:410 backpedal distance: targetDist * 0.75f */
export const CHASE_BACKPEDAL_DIST_FACTOR = 0.75;

/** TargetedMovementGenerator.cpp:428 fanning search radius 1.0 yd */
export const CHASE_FANNING_RADIUS_YD = 1.0;

/** TargetedMovementGenerator.cpp:429 fanAngleMin pi/5 (36 deg) */
export const CHASE_FAN_ANGLE_MIN_RAD = Math.PI / 5;

/** TargetedMovementGenerator.cpp:430 fanAngleMax pi/4 (45 deg) */
export const CHASE_FAN_ANGLE_MAX_RAD = Math.PI / 4;

// Follow distance: PET_FOLLOW_DIST vs GuardianAI (do not share one constant)

/** MotionMaster.h:45 `#define PET_FOLLOW_DIST 1.0f` — pet MoveFollow park. */
export const PET_FOLLOW_DIST_YD = 1.0;

// GuardianAI.cpp:31 `m_followDist = 1.5f`. Not PET_FOLLOW_DIST. MotionMaster.h:46 is PET_FOLLOW_ANGLE
// (π/2), not a guardian dist define.
export const GUARDIAN_FOLLOW_DIST_YD = 1.5;

/** GuardianAI.cpp:35–36 UNIT_CREATED_BY_SPELL 11939 (Thule Ravenclaw Imp) → 3.f */
export const GUARDIAN_IMP_CREATED_BY_SPELL = 11939;
export const GUARDIAN_IMP_FOLLOW_DIST_YD = 3.0;

/** PetAI.cpp:190 recall arrival / repath slack is `PET_FOLLOW_DIST * 2`. */
export const PET_FOLLOW_SLACK_YD = PET_FOLLOW_DIST_YD * 2;

export function isGuardianFollow(spec: { isGuardian?: boolean }): boolean {
  return spec.isGuardian === true;
}

/** Pet follow 1.0; guardian follow 1.5 (Imp 11939 → 3). Separate constants. */
export function followDistFor(spec: {
  isGuardian?: boolean;
  createdBySpell?: number;
}): number {
  if (isGuardianFollow(spec)) {
    if (spec.createdBySpell === GUARDIAN_IMP_CREATED_BY_SPELL) return GUARDIAN_IMP_FOLLOW_DIST_YD;
    return GUARDIAN_FOLLOW_DIST_YD;
  }
  return PET_FOLLOW_DIST_YD;
}

// AIEventType enum (AIDefines.h:22–56)

export const AI_EVENT_TYPE = {
  JUST_DIED: 0,
  CRITICAL_HEALTH: 1,      // 10% health
  LOST_HEALTH: 2,          // 50% health
  LOST_SOME_HEALTH: 3,     // 90% health
  GOT_FULL_HEALTH: 4,
  CUSTOM_EVENTAI_A: 5,
  CUSTOM_EVENTAI_B: 6,
  GOT_CCED: 7,
  CUSTOM_EVENTAI_C: 8,
  CUSTOM_EVENTAI_D: 9,
  CUSTOM_EVENTAI_E: 10,
  CUSTOM_EVENTAI_F: 11,
  MAXIMAL_EVENTAI: 12,
  CALL_ASSISTANCE: 13,
  START_ESCORT: 100,
  START_ESCORT_B: 101,
  START_EVENT: 102,
  START_EVENT_A: 103,
  START_EVENT_B: 104,
  CUSTOM_A: 1000,
  CUSTOM_B: 1001,
  CUSTOM_C: 1002,
  CUSTOM_D: 1003,
  CUSTOM_E: 1004,
  CUSTOM_F: 1005,
} as const;

// EventAI type ids — full Classic enum (CreatureEventAI.h EventAI_Type ~40–86)

export const EVENT_T = {
  TIMER_IN_COMBAT: 0,
  TIMER_OOC: 1,
  HP: 2,
  MANA: 3,
  AGGRO: 4,
  KILL: 5,
  DEATH: 6,
  EVADE: 7,
  SPELLHIT: 8,
  RANGE: 9,
  OOC_LOS: 10,
  SPAWNED: 11,
  TARGET_HP: 12,
  TARGET_CASTING: 13,
  FRIENDLY_HP: 14,
  FRIENDLY_IS_CC: 15,
  FRIENDLY_MISSING_BUFF: 16,
  SUMMONED_UNIT: 17,
  TARGET_MANA: 18,
  QUEST_ACCEPT: 19,
  QUEST_COMPLETE: 20,
  REACHED_HOME: 21,
  RECEIVE_EMOTE: 22,
  AURA: 23,
  TARGET_AURA: 24,
  SUMMONED_JUST_DIED: 25,
  SUMMONED_JUST_DESPAWN: 26,
  MISSING_AURA: 27,
  TARGET_MISSING_AURA: 28,
  TIMER_GENERIC: 29,
  RECEIVE_AI_EVENT: 30,
  ENERGY: 31,
  SELECT_ATTACKING_TARGET: 32,
  FACING_TARGET: 33,
  SPELLHIT_TARGET: 34,
  DEATH_PREVENTED: 35,
  TARGET_NOT_REACHABLE: 36,
  SPELL_CAST: 37,
  BOARD_VEHICLE: 38,
  PASSENGER_BOARDED: 39,
  VEHICLE_RETURN: 40,
  PASSENGER_SPAWN: 41,
  PASSENGER_CONTROL_END: 42,
} as const;

/** ACTION_T_TEXT — CreatureEventAI.h ~93; ProcessAction ~674–728. TextId1..3. */
export const ACTION_T_TEXT = 1;
/** ACTION_T_SOUND — CreatureEventAI.h ~96; ProcessAction ~760–761. soundId. */
export const ACTION_T_SOUND = 4;
/** ACTION_T_EMOTE — CreatureEventAI.h ~97; ProcessAction ~763–764. emoteId. */
export const ACTION_T_EMOTE = 5;
/** ACTION_T_CAST — CreatureEventAI.h ~102 */
export const ACTION_T_CAST = 11;

// ACTION_T_SPAWN — CreatureEventAI.h ~103 Params: creatureId, target, durationMs (0 = no timed despawn).
// Roadmap “SUMMON” name maps here (no separate ACTION_T_SUMMON enum in Classic).
export const ACTION_T_SPAWN = 12;
/** Alias for readability — same id as ACTION_T_SPAWN (CreatureEventAI.h ~103). */
export const ACTION_T_SUMMON = ACTION_T_SPAWN;

// ACTION_T_AUTO_ATTACK — CreatureEventAI.h ~111; ProcessAction ~900–901. param1: AllowAttackState (0 = stop
// melee AA, nonzero = enable).
export const ACTION_T_AUTO_ATTACK = 20;

/** ACTION_T_SET_PHASE — CreatureEventAI.h ~113; ProcessAction ~919–922 (`m_Phase = phase`). */
export const ACTION_T_SET_PHASE = 22;

// ACTION_T_FLEE_FOR_ASSIST — CreatureEventAI.h ~116; ProcessAction ~948–950 → DoFlee(). Roadmap “FLEE”; no
// action params.
export const ACTION_T_FLEE_FOR_ASSIST = 25;

// ACTION_T_REMOVEAURASFROMSPELL — CreatureEventAI.h ~119; ProcessAction ~971–973. param1: target selector;
// param2: spellId → RemoveAurasDueToSpell.
export const ACTION_T_REMOVEAURASFROMSPELL = 28;

// ACTION_T_SUMMON_ID — CreatureEventAI.h ~123 Params: creatureId, target, spawnId → creature_ai_summons
// lookup.
export const ACTION_T_SUMMON_ID = 32;

// TARGET_T_SELF — CreatureEventAI.h:163. A summon row naming it never AttackStarts its spawn.
export const EVENT_AI_TARGET_SELF = 0;

// ACTION_T_SET_INST_DATA — CreatureEventAI.h ~125; ProcessAction ~1044–1054. param1: field; param2: value
// on InstanceData.
export const ACTION_T_SET_INST_DATA = 34;

// ACTION_T_UPDATE_TEMPLATE — CreatureEventAI.h ~127; ProcessAction ~1076–1083. param1: new
// creature_template entry.
export const ACTION_T_UPDATE_TEMPLATE = 36;

// ACTION_T_CALL_FOR_HELP — CreatureEventAI.h ~130; ProcessAction ~1102–1105. param1: radius yards
// (DoCallForHelp).
export const ACTION_T_CALL_FOR_HELP = 39;

// ACTION_T_FORCE_DESPAWN — CreatureEventAI.h ~132; ProcessAction ~1112–1114. param1: ms delay (0 =
// instant).
export const ACTION_T_FORCE_DESPAWN = 41;

// ACTION_T_SET_DEATH_PREVENTION — CreatureEventAI.h ~133; ProcessAction ~1117–1119. param1: 0 off / nonzero
// on (UNKILLABLE).
export const ACTION_T_SET_DEATH_PREVENTION = 42;

// ACTION_T_THROW_AI_EVENT — CreatureEventAI.h ~136; ProcessAction ~1140–1149. param1: AIEventType; param2:
// radius; param3: target selector.
export const ACTION_T_THROW_AI_EVENT = 45;

// ACTION_T_SET_THROW_MASK — CreatureEventAI.h:137. param1 is an AI_EVENT_TYPE bitmask; mask 0,
// the ctor default, means no automatic DamageTaken / HealedBy / JustDied throws.
export const ACTION_T_SET_THROW_MASK = 46;

// ACTION_T_SET_STAND_STATE — CreatureEventAI.h ~138; ProcessAction ~1157–1159. param1: UnitStandStateType.
export const ACTION_T_SET_STAND_STATE = 47;

// Default radius for automatic health/death AI event throws. Cite: CreatureEventAI.h:823
// AIEVENT_DEFAULT_THROW_RADIUS 30.0f.
export const AIEVENT_DEFAULT_THROW_RADIUS_YD = 30;

// DamageTaken health marks (90% / 50% / 10%). Index = m_throwAIEventStep 0..2. Cite:
// CreatureEventAI.cpp:1839–1851 HEALTH_STEPS; CreatureEventAI.h:933–936.
export const AI_EVENT_HEALTH_STEP_PCTS = [90, 50, 10] as const;

// AIEventType sent at each health step (LOST_SOME / LOST / CRITICAL). Cite: CreatureEventAI.cpp:1851
// sendEvent[].
export const AI_EVENT_HEALTH_STEP_TYPES = [
  AI_EVENT_TYPE.LOST_SOME_HEALTH,
  AI_EVENT_TYPE.LOST_HEALTH,
  AI_EVENT_TYPE.CRITICAL_HEALTH,
] as const;

// ACTION_T_SET_REACT_STATE — CreatureEventAI.h ~141; ProcessAction ~1206–1209. param1: ReactStates (0
// passive / 1 defensive / 2 aggressive).
export const ACTION_T_SET_REACT_STATE = 50;

// ACTION_T_START_RELAY_SCRIPT — CreatureEventAI.h ~144. Dispositioned: it needs the DBScript
// opcode VM, so it is not in ACTION_HANDLERS. See the census DISPOSITION_ACTIONS.
export const ACTION_T_START_RELAY_SCRIPT = 53;

/** ACTION_T_KILLED_MONSTER — CreatureEventAI.h:124 (CreatureId, Target). 2 DB rows. */
export const ACTION_T_KILLED_MONSTER = 33;

/** ACTION_T_PAUSE_WAYPOINTS — CreatureEventAI.h:142 (doPause: 1 pause, 0 unpause). 1 DB row. */
export const ACTION_T_PAUSE_WAYPOINTS = 51;

/** ACTION_T_SET_FACING — CreatureEventAI.h:150 (Target, 0 = set / 1 = reset). 2 DB rows. */
export const ACTION_T_SET_FACING = 59;

// ACTION_T_TEXT_NEW — CreatureEventAI.h ~145; ProcessAction ~1246–1268. param1: textId; param2: target;
// param3: templateId (random from template when set).
export const ACTION_T_TEXT_NEW = 54;

/** ACTION_T_ATTACK_START — CreatureEventAI.h ~146; ProcessAction ~1271–1280. param1: target selector. */
export const ACTION_T_ATTACK_START = 55;

// ACTION_T_DESPAWN_GUARDIANS — CreatureEventAI.h ~147; ProcessAction ~1283–1295. param1: guardian entry (0
// = all).
export const ACTION_T_DESPAWN_GUARDIANS = 56;

// ACTION_T_SET_RANGED_MODE — CreatureEventAI.h ~148. param1 is RangeModeType (0 disables),
// param2 the chase distance in yards. Cite: UnitAI.cpp SetRangedMode ~979.
export const ACTION_T_SET_RANGED_MODE = 57;

// ACTION_T_SET_FOLLOW_MOVEMENT — CreatureEventAI.h ~155; ProcessAction ~1366–1367. param1: 0 off / nonzero
// on.
export const ACTION_T_SET_FOLLOW_MOVEMENT = 64;

// ---- SESSION 4 tail actions (aifid-s4) — CreatureEventAI.h ACTION_T_* ----

/** ACTION_T_SET_FACTION — CreatureEventAI.h ~93; ProcessAction ~730–737. factionId, factionFlags. */
export const ACTION_T_SET_FACTION = 2;
/** ACTION_T_MORPH_TO_ENTRY_OR_MODEL — ~94; ProcessAction ~739–758. creatureId OR modelId. */
export const ACTION_T_MORPH_TO_ENTRY_OR_MODEL = 3;
/** ACTION_T_RANDOM_SOUND — ~100; ProcessAction ~766–771. soundId1..3. */
export const ACTION_T_RANDOM_SOUND = 9;
/** ACTION_T_RANDOM_EMOTE — ~101; ProcessAction ~773–778. emoteId1..3. */
export const ACTION_T_RANDOM_EMOTE = 10;
/** ACTION_T_THREAT_SINGLE — ~104; ProcessAction ~828–837. value, target, isDirect. */
export const ACTION_T_THREAT_SINGLE = 13;
/** ACTION_T_THREAT_ALL_PCT — ~105; ProcessAction ~839–845. percent. */
export const ACTION_T_THREAT_ALL_PCT = 14;
/** ACTION_T_QUEST_EVENT — ~106; ProcessAction ~847–862. questId, target, rewardGroup. */
export const ACTION_T_QUEST_EVENT = 15;
/** ACTION_T_SET_UNIT_FIELD — ~108; ProcessAction ~873–886. field, value, target. */
export const ACTION_T_SET_UNIT_FIELD = 17;
/** ACTION_T_SET_UNIT_FLAG — ~109; ProcessAction ~888–892. flag mask, target. */
export const ACTION_T_SET_UNIT_FLAG = 18;
/** ACTION_T_REMOVE_UNIT_FLAG — ~110; ProcessAction ~894–898. flag mask, target. */
export const ACTION_T_REMOVE_UNIT_FLAG = 19;
/** ACTION_T_COMBAT_MOVEMENT — ~112; ProcessAction ~903–917. state, melee. */
export const ACTION_T_COMBAT_MOVEMENT = 21;
/** ACTION_T_EVADE — ~115; ProcessAction ~942–946. combatOnly. */
export const ACTION_T_EVADE = 24;
/** ACTION_T_RANDOM_PHASE — ~121; ProcessAction ~991–993. phase1..3. */
export const ACTION_T_RANDOM_PHASE = 30;
/** ACTION_T_RANDOM_PHASE_RANGE — ~122; ProcessAction ~995–999. phaseMin, phaseMax. */
export const ACTION_T_RANDOM_PHASE_RANGE = 31;
/** ACTION_T_DIE — ~128; ProcessAction ~1085–1093. Suicide(). */
export const ACTION_T_DIE = 37;
/** ACTION_T_ZONE_COMBAT_PULSE — ~129; ProcessAction ~1095–1100. SetInCombatWithZone. */
export const ACTION_T_ZONE_COMBAT_PULSE = 38;
/** ACTION_T_SET_SHEATH — ~131; ProcessAction ~1107–1109. sheath state. */
export const ACTION_T_SET_SHEATH = 40;
/** ACTION_T_MOUNT_TO_ENTRY_OR_MODEL — ~134; ProcessAction ~1122–1138. entry OR modelId. */
export const ACTION_T_MOUNT_TO_ENTRY_OR_MODEL = 43;
/** ACTION_T_CHANGE_MOVEMENT — ~139; ProcessAction ~1162–1204. movementType, wander/path, flags. */
export const ACTION_T_CHANGE_MOVEMENT = 48;
/** ACTION_T_SET_WALK — ~149; ProcessAction ~1331–1338. walkSetting type. */
export const ACTION_T_SET_WALK = 58;
/** ACTION_T_SET_IMMOBILIZED_STATE — ~152; ProcessAction ~1345–1348. apply, combatOnly. */
export const ACTION_T_SET_IMMOBILIZED_STATE = 61;

/** GetRandActionParam — pick param1/2/3 via rnd%3. Cite: CreatureEventAI.cpp ~1688–1697. */
export function getRandActionParam(rnd: number, param1: number, param2: number, param3: number): number {
  switch (((rnd % 3) + 3) % 3) {
    case 0:
      return param1;
    case 1:
      return param2;
    case 2:
      return param3;
    default:
      return 0;
  }
}

// RANDOM_PHASE_RANGE: phase = rnd % (max-min+1) + min when max > min. Cite: CreatureEventAI.cpp ~995–999.
export function randomPhaseInRange(rnd: number, phaseMin: number, phaseMax: number): number | null {
  const lo = phaseMin | 0;
  const hi = phaseMax | 0;
  if (hi <= lo) return null;
  const span = hi - lo + 1;
  return (Math.abs(rnd | 0) % span) + lo;
}

/** UnitAI.h ReactStates — REACT_PASSIVE/DEFENSIVE/AGGRESSIVE. */
export const REACT_STATE = {
  PASSIVE: 0,
  DEFENSIVE: 1,
  AGGRESSIVE: 2,
} as const;

/** SheathState — SharedDefines / Unit. Cite: ACTION_T_SET_SHEATH ~1107–1109. */
export const SHEATH_STATE = {
  UNARMED: 0,
  MELEE: 1,
  RANGED: 2,
} as const;

/** Walk setting for ACTION_T_SET_WALK. Cite: CreatureEventAI.h walkSetting. */
export const WALK_SETTING = {
  WALK_DEFAULT: 0,
  RUN_DEFAULT: 1,
  WALK_CHASE: 2,
  RUN_CHASE: 3,
} as const;

// Classic unit field indices used by SET_UNIT_FIELD rows in the bake. Cite: UpdateFields.h
// OBJECT_END=6; UNIT_NPC_FLAGS=147; UNIT_FIELD_POWER1=23; UNIT_FIELD_FLAGS=46.
export const UNIT_FIELD = {
  POWER1: 23,
  FLAGS: 46,
  DISPLAYID: 131,
  MOUNTDISPLAYID: 133,
  NPC_FLAGS: 147,
} as const;

/** UnitAI.h RangeModeType TYPE_NONE = 0 (disables ranged mode). */
export const RANGE_MODE_TYPE_NONE = 0;

// CONFIG_UINT32_CREATURE_FAMILY_FLEE_DELAY — World.cpp ~662, mangosd.conf CreatureFamilyFleeDelay = 10000
// (ms). Used when DoFlee(duration=0). Cite: UnitAI.cpp DoFlee ~829–832.
export const CREATURE_FAMILY_FLEE_DELAY_MS = 10_000;

/** EFLAG_REPEATABLE — CreatureEventAI.h EventFlags ~201 */
export const EFLAG_REPEATABLE = 0x01;
/** EFLAG_RANDOM_ACTION — execute ONE random action per firing, not all. CreatureEventAI.h:206 */
export const EFLAG_RANDOM_ACTION = 0x20;

// creature_spell_list.Flags. Cite: CreatureSpellList.h:58-64 enum SpellListFlags. Measured on the
// 511 rows of the 238 armed lists: SUPPORT_ACTION 5, RANGED_ACTION 72, CATEGORY_COOLDOWN 4.
export const SPELL_LIST_FLAG = {
  /** Gated on the list's ChanceSupportAction, one roll per update. UnitAI.cpp:1214. */
  SUPPORT_ACTION: 1,
  /** Gated on ChanceRangedAttack (base ranged, -50 in melee) AND is a main spell. UnitAI.cpp:1227, :1174. */
  RANGED_ACTION: 2,
  /** Imposes the category cooldown instead of the normal one. Creature.cpp:1553. */
  CATEGORY_COOLDOWN: 4,
  /** Cast outside the one-action roll. UnitAI.cpp:1265-1269. */
  NON_BLOCKING: 8,
} as const;

export const CAST_FLAG = {
  /** Interrupt any non-melee spell before casting. UnitAI.cpp ~205–206. */
  INTERRUPT_PREVIOUS: 0x01,
  /** Zero mana cost + no cast time (TRIGGERED_OLD_TRIGGERED). UnitAI.cpp ~214. */
  TRIGGERED: 0x02,
  /** Skip CanCastSpell (OOM / OOR). UnitAI.cpp ~196–202. */
  FORCE_CAST: 0x04,
  // Prevent entering melee when OOM/OOR (header only; no separate C++ body beyond ranged-mode
  // keep-distance). UnitAI.h ~69.
  NO_MELEE_IF_OOM: 0x08,
  /** Forces the target to cast this spell on itself (caster=target). UnitAI.cpp ~169–170. */
  FORCE_TARGET_SELF: 0x10,
  /** Only cast if the target does not already have this spell's aura. UnitAI.cpp ~184–192. */
  AURA_NOT_PRESENT: 0x20,
  /** Can target UNIT_FLAG_UNINTERACTIBLE. UnitAI.cpp ~214 TRIGGERED_IGNORE_UNSELECTABLE_FLAG. */
  IGNORE_UNSELECTABLE: 0x40,
  /** Swaps target and caster for the cast. UnitAI.cpp ~167–168. */
  SWITCH_CASTER_TARGET: 0x80,
  /** Marks main (often ranged) spell — pace like primary attack. UnitAI.h ~74. */
  MAIN_SPELL: 0x100,
  /** Selects only player targets. CreatureEventAI.cpp ~790–791 SELECT_FLAG_PLAYER. */
  PLAYER_ONLY: 0x200,
  /** Cache distance-yourself spell (chase away). CreatureEventAI.cpp ~144–145. */
  DISTANCE_YOURSELF: 0x400,
  /** Selects only casting targets. CreatureEventAI.cpp ~794–795 SELECT_FLAG_CASTING. */
  TARGET_CASTING: 0x800,
  /** Targets coords only. UnitAI.cpp ~220–221. */
  ONLY_XYZ: 0x1000,
} as const;

/** Every CAST_FLAG bit value (for bake sweeps). */
export const CAST_FLAG_BITS: readonly number[] = [
  CAST_FLAG.INTERRUPT_PREVIOUS,
  CAST_FLAG.TRIGGERED,
  CAST_FLAG.FORCE_CAST,
  CAST_FLAG.NO_MELEE_IF_OOM,
  CAST_FLAG.FORCE_TARGET_SELF,
  CAST_FLAG.AURA_NOT_PRESENT,
  CAST_FLAG.IGNORE_UNSELECTABLE,
  CAST_FLAG.SWITCH_CASTER_TARGET,
  CAST_FLAG.MAIN_SPELL,
  CAST_FLAG.PLAYER_ONLY,
  CAST_FLAG.DISTANCE_YOURSELF,
  CAST_FLAG.TARGET_CASTING,
  CAST_FLAG.ONLY_XYZ,
];

// School / mechanic index for immune masks

/** SharedDefines.h SpellSchools — SchoolImmuneMask uses (1 << school). */
export const SCHOOL_INDEX: Record<School, number> = {
  physical: 0,
  holy: 1,
  fire: 2,
  nature: 3,
  frost: 4,
  shadow: 5,
  arcane: 6,
};

/** The same table read the other way, for creature_template.DamageSchool. */
export const SCHOOL_BY_INDEX: readonly School[] = [
  'physical', 'holy', 'fire', 'nature', 'frost', 'shadow', 'arcane',
];

// Creature::SetMeleeDamageSchool — a non-zero DamageSchool makes white hits magical (100 of
// 10,384: 41 fire, 25 frost, 14 nature, 13 shadow, 7 arcane). 0 or out of range is physical.
export function meleeDamageSchoolOf(damageSchool: number | undefined | null): School {
  return SCHOOL_BY_INDEX[(damageSchool ?? 0) | 0] ?? 'physical';
}

// SharedDefines.h Mechanics (1-based). MechanicImmuneMask uses (1 << (mechanic - 1)). Full enum — every
// bakeable mechanic name resolves to an id for immunity masks. Cite: SharedDefines.h:351–384.
export const MECHANIC_ID: Partial<Record<Mechanic, number>> = {
  charm: 1,
  disoriented: 2,
  disarm: 3,
  distract: 4,
  fear: 5,
  fumble: 6,
  root: 7,
  pacify: 8,
  silence: 9,
  sleep: 10,
  snare: 11,
  stun: 12,
  freeze: 13,
  knockout: 14,
  bleed: 15,
  bandage: 16,
  polymorph: 17,
  banish: 18,
  shield: 19,
  shackle: 20,
  mount: 21,
  persuade: 22,
  turn: 23,
  horror: 24,
  invulnerability: 25,
  interrupt: 26,
  daze: 27,
  discovery: 28,
  immune_shield: 29,
  sap: 30, // MECHANIC_SAPPED
};

// School / mechanic immunity — Creature::IsImmuneToSpell ~1972–1986

export function isSchoolImmune(
  schoolImmuneMask: number | undefined | null,
  school: School,
): boolean {
  const mask = schoolImmuneMask ?? 0;
  if (!mask) return false;
  const idx = SCHOOL_INDEX[school];
  if (idx == null) return false;
  return (mask & (1 << idx)) !== 0;
}

// SPELL_AURA_MOD_MECHANIC_RESISTANCE total for a spell: the max over spell.Mechanic and each
// effect mechanic, taken as a union so one stun cannot count twice. Cite: Unit.cpp:4015.
export function mechanicResistBonus(
  mechanicResistPct: Partial<Record<number, number>> | undefined,
  names: readonly (string | undefined | null)[],
): number {
  if (!mechanicResistPct) return 0;
  let best = 0;
  for (const name of names) {
    if (!name || name === 'none') continue;
    const id = MECHANIC_ID[name as Mechanic] ?? 0;
    const bonus = id ? (mechanicResistPct[id] ?? 0) : 0;
    if (bonus > best) best = bonus;
  }
  return best;
}

export function isMechanicImmune(
  mechanicImmuneMask: number | undefined | null,
  mechanic: Mechanic | undefined | null,
): boolean {
  const mask = mechanicImmuneMask ?? 0;
  if (!mask || !mechanic || mechanic === 'none') return false;
  const id = MECHANIC_ID[mechanic];
  if (id == null || id <= 0) return false;
  return (mask & (1 << (id - 1))) !== 0;
}

// Creature::IsImmuneToSpell for the castOnSelf=false path: the creature_immunities dispel set
// first, then mechanic or school mask. Effect-level mechanics are checked when applying CC.
export function isCreatureImmuneToSpell(
  masks:
    | { schoolImmuneMask?: number; mechanicImmuneMask?: number; immunities?: { dispelMask?: number } }
    | undefined
    | null,
  spell: Pick<SpellDef, 'school' | 'mechanic'> & { dispel?: number | null },
): boolean {
  if (!masks) return false;
  const dispel = spell.dispel ?? 0;
  if (dispel > 0 && (((masks.immunities?.dispelMask ?? 0) & (1 << dispel)) !== 0)) return true;
  if (isSchoolImmune(masks.schoolImmuneMask, spell.school)) return true;
  if (isMechanicImmune(masks.mechanicImmuneMask, spell.mechanic)) return true;
  return false;
}
