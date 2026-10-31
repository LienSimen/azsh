// Loot rolling, faithful to CMaNGOS LootTemplate: group 0 rows roll independently, every non-zero
// group yields at most one, and reference rows expand recursively. Pure, with an injected Rng.

import type { LootEntryDef } from '../../data/schema.ts';
import type { Rng } from '../../engine/core/rng.ts';

export interface LootDrop {
  item: number;
  count: number;
  /** ItemRandomProperties id when this drop was minted with a suffix. */
  randomPropertyId?: number;
}

// A loot row that may point at reference_loot_template. When referenceLootId is set, the row is no
// item drop: after its chance succeeds the referenced table is processed maxCount times.
export type LootEntryWithRef = LootEntryDef & {
  referenceLootId?: number;
};

/** Safety depth for nested reference expansion (CMaNGOS validates cycles at load). */
export const DEFAULT_REFERENCE_LOOT_DEPTH = 8;

/** Optional gate for FQ3 quest-required rows + QI2.5 conditionId rows during a production roll. */
export type LootRollContext = {
  // True when the player may receive this entry's quest-required drop — any active quest listing
  // the item as an objective. When omitted, quest-required rows are skipped entirely.
  allowsQuestDrop?: (entry: LootEntryDef) => boolean;
  // When entry.conditionId is non-zero the row rolls only if this returns true, as LootMgr consults
  // conditions per row. When omitted, conditionId-bearing rows are skipped: fail closed.
  allowsCondition?: (conditionId: number, entry: LootEntryDef) => boolean;
  // Item-level veto, checked before either gate above and whatever the chance sign is: "this
  // looter may not have this item at all". Alterac's faction-locked quest items are the case.
  // When omitted, nothing is vetoed.
  allowsItem?: (itemId: number) => boolean;
};

/** CMaNGOS ChanceOrQuestChance: negative chance or explicit flag → quest-gated. */
export function isQuestRequiredLootEntry(e: LootEntryDef): boolean {
  return e.questRequired === true || e.chance < 0;
}

/** Exclusive quest-container row (gated or |chance| ≥ 100). World-chest group loot is not. */
export function isExclusiveQuestLootRow(e: LootEntryDef): boolean {
  return isQuestRequiredLootEntry(e) || Math.abs(e.chance) >= 100;
}

/** Dedicated quest-container row for this item. Cite: buildItemDropperMap questGatedOnly. */
export function lootRowIsQuestItemSource(e: LootEntryDef, itemId: number): boolean {
  return e.item === itemId && isExclusiveQuestLootRow(e);
}

/** Roll weight / percent magnitude (always non-negative). */
export function lootChanceMagnitude(e: LootEntryDef): number {
  return Math.abs(e.chance);
}

/** Whether this entry may participate in the current roll. */
export function isLootEntryEligible(e: LootEntryDef, ctx?: LootRollContext): boolean {
  // QI2.5 conditionId gate (independent of signed quest-chance). Fail closed when
  // conditionId present and no allowsCondition, or when allowsCondition returns false.
  const cid = (e.conditionId ?? 0) | 0;
  if (cid !== 0) {
    if (ctx?.allowsCondition?.(cid, e) !== true) return false;
  }
  // A drop the looter may not have AT ALL, whatever its chance sign. Alterac's Storm Crystal is
  // a plain +80 row in ClassicDB while its Horde twin is a -100 quest row, so the quest gate below
  // cannot express "the other faction's quest item" — this can. Absent predicate = allow.
  if (ctx?.allowsItem && ctx.allowsItem(e.item) !== true) return false;
  if (!isQuestRequiredLootEntry(e)) return true;
  return ctx?.allowsQuestDrop?.(e) === true;
}

export function isReferenceLootEntry(e: LootEntryWithRef): boolean {
  return (e.referenceLootId ?? 0) > 0;
}

// Lookup for any loot store by id — creature loot, pickpocket, reference. The live bake uses
// namespaced string keys like pickpocket:<n>; fixtures may use bare numbers.
export type LootTableLookup = (lootId: number | string) => readonly LootEntryWithRef[] | undefined;

export function rollLoot(
  entries: readonly LootEntryDef[],
  rng: Rng,
  ctx?: LootRollContext,
): LootDrop[] {
  return rollLootDeep(entries, () => undefined, rng, 0, DEFAULT_REFERENCE_LOOT_DEPTH, ctx);
}

// Roll a table with recursive reference expansion. Plain entries behave as `rollLoot`; reference rows that
// pass their chance process the referenced template `maxCount` times (default 1).
export function rollLootDeep(
  entries: readonly LootEntryWithRef[],
  getTable: LootTableLookup,
  rng: Rng,
  depth: number = 0,
  maxDepth: number = DEFAULT_REFERENCE_LOOT_DEPTH,
  ctx?: LootRollContext,
): LootDrop[] {
  if (depth > maxDepth) return [];

  const out: LootDrop[] = [];
  const groups = new Map<number, LootEntryWithRef[]>();

  for (const e of entries) {
    if (!isLootEntryEligible(e, ctx)) continue;

    if (e.groupId === 0) {
      const mag = lootChanceMagnitude(e);
      if (isReferenceLootEntry(e)) {
        // Ungrouped reference: independent chance, then expand (LootMgr.cpp:2624–2645).
        if (mag > 0 && rng.chance(mag / 100)) {
          pushReference(out, e, getTable, rng, depth, maxDepth, ctx);
        }
      } else if (mag > 0 && rng.chance(mag / 100)) {
        out.push(rollCount(e, rng));
      }
    } else {
      const g = groups.get(e.groupId);
      if (g) g.push(e);
      else groups.set(e.groupId, [e]);
    }
  }

  for (const group of groups.values()) {
    const picked = rollGroup(group, rng);
    if (!picked) continue;
    if (isReferenceLootEntry(picked)) {
      pushReference(out, picked, getTable, rng, depth, maxDepth, ctx);
    } else {
      out.push(rollCount(picked, rng));
    }
  }
  return out;
}

function pushReference(
  out: LootDrop[],
  ref: LootEntryWithRef,
  getTable: LootTableLookup,
  rng: Rng,
  depth: number,
  maxDepth: number,
  ctx?: LootRollContext,
): void {
  const refId = ref.referenceLootId!;
  const table = getTable(refId);
  if (!table) return;
  // maxCount is the reference multiplicator (at least 1).
  const loops = Math.max(1, ref.maxCount || 1);
  for (let i = 0; i < loops; i++) {
    const nested = rollLootDeep(table, getTable, rng, depth + 1, maxDepth, ctx);
    for (const d of nested) out.push(d);
  }
}

function rollCount(e: LootEntryDef, rng: Rng): LootDrop {
  return { item: e.item, count: rng.int(e.minCount, e.maxCount) };
}

// Pick at most one item from a group: explicitly-chanced rows are tried first against one 0..100
// roll, then an equal-chanced (chance 0) row uniformly. Chances summing under 100 can yield none.
function rollGroup(entries: readonly LootEntryWithRef[], rng: Rng): LootEntryWithRef | null {
  // Explicit weight: non-zero chance (positive or negative signed quest rows that passed gate).
  const explicit = entries.filter((e) => lootChanceMagnitude(e) > 0);
  if (explicit.length) {
    let roll = rng.next() * 100;
    for (const e of explicit) {
      const mag = lootChanceMagnitude(e);
      if (mag >= 100) return e;
      roll -= mag;
      if (roll < 0) return e;
    }
  }
  // Equal-chance fallback: chance === 0 only (FQ3 — not negative quest rows).
  const equal = entries.filter((e) => e.chance === 0);
  return equal.length ? equal[rng.int(0, equal.length - 1)]! : null;
}

// Structurally expand reference rows into a flat list of plain entries for previews. Does NOT
// roll chances — each reference expands maxCount times into copies of its rows, depth-capped.
export function resolveReferenceLoot(
  entries: readonly LootEntryWithRef[],
  getTable: LootTableLookup,
  maxDepth: number = DEFAULT_REFERENCE_LOOT_DEPTH,
  depth: number = 0,
  visited: ReadonlySet<number> = new Set(),
): LootEntryWithRef[] {
  if (depth > maxDepth) return [];

  const out: LootEntryWithRef[] = [];
  for (const e of entries) {
    if (!isReferenceLootEntry(e)) {
      out.push(e);
      continue;
    }
    const refId = e.referenceLootId!;
    if (visited.has(refId)) continue; // cycle guard (load-time in CMaNGOS)
    const child = getTable(refId);
    if (!child) continue;
    const nextVisited = new Set(visited);
    nextVisited.add(refId);
    const loops = Math.max(1, e.maxCount || 1);
    for (let i = 0; i < loops; i++) {
      const expanded = resolveReferenceLoot(child, getTable, maxDepth, depth + 1, nextVisited);
      for (const row of expanded) out.push(row);
    }
  }
  return out;
}

// Load a loot chain by id (creature loot, pickpocket, reference root, …). Pickpocket tables are just
// another lootId — same processor (LootMgr stores).
export function resolveLootChain(
  lootId: number,
  getTable: LootTableLookup,
  maxDepth: number = DEFAULT_REFERENCE_LOOT_DEPTH,
): LootEntryWithRef[] {
  const root = getTable(lootId);
  if (!root) return [];
  return resolveReferenceLoot(root, getTable, maxDepth, 0, new Set([lootId]));
}
