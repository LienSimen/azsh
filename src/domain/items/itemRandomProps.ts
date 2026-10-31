// Item random property rolls — pure and deterministic with an injected Rng. Rows come from
// item_enchantment_template, rolled cumulatively. Cite: ItemEnchantmentMgr.cpp GetItemEnchantMod.

import type { Rng } from '../../engine/core/rng.ts';
import type { RandomPropertyDef } from '../../data/schema.ts';

/** One weighted row from `item_enchantment_template` for a RandomProperty entry. */
export interface RandomEnchRow {
  /** Enchant / ItemRandomProperties id to assign on success. */
  ench: number;
  /** Percent weight (0..100 scale; sum often ≈ 100). */
  chance: number;
}

// Absolute pre-resolved power for AH valuation (Wave Q P5). Sums |stats| + |armor| + |weaponDamageFlat|
// from a RandomPropertyDef. Missing / non-finite fields contribute 0. Pure; no pricing constant here.
export function randomPropPowerPoints(prop: RandomPropertyDef | undefined | null): number {
  if (!prop) return 0;
  let sum = 0;
  if (prop.stats) {
    for (const v of Object.values(prop.stats)) {
      if (typeof v === 'number' && Number.isFinite(v)) sum += Math.abs(v);
    }
  }
  if (prop.armor != null && Number.isFinite(prop.armor)) sum += Math.abs(prop.armor);
  if (prop.weaponDamageFlat != null && Number.isFinite(prop.weaponDamageFlat)) {
    sum += Math.abs(prop.weaponDamageFlat);
  }
  return sum;
}

// Weighted roll over item_enchantment_template rows for one RandomProperty template: accumulate
// chance against rand_chance(), and re-roll against the total when the weights sum under 100.
export function getItemEnchantMod(rows: readonly RandomEnchRow[], rng: Rng): number {
  if (!rows.length) return 0;

  // First pass: full 0..100 scale (Util.cpp rand_chance → [0, 100)).
  let dRoll = rng.next() * 100;
  let fCount = 0;
  for (const row of rows) {
    if (row.chance <= 0) continue;
    fCount += row.chance;
    if (fCount > dRoll) return row.ench;
  }

  // Second pass only when the pool sums below 100% (ItemEnchantmentMgr.cpp:104–113).
  if (fCount <= 0) return 0;
  // dRoll = irand(0, floor(fCount * 100) + 1) / 100
  const hi = Math.floor(fCount * 100) + 1;
  dRoll = rng.int(0, hi) / 100;
  fCount = 0;
  for (const row of rows) {
    if (row.chance <= 0) continue;
    fCount += row.chance;
    if (fCount > dRoll) return row.ench;
  }
  return 0;
}

// Pure stand-in for Item::GenerateItemRandomPropertyId once the caller has loaded the pool rows.
// Returns the rolled ench id or 0; ItemRandomProperties validation is caller-side.
export function generateItemRandomPropertyId(
  templateRows: readonly RandomEnchRow[],
  rng: Rng,
): number {
  if (!templateRows.length) return 0;
  return getItemEnchantMod(templateRows, rng);
}

/** Sum of positive chances (for tests / diagnostics). */
export function sumEnchantChances(rows: readonly RandomEnchRow[]): number {
  let s = 0;
  for (const r of rows) {
    if (r.chance > 0) s += r.chance;
  }
  return s;
}
