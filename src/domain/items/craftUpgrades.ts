// Who in the roster would wear a craft's product. One findUpgrades pass PER (body, product): a bag
// holding every product flags 88 of 99, per item 99 (src/dev/probe-craft-upgrade-cost.mjs).

import type { DataStore } from '../../data/dataStore.ts';
import type { EquipSlot, ItemDef } from '../../data/schema.ts';
import type { Character } from '../character/character.ts';
import type { EquipOpts } from './equipment.ts';
import { findUpgrades, type CompareScale } from './equipmentHelper.ts';
import { canEquipItem } from './itemRestrictions.ts';

/** A body a crafted piece could land on: you, a squad bot, a bench bot, a raid seat. */
export interface UpgradeBody {
  /** null = the player. */
  id: string | null;
  name: string;
  cls: number;
  char: Character;
  opts?: EquipOpts;
}

/** One wearer of one product, with the slot it lands in and how far it beats what they wear. */
export interface CraftWearer {
  id: string | null;
  name: string;
  cls: number;
  slot: EquipSlot;
  /** Entry currently in that slot, absent when the slot is empty. */
  currentEntry?: number;
  /** Score over what they wear now: weightscale points, or the quality/ilvl fallback. */
  delta: number;
  scale: CompareScale;
}

/** Every roster body each product upgrades, best delta first. Unknown or unequippable ids skip. */
export function craftUpgradeWearers(
  products: Iterable<number>,
  bodies: readonly UpgradeBody[],
  ds: DataStore,
): Map<number, CraftWearer[]> {
  const defs: ItemDef[] = [];
  for (const entry of new Set(products)) {
    let it: ItemDef | undefined;
    try {
      it = ds.item(entry);
    } catch {
      continue;
    }
    if (it?.slot) defs.push(it);
  }
  const out = new Map<number, CraftWearer[]>();
  for (const b of bodies) {
    for (const it of defs) {
      // Level / class / proficiency gate first: most (body, product) pairs never reach the scorer.
      if (!canEquipItem(b.char, it, ds)) continue;
      let ups: ReturnType<typeof findUpgrades>;
      try {
        ups = findUpgrades(b.char, { stacks: [{ item: it.entry, count: 1 }] }, ds, b.opts);
      } catch {
        continue;
      }
      for (const u of ups) {
        // bestHandLoadout may also move a WORN piece between sockets; only the probe entry is news.
        if (u.entry !== it.entry) continue;
        const row: CraftWearer = {
          id: b.id,
          name: b.name,
          cls: b.cls,
          slot: u.targetSlot,
          ...(u.currentEntry != null ? { currentEntry: u.currentEntry } : {}),
          delta: u.valueDelta,
          scale: u.scale ?? 'spec',
        };
        const hit = out.get(it.entry);
        if (hit) hit.push(row);
        else out.set(it.entry, [row]);
      }
    }
  }
  for (const list of out.values()) {
    list.sort((a, b) => b.delta - a.delta || a.name.localeCompare(b.name));
  }
  return out;
}
