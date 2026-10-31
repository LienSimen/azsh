/**
 * ClassicDB peer-median repair for absurd near-zero creature loot chances.
 *
 * Classic 1.12 `creature_loot_template` stores ChanceOrQuestChance as a percent
 * (CMaNGOS LootMgr.cpp: independent group-0 roll uses chance/100). Most Chunk of
 * Boar Meat (769) rows sit at ~45–80%, matching playable Stocking Jetsteam rates,
 * but a few starter creatures ship with sniffs like 0.0094 / 0.0081 / 0.0272 —
 * i.e. ~1e-4 absolute probability after /100. Peers of the SAME item already hold
 * the correct percent-scale values; we never invent a number.
 *
 * Rule (creature tables only — bare numeric loot keys):
 *   - Optionally restrict to `allowedItems` (quest objective items) so incidental
 *     food/cloth/potion 0.02% rows on humanoids are never inflated.
 *   - Collect group-0 rows per item (abs(chance) > 0).
 *   - Split into sane (abs >= SANITY_MIN) vs tiny (0 < abs < OUTLIER_MAX).
 *   - Repair tinies ONLY when ALL of:
 *       (a) ≥ MIN_SANE_PEERS sane peers exist
 *       (b) tinies are a minority (tinyCount < saneCount)
 *       (c) the item's OVERALL median (all positive rates) ≥ SANITY_MIN
 *   - Replacement = median of sane peers (preserve sign for FQ3). Never invent rates.
 *
 * Cite: classic-db creature_loot_template (entry 708 item 769 ChanceOrQuestChance
 * 0.0094 vs entry 1127 / 1125 / 1126 ~45%); LootMgr.cpp group-0 Process; KI-108.
 */

/** Minimum abs(chance) treated as a normal percent-scale drop (not a greys/world-drop rarity). */
export const SANITY_MIN = 5;
/** Outliers strictly below this (and above 0) are candidates for repair. */
export const OUTLIER_MAX = 1;
/** Need this many sane peer rows before trusting the median. */
export const MIN_SANE_PEERS = 3;
/**
 * Cap on how many tiny outliers an item may have and still be auto-repaired.
 * Mass tinies (cloth/food on dozens of mobs) are left alone — only the few broken
 * sniffs (e.g. 3 boar-meat rows) get peer-median repair.
 */
export const MAX_TINY_OUTLIERS = 5;

/**
 * @param {number[]} values sorted ascending
 * @returns {number}
 */
export function median(values) {
  if (!values.length) return 0;
  const mid = (values.length - 1) / 2;
  const lo = Math.floor(mid);
  const hi = Math.ceil(mid);
  return lo === hi ? values[lo] : (values[lo] + values[hi]) / 2;
}

/**
 * @param {number} chance signed ChanceOrQuestChance magnitude is percent
 * @returns {boolean}
 */
export function isOutlierChance(chance) {
  const mag = Math.abs(Number(chance) || 0);
  return mag > 0 && mag < OUTLIER_MAX;
}

/**
 * @param {number} chance
 * @returns {boolean}
 */
export function isSaneChance(chance) {
  return Math.abs(Number(chance) || 0) >= SANITY_MIN;
}

/**
 * Compute per-item replacement rate (unsigned median of sane peers), or null.
 * Only items where tiny outliers are a minority of peer rows qualify.
 * @param {Array<number|Array>} rows compact tuples or entry-like {item,chance,groupId}
 * @param {Set<number>|null} [allowedItems] when set, only these item ids are considered
 * @returns {Map<number, number>} item → unsigned median
 */
export function peerMediansFromRows(rows, allowedItems = null) {
  /** @type {Map<number, number[]>} */
  const byItem = new Map();
  for (const r of rows) {
    let item;
    let chance;
    let groupId = 0;
    if (Array.isArray(r)) {
      item = r[0] | 0;
      chance = Number(r[1]) || 0;
      groupId = (r[2] | 0) || 0;
    } else {
      item = r.item | 0;
      chance = Number(r.chance) || 0;
      groupId = (r.groupId | 0) || 0;
    }
    if (!item || groupId !== 0) continue;
    if (allowedItems && !allowedItems.has(item)) continue;
    if (!(Math.abs(chance) > 0)) continue;
    if (!byItem.has(item)) byItem.set(item, []);
    byItem.get(item).push(Math.abs(chance));
  }

  /** @type {Map<number, number>} */
  const medians = new Map();
  for (const [item, mags] of byItem) {
    const sorted = [...mags].sort((a, b) => a - b);
    const overallMed = median(sorted);
    // Guard: item is primarily a percent-scale common drop, not a rare incidental.
    if (overallMed < SANITY_MIN) continue;

    const sane = mags.filter((m) => m >= SANITY_MIN).sort((a, b) => a - b);
    const tiny = mags.filter((m) => m > 0 && m < OUTLIER_MAX);
    if (sane.length < MIN_SANE_PEERS) continue;
    if (tiny.length === 0) continue;
    if (tiny.length > MAX_TINY_OUTLIERS) continue;
    // Tinies must be a strict minority of the item's drop rows.
    if (tiny.length >= sane.length) continue;
    const med = median(sane);
    if (med < SANITY_MIN) continue;
    medians.set(item, med);
  }
  return medians;
}

/**
 * Collect item ids that quests ask the player to gather (itemTargets / srcItem).
 * Soft-lock scope: only these may receive peer-median chance repair.
 * @param {Iterable<{itemTargets?: Array<{item?:number}>, srcItem?: {item?:number}}>} quests
 * @returns {Set<number>}
 */
export function questObjectiveItemIds(quests) {
  const ids = new Set();
  for (const q of quests) {
    for (const t of q.itemTargets ?? []) {
      const id = t?.item | 0;
      if (id > 0) ids.add(id);
    }
    const src = q.srcItem?.item | 0;
    if (src > 0) ids.add(src);
  }
  return ids;
}

/**
 * Apply peer-median repair across a compact loot-data map (creature keys only).
 * @param {Record<string, Array>} compact loot-data.json shape
 * @param {{ allowedItems?: Set<number>|null }} [opts]
 * @returns {{ next: Record<string, Array>, patches: Array<{table:string,item:number,from:number,to:number}> }}
 */
export function sanitizeCompactLoot(compact, opts = {}) {
  const allowedItems = opts.allowedItems ?? null;
  // Collect all creature (numeric-key) group-0 rows for peer stats.
  const allCreatureRows = [];
  for (const [key, rows] of Object.entries(compact)) {
    if (!/^\d+$/.test(key) || !Array.isArray(rows)) continue;
    for (const r of rows) allCreatureRows.push(r);
  }
  const medians = peerMediansFromRows(allCreatureRows, allowedItems);

  /** @type {Array<{table:string,item:number,from:number,to:number}>} */
  const patches = [];

  for (const [key, rows] of Object.entries(compact)) {
    if (!/^\d+$/.test(key) || !Array.isArray(rows)) continue;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!Array.isArray(r) || r.length < 2) continue;
      const item = r[0] | 0;
      const chance = Number(r[1]) || 0;
      const groupId = (r[2] | 0) || 0;
      if (groupId !== 0 || !isOutlierChance(chance)) continue;
      if (allowedItems && !allowedItems.has(item)) continue;
      const med = medians.get(item);
      if (med == null) continue;
      const signed = chance < 0 ? -med : med;
      if (signed === chance) continue;
      patches.push({ table: key, item, from: chance, to: signed });
      const copy = r.slice();
      copy[1] = signed;
      rows[i] = copy;
    }
  }

  return { next: compact, patches };
}
