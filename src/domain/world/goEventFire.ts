// Fire-on-use dbscripts for a goober or chest eventId. That id is NEVER a calendar game_event gate —
// it fires at Use. Quest-credit opcodes are 7 QUEST_EXPLORED and 8 KILL_CREDIT.

import type { DbScriptRow } from '../../data/schema.ts';
import { applySpawnGroupIntents } from '../creature/creatureGroups.ts';
import { executeDbScripts } from '../quests/interpreter/dbscript/vm.ts';
import { runBakedCommand51 } from '../quests/interpreter/dbscript/hooks.ts';
import {
  SCRIPT_COMMAND_QUEST_EXPLORED,
  SCRIPT_COMMAND_KILL_CREDIT,
} from '../quests/interpreter/dbscript/opcodes.ts';
import {
  createEmptyWorld,
  type DbScriptContext,
  type DbScriptRunResult,
} from '../quests/interpreter/dbscript/types.ts';

/** Explore quest ids from a VM run (world bag + intents). */
export function collectExploreQuestIds(vm: DbScriptRunResult): number[] {
  const out: number[] = [];
  for (const credit of vm.world.exploreCredits) {
    if (!credit.failed && credit.questId > 0) out.push(credit.questId);
  }
  for (const intent of vm.intents) {
    if (intent.kind === 'quest_explored' && !intent.failed && intent.questId > 0) {
      if (!out.includes(intent.questId)) out.push(intent.questId);
    }
  }
  return out;
}

// TERMINATE_COND failQuest ids (world bag + intents that actually terminated). Cite:
// ScriptMgr.cpp:2719–2734; Player.cpp:12730–12761.
export function collectFailedQuestIds(vm: {
  world: { failedQuests: ReadonlyArray<number> };
  intents: ReadonlyArray<{ kind: string; failQuest?: number; terminated?: boolean }>;
}): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const id of vm.world.failedQuests) {
    const q = id | 0;
    if (q > 0 && !seen.has(q)) {
      seen.add(q);
      out.push(q);
    }
  }
  for (const intent of vm.intents) {
    // Registered terminate_cond rows are not FailQuest until terminateResult is true.
    if (intent.kind !== 'terminate_cond' || intent.terminated !== true) continue;
    const q = (intent.failQuest ?? 0) | 0;
    if (q > 0 && !seen.has(q)) {
      seen.add(q);
      out.push(q);
    }
  }
  return out;
}

/** Creature entries from SCRIPT_COMMAND_KILL_CREDIT (world bag + intents). */
export function collectKillCreditEntries(vm: {
  world: { killCredits: ReadonlyArray<{ creatureEntry: number }> };
  intents: ReadonlyArray<{ kind: string; creatureEntry?: number }>;
}): number[] {
  const out: number[] = [];
  for (const c of vm.world.killCredits) {
    if (c.creatureEntry > 0 && !out.includes(c.creatureEntry)) out.push(c.creatureEntry);
  }
  for (const intent of vm.intents) {
    const entry = intent.kind === 'kill_credit' ? (intent.creatureEntry ?? 0) : 0;
    if (entry > 0 && !out.includes(entry)) out.push(entry);
  }
  return out;
}

/** Opcodes that produce quest-log credit this session can apply. */
export const QUEST_CREDIT_EVENT_COMMANDS = new Set<number>([
  SCRIPT_COMMAND_QUEST_EXPLORED, // 7
  SCRIPT_COMMAND_KILL_CREDIT, // 8
]);

// Per-event disposition for opcodes beyond quest credit that need the full VM. Populated from the
// actual command set: none of the 22 class events uses 7 or 8, and handlers exist for most.
export const EVENT_OPCODE_DISPOSITION =
  'EXECUTION-RUNSHEET-3 SESSION 16 - non-quest-credit dbscript opcodes (world spawn/talk/emote/faction) on fire-on-use eventId; quest-credit opcodes (7/8) are applied when present';

export interface FireGoEventResult {
  eventId: number;
  /** Rows that were fed to the VM (may be empty when bake lacks the stream). */
  rowCount: number;
  /** Quest ids that received explore credit (command 7, failed=false). */
  exploreQuestIds: number[];
  /** Creature entries from SCRIPT_COMMAND_KILL_CREDIT (command 8). */
  killCreditEntries: number[];
  /** TERMINATE_COND failQuest ids. Cite: ScriptMgr.cpp:2719–2734. */
  failedQuestIds: number[];
  /** Commands present in the rows (for disposition / diagnostics). */
  commands: number[];
  /** True when any command is outside QUEST_CREDIT_EVENT_COMMANDS. */
  hasNonCreditCommands: boolean;
  /** VM result when rows were non-empty. */
  vm?: DbScriptRunResult;
  disposition: string;
}

// Run dbscripts_on_event rows for `eventId` after a successful GO Use. Does not consult game_event calendar
// state.
export function fireGoEventScripts(
  eventId: number,
  rows: readonly DbScriptRow[] | undefined,
  opts?: {
    goEntry?: number;
    lookupGameObjectByGuid?: (goGuid: number) => import('../quests/interpreter/dbscript/types.ts').ScriptActor | null;
    evaluateCondition?: DbScriptContext['evaluateCondition'];
  },
): FireGoEventResult {
  const list = rows ?? [];
  const commands = [...new Set(list.map((r) => r.command | 0))].sort((a, b) => a - b);
  const hasNonCreditCommands = commands.some((c) => !QUEST_CREDIT_EVENT_COMMANDS.has(c));
  const exploreQuestIds: number[] = [];
  const killCreditEntries: number[] = [];

  if (!eventId || list.length === 0) {
    return {
      eventId,
      rowCount: 0,
      exploreQuestIds,
      killCreditEntries,
      failedQuestIds: [],
      commands,
      hasNonCreditCommands,
      disposition: EVENT_OPCODE_DISPOSITION,
    };
  }

  const world = createEmptyWorld(
    { kind: 'player' },
    {
      kind: 'gameobject',
      entry: opts?.goEntry,
      spawned: true,
      alive: true,
    },
  );

  const vm = executeDbScripts([...list], {
    world,
    table: 'dbscripts_on_event',
    phase: 'event',
    lookupGameObjectByGuid: opts?.lookupGameObjectByGuid,
    evaluateCondition: opts?.evaluateCondition,
  });

  exploreQuestIds.push(...collectExploreQuestIds(vm));
  killCreditEntries.push(...collectKillCreditEntries(vm));
  const failedQuestIds = collectFailedQuestIds(vm);

  // START_RELAY → dbscripts_on_relay command 51. Cite: ScriptMgr.cpp:2947 ScriptsStart.
  for (const intent of vm.intents) {
    if (intent.kind !== 'start_relay_script' || !intent.chosenId) continue;
    const extra = runBakedCommand51('relay', intent.chosenId, { world: vm.world });
    for (const step of extra.steps) vm.steps.push(step);
    for (const i of extra.intents) vm.intents.push(i);
  }
  const spawnGroupApplied = applySpawnGroupIntents(vm.intents);

  // TEMP_SPAWN_CREATURE is host-applied (game/tempSpawnCreature.ts) — not residual SESSION 16.
  const tempSpawnCount = vm.world.tempSpawns?.length ?? 0;
  const disposition =
    spawnGroupApplied > 0
      ? `SPAWN_GROUP applied (${spawnGroupApplied} formation op(s)); residual non-formation opcodes stay SESSION 16`
      : tempSpawnCount > 0
        ? `TEMP_SPAWN_CREATURE applied (${tempSpawnCount} summon(s)); residual non-spawn opcodes stay SESSION 16`
        : EVENT_OPCODE_DISPOSITION;

  return {
    eventId,
    rowCount: list.length,
    exploreQuestIds,
    killCreditEntries,
    failedQuestIds,
    commands,
    hasNonCreditCommands,
    vm,
    disposition,
  };
}

// dbscripts_on_go_template_use after a successful GO Use. Cite: GameObject.cpp:1424–1426
// ScriptsStart(SCRIPT_TYPE_GAMEOBJECT_TEMPLATE, GetEntry(), …).
export function fireGoTemplateUseScripts(
  goEntry: number,
  rows: readonly DbScriptRow[] | undefined,
  opts?: {
    evaluateCondition?: DbScriptContext['evaluateCondition'];
  },
): FireGoEventResult {
  const list = rows ?? [];
  const commands = [...new Set(list.map((r) => r.command | 0))].sort((a, b) => a - b);
  const hasNonCreditCommands = commands.some((c) => !QUEST_CREDIT_EVENT_COMMANDS.has(c));
  if (!goEntry || list.length === 0) {
    return {
      eventId: 0,
      rowCount: 0,
      exploreQuestIds: [],
      killCreditEntries: [],
      failedQuestIds: [],
      commands,
      hasNonCreditCommands,
      disposition: EVENT_OPCODE_DISPOSITION,
    };
  }

  const vm = executeDbScripts([...list], {
    world: createEmptyWorld(
      { kind: 'player' },
      { kind: 'gameobject', entry: goEntry, spawned: true, alive: true },
    ),
    table: 'dbscripts_on_go_template_use',
    phase: 'go_use',
    evaluateCondition: opts?.evaluateCondition,
  });

  return {
    eventId: 0,
    rowCount: list.length,
    exploreQuestIds: collectExploreQuestIds(vm),
    killCreditEntries: collectKillCreditEntries(vm),
    failedQuestIds: collectFailedQuestIds(vm),
    commands,
    hasNonCreditCommands,
    vm,
    disposition: EVENT_OPCODE_DISPOSITION,
  };
}
