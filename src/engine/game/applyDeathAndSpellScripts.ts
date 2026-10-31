// Host the creature-death, spell and creature-movement dbscripts through the quest-accept stack.
// Cite: Unit.cpp:1382 SCRIPT_TYPE_CREATURE_DEATH; SpellEffects.cpp:1529-1531; :4189-4191.
import type { DbScriptRow, QuestDef } from '../../data/schema.ts';
import type { GoRuntimeState } from '../../domain/world/gameObjects.ts';
import { applyCreatedItems, type Inventory } from '../../domain/items/inventory.ts';
import {
  recordEventHappens,
  recordKill,
  type QuestLog,
} from '../../domain/quests/questlog.ts';
import {
  collectExploreQuestIds,
  collectKillCreditEntries,
} from '../../domain/world/goEventFire.ts';
import { executeDbScripts } from '../../domain/quests/interpreter/dbscript/vm.ts';
import {
  createEmptyWorld,
  type DbScriptContext,
  type ScriptActor,
} from '../../domain/quests/interpreter/dbscript/types.ts';
import { applyWorldStateWrites, ensureWorldStates } from './worldState.ts';
import {
  applyFailedQuests,
  collectFailedQuestIds,
} from './applyTerminateFromDbScript.ts';
import { applyActiveObjectFromDbScript } from './applyActiveObjectFromDbScript.ts';
import { applyEscortFromDbScript } from './applyEscortFromDbScript.ts';
import { applyHoverFromDbScript } from './applyHoverFromDbScript.ts';
import { applyDoorAndGoBags } from './applyDoorFromDbScript.ts';
import { applyTailFromDbScript } from './applyTailFromDbScript.ts';

export type DeathSpellScriptOpts = {
  questlog: QuestLog;
  inventory?: Inventory;
  itemOf?: (entry: number) => { stackable?: number } | undefined;
  bagCap?: number;
  goRuntime?: Record<string, GoRuntimeState>;
  goRuntimeKey?: (entry: number) => string;
  worldStates?: Record<number, number>;
  relayScripts?: (id: number) => readonly DbScriptRow[];
  evaluateCondition?: DbScriptContext['evaluateCondition'];
  lookupGameObjectByGuid?: DbScriptContext['lookupGameObjectByGuid'];
  questOf?: (entry: number) => QuestDef | undefined;
  log?: (msg: string) => void;
  /** Override default source actor (dead creature / caster). */
  source?: ScriptActor;
  /** Override default target actor (player / spell target). */
  target?: ScriptActor | null;
  /** Live floor / temp bodies to stamp (SET_HOVER / escort / active). */
  bodies?: Array<{ entry?: number; dbGuid?: number; guid?: number } | null | undefined> | null;
  onMail?: (rec: { mailTemplateId: number; deliverDelay: number; altSender?: number; money?: number }) => void;
  /** ChooseDisplayId for MOUNT/MORPH entry rows. Cite: ScriptMgr.cpp:2429–2433. */
  resolveCreatureDisplayId?: (creatureEntry: number) => number;
  /** Creatures a CAST_SPELL row's spell summons. Cite: SpellEffects.cpp:2729 EffectSummonWild. */
  spellSummonsOf?: (spellId: number) => readonly { creatureEntry: number; count: number }[];
};

/** One creature a script asked the world for: TEMP_SPAWN_CREATURE, or a CAST_SPELL that summons. */
export type ScriptSummon = {
  creatureEntry: number;
  count: number;
  /** Map-absolute point from the script row; absent means "where the source stands". */
  x?: number;
  y?: number;
  z?: number;
  despawnDelayMs?: number;
};

export type DeathSpellScriptResult = {
  ran: boolean;
  questlog: QuestLog;
  inventory?: Inventory;
  goRuntime?: Record<string, GoRuntimeState>;
  worldStates?: Record<number, number>;
  /** Creatures the script asked to exist. The caller owns where they land. */
  summons?: ScriptSummon[];
};

function applyHostStack(
  table: 'dbscripts_on_creature_death' | 'dbscripts_on_spell' | 'dbscripts_on_creature_movement',
  rows: readonly DbScriptRow[],
  source: ScriptActor,
  target: ScriptActor | null,
  opts: DeathSpellScriptOpts,
): DeathSpellScriptResult {
  const list = rows ?? [];
  if (!list.length) {
    return { ran: false, questlog: opts.questlog, inventory: opts.inventory, goRuntime: opts.goRuntime, worldStates: opts.worldStates };
  }

  const vm = executeDbScripts([...list], {
    world: createEmptyWorld(source, target),
    table,
    phase: 'other',
    evaluateCondition: opts.evaluateCondition,
    lookupGameObjectByGuid: opts.lookupGameObjectByGuid,
    resolveCreatureDisplayId: opts.resolveCreatureDisplayId,
  });
  // createEmptyWorld copies source; copy UNIT_FIELD_MOUNTDISPLAYID back onto the caller actor.
  // Cite: Unit.cpp:7748 Mount; ScriptMgr.cpp:2409–2437.
  if (opts.source) {
    opts.source.mounted = vm.world.source.mounted;
    opts.source.mountDisplayId = vm.world.source.mountDisplayId;
    opts.source.mountCreatureId = vm.world.source.mountCreatureId;
  }

  let questlog = opts.questlog;
  for (const qid of collectExploreQuestIds(vm)) {
    questlog = recordEventHappens(questlog, qid);
  }
  if (opts.questOf) {
    for (const entry of collectKillCreditEntries(vm)) {
      questlog = recordKill(questlog, entry, opts.questOf);
    }
  }

  let worldStates = opts.worldStates;
  if (vm.world.worldStates && Object.keys(vm.world.worldStates).length) {
    worldStates = ensureWorldStates(worldStates);
    applyWorldStateWrites(worldStates, vm.world.worldStates);
  }

  let inventory = opts.inventory;
  if (inventory != null && opts.itemOf && opts.bagCap != null) {
    inventory = applyCreatedItems(inventory, vm.world.createdItems, opts.itemOf, opts.bagCap);
  }

  // Cite: ScriptMgr.cpp:2719–2734 TERMINATE_COND failQuest.
  questlog = applyFailedQuests(questlog, collectFailedQuestIds(vm.world, vm.intents));
  // Cite: ScriptMgr.cpp:2367–2376; Object.cpp:2563–2578.
  applyActiveObjectFromDbScript(vm.world, vm.intents, {
    source: vm.world.source,
    bodies: opts.bodies,
  });
  // Cite: ScriptMgr.cpp:1829–1874 / :2439–2456 / :2684–2692 / :2757–2826 / :2237–2250.
  applyEscortFromDbScript(vm.world, vm.intents, {
    source: vm.world.source,
    bodies: opts.bodies,
  });
  // Cite: ScriptMgr.cpp:2847–2864 SetHover(fly) on Creature pSource.
  applyHoverFromDbScript(vm.world, vm.intents, {
    source: vm.world.source,
    bodies: opts.bodies,
  });

  let goRuntime = opts.goRuntime;
  if (opts.goRuntimeKey) {
    // Cite: ScriptMgr.cpp:1980–2025 / :2864–2871 / :2478–2503 / :2907–2923.
    goRuntime = applyDoorAndGoBags(vm.world, vm.intents, goRuntime, opts.goRuntimeKey, opts.log);
  }

  // Cite: ScriptMgr.cpp:3264–3267 / :2828–2843 / :2182–2218 / :1815–1911 / :2881–2992 / :2938–2948.
  worldStates = ensureWorldStates(worldStates);
  const tail = applyTailFromDbScript(vm.world, vm.intents, {
    source: vm.world.source,
    bodies: opts.bodies,
    worldStates,
    log: opts.log,
    relayScripts: opts.relayScripts,
    questlog,
    goRuntime,
    goRuntimeKey: opts.goRuntimeKey,
    evaluateCondition: opts.evaluateCondition,
    lookupGameObjectByGuid: opts.lookupGameObjectByGuid,
    onMail: opts.onMail,
  });
  if (tail.questlog) questlog = tail.questlog;
  if (tail.goRuntime) goRuntime = tail.goRuntime;

  // TEMP_SPAWN_CREATURE (10) and a CAST_SPELL (15) whose spell summons both put a creature in the
  // world; the VM only recorded the request. Cite: ScriptMgr.cpp:2027-2051; :2134-2180.
  const summons = collectScriptSummons(vm.world, opts.spellSummonsOf);

  return {
    ran: true, questlog, inventory, goRuntime, worldStates,
    ...(summons.length ? { summons } : {}),
  };
}

// Creatures one script run asked the world for. A row with no coordinate summons at the source —
// Sneed's Shredder ejects Sneed where it fell (dbscripts_on_creature_death 642 → spell 5141 → 643).
function collectScriptSummons(
  world: {
    tempSpawns: readonly {
      creatureEntry: number; x: number; y: number; z: number; despawnDelay: number;
    }[];
    casts: readonly { spellId: number }[];
  },
  spellSummonsOf?: (spellId: number) => readonly { creatureEntry: number; count: number }[],
): ScriptSummon[] {
  const out: ScriptSummon[] = [];
  for (const s of world.tempSpawns) {
    const entry = s.creatureEntry | 0;
    if (!(entry > 0)) continue;
    const placed = Number.isFinite(s.x) && Number.isFinite(s.y) && (s.x !== 0 || s.y !== 0);
    out.push({
      creatureEntry: entry,
      count: 1,
      ...(placed ? { x: s.x, y: s.y, z: s.z } : {}),
      ...(s.despawnDelay > 0 ? { despawnDelayMs: s.despawnDelay | 0 } : {}),
    });
  }
  if (spellSummonsOf) {
    for (const c of world.casts) {
      for (const o of spellSummonsOf(c.spellId | 0)) {
        const entry = o.creatureEntry | 0;
        const count = o.count | 0;
        if (entry > 0 && count > 0) out.push({ creatureEntry: entry, count });
      }
    }
  }
  return out;
}

// Run dbscripts_on_creature_death for a killed creature entry. source = dead creature, target = player.
// Empty rows → no-op.
export function runCreatureDeathScripts(
  entry: number,
  rows: readonly DbScriptRow[],
  opts: DeathSpellScriptOpts,
): DeathSpellScriptResult {
  if (!entry || !(rows?.length)) {
    return { ran: false, questlog: opts.questlog, inventory: opts.inventory, goRuntime: opts.goRuntime, worldStates: opts.worldStates };
  }
  const source = opts.source ?? {
    kind: 'creature',
    entry,
    alive: false,
    active: false,
  };
  const target = opts.target !== undefined ? opts.target : { kind: 'player' as const };
  return applyHostStack('dbscripts_on_creature_death', rows, source, target, opts);
}

// Run dbscripts_on_spell after a successful cast finish. source = caster (player for OOC player cast).
// Empty rows → no-op.
export function runSpellScripts(
  spellId: number,
  rows: readonly DbScriptRow[],
  opts: DeathSpellScriptOpts,
): DeathSpellScriptResult {
  if (!spellId || !(rows?.length)) {
    return { ran: false, questlog: opts.questlog, inventory: opts.inventory, goRuntime: opts.goRuntime, worldStates: opts.worldStates };
  }
  const source = opts.source ?? { kind: 'player' as const };
  const target = opts.target !== undefined ? opts.target : null;
  return applyHostStack('dbscripts_on_spell', rows, source, target, opts);
}

// Run dbscripts_on_creature_movement when a patroller arrives at a ScriptId waypoint. source = moving
// creature, target = player. Empty rows → no-op. Cite: WaypointMovementGenerator.cpp:183–186.
export function runCreatureMovementScripts(
  scriptId: number,
  rows: readonly DbScriptRow[],
  opts: DeathSpellScriptOpts,
): DeathSpellScriptResult {
  if (!scriptId || !(rows?.length)) {
    return { ran: false, questlog: opts.questlog, inventory: opts.inventory, goRuntime: opts.goRuntime, worldStates: opts.worldStates };
  }
  const source = opts.source ?? {
    kind: 'creature',
    entry: 0,
    alive: true,
    active: false,
  };
  const target = opts.target !== undefined ? opts.target : { kind: 'player' as const };
  return applyHostStack('dbscripts_on_creature_movement', rows, source, target, opts);
}
