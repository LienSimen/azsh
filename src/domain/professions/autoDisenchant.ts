// Auto-disenchant: break down bagged gear that is not an upgrade for you, or for companions when
// that option is on, if the party has Enchanting. Reuses findUpgrades — no parallel scoring.

import type { DataStore } from '../../data/dataStore.ts';
import type { Character } from '../character/character.ts';
import type { Inventory } from '../items/inventory.ts';
import type { Companion } from '../bots/squad.ts';
import {
  companionCharacter,
  companionLevel,
  companionSpellbook,
} from '../bots/squad.ts';
import { findUpgrades } from '../items/equipmentHelper.ts';
import {
  disenchantRuleFor,
  isDisenchantable,
} from './enchanting.ts';
import { pickDisenchanter } from './partyDisenchant.ts';
import { DUAL_WIELD_SPELL_ID, type EquipOpts } from '../items/equipment.ts';
import { companionPlayerbotSpecId, characterPlayerbotSpecId } from '../bots/playerbotStatWeight.ts';
import { knows, type SpellBook } from '../character/spellbook.ts';
import type { SkillLine } from '../../data/schema.ts';

/** Max quality to auto-DE: 2 green, 3 rare/superior, 4 epic (ceiling inclusive). */
export type AutoDisenchantMaxQuality = 2 | 3 | 4;

export interface AutoDisenchantConfig {
  enabled: boolean;
  /** Quality ceiling (inclusive). Default green when enabled. */
  maxQuality: AutoDisenchantMaxQuality;
  // When true (default), auto-DE / junk skip gear that is an upgrade for squad, roster, or raid companions.
  // Player upgrades are always kept.
  protectCompanionUpgrades: boolean;
}

export const DEFAULT_AUTO_DISENCHANT_CONFIG: AutoDisenchantConfig = {
  enabled: false,
  maxQuality: 2,
  protectCompanionUpgrades: true,
};

/** Coerce stored value; missing/partial → defaults (off, green ceiling, keep squad upgrades). */
export function normalizeAutoDisenchantConfig(raw: unknown): AutoDisenchantConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<AutoDisenchantConfig>;
  const mq = r.maxQuality;
  const maxQuality: AutoDisenchantMaxQuality =
    mq === 2 || mq === 3 || mq === 4 ? mq : DEFAULT_AUTO_DISENCHANT_CONFIG.maxQuality;
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : DEFAULT_AUTO_DISENCHANT_CONFIG.enabled,
    maxQuality,
    protectCompanionUpgrades: typeof r.protectCompanionUpgrades === 'boolean'
      ? r.protectCompanionUpgrades
      : DEFAULT_AUTO_DISENCHANT_CONFIG.protectCompanionUpgrades,
  };
}

/** OR both layers: on if either is on; ceiling is the max of enabled layers. */
export function mergeAutoDisenchantConfigs(
  global: AutoDisenchantConfig | unknown,
  character: AutoDisenchantConfig | unknown,
): AutoDisenchantConfig {
  const g = normalizeAutoDisenchantConfig(global);
  const c = normalizeAutoDisenchantConfig(character);
  // Either layer can keep squad upgrades (same as existing always-on guard).
  const protectCompanionUpgrades = g.protectCompanionUpgrades || c.protectCompanionUpgrades;
  if (!g.enabled && !c.enabled) {
    return {
      enabled: false,
      maxQuality: Math.max(g.maxQuality, c.maxQuality) as AutoDisenchantMaxQuality,
      protectCompanionUpgrades,
    };
  }
  const maxQuality = Math.max(
    g.enabled ? g.maxQuality : 0,
    c.enabled ? c.maxQuality : 0,
  ) as AutoDisenchantMaxQuality;
  return { enabled: true, maxQuality: maxQuality < 2 ? 2 : maxQuality, protectCompanionUpgrades };
}

export type AutoDisenchantEnchanter =
  | { kind: 'player' }
  | { kind: 'companion'; id: string; name: string };

export type PartyEnchanter =
  | { kind: 'player'; char: Character }
  | { kind: 'companion'; comp: Companion; char: Character };

// Active group/raid enchanters: you and squad + raid seats. Bag verbs use resolveRosterEnchanters
// (adds the bench). Player first so skill-ups prefer your line.
export function resolvePartyEnchanters(
  player: Character,
  squad: readonly Companion[] | undefined,
  raidMembers: Readonly<Record<string, Companion>> | undefined,
  ds: DataStore,
): PartyEnchanter[] {
  const out: PartyEnchanter[] = [{ kind: 'player', char: player }];
  const seen = new Set<string>();
  const push = (comp: Companion): void => {
    if (seen.has(comp.id) || comp.mission) return;
    seen.add(comp.id);
    const lvl = companionLevel(comp, player.level);
    out.push({ kind: 'companion', comp, char: companionCharacter(comp, lvl, ds) });
  };
  for (const c of squad ?? []) push(c);
  for (const c of Object.values(raidMembers ?? {})) push(c);
  return out;
}

/** All companions whose gear we must not destroy as "not an upgrade" (squad + roster + raid). */
export function companionsForUpgradeGuard(
  squad: readonly Companion[] | undefined,
  botRoster: Readonly<Record<string, Companion>> | undefined,
  raidMembers: Readonly<Record<string, Companion>> | undefined,
): Companion[] {
  const map = new Map<string, Companion>();
  for (const c of squad ?? []) map.set(c.id, c);
  for (const c of Object.values(botRoster ?? {})) map.set(c.id, c);
  for (const c of Object.values(raidMembers ?? {})) map.set(c.id, c);
  return [...map.values()];
}

/** Same as companionsForUpgradeGuard when cfg.protectCompanionUpgrades, else none (player still guarded). */
export function companionsForOptionalUpgradeGuard(
  cfg: AutoDisenchantConfig | unknown,
  squad: readonly Companion[] | undefined,
  botRoster: Readonly<Record<string, Companion>> | undefined,
  raidMembers: Readonly<Record<string, Companion>> | undefined,
): Companion[] {
  if (!normalizeAutoDisenchantConfig(cfg).protectCompanionUpgrades) return [];
  return companionsForUpgradeGuard(squad, botRoster, raidMembers);
}

/** Dual wield + weightscale for a bot, so every caller scores that body the same way. */
export function companionEquipOpts(comp: Companion, lvl: number, ds: DataStore): EquipOpts {
  const sb = companionSpellbook(comp, lvl, ds);
  return {
    canDualWield: knows(sb, DUAL_WIELD_SPELL_ID),
    specId: companionPlayerbotSpecId(comp.cls, comp.specIdx, comp.role, ds),
    role: comp.role,
  };
}

// Every bag entry that is a strict upgrade for the player or any owned companion, as ONE
// findUpgrades pass per body — disposition used to call this per item.
export function partyUpgradeEntries(
  player: Character,
  playerInv: Inventory,
  playerEquipOpts: EquipOpts,
  companions: readonly Companion[],
  ds: DataStore,
): Set<number> {
  const out = new Set<number>();
  for (const u of findUpgrades(player, playerInv, ds, playerEquipOpts)) out.add(u.entry);
  for (const comp of companions) {
    const lvl = companionLevel(comp, player.level);
    const char = companionCharacter(comp, lvl, ds);
    const opts = companionEquipOpts(comp, lvl, ds);
    for (const u of findUpgrades(char, playerInv, ds, opts)) out.add(u.entry);
  }
  return out;
}

// True when `entry` in `playerInv` is a strict upgrade for the player or any owned companion. Same
// findUpgrades path as the equipment helper / companion gear UI.
export function isUpgradeForParty(
  entry: number,
  player: Character,
  playerInv: Inventory,
  playerEquipOpts: EquipOpts,
  companions: readonly Companion[],
  ds: DataStore,
): boolean {
  return partyUpgradeEntries(player, playerInv, playerEquipOpts, companions, ds).has(entry);
}

// Whether bagged `entry` is a valid auto-DE target under cfg (quality, DE rules, not upgrade,
// quest-protected, party enchanter skill). Does not check bag space for mats.
export function canAutoDisenchantEntry(
  entry: number,
  cfg: AutoDisenchantConfig,
  player: Character,
  playerInv: Inventory,
  playerEquipOpts: EquipOpts,
  companions: readonly Companion[],
  enchanters: readonly PartyEnchanter[],
  ds: DataStore,
  questProtected: ReadonlySet<number>,
  upgradeEntries?: ReadonlySet<number>,
): { ok: true; enchanter: AutoDisenchantEnchanter } | { ok: false; reason: string } {
  if (!cfg.enabled) return { ok: false, reason: 'Auto-disenchant off' };
  if (questProtected.has(entry)) return { ok: false, reason: 'Needed for a quest' };
  const item = ds.item(entry);
  if (!item) return { ok: false, reason: 'Unknown item' };
  const q = item.quality ?? 0;
  if (q < 2) return { ok: false, reason: 'Quality too low' };
  if (q > cfg.maxQuality) return { ok: false, reason: 'Above quality ceiling' };
  if (!isDisenchantable(item)) return { ok: false, reason: 'Not disenchantable gear' };
  if (!disenchantRuleFor(item, ds)) return { ok: false, reason: 'No disenchant yield band' };
  const upgrade = upgradeEntries
    ? upgradeEntries.has(entry)
    : isUpgradeForParty(entry, player, playerInv, playerEquipOpts, companions, ds);
  if (upgrade) {
    return {
      ok: false,
      reason: companions.length > 0 ? 'Upgrade for you or a companion' : 'Upgrade for you',
    };
  }
  // One picker for the automatic pass and the bag-bar button, so the two can never disagree
  // about who breaks a given item down.
  const who = pickDisenchanter(entry, playerInv, ds, enchanters);
  if (!who) return { ok: false, reason: 'No party enchanter with enough skill' };
  return who.kind === 'player'
    ? { ok: true, enchanter: { kind: 'player' } }
    : { ok: true, enchanter: { kind: 'companion', id: who.id!, name: who.name } };
}

/** Dual-wield helper for callers building EquipOpts for the player. */
export function playerCanDualWield(spellbook: SpellBook): boolean {
  return knows(spellbook, DUAL_WIELD_SPELL_ID);
}

export function playerEquipOptsFrom(
  char: Character,
  spellbook: SpellBook,
  ds: DataStore,
  opts?: { role?: string; specName?: string | null },
): EquipOpts {
  return {
    canDualWield: playerCanDualWield(spellbook),
    specId: characterPlayerbotSpecId(char, ds, opts),
    role: opts?.role as never,
  };
}

/** Skill line key for companion profession writeback. */
export const ENCHANTING_LINE: SkillLine = 'enchanting';
