// Offline port of the playerbots RandomItemMgr equip cache and the InitEquipment candidate walk.
// The membership rules are rebuilt in-process, then ranked by GetStatWeight + Quality×ItemLevel.

import type { DataStore } from '../../data/dataStore.ts';
import type { EquipSlot, ItemDef } from '../../data/schema.ts';
import { CLASS } from '../../data/schema.ts';
import { playerbotFactoryItemEligible } from './playerbotItemEligibility.ts';
import { canEquipRelic } from '../items/relic.ts';
import {
  calculateStatWeight,
  playerbotEquipScore,
  playerbotWeightScale,
} from './playerbotStatWeight.ts';

// BuildEquipCache: abs(minLevel − botLevel) ≤ 20 keeps the item in the cache list. Cite: RandomItemMgr.cpp
// BuildEquipCache ~3460.
export const EQUIP_CACHE_LEVEL_WINDOW = 20;

// AiPlayerbot.RandomGearMaxDiff (conf default 9): when equipping, reject items whose required level is more
// than this many levels below the bot. Cite: PlayerbotFactory InitEquipment ~3368.
export const EQUIP_GEAR_MAX_DIFF = 9;

// ---- min level / quality index ---------------------------------------------

/** Required level used by the factory (proto RequiredLevel or min-level cache). */
export function itemMinLevel(it: ItemDef): number {
  if (it.requiredLevel > 0) return it.requiredLevel;
  return it.itemLevel ?? 0;
}

type CatalogIndex = {
  catalogSize: number;
  /** Eligible factory items grouped by quality. */
  byQuality: Map<number, ItemDef[]>;
  /** Items of one quality that fit one paperdoll slot, filled on first ask. */
  slotPools: Map<string, ItemDef[]>;
  /** BuildEquipCache result per level|cls|spec|slot|quality — dropped with the catalog it read. */
  queries: Map<string, readonly ItemDef[]>;
};

const CATALOG = new WeakMap<DataStore, CatalogIndex>();

function catalog(ds: DataStore): CatalogIndex {
  const catalogSize = ds.items().length;
  const cached = CATALOG.get(ds);
  if (cached && cached.catalogSize === catalogSize) return cached;
  const byQuality = new Map<number, ItemDef[]>();
  for (const it of ds.items()) {
    if (!playerbotFactoryItemEligible(it)) continue;
    if (it.notObtainable) continue;
    // BuildEquipCache only stores weapon/armor/container/projectile — we skip bags.
    if (it.slot === 'bag' || it.slot === 'shirt') continue;
    const q = it.quality ?? 0;
    let arr = byQuality.get(q);
    if (!arr) byQuality.set(q, (arr = []));
    arr.push(it);
  }
  const idx: CatalogIndex = { catalogSize, byQuality, slotPools: new Map(), queries: new Map() };
  CATALOG.set(ds, idx);
  return idx;
}

// viableSlots is a property of the item alone, so bucket by it once instead of re-testing every
// item of a quality on every query. Cite: RandomItemMgr ctor, which builds viableSlots up front.
function slotPool(idx: CatalogIndex, quality: number, slot: EquipSlot): ItemDef[] {
  const key = `${quality}|${slot}`;
  let pool = idx.slotPools.get(key);
  if (!pool) {
    pool = (idx.byQuality.get(quality) ?? []).filter((it) => itemFitsEquipSlot(slot, it));
    idx.slotPools.set(key, pool);
  }
  return pool;
}

// ---- viableSlots / CanEquipItem slot membership ----------------------------

/** True when `it` may fill this paperdoll slot (viableSlots map). Cite: RandomItemMgr ctor viableSlots. */
export function itemFitsEquipSlot(slot: EquipSlot, it: ItemDef): boolean {
  const s = it.slot;
  if (!s || s === 'bag') return false;
  switch (slot) {
    case 'head': return s === 'head';
    case 'neck': return s === 'neck';
    case 'shoulder': return s === 'shoulder';
    case 'back': return s === 'back';
    case 'chest': return s === 'chest';
    case 'shirt': return s === 'shirt';
    case 'wrist': return s === 'wrist';
    case 'hands': return s === 'hands';
    case 'waist': return s === 'waist';
    case 'legs': return s === 'legs';
    case 'feet': return s === 'feet';
    case 'finger1':
    case 'finger2':
      return s === 'finger';
    case 'trinket1':
    case 'trinket2':
      return s === 'trinket';
    case 'mainhand':
      // INVTYPE_WEAPON | 2HWEAPON | WEAPONMAINHAND
      return s === 'mainhand' || s === 'twohand';
    case 'offhand':
      // Classic off-hand: SHIELD | WEAPONOFFHAND | HOLDABLE | INVTYPE_WEAPON via canOffhand.
      // NOT WEAPONMAINHAND-only and NOT 2H — Titan's Grip is WotLK.
      if (s === 'offhand') return true;
      // INVTYPE_WEAPON (13) only — mainhand-only 1H must never land in OH (two "main hands").
      if (s === 'mainhand') return it.canOffhand === true;
      return false;
    case 'ranged':
      return s === 'ranged';
    default:
      return false;
  }
}

export const BODY_ARMOR_SLOTS = new Set<EquipSlot>([
  'head', 'shoulder', 'chest', 'waist', 'legs', 'feet', 'wrist', 'hands',
]);

// CanEquipArmor — the classic progressive armor tier by class, spec and level. Cloth casters are
// NOT hard-filtered here, because the weightscales already zero the wrong armor.
export function canEquipArmor(
  cls: number,
  specId: number,
  level: number,
  it: ItemDef,
): boolean {
  if (it.slot === 'back') return true;
  const sub = it.armorSubclass;

  // Shield always ok for Warr/Pally/Shaman (before tier checks)
  if (sub === 6 || it.typeName === 'Shield') {
    return cls === CLASS.WARRIOR || cls === CLASS.PALADIN || cls === CLASS.SHAMAN;
  }

  // Holy paladin = weightscale id 4 — exempt from plate force
  const isHolyPally = cls === CLASS.PALADIN && specId === 4;
  // C++: (shaman && spec != 21) for mail@40 — enhance 21 skips mail force
  const isEnhanceShaman = cls === CLASS.SHAMAN && specId === 21;
  // C++: druid && !(spec == 29 || 31) → leather force (resto 29 / balance 31 exempt)
  const isCasterDruid = cls === CLASS.DRUID && (specId === 29 || specId === 31);

  if ((cls === CLASS.WARRIOR || (cls === CLASS.PALADIN && !isHolyPally)) && level >= 40) {
    if (sub != null && sub !== 4) return false; // plate
  }

  if (
    ((cls === CLASS.WARRIOR || (cls === CLASS.PALADIN && !isHolyPally)) && level < 40)
    || ((cls === CLASS.HUNTER || (cls === CLASS.SHAMAN && !isEnhanceShaman)) && level >= 40)
  ) {
    if (sub != null && sub !== 3) return false; // mail
  }

  if (
    ((cls === CLASS.HUNTER || cls === CLASS.SHAMAN) && level < 40)
    || ((cls === CLASS.DRUID && !isCasterDruid) || cls === CLASS.ROGUE)
  ) {
    if (sub != null && sub !== 2) return false; // leather
  }

  // Quality ≤ normal early-out in C++ is always true after the above; keep same.
  return true;
}

/** Weight memo: specId|entry|hasSpellResolver → GetStatWeight (0 if unusable). */
const WEIGHT_MEMO = new Map<string, number>();

// `ds` is what lets CalculateStatWeight price an on-use or proc payload; a call without one scores
// baked stats alone, so it memoises under its own key rather than answering for both.
function statWeight(cls: number, specId: number, it: ItemDef, ds?: DataStore): number {
  const key = `${cls}|${specId}|${it.entry}|${ds ? 1 : 0}`;
  const hit = WEIGHT_MEMO.get(key);
  if (hit !== undefined) return hit;
  const w = calculateStatWeight(cls, specId, it, ds ? { spell: (id) => ds.spell(id) } : undefined);
  WEIGHT_MEMO.set(key, w);
  // Bound memo growth in long test runs
  if (WEIGHT_MEMO.size > 200_000) WEIGHT_MEMO.clear();
  return w;
}

// BuildEquipCache membership for one (level, class, spec, slot, quality) key, memoised on it like
// the C++ cache. Unsorted — caller ranks. Cite: RandomItemMgr::BuildEquipCache inner loop.
export function queryEquipCache(
  ds: DataStore,
  level: number,
  cls: number,
  specId: number,
  slot: EquipSlot,
  quality: number,
): readonly ItemDef[] {
  const scale = playerbotWeightScale(specId);
  if (!scale || scale.classId !== cls) return [];

  const idx = catalog(ds);
  const key = `${level}|${cls}|${specId}|${slot}|${quality}`;
  const hit = idx.queries.get(key);
  if (hit) return hit;

  const out: ItemDef[] = [];
  for (const it of slotPool(idx, quality, slot)) {
    const w = statWeight(cls, specId, it, ds);
    if (w <= 0) continue;
    // only accept "useless" weight==1 if bot level ≤ 30
    if (w === 1 && level > 30) continue;

    const minLvl = itemMinLevel(it);
    if (minLvl > level) continue;
    if (Math.abs(minLvl - level) > EQUIP_CACHE_LEVEL_WINDOW) continue;

    if (BODY_ARMOR_SLOTS.has(slot) && !canEquipArmor(cls, specId, level, it)) continue;
    if (!canEquipRelic({ cls }, it).ok) continue;

    // Rogue OH must be a weapon
    if (slot === 'offhand' && cls === CLASS.ROGUE && !it.weapon) continue;

    out.push(it);
  }
  if (idx.queries.size > 50_000) idx.queries.clear();
  idx.queries.set(key, out);
  return out;
}

// InitEquipment sort for non-progressive gear: best GetStatWeight first, then Quality×ItemLevel,
// returned descending as a new array. Cite: PlayerbotFactory.cpp sort + reverse.
export function rankEquipCandidates(
  cls: number,
  specId: number,
  items: ItemDef[],
  ds?: DataStore,
): ItemDef[] {
  return [...items].sort((a, b) => {
    const wa = statWeight(cls, specId, a, ds);
    const wb = statWeight(cls, specId, b, ds);
    if (wa !== wb) return wb - wa;
    const ta = (a.quality ?? 0) * (a.itemLevel ?? 0);
    const tb = (b.quality ?? 0) * (b.itemLevel ?? 0);
    if (ta !== tb) return tb - ta;
    return a.entry - b.entry;
  });
}

// Live InitEquipment gates applied while walking the ranked list (after Query). Does not re-check cache
// membership. Cite: PlayerbotFactory::InitEquipment filters after Query (~3330–3450).
export function initEquipmentLiveOk(
  it: ItemDef,
  slot: EquipSlot,
  cls: number,
  specId: number,
  botLevel: number,
  worn: ReadonlySet<number>,
  ds?: DataStore,
): boolean {
  if (worn.has(it.entry)) return false;

  // randomGearMaxDiff
  const req = itemMinLevel(it);
  if (req > 0 && (it.quality ?? 0) < 5) {
    if (Math.abs(botLevel - req) > EQUIP_GEAR_MAX_DIFF) return false;
  }

  // Tank OH = shield only (prot warrior 3, prot paladin 5)
  if (slot === 'offhand' && (specId === 3 || specId === 5)) {
    if (!(it.armorSubclass === 6 || it.typeName === 'Shield')) return false;
  }
  // Tank MH = weapon, not shield/holdable
  if (slot === 'mainhand' && (specId === 3 || specId === 5)) {
    if (it.armorSubclass === 6 || it.typeName === 'Shield') return false;
    if (!it.weapon && it.slot !== 'mainhand' && it.slot !== 'twohand') return false;
    if (it.slot === 'offhand' && !it.weapon) return false; // holdable
  }
  if (slot === 'mainhand' && it.slot === 'offhand' && !it.weapon) return false; // holdable MH

  // Fury (spec 2): slow MH ≥ 2.0s
  if (slot === 'mainhand' && specId === 2 && it.weapon) {
    if ((it.weapon.delayMs || 0) < 2000) return false;
  }

  // Classic enhance (21) / retri (6) at 60+: 2H ≥ 3.0s
  if (
    slot === 'mainhand'
    && (specId === 6 || specId === 21)
    && botLevel >= 60
    && it.slot === 'twohand'
    && it.weapon
    && (it.weapon.delayMs || 0) < 3000
  ) {
    return false;
  }

  // Positive live weight
  if (statWeight(cls, specId, it, ds) <= 0) return false;

  return true;
}

// Query and rank for one slot and quality at bot level, then apply the live maxDiff filter,
// best first. Also merges the extra MH sources InitEquipment uses for tanks and casters.
export function rankedSlotCandidates(
  ds: DataStore,
  botLevel: number,
  cls: number,
  specId: number,
  slot: EquipSlot,
  quality: number,
  worn: ReadonlySet<number>,
  opts?: { searchLevel?: number; accept?: (it: ItemDef) => boolean },
): ItemDef[] {
  const searchLevel = opts?.searchLevel ?? botLevel;
  const seen = new Set<number>();
  const raw: ItemDef[] = [];

  const pushAll = (list: readonly ItemDef[]) => {
    for (const it of list) {
      if (seen.has(it.entry)) continue;
      seen.add(it.entry);
      raw.push(it);
    }
  };

  pushAll(queryEquipCache(ds, searchLevel, cls, specId, slot, quality));

  // InitEquipment: tank MH also pulls OH-query one-handers
  if (slot === 'mainhand' && (specId === 3 || specId === 5)) {
    pushAll(queryEquipCache(ds, searchLevel, cls, specId, 'offhand', quality));
  }
  // Dual wield: rogue or fury (spec 2) MH also pulls OH weapons
  if (slot === 'mainhand' && (cls === CLASS.ROGUE || specId === 2)) {
    pushAll(queryEquipCache(ds, searchLevel, cls, specId, 'offhand', quality));
  }
  // Casters: holy pally (4), druids, priest, mage, warlock — MH pulls OH (holdables)
  if (
    slot === 'mainhand'
    && (
      specId === 4
      || cls === CLASS.DRUID
      || cls === CLASS.PRIEST
      || cls === CLASS.MAGE
      || cls === CLASS.WARLOCK
      || specId === 20
      || specId === 22
    )
  ) {
    pushAll(queryEquipCache(ds, searchLevel, cls, specId, 'offhand', quality));
  }

  const ranked = rankEquipCandidates(cls, specId, raw, ds);
  const live = ranked.filter(
    (it) => initEquipmentLiveOk(it, slot, cls, specId, botLevel, worn, ds),
  );
  // `accept` narrows WITHOUT changing the ranking, and is STRICT on purpose: a per-call fallback
  // would answer at the first searchLevel and never look further for an in-band item.
  return opts?.accept ? live.filter(opts.accept) : live;
}

// Top-weight item for one slot (best first that passes live gates), walking quality try-order and
// searchLevel downward like InitEquipment. Returns undefined when the cache has nothing equippable.
export function topWeightForSlot(
  ds: DataStore,
  botLevel: number,
  cls: number,
  specId: number,
  slot: EquipSlot,
  qualityTryOrder: readonly number[],
  worn: ReadonlySet<number>,
  opts?: { accept?: (it: ItemDef) => boolean },
): ItemDef | undefined {
  for (const quality of qualityTryOrder) {
    let searchLevel = botLevel;
    while (searchLevel > 0) {
      const cands = rankedSlotCandidates(ds, botLevel, cls, specId, slot, quality, worn, {
        searchLevel,
        ...(opts?.accept ? { accept: opts.accept } : {}),
      });
      if (cands.length > 0) return cands[0];
      // Lower search level when cache empty at this quality (InitEquipment currSearchLevel--)
      searchLevel--;
      // Don't walk forever — cache window is 20; going more than botLevel is enough
      if (botLevel - searchLevel > EQUIP_CACHE_LEVEL_WINDOW + 5) break;
    }
  }
  return undefined;
}

/** Debug / audit: best-in-slot map for a class/spec/level (paperdoll keys → item). */
export function dumpTopWeightLoadout(
  ds: DataStore,
  botLevel: number,
  cls: number,
  specId: number,
  qualityBand: { min: number; max: number },
  slots: readonly EquipSlot[],
): Partial<Record<EquipSlot, ItemDef>> {
  const worn = new Set<number>();
  const out: Partial<Record<EquipSlot, ItemDef>> = {};
  const tryOrder: number[] = [];
  for (let q = qualityBand.max; q >= qualityBand.min; q--) tryOrder.push(q);
  for (let q = qualityBand.min - 1; q >= 0; q--) tryOrder.push(q);

  for (const slot of slots) {
    if (slot === 'offhand' && out.mainhand?.slot === 'twohand') continue;
    const it = topWeightForSlot(ds, botLevel, cls, specId, slot, tryOrder, worn);
    if (!it) continue;
    out[slot] = it;
    worn.add(it.entry);
  }
  return out;
}

/** Export score helper for tests (weight + Q×ilvl). */
export function cacheEquipScore(cls: number, specId: number, it: ItemDef): number {
  return playerbotEquipScore(cls, specId, it);
}
