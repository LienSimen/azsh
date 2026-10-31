// QI4 DBScript VM types — pure intents plus the world-object model. Handlers emit typed intents and
// never mutate a live engine; hosts apply them. Cite: ScriptMgr.cpp ExecuteDbscriptCommand.

import type { DbScriptRow } from '../../../../data/schema.ts';

/** World-object kind for source/target resolution. */
export type ScriptObjectKind = 'none' | 'player' | 'creature' | 'gameobject' | 'unit' | 'item';

// Minimal actor the VM can reason about (zone-granular; coords optional). Mirrors the Unit / GameObject /
// Player surfaces used by CMaNGOS handlers.
export interface ScriptActor {
  kind: ScriptObjectKind;
  /** Creature / GO template entry when known. */
  entry?: number;
  /** DB guid for GO respawn-by-guid (datalong). */
  dbGuid?: number;
  /** UNIT_NPC_FLAGS bitmask for creatures. */
  npcFlags?: number;
  /** Creature default gossip menu id. Cite: Creature.h:814 SetDefaultGossipMenuId */
  gossipMenuId?: number;
  /** Active-object state (SetActiveObjectState). */
  active?: boolean;
  /** GO type (SharedDefines.h GAMEOBJECT_TYPE_*). */
  goType?: number;
  /** Currently spawned / visible. */
  spawned?: boolean;
  /** Spawned-by-default static GO (IsSpawnedByDefault). */
  spawnedByDefault?: boolean;
  /** Position (when script supplies / tests seed). */
  x?: number;
  y?: number;
  z?: number;
  o?: number;
  /** Bounding radius for MOVE_TO proximity; default 0. */
  boundingRadius?: number;
  /** Creature formation group present (GetCreatureGroup). */
  hasCreatureGroup?: boolean;
  /** Alive (QUEST_EXPLORED / summons / TERMINATE_SCRIPT). */
  alive?: boolean;
  /** UNIT_STAND_STATE (STAND_STATE opcode). Cite: Unit.h:97–109 */
  standState?: number;
  /** SheathState (SET_SHEATHE). Cite: Unit.h:132–136; ScriptMgr.cpp:3271–3277 */
  sheath?: number;
  /** True when walking (not running). Cite: SET_RUN IsWalking/SetWalk. */
  walking?: boolean;
  /** MOVEFLAG_HOVER from SetHover. Cite: Unit.cpp:12428–12438; Unit.h:1788 IsHovering. */
  hovering?: boolean;
  /** Temporary faction template id (0 = cleared / default). */
  factionId?: number;
  /** Temporary-faction flags from SET_FACTION datalong2. */
  factionFlags?: number;
  /** GAMEOBJECT_FLAGS bitmask (GO_LOCK_STATE). */
  goFlags?: number;
  /** In combat — MOVEMENT skips. Cite: ScriptMgr.cpp:2266–2269 */
  inCombat?: boolean;
  /** Formation slot: only master may change movement. Cite: ScriptMgr.cpp:2284–2290 */
  isFormationMaster?: boolean;
  /** In a formation slot (any rank). */
  inFormation?: boolean;
  /** spawn_group id when the actor is in a CreatureGroup. */
  formationGroupId?: number;
  /** Current SpawnGroupFormationType. Cite: SpawnGroupDefines.h:128–138 */
  formationType?: number;
  /** Formation spread yards. Cite: SpawnGroupDefines.h:161 Spread */
  formationSpread?: number;
  /** SpawGroupFormationOptions bitmask. Cite: SpawnGroupDefines.h:148–153 */
  formationOptions?: number;
  /** Respawn / home orientation for SET_FACING reset. */
  respawnO?: number;
  respawnX?: number;
  respawnY?: number;
  respawnZ?: number;
  /** Motion-master reset orientation when top() provides it. */
  motionResetO?: number;
  /** Default wander distance for RANDOM_MOTION without datalong2. */
  wanderDistance?: number;
  /** Current motion generator type (WAYPOINT check for TERMINATE pause). */
  movementType?: number;
  // Update-field bag for FIELD_SET / FLAG_SET / FLAG_REMOVE. Cite: ScriptMgr.cpp:1815–1828, 1890–1902
  // SetUInt32Value / RemoveFlag
  fields?: Record<number, number>;
  /** Max field index (GetValuesCount). Cite: ScriptMgr.cpp:1821 */
  valuesCount?: number;
  /** Active auras (spell id + stacks/charges) for REMOVE_AURA. Cite: ScriptMgr.cpp:2109–2131 */
  auras?: Array<{ spellId: number; stacks: number; charges: number; casterGuid?: string }>;
  /** Mounted state — CanAttackNow fails when mounted. Cite: Relations.cpp:438–440 */
  mounted?: boolean;
  /** UNIT_FIELD_MOUNTDISPLAYID. Cite: Unit.cpp:7741–7756 Mount; ScriptMgr.cpp:2409–2437 */
  mountDisplayId?: number;
  /** Mount creature_template entry when mounted by entry (MountEntry). */
  mountCreatureId?: number;
  // When false, CanAttackNow fails (hostile check). Default true in zone model. Cite: Relations.cpp:446
  // CanAttack
  canAttackTarget?: boolean;
  /** Waypoint pause state for PAUSE_WAYPOINTS. Cite: ScriptMgr.cpp:2684–2692 */
  waypointsPaused?: boolean;
  /** Virtual equipment item entries [main, off, ranged]. Cite: ScriptMgr.cpp:2881–2905 SetVirtualItem */
  virtualItems?: [number, number, number];
  /** Equipment template id for resetDefault path. Cite: ScriptMgr.cpp:2888–2891 */
  equipmentTemplateId?: number;
  /** Template virtual items restored on resetDefault. */
  defaultVirtualItems?: [number, number, number];
  /** Current display id (MORPH_TO_ENTRY_OR_MODEL SetDisplayId / DeMorph). Cite: ScriptMgr.cpp:2390–2407 */
  displayId?: number;
  /** Native display id restored by DeMorph. */
  nativeDisplayId?: number;
  /** UNIT_FIELD_FLAGS bitmask for MODIFY_UNIT_FLAGS. Cite: ScriptMgr.cpp:2970–2992 */
  unitFlags?: number;
  // Active current-spell slots by CurrentSpellTypes index (INTERRUPT_SPELL). Cite: Unit.h:797–804;
  // ScriptMgr.cpp:2960–2968
  currentSpells?: Array<{ spellType: number; spellId: number }>;
  // GOState for doors/buttons (OPEN_DOOR / CLOSE_DOOR / RESET_GO). Cite: GameObject.h:559–564
  // GO_STATE_READY=1 closed
  goState?: number;
  /** Map id for player TELEPORT_TO destination tracking. */
  mapId?: number;
  /** LFG area id from SCRIPT_COMMAND_MEETINGSTONE. Cite: LFGMgr.cpp:38–90 SetLFGAreaId */
  lfgAreaId?: number;
}

/** Mutable world snapshot handlers update for end-state proof. */
export interface ScriptWorldState {
  source: ScriptActor;
  target: ScriptActor | null;
  /** Temporary creature summons from TEMP_SPAWN_CREATURE. */
  tempSpawns: TempSpawnRecord[];
  /** Displayed talk text ids (broadcast_text). */
  talks: number[];
  /** Emote ids performed. */
  emotes: number[];
  /** Spell ids cast. */
  casts: Array<{ spellId: number; castFlags: number; sourceIsGo: boolean }>;
  /** GO activations / custom anims. */
  goActivations: Array<{ customAnim: boolean; animId: number }>;
  /** GO respawns requested. */
  goRespawns: Array<{ goGuid: number; despawnDelay: number; mode: 'respawn' | 'refresh' }>;
  /** GO despawns. */
  goDespawns: Array<{ despawnDelay: number; dbGuid?: number; entry?: number }>;
  /** QUEST_EXPLORED credits / fails. */
  exploreCredits: Array<{ questId: number; failed: boolean }>;
  /** TERMINATE_COND fail-quest ids applied to the player (group members omitted zone-model). */
  failedQuests: number[];
  /** Creature ForcedDespawn from DESPAWN_SELF. */
  selfDespawns: Array<{ despawnDelay: number; entry?: number; dbGuid?: number }>;
  /** Movement generator changes. */
  movements: Array<{
    movementType: number;
    wanderORpathId: number;
    timerOrPassTarget: number;
    forcedMovement: number;
    movementFlags: number;
  }>;
  /** ATTACK_START — creature AI AttackStart. Cite: ScriptMgr.cpp:2458–2476 */
  attackStarts: Array<{ attackerEntry?: number; targetKind: string }>;
  /** SEND_AI_EVENT deliveries. Cite: ScriptMgr.cpp:2738–2755 */
  aiEvents: Array<{
    eventType: number;
    radius: number;
    value: number;
    mode: 'around' | 'to_target' | 'receive_on_source' | 'receive_on_target';
  }>;
  /** PAUSE_WAYPOINTS toggles. Cite: ScriptMgr.cpp:2684–2692 */
  waypointPauses: Array<{ doPause: boolean }>;
  /** SET_WORLDSTATE map variables. Cite: ScriptMgr.cpp:3264–3267 */
  worldStates: Record<number, number>;
  /** SEND_MAIL deliveries. Cite: ScriptMgr.cpp:2828–2843 */
  mails: Array<{
    mailTemplateId: number;
    altSender: number;
    money: number;
    deliverDelay: number;
  }>;
  /** FIELD_SET applications. Cite: ScriptMgr.cpp:1815–1828 */
  fieldSets: Array<{ fieldId: number; fieldValue: number }>;
  /** FLAG_REMOVE applications. Cite: ScriptMgr.cpp:1890–1902 */
  flagRemoves: Array<{ fieldId: number; fieldValue: number; resultValue: number }>;
  /** REMOVE_AURA applications. Cite: ScriptMgr.cpp:2109–2131 */
  auraRemoves: Array<{
    spellId: number;
    mode: 'full' | 'by_caster' | 'charge' | 'stack';
  }>;
  /** PLAY_SOUND / music. Cite: ScriptMgr.cpp:2182–2218 */
  sounds: Array<{
    soundId: number;
    flags: number;
    playParameter: number;
    isMusic: boolean;
    mode: 'direct' | 'distance' | 'map' | 'music' | 'zone' | 'area';
  }>;
  /** SET_EQUIPMENT_SLOTS. Cite: ScriptMgr.cpp:2881–2905 */
  equipmentChanges: Array<{
    resetDefault: boolean;
    slots: [number, number, number];
  }>;
  /** FLAG_SET applications. Cite: ScriptMgr.cpp:1876–1889 */
  flagSets: Array<{ fieldId: number; fieldValue: number; resultValue: number }>;
  /** TELEPORT_TO. Cite: ScriptMgr.cpp:1904–1911 */
  teleports: Array<{ mapId: number; x: number; y: number; z: number; o: number }>;
  /** OPEN_DOOR / CLOSE_DOOR. Cite: ScriptMgr.cpp:2055–2094 */
  doorOpens: Array<{
    goGuid: number;
    resetDelay: number;
    alternate: boolean;
    opened: boolean;
    closed: boolean;
    alsoButton: boolean;
  }>;
  /** MORPH_TO_ENTRY_OR_MODEL. Cite: ScriptMgr.cpp:2390–2407 */
  morphs: Array<{
    mode: 'demorph' | 'model' | 'entry';
    creatureOrModelEntry: number;
    displayId: number;
  }>;
  /** MOUNT_TO_ENTRY_OR_MODEL. Cite: ScriptMgr.cpp:2409–2437 */
  mounts: Array<{
    mode: 'unmount' | 'model' | 'entry';
    creatureOrModelEntry: number;
    creatureId: number;
    modelId: number;
    speedChange: boolean;
  }>;
  /** MOVE_DYNAMIC. Cite: ScriptMgr.cpp:2778–2826 */
  dynamicMoves: Array<{
    x: number;
    y: number;
    z: number;
    maxDist: number;
    minDist: number;
    fixedDist: number;
    forcedMovement: number;
    relayId: number;
  }>;
  /** RESET_GO. Cite: ScriptMgr.cpp:2907–2923 */
  goResets: Array<{ goType: number; reset: boolean }>;
  /** UPDATE_TEMPLATE. Cite: ScriptMgr.cpp:2925–2936 */
  templateUpdates: Array<{ oldEntry: number; newTemplate: number; changed: boolean }>;
  /** START_RELAY_SCRIPT. Cite: ScriptMgr.cpp:2938–2948 */
  relayScripts: Array<{ relayId: number; templateId: number; chosenId: number }>;
  /** INTERRUPT_SPELL. Cite: ScriptMgr.cpp:2960–2968 */
  spellInterrupts: Array<{ currentSpellType: number; interruptedSpellId: number }>;
  /** MODIFY_UNIT_FLAGS. Cite: ScriptMgr.cpp:2970–2992 */
  unitFlagChanges: Array<{
    flag: number;
    changeFlag: number;
    mode: 'remove' | 'add' | 'toggle';
    resultFlags: number;
  }>;
  /** SET_HOVER. Cite: ScriptMgr.cpp:2847–2864 SetHover(fly) on Creature pSource. */
  hoverChanges: Array<{ hover: boolean }>;
  // KilledMonsterCredit applications (cmd 8 + scriptdev2 residual / host). Cite: ScriptMgr.cpp:1947–1978;
  // Player.cpp:13469–13520.
  killCredits: Array<{ creatureEntry: number; isGroupCredit?: boolean }>;
  // Instance ScriptedInstance::SetData(type, data) bag (zone-granular). Cite: sc_instance.h EncounterState;
  // blackwing_lair.cpp SetData TYPE_QUEST_SCEPTER.
  instanceData: Record<number, number>;
  /** CREATE_ITEM grant/destroy. Cite: ScriptMgr.cpp:2220–2235 */
  createdItems: CreatedItemRecord[];
  /** SCRIPT_COMMAND_MEETINGSTONE AddToQueue. Cite: ScriptMgr.cpp:3287–3307 */
  meetingStoneQueues: Array<{ areaId: number }>;
  /** SCRIPT_COMMAND_SPAWN_GROUP formation ops. Cite: ScriptMgr.cpp:3011–3252 */
  spawnGroupOps: SpawnGroupOpRecord[];
}

/** SCRIPT_COMMAND_CREATE_ITEM (17) — datalong item, datalong2 amount. */
export interface CreatedItemRecord {
  itemEntry: number;
  amount: number;
  /** SCRIPT_FLAG_COMMAND_ADDITIONAL → DestroyItemCount. */
  destroyed: boolean;
}

export type SpawnGroupOpMode =
  | 'create'
  | 'remove'
  | 'switch_shape'
  | 'set_spread'
  | 'set_options';

export interface SpawnGroupOpRecord {
  subcommand: number;
  groupId: number;
  formationType: number;
  spread: number;
  options: number;
  mode: SpawnGroupOpMode;
  applied: boolean;
}

export interface TempSpawnRecord {
  creatureEntry: number;
  x: number;
  y: number;
  z: number;
  o: number;
  despawnDelay: number;
  pathId: number;
  setRun: boolean;
  summonActive: boolean;
  spawnDataEntry: number;
  /** TEMPSPAWN_* type chosen by handler. */
  spawnType: number;
}

/** Typed side-effect intents — host-consumable. */
export type DbScriptIntent =
  | {
      kind: 'talk';
      textId: number;
      stringTemplateId: number;
      cite: string;
    }
  | {
      kind: 'emote';
      emoteId: number;
      cite: string;
    }
  | {
      kind: 'move_to';
      mode: 'point' | 'charge' | 'teleport' | 'facing' | 'home' | 'group_home';
      x: number;
      y: number;
      z: number;
      o: number;
      travelSpeed: number;
      relayId: number;
      forcedMovement: number;
      cite: string;
    }
  | {
      kind: 'modify_npc_flags';
      flag: number;
      changeFlag: number;
      mode: 'remove' | 'add' | 'toggle';
      resultFlags: number;
      cite: string;
    }
  | {
      kind: 'temp_spawn_creature';
      creatureEntry: number;
      x: number;
      y: number;
      z: number;
      o: number;
      despawnDelay: number;
      pathId: number;
      setRun: boolean;
      summonActive: boolean;
      spawnDataEntry: number;
      spawnType: number;
      cite: string;
    }
  | {
      kind: 'set_active_object';
      active: boolean;
      cite: string;
    }
  | {
      kind: 'respawn_gameobject';
      goGuid: number;
      despawnDelay: number;
      mode: 'respawn' | 'refresh' | 'already_spawned' | 'rejected_type';
      goType?: number;
      cite: string;
    }
  | {
      kind: 'cast_spell';
      spellId: number;
      castFlags: number;
      sourceIsGo: boolean;
      targetCleared: boolean;
      cite: string;
    }
  | {
      kind: 'activate_object';
      customAnim: boolean;
      animId: number;
      cite: string;
    }
  | {
      kind: 'despawn_go';
      despawnDelay: number;
      cite: string;
    }
  | {
      kind: 'quest_explored';
      questId: number;
      distance: number;
      failed: boolean;
      cite: string;
    }
  | {
      kind: 'despawn_self';
      despawnDelay: number;
      cite: string;
    }
  | {
      kind: 'movement';
      movementType: number;
      wanderORpathId: number;
      timerOrPassTarget: number;
      forcedMovement: number;
      movementFlags: number;
      skippedCombat?: boolean;
      skippedFormation?: boolean;
      cite: string;
    }
  | {
      kind: 'set_faction';
      factionId: number;
      flags: number;
      cleared: boolean;
      cite: string;
    }
  | {
      kind: 'set_run';
      run: boolean;
      walking: boolean;
      changed: boolean;
      cite: string;
    }
  | {
      kind: 'set_hover';
      hover: boolean;
      cite: string;
    }
  | {
      kind: 'go_lock_state';
      lockState: number;
      goFlags: number;
      cite: string;
    }
  | {
      kind: 'stand_state';
      standState: number;
      cite: string;
    }
  | {
      kind: 'set_sheath';
      sheath: number;
      cite: string;
    }
  | {
      kind: 'terminate_script';
      terminated: boolean;
      terminationBuddyFound: boolean;
      npcOrGOEntry: number;
      poolId: number;
      searchDist: number;
      waypointPauseMs: number;
      cite: string;
    }
  | {
      kind: 'terminate_cond';
      terminated: boolean;
      conditionId: number;
      failQuest: number;
      conditionSatisfied: boolean;
      inverted: boolean;
      cite: string;
    }
  | {
      kind: 'set_facing';
      resetFacing: boolean;
      orientation: number;
      cite: string;
    }
  | {
      kind: 'attack_start';
      canAttack: boolean;
      cite: string;
    }
  | {
      kind: 'send_ai_event';
      eventType: number;
      radius: number;
      value: number;
      mode: 'around' | 'to_target' | 'receive_on_source' | 'receive_on_target';
      cite: string;
    }
  | {
      kind: 'set_equipment_slots';
      resetDefault: boolean;
      mainHand: number;
      offHand: number;
      ranged: number;
      cite: string;
    }
  | {
      kind: 'pause_waypoints';
      doPause: boolean;
      cite: string;
    }
  | {
      kind: 'set_worldstate';
      worldstateId: number;
      value: number;
      cite: string;
    }
  | {
      kind: 'set_gossip_menu';
      menuId: number;
      cite: string;
    }
  | {
      kind: 'send_mail';
      mailTemplateId: number;
      altSender: number;
      money: number;
      deliverDelay: number;
      cite: string;
    }
  | {
      kind: 'field_set';
      fieldId: number;
      fieldValue: number;
      cite: string;
    }
  | {
      kind: 'flag_remove';
      fieldId: number;
      fieldValue: number;
      resultValue: number;
      cite: string;
    }
  | {
      kind: 'remove_aura';
      spellId: number;
      mode: 'full' | 'by_caster' | 'charge' | 'stack';
      cite: string;
    }
  | {
      kind: 'play_sound';
      soundId: number;
      flags: number;
      playParameter: number;
      isMusic: boolean;
      mode: 'direct' | 'distance' | 'map' | 'music' | 'zone' | 'area';
      cite: string;
    }
  | {
      kind: 'flag_set';
      fieldId: number;
      fieldValue: number;
      resultValue: number;
      cite: string;
    }
  | {
      kind: 'teleport_to';
      mapId: number;
      x: number;
      y: number;
      z: number;
      o: number;
      cite: string;
    }
  | {
      kind: 'open_door';
      goGuid: number;
      resetDelay: number;
      alternate: boolean;
      opened: boolean;
      closed: boolean;
      alsoButton: boolean;
      cite: string;
    }
  | {
      kind: 'morph';
      mode: 'demorph' | 'model' | 'entry';
      creatureOrModelEntry: number;
      displayId: number;
      cite: string;
    }
  | {
      kind: 'mount';
      mode: 'unmount' | 'model' | 'entry';
      creatureOrModelEntry: number;
      creatureId: number;
      modelId: number;
      speedChange: boolean;
      cite: string;
    }
  | {
      kind: 'move_dynamic';
      x: number;
      y: number;
      z: number;
      maxDist: number;
      minDist: number;
      fixedDist: number;
      forcedMovement: number;
      relayId: number;
      cite: string;
    }
  | {
      kind: 'reset_go';
      goType: number;
      reset: boolean;
      cite: string;
    }
  | {
      kind: 'update_template';
      oldEntry: number;
      newTemplate: number;
      changed: boolean;
      cite: string;
    }
  | {
      kind: 'start_relay_script';
      relayId: number;
      templateId: number;
      chosenId: number;
      cite: string;
    }
  | {
      kind: 'interrupt_spell';
      currentSpellType: number;
      interruptedSpellId: number;
      cite: string;
    }
  | {
      kind: 'modify_unit_flags';
      flag: number;
      changeFlag: number;
      mode: 'remove' | 'add' | 'toggle';
      resultFlags: number;
      cite: string;
    }
  | {
      /** sLFGMgr.AddToQueue(player, areaId). Cite: ScriptMgr.cpp:3287–3307; LFGMgr.cpp:38–90 */
      kind: 'meetingstone';
      areaId: number;
      cite: string;
    }
  | {
      /** Player::KilledMonsterCredit — ScriptMgr.cpp:1947–1978; Player.cpp:13469–13520. */
      kind: 'kill_credit';
      creatureEntry: number;
      isGroupCredit?: boolean;
      cite: string;
    }
  | {
      // ScriptedInstance::SetData(type, data) — a scriptdev2 residual.
      // Cite: boss_vaelastrasz.cpp:364 SetData(TYPE_QUEST_SCEPTER, IN_PROGRESS); sc_instance.h:12–19.
      kind: 'set_instance_data';
      type: number;
      data: number;
      cite: string;
    }
  | {
      kind: 'create_item';
      itemEntry: number;
      amount: number;
      destroyed: boolean;
      cite: string;
    }
  | {
      kind: 'spawn_group';
      subcommand: number;
      groupId: number;
      formationType: number;
      spread: number;
      options: number;
      mode: SpawnGroupOpMode;
      applied: boolean;
      cite: string;
    }
  | {
      kind: 'skip';
      reason: string;
      cite: string;
    }
  | {
      kind: 'unknown_command';
      command: number;
      cite: string;
    };

export interface HandlerResult {
  intents: DbScriptIntent[];
  // When true, terminate remaining script steps (TERMINATE_SCRIPT / TERMINATE_COND). Cite: ScriptMgr.cpp
  // return true from ExecuteDbscriptCommand stops the stream.
  terminateScript?: boolean;
}

export type OpcodeHandler = (row: DbScriptRow, ctx: DbScriptContext) => HandlerResult;

// Execution context. Pure + deterministic (no wall clock / non-deterministic RNG). Random pools
// (TALK/EMOTE/CAST_SPELL) use `randIndex(n)` — default always 0.
export interface DbScriptContext {
  world: ScriptWorldState;
  // Deterministic pick in [0, n). Default 0 (first / primary value). CMaNGOS uses urand; tests may inject a
  // fixed stream.
  randIndex?: (n: number) => number;
  // Optional string-template → text id (TALK datalong template). Cite: ScriptMgr.cpp:1771–1775
  // GetRandomScriptStringFromTemplate. Return 0 to skip (matches CMaNGOS break on 0).
  resolveStringTemplate?: (templateId: number) => number;
  // Optional GO lookup by db guid for RESPAWN_GAMEOBJECT / OPEN_DOOR. Cite: ScriptMgr.cpp:1987–1991, 2061
  // sObjectMgr.GetGOData + map->GetGameObject.
  lookupGameObjectByGuid?: (goGuid: number) => ScriptActor | null;
  // Resolve a creature_template DisplayId for the MORPH entry path. The host picks it
  // deterministically — with none set, displayId is 0. Cite: ScriptMgr.cpp:2401–2404.
  resolveCreatureDisplayId?: (creatureEntry: number) => number;
  // Pick a relay script id from dbscript_random_template for START_RELAY_SCRIPT. Return 0 to skip,
  // matching the CMaNGOS no-op. Cite: ScriptMgr.cpp:2941–2942.
  resolveRelayFromTemplate?: (templateId: number) => number;
  // Evaluate condition_id for TERMINATE_COND. Cite: ScriptMgr.cpp:2714–2717
  // sObjectMgr.IsConditionSatisfied. Default false when unset (condition not met).
  evaluateCondition?: (
    conditionId: number,
    player: ScriptActor | null,
    second: ScriptActor | null,
  ) => boolean;
  // Nearest alive creature entry within searchDist for TERMINATE_SCRIPT. Cite: ScriptMgr.cpp:2589–2593
  // NearestCreatureEntryWithLiveStateInObjectRangeCheck.
  findNearestCreatureAlive?: (
    entry: number,
    searchDist: number,
    searcher: ScriptActor,
  ) => ScriptActor | null;
  // Nearest GO entry within searchDist for TERMINATE_SCRIPT (GO buddy). Cite: ScriptMgr.cpp:2597–2601
  // NearestGameObjectEntryInObjectRangeCheck.
  findNearestGameObject?: (
    entry: number,
    searchDist: number,
    searcher: ScriptActor,
  ) => ScriptActor | null;
  // First alive creature in pool within searchDist for TERMINATE_SCRIPT. Cite: ScriptMgr.cpp:2606–2645
  // sPoolMgr.GetPoolCreatures.
  findPoolCreatureAlive?: (
    poolId: number,
    searchDist: number,
    searcher: ScriptActor,
  ) => ScriptActor | null;
  // When TERMINATE_SCRIPT has no entry/pool/guid search, CMaNGOS uses the step's pre-resolved buddyFound.
  // Cite: ScriptMgr.cpp:2650–2651.
  buddyFound?: boolean;
  // Whether the script row's buddy is a creature (default true). GO commands / SCRIPT_FLAG_BUDDY_BY_GO flip
  // this. Cite: ScriptMgr.h:549–571 IsCreatureBuddy.
  isCreatureBuddy?: boolean;
  /** Script table name for diagnostics (dbscripts_on_quest_start/end). */
  table?: string;
  /** Owning quest id when known (accept/turn-in hook). */
  questId?: number;
  /** 'start' | 'end' | other. */
  phase?: 'start' | 'end' | 'go_use' | 'event' | 'relay' | 'other';
}

export interface DbScriptStepResult {
  row: DbScriptRow;
  command: number;
  intents: DbScriptIntent[];
  unknown: boolean;
  skipped: boolean;
  /** Step requested stream termination. */
  terminateScript?: boolean;
}

export interface DbScriptRunResult {
  steps: DbScriptStepResult[];
  intents: DbScriptIntent[];
  world: ScriptWorldState;
  /** True if any step was unknown_command. */
  hasUnknown: boolean;
  terminated: boolean;
}

export function createEmptyWorld(
  source: ScriptActor = { kind: 'creature', entry: 0, npcFlags: 0, active: false, alive: true },
  target: ScriptActor | null = { kind: 'player' },
): ScriptWorldState {
  return {
    source: { ...source },
    target: target ? { ...target } : null,
    tempSpawns: [],
    talks: [],
    emotes: [],
    casts: [],
    goActivations: [],
    goRespawns: [],
    goDespawns: [],
    exploreCredits: [],
    failedQuests: [],
    selfDespawns: [],
    movements: [],
    attackStarts: [],
    aiEvents: [],
    waypointPauses: [],
    worldStates: {},
    mails: [],
    fieldSets: [],
    flagRemoves: [],
    auraRemoves: [],
    sounds: [],
    equipmentChanges: [],
    flagSets: [],
    teleports: [],
    doorOpens: [],
    morphs: [],
    mounts: [],
    dynamicMoves: [],
    goResets: [],
    templateUpdates: [],
    relayScripts: [],
    spellInterrupts: [],
    unitFlagChanges: [],
    hoverChanges: [],
    killCredits: [],
    instanceData: {},
    createdItems: [],
    meetingStoneQueues: [],
    spawnGroupOps: [],
  };
}

export function defaultRandIndex(_n: number): number {
  return 0;
}
