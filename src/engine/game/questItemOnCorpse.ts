// A quest item used on a type-2 corpse: create-item runs the item creation and a summon with a gossip
// kill-credit records the kill. Cite: Spell.cpp:7925-7935; Player.cpp KilledMonsterCredit.

import type { DataStore } from '../../data/dataStore.ts';
import { addItem, countItem, type Inventory } from '../../domain/items/inventory.ts';
import { recordKill, type QuestLog } from '../../domain/quests/questlog.ts';
import {
  createdItemsForSpell,
  isCorpseUseSpell,
  summonedEntriesForSpell,
  type CorpseUseStamp,
} from '../../domain/quests/questCorpseUse.ts';
import { collectFailedQuestIds, collectKillCreditEntries } from '../../domain/world/goEventFire.ts';
import { indexGossipMenus, type GossipMenu } from '../../domain/quests/gossip.ts';
import { resolveGossipTalk, runGossipPath } from '../../domain/quests/gossipTalk.ts';
import { scriptTargetRowsFor } from '../spells/scriptTargets.ts';
import { resolveCombatSpell } from '../spells/interpreter/index.ts';
import { questConditionSnapshot } from '../../quests/quests.ts';
import {
  applyFailedQuests,
  makeDbScriptEvaluateCondition,
} from './applyTerminateFromDbScript.ts';

export type QuestItemOnCorpseResult =
  | { handled: false }
  | { handled: true; ok: false; reason: string }
  | {
    handled: true;
    ok: true;
    questlog: QuestLog;
    inventory?: Inventory;
    logLine: string;
    hitSpellId: number;
    targetEntry: number;
  };

const gossipIndexCache = new WeakMap<DataStore, Map<number, GossipMenu>>();

function gossipMenusOf(ds: DataStore): Map<number, GossipMenu> {
  let m = gossipIndexCache.get(ds);
  if (!m) {
    m = indexGossipMenus(ds.gossipMenus());
    gossipIndexCache.set(ds, m);
  }
  return m;
}

export function stampCorpseSpellHit(
  last: { creatureType: number; creatureEntry?: number; hitBySpells?: number[] } | null | undefined,
  spellId: number,
  creatureEntry: number,
): { creatureType: number; creatureEntry?: number; hitBySpells?: number[] } {
  return {
    creatureType: last?.creatureType ?? 0,
    creatureEntry: last?.creatureEntry ?? creatureEntry,
    hitBySpells: [...(last?.hitBySpells ?? []), spellId],
  };
}

export function tryQuestItemOnCorpse(opts: {
  itemEntry: number;
  targetCreatureEntry?: number;
  lastCorpse?: CorpseUseStamp;
  corpse?: { creatureEntry: number } | null;
  inventory: Inventory;
  questlog: QuestLog;
  ds: DataStore;
}): QuestItemOnCorpseResult {
  const useSpell = opts.ds.item(opts.itemEntry)?.useSpell ?? 0;
  if (!(useSpell > 0) || !isCorpseUseSpell(useSpell)) return { handled: false };

  const rows = scriptTargetRowsFor(useSpell);
  const corpseEntry = opts.lastCorpse?.creatureEntry ?? opts.corpse?.creatureEntry ?? 0;
  if (!(corpseEntry > 0)) {
    return { handled: true, ok: false, reason: 'You must use that on a corpse' };
  }
  if (opts.targetCreatureEntry != null && opts.targetCreatureEntry !== corpseEntry) {
    return { handled: true, ok: false, reason: 'Invalid target' };
  }
  if (!rows.some((r) => r.e === corpseEntry)) {
    return { handled: true, ok: false, reason: 'Invalid target' };
  }
  if ((opts.lastCorpse?.hitBySpells ?? []).includes(useSpell)) {
    return { handled: true, ok: false, reason: 'Already used on this corpse' };
  }
  if (countItem(opts.inventory, opts.itemEntry) < 1) {
    return { handled: true, ok: false, reason: 'You do not have that item' };
  }

  let questlog = opts.questlog;
  let inventory: Inventory | undefined;
  let credited = false;
  let created = false;

  const raw = opts.ds.spell(useSpell);
  if (raw) {
    const resolved = resolveCombatSpell(raw);
    for (const e of resolved.effects ?? []) {
      if (e.kind !== 'conjure' || !(e.item > 0)) continue;
      const stack = opts.ds.item(e.item)?.stackable ?? 1;
      inventory = addItem(inventory ?? opts.inventory, e.item, Math.max(1, e.count | 0), stack);
      created = true;
    }
  }
  if (!created) {
    for (const item of createdItemsForSpell(opts.ds, useSpell)) {
      const stack = opts.ds.item(item)?.stackable ?? 1;
      inventory = addItem(inventory ?? opts.inventory, item, 1, stack);
      created = true;
    }
  }

  const condRows = opts.ds.conditionsList() ?? [];
  const condTable = new Map(condRows.map((c) => [c.id | 0, c]));
  const evaluateCondition = makeDbScriptEvaluateCondition(
    questConditionSnapshot(questlog),
    condTable,
  );
  for (const summoned of summonedEntriesForSpell(opts.ds, useSpell)) {
    const menuId = opts.ds.creature(summoned)?.gossipMenuId ?? 0;
    if (!(menuId > 0)) continue;
    const talk = resolveGossipTalk({
      menus: gossipMenusOf(opts.ds),
      scripts: (id) => opts.ds.gossipScripts(id),
      menuId,
    });
    const creature = {
      kind: 'creature' as const,
      entry: summoned,
      gossipMenuId: menuId,
      alive: true,
      spawned: true,
    };
    const player = { kind: 'player' as const, alive: true };
    for (const path of talk.paths) {
      if (path.origin !== 'menu' || path.depth !== 0) continue;
      const res = runGossipPath(path, { creature, player }, { evaluateCondition });
      for (const entry of collectKillCreditEntries(res)) {
        questlog = recordKill(questlog, entry, (e) => opts.ds.quest(e));
        credited = true;
      }
      // Cite: ScriptMgr.cpp:2719–2734 TERMINATE_COND failQuest.
      const failed = collectFailedQuestIds(res);
      if (failed.length) {
        questlog = applyFailedQuests(questlog, failed);
        credited = true;
      }
    }
  }

  if (!credited && !created) {
    return { handled: true, ok: false, reason: 'No quest needs that item used on a target' };
  }

  const itName = opts.ds.item(opts.itemEntry)?.name ?? `item ${opts.itemEntry}`;
  const crName = opts.ds.creature(corpseEntry)?.name ?? 'the corpse';
  return {
    handled: true,
    ok: true,
    questlog,
    inventory,
    logLine: `You use ${itName} on ${crName}.`,
    hitSpellId: useSpell,
    targetEntry: corpseEntry,
  };
}
