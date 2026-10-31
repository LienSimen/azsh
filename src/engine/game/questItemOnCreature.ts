// Quest item cast on a creature: the item's use spell plus a target entry resolves to ScriptDev spell
// hits, whose credit can be a KilledMonsterCredit rather than an explore or event.

import type { DataStore } from '../../data/dataStore.ts';
import { countItem, type Inventory } from '../../domain/items/inventory.ts';
import { recordEventHappens, recordKill, type QuestLog } from '../../domain/quests/questlog.ts';
import {
  lazyPeonSpellHit,
  SPELL_AWAKEN_PEON,
} from '../../domain/scriptdev/durotar.ts';
import { scriptDevByCreature } from '../../domain/scriptdev/registry.ts';
import { bareUseRefusedCreatureEntries } from '../spells/scriptTargets.ts';

export type QuestItemOnCreatureResult =
  | { handled: false }
  | { handled: true; ok: false; reason: string }
  | { handled: true; ok: true; questlog: QuestLog; logLine: string };

// useQuestItemOnTarget path for creature targets with a useSpell ScriptDev hit. Caller applies questlog +
// refreshQuests + activity log on ok:true.
export function tryQuestItemOnCreature(opts: {
  itemEntry: number;
  targetCreatureEntry?: number;
  inventory: Inventory;
  questlog: QuestLog;
  ds: DataStore;
}): QuestItemOnCreatureResult {
  const target = opts.targetCreatureEntry;
  if (target == null || !(target > 0)) return { handled: false };

  const useSpell = opts.ds.item(opts.itemEntry)?.useSpell ?? 0;
  if (!(useSpell > 0)) return { handled: false };

  const ir = scriptDevByCreature(target);
  const hit = (ir?.spellHits ?? []).find((h) => h.spellId === useSpell);
  if (!hit) return { handled: false };

  if (countItem(opts.inventory, opts.itemEntry) < 1) {
    return { handled: true, ok: false, reason: 'You do not have that item' };
  }
  // hit.playerCaster: item use is always the player (handleSpellHit playerCaster gate).

  // Awaken Peon OnCheckCast — target must have sleep aura 17743.
  // Cite: durotar.cpp:236-242. Headless: peons presented for use are sleeping.
  if (useSpell === SPELL_AWAKEN_PEON) {
    const peon = lazyPeonSpellHit(useSpell, true, true);
    if (!peon.handled || !peon.awaken) {
      return { handled: true, ok: false, reason: 'Invalid target' };
    }
  }

  let questlog = opts.questlog;
  let credited = false;
  for (const act of hit.actions ?? []) {
    if (act.kind !== 'quest_credit') continue;
    const id = act.entry | 0;
    if (!(id > 0)) continue;
    // Three different C++ calls share this row shape, and this path read every one as a creature entry
    // — the mirror of the combat reader, which read every one as a quest id.
    const kind = act.credit ?? 'event';
    const next = kind === 'event'
      ? recordEventHappens(questlog, id)
      : recordKill(questlog, id, (e) => opts.ds.quest(e));
    if (next !== questlog) {
      questlog = next;
      credited = true;
    }
  }

  if (!credited) {
    return { handled: true, ok: false, reason: 'No quest needs that item used on a target' };
  }

  const itName = opts.ds.item(opts.itemEntry)?.name ?? `item ${opts.itemEntry}`;
  const crName = opts.ds.creature(target)?.name ?? `creature ${target}`;
  return {
    handled: true,
    ok: true,
    questlog,
    logLine: `You use ${itName} on ${crName}.`,
  };
}

// A bare bag use of an item whose use spell needs a named LIVE creature nearby: the cast ends in bad
// targets before the item is spent. Without this, 12 of 32 such items were destroyed for nothing.
export function refuseBareScriptTargetItemUse(
  itemEntry: number,
  inventory: Inventory,
  ds: DataStore,
): { ok: false; reason: string; restored: number } | null {
  const useSpell = ds.item(itemEntry)?.useSpell ?? 0;
  if (!(useSpell > 0)) return null;
  const entries = bareUseRefusedCreatureEntries(useSpell, ds.spell(useSpell)?.rawEffects);
  if (!entries.length) return null;
  if (countItem(inventory, itemEntry) < 1) {
    return { ok: false, reason: "You don't have this", restored: 0 };
  }
  const names = entries
    .map((e) => ds.creature(e)?.name)
    .filter((n): n is string => !!n);
  const want = names.length ? names.slice(0, 3).join(' or ') : 'the right target';
  return { ok: false, reason: `You must use this on ${want}`, restored: 0 };
}
