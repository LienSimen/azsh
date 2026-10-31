// Pre-pull healthstone run, the engine half of the bot supply module: each warlock conjures a stone
// per member and trades it over, tanks first, until the shards run out. One stone and one shard each.
import type { DataStore } from '../../data/dataStore.ts';
import type { Character } from '../../domain/character/character.ts';
import { canFitWithBagFamily } from '../../domain/items/ammo.ts';
import { CLASS } from '../../data/schema/constants.ts';
import {
  healthstoneIn,
  healthstoneQueueTier,
  planHealthstoneRun,
  talentLookupOf,
  type HealthstoneRecipient,
  type HealthstoneRun,
  type HealthstoneSupplier,
} from '../../domain/bots/healthstoneSupply.ts';
import { classUsesRangedAuto, SOUL_SHARD_ITEM } from '../../domain/core/ids.ts';
import { addItem, countItem, emptyInventory, removeItem, type Inventory } from '../../domain/items/inventory.ts';

/** One party/raid member as this run sees them: a bag to read, a bag to write, and a role. */
export interface StoneHolder {
  name: string;
  char: Character;
  role: 'tank' | 'healer' | 'dps';
  /** Talent-tree name for the melee/ranged split (rotation autoSig or the bot spec). */
  specName?: string | null;
  /** Spells this member knows — only warlocks are read for Create Healthstone. */
  knownSpellIds: readonly number[];
  /** Auras carried in, so Improved Healthstone resolves off a live aura too. */
  auraSpellIds?: readonly number[];
  bag: () => Inventory;
  setBag: (inv: Inventory) => void;
}

export interface HealthstoneRunResult extends HealthstoneRun {
  /** The stone the player ended up holding, 0 when they got none. */
  playerItem: number;
  /** Companions handed a stone. */
  fedCompanions: number;
}

// Conjure and hand out the stones, mutating each holder's bag. The supplier pays a Soul Shard per
// stone and nobody is handed a second one; `playerName` marks the handout worth its own feed line.
export function runPrePullHealthstones(
  holders: readonly StoneHolder[],
  ds: DataStore,
  playerName: string,
  opts?: { maxPerSupplier?: number; shardReserve?: number },
): HealthstoneRunResult {
  const itemOf = (entry: number) => ds.item(entry);
  const suppliers: HealthstoneSupplier[] = [];
  const byName = new Map<string, StoneHolder>();
  const recipients: HealthstoneRecipient[] = [];

  for (const h of holders) {
    byName.set(h.name, h);
    const bag = h.bag();
    if (h.char.cls === CLASS.WARLOCK) {
      suppliers.push({
        name: h.name,
        level: h.char.level,
        knownSpellIds: h.knownSpellIds,
        talents: h.char.talents,
        auraSpellIds: h.auraSpellIds,
        shards: countItem(bag, SOUL_SHARD_ITEM),
      });
    }
    recipients.push({
      name: h.name,
      level: h.char.level,
      tier: healthstoneQueueTier({
        role: h.role,
        classId: h.char.cls,
        specName: h.specName ?? null,
        rangedAuto: classUsesRangedAuto(h.char.cls),
      }),
      carries: healthstoneIn(bag.stacks, itemOf),
    });
  }
  if (!suppliers.length) return { handouts: [], short: [], playerItem: 0, fedCompanions: 0 };

  const run = planHealthstoneRun({
    suppliers,
    recipients,
    spellOf: (id) => ds.spell(id),
    itemOf,
    talentOf: talentLookupOf(ds),
    ...(opts?.maxPerSupplier != null ? { maxPerSupplier: opts.maxPerSupplier } : {}),
    ...(opts?.shardReserve != null ? { shardReserve: opts.shardReserve } : {}),
  });

  const handouts: HealthstoneRun['handouts'] = [];
  let playerItem = 0;
  let fedCompanions = 0;
  for (const h of run.handouts) {
    const warlock = byName.get(h.warlockName);
    const target = byName.get(h.targetName);
    if (!warlock || !target) continue;
    // Bag full: the stone is never conjured, so the shard is not spent either.
    const targetBag = target.bag();
    if (!canFitWithBagFamily(targetBag, target.char, ds, h.item, 1, 1)) continue;
    if (h.soulShards > 0) {
      const [next, took] = removeItem(warlock.bag(), SOUL_SHARD_ITEM, h.soulShards);
      if (took < h.soulShards) continue;
      warlock.setBag(next);
    }
    // Re-read: warlock and target are the same holder when a warlock stones itself.
    target.setBag(addItem(target.bag(), h.item, 1, 1));
    handouts.push(h);
    if (h.targetName === playerName) playerItem = h.item;
    else fedCompanions += 1;
  }
  return { handouts, short: run.short, playerItem, fedCompanions };
}

/** Feed lines for one run, in the voice the conjured-provision lines already use. */
export function healthstoneRunLog(
  result: HealthstoneRunResult,
  ds: DataStore,
  playerName: string,
): string[] {
  const out: string[] = [];
  const mine = result.handouts.find((h) => h.targetName === playerName);
  if (mine) {
    out.push(`${mine.warlockName} conjures a ${ds.item(mine.item)?.name ?? 'Healthstone'} for you.`);
  }
  if (result.fedCompanions) out.push(`${result.fedCompanions} companions get healthstones.`);
  if (result.short.length) {
    out.push(`Out of Soul Shards: ${result.short.length} without a healthstone.`);
  }
  return out;
}

/** A holder view over a plain inventory box (the player, or a companion's `bags`). */
export function stoneHolder(args: {
  name: string;
  char: Character;
  role: 'tank' | 'healer' | 'dps';
  specName?: string | null;
  knownSpellIds: readonly number[];
  auraSpellIds?: readonly number[];
  read: () => Inventory | undefined;
  write: (inv: Inventory) => void;
}): StoneHolder {
  return {
    name: args.name,
    char: args.char,
    role: args.role,
    specName: args.specName ?? null,
    knownSpellIds: args.knownSpellIds,
    ...(args.auraSpellIds ? { auraSpellIds: args.auraSpellIds } : {}),
    bag: () => args.read() ?? emptyInventory(),
    setBag: args.write,
  };
}
