// Quest srcItem whose useSpell is spell_script_target type 2 (a corpse). Farm those corpse
// entries; never hunt SUMMON_WILD kill-credit creatures. Cite: SpellMgr.h:1771-1776.

import type { DataStore } from '../../data/dataStore.ts';
import type { QuestDef } from '../../data/schema.ts';
import type { Inventory } from '../items/inventory.ts';
import { countItem } from '../items/inventory.ts';
import type { QuestState } from './questlog.ts';
import {
  SPELL_EFFECT_CREATE_ITEM,
  SPELL_EFFECT_SUMMON_WILD,
} from '../../engine/spells/interpreter/opcodes.ts';
import {
  scriptTargetRowsFor,
  SPELL_TARGET_TYPE_DEAD,
} from '../../engine/spells/scriptTargets.ts';

export type CorpseUseStamp = {
  creatureEntry?: number;
  hitBySpells?: readonly number[];
} | null | undefined;

/** True when every `spell_script_target` row for this spell is type 2 DEAD. */
export function isCorpseUseSpell(spellId: number): boolean {
  const rows = scriptTargetRowsFor(spellId);
  return rows.length > 0 && rows.every((r) => r.t === SPELL_TARGET_TYPE_DEAD);
}

export function itemIsQuestCorpseUse(ds: DataStore, itemEntry: number): boolean {
  const spell = ds.item(itemEntry)?.useSpell ?? 0;
  return spell > 0 && isCorpseUseSpell(spell);
}

/** srcItem.useSpell when that spell is a pure type-2 corpse target. */
export function corpseUseSpellId(ds: DataStore, quest: QuestDef): number {
  const item = quest.srcItem?.item ?? 0;
  if (!(item > 0)) return 0;
  const spell = ds.item(item)?.useSpell ?? 0;
  return spell > 0 && isCorpseUseSpell(spell) ? spell : 0;
}

export function corpseUseItemForQuest(ds: DataStore, quest: QuestDef): number {
  return corpseUseSpellId(ds, quest) > 0 ? (quest.srcItem?.item ?? 0) : 0;
}

/** Creature entries the item must be used on (dead). Cite: spell_script_target type 2. */
export function corpseUseFarmEntries(ds: DataStore, quest: QuestDef): number[] {
  const spell = corpseUseSpellId(ds, quest);
  if (!spell) return [];
  const seen = new Set<number>();
  const out: number[] = [];
  for (const r of scriptTargetRowsFor(spell)) {
    const e = r.e | 0;
    if (e > 0 && !seen.has(e)) {
      seen.add(e);
      out.push(e);
    }
  }
  return out;
}

/** SUMMON_WILD miscValue — kill-credit NPCs that never spawn in a zone. */
export function corpseUseSummonedEntries(ds: DataStore, quest: QuestDef): number[] {
  const spell = corpseUseSpellId(ds, quest);
  if (!spell) return [];
  return summonedEntriesForSpell(ds, spell);
}

export function summonedEntriesForSpell(ds: DataStore, spellId: number): number[] {
  const sp = ds.spell(spellId);
  const seen = new Set<number>();
  const out: number[] = [];
  const add = (e: number) => {
    if (e > 0 && !seen.has(e)) {
      seen.add(e);
      out.push(e);
    }
  };
  for (const e of sp?.effects ?? []) {
    if (e.kind === 'summon_wild') add(e.creature | 0);
  }
  for (const r of sp?.rawEffects ?? []) {
    if ((r.effect | 0) === SPELL_EFFECT_SUMMON_WILD) add(r.miscValue | 0);
  }
  return out;
}

export function createdItemsForSpell(ds: DataStore, spellId: number): number[] {
  const sp = ds.spell(spellId);
  const seen = new Set<number>();
  const out: number[] = [];
  const add = (e: number) => {
    if (e > 0 && !seen.has(e)) {
      seen.add(e);
      out.push(e);
    }
  };
  for (const e of sp?.effects ?? []) {
    if (e.kind === 'conjure') add(e.item | 0);
  }
  for (const r of sp?.rawEffects ?? []) {
    if ((r.effect | 0) === SPELL_EFFECT_CREATE_ITEM) add((r.itemType ?? 0) | 0);
  }
  return out;
}

export function corpseUseCreatedItems(ds: DataStore, quest: QuestDef): number[] {
  const spell = corpseUseSpellId(ds, quest);
  return spell ? createdItemsForSpell(ds, spell) : [];
}

export function corpseUseWorkRemaining(
  ds: DataStore,
  quest: QuestDef,
  qs: QuestState,
  inv?: Inventory,
): boolean {
  if (!corpseUseSpellId(ds, quest)) return false;
  for (const e of corpseUseSummonedEntries(ds, quest)) {
    const kt = (quest.killTargets ?? []).find((k) => k.creatureEntry === e);
    if (kt && (qs.kills[String(e)] ?? 0) < kt.count) return true;
  }
  for (const item of corpseUseCreatedItems(ds, quest)) {
    const it = (quest.itemTargets ?? []).find((t) => t.item === item);
    if (!it) continue;
    if (!inv || countItem(inv, it.item) < it.count) return true;
  }
  return false;
}

export function corpseUseFightEntries(
  ds: DataStore,
  quest: QuestDef,
  qs: QuestState,
  inv?: Inventory,
): number[] {
  return corpseUseWorkRemaining(ds, quest, qs, inv) ? corpseUseFarmEntries(ds, quest) : [];
}

/** srcItem to use on the current corpse, or 0 when there is nothing to click. */
export function pendingCorpseUseItem(
  ds: DataStore,
  quest: QuestDef,
  inv: Inventory,
  lastCorpse: CorpseUseStamp,
): number {
  const item = corpseUseItemForQuest(ds, quest);
  if (!(item > 0) || countItem(inv, item) < 1) return 0;
  const corpse = lastCorpse?.creatureEntry ?? 0;
  if (!(corpse > 0)) return 0;
  if (!corpseUseFarmEntries(ds, quest).includes(corpse)) return 0;
  const spell = corpseUseSpellId(ds, quest);
  if (spell > 0 && (lastCorpse?.hitBySpells ?? []).includes(spell)) return 0;
  return item;
}
