// Create-time random property roll. Pure, injected Rng only. Clone, mail and trade pass
// opts.preserve so a rolled suffix never re-rolls. Cite: Item.cpp:639 / :958.

import type { ItemDef, RandomPropertyDef } from '../../data/schema.ts';
import type { Rng } from '../../engine/core/rng.ts';
import type { ItemInstance } from './itemInstance.ts';
import { copyInstance } from './itemInstance.ts';
import {
  generateItemRandomPropertyId,
  type RandomEnchRow,
} from './itemRandomProps.ts';
import { stampUniqueFromDef } from './itemRestrictions.ts';

/** Minimal data surface for create-time minting. `DataStore` satisfies this. */
export interface CreateItemData {
  item(entry: number): ItemDef | undefined;
  itemEnchantmentTemplate(entry: number): readonly RandomEnchRow[] | undefined;
  itemRandomProperty?(id: number): RandomPropertyDef | undefined;
}

export interface CreateItemOpts {
  // Force a property id (tests / GM). Skips the weighted pool roll. 0 (or missing from the property table
  // when `lookupProp` is set) → no suffix.
  forcedPropId?: number;
  // Clone path (mail / trade / AH delivery): copy identity fields; never re-roll. `item` / `count` on the
  // partial are ignored in favour of the call arguments.
  preserve?: Partial<ItemInstance>;
  // Validate a rolled/forced id against baked `ItemRandomProperties`. Missing id → store 0 / omit (CMaNGOS
  // lookup fail → 0). Prefer this over casting the data bundle when DataStore has no accessor yet.
  lookupProp?: (id: number) => RandomPropertyDef | undefined;
}

/** 0 / absent when no property; drops ids the property table does not know. */
function sanitizePropId(
  id: number,
  lookupProp?: (id: number) => RandomPropertyDef | undefined,
): number {
  if (id <= 0) return 0;
  if (lookupProp && lookupProp(id) == null) return 0;
  return id;
}

// Mint a new item instance at economy entry — loot, vendor, craft, quest, AHbot. preserve copies
// identity, forcedPropId wins over the pool roll, and plain mats stay { item, count }.
export function createItemInstance(
  entry: number,
  count: number,
  ds: CreateItemData,
  rng: Rng,
  opts?: CreateItemOpts,
): ItemInstance {
  const n = count > 0 ? count : 0;
  const def = ds.item(entry);
  const lookupProp = opts?.lookupProp ?? (ds.itemRandomProperty
    ? (id) => ds.itemRandomProperty!(id)
    : undefined);

  // Clone / mail / trade: preserve existing identity fields; do not re-roll.
  // Still stamp unique from def when signals exist (idempotent if already set).
  if (opts?.preserve) {
    return stampUniqueFromDef(
      copyInstance({ item: entry, count: n, ...opts.preserve }, n),
      def,
    );
  }

  // Forced id (tests / GM override) — still validate against the property table.
  if (opts?.forcedPropId != null) {
    const id = sanitizePropId(opts.forcedPropId, lookupProp);
    const out: ItemInstance = { item: entry, count: n };
    if (id > 0) out.randomPropertyId = id;
    return stampUniqueFromDef(out, def);
  }

  let randomPropertyId: number | undefined;

  const poolKey = def?.randomProperty;
  if (poolKey != null && poolKey > 0) {
    const raw = ds.itemEnchantmentTemplate(poolKey);
    const rows = Array.isArray(raw) ? raw : [];
    const rolled = generateItemRandomPropertyId(rows, rng);
    const id = sanitizePropId(rolled, lookupProp);
    if (id > 0) randomPropertyId = id;
  }

  const out: ItemInstance = { item: entry, count: n };
  if (randomPropertyId != null && randomPropertyId > 0) {
    out.randomPropertyId = randomPropertyId;
  }
  // Callers decide instance-vs-stack via identityCapable / hasIdentity; minting always returns the LOCK-1
  // shape (plain mats = entry+count only). FI: stamp unique when def signals unique / uniqueEquipped.
  return stampUniqueFromDef(out, def);
}
