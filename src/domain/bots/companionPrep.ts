// Pre-pull prep for one companion: the buffs-phase ITEM rules plus the legacy bag-elixir sweep,
// in one loop instead of two copies. The imbue application is injected so this stays pure domain.

import type { DataStore } from '../../data/dataStore.ts';
import type { ItemDef } from '../../data/schema.ts';
import type { ActiveAura, Character } from '../character/character.ts';
import { applyAura, combatItems } from '../character/character.ts';
import type { Inventory } from '../items/inventory.ts';
import { countItem, emptyInventory, removeItem } from '../items/inventory.ts';
import type { Rotation, ItemRuleHand } from '../rotation/rotation.ts';
import type { Companion } from './squad.ts';
import { isWeaponImbueItem, scanTempWeaponImbueHands } from '../professions/weaponImbueHand.ts';
import { bestCarriedFamilyItem } from '../items/consumableFamily.ts';
import { applyWellFedFromItem, wellFedPendingFromItem } from '../../progression/rest.ts';
import { shareCategoryOf } from './consumableShare.ts';

// Re-exported from its leaf home so the ten existing importers keep their path.
export { isWeaponImbueItem };

export interface PrepItemInfo {
  entry: number;
  name: string;
  icon?: string;
  quality?: number;
  count: number;
  kind: 'weapon_imbue';
}

// Weapon-imbue consumables carried in `inv`. These are the prep-only items: they can never appear in the
// combat picker because `combatItems` drops them.
export function imbueItemsIn(inv: Inventory | undefined, ds: DataStore): PrepItemInfo[] {
  const out: PrepItemInfo[] = [];
  for (const stk of inv?.stacks ?? []) {
    const it = ds.item(stk.item);
    if (!isWeaponImbueItem(it, ds)) continue;
    if (out.some((x) => x.entry === stk.item)) continue;
    out.push({
      entry: stk.item,
      name: it!.name,
      ...(it!.icon != null ? { icon: it!.icon } : {}),
      ...(it!.quality != null ? { quality: it!.quality } : {}),
      count: countItem(inv!, stk.item),
      kind: 'weapon_imbue',
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** The buffs-phase item rules, in author order — the pre-pull prep list. */
export function prepItemRules(
  rot: Rotation,
): Array<{ itemEntry: number; family?: string; hand?: ItemRuleHand }> {
  const out: Array<{ itemEntry: number; family?: string; hand?: ItemRuleHand }> = [];
  for (const r of rot.phases.buffs) {
    if (!r.enabled || r.action.kind !== 'item') continue;
    out.push({
      itemEntry: r.action.itemEntry,
      ...(r.action.family != null ? { family: r.action.family } : {}),
      ...(r.action.hand != null ? { hand: r.action.hand } : {}),
    });
  }
  return out;
}

export interface CompanionPrepDeps {
  ds: DataStore;
  now: number;
  /** The companion's resolved wearer character (for combatItems gating). */
  char: Character;
  // Apply a temp weapon imbue from the companion's OWN bags. Injected because the router resolves
  // the full spell payload, which domain cannot reach. It must debit the bags itself.
  applyImbue?: (companionId: string, itemEntry: number, hand?: ItemRuleHand) => boolean;
  log?: (msg: string) => void;
}

// Coat open weapon hands from the buffs-phase item rules — poisons, stones, oils. Split out because
// it is the ONE prep half that reaches a live unit (weaponImbueItem mirrorImbueOntoLiveUnit).
export function applyCompanionWeaponCoats(
  c: Companion,
  rot: Rotation,
  d: CompanionPrepDeps,
): number[] {
  const { ds, now } = d;
  const spent: number[] = [];
  for (const raw of prepItemRules(rot)) {
    const carried = raw.family
      ? bestCarriedFamilyItem(raw.family, ds, d.char, c.bags)
      : null;
    const rule = carried ? { ...raw, itemEntry: carried.entry } : raw;
    const idef = ds.item(rule.itemEntry);
    if (!idef || !isWeaponImbueItem(idef, ds)) continue;
    // The router validates a REQUESTED hand without checking for a living coat, so prep
    // would burn a stone before every pull. Only ask for a hand that is eligible AND open.
    const app = ds.enchantApplicator(idef.useSpell!);
    const { eligible } = scanTempWeaponImbueHands(c.equipped, ds, app);
    const live = (h: ItemRuleHand): boolean => {
      const te = c.tempEnchants?.[h];
      return !!te && (te.expiresAt == null || te.expiresAt > now);
    };
    const want: ItemRuleHand[] = rule.hand
      ? (eligible.includes(rule.hand) ? [rule.hand] : [])
      : eligible;
    for (const hand of want.filter((h) => !live(h))) {
      if (d.applyImbue?.(c.id, rule.itemEntry, hand)) spent.push(rule.itemEntry);
    }
  }
  return spent;
}

function auraDurationMsOf(idef: ItemDef | undefined, spellId: number, ds: DataStore): number {
  return idef?.useBuff?.durationMs
    ?? ds.spell(spellId)?.effects.find((e) => e.kind === 'buff')?.durationMs
    ?? 0;
}

// Apply one companion's item prep, mutating `c.prePullAuras` and `c.bags`. Explicit buffs-phase
// rules run first, then the legacy sweep of any remaining apply_buff bag item whose aura is gone.
export function applyCompanionItemPrep(
  c: Companion,
  rot: Rotation,
  d: CompanionPrepDeps,
): number {
  const { ds, now } = d;
  c.prePullAuras ??= [];
  const auras: ActiveAura[] = c.prePullAuras;
  const has = (spellId: number): boolean => auras.some((a) => a.spellId === spellId);

  const drink = (idef: ItemDef, spellId: number): void => {
    const durMs = auraDurationMsOf(idef, spellId, ds);
    auras.push({ spellId, ...(durMs > 0 ? { expiresAt: now + durMs } : {}) });
    d.log?.(`${c.name} drinks ${idef.name}.`);
  };

  const handled = new Set<number>();
  let spent = applyCompanionWeaponCoats(c, rot, d).length;

  // 1. Explicit prep rules.
  for (const raw of prepItemRules(rot)) {
    // A prep row is a rank LADDER, not the rung it was authored with, so it resolves against THIS
    // unit's bags: a companion carrying Dense coats with Dense, and buying better changes the coat.
    const carried = raw.family
      ? bestCarriedFamilyItem(raw.family, ds, d.char, c.bags)
      : null;
    const rule = carried ? { ...raw, itemEntry: carried.entry } : raw;
    const idef = ds.item(rule.itemEntry);
    if (!idef) continue;
    handled.add(rule.itemEntry);
    // Weapon coats are applyCompanionWeaponCoats' half — it runs for every rule below.
    if (isWeaponImbueItem(idef, ds)) continue;
    const spellId = idef.useSpell;
    if (spellId == null || spellId <= 0 || has(spellId)) continue;
    const bags = c.bags ?? emptyInventory();
    if (countItem(bags, rule.itemEntry) <= 0) continue;
    c.bags = removeItem(bags, rule.itemEntry, 1)[0];
    drink(idef, spellId);
    spent++;
  }

  // 2. Legacy sweep: bag elixirs/scrolls with a useSpell, drunk when the aura is missing.
  //    Combat heal/mana potions stay for in-fight recovery.
  const bags0 = c.bags ?? emptyInventory();
  let bagsNext = bags0;
  for (const it of combatItems(d.char, bags0, ds)) {
    if (it.effect.kind !== 'apply_buff') continue;
    if (handled.has(it.entry)) continue;
    const idef = ds.item(it.entry);
    const spellId = idef?.useSpell;
    if (spellId == null || spellId <= 0 || has(spellId)) continue;
    if (countItem(bagsNext, it.entry) <= 0) continue;
    bagsNext = removeItem(bagsNext, it.entry, 1)[0];
    drink(idef!, spellId);
    spent++;
  }

  // 2b. A shared elixir/flask/scroll whose on-use is not a flat apply_buff (multi-effect flasks)
  // still belongs to the buff kit, and the give is the auto-use.
  for (const stk of bagsNext.stacks) {
    const idef = ds.item(stk.item);
    if (!idef || shareCategoryOf(idef, ds) !== 'buff' || handled.has(idef.entry)) continue;
    const spellId = idef.useSpell;
    if (spellId == null || spellId <= 0 || has(spellId)) continue;
    if (countItem(bagsNext, idef.entry) <= 0) continue;
    bagsNext = removeItem(bagsNext, idef.entry, 1)[0];
    handled.add(idef.entry);
    drink(idef, spellId);
    spent++;
  }

  // 3. Food that leaves a Well Fed aura, eaten once per pull set when that aura is missing. The eat
  //    itself is skipped: a companion regenerates between pulls. Cite: SpellAuras.cpp:4993 TriggerSpell.
  for (const stk of bagsNext.stacks) {
    const idef = ds.item(stk.item);
    const fed = wellFedPendingFromItem(idef, ds);
    if (!idef || !fed || has(fed.triggerSpellId)) continue;
    if (countItem(bagsNext, stk.item) <= 0) continue;
    bagsNext = removeItem(bagsNext, stk.item, 1)[0];
    const durMs = fed.durationMs > 0 ? fed.durationMs : 900_000;
    auras.push({ spellId: fed.triggerSpellId, expiresAt: now + durMs });
    d.log?.(`${c.name} eats ${idef.name}.`);
    spent++;
  }
  if (bagsNext !== bags0) c.bags = bagsNext;
  return spent;
}

// The player's half of the same prep: elixirs and Well Fed from YOUR bags. Coats stay a hand/slot
// use — consumeItem refuses a stone without a weapon chosen.
export function applyPlayerItemPrep(
  char: Character,
  inventory: Inventory,
  ds: DataStore,
  now: number,
  log?: (msg: string) => void,
): { char: Character; inventory: Inventory; spent: number } {
  let c = char;
  let inv = inventory;
  let spent = 0;
  const has = (spellId: number): boolean =>
    (c.activeAuras ?? []).some((a) => a.spellId === spellId && (a.expiresAt ?? Infinity) > now);

  for (const it of combatItems(c, inv, ds)) {
    if (it.effect.kind !== 'apply_buff') continue;
    const idef = ds.item(it.entry);
    const spellId = idef?.useSpell;
    if (!idef || spellId == null || spellId <= 0 || has(spellId)) continue;
    if (countItem(inv, it.entry) <= 0) continue;
    inv = removeItem(inv, it.entry, 1)[0];
    c = applyAura(c, spellId, auraDurationMsOf(idef, spellId, ds), now, ds);
    log?.(`You drink ${idef.name}.`);
    spent++;
  }
  for (const stk of inv.stacks) {
    const idef = ds.item(stk.item);
    if (!idef || shareCategoryOf(idef, ds) !== 'buff') continue;
    const spellId = idef.useSpell;
    if (spellId == null || spellId <= 0 || has(spellId)) continue;
    if (countItem(inv, idef.entry) <= 0) continue;
    inv = removeItem(inv, idef.entry, 1)[0];
    c = applyAura(c, spellId, auraDurationMsOf(idef, spellId, ds), now, ds);
    log?.(`You drink ${idef.name}.`);
    spent++;
  }
  for (const stk of inv.stacks) {
    const idef = ds.item(stk.item);
    const fed = wellFedPendingFromItem(idef, ds);
    if (!idef || !fed || has(fed.triggerSpellId)) continue;
    if (countItem(inv, stk.item) <= 0) continue;
    inv = removeItem(inv, stk.item, 1)[0];
    c = applyWellFedFromItem(c, idef, ds, now);
    log?.(`You eat ${idef.name}.`);
    spent++;
  }
  return { char: c, inventory: inv, spent };
}
