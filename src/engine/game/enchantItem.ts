// Applying an enchant ITEM to a slot the player picks, on themselves or a companion. With no slot it
// refuses with the wearer's eligible list; an ineligible slot REFUSES rather than quietly retargeting.

import type { DataStore } from '../../data/dataStore.ts';
import type { EquipSlot } from '../../data/schema.ts';
import type { Character, EquippedMap } from '../../domain/character/character.ts';
import type { Inventory } from '../../domain/items/inventory.ts';
import { countItem, removeItem } from '../../domain/items/inventory.ts';
import { applyPermEnchantToSlot } from '../../domain/professions/enchantApply.ts';
import { scanEnchantTargets, rejectionFor } from '../../domain/professions/enchantTargets.ts';
import { equippedEntry } from '../../domain/items/itemInstance.ts';
import { gearEnchantGrant } from '../../domain/professions/gearEnchant.ts';
import { hasAttrEx2, SPELL_ATTR_EX2 } from '../spells/spellAttributes.ts';
import type { Companion } from '../../domain/bots/squad.ts';
import type { ConsumeItemOpts, EnchantNeedsTarget, EnchantTarget } from './types.ts';

export type EnchantItemResult =
  | { ok: true; restored: number; enchantedSlot: EquipSlot; enchantName: string }
  | { ok: false; reason: string; needsTarget?: EnchantNeedsTarget };

export interface EnchantItemDeps {
  ds: DataStore;
  char: Character;
  inventory: Inventory;
  squad: Companion[] | undefined;
  botRoster?: Record<string, Companion>;
  raidMembers?: Record<string, Companion>;
  /** Commit the player's new gear + bags. */
  setPlayer(equipped: EquippedMap, inventory: Inventory): void;
  /** Commit a companion's new gear + the player's bags. Writes squad, bench or raid seat. */
  setCompanion(id: string, equipped: EquippedMap, inventory: Inventory): void;
  log(msg: string): void;
}

function ownedCompanion(d: EnchantItemDeps, id: string): Companion | undefined {
  const c = d.squad?.find((m) => m.id === id) ?? d.botRoster?.[id] ?? d.raidMembers?.[id];
  return c && !c.mission ? c : undefined;
}

// Route an enchant-applying item, or return null when `itemEntry` is not one (so the caller falls through
// to its ordinary consume path).
export function routeEnchantItem(
  itemEntry: number,
  opts: ConsumeItemOpts,
  d: EnchantItemDeps,
): EnchantItemResult | null {
  const { ds } = d;
  const item = ds.item(itemEntry);
  if (!item?.useSpell) return null;
  const app = ds.enchantApplicator(item.useSpell);
  if (!app || !app.permanent) return null;   // not an enchant item, or a temporary imbue (W5)

  if (countItem(d.inventory, itemEntry) <= 0) return { ok: false, reason: "You don't have that" };

  const target: EnchantTarget = opts.target ?? { kind: 'self' };

  if (target.kind === 'companion') {
    const spell = ds.spell(item.useSpell);
    if (hasAttrEx2(spell, SPELL_ATTR_EX2.ENCHANT_OWN_ITEM_ONLY)) {
      return { ok: false, reason: 'You can only enchant your own items with that' };
    }
  }

  // ---- resolve whose gear ----------------------------------------------------
  let equipped: EquippedMap;
  let wearerName: string;
  let companion: Companion | undefined;
  if (target.kind === 'companion') {
    companion = ownedCompanion(d, target.id);
    if (!companion) return { ok: false, reason: 'That companion is not with you' };
    equipped = companion.equipped;
    wearerName = companion.name;
  } else {
    equipped = d.char.equipped;
    wearerName = 'your';
  }

  // ---- no slot named ⇒ ask ---------------------------------------------------
  const scan = scanEnchantTargets(equipped, app, ds);
  if (opts.slot == null) {
    if (!scan.eligible.length) {
      const why = scan.rejected[0]?.reason;
      return {
        ok: false,
        reason: why
          ? `Nothing ${target.kind === 'companion' ? `${wearerName} has` : 'you are wearing'} can take that - ${why.toLowerCase()}`
          : `Nothing ${target.kind === 'companion' ? `${wearerName} has` : 'you are wearing'} can take that`,
      };
    }
    return {
      ok: false,
      reason: 'Choose a slot',
      needsTarget: {
        itemEntry,
        enchantId: app.enchantId,
        target,
        slots: scan.eligible,
        rejected: scan.rejected,
      },
    };
  }

  // ---- validate the named slot ------------------------------------------------
  const slot = opts.slot;
  const entry = equippedEntry(equipped[slot]);
  if (entry == null) return { ok: false, reason: 'Nothing equipped there' };
  const worn = ds.item(entry);
  if (!worn) return { ok: false, reason: 'Unknown item' };
  // Re-check against the item actually worn rather than trusting the scan — the caller may pass
  // any slot at all, and refusing is the contract.
  const why = rejectionFor(app, worn, slot, ds.itemEnchant(app.enchantId));
  if (why) return { ok: false, reason: why };

  // ---- apply -------------------------------------------------------------------
  const [inv2, removed] = removeItem(d.inventory, itemEntry, 1);
  if (removed <= 0) return { ok: false, reason: "You don't have that" };

  const nextEquipped = applyPermEnchantToSlot(equipped, slot, app.enchantId);
  if (nextEquipped === equipped) return { ok: false, reason: 'Nothing equipped there' };

  if (companion) d.setCompanion(companion.id, nextEquipped, inv2);
  else d.setPlayer(nextEquipped, inv2);

  const enchantName = gearEnchantGrant(app.enchantId, ds)?.name
    ?? ds.itemEnchant(app.enchantId)?.name
    ?? item.name;
  d.log(target.kind === 'companion'
    ? `You apply ${item.name} to ${wearerName}'s ${worn.name}.`
    : `You apply ${item.name} to your ${worn.name}.`);

  return { ok: true, restored: 0, enchantedSlot: slot, enchantName };
}

// Bind the router to a live game state, keeping the wiring out of game.ts and the state rules next to
// the code that depends on them: companions are written back into the real squad array, never a copy.
export function makeEnchantItemRouter(g: {
  ds: DataStore;
  state: {
    char: Character;
    inventory: Inventory;
    squad?: Companion[];
    botRoster?: Record<string, Companion>;
    raidRoster?: { members?: Record<string, Companion> };
  };
  log(msg: string): void;
}): (itemEntry: number, opts: ConsumeItemOpts) => EnchantItemResult | null {
  const writeCompanion = (id: string, equipped: EquippedMap): void => {
    const idx = (g.state.squad ?? []).findIndex((c) => c.id === id);
    if (idx >= 0) {
      g.state.squad![idx] = { ...g.state.squad![idx]!, equipped };
      return;
    }
    if (g.state.botRoster?.[id]) {
      g.state.botRoster[id] = { ...g.state.botRoster[id]!, equipped };
      return;
    }
    const raid = g.state.raidRoster?.members;
    if (raid?.[id]) raid[id] = { ...raid[id]!, equipped };
  };
  return (itemEntry, opts) => routeEnchantItem(itemEntry, opts, {
    ds: g.ds,
    char: g.state.char,
    inventory: g.state.inventory,
    squad: g.state.squad,
    botRoster: g.state.botRoster,
    raidMembers: g.state.raidRoster?.members,
    setPlayer: (equipped, inventory) => {
      g.state.char = { ...g.state.char, equipped };
      g.state.inventory = inventory;
    },
    setCompanion: (id, equipped, inventory) => {
      writeCompanion(id, equipped);
      g.state.inventory = inventory;
    },
    log: g.log,
  });
}
