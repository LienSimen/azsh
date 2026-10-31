// ScriptDev corpus host public surface (aifid SESSION 9). Pipeline: cmangos ScriptDevAI/scripts/** → IR →
// registry → host tick against combat cast machinery (S1–S8 primitives).

export type {
  ScriptDevIR,
  ScriptDevTimer,
  ScriptDevPhaseThreshold,
  ScriptDevHitCountGate,
  ScriptDevHitCountThreshold,
  ScriptDevAction,
  ScriptDevAuraScript,
  ScriptDevAuraAction,
  ScriptDevLifecycle,
  ScriptDevEncounterBinding,
  ScriptDevDoorBinding,
  ScriptDevGoUse,
  ScriptDevSpellHit,
  ScriptDevQuestRewarded,
  ScriptDevGossipHello,
  ScriptDevReceiveEmote,
  ScriptDevReceiveAiEvent,
  ScriptDevUnusedBinding,
  ScriptDevDataGate,
  ScriptDevRuntimeState,
  ScriptDevCastPlan,
  ScriptDevTargetMode,
  ScriptDevSelectOpts,
} from './types.ts';

export { INSTANCE_DATA, AI_EVENT } from './types.ts';

export {
  NEFARIAN_CLASS_CALL_ACTION,
  NEFARIAN_CLASS_CALL_REQUIRED_CLASS,
  isNefarianClassCallSpell,
  nefarianClassCallRefusesTarget,
  unitClassIs,
} from './classFilter.ts';

export {
  targetModeToTargetT,
  timerToCastEntry,
  castPlanFromScriptDev,
  registerAuraScriptsFromIr,
  clearAuraScriptRegistryForTests,
  getAuraScript,
  registeredAuraScriptSpellIds,
  possessInvSpellIds,
  isPossessInvSpell,
  planNonCharmAuraOnApply,
  type NonCharmAuraOnApplyPlan,
  armScriptDevRuntime,
  tickScriptDev,
  noteScriptDevHitCount,
  noteScriptDevAddDeath,
  notePossessLanded,
  noteJustSummonedSide,
  collectReachCastsDue,
  hasTrackedSummonSides,
  applyInstanceSetData,
  applyInstanceOnPlayerEnter,
  instanceEventForCreature,
  lifecycleActions,
  dataGatePasses,
  handleGoUse,
  handleSpellHit,
  tickDieTimer,
  handleQuestRewarded,
  resolveGossipTextId,
  handleReceiveEmote,
  handleReceiveAiEvent,
  type ScriptDevTickCtx,
  type ScriptDevTickResult,
  type ScriptDevReachCastDue,
  type InstanceHostResult,
  type InstanceEnterDoorFlags,
  type ScriptDevHookResult,
} from './host.ts';

export {
  TYPE_PROTECTORS,
  ST_PROTECTORS,
  ST_PROTECTORS_COUNT,
  ST_PROTECTORS_REMAINING_KEY,
  GO_JAMMALAN_BARRIER,
  NPC_OGOM,
  applyProtectorsSetData,
  type StProtectorsSetDataResult,
} from './sunkenTemple.ts';

export {
  TYPE_FOUR_HORSEMEN,
  NAXX_MAX_ENCOUNTER,
  NAXX_HORSEMEN_KILLED_KEY,
  NAXX_HORSEMEN_COUNT,
  GO_MILI_HORSEMEN_DOOR,
  NAXX_HORSEMEN_ENTRIES,
  applyHorsemenSetData,
  type HorsemenSetDataResult,
} from './instanceRaids.ts';

export { ITEM_ASHBRINGER } from './itemScripts.ts';

export {
  SCRIPTDEV_REGISTRY,
  scriptDevByName,
  scriptDevByCreature,
  scriptDevByGo,
  scriptDevCastPlanForEntry,
  scriptDevScheduleForEntry,
  scriptDevInstanceScripts,
  scriptDevInstanceForCreature,
  portedScriptNames,
} from './registry.ts';

export {
  LEARN_SPELL_GRANTS,
  UNLEARN_SPELL_REMOVES,
  PROFESSION_SPEC_SPELLS,
  knownProfessionSpecs,
  applyBlacksmithSpecSelect,
  applyLeatherSpecSelect,
} from './professionSpecConsumer.ts';
