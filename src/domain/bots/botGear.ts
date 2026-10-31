// Spawn gear for world bots — an offline port of the playerbot gear factory: quality band by level,
// equip-cache query, rank by stat weight, then equip the first candidate equipItem accepts.

import type { DataStore } from '../../data/dataStore.ts';
import type { EquipSlot, ItemDef } from '../../data/schema.ts';
import type { Character, EquippedMap } from '../character/character.ts';
import { equippedEntry } from '../items/itemInstance.ts';
import {
  equipItem, slotTargets, EQUIP_SLOTS, type EquipOpts,
} from '../items/equipment.ts';
import { CLASS } from '../../data/schema.ts';
import { hashSeed, mulberry32 } from '../../engine/core/rng.ts';
import { createItemInstance } from '../items/createItem.ts';
import {
  companionPlayerbotSpecId,
} from './playerbotStatWeight.ts';
import {
  EQUIP_GEAR_MAX_DIFF,
  rankedSlotCandidates,
  topWeightForSlot,
} from './playerbotEquipCache.ts';

/** @deprecated use EQUIP_GEAR_MAX_DIFF — kept for botPool tests */
export const GEAR_MAX_LEVEL_DIFF = EQUIP_GEAR_MAX_DIFF;

// Hire kit tiers (docs/archive/INN-COMPANION-HIRE-DESIGN.md §2). Same race/class/spec can appear under
// different profiles; the profile is the product.
export type GearProfile =
  | 'naked'
  | 'shabby'
  | 'field'
  | 'twink'
  | 'raid-mixed'
  | 'raid-t2'
  | 'raid-t3';

/** All kit profile ids in ascending product rank (design §2 / §3.3 order). */
export const GEAR_PROFILES: readonly GearProfile[] = [
  'naked',
  'shabby',
  'field',
  'twink',
  'raid-mixed',
  'raid-t2',
  'raid-t3',
] as const;

export function isGearProfile(v: unknown): v is GearProfile {
  return typeof v === 'string' && (GEAR_PROFILES as readonly string[]).includes(v);
}

// Default kit for inn hire until ICH3 slate stratification picks per face. Field = quest-ready peer; never
// epic at 60 (design §2.1 / D8).
export const DEFAULT_HIRE_GEAR_PROFILE: GearProfile = 'field';

/** True for raid luxury kits that may equip epic (quality 4). */
export function isRaidGearProfile(profile: GearProfile): boolean {
  return profile === 'raid-mixed' || profile === 'raid-t2' || profile === 'raid-t3';
}

/** Item qualities: 0 poor, 1 normal, 2 uncommon, 3 rare, 4 epic. */
type QualityBand = { min: number; max: number };

// Legacy playerbot quality band by level, the MANGOSBOT_ZERO progressive non-incremental band:
// <10 poor, <20 normal–uncommon, <60 uncommon–rare, ≥60 rare–epic. Used when no profile is given.
export function gearQualityBandLegacy(level: number): QualityBand {
  if (level < 10) return { min: 0, max: 0 }; // ITEM_QUALITY_POOR only
  if (level < 20) return { min: 1, max: 2 };
  if (level < 60) return { min: 2, max: 3 };
  return { min: 3, max: 4 }; // L60 classic: rare..epic
}

// Quality band for spawn gear: no profile is the legacy band, a non-raid profile caps at rare, a
// raid profile may epic, and `naked` is an empty band the caller answers with no paperdoll.
export function gearQualityBand(level: number, profile?: GearProfile): QualityBand {
  if (profile == null) return gearQualityBandLegacy(level);
  if (profile === 'naked') return { min: 0, max: -1 };

  const legacy = gearQualityBandLegacy(level);

  switch (profile) {
    case 'shabby':
      // White/grey, or weak greens trailing level — max uncommon (2).
      return { min: 0, max: 2 };
    case 'field': {
      // Normal greens / weak blues; rare (3) only at high levels; never epic.
      const max = level >= 40 ? 3 : 2;
      const min = Math.min(legacy.min, max);
      return { min, max };
    }
    case 'twink': {
      // Best-in-band for level (strong greens/blues); hard max rare (3).
      const max = 3;
      const min = Math.min(max, Math.max(legacy.min, level >= 20 ? 2 : 1));
      return { min, max };
    }
    case 'raid-mixed':
    case 'raid-t2':
    case 'raid-t3':
      // Epic (4) allowed. Near 60 prefer rare–epic package.
      if (level >= 58) return { min: 3, max: 4 };
      return { min: Math.min(legacy.min, 3), max: Math.max(legacy.max, 3) };
    default: {
      // Exhaustiveness guard — keep non-raid max ≤ rare.
      const _x: never = profile;
      void _x;
      return { min: legacy.min, max: Math.min(legacy.max, 3) };
    }
  }
}

// Bot Dual Wield capability by class and the trainer reqLevel of spell 674 — warrior and hunter
// at 20, rogue at 10. Companion kits learn trainer spells by level.
function botCanDualWield(char: Pick<Character, 'cls' | 'level'>): boolean {
  if (char.cls === CLASS.ROGUE) return char.level >= 10;
  if (char.cls === CLASS.WARRIOR || char.cls === CLASS.HUNTER) return char.level >= 20;
  return false;
}

/** Slot fill order — weapons first so armor value tilts follow the weapon choice. */
const GEAR_ORDER: EquipSlot[] = [
  'mainhand', 'offhand', 'ranged',
  'chest', 'legs', 'head', 'shoulder', 'hands', 'feet', 'waist', 'wrist', 'back',
  'neck', 'finger1', 'finger2', 'trinket1', 'trinket2',
];

// Quality try-order for one slot: desired first, then walk down to 0, then up to band.max. Mirrors
// InitEquipment empty-pool quality retry.
function qualityTryOrder(desired: number, bandMax: number): number[] {
  const tryOrder: number[] = [];
  for (let q = desired; q >= 0; q--) tryOrder.push(q);
  for (let q = desired + 1; q <= bandMax; q++) tryOrder.push(q);
  return tryOrder;
}

/** CreateItem at spawn — RandomProperty greens roll here, not as a bare entry. Cite: Item.cpp CreateItem. */
function spawnStack(entry: number, seed: number, ds: DataStore) {
  return createItemInstance(entry, 1, ds, mulberry32(hashSeed(seed, 19)), {
    lookupProp: (id) => ds.itemRandomProperty(id),
  });
}

// Generate a full spawn loadout, deterministic in `seed` and the optional profile, returning the
// equipped map without mutating char. A slot with no valid item at this level stays empty.
export function generateSpawnGear(
  char: Character,
  seed: number,
  ds: DataStore,
  profile?: GearProfile,
  // Playerbots weightscale id. When omitted it derives from char.talents / botSpecs via
  // companionPlayerbotSpecId when specIdx or role is on the shell, else the class default.
  opts?: {
    specId?: number;
    specIdx?: number;
    role?: string;
    // Target itemLevel window. The three raid-* profiles share one quality band, so before this a
    // T1 and a T3 39-man differed by 11 of 760 pieces. A slot with nothing in-band keeps its best.
    itemLevel?: { min: number; max: number };
  },
): EquippedMap {
  const band = gearQualityBand(char.level, profile);
  // Naked kit: empty paperdoll; companionSpellbook / combat skills still full at level.
  if (profile === 'naked' || band.max < 0) return {};

  const specId = opts?.specId
    ?? companionPlayerbotSpecId(char.cls, opts?.specIdx, opts?.role, ds);

  let work: Character = { ...char, equipped: {} };
  const equipOpts: EquipOpts = { canDualWield: botCanDualWield(char) };
  // Tier gear is a FLOOR, not a window. A hard ceiling made the ladder non-monotone: T3's 83-92
  // band excluded the ilvl 76-82 epics, so those slots fell back to greens — T2 71, T3 68.
  const floor = opts?.itemLevel?.min;
  const accept = floor != null
    ? (it: ItemDef): boolean => (it.itemLevel ?? 0) >= floor
    : undefined;

  for (const slot of GEAR_ORDER) {
    if (work.equipped[slot] != null) continue;
    if (slot === 'offhand') {
      const mhEntry = equippedEntry(work.equipped.mainhand);
      const mh = mhEntry != null ? ds.item(mhEntry) : undefined;
      if (mh?.slot === 'twohand') continue; // two-hander claims both hands
    }

    const slotSeed = hashSeed(seed, EQUIP_SLOTS.indexOf(slot) + 101);
    const span = band.max - band.min + 1;
    const desired = band.min + (Math.abs(slotSeed) % span);
    const tryOrder = qualityTryOrder(desired, band.max);

    const worn = new Set(
      Object.values(work.equipped).map(equippedEntry).filter((e): e is number => e != null),
    );

    // Prefer pure top-weight via cache (searchLevel walk inside topWeightForSlot).
    // Fall back to walking ranked list + equipItem when the top item fails proficiency.
    let done = false;
    // Two passes: the tier floor over the whole quality × searchLevel walk, then the same walk
    // unfiltered. The tier raises the floor; it never strips the paperdoll.
    const top = (accept && topWeightForSlot(ds, char.level, char.cls, specId, slot, tryOrder, worn, { accept }))
      || topWeightForSlot(ds, char.level, char.cls, specId, slot, tryOrder, worn);
    if (top) {
      const inv = { stacks: [spawnStack(top.entry, slotSeed, ds)] };
      const r = equipItem(work, inv, ds, top.entry, slot, equipOpts);
      if (r.ok) {
        work = r.char;
        done = true;
      }
    }
    if (!done) {
      // Walk full ranked lists per quality until equipItem accepts (skill gate).
      for (const quality of tryOrder) {
        if (done) break;
        let searchLevel = char.level;
        while (searchLevel > 0 && !done) {
          const inBand = accept
            ? rankedSlotCandidates(ds, char.level, char.cls, specId, slot, quality, worn, { searchLevel, accept })
            : [];
          const cands = inBand.length
            ? inBand
            : rankedSlotCandidates(ds, char.level, char.cls, specId, slot, quality, worn, { searchLevel });
          for (const it of cands) {
            const inv = { stacks: [spawnStack(it.entry, slotSeed, ds)] };
            const r = equipItem(work, inv, ds, it.entry, slot, equipOpts);
            if (r.ok) {
              work = r.char;
              done = true;
              break;
            }
          }
          if (cands.length > 0) break; // had candidates; equip failed for other reasons
          searchLevel--;
          if (char.level - searchLevel > EQUIP_GEAR_MAX_DIFF + EQUIP_CACHE_WALK) break;
        }
      }
    }
  }
  return work.equipped;
}

/** Extra searchLevel walk budget beyond maxDiff (cache window padding). */
const EQUIP_CACHE_WALK = 16;

/** slotTargets re-export spot-check helper (kept for tests). */
export { slotTargets };

/** Re-export cache helpers tests/audit may want without a second import. */
export type { ItemDef };
export { rankedSlotCandidates, topWeightForSlot };
