// Item eligibility for random-bot factory gear — an exact port of the playerbots RandomItemMgr
// filters. Not a hand-maintained blocklist: the ids are the factory's own unavailable list.

import type { ItemDef } from '../../data/schema.ts';
import { PLAYERBOT_UNAVAILABLE_ITEM_IDS } from './playerbotUnavailableItems.ts';

// Name filters from RandomItemMgr::BuildItemInfoCache (classic). Uses substring match like C++ strstr —
// including bare "Test" / "TEST" (playerbots does this; it excludes e.g. "Testament of Hope").
export function playerbotTestNameSkip(name: string | undefined | null): boolean {
  const n = String(name || '');
  if (!n) return true;
  // Order / strings match RandomItemMgr.cpp BuildItemInfoCache.
  if (n.includes('(Test)') || n.includes('(TEST)') || n.includes('(test)')) return true;
  if (n.includes('(JEFFTEST)')) return true;
  if (n.includes('Test ') || n.includes('Test') || n.includes('TEST') || n.includes('TEST ')) return true;
  if (n.includes(' TEST')) return true;
  if (n.includes('2200 ')) return true;
  if (n.includes('Deprecated ') || n.includes('Unused ') || n.includes('Monster ')) return true;
  if (n.includes('[PH]') || n.includes('(OLD)')) return true;
  if (n.includes('zzz') || n.includes('ZZZ')) return true;
  // BuildRandomItemCache also case-insensitive-ish via strstri for qa/test/deprecated
  const lower = n.toLowerCase();
  if (lower.includes('qa') || lower.includes('test') || lower.includes('deprecated')) return true;
  return false;
}

// True when the item is playerbots GM-test junk that should never stay on a paperdoll. Does NOT
// require itemLevel or sellPrice — those are pool gates, and starter fixtures lack them.
export function playerbotJunkItem(it: ItemDef): boolean {
  if (it.notObtainable) return true;
  if (PLAYERBOT_UNAVAILABLE_ITEM_IDS.has(it.entry)) return true;
  if (playerbotTestNameSkip(it.name)) return true;
  return false;
}

// True when this item may enter the random-bot equipment pool. Mirrors the gates that keep GM/test/no-sell
// rows out of InitEquipment candidates.
export function playerbotFactoryItemEligible(it: ItemDef): boolean {
  // PlayerbotFactory InitEquipment unavailableItemIDs + name/notObtainable junk.
  if (playerbotJunkItem(it)) return false;

  // RandomItemMgr: no ItemLevel / no SellPrice → never cached.
  if (!(it.itemLevel != null && it.itemLevel > 0)) return false;
  if (!(it.sellPrice > 0)) return false;

  // CanEquipItem: quest-bind / bind-on-use
  if (it.bonding === 3 || it.bonding === 4) return false;

  // Containers are bags, not paperdoll (CanEquipItemNew returns false for containers).
  if (!it.slot || it.slot === 'bag') return false;

  // Fishing poles excluded from weapon equip path.
  if (it.weaponSubclass === 20 || it.typeName === 'Fishing Pole') return false;

  // Required level / min level from cache: factory skips items with no usable level.
  const req = it.requiredLevel > 0 ? it.requiredLevel : (it.itemLevel ?? 0);
  if (req <= 0) return false;

  return true;
}
