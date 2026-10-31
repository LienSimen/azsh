// QI2 / QI5 — the pure quest interpreter: special flags, objective updaters and CanCompleteQuest.
// Live completion routes here when rawObjectives exist. Cite: QuestDef.h; ObjectMgr.cpp LoadQuests.

export {
  isQuestInterpreterEnabled,
  shouldUseQuestInterpreter,
  statusFromQuestState,
  exploredForInterpreter,
  type LiveInterpreterOpts,
} from './live.ts';

export {
  QUEST_SPECIAL_FLAG_REPEATABLE,
  QUEST_SPECIAL_FLAG_EXPLORATION_OR_EVENT,
  QUEST_SPECIAL_FLAG_DELIVER,
  QUEST_SPECIAL_FLAG_SPEAKTO,
  QUEST_SPECIAL_FLAG_KILL_OR_CAST,
  QUEST_SPECIAL_FLAG_TIMED,
  QUEST_SPECIAL_FLAG_DB_ALLOWED,
  QUEST_OBJECTIVES_COUNT,
  QUEST_FLAGS_AUTO_REWARDED,
  QUEST_FLAGS_SHARABLE,
  computeSpecialFlags,
  hasSpecialFlag,
  isAutoComplete,
  hasQuestFlag,
  type SpecialFlagQuestInput,
  type RawObjectives,
} from './flags.ts';

export {
  type InterpreterQuestStatus,
  type InterpreterQuestStatusCode,
  type InterpreterLog,
  type QuestOf,
  emptySlotCounts,
  createIncompleteStatus,
  cloneStatus,
  emptyInterpreterLog,
  cloneLog,
} from './types.ts';

export { canCompleteQuest, type CanCompleteOpts } from './canComplete.ts';

export {
  adjustQuestReqItemCount,
  areaExploredOrEventHappens,
  itemAddedQuestCheck,
  killedMonsterCredit,
  killedMonster,
  castedCreatureOrGO,
  talkedToCreature,
  gameObjectActivated,
  type UpdaterResult,
} from './updaters.ts';

export {
  claimQuest,
  isClaimedByQi2,
  type Qi2Claim,
  type Qi2ClaimReason,
} from './claim.ts';

export {
  type OracleScenario,
  type DiffMismatch,
  statusFromScenario,
  questStateFromScenario,
  inventoryFromScenario,
  diffScenario,
  diffViaUpdaters,
  buildParityScenarios,
} from './diff.ts';

// QI4 DBScript opcode VM + scriptdev2 registry (docs/archive/QUEST-INTERPRETER.md §7 QI4).
export {
  OPCODE_HANDLERS,
  QUEST_SCRIPT_REGISTRY,
  executeDbScripts,
  executeDbScriptRow,
  runQuestAcceptScripts,
  runQuestTurnInScripts,
  collectQuestStartRows,
  collectQuestEndRows,
  resolveQuestScript,
  isQuestScriptRegistered,
  createEmptyWorld,
  SCRIPT_COMMAND_TALK,
  SCRIPT_COMMAND_EMOTE,
  SCRIPT_COMMAND_MOVE_TO,
  SCRIPT_COMMAND_QUEST_EXPLORED,
  SCRIPT_COMMAND_KILL_CREDIT,
  SCRIPT_COMMAND_RESPAWN_GAMEOBJECT,
  SCRIPT_COMMAND_TEMP_SPAWN_CREATURE,
  SCRIPT_COMMAND_ACTIVATE_OBJECT,
  SCRIPT_COMMAND_CAST_SPELL,
  SCRIPT_COMMAND_CREATE_ITEM,
  SCRIPT_COMMAND_DESPAWN_SELF,
  SCRIPT_COMMAND_MOVEMENT,
  SCRIPT_COMMAND_SET_ACTIVEOBJECT,
  SCRIPT_COMMAND_SET_FACTION,
  SCRIPT_COMMAND_SET_RUN,
  SCRIPT_COMMAND_GO_LOCK_STATE,
  SCRIPT_COMMAND_STAND_STATE,
  SCRIPT_COMMAND_MODIFY_NPC_FLAGS,
  SCRIPT_COMMAND_TERMINATE_SCRIPT,
  SCRIPT_COMMAND_TERMINATE_COND,
  SCRIPT_COMMAND_SET_FACING,
  SCRIPT_COMMAND_DESPAWN_GO,
  SCRIPT_COMMAND_SPAWN_GROUP,
  handleSpawnGroup,
  runBakedCommand51,
} from './dbscript/index.ts';
