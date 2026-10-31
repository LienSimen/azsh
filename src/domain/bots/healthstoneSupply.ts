// Warlock healthstone supply — the stone run before the pull. A stone is made one at a time and
// traded away, so a raid's supply is bounded by the SHARD bag. Cite: Warlock.cpp:107-174.

import type { DataStore } from '../../data/dataStore.ts';
import type { ItemDef, SpellDef } from '../../data/schema.ts';
import {
  CREATE_HEALTHSTONE_SPELL_IDS,
  healthstoneItemType,
  improvedHealthstoneRankFromTalents,
} from '../../engine/spells/interpreter/index.ts';
import { SOUL_SHARD_ITEM } from '../core/ids.ts';
import { resolveStandYards, wantsMeleeStand } from '../rotation/stand.ts';

// Shards one warlock keeps back from the stone run — a shard also buys a re-summoned demon and a
// soulstone refresh, and a warlock who spent the bag cannot put its pet back after a wipe.
export const HEALTHSTONE_SHARD_RESERVE = 2;

// Longest stone run one warlock will do at a single stop. Past this the raid is standing still watching
// conjure animations; 20 covers a 40-man's tanks and melee, which is the group the shards must reach first.
export const HEALTHSTONE_MAX_PER_SUPPLIER = 20;

// True when this item IS a healthstone, read off the row: conjured, unique, an in-combat health
// restore, bagged and obtainable. No name match — all 15 rows pass and the alpha leftovers do not.
export function isHealthstoneItem(it: ItemDef | undefined | null): boolean {
  if (!it) return false;
  if (it.conjured !== true || it.notObtainable === true || it.slot != null) return false;
  if ((it.maxCount ?? 0) !== 1) return false;
  return it.useInCombat?.effect === 'restore_health';
}

/** The healthstone already in this bag, or 0 when there is none. */
export function healthstoneIn(
  entries: readonly { item: number; count: number }[],
  itemOf: (entry: number) => ItemDef | undefined,
): number {
  for (const e of entries) {
    if (e.count > 0 && isHealthstoneItem(itemOf(e.item))) return e.item;
  }
  return 0;
}

/** One warlock considered as the party's stone supplier. */
export interface HealthstoneSupplier {
  name: string;
  level: number;
  knownSpellIds: readonly number[];
  /** Improved Healthstone reads off these — talent ranks first, then live auras. */
  talents?: Readonly<Record<number, number>> | undefined;
  auraSpellIds?: readonly number[] | undefined;
  /** Soul Shards on hand right now. */
  shards: number;
}

/** One party/raid member the run may hand a stone to. */
export interface HealthstoneRecipient {
  name: string;
  level: number;
  /** Queue tier from {@link healthstoneQueueTier} — 0 tank, 1 melee, 2 ranged. */
  tier: number;
  /** Stone this member already carries (0 = none). A second one cannot be accepted. */
  carries: number;
}

/** One conjure-and-trade: the cast, the stone it makes, and who ends up holding it. */
export interface HealthstoneHandout {
  warlockName: string;
  targetName: string;
  createSpellId: number;
  item: number;
  soulShards: number;
}

export interface HealthstoneRun {
  handouts: HealthstoneHandout[];
  /** Members the shards did not reach, in queue order — the honest shortfall. */
  short: string[];
}

// Where a member sits in the stone queue: tanks first, then melee, then range. Melee is
// `resolveStandYards`, the same decider motion uses, so a feral druid lands on the right side.
export function healthstoneQueueTier(member: {
  role?: 'tank' | 'healer' | 'dps';
  classId?: number;
  specName?: string | null;
  rangedAuto?: boolean;
  offenseYd?: number | null;
}): number {
  if (member.role === 'tank') return 0;
  const stand = resolveStandYards({
    classId: member.classId,
    groupRole: member.role === 'dps' ? 'damage' : member.role,
    rangedAuto: member.rangedAuto,
    specName: member.specName,
    offenseYd: member.offenseYd,
  });
  return wantsMeleeStand(stand) ? 1 : 2;
}

// Best Create Healthstone rank `supplier` can cast that makes a stone `recipientLevel` may use —
// two floors, the spell's against the WARLOCK and the item's against the RECIPIENT.
export function bestCreateHealthstoneFor(
  supplier: HealthstoneSupplier,
  recipientLevel: number,
  spellOf: (id: number) => SpellDef | undefined,
  itemOf: (entry: number) => ItemDef | undefined,
  talentOf: (id: number) => { ranks?: ReadonlyArray<{ spellId?: number }> } | undefined | null,
): { spellId: number; item: number; soulShards: number } | null {
  const rank = improvedHealthstoneRankFromTalents(
    supplier.talents ?? null,
    talentOf,
    supplier.auraSpellIds ?? null,
  );
  const known = new Set(supplier.knownSpellIds.map((id) => id | 0));
  let best: { spellId: number; item: number; soulShards: number; lvl: number } | null = null;
  for (const id of CREATE_HEALTHSTONE_SPELL_IDS) {
    if (!known.has(id)) continue;
    const s = spellOf(id);
    if (!s) continue;
    const lvl = s.spellLevel ?? 0;
    if (lvl > supplier.level) continue;
    const item = healthstoneItemType(id, rank);
    const def = itemOf(item);
    if (!isHealthstoneItem(def) || def == null) continue;
    if ((def.requiredLevel | 0) > recipientLevel) continue;
    const shards = s.reagents?.find((r) => r.item === SOUL_SHARD_ITEM)?.count ?? 0;
    if (!best || lvl > best.lvl) best = { spellId: id, item, soulShards: shards, lvl };
  }
  return best ? { spellId: best.spellId, item: best.item, soulShards: best.soulShards } : null;
}

// Plan the whole stone run for one stop: recipients in queue order, one stone each, and a supplier
// stops at its shard reserve or its own cap. Anyone the shards did not reach comes back in `short`.
export function planHealthstoneRun(args: {
  suppliers: readonly HealthstoneSupplier[];
  recipients: readonly HealthstoneRecipient[];
  spellOf: (id: number) => SpellDef | undefined;
  itemOf: (entry: number) => ItemDef | undefined;
  talentOf: (id: number) => { ranks?: ReadonlyArray<{ spellId?: number }> } | undefined | null;
  /** Override the per-supplier cap (a five-man never needs 20). */
  maxPerSupplier?: number;
  shardReserve?: number;
}): HealthstoneRun {
  const cap = args.maxPerSupplier ?? HEALTHSTONE_MAX_PER_SUPPLIER;
  const reserve = args.shardReserve ?? HEALTHSTONE_SHARD_RESERVE;
  const budget = args.suppliers.map((s) => ({ supplier: s, shards: s.shards, made: 0 }));
  const queue = args.recipients
    .map((r, seat) => ({ r, seat }))
    .sort((a, b) => a.r.tier - b.r.tier || a.seat - b.seat);

  const handouts: HealthstoneHandout[] = [];
  const short: string[] = [];
  for (const { r } of queue) {
    if (r.carries > 0) continue;
    let served = false;
    for (const b of budget) {
      if (b.made >= cap) continue;
      const make = bestCreateHealthstoneFor(
        b.supplier,
        r.level,
        args.spellOf,
        args.itemOf,
        args.talentOf,
      );
      if (!make) continue;
      if (b.shards - make.soulShards < reserve) continue;
      b.shards -= make.soulShards;
      b.made += 1;
      handouts.push({
        warlockName: b.supplier.name,
        targetName: r.name,
        createSpellId: make.spellId,
        item: make.item,
        soulShards: make.soulShards,
      });
      served = true;
      break;
    }
    if (!served) short.push(r.name);
  }
  return { handouts, short };
}

/** Total heal the run put in the raid's bags — what the stones are worth if every one is spent. */
export function healthstoneRunHeal(
  run: HealthstoneRun,
  itemOf: (entry: number) => ItemDef | undefined,
): number {
  let total = 0;
  for (const h of run.handouts) total += itemOf(h.item)?.useInCombat?.min ?? 0;
  return total;
}

/** DataStore-shaped `talentOf` for callers that already hold a store. */
export function talentLookupOf(
  ds: DataStore,
): (id: number) => { ranks?: ReadonlyArray<{ spellId?: number }> } | undefined | null {
  return (id: number) => ds.talent(id);
}
