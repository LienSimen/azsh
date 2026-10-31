// Applying a temporary weapon imbue item to a hand the player picks, on themselves or a companion.
// One eligible hand auto-applies, two ask, an ineligible one REFUSES rather than retargeting.

import type { DataStore } from '../../data/dataStore.ts';
import type { EquipSlot, SpellDef } from '../../data/schema.ts';
import type { Character, EquippedMap, TempEnchantHand } from '../../domain/character/character.ts';
import type { Inventory } from '../../domain/items/inventory.ts';
import { countItem, removeItem } from '../../domain/items/inventory.ts';
import { applyTempEnchant } from '../../domain/professions/characterEnchants.ts';
import { resolveTempWeaponImbueHand } from '../../domain/professions/weaponImbueHand.ts';
import { equippedEntry } from '../../domain/items/itemInstance.ts';
import { hasAttrEx2, SPELL_ATTR_EX2 } from '../spells/spellAttributes.ts';
import type { Companion } from '../../domain/bots/squad.ts';
import { resolveCombatSpell } from '../spells/interpreter/item-triggers.ts';
import {
  applyWeaponImbueKitFromItemEnchant,
  combatPayloadFromSpell,
  type WeaponImbueEffect,
} from '../spells/interpreter/weapon-imbue-kit.ts';
import type { CombatSession } from '../combat/session-types.ts';
import type { ConsumeItemOpts, EnchantNeedsTarget, EnchantTarget } from './types.ts';
import { consumeItemCharges } from '../../domain/items/inventory.ts';

export type WeaponImbueItemResult =
  | { ok: true; restored: number; enchantedSlot: EquipSlot }
  | { ok: false; reason: string; needsTarget?: EnchantNeedsTarget };

// The live unit that owns a wearer's weapon while a combat session is open (`player` / `ally_N`), or null
// when nothing is running. See `mirrorImbueOntoLiveUnit`.
export type LiveImbueUnit = (
  target: EnchantTarget,
) => { session: CombatSession; side: string } | null;

export interface WeaponImbueItemDeps {
  ds: DataStore;
  char: Character;
  inventory: Inventory;
  squad: Companion[] | undefined;
  botRoster?: Record<string, Companion>;
  raidMembers?: Record<string, Companion>;
  setPlayer(char: Character, inventory: Inventory): void;
  setCompanion(id: string, charPatch: { equipped: EquippedMap; tempEnchants?: Character['tempEnchants'] }, inventory: Inventory): void;
  log(msg: string): void;
  /** Optional wall clock for expiresAt (tests inject). */
  now?: number;
  /** Live unit that owns this wearer's weapon while a session is open (mirror target). */
  liveUnit?: LiveImbueUnit;
  /** The wearer is spending their OWN item on their OWN weapon (companion self-prep). */
  byWearer?: boolean;
}

function ownedCompanion(d: WeaponImbueItemDeps, id: string): Companion | undefined {
  const c = d.squad?.find((m) => m.id === id) ?? d.botRoster?.[id] ?? d.raidMembers?.[id];
  return c && !c.mission ? c : undefined;
}

// Land the same coat on the LIVE unit, not just the sheet: a dungeon's one session read the temp
// enchant when it was built, so a poison applied on the floor procced nothing for the rest of the run.
function mirrorImbueOntoLiveUnit(
  live: { session: CombatSession; side: string },
  hand: TempEnchantHand,
  spell: SpellDef,
  eff: WeaponImbueEffect,
  ds: DataStore,
  casterLevel: number,
): void {
  if (typeof live.session.applySpellToUnit !== 'function') return;
  live.session.applySpellToUnit(live.side, spell, { weaponImbueHand: hand });
  const equipSpellId = eff.equipSpellId ?? 0;
  if (equipSpellId <= 0 || eff.attackPower) return;
  const equip = ds.spell(equipSpellId);
  if (equip) live.session.applySpellToUnit(live.side, resolveCombatSpell(equip, { casterLevel }));
}

// Route a temporary imbue item, or return null when `itemEntry` is not one (permanent enchants go through
// enchantItem.ts; ordinary consumables fall through).
export function routeWeaponImbueItem(
  itemEntry: number,
  opts: ConsumeItemOpts,
  d: WeaponImbueItemDeps,
): WeaponImbueItemResult | null {
  const { ds } = d;
  const item = ds.item(itemEntry);
  if (!item?.useSpell) return null;
  const app = ds.enchantApplicator(item.useSpell);
  if (!app || app.permanent) return null; // not a temp imbue

  if (countItem(d.inventory, itemEntry) <= 0) return { ok: false, reason: "You don't have that" };

  const target: EnchantTarget = opts.target ?? { kind: 'self' };

  // ENCHANT_OWN_ITEM_ONLY refuses the enchant only when the WEARER is not the caster
  // (Spell.cpp:6694-6698 `item->GetOwner() != m_caster`). A companion coating their own weapon out
  // of their own bags is the wearer casting, so poisons (ownItemOnly) reach a companion rogue.
  if (target.kind === 'companion' && !d.byWearer) {
    const spell = ds.spell(item.useSpell);
    if (hasAttrEx2(spell, SPELL_ATTR_EX2.ENCHANT_OWN_ITEM_ONLY)) {
      return { ok: false, reason: 'You can only enchant your own items with that' };
    }
  }

  let equipped: EquippedMap;
  let wearerName: string;
  let companion: Companion | undefined;
  let baseChar: Character;
  if (target.kind === 'companion') {
    companion = ownedCompanion(d, target.id);
    if (!companion) return { ok: false, reason: 'That companion is not with you' };
    equipped = companion.equipped;
    wearerName = companion.name;
    // Companion.tempEnchants is the typed TEMP_ENCHANTMENT_SLOT map (W5 gap 1).
    baseChar = {
      ...d.char,
      equipped: companion.equipped,
      tempEnchants: companion.tempEnchants,
    };
  } else {
    equipped = d.char.equipped;
    wearerName = 'your';
    baseChar = d.char;
  }

  // Shared eligibility (weapon hands only — never shield) + ask when both eligible.
  // Cite: domain/professions/weaponImbueHand.ts; W5 dual-wield poison OH.
  const picked = resolveTempWeaponImbueHand({
    equipped,
    ds,
    app,
    requested: opts.slot,
    mode: 'ask-when-ambiguous',
  });
  if (!picked.ok) {
    if (picked.needsChoose) {
      return {
        ok: false,
        reason: 'Choose a slot',
        needsTarget: {
          itemEntry,
          enchantId: app.enchantId,
          target,
          slots: picked.needsChoose.slots,
          rejected: picked.needsChoose.rejected,
        },
      };
    }
    const who = target.kind === 'companion' ? `${wearerName} has` : 'you are wearing';
    return {
      ok: false,
      reason: picked.reason.replace('you are wearing', who).replace('Nothing you are wearing', `Nothing ${who}`),
    };
  }
  const slot = picked.hand;
  const wornEntry = equippedEntry(equipped[slot]);
  const worn = wornEntry != null ? ds.item(wornEntry) : undefined;
  if (!worn) return { ok: false, reason: 'Unknown item' };

  // Resolve the full weapon_imbue payload (itemEnchant kit + combat spell numbers).
  const spRaw = ds.spell(item.useSpell);
  const sp = spRaw
    ? resolveCombatSpell(spRaw, {
        spellLookup: (id) => ds.spell(id),
        // itemEnchantLookup is read via cast in resolveCombatSpell; pass via object bag.
        ...({ itemEnchantLookup: (id: number) => ds.itemEnchant(id) } as object),
      } as Parameters<typeof resolveCombatSpell>[1])
    : undefined;
  const eff = sp?.effects?.find((e) => e.kind === 'weapon_imbue');
  if (!sp || !eff || eff.kind !== 'weapon_imbue') {
    return { ok: false, reason: 'That does not coat a weapon' };
  }
  // Ensure combat.direct is filled even when resolve lacked spellLookup wiring.
  applyWeaponImbueKitFromItemEnchant(eff, ds.itemEnchant(eff.enchantId), (id) => ds.spell(id));
  if (!eff.combat && eff.combatSpellId) {
    const proc = ds.spell(eff.combatSpellId);
    if (proc) {
      const combat = combatPayloadFromSpell(resolveCombatSpell(proc));
      if (combat) eff.combat = combat;
    }
  }

  // Consume one use (multi-charge oils decrement; −1 / absent destroy one stack unit).
  const taken = consumeItemCharges(d.inventory, itemEntry, item);
  if (!taken.ok) return { ok: false, reason: taken.reason };

  const now = d.now ?? Date.now();
  const durationMs = eff.durationMs > 0
    ? eff.durationMs
    : (app.durationMs && app.durationMs > 0 ? app.durationMs : 1_800_000);
  const hand = slot;
  const nextChar = applyTempEnchant(baseChar, hand, {
    spellId: item.useSpell,
    enchantId: eff.enchantId,
    expiresAt: now + durationMs,
    family: eff.family,
    attackPower: eff.attackPower,
    // The equip-spell passive (oil mana per five, Rockbiter's attack power), applied as an aura for the
    // temp duration. Cite: Player.cpp ApplyEnchantment ITEM_ENCHANTMENT_TYPE_EQUIP_SPELL.
    equipSpellId: eff.equipSpellId,
    combatSpellId: eff.combatSpellId,
    combatChancePct: eff.combatChancePct,
    combatPpm: eff.combatPpm,
    damageFlat: eff.damageFlat,
    rockbiterAmount: eff.rockbiterAmount,
    combat: eff.combat,
  }, now, ds);

  if (companion) {
    d.setCompanion(
      companion.id,
      { equipped: nextChar.equipped, tempEnchants: nextChar.tempEnchants },
      taken.inventory,
    );
  } else {
    d.setPlayer(nextChar, taken.inventory);
  }

  const live = d.liveUnit?.(target);
  if (live) mirrorImbueOntoLiveUnit(live, hand, sp, eff, ds, d.char.level);

  d.log(target.kind === 'companion'
    ? `You apply ${item.name} to ${wearerName}'s ${worn.name}.`
    : `You apply ${item.name} to your ${worn.name}.`);

  return { ok: true, restored: 0, enchantedSlot: slot };
}

/** Bind the router to a live game state. Keeps wiring out of game.ts (filesize ratchet). */
export function makeWeaponImbueItemRouter(g: {
  ds: DataStore;
  state: {
    char: Character;
    inventory: Inventory;
    squad?: Companion[];
    botRoster?: Record<string, Companion>;
    raidRoster?: { members?: Record<string, Companion> };
  };
  log(msg: string): void;
  liveUnit?: LiveImbueUnit;
}): (itemEntry: number, opts: ConsumeItemOpts) => WeaponImbueItemResult | null {
  type ImbuePatch = { equipped: EquippedMap; tempEnchants?: Character['tempEnchants'] };
  const writeCompanion = (id: string, patch: ImbuePatch): void => {
    const next = (prev: Companion): Companion => ({
      ...prev,
      equipped: patch.equipped,
      tempEnchants: patch.tempEnchants,
    });
    const idx = (g.state.squad ?? []).findIndex((c) => c.id === id);
    if (idx >= 0) {
      g.state.squad![idx] = next(g.state.squad![idx]!);
      return;
    }
    if (g.state.botRoster?.[id]) {
      g.state.botRoster[id] = next(g.state.botRoster[id]!);
      return;
    }
    const raid = g.state.raidRoster?.members;
    if (raid?.[id]) raid[id] = next(raid[id]!);
  };
  return (itemEntry, opts) => routeWeaponImbueItem(itemEntry, opts, {
    ds: g.ds,
    char: g.state.char,
    inventory: g.state.inventory,
    squad: g.state.squad,
    botRoster: g.state.botRoster,
    raidMembers: g.state.raidRoster?.members,
    ...(g.liveUnit ? { liveUnit: g.liveUnit } : {}),
    setPlayer: (char, inventory) => {
      g.state.char = char;
      g.state.inventory = inventory;
    },
    setCompanion: (id, patch, inventory) => {
      writeCompanion(id, patch);
      g.state.inventory = inventory;
    },
    log: g.log,
  });
}

/** @deprecated — prefer consumeItemCharges; kept for call sites that only removeItem. */
function takeOneImbueItem(inv: Inventory, itemEntry: number): [Inventory, number] {
  return removeItem(inv, itemEntry, 1);
}
