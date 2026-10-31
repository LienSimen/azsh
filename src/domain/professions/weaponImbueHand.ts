// TEMP weapon-hand eligibility and pick policy for imbues. Only mainhand and offhand, and only
// real weapons: applicators ship EquippedItemClass=-1, so a shield would otherwise be offered.

import type { EnchantApplicatorDef, EquipSlot, ItemDef } from '../../data/schema.ts';
import type { Character, EquippedMap, TempEnchantHand } from '../character/character.ts';
import { getTempEnchant } from './characterEnchants.ts';
import {
  rejectionFor,
  type EnchantTargetDs,
  type SlotRejection,
} from './enchantTargets.ts';
import { equippedEntry } from '../items/itemInstance.ts';

const TEMP_HANDS: readonly TempEnchantHand[] = ['mainhand', 'offhand'];

// True when using this item writes TEMP_ENCHANTMENT_SLOT rather than restoring or buffing — a
// sharpening stone, weightstone, oil or poison. A leaf, so consumableFamily can use it.
export function isWeaponImbueItem(
  it: ItemDef | undefined,
  ds: { enchantApplicator: (spellId: number) => EnchantApplicatorDef | undefined },
): boolean {
  if (!it?.useSpell) return false;
  const app = ds.enchantApplicator(it.useSpell);
  return !!app && !app.permanent && app.target.itemClass === 2;
}

export type WeaponImbueHandPickMode =
  /** Item poisons/oils: one eligible → auto; two → ask (never silent MH). */
  | 'ask-when-ambiguous'
  // Shaman weapon spells: one eligible → auto; two → empty hand first (MH then OH); both already coated →
  // ask (re-cast must choose which to replace).
  | 'empty-first';

export interface TempWeaponImbueScan {
  eligible: TempEnchantHand[];
  rejected: SlotRejection[];
}

export type ResolveTempWeaponImbueHand =
  | { ok: true; hand: TempEnchantHand }
  | {
      ok: false;
      reason: string;
      /** Caller should open a picker; slots are already eligibility-filtered. */
      needsChoose?: { slots: TempEnchantHand[]; rejected: SlotRejection[] };
    };

function isWeaponItem(item: ItemDef | undefined): boolean {
  return !!item?.weapon;
}

// Hands that can take a TEMP weapon coat right now, always requiring a real weapon in the slot.
// With `app` present, the EquippedItem* masks apply too.
export function scanTempWeaponImbueHands(
  equipped: EquippedMap,
  ds: EnchantTargetDs,
  app?: EnchantApplicatorDef | null,
): TempWeaponImbueScan {
  const enchant = app ? ds.itemEnchant(app.enchantId) : undefined;
  const eligible: TempEnchantHand[] = [];
  const rejected: SlotRejection[] = [];

  for (const hand of TEMP_HANDS) {
    const entry = equippedEntry(equipped[hand]);
    if (entry == null) continue;
    const item = ds.item(entry);
    if (!item) continue;
    if (!isWeaponItem(item)) {
      rejected.push({ slot: hand, reason: 'That only goes on a weapon' });
      continue;
    }
    if (app) {
      const why = rejectionFor(app, item, hand, enchant);
      if (why) {
        rejected.push({ slot: hand, reason: why });
        continue;
      }
    }
    eligible.push(hand);
  }
  return { eligible, rejected };
}

// Resolve which hand receives a TEMP weapon imbue. `requested` is validated (never silently retarget).
// Omitted → pick by `mode`.
export function resolveTempWeaponImbueHand(opts: {
  equipped: EquippedMap;
  ds: EnchantTargetDs;
  app?: EnchantApplicatorDef | null;
  requested?: EquipSlot | null;
  /** Living temp map for empty-first (defaults to none empty → both "empty"). */
  char?: Character;
  now?: number;
  mode: WeaponImbueHandPickMode;
}): ResolveTempWeaponImbueHand {
  const { equipped, ds, app, mode } = opts;
  const now = opts.now ?? Date.now();
  const scan = scanTempWeaponImbueHands(equipped, ds, app);
  const { eligible, rejected } = scan;

  const failNothing = (): ResolveTempWeaponImbueHand => {
    const why = rejected[0]?.reason;
    return {
      ok: false,
      reason: why
        ? `Nothing you are wearing can take that - ${why.toLowerCase()}`
        : 'Nothing you are wearing can take that',
    };
  };

  if (opts.requested != null) {
    const slot = opts.requested;
    if (slot !== 'mainhand' && slot !== 'offhand') {
      return { ok: false, reason: 'That only goes on a weapon hand' };
    }
    const entry = equippedEntry(equipped[slot]);
    if (entry == null) return { ok: false, reason: 'Nothing equipped there' };
    const item = ds.item(entry);
    if (!item) return { ok: false, reason: 'Unknown item' };
    if (!isWeaponItem(item)) return { ok: false, reason: 'That only goes on a weapon' };
    if (app) {
      const why = rejectionFor(app, item, slot, ds.itemEnchant(app.enchantId));
      if (why) return { ok: false, reason: why };
    }
    return { ok: true, hand: slot };
  }

  if (!eligible.length) return failNothing();
  if (eligible.length === 1) return { ok: true, hand: eligible[0]! };

  if (mode === 'ask-when-ambiguous') {
    return {
      ok: false,
      reason: 'Choose a slot',
      needsChoose: { slots: eligible, rejected },
    };
  }

  // empty-first: MH then OH among eligible hands missing a living TEMP coat.
  const char = opts.char;
  const empty = eligible.filter((h) => {
    if (!char) return true;
    return getTempEnchant(char, h, now) == null;
  });
  if (empty.length > 0) {
    // eligible is already MH-before-OH from TEMP_HANDS walk order.
    return { ok: true, hand: empty[0]! };
  }
  // Both already coated — ask which to replace (never silent MH refresh).
  return {
    ok: false,
    reason: 'Choose a slot',
    needsChoose: { slots: eligible, rejected },
  };
}

// Eligible weapon hands that currently lack a living TEMP coat. Rotation open-hand gate (ref 2) — shield
// slots never count.
export function openTempWeaponImbueHands(
  char: Character,
  ds: EnchantTargetDs,
  now: number = Date.now(),
  app?: EnchantApplicatorDef | null,
): Set<TempEnchantHand> {
  const { eligible } = scanTempWeaponImbueHands(char.equipped, ds, app);
  const open = new Set<TempEnchantHand>();
  for (const h of eligible) {
    if (getTempEnchant(char, h, now) == null) open.add(h);
  }
  return open;
}
