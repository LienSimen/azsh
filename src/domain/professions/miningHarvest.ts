// Mineral-vein harvest count. Cite: LootMgr.cpp:1265-1304 Loot::Release chest refill;
// World.cpp:453-454 Rate.Mining.Amount / Next default 1.0.

import type { GatherNodeDef } from '../../data/schema.ts';
import type { LootDrop } from '../items/loot.ts';
import type { Rng } from '../../engine/core/rng.ts';

/** CMaNGOS default when LockEntry is missing. Cite: LootMgr.cpp:1284 ReqValue = 175. */
export const MINING_REFILL_REQ_DEFAULT = 175;

export function miningLockReqSkill(
  lock: { cases?: readonly { skill: number }[] } | undefined,
): number {
  const v = (lock?.cases?.[0]?.skill ?? 0) | 0;
  return v > 0 ? v : MINING_REFILL_REQ_DEFAULT;
}

export function miningVeinOpenRange(
  node: GatherNodeDef,
  chest?: { minSuccessOpens?: number; maxSuccessOpens?: number },
): { min: number; max: number } {
  const [nLo, nHi] = node.charges ?? [2, 4];
  const min = chest?.minSuccessOpens && chest.minSuccessOpens > 0 ? chest.minSuccessOpens : nLo;
  const max = chest?.maxSuccessOpens && chest.maxSuccessOpens >= min ? chest.maxSuccessOpens : nHi;
  return { min, max };
}

/** FillLoot taps this harvest: first Use plus each vein refill. */
export function miningHarvestTapCount(
  minSuccessOpens: number,
  maxSuccessOpens: number,
  miningSkill: number,
  lockReqSkill: number,
  rng: Rng,
): number {
  const goMin = minSuccessOpens | 0;
  const goMax = maxSuccessOpens | 0;
  // only vein pass this check. Cite: LootMgr.cpp:1270 go_min != 0 && go_max > go_min.
  if (goMin === 0 || goMax <= goMin) return 1;
  const minAmount = goMin;
  const maxAmount = goMax;
  let uses = 0;
  let taps = 1;
  for (;;) {
    uses += 1;
    if (uses >= maxAmount) break;
    if (uses >= minAmount) {
      const req = lockReqSkill > 0 ? lockReqSkill : MINING_REFILL_REQ_DEFAULT;
      const skill = miningSkill / (req + 25);
      const chance = (0.8) ** (4 * (1 / maxAmount) * uses);
      const pct = 100 * chance + skill;
      if (!rng.chance(pct / 100)) break;
    }
    taps += 1;
  }
  return taps;
}

/** Stack identical item (+ suffix) rows from successive FillLoot rolls. */
export function mergeLootDrops(drops: readonly LootDrop[]): LootDrop[] {
  const out: LootDrop[] = [];
  for (const d of drops) {
    const rp = d.randomPropertyId ?? 0;
    const hit = out.find((x) => x.item === d.item && (x.randomPropertyId ?? 0) === rp);
    if (hit) hit.count += d.count;
    else out.push({ ...d });
  }
  return out;
}
