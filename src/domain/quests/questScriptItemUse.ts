// A kill objective credited by a ScriptDev spell hit, not a kill: the player uses a held item on a
// LIVE creature. Cite: durotar.cpp:233-249 AwakenPeon 19938 → KilledMonsterCredit(10556).

import type { DataStore } from '../../data/dataStore.ts';
import type { QuestDef } from '../../data/schema.ts';
import { countItem, type Inventory } from '../items/inventory.ts';
import { scriptDevByCreature } from '../scriptdev/registry.ts';
import type { QuestState } from './questlog.ts';

export type QuestScriptItemUse = {
  item: number;
  targetCreatureEntry: number;
};

/** Items the quest hands out or asks for — the only candidates for its own use-on-target step. */
function questItemCandidates(quest: QuestDef): number[] {
  const out: number[] = [];
  const add = (e: number | undefined) => {
    const n = (e ?? 0) | 0;
    if (n > 0 && !out.includes(n)) out.push(n);
  };
  add(quest.srcItem?.item);
  add(quest.srcItemId);
  for (const t of quest.sourceItemTargets ?? []) add(t.item);
  for (const t of quest.itemTargets ?? []) add(t.item);
  return out;
}

// True when a ScriptDev spellHit on `entry` credits KilledMonsterCredit(entry) for a player cast of
// `spellId` — the same match tryQuestItemOnCreature makes before it spends the item.
export function scriptCreditsCreatureForSpell(entry: number, spellId: number): boolean {
  const ir = scriptDevByCreature(entry);
  for (const hit of ir?.spellHits ?? []) {
    if (hit.spellId !== spellId) continue;
    for (const act of hit.actions ?? []) {
      if (act.kind !== 'quest_credit') continue;
      if ((act.credit ?? 'event') !== 'creature') continue;
      if ((act.entry | 0) === (entry | 0)) return true;
    }
  }
  return false;
}

// The item + creature to click for an unmet kill objective in `zoneId`, or null. A CIVILIAN target is
// never on zone.huntable (outdoorHuntable.ts), so the Attack list can never carry this step.
export function pendingScriptItemUse(
  ds: DataStore,
  quest: QuestDef,
  qs: QuestState,
  inv: Inventory,
  zoneId: string,
): QuestScriptItemUse | null {
  const spawned = new Set<number>();
  for (const s of ds.zone(zoneId)?.spawns ?? []) {
    const e = (s.entry ?? 0) | 0;
    if (e > 0) spawned.add(e);
  }
  if (!spawned.size) return null;
  const candidates = questItemCandidates(quest);
  if (!candidates.length) return null;
  for (const kt of quest.killTargets ?? []) {
    const entry = kt.creatureEntry | 0;
    if (!(entry > 0) || !spawned.has(entry)) continue;
    if ((qs.kills[String(entry)] ?? 0) >= kt.count) continue;
    for (const item of candidates) {
      if (countItem(inv, item) < 1) continue;
      const useSpell = ds.item(item)?.useSpell ?? 0;
      if (!(useSpell > 0)) continue;
      if (!scriptCreditsCreatureForSpell(entry, useSpell)) continue;
      return { item, targetCreatureEntry: entry };
    }
  }
  return null;
}
