// QI4 DBScript VM — run ordered dbscripts_on_* rows through OPCODE_HANDLERS. Pure and deterministic,
// with no engine mutation beyond ctx.world. Cite: ScriptMgr.cpp HandleScriptStep.

import type { DbScriptRow } from '../../../../data/schema.ts';
import { getOpcodeHandler } from './handlers.ts';
import type {
  DbScriptContext,
  DbScriptIntent,
  DbScriptRunResult,
  DbScriptStepResult,
  ScriptActor,
  ScriptWorldState,
} from './types.ts';
import { createEmptyWorld } from './types.ts';

// Default TERMINATE_SCRIPT buddy finder, which sees world.tempSpawns from this same run. A
// searchDist of 0 is unlimited. Cite: ScriptMgr.cpp:2589–2593, :2618–2619; quest 68.
function defaultFindNearestCreatureAlive(
  world: ScriptWorldState,
): NonNullable<DbScriptContext['findNearestCreatureAlive']> {
  return (entry, searchDist, searcher) => {
    const want = entry | 0;
    if (!(want > 0)) return null;
    const inRange = (buddy: ScriptActor): boolean => {
      // Cite: ScriptMgr.cpp:2618–2619 pool path — !searchDist skips distance.
      if (!searchDist) return true;
      // Zone model: missing coords count as in-range (do not invent yards).
      if (
        searcher.x == null || searcher.y == null || searcher.z == null
        || buddy.x == null || buddy.y == null || buddy.z == null
      ) {
        return true;
      }
      const dx = searcher.x - buddy.x;
      const dy = searcher.y - buddy.y;
      const dz = searcher.z - buddy.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz) <= searchDist;
    };
    for (const actor of [world.source, world.target]) {
      if (
        actor
        && (actor.kind === 'creature' || actor.kind === 'unit')
        && ((actor.entry ?? 0) | 0) === want
        && actor.alive !== false
        && inRange(actor)
      ) {
        return actor;
      }
    }
    for (const sp of world.tempSpawns) {
      if (((sp.creatureEntry ?? 0) | 0) !== want) continue;
      const buddy: ScriptActor = {
        kind: 'creature',
        entry: sp.creatureEntry,
        x: sp.x,
        y: sp.y,
        z: sp.z,
        o: sp.o,
        alive: true,
        spawned: true,
      };
      if (inRange(buddy)) return buddy;
    }
    return null;
  };
}

// Execute a single script row. Unknown commands emit `unknown_command` (smoke gate: claimed must not hit
// this).
export function executeDbScriptRow(row: DbScriptRow, ctx: DbScriptContext): DbScriptStepResult {
  const command = row.command | 0;
  // The row's own condition gates the row, whatever the command is. Without it Scorn (14693) rose
  // from Bloodmage Thalnos all year, on a row whose condition_id 6089 is "game event 89 active".
  // Cite: ScriptMgr.cpp:1755 ExecuteDbscriptCommand — condition_id checked before the switch.
  const conditionId = (row.conditionId ?? 0) | 0;
  if (conditionId > 0 && ctx.evaluateCondition
    && !ctx.evaluateCondition(conditionId, ctx.world.target, ctx.world.source)) {
    return {
      row,
      command,
      intents: [{ kind: 'skip', reason: `condition ${conditionId} not satisfied`, cite: 'ScriptMgr.cpp:1755' }],
      unknown: false,
      skipped: true,
    };
  }
  const handler = getOpcodeHandler(command);
  if (!handler) {
    const intent: DbScriptIntent = {
      kind: 'unknown_command',
      command,
      cite: 'QI4 OPCODE_HANDLERS miss',
    };
    return {
      row,
      command,
      intents: [intent],
      unknown: true,
      skipped: false,
    };
  }

  // Default buddy finder sees tempSpawns (Stalvan 68). Cite: ScriptMgr.cpp:2589–2593.
  const fullCtx: DbScriptContext = {
    ...ctx,
    findNearestCreatureAlive:
      ctx.findNearestCreatureAlive ?? defaultFindNearestCreatureAlive(ctx.world),
  };
  const result = handler(row, fullCtx);
  const skipped = result.intents.every((i) => i.kind === 'skip');
  return {
    row,
    command,
    intents: result.intents,
    unknown: false,
    skipped,
    terminateScript: result.terminateScript === true,
  };
}

// Run a full ordered script stream, already sorted at bake. Delays are not slept — intents come out
// in order — and TERMINATE_SCRIPT or TERMINATE_COND stops the stream. Cite: ScriptMgr.cpp.
export function executeDbScripts(
  rows: readonly DbScriptRow[],
  ctx?: Partial<DbScriptContext> & { world?: ScriptWorldState },
): DbScriptRunResult {
  const world = ctx?.world ?? createEmptyWorld();
  const fullCtx: DbScriptContext = {
    world,
    randIndex: ctx?.randIndex,
    resolveStringTemplate: ctx?.resolveStringTemplate,
    lookupGameObjectByGuid: ctx?.lookupGameObjectByGuid,
    resolveCreatureDisplayId: ctx?.resolveCreatureDisplayId,
    resolveRelayFromTemplate: ctx?.resolveRelayFromTemplate,
    evaluateCondition: ctx?.evaluateCondition,
    findNearestCreatureAlive:
      ctx?.findNearestCreatureAlive ?? defaultFindNearestCreatureAlive(world),
    findNearestGameObject: ctx?.findNearestGameObject,
    findPoolCreatureAlive: ctx?.findPoolCreatureAlive,
    buddyFound: ctx?.buddyFound,
    isCreatureBuddy: ctx?.isCreatureBuddy,
    table: ctx?.table,
    questId: ctx?.questId,
    phase: ctx?.phase,
  };

  const steps: DbScriptStepResult[] = [];
  const intents: DbScriptIntent[] = [];
  let hasUnknown = false;
  let terminated = false;

  // Stable order: delay, priority, command (bake already sorts; re-sort for safety).
  const ordered = [...rows].sort(
    (a, b) =>
      (a.delay | 0) - (b.delay | 0) ||
      (((a.priority ?? 0) | 0) - ((b.priority ?? 0) | 0)) ||
      (a.command | 0) - (b.command | 0),
  );

  for (const row of ordered) {
    const step = executeDbScriptRow(row, fullCtx);
    steps.push(step);
    for (const i of step.intents) intents.push(i);
    if (step.unknown) hasUnknown = true;
    if (step.terminateScript) {
      terminated = true;
      break;
    }
  }

  return { steps, intents, world, hasUnknown, terminated };
}
