// QI4 — SCRIPT_COMMAND_* constants and data_flags bits. Cite: ScriptMgr.h. Constants may list the
// full Classic set for next-batch parsing even where no handler is claimed yet.

// ── Claimed batch 1 (prior) ──────────────────────────────────────────────────
/** Cite: ScriptMgr.h:38 SCRIPT_COMMAND_TALK = 0 */
export const SCRIPT_COMMAND_TALK = 0;
/** Cite: ScriptMgr.h:40 SCRIPT_COMMAND_EMOTE = 1 */
export const SCRIPT_COMMAND_EMOTE = 1;
/** Cite: ScriptMgr.h:43 SCRIPT_COMMAND_MOVE_TO = 3 */
export const SCRIPT_COMMAND_MOVE_TO = 3;
/** Cite: ScriptMgr.h:50 SCRIPT_COMMAND_RESPAWN_GAMEOBJECT = 9 */
export const SCRIPT_COMMAND_RESPAWN_GAMEOBJECT = 9;
/** Cite: ScriptMgr.h:51 SCRIPT_COMMAND_TEMP_SPAWN_CREATURE = 10 */
export const SCRIPT_COMMAND_TEMP_SPAWN_CREATURE = 10;
/** Cite: ScriptMgr.h:56 SCRIPT_COMMAND_ACTIVATE_OBJECT = 13 */
export const SCRIPT_COMMAND_ACTIVATE_OBJECT = 13;
/** Cite: ScriptMgr.h:58 SCRIPT_COMMAND_CAST_SPELL = 15 */
export const SCRIPT_COMMAND_CAST_SPELL = 15;
/** Cite: ScriptMgr.h:68 SCRIPT_COMMAND_SET_ACTIVEOBJECT = 21 */
export const SCRIPT_COMMAND_SET_ACTIVEOBJECT = 21;
/** Cite: ScriptMgr.h:83 SCRIPT_COMMAND_MODIFY_NPC_FLAGS = 29 */
export const SCRIPT_COMMAND_MODIFY_NPC_FLAGS = 29;
/** Cite: ScriptMgr.h:117 SCRIPT_COMMAND_DESPAWN_GO = 40 */
export const SCRIPT_COMMAND_DESPAWN_GO = 40;

// ── Prior batch (still registered) ───────────────────────────────────────────
/** Cite: ScriptMgr.h:48 SCRIPT_COMMAND_QUEST_EXPLORED = 7 */
export const SCRIPT_COMMAND_QUEST_EXPLORED = 7;
/** Cite: ScriptMgr.h:49 SCRIPT_COMMAND_KILL_CREDIT = 8 */
export const SCRIPT_COMMAND_KILL_CREDIT = 8;
/** Cite: ScriptMgr.h:64 SCRIPT_COMMAND_DESPAWN_SELF = 18 */
export const SCRIPT_COMMAND_DESPAWN_SELF = 18;
/** Cite: ScriptMgr.h:66 SCRIPT_COMMAND_MOVEMENT = 20 */
export const SCRIPT_COMMAND_MOVEMENT = 20;
/** Cite: ScriptMgr.h:70 SCRIPT_COMMAND_SET_FACTION = 22 */
export const SCRIPT_COMMAND_SET_FACTION = 22;
/** Cite: ScriptMgr.h:76 SCRIPT_COMMAND_SET_RUN = 25 */
export const SCRIPT_COMMAND_SET_RUN = 25;
/** Cite: ScriptMgr.h:79 SCRIPT_COMMAND_GO_LOCK_STATE = 27 */
export const SCRIPT_COMMAND_GO_LOCK_STATE = 27;
/** Cite: ScriptMgr.h:81 SCRIPT_COMMAND_STAND_STATE = 28 */
export const SCRIPT_COMMAND_STAND_STATE = 28;
/** Cite: ScriptMgr.h:87 SCRIPT_COMMAND_TERMINATE_SCRIPT = 31 */
export const SCRIPT_COMMAND_TERMINATE_SCRIPT = 31;
/** Cite: ScriptMgr.h:95 SCRIPT_COMMAND_TERMINATE_COND = 34 */
export const SCRIPT_COMMAND_TERMINATE_COND = 34;
/** Cite: ScriptMgr.h:100 SCRIPT_COMMAND_SET_FACING = 36 */
export const SCRIPT_COMMAND_SET_FACING = 36;

// ── Prior batch (still registered) ───────────────────────────────────────────
/** Cite: ScriptMgr.h:42 SCRIPT_COMMAND_FIELD_SET = 2 */
export const SCRIPT_COMMAND_FIELD_SET = 2;
/** Cite: ScriptMgr.h:46 SCRIPT_COMMAND_FLAG_REMOVE = 5 */
export const SCRIPT_COMMAND_FLAG_REMOVE = 5;
/** Cite: ScriptMgr.h:57 SCRIPT_COMMAND_REMOVE_AURA = 14 */
export const SCRIPT_COMMAND_REMOVE_AURA = 14;
/** Cite: ScriptMgr.h:62 SCRIPT_COMMAND_PLAY_SOUND = 16 */
export const SCRIPT_COMMAND_PLAY_SOUND = 16;
/** Cite: ScriptMgr.h:78 SCRIPT_COMMAND_ATTACK_START = 26 */
export const SCRIPT_COMMAND_ATTACK_START = 26;
/** Cite: ScriptMgr.h:92 SCRIPT_COMMAND_PAUSE_WAYPOINTS = 32 */
export const SCRIPT_COMMAND_PAUSE_WAYPOINTS = 32;
/** Cite: ScriptMgr.h:97 SCRIPT_COMMAND_SEND_AI_EVENT = 35 */
export const SCRIPT_COMMAND_SEND_AI_EVENT = 35;
/** Cite: ScriptMgr.h:109 SCRIPT_COMMAND_SEND_MAIL = 38 */
export const SCRIPT_COMMAND_SEND_MAIL = 38;
/** Cite: ScriptMgr.h:119 SCRIPT_COMMAND_SET_EQUIPMENT_SLOTS = 42 */
export const SCRIPT_COMMAND_SET_EQUIPMENT_SLOTS = 42;
/** Cite: ScriptMgr.h:138 SCRIPT_COMMAND_SET_GOSSIP_MENU = 52 */
export const SCRIPT_COMMAND_SET_GOSSIP_MENU = 52;
/** Cite: ScriptMgr.h:139 SCRIPT_COMMAND_SET_WORLDSTATE = 53 */
export const SCRIPT_COMMAND_SET_WORLDSTATE = 53;
/** Cite: ScriptMgr.h:114 SCRIPT_COMMAND_SET_HOVER = 39 */
export const SCRIPT_COMMAND_SET_HOVER = 39;

// ── Claimed this batch (QI0 frequency order) ─────────────────────────────────
/** Cite: ScriptMgr.h:72 SCRIPT_COMMAND_MORPH_TO_ENTRY_OR_MODEL = 23 */
export const SCRIPT_COMMAND_MORPH_TO_ENTRY_OR_MODEL = 23;
/** Cite: ScriptMgr.h:74 SCRIPT_COMMAND_MOUNT_TO_ENTRY_OR_MODEL = 24 */
export const SCRIPT_COMMAND_MOUNT_TO_ENTRY_OR_MODEL = 24;
/** Cite: ScriptMgr.h:126 SCRIPT_COMMAND_START_RELAY_SCRIPT = 45 */
export const SCRIPT_COMMAND_START_RELAY_SCRIPT = 45;
/** Cite: ScriptMgr.h:45 SCRIPT_COMMAND_FLAG_SET = 4 */
export const SCRIPT_COMMAND_FLAG_SET = 4;
/** Cite: ScriptMgr.h:47 SCRIPT_COMMAND_TELEPORT_TO = 6 */
export const SCRIPT_COMMAND_TELEPORT_TO = 6;
/** Cite: ScriptMgr.h:54 SCRIPT_COMMAND_OPEN_DOOR = 11 */
export const SCRIPT_COMMAND_OPEN_DOOR = 11;
/** Cite: ScriptMgr.h:55 SCRIPT_COMMAND_CLOSE_DOOR = 12 */
export const SCRIPT_COMMAND_CLOSE_DOOR = 12;
/** Cite: ScriptMgr.h:103 SCRIPT_COMMAND_MOVE_DYNAMIC = 37 */
export const SCRIPT_COMMAND_MOVE_DYNAMIC = 37;
/** Cite: ScriptMgr.h:122 SCRIPT_COMMAND_RESET_GO = 43 */
export const SCRIPT_COMMAND_RESET_GO = 43;
/** Cite: ScriptMgr.h:123 SCRIPT_COMMAND_UPDATE_TEMPLATE = 44 */
export const SCRIPT_COMMAND_UPDATE_TEMPLATE = 44;
/** Cite: ScriptMgr.h:131 SCRIPT_COMMAND_INTERRUPT_SPELL = 47 */
export const SCRIPT_COMMAND_INTERRUPT_SPELL = 47;
/** Cite: ScriptMgr.h:132 SCRIPT_COMMAND_MODIFY_UNIT_FLAGS = 48 */
export const SCRIPT_COMMAND_MODIFY_UNIT_FLAGS = 48;
/** Cite: ScriptMgr.h:63 SCRIPT_COMMAND_CREATE_ITEM = 17 */
export const SCRIPT_COMMAND_CREATE_ITEM = 17;
/** Cite: ScriptMgr.h:140 SCRIPT_COMMAND_SET_SHEATHE = 54 */
export const SCRIPT_COMMAND_SET_SHEATHE = 54;

// ── Not claimed this batch (future ports; constants only) ────────────────────

export const SCRIPT_COMMAND_PLAY_MOVIE = 19;
export const SCRIPT_COMMAND_SEND_TAXI_PATH = 30;
export const SCRIPT_COMMAND_RESPAWN = 41;
export const SCRIPT_COMMAND_CAST_CUSTOM_SPELL = 46;
export const SCRIPT_COMMAND_SET_DATA_64 = 49;
export const SCRIPT_COMMAND_ZONE_PULSE = 50;
/** Cite: ScriptMgr.h:137 SCRIPT_COMMAND_SPAWN_GROUP = 51 (datalong = subcommand) */
export const SCRIPT_COMMAND_SPAWN_GROUP = 51;
export const SCRIPT_COMMAND_SET_STRING_ID = 55;

/** Cite: ScriptMgr.h:143 SCRIPT_COMMAND_MEETINGSTONE = 200; datalong = area id */
export const SCRIPT_COMMAND_MEETINGSTONE = 200;

// OBJECT_FIELD_ENTRY — FIELD_SET / FLAG_* reject fieldId <= this. Cite: UpdateFields.h:28
// OBJECT_FIELD_ENTRY = 0x03
export const OBJECT_FIELD_ENTRY = 0x03;

// PLAY_SOUND flags bitmask (datalong2): 0x01 target-player, 0x02 distance, 0x04 map, 0x08 zone,
// 0x10 area. Cite: ScriptMgr.h:62; ScriptMgr.cpp:2190–2216.
export const PLAY_SOUND_FLAG_TARGET_PLAYER = 0x01;
export const PLAY_SOUND_FLAG_DISTANCE = 0x02;
export const PLAY_SOUND_FLAG_MAP = 0x04;
export const PLAY_SOUND_FLAG_ZONE = 0x08;
export const PLAY_SOUND_FLAG_AREA = 0x10;

// REMOVE_AURA defaultOrChargeOrStack modes (datalong2): 0 full remove, 1 RemoveAuraCharge,
// 2 RemoveAuraStack. Cite: ScriptMgr.cpp:2115–2130.
export const REMOVE_AURA_FULL = 0;
export const REMOVE_AURA_CHARGE = 1;
export const REMOVE_AURA_STACK = 2;

/** Virtual item slots for SET_EQUIPMENT_SLOTS. Cite: ScriptMgr.cpp:2894–2904 VIRTUAL_ITEM_SLOT_0/1/2 */
export const VIRTUAL_ITEM_SLOT_0 = 0;
export const VIRTUAL_ITEM_SLOT_1 = 1;
export const VIRTUAL_ITEM_SLOT_2 = 2;

// MAX_TEXT_ID — dataint..dataint4 for TALK / EMOTE / CAST_SPELL random pools. Cite: ScriptMgr.h:146
// `#define MAX_TEXT_ID 4`.
export const MAX_TEXT_ID = 4;

/** Cite: ScriptMgr.h:148–157 ScriptInfoDataFlags. */
export const SCRIPT_FLAG_BUDDY_AS_TARGET = 0x001;
export const SCRIPT_FLAG_REVERSE_DIRECTION = 0x002;
export const SCRIPT_FLAG_SOURCE_TARGETS_SELF = 0x004;
export const SCRIPT_FLAG_COMMAND_ADDITIONAL = 0x008;
export const SCRIPT_FLAG_BUDDY_BY_GUID = 0x010;
export const SCRIPT_FLAG_BUDDY_IS_PET = 0x020;
export const SCRIPT_FLAG_BUDDY_IS_DESPAWNED = 0x040;
export const SCRIPT_FLAG_BUDDY_BY_POOL = 0x080;
export const SCRIPT_FLAG_BUDDY_BY_SPAWN_GROUP = 0x100;
export const SCRIPT_FLAG_ALL_ELIGIBLE_BUDDIES = 0x200;
export const SCRIPT_FLAG_BUDDY_BY_GO = 0x400;
export const SCRIPT_FLAG_BUDDY_BY_STRING_ID = 0x800;

// GO types rejected by SCRIPT_COMMAND_RESPAWN_GAMEOBJECT. Cite: ScriptMgr.cpp:2008–2011; SharedDefines.h
// GAMEOBJECT_TYPE_DOOR=0, FISHINGNODE=17.
export const GAMEOBJECT_TYPE_DOOR = 0;
/** Cite: GameObject.h:61 GAMEOBJECT_TYPE_BUTTON = 1 (OPEN_DOOR / RESET_GO) */
export const GAMEOBJECT_TYPE_BUTTON = 1;
export const GAMEOBJECT_TYPE_FISHINGNODE = 17;

// GOState for doors/buttons (OPEN_DOOR / RESET_GO). Cite: GameObject.h:559–564 GO_STATE_ACTIVE=0, READY=1,
// ACTIVE_ALTERNATIVE=2
export const GO_STATE_ACTIVE = 0;
export const GO_STATE_READY = 1;
export const GO_STATE_ACTIVE_ALTERNATIVE = 2;

// OPEN_DOOR / CLOSE_DOOR minimum reset delay (seconds). Cite: ScriptMgr.cpp:2057 time_to_reset = resetDelay
// < 15 ? 15 : resetDelay
export const DOOR_MIN_RESET_DELAY = 15;

// UNIT_FIELD_FLAGS update-field index (Classic). Cite: UpdateFields.h:100 UNIT_FIELD_FLAGS = 0x28 +
// OBJECT_END; OBJECT_END=0x06 → 0x2E
export const UNIT_FIELD_FLAGS = 0x2e;

// CurrentSpellTypes for INTERRUPT_SPELL. Cite: Unit.h:797–804 CURRENT_MELEE=0 … CURRENT_CHANNELED=3;
// CURRENT_MAX_SPELL=4
export const CURRENT_MELEE_SPELL = 0;
export const CURRENT_GENERIC_SPELL = 1;
export const CURRENT_AUTOREPEAT_SPELL = 2;
export const CURRENT_CHANNELED_SPELL = 3;
export const CURRENT_MAX_SPELL = 4;

// MODIFY_UNIT_FLAGS change_flag modes — same body as MODIFY_NPC_FLAGS. Cite: ScriptMgr.cpp:2975–2988 0
// remove / 1 add / 2 toggle
export const UNIT_FLAG_CHANGE_REMOVE = 0;
export const UNIT_FLAG_CHANGE_ADD = 1;
export const UNIT_FLAG_CHANGE_TOGGLE = 2;

/** SCRIPT_COMMAND_SPAWN_GROUP subcommands (datalong). Cite: ScriptMgr.cpp:3013–3246; load 833–907. */
export const SPAWN_GROUP_CMD_SWITCH_SHAPE = 100;
export const SPAWN_GROUP_CMD_SET_SPREAD = 101;
export const SPAWN_GROUP_CMD_SET_OPTIONS = 102;
export const SPAWN_GROUP_CMD_CREATE_FORMATION = 150;
export const SPAWN_GROUP_CMD_REMOVE_FORMATION = 151;

/** SpawnGroupFormationType. Cite: SpawnGroupDefines.h:128–138 */
export const SPAWN_GROUP_FORMATION_TYPE_RANDOM = 0;
export const SPAWN_GROUP_FORMATION_TYPE_SINGLE_FILE = 1;
export const SPAWN_GROUP_FORMATION_TYPE_SIDE_BY_SIDE = 2;
export const SPAWN_GROUP_FORMATION_TYPE_LIKE_GEESE = 3;
export const SPAWN_GROUP_FORMATION_TYPE_FANNED_OUT_BEHIND = 4;
export const SPAWN_GROUP_FORMATION_TYPE_FANNED_OUT_IN_FRONT = 5;
export const SPAWN_GROUP_FORMATION_TYPE_CIRCLE_THE_LEADER = 6;
export const SPAWN_GROUP_FORMATION_TYPE_COUNT = 7;

/** Cite: ScriptMgr.cpp:3213 case 101 — SetSpread when x <= 15 */
export const SPAWN_GROUP_FORMATION_SPREAD_MAX = 15;

// Temp spawn type when despawnDelay is non-zero vs zero. Cite: ScriptMgr.cpp:2041
// TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN / TEMPSPAWN_DEAD_DESPAWN. Enum values: Object.h TempSpawnType.
export const TEMPSPAWN_DEAD_DESPAWN = 1; // Object.h:44
export const TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN = 8; // Object.h:50

// MODIFY_NPC_FLAGS change_flag modes: 0 RemoveFlag, 1 SetFlag, 2 toggle — the .cpp BODY, since
// the header comment at ScriptMgr.h:85 says the opposite. Cite: ScriptMgr.cpp:2519–2532.
export const NPC_FLAG_CHANGE_REMOVE = 0;
export const NPC_FLAG_CHANGE_ADD = 1;
export const NPC_FLAG_CHANGE_TOGGLE = 2;

/** MovementGeneratorType (DB-usable + FALL). Cite: MotionMaster.h:51–57,72 */
export const IDLE_MOTION_TYPE = 0;
export const RANDOM_MOTION_TYPE = 1;
export const WAYPOINT_MOTION_TYPE = 2;
export const PATH_MOTION_TYPE = 3;
export const LINEAR_WP_MOTION_TYPE = 4;
export const MAX_DB_MOTION_TYPE = 5;
export const FALL_MOTION_TYPE = 18;

// GO_FLAG bits used by SCRIPT_COMMAND_GO_LOCK_STATE. Cite: SharedDefines.h:555 GO_FLAG_LOCKED=0x2, :558
// GO_FLAG_NO_INTERACT=0x10
export const GO_FLAG_LOCKED = 0x00000002;
export const GO_FLAG_NO_INTERACT = 0x00000010;

// lockState bitfield for GO_LOCK_STATE: 0x01 lock, 0x02 unlock, 0x04 nonInteract, 0x08 Interact.
// Cite: ScriptMgr.cpp:2485–2501.
export const GO_LOCK_STATE_LOCK = 0x01;
export const GO_LOCK_STATE_UNLOCK = 0x02;
export const GO_LOCK_STATE_NON_INTERACT = 0x04;
export const GO_LOCK_STATE_INTERACT = 0x08;

/** UNIT_STAND_STATE values (Classic). Cite: Unit.h:97–109 UNIT_STAND_STATE_STAND=0 … KNEEL=8; MAX=10 */
export const UNIT_STAND_STATE_STAND = 0;
export const UNIT_STAND_STATE_KNEEL = 8;
export const MAX_UNIT_STAND_STATE = 10;

// SheathState — UNIT_FIELD_BYTES_2 offset 0. Cite: Unit.h:132–136 SHEATH_STATE_UNARMED=0, MELEE=1, RANGED=2
export const SHEATH_STATE_UNARMED = 0;
export const SHEATH_STATE_MELEE = 1;
export const SHEATH_STATE_RANGED = 2;
