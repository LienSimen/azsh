// Enchanting: apply a permanent bonus to equipped gear, and disenchant uncommon+ gear into dust.
// Pure and deterministic — the roll comes from an injected Rng. Neither action fits RecipeDef.

import type { Character, EnchantMap, EquippedMap } from '../character/character.ts';
import { equippedEntry, equippedInstance, hasIdentity } from '../items/itemInstance.ts';
import { withPermEnchant } from './enchantApply.ts';
import type { Inventory } from '../items/inventory.ts';
import { addItem, removeItem, removeStack, countItem, canFit } from '../items/inventory.ts';
import type { LootDrop } from '../items/loot.ts';
import type { Rng } from '../../engine/core/rng.ts';
import type { DataStore } from '../../data/dataStore.ts';
import type { EquipSlot, ItemDef, EnchantDef, DisenchantRuleDef, SkillCurve } from '../../data/schema.ts';
import type { Check } from './professions.ts';
import { gainSkill } from './professions.ts';
import { isBroken } from '../items/durability.ts';

export interface EnchantResult extends Check {
  char: Character;
  inventory: Inventory;
  skillUp?: number;    // new enchanting skill if a point was gained
}
export interface DisenchantResult extends Check {
  char: Character;
  inventory: Inventory;
  yielded: LootDrop[]; // materials rolled (empty on an unlucky roll - the item is still destroyed)
  skillUp?: number;
}
/** Learn a formula (pays its cost). Mirrors professions.learnRecipe, but for `knownEnchants`. */
export interface LearnResult extends Check {
  char: Character;
}

// ---- Rods (the tool) ------------------------------------------------------

// Highest rod tier reachable (0 = none); a higher rod satisfies every lower one. `shared` is the
// party's held-tool pool (partyHeldTools), so one rod anywhere in the party covers every enchanter.
export function bestRodTier(inv: Inventory, ds: DataStore, shared?: ReadonlySet<number>): number {
  let best = 0;
  const bump = (entry: number): void => {
    const tier = ds.enchantRodTier(entry);
    if (tier && tier > best) best = tier;
  };
  for (const stk of inv.stacks) bump(stk.item);
  if (shared) for (const entry of shared) bump(entry);
  return best;
}

/** The rod a minRodTier asks for: the lowest rod that satisfies it. */
export function rodForTier(tier: number, ds: DataStore): ItemDef | undefined {
  let pick: { entry: number; tier: number } | undefined;
  for (const rod of ds.enchantRods()) {
    if (rod.tier >= tier && (!pick || rod.tier < pick.tier)) pick = rod;
  }
  return pick ? ds.item(pick.entry) : undefined;
}

// The rod's own name, the way canCraft names a hammer. Falls back to the tier with no rod row.
export function rodNameForTier(tier: number, ds: DataStore): string {
  return rodForTier(tier, ds)?.name ?? `a tier-${tier} runed rod`;
}

// ---- Applying an enchant --------------------------------------------------

/** Whether `enchant` can be applied to the item currently in `slot`, right now. */
export function canEnchant(
  char: Character, inv: Inventory, ds: DataStore, enchant: EnchantDef, slot: EquipSlot,
  /** Held tools the party can reach outside `inv` (partyHeldTools). The rod is shared. */
  sharedTools?: ReadonlySet<number>,
): Check {
  if (!(char.knownEnchants ?? []).includes(enchant.id)) return { ok: false, reason: 'Enchant not known' };
  const skill = char.skills.enchanting;
  if (!skill) return { ok: false, reason: 'Requires Enchanting' };
  if (skill.current < enchant.orange) return { ok: false, reason: `Requires Enchanting skill ${enchant.orange}` };
  const entry = equippedEntry(char.equipped[slot]);
  const item = entry != null ? ds.item(entry) : undefined;
  if (!item || !item.slot) return { ok: false, reason: 'Nothing equipped there' };
  if (!enchant.slots.includes(item.slot)) return { ok: false, reason: `This enchant can't go on that item` };
  if (isBroken(char, slot, item)) return { ok: false, reason: 'Item is broken - repair it first' };
  if (bestRodTier(inv, ds, sharedTools) < enchant.minRodTier) {
    return { ok: false, reason: `Requires ${rodNameForTier(enchant.minRodTier, ds)}` };
  }
  for (const rg of enchant.reagents) {
    if (countItem(inv, rg.item) < rg.count) return { ok: false, reason: 'Missing reagents' };
  }
  return { ok: true };
}

// Apply `enchant` to `slot`: consume the reagents, never the rod, record it, and roll a skill-up.
// A prior enchant on that slot is overwritten. Also writes ItemInstance.permEnchantId.
export function applyEnchant(
  char: Character, inv: Inventory, ds: DataStore, enchant: EnchantDef, slot: EquipSlot, rng: Rng,
  sharedTools?: ReadonlySet<number>,
): EnchantResult {
  const chk = canEnchant(char, inv, ds, enchant, slot, sharedTools);
  if (!chk.ok) return { ok: false, reason: chk.reason, char, inventory: inv };
  let working = inv;
  for (const rg of enchant.reagents) working = removeItem(working, rg.item, rg.count)[0];
  const enchants: EnchantMap = { ...char.enchants, [slot]: enchant.id };
  // LOCK 2: identity on the equipped instance so unequip/trade keep the enchant.
  const equipped: EquippedMap = { ...char.equipped };
  const cur = equippedInstance(equipped[slot]);
  if (cur != null) {
    const next = withPermEnchant(cur, enchant.id);
    equipped[slot] = hasIdentity(next) ? next : next.item;
  }
  const gain = gainSkill({ ...char, enchants, equipped }, 'enchanting', enchant, rng);
  return { ok: true, char: gain.char, inventory: working, skillUp: gain.up };
}

// ---- Disenchanting (the material source) ----------------------------------

// True if the item is weapons, armor or jewelry an enchanter can break down, never bags or
// consumables. Jewelry bakes as class 4 with armor 0, so an `armor > 0` check blocked every ring.
export function isDisenchantable(item: ItemDef): boolean {
  // Authoritative bake: DB item class.
  if (item.itemClass === 2 || item.itemClass === 4) return true;
  // Weapon payload (fixtures / pre-class bake).
  if (item.weapon) return true;
  // Body armor / shields / cloaks (armor field, even if itemClass omitted).
  if ((item.armor ?? 0) > 0) return true;
  // Jewelry: armor class, armor 0 — never require armor points.
  const s = item.slot;
  if (s === 'finger' || s === 'neck' || s === 'trinket') return true;
  return false;
}

/** The disenchant rule that matches an item (its quality + itemLevel band), or undefined. */
export function disenchantRuleFor(item: ItemDef, ds: DataStore): DisenchantRuleDef | undefined {
  const ilvl = item.itemLevel ?? 0;
  return ds.disenchantRules().find(
    (r) => r.quality === item.quality && ilvl >= r.minItemLevel && ilvl <= r.maxItemLevel,
  );
}

/** Whether `entry` (an item held in the bags) can be disenchanted right now. */
export function canDisenchant(char: Character, inv: Inventory, ds: DataStore, entry: number): Check {
  const skill = char.skills.enchanting;
  if (!skill) return { ok: false, reason: 'Requires Enchanting' };
  if (countItem(inv, entry) <= 0) return { ok: false, reason: "You don't have that" };
  const item = ds.item(entry);
  if (!item) return { ok: false, reason: 'Unknown item' };
  if (!isDisenchantable(item)) return { ok: false, reason: 'Only weapons and armor can be disenchanted' };
  if (item.quality < 2) return { ok: false, reason: 'Only uncommon or better gear can be disenchanted' };
  const rule = disenchantRuleFor(item, ds);
  if (!rule) return { ok: false, reason: 'That yields no enchanting materials' };
  if (skill.current < rule.reqSkill) return { ok: false, reason: `Requires Enchanting skill ${rule.reqSkill}` };
  return { ok: true };
}

// The skill-up window for a disenchant, derived from the band's DE requirement, so DE stays a
// viable way to level. CMaNGOS grants the point on cast; we roll after destroying — one roll.
function disenchantCurve(reqSkill: number): SkillCurve {
  return { orange: reqSkill, yellow: reqSkill + 25, green: reqSkill + 50, gray: reqSkill + 100 };
}

export interface DisenchantSplitResult extends Check {
  char: Character;
  /** The container the gear came out of. */
  from: Inventory;
  /** Where the mats landed — the same object as `from` when one container does both jobs. */
  into: Inventory;
  yielded: LootDrop[];
  skillUp?: number;
}

// The one disenchant body, across two containers: the gear leaves `from`, the mats land in `into`.
// Pass the same inventory for both when one bag does the whole job. Materials carry no bind, so a
// soulbound green in a companion's bags breaks down where it lies and the dust is the player's.
// An empty yield still destroys. Mats that cannot fit refuse the whole act (KI-808).
export function disenchantInto(
  char: Character, from: Inventory, into: Inventory, ds: DataStore, entry: number, rng: Rng,
  opts?: { slot?: number; intoCap?: number },
): DisenchantSplitResult {
  const slot = opts?.slot;
  const fail = (reason: string): DisenchantSplitResult =>
    ({ ok: false, reason, char, from, into, yielded: [] });
  const chk = canDisenchant(char, from, ds, entry);
  if (!chk.ok) return fail(chk.reason ?? 'Cannot disenchant');
  // `slot` names ONE stack. Without it removeItem takes the first stack of `entry`, which is the
  // wrong "Archer's Jerkin" when you hold two with different rolled suffixes.
  if (slot != null && from.stacks[slot]?.item !== entry) return fail("You don't have that");
  const item = ds.item(entry)!;
  const rule = disenchantRuleFor(item, ds)!;
  const yielded: LootDrop[] = [];
  for (const y of rule.yield) {
    if (y.chance > 0 && rng.chance(y.chance / 100)) yielded.push({ item: y.item, count: rng.int(y.minCount, y.maxCount) });
  }
  // Probe on a copy: free the DE slot first, then require every rolled mat to fit (craft-style).
  const shed = slot != null ? removeStack(from, slot, 1)[0] : removeItem(from, entry, 1)[0];
  const oneBag = from === into;
  let mats = oneBag ? shed : into;
  for (const drop of yielded) {
    const stackMax = ds.item(drop.item)?.stackable ?? 1;
    if (!canFit(mats, drop.item, drop.count, stackMax, opts?.intoCap)) {
      return fail('Not enough bag space');
    }
    mats = addItem(mats, drop.item, drop.count, stackMax);
  }
  // Craft skill-up (UpdateCraftSkill); enchanting is not a gather line - uses color curve only.
  const gain = gainSkill(char, 'enchanting', disenchantCurve(rule.reqSkill), rng);
  return { ok: true, char: gain.char, from: oneBag ? mats : shed, into: mats, yielded, skillUp: gain.up };
}

/** Disenchant one `entry` out of the bags, mats back into those same bags. */
export function disenchant(
  char: Character, inv: Inventory, ds: DataStore, entry: number, rng: Rng, cap?: number,
  slot?: number,
): DisenchantResult {
  const res = disenchantInto(char, inv, inv, ds, entry, rng, {
    ...(slot != null ? { slot } : {}), ...(cap != null ? { intoCap: cap } : {}),
  });
  if (!res.ok) return { ok: false, reason: res.reason, char, inventory: inv, yielded: [] };
  return { ok: true, char: res.char, inventory: res.into, yielded: res.yielded, skillUp: res.skillUp };
}

// ---- Learning formulas ----------------------------------------------------

// Learn an enchant formula, paying the cost. The trainer path also needs skill ≥ orange; reading
// a Formula: item does not, since applyEnchant still gates on orange, rod and reagents.
export function learnEnchant(
  char: Character,
  enchant: EnchantDef,
  opts?: { fromItem?: boolean; discountMod?: number },
): LearnResult {
  const known = char.knownEnchants ?? [];
  if (known.includes(enchant.id)) return { ok: false, reason: 'Already learned', char };
  const skill = char.skills.enchanting;
  if (!skill) return { ok: false, reason: 'Requires Enchanting', char };
  // Classic trainer gate only — not applied when learning from a Formula: item.
  if (!opts?.fromItem && skill.current < enchant.orange) {
    return { ok: false, reason: `Requires Enchanting skill ${enchant.orange}`, char };
  }
  const cost = Math.floor((enchant.cost ?? 0) * (opts?.discountMod ?? 1.0));
  if (char.gold < cost) return { ok: false, reason: 'Not enough money', char };
  return { ok: true, char: { ...char, gold: char.gold - cost, knownEnchants: [...known, enchant.id] } };
}
