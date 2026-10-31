// Item equip restriction gates: level, class, relic subclass, proficiency, requiredRep, honor rank
// and allowableRace. Unique honors both the ItemDef signals and ItemInstance.unique. Pure.

import type { DataStore } from '../../data/dataStore.ts';
import type { EquipSlot, ItemDef, SkillLine } from '../../data/schema.ts';
import { SKILL_LINE_BY_ID } from '../../data/schema/profession.ts';
import type { Character } from '../character/character.ts';
import { equippedEntry, equippedInstance } from './itemInstance.ts';
import type { ItemInstance } from './itemInstance.ts';
import type { Inventory } from './inventory.ts';
import { countItem } from './inventory.ts';
import { canEquipItemProficiency } from '../character/combatSkills.ts';
import { raceClassMaskMatches } from '../character/combatSkills.ts';
import { getRank, meetsRequiredRep } from '../creature/reputation.ts';
import { highestInternalRank, honorRankRequirementTitle } from '../run/honor.ts';
import { factionOf } from '../character/races.ts';
import { canEquipRelic } from './relic.ts';

/** Result of an equip gate. `reason` is UI-safe (matches existing equip fail style). */
export type EquipGateResult = { ok: true } | { ok: false; reason: string };

// Ownership / equip uniqueness signals from ItemDef (maxCount / unique / uniqueEquipped). Cite:
// item_template.maxcount; ItemPrototype.h ITEM_FLAG_UNIQUE_EQUIPPABLE.
export type ItemUniqueSignals = {
  /** Only one of this entry may be owned (bags + bank + keyring + mailbox + equipped). */
  unique?: boolean;
  /** Only one of this entry may be equipped at a time (bags may hold extras). */
  uniqueEquipped?: boolean;
  // Hard ownership cap (MaxCount). When set, bags+bank+keyring+mailbox+equipped may not exceed it. maxCount === 1
  // implies unique. Cite: Player.cpp CanStoreNewItem ~8552.
  maxCount?: number;
};

/** Extra containers that share the MaxCount ownership pool (CMaNGOS GetItemCount inBankAlso). */
export type UniqueOwnershipExtras = {
  bank?: Inventory;
  keyring?: Inventory;
  /** Bags-full mailbox spill. Overflow is still owned. */
  mailbox?: Inventory;
};

/** Count owned copies of `entry` across bags + bank + keyring + mailbox + paperdoll. */
export function countOwned(
  inv: Inventory,
  char: Character,
  entry: number,
  extras?: UniqueOwnershipExtras,
): number {
  let n = countItem(inv, entry);
  if (extras?.bank) n += countItem(extras.bank, entry);
  if (extras?.keyring) n += countItem(extras.keyring, entry);
  if (extras?.mailbox) n += countItem(extras.mailbox, entry);
  for (const v of Object.values(char.equipped)) {
    if (equippedEntry(v) === entry) n += 1;
  }
  return n;
}

/** Read unique signals from ItemDef fields (no invented defaults). */
export function uniqueSignalsOf(it: ItemDef): ItemUniqueSignals {
  const maxCount = it.maxCount != null && it.maxCount > 0 ? it.maxCount : undefined;
  const unique = it.unique === true || maxCount === 1 ? true : undefined;
  const uniqueEquipped = it.uniqueEquipped === true ? true : undefined;
  return {
    unique,
    uniqueEquipped,
    maxCount,
  };
}

// Stamp instance.unique when the ItemDef signals unique or uniqueEquipped, so identity stacking
// treats the piece as unique. Idempotent, and a no-op when neither signal is set.
export function stampUniqueFromDef(
  inst: ItemInstance,
  def: ItemDef | null | undefined,
): ItemInstance {
  if (!def) return inst;
  const sig = uniqueSignalsOf(def);
  if (!sig.unique && !sig.uniqueEquipped) return inst;
  if (inst.unique === true) return inst;
  return { ...inst, unique: true };
}

// True when unique OWNERSHIP applies — one total across bags and paperdoll. uniqueEquipped alone
// does not refuse bag extras; only unique does.
export function isUniqueOwned(
  signals: ItemUniqueSignals,
  instance?: ItemInstance | null,
): boolean {
  if (signals.unique === true) return true;
  // uniqueEquipped-only (def): ownership unique is false after the branch above —
  // bags may hold extras even if instance.unique is stamped.
  if (signals.uniqueEquipped === true) return false;
  return instance?.unique === true;
}

// Pure pre-check for pickup or loot under MaxCount and unique ownership; `room` is how many more
// copies fit. Not auto-wired into addInstance, so loot, mail and vendor paths call it.
export function canAcceptUnique(
  inv: Inventory,
  char: Character,
  entry: number,
  signals: ItemUniqueSignals,
  instance?: ItemInstance,
  extras?: UniqueOwnershipExtras,
): EquipGateResult & { room?: number } {
  const cap =
    signals.maxCount != null && signals.maxCount > 0
      ? signals.maxCount
      : isUniqueOwned(signals, instance)
        ? 1
        : 0;
  if (cap <= 0) return { ok: true, room: Number.POSITIVE_INFINITY };

  const owned = countOwned(inv, char, entry, extras);
  if (owned >= cap) {
    return {
      ok: false,
      reason: cap === 1
        ? 'Unique: you may only carry one'
        : `You may only carry ${cap} of those`,
      room: 0,
    };
  }
  return { ok: true, room: cap - owned };
}

// AllowableRace mask gate (same as mounts). mask 0 / absent = unrestricted; else bit (1 << (race - 1)).
// Cite: raceClassMaskMatches; Player.cpp CanUseItem allowableRace.
export function raceAllowedForItem(race: number, allowableRace?: number): boolean {
  if (allowableRace == null || allowableRace === 0) return true;
  return raceClassMaskMatches(allowableRace, race);
}

/** RequiredReputationFaction/Rank vs character standing. Fail closed if faction def missing. */
export function checkRequiredRep(
  char: Character,
  it: ItemDef,
  ds: DataStore,
): EquipGateResult {
  if (!it.requiredRep) return { ok: true };
  const fac = ds.faction(it.requiredRep.faction);
  if (!fac) return { ok: false, reason: 'Requires higher reputation' };
  const rank = getRank(char.reputations, fac, char.race, char.cls);
  if (!meetsRequiredRep(rank, it.requiredRep.rank)) {
    return { ok: false, reason: 'Requires higher reputation' };
  }
  return { ok: true };
}

// item_template.requiredhonorrank against the HIGHEST rank ever held. Gates the vendor PURCHASE and
// the tooltip line, never the equip. Cite: Player.cpp:17539 BUY_ERR_RANK_REQUIRE.
export function checkRequiredHonorRank(
  char: Character,
  it: ItemDef,
  ds: DataStore,
): EquipGateResult {
  const want = it.requiredHonorRank ?? 0;
  if (want <= 0) return { ok: true };
  if (highestInternalRank(char.honor) >= want) return { ok: true };
  const faction = factionOf(ds, char.race) === 'horde' ? 'horde' : 'alliance';
  return { ok: false, reason: `Requires the rank of ${honorRankRequirementTitle(want, faction)}` };
}

/** Profession line as the client writes it in a requirement line ("First Aid", "Blacksmithing"). */
function skillLabel(line: SkillLine): string {
  return line === 'firstaid' ? 'First Aid' : line[0].toUpperCase() + line.slice(1);
}

// item_template.RequiredSkill and rank. Profession lines (including poisons) resolve to Character.skills;
// lockpicking and riding have none here, so they stay ungated.
export function checkRequiredSkill(char: Character, it: ItemDef): EquipGateResult {
  const riding = it.requiredRidingRank ?? 0;
  if (riding > 0 && (char.ridingSkill ?? 0) < riding) {
    return { ok: false, reason: `Requires Riding (${riding})` };
  }
  const line = SKILL_LINE_BY_ID[it.requiredSkill ?? 0];
  if (!line) return { ok: true };
  const have = char.skills[line]?.current ?? 0;
  if (have <= 0) return { ok: false, reason: `Requires ${skillLabel(line)}` };
  const rank = it.requiredSkillRank ?? 0;
  if (have < rank) return { ok: false, reason: `Requires ${skillLabel(line)} (${rank})` };
  return { ok: true };
}

/** allowableRace bitmask vs character race. */
export function checkAllowableRace(char: Character, it: ItemDef): EquipGateResult {
  if (!raceAllowedForItem(char.race, it.allowableRace)) {
    return { ok: false, reason: 'Your race cannot equip that' };
  }
  return { ok: true };
}

/** True if any bag stack of `entry` carries instance.unique. */
function bagHasUniqueInstance(inv: Inventory, entry: number): boolean {
  for (const s of inv.stacks) {
    if (s.item === entry && s.unique === true) return true;
  }
  return false;
}

// Unique and Unique-Equipped from the ItemDef signals or instance.unique: block a second equipped
// copy, and for true unique also refuse when the bags already hold more than one.
export function checkUniqueRestriction(
  char: Character,
  it: ItemDef,
  inv: Inventory,
  targetSlot?: EquipSlot,
  equipping?: ItemInstance,
): EquipGateResult {
  const sig = uniqueSignalsOf(it);
  const bagUnique = bagHasUniqueInstance(inv, it.entry);
  const instUnique = equipping?.unique === true || bagUnique;

  let equippedElsewhere = 0;
  let equippedUniqueElsewhere = false;
  for (const [slot, v] of Object.entries(char.equipped)) {
    if (equippedEntry(v) !== it.entry || slot === targetSlot) continue;
    equippedElsewhere++;
    const ei = equippedInstance(v);
    if (ei?.unique === true) equippedUniqueElsewhere = true;
  }

  const enforce =
    sig.unique === true
    || sig.uniqueEquipped === true
    || instUnique
    || equippedUniqueElsewhere;
  if (!enforce) return { ok: true };

  if (equippedElsewhere > 0) {
    // Prefer unique-equipped wording when that signal (or instance-only) is the driver.
    const eqWording =
      sig.uniqueEquipped === true
      || (sig.unique !== true && (instUnique || equippedUniqueElsewhere));
    return {
      ok: false,
      reason: eqWording
        ? 'Unique-equipped: already wearing that'
        : 'Unique: already equipped',
    };
  }

  // Ownership unique: one is pulled from bags to equip — bag count must be ≤1.
  if (isUniqueOwned(sig, equipping ?? (instUnique ? { item: it.entry, count: 1, unique: true } : undefined))) {
    const inBags = countItem(inv, it.entry);
    if (inBags > 1) {
      return { ok: false, reason: 'Unique: you may only carry one' };
    }
  }

  return { ok: true };
}

// Full CanUseItem-shaped equip gates for an ItemDef, without bag ownership or unique: level,
// class, relic subclass, proficiency, requiredRep, allowableRace. Cite: Player.cpp CanUseItem.
export function equipItemGates(
  char: Character,
  it: ItemDef,
  ds: DataStore,
): EquipGateResult {
  if (!it.slot) return { ok: false, reason: 'Cannot be equipped' };
  // Class lock: baked allowClass from AllowableClass (subset masks only).
  if (it.allowClass && !it.allowClass.includes(char.cls)) {
    return {
      ok: false,
      reason: `Your class cannot use ${it.typeName ? `${it.typeName} items` : 'that'}`,
    };
  }
  // Relic subclass × class (libram/idol/totem). AllowableClass is 32767 on these rows.
  const relic = canEquipRelic(char, it);
  if (!relic.ok) return relic;
  // Trained skill + SkillRaceClassInfo (mail/plate at 40, no hunter shields).
  if (!canEquipItemProficiency(char, it, ds.combatSkillMeta?.())) {
    return { ok: false, reason: 'You do not have the required proficiency' };
  }
  if (char.level < it.requiredLevel) {
    return { ok: false, reason: `Requires level ${it.requiredLevel}` };
  }
  const rep = checkRequiredRep(char, it, ds);
  if (!rep.ok) return rep;
  // No requiredhonorrank gate: rank buys the item (Player.cpp:17539), it does not equip it.
  const race = checkAllowableRace(char, it);
  if (!race.ok) return race;
  return { ok: true };
}

/** Boolean form for UI (tw-bag-wrong) and helper filters. */
export function canEquipItem(char: Character, it: ItemDef, ds: DataStore): boolean {
  return equipItemGates(char, it, ds).ok;
}

// Player::CanUseItem — "could this character ever use this row", the test that tints a merchant
// tile red. Not an ownership gate: vanilla lets you buy anything, so this only drives display.
export function itemUseGates(char: Character, it: ItemDef, ds: DataStore): EquipGateResult {
  const skill = checkRequiredSkill(char, it);
  if (!skill.ok) return skill;
  if (it.slot) return equipItemGates(char, it, ds);
  if (it.allowClass && !it.allowClass.includes(char.cls)) {
    return { ok: false, reason: 'Your class cannot use that' };
  }
  const race = checkAllowableRace(char, it);
  if (!race.ok) return race;
  if (char.level < it.requiredLevel) {
    return { ok: false, reason: `Requires level ${it.requiredLevel}` };
  }
  return checkRequiredRep(char, it, ds);
}

/** Boolean form for the merchant tiles. */
export function canUseItem(char: Character, it: ItemDef, ds: DataStore): boolean {
  return itemUseGates(char, it, ds).ok;
}

// Short UI dim message when equip is blocked (held-item row). Prefer concrete gate reason; fall back to
// class/level/proficiency labels.
export function equipBlockLabel(char: Character, it: ItemDef, ds: DataStore): string {
  const g = equipItemGates(char, it, ds);
  if (g.ok) return '';
  const r = g.reason;
  if (/class cannot/i.test(r) || /^Only (paladins|druids|shamans) can equip/i.test(r)) {
    return "your class can't use this";
  }
  if (/requires level/i.test(r)) return r.toLowerCase().replace(/^requires/, 'requires');
  if (/proficiency/i.test(r)) return 'missing proficiency';
  if (/reputation/i.test(r)) return 'requires higher reputation';
  if (/race cannot/i.test(r)) return "your race can't use this";
  return r;
}
