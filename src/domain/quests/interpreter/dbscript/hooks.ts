// QI4 accept and turn-in script hooks: resolve rawScripts plus dbScripts, run the VM and merge the
// scriptdev2 registry entries. Pure — game.acceptQuest wires in later. Cite: Player.cpp AcceptQuest.

import type { DbScriptRow, QuestDef } from '../../../../data/schema.ts';
import { applySpawnGroupIntents } from '../../../creature/creatureGroups.ts';
import {
  NPC_CORK_GIZELTON,
  QUEST_BODYGUARD_TO_HIRE,
  QUEST_GIZELTON_CARAVAN,
} from '../../../scriptdev/desolace.ts';
import { executeDbScripts } from './vm.ts';
import { resolveQuestScript, type QuestScriptHook } from './registry.ts';
import type { DbScriptContext, DbScriptRunResult, ScriptWorldState } from './types.ts';
import { createEmptyWorld } from './types.ts';
import { SCRIPT_COMMAND_SPAWN_GROUP } from './opcodes.ts';

/** Baked dbscripts_on_* streams — command 51 lives on creatureMovement + relay. */
type DbScriptStreams = {
  relay?: Record<string, DbScriptRow[]>;
  creatureMovement?: Record<string, DbScriptRow[]>;
};
/**
 * Attached at playReady from the same world-data load that feeds `ds.dbScript*()` — the table is
 * 960 KB and this was the last static import holding it in the eagerly-parsed boot graph
 * (src/dev/smoke/bootEagerBudget.mjs names this file and instanceObjects.ts). Empty before the
 * attach, exactly as every other world table is; command 51 only ever runs deep in play.
 */
let bakedStreams: DbScriptStreams = {};

export function attachDbScriptStreams(streams: DbScriptStreams | null | undefined): void {
  bakedStreams = streams ?? {};
}

/** Cite: baked dbScripts.relay 1162501 command 51 Cork Gizelton Create Formation. */
const RELAY_CORK_GIZELTON = 1162501;

/** Bundle slice with keyed dbscript streams (QI1 Run H). */
export interface DbScriptsBundle {
  questStart?: Record<string, DbScriptRow[]>;
  questEnd?: Record<string, DbScriptRow[]>;
}

// Collect start-script rows for a quest. Prefer quest.rawScripts.start; fall back to
// dbScripts.questStart[startScript|entry].
export function collectQuestStartRows(
  quest: QuestDef,
  dbScripts?: DbScriptsBundle | null,
): DbScriptRow[] {
  if (quest.rawScripts?.start?.length) return [...quest.rawScripts.start];
  const id = ((quest.startScript ?? 0) | 0) || (quest.entry | 0);
  if (!id || !dbScripts?.questStart) return [];
  const rows = dbScripts.questStart[String(id)];
  return rows ? [...rows] : [];
}

// Collect end/complete-script rows for a quest. Prefer quest.rawScripts.end; fall back to
// dbScripts.questEnd[completeScript|entry].
export function collectQuestEndRows(
  quest: QuestDef,
  dbScripts?: DbScriptsBundle | null,
): DbScriptRow[] {
  if (quest.rawScripts?.end?.length) return [...quest.rawScripts.end];
  const id = ((quest.completeScript ?? 0) | 0) || (quest.entry | 0);
  if (!id || !dbScripts?.questEnd) return [];
  const rows = dbScripts.questEnd[String(id)];
  return rows ? [...rows] : [];
}

export interface QuestScriptHookOpts {
  world?: ScriptWorldState;
  dbScripts?: DbScriptsBundle | null;
  randIndex?: DbScriptContext['randIndex'];
  resolveStringTemplate?: DbScriptContext['resolveStringTemplate'];
  lookupGameObjectByGuid?: DbScriptContext['lookupGameObjectByGuid'];
  resolveCreatureDisplayId?: DbScriptContext['resolveCreatureDisplayId'];
  resolveRelayFromTemplate?: DbScriptContext['resolveRelayFromTemplate'];
  evaluateCondition?: DbScriptContext['evaluateCondition'];
  findNearestCreatureAlive?: DbScriptContext['findNearestCreatureAlive'];
  findNearestGameObject?: DbScriptContext['findNearestGameObject'];
  findPoolCreatureAlive?: DbScriptContext['findPoolCreatureAlive'];
  buddyFound?: DbScriptContext['buddyFound'];
  isCreatureBuddy?: DbScriptContext['isCreatureBuddy'];
  // When true (default), also run QUEST_SCRIPT_REGISTRY entry for the quest (scriptdev2 residual) and
  // append its intents.
  includeRegistry?: boolean;
}

// Run dbscripts_on_quest_start (+ registry accept) for a quest. Call after a successful accept so SrcItem /
// same-zone talk already applied.
export function runQuestAcceptScripts(
  quest: QuestDef,
  opts: QuestScriptHookOpts = {},
): DbScriptRunResult {
  const rows = collectQuestStartRows(quest, opts.dbScripts);
  const world = opts.world ?? createEmptyWorld(
    { kind: 'creature', entry: quest.starterCreatureEntries?.[0], npcFlags: 2, active: false, alive: true },
    { kind: 'player' },
  );
  const result = executeDbScripts(rows, {
    world,
    questId: quest.entry,
    phase: 'start',
    table: 'dbscripts_on_quest_start',
    randIndex: opts.randIndex,
    resolveStringTemplate: opts.resolveStringTemplate,
    lookupGameObjectByGuid: opts.lookupGameObjectByGuid,
    resolveCreatureDisplayId: opts.resolveCreatureDisplayId,
    resolveRelayFromTemplate: opts.resolveRelayFromTemplate,
    evaluateCondition: opts.evaluateCondition,
    findNearestCreatureAlive: opts.findNearestCreatureAlive,
    findNearestGameObject: opts.findNearestGameObject,
    findPoolCreatureAlive: opts.findPoolCreatureAlive,
    buddyFound: opts.buddyFound,
    isCreatureBuddy: opts.isCreatureBuddy,
  });

  if (opts.includeRegistry !== false) {
    mergeRegistry(result, quest.entry, 'accept');
  }
  if (quest.entry === QUEST_BODYGUARD_TO_HIRE || quest.entry === QUEST_GIZELTON_CARAVAN) {
    appendCommand51(result, 'relay', RELAY_CORK_GIZELTON, {
      source: {
        kind: 'creature',
        entry: NPC_CORK_GIZELTON,
        npcFlags: 2,
        active: false,
        alive: true,
        hasCreatureGroup: true,
      },
    });
  }
  applySpawnGroupIntents(result.intents);
  return result;
}

// Run dbscripts_on_quest_end (+ registry reward) for a quest. Call after turn-in rewards so CompleteScript
// side-effects land on the ender.
export function runQuestTurnInScripts(
  quest: QuestDef,
  opts: QuestScriptHookOpts = {},
): DbScriptRunResult {
  const rows = collectQuestEndRows(quest, opts.dbScripts);
  const world = opts.world ?? createEmptyWorld(
    { kind: 'creature', entry: quest.enderCreatureEntries?.[0], npcFlags: 2, active: false, alive: true },
    { kind: 'player' },
  );
  const result = executeDbScripts(rows, {
    world,
    questId: quest.entry,
    phase: 'end',
    table: 'dbscripts_on_quest_end',
    randIndex: opts.randIndex,
    resolveStringTemplate: opts.resolveStringTemplate,
    lookupGameObjectByGuid: opts.lookupGameObjectByGuid,
    resolveCreatureDisplayId: opts.resolveCreatureDisplayId,
    resolveRelayFromTemplate: opts.resolveRelayFromTemplate,
    evaluateCondition: opts.evaluateCondition,
    findNearestCreatureAlive: opts.findNearestCreatureAlive,
    findNearestGameObject: opts.findNearestGameObject,
    findPoolCreatureAlive: opts.findPoolCreatureAlive,
    buddyFound: opts.buddyFound,
    isCreatureBuddy: opts.isCreatureBuddy,
  });

  if (opts.includeRegistry !== false) {
    mergeRegistry(result, quest.entry, 'reward');
  }
  applySpawnGroupIntents(result.intents);
  return result;
}

// Run baked command-51 rows from creatureMovement or relay through the VM. Cite: ScriptMgr.cpp:3011–3252;
// WaypointMovementGenerator.cpp:186 source=creature.
export function runBakedCommand51(
  stream: 'relay' | 'creatureMovement',
  id: number,
  opts: {
    world?: ScriptWorldState;
    source?: ScriptWorldState['source'];
    target?: ScriptWorldState['target'];
  } = {},
): DbScriptRunResult {
  const world = opts.world ?? createEmptyWorld(
    opts.source ?? { kind: 'creature', entry: 0, npcFlags: 0, active: false, alive: true },
    opts.target ?? opts.source ?? { kind: 'creature', entry: 0, npcFlags: 0, active: false, alive: true },
  );
  if (opts.source) world.source = opts.source;
  if (opts.target !== undefined) world.target = opts.target;
  else if (opts.source) world.target = opts.source;
  const rows = (bakedStreams[stream]?.[String(id)] ?? []).filter(
    (r) => (r.command | 0) === SCRIPT_COMMAND_SPAWN_GROUP,
  );
  const result = executeDbScripts(rows, { world, table: `dbscripts_on_${stream === 'relay' ? 'relay' : 'creature_movement'}` });
  applySpawnGroupIntents(result.intents);
  return result;
}

function appendCommand51(
  result: DbScriptRunResult,
  stream: 'relay' | 'creatureMovement',
  id: number,
  opts: { source: ScriptWorldState['source'] },
): void {
  const extra = runBakedCommand51(stream, id, { source: opts.source });
  for (const step of extra.steps) result.steps.push(step);
  for (const intent of extra.intents) result.intents.push(intent);
  for (const op of extra.world.spawnGroupOps) result.world.spawnGroupOps.push(op);
  if (extra.hasUnknown) result.hasUnknown = true;
}

// Merge scriptdev2 registry intents and apply the same world side-effects the opcode handlers
// would, so accept hooks leave a usable end-state for hosts and fixtures.
function mergeRegistry(
  result: DbScriptRunResult,
  questId: number,
  phase: QuestScriptHook,
): void {
  const entry = resolveQuestScript(questId);
  if (!entry?.run) return;
  const extra = entry.run(phase, questId);
  const world = result.world;
  for (const i of extra) {
    result.intents.push(i);
    switch (i.kind) {
      case 'set_faction':
        world.source.factionId = i.factionId;
        world.source.factionFlags = i.flags;
        break;
      case 'talk':
        world.talks.push(i.textId);
        break;
      case 'send_ai_event':
        world.aiEvents.push({
          eventType: i.eventType,
          radius: i.radius,
          value: i.value,
          mode: i.mode,
        });
        break;
      case 'modify_unit_flags':
        world.source.unitFlags = i.resultFlags;
        world.unitFlagChanges.push({
          flag: i.flag,
          changeFlag: i.changeFlag,
          mode: i.mode,
          resultFlags: i.resultFlags,
        });
        break;
      case 'modify_npc_flags':
        world.source.npcFlags = i.resultFlags;
        break;
      case 'kill_credit':
        world.killCredits.push({ creatureEntry: i.creatureEntry });
        break;
      case 'set_instance_data':
        world.instanceData[i.type] = i.data;
        break;
      case 'stand_state':
        world.source.standState = i.standState;
        break;
      case 'set_sheath':
        world.source.sheath = i.sheath;
        break;
      case 'set_hover':
        world.source.hovering = i.hover;
        world.hoverChanges.push({ hover: i.hover });
        break;
      case 'set_active_object':
        // Cite: hinterlands.cpp:153 SetActiveObjectState(true) on OOX accept.
        world.source.active = i.active;
        break;
      case 'attack_start':
        // Cite: stormwind_city.cpp:77 bartleby AI()->AttackStart(player).
        world.attackStarts.push({
          attackerEntry: world.source.entry,
          targetKind: world.target?.kind ?? 'none',
        });
        break;
      case 'temp_spawn_creature':
        // Cite: stormwind_city.cpp:427–439 dashel SummonCreature thugs on accept.
        world.tempSpawns.push({
          creatureEntry: i.creatureEntry,
          x: i.x,
          y: i.y,
          z: i.z,
          o: i.o,
          despawnDelay: i.despawnDelay,
          pathId: i.pathId,
          setRun: i.setRun,
          summonActive: i.summonActive,
          spawnDataEntry: i.spawnDataEntry,
          spawnType: i.spawnType,
        });
        break;
      case 'cast_spell':
        // Cite: wetlands.cpp:215–216 Slim CastSpell(SPELL_STEALTH, TRIGGERED_OLD_TRIGGERED).
        world.casts.push({
          spellId: i.spellId,
          castFlags: i.castFlags,
          sourceIsGo: i.sourceIsGo,
        });
        break;
      case 'set_worldstate':
        // Cite: war_effort.cpp:190 AddWarEffortProgress → SendUpdateWorldState;
        //       ScriptMgr.cpp:3264–3267 SET_WORLDSTATE absolute write.
        world.worldStates[i.worldstateId] = i.value;
        break;
      case 'create_item':
        // Cite: ScriptMgr.cpp:2220–2235 StoreNewItemInInventorySlot / DestroyItemCount.
        world.createdItems.push({
          itemEntry: i.itemEntry,
          amount: i.amount,
          destroyed: i.destroyed,
        });
        break;
      case 'spawn_group':
        world.spawnGroupOps.push({
          subcommand: i.subcommand,
          groupId: i.groupId,
          formationType: i.formationType,
          spread: i.spread,
          options: i.options,
          mode: i.mode,
          applied: i.applied,
        });
        break;
      default:
        break;
    }
  }
}
