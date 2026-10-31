// World-bot / companion spawn inventory — a faithful port of the playerbots PlayerbotFactory and
// RandomItemMgr classic branch. Pure and deterministic; item ids absent from the bake are skipped.

import type { DataStore } from '../../data/dataStore.ts';
import type { ItemDef } from '../../data/schema.ts';
import { CLASS } from '../../data/schema.ts';
import type { Character, EquippedMap } from '../character/character.ts';
import { equippedEntry, type ItemInstance } from '../items/itemInstance.ts';
import { applyBindToInstance, resolveBonding, shouldBindOnTrigger } from '../items/itemBonding.ts';
import { classPowerType } from '../core/ids.ts';
import type { Inventory } from '../items/inventory.ts';
import { ITEM_CLASS_CONSUMABLE, addInstance, addItem, emptyInventory } from '../items/inventory.ts';
import { BAG_SLOTS, equipItem } from '../items/equipment.ts';
import {
  ITEM_CLASS_PROJECTILE,
  ITEM_SUBCLASS_ARROW,
  ITEM_SUBCLASS_BULLET,
  ITEM_SUBCLASS_WEAPON_BOW,
  ITEM_SUBCLASS_WEAPON_CROSSBOW,
  ITEM_SUBCLASS_WEAPON_GUN,
  weaponSubclassOf,
} from '../items/ammo.ts';
import { initInventorySkill } from './botProfessions.ts';
import type { Rng } from '../../engine/core/rng.ts';
import { mulberry32, hashSeed } from '../../engine/core/rng.ts';

/** Traveler's Backpack — classic InitBags (`StoreNewItemInBestSlots(4500, 1)`). */
export const TRAVELERS_BACKPACK = 4500;

// Full Randomize money: `bot->SetMoney(10000 * urand(1, level * 5))`. Cite: PlayerbotFactory.cpp Randomize
// (non-incremental branch).
export function botSpawnGold(level: number, rng: Rng): number {
  const lvl = Math.max(1, Math.min(60, level | 0));
  return 10_000 * rng.int(1, lvl * 5);
}

// ---- RandomItemMgr::GetFood (classic) ---------------------------------------
// Cite: RandomItemMgr.cpp GetFood — category 11 food, 59 drink.

const FOOD_BY_LEVEL: { maxExcl: number; ids: number[] }[] = [
  { maxExcl: 5, ids: [787, 117, 4540, 2680] },
  { maxExcl: 15, ids: [2287, 4592, 4541, 21072] },
  { maxExcl: 25, ids: [3770, 16170, 4542, 20074] },
  { maxExcl: 35, ids: [4594, 3771, 1707, 4457] },
  { maxExcl: 45, ids: [4599, 4601, 21552, 17222] },
  { maxExcl: 999, ids: [8950, 8952, 8957, 21023] },
];

const DRINK_BY_LEVEL: { maxExcl: number; ids: number[] }[] = [
  { maxExcl: 5, ids: [159, 117] },
  { maxExcl: 15, ids: [1179, 21072] },
  { maxExcl: 25, ids: [1205] },
  { maxExcl: 35, ids: [1708] },
  { maxExcl: 45, ids: [1645] },
  { maxExcl: 999, ids: [8766] },
];

function pickFromBands(
  bands: { maxExcl: number; ids: number[] }[],
  level: number,
  ds: DataStore,
  rng: Rng,
): number | undefined {
  const band = bands.find((b) => level < b.maxExcl) ?? bands[bands.length - 1]!;
  const present = band.ids.filter((id) => ds.item(id));
  if (present.length === 0) return undefined;
  return present[rng.int(0, present.length - 1)]!;
}

/** RandomItemMgr::GetFood(level, category). category 11 = food, 59 = drink. */
export function getFood(level: number, category: 11 | 59, ds: DataStore, rng: Rng): number | undefined {
  return pickFromBands(category === 11 ? FOOD_BY_LEVEL : DRINK_BY_LEVEL, level, ds, rng);
}

// ---- RandomItemMgr::GetAmmo -------------------------------------------------
// Cite: BuildAmmoCache — class 6 projectile, quality NORMAL, RequiredLevel ≤ band, highest req.

// Highest normal-quality projectile for the subclass (arrow 2 / bullet 3) with RequiredLevel ≤
// level, queried by absolute level the same way the source SQL does.
export function getAmmo(level: number, subClass: number, ds: DataStore): number | undefined {
  let best: ItemDef | undefined;
  for (const it of ds.items()) {
    if (it.notObtainable) continue; // HJ1: skip GM/QA/test catalog junk
    if (it.itemClass !== ITEM_CLASS_PROJECTILE) continue;
    if ((it.itemSubclass ?? -1) !== subClass) continue;
    if (it.quality !== 1) continue; // ITEM_QUALITY_NORMAL
    const req = it.requiredLevel > 0 ? it.requiredLevel : 0;
    if (req > level) continue;
    if (!best || (best.requiredLevel ?? 0) < req) best = it;
  }
  return best?.entry;
}

function ammoSubClassForRanged(ranged: ItemDef | undefined): number | undefined {
  const sub = weaponSubclassOf(ranged);
  if (sub === ITEM_SUBCLASS_WEAPON_GUN) return ITEM_SUBCLASS_BULLET;
  if (sub === ITEM_SUBCLASS_WEAPON_BOW || sub === ITEM_SUBCLASS_WEAPON_CROSSBOW) return ITEM_SUBCLASS_ARROW;
  return undefined;
}

// ---- Potions: BuildPotionCache / GetRandomPotion equivalent -----------------
// HEAL → useInCombat.restore_health; ENERGIZE → mana potions (name / useSpell path).

/** ITEM_SUBCLASS_POTION. Cite: ItemPrototype.h ItemSubclassConsumable 164-175, IsPotion 533. */
const ITEM_SUBCLASS_POTION = 3;

function potionCandidates(
  level: number,
  kind: 'heal' | 'mana',
  ds: DataStore,
  banded: boolean,
): ItemDef[] {
  const out: ItemDef[] = [];
  for (const it of ds.items()) {
    if (it.notObtainable) continue; // HJ1: skip GM/QA/test catalog junk
    // The potion bucket, the same gate rotation/consumables.ts uses: on `restore_health` alone
    // the heal pool served Gauntlets of the Sea 8346 and Mechanical Repair Kit 11590.
    if ((it.itemClass ?? -1) !== ITEM_CLASS_CONSUMABLE) continue;
    if ((it.itemSubclass ?? -1) !== ITEM_SUBCLASS_POTION) continue;
    // A soulbound reward is not a kit row: the AV quartermaster potions (18839 / 18841) bind to
    // whoever picked them up, so no spawned bot could be carrying one.
    if (shouldBindOnTrigger(resolveBonding(it), 'loot', false)) continue;
    const req = it.requiredLevel > 0 ? it.requiredLevel : 0;
    // Factory: RequiredLevel in (level-10, level] when set.
    if (req > level) continue;
    if (banded && req > 0 && req < level - 10) continue;
    if (kind === 'heal') {
      if (it.useInCombat?.effect !== 'restore_health') continue;
    } else {
      // Bake often lacks useInCombat on mana pots; name match is the classic list proxy.
      if (!/mana potion/i.test(it.name ?? '')) continue;
      if (/recipe|writ/i.test(it.name ?? '')) continue;
    }
    out.push(it);
  }
  return out;
}

export function getRandomPotion(
  level: number,
  kind: 'heal' | 'mana',
  ds: DataStore,
  rng: Rng,
): number | undefined {
  const banded = potionCandidates(level, kind, ds, true);
  if (banded.length) return banded[rng.int(0, banded.length - 1)]!.entry;
  // The band is empty between the Greater (req 21) and Superior (req 35) rungs and above Major
  // req 49, so take the top rung at or below level - the shape GetAmmo already uses here.
  const all = potionCandidates(level, kind, ds, false);
  if (all.length === 0) return undefined;
  const top = Math.max(...all.map((it) => it.requiredLevel | 0));
  const best = all.filter((it) => (it.requiredLevel | 0) === top);
  return best[rng.int(0, best.length - 1)]!.entry;
}

// ---- InitReagents class tables ----------------------------------------------
// Cite: PlayerbotFactory::InitReagents (classic levels only; TBC rows omitted).

function reagentIdsFor(cls: number, level: number): { ids: number[]; regCount: number } {
  let regCount = 1;
  let ids: number[] = [];
  switch (cls) {
    case CLASS.MAGE:
      regCount = 2;
      if (level > 11) ids = [17056];
      if (level > 19) ids = [17056, 17031];
      if (level > 35) ids = [17056, 17031, 17032];
      if (level > 55) ids = [17056, 17031, 17032, 17020];
      break;
    case CLASS.DRUID:
      regCount = 2;
      if (level > 19) ids = [17034];
      if (level > 29) ids = [17035];
      if (level > 39) ids = [17036];
      if (level > 49) ids = [17037, 17021];
      if (level > 59) ids = [17038, 17026];
      break;
    case CLASS.PALADIN:
      regCount = 3;
      if (level > 50) ids = [21177];
      break;
    case CLASS.SHAMAN:
      regCount = 1;
      if (level > 22) ids = [17057];
      if (level > 28) ids = [17057, 17058];
      if (level > 29) ids = [17057, 17058, 17030];
      break;
    case CLASS.WARLOCK:
      regCount = 10;
      if (level > 9) ids = [6265];
      if (level > 49) ids = [6265, 5565];
      break;
    case CLASS.PRIEST:
      regCount = 3;
      if (level > 48) ids = [17028];
      if (level > 55) ids = [17028, 17029];
      break;
    case CLASS.ROGUE:
      regCount = 1;
      if (level > 21) ids = [5140];
      if (level > 33) ids = [5140, 5530];
      break;
    default:
      break;
  }
  return { ids, regCount };
}

// ---- AddConsumables (classic / MANGOSBOT_ZERO only) -------------------------
// Cite: PlayerbotFactory::AddConsumables — PriorizedConsumables enum ids.

type Grant = { item: number; count: number };

function consumableGrants(cls: number, level: number): Grant[] {
  const g: Grant[] = [];
  const add = (item: number, count = 5) => g.push({ item, count });

  if (cls === CLASS.PRIEST || cls === CLASS.MAGE || cls === CLASS.WARLOCK) {
    if (level >= 5 && level < 20) add(20744); // MINOR_WIZARD_OIL
    if (level >= 20 && level < 40) {
      add(20745); // MINOR_MANA_OIL
      add(20744);
    }
    if (level >= 40 && level < 45) {
      add(20745);
      add(20750); // WIZARD_OIL
    }
    if (level >= 45) {
      add(20748); // BRILLIANT_MANA_OIL
      add(20749); // BRILLIANT_WIZARD_OIL
    }
  }

  if (cls === CLASS.PALADIN || cls === CLASS.WARRIOR || cls === CLASS.HUNTER) {
    if (level >= 1 && level < 5) {
      add(2862); // ROUGH_SHARPENING_STONE
      add(3239); // ROUGH_WEIGHTSTONE (header maps both rough weights to 3239)
    }
    if (level >= 5 && level < 15) {
      add(2863);
      add(3239); // COARSE_WEIGHTSTONE same id in header
    }
    if (level >= 15 && level < 25) {
      add(2871);
      add(3241);
    }
    if (level >= 25 && level < 35) {
      add(7964);
      add(7965);
    }
    if (level >= 35) {
      add(12643);
      add(12404);
    }
  }

  if (cls === CLASS.ROGUE) {
    // Instant Poison I (6947) — craft product; enrich-rogue-poisons sources the item.
    // store() still skips ids missing from the DataStore (safe if re-bake omits them).
    if (level >= 20 && level < 28) {
      add(6947);
      add(3775);
    }
    if (level >= 28 && level < 30) {
      add(6949);
      add(3775);
      add(5237);
    }
    if (level >= 30 && level < 36) {
      add(2892);
      add(6949);
      add(3775);
      add(5237);
    }
    if (level >= 36 && level < 38) {
      add(2892);
      add(6950);
      add(3775);
      add(5237);
    }
    if (level >= 38 && level < 44) {
      add(2893);
      add(6950);
      add(3775);
      add(6951);
    }
    if (level >= 44 && level < 46) {
      add(2893);
      add(8926);
      add(3775);
      add(6951);
    }
    if (level >= 46 && level < 52) {
      add(8984);
      add(8926);
      add(3775);
      add(6951);
    }
    if (level >= 52 && level < 54) {
      add(8984);
      add(8927);
      add(3776);
      add(9186);
    }
    if (level >= 54 && level < 60) {
      add(8985);
      add(8927);
      add(3776);
      add(9186);
    }
    if (level >= 60) {
      // classic caps; TBC ranks not granted under MANGOSBOT_ZERO
      add(20844); // DEADLY_POISON_V if present
      add(8928);
      add(3776);
      add(9186);
    }
  }

  return g;
}

// BG consume kit: the best baked buff-consumable per family the unit can use at `level` — elixirs,
// flasks, scrolls, juju. The gate-time prebuff pass drinks one of each.
export function elixirKit(level: number, ds: DataStore): number[] {
  const bestByMod = new Map<string, ItemDef>();
  for (const it of ds.items()) {
    if (it.notObtainable) continue;
    if (!it.useBuff || it.useSpell == null) continue;
    // Beneficial only — the bake stamps useBuff on curse-flavoured items too
    // (Wail of the Banshee: hit −10). Nobody buffs up with a debuff.
    if (!(it.useBuff.amount > 0)) continue;
    // Item.RequiredLevel only (spell/useBuff reqLevel over-gates — KI-855).
    const req = it.requiredLevel ?? 0;
    if (req > level) continue;
    const cur = bestByMod.get(it.useBuff.mod);
    if (!cur || (cur.requiredLevel ?? 0) < req) {
      bestByMod.set(it.useBuff.mod, it);
    }
  }
  return [...bestByMod.values()].map((it) => it.entry);
}

// ---- Store helpers ----------------------------------------------------------

function store(inv: Inventory, entry: number, count: number, ds: DataStore): Inventory {
  const it = ds.item(entry);
  if (!it || count <= 0) return inv;
  const maxStack = it.stackable ?? 1;
  // A kit is picked up, not spawned from nothing: a BoP / quest row (warlock Soul Shards 6265)
  // arrives soulbound to this body, which is what stops the party vault pulling it out.
  const plain: ItemInstance = { item: entry, count };
  const inst = applyBindToInstance(plain, resolveBonding(it), 'loot');
  return inst.bound ? addInstance(inv, inst, maxStack) : addItem(inv, entry, count, maxStack);
}

function stackCount(it: ItemDef, rng: Rng): number {
  const max = Math.max(1, it.stackable ?? 1);
  // urand(maxCount / 2, maxCount)
  return rng.int(Math.max(1, Math.floor(max / 2)), max);
}

// ---- Public: full kit -------------------------------------------------------

export interface BotSpawnKit {
  inventory: Inventory;
  /** Paperdoll after bags equipped (gear slots preserved). */
  equipped: EquippedMap;
  gold: number;
  /** PLAYER_AMMO_ID when InitAmmo selected a projectile. */
  ammoItem?: number;
}

// The PlayerbotFactory inventory half of Randomize, in source order: bags, ammo, food, potions,
// reagents, consumables, money, then tools when char.skills already carries trade lines.
export function generateSpawnInventory(
  char: Character,
  seed: number,
  ds: DataStore,
  opts?: {
    // Food, potions and the class grants. Ammo, class reagents and tools are NOT consumables and
    // ride either way: a dry hunter still needs arrows and a dry warlock still needs shards.
    consumables?: boolean;
  },
): BotSpawnKit {
  const consumables = opts?.consumables !== false;
  const level = Math.max(1, Math.min(60, char.level | 0));
  const rng = mulberry32(hashSeed(seed, 0x1b07));
  let inv = emptyInventory();
  let equipped: EquippedMap = { ...char.equipped };

  // --- InitBags: Traveler's Backpack into empty bag slots --------------------
  const bag = ds.item(TRAVELERS_BACKPACK);
  if (bag?.slot === 'bag') {
    for (const slot of BAG_SLOTS) {
      if (equipped[slot] != null) continue;
      inv = store(inv, TRAVELERS_BACKPACK, 1, ds);
      const shell: Character = { ...char, equipped, gold: 0 };
      const r = equipItem(shell, inv, ds, TRAVELERS_BACKPACK, slot);
      if (r.ok) {
        equipped = r.char.equipped;
        inv = r.inventory;
      }
    }
  }

  // --- InitAmmo --------------------------------------------------------------
  let ammoItem: number | undefined;
  if (char.cls === CLASS.HUNTER || char.cls === CLASS.ROGUE || char.cls === CLASS.WARRIOR) {
    const rangedEntry = equippedEntry(equipped.ranged);
    const ranged = rangedEntry != null ? ds.item(rangedEntry) : undefined;
    const sub = ammoSubClassForRanged(ranged);
    if (sub != null) {
      const entry = getAmmo(level, sub, ds);
      if (entry) {
        // maxCount = 5 + level/10 stacks of 200
        const maxStacks = 5 + Math.floor(level / 10);
        for (let i = 0; i < maxStacks; i++) inv = store(inv, entry, 200, ds);
        ammoItem = entry;
      }
    }
  }

  // --- InitFood (cat 11 + 59 if mana) ----------------------------------------
  if (consumables) {
    const foodId = getFood(level, 11, ds, rng);
    if (foodId) {
      const it = ds.item(foodId)!;
      inv = store(inv, foodId, stackCount(it, rng), ds);
    }
    if (classPowerType(char.cls) === 'mana') {
      const drinkId = getFood(level, 59, ds, rng);
      if (drinkId) {
        const it = ds.item(drinkId)!;
        inv = store(inv, drinkId, stackCount(it, rng), ds);
      }
    }
  }

  // --- InitPotions -----------------------------------------------------------
  if (consumables) {
    const healId = getRandomPotion(level, 'heal', ds, rng);
    if (healId) {
      const it = ds.item(healId)!;
      inv = store(inv, healId, stackCount(it, rng), ds);
    }
    if (classPowerType(char.cls) === 'mana') {
      const manaId = getRandomPotion(level, 'mana', ds, rng);
      if (manaId) {
        const it = ds.item(manaId)!;
        inv = store(inv, manaId, stackCount(it, rng), ds);
      }
    }
  }

  // --- InitReagents ----------------------------------------------------------
  {
    const { ids, regCount } = reagentIdsFor(char.cls, level);
    for (const id of ids) {
      const it = ds.item(id);
      if (!it) continue;
      const max = Math.max(1, it.stackable ?? 1);
      // urand(maxCount / 2, maxCount * regCount)
      const n = rng.int(Math.max(1, Math.floor(max / 2)), max * regCount);
      inv = store(inv, id, n, ds);
    }
  }

  // --- AddConsumables --------------------------------------------------------
  for (const g of consumables ? consumableGrants(char.cls, level) : []) {
    inv = store(inv, g.item, g.count, ds);
  }

  // InitInventorySkill: tools, when trade skills are already stamped. The Random Character path
  // stamps skills after this via applyBotProfessions, so this covers callers that fill first.
  inv = initInventorySkill(char, inv, ds);

  const gold = botSpawnGold(level, mulberry32(hashSeed(seed, 0x60d)));

  return {
    inventory: inv,
    equipped,
    gold,
    ...(ammoItem != null ? { ammoItem } : {}),
  };
}
