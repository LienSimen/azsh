// Gossip talk: creature.gossipMenuId → condition-filtered menu → dbscripts_on_gossip → intents.
// The two dispatch sites carry OPPOSITE actors, so only menu scripts set REVERSE_DIRECTION.

import type { DbScriptRow } from '../../data/schema.ts';
import { applySpawnGroupIntents } from '../creature/creatureGroups.ts';
import { executeDbScriptRow } from './interpreter/dbscript/vm.ts';
import { createEmptyWorld } from './interpreter/dbscript/types.ts';
import type {
  DbScriptContext,
  DbScriptIntent,
  ScriptActor,
  ScriptWorldState,
} from './interpreter/dbscript/types.ts';
import {
  filterGossipOptions,
  type ConditionEval,
  type GossipMenu,
  type GossipOption,
} from './gossip.ts';

/** Cite: ScriptMgr.h:151-154. */
export const SCRIPT_FLAG_BUDDY_AS_TARGET = 0x001;
export const SCRIPT_FLAG_REVERSE_DIRECTION = 0x002;
export const SCRIPT_FLAG_SOURCE_TARGETS_SELF = 0x004;

/** dbScripts.gossip — the raw table, or `ds.gossipScripts`. */
export type GossipScriptTable =
  | Readonly<Record<string, readonly DbScriptRow[]>>
  | ((scriptId: number) => readonly DbScriptRow[]);

/** Which dispatch site hung the script, which fixes its default source/target. */
export type GossipScriptOrigin = 'menu' | 'option';

export interface GossipTalkPath {
  /** Menu that fired this — the one whose open ran it, or the one holding the picked option. */
  menuId: number;
  /** Option index picked to reach it; absent for a menu's own open script. */
  optionId?: number;
  /** Condition on the option that leads here (0 / absent = always visible). */
  conditionId?: number;
  origin: GossipScriptOrigin;
  scriptId: number;
  /** Option picks between the root menu and this script. */
  depth: number;
  /** Menu chain walked, for feed and probe lines. */
  via: string;
  rows: readonly DbScriptRow[];
}

export interface GossipTalk {
  menuId: number;
  textId?: number;
  /** Condition-filtered options of the ROOT menu. */
  options: GossipOption[];
  /** Runnable scripts reachable through visible options; root-open script first, then by depth. */
  paths: GossipTalkPath[];
  /** Menu ids referenced by a visible option but absent from the bake. */
  missingMenus: number[];
}

const rowsOf = (scripts: GossipScriptTable, scriptId: number): readonly DbScriptRow[] =>
  (typeof scripts === 'function' ? scripts(scriptId) : scripts[String(scriptId)]) ?? [];

// Walk a creature's gossip menu graph under the current conditions and collect every script it can run.
// Breadth-first so a one-click talk can take the shallowest path.
export function resolveGossipTalk(args: {
  menus: ReadonlyMap<number, GossipMenu>;
  scripts: GossipScriptTable;
  menuId: number;
  conditionEval?: ConditionEval;
  /** Option picks to follow. 0 = the root menu only. Default 3 covers every DM North chain. */
  maxDepth?: number;
}): GossipTalk {
  const { menus, scripts, menuId } = args;
  const condEval = args.conditionEval ?? (() => true);
  const maxDepth = args.maxDepth ?? 3;

  const root = menus.get(menuId);
  const paths: GossipTalkPath[] = [];
  const missingMenus: number[] = [];
  if (!root) return { menuId, options: [], paths, missingMenus };

  const options = filterGossipOptions(root.options, condEval);

  // A menu's script_id fires when the menu OPENS, so the root's runs on hello with no pick.
  if (root.scriptId) {
    const rows = rowsOf(scripts, root.scriptId);
    if (rows.length) {
      paths.push({
        menuId, origin: 'menu', scriptId: root.scriptId, depth: 0,
        via: `menu ${menuId} open`, rows,
      });
    }
  }

  const seenMenus = new Set<number>([menuId]);
  let frontier: Array<{ menu: GossipMenu; opts: GossipOption[]; depth: number; via: string }> = [
    { menu: root, opts: options, depth: 0, via: `menu ${menuId}` },
  ];
  while (frontier.length) {
    const next: typeof frontier = [];
    for (const node of frontier) {
      if (node.depth >= maxDepth) continue;
      for (const opt of node.opts) {
        const via = `${node.via} → opt ${opt.id}`;
        const depth = node.depth + 1;
        // The option's own action_script_id runs on the pick.
        if (opt.action?.scriptId) {
          const rows = rowsOf(scripts, opt.action.scriptId);
          if (rows.length) {
            paths.push({
              menuId: node.menu.menuId, optionId: opt.id, conditionId: opt.conditionId,
              origin: 'option', scriptId: opt.action.scriptId, depth, via, rows,
            });
          }
        }
        const subId = opt.action?.menuId ?? 0;
        if (subId <= 0) continue;
        const sub = menus.get(subId);
        if (!sub) {
          if (!missingMenus.includes(subId)) missingMenus.push(subId);
          continue;
        }
        // Opening the sub-menu runs ITS script_id — where the three guard buffs live.
        if (sub.scriptId) {
          const rows = rowsOf(scripts, sub.scriptId);
          if (rows.length) {
            paths.push({
              menuId: subId, optionId: opt.id, conditionId: opt.conditionId,
              origin: 'menu', scriptId: sub.scriptId, depth,
              via: `${via} → menu ${subId} open`, rows,
            });
          }
        }
        if (seenMenus.has(subId)) continue;
        seenMenus.add(subId);
        next.push({
          menu: sub, opts: filterGossipOptions(sub.options, condEval), depth,
          via: `${via} → menu ${subId}`,
        });
      }
    }
    frontier = next;
  }

  paths.sort((a, b) => a.depth - b.depth || (a.optionId ?? -1) - (b.optionId ?? -1));
  return { menuId, textId: root.textId, options, paths, missingMenus };
}

/** Ids a menu's gating conditions actually ask about, so a caller builds no wider a snapshot. */
export interface GossipConditionInputs {
  auras: number[];
  items: number[];
  spells: number[];
  quests: number[];
  skills: number[];
  /** Condition types in the closure with no implementation — report, never guess. */
  types: number[];
}

/** Cite: Conditions.h ConditionType — the value1 slot's meaning per type. */
const INPUT_SLOT: Readonly<Record<number, keyof Omit<GossipConditionInputs, 'types'>>> = {
  1: 'auras', 2: 'items', 7: 'skills', 8: 'quests', 9: 'quests', 17: 'spells', 22: 'quests',
  23: 'items', 3: 'items',
};

// Walk a menu graph's condition ids (closing over AND/OR/NOT) and report which player facts they read. Lets
// the caller assemble exactly the snapshot the data needs instead of an authored one.
export function conditionInputsFor(
  menus: ReadonlyMap<number, GossipMenu>,
  rootMenuId: number,
  conditions: ReadonlyMap<number, { type: number; value1?: number; value2?: number; value3?: number; value4?: number }>,
  maxDepth = 3,
): GossipConditionInputs {
  const out: GossipConditionInputs = { auras: [], items: [], spells: [], quests: [], skills: [], types: [] };
  const condIds = new Set<number>();
  const seenMenus = new Set<number>();
  const walk = (menuId: number, depth: number) => {
    if (depth > maxDepth || seenMenus.has(menuId)) return;
    seenMenus.add(menuId);
    const m = menus.get(menuId);
    if (!m) return;
    for (const o of m.options) {
      if (o.conditionId) condIds.add(o.conditionId);
      const sub = o.action?.menuId ?? 0;
      if (sub > 0) walk(sub, depth + 1);
    }
  };
  walk(rootMenuId, 0);

  const seenCond = new Set<number>();
  const stack = [...condIds];
  while (stack.length) {
    const id = stack.pop()!;
    if (seenCond.has(id)) continue;
    seenCond.add(id);
    const c = conditions.get(id);
    if (!c) continue;
    if (c.type < 0) {
      for (const v of [c.value1, c.value2, c.value3, c.value4]) if (v) stack.push(v);
      continue;
    }
    const slot = INPUT_SLOT[c.type];
    if (!slot) {
      if (!out.types.includes(c.type)) out.types.push(c.type);
      continue;
    }
    const v = c.value1 ?? 0;
    if (v && !out[slot].includes(v)) out[slot].push(v);
  }
  return out;
}

export interface GossipActors {
  creature: ScriptActor;
  player: ScriptActor;
}

export interface GossipCast {
  spellId: number;
  castFlags: number;
  /** True when the resolved caster is the NPC (the direction the buffs need). */
  casterIsCreature: boolean;
}

export interface GossipRunResult {
  intents: DbScriptIntent[];
  casts: GossipCast[];
  /** data_flags bits present that this port does not resolve. */
  unsupportedFlags: number[];
  world: ScriptWorldState;
}

// Resolve one row's actors in ScriptMgr.cpp:1613-1627 order: buddy, REVERSE_DIRECTION swap, then
// SOURCE_TARGETS_SELF. Buddy lookup is not modelled — such a row keeps the dispatch-site actors.
function actorsForRow(
  row: DbScriptRow,
  origin: GossipScriptOrigin,
  actors: GossipActors,
  unsupported: Set<number>,
): { source: ScriptActor; target: ScriptActor } {
  const flags = row.dataFlags ?? 0;
  // Player.cpp:11890 vs :11934 — the two sites are mirror images.
  let source = origin === 'option' ? actors.creature : actors.player;
  let target = origin === 'option' ? actors.player : actors.creature;
  if (flags & SCRIPT_FLAG_BUDDY_AS_TARGET) unsupported.add(SCRIPT_FLAG_BUDDY_AS_TARGET);
  if (flags & SCRIPT_FLAG_REVERSE_DIRECTION) {
    const s = source;
    source = target;
    target = s;
  }
  if (flags & SCRIPT_FLAG_SOURCE_TARGETS_SELF) target = source;
  return { source, target };
}

/** Run a resolved path's rows, re-resolving actors per row the way ScriptAction does. */
export function runGossipPath(
  path: GossipTalkPath,
  actors: GossipActors,
  ctx?: Partial<DbScriptContext>,
): GossipRunResult {
  const intents: DbScriptIntent[] = [];
  const casts: GossipCast[] = [];
  const unsupported = new Set<number>();
  const world = createEmptyWorld(actors.creature, actors.player);

  const ordered = [...path.rows].sort(
    (a, b) => (a.delay | 0) - (b.delay | 0)
      || ((a.priority ?? 0) | 0) - ((b.priority ?? 0) | 0)
      || (a.command | 0) - (b.command | 0),
  );

  for (const row of ordered) {
    const { source, target } = actorsForRow(row, path.origin, actors, unsupported);
    world.source = source;
    world.target = target;
    const step = executeDbScriptRow(row, { ...ctx, world } as DbScriptContext);
    for (const i of step.intents) {
      intents.push(i);
      if (i.kind === 'cast_spell') {
        casts.push({
          spellId: i.spellId,
          castFlags: i.castFlags ?? 0,
          casterIsCreature: source.kind === 'creature',
        });
      }
      if (i.kind === 'mount') {
        source.mounted = !!(i.creatureId || i.modelId);
        source.mountCreatureId = i.creatureId;
        source.mountDisplayId = i.modelId;
      }
    }
    if (step.terminateScript) break;
  }

  applySpawnGroupIntents(intents);
  return { intents, casts, unsupportedFlags: [...unsupported], world };
}
